-- Gift V1: safe artist selection, claim lifecycle, buyer status, and private email work queue.
-- Requires 20261007000000_commerce_security_gift_foundation.sql first.
BEGIN;

ALTER TABLE public.beat_gifts
  ADD COLUMN IF NOT EXISTS claim_email_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS claim_email_window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS claim_email_last_sent_at timestamptz;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.beat_gifts'::regclass AND conname='beat_gifts_claim_email_count_check') THEN
    ALTER TABLE public.beat_gifts ADD CONSTRAINT beat_gifts_claim_email_count_check CHECK (claim_email_count >= 0);
  END IF;
END $$;

-- Keep enough grant history to remove a refunded commerce benefit without
-- shortening unrelated later Studio extensions.
ALTER TABLE public.commerce_studio_access_grants
  ADD COLUMN IF NOT EXISTS prior_until timestamptz,
  ADD COLUMN IF NOT EXISTS grant_days integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
UPDATE public.commerce_studio_access_grants
  SET prior_until=coalesce(prior_until,granted_until-interval '30 days')
  WHERE prior_until IS NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.commerce_studio_access_grants'::regclass AND conname='commerce_studio_access_grants_days_check') THEN
    ALTER TABLE public.commerce_studio_access_grants ADD CONSTRAINT commerce_studio_access_grants_days_check CHECK (grant_days BETWEEN 1 AND 365);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.rg_grant_commerce_studio_access(p_source_type text,p_source_id uuid,p_customer_id uuid,p_days integer DEFAULT 30)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_old timestamptz; v_base timestamptz; v_new timestamptz; v_existing public.commerce_studio_access_grants%ROWTYPE;
