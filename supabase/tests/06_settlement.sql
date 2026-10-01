begin;
select plan(61);

-- ---- fixtures: season, weeks 3/5/14/18, four users, one league
-- a seeded local stack already has an active season (seed.sql); the fixtures below take over
update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
insert into public.weeks (id, season_id, week_number) values
  ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 3),
  ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5),
  ('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000001', 14),
  ('20000000-0000-0000-0000-000000000018', '10000000-0000-0000-0000-000000000001', 18);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cara@example.com',  '{"display_name": "Cara"}'),
  ('00000000-0000-0000-0000-00000000000d', 'dave@example.com',  '{"display_name": "Dave"}');

create or replace function pg_temp.team(p_abbr text) returns uuid language sql as $$
  select id from public.teams where abbreviation = p_abbr $$;

-- week 5: g1..g5 (g4 kicks off last), week 14: g6, week 18: g7 + g8
insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g1', pg_temp.team('NYG'), pg_temp.team('DAL'), now() + interval '3 days'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g2', pg_temp.team('KC'),  pg_temp.team('BUF'), now() + interval '3 days'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g3', pg_temp.team('PHI'), pg_temp.team('GB'),  now() + interval '3 days'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g4', pg_temp.team('MIA'), pg_temp.team('NYJ'), now() + interval '4 days'),
  ('30000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g5', pg_temp.team('SEA'), pg_temp.team('LAR'), now() + interval '3 days'),
  ('30000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000014', 'g6', pg_temp.team('DEN'), pg_temp.team('LV'),  now() + interval '60 days'),
  ('30000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000018', 'g7', pg_temp.team('CHI'), pg_temp.team('DET'), now() + interval '90 days'),
  ('30000000-0000-0000-0000-000000000008', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000018', 'g8', pg_temp.team('ATL'), pg_temp.team('NO'),  now() + interval '90 days');
insert into public.lines (game_id, home_spread, source) values
  ('30000000-0000-0000-0000-000000000001', -3.5, 'api'),   -- NYG favoured
  ('30000000-0000-0000-0000-000000000002', 2.5, 'api'),    -- KC home underdog
  ('30000000-0000-0000-0000-000000000003', 0, 'api'),      -- pick 'em
  ('30000000-0000-0000-0000-000000000004', -7, 'api'),     -- MIA favoured, NYJ the underdog
  ('30000000-0000-0000-0000-000000000005', -1, 'api'),
  ('30000000-0000-0000-0000-000000000006', -3, 'api'),
  ('30000000-0000-0000-0000-000000000007', -6.5, 'api'),
  ('30000000-0000-0000-0000-000000000008', -2, 'api');

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('role', 'service_role', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'service_role', true);
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
end $$;
-- kickoff at 23:59:59 tonight (Eastern): the deadline (23:59 last night) has passed, the game has not started
create or replace function pg_temp.tonight() returns timestamptz language sql as $$
  select ((now() at time zone 'America/New_York')::date + time '23:59:59') at time zone 'America/New_York' $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Settle League');
reset role;
create temp table t as select id as league_id, invite_code from public.leagues limit 1;
grant select on t to authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_league((select invite_code from t));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.join_league((select invite_code from t));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.join_league((select invite_code from t));
reset role;
-- dave already burned his bye in week 3
update public.league_members set bye_week_id = '20000000-0000-0000-0000-000000000003'
 where user_id = '00000000-0000-0000-0000-00000000000d';

-- ---- week 5 picks: alice spreads it around, bob goes all in, cara and dave do nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000001', 'home', 300000);
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000002', 'away', 200000);
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000003', 'home', 100000);
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000005', 'home', 100000);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000001', 'home', 1000000);
reset role;

