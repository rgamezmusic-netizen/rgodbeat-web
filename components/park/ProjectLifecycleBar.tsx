'use client';

import React from 'react';
import { ProjectStage } from '@/lib/park/types';
import { STAGE_CONFIG } from '@/lib/park/engine';
import { CheckCircle2, ChevronRight, ArrowUpRight } from 'lucide-react';

interface ProjectLifecycleBarProps {
  currentStage: ProjectStage;
  onAdvanceStage?: (newStage: ProjectStage) => void;
  readOnly?: boolean;
}

const STAGES: ProjectStage[] = [
  'beat_instrumental',
  'full_song',
  'final_master',
  'isrc_assigned',
  'release_ready',
  'distributed',
];

export function ProjectLifecycleBar({
  currentStage,
  onAdvanceStage,
  readOnly = false,
}: ProjectLifecycleBarProps) {
  const currentIndex = STAGES.indexOf(currentStage);

  return (
    <div className="w-full bg-[#0c0c14] border border-zinc-800/90 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-zinc-850 pb-3">
        <div>
          <span className="text-[10px] font-mono tracking-widest text-cyan-400 uppercase font-bold">
            CICLO DE VIDA DE LA OBRA Y EL MASTER
          </span>
          <h3 className="text-sm sm:text-base font-bold text-white font-mono flex items-center gap-2">
            <span>Etapa Actual:</span>
            <span className="text-cyan-300 font-extrabold">{STAGE_CONFIG[currentStage].label}</span>
          </h3>
        </div>

        {!readOnly && onAdvanceStage && currentIndex < STAGES.length - 1 && (
          <button
            type="button"
            onClick={() => onAdvanceStage(STAGES[currentIndex + 1])}
            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer self-start sm:self-auto"
          >
            <span>Evolucionar a: {STAGE_CONFIG[STAGES[currentIndex + 1]].label}</span>
            <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* Stepper Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STAGES.map((stageKey, idx) => {
          const config = STAGE_CONFIG[stageKey];
          const isCompleted = idx < currentIndex;
          const isCurrent = idx === currentIndex;
          const isFuture = idx > currentIndex;

          return (
            <div
              key={stageKey}
              onClick={() => {
                if (!readOnly && onAdvanceStage) {
                  onAdvanceStage(stageKey);
                }
              }}
              className={`p-2.5 rounded-xl border flex flex-col justify-between transition-all select-none ${
                isCurrent
                  ? 'bg-cyan-950/40 border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50'
                  : isCompleted
                  ? 'bg-zinc-900/60 border-emerald-500/40 opacity-90'
                  : 'bg-zinc-950/40 border-zinc-850 opacity-40 hover:opacity-75'
              } ${!readOnly && onAdvanceStage ? 'cursor-pointer hover:border-zinc-700' : ''}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1.5">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded ${
                  isCurrent
                    ? 'bg-cyan-500 text-black'
                    : isCompleted
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-zinc-800 text-zinc-500'
                }`}>
                  0{idx + 1}
                </span>

                {isCompleted && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                {isCurrent && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
              </div>

              <span className={`text-xs font-bold font-mono tracking-tight leading-tight ${
                isCurrent ? 'text-white' : isCompleted ? 'text-zinc-200' : 'text-zinc-500'
              }`}>
                {config.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] font-mono text-zinc-400 bg-zinc-950/80 p-2.5 rounded-xl border border-zinc-850">
        💡 <strong className="text-zinc-200">Regla de The Park:</strong> {STAGE_CONFIG[currentStage].description}
      </p>
    </div>
  );
}
