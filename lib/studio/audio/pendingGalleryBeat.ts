import type { Beat } from '@/types';
import { getPublicPreviewPath, getPublicStorageUrl } from '@/lib/storage/public';

export interface PendingGalleryBeat {
  id: string;
  title: string;
  bpm: number;
  key: string;
  genre?: string;
  coverUrl?: string;
  previewUrl?: string | null;
}

const PENDING_GALLERY_BEAT_KEY = 'rgodbeat_pending_gallery_beat';
let memoryPendingBeat: PendingGalleryBeat | null = null;

export function rememberPendingGalleryBeat(beat: Beat): void {
  const coverUrl =
    beat.cover && (beat.cover.startsWith('http://') || beat.cover.startsWith('https://') || beat.cover.startsWith('/'))
      ? beat.cover
      : undefined;
  const previewUrl = beat.previewAudioUrl || getPublicStorageUrl(getPublicPreviewPath(beat.id));
  const payload: PendingGalleryBeat = {
    id: beat.id,
    title: beat.title,
    bpm: beat.bpm || 140,
    key: beat.key || 'C minor',
    genre: beat.genre,
    coverUrl,
    previewUrl,
  };
  memoryPendingBeat = payload;
  try {
    sessionStorage.setItem(PENDING_GALLERY_BEAT_KEY, JSON.stringify(payload));
  } catch {
    /* Storage may be restricted. */
  }
}

export function consumePendingGalleryBeat(): PendingGalleryBeat | null {
  let result = memoryPendingBeat;
  memoryPendingBeat = null;
  try {
    const raw = sessionStorage.getItem(PENDING_GALLERY_BEAT_KEY);
    sessionStorage.removeItem(PENDING_GALLERY_BEAT_KEY);
    if (!result && raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.id === 'string' && typeof parsed.title === 'string') {
        result = parsed as PendingGalleryBeat;
      }
    }
  } catch {
    /* Storage may be restricted. */
  }
  return result;
}

