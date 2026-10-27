-- RG wallet V3. Additive to the deployed 20261009 schema; do not run pending
-- Market V1/V2 migrations to activate this model. No balances/history are reset.
BEGIN;
ALTER TABLE public.rg_economy_config
  ADD COLUMN wallet_v3_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN publication_rewards_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN publication_rewards_started_at timestamptz,
  ADD COLUMN wallet_transfers_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN season_rewards_v3_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.youtube_export_jobs ADD COLUMN audio_sha256 text CHECK(audio_sha256 ~ '^[a-f0-9]{64}$');
ALTER TABLE public.rg_coin_ledger DROP CONSTRAINT rg_coin_ledger_origin_type_check;
ALTER TABLE public.rg_coin_ledger ADD CONSTRAINT rg_coin_ledger_origin_type_check CHECK(origin_type IN
 ('EARNED_RG','PURCHASED_RG','SEASON_REWARD','SPONSOR_CONTRIBUTION','POOL_CONTRIBUTION','REDEMPTION','RESERVE_TRANSFER','ADMIN_CORRECTION','TRANSFER_IN','TRANSFER_OUT','PURCHASE_REVERSAL'));

CREATE OR REPLACE VIEW public.rg_spendable_balances WITH(security_invoker=true) AS
 SELECT user_id,coalesce(sum(amount),0)::bigint AS balance_rg FROM public.rg_coin_ledger WHERE user_id IS NOT NULL GROUP BY user_id;
REVOKE ALL ON public.rg_spendable_balances FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.rg_spendable_balances TO service_role;

