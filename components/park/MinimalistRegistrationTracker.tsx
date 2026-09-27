'use client';

import React, { useState, useEffect } from 'react';
import { ParkProject, RegistrationService, RegistrationStatus } from '@/lib/park/types';
import { ParkStorage } from '@/lib/park/storage';
import { ParkSupabaseService } from '@/lib/park/supabaseService';
import {
  CheckCircle2,
  Circle,
  Plus,
  PlaySquare,
  Shield,
  Radio,
  Disc,
  Headphones,
  Send,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Music,
  Check,
  AlertCircle,
  Compass,
  ListTodo,
  PartyPopper,
  ArrowRight,
  Info,
} from 'lucide-react';

interface StepDefinition {
  service: RegistrationService;
  stepNumber: number;
  name: string;
  shortDesc: string;
  whyFirst: string;
  whatToDo: string[];
  portalUrl: string;
  portalName: string;
  icon: React.ElementType;
  badge: string;
}

const REGISTRATION_STEPS: StepDefinition[] = [
  {
    service: 'youtube_content_id',
    stepNumber: 1,
    name: 'YouTube Copy / Content ID',
    shortDesc: 'Protege tu audio en YouTube para que nadie pueda adueñarse de tu música y cobres automáticamente regalías por videos ajenos.',
    whyFirst: 'Es lo primero que debes asegurar antes de compartir el tema públicamente o en redes para evitar reclamos falsos de terceros.',
    whatToDo: [
      'Entra a tu portal de distribución o administrador de derechos de YouTube.',
      'Sube el archivo de audio en formato WAV (sin masterizar con ruidos no originales).',
      'Activa la política de "Monetizar en todos los países" para generar ingresos con cada uso.',
    ],
    portalUrl: 'https://support.google.com/youtube/answer/2797370',
    portalName: 'YouTube Rights Manager / Distribuidora',
    icon: PlaySquare,
    badge: 'Paso 1 · Protección Digital',
  },
  {
    service: 'copyright_musical_work',
    stepNumber: 2,
    name: 'Copyright Oficial (Música y Composición)',
    shortDesc: 'Obtén el certificado legal de autoría ante el Registro Oficial de la Propiedad Intelectual o la U.S. Copyright Office.',
    whyFirst: 'Es el título de propiedad formal que demuestra que tú compusiste la melodía, acordes y estructura del tema.',
    whatToDo: [
      'Accede al portal oficial de Copyright (eCO en EE.UU. o Registro de la Propiedad en tu país).',
      'Selecciona registro de "Work of the Performing Arts" (Form PA) para composición y música.',
      'Adjunta el archivo de audio o partitura y guarda tu número de caso o solicitud.',
    ],
    portalUrl: 'https://eco.copyright.gov/',
    portalName: 'U.S. Copyright Office (eCO)',
    icon: Shield,
    badge: 'Paso 2 · Propiedad Legal',
  },
  {
    service: 'bmi',
    stepNumber: 3,
    name: 'BMI / Sociedad de Autores (Ejecución Pública)',
    shortDesc: 'Registra la obra en BMI (o ASCAP / SGAE) para cobrar regalías cuando suene en radio, televisión, conciertos y discotecas.',
    whyFirst: 'Cada vez que el tema suena en un lugar público o en streaming, tu sociedad de autores recauda tus regalías autorales.',
    whatToDo: [
      'Inicia sesión en tu cuenta de autor en BMI (o tu PRO local).',
      'Ve a "Register a Work" (Registrar Obra) y coloca el título exacto de la canción.',
      'Indica tu porcentaje de autor (ej: 100%) y tu editorial (Gamez Music / Publisher).',
    ],
    portalUrl: 'https://www.bmi.com/',
    portalName: 'Portal Oficial BMI',
    icon: Radio,
    badge: 'Paso 3 · Regalías de Autor',
  },
  {
    service: 'mlc',
    stepNumber: 4,
    name: 'The MLC (Regalías Mecánicas de Streaming)',
    shortDesc: 'The Mechanical Licensing Collective recauda las regalías mecánicas digitales obligatorias de Spotify, Apple Music y Amazon Music.',
    whyFirst: 'Son regalías mecánicas de reproducción digital. Es un dinero separado al de BMI que se pierde si no estás registrado.',
    whatToDo: [
      'Entra al portal de miembros de The MLC (The Mechanical Licensing Collective).',
      'Registra la obra vinculándola con tu código IPI o de BMI.',
      'Verifica que aparezcan los autores correctos y el 100% de la división autoral.',
    ],
    portalUrl: 'https://www.themlc.com/',
    portalName: 'The MLC Portal',
    icon: Disc,
    badge: 'Paso 4 · Streaming Mecánico',
  },
  {
    service: 'soundexchange',
    stepNumber: 5,
    name: 'SoundExchange (Regalías del Master)',
    shortDesc: 'Cobra regalías para el dueño de la grabación sonora cuando la música suena en radio por satélite, radio online y Pandora.',
    whyFirst: 'A diferencia de BMI que le paga a los compositores, SoundExchange le paga directamente al productor y dueño del master.',
    whatToDo: [
      'Ingresa a SoundExchange con tu cuenta de titular de grabaciones sonoras.',
      'Sube los metadatos de la grabación y asocia tu nombre artístico/productor (RGODBEAT).',
      'Confirma que eres el dueño del 100% del master.',
    ],
    portalUrl: 'https://www.soundexchange.com/',
    portalName: 'Portal SoundExchange',
    icon: Headphones,
    badge: 'Paso 5 · Derechos de Master',
  },
  {
    service: 'symphonic',
    stepNumber: 6,
    name: 'Distribución & Código ISRC / UPC',
    shortDesc: 'Asigna el código ISRC único de la grabación y programa el lanzamiento en todas las plataformas con tu distribuidora.',
    whyFirst: 'Es el paso final para que tu música esté oficialmente disponible en Spotify, Apple Music, TikTok e Instagram.',
    whatToDo: [
      'Entra a tu distribuidora (Symphonic, DistroKid o la que uses).',
      'Crea el lanzamiento con el título oficial, portada y archivo WAV.',
      'Genera u obtén el código ISRC para dejar la pista identificada de por vida.',
    ],
    portalUrl: 'https://symphonic.com/',
    portalName: 'Portal Distribuidora',
    icon: Send,
    badge: 'Paso 6 · Lanzamiento Mundial',
  },
];

