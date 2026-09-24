import React from 'react';
import { Mic, Square, Sliders, Trash2, CheckCircle2, Radio, Plus, Volume2 } from 'lucide-react';
import { VocalTrack, VocalTrackId } from '@/lib/studio/types/audio';

interface VocalTracksListProps {
  tracks: VocalTrack[];
  selectedTrackId: VocalTrackId;
  onSelectTrack: (trackId: VocalTrackId) => void;
  activeRecordingTrackId: VocalTrackId | null;
  isRecording: boolean;
  onStartRecord: (trackId: VocalTrackId) => void;
  onStopRecord: () => void;
  onToggleMute: (trackId: VocalTrackId) => void;
  onToggleSolo: (trackId: VocalTrackId) => void;
  onChangeVolume: (trackId: VocalTrackId, volume: number) => void;
  onChangePan?: (trackId: VocalTrackId, pan: number) => void;
  onAddBackingTrack?: () => void;
  canAddMoreTracks?: boolean;
  onDeleteTrack?: (trackId: VocalTrackId) => void;
  onDeleteTake: (trackId: VocalTrackId) => void;
  onOpenFX: (trackId: VocalTrackId) => void;
}

export const VocalTracksList: React.FC<VocalTracksListProps> = ({
  tracks,
  selectedTrackId,
  onSelectTrack,
  activeRecordingTrackId,
  isRecording,
  onStartRecord,
  onStopRecord,
  onToggleMute,
  onToggleSolo,
  onChangeVolume,
  onChangePan,
  onAddBackingTrack,
  canAddMoreTracks = false,
  onDeleteTrack,
  onDeleteTake,
  onOpenFX,
}) => {
  const formatSec = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${mins}:${s.toString().padStart(2, '0')}`;
  };

  const formatPan = (pan: number = 0) => {
    if (Math.abs(pan) < 0.05) return 'C';
    if (pan < 0) return `L${Math.round(Math.abs(pan) * 100)}`;
    return `R${Math.round(pan * 100)}`;
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 pb-12">
      {/* Section Header */}
      <div className="flex items-center justify-between py-2 border-b border-zinc-800/80 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider uppercase font-mono text-zinc-400">
            VOCALES ({tracks.length} PISTAS · 2 LEADS)
          </span>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-zinc-500 font-mono">
            {tracks.filter((t) => t.buffer !== null).length}/{tracks.length} Grabadas
          </span>
          {onAddBackingTrack && canAddMoreTracks && (
            <button
              onClick={onAddBackingTrack}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-mono font-bold transition-all active:scale-95"
              title="Agregar pista extra de coros (hasta 2)"
            >
              <Plus className="w-3 h-3" />
              <span>+ PISTA</span>
            </button>
          )}
        </div>
      </div>

      {/* Vocal Tracks Strip */}
      <div className="space-y-2">
        {tracks.map((track) => {
          const isThisRecording = isRecording && activeRecordingTrackId === track.id;
          const isSelected = selectedTrackId === track.id;
          const clipsCount = (track.clips && track.clips.length > 0) ? track.clips.length : (track.buffer ? 1 : 0);
          const hasTake = clipsCount > 0 || track.buffer !== null;
          const isTuneActive = track.fx.tune?.enabled && track.fx.tune.speed > 0.01;
          const isNonLead = track.id !== 'lead1' && track.id !== 'lead2';
          const hasFXApplied =
            isTuneActive ||
            track.fx.comp.amount > 0 ||
            track.fx.saturation.amount > 0 ||
            track.fx.delay.mix > 0 ||
            track.fx.reverb.mix > 0 ||
            track.fx.eq.lowCut ||
            track.fx.eq.low !== 0 ||
            track.fx.eq.mid !== 0 ||
            track.fx.eq.high !== 0;

          return (
            <div
              key={track.id}
              onClick={() => onSelectTrack(track.id)}
              className={`relative rounded-xl p-3 border transition-all cursor-pointer ${
                isThisRecording
                  ? 'bg-red-950/30 border-red-500/80 shadow-[0_0_20px_rgba(239,68,68,0.3)]'
                  : isSelected
                  ? 'bg-zinc-900 border-amber-500/50 shadow-md ring-1 ring-amber-500/30'
                  : hasTake
                  ? 'bg-zinc-900/80 border-zinc-800/90 hover:border-zinc-700/80'
                  : 'bg-zinc-950/60 border-zinc-850 hover:border-zinc-800'
              }`}
            >
              {/* Row 1: Radio selection, Track Name, Status, Waveform, Record Action */}
              <div className="flex items-center justify-between gap-2">
                {/* Radio Selector & Track Title */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors shrink-0 ${
                      isSelected
                        ? 'border-amber-400 bg-amber-400/20'
                        : 'border-zinc-700 bg-zinc-900'
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                  </div>

                  <div className="truncate">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold text-zinc-100 font-display truncate">
                        {track.name}
                      </p>
                      {clipsCount > 1 && (
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {clipsCount} tomas
                        </span>
                      )}
                      {track.isCustom && onDeleteTrack && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTrack(track.id);
                          }}
                          className="text-zinc-600 hover:text-red-400 p-0.5 rounded transition-colors"
                          title="Eliminar pista adicional"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                    <p className="text-[10px] font-mono text-zinc-500">
                      {isThisRecording
                        ? 'Grabando ahora (Mono)...'
                        : clipsCount > 0
                        ? `${clipsCount} ${clipsCount === 1 ? 'toma lista' : 'tomas en la línea'} (${formatSec(track.duration)})`
                        : 'Pista vacía (Mono centrada)'}
                    </p>
                  </div>
                </div>

                {/* Waveform Thumbnail if recorded */}
                {hasTake && track.waveformSample && (
                  <div className="hidden sm:flex items-center gap-0.5 h-5 w-20 px-1 bg-zinc-950/60 rounded border border-zinc-800 pointer-events-none">
                    {track.waveformSample.slice(0, 16).map((val, idx) => (
                      <div
                        key={idx}
                        className="w-1 bg-emerald-500/70 rounded-full"
                        style={{ height: `${Math.max(20, val * 100)}%` }}
                      />
                    ))}
                  </div>
                )}

                {/* Primary Track Record Button */}
                <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {isThisRecording ? (
                    <button
                      onClick={onStopRecord}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-mono text-xs font-semibold shadow-lg shadow-red-600/30 active:scale-95 transition-all"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>STOP</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        onSelectTrack(track.id);
                        if (isRecording) {
                          onStopRecord();
                        } else {
                          onStartRecord(track.id);
                        }
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-mono text-xs font-semibold transition-all active:scale-95 ${
                        hasTake
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                          : 'bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white border border-red-500/30'
                      }`}
                      title={hasTake ? 'Grabar otra toma (reemplaza la anterior)' : 'Grabar voz mono en esta pista'}
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>{hasTake ? 'REHACER' : 'GRABAR'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Mixer Controls (Mute, Solo, Volume, FX, Delete) */}
              <div
                className="flex items-center justify-between gap-3 mt-2.5 pt-2 border-t border-zinc-800/60"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Mute & Solo Toggles */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onToggleMute(track.id)}
                    className={`w-7 h-7 rounded text-[11px] font-mono font-bold flex items-center justify-center transition-all ${
                      track.isMuted
                        ? 'bg-red-500 text-white shadow-sm'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Silenciar Pista (Mute)"
                  >
                    M
                  </button>
                  <button
                    onClick={() => onToggleSolo(track.id)}
                    className={`w-7 h-7 rounded text-[11px] font-mono font-bold flex items-center justify-center transition-all ${
                      track.isSolo
                        ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Pista Solitaria (Solo)"
                  >
                    S
                  </button>
                </div>

                {/* Volume Mini Slider */}
                <div className="flex-1 flex items-center gap-2 max-w-[130px]">
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={track.volume}
                    onChange={(e) => onChangeVolume(track.id, parseFloat(e.target.value))}
                    className="w-full h-1"
                    title={`Volumen: ${Math.round(track.volume * 100)}%`}
                  />
                  <span className="text-[10px] font-mono text-zinc-500 w-7 text-right tabular-nums">
                    {Math.round(track.volume * 100)}%
                  </span>
                </div>

                {/* FX Trigger & Delete Take */}
                <div className="flex items-center gap-1.5">
                  {isTuneActive && (
                    <span
                      onClick={() => onOpenFX(track.id)}
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500 text-black shadow-sm cursor-pointer hover:bg-amber-400 transition-all"
                      title="Auto-Tune Activo"
                    >
                      TUNE {Math.round(track.fx.tune.speed * 100)}%
                    </span>
                  )}
                  <button
                    onClick={() => onOpenFX(track.id)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono transition-all ${
                      hasFXApplied
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Efectos de Pista (Auto-Tune, EQ, Comp, Saturación, Delay, Reverb)"
                  >
                    <Sliders className="w-3 h-3" />
                    <span>FX</span>
                  </button>

                  {hasTake && (
                    <button
                      onClick={() => onDeleteTake(track.id)}
                      className="p-1 rounded text-zinc-600 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                      title="Eliminar toma"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 3: Stereo Panning Slider (Explicitly highlighted for non-lead tracks) */}
              <div
                className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-zinc-850/80 text-[10px] font-mono"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold ${isNonLead ? 'text-amber-400' : 'text-zinc-400'}`}>
                    PANORÁMICO
                  </span>
                  {isNonLead && (
                    <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                      Estéreo
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] text-zinc-500 font-bold">L</span>
                  <input
                    type="range"
                    min={-1}
                    max={1}
                    step={0.05}
                    value={track.pan ?? 0}
                    onChange={(e) => onChangePan && onChangePan(track.id, parseFloat(e.target.value))}
                    onDoubleClick={() => onChangePan && onChangePan(track.id, 0)}
                    className="w-24 sm:w-28 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                    title={`Panorámico: ${formatPan(track.pan ?? 0)} (Doble clic para centrar)`}
                  />
                  <span className="text-[9px] text-zinc-500 font-bold">R</span>
                  <button
                    onClick={() => onChangePan && onChangePan(track.id, 0)}
                    className="text-[9px] font-bold text-amber-300 hover:text-amber-200 px-1.5 py-0.5 rounded bg-zinc-800 border border-zinc-700/80 min-w-[28px] text-center"
                    title="Restablecer al centro (C)"
                  >
                    {formatPan(track.pan ?? 0)}
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Add Backing Tracks Banner (up to 2 custom tracks) */}
        {onAddBackingTrack && canAddMoreTracks && (
          <button
            onClick={onAddBackingTrack}
            className="w-full py-2.5 px-3 rounded-xl border border-dashed border-zinc-700 hover:border-amber-500/60 bg-zinc-950/40 hover:bg-zinc-900/40 text-zinc-400 hover:text-amber-300 text-xs font-mono font-medium flex items-center justify-center gap-2 transition-all group"
          >
            <Plus className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>+ Agregar Pista de Coro / Apoyo (Hasta 2 adicionales)</span>
          </button>
        )}
      </div>
    </div>
  );
};
