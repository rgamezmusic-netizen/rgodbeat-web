-- Transactional gift claim/reversal assertions for the isolated PostgreSQL 16 database.
-- Run with psql -v ON_ERROR_STOP=1 ... -f tests/commerce-gift-postgres.sql.
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'rgodbeat_validation' THEN
    RAISE EXCEPTION 'refusing gift fixture tests outside rgodbeat_validation';
  END IF;
END $$;

INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('10000000-0000-4000-8000-000000000001','gift-recipient@rgodbeat.test',now(),'{}'),
 ('10000000-0000-4000-8000-000000000002','wrong-recipient@rgodbeat.test',now(),'{}'),
 ('10000000-0000-4000-8000-000000000003','gift-artist@rgodbeat.test',now(),'{}'),
 ('10000000-0000-4000-8000-000000000004','ambiguous-artist@rgodbeat.test',now(),'{}'),
 ('10000000-0000-4000-8000-000000000005','unrelated-account@rgodbeat.test',now(),'{}');
INSERT INTO public.customers(id,email,name,auth_user_id,studio_access_until) VALUES
 ('20000000-0000-4000-8000-000000000001','gift-recipient@rgodbeat.test','Gift Recipient','10000000-0000-4000-8000-000000000001',now()+interval '7 days'),
 ('20000000-0000-4000-8000-000000000002','wrong-recipient@rgodbeat.test','Wrong Recipient','10000000-0000-4000-8000-000000000002',NULL),
 ('20000000-0000-4000-8000-000000000003','gift-artist@rgodbeat.test','Gift Artist','10000000-0000-4000-8000-000000000003',NULL),
 ('20000000-0000-4000-8000-000000000004','Ambiguous-Artist@rgodbeat.test','Legacy Link',NULL,NULL),
 ('20000000-0000-4000-8000-000000000005','ambiguous-artist@rgodbeat.test','Conflicting Link','10000000-0000-4000-8000-000000000005',NULL);
INSERT INTO public.rg_artists(id,user_id,stage_name,slug,bio,status) VALUES
 ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','Gift Artist','test-gift-artist','Public artist bio','active'),
 ('80000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','Ambiguous Artist','ambiguous-gift-artist','Should not appear','active');

INSERT INTO public.commerce_checkout_intents(id,buyer_email,recipient_mode,recipient_kind,recipient_email,snapshot,state)
VALUES('30000000-0000-4000-8000-000000000001','buyer@rgodbeat.test','gift','email','gift-recipient@rgodbeat.test',
  '{"items":[{"beatId":"83c4054a-67d1-4347-8a6e-8c727a31cde3","licenseTier":"wav"}],"totalAmountCents":4900,"currency":"usd"}', 'fulfilled');
