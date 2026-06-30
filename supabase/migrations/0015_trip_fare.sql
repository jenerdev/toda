-- Driver-proposed TRIP FARE (commuter pickup → destination), approved by the
-- commuter — same relay-only model as the pickup surcharge (0013). The money is
-- still CASH paid to the driver outside the app; the app only relays the
-- driver's proposed amount and records what the commuter agreed to. It does NOT
-- collect or set fares. (See docs/LEGAL.md — base TODA fares are ordinance-fixed,
-- so this is a proposed cash amount for the rider to accept, not an app tariff.)
--
-- The driver can now propose a trip fare AND a pickup surcharge in one accept.
-- If EITHER is > 0 the offer goes to 'awaiting_approval' and the commuter
-- approves/rejects the whole breakdown; both 0 = instant accept (unchanged).

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
alter table public.rides
  add column if not exists fare         int not null default 0,  -- agreed trip fare (permanent)
  add column if not exists pending_fare int;                     -- transient: requested fare

-- ---------------------------------------------------------------------
-- respond_offer: now also takes a trip fare. Replaces the 3-arg version
-- (dropped to avoid an ambiguous overload). accept with fare=0 AND surcharge=0
-- is the unchanged instant-accept; either > 0 holds for the commuter's approval.
-- ---------------------------------------------------------------------
drop function if exists public.respond_offer(uuid, text, int);

create or replace function public.respond_offer(
  p_offer_id uuid,
  p_action text,
  p_surcharge int default 0,
  p_fare int default 0
)
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
  if p_fare is null then p_fare := 0; end if;
  if p_surcharge < 0 or p_surcharge > 50 or (p_surcharge % 5) <> 0 then
    raise exception 'Invalid surcharge amount';
  end if;
  if p_fare < 0 or p_fare > 1000 then
    raise exception 'Invalid fare amount';
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

    if p_surcharge > 0 or p_fare > 0 then
      -- Hold the offer pending the commuter's approval of the fare/surcharge.
      if v_ride.pending_driver_id is not null then
        raise exception 'This ride already has a pending fare request';
      end if;
      update public.ride_offers set status = 'awaiting_approval', responded_at = now()
       where id = p_offer_id;
      update public.rides
         set pending_surcharge = p_surcharge, pending_fare = p_fare, pending_driver_id = v_uid
       where id = v_ride.id;
      return json_build_object(
        'result', 'awaiting_approval', 'surcharge', p_surcharge, 'fare', p_fare, 'ride_id', v_ride.id
      );
    end if;

    -- No fare/surcharge → immediate accept (fare agreed in person, cash).
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
-- approve_surcharge: commuter accepts the pending fare + surcharge → accepted.
-- (Name kept from 0013; now covers the whole proposed breakdown.)
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
         fare = coalesce(v_ride.pending_fare, 0),
         accepted_at = now(),
         pending_surcharge = null,
         pending_fare = null,
         pending_driver_id = null
   where id = p_ride_id;

  update public.ride_offers set status = 'accepted', responded_at = now()
   where ride_id = p_ride_id and driver_id = v_ride.pending_driver_id and status = 'awaiting_approval';

  update public.driver_states set availability = 'on_trip', updated_at = now()
   where driver_id = v_ride.pending_driver_id;

  return json_build_object('result', 'accepted', 'ride_id', p_ride_id,
                           'surcharge', coalesce(v_ride.pending_surcharge, 0),
                           'fare', coalesce(v_ride.pending_fare, 0));
end;
$$;

-- ---------------------------------------------------------------------
-- reject_surcharge: commuter declines → offer declined, ride re-dispatched.
-- Also clears the pending fare.
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
  update public.rides set pending_surcharge = null, pending_fare = null, pending_driver_id = null
   where id = p_ride_id;

  -- The just-declined driver already has an offer row for this ride, so
  -- _offer_to_next_driver skips them and moves to the next available driver.
  v_next := public._offer_to_next_driver(p_ride_id);
  return json_build_object('result', 'declined', 'next_driver', v_next);
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_ride: also clear a pending fare (alongside the surcharge).
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
  update public.rides
     set status = 'cancelled', pending_surcharge = null, pending_fare = null, pending_driver_id = null
   where id = p_ride_id;
  update public.ride_offers set status = 'expired', responded_at = now()
   where ride_id = p_ride_id and status in ('pending', 'awaiting_approval');
end;
$$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.respond_offer(uuid, text, int, int) to authenticated;
grant execute on function public.approve_surcharge(uuid) to authenticated;
grant execute on function public.reject_surcharge(uuid) to authenticated;
