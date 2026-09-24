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
 * Extracts a normalized waveform array (e.g. 50 points) from an AudioBuffer.
 */
export function extractWaveformPeaks(buffer: AudioBuffer, points: number = 60): number[] {
  const channelData = buffer.getChannelData(0);
  const step = Math.floor(channelData.length / points);
  const peaks: number[] = [];

  for (let i = 0; i < points; i++) {
    const start = i * step;
    let max = 0;
    for (let j = 0; j < step && start + j < channelData.length; j++) {
      const absVal = Math.abs(channelData[start + j]);
      if (absVal > max) max = absVal;
    }
    peaks.push(Number(max.toFixed(3)));
  }

  // Normalize to 0.1 - 1.0
  const maxPeak = Math.max(...peaks, 0.01);
  return peaks.map((p) => Math.max(0.12, p / maxPeak));
}
