import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { useDriverQueue } from '../hooks/useDriverQueue'
import { useIncomingOffer } from '../hooks/useIncomingOffer'
import { useDriverActiveRide } from '../hooks/useDriverActiveRide'
import { useDriverLocationPublisher } from '../hooks/useDriverLocationPublisher'
import { useDriverHeartbeat } from '../hooks/useDriverHeartbeat'
import { useMyDriverApplication } from '../hooks/useMyDriverApplication'
import { QueueStatus } from '../components/QueueStatus'
import { OfferCard } from '../components/OfferCard'
import { TripPanel } from '../components/TripPanel'
import { RenewPanel } from '../components/RenewPanel'
import { DriverVerificationPanel } from '../components/DriverVerificationPanel'
import { supabase } from '../lib/supabase'
import { accessState } from '../lib/subscription'

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
    goOnline,
    goOffline,
  } = useDriverQueue(user?.id)
  const offer = useIncomingOffer(user?.id)
  const activeRide = useDriverActiveRide(user?.id)
  const { application, loading: appLoading } = useMyDriverApplication(user?.id)
  const approved = application?.status === 'approved'

  // Stream GPS to the rider while on a trip.
  const { status: locationStatus, coords: driverCoords } =
    useDriverLocationPublisher(Boolean(activeRide))

  // Keep the driver "fresh" so dispatch's stale-tab filter doesn't drop them.
  useDriverHeartbeat(isOnline)

  const [busy, setBusy] = useState(false)
  const [offerBusy, setOfferBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function respond(action: 'accept' | 'decline', auto = false) {
    if (!offer) return
    // On auto-timeout we don't want to flip the button spinner / show errors.
    if (!auto) setOfferBusy(true)
    const { error } = await supabase.rpc('respond_offer', {
      p_offer_id: offer.offer.id,
      p_action: action,
    })
    if (!auto) setOfferBusy(false)
    if (error && !auto) setError(error.message)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['incomingOffer', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverActiveRide', user?.id] }),
      qc.invalidateQueries({ queryKey: ['driverQueue'] }),
    ])
  }

  async function cancelTrip() {
    if (!activeRide) return
    if (!window.confirm("Cancel this trip? You'll be returned to the queue.")) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('cancel_accepted_ride', { p_ride_id: activeRide.id })
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

      {/* Incoming offer takes priority */}
      {offer && !activeRide && (
        <OfferCard
          offer={offer}
          busy={offerBusy}
          onAccept={() => respond('accept')}
          onDecline={(auto) => respond('decline', auto)}
        />
      )}

      {/* Active trip */}
      {activeRide && (
        <TripPanel
          ride={activeRide}
          onComplete={complete}
          completing={busy}
          onCancel={cancelTrip}
          cancelling={busy}
          locationStatus={locationStatus}
          driverCoords={driverCoords}
        />
      )}

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

      {/* Live queue summary (anonymized: counts + your position, no per-driver list) */}
      {loading ? (
        <p className="text-center text-sm text-gray-400">Loading queue…</p>
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
