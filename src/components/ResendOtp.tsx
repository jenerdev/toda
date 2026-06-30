import { useEffect, useState } from 'react'

// Wait before a code can be resent. Mounts with the OTP step, so the timer
// starts when the code is first "sent".
const RESEND_SECONDS = 120

/**
 * "Didn't receive a code? Resend" control for the OTP step.
 *
 * Starts a 2-minute countdown on mount; the Resend button stays disabled (showing
 * the remaining mm:ss) until it elapses, then becomes clickable. Clicking calls
 * `onResend` and restarts the countdown. Re-entering the OTP step remounts this,
 * so the timer naturally resets.
 *
 * No SMS is actually sent in the MVP (the code is the dummy DEMO_OTP), so
 * `onResend` is mainly for clearing transient errors today and the hook point for
 * a real SMS provider later.
 */
export function ResendOtp({ onResend }: { onResend?: () => void }) {
  const [remaining, setRemaining] = useState(RESEND_SECONDS)
  const [justSent, setJustSent] = useState(false)

  // One ticker for the lifetime of the component; decrements toward 0 and then
  // idles (setState to the same 0 is a no-op, so no extra renders).
  useEffect(() => {
    const id = setInterval(() => setRemaining((s) => (s <= 1 ? 0 : s - 1)), 1000)
    return () => clearInterval(id)
  }, [])

  // Auto-clear the "Code sent" confirmation after a few seconds.
  useEffect(() => {
    if (!justSent) return
    const id = setTimeout(() => setJustSent(false), 3000)
    return () => clearTimeout(id)
  }, [justSent])

  function handleResend() {
    onResend?.()
    setRemaining(RESEND_SECONDS)
    setJustSent(true)
  }

  const ready = remaining === 0
  const mm = Math.floor(remaining / 60)
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <p className="mt-3 text-center text-sm text-gray-500">
      {justSent && <span className="mr-1 text-green-600">Code sent ✓</span>}
      Didn’t receive a code?{' '}
      {ready ? (
        <button
          type="button"
          onClick={handleResend}
          className="font-semibold text-brand hover:underline"
        >
          Resend code
        </button>
      ) : (
        <span className="text-gray-400">
          Resend in {mm}:{ss}
        </span>
      )}
    </p>
  )
}
