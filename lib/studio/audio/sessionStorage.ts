import { BeatData, LoopSettings, VocalClip, VocalTrack, VocalFX, BeatFX, BeatMixSettings } from '../types/audio';
import { audioBufferToWav, extractWaveformPeaks, WAVEFORM_SAMPLE_COUNT } from './wavEncoder';
import { retireRecordingCheckpoints } from './recordingRecovery';
import { getCatalogBeatId } from './catalogBeat';
import { restoredVocalFX } from './restoredFX';

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
  isCustom?: boolean;
  isMuted: boolean;
  isSolo: boolean;
  fx: VocalFX;
  startBeatOffset?: number;
  duration?: number;
  clips: StoredClipData[];
}

export interface StoredBeatData {
  id: string;
  catalogBeatId?: string | null;
  title: string;
  producer?: string;
  genre?: string;
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
  projectId?: string;
  id: string; // 'latest_active_session' or `session_${userEmail}`
  timestamp: number;
  userEmail?: string | null;
  beatId?: string | null;
  beatData?: StoredBeatData | null;
  beatVolume?: number;
  beatFX?: BeatFX;
  isBeatMuted?: boolean;
  loopSettings?: LoopSettings;
  currentTime?: number;
  activeView?: 'studio' | 'editor';
  tracks: StoredTrackData[];
}

let currentSessionUser: string | null = null;

export function setSessionStorageUser(userEmail?: string | null): void {
  currentSessionUser = userEmail && userEmail.trim().length > 0 ? userEmail.trim().toLowerCase() : null;
}

export function getSessionStorageKey(userIdentifier?: string | null): string {
  const resolved = (userIdentifier !== undefined ? userIdentifier : currentSessionUser);
  if (resolved && typeof resolved === 'string' && resolved.trim().length > 0) {
    return `session_${resolved.trim().toLowerCase()}`;
  }
  return 'latest_active_session';
}

/** Move the active local project between owner scopes without duplicating its audio payload. */
export async function moveStudioSession(fromUser: string | null, toUser: string): Promise<boolean> {
  const fromKey = getSessionStorageKey(fromUser);
  const toKey = getSessionStorageKey(toUser);
  if (fromKey === toKey) return true;
  // Pending encodes must not recreate the guest session after it is moved.
  saveVersions.set(fromKey, (saveVersions.get(fromKey) ?? 0) + 1);
  latestSaves.delete(fromKey);
  try {
    const db = await getDB();
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      let moved = false;
      const sourceRequest = store.get(fromKey);
      sourceRequest.onsuccess = () => {
        const source = sourceRequest.result as StoredStudioSession | undefined;
        if (!source) return;
        const targetRequest = store.get(toKey);
        targetRequest.onsuccess = () => {
          if (targetRequest.result) return;
          store.put({ ...source, id: toKey, userEmail: toUser.trim().toLowerCase(), timestamp: Date.now() });
          store.delete(fromKey);
          moved = true;
        };
      };
      tx.oncomplete = () => resolve(moved);
      tx.onabort = () => resolve(false);
      tx.onerror = () => resolve(false);
    });
  } catch (error) {
    console.warn('Could not move the active Studio session:', error);
    return false;
  }
}

let dbInstance: IDBDatabase | null = null;
const saveVersions = new Map<string, number>();
const latestSaves = new Map<string, { version: number; promise: Promise<boolean> }>();
const encodedBuffers = new WeakMap<AudioBuffer, Promise<ArrayBuffer>>();
const encodedVocalBuffers = new WeakMap<AudioBuffer, Promise<ArrayBuffer>>();
function encodeStoredAudio(buffer: AudioBuffer, bitDepth: 24 | 32 = 24): Promise<ArrayBuffer> {
  const cache = bitDepth === 32 ? encodedVocalBuffers : encodedBuffers;
  let result = cache.get(buffer);
  if (!result) {
    result = audioBufferToWav(buffer, bitDepth).arrayBuffer();
    cache.set(buffer, result);
  }
  return result;
}

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
 * to IndexedDB. Success means the transaction committed; browser storage can still
 * be cleared by the user or OS, so the downloadable project remains necessary.
 */
