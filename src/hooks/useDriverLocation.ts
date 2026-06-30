import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface DriverLocation {
  lat: number | null
  lng: number | null
  updatedAt: string | null
}

/**
 * The assigned driver's live coordinates, kept fresh via Realtime.
 *
 * Reads the private `driver_locations` table (0027): its participant-scoped RLS
 * returns the row only to the driver and to the commuter on that driver's active
 * ride, so a driver's GPS is never exposed to unrelated users — over query OR
 * Realtime. driver_states no longer holds location.
 */
export function useDriverLocation(driverId: string | null | undefined) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['driverLocation', driverId],
    enabled: Boolean(driverId),
    // Poll as a fallback so the marker still updates even if a realtime event is missed.
    refetchInterval: 5_000,
    queryFn: async (): Promise<DriverLocation> => {
      const { data, error } = await supabase
        .from('driver_locations')
        .select('lat, lng, updated_at')
        .eq('driver_id', driverId!)
        .maybeSingle()
      if (error) throw error
      return {
        lat: data?.lat ?? null,
        lng: data?.lng ?? null,
        updatedAt: data?.updated_at ?? null,
      }
    },
  })

  useEffect(() => {
    if (!driverId) return
    // Scope the subscription to this one driver. RLS already restricts delivery
    // to authorized participants, so this only narrows traffic, not access.
    const channel = supabase
      .channel(`driver_loc_${driverId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        () => qc.invalidateQueries({ queryKey: ['driverLocation', driverId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [driverId, qc])

  return data ?? { lat: null, lng: null, updatedAt: null }
}
