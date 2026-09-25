import { BeatData, LoopSettings, VocalClip, VocalTrack } from '../types/audio';
import { audioBufferToWav } from './wavEncoder';

const DB_NAME = 'RGODBEAT_STUDIO_DB';
const DB_VERSION = 2; // Upgraded to support session persistence
const SESSIONS_STORE = 'studio_sessions';
const BEATS_STORE = 'saved_beats';
const SETTINGS_STORE = 'studio_settings';

export interface StoredClipData {
  id: string;
  name?: string;
  startBeatOffset: number;
  duration: number;
  waveformSample?: number[];
  audioWavData: ArrayBuffer;
  isLocked?: boolean;
}

export interface StoredTrackData {
  id: string;
  name: string;
  volume: number;
  pan?: number;
  isMuted: boolean;
  isSolo: boolean;
  fx: any;
  startBeatOffset?: number;
  duration?: number;
  clips: StoredClipData[];
}

export interface StoredBeatData {
  id: string;
  title: string;
  producer?: string;
  bpm: number;
  key: string;
  scale: string;
  duration: number;
  waveformSample?: number[];
  artworkGradient?: string;
  isCustomUpload?: boolean;
  detectedBpm?: number;
  detectedKey?: string;
  detectedConfidence?: number;
  audioWavData?: ArrayBuffer;
}

export interface StoredStudioSession {
  id: string; // 'latest_active_session'
  timestamp: number;
  beatId?: string | null;
  beatData?: StoredBeatData | null;
  beatVolume?: number;
  loopSettings?: LoopSettings;
  currentTime?: number;
  tracks: StoredTrackData[];
}

let dbInstance: IDBDatabase | null = null;

