# Roadmap

Status legend: ✅ done · 🔲 not started. The MVP **core loop is complete and working** end-to-end
(auth → queue → booking → dispatch → accept → chat + live location → complete). The **₱30/month subscription** model is
built (`0008`–`0010`): per-ride credits retired, access gated, manual GCash renewal + admin review in place.

> **▶ RESUME HERE (next session) — in order:**
> 1. ✅ **Verified `0011` + Storage end-to-end.** `driver-docs` bucket works, photo upload stores files under
>    `<uid>/…`, and a test driver was approved in `/admin` and could go online. `GCASH_NUMBER` + first admin set;
>    renewal loop works. The full code path (migrations `0001`–`0011`) is now confirmed working in the live project.
> 2. ✅ **Seed data + PWA install done.** Seed script written (`supabase/seed.sql` — 3 verified+online drivers + 1
>    commuter around the subdivision center; paste into the SQL Editor; `seed_cleanup.sql` to undo). PWA install
>    banner shipped (`usePwaInstall` + `InstallBanner` in the `Layout` chrome; native `beforeinstallprompt` capture +
>    iOS Share-sheet fallback; dismissal persisted). Test via a built+previewed bundle (`vite build && vite preview`)
>    — the SW isn't active under `vite dev`.
> 3. ✅ **Deployed to Vercel** (repo `jenerdev/toda`; auto-deploys on push to `main`). Web Push ride alerts, the
>    install + "new version → Reload" prompts, and the build-id stamp are all working on the live host.
> 4. **▶ NEXT: Pre-launch security.** Now that the app is deployed, the **real SMS OTP** (replacing the dummy `1234`)
>    is the headline launch blocker; plus the RLS/RPC audit, rate-limiting, and secret hygiene — including
>    **rotating the VAPID keypair + `WEBHOOK_SECRET`** generated during setup (see Security below).
>
> Everything through driver verification, web-push ride alerts, and the pickup surcharge is built (migrations `0001`–`0013`). Open items are tracked in **🔲 Remaining**.

---

## ✅ Phase 1 — Scaffold & infra
Vite + React + TS + Tailwind + React Router; `vite-plugin-pwa`; Supabase schema/indexes/RLS (`0001_init.sql`);
`src/lib/supabase.ts`, TanStack Query, `.env.example`.

## ✅ Phase 2 — Auth & profiles
**Phone number + dummy OTP (`1234`)** sign-up/login — **no email, no password** (most users have neither). The phone
maps to a synthetic email (`<digits>@motoqueue.app`) + a hidden derived password; "Confirm email" must be OFF.
Trigger creates the `profiles` row (with a **free first month** stamped on `subscription_until`, since `0009`) and a
`driver_states` row for drivers. Subscription badge + role routing.
> Changed from the original "email + password" plan at the user's request.
> _(Originally granted +100 credits; credits were retired in `0008`.)_

## ✅ Phase 3 — Driver queue
Online/offline via `driver_go_online` / `driver_go_offline` RPCs (server-time `queued_at` for correct FIFO). Live,
anonymized queue list + "you're #N" via Realtime on `driver_states` (`0002_driver_queue.sql`). Sign-out also marks a
driver offline.

## ✅ Phase 4 — Commuter booking
Leaflet + OSM map. **Pickup address and destination are free-text fields** (both shown to the driver — destination added in `0014`); the map **pins current-location
coordinates** for live tracking. Auto-pins on load if location was already granted; "use my current location" button.
> Changed from the original Nominatim search/typeahead at the user's request — geocoding removed entirely.

## ✅ Phase 5 — Dispatch & handshake
`book_ride`, `respond_offer`, `cancel_ride`, `get_counterpart`, `expire_stale_offers`, internal
`_offer_to_next_driver` (`0003_dispatch.sql`). Driver gets a realtime offer card with a 2-minute countdown
(auto-declines → next driver); commuter sees `searching → accepted`; no-driver and cancel paths handled.
> Built as **Postgres SECURITY DEFINER RPCs**, not Edge Functions (no CLI/Docker; atomic; same trust boundary).

## ✅ Phase 6 — Ride lifecycle
`complete_ride` finalizes the ride and re-queues the driver at the **end**.
> **Historical note:** Phases `0004`/`0005` originally charged a **5 + 5 credit fare on ACCEPT**. Per-ride credits
> were **retired** in `0008` when the subscription model landed — the app no longer touches fares (cash, paid to the
> driver outside the app). See the Subscriptions section below.

