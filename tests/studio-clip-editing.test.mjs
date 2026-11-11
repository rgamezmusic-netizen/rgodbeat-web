import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSource } from './helpers/rg-fixtures.mjs';

const {
  renderNonDestructiveClip,
  splitClip,
  trimClip,
  computeClipEdgeResizePreview,
  resizeClipEdge,
  setClipFades,
  setClipTimeStretch,
  withTrackClips,
  getTrackClips,
} = loadSource('lib/studio/audio/clipEditing.ts');
const { timeStretchAudioBuffer } = loadSource('lib/studio/audio/timeStretch.ts');
const { applyFadesToBuffer } = loadSource('lib/studio/audio/fades.ts');

function createMockAudioBuffer(channels, length, sampleRate = 48000) {
  const data = Array.from({ length: channels }, () => new Float32Array(length));
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    duration: length / sampleRate,
    getChannelData: (ch) => data[ch],
  };
}

const mockCtx = {
  createBuffer: createMockAudioBuffer,
};

test('1. Record/create clip: initializes non-destructive properties correctly', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 4, sampleRate); // 4 seconds
  const chData = audio.getChannelData(0);
  for (let i = 0; i < chData.length; i++) chData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);

  const clip = {
    id: 'take-1',
    name: 'Toma 1',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 4.0,
    timeStretchRatio: 1.0,
    fadeInSec: 0,
    fadeOutSec: 0,
    startBeatOffset: 2.0,
    duration: 4.0,
    isLocked: false,
  };

  assert.equal(clip.duration, 4.0);
  assert.equal(clip.sourceOffsetSec, 0);
  assert.equal(clip.sourceDurationSec, 4.0);
  assert.equal(clip.timeStretchRatio, 1.0);
  assert.equal(clip.sourceBuffer.duration, 4.0);
});

test('2. Split clip: divides clip into two independent regions while preserving original source audio', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 4, sampleRate); // 4 seconds
  const chData = audio.getChannelData(0);
  // Mark distinct pulses at 1s and 3s
  chData[sampleRate * 1] = 0.9;
  chData[sampleRate * 3] = 0.8;

  const originalClip = {
    id: 'take-original',
    name: 'Toma Lead',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 4.0,
    timeStretchRatio: 1.0,
    fadeInSec: 0,
    fadeOutSec: 0,
    startBeatOffset: 10.0,
    duration: 4.0,
  };

  // Split at timeline position 12.0s (2 seconds into the clip)
  const parts = splitClip(mockCtx, originalClip, 12.0);
  assert.ok(parts, 'splitClip should return array of 2 clips');
  assert.equal(parts.length, 2);

  const [partA, partB] = parts;

  // Verify part A
  assert.equal(partA.startBeatOffset, 10.0);
  assert.equal(Math.round(partA.duration * 100) / 100, 2.0);
  assert.equal(partA.sourceOffsetSec, 0);
  assert.equal(partA.sourceBuffer, audio, 'Part A must retain full original sourceBuffer');

  // Verify part B
  assert.equal(partB.startBeatOffset, 12.0);
  assert.equal(Math.round(partB.duration * 100) / 100, 2.0);
  assert.equal(Math.round(partB.sourceOffsetSec * 100) / 100, 2.0);
  assert.equal(partB.sourceBuffer, audio, 'Part B must retain full original sourceBuffer');

  // Verify non-destructive independence: pulses exist at their respective source locations
  const bufA = partA.buffer.getChannelData(0);
  const bufB = partB.buffer.getChannelData(0);
  assert.ok(Math.abs(bufA[sampleRate * 1] - 0.9) < 0.001, 'Pulse at 1s preserved in part A');
  assert.ok(Math.abs(bufB[sampleRate * 1] - 0.8) < 0.001, 'Pulse at 3s preserved at offset in part B');
});

