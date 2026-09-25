import { BeatData, MusicalKey, PopularTonalityId, VocalFX, VocalTrack, VocalTrackId } from '../types/audio';

const STORAGE_PREFIX = 'rgodbeat_user_channel_fx_';

/**
 * Persists the user's custom FX settings for a specific channel (Lead 1, Lead 2, etc.)
 * Remembers EQ, Compression, Reverb, Delay, Saturation, AutoTune speed & enabled status,
 * while leaving the musical key/scale independent so it automatically adapts to each beat.
 */
export function saveUserChannelFXTemplate(trackId: VocalTrackId, fx: VocalFX) {
  if (typeof window === 'undefined') return;
  try {
    const templateToSave = {
      tune: {
        enabled: Boolean(fx.tune?.enabled),
        speed: fx.tune?.speed ?? 0,
        humanize: fx.tune?.humanize ?? 0.1,
      },
      eq: { ...fx.eq },
      comp: { ...fx.comp },
      saturation: { ...fx.saturation },
      delay: { ...fx.delay },
      reverb: { ...fx.reverb },
    };
    localStorage.setItem(`${STORAGE_PREFIX}${trackId}`, JSON.stringify(templateToSave));
  } catch (err) {
    console.warn(`Error saving FX template for track ${trackId}:`, err);
  }
}

/**
 * Loads the user's custom FX template for a channel, injecting the active beat's tonality.
 */
export function loadUserChannelFXTemplate(
  trackId: VocalTrackId,
  currentBeat: BeatData | null,
  fallbackFX: VocalFX
): VocalFX {
  if (typeof window === 'undefined') return fallbackFX;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${trackId}`);
    if (!raw) return fallbackFX;
    const parsed = JSON.parse(raw);

    // Determine musical key from the current beat (or detected key)
    const rawKey = currentBeat?.detectedKey || currentBeat?.key || 'A';
    const beatKey = (rawKey.replace(/m|maj|min|minor|major/gi, '').trim() || 'A') as MusicalKey;
    const beatScale = (currentBeat?.scale || rawKey).toLowerCase().includes('maj')
      ? 'major'
      : 'minor';
    const tonalityId = fallbackFX.tune?.tonalityId || 'Am_C';

    return {
      tune: {
        enabled: parsed.tune?.enabled ?? fallbackFX.tune?.enabled ?? false,
        speed: parsed.tune?.speed ?? fallbackFX.tune?.speed ?? 0,
        humanize: parsed.tune?.humanize ?? fallbackFX.tune?.humanize ?? 0.1,
        tonalityId,
        rootKey: beatKey,
        scaleMode: beatScale as 'minor' | 'major',
      },
      eq: {
        lowCut: parsed.eq?.lowCut ?? fallbackFX.eq.lowCut,
        lowCutFreq: parsed.eq?.lowCutFreq ?? fallbackFX.eq.lowCutFreq,
        low: parsed.eq?.low ?? fallbackFX.eq.low,
        mid: parsed.eq?.mid ?? fallbackFX.eq.mid,
        high: parsed.eq?.high ?? fallbackFX.eq.high,
      },
      comp: {
        amount: parsed.comp?.amount ?? fallbackFX.comp.amount,
      },
      saturation: {
        amount: parsed.saturation?.amount ?? fallbackFX.saturation.amount,
      },
      delay: {
        division: parsed.delay?.division ?? fallbackFX.delay.division,
        mix: parsed.delay?.mix ?? fallbackFX.delay.mix,
        feedback: parsed.delay?.feedback ?? fallbackFX.delay.feedback,
      },
      reverb: {
        preset: parsed.reverb?.preset ?? fallbackFX.reverb.preset,
        mix: parsed.reverb?.mix ?? fallbackFX.reverb.mix,
      },
    };
  } catch (err) {
    console.warn(`Error loading FX template for track ${trackId}:`, err);
    return fallbackFX;
  }
}

/**
 * Applies saved channel FX templates across all vocal tracks for a new project or startup.
 */
export function applyUserFXTemplatesToTracks(
  tracks: VocalTrack[],
  currentBeat: BeatData | null
): VocalTrack[] {
  return tracks.map((track) => ({
    ...track,
    fx: loadUserChannelFXTemplate(track.id, currentBeat, track.fx),
  }));
}

/**
 * Updates only the musical tonality (key/scale) across all vocal tracks without changing
 * other FX (compressor, EQ, reverb, delay, autotune speed/humanize).
 */
export function adaptTracksTonalityToBeat(
  tracks: VocalTrack[],
  currentBeat: BeatData | null
): VocalTrack[] {
  if (!currentBeat) return tracks;
  const rawKey = currentBeat.detectedKey || currentBeat.key || 'A';
  const beatKey = (rawKey.replace(/m|maj|min|minor|major/gi, '').trim() || 'A') as MusicalKey;
  const beatScale = (currentBeat.scale || rawKey).toLowerCase().includes('maj')
    ? 'major'
    : 'minor';

  return tracks.map((track) => {
    if (!track.fx.tune) return track;
    const tonalityId = (track.fx.tune.tonalityId || 'auto_beat') as PopularTonalityId;
    return {
      ...track,
      fx: {
        ...track.fx,
        tune: {
          ...track.fx.tune,
          rootKey: beatKey,
          scaleMode: beatScale as 'minor' | 'major',
          tonalityId,
        },
      },
    };
  });
}

