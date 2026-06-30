import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { MapPicker, type LatLng } from '../components/MapPicker'
import { RideStatusPanel } from '../components/RideStatusPanel'
import { useActiveRide } from '../hooks/useActiveRide'
import { RenewPanel } from '../components/RenewPanel'
import { CancelReasonModal } from '../components/CancelReasonModal'
import { Loading, ErrorState } from '../components/States'
import { supabase } from '../lib/supabase'
import { accessState } from '../lib/subscription'

// Default map center for the single subdivision (Metro Manila). Replace with the
// real subdivision center when multi-zone arrives.
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }

// Common nearby destinations — one tap fills the field (still freely editable).
// Subdivision-specific; update for the real launch area.
const DESTINATION_QUICK_PICKS = ['Alfamart', 'Barangay Hall', 'Dear Joe', 'Balen Magalang']

// One-tap reasons a commuter can attach when cancelling an accepted ride.
const COMMUTER_CANCEL_REASONS = ['Driver takes too long to arrive', 'Fare is too high']

// Remember the rider's last pickup address + destination across sessions so the
// next booking is mostly pre-filled. localStorage can throw (private mode /
// quota), so reads/writes are guarded.
const STORAGE_KEYS = { pickup: 'mq.pickup_address', destination: 'mq.destination' }
function loadField(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}
function saveField(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore — persistence is best-effort */
  }
}

