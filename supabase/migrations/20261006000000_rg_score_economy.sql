-- RG TOP 23 Phase 2: seasons, verified score ledger, rankings, internal RG ledger,
-- reward pool, sponsorship, support cycles, and season reward records.
-- Existing ranking, commerce, Studio, YouTube, and authentication tables remain intact.
BEGIN;

CREATE TABLE public.rg_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_number integer NOT NULL UNIQUE CHECK (season_number > 0),
  name text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'ended', 'finalized')),
  rules_version integer NOT NULL DEFAULT 1 CHECK (rules_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz,
  CHECK (ends_at > starts_at),
  CHECK ((status = 'finalized') = (finalized_at IS NOT NULL))
);
CREATE UNIQUE INDEX rg_seasons_one_active ON public.rg_seasons ((status)) WHERE status = 'active';
CREATE INDEX rg_seasons_window ON public.rg_seasons(starts_at, ends_at);

CREATE TABLE public.rg_economy_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  season_anchor_at timestamptz NOT NULL DEFAULT now(),
  support_anchor_at timestamptz NOT NULL DEFAULT now(),
  rules_version integer NOT NULL DEFAULT 1 CHECK (rules_version > 0),
  rg_per_usd_cent integer NOT NULL DEFAULT 1 CHECK (rg_per_usd_cent > 0),
  max_rg_discount_percent integer NOT NULL DEFAULT 50 CHECK (max_rg_discount_percent BETWEEN 0 AND 50),
  purchases_enabled boolean NOT NULL DEFAULT false,
  redemption_enabled boolean NOT NULL DEFAULT false,
  sponsor_fulfillment_enabled boolean NOT NULL DEFAULT false,
  purchase_price_cents_per_rg numeric(12,6),
  wallet_purchase_cap_per_user_rg bigint NOT NULL DEFAULT 0 CHECK (wallet_purchase_cap_per_user_rg >= 0),
  maximum_outstanding_rg bigint NOT NULL DEFAULT 0 CHECK (maximum_outstanding_rg BETWEEN 0 AND 9007199254740991),
  season_issuance_cap bigint NOT NULL DEFAULT 0 CHECK (season_issuance_cap BETWEEN 0 AND 9007199254740991),
  minimum_pool_rg bigint NOT NULL DEFAULT 0 CHECK (minimum_pool_rg >= 0),
  maximum_pool_rg bigint NOT NULL DEFAULT 0 CHECK (maximum_pool_rg >= minimum_pool_rg AND maximum_pool_rg <= 9007199254740991),
  base_pool_rg bigint NOT NULL DEFAULT 0 CHECK (base_pool_rg >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.rg_economy_config(id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.rg_rule_versions (
  version integer PRIMARY KEY CHECK (version > 0),
  score_rules jsonb NOT NULL,
  youtube_view_milestones jsonb NOT NULL,
  support_tiers jsonb NOT NULL,
  reward_distribution jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);
INSERT INTO public.rg_rule_versions(version,score_rules,youtube_view_milestones,support_tiers,reward_distribution,notes)
VALUES(1,
  '{"TRACK_PUBLISHED":{"points":10,"enabled":true,"once":"track","per_artist_season_cap":10},"YOUTUBE_VIEW_MILESTONE":{"points":0,"enabled":true,"once":"publication_milestone","per_artist_season_cap":6},"LICENSE_PURCHASED":{"points":0,"enabled":false,"once":"source","per_artist_season_cap":20},"TOP23_ENTRY":{"points":1,"enabled":false,"once":"artist_season","per_artist_season_cap":1},"TOP10_ENTRY":{"points":3,"enabled":false,"once":"artist_season","per_artist_season_cap":1}}'::jsonb,
  '{"1000":{"points":3},"5000":{"points":4},"10000":{"points":6},"25000":{"points":10},"50000":{"points":15},"100000":{"points":20}}'::jsonb,
  '[{"minimum":0,"pool_bps":9000,"name":"SUPPORTER"},{"minimum":1000,"pool_bps":9300,"name":"BOOSTER"},{"minimum":5000,"pool_bps":9600,"name":"POWER BOOSTER"},{"minimum":15000,"pool_bps":10000,"name":"ELITE / MAJOR PARTNER"}]'::jsonb,
  '{"1":40,"2":25,"3":15,"reserve":20,"premium_days":{"1":30,"2":15,"3":15}}'::jsonb,
  'Initial additive RG TOP 23 rules. Changes require a new immutable version.'
);
ALTER TABLE public.rg_economy_config ADD CONSTRAINT rg_economy_active_rules_fk FOREIGN KEY (rules_version) REFERENCES public.rg_rule_versions(version) ON DELETE RESTRICT;
ALTER TABLE public.rg_seasons ADD CONSTRAINT rg_seasons_rules_version_fk FOREIGN KEY (rules_version) REFERENCES public.rg_rule_versions(version) ON DELETE RESTRICT;

CREATE TABLE public.rg_score_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('TRACK_PUBLISHED','YOUTUBE_VIEW_MILESTONE','LICENSE_PURCHASED','TOP23_ENTRY','TOP10_ENTRY','PARTICIPATION_MILESTONE','ACHIEVEMENT_UNLOCKED')),
  category text NOT NULL CHECK (category IN ('CREATION','PERFORMANCE','COMMERCE','COMMUNITY','ACHIEVEMENTS')),
  artist_id uuid REFERENCES public.rg_artists(id) ON DELETE SET NULL,
  track_id uuid REFERENCES public.rg_tracks(id) ON DELETE SET NULL,
  beat_id uuid REFERENCES public.beats(id) ON DELETE SET NULL,
  publication_id uuid REFERENCES public.rg_publication_links(id) ON DELETE SET NULL,
  source_type text NOT NULL CHECK (char_length(btrim(source_type)) BETWEEN 1 AND 64),
  source_id text NOT NULL CHECK (char_length(btrim(source_id)) BETWEEN 1 AND 200),
  milestone_key text,
  score_points integer NOT NULL CHECK (score_points >= 0),
  rules_version integer NOT NULL CHECK (rules_version > 0),
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT rg_score_event_idempotency UNIQUE NULLS NOT DISTINCT (season_id, event_type, source_type, source_id, milestone_key)
);
CREATE UNIQUE INDEX rg_score_track_published_once ON public.rg_score_events(track_id)
  WHERE event_type = 'TRACK_PUBLISHED' AND track_id IS NOT NULL;
CREATE UNIQUE INDEX rg_score_youtube_milestone_once ON public.rg_score_events(publication_id,milestone_key)
  WHERE event_type = 'YOUTUBE_VIEW_MILESTONE';
CREATE INDEX rg_score_season_artist ON public.rg_score_events(season_id, artist_id, score_points DESC);
CREATE INDEX rg_score_season_track ON public.rg_score_events(season_id, track_id, score_points DESC);
CREATE INDEX rg_score_season_beat ON public.rg_score_events(season_id, beat_id, score_points DESC) WHERE beat_id IS NOT NULL;

