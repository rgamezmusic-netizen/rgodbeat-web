import type { VocalFX, VocalPresetId } from '../types/audio';

export type SaturationCharacterMode = 'tape' | 'glass' | 'radio';

export interface VocalPresetDspProfile {
  bandpassSlope24: boolean;
  mudFreqHz: number;
  mudGainDb: number;
  bodyFreqHz: number;
  bodyGainDb: number;
  intimacyFreqHz: number;
  intimacyQ: number;
  intimacyGainDb: number;
  presenceFreqHz: number;
  presenceQ: number;
  presenceGainDb: number;
  airFreqHz: number;
  airGainDb: number;
  saturationMode: SaturationCharacterMode;
  doublerMix: number;
  reverbPreDelaySec: number;
  outputMakeup: number;
}

export interface VocalFXPreset {
  id: VocalPresetId;
  label: string;
  badge: string;
  role: 'Principal' | 'Efecto';
  summary: string;
  /** Default channel FX parameter snapshot (excludes post-FX 3-band balance and tune). */
  fx: {
    eq: {
      lowCut: boolean;
      lowCutFreq: number;
      highCut: boolean;
      highCutFreq: number;
    };
    comp: { amount: number };
    saturation: { amount: number };
    delay: { division: VocalFX['delay']['division']; mix: number; feedback: number };
    reverb: { preset: VocalFX['reverb']['preset']; mix: number };
  };
  profile: VocalPresetDspProfile;
}

export const DEFAULT_VOCAL_DSP_PROFILE: VocalPresetDspProfile = {
  bandpassSlope24: false,
  mudFreqHz: 320,
  mudGainDb: -2.4,
  bodyFreqHz: 185,
  bodyGainDb: 0,
  intimacyFreqHz: 1550,
  intimacyQ: 0.9,
  intimacyGainDb: 1.6,
  presenceFreqHz: 3300,
  presenceQ: 1.0,
  presenceGainDb: 3.2,
  airFreqHz: 12000,
  airGainDb: 2.2,
  saturationMode: 'tape',
  doublerMix: 0,
  reverbPreDelaySec: 0.03,
  outputMakeup: 1.0,
};

/**
 * Five essential studio vocal presets with dedicated pre-balance DSP signatures:
 * 2 main vocal presets + 3 unmistakable creative FX textures.
 */
