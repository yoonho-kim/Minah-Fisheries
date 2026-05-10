create table if not exists public.reservation_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  phone text not null check (char_length(phone) between 1 and 30),
  visit_date date not null,
  visit_time text not null check (char_length(visit_time) between 1 and 20),
  guests text not null check (char_length(guests) between 1 and 20),
  menu_interest text check (char_length(menu_interest) <= 60),
  memo text check (char_length(memo) <= 500),
  status text not null default 'new' check (status in ('new', 'contacted', 'confirmed', 'canceled')),
  created_at timestamptz not null default now()
);

create table if not exists public.admin_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.is_minah_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_emails
    where email = lower(auth.jwt() ->> 'email')
  );
$$;

alter table public.reservation_requests enable row level security;
alter table public.admin_emails enable row level security;

drop policy if exists "Anyone can create reservation requests" on public.reservation_requests;
create policy "Anyone can create reservation requests"
on public.reservation_requests
for insert
to anon
with check (
  char_length(name) between 1 and 40
  and char_length(phone) between 1 and 30
  and visit_date is not null
  and char_length(visit_time) between 1 and 20
  and char_length(guests) between 1 and 20
  and coalesce(char_length(menu_interest), 0) <= 60
  and coalesce(char_length(memo), 0) <= 500
  and status = 'new'
);

drop policy if exists "Admins can read reservation requests" on public.reservation_requests;
create policy "Admins can read reservation requests"
on public.reservation_requests
for select
to authenticated
using (public.is_minah_admin());

drop policy if exists "Admins can update reservation status" on public.reservation_requests;
create policy "Admins can update reservation status"
on public.reservation_requests
for update
to authenticated
using (public.is_minah_admin())
with check (public.is_minah_admin());

-- After creating an Auth user for the manager, register the manager email:
-- insert into public.admin_emails (email) values ('manager@example.com');

