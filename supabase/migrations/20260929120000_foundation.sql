-- 0001 foundation: profiles, site settings, job runs, audit log, helpers, RLS.
-- Conventions:
--   * every table has RLS enabled; default deny; policies are `to authenticated` (anon sees nothing)
--   * writes that must bypass RLS run as service_role (jobs) or inside security-definer functions
--   * money is integer cents; timestamps are timestamptz (UTC)

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger on signup
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null,
  avatar_path   text,
  is_site_admin boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 2 and 32),
  constraint profiles_avatar_path_shape check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]+$')
);

comment on table public.profiles is 'Public profile for each auth user. Site-admin flag lives here and is only changeable by service role.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');
  fallback  text := split_part(coalesce(new.email, ''), '@', 1);
  name      text;
begin
  name := coalesce(requested, fallback, 'player');
  name := left(name, 32);
  if char_length(name) < 2 then
    name := name || repeat('_', 2 - char_length(name));
  end if;
  insert into public.profiles (id, display_name) values (new.id, name);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Is the current user a site admin? Security definer so it works inside RLS policies
-- without granting broad read access to profiles.is_site_admin.
create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_site_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_site_admin() from public;
grant execute on function public.is_site_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app_settings: single-row site configuration
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                              smallint primary key default 1,
  spread_lock_day                 smallint not null default 2,      -- 0 = Sunday … 6 = Saturday
  spread_lock_time                time not null default '10:00',
  timezone                        text not null default 'America/New_York',
  default_starting_balance_cents  integer not null default 1000000, -- $10,000.00
  hide_picks_until_kickoff        boolean not null default false,
  odds_provider                   text not null default 'the_odds_api',
  score_poll_interval_s           integer not null default 60,
  updated_at                      timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1),
  constraint app_settings_spread_lock_day_range check (spread_lock_day between 0 and 6),
  constraint app_settings_balance_positive check (default_starting_balance_cents > 0),
  constraint app_settings_poll_interval_range check (score_poll_interval_s between 15 and 3600),
  constraint app_settings_odds_provider_known check (odds_provider in ('the_odds_api', 'espn'))
);

comment on table public.app_settings is 'Site-wide configuration. Exactly one row (id = 1). Editable by site admins only.';

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

insert into public.app_settings (id) values (1);

-- ---------------------------------------------------------------------------
-- job_runs: one row per scheduled/manual job execution (observability)
-- ---------------------------------------------------------------------------
create type public.job_status as enum ('running', 'succeeded', 'failed');

create table public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  job_name    text not null,
  request_id  text,
  status      public.job_status not null default 'running',
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  detail      jsonb not null default '{}'::jsonb,
  constraint job_runs_finished_after_started check (finished_at is null or finished_at >= started_at)
);

create index job_runs_job_name_started_at_idx on public.job_runs (job_name, started_at desc);

comment on table public.job_runs is 'Execution log for Python jobs. Written by service role; readable by site admins.';

-- ---------------------------------------------------------------------------
-- audit_log: append-only change history for sensitive tables
-- ---------------------------------------------------------------------------
create type public.audit_action as enum ('insert', 'update', 'delete');

create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  row_id      uuid not null,
  action      public.audit_action not null,
  actor_id    uuid,                       -- auth.uid() at the time, null for jobs/system
  actor_role  text,                       -- 'authenticated' | 'service_role' | ...
  request_id  text,                       -- set via `set_config('app.request_id', ...)` by callers that have one
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_row_idx on public.audit_log (table_name, row_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);

comment on table public.audit_log is 'Append-only. Populated only by the audit_row() trigger; attach it to any table whose changes must be traceable (picks, league settings, ...).';

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  rid := case when tg_op = 'DELETE' then (to_jsonb(old) ->> 'id')::uuid else (to_jsonb(new) ->> 'id')::uuid end;
  insert into public.audit_log (table_name, row_id, action, actor_id, actor_role, request_id, old_data, new_data)
  values (
    tg_table_name,
    rid,
    lower(tg_op)::public.audit_action,
    auth.uid(),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('app.request_id', true), ''),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.audit_row() from public;

-- Nothing may edit history, not even service role through the API.
create or replace function public.audit_log_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_update
  before update or delete on public.audit_log
  for each row execute function public.audit_log_is_append_only();

-- Audit the two foundation tables that matter.
create trigger profiles_audit
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row();

-- app_settings uses a smallint id; the audit trigger expects uuid row ids, so use a fixed uuid.
create or replace function public.audit_app_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_log (table_name, row_id, action, actor_id, actor_role, request_id, old_data, new_data)
  values (
    'app_settings',
    '00000000-0000-0000-0000-000000000001',
    lower(tg_op)::public.audit_action,
    auth.uid(),
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('app.request_id', true), ''),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return new;
end;
$$;

revoke all on function public.audit_app_settings() from public;

create trigger app_settings_audit
  after update on public.app_settings
  for each row execute function public.audit_app_settings();

-- ---------------------------------------------------------------------------
-- privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.profiles     enable row level security;
alter table public.app_settings enable row level security;
alter table public.job_runs     enable row level security;
alter table public.audit_log    enable row level security;

-- Supabase grants all privileges on new public tables to anon/authenticated by default.
-- Tighten to exactly what the app needs; RLS then decides *which rows*.
revoke all on public.profiles, public.app_settings, public.job_runs, public.audit_log from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, avatar_path) on public.profiles to authenticated;

grant select on public.app_settings to authenticated;
grant update (
  spread_lock_day, spread_lock_time, timezone, default_starting_balance_cents,
  hide_picks_until_kickoff, odds_provider, score_poll_interval_s
) on public.app_settings to authenticated;

grant select on public.job_runs to authenticated;
grant select on public.audit_log to authenticated;

-- profiles
create policy "profiles: authenticated can read all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles: users update their own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- app_settings
create policy "app_settings: authenticated can read"
  on public.app_settings for select
  to authenticated
  using (true);

create policy "app_settings: site admins update"
  on public.app_settings for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

-- job_runs: site admins read; only service role writes (no insert/update policy for authenticated)
create policy "job_runs: site admins read"
  on public.job_runs for select
  to authenticated
  using (public.is_site_admin());

-- audit_log: users see history of their own actions and their own rows; site admins see all
create policy "audit_log: own rows or site admin"
  on public.audit_log for select
  to authenticated
  using (
    public.is_site_admin()
    or actor_id = auth.uid()
    or (table_name = 'profiles' and row_id = auth.uid())
  );
