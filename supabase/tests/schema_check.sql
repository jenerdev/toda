-- ============================================================================
-- Schema catch-up check — which recent migrations are applied to this DB?
-- ============================================================================
-- Run in the Supabase SQL editor (read-only: information_schema / catalog
-- lookups + has_* privilege checks; changes nothing). Prints a ✅/❌ row per
-- marker object from migrations 0020–0026.
--
--   • All ✅                       → schema is caught up through 0026.
--   • A migration's rows are ❌     → that migration isn't applied; run the
--                                     matching supabase/migrations/00NN_*.sql
--                                     files in order.
-- ============================================================================

with checks(migration, object, present) as (
  values
   ('0020 single session',  'profiles.active_session_id column',
      exists(select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='active_session_id')),
   ('0020 single session',  'claim_session(text) fn',
      to_regprocedure('public.claim_session(text)') is not null),

   ('0021 ride reporting',  'ride_offers.timed_out column',
      exists(select 1 from information_schema.columns
             where table_schema='public' and table_name='ride_offers' and column_name='timed_out')),
   ('0021 ride reporting',  'ride_offers.fare_rejected column',
      exists(select 1 from information_schema.columns
             where table_schema='public' and table_name='ride_offers' and column_name='fare_rejected')),
   ('0021 ride reporting',  'admin_ride_stats(timestamptz,timestamptz) fn',
      to_regprocedure('public.admin_ride_stats(timestamptz,timestamptz)') is not null),

   ('0022 saved addresses', 'profiles.last_pickup_address column',
      exists(select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='last_pickup_address')),
   ('0022 saved addresses', 'profiles.last_destination column',
      exists(select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='last_destination')),

   ('0023 cost indexes',    'idx_renewals_user',        to_regclass('public.idx_renewals_user')       is not null),
   ('0023 cost indexes',    'idx_rides_created',        to_regclass('public.idx_rides_created')        is not null),
   ('0023 cost indexes',    'idx_ride_offers_offered',  to_regclass('public.idx_ride_offers_offered')  is not null),

   ('0024 dead offer nudge','nudge_ride_dispatch(uuid) fn',
      to_regprocedure('public.nudge_ride_dispatch(uuid)') is not null),

   ('0025 sqli hardening',  'authenticated lacks CREATE on public',
      not has_schema_privilege('authenticated','public','CREATE')),

   ('0026 rls hardening',   'authenticated lacks table UPDATE on profiles',
      not has_table_privilege('authenticated','public.profiles','UPDATE')),
   ('0026 rls hardening',   'profiles.full_name column-grant kept',
      has_column_privilege('authenticated','public.profiles','full_name','UPDATE')),
   ('0026 rls hardening',   'authenticated lacks UPDATE on driver_states',
      not has_table_privilege('authenticated','public.driver_states','UPDATE')),
   ('0026 rls hardening',   'driver_states_update_own policy dropped',
      not exists(select 1 from pg_policies
                 where schemaname='public' and tablename='driver_states' and policyname='driver_states_update_own')),

   ('0027 location privacy','driver_locations table',     to_regclass('public.driver_locations') is not null),
   ('0027 location privacy','driver_states.last_lat dropped',
      not exists(select 1 from information_schema.columns
                 where table_schema='public' and table_name='driver_states' and column_name='last_lat'))
)
select migration, object,
       case when present then '✅' else '❌ MISSING' end as status
from checks
order by migration, object;
