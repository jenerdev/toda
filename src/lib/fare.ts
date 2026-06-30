// Trip fare (commuter pickup → destination) the driver proposes; the commuter
// approves before the ride proceeds. CASH to the driver — the app only relays
// the proposed amount and records what was agreed (see docs/LEGAL.md). It does
// not collect or set fares.

/** Preset fare chips (₱); 0 = "Set in person". The "+10" chip bumps the current
 *  value by FARE_STEP up to FARE_MAX. Bounds match the server (0–1000). */
export const FARE_PRESETS = [0, 20, 30, 40, 50] as const
export const FARE_STEP = 10
export const FARE_MAX = 1000

/** Shown to the driver next to the fare selector. */
export const FARE_DRIVER_NOTE =
  'Propose the total cash fare for the trip (include any extra for a far pickup) — paid to you in cash. MotoQueue doesn’t set fares.'
