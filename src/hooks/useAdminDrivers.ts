import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Availability } from '../types/db'

export interface AdminDriver {
  id: string
  full_name: string | null
  phone: string | null
  is_online: boolean
  availability: Availability
  updated_at: string | null
}

/**
 * All drivers with their live online / availability state, for the admin roster.
 * Admin-only (profiles_select_admin RLS lets an admin read every profile;
 * driver_states_select_all covers the state rows).
 *
 * Profiles and driver_states are fetched separately and merged by id — simpler
 * and FK-name-agnostic vs an embedded select, and the driver set is small.
 * Polled every 30s so the online/offline split stays current WITHOUT a wildcard
 * driver_states Realtime subscription (which would fan every driver heartbeat
 * out to the admin tab — the exact cost driver we removed elsewhere).
 */
export function useAdminDrivers() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['adminDrivers'],
    queryFn: async (): Promise<AdminDriver[]> => {
      const [profilesRes, statesRes] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, full_name, phone')
          .eq('role', 'driver')
          .order('full_name', { ascending: true }),
        supabase.from('driver_states').select('driver_id, is_online, availability, updated_at'),
      ])
      if (profilesRes.error) throw profilesRes.error
      if (statesRes.error) throw statesRes.error

      const states = new Map((statesRes.data ?? []).map((s) => [s.driver_id, s]))
      return (profilesRes.data ?? []).map((p) => {
        const s = states.get(p.id)
        return {
          id: p.id,
          full_name: p.full_name,
          phone: p.phone,
          is_online: s?.is_online ?? false,
          availability: (s?.availability ?? 'offline') as Availability,
          updated_at: s?.updated_at ?? null,
        }
      })
    },
    refetchInterval: 30_000,
  })

  return { drivers: data ?? [], loading: isLoading, error, refetch, refreshing: isFetching }
}
