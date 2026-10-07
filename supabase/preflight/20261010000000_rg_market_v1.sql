-- READ ONLY. Run against the target database before approving any Production migration.
-- Aggregate diagnostics only: no emails, ownership IDs, tokens or ledger evidence returned.
BEGIN READ ONLY;
DO $$ DECLARE relation text; fn text; bad bigint;
BEGIN
 FOREACH relation IN ARRAY ARRAY['rg_coin_ledger','rg_coin_balances','rg_economy_config','rg_beat_passes','rg_rule_versions','rg_seasons','rg_season_rewards','orders','order_items','beat_gifts','gift_claim_tokens','gift_claim_contexts','commerce_checkout_intents','commerce_studio_access_grants'] LOOP
  IF to_regclass('public.'||relation) IS NULL THEN RAISE EXCEPTION 'Required baseline missing: %',relation; END IF;
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['rg_reject_ledger_mutation()','rg_credit_coins(uuid,uuid,bigint,text,text,text,text,text,uuid,jsonb)','rg_purchase_beat_pass(uuid,text)','rg_reserve_next_beat_pass(uuid,uuid)','rg_consume_beat_pass(uuid,uuid)','rg_claim_beat_gift(text,uuid,uuid,text,text)','rg_grant_commerce_studio_access(text,uuid,uuid,integer)','rg_finalize_season(uuid)'] LOOP
  IF to_regprocedure('public.'||fn) IS NULL THEN RAISE EXCEPTION 'Required baseline function missing: %',fn; END IF;
 END LOOP;
 IF to_regclass('public.rg_market_products') IS NOT NULL THEN RAISE EXCEPTION 'V1 already exists; use post-migration verification, not a second application'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rg_economy_config WHERE id=true AND NOT purchases_enabled AND NOT redemption_enabled AND beat_pass_cost_rg=10000 AND beat_pass_eligible_license_tiers=ARRAY['mp3']::text[]) THEN RAISE EXCEPTION 'Economy baseline needs explicit review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.rg_coin_ledger'::regclass AND NOT tgisinternal AND tgfoid='public.rg_reject_ledger_mutation()'::regprocedure AND tgenabled<>'D') THEN RAISE EXCEPTION 'Append-only ledger guard missing'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.beat_gifts'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%purchase_id IS NOT NULL%') THEN RAISE EXCEPTION 'Gift V1 entitlement constraint needs compatibility review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.rg_season_rewards'::regclass AND conname='rg_season_rewards_place_check') THEN RAISE EXCEPTION 'Season reward place constraint differs'; END IF;
 -- Historical allocation is conservative by recorded timestamp. Ambiguous chronology
 -- requires an audit, never a silent provenance override or balance modification.
 WITH periods AS (
 SELECT user_id,created_at,sum(CASE WHEN amount<0 OR origin_type IN ('EARNED_RG','SEASON_REWARD','PURCHASED_RG','ADMIN_CORRECTION') THEN amount ELSE 0 END) AS delta
 FROM public.rg_coin_ledger WHERE user_id IS NOT NULL GROUP BY user_id,created_at),
 running AS (SELECT sum(delta) OVER(PARTITION BY user_id ORDER BY created_at) AS balance FROM periods)
 SELECT count(*) INTO bad FROM running WHERE balance<0;
 IF bad>0 THEN RAISE EXCEPTION 'Historical debit provenance/chronology requires audit (% intervals); migration blocked',bad; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_coin_ledger WHERE amount>0 AND user_id IS NOT NULL AND origin_type NOT IN ('EARNED_RG','SEASON_REWARD','PURCHASED_RG','ADMIN_CORRECTION','SPONSOR_CONTRIBUTION','POOL_CONTRIBUTION')) THEN RAISE EXCEPTION 'Unclassified positive provenance requires review'; END IF;
END $$;
SELECT origin_type,count(*) AS record_count,sum(amount) AS accounting_total_rg FROM public.rg_coin_ledger GROUP BY origin_type ORDER BY origin_type;
SELECT status,count(*) AS legacy_pass_count FROM public.rg_beat_passes GROUP BY status;
SELECT 'READ-ONLY BASELINE COMPATIBILITY PASS' AS result;
ROLLBACK;
