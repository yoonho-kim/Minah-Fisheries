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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_bets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.league_matches(id) on delete cascade,
  bettor_key text not null check (char_length(bettor_key) between 8 and 120),
  ip_hash text check (char_length(ip_hash) between 32 and 128),
  team text not null check (team in ('a', 'b')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.league_bets
add column if not exists ip_hash text check (char_length(ip_hash) between 32 and 128);

alter table public.league_bets
drop constraint if exists league_bets_match_id_bettor_key_key;

create unique index if not exists league_bets_match_ip_hash_uidx
on public.league_bets (match_id, ip_hash)
where ip_hash is not null;

create index if not exists league_bets_match_bettor_key_idx
on public.league_bets (match_id, bettor_key);

create index if not exists league_bets_match_id_idx
on public.league_bets (match_id);

create index if not exists league_bets_match_team_idx
on public.league_bets (match_id, team);

insert into public.league_matches (
  slug,
  title,
  team_a_name,
  team_a_subtitle,
  team_b_name,
  team_b_subtitle,
  status
)
values (
  'space-star-league-main',
  '우주 스타 리그',
  '클라스 팀',
  '전통강자',
  '광모 팀',
  '도전자 87 대표 젊은 피',
  'open'
)
on conflict (slug) do update
set
  title = excluded.title,
  team_a_name = excluded.team_a_name,
  team_a_subtitle = excluded.team_a_subtitle,
  team_b_name = excluded.team_b_name,
  team_b_subtitle = excluded.team_b_subtitle,
  status = excluded.status,
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
  count(b.id) as total_bets,
  count(b.id) filter (where b.team = 'a') as team_a_bets,
  count(b.id) filter (where b.team = 'b') as team_b_bets,
  coalesce(round(count(b.id) filter (where b.team = 'a') * 100.0 / nullif(count(b.id), 0), 1), 0.0) as team_a_percent,
  coalesce(round(count(b.id) filter (where b.team = 'b') * 100.0 / nullif(count(b.id), 0), 1), 0.0) as team_b_percent,
  case
    when count(b.id) filter (where b.team = 'a') = 0 then null
    else round(count(b.id) * 1.0 / count(b.id) filter (where b.team = 'a'), 2)
  end as team_a_odds,
  case
    when count(b.id) filter (where b.team = 'b') = 0 then null
    else round(count(b.id) * 1.0 / count(b.id) filter (where b.team = 'b'), 2)
  end as team_b_odds
from public.league_matches m
left join public.league_bets b on b.match_id = m.id
group by m.id;

drop function if exists public.cast_league_bet(text, text, text);

create or replace function public.cast_league_bet(
  p_match_slug text,
  p_bettor_key text,
  p_team text,
  p_ip_hash text
)
returns table (
  match_id uuid,
  selected_team text,
  accepted boolean,
  already_voted boolean,
  total_bets bigint,
  team_a_bets bigint,
  team_b_bets bigint
)
language sql
security definer
set search_path = public
as $$
  with target_match as (
    select id
    from public.league_matches
    where slug = p_match_slug
      and status = 'open'
    limit 1
  ),
  upserted as (
    insert into public.league_bets as lb (match_id, bettor_key, ip_hash, team)
    select id, trim(p_bettor_key), trim(p_ip_hash), p_team
    from target_match
    where p_team in ('a', 'b')
      and char_length(trim(p_bettor_key)) between 8 and 120
      and char_length(trim(p_ip_hash)) between 32 and 128
    on conflict (match_id, ip_hash) where ip_hash is not null do nothing
    returning lb.match_id, lb.team
  ),
  selected_match as (
    select id as match_id from target_match
    union
    select match_id from upserted
    limit 1
  ),
  previous_vote as (
    select b.match_id, b.team
    from public.league_bets b
    join selected_match sm on sm.match_id = b.match_id
    where b.ip_hash = trim(p_ip_hash)
    limit 1
  )
  select
    sm.match_id,
    coalesce(u.team, pv.team) as selected_team,
    (u.match_id is not null) as accepted,
    (u.match_id is null and pv.match_id is not null) as already_voted,
    count(b.id) as total_bets,
    count(b.id) filter (where b.team = 'a') as team_a_bets,
    count(b.id) filter (where b.team = 'b') as team_b_bets
  from selected_match sm
  left join upserted u on u.match_id = sm.match_id
  left join previous_vote pv on pv.match_id = sm.match_id
  left join public.league_bets b on b.match_id = sm.match_id
  group by sm.match_id, u.team, u.match_id, pv.team, pv.match_id;
$$;

alter table public.league_matches enable row level security;
alter table public.league_bets enable row level security;

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

grant select on public.league_matches to anon, authenticated;
grant select on public.league_betting_summary to anon, authenticated;
grant execute on function public.cast_league_bet(text, text, text, text) to service_role;

-- Frontend usage:
-- 1. Read current counts from public.league_betting_summary where slug = 'space-star-league-main'.
-- 2. Save one vote per IP through a server or Supabase Edge Function.
--    Never call public.cast_league_bet from browser JavaScript, because p_ip_hash would be spoofable.
-- 3. The server should hash the request IP and call:
--    select * from public.cast_league_bet('space-star-league-main', '<browser-generated-user-key>', 'a', '<server-generated-ip-hash>');
-- 4. Refetch public.league_betting_summary after the Edge Function returns.
