-- Extend the existing Gift V1 records and claims, rather than introduce another gift engine.
BEGIN;
ALTER TABLE public.order_items ALTER COLUMN beat_id DROP NOT NULL, ALTER COLUMN license_type_id DROP NOT NULL;
ALTER TABLE public.order_items ADD COLUMN market_pass_id uuid REFERENCES public.rg_beat_passes(id) ON DELETE RESTRICT,
 ADD CONSTRAINT order_item_market_pass_unique UNIQUE(order_id,market_pass_id);
ALTER TABLE public.order_items ADD CONSTRAINT commerce_order_item_benefit CHECK (
 (beat_id IS NOT NULL AND license_type_id IS NOT NULL AND market_pass_id IS NULL) OR
 (beat_id IS NULL AND license_type_id IS NULL AND market_pass_id IS NOT NULL));
ALTER TABLE public.beat_gifts ADD COLUMN market_pass_id uuid REFERENCES public.rg_beat_passes(id) ON DELETE RESTRICT,
 ADD COLUMN entitlement_granted_at timestamptz;
DO $$ DECLARE c record; BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='public.beat_gifts'::regclass AND contype='c'
   AND pg_get_constraintdef(oid) LIKE '%purchase_id IS NOT NULL%' LOOP
   EXECUTE format('ALTER TABLE public.beat_gifts DROP CONSTRAINT %I',c.conname);
 END LOOP;
END $$;
ALTER TABLE public.beat_gifts ADD CONSTRAINT beat_gifts_claimed_entitlement CHECK (
 status<>'claimed' OR (claimed_at IS NOT NULL AND
   ((market_pass_id IS NULL AND purchase_id IS NOT NULL) OR
    (market_pass_id IS NOT NULL AND purchase_id IS NULL AND entitlement_granted_at IS NOT NULL))));
CREATE UNIQUE INDEX rg_pass_original_purchase_key ON public.rg_beat_passes(purchaser_user_id,purchase_request_key);