CREATE TABLE public.rg_youtube_metric_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.rg_publication_links(id) ON DELETE RESTRICT,
  observed_day date NOT NULL,
  view_count bigint NOT NULL CHECK (view_count >= 0),
  captured_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id,observed_day)
);
CREATE INDEX rg_youtube_metrics_recent ON public.rg_youtube_metric_snapshots(publication_id,captured_at DESC);

CREATE TABLE public.rg_rank_snapshot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  run_type text NOT NULL CHECK (run_type IN ('scheduled','final')),
  snapshot_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, id)
);
CREATE UNIQUE INDEX rg_rank_one_final_run ON public.rg_rank_snapshot_runs(season_id) WHERE run_type = 'final';

CREATE UNIQUE INDEX rg_rank_one_daily_run ON public.rg_rank_snapshot_runs(season_id,snapshot_day) WHERE run_type = 'scheduled';

CREATE TABLE public.rg_rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.rg_rank_snapshot_runs(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  ranking_type text NOT NULL CHECK (ranking_type IN ('tracks','artists','beats')),
  entity_id uuid NOT NULL,
  rank integer NOT NULL CHECK (rank > 0),
  score bigint NOT NULL CHECK (score >= 0),
  previous_rank integer CHECK (previous_rank IS NULL OR previous_rank > 0),
  movement integer,
  is_new boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, ranking_type, entity_id),
  UNIQUE (run_id, ranking_type, rank),
  FOREIGN KEY (season_id,run_id) REFERENCES public.rg_rank_snapshot_runs(season_id,id) ON DELETE RESTRICT
);
CREATE INDEX rg_rank_snapshots_entity ON public.rg_rank_snapshots(season_id, ranking_type, entity_id, created_at DESC);

CREATE TABLE public.rg_coin_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  artist_id uuid REFERENCES public.rg_artists(id) ON DELETE SET NULL,
  amount bigint NOT NULL CHECK (amount <> 0),
  origin_type text NOT NULL CHECK (origin_type IN ('EARNED_RG','PURCHASED_RG','SEASON_REWARD','SPONSOR_CONTRIBUTION','POOL_CONTRIBUTION','REDEMPTION','RESERVE_TRANSFER','ADMIN_CORRECTION')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 1 AND 160),
  source_type text NOT NULL,
  source_id text NOT NULL,
  idempotency_key text NOT NULL UNIQUE,
  season_id uuid REFERENCES public.rg_seasons(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (origin_type,source_type,source_id,user_id)
);
CREATE INDEX rg_coin_ledger_user_created ON public.rg_coin_ledger(user_id, created_at DESC);
CREATE INDEX rg_coin_ledger_season ON public.rg_coin_ledger(season_id, origin_type);

