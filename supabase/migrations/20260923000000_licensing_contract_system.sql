-- ==============================================================================
-- RGODBEAT 2.0 - Licensing & Contract System Migration
-- Adds dedicated human-readable license_id and contract_version to purchases
-- ==============================================================================

-- 1. Add license_id and contract_version to public.purchases
ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS license_id TEXT;

ALTER TABLE public.purchases 
ADD COLUMN IF NOT EXISTS contract_version TEXT DEFAULT 'NE-v1.0';

-- 2. Create unique index for license_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchases_license_id 
ON public.purchases(license_id);

-- 3. Create index for contract_version queries
CREATE INDEX IF NOT EXISTS idx_purchases_contract_version 
ON public.purchases(contract_version);

COMMENT ON COLUMN public.purchases.license_id IS 'Unique RGODBEAT human-readable identifier (e.g. RG-MP3-2026-000001)';
COMMENT ON COLUMN public.purchases.contract_version IS 'Contract template version active at time of purchase (e.g. NE-v1.0)';
