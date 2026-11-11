import { VocalClip, VocalTrack } from '../types/audio';
import { extractWaveformPeaks, sliceAudioBuffer, WAVEFORM_SAMPLE_COUNT } from './wavEncoder';
import { timeStretchAudioBuffer } from './timeStretch';
import { applyFadesToBuffer } from './fades';

export function getTrackClips(track: VocalTrack): VocalClip[] {
  if (track.clips?.length) {
    return track.clips.map((clip) =>
      Math.abs(clip.duration - clip.buffer.duration) > 0.0001
        ? { ...clip, duration: clip.buffer.duration }
        : clip
    );
  }
  return track.buffer
    ? [
        {
          id: `clip-${track.id}-init`,
          buffer: track.buffer,
          sourceBuffer: track.buffer,
          sourceOffsetSec: 0,
          sourceDurationSec: track.buffer.duration,
          tunedBuffer: track.tunedBuffer,
          startBeatOffset: track.startBeatOffset,
          duration: track.buffer.duration,
          waveformSample: track.waveformSample,
          name: 'Toma 1',
          timeStretchRatio: 1,
          fadeInSec: 0,
          fadeOutSec: 0,
        },
      ]
    : [];
}

export function getProjectDuration(beatDuration: number, tracks: VocalTrack[]): number {
  return tracks.reduce(
    (end, track) =>
      getTrackClips(track).reduce(
        (clipEnd, clip) => Math.max(clipEnd, clip.startBeatOffset + clip.buffer.duration),
        end
      ),
    beatDuration
  );
}

/**
 * Non-destructively renders a clip's active playback buffer from its sourceBuffer
 * applying any trimming, time-stretching, and equal-power fades.
 */
export function renderNonDestructiveClip(
  ctx: BaseAudioContext,
  clip: VocalClip
): VocalClip {
  const sourceBuffer = clip.sourceBuffer || clip.buffer;
  const sourceDuration = clip.sourceDurationSec || sourceBuffer.duration;
  const timeStretchRatio = clip.timeStretchRatio && Number.isFinite(clip.timeStretchRatio)
    ? Math.max(0.25, Math.min(4.0, clip.timeStretchRatio))
    : 1.0;
  const sourceOffset = Math.max(0, Math.min(sourceDuration - 0.01, clip.sourceOffsetSec || 0));

  // Timeline duration determines source duration needed
  const maxSourceAvailable = Math.max(0.01, sourceDuration - sourceOffset);
  const requestedSourceDuration = clip.duration / timeStretchRatio;
  const actualSourceDuration = Math.min(maxSourceAvailable, requestedSourceDuration);
  const targetTimelineDuration = actualSourceDuration * timeStretchRatio;

  // 1. Slice from source audio
  let rendered = sliceAudioBuffer(ctx, sourceBuffer, sourceOffset, actualSourceDuration);
  if (!rendered) {
    // Fallback if slice failed
    rendered = ctx.createBuffer(sourceBuffer.numberOfChannels, Math.max(1, Math.round(targetTimelineDuration * sourceBuffer.sampleRate)), sourceBuffer.sampleRate);
  }

  // 2. Apply pitch-preserving Time Stretch if ratio is not 1.0
  if (Math.abs(timeStretchRatio - 1.0) >= 0.005) {
    try {
      rendered = timeStretchAudioBuffer(ctx, rendered, timeStretchRatio);
    } catch (stretchErr) {
      console.warn('Time stretch failed, keeping raw slice:', stretchErr);
    }
  }

  // 3. Apply non-destructive Fades
  const fadeInSec = Math.max(0, clip.fadeInSec || 0);
  const fadeOutSec = Math.max(0, clip.fadeOutSec || 0);
  if (fadeInSec > 0 || fadeOutSec > 0) {
    try {
      rendered = applyFadesToBuffer(ctx, rendered, fadeInSec, fadeOutSec);
    } catch (fadeErr) {
      console.warn('Fade application failed:', fadeErr);
    }
  }

  return {
    ...clip,
    buffer: rendered,
    sourceBuffer,
    sourceOffsetSec: sourceOffset,
    sourceDurationSec: sourceDuration,
    duration: rendered.duration,
    timeStretchRatio,
    fadeInSec,
    fadeOutSec,
    waveformSample: extractWaveformPeaks(rendered, WAVEFORM_SAMPLE_COUNT),
  };
}

/**
 * Trims a clip's visible boundaries while preserving the underlying sourceBuffer.
 */
