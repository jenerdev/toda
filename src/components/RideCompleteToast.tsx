import { useJustCompletedRide } from '../hooks/useJustCompletedRide'
import type { Role } from '../types/db'

/**
 * Confirmation shown to BOTH parties when a ride completes. Self-contained:
 * watches the user's rides for a `completed` transition and shows a dismissible
 * modal. Mounted once in the app chrome so it appears on any screen.
 */
export function RideCompleteToast({
  userId,
  role,
}: {
  userId: string | undefined
  role: Role | undefined
}) {
  const { completed, dismiss } = useJustCompletedRide(userId, role)
  if (!completed) return null

  const isDriver = role === 'driver'

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-6"
      onClick={dismiss}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-4xl">🎉</p>
        <p className="mt-2 text-lg font-bold text-brand-dark">
          {isDriver ? 'Trip completed!' : 'Ride completed!'}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {isDriver
            ? "You're back in the queue. Collect the fare in cash."
            : 'Thanks for riding! Please pay your driver the fare in cash.'}
        </p>
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
