-- ==============================================================================
-- RGODBEAT 2.0 — STEM REQUEST SYSTEM MIGRATION
-- ==============================================================================
-- Table: public.stem_requests
-- Allows UNLIMITED and EXCLUSIVE customers to request manual grouped stem delivery
-- through an official support ticket (RG-STEM-YYYY-XXXXXX).
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.stem_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id TEXT UNIQUE NOT NULL,
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    beat_id UUID REFERENCES public.beats(id) ON DELETE SET NULL,
    beat_title TEXT NOT NULL,
    license_id TEXT NOT NULL,
    license_tier TEXT NOT NULL CHECK (license_tier IN ('unlimited', 'exclusive')),
    order_id TEXT,
    contract_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Contacted', 'Delivered', 'Closed')),
    admin_notes TEXT DEFAULT '',
    stem_files JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique & Index Constraints
CREATE UNIQUE INDEX IF NOT EXISTS idx_stem_requests_ticket_id ON public.stem_requests(ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stem_requests_purchase_id ON public.stem_requests(purchase_id);
CREATE INDEX IF NOT EXISTS idx_stem_requests_customer_id ON public.stem_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_stem_requests_customer_email ON public.stem_requests(customer_email);
CREATE INDEX IF NOT EXISTS idx_stem_requests_status ON public.stem_requests(status);
CREATE INDEX IF NOT EXISTS idx_stem_requests_created_at ON public.stem_requests(created_at DESC);

-- Enable RLS
ALTER TABLE public.stem_requests ENABLE ROW LEVEL SECURITY;

-- Deny anon access
DROP POLICY IF EXISTS "Deny anon access on stem_requests" ON public.stem_requests;
CREATE POLICY "Deny anon access on stem_requests" ON public.stem_requests FOR ALL TO anon USING (false);

-- Authenticated customers can view their own stem requests
DROP POLICY IF EXISTS "Users can view own stem_requests" ON public.stem_requests;
CREATE POLICY "Users can view own stem_requests" ON public.stem_requests FOR SELECT TO authenticated
    USING (
        customer_email = auth.jwt() ->> 'email'
        OR customer_id IN (
            SELECT id FROM public.customers WHERE email = auth.jwt() ->> 'email'
        )
    );

-- Service role full access
GRANT ALL ON public.stem_requests TO service_role;
GRANT SELECT ON public.stem_requests TO authenticated;

COMMENT ON TABLE public.stem_requests IS 'Official customer stem request tickets for UNLIMITED and EXCLUSIVE license tiers';
COMMENT ON COLUMN public.stem_requests.ticket_id IS 'Unique RGODBEAT human-readable identifier (e.g. RG-STEM-2026-000001)';
COMMENT ON COLUMN public.stem_requests.status IS 'Ticket workflow status: Pending, Contacted, Delivered, Closed';
COMMENT ON COLUMN public.stem_requests.stem_files IS 'Paths or delivery URLs for 01_MELODIES, 02_DRUMS, 03_BASS, 04_FX';