export const VOCAL_FX_PRESETS: readonly VocalFXPreset[] = [
  {
    id: 'lead_pro',
    label: 'Voz Pro',
    badge: 'PRO',
    role: 'Principal',
    summary: 'Firme, sedosa y al frente',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 95,
        highCut: false,
        highCutFreq: 19000,
      },
      comp: { amount: 0.65 },
      saturation: { amount: 0.24 },
      delay: { division: '1/8', mix: 0.1, feedback: 0.18 },
      reverb: { preset: 'PLATE', mix: 0.16 },
    },
    profile: {
      bandpassSlope24: false,
      mudFreqHz: 300,
      mudGainDb: -2.8,
      bodyFreqHz: 180,
      bodyGainDb: 1.4,
      intimacyFreqHz: 1550,
      intimacyQ: 0.9,
      intimacyGainDb: 2.0,
      presenceFreqHz: 3400,
      presenceQ: 1.0,
      presenceGainDb: 3.4,
      airFreqHz: 11000,
      airGainDb: 2.6,
      saturationMode: 'tape',
      doublerMix: 0.08,
      reverbPreDelaySec: 0.03,
      outputMakeup: 1.02,
    },
  },
  {
    id: 'urban_air',
    label: 'Brillo Urbano',
    badge: 'URBANO',
    role: 'Principal',
    summary: 'Aire moderno y doble estéreo',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 120,
        highCut: false,
        highCutFreq: 19000,
      },
      comp: { amount: 0.82 },
      saturation: { amount: 0.32 },
      delay: { division: '1/4', mix: 0.18, feedback: 0.28 },
      reverb: { preset: 'PLATE', mix: 0.24 },
    },
    profile: {
      bandpassSlope24: false,
      mudFreqHz: 330,
      mudGainDb: -3.2,
      bodyFreqHz: 200,
      bodyGainDb: -0.8,
      intimacyFreqHz: 1700,
      intimacyQ: 0.9,
      intimacyGainDb: 1.2,
      presenceFreqHz: 4200,
      presenceQ: 0.95,
      presenceGainDb: 4.5,
      airFreqHz: 10500,
      airGainDb: 5.2,
      saturationMode: 'glass',
      doublerMix: 0.24,
      reverbPreDelaySec: 0.032,
      outputMakeup: 1.04,
    },
  },
  {
    id: 'radio',
    label: 'Radio',
    badge: 'RADIO',
    role: 'Efecto',
    summary: 'AM / teléfono 520–2.9k Hz + drive',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 520,
        highCut: true,
        highCutFreq: 2900,
      },
      comp: { amount: 0.9 },
      saturation: { amount: 0.78 },
      delay: { division: 'SLAP', mix: 0.14, feedback: 0.08 },
      reverb: { preset: 'ROOM', mix: 0.12 },
    },
    profile: {
      bandpassSlope24: true,
      mudFreqHz: 700,
      mudGainDb: -3.0,
      bodyFreqHz: 240,
      bodyGainDb: -2.0,
      intimacyFreqHz: 1480,
      intimacyQ: 1.5,
      intimacyGainDb: 7.5,
      presenceFreqHz: 2350,
      presenceQ: 1.2,
      presenceGainDb: 3.5,
      airFreqHz: 12000,
      airGainDb: 0,
      saturationMode: 'radio',
      doublerMix: 0,
      reverbPreDelaySec: 0.014,
      outputMakeup: 1.28,
    },
  },
  {
    id: 'space_hall',
    label: 'Espacio Hall',
    badge: 'HALL',
    role: 'Efecto',
    summary: 'Hall ancho + coro estéreo + eco',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 150,
        highCut: false,
        highCutFreq: 19000,
      },
      comp: { amount: 0.58 },
      saturation: { amount: 0.28 },
      delay: { division: '1/4', mix: 0.38, feedback: 0.44 },
      reverb: { preset: 'HALL', mix: 0.5 },
    },
    profile: {
      bandpassSlope24: false,
      mudFreqHz: 380,
      mudGainDb: -2.8,
      bodyFreqHz: 2200,
      bodyGainDb: -1.8,
      intimacyFreqHz: 1450,
      intimacyQ: 0.8,
      intimacyGainDb: 0.5,
      presenceFreqHz: 3600,
      presenceQ: 0.95,
      presenceGainDb: 2.2,
      airFreqHz: 11000,
      airGainDb: 3.8,
      saturationMode: 'tape',
      doublerMix: 0.36,
      reverbPreDelaySec: 0.038,
      outputMakeup: 1.0,
    },
  },
  {
    id: 'slap_tape',
    label: 'Slap Cinta',
    badge: 'SLAP',
    role: 'Efecto',
    summary: 'Saturación cálida + slapback clásico',
    fx: {
      eq: {
        lowCut: true,
        lowCutFreq: 110,
        highCut: true,
        highCutFreq: 8800,
      },
      comp: { amount: 0.74 },
      saturation: { amount: 0.72 },
      delay: { division: 'SLAP', mix: 0.32, feedback: 0.14 },
      reverb: { preset: 'ROOM', mix: 0.18 },
    },
    profile: {
      bandpassSlope24: false,
      mudFreqHz: 350,
      mudGainDb: -2.0,
      bodyFreqHz: 190,
      bodyGainDb: 2.8,
      intimacyFreqHz: 1800,
      intimacyQ: 1.0,
      intimacyGainDb: 3.0,
      presenceFreqHz: 3200,
      presenceQ: 1.0,
      presenceGainDb: 2.0,
      airFreqHz: 8500,
      airGainDb: -2.5,
      saturationMode: 'tape',
      doublerMix: 0.14,
      reverbPreDelaySec: 0.02,
      outputMakeup: 1.06,
    },
  },
];

export function getVocalPresetById(presetId?: string | null): VocalFXPreset | undefined {
  if (!presetId) return undefined;
  return VOCAL_FX_PRESETS.find((preset) => preset.id === presetId);
}

/**
 * Generates preset-specific WaveShaper transfer curves with strict zero DC offset at silence.
 */
