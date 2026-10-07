-- Run only after rg-economy-postgres-bootstrap.sql in an isolated database.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'rgodbeat_validation' THEN RAISE EXCEPTION 'wrong_test_database'; END IF; END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'economy-'||i||'@example.test',now() FROM generate_series(1,10) i;
INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key)
SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,CASE WHEN i=1 THEN 10000 WHEN i=8 THEN 5000 ELSE 100000 END,
 CASE i WHEN 1 THEN 'EARNED_RG' WHEN 2 THEN 'SEASON_REWARD' WHEN 3 THEN 'PURCHASED_RG' WHEN 4 THEN 'ADMIN_CORRECTION' WHEN 5 THEN 'SPONSOR_CONTRIBUTION' WHEN 6 THEN 'POOL_CONTRIBUTION' WHEN 8 THEN 'EARNED_RG' ELSE 'ADMIN_CORRECTION' END,
 'Historical fixture','fixture','credit:'||i,'credit:'||i FROM generate_series(1,10) i;
INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key) VALUES
 ('a0000000-0000-4000-8000-000000000008',10000,'PURCHASED_RG','Historical fixture','fixture','mixed-purchase','mixed-purchase'),
 ('a0000000-0000-4000-8000-000000000008',-3000,'POOL_CONTRIBUTION','Historical debit','fixture','mixed-debit','mixed-debit');
