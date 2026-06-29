-- Renewals + admin review (manual GCash flow, see docs/MONETIZATION.md).
-- A user pays ₱30 via GCash on their own, submits the reference number (+ an
-- optional screenshot), and an admin cross-checks it against the GCash history
-- and approves (extends subscription_until by a month) or rejects (with reason).
--
-- Admin = a flag on profiles. There's no UI to grant it; bootstrap the first
-- admin by hand in the SQL editor:
--     update public.profiles set is_admin = true where phone = '<your phone>';

-- =====================================================================
-- Admin flag + helper.
-- =====================================================================
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

-- is_admin(): is the CURRENT user an admin? SECURITY DEFINER so reading
-- profiles here bypasses RLS — which is what lets us safely reference it
-- inside a profiles RLS policy without infinite recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

-- Admins can read every profile (to show name/phone/expiry in the queue).
-- Commuters/drivers still only see their own row (policy from 0001).
drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select using (public.is_admin());

-- =====================================================================
-- Renewals.
-- =====================================================================
create table if not exists public.renewals (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  gcash_ref         text not null unique,          -- UNIQUE: a ref can't be reused/shared
  screenshot_path   text,                          -- optional; object path in the private bucket
  amount            integer not null default 30,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz
);

create index if not exists idx_renewals_queue on public.renewals (status, created_at);
create index if not exists idx_renewals_user on public.renewals (user_id, created_at desc);

alter table public.renewals enable row level security;

-- A user reads their own renewals; an admin reads all. Writes are RPC-only
-- (no insert/update policy → direct client writes are denied; the SECURITY
-- DEFINER functions below are the single path that mutates renewals).
create policy renewals_select_own on public.renewals
  for select using (user_id = auth.uid());
create policy renewals_select_admin on public.renewals
  for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- submit_renewal: user submits a paid GCash reference (+ optional screenshot).
-- Blocks duplicate refs (friendly message; the UNIQUE constraint is the hard
-- guarantee) and a second pending submission. A rejected user can resubmit.
-- ---------------------------------------------------------------------
create or replace function public.submit_renewal(
  p_ref text,
  p_screenshot_path text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ref text := upper(trim(p_ref));
  v_id  uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_ref is null or length(v_ref) < 4 then
    raise exception 'Enter a valid GCash reference number';
  end if;

  if exists (select 1 from public.renewals where user_id = v_uid and status = 'pending') then
    raise exception 'You already have a renewal under review.';
  end if;
  if exists (select 1 from public.renewals where gcash_ref = v_ref) then
    raise exception 'That GCash reference number has already been submitted.';
  end if;

  insert into public.renewals (user_id, gcash_ref, screenshot_path)
  values (v_uid, v_ref, p_screenshot_path)
  returning id into v_id;

  return json_build_object('result', 'submitted', 'renewal_id', v_id, 'status', 'pending');
exception
  when unique_violation then
    -- Race: someone submitted the same ref between the check and the insert.
    raise exception 'That GCash reference number has already been submitted.';
end;
$$;

grant execute on function public.submit_renewal(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- review_renewal: admin approves (extend a month) or rejects (with reason).
-- Admin check is enforced INSIDE the function, not just in the UI.
-- Approve stacks onto remaining time (greatest(now, current expiry) + 1 month)
-- so renewing early never loses days. Idempotent on an already-reviewed row.
-- ---------------------------------------------------------------------
create or replace function public.review_renewal(
  p_renewal_id uuid,
  p_action text,
  p_reason text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
  v_renewal public.renewals;
  v_new_until timestamptz;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Invalid action'; end if;

  select * into v_renewal from public.renewals where id = p_renewal_id for update;
  if not found then raise exception 'Renewal not found'; end if;
  if v_renewal.status <> 'pending' then
    return json_build_object('result', 'already_' || v_renewal.status);
  end if;

  if p_action = 'approve' then
    update public.profiles
       set subscription_until = greatest(coalesce(subscription_until, now()), now())
                                + interval '1 month'
     where id = v_renewal.user_id
     returning subscription_until into v_new_until;

    update public.renewals
       set status = 'approved', reviewed_by = v_admin, reviewed_at = now()
     where id = p_renewal_id;

    return json_build_object('result', 'approved', 'subscription_until', v_new_until);
  else
    update public.renewals
       set status = 'rejected', rejection_reason = p_reason,
           reviewed_by = v_admin, reviewed_at = now()
     where id = p_renewal_id;

    return json_build_object('result', 'rejected');
  end if;
end;
$$;

grant execute on function public.review_renewal(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime on renewals: the user sees their status flip live; an admin sees
-- new submissions arrive. (profiles is already published, so subscription_until
-- updates reach the user too.)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='renewals') then
    alter publication supabase_realtime add table public.renewals;
  end if;
end $$;

-- =====================================================================
-- Private Storage bucket for renewal screenshots (PII-ish payment proof).
-- Never public; the admin views via short-lived signed URLs. Files live under
-- a per-user folder ("<uid>/<file>") so the path itself scopes ownership.
-- =====================================================================
insert into storage.buckets (id, name, public)
values ('renewal-screenshots', 'renewal-screenshots', false)
on conflict (id) do nothing;

drop policy if exists "renewal screenshots: upload own" on storage.objects;
create policy "renewal screenshots: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'renewal-screenshots'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "renewal screenshots: read own or admin" on storage.objects;
create policy "renewal screenshots: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'renewal-screenshots'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
