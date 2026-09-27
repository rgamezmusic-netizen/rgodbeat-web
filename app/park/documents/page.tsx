'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ParkNav } from '@/components/park/ParkNav';
import { ParkProject, ParkDocument, RegistrationService } from '@/lib/park/types';
import { ParkStorage } from '@/lib/park/storage';
import { SERVICE_METADATA } from '@/lib/park/engine';

export default function ParkDocumentsPage() {
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // New Doc Form
  const [targetProjectId, setTargetProjectId] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>('');
  const [docCategory, setDocCategory] = useState<ParkDocument['category']>('certificate');
  const [docService, setDocService] = useState<string>('');
  const [docFileName, setDocFileName] = useState<string>('');
  const [docNotes, setDocNotes] = useState<string>('');

  useEffect(() => {
    const projs = ParkStorage.getProjects();
    setProjects(projs);
    if (projs.length > 0) {
      setTargetProjectId(projs[0].id);
    }
  }, []);

  // Aggregate all documents from all projects
  const allDocuments: (ParkDocument & { projectTitle: string; projectSlug: string })[] = [];
  projects.forEach((proj) => {
    (proj.documents || []).forEach((doc) => {
      allDocuments.push({
        ...doc,
        projectTitle: proj.title,
        projectSlug: proj.slug,
      });
    });
  });

  const filteredDocs = allDocuments.filter((doc) => {
    const matchesProject = selectedProjectId === 'all' || doc.projectId === selectedProjectId;
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    return matchesProject && matchesCategory;
  });

  const handleCreateDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProjectId || !docTitle.trim()) return;

    ParkStorage.addDocument(targetProjectId, {
      title: docTitle.trim(),
      category: docCategory,
      service: docService ? (docService as RegistrationService) : undefined,
      fileName: docFileName.trim() || `${docTitle.trim().toLowerCase().replace(/\s+/g, '_')}.pdf`,
      fileUrl: '#',
      notes: docNotes.trim(),
    });

    // Refresh state
    setProjects(ParkStorage.getProjects());
    setShowAddModal(false);
    setDocTitle('');
    setDocFileName('');
    setDocNotes('');
  };

  const categories = [
    { id: 'all', label: 'Todos' },
    { id: 'certificate', label: 'Certificados de Registro' },
    { id: 'split_sheet', label: 'Split Sheets' },
    { id: 'contract', label: 'Contratos & Licencias' },
    { id: 'confirmation', label: 'Confirmaciones & Recibos' },
    { id: 'audio_master', label: 'Masters de Audio' },
    { id: 'artwork', label: 'Portadas / Artwork' },
  ];

  const getCategoryBadge = (category: ParkDocument['category']) => {
    switch (category) {
      case 'certificate':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">Certificado</span>;
      case 'split_sheet':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">Split Sheet</span>;
      case 'contract':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-950/60 text-purple-400 border border-purple-800/40">Contrato</span>;
      case 'confirmation':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-950/60 text-blue-400 border border-blue-800/40">Confirmación</span>;
      case 'audio_master':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-amber-950/60 text-amber-400 border border-amber-800/40">Audio Master</span>;
      case 'artwork':
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-pink-950/60 text-pink-400 border border-pink-800/40">Artwork</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700/40">{category}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30">
      <ParkNav />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8 border-b border-slate-800/80 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono tracking-wider text-cyan-400 bg-cyan-950/40 border border-cyan-800/50 px-2.5 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
              LEGAL VAULT • PROJECT-SCOPED RECORDS
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Bóveda de Documentos Legales</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-2xl">
              Certificados oficiales de Copyright, hojas de repartición de regalías (Split Sheets), contratos y comprobantes vinculados a cada proyecto de tu catálogo.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition-colors shadow-lg shadow-cyan-950/40"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Vincular Documento</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 mb-6">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Project selector */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono text-slate-400">Proyecto:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
            >
              <option value="all">Todos los proyectos ({projects.length})</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.stage.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Documents Table / List */}
        {filteredDocs.length === 0 ? (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/40 p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-4">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-white mb-1">No hay documentos con este filtro</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
              Adjunta un certificado oficial de la Oficina de Copyright, una split sheet firmada o una confirmación de registro a tu proyecto.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold text-xs transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Vincular Documento</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/40">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 border-b border-slate-800/80 text-slate-400 font-mono uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Categoría</th>
                  <th className="py-3 px-4">Proyecto</th>
                  <th className="py-3 px-4">Servicio Oficial</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredDocs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <p className="font-semibold text-white">{doc.title}</p>
                          <p className="text-[11px] font-mono text-slate-400">{doc.fileName}</p>
                          {doc.notes && <p className="text-[11px] text-slate-500 italic mt-0.5">{doc.notes}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      {getCategoryBadge(doc.category)}
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        href={`/park/projects/${doc.projectSlug}`}
                        className="text-cyan-400 hover:text-cyan-300 hover:underline font-medium"
                      >
                        {doc.projectTitle}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      {doc.service ? (
                        <span className="font-mono text-slate-300">
                          {SERVICE_METADATA[doc.service]?.name || doc.service}
                        </span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-400">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => alert(`Visualización de archivo: ${doc.fileName}\n(Enlace seguro a almacenamiento de proyecto: ${doc.fileUrl})`)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono transition-colors"
                      >
                        Ver Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* Add Document Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0b0f17] border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowAddModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h2 className="text-lg font-bold text-white mb-1">Vincular Documento Legal</h2>
            <p className="text-xs text-slate-400 mb-5">
              Los documentos en The Park pertenecen estrictamente al proyecto correspondiente para mantener una trazabilidad legal limpia.
            </p>

            <form onSubmit={handleCreateDocument} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-mono mb-1">Proyecto *</label>
                <select
                  value={targetProjectId}
                  onChange={(e) => setTargetProjectId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} ({p.stage})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">Título del Documento *</label>
                <input
                  type="text"
                  placeholder="ej. Certificado Copyright PA - Obra Musical DIVINA"
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-mono mb-1">Categoría</label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="certificate">Certificado Oficial</option>
                    <option value="split_sheet">Split Sheet</option>
                    <option value="contract">Contrato / Licencia</option>
                    <option value="confirmation">Confirmación / Recibo</option>
                    <option value="audio_master">Audio Master</option>
                    <option value="artwork">Portada / Artwork</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-mono mb-1">Servicio Relacionado</label>
                  <select
                    value={docService}
                    onChange={(e) => setDocService(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="">Ninguno / General</option>
                    <option value="copyright_musical_work">U.S. Copyright (PA)</option>
                    <option value="copyright_sound_recording">U.S. Copyright (SR)</option>
                    <option value="bmi">BMI</option>
                    <option value="mlc">The MLC</option>
                    <option value="soundexchange">SoundExchange</option>
                    <option value="isrc">ISRC</option>
                    <option value="upc">UPC</option>
                    <option value="symphonic">Symphonic</option>
                    <option value="youtube_content_id">YouTube Rights</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">Nombre del Archivo</label>
                <input
                  type="text"
                  placeholder="ej. US_Copyright_Divina_Cert.pdf"
                  value={docFileName}
                  onChange={(e) => setDocFileName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-mono mb-1">Notas / Observaciones</label>
                <textarea
                  rows={2}
                  placeholder="Número de registro otorgado, vigencia, notas legales..."
                  value={docNotes}
                  onChange={(e) => setDocNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold transition-colors"
                >
                  Guardar en Bóveda
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
