# Deployment & Hosting

## The short version

There is **no separate backend server to run or pay for**, and **no Supabase CLI or Docker required.** You deploy
**one** thing yourself — the static React frontend. **Supabase hosts everything else** (database, auth, realtime). The
trusted dispatch/subscription logic lives in **Postgres `SECURITY DEFINER` functions (RPC)** you apply as plain SQL.

```
[ Vercel / Netlify ]                 [ Supabase Cloud — managed ]
   React PWA  ── reads / auth / realtime ─────►  Postgres + Auth + Realtime  (RLS-protected)
      │
      └──── book / accept / complete (rpc) ─────►  SECURITY DEFINER functions ──► Postgres
```

## What calls what

| Call | Path | Why |
|------|------|-----|
| Reads (queue, my ride, profile, messages), auth, realtime, chat insert, location update | Frontend → **Supabase directly** | RLS keeps it safe — users only touch rows they're allowed to. No extra hop. |
| Access gating + queue fairness (book, accept, decline, complete, renew, review) | Frontend → **`rpc()` → SECURITY DEFINER function** | The client can't be trusted with access or "who's next." The function runs as owner (bypasses RLS) after checking `auth.uid()` (and `is_admin()` for reviews). |

The `VITE_SUPABASE_ANON_KEY` shipped in the frontend bundle is **meant to be public** — RLS and the SECURITY DEFINER
functions are what protect the data, not key secrecy. (There's no service-role key in this app — the RPC functions
replace the need for one.)

## Frontend hosting

The frontend is a static Vite build (HTML/JS/CSS), so any static host works.

| Host | Notes |
|------|-------|
| **Vercel** (recommended) | Free tier, connect Git repo, auto-deploy on push, HTTPS + CDN, zero config for Vite, preview deploys per PR. |
| **Netlify** | Essentially a tie with Vercel; equally fine. |
| **Cloudflare Pages** | Strong free alternative if you want it on Cloudflare's network. |

### Steps (Vercel)

1. Push the repo to GitHub.
2. Import the repo in Vercel → it auto-detects Vite (build: `npm run build`, output: `dist`).
3. Add environment variables in the Vercel dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy. Every push to `main` redeploys; PRs get preview URLs.

> SPA routing: Vite + React Router needs a catch-all rewrite to `index.html`. Vercel handles this automatically for
> Vite; on Netlify add a `_redirects` file with `/*  /index.html  200`.

## Backend (Supabase) — managed; you just apply SQL

You don't host a server and you don't need the CLI. To set up (or update) the backend, open the Supabase **SQL
Editor** and run the migration files in `supabase/migrations/` **in order** (`0001` → `0027`). Apply them all in
order — later migrations redefine earlier functions (e.g. `book_ride`, `respond_offer`, `reject_surcharge`,
`cancel_accepted_ride`) and **`0008` drops** `profiles.credits` + the `transactions` table, so skipping or reordering
will leave the schema inconsistent. They create the tables, RLS, RPC functions, triggers, Realtime publications, and
the private Storage buckets. The later batch adds ride **destination** (`0014`), a driver-proposed **fare** + min-fare
gate (`0015`/`0017`), the 2-minute offer timeout (`0016`), **decline/cancel reasons** (`0018`/`0019`),
**single-active-session** enforcement (`0020`), admin ride **reporting** + saved addresses (`0021`/`0022`), cost
**indexes** (`0023`), auto re-dispatch when an offered driver drops off (`nudge_ride_dispatch`, `0024`), a
**security-hardening** pass — SQL-injection lockdown (`0025`, revokes `CREATE` on `public`) and an RLS/authorization
lockdown that revokes direct client DML so the SECURITY DEFINER RPCs are the only write path (`0026`) — and the move
of driver live-location into a participant-scoped **`driver_locations`** table (`0027`).
> Note: applying **`0011`** gates `driver_go_online` behind an **approved** `driver_applications` row — existing
> drivers can't go online until approved in `/admin`. Apply it when you're ready for that gate, not mid-test.
> **`0027` must ship with the matching frontend:** it drops `driver_states.last_lat/last_lng` and the current client
> reads live location from `driver_locations` instead — apply `0027` and deploy the new build together, or live
> tracking errors against the mismatched half.
> **Helper scripts** in `supabase/tests/` (run in the SQL Editor): `schema_check.sql` reports which migrations a
> database already has (handy before/after applying a batch), and `rls_audit.sql` runs forged-JWT checks asserting
> RLS denials (admin escalation, subscription self-extend, queue tampering, cross-user reads).

One-time project settings:

- **Auth → Providers → Email → "Confirm email" OFF** (phone sign-ups use synthetic, non-routable emails).
- Realtime is enabled per-table **by the migrations** (`driver_states`, `rides`, `ride_offers`, `profiles`,
  `messages`, `renewals`, `driver_applications`, and `driver_locations` from `0027`) — no manual toggling needed.
