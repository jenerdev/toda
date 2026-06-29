import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Ride, Role } from '../types/db'

/**
 * Fires when one of this user's rides transitions to `completed` (by either
 * party), so both the commuter and the driver get a confirmation. Driven by the
 * realtime UPDATE event — it only triggers on a live completion while mounted
 * and never replays on remount, so it won't pop spuriously.
 */
export function useJustCompletedRide(userId: string | undefined, role: Role | undefined) {
  const [completed, setCompleted] = useState<Ride | null>(null)

  useEffect(() => {
    if (!userId || !role) return
    const column = role === 'driver' ? 'driver_id' : 'client_id'
    const channel = supabase
      .channel(`ride_complete_${role}_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rides', filter: `${column}=eq.${userId}` },
        (payload) => {
          const row = payload.new as Ride
          if (row.status === 'completed') setCompleted(row)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, role])

  return { completed, dismiss: () => setCompleted(null) }
}
