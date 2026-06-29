import { useEffect, useRef, useState } from 'react'
import type { IncomingOffer } from '../hooks/useIncomingOffer'
import { OFFER_TIMEOUT_SECONDS } from '../types/db'
import { RouteMap } from './RouteMap'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useRoute } from '../hooks/useRoute'
import { formatDistance, formatEta } from '../lib/geo'

/**
 * Incoming ride offer for a driver, with a live countdown.
 * Letting the timer hit zero auto-declines, so the next driver gets it.
 */
export function OfferCard({
  offer,
  onAccept,
  onDecline,
  busy,
}: {
  offer: IncomingOffer
  onAccept: () => void
  onDecline: (auto: boolean) => void
  busy: boolean
}) {
  const offeredMs = new Date(offer.offer.offered_at).getTime()
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, OFFER_TIMEOUT_SECONDS - Math.floor((Date.now() - offeredMs) / 1000)),
  )
  const firedTimeout = useRef(false)

  useEffect(() => {
    const t = setInterval(() => {
      const left = Math.max(0, OFFER_TIMEOUT_SECONDS - Math.floor((Date.now() - offeredMs) / 1000))
      setRemaining(left)
      if (left <= 0 && !firedTimeout.current) {
        firedTimeout.current = true
        onDecline(true) // auto-decline on timeout
      }
    }, 250)
    return () => clearInterval(t)
  }, [offeredMs, onDecline])

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')

  // Estimate how far the pickup is from the driver (one-shot GPS + route).
  const pickup = { lat: offer.ride.pickup_lat, lng: offer.ride.pickup_lng }
  const me = useCurrentPosition()
  const route = useRoute(me, pickup)
  const distanceLabel = me
    ? `~${formatDistance(route.distanceM)} from you` +
      (route.durationS ? ` · ${formatEta(route.durationS)}` : '')
    : undefined

  return (
    <div className="rounded-xl border-2 border-brand bg-white p-4 shadow-lg">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-brand-dark">🔔 New ride request!</span>
        <span className="font-mono text-sm text-gray-500">
          ⏱ {mins}:{secs}
        </span>
      </div>
      <p className="mb-1 text-sm font-medium text-gray-800">
        Pickup: {offer.ride.pickup_address || 'Pinned location'}
      </p>
      {distanceLabel && (
        <p className="mb-2 text-xs font-medium text-gray-600">📍 Pickup {distanceLabel} (est.)</p>
      )}
      <div className="mb-4">
        <RouteMap
          driver={me}
          pickup={pickup}
          route={route.positions}
          waitingHint="Allow location to see your distance to the pickup."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onDecline(false)}
          disabled={busy}
          className="rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          disabled={busy}
          className="rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : 'Accept'}
        </button>
      </div>
    </div>
  )
}
