import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Counterpart {
  full_name: string | null
  phone: string | null
}

/** The other party's name + phone for a ride (via the get_counterpart RPC). */
export function useCounterpart(rideId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['counterpart', rideId],
    enabled: Boolean(rideId) && enabled,
    queryFn: async (): Promise<Counterpart | null> => {
      const { data, error } = await supabase.rpc('get_counterpart', { p_ride_id: rideId })
      if (error) throw error
      return (data as Counterpart) ?? null
    },
  })
}
