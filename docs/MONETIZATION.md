# Monetization

> Status: **built (`0008`–`0010`).** This is the implemented revenue model and payment flow. Per-ride credits were
> retired in favor of this subscription (decided 2026-06-20 — see "RESOLVED" below). See [`ROADMAP.md`](ROADMAP.md)
> for build status and [`LEGAL.md`](LEGAL.md) for the regulatory framing.
> ⚠️ **One launch step remains:** set the real Business GCash number in `src/lib/subscription.ts` (`GCASH_NUMBER`,
> currently a `0917-000-0000` placeholder).

## The model: flat monthly subscription

- **₱30 / month**, marketed as **"₱1 a day"** (price psychology — a daily framing reads as trivial vs. a monthly bill).
- Charged to **both sides** — drivers **and** commuters — at the same flat rate.
- **First month free for both**, to solve the cold-start problem (commuters won't pay with no drivers online; drivers
  won't pay with no riders). Turn on billing once both sides are active and pickups are reliable.

### What the subscription buys

Access to the app for a billing period — nothing more:

| Side | What an active subscription unlocks |
|------|-------------------------------------|
| **Commuter** | The ability to **book a ride** (request dispatch). |
| **Driver** | The ability to **go online** and receive dispatch offers. |

It does **not** buy ride fares (paid in cash to the driver, outside the app) and is **not** a wallet to pay drivers
with. See the closed-loop rule below.

## ⚠️ Critical design rule: keep it closed-loop

To stay **out of BSP e-money / stored-value regulation** (an Electronic Money Issuer license is a heavy regime we must
avoid), the paid balance must be **closed-loop**:

| Keep ✅ | Avoid ❌ |
|---------|----------|
| Redeemable **only** for MotoQueue's own access | Cashable back to pesos |
| **Non-transferable** between users | Transferable / giftable |
| Just a prepayment for the service period | A general "wallet" / payment instrument |
| Driver always paid in **cash, outside the app** | Using app balance to pay the driver |

The single line not to cross: **app balance must never be how the driver gets paid.**

> **Note — the driver-proposed trip fare (`0013`, `0015`) is not app revenue.** Before accepting, a driver may propose
> a single all-in trip fare that the commuter approves; it's paid **in cash to the driver, outside the app** (the app
> only records the agreed amount). It earns MotoQueue nothing and no money flows through the app, so the closed-loop
> rule above is unaffected. Its only sensitivity is the fare-relay/TODA angle — see [`LEGAL.md`](LEGAL.md).

## Payment flow (MVP — manual GCash)

No payment gateway for the MVP. Manual GCash + reference-number review. Cheap, no integration, validates
willingness-to-pay first.

```
1. App displays the business GCash number (+ amount ₱30).
2. User pays ₱30 via GCash on their own.
3. User taps "Renew" → enters the GCash reference number (optionally uploads a screenshot).
4. Submission lands in the admin review queue (status = pending).
5. Admin cross-checks the reference against the GCash transaction history (real? ₱30? not reused?).
6. Admin marks Approve (→ extends subscription) or Reject (→ with a reason).
7. User is notified; on approve, access continues for another month.
```

### Hardening (build these in, not optional)

- **Verification is the real work.** A reference number proves nothing unless the admin **cross-checks it against the
  actual GCash transaction history** (exists, amount = ₱30, not already used). Don't rubber-stamp.
- **Enforce unique reference numbers** — store every used ref; **auto-reject duplicates**, so one valid ref can't be
  reused or shared.
- **Optional screenshot upload** alongside the ref makes verification fast and fraud obvious.
- **Resubmit / dispute path** — a user who paid but mistyped the ref must be able to correct and resubmit; rejection
  with a reason, not a dead end.
- **Grace period (~3–5 days)** after expiry before cutting access — the user is waiting on *your* manual approval;
  don't lock them out mid-queue.
- **Approval SLA + notification** — e.g. "reviewed within 24h" + an in-app/push notice on approve/reject.
- **Dedicated GCash Business account** (not a personal one): personal wallets have inbound limits, and mixing business
  income into a personal wallet is a BIR/tax mess. A Business account also looks more legitimate to paying users.
- **Consumer terms (DTI)** — a short ToS covering what the subscription buys, refunds, expiry, and what happens when
  no driver is available.

> **Implemented vs. TODO:** unique-ref enforcement, duplicate auto-reject, optional screenshot (private bucket +
> signed URLs), resubmit-after-reject, the 3-day grace, and "admin must cross-check the ref" are all **built** (`0009`/
> `0010`). Still **TODO**: an explicit approval **notification** + a stated **24h SLA** (today the user just sees their
> status flip live via Realtime), and the **DTI consumer terms**. The dedicated GCash **Business** account is an
> operational setup step (the app only displays whatever number you put in `GCASH_NUMBER`).

## ✅ RESOLVED: subscription replaces per-ride credits

**Decision (2026-06-20): Option 1 — per-ride credits are retired.** Access is purely time-based via
`profiles.subscription_until`; the 5+5 deduction, the refund path, the `credits` column, and the `transactions` table
are all gone (migration `0008`). The credit badge is replaced by a subscription badge. This matches the principle that
**the app never touches fares** — drivers are paid in cash, outside the app.

Built across `0008` (retire credits), `0009` (subscription state + access gating, first month free, 3-day grace), and
`0010` (renewals table + admin review + private screenshot bucket). See [`ROADMAP.md`](ROADMAP.md) → "Subscriptions &
monetization".

> Original options, for the record: (1) retire credits *(chosen)*; (2) keep credits as a closed-loop anti-abuse
> counter only. A fair-use cap was not needed, so Option 1 won.

## Realistic expectations & growth

- One subdivision is **modest math** (e.g. 30 drivers + 200 commuters ≈ ₱6,900/month) — a community side-income, not a
  salary. Set expectations accordingly.
- The growth lever is **the same app rolled out to more subdivisions** (already on the v2 list as multi-zone). Keep the
  build multi-subdivision-friendly.
- When manual review stops scaling (a few hundred users), automate collection — **GCash API or a payment gateway** — as
  a later phase.

## Alternatives considered (not chosen)

Evaluated and set aside in favor of the flat subscription: **HOA-funded amenity** (HOA pays, free to users — cleanest
legally), **local merchant advertising**, **commuter-only booking fee**, **per-ride credits**. These remain fallback
or supplementary options if the subscription underperforms (e.g. layer in local ads later).
