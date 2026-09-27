-- ==============================================================================
-- RGODBEAT 2.0 — Migration: 20260927000000_the_park_rights_and_release_system.sql
-- Description: THE PARK — Master Rights, Publishing & Release Control Center
-- Completely isolated from Studio DAW and Store commerce tables.
-- ==============================================================================

-- 1. Master Creator / Rights Holder Profile
CREATE TABLE IF NOT EXISTS public.park_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    legal_name TEXT NOT NULL DEFAULT 'Rafael Gámez',
    professional_name TEXT NOT NULL DEFAULT 'RGODBEAT',
    producer_name TEXT DEFAULT 'RGODBEAT',
    artist_name TEXT DEFAULT 'RGODBEAT',
    roles JSONB NOT NULL DEFAULT '["Producer", "Songwriter", "Composer", "Publisher", "Sound Recording Owner"]'::jsonb,
    ipi_cae_number TEXT DEFAULT '',
    isni_number TEXT DEFAULT '',
    pro_affiliation TEXT DEFAULT 'BMI',
    pro_member_id TEXT DEFAULT '',
    mlc_member_id TEXT DEFAULT '',
    soundexchange_id TEXT DEFAULT '',
    isrc_registrant_code TEXT DEFAULT '',
    publisher_name TEXT DEFAULT 'Gamez Music',
    publisher_ipi TEXT DEFAULT '',
    label_name TEXT DEFAULT 'RGODBEAT Records',
    company_name TEXT DEFAULT 'Gamez IN LLC',
    email TEXT NOT NULL,
    country TEXT DEFAULT 'United States',
    state TEXT DEFAULT 'Texas',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_park_profile_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_park_profiles_user ON public.park_profiles(user_id);

-- 2. Master Catalog Projects (Unlimited, NO 23 LIMIT)
CREATE TABLE IF NOT EXISTS public.park_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'beat' CHECK (type IN ('beat', 'song', 'album_cut', 'client_work')),
    stage TEXT NOT NULL DEFAULT 'beat_instrumental' CHECK (stage IN ('beat_instrumental', 'work_in_progress', 'song_complete', 'master_delivered', 'registered_protected', 'released_monetized')),
    bpm INTEGER NOT NULL DEFAULT 95,
    musical_key TEXT NOT NULL DEFAULT 'Am',
    scale TEXT NOT NULL DEFAULT 'Minor',
    genre TEXT NOT NULL DEFAULT 'Reggaeton',
    mood TEXT DEFAULT 'Dark',
    duration_sec INTEGER DEFAULT 167,
    producer_name TEXT DEFAULT 'RGODBEAT',
    primary_artist_name TEXT DEFAULT '',
    featured_artists JSONB NOT NULL DEFAULT '[]'::jsonb,
    songwriters JSONB NOT NULL DEFAULT '["Rafael Gámez"]'::jsonb,
    publishers JSONB NOT NULL DEFAULT '["Gamez Music"]'::jsonb,
    splits JSONB NOT NULL DEFAULT '[]'::jsonb,
    master_ownership_percentage NUMERIC(5,2) DEFAULT 100.00,
    publishing_ownership_percentage NUMERIC(5,2) DEFAULT 100.00,
    iswc_code TEXT DEFAULT '',
    isrc_code TEXT DEFAULT '',
    upc_code TEXT DEFAULT '',
    distributor_name TEXT DEFAULT '',
    release_date DATE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_park_projects_user_slug UNIQUE (user_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_park_projects_user ON public.park_projects(user_id);
CREATE INDEX IF NOT EXISTS idx_park_projects_slug ON public.park_projects(slug);
CREATE INDEX IF NOT EXISTS idx_park_projects_stage ON public.park_projects(stage);

-- 3. Individual Registration Milestones (USCO, BMI, MLC, SoundExchange, etc.)
CREATE TABLE IF NOT EXISTS public.park_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.park_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    service TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED', 'READY_TO_REGISTER', 'SUBMITTED', 'CONFIRMED', 'ACTION_REQUIRED', 'NOT_APPLICABLE')),
    confirmation_number TEXT DEFAULT '',
    submission_date TIMESTAMPTZ,
    confirmation_date TIMESTAMPTZ,
    notes TEXT DEFAULT '',
    last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_park_registration_proj_service UNIQUE (project_id, service)
);

CREATE INDEX IF NOT EXISTS idx_park_registrations_proj ON public.park_registrations(project_id);
CREATE INDEX IF NOT EXISTS idx_park_registrations_user ON public.park_registrations(user_id);

-- 4. Legal Documents & Contracts
CREATE TABLE IF NOT EXISTS public.park_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.park_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'splitsheet' CHECK (type IN ('splitsheet', 'copyright_cert', 'license_agreement', 'lyrics', 'audio_proof', 'other')),
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_size_bytes BIGINT DEFAULT 0,
    mime_type TEXT DEFAULT 'application/pdf',
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_park_documents_proj ON public.park_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_park_documents_user ON public.park_documents(user_id);

-- 5. Immutable Legal Audit Trail
CREATE TABLE IF NOT EXISTS public.park_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.park_projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    previous_state JSONB,
    new_state JSONB,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_park_audit_events_proj ON public.park_audit_events(project_id);
CREATE INDEX IF NOT EXISTS idx_park_audit_events_user ON public.park_audit_events(user_id);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.park_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.park_audit_events ENABLE ROW LEVEL SECURITY;

-- 1. park_profiles
DROP POLICY IF EXISTS "Users can manage own park profile" ON public.park_profiles;
CREATE POLICY "Users can manage own park profile"
    ON public.park_profiles FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 2. park_projects
DROP POLICY IF EXISTS "Users can manage own park projects" ON public.park_projects;
CREATE POLICY "Users can manage own park projects"
    ON public.park_projects FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 3. park_registrations
DROP POLICY IF EXISTS "Users can manage own park registrations" ON public.park_registrations;
CREATE POLICY "Users can manage own park registrations"
    ON public.park_registrations FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 4. park_documents
DROP POLICY IF EXISTS "Users can manage own park documents" ON public.park_documents;
CREATE POLICY "Users can manage own park documents"
    ON public.park_documents FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 5. park_audit_events (Users can select and insert their own events)
DROP POLICY IF EXISTS "Users can view own park audit events" ON public.park_audit_events;
CREATE POLICY "Users can view own park audit events"
    ON public.park_audit_events FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can append park audit events" ON public.park_audit_events;
CREATE POLICY "Users can append park audit events"
    ON public.park_audit_events FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Service Role Grants
GRANT ALL ON public.park_profiles TO service_role;
GRANT ALL ON public.park_projects TO service_role;
GRANT ALL ON public.park_registrations TO service_role;
GRANT ALL ON public.park_documents TO service_role;
GRANT ALL ON public.park_audit_events TO service_role;
