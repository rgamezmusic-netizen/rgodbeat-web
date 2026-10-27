-- Isolated PostgreSQL only. Apply bootstrap, V3 schema and publication activation first.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'rgodbeat_validation' THEN RAISE EXCEPTION 'wrong_test_database'; END IF; END $$;
UPDATE public.rg_economy_config SET season_anchor_at=date_trunc('day',now())-interval '2 days';
UPDATE public.rg_seasons s SET starts_at=c.season_anchor_at+(s.season_number-1)*interval '14 days',ends_at=c.season_anchor_at+s.season_number*interval '14 days' FROM public.rg_economy_config c;
BEGIN;
-- Only fake money in this guarded disposable database enables the entire flow.
UPDATE public.rg_economy_config SET purchases_enabled=true,redemption_enabled=true,wallet_transfers_enabled=true,purchase_price_cents_per_rg=1;
CREATE FUNCTION pg_temp.expect_error(q text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RAISE EXCEPTION 'expected_failure_missing:%',expected; EXCEPTION WHEN OTHERS THEN IF position(expected IN SQLERRM)=0 THEN RAISE; END IF; END $$;
INSERT INTO auth.users(id,email,email_confirmed_at) SELECT ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'wallet-v3-'||n||'@example.test',now() FROM generate_series(1,8)n;
INSERT INTO public.rg_artists(id,user_id,stage_name,slug) SELECT ('c0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Wallet Artist '||n,'wallet-artist-'||n FROM generate_series(1,8)n;
UPDATE public.rg_economy_config SET publication_rewards_started_at=(SELECT starts_at FROM public.rg_seasons WHERE status='active'),season_issuance_cap=0,maximum_outstanding_rg=0;

-- Helper exists only in this disposable database, never in a migration.
CREATE FUNCTION public.test_wallet_publication(owner_n integer, label text, at_time timestamptz DEFAULT now(), audio text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE vid text:=substring(replace(gen_random_uuid()::text,'-',''),1,11); u uuid:=('a0000000-0000-4000-8000-'||lpad(owner_n::text,12,'0'))::uuid;
 a uuid:=('c0000000-0000-4000-8000-'||lpad(owner_n::text,12,'0'))::uuid; t uuid; j uuid:=gen_random_uuid(); p uuid;
BEGIN
 t:=public.create_rg_track(u,a,'Wallet fixture '||label,NULL);
 INSERT INTO public.youtube_export_jobs(id,user_id,artist_name,title,privacy,status,youtube_video_id,youtube_url,finished_at,audio_sha256)
 VALUES(j,u,'Fixture','Fixture','unlisted','uploaded',vid,'https://www.youtube.com/watch?v='||vid,at_time,coalesce(audio,encode(sha256(convert_to(label,'utf8')),'hex')));
 p:=public.record_rg_publication_link(u,a,t,NULL,j,vid); RETURN p;
END $$;

DO $$ DECLARE p uuid; r jsonb; b timestamptz; total integer:=0; i integer; before_scores bigint;
BEGIN
 SELECT starts_at+floor(extract(epoch FROM(now()-starts_at))/43200)*interval '12 hours' INTO b FROM public.rg_seasons WHERE status='active';
 FOR i IN 1..6 LOOP
  p:=public.test_wallet_publication(1,'daily-'||i,CASE WHEN i<=3 THEN b-interval '1 minute' ELSE now() END);
  r:=public.rg_reward_publication(p);
  IF (r->>'points')::integer<>(ARRAY[23,7,4])[((i-1)%3)+1] OR r->>'creditedRg'<>r->>'points' THEN RAISE EXCEPTION 'sequence_mismatch:%',r; END IF;
  total:=total+(r->>'points')::integer;
  IF public.rg_reward_publication(p)<>r THEN RAISE EXCEPTION 'publication_retry_changed_reward'; END IF;
 END LOOP;
 IF total<>68 OR (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000001')<>68 THEN RAISE EXCEPTION 'daily_not_68'; END IF;
 p:=public.test_wallet_publication(1,'seventh'); r:=public.rg_reward_publication(p);
 IF r->>'status'<>'limit_reached' OR r->>'points'<>'0' THEN RAISE EXCEPTION 'fourth_in_block_awarded'; END IF;
 -- Same audio on another track cannot consume a slot or generate RG.
 p:=public.test_wallet_publication(2,'same-audio'); PERFORM public.rg_reward_publication(p);
 p:=public.test_wallet_publication(2,'different-title',now(),encode(sha256(convert_to('same-audio','utf8')),'hex')); r:=public.rg_reward_publication(p);
 IF r->>'status'<>'duplicate_audio' THEN RAISE EXCEPTION 'duplicate_audio_farmed'; END IF;
 IF (public.rg_wallet_reward_status('a0000000-0000-4000-8000-000000000002')->>'remaining')::integer<>2 THEN RAISE EXCEPTION 'duplicate_consumed_slot'; END IF;
 -- A legacy Score is retained, never re-credited as V3.
 p:=public.test_wallet_publication(3,'legacy');
 SELECT count(*) INTO before_scores FROM public.rg_score_events;
 INSERT INTO public.rg_score_events(season_id,event_type,category,artist_id,track_id,publication_id,source_type,source_id,score_points,rules_version,verified_at)
 SELECT s.id,'TRACK_PUBLISHED','CREATION',l.artist_id,l.track_id,l.id,'rg_publication_link',l.id::text,10,1,l.published_at FROM public.rg_publication_links l CROSS JOIN public.rg_seasons s WHERE l.id=p AND s.status='active';
 r:=public.rg_reward_publication(p);
 IF r->>'status'<>'legacy' OR r->>'points'<>'10' OR r->>'creditedRg'<>'0' THEN RAISE EXCEPTION 'legacy_history_changed'; END IF;
 IF (SELECT count(*) FROM public.rg_score_events)<>before_scores+1 THEN RAISE EXCEPTION 'legacy_score_duplicated'; END IF;
 -- Private or foreign source data cannot earn a reward.
 p:=public.test_wallet_publication(3,'private'); UPDATE public.youtube_export_jobs SET privacy='private' WHERE id=(SELECT youtube_export_job_ref FROM public.rg_publication_links WHERE id=p);
 PERFORM pg_temp.expect_error(format('SELECT public.rg_reward_publication(%L)',p),'publication_unverified');
 p:=public.test_wallet_publication(3,'mismatched-owner'); UPDATE public.youtube_export_jobs SET user_id='a0000000-0000-4000-8000-000000000004' WHERE id=(SELECT youtube_export_job_ref FROM public.rg_publication_links WHERE id=p);
 PERFORM pg_temp.expect_error(format('SELECT public.rg_reward_publication(%L)',p),'publication_unverified');
END $$;

DO $$ DECLARE tid uuid; before_scores bigint; before_supply bigint; topup uuid:=gen_random_uuid(); intent uuid:=gen_random_uuid(); order_id uuid:=gen_random_uuid(); n bigint;
BEGIN
 SELECT count(*) INTO before_scores FROM public.rg_score_events;
 SELECT sum(amount) INTO before_supply FROM public.rg_coin_ledger;
 tid:=public.rg_transfer_wallet('a0000000-0000-4000-8000-000000000001','wallet-artist-4',30,'d0000000-0000-4000-8000-000000000001');
 IF public.rg_transfer_wallet('a0000000-0000-4000-8000-000000000001','wallet-artist-4',30,'d0000000-0000-4000-8000-000000000001')<>tid THEN RAISE EXCEPTION 'transfer_not_idempotent'; END IF;
 IF (SELECT sum(amount) FROM public.rg_coin_ledger)<>before_supply THEN RAISE EXCEPTION 'transfer_issued_rg'; END IF;
 PERFORM pg_temp.expect_error('SELECT public.rg_transfer_wallet(''a0000000-0000-4000-8000-000000000001'',''wallet-artist-4'',31,''d0000000-0000-4000-8000-000000000001'')','transfer_request_conflict');
 PERFORM pg_temp.expect_error('SELECT public.rg_transfer_wallet(''a0000000-0000-4000-8000-000000000001'',''wallet-artist-4'',999,''d0000000-0000-4000-8000-000000000002'')','insufficient_rg');
 PERFORM pg_temp.expect_error('SELECT public.rg_transfer_wallet(''a0000000-0000-4000-8000-000000000001'',''wallet-artist-1'',1,''d0000000-0000-4000-8000-000000000003'')','recipient_unavailable');
 INSERT INTO public.rg_wallet_topups(id,user_id,request_key,amount_cents,amount_rg,stripe_session_id) VALUES(topup,'a0000000-0000-4000-8000-000000000004',gen_random_uuid(),5000,5000,'cs_wallet_v3_fixture');
 PERFORM pg_temp.expect_error(format('SELECT public.rg_credit_wallet_topup(%L,''cs_wrong'',''pi_fixture'',5000,''usd'')',topup),'topup_payment_mismatch');
 PERFORM pg_temp.expect_error(format('SELECT public.rg_credit_wallet_topup(%L,''cs_wallet_v3_fixture'',''pi_fixture'',1,''usd'')',topup),'topup_payment_mismatch');
 PERFORM public.rg_credit_wallet_topup(topup,'cs_wallet_v3_fixture','pi_wallet_v3_fixture',5000,'usd');
 IF public.rg_credit_wallet_topup(topup,'cs_wallet_v3_fixture','pi_wallet_v3_fixture',5000,'usd') THEN RAISE EXCEPTION 'topup_credited_twice'; END IF;
 -- One MP3 at the actual final US$29 price costs 2900 RG, not half again.
 INSERT INTO public.commerce_checkout_intents(id,buyer_auth_user_id,buyer_email,recipient_mode,snapshot)
 VALUES(intent,'a0000000-0000-4000-8000-000000000004','wallet-v3-4@example.test','self','{"kind":"rg_wallet","paymentMethod":"rg_wallet","rgAmount":2900,"totalAmountCents":0,"currency":"usd","items":[{"licenseTier":"mp3","unitPrice":0,"catalogUnitPrice":29}]}');
 n:=public.rg_reserve_wallet_checkout('a0000000-0000-4000-8000-000000000004',intent);
 IF n<>2900 OR public.rg_reserve_wallet_checkout('a0000000-0000-4000-8000-000000000004',intent)<>2900 THEN RAISE EXCEPTION 'wrong_rg_price'; END IF;
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000004')<>2130 THEN RAISE EXCEPTION 'wallet_debit_wrong'; END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.rg_reserve_wallet_checkout(''a0000000-0000-4000-8000-000000000003'',%L)',intent),'wallet_checkout_invalid');
 INSERT INTO public.orders(id,stripe_checkout_session_id,status,payment_status,total_amount) VALUES(order_id,'rgwallet:'||intent,'completed','paid',0);
 PERFORM public.rg_consume_wallet_checkout(intent,order_id); PERFORM public.rg_consume_wallet_checkout(intent,order_id);
 -- Cumulative partial/full refunds are append-only and cannot mint more RG.
 PERFORM public.rg_reverse_wallet_topup(topup,1000); PERFORM public.rg_reverse_wallet_topup(topup,1000); PERFORM public.rg_reverse_wallet_topup(topup,5000);
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000004')<>-2870 THEN RAISE EXCEPTION 'refund_debt_lost'; END IF;
 PERFORM pg_temp.expect_error('SELECT public.rg_transfer_wallet(''a0000000-0000-4000-8000-000000000004'',''wallet-artist-1'',1,''d0000000-0000-4000-8000-000000000004'')','insufficient_rg');
 IF (SELECT count(*) FROM public.rg_score_events)<>before_scores THEN RAISE EXCEPTION 'wallet_actions_changed_top_points'; END IF;
 -- A partial refund received before the paid event still credits the net amount.
 topup:=gen_random_uuid();
 INSERT INTO public.rg_wallet_topups(id,user_id,request_key,amount_cents,amount_rg,stripe_session_id) VALUES(topup,'a0000000-0000-4000-8000-000000000005',gen_random_uuid(),1000,1000,'cs_refund_first');
 PERFORM public.rg_reverse_wallet_topup(topup,400); PERFORM public.rg_credit_wallet_topup(topup,'cs_refund_first','pi_refund_first',1000,'usd');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000005')<>600 THEN RAISE EXCEPTION 'refund_before_credit_wrong'; END IF;
 -- A full reversal arriving first must suppress late payment fulfillment.
 topup:=gen_random_uuid();
 INSERT INTO public.rg_wallet_topups(id,user_id,request_key,amount_cents,amount_rg,stripe_session_id) VALUES(topup,'a0000000-0000-4000-8000-000000000005',gen_random_uuid(),1000,1000,'cs_full_refund_first');
 PERFORM public.rg_reverse_wallet_topup(topup,1000); PERFORM public.rg_credit_wallet_topup(topup,'cs_full_refund_first','pi_full_refund_first',1000,'usd');
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000005')<>600 THEN RAISE EXCEPTION 'late_payment_resurrected_refunded_rg'; END IF;
 -- Won disputes restore only the held disputed portion; real refunds remain deducted.
 topup:=gen_random_uuid();
 INSERT INTO public.rg_wallet_topups(id,user_id,request_key,amount_cents,amount_rg,stripe_session_id) VALUES(topup,'a0000000-0000-4000-8000-000000000005',gen_random_uuid(),1000,1000,'cs_dispute_fixture');
 PERFORM public.rg_credit_wallet_topup(topup,'cs_dispute_fixture','pi_dispute_fixture',1000,'usd');
 PERFORM public.rg_reconcile_wallet_topup(topup,200,800,100);
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000005')<>600 THEN RAISE EXCEPTION 'disputed_balance_not_held'; END IF;
 PERFORM public.rg_reconcile_wallet_topup(topup,200,0,200);
 PERFORM public.rg_reconcile_wallet_topup(topup,200,800,100);
 PERFORM public.rg_reconcile_wallet_topup(topup,200,0,200);
 IF (SELECT balance_rg FROM public.rg_spendable_balances WHERE user_id='a0000000-0000-4000-8000-000000000005')<>1400 THEN RAISE EXCEPTION 'won_dispute_not_restored_or_late_event_reversed_it'; END IF;
END $$;
DO $$ BEGIN
 IF has_function_privilege('authenticated','public.rg_reward_publication(uuid)','EXECUTE') OR has_function_privilege('anon','public.rg_transfer_wallet(uuid,text,bigint,uuid)','EXECUTE')
  OR has_table_privilege('authenticated','public.rg_wallet_topups','SELECT') OR has_table_privilege('anon','public.rg_spendable_balances','SELECT') THEN RAISE EXCEPTION 'wallet_private_surface_exposed'; END IF;
 PERFORM pg_temp.expect_error('UPDATE public.rg_coin_ledger SET amount=1','rg_ledger_is_append_only');
 PERFORM pg_temp.expect_error('DELETE FROM public.rg_publication_awards','rg_ledger_is_append_only');
END $$;
SELECT 'V3 publication/wallet/idempotency/refund/access checks passed' AS result;

COMMIT;
