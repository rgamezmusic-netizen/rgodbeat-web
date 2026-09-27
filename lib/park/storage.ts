/**
 * THE PARK — CLIENT STORAGE & SYNC SERVICE
 * 
 * Safely persists Master Profile, Projects, Registrations, and Audit Trail.
 * Enter once -> reuse everywhere.
 * Completely isolated from Studio storage.
 */

import { MasterProfile, ParkProject, ProjectStage, RegistrationService, ParkRegistration, ParkDocument, ParkAuditEvent } from './types';
import { INITIAL_MASTER_PROFILE, INITIAL_DIVINA_PROJECT } from './initialData';

const STORAGE_KEYS = {
  PROFILE: 'rgodbeat_park_master_profile_v1',
  PROJECTS: 'rgodbeat_park_projects_v1',
};

export const ParkStorage = {
  // Master Profile
  getMasterProfile(): MasterProfile {
    if (typeof window === 'undefined') return INITIAL_MASTER_PROFILE;
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROFILE);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error loading Master Profile:', e);
    }
    // Initialize default profile
    this.saveMasterProfile(INITIAL_MASTER_PROFILE);
    return INITIAL_MASTER_PROFILE;
  },

  saveMasterProfile(profile: MasterProfile): MasterProfile {
    const updated = { ...profile, updatedAt: new Date().toISOString() };
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEYS.PROFILE, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving Master Profile:', e);
      }
    }
    return updated;
  },

  // Projects Catalog
  getProjects(): ParkProject[] {
    if (typeof window === 'undefined') return [INITIAL_DIVINA_PROJECT];
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PROJECTS);
      if (data) {
        const parsed: ParkProject[] = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Error loading projects:', e);
    }

    // Initialize with golden project DIVINA
    this.saveProjects([INITIAL_DIVINA_PROJECT]);
    return [INITIAL_DIVINA_PROJECT];
  },

  saveProjects(projects: ParkProject[]): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(projects));
    } catch (e) {
      console.error('Error saving projects:', e);
    }
  },

  getProjectBySlug(slug: string): ParkProject | null {
    const projects = this.getProjects();
    const cleanSlug = slug.toLowerCase().trim();
    return projects.find((p) => p.slug.toLowerCase() === cleanSlug || p.id === cleanSlug) || null;
  },

  saveProject(project: ParkProject): ParkProject {
    const projects = this.getProjects();
    const idx = projects.findIndex((p) => p.id === project.id);
    const updated = { ...project, updatedAt: new Date().toISOString() };

    if (idx >= 0) {
      projects[idx] = updated;
    } else {
      projects.unshift(updated);
    }

    this.saveProjects(projects);
    return updated;
  },

  // Evolution & Fast Actions
  updateProjectStage(projectId: string, newStage: ProjectStage, userEmail: string = 'rgodbeat@gmail.com'): ParkProject | null {
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;

    const oldStage = project.stage;
    if (oldStage === newStage) return project;

    const auditEvent: ParkAuditEvent = {
      id: `audit-${Date.now()}`,
      projectId,
      timestamp: new Date().toISOString(),
      userEmail,
      eventType: 'STAGE_CHANGED',
      description: `Etapa del proyecto evolucionó de "${oldStage}" a "${newStage}".`,
      previousValue: oldStage,
      newValue: newStage,
    };

    project.stage = newStage;
    project.auditHistory = [auditEvent, ...(project.auditHistory || [])];
    project.updatedAt = new Date().toISOString();

    this.saveProjects(projects);
    return project;
  },

  updateRegistration(
    projectId: string,
    service: RegistrationService,
    patch: Partial<ParkRegistration>,
    userEmail: string = 'rgodbeat@gmail.com'
  ): ParkProject | null {
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;

    const currentReg = project.registrations[service] || {
      service,
      status: 'NOT_STARTED',
      lastUpdated: new Date().toISOString(),
    };

    const oldStatus = currentReg.status;
    const updatedReg: ParkRegistration = {
      ...currentReg,
      ...patch,
      service,
      lastUpdated: new Date().toISOString(),
    };

    project.registrations[service] = updatedReg;

    if (patch.status && patch.status !== oldStatus) {
      const auditEvent: ParkAuditEvent = {
        id: `audit-${Date.now()}`,
        projectId,
        timestamp: new Date().toISOString(),
        userEmail,
        eventType: 'STATUS_CHANGED',
        description: `Estado de registro en ${service} cambió de "${oldStatus}" a "${patch.status}".`,
        previousValue: oldStatus,
        newValue: patch.status,
      };
      project.auditHistory = [auditEvent, ...(project.auditHistory || [])];
    }

    project.updatedAt = new Date().toISOString();
    this.saveProjects(projects);
    return project;
  },

  addDocument(
    projectId: string,
    docData: Omit<ParkDocument, 'id' | 'uploadedAt'>,
    userEmail: string = 'rgodbeat@gmail.com'
  ): ParkProject | null {
    const projects = this.getProjects();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;

    const newDoc: ParkDocument = {
      ...docData,
      id: `doc-${Date.now()}`,
      projectId,
      uploadedAt: new Date().toISOString(),
    };

    project.documents = [newDoc, ...(project.documents || [])];

    const auditEvent: ParkAuditEvent = {
      id: `audit-${Date.now()}`,
      projectId,
      timestamp: new Date().toISOString(),
      userEmail,
      eventType: 'DOCUMENT_ATTACHED',
      description: `Documento adjuntado: "${newDoc.title}" (${newDoc.category}).`,
    };
    project.auditHistory = [auditEvent, ...(project.auditHistory || [])];

    project.updatedAt = new Date().toISOString();
    this.saveProjects(projects);
    return project;
  },

  createProjectFromBeat(
    data: {
      title: string;
      bpm: number;
      key: string;
      scale?: 'Major' | 'Minor';
      genre: string;
      mood?: string;
      audioMasterUrl?: string;
      notes?: string;
    },
    profile?: MasterProfile
  ): ParkProject {
    const activeProfile = profile || this.getMasterProfile();
    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `project-${Date.now()}`;

    const newProject: ParkProject = {
      id: `project-${Date.now()}`,
      slug,
      title: data.title,
      type: 'beat',
      stage: 'beat_instrumental',
      bpm: data.bpm,
      key: data.key,
      scale: data.scale || 'Minor',
      genre: data.genre || 'Urban',
      mood: data.mood || 'Commercial',
      producerName: activeProfile.producerName || activeProfile.legalName || 'RGODBEAT',
      primaryArtistName: '',
      featuredArtists: [],
      songwriters: [activeProfile.legalName || 'Rafael Gámez'],
      publishers: [activeProfile.publisherName || 'Gamez Music'],
      splits: [
        {
          id: `split-${Date.now()}`,
          name: activeProfile.legalName || 'Rafael Gámez',
          role: 'Producer',
          sharePercentage: 100,
          ipiNumber: activeProfile.ipiCaeNumber || '',
          proAffiliation: activeProfile.proAffiliation || 'BMI',
          email: activeProfile.email || '',
        },
      ],
      masterOwnershipPercentage: 100,
      publishingOwnershipPercentage: 100,
      audioMasterUrl: data.audioMasterUrl || '',
      notes: data.notes || '',
      registrations: {
        copyright_musical_work: { service: 'copyright_musical_work', status: 'READY_TO_REGISTER', lastUpdated: new Date().toISOString() },
        copyright_sound_recording: { service: 'copyright_sound_recording', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        bmi: { service: 'bmi', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        mlc: { service: 'mlc', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        soundexchange: { service: 'soundexchange', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        isrc: { service: 'isrc', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        upc: { service: 'upc', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        symphonic: { service: 'symphonic', status: 'NOT_APPLICABLE', lastUpdated: new Date().toISOString() },
        youtube_content_id: { service: 'youtube_content_id', status: 'NEEDS_ATTENTION', notes: 'Revisión requerida de exclusividad', lastUpdated: new Date().toISOString() },
      },
      documents: [],
      auditHistory: [
        {
          id: `audit-${Date.now()}`,
          projectId: `project-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userEmail: activeProfile.email,
          eventType: 'STAGE_CHANGED',
          description: `Nuevo beat creado en The Park: "${data.title}".`,
          newValue: 'beat_instrumental',
        },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return this.saveProject(newProject);
  },
};
