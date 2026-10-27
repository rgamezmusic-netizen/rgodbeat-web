-- Run after the V3 application is Ready, never before the schema migration.
BEGIN;
UPDATE public.rg_economy_config SET wallet_v3_enabled=true,publication_rewards_enabled=true,
 publication_rewards_started_at=coalesce(publication_rewards_started_at,now()),wallet_transfers_enabled=true,redemption_enabled=true,
 purchases_enabled=true,rg_per_usd_cent=1,purchase_price_cents_per_rg=1,rules_version=3,updated_at=now() WHERE id=true;
UPDATE public.rg_seasons SET rules_version=3 WHERE status IN('active','scheduled');
NOTIFY pgrst,'reload schema';
COMMIT;