-- Assign only to the verified Gift V1 recipient after canonical order completion.
CREATE FUNCTION public.rg_assign_market_gift(p_gift_id uuid,p_user_id uuid,p_customer_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE gift public.beat_gifts%ROWTYPE; pass public.rg_beat_passes%ROWTYPE; product public.rg_market_products%ROWTYPE;
 recipient_mail text; access_until timestamptz; intent public.commerce_checkout_intents%ROWTYPE;
BEGIN
 SELECT lower(btrim(email)) INTO recipient_mail FROM auth.users WHERE id=p_user_id AND email_confirmed_at IS NOT NULL;
 IF recipient_mail IS NULL THEN RAISE EXCEPTION 'verified_recipient_account_required'; END IF;
 PERFORM 1 FROM public.customers WHERE id=p_customer_id AND auth_user_id=p_user_id AND lower(btrim(customers.email))=recipient_mail;
 IF NOT FOUND THEN RAISE EXCEPTION 'recipient_customer_identity_mismatch'; END IF;
 SELECT g.* INTO gift FROM public.beat_gifts g WHERE g.id=p_gift_id FOR UPDATE;
 IF NOT FOUND OR gift.market_pass_id IS NULL OR gift.payment_status<>'paid'
   OR lower(btrim(gift.recipient_email))<>recipient_mail
   OR (gift.recipient_kind='artist' AND gift.recipient_user_id IS NOT NULL AND gift.recipient_user_id<>p_user_id)
   OR gift.status NOT IN ('paid_pending_recipient','ready_to_claim','claimed') THEN RAISE EXCEPTION 'market_gift_not_claimable'; END IF;
 IF gift.recipient_kind='artist' AND NOT EXISTS(SELECT 1 FROM public.rg_artists WHERE id=gift.recipient_artist_id AND user_id=p_user_id AND status='active') THEN RAISE EXCEPTION 'artist_recipient_identity_mismatch'; END IF;
 SELECT * INTO intent FROM public.commerce_checkout_intents WHERE id=gift.intent_id AND state='fulfilled' FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.orders WHERE id=gift.order_id AND status='completed' AND payment_status='paid') THEN RAISE EXCEPTION 'gift_payment_not_verified_or_reversed'; END IF;
 SELECT * INTO pass FROM public.rg_beat_passes WHERE id=gift.market_pass_id FOR UPDATE;
 SELECT * INTO product FROM public.rg_market_products WHERE product_key=pass.product_key AND version=pass.product_version;
 IF gift.status='claimed' AND gift.recipient_user_id=p_user_id THEN
   SELECT granted_until INTO access_until FROM public.commerce_studio_access_grants WHERE source_type='gift' AND source_id=gift.intent_id;
   RETURN access_until;
 END IF;
 IF pass.status<>'reserved' OR pass.reserved_intent_id<>gift.intent_id OR pass.user_id IS DISTINCT FROM intent.buyer_auth_user_id THEN RAISE EXCEPTION 'market_gift_reservation_missing'; END IF;
 IF product.benefit_kind='studio' THEN
   access_until:=public.rg_grant_commerce_studio_access('gift',gift.intent_id,p_customer_id,product.studio_days);
   PERFORM public.rg_consume_market_pass(gift.intent_id,gift.order_id);
 ELSE
   UPDATE public.rg_beat_passes SET user_id=p_user_id,status='available',reserved_intent_id=NULL WHERE id=pass.id;
 END IF;
 UPDATE public.beat_gifts SET status='claimed',recipient_user_id=p_user_id,claimed_at=now(),entitlement_granted_at=now() WHERE id=gift.id;
 RETURN access_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_assign_market_gift(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_assign_market_gift(uuid,uuid,uuid) TO service_role;

-- Preserve the exact legacy license claim implementation and dispatch utility claims
-- through the same token/context, verified email and order checks.
ALTER FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) RENAME TO rg_claim_beat_gift_license_v1;
REVOKE ALL ON FUNCTION public.rg_claim_beat_gift_license_v1(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.rg_claim_beat_gift(p_token_hash text,p_user_id uuid,p_customer_id uuid,p_license_id text,p_contract_text text)
RETURNS TABLE(gift_id uuid,purchase_id uuid,beat_id uuid,license_tier text,studio_access_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE token public.gift_claim_tokens%ROWTYPE; gift public.beat_gifts%ROWTYPE; product public.rg_market_products%ROWTYPE; access_until timestamptz;
BEGIN
 SELECT g.* INTO gift FROM public.beat_gifts g JOIN public.gift_claim_tokens t ON t.gift_id=g.id WHERE t.token_hash=p_token_hash;
 IF gift.market_pass_id IS NULL THEN
   RETURN QUERY SELECT * FROM public.rg_claim_beat_gift_license_v1(p_token_hash,p_user_id,p_customer_id,p_license_id,p_contract_text); RETURN;
 END IF;
 PERFORM 1 FROM public.orders WHERE id=gift.order_id FOR UPDATE;
 SELECT g.* INTO gift FROM public.beat_gifts g WHERE g.id=gift.id FOR UPDATE;
 SELECT * INTO token FROM public.gift_claim_tokens WHERE token_hash=p_token_hash AND used_at IS NULL AND revoked_at IS NULL AND expires_at>now() FOR UPDATE;
 IF NOT FOUND OR gift.status<>'ready_to_claim' THEN RAISE EXCEPTION 'gift_token_invalid_expired_or_used' USING ERRCODE='42501'; END IF;
 access_until:=public.rg_assign_market_gift(gift.id,p_user_id,p_customer_id);
 UPDATE public.gift_claim_tokens SET used_at=now() WHERE gift_claim_tokens.gift_id=gift.id AND used_at IS NULL;
 UPDATE public.gift_claim_contexts SET consumed_at=now() WHERE gift_claim_contexts.gift_id=gift.id AND consumed_at IS NULL;
 SELECT c.* INTO product FROM public.rg_market_products c JOIN public.rg_beat_passes p ON p.product_key=c.product_key AND p.product_version=c.version WHERE p.id=gift.market_pass_id;
 RETURN QUERY SELECT gift.id,NULL::uuid,NULL::uuid,CASE WHEN product.benefit_kind='studio' THEN 'studio' ELSE 'rg_pass' END,access_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.rg_claim_beat_gift(text,uuid,uuid,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_get_gift_claim_preview(p_token_hash text)
RETURNS TABLE(beat_title text,cover_path text,license_tier text,license_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(b.title,c.name),b.cover_path,coalesce(lower(lt.slug),CASE WHEN c.benefit_kind='studio' THEN 'studio' ELSE 'rg_pass' END),coalesce(lt.name,c.name)
 FROM public.gift_claim_tokens t JOIN public.beat_gifts g ON g.id=t.gift_id JOIN public.orders o ON o.id=g.order_id
 JOIN public.order_items oi ON oi.id=g.order_item_id LEFT JOIN public.beats b ON b.id=oi.beat_id LEFT JOIN public.license_types lt ON lt.id=oi.license_type_id
 LEFT JOIN public.rg_beat_passes p ON p.id=g.market_pass_id LEFT JOIN public.rg_market_products c ON c.product_key=p.product_key AND c.version=p.product_version
 WHERE t.token_hash=p_token_hash AND t.used_at IS NULL AND t.revoked_at IS NULL AND t.expires_at>now()
 AND g.status='ready_to_claim' AND g.payment_status='paid' AND o.status='completed' AND o.payment_status='paid'
$$;
CREATE OR REPLACE FUNCTION public.rg_get_buyer_gifts(p_user_id uuid)
RETURNS TABLE(gift_id uuid,beat_title text,license_name text,status text,delivery_status text,created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT g.id,coalesce(b.title,product.name),coalesce(lt.name,product.name),g.status,
 CASE WHEN g.status='claimed' THEN 'gift_sent' WHEN g.status='refunded' THEN 'refunded' WHEN g.status='revoked' THEN 'revoked'
 WHEN j.status IN ('failed','cancelled') THEN 'delivery_issue' WHEN j.status='sent' THEN 'gift_sent' ELSE 'waiting_to_be_claimed' END,g.created_at
 FROM public.beat_gifts g JOIN public.orders o ON o.id=g.order_id JOIN public.customers c ON c.id=o.customer_id JOIN public.order_items oi ON oi.id=g.order_item_id
 LEFT JOIN public.beats b ON b.id=oi.beat_id LEFT JOIN public.license_types lt ON lt.id=oi.license_type_id
 LEFT JOIN public.rg_beat_passes p ON p.id=g.market_pass_id LEFT JOIN public.rg_market_products product ON product.product_key=p.product_key AND product.version=p.product_version
 LEFT JOIN public.transactional_email_jobs j ON j.source_type='beat_gift' AND j.source_id=g.id AND j.message_type='gift_claim'
 WHERE c.auth_user_id=p_user_id ORDER BY g.created_at DESC
$$;

-- Private accounting only. Reserved gifts are counted through their source pass once.
-- The burn creates an entitlement obligation; it does not erase it.
CREATE VIEW public.rg_market_liabilities WITH (security_invoker=true) AS
 SELECT 'pass'::text AS obligation_kind,p.id AS obligation_id,p.status,
 c.product_key,c.version,c.maximum_benefit_cents::numeric AS maximum_benefit_cents,coalesce(c.studio_days,0)::numeric AS studio_days
 FROM public.rg_beat_passes p JOIN public.rg_market_products c ON c.product_key=p.product_key AND c.version=p.product_version
 WHERE p.status IN ('available','reserved')
 UNION ALL
 SELECT 'unclaimed_gift',g.id,g.status,'beat_gift',1,round(coalesce(lt.price,oi.unit_price)*100),30
 FROM public.beat_gifts g JOIN public.order_items oi ON oi.id=g.order_item_id LEFT JOIN public.license_types lt ON lt.id=oi.license_type_id
 WHERE g.market_pass_id IS NULL AND g.status IN ('paid_pending_recipient','ready_to_claim') AND g.payment_status='paid'
 UNION ALL
 SELECT 'studio_access',a.id,'active','studio_access',1,
 ceil(1000*least(a.grant_days,extract(epoch FROM(a.granted_until-now()))/86400)/30),
 least(a.grant_days,extract(epoch FROM(a.granted_until-now()))/86400)
 FROM public.commerce_studio_access_grants a WHERE a.revoked_at IS NULL AND a.granted_until>now();
REVOKE ALL ON public.rg_market_liabilities FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rg_market_liabilities TO service_role;
COMMIT;
