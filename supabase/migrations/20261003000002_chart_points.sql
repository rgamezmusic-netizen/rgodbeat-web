-- Weekly community score: 5 points per vote and 1 per visible comment.
-- Existing comments, votes, beats and purchase records remain untouched.
BEGIN;

CREATE INDEX IF NOT EXISTS beat_comments_visible_date
  ON public.beat_comments (created_at, beat_id) WHERE NOT is_hidden;

CREATE OR REPLACE FUNCTION public.get_public_beat_activity(p_week text, p_previous_week text)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'votes', coalesce((SELECT jsonb_agg(to_jsonb(v)) FROM (
      SELECT bv.beat_id, bv.week_period, count(*) AS votes FROM public.beat_votes bv
      JOIN public.beats b ON b.id = bv.beat_id AND b.published
      WHERE bv.week_period IN (p_week, p_previous_week)
      GROUP BY bv.beat_id, bv.week_period
    ) v), '[]'::jsonb),
    'comments', coalesce((SELECT jsonb_object_agg(c.beat_id, c.amount) FROM (
      SELECT bc.beat_id, count(*) AS amount FROM public.beat_comments bc
      JOIN public.beats b ON b.id = bc.beat_id AND b.published
      WHERE NOT bc.is_hidden GROUP BY bc.beat_id
    ) c), '{}'::jsonb),
    'commentsByWeek', coalesce((SELECT jsonb_agg(to_jsonb(cw)) FROM (
      SELECT bc.beat_id,
        to_char(timezone('UTC', bc.created_at), 'IYYY-"W"IW') AS week_period,
        count(*) AS comments
      FROM public.beat_comments bc
      JOIN public.beats b ON b.id = bc.beat_id AND b.published
      WHERE NOT bc.is_hidden
        AND bc.created_at >= timezone('UTC', to_date(p_previous_week || '-1', 'IYYY-"W"IW-ID')::timestamp)
        AND bc.created_at < timezone('UTC', (to_date(p_week || '-1', 'IYYY-"W"IW-ID') + 7)::timestamp)
      GROUP BY bc.beat_id, to_char(timezone('UTC', bc.created_at), 'IYYY-"W"IW')
    ) cw), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_beat_activity(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_beat_activity(text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
