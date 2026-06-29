# Architecture

> **Scope reminder:** MotoQueue is a **dispatch-only** app for franchised tricycles — it connects commuter ↔ driver
> and nothing more. It does **not** process **fares** (cash, paid to the driver outside the app) or **destinations**.
> Revenue comes from a flat **₱30/month subscription** (see [`MONETIZATION.md`](MONETIZATION.md)), not from rides.
> Regulatory framing: [`LEGAL.md`](LEGAL.md).

## System overview

```
        ┌──────────────────────────┐         ┌──────────────────────────┐
        │   Commuter PWA (React)   │         │    Driver PWA (React)    │
        │  map · booking · status  │         │  online toggle · offers  │
        └────────────┬─────────────┘         └─────────────┬────────────┘
                     │  HTTPS + WebSocket (Supabase JS)     │
                     └───────────────┬──────────────────────┘
                                     ▼
                ┌─────────────────────────────────────────────┐
                │                  Supabase                    │
                │                                              │
                │  Auth  ──  Postgres (RLS)  ──  Realtime      │
                │                  ▲                           │
                │                  │ rpc()                     │
                │        ┌─────────┴───────────────┐           │
                │        │ SECURITY DEFINER funcs   │          │
                │        │ book_ride · respond_offer│          │
                │        │ complete_ride · cancel…  │          │
                │        │ get_counterpart · sweep  │          │
                │        └──────────────────────────┘          │
                └─────────────────────────────────────────────┘

   External: OpenStreetMap tiles (called from the client). No geocoding service.
```

**Principle:** the client renders and reads; anything that touches **access (subscriptions/renewals)** or **queue
fairness** goes through a **Postgres `SECURITY DEFINER` function** (called via `supabase.rpc()`), which runs as the
table owner after checking `auth.uid()`. Clients never extend their own `subscription_until`, approve their own
renewal, or pick the next driver directly — RLS forbids it. (The app never touches **fares** — those are cash, paid
to the driver outside the app.)

## Component responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Commuter PWA** | Type pickup address + pin current location, call `book_ride` (gated on an active subscription), watch the ride live, see the driver's live location + chat after accept, call `complete_ride` / `cancel_accepted_ride`. Renew via `RenewPanel` when access lapses. |
| **Driver PWA** | Toggle online (join/leave queue; gated on an active subscription), heartbeat while online, receive offers **with the pickup address + map up-front**, Accept/Decline (`respond_offer`), chat + stream GPS while on a trip, `complete_ride` / `cancel_accepted_ride`. |
| **Supabase Auth** | Identity (phone → synthetic email); `auth.uid()` powers RLS. |
| **Postgres + RLS** | Source of truth. Users see only rows they're entitled to. |
| **Supabase Storage** | Private `renewal-screenshots` bucket (per-user folders); the admin views proof via short-lived **signed URLs**. |
| **Realtime** | Pushes offers to drivers, ride status to commuters, queue + driver location to both, chat messages, and renewal-status changes. |
| **SECURITY DEFINER functions** | Trusted dispatch, queue ordering, subscription gating, and renewal review (`submit_renewal`/`review_renewal`). |

## The queue

The queue is **implicit**, not a separate ordered table. A driver is "in the queue" when:

```
driver_states.is_online = true AND availability = 'available'
```

Order is **FIFO by `queued_at` ascending**. Mutations:

