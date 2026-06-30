# Data Model

PostgreSQL (via Supabase). All app tables live in the `public` schema and reference `auth.users` for identity.

## Entity-relationship overview

```
auth.users 1───1 profiles
profiles   1───0..1 driver_states      (only for role='driver')
profiles   1───0..1 driver_locations   (private live GPS; only for role='driver')
profiles   1───*  rides (as client_id)
profiles   0..1─* rides (as driver_id)
rides      1───*  ride_offers
profiles   1───*  ride_offers (as driver_id)
rides      1───*  messages
profiles   1───*  renewals (as user_id)
profiles   1───1  driver_applications (as driver_id)
profiles   1───*  push_subscriptions (as user_id)
```

> **Removed in `0008`:** the per-ride **credit** system. `profiles.credits` and the entire `transactions` ledger were
> dropped when the flat ₱30/month subscription replaced per-ride charging (the app no longer touches fares). See
> [`MONETIZATION.md`](MONETIZATION.md).

## Tables

### `profiles`
One row per user, created on signup (via trigger on `auth.users`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | = `auth.users.id` |
| `role` | `text` | `'commuter'` \| `'driver'` |
| `full_name` | `text` | |
| `phone` | `text` | shared with the matched party |
| `subscription_until` | `timestamptz` null | access valid while `now() <= subscription_until + 3-day grace`; null/expired blocks `book_ride` (commuter) and `driver_go_online` (driver). First month stamped free at signup. (`0009`) |
| `is_admin` | `bool` | default `false`; gates the `/admin` review page + `review_renewal` RPC. Checked server-side via the `is_admin()` helper. (`0010`) |
| `active_session_id` | `text` null | the device id holding this account's **single active session**; set by `claim_session` on login. Other devices watch this over Realtime and sign out on a mismatch (`0020`). |
| `created_at` | `timestamptz` | default `now()` |

> **`credits` was dropped in `0008`** (per-ride credits retired for the subscription model).

### `driver_states`
Live state for drivers; drives the queue.

| Column | Type | Notes |
|--------|------|-------|
| `driver_id` | `uuid` PK | FK → `profiles.id` |
| `is_online` | `bool` | default `false` |
| `availability` | `text` | `'available'` \| `'on_trip'` \| `'offline'` |
| `queued_at` | `timestamptz` | **FIFO key**; set to `now()` on go-online and on re-queue |
| `updated_at` | `timestamptz` | **liveness/heartbeat key** — bumped on go-online, location updates, and the `driver_heartbeat()` ping. Dispatch ignores drivers stale > 60s (`0007`). |

> **Live location** moved out of `driver_states` into the separate
> `driver_locations` table (`0027`) — see below. `driver_states` is broadly
> readable (the queue needs it), so GPS can't live here without leaking.

**Queue query** (next driver to offer):
```sql
select driver_id from driver_states
where is_online = true and availability = 'available'
  and driver_id <> all (:already_offered_driver_ids)
  and updated_at >= now() - interval '60 seconds'   -- liveness filter (0007/0008)
order by queued_at asc
limit 1;
```

### `driver_locations` _(private live GPS — `0027`)_
One row per driver (PK = `driver_id`). Split out of `driver_states` so a driver's
live coordinates aren't exposed to every authenticated user. While on a trip the
driver streams GPS via `update_driver_location` (which also bumps
`driver_states.updated_at` for liveness); the matched commuter reads/subscribes to
this row to render the moving marker.

| Column | Type | Notes |
|--------|------|-------|
| `driver_id` | `uuid` PK | FK → `profiles.id` (on delete cascade) |
| `lat` | `double precision` null | latest latitude |
| `lng` | `double precision` null | latest longitude |
| `updated_at` | `timestamptz` | default `now()`; bumped on each fix |

> **Participant-scoped RLS:** readable only by the driver themselves, or the
> commuter on that driver's **active** (`accepted`/`enroute`) ride — over direct
> query *and* Realtime. No client writes (only the `update_driver_location` RPC).

### `rides`
One row per booking request.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `client_id` | `uuid` | FK → `profiles.id` |
| `driver_id` | `uuid` null | set when accepted |
| `pickup_lat` | `double precision` | |
| `pickup_lng` | `double precision` | |
| `pickup_address` | `text` | **free text typed by the commuter** (no geocoding); shown to an offered driver up-front |
| `destination` | `text` null | **free text typed by the commuter** (no geocoding); where they're going, shown to the driver up-front so they know the trip. Required for new bookings (UI + `book_ride` enforce non-empty); nullable for pre-`0014` rows. |
| `status` | `text` | `searching` \| `accepted` \| `enroute` \| `completed` \| `cancelled` \| `no_drivers` |
| `created_at` | `timestamptz` | |
| `accepted_at` | `timestamptz` null | |
| `completed_at` | `timestamptz` null | |
| `cancellation_reason` | `text` null | reason given when an **accepted** ride was cancelled (driver or commuter); shown to the other party (`0019`) |
| `fare` | `int` | agreed all-in **trip fare** (₱), 0 unless the driver proposed one and the commuter approved (`0015`). Cash — the app only records it. The current UI proposes only this single fare. |
| `surcharge` | `int` | agreed **pickup surcharge** (₱) — **retired from the UI** (the driver now folds pickup distance into the single `fare`). Kept for already-agreed rides; new requests are always 0. The RPCs still accept it (`0013`). |
| `pending_fare` | `int` null | transient: trip fare a driver is proposing, awaiting the commuter's approval (cleared on approve/reject/cancel) (`0015`) |
| `pending_surcharge` | `int` null | transient surcharge (retired from UI; always 0 now) — cleared on approve/reject/cancel |
| `pending_driver_id` | `uuid` null | transient: the driver holding the ride while the fare/surcharge is pending |

### `ride_offers`
The dispatch sequence — one row per (ride, driver) offer.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `ride_id` | `uuid` | FK → `rides.id` |
| `driver_id` | `uuid` | FK → `profiles.id` |
| `status` | `text` | `pending` \| `accepted` \| `declined` \| `expired` \| `awaiting_approval` (held while the commuter decides on a proposed fare/surcharge, `0013`/`0015`) |
| `offered_at` | `timestamptz` | default `now()` (timeout sweep + `nudge_ride_dispatch` use this) |
| `responded_at` | `timestamptz` null | |
| `decline_reason` | `text` null | reason the commuter gave when declining a proposed fare (e.g. "Requested fare is too high"); relayed to the driver (`0018`) |
| `timed_out` | `bool` | default `false`; set true only when the offer expired because the driver never responded (the genuine "missed" case — vs. ride-taken/cancel expiries). Drives the admin **Missed** report (`0021`). |
| `fare_rejected` | `bool` | default `false`; set true only when the commuter rejected this offer's proposed fare (vs. a plain driver decline). Drives the admin **Fare declines** report (`0021`). |

### `messages`
In-ride chat between the two participants.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `ride_id` | `uuid` | FK → `rides.id` |
| `sender_id` | `uuid` | FK → `profiles.id` |
| `body` | `text` | 1–1000 chars |
| `created_at` | `timestamptz` | |

> **Live driver location** lives in `driver_locations` (`0027`): while on a trip the driver streams GPS via the
> `update_driver_location` RPC, and the commuter reads/subscribes to that row (Realtime) to render the moving marker.
> Participant-scoped RLS keeps a driver's coordinates visible only to that driver and the commuter on their active ride.

### `renewals` _(subscription billing — `0010`; see [`MONETIZATION.md`](MONETIZATION.md))_
One row per manual GCash renewal submission, reviewed by an admin.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | |
| `user_id` | `uuid` | FK → `profiles.id` (who is renewing) |
| `gcash_ref` | `text` **UNIQUE** | the reference number; uniqueness blocks reuse/sharing — duplicates auto-rejected |
| `screenshot_path` | `text` null | optional proof, object path in the **private** `renewal-screenshots` bucket (signed URLs only) |
| `amount` | `int` | default **30** (₱) |
| `status` | `text` | `pending` \| `approved` \| `rejected` (default `pending`) |
| `rejection_reason` | `text` null | shown to the user on reject (for resubmit) |
| `reviewed_by` | `uuid` null | FK → `profiles.id` (the admin) |
| `reviewed_at` | `timestamptz` null | |
| `created_at` | `timestamptz` | default `now()` |

> On **approve**, `review_renewal` extends `profiles.subscription_until` by one month, stacking onto remaining time
> (`greatest(now(), subscription_until) + 1 month`) so renewing early never loses days — the new expiry lives on
> `profiles`, not on the renewal row.

### `driver_applications` _(driver verification — `0011`)_
One row per driver (PK = `driver_id`). A driver must be `approved` here before `driver_go_online` will let them on.
Kept separate from the world-readable `driver_states` so document paths + rejection reasons aren't exposed.

| Column | Type | Notes |
|--------|------|-------|
| `driver_id` | `uuid` PK | FK → `profiles.id` |
| `license_path` | `text` null | object path in the **private** `driver-docs` bucket (signed URLs only) |
| `motorcycle_path` | `text` null | object path in the same private bucket |
| `status` | `text` | `pending` \| `approved` \| `rejected` (default `pending`) |
| `rejection_reason` | `text` null | shown to the driver on reject (for resubmit) |
| `submitted_at` | `timestamptz` | default `now()`; reset on resubmit |
| `reviewed_by` | `uuid` null | FK → `profiles.id` (the admin) |
| `reviewed_at` | `timestamptz` null | |

> `submit_driver_application` upserts the row back to `pending` (resubmit allowed after rejection; an `approved`
> driver can't reset themselves). `review_driver` (admin-check inside) flips to `approved`/`rejected`. License images
> are PII — the bucket is private with signed-URL reads; a retention/deletion policy is still TODO.

### `push_subscriptions` _(driver ride-offer Web Push — `0012`)_
One row per browser/device that opted into Web Push notifications. A driver may have several (one per device). The
`notify-driver` Edge Function reads these (via the service role) and sends a push when a `ride_offers` row is inserted
for that driver, so an offer reaches them even when the app is closed / phone is locked.

| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PK | default `gen_random_uuid()` |
| `user_id` | `uuid` | FK → `profiles.id` (on delete cascade) — the subscriber |
| `endpoint` | `text` **UNIQUE** | the push service URL for this device; uniqueness lets the client upsert on re-subscribe |
| `p256dh` | `text` | client public key used to encrypt the push payload |
| `auth` | `text` | client auth secret used to encrypt the push payload |
| `created_at` | `timestamptz` | default `now()` |

> The client subscribes via `usePushNotifications` (after permission) and upserts its subscription by `endpoint`.
> Dead endpoints (HTTP 404/410 on send) are pruned by the `notify-driver` Edge Function. iOS requires an **installed
> PWA** (Add to Home Screen, iOS 16.4+) for Web Push.

## Indexes

```sql
create index on driver_states (is_online, availability, queued_at);  -- queue lookup
create index on ride_offers (ride_id);
create index on ride_offers (driver_id, status);                     -- "my pending offers"
create index on ride_offers (status, offered_at);                    -- timeout sweep
create index on ride_offers (offered_at);                            -- admin_ride_stats time window (0023)
create index on rides (client_id, created_at desc);
create index on rides (driver_id, status);
create index on rides (created_at);                  -- admin_ride_stats time window (0023)
create unique index on renewals (gcash_ref);         -- block reference-number reuse
create index on renewals (status, created_at);       -- admin pending-review queue
create index on renewals (user_id, created_at desc); -- a user's renewal history (0023)
create index on driver_applications (status, submitted_at); -- admin pending-verification queue
create unique index on push_subscriptions (endpoint);       -- one row per device; upsert on re-subscribe
create index on push_subscriptions (user_id);               -- a driver's devices (lookup when sending)
```

## Row-Level Security (summary)

RLS is **enabled on every table**. Policies (enforced by `auth.uid()`):

| Table | Read | Write (client) |
|-------|------|----------------|
| `profiles` | own row (and limited fields of a matched counterpart); **admins** read all | **only `full_name` of your own row** (`0026` column grant); every other column — `subscription_until`, `is_admin`, `active_session_id`, `role` — is functions-only |
| `driver_states` | online drivers' presence (`is_online`/`availability`/`queued_at`) visible for the queue | **none directly** (`0026`) — go-online/offline, queue order, heartbeat all via functions |
| `driver_locations` | the driver, or the commuter on that driver's **active** ride (`0027`) | **none directly** — only `update_driver_location` |
| `rides` | own ride (`client_id = uid`), assigned (`driver_id = uid`), or **offered** (a driver with a `ride_offers` row — to see the pickup up-front) | **none directly** (`0026`) — INSERT via `book_ride`, status changes via functions |
| `ride_offers` | offers addressed to me (`driver_id = uid`) | none directly — responses go through `respond_offer` |
| `messages` | ride participants only | INSERT as self, ride participants only (direct, no trust concern) |
| `renewals` | own rows; **admins** read all | **none directly** — INSERT via `submit_renewal` (`status='pending'`); `status`/expiry set **only** by `review_renewal` (admin-check inside the function) |
| `driver_applications` | own row; **admins** read all | **none directly** — upsert via `submit_driver_application` (`status='pending'`); `status` set **only** by `review_driver` (admin-check inside the function) |
| `push_subscriptions` | own rows (`user_id = uid`) | own rows (`user_id = uid`) — insert/update/delete directly (client manages its own device subscriptions). The `notify-driver` Edge Function reads any driver's rows via the **service role**. |

**Trusted writes** (`subscription_until`, `is_admin`, queue ordering, ride status transitions, renewal status) happen
exclusively in **Postgres `SECURITY DEFINER` functions** — `book_ride`, `respond_offer` (takes an optional trip fare
+ pickup surcharge), `approve_surcharge`/`reject_surcharge` (commuter decides on the proposed fare; reject takes an optional reason),
`cancel_ride`, `cancel_accepted_ride` (takes an optional cancel reason), `complete_ride`, `get_counterpart`,
`expire_stale_offers`, `nudge_ride_dispatch` (re-dispatch a ride whose offered driver went stale / timed out — `0024`),
`_offer_to_next_driver`,
`submit_renewal`, `review_renewal`, `submit_driver_application`, `review_driver`, `claim_session`, the
`has_active_access()`/`is_admin()` helpers, plus `driver_go_online`/`driver_go_offline`, `driver_heartbeat`,
`reap_stale_drivers`, and `update_driver_location` (each acting on the caller's own row). They run as the owner and so bypass RLS. This is the security boundary: the client
can ask via RPC, but only these vetted functions change access or decide who's next. Chat `messages` are inserted
directly by the client (constrained by RLS to ride participants) — no trust concern. Renewal screenshots and driver
documents sit in **private** Storage buckets (`renewal-screenshots`, `driver-docs`), uploaded under a per-user folder
and read only by the owner or an admin via short-lived **signed URLs**.

> **Hardening (`0025`/`0026`).** Because the anon key is public, the boundary is enforced at the privilege layer too,
> not just by RLS: direct `INSERT/UPDATE/DELETE` is **revoked** from `anon`/`authenticated` on every RPC-managed table,
> so the SECURITY DEFINER functions are the *only* write path (the lone client-writable exceptions are `messages`
> INSERT, `push_subscriptions`, and the `profiles.full_name` column). `CREATE` on schema `public` is revoked from the
> client roles (no object-shadowing of a function's `search_path`), and every SECURITY DEFINER function pins an
> explicit `search_path`. Forged-JWT denial checks live in `supabase/tests/rls_audit.sql`; `supabase/tests/schema_check.sql`
> reports which migrations a live DB has applied.

## Triggers / jobs

- **On `auth.users` insert** (`handle_new_user`) → create a `profiles` row (role from signup metadata) with
  `subscription_until = now() + 1 month` (**first month free**), and a `driver_states` row for drivers.
- **Client-driven re-dispatch** (`nudge_ride_dispatch`, `0024`) → while a commuter is on "Finding you a driver…",
  `useDispatchNudge` polls this RPC (~10s). It expires a `pending` offer whose driver went stale (closed browser) or
  passed the 2-minute timeout and advances to the next driver / `no_drivers`. This makes progress independent of the
  `pg_cron` sweep below — the waiting rider drives it.
- **`pg_cron` sweeps** _(optional — snippets in `0003`/`0007`)_ → `expire_stale_offers()` (expire `pending` offers
  past the timeout, then advance to the next driver / `no_drivers`) and `reap_stale_drivers()` (mark drivers stale
  > 60s offline). Neither is required: the offer countdown, the client `driver_heartbeat`, and `nudge_ride_dispatch`
  cover the live path; the sweeps only tidy displayed state.
- **Database Webhook on `ride_offers` insert** (`0012`) → calls the `notify-driver` Edge Function, which looks up the
  offered driver's `push_subscriptions` and sends a Web Push so the offer reaches them even when the app is closed.
  Setup (VAPID keys, function secrets, webhook) is documented in [`DEPLOYMENT.md`](DEPLOYMENT.md).