## ✅ Phase 7 — Chat & live driver location
In-ride **chat** (`messages` table, RLS to the two participants, realtime) shown to both sides after accept, with
**one-tap quick-reply chips** (canned Tagalog phrases — driver and commuter sets). Driver **streams GPS** while on a
trip (`update_driver_location` RPC) and the commuter sees a **live map** of the driver approaching.
> The original Phase 7 was "polish"; chat + live location were pulled in from the deferred list at the user's request.
> **Update:** the driver now sees the **pickup address + pinned map in the offer itself** (before accepting) — the
> earlier "only after accepting" gate was removed once per-ride credits went away (RLS `rides_select_offered` already
> permitted it; the change was UI-only).

---

## ✅ Done since the core loop

### Correctness gaps — ✅ **done (`0007`/`0008` + client wiring)**
- **Stale / disconnected driver.** ✅ `driver_heartbeat()` bumps `updated_at`; `_offer_to_next_driver` skips drivers
  stale > 60s; `reap_stale_drivers()` can mark them offline. **Client wired:** `useDriverHeartbeat(isOnline)` pings
  `driver_heartbeat` immediately on going online + every 25s while online — this fixed the "driver online but **no
  drivers available**" bug (a freshly-online or idle driver was dropping out of dispatch after 60s).
- **Cancel-after-accept.** ✅ `cancel_accepted_ride(ride_id)` cancels the ride and frees/re-queues the driver
  (idempotent; **no refund — no money involved** since credits were retired). **Client wired:** a "Cancel ride"
  button on the commuter's `RideStatusPanel` and a "Cancel trip" on the driver's `TripPanel`.

### Activity history — ✅ **done** (`/history`)
Per-user **Activity** page (commuter + driver + admin), linked from the top bar. Two sections: **ride/trip history**
(`useRideHistory` — terminal-status rides) and **subscription history** (`useRenewalHistory` — every renewal with
its outcome + rejection reason). Realtime; no migration (reuses existing RLS). The admin-side **review log** was
deferred (the `reviewed_by`/`reviewed_at` columns already capture it).