- The private **`renewal-screenshots`** (`0010`) and **`driver-docs`** (`0011`) Storage buckets + their RLS policies
  are created by the migrations — no manual setup. **Caveat:** some Supabase projects block `create policy … on
  storage.objects` from the SQL Editor. If uploads later 403, the bucket exists but the policies didn't apply — re-add
  them via **Dashboard → Storage → <bucket> → Policies** (upload: own folder `(storage.foldername(name))[1] =
  auth.uid()`; read: owner or `is_admin()`).
- Optional: enable the **pg_cron** extension and schedule `expire_stale_offers()` + `reap_stale_drivers()` (snippets
  in `0003`/`0007`). Not required — the offer countdown + the client driver heartbeat cover the live path.

> If you later prefer the CLI workflow, `supabase link` + `supabase db push` works too — but it's not required.

### Post-deploy steps (required for the subscription to work)

The subscription/renewal/admin + driver-verification stack (`0008`–`0011`) is **built**, but these steps are manual:

1. **Set the Business GCash number** the app shows users: edit `GCASH_NUMBER` (and `GCASH_NAME`) in
   `src/lib/subscription.ts` — it ships a `0917-000-0000` placeholder — then redeploy the frontend.
2. **Bootstrap the first admin** (no UI grants it): in the SQL Editor,
   `update public.profiles set is_admin = true where phone = '<your phone>';`
3. **Smoke-test Storage uploads** (driver verification depends on it): submit a driver application and confirm the
   `POST …/storage/v1/object/driver-docs/…` returns 200 and the files appear under `<uid>/…` in the bucket. A 403 means
   the storage policies didn't apply — see the caveat above.
4. **Approve your test driver** in `/admin` → Driver verification, or that driver can't go online (the `0011` gate).

Operational / **non-technical** prerequisites before charging real users:

- **A dedicated GCash *Business* account** to receive ₱30 renewals — not a personal wallet (inbound limits + a BIR/tax
  mess). Its number is the one you put in `GCASH_NUMBER`.
- **Business registration**: BIR + mayor's/business permit + DTI or SEC (see [`LEGAL.md`](LEGAL.md)).
- **HOA approval + TODA cooperation + LGU awareness** — relationship prerequisites, see `LEGAL.md`.
- **Real SMS OTP** — the dummy `1234` is a launch blocker (see [`ROADMAP.md`](ROADMAP.md) → Security).

## Push notifications (driver ride alerts)

Drivers can get ride offers as Web Push notifications even when the app is closed / the phone is locked. This needs a
one-time setup beyond the normal deploy:

1. **Generate a VAPID keypair** (once): `npx web-push generate-vapid-keys`. You get a public + private key.
2. **Frontend:** set `VITE_VAPID_PUBLIC_KEY` (the *public* key) in `.env.local` and in Vercel → Environment Variables;
   redeploy. (The public key is safe to ship; the private key never touches the frontend.)
3. **Apply migration** `0012_push_subscriptions.sql` in the SQL Editor.
4. **Deploy the Edge Function** `supabase/functions/notify-driver` (Dashboard → Edge Functions, or
   `supabase functions deploy notify-driver`). Set its **secrets**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`,
   `VAPID_SUBJECT` (e.g. `mailto:you@example.com`), and a `WEBHOOK_SECRET` you choose. (`SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.)
5. **Create a Database Webhook** (Dashboard → Database → Webhooks): on **INSERT** into `public.ride_offers`, POST to
   the `notify-driver` function URL, adding header `x-webhook-secret: <the WEBHOOK_SECRET>`. The function only pushes
   for rows where `status = 'pending'`.

> The driver must tap **"Enable ride alerts"** (and, on **iPhone**, first **Add MotoQueue to the Home Screen** — iOS
> only supports Web Push for an installed PWA on iOS 16.4+, never in a Safari tab). Dead subscriptions (404/410) are
> auto-pruned by the function.

## Environments

| Stage | Frontend | Backend |
|-------|----------|---------|
| **Local dev** | `npm run dev` (Vite, localhost) | A hosted Supabase project (apply migrations via SQL Editor) |
| **Production** | Vercel / Netlify | The same (or a separate) hosted Supabase project |

Use a separate Supabase project for prod vs. dev so you never test against live data.

## Cost outlook (MVP)

Both Vercel/Netlify and Supabase have free tiers that comfortably cover an MVP and demo. The main thing to watch as
usage grows is Supabase's realtime connection count and database size, and (only if you switch maps) Google Maps
billing — which is why the MVP uses free OpenStreetMap. To keep realtime/egress down, the broad "are drivers
available?" watch **polls** (instead of a wildcard `driver_states` subscription), the live driver-queue refetch is
**debounced**, and `0023` adds indexes for the heavier reads.
