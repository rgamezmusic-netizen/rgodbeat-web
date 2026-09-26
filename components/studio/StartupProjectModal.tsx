"use client";

import React, { useRef } from 'react';
import { Play, Sparkles, Music, Mic, Clock, ShieldCheck, X, FolderOpen, Smartphone } from 'lucide-react';

interface StartupProjectModalProps {
  isOpen: boolean;
  beatTitle?: string;
  takesCount: number;
  savedTimeText?: string;
  onContinueLastProject: () => void;
  onStartNewProject: () => void;
  onOpenDeviceProject?: (file: File) => void;
  onClose: () => void;
}

export const StartupProjectModal: React.FC<StartupProjectModalProps> = ({
  isOpen,
  beatTitle = 'Mi Beat',
  takesCount = 0,
  savedTimeText,
  onContinueLastProject,
  onStartNewProject,
  onOpenDeviceProject,
  onClose,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onOpenDeviceProject) {
      onOpenDeviceProject(file);
    }
    // reset input so same file can be re-selected if needed
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <input
        ref={fileInputRef}
        type="file"
        accept=".rgodbeat,.json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="relative w-full max-w-md rounded-3xl bg-[#0f0f14] border border-zinc-800 p-6 shadow-2xl space-y-6 text-white overflow-hidden">
        {/* Glow ambient background */}
        <div className="absolute -top-24 -left-24 w-60 h-60 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-60 h-60 bg-purple-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Modal Header */}
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono tracking-widest uppercase text-amber-400 font-bold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
              RGODBEAT STUDIO SESIÓN
            </span>
            <h2 className="text-xl font-bold font-sans tracking-tight text-white">
              ¿Cómo deseas comenzar?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Choice Cards */}
        <div className="space-y-2 relative z-10">
          {/* Card 1: Continuar Último Proyecto */}
          <button
            type="button"
            onClick={onContinueLastProject}
            className="w-full text-left p-3.5 rounded-2xl bg-gradient-to-br from-amber-500/15 via-zinc-900/90 to-zinc-900/90 border border-amber-500/40 hover:border-amber-400 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer shadow-lg shadow-amber-500/5 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500 text-black flex items-center justify-center font-bold shadow-md shrink-0">
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white group-hover:text-amber-300 transition-colors">
                    Continuar Sesión
                  </h3>
                </div>
              </div>
              <span className="text-xs text-amber-400 font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                →
              </span>
            </div>

            {/* Project info details (minimal) */}
            <div className="flex items-center gap-2 pt-1 text-xs font-mono text-zinc-300 border-t border-zinc-800/80">
              <span className="flex items-center gap-1 text-zinc-200 min-w-0">
                <Music className="w-3 h-3 text-amber-400 shrink-0" />
                <strong className="truncate text-white">{beatTitle}</strong>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 ml-auto shrink-0 font-bold">
                {takesCount === 0 ? 'Beat listo' : `${takesCount} ${takesCount === 1 ? 'toma' : 'tomas'}`}
              </span>
            </div>
          </button>

          {/* Card 2: Abrir Proyecto Guardado en Móvil / PC */}
          {onOpenDeviceProject && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full text-left p-3.5 rounded-2xl bg-zinc-900/85 hover:bg-zinc-800/90 border border-zinc-800 hover:border-amber-500/40 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-950/70 border border-purple-500/40 text-purple-300 group-hover:text-purple-200 flex items-center justify-center font-bold shrink-0">
                    <FolderOpen className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors flex items-center gap-1.5">
                      Abrir Archivo
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 font-mono">
                        .rgodbeat
                      </span>
                    </h3>
                  </div>
                </div>
                <span className="text-xs text-purple-400 group-hover:text-purple-300 font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                  ↑
                </span>
              </div>
            </button>
          )}

          {/* Card 3: Iniciar Proyecto Nuevo */}
          <button
            type="button"
            onClick={onStartNewProject}
            className="w-full text-left p-3.5 rounded-2xl bg-zinc-900/70 hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-700 transition-all hover:scale-[1.01] active:scale-[0.99] group cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-zinc-800 text-zinc-200 group-hover:text-white flex items-center justify-center font-bold border border-zinc-700 shrink-0">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-zinc-200 group-hover:text-white transition-colors">
                    Nuevo Proyecto
                  </h3>
                </div>
              </div>
              <span className="text-xs text-zinc-500 group-hover:text-white font-mono font-bold group-hover:translate-x-0.5 transition-transform">
                +
              </span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
