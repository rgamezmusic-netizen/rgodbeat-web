-- ==============================================================================
-- RGODBEAT 2.0 — Migration: 20260920000003_rgodbeat_23_engine.sql
-- Description: Top 23 Public Ranking Engine & Permanent Local Master Library Sync
-- 
-- CORE ARCHITECTURAL PRINCIPLES:
-- 1. DATABASE = THE BRAIN (Stores unlimited canonical beat records permanently).
-- 2. LOCAL MASTER LIBRARY = ~/RGODBEAT 23 SALE/{slug}/ (Permanent home for ALL beats,
--    completely separate from software workspace, never moves, renames, or archives folders).
-- 3. TOP 23 = PUBLIC STOREFRONT RANKING ONLY (Purely a database ranking state 1-23).
--    Leaving Top 23 NEVER deletes or moves the beat from the local master library.
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIÓN NO DESTRUCTIVA DE public.beats
-- ==============================================================================

-- 1.1 Estado del ranking público Top 23
ALTER TABLE public.beats
    ADD COLUMN IF NOT EXISTS ranking_status TEXT NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS current_rank INTEGER,
    ADD COLUMN IF NOT EXISTS previous_rank INTEGER,
    ADD COLUMN IF NOT EXISTS ranking_period TEXT,
    ADD COLUMN IF NOT EXISTS pool_entry_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS days_in_pool INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS performance_window_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS performance_window_ended_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS performance_score NUMERIC(12, 4) NOT NULL DEFAULT 0.0000;

-- 1.2 Métricas de rendimiento desacopladas (JSONB para evolucionar sin alterar columnas)
ALTER TABLE public.beats
    ADD COLUMN IF NOT EXISTS performance_metrics JSONB NOT NULL DEFAULT '{
        "plays": 0,
        "favorites": 0,
        "cart_additions": 0,
        "page_views": 0,
        "sales_count": 0,
        "revenue_usd": 0.00,
        "conversion_rate": 0.00
    }'::jsonb;

-- 1.3 Estado de sincronización en la librería local permanente (~/RGODBEAT 23 SALE/{slug}/)
ALTER TABLE public.beats
    ADD COLUMN IF NOT EXISTS local_sync_status TEXT NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS local_archive_path TEXT,
    ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- 1.4 Metadatos para el ciclo de vida de almacenamiento online
ALTER TABLE public.beats
    ADD COLUMN IF NOT EXISTS online_asset_status TEXT NOT NULL DEFAULT 'ready';

-- ==============================================================================
-- 2. RESTRICCIONES (CONSTRAINTS) EN public.beats
-- ==============================================================================

-- 2.1 Estados válidos del ranking público
ALTER TABLE public.beats
    DROP CONSTRAINT IF EXISTS chk_beats_ranking_status;
ALTER TABLE public.beats
    ADD CONSTRAINT chk_beats_ranking_status
    CHECK (ranking_status IN ('draft', 'new', 'active', 'archived'));

-- 2.2 Invariante estricto de posición según ranking público:
-- active   -> current_rank DEBE ser NOT NULL y entre 1 y 23
-- new      -> current_rank DEBE ser NULL
-- draft    -> current_rank DEBE ser NULL
-- archived -> current_rank DEBE ser NULL
ALTER TABLE public.beats
    DROP CONSTRAINT IF EXISTS chk_beats_current_rank;
ALTER TABLE public.beats
    ADD CONSTRAINT chk_beats_current_rank
    CHECK (
        (ranking_status = 'active' AND current_rank IS NOT NULL AND current_rank BETWEEN 1 AND 23)
        OR
        (ranking_status IN ('draft', 'new', 'archived') AND current_rank IS NULL)
    );

ALTER TABLE public.beats
    DROP CONSTRAINT IF EXISTS chk_beats_previous_rank;
ALTER TABLE public.beats
    ADD CONSTRAINT chk_beats_previous_rank
    CHECK (previous_rank IS NULL OR (previous_rank >= 1 AND previous_rank <= 23));

-- 2.3 Estados de sincronización con la librería local permanente
-- (Solo pending, synced, failed; los archivos locales NUNCA se archivan ni eliminan)
ALTER TABLE public.beats
    DROP CONSTRAINT IF EXISTS chk_beats_local_sync_status;
ALTER TABLE public.beats
    ADD CONSTRAINT chk_beats_local_sync_status
    CHECK (local_sync_status IN ('pending', 'synced', 'failed'));

-- 2.4 Estados de almacenamiento online
ALTER TABLE public.beats
    DROP CONSTRAINT IF EXISTS chk_beats_online_asset_status;
ALTER TABLE public.beats
    ADD CONSTRAINT chk_beats_online_asset_status
    CHECK (online_asset_status IN ('ready', 'archived', 'purged'));

-- ==============================================================================
-- 3. ÍNDICES DE RENDIMIENTO Y UNICIDAD EN public.beats
-- ==============================================================================

-- INVARIANTE DE BD: Unicidad estricta de puestos 1 a 23 en el ranking activo
DROP INDEX IF EXISTS public.uq_beats_current_rank_active;
CREATE UNIQUE INDEX uq_beats_current_rank_active 
    ON public.beats (current_rank) 
    WHERE current_rank IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_beats_ranking_status ON public.beats(ranking_status);
