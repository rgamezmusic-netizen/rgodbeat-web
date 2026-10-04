import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getProjectDuration, getRenderDuration, splitClip, trimClip } from '../lib/studio/audio/clipEditing';
import { audioBufferToWav, extractWaveformPeaks, punchInClips } from '../lib/studio/audio/wavEncoder';
import { processVocalTune } from '../lib/studio/audio/pitchCorrection';
import { AudioEngine } from '../lib/studio/audio/audioEngine';
import type { VocalClip, VocalFX, VocalTrack } from '../lib/studio/types/audio';

class TestBuffer {
  data: Float32Array[];
  constructor(public numberOfChannels: number, public length: number, public sampleRate: number) {
    this.data = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  get duration() { return this.length / this.sampleRate; }
  getChannelData(channel: number) { return this.data[channel]; }
}
const ctx = { createBuffer: (channels: number, length: number, rate: number) => new TestBuffer(channels, length, rate) } as unknown as BaseAudioContext;
const fx: VocalFX = {
  tune: { enabled: true, speed: 0.5, rootKey: 'A', scaleMode: 'minor', humanize: 0.1 },
  eq: { lowCut: false, lowCutFreq: 100, low: 0, mid: 0, high: 0 }, comp: { amount: 0 },
  saturation: { amount: 0 }, delay: { division: 'OFF', mix: 0, feedback: 0 }, reverb: { preset: 'HALL', mix: 0.2 },
};
function clip(id: string, start: number, seconds: number): VocalClip {
  const buffer = ctx.createBuffer(1, Math.round(seconds * 48000), 48000);
  buffer.getChannelData(0).fill(0.2);
  return { id, startBeatOffset: start, buffer, duration: buffer.duration, isLocked: true };
}

async function main() {
  const original = clip('original', 1, 2);
  original.tunedBuffer = ctx.createBuffer(1, original.buffer.length, 48000);
  original.tunedBuffer.getChannelData(0).fill(0.4);
  const cut = 1 + 23457 / 48000;
  const parts = splitClip(ctx, original, cut)!;
  assert.equal(parts.length, 2);
  assert.equal(parts[0].buffer.length + parts[1].buffer.length, original.buffer.length);
  assert.equal(parts[1].startBeatOffset, cut);
  assert.equal(parts[0].tunedBuffer?.length, parts[0].buffer.length);
  assert.equal(parts[1].tunedBuffer?.length, parts[1].buffer.length);
  assert(parts.every(part => part.isLocked));
  assert.equal(original.buffer.getChannelData(0)[0], Math.fround(0.2), 'edit must not mutate its source');
  assert.equal(trimClip(ctx, original, 2, 3)?.buffer.length, 48000);
  assert.equal(splitClip(ctx, original, 4), null);
  const punch = punchInClips(ctx, [original], clip('new', 1.01, 0.5));
  assert.equal(punch.length, 3, 'a 10 ms leading fragment must survive punch-in');
  assert(punch.some(part => part.id.startsWith('original-p1') && part.buffer.length === 480));
  const track = { id: 'lead1', name: 'Lead', fx, clips: [clip('tail', 5, 1)], buffer: null } as VocalTrack;
  assert.equal(getProjectDuration(2, [track]), 6);
  assert.equal(getRenderDuration(2, [track], 120), 9, 'render includes the hall tail');
  assert.equal(extractWaveformPeaks(clip('tiny', 0, 1 / 48000).buffer, 60).length, 60);
  assert(extractWaveformPeaks(clip('tiny', 0, 1 / 48000).buffer, 60).some(value => value > 0));
  const encoded = new DataView(await audioBufferToWav(original.buffer, 24).arrayBuffer());
  assert.equal(encoded.getUint32(24, true), 48000);
  assert.equal(encoded.getUint16(34, true), 24);
  assert.equal(encoded.getUint32(40, true), original.buffer.length * 3);
  // Float vocal backups must retain low-level detail and FX headroom exactly.
  const precise = ctx.createBuffer(1, 4, 44100);
  precise.getChannelData(0).set([0.123456789, 1.25, -1.25, 1e-12]);
  const floatWav = new DataView(await audioBufferToWav(precise, 32).arrayBuffer());
  assert.equal(floatWav.getUint16(20, true), 3);
  assert.equal(floatWav.getUint16(22, true), 1);
  assert.equal(floatWav.getUint32(24, true), 44100, 'encoding must keep the recorded rate');
  assert.equal(floatWav.getUint32(44, true), precise.length, 'fact chunk must contain the frame count');
  assert.equal(floatWav.getUint32(52, true), precise.length * 4);
  assert.equal(floatWav.byteLength, 56 + precise.length * 4);
  assert.equal(floatWav.getUint32(4, true) + 8, floatWav.byteLength);
  for (let i = 0; i < precise.length; i++) {
    assert.equal(floatWav.getFloat32(56 + i * 4, true), precise.getChannelData(0)[i], 'original float samples must not be quantized or clipped');
  }
  const short = clip('short', 0, 0.01).buffer;
  const tuned = await processVocalTune(ctx, short, fx.tune);
  assert.equal(tuned.length, short.length);
  assert(Array.from(tuned.getChannelData(0)).every(Number.isFinite));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(processVocalTune(ctx, original.buffer, fx.tune, controller.signal), { name: 'AbortError' });

  // Exercise the actual worklet's scheduled sample gate, switch boundary and final flush.
  const messages: Array<{ type: string; samples?: Float32Array; frame: number; id?: number }> = [];
  let Processor: new () => { port: { onmessage: (event: { data: object }) => void }; process: (input: Float32Array[][], output: Float32Array[][]) => boolean };
  const sandbox = {
    Float32Array, currentFrame: 0,
    AudioWorkletProcessor: class { port = { onmessage: () => {}, postMessage: (message: typeof messages[number]) => messages.push(message) }; },
    registerProcessor: (_name: string, ctor: typeof Processor) => { Processor = ctor; },
  };
  vm.runInNewContext(fs.readFileSync(new URL('../public/studio/pcm-recorder.js', import.meta.url), 'utf8'), sandbox);
  const recorder = new Processor!();
  recorder.port.onmessage({ data: { type: 'start', startFrame: 64 } });
  const output = new Float32Array(128).fill(1);
  recorder.process([[new Float32Array(128).fill(0.1)]], [[output]]);
  assert(output.every(value => value === 0), 'the microphone must not feed speakers');
  sandbox.currentFrame = 128;
  recorder.port.onmessage({ data: { type: 'boundary', id: 1 } });
  assert.equal(messages[0].samples?.length, 64);
  assert.equal(messages[0].frame, 64);
  assert.equal(messages[1].type, 'ack');
  recorder.process([[new Float32Array(128).fill(0.7)]], [[output]]);
  sandbox.currentFrame = 256;
  recorder.port.onmessage({ data: { type: 'stop', id: 2 } });
  assert.equal(messages[2].samples?.length, 128);
  assert(messages[2].samples?.every(sample => sample === Math.fround(0.7)));
  recorder.process([[new Float32Array(128)]], [[output]]);
  assert.equal(messages.length, 4, 'capture stops after the final acknowledgement');
  recorder.port.onmessage({ data: { type: 'start', startFrame: 256 } });
  recorder.process([[]], [[output]]);
  sandbox.currentFrame = 384;
  recorder.process([[new Float32Array(128).fill(0.3)]], [[output]]);
  sandbox.currentFrame = 512;
  recorder.port.onmessage({ data: { type: 'stop', id: 3 } });
  assert.equal(messages[4].samples?.length, 256, 'an absent input block must not shorten the timeline');
  assert(messages[4].samples?.slice(0, 128).every(sample => sample === 0));
  assert(messages[4].samples?.slice(128).every(sample => sample === Math.fround(0.3)));

  // Late messages must use the take's original clock and calibration, not a later seek.
  const finished: Array<{ start: number; buffer: AudioBuffer }> = [];
  const checkpoints: Array<{ start: number; samples: Float32Array; index: number }> = [];
  const engine = new AudioEngine({
    onTimeUpdate() {}, onPlaybackEnded() {}, onCountInBeat() {}, onRecordingAborted() {}, onError(message) { throw new Error(message); },
    onRecordingFinished(_id, buffer, _wave, start) { finished.push({ buffer, start: start! }); },
    onRecordingCheckpoint(checkpoint) { checkpoints.push(checkpoint); },
  });
  const nativeTrack = { ...track, clips: [{ ...original, buffer: precise }] };
  assert.equal(engine.getExportSampleRate([nativeTrack]), 44100);
  assert.equal(engine.getExportSampleRate([nativeTrack, track]), 48000, 'mixed recordings must retain the highest actual source rate');
  const capture = engine as unknown as {
    ctx: BaseAudioContext; recordingTimelineOrigin: number; takeLatencyCompensation: number;
    playbackStartCtxTime: number; recordingLatencyCompensation: number; capturedFirstFrame: number | null;
    recordingTrackId: string; recordingTakeId: string; isRecording: boolean; recordedPCMChunks: Float32Array[];
    recordingStartBeatTime: number; collectPCM(samples: Float32Array, frame: number): void;
    flushRecorder(type: string): Promise<number>; micStream: { getTracks(): Array<{ stop(): void }> };
  };
  capture.ctx = Object.assign(ctx, { sampleRate: 48000, currentTime: 1 });
  capture.recordingTimelineOrigin = 1;
  capture.takeLatencyCompensation = -0.025;
  capture.playbackStartCtxTime = 90;
  capture.recordingLatencyCompensation = -0.185;
  capture.recordingTrackId = 'lead1'; capture.recordingTakeId = 'test-take'; capture.isRecording = true;
  const pcm = Float32Array.from({ length: 4096 }, (_, i) => i / 8192);
  capture.collectPCM(pcm, 48000);
  assert.equal(checkpoints[0].start, 0);
  assert.equal(checkpoints[0].samples.length, 2896, 'trim exactly the compensated pre-zero samples');
  assert.equal(checkpoints[0].samples[0], pcm[1200]);
  capture.collectPCM(new Float32Array(128), 52096);
  assert.equal(checkpoints[1].index, 1);
  assert.equal(checkpoints[1].samples.length, 128);
  let acknowledge!: (frame: number) => void;
  capture.flushRecorder = () => new Promise(resolve => { acknowledge = resolve; });
  let released = false;
  capture.micStream = { getTracks: () => [{ stop() { released = true; } }] };
  const firstStop = engine.stopRecording();
  const secondStop = engine.stopRecording();
  assert.equal(firstStop, secondStop, 'all callers must await the same final capture');
  engine.releaseMicrophone();
  assert.equal(released, false, 'do not disconnect the mic before the final chunk arrives');
  let stopped = false; void secondStop.then(() => { stopped = true; });
  await Promise.resolve(); assert.equal(stopped, false);
  capture.collectPCM(new Float32Array(64), 52224);
  acknowledge(52288);
  await Promise.all([firstStop, secondStop]);
  assert.equal(released, true);
  assert.equal(finished.length, 1);
  assert.equal(finished[0].buffer.length, 3088, 'keep short takes and the final partial chunk');
  assert.equal(finished[0].start, 0);
  capture.capturedFirstFrame = null;
  capture.recordingTrackId = 'lead1'; capture.isRecording = true;
  capture.recordingTimelineOrigin = 0; capture.takeLatencyCompensation = -0.025;
  capture.collectPCM(new Float32Array(128), 48000);
  assert.equal(checkpoints.at(-1)!.start, 0.975, 'late messages keep the anchored offset after a seek/calibration change');
  const lastStop = engine.stopRecording(); acknowledge(48128); await lastStop;
  assert.equal(finished.at(-1)!.buffer.length, 128, 'a very short captured voice is still a take');
  console.log('Studio audio regression tests passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
