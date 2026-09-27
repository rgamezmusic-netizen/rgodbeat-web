/**
 * THE PARK — REGISTRATION & LIFECYCLE DEPENDENCY ENGINE
 * 
 * Dynamically recalculates applicable rights, requirements, and next actions
 * based purely on real facts and project stages. Never invents values.
 */

import {
  ParkProject,
  ProjectStage,
  RegistrationService,
  RegistrationStatus,
  MasterProfile,
} from './types';

export interface ServiceGuidance {
  service: RegistrationService;
  name: string;
  category: 'Composition (Work)' | 'Master (Sound Recording)' | 'Distribution' | 'Protection';
  whatItIs: string;
  whenItApplies: string;
  officialUrl: string;
  requiredFields: string[];
  missingFields: string[];
  whatToDo: string;
  whatToReturn: string;
  currentStatus: RegistrationStatus;
}

export interface ProjectAnalysis {
  stage: ProjectStage;
  stageLabel: string;
  readinessPercentage: number;
  overallStatus: 'BEAT_IN_CATALOG' | 'COMPOSITION_IN_PROGRESS' | 'MASTER_READY' | 'RELEASE_READY' | 'SUBMITTED' | 'RELEASED';
  nextAction: string;
  services: ServiceGuidance[];
}

/**
 * Service definitions & educational metadata
 */
