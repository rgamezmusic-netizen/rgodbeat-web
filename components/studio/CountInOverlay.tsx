import React from 'react';

interface CountInOverlayProps {
  beatNumber: number; // 1, 2, 3, 4
}

export const CountInOverlay: React.FC<CountInOverlayProps> = ({ beatNumber }) => {
  if (beatNumber <= 0 || beatNumber > 4) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md pointer-events-none animate-in fade-in duration-100">
      <div className="text-center">
        <p className="text-xs uppercase font-mono tracking-widest text-amber-400 font-bold mb-3 animate-pulse">
          GET READY · 1 BAR COUNT-IN
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
      </div>
    </div>
  );
};
