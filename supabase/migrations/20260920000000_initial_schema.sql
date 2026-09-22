-- RGODBEAT 2.0 Database Schema Migration
-- Migration: 20260920000000_initial_schema.sql

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==============================================================================
-- 1. TABLES DEFINITION
-- ==============================================================================

-- 1.1 Categories Table
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.2 Beats Table
CREATE TABLE IF NOT EXISTS public.beats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    genre_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    mood TEXT,
    bpm INTEGER CHECK (bpm > 0),
    musical_key TEXT,
    duration_seconds INTEGER CHECK (duration_seconds > 0),
    cover_path TEXT,
    preview_path TEXT,
    featured BOOLEAN NOT NULL DEFAULT false,
    published BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.3 Beat Files Table (Private Storage Metadata)
CREATE TABLE IF NOT EXISTS public.beat_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
    file_type TEXT NOT NULL CHECK (file_type IN ('preview', 'wav', 'stems', 'exclusive', 'contract')),
    storage_path TEXT NOT NULL,
    file_name TEXT,
    mime_type TEXT,
    file_size BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.4 License Types Table
CREATE TABLE IF NOT EXISTS public.license_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 1.5 Beat Licenses Table
CREATE TABLE IF NOT EXISTS public.beat_licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    beat_id UUID NOT NULL REFERENCES public.beats(id) ON DELETE CASCADE,
    license_type_id UUID NOT NULL REFERENCES public.license_types(id) ON DELETE CASCADE,
    price_override NUMERIC(10,2),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT uq_beat_license UNIQUE (beat_id, license_type_id)
);

-- ==============================================================================
-- 2. INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

