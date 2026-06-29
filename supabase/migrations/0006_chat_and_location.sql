-- Phase 7: in-ride chat + live driver location.

-- ---------------------------------------------------------------------
-- Chat messages, scoped to a ride. Only the two ride participants
-- (client + assigned driver) can read or post.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 1000),
  created_at  timestamptz not null default now()
);

create index if not exists idx_messages_ride on public.messages (ride_id, created_at);

alter table public.messages enable row level security;

-- A participant of the ride may read its messages.
create policy messages_select_participant on public.messages
  for select using (
    exists (
      select 1 from public.rides r
      where r.id = messages.ride_id
        and (r.client_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- A participant may post, and only as themselves.
create policy messages_insert_participant on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.rides r
      where r.id = messages.ride_id
        and (r.client_id = auth.uid() or r.driver_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------
-- Live location: a driver updates only their own coordinates.
-- ---------------------------------------------------------------------
create or replace function public.update_driver_location(
  p_lat double precision,
  p_lng double precision
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_states
     set last_lat = p_lat, last_lng = p_lng, updated_at = now()
   where driver_id = auth.uid();
$$;

grant execute on function public.update_driver_location(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime for messages (driver_states is already published from 0002,
-- which carries the live location updates to the commuter).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
