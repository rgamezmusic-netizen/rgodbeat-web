-- RG Beat Pass: a fixed-cost RG utility redemption backed by the existing append-only coin ledger.
-- This is deliberately separate from USD discount redemption and RG purchases.
BEGIN;

ALTER TABLE public.rg_economy_config
  ADD COLUMN IF NOT EXISTS beat_pass_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS beat_pass_cost_rg bigint NOT NULL DEFAULT 10000,
  ADD COLUMN IF NOT EXISTS beat_pass_eligible_license_tiers text[] NOT NULL DEFAULT ARRAY['mp3']::text[];

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.rg_economy_config'::regclass AND conname='rg_economy_beat_pass_cost_check') THEN
    ALTER TABLE public.rg_economy_config ADD CONSTRAINT rg_economy_beat_pass_cost_check CHECK (beat_pass_cost_rg=10000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.rg_economy_config'::regclass AND conname='rg_economy_beat_pass_tiers_check') THEN
    ALTER TABLE public.rg_economy_config ADD CONSTRAINT rg_economy_beat_pass_tiers_check
      CHECK (cardinality(beat_pass_eligible_license_tiers)>0
        AND 'exclusive' <> ALL(beat_pass_eligible_license_tiers)
        AND 'unlimited' <> ALL(beat_pass_eligible_license_tiers)
        AND 'stems' <> ALL(beat_pass_eligible_license_tiers));
  END IF;
END $$;

ALTER TABLE public.commerce_checkout_intents ADD COLUMN IF NOT EXISTS beat_pass_request_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_intents_beat_pass_request
  ON public.commerce_checkout_intents(buyer_auth_user_id,beat_pass_request_key)
  WHERE beat_pass_request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.rg_beat_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purchase_request_key text NOT NULL CHECK (length(btrim(purchase_request_key)) BETWEEN 16 AND 128),
  coin_ledger_id uuid NOT NULL UNIQUE REFERENCES public.rg_coin_ledger(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available','reserved','consumed')),
  reserved_intent_id uuid UNIQUE REFERENCES public.commerce_checkout_intents(id) ON DELETE RESTRICT,
  consumed_order_id uuid UNIQUE REFERENCES public.orders(id) ON DELETE RESTRICT,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id,purchase_request_key),
  CHECK ((status='available' AND reserved_intent_id IS NULL AND consumed_order_id IS NULL AND consumed_at IS NULL)
      OR (status='reserved' AND reserved_intent_id IS NOT NULL AND consumed_order_id IS NULL AND consumed_at IS NULL)
      OR (status='consumed' AND reserved_intent_id IS NOT NULL AND consumed_order_id IS NOT NULL AND consumed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_rg_beat_passes_available ON public.rg_beat_passes(user_id,purchased_at,id) WHERE status='available';
CREATE INDEX IF NOT EXISTS idx_rg_beat_passes_reserved_intent ON public.rg_beat_passes(reserved_intent_id) WHERE reserved_intent_id IS NOT NULL;
ALTER TABLE public.rg_beat_passes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rg_beat_passes FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.rg_beat_passes TO service_role;

CREATE OR REPLACE FUNCTION public.rg_guard_beat_pass_request_key()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.beat_pass_request_key IS DISTINCT FROM OLD.beat_pass_request_key THEN
    RAISE EXCEPTION 'beat_pass_checkout_key_is_immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rg_guard_beat_pass_request_key() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS commerce_intents_beat_pass_key_immutable ON public.commerce_checkout_intents;
CREATE TRIGGER commerce_intents_beat_pass_key_immutable BEFORE UPDATE OF beat_pass_request_key
  ON public.commerce_checkout_intents FOR EACH ROW EXECUTE FUNCTION public.rg_guard_beat_pass_request_key();

-- A purchase is one atomic wallet debit plus durable pass issuance. It shares the wallet lock
-- used by RG contributions so concurrent spend/contribution operations cannot overspend.
CREATE OR REPLACE FUNCTION public.rg_purchase_beat_pass(p_user_id uuid,p_request_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_pass_id uuid; v_ledger_id uuid; v_cost bigint; v_balance numeric;
BEGIN
  IF p_user_id IS NULL OR p_request_key IS NULL OR p_request_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN RAISE EXCEPTION 'invalid_beat_pass_purchase'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
  SELECT id INTO v_pass_id FROM public.rg_beat_passes WHERE user_id=p_user_id AND purchase_request_key=p_request_key;
  IF v_pass_id IS NOT NULL THEN RETURN v_pass_id; END IF;
  SELECT beat_pass_cost_rg INTO v_cost FROM public.rg_economy_config WHERE id=true AND beat_pass_enabled=true FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'rg_beat_pass_disabled'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_balance FROM public.rg_coin_ledger WHERE user_id=p_user_id;
  IF v_balance<v_cost THEN RAISE EXCEPTION 'insufficient_rg_balance'; END IF;
  v_pass_id:=gen_random_uuid();
  INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key,metadata)
    VALUES(p_user_id,-v_cost,'REDEMPTION','RG Beat Pass redemption','rg_beat_pass',v_pass_id::text,
      'rg-beat-pass:'||p_user_id::text||':'||p_request_key,jsonb_build_object('product','RG_BEAT_PASS_V1'))
    RETURNING id INTO v_ledger_id;
  INSERT INTO public.rg_beat_passes(id,user_id,purchase_request_key,coin_ledger_id)
    VALUES(v_pass_id,p_user_id,p_request_key,v_ledger_id);
  RETURN v_pass_id;
END $$;
REVOKE ALL ON FUNCTION public.rg_purchase_beat_pass(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_purchase_beat_pass(uuid,text) TO service_role;

-- Reserve, do not consume, the oldest available pass for a verified buyer and frozen commerce intent.
CREATE OR REPLACE FUNCTION public.rg_reserve_next_beat_pass(p_user_id uuid,p_intent_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_pass_id uuid; v_buyer uuid;
BEGIN
  IF p_user_id IS NULL OR p_intent_id IS NULL THEN RAISE EXCEPTION 'invalid_beat_pass_reservation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
  SELECT buyer_auth_user_id INTO v_buyer FROM public.commerce_checkout_intents WHERE id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_buyer IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'beat_pass_intent_owner_mismatch'; END IF;
  SELECT id INTO v_pass_id FROM public.rg_beat_passes WHERE reserved_intent_id=p_intent_id AND user_id=p_user_id AND status IN ('reserved','consumed');
  IF v_pass_id IS NOT NULL THEN RETURN v_pass_id; END IF;
  SELECT id INTO v_pass_id FROM public.rg_beat_passes WHERE user_id=p_user_id AND status='available'
    ORDER BY purchased_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF v_pass_id IS NULL THEN RAISE EXCEPTION 'rg_beat_pass_unavailable'; END IF;
  UPDATE public.rg_beat_passes SET status='reserved',reserved_intent_id=p_intent_id WHERE id=v_pass_id;
  RETURN v_pass_id;
END $$;
REVOKE ALL ON FUNCTION public.rg_reserve_next_beat_pass(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_reserve_next_beat_pass(uuid,uuid) TO service_role;

-- Consume only after the canonical commerce order and intent have completed successfully.
CREATE OR REPLACE FUNCTION public.rg_consume_beat_pass(p_intent_id uuid,p_order_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE v_intent public.commerce_checkout_intents%ROWTYPE; v_pass public.rg_beat_passes%ROWTYPE;
BEGIN
  SELECT * INTO v_intent FROM public.commerce_checkout_intents WHERE id=p_intent_id FOR UPDATE;
  IF NOT FOUND OR v_intent.state<>'fulfilled' OR v_intent.snapshot->>'paymentMethod'<>'rg_beat_pass'
     OR v_intent.snapshot->>'kind'<>'beat_pass_redemption' THEN RAISE EXCEPTION 'beat_pass_intent_not_fulfilled'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE id=p_order_id AND status='completed' AND payment_status='paid'
      AND stripe_checkout_session_id='rgpass:'||p_intent_id::text AND total_amount=0) THEN
    RAISE EXCEPTION 'beat_pass_order_not_completed';
  END IF;
  SELECT * INTO v_pass FROM public.rg_beat_passes WHERE reserved_intent_id=p_intent_id AND user_id=v_intent.buyer_auth_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'beat_pass_reservation_missing'; END IF;
  IF v_pass.status='consumed' THEN
    IF v_pass.consumed_order_id<>p_order_id THEN RAISE EXCEPTION 'beat_pass_consumption_conflict'; END IF;
    RETURN true;
  END IF;
  IF v_pass.status<>'reserved' THEN RAISE EXCEPTION 'beat_pass_not_reserved'; END IF;
  UPDATE public.rg_beat_passes SET status='consumed',consumed_order_id=p_order_id,consumed_at=now() WHERE id=v_pass.id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.rg_consume_beat_pass(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_consume_beat_pass(uuid,uuid) TO service_role;

COMMIT;
