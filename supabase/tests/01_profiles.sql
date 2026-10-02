begin;
select plan(14);

-- two users via the auth trigger
insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"display_name": "Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bob@example.com', '{}');

select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Alice', 'display_name from metadata');
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'bob', 'display_name falls back to email local part');
select is((select is_site_admin from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), false, 'new users are not admins');

-- anon has no privileges at all on profiles
set local role anon;
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon cannot read profiles');
reset role;

-- alice, authenticated
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles), 2, 'authenticated users can read all profiles');
select is(public.is_site_admin(), false, 'alice is not site admin');

select lives_ok(
  $$ update public.profiles set display_name = 'Alice B' where id = '00000000-0000-0000-0000-00000000000a' $$,
  'alice can rename herself'
);
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000a'), 'Alice B', 'rename persisted');

-- RLS silently filters rows the user cannot update
update public.profiles set display_name = 'Hacked' where id = '00000000-0000-0000-0000-00000000000b';
select is((select display_name from public.profiles where id = '00000000-0000-0000-0000-00000000000b'), 'bob', 'alice cannot rename bob');

select throws_ok(
  $$ update public.profiles set is_site_admin = true where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'users cannot promote themselves (column privilege)'
);

select throws_ok(
  $$ insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-00000000000c', 'Mallory') $$,
  '42501',
  null,
  'users cannot insert profiles directly'
);

select throws_ok(
  $$ delete from public.profiles where id = '00000000-0000-0000-0000-00000000000a' $$,
  '42501',
  null,
  'users cannot delete profiles'
);

-- audit trail captured the rename with the actor
select is(
  (select count(*)::int from public.audit_log
    where table_name = 'profiles' and row_id = '00000000-0000-0000-0000-00000000000a' and action = 'update'
      and actor_id = '00000000-0000-0000-0000-00000000000a'
      and old_data ->> 'display_name' = 'Alice' and new_data ->> 'display_name' = 'Alice B'),
  1,
  'profile rename is audited with actor and before/after'
);

-- alice can see her own audit rows but not bob's signup insert (system-created, no actor)
select is(
  (select count(*)::int from public.audit_log where row_id = '00000000-0000-0000-0000-00000000000b'),
  0,
  'alice cannot read audit rows for bob'
);
reset role;

select * from finish();
rollback;