-- ---- guards: members cannot settle anything
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.settle_game('30000000-0000-0000-0000-000000000001') $$, '42501', null, 'members cannot settle a game');
select throws_ok($$ select public.settle_week('20000000-0000-0000-0000-000000000005') $$, '42501', null, 'members cannot settle a week');
select throws_ok($$ select public.void_game('30000000-0000-0000-0000-000000000001') $$, '42501', null, 'members cannot void a game');
select throws_ok($$ select public.weekly_action_check('20000000-0000-0000-0000-000000000005') $$, '42501', null, 'members cannot run the action check');
reset role;

-- ---- action check: nothing to do before the last deadline
select pg_temp.as_service();
select is((public.weekly_action_check('20000000-0000-0000-0000-000000000005')) ->> 'ready', 'false', 'action check waits for the last deadline');
select throws_ok($$ select public.settle_game('30000000-0000-0000-0000-000000000001') $$, 'P0001', null, 'a scheduled game cannot be settled');
reset role;

-- deadlines pass: every week-5 game kicks off tonight, g4 last
update public.games set kickoff_at = pg_temp.tonight() - interval '1 second'
 where week_id = '20000000-0000-0000-0000-000000000005';
update public.games set kickoff_at = pg_temp.tonight() where id = '30000000-0000-0000-0000-000000000004';
select is((select last_game_id from public.weeks where id = '20000000-0000-0000-0000-000000000005'),
  '30000000-0000-0000-0000-000000000004'::uuid, 'g4 is the last game of week 5');
select ok((select last_deadline_at <= now() from public.weeks where id = '20000000-0000-0000-0000-000000000005'), 'week-5 deadline has passed');

-- ---- action check: cara gets her bye, dave (no bye left) is forced onto the underdog
select pg_temp.as_service();
create temp table ac as select public.weekly_action_check('20000000-0000-0000-0000-000000000005') as r;
select is((select r ->> 'byes' from ac), '1', 'one automatic bye');
select is((select r ->> 'forced' from ac), '1', 'one forced pick');
select is((select r -> 'errors' from ac), '[]'::jsonb, 'no errors');
reset role;
select is((select bye_week_id from public.league_members where user_id = '00000000-0000-0000-0000-00000000000c'),
  '20000000-0000-0000-0000-000000000005'::uuid, 'cara''s bye is week 5');
select is((select count(*)::int from public.league_events where kind = 'bye_used' and subject_user_id = '00000000-0000-0000-0000-00000000000c' and (payload ->> 'automatic')::boolean),
  1, 'automatic bye event posted');
select results_eq(
  $$ select game_id, side::text, wager_cents, placed_by::text from public.picks where user_id = '00000000-0000-0000-0000-00000000000d' $$,
  $$ values ('30000000-0000-0000-0000-000000000004'::uuid, 'away', 100000, 'system') $$,
  'dave has 1k on the underdog (NYJ) of the last game, placed by the system');
select is((select count(*)::int from public.league_events where kind = 'forced_pick' and subject_user_id = '00000000-0000-0000-0000-00000000000d'), 1, 'forced-pick event posted');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000d'), 900000, 'forced wager taken from dave''s balance');
select ok((select action_checked_at is not null from public.weeks where id = '20000000-0000-0000-0000-000000000005'), 'week marked as checked');

select pg_temp.as_service();
select is((public.weekly_action_check('20000000-0000-0000-0000-000000000005')) ->> 'forced', '0', 'action check is idempotent');
select is((select count(*)::int from public.picks where user_id = '00000000-0000-0000-0000-00000000000d'), 1, 'still one forced pick');

-- ---- settle_game: g1 NYG 21-20 DAL: NYG -3.5 fails to cover -> alice and bob lose
update public.games set status = 'final' where id = '30000000-0000-0000-0000-000000000001';
select throws_ok($$ select public.settle_game('30000000-0000-0000-0000-000000000001') $$, 'P0001', null, 'a final game without a score cannot be settled');
update public.games set home_score = 21, away_score = 20 where id = '30000000-0000-0000-0000-000000000001';
select is(public.settle_game('30000000-0000-0000-0000-000000000001'), 2, 'two picks graded');
select is(public.settle_game('30000000-0000-0000-0000-000000000001'), 0, 'settling again is a no-op');
select results_eq(
  $$ select status::text from public.picks where game_id = '30000000-0000-0000-0000-000000000001' order by user_id $$,
  $$ values ('lost'), ('lost') $$, 'both picks lost');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000b'), 0, 'bob is at zero');
