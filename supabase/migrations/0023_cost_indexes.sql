-- Cost / performance indexes.
--
-- These back queries that currently fall back to sequential scans as the tables
-- grow. None change behaviour — they only keep reads cheap (lower CPU + faster
-- responses, which on Supabase also means less time holding connections).
--
--   * renewals(user_id, created_at desc) — useMyRenewal / useRenewalHistory read
--     a user's renewals ordered newest-first; renewals.user_id had no index.
--   * rides(created_at) and ride_offers(offered_at) — admin_ride_stats (0021)
--     filters both tables by a time window; without these the all-time / 30-day
--     report scans the whole table.

create index if not exists idx_renewals_user
  on public.renewals (user_id, created_at desc);

create index if not exists idx_rides_created
  on public.rides (created_at);

create index if not exists idx_ride_offers_offered
  on public.ride_offers (offered_at);
