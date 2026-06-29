// Distance-based pickup surcharge (see docs). A driver may request one of these
// amounts (₱) on a far offer; the commuter approves before the ride proceeds.
// The money is CASH to the driver — the app only relays the request.

/** Selectable surcharge amounts (₱). Must stay within the server cap (0–50, step 5). */
export const SURCHARGE_OPTIONS = [0, 5, 10, 15, 20] as const

/** Only offer the surcharge when the pickup is at least this far from the driver. */
export const SURCHARGE_MIN_DISTANCE_M = 1000

/** Shown to the driver next to the selector. */
export const SURCHARGE_DRIVER_NOTE =
  'Far pickup — you can request a distance surcharge, paid to you in cash. MotoQueue doesn’t set fares.'

/** Shown to the commuter on the approval prompt. */
export function surchargeCommuterPrompt(amount: number): string {
  return `Your driver requests an extra ₱${amount} for the distance to your pickup. Paid in cash to the driver, like the fare — approve to proceed.`
}
