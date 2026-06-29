import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { DriverApplication } from '../types/db'

/** A pending driver application joined with the driver's profile, for the admin queue. */
export interface PendingApplication extends DriverApplication {
  driver: { full_name: string | null; phone: string | null } | null
}

/**
 * All pending driver applications (oldest first), kept live via Realtime.
 * Admin-only; relies on the admin RLS read policies on driver_applications +
 * profiles (0010/0011).
 */
export function useAdminDriverApplications() {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['adminDriverApplications'],
    queryFn: async (): Promise<PendingApplication[]> => {
      const { data, error } = await supabase
        .from('driver_applications')
        .select('*, driver:profiles!driver_applications_driver_id_fkey(full_name, phone)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: true })
      if (error) throw error
      return (data as PendingApplication[]) ?? []
    },
  })

  useEffect(() => {
    const channel = supabase
      .channel('admin_driver_applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_applications' },
        () => qc.invalidateQueries({ queryKey: ['adminDriverApplications'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])

  return { applications: data ?? [], loading: isLoading, error }
}
