-- 0012 user administration: site admins list users, grant or revoke site admin, and set a
-- member's role in any league. Everything goes through security-definer functions; no table
-- privileges change. profiles_audit already records every is_site_admin change.

-- ---------------------------------------------------------------------------
-- admin_list_users: every account with its email, admin flag and active league roles.
-- Emails come from auth.users, so this is for site admins (and jobs) only.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_users()
returns table (
  id uuid,
  email text,
  display_name text,
  is_site_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  leagues jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.jwt_role() <> 'service_role' and not public.is_site_admin() then
    raise exception 'only site admins can list users' using errcode = '42501';
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.display_name,
    p.is_site_admin,
    p.created_at,
    u.last_sign_in_at,
    coalesce(
      (select jsonb_agg(jsonb_build_object(
                'league_id', l.id, 'league_name', l.name, 'role', m.role,
                'archived', l.archived_at is not null)
              order by l.name)
         from public.league_members m
         join public.leagues l on l.id = m.league_id
        where m.user_id = p.id and m.left_at is null),
      '[]'::jsonb
    )
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.display_name, p.created_at;
end;
$$;
revoke all on function public.admin_list_users() from public;
grant execute on function public.admin_list_users() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_site_admin: grant or revoke the site-admin flag. Refuses to remove the last admin, so the
-- site can never lock everyone out of /admin.
-- ---------------------------------------------------------------------------
create or replace function public.set_site_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if public.jwt_role() <> 'service_role' and not public.is_site_admin() then
    raise exception 'only site admins can change site admins' using errcode = '42501';
  end if;
  if p_is_admin is null then
    raise exception 'p_is_admin is required' using errcode = '22004';
  end if;

  -- Serialise concurrent changes so two admins cannot demote each other at once.
  perform 1 from public.profiles where is_site_admin for update;

  if not p_is_admin
     and exists (select 1 from public.profiles where id = p_user_id and is_site_admin)
     and (select count(*) from public.profiles where is_site_admin) <= 1 then
    raise exception 'the site needs at least one site admin' using errcode = 'P0001';
  end if;

  update public.profiles set is_site_admin = p_is_admin where id = p_user_id;
  if not found then
    raise exception 'unknown user' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.set_site_admin(uuid, boolean) from public;
grant execute on function public.set_site_admin(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- set_member_role: unchanged rules (member must be active, a league keeps at least one
-- commissioner), but site admins may now change roles in any league, not only commissioners.
-- ---------------------------------------------------------------------------
create or replace function public.set_member_role(p_league_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not (public.is_league_commissioner(p_league_id) or public.is_site_admin()) then
    raise exception 'only commissioners can change roles' using errcode = '42501';
  end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id and left_at is null) then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if p_role = 'member' and (
    select count(*) from public.league_members
    where league_id = p_league_id and role = 'commissioner' and left_at is null
  ) <= 1 and exists (
    select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id and role = 'commissioner'
  ) then
    raise exception 'a league needs at least one commissioner' using errcode = 'P0001';
  end if;

  update public.league_members set role = p_role
  where league_id = p_league_id and user_id = p_user_id and left_at is null;

  perform public.post_league_event(p_league_id, 'role_changed', v_uid, p_user_id, jsonb_build_object('role', p_role));
end;
$$;
