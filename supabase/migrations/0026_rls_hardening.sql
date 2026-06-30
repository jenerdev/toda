-- Security hardening: Authorization / RLS (anti-hack core).
-- (ROADMAP → "Security & abuse prevention" → Authorization / RLS audit.)
--
-- The anon key is public, so RLS + table privileges are the real boundary.
--
-- AUDIT — READ paths (already correct, recorded for the record):
--   * profiles            — SELECT own (auth.uid() = id) + admin (is_admin()).
--   * rides               — SELECT only as participant (client_id/driver_id) or
--                           as a driver who was offered the ride.
--   * messages            — SELECT only as a ride participant.
--   * ride_offers         — SELECT only your own (driver_id = auth.uid()).
--   * renewals / driver_applications — SELECT own + admin.
--   So no client can READ another user's rows.
--
-- AUDIT — WRITE paths (the holes this migration closes): Supabase grants full
-- DML to anon/authenticated by default, with RLS the only gate — and two own-row
-- UPDATE policies were far too broad:
--   * profiles_update_own → a user could UPDATE ANY column of their own row,
--     including is_admin (admin takeover), subscription_until (free unlimited
--     access), role, and active_session_id (bypass single-session).
--   * driver_states_update_own / _upsert_own → a driver could directly set
--     queued_at (jump the FIFO dispatch queue) and is_online / availability.
--
-- The app performs NO direct client writes to these tables — every mutation goes
-- through a SECURITY DEFINER RPC, which runs as the table owner and is therefore
-- unaffected by the revokes below. The only legitimate direct client writes are
-- messages INSERT (chat) and push_subscriptions (own rows); both are kept.
--
-- Fix: strip the over-broad DML privilege from the client roles so the RPCs are
-- the ONLY path that mutates these tables — a privilege-layer gate underneath
-- RLS, so a future too-permissive policy can't reopen the hole on its own.

-- profiles ------------------------------------------------------------------
-- Lock all columns; allow a user to edit only their own display name. (phone is
-- the login identity — it stays RPC-only; subscription_until/is_admin/role/
-- active_session_id are trusted columns, RPC-only.) profiles_update_own stays:
-- it scopes the row to self, and the column GRANT scopes which column.
revoke insert, update, delete on public.profiles from anon, authenticated;
grant  update (full_name)     on public.profiles to   authenticated;

-- driver_states -------------------------------------------------------------
-- Online/offline, queue position and location all move via RPC only.
revoke insert, update, delete on public.driver_states from anon, authenticated;
drop policy if exists driver_states_update_own on public.driver_states;
drop policy if exists driver_states_upsert_own on public.driver_states;

-- Other RPC-managed tables: clients read (RLS-scoped) but never write directly.
-- (The credits/transactions ledger was dropped in 0008, so it's not listed.)
revoke insert, update, delete on public.rides              from anon, authenticated;
revoke insert, update, delete on public.ride_offers         from anon, authenticated;
revoke insert, update, delete on public.renewals            from anon, authenticated;
revoke insert, update, delete on public.driver_applications from anon, authenticated;

-- messages: keep INSERT (RLS restricts it to self + ride participant); there is
-- no message edit/delete flow, so remove those.
revoke update, delete on public.messages from anon, authenticated;
