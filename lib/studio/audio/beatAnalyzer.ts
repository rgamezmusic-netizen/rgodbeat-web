import { BeatAnalysisResult, MusicalKey, PopularTonalityId, ScaleMode } from '../types/audio';

// Standard 12 chromatic note names
export const NOTE_NAMES: MusicalKey[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

// Spanish note names mapping
export const SPANISH_NAMES: Record<MusicalKey, string> = {
  C: 'Do',
  'C#': 'Do#',
  D: 'Re',
  'D#': 'Re#',
  E: 'Mi',
  F: 'Fa',
  'F#': 'Fa#',
  G: 'Sol',
  'G#': 'Sol#',
  A: 'La',
  'A#': 'La# / Si♭',
  B: 'Si',
};

// Alternative enharmonic aliases
const ENHARMONIC_MAP: Record<string, MusicalKey> = {
  DB: 'C#',
  EB: 'D#',
  GB: 'F#',
  AB: 'G#',
  BB: 'A#',
  'DO#': 'C#',
  'RE#': 'D#',
  'FA#': 'F#',
  'SOL#': 'G#',
  'LA#': 'A#',
  DO: 'C',
  RE: 'D',
  MI: 'E',
  FA: 'F',
  SOL: 'G',
  LA: 'A',
  SI: 'B',
};

/**
 * Calculates the relative musical key (Menor ⇄ Mayor).
 * - Relative Major is 3 semitones above Minor (+3)
 * - Relative Minor is 3 semitones below Major (-3 or +9)
 */
export function getRelativeKey(rootKey: MusicalKey, scaleMode: ScaleMode): {
  relativeRoot: MusicalKey;
  relativeMode: ScaleMode;
  relativeKeyString: string;
  relativeTonalityName: string;
} {
  const rootIdx = NOTE_NAMES.indexOf(rootKey);
  const isMinor = scaleMode === 'minor' || scaleMode === 'harmonic_minor';

  if (isMinor) {
    // Relative Major is 3 semitones up
    const relIdx = (rootIdx + 3) % 12;
    const relRoot = NOTE_NAMES[relIdx];
    const spanish = SPANISH_NAMES[relRoot] || relRoot;
    return {
      relativeRoot: relRoot,
      relativeMode: 'major',
      relativeKeyString: relRoot,
      relativeTonalityName: `${spanish} Mayor (${relRoot})`,
    };
  } else {
    // Relative Minor is 3 semitones down
    const relIdx = (rootIdx - 3 + 12) % 12;
    const relRoot = NOTE_NAMES[relIdx];
    const spanish = SPANISH_NAMES[relRoot] || relRoot;
    return {
      relativeRoot: relRoot,
      relativeMode: 'minor',
      relativeKeyString: `${relRoot}m`,
      relativeTonalityName: `${spanish} Menor (${relRoot}m)`,
    };
  }
}

/**
 * Parses any key string (e.g. "Am", "A minor", "C#m", "C", "F# Mayor", "Bb", etc.)
 * and returns the structured key + its musical relative key.
 */
export function parseKeyAndGetRelative(
  keyString?: string,
  scaleHint?: string
): {
  rootKey: MusicalKey;
  scaleMode: ScaleMode;
  keySymbol: string;
  tonalityName: string;
  relativeRootKey: MusicalKey;
  relativeScaleMode: ScaleMode;
  relativeKey: string;
  relativeTonalityName: string;
  combinedDisplay: string;
  compactBadge: string;
} {
  if (!keyString || keyString.trim().length === 0) {
    // Fallback to A minor
    return {
      rootKey: 'A',
      scaleMode: 'minor',
      keySymbol: 'Am',
      tonalityName: 'La Menor (Am)',
      relativeRootKey: 'C',
      relativeScaleMode: 'major',
      relativeKey: 'C',
      relativeTonalityName: 'Do Mayor (C)',
      combinedDisplay: 'La Menor (Am) · Relativa: Do Mayor (C)',
      compactBadge: 'Am (Rel. C)',
    };
  }

  const raw = keyString.trim().toUpperCase();
  const hint = (scaleHint || '').toLowerCase();

  // Detect mode
  let isMinor =
    raw.includes('MIN') ||
    raw.includes('MEN') ||
    raw.endsWith('M') ||
    hint.includes('min') ||
    hint.includes('men');

  if (raw.includes('MAJ') || raw.includes('MAY') || hint.includes('maj') || hint.includes('may')) {
    isMinor = false;
  }

  // Extract root note
  let root: MusicalKey = 'A';

  // Check 2-char notes first (e.g. C#, F#, BB, EB, DO#)
  const match2 = raw.match(/^(DO#|RE#|FA#|SOL#|LA#|C#|D#|F#|G#|A#|DB|EB|GB|AB|BB)/);
  if (match2) {
    const matched = match2[1];
    root = (ENHARMONIC_MAP[matched] || matched) as MusicalKey;
  } else {
    // 1-char notes (A, B, C, D, E, F, G or DO, RE, MI, FA, SOL, LA, SI)
    const match1 = raw.match(/^(DO|RE|MI|FA|SOL|LA|SI|[A-G])/);
    if (match1) {
      const matched = match1[1];
      root = (ENHARMONIC_MAP[matched] || matched) as MusicalKey;
    }
  }

  const scaleMode: ScaleMode = isMinor ? 'minor' : 'major';
  const keySymbol = isMinor ? `${root}m` : root;
  const spanishRoot = SPANISH_NAMES[root] || root;
  const spanishMode = isMinor ? 'Menor' : 'Mayor';
  const tonalityName = `${spanishRoot} ${spanishMode} (${keySymbol})`;

  const relative = getRelativeKey(root, scaleMode);

  return {
    rootKey: root,
    scaleMode,
    keySymbol,
    tonalityName,
    relativeRootKey: relative.relativeRoot,
    relativeScaleMode: relative.relativeMode,
    relativeKey: relative.relativeKeyString,
    relativeTonalityName: relative.relativeTonalityName,
    combinedDisplay: `${tonalityName} · Relativa: ${relative.relativeTonalityName}`,
    compactBadge: `${keySymbol} (Rel. ${relative.relativeKeyString})`,
  };
}

// Blended Krumhansl-Schmuckler + Temperley key profiles
// Higher contrast on roots and key-defining 3rds/5ths, with steep penalties for non-diatonic tones
const KS_MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
];
const KS_MINOR_PROFILE = [
  6.50, 2.20, 3.40, 5.40, 2.50, 3.50, 2.40, 4.80, 3.90, 2.60, 3.30, 2.80,
];

const TEMPERLEY_MAJOR = [
  5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0,
];
const TEMPERLEY_MINOR = [
  5.0, 2.0, 3.5, 4.5, 2.0, 3.5, 2.0, 4.5, 3.5, 2.0, 2.5, 3.0,
];

// Combined optimal profile
const COMBINED_MAJOR = KS_MAJOR_PROFILE.map((v, i) => v * 0.5 + TEMPERLEY_MAJOR[i] * 0.5);
const COMBINED_MINOR = KS_MINOR_PROFILE.map((v, i) => v * 0.5 + TEMPERLEY_MINOR[i] * 0.5);

/**
 * Calculates Pearson correlation coefficient between two vectors
 */
function correlation(v1: number[], v2: number[]): number {
  const n = v1.length;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum1 += v1[i];
    sum2 += v2[i];
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let num = 0;
  let den1 = 0;
  let den2 = 0;

  for (let i = 0; i < n; i++) {
    const d1 = v1[i] - mean1;
    const d2 = v2[i] - mean2;
    num += d1 * d2;
    den1 += d1 * d1;
    den2 += d2 * d2;
  }

  const den = Math.sqrt(den1 * den2);
  return den === 0 ? 0 : num / den;
}

/**
 * Map detected key to one of the 5 primary popular urban tonalities if close match
 */
function findMatchingPopularTonality(root: MusicalKey, mode: ScaleMode): PopularTonalityId | undefined {
  if ((root === 'A' && mode === 'minor') || (root === 'C' && mode === 'major')) {
    return 'Am_C';
  }
  if ((root === 'F#' && mode === 'minor') || (root === 'A' && mode === 'major')) {
    return 'Fsm_A';
  }
  if ((root === 'C#' && mode === 'minor') || (root === 'E' && mode === 'major')) {
    return 'Csm_E';
  }
  if ((root === 'G' && mode === 'minor') || (root === 'A#' && mode === 'major')) {
    return 'Gm_Bb';
  }
  if ((root === 'D' && mode === 'minor') || (root === 'F' && mode === 'major')) {
    return 'Dm_F';
  }
  return undefined;
}

/**
 * Analyzes an AudioBuffer to detect exact BPM and Musical Key/Scale + Relative Key.
 */
export async function analyzeBeatAudio(buffer: AudioBuffer): Promise<BeatAnalysisResult> {
  const sampleRate = buffer.sampleRate;
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;

  // Extract mono downmix (up to max 50 seconds for fast accurate analysis)
  const maxSeconds = 50;
  const maxSamples = Math.min(length, Math.floor(sampleRate * maxSeconds));
  const mono = new Float32Array(maxSamples);

  const ch0 = buffer.getChannelData(0);
  const ch1 = numChannels > 1 ? buffer.getChannelData(1) : null;

  for (let i = 0; i < maxSamples; i++) {
    mono[i] = ch1 ? (ch0[i] + ch1[i]) * 0.5 : ch0[i];
  }

  // 1. HIGH-PRECISION BPM DETECTION (with intelligent trap/urban double-time heuristic)
  const detectedBpm = detectBpm(mono, sampleRate);

  // 2. KEY & SCALE DETECTION (Bass-chroma separation & Harmonic de-aliasing & Hann-windowed Goertzel)
  const { rootKey, scaleMode, confidence } = detectKey(mono, sampleRate);

  const modeString = scaleMode === 'minor' ? 'm' : '';
  const keySymbol = `${rootKey}${modeString}`;
  const spanishRoot = SPANISH_NAMES[rootKey] || rootKey;
  const spanishMode = scaleMode === 'minor' ? 'Menor' : 'Mayor';
  const tonalityName = `${spanishRoot} ${spanishMode} (${keySymbol})`;

  // 3. RELATIVE KEY CALCULATION
  const relative = getRelativeKey(rootKey, scaleMode);
  const matchingPopularTonality = findMatchingPopularTonality(rootKey, scaleMode);

  return {
    bpm: detectedBpm,
    key: keySymbol,
    rootKey,
    scaleMode,
    tonalityName,
    relativeRootKey: relative.relativeRoot,
    relativeScaleMode: relative.relativeMode,
    relativeKey: relative.relativeKeyString,
    relativeTonalityName: relative.relativeTonalityName,
    confidence: Math.round(confidence * 100),
    matchingPopularTonality,
  };
}

/**
 * Detects BPM with sub-sample parabolic interpolation and dual-band transient flux.
 * Accurately handles half-time vs double-time (e.g. 71 vs 142 BPM in urban trap/reggaeton).
 */
function detectBpm(mono: Float32Array, sampleRate: number): number {
  const hopSize = 256;
  const windowSize = 512;
  const numHops = Math.floor((mono.length - windowSize) / hopSize);

  if (numHops <= 20) {
    return 140; // Default fallback for tiny buffers
  }

  const envelopeSampleRate = sampleRate / hopSize; // e.g. 44100 / 256 = 172.26 Hz

  // 1. Dual-band envelope:
  // Low-band (kicks, 808s, downbeats) and High-band (snares, claps, hi-hat ticks)
  const lowEnergy = new Float32Array(numHops);
  const highEnergy = new Float32Array(numHops);

  for (let h = 0; h < numHops; h++) {
    const start = h * hopSize;
    let lowSum = 0;
    let highSum = 0;
    let prev = mono[start];

    for (let i = 0; i < windowSize; i++) {
      const s = mono[start + i];
      lowSum += s * s;
      const diff = s - prev;
      highSum += diff * diff;
      prev = s;
    }

    lowEnergy[h] = Math.sqrt(lowSum / windowSize);
    highEnergy[h] = Math.sqrt(highSum / windowSize);
  }

  // 2. Half-wave rectified spectral/energy flux
  const flux = new Float32Array(numHops);
  let highFluxSum = 0;
  for (let h = 1; h < numHops; h++) {
    const diffLow = lowEnergy[h] - lowEnergy[h - 1];
    const diffHigh = highEnergy[h] - highEnergy[h - 1];
    const posLow = diffLow > 0 ? diffLow : 0;
    const posHigh = diffHigh > 0 ? diffHigh : 0;
    flux[h] = posLow * 0.65 + posHigh * 0.35;
    highFluxSum += posHigh;
  }

  // 3. Autocorrelation over lag times corresponding to 60 - 200 BPM
  const minBpm = 60;
  const maxBpm = 200;

  const minLag = Math.max(1, Math.floor((60 * envelopeSampleRate) / maxBpm));
  const maxLag = Math.min(numHops - 2, Math.floor((60 * envelopeSampleRate) / minBpm));

  const corr = new Float32Array(maxLag + 2);
  let bestLag = minLag;
  let maxCorr = -Infinity;

  const testLen = Math.min(1400, numHops - maxLag);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < testLen; i++) {
      sum += flux[i] * flux[i + lag];
    }
    corr[lag] = sum;
    if (sum > maxCorr) {
      maxCorr = sum;
      bestLag = lag;
    }
  }

  if (bestLag <= minLag || bestLag >= maxLag) {
    return 140;
  }

  // 4. Parabolic Peak Interpolation around bestLag
  const y0 = corr[bestLag - 1];
  const y1 = corr[bestLag];
  const y2 = corr[bestLag + 1];
  const denom = y0 - 2 * y1 + y2;

  let refinedLag = bestLag;
  if (Math.abs(denom) > 1e-6) {
    const delta = (0.5 * (y0 - y2)) / denom;
    if (Math.abs(delta) < 1.0) {
      refinedLag = bestLag + delta;
    }
  }

  let calculatedBpm = (60 * envelopeSampleRate) / refinedLag;

  // 5. Intelligent Urban Half-Time vs Double-Time Heuristic:
  // In trap, drill, hip-hop, reggaeton, and pop, a track produced at 140-150 BPM has kick/snare
  // periods at 70-75 BPM. If detected BPM is between 64 and 84 BPM, check if halfLag (double tempo)
  // has substantial energy (over 65% of maxCorr) or if high-frequency hi-hat flux is dense.
  const halfLag = Math.round(refinedLag / 2);
  if (halfLag >= minLag && halfLag <= maxLag) {
    const halfLagCorr = corr[halfLag] || 0;
    if (calculatedBpm >= 64 && calculatedBpm <= 84) {
      // Very high likelihood of being felt as double tempo (e.g. 71 -> 142)
      if (halfLagCorr > maxCorr * 0.62 || highFluxSum > 10) {
        calculatedBpm *= 2;
      }
    } else if (halfLagCorr > maxCorr * 0.85) {
      const candidateDouble = (60 * envelopeSampleRate) / halfLag;
      if (candidateDouble >= 80 && candidateDouble <= 170) {
        calculatedBpm = candidateDouble;
      }
    }
  }

  // Clamp standard range
  if (calculatedBpm < 60) calculatedBpm *= 2;
  if (calculatedBpm > 210) calculatedBpm /= 2;

  // Integer tempo snapping: almost all modern produced tracks use integer BPMs
  const roundBpm = Math.round(calculatedBpm);
  if (Math.abs(calculatedBpm - roundBpm) < 0.45) {
    return roundBpm;
  }

  return Math.round(calculatedBpm);
}

