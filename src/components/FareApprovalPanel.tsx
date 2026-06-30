import { useEffect, useRef, useState } from 'react'
import { FareBreakdown } from './FareBreakdown'

const APPROVAL_SECONDS = 120

// One-tap reasons the commuter can attach when declining a proposed fare.
const DECLINE_REASONS = [
  'Requested fare is too high',
  'Too expensive for the distance',
  'Changed my mind',
]

/**
 * Commuter's prompt when a driver proposes a fare before accepting. Shows the
 * breakdown; Approve → ride proceeds; Decline → pick an optional reason (relayed
 * to the driver), then it's offered to the next driver. Letting the countdown
 * lapse auto-declines with no reason. The money is cash — the app only relays.
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
  onReject: (reason: string | null) => void
  busy: boolean
}) {
  const [remaining, setRemaining] = useState(APPROVAL_SECONDS)
  const [choosingReason, setChoosingReason] = useState(false)
  const fired = useRef(false)

  useEffect(() => {
    const start = Date.now()
    const t = setInterval(() => {
      const left = Math.max(0, APPROVAL_SECONDS - Math.floor((Date.now() - start) / 1000))
      setRemaining(left)
      if (left <= 0 && !fired.current) {
        fired.current = true
        onReject(null) // auto-decline on timeout → next driver, no reason
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

      {!choosingReason ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => setChoosingReason(true)}
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
      ) : (
        <div className="mt-4">
          <p className="mb-1.5 text-sm font-medium text-amber-900">
            Why are you declining? <span className="font-normal text-amber-700">(optional)</span>
          </p>
          <div className="flex flex-col gap-1.5">
            {DECLINE_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                onClick={() => onReject(reason)}
                disabled={busy}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
              >
                {reason}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onReject(null)}
              disabled={busy}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-left text-sm text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
            >
              Decline without a reason
            </button>
          </div>
          <button
            type="button"
            onClick={() => setChoosingReason(false)}
            disabled={busy}
            className="mt-2 w-full text-center text-sm text-amber-700 underline disabled:opacity-60"
          >
            ← Back
          </button>
        </div>
      )}
    </div>
  )
}
