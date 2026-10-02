-- 0010 member stats: record against the spread, money risked and won, biggest win. Derived from
-- picks, so it is always consistent with settlement. security_invoker: members see what the
-- picks policy lets them see (own picks always; league-mates' per the hide setting).

create view public.league_member_stats
with (security_invoker = true)
as
  select
    p.league_id,
    p.user_id,
    count(*) filter (where p.status = 'won')::integer  as wins,
    count(*) filter (where p.status = 'lost')::integer as losses,
    count(*) filter (where p.status = 'push')::integer as pushes,
    count(*) filter (where p.status = 'void')::integer as voids,
    count(*) filter (where p.status = 'open')::integer as open_picks,
    coalesce(sum(p.wager_cents) filter (where p.status in ('won', 'lost', 'push')), 0)::integer as settled_risked_cents,
    coalesce(sum(case p.status when 'won' then p.wager_cents when 'lost' then -p.wager_cents when 'push' then -p.wager_cents else 0 end), 0)::integer as net_cents,
    coalesce(max(p.wager_cents) filter (where p.status = 'won'), 0)::integer as biggest_win_cents,
    count(*) filter (where p.placed_by = 'system')::integer as forced_picks
  from public.picks p
  group by p.league_id, p.user_id;

grant select on public.league_member_stats to authenticated, service_role;
