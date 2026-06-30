-- Admin ride-outcome reporting.
--
-- The admin needs counts of completed / cancelled / "missed" / fare-declined
-- rides, plus a breakdown of cancellation reasons. Two of those can't be read
-- cleanly from the existing schema because the offer status values are
-- overloaded:
--
--   * "missed" (a driver let an offer expire) — `ride_offers.status = 'expired'`
--     is written by THREE paths: the genuine driver-no-response sweep
--     (expire_stale_offers), an offer auto-voided because the ride was taken
--     elsewhere (respond_offer), and offers killed when the commuter cancels
--     (cancel_ride). All set responded_at = now(), so nothing isolates a true
--     no-response.
--   * "fare declined" — reject_surcharge moves an offer awaiting_approval ->
--     declined, but an ordinary driver decline also ends at 'declined'. Only
--     the fare path writes decline_reason, and that reason is optional.
--
-- Fix: two isolated boolean flags (no status-enum churn, backward-compatible),
-- set at the single point each event happens, plus an admin-only aggregation
-- RPC. The flags only change going forward; fare_rejected is backfilled from
-- decline_reason (which only reject_surcharge ever wrote), but timed_out can't
-- be backfilled (the three expiry causes are indistinguishable historically).

-- ---------------------------------------------------------------------
-- Discriminator columns.
-- ---------------------------------------------------------------------
alter table public.ride_offers
  add column if not exists timed_out     boolean not null default false,
  add column if not exists fare_rejected boolean not null default false;

-- Recover historical fare rejections: only reject_surcharge ever set
-- decline_reason, so a non-null reason unambiguously marks a fare rejection.
-- (Fare rejections with an empty reason can't be recovered — they're
-- indistinguishable from a plain driver decline before this migration.)
update public.ride_offers
   set fare_rejected = true
 where decline_reason is not null and fare_rejected = false;

-- ---------------------------------------------------------------------
-- expire_stale_offers: tag the genuine driver-no-response expiries so the
-- "missed" report excludes ride-taken / commuter-cancel expiries. Body is
-- the 2-minute version from 0016 with the single `timed_out = true` added.
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_offers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select * from public.ride_offers
    where status = 'pending' and offered_at < now() - interval '2 minutes'
    for update skip locked
  loop
    update public.ride_offers
       set status = 'expired', responded_at = now(), timed_out = true
     where id = r.id;
    if exists (select 1 from public.rides where id = r.ride_id and status = 'searching') then
      perform public._offer_to_next_driver(r.ride_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------
-- reject_surcharge: tag the declined offer as a fare rejection. Body is the
-- 2-arg version from 0018 with the single `fare_rejected = true` added.
-- ---------------------------------------------------------------------
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
     set status = 'declined', responded_at = now(), decline_reason = v_reason, fare_rejected = true
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

-- ---------------------------------------------------------------------
-- admin_ride_stats: aggregate ride outcomes for the admin Reports section.
-- Admin check enforced INSIDE the function (same pattern as review_renewal,
-- 0010). Optional [p_from, p_to) window; null bounds = all-time. Rides are
-- filtered on created_at, offers on offered_at.
-- ---------------------------------------------------------------------
create or replace function public.admin_ride_stats(
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_completed  int;
  v_cancelled  int;
  v_no_drivers int;
  v_missed     int;
  v_fare_decl  int;
  v_reasons    json;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;

  select
    count(*) filter (where status = 'completed'),
    count(*) filter (where status = 'cancelled'),
    count(*) filter (where status = 'no_drivers')
    into v_completed, v_cancelled, v_no_drivers
  from public.rides
  where (p_from is null or created_at >= p_from)
    and (p_to   is null or created_at <  p_to);

  select
    count(*) filter (where timed_out),
    count(*) filter (where fare_rejected)
    into v_missed, v_fare_decl
  from public.ride_offers
  where (p_from is null or offered_at >= p_from)
    and (p_to   is null or offered_at <  p_to);

  select coalesce(json_agg(row_to_json(t) order by t.count desc), '[]'::json)
    into v_reasons
  from (
    select cancellation_reason as reason, count(*)::int as count
    from public.rides
    where status = 'cancelled'
      and cancellation_reason is not null
      and (p_from is null or created_at >= p_from)
      and (p_to   is null or created_at <  p_to)
    group by cancellation_reason
  ) t;

  return json_build_object(
    'completed',     v_completed,
    'cancelled',     v_cancelled,
    'no_drivers',    v_no_drivers,
    'missed',        v_missed,
    'fare_declined', v_fare_decl,
    'cancellation_reasons', v_reasons
  );
end;
$$;

grant execute on function public.admin_ride_stats(timestamptz, timestamptz) to authenticated;
