"use client";

import React from 'react';
import { Play, Sparkles, Music, Mic, Clock, ShieldCheck, X } from 'lucide-react';

interface StartupProjectModalProps {
  isOpen: boolean;
  beatTitle?: string;
  takesCount: number;
  savedTimeText?: string;
  onContinueLastProject: () => void;
  onStartNewProject: () => void;
  onClose: () => void;
}

export const StartupProjectModal: React.FC<StartupProjectModalProps> = ({
  isOpen,
  beatTitle = 'Mi Beat',
  takesCount = 0,
  savedTimeText,
  onContinueLastProject,
  onStartNewProject,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#0f0f14] border border-zinc-800 p-6 shadow-2xl space-y-6 text-white overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-1">
            <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              RGODBEAT STUDIO SESIÓN
            </span>
            <h2 className="text-xl font-bold font-sans tracking-tight text-white">
              ¿Cómo deseas comenzar?
            </h2>
            <p className="text-xs text-zinc-400">
              Detectamos tu último proyecto de grabación activo.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Two Main Choice Cards */}
        <div className="space-y-3 relative z-10">
          {/* Card 1: Continuar Último Proyecto */}
          <button
            type="button"
            onClick={onContinueLastProject}
            className="w-full text-left p-4 rounded-2xl bg-gradient-to-br from-amber-500/15 via-zinc-900/90 to-zinc-900/90 border border-amber-500/40 hover:border-amber-400 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer shadow-lg shadow-amber-500/5 space-y-2.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-md">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                    Continuar Último Proyecto
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Mantener tomas y beat donde quedaste
                  </span>
                </div>
              </div>
              <span className="text-xs text-amber-400 font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                →
              </span>
            </div>

            {/* Project info details */}
            <div className="flex items-center gap-3 pt-1 text-xs font-mono text-zinc-300 border-t border-zinc-800/80">
              <span className="flex items-center gap-1 text-zinc-200">
                <Music className="w-3 h-3 text-amber-400" />
                <strong className="truncate max-w-[140px] text-white">{beatTitle}</strong>
              </span>
              <span className="flex items-center gap-1 text-emerald-400">
                <Mic className="w-3 h-3" />
                <span>{takesCount} {takesCount === 1 ? 'toma' : 'tomas'}</span>
              </span>
              {savedTimeText && (
                <span className="flex items-center gap-1 text-zinc-500 text-[10px] ml-auto">
                  <Clock className="w-2.5 h-2.5" />
                  <span>{savedTimeText}</span>
                </span>
              )}
            </div>
          </button>

          {/* Card 2: Iniciar Proyecto Nuevo */}
          <button
            type="button"
            onClick={onStartNewProject}
            className="w-full text-left p-4 rounded-2xl bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-200 group-hover:text-white flex items-center justify-center font-bold border border-zinc-700">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
                    Iniciar Proyecto Nuevo
                  </h3>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Comenzar limpio desde cero (sin mezclar voces)
                  </span>
                </div>
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-white font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                +
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-sans pl-10">
              Tus efectos favoritos se conservan. Tu proyecto guardado sigue a salvo en tu cuenta.
            </p>
          </button>
        </div>

        {/* Protection assurance */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-850 text-[10px] font-mono text-zinc-500 justify-center">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          <span>Tus proyectos están protegidos en tu cuenta sin riesgo de sobreescritura accidental</span>
        </div>
      </div>
    </div>
  );
};
