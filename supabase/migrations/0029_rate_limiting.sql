-- Security & abuse prevention: per-user rate limiting.
-- (ROADMAP → "Security & abuse prevention".)
--
-- There is no API server in front of the app — the client talks straight to
-- Supabase (PostgREST + SECURITY DEFINER RPCs), so rate limiting has to live in
-- Postgres. This migration adds a reusable fixed-window limiter keyed on
-- auth.uid() and wires it into the abuse-prone, user-callable RPCs plus the
-- (direct-insert) chat path.
--
-- OUT OF SCOPE (by design):
--   * Auth / OTP endpoints — rate-limited by Supabase Auth itself (dashboard
--     config), not reachable from SQL. (Also moot while OTP is a dummy flow.)
--   * Admin RPCs (review_renewal, review_driver, admin_ride_stats) — admin-only,
--     negligible abuse surface.
--   * Cancels — cheap, low value to spam; can be added later if needed.

-- ---------------------------------------------------------------------------
-- Counter table. One row per (user, action, current window). RLS on + no policy
-- + no grants → NO direct client access; only the SECURITY DEFINER helper below
-- (which runs as the table owner and bypasses RLS) ever touches it.
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  user_id      uuid        not null,
  action       text        not null,
  window_start timestamptz not null,
  count        integer     not null default 0,
  primary key (user_id, action, window_start)
);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

