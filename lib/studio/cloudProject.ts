import { BeatData, LoopSettings, VocalClip, VocalTrack } from './types/audio';
import { audioBufferToWav } from './audio/wavEncoder';

export interface CloudProjectCheckResult {
  hasProject: boolean;
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
    const res = await fetch('/api/studio/project', { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      return { hasProject: false };
    }
    const data = await res.json();
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
    return { hasProject: false };
  }
}

/**
 * Uploads and saves the current project (Beat + Vocal Tracks + FX settings)
 * to the user's cloud account (Cloudflare R2).
 */
export async function saveProjectToCloud(
  tracks: VocalTrack[],
  currentBeat: BeatData | null,
  loopSettings?: LoopSettings
): Promise<{ success: boolean; error?: string; requiresPass?: boolean }> {
  try {
    const formData = new FormData();

    const tracksMeta = [];

    for (const track of tracks) {
      const clipsMeta: Array<{
        id: string;
        name?: string;
        startBeatOffset: number;
        duration: number;
        waveformSample?: number[];
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
          const wavBlob = audioBufferToWav(clip.buffer, 16);
          const formKey = `clip_${track.id}_${clip.id}`;
          formData.append(formKey, wavBlob, `${clip.id}.wav`);

          clipsMeta.push({
            id: clip.id,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.duration,
            waveformSample: clip.waveformSample,
          });
        } catch (clipErr) {
          console.warn('Error encoding clip for cloud save:', clipErr);
        }
      }

      tracksMeta.push({
        id: track.id,
        name: track.name,
        volume: track.volume,
        pan: track.pan,
        isMuted: track.isMuted,
        isSolo: track.isSolo,
        fx: track.fx,
        startBeatOffset: track.startBeatOffset,
        duration: track.duration,
        clips: clipsMeta,
      });
    }

    // Process custom beat if uploaded
    if (currentBeat?.isCustomUpload && currentBeat.buffer) {
      try {
        const beatBlob = audioBufferToWav(currentBeat.buffer, 16);
        formData.append('beat_custom', beatBlob, 'beat.wav');
      } catch (beatErr) {
        console.warn('Error encoding custom beat for cloud save:', beatErr);
      }
    }

    const metadata = {
      projectName: currentBeat ? `Proyecto: ${currentBeat.title}` : 'Mi Proyecto',
      beat: currentBeat
        ? {
            id: currentBeat.id,
            title: currentBeat.title,
            producer: currentBeat.producer,
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
      tracks: tracksMeta,
    };

    formData.append('metadata', JSON.stringify(metadata));

    const res = await fetch('/api/studio/project', {
      method: 'POST',
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      return {
        success: false,
        error: data.error || 'Error al guardar el proyecto en la nube.',
        requiresPass: Boolean(data.requiresPass),
      };
    }

    return { success: true };
  } catch (err: any) {
    console.error('saveProjectToCloud error:', err);
    return { success: false, error: err.message || 'Error de conexión al guardar.' };
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
} | null> {
  try {
    const res = await fetch('/api/studio/project', { method: 'GET', cache: 'no-store' });
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.hasProject || !data.project) return null;

    const project = data.project;

    // 1. Download and decode custom beat if present
    let customBeatBuffer: AudioBuffer | undefined = undefined;
    if (project.beat?.isCustomUpload && project.beat.downloadUrl) {
      try {
        const beatFetch = await fetch(project.beat.downloadUrl);
        const beatArrayBuffer = await beatFetch.arrayBuffer();
        customBeatBuffer = await audioCtx.decodeAudioData(beatArrayBuffer);
      } catch (err) {
        console.warn('Error loading custom beat from cloud URL:', err);
      }
    }

    // 2. Download and decode vocal takes
    const restoredTracks: VocalTrack[] = [];

    if (Array.isArray(project.tracks)) {
      for (const t of project.tracks) {
        const restoredClips: VocalClip[] = [];
        let latestBuffer: AudioBuffer | null = null;
        let latestWaveform: number[] | undefined;

        if (Array.isArray(t.clips)) {
          for (const c of t.clips) {
            if (!c.downloadUrl) continue;
            try {
              const clipFetch = await fetch(c.downloadUrl);
              const clipArrayBuffer = await clipFetch.arrayBuffer();
              const decoded = await audioCtx.decodeAudioData(clipArrayBuffer);

              restoredClips.push({
                id: c.id,
                name: c.name || 'Toma',
                startBeatOffset: c.startBeatOffset || 0,
                duration: c.duration || decoded.duration,
                waveformSample: c.waveformSample,
                buffer: decoded,
                tunedBuffer: null,
              });
              latestBuffer = decoded;
              latestWaveform = c.waveformSample;
            } catch (clipErr) {
              console.warn('Error downloading or decoding cloud vocal clip:', clipErr);
            }
          }
        }

        restoredTracks.push({
          id: t.id,
          name: t.name,
          volume: t.volume ?? 1.0,
          pan: t.pan ?? 0,
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
          }
        : null,
      tracks: restoredTracks,
      loopSettings: project.loopSettings,
    };
  } catch (err) {
    console.error('loadProjectFromCloud error:', err);
    return null;
  }
}

/**
 * Deletes the saved project from the cloud.
 */
export async function deleteProjectFromCloud(): Promise<boolean> {
  try {
    const res = await fetch('/api/studio/project', { method: 'DELETE' });
    return res.ok;
  } catch {
    return false;
  }
}
