-- Read-only post-migration verification. Aggregate/schema facts only; no emails, UUIDs, or customer records.
WITH checks AS (
  SELECT 'purchase_license_columns' AS check_name,
    (SELECT count(*)=2 FROM information_schema.columns WHERE table_schema='public' AND table_name='purchases'
      AND column_name IN ('license_id','contract_version')) AS ready,
    (SELECT count(*)::text FROM public.purchases WHERE license_id IS NULL OR btrim(license_id)=''
      OR contract_version IS NULL OR btrim(contract_version)='') AS actual
  UNION ALL
  SELECT 'unique_purchase_license_ids',
    NOT EXISTS (SELECT 1 FROM public.purchases GROUP BY license_id HAVING count(*)>1),
    (SELECT count(*)::text FROM (SELECT license_id FROM public.purchases GROUP BY license_id HAVING count(*)>1) d)
  UNION ALL
  SELECT 'customer_auth_bridge_is_one_to_one',
    NOT EXISTS (SELECT 1 FROM public.customers WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING count(*)>1),
    (SELECT count(*)::text FROM (SELECT auth_user_id FROM public.customers WHERE auth_user_id IS NOT NULL GROUP BY auth_user_id HAVING count(*)>1) d)
  UNION ALL
  SELECT 'commerce_tables_private',
    (SELECT count(*)=9 AND bool_and(c.relrowsecurity)
       AND bool_and(NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
       AND bool_and(NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['commerce_checkout_intents','beat_exclusive_inventory','beat_gifts',
        'gift_claim_tokens','purchase_guest_access_tokens','stripe_event_processing','commerce_manual_reviews',
        'commerce_studio_access_grants','transactional_email_jobs'])),
    (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['commerce_checkout_intents','beat_exclusive_inventory','beat_gifts',
        'gift_claim_tokens','purchase_guest_access_tokens','stripe_event_processing','commerce_manual_reviews',
        'commerce_studio_access_grants','transactional_email_jobs']))
  UNION ALL
  SELECT 'private_purchase_tables',
    (SELECT count(*)=4 AND bool_and(c.relrowsecurity)
       AND bool_and(NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
       AND bool_and(NOT has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['customers','orders','order_items','purchases'])),
    (SELECT count(*)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname=ANY(ARRAY['customers','orders','order_items','purchases']))
  UNION ALL
  SELECT 'server_only_security_definer_functions',
    NOT has_function_privilege('anon','public.rg_claim_beat_gift(text,uuid,uuid,text,text)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rg_claim_beat_gift(text,uuid,uuid,text,text)','EXECUTE')
      AND has_function_privilege('service_role','public.rg_claim_beat_gift(text,uuid,uuid,text,text)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rg_commerce_link_verified_customer(uuid)','EXECUTE'),
    'claim/link RPC grants'
  UNION ALL
  SELECT 'exclusive_inventory_matches_active_entitlement',
    NOT EXISTS (SELECT 1 FROM public.purchases p LEFT JOIN public.beat_exclusive_inventory x
      ON x.beat_id=p.beat_id AND x.purchase_id=p.id
      WHERE p.license_tier='exclusive' AND p.status='active' AND x.beat_id IS NULL),
    (SELECT count(*)::text FROM public.purchases p LEFT JOIN public.beat_exclusive_inventory x
      ON x.beat_id=p.beat_id AND x.purchase_id=p.id
      WHERE p.license_tier='exclusive' AND p.status='active' AND x.beat_id IS NULL)
  UNION ALL
  SELECT 'gift_and_email_tables_empty_until_activation',
    (SELECT count(*)=0 FROM public.beat_gifts) AND (SELECT count(*)=0 FROM public.transactional_email_jobs),
    (SELECT count(*)::text FROM public.beat_gifts)||(SELECT '/'||count(*)::text FROM public.transactional_email_jobs)
  UNION ALL
  SELECT 'RG_economy_switches_remain_disabled',
    NOT coalesce((SELECT purchases_enabled OR redemption_enabled OR sponsor_fulfillment_enabled FROM public.rg_economy_config LIMIT 1),false),
    coalesce((SELECT purchases_enabled::text||'/'||redemption_enabled::text||'/'||sponsor_fulfillment_enabled::text FROM public.rg_economy_config LIMIT 1),'missing')
)
SELECT check_name,ready,actual FROM checks ORDER BY check_name;
