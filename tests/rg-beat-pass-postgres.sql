-- Disposable PostgreSQL 16 integration fixture. Run only in an isolated test database.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role; END IF;
END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text);
CREATE TABLE public.rg_seasons(id uuid PRIMARY KEY);
CREATE TABLE public.rg_economy_config(
  id boolean PRIMARY KEY DEFAULT true,purchases_enabled boolean NOT NULL DEFAULT false,
  redemption_enabled boolean NOT NULL DEFAULT false,sponsor_fulfillment_enabled boolean NOT NULL DEFAULT false,
  rg_per_usd_cent integer NOT NULL DEFAULT 1,max_rg_discount_percent integer NOT NULL DEFAULT 50
);
INSERT INTO public.rg_economy_config(id) VALUES(true);
CREATE TABLE public.rg_coin_ledger(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  artist_id uuid,amount bigint NOT NULL CHECK(amount<>0),origin_type text NOT NULL,
  reason text NOT NULL,source_type text NOT NULL,source_id text NOT NULL,idempotency_key text NOT NULL UNIQUE,
  season_id uuid REFERENCES public.rg_seasons(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(origin_type,source_type,source_id,user_id)
);
CREATE FUNCTION public.rg_reject_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'rg_ledger_is_append_only'; END $$;
CREATE TRIGGER rg_coin_ledger_append_only BEFORE UPDATE OR DELETE ON public.rg_coin_ledger FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE VIEW public.rg_coin_balances WITH (security_invoker=true) AS SELECT user_id,sum(amount)::bigint AS balance_rg FROM public.rg_coin_ledger WHERE user_id IS NOT NULL GROUP BY user_id;
CREATE TABLE public.commerce_checkout_intents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_auth_user_id uuid REFERENCES auth.users(id),buyer_email text,
  recipient_mode text NOT NULL,recipient_kind text,recipient_email text,recipient_artist_id uuid,recipient_artist_slug text,
  snapshot jsonb NOT NULL,state text NOT NULL DEFAULT 'awaiting_payment',attempt_count integer NOT NULL DEFAULT 0,
  payment_amount_cents bigint,payment_currency text,verified_paid_at timestamptz,fulfilled_at timestamptz
);
CREATE TABLE public.orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid,stripe_checkout_session_id text UNIQUE,
  status text NOT NULL,payment_status text NOT NULL,total_amount numeric(10,2) NOT NULL,metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE public.rg_score_events(id uuid PRIMARY KEY);
\ir ../supabase/migrations/20261009000000_rg_beat_pass.sql
UPDATE public.rg_economy_config SET beat_pass_enabled=true WHERE id=true;

INSERT INTO auth.users(id,email) VALUES
 ('40000000-0000-4000-8000-000000000001','pass-owner@example.test'),
 ('40000000-0000-4000-8000-000000000002','concurrency-owner@example.test');
INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key)
VALUES ('40000000-0000-4000-8000-000000000001',10000,'EARNED_RG','Season reward','fixture','earned:one','fixture-earned-one'),
       ('40000000-0000-4000-8000-000000000002',10000,'SEASON_REWARD','Season reward','fixture','earned:two','fixture-earned-two');

DO $$ DECLARE v_first uuid; v_repeat uuid; v_intent uuid:='50000000-0000-4000-8000-000000000001'; v_order uuid:='60000000-0000-4000-8000-000000000001'; v_pass uuid;
BEGIN
  v_first:=public.rg_purchase_beat_pass('40000000-0000-4000-8000-000000000001','purchase-key-000000000001');
  v_repeat:=public.rg_purchase_beat_pass('40000000-0000-4000-8000-000000000001','purchase-key-000000000001');
  IF v_first<>v_repeat THEN RAISE EXCEPTION 'purchase_retry_not_idempotent'; END IF;
  IF (SELECT balance_rg FROM public.rg_coin_balances WHERE user_id='40000000-0000-4000-8000-000000000001')<>0 THEN RAISE EXCEPTION 'wrong_rg_debit'; END IF;
  IF (SELECT amount FROM public.rg_coin_ledger WHERE origin_type='REDEMPTION' AND user_id='40000000-0000-4000-8000-000000000001')<>-10000 THEN RAISE EXCEPTION 'wrong_ledger_debit'; END IF;
  IF (SELECT count(*) FROM public.rg_coin_ledger WHERE user_id='40000000-0000-4000-8000-000000000001' AND amount>0 AND origin_type='EARNED_RG')<>1 THEN RAISE EXCEPTION 'earned_provenance_changed'; END IF;
  BEGIN PERFORM public.rg_purchase_beat_pass('40000000-0000-4000-8000-000000000001','different-key-0000000001'); RAISE EXCEPTION 'insufficient_balance_accepted';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='insufficient_balance_accepted' THEN RAISE; END IF; END;
  INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot,state)
    VALUES(v_intent,'40000000-0000-4000-8000-000000000001','self','{"kind":"beat_pass_redemption","paymentMethod":"rg_beat_pass"}','awaiting_payment');
  v_pass:=public.rg_reserve_next_beat_pass('40000000-0000-4000-8000-000000000001',v_intent);
  IF v_pass<>public.rg_reserve_next_beat_pass('40000000-0000-4000-8000-000000000001',v_intent) THEN RAISE EXCEPTION 'reservation_retry_not_idempotent'; END IF;
  BEGIN PERFORM public.rg_consume_beat_pass(v_intent,v_order); RAISE EXCEPTION 'pass_consumed_before_fulfillment';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM='pass_consumed_before_fulfillment' THEN RAISE; END IF; END;
  INSERT INTO public.orders(id,stripe_checkout_session_id,status,payment_status,total_amount)
    VALUES(v_order,'rgpass:'||v_intent::text,'completed','paid',0);
  UPDATE public.commerce_checkout_intents SET state='fulfilled' WHERE id=v_intent;
  PERFORM public.rg_consume_beat_pass(v_intent,v_order);
  PERFORM public.rg_consume_beat_pass(v_intent,v_order);
  IF (SELECT status FROM public.rg_beat_passes WHERE id=v_pass)<>'consumed' THEN RAISE EXCEPTION 'pass_not_consumed_after_fulfillment'; END IF;
  IF (SELECT count(*) FROM public.rg_score_events)<>0 THEN RAISE EXCEPTION 'score_event_created'; END IF;
  IF has_function_privilege('anon','public.rg_purchase_beat_pass(uuid,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.rg_purchase_beat_pass(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'public_can_purchase_pass_rpc'; END IF;
END $$;
\ir ../supabase/verify/20261009000000_rg_beat_pass.sql
