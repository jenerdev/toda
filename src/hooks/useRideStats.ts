import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { RideStats } from '../types/db'

export type StatsRange = 'all' | '30d'

/**
 * Aggregate ride-outcome counts for the admin Reports section. Admin-only; the
 * `admin_ride_stats` RPC enforces the admin check server-side (0021). Pass a
 * range to window the counts; refetch on demand (no Realtime — stats are read
 * when the admin opens the page or hits refresh).
 */
export function useRideStats(range: StatsRange) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['adminRideStats', range],
    queryFn: async (): Promise<RideStats> => {
      const p_from =
        range === '30d' ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() : null
      const { data, error } = await supabase.rpc('admin_ride_stats', { p_from, p_to: null })
      if (error) throw error
      return data as RideStats
    },
  })

  return { stats: data, loading: isLoading, error, refetch, refreshing: isFetching }
}
