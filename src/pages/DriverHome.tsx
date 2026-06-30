import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { useDriverQueue } from '../hooks/useDriverQueue'
import { useIncomingOffer } from '../hooks/useIncomingOffer'
import { useDriverActiveRide } from '../hooks/useDriverActiveRide'
import { useDriverLocationPublisher } from '../hooks/useDriverLocationPublisher'
import { useDriverHeartbeat } from '../hooks/useDriverHeartbeat'
import { useMyDriverApplication } from '../hooks/useMyDriverApplication'
import { QueueStatus } from '../components/QueueStatus'
import { RideAlertsToggle } from '../components/RideAlertsToggle'
import { Loading, ErrorState } from '../components/States'
import { OfferCard } from '../components/OfferCard'
import { TripPanel } from '../components/TripPanel'
import { RenewPanel } from '../components/RenewPanel'
import { CancelReasonModal } from '../components/CancelReasonModal'
import { NoticeModal } from '../components/NoticeModal'
import { DriverVerificationPanel } from '../components/DriverVerificationPanel'
import { supabase } from '../lib/supabase'
import { accessState } from '../lib/subscription'

// One-tap reasons a driver can attach when cancelling an accepted trip.
const DRIVER_CANCEL_REASONS = [
  'Pickup location too far',
  'Destination is too far',
  "I don't know the destination",
  'Agreed fare is too low',
  'Cannot find the commuter',
]

