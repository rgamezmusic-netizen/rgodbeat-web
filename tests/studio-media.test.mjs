import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

function mediaEnvironment(run) {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  const stream = { active: true, getAudioTracks: () => [track], getTracks: () => [track] };
  const modes = [];
  let mode = 'playback';
  const session = { get type() { return mode; }, set type(value) { modes.push(value); mode = value; } };
  const mediaDevices = { getUserMedia: async () => {
    assert.equal(mode, 'play-and-record', 'microphone must retain its capture audio session');
    return stream;
  } };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { audioSession: session, mediaDevices } });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  const errors = [];
  const { AudioEngine } = loadSource('lib/studio/audio/audioEngine.ts');
  const engine = new AudioEngine({ onError: message => errors.push(message) });
  engine.ctx = { state: 'running', createBuffer: () => ({}), createBufferSource: () => ({ connect() {}, start() {} }) };
  return Promise.resolve().then(() => run({ engine, stream, track, modes, errors, mediaDevices })).finally(() => {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow); else delete globalThis.window;
  });
}

test('REC and the bubbling first-click unlock cannot switch Safari back to playback', () => mediaEnvironment(async ({ engine, modes, errors }) => {
  const preparation = engine.prepareMicrophone();
  await engine.unlockAudio();
  assert.equal(await preparation, true, errors.join('\n'));
  assert.deepEqual(modes, ['play-and-record']);
  engine.releaseMicrophone();
  assert.equal(modes.at(-1), 'playback');
}));

test('REC requests microphone and resumes audio before yielding the user gesture', () => mediaEnvironment(async ({ engine, mediaDevices, stream }) => {
  let requested = false, resumed = false;
  mediaDevices.getUserMedia = async () => { requested = true; return stream; };
  engine.ctx.state = 'suspended';
  engine.ctx.resume = async () => { resumed = true; engine.ctx.state = 'running'; };
  const preparation = engine.prepareMicrophone();
  assert.equal(requested, true);
  assert.equal(resumed, true);
  assert.equal(await preparation, true);
  engine.releaseMicrophone();
}));

test('concurrent microphone requests share one permission prompt', () => mediaEnvironment(async ({ engine, mediaDevices, stream }) => {
  let resolve, calls = 0;
  mediaDevices.getUserMedia = () => { calls++; return new Promise(r => { resolve = r; }); };
  const first = engine.getMicrophoneStream(), second = engine.getMicrophoneStream();
  engine.triggerMobileSpeakerRouting();
  assert.equal(calls, 1);
  resolve(stream);
  assert.equal(await first, stream); assert.equal(await second, stream);
  engine.releaseMicrophone();
}));

test('cancel during microphone permission releases a late stream instead of leaking the microphone', () => mediaEnvironment(async ({ engine, mediaDevices, stream, track }) => {
  let resolve;
  mediaDevices.getUserMedia = () => new Promise(r => { resolve = r; });
  const pending = engine.getMicrophoneStream();
  engine.releaseMicrophone();
  resolve(stream);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(track.readyState, 'ended');
  assert.equal(engine.micStream, null);
}));

test('permission rejection restores playback and does not retry the microphone', () => mediaEnvironment(async ({ engine, mediaDevices, modes, errors }) => {
  let calls = 0;
  mediaDevices.getUserMedia = async () => { calls++; throw new DOMException('Denied', 'NotAllowedError'); };
  assert.equal(await engine.prepareMicrophone(), false);
  assert.equal(calls, 1); assert.equal(modes.at(-1), 'playback');
  assert.match(errors[0], /Permiso de micrófono denegado/);
}));

test('unsupported microphone constraints retry once with basic audio', () => mediaEnvironment(async ({ engine, mediaDevices, stream }) => {
  const calls = [];
  mediaDevices.getUserMedia = async options => {
    calls.push(options);
    if (calls.length === 1) throw new DOMException('Unsupported', 'OverconstrainedError');
    return stream;
  };
  assert.equal(await engine.prepareMicrophone(), true);
  assert.equal(calls.length, 2); assert.deepEqual(calls[1], { audio: true });
  engine.releaseMicrophone();
}));

test('failed audio activation never presents a silent beat as playing', () => mediaEnvironment(async ({ engine, errors }) => {
  engine.beatData = {};
  engine.ctx.state = 'suspended';
  engine.ctx.resume = async () => { throw new DOMException('Gesture required', 'NotAllowedError'); };
  await engine.play();
  assert.equal(engine.getIsPlaying(), false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /navegador bloqueó el audio/);
}));

test('a stalled AudioContext resume returns a retryable failure', () => mediaEnvironment(async ({ engine }) => {
  const originalTimer = globalThis.setTimeout;
  engine.ctx.state = 'interrupted';
  engine.ctx.resume = () => new Promise(() => {});
  globalThis.setTimeout = (callback, delay) => { assert.equal(delay, 5000); return originalTimer(callback, 1); };
  try { await assert.rejects(engine.unlockAudio(), /Toca Play o REC/); }
  finally { globalThis.setTimeout = originalTimer; }
}));

test('waiting for the microphone dialog does not start an audio timeout', () => mediaEnvironment(async ({ engine, mediaDevices, stream }) => {
  let resolve, timers = 0;
  const originalTimer = globalThis.setTimeout;
  mediaDevices.getUserMedia = () => new Promise(r => { resolve = r; });
  engine.ctx.state = 'suspended';
  engine.ctx.resume = () => new Promise(() => {});
  globalThis.setTimeout = (...args) => { timers++; return originalTimer(...args); };
  try {
    const preparation = engine.prepareMicrophone();
    await Promise.resolve();
    assert.equal(timers, 0, 'the user can take their time granting microphone access');
    engine.ctx.state = 'running'; resolve(stream);
    assert.equal(await preparation, true);
    engine.releaseMicrophone();
  } finally { globalThis.setTimeout = originalTimer; }
}));
