/**
 * Native Vocal Conditioning, RMS Presence Calibration & Adaptive De-Esser DSP.
 *
 * Recreates studio vocal-enhancement stages locally in Web Audio / Float32 PCM
 * without external API dependencies:
 * 1. DC offset removal.
 * 2. Plosive ("P"/"B") sub-115 Hz transient damping.
 * 3. Smooth downward expander (breath/room-hiss suppression between phrases).
 * 4. Active-syllable RMS + sibilance analysis (ignoring silent pauses).
 * 5. Soft micro-AGC + Beat-referenced target RMS calibration so vocals always cut
 *    clearly in front of mastered beats regardless of mic gain.
 */

export interface AudioRmsAnalysis {
  activeRms: number;
  activeRmsDb: number;
  peak: number;
  peakDb: number;
  noiseFloor: number;
  noiseFloorDb: number;
  sibilanceRatio: number;
  deEsser6800Db: number;
  deEsser8200Db: number;
}

export interface VocalPresenceCalibration {
  analysis: AudioRmsAnalysis;
  calibrationGain: number;
}

const EPSILON = 1e-7;
const linearToDb = (value: number): number => 20 * Math.log10(Math.max(EPSILON, value));
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

function makeBandpassCoeffs(sampleRate: number, freqHz: number, q: number): BiquadCoeffs {
  const safeFs = Math.max(8000, sampleRate);
  const w0 = (2 * Math.PI * Math.min(freqHz, safeFs * 0.45)) / safeFs;
  const alpha = Math.sin(w0) / (2 * Math.max(0.25, q));
  const a0 = 1 + alpha;
  return {
    b0: alpha / a0,
    b1: 0,
    b2: -alpha / a0,
    a1: (-2 * Math.cos(w0)) / a0,
    a2: (1 - alpha) / a0,
  };
}

function stepBiquad(x: number, c: BiquadCoeffs, s: { z1: number; z2: number }): number {
  const y = c.b0 * x + s.z1;
  s.z1 = c.b1 * x - c.a1 * y + s.z2;
  s.z2 = c.b2 * x - c.a2 * y;
  return y;
}

/**
 * Computes active-signal RMS, peak, noise floor, and sibilance ratio on raw channels.
 * Ignores silent gaps so pauses between bars never pull down the vocal loudness reading.
 */
