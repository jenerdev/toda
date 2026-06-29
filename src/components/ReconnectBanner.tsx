import { useRealtimeStatus } from '../hooks/useRealtimeStatus'

/**
 * Top banner shown when the realtime connection has dropped, so users know the
 * live data (queue, offers, ride status, chat, driver location) is paused
 * rather than silently staring at stale state. Auto-hides on reconnect.
 */
export function ReconnectBanner() {
  const disconnected = useRealtimeStatus()
  if (!disconnected) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[1100] mx-auto w-full max-w-md p-2">
      <div className="flex items-center justify-center gap-2 rounded-b-lg bg-amber-500 px-3 py-1.5 text-sm font-medium text-white shadow-md">
        <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-white" />
        Reconnecting… live updates paused
      </div>
    </div>
  )
}
