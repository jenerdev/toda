import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { MapPicker, type LatLng } from '../components/MapPicker'
import { RideStatusPanel } from '../components/RideStatusPanel'
import { useActiveRide } from '../hooks/useActiveRide'
import { RenewPanel } from '../components/RenewPanel'
import { Loading, ErrorState } from '../components/States'
import { supabase } from '../lib/supabase'
import { accessState } from '../lib/subscription'

// Default map center for the single subdivision (Metro Manila). Replace with the
// real subdivision center when multi-zone arrives.
const DEFAULT_CENTER: LatLng = { lat: 14.5995, lng: 120.9842 }

export default function CommuterHome() {
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const { ride, loading, error: rideError } = useActiveRide(user?.id)

  const [pickup, setPickup] = useState<LatLng>(DEFAULT_CENTER)
  const [address, setAddress] = useState('')
  const [locating, setLocating] = useState(false)
  // True once the rider's real GPS location has been pinned — required before
  // booking, since the driver needs an accurate spot to find them.
  const [located, setLocated] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { hasAccess } = accessState(profile)

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
    setBusy(true)
    const { error } = await supabase.rpc('book_ride', {
      p_lat: pickup.lat,
      p_lng: pickup.lng,
      p_address: address.trim(),
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

  async function rejectSurcharge() {
    if (!ride) return
    setBusy(true)
    await supabase.rpc('reject_surcharge', { p_ride_id: ride.id })
    setBusy(false)
    await qc.invalidateQueries({ queryKey: ['activeRide', user?.id] })
  }

  async function cancelAccepted() {
    if (!ride) return
    if (!window.confirm('Cancel this ride? Your driver will be released.')) return
    setError(null)
    setBusy(true)
    const { error } = await supabase.rpc('cancel_accepted_ride', { p_ride_id: ride.id })
    setBusy(false)
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
          onCancelAccepted={cancelAccepted}
          onComplete={complete}
          completing={busy}
          onRebook={rebook}
          rebooking={busy}
          onApproveSurcharge={approveSurcharge}
          onRejectSurcharge={rejectSurcharge}
          surchargeBusy={busy}
        />
        {error && <p className="text-center text-sm text-red-600">{error}</p>}
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

      {/* Manual pickup address — this is what the driver sees on accept. */}
      <label className="block text-sm font-medium text-gray-700">
        Pickup address
        <textarea
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          rows={2}
          placeholder="Blk/Lot, street, landmark…"
          className="mt-1 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand"
        />
      </label>

      <MapPicker value={pickup} onChange={setPickup} />
      <p className="text-xs text-gray-400">
        {located
          ? 'Drag the pin to fine-tune your exact spot.'
          : 'Pin your current location so your driver can find you on the map.'}
      </p>

      <div className="mt-auto rounded-xl border bg-white p-4">
        {/* Both steps are required before booking — show what's left so the
            disabled "Find me a driver" button is never a mystery. */}
        {!(located && address.trim()) && (
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
            disabled={!address.trim() || busy}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Finding a driver…' : 'Find me a driver'}
          </button>
        )}
      </div>
    </div>
  )
}
