# Design

Mobile-first. Single-thumb reachable. The two roles see different homes after login.

## Design language

- **Tone:** clear, fast, "get me a ride." No clutter — one primary action per screen.
- **Color:** brand **teal (`#0d9488`)** for primary actions ("Find me a driver", "Accept", "Go online"); a brighter
  **emerald green** reserved for celebratory "go" moments — the driver's **"You're next up"** queue state and the
  commuter's **"A driver is available!"** state (both with a live pulse); **red** for "Decline" / "Cancel" /
  destructive **and for the driver→pickup route line** on the maps; amber for soft warnings (e.g. coarse GPS); neutral
  grays for surfaces. Status uses color + a label
  (never color alone).
- **Type:** large, legible system font stack. Big tap targets (≥44px). Generous spacing.
- **Layout:** full-bleed map where relevant, content in bottom sheets/cards (thumb zone), sticky primary button.
- **Feedback:** every async action shows a loading state (a consistent brand **spinner**) and a clear success/error
  state — a failed load shows an **error card with Try again**, never a silent empty list; a completed ride pops a
  confirmation modal for both parties. Realtime updates animate in.
- **Accessibility:** AA contrast, labels on icons, focus states; status conveyed by text not just color.

## Navigation map

```
                 ┌─────────┐
                 │  Login  │──┐
                 └─────────┘  │  (no account)
                       ▲      ▼
                       │  ┌─────────┐
                       └──│ Sign up │ (choose role)
                          └────┬────┘
              role=commuter    │    role=driver
            ┌──────────────────┴───────────────────┐
            ▼                                        ▼
   ┌─────────────────┐                     ┌──────────────────┐
   │  Commuter Home  │                     │   Driver Home    │
   │  (map + book)   │                     │ (queue + toggle) │
   └────────┬────────┘                     └────────┬─────────┘
            ▼                                        ▼
   ┌─────────────────┐                     ┌──────────────────┐
   │   Ride Status   │◄── realtime ──►     │   Offer Card     │
   │ searching→done  │                     │ accept / decline │
   └─────────────────┘                     └──────────────────┘
```

Shared chrome: top bar with the app name + role, a **subscription badge** (shows the expiry date), an **Activity**
link (all users) + an **Admin** link (admins only), and sign-out. A small **build-id stamp** sits in the footer **and
on the login page** (so you can confirm which deploy you're on, even before signing in). When a ride ends — **completed
or cancelled** — **both parties** get a dismissible confirmation modal (`RideOutcomeToast`): celebratory for a
completion, neutral for a cancellation, shown over whatever screen they're on. As a PWA it also surfaces a dismissible **"Install MotoQueue"** banner (with an iOS "Share → Add to
Home Screen" variant) and a **"new version available — Reload"** banner when an updated service worker is waiting
(tapping Reload reliably activates the new version and refreshes). All these overlays/modals render **above the map**.
Beyond the two role homes there are three more routes: **`/history`** (Activity), **`/admin`** (review queue), and the
in-place **Renew** flow (shown when access lapses).

## Screen inventory & wireframes

### Login / Sign up
```
┌──────────────────────────┐
│        MotoQueue 🏍️       │
│                          │
│  Phone   [____________]  │  ← login identifier (no email)
│        [ Send code ]      │
│   ──────────────────      │
│  Code    [ • • • • ]      │  ← OTP, demo = 1234 (no password)
│                          │
│  (signup only)           │
│  Full name [__________]  │
│  I am a:  ( ) Commuter    │
│           ( ) Driver      │
│                          │
│  [      Continue      ]  │
│  ─ or ─  Create account  │
└──────────────────────────┘
```

### Commuter Home — find a driver
```
┌──────────────────────────┐
│ Hi, Ana    🎫 until Jul 19│  ← subscription badge (expiry date)
├──────────────────────────┤
│  Pickup address          │
│  [ Blk/Lot, st, landmark]│  ← free text, shown to driver
│  Destination             │
│  [ Where are you going? ]│  ← free text, shown to driver
│  [Alfamart][Brgy Hall]…  │  ← quick-pick chips fill the field
│      [   MAP w/ pin  ]   │  ← your live-tracking location
│        📍 (draggable)     │
├──────────────────────────┤
│  To find a driver:       │  ← checklist; hides once all ✓
│   ✓ Pin your location     │
│   ○ Enter pickup address   │
│   ○ Enter destination      │
│  [ 📍 Pin my current loc.]│  ← step 1 (then becomes "Find me a driver")
└──────────────────────────┘
```
- **Pinning your current GPS location is required** before booking — a driver can't be matched without it. The flow is
  **two-step on one button**: first **"📍 Pin my current location"** (captures GPS), then it switches to
  **"Find me a driver"** (still needs a pickup address **and a destination**). The old standalone "Use my current
  location" button was removed. A **"To find a driver:"** checklist shows what's left (pin location / enter address /
  enter destination) and disappears once all three are done. After pinning, the pin is draggable to fine-tune.