export function MinimalistRegistrationTracker() {
  const [projects, setProjects] = useState<ParkProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [isClient, setIsClient] = useState(false);
  const [viewMode, setViewMode] = useState<'tutorial' | 'checklist'>('tutorial');
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [showAddTrackModal, setShowAddTrackModal] = useState(false);
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackType, setNewTrackType] = useState<'beat' | 'full_song'>('beat');
  const [refCodeInput, setRefCodeInput] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);

  // Load projects from local and cloud
  useEffect(() => {
    setIsClient(true);
    const localProjects = ParkStorage.getProjects();
    setProjects(localProjects);
    if (localProjects.length > 0) {
      setSelectedProjectId(localProjects[0].id);
    }

    // Background sync with Supabase
    ParkSupabaseService.getProjects().then((cloudProjects) => {
      if (cloudProjects && cloudProjects.length > 0) {
        setProjects(cloudProjects);
        setSelectedProjectId((prev) => prev || cloudProjects[0].id);
      }
    });
  }, []);

  const activeProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  // Set initial step to the first pending step when active project changes
  useEffect(() => {
    if (!activeProject) return;
    const firstPendingIdx = REGISTRATION_STEPS.findIndex((s) => {
      const st = activeProject.registrations?.[s.service]?.status;
      return st !== 'REGISTERED' && st !== 'VERIFIED';
    });
    if (firstPendingIdx >= 0) {
      setCurrentStepIndex(firstPendingIdx);
    } else {
      setCurrentStepIndex(0);
    }
  }, [selectedProjectId]);

  // Current active step in tutorial mode
  const currentStep = REGISTRATION_STEPS[currentStepIndex] || REGISTRATION_STEPS[0];
  const isCurrentStepChecked =
    activeProject?.registrations?.[currentStep.service]?.status === 'REGISTERED' ||
    activeProject?.registrations?.[currentStep.service]?.status === 'VERIFIED';

  // Toggle check/uncheck for a step
  const handleToggleCheck = async (service: RegistrationService, customRef?: string) => {
    if (!activeProject) return;

    const currentReg = activeProject.registrations?.[service];
    const isCurrentlyChecked = currentReg?.status === 'REGISTERED' || currentReg?.status === 'VERIFIED';
    const newStatus: RegistrationStatus = isCurrentlyChecked ? 'NOT_STARTED' : 'REGISTERED';

    const patch: any = {
      status: newStatus,
      registeredDate: newStatus === 'REGISTERED' ? new Date().toISOString() : undefined,
    };
    if (customRef) {
      patch.notes = customRef;
      patch.externalReferenceId = customRef;
    }

    // Update in local state & localStorage
    const updated = ParkStorage.updateRegistration(activeProject.id, service, patch);

    if (updated) {
      const newProjects = projects.map((p) => (p.id === updated.id ? updated : p));
      setProjects(newProjects);

      // Background sync to Supabase
      ParkSupabaseService.saveProject(updated).catch(console.error);
      ParkSupabaseService.logAuditEvent(
        updated.id,
        newStatus === 'REGISTERED' ? 'CHECKED' : 'UNCHECKED',
        'REGISTRATION',
        service,
        { newStatus, customRef }
      );

      // Check if all steps are now completed
      const allDone = REGISTRATION_STEPS.every((s) => {
        const st = s.service === service ? newStatus : updated.registrations?.[s.service]?.status;
        return st === 'REGISTERED' || st === 'VERIFIED';
      });

      if (allDone && newStatus === 'REGISTERED') {
        setShowCelebration(true);
      }
    }
  };

  // Complete current step and advance to next in tutorial mode
  const handleCompleteAndNext = async () => {
    await handleToggleCheck(currentStep.service, refCodeInput.trim() || undefined);
    setRefCodeInput('');

    // Advance to next step if available
    if (currentStepIndex < REGISTRATION_STEPS.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Add a new track with just a name (super fast & minimalist)
  const handleCreateTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTrackTitle.trim();
    if (!title) return;

    const slug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || `track-${Date.now()}`;

    const newProject: ParkProject = {
      id: `project-${Date.now()}`,
      slug,
      title: title.toUpperCase(),
      type: newTrackType,
      stage: newTrackType === 'beat' ? 'beat_instrumental' : 'full_song',
      bpm: 95,
      key: 'Am',
      scale: 'Minor',
      genre: 'Urban / Latin',
      producerName: 'RGODBEAT',
      masterOwnershipPercentage: 100,
      publishingOwnershipPercentage: 100,
      songwriters: ['Rafael Gámez'],
      publishers: ['Gamez Music'],
      splits: [
        {
          id: `split-${Date.now()}`,
          name: 'Rafael Gámez (RGODBEAT)',
          role: 'Producer',
          sharePercentage: 100,
          proAffiliation: 'BMI',
        },
      ],
      registrations: {
        youtube_content_id: { service: 'youtube_content_id', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        copyright_musical_work: { service: 'copyright_musical_work', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        bmi: { service: 'bmi', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        mlc: { service: 'mlc', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        soundexchange: { service: 'soundexchange', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        symphonic: { service: 'symphonic', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        copyright_sound_recording: { service: 'copyright_sound_recording', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        isrc: { service: 'isrc', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
        upc: { service: 'upc', status: 'NOT_STARTED', lastUpdated: new Date().toISOString() },
      },
      documents: [],
      auditHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const saved = ParkStorage.saveProject(newProject);
    setProjects([saved, ...projects]);
    setSelectedProjectId(saved.id);
    setCurrentStepIndex(0);
    setNewTrackTitle('');
    setShowAddTrackModal(false);
    setShowCelebration(false);

    // Sync to Supabase
    ParkSupabaseService.saveProject(saved).catch(console.error);
  };

  if (!isClient || !activeProject) {
    return (
      <div className="py-12 flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
      </div>
    );
  }

  // Calculate progress
  const totalSteps = REGISTRATION_STEPS.length;
  const completedCount = REGISTRATION_STEPS.filter((step) => {
    const status = activeProject.registrations?.[step.service]?.status;
    return status === 'REGISTERED' || status === 'VERIFIED';
  }).length;
  const pendingCount = totalSteps - completedCount;
  const percentCompleted = Math.round((completedCount / totalSteps) * 100);
  const StepIcon = currentStep.icon;

  return (
    <div className="w-full space-y-6">
      {/* Top Bar: Selector de Tema & Modo */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#0a0a10] p-3 sm:p-4 rounded-2xl border border-zinc-800/80 shadow-lg">
        {/* Track Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          <span className="text-[11px] font-mono font-bold text-zinc-500 uppercase tracking-wider px-2">
            Canción:
          </span>
          {projects.map((proj) => {
            const isSelected = proj.id === activeProject.id;
            return (
              <button
                key={proj.id}
                onClick={() => {
                  setSelectedProjectId(proj.id);
                  setShowCelebration(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold tracking-wide transition-all whitespace-nowrap flex items-center gap-2 ${
                  isSelected
                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/25 scale-[1.02]'
                    : 'bg-zinc-900/80 text-zinc-300 hover:text-white hover:bg-zinc-800 border border-zinc-800'
                }`}
              >
                <Music className={`w-3.5 h-3.5 ${isSelected ? 'text-black' : 'text-cyan-400'}`} />
                <span>{proj.title}</span>
                {proj.bpm && (
                  <span className={`text-[10px] ${isSelected ? 'text-black/70' : 'text-zinc-500'}`}>
                    {proj.bpm} BPM
                  </span>
                )}
              </button>
            );
          })}

          <button
            onClick={() => setShowAddTrackModal(true)}
            className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold text-cyan-400 bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-800/50 transition-all flex items-center gap-1.5 whitespace-nowrap shadow-sm"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>+ Registrar Canción</span>
          </button>
        </div>

        {/* View Mode Toggle: Tutorial vs Checklist */}
        <div className="flex items-center gap-1.5 bg-zinc-950 p-1 rounded-xl border border-zinc-800 self-end md:self-auto shrink-0">
          <button
            onClick={() => setViewMode('tutorial')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'tutorial'
                ? 'bg-cyan-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Modo Tutorial Guiado</span>
          </button>

          <button
            onClick={() => setViewMode('checklist')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
              viewMode === 'checklist'
                ? 'bg-cyan-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            <span>Ver Lista Completa</span>
          </button>
        </div>
      </div>

      {/* Progress Header Banner */}
      <div className="bg-gradient-to-r from-[#0c0c16] via-[#10101c] to-[#08080d] p-5 sm:p-6 rounded-3xl border border-zinc-800/90 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono font-bold text-cyan-400 uppercase tracking-widest bg-cyan-950/40 border border-cyan-800/40 px-2.5 py-0.5 rounded-full mb-1">
            <Sparkles className="w-3 h-3" />
            <span>REGISTRO SEGURO Y ORDENADO</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold font-mono text-white flex items-center gap-2">
            <span>Guía de Registro para:</span>
            <span className="text-cyan-400 underline decoration-cyan-500/50">{activeProject.title}</span>
          </h2>
        </div>

        <div className="flex items-center gap-4 min-w-[260px]">
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-400">Progreso:</span>
              <span className="text-cyan-400 font-bold">{completedCount} de {totalSteps} completados</span>
            </div>
            <div className="w-full bg-zinc-950 h-2.5 rounded-full overflow-hidden border border-zinc-800">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(34,211,238,0.5)]"
                style={{ width: `${percentCompleted}%` }}
              />
            </div>
          </div>

          <span className="text-sm font-mono font-black text-emerald-400 px-2.5 py-1 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
            {percentCompleted}%
          </span>
        </div>
      </div>

      {/* Celebration Card when 100% Complete */}
      {showCelebration && completedCount === totalSteps && (
        <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-br from-emerald-950/40 via-zinc-900 to-black border-2 border-emerald-500/50 shadow-2xl relative overflow-hidden animate-fadeIn">
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0 shadow-lg shadow-emerald-500/20">
              <PartyPopper className="w-8 h-8 text-emerald-400" />
            </div>
            <div className="space-y-1 text-center sm:text-left flex-1">
              <h3 className="text-xl sm:text-2xl font-black text-white font-mono">
                ¡ENHORABUENA! {activeProject.title} ESTÁ 100% REGISTRADA Y PROTEGIDA
              </h3>
              <p className="text-xs sm:text-sm text-zinc-300 font-sans max-w-2xl">
                Has completado los 6 registros oficiales: YouTube Copy, Copyright Federal, BMI, The MLC, SoundExchange y Distribución. Todos los datos están guardados de forma segura en Supabase.
              </p>
            </div>
            <button
              onClick={() => setShowAddTrackModal(true)}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs uppercase tracking-wider shadow-lg shrink-0"
            >
              + Registrar otra canción
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 1: MODO TUTORIAL GUIADO (PASO A PASO)                                */}
      {/* ========================================================================= */}
      {viewMode === 'tutorial' && (
        <div className="space-y-6">
          {/* Step Navigation Pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {REGISTRATION_STEPS.map((step, idx) => {
              const isStepDone =
                activeProject.registrations?.[step.service]?.status === 'REGISTERED' ||
                activeProject.registrations?.[step.service]?.status === 'VERIFIED';
              const isCurrent = idx === currentStepIndex;

              return (
                <button
                  key={step.service}
                  onClick={() => setCurrentStepIndex(idx)}
                  className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between min-h-[78px] ${
                    isCurrent
                      ? 'bg-cyan-950/50 border-cyan-400 shadow-lg shadow-cyan-500/15 ring-1 ring-cyan-400'
                      : isStepDone
                      ? 'bg-emerald-950/20 border-emerald-500/40 text-emerald-300'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
                      Paso {step.stepNumber}
                    </span>
                    {isStepDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Circle className={`w-3.5 h-3.5 ${isCurrent ? 'text-cyan-400 animate-pulse' : 'text-zinc-600'}`} />
                    )}
                  </div>
                  <span className={`text-xs font-mono font-bold truncate block ${isCurrent ? 'text-white' : ''}`}>
                    {step.name.split('/')[0].trim()}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Current Step Big Focused Card (Tutorial Box) */}
          <div className="bg-gradient-to-br from-[#10101e] via-[#0d0d17] to-[#07070b] p-6 sm:p-8 rounded-3xl border-2 border-cyan-500/40 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 blur-[110px] rounded-full pointer-events-none" />

            {/* Header of Step */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-zinc-800/80">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 text-cyan-400 shadow-md">
                  <StepIcon className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-cyan-400">
                    {currentStep.badge}
                  </span>
                  <h3 className="text-xl sm:text-2xl font-black font-mono text-white">
                    {currentStep.name}
                  </h3>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                {isCurrentStepChecked ? (
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-sm shadow-emerald-500/10">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>REGISTRO LISTO</span>
                  </span>
                ) : (
                  <span className="px-3.5 py-1.5 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                    <Circle className="w-3.5 h-3.5 animate-pulse" />
                    <span>PENDIENTE POR COMPLETAR</span>
                  </span>
                )}
              </div>
            </div>

            {/* Explanation & Steps to do */}
            <div className="py-6 space-y-6">
              {/* Short summary */}
              <div className="p-4 rounded-2xl bg-zinc-950/70 border border-zinc-850 space-y-1">
                <span className="text-[10px] font-mono uppercase text-zinc-500 font-bold tracking-wider">
                  ¿Para qué sirve este registro?
                </span>
                <p className="text-sm text-zinc-200 font-sans leading-relaxed">
                  {currentStep.shortDesc}
                </p>
                <p className="text-xs text-cyan-300/90 font-sans pt-1">
                  💡 <strong>Por qué se hace ahora:</strong> {currentStep.whyFirst}
                </p>
              </div>

              {/* Step by Step Instructions */}
              <div className="space-y-3">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                  <Info className="w-4 h-4 text-cyan-400" />
                  <span>Instrucciones paso a paso para completar este registro:</span>
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {currentStep.whatToDo.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-xs font-sans text-zinc-300 flex items-start gap-2.5"
                    >
                      <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold flex items-center justify-center shrink-0 text-[10px] border border-cyan-500/40">
                        {idx + 1}
                      </span>
                      <span className="leading-relaxed">{item}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Direct Link to Portal */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#09101a] border border-cyan-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-mono text-zinc-400">Paso 1: Abre la web oficial</span>
                  <div className="text-sm font-bold font-mono text-white flex items-center gap-2">
                    <span>Sitio oficial: {currentStep.portalName}</span>
                  </div>
                </div>

                <a
                  href={currentStep.portalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-mono font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 transition-all hover:scale-105 shrink-0"
                >
                  <span>Ir a la Web Oficial de Registro</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Optional Reference Code Input */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800">
                <span className="text-xs font-mono text-zinc-400 whitespace-nowrap">
                  Número de confirmación o nota (Opcional):
                </span>
                <input
                  type="text"
                  placeholder="Ej: SR0012934 o fecha..."
                  value={refCodeInput}
                  onChange={(e) => setRefCodeInput(e.target.value)}
                  className="flex-1 bg-zinc-900 border border-zinc-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
                />
              </div>
            </div>

            {/* Bottom Actions: Mark Complete & Move Next */}
            <div className="pt-6 border-t border-zinc-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {currentStepIndex > 0 && (
                  <button
                    onClick={() => setCurrentStepIndex(currentStepIndex - 1)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-white font-mono text-xs flex items-center gap-1.5 transition-all"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Paso Anterior</span>
                  </button>
                )}

                {currentStepIndex < REGISTRATION_STEPS.length - 1 && (
                  <button
                    onClick={() => setCurrentStepIndex(currentStepIndex + 1)}
                    className="px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white font-mono text-xs flex items-center gap-1.5 transition-all"
                  >
                    <span>Saltar a siguiente</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Big Main CTA Button */}
              <button
                onClick={handleCompleteAndNext}
                className={`w-full sm:w-auto px-7 py-3.5 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2.5 shadow-xl transition-all ${
                  isCurrentStepChecked
                    ? 'bg-zinc-800 hover:bg-red-500/20 hover:text-red-300 text-zinc-300 border border-zinc-700'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/30 scale-105'
                }`}
              >
                {isCurrentStepChecked ? (
                  <>
                    <Check className="w-4 h-4 stroke-[3]" />
                    <span>Ya está listo (Hacer clic para desmarcar)</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>✅ Ya finalicé este registro → Marcar Listo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* VISTA 2: LISTA COMPLETA DE TODOS LOS PASOS CON CHECKS                      */}
      {/* ========================================================================= */}
      {viewMode === 'checklist' && (
        <div className="space-y-3">
          {REGISTRATION_STEPS.map((step, idx) => {
            const regData = activeProject.registrations?.[step.service];
            const isChecked = regData?.status === 'REGISTERED' || regData?.status === 'VERIFIED';
            const Icon = step.icon;
            const hasNote = Boolean(regData?.notes || regData?.externalReferenceId);

            return (
              <div
                key={step.service}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                  isChecked
                    ? 'bg-[#091512]/70 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.06)]'
                    : 'bg-[#0b0b12]/90 border-zinc-800/90 hover:border-zinc-700 hover:bg-[#0e0e18]'
                }`}
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  {/* Big Checkbox */}
                  <button
                    onClick={() => handleToggleCheck(step.service)}
                    aria-label={`Marcar paso ${step.name}`}
                    className={`mt-0.5 w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 cursor-pointer ${
                      isChecked
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/30 scale-105 ring-2 ring-emerald-400/40'
                        : 'bg-zinc-900 border-2 border-zinc-700 hover:border-cyan-400 hover:bg-zinc-800 text-transparent'
                    }`}
                  >
                    <Check className={`w-4 h-4 stroke-[3] ${isChecked ? 'opacity-100' : 'opacity-0'}`} />
                  </button>

                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-mono font-bold tracking-widest text-zinc-500 uppercase">
                        PASO {step.stepNumber}
                      </span>
                      <span className="text-zinc-600">·</span>
                      <span className={`text-sm sm:text-base font-bold font-mono tracking-tight transition-colors ${
                        isChecked ? 'text-emerald-200 line-through decoration-emerald-500/50' : 'text-white'
                      }`}>
                        {step.name}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 hidden sm:inline">
                        {step.badge}
                      </span>
                    </div>

                    <p className="text-xs text-zinc-400 font-sans leading-relaxed">
                      {step.shortDesc}
                    </p>

                    <div className="pt-1 flex flex-wrap items-center gap-3 text-[11px] font-mono">
                      <a
                        href={step.portalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 hover:underline"
                      >
                        <span>Abrir {step.portalName}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>

                      <button
                        onClick={() => {
                          setCurrentStepIndex(idx);
                          setViewMode('tutorial');
                        }}
                        className="text-zinc-400 hover:text-white underline"
                      >
                        Ver tutorial guiado →
                      </button>
                    </div>

                    {hasNote && (
                      <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-zinc-900/90 border border-zinc-800 text-[11px] font-mono text-zinc-300">
                        <span className="text-zinc-500">Ref / Nota:</span>
                        <span className="text-cyan-300 font-bold">{regData?.notes || regData?.externalReferenceId}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Status */}
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isChecked ? (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>REGISTRADO</span>
                    </span>
                  ) : (
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
                      <Circle className="w-3.5 h-3.5 animate-pulse" />
                      <span>PENDIENTE</span>
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal para Registrar Nueva Canción */}
      {showAddTrackModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0e0e18] border border-zinc-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl relative">
            <h3 className="text-xl font-bold text-white font-mono mb-2 flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              <span>Registrar Nueva Canción</span>
            </h3>
            <p className="text-xs text-zinc-400 mb-6 font-sans">
              Solo coloca el nombre. El tutorial te guiará paso por paso por los 6 registros oficiales.
            </p>

            <form onSubmit={handleCreateTrack} className="space-y-4">
              <div>
                <label className="block text-xs font-mono font-bold text-zinc-300 uppercase mb-1.5">
                  Nombre de la Canción o Beat:
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: FANTASÍA, NOCHE EN MEDELLÍN, etc."
                  value={newTrackTitle}
                  onChange={(e) => setNewTrackTitle(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-cyan-400 font-mono"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-zinc-300 uppercase mb-1.5">
                  Tipo:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTrackType('beat')}
                    className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all ${
                      newTrackType === 'beat'
                        ? 'bg-cyan-500 text-black border-cyan-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    Beat / Instrumental
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTrackType('full_song')}
                    className={`py-2 px-3 rounded-xl text-xs font-mono font-bold border transition-all ${
                      newTrackType === 'full_song'
                        ? 'bg-cyan-500 text-black border-cyan-400'
                        : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-white'
                    }`}
                  >
                    Canción Completa
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowAddTrackModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-mono text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-mono font-bold bg-cyan-500 hover:bg-cyan-400 text-black transition-all shadow-lg shadow-cyan-500/25"
                >
                  Iniciar Tutorial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
