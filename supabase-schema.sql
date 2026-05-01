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