create table if not exists public.league_matches (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  title text not null check (char_length(title) between 1 and 80),
  team_a_name text not null check (char_length(team_a_name) between 1 and 40),
  team_a_subtitle text check (char_length(team_a_subtitle) <= 80),
  team_b_name text not null check (char_length(team_b_name) between 1 and 40),
  team_b_subtitle text check (char_length(team_b_subtitle) <= 80),
  status text not null default 'open' check (status in ('scheduled', 'open', 'locked', 'settled', 'canceled')),
  winner_team text check (winner_team in ('a', 'b')),
  starts_at timestamptz,
  closes_at timestamptz,
  close_minutes integer default 10 check (close_minutes in (5, 10, 30, 60, 120, 1440)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_matches
add column if not exists closes_at timestamptz;

alter table public.league_matches
add column if not exists close_minutes integer default 10 check (close_minutes in (5, 10, 30, 60, 120, 1440));

create table if not exists public.league_bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.league_matches(id) on delete cascade,
  bettor_key text not null check (char_length(bettor_key) between 8 and 120),
  ip_hash text check (char_length(ip_hash) between 32 and 128),
  team text not null check (team in ('a', 'b')),
  amount integer not null default 1 check (amount between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_bets
add column if not exists ip_hash text check (char_length(ip_hash) between 32 and 128);

alter table public.league_bets
add column if not exists amount integer not null default 1 check (amount between 1 and 1000);

alter table public.league_bets
drop constraint if exists league_bets_match_id_bettor_key_key;

drop index if exists league_bets_match_ip_hash_uidx;

create index if not exists league_bets_match_bettor_key_idx
on public.league_bets (match_id, bettor_key);

create index if not exists league_bets_match_id_idx
on public.league_bets (match_id);

create index if not exists league_bets_match_team_idx
on public.league_bets (match_id, team);

create table if not exists public.league_comments (
  id uuid primary key default gen_random_uuid(),
  match_slug text not null check (match_slug ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  commenter_key text not null check (char_length(commenter_key) between 8 and 120),
  body text not null check (char_length(body) between 1 and 120),
  created_at timestamptz not null default now()
);

create index if not exists league_comments_match_created_idx
on public.league_comments (match_slug, created_at desc);

create table if not exists public.league_wallets (
  ip_hash text primary key check (char_length(ip_hash) between 32 and 128),
  diamonds integer not null default 10 check (diamonds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.league_matches (
  slug,
  title,
  team_a_name,
  team_a_subtitle,
  team_b_name,
  team_b_subtitle,
  status,
  close_minutes
)
values (
  'space-star-league-main',
  '우주 스타 리그',
  '클라스 팀',
  '전통강자',
  '광모 팀',
  '도전자 87 대표 젊은 피',
  'scheduled',
  10
)
on conflict (slug) do update
set
  title = public.league_matches.title,
  team_a_name = public.league_matches.team_a_name,
  team_a_subtitle = public.league_matches.team_a_subtitle,
  team_b_name = public.league_matches.team_b_name,
  team_b_subtitle = public.league_matches.team_b_subtitle,
  updated_at = now();

create or replace view public.league_betting_summary as
select
  m.id as match_id,
  m.slug,
  m.title,
  m.team_a_name,
  m.team_a_subtitle,
  m.team_b_name,
  m.team_b_subtitle,
  m.status,
  coalesce(sum(b.amount), 0)::bigint as total_bets,
  coalesce(sum(b.amount) filter (where b.team = 'a'), 0)::bigint as team_a_bets,
  coalesce(sum(b.amount) filter (where b.team = 'b'), 0)::bigint as team_b_bets,
  coalesce(round(coalesce(sum(b.amount) filter (where b.team = 'a'), 0) * 100.0 / nullif(sum(b.amount), 0), 1), 0.0) as team_a_percent,
  coalesce(round(coalesce(sum(b.amount) filter (where b.team = 'b'), 0) * 100.0 / nullif(sum(b.amount), 0), 1), 0.0) as team_b_percent,
  case
    when coalesce(sum(b.amount) filter (where b.team = 'a'), 0) = 0 then null
    else round(sum(b.amount) * 1.0 / sum(b.amount) filter (where b.team = 'a'), 2)
  end as team_a_odds,
  case
    when coalesce(sum(b.amount) filter (where b.team = 'b'), 0) = 0 then null
    else round(sum(b.amount) * 1.0 / sum(b.amount) filter (where b.team = 'b'), 2)
  end as team_b_odds,
  m.closes_at,
  (m.status <> 'open' or (m.closes_at is not null and m.closes_at <= now())) as is_closed,
  m.close_minutes
from public.league_matches m
left join public.league_bets b on b.match_id = m.id
group by m.id;

drop function if exists public.cast_league_bet(text, text, text);
drop function if exists public.cast_league_bet(text, text, text, text);

create or replace function public.cast_league_bet(
  p_match_slug text,
  p_bettor_key text,
  p_team text,
  p_ip_hash text,
  p_amount integer
)
returns table (
  match_id uuid,
  selected_team text,
  accepted boolean,
  already_voted boolean,
  total_bets bigint,
  team_a_bets bigint,
  team_b_bets bigint,
  diamond_balance integer,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_amount integer := least(greatest(coalesce(p_amount, 1), 1), 1000);
  v_balance integer;
begin
  if p_team not in ('a', 'b')
    or char_length(trim(p_bettor_key)) not between 8 and 120
    or char_length(trim(p_ip_hash)) not between 32 and 128 then
    return;
  end if;

  insert into public.league_wallets (ip_hash, diamonds)
  values (trim(p_ip_hash), 10)
  on conflict (ip_hash) do nothing;

  select lm.id into v_match_id
  from public.league_matches lm
  where lm.slug = p_match_slug
    and lm.status = 'open'
    and (lm.closes_at is null or lm.closes_at > now())
  limit 1;

  if v_match_id is null then
    select lw.diamonds into v_balance
    from public.league_wallets lw
    where lw.ip_hash = trim(p_ip_hash);
    return;
  end if;

  update public.league_wallets lw
  set diamonds = lw.diamonds - v_amount,
      updated_at = now()
  where lw.ip_hash = trim(p_ip_hash)
    and lw.diamonds >= v_amount
  returning lw.diamonds into v_balance;

  if v_balance is null then
    select lw.diamonds into v_balance
    from public.league_wallets lw
    where lw.ip_hash = trim(p_ip_hash);

    return query
    select
      v_match_id,
      null::text,
      false,
      false,
      coalesce(sum(b.amount), 0)::bigint,
      coalesce(sum(b.amount) filter (where b.team = 'a'), 0)::bigint,
      coalesce(sum(b.amount) filter (where b.team = 'b'), 0)::bigint,
      v_balance,
      'insufficient_diamonds'::text
    from public.league_bets b
    where b.match_id = v_match_id;
    return;
  end if;

  insert into public.league_bets (match_id, bettor_key, ip_hash, team, amount)
  values (v_match_id, trim(p_bettor_key), trim(p_ip_hash), p_team, v_amount);

  return query
  select
    v_match_id,
    p_team,
    true,
    false,
    coalesce(sum(b.amount), 0)::bigint,
    coalesce(sum(b.amount) filter (where b.team = 'a'), 0)::bigint,
    coalesce(sum(b.amount) filter (where b.team = 'b'), 0)::bigint,
    v_balance,
    null::text
  from public.league_bets b
  where b.match_id = v_match_id;
end;
$$;

create or replace function public.get_league_wallet(
  p_ip_hash text
)
returns table (
  diamonds integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(trim(p_ip_hash)) not between 32 and 128 then
    return;
  end if;

  insert into public.league_wallets (ip_hash, diamonds)
  values (trim(p_ip_hash), 10)
  on conflict (ip_hash) do nothing;

  return query
  select lw.diamonds
  from public.league_wallets lw
  where lw.ip_hash = trim(p_ip_hash);
end;
$$;

create or replace function public.post_league_comment(
  p_match_slug text,
  p_commenter_key text,
  p_body text,
  p_ip_hash text
)
returns table (
  accepted boolean,
  error_code text,
  diamond_balance integer,
  body text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_body text := trim(p_body);
  v_created_at timestamptz;
begin
  if char_length(trim(p_ip_hash)) not between 32 and 128
    or char_length(trim(p_commenter_key)) not between 8 and 120
    or char_length(v_body) not between 1 and 120 then
    return;
  end if;

  insert into public.league_wallets (ip_hash, diamonds)
  values (trim(p_ip_hash), 10)
  on conflict (ip_hash) do nothing;

  update public.league_wallets lw
  set diamonds = lw.diamonds - 1,
      updated_at = now()
  where lw.ip_hash = trim(p_ip_hash)
    and lw.diamonds >= 1
  returning lw.diamonds into v_balance;

  if v_balance is null then
    select lw.diamonds into v_balance
    from public.league_wallets lw
    where lw.ip_hash = trim(p_ip_hash);

    return query
    select false, 'insufficient_diamonds'::text, v_balance, null::text, null::timestamptz;
    return;
  end if;

  insert into public.league_comments (match_slug, commenter_key, body)
  values (p_match_slug, trim(p_commenter_key), v_body)
  returning public.league_comments.created_at into v_created_at;

  return query
  select true, null::text, v_balance, v_body, v_created_at;
end;
$$;

alter table public.league_matches enable row level security;
alter table public.league_bets enable row level security;
alter table public.league_comments enable row level security;
alter table public.league_wallets enable row level security;

drop policy if exists "Anyone can read league matches" on public.league_matches;
create policy "Anyone can read league matches"
on public.league_matches
for select
to anon, authenticated
using (status in ('scheduled', 'open', 'locked', 'settled'));

drop policy if exists "Admins can manage league matches" on public.league_matches;
create policy "Admins can manage league matches"
on public.league_matches
for all
to authenticated
using (public.is_minah_admin())
with check (public.is_minah_admin());

drop policy if exists "Anyone can read league bets for live counts" on public.league_bets;
drop policy if exists "Admins can read league bets" on public.league_bets;
create policy "Admins can read league bets"
on public.league_bets
for select
to authenticated
using (public.is_minah_admin());

drop policy if exists "Admins can manage league bets" on public.league_bets;
create policy "Admins can manage league bets"
on public.league_bets
for all
to authenticated
using (public.is_minah_admin())
with check (public.is_minah_admin());

drop policy if exists "Admins can read league wallets" on public.league_wallets;
create policy "Admins can read league wallets"
on public.league_wallets
for select
to authenticated
using (public.is_minah_admin());

drop policy if exists "Anyone can read league comments" on public.league_comments;
create policy "Anyone can read league comments"
on public.league_comments
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can create league comments" on public.league_comments;

grant select on public.league_matches to anon, authenticated;
grant select on public.league_betting_summary to anon, authenticated;
grant select on public.league_comments to anon, authenticated;
revoke insert on public.league_comments from anon, authenticated;
grant execute on function public.cast_league_bet(text, text, text, text, integer) to service_role;
grant execute on function public.get_league_wallet(text) to service_role;
grant execute on function public.post_league_comment(text, text, text, text) to service_role;

drop function if exists public.admin_update_league_match(text, text, text, text, text);

create or replace function public.admin_update_league_match(
  p_admin_password text,
  p_match_slug text,
  p_title text,
  p_team_a_name text,
  p_team_a_subtitle text,
  p_team_b_name text,
  p_team_b_subtitle text,
  p_close_minutes integer
)
returns setof public.league_betting_summary
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_password <> '1234qwer' then
    raise exception 'invalid_admin_password';
  end if;

  update public.league_matches
  set
    title = trim(p_title),
    team_a_name = trim(p_team_a_name),
    team_a_subtitle = nullif(trim(p_team_a_subtitle), ''),
    team_b_name = trim(p_team_b_name),
    team_b_subtitle = nullif(trim(p_team_b_subtitle), ''),
    close_minutes = coalesce(p_close_minutes, close_minutes),
    closes_at = null,
    status = 'scheduled',
    updated_at = now()
  where slug = p_match_slug
    and char_length(trim(p_title)) between 1 and 80
    and char_length(trim(p_team_a_name)) between 1 and 40
    and char_length(trim(p_team_b_name)) between 1 and 40
    and coalesce(char_length(trim(p_team_a_subtitle)), 0) <= 80
    and coalesce(char_length(trim(p_team_b_subtitle)), 0) <= 80
    and (p_close_minutes is null or p_close_minutes in (5, 10, 30, 60, 120, 1440));

  return query
  select *
  from public.league_betting_summary
  where slug = p_match_slug;
end;
$$;

create or replace function public.admin_reset_league_bets(
  p_admin_password text,
  p_match_slug text
)
returns setof public.league_betting_summary
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  if p_admin_password <> '1234qwer' then
    raise exception 'invalid_admin_password';
  end if;

  select id into v_match_id
  from public.league_matches
  where slug = p_match_slug
  limit 1;

  delete from public.league_bets
  where match_id = v_match_id;

  delete from public.league_comments
  where match_slug = p_match_slug;

  update public.league_matches
  set
    winner_team = null,
    status = 'scheduled',
    closes_at = null,
    updated_at = now()
  where id = v_match_id;

  return query
  select *
  from public.league_betting_summary
  where slug = p_match_slug;
end;
$$;

create or replace function public.admin_start_league_match(
  p_admin_password text,
  p_match_slug text
)
returns setof public.league_betting_summary
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
begin
  if p_admin_password <> '1234qwer' then
    raise exception 'invalid_admin_password';
  end if;

  select id into v_match_id
  from public.league_matches
  where slug = p_match_slug
  limit 1;

  delete from public.league_bets
  where match_id = v_match_id;

  delete from public.league_comments
  where match_slug = p_match_slug;

  update public.league_matches
  set
    status = 'open',
    winner_team = null,
    starts_at = now(),
    closes_at = now() + make_interval(mins => coalesce(close_minutes, 10)),
    updated_at = now()
  where slug = p_match_slug;

  return query
  select *
  from public.league_betting_summary
  where slug = p_match_slug;
end;
$$;

create or replace function public.admin_end_league_match(
  p_admin_password text,
  p_match_slug text
)
returns setof public.league_betting_summary
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_admin_password <> '1234qwer' then
    raise exception 'invalid_admin_password';
  end if;

  update public.league_matches
  set
    status = 'locked',
    closes_at = coalesce(closes_at, now()),
    updated_at = now()
  where slug = p_match_slug;

  return query
  select *
  from public.league_betting_summary
  where slug = p_match_slug;
end;
$$;

create or replace function public.admin_settle_league_match(
  p_admin_password text,
  p_match_slug text,
  p_winner_team text
)
returns setof public.league_betting_summary
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match_id uuid;
  v_status text;
  v_total_amount numeric;
  v_winner_amount numeric;
begin
  if p_admin_password <> '1234qwer' then
    raise exception 'invalid_admin_password';
  end if;

  if p_winner_team not in ('a', 'b') then
    raise exception 'invalid_winner_team';
  end if;

  select lm.id, lm.status into v_match_id, v_status
  from public.league_matches lm
  where lm.slug = p_match_slug
  limit 1;

  if v_match_id is null then
    raise exception 'match_not_found';
  end if;

  if v_status = 'settled' then
    return query
    select *
    from public.league_betting_summary
    where slug = p_match_slug;
    return;
  end if;

  select
    coalesce(sum(lb.amount), 0),
    coalesce(sum(lb.amount) filter (where lb.team = p_winner_team), 0)
  into v_total_amount, v_winner_amount
  from public.league_bets lb
  where lb.match_id = v_match_id;

  if v_winner_amount > 0 then
    insert into public.league_wallets (ip_hash, diamonds)
    select
      lb.ip_hash,
      round(sum(lb.amount) * v_total_amount / v_winner_amount)::integer
    from public.league_bets lb
    where lb.match_id = v_match_id
      and lb.team = p_winner_team
      and lb.ip_hash is not null
    group by lb.ip_hash
    on conflict (ip_hash) do update
    set diamonds = public.league_wallets.diamonds + excluded.diamonds,
        updated_at = now();
  end if;

  update public.league_matches
  set
    status = 'settled',
    winner_team = p_winner_team,
    closes_at = coalesce(closes_at, now()),
    updated_at = now()
  where id = v_match_id;

  return query
  select *
  from public.league_betting_summary
  where slug = p_match_slug;
end;
$$;

grant execute on function public.admin_update_league_match(text, text, text, text, text, text, text, integer) to anon, authenticated;
grant execute on function public.admin_reset_league_bets(text, text) to anon, authenticated;
grant execute on function public.admin_start_league_match(text, text) to anon, authenticated;
grant execute on function public.admin_end_league_match(text, text) to anon, authenticated;
grant execute on function public.admin_settle_league_match(text, text, text) to anon, authenticated;

-- Frontend usage:
-- 1. Read current counts from public.league_betting_summary where slug = 'space-star-league-main'.
-- 2. Save one vote per IP through a server or Supabase Edge Function.
--    Never call public.cast_league_bet from browser JavaScript, because p_ip_hash would be spoofable.
-- 3. The server should hash the request IP and call:
--    select * from public.cast_league_bet('space-star-league-main', '<browser-generated-user-key>', 'a', '<server-generated-ip-hash>');
-- 4. Refetch public.league_betting_summary after the Edge Function returns.
