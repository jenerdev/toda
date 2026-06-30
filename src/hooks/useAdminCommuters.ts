import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface AdminCommuter {
  id: string
  full_name: string | null
  phone: string | null
  subscription_until: string | null
}

/**
 * All commuters, for the admin roster. Admin-only (profiles_select_admin RLS).
 * Read on open / manual refresh — commuter records change rarely, so no poll
 * and no Realtime subscription.
 */
export function useAdminCommuters() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['adminCommuters'],
    queryFn: async (): Promise<AdminCommuter[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, phone, subscription_until')
        .eq('role', 'commuter')
        .order('full_name', { ascending: true })
      if (error) throw error
      return (data as AdminCommuter[]) ?? []
    },
  })

  return { commuters: data ?? [], loading: isLoading, error, refetch, refreshing: isFetching }
}