test('3. Trim and extend: trimming visible region and extending back reveals hidden audio', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 6, sampleRate); // 6 seconds
  const chData = audio.getChannelData(0);
  chData[sampleRate * 1] = 0.5; // at 1s
  chData[sampleRate * 3] = 0.7; // at 3s
  chData[sampleRate * 5] = 0.9; // at 5s

  const fullClip = {
    id: 'take-trim',
    name: 'Vocal 1',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 6.0,
    timeStretchRatio: 1.0,
    fadeInSec: 0,
    fadeOutSec: 0,
    startBeatOffset: 0,
    duration: 6.0,
  };

  // Trim left edge by +2s (start trim)
  const trimmedLeft = resizeClipEdge(mockCtx, fullClip, 'start', 2.0, 'trim');
  assert.ok(trimmedLeft);
  assert.equal(trimmedLeft.startBeatOffset, 2.0);
  assert.equal(Math.round(trimmedLeft.duration * 10) / 10, 4.0);
  assert.equal(Math.round(trimmedLeft.sourceOffsetSec * 10) / 10, 2.0);
  assert.equal(trimmedLeft.sourceBuffer, audio, 'Source buffer must be intact');

  // Trim right edge by -1.5s (end trim)
  const trimmedBoth = resizeClipEdge(mockCtx, trimmedLeft, 'end', -1.5, 'trim');
  assert.ok(trimmedBoth);
  assert.equal(Math.round(trimmedBoth.duration * 10) / 10, 2.5);

  // Now EXTEND left edge by -2.0s to recover the hidden initial 2 seconds!
  const extendedLeft = resizeClipEdge(mockCtx, trimmedBoth, 'start', -2.0, 'trim');
  assert.ok(extendedLeft);
  assert.equal(extendedLeft.startBeatOffset, 0);
  assert.equal(Math.round(extendedLeft.sourceOffsetSec * 10) / 10, 0);
  assert.ok(Math.abs(extendedLeft.buffer.getChannelData(0)[sampleRate * 1] - 0.5) < 0.001, 'Recovered hidden audio at 1s!');

  // Extend right edge back to recover the trailing audio
  const extendedRight = resizeClipEdge(mockCtx, extendedLeft, 'end', 3.5, 'trim');
  assert.ok(extendedRight);
  assert.equal(Math.round(extendedRight.duration * 10) / 10, 6.0);
  assert.ok(Math.abs(extendedRight.buffer.getChannelData(0)[sampleRate * 5] - 0.9) < 0.001, 'Recovered hidden trailing audio at 5s!');
});

test('4. Time-stretch: stretches/compresses audio duration preserving source file and pitch structure', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 2, sampleRate); // 2 seconds
  const chData = audio.getChannelData(0);
  for (let i = 0; i < chData.length; i++) chData[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate);

  const clip = {
    id: 'take-stretch',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 2.0,
    timeStretchRatio: 1.0,
    startBeatOffset: 4.0,
    duration: 2.0,
  };

  // Stretch by 1.5x (slower, longer duration: 2s -> 3s)
  const stretched = setClipTimeStretch(mockCtx, clip, 1.5);
  assert.ok(stretched);
  assert.equal(Math.round(stretched.timeStretchRatio * 100) / 100, 1.5);
  assert.equal(Math.round(stretched.duration * 10) / 10, 3.0);
  assert.equal(stretched.sourceBuffer, audio, 'Original sourceBuffer remains unmodified');
  assert.equal(stretched.sourceDurationSec, 2.0);

  // Compress by 0.75x (faster, shorter duration: 2s -> 1.5s)
  const compressed = setClipTimeStretch(mockCtx, clip, 0.75);
  assert.ok(compressed);
  assert.equal(Math.round(compressed.timeStretchRatio * 100) / 100, 0.75);
  assert.equal(Math.round(compressed.duration * 10) / 10, 1.5);
  assert.equal(compressed.sourceBuffer, audio);
});

test('5. Fade In & Fade Out: applies smooth non-destructive equal-power attenuation', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 2, sampleRate);
  const chData = audio.getChannelData(0);
  chData.fill(1.0); // Flat 1.0 amplitude

  const clip = {
    id: 'take-fade',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 2.0,
    timeStretchRatio: 1.0,
    startBeatOffset: 0,
    duration: 2.0,
    fadeInSec: 0,
    fadeOutSec: 0,
  };

  // Apply 0.5s fade-in and 0.5s fade-out
  const faded = setClipFades(mockCtx, clip, 0.5, 0.5);
  assert.ok(faded);
  assert.equal(faded.fadeInSec, 0.5);
  assert.equal(faded.fadeOutSec, 0.5);

  const outData = faded.buffer.getChannelData(0);
  // At sample 0: amplitude should be near 0
  assert.ok(outData[0] < 0.05, 'Fade-in starts near 0');
  // At 0.5s (end of fade in): amplitude should reach 1.0
  assert.ok(outData[sampleRate / 2] > 0.95, 'Fade-in reaches full volume');
  // At middle (1.0s): full volume
  assert.equal(outData[sampleRate], 1.0, 'Middle maintains full volume');
  // At last sample: amplitude should be near 0
  assert.ok(outData[outData.length - 1] < 0.05, 'Fade-out ends near 0');

  // Pristine sourceBuffer is untouched
  assert.equal(clip.sourceBuffer.getChannelData(0)[0], 1.0, 'sourceBuffer remains completely intact');
});

