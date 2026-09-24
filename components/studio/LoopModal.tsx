import React from 'react';
import { X, Repeat, PlayCircle, Sliders } from 'lucide-react';
import { LoopSettings } from '@/lib/studio/types/audio';

interface LoopModalProps {
  loopSettings: LoopSettings;
  bpm: number;
  duration: number;
  onClose: () => void;
  onChangeLoop: (newSettings: LoopSettings) => void;
}

export const LoopModal: React.FC<LoopModalProps> = ({
  loopSettings,
  bpm,
  duration,
  onClose,
  onChangeLoop,
}) => {
  const secPerBeat = 60 / bpm;
  const secPerBar = secPerBeat * 4;
  const totalBarsInBeat = Math.max(1, Math.floor(duration / secPerBar));

  const barPresets: Array<4 | 8 | 16 | 'all'> = [4, 8, 16, 'all'];

  const setBarCount = (bars: 4 | 8 | 16 | 'all') => {
    let startSec = 0;
    let endSec = duration;

    if (bars !== 'all') {
      startSec = loopSettings.startBar * secPerBar;
      endSec = Math.min(duration, startSec + bars * secPerBar);
    }

    onChangeLoop({
      ...loopSettings,
      enabled: true,
      bars,
      startSec,
      endSec,
    });
  };

  const setStartBar = (bar: number) => {
    const barsCount = loopSettings.bars === 'all' ? 8 : loopSettings.bars;
    const startSec = bar * secPerBar;
    const endSec = Math.min(duration, startSec + barsCount * secPerBar);
    onChangeLoop({
      ...loopSettings,
      startBar: bar,
      startSec,
      endSec,
    });
  };

  const currentEndBar =
    loopSettings.bars === 'all'
      ? totalBarsInBeat
      : Math.min(totalBarsInBeat, loopSettings.startBar + (loopSettings.bars as number));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#121217] border border-zinc-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Repeat className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-zinc-100">
                CONFIGURACIÓN DE LOOP (BARS)
              </h3>
              <p className="text-[10px] font-mono text-zinc-400">
                Repetición automática por compases para ensayo y grabación
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {/* Master Loop Toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
            <div>
              <p className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
                <PlayCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>REPRODUCCIÓN EN LOOP</span>
              </p>
              <p className="text-[10px] text-zinc-400 mt-0.5">
                {loopSettings.enabled
                  ? `Activo: Bar ${loopSettings.startBar + 1} al Bar ${currentEndBar}`
                  : 'Desactivado (reproduce el beat completo)'}
              </p>
            </div>
            <button
              onClick={() =>
                onChangeLoop({
                  ...loopSettings,
                  enabled: !loopSettings.enabled,
                })
              }
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                loopSettings.enabled
                  ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                  : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
              }`}
            >
              {loopSettings.enabled ? 'ACTIVADO' : 'DESACTIVADO'}
            </button>
          </div>

          {/* Loop Bar Preset Selection */}
          <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                DURACIÓN DEL LOOP (CANTIDAD DE BARS)
              </p>
              <span className="text-[10px] font-mono text-zinc-400">
                {loopSettings.bars === 'all' ? 'Todo el Beat' : `${loopSettings.bars} Bars seguidos`}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {barPresets.map((bar) => {
                const isSelected = loopSettings.bars === bar;
                return (
                  <button
                    key={bar}
                    onClick={() => setBarCount(bar)}
                    className={`py-2.5 rounded-lg text-xs font-mono font-bold transition-all border ${
                      isSelected
                        ? 'bg-amber-500 text-black border-amber-400 shadow-md shadow-amber-500/20'
                        : 'bg-zinc-800 text-zinc-300 hover:text-white border-zinc-700 hover:bg-zinc-750'
                    }`}
                  >
                    {bar === 'all' ? 'COMPLETO' : `${bar} BARS`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Starting Bar Offset */}
          {loopSettings.bars !== 'all' && (
            <div className="p-3.5 rounded-xl bg-zinc-900/90 border border-zinc-800 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                    COMPÁS / BAR DE INICIO
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Bar {loopSettings.startBar + 1} ➔ Bar {currentEndBar}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max={Math.max(0, totalBarsInBeat - (loopSettings.bars as number))}
                step="1"
                value={loopSettings.startBar}
                onChange={(e) => setStartBar(parseInt(e.target.value, 10))}
                className="w-full accent-amber-500 cursor-pointer"
              />

              <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                <span>Inicio (Bar 1)</span>
                {totalBarsInBeat > 8 && (
                  <span>Mitad (Bar {Math.floor(totalBarsInBeat / 2) + 1})</span>
                )}
                <span>Final (Bar {totalBarsInBeat})</span>
              </div>
            </div>
          )}
        </div>

        {/* Done Button */}
        <div className="mt-5">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs uppercase tracking-wider font-mono shadow-lg shadow-amber-500/20 active:scale-98 transition-all"
          >
            GUARDAR Y APLICAR LOOP
          </button>
        </div>
      </div>
    </div>
  );
};
