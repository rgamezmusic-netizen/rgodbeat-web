import { MasterProfile, ParkProject, RegistrationService, ParkRegistration } from './types';

export const INITIAL_MASTER_PROFILE: MasterProfile = {
  id: 'profile-rgodbeat-master',
  userId: 'user-rafael-gamez',
  legalName: 'Rafael Gámez',
  professionalName: 'RGODBEAT',
  producerName: 'RGODBEAT',
  artistName: 'RGODBEAT',
  roles: ['Producer', 'Songwriter', 'Composer', 'Publisher', 'Sound Recording Owner'],
  ipiCaeNumber: '', // Can be entered once by user
  isniNumber: '',
  proAffiliation: 'BMI',
  proMemberId: '',
  mlcMemberId: '',
  soundExchangeId: '',
  isrcRegistrantCode: '',
  publisherName: 'Gamez Music',
  publisherIpi: '',
  labelName: 'RGODBEAT Records',
  companyName: 'Gamez IN LLC',
  email: 'rgodbeat@gmail.com',
  country: 'United States',
  state: 'Texas',
  updatedAt: new Date().toISOString(),
};

const createEmptyRegistrations = (): Record<RegistrationService, ParkRegistration> => {
  const services: RegistrationService[] = [
    'copyright_musical_work',
    'copyright_sound_recording',
    'bmi',
    'mlc',
    'soundexchange',
    'isrc',
    'upc',
    'symphonic',
    'youtube_content_id',
  ];

  const result = {} as Record<RegistrationService, ParkRegistration>;
  services.forEach((s) => {
    result[s] = {
      service: s,
      status: 'NOT_STARTED',
      lastUpdated: new Date().toISOString(),
    };
  });
  return result;
};

/**
 * GOLDEN FIRST TEST PROJECT: DIVINA
 * Initial state represents strictly BEAT / INSTRUMENTAL.
 */
export const INITIAL_DIVINA_PROJECT: ParkProject = {
  id: 'project-divina-001',
  slug: 'divina',
  title: 'DIVINA',
  type: 'beat',
  stage: 'beat_instrumental', // PURE BEAT / INSTRUMENTAL
  bpm: 95,
  key: 'Am',
  scale: 'Minor',
  genre: 'Reggaeton',
  mood: 'Dark',
  durationSec: 167, // 2:47
  producerName: 'RGODBEAT',
  primaryArtistName: '',
  featuredArtists: [],
  songwriters: ['Rafael Gámez'],
  publishers: ['Gamez Music'],
  splits: [
    {
      id: 'split-1',
      name: 'Rafael Gámez (RGODBEAT)',
      role: 'Producer',
      sharePercentage: 100,
      proAffiliation: 'BMI',
      email: 'rgodbeat@gmail.com',
    },
  ],
  masterOwnershipPercentage: 100,
  publishingOwnershipPercentage: 100,
  notes: 'Instrumental producido en Austin, TX. Beat estelar disponible en catálogo y preparado para desarrollo de canción completa.',
  registrations: {
    ...createEmptyRegistrations(),
    copyright_musical_work: {
      service: 'copyright_musical_work',
      status: 'READY_TO_REGISTER',
      notes: 'Composición instrumental lista para preparación en U.S. Copyright Office Form PA.',
      lastUpdated: new Date().toISOString(),
    },
    copyright_sound_recording: {
      service: 'copyright_sound_recording',
      status: 'NOT_APPLICABLE',
      notes: 'No aplica como master fonográfico independiente hasta que exista una grabación vocal o release comercial.',
      lastUpdated: new Date().toISOString(),
    },
    bmi: {
      service: 'bmi',
      status: 'NOT_APPLICABLE',
      notes: 'No aplicable aún como canción completa. Se activará cuando se registre la obra vocal con sus autores finales.',
      lastUpdated: new Date().toISOString(),
    },
    mlc: {
      service: 'mlc',
      status: 'NOT_APPLICABLE',
      notes: 'No aplicable aún para streaming interactivo mecánico.',
      lastUpdated: new Date().toISOString(),
    },
    soundexchange: {
      service: 'soundexchange',
      status: 'NOT_APPLICABLE',
      notes: 'No aplicable a un beat sin difusión radial/streaming fonográfica.',
      lastUpdated: new Date().toISOString(),
    },
    isrc: {
      service: 'isrc',
      status: 'NOT_APPLICABLE',
      notes: 'Sin master final lanzado. ISRC no asignado automáticamente.',
      lastUpdated: new Date().toISOString(),
    },
    upc: {
      service: 'upc',
      status: 'NOT_APPLICABLE',
      notes: 'Sin paquete de lanzamiento comercial.',
      lastUpdated: new Date().toISOString(),
    },
    symphonic: {
      service: 'symphonic',
      status: 'NOT_APPLICABLE',
      notes: 'No entregado a distribución digital aún.',
      lastUpdated: new Date().toISOString(),
    },
    youtube_content_id: {
      service: 'youtube_content_id',
      status: 'NEEDS_ATTENTION',
      notes: 'REVISIÓN REQUERIDA: Si este beat se licencia de forma no exclusiva en la tienda, NO debe ingresarse a Content ID automatizado para evitar reclamos indebidos a artistas licenciatarios.',
      lastUpdated: new Date().toISOString(),
    },
  },
  documents: [],
  auditHistory: [
    {
      id: 'audit-1',
      projectId: 'project-divina-001',
      timestamp: new Date().toISOString(),
      userEmail: 'rgodbeat@gmail.com',
      eventType: 'STAGE_CHANGED',
      description: 'Proyecto creado e indexado en The Park como BEAT / INSTRUMENTAL.',
      previousValue: '',
      newValue: 'beat_instrumental',
    },
  ],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
