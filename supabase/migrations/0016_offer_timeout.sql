-- Rider-pickup time limit: 30 s → 2 minutes.
-- The driver's client countdown (OFFER_TIMEOUT_SECONDS in src/types/db.ts) is
-- the primary timeout; this safety-net sweep catches closed tabs. Bump its
-- interval to match so an offer the driver still sees as live (up to 2 min)
-- isn't expired out from under them server-side.

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
    update public.ride_offers set status = 'expired', responded_at = now() where id = r.id;
    if exists (select 1 from public.rides where id = r.ride_id and status = 'searching') then
      perform public._offer_to_next_driver(r.ride_id);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
