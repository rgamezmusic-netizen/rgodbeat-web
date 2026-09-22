-- RGODBEAT 2.0 Database Migration
-- Migration: 20260920000002_storage_setup.sql
-- Purpose: Setup Supabase Storage architecture with public & private buckets.

-- ==============================================================================
-- 1. STORAGE BUCKETS CONFIGURATION
-- ==============================================================================

-- 1.1 Public Bucket: rgodbeat-public (covers & preview audio)
-- public = true allows native CDN public read access without custom RLS policies.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'rgodbeat-public',
    'rgodbeat-public',
    true,
    15728640, -- 15 MB limit per asset (covers & previews)
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/mp3']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 1.2 Private Bucket: rgodbeat-private (master WAVs, stems, exclusive packages, contracts)
-- public = false strictly prevents direct public CDN downloads.
-- Future downloads will use authenticated server-side authorization and time-limited signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'rgodbeat-private',
    'rgodbeat-private',
    false, -- STRICTLY PRIVATE
    2147483648, -- 2 GB limit per asset (multitrack stems / uncompressed audio)
    ARRAY[
        'audio/x-wav',
        'audio/wav',
        'application/zip',
        'application/x-zip-compressed',
        'application/pdf',
        'application/octet-stream'
    ]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