export function makeVocalSaturationCurve(
  amount: number,
  mode: SaturationCharacterMode = 'tape'
): Float32Array<ArrayBuffer> {
  const safeAmount = Math.max(0, Math.min(1, amount));
  const n = 4097; // Odd length places exact x=0 at index (n-1)/2
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const deg = Math.PI / 180;

  if (mode === 'radio') {
    // Asymmetric transmitter diode clipping: generates rich 2nd + odd AM radio grit while f(0) === 0
    const k = 2.5 + safeAmount * 28;
    const normPos = Math.tanh((1 + 0.18) * (1 + k * 0.18)) - Math.tanh(0.18 * (1 + k * 0.18));
    const normNeg = Math.tanh((1 - 0.18) * (1 + k * 0.14)) + Math.tanh(0.18 * (1 + k * 0.14));
    const bias = 0.18;
    const baseZero = Math.tanh(bias * (1 + k * 0.18));
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      if (Math.abs(x) < 1e-7) {
        curve[i] = 0;
      } else if (x > 0) {
        curve[i] = (Math.tanh((x + bias) * (1 + k * 0.18)) - baseZero) / Math.max(0.01, normPos);
      } else {
        const negZero = Math.tanh(bias * (1 + k * 0.14));
        curve[i] = (Math.tanh((x + bias) * (1 + k * 0.14)) - negZero) / Math.max(0.01, normNeg);
      }
    }
    return curve;
  }

  if (mode === 'glass') {
    // Modern crystalline soft-saturator: clean upper-mid harmonic sheen without low-mid congestion
    const drive = 1.0 + safeAmount * 3.8;
    const norm = Math.tanh(drive);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / (n - 1) - 1;
      const evenSparkle = 0.06 * safeAmount * (x * x * Math.sign(x));
      curve[i] = Math.max(-1, Math.min(1, Math.tanh(x * drive) / norm + evenSparkle));
    }
    return curve;
  }

  // 'tape': Smooth hyperbolic analog tape warmth
  const k = 0.15 + safeAmount * 18;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

/**
 * Resolves the upstream preset DSP profile for playback and export.
 */
export function getVocalPresetProfile(fx: VocalFX): VocalPresetDspProfile {
  const preset = getVocalPresetById(fx.presetId);
  if (preset) return preset.profile;

  // Preserve transparent custom fallback, guarding against air boost when manual highCut is narrow
  const isNarrowBand = Boolean(fx.eq.highCut) && (fx.eq.highCutFreq || 3100) <= 5000;
  return {
    ...DEFAULT_VOCAL_DSP_PROFILE,
    airGainDb: isNarrowBand ? 0 : DEFAULT_VOCAL_DSP_PROFILE.airGainDb,
    saturationMode: isNarrowBand ? 'radio' : 'tape',
    reverbPreDelaySec: fx.reverb?.preset === 'ROOM' ? 0.018 : 0.03,
  };
}

/**
 * Applies a vocal preset while preserving BOTH pitch correction AND the post-FX 3-band voice balance.
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
    eq: {
      lowCut: preset.fx.eq.lowCut,
      lowCutFreq: preset.fx.eq.lowCutFreq,
      highCut: preset.fx.eq.highCut,
      highCutFreq: preset.fx.eq.highCutFreq,
      // Post-FX 3-band general voice balance remains untouched
      low: prevFX.eq?.low ?? 0,
      mid: prevFX.eq?.mid ?? 0,
      high: prevFX.eq?.high ?? 0,
    },
    comp: { ...preset.fx.comp },
    saturation: { ...preset.fx.saturation },
    delay: { ...preset.fx.delay },
    reverb: { ...preset.fx.reverb },
  };
}

/**
 * Clears an active preset back to neutral character while preserving Auto-Tune and 3-band balance.
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
      highCutFreq: 19000,
      low: prevFX.eq?.low ?? 0,
      mid: prevFX.eq?.mid ?? 0,
      high: prevFX.eq?.high ?? 0,
    },
    comp: { amount: 0.35 },
    saturation: { amount: 0.15 },
    delay: { division: 'OFF', mix: 0.25, feedback: 0.35 },
    reverb: { preset: 'PLATE', mix: 0.2 },
  };
}
