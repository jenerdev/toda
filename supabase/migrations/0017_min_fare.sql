-- Make the trip fare MANDATORY with a ₱20 floor (UI: min ₱20, ₱5 steps).
-- Redefines respond_offer (from 0015) to require p_fare >= 20 on ACCEPT, so
-- there's no more instant/zero-fare accept — every acceptance proposes a fare
-- the commuter approves. The check is scoped to the accept branch so DECLINE
-- (which passes fare 0) is unaffected. Surcharge plumbing is retained but the
-- UI always sends 0.

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

    -- Mandatory fare: a proposal of at least ₱20 is required to accept.
    if (p_fare + p_surcharge) < 20 then
      raise exception 'A fare of at least ₱20 is required';
    end if;

    -- Hold the offer pending the commuter's approval of the proposed fare.
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
  else
    update public.ride_offers set status = 'declined', responded_at = now() where id = p_offer_id;
    if v_ride.status = 'searching' then
      v_next := public._offer_to_next_driver(v_ride.id);
    end if;
    return json_build_object('result', 'declined', 'next_driver', v_next);
  end if;
end;
$$;

grant execute on function public.respond_offer(uuid, text, int, int) to authenticated;
