import { BeatData } from '../types/audio';
import { extractWaveformPeaks } from './wavEncoder';

/**
 * Procedurally generates authentic studio beat AudioBuffers using Web Audio synthesis.
 * Fast, 100% offline, guaranteed instant zero-network playback for demo tracks.
 */
export async function createDemoBeat(
  ctx: BaseAudioContext,
  style: 'trap' | 'rnb' | 'drill'
): Promise<BeatData> {
  const sampleRate = ctx.sampleRate;

  let bpm = 140;
  let key = 'F minor';
  let title = 'Midnight 808';
  let gradient = 'linear-gradient(135deg, #18181b 0%, #27272a 50%, #451a03 100%)';
  let totalBars = 32;

  if (style === 'rnb') {
    bpm = 92;
    key = 'C minor';
    title = 'Velvet & Smoke';
    gradient = 'linear-gradient(135deg, #09090b 0%, #1e1b4b 50%, #311042 100%)';
    totalBars = 24;
  } else if (style === 'drill') {
    bpm = 144;
    key = 'G minor';
    title = 'Obsidian Drill';
    gradient = 'linear-gradient(135deg, #09090b 0%, #3f1d24 50%, #18181b 100%)';
    totalBars = 32;
  }

  const secondsPerBeat = 60 / bpm;
  const secondsPerBar = secondsPerBeat * 4;
  const duration = totalBars * secondsPerBar;
  const totalSamples = Math.floor(sampleRate * duration);

  const buffer = ctx.createBuffer(2, totalSamples, sampleRate);
  const left = buffer.getChannelData(0);
  const right = buffer.getChannelData(1);

  // Helper sound synthesizers directly into the buffer:
  const addKick = (startSec: number, velocity: number = 0.9) => {
    const startSample = Math.floor(startSec * sampleRate);
    const kickLen = Math.floor(0.35 * sampleRate);
    for (let i = 0; i < kickLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const freq = 140 * Math.exp(-t * 22) + 38; // Pitch drop from 140Hz to 38Hz
      const env = Math.exp(-t * 8.5) * velocity;
      const sample = Math.sin(2 * Math.PI * freq * t) * env;
      left[startSample + i] += sample * 0.7;
      right[startSample + i] += sample * 0.7;
    }
  };

  const addSnare = (startSec: number, velocity: number = 0.8) => {
    const startSample = Math.floor(startSec * sampleRate);
    const snareLen = Math.floor(0.22 * sampleRate);
    for (let i = 0; i < snareLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * 18);
      const tone = Math.sin(2 * Math.PI * 185 * t) * Math.exp(-t * 24);
      const sample = (noise * 0.6 + tone * 0.4) * velocity;
      left[startSample + i] += sample * 0.55;
      right[startSample + i] += sample * 0.55;
    }
  };

  const addRim = (startSec: number, velocity: number = 0.7) => {
    const startSample = Math.floor(startSec * sampleRate);
    const rimLen = Math.floor(0.12 * sampleRate);
    for (let i = 0; i < rimLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const tone = Math.sin(2 * Math.PI * 450 * t) * Math.exp(-t * 35);
      const sample = tone * velocity;
      left[startSample + i] += sample * 0.45;
      right[startSample + i] += sample * 0.45;
    }
  };

  const addHiHat = (startSec: number, open: boolean = false, velocity: number = 0.5) => {
    const startSample = Math.floor(startSec * sampleRate);
    const hatLen = Math.floor((open ? 0.25 : 0.05) * sampleRate);
    const pan = (Math.random() - 0.5) * 0.3; // Slight stereo pan
    for (let i = 0; i < hatLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const decay = open ? 12 : 65;
      const noise = (Math.random() * 2 - 1) * Math.exp(-t * decay) * velocity * 0.35;
      left[startSample + i] += noise * (1 - pan);
      right[startSample + i] += noise * (1 + pan);
    }
  };

  const add808 = (startSec: number, noteFreq: number, durSec: number = 0.8, velocity: number = 0.85) => {
    const startSample = Math.floor(startSec * sampleRate);
    const noteLen = Math.floor(durSec * sampleRate);
    for (let i = 0; i < noteLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t * 80) * Math.exp(-t * (1.8 / durSec));
      // Fundamental + subtle 2nd harmonic for rich mobile speaker audibility
      let sample = (Math.sin(2 * Math.PI * noteFreq * t) + 0.3 * Math.sin(2 * Math.PI * noteFreq * 2 * t)) * env * velocity;
      // Soft saturation
      sample = Math.tanh(sample * 1.3);
      left[startSample + i] += sample * 0.65;
      right[startSample + i] += sample * 0.65;
    }
  };

  const addChordPluck = (startSec: number, freqs: number[], durSec: number = 1.2, panOffset: number = 0) => {
    const startSample = Math.floor(startSec * sampleRate);
    const noteLen = Math.floor(durSec * sampleRate);
    for (let i = 0; i < noteLen && startSample + i < totalSamples; i++) {
      const t = i / sampleRate;
      const env = Math.min(1, t * 120) * Math.exp(-t * (2.5 / durSec));
      let chordSample = 0;
      for (const f of freqs) {
        chordSample += (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * (f * 1.5) * t));
      }
      chordSample = (chordSample / freqs.length) * env * 0.38;
      left[startSample + i] += chordSample * (0.8 - panOffset);
      right[startSample + i] += chordSample * (0.8 + panOffset);
    }
  };

  // Generate musical patterns across totalBars
  if (style === 'trap') {
    // F minor notes for 808: F1 (43.65 Hz), Db1 (34.65 Hz), Eb1 (38.89 Hz), C1 (32.70 Hz)
    const baseFreqs = [43.65, 34.65, 38.89, 43.65];
    const chords = [
      [174.61, 207.65, 261.63], // Fm
      [138.59, 174.61, 207.65], // Db
      [155.56, 196.00, 233.08], // Eb
      [130.81, 164.81, 196.00], // C
    ];

    for (let bar = 0; bar < totalBars; bar++) {
      const barSec = bar * secondsPerBar;
      const chordIdx = bar % 4;
      const root808 = baseFreqs[chordIdx];

      // Chords / Melody Pluck
      addChordPluck(barSec, chords[chordIdx], secondsPerBar * 0.9, (chordIdx % 2 === 0 ? 0.15 : -0.15));
      addChordPluck(barSec + secondsPerBeat * 2.5, chords[chordIdx], secondsPerBar * 0.45);

      // Kicks & 808
      addKick(barSec, 0.95);
      add808(barSec, root808, secondsPerBeat * 1.8, 0.9);

      addKick(barSec + secondsPerBeat * 2.5, 0.85);
      add808(barSec + secondsPerBeat * 2.5, root808, secondsPerBeat * 1.2, 0.85);

      if (bar % 2 === 1) {
        addKick(barSec + secondsPerBeat * 3.5, 0.8);
      }

      // Snare on beat 3 (Trap halftime feel)
      addSnare(barSec + secondsPerBeat * 2, 0.85);

      // Hi-Hats: 1/8 notes + rolling 1/16 triplets
      for (let s = 0; s < 8; s++) {
        const hatSec = barSec + s * (secondsPerBeat / 2);
        if (s === 6 && bar % 2 === 1) {
          // Triplet roll
          for (let r = 0; r < 3; r++) {
            addHiHat(hatSec + r * (secondsPerBeat / 6), false, 0.45);
          }
        } else {
          addHiHat(hatSec, false, s % 2 === 0 ? 0.6 : 0.35);
        }
      }
    }
  } else if (style === 'rnb') {
    // C minor soul progression: Cm9, Abmaj7, Fm7, G7
    const chords = [
      [130.81, 155.56, 196.0, 293.66], // Cm9
      [103.83, 130.81, 155.56, 207.65], // Abmaj7
      [87.31, 103.83, 130.81, 174.61],  // Fm7
      [98.0, 123.47, 146.83, 174.61],   // G7
    ];
    const bassNotes = [65.41, 51.91, 43.65, 49.0];

    for (let bar = 0; bar < totalBars; bar++) {
      const barSec = bar * secondsPerBar;
      const chordIdx = bar % 4;

      addChordPluck(barSec, chords[chordIdx], secondsPerBar * 0.95);
      addChordPluck(barSec + secondsPerBeat * 2.5, chords[chordIdx], secondsPerBar * 0.4);

      // Warm round kick
      addKick(barSec, 0.8);
      addKick(barSec + secondsPerBeat * 1.75, 0.7);

      // Warm rimshot on 2 and 4
      addRim(barSec + secondsPerBeat * 1, 0.75);
      addRim(barSec + secondsPerBeat * 3, 0.8);

      // Bouncy bass
      add808(barSec, bassNotes[chordIdx], secondsPerBeat * 1.5, 0.7);
      add808(barSec + secondsPerBeat * 2, bassNotes[chordIdx], secondsPerBeat * 1.8, 0.75);

      // Swung hats
      for (let s = 0; s < 4; s++) {
        const b = barSec + s * secondsPerBeat;
        addHiHat(b, false, 0.4);
        addHiHat(b + secondsPerBeat * 0.62, false, 0.25); // Swing offset
      }
    }
  } else {
    // Drill: 144 BPM, G minor
    const chords = [
      [196.0, 233.08, 293.66], // Gm
      [174.61, 220.0, 261.63], // F
      [146.83, 174.61, 220.0], // Dm
      [164.81, 207.65, 246.94] // Eb
    ];
    const bassNotes = [49.0, 43.65, 36.71, 41.2];

    for (let bar = 0; bar < totalBars; bar++) {
      const barSec = bar * secondsPerBar;
      const chordIdx = bar % 4;

      addChordPluck(barSec, chords[chordIdx], secondsPerBar * 0.7);
      addChordPluck(barSec + secondsPerBeat * 2, chords[chordIdx], secondsPerBar * 0.5);

      // Drill snare on beat 3 or 3.5
      addSnare(barSec + secondsPerBeat * (bar % 2 === 0 ? 3 : 2.5), 0.85);

      // Sliding 808
      add808(barSec, bassNotes[chordIdx], secondsPerBeat * 1.6, 0.9);
      if (bar % 2 === 1) {
        add808(barSec + secondsPerBeat * 2.5, bassNotes[chordIdx] * 1.5, secondsPerBeat * 1.2, 0.85);
      }

      // Drill kicks
      addKick(barSec, 0.9);
      addKick(barSec + secondsPerBeat * 2.25, 0.85);

      // Drill syncopated hats
      for (let h = 0; h < 6; h++) {
        addHiHat(barSec + h * (secondsPerBar / 6), false, 0.4);
      }
    }
  }

  // Normalize entire buffer to -0.5 dB to prevent clipping
  let peak = 0.01;
  for (let i = 0; i < totalSamples; i++) {
    const l = Math.abs(left[i]);
    const r = Math.abs(right[i]);
    if (l > peak) peak = l;
    if (r > peak) peak = r;
  }
  const gain = 0.88 / peak;
  for (let i = 0; i < totalSamples; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }

  const waveform = extractWaveformPeaks(buffer, 64);

  return {
    id: `demo-${style}`,
    title,
    producer: 'RGODBEAT',
    bpm,
    key,
    scale: style === 'rnb' ? 'Minor Neo-Soul' : style === 'drill' ? 'Dark Drill' : 'Trap Anthem',
    duration,
    buffer,
    artworkGradient: gradient,
    waveformSample: waveform,
  };
}
