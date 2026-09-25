import React, { useRef, useState, useEffect } from 'react';
import {
  Sliders,
  MoveHorizontal,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Trash2,
  Copy,
  Clock,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Maximize2,
  RotateCcw,
  Plus,
  Undo2,
  Redo2,
  HardDrive,
  ShieldCheck,
  Repeat,
  Square,
  Mic,
} from 'lucide-react';
import { BeatData, LoopSettings, VocalClip, VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';
import { parseKeyAndGetRelative } from '@/lib/studio/audio/beatAnalyzer';

const TRACK_HEADER_WIDTH = 176; // px (fixed w-44 for guaranteed sub-pixel playhead & click alignment)

export const getTrackClips = (track: VocalTrack): VocalClip[] => {
  if (track.clips && track.clips.length > 0) return track.clips;
  if (track.buffer) {
    return [{
      id: `clip-${track.id}-init`,
      buffer: track.buffer,
      tunedBuffer: track.tunedBuffer,
      startBeatOffset: track.startBeatOffset,
      duration: track.duration,
      waveformSample: track.waveformSample,
      name: `Toma 1`,
    }];
  }
  return [];
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
  onChangePan?: (trackId: VocalTrackId, pan: number) => void;
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
  onChangePan,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);

  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = baseline, up to 2.5x
  const [selectedClipTrackId, setSelectedClipTrackId] = useState<VocalTrackId | null>('lead1');
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [isDraggingClip, setIsDraggingClip] = useState<boolean>(false);
  const [dragTrackId, setDragTrackId] = useState<VocalTrackId | null>(null);
  const [dragClipId, setDragClipId] = useState<string | null>(null);
  const [dragStartX, setDragStartX] = useState<number>(0);
  const [dragInitialOffset, setDragInitialOffset] = useState<number>(0);

  const duration = beat?.duration || 60;
  const bpm = beat?.bpm || 140;
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;

  const selectedTrack = tracks.find((t) => t.id === selectedTrackId);
  const selectedTrackName = selectedTrack ? selectedTrack.name : 'Pista';

  // Base pixels per second
  const basePixelsPerSec = 16 * zoomLevel;
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

  // Precise seeking directly from clicking on an audio lane (0 offset guaranteed)
  const handleLaneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const newTime = Math.max(0, Math.min(duration, clickX / basePixelsPerSec));
    onSeek(newTime);
  };

  // Scrubbing on the ruler
  const handleRulerMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const lane = e.currentTarget;
    const updateTimeFromMouse = (clientX: number) => {
      const rect = lane.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const newTime = Math.max(0, Math.min(duration, clickX / basePixelsPerSec));
      onSeek(newTime);
    };
    updateTimeFromMouse(e.clientX);

    const onMouseMove = (moveEvent: MouseEvent) => {
      updateTimeFromMouse(moveEvent.clientX);
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // Dragging logic for moving takes / clips
  const handleClipMouseDown = (
    e: React.MouseEvent | React.TouchEvent,
    track: VocalTrack,
    clip: VocalClip
  ) => {
    e.stopPropagation();
    setSelectedClipTrackId(track.id);
    setSelectedClipId(clip.id);
    onSelectTrack(track.id);
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
      const deltaSec = deltaPx / basePixelsPerSec;
      const newOffset = Math.max(0, Math.min(duration - 0.2, dragInitialOffset + deltaSec));
      // Move smoothly without pushing to undo stack on intermediate drag frames
      onMoveTake(dragTrackId, Math.round(newOffset * 100) / 100, dragClipId || undefined, false);
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
      window.addEventListener('touchmove', handleMove);
      window.addEventListener('touchend', handleEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleEnd);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleEnd);
    };
  }, [isDraggingClip, dragTrackId, dragClipId, dragStartX, dragInitialOffset, basePixelsPerSec, duration, onMoveTake, isPlaying, currentTime, onSeek, onCommitDragMove]);

  const selectedClipTrack = tracks.find((t) => t.id === selectedClipTrackId);
  const selectedTrackClips = selectedClipTrack ? getTrackClips(selectedClipTrack) : [];
  const activeSelectedClip = selectedTrackClips.find((c) => c.id === selectedClipId) || selectedTrackClips[selectedTrackClips.length - 1];

  // Nudge adjustment
  const handleNudge = (deltaSec: number) => {
    if (!selectedClipTrack || !activeSelectedClip) return;
    const newOffset = Math.max(0, Math.min(duration - 0.2, activeSelectedClip.startBeatOffset + deltaSec));
    onMoveTake(selectedClipTrack.id, Math.round(newOffset * 1000) / 1000, activeSelectedClip.id, true);
    if (isPlaying) {
      onSeek(currentTime);
    }
  };

  const handleSnapToPlayhead = () => {
    if (!selectedClipTrack || !activeSelectedClip) return;
    onMoveTake(selectedClipTrack.id, Math.max(0, currentTime), activeSelectedClip.id, true);
    if (isPlaying) {
      onSeek(currentTime);
    }
  };

  // Generate ruler tick marks
  const totalBars = Math.ceil(duration / secPerBar);
  const rulerTicks: { bar: number; sec: number }[] = [];
  for (let bar = 0; bar < totalBars; bar++) {
    const sec = bar * secPerBar;
    rulerTicks.push({ bar: bar + 1, sec });
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-2 sm:px-4 py-2 text-white">
      {/* Workspace Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-zinc-900/90 rounded-2xl border border-zinc-800 shadow-xl mb-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <div>
            <h3 className="text-xs sm:text-sm font-bold font-display uppercase tracking-wider text-zinc-100 flex items-center gap-1.5">
              <span>ESPACIO DE EDICIÓN MULTIPISTA</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {tracks.length} PISTAS
              </span>
            </h3>
            <p className="text-[11px] font-mono text-zinc-400">
              Haz clic o arrastra en la regla para mover el cursor. Arrastra las tomas o usa los botones de ajuste fino.
            </p>
          </div>
        </div>

        {/* Action Controls & Zoom */}
        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          {/* Physical Undo / Redo buttons */}
          <div className="flex items-center bg-zinc-800/90 rounded-xl p-1 border border-zinc-700/80 shadow-inner">
            <button
              onClick={onUndo}
              disabled={!canUndo}
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
              disabled={!canRedo}
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
              <span>{isRecording ? 'DETENER' : `REC (${selectedTrackName.toUpperCase()})`}</span>
            </button>
          )}

          {isRecording && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-950/90 border border-red-500/70 text-red-200 font-mono text-xs font-bold animate-pulse shadow-sm shadow-red-500/20">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              <span>REC {formatTime(currentTime)}</span>
            </span>
          )}

          <div className="h-5 w-px bg-zinc-700 mx-1 hidden sm:block" />

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
            onClick={() => setZoomLevel((prev) => Math.min(2.5, prev + 0.25))}
            className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-zinc-700 transition-all"
            title="Aumentar zoom"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Multitrack Canvas Window */}
      <div
        ref={containerRef}
        className="w-full bg-[#0d0d12] rounded-2xl border border-zinc-800/90 shadow-2xl overflow-x-auto relative select-none"
        style={{ minHeight: '340px' }}
      >
        <div
          ref={timelineContentRef}
          className="relative min-w-full"
          style={{ width: `${timelineWidth + TRACK_HEADER_WIDTH + 40}px` }}
        >
          {/* Time Ruler (Seconds & Musical Bars) */}
          <div className="sticky top-0 z-30 h-8 bg-[#14141c] border-b border-zinc-800 flex items-center shadow-sm">
            {/* Left Header Column */}
            <div
              className="w-44 shrink-0 px-3 text-[10px] font-mono text-zinc-400 font-bold border-r border-zinc-800 uppercase tracking-wider flex items-center justify-between bg-[#14141c]"
              style={{ width: `${TRACK_HEADER_WIDTH}px` }}
            >
              <span>PISTAS</span>
              <span className="text-amber-400">{formatTime(currentTime)}</span>
            </div>

            {/* Ruler Time Lane (Click & Scrub) */}
            <div
              onMouseDown={handleRulerMouseDown}
              className="relative flex-1 h-full cursor-pointer overflow-hidden group"
              title="Haz clic o arrastra para mover el cursor de reproducción"
            >
              {rulerTicks.map((tick) => {
                const leftPos = tick.sec * basePixelsPerSec;
                return (
                  <div
                    key={tick.bar}
                    className="absolute top-0 bottom-0 border-l border-zinc-700/60 pl-1 flex flex-col justify-center pointer-events-none"
                    style={{ left: `${leftPos}px` }}
                  >
                    <span className="text-[9px] font-mono font-bold text-amber-300">
                      Bar {tick.bar}
                    </span>
                    <span className="text-[8px] font-mono text-zinc-500">
                      {Math.round(tick.sec)}s
                    </span>
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
                left: `${TRACK_HEADER_WIDTH + loopSettings.startSec * basePixelsPerSec}px`,
                width: `${Math.max(4, (loopSettings.endSec - loopSettings.startSec) * basePixelsPerSec)}px`,
              }}
            >
              <div className="absolute top-0.5 left-1 text-[8px] font-mono font-bold text-amber-300 bg-black/85 px-1.5 py-0.5 rounded shadow border border-amber-500/40 whitespace-nowrap">
                LOOP: Bar {loopSettings.startBar + 1} ➔ Bar {loopSettings.bars === 'all' ? Math.ceil(duration / secPerBar) : loopSettings.startBar + (loopSettings.bars as number)}
              </div>
            </div>
          )}

          {/* Vertical Playhead Cursor Line - Exactly aligned with the start of the audio lanes */}
          <div
            className="absolute top-0 bottom-0 z-40 w-0.5 bg-amber-400 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.95)]"
            style={{
              left: `${TRACK_HEADER_WIDTH + currentTime * basePixelsPerSec}px`,
            }}
          >
            <div className="w-3.5 h-3.5 bg-amber-400 -translate-x-[6px] -translate-y-1 rotate-45 shadow-md border border-black/40" />
          </div>

          {/* TRACK 0: The Master Beat */}
          <div className="flex items-stretch border-b border-zinc-800/80 bg-zinc-950/70 h-16 group hover:bg-zinc-900/40 transition-colors">
            {/* Track Info Header */}
            <div
              className="w-44 shrink-0 p-2 border-r border-zinc-800 flex flex-col justify-center bg-zinc-900/90 z-20"
              style={{ width: `${TRACK_HEADER_WIDTH}px` }}
            >
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
              {(() => {
                const keyInfo = parseKeyAndGetRelative(beat?.key, beat?.scale);
                return (
                  <div className="flex items-center justify-between mt-1">
                    <span
                      className="text-[10px] font-mono text-zinc-400 truncate"
                      title={beat ? `${keyInfo.tonalityName} · Relativa: ${keyInfo.relativeTonalityName}` : ''}
                    >
                      {beat ? `${beat.bpm} BPM · ${keyInfo.keySymbol} (Rel. ${keyInfo.relativeKey})` : 'Sin Beat'}
                    </span>
                    <span
                      className="text-[8px] font-mono text-amber-300 font-bold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 shrink-0 flex items-center gap-1"
                      title={`Espacio físico: Slot ${currentBeatSlotIndex} de 23 slots disponibles (${totalSavedBeatsCount}/23 beats guardados)`}
                    >
                      <ShieldCheck className="w-2.5 h-2.5 text-amber-400" />
                      <span>SLOT {currentBeatSlotIndex}/23</span>
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Beat Waveform Track Body */}
            <div
              onClick={handleLaneClick}
              className="relative flex-1 h-full cursor-pointer bg-zinc-900/20"
              title="Haz clic para ubicar el cursor de reproducción"
            >
              {beat && (
                <div
                  className="absolute top-1.5 bottom-1.5 left-0 rounded-lg bg-gradient-to-r from-amber-500/20 to-amber-600/10 border border-amber-500/40 flex items-center px-2 overflow-hidden pointer-events-none"
                  style={{ width: `${beat.duration * basePixelsPerSec}px` }}
                >
                  <div className="w-full h-8 flex items-center gap-0.5 opacity-70">
                    {(beat.waveformSample || Array(60).fill(0.5)).map((val, idx) => (
                      <div
                        key={idx}
                        className="flex-1 bg-amber-400 rounded-full"
                        style={{ height: `${Math.max(15, val * 100)}%` }}
                      />
                    ))}
                  </div>
                  <span className="absolute left-2.5 bottom-1 text-[9px] font-mono text-amber-300 font-semibold drop-shadow">
                    BEAT · {Math.round(beat.duration)}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* VOCAL TRACKS: Lead 1, Lead 2, Double, Harmonies, Adlibs, Backings */}
          {tracks.map((track) => {
            const clips = getTrackClips(track);
            const hasTakes = clips.length > 0;
            const isSelected = selectedClipTrackId === track.id;
            const isArmed = selectedTrackId === track.id;
            const isThisRecording = isRecording && activeRecordingTrackId === track.id;

            return (
              <div
                key={track.id}
                onClick={() => {
                  setSelectedClipTrackId(track.id);
                  if (clips.length > 0 && (!selectedClipId || !clips.some((c) => c.id === selectedClipId))) {
                    setSelectedClipId(clips[clips.length - 1].id);
                  }
                  onSelectTrack(track.id);
                }}
                className={`flex items-stretch border-b border-zinc-850 h-20 transition-all ${
                  isThisRecording
                    ? 'bg-red-950/30 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.25)] border-l-4 border-l-red-500'
                    : isArmed
                    ? 'bg-zinc-900/80 border-l-4 border-l-red-500 shadow-md ring-1 ring-red-500/20'
                    : isSelected
                    ? 'bg-zinc-900/60'
                    : 'bg-transparent hover:bg-zinc-900/20'
                }`}
              >
                {/* Track Left Header (Controls: FX, Mute, Solo, Volume, Pan) */}
                <div
                  className="w-44 shrink-0 p-2 border-r border-zinc-800 flex flex-col justify-between bg-[#111116] z-20"
                  style={{ width: `${TRACK_HEADER_WIDTH}px` }}
                >
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

                  {/* Row 2: Arm [R], Mute [M], Solo [S], Volume */}
                  <div className="flex items-center gap-1 mt-0.5" onClick={(e) => e.stopPropagation()}>
                    {/* Arm / Record button like FL Studio, Ableton, Logic Pro, Pro Tools */}
                    <button
                      onClick={() => {
                        onSelectTrack(track.id);
                        if (isThisRecording && onStopRecord) {
                          onStopRecord();
                        } else if (isArmed && onStartRecord) {
                          onStartRecord(track.id);
                        }
                      }}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold flex items-center gap-1 transition-all ${
                        isThisRecording
                          ? 'bg-red-600 text-white animate-pulse shadow-sm shadow-red-600/50 ring-1 ring-white/50'
                          : isArmed
                          ? 'bg-red-600 text-white shadow-sm shadow-red-600/40 ring-1 ring-red-400'
                          : 'bg-zinc-800 text-zinc-500 hover:text-red-400 hover:bg-zinc-700'
                      }`}
                      title={
                        isThisRecording
                          ? `Grabando en ${track.name} (clic para detener)`
                          : isArmed
                          ? `Pista armada para grabar (${track.name}). Clic para grabar.`
                          : `Armar / seleccionar ${track.name} para grabar`
                      }
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${isThisRecording || isArmed ? 'bg-white' : 'bg-zinc-500'}`} />
                      <span>R</span>
                    </button>

                    <button
                      onClick={() => onToggleMute(track.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        track.isMuted
                          ? 'bg-red-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Silenciar (Mute)"
                    >
                      M
                    </button>
                    <button
                      onClick={() => onToggleSolo(track.id)}
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                        track.isSolo
                          ? 'bg-amber-500 text-black font-extrabold'
                          : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                      title="Solo"
                    >
                      S
                    </button>
                    <span className="text-[9px] font-mono text-zinc-400 tabular-nums ml-auto">
                      {Math.round(track.volume * 100)}%
                    </span>
                  </div>

                  {/* Row 3: Stereo PAN control */}
                  <div
                    className="flex items-center justify-between text-[9px] font-mono mt-0.5 pt-1 border-t border-zinc-850/80"
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
                </div>

                {/* Track Audio Lane */}
                <div
                  onClick={handleLaneClick}
                  className="relative flex-1 h-full cursor-pointer"
                  title="Haz clic para ubicar el cursor de reproducción"
                >
                  {/* Subtle bar grid lines */}
                  {rulerTicks.map((tick) => (
                    <div
                      key={tick.bar}
                      className="absolute top-0 bottom-0 border-l border-zinc-850/40 pointer-events-none"
                      style={{ left: `${tick.sec * basePixelsPerSec}px` }}
                    />
                  ))}

                  {/* Recorded Audio Clips along this same line */}
                  {clips.map((clip, clipIndex) => {
                    const isClipSelected =
                      isSelected &&
                      (selectedClipId === clip.id ||
                        (!selectedClipId && clipIndex === clips.length - 1));
                    const isTargetOfDrag = isDraggingClip && dragClipId === clip.id;
                    const clipStartPx = clip.startBeatOffset * basePixelsPerSec;
                    const clipWidthPx = Math.max(30, (clip.duration || 1) * basePixelsPerSec);

                    return (
                      <div
                        key={clip.id}
                        onMouseDown={(e) => handleClipMouseDown(e, track, clip)}
                        onTouchStart={(e) => handleClipMouseDown(e, track, clip)}
                        className={`absolute top-2 bottom-2 rounded-xl border flex items-center px-2 cursor-grab active:cursor-grabbing transition-shadow select-none shadow-lg z-10 ${
                          isClipSelected
                            ? 'bg-gradient-to-r from-emerald-600/50 to-teal-500/40 border-emerald-400 ring-2 ring-emerald-400/50 shadow-[0_0_15px_rgba(16,185,129,0.35)]'
                            : 'bg-gradient-to-r from-emerald-700/25 to-teal-800/20 border-emerald-500/50 hover:border-emerald-400'
                        } ${isTargetOfDrag ? 'shadow-[0_0_20px_rgba(16,185,129,0.6)] scale-[1.01]' : ''}`}
                        style={{
                          left: `${clipStartPx}px`,
                          width: `${clipWidthPx}px`,
                        }}
                      >
                        {/* Left Drag Handle Indicator */}
                        <div className="mr-1.5 flex flex-col gap-0.5 text-zinc-400 opacity-60">
                          <MoveHorizontal className="w-3.5 h-3.5 text-emerald-300" />
                        </div>

                        {/* Mini Waveform Visualization */}
                        <div className="flex-1 h-8 flex items-center gap-0.5 overflow-hidden">
                          {(clip.waveformSample || track.waveformSample || Array(30).fill(0.5)).map(
                            (val, idx) => (
                              <div
                                key={idx}
                                className="w-1 bg-emerald-400 rounded-full shrink-0"
                                style={{ height: `${Math.max(20, val * 100)}%` }}
                              />
                            )
                          )}
                        </div>

                        {/* Clip Meta Tag */}
                        <div className="absolute left-2.5 bottom-1 flex items-center gap-1.5 pointer-events-none drop-shadow">
                          <span className="text-[9px] font-mono font-bold text-emerald-200 uppercase">
                            {clip.name || `Toma ${clipIndex + 1}`}
                          </span>
                          <span className="text-[8px] font-mono text-zinc-300">
                            {formatTime(clip.startBeatOffset)} ({clip.duration.toFixed(1)}s)
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {!hasTakes && (
                    <div className="absolute inset-0 flex items-center pl-4 pointer-events-none">
                      <span className="text-[10px] font-mono text-zinc-700 italic">
                        (Sin grabación en {track.name} - Graba en cualquier compás)
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clip Editing & Fine Nudge Control Panel */}
      {selectedClipTrack && (
        <div className="mt-3 p-3 bg-zinc-900/90 rounded-2xl border border-zinc-800 shadow-xl backdrop-blur-md">
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
                <div className="flex items-center gap-2 ml-1">
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
              <div className="flex items-center gap-2">
                {/* Duplicate to another track dropdown */}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-mono text-zinc-400">Duplicar a:</span>
                  <select
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

                <button
                  onClick={() => onDeleteTake(selectedClipTrack.id, activeSelectedClip.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-red-950/40 text-zinc-400 hover:text-red-400 border border-zinc-700 hover:border-red-500/30 text-xs font-mono transition-colors"
                  title="Eliminar esta toma"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Borrar Toma</span>
                </button>
              </div>
            )}
          </div>

          {/* Micro-timing / Nudge Controls */}
          {activeSelectedClip && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] font-mono text-zinc-400 font-semibold mr-1">
                  AJUSTAR POSICIÓN:
                </span>

                <button
                  onClick={() => handleNudge(-1 * secPerBar)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Retroceder 1 compás entero"
                >
                  -1 Compás
                </button>
                <button
                  onClick={() => handleNudge(-0.1)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Retroceder 100ms"
                >
                  -100ms
                </button>
                <button
                  onClick={() => handleNudge(-0.02)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Retroceder 20ms (ajuste fino)"
                >
                  -20ms
                </button>

                <div className="h-4 w-px bg-zinc-700 mx-1" />

                <button
                  onClick={() => handleNudge(0.02)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Avanzar 20ms"
                >
                  +20ms
                </button>
                <button
                  onClick={() => handleNudge(0.1)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Avanzar 100ms"
                >
                  +100ms
                </button>
                <button
                  onClick={() => handleNudge(1 * secPerBar)}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono font-medium border border-zinc-700 active:scale-95 transition-all"
                  title="Avanzar 1 compás entero"
                >
                  +1 Compás
                </button>
              </div>

              {/* Snap to Playhead button */}
              <button
                onClick={handleSnapToPlayhead}
                className="px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-mono font-semibold transition-all active:scale-95"
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
