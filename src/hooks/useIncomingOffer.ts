import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Ride, RideOffer } from '../types/db'

export interface IncomingOffer {
  offer: Pick<RideOffer, 'id' | 'ride_id' | 'status' | 'offered_at'>
  ride: Pick<Ride, 'id' | 'pickup_lat' | 'pickup_lng' | 'pickup_address' | 'status' | 'pending_surcharge'>
}

/**
 * The driver's current pending ride offer (if any), kept live via Realtime.
 * The driver can read the offered ride thanks to the rides_select_offered policy.
 */
export function useIncomingOffer(userId: string | undefined) {
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['incomingOffer', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<IncomingOffer | null> => {
      const { data: offers, error } = await supabase
        .from('ride_offers')
        .select('id, ride_id, status, offered_at')
        .eq('driver_id', userId!)
        .in('status', ['pending', 'awaiting_approval'])
        .order('offered_at', { ascending: false })
        .limit(1)
      if (error) throw error
      const offer = offers?.[0]
      if (!offer) return null

      const { data: ride } = await supabase
        .from('rides')
        .select('id, pickup_lat, pickup_lng, pickup_address, status, pending_surcharge')
        .eq('id', offer.ride_id)
        .single()

      // Only surface it if the ride is still up for grabs.
      if (!ride || ride.status !== 'searching') return null
      return { offer, ride } as IncomingOffer
    },
  })

  useEffect(() => {
    if (!userId) return
    const channel = supabase
      .channel(`offers_driver_${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_offers', filter: `driver_id=eq.${userId}` },
        () => qc.invalidateQueries({ queryKey: ['incomingOffer', userId] }),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId, qc])

  return data ?? null
}