CREATE TABLE public.rg_publication_awards (
 publication_id uuid PRIMARY KEY REFERENCES public.rg_publication_links(id),
 track_id uuid NOT NULL UNIQUE REFERENCES public.rg_tracks(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 artist_id uuid NOT NULL REFERENCES public.rg_artists(id),
 season_id uuid NOT NULL REFERENCES public.rg_seasons(id),
 block_start timestamptz NOT NULL,
 ordinal smallint NOT NULL CHECK(ordinal BETWEEN 0 AND 3),
 amount_rg integer NOT NULL CHECK(amount_rg IN(0,4,7,23)),
 audio_sha256 text,
 score_event_id uuid UNIQUE REFERENCES public.rg_score_events(id),
 coin_ledger_id uuid UNIQUE REFERENCES public.rg_coin_ledger(id),
 result text NOT NULL CHECK(result IN('awarded','limit_reached','duplicate_audio','legacy')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((result='awarded')=(amount_rg>0 AND ordinal>0 AND score_event_id IS NOT NULL AND coin_ledger_id IS NOT NULL))
);
CREATE UNIQUE INDEX rg_publication_awards_slot ON public.rg_publication_awards(user_id,block_start,ordinal) WHERE ordinal>0;
CREATE UNIQUE INDEX rg_publication_awards_audio ON public.rg_publication_awards(user_id,audio_sha256) WHERE result='awarded' AND audio_sha256 IS NOT NULL;
CREATE TABLE public.rg_wallet_transfers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sender_id uuid NOT NULL REFERENCES auth.users(id),
 recipient_id uuid NOT NULL REFERENCES auth.users(id), artist_id uuid NOT NULL REFERENCES public.rg_artists(id),
 amount_rg bigint NOT NULL CHECK(amount_rg>0 AND amount_rg<=9007199254740991), request_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(sender_id,request_key), CHECK(sender_id<>recipient_id)
);
CREATE TABLE public.rg_wallet_topups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id), request_key uuid NOT NULL,
 amount_cents integer NOT NULL CHECK(amount_cents BETWEEN 500 AND 1000000),
 amount_rg bigint NOT NULL CHECK(amount_rg=amount_cents), currency text NOT NULL DEFAULT 'usd' CHECK(currency='usd'),
 stripe_session_id text UNIQUE, stripe_payment_intent_id text UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','credited','reversed','expired')),
 reversed_rg bigint NOT NULL DEFAULT 0 CHECK(reversed_rg>=0 AND reversed_rg<=amount_rg),
 refunded_rg bigint NOT NULL DEFAULT 0 CHECK(refunded_rg>=0 AND refunded_rg<=amount_rg),
 dispute_rg bigint NOT NULL DEFAULT 0 CHECK(dispute_rg>=0 AND dispute_rg<=amount_rg),
 dispute_event_created bigint NOT NULL DEFAULT 0, dispute_closed boolean NOT NULL DEFAULT false, adjustment_revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), credited_at timestamptz, UNIQUE(user_id,request_key)
);
CREATE TABLE public.rg_wallet_redemptions (
 intent_id uuid PRIMARY KEY REFERENCES public.commerce_checkout_intents(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 amount_rg bigint NOT NULL CHECK(amount_rg>0), debit_ledger_id uuid NOT NULL UNIQUE REFERENCES public.rg_coin_ledger(id),
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN('reserved','consumed')),
 order_id uuid UNIQUE REFERENCES public.orders(id), created_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['rg_publication_awards','rg_wallet_transfers','rg_wallet_topups','rg_wallet_redemptions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',t);
 END LOOP;
END $$;
CREATE TRIGGER rg_publication_awards_append_only BEFORE UPDATE OR DELETE ON public.rg_publication_awards FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();
CREATE TRIGGER rg_wallet_transfers_append_only BEFORE UPDATE OR DELETE ON public.rg_wallet_transfers FOR EACH ROW EXECUTE FUNCTION public.rg_reject_ledger_mutation();

INSERT INTO public.rg_rule_versions(version,score_rules,youtube_view_milestones,support_tiers,reward_distribution,notes)
 SELECT 3,jsonb_set(score_rules,'{TRACK_PUBLISHED}','{"enabled":true,"points":23,"sequence":[23,7,4],"block_hours":12,"once":"track","per_artist_season_cap":0}'),
 youtube_view_milestones,support_tiers,reward_distribution,
 'V3: 23/7/4 points and matching RG per verified publication/account/12-hour fixed block. No global issuance cap. Purchased/transferred RG never award Score.'
 FROM public.rg_rule_versions WHERE version=1;

CREATE FUNCTION public.rg_reward_publication(p_publication_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE p public.rg_publication_links%ROWTYPE; j public.youtube_export_jobs%ROWTYPE;
 a public.rg_publication_awards%ROWTYPE; s public.rg_seasons%ROWTYPE; c public.rg_economy_config%ROWTYPE;
 u uuid; b timestamptz; n integer; pts integer; sid uuid; lid uuid; outcome text;
BEGIN
 SELECT * INTO p FROM public.rg_publication_links WHERE id=p_publication_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'publication_unverified'; END IF;
 SELECT * INTO j FROM public.youtube_export_jobs WHERE id=p.youtube_export_job_ref;
 SELECT user_id INTO u FROM public.rg_artists WHERE id=p.artist_id AND status='active';
 IF u IS NULL OR u IS DISTINCT FROM p.published_by_user_ref OR j.user_id IS DISTINCT FROM u
  OR j.status IS DISTINCT FROM 'uploaded' OR j.youtube_video_id IS DISTINCT FROM p.youtube_video_id
  OR j.privacy NOT IN('public','unlisted') OR j.finished_at IS NULL
  OR NOT EXISTS(SELECT 1 FROM public.rg_tracks t JOIN public.rg_track_artists ta ON ta.track_id=t.id
    WHERE t.id=p.track_id AND t.status='published' AND ta.artist_id=p.artist_id AND ta.role='primary')
 THEN RAISE EXCEPTION 'publication_unverified'; END IF;
 -- Same lock namespace as the deployed wallet/Beat Pass debits.
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text,1));
 SELECT * INTO a FROM public.rg_publication_awards WHERE track_id=p.track_id;
 IF FOUND THEN RETURN jsonb_build_object('status',a.result,'points',a.amount_rg,'creditedRg',a.amount_rg,'scoreId',a.score_event_id,'ledgerId',a.coin_ledger_id); END IF;
 SELECT * INTO c FROM public.rg_economy_config WHERE id=true;
 SELECT id INTO sid FROM public.rg_score_events WHERE event_type='TRACK_PUBLISHED' AND track_id=p.track_id;
 IF sid IS NOT NULL OR c.publication_rewards_started_at IS NULL OR p.published_at<c.publication_rewards_started_at THEN
  IF sid IS NULL THEN
   SELECT public.rg_record_score_event_legacy('TRACK_PUBLISHED',p.artist_id,p.track_id,t.beat_id,p.id,'rg_publication_link',p.id::text) INTO sid FROM public.rg_tracks t WHERE t.id=p.track_id;
  END IF;
  RETURN jsonb_build_object('status','legacy','scoreId',sid,'points',(SELECT score_points FROM public.rg_score_events WHERE id=sid),'creditedRg',0);
 END IF;
 IF NOT c.publication_rewards_enabled THEN RAISE EXCEPTION 'publication_rewards_disabled'; END IF;
 IF j.audio_sha256 IS NULL THEN RAISE EXCEPTION 'publication_audio_unverified'; END IF;
 PERFORM public.rg_ensure_seasons(now());
 SELECT * INTO s FROM public.rg_seasons WHERE p.published_at>=starts_at AND p.published_at<ends_at FOR SHARE;
 IF NOT FOUND OR s.status NOT IN('active','ended') OR p.published_at>clock_timestamp() THEN RAISE EXCEPTION 'publication_season_unavailable'; END IF;
 b:=s.starts_at+floor(extract(epoch FROM(p.published_at-s.starts_at))/43200)*interval '12 hours';
 SELECT count(*)+1 INTO n FROM public.rg_publication_awards WHERE user_id=u AND block_start=b AND result='awarded';
 outcome:=CASE WHEN EXISTS(SELECT 1 FROM public.rg_publication_awards WHERE user_id=u AND audio_sha256=j.audio_sha256 AND result='awarded') THEN 'duplicate_audio'
  WHEN n>3 THEN 'limit_reached' ELSE 'awarded' END;
 pts:=CASE WHEN outcome<>'awarded' THEN 0 WHEN n=1 THEN 23 WHEN n=2 THEN 7 ELSE 4 END;
 IF pts>0 THEN
  INSERT INTO public.rg_score_events(season_id,event_type,category,artist_id,track_id,beat_id,publication_id,source_type,source_id,score_points,rules_version,verified_at,evidence)
   SELECT s.id,'TRACK_PUBLISHED','CREATION',p.artist_id,p.track_id,t.beat_id,p.id,'rg_publication_link',p.id::text,pts,3,p.published_at,
    jsonb_build_object('block_start',b,'ordinal',n,'user_id',u) FROM public.rg_tracks t WHERE t.id=p.track_id RETURNING id INTO sid;
  INSERT INTO public.rg_coin_ledger(user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,season_id,metadata)
   VALUES(u,p.artist_id,pts,'EARNED_RG','Publicación verificada · '||pts||' RG','verified_activity',sid::text,'publication-v3:'||p.track_id,s.id,jsonb_build_object('publication_id',p.id,'ordinal',n,'block_start',b)) RETURNING id INTO lid;
 END IF;
 INSERT INTO public.rg_publication_awards(publication_id,track_id,user_id,artist_id,season_id,block_start,ordinal,amount_rg,audio_sha256,score_event_id,coin_ledger_id,result)
  VALUES(p.id,p.track_id,u,p.artist_id,s.id,b,CASE WHEN pts>0 THEN n ELSE 0 END,pts,j.audio_sha256,sid,lid,outcome);
 RETURN jsonb_build_object('status',outcome,'points',pts,'creditedRg',pts,'scoreId',sid,'ledgerId',lid);