export function analyzeChannelsRms(channels: ReadonlyArray<Float32Array>, sampleRate: number): AudioRmsAnalysis {
  if (!channels.length || !channels[0]?.length) {
    return {
      activeRms: 0,
      activeRmsDb: -120,
      peak: 0,
      peakDb: -120,
      noiseFloor: 0,
      noiseFloorDb: -120,
      sibilanceRatio: 0,
      deEsser6800Db: -2.0,
      deEsser8200Db: -1.0,
    };
  }

  const numChannels = channels.length;
  const length = channels[0].length;
  // Compute per-channel DC means so DC offset never inflates RMS or noise floor
  const means = new Float64Array(numChannels);
  for (let ch = 0; ch < numChannels; ch++) {
    const data = channels[ch];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += data[i];
    means[ch] = sum / length;
  }

  const frameSize = Math.max(64, Math.round(Math.max(8000, sampleRate) * 0.02)); // 20 ms frames
  const frameCount = Math.max(1, Math.ceil(length / frameSize));
  const frameRms = new Float32Array(frameCount);

  let peak = 0;
  const sibCoeffs = makeBandpassCoeffs(sampleRate, 7000, 1.4);
  const bodyCoeffs = makeBandpassCoeffs(sampleRate, 1800, 0.8);
  const sibState = { z1: 0, z2: 0 };
  const bodyState = { z1: 0, z2: 0 };
  const frameSibRms = new Float32Array(frameCount);
  const frameBodyRms = new Float32Array(frameCount);

  for (let f = 0; f < frameCount; f++) {
    const start = f * frameSize;
    const end = Math.min(length, start + frameSize);
    const n = Math.max(1, end - start);
    let maxChannelSq = 0;

    for (let ch = 0; ch < numChannels; ch++) {
      const data = channels[ch];
      const mean = means[ch];
      let sumSq = 0;
      for (let i = start; i < end; i++) {
        const s = data[i] - mean;
        const abs = s < 0 ? -s : s;
        if (abs > peak) peak = abs;
        sumSq += s * s;
      }
      if (sumSq > maxChannelSq) maxChannelSq = sumSq;
    }

    frameRms[f] = Math.sqrt(maxChannelSq / n);

    // Measure sibilance vs body on AC-centered mono mix of this frame
    let sibSq = 0;
    let bodySq = 0;
    for (let i = start; i < end; i++) {
      let mono = 0;
      for (let ch = 0; ch < numChannels; ch++) mono += channels[ch][i] - means[ch];
      mono /= numChannels;
      const sb = stepBiquad(mono, sibCoeffs, sibState);
      const bd = stepBiquad(mono, bodyCoeffs, bodyState);
      sibSq += sb * sb;
      bodySq += bd * bd;
    }
    frameSibRms[f] = Math.sqrt(sibSq / n);
    frameBodyRms[f] = Math.sqrt(bodySq / n);
  }

  // Sort frames to find quiet noise floor (15th percentile) only when silent gaps actually exist
  const sorted = Array.from(frameRms).sort((a, b) => a - b);
  let maxFrameRms = sorted[sorted.length - 1] || 0;
  if (!Number.isFinite(maxFrameRms)) maxFrameRms = 0;
  const floorIndex = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.15));
  const p15 = sorted[floorIndex] || 0;
  const noiseFloor = p15 < maxFrameRms * 0.25 && p15 < 0.035 ? p15 : 0;

  // Active frames: anything clearly above digital silence (-48 dBFS), true noise floor, and 8% of peak frame
  const activityThreshold = Math.max(0.004, noiseFloor * 1.9, maxFrameRms * 0.08);
  let activeSqSum = 0;
  let activeCount = 0;
  let sibSum = 0;
  let bodySum = 0;

  for (let f = 0; f < frameCount; f++) {
    const r = frameRms[f];
    if (r >= activityThreshold) {
      activeSqSum += r * r;
      activeCount++;
      sibSum += frameSibRms[f];
      bodySum += frameBodyRms[f];
    }
  }

  const activeRms = activeCount > 0 ? Math.sqrt(activeSqSum / activeCount) : maxFrameRms;
  const sibilanceRatio = bodySum > 1e-5 ? sibSum / bodySum : 0;

  // Adaptive De-Esser: gentle on warm/dark phone mics, stronger on bright sibilant mics
  const normSib = clamp((sibilanceRatio - 0.28) / (0.72 - 0.28), 0, 1);
  const deEsser6800Db = -Math.round((0.8 + normSib * 3.7) * 10) / 10; // -0.8 dB to -4.5 dB
  const deEsser8200Db = -Math.round((0.4 + normSib * 2.0) * 10) / 10; // -0.4 dB to -2.4 dB

  return {
    activeRms,
    activeRmsDb: linearToDb(activeRms),
    peak,
    peakDb: linearToDb(peak),
    noiseFloor,
    noiseFloorDb: linearToDb(noiseFloor),
    sibilanceRatio,
    deEsser6800Db,
    deEsser8200Db,
  };
}

/**
 * Computes the pre-FX level calibration multiplier so a vocal sits consistently upfront
 * relative to the instrumental beat's loudness without clipping.
 */
export function computeVocalCalibrationGain(
  vocalActiveRms: number,
  vocalPeak: number,
  beatActiveRms: number
): number {
  if (vocalActiveRms <= 0.0008 || vocalPeak <= 0.0015) return 1.0;

  const beatRef = clamp(beatActiveRms > 0.01 ? beatActiveRms : 0.16, 0.08, 0.28);
  // Target pre-compressor vocal RMS slightly above the beat reference for clear upfront presence
  const targetVocalRms = clamp(beatRef * 1.15, 0.15, 0.25);
  const desiredGain = targetVocalRms / vocalActiveRms;

  return clamp(desiredGain, 0.72, 3.6);
}

