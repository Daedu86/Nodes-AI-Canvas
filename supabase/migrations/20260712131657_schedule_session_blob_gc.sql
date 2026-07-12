create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- Production invokes the verified `session-blob-gc` Edge Function daily at
-- 03:20 UTC. Its endpoint and publishable invocation key are stored in
-- Supabase Vault and intentionally are not embedded in source control.
-- Recreate the job from the Supabase Cron dashboard using the same function
-- and schedule after provisioning those Vault entries.
