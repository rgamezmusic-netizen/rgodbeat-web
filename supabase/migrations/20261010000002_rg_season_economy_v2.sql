-- New immutable season rules; activation and issuance require explicit budget configuration.
BEGIN;
ALTER TABLE public.rg_economy_config
 ADD COLUMN season_rewards_v2_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN direct_earning_v1_enabled boolean NOT NULL DEFAULT false,
 ADD COLUMN maximum_utility_exposure_cents bigint NOT NULL DEFAULT 0 CHECK(maximum_utility_exposure_cents>=0),
 ADD COLUMN direct_earning_cap_rg bigint NOT NULL DEFAULT 1000 CHECK(direct_earning_cap_rg=1000);
INSERT INTO public.rg_rule_versions(version,score_rules,youtube_view_milestones,support_tiers,reward_distribution,notes)
 SELECT 2,score_rules,youtube_view_milestones,support_tiers,
 '{"1":20,"2":20,"3":20,"tail_percent":40,"tail_start":4,"tail_end":23,"tail_weight":"24-rank","premium_days":{"1":30,"2":15,"3":15}}'::jsonb,
 'RG utility V1: dynamic pool; 20/20/20 plus descending 40% through #23. Direct earning targets 200–600 / 600–1000; cap 1000; verified actions only. No spending/gifting/purchasing PTS.'
 FROM public.rg_rule_versions WHERE version=1;
-- Preserve active/finalized seasons; future scheduled seasons select the new version.
UPDATE public.rg_economy_config SET rules_version=2 WHERE id=true;
UPDATE public.rg_seasons SET rules_version=2 WHERE status='scheduled' AND starts_at>now()
 AND NOT EXISTS(SELECT 1 FROM public.rg_score_events WHERE season_id=rg_seasons.id);
ALTER TABLE public.rg_season_rewards DROP CONSTRAINT rg_season_rewards_place_check;
ALTER TABLE public.rg_season_rewards ADD CONSTRAINT rg_season_rewards_place_check CHECK(place BETWEEN 1 AND 23);
-- Private liability budget includes unspent utility, future pool/reserve awards,
-- and issued benefits. No public RG/USD conversion is created.
CREATE FUNCTION public.rg_utility_exposure_cents() RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT ceil((coalesce((SELECT sum(balance_rg) FROM public.rg_spendable_balances),0)
   +greatest(coalesce((SELECT sum(pool_rg+reserve_rg) FROM public.rg_reward_pool_transactions),0),0))
   *(SELECT max(maximum_benefit_cents::numeric/cost_rg) FROM public.rg_market_products))
   +coalesce((SELECT sum(maximum_benefit_cents) FROM public.rg_market_liabilities),0)
$$;
REVOKE ALL ON FUNCTION public.rg_utility_exposure_cents() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_utility_exposure_cents() TO service_role;
CREATE FUNCTION public.rg_season_reward_amount(p_pool bigint,p_rank integer) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH budget AS (SELECT floor(p_pool::numeric/5)::bigint AS top),
 tail AS (SELECT p_pool-3*top AS amount FROM budget),
 shares AS (SELECT rank,floor(amount::numeric*(24-rank)/210)::bigint AS base,
   mod(amount::numeric*(24-rank),210) AS fraction FROM tail CROSS JOIN generate_series(4,23) rank),
 rounded AS (SELECT rank,base,row_number() OVER(ORDER BY fraction DESC,rank) AS priority,
   (SELECT amount FROM tail)-sum(base) OVER() AS remainder FROM shares)
 SELECT CASE WHEN p_pool<0 OR p_rank NOT BETWEEN 1 AND 23 THEN NULL
 WHEN p_rank<=3 THEN (SELECT top FROM budget)
 ELSE (SELECT base+CASE WHEN priority<=remainder THEN 1 ELSE 0 END FROM rounded WHERE rank=p_rank) END
