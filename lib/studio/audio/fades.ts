/**
 * Non-destructive Fade In and Fade Out processing for RGodBeat Studio.
 * Applies smooth studio equal-power (quarter-sine) curves to prevent clicks, pops,
 * and unnatural volume dips.
 */

export function applyFadesToBuffer(
  ctx: BaseAudioContext,
  source: AudioBuffer,
  fadeInSec: number = 0,
  fadeOutSec: number = 0
): AudioBuffer {
  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;
  const length = source.length;

  const inDuration = Math.max(0, fadeInSec);
  const outDuration = Math.max(0, fadeOutSec);

  if (inDuration <= 0 && outDuration <= 0) {
    const clone = ctx.createBuffer(numChannels, length, sampleRate);
    for (let ch = 0; ch < numChannels; ch++) {
      clone.getChannelData(ch).set(source.getChannelData(ch));
    }
    return clone;
  }

  // Cap fades so they don't exceed half the clip duration if overlapping
  const maxFadeSamples = Math.floor(length / 2);
  const inSamples = Math.min(maxFadeSamples, Math.round(inDuration * sampleRate));
  const outSamples = Math.min(maxFadeSamples, Math.round(outDuration * sampleRate));

  const outBuffer = ctx.createBuffer(numChannels, length, sampleRate);

  for (let ch = 0; ch < numChannels; ch++) {
    const inData = source.getChannelData(ch);
    const outData = outBuffer.getChannelData(ch);
    outData.set(inData);

    // Apply equal-power Fade In
    if (inSamples > 0) {
      const step = (Math.PI * 0.5) / inSamples;
      for (let i = 0; i < inSamples; i++) {
        const gain = Math.sin(i * step);
        outData[i] *= gain;
      }
    }

    // Apply equal-power Fade Out
    if (outSamples > 0) {
      const step = (Math.PI * 0.5) / outSamples;
      const startOut = length - outSamples;
      for (let i = 0; i < outSamples; i++) {
        const gain = Math.cos(i * step);
        outData[startOut + i] *= gain;
      }
    }
  }

  return outBuffer;
}