export const SERVICE_METADATA: Record<RegistrationService, {
  name: string;
  category: 'Composition (Work)' | 'Master (Sound Recording)' | 'Distribution' | 'Protection';
  whatItIs: string;
  whenItApplies: string;
  officialUrl: string;
  whatToDo: string;
  whatToReturn: string;
}> = {
  copyright_musical_work: {
    name: 'U.S. Copyright Office (Form PA)',
    category: 'Composition (Work)',
    whatItIs: 'Protección legal federal sobre la composición subyacente (melodía, acordes, ritmo y estructura de la obra).',
    whenItApplies: 'Aplica desde que la obra existe en forma tangible. Puede registrarse como obra musical instrumental o canción completa.',
    officialUrl: 'https://eco.copyright.gov/',
    whatToDo: 'Accede al portal eCO de la Oficina de Copyright de EE.UU. Inicia una solicitud de "Work of the Performing Arts" (PA), declara autoría y abona la tasa oficial ($45-$65).',
    whatToReturn: 'Número de solicitud (Application / Case #) y Certificado oficial de registro con el número SR/PA otorgado.',
  },
  copyright_sound_recording: {
    name: 'U.S. Copyright Office (Form SR)',
    category: 'Master (Sound Recording)',
    whatItIs: 'Protección federal sobre la fijación sonora específica (el audio grabado y masterizado).',
    whenItApplies: 'Aplica cuando existe una grabación final y definitiva que se desea proteger como master fonográfico.',
    officialUrl: 'https://eco.copyright.gov/',
    whatToDo: 'Presenta el Formulario SR a través del portal eCO adjuntando el archivo WAV definitivo del master.',
    whatToReturn: 'Número de caso de la solicitud y certificado de registro SR.',
  },
  bmi: {
    name: 'BMI (Broadcast Music, Inc.)',
    category: 'Composition (Work)',
    whatItIs: 'Sociedad de gestión de derechos de ejecución pública (PRO) en EE.UU. Recauda regalías cuando la música suena en radio, TV, streaming y conciertos.',
    whenItApplies: 'Aplica a Obras Musicales / Canciones Completas con compositores, letristas y editoras definidas con IPI/CAE.',
    officialUrl: 'https://www.bmi.com/',
    whatToDo: 'Ingresa a tu cuenta de BMI Online Services > Works Registration. Da de alta la obra con su título, autores, editora (RGODBEAT / Gamez Music) y splits del 100%.',
    whatToReturn: 'Número de trabajo de BMI (BMI Work #).',
  },
  mlc: {
    name: 'The MLC (Mechanical Licensing Collective)',
    category: 'Composition (Work)',
    whatItIs: 'Organización designada por la ley estadounidense (MMA) para recaudar y liquidar regalías mecánicas digitales (Spotify, Apple Music, Amazon).',
    whenItApplies: 'Aplica a composiciones/obras que están o estarán disponibles en servicios de streaming interactivo.',
    officialUrl: 'https://www.themlc.com/',
    whatToDo: 'Inicia sesión en The MLC Portal > Register New Work. Ingresa los datos de los compositores y editora para asegurar las regalías mecánicas en EE.UU.',
    whatToReturn: 'Número de obra MLC (The MLC Song Code).',
  },
  soundexchange: {
    name: 'SoundExchange',
    category: 'Master (Sound Recording)',
    whatItIs: 'Recauda regalías digitales no interactivas (Pandora, SiriusXM, radio por internet) para los dueños del master y artistas ejecutantes.',
    whenItApplies: 'Aplica únicamente a masters terminados que son objeto de difusión digital.',
    officialUrl: 'https://www.soundexchange.com/',
    whatToDo: 'Registra la grabación fonográfica (Sound Recording) en SXDirect vinculando el ISRC y la titularidad del master.',
    whatToReturn: 'ID de grabación en SoundExchange y confirmación de alta en el catálogo.',
  },
  isrc: {
    name: 'ISRC (International Standard Recording Code)',
    category: 'Master (Sound Recording)',
    whatItIs: 'La huella digital internacional única e irrepetible de una grabación de audio específica.',
    whenItApplies: 'Aplica cuando existe el master final terminado de la canción o beat listo para lanzarse.',
    officialUrl: 'https://www.usisrc.org/',
    whatToDo: 'Asigna un código ISRC desde tu cuenta de registrador oficial o a través de tu distribuidora (Symphonic). Estructura: CC-XXX-YY-NNNNN.',
    whatToReturn: 'El código ISRC exacto de 12 caracteres alfanuméricos asignado a este master.',
  },
  upc: {
    name: 'UPC / EAN (Código de Barras de Lanzamiento)',
    category: 'Distribution',
    whatItIs: 'Identificador comercial de producto para el single, EP o álbum completo en tiendas digitales.',
    whenItApplies: 'Aplica cuando el proyecto pasa a etapa de LANZAMIENTO comercial.',
    officialUrl: 'https://symphonic.com/',
    whatToDo: 'Generado por tu distribuidora (Symphonic) al crear el lanzamiento o provisto por tu sello.',
    whatToReturn: 'Código numérico de 12 o 13 dígitos de barra comercial.',
  },
  symphonic: {
    name: 'Symphonic Distribution',
    category: 'Distribution',
    whatItIs: 'Plataforma oficial de distribución digital a más de 200 plataformas (Spotify, Apple Music, TikTok, etc.).',
    whenItApplies: 'Aplica cuando el master, portada, ISRC, créditos y metadatos están 100% listos para entrega.',
    officialUrl: 'https://symphonic.com/',
    whatToDo: 'Crea el lanzamiento en el Symphonic Dashboard, sube el audio WAV 24-bit 48kHz, la portada 3000x3000px y rellena los metadatos completos.',
    whatToReturn: 'ID de lanzamiento en Symphonic (Release ID) y fecha de confirmación de entrega.',
  },
  youtube_content_id: {
    name: 'YouTube Content ID & Rights Management',
    category: 'Protection',
    whatItIs: 'Sistema de huella digital de audio de Google para reclamar y monetizar videos donde suene tu música.',
    whenItApplies: 'Aplica solo si posees derechos EXCLUSIVOS del master y composición (sin samples no autorizados, no aplicable a beats vendidos no-exclusivamente).',
    officialUrl: 'https://symphonic.com/youtube/',
    whatToDo: 'Verificar elegibilidad con Symphonic Rights Management antes de habilitar Content ID para evitar huelgas o reclamos indebidos a licenciatarios.',
    whatToReturn: 'Estado de habilitación de Content ID y Asset ID de YouTube.',
  },
};

