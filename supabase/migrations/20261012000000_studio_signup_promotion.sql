BEGIN;

-- The 30-day window starts once, when this migration is first applied.
-- Reapplying it must never restart the offer or extend existing grants.
CREATE TABLE IF NOT EXISTS public.studio_signup_campaign (
  id smallint PRIMARY KEY CHECK (id = 1),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  CHECK (ends_at = starts_at + interval '720 hours')
);
INSERT INTO public.studio_signup_campaign(id, starts_at, ends_at)
VALUES (1, now(), now() + interval '720 hours') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.studio_signup_grants (
  -- Preserve deduplication if an account is deleted and recreated.
  user_id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email))),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  access_until timestamptz
);
ALTER TABLE public.studio_signup_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_signup_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.studio_signup_campaign, public.studio_signup_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.studio_signup_campaign, public.studio_signup_grants TO service_role;

CREATE OR REPLACE FUNCTION public.rg_grant_signup_studio_access(p_user_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET timezone = 'UTC' AS $$
DECLARE
  v_user auth.users%ROWTYPE;
  v_customer uuid;
  v_grant uuid;
  v_until timestamptz;
BEGIN
  SELECT * INTO v_user FROM auth.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_user.email_confirmed_at IS NULL OR nullif(btrim(v_user.email), '') IS NULL THEN
    RETURN NULL;
  END IF;
  -- Eligibility uses the real Auth creation time, never editable user metadata.
  -- Confirmation can happen after the campaign ends without losing the offer.
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_signup_campaign
    WHERE id = 1 AND v_user.created_at >= starts_at AND v_user.created_at < ends_at
  ) THEN RETURN NULL; END IF;

  IF EXISTS (SELECT 1 FROM public.studio_signup_grants
    WHERE user_id = p_user_id OR email = lower(btrim(v_user.email))) THEN RETURN NULL; END IF;

  v_customer := public.rg_commerce_link_verified_customer(p_user_id);
  INSERT INTO public.studio_signup_grants(user_id, email, customer_id)
  VALUES (p_user_id, lower(btrim(v_user.email)), v_customer)
  ON CONFLICT DO NOTHING RETURNING user_id INTO v_grant;
  IF v_grant IS NULL THEN RETURN NULL; END IF;

  -- Existing paid/gift access is preserved; this shared RPC serializes extensions.
  v_until := public.rg_extend_studio_access(v_customer, 90);
  UPDATE public.studio_signup_grants SET access_until = v_until WHERE user_id = p_user_id;
  RETURN v_until;
END $$;
REVOKE ALL ON FUNCTION public.rg_grant_signup_studio_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_grant_signup_studio_access(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.rg_on_signup_studio_access()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM public.rg_grant_signup_studio_access(NEW.id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.rg_on_signup_studio_access() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS studio_signup_access ON auth.users;
CREATE TRIGGER studio_signup_access AFTER INSERT OR UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.rg_on_signup_studio_access();

CREATE OR REPLACE FUNCTION public.rg_signup_studio_campaign_status()
RETURNS TABLE(active boolean, starts_at timestamptz, ends_at timestamptz, server_time timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT now() >= c.starts_at AND now() < c.ends_at, c.starts_at, c.ends_at, now()
  FROM public.studio_signup_campaign c WHERE c.id = 1;
$$;
REVOKE ALL ON FUNCTION public.rg_signup_studio_campaign_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rg_signup_studio_campaign_status() TO service_role;

COMMIT;
