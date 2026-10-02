begin;
select plan(39);

-- fixtures: season + three users
-- a seeded local stack already has an active season (seed.sql); the fixtures below take over
update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com',   '{"display_name": "Bob"}'),
  ('00000000-0000-0000-0000-00000000000c', 'cara@example.com',  '{"display_name": "Cara"}');

create or replace function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

-- ---- alice creates a league
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ select public.create_league('  Sunday Degens  ') $$, 'alice creates a league');
select is((select name from public.leagues), 'Sunday Degens', 'name trimmed');
select is((select starting_balance_cents from public.leagues), 1000000, 'starting balance defaults from settings');
select matches((select invite_code from public.leagues), '^[A-Z2-9]{8}$', 'invite code shape');
select is((select role from public.league_members where user_id = '00000000-0000-0000-0000-00000000000a'), 'commissioner', 'creator is commissioner');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000a'), 1000000, 'creator credited starting balance');
select is((select count(*)::int from public.league_events where kind = 'member_joined'), 1, 'join event posted');
select throws_ok($$ select public.create_league('x') $$, '23514', null, 'name too short rejected');
select throws_ok($$ insert into public.leagues (season_id, name, invite_code, created_by, starting_balance_cents)
  values ('10000000-0000-0000-0000-000000000001', 'Direct', 'ABCDEFGH', '00000000-0000-0000-0000-00000000000a', 1) $$,
  '42501', null, 'cannot insert leagues directly');
reset role;

-- capture the code as superuser
create temp table t as select id as league_id, invite_code from public.leagues limit 1;
grant select on t to authenticated;

-- ---- bob joins (lower-case, with a dash)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.leagues), 0, 'bob sees no leagues before joining');
select lives_ok(
  format($$ select public.join_league(%L) $$, lower(substr((select invite_code from t), 1, 4)) || '-' || lower(substr((select invite_code from t), 5))),
  'bob joins with a lower-case dashed code'
);
select is((select count(*)::int from public.leagues), 1, 'bob now sees the league');
select is((select role from public.league_members where user_id = '00000000-0000-0000-0000-00000000000b'), 'member', 'bob is a plain member');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000b'), 1000000, 'bob credited starting balance');
select throws_ok(format($$ select public.join_league(%L) $$, (select invite_code from t)), '23505', null, 'cannot join twice');
select throws_ok($$ select public.join_league('ZZZZZZZZ') $$, 'P0002', null, 'unknown code rejected');
select throws_ok(format($$ select public.rotate_invite_code(%L) $$, (select league_id from t)), '42501', null, 'member cannot rotate the code');
select throws_ok(format($$ select public.update_league(%L, 'Hijacked', 1) $$, (select league_id from t)), '42501', null, 'member cannot update the league');
select throws_ok(format($$ select public.set_member_role(%L, %L, 'commissioner') $$, (select league_id from t), '00000000-0000-0000-0000-00000000000b'),
  '42501', null, 'member cannot promote themself');
select throws_ok($$ insert into public.ledger (league_id, user_id, kind, amount_cents) values ((select league_id from t), auth.uid(), 'adjustment', 1000000) $$,
  '42501', null, 'member cannot write the ledger');
reset role;

-- ---- cara is in no league: RLS isolation
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.leagues), 0, 'outsider sees no leagues');
select is((select count(*)::int from public.league_members), 0, 'outsider sees no members');
select is((select count(*)::int from public.ledger), 0, 'outsider sees no ledger rows');
select is((select count(*)::int from public.league_events), 0, 'outsider sees no events');
select is((select count(*)::int from public.league_balances), 0, 'outsider sees no balances');
reset role;

-- ---- commissioner powers
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok(format($$ select public.set_member_role(%L, %L, 'member') $$, (select league_id from t), '00000000-0000-0000-0000-00000000000a'),
  'P0001', null, 'cannot demote the last commissioner');
select lives_ok(format($$ select public.set_member_role(%L, %L, 'commissioner') $$, (select league_id from t), '00000000-0000-0000-0000-00000000000b'),
  'alice promotes bob');
select is((select count(*)::int from public.league_members where role = 'commissioner' and left_at is null), 2, 'two commissioners');
select lives_ok(format($$ select public.set_member_role(%L, %L, 'member') $$, (select league_id from t), '00000000-0000-0000-0000-00000000000a'),
  'alice can step down now that bob is a commissioner');
select throws_ok(format($$ select public.rotate_invite_code(%L) $$, (select league_id from t)), '42501', null, 'demoted alice cannot rotate the code');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select isnt((select public.rotate_invite_code((select league_id from t))), (select invite_code from t), 'bob rotates the invite code');
select lives_ok(format($$ select public.update_league(%L, 'Sunday Degens II', 500000) $$, (select league_id from t)), 'bob renames and lowers the starting balance');
select is((select balance_cents from public.league_balances where user_id = '00000000-0000-0000-0000-00000000000a'), 500000, 'balances rebased by adjustment, ledger untouched');
select is((select count(*)::int from public.ledger where kind = 'initial'), 2, 'initial rows kept (append-only)');
select lives_ok(format($$ select public.post_commissioner_note(%L, 'Lines are in, get your picks in by Saturday night') $$, (select league_id from t)), 'bob posts a note');
select lives_ok(format($$ select public.remove_member(%L, %L) $$, (select league_id from t), '00000000-0000-0000-0000-00000000000a'), 'bob removes alice');
select throws_ok(format($$ select public.remove_member(%L, %L) $$, (select league_id from t), '00000000-0000-0000-0000-00000000000b'),
  'P0001', null, 'last commissioner cannot leave');
reset role;

-- ---- alice is gone: cannot see the league, but her history remains
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.leagues), 0, 'removed member no longer sees the league');
reset role;
select is((select count(*)::int from public.ledger where user_id = '00000000-0000-0000-0000-00000000000a'), 2, 'removed member''s ledger rows are retained');

select * from finish();
rollback;
