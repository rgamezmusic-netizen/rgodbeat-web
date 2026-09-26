import React from 'react';
import { X } from 'lucide-react';

interface CountInOverlayProps {
  beatNumber: number; // 1, 2, 3, 4
  onCancel?: () => void;
}

export const CountInOverlay: React.FC<CountInOverlayProps> = ({ beatNumber, onCancel }) => {
  if (beatNumber <= 0 || beatNumber > 4) return null;

  return (
    <div
      onClick={onCancel}
      onTouchStart={onCancel}
      role="button"
      tabIndex={0}
      title="Toca cualquier parte de la pantalla para cancelar el conteo"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md cursor-pointer select-none animate-in fade-in duration-100"
    >
      <div className="text-center flex flex-col items-center pointer-events-auto">
        <p className="text-xs uppercase font-mono tracking-widest text-amber-400 font-bold mb-3 animate-pulse">
          PREPÁRATE · CONTEO DE 1 COMPÁS
        </p>

        {/* Huge Tactile Metronome Number */}
        <div
          key={beatNumber}
          className="text-8xl sm:text-9xl font-extrabold font-display text-white tracking-tighter drop-shadow-[0_0_35px_rgba(245,158,11,0.5)] transform scale-110 transition-transform duration-150"
        >
          {beatNumber}
        </div>

        {/* 4 dots indicator */}
        <div className="flex items-center justify-center gap-3 mt-6">
          {[1, 2, 3, 4].map((b) => (
            <div
              key={b}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                b === beatNumber
                  ? 'bg-amber-400 scale-125 shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                  : b < beatNumber
                  ? 'bg-amber-600'
                  : 'bg-zinc-800'
              }`}
            />
          ))}
        </div>

        {/* Tactile cancel hint banner */}
        <div className="mt-8 flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-900/95 border border-zinc-700/80 text-zinc-300 text-xs font-mono shadow-2xl active:scale-95 transition-all">
          <X className="w-4 h-4 text-red-400" />
          <span>Toca en cualquier parte para cancelar</span>
        </div>
      </div>
    </div>
  );
};

