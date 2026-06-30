/**
 * Origin → destination summary: a small muted label over a bold value, with a
 * hollow brand dot for the pickup and a filled dot for the destination — the
 * familiar ride-hailing "from here → to there" cue. Shared by the offer card,
 * the driver's trip panel, and the commuter's ride status so all three read the
 * same. Destination is optional (older rides may not have one).
 */
export function RouteSummary({
  pickup,
  destination,
  className = '',
}: {
  pickup: string | null
  destination: string | null
  className?: string
}) {
  return (
    <div className={'space-y-2 ' + className}>
      <div className="flex items-start gap-2">
        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-brand bg-white" />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Pickup</p>
          <p className="text-sm font-semibold leading-snug text-gray-900">
            {pickup || 'Pinned location'}
          </p>
        </div>
      </div>
      {destination && (
        <div className="flex items-start gap-2">
          <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Going to
            </p>
            <p className="text-sm font-semibold leading-snug text-gray-900">{destination}</p>
          </div>
        </div>
      )}
    </div>
  )
}
