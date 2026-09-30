-- 0004 picks: wagers, weekly budgets (derived), bye weeks.
-- docs/RULES.md #2, #4, #5, #6, #9, #10. Every money-moving rule is enforced here, in one
-- transaction with a row lock, so no client can overspend or bet after the deadline.

create type public.pick_side as enum ('home', 'away');
create type public.pick_status as enum ('open', 'won', 'lost', 'push', 'void');
create type public.pick_placed_by as enum ('member', 'system');

create table public.picks (
  id           uuid primary key default gen_random_uuid(),
  league_id    uuid not null references public.leagues (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  week_id      uuid not null references public.weeks (id),
  game_id      uuid not null references public.games (id),
  line_id      uuid not null references public.lines (id),
  side         public.pick_side not null,
  wager_cents  integer not null,
  placed_by    public.pick_placed_by not null default 'member',
  status       public.pick_status not null default 'open',
  settled_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint picks_one_per_game unique (league_id, user_id, game_id),
  constraint picks_wager_positive check (wager_cents > 0)
);

create index picks_member_week_idx on public.picks (league_id, user_id, week_id);
create index picks_open_by_game_idx on public.picks (game_id) where status = 'open';
create index picks_week_idx on public.picks (week_id);

create trigger picks_set_updated_at before update on public.picks
  for each row execute function public.set_updated_at();
create trigger picks_audit after insert or update or delete on public.picks
  for each row execute function public.audit_row();

-- ledger.pick_id is a soft reference on purpose: the ledger is append-only (no updates), so a
-- foreign key with "on delete set null" would be blocked when a member removes a pick. Removed
-- picks leave their wager + refund rows behind with the old pick id as a breadcrumb for audits.
comment on column public.ledger.pick_id is 'Soft reference to picks.id; the pick may since have been removed.';

-- ---------------------------------------------------------------------------
-- budget math (RULES.md #10): budget = balance at week open; winnings never top it up mid-week.
-- ---------------------------------------------------------------------------
create or replace function public.week_budget_cents(p_league_id uuid, p_user_id uuid, p_week_id uuid)
returns integer
language sql stable set search_path = ''
as $$
  select coalesce(sum(l.amount_cents), 0)::integer
  from public.ledger l
  where l.league_id = p_league_id and l.user_id = p_user_id
    and (l.week_id is null or l.week_id <> p_week_id);
$$;

create or replace function public.available_cents(p_league_id uuid, p_user_id uuid, p_week_id uuid)
returns integer
language sql stable set search_path = ''
as $$
  select public.week_budget_cents(p_league_id, p_user_id, p_week_id)
       + coalesce((
           select sum(l.amount_cents) from public.ledger l
           where l.league_id = p_league_id and l.user_id = p_user_id and l.week_id = p_week_id
             and l.kind in ('wager', 'refund')
         ), 0)::integer;
$$;

grant execute on function public.week_budget_cents(uuid, uuid, uuid), public.available_cents(uuid, uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- placing picks
-- ---------------------------------------------------------------------------
create or replace function public.place_pick_internal(
  p_league_id uuid, p_user_id uuid, p_game_id uuid, p_side public.pick_side, p_wager_cents integer,
  p_placed_by public.pick_placed_by
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member    public.league_members%rowtype;
  v_league    public.leagues%rowtype;
  v_game      public.games%rowtype;
  v_line_id   uuid;
  v_unit      integer;
  v_existing  public.picks%rowtype;
  v_available integer;
  v_pick_id   uuid;
begin
  -- serialize all money movement for this member
  select * into v_member from public.league_members
   where league_id = p_league_id and user_id = p_user_id and left_at is null
   for update;
  if v_member.id is null then
    raise exception 'not a member of this league' using errcode = '42501';
  end if;
  if v_member.eliminated_at is not null then
    raise exception 'you have been eliminated' using errcode = 'P0001';
  end if;

  select * into v_league from public.leagues where id = p_league_id;
  if v_league.status <> 'open' then
    raise exception 'league is closed' using errcode = 'P0001';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if v_game.id is null then
    raise exception 'unknown game' using errcode = 'P0002';
  end if;
  if v_game.season_id <> v_league.season_id then
    raise exception 'game is not in this league''s season' using errcode = 'P0001';
  end if;
  if v_game.status <> 'scheduled' then
    raise exception 'game is not open for betting' using errcode = 'P0001';
  end if;
  if now() >= v_game.deadline_at then
    raise exception 'the deadline for this game has passed' using errcode = 'P0001';
  end if;
  if v_member.bye_week_id = v_game.week_id then
    raise exception 'you are on a bye this week; cancel it to bet' using errcode = 'P0001';
  end if;

  select id into v_line_id from public.lines where game_id = p_game_id and is_current;
  if v_line_id is null then
    raise exception 'no line has been set for this game yet' using errcode = 'P0001';
  end if;

  select bet_unit_cents into v_unit from public.app_settings where id = 1;
  if p_wager_cents < v_unit or p_wager_cents % v_unit <> 0 then
    raise exception 'wagers must be whole units of %', v_unit using errcode = '23514';
  end if;

  select * into v_existing from public.picks
   where league_id = p_league_id and user_id = p_user_id and game_id = p_game_id;
  if v_existing.id is not null and v_existing.status <> 'open' then
    raise exception 'this pick has already been settled' using errcode = 'P0001';
  end if;

  v_available := public.available_cents(p_league_id, p_user_id, v_game.week_id)
               + coalesce(v_existing.wager_cents, 0);
  if p_wager_cents > v_available then
    raise exception 'wager exceeds this week''s available balance (%)', v_available using errcode = 'P0001';
  end if;

  if v_existing.id is not null then
    insert into public.ledger (league_id, user_id, week_id, pick_id, kind, amount_cents, note)
    values (p_league_id, p_user_id, v_game.week_id, v_existing.id, 'refund', v_existing.wager_cents, 'pick changed');
    update public.picks
       set side = p_side, wager_cents = p_wager_cents, line_id = v_line_id, placed_by = p_placed_by
     where id = v_existing.id
     returning id into v_pick_id;
  else
    insert into public.picks (league_id, user_id, week_id, game_id, line_id, side, wager_cents, placed_by)
    values (p_league_id, p_user_id, v_game.week_id, p_game_id, v_line_id, p_side, p_wager_cents, p_placed_by)
    returning id into v_pick_id;
  end if;

  insert into public.ledger (league_id, user_id, week_id, pick_id, kind, amount_cents, note)
  values (p_league_id, p_user_id, v_game.week_id, v_pick_id, 'wager', -p_wager_cents,
          case when p_placed_by = 'system' then 'forced pick' else null end);

  return v_pick_id;
end;
$$;

create or replace function public.place_pick(p_league_id uuid, p_game_id uuid, p_side public.pick_side, p_wager_cents integer)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  return public.place_pick_internal(p_league_id, auth.uid(), p_game_id, p_side, p_wager_cents, 'member');
end;
$$;

-- Jobs only (forced 1k on the underdog, RULES.md #8).
create or replace function public.system_place_pick(
  p_league_id uuid, p_user_id uuid, p_game_id uuid, p_side public.pick_side, p_wager_cents integer
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
begin
  if coalesce(v_role, '') <> 'service_role' then
    raise exception 'system picks can only be placed by jobs' using errcode = '42501';
  end if;
  return public.place_pick_internal(p_league_id, p_user_id, p_game_id, p_side, p_wager_cents, 'system');
end;
$$;

create or replace function public.delete_pick(p_pick_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_pick public.picks%rowtype;
  v_game public.games%rowtype;
begin
  select * into v_pick from public.picks where id = p_pick_id and user_id = auth.uid() for update;
  if v_pick.id is null then
    raise exception 'pick not found' using errcode = 'P0002';
  end if;
  if v_pick.status <> 'open' then
    raise exception 'this pick has already been settled' using errcode = 'P0001';
  end if;
  select * into v_game from public.games where id = v_pick.game_id;
  if now() >= v_game.deadline_at then
    raise exception 'the deadline for this game has passed' using errcode = 'P0001';
  end if;

  insert into public.ledger (league_id, user_id, week_id, pick_id, kind, amount_cents, note)
  values (v_pick.league_id, v_pick.user_id, v_pick.week_id, v_pick.id, 'refund', v_pick.wager_cents, 'pick removed');
  delete from public.picks where id = v_pick.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- bye weeks (RULES.md #6): one per season, weeks 1-13, before the week's last deadline
-- ---------------------------------------------------------------------------
create or replace function public.take_bye(p_league_id uuid, p_week_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member public.league_members%rowtype;
  v_week   public.weeks%rowtype;
begin
  select * into v_member from public.league_members
   where league_id = p_league_id and user_id = auth.uid() and left_at is null for update;
  if v_member.id is null then
    raise exception 'not a member of this league' using errcode = '42501';
  end if;
  if v_member.eliminated_at is not null then
    raise exception 'you have been eliminated' using errcode = 'P0001';
  end if;
  if v_member.bye_week_id is not null then
    raise exception 'you have already used your bye' using errcode = 'P0001';
  end if;
  select * into v_week from public.weeks where id = p_week_id;
  if v_week.id is null then
    raise exception 'unknown week' using errcode = 'P0002';
  end if;
  if v_week.week_number > 13 then
    raise exception 'byes can only be used through week 13' using errcode = 'P0001';
  end if;
  if v_week.last_deadline_at is not null and now() >= v_week.last_deadline_at then
    raise exception 'this week is closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.picks where league_id = p_league_id and user_id = auth.uid() and week_id = p_week_id) then
    raise exception 'remove your picks for this week first' using errcode = 'P0001';
  end if;

  update public.league_members set bye_week_id = p_week_id where id = v_member.id;
  perform public.post_league_event(p_league_id, 'bye_used', auth.uid(), auth.uid(),
    jsonb_build_object('week', v_week.week_number));
end;
$$;

create or replace function public.cancel_bye(p_league_id uuid, p_week_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_member public.league_members%rowtype;
  v_week   public.weeks%rowtype;
begin
  select * into v_member from public.league_members
   where league_id = p_league_id and user_id = auth.uid() and left_at is null for update;
  if v_member.id is null then
    raise exception 'not a member of this league' using errcode = '42501';
  end if;
  if v_member.bye_week_id is distinct from p_week_id then
    raise exception 'your bye is not on this week' using errcode = 'P0001';
  end if;
  select * into v_week from public.weeks where id = p_week_id;
  if v_week.last_deadline_at is not null and now() >= v_week.last_deadline_at then
    raise exception 'this week is closed' using errcode = 'P0001';
  end if;
  update public.league_members set bye_week_id = null where id = v_member.id;
  delete from public.league_events
   where league_id = p_league_id and kind = 'bye_used' and subject_user_id = auth.uid()
     and (payload ->> 'week')::int = v_week.week_number;
end;
$$;

revoke all on function public.place_pick_internal(uuid, uuid, uuid, public.pick_side, integer, public.pick_placed_by) from public;
revoke all on function public.place_pick(uuid, uuid, public.pick_side, integer) from public;
revoke all on function public.system_place_pick(uuid, uuid, uuid, public.pick_side, integer) from public;
revoke all on function public.delete_pick(uuid) from public;
revoke all on function public.take_bye(uuid, uuid) from public;
revoke all on function public.cancel_bye(uuid, uuid) from public;
grant execute on function public.place_pick(uuid, uuid, public.pick_side, integer), public.delete_pick(uuid),
  public.take_bye(uuid, uuid), public.cancel_bye(uuid, uuid) to authenticated, service_role;
grant execute on function public.system_place_pick(uuid, uuid, uuid, public.pick_side, integer) to service_role;

-- ---------------------------------------------------------------------------
-- RLS: own picks always; league-mates' picks per the site setting
-- ---------------------------------------------------------------------------
alter table public.picks enable row level security;
revoke all on public.picks from anon, authenticated;
grant select on public.picks to authenticated;

create policy "picks: own or visible league picks" on public.picks for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_league_member(league_id)
      and (
        not (select s.hide_picks_until_kickoff from public.app_settings s where s.id = 1)
        or exists (select 1 from public.games g where g.id = game_id and g.deadline_at <= now())
      )
    )
  );
