/**
 * Non-destructive, pitch-preserving Time Stretch Engine for RGodBeat Studio.
 * Uses Waveform Similarity Overlap-Add (WSOLA) to scale duration (0.25x to 4.0x)
 * without altering original vocal pitch, formants or key.
 */

// Hann window generator
function createHannWindow(size: number): Float32Array {
  const win = new Float32Array(size);
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
  if (Math.abs(clampedRatio - 1.0) < 0.005) {
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

  // Frame size ~40ms (2048 at 48kHz, 1024 at low rates)
  const windowSize = Math.max(512, Math.min(4096, 1 << Math.round(Math.log2(sampleRate * 0.04))));
  const analysisHop = Math.floor(windowSize / 4); // 75% overlap
  const synthesisHop = Math.max(1, Math.round(analysisHop * clampedRatio));
  const searchRange = Math.floor(windowSize / 8); // Search window for phase alignment

  const window = createHannWindow(windowSize);
  const inputChannels: Float32Array[] = [];
  const outputChannels: Float32Array[] = [];
  const normWeight = new Float32Array(outLength);

  for (let ch = 0; ch < numChannels; ch++) {
    inputChannels.push(source.getChannelData(ch));
    outputChannels.push(outBuffer.getChannelData(ch));
  }

  let outPos = 0;
  let inPos = 0;
  let lastInPos = 0;

  while (outPos + windowSize <= outLength && inPos + windowSize <= inLength) {
    // Find optimal alignment offset using cross-correlation on primary channel
    let bestOffset = 0;
    if (outPos > 0) {
      let maxCorr = -Infinity;
      const refIn = inputChannels[0];
      const targetPos = inPos;
      const naturalProgression = lastInPos + analysisHop;

      const minDelta = Math.max(-searchRange, -targetPos);
      const maxDelta = Math.min(searchRange, inLength - windowSize - targetPos);

      for (let delta = minDelta; delta <= maxDelta; delta += 2) {
        const candidate = targetPos + delta;
        let corr = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < windowSize; i += 8) {
          const a = refIn[naturalProgression + i] || 0;
          const b = refIn[candidate + i] || 0;
          corr += a * b;
          normA += a * a;
          normB += b * b;
        }

        const denom = Math.sqrt(normA * normB) + 1e-6;
        const normalizedCorr = corr / denom;

        if (normalizedCorr > maxCorr) {
          maxCorr = normalizedCorr;
          bestOffset = delta;
        }
      }
    }

    const grainStart = inPos + bestOffset;
    lastInPos = grainStart;

    // Overlap-add windowed grain across all channels
    for (let i = 0; i < windowSize; i++) {
      const w = window[i];
      const inIdx = grainStart + i;
      const outIdx = outPos + i;
      if (outIdx >= outLength) break;

      normWeight[outIdx] += w;
      if (inIdx >= 0 && inIdx < inLength) {
        for (let ch = 0; ch < numChannels; ch++) {
          outputChannels[ch][outIdx] += inputChannels[ch][inIdx] * w;
        }
      }
    }

    inPos = Math.round((outPos + synthesisHop) / clampedRatio);
    outPos += synthesisHop;
  }

  // Normalize by overlap-add window weights to ensure constant energy
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

