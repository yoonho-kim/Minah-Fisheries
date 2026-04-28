create table if not exists public.congrats_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  message text not null check (char_length(message) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.congrats_messages enable row level security;

drop policy if exists "Anyone can read congrats messages" on public.congrats_messages;
create policy "Anyone can read congrats messages"
on public.congrats_messages
for select
to anon
using (true);

drop policy if exists "Anyone can leave congrats messages" on public.congrats_messages;
create policy "Anyone can leave congrats messages"
on public.congrats_messages
for insert
to anon
with check (
  char_length(name) between 1 and 40
  and char_length(message) between 1 and 500
);
