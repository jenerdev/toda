import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Renewal } from '../types/db'

/** A pending renewal joined with the submitting user's profile, for the admin queue. */
export interface PendingRenewal extends Renewal {
  user: { full_name: string | null; phone: string | null; subscription_until: string | null } | null
}

/**
 * All pending renewals (oldest first), kept live via Realtime. Admin-only;
 * relies on the admin RLS read policies on `renewals` + `profiles` (0010).
 */
export function useAdminRenewals() {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['adminRenewals'],
    queryFn: async (): Promise<PendingRenewal[]> => {
      const { data, error } = await supabase
        .from('renewals')
        .select('*, user:profiles!renewals_user_id_fkey(full_name, phone, subscription_until)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(200)
      if (error) throw error
      return (data as PendingRenewal[]) ?? []
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('admin_renewals')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'renewals' },
        () => qc.invalidateQueries({ queryKey: ['adminRenewals'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])

  return { renewals: data ?? [], loading: isLoading, error }
}
