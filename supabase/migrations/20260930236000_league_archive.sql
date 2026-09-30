-- 0008 league archive: site admins can retire a league (a dry-run league, a mistake) without
-- deleting anything. Archived leagues disappear for their members (every member-facing policy
-- goes through is_league_member), stop accepting picks and joins, and are skipped by settlement
-- and the weekly action check. Reversible: unarchive restores everything as it was.

alter table public.leagues add column archived_at timestamptz;
comment on column public.leagues.archived_at is 'Set by archive_league(); hides the league from members and freezes it. Null = live.';

create index leagues_archived_idx on public.leagues (archived_at) where archived_at is not null;

create or replace function public.archive_league(p_league_id uuid, p_archived boolean default true)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_operator();
  update public.leagues
     set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
   where id = p_league_id;
  if not found then
    raise exception 'unknown league' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.archive_league(uuid, boolean) from public;
grant execute on function public.archive_league(uuid, boolean) to authenticated, service_role;

-- membership helpers: an archived league has no (visible) members
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    join public.leagues l on l.id = m.league_id
    where m.league_id = p_league_id and m.user_id = auth.uid() and m.left_at is null
      and l.archived_at is null
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    join public.leagues l on l.id = m.league_id
    where m.league_id = p_league_id and m.user_id = auth.uid()
      and m.left_at is null and m.role = 'commissioner' and l.archived_at is null
  );
$$;