/**
 * Applies native Dolby-style vocal conditioning to raw Float32 channels (non-mutating):
 * - Removes DC offset
 * - Tames plosive sub-115 Hz air puffs without cutting chest warmth
 * - Smoothly suppresses room noise/hiss during silent pauses
 * - Smoothly levels dynamic vocal phrases and calibrates RMS against the beat
 */
export function enhanceVocalChannelsDsp(
  inputChannels: ReadonlyArray<Float32Array>,
  sampleRate: number,
  beatActiveRms: number = 0.16
): { channels: Float32Array[]; calibration: VocalPresenceCalibration } {
  const analysis = analyzeChannelsRms(inputChannels, sampleRate);
  const calibrationGain = computeVocalCalibrationGain(analysis.activeRms, analysis.peak, beatActiveRms);
  const fs = Math.max(8000, sampleRate);
  const length = inputChannels[0]?.length ?? 0;

  if (!inputChannels.length || length === 0 || analysis.activeRms <= 0.0005) {
    return {
      channels: inputChannels.map((ch) => new Float32Array(ch)),
      calibration: { analysis, calibrationGain: 1.0 },
    };
  }

  const outChannels = inputChannels.map((ch) => new Float32Array(ch.length));

  // 1. Remove DC offset per channel
  for (let ch = 0; ch < inputChannels.length; ch++) {
    const src = inputChannels[ch];
    const dst = outChannels[ch];
    let sum = 0;
    for (let i = 0; i < length; i++) sum += src[i];
    const mean = sum / length;
    for (let i = 0; i < length; i++) dst[i] = src[i] - mean;
  }

  // 2. Envelope parameters:
  //    - Noise gate downward expander: attenuates room hiss up to -29 dB (0.035) below noise floor
  //      with a 55 ms hold window so soft vocal tails never chop before compression
  //    - Plosive LP filter at 115 Hz: detects isolated sub puffs and attenuates excessive low burst
  //    - Micro-AGC follower: smooth 140ms vocal phrase leveling (+4.5 dB boost on quiet lines, -3.5 dB on shouts)
  const lpAlpha = 1 - Math.exp((-2 * Math.PI * 115) / fs);
  const envAttack = Math.exp(-1 / (fs * 0.008));  // 8 ms fast attack
  const envRelease = Math.exp(-1 / (fs * 0.185)); // 185 ms natural vocal tail release
  const agcAttack = Math.exp(-1 / (fs * 0.035));  // 35 ms AGC attack
  const agcRelease = Math.exp(-1 / (fs * 0.220)); // 220 ms AGC release

  const gateOpenThresh = Math.max(0.0055, analysis.noiseFloor * 2.15, analysis.activeRms * 0.115);
  const gateFloorThresh = Math.max(0.0014, gateOpenThresh * 0.36);
  const gateFloorGain = 0.035; // -29 dB attenuation floor
  const holdSamples = Math.round(fs * 0.055);
  let holdCounter = 0;

  const lpStates = new Float32Array(outChannels.length);
  let fastEnv = analysis.noiseFloor;
  let phraseEnv = analysis.activeRms;

  for (let i = 0; i < length; i++) {
    let monoAbs = 0;
    let maxChannelSample = 0;
    for (let ch = 0; ch < outChannels.length; ch++) {
      const s = outChannels[ch][i];
      const abs = s < 0 ? -s : s;
      monoAbs += abs;
      if (abs > maxChannelSample) maxChannelSample = abs;
    }
    monoAbs /= outChannels.length;

    // Fast vocal envelope with hold so consonants/breath endings stay open
    if (monoAbs >= gateOpenThresh) {
      holdCounter = holdSamples;
      fastEnv = envAttack * fastEnv + (1 - envAttack) * monoAbs;
    } else if (holdCounter > 0) {
      holdCounter--;
      fastEnv = Math.max(fastEnv, gateOpenThresh);
    } else {
      const coeff = monoAbs > fastEnv ? envAttack : envRelease;
      fastEnv = coeff * fastEnv + (1 - coeff) * monoAbs;
    }

    let gateGain = 1.0;
    if (fastEnv < gateOpenThresh) {
      const ratio = clamp((fastEnv - gateFloorThresh) / Math.max(EPSILON, gateOpenThresh - gateFloorThresh), 0, 1);
      // Smooth S-curve downward expansion down to 0.035 (-29 dB)
      const smooth = ratio * ratio * (3 - 2 * ratio);
      gateGain = gateFloorGain + (1 - gateFloorGain) * (smooth * smooth);
    }

    // Slow phrase-level micro-AGC only while gate is meaningfully active
    const agcCoeff = monoAbs > phraseEnv ? agcAttack : agcRelease;
    if (fastEnv >= gateOpenThresh * 0.85) {
      phraseEnv = agcCoeff * phraseEnv + (1 - agcCoeff) * Math.max(monoAbs, analysis.activeRms * 0.35);
    }
    const rawMicroAgc = analysis.activeRms / Math.max(analysis.activeRms * 0.45, phraseEnv);
    const microAgc = clamp(rawMicroAgc, 0.68, 1.65);

    const totalGain = gateGain * microAgc * calibrationGain;

    for (let ch = 0; ch < outChannels.length; ch++) {
      const s = outChannels[ch][i];
      // Extract < 115 Hz component for plosive taming
      const lp = lpStates[ch] + lpAlpha * (s - lpStates[ch]);
      lpStates[ch] = lp;
      const body = s - lp;
      const lpAbs = lp < 0 ? -lp : lp;
      const bodyAbs = body < 0 ? -body : body;

      // Only damp low-band puff if sub-115 Hz burst disproportionately dwarfs mid vocal body
      let cleanedSample = s;
      if (lpAbs > Math.max(0.08, bodyAbs * 2.4)) {
        const excessRatio = clamp((lpAbs - bodyAbs * 2.4) / Math.max(0.05, lpAbs), 0, 0.65);
        cleanedSample = body + lp * (1 - excessRatio);
      }

      const scaled = cleanedSample * totalGain;
      // Soft knee analog safety ceiling above 0.88 prevents harsh digital clipping on shouted peaks
      const absScaled = scaled < 0 ? -scaled : scaled;
      if (absScaled > 0.88) {
        const sign = scaled < 0 ? -1 : 1;
        outChannels[ch][i] = sign * (0.88 + 0.11 * Math.tanh((absScaled - 0.88) / 0.14));
      } else {
        outChannels[ch][i] = scaled;
      }
    }
  }

  return {
    channels: outChannels,
    calibration: {
      analysis,
      calibrationGain,
    },
  };
}

