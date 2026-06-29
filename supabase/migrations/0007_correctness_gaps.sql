-- Correctness gaps (see docs/ROADMAP.md → "Remaining → Correctness gaps").
--   1. Stale / disconnected driver: a driver who CLOSES THE TAB (vs. signing
--      out) stays is_online = true / available and keeps getting offered rides
--      that vanish into a dead client. Fix: a heartbeat that bumps updated_at,
--      and exclude drivers whose updated_at is stale from dispatch + the queue.
--   2. Refund on cancel-after-accept: the fare is charged at accept (0005) with
--      no reversal path. Add cancel_accepted_ride to refund both sides and
--      free / re-queue the driver.

-- =====================================================================
-- Shared staleness threshold.
-- A live client should ping driver_heartbeat() well inside this window
-- (~every 20-30s) so a connected driver never crosses it. 60s gives slack
-- for a slow network without leaving a closed tab dispatchable for long.
-- =====================================================================
-- (Inlined as `interval '60 seconds'` below; kept in one comment for clarity.)

-- ---------------------------------------------------------------------
-- 1a. Heartbeat: the online driver bumps their own updated_at.
-- Idle/available drivers don't stream location, so this is what keeps
-- them "fresh"; on-trip drivers are already kept fresh by
-- update_driver_location, but calling this too is harmless.
-- Only affects an online driver's OWN row.
-- ---------------------------------------------------------------------
create or replace function public.driver_heartbeat()
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_states
     set updated_at = now()
   where driver_id = auth.uid()
     and is_online = true;
$$;

grant execute on function public.driver_heartbeat() to authenticated;

-- ---------------------------------------------------------------------
-- 1b. Exclude stale drivers from dispatch.
-- Redefines _offer_to_next_driver (last set in 0004) with one added
-- predicate: skip drivers whose updated_at is older than the heartbeat
-- window. This is the authoritative server-side fix — it works instantly
-- without depending on the reaper/cron below.
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
    -- must have a live client (not a closed/disconnected tab)
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

-- ---------------------------------------------------------------------
-- 1c. Reaper: mark stale available drivers offline so the live queue
-- list (and "you're #N") stops counting ghosts. Mirrors the
-- expire_stale_offers sweep pattern. Never touches on_trip drivers
-- (a mid-trip driver must not vanish; same guard as driver_go_offline).
-- Dispatch is already safe via 1b; this just keeps the displayed queue
-- honest and lets Realtime push the removal to other clients.
-- ---------------------------------------------------------------------
create or replace function public.reap_stale_drivers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.driver_states
     set is_online    = false,
         availability = 'offline',
         queued_at    = null,
         updated_at   = now()
   where is_online = true
     and availability = 'available'
     and updated_at < now() - interval '60 seconds';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.reap_stale_drivers() to authenticated;

-- =====================================================================
-- 2. Refund on cancel-after-accept.
-- =====================================================================

-- Allow a 'refund' entry in the ledger (was: 'ride_fee' | 'topup').
-- A refund is a positive amount that reverses the -5 ride_fee charged at accept.
alter table public.transactions
  drop constraint if exists transactions_kind_check;
alter table public.transactions
  add constraint transactions_kind_check
  check (kind in ('ride_fee', 'topup', 'refund'));

-- ---------------------------------------------------------------------
-- cancel_accepted_ride: either participant abandons a ride that was
-- already accepted (or enroute). Reverses the fare to BOTH sides, writes
-- two refund transactions, cancels the ride, and frees / re-queues the
-- driver at the END of the queue. Idempotent: a ride that's already
-- terminal is a no-op, so a double-tap can't double-refund. One transaction.
-- ---------------------------------------------------------------------
create or replace function public.cancel_accepted_ride(p_ride_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ride public.rides;
  v_fee int := 5;  -- flat fare, matching respond_offer / complete_ride
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_ride from public.rides where id = p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  if v_uid <> v_ride.client_id and v_uid <> v_ride.driver_id then
    raise exception 'Not a participant';
  end if;

  -- Idempotent / terminal-state guards (no double refund).
  if v_ride.status in ('cancelled', 'completed') then
    return json_build_object('result', 'already_' || v_ride.status);
  end if;
  if v_ride.status not in ('accepted', 'enroute') then
    -- Still searching / no_drivers: nothing was charged — use cancel_ride.
    raise exception 'Ride has not been accepted; use cancel_ride';
  end if;
  if v_ride.driver_id is null then raise exception 'Accepted ride has no driver'; end if;

  -- Reverse the fare charged at accept. Lock both balances first.
  perform credits from public.profiles where id = v_ride.client_id for update;
  perform credits from public.profiles where id = v_ride.driver_id for update;

  update public.profiles set credits = credits + v_fee where id = v_ride.client_id;
  update public.profiles set credits = credits + v_fee where id = v_ride.driver_id;

  insert into public.transactions (ride_id, user_id, amount, kind)
  values (p_ride_id, v_ride.client_id, v_fee, 'refund'),
         (p_ride_id, v_ride.driver_id, v_fee, 'refund');

  update public.rides set status = 'cancelled' where id = p_ride_id;

  -- Defensive: clear any still-pending offer for this ride.
  update public.ride_offers set status = 'expired', responded_at = now()
   where ride_id = p_ride_id and status = 'pending';

  -- Free the driver and re-queue them at the END (still online).
  update public.driver_states
     set availability = 'available', queued_at = now(), updated_at = now()
   where driver_id = v_ride.driver_id
     and is_online = true;

  return json_build_object('result', 'cancelled', 'refund', v_fee);
end;
$$;

grant execute on function public.cancel_accepted_ride(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- OPTIONAL hardening — schedule the stale-driver reaper with pg_cron,
-- alongside the expire_stale_offers sweep from 0003. Enable pg_cron in the
-- dashboard (Database -> Extensions), then run:
--
--   select cron.schedule('reap-stale-drivers', '30 seconds',
--                         $$ select public.reap_stale_drivers(); $$);
--
-- Dispatch is already stale-safe without this (see 1b); the reaper only
-- keeps the displayed queue from showing disconnected drivers.
-- ---------------------------------------------------------------------
