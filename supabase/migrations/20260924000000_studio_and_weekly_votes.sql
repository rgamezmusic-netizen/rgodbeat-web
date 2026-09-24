-- ==============================================================================
-- RGODBEAT 2.0 — Migration: 20260924000000_studio_and_weekly_votes.sql
-- Description: RGODBEAT Studio Access Control (30 Days) & Weekly Anti-Spam Voting System
-- ==============================================================================

-- 1. Control de acceso temporal al Studio en la tabla customers
ALTER TABLE public.customers
    ADD COLUMN IF NOT EXISTS studio_access_until TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customers_studio_access 
    ON public.customers(studio_access_until);

-- 2. Tabla auditada de Votos Semanales por Beat (1 voto por usuario registrado por beat por semana)
CREATE TABLE IF NOT EXISTS public.beat_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
    week_period TEXT NOT NULL,                                          -- Formato ISO: 'IYYY-"W"IW' (ej: '2026-W39')
    voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_beat_votes_weekly UNIQUE (user_id, beat_id, week_period)
);

CREATE INDEX IF NOT EXISTS idx_beat_votes_beat_week ON public.beat_votes(beat_id, week_period);
CREATE INDEX IF NOT EXISTS idx_beat_votes_user ON public.beat_votes(user_id);

-- 3. Row Level Security (RLS) en beat_votes
ALTER TABLE public.beat_votes ENABLE ROW LEVEL SECURITY;

-- Los usuarios pueden consultar sus propios votos para saber si ya votaron esta semana
DROP POLICY IF EXISTS "Users can view their own votes" ON public.beat_votes;
CREATE POLICY "Users can view their own votes"
    ON public.beat_votes FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Los usuarios pueden insertar sus propios votos
DROP POLICY IF EXISTS "Users can cast their own votes" ON public.beat_votes;
CREATE POLICY "Users can cast their own votes"
    ON public.beat_votes FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Service role acceso completo
GRANT ALL ON public.beat_votes TO service_role;