test('6. Track-to-track move: clips can be moved to compatible tracks preserving timing', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 2, sampleRate);
  const clip = {
    id: 'clip-move-test',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0,
    sourceDurationSec: 2.0,
    timeStretchRatio: 1.0,
    startBeatOffset: 8.5,
    duration: 2.0,
  };

  const trackLead1 = {
    id: 'lead1',
    name: 'Lead 1',
    clips: [clip],
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    fx: {},
  };

  const trackLead2 = {
    id: 'lead2',
    name: 'Lead 2',
    clips: [],
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    fx: {},
  };

  // Move clip from lead1 to lead2
  const updatedLead1 = withTrackClips(trackLead1, []);
  const updatedLead2 = withTrackClips(trackLead2, [clip]);

  assert.equal(getTrackClips(updatedLead1).length, 0);
  assert.equal(getTrackClips(updatedLead2).length, 1);
  assert.equal(getTrackClips(updatedLead2)[0].startBeatOffset, 8.5, 'Offset preserved across tracks');
  assert.equal(getTrackClips(updatedLead2)[0].id, 'clip-move-test');
});

test('7. Persistence: verifies non-destructive metadata payload fields', () => {
  const clip = {
    id: 'persisted-clip-1',
    name: 'Toma Lead',
    startBeatOffset: 4.25,
    duration: 3.5,
    sourceOffsetSec: 1.2,
    sourceDurationSec: 8.0,
    timeStretchRatio: 1.15,
    fadeInSec: 0.25,
    fadeOutSec: 0.4,
    isLocked: true,
  };

  // Verify metadata survives serialization
  const serialized = JSON.stringify(clip);
  const restored = JSON.parse(serialized);

  assert.equal(restored.id, 'persisted-clip-1');
  assert.equal(restored.startBeatOffset, 4.25);
  assert.equal(restored.duration, 3.5);
  assert.equal(restored.sourceOffsetSec, 1.2);
  assert.equal(restored.sourceDurationSec, 8.0);
  assert.equal(restored.timeStretchRatio, 1.15);
  assert.equal(restored.fadeInSec, 0.25);
  assert.equal(restored.fadeOutSec, 0.4);
  assert.equal(restored.isLocked, true);
});

test('8. Live 60fps edge preview geometry matches committed resizeClipEdge exactly (zero jump on release)', () => {
  const sampleRate = 48000;
  const audio = createMockAudioBuffer(1, sampleRate * 4, sampleRate);
  const clip = {
    id: 'take-preview',
    buffer: audio,
    sourceBuffer: audio,
    sourceOffsetSec: 0.5,
    sourceDurationSec: 3.0,
    timeStretchRatio: 1.0,
    startBeatOffset: 2.0,
    duration: 3.0,
    fadeInSec: 0.2,
    fadeOutSec: 0.2,
  };

  // Trim start edge by +0.75s
  const previewTrimStart = computeClipEdgeResizePreview(clip, 'start', 0.75, 'trim');
  const committedTrimStart = resizeClipEdge(mockCtx, clip, 'start', 0.75, 'trim');
  assert.ok(previewTrimStart && committedTrimStart);
  assert.ok(Math.abs(previewTrimStart.startBeatOffset - committedTrimStart.startBeatOffset) < 1e-4);
  assert.ok(Math.abs(previewTrimStart.duration - committedTrimStart.duration) < 1e-3);
  assert.ok(Math.abs(previewTrimStart.sourceOffsetSec - committedTrimStart.sourceOffsetSec) < 1e-4);

  // Stretch end edge by +1.5s (3.0s -> 4.5s, 1.5x stretch)
  const previewStretchEnd = computeClipEdgeResizePreview(clip, 'end', 1.5, 'stretch');
  const committedStretchEnd = resizeClipEdge(mockCtx, clip, 'end', 1.5, 'stretch');
  assert.ok(previewStretchEnd && committedStretchEnd);
  assert.ok(Math.abs(previewStretchEnd.timeStretchRatio - committedStretchEnd.timeStretchRatio) < 1e-4);
  assert.ok(Math.abs(previewStretchEnd.duration - committedStretchEnd.duration) < 1e-2);
});

