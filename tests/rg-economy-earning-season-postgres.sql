\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database()<>'rgodbeat_validation' THEN RAISE EXCEPTION 'wrong_test_database'; END IF; END $$;
UPDATE public.rg_economy_config SET direct_earning_v1_enabled=true,season_issuance_cap=1000000,maximum_outstanding_rg=100000000,maximum_utility_exposure_cents=100000000,maximum_pool_rg=1000000;
DO $$ DECLARE track uuid; job uuid; publication uuid; event uuid; credit uuid; first_credit uuid; i integer; scores_before bigint; owner uuid:='a0000000-0000-4000-8000-000000000009'; artist uuid:='c0000000-0000-4000-8000-000000000001'; season uuid;
BEGIN
 SELECT id INTO season FROM public.rg_seasons WHERE status='active';
 FOR i IN 1..6 LOOP
  track:=public.create_rg_track(owner,artist,'Verified earning fixture '||i,NULL);job:=gen_random_uuid();
  INSERT INTO public.youtube_export_jobs(id,user_id,artist_name,title,privacy,status,youtube_video_id,youtube_url,finished_at) VALUES(job,owner,'Economy Recipient','Verified fixture','public','uploaded',job::text,'https://youtube.com/watch?v='||job::text,now());
  publication:=public.record_rg_publication_link(owner,artist,track,NULL,job,job::text);
  event:=public.rg_record_score_event('TRACK_PUBLISHED',artist,track,NULL,publication,'rg_publication_link',publication::text);
  SELECT count(*) INTO scores_before FROM public.rg_score_events;
  credit:=public.rg_award_verified_activity(event);
  IF i<=5 AND credit IS NULL THEN RAISE EXCEPTION 'verified_action_not_awarded'; END IF;
  IF i=6 AND credit IS NOT NULL THEN RAISE EXCEPTION 'direct_cap_1000_exceeded'; END IF;
  IF i=1 THEN first_credit:=credit; END IF;
  IF public.rg_award_verified_activity(event) IS DISTINCT FROM credit THEN RAISE EXCEPTION 'direct_award_not_idempotent'; END IF;
  IF i=1 THEN
   BEGIN
    INSERT INTO public.rg_coin_ledger(user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id)
     VALUES(owner,artist,200,'EARNED_RG','Repeated evidence fixture','verified_activity',event::text,'repeated-evidence:'||event::text,season);
    RAISE EXCEPTION 'verified_evidence_reissued_with_new_key';
   EXCEPTION WHEN OTHERS THEN
    IF SQLERRM<>'direct_earning_evidence_invalid' THEN RAISE; END IF;
   END;
  END IF;
  IF (SELECT count(*) FROM public.rg_score_events)<>scores_before THEN RAISE EXCEPTION 'utility_award_created_pts'; END IF;
 END LOOP;
 IF (SELECT sum(amount) FROM public.rg_coin_ledger WHERE user_id=owner AND season_id=season AND origin_type='EARNED_RG')<>1000 THEN RAISE EXCEPTION 'wrong_direct_cap'; END IF;
END $$;
-- Exact v2 payouts to 23 different verified-account fixtures; no pool assumption.
UPDATE public.rg_economy_config SET season_rewards_v2_enabled=true;
DO $$ DECLARE season uuid:=gen_random_uuid(); pool bigint:=50001; artist uuid; owner uuid; i integer; prior_scores bigint;
BEGIN
 INSERT INTO public.rg_seasons(id,season_number,name,starts_at,ends_at,status,rules_version) VALUES(season,9000,'Isolated closed V2',now()-interval '40 days',now()-interval '26 days','ended',2);
 INSERT INTO public.rg_reward_pool_transactions(season_id,transaction_type,source_type,source_id,gross_rg,pool_rg,reserve_rg,idempotency_key) VALUES(season,'SPONSOR_CONTRIBUTION','fixture',season::text,pool,pool,0,season::text);
 FOR i IN 1..23 LOOP
  owner:=gen_random_uuid();artist:=gen_random_uuid();
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(owner,owner::text||'@example.test',now());
  INSERT INTO public.rg_artists(id,user_id,stage_name,slug,status) VALUES(artist,owner,'V2 fixture '||i,'v2-'||artist,'active');
  INSERT INTO public.rg_score_events(season_id,event_type,category,artist_id,source_type,source_id,score_points,rules_version,verified_at) VALUES(season,'TRACK_PUBLISHED','CREATION',artist,'fixture',artist::text,24-i,2,now()-interval '27 days');
 END LOOP;
 SELECT count(*) INTO prior_scores FROM public.rg_score_events;
 PERFORM public.rg_finalize_season(season);PERFORM public.rg_finalize_season(season);
 IF (SELECT sum(coin_rg) FROM public.rg_season_rewards WHERE season_id=season)<>pool OR (SELECT count(*) FROM public.rg_season_rewards WHERE season_id=season)<>23 THEN RAISE EXCEPTION 'v2_not_exactly_23_or_pool_not_conserved'; END IF;
 FOR i IN 1..23 LOOP
  IF (SELECT coin_rg FROM public.rg_season_rewards WHERE season_id=season AND place=i)<>public.rg_season_reward_amount(pool,i) THEN RAISE EXCEPTION 'v2_wrong_payout:%',i; END IF;
 END LOOP;
 IF (SELECT sum(pool_rg) FROM public.rg_reward_pool_transactions WHERE season_id=season)<>0 OR (SELECT count(*) FROM public.rg_score_events)<>prior_scores THEN RAISE EXCEPTION 'v2_pool_or_pts_wrong'; END IF;
END $$;
ROLLBACK;
SELECT 'VERIFIED EARNING CAP + REAL V2 FINALIZATION PASS' AS result;
