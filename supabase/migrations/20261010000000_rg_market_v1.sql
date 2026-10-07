-- Additive RG utility V1. New products remain disabled; no production credits are issued.
BEGIN;
LOCK TABLE public.rg_coin_ledger IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.rg_coin_ledger
  ADD COLUMN utility_spendable boolean NOT NULL DEFAULT false,
  ADD COLUMN utility_authorization text,
  ADD CONSTRAINT rg_controlled_credit_authorization CHECK (
    (NOT utility_spendable AND utility_authorization IS NULL) OR
    (utility_spendable AND origin_type='ADMIN_CORRECTION' AND amount>0
      AND utility_authorization IS NOT NULL AND length(btrim(utility_authorization)) BETWEEN 16 AND 500));

CREATE TABLE public.rg_coin_spend_allocations (
  debit_id uuid NOT NULL REFERENCES public.rg_coin_ledger(id) ON DELETE RESTRICT,
  credit_id uuid NOT NULL REFERENCES public.rg_coin_ledger(id) ON DELETE RESTRICT,
  amount bigint NOT NULL CHECK(amount>0),
  PRIMARY KEY(debit_id,credit_id)
);
CREATE INDEX rg_allocations_credit ON public.rg_coin_spend_allocations(credit_id);
ALTER TABLE public.rg_coin_spend_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rg_coin_spend_allocations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rg_coin_spend_allocations TO service_role;
CREATE TRIGGER rg_allocations_append_only BEFORE UPDATE OR DELETE ON public.rg_coin_spend_allocations
  FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();

-- Sponsor/pool entries are accounting, never wallet credits. Other debits consume
-- restricted funds first; Market debits may consume only utility-eligible credits.
CREATE FUNCTION public.rg_allocate_coin_debit(p_debit_id uuid,p_market boolean DEFAULT false,p_historical boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.rg_coin_ledger%ROWTYPE; c record; remaining bigint; take bigint;
BEGIN
  SELECT * INTO d FROM public.rg_coin_ledger WHERE id=p_debit_id;
  IF NOT FOUND OR d.amount>=0 OR d.user_id IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(d.user_id::text,1));
  SELECT -d.amount-coalesce(sum(amount),0) INTO remaining FROM public.rg_coin_spend_allocations WHERE debit_id=d.id;
  FOR c IN
    SELECT l.id,l.amount-coalesce((SELECT sum(a.amount) FROM public.rg_coin_spend_allocations a WHERE a.credit_id=l.id),0) AS available,
      (l.origin_type IN ('EARNED_RG','SEASON_REWARD') OR l.utility_spendable) AS eligible
    FROM public.rg_coin_ledger l WHERE l.user_id=d.user_id AND l.amount>0 AND (NOT p_historical OR l.created_at<=d.created_at)
      AND l.origin_type IN ('EARNED_RG','SEASON_REWARD','PURCHASED_RG','ADMIN_CORRECTION')
      AND (NOT p_market OR l.origin_type IN ('EARNED_RG','SEASON_REWARD') OR l.utility_spendable)
    ORDER BY (l.origin_type IN ('EARNED_RG','SEASON_REWARD') OR l.utility_spendable),l.created_at,l.id
  LOOP
    EXIT WHEN remaining=0;
    take:=least(remaining,c.available);
    IF take>0 THEN
      INSERT INTO public.rg_coin_spend_allocations VALUES(d.id,c.id,take);
      remaining:=remaining-take;
    END IF;
  END LOOP;
  IF remaining<>0 THEN RAISE EXCEPTION 'rg_debit_provenance_shortfall:%',d.id; END IF;
END $$;
-- Historical passes remain valid. This records historical consumption without
-- granting spendability to historical purchased/admin credits.
DO $$ DECLARE d record; BEGIN
  FOR d IN SELECT id FROM public.rg_coin_ledger WHERE user_id IS NOT NULL AND amount<0 ORDER BY created_at,id LOOP
    PERFORM public.rg_allocate_coin_debit(d.id,false,true);
  END LOOP;
END $$;
CREATE FUNCTION public.rg_allocate_inserted_debit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM public.rg_allocate_coin_debit(NEW.id,NEW.source_type IN ('rg_market','rg_beat_pass'));
  RETURN NEW;
END $$;
CREATE TRIGGER rg_coin_debit_provenance AFTER INSERT ON public.rg_coin_ledger
  FOR EACH ROW WHEN (NEW.amount<0) EXECUTE FUNCTION public.rg_allocate_inserted_debit();
REVOKE ALL ON FUNCTION public.rg_allocate_coin_debit(uuid,boolean,boolean),public.rg_allocate_inserted_debit() FROM PUBLIC,anon,authenticated,service_role;

