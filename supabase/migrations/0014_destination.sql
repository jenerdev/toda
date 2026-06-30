-- Ride destination (see docs/DATA_MODEL.md). The commuter names WHERE they're
-- going in addition to the pickup, so the driver knows the trip before they
-- accept (and can judge distance/fare — fares are still cash, set off-app).
-- Free text, like pickup_address — no geocoding (a deliberate project choice).

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------
-- Nullable so existing rows stay valid; new bookings require it (UI + the RPC
-- below both enforce non-empty).
alter table public.rides
  add column if not exists destination text;

-- ---------------------------------------------------------------------
-- book_ride: now takes a destination. Redefines the 0009 version (subscription
-- gate kept) and drops the old 3-arg signature so there's one canonical
-- function (a new param is a new overload, not a replace).
-- ---------------------------------------------------------------------
drop function if exists public.book_ride(double precision, double precision, text);

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

  v_driver := public._offer_to_next_driver(v_ride_id);

  return json_build_object(
    'ride_id', v_ride_id,
    'status', case when v_driver is null then 'no_drivers' else 'searching' end
  );
end;
$$;

grant execute on function public.book_ride(double precision, double precision, text, text) to authenticated;