END $$;

-- Keep the old RPC signature for collectors and any in-flight deployment.
ALTER FUNCTION public.rg_record_score_event(text,uuid,uuid,uuid,uuid,text,text,text,timestamptz,jsonb) RENAME TO rg_record_score_event_legacy;
CREATE FUNCTION public.rg_record_score_event(p_event_type text,p_artist_id uuid,p_track_id uuid,p_beat_id uuid,p_publication_id uuid,p_source_type text,p_source_id text,p_milestone_key text DEFAULT NULL,p_verified_at timestamptz DEFAULT now(),p_evidence jsonb DEFAULT '{}') RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE r jsonb; BEGIN
 IF p_event_type='TRACK_PUBLISHED' AND EXISTS(SELECT 1 FROM public.rg_publication_links p JOIN public.rg_economy_config c ON c.id=true WHERE p.id=p_publication_id AND p.published_at>=c.publication_rewards_started_at) THEN
  IF NOT EXISTS(SELECT 1 FROM public.rg_publication_links p JOIN public.rg_tracks t ON t.id=p.track_id WHERE p.id=p_publication_id AND p.artist_id=p_artist_id AND p.track_id=p_track_id AND t.beat_id IS NOT DISTINCT FROM p_beat_id)
   OR p_source_type<>'rg_publication_link' OR p_source_id<>p_publication_id::text THEN RAISE EXCEPTION 'publication_unverified'; END IF;
  r:=public.rg_reward_publication(p_publication_id); RETURN (r->>'scoreId')::uuid;
 END IF;
 RETURN public.rg_record_score_event_legacy(p_event_type,p_artist_id,p_track_id,p_beat_id,p_publication_id,p_source_type,p_source_id,p_milestone_key,p_verified_at,p_evidence);
