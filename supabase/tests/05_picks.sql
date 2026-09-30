begin;
select plan(42);

-- ---- fixtures: season, week 5 (open) and week 14 (no byes), games, lines, league with alice+bob
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2026, true);
insert into public.weeks (id, season_id, week_number) values
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 14);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cara@example.com',  '{"display_name": "Cara"}');

-- two future games in week 5, one whose deadline has passed, one in week 14
insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g1',
    (select id from public.teams where abbreviation = 'NYG'), (select id from public.teams where abbreviation = 'DAL'), now() + interval '3 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g2',
    (select id from public.teams where abbreviation = 'KC'),  (select id from public.teams where abbreviation = 'BUF'), now() + interval '4 days'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g3',
    (select id from public.teams where abbreviation = 'PHI'), (select id from public.teams where abbreviation = 'GB'),  now() - interval '1 hour'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'g4',
    (select id from public.teams where abbreviation = 'MIA'), (select id from public.teams where abbreviation = 'NYJ'), now() + interval '60 days');
insert into public.lines (game_id, home_spread, source) values
  ('30000000-0000-0000-0000-000000000001', -3.5, 'api'),
  ('30000000-0000-0000-0000-000000000003', -7, 'api'),
  ('30000000-0000-0000-0000-000000000004', 1, 'api');
-- g2 deliberately has no line

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Picks League');
reset role;
create temp table t as select id as league_id, invite_code from public.leagues limit 1;
grant select on t to authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_league((select invite_code from t));
reset role;

-- ---- alice bets
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is(public.available_cents((select league_id from t), auth.uid(), '20000000-0000-0000-0000-000000000005'), 1000000, 'full budget before betting');

select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 150000) $$, (select league_id from t)),
  '23514', null, 'half-unit wager rejected');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 0) $$, (select league_id from t)),
  '23514', null, 'zero wager rejected');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 1100000) $$, (select league_id from t)),
  'P0001', null, 'wager over budget rejected');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000002', 'home', 100000) $$, (select league_id from t)),
  'P0001', null, 'game without a line rejected');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000003', 'home', 100000) $$, (select league_id from t)),
  'P0001', null, 'past-deadline game rejected');

select lives_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 300000) $$, (select league_id from t)), 'alice bets 3k on NYG');
select is((select count(*)::int from public.picks where user_id = auth.uid()), 1, 'pick stored');
select is((select side::text from public.picks where user_id = auth.uid()), 'home', 'side stored');
select is((select week_id from public.picks where user_id = auth.uid()), '20000000-0000-0000-0000-000000000005'::uuid, 'week denormalized');
select is(public.available_cents((select league_id from t), auth.uid(), '20000000-0000-0000-0000-000000000005'), 700000, 'available drops by the wager');
select is((select balance_cents from public.league_balances where user_id = auth.uid()), 700000, 'balance reflects the open wager');

-- edit: change side and raise wager to 8k (available 7k + existing 3k = 10k)
select lives_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'away', 800000) $$, (select league_id from t)), 'alice edits her pick');
select is((select count(*)::int from public.picks where user_id = auth.uid()), 1, 'still one pick per game');
select is((select wager_cents from public.picks where user_id = auth.uid()), 800000, 'wager updated');
select is(public.available_cents((select league_id from t), auth.uid(), '20000000-0000-0000-0000-000000000005'), 200000, 'available recomputed after edit');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'away', 1100000) $$, (select league_id from t)),
  'P0001', null, 'edit over budget rejected');

-- a second game shares the same weekly budget
select lives_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000004', 'home', 200000) $$, (select league_id from t)), 'alice bets 2k on a week-14 game');
select is(public.available_cents((select league_id from t), auth.uid(), '20000000-0000-0000-0000-000000000014'), 0, 'week-14 available = (10k - 8k open in week 5) - 2k wagered this week = 0');
reset role;

-- week-14 budget excludes only week-14 rows, so the open week-5 wager still counts against it
select is(public.week_budget_cents((select league_id from t), '00000000-0000-0000-0000-00000000000a', '20000000-0000-0000-0000-000000000014'), 200000,
  'week-14 budget = balance excluding week-14 rows (10k - 8k week-5 wager)');