UPDATE public.rg_economy_config SET beat_pass_enabled=true;
-- A pass previously purchased from an admin balance must survive without making
-- the unused admin balance spendable.
SELECT public.rg_purchase_beat_pass('a0000000-0000-4000-8000-000000000010','legacy-admin-pass-000001');
\ir ../supabase/preflight/20261010000000_rg_market_v1.sql
\ir ../supabase/migrations/20261010000000_rg_market_v1.sql
\ir ../supabase/migrations/20261010000001_rg_market_gift_v1.sql
\ir ../supabase/migrations/20261010000002_rg_season_economy_v2.sql
\ir ../supabase/verify/20261010000000_rg_market_v1.sql
CREATE FUNCTION pg_temp.assert_error(statement text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN
  IF position(expected IN SQLERRM)>0 THEN RETURN; END IF; RAISE;
 END;
 RAISE EXCEPTION 'expected_error_not_raised:%',expected;
END $$;
DO $$ DECLARE i integer; p uuid; repeat uuid; balance bigint;
BEGIN
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000001')<>10000 THEN RAISE EXCEPTION 'earned_not_spendable'; END IF;
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000002')<>100000 THEN RAISE EXCEPTION 'season_not_spendable'; END IF;
 FOR i IN 3..6 LOOP
  IF coalesce((SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id=('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid),0)<>0 THEN RAISE EXCEPTION 'restricted_provenance_spendable:%',i; END IF;
  PERFORM pg_temp.assert_error(format('SELECT public.rg_purchase_beat_pass(%L,%L)',('a0000000-0000-4000-8000-'||lpad(i::text,12,'0')), 'restricted-purchase-'||i),'insufficient_rg_balance');
 END LOOP;
 IF (SELECT count(*) FROM public.rg_beat_passes WHERE user_id='a0000000-0000-4000-8000-000000000010' AND status='available')<>1 THEN RAISE EXCEPTION 'legacy_pass_lost'; END IF;
 IF coalesce((SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000010'),0)<>0 THEN RAISE EXCEPTION 'legacy_admin_reinterpreted'; END IF;
 p:=public.rg_purchase_beat_pass('a0000000-0000-4000-8000-000000000001','earned-pass-0000000001');
 repeat:=public.rg_purchase_beat_pass('a0000000-0000-4000-8000-000000000001','earned-pass-0000000001');
 IF p<>repeat OR (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000001')<>0 THEN RAISE EXCEPTION 'earned_purchase_or_idempotency_failed'; END IF;
 PERFORM pg_temp.assert_error('SELECT public.rg_purchase_beat_pass(''a0000000-0000-4000-8000-000000000001'',''insufficient-new-key-001'')','insufficient_rg_balance');
 PERFORM pg_temp.assert_error('SELECT public.rg_purchase_market_pass(''a0000000-0000-4000-8000-000000000002'',''mp3_25'',1,''disabled-product-key-001'')','market_product_disabled');
 PERFORM public.rg_credit_controlled_utility('a0000000-0000-4000-8000-000000000007',5000,'Authorized isolated test economy-v1','controlled-key-00000001');
 PERFORM public.rg_credit_controlled_utility('a0000000-0000-4000-8000-000000000007',5000,'Authorized isolated test economy-v1','controlled-key-00000001');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000007')<>5000 THEN RAISE EXCEPTION 'controlled_credit_not_idempotent'; END IF;
 PERFORM pg_temp.assert_error('SELECT public.rg_credit_controlled_utility(''a0000000-0000-4000-8000-000000000007'',5000,NULL,''controlled-key-null-01'')','invalid_controlled_utility_credit');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000008')<>5000 THEN RAISE EXCEPTION 'historical_nonutility_allocation_wrong'; END IF;
 INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key) VALUES('a0000000-0000-4000-8000-000000000008',-9000,'POOL_CONTRIBUTION','Current debit','fixture','mixed-debit-2','mixed-debit-2');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000008')<>3000 THEN RAISE EXCEPTION 'nonutility_debit_did_not_consume_remaining_credits'; END IF;
 PERFORM pg_temp.assert_error('UPDATE public.rg_market_products SET cost_rg=1 WHERE product_key=''beat_pass''','market_product_version_is_immutable');
 IF has_table_privilege('authenticated','public.rg_coin_spend_allocations','SELECT') OR has_table_privilege('anon','public.rg_spendable_balances','SELECT')
 OR has_function_privilege('service_role','public.rg_credit_controlled_utility(uuid,bigint,text,text)','EXECUTE') THEN RAISE EXCEPTION 'private_utility_data_exposed'; END IF;
END $$;
-- Only isolated test fixtures activate the catalog.
UPDATE public.rg_economy_config SET market_v1_enabled=true;
UPDATE public.rg_market_products SET active=true;
DO $$ DECLARE p uuid; intent uuid:=gen_random_uuid(); order_id uuid:=gen_random_uuid(); before_score bigint;
BEGIN
 SELECT count(*) INTO before_score FROM public.rg_score_events;
 p:=public.rg_purchase_market_pass('a0000000-0000-4000-8000-000000000007','mp3_50',1,'controlled-ticket-key-01');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000007')<>0 THEN RAISE EXCEPTION 'controlled_credit_cannot_spend'; END IF;
 PERFORM pg_temp.assert_error('SELECT public.rg_purchase_market_pass(''a0000000-0000-4000-8000-000000000007'',''wav_25'',1,''controlled-ticket-key-01'')','market_purchase_idempotency_conflict');
 INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot)
 VALUES(intent,'a0000000-0000-4000-8000-000000000007','self',jsonb_build_object('kind','rg_market','paymentMethod','rg_market','totalAmountCents',1450,'utility',jsonb_build_object('passId',p,'productKey','mp3_50','version',1)));
 PERFORM public.rg_reserve_market_pass('a0000000-0000-4000-8000-000000000007',p,intent);
 PERFORM public.rg_reserve_market_pass('a0000000-0000-4000-8000-000000000007',p,intent);
 PERFORM pg_temp.assert_error(format('SELECT public.rg_release_market_pass(%L,%L)','a0000000-0000-4000-8000-000000000007',intent),'market_release_requires_unpaid_closed_intent');
 UPDATE public.commerce_checkout_intents SET state='expired' WHERE id=intent;
 PERFORM public.rg_release_market_pass('a0000000-0000-4000-8000-000000000007',intent);
 IF (SELECT status FROM public.rg_beat_passes WHERE id=p)<>'available' THEN RAISE EXCEPTION 'ticket_not_released'; END IF;
 -- A new payment intent reserves the same ticket; remaining USD must match.
 intent:=gen_random_uuid();
 INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot,stripe_checkout_session_id)
 VALUES(intent,'a0000000-0000-4000-8000-000000000007','self',jsonb_build_object('kind','rg_market','paymentMethod','rg_market','totalAmountCents',1450,'utility',jsonb_build_object('passId',p,'productKey','mp3_50','version',1)),'cs_economy_partial');
 PERFORM public.rg_reserve_market_pass('a0000000-0000-4000-8000-000000000007',p,intent);
 INSERT INTO public.orders(id,stripe_checkout_session_id,status,payment_status,total_amount) VALUES(order_id,'cs_economy_partial','completed','paid',14.50);
 UPDATE public.commerce_checkout_intents SET state='fulfilled',verified_paid_at=now() WHERE id=intent;
 PERFORM public.rg_consume_market_pass(intent,order_id);
 PERFORM public.rg_consume_market_pass(intent,order_id);
 IF (SELECT count(*) FROM public.rg_score_events)<>before_score THEN RAISE EXCEPTION 'market_created_pts'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rg_market_liabilities WHERE obligation_kind='pass') THEN RAISE EXCEPTION 'pass_burn_erased_liability'; END IF;
END $$;
-- A pre-migration ADMIN-funded Beat Pass is still redeemable through the legacy RPCs.
DO $$ DECLARE intent uuid:=gen_random_uuid(); order_id uuid:=gen_random_uuid(); pass uuid;
BEGIN
 INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,recipient_mode,snapshot)
 VALUES(intent,'a0000000-0000-4000-8000-000000000010','self','{"kind":"beat_pass_redemption","paymentMethod":"rg_beat_pass","totalAmountCents":0}');
 pass:=public.rg_reserve_next_beat_pass('a0000000-0000-4000-8000-000000000010',intent);
 INSERT INTO public.orders(id,stripe_checkout_session_id,status,payment_status,total_amount) VALUES(order_id,'rgpass:'||intent,'completed','paid',0);
 UPDATE public.commerce_checkout_intents SET state='fulfilled',verified_paid_at=now() WHERE id=intent;
 PERFORM public.rg_consume_beat_pass(intent,order_id);PERFORM public.rg_consume_beat_pass(intent,order_id);
 IF (SELECT status FROM public.rg_beat_passes WHERE id=pass)<>'consumed' THEN RAISE EXCEPTION 'pre_migration_pass_no_longer_redeemable'; END IF;
END $$;
-- Studio/email claim and RG Artist pass assignment share the canonical Gift V1 records.
INSERT INTO public.customers(id,email,auth_user_id,name,studio_access_until) VALUES
 ('b0000000-0000-4000-8000-000000000001','economy-2@example.test','a0000000-0000-4000-8000-000000000002','Buyer',NULL),
 ('b0000000-0000-4000-8000-000000000002','economy-9@example.test','a0000000-0000-4000-8000-000000000009','Recipient',now()+interval '10 days');
INSERT INTO public.rg_artists(id,user_id,stage_name,slug,status) VALUES('c0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000009','Economy Recipient','economy-recipient','active');
DO $$ DECLARE product text; p uuid; intent uuid; order_id uuid; item uuid; gift uuid; prior_until timestamptz; granted timestamptz; result record; h text;
BEGIN
 FOR product IN SELECT unnest(ARRAY['studio_30','wav_25','beat_pass']) LOOP
  p:=public.rg_purchase_market_pass('a0000000-0000-4000-8000-000000000002',product,1,'gift-purchase-key-'||product);
  intent:=gen_random_uuid();order_id:=gen_random_uuid();item:=gen_random_uuid();gift:=gen_random_uuid();h:=encode(digest(product,'sha256'),'hex');
  INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,buyer_email,recipient_mode,recipient_kind,recipient_email,recipient_artist_id,recipient_artist_slug,snapshot)
  VALUES(intent,'a0000000-0000-4000-8000-000000000002','economy-2@example.test','gift',CASE WHEN product='studio_30' THEN 'email' ELSE 'artist' END,
   CASE WHEN product='studio_30' THEN 'economy-9@example.test' END,CASE WHEN product<>'studio_30' THEN 'c0000000-0000-4000-8000-000000000001'::uuid END,
   CASE WHEN product<>'studio_30' THEN 'economy-recipient' END,
   jsonb_build_object('kind','rg_market','paymentMethod','rg_market','totalAmountCents',0,'utility',jsonb_build_object('passId',p,'productKey',product,'version',1)));
  PERFORM public.rg_reserve_market_pass('a0000000-0000-4000-8000-000000000002',p,intent);
  INSERT INTO public.orders(id,customer_id,stripe_checkout_session_id,status,payment_status,total_amount) VALUES(order_id,'b0000000-0000-4000-8000-000000000001','rgmarket:'||intent,'completed','paid',0);
  INSERT INTO public.order_items(id,order_id,market_pass_id,unit_price) VALUES(item,order_id,p,0);
  INSERT INTO public.beat_gifts(id,intent_id,order_id,order_item_id,market_pass_id,recipient_kind,recipient_email,recipient_artist_id,recipient_artist_slug,status,payment_status)
   VALUES(gift,intent,order_id,item,p,CASE WHEN product='studio_30' THEN 'email' ELSE 'artist' END,'economy-9@example.test',
     CASE WHEN product<>'studio_30' THEN 'c0000000-0000-4000-8000-000000000001'::uuid END,CASE WHEN product<>'studio_30' THEN 'economy-recipient' END,'paid_pending_recipient','paid');
  UPDATE public.commerce_checkout_intents SET state='fulfilled',verified_paid_at=now() WHERE id=intent;
  IF product='studio_30' THEN
   SELECT studio_access_until INTO prior_until FROM public.customers WHERE id='b0000000-0000-4000-8000-000000000002';
   PERFORM public.rg_prepare_gift_claim_email(gift,h,now()+interval '72 hours','isolated-sealed-token','{"beatTitle":"Studio"}');
   IF (SELECT studio_access_until FROM public.customers WHERE id='b0000000-0000-4000-8000-000000000002')<>prior_until THEN RAISE EXCEPTION 'studio_started_before_claim'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rg_get_gift_claim_preview(h) WHERE license_tier='studio') THEN RAISE EXCEPTION 'studio_preview_missing'; END IF;
   SELECT * INTO result FROM public.rg_claim_beat_gift(h,'a0000000-0000-4000-8000-000000000009','b0000000-0000-4000-8000-000000000002',NULL,NULL);
   IF result.studio_access_until<>prior_until+interval '30 days' THEN RAISE EXCEPTION 'studio_claim_did_not_extend'; END IF;
   PERFORM pg_temp.assert_error(format('SELECT public.rg_claim_beat_gift(%L,%L,%L,NULL,NULL)',h,'a0000000-0000-4000-8000-000000000009','b0000000-0000-4000-8000-000000000002'),'gift_token_invalid_expired_or_used');
  ELSE
   PERFORM public.rg_assign_market_gift(gift,'a0000000-0000-4000-8000-000000000009','b0000000-0000-4000-8000-000000000002');
   PERFORM public.rg_assign_market_gift(gift,'a0000000-0000-4000-8000-000000000009','b0000000-0000-4000-8000-000000000002');
   IF NOT EXISTS(SELECT 1 FROM public.rg_beat_passes WHERE id=p AND user_id='a0000000-0000-4000-8000-000000000009' AND status='available') THEN RAISE EXCEPTION 'artist_gift_not_assigned'; END IF;
  END IF;
 END LOOP;
 SELECT studio_access_until INTO prior_until FROM public.customers WHERE id='b0000000-0000-4000-8000-000000000002';
 granted:=public.rg_grant_commerce_studio_access('order',gen_random_uuid(),'b0000000-0000-4000-8000-000000000002',30);
 IF granted<>prior_until+interval '30 days' THEN RAISE EXCEPTION 'studio_extension_shortened_access'; END IF;