/**
 * Stage labels & progression
 */
export const STAGE_CONFIG: Record<ProjectStage, { label: string; stepNumber: number; description: string }> = {
  beat_instrumental: {
    stepNumber: 1,
    label: 'Beat / Instrumental',
    description: 'Pista instrumental creada por el productor. Lista para catálogo, cesión o desarrollo vocal.',
  },
  full_song: {
    stepNumber: 2,
    label: 'Canción Completa',
    description: 'Composición con letra, melodías vocales, letristas y porcentajes (splits) definidos.',
  },
  final_master: {
    stepNumber: 3,
    label: 'Master Definitivo',
    description: 'Grabación de audio mezclada y masterizada a estándar comercial (WAV 24-bit).',
  },
  isrc_assigned: {
    stepNumber: 4,
    label: 'ISRC Asignado',
    description: 'Código de identificación internacional asignado a la grabación fonográfica.',
  },
  release_ready: {
    stepNumber: 5,
    label: 'Listo para Lanzamiento',
    description: 'Metadatos comerciales, arte de tapa y UPC preparados para distribución.',
  },
  distributed: {
    stepNumber: 6,
    label: 'Distribuido en Symphonic',
    description: 'Entregado a tiendas digitales y plataformas de streaming.',
  },
};

/**
 * Dependency Engine: Recalculates requirements and status according to stage and real data
 */
