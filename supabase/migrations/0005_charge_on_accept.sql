-- Change: charge the fare when the driver ACCEPTS (commitment point), not at
-- completion. respond_offer now deducts 5 from each side + writes the two
-- transactions; complete_ride only finalizes status and re-queues the driver.

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
  v_fee int := 5;
  v_driver_credits int;
  v_client_credits int;
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

    -- Lock + verify both balances, then charge the fare now (at accept).
    select credits into v_driver_credits from public.profiles where id = v_uid for update;
    select credits into v_client_credits from public.profiles where id = v_ride.client_id for update;
    if v_driver_credits < v_fee then raise exception 'Not enough credits to accept (need 5)'; end if;
    if v_client_credits < v_fee then raise exception 'Rider has insufficient credits'; end if;

    update public.profiles set credits = credits - v_fee where id = v_uid;
    update public.profiles set credits = credits - v_fee where id = v_ride.client_id;
    insert into public.transactions (ride_id, user_id, amount, kind)
    values (v_ride.id, v_ride.client_id, -v_fee, 'ride_fee'),
           (v_ride.id, v_uid, -v_fee, 'ride_fee');

    update public.ride_offers set status = 'accepted', responded_at = now() where id = p_offer_id;
    update public.rides
       set status = 'accepted', driver_id = v_uid, accepted_at = now()
     where id = v_ride.id;
    update public.driver_states set availability = 'on_trip', updated_at = now()
     where driver_id = v_uid;
    return json_build_object('result', 'accepted', 'ride_id', v_ride.id, 'fee', v_fee);
  else
    update public.ride_offers set status = 'declined', responded_at = now() where id = p_offer_id;
    if v_ride.status = 'searching' then
      v_next := public._offer_to_next_driver(v_ride.id);
    end if;
    return json_build_object('result', 'declined', 'next_driver', v_next);
  end if;
end;
$$;

-- complete_ride: now just finalizes the ride and re-queues the driver.
-- (The fare was already charged at accept.)
create or replace function public.complete_ride(p_ride_id uuid)
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
  if v_ride.status = 'completed' then
    return json_build_object('result', 'already_completed');
  end if;
  if v_ride.status not in ('accepted', 'enroute') then
    raise exception 'Ride is not in progress';
  end if;

  update public.rides set status = 'completed', completed_at = now() where id = p_ride_id;

  update public.driver_states
     set availability = 'available', queued_at = now(), updated_at = now()
   where driver_id = v_ride.driver_id;

  return json_build_object('result', 'completed');
end;
$$;
