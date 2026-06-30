-- Tie the rider's remembered pickup address + destination to their ACCOUNT
-- instead of the device. They were cached in localStorage (see CommuterHome),
-- which is per-device — so with single-active-session (0020) a rider who logs
-- in on another phone loses their saved addresses. Store the last booked values
-- on the profile so they follow the account across devices.
--
-- Persisted on each successful book_ride (the meaningful "remembered" value is
-- what the rider last actually booked, not every keystroke). The profile is
-- already loaded with select('*') and kept live over Realtime, so the client
-- picks these up with no extra fetch.

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_pickup_address text,
  add column if not exists last_destination    text;

-- ---------------------------------------------------------------------
-- book_ride: redefines the 0014 version (4-arg, subscription gate + destination
-- kept) with one addition — stamp the rider's profile with this booking's
-- pickup address + destination so the next session pre-fills from the account.
-- ---------------------------------------------------------------------
create or replace function public.book_ride(
  p_lat double precision,
  p_lng double precision,
  p_address text,
  p_destination text
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
  v_address text := nullif(btrim(p_address), '');
  v_destination text := nullif(btrim(p_destination), '');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'commuter' then raise exception 'Only commuters can book rides'; end if;
  if not public.has_active_access(v_uid) then
    raise exception 'Your subscription has expired. Renew to keep booking rides.';
  end if;
  if v_destination is null then
    raise exception 'Please enter where you''re going (destination).';
  end if;

  if exists (
    select 1 from public.rides
    where client_id = v_uid and status in ('searching', 'accepted', 'enroute')
  ) then
    raise exception 'You already have an active ride';
  end if;

  insert into public.rides (client_id, pickup_lat, pickup_lng, pickup_address, destination, status)
  values (v_uid, p_lat, p_lng, p_address, v_destination, 'searching')
  returning id into v_ride_id;

  -- Remember this booking's addresses on the account for next time.
  update public.profiles
     set last_pickup_address = v_address, last_destination = v_destination
   where id = v_uid;

  v_driver := public._offer_to_next_driver(v_ride_id);

  return json_build_object(
    'ride_id', v_ride_id,
    'status', case when v_driver is null then 'no_drivers' else 'searching' end
  );
end;
$$;

grant execute on function public.book_ride(double precision, double precision, text, text) to authenticated;
