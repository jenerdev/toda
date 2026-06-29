import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Ride, Role } from '../types/db'

// Terminal statuses worth showing per role. A commuter also sees 'no_drivers'
// (a booking that found nobody); a driver only sees rides they actually ran.
const COMMUTER_STATUSES = ['completed', 'cancelled', 'no_drivers']
const DRIVER_STATUSES = ['completed', 'cancelled']

/**
 * A user's past rides (most recent first), kept live via Realtime. Reads via the
 * existing rides_select_participant RLS — a commuter sees rides they booked, a
 * driver sees trips they ran. Pickup address is shown as-is; counterpart names
 * aren't joined (profile reads are RLS-restricted to your own row).
 */
export function useRideHistory(userId: string | undefined, role: Role | undefined) {
  const qc = useQueryClient()
  const column = role === 'driver' ? 'driver_id' : 'client_id'
  const statuses = role === 'driver' ? DRIVER_STATUSES : COMMUTER_STATUSES

  const { data, isLoading, error } = useQuery({
    queryKey: ['rideHistory', userId, role],
    enabled: Boolean(userId && role),
    queryFn: async (): Promise<Ride[]> => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq(column, userId!)
        .in('status', statuses)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as Ride[]) ?? []
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`history_rides_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides', filter: `${column}=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['rideHistory', userId, role] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, role, column, qc])

  return { rides: data ?? [], loading: isLoading, error }
}
