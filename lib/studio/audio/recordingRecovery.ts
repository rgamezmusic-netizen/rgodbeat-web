import { VocalClip, VocalTrack } from '../types/audio';
import { getTrackClips, withTrackClips } from './clipEditing';
import { extractWaveformPeaks, WAVEFORM_SAMPLE_COUNT } from './wavEncoder';

export interface RecordingCheckpoint {
  projectId?: string;
  takeId: string;
  trackId: string;
  start: number;
  sampleRate: number;
  index: number;
  samples: Float32Array;
}

// Separate from the beat library: replacing a workspace never removes saved beats.
const queues = new Map<string, Promise<boolean>>();
let connection: Promise<IDBDatabase> | undefined;
function db() {
  return connection ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('RGODBEAT_RECORDING_RECOVERY', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('chunks', { keyPath: ['owner', 'takeId', 'index'] });
      store.createIndex('owner', 'owner');
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => { database.close(); connection = undefined; };
      database.onclose = () => { connection = undefined; };
      resolve(database);
    };
    request.onerror = () => { connection = undefined; reject(request.error); };
  });
}

function ordered(owner: string, operation: () => Promise<boolean>) {
  const next = (queues.get(owner) ?? Promise.resolve(true)).then(operation).catch(error => {
    console.warn('Recording recovery storage failed:', error);
    return false;
  });
  queues.set(owner, next);
  return next;
}

export function appendRecordingCheckpoint(owner: string, checkpoint: RecordingCheckpoint): Promise<boolean> {
  return ordered(owner, async () => {
    const database = await db();
    return new Promise<boolean>((resolve, reject) => {
      const tx = database.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      const request = store.get([owner, checkpoint.takeId, checkpoint.index]);
      request.onsuccess = () => {
        const existing = request.result as StoredCheckpoint | undefined;
        if (!existing) store.put({ ...checkpoint, owner, timestamp: Date.now() });
        else if (existing.projectId !== checkpoint.projectId || existing.trackId !== checkpoint.trackId
          || existing.start !== checkpoint.start || existing.sampleRate !== checkpoint.sampleRate
          || !(existing.samples instanceof Float32Array) || existing.samples.length !== checkpoint.samples.length
          || !existing.samples.every((sample, i) => sample === checkpoint.samples[i])) {
          // A retried block is idempotent; a conflicting writer must not replace PCM.
          tx.abort();
        }
      };
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error ?? new DOMException('El fragmento no se guardó. El respaldo previo se conserva.', 'AbortError'));
    });
  });
}

type StoredCheckpoint = RecordingCheckpoint & { owner: string; timestamp: number };

function groupTakes(chunks: StoredCheckpoint[]) {
  const takes = new Map<string, StoredCheckpoint[]>();
  for (const chunk of chunks) {
    const key = JSON.stringify([chunk.projectId ?? null, chunk.takeId]);
    const take = takes.get(key) ?? [];
    take.push(chunk);
    takes.set(key, take);
  }
  return [...takes.values()].map(take => take.sort((a, b) => a.index - b.index));
}

// Only reconstruct a consistent, contiguous prefix. Never join audio past a gap.
function contiguousPrefix(take: StoredCheckpoint[]) {
  const first = take[0];
  if (!first || !first.takeId || !first.trackId || !Number.isFinite(first.start) || first.start < 0
    || !Number.isInteger(first.sampleRate) || first.sampleRate <= 0) return [];
  const result: StoredCheckpoint[] = [];
  for (let i = 0; i < take.length; i++) {
    const chunk = take[i];
    if (chunk.index !== i || chunk.trackId !== first.trackId || chunk.start !== first.start
      || chunk.sampleRate !== first.sampleRate || !(chunk.samples instanceof Float32Array)
      || !chunk.samples.length || !chunk.samples.every(Number.isFinite)) break;
    result.push(chunk);
  }
  return result;
}

function represented(take: StoredCheckpoint[], clips: VocalClip[]) {
  const prefix = contiguousPrefix(take);
  if (!prefix.length || prefix.length !== take.length) return false;
  const first = prefix[0];
  const length = prefix.reduce((sum, chunk) => sum + chunk.samples.length, 0);
  return clips.some(clip => {
    // A split/trimmed clip or a partial snapshot does not prove the whole take is safe.
    if (clip.id !== first.takeId || clip.buffer.numberOfChannels !== 1
      || clip.buffer.sampleRate !== first.sampleRate || clip.buffer.length !== length
      || Math.abs(clip.startBeatOffset - first.start) > 0.5 / first.sampleRate) return false;
    const samples = clip.buffer.getChannelData(0);
    let offset = 0;
    return prefix.every(chunk => chunk.samples.every(sample => sample === samples[offset++]));
  });
}