-- joins and picks are refused while archived
create or replace function public.join_league(p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_league  public.leagues%rowtype;
  v_member  public.league_members%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_league from public.leagues
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_league.id is null then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;
  if v_league.status <> 'open' or v_league.archived_at is not null then
    raise exception 'league is not accepting members' using errcode = 'P0001';
  end if;

  select * into v_member from public.league_members where league_id = v_league.id and user_id = v_uid;
  if v_member.id is not null and v_member.left_at is null then
    raise exception 'already a member' using errcode = '23505';
  end if;

  if v_member.id is not null then
    -- rejoin: keep their history and balance, reactivate membership
    update public.league_members set left_at = null, role = 'member' where id = v_member.id;
  else
    insert into public.league_members (league_id, user_id, role, joined_week_id)
    values (v_league.id, v_uid, 'member', public.current_week_id(v_league.season_id));
    insert into public.ledger (league_id, user_id, kind, amount_cents, note)
    values (v_league.id, v_uid, 'initial', v_league.starting_balance_cents, 'starting balance');
  end if;

  perform public.post_league_event(v_league.id, 'member_joined', v_uid, v_uid, '{}'::jsonb);
  return v_league.id;
end;
$$;

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
  if v_league.status <> 'open' or v_league.archived_at is not null then
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
  -- the forced pick (RULES.md #8) is placed by the job right after the deadline
  if p_placed_by = 'member' and now() >= v_game.deadline_at then
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

-- settlement and the weekly action check skip archived leagues
create or replace function public.settle_week(p_week_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_week      public.weeks%rowtype;
  v_season    public.seasons%rowtype;
  v_game      record;
  v_league    record;
  v_member    record;
  v_games     integer := 0;
  v_picks     integer := 0;
  v_elim      integer := 0;
  v_complete  integer := 0;
  v_events    integer := 0;
  v_remaining integer;
  v_winner    uuid;
  v_reason    text;
begin
  perform public.require_operator();

  select * into v_week from public.weeks where id = p_week_id for update;
  if v_week.id is null then
    raise exception 'unknown week' using errcode = 'P0002';
  end if;

  -- grade whatever has finished, even if the week is not over yet
  for v_game in
    select g.id from public.games g
    where g.week_id = p_week_id and g.status in ('final', 'void')
      and exists (select 1 from public.picks p where p.game_id = g.id and p.status = 'open')
    order by g.kickoff_at
  loop
    v_picks := v_picks + public.settle_game(v_game.id);
    v_games := v_games + 1;
  end loop;

  if not exists (select 1 from public.games g where g.week_id = p_week_id)
     or exists (select 1 from public.games g where g.week_id = p_week_id and g.status not in ('final', 'void')) then
    return jsonb_build_object('ready', false, 'week', v_week.week_number,
                              'games_settled', v_games, 'picks_settled', v_picks);
  end if;

  if v_week.settled_at is null then
    update public.weeks set settled_at = now() where id = p_week_id;
  end if;
  select * into v_season from public.seasons where id = v_week.season_id;

  for v_league in
    select l.* from public.leagues l
    where l.season_id = v_week.season_id and l.status = 'open' and l.archived_at is null
    order by l.created_at
    for update
  loop
    -- RULES.md #7: busted out
    for v_member in
      select m.id, m.user_id from public.league_members m
      where m.league_id = v_league.id and m.left_at is null and m.eliminated_at is null
        and coalesce((select sum(x.amount_cents) from public.ledger x
                      where x.league_id = m.league_id and x.user_id = m.user_id), 0) <= 0
        and not exists (select 1 from public.picks p
                        where p.league_id = m.league_id and p.user_id = m.user_id and p.status = 'open')
      order by m.created_at
    loop
      update public.league_members
         set eliminated_at = now(), eliminated_week_id = p_week_id
       where id = v_member.id;
      perform public.post_league_event(v_league.id, 'member_eliminated', null, v_member.user_id,
        jsonb_build_object('week', v_week.week_number));
      v_elim := v_elim + 1;
    end loop;

    if not exists (
      select 1 from public.league_events e
      where e.league_id = v_league.id and e.kind = 'week_settled'
        and (e.payload ->> 'week')::int = v_week.week_number
    ) then
      perform public.post_league_event(v_league.id, 'week_settled', null, null,
        jsonb_build_object('week', v_week.week_number));
      v_events := v_events + 1;
    end if;

    -- RULES.md #11: last one standing, otherwise most money when the regular season ends
    select count(*) into v_remaining from public.league_members m
     where m.league_id = v_league.id and m.left_at is null and m.eliminated_at is null;
    v_winner := null;
    if v_remaining <= 1 and exists (
      select 1 from public.league_members m
      where m.league_id = v_league.id and m.left_at is null and m.eliminated_at is not null
    ) then
      v_reason := 'last_standing';
    elsif v_week.week_number >= v_season.regular_season_weeks then
      v_reason := 'season_end';
    else
      v_reason := null;
    end if;

    if v_reason is not null then
      -- highest balance; ties go to whoever risked less over the season, then the earlier member
      select m.user_id into v_winner
      from public.league_members m
      left join public.league_balances b on b.league_id = m.league_id and b.user_id = m.user_id
      where m.league_id = v_league.id and m.left_at is null
        and (v_remaining = 0 or m.eliminated_at is null)
      order by coalesce(b.balance_cents, 0) desc, coalesce(b.total_risked_cents, 0) asc, m.created_at asc
      limit 1;
    end if;

    if v_winner is not null then
      update public.leagues set status = 'complete', winner_user_id = v_winner where id = v_league.id;
      perform public.post_league_event(v_league.id, 'season_complete', null, v_winner,
        jsonb_build_object('week', v_week.week_number, 'reason', v_reason));
      v_complete := v_complete + 1;
    end if;
  end loop;

  return jsonb_build_object('ready', true, 'week', v_week.week_number,
    'games_settled', v_games, 'picks_settled', v_picks,
    'eliminated', v_elim, 'completed', v_complete, 'events', v_events);
end;
$$;

create or replace function public.weekly_action_check(p_week_id uuid)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_week    public.weeks%rowtype;
  v_game    public.games%rowtype;
  v_line    public.lines%rowtype;
  v_side    public.pick_side;
  v_unit    integer;
  v_member  record;
  v_byes    integer := 0;
  v_forced  integer := 0;
  v_errors  jsonb := '[]'::jsonb;
begin
  perform public.require_operator();

  select * into v_week from public.weeks where id = p_week_id for update;
  if v_week.id is null then
    raise exception 'unknown week' using errcode = 'P0002';
  end if;
  if v_week.last_deadline_at is null or now() < v_week.last_deadline_at then
    return jsonb_build_object('ready', false, 'week', v_week.week_number);
  end if;

  select * into v_game from public.games where id = v_week.last_game_id;
  select * into v_line from public.lines where game_id = v_game.id and is_current;
  -- positive home spread = home is the underdog; a pick 'em goes to the away side
  v_side := case when coalesce(v_line.home_spread, 0) > 0 then 'home' else 'away' end;
  select bet_unit_cents into v_unit from public.app_settings where id = 1;

  for v_member in
    select m.id, m.league_id, m.user_id, m.bye_week_id
    from public.league_members m
    join public.leagues l on l.id = m.league_id
    left join public.weeks jw on jw.id = m.joined_week_id
    where l.season_id = v_week.season_id and l.status = 'open' and l.archived_at is null
      and m.left_at is null and m.eliminated_at is null
      and (jw.id is null or jw.week_number <= v_week.week_number)
      and m.bye_week_id is distinct from p_week_id
      and not exists (select 1 from public.picks p
                      where p.league_id = m.league_id and p.user_id = m.user_id and p.week_id = p_week_id)
    order by m.league_id, m.created_at
  loop
    begin
      if v_week.week_number <= 13 and v_member.bye_week_id is null then
        update public.league_members set bye_week_id = p_week_id where id = v_member.id;
        perform public.post_league_event(v_member.league_id, 'bye_used', null, v_member.user_id,
          jsonb_build_object('week', v_week.week_number, 'automatic', true));
        v_byes := v_byes + 1;
      else
        if v_line.id is null then
          raise exception 'no line on the last game of the week' using errcode = 'P0001';
        end if;
        perform public.place_pick_internal(v_member.league_id, v_member.user_id, v_game.id, v_side, v_unit, 'system');
        perform public.post_league_event(v_member.league_id, 'forced_pick', null, v_member.user_id,
          jsonb_build_object('week', v_week.week_number, 'game_id', v_game.id, 'side', v_side));
        v_forced := v_forced + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object(
        'league_id', v_member.league_id, 'user_id', v_member.user_id, 'error', sqlerrm);
    end;
  end loop;

  -- done for good once nobody is left to handle, or once the last game has kicked off
  if jsonb_array_length(v_errors) = 0 or now() >= coalesce(v_week.last_kickoff_at, now()) then
    update public.weeks set action_checked_at = now() where id = p_week_id;
  end if;

  return jsonb_build_object('ready', true, 'week', v_week.week_number,
    'byes', v_byes, 'forced', v_forced, 'errors', v_errors);
end;
$$;

-- own picks are hidden too while the league is archived
drop policy "picks: own or visible league picks" on public.picks;
create policy "picks: own or visible league picks" on public.picks for select to authenticated
  using (
    exists (select 1 from public.leagues l where l.id = league_id and l.archived_at is null)
    and (
      user_id = auth.uid()
      or (
        public.is_league_member(league_id)
        and (
          not (select s.hide_picks_until_kickoff from public.app_settings s where s.id = 1)
          or exists (select 1 from public.games g where g.id = game_id and g.deadline_at <= now())
        )
      )
    )
  );
