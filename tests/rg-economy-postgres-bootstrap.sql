-- Isolated integration fixture; never execute against Supabase or Production.
\set ON_ERROR_STOP on
DO $$ BEGIN IF current_database()<>'rgodbeat_validation' THEN RAISE EXCEPTION 'wrong_test_database'; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; END IF; END $$;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),email varchar(255),email_confirmed_at timestamptz,raw_user_meta_data jsonb DEFAULT '{}');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
\ir ../supabase/migrations/20260920000000_initial_schema.sql
\ir ../supabase/migrations/20260920000001_grant_public_read_privileges.sql
\ir ../supabase/migrations/20260920000003_rgodbeat_23_engine.sql
\ir ../supabase/migrations/20260920000004_commerce_system.sql
\ir ../supabase/migrations/20260923000000_licensing_contract_system.sql
\ir ../supabase/migrations/20260923000001_stem_requests_system.sql
\ir ../supabase/migrations/20260924000000_studio_and_weekly_votes.sql
\ir ../supabase/migrations/20260924000001_studio_cloud_projects.sql
\ir ../supabase/migrations/20260927000000_the_park_rights_and_release_system.sql
\ir ../supabase/migrations/20261003000000_chart_community.sql
\ir ../supabase/migrations/20261003000001_youtube_channel.sql
\ir ../supabase/migrations/20261003000002_chart_points.sql
\ir ../supabase/migrations/20261005000000_rg_identity_publications.sql
\ir ../supabase/migrations/20261006000000_rg_score_economy.sql
\ir ../supabase/migrations/20261007000000_commerce_security_gift_foundation.sql
\ir ../supabase/migrations/20261008000000_gift_v1.sql
\ir ../supabase/migrations/20261009000000_rg_beat_pass.sql
