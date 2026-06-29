import { useCounterpart } from '../hooks/useCounterpart'
import { Chat } from './Chat'
import { RouteMap } from './RouteMap'
import type { LocPublishStatus } from '../hooks/useDriverLocationPublisher'
import type { Ride } from '../types/db'

// One-tap canned replies for the driver — hands-free messaging while riding.
const DRIVER_QUICK_REPLIES = [
  'Papunta na po!',
  'Malapit na po',
  'Wait lang po!',
  'Andito na po ako!',
  'Saan po kayo banda?',
  'Salamat po!',
]

const LOC_MESSAGE: Record<LocPublishStatus, { text: string; warn: boolean }> = {
  idle: { text: '', warn: false },
  starting: { text: '📡 Getting your location…', warn: false },
  publishing: { text: '📡 Sharing your live location with the rider.', warn: false },
  denied: {
    text: '⚠️ Location blocked — the rider can’t see you. Allow location for this site.',
    warn: true,
  },
  unavailable: {
    text: '⚠️ Location needs HTTPS (or localhost). The rider can’t see your position.',
    warn: true,
  },
  error: { text: '⚠️ Couldn’t read your location. Check GPS/permissions.', warn: true },
}

/** Driver's view once they've accepted a ride, with the complete action. */
export function TripPanel({
  ride,
  onComplete,
  completing,
  onCancel,
  cancelling,
  locationStatus,
  driverCoords,
  locationAccuracy,
}: {
  ride: Ride
  onComplete: () => void
  completing: boolean
  onCancel: () => void
  cancelling: boolean
  locationStatus: LocPublishStatus
  driverCoords: { lat: number; lng: number } | null
  locationAccuracy: number | null
}) {
  const { data: rider } = useCounterpart(ride.id, true)
  const loc = LOC_MESSAGE[locationStatus]
  // A coarse fix (≳100m) means the rider sees you in the wrong spot — almost
  // always iOS "Precise Location" turned off for this site.
  const coarse = locationStatus === 'publishing' && locationAccuracy != null && locationAccuracy > 100

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border-2 border-brand bg-white p-4">
        <p className="font-semibold text-brand-dark">On trip 🛵</p>
        <p className="mt-1 text-sm text-gray-700">Rider: {rider?.full_name ?? 'Commuter'}</p>
        {rider?.phone && (
          <a
            href={`tel:${rider.phone}`}
            className="mt-2 inline-block rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand/5"
          >
            📞 {rider.phone}
          </a>
        )}
        <p className="mt-3 text-sm font-medium text-gray-800">
          Pickup: {ride.pickup_address ?? 'Pinned location'}
        </p>
        {loc.text && (
          <p className={'mt-2 text-xs ' + (loc.warn ? 'text-red-600' : 'text-gray-400')}>
            {loc.text}
          </p>
        )}
        {coarse && (
          <p className="mt-2 text-xs text-amber-600">
            ⚠️ Your location looks approximate (±{Math.round(locationAccuracy!)}m), so the rider may
            see you in the wrong spot. Turn on <span className="font-medium">Precise Location</span>{' '}
            for this site: iOS Settings → Privacy &amp; Security → Location Services → your browser →
            Precise Location.
          </p>
        )}
      </div>

      <RouteMap
        driver={driverCoords}
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
        waitingHint="Getting your location…"
      />

      <Chat rideId={ride.id} quickReplies={DRIVER_QUICK_REPLIES} />

      <button
        onClick={onComplete}
        disabled={completing}
        className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {completing ? 'Completing…' : 'Mark complete'}
      </button>
      <p className="-mt-1 text-center text-xs text-gray-400">
        Collect the fare in cash. Completing returns you to the back of the queue.
      </p>

      <button
        onClick={onCancel}
        disabled={cancelling}
        className="w-full rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        Cancel trip
      </button>
    </div>
  )
}
