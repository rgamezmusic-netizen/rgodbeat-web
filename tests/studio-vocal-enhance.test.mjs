import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const {
  analyzeChannelsRms,
  computeNoiseGateCurve,
  computeVocalCalibrationGain,
  enhanceVocalChannelsDsp,
} = loadSource('lib/studio/audio/vocalEnhance.ts');

function sineWave(freqHz, amp, durationSec, sampleRate = 48000, dcOffset = 0) {
  const length = Math.round(durationSec * sampleRate);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    out[i] = dcOffset + amp * Math.sin((2 * Math.PI * freqHz * i) / sampleRate);
  }
  return out;
}

function rmsSlice(buf, start, end) {
  let sum = 0;
  for (let i = start; i < end; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

test('active RMS analysis ignores long silent pauses between bars', () => {
  const sr = 48000;
  const clip = new Float32Array(sr * 3); // 3 seconds: 2s silent, 1s singing at 0.25 amplitude
  const singing = sineWave(320, 0.25, 1.0, sr);
  clip.set(singing, sr);

  const analysis = analyzeChannelsRms([clip], sr);
  const expectedRms = 0.25 / Math.SQRT2; // ~0.1768
  assert.ok(
    Math.abs(analysis.activeRms - expectedRms) < 0.015,
    `Expected active RMS near ${expectedRms.toFixed(4)}, got ${analysis.activeRms.toFixed(4)}`
  );
  assert.ok(analysis.noiseFloor < 0.001);
});

test('quiet mobile vocal take is calibrated upward relative to loud commercial beat', () => {
  const sr = 48000;
  // Simulate quiet phone vocal (0.045 peak) vs hot mastered beat (0.20 active RMS)
  const quietVocal = sineWave(240, 0.045, 1.5, sr, 0.02); // includes 0.02 DC offset
  const { channels, calibration } = enhanceVocalChannelsDsp([quietVocal], sr, 0.20);

  assert.ok(calibration.calibrationGain > 2.0, `Expected upward gain > 2x, got ${calibration.calibrationGain}`);

  const out = channels[0];
  let mean = 0;
  let peak = 0;
  for (let i = 0; i < out.length; i++) {
    assert.ok(Number.isFinite(out[i]), 'Sample must stay finite');
    mean += out[i];
    peak = Math.max(peak, Math.abs(out[i]));
  }
  mean /= out.length;

  assert.ok(Math.abs(mean) < 0.002, `DC offset should be removed cleanly, got mean=${mean}`);
  assert.ok(peak <= 0.99 && peak >= 0.14, `Calibrated vocal should sit upfront safely, peak=${peak}`);
});

test('noise floor downward expander attenuates hiss in silent gaps while keeping active singing full', () => {
  const sr = 48000;
  const length = sr * 2;
  const vocalWithHiss = new Float32Array(length);
  // Subtle continuous deterministic hiss (pseudo-noise amplitude ~0.004)
  for (let i = 0; i < length; i++) {
    vocalWithHiss[i] = 0.004 * Math.sin(i * 1.732) * Math.cos(i * 0.417);
  }
  // Active verse in middle 0.6s..1.4s at 0.16 amplitude
  for (let i = Math.round(sr * 0.6); i < Math.round(sr * 1.4); i++) {
    vocalWithHiss[i] += 0.16 * Math.sin((2 * Math.PI * 300 * i) / sr);
  }

  const beforeGapRms = rmsSlice(vocalWithHiss, 0, Math.round(sr * 0.3));
  const { channels } = enhanceVocalChannelsDsp([vocalWithHiss], sr, 0.16);
  const out = channels[0];
  const afterGapRms = rmsSlice(out, Math.round(sr * 0.1), Math.round(sr * 0.45));
  const activeOutRms = rmsSlice(out, Math.round(sr * 0.7), Math.round(sr * 1.3));

  assert.ok(afterGapRms < beforeGapRms * 0.65, `Gap hiss should be suppressed: before=${beforeGapRms}, after=${afterGapRms}`);
  assert.ok(activeOutRms > 0.12, `Active vocal body must remain upfront, got ${activeOutRms}`);
});

test('adaptive de-esser distinguishes warm dull mic from harsh sibilant mic', () => {
  const sr = 48000;
  const warmMic = sineWave(220, 0.2, 1.0, sr);
  const harshMic = new Float32Array(sr);
  for (let i = 0; i < sr; i++) {
    harshMic[i] = 0.12 * Math.sin((2 * Math.PI * 220 * i) / sr) + 0.14 * Math.sin((2 * Math.PI * 7200 * i) / sr);
  }

  const warmAnalysis = analyzeChannelsRms([warmMic], sr);
  const harshAnalysis = analyzeChannelsRms([harshMic], sr);

  assert.ok(
    warmAnalysis.deEsser6800Db > harshAnalysis.deEsser6800Db + 2.0,
    `Warm mic (${warmAnalysis.deEsser6800Db} dB) should receive much gentler de-essing than harsh mic (${harshAnalysis.deEsser6800Db} dB)`
  );
  assert.ok(harshAnalysis.deEsser6800Db <= -3.5);
});

test('DSP vocal enhancement is bit-for-bit deterministic across repeated exports', () => {
  const sr = 48000;
  const input = sineWave(330, 0.08, 0.5, sr);
  const a = enhanceVocalChannelsDsp([input], sr, 0.18).channels[0];
  const b = enhanceVocalChannelsDsp([input], sr, 0.18).channels[0];
  assert.deepEqual(a, b);
  assert.equal(computeVocalCalibrationGain(0.18, 0.25, 0.18) > 0.9, true);
});

test('noise gate curve attenuates background hiss between phrases while staying open on active vocals', () => {
  const sr = 48000;
  const clip = new Float32Array(sr * 2);
  for (let i = 0; i < clip.length; i++) {
    const t = i / sr;
    const isVocal = t >= 0.6 && t < 1.3;
    clip[i] = (isVocal ? 0.22 * Math.sin(2 * Math.PI * 240 * t) : 0) + 0.004 * Math.sin(2 * Math.PI * 60 * t);
  }

  const curve = computeNoiseGateCurve([clip], sr);
  const quietGapGain = curve[30]; // 300ms (inside initial background hiss)
  const activeVocalGain = curve[90]; // 900ms (inside active vocal)
  const postTailGapGain = curve[185]; // 1850ms (well after release)

  assert.ok(quietGapGain < 0.08, `Expected closed noise gate in quiet gap, got ${quietGapGain}`);
  assert.ok(activeVocalGain > 0.95, `Expected open noise gate during vocal, got ${activeVocalGain}`);
  assert.ok(postTailGapGain < 0.1, `Expected noise gate to close after vocal tail, got ${postTailGapGain}`);
});

