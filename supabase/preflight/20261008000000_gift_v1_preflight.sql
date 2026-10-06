-- Read-only gate for 20261008000000_gift_v1.sql. Returns schema checks and
-- aggregate reconciliation facts only; it does not read personal/order rows.
WITH required_columns(table_name,column_name,expected_type) AS (
  VALUES
    ('purchases','license_id','text'),('purchases','contract_version','text'),
    ('commerce_checkout_intents','recipient_mode','text'),('commerce_checkout_intents','recipient_kind','text'),
    ('commerce_checkout_intents','recipient_email','text'),('commerce_checkout_intents','recipient_artist_id','uuid'),
    ('commerce_checkout_intents','snapshot','jsonb'),('commerce_checkout_intents','state','text'),
    ('beat_gifts','intent_id','uuid'),('beat_gifts','order_id','uuid'),('beat_gifts','order_item_id','uuid'),
    ('beat_gifts','recipient_email','text'),('beat_gifts','status','text'),('beat_gifts','payment_status','text'),
    ('beat_gifts','claim_email_count','integer'),('beat_gifts','claim_token_generation','integer'),
    ('gift_claim_tokens','gift_id','uuid'),('gift_claim_tokens','token_hash','text'),('gift_claim_tokens','expires_at','timestamp with time zone'),
    ('gift_claim_contexts','claim_token_hash','text'),('gift_claim_contexts','expires_at','timestamp with time zone'),
    ('beat_exclusive_inventory','beat_id','uuid'),('beat_exclusive_inventory','order_item_id','uuid'),('beat_exclusive_inventory','state','text'),
    ('commerce_studio_access_grants','source_type','text'),('commerce_studio_access_grants','source_id','uuid'),
    ('commerce_studio_access_grants','prior_until','timestamp with time zone'),('commerce_studio_access_grants','grant_days','integer'),
    ('commerce_studio_access_grants','revoked_at','timestamp with time zone'),
    ('transactional_email_jobs','source_type','text'),('transactional_email_jobs','source_id','uuid'),
    ('transactional_email_jobs','message_type','text'),('transactional_email_jobs','encrypted_secret','text'),('transactional_email_jobs','status','text'),
    ('stripe_event_processing','event_id','text'),('stripe_event_processing','status','text'),('stripe_event_processing','lease_token','uuid')
), actual AS (
  SELECT r.*,c.data_type actual_type,c.udt_name
  FROM required_columns r LEFT JOIN information_schema.columns c
    ON c.table_schema='public' AND c.table_name=r.table_name AND c.column_name=r.column_name
), checks AS (
  SELECT 'required_column:'||table_name||'.'||column_name check_name,
    coalesce(actual_type||coalesce(' ('||udt_name||')',''),'MISSING') actual,
    CASE WHEN actual_type IS NULL THEN false
      WHEN expected_type='timestamp with time zone' THEN udt_name='timestamptz'
      WHEN expected_type='uuid' THEN udt_name='uuid'
      WHEN expected_type='integer' THEN udt_name='int4'
      ELSE actual_type=expected_type END ready
  FROM actual
  UNION ALL
  SELECT 'private_table_rls:'||table_name,
    coalesce((SELECT 'rls='||c.relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=table_name),'MISSING'),
    coalesce((SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=table_name),false)
  FROM (VALUES ('beat_gifts'),('gift_claim_tokens'),('gift_claim_contexts'),('transactional_email_jobs'),('commerce_rate_limits')) t(table_name)
  UNION ALL
  SELECT 'no_direct_client_table_access:'||table_name,
    'anon='||has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE')::text||
      ',authenticated='||has_table_privilege('authenticated','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE')::text,
    NOT has_table_privilege('anon','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE') AND
      NOT has_table_privilege('authenticated','public.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
  FROM (VALUES ('beat_gifts'),('gift_claim_tokens'),('gift_claim_contexts'),('transactional_email_jobs'),('commerce_rate_limits')) t(table_name)
  UNION ALL
  SELECT 'exclusive_inventory_unique_beat',coalesce(string_agg(pg_get_indexdef(i.indexrelid),'; '),'MISSING'),
    coalesce(bool_or(i.indisunique AND pg_get_indexdef(i.indexrelid) LIKE '%(beat_id)%'),false)
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='beat_exclusive_inventory'
  UNION ALL
  SELECT 'studio_grant_idempotency_unique_source',coalesce(string_agg(pg_get_indexdef(i.indexrelid),'; '),'MISSING'),
    coalesce(bool_or(i.indisunique AND pg_get_indexdef(i.indexrelid) LIKE '%(source_type, source_id)%'),false)
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='commerce_studio_access_grants'
  UNION ALL
  SELECT 'stripe_event_idempotency_unique_event',coalesce(string_agg(pg_get_indexdef(i.indexrelid),'; '),'MISSING'),
    coalesce(bool_or(i.indisunique AND pg_get_indexdef(i.indexrelid) LIKE '%(event_id)%'),false)
  FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname='stripe_event_processing'
  UNION ALL
  SELECT 'auth_customer_email_ambiguities',
    'ambiguous_email_groups='||count(*)::text,
    count(*)=0
  FROM (SELECT lower(btrim(email)) FROM public.customers GROUP BY lower(btrim(email)) HAVING count(*)>1) duplicates
)
SELECT check_name,actual,ready FROM checks ORDER BY check_name;
