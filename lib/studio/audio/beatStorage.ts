import { BeatData } from '../types/audio';
import { audioBufferToWav } from './wavEncoder';

const DB_NAME = 'RGODBEAT_STUDIO_DB';
const DB_VERSION = 2;
const BEATS_STORE = 'saved_beats';
const SETTINGS_STORE = 'studio_settings';
const SESSIONS_STORE = 'studio_sessions';

export const MAX_SAVED_BEATS = 23;

export interface StoredBeatItem {
  id: string;
  title: string;
  producer?: string;
  bpm: number;
  key: string;
  scale: string;
  duration: number;
  audioData: ArrayBuffer;
  waveformSample?: number[];
  artworkGradient: string;
  isCustomUpload: boolean;
  detectedBpm?: number;
  detectedKey?: string;
  detectedConfidence?: number;
  timestamp: number;
  isLocked?: boolean;
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
      console.error('IndexedDB open error:', (event.target as IDBOpenDBRequest).error);
      reject((event.target as IDBOpenDBRequest).error);
    };
  });
}

/**
 * Saves or updates an uploaded beat in IndexedDB so it never disappears on refresh (up to 23 beats)
 */
export async function saveBeatToDatabase(
  beat: BeatData,
  rawAudioBuffer?: ArrayBuffer,
  isLocked?: boolean
): Promise<boolean> {
  try {
    const db = await getDB();
    
    // Check current count and whether this beat is already in storage
    const countReq = await new Promise<number>((resolve) => {
      const tx = db.transaction([BEATS_STORE], 'readonly');
      const store = tx.objectStore(BEATS_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });

    const alreadyStored = await new Promise<boolean>((resolve) => {
      const tx = db.transaction([BEATS_STORE], 'readonly');
      const store = tx.objectStore(BEATS_STORE);
      const req = store.get(beat.id);
      req.onsuccess = () => resolve(!!req.result);
      req.onerror = () => resolve(false);
    });

    if (!alreadyStored && countReq >= MAX_SAVED_BEATS) {
      console.warn(`Límite máximo de ${MAX_SAVED_BEATS} beats alcanzado.`);
      return false;
    }

    let audioData: ArrayBuffer;

    if (rawAudioBuffer && rawAudioBuffer.byteLength > 0) {
      audioData = rawAudioBuffer;
    } else if (beat.buffer) {
      // Fallback: encode AudioBuffer to WAV ArrayBuffer
      const wavBlob = audioBufferToWav(beat.buffer);
      audioData = await wavBlob.arrayBuffer();
    } else {
      console.warn('Cannot save beat without audio data');
      return false;
    }

    const item: StoredBeatItem = {
      id: beat.id,
      title: beat.title,
      producer: beat.producer || 'Custom Beat',
      bpm: beat.bpm,
      key: beat.key,
      scale: beat.scale,
      duration: beat.duration,
      audioData,
      waveformSample: beat.waveformSample,
      artworkGradient: beat.artworkGradient,
      isCustomUpload: true,
      detectedBpm: beat.detectedBpm,
      detectedKey: beat.detectedKey,
      detectedConfidence: beat.detectedConfidence,
      timestamp: Date.now(),
      isLocked: isLocked ?? beat.isLocked ?? true, // Default to locked so it stays
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BEATS_STORE], 'readwrite');
      const store = transaction.objectStore(BEATS_STORE);
      const req = store.put(item);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Save as active beat
    await saveActiveBeatId(beat.id, item.isLocked);
    return true;
  } catch (err) {
    console.error('Failed to save beat to IndexedDB:', err);
    return false;
  }
}

/**
 * Retrieves all saved custom beats decoded into AudioBuffers for playback
 */
export async function getAllSavedBeats(audioCtx: AudioContext): Promise<BeatData[]> {
  try {
    const db = await getDB();
    const items = await new Promise<StoredBeatItem[]>((resolve, reject) => {
      const transaction = db.transaction([BEATS_STORE], 'readonly');
      const store = transaction.objectStore(BEATS_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const beats: BeatData[] = [];

    for (const item of items) {
      try {
        // audioCtx.decodeAudioData mutates/detaches the ArrayBuffer, so pass a clone
        const arrayBufferCopy = item.audioData.slice(0);
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBufferCopy);

        beats.push({
          id: item.id,
          title: item.title,
          producer: item.producer,
          bpm: item.bpm,
          key: item.key,
          scale: item.scale,
          duration: decodedBuffer.duration,
          buffer: decodedBuffer,
          artworkGradient: item.artworkGradient,
          waveformSample: item.waveformSample,
          isCustomUpload: true,
          detectedBpm: item.detectedBpm,
          detectedKey: item.detectedKey,
          detectedConfidence: item.detectedConfidence,
          isLocked: item.isLocked,
        });
      } catch (decodeErr) {
        console.warn(`Failed to decode saved beat "${item.title}":`, decodeErr);
      }
    }

    // Sort by timestamp descending (newest first)
    return beats;
  } catch (err) {
    console.error('Failed to retrieve beats from IndexedDB:', err);
    return [];
  }
}

/**
 * Removes a saved beat from IndexedDB
 */
export async function deleteSavedBeat(beatId: string): Promise<void> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BEATS_STORE], 'readwrite');
      const store = transaction.objectStore(BEATS_STORE);
      const req = store.delete(beatId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('Failed to delete beat from IndexedDB:', err);
  }
}

/**
 * Persists the active beat selection and lock state (dual layer: localStorage + IndexedDB)
 */
export async function saveActiveBeatId(beatId: string | null, isLocked: boolean = false): Promise<void> {
  try {
    if (beatId) {
      localStorage.setItem('rgodbeat_active_beat_id', beatId);
      localStorage.setItem('rgodbeat_is_locked', isLocked ? '1' : '0');
    }
  } catch {
    // ignore
  }

  try {
    const db = await getDB();
    const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
    const store = transaction.objectStore(SETTINGS_STORE);
    store.put({ key: 'active_beat_id', value: beatId });
    store.put({ key: 'beat_locked', value: isLocked });
  } catch (e) {
    console.warn('Could not save active beat settings to IndexedDB:', e);
  }
}

export async function getActiveBeatSettings(): Promise<{ activeBeatId: string | null; isLocked: boolean }> {
  let localBeatId: string | null = null;
  let localLocked: boolean = false;
  try {
    localBeatId = localStorage.getItem('rgodbeat_active_beat_id');
    localLocked = localStorage.getItem('rgodbeat_is_locked') === '1';
  } catch {
    // ignore
  }

  try {
    const db = await getDB();
    const [beatIdVal, lockedVal] = await Promise.all([
      new Promise<string | null>((resolve) => {
        const tx = db.transaction([SETTINGS_STORE], 'readonly');
        const req = tx.objectStore(SETTINGS_STORE).get('active_beat_id');
        req.onsuccess = () => resolve(req.result ? req.result.value : null);
        req.onerror = () => resolve(null);
      }),
      new Promise<boolean>((resolve) => {
        const tx = db.transaction([SETTINGS_STORE], 'readonly');
        const req = tx.objectStore(SETTINGS_STORE).get('beat_locked');
        req.onsuccess = () => resolve(req.result ? !!req.result.value : false);
        req.onerror = () => resolve(false);
      }),
    ]);

    return {
      activeBeatId: localBeatId || beatIdVal,
      isLocked: localLocked || lockedVal,
    };
  } catch {
    return { activeBeatId: localBeatId, isLocked: localLocked };
  }
}