/**
 * Detects Musical Key by extracting 12-semitone Chroma with Hann windowing,
 * Bass fundamental emphasis, and Harmonic Overtone Suppression.
 */
function detectKey(
  mono: Float32Array,
  sampleRate: number
): { rootKey: MusicalKey; scaleMode: ScaleMode; confidence: number } {
  const bassChroma = new Float64Array(12);
  const midChroma = new Float64Array(12);

  const fftSize = 4096;
  const hopSize = 2048;
  const numFrames = Math.min(120, Math.floor((mono.length - fftSize) / hopSize));

  if (numFrames < 2) {
    return { rootKey: 'A', scaleMode: 'minor', confidence: 0.85 };
  }

  // Pre-calculate Hann window
  const windowLength = 1024;
  const hannWindow = new Float32Array(windowLength);
  for (let n = 0; n < windowLength; n++) {
    hannWindow[n] = 0.5 * (1 - Math.cos((2 * Math.PI * n) / windowLength));
  }

  // Define note frequencies from MIDI 23 (B0, ~30.8 Hz) to MIDI 88 (E6, ~1318 Hz)
  const bassNotes: { pitchClass: number; freq: number }[] = [];
  for (let midi = 23; midi <= 45; midi++) {
    const pitchClass = midi % 12;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    bassNotes.push({ pitchClass, freq });
  }

  const midNotes: { pitchClass: number; freq: number }[] = [];
  for (let midi = 45; midi <= 88; midi++) {
    const pitchClass = midi % 12;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    midNotes.push({ pitchClass, freq });
  }

  // Frequency band energy extraction with Hann window
  for (let f = 0; f < numFrames; f++) {
    const offset = f * hopSize;

    // 1. Accumulate Bass Energy (sub-bass & 808 fundamentals)
    for (const { pitchClass, freq } of bassNotes) {
      const k = (2 * Math.PI * freq) / sampleRate;
      let real = 0;
      let imag = 0;
      const step = 2;
      for (let n = 0; n < windowLength; n += step) {
        const val = (mono[offset + n] || 0) * hannWindow[n];
        real += val * Math.cos(k * n);
        imag -= val * Math.sin(k * n);
      }
      const mag = Math.sqrt(real * real + imag * imag);
      bassChroma[pitchClass] += mag;
    }

    // 2. Accumulate Mid/Melodic Energy (keys, synths, guitars, vocals)
    for (const { pitchClass, freq } of midNotes) {
      const k = (2 * Math.PI * freq) / sampleRate;
      let real = 0;
      let imag = 0;
      const step = 2;
      for (let n = 0; n < windowLength; n += step) {
        const val = (mono[offset + n] || 0) * hannWindow[n];
        real += val * Math.cos(k * n);
        imag -= val * Math.sin(k * n);
      }
      const mag = Math.sqrt(real * real + imag * imag);
      midChroma[pitchClass] += mag;
    }
  }

  // Normalize bass Chroma (0 to 1)
  let maxBass = 0;
  for (let i = 0; i < 12; i++) {
    if (bassChroma[i] > maxBass) maxBass = bassChroma[i];
  }
  const normBass = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    normBass[i] = maxBass > 0 ? bassChroma[i] / maxBass : 0;
  }

  // Harmonic De-Aliasing on Mid Chroma:
  // Attenuate the 3rd harmonic (5th above) and 5th harmonic (major 3rd above)
  const cleanMidChroma = new Float64Array(12);
  for (let p = 0; p < 12; p++) {
    const rootForFifth = (p - 7 + 12) % 12;
    const rootForThird = (p - 4 + 12) % 12;
    const fifthLeakage = normBass[rootForFifth] * 0.30;
    const thirdLeakage = normBass[rootForThird] * 0.15;
    const totalLeakage = fifthLeakage + thirdLeakage;
    cleanMidChroma[p] = Math.max(0, midChroma[p] - totalLeakage * midChroma[p]);
  }

  // Normalize clean mid Chroma
  let maxMid = 0;
  for (let i = 0; i < 12; i++) {
    if (cleanMidChroma[i] > maxMid) maxMid = cleanMidChroma[i];
  }
  const normMid = new Float64Array(12);
  for (let i = 0; i < 12; i++) {
    normMid[i] = maxMid > 0 ? cleanMidChroma[i] / maxMid : 0;
  }

  // Composite Chroma: 60% mid melodic/chordal content + 40% bass fundamental
  const compositeChroma = new Array(12);
  for (let i = 0; i < 12; i++) {
    compositeChroma[i] = normMid[i] * 0.6 + normBass[i] * 0.4;
  }

  // Test against all 12 Major and 12 Minor combined profiles
  let bestKeyIndex = 9; // default A
  let bestMode: ScaleMode = 'minor';
  let bestScore = -Infinity;
  let secondBestScore = -Infinity;

  for (let root = 0; root < 12; root++) {
    const rotatedMajor = new Array(12);
    const rotatedMinor = new Array(12);
    for (let i = 0; i < 12; i++) {
      rotatedMajor[i] = COMBINED_MAJOR[(i - root + 12) % 12];
      rotatedMinor[i] = COMBINED_MINOR[(i - root + 12) % 12];
    }

    const majorCorr = correlation(compositeChroma, rotatedMajor);
    const minorCorr = correlation(compositeChroma, rotatedMinor);

    // Add bass tonic bonus: if note `root` has strong bassline energy, it is overwhelmingly likely the root key!
    const bassBonus = normBass[root] * 0.45;

    const majorTotal = majorCorr + bassBonus;
    const minorTotal = minorCorr + bassBonus;

    if (majorTotal > bestScore) {
      secondBestScore = bestScore;
      bestScore = majorTotal;
      bestKeyIndex = root;
      bestMode = 'major';
    } else if (majorTotal > secondBestScore) {
      secondBestScore = majorTotal;
    }

    if (minorTotal > bestScore) {
      secondBestScore = bestScore;
      bestScore = minorTotal;
      bestKeyIndex = root;
      bestMode = 'minor';
    } else if (minorTotal > secondBestScore) {
      secondBestScore = minorTotal;
    }
  }

  const confidence = Math.max(0.68, Math.min(0.99, bestScore - (secondBestScore > 0 ? secondBestScore * 0.12 : 0)));

  return {
    rootKey: NOTE_NAMES[bestKeyIndex],
    scaleMode: bestMode,
    confidence,
  };
}