END $$;
DO $$ DECLARE pool bigint; season uuid;
BEGIN
 FOR pool IN SELECT unnest(ARRAY[25000,50000,100000,25001,7]::bigint[]) LOOP
  IF (SELECT sum(public.rg_season_reward_amount(pool,r)) FROM generate_series(1,23) r)<>pool THEN RAISE EXCEPTION 'season_rounding_wrong'; END IF;
  IF public.rg_season_reward_amount(pool,1)<>floor(pool::numeric/5) OR public.rg_season_reward_amount(pool,23)>public.rg_season_reward_amount(pool,4) THEN RAISE EXCEPTION 'season_distribution_wrong'; END IF;
 END LOOP;
 SELECT id INTO season FROM public.rg_seasons WHERE status='active';
 PERFORM pg_temp.assert_error(format('SELECT public.rg_finalize_season(%L)',season),'season_rewards_budget_not_enabled');
 IF public.rg_award_verified_activity(gen_random_uuid()) IS NOT NULL THEN RAISE EXCEPTION 'direct_earning_enabled_by_default'; END IF;
 IF public.rg_direct_award_amount('LICENSE_PURCHASED',NULL)<>0 OR public.rg_direct_award_amount('WALLET_SPEND',NULL)<>0 OR public.rg_direct_award_amount('GIFT',NULL)<>0 THEN RAISE EXCEPTION 'forbidden_action_awards_rg'; END IF;
END $$;
-- These isolated claim fixtures leave no deliverable mail for subsequent legacy tests.
UPDATE public.transactional_email_jobs SET status='cancelled' WHERE source_type='beat_gift'
 AND source_id IN(SELECT id FROM public.beat_gifts WHERE market_pass_id IS NOT NULL AND recipient_email LIKE 'economy-%@example.test')
 AND status IN ('queued','retry','sending');
SELECT 'RG ECONOMY TRANSACTION TESTS PASS' AS result;
