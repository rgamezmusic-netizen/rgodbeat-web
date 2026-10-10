-- Remove all records from the retired project/profile based version of The Park.
-- The six-step rights guide stores completion state only in each visitor's browser.
DELETE FROM public.park_registrations;
DELETE FROM public.park_documents;
DELETE FROM public.park_audit_events;
DELETE FROM public.park_projects;
DELETE FROM public.park_profiles;
