import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { getProjectDuration, getRenderDuration, splitClip, trimClip } from '../lib/studio/audio/clipEditing';
import { audioBufferToWav, extractWaveformPeaks, punchInClips } from '../lib/studio/audio/wavEncoder';
import { processVocalTune } from '../lib/studio/audio/pitchCorrection';
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
  console.log('Studio audio regression tests passed.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
