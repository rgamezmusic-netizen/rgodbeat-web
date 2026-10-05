-- Additive RG identity and verified YouTube publication foundation.
-- Existing catalog, Studio, authentication, ranking and YouTube tables are unchanged.
BEGIN;

CREATE TABLE public.rg_artists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  stage_name text NOT NULL CHECK (char_length(btrim(stage_name)) BETWEEN 1 AND 80),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  bio text CHECK (bio IS NULL OR char_length(bio) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rg_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  beat_id uuid REFERENCES public.beats(id) ON DELETE RESTRICT,
  studio_project_id uuid REFERENCES public.studio_cloud_projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rg_track_artists (
  track_id uuid NOT NULL REFERENCES public.rg_tracks(id) ON DELETE CASCADE,
  artist_id uuid NOT NULL REFERENCES public.rg_artists(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('primary', 'collaborator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, artist_id)
);
CREATE UNIQUE INDEX rg_track_artists_one_primary
  ON public.rg_track_artists(track_id) WHERE role = 'primary';
CREATE INDEX rg_track_artists_artist ON public.rg_track_artists(artist_id, track_id);

CREATE TABLE public.rg_publication_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL,
  artist_id uuid NOT NULL,
  -- Immutable source ID snapshots survive auth.users cascading deletion of old jobs.
  youtube_export_job_id uuid NOT NULL UNIQUE,
  youtube_video_id text NOT NULL UNIQUE CHECK (char_length(btrim(youtube_video_id)) BETWEEN 1 AND 128),
  published_by_user_id uuid NOT NULL,
  -- Live references are nulled by the existing source tables' deletion semantics.
  youtube_export_job_ref uuid UNIQUE REFERENCES public.youtube_export_jobs(id) ON DELETE SET NULL,
  published_by_user_ref uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rg_publication_track_artist_fk
    FOREIGN KEY (track_id, artist_id)
    REFERENCES public.rg_track_artists(track_id, artist_id) ON DELETE RESTRICT
);
CREATE INDEX rg_publication_links_track ON public.rg_publication_links(track_id, published_at DESC);
CREATE INDEX rg_publication_links_artist ON public.rg_publication_links(artist_id, published_at DESC);

CREATE INDEX rg_artists_active_slug ON public.rg_artists(status, slug);
CREATE INDEX rg_tracks_status_created ON public.rg_tracks(status, created_at DESC);
CREATE INDEX rg_tracks_beat ON public.rg_tracks(beat_id) WHERE beat_id IS NOT NULL;

ALTER TABLE public.rg_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_track_artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_publication_links ENABLE ROW LEVEL SECURITY;

-- All Phase 1 reads and writes go through authenticated server routes. No client
-- role can directly write identities or publication verification records.
REVOKE ALL ON public.rg_artists, public.rg_tracks, public.rg_track_artists, public.rg_publication_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.rg_artists, public.rg_tracks, public.rg_track_artists, public.rg_publication_links TO service_role;

-- Create the track and its sole V1 primary artist association atomically.
CREATE OR REPLACE FUNCTION public.create_rg_track(
  p_user_id uuid,
  p_artist_id uuid,
  p_title text,
  p_beat_id uuid DEFAULT NULL,
  p_studio_project_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_track_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.rg_artists a
    WHERE a.id = p_artist_id AND a.user_id = p_user_id AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'artist_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF p_beat_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.beats b WHERE b.id = p_beat_id) THEN
    RAISE EXCEPTION 'beat_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF p_studio_project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.studio_cloud_projects p
    WHERE p.id = p_studio_project_id AND p.user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'studio_project_unavailable' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.rg_tracks(title, beat_id, studio_project_id)
    VALUES (btrim(p_title), p_beat_id, p_studio_project_id) RETURNING id INTO v_track_id;
  INSERT INTO public.rg_track_artists(track_id, artist_id, role)
    VALUES (v_track_id, p_artist_id, 'primary');
  RETURN v_track_id;
END;
$$;
REVOKE ALL ON FUNCTION public.create_rg_track(uuid, uuid, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_rg_track(uuid, uuid, text, uuid, uuid) TO service_role;

-- Verify the existing confirmed YouTube job and record its link atomically.
-- Replays of the same association return the existing publication ID.
CREATE OR REPLACE FUNCTION public.record_rg_publication_link(
  p_user_id uuid,
  p_artist_id uuid,
  p_track_id uuid,
  p_beat_id uuid,
  p_youtube_export_job_id uuid,
  p_youtube_video_id text
) RETURNS uuid
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_track public.rg_tracks%ROWTYPE;
  v_job public.youtube_export_jobs%ROWTYPE;
  v_publication_id uuid;
BEGIN
  SELECT * INTO v_track FROM public.rg_tracks WHERE id = p_track_id FOR UPDATE;
  IF NOT FOUND OR v_track.status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'track_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF v_track.beat_id IS DISTINCT FROM p_beat_id THEN
    RAISE EXCEPTION 'track_beat_mismatch' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.rg_artists a
    JOIN public.rg_track_artists ta ON ta.artist_id = a.id AND ta.track_id = p_track_id AND ta.role = 'primary'
    WHERE a.id = p_artist_id AND a.user_id = p_user_id AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'artist_track_unavailable' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_job FROM public.youtube_export_jobs
    WHERE id = p_youtube_export_job_id AND user_id = p_user_id;
  IF NOT FOUND OR v_job.status <> 'uploaded' OR v_job.youtube_video_id IS NULL
     OR v_job.youtube_video_id <> p_youtube_video_id THEN
    RAISE EXCEPTION 'youtube_job_unverified' USING ERRCODE = 'P0001';
  END IF;

  SELECT id INTO v_publication_id FROM public.rg_publication_links
    WHERE youtube_export_job_id = p_youtube_export_job_id
      AND youtube_video_id = p_youtube_video_id
      AND track_id = p_track_id AND artist_id = p_artist_id
      AND published_by_user_id = p_user_id;
  IF v_publication_id IS NOT NULL THEN
    UPDATE public.rg_tracks SET status = 'published', updated_at = now() WHERE id = p_track_id;
    RETURN v_publication_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.rg_publication_links WHERE youtube_export_job_id = p_youtube_export_job_id)
     OR EXISTS (SELECT 1 FROM public.rg_publication_links WHERE youtube_video_id = p_youtube_video_id) THEN
    RAISE EXCEPTION 'youtube_publication_already_linked' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.rg_publication_links(
    track_id, artist_id, youtube_export_job_id, youtube_video_id,
    published_by_user_id, youtube_export_job_ref, published_by_user_ref, published_at
  ) VALUES (
    p_track_id, p_artist_id, p_youtube_export_job_id, p_youtube_video_id,
    p_user_id, p_youtube_export_job_id, p_user_id,
    coalesce(v_job.finished_at, now())
  ) RETURNING id INTO v_publication_id;
  UPDATE public.rg_tracks SET status = 'published', updated_at = now() WHERE id = p_track_id;
  RETURN v_publication_id;
END;
$$;
REVOKE ALL ON FUNCTION public.record_rg_publication_link(uuid, uuid, uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_rg_publication_link(uuid, uuid, uuid, uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
