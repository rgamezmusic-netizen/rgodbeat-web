-- Email gifts are owned by the verified recipient email. An Auth user ID can
-- be null or stale after an account is recreated, so it must not override the
-- verified email identity. Keep this compatible with both the legacy Gift V1
-- entry point and the later Market wrapper/helper split.
DO $migration$
DECLARE
  target_function text;
BEGIN
  IF to_regprocedure('public.rg_claim_beat_gift_license_v1(text,uuid,uuid,text,text)') IS NOT NULL THEN
    target_function := 'rg_claim_beat_gift_license_v1';
  ELSIF to_regprocedure('public.rg_claim_beat_gift(text,uuid,uuid,text,text)') IS NOT NULL THEN
    target_function := 'rg_claim_beat_gift';
  ELSE
    RAISE EXCEPTION 'Gift V1 claim function is missing';
  END IF;

  EXECUTE format($definition$
    CREATE OR REPLACE FUNCTION public.%I(
      p_token_hash text,p_user_id uuid,p_customer_id uuid,p_license_id text,p_contract_text text
    ) RETURNS TABLE(gift_id uuid,purchase_id uuid,beat_id uuid,license_tier text,studio_access_until timestamptz)
    LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $function$
    DECLARE
      v_gift public.beat_gifts%%ROWTYPE;
      v_token public.gift_claim_tokens%%ROWTYPE;
      v_order_id uuid;
      v_order public.orders%%ROWTYPE;
      v_item public.order_items%%ROWTYPE;
      v_tier text;
      v_email text;
      v_purchase_id uuid;
      v_studio_until timestamptz;
    BEGIN
      IF p_token_hash !~ '^[0-9a-f]{64}$'
         OR p_license_id !~ '^RG-(MP3|WAV|UNL|EXC|STE)-[0-9]{4}-[A-Z0-9]{6,}$'
         OR p_contract_text IS NULL OR length(p_contract_text)>100000 THEN
        RAISE EXCEPTION 'invalid_gift_claim_request' USING ERRCODE='22023';
      END IF;

      SELECT lower(btrim(u.email)) INTO v_email FROM auth.users u
        WHERE u.id=p_user_id AND u.email_confirmed_at IS NOT NULL;
      IF v_email IS NULL THEN
        RAISE EXCEPTION 'verified_recipient_account_required' USING ERRCODE='42501';
      END IF;
      PERFORM 1 FROM public.customers c WHERE c.id=p_customer_id AND c.auth_user_id=p_user_id
        AND lower(btrim(c.email))=v_email;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'recipient_customer_identity_mismatch' USING ERRCODE='42501';
      END IF;

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
         OR v_gift.recipient_kind NOT IN ('email','artist')
         OR (v_gift.recipient_kind='email' AND coalesce(lower(btrim(v_gift.recipient_email)),'')<>v_email)
         OR v_gift.purchase_id IS NOT NULL THEN
        RAISE EXCEPTION 'gift_not_claimable_for_account' USING ERRCODE='42501';
      END IF;
      IF v_gift.recipient_kind='artist' AND NOT EXISTS (
          SELECT 1 FROM public.rg_artists a WHERE a.id=v_gift.recipient_artist_id
            AND a.user_id=p_user_id AND a.status='active') THEN
        RAISE EXCEPTION 'artist_recipient_identity_mismatch' USING ERRCODE='42501';
      END IF;

      SELECT o.* INTO v_order FROM public.orders o WHERE o.id=v_gift.order_id
        AND o.status='completed' AND o.payment_status='paid' FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'gift_payment_not_verified_or_reversed' USING ERRCODE='42501'; END IF;
      SELECT oi.* INTO v_item FROM public.order_items oi
        WHERE oi.id=v_gift.order_item_id AND oi.order_id=v_gift.order_id;
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
      UPDATE public.gift_claim_contexts gc SET consumed_at=now()
        WHERE gc.gift_id=v_gift.id AND gc.consumed_at IS NULL;

      IF v_tier='exclusive' THEN
        UPDATE public.beat_exclusive_inventory SET purchase_id=v_purchase_id
          WHERE beat_id=v_item.beat_id AND order_item_id=v_item.id AND state='held';
        IF NOT FOUND THEN RAISE EXCEPTION 'exclusive_inventory_reservation_missing'; END IF;
      END IF;
      v_studio_until := public.rg_grant_commerce_studio_access('gift',v_gift.intent_id,p_customer_id,30);
      RETURN QUERY SELECT v_gift.id,v_purchase_id,v_item.beat_id,v_tier,v_studio_until;
    END $function$
  $definition$, target_function);

  IF target_function='rg_claim_beat_gift_license_v1' THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rg_claim_beat_gift_license_v1(text,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role';
  END IF;
END
$migration$;
