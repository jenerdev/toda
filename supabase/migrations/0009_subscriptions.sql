-- Subscriptions: a flat ₱30/month subscription gates access (see
-- docs/MONETIZATION.md). Access is time-based via profiles.subscription_until.
--   * Commuter needs active access to book_ride.
--   * Driver needs active access to driver_go_online.
-- First month is FREE for both (set at signup). A grace period softens expiry
-- so a user awaiting manual renewal approval isn't cut off mid-queue.
-- Renewals + admin approval (which extend subscription_until) land in 0010.

-- ---------------------------------------------------------------------
-- Subscription state. NULL = never subscribed (no access). The signup
-- trigger below grants every new account one free month.
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists subscription_until timestamptz;

-- ---------------------------------------------------------------------
-- has_active_access: true if the user's subscription is current, OR expired
-- within the grace window. Grace = 3 days (MONETIZATION.md says 3–5; the
-- renewal approval SLA is 24h, so 3 days comfortably covers the wait).
-- SECURITY DEFINER so it can read profiles regardless of the caller's RLS,
-- and reused by the gates below + future surfaces.
-- ---------------------------------------------------------------------
create or replace function public.has_active_access(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select subscription_until >= now() - interval '3 days'
       from public.profiles where id = p_uid),
    false
  );
$$;

grant execute on function public.has_active_access(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- First month free: extend the signup trigger to stamp subscription_until.
-- (Mirrors 0001 handle_new_user, adding the free month.)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone, subscription_until)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'commuter'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone',
    now() + interval '1 month'   -- first month free for every new account
  );

  if coalesce(new.raw_user_meta_data ->> 'role', 'commuter') = 'driver' then
    insert into public.driver_states (driver_id) values (new.id);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Gate booking on an active subscription (commuter side).
-- Redefines book_ride from 0008, adding the access check.
-- ---------------------------------------------------------------------
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
  if not public.has_active_access(v_uid) then
    raise exception 'Your subscription has expired. Renew to keep booking rides.';
  end if;

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

-- ---------------------------------------------------------------------
-- Gate going online on an active subscription (driver side).
-- Rewrites driver_go_online (0002) as plpgsql so it can reject expired
-- drivers with a clear message. driver_go_offline is unchanged.
-- ---------------------------------------------------------------------
create or replace function public.driver_go_online()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_active_access(auth.uid()) then
    raise exception 'Your subscription has expired. Renew to go online and receive rides.';
  end if;
  update public.driver_states
     set is_online    = true,
         availability = 'available',
         queued_at    = now(),
         updated_at   = now()
   where driver_id = auth.uid();
end;
$$;

-- profiles is already in the supabase_realtime publication (0004), so the
-- client's profile subscription picks up subscription_until changes live.
