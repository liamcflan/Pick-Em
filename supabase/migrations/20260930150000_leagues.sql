-- 0003 leagues: leagues, membership (many commissioners), ledger (balances), news feed.
-- All writes go through security-definer functions; RLS + column grants make the tables read-only
-- for signed-in users. Membership is soft (left_at) so the ledger stays append-only.

create type public.league_status as enum ('open', 'locked', 'complete');
create type public.member_role as enum ('member', 'commissioner');
create type public.ledger_kind as enum ('initial', 'wager', 'payout', 'refund', 'adjustment');
create type public.league_event_kind as enum (
  'member_joined', 'member_left', 'member_removed', 'role_changed', 'member_eliminated',
  'bye_used', 'forced_pick', 'line_edited', 'spreads_locked', 'week_settled', 'season_complete',
  'commissioner_note', 'league_updated'
);

-- ---------------------------------------------------------------------------
-- tables
-- ---------------------------------------------------------------------------
create table public.leagues (
  id                      uuid primary key default gen_random_uuid(),
  season_id               uuid not null references public.seasons (id),
  name                    text not null,
  invite_code             text not null unique,
  created_by              uuid not null references public.profiles (id),
  starting_balance_cents  integer not null,
  status                  public.league_status not null default 'open',
  winner_user_id          uuid references public.profiles (id),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint leagues_name_length check (char_length(btrim(name)) between 2 and 48),
  constraint leagues_balance_positive check (starting_balance_cents > 0),
  constraint leagues_invite_code_shape check (invite_code ~ '^[A-Z2-9]{8}$')
);

create index leagues_season_idx on public.leagues (season_id);

create trigger leagues_set_updated_at before update on public.leagues
  for each row execute function public.set_updated_at();
create trigger leagues_audit after insert or update or delete on public.leagues
  for each row execute function public.audit_row();

create table public.league_members (
  id                  uuid primary key default gen_random_uuid(),
  league_id           uuid not null references public.leagues (id) on delete cascade,
  user_id             uuid not null references public.profiles (id) on delete cascade,
  role                public.member_role not null default 'member',
  joined_week_id      uuid references public.weeks (id),
  bye_week_id         uuid references public.weeks (id),
  eliminated_at       timestamptz,
  eliminated_week_id  uuid references public.weeks (id),
  left_at             timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint league_members_unique unique (league_id, user_id)
);

create index league_members_user_idx on public.league_members (user_id) where left_at is null;

create trigger league_members_set_updated_at before update on public.league_members
  for each row execute function public.set_updated_at();
create trigger league_members_audit after insert or update or delete on public.league_members
  for each row execute function public.audit_row();

create table public.ledger (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues (id) on delete cascade,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  week_id       uuid references public.weeks (id),
  pick_id       uuid,                                  -- fk added with the picks table
  kind          public.ledger_kind not null,
  amount_cents  integer not null,
  note          text,
  created_at    timestamptz not null default now()
);

create index ledger_member_idx on public.ledger (league_id, user_id);
create unique index ledger_one_initial_per_member_idx on public.ledger (league_id, user_id) where kind = 'initial';

comment on table public.ledger is 'Append-only. A member''s balance is the sum of their rows. Updates/deletes are blocked for every role.';

create trigger ledger_append_only
  before update or delete on public.ledger
  for each row execute function public.audit_log_is_append_only();