- **Go online** → `is_online=true`, `availability='available'`, `queued_at = now()` → joins the back. *(Rejected if
  the driver's subscription is expired — see access gating.)*
- **Offered a ride** → still `available` until they respond (offers don't remove them from order, so a decline keeps
  their place).
- **Accept** → `availability='on_trip'` → effectively leaves the queue.
- **Complete** → `availability='available'`, **`queued_at = now()`** → re-joins at the **back** (fairness rule).
- **Cancel-after-accept** → same re-queue (the driver is freed back to `available`).
- **Go offline** → `availability='offline'`.

> **Dispatch eligibility (liveness).** `_offer_to_next_driver` only offers to drivers whose `updated_at` is within the
> last **60s**, so a closed/disconnected tab stops getting offers. A live client keeps itself fresh via the
> `driver_heartbeat()` RPC (the client pings it on going online + every 25s). `reap_stale_drivers()` can mark stale
> drivers offline for the queue *display*; it's optional (pg_cron) — dispatch is already correct via the 60s filter.

> **Implementation note (Phase 5).** The dispatch logic was built as **Postgres `SECURITY DEFINER`
> functions (RPC)** — `book_ride`, `respond_offer`, `cancel_ride`, `cancel_accepted_ride`, `get_counterpart`,
> `expire_stale_offers`, and the internal `_offer_to_next_driver` — rather than Edge Functions. Same trust boundary
> (`security definer` + `auth.uid()` checks; RLS still blocks direct table writes), but no CLI/Docker to deploy,
> atomic transactions, and the timeout sweep reuses the same dispatch routine. Edge Functions remain a valid
> alternative if logic later needs to call external services. The flow below is unchanged; "Edge Function" = these RPCs.

## Dispatch flow (the heart of the app)

```mermaid
sequenceDiagram
    participant C as Commuter
    participant EF as RPC (SECURITY DEFINER)
    participant DB as Postgres
    participant D1 as Driver #1 (front of queue)
    participant D2 as Driver #2 (next)

    C->>EF: book_ride(pickup)
    EF->>DB: check commuter has_active_access()  (subscription gate)
    EF->>DB: INSERT rides (status='searching')
    EF->>DB: pick first available driver (online, available, fresh < 60s) -> INSERT ride_offers (pending) for D1
    DB-->>D1: Realtime: new pending offer (incl. pickup address + map, shown up-front)
    Note over D1: 20-30s countdown

    alt D1 accepts
        D1->>EF: respond_offer(accept)
        EF->>DB: ride.status='accepted', driver_id=D1, D1 availability='on_trip'
        DB-->>C: Realtime: status='accepted' (driver on the way)
    else D1 declines or times out
        D1->>EF: respond_offer(decline)  (or pg_cron expiry sweep)
        EF->>DB: offer='declined'/'expired'
        EF->>DB: pick NEXT available driver -> INSERT ride_offers (pending) for D2
        DB-->>D2: Realtime: new pending offer
    end

    Note over C,D1: ...ride happens (fare paid in cash, outside the app)...
    C->>EF: complete_ride(ride_id)   %% or cancel_accepted_ride to abort
    EF->>DB: ride.status='completed'
    EF->>DB: D1 availability='available', queued_at=now()  (re-queue at end)
    DB-->>C: Realtime: status='completed'
    DB-->>D1: Realtime: back in queue
```

### Offer timeout & next-driver fallback

- **Primary UX:** the driver's offer card shows a **20–30s countdown**. Letting it hit zero (or tapping Decline)
  calls `respond_offer` with `decline`, which marks the offer and dispatches the next driver.
- **Safety net:** a `pg_cron` job (or an expiry check inside `respond_offer`) sweeps for `pending` offers older than
  the timeout and expires them + advances the queue — so a driver who closes the tab can't stall a ride forever.
- **No drivers left:** if there is no next available driver, the ride is set to `no_drivers` and the commuter is told
  to try again shortly.

## Fares & money

The app **does not touch fares.** The ride fare is paid in **cash, directly to the driver, outside the app** — the app
never sees the amount. (Historical note: an early MVP charged a 5+5 **credit** fee per ride; per-ride credits and the
`transactions` ledger were **removed in `0008`** when the subscription model landed.) Revenue is the subscription
below — never a per-ride charge.

## Subscriptions & access gating ✅ _(built `0008`–`0010` — see [`MONETIZATION.md`](MONETIZATION.md))_

Revenue is a flat **₱30/month subscription** for both sides, **not** a per-ride charge. It **gates access**, and is
deliberately kept **closed-loop** (redeemable only for app access, never used to pay the driver) so it stays clear of
BSP e-money regulation.

- **Access check.** `profiles.subscription_until` is the gate, via the `has_active_access(uid)` helper. `book_ride`
  (commuter) and `driver_go_online` (driver) reject when the subscription is expired, honoring a **3-day grace**.
  First month is free for both (stamped at signup in `handle_new_user`).
- **Manual GCash renewal.** The app shows a **business GCash number**; the user pays externally, then submits the
  **GCash reference number** (+ optional screenshot, stored in a private bucket) via `submit_renewal`, creating a
  `pending` `renewals` row. Ref numbers are **UNIQUE** (duplicates auto-rejected); a second pending submission is
  blocked; a rejected user can resubmit.
- **Admin review.** An `is_admin` flag + the `/admin` page lists pending renewals; the admin **cross-checks the ref
  against the GCash transaction history**, then calls `review_renewal(id, 'approve'|'reject', reason)` — a SECURITY
  DEFINER function that checks `is_admin()` **inside**, and on approve extends `subscription_until` by a month
  (stacking onto remaining time). The same `is_admin` role + signed-URL machinery is reserved for the planned driver
  verification.
- **No money moves through the app.** GCash handles the actual peso transfer; MotoQueue only records the claim and an
  admin confirms it. So there is still **no payment processor / service-role key** in this app.

## Realtime channels

| Subscriber | Listens to | Reacts by |
|-----------|------------|-----------|
| Driver | `ride_offers` for me | Show Accept/Decline card |
| Driver | `rides` where `driver_id = me` | Show trip panel; toggle queue availability |
| Commuter | `rides` where `client_id = me` | Update status UI (searching → accepted → completed / no_drivers) |
| Commuter (active ride) | `driver_states` (driver's location) | Move the driver marker on the live map |
| Both (active ride) | `messages` for the ride | Append new chat messages |
| Anyone on queue screen | `driver_states` changes | Update live online count / position |
| Any signed-in user | `profiles` (own row) | Update the subscription badge live (e.g. after a renewal is approved) |
| Any signed-in user | `renewals` for me | Flip the renewal status (pending → approved/rejected) in place |
| Admin | `renewals` (all) | Refresh the pending-review queue as submissions arrive |

## Trust & security

- **RLS on every table.** A user can read/write only rows they're entitled to (own row, ride participant, etc.);
  admins additionally read all `profiles` + `renewals` (via the SECURITY DEFINER `is_admin()` helper, which avoids
  RLS recursion).
- `subscription_until`, `is_admin`, queue ordering, ride-status transitions, and `renewals.status` are **never**
  writable from the client — only the `SECURITY DEFINER` functions touch them.
- Those functions check `auth.uid()` (and `is_admin()` for review actions, and that the caller owns the ride/offer
  they're acting on) before doing anything.
- Chat inserts and driver-location updates go direct from the client but are constrained by RLS / a self-only RPC.
  Renewal screenshots live in a **private** Storage bucket (per-user folder); reads are owner-or-admin via signed URLs.

See [`DATA_MODEL.md`](DATA_MODEL.md) for the concrete schema and RLS policies.