INSERT INTO public.orders(id,customer_id,stripe_checkout_session_id,stripe_payment_intent_id,status,payment_status,currency,subtotal_amount,total_amount)
VALUES('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','cs_gift_fixture','pi_gift_fixture','completed','paid','usd',49,49);
UPDATE public.commerce_checkout_intents SET stripe_checkout_session_id='cs_gift_fixture',stripe_payment_intent_id='pi_gift_fixture' WHERE id='30000000-0000-4000-8000-000000000001';
INSERT INTO public.order_items(id,order_id,beat_id,license_type_id,unit_price,currency)
VALUES('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 'e945fabb-86f7-45fd-b879-734ea211b500','2b72a216-58c3-44e1-8b83-99fb1649447f',499,'usd');
INSERT INTO public.beat_exclusive_inventory(beat_id,order_item_id,order_id,state,source)
VALUES('e945fabb-86f7-45fd-b879-734ea211b500','50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','held','verified_payment');
INSERT INTO public.beat_gifts(id,intent_id,order_id,order_item_id,recipient_kind,recipient_email,status,payment_status)
VALUES('60000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000001','email','gift-recipient@rgodbeat.test','ready_to_claim','paid');
INSERT INTO public.gift_claim_tokens(id,gift_id,token_hash,generation,expires_at)
VALUES('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',repeat('a',64),1,now()+interval '1 hour');
UPDATE public.beat_gifts SET claim_token_generation=1 WHERE id='60000000-0000-4000-8000-000000000001';

INSERT INTO public.commerce_checkout_intents(id,buyer_email,recipient_mode,recipient_kind,recipient_email,snapshot,state)
VALUES('30000000-0000-4000-8000-000000000002','buyer@rgodbeat.test','gift','email','gift-recipient@rgodbeat.test',
  '{"items":[{"beatId":"2af14652-2e53-4bc8-8095-dd28c1d0284f","licenseTier":"mp3"}],"totalAmountCents":2900,"currency":"usd"}', 'fulfilled');
UPDATE public.commerce_checkout_intents SET stripe_checkout_session_id='cs_gift_fixture_2',stripe_payment_intent_id='pi_gift_fixture_2' WHERE id='30000000-0000-4000-8000-000000000002';
INSERT INTO public.order_items(id,order_id,beat_id,license_type_id,unit_price,currency)
VALUES('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
 '2af14652-2e53-4bc8-8095-dd28c1d0284f','d14a9b12-b753-4fce-92dc-3ec0d98772a5',29,'usd');
INSERT INTO public.beat_gifts(id,intent_id,order_id,order_item_id,recipient_kind,recipient_email,status,payment_status)
VALUES('60000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
 '50000000-0000-4000-8000-000000000002','email','gift-recipient@rgodbeat.test','paid_pending_recipient','paid');
INSERT INTO public.gift_claim_tokens(gift_id,token_hash,generation,expires_at)
VALUES('60000000-0000-4000-8000-000000000002',repeat('b',64),1,now()-interval '1 minute');
UPDATE public.beat_gifts SET claim_token_generation=1 WHERE id='60000000-0000-4000-8000-000000000002';

INSERT INTO public.commerce_checkout_intents(id,buyer_email,recipient_mode,recipient_kind,recipient_email,snapshot,state)
VALUES('30000000-0000-4000-8000-000000000003','buyer@rgodbeat.test','gift','email','gift-recipient@rgodbeat.test',
  '{"items":[{"beatId":"a8206dea-899c-4f17-8744-d23787650ddf","licenseTier":"wav"}],"totalAmountCents":4900,"currency":"usd"}', 'fulfilled');
INSERT INTO public.orders(id,customer_id,stripe_checkout_session_id,stripe_payment_intent_id,status,payment_status,currency,subtotal_amount,total_amount)
VALUES('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','cs_gift_fixture_3','pi_gift_fixture_3','completed','paid','usd',49,49);
UPDATE public.commerce_checkout_intents SET stripe_checkout_session_id='cs_gift_fixture_3',stripe_payment_intent_id='pi_gift_fixture_3' WHERE id='30000000-0000-4000-8000-000000000003';
INSERT INTO public.order_items(id,order_id,beat_id,license_type_id,unit_price,currency)
VALUES('50000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002',
 'a8206dea-899c-4f17-8744-d23787650ddf','31c1a718-6c04-4c80-bc36-b9f3b801d849',49,'usd');
INSERT INTO public.beat_gifts(id,intent_id,order_id,order_item_id,recipient_kind,recipient_email,status,payment_status)
VALUES('60000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000002',
 '50000000-0000-4000-8000-000000000003','email','gift-recipient@rgodbeat.test','ready_to_claim','paid');
INSERT INTO public.gift_claim_tokens(gift_id,token_hash,generation,expires_at)
VALUES('60000000-0000-4000-8000-000000000003',repeat('e',64),1,now()+interval '1 hour');
UPDATE public.beat_gifts SET claim_token_generation=1 WHERE id='60000000-0000-4000-8000-000000000003';

DO $$
DECLARE v_license text; v_result record; v_before timestamptz; v_after timestamptz; v_payer_before timestamptz; v_artist record;
  v_email record; v_context record;
BEGIN
  SELECT * INTO v_artist FROM public.rg_search_gift_artists('gift artist') WHERE slug='test-gift-artist';
  IF v_artist.stage_name IS DISTINCT FROM 'Gift Artist' OR v_artist.bio IS DISTINCT FROM 'Public artist bio'
     OR v_artist.slug IS DISTINCT FROM 'test-gift-artist'
     OR EXISTS (SELECT 1 FROM public.rg_search_gift_artists('ambiguous artist')) THEN
    RAISE EXCEPTION 'public artist search exposed an ineligible or ambiguous account';
  END IF;
  IF pg_get_function_result('public.rg_search_gift_artists(text)'::regprocedure) NOT ILIKE '%stage_name text, slug text, bio text%' THEN
    RAISE EXCEPTION 'artist search result includes unexpected identity fields';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rg_resolve_gift_artist('test-gift-artist') WHERE customer_id='20000000-0000-4000-8000-000000000003') THEN
    RAISE EXCEPTION 'verified artist customer did not resolve safely';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('a',64))) THEN RAISE EXCEPTION 'paid gift preview missing'; END IF;
  IF EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('b',64))) THEN RAISE EXCEPTION 'unknown token preview leaked'; END IF;

  BEGIN
    PERFORM public.rg_claim_beat_gift(repeat('a',64),'10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','RG-WAV-2026-099901','wrong account');
    RAISE EXCEPTION 'wrong account claimed gift';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- A dead claim token leaves the paid gift intact. Resend rotates the token hash and
  -- reuses the single durable job; GET context is read-only and rate limits resend.
  IF EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('b',64))) THEN RAISE EXCEPTION 'expired token was previewable'; END IF;
  PERFORM public.rg_prepare_gift_claim_email('60000000-0000-4000-8000-000000000002',repeat('c',64),now()+interval '72 hours','sealed-secret',
    '{"beatTitle":"Aura Latina","licenseName":"Standard MP3"}'::jsonb);
  IF EXISTS (SELECT 1 FROM public.gift_claim_tokens WHERE gift_id='60000000-0000-4000-8000-000000000002' AND token_hash=repeat('b',64) AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'resend did not invalidate old token';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('c',64))) THEN RAISE EXCEPTION 'replacement token unavailable'; END IF;
  BEGIN
    PERFORM public.rg_prepare_gift_claim_email('60000000-0000-4000-8000-000000000002',repeat('d',64),now()+interval '72 hours','sealed-secret','{}'::jsonb);
    RAISE EXCEPTION 'immediate resend bypassed rate limit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  SELECT * INTO v_context FROM public.rg_create_gift_claim_context(repeat('c',64));
  IF v_context.expires_at<now()+interval '71 hours' THEN RAISE EXCEPTION 'signup context expires before claim token'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.rg_resolve_gift_claim_context(v_context.context_id)) THEN RAISE EXCEPTION 'GET context did not remain usable'; END IF;
  UPDATE public.beat_gifts SET claim_email_last_sent_at=now()-interval '61 seconds' WHERE id='60000000-0000-4000-8000-000000000002';
  PERFORM public.rg_prepare_gift_claim_email('60000000-0000-4000-8000-000000000002',repeat('d',64),now()+interval '72 hours','replacement-secret','{"beatTitle":"Aura Latina"}'::jsonb);
  IF EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('c',64)))
     OR EXISTS (SELECT 1 FROM public.rg_resolve_gift_claim_context(v_context.context_id))
     OR NOT EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('d',64))) THEN
    RAISE EXCEPTION 'resend left prior token or auth return context active';
  END IF;
  SELECT * INTO v_email FROM public.rg_claim_transactional_email_job();
  IF v_email.job_id IS NULL OR v_email.message_type<>'gift_claim' OR v_email.attempt<>1 THEN RAISE EXCEPTION 'email job was not leased'; END IF;
  PERFORM public.rg_finish_transactional_email_job(v_email.job_id,v_email.lease_token,'retry',NULL,'temporary',now());
  SELECT * INTO v_email FROM public.rg_claim_transactional_email_job();
  IF v_email.job_id IS NULL OR v_email.attempt<>2 THEN RAISE EXCEPTION 'retryable email job was not re-leased'; END IF;
  PERFORM public.rg_finish_transactional_email_job(v_email.job_id,v_email.lease_token,'sent','mock-delivery',NULL,NULL);
  IF (SELECT status FROM public.transactional_email_jobs WHERE source_id='60000000-0000-4000-8000-000000000002')<>'sent' THEN
    RAISE EXCEPTION 'email job did not reach delivered state';
  END IF;

  SELECT studio_access_until INTO v_before FROM public.customers WHERE id='20000000-0000-4000-8000-000000000001';
  SELECT studio_access_until INTO v_payer_before FROM public.customers WHERE id='00000000-0000-4000-8000-000000000001';
  IF NOT EXISTS (SELECT 1 FROM public.beat_exclusive_inventory WHERE beat_id='e945fabb-86f7-45fd-b879-734ea211b500'
      AND order_item_id='50000000-0000-4000-8000-000000000001' AND state='held') THEN
    RAISE EXCEPTION 'exclusive gift did not reserve inventory before claim';
  END IF;
  v_license:=public.rg_allocate_commerce_license_id('exclusive');
  SELECT * INTO v_result FROM public.rg_claim_beat_gift(repeat('a',64),'10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',v_license,'PURCHASER (PAYER): Buyer\nLICENSEE: Gift Recipient');
  IF v_result.gift_id<>'60000000-0000-4000-8000-000000000001' THEN RAISE EXCEPTION 'wrong gift claimed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.purchases WHERE id=v_result.purchase_id AND customer_id='20000000-0000-4000-8000-000000000001'
      AND customer_id<>'00000000-0000-4000-8000-000000000001' AND contract_text LIKE '%LICENSEE: Gift Recipient%') THEN
    RAISE EXCEPTION 'license assigned to payer or contract missing recipient';
  END IF;
  SELECT studio_access_until INTO v_after FROM public.customers WHERE id='20000000-0000-4000-8000-000000000001';
  IF v_after<v_before+interval '30 days' THEN RAISE EXCEPTION 'gift Studio did not extend existing access'; END IF;
  IF (SELECT studio_access_until FROM public.customers WHERE id='00000000-0000-4000-8000-000000000001') IS DISTINCT FROM v_payer_before THEN
    RAISE EXCEPTION 'purchaser Studio was changed by gift';
  END IF;
  IF (SELECT count(*) FROM public.commerce_studio_access_grants WHERE source_type='gift' AND source_id='30000000-0000-4000-8000-000000000001')<>1 THEN
    RAISE EXCEPTION 'gift Studio grant is not idempotently unique';
  END IF;
  BEGIN
    PERFORM public.rg_claim_beat_gift(repeat('a',64),'10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','RG-WAV-2026-099902','duplicate');
    RAISE EXCEPTION 'gift was claimed twice';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM public.rg_revoke_commerce_order('40000000-0000-4000-8000-000000000001','refund');
  IF (SELECT status FROM public.purchases WHERE id=v_result.purchase_id)<>'refunded'
     OR (SELECT payment_status FROM public.orders WHERE id='40000000-0000-4000-8000-000000000001')<>'refunded'
     OR (SELECT revoked_at IS NULL FROM public.gift_claim_tokens WHERE id='70000000-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'refund did not revoke purchase/order/token';
  END IF;
  IF (SELECT studio_access_until FROM public.customers WHERE id='20000000-0000-4000-8000-000000000001') IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'refund did not remove only this gift Studio grant';
  END IF;
  IF (SELECT state FROM public.beat_exclusive_inventory WHERE beat_id='e945fabb-86f7-45fd-b879-734ea211b500')<>'reversed' THEN
    RAISE EXCEPTION 'refund silently returned exclusive inventory to sale';
  END IF;
  IF EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('a',64))) THEN RAISE EXCEPTION 'refunded gift remains previewable'; END IF;

  PERFORM public.rg_revoke_commerce_order('40000000-0000-4000-8000-000000000002','dispute');
  IF (SELECT payment_status FROM public.orders WHERE id='40000000-0000-4000-8000-000000000002')<>'disputed'
     OR (SELECT status FROM public.beat_gifts WHERE id='60000000-0000-4000-8000-000000000003')<>'revoked'
     OR (SELECT revoked_at IS NULL FROM public.gift_claim_tokens WHERE gift_id='60000000-0000-4000-8000-000000000003')
     OR EXISTS (SELECT 1 FROM public.rg_get_gift_claim_preview(repeat('e',64))) THEN
    RAISE EXCEPTION 'dispute left a gift claim active';
  END IF;
END $$;

-- The stored token is a hash only; anon/authenticated cannot read or mutate private gift tables.
DO $$ BEGIN
  IF has_table_privilege('anon','public.gift_claim_tokens','SELECT') OR has_table_privilege('authenticated','public.beat_gifts','INSERT') THEN
    RAISE EXCEPTION 'privileged gift rows are directly accessible';
  END IF;
END $$;
ROLLBACK;