// Called only AFTER the complete workspace transaction committed successfully.
// No owner-wide deletion: only an exact project's fully represented PCM is retired.
export function retireRecordingCheckpoints(owner: string, tracks?: VocalTrack[], projectId?: string): Promise<boolean> {
  if (!tracks || !projectId) return Promise.resolve(false);
  const clips = tracks.flatMap(getTrackClips);
  return ordered(owner, async () => {
    const database = await db();
    return new Promise<boolean>((resolve, reject) => {
      const tx = database.transaction('chunks', 'readwrite');
      const store = tx.objectStore('chunks');
      // Stream PCM through the cursor instead of copying every project's audio
      // into RAM while the full workspace has just been encoded.
      const verified = new Map<string, { first: StoredCheckpoint; clips: VocalClip[]; keys: IDBValidKey[]; frames: number; next: number }>();
      const request = store.index('owner').openCursor(IDBKeyRange.only(owner));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          for (const take of verified.values()) {
            if (take.clips.some(clip => clip.buffer.length === take.frames)) {
              for (const key of take.keys) store.delete(key);
            }
          }
          return;
        }
        const chunk = cursor.value as StoredCheckpoint;
        if (chunk.projectId === projectId) {
          let take = verified.get(chunk.takeId);
          if (!take) {
            take = { first: chunk, clips: clips.filter(clip => clip.id === chunk.takeId
              && clip.buffer.numberOfChannels === 1 && clip.buffer.sampleRate === chunk.sampleRate
              && Math.abs(clip.startBeatOffset - chunk.start) <= 0.5 / chunk.sampleRate), keys: [], frames: 0, next: 0 };
            verified.set(chunk.takeId, take);
          }
          if (chunk.index !== take.next || chunk.trackId !== take.first.trackId || chunk.start !== take.first.start
            || chunk.sampleRate !== take.first.sampleRate || !(chunk.samples instanceof Float32Array) || !chunk.samples.length) {
            take.clips = [];
          } else {
            const offset = take.frames;
            take.clips = take.clips.filter(clip => {
              const samples = clip.buffer.getChannelData(0);
              return samples.length >= offset + chunk.samples.length
                && chunk.samples.every((sample, i) => Number.isFinite(sample) && sample === samples[offset + i]);
            });
            take.frames += chunk.samples.length;
          }
          take.next++;
          take.keys.push(cursor.primaryKey);
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error);
    });
  });
}

export async function recoverRecordingCheckpoints(
  owner: string, ctx: BaseAudioContext, tracks: VocalTrack[], projectId?: string | null, trackTemplate?: VocalTrack
): Promise<{ tracks: VocalTrack[]; recovered: number; projectId?: string; pending: number }> {
  await queues.get(owner);
  const database = await db();
  const chunks = await new Promise<StoredCheckpoint[]>((resolve, reject) => {
    const tx = database.transaction('chunks', 'readonly');
    const request = tx.objectStore('chunks').index('owner').getAll(owner);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new DOMException('No se pudo leer el respaldo de voz.', 'AbortError'));
  });
  const takes = groupTakes(chunks).sort((a, b) => a[0].timestamp - b[0].timestamp);
  // With no base session select ONE most recent recoverable project, never mix projects.
  // null denotes a legacy base session whose unscoped chunks cannot be attributed.
  const latestTake = takes.filter(take => contiguousPrefix(take).length).at(-1);
  const selectedProject = projectId === undefined
    ? latestTake?.[0].projectId
    : projectId ?? undefined;
  let updated = tracks;
  let recovered = 0;
  let pending = 0;
  for (const take of takes) {
    // Legacy blocks cannot be attributed to an existing session. Without a
    // base, offer only one legacy take rather than inventing a shared project.
    if (projectId === null || (projectId === undefined && selectedProject === undefined && take !== latestTake)) { pending++; continue; }
    if (take[0].projectId !== selectedProject) { pending++; continue; }
    const first = take[0];
    if (represented(take, updated.flatMap(getTrackClips))) continue;
    const contiguous = contiguousPrefix(take);
    const length = contiguous.reduce((sum, chunk) => sum + chunk.samples.length, 0);
    if (!length) { pending++; continue; }
    if (contiguous.length !== take.length) pending++;
    if (represented(contiguous, updated.flatMap(getTrackClips))) continue;
    const target = updated.find(track => track.id === first.trackId);
    const template = target ?? trackTemplate ?? tracks[0];
    if (!template) { pending++; continue; }
    const buffer = ctx.createBuffer(1, length, first.sampleRate);
    let offset = 0;
    for (const chunk of contiguous) { buffer.getChannelData(0).set(chunk.samples, offset); offset += chunk.samples.length; }
    const clip: VocalClip = { id: first.takeId, name: 'Toma recuperada', buffer, tunedBuffer: null,
      startBeatOffset: first.start, duration: buffer.duration, waveformSample: extractWaveformPeaks(buffer, WAVEFORM_SAMPLE_COUNT), isLocked: true };
    const overlaps = target && getTrackClips(target).some(saved =>
      saved.startBeatOffset < first.start + buffer.duration && saved.startBeatOffset + saved.buffer.duration > first.start);
    if (target && !overlaps) {
      updated = updated.map(track => track.id === target.id
        ? withTrackClips(track, [...getTrackClips(track), clip].sort((a, b) => a.startBeatOffset - b.startBeatOffset)) : track);
    } else {
      // Preserve existing audio and custom/missing lanes. Conflicting recovery is
      // muted so restoring a session never silently changes its audible mix.
      let id = target ? `recovery-${first.takeId}` : first.trackId;
      while (updated.some(track => track.id === id)) id += '-recovered';
      updated = [...updated, withTrackClips({ ...template, id, name: `Recuperada · ${target?.name ?? first.trackId}`,
        isCustom: true, isMuted: Boolean(overlaps), isSolo: false, clips: [], buffer: null, tunedBuffer: null }, [clip])];
    }
    recovered++;
  }
  return { tracks: updated, recovered, projectId: selectedProject, pending };
}
