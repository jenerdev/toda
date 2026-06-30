-- Security hardening: SQL-injection surface.
-- (ROADMAP → "Security & abuse prevention" → SQL injection.)
--
-- AUDIT RESULT — the three sub-tasks were already satisfied in the existing
-- migrations; recorded here for the record, no code change needed for them:
--
--   (1) search_path: every SECURITY DEFINER function pins `set search_path =
--       public` (an explicit schema — the alternative the ROADMAP accepts to
--       `''`), so a caller cannot hijack name resolution. No function uses a
--       mutable search_path.
--   (2) No dynamic SQL anywhere: no EXECUTE '<sql>', format(), quote_ident,
--       quote_literal, or dblink. Every statement is static, parameterized
--       plpgsql/SQL. (The only `execute` tokens in the migrations are
--       `grant execute on function …` and the trigger `… execute function …`,
--       both static syntax — not dynamic SQL.)
--   (3) All user input enters as typed RPC parameters and is used as bound
--       variables — never string-concatenated or interpolated into SQL. The
--       client uses the parameterized supabase-js query builder; the realtime
--       `filter:` expressions interpolate only server-issued identifiers (the
--       caller's own auth uid, or a ride UUID) plus a hardcoded column name,
--       never free text.
--
-- THE ONE RESIDUAL GAP THIS MIGRATION CLOSES:
-- `set search_path = public` is only as safe as `public` being un-writable by
-- untrusted roles. If a client-facing role could CREATE an object in `public`,
-- it could shadow a table/function that a SECURITY DEFINER routine resolves —
-- the classic search_path attack. Revoke CREATE on `public` from the
-- client-facing roles so that's impossible. This is the standard Supabase
-- hardening and is a no-op on projects that already revoked it.

-- Remove the blanket grant that lets *every* role create objects in public.
revoke create on schema public from public;

-- Belt-and-suspenders: also drop any explicit grant to the client-facing roles,
-- guarded so this still applies cleanly on environments where a role is absent.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke create on schema public from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke create on schema public from authenticated';
  end if;
end $$;
