-- One result set also works with the CLI Management API query transport.
SELECT
  (SELECT row_to_json(s) FROM public.rg_signup_studio_campaign_status() s) AS campaign,
  EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND tgname='studio_signup_access' AND tgenabled='O' AND NOT tgisinternal
  ) AS automatic_grant_trigger_enabled,
  (SELECT json_agg(t) FROM (
    SELECT c.relname, c.relrowsecurity AS rls_enabled,
      has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS anonymous_access,
      has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') AS authenticated_access
    FROM pg_class c WHERE c.oid IN ('public.studio_signup_campaign'::regclass,'public.studio_signup_grants'::regclass)
  ) t) AS table_protection,
  (SELECT count(*) FROM public.studio_signup_grants) AS grants,
  (SELECT count(*) FROM public.studio_signup_grants WHERE access_until IS NULL) AS incomplete_grants;
