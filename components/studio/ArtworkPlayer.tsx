import React, { useRef, useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Repeat,
  Sliders,
  Volume2,
  Sparkles,
  Music2,
  Check,
} from 'lucide-react';
import { BeatData, LoopSettings, MusicalKey, ScaleMode } from '@/lib/studio/types/audio';
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
  isRecording?: boolean;
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
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);
  const [isEditingBpm, setIsEditingBpm] = useState(false);
  const [tempBpm, setTempBpm] = useState('');

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
      {/* 1. FLOW IPOD: Focal Disc & Album Art */}
      <div className="relative group w-48 h-48 sm:w-56 sm:h-56 my-2 flex items-center justify-center">
        {/* Glow ambient background */}
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-20 transition-opacity duration-700 pointer-events-none"
          style={{ background: beat ? beat.artworkGradient : '#27272a' }}
        />

        {/* Outer Vinyl Disc */}
        <div
          className={`relative w-full h-full rounded-full p-2.5 shadow-2xl border border-zinc-750/70 bg-[#0c0c10] transition-transform ${
            isPlaying ? 'animate-vinyl-spin' : 'animate-vinyl-spin-paused'
          }`}
          style={{
            backgroundImage: `
              radial-gradient(circle at center, transparent 35%, rgba(255,255,255,0.03) 36%, transparent 37%),
              radial-gradient(circle at center, transparent 50%, rgba(255,255,255,0.02) 51%, transparent 52%),
              radial-gradient(circle at center, transparent 65%, rgba(255,255,255,0.03) 66%, transparent 67%),
              radial-gradient(circle at center, transparent 80%, rgba(255,255,255,0.02) 81%, transparent 82%)
            `,
          }}
        >
          {/* Inner Album Label */}
          <div
            className="w-full h-full rounded-full flex flex-col items-center justify-center relative overflow-hidden shadow-inner border border-zinc-600/30"
            style={{
              background: beat ? beat.artworkGradient : 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
            }}
          >
            {/* Center Spindle Hole */}
            <div className="w-7 h-7 rounded-full bg-[#09090b] border-2 border-zinc-700 shadow-inner flex items-center justify-center z-10">
              <div className="w-2 h-2 rounded-full bg-zinc-950" />
            </div>

            {/* Label Typography */}
            <div className="absolute top-4 text-center px-4 pointer-events-none">
              <p className="text-[9px] tracking-widest uppercase font-mono text-zinc-300 font-semibold opacity-80">
                RGODBEAT
              </p>
            </div>
            <div className="absolute bottom-4 text-center px-4 pointer-events-none">
              <p className="text-[9px] tracking-wider uppercase font-mono text-amber-300 font-bold">
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
          className="absolute -bottom-1 -right-1 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/95 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-750 shadow-lg text-[10px] font-mono backdrop-blur-md transition-all active:scale-95 cursor-pointer"
        >
          <Sliders className="w-3 h-3 text-amber-400" />
          <span>Beat FX</span>
        </button>
      </div>

      {/* 2. Beat Title */}
      <div className="w-full text-center mt-2 mb-1 px-4">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-white truncate">
          {beat ? beat.title : 'Selecciona un Beat'}
        </h2>
      </div>

      {/* 3. THE "TEMPO & ESCALAS" HUD CARD (Simple, crystal-clear, functional) */}
      <div className="w-full bg-[#0e0e14]/90 border border-zinc-800 rounded-2xl p-3 my-2 shadow-xl backdrop-blur-md">
        <div className="grid grid-cols-2 gap-2 divide-x divide-zinc-800/80">
          {/* LEFT: TEMPO (BPM) */}
          <div className="flex flex-col items-center justify-center px-1 space-y-1">
            <span className="text-[10px] font-mono text-zinc-400 font-semibold tracking-wider uppercase">
              TEMPO // VELOCIDAD
            </span>

            {/* BPM Value & Steppers */}
            <div className="flex items-center gap-1.5">
              {onChangeBpm && beat && (
                <button
                  type="button"
                  onClick={() => onChangeBpm(Math.max(40, currentBpm - 1))}
                  className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer select-none"
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
                  className="w-14 bg-zinc-950 text-amber-400 font-mono font-extrabold text-sm text-center border border-amber-500 rounded-md px-1 py-0.5 focus:outline-none"
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
                  className="text-base sm:text-lg font-mono font-extrabold text-amber-400 hover:text-amber-300 cursor-pointer select-none px-1 tracking-tight"
                  title="Toca para ingresar el BPM numérico exacto"
                >
                  {currentBpm} <span className="text-[11px] font-medium text-zinc-400">BPM</span>
                </button>
              )}

              {onChangeBpm && beat && (
                <button
                  type="button"
                  onClick={() => onChangeBpm(Math.min(300, currentBpm + 1))}
                  className="w-6 h-6 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-amber-400 font-bold text-xs flex items-center justify-center transition-colors cursor-pointer select-none"
                  title="Aumentar 1 BPM"
                >
                  +
                </button>
              )}
            </div>

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
          <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden relative">
            {/* Loop Region highlight */}
            {loopSettings.enabled && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-amber-500/30 border-x border-amber-400/80"
                style={{
                  left: `${(loopSettings.startSec / duration) * 100}%`,
                  width: `${((loopSettings.endSec - loopSettings.startSec) / duration) * 100}%`,
                }}
              />
            )}

            {/* Progress Fill */}
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-75 relative"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Scrubber Thumb */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white rounded-full shadow-lg border border-zinc-900 pointer-events-none group-hover:scale-125 transition-transform"
            style={{ left: `calc(${progressPercent}% - 7px)` }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] font-mono font-medium text-zinc-400 px-0.5">
          {isRecording ? (
            <span className="flex items-center gap-1.5 text-red-400 font-bold font-mono animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              🔴 REC {formatTime(currentTime)}
            </span>
          ) : (
            <span>{formatTime(currentTime)}</span>
          )}
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 5. Main Transport Player Controls (Flow iPod) */}
      <div className="w-full flex items-center justify-between px-3 mt-3">
        {/* Loop toggle button */}
        <button
          type="button"
          onClick={onToggleLoop}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenLoopSettings();
          }}
          className={`flex items-center justify-center w-10 h-10 rounded-full transition-all cursor-pointer active:scale-90 ${
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

        {/* Center: Rewind / Play / Forward */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
            title="Retroceder 5 segundos"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Primary iPod-Style Play / Pause Button */}
          <button
            type="button"
            onClick={onPlayPause}
            className="w-14 h-14 rounded-full flex items-center justify-center bg-white text-zinc-950 hover:bg-amber-400 active:scale-90 transition-all shadow-[0_4px_20px_rgba(255,255,255,0.15)] cursor-pointer"
            title={isPlaying ? 'Pausar Beat' : 'Reproducir Beat'}
          >
            {isPlaying ? (
              <Pause className="w-6 h-6 fill-current" />
            ) : (
              <Play className="w-6 h-6 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
            className="w-10 h-10 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all cursor-pointer"
            title="Avanzar 5 segundos"
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        {/* Loop Settings Trigger Pill */}
        <button
          type="button"
          onClick={onOpenLoopSettings}
          className="flex items-center justify-center px-2 py-1 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border border-zinc-700 text-[10px] font-mono cursor-pointer transition-all"
          title="Configurar compases del Loop"
        >
          <span>{loopSettings.bars === 'all' ? 'Loop' : `${loopSettings.bars} Bar`}</span>
        </button>
      </div>

      {/* 6. Subtle Beat Volume Slider */}
      <div className="w-full flex items-center gap-2 px-3 mt-3 pt-2 border-t border-zinc-900">
        <Volume2 className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.02"
          value={beatVolume}
          onChange={(e) => onChangeBeatVolume(parseFloat(e.target.value))}
          className="w-full accent-amber-400 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
          title="Volumen del Beat"
        />
        <span className="text-[10px] font-mono text-zinc-500 w-7 text-right tabular-nums">
          {Math.round(beatVolume * 100)}%
        </span>
      </div>
    </div>
  );
};
