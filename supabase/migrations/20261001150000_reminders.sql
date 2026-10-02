-- 0011 reminders: "your picks lock in two hours and you have nothing in" emails (Phase 2).
-- The database decides who needs a nudge; the Python job only sends and records. Members can
-- opt out on their profile. One reminder per member, league and week.

alter table public.profiles add column reminders_enabled boolean not null default true;
grant update (reminders_enabled) on public.profiles to authenticated;

create table public.reminder_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  league_id  uuid not null references public.leagues (id) on delete cascade,
  week_id    uuid not null references public.weeks (id) on delete cascade,
  kind       text not null default 'picks_due',
  sent_at    timestamptz not null default now(),
  constraint reminder_log_once unique (user_id, league_id, week_id, kind)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant select on public.reminder_log to authenticated;
create policy "reminder_log: own rows or site admin"
  on public.reminder_log for select to authenticated
  using (user_id = auth.uid() or public.is_site_admin());

-- Who should be reminded for this week: active, not eliminated, opted in, no pick and no bye
-- this week, not already reminded. Includes the email from auth.users, so operator only.
create or replace function public.picks_due_reminders(p_week_id uuid)
returns table (
  user_id uuid, email text, display_name text, league_id uuid, league_name text,
  week_number smallint, deadline_at timestamptz, available_cents integer
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform public.require_operator();
  return query
    select m.user_id, u.email::text, p.display_name, l.id, l.name, w.week_number, w.last_deadline_at,
           public.available_cents(l.id, m.user_id, w.id)
    from public.weeks w
    join public.leagues l on l.season_id = w.season_id and l.status = 'open' and l.archived_at is null
    join public.league_members m on m.league_id = l.id and m.left_at is null and m.eliminated_at is null
    join public.profiles p on p.id = m.user_id and p.reminders_enabled
    join auth.users u on u.id = m.user_id
    left join public.weeks jw on jw.id = m.joined_week_id
    where w.id = p_week_id
      and (jw.id is null or jw.week_number <= w.week_number)
      and m.bye_week_id is distinct from w.id
      and u.email is not null
      and not exists (select 1 from public.picks k where k.league_id = l.id and k.user_id = m.user_id and k.week_id = w.id)
      and not exists (select 1 from public.reminder_log r where r.user_id = m.user_id and r.league_id = l.id and r.week_id = w.id and r.kind = 'picks_due')
    order by l.name, p.display_name;
end;
$$;

create or replace function public.record_reminder(p_user_id uuid, p_league_id uuid, p_week_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_operator();
  insert into public.reminder_log (user_id, league_id, week_id)
  values (p_user_id, p_league_id, p_week_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.picks_due_reminders(uuid) from public;
revoke all on function public.record_reminder(uuid, uuid, uuid) from public;
grant execute on function public.picks_due_reminders(uuid), public.record_reminder(uuid, uuid, uuid)
  to authenticated, service_role;