### Driver verification & approval — ✅ **done (`0011`)**
> A driver must submit documents and be admin-approved before they can go online. Reuses the `0010` machinery
> (`is_admin()` + admin page + private Storage bucket + SECURITY DEFINER approve/reject RPCs).
- **Submission flow.** ✅ `DriverVerificationPanel` — the driver uploads a **license photo** + a **motorcycle photo**
  to a private `driver-docs` bucket and submits; `submit_driver_application` upserts a `driver_applications` row to
  `pending` (resubmit allowed after rejection; an approved driver can't reset themselves). The driver sees their live
  status ("under review" / "rejected — reason").
- **Gate.** ✅ `driver_go_online` now requires `driver_applications.status = 'approved'` (on top of the subscription
  check). The UI hides/disables the online toggle and shows the verification panel until approved.
- **Admin review.** ✅ A **Driver verification** section on `/admin` (`useAdminDriverApplications`) lists pending
  applicants with name/phone, opens each photo via a short-lived **signed URL**, and Approve/Reject (with reason) via
  `review_driver` (admin-checked inside the RPC). Application data lives in its own table (not world-readable
  `driver_states`) so document paths + rejection reasons aren't exposed.
- 🔲 Still optional: a license-image **retention/deletion policy** (PII), and a driver-side push/notification on
  approval (today the status flips live via Realtime).
- ⚠️ **Known op note:** the `driver-docs` (and `renewal-screenshots`) Storage policies are created by SQL, but some
  Supabase projects block `create policy … on storage.objects` from the SQL Editor — if uploads 403, add the two
  policies via the Dashboard (Storage → bucket → Policies). Also: **no orphaned-file cleanup yet** — a resubmit or a
  failed RPC-after-upload leaves stray objects (folds into the retention policy above).

## 🔲 Remaining

### Polish (original Phase 7)
- ✅ **PWA install prompt + offline shell** — `usePwaInstall` captures `beforeinstallprompt` and re-triggers it from
  a dismissible `InstallBanner` in the `Layout` chrome; iOS (no native event) gets manual Share → "Add to Home
  Screen" steps; already-installed/standalone sessions show nothing. Offline shell is the vite-plugin-pwa precache
  (6 entries). Note: the SW only runs in a built bundle (`vite build && vite preview`), not under `vite dev`.
- ✅ **PWA update reliability** — `registerType: 'prompt'` with a `ReloadPrompt` (`useRegisterSW`) "new version →
  Reload" banner that **actively polls** for a new service worker (every 60s, on tab-visibility regain, and on
  regaining network) so it surfaces on its own; the Reload action reloads on the SW `controllerchange` with a 3s
  timed fallback (works even on iOS, where the library's internal reload can misfire). App-chrome overlays
  (reconnect/reload banners + the completion modal) are layered **above the Leaflet map** (z-index), and a build-id
  stamp (`__BUILD_ID__` = Vercel commit SHA) shows in the in-app footer **and on the login page** to confirm the live
  build.
- ✅ **Seed data** for a demo subdivision — `supabase/seed.sql` inserts 3 verified + online drivers and 1 commuter
  (all with active subscriptions) clustered around the `CommuterHome` `DEFAULT_CENTER` (14.5995, 120.9842); each logs
  in via the normal phone + OTP `1234` flow. Includes a liveness-refresh snippet (drivers go stale after 60s with no
  live heartbeat tab) and `supabase/seed_cleanup.sql` to remove it all via `auth.users` cascade.
- ✅ **Empty/error/loading-state pass** — shared `Spinner`/`Loading`/`EmptyState`/`ErrorState` components
  (`src/components/States.tsx`); the history/queue/active-ride hooks now expose `error`; Activity, Admin, CommuterHome,
  and DriverHome show a distinct error card (with retry) instead of a misleading empty state on a failed load.
- ✅ **Reconnect banner on realtime drop** —
  `useRealtimeStatus`/`ReconnectBanner` show a top "Reconnecting… live updates paused" bar when the Realtime socket
  drops (while channels are active) and refetch all queries on recovery.
- ✅ **Live route line** — the commuter's (`LiveTrackMap`), the driver's (`TripPanel`), and the **offer card**
  (`OfferCard`, with a one-shot GPS fix) maps draw a **red road route** to the pickup with a distance/ETA label
  (`useRoute` → `RouteMap`, via the keyless OSRM demo server). The offer card also shows an **estimated range**
  ("~450 m from you · ~2 min") so the driver can judge the pickup before accepting. Throttled (~per 100 m of driver
  movement) and **falls back to a straight line + great-circle distance** when the demo endpoint is unavailable.
  ⚠️ OSRM demo is best-effort; a keyed routing provider would be the upgrade for production.
- ✅ **Driver-proposed fare + pickup surcharge (`0013`, `0015`)** — before accepting, the driver can propose a
  **trip fare** (pickup → destination; chips ₱0/20/30/40/50 + **+10**, up to ₱1000) and, on a pickup **≥200 m** away
  (was ≥1 km in `0013`, tightened to 200 m in `0015`), a **distance surcharge** (chips +₱0/5/10/15 + **+5**, up to ₱50).
  If either is > 0 the commuter must **approve the breakdown** before the ride proceeds, else it's offered to the next
  driver. Handshake via `respond_offer(…, p_surcharge, p_fare)` → offer `awaiting_approval` + `rides.pending_*` →
  `approve_surcharge`/`reject_surcharge` (`OfferCard` selectors + `FareApprovalPanel`; `FareBreakdown` shows the
  receipt everywhere). Framed as **relay-only** — money stays **cash**, the app only records the agreed amounts
  (`rides.fare`/`rides.surcharge`). ⚠️ Fare-relay/TODA caveat in [`LEGAL.md`](LEGAL.md); the distance gate is
  client-side (server caps the amounts; commuter approval is the guard).
- ✅ **Ride-outcome confirmation** — `useRideOutcome` + `RideOutcomeToast`: a dismissible modal shown to **both** the
  commuter and the driver when a ride ends — **completed** ("Ride/Trip completed!", cash-fare reminder) **or
  cancelled** ("back in the queue" for the driver, "book another ride" for the commuter). Driven by the realtime
  `rides → completed/cancelled` transition, so whoever acted *and* the counterpart both get it. Mounted in `Layout`.
- ✅ **No-drivers "notify me"** — when a booking returns `no_drivers`, the commuter can arm a watch (`NoDriversPanel`
  + `useAvailableDrivers`, live on `driver_states`). When a driver comes online it shows an in-app "driver available
  → Book now" CTA (one-tap re-book reusing the pinned location) and fires a system notification if permission was
  granted. Works while the app is open or backgrounded-but-alive; waking a **fully-closed** app still needs the
  deferred web-push below.
- ✅ **Web-push driver ride alerts** (closed-app / locked-phone) — native VAPID Web Push. `push_subscriptions` table
  (`0012`) + `usePushNotifications`/`RideAlertsToggle` (driver opts in, subscription saved); custom SW push handlers
  (`public/push-sw.js`, imported into the generated SW via `workbox.importScripts`); `notify-driver` Edge Function
  (`supabase/functions/notify-driver`) sends the push on a **Database Webhook** for `ride_offers` INSERT. **Setup is
  manual** — see [`DEPLOYMENT.md`](DEPLOYMENT.md) → "Push notifications" (generate VAPID keys, set
  `VITE_VAPID_PUBLIC_KEY`, deploy the function + its secrets, create the webhook). ⚠️ **iOS only works for an
  installed PWA** (Add to Home Screen, iOS 16.4+) — not a Safari tab.
  ✅ **Verified working end-to-end on the deployed env** (driver receives the offer push with the app closed).
  🔒 **Pre-launch:** the VAPID keypair + `WEBHOOK_SECRET` in use were generated in a chat session — **rotate them**
  (regenerate VAPID keys, new `WEBHOOK_SECRET`) and update the function secrets / Vercel env before real launch.
- Optional: schedule the **`pg_cron`** sweeps — `expire_stale_offers()` + `reap_stale_drivers()` (snippets are in the
  `0003`/`0007` migration comments). Not required: the offer countdown + the driver heartbeat cover the live case;
  the sweeps only tidy displayed state (e.g. a closed-tab driver lingering in the queue list).

### Security & abuse prevention (harden before any real-user launch)
> The MVP trusts its own demo environment. These are the gaps that matter once it's public-facing. Most defenses
> live in **Postgres (RLS + RPC design)** and **in front of Supabase (Cloudflare/edge)**, since there's no custom
> API server to put middleware in.

- **SQL injection.** App queries go through the Supabase client (parameterized) and RPC args are typed, so the
  surface is the **SECURITY DEFINER functions** themselves. Audit every RPC: (1) pin `SET search_path = ''` (or an
  explicit schema) on each `SECURITY DEFINER` function so a hijacked `search_path` can't shadow tables/functions;
  (2) if any function builds dynamic SQL, use `format(... %I/%L ...)` / `quote_ident` / `quote_literal` — never
  string concatenation; (3) keep all user input flowing in as **typed parameters**, never interpolated.
- **Authorization / RLS audit (anti-hack core).** The anon key is *meant* to be public — **RLS is the real
  boundary**. Verify: a commuter can't read another commuter's ride/messages; a non-admin can't read others'
  profiles or `renewals`; no client can `UPDATE profiles.subscription_until`/`is_admin` or write `renewals.status`
  directly (those mutate only via SECURITY DEFINER RPCs). Add a test that hits each table with a forged JWT and
  expects denial. *(Credits/transactions are gone as of `0008`, so that surface no longer exists.)*
- **Subscription / dispatch tampering.** Re-check all access and state transitions server-side inside the RPCs
  (already the pattern — keep it): no extending your own `subscription_until`, no self-approving a renewal
  (`review_renewal` checks `is_admin()` inside), no reusing a GCash ref (UNIQUE), no accepting a ride you weren't
  offered, no self-dealing (driver == commuter), idempotent `respond_offer`/`complete_ride`/`cancel_accepted_ride`.
- **Auth hardening — dummy OTP (DEFERRED until after deploy).** `1234` accepts any phone = full account takeover, so
  this is the blocker before any **real-user** launch — but it's intentionally **deprioritized until the app is
  deployed** (to be done on the live host, e.g. Vercel; the dummy OTP is acceptable for the demo/preview until then).
  When picked up: real SMS OTP (Supabase phone auth / Twilio), rate-limit + lock-out on OTP attempts, expiring
  one-time codes, and keep "Confirm email" handling consistent with the synthetic-email scheme.
- **Secret-key exposure prevention.** Only the **anon** key belongs in the client/PWA bundle; the **`service_role`
  key must never** be in `.env` files shipped to the frontend, in the repo, or in the SW cache. Add: a `.gitignore`
  audit + a secret-scanner (e.g. gitleaks) in CI, server-side keys only in the Supabase dashboard, and key
  **rotation** if anything leaked. Document which key is which in `.env.example`.
- **API rate limiting.** Add per-user/IP limits on the abuse-prone RPCs: `book_ride` (spam booking), OTP requests,
  `messages` insert (chat flood), and `update_driver_location` (write storm). Enforce via Supabase's built-in
  auth/API rate limits + a per-user counter table or a `pg_cron`-pruned token bucket inside the RPCs.
- **DDoS / volumetric abuse.** Put **Cloudflare (or the platform edge) in front** of the app and Supabase:
  WAF + bot-fight + network-layer DDoS protection, caching of the static PWA shell, and challenge/turnstile on the
  auth + booking endpoints. Set Supabase connection/statement limits so one client can't exhaust the pool.
- **Transport & headers.** Enforce HTTPS-only, HSTS, a tight CSP, and sensible CORS on the Supabase project so the
  API only answers the app's origin.

### Subscriptions & monetization (the revenue model) — ✅ **built (`0008`–`0010`)**
> Full detail in [`MONETIZATION.md`](../docs/MONETIZATION.md); legal framing in [`LEGAL.md`](../docs/LEGAL.md).
> **Model:** flat **₱30/month ("₱1/day")** subscription for **both** drivers and commuters; **first month free** for
> both. The subscription **gates access** (commuter can book; driver can go online) — it is **not** a ride fare and
> **not** a wallet to pay drivers. Fares are cash, paid to the driver outside the app. Keep the balance **closed-loop**
> (redeemable only for app access, non-transferable, non-cashable) to stay clear of BSP e-money regulation.

- **Per-ride credits RETIRED (decision made).** Chose **Option 1**: access is purely time-based via
  `subscription_until`. `0008` drops the `credits` column + the `transactions` table and removes the 5+5
  deduction/refund; the credit badge is replaced by a subscription badge. Fares are cash, outside the app.
- **Subscription state + access gating.** ✅ `0009`: `profiles.subscription_until`; **first month free** stamped in
  `handle_new_user`; `has_active_access()` helper with a **3-day grace**; `book_ride` (commuter) and
  `driver_go_online` (driver) both gated.
- **Manual GCash renewal flow.** ✅ `0010` + `RenewPanel`: shows the business GCash number + ₱30; user pays, enters the
  **GCash reference** (optional screenshot → private `renewal-screenshots` bucket), `submit_renewal` creates a
  `pending` `renewals` row. **Refs are UNIQUE** (auto-rejected duplicates); rejected users can resubmit.
  ⚠️ **Before launch:** set the real Business GCash number in `src/lib/subscription.ts` (`GCASH_NUMBER`).
- **Admin review queue.** ✅ `0010` + `/admin` page: `is_admin` flag + `is_admin()` helper; lists pending renewals with
  name/phone/ref/screenshot (short-lived signed URL); `review_renewal` (SECURITY DEFINER, admin-checked inside)
  approves (extends a month, stacking) or rejects (with reason). Bootstrap the first admin by hand:
  `update profiles set is_admin = true where phone = '…'`. 🔲 Still open: an explicit **approval notification** (today
  the user just sees the live status flip via Realtime) and the **24h SLA** copy.
- **Consumer terms (DTI).** 🔲 Short ToS: what the subscription buys, refunds, expiry, no-driver-available handling.
- **Later (when manual review stops scaling):** automate collection via **GCash API / a payment gateway**.

### Deferred "v2" (from `MVP_SCOPE.md`)
- **Multiple zones / subdivisions** (geofencing + per-zone queues) — also the **growth lever** for monetization.
- **Ratings & reviews.**
- **Native iOS/Android apps.**
- **Supplementary revenue** if the subscription underperforms: **local merchant ads**, **HOA-funded amenity** (see
  MONETIZATION → "Alternatives considered").

### Housekeeping
- Bundle-size warning (Leaflet is heavy) — optional code-splitting of the map.
- **Realtime channel naming.** Each `use*` Realtime hook names its channel by a fixed topic (e.g. `driver_app_<uid>`).
  Mounting the same hook twice at once collides ("cannot add `postgres_changes` callbacks after `subscribe()`") — this
  bit the driver page (`useMyDriverApplication` ran in both `DriverHome` and `DriverVerificationPanel`); fixed by
  lifting the hook to the parent and passing data down. Optional hardening: make each channel topic unique per instance
  (via `useId`) so the collision is impossible regardless of how a hook is reused.

---

## Migrations (apply in order in the Supabase SQL Editor)

| File | Adds |
|------|------|
| `0001_init.sql` | Tables, indexes, RLS, new-user trigger |
| `0002_driver_queue.sql` | Online/offline RPCs; Realtime on `driver_states` |
| `0003_dispatch.sql` | `book_ride`/`respond_offer`/`cancel_ride`/`get_counterpart`/sweep; Realtime on `rides`, `ride_offers` |
| `0004_lifecycle_credits.sql` | `complete_ride`; credit guards; Realtime on `profiles` |
| `0005_charge_on_accept.sql` | Move fare deduction to accept; slim `complete_ride` |
| `0006_chat_and_location.sql` | `messages` table + RLS; `update_driver_location`; Realtime on `messages` |
| `0007_correctness_gaps.sql` | `driver_heartbeat`; stale-driver exclusion in `_offer_to_next_driver` + `reap_stale_drivers`; `cancel_accepted_ride` (refund both sides); `transactions.kind` adds `refund` |
| `0008_retire_credits.sql` | **Drops** `profiles.credits` + the `transactions` table; removes credit checks/charge/refund from `book_ride`/`_offer_to_next_driver`/`respond_offer`/`cancel_accepted_ride` |
| `0009_subscriptions.sql` | `profiles.subscription_until`; first-month-free in `handle_new_user`; `has_active_access()` (3-day grace); gates `book_ride` + `driver_go_online` |
| `0010_renewals_admin.sql` | `profiles.is_admin` + `is_admin()`; `renewals` table (unique GCash ref) + RLS; `submit_renewal`/`review_renewal`; private `renewal-screenshots` Storage bucket |
| `0011_driver_verification.sql` | `driver_applications` table + RLS; `submit_driver_application`/`review_driver`; `driver_go_online` gated on `approved`; private `driver-docs` Storage bucket |
| `0012_push_subscriptions.sql` | `push_subscriptions` table + RLS (user manages own); read by the `notify-driver` Edge Function (service role) to send driver ride-offer Web Push on `ride_offers` insert |
| `0013_pickup_surcharge.sql` | `rides.surcharge`/`pending_surcharge`/`pending_driver_id` + `ride_offers` `awaiting_approval` status; `respond_offer` takes a surcharge; new `approve_surcharge`/`reject_surcharge`; dispatch skips drivers holding a pending/awaiting offer |
| `0014_destination.sql` | `rides.destination` (free text); `book_ride` takes `p_destination` (required, non-empty) and the old 3-arg signature is dropped; shown to the driver in the offer/trip |
| `0015_trip_fare.sql` | `rides.fare`/`pending_fare`; `respond_offer` takes `p_fare` (drops the 3-arg version); `approve_surcharge`/`reject_surcharge`/`cancel_ride` handle the fare alongside the surcharge; surcharge gate tightened 1 km → 200 m (client-side) |
| `0016_offer_timeout.sql` | Rider-pickup time limit 30 s → **2 min**: `expire_stale_offers` sweep interval bumped to match the client `OFFER_TIMEOUT_SECONDS` (120) |

---

## Verification matrix

| Path | Expected |
|------|----------|
| Happy path | offer → accept → live map + chat → complete (**no credits touched**); driver re-queued at end |
| Decline | first driver declines → second driver offered |
| Timeout | offered driver idle 2 min → offer expires → next driver offered |
| No drivers | book with none online → ride = `no_drivers` |
| Pickup shown up-front | driver sees pickup **address + pinned map in the offer**, before accepting (changed: no longer gated behind accept) |
| Sign-out | driver signs out → leaves the queue |
| Stale driver (`0007`) | driver closes tab → after 60s no heartbeat, **not offered** new rides; `reap_stale_drivers` drops them from the queue list |
| Cancel after accept (`0008`) | either party cancels an accepted ride → ride `cancelled`, driver freed/re-queued (**no refund — no money involved**); second tap is a no-op |
| Subscription gate (`0009`) | expired commuter → `book_ride` blocked + Renew panel; expired driver → `driver_go_online` blocked; new account gets 1 month free + 3-day grace after expiry |
| Renewal flow (`0010`) | user submits GCash ref → `pending`; **duplicate ref rejected**; admin Approve → `subscription_until` +1 month (live); Reject → reason shown, user can resubmit |
| Driver verification (`0011`) | unapproved driver → online toggle hidden + `driver_go_online` blocked; submit license + motorcycle photos → `pending`; admin Approve (photos via signed URL) → driver can go online; Reject → reason shown, can resubmit |
