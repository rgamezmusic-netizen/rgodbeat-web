import { VocalClip, VocalTrack } from '../types/audio';
import { getTrackClips, withTrackClips } from './clipEditing';
import { extractWaveformPeaks, punchInClips } from './wavEncoder';

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
    request.onsuccess = () => resolve(request.result);
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
      tx.objectStore('chunks').put({ ...checkpoint, owner, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error);
    });
  });
}

// Called only AFTER the complete workspace transaction committed successfully.
export function retireRecordingCheckpoints(owner: string, tracks?: VocalTrack[], projectId?: string): Promise<boolean> {
  const clipIds = tracks?.flatMap(track => getTrackClips(track).map(clip => clip.id));
  return ordered(owner, async () => {
    const database = await db();
    return new Promise<boolean>((resolve, reject) => {
      const tx = database.transaction('chunks', 'readwrite');
      const request = tx.objectStore('chunks').index('owner').openCursor(IDBKeyRange.only(owner));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const takeId: string = cursor.value.takeId;
        if (!clipIds || (projectId && cursor.value.projectId && cursor.value.projectId !== projectId)
          || clipIds.some(id => id === takeId || id.startsWith(`${takeId}-`))) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => reject(tx.error);
    });
  });
}

export async function recoverRecordingCheckpoints(
  owner: string, ctx: BaseAudioContext, tracks: VocalTrack[], projectId?: string
): Promise<{ tracks: VocalTrack[]; recovered: number }> {
  await queues.get(owner);
  const database = await db();
  const chunks = await new Promise<Array<RecordingCheckpoint & { timestamp: number }>>((resolve, reject) => {
    const tx = database.transaction('chunks', 'readonly');
    const request = tx.objectStore('chunks').index('owner').getAll(owner);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const takes = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    if (projectId && chunk.projectId && chunk.projectId !== projectId) continue;
    const take = takes.get(chunk.takeId) ?? [];
    take.push(chunk); takes.set(chunk.takeId, take);
  }
  let updated = tracks;
  let recovered = 0;
  for (const take of [...takes.values()].sort((a, b) => a[0].timestamp - b[0].timestamp)) {
    take.sort((a, b) => a.index - b.index);
    const first = take[0];
    if (updated.some(track => getTrackClips(track).some(clip => clip.id === first.takeId || clip.id.startsWith(`${first.takeId}-`)))) continue;
    if (!updated.some(track => track.id === first.trackId)) throw new Error('Falta el canal de la toma recuperada. El respaldo se conserva.');
    // Keep only a contiguous prefix. Never concatenate past a missing chunk and shift later audio.
    const contiguous = [];
    for (let i = 0; i < take.length && take[i].index === i; i++) contiguous.push(take[i]);
    const length = contiguous.reduce((sum, chunk) => sum + chunk.samples.length, 0);
    if (!length) continue;
    const buffer = ctx.createBuffer(1, length, first.sampleRate);
    let offset = 0;
    for (const chunk of contiguous) { buffer.getChannelData(0).set(chunk.samples, offset); offset += chunk.samples.length; }
    const clip: VocalClip = { id: first.takeId, name: 'Toma recuperada', buffer, tunedBuffer: null,
      startBeatOffset: first.start, duration: buffer.duration, waveformSample: extractWaveformPeaks(buffer, 60), isLocked: true };
    updated = updated.map(track => track.id === first.trackId
      ? withTrackClips(track, punchInClips(ctx, getTrackClips(track), clip)) : track);
    recovered++;
  }
  return { tracks: updated, recovered };
}