-- ---------------------------------------------------------------------------
-- check_rate_limit: fixed-window counter. Floors now() to a p_window_seconds
-- bucket, bumps this user+action's count, and raises once it passes p_max.
--
-- Not granted to authenticated: it's an internal helper. The guarded RPCs are
-- SECURITY DEFINER owned by the same role, so they can call it regardless; the
-- chat trigger below is SECURITY DEFINER for the same reason.
--
-- NOTE ON SEMANTICS: a raise here rolls back the caller's whole transaction,
-- including this increment — so the bucket settles at exactly p_max successful
-- calls, and rejected (or otherwise-failing) calls don't count. That means a
-- caller who fails a *later* validation (e.g. book_ride's "already have an active
-- ride") isn't charged, which is fine: those paths are cheap. The expensive,
-- committed work is what the window caps.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_action text,
  p_max integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_bucket timestamptz;
  v_count  integer;
begin
  -- Unauthenticated callers are gated by the caller's own auth check; there's
  -- nothing to key a per-user limit on, so no-op here.
  if v_uid is null then return; end if;

  v_bucket := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  -- Keep the table tiny: this user+action only ever needs its current bucket.
  delete from public.rate_limits
   where user_id = v_uid and action = p_action and window_start < v_bucket;

  insert into public.rate_limits (user_id, action, window_start, count)
  values (v_uid, p_action, v_bucket, 1)
  on conflict (user_id, action, window_start)
    do update set count = public.rate_limits.count + 1
  returning count into v_count;

  if v_count > p_max then
    raise exception 'Too many requests. Please slow down and try again in a moment.'
      using errcode = 'P0001';
  end if;
end;
$$;

-- ===========================================================================
-- Guarded RPCs. Each is re-declared VERBATIM from its latest definition, with a
-- single check_rate_limit() line added right after the existing auth check.
-- Behaviour is otherwise unchanged. Limits are generous — invisible to real use
-- at pilot scale, tripping only on scripted/runaway abuse.
-- ===========================================================================

-- book_ride — from 0022 (+ rate limit: 8 / 60s).
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
  perform public.check_rate_limit('book_ride', 8, 60);

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

-- nudge_ride_dispatch — from 0024 (+ rate limit: 20 / 60s; client polls ~6/min).
create or replace function public.nudge_ride_dispatch(p_ride_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_offer public.ride_offers;
  v_driver_live boolean;
  v_next uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.check_rate_limit('nudge_ride_dispatch', 20, 60);

  -- Lock the ride so we can't race respond_offer (a concurrent accept).
  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_ride.client_id <> v_uid then raise exception 'Not your ride'; end if;

  -- Only meaningful while still searching for a driver.
  if v_ride.status <> 'searching' then
    return v_ride.status;
  end if;

  -- Latest outstanding offer for this ride.
  select * into v_offer
    from public.ride_offers
   where ride_id = p_ride_id and status in ('pending', 'awaiting_approval')
   order by offered_at desc
   limit 1;

  if found then
    -- A fare proposal is awaiting the rider's decision — never disturb it.
    if v_offer.status = 'awaiting_approval' then
      return 'awaiting_approval';
    end if;

    -- Is the offered driver still alive? Mirror dispatch's 60s liveness window.
    select exists (
      select 1 from public.driver_states ds
       where ds.driver_id = v_offer.driver_id
         and ds.is_online = true
         and ds.updated_at >= now() - interval '60 seconds'
    ) into v_driver_live;

    -- Live AND still inside the 2-minute response window → leave it alone.
    if v_driver_live and v_offer.offered_at >= now() - interval '2 minutes' then
      return 'pending';
    end if;

    -- Dead (closed browser) or timed out → expire it (tag timed_out so it counts
    -- as a missed offer in reporting) and fall through to re-dispatch. Guard on
    -- status = 'pending' so we never clobber an offer that was just accepted.
    update public.ride_offers
       set status = 'expired', responded_at = now(), timed_out = true
     where id = v_offer.id and status = 'pending';
    if not found then
      return v_ride.status; -- it changed under us (accepted) — nothing to do
    end if;
  end if;

  -- No outstanding offer (or we just expired a dead one) → re-offer to the next
  -- available driver. _offer_to_next_driver skips drivers already offered this
  -- ride and flips the ride to no_drivers when none are eligible.
  v_next := public._offer_to_next_driver(p_ride_id);
  return case when v_next is null then 'no_drivers' else 'searching' end;
end;
$$;

grant execute on function public.nudge_ride_dispatch(uuid) to authenticated;

-- submit_renewal — from 0010 (+ rate limit: 5 / hour; protects admin queue).
create or replace function public.submit_renewal(
  p_ref text,
  p_screenshot_path text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref text := upper(trim(p_ref));
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.check_rate_limit('submit_renewal', 5, 3600);
  if v_ref is null or length(v_ref) < 4 then
    raise exception 'Enter a valid GCash reference number';
  end if;

  if exists (select 1 from public.renewals where user_id = v_uid and status = 'pending') then
    raise exception 'You already have a renewal under review.';
  end if;
  if exists (select 1 from public.renewals where gcash_ref = v_ref) then
    raise exception 'That GCash reference number has already been submitted.';
  end if;

  insert into public.renewals (user_id, gcash_ref, screenshot_path)
  values (v_uid, v_ref, p_screenshot_path)
  returning id into v_id;

  return json_build_object('result', 'submitted', 'renewal_id', v_id, 'status', 'pending');
exception
  when unique_violation then
    -- Race: someone submitted the same ref between the check and the insert.
    raise exception 'That GCash reference number has already been submitted.';
end;
$$;

grant execute on function public.submit_renewal(text, text) to authenticated;

-- submit_driver_application — from 0011 (+ rate limit: 5 / hour).
create or replace function public.submit_driver_application(
  p_license_path text,
  p_motorcycle_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform public.check_rate_limit('submit_driver_application', 5, 3600);
  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'driver' then raise exception 'Only drivers submit verification documents'; end if;
  if p_license_path is null or p_motorcycle_path is null then
    raise exception 'Both a license photo and a motorcycle photo are required';
  end if;

  select status into v_existing from public.driver_applications where driver_id = v_uid;
  if v_existing = 'approved' then
    return json_build_object('result', 'already_approved');
  end if;

  insert into public.driver_applications (driver_id, license_path, motorcycle_path, status, submitted_at)
  values (v_uid, p_license_path, p_motorcycle_path, 'pending', now())
  on conflict (driver_id) do update
    set license_path     = excluded.license_path,
        motorcycle_path  = excluded.motorcycle_path,
        status           = 'pending',
        rejection_reason = null,
        submitted_at     = now(),
        reviewed_by      = null,
        reviewed_at      = null;

  return json_build_object('result', 'submitted', 'status', 'pending');
end;
$$;

grant execute on function public.submit_driver_application(text, text) to authenticated;

-- claim_session — from 0020 (+ rate limit: 20 / 60s; login/session churn).
create or replace function public.claim_session(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  perform public.check_rate_limit('claim_session', 20, 60);
  update public.profiles
     set active_session_id = nullif(btrim(p_session_id), '')
   where id = auth.uid();
end;
$$;

grant execute on function public.claim_session(text) to authenticated;

-- ===========================================================================
-- Chat is a direct INSERT into messages (no RPC), so its limit rides on a
-- BEFORE INSERT trigger. SECURITY DEFINER so it can call the internal helper.
-- Limit: 20 / 60s (~1 message / 3s).
-- ===========================================================================
create or replace function public.rate_limit_messages()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.check_rate_limit('messages', 20, 60);
  return new;
end;
$$;

drop trigger if exists messages_rate_limit on public.messages;
create trigger messages_rate_limit
  before insert on public.messages
  for each row execute function public.rate_limit_messages();
