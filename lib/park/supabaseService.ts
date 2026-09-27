/**
 * THE PARK — SUPABASE PERSISTENCE & SYNC SERVICE
 * 
 * Secure cloud synchronization with Row Level Security (RLS).
 * Reuses existing Supabase Auth without touching Studio.
 * Seamless fallback to local storage for offline / unauthenticated states.
 */

import { createClient } from '@/lib/supabase/client';
import {
  MasterProfile,
  ParkProject,
  ParkRegistration,
  ParkDocument,
  ParkAuditEvent,
  RegistrationService,
} from './types';
import { INITIAL_MASTER_PROFILE, INITIAL_DIVINA_PROJECT } from './initialData';
import { ParkStorage } from './storage';

export const ParkSupabaseService = {
  /**
   * Check if current user is logged in
   */
  async getCurrentUser() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user;
    } catch {
      return null;
    }
  },

  /**
   * Fetch Master Profile from Supabase
   */
  async getMasterProfile(): Promise<MasterProfile> {
    const user = await this.getCurrentUser();
    if (!user) {
      return ParkStorage.getMasterProfile();
    }

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('park_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) {
        console.warn('[Park Supabase] Error fetching profile:', error.message);
        return ParkStorage.getMasterProfile();
      }

      if (data) {
        const profile: MasterProfile = {
          id: data.id,
          userId: data.user_id,
          legalName: data.legal_name,
          professionalName: data.professional_name,
          producerName: data.producer_name || 'RGODBEAT',
          artistName: data.artist_name || 'RGODBEAT',
          roles: Array.isArray(data.roles) ? (data.roles as any) : INITIAL_MASTER_PROFILE.roles,
          ipiCaeNumber: data.ipi_cae_number || '',
          isniNumber: data.isni_number || '',
          proAffiliation: (data.pro_affiliation as any) || 'BMI',
          proMemberId: data.pro_member_id || '',
          mlcMemberId: data.mlc_member_id || '',
          soundExchangeId: data.soundexchange_id || '',
          isrcRegistrantCode: data.isrc_registrant_code || '',
          publisherName: data.publisher_name || 'Gamez Music',
          publisherIpi: data.publisher_ipi || '',
          labelName: data.label_name || 'RGODBEAT Records',
          companyName: data.company_name || 'Gamez IN LLC',
          email: data.email || user.email || '',
          country: data.country || 'United States',
          state: data.state || 'Texas',
          updatedAt: data.updated_at,
        };
        ParkStorage.saveMasterProfile(profile);
        return profile;
      }

      // If user has no cloud profile yet, initialize from local or defaults
      const localProfile = ParkStorage.getMasterProfile();
      await this.saveMasterProfile({ ...localProfile, userId: user.id, email: user.email || localProfile.email });
      return localProfile;
    } catch (err) {
      console.warn('[Park Supabase] Fallback to local profile:', err);
      return ParkStorage.getMasterProfile();
    }
  },

  /**
   * Save Master Profile to Supabase
   */
  async saveMasterProfile(profile: MasterProfile): Promise<MasterProfile> {
    // Always update local cache first
    ParkStorage.saveMasterProfile(profile);

    const user = await this.getCurrentUser();
    if (!user) return profile;

    try {
      const supabase = createClient();
      const payload = {
        user_id: user.id,
        legal_name: profile.legalName,
        professional_name: profile.professionalName,
        producer_name: profile.producerName,
        artist_name: profile.artistName,
        roles: profile.roles as any,
        ipi_cae_number: profile.ipiCaeNumber || '',
        isni_number: profile.isniNumber || '',
        pro_affiliation: profile.proAffiliation || 'BMI',
        pro_member_id: profile.proMemberId || '',
        mlc_member_id: profile.mlcMemberId || '',
        soundexchange_id: profile.soundExchangeId || '',
        isrc_registrant_code: profile.isrcRegistrantCode || '',
        publisher_name: profile.publisherName || 'Gamez Music',
        publisher_ipi: profile.publisherIpi || '',
        label_name: profile.labelName || 'RGODBEAT Records',
        company_name: profile.companyName || 'Gamez IN LLC',
        email: profile.email || user.email || '',
        country: profile.country || 'United States',
        state: profile.state || 'Texas',
        updated_at: new Date().toISOString(),
      };

      await supabase
        .from('park_profiles')
        .upsert(payload, { onConflict: 'user_id' });

      return profile;
    } catch (err) {
      console.error('[Park Supabase] Error saving profile to cloud:', err);
      return profile;
    }
  },

  /**
   * Fetch all Projects from Supabase (Unlimited, NO 23 LIMIT)
   */
  async getProjects(): Promise<ParkProject[]> {
    const user = await this.getCurrentUser();
    if (!user) {
      return ParkStorage.getProjects();
    }

    try {
      const supabase = createClient();
      const { data: dbProjects, error } = await supabase
        .from('park_projects')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Park Supabase] Error fetching projects:', error.message);
        return ParkStorage.getProjects();
      }

      if (dbProjects && dbProjects.length > 0) {
        // Fetch registrations, documents, audit events for these projects
        const projectIds = dbProjects.map((p) => p.id);
        const [regRes, docRes, auditRes] = await Promise.all([
          supabase.from('park_registrations').select('*').in('project_id', projectIds),
          supabase.from('park_documents').select('*').in('project_id', projectIds),
          supabase.from('park_audit_events').select('*').in('project_id', projectIds).order('created_at', { ascending: false }),
        ]);

        const registrationsByProj: Record<string, Record<RegistrationService, ParkRegistration>> = {};
        (regRes.data || []).forEach((r) => {
          if (!registrationsByProj[r.project_id]) registrationsByProj[r.project_id] = {} as any;
          registrationsByProj[r.project_id][r.service as RegistrationService] = {
            service: r.service as RegistrationService,
            status: r.status as any,
            externalReferenceId: r.confirmation_number || undefined,
            submittedDate: r.submission_date || undefined,
            registeredDate: r.confirmation_date || undefined,
            notes: r.notes || undefined,
            lastUpdated: r.last_updated,
          };
        });

        const docsByProj: Record<string, ParkDocument[]> = {};
        (docRes.data || []).forEach((d) => {
          if (!docsByProj[d.project_id]) docsByProj[d.project_id] = [];
          docsByProj[d.project_id].push({
            id: d.id,
            projectId: d.project_id,
            title: d.title,
            category: (d.type as any) || 'split_sheet',
            fileUrl: d.file_path,
            fileName: d.file_name,
            fileSize: d.file_size_bytes || 0,
            uploadedAt: d.uploaded_at,
          });
        });

        const auditByProj: Record<string, ParkAuditEvent[]> = {};
        (auditRes.data || []).forEach((a) => {
          if (!auditByProj[a.project_id]) auditByProj[a.project_id] = [];
          auditByProj[a.project_id].push({
            id: a.id,
            projectId: a.project_id,
            timestamp: a.created_at,
            userEmail: a.user_email,
            eventType: (a.action as any) || 'METADATA_UPDATED',
            description: `${a.action}: ${a.entity_type}`,
            previousValue: a.previous_state ? JSON.stringify(a.previous_state) : undefined,
            newValue: a.new_state ? JSON.stringify(a.new_state) : undefined,
          });
        });

        const projects: ParkProject[] = dbProjects.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          type: (p.type as any) || 'beat',
          stage: (p.stage as any) || 'beat_instrumental',
          bpm: p.bpm,
          key: p.musical_key,
          scale: (p.scale as any) || 'Minor',
          genre: p.genre,
          mood: p.mood || undefined,
          durationSec: p.duration_sec,
          producerName: p.producer_name || 'RGODBEAT',
          primaryArtistName: p.primary_artist_name || '',
          featuredArtists: Array.isArray(p.featured_artists) ? (p.featured_artists as any) : [],
          songwriters: Array.isArray(p.songwriters) ? (p.songwriters as any) : ['Rafael Gámez'],
          publishers: Array.isArray(p.publishers) ? (p.publishers as any) : ['Gamez Music'],
          splits: Array.isArray(p.splits) ? (p.splits as any) : [],
          masterOwnershipPercentage: Number(p.master_ownership_percentage) || 100,
          publishingOwnershipPercentage: Number(p.publishing_ownership_percentage) || 100,
          isrc: p.isrc_code || undefined,
          upc: p.upc_code || undefined,
          notes: p.notes || undefined,
          registrations: registrationsByProj[p.id] || INITIAL_DIVINA_PROJECT.registrations,
          documents: docsByProj[p.id] || [],
          auditHistory: auditByProj[p.id] || [],
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        }));

        ParkStorage.saveProjects(projects);
        return projects;
      }

      // If user has 0 projects in Supabase, seed DIVINA into cloud
      const initialProject = { ...INITIAL_DIVINA_PROJECT };
      await this.saveProject(initialProject);
      return [initialProject];
    } catch (err) {
      console.warn('[Park Supabase] Error querying projects, fallback to local:', err);
      return ParkStorage.getProjects();
    }
  },

  /**
   * Save / Upsert a project to Supabase
   */
  async saveProject(project: ParkProject): Promise<ParkProject> {
    ParkStorage.saveProject(project);

    const user = await this.getCurrentUser();
    if (!user) return project;

    try {
      const supabase = createClient();
      const projectPayload = {
        id: project.id.includes('-') && project.id.length >= 32 ? project.id : undefined,
        user_id: user.id,
        slug: project.slug,
        title: project.title,
        type: (project.type === 'beat' ? 'beat' : 'song') as any,
        stage: project.stage as any,
        bpm: project.bpm,
        musical_key: project.key,
        scale: project.scale || 'Minor',
        genre: project.genre,
        mood: project.mood || 'Dark',
        duration_sec: project.durationSec || 167,
        producer_name: project.producerName || 'RGODBEAT',
        primary_artist_name: project.primaryArtistName || '',
        featured_artists: (project.featuredArtists || []) as any,
        songwriters: (project.songwriters || []) as any,
        publishers: (project.publishers || []) as any,
        splits: (project.splits || []) as any,
        master_ownership_percentage: project.masterOwnershipPercentage || 100,
        publishing_ownership_percentage: project.publishingOwnershipPercentage || 100,
        isrc_code: project.isrc || '',
        upc_code: project.upc || '',
        notes: project.notes || '',
        updated_at: new Date().toISOString(),
      };

      const { data: savedProject, error } = await supabase
        .from('park_projects')
        .upsert(projectPayload, { onConflict: 'user_id,slug' })
        .select()
        .single();

      if (error) {
        console.error('[Park Supabase] Error saving project to cloud:', error.message);
        return project;
      }

      const realProjectId = savedProject.id;

      // Save Registrations
      if (project.registrations) {
        const regRows = Object.values(project.registrations).map((reg) => ({
          project_id: realProjectId,
          user_id: user.id,
          service: reg.service,
          status: (reg.status as any) || 'NOT_STARTED',
          confirmation_number: reg.externalReferenceId || '',
          submission_date: reg.submittedDate || null,
          confirmation_date: reg.registeredDate || null,
          notes: reg.notes || '',
          last_updated: new Date().toISOString(),
        }));

        await supabase
          .from('park_registrations')
          .upsert(regRows, { onConflict: 'project_id,service' });
      }

      return {
        ...project,
        id: realProjectId,
      };
    } catch (err) {
      console.error('[Park Supabase] Upsert project error:', err);
      return project;
    }
  },

  /**
   * Log an immutable audit event
   */
  async logAuditEvent(projectId: string, action: string, entityType: string, entityId: string, metadata: any = {}) {
    const user = await this.getCurrentUser();
    if (!user) return;

    try {
      const supabase = createClient();
      await supabase.from('park_audit_events').insert({
        project_id: projectId,
        user_id: user.id,
        user_email: user.email || 'rgodbeat@gmail.com',
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata,
      });
    } catch (err) {
      console.warn('[Park Supabase] Could not log audit event to cloud:', err);
    }
  },
};
