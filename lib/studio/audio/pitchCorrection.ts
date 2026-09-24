import { MusicalKey, PopularTonalityId, ScaleMode, VocalTuneFX } from '../types/audio';

// Chromatic note table: 0 = C, 1 = C#, 2 = D, ..., 11 = B
export const NOTE_NAMES: MusicalKey[] = [
  'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B',
];

export const SPANISH_KEY_NAMES: Record<MusicalKey, string> = {
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
  'A#': 'La#',
  B: 'Si',
};

export interface ScaleDefinition {
  id: ScaleMode;
  name: string;
  shortName: string;
  badge: string;
  description: string;
  intervals: number[]; // semitone offsets from root
}

// Las 5 Escalas Principales para corrección vocal profesional
export const MAIN_SCALES: ScaleDefinition[] = [
  {
    id: 'minor',
    name: 'Menor Natural',
    shortName: 'Menor Nat.',
    badge: '1. Trap / Drill',
    description: 'La escala reina del Trap, Drill, Rap y música urbana melancólica.',
    intervals: [0, 2, 3, 5, 7, 8, 10],
  },
  {
    id: 'major',
    name: 'Mayor',
    shortName: 'Mayor',
    badge: '2. Pop / Reggaeton',
    description: 'Brillante, enérgica y alegre. Ideal para Pop, Reggaeton bailable y melodías épicas.',
    intervals: [0, 2, 4, 5, 7, 9, 11],
  },
  {
    id: 'harmonic_minor',
    name: 'Menor Armónica',
    shortName: 'Armónica',
    badge: '3. Dark / Flamenco',
    description: 'Sonido oscuro, misterioso y exótico. Típica de trap latino oscuro y melodías orientales.',
    intervals: [0, 2, 3, 5, 7, 8, 11],
  },
  {
    id: 'pentatonic',
    name: 'Pentatónica Menor',
    shortName: 'Pentatónica',
    badge: '4. R&B / Flow',
    description: 'Fluidez y flow melódico estilo R&B. Cero notas disonantes: cualquier nota que cantes sonará bien.',
    intervals: [0, 3, 5, 7, 10],
  },
  {
    id: 'chromatic',
    name: 'Cromática',
    shortName: 'Cromática',
    badge: '5. Libre / 12T',
    description: 'Afinación a todos los 12 semitonos. Cuantiza a la nota más cercana sin excluir ninguna escala.',
    intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
];

export interface PopularTonalityInfo {
  id: PopularTonalityId;
  name: string;
  shortName: string;
  notes: number[];
  description: string;
}

export const POPULAR_TONALITIES: PopularTonalityInfo[] = [
  {
    id: 'Am_C',
    name: 'La Menor / Do Mayor',
    shortName: 'Am / C',
    notes: [9, 11, 0, 2, 4, 5, 7],
    description: 'Tonalidad natural sin sostenidos. Ideal para Trap triste, Pop y Baladas.',
  },
  {
    id: 'Fsm_A',
    name: 'Fa# Menor / La Mayor',
    shortName: 'F#m / A',
    notes: [6, 8, 9, 11, 1, 2, 4],
    description: 'Energía urbana oscura y emotiva. Muy usada en Reggaeton y Melodic Drill.',
  },
  {
    id: 'Csm_E',
    name: 'Do# Menor / Mi Mayor',
    shortName: 'C#m / E',
    notes: [1, 3, 4, 6, 8, 9, 11],
    description: 'Profunda y brillante. Típica de hits de Travis Scott, Drake y The Weeknd.',
  },
  {
    id: 'Gm_Bb',
    name: 'Sol Menor / Si♭ Mayor',
    shortName: 'Gm / Bb',
    notes: [7, 9, 10, 0, 2, 3, 5],
    description: 'Tensión épica y agresiva. Estándar de Trap pesado, Drill y R&B.',
  },
  {
    id: 'Dm_F',
    name: 'Re Menor / Fa Mayor',
    shortName: 'Dm / F',
    notes: [2, 4, 5, 7, 9, 10, 0],
    description: 'Melancólica y resonante. Muy popular en Pop urbano y melodías vocales.',
  },
];

/**
 * Returns the names of notes included in a chosen key & scale.
 */
export function getScaleNoteNames(rootKey: MusicalKey, scaleMode: ScaleMode): string[] {
  const rootIndex = NOTE_NAMES.indexOf(rootKey);
  const base = rootIndex >= 0 ? rootIndex : 0;
  const scale = MAIN_SCALES.find((s) => s.id === scaleMode) || MAIN_SCALES[0];
  return scale.intervals.map((semitone) => NOTE_NAMES[(base + semitone) % 12]);
}

/**
 * Returns the set of valid pitch classes (0-11) for a given key and scale mode.
 */
export function getScalePitchClasses(
  rootKey: MusicalKey,
  scaleMode: ScaleMode,
  tonalityId?: PopularTonalityId
): Set<number> {
  const rootIndex = NOTE_NAMES.indexOf(rootKey);
  const base = rootIndex >= 0 ? rootIndex : 0;

  if (scaleMode === 'chromatic') {
    return new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  }

  const scale = MAIN_SCALES.find((s) => s.id === scaleMode);
  if (scale) {
    const set = new Set<number>();
    for (const interval of scale.intervals) {
      set.add((base + interval) % 12);
    }
    return set;
  }

  // Fallback to legacy popular tonalities if needed
  if (tonalityId) {
    const popular = POPULAR_TONALITIES.find((t) => t.id === tonalityId);
    if (popular) {
      return new Set(popular.notes);
    }
  }

  // Default to Natural Minor
  return new Set([0, 2, 3, 5, 7, 8, 10].map((i) => (base + i) % 12));
}

/**
 * Quantizes a detected frequency (Hz) to the closest note in the scale.
 */
export function quantizeFrequencyToScale(
  freqHz: number,
  validPitchClasses: Set<number>,
  retuneSpeed: number // 0 to 1
): number {
  if (freqHz <= 60 || freqHz >= 1200) return freqHz;

  // MIDI note formula: midi = 69 + 12 * log2(freq / 440)
  const exactMidi = 69 + 12 * (Math.log(freqHz / 440) / Math.LN2);
  const roundedMidi = Math.round(exactMidi);

  // Search for the closest valid pitch class
  let bestMidi = roundedMidi;
  let minDiff = Infinity;

  // Search within +- 6 semitones
  for (let offset = -6; offset <= 6; offset++) {
    const candidateMidi = roundedMidi + offset;
    const pitchClass = ((candidateMidi % 12) + 12) % 12;
    if (validPitchClasses.has(pitchClass)) {
      const diff = Math.abs(candidateMidi - exactMidi);
      if (diff < minDiff) {
        minDiff = diff;
        bestMidi = candidateMidi;
      }
    }
  }

  // Calculate target frequency: targetFreq = 440 * 2^((bestMidi - 69)/12)
  const targetFreq = 440 * Math.pow(2, (bestMidi - 69) / 12);

  // Interpolate based on retune speed (Hard tune = instant 100%, lower speed = smoother pull)
  const pullFactor = Math.min(1, Math.max(0, retuneSpeed * 1.1));
  return freqHz + (targetFreq - freqHz) * pullFactor;
}

/**
 * Plays an authentic tactile mechanical click sound via Web Audio API
 * when the Tune knob crosses the 0 / OFF detent threshold.
 */
export function playKnobClickSound(audioCtx?: AudioContext | null, isTurningOn: boolean = true) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'triangle';
    if (isTurningOn) {
      // Engaging click
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.012);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
    } else {
      // Disengaging click (softer)
      osc.frequency.setValueAtTime(800, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.015);
      gain.gain.setValueAtTime(0.14, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    }

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.015);

    // Haptic feedback for tactile click on mobile devices
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(isTurningOn ? [12] : [8]);
    }
  } catch (e) {
    console.debug('Knob click audio not available:', e);
  }
}

