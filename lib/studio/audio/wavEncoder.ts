import { VocalClip } from '../types/audio';

/**
 * Encodes an AudioBuffer into standard PCM WAV format.
 * Supports 24-bit (studio standard) and 16-bit PCM.
 * Defaults to 24-bit / 48kHz for pristine professional studio export.
 */
export function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 24): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const numSamples = buffer.length;
  const dataByteLength = numSamples * blockAlign;
  const headerByteLength = 44;
  const totalLength = headerByteLength + dataByteLength;

  const arrayBuffer = new ArrayBuffer(totalLength);
  const view = new DataView(arrayBuffer);

  // Helper write ASCII string to buffer
  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + dataByteLength, true);
  /* RIFF type */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (1 = PCM) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * blockAlign, true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, blockAlign, true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, dataByteLength, true);

  // Interleave channels
  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let offset = 44;
  if (bitDepth === 24) {
    // 24-bit signed PCM [-8388608, 8388607]
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? Math.round(sample * 0x800000) : Math.round(sample * 0x7fffff);
        // Write 3 bytes little-endian
        view.setUint8(offset, intSample & 0xff);
        view.setUint8(offset + 1, (intSample >> 8) & 0xff);
        view.setUint8(offset + 2, (intSample >> 16) & 0xff);
        offset += 3;
      }
    }
  } else {
    // 16-bit signed PCM [-32768, 32767]
    for (let i = 0; i < numSamples; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = channels[c][i];
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Extracts a normalized waveform array (e.g. 60 points) from an AudioBuffer.
 * Accurately differentiates true silence (flatline 0) from vocal singing peaks
 * so silent pauses don't show phantom waveforms.
 */
export function extractWaveformPeaks(buffer: AudioBuffer, points: number = 60): number[] {
  const channelData = buffer.getChannelData(0);
  if (!channelData || channelData.length === 0) return Array(points).fill(0);

  const step = Math.floor(channelData.length / points);
  const rawPeaks: number[] = [];
  let absoluteMax = 0;

  for (let i = 0; i < points; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && start + j < channelData.length; j++) {
      const absVal = Math.abs(channelData[start + j]);
      if (absVal > max) max = absVal;
    }
    rawPeaks.push(max);
    if (max > absoluteMax) absoluteMax = max;
  }

  // Realistic silence gate threshold: background ambient room noise is < 4% of singing peak
  const silenceThreshold = Math.max(0.005, absoluteMax * 0.04);

  return rawPeaks.map((p) => {
    if (p < silenceThreshold) return 0; // True silence -> flatline
    const normalized = absoluteMax > 0.001 ? p / absoluteMax : 0;
    // Map singing peaks dynamically between 0.10 and 1.0
    return Number((0.10 + normalized * 0.90).toFixed(3));
  });
}

/**
 * Accurately slices an AudioBuffer from startSec for durationSec with zero-crossing micro-fades.
 */
export function sliceAudioBuffer(
  audioCtx: AudioContext | BaseAudioContext,
  source: AudioBuffer,
  startSec: number,
  durationSec: number
): AudioBuffer | null {
  if (!source || durationSec <= 0.05) return null;
  const sampleRate = source.sampleRate;
  const numChannels = source.numberOfChannels;
  const startSample = Math.max(0, Math.floor(startSec * sampleRate));
  const numSamples = Math.min(source.length - startSample, Math.floor(durationSec * sampleRate));
  if (numSamples <= 0) return null;

  const sliced = audioCtx.createBuffer(numChannels, numSamples, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    sliced.getChannelData(ch).set(
      source.getChannelData(ch).subarray(startSample, startSample + numSamples)
    );
  }

  // Apply 2ms micro-fade in & out to eliminate zero-crossing pops
  const fadeLen = Math.min(Math.floor(sampleRate * 0.002), Math.floor(numSamples / 4));
  if (fadeLen > 0) {
    for (let ch = 0; ch < numChannels; ch++) {
      const data = sliced.getChannelData(ch);
      for (let i = 0; i < fadeLen; i++) {
        data[i] *= (i / fadeLen);
        data[numSamples - 1 - i] *= (i / fadeLen);
      }
    }
  }

  return sliced;
}

/**
 * Non-destructive DAW punch-in overwrite on vocal clips:
 * 1. Preserves completely non-overlapping takes (e.g. verse vs chorus on the same track).
 * 2. If a new take partially overlaps an older take, only the overwritten segment is replaced;
 *    the non-overwritten portions (before or after) continue seamlessly.
 * 3. Returns the clean, sorted clip timeline for the track.
 */
export function punchInClips(
  audioCtx: AudioContext | BaseAudioContext,
  existingClips: VocalClip[],
  newClip: VocalClip
): VocalClip[] {
  const newStart = newClip.startBeatOffset;
  const newEnd = newStart + newClip.duration;
  const survivingClips: VocalClip[] = [];

  for (const c of existingClips) {
    if (!c.buffer) continue;
    const cStart = c.startBeatOffset;
    const cEnd = c.startBeatOffset + c.duration;

    // Case 1: No overlap with [newStart, newEnd]
    if (cEnd <= newStart + 0.03 || cStart >= newEnd - 0.03) {
      survivingClips.push(c);
      continue;
    }

    // Case 2: New take completely covers this clip -> clip is overwritten entirely
    if (newStart <= cStart + 0.03 && newEnd >= cEnd - 0.03) {
      continue;
    }

    // Case 3: Overlap is partial! Keep the non-overwritten portions.
    // Left non-overwritten portion:
    if (cStart < newStart - 0.05) {
      const leftDuration = newStart - cStart;
      const leftBuffer = sliceAudioBuffer(audioCtx, c.buffer, 0, leftDuration);
      if (leftBuffer && leftBuffer.duration > 0.05) {
        survivingClips.push({
          ...c,
          id: `${c.id}-p1-${Date.now()}`,
          buffer: leftBuffer,
          tunedBuffer: null,
          startBeatOffset: cStart,
          duration: leftBuffer.duration,
          waveformSample: extractWaveformPeaks(leftBuffer, 36),
          isLocked: true,
        });
      }
    }

    // Right non-overwritten portion:
    if (cEnd > newEnd + 0.05) {
      const offsetInClip = newEnd - cStart;
      const rightDuration = cEnd - newEnd;
      const rightBuffer = sliceAudioBuffer(audioCtx, c.buffer, offsetInClip, rightDuration);
      if (rightBuffer && rightBuffer.duration > 0.05) {
        survivingClips.push({
          ...c,
          id: `${c.id}-p2-${Date.now()}`,
          buffer: rightBuffer,
          tunedBuffer: null,
          startBeatOffset: newEnd,
          duration: rightBuffer.duration,
          waveformSample: extractWaveformPeaks(rightBuffer, 36),
          isLocked: true,
        });
      }
    }
  }

  // Insert the new take
  survivingClips.push(newClip);

  // Sort by startBeatOffset
  survivingClips.sort((a, b) => a.startBeatOffset - b.startBeatOffset);

  return survivingClips;
}
