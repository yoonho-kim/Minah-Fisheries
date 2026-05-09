# cast-league-bet

Supabase Edge Function for one-vote-per-IP league betting.

## Required secrets

Set these before deployment:

```bash
supabase secrets set IP_HASH_SALT="change-this-to-a-long-random-value"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are available to Supabase Edge Functions by default in hosted Supabase projects.

## Deploy

```bash
supabase functions deploy cast-league-bet
```

## Request

```json
{
  "matchSlug": "space-star-league-main",
  "bettorKey": "browser-generated-user-key",
  "team": "a"
}
```

The function reads the request IP on the server, hashes it with `IP_HASH_SALT`, and calls `public.cast_league_bet`.
