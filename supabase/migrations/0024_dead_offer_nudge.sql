-- Fix: "Finding you a driver…" hangs when the #1 driver is online but closed
-- their browser.
--
-- Dispatch offers the ride to the front-of-queue driver while their heartbeat is
-- still fresh (≤60s). If they then close the tab without going offline, the
-- pending offer just sits: the only thing that clears it is expire_stale_offers,
-- which (a) is gated on a 2-minute timeout and (b) is never called unless pg_cron
-- is scheduled (treated as optional in 0003). So the rider waits 2 minutes — or
-- forever — for a driver who's already gone.
--
-- nudge_ride_dispatch is a ride-scoped, rider-callable re-evaluation: if the
-- ride's pending offer is to a driver who has gone stale (closed browser / lost
-- connection) OR has sat past the offer timeout, expire it and re-offer to the
-- next available driver. The waiting rider polls this from the "searching"
-- screen, so progress no longer depends on the pg_cron sweep. It is careful to
-- leave a live driver's fresh offer and a fare proposal awaiting the rider's
-- approval untouched.

create or replace function public.nudge_ride_dispatch(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_offer public.ride_offers;
  v_driver_live boolean;
  v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Lock the ride so we can't race respond_offer (a concurrent accept).
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;

  -- Only meaningful while still searching for a driver.
  if v_ride.status <> 'searching' then
    return v_ride.status;
  end if;

  -- Latest outstanding offer for this ride.
  select * into v_offer
    from public.ride_offers
   where ride_id = p_ride_id and status in ('pending', 'awaiting_approval')
   order by offered_at desc
   limit 1;

  if found then
    -- A fare proposal is awaiting the rider's decision — never disturb it.
    if v_offer.status = 'awaiting_approval' then
      return 'awaiting_approval';
    end if;

    -- Is the offered driver still alive? Mirror dispatch's 60s liveness window.
    select exists (
      select 1 from public.driver_states ds
       where ds.driver_id = v_offer.driver_id
         and ds.is_online = true
         and ds.updated_at >= now() - interval '60 seconds'
    ) into v_driver_live;

    -- Live AND still inside the 2-minute response window → leave it alone.
    if v_driver_live and v_offer.offered_at >= now() - interval '2 minutes' then
      return 'pending';
    end if;

    -- Dead (closed browser) or timed out → expire it (tag timed_out so it counts
    -- as a missed offer in reporting) and fall through to re-dispatch. Guard on
    -- status = 'pending' so we never clobber an offer that was just accepted.
    update public.ride_offers
       set status = 'expired', responded_at = now(), timed_out = true
     where id = v_offer.id and status = 'pending';
    if not found then
      return v_ride.status; -- it changed under us (accepted) — nothing to do
    end if;
  end if;

  -- No outstanding offer (or we just expired a dead one) → re-offer to the next
  -- available driver. _offer_to_next_driver skips drivers already offered this
  -- ride and flips the ride to no_drivers when none are eligible.
  v_next := public._offer_to_next_driver(p_ride_id);
  return case when v_next is null then 'no_drivers' else 'searching' end;
end;
$$;

grant execute on function public.nudge_ride_dispatch(uuid) to authenticated;
