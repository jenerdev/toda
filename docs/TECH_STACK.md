# Tech Stack

## At a glance

| Layer | Choice | Why |
|-------|--------|-----|
| **Frontend framework** | React 18 + Vite + TypeScript | Fast dev/build, great ecosystem. TS catches bugs in the dispatch/subscription logic early. |
| **Delivery** | PWA (`vite-plugin-pwa`) | Both commuters and drivers are on phones. Installable (custom install prompt + iOS "Add to Home Screen" fallback), no app store, one codebase. `registerType: 'prompt'` with a **"new version → Reload" banner** (`ReloadPrompt`/`useRegisterSW`); a build id (`__BUILD_ID__`, the Vercel commit SHA, injected via Vite `define`) is shown in-app to confirm the live version. Custom service-worker push handlers (`public/push-sw.js`) are merged into the generated Workbox SW via `workbox.importScripts`. |
| **Styling** | Tailwind CSS | Mobile-first utility styling, quick to iterate. |
| **Routing** | React Router | Standard client-side routing for the handful of screens. |
| **Server state** | TanStack Query | Caching, refetch, and loading/error states around Supabase calls. |
| **Local UI state** | Zustand (light) | Tiny store for session/role/UI flags; avoids Redux overhead. |
| **Backend + DB** | **Supabase** | Postgres + Auth + Realtime + Edge Functions in one. Realtime is core to this app. |
| **Database** | PostgreSQL (via Supabase) | Relational data (users, queue, rides, offers, renewals) fits perfectly. |
| **Auth** | Supabase Auth (**phone + OTP**, dummy `1234`) | Most users have no email/password, so the phone number is the login identifier with a one-time code. The phone maps to a synthetic email on a real public TLD (`<digits>@motoqueue.app`) + a derived hidden password — Supabase still issues a real session for RLS. OTP is a dummy `1234` for the MVP (swap in an SMS provider later). Requires **"Confirm email" OFF**. |
| **Realtime** | Supabase Realtime | Push ride offers to drivers and status changes to commuters with no polling. |
| **Server logic** | **Postgres `SECURITY DEFINER` functions (RPC)** | Trusted, server-side dispatch + subscription gating + renewal review (never trust the client with access). Chosen over Edge Functions: no CLI/Docker to deploy, atomic transactions, and the timeout sweep reuses the same routine. The one exception is **outbound Web Push**, which needs an external call + VAPID signing — handled by a single Edge Function (`notify-driver`, see Push notifications). All access/dispatch logic stays in RPCs. |
| **Push notifications** ✅ | **Native Web Push (VAPID)** via a Supabase **Edge Function** | Drivers get ride offers even with the app closed / phone locked. The client subscribes via `PushManager` (public key `VITE_VAPID_PUBLIC_KEY`); subscriptions are stored in a `push_subscriptions` table. A Supabase **Database Webhook** on `ride_offers` INSERT calls the `notify-driver` Edge Function (Deno, `npm:web-push`), which sends the push and prunes dead subscriptions. No third-party push service. **iOS requires an installed PWA** (Add to Home Screen, iOS 16.4+) — not a Safari tab. |
| **Maps** | Leaflet + `react-leaflet` | Lightweight, open-source map rendering. |
| **Map tiles** | OpenStreetMap | Free tiles, no API key (respect usage policy / add attribution). |
| **Geocoding** | _none_ | Pickup address is **free text typed by the commuter** (shown to the driver); the map only pins current-location coordinates. No geocoding service needed. |
| **Payments** ✅ | **Manual GCash + admin review** | ₱30/month subscription (gates access). No payment gateway: user pays a **business GCash** number externally, submits the **reference number** (`submit_renewal`), an admin verifies it (`review_renewal`). Keeps money out of the app (closed-loop) — no processor, no service-role key. GCash API / a gateway is a later automation step. See [`MONETIZATION.md`](MONETIZATION.md). |
| **File storage** ✅ | **Supabase Storage (private bucket)** | `renewal-screenshots` (per-user folder), read via short-TTL **signed URLs** — never public (PII). Driver-verification photos will reuse the same pattern (planned). |
| **Hosting (frontend)** | **Vercel** (deployed) | Zero-config React/Vite deploys; auto-deploy on push to `main`. Repo: `github.com/jenerdev/toda`. Netlify / Cloudflare Pages are equally fine. |
| **Hosting (backend)** | Supabase Cloud | Managed Postgres + functions; generous free tier. |

## Why React is enough for the frontend (and what actually matters)

React is a solid choice for the UI. The **genuinely hard part of this app is not the frontend** — it's the
**realtime dispatch and fair queue ordering**, and that lives in the backend (Postgres RPCs + Supabase Realtime).
React just renders the offer card, the map, and the live status; the trust-sensitive logic (who's next in queue,
subscription/access gating) stays server-side.

We build it as a **PWA** rather than plain web pages because the users are mobile and a driver wants to "install"
the app and keep it open to receive offers — and, with Web Push, get offers even when it's closed.

## Why Supabase over a custom Node backend

- Auth, a Postgres database, realtime subscriptions, and serverless functions come **out of the box** — far less
  boilerplate for an MVP.
- **Row-Level Security** gives per-user data isolation declaratively.
- Trusted server logic lives in **Postgres `SECURITY DEFINER` RPCs** (`book_ride`, `respond_offer`,
  `complete_ride`, …); a single **Edge Function** (`notify-driver`) handles only outbound Web Push.
- Free tier is enough to build and demo. No vendor lock-in on the data — it's plain Postgres, exportable any time.

## Why OpenStreetMap/Leaflet over Google Maps (for MVP)

No billing account, no API key, no surprise costs. Leaflet + OSM tiles cover pinning a location and "use my location"
— everything the MVP needs (there's **no geocoding**: the pickup address is free text typed by the commuter). Google
Maps (better routing/ETA) is an easy swap later if it's worth the cost.

## Environment variables

Client (Vercel + `.env.local`) — all public, bundled into the frontend:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_VAPID_PUBLIC_KEY=...   # Web Push public key (safe to ship)
```

Server-only — `notify-driver` Edge Function secrets (never in the client/repo):

```
VAPID_PRIVATE_KEY=...       # the Web Push private key
VAPID_SUBJECT=mailto:...    # VAPID contact (spec-required)
WEBHOOK_SECRET=...          # shared with the Database Webhook's x-webhook-secret header
```

> The client ships only **public** keys (anon + VAPID public) — RLS + SECURITY DEFINER RPCs are the real boundary.
> The **service-role key** is used **only** inside the `notify-driver` Edge Function (Supabase injects it
> automatically as `SUPABASE_SERVICE_ROLE_KEY`); it never appears in the frontend or repo. Money never moves through
> the app. The Business GCash number is set in `src/lib/subscription.ts` (`GCASH_NUMBER`), not an env var.

## Indicative versions

> Pin exact versions in `package.json` at scaffold time.

- Node ≥ 20, React ^18, Vite ^5, TypeScript ^5
- `@supabase/supabase-js` ^2
- `leaflet` ^1.9, `react-leaflet` ^4
- `@tanstack/react-query` ^5, `zustand` ^4
- `tailwindcss` ^3, `vite-plugin-pwa` ^0.20
- `web-push` ^3.6 — used **only** inside the `notify-driver` Edge Function (Deno, via an `npm:` specifier), not a frontend dependency
