-- Let either party attach a reason when cancelling an ACCEPTED ride, recorded
-- on the ride and shown to the other party (e.g. driver "Cannot find the
-- commuter", commuter "Driver takes too long to arrive").

alter table public.rides
  add column if not exists cancellation_reason text;

-- cancel_accepted_ride: now takes an optional reason. Replaces the 1-arg
-- version (dropped to avoid an ambiguous overload). Behaviour is otherwise
-- unchanged — cancel the accepted/enroute ride and free the driver, idempotent.
drop function if exists public.cancel_accepted_ride(uuid);

create or replace function public.cancel_accepted_ride(p_ride_id uuid, p_reason text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_reason text := nullif(btrim(p_reason), '');
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

  update public.rides set status = 'cancelled', cancellation_reason = v_reason where id = p_ride_id;

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

grant execute on function public.cancel_accepted_ride(uuid, text) to authenticated;
