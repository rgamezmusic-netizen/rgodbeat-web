// AudioBuffers are immutable once attached to a take. Weak keys let deleted
// takes release this cache along with their PCM, without a global memory leak.
const BLOCK_SIZE = 128;
const envelopes = new WeakMap<AudioBuffer, { blocks: Float32Array; maximum: number }>();

/** Peak envelope of the actual PCM, in equal time windows, including stereo. */
export function getBufferWaveform(buffer: AudioBuffer, requestedPoints: number): number[] {
  const points = Math.max(1, Math.min(buffer.length, Math.ceil(requestedPoints)));
  let envelope = envelopes.get(buffer);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) => buffer.getChannelData(ch));
  if (!envelope) {
    const blocks = new Float32Array(Math.ceil(buffer.length / BLOCK_SIZE));
    let maximum = 0;
    for (const channel of channels) {
      for (let i = 0; i < channel.length; i++) {
        const value = Math.abs(channel[i]);
        const block = Math.floor(i / BLOCK_SIZE);
        if (value > blocks[block]) blocks[block] = value;
        if (value > maximum) maximum = value;
      }
    }
    envelope = { blocks, maximum };
    envelopes.set(buffer, envelope);
  }
  const { blocks, maximum } = envelope;
  if (!maximum) return Array(points).fill(0);
  return Array.from({ length: points }, (_, point) => {
    const start = Math.floor(point * buffer.length / points);
    const end = Math.floor((point + 1) * buffer.length / points);
    const firstBlock = Math.ceil(start / BLOCK_SIZE);
    const lastBlock = Math.floor(end / BLOCK_SIZE);
    let peak = 0;
    if (firstBlock >= lastBlock) {
      for (const channel of channels) for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
    } else {
      for (let i = firstBlock; i < lastBlock; i++) peak = Math.max(peak, blocks[i]);
      // Measure partial edge blocks directly: a nearby transient must not leak
      // into the preceding/following silent time window at higher zoom.
      for (const channel of channels) {
        for (let i = start; i < firstBlock * BLOCK_SIZE; i++) peak = Math.max(peak, Math.abs(channel[i]));
        for (let i = lastBlock * BLOCK_SIZE; i < end; i++) peak = Math.max(peak, Math.abs(channel[i]));
      }
    }
    return peak / maximum;
  });
}

/** For legacy callers without PCM: preserve transients instead of interpolating them away. */
export function resampleWaveformPeaks(peaks: number[] | undefined, requestedPoints: number): number[] {
  const count = Math.max(1, Math.ceil(requestedPoints));
  if (!peaks?.length) return Array(count).fill(0);
  return Array.from({ length: count }, (_, i) => {
    const start = Math.floor(i * peaks.length / count);
    const end = Math.min(peaks.length, Math.max(start + 1, Math.ceil((i + 1) * peaks.length / count)));
    let peak = 0;
    for (let j = start; j < end; j++) if (Number.isFinite(peaks[j])) peak = Math.max(peak, Math.abs(peaks[j]));
    return peak;
  });
}
