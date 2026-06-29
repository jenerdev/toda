import { useEffect, useRef, useState } from 'react'
import { surchargeCommuterPrompt } from '../lib/surcharge'

const APPROVAL_SECONDS = 30

/**
 * Commuter's prompt when a driver requests a distance surcharge before
 * accepting. Approve → ride proceeds with the surcharge; Decline (or letting the
 * countdown lapse) → the ride is offered to the next driver.
 */
export function SurchargeApprovalPanel({
  amount,
  onApprove,
  onReject,
  busy,
}: {
  amount: number
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
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-5 text-center">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-900">Extra fare requested</span>
        <span className="font-mono text-sm text-amber-700">
          ⏱ 0:{String(remaining).padStart(2, '0')}
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold text-amber-900">+₱{amount}</p>
      <p className="mt-1 text-sm text-amber-800">{surchargeCommuterPrompt(amount)}</p>
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
