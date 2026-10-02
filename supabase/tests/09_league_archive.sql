begin;
select plan(18);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
insert into public.weeks (id, season_id, week_number) values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5);
insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g1',
    (select id from public.teams where abbreviation = 'NYG'), (select id from public.teams where abbreviation = 'DAL'), now() + interval '3 days');
insert into public.lines (game_id, home_spread, source) values ('30000000-0000-0000-0000-000000000001', -3.5, 'api');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '{"display_name": "Admin"}');
update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-000000000001';

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

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Dry Run');
reset role;
create temp table t as select id as league_id, invite_code from public.leagues where name = 'Dry Run';
grant select on t to authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000001', 'home', 100000);
select is((select count(*)::int from public.leagues), 1, 'alice sees her league');
select throws_ok(format($$ select public.archive_league(%L) $$, (select league_id from t)), '42501', null, 'members cannot archive');
reset role;

-- ---- archive
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$ select public.archive_league(%L) $$, (select league_id from t)), 'admin archives the league');
select throws_ok($$ select public.archive_league('00000000-0000-0000-0000-000000000000') $$, 'P0002', null, 'unknown league');
select ok((select archived_at is not null from public.leagues where id = (select league_id from t)), 'archived_at stamped');
select is((select count(*)::int from public.leagues), 1, 'admin still sees it');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.leagues), 0, 'archived league vanishes for members');
select is((select count(*)::int from public.picks), 0, 'and so do its picks');
select is((select count(*)::int from public.league_members), 0, 'and memberships');
select is(public.is_league_commissioner((select league_id from t)), false, 'commissioner powers suspended');
select throws_ok(format($$ select public.place_pick(%L, '30000000-0000-0000-0000-000000000001', 'away', 100000) $$, (select league_id from t)),
  'P0001', null, 'no picks in an archived league');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.join_league(%L) $$, (select invite_code from t)), 'P0001', null, 'no joining an archived league');
reset role;

-- settlement skips it: g1 goes final, week settles, alice's pick is graded (per game) but no
-- week_settled event or elimination touches the archived league
update public.games set status = 'final', home_score = 10, away_score = 30 where id = '30000000-0000-0000-0000-000000000001';
select pg_temp.as_service();
select is((public.settle_week('20000000-0000-0000-0000-000000000005')) ->> 'events', '0', 'archived league gets no week_settled event');
reset role;
select is((select count(*)::int from public.ledger where league_id = (select league_id from t)), 2, 'ledger untouched beyond the wager (initial + wager)');

-- ---- restore
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$ select public.archive_league(%L, false) $$, (select league_id from t)), 'admin restores the league');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.leagues), 1, 'league is back for its members');
select is((select status::text from public.picks limit 1), 'lost', 'history intact (the pick was graded while archived)');
reset role;
select is((select count(*)::int from public.audit_log where table_name = 'leagues' and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000001'), 2, 'archive and restore audited');

select * from finish();
rollback;