/**
 * Analyzes an AudioBuffer's active RMS and sibilance profile.
 */
export function analyzeAudioBufferRms(buffer: AudioBuffer): AudioRmsAnalysis {
  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }
  return analyzeChannelsRms(channels, buffer.sampleRate);
}

/**
 * Enhances an AudioBuffer with native Dolby-style vocal cleanup, de-essing analysis,
 * and beat-calibrated RMS leveling for OfflineAudioContext / Web Audio rendering.
 */
export function enhanceVocalAudioBuffer(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  beatActiveRms: number = 0.16
): { buffer: AudioBuffer; calibration: VocalPresenceCalibration } {
  const inputChannels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    inputChannels.push(buffer.getChannelData(ch));
  }

  const { channels, calibration } = enhanceVocalChannelsDsp(inputChannels, buffer.sampleRate, beatActiveRms);
  const out = ctx.createBuffer(channels.length, buffer.length, buffer.sampleRate);
  for (let ch = 0; ch < channels.length; ch++) {
    out.copyToChannel(new Float32Array(channels[ch]), ch);
  }
  return { buffer: out, calibration };
}

const GATE_CONTROL_RATE_HZ = 100;
const GATE_FLOOR_GAIN = 0.035;
const cachedGateCurves = new WeakMap<AudioBuffer, Float32Array>();

