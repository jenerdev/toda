import type { Profile } from '../types/db'
import { accessState } from '../lib/subscription'

/** Compact subscription status pill for the top bar. */
export function SubscriptionBadge({ profile }: { profile: Profile }) {
  const { hasAccess, active, inGrace, until, daysLeft } = accessState(profile)
  const dateStr = until
    ? until.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  let label: string
  let cls: string
  if (active) {
    // Show the expiry date; add a day-count nudge in the last week.
    label =
      dateStr && daysLeft != null && daysLeft <= 7
        ? `🎫 ${dateStr} · ${daysLeft}d`
        : dateStr
          ? `🎫 until ${dateStr}`
          : '🎫 Active'
    cls = 'bg-brand/10 text-brand-dark'
  } else if (inGrace) {
    label = dateStr ? `⏳ expired ${dateStr}` : '⏳ Grace'
    cls = 'bg-amber-100 text-amber-700'
  } else {
    label = hasAccess ? '🎫 Active' : '🔒 Expired'
    cls = 'bg-red-100 text-red-700'
  }

  return (
    <span
      className={'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ' + cls}
      title={
        until
          ? `Subscription ${active ? 'active until' : 'expired on'} ${until.toLocaleString()}`
          : 'No active subscription — renew to get access'
      }
    >
      {label}
    </span>
  )
}