$$;
ALTER FUNCTION public.rg_finalize_season(uuid) RENAME TO rg_finalize_season_v1;
REVOKE ALL ON FUNCTION public.rg_finalize_season_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.rg_finalize_season_v2(p_season_id uuid) RETURNS boolean
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
  IF v_season.rules_version<>2 OR v_reward_total<>60 OR v_rules->>'tail_percent'<>'40' THEN
    RAISE EXCEPTION 'season_reward_distribution_invalid' USING ERRCODE = 'P0001';
  END IF;
  INSERT INTO public.rg_season_finalizations(season_id,rank_run_id,final_pool_rg,finalized_at,rules_version)
    VALUES(p_season_id,v_run,v_pool,now(),v_season.rules_version);
  FOR v_row IN SELECT s.entity_id AS artist_id,a.user_id,au.email,s.rank FROM public.rg_rank_snapshots s
    JOIN public.rg_artists a ON a.id=s.entity_id LEFT JOIN auth.users au ON au.id=a.user_id
    WHERE s.run_id=v_run AND s.ranking_type='artists' AND s.rank<=23 ORDER BY s.rank
  LOOP
    v_reward_pct := coalesce((v_rules->>v_row.rank::text)::integer,0);
    v_coin := public.rg_season_reward_amount(v_pool,v_row.rank);
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

REVOKE ALL ON FUNCTION public.rg_finalize_season_v2(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.rg_finalize_season(p_season_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config public.rg_economy_config%ROWTYPE; version integer; pool bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM public.rg_season_finalizations WHERE season_id=p_season_id) THEN RETURN true; END IF;
 SELECT * INTO config FROM public.rg_economy_config WHERE id=true FOR SHARE;
 SELECT rules_version INTO version FROM public.rg_seasons WHERE id=p_season_id FOR UPDATE;
 SELECT coalesce(sum(pool_rg),0) INTO pool FROM public.rg_reward_pool_transactions WHERE season_id=p_season_id;
 IF NOT config.season_rewards_v2_enabled OR config.maximum_utility_exposure_cents<=0
 OR public.rg_utility_exposure_cents()>config.maximum_utility_exposure_cents OR config.season_issuance_cap<=0 OR config.maximum_pool_rg<=0
 OR config.maximum_outstanding_rg<=0 OR pool>config.maximum_pool_rg OR pool>config.season_issuance_cap THEN
 RAISE EXCEPTION 'season_rewards_budget_not_enabled'; END IF;
 IF version=2 THEN RETURN public.rg_finalize_season_v2(p_season_id); END IF;
 IF version=1 THEN RETURN public.rg_finalize_season_v1(p_season_id); END IF;
 RAISE EXCEPTION 'unsupported_season_rules';
END $$;
REVOKE ALL ON FUNCTION public.rg_finalize_season(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_finalize_season(uuid) TO service_role;

-- Whitelisted immutable, server-verified Score records are evidence; utility awards
-- do not write score events or change rankings. Wallet actions are not evidence.
CREATE FUNCTION public.rg_direct_award_amount(p_event_type text,p_milestone text) RETURNS bigint
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_event_type='TRACK_PUBLISHED' THEN 200
 WHEN p_event_type='YOUTUBE_VIEW_MILESTONE' THEN CASE p_milestone WHEN '1000' THEN 100 WHEN '5000' THEN 200 WHEN '10000' THEN 300 WHEN '25000' THEN 200 ELSE 0 END
 ELSE 0 END::bigint
$$;
CREATE FUNCTION public.rg_guard_direct_earning() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event public.rg_score_events%ROWTYPE; owner uuid; earned bigint; enabled boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1));
 SELECT direct_earning_v1_enabled INTO enabled FROM public.rg_economy_config WHERE id=true FOR UPDATE;
 IF NOT enabled OR NEW.source_type<>'verified_activity' THEN RAISE EXCEPTION 'direct_earning_requires_enabled_verified_activity'; END IF;
 SELECT * INTO event FROM public.rg_score_events WHERE id::text=NEW.source_id AND season_id=NEW.season_id;
 SELECT user_id INTO owner FROM public.rg_artists WHERE id=event.artist_id AND status='active';
 IF NOT EXISTS(SELECT 1 FROM public.rg_seasons WHERE id=NEW.season_id AND status='active' AND starts_at<=now() AND ends_at>now()) THEN RAISE EXCEPTION 'coin_issuance_season_required'; END IF;
 IF owner IS NULL OR owner IS DISTINCT FROM NEW.user_id OR NEW.amount<>public.rg_direct_award_amount(event.event_type,event.milestone_key)
 OR NEW.artist_id IS DISTINCT FROM event.artist_id OR NEW.source_id IS DISTINCT FROM event.id::text
 OR NEW.idempotency_key IS DISTINCT FROM 'verified-activity:'||event.id::text
 OR NEW.amount<=0 OR event.verified_at IS NULL THEN RAISE EXCEPTION 'direct_earning_evidence_invalid'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text,1));
 SELECT coalesce(sum(amount),0) INTO earned FROM public.rg_coin_ledger WHERE user_id=NEW.user_id AND season_id=NEW.season_id AND origin_type='EARNED_RG' AND amount>0;
 IF (SELECT maximum_utility_exposure_cents FROM public.rg_economy_config WHERE id=true)<=0 OR public.rg_utility_exposure_cents()+ceil(NEW.amount*(SELECT max(maximum_benefit_cents::numeric/cost_rg) FROM public.rg_market_products))>(SELECT maximum_utility_exposure_cents FROM public.rg_economy_config WHERE id=true) THEN RAISE EXCEPTION 'utility_liability_budget_reached'; END IF;
 IF NEW.amount+coalesce((SELECT sum(amount) FROM public.rg_coin_ledger WHERE season_id=NEW.season_id AND origin_type='EARNED_RG' AND amount>0),0)+coalesce((SELECT sum(gross_rg) FROM public.rg_reward_pool_transactions WHERE season_id=NEW.season_id AND transaction_type IN ('BASE_ISSUANCE','ACTIVITY','COMMERCE')),0)>(SELECT season_issuance_cap FROM public.rg_economy_config WHERE id=true) THEN RAISE EXCEPTION 'season_issuance_cap_reached'; END IF;
 IF earned+NEW.amount>1000 THEN RAISE EXCEPTION 'direct_earning_account_season_cap'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rg_direct_earning_verified BEFORE INSERT ON public.rg_coin_ledger
 FOR EACH ROW WHEN (NEW.origin_type='EARNED_RG' AND NEW.amount>0) EXECUTE FUNCTION public.rg_guard_direct_earning();