/**
 * Computes a deterministic 100 Hz control-rate noise gate gain curve [0.035..1.0]
 * so live playback & un-enhanced exports suppress background noise before compression.
 */
export function computeNoiseGateCurve(
  channels: ReadonlyArray<Float32Array>,
  sampleRate: number
): Float32Array {
  const length = channels[0]?.length ?? 0;
  const fs = Math.max(8000, sampleRate);
  const step = Math.max(1, Math.round(fs / GATE_CONTROL_RATE_HZ));
  const frameCount = Math.max(2, Math.ceil(length / step));
  const curve = new Float32Array(frameCount);

  if (!channels.length || length === 0) {
    curve.fill(1);
    return curve;
  }

  const analysis = analyzeChannelsRms(channels, fs);
  if (analysis.activeRms <= 0.0005) {
    curve.fill(GATE_FLOOR_GAIN);
    return curve;
  }

  const gateOpenThresh = Math.max(0.0055, analysis.noiseFloor * 2.15, analysis.activeRms * 0.115);
  const gateFloorThresh = Math.max(0.0014, gateOpenThresh * 0.36);
  const frameDt = step / fs;
  const envAttack = Math.exp(-frameDt / 0.008);
  const envRelease = Math.exp(-frameDt / 0.110);
  const holdFrames = Math.max(1, Math.round(0.055 / frameDt));
  let holdCounter = 0;
  let fastEnv = analysis.noiseFloor;

  for (let f = 0; f < frameCount; f++) {
    const start = f * step;
    const end = Math.min(length, start + step);
    const count = Math.max(1, (end - start) * channels.length);
    let absSum = 0;
    for (let ch = 0; ch < channels.length; ch++) {
      const data = channels[ch];
      for (let i = start; i < end; i++) {
        absSum += data[i] < 0 ? -data[i] : data[i];
      }
    }
    const frameLevel = absSum / count;

    if (frameLevel >= gateOpenThresh) {
      holdCounter = holdFrames;
      fastEnv = envAttack * fastEnv + (1 - envAttack) * frameLevel;
    } else if (holdCounter > 0) {
      holdCounter--;
      fastEnv = Math.max(fastEnv, gateOpenThresh);
    } else {
      const coeff = frameLevel > fastEnv ? envAttack : envRelease;
      fastEnv = coeff * fastEnv + (1 - coeff) * frameLevel;
    }

    let gain = 1.0;
    if (fastEnv < gateOpenThresh) {
      const ratio = clamp((fastEnv - gateFloorThresh) / Math.max(EPSILON, gateOpenThresh - gateFloorThresh), 0, 1);
      const smooth = ratio * ratio * (3 - 2 * ratio);
      gain = GATE_FLOOR_GAIN + (1 - GATE_FLOOR_GAIN) * (smooth * smooth);
    }
    curve[f] = gain;
  }

  return curve;
}

/**
 * Returns the sliced 100 Hz noise-gate curve for a clip playback/export window.
 */
export function computeNoiseGateCurveSlice(
  buffer: AudioBuffer,
  offsetSec: number,
  durationSec: number
): Float32Array | null {
  if (!buffer || buffer.length <= 1 || durationSec <= 0.02) return null;

  let fullCurve = cachedGateCurves.get(buffer);
  if (!fullCurve) {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    fullCurve = computeNoiseGateCurve(channels, buffer.sampleRate);
    cachedGateCurves.set(buffer, fullCurve);
  }

  if (fullCurve.length < 2) return null;
  const startIdx = clamp(Math.floor(offsetSec * GATE_CONTROL_RATE_HZ), 0, fullCurve.length - 2);
  const endIdx = clamp(Math.ceil((offsetSec + durationSec) * GATE_CONTROL_RATE_HZ) + 1, startIdx + 2, fullCurve.length);
  return fullCurve.slice(startIdx, endIdx);
}
