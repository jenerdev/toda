-- Phase 6: ride completion, credit deduction, and re-queue.

-- ---------------------------------------------------------------------
-- Don't offer rides to drivers who can't afford the fee, and re-check on
-- accept. (book_ride already guards the commuter side.)
-- Redefines the Phase-5 routines with the credit checks added.
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
    and ds.driver_id not in (
      select ro.driver_id from public.ride_offers ro where ro.ride_id = p_ride_id
    )
    and not exists (
      select 1 from public.ride_offers ro2
      where ro2.driver_id = ds.driver_id and ro2.status = 'pending'
    )
    -- must be able to pay the fee
    and coalesce((select p.credits from public.profiles p where p.id = ds.driver_id), 0) >= 5
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
    if (select credits from public.profiles where id = v_uid) < 5 then
      raise exception 'Not enough credits to accept (need 5)';
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
-- complete_ride: either participant marks the ride done.
-- Deducts the flat fee from BOTH sides, records two transactions, and
-- re-queues the driver at the END of the queue. All in one transaction.
-- ---------------------------------------------------------------------
create or replace function public.complete_ride(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_client_credits int;
  v_driver_credits int;
  v_fee int := 5;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_uid <> v_ride.client_id and v_uid <> v_ride.driver_id then
    raise exception 'Not a participant';
  end if;
  if v_ride.status = 'completed' then
    return json_build_object('result', 'already_completed');
  end if;
  if v_ride.status not in ('accepted', 'enroute') then
    raise exception 'Ride is not in progress';
  end if;
  if v_ride.driver_id is null then raise exception 'Ride has no driver'; end if;

  -- Lock both balances before touching them.
  select credits into v_client_credits from public.profiles where id = v_ride.client_id for update;
  select credits into v_driver_credits from public.profiles where id = v_ride.driver_id for update;
  if v_client_credits < v_fee or v_driver_credits < v_fee then
    raise exception 'Insufficient credits to complete the ride';
  end if;

  update public.profiles set credits = credits - v_fee where id = v_ride.client_id;
  update public.profiles set credits = credits - v_fee where id = v_ride.driver_id;

  insert into public.transactions (ride_id, user_id, amount, kind)
  values (p_ride_id, v_ride.client_id, -v_fee, 'ride_fee'),
         (p_ride_id, v_ride.driver_id, -v_fee, 'ride_fee');

  update public.rides set status = 'completed', completed_at = now() where id = p_ride_id;

  -- Re-queue the driver at the END (still online, fresh queued_at).
  update public.driver_states
     set availability = 'available', queued_at = now(), updated_at = now()
   where driver_id = v_ride.driver_id;

  return json_build_object('result', 'completed', 'fee', v_fee);
end;
$$;

grant execute on function public.complete_ride(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime on profiles so the credit badge updates live after a ride.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
