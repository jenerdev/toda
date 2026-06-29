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
  created_at: string
}

export interface DriverState {
  driver_id: string
  is_online: boolean
  availability: Availability
  queued_at: string | null
  last_lat: number | null
  last_lng: number | null
  updated_at: string
}

export interface Ride {
  id: string
  client_id: string
  driver_id: string | null
  pickup_lat: number
  pickup_lng: number
  pickup_address: string | null
  status: RideStatus
  created_at: string
  accepted_at: string | null
  completed_at: string | null
  // Pickup surcharge (₱): `surcharge` is the agreed amount once accepted;
  // pending_* hold a driver's request while it awaits the commuter's approval.
  surcharge: number
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

/** Seconds a driver has to accept an offer before it auto-declines to the next driver. */
export const OFFER_TIMEOUT_SECONDS = 30
