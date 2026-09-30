-- Local/dev seed. Runs after migrations on `supabase start` / `supabase db reset` (never in prod).
-- Production data (teams come from the migration; seasons, weeks and games from the sync jobs).
--
-- Gives a fresh local stack something to click on: an active 2026 season with week 5 open, three
-- games kicking off in a few days, and consensus lines. The e2e "week" test adds its own games.

insert into public.seasons (id, year, is_active)
values ('10000000-0000-0000-0000-000000002026', 2026, true)
on conflict (year) do nothing;

insert into public.weeks (id, season_id, week_number, opens_at, spread_lock_at)
values ('20000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000002026', 5,
        now() - interval '1 day', now() - interval '1 hour')
on conflict (season_id, week_number) do nothing;

insert into public.games (id, season_id, week_id, espn_event_id, home_team_id, away_team_id, kickoff_at)
select v.id, '10000000-0000-0000-0000-000000002026', '20000000-0000-0000-0000-000000000005', v.espn,
       h.id, a.id, now() + v.kickoff
from (values
  ('30000000-0000-0000-0000-000000000501'::uuid, 'seed-501', 'NYG', 'DAL', interval '3 days'),
  ('30000000-0000-0000-0000-000000000502'::uuid, 'seed-502', 'KC',  'BUF', interval '3 days 3 hours'),
  ('30000000-0000-0000-0000-000000000503'::uuid, 'seed-503', 'PHI', 'GB',  interval '4 days')
) as v(id, espn, home, away, kickoff)
join public.teams h on h.abbreviation = v.home
join public.teams a on a.abbreviation = v.away
on conflict (espn_event_id) do nothing;

insert into public.lines (game_id, home_spread, source)
select g.id, s.spread, 'api'
from (values
  ('30000000-0000-0000-0000-000000000501'::uuid, -3.5),
  ('30000000-0000-0000-0000-000000000502'::uuid, 2.5),
  ('30000000-0000-0000-0000-000000000503'::uuid, -7)
) as s(game_id, spread)
join public.games g on g.id = s.game_id
where not exists (select 1 from public.lines l where l.game_id = g.id and l.is_current);
