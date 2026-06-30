-- ============================================================================
-- RLS / authorization audit — forged-JWT denial checks.
-- ============================================================================
-- Run in the Supabase SQL editor (as the default postgres role). Each block
-- impersonates an authenticated user by forging the JWT claim that auth.uid()
-- reads, then asserts the EXPECTED DENIAL. A broken boundary RAISEs 'FAIL: …';
-- "OK: …" notices mean the boundary holds. Everything runs inside transactions
-- that ROLL BACK, so no data is changed.
--
-- Verifies the guarantees from migration 0026 + the existing RLS policies:
--   • a non-admin sees only their OWN profile / rides / renewals / messages
--   • a user CANNOT escalate is_admin or extend subscription_until
--   • a user CANNOT write renewals.status or insert rides directly
--   • a driver CANNOT hand-edit driver_states (queue jump / status spoof)
--
-- SETUP — paste a real COMMUTER id and a real DRIVER id (must be non-admins).
--   Find them with:  select id, role, is_admin, full_name from public.profiles order by role;
-- Then replace the two placeholders below (every occurrence).
--   COMMUTER:  00000000-0000-0000-0000-0000000000AA
--   DRIVER:    00000000-0000-0000-0000-0000000000DD
-- ============================================================================


-- ---------------------------------------------------------------------------
-- A) As a COMMUTER (non-admin)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000AA","role":"authenticated"}',
  true
);

-- A1: profile reads are scoped to self (a non-admin sees exactly 1 profile).
do $$
declare n int;
begin
  select count(*) into n from public.profiles;
  if n = 1 then raise notice 'OK (A1): profiles SELECT scoped to self';
  else raise exception 'FAIL (A1): commuter sees % profiles (expected 1 = self)', n;
  end if;
end $$;

-- A2: cannot escalate to admin.
do $$
begin
  update public.profiles set is_admin = true
   where id = '00000000-0000-0000-0000-0000000000AA';
  raise exception 'FAIL (A2): profiles.is_admin was updatable by the owner';
exception when insufficient_privilege then
  raise notice 'OK (A2): profiles.is_admin UPDATE denied';
end $$;

-- A3: cannot self-extend the subscription.
do $$
begin
  update public.profiles set subscription_until = now() + interval '10 years'
   where id = '00000000-0000-0000-0000-0000000000AA';
  raise exception 'FAIL (A3): profiles.subscription_until was self-updatable';
exception when insufficient_privilege then
  raise notice 'OK (A3): profiles.subscription_until UPDATE denied';
end $$;

-- A4: editing your OWN display name is allowed (the one permitted column).
do $$
begin
  update public.profiles set full_name = 'RLS audit (rolled back)'
   where id = '00000000-0000-0000-0000-0000000000AA';
  raise notice 'OK (A4): profiles.full_name self-edit allowed';
exception when insufficient_privilege then
  raise exception 'FAIL (A4): full_name self-edit unexpectedly denied';
end $$;

-- A5: cannot read another user's renewals, and cannot approve a renewal.
do $$
declare n int;
begin
  select count(*) into n from public.renewals
   where user_id <> '00000000-0000-0000-0000-0000000000AA';
  if n = 0 then raise notice 'OK (A5a): renewals SELECT scoped to self';
  else raise exception 'FAIL (A5a): commuter can read % renewals of others', n;
  end if;

  begin
    update public.renewals set status = 'approved' where true;
    raise exception 'FAIL (A5b): renewals.status was client-writable';
  exception when insufficient_privilege then
    raise notice 'OK (A5b): renewals UPDATE denied';
  end;
end $$;

-- A6: cannot insert a ride directly (must go through book_ride RPC).
do $$
begin
  insert into public.rides (client_id, pickup_lat, pickup_lng, status)
  values ('00000000-0000-0000-0000-0000000000AA', 14.6, 121.0, 'searching');
  raise exception 'FAIL (A6): direct INSERT into rides was allowed';
exception when insufficient_privilege then
  raise notice 'OK (A6): direct rides INSERT denied';
end $$;

-- A7: cannot read messages from a ride the commuter isn't part of.
do $$
declare n int;
begin
  select count(*) into n
    from public.messages m
   where not exists (
     select 1 from public.rides r
      where r.id = m.ride_id
        and (r.client_id = '00000000-0000-0000-0000-0000000000AA'
             or r.driver_id = '00000000-0000-0000-0000-0000000000AA')
   );
  if n = 0 then raise notice 'OK (A7): messages SELECT scoped to participant';
  else raise exception 'FAIL (A7): commuter can read % non-participant messages', n;
  end if;
end $$;

rollback;


-- ---------------------------------------------------------------------------
-- B) As a DRIVER (non-admin)
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-0000000000DD","role":"authenticated"}',
  true
);

-- B1: cannot hand-edit own driver_states (queue jump via queued_at).
do $$
begin
  update public.driver_states set queued_at = now() - interval '1 day'
   where driver_id = '00000000-0000-0000-0000-0000000000DD';
  raise exception 'FAIL (B1): driver could hand-edit driver_states (queue jump)';
exception when insufficient_privilege then
  raise notice 'OK (B1): driver_states UPDATE denied';
end $$;

-- B2: cannot self-extend subscription either.
do $$
begin
  update public.profiles set subscription_until = now() + interval '10 years'
   where id = '00000000-0000-0000-0000-0000000000DD';
  raise exception 'FAIL (B2): driver could self-extend subscription_until';
exception when insufficient_privilege then
  raise notice 'OK (B2): profiles.subscription_until UPDATE denied';
end $$;

rollback;

-- Done. All "OK" → boundaries hold. Any "FAIL" → an authorization gap to fix.
