import type { Profile } from '../types/db'

/** Flat monthly price, in pesos. Marketed as "₱1 a day". */
export const SUBSCRIPTION_PRICE = 30

/**
 * Grace period (days) after expiry before access is cut — mirrors the server's
 * has_active_access() in 0009. A user awaiting manual renewal approval keeps
 * access during this window.
 */
export const GRACE_DAYS = 3

/**
 * Business GCash account the user pays into. Should be a dedicated *Business*
 * GCash account (not a personal wallet — inbound limits + BIR/tax cleanliness).
 */
export const GCASH_NUMBER = '0926-782-2202'
export const GCASH_NAME = 'MotoQueue'

const DAY_MS = 86_400_000

export interface AccessState {
  /** True if access is allowed right now (active OR within grace). */
  hasAccess: boolean
  /** Active = not yet expired. */
  active: boolean
  /** Expired but still inside the grace window. */
  inGrace: boolean
  /** Expiry date, or null if never subscribed. */
  until: Date | null
  /** Whole days until expiry (negative once expired); null if never subscribed. */
  daysLeft: number | null
}

/** Derive the commuter/driver access state from their profile. */
export function accessState(profile: Profile | null): AccessState {
  if (!profile?.subscription_until) {
    return { hasAccess: false, active: false, inGrace: false, until: null, daysLeft: null }
  }
  const until = new Date(profile.subscription_until)
  const now = Date.now()
  const active = now <= until.getTime()
  const graceEnd = until.getTime() + GRACE_DAYS * DAY_MS
  const hasAccess = now <= graceEnd
  const daysLeft = Math.ceil((until.getTime() - now) / DAY_MS)
  return { hasAccess, active, inGrace: !active && hasAccess, until, daysLeft }
}