select is((select r ->> 'ready' from (select public.settle_week('20000000-0000-0000-0000-000000000005') as r) x), 'false', 'week is not settled while games remain');
select ok((select eliminated_at is null from public.league_members where user_id = '00000000-0000-0000-0000-00000000000b'), 'nobody is eliminated mid-week');

-- g2 KC 20-24 BUF: BUF -2.5 covers -> alice wins 2k. g3 PHI 21-21 GB: push -> alice loses 1k.
-- g4 MIA 30-23 NYJ: exactly the number -> push, dave loses. g5 abandoned -> alice refunded.
update public.games set status = 'final', home_score = 20, away_score = 24 where id = '30000000-0000-0000-0000-000000000002';
update public.games set status = 'final', home_score = 21, away_score = 21 where id = '30000000-0000-0000-0000-000000000003';
update public.games set status = 'final', home_score = 30, away_score = 23 where id = '30000000-0000-0000-0000-000000000004';
select is(public.void_game('30000000-0000-0000-0000-000000000005', 'Stadium flooded'), 1, 'voiding settles the open pick');
select is((select status::text from public.games where id = '30000000-0000-0000-0000-000000000005'), 'void', 'game marked void');
select is((select status::text from public.picks where game_id = '30000000-0000-0000-0000-000000000005'), 'void', 'pick marked void');
select is((select count(*)::int from public.ledger where kind = 'refund' and user_id = '00000000-0000-0000-0000-00000000000a'), 1, 'refund row written');

create temp table sw as select public.settle_week('20000000-0000-0000-0000-000000000005') as r;
select is((select r ->> 'ready' from sw), 'true', 'week 5 settled');
select is((select r ->> 'picks_settled' from sw), '3', 'remaining three picks graded by settle_week (g5 was graded when voided)');
select is((select r ->> 'eliminated' from sw), '1', 'one elimination');
select is((select r ->> 'completed' from sw), '0', 'league still running');
reset role;

select results_eq(
  $$ select user_id, status::text from public.picks where week_id = '20000000-0000-0000-0000-000000000005' and game_id <> '30000000-0000-0000-0000-000000000001' order by user_id, game_id $$,
  $$ values ('00000000-0000-0000-0000-00000000000a'::uuid, 'won'), ('00000000-0000-0000-0000-00000000000a'::uuid, 'push'),
            ('00000000-0000-0000-0000-00000000000a'::uuid, 'void'), ('00000000-0000-0000-0000-00000000000d'::uuid, 'push') $$,
  'win, push, void and dave''s push graded');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000a'), 800000, 'alice: 10k - 3k lost + 2k won - 1k push + 1k refunded = 8k');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000c'), 1000000, 'cara (bye) untouched');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000d'), 900000, 'dave: push is a loss');
select ok((select eliminated_at is not null from public.league_members where user_id = '00000000-0000-0000-0000-00000000000b'), 'bob is eliminated');
select is((select eliminated_week_id from public.league_members where user_id = '00000000-0000-0000-0000-00000000000b'), '20000000-0000-0000-0000-000000000005'::uuid, 'eliminated in week 5');
select is((select count(*)::int from public.league_events where kind = 'member_eliminated'), 1, 'elimination announced');
select is((select count(*)::int from public.league_events where kind = 'week_settled'), 1, 'week_settled announced once');
select ok((select settled_at is not null from public.weeks where id = '20000000-0000-0000-0000-000000000005'), 'week.settled_at stamped');

select pg_temp.as_service();
select is((public.settle_week('20000000-0000-0000-0000-000000000005')) ->> 'events', '0', 'settle_week is idempotent');
reset role;