export default function DriverHome() {
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const {
    available,
    onlineCount,
    isOnline,
    myAvailability,
    myPosition,
    loading,
    error: queueError,
    goOnline,
    goOffline,
  } = useDriverQueue(user?.id)
  const offer = useIncomingOffer(user?.id)
  const activeRide = useDriverActiveRide(user?.id)
  const { application, loading: appLoading } = useMyDriverApplication(user?.id)
  const approved = application?.status === 'approved'

  // Stream GPS to the rider while on a trip.
  const {
    status: locationStatus,
    coords: driverCoords,
    accuracy: locationAccuracy,
    syncError: locationSyncError,
  } = useDriverLocationPublisher(Boolean(activeRide))

  // Keep the driver "fresh" so dispatch's stale-tab filter doesn't drop them.
  useDriverHeartbeat(isOnline)

  const [busy, setBusy] = useState(false)
  const [offerBusy, setOfferBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Confirm modal for cancelling an accepted trip (replaces window.confirm).
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  // When an offer times out (auto-decline), tell the driver they missed it —
  // holds the pickup of the missed ride, null when the notice is dismissed.
  const [missedPickup, setMissedPickup] = useState<string | null>(null)
  // When the rider declines (or lets lapse) a fare the driver proposed, tell the
  // driver — holds the declined amount (₱) + the rider's reason, null when dismissed.
  const [declined, setDeclined] = useState<{ amount: number; reason: string | null } | null>(null)
  // The amount the driver proposed while awaiting approval, keyed by offer id, so
  // a later 'declined' event on that offer can name it. Populated from the offer.
  const proposalRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (offer?.offer.status === 'awaiting_approval') {
      const total = (offer.ride.pending_fare ?? 0) + (offer.ride.pending_surcharge ?? 0)
      proposalRef.current.set(offer.offer.id, total)
    }
  }, [offer])

  // Watch the driver's own offers: a proposal that flips to 'declined' means the
  // rider rejected (or timed out) the fare; 'accepted' means they approved.
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`fare_decision_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'ride_offers', filter: `driver_id=eq.${user.id}` },
        (payload) => {
          const row = payload.new as { id: string; status: string; decline_reason: string | null }
          const proposals = proposalRef.current
          if (!proposals.has(row.id)) return
          if (row.status === 'declined') {
            setDeclined({ amount: proposals.get(row.id) ?? 0, reason: row.decline_reason ?? null })
            proposals.delete(row.id)
          } else if (row.status === 'accepted' || row.status === 'expired') {
            proposals.delete(row.id) // approved or cancelled — no decline notice
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user?.id])

  async function toggle() {
    setError(null)
    setBusy(true)
    try {
      if (isOnline) await goOffline()
      else await goOnline()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function respond(action: 'accept' | 'decline', auto = false, surcharge = 0, fare = 0) {
    if (!offer) return
    // On auto-timeout we don't want to flip the button spinner / show errors.
    if (!auto) setOfferBusy(true)
    const { error } = await supabase.rpc('respond_offer', {
      p_offer_id: offer.offer.id,
      p_action: action,
      p_surcharge: surcharge,
      p_fare: fare,
    })
    if (!auto) setOfferBusy(false)
    if (error && !auto) setError(error.message)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['incomingOffer', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverActiveRide', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverQueue'] }),
    ])
  }

  // Auto-decline (timeout) vs. an explicit tap: only the timeout needs a notice
  // — on a manual decline the driver already knows. Capture the pickup before
  // the offer is invalidated away so the notice can name it.
  function handleDecline(auto: boolean) {
    if (auto && offer) setMissedPickup(offer.ride.pickup_address || 'your area')
    respond('decline', auto)
  }

  async function cancelTrip(reason: string | null) {
    if (!activeRide) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('cancel_accepted_ride', {
      p_ride_id: activeRide.id,
      p_reason: reason,
    })
    setBusy(false)
    setConfirmingCancel(false)
    if (error) {
      setError(error.message)
      return
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['driverActiveRide', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverQueue'] }),
    ])
  }

  async function complete() {
    if (!activeRide) return
    setBusy(true)
    const { error } = await supabase.rpc('complete_ride', { p_ride_id: activeRide.id })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['driverActiveRide', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverQueue'] }),
    ])
  }

  const onTripCount = onlineCount - available.length
  const { hasAccess } = accessState(profile)

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h2 className="text-xl font-semibold">
        Hi{profile?.full_name ? `, ${profile.full_name}` : ''} 🏍️
      </h2>

      {/* Incoming offer takes over the screen (incoming-call style) so the
          driver focuses on the 2-minute decision. No backdrop-tap dismiss — that
          would silently decline; the only exits are Decline/Accept or the
          timeout (which auto-declines and moves to the next driver). */}
      {offer && !activeRide && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="New ride request"
          className="fixed inset-0 z-[1600] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="max-h-[90vh] w-full max-w-sm overflow-y-auto">
            <OfferCard
              offer={offer}
              busy={offerBusy}
              onAccept={(fare) => respond('accept', false, 0, fare)}
              onDecline={handleDecline}
            />
          </div>
        </div>
      )}

      {/* Active trip */}
      {activeRide && (
        <TripPanel
          ride={activeRide}
          onComplete={complete}
          completing={busy}
          onCancel={() => setConfirmingCancel(true)}
          cancelling={busy}
          locationStatus={locationStatus}
          driverCoords={driverCoords}
          locationAccuracy={locationAccuracy}
          locationSyncError={locationSyncError}
        />
      )}

      <CancelReasonModal
        open={confirmingCancel}
        title="Cancel this trip?"
        reasons={DRIVER_CANCEL_REASONS}
        confirmLabel="Cancel trip"
        busy={busy}
        onConfirm={cancelTrip}
        onClose={() => setConfirmingCancel(false)}
      />

      <NoticeModal
        open={missedPickup !== null}
        emoji="⏱️"
        title="Ride missed"
        message={`The timer ran out, so the ride to ${missedPickup} went to the next driver. Stay online — another request may come soon.`}
        buttonLabel="Got it"
        onClose={() => setMissedPickup(null)}
      />

      <NoticeModal
        open={declined !== null}
        emoji="🙅"
        title="Fare not approved"
        message={
          `The rider didn't approve your ₱${declined?.amount ?? 0} fare` +
          (declined?.reason ? ` — "${declined.reason}"` : '') +
          `. The ride was passed to the next driver. Stay online — another request may come soon.`
        }
        buttonLabel="Got it"
        onClose={() => setDeclined(null)}
      />

      {/* Verification gate: an unapproved driver can't go online. (Enforced
          server-side in driver_go_online too — this is the UX surface.) */}
      {!approved && !activeRide && (
        <DriverVerificationPanel application={application} loading={appLoading} />
      )}

      {/* Subscription gate: an expired driver can't go online. (Enforced
          server-side in driver_go_online too — this is the UX surface.) */}
      {!hasAccess && <RenewPanel />}

      {/* Status + toggle */}
      <div className="rounded-xl border bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <span
            className={
              'inline-block h-2.5 w-2.5 rounded-full ' +
              (isOnline ? 'bg-green-500' : 'bg-gray-300')
            }
          />
          <span className="font-medium">
            {myAvailability === 'on_trip' ? 'On a trip' : isOnline ? 'Online' : 'Offline'}
          </span>
        </div>

        <button
          onClick={toggle}
          disabled={
            busy ||
            myAvailability === 'on_trip' ||
            (!isOnline && (!hasAccess || !approved))
          }
          className={
            'w-full rounded-lg py-2.5 font-semibold text-white transition disabled:opacity-60 ' +
            (isOnline ? 'bg-gray-600 hover:bg-gray-700' : 'bg-brand hover:bg-brand-dark')
          }
        >
          {busy
            ? 'Please wait…'
            : myAvailability === 'on_trip'
              ? 'Finish your trip to change status'
              : isOnline
                ? 'Go offline'
                : 'Go online'}
        </button>

        {!isOnline && (
          <p className="mt-2 text-center text-sm text-gray-400">
            You’re offline — go online to receive rides.
          </p>
        )}

        {error && <p className="mt-2 text-center text-sm text-red-600">{error}</p>}
      </div>

      {/* Web Push opt-in — get offers when the app is closed / phone is locked. */}
      {approved && hasAccess && !activeRide && <RideAlertsToggle userId={user?.id} />}

      {/* Live queue summary (anonymized: counts + your position, no per-driver list) */}
      {loading ? (
        <Loading label="Loading queue…" />
      ) : queueError ? (
        <ErrorState
          message="Couldn’t load the queue."
          onRetry={() => qc.invalidateQueries({ queryKey: ['driverQueue'] })}
        />
      ) : (
        <QueueStatus
          availableCount={available.length}
          onTripCount={onTripCount}
          myPosition={myPosition}
          myAvailability={myAvailability}
          isOnline={isOnline}
        />
      )}
    </div>
  )
}