export function saveStudioSession(...args: Parameters<typeof persistStudioSession>): Promise<boolean> {
  // Pin the owner now: signing in while encoding must not redirect the write.
  const owner = args[6] === undefined ? currentSessionUser : args[6];
  const key = getSessionStorageKey(owner);
  const version = (saveVersions.get(key) ?? 0) + 1;
  saveVersions.set(key, version);
  args[6] = owner;
  const promise = persistStudioSession(...args);
  latestSaves.set(key, { version, promise });
  return promise;
}

async function persistStudioSession(
  tracks: VocalTrack[],
  beat?: BeatData | string | null,
  loopSettings?: LoopSettings,
  currentTime?: number,
  beatVolume?: number,
  activeView?: 'studio' | 'editor',
  userIdentifier?: string | null,
  mix?: BeatMixSettings,
  projectId?: string
): Promise<boolean> {
  const sessionKey = getSessionStorageKey(userIdentifier);
  const version = saveVersions.get(sessionKey);
  const newerSave = () => {
    const latest = latestSaves.get(sessionKey);
    return latest && latest.version === saveVersions.get(sessionKey) && latest.version !== version
      ? latest.promise : Promise.resolve(false);
  };
  try {
    const db = await getDB();
    if (saveVersions.get(sessionKey) !== version) return newerSave();

    // Check existing session to preserve beatData if not explicitly provided
    let existingSession: StoredStudioSession | null = null;
    try {
      existingSession = await new Promise((res) => {
        const tx = db.transaction([SESSIONS_STORE], 'readonly');
        const req = tx.objectStore(SESSIONS_STORE).get(sessionKey);
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
      if (beat.buffer) {
        try {
          audioWavData = await encodeStoredAudio(beat.buffer);
        } catch (wavErr) {
          throw wavErr;
        }
      }

      storedBeatData = {
        id: beat.id,
        catalogBeatId: getCatalogBeatId(beat.id, beat.catalogBeatId),
        title: beat.title,
        producer: beat.producer,
        genre: beat.genre,
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
    } else if (beat === undefined && existingSession?.beatData) {
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
        if (!clip.buffer) throw new Error('Falta el audio de una toma. No se pudo guardar el proyecto completo.');
        try {
          // Convert audio buffer to WAV binary ArrayBuffer for lossless persistent storage
          const audioWavData = await encodeStoredAudio(clip.buffer, 32);

          storedClips.push({
            id: clip.id,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.buffer.duration,
            waveformSample: clip.waveformSample,
            audioWavData,
            isLocked: Boolean(clip.isLocked),
          });
        } catch (clipErr) {
          throw clipErr;
        }
      }

      storedTracks.push({
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
        clips: storedClips,
      });
    }

    // Callers save only after startup restoration. Empty tracks can be an intentional deletion.
    // An overlapping save is not a storage failure. Await the newer snapshot's
    // commit so callers cannot fall back to uploading their obsolete snapshot.
    if (saveVersions.get(sessionKey) !== version) return newerSave();
    const sessionPayload: StoredStudioSession = {
      projectId: projectId ?? existingSession?.projectId ?? crypto.randomUUID(),
      id: sessionKey,
      timestamp: Date.now(),
      userEmail: userIdentifier || null,
      beatId: resolvedBeatId,
      beatData: storedBeatData,
      beatVolume: beatVolume !== undefined ? beatVolume : existingSession?.beatVolume ?? 1.0,
      beatFX: mix?.beatFX ?? existingSession?.beatFX,
      isBeatMuted: mix?.isBeatMuted ?? existingSession?.isBeatMuted ?? false,
      loopSettings: loopSettings || existingSession?.loopSettings,
      currentTime: currentTime || 0,
      activeView: activeView || existingSession?.activeView || 'studio',
      tracks: storedTracks,
    };

    const committed = await new Promise<boolean>((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.put(sessionPayload);
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
      req.onerror = (e) => {
        console.warn('Error saving studio session:', e);
        resolve(false);
      };
    });
    if (committed) await retireRecordingCheckpoints(sessionKey, tracks, sessionPayload.projectId);
    return committed;
  } catch (err) {
    if (saveVersions.get(sessionKey) !== version) return newerSave();
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
  beatVolume?: number,
  userIdentifier?: string | null
): Promise<boolean> {
  try {
    const db = await getDB();
    const sessionKey = getSessionStorageKey(userIdentifier);
    let existingSession: StoredStudioSession | null = null;
    try {
      existingSession = await new Promise((res) => {
        const tx = db.transaction([SESSIONS_STORE], 'readonly');
        const req = tx.objectStore(SESSIONS_STORE).get(sessionKey);
        req.onsuccess = () => res(req.result || null);
        req.onerror = () => res(null);
      });
    } catch {
      // ignore
    }

    let audioWavData: ArrayBuffer | undefined = undefined;
    if (beat.buffer) {
      try {
        audioWavData = await encodeStoredAudio(beat.buffer);
      } catch (wavErr) {
        console.warn('Could not encode beat buffer for session:', wavErr);
      }
    }

    const storedBeatData: StoredBeatData = {
      id: beat.id,
      catalogBeatId: getCatalogBeatId(beat.id, beat.catalogBeatId),
      title: beat.title,
      producer: beat.producer,
      genre: beat.genre,
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
      projectId: existingSession?.projectId,
      id: sessionKey,
      timestamp: Date.now(),
      userEmail: userIdentifier || null,
      beatId: beat.id,
      beatData: storedBeatData,
      beatVolume: beatVolume !== undefined ? beatVolume : existingSession?.beatVolume ?? 1.0,
      beatFX: existingSession?.beatFX,
      isBeatMuted: existingSession?.isBeatMuted,
      loopSettings: existingSession?.loopSettings,
      currentTime: existingSession?.currentTime || 0,
      activeView: existingSession?.activeView || 'studio',
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
  audioCtx: AudioContext,
  userIdentifier?: string | null,
  slot: 'active' | 'previous' = 'active'
): Promise<{
  projectId?: string;
  tracks: VocalTrack[];
  beat?: BeatData | null;
  beatId?: string | null;
  beatVolume?: number;
  beatFX?: BeatFX;
  isBeatMuted?: boolean;
  loopSettings?: LoopSettings;
  currentTime?: number;
  activeView?: 'studio' | 'editor';
  timestamp: number;
  losses: string[];
} | null> {
  try {
    const db = await getDB();
    const sessionKey = getSessionStorageKey(userIdentifier) + (slot === 'previous' ? ':previous' : '');

    const session: StoredStudioSession | null = await new Promise((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readonly');
      const store = tx.objectStore(SESSIONS_STORE);
      const req = store.get(sessionKey);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });

    // Never automatically copy an anonymous user's voices into a different account.

    if (!session) {
      return null;
    }
    const losses: string[] = [];

    // 1. Reconstruct beat AudioBuffer if stored with raw audio
    let restoredBeat: BeatData | null = null;
    if (session.beatData) {
      let beatBuffer: AudioBuffer | null = null;
      if (session.beatData.audioWavData && session.beatData.audioWavData.byteLength > 0) {
        try {
          const arrayBufferCopy = session.beatData.audioWavData.slice(0);
          beatBuffer = await audioCtx.decodeAudioData(arrayBufferCopy);
        } catch (decErr) {
          if ((decErr as { name?: string }).name !== 'EncodingError') throw decErr;
          losses.push('beat');
        }
      } else if (session.beatData.isCustomUpload) {
        losses.push('beat');
      }

      if (beatBuffer) {
        restoredBeat = {
          id: session.beatData.id,
          catalogBeatId: getCatalogBeatId(session.beatData.id, session.beatData.catalogBeatId),
          title: session.beatData.title,
          producer: session.beatData.producer || 'Custom Beat',
          genre: session.beatData.genre,
          bpm: session.beatData.bpm,
          key: session.beatData.key,
          scale: session.beatData.scale,
          duration: beatBuffer.duration,
          buffer: beatBuffer,
          artworkGradient: session.beatData.artworkGradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          waveformSample: extractWaveformPeaks(beatBuffer, WAVEFORM_SAMPLE_COUNT),
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
          if (!sc.audioWavData || sc.audioWavData.byteLength === 0) { losses.push(`${st.name}: ${sc.name || 'toma'}`); continue; }
          try {
            // Decode WAV array buffer back to native WebAudio AudioBuffer
            const decoded = await audioCtx.decodeAudioData(sc.audioWavData.slice(0));
            restoredClips.push({
              id: sc.id,
              name: sc.name || 'Toma',
              startBeatOffset: sc.startBeatOffset,
              duration: decoded.duration,
              waveformSample: extractWaveformPeaks(decoded, WAVEFORM_SAMPLE_COUNT),
              buffer: decoded,
              tunedBuffer: null,
              isLocked: Boolean(sc.isLocked),
            });
            latestBuffer = decoded;
            latestWaveform = sc.waveformSample;
          } catch (decErr) {
            if ((decErr as { name?: string }).name !== 'EncodingError') throw decErr;
            losses.push(`${st.name}: ${sc.name || 'toma'}`);
          }
        }

        restoredTracks.push({
          id: st.id,
          name: st.name,
          volume: st.volume ?? 1.0,
          pan: st.pan ?? 0,
          isCustom: st.isCustom ?? st.id.startsWith('backing'),
          isMuted: Boolean(st.isMuted),
          isSolo: Boolean(st.isSolo),
          fx: restoredVocalFX(st.fx),
          startBeatOffset: st.startBeatOffset || (restoredClips[0]?.startBeatOffset ?? 0),
          duration: st.duration || (restoredClips.length > 0 ? Math.max(...restoredClips.map((c) => c.startBeatOffset + c.duration)) : 0),
          buffer: latestBuffer,
          waveformSample: latestWaveform,
          tunedBuffer: null,
          clips: restoredClips,
        });
      }
    }

    return {
      projectId: session.projectId,
      losses,
      tracks: restoredTracks,
      beat: restoredBeat,
      beatId: losses.includes('beat') ? null : session.beatId || restoredBeat?.id,
      beatVolume: session.beatVolume,
      beatFX: session.beatFX,
      isBeatMuted: session.isBeatMuted,
      loopSettings: session.loopSettings,
      currentTime: session.currentTime,
      activeView: session.activeView,
      timestamp: session.timestamp,
    };
  } catch (err) {
    console.warn('restoreLastStudioSession error:', err);
    throw err;
  }
}

/**
 * Clears the stored studio session (e.g. when starting a new project)
 */
export async function archiveSavedStudioSession(userIdentifier?: string | null, replacePrevious = false): Promise<{
  success: boolean; hasPrevious?: boolean; requiresConfirmation?: boolean;
}> {
  const key = getSessionStorageKey(userIdentifier);
  await latestSaves.get(key)?.promise;
  try {
    const db = await getDB();
    return await new Promise(resolve => {
      const tx = db.transaction(SESSIONS_STORE, 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      let result = { success: true, hasPrevious: false, requiresConfirmation: false };
      const source = store.get(key);
      source.onsuccess = () => {
        const previous = store.get(`${key}:previous`);
        previous.onsuccess = () => {
          result.hasPrevious = Boolean(previous.result);
          const session = source.result as StoredStudioSession | undefined;
          if (!session) return;
          const hasVoices = session.tracks?.some(track => track.clips?.length);
          // An empty workspace must never push the last recorded project out.
          if (previous.result && !hasVoices) return;
          if (previous.result && !replacePrevious) {
            result = { success: false, hasPrevious: true, requiresConfirmation: true }; return;
          }
          store.put({ ...session, id: `${key}:previous` });
          result.hasPrevious = true;
        };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => resolve({ success: false });
      tx.onerror = () => resolve({ success: false });
    });
  } catch { return { success: false }; }
}

export async function hasPreviousStudioSession(userIdentifier?: string | null): Promise<boolean> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction(SESSIONS_STORE).objectStore(SESSIONS_STORE).getKey(`${getSessionStorageKey(userIdentifier)}:previous`);
    request.onsuccess = () => resolve(Boolean(request.result));
    request.onerror = () => reject(request.error);
  });
}

export async function clearSavedStudioSession(userIdentifier?: string | null): Promise<boolean> {
  const key = getSessionStorageKey(userIdentifier);
  saveVersions.set(key, (saveVersions.get(key) ?? 0) + 1);
  latestSaves.delete(key);
  try {
    const db = await getDB();
    const sessionKey = key;
    const committed = await new Promise<boolean>((resolve) => {
      const tx = db.transaction([SESSIONS_STORE], 'readwrite');
      const store = tx.objectStore(SESSIONS_STORE);
      store.delete(sessionKey);
      tx.oncomplete = () => resolve(true);
      tx.onabort = () => resolve(false);
    });
    if (committed) await retireRecordingCheckpoints(key);
    return committed;
  } catch {
    return false;
  }
}

// Convert ArrayBuffer to Base64 safely
async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const parts: string[] = [];
  // Multiples of three keep padding only at the end. Bounded chunks avoid a huge
  // intermediate binary string and leave the phone's UI time to update.
  const chunkSize = 3 * 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + chunkSize))));
    if (i > 0 && i % (chunkSize * 32) === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
  return parts.join('');
}

