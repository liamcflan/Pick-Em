begin;
select plan(13);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
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

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Alice Only');
reset role;

-- ---- a member sees only their leagues; a site admin sees all of them
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.leagues), 0, 'non-member sees no leagues');
select is((select count(*)::int from public.ledger), 0, 'non-member sees no ledger rows');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select is((select count(*)::int from public.leagues), 1, 'site admin sees every league');
select is((select count(*)::int from public.league_members), 1, 'site admin sees memberships');
select is((select balance_cents from public.league_balances limit 1), 1000000, 'site admin sees balances');
select throws_ok($$ update public.leagues set name = 'Renamed' $$, '42501', null, 'site admin still cannot write leagues directly');
reset role;

-- ---- season editor
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.update_season('10000000-0000-0000-0000-000000000001', 17, '2031-01-10 18:00+00') $$,
  '42501', null, 'members cannot edit the season');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.update_season('10000000-0000-0000-0000-000000000001', 17, '2031-01-10 18:00+00') $$, 'admin edits the season');
select throws_ok($$ select public.update_season('10000000-0000-0000-0000-000000000009', 17, null) $$, 'P0002', null, 'unknown season');
select throws_ok($$ select public.update_season('10000000-0000-0000-0000-000000000001', 0, null) $$, '23514', null, 'weeks must be 1-22');
reset role;
select is((select regular_season_weeks from public.seasons where id = '10000000-0000-0000-0000-000000000001'), 17::smallint, 'weeks updated');
select is((select playoffs_start_at from public.seasons where id = '10000000-0000-0000-0000-000000000001'), '2031-01-10 18:00+00'::timestamptz, 'playoff date updated');
select is((select count(*)::int from public.audit_log where table_name = 'seasons' and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000001'), 1, 'season edit audited');

select * from finish();
rollback;
