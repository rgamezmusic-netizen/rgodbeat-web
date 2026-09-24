-- ==============================================================================
-- RGODBEAT 2.0 — Migration: 20260924000001_studio_cloud_projects.sql
-- Description: 1 Cloud Project per Active User Account (Beat + Vocals + FX)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.studio_cloud_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    project_name TEXT NOT NULL DEFAULT 'Mi Proyecto',
    beat_id TEXT,
    beat_title TEXT,
    beat_bpm INTEGER,
    beat_key TEXT,
    beat_scale TEXT,
    is_custom_beat BOOLEAN DEFAULT false,
    beat_file_key TEXT,
    tracks_meta JSONB NOT NULL DEFAULT '[]'::jsonb,
    storage_r2_prefix TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_cloud_project UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_studio_cloud_projects_user ON public.studio_cloud_projects(user_id);

ALTER TABLE public.studio_cloud_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own studio cloud project" ON public.studio_cloud_projects;
CREATE POLICY "Users can manage their own studio cloud project"
    ON public.studio_cloud_projects FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

GRANT ALL ON public.studio_cloud_projects TO service_role;
