-- Phase 3: driver queue — go online/offline + live updates.

-- ---------------------------------------------------------------------
-- Online/offline transitions as SECURITY DEFINER functions so that:
--   1. queued_at uses SERVER time (now()), keeping FIFO order correct
--      regardless of device clock skew, and
--   2. a driver can only ever change their OWN row (auth.uid()).
-- ---------------------------------------------------------------------

create or replace function public.driver_go_online()
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_states
     set is_online    = true,
         availability = 'available',
         queued_at    = now(),
         updated_at   = now()
   where driver_id = auth.uid();
$$;

create or replace function public.driver_go_offline()
returns void
language sql
security definer
set search_path = public
as $$
  update public.driver_states
     set is_online    = false,
         availability = 'offline',
         queued_at    = null,
         updated_at   = now()
   where driver_id = auth.uid()
     -- A driver mid-trip can't just disappear from an active ride.
     and availability <> 'on_trip';
$$;

grant execute on function public.driver_go_online() to authenticated;
grant execute on function public.driver_go_offline() to authenticated;

-- ---------------------------------------------------------------------
-- Enable Realtime for the queue table (idempotent).
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'driver_states'
  ) then
    alter publication supabase_realtime add table public.driver_states;
  end if;
end $$;
