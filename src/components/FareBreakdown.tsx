/**
 * Fare display (cash). For the current single-fare flow this is one line —
 * "Fare (cash) ₱X". Older rides that carried a separate pickup surcharge still
 * render the itemized receipt (trip fare + surcharge → total). Renders nothing
 * when the total is zero (a fare agreed in person).
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

  const box = 'rounded-lg border border-gray-200 bg-white p-2.5 text-sm ' + className

  // No surcharge → a single fare line (the common case now).
  if (s <= 0) {
    return (
      <div className={box}>
        <div className="flex justify-between">
          <span className="font-semibold text-gray-900">Fare (cash)</span>
          <span className="font-bold text-gray-900">₱{total}</span>
        </div>
      </div>
    )
  }

  // Legacy rides with a separate surcharge → itemized receipt.
  return (
    <div className={box}>
      <div className="flex justify-between">
        <span className="text-gray-600">Trip fare</span>
        <span className="font-medium text-gray-900">₱{f}</span>
      </div>
      <div className="mt-1 flex justify-between">
        <span className="text-gray-600">Pickup surcharge</span>
        <span className="font-medium text-gray-900">+₱{s}</span>
      </div>
      <div className="mt-1.5 flex justify-between border-t border-gray-200 pt-1.5">
        <span className="font-semibold text-gray-900">Total (cash)</span>
        <span className="font-bold text-gray-900">₱{total}</span>
      </div>
    </div>
  )
}
