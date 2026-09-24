import { LoopSettings, VocalClip, VocalTrack } from '../types/audio';
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

export interface StoredStudioSession {
  id: string; // 'latest_active_session'
  timestamp: number;
  beatId?: string | null;
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
 * Persists the client's current studio workspace (all vocal takes, FX, beat reference)
 * to client memory so if an incoming phone call, browser refresh, or tab crash occurs,
 * their work is 100% safe.
 */
export async function saveStudioSession(
  tracks: VocalTrack[],
  beatId?: string | null,
  loopSettings?: LoopSettings,
  currentTime?: number
): Promise<boolean> {
  try {
    const db = await getDB();

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
          const wavBlob = audioBufferToWav(clip.buffer, 16); // 16-bit PCM is fast & ultra-compact for instant recovery
          const audioWavData = await wavBlob.arrayBuffer();

          storedClips.push({
            id: clip.id,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.duration,
            waveformSample: clip.waveformSample,
            audioWavData,
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
      beatId: beatId || null,
      loopSettings,
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
 * Restores the client's last active session, reconstructing all AudioBuffers,
 * waveform samples, timeline clips, and vocal FX parameters.
 */
export async function restoreLastStudioSession(
  audioCtx: AudioContext
): Promise<{
  tracks: VocalTrack[];
  beatId?: string | null;
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

    if (!session || !session.tracks) {
      return null;
    }

    // Has any track with actual recorded clips?
    const hasAnyRecordings = session.tracks.some((t) => t.clips && t.clips.length > 0);
    if (!hasAnyRecordings && !session.beatId) {
      return null;
    }

    const restoredTracks: VocalTrack[] = [];

    for (const st of session.tracks) {
      const restoredClips: VocalClip[] = [];
      let latestBuffer: AudioBuffer | null = null;
      let latestWaveform: number[] | undefined;

      for (const sc of st.clips) {
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
        volume: st.volume,
        pan: st.pan ?? 0,
        isMuted: st.isMuted,
        isSolo: st.isSolo,
        fx: st.fx,
        startBeatOffset: st.startBeatOffset || 0,
        duration: st.duration || 0,
        buffer: latestBuffer,
        waveformSample: latestWaveform,
        tunedBuffer: null,
        clips: restoredClips,
      });
    }

    return {
      tracks: restoredTracks,
      beatId: session.beatId,
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
