# MVP Scope

The goal of the MVP is to **prove the end-to-end loop** for one subdivision:

> queue → book → dispatch → accept/decline → on the way → complete → re-queue

Everything else is deferred. Keeping scope tight is what makes this shippable quickly. **Status: the MVP is built and
deployed** (Vercel; repo [github.com/jenerdev/toda](https://github.com/jenerdev/toda)).

> **What MotoQueue is:** a **dispatch / hailing tool** for **TODA-franchised tricycles** in one subdivision — *"find me
> a driver, pick me up here."* It does **not** handle the **fare** (paid in cash directly to the driver, outside the
> app) or the **destination**. This positioning is what keeps it legally clean — see [`LEGAL.md`](LEGAL.md). The revenue
> model is a flat **₱30/month subscription** (both sides), detailed in [`MONETIZATION.md`](MONETIZATION.md).

## ✅ In scope

| Area | What's included |
|------|-----------------|
| **Auth** | **Phone number + one-time code** sign-up / login (most users have no email, no password to remember). The OTP is a **dummy `1234`** for the MVP (real SMS provider later). The phone maps to a synthetic email + derived password for Supabase Auth, hidden from the user. Pick a role at signup: `commuter` or `driver`. |
| **Profiles** | Name, phone, role, `subscription_until`, `is_admin`. |
| **Subscription & access** | Flat **₱30/month** gates access (commuter can book; driver can go online). **First month free**, **3-day grace** after expiry. Manual **GCash** renewal (ref number + optional screenshot) reviewed by an admin. ✅ Built (`0008`–`0010`) — **per-ride credits were retired**; the app never touches fares (cash, outside the app). See [`MONETIZATION.md`](MONETIZATION.md). |
| **Driver queue** | Online/offline toggle. Going online joins the **back** of a single FIFO queue. Live queue list + your position. A client **heartbeat** keeps an online driver dispatchable; stale (closed-tab) drivers fall out after 60s. |
| **Booking** | Commuter **types the pickup address + destination** (both free text, shown to the driver) and **must pin their current GPS location** (all three required before booking — the primary button pins location first, then becomes "Find me a driver") on a Leaflet map (coordinates power the live-tracking map). Destination added in `0014`. |
| **Dispatch** | First available driver is offered the ride **with the pickup address + map shown up-front**. Decline / timeout → next driver. Accept → commuter notified. Either side can **cancel after accept** (driver re-queued). Accepting **requires** a single all-in **trip fare** (min ₱20, ₱5 steps, up to ₱1000, folding in any extra for a far pickup); the commuter approves it before the ride (no instant accept), decline → next driver. ✅ Built (`0013`, `0015`, `0017`). |
| **Ride lifecycle** | `searching → accepted → enroute → completed` (plus `cancelled`, `no_drivers`). |
| **Re-queue** | After completing, the driver returns to the **end** of the queue. |
| **Realtime** | Drivers see incoming offers instantly; commuters see status changes instantly. |
| **In-ride chat** | Once accepted, commuter and driver can exchange messages (realtime, scoped to the ride), with one-tap **quick-reply chips** (canned Tagalog phrases per role). |
| **Live driver location** | While on a trip, the driver streams GPS; the commuter sees the driver moving on a map toward the pickup. |
| **Admin review** | An `is_admin` role + `/admin` page to review GCash renewals **and driver applications** (Approve/Reject with reason). ✅ Built (`0010`/`0011`). |
| **Driver verification** | Drivers upload license + motorcycle photos for admin approval; can't go online until approved. ✅ Built (`0011`). |
| **Activity history** | Per-user `/history`: ride/trip history + subscription-renewal history. ✅ Built. |
| **Push notifications** | **Driver ride-offer push** via native Web Push (VAPID + a `notify-driver` Edge Function on a `ride_offers` DB webhook) — drivers get offers **even when the app is closed / phone locked**. ✅ Built & verified. Commuter-side **"notify me when a driver's available"** on the no-drivers screen (in-app + system notification while the app is alive), with one-tap re-book. ✅ Built. ⚠️ iOS Web Push needs the **installed PWA** (iOS 16.4+), not a Safari tab. |
| **PWA** | Installable to home screen (install banner), mobile-first layout, offline shell, and a **"new version available → Reload"** prompt on update (the app auto-checks for new builds). A build id is shown on the login page + app footer. ✅ Built. |
| **UX & reliability** | Consistent **loading / empty / error** states across screens (a failed load shows a retry, never a misleading "empty"); a **reconnect banner** when the realtime connection drops (auto-refetches on reconnect); a **ride-completed confirmation** shown to **both** driver and commuter. ✅ Built. |

## ❌ Out of scope (future phases)

| Deferred | Why it waits |
|----------|--------------|
| **Real SMS OTP** | The `1234` dummy OTP is a **launch blocker**; swap in a real SMS provider before public launch. |
| **Multiple zones / subdivisions** | MVP is one shared queue. Multi-zone needs geofencing + per-zone queues — also the monetization growth lever. |
| **Ratings & reviews** | Not needed to prove the core loop. |
| **Voice calling** | Tap-to-call the shared phone number covers this; in-app chat is built. |
| **Fare/pricing in-app** | Fares stay cash, paid to the driver outside the app **by design**. The exception is the **driver-proposed fare** (`0013`, `0015`): the driver names a single all-in trip fare, the commuter approves, and the app *relays/records* the agreed amount — but the money is still cash and the app doesn't set fares (see [`LEGAL.md`](LEGAL.md)). |
| **Native iOS / Android apps** | PWA covers the MVP; native is a v2 reusing the same backend. |

## Success criteria

The MVP is "done" when the **two-browser demo** passes (see [`ARCHITECTURE.md`](ARCHITECTURE.md) and
[`ROADMAP.md`](ROADMAP.md)):

- A driver goes online and a commuter books; the driver gets a realtime offer **showing the pickup up-front**.
- Accept → commuter sees "driver on the way" → complete (fare paid in **cash**, outside the app).
- The driver reappears at the **end** of the queue.
- Decline, timeout, no-driver, and cancel-after-accept paths all behave correctly.
- Booking is blocked for an expired commuter; going online is blocked for an expired driver (subscription gate, with
  first-month-free + 3-day grace); a manual GCash renewal can be submitted and admin-approved.
