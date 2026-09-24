/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, SlidersHorizontal, Sparkles, Wand2, Music2 } from 'lucide-react';
import {
  MusicalKey,
  ScaleMode,
  VocalFX,
  VocalTrack,
} from '@/lib/studio/types/audio';
import {
  MAIN_SCALES,
  NOTE_NAMES,
  SPANISH_KEY_NAMES,
  getScaleNoteNames,
} from '@/lib/studio/audio/pitchCorrection';
import { TuneKnob } from './TuneKnob';

interface VocalFXModalProps {
  track: VocalTrack | null;
  bpm: number;
  beatKey?: string;
  onClose: () => void;
  onChangeFX: (newFX: VocalFX) => void;
  onChangePan?: (pan: number) => void;
  audioCtx?: AudioContext | null;
}

export const VocalFXModal: React.FC<VocalFXModalProps> = ({
  track,
  bpm,
  beatKey,
  onClose,
  onChangeFX,
  onChangePan,
  audioCtx,
}) => {
  if (!track) return null;

  const { fx } = track;

  const updateFX = (updater: (prev: VocalFX) => VocalFX) => {
    onChangeFX(updater(fx));
  };

  const delayDivisions: Array<'OFF' | '1/8' | '1/4' | '1/2' | '1 BAR'> = [
    'OFF',
    '1/8',
    '1/4',
    '1/2',
    '1 BAR',
  ];

  const reverbPresets: Array<'ROOM' | 'PLATE' | 'HALL'> = ['ROOM', 'PLATE', 'HALL'];

  const currentTune = fx.tune || {
    enabled: false,
    speed: 0,
    rootKey: 'A',
    scaleMode: 'minor',
    humanize: 0.1,
  };

  const currentScale = MAIN_SCALES.find((s) => s.id === currentTune.scaleMode) || MAIN_SCALES[0];
  const activeScaleNotes = getScaleNoteNames(currentTune.rootKey, currentTune.scaleMode);

  const handleSpeedChange = (speed: number) => {
    updateFX((prev) => ({
      ...prev,
      tune: {
        ...(prev.tune || currentTune),
        speed,
        enabled: speed > 0.01,
      },
    }));
  };

  const handleSelectRootKey = (key: MusicalKey) => {
    updateFX((prev) => ({
      ...prev,
      tune: {
        ...(prev.tune || currentTune),
        rootKey: key,
      },
    }));
  };

  const handleSelectScaleMode = (mode: ScaleMode) => {
    updateFX((prev) => ({
      ...prev,
      tune: {
        ...(prev.tune || currentTune),
        scaleMode: mode,
      },
    }));
  };

  // Sync vocal key and scale with current beat detection
  const handleSyncWithBeat = () => {
    if (!beatKey) return;

    // Detect root note e.g. "A", "F#", "C"
    let detectedRoot: MusicalKey = 'A';
    for (const k of NOTE_NAMES) {
      if (beatKey.toUpperCase().startsWith(k)) {
        detectedRoot = k;
      }
    }

    const isMinor = beatKey.includes('m') || beatKey.toLowerCase().includes('minor') || beatKey.toLowerCase().includes('menor');
    const detectedMode: ScaleMode = isMinor ? 'minor' : 'major';

    updateFX((prev) => ({
      ...prev,
      tune: {
        ...(prev.tune || currentTune),
        rootKey: detectedRoot,
        scaleMode: detectedMode,
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-[#111115] border border-zinc-800 rounded-t-3xl sm:rounded-2xl max-h-[88vh] overflow-y-auto shadow-2xl p-4 sm:p-5 text-white">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-bold font-display uppercase tracking-wide">
              {track.name} FX & AUTO-TUNE
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* SECTION 1: VOCAL PITCH TUNE (AUTOTUNE) */}
          <div className="p-4 rounded-2xl bg-gradient-to-b from-zinc-900 via-zinc-900/90 to-zinc-950 border border-amber-500/30 shadow-xl space-y-4">
            {/* Header & Status Indicator */}
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  1. AFINADOR VOCAL (AUTO-TUNE)
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${
                    currentTune.enabled
                      ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)] animate-pulse'
                      : 'bg-zinc-600'
                  }`}
                />
                <span className="text-[11px] font-mono font-bold text-zinc-400">
                  {currentTune.enabled ? 'ACTIVO' : 'BYPASS (0 - APAGADO)'}
                </span>
              </div>
            </div>

            {/* Tactile Rotary Knob with Mechanical 0-Detent Click */}
            <TuneKnob
              speed={currentTune.speed}
              onChangeSpeed={handleSpeedChange}
              audioCtx={audioCtx}
            />

            {/* BANNER: RESUMEN DE LA CORRECCIÓN & BOTÓN DE SINCRONIZACIÓN */}
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                  Tu voz se corregirá a:
                </span>
                <span className="text-sm font-mono font-extrabold text-amber-300 flex items-center gap-1.5">
                  <span>{SPANISH_KEY_NAMES[currentTune.rootKey]} ({currentTune.rootKey})</span>
                  <span className="text-zinc-500 font-normal">•</span>
                  <span className="text-white">{currentScale.name}</span>
                </span>
              </div>

              {beatKey && (
                <button
                  onClick={handleSyncWithBeat}
                  title="Sincronizar con la nota y escala del beat actual"
                  className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-amber-500 hover:text-black text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                >
                  <Wand2 className="w-3.5 h-3.5" />
                  <span>Sync Beat ({beatKey})</span>
                </button>
              )}
            </div>

            {/* PARTE A: NOTA EN LA QUE QUIERES QUE SE ESCUCHE Y CORRIJA TU VOZ (12 NOTAS) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                  <Music2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>NOTA EN LA QUE QUIERES QUE SE ESCUCHE Y CORRIJA TU VOZ:</span>
                </label>
                <span className="text-[10px] font-mono text-amber-400 font-bold">
                  {SPANISH_KEY_NAMES[currentTune.rootKey]} ({currentTune.rootKey})
                </span>
              </div>

              {/* 12 Musical Notes Selector Grid */}
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
                {NOTE_NAMES.map((k) => {
                  const isSelected = currentTune.rootKey === k;
                  return (
                    <button
                      key={k}
                      onClick={() => handleSelectRootKey(k)}
                      className={`py-2 px-0.5 rounded-xl flex flex-col items-center justify-center border transition-all ${
                        isSelected
                          ? 'bg-amber-500 text-black border-amber-300 font-extrabold shadow-lg shadow-amber-500/20 scale-105 z-10 ring-2 ring-amber-400/50'
                          : 'bg-zinc-950/80 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-mono font-bold">{k}</span>
                      <span className={`text-[9px] font-sans ${isSelected ? 'text-black/85 font-bold' : 'text-zinc-500'}`}>
                        {SPANISH_KEY_NAMES[k]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* PARTE B: LAS 5 ESCALAS PRINCIPALES */}
            <div className="space-y-1.5 pt-2 border-t border-zinc-800/80">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-mono font-bold text-zinc-200 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>LAS 5 ESCALAS PRINCIPALES:</span>
                </label>
                <span className="text-[10px] font-mono text-zinc-400">
                  {activeScaleNotes.length} notas en escala
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MAIN_SCALES.map((scale) => {
                  const isSelected = currentTune.scaleMode === scale.id;
                  return (
                    <button
                      key={scale.id}
                      onClick={() => handleSelectScaleMode(scale.id)}
                      className={`p-2.5 rounded-xl border text-left transition-all relative ${
                        isSelected
                          ? 'bg-amber-500/20 border-amber-400 text-white shadow-md ring-1 ring-amber-400/40'
                          : 'bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold text-amber-300">
                          {scale.name}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                          isSelected ? 'bg-amber-500 text-black font-extrabold' : 'bg-zinc-800 text-zinc-400'
                        }`}>
                          {scale.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-zinc-400 font-sans mt-1 leading-snug">
                        {scale.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* VISUALIZADOR DE NOTAS DE LA ESCALA (PITCH STRIP) */}
            <div className="p-2.5 rounded-xl bg-zinc-950/80 border border-zinc-800/80 space-y-1.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <span>Notas permitidas en {currentTune.rootKey} {currentScale.shortName}:</span>
              </div>
              <div className="flex items-center flex-wrap gap-1">
                {activeScaleNotes.map((note, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-xs font-mono font-bold ${
                      note === currentTune.rootKey
                        ? 'bg-amber-500 text-black shadow-sm ring-1 ring-amber-400'
                        : 'bg-zinc-900 text-amber-200 border border-zinc-800'
                    }`}
                  >
                    {note}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* SECTION 2: EQUALIZER */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                2. EQUALIZER
              </span>
              <button
                onClick={() =>
                  updateFX((prev) => ({
                    ...prev,
                    eq: { ...prev.eq, lowCut: !prev.eq.lowCut },
                  }))
                }
                className={`px-2.5 py-1 rounded text-[11px] font-mono transition-all ${
                  fx.eq.lowCut
                    ? 'bg-amber-500 text-black font-bold'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                LOW CUT (80Hz)
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* LOW */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-zinc-400 mb-1">LOW</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={fx.eq.low}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateFX((prev) => ({ ...prev, eq: { ...prev.eq, low: val } }));
                  }}
                  className="w-full"
                />
                <span className="text-[10px] font-mono text-zinc-500 mt-1 tabular-nums">
                  {fx.eq.low > 0 ? `+${fx.eq.low}` : fx.eq.low} dB
                </span>
              </div>

              {/* MID */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-zinc-400 mb-1">MID</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={fx.eq.mid}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateFX((prev) => ({ ...prev, eq: { ...prev.eq, mid: val } }));
                  }}
                  className="w-full"
                />
                <span className="text-[10px] font-mono text-zinc-500 mt-1 tabular-nums">
                  {fx.eq.mid > 0 ? `+${fx.eq.mid}` : fx.eq.mid} dB
                </span>
              </div>

              {/* HIGH */}
              <div className="flex flex-col items-center">
                <span className="text-[10px] font-mono text-zinc-400 mb-1">HIGH</span>
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.5"
                  value={fx.eq.high}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    updateFX((prev) => ({ ...prev, eq: { ...prev.eq, high: val } }));
                  }}
                  className="w-full"
                />
                <span className="text-[10px] font-mono text-zinc-500 mt-1 tabular-nums">
                  {fx.eq.high > 0 ? `+${fx.eq.high}` : fx.eq.high} dB
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: COMPRESSOR & SATURATION */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Compressor */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  3. COMPRESSOR
                </span>
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                  {Math.round(fx.comp.amount * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mb-2">Control dinámico vocal</p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={fx.comp.amount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateFX((prev) => ({ ...prev, comp: { amount: val } }));
                }}
                className="w-full"
              />
            </div>

            {/* Saturation */}
            <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  4. SATURACIÓN
                </span>
                <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                  {Math.round(fx.saturation.amount * 100)}%
                </span>
              </div>
              <p className="text-[10px] text-zinc-400 mb-2">Calidez y armónicos de cinta</p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.02"
                value={fx.saturation.amount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateFX((prev) => ({ ...prev, saturation: { amount: val } }));
                }}
                className="w-full"
              />
            </div>
          </div>

          {/* SECTION 4: DELAY (TEMPO SYNCED) */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                5. DELAY A TIEMPO ({bpm} BPM)
              </span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                Mix {Math.round(fx.delay.mix * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {delayDivisions.map((div) => (
                <button
                  key={div}
                  onClick={() =>
                    updateFX((prev) => ({
                      ...prev,
                      delay: { ...prev.delay, division: div },
                    }))
                  }
                  className={`py-1.5 rounded text-[11px] font-mono font-semibold transition-all ${
                    fx.delay.division === div
                      ? 'bg-amber-500 text-black shadow'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {div}
                </button>
              ))}
            </div>

            {fx.delay.division !== 'OFF' && (
              <input
                type="range"
                min="0"
                max="0.8"
                step="0.02"
                value={fx.delay.mix}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateFX((prev) => ({ ...prev, delay: { ...prev.delay, mix: val } }));
                }}
                className="w-full"
              />
            )}
          </div>

          {/* SECTION 5: REVERB */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                6. REVERBERACIÓN
              </span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                Mix {Math.round(fx.reverb.mix * 100)}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {reverbPresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() =>
                    updateFX((prev) => ({
                      ...prev,
                      reverb: { ...prev.reverb, preset },
                    }))
                  }
                  className={`py-1.5 rounded text-[11px] font-mono font-semibold transition-all ${
                    fx.reverb.preset === preset
                      ? 'bg-amber-500 text-black shadow'
                      : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>

            <input
              type="range"
              min="0"
              max="0.8"
              step="0.02"
              value={fx.reverb.mix}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                updateFX((prev) => ({ ...prev, reverb: { ...prev.reverb, mix: val } }));
              }}
              className="w-full"
            />
          </div>

          {/* Spatial Stereo Panning (L / C / R) */}
          <div className="p-3 bg-zinc-950/70 rounded-xl border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-mono text-zinc-300">PANORÁMICO ESTÉREO (PAN)</span>
              <button
                onClick={() => onChangePan && onChangePan(0)}
                className="text-[10px] font-mono font-bold text-amber-300 px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700 hover:border-amber-400"
                title="Doble clic o clic para centrar"
              >
                {Math.abs(track.pan ?? 0) < 0.05
                  ? 'CENTRO (C)'
                  : (track.pan ?? 0) < 0
                  ? `IZQ (L ${Math.round(Math.abs(track.pan ?? 0) * 100)}%)`
                  : `DER (R ${Math.round((track.pan ?? 0) * 100)}%)`}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-500 font-bold">L 100%</span>
              <input
                type="range"
                min={-1}
                max={1}
                step={0.05}
                value={track.pan ?? 0}
                onChange={(e) => onChangePan && onChangePan(parseFloat(e.target.value))}
                onDoubleClick={() => onChangePan && onChangePan(0)}
                className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
              />
              <span className="text-[10px] font-mono text-zinc-500 font-bold">R 100%</span>
            </div>
            <p className="text-[10px] font-mono text-zinc-500 mt-1 text-center">
              Ubica la voz en el panorama estéreo (ideal para coros, armonías y adlibs).
            </p>
          </div>
        </div>

        {/* Done Button */}
        <div className="mt-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs uppercase tracking-wider font-mono shadow-md active:scale-98 transition-all"
          >
            GUARDAR Y APLICAR FX
          </button>
        </div>
      </div>
    </div>
  );
};