END $$;
CREATE FUNCTION public.rg_award_verified_activity(p_score_event_id uuid) RETURNS uuid
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT coin_ledger_id FROM public.rg_publication_awards WHERE score_event_id=p_score_event_id AND result='awarded' $$;

CREATE FUNCTION public.rg_transfer_wallet(p_sender_id uuid,p_artist_slug text,p_amount_rg bigint,p_request_key uuid) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE recipient uuid; artist uuid; tid uuid; old public.rg_wallet_transfers%ROWTYPE; bal bigint;
BEGIN
 IF p_amount_rg IS NULL OR p_amount_rg<=0 OR p_amount_rg>9007199254740991 OR p_request_key IS NULL THEN RAISE EXCEPTION 'invalid_transfer'; END IF;
 SELECT id,user_id INTO artist,recipient FROM public.rg_artists WHERE slug=p_artist_slug AND status='active';
 IF recipient IS NULL OR recipient=p_sender_id THEN RAISE EXCEPTION 'recipient_unavailable'; END IF;
 -- Deterministic ordering prevents opposing concurrent transfers deadlocking.
 PERFORM pg_advisory_xact_lock(hashtextextended(least(p_sender_id::text,recipient::text),1));
 PERFORM pg_advisory_xact_lock(hashtextextended(greatest(p_sender_id::text,recipient::text),1));
 SELECT * INTO old FROM public.rg_wallet_transfers WHERE sender_id=p_sender_id AND request_key=p_request_key;
 IF FOUND THEN
  IF old.artist_id<>artist OR old.amount_rg<>p_amount_rg THEN RAISE EXCEPTION 'transfer_request_conflict'; END IF;
  RETURN old.id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rg_economy_config WHERE id=true AND wallet_v3_enabled AND wallet_transfers_enabled) THEN RAISE EXCEPTION 'wallet_transfers_disabled'; END IF;
 SELECT coalesce(sum(amount),0)::bigint INTO bal FROM public.rg_coin_ledger WHERE user_id=p_sender_id;
 IF bal<p_amount_rg THEN RAISE EXCEPTION 'insufficient_rg'; END IF;
 INSERT INTO public.rg_wallet_transfers(sender_id,recipient_id,artist_id,amount_rg,request_key) VALUES(p_sender_id,recipient,artist,p_amount_rg,p_request_key) RETURNING id INTO tid;
 INSERT INTO public.rg_coin_ledger(user_id,artist_id,amount,origin_type,reason,source_type,source_id,idempotency_key,metadata) VALUES
  (p_sender_id,NULL,-p_amount_rg,'TRANSFER_OUT','Envío a @'||p_artist_slug,'wallet_transfer',tid::text,'transfer:'||tid||':out',jsonb_build_object('artist_slug',p_artist_slug)),
  (recipient,artist,p_amount_rg,'TRANSFER_IN','RG recibidos','wallet_transfer',tid::text,'transfer:'||tid||':in',jsonb_build_object('artist_slug',p_artist_slug));
 RETURN tid;
END $$;

CREATE FUNCTION public.rg_credit_wallet_topup(p_topup_id uuid,p_session_id text,p_payment_intent_id text,p_amount_cents integer,p_currency text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE t public.rg_wallet_topups%ROWTYPE; BEGIN
 SELECT * INTO t FROM public.rg_wallet_topups WHERE id=p_topup_id FOR UPDATE;
 IF NOT FOUND OR t.stripe_session_id IS DISTINCT FROM p_session_id OR t.amount_cents IS DISTINCT FROM p_amount_cents OR p_currency IS DISTINCT FROM 'usd'
  OR p_payment_intent_id IS NULL OR p_payment_intent_id NOT LIKE 'pi_%' THEN RAISE EXCEPTION 'topup_payment_mismatch'; END IF;
 IF t.stripe_payment_intent_id IS NOT NULL AND t.stripe_payment_intent_id<>p_payment_intent_id THEN RAISE EXCEPTION 'topup_payment_mismatch'; END IF;
 IF t.status IN('credited','reversed') THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.user_id::text,1));
 INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key,metadata)
  VALUES(t.user_id,t.amount_rg,'PURCHASED_RG','Compra de RG','wallet_topup',t.id::text,'topup:'||t.id,jsonb_build_object('amount_cents',t.amount_cents,'currency','usd'));
 IF t.reversed_rg>0 THEN
  INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key)
   VALUES(t.user_id,-t.reversed_rg,'PURCHASE_REVERSAL','Ajuste por reembolso o disputa','wallet_topup_reversal',t.id||':'||t.reversed_rg,'topup-reversal:'||t.id||':'||t.reversed_rg);
 END IF;
 UPDATE public.rg_wallet_topups SET status='credited',stripe_payment_intent_id=p_payment_intent_id,credited_at=now() WHERE id=t.id;
 RETURN true;
