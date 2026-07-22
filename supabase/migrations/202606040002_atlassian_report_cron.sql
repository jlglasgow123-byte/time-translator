-- Atlassian Personal Data Reporting API — pg_net extension only.
--
-- NOTE: The weekly reporting cron job is scheduled via Vercel cron (vercel.json),
-- NOT pg_cron. This is because Supabase restricts ALTER DATABASE/ALTER ROLE for
-- custom GUC parameters, making it impossible to pass a CRON_SECRET to pg_net
-- without hardcoding it in SQL. Vercel cron handles the secret cleanly via env vars.
--
-- This migration only enables pg_net in case it is needed for future jobs.
-- The atlassian_reporting_log table is created in 202606040001_atlassian_reporting_log.sql.

create extension if not exists pg_net with schema extensions;
