-- 0006 profiles + storage: the logos bucket, avatar ownership, and deadline recompute for
-- timezone changes. SECURITY.md: uploads are owner-scoped by path and capped at 1 MB.

-- ---------------------------------------------------------------------------
-- logos bucket: public read (served by CDN), writes only under the uploader's own folder
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('logos', 'logos', true, 1048576, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "logos: anyone can read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'logos');

create policy "logos: owner uploads"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos: owner replaces"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "logos: owner deletes"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'logos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- profiles.avatar_path must point into the member's own folder
-- ---------------------------------------------------------------------------
create or replace function public.profiles_check_avatar_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.avatar_path is not null and split_part(new.avatar_path, '/', 1) <> new.id::text then
    raise exception 'avatar must be stored under your own folder' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger profiles_avatar_owner
  before insert or update of avatar_path on public.profiles
  for each row execute function public.profiles_check_avatar_owner();

-- ---------------------------------------------------------------------------
-- settings: when the site timezone changes, every open game's deadline moves with it
-- ---------------------------------------------------------------------------
create or replace function public.refresh_game_deadlines()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  perform public.require_operator();
  -- a same-value update of kickoff_at still fires the deadline and week-rollup triggers
  update public.games set kickoff_at = kickoff_at where status = 'scheduled';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.refresh_game_deadlines() from public;
grant execute on function public.refresh_game_deadlines() to authenticated, service_role;

alter table public.app_settings
  add constraint app_settings_timezone_known check (timezone in (
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
    'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'
  ));
