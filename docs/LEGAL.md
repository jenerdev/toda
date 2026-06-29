# Legal & Regulatory Positioning

> **Not legal advice.** This records the project's regulatory reasoning and the decisions made so far. Confirm the
> specifics with a Philippine transport lawyer and your LGU before public launch. Rules in this space change.

## Context

MotoQueue operates inside **one private subdivision** in the Philippines. The question that gates the whole project
is: *is it legal to run a ride-hailing app for motorcycle-type vehicles here?* The answer is **yes**, because of how
the pieces line up below.

## Why it's legal: TODA-franchised tricycles

- The subdivision's drivers operate **tricycles (motorcycle + sidecar)** that are **already franchised under a TODA**
  (Tricycle Operators and Drivers' Association).
- Tricycle franchising is **legal and devolved to the LGU** (city/municipality) under the **Local Government Code
  (RA 7160)**, via the **MTOP — Motorized Tricycle Operator's Permit**.
- So these are **legitimate, regulated public-transport vehicles.** The blocker that kills most "motorcycle taxi"
  apps — *solo motorcycles cannot legally be for-hire under RA 4136*, hence the closed DOTr/Angkas/JoyRide pilot — **does
  not apply here.** This is the tricycle path, not the solo-motorcycle-taxi gray area.

## What the app is (and isn't)

MotoQueue is a **dispatch / hailing tool** — *"find me a driver, pick me up here."* That's the entire transport role.

| The app DOES | The app does NOT |
|--------------|------------------|
| Connect a commuter to the next available franchised driver | Set, collect, or process the **fare** |
| Show the pickup point and let them coordinate | Track or care about the **destination** |
| Let the driver accept/decline | Take a cut of the ride fare |

The **fare is paid in cash, directly to the driver, outside the app.** The app never sees the amount. Legally this is
essentially a **digital version of waving down or phoning a tricycle** — something already completely normal and legal.
It keeps MotoQueue clear of fare-regulation rules (fares stay the driver's existing franchise responsibility).

## Are we a TNC (Transport Network Company)?

Low risk. The **LTFRB / TNC / TNVS accreditation regime is built for cars**, and **tricycles are LGU jurisdiction**,
not LTFRB. There is no clean "tricycle dispatch app" license regime — it's novel. This isn't a legal wall, but it *is*
why **LGU awareness and TODA cooperation matter** once the app earns revenue from their franchised operators.

## Monetization legality (summary — see [`MONETIZATION.md`](MONETIZATION.md))

Charging a **subscription for app access** is selling a normal digital service, not handling ride fares and **not
issuing stored value**. Access is now purely **time-based** (`subscription_until`) — per-ride credits were retired, so
there is no in-app balance at all, which keeps it cleanly **closed-loop** (a prepayment for the service period, never
redeemable for cash or transferable; see MONETIZATION for the rule). The critical line: **the subscription must never
be how the driver gets paid** — fares stay cash, outside the app. Earning revenue does, however, make MotoQueue a
business → standard registration applies (BIR, mayor's/business permit, DTI or SEC).

## Approvals & obligations checklist

| Item | Status / owner | Notes |
|------|----------------|-------|
| **HOA approval** | Required | Use of the subdivision's **private roads**. Necessary; sufficient alongside the TODA franchise. |
| **TODA cooperation** | Required (relationship) | Drivers are their franchised members; keep them on side. Charging drivers is the sensitive part — see MONETIZATION. |
| **LGU awareness** | Recommended | The franchise is the LGU's to grant/revoke; confirm whether a booking-app needs any platform-side registration. |
| **Operating area** | Constraint | MTOP franchises are **zone-bound** — don't dispatch drivers outside their franchised area (inside the subdivision is fine). |
| **Business registration** | Required before charging | BIR + mayor's/business permit + DTI/SEC (normal small-business setup). |
| **Driver insurance** | Confirm | Paid-passenger coverage is the driver's/franchise's responsibility; worth verifying. |
| **Transport lawyer consult** | Recommended | Cheap relative to the build; confirm the above holds in your specific city. |

## Bottom line

The legal foundation is **sound**: franchised tricycles + dispatch-only app + cash fares outside the app + HOA road
access. What remains are **relationship items** (TODA, LGU) and **ordinary business setup** — not launch-blocking
legal questions.
