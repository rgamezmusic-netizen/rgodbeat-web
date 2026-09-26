import React, { useRef, useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Mic,
  RotateCcw,
  RotateCw,
  Repeat,
  Sliders,
  Volume2,
  Sparkles,
  Music2,
  Check,
  Timer,
  Headphones,
  AlertTriangle,
} from 'lucide-react';
import { BeatData, LoopSettings, MusicalKey, ScaleMode, VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';
import { parseKeyAndGetRelative, getRelativeKey, NOTE_NAMES, SPANISH_NAMES } from '@/lib/studio/audio/beatAnalyzer';

interface ArtworkPlayerProps {
  beat: BeatData | null;
  isPlaying: boolean;
  currentTime: number;
  loopSettings: LoopSettings;
  onPlayPause: () => void;
  onSeek: (seconds: number) => void;
  onToggleLoop: () => void;
  onOpenLoopSettings: () => void;
  onOpenBeatFX: () => void;
  onNextBeat?: () => void;
  onPrevBeat?: () => void;
  beatVolume: number;
  onChangeBeatVolume: (vol: number) => void;
  onDetectKeyAndBpm?: () => void;
  isAnalyzingBeat?: boolean;
  onChangeBpm?: (bpm: number) => void;
  onChangeTonality?: (rootKey: MusicalKey, scaleMode: ScaleMode) => void;
  // Unified recording controls
  isRecording?: boolean;
  selectedTrack?: VocalTrack;
  onStartRecord?: (trackId: VocalTrackId) => void;
  onStopRecord?: () => void;
  countInEnabled?: boolean;
  onToggleCountIn?: () => void;
  bluetoothSyncEnabled?: boolean;
  bluetoothOffsetMs?: number;
  onToggleBluetoothSync?: () => void;
  getMicLevel?: () => number;
  getMicStatus?: () => { level: number; isSaturated: boolean; gainReductionDb: number };
}

export const ArtworkPlayer: React.FC<ArtworkPlayerProps> = ({
  beat,
  isPlaying,
  currentTime,
  loopSettings,
  onPlayPause,
  onSeek,
  onToggleLoop,
  onOpenLoopSettings,
  onOpenBeatFX,
  beatVolume,
  onChangeBeatVolume,
  onDetectKeyAndBpm,
  isAnalyzingBeat = false,
  onChangeBpm,
  onChangeTonality,
  isRecording = false,
  selectedTrack,
  onStartRecord,
  onStopRecord,
  countInEnabled = false,
  onToggleCountIn,
  bluetoothSyncEnabled = false,
  bluetoothOffsetMs = 185,
  onToggleBluetoothSync,
  getMicLevel,
  getMicStatus,
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [tempBpm, setTempBpm] = useState('');

  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [isSaturated, setIsSaturated] = useState(false);
  const [gainReductionDb, setGainReductionDb] = useState(0);

  const getMicStatusRef = useRef(getMicStatus);
  getMicStatusRef.current = getMicStatus;
  const getMicLevelRef = useRef(getMicLevel);
  getMicLevelRef.current = getMicLevel;

  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    let animId: number | null = null;

    if (isRecording) {
      setElapsedSec(0);
      const start = Date.now();
      interval = setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - start) / 1000));
      }, 200);

      const trackStatus = () => {
        if (getMicStatusRef.current) {
          const status = getMicStatusRef.current();
          setMicLevel(status.level);
          setIsSaturated(status.isSaturated);
          setGainReductionDb(status.gainReductionDb);
        } else if (getMicLevelRef.current) {
          const lvl = getMicLevelRef.current();
          setMicLevel(lvl);
          setIsSaturated(lvl >= 0.88);
        }
        animId = requestAnimationFrame(trackStatus);
      };
      animId = requestAnimationFrame(trackStatus);
    } else {
      setElapsedSec(0);
      setMicLevel(0);
      setIsSaturated(false);
      setGainReductionDb(0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [isRecording]);

  const formatElapsed = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const duration = beat ? beat.duration : 0;
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const formatTime = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(ratio * duration);
  };

  const keyInfo = parseKeyAndGetRelative(beat?.key, beat?.scale);
  const currentBpm = beat?.bpm || 140;
  const isDoubleTime = currentBpm >= 115;
  const halfTimeBpm = isDoubleTime ? Math.round(currentBpm / 2) : currentBpm;
  const doubleTimeBpm = isDoubleTime ? currentBpm : Math.round(currentBpm * 2);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center px-3 pt-1 pb-3">
      {/* 1. FLOW IPOD: Focal Disc & Album Art (Plato Negro Carbón) */}
      <div className="relative group w-48 h-48 sm:w-56 sm:h-56 my-2 flex items-center justify-center">
        {/* Deep Platter Ambient Shadow */}
        <div className="absolute inset-0 rounded-full blur-2xl opacity-40 bg-black pointer-events-none" />

        {/* Outer Vinyl Disc (Negro Carbón) */}
        <div
          className={`relative w-full h-full rounded-full p-2.5 shadow-2xl border-2 border-zinc-800/90 bg-[#121216] transition-transform ${
            isPlaying ? 'animate-vinyl-spin' : 'animate-vinyl-spin-paused'
          }`}
          style={{
            boxShadow: '0 20px 45px -10px rgba(0,0,0,0.7), inset 0 0 16px rgba(0,0,0,0.95)',
            backgroundImage: `
              radial-gradient(circle at center, #1c1c24 0%, #121217 35%, #0d0d12 40%, #1a1a22 42%, #0a0a0e 55%, #181820 58%, #0d0d12 70%, #181820 73%, #09090d 100%),
              repeating-radial-gradient(circle at center, rgba(255,255,255,0.02) 0, rgba(255,255,255,0.02) 1px, transparent 2px, transparent 4px)
            `,
          }}
        >
          {/* Inner Carbon Black Label */}
          <div
            className="w-full h-full rounded-full flex flex-col items-center justify-center relative overflow-hidden shadow-inner border border-zinc-700/50"
            style={{
              background: 'radial-gradient(circle at center, #22222a 0%, #141419 65%, #0c0c10 100%)',
            }}
          >
            {/* Center Spindle Hole */}
            <div className="w-7 h-7 rounded-full bg-[#0a0a0e] border-2 border-zinc-600 shadow-inner flex items-center justify-center z-10">
              <div className="w-2.5 h-2.5 rounded-full bg-zinc-950" />
            </div>

            {/* Label Typography */}
            <div className="absolute top-4 text-center px-4 pointer-events-none">
              <p className="text-[9px] tracking-widest uppercase font-mono text-zinc-400 font-bold opacity-90">
                RGODBEAT
              </p>
            </div>
            <div className="absolute bottom-4 text-center px-4 pointer-events-none">
              <p className="text-[9px] tracking-wider uppercase font-mono text-amber-400 font-extrabold drop-shadow">
                {currentBpm} BPM
              </p>
            </div>
          </div>
        </div>

        {/* Quick Beat FX Floating Pill */}
        <button
          type="button"
          onClick={onOpenBeatFX}
          title="Ajustes de filtro y volumen del Beat"
          className="absolute -bottom-1 -right-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-950 hover:bg-zinc-900 text-zinc-200 hover:text-white border border-zinc-750 shadow-xl text-[10px] font-mono backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          <Sliders className="w-3 h-3 text-amber-400" />
          <span>Beat FX</span>
        </button>
      </div>

      {/* 2. Beat Title */}
      <div className="w-full text-center mt-2 mb-1 px-4">
        <h2 className="text-lg sm:text-xl font-black tracking-tight text-zinc-950 truncate drop-shadow-[0_1px_1px_rgba(255,255,255,0.4)]">
          {beat ? beat.title : 'Selecciona un Beat'}
        </h2>
      </div>

      {/* 3. THE "TEMPO & ESCALAS" HUD CARD (Simple, crystal-clear, functional) */}
      <div className="w-full bg-[#0e0e14]/95 border border-zinc-800 rounded-2xl p-3 my-2 shadow-2xl backdrop-blur-md">
        <div className="grid grid-cols-2 gap-2 divide-x divide-zinc-800/80">
          {/* LEFT: TEMPO (BPM) WITH SMOOTH DRAGGABLE SLIDER */}
          <div className="flex flex-col items-center justify-center px-1 space-y-1.5">
            <span className="text-[10px] font-mono text-zinc-400 font-semibold tracking-wider uppercase">
              TEMPO // VELOCIDAD
            </span>

            {/* BPM Value & Precision Steppers */}
            <div className="flex items-center gap-1.5">
              {onChangeBpm && beat && (
                <button
                  type="button"
                  onClick={() => onChangeBpm(Math.max(40, currentBpm - 1))}
                  className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-400 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer select-none active:scale-95 shadow-sm"
                  title="Reducir 1 BPM"
                >
                  -
                </button>
              )}

              {isEditingBpm ? (
                <input
                  type="number"
                  min="40"
                  max="300"
                  value={tempBpm}
                  autoFocus
                  onChange={(e) => setTempBpm(e.target.value)}
                  onBlur={() => {
                    const val = parseInt(tempBpm);
                    if (!isNaN(val) && val >= 40 && val <= 300 && onChangeBpm) {
                      onChangeBpm(val);
                    }
                    setIsEditingBpm(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = parseInt(tempBpm);
                      if (!isNaN(val) && val >= 40 && val <= 300 && onChangeBpm) {
                        onChangeBpm(val);
                      }
                      setIsEditingBpm(false);
                    } else if (e.key === 'Escape') {
                      setIsEditingBpm(false);
                    }
                  }}
                  className="w-16 bg-zinc-950 text-amber-400 font-mono font-extrabold text-sm text-center border border-amber-500 rounded-md px-1 py-0.5 focus:outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onChangeBpm && beat) {
                      setTempBpm(String(currentBpm));
                      setIsEditingBpm(true);
                    }
                  }}
                  className="text-base sm:text-lg font-mono font-extrabold text-amber-400 hover:text-amber-300 cursor-pointer select-none px-1.5 py-0.5 rounded-lg hover:bg-zinc-800/60 transition-all tracking-tight"
                  title="Toca para ingresar el BPM numérico o usa la barra deslizante abajo"
                >
                  {currentBpm} <span className="text-[11px] font-medium text-zinc-400">BPM</span>
                </button>
              )}

              {onChangeBpm && beat && (
                <button
                  type="button"
                  onClick={() => onChangeBpm(Math.min(300, currentBpm + 1))}
                  className="w-7 h-7 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-amber-400 font-bold text-sm flex items-center justify-center transition-colors cursor-pointer select-none active:scale-95 shadow-sm"
                  title="Aumentar 1 BPM"
                >
                  +
                </button>
              )}
            </div>

            {/* SMOOTH DRAGGABLE SLIDER (Deslizable, suave y manejable) */}
            {onChangeBpm && beat && (
              <div className="w-full px-1 flex flex-col items-center gap-0.5">
                <input
                  type="range"
                  min="50"
                  max="220"
                  step="1"
                  value={currentBpm}
                  onChange={(e) => onChangeBpm(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400 hover:accent-amber-300 transition-all"
                  title="Desliza para ajustar el Tempo / BPM suavemente"
                />
                <div className="w-full flex items-center justify-between text-[8px] font-mono text-zinc-500 px-0.5 select-none pointer-events-none">
                  <span>50</span>
                  <span className="text-[7px] text-zinc-500 tracking-wider">◄ DESLIZAR ►</span>
                  <span>220</span>
                </div>
              </div>
            )}

            {/* Quick 1x / 2x Double-time Toggle */}
            {onChangeBpm && beat && (
              <div className="flex items-center gap-1 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isDoubleTime) {
                      onChangeBpm(Math.max(40, halfTimeBpm));
                    }
                  }}
                  className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                    !isDoubleTime
                      ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title={`Modo 1x tiempo base (${halfTimeBpm} BPM)`}
                >
                  1x ({halfTimeBpm})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!isDoubleTime) {
                      onChangeBpm(Math.min(300, doubleTimeBpm));
                    }
                  }}
                  className={`text-[9px] px-2 py-0.5 rounded font-mono font-bold transition-all cursor-pointer ${
                    isDoubleTime
                      ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                      : 'bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title={`Modo x2 tiempo doble (${doubleTimeBpm} BPM)`}
                >
                  2x ({doubleTimeBpm})
                </button>
              </div>
            )}
          </div>

          {/* RIGHT: ESCALAS & AUTOTUNE */}
          <div className="flex flex-col items-center justify-center px-1 space-y-1">
            <span className="text-[10px] font-mono text-zinc-400 font-semibold tracking-wider uppercase">
              ESCALA // AFINACIÓN
            </span>

            {/* Note & Scale Mode Selector */}
            {onChangeTonality ? (
              <div className="flex items-center gap-1">
                {/* Root Note Selector with Relative Key directly inside */}
                <select
                  value={keyInfo.rootKey}
                  onChange={(e) => {
                    const newRoot = e.target.value as MusicalKey;
                    onChangeTonality(newRoot, keyInfo.scaleMode);
                  }}
                  className="bg-zinc-800 text-amber-300 font-bold font-mono text-xs px-2 py-1 rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400 cursor-pointer"
                  title="Nota fundamental y tonalidad relativa directa para afinar"
                >
                  {NOTE_NAMES.map((n) => {
                    const rel = getRelativeKey(n, keyInfo.scaleMode);
                    return (
                      <option key={n} value={n}>
                        {n} (Rel. {rel.relativeRoot})
                      </option>
                    );
                  })}
                </select>

                {/* Scale Mode (Menor / Mayor) */}
                <select
                  value={keyInfo.scaleMode === 'minor' ? 'minor' : 'major'}
                  onChange={(e) => {
                    const newMode = e.target.value as ScaleMode;
                    onChangeTonality(keyInfo.rootKey, newMode);
                  }}
                  className="bg-zinc-800 text-zinc-200 font-bold font-mono text-xs px-2 py-1 rounded-lg border border-zinc-700 focus:outline-none focus:border-amber-400 cursor-pointer"
                  title="Modo de escala (Menor o Mayor)"
                >
                  <option value="minor">Menor</option>
                  <option value="major">Mayor</option>
                </select>
              </div>
            ) : (
              <span className="text-zinc-100 font-bold text-xs">{keyInfo.tonalityName}</span>
            )}

            {/* Auto-detect button (subtle) */}
            {onDetectKeyAndBpm && beat && (
              <button
                type="button"
                onClick={onDetectKeyAndBpm}
                disabled={isAnalyzingBeat}
                className="text-[9px] font-mono text-zinc-500 hover:text-amber-400 flex items-center gap-1 transition-colors cursor-pointer"
                title="Re-analizar tempo y escala con el motor DSP"
              >
                <Sparkles className={`w-2.5 h-2.5 ${isAnalyzingBeat ? 'animate-spin text-amber-400' : ''}`} />
                <span>{isAnalyzingBeat ? 'Analizando...' : 'Auto-detectar'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 4. Scrubber & Progress Bar */}
      <div className="w-full px-2 mt-1">
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          className="relative w-full h-7 flex items-center cursor-pointer group select-none"
        >
          {/* Background Track */}
          <div className="w-full h-1.5 bg-black/30 rounded-full overflow-hidden relative shadow-inner">
            {/* Loop Region highlight */}
            {loopSettings.enabled && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-black/40 border-x border-black"
                style={{
                  left: `${(loopSettings.startSec / duration) * 100}%`,
                  width: `${((loopSettings.endSec - loopSettings.startSec) / duration) * 100}%`,
                }}
              />
            )}

            {/* Progress Fill */}
            <div
              className="h-full bg-zinc-950 rounded-full transition-all duration-75 relative shadow"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-zinc-950 rounded-full shadow-md border-2 border-white pointer-events-none group-hover:scale-125 transition-transform"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] font-mono font-bold text-zinc-950 px-0.5">
          {isRecording ? (
            <span className="flex items-center gap-1.5 text-red-600 font-extrabold font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping" />
              🔴 REC {formatTime(currentTime)}
            </span>
          ) : (
            <span>{formatTime(currentTime)}</span>
          )}
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 5. Main Transport Player Controls: UNIFIED DECK (1 Play, 1 Rec) */}
      <div className="w-full flex flex-col items-center px-2 mt-3">
        <div className="w-full flex items-center justify-between gap-1 sm:gap-2">
          {/* Left tools: Loop & Rewind */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Loop toggle button */}
            <button
              type="button"
              onClick={onToggleLoop}
              onContextMenu={(e) => {
                e.preventDefault();
                onOpenLoopSettings();
              }}
              className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all cursor-pointer active:scale-90 ${
                loopSettings.enabled
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
              }`}
              title="Repetir compases (Click derecho para configurar)"
            >
              <div className="relative flex items-center justify-center">
                <Repeat className="w-4 h-4" />
                {loopSettings.enabled && (
                  <span className="absolute -bottom-2 text-[7px] font-mono font-bold text-amber-400">
                    {loopSettings.bars === 'all' ? 'TODO' : `${loopSettings.bars}B`}
                  </span>
                )}
              </div>
            </button>

            {/* Rewind 5s */}
            <button
              type="button"
              onClick={() => onSeek(Math.max(0, currentTime - 5))}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
              title="Retroceder 5 segundos"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          {/* Center: THE TWO UNIFIED BUTTONS: 1 PLAY & 1 REC */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* 1. PLAY / PAUSE BUTTON */}
            <button
              type="button"
              onClick={onPlayPause}
              className={`h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg active:scale-90 ${
                isPlaying
                  ? 'bg-amber-400 text-zinc-950 shadow-amber-400/20'
                  : 'bg-white text-zinc-950 hover:bg-amber-300 shadow-[0_4px_20px_rgba(255,255,255,0.18)]'
              }`}
              title={isPlaying ? 'Pausar (Espacio)' : 'Reproducir (Espacio)'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 sm:w-6 sm:h-6 fill-current" />
              ) : (
                <Play className="w-5 h-5 sm:w-6 sm:h-6 fill-current ml-0.5" />
              )}
            </button>

            {/* 2. REC / STOP BUTTON */}
            {onStartRecord && (
              isRecording ? (
                <button
                  type="button"
                  onClick={onStopRecord}
                  className="h-12 sm:h-14 px-3 sm:px-4 rounded-full flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-extrabold shadow-[0_0_20px_rgba(239,68,68,0.6)] border border-red-300 animate-pulse active:scale-95 transition-all cursor-pointer select-none"
                  title="Detener grabación"
                >
                  <Square className="w-4 h-4 fill-current shrink-0" />
                  <span className="truncate">STOP ({formatElapsed(elapsedSec)})</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => selectedTrack && onStartRecord(selectedTrack.id)}
                  className="h-12 w-12 sm:h-14 sm:w-14 rounded-full flex items-center justify-center bg-red-600 hover:bg-red-500 text-white shadow-[0_4px_20px_rgba(239,68,68,0.35)] border border-red-400/50 active:scale-90 transition-all cursor-pointer"
                  title={`Grabar en ${selectedTrack?.name || 'Vocal'} (Punch-in automático)`}
                >
                  <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white shadow-inner" />
                </button>
              )
            )}
          </div>

          {/* Right tools: Forward & Count-In / BT Sync */}
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Forward 5s */}
            <button
              type="button"
              onClick={() => onSeek(Math.min(duration, currentTime + 5))}
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
              title="Avanzar 5 segundos"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Count-In Toggle (1-Bar Timer) */}
            {onToggleCountIn && (
              <button
                type="button"
                onClick={onToggleCountIn}
                className={`flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all cursor-pointer active:scale-90 ${
                  countInEnabled
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title={countInEnabled ? 'Conteo previo activo (1 compás)' : 'Activar conteo previo de 1 compás'}
              >
                <Timer className="w-4 h-4" />
              </button>
            )}

            {/* Bluetooth Sync Toggle */}
            {onToggleBluetoothSync && (
              <button
                type="button"
                onClick={onToggleBluetoothSync}
                className={`hidden xs:flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full transition-all cursor-pointer active:scale-90 ${
                  bluetoothSyncEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                }`}
                title={
                  bluetoothSyncEnabled
                    ? `Bluetooth Sync Activo (-${bluetoothOffsetMs}ms)`
                    : 'Calibrar audífonos Bluetooth (AirPods, etc.)'
                }
              >
                <Headphones className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Mic Level Meter line when recording */}
        {isRecording && (
          <div className="w-full max-w-[280px] mt-2 flex flex-col items-center gap-1 animate-in fade-in duration-200">
            <div className="w-full h-1.5 rounded-full overflow-hidden bg-zinc-950 border border-zinc-850">
              <div
                className={`h-full transition-all duration-75 ${
                  isSaturated
                    ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,1)]'
                    : 'bg-gradient-to-r from-emerald-500 via-amber-400 to-emerald-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(8, micLevel * 100))}%` }}
              />
            </div>
            {isSaturated && (
              <div className="text-center text-[9px] font-mono text-red-400 font-bold animate-pulse flex items-center justify-center gap-1">
                <AlertTriangle className="w-2.5 h-2.5" />
                <span>¡Saturando! Auto-reduciendo ganancia</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. Beat Volume Slider */}
      <div className="w-full flex items-center gap-2 px-3 mt-3 pt-2 border-t border-black/20">
        <Volume2 className="w-3.5 h-3.5 text-zinc-950 shrink-0" />
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.02"
          value={beatVolume}
          onChange={(e) => onChangeBeatVolume(parseFloat(e.target.value))}
          className="w-full accent-zinc-950 cursor-pointer h-1.5 bg-black/25 rounded-lg appearance-none"
          title="Volumen del Beat"
        />
        <span className="text-[10px] font-mono text-zinc-950 font-bold w-8 text-right tabular-nums">
          {Math.round(beatVolume * 100)}%
        </span>
      </div>
    </div>
  );
};
