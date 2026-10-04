-- Private credentials for the shared RGODBEAT YouTube channel.
-- OAuth refresh tokens are encrypted by the server before they reach this table.
BEGIN;

CREATE TABLE IF NOT EXISTS public.youtube_channel_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  channel_id text NOT NULL,
  channel_title text NOT NULL,
  encrypted_refresh_token text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.youtube_channel_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.youtube_channel_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.youtube_channel_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.youtube_export_jobs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_name text NOT NULL CHECK (char_length(artist_name) BETWEEN 1 AND 80),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  privacy text NOT NULL CHECK (privacy IN ('private', 'unlisted', 'public')),
  status text NOT NULL CHECK (status IN ('processing', 'uploaded', 'failed')),
  youtube_video_id text,
  youtube_url text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT youtube_export_jobs_video_status CHECK (
    (status = 'uploaded' AND youtube_video_id IS NOT NULL AND youtube_url IS NOT NULL)
    OR status <> 'uploaded'
  )
);
CREATE INDEX IF NOT EXISTS youtube_export_jobs_user_date
  ON public.youtube_export_jobs (user_id, created_at DESC);
ALTER TABLE public.youtube_export_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view their YouTube exports" ON public.youtube_export_jobs;
CREATE POLICY "Users can view their YouTube exports" ON public.youtube_export_jobs
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.youtube_export_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, artist_name, title, privacy, status, youtube_video_id, youtube_url, error_code, created_at, finished_at)
  ON public.youtube_export_jobs TO authenticated;
GRANT ALL ON public.youtube_export_jobs TO service_role;

-- Serialize reservations so simultaneous artists cannot exceed the shared daily cap.
CREATE OR REPLACE FUNCTION public.reserve_youtube_export_job(
  p_id uuid, p_user_id uuid, p_artist_name text, p_title text, p_privacy text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_count bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('rgodbeat-youtube-daily-limit', 0));
  SELECT count(*) INTO v_count FROM public.youtube_export_jobs
    WHERE created_at >= (date_trunc('day', timezone('UTC', now())) AT TIME ZONE 'UTC');
  IF v_count >= 80 THEN RETURN false; END IF;
  INSERT INTO public.youtube_export_jobs(id, user_id, artist_name, title, privacy, status)
    VALUES (p_id, p_user_id, p_artist_name, p_title, p_privacy, 'processing');
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_youtube_export_job(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_youtube_export_job(uuid, uuid, text, text, text) TO service_role;

COMMIT;
