-- Retire per-ride credits. The revenue model changed from a 5+5 credit charge
-- per ride to a flat ₱30/month subscription that GATES ACCESS (see 0009).
-- Access is now purely time-based, so the app no longer touches per-ride money:
--   * no credit deduction at accept,
--   * no refund on cancel-after-accept,
--   * the `credits` column and the `transactions` ledger are removed entirely.
-- This resolves docs/MONETIZATION.md → "Open decision" (Option 1: retire credits).
--
-- ⚠️ DESTRUCTIVE: drops profiles.credits and the transactions table. Intended
-- for the pre-launch demo DB. Subscription gating lands in 0009; renewals +
-- admin review in 0010.

-- ---------------------------------------------------------------------
-- Redefine the money-touching functions FIRST (so nothing references the
-- transactions table when we drop it below), then drop the schema.
-- ---------------------------------------------------------------------

-- book_ride: no more credit precheck. (Subscription gate added in 0009.)
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
  v_ride_id uuid;
  v_driver uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'commuter' then raise exception 'Only commuters can book rides'; end if;

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

-- _offer_to_next_driver: drop the "can afford the fee" filter; KEEP the
-- stale-driver exclusion added in 0007.
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
    and ds.driver_id not in (
      select ro.driver_id from public.ride_offers ro where ro.ride_id = p_ride_id
    )
    and not exists (
      select 1 from public.ride_offers ro2
      where ro2.driver_id = ds.driver_id and ro2.status = 'pending'
    )
    -- must have a live client (not a closed/disconnected tab) — from 0007
    and ds.updated_at >= now() - interval '60 seconds'
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

-- respond_offer: accept no longer charges a fare or writes transactions.
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

-- cancel_accepted_ride (introduced 0007): no longer refunds — there is nothing
-- to refund. Still a real path: cancel the accepted/enroute ride and free the
-- driver. Idempotent against double-tap.
create or replace function public.cancel_accepted_ride(p_ride_id uuid)
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
  if v_uid <> v_ride.client_id and v_uid <> v_ride.driver_id then
    raise exception 'Not a participant';
  end if;

  if v_ride.status in ('cancelled', 'completed') then
    return json_build_object('result', 'already_' || v_ride.status);
  end if;
  if v_ride.status not in ('accepted', 'enroute') then
    raise exception 'Ride has not been accepted; use cancel_ride';
  end if;

  update public.rides set status = 'cancelled' where id = p_ride_id;

  update public.ride_offers set status = 'expired', responded_at = now()
   where ride_id = p_ride_id and status = 'pending';

  -- Free the driver and re-queue them at the END (still online).
  update public.driver_states
     set availability = 'available', queued_at = now(), updated_at = now()
   where driver_id = v_ride.driver_id
     and is_online = true;

  return json_build_object('result', 'cancelled');
end;
$$;

-- complete_ride (0005 version) already does no credit work — left as-is.

-- ---------------------------------------------------------------------
-- Drop the credit schema now that nothing writes to it.
-- (transactions' RLS policies + indexes drop with the table via CASCADE.)
-- ---------------------------------------------------------------------
drop table if exists public.transactions cascade;
alter table public.profiles drop column if exists credits;