CREATE TABLE public.rg_sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  logo_path text,
  website_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','suspended','retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rg_support_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES public.rg_sponsors(id) ON DELETE SET NULL,
  cycle_number integer NOT NULL CHECK (cycle_number >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  contributed_rg bigint NOT NULL DEFAULT 0 CHECK (contributed_rg >= 0),
  support_level text NOT NULL DEFAULT 'SUPPORTER',
  pool_split_bps integer NOT NULL DEFAULT 9000 CHECK (pool_split_bps BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  -- Both references may become null when an account is deleted; the RPC requires exactly one on creation.
  CHECK (num_nonnulls(user_id,sponsor_id) <= 1)
);
CREATE UNIQUE INDEX rg_support_cycle_user_unique ON public.rg_support_cycles(user_id, cycle_number) WHERE user_id IS NOT NULL;
CREATE UNIQUE INDEX rg_support_cycle_sponsor_unique ON public.rg_support_cycles(sponsor_id, cycle_number) WHERE sponsor_id IS NOT NULL;

CREATE TABLE public.rg_reward_pool_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  transaction_type text NOT NULL CHECK (transaction_type IN ('BASE_ISSUANCE','ACTIVITY','COMMERCE','USER_CONTRIBUTION','SPONSOR_CONTRIBUTION','BUY_AND_BOOST','RESERVE_TRANSFER','SEASON_REWARD','CORRECTION')),
  source_type text NOT NULL,
  source_id text NOT NULL,
  gross_rg bigint NOT NULL DEFAULT 0 CHECK (gross_rg >= 0),
  pool_rg bigint NOT NULL DEFAULT 0,
  reserve_rg bigint NOT NULL DEFAULT 0,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sponsor_id uuid REFERENCES public.rg_sponsors(id) ON DELETE SET NULL,
  support_cycle_id uuid REFERENCES public.rg_support_cycles(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (transaction_type IN ('SEASON_REWARD','RESERVE_TRANSFER') OR pool_rg + reserve_rg = gross_rg),
  CHECK (transaction_type IN ('SEASON_REWARD','RESERVE_TRANSFER') OR (gross_rg >= 0 AND pool_rg >= 0 AND reserve_rg >= 0)),
  UNIQUE (transaction_type,source_type,source_id)
);
CREATE INDEX rg_pool_season_created ON public.rg_reward_pool_transactions(season_id, created_at);

CREATE TABLE public.rg_season_sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_id uuid NOT NULL REFERENCES public.rg_sponsors(id) ON DELETE RESTRICT,
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  contribution_rg bigint NOT NULL DEFAULT 0 CHECK (contribution_rg >= 0),
  gross_purchase_value numeric(12,2) CHECK (gross_purchase_value IS NULL OR gross_purchase_value >= 0),
  payment_reference text UNIQUE,
  visibility_tier text NOT NULL DEFAULT 'OFFICIAL_SPONSOR' CHECK (visibility_tier IN ('OFFICIAL_SPONSOR','SEASON_PARTNER','GOLD_PARTNER','TITLE_PARTNER')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','completed','cancelled')),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (ends_at > starts_at)
);
CREATE INDEX rg_sponsorship_season_active ON public.rg_season_sponsorships(season_id, status, starts_at, ends_at);

CREATE TABLE public.rg_season_finalizations (
  season_id uuid PRIMARY KEY REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  rank_run_id uuid NOT NULL REFERENCES public.rg_rank_snapshot_runs(id) ON DELETE RESTRICT,
  final_pool_rg bigint NOT NULL CHECK (final_pool_rg >= 0),
  finalized_at timestamptz NOT NULL,
  rules_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rg_season_rewards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.rg_seasons(id) ON DELETE RESTRICT,
  artist_id uuid REFERENCES public.rg_artists(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  place integer NOT NULL CHECK (place BETWEEN 1 AND 3),
  coin_rg bigint NOT NULL CHECK (coin_rg >= 0),
  premium_days integer NOT NULL CHECK (premium_days >= 0),
  coin_ledger_id uuid REFERENCES public.rg_coin_ledger(id) ON DELETE SET NULL,
  premium_granted_at timestamptz,
  premium_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, place),
  UNIQUE (season_id, artist_id)
);

-- All Phase 2 records are server controlled. Existing table RLS/policies are untouched.
ALTER TABLE public.rg_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_economy_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_youtube_metric_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_rank_snapshot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_rank_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_coin_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_support_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_reward_pool_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_season_sponsorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_season_finalizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rg_season_rewards ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['rg_seasons','rg_economy_config','rg_rule_versions','rg_score_events','rg_youtube_metric_snapshots','rg_rank_snapshot_runs','rg_rank_snapshots','rg_coin_ledger','rg_sponsors','rg_support_cycles','rg_reward_pool_transactions','rg_season_sponsorships','rg_season_finalizations','rg_season_rewards'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO service_role', t);
  END LOOP;
END $$;
GRANT UPDATE ON public.rg_economy_config TO service_role;
GRANT INSERT ON public.rg_rule_versions TO service_role;
GRANT INSERT ON public.rg_youtube_metric_snapshots TO service_role;
GRANT INSERT,UPDATE ON public.rg_sponsors,public.rg_season_sponsorships TO service_role;

CREATE FUNCTION public.rg_ensure_seasons(p_now timestamptz DEFAULT now()) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_anchor timestamptz; v_number integer; v_current uuid;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('rg_season_calendar', 0));
  SELECT season_anchor_at INTO v_anchor FROM public.rg_economy_config WHERE id = true;
  v_number := greatest(1, floor(extract(epoch FROM (p_now - v_anchor)) / (14 * 86400))::integer + 1);
  UPDATE public.rg_seasons SET status = 'ended'
    WHERE status = 'active' AND ends_at <= p_now;
  INSERT INTO public.rg_seasons(season_number, name, starts_at, ends_at, status, rules_version)
  SELECT n, 'RG TOP 23 — Season ' || lpad(n::text, 2, '0'), v_anchor + ((n - 1) * interval '14 days'), v_anchor + (n * interval '14 days'),
    CASE WHEN n = v_number THEN 'active' ELSE 'ended' END,
    (SELECT rules_version FROM public.rg_economy_config WHERE id = true)
  FROM generate_series(1, v_number + 1) AS seasons(n)
  ON CONFLICT (season_number) DO NOTHING;
  UPDATE public.rg_seasons SET status = 'ended'
    WHERE season_number < v_number AND status IN ('scheduled','active');
  UPDATE public.rg_seasons SET status = 'active'
    WHERE season_number = v_number AND status = 'scheduled';
  UPDATE public.rg_seasons SET status = 'scheduled'
    WHERE season_number = v_number + 1 AND status = 'ended';
  SELECT id INTO v_current FROM public.rg_seasons WHERE season_number = v_number;
  RETURN v_current;
END;
$$;
REVOKE ALL ON FUNCTION public.rg_ensure_seasons(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_ensure_seasons(timestamptz) TO service_role;
SELECT public.rg_ensure_seasons(now());

-- Score points are selected from server configuration. Client roles cannot execute this RPC.
CREATE FUNCTION public.rg_record_score_event(
  p_event_type text, p_artist_id uuid, p_track_id uuid, p_beat_id uuid,
  p_publication_id uuid, p_source_type text, p_source_id text, p_milestone_key text DEFAULT NULL,
  p_verified_at timestamptz DEFAULT now(), p_evidence jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_season_id uuid; v_rule jsonb; v_milestones jsonb; v_points integer; v_version integer; v_category text; v_id uuid; v_track_beat uuid; v_artist_cap integer; v_threshold bigint; v_verified_at timestamptz;
BEGIN
  v_season_id := public.rg_ensure_seasons(now());
  v_verified_at:=p_verified_at;
  IF p_event_type='TRACK_PUBLISHED' THEN
    SELECT published_at INTO v_verified_at FROM public.rg_publication_links WHERE id=p_publication_id;
  ELSIF p_event_type='YOUTUBE_VIEW_MILESTONE' THEN
    SELECT captured_at INTO v_verified_at FROM public.rg_youtube_metric_snapshots
      WHERE publication_id=p_publication_id AND captured_at=p_verified_at;
    IF NOT FOUND THEN RAISE EXCEPTION 'youtube_milestone_snapshot_unverified' USING ERRCODE = 'P0001'; END IF;
  END IF;
  SELECT id INTO v_season_id FROM public.rg_seasons WHERE v_verified_at>=starts_at AND v_verified_at<ends_at;
  IF v_season_id IS NULL THEN RAISE EXCEPTION 'score_publication_outside_season' USING ERRCODE = 'P0001'; END IF;
  PERFORM 1 FROM public.rg_seasons WHERE id=v_season_id FOR SHARE;
  SELECT rules_version INTO v_version FROM public.rg_seasons WHERE id=v_season_id;
  SELECT score_rules -> p_event_type, youtube_view_milestones INTO v_rule, v_milestones FROM public.rg_rule_versions WHERE version=v_version;
  IF v_rule IS NULL OR coalesce((v_rule ->> 'enabled')::boolean, false) IS NOT TRUE THEN RAISE EXCEPTION 'score_rule_disabled' USING ERRCODE = 'P0001'; END IF;
  IF p_event_type = 'YOUTUBE_VIEW_MILESTONE' THEN
    IF p_milestone_key IS NULL OR v_milestones -> p_milestone_key IS NULL THEN RAISE EXCEPTION 'youtube_milestone_invalid' USING ERRCODE = 'P0001'; END IF;
    v_threshold := p_milestone_key::bigint;
    v_points := coalesce((v_milestones -> p_milestone_key ->> 'points')::integer,0);
    IF coalesce((p_evidence ->> 'view_count')::bigint,0) < v_threshold THEN RAISE EXCEPTION 'youtube_milestone_unverified' USING ERRCODE = 'P0001'; END IF;
  ELSE
    v_points := coalesce((v_rule ->> 'points')::integer, 0);
  END IF;
  IF v_points <= 0 THEN RAISE EXCEPTION 'score_rule_has_no_points' USING ERRCODE = 'P0001'; END IF;
  IF p_source_type IS NULL OR length(btrim(p_source_type)) = 0 OR p_source_id IS NULL OR length(btrim(p_source_id)) = 0 THEN RAISE EXCEPTION 'score_source_required' USING ERRCODE = 'P0001'; END IF;
  IF p_track_id IS NOT NULL THEN
    SELECT beat_id INTO v_track_beat FROM public.rg_tracks WHERE id = p_track_id AND status = 'published';
    IF NOT FOUND THEN RAISE EXCEPTION 'score_track_unverified' USING ERRCODE = 'P0001'; END IF;
    IF v_track_beat IS DISTINCT FROM p_beat_id THEN RAISE EXCEPTION 'score_beat_mismatch' USING ERRCODE = 'P0001'; END IF;
    IF p_artist_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.rg_track_artists WHERE track_id=p_track_id AND artist_id=p_artist_id AND role='primary') THEN
      RAISE EXCEPTION 'score_artist_track_unverified' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF p_artist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rg_artists WHERE id=p_artist_id AND status='active') THEN
    RAISE EXCEPTION 'score_artist_inactive' USING ERRCODE = 'P0001';
  END IF;
  IF p_event_type = 'TRACK_PUBLISHED' THEN
    IF p_publication_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.rg_publication_links p WHERE p.id = p_publication_id AND p.track_id = p_track_id AND p.artist_id = p_artist_id
    ) THEN RAISE EXCEPTION 'score_publication_unverified' USING ERRCODE = 'P0001'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_track_id::text,5));
    SELECT id INTO v_id FROM public.rg_score_events WHERE event_type='TRACK_PUBLISHED' AND track_id=p_track_id;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF p_source_type <> 'rg_publication_link' OR p_source_id <> p_publication_id::text OR NOT EXISTS (
      SELECT 1 FROM public.rg_publication_links p JOIN public.rg_seasons s ON s.id=v_season_id
      WHERE p.id=p_publication_id AND p.published_at>=s.starts_at AND p.published_at<s.ends_at
    ) THEN RAISE EXCEPTION 'score_publication_outside_season' USING ERRCODE = 'P0001'; END IF;
  ELSIF p_event_type = 'YOUTUBE_VIEW_MILESTONE' THEN
    IF p_publication_id IS NULL OR p_source_type <> 'youtube_publication' OR p_source_id <> p_publication_id::text OR NOT EXISTS (
      SELECT 1 FROM public.rg_publication_links p WHERE p.id=p_publication_id AND p.track_id=p_track_id AND p.artist_id=p_artist_id
    ) THEN RAISE EXCEPTION 'youtube_publication_unverified' USING ERRCODE = 'P0001'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_publication_id::text||':'||p_milestone_key,7));
    SELECT id INTO v_id FROM public.rg_score_events WHERE event_type=p_event_type AND publication_id=p_publication_id AND milestone_key=p_milestone_key;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.rg_youtube_metric_snapshots
      WHERE publication_id=p_publication_id AND observed_day=(p_verified_at AT TIME ZONE 'UTC')::date AND view_count>=v_threshold)
      OR NOT EXISTS (SELECT 1 FROM public.rg_youtube_metric_snapshots WHERE publication_id=p_publication_id
        AND observed_day<(p_verified_at AT TIME ZONE 'UTC')::date)
      OR (SELECT max(view_count) FROM public.rg_youtube_metric_snapshots WHERE publication_id=p_publication_id
        AND observed_day<(p_verified_at AT TIME ZONE 'UTC')::date)>=v_threshold THEN
      RAISE EXCEPTION 'youtube_milestone_snapshot_unverified' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rg_seasons WHERE id=v_season_id AND status IN ('active','ended')
    AND v_verified_at>=starts_at AND v_verified_at<ends_at AND v_verified_at<=clock_timestamp()) THEN
    RAISE EXCEPTION 'score_verification_outside_season' USING ERRCODE = 'P0001';
  END IF;
  v_artist_cap := coalesce((v_rule ->> 'per_artist_season_cap')::integer,0);
  IF p_artist_id IS NOT NULL AND v_artist_cap > 0 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_season_id::text||':'||p_artist_id::text||':'||p_event_type,6));
  END IF;
  IF p_artist_id IS NOT NULL AND v_artist_cap > 0 AND
    (SELECT count(*) FROM public.rg_score_events WHERE season_id=v_season_id AND artist_id=p_artist_id AND event_type=p_event_type) >= v_artist_cap THEN
    RAISE EXCEPTION 'score_artist_season_cap' USING ERRCODE = 'P0001';
  END IF;
  v_category := CASE p_event_type WHEN 'TRACK_PUBLISHED' THEN 'CREATION' WHEN 'YOUTUBE_VIEW_MILESTONE' THEN 'PERFORMANCE' WHEN 'LICENSE_PURCHASED' THEN 'COMMERCE' ELSE 'ACHIEVEMENTS' END;
  INSERT INTO public.rg_score_events(season_id,event_type,category,artist_id,track_id,beat_id,publication_id,source_type,source_id,milestone_key,score_points,rules_version,verified_at,evidence)
  VALUES (v_season_id,p_event_type,v_category,p_artist_id,p_track_id,p_beat_id,p_publication_id,p_source_type,p_source_id,p_milestone_key,v_points,v_version,v_verified_at,coalesce(p_evidence,'{}'::jsonb))
  ON CONFLICT (season_id,event_type,source_type,source_id,milestone_key) DO NOTHING RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.rg_score_events WHERE season_id=v_season_id AND event_type=p_event_type AND source_type=p_source_type
      AND source_id=p_source_id AND milestone_key IS NOT DISTINCT FROM p_milestone_key
      AND artist_id IS NOT DISTINCT FROM p_artist_id AND track_id IS NOT DISTINCT FROM p_track_id
      AND beat_id IS NOT DISTINCT FROM p_beat_id AND publication_id IS NOT DISTINCT FROM p_publication_id AND score_points=v_points;
    IF v_id IS NULL THEN RAISE EXCEPTION 'score_idempotency_key_conflict' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.rg_record_score_event(text,uuid,uuid,uuid,uuid,text,text,text,timestamptz,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_record_score_event(text,uuid,uuid,uuid,uuid,text,text,text,timestamptz,jsonb) TO service_role;

CREATE FUNCTION public.rg_credit_coins(
  p_user_id uuid, p_artist_id uuid, p_amount bigint, p_origin_type text, p_reason text,
  p_source_type text, p_source_id text, p_idempotency_key text, p_season_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_id uuid; v_outstanding bigint; v_cap bigint; v_config public.rg_economy_config%ROWTYPE; v_issued bigint;
BEGIN
  IF p_amount<=0 OR p_origin_type NOT IN ('EARNED_RG','PURCHASED_RG','SPONSOR_CONTRIBUTION','ADMIN_CORRECTION') OR p_user_id IS NULL
    OR length(btrim(coalesce(p_idempotency_key,'')))=0 OR length(btrim(coalesce(p_source_type,'')))=0 OR length(btrim(coalesce(p_source_id,'')))=0 THEN
    RAISE EXCEPTION 'invalid_coin_credit' USING ERRCODE = 'P0001';
  END IF;
  IF p_artist_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rg_artists WHERE id=p_artist_id AND user_id=p_user_id AND status='active') THEN
    RAISE EXCEPTION 'coin_artist_ownership_invalid' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key,4));
  SELECT id INTO v_id FROM public.rg_coin_ledger WHERE idempotency_key=p_idempotency_key;
  IF v_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.rg_coin_ledger WHERE id=v_id AND user_id=p_user_id AND artist_id IS NOT DISTINCT FROM p_artist_id
      AND amount=p_amount AND origin_type=p_origin_type AND reason=p_reason AND source_type=p_source_type AND source_id=p_source_id
      AND season_id IS NOT DISTINCT FROM p_season_id) THEN RAISE EXCEPTION 'coin_idempotency_key_conflict' USING ERRCODE = 'P0001'; END IF;
    RETURN v_id;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('rg_economy_supply',0));
  SELECT * INTO v_config FROM public.rg_economy_config WHERE id=true;
  IF p_origin_type='PURCHASED_RG' AND NOT v_config.purchases_enabled
     OR p_origin_type='SPONSOR_CONTRIBUTION' AND NOT v_config.sponsor_fulfillment_enabled THEN
    RAISE EXCEPTION 'rg_payment_fulfillment_disabled' USING ERRCODE = 'P0001';
  END IF;
  IF p_origin_type='EARNED_RG' THEN
    IF p_season_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.rg_seasons WHERE id=p_season_id AND status='active' AND starts_at<=now() AND ends_at>now()) THEN
      RAISE EXCEPTION 'coin_issuance_season_required' USING ERRCODE = 'P0001';
    END IF;
    SELECT coalesce((SELECT sum(amount) FROM public.rg_coin_ledger WHERE season_id=p_season_id AND origin_type='EARNED_RG' AND amount>0),0)
      + coalesce((SELECT sum(gross_rg) FROM public.rg_reward_pool_transactions WHERE season_id=p_season_id AND transaction_type IN ('BASE_ISSUANCE','ACTIVITY','COMMERCE')),0) INTO v_issued;
    IF v_issued+p_amount>v_config.season_issuance_cap THEN RAISE EXCEPTION 'season_issuance_cap_reached' USING ERRCODE = 'P0001'; END IF;
  ELSIF p_origin_type='PURCHASED_RG' AND (SELECT coalesce(sum(amount),0) FROM public.rg_coin_ledger WHERE user_id=p_user_id AND origin_type='PURCHASED_RG')+p_amount>v_config.wallet_purchase_cap_per_user_rg THEN
    RAISE EXCEPTION 'wallet_purchase_cap_reached' USING ERRCODE = 'P0001';
  END IF;
  SELECT coalesce((SELECT sum(amount) FROM public.rg_coin_ledger),0)
       + coalesce((SELECT sum(pool_rg+reserve_rg) FROM public.rg_reward_pool_transactions),0) INTO v_outstanding;
  SELECT maximum_outstanding_rg INTO v_cap FROM public.rg_economy_config WHERE id=true;
  IF v_outstanding+p_amount>v_cap THEN RAISE EXCEPTION 'rg_outstanding_cap_reached' USING ERRCODE = 'P0001'; END IF;
  INSERT INTO public.rg_coin_ledger(user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id,metadata)
  VALUES(p_user_id,p_artist_id,p_amount,p_origin_type,p_reason,p_source_type,p_source_id,p_idempotency_key,p_season_id,coalesce(p_metadata,'{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.rg_credit_coins(uuid,uuid,bigint,text,text,text,text,text,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_credit_coins(uuid,uuid,bigint,text,text,text,text,text,uuid,jsonb) TO service_role;

CREATE FUNCTION public.rg_current_rank_totals(p_season_id uuid)
RETURNS TABLE(ranking_type text, entity_id uuid, score bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
  WITH live_totals AS (
    SELECT 'tracks'::text AS kind,e.track_id AS entity_id,sum(e.score_points)::bigint AS score
      FROM public.rg_score_events e JOIN public.rg_tracks t ON t.id=e.track_id AND t.status='published'
      WHERE e.season_id=p_season_id AND e.track_id IS NOT NULL GROUP BY e.track_id
    UNION ALL
    SELECT 'artists'::text,e.artist_id,sum(e.score_points)::bigint
      FROM public.rg_score_events e JOIN public.rg_artists a ON a.id=e.artist_id AND a.status='active'
      WHERE e.season_id=p_season_id AND e.artist_id IS NOT NULL GROUP BY e.artist_id
    UNION ALL
    SELECT 'beats'::text,e.beat_id,sum(e.score_points)::bigint
      FROM public.rg_score_events e JOIN public.beats b ON b.id=e.beat_id AND b.published=true
      WHERE e.season_id=p_season_id AND e.beat_id IS NOT NULL GROUP BY e.beat_id
  ), totals AS (
    SELECT * FROM live_totals WHERE NOT EXISTS (SELECT 1 FROM public.rg_season_finalizations WHERE season_id=p_season_id)
    UNION ALL
    SELECT r.ranking_type,r.entity_id,r.score FROM public.rg_rank_snapshots r JOIN public.rg_season_finalizations f ON f.rank_run_id=r.run_id WHERE f.season_id=p_season_id
  ), ranked AS (
    SELECT t.kind,t.entity_id,t.score,row_number() OVER (PARTITION BY t.kind ORDER BY t.score DESC,t.entity_id)::integer AS position FROM totals t
  )
  SELECT kind,entity_id,score FROM ranked WHERE position<=23;
$$;
REVOKE ALL ON FUNCTION public.rg_current_rank_totals(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_current_rank_totals(uuid) TO service_role;

CREATE FUNCTION public.rg_capture_rank_snapshot(p_season_id uuid, p_final boolean DEFAULT false) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_run uuid; v_previous uuid;
BEGIN
  PERFORM 1 FROM public.rg_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.rg_seasons WHERE id=p_season_id AND (status <> 'finalized' OR p_final)) THEN
    RAISE EXCEPTION 'season_unavailable' USING ERRCODE = 'P0001';
  END IF;
  IF p_final THEN
    SELECT id INTO v_run FROM public.rg_rank_snapshot_runs WHERE season_id=p_season_id AND run_type='final';
    IF v_run IS NOT NULL THEN RETURN v_run; END IF;
    IF EXISTS (SELECT 1 FROM public.rg_seasons WHERE id=p_season_id AND ends_at>now()) THEN RAISE EXCEPTION 'season_not_ready_to_finalize' USING ERRCODE = 'P0001'; END IF;
  ELSE
    SELECT id INTO v_run FROM public.rg_rank_snapshot_runs WHERE season_id=p_season_id AND run_type='scheduled' AND snapshot_day=(now() AT TIME ZONE 'UTC')::date;
    IF v_run IS NOT NULL THEN RETURN v_run; END IF;
  END IF;
  SELECT id INTO v_previous FROM public.rg_rank_snapshot_runs WHERE season_id=p_season_id ORDER BY captured_at DESC LIMIT 1;
  INSERT INTO public.rg_rank_snapshot_runs(season_id,run_type) VALUES (p_season_id,CASE WHEN p_final THEN 'final' ELSE 'scheduled' END) RETURNING id INTO v_run;

  WITH sums AS (
    SELECT e.track_id AS entity_id, sum(e.score_points)::bigint AS score FROM public.rg_score_events e
      JOIN public.rg_tracks t ON t.id=e.track_id AND t.status='published'
      WHERE e.season_id=p_season_id AND e.track_id IS NOT NULL GROUP BY e.track_id
  ), ranked AS (
    SELECT 'tracks'::text AS kind, s.entity_id, s.score, row_number() OVER (ORDER BY s.score DESC,s.entity_id)::integer AS place FROM sums s
  )
  INSERT INTO public.rg_rank_snapshots(run_id,season_id,ranking_type,entity_id,rank,score,previous_rank,movement,is_new)
  SELECT v_run,p_season_id,r.kind,r.entity_id,r.place,r.score,p.rank,CASE WHEN p.rank IS NULL THEN NULL ELSE p.rank-r.place END,p.rank IS NULL
    FROM ranked r LEFT JOIN public.rg_rank_snapshots p ON p.run_id=v_previous AND p.ranking_type=r.kind AND p.entity_id=r.entity_id WHERE r.place<=23;

  WITH sums AS (
    SELECT e.artist_id AS entity_id, sum(e.score_points)::bigint AS score FROM public.rg_score_events e
      JOIN public.rg_artists a ON a.id=e.artist_id AND a.status='active'
      WHERE e.season_id=p_season_id AND e.artist_id IS NOT NULL GROUP BY e.artist_id
  ), ranked AS (
    SELECT 'artists'::text AS kind, s.entity_id, s.score, row_number() OVER (ORDER BY s.score DESC,s.entity_id)::integer AS place FROM sums s
  )
  INSERT INTO public.rg_rank_snapshots(run_id,season_id,ranking_type,entity_id,rank,score,previous_rank,movement,is_new)
  SELECT v_run,p_season_id,r.kind,r.entity_id,r.place,r.score,p.rank,CASE WHEN p.rank IS NULL THEN NULL ELSE p.rank-r.place END,p.rank IS NULL
    FROM ranked r LEFT JOIN public.rg_rank_snapshots p ON p.run_id=v_previous AND p.ranking_type=r.kind AND p.entity_id=r.entity_id WHERE r.place<=23;

  WITH sums AS (
    SELECT e.beat_id AS entity_id, sum(e.score_points)::bigint AS score FROM public.rg_score_events e
      JOIN public.beats b ON b.id=e.beat_id AND b.published=true
      WHERE e.season_id=p_season_id AND e.beat_id IS NOT NULL GROUP BY e.beat_id
  ), ranked AS (
    SELECT 'beats'::text AS kind, s.entity_id, s.score, row_number() OVER (ORDER BY s.score DESC,s.entity_id)::integer AS place FROM sums s
  )
  INSERT INTO public.rg_rank_snapshots(run_id,season_id,ranking_type,entity_id,rank,score,previous_rank,movement,is_new)
  SELECT v_run,p_season_id,r.kind,r.entity_id,r.place,r.score,p.rank,CASE WHEN p.rank IS NULL THEN NULL ELSE p.rank-r.place END,p.rank IS NULL
    FROM ranked r LEFT JOIN public.rg_rank_snapshots p ON p.run_id=v_previous AND p.ranking_type=r.kind AND p.entity_id=r.entity_id WHERE r.place<=23;
  RETURN v_run;
END; $$;
REVOKE ALL ON FUNCTION public.rg_capture_rank_snapshot(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_capture_rank_snapshot(uuid,boolean) TO service_role;

CREATE FUNCTION public.rg_contribute_to_pool(
  p_season_id uuid, p_user_id uuid, p_sponsor_id uuid, p_amount bigint,
  p_source_type text, p_source_id text, p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  v_anchor timestamptz; v_cycle_number integer; v_starts timestamptz; v_ends timestamptz;
  v_cycle_id uuid; v_total bigint; v_split integer; v_level text; v_pool bigint; v_reserve bigint; v_balance bigint; v_tx uuid; v_pool_total bigint; v_pool_limit bigint; v_outstanding bigint; v_outstanding_cap bigint;
BEGIN
  IF p_amount <= 0 OR (p_user_id IS NULL AND p_sponsor_id IS NULL) OR (p_user_id IS NOT NULL AND p_sponsor_id IS NOT NULL)
    OR length(btrim(coalesce(p_source_type,'')))=0 OR length(btrim(coalesce(p_source_id,'')))=0 OR length(btrim(coalesce(p_idempotency_key,'')))=0 THEN
    RAISE EXCEPTION 'invalid_contribution' USING ERRCODE = 'P0001';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 3));
  PERFORM 1 FROM public.rg_seasons WHERE id=p_season_id FOR UPDATE;
  SELECT id INTO v_tx FROM public.rg_reward_pool_transactions WHERE idempotency_key=p_idempotency_key;
  IF v_tx IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.rg_reward_pool_transactions WHERE id=v_tx AND season_id=p_season_id AND user_id IS NOT DISTINCT FROM p_user_id
      AND sponsor_id IS NOT DISTINCT FROM p_sponsor_id AND gross_rg=p_amount AND source_type=p_source_type AND source_id=p_source_id) THEN
      RAISE EXCEPTION 'pool_idempotency_key_conflict' USING ERRCODE = 'P0001';
    END IF;
    RETURN v_tx;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rg_seasons WHERE id=p_season_id AND status='active' AND starts_at<=now() AND ends_at>now()) THEN RAISE EXCEPTION 'season_unavailable' USING ERRCODE = 'P0001'; END IF;
  IF p_sponsor_id IS NOT NULL AND NOT (SELECT sponsor_fulfillment_enabled FROM public.rg_economy_config WHERE id=true) THEN
    RAISE EXCEPTION 'rg_sponsor_fulfillment_disabled' USING ERRCODE = 'P0001';
  END IF;
  IF p_user_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 1));
    SELECT coalesce(sum(amount),0) INTO v_balance FROM public.rg_coin_ledger WHERE user_id=p_user_id;
    IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_rg_balance' USING ERRCODE = 'P0001'; END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM public.rg_sponsors WHERE id=p_sponsor_id AND status='active') THEN RAISE EXCEPTION 'sponsor_unavailable' USING ERRCODE = 'P0001'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.rg_season_sponsorships WHERE sponsor_id=p_sponsor_id AND season_id=p_season_id AND status='active'
      AND payment_reference=p_source_id AND p_source_type='stripe_checkout_session' AND contribution_rg=p_amount) THEN
      RAISE EXCEPTION 'sponsorship_not_verified' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  SELECT support_anchor_at INTO v_anchor FROM public.rg_economy_config WHERE id=true;
  v_cycle_number := greatest(0,floor(extract(epoch FROM (now()-v_anchor))/(90*86400))::integer);
  v_starts := v_anchor + v_cycle_number * interval '90 days'; v_ends := v_starts + interval '90 days';
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.rg_support_cycles(user_id,cycle_number,starts_at,ends_at) VALUES(p_user_id,v_cycle_number,v_starts,v_ends)
      ON CONFLICT (user_id,cycle_number) WHERE user_id IS NOT NULL DO NOTHING;
    SELECT id,contributed_rg INTO v_cycle_id,v_total FROM public.rg_support_cycles WHERE user_id=p_user_id AND cycle_number=v_cycle_number FOR UPDATE;
  ELSE
    INSERT INTO public.rg_support_cycles(sponsor_id,cycle_number,starts_at,ends_at) VALUES(p_sponsor_id,v_cycle_number,v_starts,v_ends)
      ON CONFLICT (sponsor_id,cycle_number) WHERE sponsor_id IS NOT NULL DO NOTHING;
    SELECT id,contributed_rg INTO v_cycle_id,v_total FROM public.rg_support_cycles WHERE sponsor_id=p_sponsor_id AND cycle_number=v_cycle_number FOR UPDATE;
  END IF;
  SELECT tier.name,tier.pool_bps INTO v_level,v_split FROM public.rg_seasons s
    JOIN public.rg_rule_versions c ON c.version=s.rules_version,
    LATERAL (SELECT value->>'name' AS name,(value->>'pool_bps')::integer AS pool_bps,(value->>'minimum')::bigint AS minimum
      FROM jsonb_array_elements(c.support_tiers) AS tiers(value)) tier
    WHERE s.id=p_season_id AND tier.minimum<=v_total ORDER BY tier.minimum DESC LIMIT 1;
  IF v_split IS NULL THEN RAISE EXCEPTION 'support_tiers_invalid' USING ERRCODE = 'P0001'; END IF;
  v_pool := floor(p_amount * v_split / 10000.0)::bigint; v_reserve := p_amount-v_pool;
  SELECT coalesce(sum(pool_rg),0) INTO v_pool_total FROM public.rg_reward_pool_transactions WHERE season_id=p_season_id;
  SELECT maximum_pool_rg INTO v_pool_limit FROM public.rg_economy_config WHERE id=true;
  IF v_pool_total + v_pool > v_pool_limit THEN RAISE EXCEPTION 'season_pool_cap_reached' USING ERRCODE = 'P0001'; END IF;
  IF p_sponsor_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('rg_economy_supply',0));
    SELECT coalesce((SELECT sum(amount) FROM public.rg_coin_ledger),0)
         + coalesce((SELECT sum(pool_rg+reserve_rg) FROM public.rg_reward_pool_transactions),0) INTO v_outstanding;
    SELECT maximum_outstanding_rg INTO v_outstanding_cap FROM public.rg_economy_config WHERE id=true;
    IF v_outstanding+p_amount>v_outstanding_cap THEN RAISE EXCEPTION 'rg_outstanding_cap_reached' USING ERRCODE = 'P0001'; END IF;
  END IF;
  UPDATE public.rg_support_cycles SET contributed_rg=v_total+p_amount WHERE id=v_cycle_id;
  IF p_user_id IS NOT NULL THEN
    INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id)
    VALUES(p_user_id,-p_amount,'POOL_CONTRIBUTION','Contributed to season reward pool',p_source_type,p_source_id,p_idempotency_key || ':debit',p_season_id);
  END IF;
  INSERT INTO public.rg_reward_pool_transactions(season_id,transaction_type,source_type,source_id,gross_rg,pool_rg,reserve_rg,user_id,sponsor_id,support_cycle_id,idempotency_key,metadata)
  VALUES(p_season_id,CASE WHEN p_sponsor_id IS NULL THEN 'USER_CONTRIBUTION' ELSE 'SPONSOR_CONTRIBUTION' END,p_source_type,p_source_id,p_amount,v_pool,v_reserve,p_user_id,p_sponsor_id,v_cycle_id,p_idempotency_key,jsonb_build_object('pool_split_bps',v_split,'support_level',v_level))
  RETURNING id INTO v_tx;
  -- Record the new support level for subsequent contributions; this transaction used the prior level.
  SELECT tier.name,tier.pool_bps INTO v_level,v_split FROM public.rg_seasons s
    JOIN public.rg_rule_versions c ON c.version=s.rules_version,
    LATERAL (SELECT value->>'name' AS name,(value->>'pool_bps')::integer AS pool_bps,(value->>'minimum')::bigint AS minimum
      FROM jsonb_array_elements(c.support_tiers) AS tiers(value)) tier
    WHERE s.id=p_season_id AND tier.minimum<=v_total+p_amount ORDER BY tier.minimum DESC LIMIT 1;
  UPDATE public.rg_support_cycles SET support_level=v_level,pool_split_bps=v_split WHERE id=v_cycle_id;
  RETURN v_tx;
