import { useEffect, useRef, useState } from 'react'
import type { IncomingOffer } from '../hooks/useIncomingOffer'
import { OFFER_TIMEOUT_SECONDS } from '../types/db'
import { RouteMap } from './RouteMap'
import { RouteSummary } from './RouteSummary'
import { FareBreakdown } from './FareBreakdown'
import { useCurrentPosition } from '../hooks/useCurrentPosition'
import { useRoute } from '../hooks/useRoute'
import { formatDistance, formatEta } from '../lib/geo'
import {
  SURCHARGE_PRESETS,
  SURCHARGE_STEP,
  SURCHARGE_MAX,
  SURCHARGE_MIN_DISTANCE_M,
  SURCHARGE_DRIVER_NOTE,
} from '../lib/surcharge'
import { FARE_PRESETS, FARE_STEP, FARE_MAX, FARE_DRIVER_NOTE } from '../lib/fare'

/**
 * Incoming ride offer for a driver, with a live countdown.
 * Letting the timer hit zero auto-declines, so the next driver gets it.
 * Before accepting the driver may propose a trip fare (pickup → destination) and,
 * on a far pickup (≥200m), a distance surcharge; if either is set the commuter
 * must approve — while that's pending the card shows a waiting state.
 */
export function OfferCard({
  offer,
  onAccept,
  onDecline,
  busy,
}: {
  offer: IncomingOffer
  onAccept: (surcharge: number, fare: number) => void
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

  // Waiting for the commuter to approve the proposed fare/surcharge.
  if (isAwaiting) {
    const pendingTotal = (offer.ride.pending_fare ?? 0) + (offer.ride.pending_surcharge ?? 0)
    return (
      <div className="rounded-xl border-2 border-brand bg-white p-4 text-center shadow-lg">
        <p className="font-semibold text-brand-dark">⏳ Waiting for rider…</p>
        <p className="mt-1 text-sm text-gray-600">
          You proposed <span className="font-semibold">₱{pendingTotal}</span>. Waiting for the rider
          to approve.
        </p>
        <FareBreakdown
          fare={offer.ride.pending_fare}
          surcharge={offer.ride.pending_surcharge}
          className="mx-auto mt-3 max-w-[220px] text-left"
        />
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
  const total = fare + effectiveSurcharge
  // Which preset chip reads as "selected": the largest preset ≤ the current
  // amount, so values bumped past the top preset (via +N) keep it highlighted.
  const topSurcharge = SURCHARGE_PRESETS[SURCHARGE_PRESETS.length - 1]
  const selectedSurcharge = Math.min(surcharge, topSurcharge)
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

      {/* Trip fare (pickup → destination) — always proposable. */}
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

      {/* Pickup surcharge — only when the pickup is far enough (≥200m). */}
      {canSurcharge && (
        <div className="mb-3 rounded-lg bg-amber-50 p-2">
          <p className="mb-1.5 text-[11px] leading-snug text-amber-700">{SURCHARGE_DRIVER_NOTE}</p>
          <div className="flex gap-1">
            {SURCHARGE_PRESETS.map((amt) => (
              <button
                key={amt}
                type="button"
                onClick={() => setSurcharge(amt)}
                className={
                  'flex-1 rounded-md py-1.5 text-sm font-semibold transition ' +
                  (selectedSurcharge === amt
                    ? 'bg-brand text-white'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
                }
              >
                {amt === 0 ? 'None' : `₱${amt}`}
              </button>
            ))}
            <button
              type="button"
              aria-label="Add 5 to the surcharge"
              onClick={() => setSurcharge((s) => Math.min(SURCHARGE_MAX, s + SURCHARGE_STEP))}
              disabled={surcharge >= SURCHARGE_MAX}
              className="flex-1 rounded-md border border-gray-300 bg-white py-1.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-40"
            >
              +5
            </button>
          </div>
        </div>
      )}

      {/* Live breakdown of what the rider will be asked to approve. */}
      <FareBreakdown fare={fare} surcharge={effectiveSurcharge} className="mb-3" />

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onDecline(false)}
          disabled={busy}
          className="w-full rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
        >
          Decline
        </button>
        <button
          onClick={() => onAccept(effectiveSurcharge, fare)}
          disabled={busy}
          className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : total > 0 ? `Request ₱${total} & accept` : 'Accept'}
        </button>
      </div>
    </div>
  )
}
