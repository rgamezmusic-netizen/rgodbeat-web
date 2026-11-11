import Image from "next/image";
import React, { useRef, useState, useEffect } from 'react';
import {
  Sliders,
  MoveHorizontal,
  ZoomIn,
  ZoomOut,
  Trash2,
  Clock,
  Volume2,
  VolumeX,
  Play,
  Pause,
  RotateCcw,
  Plus,
  Undo2,
  Redo2,
  ShieldCheck,
  Repeat,
  Square,
  Scissors,
  Lock,
  Unlock,
  Zap,
  Sparkles,
} from 'lucide-react';
import { BeatData, LoopSettings, VocalClip, VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';
import { parseKeyAndGetRelative } from '@/lib/studio/audio/beatAnalyzer';
import { getVocalPresetById } from '@/lib/studio/audio/vocalPresets';
import { ClipWaveform } from './ClipWaveform';
import { resampleWaveformPeaks } from '@/lib/studio/audio/waveform';

const BASE_TRACK_HEADER_WIDTH = 136; // px (clean compact default with channel preset button)
const EXPANDED_TRACK_HEADER_WIDTH = 192; // px (full mixer with faders and pan)
const TIMELINE_GUTTER = 20; // px (lead-in margin so Bar 1 & waveforms never touch or bleed behind track headers)

export { getTrackClips } from '@/lib/studio/audio/clipEditing';
import {
  getProjectDuration,
  getTrackClips,
  computeClipEdgeResizePreview,
  ClipEdgeResizeGeometry,
} from '@/lib/studio/audio/clipEditing';

// Retain the public helper for existing consumers; use PCM for timeline takes.
export const getInterpolatedWaveform = resampleWaveformPeaks;

interface TimelineWorkspaceProps {
  beat: BeatData | null;
  tracks: VocalTrack[];
  currentTime: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onMoveTake: (trackId: VocalTrackId, newOffsetSec: number, clipId?: string, recordHistory?: boolean) => void;
  onStartDragMove?: () => void;
  onCommitDragMove?: (trackId: VocalTrackId, initialOffset: number, clipId?: string) => void;
  onDuplicateTake: (sourceTrackId: VocalTrackId, targetTrackId: VocalTrackId, clipId?: string) => void;
  onDeleteTake: (trackId: VocalTrackId, clipId?: string) => void;
  onToggleMute: (trackId: VocalTrackId) => void;
  onToggleSolo: (trackId: VocalTrackId) => void;
  onChangeVolume?: (trackId: VocalTrackId, volume: number) => void;
  onChangePan?: (trackId: VocalTrackId, pan: number) => void;
  beatVolume?: number;
  onChangeBeatVolume?: (volume: number) => void;
  isBeatMuted?: boolean;
  onToggleBeatMute?: () => void;
  onAddBackingTrack?: () => void;
  canAddMoreTracks?: boolean;
  onDeleteTrack?: (trackId: VocalTrackId) => void;
  onOpenFX: (trackId: VocalTrackId) => void;
  onOpenPresets?: (trackId: VocalTrackId) => void;
  selectedTrackId: VocalTrackId;
  onSelectTrack: (trackId: VocalTrackId) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
  undoCount?: number;
  redoCount?: number;
  onOpenLoadBeat?: () => void;
  currentBeatSlotIndex?: number;
  totalSavedBeatsCount?: number;
  loopSettings?: LoopSettings;
  onOpenLoopModal?: () => void;
  isRecording?: boolean;
  activeRecordingTrackId?: VocalTrackId | null;
  onStartRecord?: (trackId: VocalTrackId) => void;
  onStopRecord?: () => void;
  onSplitTake?: (trackId: VocalTrackId, clipId?: string, splitTimeSec?: number) => void;
  onTrimTake?: (trackId: VocalTrackId, clipId: string, edge: 'start' | 'end') => void;
  onToggleLockTake?: (trackId: VocalTrackId, clipId?: string) => void;
  onResizeClipEdge?: (trackId: VocalTrackId, clipId: string, edge: 'start' | 'end', deltaSec: number, mode: 'trim' | 'stretch') => void;
  onSetClipFades?: (trackId: VocalTrackId, clipId: string, fadeInSec?: number, fadeOutSec?: number) => void;
  onSetClipStretch?: (trackId: VocalTrackId, clipId: string, ratio: number) => void;
  onMoveClipToTrack?: (sourceTrackId: VocalTrackId, targetTrackId: VocalTrackId, clipId: string, newOffsetSec?: number) => void;
}

export const TimelineWorkspace: React.FC<TimelineWorkspaceProps> = ({
  beat,
  tracks,
  currentTime,
  isPlaying,
  onPlayPause,
  onSeek,
  onMoveTake,
  onStartDragMove,
  onCommitDragMove,
  onDuplicateTake,
  onDeleteTake,
  onToggleMute,
  onToggleSolo,
  onChangeVolume,
  onChangePan,
  beatVolume,
  onChangeBeatVolume,
  isBeatMuted = false,
  onToggleBeatMute,
  onAddBackingTrack,
  canAddMoreTracks = false,
  onDeleteTrack,
  onOpenFX,
  onOpenPresets,
  selectedTrackId,
  onSelectTrack,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  undoCount = 0,
  redoCount = 0,
  onOpenLoadBeat,
  currentBeatSlotIndex = 1,
  totalSavedBeatsCount = 1,
  loopSettings,
  onOpenLoopModal,
  isRecording = false,
  activeRecordingTrackId = null,
  onStartRecord,
  onStopRecord,
  onSplitTake,
  onToggleLockTake,
  onTrimTake,
  onResizeClipEdge,
  onSetClipFades,
  onSetClipStretch,
  onMoveClipToTrack,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const [snapToBeat, setSnapToBeat] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = baseline, up to 2.5x
  const [showFaders, setShowFaders] = useState<boolean>(false); // Collapsed by default for clean view
  const trackHeaderWidth = showFaders ? EXPANDED_TRACK_HEADER_WIDTH : BASE_TRACK_HEADER_WIDTH;

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isDraggingClip, setIsDraggingClip] = useState<boolean>(false);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragPreviewOffset, setDragPreviewOffset] = useState<number | null>(null);

  const duration = getProjectDuration(beat?.duration || 60, tracks);
  const bpm = Math.max(30, beat?.bpm || 140);
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedTrackName = selectedTrack ? selectedTrack.name : 'Pista';

  // Base pixels per second (36px provides ample breathing room for bar numbers & beats 1, 2, 3, 4)
  const basePixelsPerSec = 36 * zoomLevel;
  // Leave room for the playhead through effect tails beyond the recorded audio.
  const timelineWidth = Math.max(500, Math.max(duration, currentTime) * basePixelsPerSec);

  // Refs to keep drag listeners stable and synchronous across re-renders
  const onMoveTakeRef = useRef(onMoveTake);
  const onCommitDragMoveRef = useRef(onCommitDragMove);
  const onSeekRef = useRef(onSeek);
  const snapToBeatRef = useRef(snapToBeat);
  const secPerBeatRef = useRef(secPerBeat);
  const basePixelsPerSecRef = useRef(basePixelsPerSec);
  const isPlayingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  const justDraggedRef = useRef(false);

  const [activeEditTool, setActiveEditTool] = useState<'trim' | 'stretch'>('trim');
  const [isAltPressed, setIsAltPressed] = useState(false);

  const [edgePreview, setEdgePreview] = useState<{
    trackId: VocalTrackId;
    clipId: string;
    edge: 'start' | 'end';
    mode: 'trim' | 'stretch';
    geometry: ClipEdgeResizeGeometry;
  } | null>(null);

  const [fadePreview, setFadePreview] = useState<{
    trackId: VocalTrackId;
    clipId: string;
    type: 'in' | 'out';
    fadeInSec: number;
    fadeOutSec: number;
  } | null>(null);

  const onResizeClipEdgeRef = useRef(onResizeClipEdge);
  const onSetClipFadesRef = useRef(onSetClipFades);
  const onSetClipStretchRef = useRef(onSetClipStretch);
  const onMoveClipToTrackRef = useRef(onMoveClipToTrack);

  useEffect(() => {
    onResizeClipEdgeRef.current = onResizeClipEdge;
    onSetClipFadesRef.current = onSetClipFades;
    onSetClipStretchRef.current = onSetClipStretch;
    onMoveClipToTrackRef.current = onMoveClipToTrack;
  }, [onResizeClipEdge, onSetClipFades, onSetClipStretch, onMoveClipToTrack]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) setIsAltPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.altKey) setIsAltPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const handleEdgeMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    track: VocalTrack,
    clip: VocalClip,
    edge: 'start' | 'end'
  ) => {
    e.stopPropagation();
    if (!('touches' in e)) e.preventDefault();
    if (clip.isLocked || isRecording) return;
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const initialScrollLeft = containerRef.current?.scrollLeft ?? 0;
    const initialMode: 'trim' | 'stretch' =
      (('altKey' in e && e.altKey) || isAltPressed || activeEditTool === 'stretch')
        ? 'stretch'
        : 'trim';
    const trackId = track.id;
    const clipId = clip.id;

    setSelectedClipId(clipId);
    onSelectTrack(trackId);
    setIsDraggingClip(true);

    let latestDeltaSec = 0;
    let latestMode: 'trim' | 'stretch' = initialMode;
    let moved = false;
    let rafId: number | null = null;

    setEdgePreview({
      trackId,
      clipId,
      edge,
      mode: initialMode,
      geometry: computeClipEdgeResizePreview(clip, edge, 0, initialMode),
    });

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if ('touches' in moveEvt && moveEvt.cancelable) moveEvt.preventDefault();
      const currentX = 'touches' in moveEvt
        ? (moveEvt.touches[0]?.clientX ?? startX)
        : moveEvt.clientX;
      const currentScrollLeft = containerRef.current?.scrollLeft ?? initialScrollLeft;
      const rawDeltaPx = (currentX - startX) + (currentScrollLeft - initialScrollLeft);

      if (Math.abs(rawDeltaPx) >= 1) {
        moved = true;
      }

      // Fine-precision damping when holding Shift (0.25x speed)
      const precisionFactor = ('shiftKey' in moveEvt && moveEvt.shiftKey) ? 0.25 : 1.0;
      const effectiveDeltaPx = rawDeltaPx * precisionFactor;

      // Dynamically respect Alt key during drag
      const dynamicAlt = 'altKey' in moveEvt ? moveEvt.altKey : isAltPressed;
      latestMode = (dynamicAlt || activeEditTool === 'stretch') ? 'stretch' : 'trim';

      let deltaSec = effectiveDeltaPx / basePixelsPerSecRef.current;

      // Optional musical grid snapping when Snap to Beat is enabled (unless holding Shift)
      if (snapToBeatRef.current && !('shiftKey' in moveEvt && moveEvt.shiftKey)) {
        const subBeat = secPerBeatRef.current * 0.5;
        if (edge === 'start') {
          const targetStart = clip.startBeatOffset + deltaSec;
          const snappedStart = Math.round(targetStart / subBeat) * subBeat;
          deltaSec = snappedStart - clip.startBeatOffset;
        } else {
          const targetEnd = clip.startBeatOffset + clip.duration + deltaSec;
          const snappedEnd = Math.round(targetEnd / subBeat) * subBeat;
          deltaSec = snappedEnd - (clip.startBeatOffset + clip.duration);
        }
      }

      latestDeltaSec = deltaSec;

      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          const geo = computeClipEdgeResizePreview(clip, edge, latestDeltaSec, latestMode);
          setEdgePreview({
            trackId,
            clipId,
            edge,
            mode: latestMode,
            geometry: geo,
          });
        });
      }
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }

      setIsDraggingClip(false);
      setEdgePreview(null);

      if (moved) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 80);

        if (Math.abs(latestDeltaSec) >= 0.002 && onResizeClipEdgeRef.current) {
          onResizeClipEdgeRef.current(trackId, clipId, edge, latestDeltaSec, latestMode);
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  };

  const handleFadeHandleMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    track: VocalTrack,
    clip: VocalClip,
    type: 'in' | 'out'
  ) => {
    e.stopPropagation();
    if (!('touches' in e)) e.preventDefault();
    if (clip.isLocked || isRecording) return;
    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const initialScrollLeft = containerRef.current?.scrollLeft ?? 0;
    const initialFade = type === 'in' ? (clip.fadeInSec || 0) : (clip.fadeOutSec || 0);
    const otherFade = type === 'in' ? (clip.fadeOutSec || 0) : (clip.fadeInSec || 0);
    const trackId = track.id;
    const clipId = clip.id;
    const maxFade = clip.duration * 0.48;

    setSelectedClipId(clipId);
    onSelectTrack(trackId);
    setIsDraggingClip(true);

    let latestFade = initialFade;
    let moved = false;
    let rafId: number | null = null;

    setFadePreview({
      trackId,
      clipId,
      type,
      fadeInSec: type === 'in' ? initialFade : otherFade,
      fadeOutSec: type === 'out' ? initialFade : otherFade,
    });

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if ('touches' in moveEvt && moveEvt.cancelable) moveEvt.preventDefault();
      const currentX = 'touches' in moveEvt
        ? (moveEvt.touches[0]?.clientX ?? startX)
        : moveEvt.clientX;
      const currentScrollLeft = containerRef.current?.scrollLeft ?? initialScrollLeft;
      const rawDeltaPx = (currentX - startX) + (currentScrollLeft - initialScrollLeft);
      if (Math.abs(rawDeltaPx) >= 1) {
        moved = true;
      }
      const signedDeltaPx = type === 'in' ? rawDeltaPx : -rawDeltaPx;
      const deltaSec = signedDeltaPx / basePixelsPerSecRef.current;
      latestFade = Math.max(0, Math.min(maxFade, initialFade + deltaSec));

      if (rafId === null) {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          setFadePreview({
            trackId,
            clipId,
            type,
            fadeInSec: type === 'in' ? latestFade : otherFade,
            fadeOutSec: type === 'out' ? latestFade : otherFade,
          });
        });
      }
    };

    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }

      setIsDraggingClip(false);
      setFadePreview(null);

      if (moved) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 80);

        if (Math.abs(latestFade - initialFade) >= 0.002 && onSetClipFadesRef.current) {
          if (type === 'in') {
            onSetClipFadesRef.current(trackId, clipId, latestFade, otherFade);
          } else {
            onSetClipFadesRef.current(trackId, clipId, otherFade, latestFade);
          }
        }
      }
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  };

  useEffect(() => {
    onMoveTakeRef.current = onMoveTake;
    onCommitDragMoveRef.current = onCommitDragMove;
    onSeekRef.current = onSeek;
    snapToBeatRef.current = snapToBeat;
    secPerBeatRef.current = secPerBeat;
    basePixelsPerSecRef.current = basePixelsPerSec;
    isPlayingRef.current = isPlaying;
    currentTimeRef.current = currentTime;
  }, [onMoveTake, onCommitDragMove, onSeek, snapToBeat, secPerBeat, basePixelsPerSec, isPlaying, currentTime]);

  // Time format helper (supports negative lead-in offsets cleanly)
  const formatTime = (sec: number) => {
    const sign = sec < 0 ? '-' : '';
    const abs = Math.abs(sec);
    const mins = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    const ms = Math.floor((abs % 1) * 10);
    return `${sign}${mins}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatBarTime = (sec: number) => {
    if (sec < 0) {
      return `${sec.toFixed(2)}s`;
    }
    const bar = Math.floor(sec / secPerBar) + 1;
    const beatInBar = Math.floor((sec % secPerBar) / secPerBeat) + 1;
    return `Bar ${bar}.${beatInBar}`;
  };

  const formatPan = (pan: number = 0) => {
    if (Math.abs(pan) < 0.05) return 'C';
    if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`;
    return `R${Math.round(pan * 100)}`;
  };

  // State to track if the user is scrubbing the playhead (prevents any accidental channel or clip move)
  const [isScrubbingPlayhead, setIsScrubbingPlayhead] = useState<boolean>(false);

  // Follow the actual playhead while audio runs, without moving clips or seeking.
  // Leave manual horizontal scrolling alone when playback is paused.
  useEffect(() => {
    if ((!isPlaying && !isRecording) || isDraggingClip || isScrubbingPlayhead) return;
    const viewport = containerRef.current;
    if (!viewport) return;
    const playheadX = trackHeaderWidth + TIMELINE_GUTTER + currentTime * basePixelsPerSec;
    const margin = Math.min(40, Math.max(16, (viewport.clientWidth - trackHeaderWidth) / 4));
    const visibleLeft = viewport.scrollLeft + trackHeaderWidth + margin;
    const visibleRight = viewport.scrollLeft + viewport.clientWidth - margin;
    if (playheadX > visibleRight) {
      viewport.scrollLeft = playheadX - viewport.clientWidth + margin;
    } else if (playheadX < visibleLeft) {
      viewport.scrollLeft = Math.max(0, playheadX - trackHeaderWidth - margin);
    }
  }, [currentTime, isPlaying, isRecording, isDraggingClip, isScrubbingPlayhead, basePixelsPerSec, trackHeaderWidth]);

  // Unified Playhead Scrubber Handler (Works seamlessly from TOP ruler, BOTTOM bar, or playhead handle)
  const startPlayheadScrub = (clientX: number) => {
    // Prevent moving or jumping playhead while playing to avoid unwanted seeks during scrolling/viewing
    if (isRecording) return;
    setIsScrubbingPlayhead(true);
    const timelineEl = timelineContentRef.current;
    if (!timelineEl) return;

    const updateTimeFromX = (x: number) => {
      if (!timelineEl) return;
      const rect = timelineEl.getBoundingClientRect();
      const clickX = x - rect.left - trackHeaderWidth - TIMELINE_GUTTER;
      const newTime = Math.max(0, Math.min(duration, clickX / basePixelsPerSec));
      onSeek(Math.round(newTime * 1000) / 1000);
    };

    updateTimeFromX(clientX);

    const onMove = (moveEvt: MouseEvent | TouchEvent) => {
      if ('touches' in moveEvt) {
        if (moveEvt.cancelable) moveEvt.preventDefault();
        const curX = moveEvt.touches[0].clientX;
        updateTimeFromX(curX);
      } else {
        updateTimeFromX(moveEvt.clientX);
      }
    };

    const onEnd = () => {
      setIsScrubbingPlayhead(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
  };

  const handlePlayheadMouseDown = (e: React.MouseEvent) => {
    if (isRecording) return;
    e.stopPropagation();
    e.preventDefault();
    startPlayheadScrub(e.clientX);
  };

  const handlePlayheadTouchStart = (e: React.TouchEvent) => {
    if (isRecording) return;
    e.stopPropagation();
    startPlayheadScrub(e.touches[0].clientX);
  };

  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isRecording) return;
    e.stopPropagation();
    startPlayheadScrub(e.clientX);
  };

  const handleRulerTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isRecording) return;
    e.stopPropagation();
    startPlayheadScrub(e.touches[0].clientX);
  };

  // Safe lane clicking: Sets playhead without triggering clip dragging or channel movement
  const handleLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only allow setting playhead position when playback is stopped and not finishing a drag
    if (isRecording || isDraggingClip || isScrubbingPlayhead || justDraggedRef.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-clip-item]') || target.closest('button') || target.closest('input')) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - TIMELINE_GUTTER;
    const newTime = Math.max(0, Math.min(duration, clickX / basePixelsPerSec));
    onSeek(Math.round(newTime * 1000) / 1000);
  };

  // Synchronous, zero-drop dragging logic for moving takes / clips
  const handleClipMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    track: VocalTrack,
    clip: VocalClip
  ) => {
    if (isScrubbingPlayhead || isRecording) return;
    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('[data-resize-handle]') ||
      target.closest('[data-fade-handle]')
    ) {
      return;
    }

    e.stopPropagation();
    if (!('touches' in e)) {
      e.preventDefault();
    }
    setSelectedClipId(clip.id);
    onSelectTrack(track.id);

    // Si la toma tiene seguro (Hold/Lock), no permitir desplazamiento involuntario
    if (clip.isLocked) {
      return;
    }

    // Safety edge zone: If the user clicked within 20px of either edge,
    // they are in the trim/resize grab zone. Never initiate clip dragging here!
    const clipElem = e.currentTarget as HTMLElement;
    if (clipElem && clipElem.getBoundingClientRect) {
      const rect = clipElem.getBoundingClientRect();
      const clickX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const distFromLeft = clickX - rect.left;
      const distFromRight = rect.right - clickX;
      if (distFromLeft <= 20 || distFromRight <= 20) {
        return;
      }
    }

    const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const initialScrollLeft = containerRef.current?.scrollLeft ?? 0;
    const initialOffset = clip.startBeatOffset;
    const minOffset = -Math.max(0, (clip.buffer?.duration || clip.duration || 0) - 0.05);
    const activeTrackId = track.id;
    const activeClipId = clip.id;
    let isDragActive = false;
    let moved = false;
    let latestOffset = initialOffset;

    const handleMove = (moveEvt: MouseEvent | TouchEvent) => {
      if ('touches' in moveEvt && moveEvt.cancelable) {
        moveEvt.preventDefault();
      }
      const clientX = 'touches' in moveEvt
        ? (moveEvt.touches[0]?.clientX ?? startX)
        : moveEvt.clientX;
      const currentScrollLeft = containerRef.current?.scrollLeft ?? initialScrollLeft;
      const deltaPx = (clientX - startX) + (currentScrollLeft - initialScrollLeft);

      // 6-pixel deadzone: prevents accidental small gestures or taps from moving the take!
      if (!isDragActive) {
        if (Math.abs(deltaPx) < 6) {
          return;
        }
        isDragActive = true;
        moved = true;
        setIsDraggingClip(true);
        setDragClipId(activeClipId);
        setDragPreviewOffset(initialOffset);
        if (onStartDragMove) {
          onStartDragMove();
        }
      }

      moved = true;
      const deltaSec = deltaPx / basePixelsPerSecRef.current;
      const rawOffset = Math.max(minOffset, initialOffset + deltaSec);
      const beatSec = secPerBeatRef.current;
      const newOffset = snapToBeatRef.current
        ? Math.round(rawOffset / beatSec) * beatSec
        : rawOffset;
      latestOffset = Math.round(Math.max(minOffset, newOffset) * 1000) / 1000;
      setDragPreviewOffset(latestOffset);
      onMoveTakeRef.current(
        activeTrackId,
        latestOffset,
        activeClipId,
        false
      );
    };

    const handleEnd = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);

      if (isDragActive) {
        setIsDraggingClip(false);
        setDragClipId(null);
        setDragPreviewOffset(null);
      }

      if (moved && isDragActive) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 80);
        onMoveTakeRef.current(
          activeTrackId,
          latestOffset,
          activeClipId,
          false
        );
        if (onCommitDragMoveRef.current) {
          onCommitDragMoveRef.current(activeTrackId, initialOffset, activeClipId);
        }
      }

      if (isPlayingRef.current) {
        onSeekRef.current(currentTimeRef.current);
      }
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('touchcancel', handleEnd);
  };

  const selectedClipTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedTrackClips = selectedClipTrack ? getTrackClips(selectedClipTrack) : [];
  const activeSelectedClip = selectedTrackClips.find((c) => c.id === selectedClipId) || selectedTrackClips[selectedTrackClips.length - 1];
  const canCutSelectedClip = Boolean(activeSelectedClip && !isRecording &&
    currentTime > activeSelectedClip.startBeatOffset && currentTime < activeSelectedClip.startBeatOffset + activeSelectedClip.duration);

  // Generate Musical Grid ticks: Downbeats (Tiempos Fuertes) & Sub-beats (2, 3, 4)
  interface GridBeatTick {
    bar: number;           // 1-indexed bar number
    beat: number;          // 1, 2, 3, or 4
    sec: number;           // timestamp in seconds
    isDownbeat: boolean;   // beat === 1 (Tiempo Fuerte principal)
    isSemiStrong: boolean; // beat === 3 (Tiempo Semifuerte)
  }

  const totalBars = Math.ceil(duration / secPerBar);
  const gridTicks: GridBeatTick[] = [];
  for (let b = 0; b < totalBars; b++) {
    for (let beat = 1; beat <= 4; beat++) {
      const sec = b * secPerBar + (beat - 1) * secPerBeat;
      if (sec <= duration + 0.1) {
        gridTicks.push({
          bar: b + 1,
          beat,
          sec,
          isDownbeat: beat === 1,
          isSemiStrong: beat === 3,
        });
      }
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-1 sm:px-4 py-1 text-white flex flex-col shrink-0">
      {/* Workspace Header & Action Bar - Anchored at the top */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 p-2.5 sm:p-3 bg-zinc-900/95 rounded-2xl border border-zinc-800 shadow-xl mb-2 backdrop-blur-md sm:sticky sm:top-0 z-50">
        <div className="flex items-center gap-2">
          <Image
            width={979}
            height={345}
            sizes="(min-width: 640px) 80px, 68px"
            loading="lazy"
            src="/images/rgodbeat-logo.png"
            alt="RGodbeat"
            style={{ aspectRatio: "979 / 345" }}
            className="h-6 sm:h-7 w-auto object-contain filter brightness-125 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)] shrink-0"
          />
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <h3 className="text-xs sm:text-sm font-bold font-display uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
            <span>MIXER</span>
          </h3>
        </div>

        {/* Action Controls & Zoom */}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {/* Physical Undo / Redo buttons */}
          <div className="flex items-center bg-zinc-800/90 rounded-xl p-1 border border-zinc-700/80 shadow-inner">
            <button
              onClick={onUndo}
              disabled={isRecording || !canUndo}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                canUndo
                  ? 'text-zinc-200 hover:text-white hover:bg-zinc-700 active:scale-95 text-amber-300'
                  : 'text-zinc-600 cursor-not-allowed opacity-40'
              }`}
              title="Deshacer (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span>Deshacer</span>
              {undoCount > 0 && (
                <span className="text-[9px] px-1 rounded bg-zinc-900 font-bold text-zinc-400">
                  {undoCount}
                </span>
              )}
            </button>

            <div className="w-[1px] h-4 bg-zinc-700 mx-0.5" />

            <button
              onClick={onRedo}
              disabled={isRecording || !canRedo}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                canRedo
                  ? 'text-zinc-200 hover:text-white hover:bg-zinc-700 active:scale-95 text-amber-300'
                  : 'text-zinc-600 cursor-not-allowed opacity-40'
              }`}
              title="Rehacer (Ctrl+Y)"
            >
              <Redo2 className="w-3.5 h-3.5" />
              <span>Rehacer</span>
              {redoCount > 0 && (
                <span className="text-[9px] px-1 rounded bg-zinc-900 font-bold text-zinc-400">
                  {redoCount}
                </span>
              )}
            </button>
          </div>

          <div className="h-5 w-px bg-zinc-700 mx-0.5 hidden sm:block" />

          {loopSettings && onOpenLoopModal && (
            <button
              onClick={onOpenLoopModal}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all border shadow-sm ${
                loopSettings.enabled
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-500/10'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700'
              }`}
              title="Configurar y ajustar el Loop de compases (Bars)"
            >
              <Repeat className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {loopSettings.enabled
                  ? `Loop: Bar ${loopSettings.startBar + 1}-${loopSettings.bars === 'all' ? 'Fin' : loopSettings.startBar + (loopSettings.bars as number)}`
                  : 'Loop: Inactivo'}
              </span>
            </button>
          )}

          {onAddBackingTrack && canAddMoreTracks && (
            <button
              onClick={onAddBackingTrack}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 hover:border-amber-400/50 text-xs font-mono font-semibold transition-all active:scale-95 shadow-sm"
              title="Agregar una pista adicional de coro o apoyo (hasta 2 pistas extra)"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Coro Extra</span>
            </button>
          )}

          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 text-xs font-mono transition-all"
            title="Ir al inicio (0:00)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onPlayPause}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold transition-all shadow-sm active:scale-95"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
            <span>{isPlaying ? 'PAUSA' : 'PLAY'}</span>
          </button>

          {/* DAW Transport Record Button */}
          {onStartRecord && (
            <button
              onClick={() => {
                if (isRecording) {
                  if (onStopRecord) onStopRecord();
                } else {
                  onStartRecord(selectedTrackId);
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all shadow-sm active:scale-95 select-none ${
                isRecording
                  ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-red-600/50 ring-1 ring-white/50'
                  : 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30'
              }`}
              title={isRecording ? 'Detener grabación (clic o barra espaciadora)' : `Grabar en pista armada: ${selectedTrackName}`}
            >
              {isRecording ? (
                <Square className="w-3.5 h-3.5 fill-current" />
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-white shadow-inner" />
              )}
              <span>{isRecording ? `DETENER (${formatTime(currentTime)})` : `REC (${selectedTrackName.toUpperCase()})`}</span>
            </button>
          )}

          {/* Direct Channel Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-mono text-zinc-400 hidden md:inline">Canal:</span>
            <select
              aria-label="Canal para grabar o editar"
              value={selectedTrackId}
              onChange={(e) => {
                const newId = e.target.value as VocalTrackId;
                onSelectTrack(newId);
              }}
              className="bg-zinc-800 text-amber-300 font-mono text-xs font-bold px-2 py-1.5 rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400 cursor-pointer"
              title="Seleccionar canal para grabar o editar"
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Cut / Scissor Tool Button */}
          {onSplitTake && (
            <button
              onClick={() => {
                const targetTrack = selectedTrackId;
                onSplitTake(targetTrack, activeSelectedClip?.id, currentTime);
              }}
              disabled={!canCutSelectedClip}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500/20 text-zinc-200 hover:text-amber-300 border border-zinc-700 hover:border-amber-500/40 font-mono text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm"
              title={`Cortar / Dividir toma en la posición del cabezal (${formatTime(currentTime)})`}
            >
              <Scissors className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">CORTAR</span>
            </button>
          )}

          {/* 1-Tap Edge Mode Toggle: Trim (Recortar) vs Time-Stretch (Estirar) */}
          {onResizeClipEdge && (
            <button
              type="button"
              onClick={() => setActiveEditTool((prev) => (prev === 'trim' ? 'stretch' : 'trim'))}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                isAltPressed || activeEditTool === 'stretch'
                  ? 'bg-amber-400/20 text-amber-300 border-amber-400/60 shadow-[0_0_10px_rgba(251,191,36,0.25)]'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-emerald-300 border-zinc-700'
              }`}
              title={
                isAltPressed || activeEditTool === 'stretch'
                  ? 'Modo Bordes: ESTIRAR TEMPO (Time-Stretch WSOLA sin cambiar tono). Toca para volver a Recortar'
                  : 'Modo Bordes: RECORTAR / EXTENDER. Toca para cambiar a Estirar Tempo (o mantén Alt)'
              }
            >
              {isAltPressed || activeEditTool === 'stretch' ? (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">ESTIRAR</span>
                </>
              ) : (
                <>
                  <MoveHorizontal className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="hidden sm:inline">RECORTAR</span>
                </>
              )}
            </button>
          )}

          <div className="h-5 w-px bg-zinc-700 mx-1 hidden sm:block" />

          {/* Faders / Mix Visibility Toggle Button */}
          <button
            type="button"
            onClick={() => setShowFaders((prev) => !prev)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
              showFaders
                ? 'bg-amber-400 text-black border-amber-300 shadow-md shadow-amber-500/20'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border-zinc-700'
            }`}
            title={
              showFaders
                ? 'Ocultar faders de volumen y paneo (Vista compacta)'
                : 'Mostrar faders de volumen y paneo en cada pista (Vista mixer)'
            }
          >
            <Sliders className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{showFaders ? 'FADERS ON' : 'FADERS'}</span>
            <span className="sm:hidden">{showFaders ? 'MIX' : 'MIX'}</span>
          </button>

          <button type="button" onClick={() => setSnapToBeat(value => !value)}
            aria-pressed={snapToBeat}
            className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-mono text-amber-300"
            title="Ajustar los movimientos al tiempo musical del beat">
            {snapToBeat ? 'AJUSTE: BEAT' : 'AJUSTE: LIBRE'}
          </button>
          <button
            onClick={() => setZoomLevel((prev) => Math.max(0.6, prev - 0.25))}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all"
            title="Reducir zoom"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-zinc-400 w-8 text-center hidden sm:inline">
            {Math.round(zoomLevel * 100)}%
          </span>
          <button
            onClick={() => setZoomLevel((prev) => Math.min(8, prev + 0.5))}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Multitrack Canvas Window - Only this section scrolls tracks */}
      <div
        ref={containerRef}
        className="w-full shrink-0 h-[min(52dvh,480px)] min-h-[280px] bg-[#0d0d12] rounded-2xl border border-zinc-800/90 shadow-2xl overflow-y-auto overflow-x-auto relative select-none"
      >
        <div
          ref={timelineContentRef}
          className="relative min-w-full"
          style={{ width: `${timelineWidth + trackHeaderWidth + TIMELINE_GUTTER + 40}px` }}
        >
          {/* Time Ruler (Seconds & Musical Bars) */}
          <div className="sticky top-0 z-30 h-9 bg-[#12121a] border-b border-zinc-800 flex items-stretch shadow-md">
            {/* Left Header Column */}
            <div
              className="shrink-0 sticky left-0 z-50 px-3 text-[10px] font-mono text-zinc-400 font-bold border-r border-zinc-800 uppercase tracking-wider flex items-center justify-between bg-[#12121a] shadow-[4px_0_12px_rgba(0,0,0,0.7)] transition-all h-full"
              style={{ width: `${trackHeaderWidth}px` }}
            >
              <button
                type="button"
                onClick={() => setShowFaders((prev) => !prev)}
                className="flex items-center gap-1.5 hover:text-amber-300 transition-colors cursor-pointer text-xs font-bold font-mono"
                title={showFaders ? 'Ocultar faders (Vista compacta)' : 'Mostrar faders de volumen y paneo (Modo mixer)'}
              >
                <Sliders className={`w-3.5 h-3.5 ${showFaders ? 'text-amber-400' : 'text-zinc-500'}`} />
                <span>{showFaders ? 'MIX ON' : 'PISTAS'}</span>
              </button>
            </div>

            {/* Ruler Time Lane (Click & Scrub from Top) */}
            <div
              onMouseDown={handleRulerMouseDown}
              onTouchStart={handleRulerTouchStart}
              className={`relative flex-1 h-full overflow-hidden group select-none bg-[#0e0e16] ${
                isRecording ? 'cursor-default' : 'cursor-ew-resize'
              }`}
              title={
                isRecording
                  ? 'Detén la grabación para mover el cabezal'
                  : 'Haz clic o arrastra para mover el cursor de reproducción'
              }
            >
              {gridTicks.map((tick, idx) => {
                const leftPos = TIMELINE_GUTTER + tick.sec * basePixelsPerSec;
                if (tick.isDownbeat) {
                  // Beat 1: Tiempo Fuerte Principal (Compás entero) - Alta visibilidad
                  return (
                    <div
                      key={`ruler-b-${tick.bar}`}
                      className="absolute top-0 bottom-0 pointer-events-none flex flex-col justify-between"
                      style={{ left: `${leftPos}px` }}
                    >
                      {/* Bold vertical downbeat tick */}
                      <div className="w-[2px] h-3 bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />

                      {/* Clear, High-Contrast Bar Badge: Single-line without wrap */}
                      <div className="absolute top-1 left-1 flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-950/95 border border-amber-500/70 shadow-md whitespace-nowrap flex-nowrap">
                        <span className="text-[10px] font-mono font-black text-amber-300 tracking-tight whitespace-nowrap">
                          Bar {tick.bar}
                        </span>
                        {zoomLevel >= 1.2 && (
                          <span className="text-[8px] font-mono text-zinc-400 whitespace-nowrap">
                            {formatTime(tick.sec)}
                          </span>
                        )}
                      </div>

                      <div className="w-[2px] h-2 bg-amber-400/80" />
                    </div>
                  );
                }

                if (tick.isSemiStrong) {
                  // Beat 3: Tiempo Semifuerte (Sub-acento rítmico)
                  return (
                    <div
                      key={`ruler-b3-${idx}`}
                      className="absolute bottom-0 h-3.5 border-l border-zinc-500/80 pointer-events-none flex flex-col items-center"
                      style={{ left: `${leftPos}px` }}
                    >
                      {zoomLevel >= 1.2 && (
                        <span className="text-[7px] font-mono text-zinc-500 -translate-y-3 font-semibold">
                          3
                        </span>
                      )}
                    </div>
                  );
                }

                // Beats 2 y 4: Tiempos Débiles
                return (
                  <div
                    key={`ruler-sub-${idx}`}
                    className="absolute bottom-0 h-2 border-l border-zinc-700/60 pointer-events-none"
                    style={{ left: `${leftPos}px` }}
                  >
                    {zoomLevel >= 1.6 && (
                      <span className="text-[6.5px] font-mono text-zinc-600 -translate-y-2.5 block">
                        {tick.beat}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Visual Loop Region Highlight */}
          {loopSettings?.enabled && duration > 0 && (
            <div
              className="absolute top-0 bottom-0 pointer-events-none bg-amber-400/10 border-x-2 border-amber-400 z-30"
              style={{
                left: `${trackHeaderWidth + TIMELINE_GUTTER + loopSettings.startSec * basePixelsPerSec}px`,
                width: `${Math.max(4, (loopSettings.endSec - loopSettings.startSec) * basePixelsPerSec)}px`,
              }}
            >
              <div className="absolute top-1 left-1 text-[8px] font-mono font-bold text-amber-300 bg-black/90 px-1.5 py-0.5 rounded shadow border border-amber-500/50 whitespace-nowrap">
                LOOP: Bar {loopSettings.startBar + 1} ➔ Bar {loopSettings.bars === 'all' ? Math.ceil(duration / secPerBar) : loopSettings.startBar + (loopSettings.bars as number)}
              </div>
            </div>
          )}

          {/* Vertical Playhead Cursor Line with Full-Height Grab Area and Dual Top & Bottom Handles */}
          <div
            className={`absolute top-0 bottom-0 z-35 w-0.5 bg-amber-400 shadow-[0_0_14px_rgba(251,191,36,0.95)] ${
              isPlaying ? 'pointer-events-none' : 'pointer-events-auto'
            }`}
            style={{
              left: `${trackHeaderWidth + TIMELINE_GUTTER + currentTime * basePixelsPerSec}px`,
            }}
          >
            {/* Full-height touch/grab hit-box: allows dragging playhead from ANY height of the timeline */}
            <div
              onMouseDown={handlePlayheadMouseDown}
              onTouchStart={handlePlayheadTouchStart}
              className={`absolute -top-1 -bottom-1 -left-4 w-9 ${
                isPlaying ? 'cursor-default pointer-events-none' : 'cursor-ew-resize pointer-events-auto'
              } group/scrub-hitbox z-40`}
              title={isPlaying ? 'Pausa la reproducción para mover el cabezal' : 'Arrastrar selector de tiempo con precisión'}
            >
              <div
                className={`w-1 h-full mx-auto rounded transition-colors ${
                  isScrubbingPlayhead ? 'bg-amber-400/40' : 'group-hover/scrub-hitbox:bg-amber-400/20'
                }`}
              />
            </div>

            {/* Top Playhead Cursor Grab Handle (Ruler Header) */}
            <div
              onMouseDown={handlePlayheadMouseDown}
              onTouchStart={handlePlayheadTouchStart}
              className={`absolute -top-1 -translate-x-1/2 w-8 h-8 flex flex-col items-center justify-start ${
                isPlaying ? 'cursor-default pointer-events-none' : 'cursor-ew-resize pointer-events-auto'
              } group/top-scrub z-50`}
              title={isPlaying ? 'Pausa la reproducción para mover el cabezal' : 'Arrastrar cursor de reproducción desde arriba'}
            >
              <div className="w-4 h-4 bg-amber-400 rotate-45 shadow-[0_0_10px_rgba(251,191,36,0.9)] border-2 border-black group-hover/top-scrub:scale-125 group-hover/top-scrub:bg-amber-300 transition-transform" />
              <span className="text-[8px] font-mono font-bold text-amber-300 bg-black/95 px-1 rounded -translate-y-0.5 shadow border border-amber-500/40 whitespace-nowrap">
                {formatTime(currentTime)}
              </span>
            </div>

            {/* Floating Live Scrubber Precision Badge (appears prominently while holding/dragging) */}
            {isScrubbingPlayhead && (
              <div className="absolute top-1/2 -translate-y-1/2 left-3 z-50 pointer-events-none bg-zinc-950/95 border-2 border-amber-400 px-2.5 py-1.5 rounded-xl shadow-[0_0_20px_rgba(251,191,36,0.5)] flex flex-col items-start whitespace-nowrap backdrop-blur-md">
                <span className="text-[11px] font-mono font-black text-amber-300">
                  {formatBarTime(currentTime)}
                </span>
                <span className="text-[9px] font-mono text-zinc-300 font-semibold">
                  {formatTime(currentTime)} ({currentTime.toFixed(2)}s)
                </span>
              </div>
            )}

          </div>

          {/* TRACK 0: The Master Beat */}
          <div className="flex items-stretch border-b border-zinc-800/80 bg-zinc-950/70 h-24 group hover:bg-zinc-900/40 transition-colors border-l-4 border-l-transparent">
            {/* Track Info Header */}
            <div
              className="shrink-0 sticky left-0 z-40 p-2 border-r border-zinc-800 flex flex-col justify-between bg-zinc-900 shadow-[4px_0_12px_rgba(0,0,0,0.7)] transition-all"
              style={{ width: `${trackHeaderWidth}px` }}
            >
              {showFaders ? (
                <>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                      <span
                        className="text-xs font-bold font-display text-white truncate"
                        title={beat ? beat.title : 'Beat Principal'}
                      >
                        {beat ? beat.title : 'Beat Principal'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onToggleBeatMute && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleBeatMute();
                          }}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            isBeatMuted
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                          }`}
                          title={isBeatMuted ? 'Activar beat (Desmutear)' : 'Silenciar beat (Mute)'}
                        >
                          {isBeatMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                          <span>{isBeatMuted ? 'MUTED' : 'MUTE'}</span>
                        </button>
                      )}
                      {onOpenLoadBeat && (
                        <button
                          onClick={onOpenLoadBeat}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-black font-mono font-semibold text-zinc-300 transition-colors shrink-0 border border-zinc-700/80"
                          title="Administrar / cambiar beat"
                        >
                          Beat
                        </button>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const keyInfo = parseKeyAndGetRelative(beat?.key, beat?.scale);
                    return (
                      <div className="flex items-center justify-between mt-0.5">
                        <span
                          className="text-[10px] font-mono text-zinc-400 truncate"
                          title={beat ? `${keyInfo.tonalityName} · Relativa: ${keyInfo.relativeTonalityName}` : ''}
                        >
                          {beat ? `${beat.bpm} BPM · ${keyInfo.keySymbol}` : 'Sin Beat'}
                        </span>
                        <span
                          className="text-[8px] font-mono text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 shrink-0 flex items-center gap-1"
                          title={`Slot ${currentBeatSlotIndex} de 23`}
                        >
                          <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                          <span>SLOT {currentBeatSlotIndex}</span>
                        </span>
                      </div>
                    );
                  })()}

                  {/* Master Beat Volume Control Slider */}
                  <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-zinc-850/80" onClick={(e) => e.stopPropagation()}>
                    <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.01}
                      value={beatVolume ?? 1.0}
                      onChange={(e) => onChangeBeatVolume && onChangeBeatVolume(parseFloat(e.target.value))}
                      className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      title={`Volumen del Beat: ${Math.round((beatVolume ?? 1.0) * 100)}%`}
                    />
                    <span className="text-[9px] font-mono text-amber-300 font-bold min-w-[28px] text-right">
                      {Math.round((beatVolume ?? 1.0) * 100)}%
                    </span>
                  </div>
                </>
              ) : (
                /* Compact Mode: No volume slider, clean essential controls */
                <>
                  <div className="flex items-center justify-between gap-1">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                      <span
                        className="text-xs font-bold font-display text-white truncate"
                        title={beat ? beat.title : 'Beat'}
                      >
                        {beat ? beat.title : 'Beat'}
                      </span>
                    </div>
                    {onOpenLoadBeat && (
                      <button
                        onClick={onOpenLoadBeat}
                        className="text-[8px] px-1 py-0.5 rounded bg-zinc-800 hover:bg-amber-500 hover:text-black font-mono font-semibold text-zinc-300 transition-colors shrink-0 border border-zinc-700/80"
                        title="Cambiar beat"
                      >
                        Beat
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-1 mt-1">
                    {onToggleBeatMute && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleBeatMute();
                        }}
                        className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                          isBeatMuted
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                        }`}
                        title={isBeatMuted ? 'Desmutear' : 'Mute beat'}
                      >
                        {isBeatMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                        <span>{isBeatMuted ? 'MUT' : 'MUTE'}</span>
                      </button>
                    )}
                    <span className="text-[9px] font-mono text-amber-300/80 font-bold truncate">
                      {beat ? `${beat.bpm} BPM` : ''}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Beat Waveform Track Body */}
            <div
              onClick={handleLaneClick}
              className="relative flex-1 h-full cursor-pointer bg-zinc-900/20"
              title="Haz clic para ubicar el cursor de reproducción"
            >
              {/* Musical Grid Lines in Beat Lane */}
              {gridTicks.map((tick, idx) => (
                <div
                  key={`beat-grid-${idx}`}
                  className={`absolute top-0 bottom-0 pointer-events-none ${
                    tick.isDownbeat
                      ? 'border-l border-amber-500/20 z-0'
                      : tick.isSemiStrong
                      ? 'border-l border-zinc-800/40 z-0'
                      : 'border-l border-zinc-900/25 z-0'
                  }`}
                  style={{ left: `${TIMELINE_GUTTER + tick.sec * basePixelsPerSec}px` }}
                />
              ))}

              {beat && (
                <div
                  className={`absolute top-2 bottom-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/10 outline outline-1 -outline-offset-1 outline-amber-500/40 overflow-hidden pointer-events-none z-10 transition-opacity ${
                    isBeatMuted ? 'opacity-30 grayscale' : ''
                  }`}
                  style={{ left: `${TIMELINE_GUTTER}px`, width: `${beat.duration * basePixelsPerSec}px` }}
                >
                  <ClipWaveform buffer={beat.buffer} width={beat.buffer.duration * basePixelsPerSec} locked />
                  <span className="absolute left-2.5 bottom-1 text-[9px] font-mono text-amber-300 font-semibold drop-shadow">
                    BEAT · {Math.round(beat.duration)}s {isBeatMuted && '(SILENCIADO)'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* VOCAL TRACKS: Lead 1, Lead 2, Double, Harmonies, Adlibs, Backings */}
          {tracks.map((track) => {
            const clips = getTrackClips(track);
            const isSelected = selectedTrackId === track.id;
            const isArmed = selectedTrackId === track.id;
            const isThisRecording = isRecording && activeRecordingTrackId === track.id;
            const activePreset = getVocalPresetById(track.fx?.presetId);

            return (
              <div
                key={track.id}
                onClick={() => {
                  if (isScrubbingPlayhead) return;
                                if (clips.length > 0 && (!selectedClipId || !clips.some((c) => c.id === selectedClipId))) {
                    setSelectedClipId(clips[clips.length - 1].id);
                  }
                  onSelectTrack(track.id);
                }}
                className={`flex items-stretch border-b border-zinc-850 h-24 border-l-4 transition-colors select-none ${
                  isThisRecording
                    ? 'bg-red-950/30 border-l-red-500 shadow-[0_0_20px_rgba(239,68,68,0.25)]'
                    : isArmed
                    ? 'bg-zinc-900/80 border-l-red-500 shadow-md ring-1 ring-red-500/20'
                    : isSelected
                    ? 'bg-zinc-900/60 border-l-amber-500/60'
                    : 'bg-transparent hover:bg-zinc-900/20 border-l-transparent'
                }`}
              >
                {/* Track Left Header (Controls: FX, Mute, Solo, Volume, Pan) */}
                <div
                  className="shrink-0 sticky left-0 z-40 p-2 border-r border-zinc-800 flex flex-col justify-between bg-[#111116] shadow-[4px_0_12px_rgba(0,0,0,0.7)] transition-all"
                  style={{ width: `${trackHeaderWidth}px` }}
                >
                  {showFaders ? (
                    <>
                      {/* Row 1: Name, Custom delete, FX button */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-semibold font-display text-zinc-100 truncate">
                            {track.name}
                          </span>
                        {isArmed && (
                            <span className="text-[8px] font-mono px-1 py-0.2 rounded bg-red-500/20 text-red-300 font-bold border border-red-500/30">
                              ARM
                            </span>
                          )}
                          {clips.length > 1 && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              {clips.length}
                            </span>
                          )}
                          {track.isCustom && onDeleteTrack && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTrack(track.id);
                              }}
                              className="text-zinc-600 hover:text-red-400 p-0.5 rounded transition-colors"
                              title="Eliminar esta pista adicional"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenPresets?.(track.id);
                            }}
                            title={activePreset ? `Preset: ${activePreset.label}` : 'Elegir preset vocal'}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono border flex items-center gap-0.5 transition-colors cursor-pointer ${
                              activePreset
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                            }`}
                          >
                            <Sparkles className="w-2.5 h-2.5 shrink-0" />
                            <span>{activePreset ? activePreset.badge : 'Preset'}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenFX(track.id);
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 shrink-0"
                          >
                            FX
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Mute [MUTE] */}
                      <div className="flex items-center justify-between gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onToggleMute(track.id)}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            track.isMuted
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                          }`}
                          title={track.isMuted ? 'Activar audio (Desmutear)' : 'Silenciar pista (Mute)'}
                        >
                          {track.isMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                          <span>{track.isMuted ? 'MUTED' : 'MUTE'}</span>
                        </button>
                        <button type="button" onClick={() => onToggleSolo(track.id)} aria-pressed={track.isSolo}
                          title={`Escuchar ${track.name} en solo`}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${track.isSolo ? 'bg-amber-400 text-black border-amber-300' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>SOLO</button>
                        {isArmed && (
                          <span className="text-[8px] font-mono font-bold text-amber-400/90 px-1 py-0.2 rounded bg-amber-500/10 border border-amber-500/20">
                            ACTIVA
                          </span>
                        )}
                      </div>

                      {/* Row 3: Track Volume Slider */}
                      <div
                        className="flex items-center gap-1.5 text-[9px] font-mono mt-0.5 pt-0.5"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Volume2 className="w-3 h-3 text-zinc-400 shrink-0" />
                        <input
                          type="range"
                          min={0}
                          max={1.5}
                          step={0.01}
                          value={track.volume}
                          onChange={(e) => onChangeVolume && onChangeVolume(track.id, parseFloat(e.target.value))}
                          className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                          title={`Volumen ${track.name}: ${Math.round(track.volume * 100)}%`}
                        />
                        <span className="text-[9px] font-mono text-zinc-300 font-bold tabular-nums min-w-[28px] text-right">
                          {Math.round(track.volume * 100)}%
                        </span>
                      </div>

                      {/* Row 4: Stereo PAN control */}
                      <div
                        className="flex items-center justify-between text-[9px] font-mono mt-0.5 pt-0.5 border-t border-zinc-850/80"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="text-zinc-500 font-bold">PAN</span>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] text-zinc-500">L</span>
                          <input
                            type="range"
                            min={-1}
                            max={1}
                            step={0.05}
                            value={track.pan ?? 0}
                            onChange={(e) => onChangePan && onChangePan(track.id, parseFloat(e.target.value))}
                            onDoubleClick={() => onChangePan && onChangePan(track.id, 0)}
                            className="w-14 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                            title={`Panorámico: ${formatPan(track.pan ?? 0)} (Doble clic para centrar)`}
                          />
                          <span className="text-[8px] text-zinc-500">R</span>
                          <button
                            onClick={() => onChangePan && onChangePan(track.id, 0)}
                            className="text-[8px] font-bold text-amber-300 hover:text-amber-200 px-1 py-0.2 rounded bg-zinc-800 border border-zinc-700/60 min-w-[24px] text-center"
                            title="Restablecer al centro (C)"
                          >
                            {formatPan(track.pan ?? 0)}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Compact Mode: Clean track info, FX, and Mute button without volume sliders */
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1 min-w-0">
                          <span className="text-xs font-semibold font-display text-zinc-100 truncate">
                            {track.name}
                          </span>
                          {clips.length > 1 && (
                            <span className="text-[9px] font-mono px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                              {clips.length}
                            </span>
                          )}
                          {track.isCustom && onDeleteTrack && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteTrack(track.id);
                              }}
                              className="text-zinc-600 hover:text-red-400 p-0.5 rounded transition-colors"
                              title="Eliminar pista"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenFX(track.id);
                          }}
                          className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 shrink-0 font-bold"
                        >
                          FX
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-1 mt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => onToggleMute(track.id)}
                            className={`w-5 h-5 rounded text-[9px] font-mono font-bold flex items-center justify-center transition-all cursor-pointer ${
                              track.isMuted
                                ? 'bg-red-500 text-white shadow-sm'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                            }`}
                            title={track.isMuted ? 'Desmutear' : 'Silenciar (Mute)'}
                          >
                            M
                          </button>
                          <button type="button" onClick={() => onToggleSolo(track.id)} aria-pressed={track.isSolo}
                            title={`Escuchar ${track.name} en solo`}
                            className={`w-5 h-5 rounded text-[9px] font-mono font-bold border flex items-center justify-center ${track.isSolo ? 'bg-amber-400 text-black border-amber-300' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>S</button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onOpenPresets?.(track.id)}
                          title={activePreset ? `Preset: ${activePreset.label}` : 'Elegir preset vocal'}
                          className={`flex-1 min-w-0 px-1.5 py-0.5 rounded text-[8.5px] font-mono border flex items-center justify-center gap-0.5 truncate transition-colors cursor-pointer ${
                            activePreset
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 font-bold'
                              : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                          }`}
                        >
                          <Sparkles className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{activePreset ? activePreset.badge : 'Preset'}</span>
                        </button>
                        {isArmed && (
                          <span
                            className="w-2 h-2 rounded-full bg-red-500 shrink-0 animate-pulse"
                            title="Pista armada para grabar"
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Track Audio Lane */}
                <div
                  onClick={handleLaneClick}
                  className="relative flex-1 h-full cursor-pointer bg-zinc-900/10"
                  title="Haz clic para ubicar el cursor de reproducción"
                >
                  {/* Musical Grid Lines: Downbeats vs Sub-beats */}
                  {gridTicks.map((tick, idx) => (
                    <div
                      key={`lane-grid-${idx}`}
                      className={`absolute top-0 bottom-0 pointer-events-none ${
                        tick.isDownbeat
                          ? 'border-l border-amber-500/20 z-0'
                          : tick.isSemiStrong
                          ? 'border-l border-zinc-800/40 z-0'
                          : 'border-l border-zinc-900/25 z-0'
                      }`}
                      style={{ left: `${TIMELINE_GUTTER + tick.sec * basePixelsPerSec}px` }}
                    />
                  ))}

                  {/* Recorded Audio Clips along this same line */}
                  {clips.map((clip, clipIndex) => {
                    const isClipSelected =
                      isSelected &&
                      activeSelectedClip?.id === clip.id;
                    const isTargetOfDrag = isDraggingClip && dragClipId === clip.id;
                    const isTargetOfEdgeResize = edgePreview?.clipId === clip.id;
                    const isTargetOfFade = fadePreview?.clipId === clip.id;

                    const effectiveOffset = isTargetOfEdgeResize
                      ? edgePreview.geometry.startBeatOffset
                      : isTargetOfDrag && dragPreviewOffset !== null
                      ? dragPreviewOffset
                      : clip.startBeatOffset;
                    const effectiveDuration = isTargetOfEdgeResize
                      ? edgePreview.geometry.duration
                      : clip.buffer.duration;
                    const effectiveStretchRatio = isTargetOfEdgeResize
                      ? edgePreview.geometry.timeStretchRatio
                      : clip.timeStretchRatio || 1;
                    const effectiveSourceOffset = isTargetOfEdgeResize
                      ? edgePreview.geometry.sourceOffsetSec
                      : clip.sourceOffsetSec || 0;
                    const effectiveSourceWindowSec = Math.max(
                      0.01,
                      effectiveDuration / Math.max(0.25, effectiveStretchRatio)
                    );
                    const effectiveFadeIn = isTargetOfFade
                      ? fadePreview.fadeInSec
                      : isTargetOfEdgeResize
                      ? edgePreview.geometry.fadeInSec
                      : clip.fadeInSec || 0;
                    const effectiveFadeOut = isTargetOfFade
                      ? fadePreview.fadeOutSec
                      : isTargetOfEdgeResize
                      ? edgePreview.geometry.fadeOutSec
                      : clip.fadeOutSec || 0;

                    const clipStartPx = effectiveOffset * basePixelsPerSec;
                    const clipWidthPx = effectiveDuration * basePixelsPerSec;

                    const rawSourceBuffer = clip.sourceBuffer || clip.buffer;
                    const rawSourceDur = Math.max(0.001, rawSourceBuffer.duration);
                    const useSourceWindowPreview =
                      isTargetOfEdgeResize &&
                      edgePreview.mode === 'trim' &&
                      Math.abs(effectiveStretchRatio - 1.0) < 0.01 &&
                      Boolean(clip.sourceBuffer);
                    const waveformBuffer = useSourceWindowPreview ? rawSourceBuffer : clip.buffer;
                    const waveformStartRatio = useSourceWindowPreview
                      ? Math.max(0, Math.min(1, effectiveSourceOffset / rawSourceDur))
                      : 0;
                    const waveformEndRatio = useSourceWindowPreview
                      ? Math.max(waveformStartRatio, Math.min(1, (effectiveSourceOffset + effectiveSourceWindowSec) / rawSourceDur))
                      : 1;

                    return (
                      <div
                        key={clip.id}
                        data-clip-item="true"
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onMouseDown={(e) => {
                          if (isScrubbingPlayhead) return;
                          handleClipMouseDown(e, track, clip);
                        }}
                        onTouchStart={(e) => {
                          if (isScrubbingPlayhead) return;
                          handleClipMouseDown(e, track, clip);
                        }}
                        className={`group absolute top-2 bottom-2 rounded-sm outline outline-1 -outline-offset-1 flex items-center transition-shadow select-none shadow-lg z-10 ${
                          clip.isLocked
                            ? 'cursor-pointer'
                            : 'cursor-grab active:cursor-grabbing touch-none'
                        } ${
                          isTargetOfEdgeResize
                            ? edgePreview.mode === 'stretch'
                              ? 'bg-gradient-to-r from-amber-600/45 to-amber-500/35 outline-amber-300 ring-2 ring-amber-400/70 shadow-[0_0_20px_rgba(251,191,36,0.45)] z-20'
                              : 'bg-gradient-to-r from-emerald-600/55 to-teal-500/45 outline-emerald-300 ring-2 ring-emerald-300/70 shadow-[0_0_20px_rgba(16,185,129,0.5)] z-20'
                            : isClipSelected
                            ? 'bg-gradient-to-r from-emerald-600/50 to-teal-500/40 outline-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                            : 'bg-gradient-to-r from-emerald-700/25 to-teal-800/20 outline-emerald-500/50 hover:outline-emerald-400'
                        } ${isTargetOfDrag ? 'shadow-[0_0_20px_rgba(16,185,129,0.6)] z-20' : ''}`}
                        style={{
                          left: `${TIMELINE_GUTTER + clipStartPx}px`,
                          width: `${clipWidthPx}px`,
                          willChange: isTargetOfEdgeResize || isTargetOfDrag ? 'left, width' : undefined,
                        }}
                      >
                        {/* Live 60fps Telemetry HUD Badge while Resizing / Stretching / Fading */}
                        {(isTargetOfEdgeResize || isTargetOfFade) && (
                          <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-zinc-950/95 border border-amber-400/60 text-[10px] font-mono font-bold text-amber-300 whitespace-nowrap shadow-lg pointer-events-none z-40 flex items-center gap-1.5">
                            {isTargetOfEdgeResize ? (
                              edgePreview.mode === 'stretch' ? (
                                <>
                                  <Zap className="w-3 h-3 text-amber-400" />
                                  <span>{effectiveStretchRatio.toFixed(2)}x</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-zinc-200">{effectiveDuration.toFixed(2)}s</span>
                                </>
                              ) : (
                                <>
                                  <span className="text-emerald-300">RECORTAR</span>
                                  <span className="text-zinc-500">·</span>
                                  <span className="text-zinc-200">{effectiveDuration.toFixed(2)}s</span>
                                </>
                              )
                            ) : (
                              <span>
                                FADE {fadePreview?.type === 'in' ? 'IN' : 'OUT'}:{' '}
                                {(fadePreview?.type === 'in' ? effectiveFadeIn : effectiveFadeOut).toFixed(2)}s
                              </span>
                            )}
                          </div>
                        )}

                        {/* Fade In Shading & Curve Overlay */}
                        {effectiveFadeIn > 0.01 ? (
                          <div
                            className="absolute top-0 bottom-0 left-0 pointer-events-none z-10 overflow-hidden"
                            style={{ width: `${Math.min(clipWidthPx, effectiveFadeIn * basePixelsPerSec)}px` }}
                          >
                            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                              <path d="M 0 100 Q 50 10 100 0 L 0 0 Z" fill="rgba(0,0,0,0.35)" />
                              <path d="M 0 100 Q 50 10 100 0" stroke="rgba(251,191,36,0.8)" strokeWidth="3" fill="none" />
                            </svg>
                          </div>
                        ) : null}

                        {/* Fade Out Shading & Curve Overlay */}
                        {effectiveFadeOut > 0.01 ? (
                          <div
                            className="absolute top-0 bottom-0 right-0 pointer-events-none z-10 overflow-hidden"
                            style={{ width: `${Math.min(clipWidthPx, effectiveFadeOut * basePixelsPerSec)}px` }}
                          >
                            <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                              <path d="M 0 0 Q 50 10 100 100 L 100 0 Z" fill="rgba(0,0,0,0.35)" />
                              <path d="M 0 0 Q 50 10 100 100" stroke="rgba(251,191,36,0.8)" strokeWidth="3" fill="none" />
                            </svg>
                          </div>
                        ) : null}

                        {/* Fade In Handle (Top-left handle) */}
                        {!clip.isLocked && onSetClipFades && (
                          <div
                            data-fade-handle="in"
                            onMouseDown={(e) => handleFadeHandleMouseDown(e, track, clip, 'in')}
                            onTouchStart={(e) => handleFadeHandleMouseDown(e, track, clip, 'in')}
                            className={`absolute top-0 z-30 w-4 h-4 -translate-x-2 -translate-y-1 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-black shadow cursor-ew-resize transition-opacity select-none touch-none flex items-center justify-center ${
                              isTargetOfFade && fadePreview.type === 'in'
                                ? 'opacity-100 scale-125'
                                : 'opacity-0 group-hover:opacity-100 hover:!opacity-100'
                            }`}
                            style={{ left: `${Math.max(4, effectiveFadeIn * basePixelsPerSec)}px` }}
                            title={`Fundido entrada: ${effectiveFadeIn.toFixed(2)}s (Arrastra horizontalmente)`}
                          >
                            <div className="w-1 h-1 rounded-full bg-black/70" />
                          </div>
                        )}

                        {/* Fade Out Handle (Top-right handle) */}
                        {!clip.isLocked && onSetClipFades && (
                          <div
                            data-fade-handle="out"
                            onMouseDown={(e) => handleFadeHandleMouseDown(e, track, clip, 'out')}
                            onTouchStart={(e) => handleFadeHandleMouseDown(e, track, clip, 'out')}
                            className={`absolute top-0 z-30 w-4 h-4 translate-x-2 -translate-y-1 rounded-full bg-amber-400 hover:bg-amber-300 border-2 border-black shadow cursor-ew-resize transition-opacity select-none touch-none flex items-center justify-center ${
                              isTargetOfFade && fadePreview.type === 'out'
                                ? 'opacity-100 scale-125'
                                : 'opacity-0 group-hover:opacity-100 hover:!opacity-100'
                            }`}
                            style={{ right: `${Math.max(4, effectiveFadeOut * basePixelsPerSec)}px` }}
                            title={`Fundido salida: ${effectiveFadeOut.toFixed(2)}s (Arrastra horizontalmente)`}
                          >
                            <div className="w-1 h-1 rounded-full bg-black/70" />
                          </div>
                        )}

                        {/* Left Edge Resize Handle (Trim / Stretch) */}
                        {!clip.isLocked && onResizeClipEdge && (
                          <div
                            data-resize-handle="start"
                            onMouseDown={(e) => handleEdgeMouseDown(e, track, clip, 'start')}
                            onTouchStart={(e) => handleEdgeMouseDown(e, track, clip, 'start')}
                            className={`absolute left-0 top-0 bottom-0 w-5 z-30 cursor-col-resize flex items-center justify-center transition-colors group/edge select-none touch-none ${
                              isAltPressed || activeEditTool === 'stretch' || (isTargetOfEdgeResize && edgePreview.mode === 'stretch')
                                ? 'hover:bg-amber-400/50 bg-amber-400/25 ring-1 ring-amber-400/60'
                                : 'hover:bg-emerald-400/50 bg-emerald-500/15'
                            }`}
                            title={
                              isAltPressed || activeEditTool === 'stretch'
                                ? 'ESTIRAR / COMPRIMIR (Time Stretch): Arrastra para cambiar tempo sin cambiar tono'
                                : 'RECORTAR / EXTENDER (Trim): Arrastra para recortar o revelar audio (Mantén Alt para estirar)'
                            }
                          >
                            <div className="w-1 h-5 bg-zinc-100 rounded-sm group-hover/edge:bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
                          </div>
                        )}

                        {/* Right Edge Resize Handle (Trim / Stretch) */}
                        {!clip.isLocked && onResizeClipEdge && (
                          <div
                            data-resize-handle="end"
                            onMouseDown={(e) => handleEdgeMouseDown(e, track, clip, 'end')}
                            onTouchStart={(e) => handleEdgeMouseDown(e, track, clip, 'end')}
                            className={`absolute right-0 top-0 bottom-0 w-5 z-30 cursor-col-resize flex items-center justify-center transition-colors group/edge select-none touch-none ${
                              isAltPressed || activeEditTool === 'stretch' || (isTargetOfEdgeResize && edgePreview.mode === 'stretch')
                                ? 'hover:bg-amber-400/50 bg-amber-400/25 ring-1 ring-amber-400/60'
                                : 'hover:bg-emerald-400/50 bg-emerald-500/15'
                            }`}
                            title={
                              isAltPressed || activeEditTool === 'stretch'
                                ? 'ESTIRAR / COMPRIMIR (Time Stretch): Arrastra para cambiar tempo sin cambiar tono'
                                : 'RECORTAR / EXTENDER (Trim): Arrastra para recortar o revelar audio (Mantén Alt para estirar)'
                            }
                          >
                            <div className="w-1 h-5 bg-zinc-100 rounded-sm group-hover/edge:bg-white shadow-[0_0_4px_rgba(0,0,0,0.8)]" />
                          </div>
                        )}

                        {/* Left Drag or Lock Indicator */}
                        <div
                          className="ml-2.5 mr-1.5 flex flex-col gap-0.5 shrink-0"
                          title={clip.isLocked ? 'Toma con Seguro (Hold) activado' : 'Arrastrar para desplazar en el tiempo'}
                        >
                          {clip.isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                          ) : (
                            <MoveHorizontal className="w-3.5 h-3.5 text-emerald-300 opacity-60" />
                          )}
                        </div>

                        <ClipWaveform
                          buffer={waveformBuffer}
                          width={clipWidthPx}
                          locked={clip.isLocked}
                          startRatio={waveformStartRatio}
                          endRatio={waveformEndRatio}
                        />
                        <div className="flex-1 min-w-0" />

                        {/* Clip Meta Tag: Truncated to avoid overlapping action buttons */}
                        <div className="absolute left-2.5 bottom-1 max-w-[calc(100%-64px)] overflow-hidden pointer-events-none drop-shadow flex items-center gap-1.5">
                          <span className={`text-[9px] font-mono font-bold uppercase truncate flex items-center gap-1 ${
                            clip.isLocked ? 'text-amber-300' : 'text-emerald-200'
                          }`}>
                            <span className="truncate">{clip.name || `Toma ${clipIndex + 1}`}</span>
                            {clip.isLocked && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[7px] border border-amber-500/30 shrink-0">
                                HOLD
                              </span>
                            )}
                            {Math.abs(effectiveStretchRatio - 1.0) >= 0.01 && (
                              <span className="px-1 py-0.2 rounded bg-amber-500/30 text-amber-300 text-[7px] border border-amber-500/40 font-mono font-bold flex items-center gap-0.5">
                                <Zap className="w-2 h-2" />
                                {effectiveStretchRatio.toFixed(2)}x
                              </span>
                            )}
                          </span>
                          <span className="text-[8px] font-mono text-zinc-300 truncate hidden xs:inline">
                            {formatTime(effectiveOffset)}
                          </span>
                        </div>

                        {/* Keep actions inside the visible portion of a long take. */}
                        <div className="sticky right-1 self-start mt-1 -mr-1 ml-1 flex items-center gap-0.5 z-20 shrink-0 flex-nowrap">
                          {onToggleLockTake && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onToggleLockTake) {
                                  onToggleLockTake(track.id, clip.id);
                                }
                              }}
                              className={`p-1 rounded-md border transition-all cursor-pointer shadow-sm shrink-0 ${
                                clip.isLocked
                                  ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.6)] opacity-100 font-bold'
                                  : 'bg-black/80 hover:bg-zinc-700 text-zinc-300 border-zinc-700/60 opacity-80 hover:opacity-100'
                              }`}
                              title={
                                clip.isLocked
                                  ? 'Seguro ACTIVADO: Clic para desbloquear y permitir mover esta toma'
                                  : 'Activar SEGURO (Hold): Bloquea la toma para evitar que se mueva por accidente'
                              }
                            >
                              {clip.isLocked ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
                            </button>
                          )}

                          {/* Only show Scissors if clip is wide enough */}
                          {clipWidthPx >= 88 && onSplitTake && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                                            setSelectedClipId(clip.id);
                                onSelectTrack(track.id);
                                onSplitTake(track.id, clip.id, currentTime);
                              }}
                              className="p-1 rounded-md bg-black/75 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/40 transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-sm shrink-0"
                              title={`Cortar esta toma en el cabezal (${formatTime(currentTime)})`}
                            >
                              <Scissors className="w-2.5 h-2.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTake(track.id, clip.id);
                            }}
                            className="p-1 rounded-md bg-black/75 hover:bg-red-600 hover:text-white text-red-300 border border-red-500/40 transition-all opacity-80 hover:opacity-100 cursor-pointer shadow-sm shrink-0"
                            title={`Borrar solo este pedazo (${clip.name || 'Corte'})`}
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}

                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
