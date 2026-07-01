import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { notifyIfRateLimited } from '../lib/snackbar'
import type { Message } from '../types/db'

/** Chat messages for a ride, kept live via Realtime, with a sender. */
export function useMessages(rideId: string | undefined, senderId: string | undefined) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['messages', rideId],
    enabled: Boolean(rideId),
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, ride_id, sender_id, body, created_at')
        .eq('ride_id', rideId!)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Message[]
    },
  })

  useEffect(() => {
    if (!rideId) return
    const channel = supabase
      .channel(`messages_${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` },
        () => qc.invalidateQueries({ queryKey: ['messages', rideId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [rideId, qc])

  async function send(body: string) {
    const text = body.trim()
    if (!text || !rideId || !senderId) return
    const { error } = await supabase
      .from('messages')
      .insert({ ride_id: rideId, sender_id: senderId, body: text })
    if (error) {
      // Rate-limited (migration 0029): tell the user via snackbar and stop —
      // don't throw, so the chat input doesn't surface a raw error.
      if (notifyIfRateLimited(error)) return
      throw error
    }
    await qc.invalidateQueries({ queryKey: ['messages', rideId] })
  }

  return { messages: data ?? [], loading: isLoading, send }
}