END $$;
-- Cumulative Stripe refund amounts plus disputes are reconciled exactly once.
-- A spent/transferred top-up can create debt; it cannot erase the chargeback.
CREATE FUNCTION public.rg_reconcile_wallet_topup(p_topup_id uuid,p_refunded_cents integer DEFAULT NULL,p_dispute_cents integer DEFAULT NULL,p_event_created bigint DEFAULT NULL) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
 DECLARE t public.rg_wallet_topups%ROWTYPE; target bigint; delta bigint; revision integer; BEGIN
 SELECT * INTO t FROM public.rg_wallet_topups WHERE id=p_topup_id FOR UPDATE;
 IF NOT FOUND OR (p_refunded_cents IS NULL AND p_dispute_cents IS NULL)
  OR p_refunded_cents<0 OR p_refunded_cents>t.amount_cents OR p_dispute_cents<0 OR p_dispute_cents>t.amount_cents
  OR (p_dispute_cents IS NOT NULL AND (p_event_created IS NULL OR p_event_created<=0)) THEN RAISE EXCEPTION 'topup_reversal_mismatch'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(t.user_id::text,1));
 IF p_refunded_cents IS NOT NULL THEN t.refunded_rg:=greatest(t.refunded_rg,p_refunded_cents); END IF;
 IF p_dispute_cents IS NOT NULL AND (p_event_created>t.dispute_event_created OR (p_event_created=t.dispute_event_created AND NOT t.dispute_closed)) THEN
  t.dispute_rg:=p_dispute_cents; t.dispute_event_created:=p_event_created; t.dispute_closed:=(p_dispute_cents=0);
 END IF;
 target:=least(t.amount_rg,t.refunded_rg+t.dispute_rg); delta:=target-t.reversed_rg; revision:=t.adjustment_revision+1;
 IF delta<>0 AND t.credited_at IS NOT NULL THEN
  INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key)
   VALUES(t.user_id,-delta,'PURCHASE_REVERSAL',CASE WHEN delta<0 THEN 'Reintegro por disputa resuelta' ELSE 'Ajuste por reembolso o disputa' END,
    'wallet_topup_adjustment',t.id||':'||revision,'topup-adjustment:'||t.id||':'||revision);
 END IF;
 UPDATE public.rg_wallet_topups SET reversed_rg=target,refunded_rg=t.refunded_rg,dispute_rg=t.dispute_rg,
  dispute_event_created=t.dispute_event_created,dispute_closed=t.dispute_closed,adjustment_revision=revision,
  status=CASE WHEN target=amount_rg THEN 'reversed' WHEN credited_at IS NOT NULL THEN 'credited' ELSE 'pending' END WHERE id=t.id;
 RETURN delta<>0;
END $$;
CREATE FUNCTION public.rg_reverse_wallet_topup(p_topup_id uuid,p_reversed_cents integer) RETURNS boolean
 LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$ SELECT public.rg_reconcile_wallet_topup(p_topup_id,p_reversed_cents,NULL,NULL) $$;

