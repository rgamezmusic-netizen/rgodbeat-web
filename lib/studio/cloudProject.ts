import { BeatData, LoopSettings, VocalClip, VocalTrack, BeatFX, BeatMixSettings } from './types/audio';
import { audioBufferToWav, extractWaveformPeaks, WAVEFORM_SAMPLE_COUNT } from './audio/wavEncoder';
import { getCatalogBeatId } from './audio/catalogBeat';
import { restoredVocalFX } from './audio/restoredFX';

type SaveResult = { success: boolean; error?: string; requiresPass?: boolean; conflict?: boolean; code?: string; retryable?: boolean };
let cloudOwner: string | null = null;
type CloudProjectSlot = 'active' | 'previous';
let cloudSlot: CloudProjectSlot = 'active';
let revision: string | null | undefined;
let knownAudio = new Set<string>();
let queue: Promise<unknown> = Promise.resolve();
let pendingSave: { args: Parameters<typeof uploadProject>; owner: string | null; slot: CloudProjectSlot; resolve: ((result: SaveResult) => void)[] } | null = null;
let draining = false;
const encoded = new WeakMap<AudioBuffer, Promise<{ blob: Blob; hash: string }>>();
const encodedVocals = new WeakMap<AudioBuffer, Promise<{ blob: Blob; hash: string }>>();
const CHUNK_BYTES = 2_000_000;
const STAGED_UPLOAD_THRESHOLD = 2_500_000;

export class CloudConnectionError extends Error {
  constructor(message: string, public code = 'SERVICE_UNAVAILABLE', public retryable = true) { super(message); }
}

function confirmedKey() { return `rgodbeat_cloud_confirmed_${cloudOwner}`; }
export function confirmCloudProject(projectId: string, confirmedRevision: string | null = revision ?? null) {
  if (!cloudOwner || !confirmedRevision) return;
  try { localStorage.setItem(confirmedKey(), JSON.stringify({ projectId, revision: confirmedRevision, slot: cloudSlot })); } catch { /* Device storage may be unavailable. */ }
}
export function selectCloudProjectSlot(slot: CloudProjectSlot, selectedRevision?: string | null) {
  cloudSlot = slot; revision = selectedRevision; knownAudio = new Set();
}
export function alignCloudProjectSelection(projectId: string) {
  try {
    const confirmed = JSON.parse(localStorage.getItem(confirmedKey()) || 'null');
    if (confirmed?.projectId !== projectId) selectCloudProjectSlot('active');
  } catch { selectCloudProjectSlot('active'); }
}
export function canResumeCloudProject(remote: CloudProjectCheckResult, projectId: string) {
  if (!remote.hasProject) return true;
  try {
    const confirmed = JSON.parse(localStorage.getItem(confirmedKey()) || 'null');
    return confirmed?.projectId === projectId && confirmed.slot === cloudSlot && confirmed.revision === remote.revision;
  } catch { return false; }
}

// Bound each request, including its response body, so a stalled connection
// cannot hold the save queue and the exit controls forever.
async function requestCloudJson(url: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (controller.signal.aborted) throw new CloudConnectionError('La nube tardó demasiado. Tu proyecto local se conserva.');
    throw error;
  } finally { clearTimeout(timer); }
}

