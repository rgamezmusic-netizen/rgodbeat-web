-- Allow same-day refreshes of view_count, like_count, comment_count, and captured_at
-- on public.rg_youtube_metric_snapshots while preserving append-only protection against
-- DELETE and against mutating identity columns (id, publication_id, observed_day, created_at).

BEGIN;

CREATE OR REPLACE FUNCTION public.rg_guard_youtube_metric_snapshots()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'rg_ledger_is_append_only' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.publication_id IS DISTINCT FROM NEW.publication_id
     OR OLD.observed_day IS DISTINCT FROM NEW.observed_day
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'rg_ledger_is_append_only' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.rg_guard_youtube_metric_snapshots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS rg_youtube_metrics_append_only ON public.rg_youtube_metric_snapshots;
CREATE TRIGGER rg_youtube_metrics_append_only
  BEFORE UPDATE OR DELETE ON public.rg_youtube_metric_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.rg_guard_youtube_metric_snapshots();

GRANT UPDATE (view_count, like_count, comment_count, captured_at) ON public.rg_youtube_metric_snapshots TO service_role;

COMMIT;
