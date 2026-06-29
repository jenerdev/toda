# Design

Mobile-first. Single-thumb reachable. The two roles see different homes after login.

## Design language

- **Tone:** clear, fast, "get me a ride." No clutter — one primary action per screen.
- **Color:** one strong accent for primary actions (e.g. a confident green/teal for "Find me a driver" and "Accept");
  red only for "Decline" / "Cancel" / destructive; neutral grays for surfaces. Status uses color + a label (never
  color alone).
- **Type:** large, legible system font stack. Big tap targets (≥44px). Generous spacing.
- **Layout:** full-bleed map where relevant, content in bottom sheets/cards (thumb zone), sticky primary button.
- **Feedback:** every async action shows a loading and a clear success/error state. Realtime updates animate in.
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
link (all users) + an **Admin** link (admins only), and sign-out. Beyond the two role homes there are three more
routes: **`/history`** (Activity), **`/admin`** (review queue), and the in-place **Renew** flow (shown when access
lapses).

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
│                          │
│  Pickup address          │
│  [ Blk/Lot, st, landmark]│  ← free text, shown to driver
│                          │
│  📍 Use my current loc.  │
│      [   MAP w/ pin  ]   │  ← pins coordinates for live tracking
│        📍 (draggable)     │
├──────────────────────────┤
│  [   Find me a driver   ] │  ← disabled if no address
└──────────────────────────┘
```
- If the subscription has lapsed, the whole booking UI is **replaced by the Renew panel** (booking is also gated
  server-side). Busy label: "Finding a driver…".

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
States: `searching` (spinner + cancel) · `accepted/enroute` (driver card + **live tracking map** + **chat** +
**Ride complete** + a **Cancel ride** button) · `completed` (returns to booking; fare paid in cash to the driver) ·
`no_drivers` (retry). The accepted view also shows **quick-reply chips** above the chat input.

### Driver Home — queue
```
┌──────────────────────────┐
│ Hi, Juan   🎫 until Jul 19│  ← subscription badge
├──────────────────────────┤
│   Status:  ● Online       │
│   [   Go offline   ]      │
│                          │
│   You are #2 in queue     │
│   ─────────────────────   │
│   Queue (4 online)        │
│   1. ● available          │
│   2. ● you                │
│   3. ● available          │
└──────────────────────────┘
```
- Offline state: big **[ Go online ]** button, "You're offline — go online to receive rides." If the subscription has
  lapsed, the **Renew panel** appears above the toggle and **Go online is disabled**.

### Offer Card (driver) — appears via realtime
```
┌──────────────────────────┐
│   🔔 New ride request!    │
│   Pickup: 12 Acacia St    │  ← address + pinned map shown up-front
│   [   MAP of pickup pin ] │
│   ⏱ 0:23                  │  ← countdown
│  [ Decline ] [ Accept ]   │
└──────────────────────────┘
```
- The driver sees the **pickup address + a pinned map before accepting** (the old "hidden until accept" gate was
  removed when per-ride credits went away — no commitment cost to seeing it).
- On accept → switches to an "On trip" view with the commuter's contact + **[ Mark complete ]**.
- On decline/timeout → returns to queue; the offer silently moves to the next driver.

### On-trip / complete (driver)
```
┌──────────────────────────┐
│   On trip 🛵 with Ana     │
│   📞 0917-xxx-xxxx        │
│   Pickup: 12 Acacia St    │
│   📡 Sharing live location │  ← or a warning if blocked
│   [   MAP of pickup pin ] │
│   [   Chat + quick replies]│
│   [    Mark complete   ]  │
│   [     Cancel trip     ]  │  ← cancel_accepted_ride → back to queue
└──────────────────────────┘
   → completing re-queues you at the back. Fare is paid in cash, outside the app.
```

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
- _Planned:_ a **Drivers** verification queue (license + motorcycle photos via signed URLs) will reuse this same page
  + `is_admin` role.

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
- `MapPicker` — Leaflet map, draggable pin, "use my current location" (coordinates only — no geocoding).
- `QueueList` — live, anonymized ordering + "you are #N."
- `OfferCard` — countdown + accept/decline; **shows the pickup address + a pinned `PickupMap` up-front**.
- `RideStatusPanel` — commuter's state machine (searching / on-the-way / no-drivers); embeds `LiveTrackMap` + `Chat`;
  Ride-complete + Cancel-ride actions.
- `TripPanel` — driver's accepted-ride view; pickup address + `PickupMap` + `Chat` + location-sharing status;
  complete + cancel-trip actions.
- `LiveTrackMap` — commuter's live view of the driver moving toward the pickup.
- `PickupMap` — read-only map of the commuter's pinned location (shown in the offer and the trip panel).
- `Chat` — in-ride messaging between the two participants; optional one-tap **`quickReplies`** chips (driver and
  commuter get role-specific canned Tagalog phrases).
- `RenewPanel` ✅ — subscription status + GCash number + reference-number/screenshot submission; pending/approved/
  rejected states with resubmit (`useMyRenewal`).
- `DriverVerificationPanel` ✅ — license + motorcycle photo upload (`useMyDriverApplication`); pending/rejected status; gates the online toggle.
- `Admin` page ✅ — admin-only; pending driver applications (`useAdminDriverApplications`) + pending renewals (`useAdminRenewals`), signed-URL doc/screenshot view, Approve/Reject with
  reason.
- `Activity` page ✅ — per-user ride history (`useRideHistory`) + subscription history (`useRenewalHistory`).

## Empty / error states (don't skip)

- No drivers online (commuter books) → "No drivers nearby right now — try again in a moment."
- Geolocation denied → keep the default center; the commuter pins on the map manually (address is typed regardless).
- Driver location blocked / insecure origin → trip panel warns the driver the rider can't see them.
- Network/realtime drop → reconnect banner; never leave a spinner forever. *(reconnect banner still TODO — see ROADMAP)*
