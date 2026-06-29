import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Renewal } from '../types/db'

/**
 * The user's most recent renewal submission (if any), kept live via Realtime
 * so a 'pending' flips to 'approved'/'rejected' on the user's screen without a
 * reload.
 */
export function useMyRenewal(userId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['myRenewal', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<Renewal | null> => {
      const { data, error } = await supabase
        .from('renewals')
        .select('*')
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) throw error
      return (data?.[0] as Renewal) ?? null
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`renewals_user_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'renewals', filter: `user_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['myRenewal', userId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return { renewal: data ?? null, loading: isLoading, refetch: () => qc.invalidateQueries({ queryKey: ['myRenewal', userId] }) }
}
