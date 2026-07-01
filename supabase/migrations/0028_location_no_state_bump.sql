-- Realtime cost fix: stop update_driver_location() from bumping driver_states.
--
-- THE COST: update_driver_location (0027) upserts driver_locations AND bumps
-- driver_states.updated_at on every GPS fix. driver_states is published to
-- Realtime (0002) and useDriverQueue subscribes to it with a WILDCARD filter,
-- so every fix fans a driver_states change out to *every* client with the queue
-- open. At ~1 fix/sec per active ride that's a per-second broadcast multiplied
-- by every connected client — enough to blow the free-tier Realtime message cap
-- on its own. (The queue's 1.5s debounce only coalesces refetch *queries*; the
-- Realtime messages are already delivered and counted before it runs.)
--
-- WHY THE BUMP IS REDUNDANT: driver_states.updated_at is the liveness clock read
-- by dispatch (_offer_to_next_driver skips rows older than ~60s). But an online
-- driver — including one on a trip — already pings driver_heartbeat() every 25s
-- (useDriverHeartbeat runs whenever is_online), which keeps that clock fresh with
-- margin. On-trip drivers aren't offered rides anyway, so their updated_at
-- freshness doesn't affect dispatch. The location write bumping it adds nothing
-- but Realtime fan-out.
--
-- THE FIX: redefine update_driver_location to write ONLY the private
-- driver_locations row. Location changes now fan out solely on driver_locations,
-- which is participant-scoped (0027) — just the matched rider, not the whole queue.

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
  insert into public.driver_locations (driver_id, lat, lng, updated_at)
  values (auth.uid(), p_lat, p_lng, now())
  on conflict (driver_id) do update
    set lat = excluded.lat, lng = excluded.lng, updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.update_driver_location(double precision, double precision) to authenticated;
