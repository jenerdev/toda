import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

// Ping well inside the 60s staleness window that _offer_to_next_driver (0007/0008)
// uses, so a live driver never crosses it (with margin for a slow request).
const HEARTBEAT_MS = 25_000

/**
 * While the driver is online, periodically bump driver_states.updated_at via the
 * driver_heartbeat() RPC. Dispatch (and the queue view) ignore drivers whose
 * updated_at is older than ~60s so a closed tab stops getting offers — but an
 * idle, genuinely-online driver isn't streaming location, so this is what keeps
 * them "fresh" and dispatchable. Without it, an online driver falls out of
 * dispatch after 60s and commuters see "no available driver".
 */
export function useDriverHeartbeat(online: boolean) {
  useEffect(() => {
    if (!online) return
    let cancelled = false
    const ping = async () => {
      const { error } = await supabase.rpc('driver_heartbeat')
      // Surface a missing/failed RPC instead of silently going stale — the most
      // common cause of "driver online but not offered rides" (e.g. migration
      // 0007, which defines driver_heartbeat(), not applied).
      if (error) console.error('[MotoQueue] driver_heartbeat failed:', error.message)
    }
    void ping() // fire immediately so a freshly-online driver is fresh right away
    const t = setInterval(() => {
      if (!cancelled) void ping()
    }, HEARTBEAT_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [online])
}