CREATE INDEX IF NOT EXISTS idx_beats_slug ON public.beats(slug);
CREATE INDEX IF NOT EXISTS idx_beats_genre_id ON public.beats(genre_id);
CREATE INDEX IF NOT EXISTS idx_beats_published ON public.beats(published);
CREATE INDEX IF NOT EXISTS idx_beats_featured ON public.beats(featured);
CREATE INDEX IF NOT EXISTS idx_beats_created_at ON public.beats(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_beat_files_beat_id ON public.beat_files(beat_id);

CREATE INDEX IF NOT EXISTS idx_beat_licenses_beat_id ON public.beat_licenses(beat_id);
CREATE INDEX IF NOT EXISTS idx_beat_licenses_license_type_id ON public.beat_licenses(license_type_id);

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ==============================================================================

-- Enable RLS on every table
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beat_licenses ENABLE ROW LEVEL SECURITY;

-- 3.1 categories: public read active categories
DROP POLICY IF EXISTS "Public categories are viewable by everyone" ON public.categories;
CREATE POLICY "Public categories are viewable by everyone"
    ON public.categories
    FOR SELECT
    TO anon, authenticated
    USING (true);

-- 3.2 license_types: public read active license types
DROP POLICY IF EXISTS "Active license types are viewable by everyone" ON public.license_types;
CREATE POLICY "Active license types are viewable by everyone"
    ON public.license_types
    FOR SELECT
    TO anon, authenticated
    USING (active = true);

-- 3.3 beats: public read published beats only
DROP POLICY IF EXISTS "Published beats are viewable by everyone" ON public.beats;
CREATE POLICY "Published beats are viewable by everyone"
    ON public.beats
    FOR SELECT
    TO anon, authenticated
    USING (published = true);

-- 3.4 beat_licenses: public read active licenses for published beats
DROP POLICY IF EXISTS "Active beat licenses for published beats are viewable by everyone" ON public.beat_licenses;
CREATE POLICY "Active beat licenses for published beats are viewable by everyone"
    ON public.beat_licenses
    FOR SELECT
    TO anon, authenticated
    USING (
        active = true AND
        EXISTS (
            SELECT 1 FROM public.beats
            WHERE public.beats.id = public.beat_licenses.beat_id
            AND public.beats.published = true
        )
    );

-- 3.5 beat_files: strictly private (no public read policy, no write policy)
-- Public access denied by default because RLS is enabled with no policies granting access.

-- Explicit public writes denial (no INSERT/UPDATE/DELETE policies created for anon or authenticated).

-- ==============================================================================
-- 4. SEED DATA
-- ==============================================================================

-- 4.1 Seed 8 Categories
INSERT INTO public.categories (name, slug, description)
VALUES
    ('Trap', 'trap', 'Cinematic tension, distorted low-end & cutting hi-hats'),
    ('R&B', 'rnb', 'Velvet chords, introspective night moods & vocal spaces'),
    ('Reggaeton', 'reggaeton', 'Futuristic swing, dembow syncopation & urban club pulse'),
    ('Afrobeat', 'afrobeat', 'Sun-soaked acoustic grooves, log drums & rhythmic swing'),
    ('House', 'house', 'Hypnotic 4x4 pulses, rolling bass & late-night underground drive'),
    ('Hip-Hop', 'hiphop', 'Hard-hitting boom bap, soulful chops & organic rhythm textures'),
    ('Pop', 'pop', 'Modern radio-ready melodies, polished grooves & soaring dynamics'),
    ('Drill', 'drill', 'Aggressive sliding 808s, haunting piano riffs & raw energy')
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description;

-- 4.2 Seed 5 License Types
INSERT INTO public.license_types (name, slug, description, price, currency, sort_order, active)
VALUES
    ('Standard MP3', 'mp3', 'Untagged High-Quality MP3 (320kbps)', 29.00, 'USD', 1, true),
    ('Premium WAV', 'wav', 'Uncompressed 24-Bit Master WAV + MP3', 49.00, 'USD', 2, true),
    ('Trackout Stems', 'stems', 'Separated Multitrack WAV Stems + Master WAV', 99.00, 'USD', 3, true),
    ('Unlimited License', 'unlimited', 'Full Master WAV + All Stems (No Caps)', 199.00, 'USD', 4, true),
    ('Exclusive Rights', 'exclusive', 'Full Ownership Transfer & Master Copyright', 499.00, 'USD', 5, true)
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price, sort_order = EXCLUDED.sort_order;

-- 4.3 Seed 12 Beats (Matching the 12 mock beats in RGODBEAT 2.0)
DO $$
DECLARE
    cat_trap UUID;
    cat_rnb UUID;
    cat_reggaeton UUID;
    cat_afrobeat UUID;
    cat_house UUID;
    cat_hiphop UUID;
    cat_pop UUID;
    cat_drill UUID;

    lic_mp3 UUID;
    lic_wav UUID;
    lic_stems UUID;
    lic_unlimited UUID;
    lic_exclusive UUID;

    b_record RECORD;
BEGIN
    -- Fetch category IDs
    SELECT id INTO cat_trap FROM public.categories WHERE slug = 'trap';
    SELECT id INTO cat_rnb FROM public.categories WHERE slug = 'rnb';
    SELECT id INTO cat_reggaeton FROM public.categories WHERE slug = 'reggaeton';
    SELECT id INTO cat_afrobeat FROM public.categories WHERE slug = 'afrobeat';
    SELECT id INTO cat_house FROM public.categories WHERE slug = 'house';
    SELECT id INTO cat_hiphop FROM public.categories WHERE slug = 'hiphop';
    SELECT id INTO cat_pop FROM public.categories WHERE slug = 'pop';
    SELECT id INTO cat_drill FROM public.categories WHERE slug = 'drill';

    -- Fetch license type IDs
    SELECT id INTO lic_mp3 FROM public.license_types WHERE slug = 'mp3';
    SELECT id INTO lic_wav FROM public.license_types WHERE slug = 'wav';
    SELECT id INTO lic_stems FROM public.license_types WHERE slug = 'stems';
    SELECT id INTO lic_unlimited FROM public.license_types WHERE slug = 'unlimited';
    SELECT id INTO lic_exclusive FROM public.license_types WHERE slug = 'exclusive';

    -- 1. Midnight Dynasty
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Midnight Dynasty', 'midnight-dynasty', 'Cinematic dark synth trap with heavy 808s and spacious textures.', cat_trap, 'Dark', 142, 'Fm', 184, 'covers/midnight-dynasty.jpg', 'previews/midnight-dynasty.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 2. Aura Latina
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Aura Latina', 'aura-latina', 'Futuristic melodic reggaeton with atmospheric pads and club punch.', cat_reggaeton, 'Melodic', 96, 'Cm', 168, 'covers/aura-latina.jpg', 'previews/aura-latina.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 3. Nocturnal Soul
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Nocturnal Soul', 'nocturnal-soul', 'Warm vintage Rhodes chords, smooth basslines and intimate late-night energy.', cat_rnb, 'Soulful', 88, 'Ebm', 202, 'covers/nocturnal-soul.jpg', 'previews/nocturnal-soul.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 4. Sol de Mar
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Sol de Mar', 'sol-de-mar', 'Sun-soaked acoustic guitar melodies, log drum bounce and uplifting afrobeat groove.', cat_afrobeat, 'Chill', 104, 'G', 175, 'covers/sol-de-mar.jpg', 'previews/sol-de-mar.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 5. After Hours Echo
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('After Hours Echo', 'after-hours-echo', 'Deep rolling bassline, hypnotic syncopation and atmospheric electronic soul.', cat_house, 'Atmospheric', 126, 'Am', 220, 'covers/after-hours-echo.jpg', 'previews/after-hours-echo.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 6. Bronx Cathedral
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Bronx Cathedral', 'bronx-cathedral', 'Soulful sample chops, gritty live drums and triumphant storytelling chords.', cat_hiphop, 'Epic', 92, 'Dm', 195, 'covers/bronx-cathedral.jpg', 'previews/bronx-cathedral.mp3', true, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = true;

    -- 7. Ghost Protocol
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Ghost Protocol', 'ghost-protocol', 'Sliding 808s, dark drill percussion and minimal haunting piano textures.', cat_drill, 'Aggressive', 144, 'Gm', 159, 'covers/ghost-protocol.jpg', 'previews/ghost-protocol.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 8. Velvet Horizon
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Velvet Horizon', 'velvet-horizon', 'Lush 80s synth wave pads, emotional reverb vocals and modern R&B percussion.', cat_rnb, 'Romantic', 82, 'Bbm', 198, 'covers/velvet-horizon.jpg', 'previews/velvet-horizon.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 9. Fuego Eterno
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Fuego Eterno', 'fuego-eterno', 'Punchy kick, synthetic vocal chops and aggressive dembow bounce for the club.', cat_reggaeton, 'Energetic', 98, 'F#m', 172, 'covers/fuego-eterno.jpg', 'previews/fuego-eterno.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 10. Neon Syndicate
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Neon Syndicate', 'neon-syndicate', 'Bright disco funk bass, modern pop synths and energetic commercial bounce.', cat_pop, 'Energetic', 120, 'C', 186, 'covers/neon-syndicate.jpg', 'previews/neon-syndicate.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 11. Abyss 808
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Abyss 808', 'abyss-808', 'Heavy subterranean 808 distortion, bell arpeggios and dark tension.', cat_trap, 'Dark', 138, 'C#m', 164, 'covers/abyss-808.jpg', 'previews/abyss-808.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 12. Savage Reign
    INSERT INTO public.beats (title, slug, description, genre_id, mood, bpm, musical_key, duration_seconds, cover_path, preview_path, featured, published)
    VALUES ('Savage Reign', 'savage-reign', 'Dark aggressive drill with sliding subs, orchestral strings and relentless rhythm.', cat_drill, 'Aggressive', 142, 'Em', 178, 'covers/savage-reign.jpg', 'previews/savage-reign.mp3', false, true)
    ON CONFLICT (slug) DO UPDATE SET genre_id = EXCLUDED.genre_id, bpm = EXCLUDED.bpm, musical_key = EXCLUDED.musical_key, published = true, featured = false;

    -- 4.4 Seed Beat Licenses for all 12 beats
    FOR b_record IN SELECT id FROM public.beats LOOP
        INSERT INTO public.beat_licenses (beat_id, license_type_id, price_override, active)
        VALUES
            (b_record.id, lic_mp3, NULL, true),
            (b_record.id, lic_wav, NULL, true),
            (b_record.id, lic_stems, NULL, true),
            (b_record.id, lic_unlimited, NULL, true),
            (b_record.id, lic_exclusive, NULL, true)
        ON CONFLICT (beat_id, license_type_id) DO UPDATE 
        SET active = true;
    END LOOP;
END $$;
