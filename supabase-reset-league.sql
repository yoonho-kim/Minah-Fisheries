begin;

-- Reset all betting records for the current league feature.
truncate table public.league_bets restart identity cascade;

-- Recreate or refresh the default match used by the website.
insert into public.league_matches (
  slug,
  title,
  team_a_name,
  team_a_subtitle,
  team_b_name,
  team_b_subtitle,
  status,
  winner_team,
  starts_at
)
values (
  'space-star-league-main',
  '우주 스타 리그',
  '클라스 팀',
  '전통강자',
  '광모 팀',
  '도전자 87 대표 젊은 피',
  'open',
  null,
  null
)
on conflict (slug) do update
set
  title = excluded.title,
  team_a_name = excluded.team_a_name,
  team_a_subtitle = excluded.team_a_subtitle,
  team_b_name = excluded.team_b_name,
  team_b_subtitle = excluded.team_b_subtitle,
  status = excluded.status,
  winner_team = null,
  starts_at = null,
  updated_at = now();

commit;

-- Optional full reset for the previous restaurant reservation feature.
-- Uncomment only if you also want to delete old reservation data.
-- truncate table public.reservation_requests restart identity cascade;
