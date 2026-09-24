import React from 'react';
import { X, Sliders } from 'lucide-react';
import { BeatFX } from '@/lib/studio/types/audio';

interface BeatFXModalProps {
  fx: BeatFX;
  onClose: () => void;
  onChangeFX: (newFX: BeatFX) => void;
  onReset: () => void;
}

export const BeatFXModal: React.FC<BeatFXModalProps> = ({
  fx,
  onClose,
  onChangeFX,
  onReset,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-[#111115] border border-zinc-800 rounded-t-3xl sm:rounded-2xl shadow-2xl p-5 text-white">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-850">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-amber-400" />
            <h3 className="text-base font-bold font-display uppercase tracking-wide">
              BEAT FILTER & FX
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
          {/* LOW PASS FILTER */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  LOW PASS FILTER
                </p>
                <p className="text-[10px] text-zinc-500">Muffled / underwater club effect</p>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {fx.lowPass >= 19000 ? 'OPEN' : `${Math.round(fx.lowPass)} Hz`}
              </span>
            </div>
            <input
              type="range"
              min="200"
              max="20000"
              step="100"
              value={fx.lowPass}
              onChange={(e) =>
                onChangeFX({ ...fx, lowPass: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-1">
              <span>Deep Muffled (200Hz)</span>
              <span>Open (20kHz)</span>
            </div>
          </div>

          {/* HIGH PASS FILTER */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                  HIGH PASS FILTER
                </p>
                <p className="text-[10px] text-zinc-500">Cuts sub bass & 808 for vocal room</p>
              </div>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {fx.highPass <= 25 ? 'FLAT' : `${Math.round(fx.highPass)} Hz`}
              </span>
            </div>
            <input
              type="range"
              min="20"
              max="2000"
              step="20"
              value={fx.highPass}
              onChange={(e) =>
                onChangeFX({ ...fx, highPass: parseFloat(e.target.value) })
              }
              className="w-full"
            />
            <div className="flex justify-between text-[9px] font-mono text-zinc-500 mt-1">
              <span>Full Bass (20Hz)</span>
              <span>Thin / Radio (2kHz)</span>
            </div>
          </div>

          {/* BEAT VOLUME */}
          <div className="p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold font-mono uppercase tracking-wider text-amber-300">
                BEAT MASTER VOLUME
              </span>
              <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                {Math.round(fx.volume * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={fx.volume}
              onChange={(e) =>
                onChangeFX({ ...fx, volume: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-5 flex gap-2">
          <button
            onClick={onReset}
            className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-mono text-xs font-semibold transition-all"
          >
            Reset Filters
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-mono text-xs font-bold transition-all shadow-md"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
