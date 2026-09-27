'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ParkNav } from '@/components/park/ParkNav';
import { SERVICE_METADATA } from '@/lib/park/engine';
import { RegistrationService, ParkProject, MasterProfile } from '@/lib/park/types';
import { ParkStorage } from '@/lib/park/storage';

export default function ParkRegistrationsPage() {
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedService, setExpandedService] = useState<RegistrationService | null>('copyright_musical_work');

  useEffect(() => {
    setProjects(ParkStorage.getProjects());
    setProfile(ParkStorage.getMasterProfile());
  }, []);

  const services = Object.entries(SERVICE_METADATA) as [RegistrationService, typeof SERVICE_METADATA[RegistrationService]][];

  const categories = [
    { id: 'all', label: 'Todos los Registros' },
    { id: 'Composition (Work)', label: 'Composición / Obra' },
    { id: 'Master (Sound Recording)', label: 'Master / Grabación' },
    { id: 'Distribution', label: 'Distribución & Códigos' },
    { id: 'Protection', label: 'Protección & Monetización' },
  ];

  const filteredServices = selectedCategory === 'all'
    ? services
    : services.filter(([_, meta]) => meta.category === selectedCategory);

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      <ParkNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 border-b border-slate-800/80 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono tracking-wider text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse"></span>
              ASSISTED REGISTRATION WORKFLOW • ZERO FAKE IDS
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Centro Oficial de Registros</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              The Park no simula registros falsos. Te indica exactamente qué registrar, cuándo aplica según la etapa, qué datos preparar y qué comprobante oficial traer de vuelta.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/park/profile"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-xs font-medium text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Ver Master Profile</span>
            </Link>
          </div>
        </div>

        {/* Categories Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Services Grid & Details */}
        <div className="space-y-4">
          {filteredServices.map(([serviceKey, meta]) => {
            const isExpanded = expandedService === serviceKey;

            // Find projects that have registered or pending on this service
            const registeredProjects = projects.filter((p) => p.registrations[serviceKey]?.status === 'REGISTERED' || p.registrations[serviceKey]?.status === 'VERIFIED');
            const pendingProjects = projects.filter((p) => p.registrations[serviceKey]?.status === 'READY_TO_REGISTER' || p.registrations[serviceKey]?.status === 'SUBMITTED');
            const notApplicableProjects = projects.filter((p) => p.registrations[serviceKey]?.status === 'NOT_APPLICABLE');

            return (
              <div
                key={serviceKey}
                className={`rounded-xl border transition-all duration-200 ${
                  isExpanded
                    ? 'bg-slate-900/90 border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                    : 'bg-slate-900/40 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Header Row */}
                <div
                  onClick={() => setExpandedService(isExpanded ? null : serviceKey)}
                  className="p-5 flex items-center justify-between cursor-pointer select-none"
                >
                  <div className="flex items-start md:items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shrink-0 text-cyan-400">
                      {serviceKey.includes('copyright') && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      )}
                      {(serviceKey === 'bmi' || serviceKey === 'mlc') && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      )}
                      {serviceKey === 'soundexchange' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 100-6 3 3 0 000 6z" />
                        </svg>
                      )}
                      {(serviceKey === 'isrc' || serviceKey === 'upc') && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                        </svg>
                      )}
                      {serviceKey === 'symphonic' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                      )}
                      {serviceKey === 'youtube_content_id' && (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-semibold text-white">{meta.name}</h2>
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/60">
                          {meta.category}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{meta.whatItIs}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex items-center gap-3 text-xs font-mono">
                      {registeredProjects.length > 0 && (
                        <span className="text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                          {registeredProjects.length} Registrado(s)
                        </span>
                      )}
                      {pendingProjects.length > 0 && (
                        <span className="text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded">
                          {pendingProjects.length} Pendiente(s)
                        </span>
                      )}
                      {notApplicableProjects.length > 0 && (
                        <span className="text-slate-500 bg-slate-800/40 border border-slate-700/40 px-2 py-0.5 rounded">
                          {notApplicableProjects.length} No Aplica Aún
                        </span>
                      )}
                    </div>

                    <div className="w-8 h-8 rounded-lg bg-slate-800/50 flex items-center justify-center text-slate-400">
                      <svg
                        className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-cyan-400' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-5 pb-6 pt-2 border-t border-slate-800/80 space-y-6 text-sm">
                    {/* 2-column info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-950/60 border border-slate-800/60 p-4 rounded-lg">
                        <div className="text-xs font-mono font-medium text-cyan-400 uppercase tracking-wider mb-1">
                          1. ¿Qué es este registro?
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{meta.whatItIs}</p>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800/60 p-4 rounded-lg">
                        <div className="text-xs font-mono font-medium text-amber-400 uppercase tracking-wider mb-1">
                          2. ¿Cuándo aplica según la etapa?
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{meta.whenItApplies}</p>
                      </div>
                    </div>

                    {/* Instructions & Return */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-950/60 border border-slate-800/60 p-4 rounded-lg">
                        <div className="text-xs font-mono font-medium text-indigo-400 uppercase tracking-wider mb-1">
                          3. Pasos que debes realizar
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{meta.whatToDo}</p>
                      </div>

                      <div className="bg-slate-950/60 border border-slate-800/60 p-4 rounded-lg">
                        <div className="text-xs font-mono font-medium text-emerald-400 uppercase tracking-wider mb-1">
                          4. Qué traer de vuelta a The Park
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed">{meta.whatToReturn}</p>
                      </div>
                    </div>

                    {/* Portal Link & Project Action */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2 border-t border-slate-800/60">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>Portal oficial:</span>
                        <a
                          href={meta.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-cyan-400 hover:text-cyan-300 hover:underline inline-flex items-center gap-1"
                        >
                          <span>{meta.officialUrl}</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      </div>

                      <div className="flex items-center gap-3 w-full sm:w-auto">
                        <a
                          href={meta.officialUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition-colors inline-flex items-center justify-center gap-2"
                        >
                          <span>Abrir Portal Oficial</span>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </a>
                        <Link
                          href="/park/projects/divina"
                          className="flex-1 sm:flex-initial px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors inline-flex items-center justify-center gap-1"
                        >
                          <span>Ver en Proyecto DIVINA</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
