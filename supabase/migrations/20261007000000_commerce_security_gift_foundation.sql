-- RGODBEAT commerce hardening and additive gifting foundation.
-- Apply only after the matching preflight. This is intentionally NOT deployed here.
-- Existing customer/order/purchase UUIDs and historical license ownership are kept.
BEGIN;

-- The production database was verified without these columns. IF NOT EXISTS lets
-- this safely reconcile an environment where the older local migration ran.
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS license_id text;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS contract_version text;
UPDATE public.purchases
   SET license_id=(regexp_match(contract_text, 'LICENSE ID:\s*(RG-[A-Z0-9]+-[0-9]{4}-[A-Z0-9]+)'))[1]
 WHERE (license_id IS NULL OR btrim(license_id)='')
   AND contract_text ~ 'LICENSE ID:\s*RG-[A-Z0-9]+-[0-9]{4}-[A-Z0-9]+';
UPDATE public.purchases
   SET contract_version = coalesce(
     (regexp_match(contract_text, 'VERSION:\s*((NE|EX)-v[0-9]+\.[0-9]+)'))[1],
     CASE WHEN license_tier = 'exclusive' THEN 'EX-v1.0' ELSE 'NE-v1.0' END)
 WHERE contract_version IS NULL OR btrim(contract_version) = '';

