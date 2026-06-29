-- Phase 5: dispatch & the offer handshake.
-- Implemented as SECURITY DEFINER functions (RPC) instead of Edge Functions:
-- no CLI/Docker needed, atomic transactions, and one shared dispatch routine
-- reused by booking, decline, and the timeout sweep.

-- ---------------------------------------------------------------------
-- Extra RLS so the two parties can see what they need during a ride.
-- ---------------------------------------------------------------------

-- A driver can read a ride they've been OFFERED (to see the pickup), even
-- before they're assigned to it.
drop policy if exists rides_select_offered on public.rides;
create policy rides_select_offered on public.rides
  for select using (
    exists (
      select 1 from public.ride_offers ro
      where ro.ride_id = rides.id and ro.driver_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Internal: offer the ride to the next eligible driver in the queue.
-- Returns the chosen driver_id, or null (and marks the ride no_drivers).
-- Not granted to clients — only called by the definer functions below.
-- ---------------------------------------------------------------------
create or replace function public._offer_to_next_driver(p_ride_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver uuid;
begin
  select ds.driver_id into v_driver
  from public.driver_states ds
  where ds.is_online = true
    and ds.availability = 'available'
    -- not already offered THIS ride
    and ds.driver_id not in (
      select ro.driver_id from public.ride_offers ro where ro.ride_id = p_ride_id
    )
    -- and not currently holding a pending offer for ANY ride
    and not exists (
      select 1 from public.ride_offers ro2
      where ro2.driver_id = ds.driver_id and ro2.status = 'pending'
    )
  order by ds.queued_at asc
  limit 1;

  if v_driver is null then
    update public.rides set status = 'no_drivers'
      where id = p_ride_id and status = 'searching';
    return null;
  end if;

  insert into public.ride_offers (ride_id, driver_id, status)
  values (p_ride_id, v_driver, 'pending');

  return v_driver;
end;
$$;

-- ---------------------------------------------------------------------
-- book_ride: commuter creates a ride and it's offered to the first driver.
-- ---------------------------------------------------------------------
create or replace function public.book_ride(
  p_lat double precision,
  p_lng double precision,
  p_address text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_credits int;
  v_ride_id uuid;
  v_driver uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select role, credits into v_role, v_credits from public.profiles where id = v_uid;
  if v_role <> 'commuter' then raise exception 'Only commuters can book rides'; end if;
  if v_credits < 5 then raise exception 'Not enough credits to book (need 5)'; end if;

  if exists (
    select 1 from public.rides
    where client_id = v_uid and status in ('searching', 'accepted', 'enroute')
  ) then
    raise exception 'You already have an active ride';
  end if;

  insert into public.rides (client_id, pickup_lat, pickup_lng, pickup_address, status)
  values (v_uid, p_lat, p_lng, p_address, 'searching')
  returning id into v_ride_id;

  v_driver := public._offer_to_next_driver(v_ride_id);

  return json_build_object(
    'ride_id', v_ride_id,
    'status', case when v_driver is null then 'no_drivers' else 'searching' end
  );
end;
$$;

-- ---------------------------------------------------------------------
-- respond_offer: driver accepts or declines a pending offer.
-- Decline (or timeout) advances the ride to the next driver.
-- ---------------------------------------------------------------------
create or replace function public.respond_offer(p_offer_id uuid, p_action text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.ride_offers;
  v_ride public.rides;
  v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_action not in ('accept', 'decline') then raise exception 'Invalid action'; end if;

  select * into v_offer from public.ride_offers where id = p_offer_id for update;
  if not found then raise exception 'Offer not found'; end if;
  if v_offer.driver_id <> v_uid then raise exception 'Not your offer'; end if;
  if v_offer.status <> 'pending' then raise exception 'Offer is no longer pending'; end if;

  select * into v_ride from public.rides where id = v_offer.ride_id for update;

  if p_action = 'accept' then
    if v_ride.status <> 'searching' then
      update public.ride_offers set status = 'expired', responded_at = now() where id = p_offer_id;
      raise exception 'This ride is no longer available';
    end if;
    update public.ride_offers set status = 'accepted', responded_at = now() where id = p_offer_id;
    update public.rides
       set status = 'accepted', driver_id = v_uid, accepted_at = now()
     where id = v_ride.id;
    update public.driver_states set availability = 'on_trip', updated_at = now()
     where driver_id = v_uid;
    return json_build_object('result', 'accepted', 'ride_id', v_ride.id);
  else
    update public.ride_offers set status = 'declined', responded_at = now() where id = p_offer_id;
    if v_ride.status = 'searching' then
      v_next := public._offer_to_next_driver(v_ride.id);
    end if;
    return json_build_object('result', 'declined', 'next_driver', v_next);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_ride: commuter cancels while still searching / no drivers found.
-- ---------------------------------------------------------------------
create or replace function public.cancel_ride(p_ride_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
begin
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;
  if v_ride.status not in ('searching', 'no_drivers') then
    raise exception 'Ride cannot be cancelled now';
  end if;
  update public.rides set status = 'cancelled' where id = p_ride_id;
  update public.ride_offers set status = 'expired', responded_at = now()
   where ride_id = p_ride_id and status = 'pending';
end;
$$;

-- ---------------------------------------------------------------------
-- get_counterpart: the other party's name + phone for an active ride.
-- Exposes ONLY name + phone (not credits), to either participant.
-- ---------------------------------------------------------------------
create or replace function public.get_counterpart(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_other uuid;
  v_name text;
  v_phone text;
begin
  select * into v_ride from public.rides where id = p_ride_id;
  if not found then raise exception 'Ride not found'; end if;

  if v_uid = v_ride.client_id then v_other := v_ride.driver_id;
  elsif v_uid = v_ride.driver_id then v_other := v_ride.client_id;
  else raise exception 'Not a participant'; end if;

  if v_other is null then return null; end if;

  select full_name, phone into v_name, v_phone from public.profiles where id = v_other;
  return json_build_object('full_name', v_name, 'phone', v_phone);
end;
$$;

-- ---------------------------------------------------------------------
-- expire_stale_offers: safety-net sweep for offers a driver never answered.
-- Primary timeout is the driver's client countdown; this catches closed tabs.
-- Run it via pg_cron (see note at the bottom) or call it from a client.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select * from public.ride_offers
    where status = 'pending' and offered_at < now() - interval '30 seconds'
    for update skip locked
  loop
    update public.ride_offers set status = 'expired', responded_at = now() where id = r.id;
    if exists (select 1 from public.rides where id = r.ride_id and status = 'searching') then
      perform public._offer_to_next_driver(r.ride_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- Grants (clients call these; _offer_to_next_driver stays internal).
-- ---------------------------------------------------------------------
grant execute on function public.book_ride(double precision, double precision, text) to authenticated;
grant execute on function public.respond_offer(uuid, text) to authenticated;
grant execute on function public.cancel_ride(uuid) to authenticated;
grant execute on function public.get_counterpart(uuid) to authenticated;
grant execute on function public.expire_stale_offers() to authenticated;

-- ---------------------------------------------------------------------
-- Realtime for rides + ride_offers (idempotent).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='rides') then
    alter publication supabase_realtime add table public.rides;
  end if;
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='ride_offers') then
    alter publication supabase_realtime add table public.ride_offers;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- OPTIONAL hardening — schedule the timeout sweep with pg_cron.
-- Enable pg_cron in the dashboard (Database -> Extensions), then run:
--
--   select cron.schedule('expire-stale-offers', '15 seconds',
--                         $$ select public.expire_stale_offers(); $$);
--
-- The driver-side countdown already handles the normal case; this just
-- covers a driver who closes the app without responding.
-- ---------------------------------------------------------------------
