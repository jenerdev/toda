import { useEffect, useState } from 'react'
import { useAvailableDrivers } from '../hooks/useAvailableDrivers'

type Phase = 'idle' | 'watching' | 'available'

/** Fire a system notification if the user granted permission (best-effort). */
function notifyDriverAvailable() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  try {
    new Notification('MotoQueue', {
      body: 'A driver is now available — open the app to book your ride.',
      icon: '/pwa-192x192.png',
    })
  } catch {
    /* Some mobile browsers require a service-worker notification; the in-app
       banner below is the guaranteed path, so we just skip the system toast. */
  }
}

/**
 * Shown when a booking finds no drivers. Besides "try again", the commuter can
 * arm a watch: when a driver comes online we alert them (system notification if
 * allowed, plus an in-app prompt) and offer one-tap re-booking.
 *
 * Scope note: this works while the app is open or backgrounded-but-alive.
 * Waking a fully-closed app needs Web Push (the deferred roadmap item).
 */
export function NoDriversPanel({
  onTryAgain,
  onRebook,
  rebooking,
}: {
  onTryAgain: () => void
  onRebook: () => void
  rebooking: boolean
}) {
  const availableCount = useAvailableDrivers()
  const [phase, setPhase] = useState<Phase>('idle')

  // While watching, jump to "available" the moment a driver comes online.
  useEffect(() => {
    if (phase === 'watching' && availableCount > 0) {
      setPhase('available')
      notifyDriverAvailable()
    }
  }, [phase, availableCount])

  async function arm() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        /* permission prompt unsupported — in-app alert still works */
      }
    }
    if (availableCount > 0) {
      setPhase('available')
      notifyDriverAvailable()
    } else {
      setPhase('watching')
    }
  }

  if (phase === 'available') {
    return (
      <div className="rounded-xl border border-emerald-600 bg-emerald-600 p-6 text-center text-white shadow-lg shadow-emerald-600/25">
        <p className="text-2xl">🎉</p>
        <p className="mt-1 text-lg font-semibold">A driver is available!</p>
        <p className="mt-1 text-sm text-emerald-50">Book now before they take another ride.</p>
        <button
          onClick={onRebook}
          disabled={rebooking}
          className="mt-4 w-full rounded-lg bg-white py-2.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
        >
          {rebooking ? 'Booking…' : 'Book now'}
        </button>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-6 text-center">
      <p className="text-lg">😕</p>
      <p className="mt-1 font-medium text-gray-800">No drivers available right now.</p>

      {phase === 'watching' ? (
        <>
          <p className="mt-3 flex items-center justify-center gap-2 text-sm font-medium text-brand-dark">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-brand opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
            </span>
            Watching for a driver…
          </p>
          <p className="mt-1 text-sm text-gray-500">
            We’ll alert you the moment one comes online. Keep the app open.
          </p>
          <button
            onClick={() => setPhase('idle')}
            className="mt-4 text-sm font-medium text-gray-500 underline-offset-2 hover:underline"
          >
            Stop watching
          </button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500">Try again, or we can alert you.</p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              onClick={arm}
              className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
            >
              🔔 Notify me when a driver’s available
            </button>
            <button
              onClick={onTryAgain}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Try again
            </button>
          </div>
        </>
      )}
    </div>
  )
}
