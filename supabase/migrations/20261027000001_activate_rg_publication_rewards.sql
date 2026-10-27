-- Activate the publication rewards explicitly authorized by the owner.
-- Cash purchases, transfers and redemption require a separate approved rollout.
BEGIN;
UPDATE public.rg_economy_config SET wallet_v3_enabled=true,publication_rewards_enabled=true,
 publication_rewards_started_at=coalesce(publication_rewards_started_at,now()),rules_version=3,updated_at=now() WHERE id=true;
UPDATE public.rg_seasons SET rules_version=3 WHERE status IN('active','scheduled');
NOTIFY pgrst,'reload schema';
COMMIT;
