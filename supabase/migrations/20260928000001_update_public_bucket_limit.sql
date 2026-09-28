-- RGODBEAT 2.0 Database Migration
-- Migration: 20260928000001_update_public_bucket_limit.sql
-- Purpose: Increase public storage bucket file_size_limit to 50MB (52428800 bytes)
-- to allow streaming MP3 previews and high-res cover art without hitting 400 errors.

UPDATE storage.buckets
SET file_size_limit = 52428800
WHERE id = 'rgodbeat-public';
