-- MotoQueue demo seed — a clean-slate subdivision with ready-to-use accounts.
-- ---------------------------------------------------------------------------
-- HOW TO RUN: paste this whole file into the Supabase SQL Editor and run it.
-- (There is no CLI/Docker in this project, so seeding is SQL-only.) Safe to
-- re-run: every row is upserted by a fixed UUID, so it won't create duplicates.
-- To undo, run supabase/seed_cleanup.sql.
--
-- WHAT IT CREATES
--   * 3 drivers — fully VERIFIED (driver_applications = 'approved'), with an
--     active subscription, ONLINE + available, pinned around the subdivision
--     center so a commuter can book and get matched immediately.
--   * 1 commuter — active subscription, ready to book.
--   Each account logs in through the normal app flow: enter the phone number
--   below, then the demo OTP 1234.
--
--   Phone           Name           Role      Login OTP
--   09170000001     Mang Tonyo     driver    1234
--   09170000002     Aling Rosa     driver    1234
--   09170000003     Kuya Boy       driver    1234
--   09170000009     Maria (demo)   commuter  1234
--
-- SUBDIVISION CENTER: 14.5995, 120.9842 — matches DEFAULT_CENTER in
-- src/pages/CommuterHome.tsx. Drivers are scattered a few hundred meters around it.
--
-- AUTH NOTE: we insert directly into auth.users with a bcrypt-hashed password
-- derived exactly like src/lib/phone.ts (`mq:<digits>:otp-v1`), plus a matching
-- auth.identities row, so the app's signInWithPassword works. pgcrypto's
-- crypt()/gen_salt() live in the `extensions` schema on Supabase; if you get
-- "function extensions.crypt does not exist", run
--   create extension if not exists pgcrypto with schema extensions;
-- (or drop the `extensions.` qualifier if pgcrypto is in public).
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_email  text;
  v_pw     text;
begin
  for r in
    select * from (values
      -- id (fixed)                              phone          full_name        role        lat       lng
      ('5eed0000-0000-4000-a000-000000000001'::uuid, '09170000001', 'Mang Tonyo',  'driver',   14.6010,  120.9858),
      ('5eed0000-0000-4000-a000-000000000002'::uuid, '09170000002', 'Aling Rosa',  'driver',   14.5982,  120.9821),
      ('5eed0000-0000-4000-a000-000000000003'::uuid, '09170000003', 'Kuya Boy',    'driver',   14.6007,  120.9829),
      ('5eed0000-0000-4000-a000-000000000009'::uuid, '09170000009', 'Maria (demo)','commuter', null,     null)
    ) as t(id, phone, full_name, role, lat, lng)
  loop
    v_email := r.phone || '@motoqueue.app';
    v_pw    := 'mq:' || r.phone || ':otp-v1';   -- mirrors derivePassword() in src/lib/phone.ts

    -- 1) auth.users — the trigger handle_new_user() fires on insert and creates
    --    public.profiles (+ driver_states for drivers), stamping a free month.
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change, email_change_token_new
    ) values (
      '00000000-0000-0000-0000-000000000000', r.id, 'authenticated', 'authenticated',
      v_email, extensions.crypt(v_pw, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('role', r.role, 'full_name', r.full_name, 'phone', r.phone),
      now(), now(),
      '', '', '', ''
    )
    on conflict (id) do nothing;

    -- 2) auth.identities — required for password sign-in to resolve the user.
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (r.id::text, r.id, jsonb_build_object('sub', r.id::text, 'email', v_email), 'email', now(), now(), now())
    on conflict do nothing;

    -- 3) Ensure an active subscription (trigger grants 1 month; refresh so a
    --    long-lived seed never demos as "expired").
    update public.profiles set subscription_until = now() + interval '1 month' where id = r.id;

    -- 4) Drivers: approve verification + put them online at the subdivision.
    if r.role = 'driver' then
      insert into public.driver_applications
        (driver_id, license_path, motorcycle_path, status, submitted_at, reviewed_at)
      values
        (r.id, 'seed/' || r.id || '/license.jpg', 'seed/' || r.id || '/motorcycle.jpg', 'approved', now(), now())
      on conflict (driver_id) do update
        set status = 'approved', rejection_reason = null, reviewed_at = now();

      update public.driver_states
         set is_online    = true,
             availability  = 'available',
             queued_at     = now(),
             last_lat      = r.lat,
             last_lng      = r.lng,
             updated_at    = now()
       where driver_id = r.id;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- LIVENESS REFRESH — re-run JUST THIS if you seeded a while ago.
-- Dispatch ignores drivers whose updated_at is older than 60s (the 0007
-- heartbeat filter). Seeded drivers have no live tab pinging driver_heartbeat,
-- so bump their timestamps right before demoing, or log in as each driver and
-- toggle online (which the live client then keeps fresh).
-- ---------------------------------------------------------------------------
update public.driver_states
   set queued_at = now(), updated_at = now()
 where driver_id in (
   '5eed0000-0000-4000-a000-000000000001',
   '5eed0000-0000-4000-a000-000000000002',
   '5eed0000-0000-4000-a000-000000000003'
 );

-- ---------------------------------------------------------------------------
-- OPTIONAL — make the demo commuter an admin (to demo /admin review screens):
--   update public.profiles set is_admin = true
--    where id = '5eed0000-0000-4000-a000-000000000009';
-- ---------------------------------------------------------------------------