async function stageAudio(blob: Blob, hash: string, uploadId: string, owner: string | null) {
  const parts = Math.ceil(blob.size / CHUNK_BYTES);
  if (parts > 128) throw new Error('El audio excede el tamaño de respaldo de cuenta. Descarga el archivo .rgodbeat.');
  const base = `/api/studio/project/upload?uploadId=${uploadId}&hash=${hash}`;
  const ownerHeaders: Record<string, string> = owner ? { 'x-studio-owner': owner } : {};
  async function send(url: string, init: RequestInit) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let reply: Awaited<ReturnType<typeof requestCloudJson>>;
      try {
        reply = await requestCloudJson(url, init, 120_000);
      } catch (error) {
        if (attempt === 2) throw error;
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
        continue;
      }
      const { response, data } = reply;
      if (response.ok && data.success === true) return data;
      // Authentication, conflicts and validation errors cannot be fixed by
      // uploading the same bytes again. Only retry transient server failures.
      if (response.status < 500 && response.status !== 429) throw new Error(data.error || 'No se pudo subir el audio.');
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
  cloudSlot = 'active';
  try {
    if (JSON.parse(localStorage.getItem(confirmedKey()) || 'null')?.slot === 'previous') cloudSlot = 'previous';
  } catch { /* No confirmed selection yet. */ }
}
export async function archiveCloudProject(replacePrevious = false): Promise<{
  success: boolean; requiresConfirmation?: boolean; error?: string;
}> {
  const owner = cloudOwner;
  try {
    await queue;
    if (owner !== cloudOwner) return { success: false, error: 'La cuenta cambió durante la operación.' };
    const { response, data } = await requestCloudJson('/api/studio/project/archive', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacePrevious, baseRevision: revision ?? null, ownerEmail: owner }),
    });
    if (owner !== cloudOwner) return { success: false, error: 'La cuenta cambió durante la operación.' };
    if (response.status === 409 && data.requiresConfirmation) return { success: false, requiresConfirmation: true };
    if (!response.ok || data.success !== true) return { success: false, error: data.error || 'No se pudo conservar el proyecto anterior.' };
    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo conectar con tu cuenta.' };
  }
}
function projectUrl(slot: CloudProjectSlot = cloudSlot) {
  return `/api/studio/project${slot === 'previous' ? '?slot=previous' : ''}`;
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
async function readCloudState(slot: CloudProjectSlot = cloudSlot) {
  const owner = cloudOwner;
  const previousRevision = slot === cloudSlot ? revision : undefined;
  const { response, data } = await requestCloudJson(projectUrl(slot), { cache: 'no-store' });
  if (!response.ok) throw new CloudConnectionError(data.error || 'No se pudo consultar el respaldo de cuenta.',
    data.code || (response.status === 401 ? 'SESSION_REQUIRED' : 'SERVICE_UNAVAILABLE'),
    data.retryable ?? (response.status === 429 || response.status >= 500));
  if (owner !== cloudOwner) throw new Error('La cuenta cambió durante la consulta.');
  if (owner && (data.isLoggedIn === false || (data.ownerEmail && data.ownerEmail !== owner))) {
    throw new CloudConnectionError('Vuelve a iniciar sesión. Tu proyecto local se conserva.', 'SESSION_REQUIRED', false);
  }
  // A status query started before a save must not restore its older revision.
  if (slot === cloudSlot && revision === previousRevision) {
    revision = data.revision ?? null;
    knownAudio = new Set<string>([
      data.project?.beat?.audioHash,
      ...(data.project?.tracks ?? []).flatMap((track: { clips?: { audioHash?: string }[] }) => (track.clips ?? []).map(clip => clip.audioHash)),
    ].filter(Boolean));
  }
  return data;
}

// Coalesce pending edits and serialize writes. A slow upload cannot overwrite a newer one.
export function saveProjectToCloud(...args: Parameters<typeof uploadProject>): Promise<SaveResult> {
  return new Promise(resolve => {
    if (pendingSave && pendingSave.owner === cloudOwner && pendingSave.slot === cloudSlot) {
      pendingSave.args = args; pendingSave.resolve.push(resolve);
    } else {
      pendingSave?.resolve.forEach(callback => callback({ success: false, error: 'La cuenta cambió antes de guardar.' }));
      pendingSave = { args, owner: cloudOwner, slot: cloudSlot, resolve: [resolve] };
    }
    if (draining) return;
    draining = true;
    queue = queue.then(async () => {
      while (pendingSave) {
        const job = pendingSave; pendingSave = null;
        const result = job.owner === cloudOwner && job.slot === cloudSlot ? await uploadProject(...job.args)
          : { success: false, error: 'La cuenta cambió. El respaldo pertenece a la cuenta anterior.' };
        job.resolve.forEach(callback => callback(result));
      }
      draining = false;
    });
  });
}

export interface CloudProjectCheckResult {
  hasProject: boolean;
  hasActiveProject?: boolean;
  hasPreviousProject?: boolean;
  previousProjectMeta?: { projectName?: string; savedAt?: number; takesCount?: number } | null;
  unavailable?: boolean;
  retryable?: boolean;
  code?: string;
  revision?: string | null;
  projectId?: string;
  recoveryNotice?: string;
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
        revision: data.revision, projectId: data.project.projectId, recoveryNotice: data.recoveryNotice, hasActiveProject: data.hasActiveProject,
        hasPreviousProject: Boolean(data.hasPreviousProject),
        previousProjectMeta: data.previousProjectMeta ?? null,
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
      revision: data.revision, recoveryNotice: data.recoveryNotice, hasActiveProject: data.hasActiveProject,
      hasPreviousProject: Boolean(data.hasPreviousProject),
      previousProjectMeta: data.previousProjectMeta ?? null,
      isLoggedIn: data.isLoggedIn,
      hasActivePass: data.hasActivePass,
      warnExpiration: data.warnExpiration,
      daysRemaining: data.daysRemaining,
    };
  } catch (err) {
    console.warn('[checkCloudProject error]:', err);
    return { hasProject: false, unavailable: true,
      code: err instanceof CloudConnectionError ? err.code : 'SERVICE_UNAVAILABLE',
      retryable: err instanceof CloudConnectionError ? err.retryable : true,
      message: err instanceof CloudConnectionError || (err instanceof Error && /^(El respaldo|No se pudo|La cuenta|La sesión)/.test(err.message))
        ? err.message : 'No se pudo conectar con tu respaldo. Tu copia local se conserva; reintenta la conexión.' };
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
  mix?: BeatMixSettings,
  projectId?: string
): Promise<SaveResult> {
  const owner = cloudOwner;
  const savingSlot = cloudSlot;
  const clientSaveId = crypto.randomUUID();
  const nextHashes = new Set<string>();
  const confirmCommit = async () => {
    try {
      const { response, data } = await requestCloudJson(projectUrl(savingSlot), { cache: 'no-store' });
      if (!response.ok) return false;
      if (owner !== cloudOwner || savingSlot !== cloudSlot || (owner && data.ownerEmail && data.ownerEmail !== owner)
        || data.project?.clientSaveId !== clientSaveId || !data.revision) return false;
      revision = data.revision; knownAudio = nextHashes;
      if (projectId) confirmCloudProject(projectId);
      return true;
    } catch { return false; }
  };
  try {
    if (revision === undefined) await readCloudState();
    if (owner !== cloudOwner || savingSlot !== cloudSlot) return { success: false, error: 'El proyecto cambió antes de guardar.' };
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
        if (!clip.buffer) throw new Error('Falta el audio de una toma. No se pudo guardar el proyecto completo.');
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
      projectId,
      ownerEmail: owner,
      projectName: currentBeat ? `Proyecto: ${currentBeat.title}` : 'Mi Proyecto',
      beat: currentBeat
        ? {
            id: currentBeat.id,
            catalogBeatId: getCatalogBeatId(currentBeat.id, currentBeat.catalogBeatId),
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

    if (owner !== cloudOwner || savingSlot !== cloudSlot) throw new Error('El proyecto cambió durante el respaldo.');
    const { response: res, data } = await requestCloudJson(projectUrl(savingSlot), {
      method: 'POST',
      body: formData,
    }, 120_000);
    if (!res.ok || data.success !== true) {
      if (res.status >= 500 && await confirmCommit()) return { success: true };
      return {
        success: false,
        error: data.error || 'Error al guardar el proyecto en la nube.',
        requiresPass: Boolean(data.requiresPass),
        conflict: res.status === 409,
        code: data.code, retryable: data.retryable ?? (res.status === 429 || res.status >= 500),
      };
    }

    if (owner === cloudOwner && savingSlot === cloudSlot) {
      revision = data.revision ?? null; knownAudio = nextHashes;
      if (projectId) confirmCloudProject(projectId);
    }
    return { success: true };
  } catch (err: unknown) {
    if (await confirmCommit()) return { success: true };
    console.error('saveProjectToCloud error:', err);
    return { success: false, error: err instanceof Error ? err.message : 'Error de conexión al guardar.',
      code: err instanceof CloudConnectionError ? err.code : 'SERVICE_UNAVAILABLE',
      retryable: err instanceof CloudConnectionError ? err.retryable : true };
  }
}

/**
 * Downloads and restores the user's saved cloud project, downloading all audio
 * takes from R2 and rebuilding native Web Audio buffers and tracks.
 */
export async function loadProjectFromCloud(
  audioCtx: AudioContext,
  slot: CloudProjectSlot = cloudSlot
): Promise<{
  beatData: Partial<BeatData> & { customBeatBuffer?: AudioBuffer } | null;
  tracks: VocalTrack[];
  loopSettings?: LoopSettings;
  beatFX?: BeatFX;
  isBeatMuted?: boolean;
  projectId: string;
  revision: string | null;
  slot: CloudProjectSlot;
  losses: string[];
  missingBeat: boolean;
} | null> {
  try {
    // Loading must see the last committed edit, not a snapshot fetched while
    // an earlier save is still being uploaded.
    await queue;
    const data = await readCloudState(slot);
    if (!data.hasProject || !data.project) return null;

    const project = data.project;
    const owner = cloudOwner;
    const losses: string[] = [];
    const download = async (url: string | undefined, label: string): Promise<AudioBuffer | undefined> => {
      if (!url) { losses.push(label); return; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(url, { signal: controller.signal,
          headers: owner ? { 'x-studio-owner': owner } : {} });
        if (response.status === 404 || response.status === 410) { losses.push(label); return; }
        if (!response.ok) throw new CloudConnectionError('No se pudo descargar el audio. Tu proyecto local se conserva.',
          response.status === 401 ? 'SESSION_REQUIRED' : 'SERVICE_UNAVAILABLE', response.status >= 500 || response.status === 429);
        const bytes = await response.arrayBuffer();
        if (owner !== cloudOwner) throw new CloudConnectionError('La cuenta cambió durante la descarga.', 'SESSION_REQUIRED', false);
        try { return await audioCtx.decodeAudioData(bytes); }
        catch (error) {
          if ((error as { name?: string }).name === 'EncodingError' || !bytes.byteLength) { losses.push(label); return; }
          throw error;
        }
      } catch (error) {
        if (controller.signal.aborted) throw new CloudConnectionError('La descarga tardó demasiado. Tu proyecto local se conserva.');
        throw error;
      } finally { clearTimeout(timer); }
    };

    // 1. Download and decode custom beat if present
    let customBeatBuffer: AudioBuffer | undefined = undefined;
    if (project.beat?.customBeatKey || project.beat?.downloadUrl) customBeatBuffer = await download(project.beat.downloadUrl, 'beat');
    const missingBeat = losses.includes('beat');
    // 2. Download and decode vocal takes
    const restoredTracks: VocalTrack[] = [];

    if (Array.isArray(project.tracks)) {
      for (const t of project.tracks) {
        const restoredClips: VocalClip[] = [];
        let latestBuffer: AudioBuffer | null = null;
        let latestWaveform: number[] | undefined;

        if (Array.isArray(t.clips)) {
          for (const c of t.clips) {
            try {
              const decoded = await download(c.downloadUrl, `${t.name || t.id}: ${c.name || 'toma'}`);
              if (!decoded) continue;
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
          fx: restoredVocalFX(t.fx),
          startBeatOffset: t.startBeatOffset || 0,
          duration: t.duration || 0,
          buffer: latestBuffer,
          waveformSample: latestWaveform,
          tunedBuffer: null,
          clips: restoredClips,
        });
      }
    }

    if (owner !== cloudOwner) throw new CloudConnectionError('La cuenta cambió durante la descarga.', 'SESSION_REQUIRED', false);
    return {
      projectId: project.projectId || crypto.randomUUID(), revision: data.revision ?? null, slot, losses, missingBeat,
      beatData: project.beat && !missingBeat
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
      const { response: res, data } = await requestCloudJson(projectUrl(), { method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: revision, ownerEmail: owner }) });
      if (!res.ok) return res.status >= 500 ? confirmDeletion() : false;
      if (data.success !== true) return false;
      if (owner === cloudOwner) { revision = data.revision ?? null; knownAudio.clear(); }
      return true;
    } catch { return confirmDeletion(); }
  });
  queue = deletion;
  return deletion;
}
