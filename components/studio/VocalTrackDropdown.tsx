import React from 'react';
import {
  Mic,
  Sliders,
  Volume2,
  VolumeX,
  Plus,
  Undo2,
  Redo2,
  Music2,
  ChevronDown,
} from 'lucide-react';
import { VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';

interface VocalTrackDropdownProps {
  tracks: VocalTrack[];
  selectedTrackId: VocalTrackId;
  onSelectTrack: (trackId: VocalTrackId) => void;
  onToggleMute: (trackId: VocalTrackId) => void;
  onToggleSolo: (trackId: VocalTrackId) => void;
  onChangeVolume: (trackId: VocalTrackId, volume: number) => void;
  onChangePan?: (trackId: VocalTrackId, pan: number) => void;
  onOpenFX: (trackId: VocalTrackId) => void;
  onAddBackingTrack?: () => void;
  canAddMoreTracks?: boolean;
  isRecording?: boolean;
  activeRecordingTrackId?: VocalTrackId | null;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const VocalTrackDropdown: React.FC<VocalTrackDropdownProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  onToggleMute,
  onToggleSolo,
  onChangeVolume,
  onOpenFX,
  onAddBackingTrack,
  canAddMoreTracks = false,
  isRecording = false,
  activeRecordingTrackId = null,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}) => {
  const currentTrack = tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  if (!currentTrack) return null;

  const clipsCount =
    currentTrack.clips && currentTrack.clips.length > 0
      ? currentTrack.clips.length
      : currentTrack.buffer
      ? 1
      : 0;

  const isTuneActive =
    currentTrack.fx.tune?.enabled && currentTrack.fx.tune.speed > 0.01;

  const hasFXApplied =
    isTuneActive ||
    currentTrack.fx.comp.amount > 0 ||
    currentTrack.fx.saturation.amount > 0 ||
    currentTrack.fx.delay.mix > 0 ||
    currentTrack.fx.reverb.mix > 0 ||
    currentTrack.fx.eq.lowCut ||
    currentTrack.fx.eq.low !== 0 ||
    currentTrack.fx.eq.mid !== 0 ||
    currentTrack.fx.eq.high !== 0;

  return (
    <div className="w-full max-w-md mx-auto px-2 my-1.5">
      <div className="bg-[#0e0e14]/90 border border-zinc-800 rounded-2xl p-2.5 shadow-xl backdrop-blur-md flex flex-col gap-2">
        {/* Main Row: Lista Desplegable de Voces + FX + Mute + Solo + Vol */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap sm:flex-nowrap">
          {/* 1. Track Selector Dropdown (Lista Desplegable) */}
          <div className="relative flex-1 min-w-[140px] flex items-center">
            <div className="absolute left-2.5 pointer-events-none flex items-center text-amber-400">
              <Mic className="w-3.5 h-3.5" />
            </div>
            <select
              value={selectedTrackId}
              onChange={(e) => onSelectTrack(e.target.value as VocalTrackId)}
              className={`w-full appearance-none pl-8 pr-7 py-1.5 rounded-xl bg-zinc-900 border text-xs font-mono font-bold transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-amber-500/50 ${
                isRecording && activeRecordingTrackId === currentTrack.id
                  ? 'border-red-500/60 text-red-300 ring-1 ring-red-500/30'
                  : 'border-zinc-750 text-zinc-200 hover:border-zinc-600'
              }`}
              title="Selecciona la pista vocal activa para grabar y editar"
            >
              {tracks.map((t) => {
                const count =
                  t.clips && t.clips.length > 0 ? t.clips.length : t.buffer ? 1 : 0;
                const recActive = isRecording && activeRecordingTrackId === t.id;
                return (
                  <option key={t.id} value={t.id} className="bg-zinc-950 text-zinc-100 font-mono">
                    {recActive ? '🔴 ' : count > 0 ? '✓ ' : '○ '}
                    {t.name} {count > 0 ? `(${count} ${count === 1 ? 'toma' : 'tomas'})` : '[Vacía]'}
                  </option>
                );
              })}
            </select>
            <div className="absolute right-2 pointer-events-none text-zinc-400">
              <ChevronDown className="w-3.5 h-3.5" />
            </div>
          </div>

          {/* 2. FX / Auto-Tune Button */}
          <button
            type="button"
            onClick={() => onOpenFX(currentTrack.id)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer active:scale-95 shrink-0 ${
              hasFXApplied
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-sm shadow-amber-500/20'
                : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-750'
            }`}
            title="Abrir Auto-Tune y Efectos de Voz"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>FX</span>
            {isTuneActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>

          {/* 3. Mute & Solo Quick Toggles */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onToggleMute(currentTrack.id)}
              className={`w-7 h-7 rounded-lg text-[11px] font-mono font-extrabold flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                currentTrack.isMuted
                  ? 'bg-red-500/20 text-red-400 border border-red-500/50 shadow-sm'
                  : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-750'
              }`}
              title={currentTrack.isMuted ? 'Desmutear pista' : 'Mutear pista (M)'}
            >
              M
            </button>

            <button
              type="button"
              onClick={() => onToggleSolo(currentTrack.id)}
              className={`w-7 h-7 rounded-lg text-[11px] font-mono font-extrabold flex items-center justify-center transition-all cursor-pointer active:scale-95 ${
                currentTrack.isSolo
                  ? 'bg-amber-500 text-black font-black border border-amber-400 shadow-sm shadow-amber-500/30'
                  : 'bg-zinc-850 hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 border border-zinc-750'
              }`}
              title={currentTrack.isSolo ? 'Quitar Solo' : 'Solo pista (S)'}
            >
              S
            </button>
          </div>

          {/* 4. Quick Undo / Redo */}
          {(onUndo || onRedo) && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className={`p-1.5 rounded-lg transition-all ${
                  canUndo
                    ? 'text-amber-300 hover:bg-zinc-800 cursor-pointer active:scale-95'
                    : 'text-zinc-700 opacity-40 cursor-not-allowed'
                }`}
                title="Deshacer toma / cambio (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                className={`p-1.5 rounded-lg transition-all ${
                  canRedo
                    ? 'text-amber-300 hover:bg-zinc-800 cursor-pointer active:scale-95'
                    : 'text-zinc-700 opacity-40 cursor-not-allowed'
                }`}
                title="Rehacer toma / cambio (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* 5. Add Backing Track Button (if allowed) */}
          {onAddBackingTrack && canAddMoreTracks && (
            <button
              type="button"
              onClick={onAddBackingTrack}
              className="p-1.5 rounded-lg bg-zinc-850 hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 border border-zinc-750 text-xs transition-all active:scale-95 shrink-0"
              title="Agregar pista extra de coros"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Sub-row: Track Volume Slider & Status Info */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-850/80 px-1">
          <div className="flex items-center gap-2 flex-1">
            {currentTrack.isMuted ? (
              <VolumeX className="w-3 h-3 text-red-400 shrink-0" />
            ) : (
              <Volume2 className="w-3 h-3 text-zinc-500 shrink-0" />
            )}
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.02"
              value={currentTrack.volume}
              onChange={(e) => onChangeVolume(currentTrack.id, parseFloat(e.target.value))}
              className="w-full accent-amber-400 cursor-pointer h-1 bg-zinc-800 rounded-lg appearance-none"
              title={`Volumen de ${currentTrack.name}`}
            />
            <span className="text-[10px] font-mono text-zinc-400 w-8 text-right tabular-nums">
              {Math.round(currentTrack.volume * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0 text-[10px] font-mono text-zinc-400">
            {clipsCount > 0 ? (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {clipsCount} {clipsCount === 1 ? 'toma' : 'tomas'}
              </span>
            ) : (
              <span className="text-zinc-600">Sin tomas</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
