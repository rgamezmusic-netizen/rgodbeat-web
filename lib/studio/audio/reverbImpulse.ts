/**
 * Generates synthetic stereo impulse response AudioBuffers for ConvolverNode reverb.
 */
export function createReverbImpulse(
  audioCtx: BaseAudioContext,
  preset: 'ROOM' | 'PLATE' | 'HALL'
): AudioBuffer {
  let duration = 1.0;
  let decayRate = 3.0;
  let diffusion = 0.5;

  switch (preset) {
    case 'ROOM':
      duration = 0.8;
      decayRate = 4.5;
      diffusion = 0.4;
      break;
    case 'PLATE':
      duration = 1.8;
      decayRate = 2.8;
      diffusion = 0.8;
      break;
    case 'HALL':
      duration = 3.2;
      decayRate = 1.6;
      diffusion = 0.9;
      break;
  }

  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulseBuffer = audioCtx.createBuffer(2, length, sampleRate);
  const left = impulseBuffer.getChannelData(0);
  const right = impulseBuffer.getChannelData(1);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Exponential decay curve
    const envelope = Math.exp(-t * decayRate);

    // Random white noise modulated by envelope
    const noiseL = (Math.random() * 2 - 1) * envelope;
    const noiseR = (Math.random() * 2 - 1) * envelope;

    // Cross-channel diffusion for stereo width
    left[i] = noiseL * (1 - diffusion * 0.3) + noiseR * (diffusion * 0.3);
    right[i] = noiseR * (1 - diffusion * 0.3) + noiseL * (diffusion * 0.3);
  }

  return impulseBuffer;
}
