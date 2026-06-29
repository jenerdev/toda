-- Distance-based pickup surcharge (see docs/ROADMAP.md → "pickup surcharge").
-- A driver may attach an optional surcharge to a FAR offer; the commuter must
-- approve it before the ride proceeds. The money is still CASH paid to the
-- driver outside the app — the app only relays the request and records the
-- agreed amount. The ≥1km gate is enforced client-side (the server has no
-- driver location at respond time); the server caps the amount and the
-- commuter's approval is the real guard.
--
-- Handshake: while awaiting approval the ride stays 'searching' but is HELD to
-- one driver via rides.pending_driver_id, and the offer sits in a new
-- 'awaiting_approval' state. The commuter sees the request on their own rides
-- row (rides.pending_surcharge) and approves/rejects.

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
alter table public.rides
  add column if not exists surcharge          int not null default 0,  -- agreed (permanent)
  add column if not exists pending_surcharge  int,                     -- transient: requested amount
  add column if not exists pending_driver_id  uuid references public.profiles (id); -- transient: requester

-- ride_offers gets a new 'awaiting_approval' status.
alter table public.ride_offers drop constraint if exists ride_offers_status_check;
alter table public.ride_offers add constraint ride_offers_status_check
  check (status in ('pending', 'accepted', 'declined', 'expired', 'awaiting_approval'));

-- ---------------------------------------------------------------------
-- _offer_to_next_driver: also skip drivers holding an 'awaiting_approval'
-- offer (they're committed to a ride pending the commuter's decision).
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
    and ds.updated_at >= now() - interval '60 seconds'        -- liveness (0007)
    and ds.driver_id not in (
      select ro.driver_id from public.ride_offers ro where ro.ride_id = p_ride_id
    )
    and not exists (
      select 1 from public.ride_offers ro2
      where ro2.driver_id = ds.driver_id and ro2.status in ('pending', 'awaiting_approval')
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
-- respond_offer: now takes an optional surcharge. Replaces the 2-arg version
-- (dropped to avoid an ambiguous overload). accept + surcharge=0 is unchanged;
-- accept + surcharge>0 holds the offer for the commuter's approval.
-- ---------------------------------------------------------------------
drop function if exists public.respond_offer(uuid, text);

create or replace function public.respond_offer(p_offer_id uuid, p_action text, p_surcharge int default 0)
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
  if p_surcharge is null then p_surcharge := 0; end if;
  if p_surcharge < 0 or p_surcharge > 50 or (p_surcharge % 5) <> 0 then
    raise exception 'Invalid surcharge amount';
  end if;

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

    if p_surcharge > 0 then
      -- Hold the offer pending the commuter's approval of the surcharge.
      if v_ride.pending_driver_id is not null then
        raise exception 'This ride already has a pending surcharge request';
      end if;
      update public.ride_offers set status = 'awaiting_approval', responded_at = now()
       where id = p_offer_id;
      update public.rides
         set pending_surcharge = p_surcharge, pending_driver_id = v_uid
       where id = v_ride.id;
      return json_build_object('result', 'awaiting_approval', 'surcharge', p_surcharge, 'ride_id', v_ride.id);
    end if;

    -- No surcharge → immediate accept (unchanged path).
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
-- approve_surcharge: commuter accepts the pending surcharge → ride accepted.
-- ---------------------------------------------------------------------
create or replace function public.approve_surcharge(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;
  -- Idempotent: nothing pending (already approved/rejected/cancelled).
  if v_ride.status <> 'searching' or v_ride.pending_driver_id is null then
    return json_build_object('result', 'noop');
  end if;

  update public.rides
     set status = 'accepted',
         driver_id = v_ride.pending_driver_id,
         surcharge = coalesce(v_ride.pending_surcharge, 0),
         accepted_at = now(),
         pending_surcharge = null,
         pending_driver_id = null
   where id = p_ride_id;

  update public.ride_offers set status = 'accepted', responded_at = now()
   where ride_id = p_ride_id and driver_id = v_ride.pending_driver_id and status = 'awaiting_approval';

  update public.driver_states set availability = 'on_trip', updated_at = now()
   where driver_id = v_ride.pending_driver_id;

  return json_build_object('result', 'accepted', 'ride_id', p_ride_id,
                           'surcharge', coalesce(v_ride.pending_surcharge, 0));
end;
$$;

-- ---------------------------------------------------------------------
-- reject_surcharge: commuter declines → offer declined, ride re-dispatched.
-- ---------------------------------------------------------------------
create or replace function public.reject_surcharge(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_driver uuid;
  v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;
  if v_ride.status <> 'searching' or v_ride.pending_driver_id is null then
    return json_build_object('result', 'noop');
  end if;

  v_driver := v_ride.pending_driver_id;
  update public.ride_offers set status = 'declined', responded_at = now()
   where ride_id = p_ride_id and driver_id = v_driver and status = 'awaiting_approval';
  update public.rides set pending_surcharge = null, pending_driver_id = null
   where id = p_ride_id;

  -- The just-declined driver already has an offer row for this ride, so
  -- _offer_to_next_driver skips them and moves to the next available driver.
  v_next := public._offer_to_next_driver(p_ride_id);
  return json_build_object('result', 'declined', 'next_driver', v_next);
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_ride: also clear a pending surcharge + expire its held offer.
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
  update public.rides set status = 'cancelled', pending_surcharge = null, pending_driver_id = null
   where id = p_ride_id;
  update public.ride_offers set status = 'expired', responded_at = now()
   where ride_id = p_ride_id and status in ('pending', 'awaiting_approval');
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.respond_offer(uuid, text, int) to authenticated;
grant execute on function public.approve_surcharge(uuid) to authenticated;
grant execute on function public.reject_surcharge(uuid) to authenticated;
