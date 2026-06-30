import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ride, Role } from '../types/db'

export type RideOutcomeKind = 'completed' | 'cancelled'
export interface RideOutcome {
  ride: Ride
  kind: RideOutcomeKind
}

/**
 * Fires when one of this user's rides reaches a terminal outcome — `completed`
 * or `cancelled` — so both the commuter and the driver get a confirmation.
 * Driven by the realtime UPDATE event: it only triggers on a live transition
 * while mounted and never replays on remount.
 *
 * Note: a driver only receives an event for a ride they were assigned to (the
 * filter is `driver_id`), so a commuter cancelling a still-`searching` ride
 * never reaches a driver — which is why "you're back in the queue" is always
 * accurate for the driver.
 */
export function useRideOutcome(userId: string | undefined, role: Role | undefined) {
  const [outcome, setOutcome] = useState<RideOutcome | null>(null)

  useEffect(() => {
    if (!userId || !role) return
    const column = role === 'driver' ? 'driver_id' : 'client_id'
    const channel = supabase
      .channel(`ride_outcome_${role}_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `${column}=eq.${userId}` },
        (payload) => {
          const row = payload.new as Ride
          if (row.status === 'completed') setOutcome({ ride: row, kind: 'completed' })
          else if (row.status === 'cancelled' && row.accepted_at) {
            // Only surface the cancellation modal for a ride that was actually
            // matched to a driver (accepted/enroute → cancelled). Clearing a
            // never-matched search — no_drivers / searching → cancelled, e.g. the
            // commuter's "Try again", "Cancel", or rebook on the no-drivers
            // screen — routes through cancel_ride (which leaves accepted_at null)
            // and must NOT pop a spurious "Ride cancelled" confirmation.
            setOutcome({ ride: row, kind: 'cancelled' })
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, role])

  return { outcome, dismiss: () => setOutcome(null) }
}
