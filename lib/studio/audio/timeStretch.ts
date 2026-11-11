/**
 * Non-destructive, pitch-preserving Time Stretch Engine for RGodBeat Studio.
 * Uses Phase-Locked Waveform Similarity Overlap-Add (WSOLA) with Constant Overlap-Add (COLA)
 * synthesis hopping to scale duration (0.25x to 4.0x) without altering vocal pitch or formants.
 */

// Hann window generator (satisfies Constant Overlap-Add at 50% and 75% overlap)
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
  if (size <= 1) {
    win.fill(1);
    return win;
  }
  const factor = (2 * Math.PI) / (size - 1);
  for (let i = 0; i < size; i++) {
    win[i] = 0.5 * (1 - Math.cos(factor * i));
  }
  return win;
}

/**
 * Time-stretches an AudioBuffer by ratio (e.g. 1.25 = 25% longer, 0.8 = 20% shorter)
 * while preserving the pitch and formants of the source audio.
 */
export function timeStretchAudioBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  ratio: number
): AudioBuffer {
  const clampedRatio = Math.max(0.25, Math.min(4.0, ratio));
  // Identity: if ratio is essentially 1.0, return clean clone
  if (Math.abs(clampedRatio - 1.0) < 0.003) {
    const clone = ctx.createBuffer(source.numberOfChannels, source.length, source.sampleRate);
    for (let ch = 0; ch < source.numberOfChannels; ch++) {
      clone.getChannelData(ch).set(source.getChannelData(ch));
    }
    return clone;
  }

  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;
  const inLength = source.length;
  const outLength = Math.max(1, Math.round(inLength * clampedRatio));

  const outBuffer = ctx.createBuffer(numChannels, outLength, sampleRate);

  // Vocal-optimized grain window (~28ms: e.g. 1344 samples at 48kHz)
  // Fixed synthesis hop at 25% of window size (75% overlap) guarantees smooth COLA energy at all ratios.
  const windowSize = Math.max(256, Math.min(2048, Math.min(inLength, Math.round(sampleRate * 0.028) & ~3)));
  const synthesisHop = Math.max(1, Math.floor(windowSize / 4));
  // Search tolerance (~10ms) to lock onto fundamental vocal pitch period
  const searchRange = Math.max(16, Math.floor(windowSize * 0.35));

  const window = createHannWindow(windowSize);
  const inputChannels: Float32Array[] = [];
  const outputChannels: Float32Array[] = [];
  const normWeight = new Float32Array(outLength);

  for (let ch = 0; ch < numChannels; ch++) {
    inputChannels.push(source.getChannelData(ch));
    outputChannels.push(outBuffer.getChannelData(ch));
  }

  const maxValidInStart = Math.max(0, inLength - windowSize);
  const corrLength = Math.min(windowSize - synthesisHop, Math.floor(windowSize * 0.5));
  const corrStride = Math.max(1, Math.floor(corrLength / 96));

  let outPos = 0;
  let lastGrainStart = 0;

  while (outPos < outLength) {
    const idealInPos = Math.min(maxValidInStart, Math.max(0, Math.round(outPos / clampedRatio)));
    let bestOffset = 0;

    if (outPos > 0 && maxValidInStart > 0) {
      // In WSOLA, the previous grain started at lastGrainStart.
      // After synthesisHop samples, the natural phase-continuous continuation in the input is:
      const naturalProgression = Math.min(maxValidInStart, lastGrainStart + synthesisHop);
      const refIn = inputChannels[0];

      const minDelta = Math.max(-searchRange, -idealInPos);
      const maxDelta = Math.min(searchRange, maxValidInStart - idealInPos);

      let maxCorr = -Infinity;

      // Coarse-to-fine search for phase alignment
      const step = Math.max(1, Math.floor((maxDelta - minDelta) / 48));
      let coarseBestDelta = 0;

      for (let delta = minDelta; delta <= maxDelta; delta += step) {
        const candidate = idealInPos + delta;
        let corr = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < corrLength; i += corrStride) {
          const a = refIn[naturalProgression + i] || 0;
          const b = refIn[candidate + i] || 0;
          corr += a * b;
          normA += a * a;
          normB += b * b;
        }

        const denom = Math.sqrt(normA * normB) + 1e-7;
        // Slight preference for smaller delta to prevent drift in silence
        const score = corr / denom - Math.abs(delta) * (0.0001 / searchRange);
        if (score > maxCorr) {
          maxCorr = score;
          coarseBestDelta = delta;
        }
      }

      // Fine sample-accurate refinement around coarseBestDelta
      const fineMin = Math.max(minDelta, coarseBestDelta - step);
      const fineMax = Math.min(maxDelta, coarseBestDelta + step);
      bestOffset = coarseBestDelta;

      for (let delta = fineMin; delta <= fineMax; delta++) {
        const candidate = idealInPos + delta;
        let corr = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < corrLength; i += corrStride) {
          const a = refIn[naturalProgression + i] || 0;
          const b = refIn[candidate + i] || 0;
          corr += a * b;
          normA += a * a;
          normB += b * b;
        }

        const denom = Math.sqrt(normA * normB) + 1e-7;
        const score = corr / denom - Math.abs(delta) * (0.0001 / searchRange);
        if (score > maxCorr) {
          maxCorr = score;
          bestOffset = delta;
        }
      }
    }

    const grainStart = Math.max(0, Math.min(maxValidInStart, idealInPos + bestOffset));
    lastGrainStart = grainStart;

    const remainingOut = Math.min(windowSize, outLength - outPos);
    for (let i = 0; i < remainingOut; i++) {
      const w = window[i];
      const inIdx = grainStart + i;
      const outIdx = outPos + i;
      normWeight[outIdx] += w;
      if (inIdx < inLength) {
        for (let ch = 0; ch < numChannels; ch++) {
          outputChannels[ch][outIdx] += inputChannels[ch][inIdx] * w;
        }
      }
    }

    outPos += synthesisHop;
  }

  // Normalize by overlap-add window weights for constant amplitude
  for (let i = 0; i < outLength; i++) {
    const weight = normWeight[i];
    if (weight > 1e-4) {
      const inv = 1.0 / weight;
      for (let ch = 0; ch < numChannels; ch++) {
        outputChannels[ch][i] *= inv;
      }
    }
  }

  return outBuffer;
}