END; $$;
REVOKE ALL ON FUNCTION public.rg_contribute_to_pool(uuid,uuid,uuid,bigint,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_contribute_to_pool(uuid,uuid,uuid,bigint,text,text,text) TO service_role;

-- Shares the existing customer entitlement; serialized grants cannot overwrite one another.
CREATE FUNCTION public.rg_extend_studio_access(p_customer_id uuid,p_days integer) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE v_expiry timestamptz;
BEGIN
  IF p_customer_id IS NULL OR p_days IS NULL OR p_days<=0 THEN RAISE EXCEPTION 'invalid_studio_extension' USING ERRCODE = 'P0001'; END IF;
  SELECT studio_access_until INTO v_expiry FROM public.customers WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'studio_customer_unavailable' USING ERRCODE = 'P0001'; END IF;
  v_expiry := greatest(coalesce(v_expiry,now()),now()) + make_interval(days=>p_days);
  UPDATE public.customers SET studio_access_until=v_expiry,updated_at=now() WHERE id=p_customer_id;
  RETURN v_expiry;
END; $$;
REVOKE ALL ON FUNCTION public.rg_extend_studio_access(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_extend_studio_access(uuid,integer) TO service_role;

CREATE FUNCTION public.rg_finalize_season(p_season_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  v_season public.rg_seasons%ROWTYPE; v_pool bigint; v_run uuid; v_rules jsonb;
  v_row record; v_coin bigint; v_days integer; v_reward_pct integer; v_reward_total integer; v_customer_id uuid; v_expiry timestamptz;
BEGIN
  SELECT * INTO v_season FROM public.rg_seasons WHERE id=p_season_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'season_not_found' USING ERRCODE = 'P0001'; END IF;
  IF EXISTS(SELECT 1 FROM public.rg_season_finalizations WHERE season_id=p_season_id) THEN RETURN true; END IF;
  IF v_season.ends_at>now() OR v_season.status NOT IN ('ended','active') THEN RAISE EXCEPTION 'season_not_ready_to_finalize' USING ERRCODE = 'P0001'; END IF;
  UPDATE public.rg_seasons SET status='ended' WHERE id=p_season_id AND status='active';
  v_run := public.rg_capture_rank_snapshot(p_season_id,true);
  SELECT coalesce(sum(pool_rg),0)::bigint INTO v_pool FROM public.rg_reward_pool_transactions WHERE season_id=p_season_id;
  SELECT reward_distribution INTO v_rules FROM public.rg_rule_versions WHERE version=v_season.rules_version;
  v_reward_total := coalesce((v_rules->>'1')::integer,0)+coalesce((v_rules->>'2')::integer,0)+coalesce((v_rules->>'3')::integer,0);
  IF v_reward_total<0 OR v_reward_total>80 OR coalesce((v_rules->>'1')::integer,0)<0 OR coalesce((v_rules->>'2')::integer,0)<0 OR coalesce((v_rules->>'3')::integer,0)<0 THEN
    RAISE EXCEPTION 'season_reward_distribution_invalid' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.rg_season_finalizations(season_id,rank_run_id,final_pool_rg,finalized_at,rules_version)
    VALUES(p_season_id,v_run,v_pool,now(),v_season.rules_version);
  FOR v_row IN SELECT s.entity_id AS artist_id,a.user_id,au.email,s.rank FROM public.rg_rank_snapshots s
    JOIN public.rg_artists a ON a.id=s.entity_id LEFT JOIN auth.users au ON au.id=a.user_id
    WHERE s.run_id=v_run AND s.ranking_type='artists' AND s.rank<=3 ORDER BY s.rank
  LOOP
    v_reward_pct := coalesce((v_rules->>v_row.rank::text)::integer,0);
    v_coin := floor(v_pool * v_reward_pct / 100.0)::bigint;
    v_days := coalesce((v_rules->'premium_days'->>v_row.rank::text)::integer,0);
    IF v_row.user_id IS NULL THEN v_coin:=0; END IF;
    IF v_coin>0 THEN
      INSERT INTO public.rg_coin_ledger(user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id)
      VALUES(v_row.user_id,v_row.artist_id,v_coin,'SEASON_REWARD','RG TOP 23 season placement #'||v_row.rank,'season',p_season_id::text,
        'season:'||p_season_id::text||':place:'||v_row.rank,p_season_id) ON CONFLICT(idempotency_key) DO NOTHING;
      INSERT INTO public.rg_reward_pool_transactions(season_id,transaction_type,source_type,source_id,gross_rg,pool_rg,reserve_rg,idempotency_key)
      VALUES(p_season_id,'SEASON_REWARD','season',p_season_id::text||':place:'||v_row.rank,0,-v_coin,0,'season:'||p_season_id::text||':pool-payout:'||v_row.rank)
      ON CONFLICT(idempotency_key) DO NOTHING;
    END IF;
    v_customer_id:=NULL; v_expiry:=NULL;
    IF v_row.email IS NOT NULL AND v_days>0 THEN
    INSERT INTO public.customers(email,name) VALUES(v_row.email,'RG Artist') ON CONFLICT(email) DO NOTHING RETURNING id INTO v_customer_id;
    IF v_customer_id IS NULL THEN SELECT id INTO v_customer_id FROM public.customers WHERE email=v_row.email; END IF;
    v_expiry := public.rg_extend_studio_access(v_customer_id,v_days);
    END IF;
    INSERT INTO public.rg_season_rewards(season_id,artist_id,user_id,place,coin_rg,premium_days,coin_ledger_id,premium_granted_at,premium_expires_at)
    SELECT p_season_id,v_row.artist_id,v_row.user_id,v_row.rank,v_coin,v_days,l.id,CASE WHEN v_expiry IS NOT NULL THEN now() END,v_expiry
      FROM (SELECT 1) one LEFT JOIN public.rg_coin_ledger l ON l.idempotency_key='season:'||p_season_id::text||':place:'||v_row.rank
    ON CONFLICT(season_id,place) DO NOTHING;
  END LOOP;
  UPDATE public.rg_seasons SET status='finalized',finalized_at=now() WHERE id=p_season_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.rg_finalize_season(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_finalize_season(uuid) TO service_role;

-- Append-only: even the service role gets no UPDATE/DELETE path through app APIs.
CREATE FUNCTION public.rg_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_old jsonb; v_new jsonb; v_field text; v_nullable_fields text[];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'rg_ledger_is_append_only' USING ERRCODE = 'P0001'; END IF;
  v_nullable_fields := CASE TG_TABLE_NAME
    WHEN 'rg_score_events' THEN ARRAY['artist_id','track_id','beat_id','publication_id']
    WHEN 'rg_coin_ledger' THEN ARRAY['user_id','artist_id','season_id']
    WHEN 'rg_season_rewards' THEN ARRAY['user_id','artist_id','coin_ledger_id']
    ELSE ARRAY['user_id','sponsor_id','support_cycle_id'] END;
  v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
  FOREACH v_field IN ARRAY v_nullable_fields LOOP
    IF v_old->v_field IS DISTINCT FROM v_new->v_field THEN
      IF v_old->v_field IS NULL OR v_new->v_field IS DISTINCT FROM 'null'::jsonb THEN
        RAISE EXCEPTION 'rg_ledger_is_append_only' USING ERRCODE = 'P0001';
      END IF;
      v_old := v_old - v_field; v_new := v_new - v_field;
    END IF;
  END LOOP;
  IF v_old IS DISTINCT FROM v_new THEN RAISE EXCEPTION 'rg_ledger_is_append_only' USING ERRCODE = 'P0001'; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.rg_reject_ledger_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rg_score_events_append_only BEFORE UPDATE OR DELETE ON public.rg_score_events FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_coin_ledger_append_only BEFORE UPDATE OR DELETE ON public.rg_coin_ledger FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_pool_transactions_append_only BEFORE UPDATE OR DELETE ON public.rg_reward_pool_transactions FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_rule_versions_append_only BEFORE UPDATE OR DELETE ON public.rg_rule_versions FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_youtube_metrics_append_only BEFORE UPDATE OR DELETE ON public.rg_youtube_metric_snapshots FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_rank_runs_append_only BEFORE UPDATE OR DELETE ON public.rg_rank_snapshot_runs FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_rank_snapshots_append_only BEFORE UPDATE OR DELETE ON public.rg_rank_snapshots FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();

CREATE TRIGGER rg_finalizations_append_only BEFORE UPDATE OR DELETE ON public.rg_season_finalizations FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_rewards_append_only BEFORE UPDATE OR DELETE ON public.rg_season_rewards FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();

CREATE FUNCTION public.rg_preserve_finalized_season() RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status='finalized' THEN RAISE EXCEPTION 'rg_finalized_season_immutable' USING ERRCODE = 'P0001'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.rg_preserve_finalized_season() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER rg_finalized_season_immutable BEFORE UPDATE OR DELETE ON public.rg_seasons FOR EACH ROW EXECUTE FUNCTION public.rg_preserve_finalized_season();

CREATE VIEW public.rg_coin_balances WITH (security_invoker = true) AS
  SELECT user_id, sum(amount)::bigint AS balance_rg FROM public.rg_coin_ledger WHERE user_id IS NOT NULL GROUP BY user_id;
CREATE VIEW public.rg_reward_pool_totals WITH (security_invoker = true) AS
  SELECT season_id, sum(pool_rg)::bigint AS pool_rg, sum(reserve_rg)::bigint AS reserve_rg, sum(gross_rg)::bigint AS gross_rg
  FROM public.rg_reward_pool_transactions GROUP BY season_id;
REVOKE ALL ON public.rg_coin_balances, public.rg_reward_pool_totals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rg_coin_balances, public.rg_reward_pool_totals TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
