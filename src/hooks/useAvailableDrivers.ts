import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Count of drivers who are online AND available right now. Mirrors dispatch's
 * liveness rule (ignores drivers whose heartbeat is stale > 60s) so the count
 * reflects who could actually be offered a ride. Used by the commuter's "notify
 * me when a driver's available" watch on the no-drivers screen.
 *
 * Polled (every 20s) rather than Realtime-subscribed: a wildcard subscription on
 * driver_states would fan EVERY driver's heartbeat + location write out to EVERY
 * commuter sitting on this screen (~N drivers × M commuters in realtime messages,
 * the single biggest Supabase cost driver). A commuter only needs a coarse "are
 * drivers free yet?" signal while they wait, so a light periodic count is far
 * cheaper and plenty responsive.
 */
export function useAvailableDrivers() {
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
    refetchInterval: 20_000,
  })

  return data ?? 0
}