-- eliminated members are done
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000006', 'home', 100000) $$, (select league_id from t)),
  'P0001', null, 'an eliminated member cannot bet');
reset role;

-- ---- week 14: cara and dave go broke on the same game -> alice is the last one standing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000006', 'home', 1000000);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000006', 'home', 900000);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000006', 'away', 100000);
reset role;
update public.games set status = 'final', home_score = 17, away_score = 20 where id = '30000000-0000-0000-0000-000000000006';
select pg_temp.as_service();
create temp table sw14 as select public.settle_week('20000000-0000-0000-0000-000000000014') as r;
select is((select r ->> 'eliminated' from sw14), '2', 'cara and dave eliminated');
select is((select r ->> 'completed' from sw14), '1', 'league completed');
reset role;
select is((select status::text from public.leagues where id = (select league_id from t)), 'complete', 'league is complete');
select is((select winner_user_id from public.leagues where id = (select league_id from t)), '00000000-0000-0000-0000-00000000000a'::uuid, 'alice wins');
select is((select payload ->> 'reason' from public.league_events where kind = 'season_complete'), 'last_standing', 'won as the last one standing');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000a'), 900000, 'alice: 8k - 1k + 2k = 9k');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000007', 'home', 100000) $$, (select league_id from t)),
  'P0001', null, 'no more bets in a completed league');
reset role;

-- ---- season end: a second league where nobody busts; tie broken by less money risked
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Late League');
reset role;
create temp table t2 as select id as league_id, invite_code from public.leagues where name = 'Late League';
grant select on t2 to authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_league((select invite_code from t2));
select public.place_pick((select league_id from t2), '30000000-0000-0000-0000-000000000007', 'home', 200000);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.place_pick((select league_id from t2), '30000000-0000-0000-0000-000000000007', 'home', 200000);
select public.place_pick((select league_id from t2), '30000000-0000-0000-0000-000000000008', 'home', 100000);
reset role;
update public.games set status = 'final', home_score = 31, away_score = 10 where id = '30000000-0000-0000-0000-000000000007';
select pg_temp.as_service();
select public.void_game('30000000-0000-0000-0000-000000000008');
create temp table sw18 as select public.settle_week('20000000-0000-0000-0000-000000000018') as r;
select is((select r ->> 'eliminated' from sw18), '0', 'nobody eliminated in week 18');
select is((select r ->> 'completed' from sw18), '1', 'late league completed at season end');
reset role;
select is((select balance_cents from public.league_balances where league_id = (select league_id from t2) and user_id = '00000000-0000-0000-0000-00000000000a'), 1200000, 'alice 12k');
select is((select balance_cents from public.league_balances where league_id = (select league_id from t2) and user_id = '00000000-0000-0000-0000-00000000000b'), 1200000, 'bob 12k');
select is((select winner_user_id from public.leagues where id = (select league_id from t2)), '00000000-0000-0000-0000-00000000000b'::uuid, 'tie goes to bob, who risked less');
select is((select payload ->> 'reason' from public.league_events where kind = 'season_complete' and league_id = (select league_id from t2)), 'season_end', 'won at season end');
select is((select count(*)::int from public.league_events where kind = 'week_settled'), 3, 'week_settled posted per open league (weeks 5 and 14 for the first league, 18 for the late one)');

-- ---- member stats view (derived from picks; same visibility as picks)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select results_eq(
  $$ select wins, losses, pushes, voids, net_cents, biggest_win_cents from public.league_member_stats
     where league_id = (select league_id from t) and user_id = auth.uid() $$,
  $$ values (2, 1, 1, 1, -100000, 200000) $$,
  'alice: 2-1-1 ATS, one void, net -1k, biggest win 2k');
select is((select forced_picks from public.league_member_stats where league_id = (select league_id from t) and user_id = '00000000-0000-0000-0000-00000000000d'), 1, 'dave''s forced pick counted');
reset role;

select * from finish();
rollback;
