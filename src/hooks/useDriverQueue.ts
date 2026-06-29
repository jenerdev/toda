import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Availability } from '../types/db'

export interface QueueEntry {
  driver_id: string
  is_online: boolean
  availability: Availability
  queued_at: string | null
}

/**
 * Live driver queue for the (single) subdivision.
 * - Fetches all online drivers ordered FIFO by queued_at.
 * - Subscribes to Realtime changes on driver_states so every client stays in sync.
 * - Derives the current driver's position among AVAILABLE drivers.
 */
export function useDriverQueue(userId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['driverQueue'],
    queryFn: async (): Promise<QueueEntry[]> => {
      const { data, error } = await supabase
        .from('driver_states')
        .select('driver_id, is_online, availability, queued_at')
        .eq('is_online', true)
        .order('queued_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as QueueEntry[]
    },
  })

  // Keep the list fresh in real time across all open clients.
  useEffect(() => {
    const channel = supabase
      .channel('driver_states_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_states' },
        () => qc.invalidateQueries({ queryKey: ['driverQueue'] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [qc])

  const queue = data ?? []
  const available = queue.filter((d) => d.availability === 'available')
  const myEntry = queue.find((d) => d.driver_id === userId) ?? null
  const myIndex = available.findIndex((d) => d.driver_id === userId)

  async function goOnline() {
    const { error } = await supabase.rpc('driver_go_online')
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['driverQueue'] })
  }

  async function goOffline() {
    const { error } = await supabase.rpc('driver_go_offline')
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['driverQueue'] })
  }

  return {
    queue,
    available,
    onlineCount: queue.length,
    isOnline: Boolean(myEntry?.is_online),
    myAvailability: myEntry?.availability ?? 'offline',
    myPosition: myIndex >= 0 ? myIndex + 1 : null, // 1-based, null if not in the available queue
    loading: isLoading,
    error,
    goOnline,
    goOffline,
  }
}