CREATE VIEW public.rg_spendable_balances WITH (security_invoker=true) AS
 SELECT l.user_id,sum(l.amount-coalesce(a.spent,0))::bigint AS balance_rg
 FROM public.rg_coin_ledger l LEFT JOIN (SELECT credit_id,sum(amount) AS spent FROM public.rg_coin_spend_allocations GROUP BY credit_id) a ON a.credit_id=l.id
 WHERE l.user_id IS NOT NULL AND l.amount>0 AND (l.origin_type IN ('EARNED_RG','SEASON_REWARD') OR l.utility_spendable)
 GROUP BY l.user_id;
REVOKE ALL ON public.rg_spendable_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rg_spendable_balances TO service_role;
-- Public/server credit callers cannot opt into controlled spendability by adding fields.
-- SECURITY DEFINER accounting RPCs retain the owner's insert privileges.
REVOKE INSERT ON public.rg_coin_ledger FROM service_role;
GRANT INSERT(id,user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id,created_at,metadata)
 ON public.rg_coin_ledger TO service_role;

-- Only a separately authorized server operator may create a controlled correction.
-- Never called by public UI/routes; authorization references are immutable ledger data.
CREATE FUNCTION public.rg_credit_controlled_utility(p_user_id uuid,p_amount bigint,p_authorization text,p_request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE credit uuid; existing public.rg_coin_ledger%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_amount IS NULL OR p_authorization IS NULL OR p_request_key IS NULL OR p_amount<=0 OR p_amount>10000 OR length(btrim(p_authorization)) NOT BETWEEN 16 AND 500
    OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN RAISE EXCEPTION 'invalid_controlled_utility_credit'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
  SELECT * INTO existing FROM public.rg_coin_ledger WHERE idempotency_key='controlled-utility:'||p_request_key;
  IF FOUND THEN
    IF existing.user_id IS DISTINCT FROM p_user_id OR existing.amount<>p_amount OR existing.utility_authorization<>p_authorization THEN RAISE EXCEPTION 'controlled_credit_idempotency_conflict'; END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key,utility_spendable,utility_authorization,metadata)
    VALUES(p_user_id,p_amount,'ADMIN_CORRECTION','Authorized controlled utility correction','controlled_utility',p_request_key,
      'controlled-utility:'||p_request_key,true,p_authorization,jsonb_build_object('authorized_by',session_user,'purpose','controlled_test_or_correction')) RETURNING id INTO credit;
  RETURN credit;
END $$;
REVOKE ALL ON FUNCTION public.rg_credit_controlled_utility(uuid,bigint,text,text) FROM PUBLIC,anon,authenticated,service_role;
-- Deliberately owner-only. Granting execution to an operator requires explicit authorization.

ALTER TABLE public.rg_economy_config ADD COLUMN market_v1_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE public.rg_market_products (
 product_key text NOT NULL, version integer NOT NULL CHECK(version>0), name text NOT NULL,
 section text NOT NULL CHECK(section IN ('beats','studio','other')), cost_rg bigint NOT NULL CHECK(cost_rg>0),
 benefit_kind text NOT NULL CHECK(benefit_kind IN ('beat','discount','studio')),
 allowed_category text NOT NULL CHECK(allowed_category IN ('mp3','wav','studio')),
 percentage integer, maximum_benefit_cents integer NOT NULL CHECK(maximum_benefit_cents>0), studio_days integer,
 eligibility text NOT NULL, one_time boolean NOT NULL DEFAULT true CHECK(one_time),
 expiration_policy text NOT NULL DEFAULT 'never' CHECK(expiration_policy='never'),
 giftable boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT false,
 PRIMARY KEY(product_key,version),
 CHECK ((benefit_kind='discount' AND percentage IN (25,50) AND studio_days IS NULL AND allowed_category IN ('mp3','wav'))
   OR (benefit_kind='beat' AND percentage IS NULL AND studio_days IS NULL AND allowed_category='mp3')
   OR (benefit_kind='studio' AND percentage IS NULL AND studio_days=30 AND allowed_category='studio'))
);
INSERT INTO public.rg_market_products(product_key,version,name,section,cost_rg,benefit_kind,allowed_category,percentage,maximum_benefit_cents,studio_days,eligibility,active) VALUES
 ('mp3_25',1,'25% MP3 Ticket','beats',2500,'discount','mp3',25,725,NULL,'Una licencia MP3; descuento hasta $7.25.',false),
 ('wav_25',1,'25% WAV Ticket','beats',4500,'discount','wav',25,1225,NULL,'Una licencia WAV; descuento hasta $12.25.',false),
 ('mp3_50',1,'50% MP3 Ticket','beats',5000,'discount','mp3',50,1450,NULL,'Una licencia MP3; descuento hasta $14.50.',false),
 ('wav_50',1,'50% WAV Ticket','beats',8500,'discount','wav',50,2450,NULL,'Una licencia WAV; descuento hasta $24.50.',false),
 ('beat_pass',1,'RG Beat Pass','beats',10000,'beat','mp3',NULL,2900,NULL,'Una licencia estándar MP3 no exclusiva de hasta $29.',true),
 ('studio_30',1,'RG Studio Pass / 30 days','studio',3500,'studio','studio',NULL,1000,30,'Extiende Studio por 30 días desde la activación.',false);
