'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ParkNav } from '@/components/park/ParkNav';
import { ParkStorage } from '@/lib/park/storage';
import { ParkProject, MasterProfile } from '@/lib/park/types';
import { analyzeProject } from '@/lib/park/engine';
import {
  ShieldCheck,
  FolderKanban,
  FileText,
  Plus,
  ArrowRight,
  Disc3,
  Music2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';

export default function ParkDashboardPage() {
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setProfile(ParkStorage.getMasterProfile());
    setProjects(ParkStorage.getProjects());
  }, []);

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#07070a] text-white flex items-center justify-center font-mono">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
      </div>
    );
  }

  // Statistics
  const beatsCount = projects.filter((p) => p.stage === 'beat_instrumental').length;
  const songsCount = projects.filter((p) => p.stage === 'full_song').length;
  const mastersCount = projects.filter((p) => p.stage === 'final_master' || p.stage === 'isrc_assigned').length;
  const releaseCount = projects.filter((p) => p.stage === 'release_ready' || p.stage === 'distributed').length;

  // Primary Golden Test Project (DIVINA)
  const divinaProject = projects.find((p) => p.slug === 'divina') || projects[0];
  const divinaAnalysis = divinaProject ? analyzeProject(divinaProject, profile) : null;

  return (
    <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <ParkNav />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8">
        {/* Top Header / Status Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#0d0d16] via-[#10101c] to-[#0a0a0f] p-6 sm:p-8 rounded-3xl border border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-cyan-500/10 blur-[90px] rounded-full pointer-events-none" />

          <div className="relative z-10 space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-[11px] font-mono tracking-widest text-cyan-300 uppercase">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>THE PARK // MASTER RIGHTS & RELEASE CONTROL</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight font-display text-white">
              Centro de Control de Derechos y Lanzamientos
            </h1>

            <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal">
              Entiende exactamente qué tienes, qué información falta, qué registros aplican y cuál es tu siguiente paso antes de lanzar tu música al mundo.
            </p>
          </div>

          <div className="relative z-10 flex flex-wrap items-center gap-3 shrink-0">
            <Link
              href="/park/catalog"
              className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-850 border border-zinc-700/80 text-zinc-200 hover:text-white font-mono text-xs font-bold transition-all flex items-center gap-2"
            >
              <FolderKanban className="w-4 h-4 text-cyan-400" />
              <span>Ver Catálogo</span>
            </Link>

            <Link
              href="/park/profile"
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95 transition-all"
            >
              <span>Master Profile</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* 4 Overview Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">01. Beats / Pistas</span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-white">{beatsCount}</div>
            <p className="text-[11px] text-zinc-500 font-mono">Instrumentales de productor</p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">02. Canciones</span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-cyan-400">{songsCount}</div>
            <p className="text-[11px] text-zinc-500 font-mono">Obras con letra y autores</p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">03. Masters / ISRC</span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400">{mastersCount}</div>
            <p className="text-[11px] text-zinc-500 font-mono">Fonogramas masterizados</p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-zinc-900/60 border border-zinc-800 space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">04. Lanzamientos</span>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">{releaseCount}</div>
            <p className="text-[11px] text-zinc-500 font-mono">Symphonic Distribution</p>
          </div>
        </div>

        {/* Featured Test Project Spotlight: DIVINA */}
        {divinaProject && divinaAnalysis && (
          <div className="p-6 sm:p-8 rounded-3xl bg-[#0b0b12] border border-cyan-500/30 shadow-2xl space-y-6 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-850 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 uppercase">
                    PROYECTO ACTIVO EN EL RADAR
                  </span>
                  <span className="text-xs font-mono text-zinc-400">
                    Etapa: <strong className="text-white">{divinaAnalysis.stageLabel}</strong>
                  </span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-bold font-display text-white flex items-center gap-3">
                  <span>{divinaProject.title}</span>
                  <span className="text-xs font-mono font-normal text-zinc-400 bg-zinc-900 px-2 py-0.5 rounded-md border border-zinc-800">
                    {divinaProject.bpm} BPM · {divinaProject.key} {divinaProject.scale}
                  </span>
                </h2>
              </div>

              <Link
                href={`/park/projects/${divinaProject.slug}`}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95 self-start sm:self-auto"
              >
                <span>Abrir Control de Derechos</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Quick Status Cards for DIVINA */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-850 space-y-1">
                <span className="text-[10px] uppercase text-zinc-500 font-bold">Estado Legal</span>
                <div className="text-sm font-bold text-zinc-200">BEAT / INSTRUMENTAL</div>
                <p className="text-[11px] text-zinc-400 font-sans">
                  No se confunde con una canción completa ni un master lanzado. No requiere ISRC ni UPC aún.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-850 space-y-1">
                <span className="text-[10px] uppercase text-zinc-500 font-bold">Siguiente Acción Clara</span>
                <div className="text-sm font-bold text-cyan-300">
                  {divinaAnalysis.nextAction}
                </div>
                <p className="text-[11px] text-zinc-400 font-sans">
                  El sistema recalculará los requisitos automáticamente cuando evolucione.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-850 space-y-1">
                <span className="text-[10px] uppercase text-zinc-500 font-bold">Completitud Aplicable</span>
                <div className="text-sm font-bold text-emerald-400">
                  {divinaAnalysis.readinessPercentage}% AL DÍA
                </div>
                <p className="text-[11px] text-zinc-400 font-sans">
                  Solo se evalúan los servicios que aplican a esta etapa actual.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Master Profile Callout: Enter Once -> Reuse Everywhere */}
        <div className="p-6 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm sm:text-base font-bold text-white font-mono flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Principio The Park: Ingresa tus datos una sola vez</span>
            </h3>
            <p className="text-xs text-zinc-400 max-w-2xl font-sans leading-relaxed">
              Tu IPI/CAE, afiliación a BMI, The MLC, SoundExchange y editora (Gamez Music) se sincronizan automáticamente en todos tus proyectos para que nunca tengas que reescribirlos.
            </p>
          </div>

          <Link
            href="/park/profile"
            className="px-4 py-2 rounded-xl bg-zinc-850 hover:bg-zinc-800 border border-zinc-700 text-xs font-mono font-bold text-cyan-300 transition-colors shrink-0"
          >
            Editar Master Profile →
          </Link>
        </div>
      </main>
    </div>
  );
}