- **Destination quick picks:** a row of one-tap chips (common nearby spots — `DESTINATION_QUICK_PICKS` in
  `CommuterHome`, e.g. Alfamart, Barangay Hall, Dear Joe, Balen Magalang) fills the destination field; the chip for
  the current value highlights, and the text stays freely editable. Subdivision-specific — update for the launch area.
- **Remembered + clearable inputs:** the pickup address and destination are **persisted to `localStorage`**
  (`mq.pickup_address` / `mq.destination`, guarded against private-mode throws) so the next session pre-fills them; each
  field has a small **✕ clear button** (shown only when non-empty) to wipe it in one tap.
- If the subscription has lapsed, the whole booking UI is **replaced by the Renew panel** (booking is also gated
  server-side). Busy labels: "Locating…" then "Finding a driver…".

### Ride Status (commuter)
```
┌──────────────────────────┐
│  Finding you a driver…   │
│        (•••  spinner)     │
│  Pickup: 12 Acacia St     │
│        [ Cancel ]         │
└──────────────────────────┘
        │ realtime
        ▼  status='accepted'
┌──────────────────────────┐
│  ✅ Juan is on the way!   │
│  🏍️ Plate ABC-123         │
│  📞 0917-xxx-xxxx         │
│  [ Ride complete ]        │
└──────────────────────────┘
```
States: `searching` (spinner + cancel) · `accepted/enroute` (driver card + **live tracking map** — drawing the
**road route** from the driver to you with a *"Driver ~Nm away · ~N min"* label — + **chat** +
**Ride complete** + a **Cancel ride** button) · `completed` (a **"Ride completed!"** confirmation modal appears, then
returns to booking; fare paid in cash to the driver) · `cancelled` (a neutral **"Ride cancelled"** confirmation, then
back to booking) · `no_drivers` (see below). The accepted view also shows
**quick-reply chips** above the chat input.

The **`no_drivers`** screen (`NoDriversPanel`) offers more than a retry: alongside **Try again**, the commuter can tap
**"🔔 Notify me when a driver's available"** to arm a watch on the live queue. While watching it shows a pulsing
"Watching for a driver…" (with a Stop option); the moment a driver comes online it flips to a green
**"🎉 A driver is available! → Book now"** state that **re-books in one tap** (reusing the pinned location), and fires
a **system notification** if the commuter granted permission. (Works while the app is open/backgrounded; waking a
fully-closed app would need Web Push — see ROADMAP.)

