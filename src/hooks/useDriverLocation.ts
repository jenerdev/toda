import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DriverLocation {
  lat: number | null
  lng: number | null
  updatedAt: string | null
}

/** The assigned driver's live coordinates, kept fresh via Realtime on driver_states. */
export function useDriverLocation(driverId: string | null | undefined) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['driverLocation', driverId],
    enabled: Boolean(driverId),
    // Poll as a fallback so the marker still updates even if a realtime event is missed.
    refetchInterval: 5_000,
    queryFn: async (): Promise<DriverLocation> => {
      const { data, error } = await supabase
        .from('driver_states')
        .select('last_lat, last_lng, updated_at')
        .eq('driver_id', driverId!)
        .maybeSingle()
      if (error) throw error
      return {
        lat: data?.last_lat ?? null,
        lng: data?.last_lng ?? null,
        updatedAt: data?.updated_at ?? null,
      }
    },
  })

  useEffect(() => {
    if (!driverId) return
    // No column filter — matches the proven queue pattern; we just refetch the
    // one driver's row on any driver_states change.
    const channel = supabase
      .channel(`driver_loc_${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_states' },
        () => qc.invalidateQueries({ queryKey: ['driverLocation', driverId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [driverId, qc])

  return data ?? { lat: null, lng: null, updatedAt: null }
}
