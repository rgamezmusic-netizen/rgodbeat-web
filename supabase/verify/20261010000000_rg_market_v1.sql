BEGIN READ ONLY;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.rg_market_products)<>6 THEN RAISE EXCEPTION 'Unexpected V1 catalog'; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_market_products WHERE product_key<>'beat_pass' AND active) OR (SELECT market_v1_enabled FROM public.rg_economy_config WHERE id=true) THEN RAISE EXCEPTION 'New products must remain disabled during rollout verification'; END IF;
 IF (SELECT direct_earning_v1_enabled OR season_rewards_v2_enabled OR maximum_utility_exposure_cents<>0 FROM public.rg_economy_config WHERE id=true) THEN RAISE EXCEPTION 'Issuance must stay disabled and require an explicit budget'; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_spendable_balances WHERE balance_rg<0) THEN RAISE EXCEPTION 'Negative spendable balance'; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_coin_ledger d WHERE d.amount<0 AND d.user_id IS NOT NULL AND -d.amount<>(SELECT coalesce(sum(amount),0) FROM public.rg_coin_spend_allocations WHERE debit_id=d.id)) THEN RAISE EXCEPTION 'Unallocated debit'; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_coin_ledger c WHERE c.amount>0 AND c.amount<(SELECT coalesce(sum(amount),0) FROM public.rg_coin_spend_allocations WHERE credit_id=c.id)) THEN RAISE EXCEPTION 'Overallocated credit'; END IF;
 IF EXISTS(SELECT 1 FROM public.rg_coin_spend_allocations a JOIN public.rg_coin_ledger d ON d.id=a.debit_id JOIN public.rg_coin_ledger c ON c.id=a.credit_id WHERE d.user_id IS DISTINCT FROM c.user_id) THEN RAISE EXCEPTION 'Cross-owner allocation'; END IF;
 IF has_table_privilege('anon','public.rg_spendable_balances','SELECT') OR has_table_privilege('authenticated','public.rg_market_liabilities','SELECT') OR has_column_privilege('service_role','public.rg_coin_ledger','utility_spendable','INSERT') THEN RAISE EXCEPTION 'Utility privilege exposure'; END IF;
 IF (SELECT reward_distribution->>'tail_percent' FROM public.rg_rule_versions WHERE version=2)<>'40' THEN RAISE EXCEPTION 'Missing V2 tail rewards'; END IF;
END $$;
SELECT obligation_kind,status,count(*) AS obligations,sum(maximum_benefit_cents) AS maximum_benefit_cents,sum(studio_days) AS studio_days FROM public.rg_market_liabilities GROUP BY obligation_kind,status;
SELECT public.rg_utility_exposure_cents() AS private_utility_exposure_cents;
SELECT 'RG MARKET V1 ROLLOUT VERIFICATION PASS' AS result;
ROLLBACK;
