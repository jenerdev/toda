-- Security hardening: driver live-location privacy.
-- (ROADMAP → "Security & abuse prevention" → follow-up to the RLS audit.)
--
-- THE LEAK: live driver GPS lived in driver_states.last_lat/last_lng, and
-- driver_states has a `using (true)` SELECT policy (the queue needs every
-- driver's is_online/availability/queued_at). RLS is row-level, not column-level,
-- and Realtime delivers the WHOLE row gated only by that row policy — so ANY
-- authenticated user could read, and live-stream, EVERY driver's coordinates.
--
-- THE FIX: move live location into its own table with participant-scoped RLS, so
-- only the driver themselves and the commuter on that driver's *active* ride can
-- read it (direct query OR Realtime). driver_states keeps only the broadly-
-- readable status columns; its last_lat/last_lng are dropped, which removes the
-- leak from both the table and its Realtime payload.

-- ---------------------------------------------------------------------------
-- Private live-location table.
-- ---------------------------------------------------------------------------
create table if not exists public.driver_locations (
  driver_id  uuid primary key references public.profiles (id) on delete cascade,
  lat        double precision,
  lng        double precision,
  updated_at timestamptz not null default now()
);

-- Carry over any last-known coordinates so an in-progress trip doesn't blink out.
insert into public.driver_locations (driver_id, lat, lng, updated_at)
select driver_id, last_lat, last_lng, updated_at
  from public.driver_states
 where last_lat is not null or last_lng is not null
on conflict (driver_id) do nothing;

-- ---------------------------------------------------------------------------
-- RLS: the driver, or the commuter on that driver's currently-active ride.
-- ---------------------------------------------------------------------------
alter table public.driver_locations enable row level security;

drop policy if exists driver_locations_select_participant on public.driver_locations;
create policy driver_locations_select_participant on public.driver_locations
  for select using (
    driver_id = auth.uid()
    or exists (
      select 1 from public.rides r
      where r.driver_id = driver_locations.driver_id
        and r.client_id = auth.uid()
        and r.status in ('accepted', 'enroute')
    )
  );

-- Writes go only through update_driver_location (SECURITY DEFINER); no client DML.
revoke insert, update, delete on public.driver_locations from anon, authenticated;
grant  select                  on public.driver_locations to   authenticated;

-- Stream changes to the (RLS-authorized) matched commuter via Realtime.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'driver_locations'
  ) then
    alter publication supabase_realtime add table public.driver_locations;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- update_driver_location: write the private location, and keep the liveness
-- clock (driver_states.updated_at — read by dispatch + the queue) fresh.
-- Replaces the 0006 version that wrote driver_states.last_lat/last_lng.
-- ---------------------------------------------------------------------------
create or replace function public.update_driver_location(
  p_lat double precision,
  p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.driver_states set updated_at = now() where driver_id = auth.uid();

  insert into public.driver_locations (driver_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (driver_id) do update
    set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.update_driver_location(double precision, double precision) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop the now-unused, leaky columns. (Backfilled into driver_locations above;
-- update_driver_location no longer writes them.)
-- ---------------------------------------------------------------------------
alter table public.driver_states drop column if exists last_lat;
alter table public.driver_states drop column if exists last_lng;
