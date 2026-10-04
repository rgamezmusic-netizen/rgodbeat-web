import { BeatData, LoopSettings, VocalClip, VocalTrack, BeatFX, BeatMixSettings } from './types/audio';
import { audioBufferToWav, extractWaveformPeaks, WAVEFORM_SAMPLE_COUNT } from './audio/wavEncoder';

type SaveResult = { success: boolean; error?: string; requiresPass?: boolean; conflict?: boolean };
let cloudOwner: string | null = null;
let revision: string | null | undefined;
let knownAudio = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();
let pendingSave: { args: Parameters<typeof uploadProject>; owner: string | null; resolve: ((result: SaveResult) => void)[] } | null = null;
let draining = false;
const encoded = new WeakMap<AudioBuffer, Promise<{ blob: Blob; hash: string }>>();
const encodedVocals = new WeakMap<AudioBuffer, Promise<{ blob: Blob; hash: string }>>();
const CHUNK_BYTES = 2_000_000;
const STAGED_UPLOAD_THRESHOLD = 2_500_000;

async function stageAudio(blob: Blob, hash: string, uploadId: string, owner: string | null) {
  const parts = Math.ceil(blob.size / CHUNK_BYTES);
  if (parts > 128) throw new Error('El audio excede el tamaño de respaldo de cuenta. Descarga el archivo .rgodbeat.');
  const base = `/api/studio/project/upload?uploadId=${uploadId}&hash=${hash}`;
  const ownerHeaders: Record<string, string> = owner ? { 'x-studio-owner': owner } : {};
  async function send(url: string, init: RequestInit) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, init);
        const data = await response.json();
        if (response.ok && data.success) return data;
        if (response.status < 500) throw new Error(data.error || 'No se pudo subir el audio.');
      } catch (error) {
        if (attempt === 2) throw error;
      }
      if (attempt === 2) throw new Error('Se interrumpió la conexión durante el respaldo.');
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
    }
    throw new Error('Se interrumpió el respaldo.');
  }
  for (let start = 0; start < parts; start += 3) {
    await Promise.all(Array.from({ length: Math.min(3, parts - start) }, (_, offset) => {
      const index = start + offset;
      return send(`${base}&index=${index}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...ownerHeaders },
        body: blob.slice(index * CHUNK_BYTES, Math.min(blob.size, (index + 1) * CHUNK_BYTES)),
      });
    }));
  }
  const result = await send(`${base}&action=finish`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...ownerHeaders },
    body: JSON.stringify({ parts }),
  });
  return { key: result.key as string, hash };
}
export function setCloudProjectUser(email: string | null) {
  const next = email?.trim().toLowerCase() ?? null;
  if (cloudOwner === next) return;
  cloudOwner = next; revision = undefined; knownAudio = new Set();
}
function encode(buffer: AudioBuffer, bitDepth: 24 | 32 = 24) {
  const cache = bitDepth === 32 ? encodedVocals : encoded;
  let result = cache.get(buffer);
  if (!result) {
    result = (async () => {
      const blob = audioBufferToWav(buffer, bitDepth);
      const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
      return { blob, hash: [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
    })();
    cache.set(buffer, result);
  }
  return result;
}
async function readCloudState() {
  const owner = cloudOwner;
  const response = await fetch('/api/studio/project', { cache: 'no-store' });
  if (!response.ok) throw new Error('No se pudo consultar el respaldo de cuenta.');
  const data = await response.json();
  if (owner !== cloudOwner) throw new Error('La cuenta cambió durante la consulta.');
  if (owner && (data.isLoggedIn === false || (data.ownerEmail && data.ownerEmail !== owner))) {
    throw new Error('La sesión cambió. Tu respaldo local sigue asociado a la cuenta anterior.');
  }
  revision = data.revision ?? null;
  knownAudio = new Set<string>([
    data.project?.beat?.audioHash,
    ...(data.project?.tracks ?? []).flatMap((track: { clips?: { audioHash?: string }[] }) => (track.clips ?? []).map(clip => clip.audioHash)),
  ].filter(Boolean));
  return data;
}

// Coalesce pending edits and serialize writes. A slow upload cannot overwrite a newer one.
export function saveProjectToCloud(...args: Parameters<typeof uploadProject>): Promise<SaveResult> {
  return new Promise(resolve => {
    if (pendingSave && pendingSave.owner === cloudOwner) {
      pendingSave.args = args; pendingSave.resolve.push(resolve);
    } else {
      pendingSave?.resolve.forEach(callback => callback({ success: false, error: 'La cuenta cambió antes de guardar.' }));
      pendingSave = { args, owner: cloudOwner, resolve: [resolve] };
    }
    if (draining) return;
    draining = true;
    queue = queue.then(async () => {
      while (pendingSave) {
        const job = pendingSave; pendingSave = null;
        const result = job.owner === cloudOwner ? await uploadProject(...job.args)
          : { success: false, error: 'La cuenta cambió. El respaldo pertenece a la cuenta anterior.' };
        job.resolve.forEach(callback => callback(result));
      }
      draining = false;
    });
  });
}

export interface CloudProjectCheckResult {
  hasProject: boolean;
  unavailable?: boolean;
  isLoggedIn?: boolean;
  hasActivePass?: boolean;
  warnExpiration?: boolean;
  daysRemaining?: number;
  expired?: boolean;
  message?: string;
  projectMeta?: {
    beatId?: string | null;
    beatTitle?: string;
    isCustomUpload?: boolean;
    savedAt?: number;
    takesCount?: number;
  };
}

/**
 * Checks if the user has an active cloud project saved, or if an expiration notice should trigger.
 */
export async function checkCloudProject(): Promise<CloudProjectCheckResult> {
  try {
    const data = await readCloudState();
    if (data.expired) {
      return {
        hasProject: false,
        expired: true,
        message: data.message || 'Tu proyecto en la nube fue eliminado porque tu pase premium ha expirado.',
      };
    }

    if (data.hasProject && data.project) {
      let takesCount = 0;
      if (Array.isArray(data.project.tracks)) {
        for (const t of data.project.tracks) {
          if (Array.isArray(t.clips)) takesCount += t.clips.length;
        }
      }

      return {
        hasProject: true,
        isLoggedIn: true,
        hasActivePass: data.hasActivePass,
        warnExpiration: data.warnExpiration,
        daysRemaining: data.daysRemaining,
        projectMeta: {
          beatId: data.project.beat?.id || null,
          beatTitle: data.project.beat?.title || 'Mi Beat',
          isCustomUpload: Boolean(data.project.beat?.isCustomUpload),
          savedAt: data.project.savedAt,
          takesCount,
        },
      };
    }

    return {
      hasProject: false,
      isLoggedIn: data.isLoggedIn,
      hasActivePass: data.hasActivePass,
      warnExpiration: data.warnExpiration,
      daysRemaining: data.daysRemaining,
    };
  } catch (err) {
    console.warn('[checkCloudProject error]:', err);
    return { hasProject: false, unavailable: true };
  }
}

/**
 * Uploads and saves the current project (Beat + Vocal Tracks + FX settings)
 * to the user's cloud account (Cloudflare R2).
 */
async function uploadProject(
  tracks: VocalTrack[],
  currentBeat: BeatData | null,
  loopSettings?: LoopSettings,
  mix?: BeatMixSettings
): Promise<SaveResult> {
  const owner = cloudOwner;
  const clientSaveId = crypto.randomUUID();
  const nextHashes = new Set<string>();
  const confirmCommit = async () => {
    try {
      const response = await fetch('/api/studio/project', { cache: 'no-store' });
      if (!response.ok) return false;
      const data = await response.json();
      if (owner !== cloudOwner || (owner && data.ownerEmail && data.ownerEmail !== owner)
        || data.project?.clientSaveId !== clientSaveId || !data.revision) return false;
      revision = data.revision; knownAudio = nextHashes;
      return true;
    } catch { return false; }
  };
  try {
    if (revision === undefined) await readCloudState();
    const baseRevision = revision;
    const confirmedAudio = new Set(knownAudio);
    const formData = new FormData();
    const newAudio = new Map<string, { blob: Blob; hash: string }>();
    let newAudioBytes = 0;

    const tracksMeta = [];

    for (const track of tracks) {
      const clipsMeta: Array<{
        id: string;
        name?: string;
        startBeatOffset: number;
        duration: number;
        waveformSample?: number[];
        isLocked?: boolean;
        audioHash?: string;
      }> = [];

      const clipsToProcess: VocalClip[] =
        track.clips && track.clips.length > 0
          ? track.clips
          : track.buffer
          ? [
              {
                id: `legacy-${track.id}`,
                buffer: track.buffer,
                startBeatOffset: track.startBeatOffset || 0,
                duration: track.duration || track.buffer.duration,
                waveformSample: track.waveformSample,
                name: 'Toma 1',
              },
            ]
          : [];

      for (const clip of clipsToProcess) {
        if (!clip.buffer) continue;
        try {
          const { blob: wavBlob, hash } = await encode(clip.buffer, 32);
          nextHashes.add(hash);
          const formKey = `clip_${track.id}_${clip.id}`;
          if (!confirmedAudio.has(hash)) {
            formData.append(formKey, wavBlob, `${clip.id}.wav`);
            newAudio.set(formKey, { blob: wavBlob, hash }); newAudioBytes += wavBlob.size;
          }

          clipsMeta.push({
            id: clip.id,
            audioHash: hash,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.buffer.duration,
            waveformSample: clip.waveformSample,
            isLocked: clip.isLocked,
          });
        } catch (clipErr) {
          throw clipErr;
        }
      }

      tracksMeta.push({
        id: track.id,
        name: track.name,
        volume: track.volume,
        pan: track.pan,
        isCustom: track.isCustom,
        isMuted: track.isMuted,
        isSolo: track.isSolo,
        fx: track.fx,
        startBeatOffset: track.startBeatOffset,
        duration: track.duration,
        clips: clipsMeta,
      });
    }

    let beatHash: string | undefined;
    // Process custom beat if uploaded
    if (currentBeat?.buffer) {
      try {
        const { blob: beatBlob, hash } = await encode(currentBeat.buffer);
        beatHash = hash; nextHashes.add(hash);
        if (!confirmedAudio.has(hash)) {
          formData.append('beat_custom', beatBlob, 'beat.wav');
          newAudio.set('beat_custom', { blob: beatBlob, hash }); newAudioBytes += beatBlob.size;
        }
      } catch (beatErr) {
        throw beatErr;
      }
    }

    const metadata = {
      clientSaveId,
      ownerEmail: owner,
      projectName: currentBeat ? `Proyecto: ${currentBeat.title}` : 'Mi Proyecto',
      beat: currentBeat
        ? {
            id: currentBeat.id,
            audioHash: beatHash,
            title: currentBeat.title,
            producer: currentBeat.producer,
            genre: currentBeat.genre,
            bpm: currentBeat.bpm,
            key: currentBeat.key,
            scale: currentBeat.scale,
            duration: currentBeat.duration,
            artworkGradient: currentBeat.artworkGradient,
            isCustomUpload: Boolean(currentBeat.isCustomUpload),
            detectedBpm: currentBeat.detectedBpm,
            detectedKey: currentBeat.detectedKey,
          }
        : null,
      loopSettings,
      beatFX: mix?.beatFX,
      isBeatMuted: mix?.isBeatMuted,
      tracks: tracksMeta,
    };

    if (newAudioBytes > STAGED_UPLOAD_THRESHOLD) {
      const uploadId = crypto.randomUUID();
      const byHash = new Map<string, { key: string; hash: string }>();
      const staged: Record<string, { key: string; hash: string }> = {};
      for (const [formKey, audio] of newAudio) {
        if (owner !== cloudOwner) throw new Error('La cuenta cambió durante el respaldo.');
        let asset = byHash.get(audio.hash);
        if (!asset) {
          asset = await stageAudio(audio.blob, audio.hash, uploadId, owner);
          byHash.set(audio.hash, asset);
        }
        staged[formKey] = asset;
        formData.delete(formKey);
      }
      formData.append('stagedAudio', JSON.stringify(staged));
    }
    formData.append('metadata', JSON.stringify(metadata));
    formData.append('baseRevision', baseRevision ?? '');
    if (owner !== cloudOwner) return { success: false, error: 'La cuenta cambió antes de guardar.' };

    const res = await fetch('/api/studio/project', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || data.success !== true) {
      if (res.status >= 500 && await confirmCommit()) return { success: true };
      return {
        success: false,
        error: data.error || 'Error al guardar el proyecto en la nube.',
        requiresPass: Boolean(data.requiresPass),
        conflict: res.status === 409,
      };
    }

    if (owner === cloudOwner) { revision = data.revision ?? null; knownAudio = nextHashes; }
    return { success: true };
  } catch (err: unknown) {
    if (await confirmCommit()) return { success: true };
    console.error('saveProjectToCloud error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error de conexión al guardar.' };
  }
}

/**
 * Downloads and restores the user's saved cloud project, downloading all audio
 * takes from R2 and rebuilding native Web Audio buffers and tracks.
 */
export async function loadProjectFromCloud(
  audioCtx: AudioContext
): Promise<{
  beatData: Partial<BeatData> & { customBeatBuffer?: AudioBuffer } | null;
  tracks: VocalTrack[];
  loopSettings?: LoopSettings;
  beatFX?: BeatFX;
  isBeatMuted?: boolean;
} | null> {
  try {
    const data = await readCloudState();
    if (!data.hasProject || !data.project) return null;

    const project = data.project;

    // 1. Download and decode custom beat if present
    let customBeatBuffer: AudioBuffer | undefined = undefined;
    if (project.beat?.downloadUrl) {
      try {
        const beatFetch = await fetch(project.beat.downloadUrl);
        if (!beatFetch.ok) throw new Error('No se descargó el beat completo.');
        const beatArrayBuffer = await beatFetch.arrayBuffer();
        customBeatBuffer = await audioCtx.decodeAudioData(beatArrayBuffer);
      } catch (err) {
        throw err;
      }
    }

    if (project.beat?.customBeatKey && !customBeatBuffer) throw new Error('Falta el beat del respaldo.');
    // 2. Download and decode vocal takes
    const restoredTracks: VocalTrack[] = [];

    if (Array.isArray(project.tracks)) {
      for (const t of project.tracks) {
        const restoredClips: VocalClip[] = [];
        let latestBuffer: AudioBuffer | null = null;
        let latestWaveform: number[] | undefined;

        if (Array.isArray(t.clips)) {
          for (const c of t.clips) {
            if (!c.downloadUrl) throw new Error('Falta una voz del respaldo. No se reemplazará el proyecto.');
            try {
              const clipFetch = await fetch(c.downloadUrl);
              if (!clipFetch.ok) throw new Error('No se descargó una toma completa.');
              const clipArrayBuffer = await clipFetch.arrayBuffer();
              const decoded = await audioCtx.decodeAudioData(clipArrayBuffer);
              const waveformSample = extractWaveformPeaks(decoded, WAVEFORM_SAMPLE_COUNT);

              restoredClips.push({
                id: c.id,
                name: c.name || 'Toma',
                startBeatOffset: c.startBeatOffset || 0,
                duration: decoded.duration,
                waveformSample,
                buffer: decoded,
                tunedBuffer: null,
                isLocked: c.isLocked ?? true,
              });
              latestBuffer = decoded;
              latestWaveform = waveformSample;
            } catch (clipErr) {
              throw clipErr;
            }
          }
        }

        restoredTracks.push({
          id: t.id,
          name: t.name,
          volume: t.volume ?? 1.0,
          pan: t.pan ?? 0,
          isCustom: t.isCustom ?? t.id.startsWith('backing'),
          isMuted: Boolean(t.isMuted),
          isSolo: Boolean(t.isSolo),
          fx: t.fx,
          startBeatOffset: t.startBeatOffset || 0,
          duration: t.duration || 0,
          buffer: latestBuffer,
          waveformSample: latestWaveform,
          tunedBuffer: null,
          clips: restoredClips,
        });
      }
    }

    return {
      beatData: project.beat
        ? {
            ...project.beat,
            customBeatBuffer,
            waveformSample: customBeatBuffer
              ? extractWaveformPeaks(customBeatBuffer, WAVEFORM_SAMPLE_COUNT)
              : project.beat.waveformSample,
          }
        : null,
      tracks: restoredTracks,
      loopSettings: project.loopSettings,
      beatFX: project.beatFX,
      isBeatMuted: project.isBeatMuted,
    };
  } catch (err) {
    console.error('loadProjectFromCloud error:', err);
    throw err;
  }
}

/**
 * Deletes the saved project from the cloud.
 */
export async function deleteProjectFromCloud(): Promise<boolean> {
  // A barrier after all earlier saves; subsequent saves use the tombstone revision.
  const owner = cloudOwner;
  const deletion = queue.then(async () => {
    const originalRevision = revision;
    const originalAudio = knownAudio;
    const confirmDeletion = async () => {
      try {
        const data = await readCloudState();
        if (!data.hasProject) return true;
        revision = originalRevision; knownAudio = originalAudio;
      } catch { /* Keep the previous revision on an unavailable response. */ }
      return false;
    };
    try {
      if (owner !== cloudOwner) return false;
      if (revision === undefined) await readCloudState();
      const res = await fetch('/api/studio/project', { method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: revision, ownerEmail: owner }) });
      if (!res.ok) return res.status >= 500 ? confirmDeletion() : false;
      const data = await res.json();
      if (data.success !== true) return false;
      if (owner === cloudOwner) { revision = data.revision ?? null; knownAudio.clear(); }
      return true;
    } catch { return confirmDeletion(); }
  });
  queue = deletion;
  return deletion;
}
