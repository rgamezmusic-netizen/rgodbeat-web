-- Activate Stripe purchases, wallet transfers, and beat license redemptions in production
BEGIN;
UPDATE public.rg_economy_config
SET purchases_enabled = true,
    wallet_transfers_enabled = true,
    redemption_enabled = true,
    purchase_price_cents_per_rg = 1,
    rg_per_usd_cent = 1,
    updated_at = now()
WHERE id = true;
NOTIFY pgrst, 'reload schema';
COMMIT;
