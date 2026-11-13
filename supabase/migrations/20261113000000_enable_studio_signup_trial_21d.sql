-- Re-enable the automatic Studio signup trial with 21 days (14 days + 7 extra days).
-- After the free trial expires, users must purchase a Studio pass or earn Premium
-- through RG publication/season rewards.

BEGIN;

INSERT INTO public.studio_signup_campaign (id, starts_at, ends_at, enabled, grant_days)
VALUES (1, now(), now() + interval '3650 days', true, 21)
ON CONFLICT (id) DO UPDATE
SET enabled = true,
    grant_days = 21,
    starts_at = now(),
    ends_at = now() + interval '3650 days';

DROP TRIGGER IF EXISTS studio_signup_access ON auth.users;
CREATE TRIGGER studio_signup_access
  AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.rg_on_signup_studio_access();

DROP FUNCTION IF EXISTS public.rg_signup_studio_campaign_status();
CREATE FUNCTION public.rg_signup_studio_campaign_status()
RETURNS TABLE(
  active boolean,
  starts_at timestamptz,
  ends_at timestamptz,
  server_time timestamptz,
  grant_days integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (c.enabled AND c.grant_days > 0 AND now() >= c.starts_at AND now() < c.ends_at),
         c.starts_at,
         c.ends_at,
         now(),
         c.grant_days
  FROM public.studio_signup_campaign c
  WHERE c.id = 1;
$$;
REVOKE ALL ON FUNCTION public.rg_signup_studio_campaign_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_signup_studio_campaign_status() TO service_role;

COMMIT;
