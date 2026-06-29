import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { DriverApplication } from '../types/db'

/**
 * The current driver's verification application (if any), kept live via Realtime
 * so an admin's approve/reject flips the driver's screen without a reload.
 * Returns null if they've never submitted. Reads via driver_applications_select_own.
 */
export function useMyDriverApplication(userId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['myDriverApplication', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<DriverApplication | null> => {
      const { data, error } = await supabase
        .from('driver_applications')
        .select('*')
        .eq('driver_id', userId!)
        .maybeSingle()
      if (error) throw error
      return (data as DriverApplication) ?? null
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`driver_app_${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'driver_applications',
          filter: `driver_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ['myDriverApplication', userId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return { application: data ?? null, loading: isLoading }
}
