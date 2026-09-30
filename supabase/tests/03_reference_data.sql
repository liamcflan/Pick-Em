begin;
select plan(32);

-- ---- schema
select has_table('public', 'seasons', 'seasons exists');
select has_table('public', 'weeks', 'weeks exists');
select has_table('public', 'teams', 'teams exists');
select has_table('public', 'games', 'games exists');
select has_table('public', 'lines', 'lines exists');
select is((select count(*)::int from public.teams), 32, '32 teams seeded');
select is((select count(distinct abbreviation)::int from public.teams), 32, 'abbreviations unique');
select is((select bet_unit_cents from public.app_settings), 100000, 'bet unit is 1k');
select is((select spread_lock_day from public.app_settings), 3::smallint, 'lock day moved to Wednesday');

-- ---- fixtures
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '{"display_name": "Admin"}'),
  ('00000000-0000-0000-0000-000000000002', 'user@example.com', '{"display_name": "User"}');
update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-000000000001';

insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2026, true);
insert into public.weeks (id, season_id, week_number) values
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5),
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000001', 9);

select throws_ok(
  $$ insert into public.seasons (year, is_active) values (2027, true) $$,
  '23505', null, 'only one active season'
);

-- games: Thursday night (EDT), Sunday (EDT), Sunday night after DST ends (EST), Sunday afternoon (EST)
insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'e1',
    (select id from public.teams where abbreviation = 'NYG'), (select id from public.teams where abbreviation = 'DAL'), '2026-10-02 00:15+00'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'e2',
    (select id from public.teams where abbreviation = 'KC'),  (select id from public.teams where abbreviation = 'BUF'), '2026-10-04 17:00+00'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', 'e3',
    (select id from public.teams where abbreviation = 'PHI'), (select id from public.teams where abbreviation = 'GB'),  '2026-11-02 01:15+00'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000009', 'e4',
    (select id from public.teams where abbreviation = 'MIA'), (select id from public.teams where abbreviation = 'NYJ'), '2026-11-01 18:00+00');

-- ---- deadline trigger (23:59 America/New_York the day before kickoff)
select is((select deadline_at from public.games where espn_event_id = 'e1'), '2026-10-01 03:59+00'::timestamptz,
  'Thu 8:15pm EDT game -> Wed 23:59 EDT');
select is((select deadline_at from public.games where espn_event_id = 'e2'), '2026-10-04 03:59+00'::timestamptz,
  'Sun 1pm EDT game -> Sat 23:59 EDT');
select is((select deadline_at from public.games where espn_event_id = 'e3'), '2026-11-01 03:59+00'::timestamptz,
  'Sun 8:15pm EST (after fall-back) -> Sat 23:59 EDT (before fall-back)');
select is((select deadline_at from public.games where espn_event_id = 'e4'), '2026-11-01 03:59+00'::timestamptz,
  'Sun 1pm EST game -> Sat 23:59 EDT');

update public.games set kickoff_at = '2026-10-05 00:20+00' where espn_event_id = 'e2';
select is((select deadline_at from public.games where espn_event_id = 'e2'), '2026-10-04 03:59+00'::timestamptz,
  'deadline recomputed when kickoff changes');

-- ---- week rollups
select is((select first_kickoff_at from public.weeks where week_number = 5), '2026-10-02 00:15+00'::timestamptz, 'week first kickoff');
select is((select last_kickoff_at from public.weeks where week_number = 5), '2026-10-05 00:20+00'::timestamptz, 'week last kickoff');
select is((select last_game_id from public.weeks where week_number = 5), '30000000-0000-0000-0000-000000000002'::uuid, 'week last game');
select is((select last_deadline_at from public.weeks where week_number = 5), '2026-10-04 03:59+00'::timestamptz, 'week last deadline');

update public.games set status = 'void' where espn_event_id = 'e2';
select is((select last_game_id from public.weeks where week_number = 5), '30000000-0000-0000-0000-000000000001'::uuid, 'void games excluded from rollup');
update public.games set status = 'scheduled' where espn_event_id = 'e2';

-- ---- RLS: signed-in users read, cannot write
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.teams), 32, 'user can read teams');
select is((select count(*)::int from public.games), 4, 'user can read games');
select throws_ok($$ update public.games set home_score = 99 where espn_event_id = 'e1' $$, '42501', null, 'user cannot update games');
select throws_ok($$ insert into public.lines (game_id, home_spread, source) values ('30000000-0000-0000-0000-000000000001', -3, 'admin') $$,
  '42501', null, 'user cannot insert lines directly');
select throws_ok($$ select public.set_line('30000000-0000-0000-0000-000000000001', -3.5) $$,
  '42501', null, 'non-admin cannot set a line');
reset role;

-- ---- set_line as site admin
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('app.request_id', 'req-line-1', true);

select lives_ok($$ select public.set_line('30000000-0000-0000-0000-000000000001', -3.5) $$, 'admin sets a line');
select lives_ok($$ select public.set_line('30000000-0000-0000-0000-000000000001', -4) $$, 'admin re-sets the line');
select is((select count(*)::int from public.lines where game_id = '30000000-0000-0000-0000-000000000001'), 2, 'both versions kept');
select is((select home_spread from public.lines where game_id = '30000000-0000-0000-0000-000000000001' and is_current), -4.0, 'latest version is current');
select throws_ok($$ select public.set_line('30000000-0000-0000-0000-000000000001', -3.25) $$, '23514', null, 'quarter-point spreads rejected');
select is(
  (select count(*)::int from public.audit_log where table_name = 'lines' and actor_id = '00000000-0000-0000-0000-000000000001' and request_id = 'req-line-1'),
  3, 'line insert + retire are audited with actor and request id'
);
reset role;

-- ---- lines lock once the deadline passes
update public.games set kickoff_at = now() - interval '1 day' where espn_event_id = 'e3';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.set_line('30000000-0000-0000-0000-000000000003', -1) $$, 'P0001', null, 'cannot set a line after the deadline');
reset role;

select * from finish();
rollback;