// Convert Base64 to ArrayBuffer safely
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export interface RGODBeatExportFile {
  format: 'RGODBEAT_PROJECT_V1';
  version: 1;
  exportedAt: number;
  beatTitle: string;
  projectArtwork?: string;
  sessionData: {
    beatId?: string | null;
    beatData?: {
      id: string;
      catalogBeatId?: string | null;
      title: string;
      producer?: string;
      genre?: string;
      bpm: number;
      key: string;
      scale: string;
      duration: number;
      waveformSample?: number[];
      artworkGradient?: string;
      isCustomUpload?: boolean;
      audioWavBase64?: string;
    } | null;
    beatVolume?: number;
    beatFX?: BeatFX;
    isBeatMuted?: boolean;
    loopSettings?: LoopSettings;
    currentTime?: number;
    tracks: Array<{
      id: string;
      name: string;
      volume: number;
      pan?: number;
      isCustom?: boolean;
      isMuted: boolean;
      isSolo: boolean;
      fx: VocalFX;
      clips: Array<{
        id: string;
        name?: string;
        startBeatOffset: number;
        duration: number;
        waveformSample?: number[];
        audioWavBase64: string;
        isLocked?: boolean;
      }>;
    }>;
  };
}

/**
 * Exports the entire active project (Beat audio, all vocal takes, FX, markers and settings)
 * as a standalone downloadable `.rgodbeat` bundle file directly onto the user's phone or computer.
 */
