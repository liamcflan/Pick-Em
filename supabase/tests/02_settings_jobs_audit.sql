begin;
select plan(13);

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000001', 'admin@example.com', '{"display_name": "Admin"}'),
  ('00000000-0000-0000-0000-000000000002', 'user@example.com', '{"display_name": "User"}');
update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-000000000001';

insert into public.job_runs (job_name, status, finished_at, detail)
values ('health', 'succeeded', now(), '{"n": 1}');

-- ---- regular user
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}', true);

select is((select count(*)::int from public.app_settings), 1, 'user can read settings');
update public.app_settings set spread_lock_day = 4 where id = 1;
select is((select spread_lock_day from public.app_settings), 3::smallint, 'user cannot change settings (RLS filters row)');

select is((select count(*)::int from public.job_runs), 0, 'user cannot read job runs');
select throws_ok(
  $$ insert into public.job_runs (job_name) values ('x') $$,
  '42501', null, 'user cannot insert job runs'
);
select throws_ok(
  $$ insert into public.audit_log (table_name, row_id, action) values ('x', gen_random_uuid(), 'insert') $$,
  '42501', null, 'user cannot write audit log'
);
reset role;

-- ---- site admin
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select set_config('app.request_id', 'req-42', true);

select is(public.is_site_admin(), true, 'admin flag is visible through is_site_admin()');
select lives_ok($$ update public.app_settings set spread_lock_day = 4, hide_picks_until_kickoff = true where id = 1 $$, 'admin can update settings');
select is((select spread_lock_day from public.app_settings), 4::smallint, 'settings change persisted');
select is((select count(*)::int from public.job_runs), 1, 'admin can read job runs');

select is(
  (select count(*)::int from public.audit_log
    where table_name = 'app_settings' and action = 'update'
      and actor_id = '00000000-0000-0000-0000-000000000001'
      and request_id = 'req-42'
      and (old_data ->> 'spread_lock_day')::int = 3 and (new_data ->> 'spread_lock_day')::int = 4),
  1,
  'settings change audited with actor, request id and diff'
);

select ok((select count(*) from public.audit_log) >= 3, 'admin can read all audit rows');
reset role;

-- ---- append-only, even for superuser/service role
select throws_ok(
  $$ update public.audit_log set new_data = '{}' where table_name = 'app_settings' $$,
  'P0001', 'audit_log is append-only', 'audit rows cannot be updated'
);
select throws_ok(
  $$ delete from public.audit_log $$,
  'P0001', 'audit_log is append-only', 'audit rows cannot be deleted'
);

select * from finish();
rollback;
