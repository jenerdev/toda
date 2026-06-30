// Hand-written types mirroring the supabase/migrations.
// (Later we can generate these with `supabase gen types typescript`.)

export type Role = 'commuter' | 'driver'

export type Availability = 'available' | 'on_trip' | 'offline'

export type RideStatus =
  | 'searching'
  | 'accepted'
  | 'enroute'
  | 'completed'
  | 'cancelled'
  | 'no_drivers'

export type OfferStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'awaiting_approval'

export type RenewalStatus = 'pending' | 'approved' | 'rejected'

export type VerificationStatus = 'pending' | 'approved' | 'rejected'

export interface Profile {
  id: string
  role: Role
  full_name: string | null
  phone: string | null
  // Access is subscription-based (₱30/month). NULL = never subscribed.
  subscription_until: string | null
  is_admin: boolean
  // Id of the device that currently holds this account's single active session
  // (set by claim_session on login). A mismatch signs the other device out.
  active_session_id: string | null
  // The rider's last booked pickup address + destination, stamped by book_ride
  // so the next booking pre-fills from the account (follows them across devices).
  last_pickup_address: string | null
  last_destination: string | null
  created_at: string
}

export interface DriverState {
  driver_id: string
  is_online: boolean
  availability: Availability
  queued_at: string | null
  updated_at: string
}

// Private live GPS, split out of driver_states (0027) so participant-scoped RLS
// can keep a driver's coordinates from leaking to unrelated users.
export interface DriverLocationRow {
  driver_id: string
  lat: number | null
  lng: number | null
  updated_at: string
}

export interface Ride {
  id: string
  client_id: string
  driver_id: string | null
  pickup_lat: number
  pickup_lng: number
  pickup_address: string | null
  // Where the rider is going (free text, no geocoding) — shown to the driver.
  destination: string | null
  status: RideStatus
  created_at: string
  accepted_at: string | null
  completed_at: string | null
  // Reason given when an accepted ride was cancelled (shown to the other party).
  cancellation_reason: string | null
  // Fare + pickup surcharge (₱): `fare`/`surcharge` are the agreed amounts once
  // accepted; pending_* hold a driver's proposal while it awaits the commuter's
  // approval. `fare` is the trip fare (pickup → destination); `surcharge` is the
  // extra for distance to the pickup. Both cash — the app only records them.
  fare: number
  surcharge: number
  pending_fare: number | null
  pending_surcharge: number | null
  pending_driver_id: string | null
}

export interface RideOffer {
  id: string
  ride_id: string
  driver_id: string
  status: OfferStatus
  offered_at: string
  responded_at: string | null
  // Reason the commuter gave when declining a proposed fare (relayed to the driver).
  decline_reason: string | null
  // True only when this offer expired because the driver never responded (set by
  // the expire_stale_offers sweep) — distinct from offers voided by a ride being
  // taken elsewhere or by a commuter cancel. Drives the "missed" report.
  timed_out: boolean
  // True only when the commuter rejected this offer's proposed fare/surcharge
  // (set by reject_surcharge) — distinct from a plain driver decline.
  fare_rejected: boolean
}

export interface Renewal {
  id: string
  user_id: string
  gcash_ref: string
  screenshot_path: string | null
  amount: number
  status: RenewalStatus
  rejection_reason: string | null
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface DriverApplication {
  driver_id: string
  license_path: string | null
  motorcycle_path: string | null
  status: VerificationStatus
  rejection_reason: string | null
  submitted_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface Message {
  id: string
  ride_id: string
  sender_id: string
  body: string
  created_at: string
}

/** Aggregate ride-outcome counts for the admin Reports section, returned by the
 *  `admin_ride_stats` RPC. `missed` = offers a driver let expire; `fare_declined`
 *  = fare proposals the commuter rejected (re-dispatch events, not terminated
 *  rides). `cancellation_reasons` covers only rides cancelled after acceptance. */
export interface RideStats {
  completed: number
  cancelled: number
  no_drivers: number
  missed: number
  fare_declined: number
  cancellation_reasons: { reason: string; count: number }[]
}

/** Seconds a driver has to accept an offer before it auto-declines to the next
 *  driver (the rider-pickup time limit). Keep in sync with the server-side
 *  `expire_stale_offers` sweep interval (see migration 0016). */
export const OFFER_TIMEOUT_SECONDS = 120
