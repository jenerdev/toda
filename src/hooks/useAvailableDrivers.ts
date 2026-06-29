import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Live count of drivers who are online AND available right now, kept fresh via
 * Realtime on driver_states. Mirrors dispatch's liveness rule (ignores drivers
 * whose heartbeat is stale > 60s) so the count reflects who could actually be
 * offered a ride. Used by the commuter's "notify me when a driver's available"
 * watch on the no-drivers screen.
 */
export function useAvailableDrivers() {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['availableDrivers'],
    queryFn: async (): Promise<number> => {
      const freshSince = new Date(Date.now() - 60_000).toISOString()
      const { count, error } = await supabase
        .from('driver_states')
        .select('driver_id', { count: 'exact', head: true })
        .eq('is_online', true)
        .eq('availability', 'available')
        .gte('updated_at', freshSince)
      if (error) throw error
      return count ?? 0
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('available_drivers_watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_states' },
        () => qc.invalidateQueries({ queryKey: ['availableDrivers'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])

  return data ?? 0
}
