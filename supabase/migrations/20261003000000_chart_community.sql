-- Additive community support. No beat, file, purchase or existing vote is removed.
BEGIN;

CREATE TABLE IF NOT EXISTS public.beat_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  beat_id uuid NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  author_name text NOT NULL CHECK (char_length(author_name) BETWEEN 1 AND 60),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 2 AND 600),
  created_at timestamptz NOT NULL DEFAULT now(),
  is_hidden boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS beat_comments_visible ON public.beat_comments (beat_id, created_at DESC, id DESC) WHERE NOT is_hidden;
CREATE INDEX IF NOT EXISTS beat_comments_author_date ON public.beat_comments (author_id, created_at DESC);
ALTER TABLE public.beat_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Published beat conversations" ON public.beat_comments;
CREATE POLICY "Published beat conversations" ON public.beat_comments FOR SELECT TO anon, authenticated
USING (NOT is_hidden AND EXISTS (SELECT 1 FROM public.beats b WHERE b.id = beat_id AND b.published));
REVOKE ALL ON public.beat_comments FROM anon, authenticated;
GRANT SELECT (id, beat_id, author_name, body, created_at) ON public.beat_comments TO anon, authenticated;
GRANT ALL ON public.beat_comments TO service_role;

-- Weekly periods and publication are checked by the authenticated server API.
-- Prevent bypassing that API with client-supplied future or past weeks.
REVOKE INSERT, UPDATE, DELETE ON public.beat_votes FROM anon, authenticated;
DROP POLICY IF EXISTS "Users can cast their own votes" ON public.beat_votes;

-- Both operations execute under one transaction. A duplicate vote never increments metrics.
CREATE OR REPLACE FUNCTION public.cast_weekly_beat_vote(p_user_id uuid, p_beat_id uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_beat public.beats%ROWTYPE;
  v_id uuid;
  v_week text := to_char(timezone('UTC', now()), 'IYYY-"W"IW');
  v_metrics jsonb;
  v_favorites bigint;
  v_score numeric;
BEGIN
  SELECT * INTO v_beat FROM public.beats WHERE id = p_beat_id AND published FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Beat no disponible' USING ERRCODE = 'P0002'; END IF;
  INSERT INTO public.beat_votes(user_id, beat_id, week_period) VALUES (p_user_id, p_beat_id, v_week)
    ON CONFLICT (user_id, beat_id, week_period) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN RETURN jsonb_build_object('alreadyVoted', true); END IF;
  v_metrics := coalesce(v_beat.performance_metrics, '{}'::jsonb);
  v_favorites := coalesce((v_metrics->>'favorites')::bigint, 0) + 1;
  v_metrics := jsonb_set(v_metrics, '{favorites}', to_jsonb(v_favorites));
  v_score := coalesce((v_metrics->>'plays')::numeric, 0) + v_favorites * 5 + coalesce((v_metrics->>'sales_count')::numeric, 0) * 20;
  UPDATE public.beats SET performance_metrics = v_metrics, performance_score = v_score WHERE id = p_beat_id;
  RETURN jsonb_build_object('alreadyVoted', false, 'favorites', v_favorites);
END;
$$;
REVOKE ALL ON FUNCTION public.cast_weekly_beat_vote(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_weekly_beat_vote(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.post_beat_comment(p_user_id uuid, p_beat_id uuid, p_author_name text, p_body text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_comment public.beat_comments%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  IF NOT EXISTS (SELECT 1 FROM public.beats WHERE id = p_beat_id AND published) THEN
    RAISE EXCEPTION 'Beat no disponible' USING ERRCODE = 'P0002';
  END IF;
  IF EXISTS (SELECT 1 FROM public.beat_comments WHERE author_id = p_user_id AND created_at > now() - interval '15 seconds') THEN
    RAISE EXCEPTION 'Espera unos segundos antes de comentar de nuevo' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.beat_comments(beat_id, author_id, author_name, body)
    VALUES (p_beat_id, p_user_id, left(btrim(p_author_name), 60), btrim(p_body)) RETURNING * INTO v_comment;
  RETURN to_jsonb(v_comment);
END;
$$;
REVOKE ALL ON FUNCTION public.post_beat_comment(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_beat_comment(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_beat_activity(p_week text, p_previous_week text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'votes', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM (
      SELECT bv.beat_id, bv.week_period, count(*) AS votes FROM public.beat_votes bv
      JOIN public.beats b ON b.id = bv.beat_id AND b.published
      WHERE bv.week_period IN (p_week, p_previous_week) GROUP BY bv.beat_id, bv.week_period
    ) v), '[]'::jsonb),
    'comments', coalesce((SELECT jsonb_object_agg(c.beat_id, c.amount) FROM (
      SELECT bc.beat_id, count(*) AS amount FROM public.beat_comments bc
      JOIN public.beats b ON b.id = bc.beat_id AND b.published
      WHERE NOT bc.is_hidden GROUP BY bc.beat_id
    ) c), '{}'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.get_public_beat_activity(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_beat_activity(text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
