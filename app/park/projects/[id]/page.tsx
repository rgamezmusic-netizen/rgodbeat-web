'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ParkNav } from '@/components/park/ParkNav';
import { ProjectLifecycleBar } from '@/components/park/ProjectLifecycleBar';
import { RegistrationChecklist } from '@/components/park/RegistrationChecklist';
import { ParkStorage } from '@/lib/park/storage';
import { ParkProject, ProjectStage, RegistrationService, RegistrationStatus, MasterProfile, CollaboratorSplit } from '@/lib/park/types';
import { analyzeProject } from '@/lib/park/engine';
import {
  ArrowLeft,
  ShieldCheck,
  Disc3,
  Music2,
  Clock,
  FileText,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  AlertTriangle,
  History,
  Upload,
} from 'lucide-react';

interface ProjectPageProps {
  params: Promise<{ id: string }>;
}

export default function ProjectControlCenterPage({ params }: ProjectPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  const [project, setProject] = useState<ParkProject | null>(null);
  const [profile, setProfile] = useState<MasterProfile | null>(null);
  const [isClient, setIsClient] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'registrations' | 'info' | 'splits' | 'documents' | 'audit'>('registrations');

  // Edit states for info & splits
  const [editTitle, setEditTitle] = useState('');
  const [editBpm, setEditBpm] = useState(120);
  const [editKey, setEditKey] = useState('C');
  const [editGenre, setEditGenre] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editArtist, setEditArtist] = useState('');
  const [editIsrc, setEditIsrc] = useState('');
  const [editUpc, setEditUpc] = useState('');
  const [splits, setSplits] = useState<CollaboratorSplit[]>([]);
  const [saveToast, setSaveToast] = useState(false);

  // New Document upload mock state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docTitle, setDocTitle] = useState('');
  const [docCategory, setDocCategory] = useState<any>('certificate');
  const [docFileName, setDocFileName] = useState('');

  useEffect(() => {
    setIsClient(true);
    const prof = ParkStorage.getMasterProfile();
    setProfile(prof);

    const proj = ParkStorage.getProjectBySlug(resolvedParams.id);
    if (proj) {
      setProject(proj);
      setEditTitle(proj.title);
      setEditBpm(proj.bpm);
      setEditKey(proj.key);
      setEditGenre(proj.genre);
      setEditNotes(proj.notes || '');
      setEditArtist(proj.primaryArtistName || '');
      setEditIsrc(proj.isrc || '');
      setEditUpc(proj.upc || '');
      setSplits(proj.splits || []);
    }
  }, [resolvedParams.id]);

  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#07070a] text-white flex items-center justify-center font-mono">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans">
        <ParkNav />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
          <h2 className="text-2xl font-bold font-mono text-zinc-300">Proyecto no encontrado</h2>
          <p className="text-xs text-zinc-500 font-mono">
            No se encontró ningún registro para "{resolvedParams.id}".
          </p>
          <Link
            href="/park/catalog"
            className="inline-flex px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-cyan-300"
          >
            ← Volver al Catálogo
          </Link>
        </main>
      </div>
    );
  }

  const analysis = analyzeProject(project, profile);

  // Advance stage handler
  const handleStageChange = (newStage: ProjectStage) => {
    const updated = ParkStorage.updateProjectStage(project.id, newStage, profile?.email || 'rgodbeat@gmail.com');
    if (updated) {
      setProject({ ...updated });
    }
  };

  // Update registration handler
  const handleUpdateRegistration = (
    service: RegistrationService,
    patch: {
      status: RegistrationStatus;
      externalReferenceId?: string;
      registrationNumber?: string;
      notes?: string;
    }
  ) => {
    const updated = ParkStorage.updateRegistration(
      project.id,
      service,
      patch,
      profile?.email || 'rgodbeat@gmail.com'
    );
    if (updated) {
      setProject({ ...updated });
    }
  };

  // Save metadata & splits
  const handleSaveInfo = () => {
    const updatedProject: ParkProject = {
      ...project,
      title: editTitle.trim() || project.title,
      bpm: editBpm || project.bpm,
      key: editKey.trim() || project.key,
      genre: editGenre.trim() || project.genre,
      notes: editNotes.trim(),
      primaryArtistName: editArtist.trim() || undefined,
      isrc: editIsrc.trim() || undefined,
      upc: editUpc.trim() || undefined,
      splits,
    };

    const saved = ParkStorage.saveProject(updatedProject);
    setProject({ ...saved });
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2000);
  };

  // Add collaborator split
  const handleAddSplit = () => {
    const newSplit: CollaboratorSplit = {
      id: `split-${Date.now()}`,
      name: '',
      role: 'Songwriter',
      sharePercentage: 0,
      ipiNumber: '',
      proAffiliation: 'BMI',
      email: '',
    };
    setSplits([...splits, newSplit]);
  };

  const handleRemoveSplit = (splitId: string) => {
    setSplits(splits.filter((s) => s.id !== splitId));
  };

  // Add document
  const handleAddDocument = (e: React.FormEvent) => {
    e.preventDefault();
    if (!docTitle.trim() || !docFileName.trim()) return;

    const updated = ParkStorage.addDocument(
      project.id,
      {
        title: docTitle.trim(),
        category: docCategory,
        fileName: docFileName.trim(),
        fileUrl: '#',
      },
      profile?.email || 'rgodbeat@gmail.com'
    );

    if (updated) {
      setProject({ ...updated });
      setShowDocModal(false);
      setDocTitle('');
      setDocFileName('');
    }
  };

  const totalSplit = splits.reduce((acc, curr) => acc + (Number(curr.sharePercentage) || 0), 0);

  return (
    <div className="min-h-screen bg-[#07070a] text-white flex flex-col font-sans selection:bg-cyan-500/30 selection:text-white">
      <ParkNav />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6">
        {/* Back Link */}
        <Link
          href="/park/catalog"
          className="inline-flex items-center gap-1.5 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al Catálogo</span>
        </Link>

        {/* Project Header Card */}
        <div className="bg-gradient-to-r from-[#0d0d16] via-[#10101c] to-[#0a0a0f] p-6 sm:p-8 rounded-3xl border border-zinc-800 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[200px] bg-cyan-500/10 blur-[90px] rounded-full pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 uppercase">
                  {project.type.toUpperCase()} · {analysis.stageLabel.toUpperCase()}
                </span>
                <span className="text-xs font-mono text-zinc-400">
                  Productor: <strong className="text-white">{project.producerName}</strong>
                </span>
                {project.primaryArtistName && (
                  <span className="text-xs font-mono text-zinc-400">
                    · Artista: <strong className="text-white">{project.primaryArtistName}</strong>
                  </span>
                )}
              </div>

              <h1 className="text-3xl sm:text-5xl font-extrabold font-display tracking-tight text-white flex items-center gap-3">
                <span>{project.title}</span>
              </h1>

              <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-zinc-400 pt-1">
                <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  {project.bpm} BPM
                </span>
                <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Tono: {project.key} {project.scale || ''}
                </span>
                <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">
                  Género: {project.genre}
                </span>
                {project.isrc && (
                  <span className="bg-emerald-950/60 text-emerald-300 px-2 py-0.5 rounded border border-emerald-500/40 font-bold">
                    ISRC: {project.isrc}
                  </span>
                )}
              </div>
            </div>

            {/* Next Action Box */}
            <div className="p-4 rounded-2xl bg-[#141420] border border-cyan-500/30 max-w-sm space-y-1">
              <span className="text-[10px] font-mono uppercase text-cyan-400 font-bold block">
                Siguiente Acción Inmediata:
              </span>
              <p className="text-xs text-white font-medium">
                {analysis.nextAction}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic Lifecycle Progression Bar */}
        <ProjectLifecycleBar
          currentStage={project.stage}
          onAdvanceStage={handleStageChange}
        />

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-zinc-800 pb-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveTab('registrations')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'registrations'
                ? 'bg-cyan-500 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Derechos y Registros ({analysis.readinessPercentage}%)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'info'
                ? 'bg-cyan-500 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Metadatos del Proyecto
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('splits')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'splits'
                ? 'bg-cyan-500 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Splits / Co-Autores ({splits.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('documents')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'documents'
                ? 'bg-cyan-500 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Documentos ({project.documents?.length || 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('audit')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-cyan-500 text-black font-black shadow-md'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            Historial de Auditoría
          </button>
        </div>

        {/* Tab 1: Dynamic Registration Checklist */}
        {activeTab === 'registrations' && (
          <div className="bg-[#0c0c14] border border-zinc-800 p-6 rounded-3xl shadow-xl">
            <RegistrationChecklist
              project={project}
              profile={profile}
              onUpdateRegistration={handleUpdateRegistration}
            />
          </div>
        )}

        {/* Tab 2: Metadata Info */}
        {activeTab === 'info' && (
          <div className="bg-[#0c0c14] border border-zinc-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  INFORMACIÓN GENERAL
                </span>
                <h3 className="text-base font-bold font-mono text-white">Metadatos Musicales y Técnicos</h3>
              </div>

              <button
                type="button"
                onClick={handleSaveInfo}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saveToast ? '¡Guardado!' : 'Guardar Cambios'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Título del Proyecto</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">BPM (Tempo)</label>
                <input
                  type="number"
                  value={editBpm}
                  onChange={(e) => setEditBpm(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Tonalidad / Escala</label>
                <input
                  type="text"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Género</label>
                <input
                  type="text"
                  value={editGenre}
                  onChange={(e) => setEditGenre(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Artista Principal (Si aplica)</label>
                <input
                  type="text"
                  placeholder="Ej. Nombre del vocalista..."
                  value={editArtist}
                  onChange={(e) => setEditArtist(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Código ISRC (Master)</label>
                <input
                  type="text"
                  placeholder="US-QZ... (Sólo si está asignado)"
                  value={editIsrc}
                  onChange={(e) => setEditIsrc(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Notas de Producción y Derechos</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400 resize-none"
              />
            </div>
          </div>
        )}

        {/* Tab 3: Collaborator Splits */}
        {activeTab === 'splits' && (
          <div className="bg-[#0c0c14] border border-zinc-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-850 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  REPARTO DE AUTORÍA Y PRODUCCIÓN
                </span>
                <h3 className="text-base font-bold font-mono text-white">Split Sheet Oficial (Composición y Master)</h3>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs font-mono font-bold px-3 py-1 rounded-xl border ${
                  totalSplit === 100
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                }`}>
                  Total: {totalSplit}% {totalSplit === 100 ? '✓ Cuadrado' : '≠ Debe ser 100%'}
                </span>

                <button
                  type="button"
                  onClick={handleAddSplit}
                  className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-750 text-cyan-300 border border-cyan-500/30 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Añadir Co-Autor</span>
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {splits.map((split, index) => (
                <div
                  key={split.id}
                  className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex flex-col sm:flex-row items-center gap-3"
                >
                  <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div>
                      <label className="block text-[9px] font-mono text-zinc-500 uppercase">Nombre Legal</label>
                      <input
                        type="text"
                        placeholder="Nombre y Apellidos..."
                        value={split.name}
                        onChange={(e) => {
                          const updated = [...splits];
                          updated[index].name = e.target.value;
                          setSplits(updated);
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-zinc-950 border border-zinc-750 text-white font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-zinc-500 uppercase">Rol</label>
                      <select
                        value={split.role}
                        onChange={(e) => {
                          const updated = [...splits];
                          updated[index].role = e.target.value as any;
                          setSplits(updated);
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-zinc-950 border border-zinc-750 text-white font-mono text-xs"
                      >
                        <option value="Producer">Producer</option>
                        <option value="Songwriter">Songwriter</option>
                        <option value="Composer">Composer</option>
                        <option value="Recording Artist">Recording Artist</option>
                        <option value="Publisher">Publisher</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-zinc-500 uppercase">IPI / CAE #</label>
                      <input
                        type="text"
                        placeholder="Ej. 00123456789"
                        value={split.ipiNumber || ''}
                        onChange={(e) => {
                          const updated = [...splits];
                          updated[index].ipiNumber = e.target.value;
                          setSplits(updated);
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-zinc-950 border border-zinc-750 text-white font-mono text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[9px] font-mono text-zinc-500 uppercase">Porcentaje (%)</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={split.sharePercentage}
                        onChange={(e) => {
                          const updated = [...splits];
                          updated[index].sharePercentage = Number(e.target.value);
                          setSplits(updated);
                        }}
                        className="w-full h-9 px-2.5 rounded-lg bg-zinc-950 border border-zinc-750 text-cyan-300 font-bold font-mono text-xs"
                      />
                    </div>
                  </div>

                  {splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSplit(split.id)}
                      className="text-zinc-600 hover:text-red-400 p-2 rounded-lg transition-colors cursor-pointer self-end sm:self-center"
                      title="Eliminar co-autor"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleSaveInfo}
                className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-md active:scale-95 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Guardar Splits</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 4: Documents */}
        {activeTab === 'documents' && (
          <div className="bg-[#0c0c14] border border-zinc-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                  BÓVEDA DE DOCUMENTOS
                </span>
                <h3 className="text-base font-bold font-mono text-white">Certificados, Acuerdos y Comprobantes</h3>
              </div>

              <button
                type="button"
                onClick={() => setShowDocModal(true)}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Adjuntar Documento</span>
              </button>
            </div>

            {(!project.documents || project.documents.length === 0) ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-zinc-800 rounded-2xl">
                <FileText className="w-8 h-8 text-zinc-600 mx-auto" />
                <p className="text-xs font-mono text-zinc-400">No hay documentos adjuntos a este proyecto aún.</p>
                <p className="text-[11px] text-zinc-600">Adjunta certificados de copyright, split sheets firmadas o confirmaciones de BMI/Symphonic.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {project.documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText className="w-5 h-5 text-cyan-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold font-mono text-white truncate">{doc.title}</div>
                        <span className="text-[10px] font-mono text-zinc-500 block truncate">
                          {doc.category} · {doc.fileName}
                        </span>
                      </div>
                    </div>

                    <span className="text-[9px] font-mono text-zinc-500 px-2 py-0.5 rounded bg-zinc-950 border border-zinc-850 shrink-0">
                      {new Date(doc.uploadedAt).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Audit History */}
        {activeTab === 'audit' && (
          <div className="bg-[#0c0c14] border border-zinc-800 p-6 sm:p-8 rounded-3xl shadow-xl space-y-6">
            <div className="border-b border-zinc-850 pb-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 font-bold">
                AUDITORÍA INMUTABLE
              </span>
              <h3 className="text-base font-bold font-mono text-white">Registro de Cambios y Derechos</h3>
            </div>

            <div className="space-y-3">
              {(!project.auditHistory || project.auditHistory.length === 0) ? (
                <p className="text-xs font-mono text-zinc-500 py-6 text-center">Sin eventos registrados aún.</p>
              ) : (
                project.auditHistory.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-3.5 rounded-xl bg-zinc-900/40 border border-zinc-850 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="text-zinc-300">{ev.description}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 shrink-0">
                      <span>{ev.userEmail}</span>
                      <span>·</span>
                      <span>{new Date(ev.timestamp).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Modal: Attach Document */}
        {showDocModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
            <form onSubmit={handleAddDocument} className="w-full max-w-md bg-[#0e0e16] border border-zinc-700 p-6 rounded-3xl shadow-2xl space-y-4">
              <h3 className="text-sm font-bold font-mono uppercase text-white">Adjuntar Documento Legal</h3>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Nombre / Título</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Split Sheet Firmada..."
                  value={docTitle}
                  onChange={(e) => setDocTitle(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Categoría</label>
                <select
                  value={docCategory}
                  onChange={(e) => setDocCategory(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                >
                  <option value="certificate">Certificado Oficial (Copyright / BMI)</option>
                  <option value="split_sheet">Split Sheet / Hoja de Reparto</option>
                  <option value="contract">Contrato / Acuerdo de Licencia</option>
                  <option value="confirmation">Confirmación de Registro</option>
                  <option value="artwork">Arte de Portada</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-mono text-zinc-400 uppercase mb-1">Nombre de Archivo / Referencia</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. DIVINA_SplitSheet_Signed.pdf"
                  value={docFileName}
                  onChange={(e) => setDocFileName(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-zinc-900 border border-zinc-750 text-white font-mono text-xs focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDocModal(false)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-mono text-zinc-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase"
                >
                  Guardar Documento
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