export default function CommuterHome() {
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const { ride, loading, error: rideError } = useActiveRide(user?.id)

  const [pickup, setPickup] = useState<LatLng>(DEFAULT_CENTER)
  const [address, setAddress] = useState(() => loadField(STORAGE_KEYS.pickup))
  const [destination, setDestination] = useState(() => loadField(STORAGE_KEYS.destination))
  const [locating, setLocating] = useState(false)
  // True once the rider's real GPS location has been pinned — required before
  // booking, since the driver needs an accurate spot to find them.
  const [located, setLocated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Confirm modal for cancelling an already-accepted ride (replaces window.confirm).
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const { hasAccess } = accessState(profile)

  // Persist pickup + destination so they're remembered next session.
  useEffect(() => saveField(STORAGE_KEYS.pickup, address), [address])
  useEffect(() => saveField(STORAGE_KEYS.destination, destination), [destination])

  // If location was already authorized, pin automatically on load (no prompt).
  // Undecided / denied users still use the button.
  useEffect(() => {
    if (!('geolocation' in navigator) || !navigator.permissions) return
    let cancelled = false
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (!cancelled && status.state === 'granted') useMyLocation()
      })
      .catch(() => {
        /* Permissions API unsupported — fall back to the button. */
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function useMyLocation() {
    setError(null)
    if (!navigator.geolocation) {
      setError('Location isn’t available on this device.')
      return
    }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPickup({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocated(true)
        setLocating(false)
      },
      () => {
        setLocating(false)
        setError('Couldn’t get your location. Allow permission, or pin it on the map.')
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  async function book() {
    setError(null)
    if (!address.trim()) {
      setError('Please enter your pickup address.')
      return
    }
    if (!destination.trim()) {
      setError('Please enter where you’re going.')
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('book_ride', {
      p_lat: pickup.lat,
      p_lng: pickup.lng,
      p_address: address.trim(),
      p_destination: destination.trim(),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  async function cancel() {
    if (!ride) return
    setBusy(true)
    await supabase.rpc('cancel_ride', { p_ride_id: ride.id })
    setBusy(false)
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  // Re-book after a no-drivers result, reusing the same pinned location +
  // address (still held in state). Clears the stale no_drivers ride first.
  async function rebook() {
    if (!ride) return
    setError(null)
    setBusy(true)
    await supabase.rpc('cancel_ride', { p_ride_id: ride.id })
    const { error } = await supabase.rpc('book_ride', {
      p_lat: pickup.lat,
      p_lng: pickup.lng,
      p_address: address.trim(),
      p_destination: destination.trim(),
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  // A driver requested a distance surcharge before accepting.
  async function approveSurcharge() {
    if (!ride) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('approve_surcharge', { p_ride_id: ride.id })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  async function rejectSurcharge(reason: string | null) {
    if (!ride) return
    setBusy(true)
    await supabase.rpc('reject_surcharge', { p_ride_id: ride.id, p_reason: reason })
    setBusy(false)
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  async function cancelAccepted(reason: string | null) {
    if (!ride) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('cancel_accepted_ride', {
      p_ride_id: ride.id,
      p_reason: reason,
    })
    setBusy(false)
    setConfirmingCancel(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  async function complete() {
    if (!ride) return
    setBusy(true)
    const { error } = await supabase.rpc('complete_ride', { p_ride_id: ride.id })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  // While a ride is active, show its live status instead of the booking UI.
  if (loading) {
    return <Loading />
  }
  if (rideError) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <ErrorState
          message="Couldn’t load your ride."
          onRetry={() => qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })}
        />
      </div>
    )
  }
  if (ride) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-xl font-semibold">Your ride</h2>
        <RideStatusPanel
          ride={ride}
          onCancel={cancel}
          cancelling={busy}
          onCancelAccepted={() => setConfirmingCancel(true)}
          onComplete={complete}
          completing={busy}
          onRebook={rebook}
          rebooking={busy}
          onApproveSurcharge={approveSurcharge}
          onRejectSurcharge={rejectSurcharge}
          surchargeBusy={busy}
        />
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
        <CancelReasonModal
          open={confirmingCancel}
          title="Cancel this ride?"
          reasons={COMMUTER_CANCEL_REASONS}
          confirmLabel="Cancel ride"
          busy={busy}
          onConfirm={cancelAccepted}
          onClose={() => setConfirmingCancel(false)}
        />
      </div>
    )
  }

  // No active subscription → the booking UI is replaced by the renewal flow.
  // (book_ride is also gated server-side, so this is UX, not the security boundary.)
  if (!hasAccess) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-xl font-semibold">
          Hi{profile?.full_name ? `, ${profile.full_name}` : ''} 👋
        </h2>
        <RenewPanel />
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4">
      <h2 className="text-xl font-semibold">
        Hi{profile?.full_name ? `, ${profile.full_name}` : ''} 👋
      </h2>

      {/* Pickup + destination together — both are free text shown to the driver. */}
      <label className="block text-sm font-medium text-gray-700">
        Pickup address
        <div className="relative mt-1">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            placeholder="Blk/Lot, street, landmark…"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 pr-9 outline-none focus:border-brand"
          />
          {address && (
            <button
              type="button"
              aria-label="Clear pickup address"
              onClick={() => setAddress('')}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>
      </label>

      <label className="block text-sm font-medium text-gray-700">
        Destination
        <div className="relative mt-1">
          <textarea
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            rows={2}
            placeholder="Where are you going? (e.g. SM Mall, Brgy. Hall, school…)"
            className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 pr-9 outline-none focus:border-brand"
          />
          {destination && (
            <button
              type="button"
              aria-label="Clear destination"
              onClick={() => setDestination('')}
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            >
              ✕
            </button>
          )}
        </div>
      </label>

      {/* Quick picks — tap to fill the destination (still editable above). */}
      <div className="-mt-1 flex flex-wrap gap-1.5">
        {DESTINATION_QUICK_PICKS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDestination(d)}
            className={
              'rounded-full border px-3 py-1 text-xs font-medium transition ' +
              (destination.trim() === d
                ? 'border-brand bg-brand text-white'
                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
            }
          >
            {d}
          </button>
        ))}
      </div>

      <MapPicker value={pickup} onChange={setPickup} />
      <p className="text-xs text-gray-400">
        {located
          ? 'Drag the pin to fine-tune your exact spot.'
          : 'Pin your current location so your driver can find you on the map.'}
      </p>

      <div className="mt-auto rounded-xl border bg-white p-4">
        {/* All steps are required before booking — show what's left so the
            disabled "Find me a driver" button is never a mystery. */}
        {!(located && address.trim() && destination.trim()) && (
          <div className="mb-3">
            <p className="mb-1.5 text-sm font-medium text-gray-700">To find a driver:</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                <span
                  className={
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ' +
                    (located ? 'bg-brand text-white' : 'border border-gray-300 text-transparent')
                  }
                >
                  ✓
                </span>
                <span className={located ? 'text-gray-400' : 'text-gray-600'}>
                  Pin your current location
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ' +
                    (address.trim() ? 'bg-brand text-white' : 'border border-gray-300 text-transparent')
                  }
                >
                  ✓
                </span>
                <span className={address.trim() ? 'text-gray-400' : 'text-gray-600'}>
                  Enter your pickup address
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span
                  className={
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ' +
                    (destination.trim() ? 'bg-brand text-white' : 'border border-gray-300 text-transparent')
                  }
                >
                  ✓
                </span>
                <span className={destination.trim() ? 'text-gray-400' : 'text-gray-600'}>
                  Enter your destination
                </span>
              </li>
            </ul>
          </div>
        )}

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        {/* Pinning the rider's real location is step one — you can't be matched
            without it. Once pinned, the same button books the ride. */}
        {!located ? (
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {locating ? 'Locating…' : '📍 Pin my current location'}
          </button>
        ) : (
          <button
            type="button"
            onClick={book}
            disabled={!address.trim() || !destination.trim() || busy}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Finding a driver…' : 'Find me a driver'}
          </button>
        )}
      </div>
    </div>
  )
}