### Driver Home — queue
```
┌──────────────────────────┐
│ Hi, Juan   🎫 until Jul 19│  ← subscription badge
├──────────────────────────┤
│   Status:  ● Online       │
│   [   Go offline   ]      │
├──────────────────────────┤
│  🔔 Don't miss a ride…    │  ← Enable ride alerts (Web Push) opt-in
│  [ Enable ride alerts ]   │
├──────────────────────────┤
│   4            #2          │  ← available count   ·   your position
│   drivers available        │
│   2 drivers ahead of you.  │
└──────────────────────────┘
   when you're first in line ▼
┌──────────────────────────┐
│  ● You're next up         │  ← emerald card + live pulse
│  The next ride is yours.  │
└──────────────────────────┘
```
- The queue is an **anonymized summary** (`QueueStatus`), not a per-driver list: the **count of available drivers** +
  **your own position** (bigger number when you're in line), plus a status line ("2 drivers ahead of you"). We
  **don't show other drivers' names** — RLS keeps profiles private, so the list is intentionally anonymized.
- When you're **first in line** the whole card turns **emerald green with a live pulse — "You're next up"** — so it's
  unmistakable at a glance that the next request is yours. (The old redundant "you're #N in queue" badge above the
  toggle was removed; position now lives only in this summary.)
- **Ride alerts:** an approved, subscribed driver sees an **"Enable ride alerts"** card (Web Push opt-in) so offers
  reach them even when the app is closed / the phone is locked; once on, it shows a quiet "🔔 Ride alerts on" line.
- Offline state: big **[ Go online ]** button, "You're offline — go online to receive rides." If the subscription has
  lapsed, the **Renew panel** appears above the toggle and **Go online is disabled**.

### Offer Card (driver) — appears via realtime, as a focused overlay
```
┌──────────────────────────┐
│   🔔 New ride request!    │
│ ◦ PICKUP                  │  ← small muted label…
│   12 Acacia St            │  ← …over the bold value (origin dot)
│ ● GOING TO                │
│   SM Mall                 │  ← destination (filled red dot)
│   📍 ~1.4 km from you·5min │  ← estimated range to the pickup
│   [ MAP: 🏍️ you ⟶ 📍 pickup]│  ← both points + red route line
│   Fare for the trip (req.) │  ← one all-in cash fare, min ₱20
│ [₱20][₱30][₱40][₱50][+5]   │  ← fare chips; "+5" bumps current (max ₱1000)
│   ⏱ 1:48                  │  ← countdown (in the header row; 2:00 limit)
│ [        Decline        ] │  ← full-width, stacked
│ [  Request ₱40 & accept  ] │
└──────────────────────────┘
```
- The driver sees the **pickup address, the destination, + a map before accepting** (the old "hidden until accept" gate was
  removed when per-ride credits went away — no commitment cost to seeing it). The map shows **both the driver's
  current location and the pickup** with the **route line** between them, plus an **estimated distance/ETA** ("~1.4 km
  from you · ~5 min", from a one-shot GPS fix + `useRoute`), so the driver can judge the pickup's distance before
  accepting. Falls back gracefully (pickup-only) if location permission isn't granted.
- **One all-in fare (mandatory):** preset chips **[₱20] [₱30] [₱40] [₱50]** plus a **[+5]** chip — **minimum ₱20**, in
  **₱5 increments**, capped at ₱1000; it defaults to ₱20 (no "None"). The driver names a *single* cash fare for the
  whole trip and folds any extra for a far pickup into it themselves — there is no separate surcharge selector (it
  added friction in the 2-minute window; the driver already sees the pickup distance/ETA to price by). When the amount
  climbs past the top chip via **[+5]** that chip **stays highlighted** (the highlighted chip is the largest preset ≤
  the current amount). The Accept button always reads **"Request ₱X & accept"** and the card switches to a
  **"Waiting for rider…"** state until the commuter decides — **there is no instant/zero-fare accept**; every ride goes
  through the commuter's approval. The ₱20 floor is enforced server-side too (migration `0017`). Buttons stacked full-width.
  > The `rides.surcharge` column + the surcharge args on the RPCs are **retained** (already-agreed rides keep their
  > itemized amount, and `FareBreakdown` still renders the legacy receipt for those); new requests just send `0`.
- **Presentation:** the card takes over the screen as a **focused overlay** (dimmed backdrop, centered, above the
  map/queue) — *incoming-call style* — so the driver commits to the 2-minute decision instead of half-noticing it inline.
  The **backdrop is intentionally not tap-to-dismiss** (that would silently decline a paying ride); the only exits are
  **Decline**, **Accept**, or the timeout (which auto-declines → next driver). Scrolls (`max-h-[90vh]`) so the map +
  chips never clip on small phones; the "Waiting for rider…" approval state stays in the overlay too.
- On accept → switches to an "On trip" view with the commuter's contact + **[ Mark complete ]**.
- On decline/timeout → returns to queue; the offer moves to the next driver. On a **timeout** (auto-decline) the
  driver gets a single-button **"Ride missed"** notice (`NoticeModal`, ⏱️) naming the pickup, so a too-slow tap isn't
  a silent vanish; a **manual** decline shows nothing (they already know). Dismiss → back to the online/queue view.
- If the driver proposed a fare and the **rider declines (or lets it lapse)** while in "Waiting for rider…", the offer
  flips to `declined` and the driver gets a **"Fare not approved"** notice (`NoticeModal`, 🙅) naming the proposed
  amount — detected via a Realtime watch on the driver's own offers (`awaiting_approval` → `declined`), so the waiting
  card doesn't just vanish. Approval (→ `accepted`) instead opens the trip; no notice.

### Fare approval (commuter) — appears in place of "Finding you a driver…"
```
┌──────────────────────────┐
│  Fare for approval  ⏱2:00 │
│  Your driver proposed     │
│  this fare… paid in cash. │
│  ┌──────────────────────┐ │
│  │ Fare (cash)      ₱40 │ │  ← FareBreakdown (single line)
│  └──────────────────────┘ │
│  [ Decline ] [ Approve ]  │
└──────────────────────────┘
```
- When a driver proposes a fare, the commuter's `searching` view becomes this amber prompt (`FareApprovalPanel`)
  with a 2-minute countdown and the **`FareBreakdown`**. **Approve** → ride proceeds (`accepted`), the agreed fare
  shows on both sides during the trip and in the completion confirmation. **Decline / timeout** → the ride is offered to
  the next driver. Copy stresses the money is **cash to the driver** and the app doesn't set fares.

### On-trip / complete (driver)
```
┌──────────────────────────┐
│   On trip 🛵 with Ana     │
│   📞 0917-xxx-xxxx        │
│   Pickup: 12 Acacia St    │
│   📡 Sharing live location │  ← or a warning if blocked/approximate
│   [  MAP: 🏍️ you + 📍 pickup]│  ← your own live position + pickup
│   [   Chat + quick replies]│
│   [    Mark complete   ]  │
│   [     Cancel trip     ]  │  ← cancel_accepted_ride → back to queue
└──────────────────────────┘
   → completing re-queues you at the back. Fare is paid in cash, outside the app.
            On completion *or* cancellation, both the driver and the rider get a confirmation modal.
```
- The trip map (shared `RouteMap`) plots the **driver's own live location (🏍️) alongside the pickup (📍)** and
  auto-fits to both — so the driver sees where they are relative to the rider, not just the destination.
- If the GPS fix is **coarse** (commonly **iOS "Precise Location" off**), an **amber warning** tells the driver the
  rider may see them in the wrong spot, with the exact setting to fix it.

### Renew / subscription ✅ _(built — `RenewPanel`; see [`MONETIZATION.md`](MONETIZATION.md))_
```
┌──────────────────────────┐
│  Your access             │
│  ✅ Active until Jul 19   │  ← or "⚠️ Expired — renew to continue"
│  (first month free)      │
├──────────────────────────┤
│  Renew — ₱30 / month     │
│  "just ₱1 a day"         │  ← framing
│                          │
│  1. Send ₱30 via GCash   │
│     to 0917-xxx-xxxx     │  ← business GCash number (copyable)
│  2. Enter reference no.  │
│     [__________________] │
│  3. Screenshot (optional)│
│     [ Upload ]           │
│  [      Submit renewal   ]│
├──────────────────────────┤
│  Status: ⏳ Pending review│  ← pending / approved / rejected (+ reason + resubmit)
└──────────────────────────┘
```
- Shown to **both** commuters and drivers. Same flat ₱30/month.
- Gates access: an expired commuter can't book; an expired driver can't go online (after the grace period).
- Rejected → show the reason + let the user **correct the ref and resubmit**.

### Driver verification ✅ _(built — `DriverVerificationPanel`, on the driver home)_
```
┌──────────────────────────┐
│  Driver verification     │
│  Upload to go online:    │
│  [ License photo  ▸ ]    │  ← image file → private driver-docs bucket
│  [ Motorcycle photo ▸ ]  │
│  [ Submit for review ]   │  → status: under review / rejected — reason (resubmit)
└──────────────────────────┘
```
Shown until the driver is **approved**; the online toggle is hidden/disabled until then.

### Admin review ✅ _(built — `/admin`, admins only — two sections)_
```
┌──────────────────────────┐
│  Driver verification     │
│  Ben · 0917-xxx-xxxx     │
│  [ 📎 License ][📎 Moto ]│  ← short-lived signed URLs
│  [ Approve ][ Reject ]   │
├──────────────────────────┤
│  Subscription renewals   │
│  Ana · 0917-xxx-xxxx     │
│  ₱30 · ref 9921XXXX      │  ← cross-check against GCash history!
│  current expiry: Jul 19  │
│  [ 📎 view screenshot ]  │  ← short-lived signed URL
│  [ Approve (+1 mo) ][Reject]│ ← Reject reveals a reason field
└──────────────────────────┘
```
- Admin must **verify the reference against the actual GCash transactions** (real, ₱30, not already used) — not a
  rubber stamp. Duplicate refs are auto-rejected before reaching this list.
- Approve → `review_renewal` extends `subscription_until` by a month (live via Realtime). Reject → reason captured +
  shown to the user, who can resubmit.
- A **Drivers** verification queue (license + motorcycle photos via signed URLs) reuses this same page + `is_admin`
  role (`0011`): pending applicants are listed, each photo opens via a short-lived signed URL, and Approve/Reject
  gates whether that driver can go online.

### Activity ✅ _(built — `/history`, all users)_
```
┌──────────────────────────┐
│  Activity                │
│  Ride history            │
│  • 12 Acacia St  Completed│
│  • Mango Ave     Cancelled│
│  Subscription history    │
│  • ₱30 ref 9921XXXX  ✅  │
│  • ₱30 ref 7710XXXX  ❌ — wrong ref│
└──────────────────────────┘
```
- Commuter sees rides they booked; driver sees trips they ran (terminal statuses). Renewals show outcome + any
  rejection reason. Live via Realtime.

## Component checklist

- `SubscriptionBadge` — subscription status in the top bar (live); shows the expiry date, an "Nd" nudge in the last
  week, and Grace/Expired states. *(Replaced the old `CreditBadge`.)*
- `MapPicker` — Leaflet map, draggable pin (coordinates only — no geocoding). The commuter pins via the booking
  button's "Pin my current location" step, then can drag to fine-tune.
- `QueueStatus` — anonymized queue **summary**: available-driver count + the driver's own position, with a distinct
  emerald **"You're next up"** state (live pulse) when first in line. *(Replaced the old per-driver `QueueList`.)*
- `OfferCard` — countdown + accept/decline; **shows the pickup address, destination, + a route map up-front**, plus a
  single all-in **fare** selector (mandatory, min ₱20, ₱5 steps).
- `FareApprovalPanel` — commuter's amber prompt to approve/decline a driver's proposed fare (2-minute countdown); shows
  the `FareBreakdown`. Replaced the old single-amount `SurchargeApprovalPanel`.
- `FareBreakdown` — fare display (cash): one **"Fare (cash) ₱X"** line for the current single-fare flow; legacy rides
  with a separate surcharge still render the itemized receipt. Used by `FareApprovalPanel`, `RideStatusPanel`, and
  `TripPanel`. Renders nothing when the total is 0.
- `RouteSummary` — shared **origin → destination** block: a small muted label over a bold value, hollow brand dot for
  pickup + filled red dot for destination. Used by `OfferCard`, `TripPanel`, and `RideStatusPanel` so all three match.
- `RideStatusPanel` — commuter's state machine (searching / on-the-way / no-drivers); embeds `LiveTrackMap` + `Chat`;
  Ride-complete + Cancel-ride actions. The no-drivers state renders `NoDriversPanel`.
- `NoDriversPanel` — no-drivers screen: Try again **+** "Notify me when a driver's available" watch → "A driver is
  available! → Book now" (one-tap re-book) + a system notification (`useAvailableDrivers`).
- `TripPanel` — driver's accepted-ride view; pickup address + destination + `RouteMap` (own live location + pickup + road route) + `Chat` +
  location-sharing status (incl. a coarse-GPS / Precise-Location warning); complete + cancel-trip actions.
- `RouteMap` — shared live map: a 🏍️ driver marker (when known) + a 📍 pickup marker, auto-fit to both, plus a
  **road-route polyline** + distance/ETA caption. Used by both the commuter (`LiveTrackMap`) and the driver
  (`TripPanel`) — each draws the route via `useRoute`/OSRM with a straight-line fallback.
- `LiveTrackMap` — commuter's live view of the driver moving toward the pickup (wraps `RouteMap`, driver position read
  from the DB).
- `PickupMap` — read-only map of the commuter's pinned location (shown in the offer).
- `InstallBanner` — dismissible PWA "Install MotoQueue" prompt (native `beforeinstallprompt` + iOS Share-sheet steps).
- `ReloadPrompt` — "new version available — Reload" banner when an updated service worker is waiting; the Reload action
  reliably activates the new version and refreshes.
- `ReconnectBanner` — top "Reconnecting… live updates paused" banner while the Realtime socket is down (refetches on
  recovery).
- `RideOutcomeToast` — dismissible confirmation shown to **both** parties when a ride ends, **completed or cancelled**
  (`useRideOutcome`); celebratory for completion, neutral for cancellation; mounted app-wide, renders above the map.
- `ConfirmDialog` — in-app confirmation modal (controlled `open` + confirm/cancel handlers) used before a
  destructive action; replaces native `window.confirm` (unstyled, off-brand, suppressed by some mobile browsers).
  Today it guards **cancel-accepted-ride** (commuter) and **cancel-trip** (driver); the destructive button is red.
- `NoticeModal` — single-button **acknowledgement** modal (controlled `open`; optional emoji) for an FYI with no
  choice to make — distinct from `ConfirmDialog`. Today it shows the driver's **"Ride missed"** timeout notice and the
  **"Fare not approved"** notice when a rider declines a proposed fare.
- `Spinner` / `Loading` / `EmptyState` / `ErrorState` (`States.tsx`) — shared state primitives: a consistent brand
  spinner, a quiet empty card, and a red **error card with a Try again** retry, used across Activity / Admin / the homes.
- `RideAlertsToggle` — driver Web Push opt-in ("Enable ride alerts") so offers arrive with the app closed/locked
  (`usePushNotifications`).
- `Chat` — in-ride messaging between the two participants; optional one-tap **`quickReplies`** chips (driver and
  commuter get role-specific canned Tagalog phrases).
- `RenewPanel` ✅ — subscription status + GCash number + reference-number/screenshot submission; pending/approved/
  rejected states with resubmit (`useMyRenewal`).
- `DriverVerificationPanel` ✅ — license + motorcycle photo upload (`useMyDriverApplication`); pending/rejected status; gates the online toggle.
- `Admin` page ✅ — admin-only; pending driver applications (`useAdminDriverApplications`) + pending renewals (`useAdminRenewals`), signed-URL doc/screenshot view, Approve/Reject with
  reason.
- `Activity` page ✅ — per-user ride history (`useRideHistory`) + subscription history (`useRenewalHistory`).

## Empty / error states (don't skip)

- **Consistent primitives:** loading uses a brand **spinner** (`Loading`); a **failed load** shows a red `ErrorState`
  card **with a Try again** button (refetches) rather than an empty list; a genuinely empty list uses a quiet
  `EmptyState` card. Applied across Activity, Admin, and the commuter & driver homes.
- **Ride completed or cancelled** → both parties see a confirmation modal — celebratory for a completion, neutral for
  a cancellation (Done, or tap the backdrop, to dismiss).
- No drivers online (commuter books) → "No drivers available right now." with **Try again** + a **"Notify me when a
  driver's available"** watch (re-books on one tap when one comes online).
- Geolocation denied → the commuter stays on the "Pin my current location" step (pinning is required to book); the
  error points them to enable permission. (On a laptop, geolocation is IP-based and may be approximate.)
- Driver location blocked / insecure origin → trip panel warns the driver the rider can't see them; a **coarse/approximate
  fix** (e.g. iOS Precise Location off) shows an amber warning with the fix.
- Notifications blocked → the "Enable ride alerts" / notify-me prompts explain how to re-enable (and, on iPhone, that
  the PWA must be installed to the Home Screen first).
- Network/realtime drop → a top **"Reconnecting… live updates paused"** banner (`ReconnectBanner`) appears while the
  Realtime socket is down and clears on reconnect (which also refetches data); never leave a spinner forever.
