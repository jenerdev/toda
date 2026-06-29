import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Ride } from '../types/db'

const ACTIVE = ['searching', 'accepted', 'enroute', 'no_drivers']

/**
 * The commuter's current active ride (if any), kept live via Realtime.
 * Returns null once the ride completes / is cancelled, returning them to booking.
 */
export function useActiveRide(userId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['activeRide', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Ride | null> => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('client_id', userId!)
        .in('status', ACTIVE)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as Ride) ?? null
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`rides_client_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides', filter: `client_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['activeRide', userId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return { ride: data ?? null, loading: isLoading, error }
}
