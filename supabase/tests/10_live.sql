begin;
select plan(2);

select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'),
  'games is published to Realtime'
);
select ok(
  not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('ledger', 'picks', 'profiles', 'audit_log')),
  'member and money tables are not streamed'
);

select * from finish();
rollback;
