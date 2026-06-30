import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Ride } from '../types/db'

// How often the waiting rider re-evaluates dispatch. A driver who closed their
// browser is detectable once their heartbeat crosses the 60s liveness window, so
// polling well inside that keeps the worst-case wait to ~a minute.
const NUDGE_MS = 10_000

/**
 * While the rider is on "Finding you a driver…", periodically ask the server to
 * re-evaluate dispatch (see nudge_ride_dispatch, migration 0024): a pending offer
 * to a driver who closed their browser — or who sat past the offer timeout — is
 * expired and the ride re-offered to the next driver. This is what guarantees
 * progress without relying on a pg_cron sweep; the waiting rider drives it.
 *
 * Runs ONLY while genuinely searching (status 'searching' with no fare proposal
 * pending — a surcharge awaiting the rider's approval must not be disturbed).
 * The resulting re-dispatch / no-drivers transition propagates back through the
 * existing Realtime subscription on the ride, so no manual refetch is needed.
 */
export function useDispatchNudge(ride: Ride | null) {
  const rideId = ride?.id
  const searching =
    ride?.status === 'searching' &&
    (ride.pending_fare ?? 0) === 0 &&
    (ride.pending_surcharge ?? 0) === 0

  useEffect(() => {
    if (!rideId || !searching) return
    let cancelled = false
    const nudge = () => {
      if (cancelled) return
      void supabase.rpc('nudge_ride_dispatch', { p_ride_id: rideId })
    }
    nudge() // once on entry, then on an interval
    const id = setInterval(nudge, NUDGE_MS)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [rideId, searching])
}