export function analyzeProject(project: ParkProject, profile?: MasterProfile | null): ProjectAnalysis {
  const stage = project.stage;
  const stageInfo = STAGE_CONFIG[stage];

  const services: ServiceGuidance[] = [];

  // 1. U.S. COPYRIGHT - MUSICAL WORK
  {
    const meta = SERVICE_METADATA.copyright_musical_work;
    const reg = project.registrations.copyright_musical_work;
    const missing: string[] = [];
    if (!project.title) missing.push('Título de la obra');
    if (!project.producerName && !profile?.legalName) missing.push('Nombre legal del autor/compositor');
    if (project.stage !== 'beat_instrumental' && (!project.songwriters || project.songwriters.length === 0)) {
      missing.push('Nombres de autores / compositores');
    }

    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';
    if (reg?.registrationNumber) {
      status = 'REGISTERED';
    } else if (reg?.externalReferenceId) {
      status = 'SUBMITTED';
    } else if (missing.length > 0) {
      status = 'MISSING_INFORMATION';
    } else {
      status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'copyright_musical_work',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Título', 'Autores Legales', 'Porcentaje de titularidad', 'Año de creación'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 2. U.S. COPYRIGHT - SOUND RECORDING
  {
    const meta = SERVICE_METADATA.copyright_sound_recording;
    const reg = project.registrations.copyright_sound_recording;
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';
    const missing: string[] = [];

    if (stage === 'beat_instrumental') {
      // If it's just an unreleased beat without master protection decision
      if (!reg?.registrationNumber && !reg?.externalReferenceId) {
        status = 'NOT_APPLICABLE';
      }
    } else {
      if (!project.audioMasterUrl) missing.push('Archivo WAV del master definitivo');
      if (reg?.registrationNumber) status = 'REGISTERED';
      else if (reg?.externalReferenceId) status = 'SUBMITTED';
      else if (missing.length > 0) status = 'MISSING_INFORMATION';
      else status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'copyright_sound_recording',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Master WAV', 'Titular del Fonograma', 'Fecha de fijación'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 3. BMI (Broadcast Music, Inc.)
  {
    const meta = SERVICE_METADATA.bmi;
    const reg = project.registrations.bmi;
    const missing: string[] = [];

    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';

    if (stage === 'beat_instrumental') {
      // PRO registration does NOT apply to a raw unreleased instrumental beat
      status = 'NOT_APPLICABLE';
    } else {
      if (!profile?.ipiCaeNumber) missing.push('IPI / CAE del compositor (Perfil)');
      if (!profile?.proMemberId) missing.push('Número de cuenta BMI del compositor');
      if (!project.splits || project.splits.length === 0) missing.push('Split Sheet / Reparto de Composición (100%)');

      if (reg?.registrationNumber) status = 'REGISTERED';
      else if (reg?.externalReferenceId) status = 'SUBMITTED';
      else if (missing.length > 0) status = 'MISSING_INFORMATION';
      else status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'bmi',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Título', 'IPI Compositores', 'IPI Editora', 'Splits 100%'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 4. THE MLC (Mechanical Licensing Collective)
  {
    const meta = SERVICE_METADATA.mlc;
    const reg = project.registrations.mlc;
    const missing: string[] = [];
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';

    if (stage === 'beat_instrumental') {
      status = 'NOT_APPLICABLE';
    } else {
      if (!profile?.mlcMemberId && !profile?.ipiCaeNumber) missing.push('Membresía The MLC / IPI');
      if (!project.isrc && stage !== 'full_song') missing.push('ISRC de la grabación vinculada (si existe)');

      if (reg?.registrationNumber) status = 'REGISTERED';
      else if (reg?.externalReferenceId) status = 'SUBMITTED';
      else if (missing.length > 0) status = 'MISSING_INFORMATION';
      else status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'mlc',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Título de la obra', 'Compositores y Editoras', 'Splits Mecánicos'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 5. SOUNDEXCHANGE
  {
    const meta = SERVICE_METADATA.soundexchange;
    const reg = project.registrations.soundexchange;
    const missing: string[] = [];
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';

    if (stage === 'beat_instrumental' || stage === 'full_song') {
      status = 'NOT_APPLICABLE';
    } else {
      if (!project.isrc) missing.push('ISRC del master');
      if (!profile?.soundExchangeId) missing.push('ID de Miembro SoundExchange (Perfil)');

      if (reg?.registrationNumber) status = 'REGISTERED';
      else if (reg?.externalReferenceId) status = 'SUBMITTED';
      else if (missing.length > 0) status = 'MISSING_INFORMATION';
      else status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'soundexchange',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['ISRC del Master', 'Titular del Fonograma', 'Artista Principal'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 6. ISRC (International Standard Recording Code)
  {
    const meta = SERVICE_METADATA.isrc;
    const reg = project.registrations.isrc;
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';
    const missing: string[] = [];

    if (stage === 'beat_instrumental' || stage === 'full_song') {
      status = 'NOT_APPLICABLE';
    } else {
      if (project.isrc) {
        status = 'VERIFIED';
      } else {
        missing.push('Código ISRC');
        status = 'MISSING_INFORMATION';
      }
    }

    services.push({
      service: 'isrc',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Código ISRC (12 caracteres)'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 7. UPC / EAN
  {
    const meta = SERVICE_METADATA.upc;
    const reg = project.registrations.upc;
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';
    const missing: string[] = [];

    if (stage !== 'release_ready' && stage !== 'distributed') {
      status = 'NOT_APPLICABLE';
    } else {
      if (project.upc) {
        status = 'VERIFIED';
      } else {
        missing.push('Código de barras UPC/EAN');
        status = 'MISSING_INFORMATION';
      }
    }

    services.push({
      service: 'upc',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Código UPC/EAN (12-13 dígitos)'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 8. SYMPHONIC DISTRIBUTION
  {
    const meta = SERVICE_METADATA.symphonic;
    const reg = project.registrations.symphonic;
    let status: RegistrationStatus = reg?.status || 'NOT_STARTED';
    const missing: string[] = [];

    if (stage !== 'release_ready' && stage !== 'distributed') {
      status = 'NOT_APPLICABLE';
    } else {
      if (!project.audioMasterUrl) missing.push('Audio WAV Master 24-bit');
      if (!project.artworkUrl) missing.push('Portada 3000x3000px');
      if (!project.primaryArtistName) missing.push('Nombre del Artista Principal');
      if (!project.isrc) missing.push('Código ISRC');

      if (reg?.registrationNumber || reg?.status === 'REGISTERED') status = 'REGISTERED';
      else if (reg?.externalReferenceId || reg?.status === 'SUBMITTED') status = 'SUBMITTED';
      else if (missing.length > 0) status = 'MISSING_INFORMATION';
      else status = 'READY_TO_REGISTER';
    }

    services.push({
      service: 'symphonic',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['WAV Master', 'Portada 3000x3000', 'ISRC', 'Artista', 'Fecha Lanzamiento'],
      missingFields: missing,
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // 9. YOUTUBE CONTENT ID / RIGHTS MANAGEMENT
  {
    const meta = SERVICE_METADATA.youtube_content_id;
    const reg = project.registrations.youtube_content_id;
    let status: RegistrationStatus = reg?.status || 'NEEDS_ATTENTION';

    if (reg?.registrationNumber) {
      status = 'VERIFIED';
    } else if (reg?.status) {
      status = reg.status;
    } else {
      // By default: Review required because beats sold non-exclusively cannot be in Content ID
      status = 'NEEDS_ATTENTION';
    }

    services.push({
      service: 'youtube_content_id',
      name: meta.name,
      category: meta.category,
      whatItIs: meta.whatItIs,
      whenItApplies: meta.whenItApplies,
      officialUrl: meta.officialUrl,
      requiredFields: ['Verificación de 100% Exclusividad', 'Ausencia de samples de terceros'],
      missingFields: status === 'VERIFIED' ? [] : ['Revisión de elegibilidad exclusiva'],
      whatToDo: meta.whatToDo,
      whatToReturn: meta.whatToReturn,
      currentStatus: status,
    });
  }

  // Calculate Next Action based on state
  let nextAction = '';
  let overallStatus: ProjectAnalysis['overallStatus'] = 'BEAT_IN_CATALOG';

  if (stage === 'beat_instrumental') {
    overallStatus = 'BEAT_IN_CATALOG';
    nextAction = 'Revisar registro de Obra Musical en Copyright Office o asignar a un proyecto vocal.';
  } else if (stage === 'full_song') {
    overallStatus = 'COMPOSITION_IN_PROGRESS';
    nextAction = 'Completar split sheet de compositores y dar de alta la obra en BMI y The MLC.';
  } else if (stage === 'final_master') {
    overallStatus = 'MASTER_READY';
    nextAction = 'Asignar código ISRC a la grabación fonográfica y preparar SoundExchange.';
  } else if (stage === 'isrc_assigned') {
    overallStatus = 'MASTER_READY';
    nextAction = 'Preparar arte de tapa oficial 3000x3000px y metadatos comerciales de lanzamiento.';
  } else if (stage === 'release_ready') {
    overallStatus = 'RELEASE_READY';
    nextAction = 'Enviar lanzamiento a Symphonic Distribution para entrega a tiendas.';
  } else {
    overallStatus = 'DISTRIBUTED' as any;
    nextAction = 'Monitorear liquidaciones de regalías en Symphonic, The MLC y SoundExchange.';
  }

  // Calculate readiness percentage (only against APPLICABLE services)
  const applicableServices = services.filter((s) => s.currentStatus !== 'NOT_APPLICABLE');
  const completedServices = applicableServices.filter(
    (s) => s.currentStatus === 'REGISTERED' || s.currentStatus === 'VERIFIED' || s.currentStatus === 'SUBMITTED'
  );
  const readinessPercentage = applicableServices.length > 0
    ? Math.round((completedServices.length / applicableServices.length) * 100)
    : 100;

  return {
    stage,
    stageLabel: stageInfo.label,
    readinessPercentage,
    overallStatus,
    nextAction,
    services,
  };
}
