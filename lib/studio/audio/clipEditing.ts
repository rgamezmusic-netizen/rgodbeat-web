import { VocalClip, VocalTrack } from '../types/audio';
import { extractWaveformPeaks, sliceAudioBuffer, WAVEFORM_SAMPLE_COUNT } from './wavEncoder';

export function getTrackClips(track: VocalTrack): VocalClip[] {
  if (track.clips?.length) return track.clips.map((clip) =>
    Math.abs(clip.duration - clip.buffer.duration) > 0.0001
      ? { ...clip, duration: clip.buffer.duration }
      : clip
  );
  return track.buffer ? [{
    id: `clip-${track.id}-init`,
    buffer: track.buffer,
    tunedBuffer: track.tunedBuffer,
    startBeatOffset: track.startBeatOffset,
    duration: track.buffer.duration,
    waveformSample: track.waveformSample,
    name: 'Toma 1',
  }] : [];
}

export function getProjectDuration(beatDuration: number, tracks: VocalTrack[]): number {
  return tracks.reduce((end, track) => getTrackClips(track).reduce(
    (clipEnd, clip) => Math.max(clipEnd, clip.startBeatOffset + clip.buffer.duration), end
  ), beatDuration);
}

/** Keeps the raw and tuned versions of an edit on the same sample boundaries. */
export function trimClip(ctx: BaseAudioContext, clip: VocalClip, start: number, end: number): VocalClip | null {
  const clipDuration = clip.buffer.duration;
  const from = Math.max(clip.startBeatOffset, start);
  const to = Math.min(clip.startBeatOffset + clipDuration, end);
  const offset = from - clip.startBeatOffset;
  const buffer = sliceAudioBuffer(ctx, clip.buffer, offset, to - from);
  if (!buffer) return null;
  return {
    ...clip,
    buffer,
    tunedBuffer: clip.tunedBuffer ? sliceAudioBuffer(ctx, clip.tunedBuffer, offset, buffer.duration) : null,
    startBeatOffset: clip.startBeatOffset + Math.round(offset * clip.buffer.sampleRate) / clip.buffer.sampleRate,
    duration: buffer.duration,
    waveformSample: extractWaveformPeaks(buffer, WAVEFORM_SAMPLE_COUNT),
  };
}

export function splitClip(ctx: BaseAudioContext, clip: VocalClip, at: number): VocalClip[] | null {
  const clipDuration = clip.buffer.duration;
  const sample = Math.round((at - clip.startBeatOffset) * clip.buffer.sampleRate);
  const cut = clip.startBeatOffset + sample / clip.buffer.sampleRate;
  const left = trimClip(ctx, clip, clip.startBeatOffset, cut);
  const right = trimClip(ctx, clip, cut, clip.startBeatOffset + clipDuration);
  if (!left || !right) return null;
  return [
    { ...left, id: `${clip.id}-${crypto.randomUUID()}-a`, name: `${clip.name || 'Toma'} (Parte 1)` },
    { ...right, id: `${clip.id}-${crypto.randomUUID()}-b`, name: `${clip.name || 'Toma'} (Parte 2)` },
  ];
}

export function withTrackClips(track: VocalTrack, clips: VocalClip[]): VocalTrack {
  const last = clips.at(-1);
  return {
    ...track, clips, buffer: last?.buffer ?? null, tunedBuffer: last?.tunedBuffer ?? null,
    startBeatOffset: clips.length ? Math.min(...clips.map(c => c.startBeatOffset)) : 0,
    duration: getProjectDuration(0, [{ ...track, clips, buffer: last?.buffer ?? null }]),
    waveformSample: last?.waveformSample,
  };
}

export function getRenderDuration(beatDuration: number, tracks: VocalTrack[], bpm: number): number {
  return tracks.reduce((end, track) => {
    const clips = getTrackClips(track);
    if (!clips.length) return end;
    const reverbTail = track.fx.reverb.mix > 0
      ? { ROOM: 0.9, PLATE: 1.9, HALL: 3 }[track.fx.reverb.preset] : 0;
    const division = { OFF: 0, '1/8': 0.5, '1/4': 1, '1/2': 2, '1 BAR': 4 }[track.fx.delay.division];
    const feedback = Math.max(0, Math.min(0.75, track.fx.delay.feedback));
    const repeats = feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
    const delayTail = track.fx.delay.mix > 0 ? Math.min(20, division * 60 / Math.max(30, bpm) * repeats) : 0;
    return Math.max(end, getProjectDuration(0, [track]) + Math.max(reverbTail, delayTail));
  }, beatDuration);
}
