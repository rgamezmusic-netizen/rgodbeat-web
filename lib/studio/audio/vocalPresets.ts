import type { VocalFX, VocalPresetId } from '../types/audio';

export interface VocalFXPreset {
  id: VocalPresetId;
  label: string;
  badge: string;
  role: 'Principal' | 'Efecto';
  summary: string;
  fx: Omit<VocalFX, 'tune' | 'presetId'>;
}

/**
 * Five essential studio vocal presets:
 * 2 main lead presets + 3 creative FX presets (including band-passed Radio).
 */
export const VOCAL_FX_PRESETS: readonly VocalFXPreset[] = [
  {
    id: 'lead_pro',
    label: 'Voz Pro',
    badge: 'PRO',
    role: 'Principal',
    summary: 'Firme, limpia y al frente',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 105,
        highCut: false,
        highCutFreq: 18000,
        low: -1.5,
        mid: 2.0,
        high: 3.0,
      },
      comp: { amount: 0.65 },
      saturation: { amount: 0.22 },
      delay: { division: '1/8', mix: 0.12, feedback: 0.20 },
      reverb: { preset: 'PLATE', mix: 0.18 },
    },
  },
  {
    id: 'urban_air',
    label: 'Brillo Urbano',
    badge: 'URBANO',
    role: 'Principal',
    summary: 'Aire cristalino y pegada',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 120,
        highCut: false,
        highCutFreq: 18000,
        low: -2.0,
        mid: 2.5,
        high: 5.0,
      },
      comp: { amount: 0.80 },
      saturation: { amount: 0.30 },
      delay: { division: '1/4', mix: 0.18, feedback: 0.28 },
      reverb: { preset: 'PLATE', mix: 0.24 },
    },
  },
  {
    id: 'radio',
    label: 'Radio',
    badge: 'RADIO',
    role: 'Efecto',
    summary: 'Filtro teléfono 480–3.1k Hz',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 480,
        highCut: true,
        highCutFreq: 3100,
        low: -6.0,
        mid: 6.5,
        high: -5.0,
      },
      comp: { amount: 0.85 },
      saturation: { amount: 0.72 },
      delay: { division: 'SLAP', mix: 0.14, feedback: 0.08 },
      reverb: { preset: 'ROOM', mix: 0.12 },
    },
  },
  {
    id: 'space_hall',
    label: 'Espacio Hall',
    badge: 'HALL',
    role: 'Efecto',
    summary: 'Reverb amplia + eco 1/4',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 140,
        highCut: false,
        highCutFreq: 18000,
        low: -3.0,
        mid: 1.0,
        high: 3.5,
      },
      comp: { amount: 0.55 },
      saturation: { amount: 0.28 },
      delay: { division: '1/4', mix: 0.38, feedback: 0.42 },
      reverb: { preset: 'HALL', mix: 0.48 },
    },
  },
  {
    id: 'slap_tape',
    label: 'Slap Cinta',
    badge: 'SLAP',
    role: 'Efecto',
    summary: 'Rebote corto y calor analógico',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 110,
        highCut: true,
        highCutFreq: 9500,
        low: 2.0,
        mid: 2.5,
        high: -1.5,
      },
      comp: { amount: 0.72 },
      saturation: { amount: 0.55 },
      delay: { division: 'SLAP', mix: 0.28, feedback: 0.12 },
      reverb: { preset: 'ROOM', mix: 0.16 },
    },
  },
];

export function getVocalPresetById(presetId?: string | null): VocalFXPreset | undefined {
  if (!presetId) return undefined;
  return VOCAL_FX_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * Applies a vocal preset while preserving the track's pitch-correction key and scale.
 */
export function applyVocalPreset(prevFX: VocalFX, presetId: VocalPresetId): VocalFX {
  const preset = getVocalPresetById(presetId);
  if (!preset) return prevFX;

  return {
    presetId: preset.id,
    tune: {
      enabled: prevFX.tune?.enabled ?? false,
      speed: prevFX.tune?.speed ?? 0,
      rootKey: prevFX.tune?.rootKey ?? 'A',
      scaleMode: prevFX.tune?.scaleMode ?? 'minor',
      humanize: prevFX.tune?.humanize ?? 0.1,
      tonalityId: prevFX.tune?.tonalityId,
    },
    eq: { ...preset.fx.eq },
    comp: { ...preset.fx.comp },
    saturation: { ...preset.fx.saturation },
    delay: { ...preset.fx.delay },
    reverb: { ...preset.fx.reverb },
  };
}

/**
 * Clears an active preset back to neutral studio settings while keeping Auto-Tune state.
 */
export function resetVocalFXToNatural(prevFX: VocalFX): VocalFX {
  return {
    presetId: undefined,
    tune: {
      enabled: prevFX.tune?.enabled ?? false,
      speed: prevFX.tune?.speed ?? 0,
      rootKey: prevFX.tune?.rootKey ?? 'A',
      scaleMode: prevFX.tune?.scaleMode ?? 'minor',
      humanize: prevFX.tune?.humanize ?? 0.1,
      tonalityId: prevFX.tune?.tonalityId,
    },
    eq: {
      lowCut: true,
      lowCutFreq: 100,
      highCut: false,
      highCutFreq: 18000,
      low: 0,
      mid: 0,
      high: 0,
    },
    comp: { amount: 0.35 },
    saturation: { amount: 0.15 },
    delay: { division: 'OFF', mix: 0.25, feedback: 0.35 },
    reverb: { preset: 'PLATE', mix: 0.2 },
  };
}

