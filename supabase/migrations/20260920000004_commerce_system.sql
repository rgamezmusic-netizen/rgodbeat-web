-- RGODBEAT 2.0 Database Schema Migration
-- Migration: 20260920000004_commerce_system.sql
-- Description: Complete Commerce Layer: Customers, Orders, Order Items, Purchases (Entitlements), and Download Auditing.

-- ==============================================================================
-- 1. TABLES DEFINITION
-- ==============================================================================

-- 1.1 Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    stripe_customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.2 Orders Table
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
    stripe_checkout_session_id TEXT UNIQUE NOT NULL,
    stripe_payment_intent_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'failed', 'refunded')),
    currency TEXT NOT NULL DEFAULT 'usd',
    subtotal_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.3 Order Items Table
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE RESTRICT,
    license_type_id UUID NOT NULL REFERENCES public.license_types(id) ON DELETE RESTRICT,
    unit_price NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_order_beat_license UNIQUE (order_id, beat_id, license_type_id)
);

-- 1.4 Purchases / Entitlements Table
CREATE TABLE IF NOT EXISTS public.purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE RESTRICT,
    license_type_id UUID NOT NULL REFERENCES public.license_types(id) ON DELETE RESTRICT,
    license_tier TEXT NOT NULL CHECK (license_tier IN ('mp3', 'wav', 'stems', 'unlimited', 'exclusive')),
    contract_text TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'refunded')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_purchase_order_beat_license UNIQUE (order_id, beat_id, license_type_id)
);

-- 1.5 Download Records Table (Audit & Abuse Prevention)
CREATE TABLE IF NOT EXISTS public.download_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('mp3', 'wav', 'stems', 'exclusive', 'contract')),
    storage_path TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_email ON public.customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_stripe_id ON public.customers(stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_session ON public.orders(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_stripe_intent ON public.orders(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_beat_id ON public.order_items(beat_id);

CREATE INDEX IF NOT EXISTS idx_purchases_customer_id ON public.purchases(customer_id);
CREATE INDEX IF NOT EXISTS idx_purchases_order_id ON public.purchases(order_id);
CREATE INDEX IF NOT EXISTS idx_purchases_beat_id ON public.purchases(beat_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.purchases(status);
CREATE INDEX IF NOT EXISTS idx_purchases_created_at ON public.purchases(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_download_records_purchase ON public.download_records(purchase_id);
CREATE INDEX IF NOT EXISTS idx_download_records_downloaded_at ON public.download_records(downloaded_at DESC);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.download_records ENABLE ROW LEVEL SECURITY;

-- 3.1 Deny all public anon access to commerce tables
DROP POLICY IF EXISTS "Deny anon access on customers" ON public.customers;
CREATE POLICY "Deny anon access on customers" ON public.customers FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon access on orders" ON public.orders;
CREATE POLICY "Deny anon access on orders" ON public.orders FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon access on order_items" ON public.order_items;
CREATE POLICY "Deny anon access on order_items" ON public.order_items FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon access on purchases" ON public.purchases;
CREATE POLICY "Deny anon access on purchases" ON public.purchases FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS "Deny anon access on download_records" ON public.download_records;
CREATE POLICY "Deny anon access on download_records" ON public.download_records FOR ALL TO anon USING (false);

-- 3.2 Authenticated Customers can view their own purchases and orders
DROP POLICY IF EXISTS "Users can view own customer record" ON public.customers;
CREATE POLICY "Users can view own customer record" ON public.customers FOR SELECT TO authenticated
    USING (email = auth.jwt()->>'email');

DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
CREATE POLICY "Users can view own orders" ON public.orders FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customers
            WHERE public.customers.id = public.orders.customer_id
            AND public.customers.email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Users can view own order items" ON public.order_items;
CREATE POLICY "Users can view own order items" ON public.order_items FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            JOIN public.customers ON public.customers.id = public.orders.customer_id
            WHERE public.orders.id = public.order_items.order_id
            AND public.customers.email = auth.jwt()->>'email'
        )
    );

DROP POLICY IF EXISTS "Users can view own purchases" ON public.purchases;
CREATE POLICY "Users can view own purchases" ON public.purchases FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.customers
            WHERE public.customers.id = public.purchases.customer_id
            AND public.customers.email = auth.jwt()->>'email'
        )
    );

-- ==============================================================================
-- 4. GRANTS FOR SERVICE ROLE
-- ==============================================================================
GRANT ALL ON public.customers TO service_role;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.order_items TO service_role;
GRANT ALL ON public.purchases TO service_role;
GRANT ALL ON public.download_records TO service_role;
