-- Read-only gate for 20261007000000_commerce_security_gift_foundation.sql.
-- It reports aggregate/schema facts only; it never returns customer or order data.
WITH required_columns(table_name,column_name,expected_type) AS (
  VALUES
    ('customers','id','uuid'),('customers','email','text'),('customers','name','text'),
    ('customers','updated_at','timestamp with time zone'),('customers','studio_access_until','timestamp with time zone'),
    ('orders','id','uuid'),('orders','customer_id','uuid'),('orders','stripe_checkout_session_id','text'),
    ('orders','stripe_payment_intent_id','text'),('orders','status','text'),('orders','payment_status','text'),
    ('orders','currency','text'),('orders','subtotal_amount','numeric'),('orders','total_amount','numeric'),('orders','metadata','jsonb'),
    ('order_items','id','uuid'),('order_items','order_id','uuid'),('order_items','beat_id','uuid'),
    ('order_items','license_type_id','uuid'),('order_items','unit_price','numeric'),
    ('purchases','id','uuid'),('purchases','order_id','uuid'),('purchases','order_item_id','uuid'),
    ('purchases','customer_id','uuid'),('purchases','beat_id','uuid'),('purchases','license_type_id','uuid'),
    ('purchases','license_tier','text'),('purchases','status','text'),('purchases','contract_text','text'),('purchases','created_at','timestamp with time zone'),
    ('beats','id','uuid'),('beats','title','text'),('beats','published','boolean'),('beats','ranking_status','text'),('beats','current_rank','integer'),
    ('license_types','id','uuid'),('license_types','slug','text'),('license_types','name','text'),
    ('license_types','price','numeric'),('license_types','active','boolean'),
    ('beat_licenses','beat_id','uuid'),('beat_licenses','license_type_id','uuid'),('beat_licenses','active','boolean'),('beat_licenses','price_override','numeric'),
    ('rg_artists','id','uuid'),('rg_artists','user_id','uuid'),('rg_artists','stage_name','text'),
    ('rg_artists','slug','text'),('rg_artists','status','text'),
    ('auth.users','id','uuid'),('auth.users','email','character varying'),
    ('auth.users','email_confirmed_at','timestamp with time zone'),('auth.users','raw_user_meta_data','jsonb')
), actual AS (
  SELECT r.*,c.data_type actual_type,c.udt_name
    FROM required_columns r LEFT JOIN information_schema.columns c
      ON c.table_schema=split_part(r.table_name,'.',1)
     AND c.table_name=CASE WHEN position('.' in r.table_name)>0 THEN split_part(r.table_name,'.',2) ELSE r.table_name END
     AND c.column_name=r.column_name
), checks AS (
  SELECT 'required_column_type:'||table_name||'.'||column_name check_name,
    coalesce(actual_type||coalesce(' ('||udt_name||')',''),'MISSING') actual,
    CASE WHEN actual_type IS NULL THEN false
      WHEN table_name='customers' AND column_name='email' THEN actual_type IN ('text','character varying')
      WHEN table_name='auth.users' AND column_name='email' THEN actual_type='character varying'
      WHEN table_name='auth.users' AND column_name='email_confirmed_at' THEN udt_name='timestamptz'
      ELSE actual_type=CASE expected_type WHEN 'uuid' THEN 'uuid' WHEN 'text' THEN 'text' WHEN 'jsonb' THEN 'jsonb'
        WHEN 'boolean' THEN 'boolean' WHEN 'numeric' THEN 'numeric' ELSE expected_type END END ready
  FROM actual
  UNION ALL
  SELECT 'unique_customer_email',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT lower(btrim(email)) FROM public.customers GROUP BY lower(btrim(email)) HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.customers GROUP BY lower(btrim(email)) HAVING count(*)>1)
  UNION ALL
  SELECT 'historical_license_backfill_facts',
    'missing_tier='||(SELECT count(*)::text FROM public.purchases WHERE license_tier IS NULL OR btrim(license_tier)='')||
      ',missing_created_at='||(SELECT count(*)::text FROM public.purchases WHERE created_at IS NULL),
    NOT EXISTS (SELECT 1 FROM public.purchases WHERE license_tier IS NULL OR btrim(license_tier)='' OR created_at IS NULL)
  UNION ALL
  SELECT 'unique_order_stripe_session',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT stripe_checkout_session_id FROM public.orders GROUP BY stripe_checkout_session_id HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.orders GROUP BY stripe_checkout_session_id HAVING count(*)>1)
  UNION ALL
  SELECT 'unique_order_stripe_payment_intent',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT stripe_payment_intent_id FROM public.orders WHERE stripe_payment_intent_id IS NOT NULL GROUP BY stripe_payment_intent_id HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.orders WHERE stripe_payment_intent_id IS NOT NULL GROUP BY stripe_payment_intent_id HAVING count(*)>1)
  UNION ALL
  SELECT 'unique_order_items_commercial_line',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT order_id,beat_id,license_type_id FROM public.order_items GROUP BY order_id,beat_id,license_type_id HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.order_items GROUP BY order_id,beat_id,license_type_id HAVING count(*)>1)
  UNION ALL
  SELECT 'unique_purchases_commercial_line',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT order_id,beat_id,license_type_id FROM public.purchases GROUP BY order_id,beat_id,license_type_id HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.purchases GROUP BY order_id,beat_id,license_type_id HAVING count(*)>1)
  UNION ALL
  SELECT 'orders_status_allows_processing',coalesce((SELECT string_agg(pg_get_constraintdef(oid),'; ') FROM pg_constraint
    WHERE conrelid='public.orders'::regclass AND contype='c' AND pg_get_constraintdef(oid) ~* '(^|[^[:alnum:]_])status([^[:alnum:]_]|$)'),'no_status_check'),
    NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.orders'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) ~* '(^|[^[:alnum:]_])status([^[:alnum:]_]|$)' AND pg_get_constraintdef(oid) NOT ILIKE '%processing%')
  UNION ALL
  SELECT 'unique_historical_exclusive_entitlement_per_beat',coalesce((SELECT 'count='||count(*)::text FROM (
    SELECT beat_id FROM public.purchases WHERE license_tier='exclusive' AND status='active' GROUP BY beat_id HAVING count(*)>1
  ) d),'count=0'),NOT EXISTS (SELECT 1 FROM public.purchases WHERE license_tier='exclusive' AND status='active' GROUP BY beat_id HAVING count(*)>1)
  UNION ALL
  SELECT 'commerce_tables_rls',coalesce((SELECT string_agg(relname||':'||relrowsecurity,',') FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY(ARRAY['customers','orders','order_items','purchases'])), 'missing'),
    (SELECT count(*)=4 AND bool_and(relrowsecurity) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['customers','orders','order_items','purchases']))
)
SELECT check_name,actual,ready FROM checks ORDER BY check_name;