CREATE FUNCTION public.rg_award_verified_activity(p_score_event_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE event public.rg_score_events%ROWTYPE; owner uuid; amount bigint; config public.rg_economy_config%ROWTYPE; prior uuid;
BEGIN
 SELECT * INTO config FROM public.rg_economy_config WHERE id=true;
 IF NOT config.direct_earning_v1_enabled THEN RETURN NULL; END IF;
 IF config.maximum_utility_exposure_cents<=0 OR config.season_issuance_cap<=0 OR config.maximum_outstanding_rg<=0 THEN RAISE EXCEPTION 'direct_earning_budget_not_configured'; END IF;
 SELECT * INTO event FROM public.rg_score_events WHERE id=p_score_event_id;
 SELECT user_id INTO owner FROM public.rg_artists WHERE id=event.artist_id AND status='active';
 amount:=public.rg_direct_award_amount(event.event_type,event.milestone_key);
 IF owner IS NULL OR coalesce(amount,0)<=0 THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner::text,1));
 SELECT id INTO prior FROM public.rg_coin_ledger WHERE idempotency_key='verified-activity:'||p_score_event_id::text;
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF (SELECT coalesce(sum(l.amount),0) FROM public.rg_coin_ledger l WHERE l.user_id=owner AND l.season_id=event.season_id AND l.origin_type='EARNED_RG' AND l.amount>0)+amount>1000 THEN RETURN NULL; END IF;
 IF public.rg_utility_exposure_cents()+ceil(amount*(SELECT max(maximum_benefit_cents::numeric/cost_rg) FROM public.rg_market_products))>config.maximum_utility_exposure_cents THEN RAISE EXCEPTION 'utility_liability_budget_reached'; END IF;
 RETURN public.rg_credit_coins(owner,event.artist_id,amount,'EARNED_RG','Verified ecosystem activity','verified_activity',event.id::text,
   'verified-activity:'||event.id::text,event.season_id,jsonb_build_object('rules_version',2,'score_event_id',event.id));
END $$;
REVOKE ALL ON FUNCTION public.rg_guard_direct_earning(),public.rg_award_verified_activity(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_award_verified_activity(uuid) TO service_role;
COMMIT;
