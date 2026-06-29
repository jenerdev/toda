import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Ride } from '../types/db'

/** The ride a driver is currently assigned to (accepted / enroute), kept live. */
export function useDriverActiveRide(userId: string | undefined) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['driverActiveRide', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Ride | null> => {
      const { data, error } = await supabase
        .from('rides')
        .select('*')
        .eq('driver_id', userId!)
        .in('status', ['accepted', 'enroute'])
        .order('accepted_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as Ride) ?? null
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`rides_driver_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides', filter: `driver_id=eq.${userId}` },
        () => {
          qc.invalidateQueries({ queryKey: ['driverActiveRide', userId] })
          qc.invalidateQueries({ queryKey: ['driverQueue'] })
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return data ?? null
}
