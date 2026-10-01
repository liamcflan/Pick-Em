begin;
select plan(8);

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
  ('00000000-0000-0000-0000-00000000000c', 'cara@example.com',  '{"display_name": "Cara"}');

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
select public.create_league('Reminder League');
reset role;
create temp table t as select id as league_id, invite_code from public.leagues where name = 'Reminder League';
grant select on t to authenticated, service_role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_league((select invite_code from t));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select public.join_league((select invite_code from t));
-- cara opts out
update public.profiles set reminders_enabled = false where id = auth.uid();
-- alice has a pick in
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.place_pick((select league_id from t), '30000000-0000-0000-0000-000000000001', 'home', 100000);
select throws_ok($$ select * from public.picks_due_reminders('20000000-0000-0000-0000-000000000005') $$, '42501', null, 'members cannot list reminders');
reset role;

select pg_temp.as_service();
select results_eq(
  $$ select email, league_name, available_cents from public.picks_due_reminders('20000000-0000-0000-0000-000000000005') $$,
  $$ values ('bob@example.com', 'Reminder League', 1000000) $$,
  'only bob is due: alice has a pick, cara opted out');
select lives_ok($$ select public.record_reminder('00000000-0000-0000-0000-00000000000b', (select league_id from t), '20000000-0000-0000-0000-000000000005') $$, 'reminder recorded');
select lives_ok($$ select public.record_reminder('00000000-0000-0000-0000-00000000000b', (select league_id from t), '20000000-0000-0000-0000-000000000005') $$, 'recording twice is harmless');
select is((select count(*)::int from public.picks_due_reminders('20000000-0000-0000-0000-000000000005')), 0, 'nobody is due after the reminder');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.reminder_log), 1, 'bob sees his own reminder');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.reminder_log), 0, 'alice does not see bob''s');
select throws_ok($$ insert into public.reminder_log (user_id, league_id, week_id) values (auth.uid(), (select league_id from t), '20000000-0000-0000-0000-000000000005') $$,
  '42501', null, 'members cannot write the log');
reset role;

select * from finish();
rollback;
