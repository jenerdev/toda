import { useEffect, useRef, useState } from 'react'
import { FareBreakdown } from './FareBreakdown'

const APPROVAL_SECONDS = 120

/**
 * Commuter's prompt when a driver proposes a fare (trip fare and/or pickup
 * surcharge) before accepting. Shows the breakdown; Approve → ride proceeds with
 * those amounts; Decline (or letting the countdown lapse) → offered to the next
 * driver. The money is cash to the driver — the app only relays the proposal.
 */
export function FareApprovalPanel({
  fare,
  surcharge,
  onApprove,
  onReject,
  busy,
}: {
  fare: number
  surcharge: number
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const [remaining, setRemaining] = useState(APPROVAL_SECONDS)
  const fired = useRef(false)

  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => {
      const left = Math.max(0, APPROVAL_SECONDS - Math.floor((Date.now() - start) / 1000))
      setRemaining(left)
      if (left <= 0 && !fired.current) {
        fired.current = true
        onReject() // auto-decline on timeout → next driver
      }
    }, 250)
    return () => clearInterval(t)
  }, [onReject])

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-900">Fare for approval</span>
        <span className="font-mono text-sm text-amber-700">
          ⏱ {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
        </span>
      </div>
      <p className="mt-1 text-sm text-amber-800">
        Your driver proposed this fare for the trip. Paid in cash to the driver — approve to proceed.
      </p>
      <FareBreakdown fare={fare} surcharge={surcharge} className="mt-3" />
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onReject}
          disabled={busy}
          className="rounded-lg border border-amber-300 bg-white py-2.5 font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"
        >
          Decline
        </button>
        <button
          onClick={onApprove}
          disabled={busy}
          className="rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : 'Approve & proceed'}
        </button>
      </div>
    </div>
  )
}
