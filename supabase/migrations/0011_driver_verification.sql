-- Driver verification & approval (see docs/ROADMAP.md → "Driver verification").
-- Before a driver can go online they must submit a photo of (1) their driver's
-- license and (2) their motorcycle, and be APPROVED by an admin. Reuses the
-- 0010 machinery: is_admin() + admin page + private Storage bucket + SECURITY
-- DEFINER approve/reject RPCs.
--
-- Application data lives in its OWN table (not on driver_states, which is
-- world-readable to authenticated users for the queue) so document paths and
-- rejection reasons aren't exposed to everyone.
--
-- ⚠️ After applying this, driver_go_online requires an approved application —
-- existing drivers will be blocked until approved in the admin page.

create table if not exists public.driver_applications (
  driver_id         uuid primary key references public.profiles (id) on delete cascade,
  license_path      text,                          -- object path in the private bucket
  motorcycle_path   text,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected')),
  rejection_reason  text,
  submitted_at      timestamptz not null default now(),
  reviewed_by       uuid references public.profiles (id),
  reviewed_at       timestamptz
);

create index if not exists idx_driver_applications_queue
  on public.driver_applications (status, submitted_at);

alter table public.driver_applications enable row level security;

-- A driver reads their own application; an admin reads all. Writes are RPC-only.
create policy driver_applications_select_own on public.driver_applications
  for select using (driver_id = auth.uid());
create policy driver_applications_select_admin on public.driver_applications
  for select using (public.is_admin());

-- ---------------------------------------------------------------------
-- submit_driver_application: a driver submits (or resubmits) their documents.
-- Upserts their row back to 'pending'. An already-approved driver can't
-- accidentally reset themselves.
-- ---------------------------------------------------------------------
create or replace function public.submit_driver_application(
  p_license_path text,
  p_motorcycle_path text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_existing text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role <> 'driver' then raise exception 'Only drivers submit verification documents'; end if;
  if p_license_path is null or p_motorcycle_path is null then
    raise exception 'Both a license photo and a motorcycle photo are required';
  end if;

  select status into v_existing from public.driver_applications where driver_id = v_uid;
  if v_existing = 'approved' then
    return json_build_object('result', 'already_approved');
  end if;

  insert into public.driver_applications (driver_id, license_path, motorcycle_path, status, submitted_at)
  values (v_uid, p_license_path, p_motorcycle_path, 'pending', now())
  on conflict (driver_id) do update
    set license_path     = excluded.license_path,
        motorcycle_path  = excluded.motorcycle_path,
        status           = 'pending',
        rejection_reason = null,
        submitted_at     = now(),
        reviewed_by      = null,
        reviewed_at      = null;

  return json_build_object('result', 'submitted', 'status', 'pending');
end;
$$;

grant execute on function public.submit_driver_application(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- review_driver: admin approves or rejects a driver application.
-- Admin check enforced INSIDE the function. Idempotent on a reviewed row.
-- ---------------------------------------------------------------------
create or replace function public.review_driver(
  p_driver_id uuid,
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
  v_app public.driver_applications;
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  if p_action not in ('approve', 'reject') then raise exception 'Invalid action'; end if;

  select * into v_app from public.driver_applications where driver_id = p_driver_id for update;
  if not found then raise exception 'Application not found'; end if;
  if v_app.status <> 'pending' then
    return json_build_object('result', 'already_' || v_app.status);
  end if;

  update public.driver_applications
     set status           = case when p_action = 'approve' then 'approved' else 'rejected' end,
         rejection_reason = case when p_action = 'reject' then p_reason else null end,
         reviewed_by      = v_admin,
         reviewed_at      = now()
   where driver_id = p_driver_id;

  return json_build_object('result', case when p_action = 'approve' then 'approved' else 'rejected' end);
end;
$$;

grant execute on function public.review_driver(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- Gate going online on an APPROVED application (in addition to the active
-- subscription from 0009). Redefines driver_go_online.
-- ---------------------------------------------------------------------
create or replace function public.driver_go_online()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_active_access(auth.uid()) then
    raise exception 'Your subscription has expired. Renew to go online and receive rides.';
  end if;
  if not exists (
    select 1 from public.driver_applications
    where driver_id = auth.uid() and status = 'approved'
  ) then
    raise exception 'Your driver account is pending verification. Submit your documents for admin approval first.';
  end if;
  update public.driver_states
     set is_online    = true,
         availability = 'available',
         queued_at    = now(),
         updated_at   = now()
   where driver_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Realtime: driver sees their status flip; admin sees new submissions.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='driver_applications') then
    alter publication supabase_realtime add table public.driver_applications;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Private Storage bucket for driver documents (license + motorcycle photos).
-- License images are PII — never public; admin views via short-lived signed
-- URLs. Files live under a per-driver folder ("<uid>/<file>").
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('driver-docs', 'driver-docs', false)
on conflict (id) do nothing;

drop policy if exists "driver docs: upload own" on storage.objects;
create policy "driver docs: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'driver-docs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "driver docs: read own or admin" on storage.objects;
create policy "driver docs: read own or admin" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'driver-docs'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