export function trimClip(
  ctx: BaseAudioContext,
  clip: VocalClip,
  start: number,
  end: number
): VocalClip | null {
  const sourceBuffer = clip.sourceBuffer || clip.buffer;
  const stretch = clip.timeStretchRatio || 1.0;
  const from = Math.max(clip.startBeatOffset, start);
  const to = Math.min(clip.startBeatOffset + clip.duration, end);
  if (to <= from) return null;

  const deltaStart = from - clip.startBeatOffset;
  const newSourceOffset = Math.max(0, (clip.sourceOffsetSec || 0) + deltaStart / stretch);
  const newDuration = to - from;

  const candidate: VocalClip = {
    ...clip,
    sourceBuffer,
    sourceOffsetSec: newSourceOffset,
    sourceDurationSec: clip.sourceDurationSec || sourceBuffer.duration,
    startBeatOffset: from,
    duration: newDuration,
    timeStretchRatio: stretch,
    fadeInSec: Math.min(clip.fadeInSec || 0, newDuration * 0.45),
    fadeOutSec: Math.min(clip.fadeOutSec || 0, newDuration * 0.45),
  };

  return renderNonDestructiveClip(ctx, candidate);
}

/**
 * Resizes a clip's left or right edge:
 * - In 'trim' mode: extends or trims revealing hidden source audio or hiding audio.
 * - In 'stretch' mode: compresses or stretches duration without altering pitch.
 */
export function resizeClipEdge(
  ctx: BaseAudioContext,
  clip: VocalClip,
  edge: 'start' | 'end',
  deltaTimelineSec: number,
  mode: 'trim' | 'stretch' = 'trim'
): VocalClip | null {
  const sourceBuffer = clip.sourceBuffer || clip.buffer;
  const sourceTotalDuration = clip.sourceDurationSec || sourceBuffer.duration;
  const currentStretch = clip.timeStretchRatio || 1.0;
  const currentSourceOffset = clip.sourceOffsetSec || 0;

  if (mode === 'stretch') {
    let newDuration = clip.duration;
    let newStartOffset = clip.startBeatOffset;

    if (edge === 'start') {
      newDuration = Math.max(0.08, clip.duration - deltaTimelineSec);
      newStartOffset = clip.startBeatOffset + (clip.duration - newDuration);
    } else {
      newDuration = Math.max(0.08, clip.duration + deltaTimelineSec);
    }

    const currentSourceUsed = clip.duration / currentStretch;
    const newRatio = Math.max(0.25, Math.min(4.0, newDuration / currentSourceUsed));

    const candidate: VocalClip = {
      ...clip,
      sourceBuffer,
      sourceOffsetSec: currentSourceOffset,
      sourceDurationSec: sourceTotalDuration,
      startBeatOffset: newStartOffset,
      duration: currentSourceUsed * newRatio,
      timeStretchRatio: newRatio,
    };

    return renderNonDestructiveClip(ctx, candidate);
  }

  // Mode: 'trim' (extend or shorten visible region)
  if (edge === 'start') {
    // Dragging left (negative delta) reveals audio before current in-point
    // Dragging right (positive delta) hides audio from start
    const maxExtendLeftSec = currentSourceOffset * currentStretch;
    const clampedDelta = Math.max(-maxExtendLeftSec, Math.min(clip.duration - 0.05, deltaTimelineSec));
    const newStart = clip.startBeatOffset + clampedDelta;
    const newDuration = clip.duration - clampedDelta;
    const newSourceOffset = Math.max(0, currentSourceOffset + clampedDelta / currentStretch);

    const candidate: VocalClip = {
      ...clip,
      sourceBuffer,
      sourceOffsetSec: newSourceOffset,
      sourceDurationSec: sourceTotalDuration,
      startBeatOffset: newStart,
      duration: newDuration,
      timeStretchRatio: currentStretch,
      fadeInSec: Math.min(clip.fadeInSec || 0, newDuration * 0.45),
      fadeOutSec: Math.min(clip.fadeOutSec || 0, newDuration * 0.45),
    };

    return renderNonDestructiveClip(ctx, candidate);
  }

  // Edge: 'end'
  const sourceAvailableAfterIn = Math.max(0, sourceTotalDuration - currentSourceOffset);
  const maxPossibleDuration = sourceAvailableAfterIn * currentStretch;
  const newDuration = Math.max(0.05, Math.min(maxPossibleDuration, clip.duration + deltaTimelineSec));

  const candidate: VocalClip = {
    ...clip,
    sourceBuffer,
    sourceOffsetSec: currentSourceOffset,
    sourceDurationSec: sourceTotalDuration,
    startBeatOffset: clip.startBeatOffset,
    duration: newDuration,
    timeStretchRatio: currentStretch,
    fadeInSec: Math.min(clip.fadeInSec || 0, newDuration * 0.45),
    fadeOutSec: Math.min(clip.fadeOutSec || 0, newDuration * 0.45),
  };

  return renderNonDestructiveClip(ctx, candidate);
}

/**
 * Splits an audio clip at a timeline position into two independent editable clips,
 * preserving the full sourceBuffer on both clips so both can be trimmed or extended later.
 */