export async function exportProjectToDeviceFile(
  tracks: VocalTrack[],
  beat?: BeatData | null,
  loopSettings?: LoopSettings,
  currentTime?: number,
  beatVolume?: number,
  mix?: BeatMixSettings
): Promise<{ success: boolean; filename?: string; error?: string }> {
  try {
    const cleanBeatTitle = (beat?.title || 'Mi_Proyecto').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanBeatTitle}_RGODBEAT_${new Date().toISOString().slice(0, 10)}.rgodbeat`;

    const exportedTracks: RGODBeatExportFile['sessionData']['tracks'] = [];

    for (const track of tracks) {
      const clipsToProcess: VocalClip[] =
        track.clips && track.clips.length > 0
          ? track.clips
          : track.buffer
          ? [{
              id: `clip-${track.id}-init`,
              buffer: track.buffer,
              tunedBuffer: track.tunedBuffer,
              startBeatOffset: track.startBeatOffset,
              duration: track.duration || track.buffer.duration,
              waveformSample: track.waveformSample,
              name: 'Toma 1',
              isLocked: true,
            }]
          : [];

      const storedClips = [];
      for (const clip of clipsToProcess) {
        if (!clip.buffer) throw new Error('Falta el audio de una toma. No se pudo exportar el proyecto completo.');
        try {
          const buf = await encodeStoredAudio(clip.buffer, 32);
          const base64 = await arrayBufferToBase64(buf);
          storedClips.push({
            id: clip.id,
            name: clip.name,
            startBeatOffset: clip.startBeatOffset,
            duration: clip.buffer.duration,
            waveformSample: clip.waveformSample,
            audioWavBase64: base64,
            isLocked: clip.isLocked !== undefined ? Boolean(clip.isLocked) : true,
          });
        } catch (e) {
          throw e;
        }
      }

      exportedTracks.push({
        id: track.id,
        name: track.name,
        volume: track.volume,
        pan: track.pan,
        isCustom: track.isCustom,
        isMuted: track.isMuted,
        isSolo: track.isSolo,
        fx: track.fx,
        clips: storedClips,
      });
    }

    let storedBeatData = null;
    if (beat) {
      let audioWavBase64: string | undefined = undefined;
      if (beat.buffer) {
        const buf = await encodeStoredAudio(beat.buffer);
        audioWavBase64 = await arrayBufferToBase64(buf);
      }
      storedBeatData = {
        id: beat.id,
        catalogBeatId: getCatalogBeatId(beat.id, beat.catalogBeatId),
        title: beat.title,
        producer: beat.producer,
        genre: beat.genre,
        bpm: beat.bpm,
        key: beat.key,
        scale: beat.scale,
        duration: beat.duration,
        waveformSample: beat.waveformSample,
        artworkGradient: beat.artworkGradient,
        isCustomUpload: Boolean(beat.isCustomUpload),
        audioWavBase64,
      };
    }

    const payload: RGODBeatExportFile = {
      format: 'RGODBEAT_PROJECT_V1',
      version: 1,
      exportedAt: Date.now(),
      beatTitle: beat?.title || 'Mi Proyecto',
      projectArtwork: '/images/rg-project-vinyl.jpg',
      sessionData: {
        beatId: beat?.id,
        beatData: storedBeatData,
        beatVolume: beatVolume ?? 1.0,
        beatFX: mix?.beatFX,
        isBeatMuted: mix?.isBeatMuted,
        loopSettings,
        currentTime: currentTime ?? 0,
        tracks: exportedTracks,
      },
    };

    const json = JSON.stringify(payload);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return { success: true, filename };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    console.error('Export project to device error:', err);
    return { success: false, error };
  }
}

/**
 * Imports and restores a previously exported `.rgodbeat` bundle file from the user's phone or computer.
 */
export async function importProjectFromDeviceFile(
  file: File,
  audioCtx: AudioContext,
  projectId = crypto.randomUUID(),
  userIdentifier?: string | null,
  availableBeats: BeatData[] = []
): Promise<{
  projectId: string;
  tracks: VocalTrack[];
  beat: BeatData | null;
  loopSettings?: LoopSettings;
  currentTime?: number;
  beatVolume?: number;
  beatFX?: BeatFX;
  isBeatMuted?: boolean;
} | null> {
  try {
    const text = await file.text();
    const data: RGODBeatExportFile = JSON.parse(text);

    if (data.format !== 'RGODBEAT_PROJECT_V1' || !data.sessionData) {
      throw new Error('El archivo seleccionado no es un proyecto RGODBEAT válido (.rgodbeat).');
    }

    const s = data.sessionData;

    // 1. Reconstruct beat AudioBuffer
    let restoredBeat: BeatData | null = null;
    if (s.beatData && s.beatData.audioWavBase64) {
      try {
        const rawBuf = base64ToArrayBuffer(s.beatData.audioWavBase64);
        const decoded = await audioCtx.decodeAudioData(rawBuf);
        restoredBeat = {
          id: s.beatData.id,
          catalogBeatId: getCatalogBeatId(s.beatData.id, s.beatData.catalogBeatId),
          title: s.beatData.title,
          producer: s.beatData.producer || 'Custom Beat',
          genre: s.beatData.genre,
          bpm: s.beatData.bpm,
          key: s.beatData.key,
          scale: s.beatData.scale,
          duration: decoded.duration,
          buffer: decoded,
          artworkGradient: s.beatData.artworkGradient || 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #4338ca 100%)',
          waveformSample: extractWaveformPeaks(decoded, WAVEFORM_SAMPLE_COUNT),
          isCustomUpload: Boolean(s.beatData.isCustomUpload),
          isLocked: true,
        };
      } catch (decErr) {
        throw decErr;
      }
    }

    if (s.beatData && !restoredBeat) {
      const available = availableBeats.find(beat => beat.id === s.beatData!.id && beat.buffer);
      if (!available) throw new Error('Este archivo antiguo no incluye el audio del beat. Carga ese mismo beat en tu biblioteca antes de abrirlo.');
      restoredBeat = { ...available, ...s.beatData, buffer: available.buffer };
    }

    // 2. Reconstruct tracks and clips
    const restoredTracks: VocalTrack[] = [];
    for (const t of s.tracks || []) {
      const restoredClips: VocalClip[] = [];
      let latestBuffer: AudioBuffer | null = null;
      let latestWaveform: number[] | undefined;

      for (const sc of t.clips || []) {
        if (!sc.audioWavBase64) throw new Error('Falta audio en el archivo de proyecto.');
        try {
          const rawBuf = base64ToArrayBuffer(sc.audioWavBase64);
          const decoded = await audioCtx.decodeAudioData(rawBuf);
          restoredClips.push({
            id: sc.id,
            name: sc.name || 'Toma',
            startBeatOffset: sc.startBeatOffset,
            duration: decoded.duration,
            waveformSample: extractWaveformPeaks(decoded, WAVEFORM_SAMPLE_COUNT),
            buffer: decoded,
            tunedBuffer: null,
            isLocked: sc.isLocked !== undefined ? Boolean(sc.isLocked) : true,
          });
          latestBuffer = decoded;
          latestWaveform = sc.waveformSample;
        } catch (cErr) {
          throw cErr;
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
        startBeatOffset: restoredClips[0]?.startBeatOffset || 0,
        duration: restoredClips.length > 0 ? Math.max(...restoredClips.map((c) => c.startBeatOffset + c.duration)) : 0,
        buffer: latestBuffer,
        waveformSample: latestWaveform,
        tunedBuffer: null,
        clips: restoredClips,
      });
    }

    // 3. Immediately persist imported project as current active session in device memory
    const saved = await saveStudioSession(restoredTracks, restoredBeat, s.loopSettings, s.currentTime, s.beatVolume, undefined, userIdentifier, { beatFX: s.beatFX, isBeatMuted: s.isBeatMuted }, projectId);
    if (!saved) throw new Error('No se pudo proteger el proyecto importado. El proyecto abierto se conserva.');
    await retireRecordingCheckpoints(getSessionStorageKey(userIdentifier));

    return {
      projectId,
      tracks: restoredTracks,
      beat: restoredBeat,
      loopSettings: s.loopSettings,
      currentTime: s.currentTime,
      beatVolume: s.beatVolume,
      beatFX: s.beatFX,
      isBeatMuted: s.isBeatMuted,
    };
  } catch (err) {
    console.error('importProjectFromDeviceFile failed:', err);
    throw err;
  }
}
