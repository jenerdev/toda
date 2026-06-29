# MotoQueue 🏍️

A stripped-down "Grab/Uber for motorcycles" for a single subdivision.

In many neighborhoods, motorcycle-for-hire drivers gather at one designated area and serve clients first-come,
first-served. If you're far from that area, you have to **walk to it**. MotoQueue removes the walk: you book from
where you are, and the **next driver in the queue** is dispatched to you.

## The core loop

1. **Driver** registers (phone + one-time code) and goes **online** → joins the back of the queue.
2. **Commuter** logs in, **types a pickup address**, and **pins their current location** on the map.
3. The **first available driver** is notified → **Accept** or **Decline** (pickup details are revealed only on accept).
4. Decline / no response (30s) → the **next driver** is notified, and so on.
5. Accept → both are charged, the commuter sees **"driver on the way"** with a **live map** + **chat**.
6. Ride completes → the driver **re-queues at the end**.

### Credits (MVP)

Everyone starts with **100 credits**. Each ride costs **5 from the driver and 5 from the commuter**, charged **when
the driver accepts** (no refund). Topping-up / buying credits is intentionally **out of scope** for the MVP.

## Tech stack (short version)

- **Frontend:** React (Vite) + TypeScript + Tailwind, built as a mobile-first **PWA**
- **Backend + DB:** **Supabase** — Postgres, Auth, Realtime, and **Postgres `SECURITY DEFINER` RPC functions** for the
  trusted dispatch/credit logic (no Edge Functions / no CLI needed)
- **Auth:** **phone number + dummy OTP (`1234`)** — no email, no password (see `docs/TECH_STACK.md`)
- **Maps:** **OpenStreetMap + Leaflet** — free, no API key (no geocoding; address is typed)
- **Queue scope:** a **single subdivision** for the MVP

See [`docs/TECH_STACK.md`](docs/TECH_STACK.md) for the full breakdown and rationale.

## Docs

| Doc | What's in it |
|-----|--------------|
| [`docs/MVP_SCOPE.md`](docs/MVP_SCOPE.md) | What's in and explicitly out of the MVP |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Full stack, versions, and why each piece |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, dispatch flow, realtime, diagrams |
| [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md) | Tables, relationships, indexes, RLS policies |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | What's done, what's next, migration list |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Screens, navigation, visual language, wireframes |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Hosting + how the frontend talks to Supabase |

## Running locally

```bash
npm install
npm run dev          # Vite dev server (localhost)
```

1. Copy `.env.example` → `.env.local` and fill in your Supabase **URL** + **anon key**.
2. In the Supabase **SQL Editor**, run the migrations in `supabase/migrations/` **in order** (`0001` → `0006`).
   (No Supabase CLI/Docker required — everything server-side is plain SQL/RPC.)
3. In Supabase **Auth → Providers → Email**, turn **"Confirm email" OFF** (phone sign-ups use synthetic emails).

> Geolocation (current-location pin + live driver tracking) needs **HTTPS or localhost** — fine on `npm run dev` and
> on a deployed HTTPS host, but not over a plain `http://<LAN-IP>` URL on a phone.

## Deploy

You deploy **one** thing: the static Vite frontend. **Supabase hosts everything else** (Postgres, Auth, Realtime), and
all trusted logic is in **`SECURITY DEFINER` RPCs** applied as plain SQL — no server to run, no Supabase CLI/Docker.

**Frontend → Vercel** (Netlify / Cloudflare Pages work the same):

```bash
git push origin main           # repo: https://github.com/jenerdev/toda
```

1. On [vercel.com](https://vercel.com): **Add New… → Project** → import the repo. Vercel auto-detects Vite
   (build `npm run build`, output `dist`) — leave the defaults.
2. **Settings → Environment Variables**, add the two values from your `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   Both are **public by design** — RLS + the RPCs are the security boundary, not key secrecy. There is **no
   `service_role` key** in this app, so nothing secret ships to the host.
3. **Deploy.** You get an HTTPS URL with CDN; every push to `main` redeploys and PRs get preview URLs. SPA routing
   (React Router) works out of the box on Vercel.

**Backend → Supabase** (one-time, managed — you just apply SQL):

- In the **SQL Editor**, run `supabase/migrations/` **in order** (`0001` → `0011`). Order matters — later files
  redefine earlier functions and `0008` drops the old `credits`/`transactions`.
- **Auth → Providers → Email → "Confirm email" OFF** (phone sign-ups use synthetic, non-routable emails).
- Bootstrap the first admin: `update public.profiles set is_admin = true where phone = '<your phone>';`
- Optional: load `supabase/seed.sql` for a demo subdivision (verified+online drivers + a commuter; all log in with
  OTP `1234`). `supabase/seed_cleanup.sql` removes it.

> Use a **separate Supabase project for prod vs. dev** so you never demo against live data. Full detail —
> what-calls-what, Storage-policy caveats, post-deploy checklist — is in [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> **Status:** MVP core loop complete (Phases 1–7). Remaining work and the next steps are in
> [`docs/ROADMAP.md`](docs/ROADMAP.md).
