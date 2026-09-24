import React, { useRef, useState, useEffect } from 'react';
import { playKnobClickSound } from '@/lib/studio/audio/pitchCorrection';

interface TuneKnobProps {
  speed: number; // 0.0 to 1.0 (0 is OFF / Clicked detent)
  onChangeSpeed: (newSpeed: number) => void;
  audioCtx?: AudioContext | null;
}

export const TuneKnob: React.FC<TuneKnobProps> = ({
  speed,
  onChangeSpeed,
  audioCtx,
}) => {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startSpeed, setStartSpeed] = useState(speed);
  const wasOffRef = useRef<boolean>(speed <= 0.01);

  // Knob rotation angle: -135deg (0 / OFF) to +135deg (100% / Hard)
  const angle = -135 + speed * 270;
  const isOff = speed <= 0.01;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    setStartY(e.clientY);
    setStartSpeed(speed);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaY = startY - e.clientY; // drag up to increase, drag down to decrease
    const sensitivity = 0.006;
    let newSpeed = Math.max(0, Math.min(1, startSpeed + deltaY * sensitivity));

    // Detent snapping behavior around 0
    if (newSpeed < 0.06) {
      newSpeed = 0;
    }

    // Trigger audio click and haptic when crossing 0 threshold
    if (newSpeed === 0 && !wasOffRef.current) {
      wasOffRef.current = true;
      playKnobClickSound(audioCtx, false);
    } else if (newSpeed > 0 && wasOffRef.current) {
      wasOffRef.current = false;
      playKnobClickSound(audioCtx, true);
    }

    onChangeSpeed(Math.round(newSpeed * 100) / 100);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      setIsDragging(false);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  const setPresetSpeed = (preset: number) => {
    if (preset === 0 && !wasOffRef.current) {
      wasOffRef.current = true;
      playKnobClickSound(audioCtx, false);
    } else if (preset > 0 && wasOffRef.current) {
      wasOffRef.current = false;
      playKnobClickSound(audioCtx, true);
    }
    onChangeSpeed(preset);
  };

  // Speed descriptive labels
  const getSpeedDescription = (val: number) => {
    if (val <= 0.01) return 'APAGADO (BYPASS)';
    if (val < 0.35) return 'NATURAL / SUTIL';
    if (val < 0.75) return 'POP MODERNO';
    if (val < 0.95) return 'URBAN TRAP';
    return 'HARD TUNE (TRAVIS / T-PAIN)';
  };

  return (
    <div className="flex flex-col items-center">
      {/* Knob Dial Container */}
      <div className="relative flex items-center justify-center select-none py-2">
        {/* Outer Circular Scale Ring */}
        <div className="relative w-28 h-28 rounded-full bg-[#181820] border-2 border-zinc-700 shadow-inner flex items-center justify-center">
          {/* Circular Tick Marks */}
          <div className="absolute inset-0 pointer-events-none">
            {/* OFF / Detent mark at -135deg (Bottom Left) */}
            <div
              className="absolute left-3 bottom-4 text-[9px] font-mono font-bold text-red-400 -rotate-45"
              title="Posición de apagado con click"
            >
              OFF
            </div>
            {/* 100% mark at +135deg (Bottom Right) */}
            <div className="absolute right-3 bottom-4 text-[9px] font-mono font-bold text-amber-400 rotate-45">
              MAX
            </div>
            {/* Top 50% mark */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 text-[8px] font-mono text-zinc-500">
              50%
            </div>
          </div>

          {/* Interactive Rotatable Knob Core */}
          <div
            ref={knobRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-20 h-20 rounded-full cursor-ns-resize shadow-2xl relative flex items-center justify-center transition-transform duration-75 active:scale-98 ${
              isOff
                ? 'bg-gradient-to-b from-zinc-800 to-zinc-950 border border-zinc-700'
                : 'bg-gradient-to-b from-amber-600/30 via-zinc-800 to-zinc-900 border border-amber-500/60 shadow-[0_0_20px_rgba(245,158,11,0.25)]'
            }`}
            style={{
              transform: `rotate(${angle}deg)`,
            }}
          >
            {/* Brushed metallic face texture */}
            <div className="w-16 h-16 rounded-full bg-zinc-900/90 border border-zinc-700/80 flex items-center justify-center">
              {/* Center Status LED */}
              <div
                className={`w-3 h-3 rounded-full transition-all ${
                  isOff
                    ? 'bg-zinc-700 border border-zinc-600'
                    : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.9)] animate-pulse'
                }`}
              />
            </div>

            {/* Indicator Needle Notch */}
            <div
              className={`absolute top-1.5 w-1.5 h-4 rounded-full ${
                isOff ? 'bg-zinc-500' : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]'
              }`}
            />
          </div>
        </div>

        {/* Tactile Detent Switch Sound Notification Icon */}
        <div className="absolute -bottom-1">
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase border shadow-sm transition-all ${
              isOff
                ? 'bg-red-950/70 text-red-400 border-red-500/40'
                : 'bg-emerald-950/70 text-emerald-300 border-emerald-500/40'
            }`}
          >
            {isOff ? 'CLICK: OFF' : `${Math.round(speed * 100)}% SPEED`}
          </span>
        </div>
      </div>

      {/* Speed Style Description */}
      <div className="mt-3 text-center">
        <p
          className={`text-xs font-mono font-bold tracking-wider ${
            isOff ? 'text-zinc-500' : 'text-amber-300'
          }`}
        >
          {getSpeedDescription(speed)}
        </p>
        <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
          {isOff
            ? 'Gira la perilla hacia arriba para encender'
            : 'Desliza hacia abajo hasta 0 para apagar con click'}
        </p>
      </div>

      {/* Quick Speed Preset Buttons */}
      <div className="flex items-center gap-1.5 mt-3">
        <button
          onClick={() => setPresetSpeed(0)}
          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
            isOff
              ? 'bg-red-500 text-white shadow-sm'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
          }`}
          title="Apagar corrector (Click en 0)"
        >
          OFF
        </button>
        <button
          onClick={() => setPresetSpeed(0.25)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-medium transition-all ${
            speed === 0.25
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
          }`}
        >
          25% Suave
        </button>
        <button
          onClick={() => setPresetSpeed(0.7)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-medium transition-all ${
            speed === 0.7
              ? 'bg-amber-500 text-black font-bold'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
          }`}
        >
          70% Trap
        </button>
        <button
          onClick={() => setPresetSpeed(1.0)}
          className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all ${
            speed === 1.0
              ? 'bg-amber-500 text-black'
              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700'
          }`}
        >
          100% Hard
        </button>
      </div>
    </div>
  );
};
