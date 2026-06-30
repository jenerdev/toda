import { useEffect, useRef, useState } from 'react'
import type { IncomingOffer } from '../hooks/useIncomingOffer'
import { OFFER_TIMEOUT_SECONDS } from '../types/db'
import { RouteMap } from './RouteMap'
import { RouteSummary } from './RouteSummary'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useRoute } from '../hooks/useRoute'
import { formatDistance, formatEta } from '../lib/geo'
import { FARE_PRESETS, FARE_STEP, FARE_MAX, FARE_DRIVER_NOTE } from '../lib/fare'

/**
 * Incoming ride offer for a driver, with a live countdown.
 * Letting the timer hit zero auto-declines, so the next driver gets it.
 * Before accepting the driver may propose a single cash fare for the whole trip
 * (they fold in any extra for a far pickup themselves); if it's > 0 the commuter
 * must approve — while that's pending the card shows a waiting state.
 */
export function OfferCard({
  offer,
  onAccept,
  onDecline,
  busy,
}: {
  offer: IncomingOffer
  onAccept: (fare: number) => void
  onDecline: (auto: boolean) => void
  busy: boolean
}) {
  const isAwaiting = offer.offer.status === 'awaiting_approval'
  const offeredMs = new Date(offer.offer.offered_at).getTime()
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, OFFER_TIMEOUT_SECONDS - Math.floor((Date.now() - offeredMs) / 1000)),
  )
  const firedTimeout = useRef(false)
  const [fare, setFare] = useState(0)

  useEffect(() => {
    if (isAwaiting) return // the rider is deciding — don't auto-decline
    const t = setInterval(() => {
      const left = Math.max(0, OFFER_TIMEOUT_SECONDS - Math.floor((Date.now() - offeredMs) / 1000))
      setRemaining(left)
      if (left <= 0 && !firedTimeout.current) {
        firedTimeout.current = true
        onDecline(true) // auto-decline on timeout
      }
    }, 250)
    return () => clearInterval(t)
  }, [offeredMs, onDecline, isAwaiting])

  // Estimate how far the pickup is from the driver (one-shot GPS + route).
  const pickup = { lat: offer.ride.pickup_lat, lng: offer.ride.pickup_lng }
  const me = useCurrentPosition()
  const route = useRoute(me, pickup)

  // Waiting for the commuter to approve the proposed fare.
  if (isAwaiting) {
    const pending = (offer.ride.pending_fare ?? 0) + (offer.ride.pending_surcharge ?? 0)
    return (
      <div className="rounded-xl border-2 border-brand bg-white p-4 text-center shadow-lg">
        <p className="font-semibold text-brand-dark">⏳ Waiting for rider…</p>
        <p className="mt-1 text-sm text-gray-600">
          You proposed <span className="font-semibold">₱{pending}</span>. Waiting for the rider to
          approve.
        </p>
        <div className="mx-auto mt-3 h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
      </div>
    )
  }

  const mins = Math.floor(remaining / 60)
  const secs = String(remaining % 60).padStart(2, '0')
  const distanceLabel = me
    ? `~${formatDistance(route.distanceM)} from you` +
      (route.durationS ? ` · ${formatEta(route.durationS)}` : '')
    : undefined
  // Which preset chip reads as "selected": the largest preset ≤ the current
  // amount, so values bumped past the top preset (via +N) keep it highlighted.
  const topFare = FARE_PRESETS[FARE_PRESETS.length - 1]
  const selectedFare = Math.min(fare, topFare)

  return (
    <div className="rounded-xl border-2 border-brand bg-white p-4 shadow-lg">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-semibold text-brand-dark">🔔 New ride request!</span>
        <span className="font-mono text-sm text-gray-500">
          ⏱ {mins}:{secs}
        </span>
      </div>
      <RouteSummary
        pickup={offer.ride.pickup_address}
        destination={offer.ride.destination}
        className="mb-2"
      />
      {distanceLabel && (
        <p className="mb-2 text-xs font-medium text-gray-600">📍 Pickup {distanceLabel} (est.)</p>
      )}
      <div className="mb-3">
        <RouteMap
          driver={me}
          pickup={pickup}
          route={route.positions}
          waitingHint="Allow location to see your distance to the pickup."
        />
      </div>

      {/* Single cash fare for the whole trip (include any extra for a far pickup). */}
      <div className="mb-3 rounded-lg bg-gray-50 p-2">
        <p className="mb-1.5 text-[11px] leading-snug text-gray-600">{FARE_DRIVER_NOTE}</p>
        <div className="flex gap-1">
          {FARE_PRESETS.map((amt) => (
            <button
              key={amt}
              type="button"
              onClick={() => setFare(amt)}
              className={
                'flex-1 rounded-md py-1.5 text-sm font-semibold transition ' +
                (selectedFare === amt
                  ? 'bg-brand text-white'
                  : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
              }
            >
              {amt === 0 ? 'None' : `₱${amt}`}
            </button>
          ))}
          <button
            type="button"
            aria-label={`Add ${FARE_STEP} to the fare`}
            onClick={() => setFare((f) => Math.min(FARE_MAX, f + FARE_STEP))}
            disabled={fare >= FARE_MAX}
            className="flex-1 rounded-md border border-gray-300 bg-white py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
          >
            +{FARE_STEP}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onDecline(false)}
          disabled={busy}
          className="w-full rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          Decline
        </button>
        <button
          onClick={() => onAccept(fare)}
          disabled={busy}
          className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : fare > 0 ? `Request ₱${fare} & accept` : 'Accept'}
        </button>
      </div>
    </div>
  )
}
