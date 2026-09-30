-- 0002 reference data: seasons, weeks, teams, games, lines.
-- Read by every signed-in user; written only by jobs (service role) or via security-definer
-- functions. Game deadlines (23:59 Eastern the day before kickoff, docs/RULES.md #9) are computed
-- by trigger so no client ever supplies them.

-- ---------------------------------------------------------------------------
-- settings additions from docs/RULES.md
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column bet_unit_cents integer not null default 100000,
  add constraint app_settings_bet_unit_positive check (bet_unit_cents > 0);

alter table public.app_settings alter column spread_lock_day set default 3;      -- Wednesday
alter table public.app_settings alter column spread_lock_time set default '08:00';
update public.app_settings set spread_lock_day = 3, spread_lock_time = '08:00' where id = 1;

grant update (bet_unit_cents) on public.app_settings to authenticated;

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
create type public.game_status as enum ('scheduled', 'in_progress', 'final', 'postponed', 'void');
create type public.line_source as enum ('api', 'admin');

-- ---------------------------------------------------------------------------
-- seasons
-- ---------------------------------------------------------------------------
create table public.seasons (
  id                    uuid primary key default gen_random_uuid(),
  year                  integer not null unique,
  regular_season_weeks  smallint not null default 18,
  playoffs_start_at     timestamptz,
  is_active             boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint seasons_year_range check (year between 2020 and 2100),
  constraint seasons_weeks_range check (regular_season_weeks between 1 and 22)
);

create unique index seasons_single_active_idx on public.seasons ((1)) where is_active;

create trigger seasons_set_updated_at before update on public.seasons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teams (reference data, seeded below)
-- ---------------------------------------------------------------------------
create table public.teams (
  id            uuid primary key default gen_random_uuid(),
  espn_team_id  integer not null unique,
  abbreviation  text not null unique,
  location      text not null,
  name          text not null,
  display_name  text not null,
  conference    text not null,
  division      text not null,
  logo_url      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint teams_abbreviation_shape check (abbreviation ~ '^[A-Z]{2,4}$'),
  constraint teams_conference_known check (conference in ('AFC', 'NFC')),
  constraint teams_division_known check (division in ('East', 'North', 'South', 'West'))
);

create trigger teams_set_updated_at before update on public.teams
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- weeks
-- ---------------------------------------------------------------------------
create table public.weeks (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references public.seasons (id) on delete cascade,
  week_number       smallint not null,
  opens_at          timestamptz,
  spread_lock_at    timestamptz,
  first_kickoff_at  timestamptz,
  last_kickoff_at   timestamptz,
  last_game_id      uuid,              -- fk added after games exists
  last_deadline_at  timestamptz,       -- deadline of the week's last game: drives bye/forced-pick job
  settled_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint weeks_number_range check (week_number between 1 and 22),
  constraint weeks_unique_per_season unique (season_id, week_number)
);

create trigger weeks_set_updated_at before update on public.weeks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- games
-- ---------------------------------------------------------------------------
create table public.games (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references public.seasons (id) on delete cascade,
  week_id         uuid not null references public.weeks (id) on delete cascade,
  espn_event_id   text not null unique,
  home_team_id    uuid not null references public.teams (id),
  away_team_id    uuid not null references public.teams (id),
  kickoff_at      timestamptz not null,
  deadline_at     timestamptz not null,   -- maintained by trigger from kickoff_at + settings timezone
  neutral_site    boolean not null default false,
  status          public.game_status not null default 'scheduled',
  status_detail   text,
  home_score      smallint,
  away_score      smallint,
  period          smallint,
  clock           text,
  last_synced_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint games_distinct_teams check (home_team_id <> away_team_id),
  constraint games_scores_non_negative check (coalesce(home_score, 0) >= 0 and coalesce(away_score, 0) >= 0)
);

create index games_week_kickoff_idx on public.games (week_id, kickoff_at);
create index games_kickoff_idx on public.games (kickoff_at);
create index games_status_idx on public.games (status) where status in ('scheduled', 'in_progress');

alter table public.weeks
  add constraint weeks_last_game_fk foreign key (last_game_id) references public.games (id) on delete set null;

create trigger games_set_updated_at before update on public.games
  for each row execute function public.set_updated_at();

-- Deadline: 23:59 in the site timezone on the calendar day before kickoff (RULES.md #9).
create or replace function public.set_game_deadline()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select s.timezone into tz from public.app_settings s where s.id = 1;
  tz := coalesce(tz, 'America/New_York');
  new.deadline_at := (((new.kickoff_at at time zone tz)::date - 1) + time '23:59') at time zone tz;
  return new;
end;
$$;

create trigger games_set_deadline
  before insert or update of kickoff_at on public.games
  for each row execute function public.set_game_deadline();

-- Keep week rollups (first/last kickoff, last game + its deadline) in sync with games.
create or replace function public.refresh_week_rollup(p_week_id uuid)
returns void
language sql
set search_path = ''
as $$
  update public.weeks w
  set first_kickoff_at = agg.first_kickoff_at,
      last_kickoff_at  = agg.last_kickoff_at,
      last_game_id     = agg.last_game_id,
      last_deadline_at = agg.last_deadline_at
  from (
    select
      (select min(g.kickoff_at) from public.games g where g.week_id = p_week_id and g.status <> 'void') as first_kickoff_at,
      (select max(g.kickoff_at) from public.games g where g.week_id = p_week_id and g.status <> 'void') as last_kickoff_at,
      (select g.id from public.games g where g.week_id = p_week_id and g.status <> 'void'
         order by g.kickoff_at desc, g.id limit 1) as last_game_id,
      (select g.deadline_at from public.games g where g.week_id = p_week_id and g.status <> 'void'
         order by g.kickoff_at desc, g.id limit 1) as last_deadline_at
  ) agg
  where w.id = p_week_id;
$$;

create or replace function public.games_refresh_week_rollup()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_week_rollup(old.week_id);
    return old;
  end if;
  perform public.refresh_week_rollup(new.week_id);
  if tg_op = 'UPDATE' and new.week_id <> old.week_id then
    perform public.refresh_week_rollup(old.week_id);
  end if;
  return new;
end;
$$;

create trigger games_week_rollup
  after insert or update of kickoff_at, week_id, status or delete on public.games
  for each row execute function public.games_refresh_week_rollup();

-- ---------------------------------------------------------------------------
-- lines: immutable spread versions; exactly one current line per game
-- ---------------------------------------------------------------------------
create table public.lines (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  home_spread  numeric(4,1) not null,   -- negative = home favoured
  price        integer not null default -110,  -- stored for the future; payouts are even money
  source       public.line_source not null,
  set_by       uuid references public.profiles (id) on delete set null,
  locked_at    timestamptz not null default now(),
  is_current   boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint lines_half_point_multiples check (home_spread * 2 = trunc(home_spread * 2)),
  constraint lines_reasonable_spread check (home_spread between -60 and 60)
);

create unique index lines_one_current_per_game_idx on public.lines (game_id) where is_current;
create index lines_game_idx on public.lines (game_id, locked_at desc);

create trigger lines_audit
  after insert or update or delete on public.lines
  for each row execute function public.audit_row();

-- Site admins set a line by hand (to match the New York Post); jobs set them from the API.
-- Every call creates a new version and retires the previous one. Locked once the deadline passes.
create or replace function public.set_line(
  p_game_id uuid,
  p_home_spread numeric,
  p_source public.line_source default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_role text := coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  );
begin
  if p_source = 'admin' then
    if not public.is_site_admin() then
      raise exception 'only site admins can set lines' using errcode = '42501';
    end if;
  elsif coalesce(v_role, '') <> 'service_role' then
    raise exception 'api lines can only be set by jobs' using errcode = '42501';
  end if;

  if not exists (select 1 from public.games g where g.id = p_game_id) then
    raise exception 'unknown game' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.games g where g.id = p_game_id and now() >= g.deadline_at) then
    raise exception 'line locked: deadline has passed' using errcode = 'P0001';
  end if;

  update public.lines set is_current = false where game_id = p_game_id and is_current;

  insert into public.lines (game_id, home_spread, source, set_by)
  values (p_game_id, p_home_spread, p_source, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.set_line(uuid, numeric, public.line_source) from public;
grant execute on function public.set_line(uuid, numeric, public.line_source) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- privileges + RLS: everyone signed in can read; nobody but jobs/functions can write
-- ---------------------------------------------------------------------------
alter table public.seasons enable row level security;
alter table public.weeks   enable row level security;
alter table public.teams   enable row level security;
alter table public.games   enable row level security;
alter table public.lines   enable row level security;

revoke all on public.seasons, public.weeks, public.teams, public.games, public.lines from anon, authenticated;
grant select on public.seasons, public.weeks, public.teams, public.games, public.lines to authenticated;

create policy "seasons: authenticated read" on public.seasons for select to authenticated using (true);
create policy "weeks: authenticated read"   on public.weeks   for select to authenticated using (true);
create policy "teams: authenticated read"   on public.teams   for select to authenticated using (true);
create policy "games: authenticated read"   on public.games   for select to authenticated using (true);
create policy "lines: authenticated read"   on public.lines   for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- seed: the 32 NFL teams (ESPN ids), idempotent
-- ---------------------------------------------------------------------------
insert into public.teams (espn_team_id, abbreviation, location, name, display_name, conference, division, logo_url)
values
  (2,  'BUF', 'Buffalo',       'Bills',      'Buffalo Bills',         'AFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/buf.png'),
  (15, 'MIA', 'Miami',         'Dolphins',   'Miami Dolphins',        'AFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/mia.png'),
  (17, 'NE',  'New England',   'Patriots',   'New England Patriots',  'AFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/ne.png'),
  (20, 'NYJ', 'New York',      'Jets',       'New York Jets',         'AFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png'),
  (33, 'BAL', 'Baltimore',     'Ravens',     'Baltimore Ravens',      'AFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/bal.png'),
  (4,  'CIN', 'Cincinnati',    'Bengals',    'Cincinnati Bengals',    'AFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/cin.png'),
  (5,  'CLE', 'Cleveland',     'Browns',     'Cleveland Browns',      'AFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/cle.png'),
  (23, 'PIT', 'Pittsburgh',    'Steelers',   'Pittsburgh Steelers',   'AFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/pit.png'),
  (34, 'HOU', 'Houston',       'Texans',     'Houston Texans',        'AFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/hou.png'),
  (11, 'IND', 'Indianapolis',  'Colts',      'Indianapolis Colts',    'AFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/ind.png'),
  (30, 'JAX', 'Jacksonville',  'Jaguars',    'Jacksonville Jaguars',  'AFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/jax.png'),
  (10, 'TEN', 'Tennessee',     'Titans',     'Tennessee Titans',      'AFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/ten.png'),
  (7,  'DEN', 'Denver',        'Broncos',    'Denver Broncos',        'AFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/den.png'),
  (12, 'KC',  'Kansas City',   'Chiefs',     'Kansas City Chiefs',    'AFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/kc.png'),
  (13, 'LV',  'Las Vegas',     'Raiders',    'Las Vegas Raiders',     'AFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/lv.png'),
  (24, 'LAC', 'Los Angeles',   'Chargers',   'Los Angeles Chargers',  'AFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/lac.png'),
  (6,  'DAL', 'Dallas',        'Cowboys',    'Dallas Cowboys',        'NFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/dal.png'),
  (19, 'NYG', 'New York',      'Giants',     'New York Giants',       'NFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png'),
  (21, 'PHI', 'Philadelphia',  'Eagles',     'Philadelphia Eagles',   'NFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/phi.png'),
  (28, 'WSH', 'Washington',    'Commanders', 'Washington Commanders', 'NFC', 'East',  'https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png'),
  (3,  'CHI', 'Chicago',       'Bears',      'Chicago Bears',         'NFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/chi.png'),
  (8,  'DET', 'Detroit',       'Lions',      'Detroit Lions',         'NFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/det.png'),
  (9,  'GB',  'Green Bay',     'Packers',    'Green Bay Packers',     'NFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/gb.png'),
  (16, 'MIN', 'Minnesota',     'Vikings',    'Minnesota Vikings',     'NFC', 'North', 'https://a.espncdn.com/i/teamlogos/nfl/500/min.png'),
  (1,  'ATL', 'Atlanta',       'Falcons',    'Atlanta Falcons',       'NFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/atl.png'),
  (29, 'CAR', 'Carolina',      'Panthers',   'Carolina Panthers',     'NFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/car.png'),
  (18, 'NO',  'New Orleans',   'Saints',     'New Orleans Saints',    'NFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/no.png'),
  (27, 'TB',  'Tampa Bay',     'Buccaneers', 'Tampa Bay Buccaneers',  'NFC', 'South', 'https://a.espncdn.com/i/teamlogos/nfl/500/tb.png'),
  (22, 'ARI', 'Arizona',       'Cardinals',  'Arizona Cardinals',     'NFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/ari.png'),
  (14, 'LAR', 'Los Angeles',   'Rams',       'Los Angeles Rams',      'NFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png'),
  (25, 'SF',  'San Francisco', '49ers',      'San Francisco 49ers',   'NFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/sf.png'),
  (26, 'SEA', 'Seattle',       'Seahawks',   'Seattle Seahawks',      'NFC', 'West',  'https://a.espncdn.com/i/teamlogos/nfl/500/sea.png')
on conflict (espn_team_id) do update
  set abbreviation = excluded.abbreviation,
      location     = excluded.location,
      name         = excluded.name,
      display_name = excluded.display_name,
      conference   = excluded.conference,
      division     = excluded.division,
      logo_url     = excluded.logo_url;