create table public.league_events (
  id             bigint generated always as identity primary key,
  league_id      uuid not null references public.leagues (id) on delete cascade,
  kind           public.league_event_kind not null,
  actor_user_id  uuid references public.profiles (id) on delete set null,
  subject_user_id uuid references public.profiles (id) on delete set null,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index league_events_league_idx on public.league_events (league_id, created_at desc);

-- ---------------------------------------------------------------------------
-- balances
-- ---------------------------------------------------------------------------
create view public.league_balances
with (security_invoker = true)
as
  select league_id, user_id, sum(amount_cents)::integer as balance_cents,
         sum(case when kind = 'wager' then -amount_cents else 0 end)::integer as total_risked_cents
  from public.ledger
  group by league_id, user_id;

-- ---------------------------------------------------------------------------
-- membership helpers (security definer so RLS policies can use them without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id and m.user_id = auth.uid() and m.left_at is null
  );
$$;

create or replace function public.is_league_commissioner(p_league_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.league_members m
    where m.league_id = p_league_id and m.user_id = auth.uid()
      and m.left_at is null and m.role = 'commissioner'
  );
$$;

revoke all on function public.is_league_member(uuid) from public;
revoke all on function public.is_league_commissioner(uuid) from public;
grant execute on function public.is_league_member(uuid), public.is_league_commissioner(uuid) to authenticated, service_role;

-- 8 chars from an alphabet without look-alikes (no 0/O/1/I). ~1.1e12 combinations.
create or replace function public.generate_invite_code()
returns text
language plpgsql volatile set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
  i int;
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

create or replace function public.current_week_id(p_season_id uuid)
returns uuid
language sql stable set search_path = ''
as $$
  select w.id from public.weeks w
  where w.season_id = p_season_id and (w.last_deadline_at is null or w.last_deadline_at > now())
  order by w.week_number
  limit 1;
$$;

create or replace function public.post_league_event(
  p_league_id uuid, p_kind public.league_event_kind, p_actor uuid, p_subject uuid, p_payload jsonb default '{}'::jsonb
)
returns void
language sql volatile set search_path = ''
as $$
  insert into public.league_events (league_id, kind, actor_user_id, subject_user_id, payload)
  values (p_league_id, p_kind, p_actor, p_subject, coalesce(p_payload, '{}'::jsonb));
$$;

-- ---------------------------------------------------------------------------
-- league lifecycle functions
-- ---------------------------------------------------------------------------
create or replace function public.create_league(p_name text, p_starting_balance_cents integer default null)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_season    uuid;
  v_balance   integer;
  v_league    uuid;
  v_code      text;
  v_attempts  int := 0;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select id into v_season from public.seasons where is_active limit 1;
  if v_season is null then
    raise exception 'no active season' using errcode = 'P0001';
  end if;
  select coalesce(p_starting_balance_cents, default_starting_balance_cents) into v_balance
    from public.app_settings where id = 1;
  if v_balance is null or v_balance <= 0 then
    raise exception 'starting balance must be positive' using errcode = '23514';
  end if;

  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
    v_attempts := v_attempts + 1;
    if v_attempts > 10 then raise exception 'could not allocate invite code'; end if;
  end loop;

  insert into public.leagues (season_id, name, invite_code, created_by, starting_balance_cents)
  values (v_season, btrim(p_name), v_code, v_uid, v_balance)
  returning id into v_league;

  insert into public.league_members (league_id, user_id, role, joined_week_id)
  values (v_league, v_uid, 'commissioner', public.current_week_id(v_season));

  insert into public.ledger (league_id, user_id, kind, amount_cents, note)
  values (v_league, v_uid, 'initial', v_balance, 'starting balance');

  perform public.post_league_event(v_league, 'member_joined', v_uid, v_uid, jsonb_build_object('role', 'commissioner'));
  return v_league;
end;
$$;

create or replace function public.join_league(p_code text)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_league  public.leagues%rowtype;
  v_member  public.league_members%rowtype;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  select * into v_league from public.leagues
   where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_league.id is null then
    raise exception 'invite code not found' using errcode = 'P0002';
  end if;
  if v_league.status <> 'open' then
    raise exception 'league is not accepting members' using errcode = 'P0001';
  end if;

  select * into v_member from public.league_members where league_id = v_league.id and user_id = v_uid;
  if v_member.id is not null and v_member.left_at is null then
    raise exception 'already a member' using errcode = '23505';
  end if;

  if v_member.id is not null then
    -- rejoin: keep their history and balance, reactivate membership
    update public.league_members set left_at = null, role = 'member' where id = v_member.id;
  else
    insert into public.league_members (league_id, user_id, role, joined_week_id)
    values (v_league.id, v_uid, 'member', public.current_week_id(v_league.season_id));
    insert into public.ledger (league_id, user_id, kind, amount_cents, note)
    values (v_league.id, v_uid, 'initial', v_league.starting_balance_cents, 'starting balance');
  end if;

  perform public.post_league_event(v_league.id, 'member_joined', v_uid, v_uid, '{}'::jsonb);
  return v_league.id;
end;
$$;

create or replace function public.set_member_role(p_league_id uuid, p_user_id uuid, p_role public.member_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'only commissioners can change roles' using errcode = '42501';
  end if;
  if not exists (select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id and left_at is null) then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if p_role = 'member' and (
    select count(*) from public.league_members
    where league_id = p_league_id and role = 'commissioner' and left_at is null
  ) <= 1 and exists (
    select 1 from public.league_members where league_id = p_league_id and user_id = p_user_id and role = 'commissioner'
  ) then
    raise exception 'a league needs at least one commissioner' using errcode = 'P0001';
  end if;

  update public.league_members set role = p_role
  where league_id = p_league_id and user_id = p_user_id and left_at is null;

  perform public.post_league_event(p_league_id, 'role_changed', v_uid, p_user_id, jsonb_build_object('role', p_role));
end;
$$;

create or replace function public.remove_member(p_league_id uuid, p_user_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_self  boolean := (v_uid = p_user_id);
  v_role  public.member_role;
begin
  if not v_self and not public.is_league_commissioner(p_league_id) then
    raise exception 'only commissioners can remove members' using errcode = '42501';
  end if;
  select role into v_role from public.league_members
   where league_id = p_league_id and user_id = p_user_id and left_at is null;
  if v_role is null then
    raise exception 'not a member' using errcode = 'P0002';
  end if;
  if v_role = 'commissioner' and (
    select count(*) from public.league_members
    where league_id = p_league_id and role = 'commissioner' and left_at is null
  ) <= 1 then
    raise exception 'promote another commissioner first' using errcode = 'P0001';
  end if;

  update public.league_members set left_at = now()
  where league_id = p_league_id and user_id = p_user_id and left_at is null;

  perform public.post_league_event(
    p_league_id, case when v_self then 'member_left' else 'member_removed' end::public.league_event_kind,
    v_uid, p_user_id, '{}'::jsonb
  );
end;
$$;

create or replace function public.rotate_invite_code(p_league_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'only commissioners can rotate the invite code' using errcode = '42501';
  end if;
  loop
    v_code := public.generate_invite_code();
    exit when not exists (select 1 from public.leagues where invite_code = v_code);
  end loop;
  update public.leagues set invite_code = v_code where id = p_league_id;
  return v_code;
end;
$$;

create or replace function public.update_league(p_league_id uuid, p_name text, p_starting_balance_cents integer)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_old public.leagues%rowtype;
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'only commissioners can update the league' using errcode = '42501';
  end if;
  select * into v_old from public.leagues where id = p_league_id;
  if v_old.status <> 'open' then
    raise exception 'league is closed' using errcode = 'P0001';
  end if;
  if p_starting_balance_cents <> v_old.starting_balance_cents then
    if exists (select 1 from public.ledger where league_id = p_league_id and kind <> 'initial') then
      raise exception 'starting balance cannot change once play has started' using errcode = 'P0001';
    end if;
    -- ledger is append-only: rebase every member with a signed adjustment instead of editing rows
    insert into public.ledger (league_id, user_id, kind, amount_cents, note)
    select p_league_id, m.user_id, 'adjustment', p_starting_balance_cents - v_old.starting_balance_cents,
           'starting balance changed'
    from public.league_members m where m.league_id = p_league_id;
  end if;

  update public.leagues
  set name = btrim(p_name), starting_balance_cents = p_starting_balance_cents
  where id = p_league_id;

  perform public.post_league_event(p_league_id, 'league_updated', v_uid, null,
    jsonb_build_object('name', btrim(p_name), 'starting_balance_cents', p_starting_balance_cents));
end;
$$;

create or replace function public.post_commissioner_note(p_league_id uuid, p_text text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_league_commissioner(p_league_id) then
    raise exception 'only commissioners can post notes' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_text, ''))) not between 1 and 500 then
    raise exception 'note must be 1-500 characters' using errcode = '23514';
  end if;
  perform public.post_league_event(p_league_id, 'commissioner_note', auth.uid(), null,
    jsonb_build_object('text', btrim(p_text)));
end;
$$;

revoke all on function public.generate_invite_code() from public;
revoke all on function public.current_week_id(uuid) from public;
revoke all on function public.post_league_event(uuid, public.league_event_kind, uuid, uuid, jsonb) from public;
revoke all on function public.create_league(text, integer) from public;
revoke all on function public.join_league(text) from public;
revoke all on function public.set_member_role(uuid, uuid, public.member_role) from public;
revoke all on function public.remove_member(uuid, uuid) from public;
revoke all on function public.rotate_invite_code(uuid) from public;
revoke all on function public.update_league(uuid, text, integer) from public;
revoke all on function public.post_commissioner_note(uuid, text) from public;

grant execute on function
  public.create_league(text, integer), public.join_league(text),
  public.set_member_role(uuid, uuid, public.member_role), public.remove_member(uuid, uuid),
  public.rotate_invite_code(uuid), public.update_league(uuid, text, integer),
  public.post_commissioner_note(uuid, text)
to authenticated, service_role;
grant execute on function public.current_week_id(uuid), public.post_league_event(uuid, public.league_event_kind, uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- privileges + RLS
-- ---------------------------------------------------------------------------
alter table public.leagues        enable row level security;
alter table public.league_members enable row level security;
alter table public.ledger         enable row level security;
alter table public.league_events  enable row level security;

revoke all on public.leagues, public.league_members, public.ledger, public.league_events, public.league_balances
  from anon, authenticated;
grant select on public.leagues, public.league_members, public.ledger, public.league_events, public.league_balances
  to authenticated;

create policy "leagues: members read" on public.leagues for select to authenticated
  using (public.is_league_member(id));
create policy "league_members: members read" on public.league_members for select to authenticated
  using (public.is_league_member(league_id));
create policy "ledger: members read" on public.ledger for select to authenticated
  using (public.is_league_member(league_id));
create policy "league_events: members read" on public.league_events for select to authenticated
  using (public.is_league_member(league_id));
