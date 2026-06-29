import { useEffect, useRef, useState } from 'react'
import type { IncomingOffer } from '../hooks/useIncomingOffer'
import { OFFER_TIMEOUT_SECONDS } from '../types/db'
import { RouteMap } from './RouteMap'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useRoute } from '../hooks/useRoute'
import { formatDistance, formatEta } from '../lib/geo'
import { SURCHARGE_OPTIONS, SURCHARGE_MIN_DISTANCE_M, SURCHARGE_DRIVER_NOTE } from '../lib/surcharge'

/**
 * Incoming ride offer for a driver, with a live countdown.
 * Letting the timer hit zero auto-declines, so the next driver gets it.
 * On a far pickup (≥1km) the driver may attach a distance surcharge, which the
 * commuter must approve — while that's pending the card shows a waiting state.
 */
export function OfferCard({
  offer,
  onAccept,
  onDecline,
  busy,
}: {
  offer: IncomingOffer
  onAccept: (surcharge: number) => void
  onDecline: (auto: boolean) => void
  busy: boolean
}) {
  const isAwaiting = offer.offer.status === 'awaiting_approval'
  const offeredMs = new Date(offer.offer.offered_at).getTime()
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, OFFER_TIMEOUT_SECONDS - Math.floor((Date.now() - offeredMs) / 1000)),
  )
  const firedTimeout = useRef(false)
  const [surcharge, setSurcharge] = useState(0)

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

  // Waiting for the commuter to approve a requested surcharge.
  if (isAwaiting) {
    return (
      <div className="rounded-xl border-2 border-brand bg-white p-4 text-center shadow-lg">
        <p className="font-semibold text-brand-dark">⏳ Waiting for rider…</p>
        <p className="mt-1 text-sm text-gray-600">
          You requested <span className="font-semibold">+₱{offer.ride.pending_surcharge ?? 0}</span>.
          Waiting for the rider to approve.
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
  const canSurcharge = me != null && route.distanceM >= SURCHARGE_MIN_DISTANCE_M
  const effectiveSurcharge = canSurcharge ? surcharge : 0

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
      <div className="mb-3">
        <RouteMap
          driver={me}
          pickup={pickup}
          route={route.positions}
          waitingHint="Allow location to see your distance to the pickup."
        />
      </div>

      {canSurcharge && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2">
          <p className="mb-1.5 text-[11px] leading-snug text-amber-700">{SURCHARGE_DRIVER_NOTE}</p>
          <div className="flex gap-1">
            {SURCHARGE_OPTIONS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setSurcharge(amt)}
                className={
                  'flex-1 rounded-md py-1.5 text-sm font-semibold transition ' +
                  (surcharge === amt
                    ? 'bg-brand text-white'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
                }
              >
                {amt === 0 ? 'None' : `+₱${amt}`}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onDecline(false)}
          disabled={busy}
          className="rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          Decline
        </button>
        <button
          onClick={() => onAccept(effectiveSurcharge)}
          disabled={busy}
          className="rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : effectiveSurcharge > 0 ? `Request +₱${effectiveSurcharge} & accept` : 'Accept'}
        </button>
      </div>
    </div>
  )
}
