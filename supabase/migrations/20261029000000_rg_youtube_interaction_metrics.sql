-- RG TOP 23: Persist YouTube like_count and comment_count alongside view_count
-- on rg_youtube_metric_snapshots for artist, track, beat profiles and ranking telemetry.
BEGIN;

ALTER TABLE public.rg_youtube_metric_snapshots
  ADD COLUMN IF NOT EXISTS like_count bigint CHECK (like_count IS NULL OR like_count >= 0),
  ADD COLUMN IF NOT EXISTS comment_count bigint CHECK (comment_count IS NULL OR comment_count >= 0);

COMMIT;

