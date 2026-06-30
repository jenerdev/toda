-- Let the commuter attach a reason when declining a proposed fare (e.g. "Fare
-- is too high"). Stored on the declined ride_offers row so it reaches the driver
-- over the same Realtime channel they already watch (their own offers).

alter table public.ride_offers
  add column if not exists decline_reason text;

-- reject_surcharge: now takes an optional reason. Replaces the 1-arg version.
drop function if exists public.reject_surcharge(uuid);

create or replace function public.reject_surcharge(p_ride_id uuid, p_reason text default null)
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
  v_reason text := nullif(btrim(p_reason), '');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;
  if v_ride.status <> 'searching' or v_ride.pending_driver_id is null then
    return json_build_object('result', 'noop');
  end if;

  v_driver := v_ride.pending_driver_id;
  update public.ride_offers
     set status = 'declined', responded_at = now(), decline_reason = v_reason
   where ride_id = p_ride_id and driver_id = v_driver and status = 'awaiting_approval';
  update public.rides set pending_surcharge = null, pending_fare = null, pending_driver_id = null
   where id = p_ride_id;

  -- The just-declined driver already has an offer row for this ride, so
  -- _offer_to_next_driver skips them and moves to the next available driver.
  v_next := public._offer_to_next_driver(p_ride_id);
  return json_build_object('result', 'declined', 'next_driver', v_next);
end;
$$;

grant execute on function public.reject_surcharge(uuid, text) to authenticated;
