import React, { useRef } from 'react';
import { Play, Pause, RotateCcw, RotateCw, Repeat, Sliders, Volume2, Music, Sparkles, ShieldCheck } from 'lucide-react';
import { BeatData, LoopSettings } from '@/lib/studio/types/audio';
import { parseKeyAndGetRelative } from '@/lib/studio/audio/beatAnalyzer';

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
  onNextBeat,
  onPrevBeat,
  beatVolume,
  onChangeBeatVolume,
  onDetectKeyAndBpm,
  isAnalyzingBeat = false,
  onChangeBpm,
}) => {
  const progressBarRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center px-4 pt-2 pb-4">
      {/* Vinyl / Artwork Showcase */}
      <div className="relative group w-52 h-52 sm:w-60 sm:h-60 my-2 flex items-center justify-center">
        {/* Glow ambient background */}
        <div
          className="absolute inset-0 rounded-full blur-2xl opacity-25 transition-opacity duration-700 pointer-events-none"
          style={{ background: beat ? beat.artworkGradient : '#27272a' }}
        />

        {/* Outer Vinyl Disc */}
        <div
          className={`relative w-full h-full rounded-full p-2.5 shadow-2xl border border-zinc-700/50 bg-[#0d0d11] transition-transform ${
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
            className="w-full h-full rounded-full flex flex-col items-center justify-center relative overflow-hidden shadow-inner border border-zinc-600/40"
            style={{
              background: beat ? beat.artworkGradient : 'linear-gradient(135deg, #18181b 0%, #27272a 100%)',
            }}
          >
            {/* Center Spindle Hole */}
            <div className="w-7 h-7 rounded-full bg-[#09090b] border-2 border-zinc-700 shadow-inner flex items-center justify-center z-10">
              <div className="w-2 h-2 rounded-full bg-zinc-950" />
            </div>

            {/* Label Typography */}
            <div className="absolute top-5 text-center px-4 pointer-events-none">
              <p className="text-[10px] tracking-widest uppercase font-mono text-zinc-300 font-semibold opacity-80">
                RGODBEAT
              </p>
            </div>
            <div className="absolute bottom-5 text-center px-4 pointer-events-none">
              <p className="text-[9px] tracking-wider uppercase font-mono text-amber-300 font-medium">
                {beat ? `${beat.bpm} BPM` : 'DEMO'}
              </p>
            </div>
          </div>
        </div>

        {/* Small floating quick action tags */}
        <button
          onClick={onOpenBeatFX}
          title="Beat FX Controls"
          className="absolute -bottom-2 -right-1 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700/80 shadow-lg text-[11px] font-medium backdrop-blur-md transition-all active:scale-95"
        >
          <Sliders className="w-3 h-3 text-amber-400" />
          <span>Beat FX</span>
        </button>
      </div>

      {/* Beat Information & Key */}
      <div className="w-full text-center mt-3 mb-2">
        {/* Status badges: Saved Beat in memory */}
        {beat?.isCustomUpload && (
          <div className="flex items-center justify-center gap-2 mb-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono text-emerald-300">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Guardado en memoria</span>
            </span>
          </div>
        )}

        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-display truncate px-4">
          {beat ? beat.title : 'No Beat Loaded'}
        </h2>

        {/* BPM & Relative Key Section */}
        {(() => {
          const keyInfo = parseKeyAndGetRelative(beat?.key, beat?.scale);
          return (
            <div className="flex flex-col items-center justify-center gap-1.5 mt-1.5 text-xs text-zinc-400 font-mono-numbers">
              {/* Top row: BPM Controls with x2 and /2 */}
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <div className="inline-flex items-center bg-zinc-900/90 border border-zinc-800 rounded-lg px-2 py-0.5 gap-1 shadow-sm">
                  {onChangeBpm && beat && (
                    <button
                      onClick={() => onChangeBpm(Math.max(40, beat.bpm - 1))}
                      className="text-zinc-500 hover:text-amber-400 font-bold px-1 transition-colors text-xs select-none"
                      title="Reducir 1 BPM"
                    >
                      -
                    </button>
                  )}
                  <span className="text-amber-400 font-bold px-0.5">{beat?.bpm || 140} BPM</span>
                  {onChangeBpm && beat && (
                    <button
                      onClick={() => onChangeBpm(Math.min(300, beat.bpm + 1))}
                      className="text-zinc-500 hover:text-amber-400 font-bold px-1 transition-colors text-xs select-none"
                      title="Aumentar 1 BPM"
                    >
                      +
                    </button>
                  )}
                </div>

                {onChangeBpm && beat && (() => {
                  const currentBpm = beat.bpm || 140;
                  const isDoubleTime = currentBpm >= 115;
                  const halfTimeBpm = isDoubleTime ? Math.round(currentBpm / 2) : currentBpm;
                  const doubleTimeBpm = isDoubleTime ? currentBpm : Math.round(currentBpm * 2);

                  return (
                    <div className="inline-flex items-center gap-1 bg-zinc-900/90 border border-zinc-800 rounded-lg p-0.5 shadow-sm">
                      <button
                        type="button"
                        onClick={() => {
                          if (isDoubleTime) {
                            onChangeBpm(Math.max(40, halfTimeBpm));
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold transition-all select-none ${
                          !isDoubleTime
                            ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={`Modo 1x tiempo base (${halfTimeBpm} BPM)`}
                      >
                        1x
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isDoubleTime) {
                            onChangeBpm(Math.min(300, doubleTimeBpm));
                          }
                        }}
                        className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold transition-all select-none ${
                          isDoubleTime
                            ? 'bg-amber-500 text-black shadow-sm font-extrabold'
                            : 'bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                        }`}
                        title={`Modo x2 tiempo doble (${doubleTimeBpm} BPM)`}
                      >
                        x2
                      </button>
                    </div>
                  );
                })()}

                {onDetectKeyAndBpm && beat && (
                  <button
                    onClick={onDetectKeyAndBpm}
                    disabled={isAnalyzingBeat}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/40 text-[10px] font-mono transition-all active:scale-95 shadow-sm"
                    title="Detectar automáticamente BPM, tonalidad y relativa con el motor DSP"
                  >
                    <Sparkles className={`w-3 h-3 text-amber-400 ${isAnalyzingBeat ? 'animate-spin' : ''}`} />
                    <span>{isAnalyzingBeat ? 'Analizando...' : '⚡ Re-Detectar'}</span>
                  </button>
                )}
              </div>

              {/* Bottom row: Musical Key & Relative Key Display */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-0.5">
                <div className="inline-flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 px-2.5 py-1 rounded-lg shadow-sm">
                  <span className="text-zinc-100 font-bold">
                    {keyInfo.tonalityName}
                  </span>
                  <span className="text-zinc-600 font-mono">⇄</span>
                  <span
                    className="text-amber-300/95 font-medium text-[11px] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25 font-mono"
                    title={`Tonalidad relativa directa para cantar o armonizar sin confusiones: ${keyInfo.relativeTonalityName}`}
                  >
                    Relativa: <strong className="text-amber-200">{keyInfo.relativeTonalityName}</strong>
                  </span>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Waveform Scrubber & Progress Bar */}
      <div className="w-full px-2 mt-2">
        <div
          ref={progressBarRef}
          onClick={handleProgressClick}
          className="relative w-full h-8 flex items-center cursor-pointer group select-none py-2"
        >
          {/* Background Track */}
          <div className="w-full h-2 bg-zinc-800/80 rounded-full overflow-hidden relative">
            {/* Waveform Bars subtle overlay if available */}
            {beat?.waveformSample && (
              <div className="absolute inset-0 flex items-center justify-between px-0.5 opacity-30 pointer-events-none">
                {beat.waveformSample.slice(0, 36).map((val, i) => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full"
                    style={{ height: `${Math.max(20, val * 100)}%` }}
                  />
                ))}
              </div>
            )}

            {/* Loop Region highlight */}
            {loopSettings.enabled && duration > 0 && (
              <div
                className="absolute top-0 bottom-0 bg-amber-500/25 border-x border-amber-400/60"
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
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border border-zinc-900 pointer-events-none group-hover:scale-125 transition-transform"
            style={{ left: `calc(${progressPercent}% - 8px)` }}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-xs font-mono font-medium text-zinc-400 px-0.5 mt-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main Transport Player Controls */}
      <div className="w-full flex items-center justify-between px-2 mt-4">
        {/* Loop toggle button with bar badge */}
        <button
          onClick={onToggleLoop}
          onContextMenu={(e) => {
            e.preventDefault();
            onOpenLoopSettings();
          }}
          className={`flex items-center justify-center w-11 h-11 rounded-full transition-all active:scale-90 ${
            loopSettings.enabled
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-850'
          }`}
          title="Toggle Loop (Long-press / right-click for loop length)"
        >
          <div className="relative flex items-center justify-center">
            <Repeat className="w-5 h-5" />
            {loopSettings.enabled && (
              <span className="absolute -bottom-2 text-[8px] font-mono font-bold text-amber-400">
                {loopSettings.bars === 'all' ? 'TODO' : `${loopSettings.bars} Bar`}
              </span>
            )}
          </div>
        </button>

        {/* Center transport buttons: Prev (5s back) / Play / Next (5s forward) */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSeek(Math.max(0, currentTime - 5))}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
            title="Rewind 5s"
          >
            <RotateCcw className="w-5 h-5" />
          </button>

          {/* Giant Primary Tactile Play Button */}
          <button
            onClick={onPlayPause}
            className="w-16 h-16 rounded-full flex items-center justify-center bg-white text-zinc-950 hover:bg-amber-400 active:scale-90 transition-all shadow-[0_4px_24px_rgba(255,255,255,0.15)] focus-visible:ring-2 focus-visible:ring-amber-400"
            title={isPlaying ? 'Pause' : 'Play Beat'}
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-1" />
            )}
          </button>

          <button
            onClick={() => onSeek(Math.min(duration, currentTime + 5))}
            className="w-11 h-11 rounded-full flex items-center justify-center text-zinc-300 hover:text-white hover:bg-zinc-800 active:scale-95 transition-all"
            title="Forward 5s"
          >
            <RotateCw className="w-5 h-5" />
          </button>
        </div>

        {/* Loop setting trigger or cycle beat */}
        <button
          onClick={onOpenLoopSettings}
          className="flex items-center justify-center w-11 h-11 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all"
          title="Configure Loop Length"
        >
          <span className="text-[11px] font-mono font-semibold px-2 py-1 rounded bg-zinc-800/80 border border-zinc-700">
            {loopSettings.bars === 'all' ? 'Loop' : `${loopSettings.bars} Bar`}
          </span>
        </button>
      </div>

      {/* Beat Volume Slider */}
      <div className="w-full flex items-center gap-3 px-3 mt-4 pt-2 border-t border-zinc-900">
        <Volume2 className="w-4 h-4 text-zinc-500 shrink-0" />
        <input
          type="range"
          min="0"
          max="1.5"
          step="0.02"
          value={beatVolume}
          onChange={(e) => onChangeBeatVolume(parseFloat(e.target.value))}
          className="w-full"
          title="Beat Volume"
        />
        <span className="text-[11px] font-mono text-zinc-500 w-8 text-right tabular-nums">
          {Math.round(beatVolume * 100)}%
        </span>
      </div>
    </div>
  );
};
