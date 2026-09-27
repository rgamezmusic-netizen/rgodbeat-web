'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ParkNav } from '@/components/park/ParkNav';
import { ParkStorage } from '@/lib/park/storage';
import { ParkProject, ProjectStage, MasterProfile } from '@/lib/park/types';
import { STAGE_CONFIG, analyzeProject } from '@/lib/park/engine';
import {
  FolderKanban,
  Search,
  Plus,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  AlertCircle,
  Disc3,
  X,
} from 'lucide-react';

export default function ParkCatalogPage() {
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');

  // New Beat Modal state
  const [showNewModal, setShowNewModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBpm, setNewBpm] = useState(120);
  const [newKey, setNewKey] = useState('C');
  const [newGenre, setNewGenre] = useState('Trap / Urban');
  const [newNotes, setNewNotes] = useState('');

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

  // Filter logic (UNLIMITED CATALOG SUPPORT)
  const filteredProjects = projects.filter((project) => {
    const matchesSearch =
      project.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.producerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.genre.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStage = stageFilter === 'all' || project.stage === stageFilter;

    return matchesSearch && matchesStage;
  });

  const handleCreateBeat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const created = ParkStorage.createProjectFromBeat(
      {
        title: newTitle.trim(),
        bpm: newBpm || 120,
        key: newKey.trim() || 'C',
        genre: newGenre.trim() || 'Urban',
        notes: newNotes.trim(),
      },
      profile || undefined
    );

    setProjects(ParkStorage.getProjects());
    setShowNewModal(false);
    setNewTitle('');
    setNewNotes('');
  };

  return (
    <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <ParkNav />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-500/30">
                CATÁLOGO UNIFICADO // CAPACIDAD ILIMITADA
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-white">
              Catálogo de Obras y Masters
            </h1>
            <p className="text-xs text-zinc-400 font-sans mt-0.5">
              Administra todas tus creaciones sin límites artificiales. Desde el beat instrumental inicial hasta la entrega final a Symphonic.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg active:scale-95 transition-all self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Proyecto / Beat</span>
          </button>
        </div>

        {/* Search & Stage Filter Bar */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por título, productor, género..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-zinc-950 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Stage Filters */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar pt-1 sm:pt-0">
            <button
              type="button"
              onClick={() => setStageFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                stageFilter === 'all' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
              }`}
            >
              Todos ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => setStageFilter('beat_instrumental')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                stageFilter === 'beat_instrumental' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
              }`}
            >
              Beats ({projects.filter((p) => p.stage === 'beat_instrumental').length})
            </button>
            <button
              type="button"
              onClick={() => setStageFilter('full_song')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                stageFilter === 'full_song' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
              }`}
            >
              Canciones ({projects.filter((p) => p.stage === 'full_song').length})
            </button>
            <button
              type="button"
              onClick={() => setStageFilter('final_master')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                stageFilter === 'final_master' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
              }`}
            >
              Masters ({projects.filter((p) => p.stage === 'final_master' || p.stage === 'isrc_assigned').length})
            </button>
            <button
              type="button"
              onClick={() => setStageFilter('release_ready')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer whitespace-nowrap ${
                stageFilter === 'release_ready' ? 'bg-cyan-500 text-black' : 'text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-800'
              }`}
            >
              Lanzamientos ({projects.filter((p) => p.stage === 'release_ready' || p.stage === 'distributed').length})
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((proj) => {
            const analysis = analyzeProject(proj, profile);

            return (
              <Link
                key={proj.id}
                href={`/park/projects/${proj.slug}`}
                className="group p-5 rounded-3xl bg-[#0c0c14] border border-zinc-800 hover:border-cyan-500/50 hover:bg-[#0f0f18] transition-all flex flex-col justify-between space-y-4 shadow-xl select-none"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-300 border border-cyan-500/30 uppercase">
                      {STAGE_CONFIG[proj.stage].label}
                    </span>

                    <span className="text-[10px] font-mono text-zinc-500">
                      {proj.bpm} BPM · {proj.key} {proj.scale || ''}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-xl font-bold font-display text-white group-hover:text-cyan-300 transition-colors truncate">
                      {proj.title}
                    </h3>
                    <p className="text-xs font-mono text-zinc-400 truncate mt-0.5">
                      Productor: {proj.producerName}
                      {proj.primaryArtistName ? ` · Artista: ${proj.primaryArtistName}` : ''}
                    </p>
                  </div>

                  {/* Siguiente Acción */}
                  <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-850 space-y-1">
                    <span className="text-[9px] font-mono uppercase text-zinc-500 font-bold block">
                      Siguiente Acción:
                    </span>
                    <p className="text-[11px] text-zinc-300 font-medium line-clamp-2">
                      {analysis.nextAction}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-zinc-850 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-500">Preparación:</span>
                    <span className="text-cyan-400 font-bold">{analysis.readinessPercentage}%</span>
                  </div>

                  <span className="text-zinc-500 group-hover:text-cyan-300 flex items-center gap-1 font-bold transition-colors">
                    <span>Gestionar</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Modal: Fast Create Beat */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <form onSubmit={handleCreateBeat} className="w-full max-w-lg bg-[#0e0e16] border border-zinc-700 p-6 sm:p-8 rounded-3xl shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <h3 className="text-base font-bold font-mono uppercase text-white">Registrar Nuevo Beat en The Park</h3>
                <button type="button" onClick={() => setShowNewModal(false)} className="text-zinc-500 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Título del Beat / Instrumental</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. MIDNIGHT SUN..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">BPM (Tempo)</label>
                  <input
                    type="number"
                    value={newBpm}
                    onChange={(e) => setNewBpm(Number(e.target.value))}
                    className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Tonalidad / Escala</label>
                  <input
                    type="text"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Género</label>
                <input
                  type="text"
                  value={newGenre}
                  onChange={(e) => setNewGenre(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Notas de Producción</label>
                <textarea
                  rows={2}
                  placeholder="Idea, estado o notas de sesión..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full p-2.5 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase shadow-md active:scale-95"
                >
                  Indexar en Catálogo
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
