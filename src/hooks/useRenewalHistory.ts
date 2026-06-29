import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Renewal } from '../types/db'

/**
 * A user's full renewal history (most recent first), kept live via Realtime so a
 * 'pending' row flips to 'approved'/'rejected' in place. Reads via the
 * renewals_select_own RLS. (useMyRenewal returns only the latest, for gating UI.)
 */
export function useRenewalHistory(userId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['renewalHistory', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Renewal[]> => {
      const { data, error } = await supabase
        .from('renewals')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return (data as Renewal[]) ?? []
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`history_renewals_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'renewals', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['renewalHistory', userId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return { renewals: data ?? [], loading: isLoading }
}
