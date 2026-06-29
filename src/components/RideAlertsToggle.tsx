import { usePushNotifications } from '../hooks/usePushNotifications'

/**
 * Lets a driver turn on Web Push so they get ride offers even when the app is
 * closed or the phone is locked. Hidden where push can't work (unsupported
 * browser, or no VAPID key configured). Once subscribed it shows a quiet
 * confirmation.
 */
export function RideAlertsToggle({ userId }: { userId: string | undefined }) {
  const { status, busy, enable } = usePushNotifications(userId)

  if (status === 'unsupported' || status === 'unconfigured') return null

  if (status === 'subscribed') {
    return (
      <p className="text-center text-xs text-gray-400">
        🔔 Ride alerts on — we’ll notify you of new offers even when the app is closed.
      </p>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="text-sm font-medium text-amber-900">
        Don’t miss a ride when your phone’s locked
      </p>
      {status === 'denied' ? (
        <p className="mt-1 text-xs text-red-600">
          Notifications are blocked. Enable them for this site in your browser/phone settings, then
          reload. (On iPhone, add MotoQueue to your Home Screen first.)
        </p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-amber-700">
            Turn on alerts so a ride offer reaches you even when the app isn’t open.
          </p>
          {status === 'error' && (
            <p className="mt-1 text-xs text-red-600">Couldn’t enable alerts. Please try again.</p>
          )}
          <button
            type="button"
            onClick={enable}
            disabled={busy}
            className="mt-2 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Enabling…' : '🔔 Enable ride alerts'}
          </button>
        </>
      )}
    </div>
  )
}
