-- RGODBEAT 2.0 Database Migration
-- Migration: 20260920000001_grant_public_read_privileges.sql
-- Purpose: Grant PostgreSQL SELECT table privileges to anon and authenticated roles for public marketplace tables.
-- Security Note:
-- - public.beat_files remains strictly protected with NO grant to anon/authenticated.
-- - INSERT, UPDATE, DELETE are NOT granted.
-- - Row Level Security (RLS) policies continue to filter visible rows on each table.

-- 1. Grant schema usage on public schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- 2. Grant SELECT privileges only on public marketplace tables
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.license_types TO anon, authenticated;
GRANT SELECT ON public.beats TO anon, authenticated;
GRANT SELECT ON public.beat_licenses TO anon, authenticated;