BEGIN
  IF p_source_type NOT IN ('order','gift') THEN RAISE EXCEPTION 'invalid_studio_grant_source'; END IF;
  IF p_days<1 OR p_days>365 THEN RAISE EXCEPTION 'invalid_studio_grant_days'; END IF;
  PERFORM 1 FROM public.customers WHERE id=p_customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'studio_customer_not_found'; END IF;
  SELECT * INTO v_existing FROM public.commerce_studio_access_grants WHERE source_type=p_source_type AND source_id=p_source_id;
  IF FOUND THEN
    IF v_existing.customer_id<>p_customer_id THEN RAISE EXCEPTION 'studio_grant_source_customer_mismatch'; END IF;
    IF v_existing.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'studio_grant_source_revoked'; END IF;
    RETURN v_existing.granted_until;
  END IF;
  SELECT studio_access_until INTO v_old FROM public.customers WHERE id=p_customer_id;
  v_base:=greatest(coalesce(v_old,now()),now());
  v_new:=v_base+make_interval(days=>p_days);
  UPDATE public.customers SET studio_access_until=v_new,updated_at=now() WHERE id=p_customer_id;
  INSERT INTO public.commerce_studio_access_grants(source_type,source_id,customer_id,prior_until,grant_days,granted_until)
    VALUES(p_source_type,p_source_id,p_customer_id,v_base,p_days,v_new);
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.rg_grant_commerce_studio_access(text,uuid,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_grant_commerce_studio_access(text,uuid,uuid,integer) TO service_role;

-- A context UUID can preserve signup return state without putting a gift token in a redirect URL.
CREATE TABLE IF NOT EXISTS public.gift_claim_contexts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gift_id uuid NOT NULL REFERENCES public.beat_gifts(id) ON DELETE CASCADE,
  claim_token_hash text NOT NULL CHECK (claim_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gift_claim_context_expiry ON public.gift_claim_contexts(expires_at);

CREATE TABLE IF NOT EXISTS public.commerce_rate_limits (
  scope text NOT NULL,
  key_hash text NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count >= 0),
  PRIMARY KEY(scope,key_hash)
);
ALTER TABLE public.commerce_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_rate_limits FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.commerce_rate_limits TO service_role;
CREATE OR REPLACE FUNCTION public.rg_consume_commerce_rate_limit(
  p_scope text,p_key_hash text,p_limit integer,p_window_seconds integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_now timestamptz:=now(); v_allowed boolean;
BEGIN
  IF p_scope !~ '^[a-z_]{2,32}$' OR p_key_hash !~ '^[0-9a-f]{64}$' OR p_limit<1 OR p_limit>1000 OR p_window_seconds<1 OR p_window_seconds>86400 THEN
    RAISE EXCEPTION 'invalid_rate_limit_request' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.commerce_rate_limits(scope,key_hash,window_started_at,request_count)
    VALUES(p_scope,p_key_hash,v_now,1)
  ON CONFLICT(scope,key_hash) DO UPDATE SET
    window_started_at=CASE WHEN public.commerce_rate_limits.window_started_at<=v_now-make_interval(secs=>p_window_seconds) THEN v_now ELSE public.commerce_rate_limits.window_started_at END,
    request_count=CASE WHEN public.commerce_rate_limits.window_started_at<=v_now-make_interval(secs=>p_window_seconds) THEN 1 ELSE public.commerce_rate_limits.request_count+1 END
  RETURNING request_count<=p_limit INTO v_allowed;
  RETURN v_allowed;
END $$;
REVOKE ALL ON FUNCTION public.rg_consume_commerce_rate_limit(text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_consume_commerce_rate_limit(text,text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_search_gift_artists(p_query text)
RETURNS TABLE(stage_name text, slug text, bio text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_query text := left(btrim(coalesce(p_query,'')),60);
BEGIN
  IF length(v_query)<2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT a.stage_name,a.slug,a.bio FROM public.rg_artists a
  JOIN auth.users u ON u.id=a.user_id AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
  WHERE a.status='active'
    AND (a.stage_name ILIKE '%'||v_query||'%' OR a.slug ILIKE '%'||v_query||'%')
    AND (SELECT count(*) FROM public.customers c WHERE lower(btrim(c.email))=lower(btrim(u.email))) <= 1
    AND NOT EXISTS (SELECT 1 FROM public.customers c WHERE lower(btrim(c.email))=lower(btrim(u.email))
      AND c.auth_user_id IS NOT NULL AND c.auth_user_id<>u.id)
  ORDER BY a.stage_name,a.slug LIMIT 8;
END $$;
REVOKE ALL ON FUNCTION public.rg_search_gift_artists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rg_search_gift_artists(text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rg_resolve_gift_artist(p_slug text)
RETURNS TABLE(artist_id uuid,user_id uuid,recipient_email text,recipient_name text,customer_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
  SELECT a.id,u.id,lower(btrim(u.email)),coalesce(nullif(btrim(u.raw_user_meta_data->>'full_name'),''),a.stage_name),
    CASE WHEN (SELECT count(*) FROM public.customers c2 WHERE lower(btrim(c2.email))=lower(btrim(u.email)))=1
      AND NOT EXISTS (SELECT 1 FROM public.customers c3 WHERE lower(btrim(c3.email))=lower(btrim(u.email))
        AND c3.auth_user_id IS NOT NULL AND c3.auth_user_id<>u.id)
      THEN (SELECT c4.id FROM public.customers c4 WHERE lower(btrim(c4.email))=lower(btrim(u.email)) LIMIT 1)
      ELSE NULL END
  FROM public.rg_artists a JOIN auth.users u ON u.id=a.user_id
  WHERE a.slug=p_slug AND a.status='active' AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.rg_resolve_gift_artist(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_resolve_gift_artist(text) TO service_role;

-- The token hash, gift state, throttling counters and email job change atomically.
CREATE OR REPLACE FUNCTION public.rg_prepare_gift_claim_email(
  p_gift_id uuid,p_token_hash text,p_expiry timestamptz,p_encrypted_secret text,p_payload jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_gift public.beat_gifts%ROWTYPE; v_generation integer; v_now timestamptz:=now();
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_expiry<=v_now OR p_expiry>v_now+interval '8 days'
     OR p_encrypted_secret IS NULL OR length(p_encrypted_secret)>8192 THEN
    RAISE EXCEPTION 'invalid_gift_claim_email_request' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_gift FROM public.beat_gifts WHERE id=p_gift_id FOR UPDATE;
  IF NOT FOUND OR v_gift.status NOT IN ('paid_pending_recipient','ready_to_claim') OR v_gift.payment_status<>'paid'
     OR v_gift.recipient_email IS NULL OR v_gift.purchase_id IS NOT NULL THEN
    RAISE EXCEPTION 'gift_is_not_email_claimable' USING ERRCODE='42501';
  END IF;
  -- This runs while fulfillment is still processing: the token/job are mandatory work
  -- that must exist before the order can move to completed. Claim preview still gates
  -- on completed, so no recipient can claim early.
  PERFORM 1 FROM public.orders WHERE id=v_gift.order_id AND status IN ('processing','completed') AND payment_status='paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_payment_not_verified' USING ERRCODE='42501'; END IF;
  IF v_gift.claim_email_last_sent_at>v_now-interval '60 seconds' THEN
    RAISE EXCEPTION 'gift_resend_rate_limited' USING ERRCODE='42501';
  END IF;
  IF v_gift.claim_email_window_started_at IS NULL OR v_gift.claim_email_window_started_at<=v_now-interval '24 hours' THEN
    UPDATE public.beat_gifts SET claim_email_count=1,claim_email_window_started_at=v_now,
      claim_email_last_sent_at=v_now,status='ready_to_claim' WHERE id=p_gift_id;
  ELSE
    IF v_gift.claim_email_count>=6 THEN RAISE EXCEPTION 'gift_resend_daily_limit' USING ERRCODE='42501'; END IF;
    UPDATE public.beat_gifts SET claim_email_count=claim_email_count+1,
      claim_email_last_sent_at=v_now,status='ready_to_claim' WHERE id=p_gift_id;
  END IF;
  UPDATE public.gift_claim_tokens SET revoked_at=coalesce(revoked_at,v_now)
    WHERE gift_id=p_gift_id AND used_at IS NULL AND revoked_at IS NULL;
  UPDATE public.gift_claim_contexts gc SET consumed_at=coalesce(gc.consumed_at,v_now)
    WHERE gc.gift_id=p_gift_id AND gc.consumed_at IS NULL;
  v_generation:=v_gift.claim_token_generation+1;
  INSERT INTO public.gift_claim_tokens(gift_id,token_hash,generation,expires_at)
    VALUES(p_gift_id,p_token_hash,v_generation,p_expiry);
  UPDATE public.beat_gifts SET claim_token_generation=v_generation WHERE id=p_gift_id;
  INSERT INTO public.transactional_email_jobs(source_type,source_id,message_type,recipient_email,payload,encrypted_secret,status,attempts,next_attempt_at,last_error_code,lease_until,lease_token)
    VALUES('beat_gift',p_gift_id,'gift_claim',v_gift.recipient_email,coalesce(p_payload,'{}'::jsonb),p_encrypted_secret,'queued',0,v_now,NULL,NULL,NULL)
  ON CONFLICT(source_type,source_id,message_type) DO UPDATE SET recipient_email=EXCLUDED.recipient_email,
    payload=EXCLUDED.payload,encrypted_secret=EXCLUDED.encrypted_secret,status='queued',attempts=0,
    next_attempt_at=v_now,last_error_code=NULL,lease_until=NULL,lease_token=NULL,provider_message_id=NULL,sent_at=NULL;
  RETURN v_generation;
END $$;
REVOKE ALL ON FUNCTION public.rg_prepare_gift_claim_email(uuid,text,timestamptz,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_prepare_gift_claim_email(uuid,text,timestamptz,text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_create_gift_claim_context(p_token_hash text)
RETURNS TABLE(context_id uuid,expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  DECLARE v_gift_id uuid; v_context uuid; v_expiry timestamptz:=now()+interval '72 hours';
BEGIN
  SELECT g.id INTO v_gift_id FROM public.gift_claim_tokens t JOIN public.beat_gifts g ON g.id=t.gift_id
  JOIN public.orders o ON o.id=g.order_id
  WHERE t.token_hash=p_token_hash AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now()
    AND g.status='ready_to_claim' AND g.payment_status='paid' AND o.status='completed' AND o.payment_status='paid';
  IF v_gift_id IS NULL THEN RAISE EXCEPTION 'gift_context_unavailable' USING ERRCODE='42501'; END IF;
  INSERT INTO public.gift_claim_contexts(gift_id,claim_token_hash,expires_at)
    VALUES(v_gift_id,p_token_hash,v_expiry) RETURNING id INTO v_context;
  RETURN QUERY SELECT v_context,v_expiry;
END $$;
REVOKE ALL ON FUNCTION public.rg_create_gift_claim_context(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_create_gift_claim_context(text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_resolve_gift_claim_context(p_context_id uuid)
RETURNS TABLE(claim_token_hash text,expires_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT c.claim_token_hash,c.expires_at FROM public.gift_claim_contexts c
  JOIN public.beat_gifts g ON g.id=c.gift_id JOIN public.orders o ON o.id=g.order_id
  JOIN public.gift_claim_tokens t ON t.gift_id=g.id AND t.token_hash=c.claim_token_hash
  WHERE c.id=p_context_id AND c.consumed_at IS NULL AND c.expires_at>now()
    AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now()
    AND g.status='ready_to_claim' AND g.payment_status='paid' AND o.status='completed' AND o.payment_status='paid'
$$;
REVOKE ALL ON FUNCTION public.rg_resolve_gift_claim_context(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_resolve_gift_claim_context(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_get_gift_claim_preview(p_token_hash text)
RETURNS TABLE(beat_title text,cover_path text,license_tier text,license_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT b.title,b.cover_path,lower(lt.slug),lt.name FROM public.gift_claim_tokens t
  JOIN public.beat_gifts g ON g.id=t.gift_id JOIN public.orders o ON o.id=g.order_id
  JOIN public.order_items oi ON oi.id=g.order_item_id JOIN public.beats b ON b.id=oi.beat_id
  JOIN public.license_types lt ON lt.id=oi.license_type_id
  WHERE t.token_hash=p_token_hash AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now()
    AND g.status='ready_to_claim' AND g.payment_status='paid' AND o.status='completed' AND o.payment_status='paid'
$$;
REVOKE ALL ON FUNCTION public.rg_get_gift_claim_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rg_get_gift_claim_preview(text) TO anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.rg_get_buyer_gifts(p_user_id uuid)
RETURNS TABLE(gift_id uuid,beat_title text,license_name text,status text,delivery_status text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT g.id,b.title,lt.name,g.status,
    CASE WHEN g.status='claimed' THEN 'gift_sent'
      WHEN g.status='refunded' THEN 'refunded'
      WHEN g.status='revoked' THEN 'revoked'
      WHEN j.status IN ('failed','cancelled') THEN 'delivery_issue'
      WHEN j.status='sent' THEN 'gift_sent' ELSE 'waiting_to_be_claimed' END,g.created_at
  FROM public.beat_gifts g JOIN public.orders o ON o.id=g.order_id
  JOIN public.customers c ON c.id=o.customer_id JOIN public.order_items oi ON oi.id=g.order_item_id
  JOIN public.beats b ON b.id=oi.beat_id JOIN public.license_types lt ON lt.id=oi.license_type_id
  LEFT JOIN public.transactional_email_jobs j ON j.source_type='beat_gift' AND j.source_id=g.id AND j.message_type='gift_claim'
  WHERE c.auth_user_id=p_user_id ORDER BY g.created_at DESC
$$;
REVOKE ALL ON FUNCTION public.rg_get_buyer_gifts(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_get_buyer_gifts(uuid) TO service_role;

-- Keep disputed orders explicitly unavailable to all entitlement checks.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check
  CHECK (payment_status IN ('unpaid','paid','failed','refunded','disputed'));

CREATE OR REPLACE FUNCTION public.rg_revoke_commerce_order(p_order_id uuid,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_order public.orders%ROWTYPE;
  v_customer_id uuid; v_base timestamptz; v_max_grant timestamptz; v_external_delta interval; v_days integer; v_until timestamptz;
BEGIN
  IF p_reason NOT IN ('refund','dispute') THEN RAISE EXCEPTION 'invalid_commerce_revocation_reason'; END IF;
  SELECT * INTO v_order FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'commerce_order_not_found'; END IF;
  UPDATE public.purchases SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'revoked' END WHERE order_id=p_order_id;
  UPDATE public.beat_gifts SET status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'revoked' END,
      payment_status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END,
      revoked_at=coalesce(revoked_at,now()),revoked_reason=p_reason WHERE order_id=p_order_id;
  UPDATE public.commerce_studio_access_grants g SET revoked_at=coalesce(g.revoked_at,now())
    WHERE g.revoked_at IS NULL AND ((g.source_type='order' AND g.source_id=p_order_id)
      OR (g.source_type='gift' AND g.source_id IN (SELECT intent_id FROM public.beat_gifts WHERE order_id=p_order_id)));
  FOR v_customer_id IN SELECT DISTINCT g.customer_id FROM public.commerce_studio_access_grants g
    WHERE (g.source_type='order' AND g.source_id=p_order_id)
      OR (g.source_type='gift' AND g.source_id IN (SELECT intent_id FROM public.beat_gifts WHERE order_id=p_order_id))
  LOOP
    SELECT min(g.prior_until),max(g.granted_until),coalesce(sum(g.grant_days) FILTER (WHERE g.revoked_at IS NULL),0)::integer
      INTO v_base,v_max_grant,v_days FROM public.commerce_studio_access_grants g WHERE g.customer_id=v_customer_id;
    SELECT greatest(coalesce(c.studio_access_until,now())-coalesce(v_max_grant,now()),interval '0')
      INTO v_external_delta FROM public.customers c WHERE c.id=v_customer_id FOR UPDATE;
    v_until:=coalesce(v_base,now())+make_interval(days=>v_days)+coalesce(v_external_delta,interval '0');
    UPDATE public.customers SET studio_access_until=v_until,updated_at=now() WHERE id=v_customer_id;
  END LOOP;
  UPDATE public.gift_claim_tokens SET revoked_at=coalesce(revoked_at,now())
    WHERE gift_id IN (SELECT id FROM public.beat_gifts WHERE order_id=p_order_id);
  UPDATE public.gift_claim_contexts SET consumed_at=coalesce(consumed_at,now())
    WHERE gift_id IN (SELECT id FROM public.beat_gifts WHERE order_id=p_order_id);
  UPDATE public.transactional_email_jobs SET status='cancelled',lease_until=NULL,lease_token=NULL
    WHERE source_type='beat_gift' AND source_id IN (SELECT id FROM public.beat_gifts WHERE order_id=p_order_id)
      AND status IN ('queued','retry','sending');
  UPDATE public.commerce_checkout_intents SET state=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END
    WHERE stripe_checkout_session_id=v_order.stripe_checkout_session_id;
  UPDATE public.orders SET payment_status=CASE WHEN p_reason='refund' THEN 'refunded' ELSE 'disputed' END WHERE id=p_order_id;
  -- Exclusive inventory stays reversed and unavailable after refunds/disputes until manual review approves resale.
  UPDATE public.beat_exclusive_inventory SET state='reversed'
    WHERE order_id=p_order_id AND state='held';
END $$;
REVOKE ALL ON FUNCTION public.rg_revoke_commerce_order(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_revoke_commerce_order(uuid,text) TO service_role;

-- Include the message kind in the lease result so one worker can render claim,
-- artist notification, and buyer receipt messages without storing private data in payloads.
DROP FUNCTION IF EXISTS public.rg_claim_transactional_email_job();
CREATE FUNCTION public.rg_claim_transactional_email_job()
RETURNS TABLE(job_id uuid,recipient_email text,payload jsonb,encrypted_secret text,lease_token uuid,attempt integer,message_type text,source_type text)
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
    WHERE j.id=v_id RETURNING j.id,j.recipient_email,j.payload,j.encrypted_secret,j.lease_token,j.attempts,j.message_type,j.source_type;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_transactional_email_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_transactional_email_job() TO service_role;

CREATE OR REPLACE FUNCTION public.rg_claim_beat_gift(
  p_token_hash text,p_user_id uuid,p_customer_id uuid,p_license_id text,p_contract_text text
) RETURNS TABLE(gift_id uuid,purchase_id uuid,beat_id uuid,license_tier text,studio_access_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_gift public.beat_gifts%ROWTYPE; v_token public.gift_claim_tokens%ROWTYPE;
  v_order_id uuid; v_order public.orders%ROWTYPE; v_item public.order_items%ROWTYPE;
  v_tier text; v_email text; v_purchase_id uuid; v_studio_until timestamptz;
BEGIN
  IF p_token_hash !~ '^[0-9a-f]{64}$' OR p_license_id !~ '^RG-(MP3|WAV|UNL|EXC|STE)-[0-9]{4}-[A-Z0-9]{6,}$'
     OR p_contract_text IS NULL OR length(p_contract_text)>100000 THEN
    RAISE EXCEPTION 'invalid_gift_claim_request' USING ERRCODE='22023';
  END IF;
  SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
    WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL;
  IF v_email IS NULL THEN RAISE EXCEPTION 'verified_recipient_account_required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.customers c WHERE c.id=p_customer_id AND c.auth_user_id=p_user_id
    AND lower(btrim(c.email))=v_email;
  IF NOT FOUND THEN RAISE EXCEPTION 'recipient_customer_identity_mismatch' USING ERRCODE='42501'; END IF;
  SELECT t.* INTO v_token FROM public.gift_claim_tokens t WHERE t.token_hash=p_token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_token_invalid_expired_or_used' USING ERRCODE='42501'; END IF;
  SELECT g.order_id INTO v_order_id FROM public.beat_gifts g WHERE g.id=v_token.gift_id;
  IF v_order_id IS NULL THEN RAISE EXCEPTION 'gift_not_found'; END IF;
  PERFORM 1 FROM public.orders WHERE id=v_order_id FOR UPDATE;
  SELECT g.* INTO v_gift FROM public.beat_gifts g WHERE g.id=v_token.gift_id FOR UPDATE;
  SELECT t.* INTO v_token FROM public.gift_claim_tokens t WHERE t.id=v_token.id AND t.token_hash=p_token_hash
    AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_token_invalid_expired_or_used' USING ERRCODE='42501'; END IF;
  IF v_gift.id IS NULL OR v_gift.status<>'ready_to_claim' OR v_gift.payment_status<>'paid'
      OR lower(btrim(v_gift.recipient_email))<>v_email OR v_gift.purchase_id IS NOT NULL THEN
    RAISE EXCEPTION 'gift_not_claimable_for_account' USING ERRCODE='42501';
  END IF;
  IF v_gift.recipient_kind='artist' AND NOT EXISTS (
      SELECT 1 FROM public.rg_artists a WHERE a.id=v_gift.recipient_artist_id AND a.user_id=p_user_id AND a.status='active') THEN
    RAISE EXCEPTION 'artist_recipient_identity_mismatch' USING ERRCODE='42501';
  END IF;
  IF v_gift.recipient_kind='email' AND v_gift.recipient_user_id IS NOT NULL AND v_gift.recipient_user_id<>p_user_id THEN
    RAISE EXCEPTION 'gift_not_claimable_for_account' USING ERRCODE='42501';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id=v_gift.order_id
    AND o.status='completed' AND o.payment_status='paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_payment_not_verified_or_reversed' USING ERRCODE='42501'; END IF;
  SELECT oi.* INTO v_item FROM public.order_items oi WHERE oi.id=v_gift.order_item_id AND oi.order_id=v_gift.order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'gift_order_item_unavailable'; END IF;
  SELECT lower(lt.slug) INTO v_tier FROM public.license_types lt WHERE lt.id=v_item.license_type_id;
  IF v_tier IS NULL THEN RAISE EXCEPTION 'gift_license_unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM public.purchases p WHERE p.order_item_id=v_item.id) THEN
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
  UPDATE public.gift_claim_contexts gc SET consumed_at=now() WHERE gc.gift_id=v_gift.id AND gc.consumed_at IS NULL;
  IF v_tier='exclusive' THEN
    UPDATE public.beat_exclusive_inventory bei SET purchase_id=v_purchase_id
      WHERE bei.beat_id=v_item.beat_id AND bei.order_item_id=v_item.id AND bei.state='held';
    IF NOT FOUND THEN RAISE EXCEPTION 'exclusive_inventory_reservation_missing'; END IF;
  END IF;
  v_studio_until := public.rg_grant_commerce_studio_access('gift',v_gift.intent_id,p_customer_id,30);
  RETURN QUERY SELECT v_gift.id,v_purchase_id,v_item.beat_id,v_tier,v_studio_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) TO service_role;

DO $rls$
BEGIN
  ALTER TABLE public.gift_claim_contexts ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.gift_claim_contexts FROM PUBLIC,anon,authenticated;
  GRANT ALL ON public.gift_claim_contexts TO service_role;
END $rls$;

COMMIT;
