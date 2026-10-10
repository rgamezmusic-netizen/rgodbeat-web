-- Read-only readiness checks. Every ready value must be true before activation.
SELECT 'auth_creation_timestamp' AS check_name, EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'
  AND column_name='created_at' AND data_type='timestamp with time zone'
) AS ready
UNION ALL SELECT 'auth_confirmation_timestamp', EXISTS (
  SELECT 1 FROM information_schema.columns WHERE table_schema='auth' AND table_name='users'
  AND column_name='email_confirmed_at' AND data_type='timestamp with time zone'
)
UNION ALL SELECT 'verified_customer_bridge', to_regprocedure('public.rg_commerce_link_verified_customer(uuid)') IS NOT NULL
UNION ALL SELECT 'serialized_studio_extension', to_regprocedure('public.rg_extend_studio_access(uuid,integer)') IS NOT NULL
UNION ALL SELECT 'auth_trigger_privilege', has_table_privilege(current_user, 'auth.users', 'TRIGGER')
UNION ALL SELECT 'public_schema_create_privilege', has_schema_privilege(current_user, 'public', 'CREATE');
