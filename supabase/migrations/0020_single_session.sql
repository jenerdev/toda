-- Single active session per account. On login a device stamps its own session
-- id onto its profile (claim_session). A later login from another device
-- overwrites it; every device watches its own profile row over Realtime and
-- signs itself out when active_session_id no longer matches — so an account
-- can't be used on two devices at once (last login wins).

alter table public.profiles
  add column if not exists active_session_id text;

-- Set the caller's active session id (SECURITY DEFINER — active_session_id is
-- not directly client-writable, like the other trusted profile columns).
create or replace function public.claim_session(p_session_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  update public.profiles
     set active_session_id = nullif(btrim(p_session_id), '')
   where id = auth.uid();
end;
$$;

grant execute on function public.claim_session(text) to authenticated;
