import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const { getBufferWaveform, resampleWaveformPeaks } = loadSource('lib/studio/audio/waveform.ts');
const { AudioEngine } = loadSource('lib/studio/audio/audioEngine.ts');
const { splitClip } = loadSource('lib/studio/audio/clipEditing.ts');
function buffer(channels, length, sampleRate) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return { numberOfChannels: channels, length, sampleRate, duration: length / sampleRate,
    getChannelData: ch => data[ch] };
}
const ctx = { createBuffer: buffer };

test('brief vocal transients retain their true time window at every zoom, including stereo', () => {
  const audio = buffer(2, 48000, 48000);
  audio.getChannelData(0)[12001] = 0.5;
  audio.getChannelData(1)[36003] = -1;
  for (const count of [1, 16, 173, 512, 900, 48000]) {
    const peaks = getBufferWaveform(audio, count);
    const expected = Array(count).fill(0);
    for (let i = 0; i < count; i++) {
      const start = Math.floor(i * audio.length / count), end = Math.floor((i + 1) * audio.length / count);
      if (12001 >= start && 12001 < end) expected[i] = 0.5;
      if (36003 >= start && 36003 < end) expected[i] = 1;
    }
    assert.deepEqual(peaks, expected);
  }
  const oldPeaks = Array(512).fill(0); oldPeaks[87] = 1;
  assert.equal(Math.max(...resampleWaveformPeaks(oldPeaks, 16)), 1);
});

test('a split keeps silence and phrases at their original absolute times', () => {
  const audio = buffer(1, 48000, 48000);
  audio.getChannelData(0)[12000] = 1; audio.getChannelData(0)[36000] = 1;
  const parts = splitClip(ctx, { id: 'voice', buffer: audio, duration: 1, startBeatOffset: 4 }, 4.5);
  assert.equal(parts.length, 2);
  for (const [index, part] of parts.entries()) {
    const peaks = getBufferWaveform(part.buffer, 500);
    assert.equal(peaks.findIndex(peak => peak > 0), 250);
    assert.equal(part.startBeatOffset + 250 / 500 * part.buffer.duration, index ? 4.75 : 4.25);
    assert.equal(peaks.filter(peak => peak > 0).length, 1);
  }
});

function captureEngine() {
  const finished = [], checkpoints = [];
  const engine = new AudioEngine({ onError() {}, onTimeUpdate() {}, onCountInBeat() {}, onRecordingAborted() {},
    onRecordingFinished: (track, audio, wave, start) => finished.push({ track, audio, wave, start }),
    onRecordingCheckpoint: chunk => checkpoints.push(chunk) });
  engine.ctx = { ...ctx, sampleRate: 1000, currentTime: 1.05, state: 'running' };
  engine.beatData = { duration: 10 };
  engine.captureStartFrame = 1000; engine.recordingTimelineOrigin = 1;
  engine.takeLatencyCompensation = 0; engine.recordingTrackId = 'lead1';
  engine.recordingTakeId = 'take'; engine.isRecording = true;
  return { engine, finished, checkpoints };
}

test('missing and repeated capture blocks cannot shift or duplicate later vocal phrases', () => {
  const { engine, checkpoints } = captureEngine();
  engine.collectPCM(new Float32Array(10).fill(0.2), 1000);
  engine.collectPCM(new Float32Array(10).fill(0.4), 1020);
  engine.collectPCM(new Float32Array(10).fill(0.8), 1020);
  const audio = engine.getRecordingCheckpointClip().clip.buffer;
  assert.equal(audio.length, 30);
  assert.ok(audio.getChannelData(0).subarray(10, 20).every(value => value === 0));
  assert.ok(audio.getChannelData(0).subarray(20).every(value => Math.abs(value - 0.4) < 1e-6));
  assert.deepEqual(checkpoints.map(chunk => chunk.index), [0, 1, 2]);
  assert.equal(checkpoints.reduce((sum, chunk) => sum + chunk.samples.length, 0), 30);
});

test('STOP retains the final samples and excludes audio captured while waiting for the recorder ACK', async () => {
  const { engine, finished } = captureEngine();
  engine.collectPCM(new Float32Array(10).fill(0.2), 1000);
  let ack;
  engine.flushRecorder = () => new Promise(resolve => { ack = resolve; });
  const stopping = engine.stopRecording();
  engine.ctx.currentTime = 1.2;
  engine.collectPCM(new Float32Array(100).fill(0.4), 1010);
  ack(1200); await stopping;
  assert.equal(finished.length, 1);
  assert.equal(finished[0].audio.length, 50);
  assert.equal(finished[0].start, 0);
});

test('compatibility capture keeps the last pending microphone block on STOP', async () => {
  const { engine, finished } = captureEngine();
  engine.ctx.createGain = () => ({ gain: { value: 0 }, connect() {}, disconnect() {} });
  engine.ctx.createScriptProcessor = () => ({ connect() {}, disconnect() {} });
  engine.micInputGain = { connect() {}, disconnect() {} };
  await engine.setupPCMRecorder();
  const processor = engine.scriptProcessor;
  engine.collectPCM(new Float32Array(40).fill(0.2), 1000);
  const stopping = engine.stopRecording();
  processor.onaudioprocess({ playbackTime: 1.06, inputBuffer: {
    getChannelData: () => new Float32Array(20).fill(0.4),
  } });
  await stopping;
  assert.equal(finished[0].audio.length, 50);
  assert.ok(finished[0].audio.getChannelData(0).subarray(40).every(value => Math.abs(value - 0.4) < 1e-6));
});

test('the visual cursor uses the output clock across a loop boundary without changing capture timing', () => {
  const { engine } = captureEngine();
  engine.isPlaying = true; engine.playbackScheduledCtxTime = 10;
  engine.playbackStartCtxTime = 11; // render clock already entered the next cycle
  engine.playbackDisplayOrigin = 10;
  engine.playbackLoop = { start: 1, end: 2 };
  engine.ctx.currentTime = 12.1;
  engine.ctx.getOutputTimestamp = () => ({ contextTime: 11.95, performanceTime: performance.now() });
  const position = engine.readAudiblePlaybackPosition();
  assert.ok(position >= 1.95 && position < 1.96);
  assert.equal(engine.playbackStartCtxTime, 11);
});