CREATE INDEX IF NOT EXISTS idx_beats_local_sync ON public.beats(local_sync_status);
CREATE INDEX IF NOT EXISTS idx_beats_online_asset_status ON public.beats(online_asset_status);

-- ==============================================================================
-- 4. TABLA AUDITABLE DE HISTORIAL DE RANKING (PRIVADA)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.beat_ranking_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
    ranking_period TEXT NOT NULL,                                          -- Formato ISO: 'IYYY-"W"IW'
    event_type TEXT NOT NULL,                                              -- 'entry', 'weekly_rotation', 'demotion', 'archival', 'reactivation'
    rank INTEGER,                                                          -- 1 a 23 (NULL si es archival)
    performance_score NUMERIC(12, 4) NOT NULL DEFAULT 0.0000,
    sales_count INTEGER NOT NULL DEFAULT 0,
    revenue_usd NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    plays_count INTEGER NOT NULL DEFAULT 0,
    favorites_count INTEGER NOT NULL DEFAULT 0,
    cart_additions_count INTEGER NOT NULL DEFAULT 0,
    page_views_count INTEGER NOT NULL DEFAULT 0,
    conversion_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.0000,
    window_started_at TIMESTAMPTZ,
    window_ended_at TIMESTAMPTZ,
    raw_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.beat_ranking_history
    DROP CONSTRAINT IF EXISTS chk_history_event_type;
ALTER TABLE public.beat_ranking_history
    ADD CONSTRAINT chk_history_event_type
    CHECK (event_type IN ('entry', 'weekly_rotation', 'demotion', 'archival', 'reactivation'));

ALTER TABLE public.beat_ranking_history
    DROP CONSTRAINT IF EXISTS chk_history_rank;
ALTER TABLE public.beat_ranking_history
    ADD CONSTRAINT chk_history_rank
    CHECK (rank IS NULL OR (rank >= 1 AND rank <= 23));

CREATE INDEX IF NOT EXISTS idx_ranking_history_beat_id ON public.beat_ranking_history(beat_id);
CREATE INDEX IF NOT EXISTS idx_ranking_history_period ON public.beat_ranking_history(ranking_period);
CREATE INDEX IF NOT EXISTS idx_ranking_history_event_type ON public.beat_ranking_history(event_type);
CREATE INDEX IF NOT EXISTS idx_ranking_history_recorded_at ON public.beat_ranking_history(recorded_at DESC);

-- ==============================================================================
-- 5. ROW LEVEL SECURITY (RLS) — SEGURIDAD ESTRICTA
-- ==============================================================================

ALTER TABLE public.beat_ranking_history ENABLE ROW LEVEL SECURITY;

-- Ningún usuario público ni anónimo puede consultar beat_ranking_history
DROP POLICY IF EXISTS "Deny all public select on beat_ranking_history" ON public.beat_ranking_history;
CREATE POLICY "Deny all public select on beat_ranking_history"
    ON public.beat_ranking_history FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny all public insert on beat_ranking_history" ON public.beat_ranking_history;
CREATE POLICY "Deny all public insert on beat_ranking_history"
    ON public.beat_ranking_history FOR INSERT TO anon, authenticated WITH CHECK (false);

DROP POLICY IF EXISTS "Deny all public update on beat_ranking_history" ON public.beat_ranking_history;
CREATE POLICY "Deny all public update on beat_ranking_history"
    ON public.beat_ranking_history FOR UPDATE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Deny all public delete on beat_ranking_history" ON public.beat_ranking_history;
CREATE POLICY "Deny all public delete on beat_ranking_history"
    ON public.beat_ranking_history FOR DELETE TO anon, authenticated USING (false);

-- ==============================================================================
-- 6. PERMISOS (GRANTS)
-- ==============================================================================

GRANT USAGE ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beats TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.beat_ranking_history TO service_role;

REVOKE ALL ON public.beat_ranking_history FROM anon;
REVOKE ALL ON public.beat_ranking_history FROM authenticated;

-- ==============================================================================
-- 7. INICIALIZACIÓN SEGURA DE LOS 12 BEATS SEMILLA (ESTADO DE DESARROLLO)
-- ==============================================================================

-- Asignar estrictamente los 12 beats semilla actuales como activos en los puestos 1 a 12 de forma determinista.
-- LIMIT 12 explícito para proteger el invariante 1-23. Cero métricas comerciales ficticias.
DO $$
DECLARE
    beat_record RECORD;
    v_rank INTEGER := 1;
BEGIN
    FOR beat_record IN 
        SELECT id FROM public.beats 
        WHERE published = true 
        ORDER BY created_at ASC
        LIMIT 12
    LOOP
        UPDATE public.beats
        SET 
            ranking_status = 'active',
            current_rank = v_rank,
            previous_rank = NULL,
            ranking_period = to_char(now(), 'IYYY-"W"IW'),
            pool_entry_date = now(),
            days_in_pool = 0,
            performance_score = 0.0000,
            performance_metrics = '{
                "plays": 0,
                "favorites": 0,
                "cart_additions": 0,
                "page_views": 0,
                "sales_count": 0,
                "revenue_usd": 0.00,
                "conversion_rate": 0.00
            }'::jsonb,
            local_sync_status = 'pending',
            local_archive_path = (SELECT slug FROM public.beats WHERE id = beat_record.id),
            online_asset_status = 'ready'
        WHERE id = beat_record.id;

        v_rank := v_rank + 1;
    END LOOP;
END $$;
