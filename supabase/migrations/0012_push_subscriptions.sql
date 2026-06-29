-- Web Push subscriptions for driver ride-offer notifications (see ROADMAP →
-- "web-push"). Each row is one browser/device push endpoint owned by a user.
-- The notify-driver Edge Function (service role) reads these to send a push
-- when a ride_offers row is inserted for that driver.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  endpoint    text not null unique,           -- the push service URL (per device)
  p256dh      text not null,                  -- client public key (encryption)
  auth        text not null,                  -- client auth secret (encryption)
  created_at  timestamptz not null default now()
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A user manages only their own subscriptions. The Edge Function uses the
-- service role (bypasses RLS) to read any driver's subscriptions when sending.
create policy push_sub_select_own on public.push_subscriptions
  for select using (user_id = auth.uid());
create policy push_sub_insert_own on public.push_subscriptions
  for insert with check (user_id = auth.uid());
create policy push_sub_update_own on public.push_subscriptions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_sub_delete_own on public.push_subscriptions
  for delete using (user_id = auth.uid());
