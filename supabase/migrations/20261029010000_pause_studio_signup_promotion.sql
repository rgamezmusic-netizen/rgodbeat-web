-- Pause the automatic 90-day free Studio signup promotion so new accounts
-- must purchase a Studio pass to unlock full Studio access.
-- Keeps the campaign table ready for a future 14-day (1 season) promotion when enabled.

BEGIN;

DO $$
DECLARE
  v_con text;
BEGIN
  IF to_regclass('public.studio_signup_campaign') IS NOT NULL THEN
    FOR v_con IN
      SELECT c.conname
      FROM pg_constraint c
      WHERE c.conrelid = 'public.studio_signup_campaign'::regclass
        AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) LIKE '%ends_at%'
    LOOP
      EXECUTE format('ALTER TABLE public.studio_signup_campaign DROP CONSTRAINT %I', v_con);
    END LOOP;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.studio_signup_campaign
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS grant_days integer NOT NULL DEFAULT 14 CHECK (grant_days >= 0 AND grant_days <= 365);

DO $$
BEGIN
  IF to_regclass('public.studio_signup_campaign') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.studio_signup_campaign'::regclass
         AND conname = 'studio_signup_campaign_window_check'
     ) THEN
    ALTER TABLE public.studio_signup_campaign
      ADD CONSTRAINT studio_signup_campaign_window_check CHECK (ends_at >= starts_at);
  END IF;
END $$;

UPDATE public.studio_signup_campaign
SET enabled = false,
    grant_days = 14,
    ends_at = GREATEST(starts_at, LEAST(ends_at, now()))
WHERE id = 1;

-- Remove the auth.users trigger while the signup promotion is paused so
-- newly registered/confirmed accounts do not receive automatic free Studio days.
DROP TRIGGER IF EXISTS studio_signup_access ON auth.users;

CREATE OR REPLACE FUNCTION public.rg_grant_signup_studio_access(p_user_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_campaign public.studio_signup_campaign%ROWTYPE;
  v_customer uuid;
  v_grant uuid;
  v_until timestamptz;
BEGIN
  SELECT * INTO v_campaign
  FROM public.studio_signup_campaign
  WHERE id = 1
    AND enabled = true
    AND grant_days > 0
    AND now() >= starts_at
    AND now() < ends_at;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_user.email_confirmed_at IS NULL OR nullif(btrim(v_user.email), '') IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_user.created_at < v_campaign.starts_at OR v_user.created_at >= v_campaign.ends_at THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.studio_signup_grants
    WHERE user_id = p_user_id OR email = lower(btrim(v_user.email))
  ) THEN
    RETURN NULL;
  END IF;

  v_customer := public.rg_commerce_link_verified_customer(p_user_id);
  INSERT INTO public.studio_signup_grants(user_id, email, customer_id)
  VALUES (p_user_id, lower(btrim(v_user.email)), v_customer)
  ON CONFLICT DO NOTHING RETURNING user_id INTO v_grant;
  IF v_grant IS NULL THEN
    RETURN NULL;
  END IF;

  v_until := public.rg_extend_studio_access(v_customer, v_campaign.grant_days);
  UPDATE public.studio_signup_grants SET access_until = v_until WHERE user_id = p_user_id;
  RETURN v_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_grant_signup_studio_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_grant_signup_studio_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_signup_studio_campaign_status()
RETURNS TABLE(active boolean, starts_at timestamptz, ends_at timestamptz, server_time timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (c.enabled AND c.grant_days > 0 AND now() >= c.starts_at AND now() < c.ends_at),
         c.starts_at,
         c.ends_at,
         now()
  FROM public.studio_signup_campaign c
  WHERE c.id = 1;
$$;
REVOKE ALL ON FUNCTION public.rg_signup_studio_campaign_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_signup_studio_campaign_status() TO service_role;

COMMIT;

