-- MotoQueue demo seed — teardown. Paste into the Supabase SQL Editor and run.
-- Deleting the seeded auth.users cascades (on delete cascade) to public.profiles
-- and from there to driver_states, driver_applications, rides, ride_offers,
-- messages, and renewals — so this removes every trace of the demo accounts.
-- auth.identities is also cleaned up by the cascade from auth.users.

delete from auth.users
 where id in (
   '5eed0000-0000-4000-a000-000000000001',  -- Mang Tonyo (driver)
   '5eed0000-0000-4000-a000-000000000002',  -- Aling Rosa (driver)
   '5eed0000-0000-4000-a000-000000000003',  -- Kuya Boy (driver)
   '5eed0000-0000-4000-a000-000000000009'   -- Maria (commuter)
 );
