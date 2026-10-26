import { BeatData, BeatSummary } from '../types/audio';
import { audioBufferToWav } from './wavEncoder';

const DB_NAME = 'RGODBEAT_STUDIO_DB';
const DB_VERSION = 2;
const BEATS_STORE = 'saved_beats';
const SETTINGS_STORE = 'studio_settings';
const SESSIONS_STORE = 'studio_sessions';
const SUMMARY_PREFIX = 'saved_beat_summary:';

export const MAX_SAVED_BEATS = 23;

export interface StoredBeatItem {
  id: string;
  title: string;
  producer?: string;
  genre?: string;
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

export function summarizeBeat(beat: BeatData): BeatSummary {
  const { buffer, ...summary } = beat;
  void buffer;
  return summary;
}

function summarizeStoredBeat(item: StoredBeatItem): BeatSummary {
  return {
    id: item.id, title: item.title, producer: item.producer, genre: item.genre,
    bpm: item.bpm, key: item.key, scale: item.scale, duration: item.duration,
    artworkGradient: item.artworkGradient, waveformSample: item.waveformSample,
    isCustomUpload: true, detectedBpm: item.detectedBpm, detectedKey: item.detectedKey,
    detectedConfidence: item.detectedConfidence, isLocked: item.isLocked, savedTimestamp: item.timestamp,
  };
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
      const database = dbInstance;
      const reset = () => { if (dbInstance === database) dbInstance = null; };
      database.onversionchange = () => { database.close(); reset(); };
      database.onclose = reset;
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
      genre: beat.genre,
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

    const saved = await new Promise<boolean>((resolve, reject) => {
      // Capacity check, audio and selection are atomic, also across tabs.
      const transaction = db.transaction([BEATS_STORE, SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(BEATS_STORE);
      let written = false;
      const count = store.count();
      const existing = store.getKey(beat.id);
      existing.onsuccess = () => {
        if (existing.result === undefined && count.result >= MAX_SAVED_BEATS) return;
        try {
          store.put(item);
          const settings = transaction.objectStore(SETTINGS_STORE);
          settings.put({ key: SUMMARY_PREFIX + beat.id, value: summarizeStoredBeat(item) });
          settings.put({ key: 'active_beat_id', value: beat.id });
          settings.put({ key: 'beat_locked', value: item.isLocked });
          written = true;
        } catch { transaction.abort(); }
      };
      transaction.oncomplete = () => resolve(written);
      transaction.onabort = () => reject(transaction.error ?? new DOMException('No se guardó el beat.', 'AbortError'));
    });
    if (saved) rememberActiveBeat(beat.id, Boolean(item.isLocked));
    return saved;
  } catch (err) {
    console.error('Failed to save beat to IndexedDB:', err);
    return false;
  }
}

/**
 * List small metadata records, without reading/decoding the library audio.
 * Old libraries are indexed one record at a time on their first read. This
 * adds metadata in the existing settings store; no schema/audio migration.
 */
export async function listSavedBeats(): Promise<BeatSummary[]> {
  const db = await getDB();
  const { keys, summaries } = await new Promise<{ keys: IDBValidKey[]; summaries: { value: BeatSummary }[] }>((resolve, reject) => {
    const tx = db.transaction([BEATS_STORE, SETTINGS_STORE], 'readonly');
    const keys = tx.objectStore(BEATS_STORE).getAllKeys();
    const summaries = tx.objectStore(SETTINGS_STORE).getAll(IDBKeyRange.bound(SUMMARY_PREFIX, SUMMARY_PREFIX + '\uffff'));
    tx.oncomplete = () => resolve({ keys: keys.result, summaries: summaries.result });
    tx.onabort = () => reject(tx.error ?? new DOMException('No se pudo leer la biblioteca.', 'AbortError'));
  });
  const byId = new Map(summaries.map(({ value }) => [value.id, value]));
  const result: BeatSummary[] = [];
  for (const key of keys) {
    const cached = byId.get(String(key));
    if (cached) { result.push(cached); continue; }
    // One encoded legacy record at a time, never all payloads or AudioBuffers.
    const summary = await new Promise<BeatSummary | null>((resolve, reject) => {
      const tx = db.transaction([BEATS_STORE, SETTINGS_STORE], 'readwrite');
      const read = tx.objectStore(BEATS_STORE).get(key);
      let summary: BeatSummary | null = null;
      let failure: unknown;
      read.onsuccess = () => {
        if (!read.result) return; // A concurrent deletion must not be resurrected.
        try {
          summary = summarizeStoredBeat(read.result);
          tx.objectStore(SETTINGS_STORE).put({ key: SUMMARY_PREFIX + String(key), value: summary });
        } catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(summary);
      tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('No se pudo preparar la biblioteca. Los audios se conservan.', 'AbortError'));
    });
    if (summary) result.push(summary);
  }
  return result;
}

/** Decode only an explicitly selected beat. IDB already returns a private copy. */
export async function loadSavedBeat(audioCtx: BaseAudioContext, id: string): Promise<BeatData | null> {
  const db = await getDB();
  const item = await new Promise<StoredBeatItem | undefined>((resolve, reject) => {
    const tx = db.transaction(BEATS_STORE, 'readonly');
    const request = tx.objectStore(BEATS_STORE).get(id);
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = () => reject(tx.error ?? new DOMException('No se pudo abrir el beat.', 'AbortError'));
  });
  if (!item) return null;
  const buffer = await audioCtx.decodeAudioData(item.audioData);
  return { ...summarizeStoredBeat(item), duration: buffer.duration, buffer };
}

/**
 * Removes a saved beat from IndexedDB
 */
export async function deleteSavedBeat(beatId: string): Promise<boolean> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([BEATS_STORE, SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(BEATS_STORE);
      store.delete(beatId);
      transaction.objectStore(SETTINGS_STORE).delete(SUMMARY_PREFIX + beatId);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new DOMException('No se eliminó el beat.', 'AbortError'));
    });
    return true;
  } catch (err) {
    console.error('Failed to delete beat from IndexedDB:', err);
    return false;
  }
}

/**
 * Persists the active beat selection and lock state (dual layer: localStorage + IndexedDB)
 */
function rememberActiveBeat(beatId: string | null, isLocked: boolean) {
  try {
    if (beatId) {
      localStorage.setItem('rgodbeat_active_beat_id', beatId);
      localStorage.setItem('rgodbeat_is_locked', isLocked ? '1' : '0');
    } else {
      localStorage.removeItem('rgodbeat_active_beat_id');
      localStorage.removeItem('rgodbeat_is_locked');
    }
  } catch {
    // ignore
  }
}

export async function saveActiveBeatId(beatId: string | null, isLocked: boolean = false): Promise<boolean> {
  try {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([SETTINGS_STORE], 'readwrite');
      const store = transaction.objectStore(SETTINGS_STORE);
      store.put({ key: 'active_beat_id', value: beatId });
      store.put({ key: 'beat_locked', value: isLocked });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new DOMException('No se guardó la selección.', 'AbortError'));
    });
    rememberActiveBeat(beatId, isLocked);
    return true;
  } catch (e) {
    console.warn('Could not save active beat settings to IndexedDB:', e);
    return false;
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
