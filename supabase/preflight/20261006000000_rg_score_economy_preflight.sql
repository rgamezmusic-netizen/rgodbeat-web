-- READ ONLY. Run this query once in the configured Supabase SQL Editor.
-- Every ready value must be TRUE. No migration, data writes or helper RPC execution.
WITH required_columns(schema_name,table_name,column_name,type_name) AS (
  VALUES
  ('auth','users','id','uuid'),
  ('auth','users','email','text'),
  ('public','customers','id','uuid'),
  ('public','customers','email','text'),
  ('public','customers','name','text'),
  ('public','customers','studio_access_until','timestamp with time zone'),
  ('public','customers','updated_at','timestamp with time zone'),
  ('public','beats','id','uuid'),
  ('public','beats','title','text'),
  ('public','beats','slug','text'),
  ('public','beats','cover_path','text'),
  ('public','beats','published','boolean'),
  ('public','rg_artists','id','uuid'),
  ('public','rg_artists','user_id','uuid'),
  ('public','rg_artists','stage_name','text'),
  ('public','rg_artists','slug','text'),
  ('public','rg_artists','status','text'),
  ('public','rg_tracks','id','uuid'),
  ('public','rg_tracks','title','text'),
  ('public','rg_tracks','beat_id','uuid'),
  ('public','rg_tracks','status','text'),
  ('public','rg_track_artists','track_id','uuid'),
  ('public','rg_track_artists','artist_id','uuid'),
  ('public','rg_track_artists','role','text'),
  ('public','rg_publication_links','id','uuid'),
  ('public','rg_publication_links','track_id','uuid'),
  ('public','rg_publication_links','artist_id','uuid'),
  ('public','rg_publication_links','youtube_export_job_id','uuid'),
  ('public','rg_publication_links','youtube_video_id','text'),
  ('public','rg_publication_links','published_by_user_id','uuid'),
  ('public','rg_publication_links','published_at','timestamp with time zone'),
  ('public','youtube_export_jobs','id','uuid'),
  ('public','youtube_export_jobs','user_id','uuid'),
  ('public','youtube_export_jobs','status','text'),
  ('public','youtube_export_jobs','youtube_video_id','text'),
  ('public','youtube_export_jobs','finished_at','timestamp with time zone'),
  ('public','youtube_channel_settings','id','smallint'),
  ('public','youtube_channel_settings','channel_id','text'),
  ('public','youtube_channel_settings','encrypted_refresh_token','text'),
  ('public','orders','id','uuid'),
  ('public','orders','customer_id','uuid'),
  ('public','orders','stripe_checkout_session_id','text'),
  ('public','orders','payment_status','text'),
  ('public','order_items','id','uuid'),
  ('public','order_items','order_id','uuid'),
  ('public','order_items','beat_id','uuid'),
  ('public','order_items','license_type_id','uuid'),
  ('public','purchases','id','uuid'),
  ('public','purchases','customer_id','uuid'),
  ('public','purchases','beat_id','uuid'),
  ('public','purchases','order_id','uuid'),
  ('public','purchases','order_item_id','uuid'),
  ('public','license_types','id','uuid'),
  ('public','beat_licenses','id','uuid'),
  ('public','beat_votes','beat_id','uuid'),
  ('public','beat_comments','beat_id','uuid'),
  ('public','beat_ranking_history','id','uuid')
), new_relations(name) AS (
  VALUES ('rg_seasons'), ('rg_economy_config'), ('rg_rule_versions'), ('rg_score_events'), ('rg_youtube_metric_snapshots'), ('rg_rank_snapshot_runs'), ('rg_rank_snapshots'), ('rg_coin_ledger'), ('rg_sponsors'), ('rg_support_cycles'), ('rg_reward_pool_transactions'), ('rg_season_sponsorships'), ('rg_season_finalizations'), ('rg_season_rewards'), ('rg_coin_balances'), ('rg_reward_pool_totals'), ('rg_seasons_one_active'), ('rg_seasons_window'), ('rg_score_track_published_once'), ('rg_score_youtube_milestone_once'), ('rg_score_season_artist'), ('rg_score_season_track'), ('rg_score_season_beat'), ('rg_youtube_metrics_recent'), ('rg_rank_one_final_run'), ('rg_rank_one_daily_run'), ('rg_rank_snapshots_entity'), ('rg_coin_ledger_user_created'), ('rg_coin_ledger_season'), ('rg_support_cycle_user_unique'), ('rg_support_cycle_sponsor_unique'), ('rg_pool_season_created'), ('rg_sponsorship_season_active')
), new_functions(name) AS (
  VALUES ('rg_ensure_seasons'), ('rg_record_score_event'), ('rg_credit_coins'), ('rg_current_rank_totals'), ('rg_capture_rank_snapshot'), ('rg_contribute_to_pool'), ('rg_finalize_season'), ('rg_extend_studio_access'), ('rg_reject_ledger_mutation'), ('rg_preserve_finalized_season')
), checks(check_name,ready) AS (
  SELECT 'column:'||r.schema_name||'.'||r.table_name||'.'||r.column_name,
    EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname=r.schema_name AND c.relname=r.table_name AND a.attname=r.column_name
        AND a.attnum>0 AND NOT a.attisdropped AND pg_catalog.format_type(a.atttypid,a.atttypmod)=r.type_name)
    FROM required_columns r
  UNION ALL SELECT 'absent:public.'||name, to_regclass('public.'||name) IS NULL FROM new_relations
  UNION ALL SELECT 'function_absent:public.'||f.name, NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=f.name) FROM new_functions f
  UNION ALL SELECT 'postgres_15_or_later',current_setting('server_version_num')::integer>=150000
  UNION ALL SELECT 'uuid_generator_available',to_regprocedure('gen_random_uuid()') IS NOT NULL
  UNION ALL SELECT 'plpgsql_available',EXISTS(SELECT 1 FROM pg_catalog.pg_language WHERE lanname='plpgsql')
  UNION ALL SELECT 'roles_ready', (SELECT count(*)=3 FROM pg_catalog.pg_roles WHERE rolname IN ('anon','authenticated','service_role'))
  UNION ALL SELECT 'service_role_bypasses_rls',EXISTS(SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='service_role' AND rolbypassrls)
  UNION ALL SELECT 'editor_can_create_public_objects',has_schema_privilege(current_user,'public','CREATE')
  UNION ALL SELECT 'editor_can_read_auth',has_schema_privilege(current_user,'auth','USAGE') AND has_table_privilege(current_user,to_regclass('auth.users'),'SELECT')
  UNION ALL SELECT 'editor_can_extend_customer_entitlement',
    has_table_privilege(current_user,to_regclass('public.customers'),'SELECT') AND
    has_table_privilege(current_user,to_regclass('public.customers'),'INSERT') AND
    has_table_privilege(current_user,to_regclass('public.customers'),'UPDATE')
  UNION ALL SELECT 'customer_insert_defaults_ready',NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
    WHERE a.attrelid=to_regclass('public.customers') AND a.attnum>0 AND NOT a.attisdropped AND a.attnotnull
      AND a.attname NOT IN ('email','name') AND a.attidentity='' AND a.attgenerated=''
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_attrdef d WHERE d.adrelid=a.attrelid AND d.adnum=a.attnum))
  UNION ALL SELECT 'customer_email_unique',EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
    ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indrelid=to_regclass('public.customers')
    AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL AND a.attname='email')
  UNION ALL SELECT 'phase1_create_track_signature',to_regprocedure('public.create_rg_track(uuid,uuid,text,uuid)') IS NOT NULL
  UNION ALL SELECT 'phase1_record_link_signature',to_regprocedure('public.record_rg_publication_link(uuid,uuid,uuid,uuid,uuid,text)') IS NOT NULL
  UNION ALL SELECT 'youtube_job_reservation_signature',to_regprocedure('public.reserve_youtube_export_job(uuid,uuid,text,text,text)') IS NOT NULL
  UNION ALL SELECT 'phase1_rls_enabled', (SELECT count(*)=4 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('rg_artists','rg_tracks','rg_track_artists','rg_publication_links') AND c.relrowsecurity)
  UNION ALL SELECT 'phase1_artist_single_owner_index',EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
    ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indrelid=to_regclass('public.rg_artists')
    AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL AND a.attname='user_id')
  UNION ALL SELECT 'phase1_one_primary_index',EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indexrelid
    WHERE c.oid=to_regclass('public.rg_track_artists_one_primary') AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1
    AND (SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=i.indrelid AND attnum=i.indkey[0])='track_id'
    AND pg_catalog.pg_get_expr(i.indpred,i.indrelid) LIKE '%primary%')
  UNION ALL SELECT 'phase1_publication_job_unique',EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
    ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indrelid=to_regclass('public.rg_publication_links')
    AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL AND a.attname='youtube_export_job_id')
  UNION ALL SELECT 'phase1_publication_video_unique',EXISTS(SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_attribute a
    ON a.attrelid=i.indrelid AND a.attnum=i.indkey[0] WHERE i.indrelid=to_regclass('public.rg_publication_links')
    AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indpred IS NULL AND a.attname='youtube_video_id')
  UNION ALL SELECT 'editor_can_create_required_foreign_keys',NOT EXISTS(
    SELECT 1 FROM (VALUES ('auth.users'),('public.beats'),('public.rg_artists'),('public.rg_tracks'),('public.rg_publication_links')) r(name)
    WHERE NOT coalesce(has_table_privilege(current_user,to_regclass(r.name),'REFERENCES'),false))
  UNION ALL SELECT 'required_primary_keys',NOT EXISTS(
    SELECT 1 FROM (VALUES ('auth.users'),('public.customers'),('public.beats'),('public.rg_artists'),('public.rg_tracks'),('public.rg_publication_links'),('public.youtube_export_jobs')) r(name)
    WHERE NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint k WHERE k.conrelid=to_regclass(r.name) AND k.contype='p' AND cardinality(k.conkey)=1
      AND (SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=k.conrelid AND attnum=k.conkey[1])='id'))
)
SELECT check_name,coalesce(ready,false) AS ready FROM checks ORDER BY check_name;
