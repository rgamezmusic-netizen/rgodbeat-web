WITH checks AS (
  SELECT 'beat_pass_configuration' AS name,
    (SELECT count(*)=3 FROM information_schema.columns WHERE table_schema='public' AND table_name='rg_economy_config'
      AND column_name IN ('beat_pass_enabled','beat_pass_cost_rg','beat_pass_eligible_license_tiers')) AS pass,
    (SELECT beat_pass_enabled::text||'/'||beat_pass_cost_rg::text||'/'||array_to_string(beat_pass_eligible_license_tiers,',')
      FROM public.rg_economy_config WHERE id=true) AS detail
  UNION ALL SELECT 'pass_table_rls',
    (SELECT c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='rg_beat_passes'),
    coalesce((SELECT relrowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname='rg_beat_passes'),'missing')
  UNION ALL SELECT 'private_roles_cannot_write_passes',
    NOT has_table_privilege('anon','public.rg_beat_passes','INSERT')
      AND NOT has_table_privilege('authenticated','public.rg_beat_passes','INSERT')
      AND has_table_privilege('service_role','public.rg_beat_passes','INSERT'),
    'anon/authenticated INSERT=false; service_role INSERT='||has_table_privilege('service_role','public.rg_beat_passes','INSERT')::text
  UNION ALL SELECT 'pass_rpcs_server_only',
    NOT has_function_privilege('anon','public.rg_purchase_beat_pass(uuid,text)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rg_purchase_beat_pass(uuid,text)','EXECUTE')
      AND has_function_privilege('service_role','public.rg_purchase_beat_pass(uuid,text)','EXECUTE')
      AND NOT has_function_privilege('anon','public.rg_reserve_next_beat_pass(uuid,uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rg_reserve_next_beat_pass(uuid,uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.rg_reserve_next_beat_pass(uuid,uuid)','EXECUTE')
      AND NOT has_function_privilege('anon','public.rg_consume_beat_pass(uuid,uuid)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rg_consume_beat_pass(uuid,uuid)','EXECUTE')
      AND has_function_privilege('service_role','public.rg_consume_beat_pass(uuid,uuid)','EXECUTE'),
    'purchase/reserve/consume are service_role-only'
  UNION ALL SELECT 'coin_ledger_append_only',
    EXISTS(SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname='rg_coin_ledger' AND t.tgname='rg_coin_ledger_append_only' AND NOT t.tgisinternal),
    'existing ledger trigger retained; negative entries use REDEMPTION'
  UNION ALL SELECT 'generic_rg_redemption_unchanged',
    NOT (SELECT redemption_enabled FROM public.rg_economy_config WHERE id=true),
    'redemption_enabled='||(SELECT redemption_enabled::text FROM public.rg_economy_config WHERE id=true)
)
SELECT name,coalesce(pass,false) AS pass,coalesce(detail,'missing') AS observed FROM checks ORDER BY name;
