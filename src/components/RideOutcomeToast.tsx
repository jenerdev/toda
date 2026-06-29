import { useRideOutcome } from '../hooks/useRideOutcome'
import type { Role } from '../types/db'

/**
 * Confirmation shown to BOTH parties when a ride ends — completed or cancelled.
 * Self-contained: watches the user's rides for a terminal transition and shows
 * a dismissible modal. Mounted once in the app chrome so it appears on any
 * screen. Completed is celebratory (emerald); cancelled is neutral.
 */
export function RideOutcomeToast({
  userId,
  role,
}: {
  userId: string | undefined
  role: Role | undefined
}) {
  const { outcome, dismiss } = useRideOutcome(userId, role)
  if (!outcome) return null

  const isDriver = role === 'driver'
  const completed = outcome.kind === 'completed'

  const emoji = completed ? '🎉' : '🚫'
  const title = completed
    ? isDriver
      ? 'Trip completed!'
      : 'Ride completed!'
    : isDriver
      ? 'Trip cancelled'
      : 'Ride cancelled'
  const surcharge = outcome.ride.surcharge ?? 0
  const fareLine =
    surcharge > 0
      ? ` (incl. the agreed +₱${surcharge} distance surcharge)`
      : ''
  const body = completed
    ? isDriver
      ? `You're back in the queue. Collect the fare in cash${fareLine}.`
      : `Thanks for riding! Please pay your driver the fare in cash${fareLine}.`
    : isDriver
      ? "You're back in the queue."
      : 'No charge. You can book another ride anytime.'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-6"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl">{emoji}</p>
        <p className={'mt-2 text-lg font-bold ' + (completed ? 'text-brand-dark' : 'text-gray-800')}>
          {title}
        </p>
        <p className="mt-1 text-sm text-gray-600">{body}</p>
        <button
          type="button"
          onClick={dismiss}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark"
        >
          Done
        </button>
      </div>
    </div>
  )
}
