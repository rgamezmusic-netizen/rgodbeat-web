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
} from 'lucide-react';
import { BeatData, LoopSettings, VocalClip, VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';
import { parseKeyAndGetRelative } from '@/lib/studio/audio/beatAnalyzer';

const BASE_TRACK_HEADER_WIDTH = 120; // px (clean compact default with ample breathing room)
const EXPANDED_TRACK_HEADER_WIDTH = 192; // px (full mixer with faders and pan)
const TIMELINE_GUTTER = 20; // px (lead-in margin so Bar 1 & waveforms never touch or bleed behind track headers)

export { getTrackClips } from '@/lib/studio/audio/clipEditing';
import { getProjectDuration, getTrackClips } from '@/lib/studio/audio/clipEditing';

/**
 * Resamples waveform peak data across the exact width of a clip
 * so the waveform spans 100% of the recorded take from start to finish.
 */
export const getInterpolatedWaveform = (peaks: number[] | undefined, targetBars: number): number[] => {
  const source = peaks && peaks.length > 0 ? peaks : Array(36).fill(0);
  const count = Math.max(16, targetBars);
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    const progress = i / (count - 1 || 1);
    const sourceIdx = progress * (source.length - 1);
    const i0 = Math.floor(sourceIdx);
    const i1 = Math.min(source.length - 1, Math.ceil(sourceIdx));
    const frac = sourceIdx - i0;
    const v = (source[i0] ?? 0) * (1 - frac) + (source[i1] ?? 0) * frac;
    result.push(Number(v.toFixed(3)));
  }
  return result;
};

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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const [snapToBeat, setSnapToBeat] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = baseline, up to 2.5x
  const [showFaders, setShowFaders] = useState<boolean>(false); // Collapsed by default for clean view
  const trackHeaderWidth = showFaders ? EXPANDED_TRACK_HEADER_WIDTH : BASE_TRACK_HEADER_WIDTH;

  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isDraggingClip, setIsDraggingClip] = useState<boolean>(false);
  const [dragTrackId, setDragTrackId] = useState<VocalTrackId | null>(null);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragInitialOffset, setDragInitialOffset] = useState<number>(0);

  const duration = getProjectDuration(beat?.duration || 60, tracks);
  const bpm = Math.max(30, beat?.bpm || 140);
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedTrackName = selectedTrack ? selectedTrack.name : 'Pista';

  // Base pixels per second (36px provides ample breathing room for bar numbers & beats 1, 2, 3, 4)
  const basePixelsPerSec = 36 * zoomLevel;
  const timelineWidth = Math.max(500, duration * basePixelsPerSec);

  // Time format helper
  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${mins}:${s.toString().padStart(2, '0')}.${ms}`;
  };

  const formatBarTime = (sec: number) => {
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
    // Only allow setting playhead position when playback is stopped
    if (isRecording || isDraggingClip || isScrubbingPlayhead) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-clip-item]') || target.closest('button') || target.closest('input')) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left - TIMELINE_GUTTER;
    const newTime = Math.max(0, Math.min(duration, clickX / basePixelsPerSec));
    onSeek(Math.round(newTime * 1000) / 1000);
  };

  // Dragging logic for moving takes / clips
  const handleClipMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    track: VocalTrack,
    clip: VocalClip
  ) => {
    if (isScrubbingPlayhead || isRecording) return;
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;

    e.stopPropagation();
    setSelectedClipId(clip.id);
    onSelectTrack(track.id);

    // Si la toma tiene seguro (Hold/Lock), no permitir desplazamiento involuntario
    if (clip.isLocked) {
      return;
    }

    setIsDraggingClip(true);
    setDragTrackId(track.id);
    setDragClipId(clip.id);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    setDragStartX(clientX);
    setDragInitialOffset(clip.startBeatOffset);

    // Save snapshot of state before user moves the sample
    if (onStartDragMove) {
      onStartDragMove();
    }
  };

  useEffect(() => {
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (!isDraggingClip || !dragTrackId) return;
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const deltaPx = clientX - dragStartX;
      if ('touches' in e && e.cancelable) e.preventDefault();
      const deltaSec = deltaPx / basePixelsPerSec;
      const rawOffset = Math.max(0, dragInitialOffset + deltaSec);
      const newOffset = snapToBeat ? Math.round(rawOffset / secPerBeat) * secPerBeat : rawOffset;
      // Move smoothly without pushing to undo stack on intermediate drag frames
      onMoveTake(dragTrackId, Math.round(newOffset * 1000) / 1000, dragClipId || undefined, false);
    };

    const handleEnd = () => {
      if (isDraggingClip) {
        setIsDraggingClip(false);
        // Commit drag action to undo history so Undo and Redo work reliably
        if (onCommitDragMove && dragTrackId) {
          onCommitDragMove(dragTrackId, dragInitialOffset, dragClipId || undefined);
        }
        setDragTrackId(null);
        setDragClipId(null);
        if (isPlaying) {
          onSeek(currentTime);
        }
      }
    };

    if (isDraggingClip) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleEnd);
      window.addEventListener('touchmove', handleMove, { passive: false });
      window.addEventListener('touchend', handleEnd);
      window.addEventListener('touchcancel', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
      window.removeEventListener('touchcancel', handleEnd);
    };
  }, [isDraggingClip, dragTrackId, dragClipId, dragStartX, dragInitialOffset, basePixelsPerSec, duration, onMoveTake, isPlaying, currentTime, onSeek, onCommitDragMove, snapToBeat, secPerBeat]);

  const selectedClipTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedTrackClips = selectedClipTrack ? getTrackClips(selectedClipTrack) : [];
  const activeSelectedClip = selectedTrackClips.find((c) => c.id === selectedClipId) || selectedTrackClips[selectedTrackClips.length - 1];
  const canCutSelectedClip = Boolean(activeSelectedClip && !isRecording &&
    currentTime > activeSelectedClip.startBeatOffset && currentTime < activeSelectedClip.startBeatOffset + activeSelectedClip.duration);

  // Nudge adjustment
  const handleNudge = (deltaSec: number) => {
    if (!selectedClipTrack || !activeSelectedClip || activeSelectedClip.isLocked || isRecording) return;
    const newOffset = Math.max(0, activeSelectedClip.startBeatOffset + deltaSec);
    onMoveTake(selectedClipTrack.id, Math.round(newOffset * 1000) / 1000, activeSelectedClip.id, true);
  };

  const handleSnapToPlayhead = () => {
    if (!selectedClipTrack || !activeSelectedClip || activeSelectedClip.isLocked || isRecording) return;
    onMoveTake(selectedClipTrack.id, Math.max(0, currentTime), activeSelectedClip.id, true);
  };

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
          <img
            src="/images/rgodbeat-logo.png"
            alt="RGodbeat"
            className="h-6 sm:h-7 w-auto object-contain filter brightness-125 drop-shadow-[0_0_8px_rgba(251,191,36,0.35)] shrink-0"
          />
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />
          <div>
            <h3 className="text-xs sm:text-sm font-bold font-display uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
              <span>EDICIÓN MULTIPISTA</span>
            </h3>
            <p className="text-[10px] sm:text-[11px] font-mono text-zinc-400">
              Organiza, recorta y sincroniza tus tomas vocales en tiempo real.
            </p>
          </div>
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
        className="w-full shrink-0 h-[min(52dvh,480px)] min-h-[280px] bg-[#0d0d12] rounded-2xl border border-zinc-800/90 shadow-2xl overflow-y-auto overflow-x-auto relative select-none scroll-smooth"
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
                  className={`absolute top-2 bottom-2 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 flex items-center px-2 overflow-hidden pointer-events-none z-10 transition-opacity ${
                    isBeatMuted ? 'opacity-30 grayscale' : ''
                  }`}
                  style={{ left: `${TIMELINE_GUTTER}px`, width: `${beat.duration * basePixelsPerSec}px` }}
                >
                  <div className="w-full h-8 flex items-center gap-0.5 opacity-75">
                    {(beat.waveformSample || []).map((val, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-amber-400 rounded-full"
                        style={{ height: `${Math.max(2, val * 32)}px` }}
                      />
                    ))}
                  </div>
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
                        <button
                          onClick={() => onToggleMute(track.id)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer ${
                            track.isMuted
                              ? 'bg-red-500 text-white shadow-sm'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/60'
                          }`}
                          title={track.isMuted ? 'Desmutear' : 'Silenciar'}
                        >
                          {track.isMuted ? <VolumeX className="w-2.5 h-2.5" /> : <Volume2 className="w-2.5 h-2.5" />}
                          <span>{track.isMuted ? 'MUT' : 'MUTE'}</span>
                        </button>
                        <button type="button" onClick={() => onToggleSolo(track.id)} aria-pressed={track.isSolo}
                          title={`Escuchar ${track.name} en solo`}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${track.isSolo ? 'bg-amber-400 text-black border-amber-300' : 'bg-zinc-800 text-zinc-400 border-zinc-700'}`}>SOLO</button>
                        {isArmed && (
                          <span className="text-[7.5px] font-mono font-bold text-red-300 px-1 py-0.2 rounded bg-red-500/20 border border-red-500/30 truncate">
                            REC
                          </span>
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
                    const clipStartPx = clip.startBeatOffset * basePixelsPerSec;
                    const clipWidthPx = Math.max(30, (clip.duration || 1) * basePixelsPerSec);
                    const waveformBarCount = Math.max(16, Math.min(300, Math.floor(clipWidthPx / 4)));
                    const interpolatedPeaks = getInterpolatedWaveform(
                      clip.waveformSample || track.waveformSample,
                      waveformBarCount
                    );

                    return (
                      <div
                        key={clip.id}
                        data-clip-item="true"
                        onMouseDown={(e) => {
                          if (isScrubbingPlayhead) return;
                          handleClipMouseDown(e, track, clip);
                        }}
                        onTouchStart={(e) => {
                          if (isScrubbingPlayhead) return;
                          handleClipMouseDown(e, track, clip);
                        }}
                        className={`absolute top-2 bottom-2 rounded-xl border flex items-center px-2 transition-shadow select-none shadow-lg z-10 ${
                          clip.isLocked
                            ? 'cursor-pointer'
                            : 'cursor-grab active:cursor-grabbing'
                        } ${
                          isClipSelected
                            ? 'bg-gradient-to-r from-emerald-600/50 to-teal-500/40 border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                            : 'bg-gradient-to-r from-emerald-700/25 to-teal-800/20 border-emerald-500/50 hover:border-emerald-400'
                        } ${isTargetOfDrag ? 'shadow-[0_0_20px_rgba(16,185,129,0.6)] scale-[1.01]' : ''}`}
                        style={{
                          left: `${TIMELINE_GUTTER + clipStartPx}px`,
                          width: `${clipWidthPx}px`,
                        }}
                      >
                        {/* Left Drag or Lock Indicator */}
                        <div
                          className="mr-1.5 flex flex-col gap-0.5 shrink-0"
                          title={clip.isLocked ? 'Toma con Seguro (Hold) activado' : 'Arrastrar para desplazar en el tiempo'}
                        >
                          {clip.isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                          ) : (
                            <MoveHorizontal className="w-3.5 h-3.5 text-emerald-300 opacity-60" />
                          )}
                        </div>

                        {/* Continuous Waveform: Clean 2px flatline during silence, dynamic peaks when singing */}
                        <div className="flex-1 h-8 flex items-center gap-[2px] overflow-hidden w-full px-1">
                          {interpolatedPeaks.map((val, idx) => {
                            const isSilent = val <= 0.005;
                            return (
                              <div
                                key={idx}
                                className={`flex-1 min-w-[2px] max-w-[4px] rounded-full shrink-0 transition-all ${
                                  isSilent
                                    ? 'bg-zinc-700/50'
                                    : clip.isLocked
                                    ? 'bg-amber-400'
                                    : 'bg-emerald-400'
                                }`}
                                style={{
                                  height: isSilent ? '2px' : `${Math.max(4, Math.min(100, val * 100))}%`,
                                }}
                              />
                            );
                          })}
                        </div>

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
                          </span>
                          <span className="text-[8px] font-mono text-zinc-300 truncate hidden xs:inline">
                            {formatTime(clip.startBeatOffset)}
                          </span>
                        </div>

                        {/* Quick Action Buttons: Lock/Hold, Split & Delete without overlapping */}
                        <div className="absolute right-1 top-1 flex items-center gap-0.5 z-20 shrink-0 flex-nowrap">
                          {/* Only show Lock button if clip is wide enough */}
                          {clipWidthPx >= 65 && (
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

      {/* Clip Editing & Fine Nudge Control Panel (Only visible when a take is selected) */}
      {selectedClipTrack && activeSelectedClip && (
        <div className="mt-3 p-3 bg-zinc-900/90 rounded-2xl border border-zinc-800 shadow-xl backdrop-blur-md">
          <p className="mb-3 text-xs leading-relaxed text-zinc-400">
            Selecciona una toma y coloca el cabezal dentro para cortar o recortar. Desbloquea la toma para moverla. Puedes deshacer los cambios.
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 pb-2.5 border-b border-zinc-800">
            {/* Selected Take Info */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                EDICIÓN DE TOMA:
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                {selectedClipTrack.name.toUpperCase()}
              </span>

              {activeSelectedClip ? (
                <div className="flex flex-wrap items-center gap-2 ml-1 min-w-0">
                  <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-zinc-800 text-amber-300 border border-zinc-700">
                    {activeSelectedClip.name || 'Toma'}
                  </span>
                  <span className="text-xs font-mono text-zinc-300 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>
                      Inicio: <strong>{formatTime(activeSelectedClip.startBeatOffset)}</strong> ({formatBarTime(activeSelectedClip.startBeatOffset)}) · Duración: <strong>{activeSelectedClip.duration.toFixed(1)}s</strong>
                    </span>
                  </span>
                </div>
              ) : (
                <span className="text-xs font-mono text-zinc-500">
                  (Pista sin tomas grabadas)
                </span>
              )}
            </div>

            {/* Quick Actions: Duplicate & Delete */}
            {activeSelectedClip && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Duplicate to another track dropdown */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-zinc-400">Duplicar a:</span>
                  <select
                    aria-label="Duplicar toma a otra pista"
                    disabled={isRecording}
                    onChange={(e) => {
                      if (e.target.value) {
                        onDuplicateTake(selectedClipTrack.id, e.target.value as VocalTrackId, activeSelectedClip.id);
                        e.target.value = '';
                      }
                    }}
                    defaultValue=""
                    className="bg-zinc-800 text-zinc-200 text-xs font-mono rounded px-2 py-1 border border-zinc-700 focus:outline-none focus:border-amber-400"
                  >
                    <option value="" disabled>
                      Elegir pista...
                    </option>
                    {tracks
                      .filter((t) => t.id !== selectedClipTrack.id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>

                {onTrimTake && (
                  <>
                    <button type="button" disabled={!canCutSelectedClip} onClick={() => onTrimTake(selectedClipTrack.id, activeSelectedClip.id, 'start')}
                      className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-200 disabled:opacity-40"
                      title="Eliminar el audio anterior al cabezal en esta toma">Recortar inicio</button>
                    <button type="button" disabled={!canCutSelectedClip} onClick={() => onTrimTake(selectedClipTrack.id, activeSelectedClip.id, 'end')}
                      className="px-2 py-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-xs font-mono text-zinc-200 disabled:opacity-40"
                      title="Eliminar el audio posterior al cabezal en esta toma">Recortar final</button>
                  </>
                )}
                {/* Split / Cut Button */}
                {onSplitTake && (
                  <button
                    onClick={() => onSplitTake(selectedClipTrack.id, activeSelectedClip.id, currentTime)}
                    disabled={!canCutSelectedClip}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-bold transition-all active:scale-95 cursor-pointer shadow-sm shadow-amber-500/10 disabled:opacity-40"
                    title={`Cortar / Dividir esta toma exactamente en el cabezal (${formatTime(currentTime)})`}
                  >
                    <Scissors className="w-3.5 h-3.5 text-amber-400" />
                    <span>Cortar en Cabezal ({formatTime(currentTime)})</span>
                  </button>
                )}

                <button
                  onClick={() => onDeleteTake(selectedClipTrack.id, activeSelectedClip.id)}
                  disabled={isRecording}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/50 hover:bg-red-900/70 text-red-300 hover:text-red-100 border border-red-500/50 hover:border-red-400 text-xs font-mono font-bold transition-all active:scale-95 shadow-sm shadow-red-950/40 cursor-pointer"
                  title={`Eliminar únicamente el pedazo seleccionado (${activeSelectedClip.name || 'Pedazo'}) sin alterar el resto de la pista`}
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-400" />
                  <span>Borrar Pedazo Seleccionado</span>
                </button>
              </div>
            )}
          </div>

          {/* Micro-timing / Nudge Controls */}
          {activeSelectedClip && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Hold/Seguro toggle in fine-nudge panel */}
                <button
                  onClick={() => {
                    if (onToggleLockTake && selectedClipTrack) {
                      onToggleLockTake(selectedClipTrack.id, activeSelectedClip.id);
                    }
                  }}
                  disabled={isRecording}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono font-bold border transition-all active:scale-95 ${
                    activeSelectedClip.isLocked
                      ? 'bg-amber-400 text-black border-amber-300 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Seguro ACTIVO: Clic para desbloquear' : 'Clic para activar seguro (Hold)'}
                >
                  {activeSelectedClip.isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>{activeSelectedClip.isLocked ? 'DESBLOQUEAR PARA MOVER' : 'BLOQUEAR POSICIÓN'}</span>
                </button>

                <div className="h-4 w-px bg-zinc-700 mx-1" />

                <label className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-400">
                  Inicio (s)
                  <input key={`${activeSelectedClip.id}-${activeSelectedClip.startBeatOffset}`} type="number" min={0} step={0.001}
                    defaultValue={activeSelectedClip.startBeatOffset.toFixed(3)}
                    disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                    onBlur={event => {
                      const value = event.currentTarget.valueAsNumber;
                      if (Number.isFinite(value) && value >= 0 && value !== activeSelectedClip.startBeatOffset)
                        onMoveTake(selectedClipTrack.id, value, activeSelectedClip.id, true);
                    }}
                    onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                    className="w-24 px-2 py-1 rounded bg-black/50 border border-zinc-700 text-zinc-100 disabled:opacity-40" />
                </label>

                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(-1 * secPerBar)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Retroceder 1 Bar entero'}
                >
                  -1 Bar
                </button>
                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(-0.1)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Retroceder 100ms'}
                >
                  -100ms
                </button>
                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(-0.02)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Retroceder 20ms (ajuste fino)'}
                >
                  -20ms
                </button>

                <div className="h-4 w-px bg-zinc-700 mx-1" />

                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(0.02)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Avanzar 20ms'}
                >
                  +20ms
                </button>
                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(0.1)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Avanzar 100ms'}
                >
                  +100ms
                </button>
                <button
                  disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                  onClick={() => handleNudge(1 * secPerBar)}
                  className={`px-2 py-1 rounded text-xs font-mono font-medium border active:scale-95 transition-all ${
                    activeSelectedClip.isLocked
                      ? 'bg-zinc-850 text-zinc-600 border-zinc-800 cursor-not-allowed'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  }`}
                  title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : 'Avanzar 1 Bar entero'}
                >
                  +1 Bar
                </button>
              </div>

              {/* Snap to Playhead button */}
              <button
                disabled={isRecording || Boolean(activeSelectedClip.isLocked)}
                onClick={handleSnapToPlayhead}
                className={`px-3 py-1 rounded-lg text-xs font-mono font-semibold transition-all active:scale-95 ${
                  activeSelectedClip.isLocked
                    ? 'bg-zinc-850 text-zinc-600 border border-zinc-800 cursor-not-allowed'
                    : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40'
                }`}
                title={activeSelectedClip.isLocked ? 'Toma con seguro: desbloquea para mover' : `Alinear al cabezal actual (${formatTime(currentTime)})`}
              >
                Mover al Cabezal ({formatTime(currentTime)})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