ALTER TABLE public.rg_market_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rg_market_products FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON public.rg_market_products TO service_role;
-- Published economic terms are immutable; activation is an independent rollout switch.
CREATE FUNCTION public.rg_guard_market_product() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'active') IS DISTINCT FROM (to_jsonb(OLD)-'active') THEN RAISE EXCEPTION 'market_product_version_is_immutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER rg_market_product_immutable BEFORE UPDATE OR DELETE ON public.rg_market_products FOR EACH ROW EXECUTE FUNCTION public.rg_guard_market_product();

ALTER TABLE public.rg_beat_passes
 ADD COLUMN product_key text NOT NULL DEFAULT 'beat_pass',
 ADD COLUMN product_version integer NOT NULL DEFAULT 1,
 ADD COLUMN purchaser_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
 ADD CONSTRAINT rg_pass_product_fk FOREIGN KEY(product_key,product_version) REFERENCES public.rg_market_products(product_key,version);
UPDATE public.rg_beat_passes SET purchaser_user_id=user_id;
ALTER TABLE public.rg_beat_passes ALTER COLUMN purchaser_user_id SET NOT NULL;

CREATE FUNCTION public.rg_purchase_market_pass(p_user_id uuid,p_product_key text,p_version integer,p_request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.rg_beat_passes%ROWTYPE; product public.rg_market_products%ROWTYPE; pass uuid; debit uuid; balance bigint; settings public.rg_economy_config%ROWTYPE;
BEGIN
 IF p_user_id IS NULL OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN RAISE EXCEPTION 'invalid_market_purchase'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 SELECT * INTO existing FROM public.rg_beat_passes WHERE purchaser_user_id=p_user_id AND purchase_request_key=p_request_key;
 IF FOUND THEN
   IF existing.product_key<>p_product_key OR existing.product_version<>p_version THEN RAISE EXCEPTION 'market_purchase_idempotency_conflict'; END IF;
   RETURN existing.id;
 END IF;
 SELECT * INTO settings FROM public.rg_economy_config WHERE id=true FOR SHARE;
 SELECT * INTO product FROM public.rg_market_products WHERE product_key=p_product_key AND version=p_version AND active FOR SHARE;
 IF NOT FOUND OR (p_product_key='beat_pass' AND NOT settings.beat_pass_enabled) OR
   (p_product_key<>'beat_pass' AND NOT settings.market_v1_enabled) THEN RAISE EXCEPTION 'market_product_disabled'; END IF;
 SELECT coalesce(balance_rg,0) INTO balance FROM public.rg_spendable_balances WHERE user_id=p_user_id;
 IF coalesce(balance,0)<product.cost_rg THEN RAISE EXCEPTION 'insufficient_rg_balance'; END IF;
 pass:=gen_random_uuid();
 INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key,metadata)
 VALUES(p_user_id,-product.cost_rg,'REDEMPTION','RG Market utility purchase','rg_market',pass::text,
   'rg-market:'||p_user_id::text||':'||p_request_key,jsonb_build_object('product_key',product.product_key,'version',product.version)) RETURNING id INTO debit;
 INSERT INTO public.rg_beat_passes(id,user_id,purchaser_user_id,purchase_request_key,coin_ledger_id,product_key,product_version)
 VALUES(pass,p_user_id,p_user_id,p_request_key,debit,product.product_key,product.version);
 RETURN pass;
END $$;
CREATE OR REPLACE FUNCTION public.rg_purchase_beat_pass(p_user_id uuid,p_request_key text)
RETURNS uuid LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT public.rg_purchase_market_pass(p_user_id,'beat_pass',1,p_request_key)
$$;