/**
 * Pitch detection using YIN / Normalized Autocorrelation
 */
function detectPitchInFrame(frame: Float32Array, sampleRate: number): number {
  const frameSize = frame.length;
  const minLag = Math.floor(sampleRate / 800); // ~800 Hz max vocal frequency
  const maxLag = Math.floor(sampleRate / 75);  // ~75 Hz min vocal frequency

  if (maxLag >= frameSize) return 0;

  // Energy check to skip silence
  let energy = 0;
  for (let i = 0; i < frameSize; i++) {
    energy += frame[i] * frame[i];
  }
  if (energy < 0.002) return 0; // silence

  // Difference function d(t)
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let sum = 0;
    const len = frameSize - tau;
    for (let i = 0; i < len; i++) {
      const diff = frame[i] - frame[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Cumulative mean normalized difference function d'(t)
  const dPrime = new Float32Array(maxLag + 1);
  dPrime[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxLag; tau++) {
    runningSum += d[tau];
    dPrime[tau] = runningSum > 0 ? (d[tau] * tau) / runningSum : 1;
  }

  // Find first minimum below threshold
  const threshold = 0.15;
  let bestTau = 0;
  for (let tau = minLag; tau <= maxLag; tau++) {
    if (dPrime[tau] < threshold) {
      while (tau + 1 <= maxLag && dPrime[tau + 1] < dPrime[tau]) {
        tau++;
      }
      bestTau = tau;
      break;
    }
  }

  // Fallback to absolute minimum if threshold wasn't met
  if (bestTau === 0) {
    let minVal = Infinity;
    for (let tau = minLag; tau <= maxLag; tau++) {
      if (dPrime[tau] < minVal) {
        minVal = dPrime[tau];
        bestTau = tau;
      }
    }
    if (minVal > 0.45) return 0; // Unvoiced / noise
  }

  if (bestTau <= 0) return 0;

  // Parabolic interpolation for sub-sample accuracy
  const x0 = bestTau > 1 ? bestTau - 1 : bestTau;
  const x2 = bestTau < maxLag ? bestTau + 1 : bestTau;
  let refinedTau = bestTau;
  if (x0 !== bestTau && x2 !== bestTau) {
    const s0 = dPrime[x0];
    const s1 = dPrime[bestTau];
    const s2 = dPrime[x2];
    const bottom = 2 * (s0 - 2 * s1 + s2);
    if (bottom !== 0) {
      refinedTau = bestTau + (s0 - s2) / bottom;
    }
  }

  return sampleRate / refinedTau;
}

/**
 * High-performance Auto-Tune Pitch Correction Engine
 * Takes an input vocal AudioBuffer and applies pitch correction according to VocalTuneFX settings.
 */
export async function processVocalTune(
  audioCtx: AudioContext,
  inputBuffer: AudioBuffer,
  tuneFX: VocalTuneFX
): Promise<AudioBuffer> {
  // If tune is disabled or speed is 0 (OFF detent), return untouched buffer
  if (!tuneFX.enabled || tuneFX.speed <= 0.01) {
    return inputBuffer;
  }

  const sampleRate = inputBuffer.sampleRate;
  const numChannels = inputBuffer.numberOfChannels;
  const length = inputBuffer.length;

  const validPitchClasses = getScalePitchClasses(
    tuneFX.rootKey,
    tuneFX.scaleMode,
    tuneFX.tonalityId
  );

  const outBuffer = audioCtx.createBuffer(numChannels, length, sampleRate);

  // Frame parameters
  const frameSize = 2048;
  const hopSize = 512;
  const numFrames = Math.floor((length - frameSize) / hopSize);

  for (let ch = 0; ch < numChannels; ch++) {
    const input = inputBuffer.getChannelData(ch);
    const output = outBuffer.getChannelData(ch);
    output.set(input); // start with original signal

    const frame = new Float32Array(frameSize);
    const window = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      // Hanning window
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (frameSize - 1)));
    }

    // Process overlapping grains
    for (let f = 0; f < numFrames; f++) {
      const offset = f * hopSize;
      for (let i = 0; i < frameSize; i++) {
        frame[i] = input[offset + i];
      }

      // Detect original pitch
      const detectedFreq = detectPitchInFrame(frame, sampleRate);

      if (detectedFreq > 75 && detectedFreq < 850) {
        // Compute quantized target frequency
        const targetFreq = quantizeFrequencyToScale(detectedFreq, validPitchClasses, tuneFX.speed);
        const pitchRatio = targetFreq / detectedFreq;

        // Apply pitch shift if ratio differs by more than 0.8%
        if (Math.abs(pitchRatio - 1.0) > 0.008 && pitchRatio > 0.5 && pitchRatio < 2.0) {
          // Time-domain pitch synchronous granular resynthesis
          for (let i = 0; i < frameSize; i++) {
            const readIndex = offset + Math.floor(i * pitchRatio);
            if (readIndex < length) {
              const weight = window[i] * Math.min(1.0, tuneFX.speed * 1.2);
              const original = output[offset + i];
              const shifted = input[readIndex];
              output[offset + i] = original * (1 - weight) + shifted * weight;
            }
          }
        }
      }
    }
  }

  return outBuffer;
}
