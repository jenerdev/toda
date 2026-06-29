import type { Availability } from '../types/db'

/**
 * Anonymized queue summary. We can't show other drivers' names (RLS keeps
 * profiles private), so instead of a per-driver list we show the headline
 * numbers: how many drivers are available, and the current driver's own
 * position in the FIFO line.
 *
 * The "next up" state is the moment that matters to a driver glancing at their
 * phone, so it gets its own treatment: the whole card turns green with a live
 * pulse. Every other state stays quiet.
 */
export function QueueStatus({
  availableCount,
  onTripCount,
  myPosition,
  myAvailability,
  isOnline,
}: {
  availableCount: number
  onTripCount: number
  /** 1-based position among available drivers; null if not in the available queue. */
  myPosition: number | null
  myAvailability: Availability
  isOnline: boolean
}) {
  const isNext = myAvailability === 'available' && myPosition === 1
  const inLine = myAvailability === 'available' && myPosition != null && myPosition > 1
  const ahead = (myPosition ?? 1) - 1

  const countLine =
    `${availableCount} ${availableCount === 1 ? 'driver' : 'drivers'} available` +
    (onTripCount > 0 ? ` · ${onTripCount} on a trip` : '')

  // Signature state: you're first in line, the next request is yours.
  if (isNext) {
    return (
      <div className="rounded-xl border border-emerald-600 bg-emerald-600 p-5 text-white shadow-lg shadow-emerald-600/25">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3.5 w-3.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-white" />
          </span>
          <p className="text-2xl font-extrabold tracking-tight">You’re next up</p>
        </div>
        <p className="mt-1 text-sm text-emerald-50">
          The next ride request comes to you. Keep the app open.
        </p>
        <p className="mt-4 border-t border-white/20 pt-3 text-sm text-emerald-50/90">
          {countLine}
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-3xl font-bold text-brand-dark">{availableCount}</p>
          <p className="text-sm text-gray-500">
            {availableCount === 1 ? 'driver available' : 'drivers available'}
            {onTripCount > 0 && ` · ${onTripCount} on a trip`}
          </p>
        </div>

        {inLine && (
          <div className="text-right">
            <p className="text-6xl font-extrabold leading-none tracking-tight text-brand">
              #{myPosition}
            </p>
            <p className="mt-1 text-sm text-gray-500">your position</p>
          </div>
        )}
      </div>

      <p className="mt-3 border-t pt-3 text-sm">
        {!isOnline ? (
          <span className="text-gray-400">Go online to join the queue.</span>
        ) : myAvailability === 'on_trip' ? (
          <span className="text-gray-600">
            You’re on a trip — you’ll re-join the queue at the end.
          </span>
        ) : inLine ? (
          <span className="text-gray-600">
            {ahead} {ahead === 1 ? 'driver' : 'drivers'} ahead of you.
          </span>
        ) : (
          <span className="text-gray-400">Finding your position…</span>
        )}
      </p>
    </div>
  )
}
