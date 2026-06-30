import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

/**
 * Tracks whether the Supabase Realtime socket has dropped *while we have active
 * subscriptions* — i.e. when live updates (queue, offers, ride status, chat,
 * driver location) have silently stopped flowing.
 *
 * The realtime client in this version exposes no public open/close events, so
 * we poll its connection state. The poll is a cheap in-memory check
 * (`rt.isConnected()`) with no network/backend cost; we still keep the interval
 * modest (5s) to limit churn. On recovery we refetch all queries so the UI
 * catches up on anything missed during the outage. Returns `true` while down.
 */
export function useRealtimeStatus(): boolean {
  const qc = useQueryClient()
  const [disconnected, setDisconnected] = useState(false)

  useEffect(() => {
    const rt = supabase.realtime
    let hasConnected = false
    let wasDown = false

    const check = () => {
      const open = rt.isConnected()
      if (open) hasConnected = true
      // Only a real problem if we expect live data (channels exist) and the
      // socket has connected before but isn't open now.
      const expecting = rt.channels.length > 0
      const down = hasConnected && expecting && !open

      if (wasDown && !down) {
        // Reconnected — pull fresh data for everything that may have gone stale.
        void qc.invalidateQueries()
      }
      wasDown = down
      setDisconnected(down)
    }

    check()
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [qc])

  return disconnected
}