-- ---- remove a pick refunds it
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.delete_pick((select id from public.picks where game_id = '30000000-0000-0000-0000-000000000004' and user_id = auth.uid())) $$, 'alice removes the week-14 pick');
select is((select count(*)::int from public.picks where user_id = auth.uid()), 1, 'pick deleted');
select is((select balance_cents from public.league_balances where user_id = auth.uid()), 200000, 'refund restores balance (10k - 8k open)');
select throws_ok($$ select public.delete_pick('30000000-0000-0000-0000-000000000009') $$, 'P0002', null, 'deleting an unknown pick fails');
reset role;

-- ---- visibility: bob cannot see alice's open pick when hiding is on, can when off
update public.app_settings set hide_picks_until_kickoff = true where id = 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.picks where user_id = '00000000-0000-0000-0000-00000000000a'), 0, 'hidden until the deadline');
reset role;
update public.app_settings set hide_picks_until_kickoff = false where id = 1;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.picks where user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'visible to league-mates when the setting is off');
select throws_ok($$ insert into public.picks (league_id, user_id, week_id, game_id, line_id, side, wager_cents)
  values ((select league_id from t), auth.uid(), '20000000-0000-0000-0000-000000000005', '30000000-0000-0000-0000-000000000001',
          (select id from public.lines where game_id = '30000000-0000-0000-0000-000000000001'), 'home', 100000) $$,
  '42501', null, 'picks cannot be inserted directly');
select throws_ok($$ select public.delete_pick((select id from public.picks where user_id = '00000000-0000-0000-0000-00000000000a')) $$,
  'P0002', null, 'bob cannot delete alice''s pick');
reset role;

-- ---- outsider
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 100000) $$, (select league_id from t)),
  '42501', null, 'non-member cannot bet');
select is((select count(*)::int from public.picks), 0, 'outsider sees no picks');
reset role;

-- ---- bye weeks
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.take_bye(%L, '20000000-0000-0000-0000-000000000014') $$, (select league_id from t)), 'P0001', null, 'no byes after week 13');
select lives_ok(format($$ select public.take_bye(%L, '20000000-0000-0000-0000-000000000005') $$, (select league_id from t)), 'bob takes his bye in week 5');
select is((select bye_week_id from public.league_members where user_id = auth.uid()), '20000000-0000-0000-0000-000000000005'::uuid, 'bye recorded');
select is((select count(*)::int from public.league_events where kind = 'bye_used' and subject_user_id = auth.uid()), 1, 'bye event posted');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 100000) $$, (select league_id from t)),
  'P0001', null, 'cannot bet during your bye week');
select lives_ok(format($$ select public.cancel_bye(%L, '20000000-0000-0000-0000-000000000005') $$, (select league_id from t)), 'bob cancels the bye');
select is((select count(*)::int from public.league_events where kind = 'bye_used'), 0, 'bye event withdrawn');
select lives_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'home', 100000) $$, (select league_id from t)), 'bob can bet again');
select throws_ok(format($$ select public.take_bye(%L, '20000000-0000-0000-0000-000000000005') $$, (select league_id from t)), 'P0001', null, 'cannot take a bye with picks in place');
reset role;

-- ---- system picks: service role only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select public.system_place_pick(%L, %L, '30000000-0000-0000-0000-000000000001', 'home', 100000) $$,
  (select league_id from t), '00000000-0000-0000-0000-00000000000b'), '42501', null, 'members cannot place system picks');
reset role;
select pg_temp.as_service();
select lives_ok(format($$ select public.system_place_pick(%L, %L, '30000000-0000-0000-0000-000000000001', 'away', 100000) $$,
  (select league_id from t), '00000000-0000-0000-0000-00000000000b'), 'jobs can place a system pick (edits bob''s existing one)');
select is((select placed_by::text from public.picks where user_id = '00000000-0000-0000-0000-00000000000b'), 'system', 'pick marked as system-placed');
reset role;

select * from finish();
rollback;