CREATE SEQUENCE IF NOT EXISTS public.commerce_license_number_seq AS bigint MINVALUE 1 START 1;
DO $migration$
DECLARE v_count bigint; v_max_suffix bigint;
BEGIN
  SELECT count(*) INTO v_count FROM public.purchases WHERE license_id IS NULL OR btrim(license_id) = '';
  IF v_count > 0 THEN
    SELECT coalesce(max((regexp_match(license_id, '-([0-9]+)$'))[1]::bigint),0)
      INTO v_max_suffix FROM public.purchases WHERE license_id ~ '-[0-9]+$';
    PERFORM setval('public.commerce_license_number_seq', greatest(v_max_suffix, 1), v_max_suffix > 0);
    UPDATE public.purchases p
       SET license_id = 'RG-' || CASE p.license_tier
          WHEN 'mp3' THEN 'MP3' WHEN 'wav' THEN 'WAV' WHEN 'unlimited' THEN 'UNL'
          WHEN 'exclusive' THEN 'EXC' WHEN 'stems' THEN 'STE' ELSE upper(left(p.license_tier,3)) END
          || '-' || extract(year FROM p.created_at)::int::text || '-'
          || lpad(nextval('public.commerce_license_number_seq')::text, 6, '0')
     WHERE p.license_id IS NULL OR btrim(p.license_id) = '';
  END IF;
  IF EXISTS (SELECT 1 FROM public.purchases GROUP BY license_id HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate historical license_id values; resolve them before migration.';
  END IF;
END
$migration$;
ALTER TABLE public.purchases ALTER COLUMN contract_version SET DEFAULT 'NE-v1.0';
ALTER TABLE public.purchases ALTER COLUMN license_id SET NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN contract_version SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_license_id ON public.purchases(license_id);
CREATE INDEX IF NOT EXISTS idx_purchases_contract_version ON public.purchases(contract_version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_order_items_commercial_line ON public.order_items(order_id,beat_id,license_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_commercial_line ON public.purchases(order_id,beat_id,license_type_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_checkout_session ON public.orders(stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_stripe_payment_intent ON public.orders(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Explicit bridge; an Auth UUID is never assumed to equal customers.id.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS auth_user_id uuid;
DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.customers'::regclass AND conname='customers_auth_user_id_fkey') THEN
    ALTER TABLE public.customers ADD CONSTRAINT customers_auth_user_id_fkey
      FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$migration$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_auth_user_id
  ON public.customers(auth_user_id) WHERE auth_user_id IS NOT NULL;
-- Backfill only a one-to-one verified email match, without changing IDs or purchases.
WITH matches AS (
  SELECT c.id customer_id, u.id user_id,
         row_number() OVER (PARTITION BY c.id ORDER BY u.id) customer_match,
         count(*) OVER (PARTITION BY c.id) customer_matches,
         count(*) OVER (PARTITION BY u.id) user_matches
    FROM public.customers c JOIN auth.users u ON lower(btrim(c.email))=lower(btrim(u.email))
   WHERE u.email_confirmed_at IS NOT NULL AND c.auth_user_id IS NULL
)
UPDATE public.customers c SET auth_user_id=m.user_id
  FROM matches m WHERE c.id=m.customer_id AND m.customer_match=1
    AND m.customer_matches=1 AND m.user_matches=1;

CREATE TABLE IF NOT EXISTS public.commerce_checkout_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id text UNIQUE,
  buyer_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email text,
  recipient_mode text NOT NULL CHECK (recipient_mode IN ('self','gift')),
  recipient_kind text CHECK (recipient_kind IS NULL OR recipient_kind IN ('artist','email')),
  recipient_email text,
  recipient_artist_id uuid REFERENCES public.rg_artists(id) ON DELETE SET NULL,
  recipient_artist_slug text,
  snapshot jsonb NOT NULL,
  snapshot_version smallint NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'awaiting_payment' CHECK (state IN
    ('awaiting_payment','paid','fulfilling','fulfilled','expired','failed','needs_review','refunded','disputed')),
  payment_amount_cents bigint CHECK (payment_amount_cents IS NULL OR payment_amount_cents >= 0),
  payment_currency text,
  verified_paid_at timestamptz,
  fulfilled_at timestamptz,
  last_error_code text,
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((recipient_mode='self' AND recipient_kind IS NULL AND recipient_email IS NULL AND recipient_artist_id IS NULL)
      OR (recipient_mode='gift' AND recipient_kind IS NOT NULL
        AND ((recipient_kind='email' AND recipient_email IS NOT NULL AND recipient_artist_id IS NULL)
          OR (recipient_kind='artist' AND recipient_artist_id IS NOT NULL AND recipient_email IS NULL))))
);

CREATE TABLE IF NOT EXISTS public.beat_exclusive_inventory (
  beat_id uuid PRIMARY KEY REFERENCES public.beats(id) ON DELETE RESTRICT,
  order_item_id uuid UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  purchase_id uuid UNIQUE REFERENCES public.purchases(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('held','manual_review','reversed')),
  held_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('historical','verified_payment')),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Existing exclusive licenses stay consumed; ambiguous duplicate history blocks preflight.
INSERT INTO public.beat_exclusive_inventory(beat_id,order_item_id,order_id,purchase_id,state,held_at,source)
  SELECT p.beat_id,p.order_item_id,p.order_id,p.id,'held',p.created_at,'historical'
    FROM public.purchases p WHERE p.license_tier='exclusive' AND p.status='active'
    ORDER BY p.created_at,p.id ON CONFLICT (beat_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.beat_gifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent_id uuid NOT NULL REFERENCES public.commerce_checkout_intents(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  purchase_id uuid UNIQUE REFERENCES public.purchases(id) ON DELETE RESTRICT,
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('artist','email')),
  recipient_email text,
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recipient_artist_id uuid REFERENCES public.rg_artists(id) ON DELETE SET NULL,
  recipient_artist_slug text,
  status text NOT NULL CHECK (status IN ('paid_pending_recipient','ready_to_claim','claimed','revoked','refunded')),
  payment_status text NOT NULL CHECK (payment_status IN ('paid','disputed','refunded')),
  claim_token_generation integer NOT NULL DEFAULT 0 CHECK (claim_token_generation >= 0),
  claimed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((recipient_kind='email' AND recipient_email IS NOT NULL)
      OR (recipient_kind='artist' AND recipient_artist_id IS NOT NULL)),
  CHECK ((status='claimed' AND purchase_id IS NOT NULL AND claimed_at IS NOT NULL)
      OR status <> 'claimed')
);

CREATE OR REPLACE FUNCTION public.rg_validate_beat_gift_recipient()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_intent public.commerce_checkout_intents%ROWTYPE;
BEGIN
  SELECT * INTO v_intent FROM public.commerce_checkout_intents WHERE id=NEW.intent_id FOR SHARE;
  IF NOT FOUND OR v_intent.recipient_mode<>'gift' OR v_intent.recipient_kind<>NEW.recipient_kind THEN
    RAISE EXCEPTION 'gift_recipient_does_not_match_checkout_intent';
  END IF;
  IF NEW.recipient_kind='email' AND lower(btrim(NEW.recipient_email))<>lower(btrim(v_intent.recipient_email)) THEN
    RAISE EXCEPTION 'gift_recipient_email_does_not_match_checkout_intent';
  END IF;
  IF NEW.recipient_kind='artist' AND NEW.recipient_artist_id<>v_intent.recipient_artist_id THEN
    RAISE EXCEPTION 'gift_recipient_artist_does_not_match_checkout_intent';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS beat_gifts_validate_recipient ON public.beat_gifts;
CREATE TRIGGER beat_gifts_validate_recipient BEFORE INSERT OR UPDATE OF intent_id,recipient_kind,recipient_email,recipient_artist_id ON public.beat_gifts
  FOR EACH ROW EXECUTE FUNCTION public.rg_validate_beat_gift_recipient();

CREATE TABLE IF NOT EXISTS public.gift_claim_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid NOT NULL REFERENCES public.beat_gifts(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  generation integer NOT NULL CHECK (generation > 0),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gift_id,generation)
);

CREATE TABLE IF NOT EXISTS public.purchase_guest_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.stripe_event_processing (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  stripe_object_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','manual_review')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  lease_until timestamptz,
  lease_token uuid,
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
-- event_id is already the primary key. A second unique index on (event_id,event_type)
-- is redundant and can deadlock simultaneous ON CONFLICT(event_id) inserts.
ALTER TABLE public.stripe_event_processing
  DROP CONSTRAINT IF EXISTS stripe_event_processing_event_id_event_type_key;
CREATE INDEX IF NOT EXISTS idx_stripe_event_retry ON public.stripe_event_processing(status,lease_until,received_at)
  WHERE status IN ('pending','failed','processing');

CREATE OR REPLACE FUNCTION public.rg_claim_stripe_event(
  p_event_id text,p_event_type text,p_object_id text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_claimed uuid;
BEGIN
  INSERT INTO public.stripe_event_processing(event_id,event_type,stripe_object_id,status)
    VALUES(p_event_id,p_event_type,p_object_id,'pending') ON CONFLICT(event_id) DO NOTHING;
  UPDATE public.stripe_event_processing SET status='processing',attempts=attempts+1,
      lease_until=now()+interval '10 minutes',lease_token=gen_random_uuid(),last_error_code=NULL
    WHERE event_id=p_event_id AND event_type=p_event_type
      AND (status IN ('pending','failed') OR (status='processing' AND lease_until<now()))
    RETURNING lease_token INTO v_claimed;
  RETURN v_claimed;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_stripe_event(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_stripe_event(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_finish_stripe_event(p_event_id text,p_lease_token uuid,p_success boolean,p_error_code text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  UPDATE public.stripe_event_processing SET status=CASE WHEN p_success THEN 'completed' ELSE 'failed' END,
      completed_at=CASE WHEN p_success THEN now() ELSE NULL END,lease_until=NULL,
      lease_token=NULL,
      last_error_code=CASE WHEN p_success THEN NULL ELSE coalesce(nullif(left(p_error_code,80),''),'processing_failed') END
    WHERE event_id=p_event_id AND status='processing' AND lease_token=p_lease_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'stripe_event_lease_lost'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.rg_finish_stripe_event(text,uuid,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_finish_stripe_event(text,uuid,boolean,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.commerce_manual_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE REFERENCES public.stripe_event_processing(event_id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('partial_refund_item_mapping','exclusive_conflict','payment_snapshot_mismatch','identity_conflict','refund_dispute_review')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.commerce_studio_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('order','gift')),
  source_id uuid NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  granted_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type,source_id)
);

CREATE TABLE IF NOT EXISTS public.transactional_email_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('beat_gift','commerce_receipt')),
  source_id uuid NOT NULL,
  message_type text NOT NULL,
  recipient_email text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_secret text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','retry','failed','cancelled')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  lease_until timestamptz,
  lease_token uuid,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type,source_id,message_type)
);
CREATE INDEX IF NOT EXISTS idx_transactional_email_retry
  ON public.transactional_email_jobs(status,next_attempt_at) WHERE status IN ('queued','retry','sending');

CREATE OR REPLACE FUNCTION public.rg_claim_transactional_email_job()
RETURNS TABLE(job_id uuid,recipient_email text,payload jsonb,encrypted_secret text,lease_token uuid,attempt integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT j.id INTO v_id FROM public.transactional_email_jobs j
   WHERE ((j.status IN ('queued','retry') AND j.next_attempt_at<=now())
      OR (j.status='sending' AND j.lease_until<now()))
   ORDER BY j.next_attempt_at,j.created_at LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.transactional_email_jobs j SET status='sending',attempts=j.attempts+1,
      lease_until=now()+interval '5 minutes',lease_token=gen_random_uuid(),last_error_code=NULL
    WHERE j.id=v_id RETURNING j.id,j.recipient_email,j.payload,j.encrypted_secret,j.lease_token,j.attempts;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_transactional_email_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_transactional_email_job() TO service_role;

CREATE OR REPLACE FUNCTION public.rg_finish_transactional_email_job(
  p_job_id uuid,p_lease_token uuid,p_status text,p_provider_message_id text DEFAULT NULL,
  p_error_code text DEFAULT NULL,p_next_attempt_at timestamptz DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF p_status NOT IN ('sent','retry','failed','cancelled') THEN RAISE EXCEPTION 'invalid_email_job_state'; END IF;
  UPDATE public.transactional_email_jobs SET status=p_status,provider_message_id=coalesce(p_provider_message_id,provider_message_id),
      sent_at=CASE WHEN p_status='sent' THEN now() ELSE sent_at END,
      next_attempt_at=CASE WHEN p_status='retry' THEN coalesce(p_next_attempt_at,now()+interval '5 minutes') ELSE next_attempt_at END,
      last_error_code=CASE WHEN p_status='sent' THEN NULL ELSE coalesce(nullif(left(p_error_code,80),''),last_error_code) END,
      lease_until=NULL,lease_token=NULL
    WHERE id=p_job_id AND status='sending' AND lease_token=p_lease_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'email_job_lease_lost'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.rg_finish_transactional_email_job(uuid,uuid,text,text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_finish_transactional_email_job(uuid,uuid,text,text,text,timestamptz) TO service_role;

-- A guest credential is order-scoped; purchase UUIDs stay selectors, never credentials.
CREATE OR REPLACE FUNCTION public.rg_rotate_purchase_guest_access(p_order_id uuid,p_customer_id uuid,p_token_hash text)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_expiry timestamptz;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_guest_access_token_hash'; END IF;
  PERFORM 1 FROM public.orders WHERE id=p_order_id AND customer_id=p_customer_id
    AND status='completed' AND payment_status='paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'guest_order_not_eligible'; END IF;
  IF EXISTS (SELECT 1 FROM public.beat_gifts WHERE order_id=p_order_id) THEN
    RAISE EXCEPTION 'gift_order_buyer_has_no_license_access';
  END IF;
  UPDATE public.purchase_guest_access_tokens SET revoked_at=now()
   WHERE order_id=p_order_id AND revoked_at IS NULL;
  v_expiry := now() + interval '90 days';
  INSERT INTO public.purchase_guest_access_tokens(order_id,customer_id,token_hash,expires_at)
    VALUES(p_order_id,p_customer_id,p_token_hash,v_expiry);
  RETURN v_expiry;
END $$;
REVOKE ALL ON FUNCTION public.rg_rotate_purchase_guest_access(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_rotate_purchase_guest_access(uuid,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_allocate_commerce_license_id(p_tier text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_prefix text;
BEGIN
  v_prefix := CASE lower(p_tier) WHEN 'mp3' THEN 'MP3' WHEN 'wav' THEN 'WAV'
    WHEN 'unlimited' THEN 'UNL' WHEN 'exclusive' THEN 'EXC' WHEN 'stems' THEN 'STE'
    ELSE NULL END;
  IF v_prefix IS NULL THEN RAISE EXCEPTION 'invalid_license_tier'; END IF;
  LOOP
    DECLARE v_license_id text;
    BEGIN
      v_license_id := 'RG-'||v_prefix||'-'||extract(year FROM now())::int::text||'-'||lpad(nextval('public.commerce_license_number_seq')::text,6,'0');
      IF NOT EXISTS (SELECT 1 FROM public.purchases WHERE license_id=v_license_id) THEN RETURN v_license_id; END IF;
    END;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.rg_allocate_commerce_license_id(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_allocate_commerce_license_id(text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_revoke_commerce_order(p_order_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order public.orders%ROWTYPE;
BEGIN
  IF p_reason NOT IN ('refund','dispute') THEN RAISE EXCEPTION 'invalid_commerce_revocation_reason'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commerce_order_not_found'; END IF;
  UPDATE public.purchases SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'revoked' END WHERE order_id=p_order_id;
  UPDATE public.beat_gifts SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'revoked' END,
      payment_status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
      revoked_at=coalesce(revoked_at,now()),revoked_reason=p_reason
    WHERE order_id=p_order_id;
  UPDATE public.gift_claim_tokens SET revoked_at=coalesce(revoked_at,now())
    WHERE gift_id IN (SELECT id FROM public.beat_gifts WHERE order_id=p_order_id);
  UPDATE public.transactional_email_jobs SET status='cancelled',lease_until=NULL,lease_token=NULL
    WHERE source_type='beat_gift' AND source_id IN (SELECT id FROM public.beat_gifts WHERE order_id=p_order_id)
      AND status IN ('queued','retry','sending');
  UPDATE public.commerce_checkout_intents SET state=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END
    WHERE stripe_checkout_session_id=v_order.stripe_checkout_session_id;
  IF p_reason='refund' THEN
    UPDATE public.orders SET payment_status='refunded' WHERE id=p_order_id;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.rg_revoke_commerce_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_revoke_commerce_order(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_claim_beat_gift(
  p_token_hash text,p_user_id uuid,p_customer_id uuid,p_license_id text,p_contract_text text
) RETURNS TABLE(gift_id uuid,purchase_id uuid,beat_id uuid,license_tier text,studio_access_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_gift public.beat_gifts%ROWTYPE; v_token public.gift_claim_tokens%ROWTYPE;
  v_order public.orders%ROWTYPE; v_item public.order_items%ROWTYPE; v_tier text; v_email text;
  v_purchase_id uuid; v_studio_until timestamptz;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_license_id !~ '^RG-(MP3|WAV|UNL|EXC|STE)-[0-9]{4}-[A-Z0-9]{6,}$'
     OR p_contract_text IS NULL OR length(p_contract_text)>100000 THEN
    RAISE EXCEPTION 'invalid_gift_claim_request' USING ERRCODE='22023';
  END IF;
  SELECT u.email INTO v_email FROM auth.users u
    WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'verified_recipient_account_required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.customers c WHERE c.id=p_customer_id AND c.auth_user_id=p_user_id
    AND lower(btrim(c.email))=lower(btrim(v_email));
  IF NOT FOUND THEN RAISE EXCEPTION 'recipient_customer_identity_mismatch' USING ERRCODE='42501'; END IF;

  SELECT t.* INTO v_token FROM public.gift_claim_tokens t WHERE t.token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_token_invalid_expired_or_used' USING ERRCODE='42501'; END IF;
  SELECT g.order_id INTO v_order.id FROM public.beat_gifts g WHERE g.id=v_token.gift_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_not_found'; END IF;
  PERFORM 1 FROM public.orders WHERE id=v_order.id FOR UPDATE;
  SELECT g.* INTO v_gift FROM public.beat_gifts g WHERE g.id=v_token.gift_id FOR UPDATE;
  SELECT t.* INTO v_token FROM public.gift_claim_tokens t WHERE t.id=v_token.id AND t.token_hash=p_token_hash
    AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_token_invalid_expired_or_used' USING ERRCODE='42501'; END IF;
  IF v_gift.id IS NULL OR v_gift.status<>'ready_to_claim' OR v_gift.payment_status<>'paid'
      OR v_gift.recipient_kind<>'email' OR lower(btrim(v_gift.recipient_email))<>lower(btrim(v_email))
      OR (v_gift.recipient_user_id IS NOT NULL AND v_gift.recipient_user_id<>p_user_id)
      OR v_gift.purchase_id IS NOT NULL THEN
    RAISE EXCEPTION 'gift_not_claimable_for_account' USING ERRCODE='42501';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id=v_gift.order_id
    AND o.status='completed' AND o.payment_status='paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_payment_not_verified_or_reversed' USING ERRCODE='42501'; END IF;
  SELECT oi.* INTO v_item FROM public.order_items oi WHERE oi.id=v_gift.order_item_id AND oi.order_id=v_gift.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_order_item_unavailable'; END IF;
  SELECT lower(lt.slug) INTO v_tier FROM public.license_types lt WHERE lt.id=v_item.license_type_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'gift_license_unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchases p WHERE p.order_item_id=v_item.id AND p.status='active') THEN
    RAISE EXCEPTION 'gift_entitlement_already_exists';
  END IF;
  INSERT INTO public.purchases(order_id,order_item_id,customer_id,beat_id,license_type_id,license_tier,
      contract_text,status,license_id,contract_version)
    VALUES(v_order.id,v_item.id,p_customer_id,v_item.beat_id,v_item.license_type_id,v_tier,p_contract_text,'active',
      p_license_id,CASE WHEN v_tier='exclusive' THEN 'EX-v1.0' ELSE 'NE-v1.0' END)
    RETURNING id INTO v_purchase_id;
  UPDATE public.beat_gifts SET status='claimed',payment_status='paid',purchase_id=v_purchase_id,
      recipient_user_id=p_user_id,claimed_at=now() WHERE id=v_gift.id;
  UPDATE public.gift_claim_tokens SET used_at=now() WHERE gift_claim_tokens.gift_id=v_gift.id AND used_at IS NULL;
  IF v_tier='exclusive' THEN
    UPDATE public.beat_exclusive_inventory SET purchase_id=v_purchase_id
      WHERE beat_id=v_item.beat_id AND order_item_id=v_item.id AND state='held';
    IF NOT FOUND THEN RAISE EXCEPTION 'exclusive_inventory_reservation_missing'; END IF;
  END IF;
  v_studio_until := public.rg_grant_commerce_studio_access('gift',v_gift.intent_id,p_customer_id,30);
  RETURN QUERY SELECT v_gift.id,v_purchase_id,v_item.beat_id,v_tier,v_studio_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_touch_commerce_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.rg_freeze_checkout_intent_facts()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.buyer_auth_user_id IS DISTINCT FROM OLD.buyer_auth_user_id
     OR NEW.buyer_email IS DISTINCT FROM OLD.buyer_email OR NEW.recipient_mode IS DISTINCT FROM OLD.recipient_mode
     OR NEW.recipient_kind IS DISTINCT FROM OLD.recipient_kind OR NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
     OR NEW.recipient_artist_id IS DISTINCT FROM OLD.recipient_artist_id OR NEW.recipient_artist_slug IS DISTINCT FROM OLD.recipient_artist_slug
     OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.snapshot_version IS DISTINCT FROM OLD.snapshot_version THEN
    RAISE EXCEPTION 'checkout_intent_commercial_facts_are_immutable';
  END IF;
  IF OLD.stripe_checkout_session_id IS NOT NULL AND NEW.stripe_checkout_session_id IS DISTINCT FROM OLD.stripe_checkout_session_id THEN
    RAISE EXCEPTION 'checkout_intent_session_is_immutable';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS commerce_checkout_intents_freeze_facts ON public.commerce_checkout_intents;
CREATE TRIGGER commerce_checkout_intents_freeze_facts BEFORE UPDATE ON public.commerce_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.rg_freeze_checkout_intent_facts();
DROP TRIGGER IF EXISTS commerce_checkout_intents_touch ON public.commerce_checkout_intents;
CREATE TRIGGER commerce_checkout_intents_touch BEFORE UPDATE ON public.commerce_checkout_intents
  FOR EACH ROW EXECUTE FUNCTION public.rg_touch_commerce_updated_at();
DROP TRIGGER IF EXISTS beat_gifts_touch ON public.beat_gifts;
CREATE TRIGGER beat_gifts_touch BEFORE UPDATE ON public.beat_gifts
  FOR EACH ROW EXECUTE FUNCTION public.rg_touch_commerce_updated_at();
DROP TRIGGER IF EXISTS transactional_email_jobs_touch ON public.transactional_email_jobs;
CREATE TRIGGER transactional_email_jobs_touch BEFORE UPDATE ON public.transactional_email_jobs
  FOR EACH ROW EXECUTE FUNCTION public.rg_touch_commerce_updated_at();

CREATE OR REPLACE FUNCTION public.rg_commerce_link_verified_customer(p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_email text; v_name text; v_customer uuid; v_existing_auth uuid;
BEGIN
  SELECT lower(btrim(u.email)), coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),split_part(u.email,'@',1))
    INTO v_email,v_name FROM auth.users u
   WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'verified_commerce_identity_required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_email));
  SELECT id INTO v_customer FROM public.customers WHERE auth_user_id=p_user_id FOR UPDATE;
  IF v_customer IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.customers WHERE email=v_email AND id<>v_customer) THEN
      RAISE EXCEPTION 'commerce_identity_email_conflict' USING ERRCODE='23505';
    END IF;
    UPDATE public.customers SET email=v_email, name=coalesce(name,v_name), updated_at=now() WHERE id=v_customer;
    RETURN v_customer;
  END IF;
  SELECT id,auth_user_id INTO v_customer, v_existing_auth FROM public.customers
    WHERE lower(btrim(email))=v_email FOR UPDATE;
  IF v_customer IS NOT NULL THEN
    IF v_existing_auth IS NOT NULL THEN RAISE EXCEPTION 'commerce_identity_email_conflict' USING ERRCODE='23505'; END IF;
    UPDATE public.customers SET auth_user_id=p_user_id,
      email=v_email,name=coalesce(name,v_name),updated_at=now() WHERE id=v_customer;
    RETURN v_customer;
  END IF;
  INSERT INTO public.customers(email,name,auth_user_id)
    VALUES(v_email,v_name,p_user_id)
    ON CONFLICT(email) DO UPDATE SET auth_user_id=EXCLUDED.auth_user_id,
      name=coalesce(public.customers.name,EXCLUDED.name), updated_at=now()
      WHERE public.customers.auth_user_id IS NULL OR public.customers.auth_user_id=EXCLUDED.auth_user_id
    RETURNING id INTO v_customer;
  IF v_customer IS NULL THEN RAISE EXCEPTION 'commerce_identity_email_conflict' USING ERRCODE='23505'; END IF;
  RETURN v_customer;
END $$;
REVOKE ALL ON FUNCTION public.rg_commerce_link_verified_customer(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_commerce_link_verified_customer(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_resolve_commerce_payer_customer(p_email text,p_name text,p_stripe_customer_id text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_email text; v_customer uuid;
BEGIN
  v_email := lower(btrim(p_email));
  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR length(v_email)>254 THEN
    RAISE EXCEPTION 'invalid_commerce_customer_email' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(v_email));
  SELECT id INTO v_customer FROM public.customers WHERE lower(btrim(email))=v_email FOR UPDATE;
  IF v_customer IS NOT NULL THEN
    UPDATE public.customers SET email=v_email,name=coalesce(name,nullif(btrim(p_name),'')),
      stripe_customer_id=coalesce(p_stripe_customer_id,stripe_customer_id),updated_at=now()
      WHERE id=v_customer;
    RETURN v_customer;
  END IF;
  INSERT INTO public.customers(email,name,stripe_customer_id)
    VALUES(v_email,nullif(btrim(p_name),''),p_stripe_customer_id) RETURNING id INTO v_customer;
  RETURN v_customer;
END $$;
REVOKE ALL ON FUNCTION public.rg_resolve_commerce_payer_customer(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_resolve_commerce_payer_customer(text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_grant_commerce_studio_access(p_source_type text,p_source_id uuid,p_customer_id uuid,p_days integer DEFAULT 30)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old timestamptz; v_new timestamptz;
BEGIN
  IF p_source_type NOT IN ('order','gift') THEN RAISE EXCEPTION 'invalid_studio_grant_source'; END IF;
  IF p_days<1 OR p_days>365 THEN RAISE EXCEPTION 'invalid_studio_grant_days'; END IF;
  PERFORM 1 FROM public.customers WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'studio_customer_not_found'; END IF;
  SELECT granted_until INTO v_new FROM public.commerce_studio_access_grants
   WHERE source_type=p_source_type AND source_id=p_source_id;
  IF v_new IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.commerce_studio_access_grants
      WHERE source_type=p_source_type AND source_id=p_source_id AND customer_id=p_customer_id) THEN
      RAISE EXCEPTION 'studio_grant_source_customer_mismatch';
    END IF;
    RETURN v_new;
  END IF;
  SELECT studio_access_until INTO v_old FROM public.customers WHERE id=p_customer_id;
  v_new := greatest(coalesce(v_old,now()),now()) + make_interval(days=>p_days);
  UPDATE public.customers SET studio_access_until=v_new,updated_at=now() WHERE id=p_customer_id;
  INSERT INTO public.commerce_studio_access_grants(source_type,source_id,customer_id,granted_until)
    VALUES(p_source_type,p_source_id,p_customer_id,v_new);
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.rg_grant_commerce_studio_access(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_grant_commerce_studio_access(text,uuid,uuid,integer) TO service_role;

-- Private commerce records and email payloads are server-only, including from authenticated clients.
DO $rls$
DECLARE v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['commerce_checkout_intents','beat_exclusive_inventory','beat_gifts',
    'gift_claim_tokens','purchase_guest_access_tokens','stripe_event_processing','commerce_manual_reviews',
    'commerce_studio_access_grants','transactional_email_jobs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',v_table);
  END LOOP;
  FOREACH v_table IN ARRAY ARRAY['customers','orders','order_items','purchases'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',v_table);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',v_table);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',v_table);
  END LOOP;
END
$rls$;
GRANT USAGE,SELECT ON SEQUENCE public.commerce_license_number_seq TO service_role;

COMMIT;
