-- 0005 settlement: results, payouts, elimination, winners, and the weekly action check.
-- docs/RULES.md #3 (push = loss), #7 (busted at 0), #8 (auto bye / forced 1k on the underdog),
-- #10 (paid at week end), #11 (last one standing, else most money at season end), #12 (void = refund).
-- Only jobs (service_role) and site admins may call these; every call is idempotent.

alter table public.weeks add column action_checked_at timestamptz;
comment on column public.weeks.action_checked_at is 'Set once the bye / forced-pick check has run for the week.';

-- Role from the JWT (empty for anon and plain sessions).
create or replace function public.jwt_role()
returns text
language sql stable set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'),
    ''
  );
$$;
revoke all on function public.jwt_role() from public;
grant execute on function public.jwt_role() to authenticated, service_role;

create or replace function public.require_operator()
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if public.jwt_role() <> 'service_role' and not public.is_site_admin() then
    raise exception 'only jobs and site admins can settle games' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.require_operator() from public;

-- ---------------------------------------------------------------------------
-- settle_game: grade every open pick on a final (or void) game against its own line
-- ---------------------------------------------------------------------------
create or replace function public.settle_game(p_game_id uuid)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_game    public.games%rowtype;
  v_pick    record;
  v_adjusted numeric;
  v_result  public.pick_status;
  v_count   integer := 0;
begin
  perform public.require_operator();

  select * into v_game from public.games where id = p_game_id for update;
  if v_game.id is null then
    raise exception 'unknown game' using errcode = 'P0002';
  end if;
  if v_game.status not in ('final', 'void') then
    raise exception 'game is not final' using errcode = 'P0001';
  end if;
  if v_game.status = 'final' and (v_game.home_score is null or v_game.away_score is null) then
    raise exception 'final game has no score' using errcode = 'P0001';
  end if;

  for v_pick in
    select p.id, p.league_id, p.user_id, p.week_id, p.side, p.wager_cents, l.home_spread
    from public.picks p
    join public.lines l on l.id = p.line_id
    where p.game_id = p_game_id and p.status = 'open'
    order by p.league_id, p.user_id
    for update of p
  loop
    if v_game.status = 'void' then
      v_result := 'void';
    else
      -- home margin after the spread: > 0 home covered, < 0 away covered, = 0 push (a loss, RULES.md #3)
      v_adjusted := (v_game.home_score - v_game.away_score) + v_pick.home_spread;
      if v_adjusted = 0 then
        v_result := 'push';
      elsif (v_adjusted > 0) = (v_pick.side = 'home') then
        v_result := 'won';
      else
        v_result := 'lost';
      end if;
    end if;

    update public.picks set status = v_result, settled_at = now() where id = v_pick.id;

    if v_result = 'won' then
      -- even money: the stake comes back plus the same again
      insert into public.ledger (league_id, user_id, week_id, pick_id, kind, amount_cents, note)
      values (v_pick.league_id, v_pick.user_id, v_pick.week_id, v_pick.id, 'payout', v_pick.wager_cents * 2, 'covered');
    elsif v_result = 'void' then
      insert into public.ledger (league_id, user_id, week_id, pick_id, kind, amount_cents, note)
      values (v_pick.league_id, v_pick.user_id, v_pick.week_id, v_pick.id, 'refund', v_pick.wager_cents, 'game void');
    end if;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- Admin escape hatch (RULES.md #12): abandoned / never-played game.
create or replace function public.void_game(p_game_id uuid, p_reason text default null)
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_operator();
  update public.games
     set status = 'void', status_detail = coalesce(nullif(btrim(p_reason), ''), 'Voided by admin')
   where id = p_game_id and status <> 'void';
  return public.settle_game(p_game_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- settle_week: once every game is final/void, eliminate busted members and crown winners
-- ---------------------------------------------------------------------------
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
    where l.season_id = v_week.season_id and l.status = 'open'
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

-- ---------------------------------------------------------------------------
-- weekly_action_check (RULES.md #8): after the week's last deadline, anyone with no pick
-- gets their bye (weeks 1-13, if unused) or 1 unit on the underdog of the last game.
-- ---------------------------------------------------------------------------
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
    where l.season_id = v_week.season_id and l.status = 'open'
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

revoke all on function public.settle_game(uuid) from public;
revoke all on function public.void_game(uuid, text) from public;
revoke all on function public.settle_week(uuid) from public;
revoke all on function public.weekly_action_check(uuid) from public;
grant execute on function public.settle_game(uuid), public.void_game(uuid, text),
  public.settle_week(uuid), public.weekly_action_check(uuid) to authenticated, service_role;
