/**
 * Receipt-style fare breakdown: trip fare + pickup surcharge → total (all cash).
 * Shared by the commuter's approval prompt and both parties' accepted-ride
 * views so the numbers always read the same. Renders nothing when the total is
 * zero (a fare agreed in person, no surcharge).
 */
export function FareBreakdown({
  fare,
  surcharge,
  className = '',
}: {
  fare: number | null | undefined
  surcharge: number | null | undefined
  className?: string
}) {
  const f = fare ?? 0
  const s = surcharge ?? 0
  const total = f + s
  if (total <= 0) return null

  return (
    <div className={'rounded-lg border border-gray-200 bg-white p-2.5 text-sm ' + className}>
      {f > 0 && (
        <div className="flex justify-between">
          <span className="text-gray-600">Trip fare</span>
          <span className="font-medium text-gray-900">₱{f}</span>
        </div>
      )}
      {s > 0 && (
        <div className="mt-1 flex justify-between">
          <span className="text-gray-600">Pickup surcharge</span>
          <span className="font-medium text-gray-900">+₱{s}</span>
        </div>
      )}
      <div className="mt-1.5 flex justify-between border-t border-gray-200 pt-1.5">
        <span className="font-semibold text-gray-900">Total (cash)</span>
        <span className="font-bold text-gray-900">₱{total}</span>
      </div>
    </div>
  )
}
