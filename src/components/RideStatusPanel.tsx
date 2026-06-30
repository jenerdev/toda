import { useCounterpart } from '../hooks/useCounterpart'
import { LiveTrackMap } from './LiveTrackMap'
import { Chat } from './Chat'
import { NoDriversPanel } from './NoDriversPanel'
import { FareApprovalPanel } from './FareApprovalPanel'
import { FareBreakdown } from './FareBreakdown'
import { RouteSummary } from './RouteSummary'
import type { Ride } from '../types/db'

// One-tap canned replies for the commuter.
const COMMUTER_QUICK_REPLIES = ['Saan na po kayo?', 'Ingat po!', 'Wait lang po!', 'Salamat po!']

/** Commuter's view of their active ride: searching → driver on the way → (no drivers). */
export function RideStatusPanel({
  ride,
  onCancel,
  cancelling,
  onCancelAccepted,
  onComplete,
  completing,
  onRebook,
  rebooking,
  onApproveSurcharge,
  onRejectSurcharge,
  surchargeBusy,
}: {
  ride: Ride
  onCancel: () => void
  cancelling: boolean
  onCancelAccepted: () => void
  onComplete: () => void
  completing: boolean
  onRebook: () => void
  rebooking: boolean
  onApproveSurcharge: () => void
  onRejectSurcharge: () => void
  surchargeBusy: boolean
}) {
  const matched = ride.status === 'accepted' || ride.status === 'enroute'
  const { data: driver } = useCounterpart(ride.id, matched)

  if (ride.status === 'searching') {
    // A driver proposed a fare and/or pickup surcharge — needs the commuter's approval.
    if ((ride.pending_fare ?? 0) > 0 || (ride.pending_surcharge ?? 0) > 0) {
      return (
        <FareApprovalPanel
          fare={ride.pending_fare ?? 0}
          surcharge={ride.pending_surcharge ?? 0}
          onApprove={onApproveSurcharge}
          onReject={onRejectSurcharge}
          busy={surchargeBusy}
        />
      )
    }
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        <p className="font-medium text-gray-800">Finding you a driver…</p>
        <div className="mt-4 flex justify-center text-left">
          <RouteSummary pickup={ride.pickup_address} destination={ride.destination} />
        </div>
        <button
          onClick={onCancel}
          disabled={cancelling}
          className="mt-4 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    )
  }

  if (ride.status === 'no_drivers') {
    return <NoDriversPanel onTryAgain={onCancel} onRebook={onRebook} rebooking={rebooking} />
  }

  // accepted / enroute
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border bg-white p-6 text-center">
        <p className="text-2xl">✅</p>
        <p className="mt-1 text-lg font-semibold text-brand-dark">
          {driver?.full_name ? `${driver.full_name} is on the way!` : 'Driver is on the way!'}
        </p>
        {driver?.phone && (
          <a
            href={`tel:${driver.phone}`}
            className="mt-2 inline-block rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand-dark hover:bg-brand/5"
          >
            📞 {driver.phone}
          </a>
        )}
        <div className="mt-3 flex justify-center text-left">
          <RouteSummary pickup={ride.pickup_address} destination={ride.destination} />
        </div>
        <FareBreakdown fare={ride.fare} surcharge={ride.surcharge} className="mt-3 text-left" />
      </div>

      <LiveTrackMap
        driverId={ride.driver_id}
        pickup={{ lat: ride.pickup_lat, lng: ride.pickup_lng }}
      />

      <Chat rideId={ride.id} quickReplies={COMMUTER_QUICK_REPLIES} />

      <button
        onClick={onComplete}
        disabled={completing}
        className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
      >
        {completing ? 'Completing…' : 'Ride complete'}
      </button>
      <p className="-mt-1 text-center text-xs text-gray-400">Pay your driver the fare in cash.</p>

      <button
        onClick={onCancelAccepted}
        disabled={cancelling}
        className="w-full rounded-lg border border-red-300 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60"
      >
        Cancel ride
      </button>
    </div>
  )
}
