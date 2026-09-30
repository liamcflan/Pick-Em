-- Production scheduling (run once in the Supabase SQL editor after the first deploy).
-- Not a migration: it stores the deployed URL and the job secret in Vault, which are per-environment.
--
-- 1. Enable the extensions (Dashboard → Database → Extensions): pg_cron, pg_net.
-- 2. Replace the two values below, run this whole file.
-- 3. Check: select * from cron.job;  and later  select * from cron.job_run_details order by start_time desc limit 20;

select vault.create_secret('https://YOUR-APP.vercel.app', 'pickem_app_url');
select vault.create_secret('REPLACE-WITH-JOB_SECRET', 'pickem_job_secret');

create or replace function public.call_job(p_name text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'pickem_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'pickem_job_secret';
  return net.http_post(
    url := v_url || '/api/jobs/' || p_name,
    headers := jsonb_build_object('content-type', 'application/json', 'x-job-secret', v_secret),
    body := p_body,
    timeout_milliseconds := 55000
  );
end;
$$;
revoke all on function public.call_job(text, jsonb) from public;

-- pg_cron runs in UTC. Jobs are idempotent, so they are scheduled a little wider than needed and
-- decide for themselves whether there is anything to do (DST-safe).

-- Lines: Wednesday 11:00–14:00 UTC hourly (covers 08:00 ET in both EDT and EST).
select cron.schedule('pickem-lock-lines', '0 11-14 * * 3', $$ select public.call_job('lock_lines') $$);

-- Schedule/scores refresh: hourly (cheap; the live-score job in Phase 2 replaces this with minutes).
select cron.schedule('pickem-sync-schedule', '15 * * * *', $$ select public.call_job('sync_schedule', jsonb_build_object('year', extract(year from now())::int)) $$);

-- To remove: select cron.unschedule('pickem-lock-lines');
