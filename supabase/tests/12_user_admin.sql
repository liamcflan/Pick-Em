begin;
select plan(20);

update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
insert into public.weeks (id, season_id, week_number) values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '{"display_name": "Admin"}');
-- Seeded data may already contain admins; this test reasons about exactly one.
update public.profiles set is_site_admin = (id = '00000000-0000-0000-0000-000000000001');

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- Alice creates a league (commissioner); Bob joins it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select public.create_league('Admin Test League');
reset role;
create temp table t as select id as league_id, invite_code from public.leagues where name = 'Admin Test League';
grant select on t to authenticated;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select public.join_league((select invite_code from t));
reset role;

-- ---- listing users
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select * from public.admin_list_users() $$, '42501', null, 'members cannot list users');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select ok((select count(*) >= 3 from public.admin_list_users()), 'admin lists every user');
select is((select email from public.admin_list_users() where id = '00000000-0000-0000-0000-00000000000b'),
  'bob@example.com', 'emails are included for admins');
select is((select leagues -> 0 ->> 'role' from public.admin_list_users() where id = '00000000-0000-0000-0000-00000000000a'),
  'commissioner', 'league roles are included');
select is((select jsonb_array_length(leagues) from public.admin_list_users() where id = '00000000-0000-0000-0000-000000000001'),
  0, 'users without leagues get an empty list');
reset role;

-- ---- site admin flag
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ select public.set_site_admin('00000000-0000-0000-0000-00000000000b', true) $$,
  '42501', null, 'members cannot make themselves admin');
select throws_ok($$ update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-00000000000b' $$,
  '42501', null, 'and cannot write the column directly');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select throws_ok($$ select public.set_site_admin('00000000-0000-0000-0000-000000000001', false) $$,
  'P0001', 'the site needs at least one site admin', 'the last admin cannot be removed');
select throws_ok($$ select public.set_site_admin('00000000-0000-0000-0000-0000000000ff', true) $$,
  'P0002', null, 'unknown user');
select lives_ok($$ select public.set_site_admin('00000000-0000-0000-0000-00000000000a', true) $$, 'admin grants admin');
reset role;
select ok((select is_site_admin from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'alice is now an admin');
select ok(exists (
  select 1 from public.audit_log
   where table_name = 'profiles' and row_id = '00000000-0000-0000-0000-00000000000a'
     and action = 'update' and actor_id = '00000000-0000-0000-0000-000000000001'
     and (new_data ->> 'is_site_admin')::boolean
), 'the grant is audited with the acting admin');

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok($$ select public.set_site_admin('00000000-0000-0000-0000-000000000001', false) $$,
  'an admin can step down while another admin remains');
reset role;
select is((select count(*)::int from public.profiles where is_site_admin), 1, 'one admin left');

-- ---- league roles
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select throws_ok(format($$ select public.set_member_role(%L, '00000000-0000-0000-0000-00000000000b', 'commissioner') $$,
  (select league_id from t)), '42501', null, 'members cannot promote themselves');
reset role;

-- Alice is the remaining site admin; make Admin (no longer admin, not a member) unable, and test
-- that a site admin who is not in the league can change roles there.
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select throws_ok(format($$ select public.set_member_role(%L, '00000000-0000-0000-0000-00000000000b', 'commissioner') $$,
  (select league_id from t)), '42501', null, 'outsiders who are not admins cannot change roles');
reset role;
update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-000000000001';
select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select lives_ok(format($$ select public.set_member_role(%L, '00000000-0000-0000-0000-00000000000b', 'commissioner') $$,
  (select league_id from t)), 'a site admin outside the league promotes bob');
select lives_ok(format($$ select public.set_member_role(%L, '00000000-0000-0000-0000-00000000000a', 'member') $$,
  (select league_id from t)), 'and demotes alice while bob remains commissioner');
select throws_ok(format($$ select public.set_member_role(%L, '00000000-0000-0000-0000-00000000000b', 'member') $$,
  (select league_id from t)), 'P0001', 'a league needs at least one commissioner', 'the last commissioner stays');
reset role;
select is((select role::text from public.league_members where league_id = (select league_id from t)
            and user_id = '00000000-0000-0000-0000-00000000000b'), 'commissioner', 'bob is commissioner');

select * from finish();
rollback;
