DO $$
DECLARE
  function_oid oid;
  function_definition text;
  function_is_security_definer boolean;
  is_market_helper boolean;
BEGIN
  is_market_helper := to_regprocedure('public.rg_claim_beat_gift_license_v1(text,uuid,uuid,text,text)') IS NOT NULL;
  function_oid := CASE WHEN is_market_helper
    THEN to_regprocedure('public.rg_claim_beat_gift_license_v1(text,uuid,uuid,text,text)')
    ELSE to_regprocedure('public.rg_claim_beat_gift(text,uuid,uuid,text,text)') END;
  IF function_oid IS NULL THEN
    RAISE EXCEPTION 'active Gift V1 claim function is missing';
  END IF;

  SELECT pg_get_functiondef(function_oid), p.prosecdef
    INTO function_definition, function_is_security_definer
    FROM pg_proc p WHERE p.oid=function_oid;
  IF NOT function_is_security_definer THEN
    RAISE EXCEPTION 'gift claim function must remain SECURITY DEFINER';
  END IF;
  IF position($needle$coalesce(lower(btrim(v_gift.recipient_email)),'')<>v_email$needle$ IN function_definition)=0 THEN
    RAISE EXCEPTION 'verified normalized recipient email check is missing';
  END IF;
  IF position('v_gift.recipient_user_id<>p_user_id' IN function_definition)>0 THEN
    RAISE EXCEPTION 'stale recipient user ID check is still present';
  END IF;
  IF position('a.user_id=p_user_id' IN function_definition)=0
     OR position('a.status=''active''' IN function_definition)=0 THEN
    RAISE EXCEPTION 'active RG Artist recipient validation is missing';
  END IF;
  IF has_function_privilege('anon', function_oid, 'EXECUTE')
     OR has_function_privilege('authenticated', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'internal claim function has an unexpected public EXECUTE grant';
  END IF;
  IF is_market_helper AND has_function_privilege('service_role', function_oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'internal claim helper must not be directly executable by service_role';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.rg_claim_beat_gift(text,uuid,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Gift V1 claim entry point is not executable by service_role';
  END IF;
END $$;
