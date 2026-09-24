export type VocalTrackId =
  | 'lead1'
  | 'lead2'
  | 'double'
  | 'harmony1'
  | 'harmony2'
  | 'adlibs'
  | 'backing1'
  | 'backing2'
  | string;

export type MusicalKey =
  | 'C'
  | 'C#'
  | 'D'
  | 'D#'
  | 'E'
  | 'F'
  | 'F#'
  | 'G'
  | 'G#'
  | 'A'
  | 'A#'
  | 'B';

export type ScaleMode =
  | 'minor'
  | 'major'
  | 'harmonic_minor'
  | 'pentatonic'
  | 'chromatic';

// Las 5 principales tonalidades más usadas en música urbana y moderna:
// 1. Am / C (La Menor / Do Mayor)
// 2. F#m / A (Fa# Menor / La Mayor)
// 3. C#m / E (Do# Menor / Mi Mayor)
// 4. Gm / Bb (Sol Menor / Si♭ Mayor)
// 5. Dm / F (Re Menor / Fa Mayor)
export type PopularTonalityId =
  | 'Am_C'
  | 'Fsm_A'
  | 'Csm_E'
  | 'Gm_Bb'
  | 'Dm_F'
  | 'custom'
  | 'auto_beat';

export interface VocalTuneFX {
  enabled: boolean;          // true when speed > 0
  speed: number;            // 0.0 (OFF - Clicked detent) to 1.0 (Hard Tune)
  rootKey: MusicalKey;      // e.g. 'A' - Nota en la que se corrige la voz
  scaleMode: ScaleMode;     // e.g. 'minor' - Una de las 5 escalas principales
  humanize: number;         // 0 to 1
  tonalityId?: PopularTonalityId; // legacy support
}

export interface VocalFX {
  tune: VocalTuneFX;
  eq: {
    lowCut: boolean;
    lowCutFreq: number; // e.g. 100 Hz
    low: number;        // -12 to +12 dB
    mid: number;        // -12 to +12 dB
    high: number;       // -12 to +12 dB
  };
  comp: {
    amount: number;     // 0 to 1 (0% to 100%)
  };
  saturation: {
    amount: number;     // 0 to 1 (Clean -> Warm -> Drive)
  };
  delay: {
    division: 'OFF' | '1/8' | '1/4' | '1/2' | '1 BAR';
    mix: number;        // 0 to 1
    feedback: number;   // 0 to 0.8
  };
  reverb: {
    preset: 'ROOM' | 'PLATE' | 'HALL';
    mix: number;        // 0 to 1
  };
}

export interface BeatFX {
  lowPass: number;      // 200 to 20000 Hz (default 20000)
  highPass: number;     // 20 to 2000 Hz (default 20)
  volume: number;       // 0 to 1.5 (default 1.0)
}

export interface VocalClip {
  id: string;
  buffer: AudioBuffer;
  tunedBuffer?: AudioBuffer | null;
  duration: number;                 // duration in seconds
  startBeatOffset: number;          // start position in seconds relative to timeline 0
  waveformSample?: number[];
  name?: string;
}

export interface VocalTrack {
  id: VocalTrackId;
  name: string;
  clips?: VocalClip[];              // Multiple takes/clips along the same track line
  buffer: AudioBuffer | null;
  tunedBuffer?: AudioBuffer | null; // Cached pitch-corrected buffer
  duration: number;                 // length in seconds
  startBeatOffset: number;          // start timestamp relative to beat (seconds)
  volume: number;                   // 0.0 to 1.5 (default 1.0)
  pan: number;                      // -1.0 (Left) to +1.0 (Right), 0 is Center
  isMuted: boolean;
  isSolo: boolean;
  fx: VocalFX;
  waveformSample?: number[];        // normalized peaks for visualization
  isCustom?: boolean;               // user-added non-lead track
}

export interface BeatData {
  id: string;
  title: string;
  producer?: string;
  bpm: number;
  key: string;                      // e.g. "A minor" or "F#m"
  scale: string;
  duration: number;
  buffer: AudioBuffer;
  artworkGradient: string;
  waveformSample?: number[];
  isCustomUpload?: boolean;
  detectedBpm?: number;
  detectedKey?: string;
  detectedConfidence?: number;
  relativeKey?: string;             // e.g. "C" or "Am"
  relativeTonalityName?: string;    // e.g. "Do Mayor (C)"
  isLocked?: boolean;
  savedTimestamp?: number;
}

export interface LoopSettings {
  enabled: boolean;
  bars: 4 | 8 | 16 | 'all';
  startBar: number;
  startSec: number;
  endSec: number;
}

export interface BeatAnalysisResult {
  bpm: number;
  key: string;            // e.g. "Am", "F#m", "C"
  rootKey: MusicalKey;    // e.g. "A", "F#", "C"
  scaleMode: ScaleMode;   // "minor" | "major"
  tonalityName: string;   // e.g. "La Menor (A Minor)"
  relativeRootKey?: MusicalKey;
  relativeScaleMode?: ScaleMode;
  relativeKey?: string;   // e.g. "C", "Am"
  relativeTonalityName?: string; // e.g. "Do Mayor (C)"
  confidence: number;     // 0 to 100%
  matchingPopularTonality?: PopularTonalityId;
}
