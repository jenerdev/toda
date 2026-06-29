-- MotoQueue initial schema, indexes, and Row-Level Security.
-- See docs/DATA_MODEL.md for the design rationale.

-- =====================================================================
-- Tables
-- =====================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        text not null check (role in ('commuter', 'driver')),
  full_name   text,
  phone       text,
  credits     integer not null default 100 check (credits >= 0),
  created_at  timestamptz not null default now()
);

create table if not exists public.driver_states (
  driver_id     uuid primary key references public.profiles (id) on delete cascade,
  is_online     boolean not null default false,
  availability  text not null default 'offline' check (availability in ('available', 'on_trip', 'offline')),
  queued_at     timestamptz,
  last_lat      double precision,
  last_lng      double precision,
  updated_at    timestamptz not null default now()
);

create table if not exists public.rides (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.profiles (id) on delete cascade,
  driver_id       uuid references public.profiles (id) on delete set null,
  pickup_lat      double precision not null,
  pickup_lng      double precision not null,
  pickup_address  text,
  status          text not null default 'searching'
                    check (status in ('searching', 'accepted', 'enroute', 'completed', 'cancelled', 'no_drivers')),
  created_at      timestamptz not null default now(),
  accepted_at     timestamptz,
  completed_at    timestamptz
);

create table if not exists public.ride_offers (
  id            uuid primary key default gen_random_uuid(),
  ride_id       uuid not null references public.rides (id) on delete cascade,
  driver_id     uuid not null references public.profiles (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  offered_at    timestamptz not null default now(),
  responded_at  timestamptz
);

create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  ride_id     uuid not null references public.rides (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  amount      integer not null,
  kind        text not null default 'ride_fee' check (kind in ('ride_fee', 'topup')),
  created_at  timestamptz not null default now()
);

-- =====================================================================
-- Indexes
-- =====================================================================

create index if not exists idx_driver_states_queue
  on public.driver_states (is_online, availability, queued_at);
create index if not exists idx_ride_offers_ride on public.ride_offers (ride_id);
create index if not exists idx_ride_offers_driver_status on public.ride_offers (driver_id, status);
create index if not exists idx_ride_offers_sweep on public.ride_offers (status, offered_at);
create index if not exists idx_rides_client on public.rides (client_id, created_at desc);
create index if not exists idx_rides_driver on public.rides (driver_id, status);
create index if not exists idx_transactions_user on public.transactions (user_id, created_at desc);

-- =====================================================================
-- New-user trigger: create a profile row from signup metadata.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'role', 'commuter'),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );

  -- Give every driver a default offline state row.
  if coalesce(new.raw_user_meta_data ->> 'role', 'commuter') = 'driver' then
    insert into public.driver_states (driver_id) values (new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row-Level Security
-- Trust-sensitive writes (credits, queue order, status transitions,
-- transactions) are performed by Edge Functions using the service role,
-- which BYPASSES RLS. These policies cover direct client access only.
-- =====================================================================

alter table public.profiles enable row level security;
alter table public.driver_states enable row level security;
alter table public.rides enable row level security;
alter table public.ride_offers enable row level security;
alter table public.transactions enable row level security;

-- profiles: read own row; online drivers' presence is readable for the queue/contact.
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- driver_states: a driver manages their own row (the app only flips is_online directly;
-- queued_at/availability transitions are done by functions). All authed users can read
-- presence to render the live queue.
create policy driver_states_select_all on public.driver_states
  for select to authenticated using (true);
create policy driver_states_upsert_own on public.driver_states
  for insert with check (auth.uid() = driver_id);
create policy driver_states_update_own on public.driver_states
  for update using (auth.uid() = driver_id) with check (auth.uid() = driver_id);

-- rides: visible to the client who booked it or the assigned driver.
create policy rides_select_participant on public.rides
  for select using (auth.uid() = client_id or auth.uid() = driver_id);

-- ride_offers: a driver sees offers addressed to them.
create policy ride_offers_select_own on public.ride_offers
  for select using (auth.uid() = driver_id);

-- transactions: a user sees their own ledger (writes are functions-only).
create policy transactions_select_own on public.transactions
  for select using (auth.uid() = user_id);
