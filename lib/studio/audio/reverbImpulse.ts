/**
 * Generates high-fidelity synthetic stereo impulse response AudioBuffers for ConvolverNode.
 * Specifically tuned for vocals: soft onset attack (zero clicks), high-frequency damping
 * (air absorption), and rich stereo decorrelation for a warm, lush, studio-grade vocal space.
 */
export function createReverbImpulse(
  audioCtx: BaseAudioContext,
  preset: 'ROOM' | 'PLATE' | 'HALL'
): AudioBuffer {
  let duration = 1.0;
  let decayRate = 3.2;
  let dampingFactor = 0.55; // High-frequency absorption speed
  let preDelaySec = 0.012; // 12ms pre-delay so vocal consonants remain crisp

  switch (preset) {
    case 'ROOM':
      duration = 0.9;
      decayRate = 4.2;
      dampingFactor = 0.65;
      preDelaySec = 0.008;
      break;
    case 'PLATE':
      duration = 1.9;
      decayRate = 2.4;
      dampingFactor = 0.45;
      preDelaySec = 0.016;
      break;
    case 'HALL':
      duration = 3.0;
      decayRate = 1.5;
      dampingFactor = 0.52;
      preDelaySec = 0.024;
      break;
  }

  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const impulseBuffer = audioCtx.createBuffer(2, length, sampleRate);
  const left = impulseBuffer.getChannelData(0);
  const right = impulseBuffer.getChannelData(1);

  const preDelaySamples = Math.floor(preDelaySec * sampleRate);
  const attackSamples = Math.floor(0.010 * sampleRate); // 10ms smooth ramp up (no t=0 DC pop)

  // One-pole lowpass filter state for frequency damping
  let filterL = 0;
  let filterR = 0;

  for (let i = 0; i < length; i++) {
    if (i < preDelaySamples) {
      left[i] = 0;
      right[i] = 0;
      continue;
    }

    const activeIndex = i - preDelaySamples;
    const t = activeIndex / sampleRate;

    // Smooth onset envelope to eliminate any sudden click at start
    const attack = activeIndex < attackSamples ? activeIndex / attackSamples : 1.0;

    // Exponential main decay
    const mainDecay = Math.exp(-t * decayRate);
    const envelope = attack * mainDecay;

    // Independent stereo white noise
    const rawNoiseL = (Math.random() * 2 - 1);
    const rawNoiseR = (Math.random() * 2 - 1);

    // Dynamic frequency damping: cutoff lowers as the tail decays (higher frequencies die out faster)
    const currentDamping = Math.min(0.92, dampingFactor + t * 0.15);
    filterL = filterL * currentDamping + rawNoiseL * (1 - currentDamping);
    filterR = filterR * currentDamping + rawNoiseR * (1 - currentDamping);

    // Early reflection micro-diffusion
    const earlyL = (filterL + rawNoiseL * 0.25) * envelope;
    const earlyR = (filterR + rawNoiseR * 0.25) * envelope;

    // Stereo widening with slight cross-feed
    left[i] = (earlyL * 0.85 + earlyR * 0.15);
    right[i] = (earlyR * 0.85 + earlyL * 0.15);
  }

  return impulseBuffer;
}

