begin;
select plan(20);

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

-- ---- bucket
select is((select public from storage.buckets where id = 'logos'), true, 'logos bucket is public-read');
select is((select file_size_limit from storage.buckets where id = 'logos'), 1048576::bigint, '1 MB cap');

-- ---- alice uploads into her own folder only
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner) values ('logos', '00000000-0000-0000-0000-00000000000a/logo-1.webp', auth.uid()) $$,
  'owner can upload under her folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('logos', '00000000-0000-0000-0000-00000000000b/logo-1.webp', auth.uid()) $$,
  '42501', null, 'cannot upload into someone else''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('logos', 'logo-1.webp', auth.uid()) $$,
  '42501', null, 'cannot upload at the bucket root');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner) values ('other', '00000000-0000-0000-0000-00000000000a/x.webp', auth.uid()) $$,
  '42501', null, 'cannot write to other buckets');
select lives_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000a/logo-1.webp' where id = auth.uid() $$,
  'avatar path under own folder accepted');
select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000b/logo-1.webp' where id = auth.uid() $$,
  'P0001', null, 'avatar path under another folder rejected');
select throws_ok($$ update public.profiles set avatar_path = '00000000-0000-0000-0000-00000000000a/../x' where id = auth.uid() $$,
  '23514', null, 'avatar path shape enforced (no traversal)');
reset role;

-- ---- bob can read alice's logo but not move it; deletes are policy-checked (Supabase blocks
-- direct SQL deletes on storage.objects, so the delete policy is asserted rather than exercised)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from storage.objects where bucket_id = 'logos'), 1, 'logos are readable by everyone');
update storage.objects set name = '00000000-0000-0000-0000-00000000000b/stolen.webp' where bucket_id = 'logos';
select is((select name from storage.objects where bucket_id = 'logos'), '00000000-0000-0000-0000-00000000000a/logo-1.webp', 'update of another member''s logo is filtered out');
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update storage.objects set name = '00000000-0000-0000-0000-00000000000b/moved.webp' where bucket_id = 'logos' $$,
  '42501', null, 'owner cannot move her logo into another folder');
reset role;
select policy_cmd_is('storage', 'objects', 'logos: owner deletes', 'DELETE', 'delete policy exists');
select policy_roles_are('storage', 'objects', 'logos: owner deletes', array['authenticated'], 'only signed-in owners may delete');
select policy_roles_are('storage', 'objects', 'logos: anyone can read', array['anon', 'authenticated'], 'read policy covers anon and members');

-- ---- timezone change moves deadlines
-- a seeded local stack already has an active season (seed.sql); the fixtures below take over
update public.seasons set is_active = false;
insert into public.seasons (id, year, is_active) values ('10000000-0000-0000-0000-000000000001', 2030, true);
insert into public.weeks (id, season_id, week_number) values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 5);
insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 'g1',
    (select id from public.teams where abbreviation = 'NYG'), (select id from public.teams where abbreviation = 'DAL'), '2026-10-04 17:00+00');
select is((select deadline_at from public.games where id = '30000000-0000-0000-0000-000000000001'),
  '2026-10-03 23:59 America/New_York'::timestamptz, 'deadline in Eastern by default');

select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ select public.refresh_game_deadlines() $$, '42501', null, 'members cannot recompute deadlines');
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-000000000001');
select throws_ok($$ update public.app_settings set timezone = 'Europe/London' where id = 1 $$, '23514', null, 'unknown timezone rejected');
update public.app_settings set timezone = 'America/Los_Angeles' where id = 1;
select ok(public.refresh_game_deadlines() >= 1, 'admin recomputes the scheduled games');
reset role;
select is((select deadline_at from public.games where id = '30000000-0000-0000-0000-000000000001'),
  '2026-10-03 23:59 America/Los_Angeles'::timestamptz, 'deadline now in Pacific');

select * from finish();
rollback;
