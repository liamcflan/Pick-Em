begin;
select plan(16);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'app_settings', 'app_settings exists');
select has_table('public', 'job_runs', 'job_runs exists');
select has_table('public', 'audit_log', 'audit_log exists');

select has_function('public', 'is_site_admin', 'is_site_admin() exists');
select has_function('public', 'handle_new_user', 'handle_new_user() exists');
select has_function('public', 'audit_row', 'audit_row() exists');

select ok((select relrowsecurity from pg_class where oid = 'public.profiles'::regclass), 'RLS on profiles');
select ok((select relrowsecurity from pg_class where oid = 'public.app_settings'::regclass), 'RLS on app_settings');
select ok((select relrowsecurity from pg_class where oid = 'public.job_runs'::regclass), 'RLS on job_runs');
select ok((select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass), 'RLS on audit_log');

select is((select count(*)::int from public.app_settings), 1, 'exactly one settings row');
select is((select default_starting_balance_cents from public.app_settings), 1000000, 'default balance is $10,000');
select is((select spread_lock_day from public.app_settings), 3::smallint, 'default lock day is Wednesday');
select is((select hide_picks_until_kickoff from public.app_settings), false, 'picks visible by default');

select throws_ok(
  $$ insert into public.app_settings (id) values (2) $$,
  '23514',
  null,
  'app_settings is a singleton'
);

select * from finish();
rollback;