CREATE FUNCTION public.rg_wallet_reward_status(p_user_id uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
 DECLARE s public.rg_seasons%ROWTYPE; b timestamptz; n integer; pts bigint; BEGIN
 SELECT * INTO s FROM public.rg_seasons WHERE id=public.rg_ensure_seasons(now());
 b:=s.starts_at+floor(extract(epoch FROM(now()-s.starts_at))/43200)*interval '12 hours';
 SELECT count(*) INTO n FROM public.rg_publication_awards WHERE user_id=p_user_id AND block_start=b AND result='awarded';
 SELECT coalesce(sum(e.score_points),0)::bigint INTO pts FROM public.rg_score_events e JOIN public.rg_artists a ON a.id=e.artist_id WHERE a.user_id=p_user_id AND e.season_id=s.id;
 RETURN jsonb_build_object('serverTime',now(),'rewarded',n,'remaining',greatest(0,3-n),'nextReward',CASE n WHEN 0 THEN 23 WHEN 1 THEN 7 WHEN 2 THEN 4 ELSE 0 END,
  'blockStart',b,'resetsAt',b+interval '12 hours','seasonPoints',pts,'seasonNumber',s.season_number);
END $$;

CREATE FUNCTION public.rg_reserve_wallet_checkout(p_user_id uuid,p_intent_id uuid) RETURNS bigint
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ DECLARE i public.commerce_checkout_intents%ROWTYPE; r public.rg_wallet_redemptions%ROWTYPE; amount bigint; bal bigint; lid uuid; BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,1));
 SELECT * INTO i FROM public.commerce_checkout_intents WHERE id=p_intent_id FOR UPDATE;
 IF NOT FOUND OR i.buyer_auth_user_id IS DISTINCT FROM p_user_id OR i.recipient_mode<>'self'
  OR i.snapshot->>'kind'<>'rg_wallet' OR i.snapshot->>'paymentMethod'<>'rg_wallet' OR (i.snapshot->>'totalAmountCents')::bigint<>0 OR i.snapshot->>'currency'<>'usd' THEN RAISE EXCEPTION 'wallet_checkout_invalid'; END IF;
 SELECT * INTO r FROM public.rg_wallet_redemptions WHERE intent_id=p_intent_id;
 IF FOUND THEN RETURN r.amount_rg; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.rg_economy_config WHERE id=true AND wallet_v3_enabled AND redemption_enabled) THEN RAISE EXCEPTION 'wallet_redemption_disabled'; END IF;
 IF i.state<>'awaiting_payment' OR jsonb_array_length(i.snapshot->'items')<1 THEN RAISE EXCEPTION 'wallet_checkout_invalid'; END IF;
 amount:=(i.snapshot->>'rgAmount')::bigint;
 IF amount IS NULL OR amount<=0 OR amount IS DISTINCT FROM (SELECT sum(round((x->>'catalogUnitPrice')::numeric*100)) FROM jsonb_array_elements(i.snapshot->'items') x)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(i.snapshot->'items') x WHERE (x->>'unitPrice')::numeric<>0 OR x->>'licenseTier' NOT IN('mp3','wav','unlimited')) THEN RAISE EXCEPTION 'wallet_checkout_invalid'; END IF;
 SELECT coalesce(sum(l.amount),0)::bigint INTO bal FROM public.rg_coin_ledger l WHERE user_id=p_user_id;
 IF bal<amount THEN RAISE EXCEPTION 'insufficient_rg'; END IF;
 INSERT INTO public.rg_coin_ledger(user_id,amount,origin_type,reason,source_type,source_id,idempotency_key)
  VALUES(p_user_id,-amount,'REDEMPTION','Licencia de beat con RG','wallet_checkout',p_intent_id::text,'wallet-checkout:'||p_intent_id) RETURNING id INTO lid;
 INSERT INTO public.rg_wallet_redemptions(intent_id,user_id,amount_rg,debit_ledger_id) VALUES(p_intent_id,p_user_id,amount,lid);
 RETURN amount;
END $$;
CREATE FUNCTION public.rg_consume_wallet_checkout(p_intent_id uuid,p_order_id uuid) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order_id AND status='completed' AND stripe_checkout_session_id='rgwallet:'||p_intent_id::text) THEN RAISE EXCEPTION 'wallet_order_unverified'; END IF;
 UPDATE public.rg_wallet_redemptions SET status='consumed',order_id=p_order_id,consumed_at=coalesce(consumed_at,now()) WHERE intent_id=p_intent_id AND (order_id IS NULL OR order_id=p_order_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'wallet_reservation_unavailable'; END IF;
 RETURN true;
END $$;

DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure AS sig FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('rg_reward_publication','rg_record_score_event','rg_award_verified_activity','rg_transfer_wallet','rg_credit_wallet_topup','rg_reconcile_wallet_topup','rg_reverse_wallet_topup','rg_reserve_wallet_checkout','rg_consume_wallet_checkout','rg_wallet_reward_status') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.sig);
 END LOOP;
END $$;
-- Activation is deliberately separate so in-flight uploads keep their old rules.
NOTIFY pgrst,'reload schema';
COMMIT;