async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(BEATS_STORE)) {
        db.createObjectStore(BEATS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = (event.target as IDBOpenDBRequest).result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open error in sessionStorage:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Persists the client's current studio workspace (all vocal takes, FX, and full Beat data)
 * to client memory so if an incoming phone call, browser refresh, or tab crash occurs,
 * their work and the exact beat of their last project is 100% safe.
 */
export async function saveStudioSession(
  tracks: VocalTrack[],
  beat?: BeatData | string | null,
  loopSettings?: LoopSettings,
  currentTime?: number,
  beatVolume?: number
): Promise<boolean> {
  try {
    const db = await getDB();

    // Check existing session to preserve beatData if not explicitly provided
    let existingSession: StoredStudioSession | null = null;
    try {
      existingSession = await new Promise((res) => {
        const tx = db.transaction([SESSIONS_STORE], 'readonly');
        const req = tx.objectStore(SESSIONS_STORE).get('latest_active_session');
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch {
      // ignore
    }

    let storedBeatData: StoredBeatData | null = null;
    let resolvedBeatId: string | null = null;

    if (typeof beat === 'string') {
      resolvedBeatId = beat;
      if (existingSession?.beatData && existingSession.beatData.id === beat) {
        storedBeatData = existingSession.beatData;
      }
    } else if (beat && typeof beat === 'object') {
      resolvedBeatId = beat.id;
      let audioWavData: ArrayBuffer | undefined = undefined;

      // If existing session already has audio data for the same beat, reuse it to avoid re-encoding
      if (existingSession?.beatData?.id === beat.id && existingSession.beatData.audioWavData) {
        audioWavData = existingSession.beatData.audioWavData;
      } else if (beat.buffer) {
        try {
          const wavBlob = audioBufferToWav(beat.buffer, 16);
          audioWavData = await wavBlob.arrayBuffer();
        } catch (wavErr) {
          console.warn('Could not encode beat buffer for session:', wavErr);
        }
      }

      storedBeatData = {
        id: beat.id,
        title: beat.title,
        producer: beat.producer,
        bpm: beat.bpm,
        key: beat.key,
        scale: beat.scale,
        duration: beat.duration,
        waveformSample: beat.waveformSample,
        artworkGradient: beat.artworkGradient,
        isCustomUpload: Boolean(beat.isCustomUpload),
        detectedBpm: beat.detectedBpm,
        detectedKey: beat.detectedKey,
        detectedConfidence: beat.detectedConfidence,
        audioWavData,
      };
    } else if (!beat && existingSession?.beatData) {
      // Retain previously stored beat
      storedBeatData = existingSession.beatData;
      resolvedBeatId = existingSession.beatId || existingSession.beatData.id;
    }

    const storedTracks: StoredTrackData[] = [];

    for (const track of tracks) {
      const storedClips: StoredClipData[] = [];

      // Collect clips
      const clipsToProcess: VocalClip[] = (track.clips && track.clips.length > 0)
        ? track.clips
        : (track.buffer ? [{
            id: `legacy-${track.id}`,
            buffer: track.buffer,
            tunedBuffer: null,
            startBeatOffset: track.startBeatOffset || 0,
            duration: track.duration || track.buffer.duration,
            waveformSample: track.waveformSample,
            name: 'Toma 1',
          }] : []);

      for (const clip of clipsToProcess) {
        if (!clip.buffer) continue;
        try {
          // Convert audio buffer to WAV binary ArrayBuffer for lossless persistent storage
          const wavBlob = audioBufferToWav(clip.buffer, 16);
          const audioWavData = await wavBlob.arrayBuffer();

          storedClips.push({
            id: clip.id,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.duration,
            waveformSample: clip.waveformSample,
            audioWavData,
            isLocked: Boolean(clip.isLocked),
          });
        } catch (clipErr) {
          console.warn('Error serializing clip audio:', clipErr);
        }
      }

      storedTracks.push({
        id: track.id,
        name: track.name,
        volume: track.volume,
        pan: track.pan,
        isMuted: track.isMuted,
        isSolo: track.isSolo,
        fx: track.fx,
        startBeatOffset: track.startBeatOffset,
        duration: track.duration,
        clips: storedClips,
      });
    }

    const sessionPayload: StoredStudioSession = {
      id: 'latest_active_session',
      timestamp: Date.now(),
      beatId: resolvedBeatId,
      beatData: storedBeatData,
      beatVolume: beatVolume !== undefined ? beatVolume : existingSession?.beatVolume ?? 1.0,
      loopSettings: loopSettings || existingSession?.loopSettings,
      currentTime: currentTime || 0,
      tracks: storedTracks,
    };

    return new Promise((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.put(sessionPayload);
      req.onsuccess = () => resolve(true);
      req.onerror = (e) => {
        console.warn('Error saving studio session:', e);
        resolve(false);
      };
    });
  } catch (err) {
    console.warn('saveStudioSession failure:', err);
    return false;
  }
}

/**
 * Saves or updates just the active beat of the last project immediately
 * so that changing the beat is registered without waiting for a vocal recording.
 */
export async function saveLastProjectBeat(
  beat: BeatData,
  beatVolume?: number
): Promise<boolean> {
  try {
    const db = await getDB();
    let existingSession: StoredStudioSession | null = null;
    try {
      existingSession = await new Promise((res) => {
        const tx = db.transaction([SESSIONS_STORE], 'readonly');
        const req = tx.objectStore(SESSIONS_STORE).get('latest_active_session');
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch {
      // ignore
    }

    let audioWavData: ArrayBuffer | undefined = undefined;
    if (beat.buffer) {
      try {
        const wavBlob = audioBufferToWav(beat.buffer, 16);
        audioWavData = await wavBlob.arrayBuffer();
      } catch (wavErr) {
        console.warn('Could not encode beat buffer for session:', wavErr);
      }
    }

    const storedBeatData: StoredBeatData = {
      id: beat.id,
      title: beat.title,
      producer: beat.producer,
      bpm: beat.bpm,
      key: beat.key,
      scale: beat.scale,
      duration: beat.duration,
      waveformSample: beat.waveformSample,
      artworkGradient: beat.artworkGradient,
      isCustomUpload: Boolean(beat.isCustomUpload),
      detectedBpm: beat.detectedBpm,
      detectedKey: beat.detectedKey,
      detectedConfidence: beat.detectedConfidence,
      audioWavData,
    };

    const sessionPayload: StoredStudioSession = {
      id: 'latest_active_session',
      timestamp: Date.now(),
      beatId: beat.id,
      beatData: storedBeatData,
      beatVolume: beatVolume !== undefined ? beatVolume : existingSession?.beatVolume ?? 1.0,
      loopSettings: existingSession?.loopSettings,
      currentTime: existingSession?.currentTime || 0,
      tracks: existingSession?.tracks || [],
    };

    return new Promise((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.put(sessionPayload);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch (err) {
    console.warn('saveLastProjectBeat failure:', err);
    return false;
  }
}

/**
 * Restores the client's last active session, reconstructing all AudioBuffers,
 * waveform samples, timeline clips, vocal FX parameters, AND the exact Beat.
 */
export async function restoreLastStudioSession(
  audioCtx: AudioContext
): Promise<{
  tracks: VocalTrack[];
  beat?: BeatData | null;
  beatId?: string | null;
  beatVolume?: number;
  loopSettings?: LoopSettings;
  currentTime?: number;
  timestamp: number;
} | null> {
  try {
    const db = await getDB();

    const session: StoredStudioSession | null = await new Promise((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.get('latest_active_session');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    if (!session) {
      return null;
    }

    // 1. Reconstruct beat AudioBuffer if stored with raw audio
    let restoredBeat: BeatData | null = null;
    if (session.beatData) {
      let beatBuffer: AudioBuffer | null = null;
      if (session.beatData.audioWavData && session.beatData.audioWavData.byteLength > 0) {
        try {
          const arrayBufferCopy = session.beatData.audioWavData.slice(0);
          beatBuffer = await audioCtx.decodeAudioData(arrayBufferCopy);
        } catch (decErr) {
          console.warn('Error decoding session beat audio data:', decErr);
        }
      }

      if (beatBuffer) {
        restoredBeat = {
          id: session.beatData.id,
          title: session.beatData.title,
          producer: session.beatData.producer || 'Custom Beat',
          bpm: session.beatData.bpm,
          key: session.beatData.key,
          scale: session.beatData.scale,
          duration: beatBuffer.duration,
          buffer: beatBuffer,
          artworkGradient: session.beatData.artworkGradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          waveformSample: session.beatData.waveformSample,
          isCustomUpload: Boolean(session.beatData.isCustomUpload),
          detectedBpm: session.beatData.detectedBpm,
          detectedKey: session.beatData.detectedKey,
          detectedConfidence: session.beatData.detectedConfidence,
          isLocked: true,
        };
      }
    }

    // Has any track with actual recorded clips?
    const hasAnyRecordings = Array.isArray(session.tracks) && session.tracks.some((t) => t.clips && t.clips.length > 0);
    if (!hasAnyRecordings && !restoredBeat && !session.beatId) {
      return null;
    }

    const restoredTracks: VocalTrack[] = [];

    if (Array.isArray(session.tracks)) {
      for (const st of session.tracks) {
        const restoredClips: VocalClip[] = [];
        let latestBuffer: AudioBuffer | null = null;
        let latestWaveform: number[] | undefined;

        for (const sc of st.clips || []) {
          if (!sc.audioWavData || sc.audioWavData.byteLength === 0) continue;
          try {
            // Decode WAV array buffer back to native WebAudio AudioBuffer
            const decoded = await audioCtx.decodeAudioData(sc.audioWavData.slice(0));
            restoredClips.push({
              id: sc.id,
              name: sc.name || 'Toma',
              startBeatOffset: sc.startBeatOffset,
              duration: sc.duration || decoded.duration,
              waveformSample: sc.waveformSample,
              buffer: decoded,
              tunedBuffer: null,
              isLocked: Boolean(sc.isLocked),
            });
            latestBuffer = decoded;
            latestWaveform = sc.waveformSample;
          } catch (decErr) {
            console.warn('Error decoding restored vocal clip:', decErr);
          }
        }

        restoredTracks.push({
          id: st.id as any,
          name: st.name,
          volume: st.volume ?? 1.0,
          pan: st.pan ?? 0,
          isMuted: Boolean(st.isMuted),
          isSolo: Boolean(st.isSolo),
          fx: st.fx,
          startBeatOffset: st.startBeatOffset || 0,
          duration: st.duration || 0,
          buffer: latestBuffer,
          waveformSample: latestWaveform,
          tunedBuffer: null,
          clips: restoredClips,
        });
      }
    }

    return {
      tracks: restoredTracks,
      beat: restoredBeat,
      beatId: session.beatId || restoredBeat?.id,
      beatVolume: session.beatVolume,
      loopSettings: session.loopSettings,
      currentTime: session.currentTime,
      timestamp: session.timestamp,
    };
  } catch (err) {
    console.warn('restoreLastStudioSession error:', err);
    return null;
  }
}

/**
 * Clears the stored studio session (e.g. when starting a new project)
 */
export async function clearSavedStudioSession(): Promise<boolean> {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.delete('latest_active_session');
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