export function splitClip(
  ctx: BaseAudioContext,
  clip: VocalClip,
  at: number
): VocalClip[] | null {
  if (at <= clip.startBeatOffset + 0.01 || at >= clip.startBeatOffset + clip.duration - 0.01) {
    return null;
  }

  const sourceBuffer = clip.sourceBuffer || clip.buffer;
  const stretch = clip.timeStretchRatio || 1.0;
  const sourceTotalDuration = clip.sourceDurationSec || sourceBuffer.duration;
  const currentSourceOffset = clip.sourceOffsetSec || 0;

  const leftDuration = at - clip.startBeatOffset;
  const rightDuration = clip.duration - leftDuration;

  const leftCandidate: VocalClip = {
    ...clip,
    id: `${clip.id}-${crypto.randomUUID()}-a`,
    name: `${clip.name || 'Toma'} (Parte 1)`,
    sourceBuffer,
    sourceOffsetSec: currentSourceOffset,
    sourceDurationSec: sourceTotalDuration,
    startBeatOffset: clip.startBeatOffset,
    duration: leftDuration,
    timeStretchRatio: stretch,
    fadeInSec: Math.min(clip.fadeInSec || 0, leftDuration * 0.45),
    fadeOutSec: 0,
  };

  const rightCandidate: VocalClip = {
    ...clip,
    id: `${clip.id}-${crypto.randomUUID()}-b`,
    name: `${clip.name || 'Toma'} (Parte 2)`,
    sourceBuffer,
    sourceOffsetSec: currentSourceOffset + leftDuration / stretch,
    sourceDurationSec: sourceTotalDuration,
    startBeatOffset: at,
    duration: rightDuration,
    timeStretchRatio: stretch,
    fadeInSec: 0,
    fadeOutSec: Math.min(clip.fadeOutSec || 0, rightDuration * 0.45),
  };

  const leftRendered = renderNonDestructiveClip(ctx, leftCandidate);
  const rightRendered = renderNonDestructiveClip(ctx, rightCandidate);

  return [leftRendered, rightRendered];
}

/**
 * Sets fade-in and fade-out durations on a clip non-destructively.
 */
export function setClipFades(
  ctx: BaseAudioContext,
  clip: VocalClip,
  fadeInSec: number,
  fadeOutSec: number
): VocalClip {
  const maxFade = clip.duration * 0.48;
  const candidate: VocalClip = {
    ...clip,
    fadeInSec: Math.max(0, Math.min(maxFade, fadeInSec)),
    fadeOutSec: Math.max(0, Math.min(maxFade, fadeOutSec)),
  };
  return renderNonDestructiveClip(ctx, candidate);
}

/**
 * Sets time stretch factor on a clip non-destructively without altering pitch.
 */
export function setClipTimeStretch(
  ctx: BaseAudioContext,
  clip: VocalClip,
  ratio: number
): VocalClip {
  const clampedRatio = Math.max(0.25, Math.min(4.0, ratio));
  const currentRatio = clip.timeStretchRatio || 1.0;
  const sourceUsed = clip.duration / currentRatio;
  const candidate: VocalClip = {
    ...clip,
    duration: sourceUsed * clampedRatio,
    timeStretchRatio: clampedRatio,
  };
  return renderNonDestructiveClip(ctx, candidate);
}

export function withTrackClips(track: VocalTrack, clips: VocalClip[]): VocalTrack {
  const last = clips.at(-1);
  return {
    ...track,
    clips,
    buffer: last?.buffer ?? null,
    tunedBuffer: last?.tunedBuffer ?? null,
    startBeatOffset: clips.length ? Math.min(...clips.map((c) => c.startBeatOffset)) : 0,
    duration: getProjectDuration(0, [{ ...track, clips, buffer: last?.buffer ?? null }]),
    waveformSample: last?.waveformSample,
  };
}

export function getRenderDuration(beatDuration: number, tracks: VocalTrack[], bpm: number): number {
  return tracks.reduce((end, track) => {
    const clips = getTrackClips(track);
    if (!clips.length) return end;
    const reverbTail =
      track.fx.reverb.mix > 0
        ? { ROOM: 0.9, PLATE: 1.9, HALL: 3 }[track.fx.reverb.preset]
        : 0;
    const division = { OFF: 0, SLAP: 0.125, '1/8': 0.5, '1/4': 1, '1/2': 2, '1 BAR': 4 }[
      track.fx.delay.division
    ];
    const feedback = Math.max(0, Math.min(0.75, track.fx.delay.feedback));
    const repeats = feedback > 0 ? Math.ceil(Math.log(0.001) / Math.log(feedback)) : 1;
    const delayTail =
      track.fx.delay.mix > 0 ? Math.min(20, (division * 60 / Math.max(30, bpm)) * repeats) : 0;
    return Math.max(end, getProjectDuration(0, [track]) + Math.max(reverbTail, delayTail));
  }, beatDuration);
}
