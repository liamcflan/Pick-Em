-- 0007 admin oversight: site admins can see every league (support, the admin league list) and
-- edit the season's shape. Read-only for admins; member data is still written only by functions.

create policy "leagues: site admins read"
  on public.leagues for select to authenticated using (public.is_site_admin());
create policy "league_members: site admins read"
  on public.league_members for select to authenticated using (public.is_site_admin());
create policy "ledger: site admins read"
  on public.ledger for select to authenticated using (public.is_site_admin());
create policy "league_events: site admins read"
  on public.league_events for select to authenticated using (public.is_site_admin());
create policy "picks: site admins read"
  on public.picks for select to authenticated using (public.is_site_admin());

-- Season shape: how many regular-season weeks count (the last one settles the winners) and when
-- the playoffs start (informational, shown on the admin page).
create or replace function public.update_season(
  p_season_id uuid, p_regular_season_weeks integer, p_playoffs_start_at timestamptz
)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform public.require_operator();
  update public.seasons
     set regular_season_weeks = coalesce(p_regular_season_weeks, regular_season_weeks),
         playoffs_start_at = p_playoffs_start_at
   where id = p_season_id;
  if not found then
    raise exception 'unknown season' using errcode = 'P0002';
  end if;
end;
$$;
revoke all on function public.update_season(uuid, integer, timestamptz) from public;
grant execute on function public.update_season(uuid, integer, timestamptz) to authenticated, service_role;

create trigger seasons_audit after insert or update or delete on public.seasons
  for each row execute function public.audit_row();
