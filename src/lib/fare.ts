// Trip fare (commuter pickup → destination) the driver proposes; the commuter
// approves before the ride proceeds. CASH to the driver — the app only relays
// the proposed amount and records what was agreed (see docs/LEGAL.md). It does
// not collect or set fares.

// A fare is MANDATORY on every accept — the floor is FARE_MIN and it moves in
// FARE_STEP increments. Bounds are enforced server-side too (migration 0017).
export const FARE_MIN = 20
export const FARE_STEP = 5
export const FARE_MAX = 1000

/** Preset fare chips (₱), starting at the minimum. The "+5" chip bumps the
 *  current value by FARE_STEP up to FARE_MAX. */
export const FARE_PRESETS = [20, 30, 40, 50] as const

/** Shown to the driver next to the fare selector. */
export const FARE_DRIVER_NOTE =
  'Set the cash fare for the trip (min ₱20; include any extra for a far pickup) — paid to you in cash. MotoQueue doesn’t set fares.'