CREATE FUNCTION public.rg_reserve_market_pass(p_user_id uuid,p_pass_id uuid,p_intent_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pass public.rg_beat_passes%ROWTYPE; intent public.commerce_checkout_intents%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 SELECT * INTO intent FROM public.commerce_checkout_intents WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR intent.snapshot->>'paymentMethod' IS DISTINCT FROM 'rg_market' OR intent.snapshot->>'kind' IS DISTINCT FROM 'rg_market' OR intent.buyer_auth_user_id IS DISTINCT FROM p_user_id OR intent.state NOT IN ('awaiting_payment','fulfilling','fulfilled') THEN RAISE EXCEPTION 'market_intent_owner_or_state_mismatch'; END IF;
 SELECT * INTO pass FROM public.rg_beat_passes WHERE id=p_pass_id AND user_id=p_user_id FOR UPDATE;
 IF NOT FOUND OR pass.product_key IS DISTINCT FROM intent.snapshot->'utility'->>'productKey'
   OR pass.product_version IS DISTINCT FROM (intent.snapshot->'utility'->>'version')::integer
   OR pass.id::text IS DISTINCT FROM intent.snapshot->'utility'->>'passId' THEN RAISE EXCEPTION 'market_pass_snapshot_mismatch'; END IF;
 IF pass.reserved_intent_id=p_intent_id AND pass.status IN ('reserved','consumed') THEN RETURN pass.id; END IF;
 IF pass.status<>'available' THEN RAISE EXCEPTION 'market_pass_unavailable'; END IF;
 UPDATE public.rg_beat_passes SET status='reserved',reserved_intent_id=p_intent_id WHERE id=p_pass_id;
 RETURN p_pass_id;
END $$;
CREATE OR REPLACE FUNCTION public.rg_reserve_next_beat_pass(p_user_id uuid,p_intent_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pass uuid; buyer uuid;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 SELECT buyer_auth_user_id INTO buyer FROM public.commerce_checkout_intents WHERE id=p_intent_id AND state IN ('awaiting_payment','fulfilling','fulfilled') FOR UPDATE;
 IF buyer IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'beat_pass_intent_owner_mismatch'; END IF;
 SELECT id INTO pass FROM public.rg_beat_passes WHERE user_id=p_user_id AND product_key='beat_pass' AND reserved_intent_id=p_intent_id;
 IF pass IS NOT NULL THEN RETURN pass; END IF;
 SELECT id INTO pass FROM public.rg_beat_passes WHERE user_id=p_user_id AND product_key='beat_pass' AND status='available' ORDER BY purchased_at,id FOR UPDATE LIMIT 1;
 IF pass IS NULL THEN RAISE EXCEPTION 'rg_beat_pass_unavailable'; END IF;
 UPDATE public.rg_beat_passes SET status='reserved',reserved_intent_id=p_intent_id WHERE id=pass;
 RETURN pass;
END $$;
CREATE FUNCTION public.rg_release_market_pass(p_user_id uuid,p_intent_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 PERFORM 1 FROM public.commerce_checkout_intents WHERE id=p_intent_id AND buyer_auth_user_id=p_user_id
   AND state IN ('failed','expired') AND verified_paid_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'market_release_requires_unpaid_closed_intent'; END IF;
 UPDATE public.rg_beat_passes SET status='available',reserved_intent_id=NULL WHERE user_id=p_user_id AND reserved_intent_id=p_intent_id AND status='reserved';
 RETURN true;
END $$;
CREATE FUNCTION public.rg_consume_market_pass(p_intent_id uuid,p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent public.commerce_checkout_intents%ROWTYPE; pass public.rg_beat_passes%ROWTYPE;
BEGIN
 SELECT * INTO intent FROM public.commerce_checkout_intents WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR intent.state<>'fulfilled' OR intent.snapshot->>'paymentMethod'<>'rg_market' THEN RAISE EXCEPTION 'market_intent_not_fulfilled'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND status='completed' AND payment_status='paid'
   AND stripe_checkout_session_id=coalesce(intent.stripe_checkout_session_id,'rgmarket:'||intent.id::text)
   AND round(total_amount*100)=(intent.snapshot->>'totalAmountCents')::bigint) THEN RAISE EXCEPTION 'market_order_not_completed'; END IF;
 SELECT * INTO pass FROM public.rg_beat_passes WHERE reserved_intent_id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR pass.user_id IS DISTINCT FROM intent.buyer_auth_user_id THEN RAISE EXCEPTION 'market_reservation_missing'; END IF;
 IF pass.status='consumed' AND pass.consumed_order_id=p_order_id THEN RETURN true; END IF;
 IF pass.status<>'reserved' THEN RAISE EXCEPTION 'market_pass_not_reserved'; END IF;
 UPDATE public.rg_beat_passes SET status='consumed',consumed_order_id=p_order_id,consumed_at=now() WHERE id=pass.id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rg_purchase_market_pass(uuid,text,integer,text),public.rg_reserve_market_pass(uuid,uuid,uuid),public.rg_release_market_pass(uuid,uuid),public.rg_consume_market_pass(uuid,uuid),public.rg_guard_market_product() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_purchase_market_pass(uuid,text,integer,text),public.rg_reserve_market_pass(uuid,uuid,uuid),public.rg_release_market_pass(uuid,uuid),public.rg_consume_market_pass(uuid,uuid) TO service_role;

-- Consistent wallet-before-config lock order for concurrent credits and spends.
CREATE OR REPLACE FUNCTION public.rg_credit_coins(
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
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
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

COMMIT;
