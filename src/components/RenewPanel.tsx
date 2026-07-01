import { useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { useMyRenewal } from '../hooks/useMyRenewal'
import { supabase } from '../lib/supabase'
import { notifyIfRateLimited } from '../lib/snackbar'
import { accessState, GCASH_NAME, GCASH_NUMBER, SUBSCRIPTION_PRICE } from '../lib/subscription'

/**
 * Subscription renewal flow (manual GCash). Shows the business GCash number +
 * ₱30, takes a reference number (+ optional screenshot), and submits it for
 * admin review. Reflects the live status of the user's latest submission.
 *
 * Pass `compact` to render just the status/CTA (e.g. above the booking form);
 * the full pay-and-submit form always shows when access is lost.
 */
export function RenewPanel() {
  const { user, profile } = useAuth()
  const { renewal } = useMyRenewal(user?.id)
  const { active, inGrace, until, daysLeft } = accessState(profile)

  const [ref, setRef] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const pending = renewal?.status === 'pending'

  async function submit() {
    setError(null)
    if (!ref.trim() || ref.trim().length < 4) {
      setError('Enter the GCash reference number from your payment.')
      return
    }
    if (!user) return
    setBusy(true)
    try {
      let path: string | null = null
      if (file) {
        path = `${user.id}/${Date.now()}-${file.name}`
        const up = await supabase.storage.from('renewal-screenshots').upload(path, file)
        if (up.error) throw up.error
      }
      const { error } = await supabase.rpc('submit_renewal', {
        p_ref: ref.trim(),
        p_screenshot_path: path,
      })
      if (error) throw error
      setDone(true)
      setRef('')
      setFile(null)
    } catch (e) {
      if (!notifyIfRateLimited(e)) {
        setError(e instanceof Error ? e.message : 'Could not submit your renewal.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      {/* Current status line */}
      {active ? (
        <p className="text-sm text-gray-600">
          Subscription active{until ? ` until ${until.toLocaleDateString()}` : ''}
          {daysLeft != null && daysLeft <= 7 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}.
        </p>
      ) : inGrace ? (
        <p className="text-sm font-medium text-amber-700">
          Your subscription expired{until ? ` on ${until.toLocaleDateString()}` : ''}. You still have access
          for a few days — renew now to avoid being cut off.
        </p>
      ) : (
        <p className="text-sm font-medium text-red-700">
          🔒 Your subscription has expired. Renew (₱{SUBSCRIPTION_PRICE}/month) to keep using MotoQueue.
        </p>
      )}

      {/* Pending review */}
      {pending && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          ⏳ Renewal under review (ref <span className="font-mono">{renewal!.gcash_ref}</span>). We verify
          payments within ~24h; you'll get access as soon as it's approved.
        </div>
      )}

      {/* Last rejection (let them resubmit) */}
      {renewal?.status === 'rejected' && !done && (
        <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Your last renewal was rejected{renewal.rejection_reason ? `: ${renewal.rejection_reason}` : '.'} You
          can correct the reference and submit again below.
        </div>
      )}

      {done && (
        <div className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
          ✓ Submitted. We'll review it shortly.
        </div>
      )}

      {/* Pay + submit form — hidden while a submission is pending or just sent */}
      {!pending && !done && (
        <div className="mt-3 space-y-3">
          <div className="rounded-lg bg-gray-50 p-3 text-sm">
            <p className="font-medium text-gray-700">How to renew</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-gray-600">
              <li>
                GCash <span className="font-semibold">₱{SUBSCRIPTION_PRICE}</span> to{' '}
                <span className="font-mono font-semibold">{GCASH_NUMBER}</span> ({GCASH_NAME}).
              </li>
              <li>Copy the reference number from your GCash receipt.</li>
              <li>Paste it below (a screenshot speeds up approval).</li>
            </ol>
          </div>

          <label className="block text-sm font-medium text-gray-700">
            GCash reference number
            <input
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="e.g. 1234567890123"
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono outline-none focus:border-brand"
            />
          </label>

          <label className="block text-sm font-medium text-gray-700">
            Screenshot (optional)
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-dark"
            />
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={submit}
            disabled={busy || !ref.trim()}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {busy ? 'Submitting…' : `I've paid — submit for review`}
          </button>
        </div>
      )}
    </div>
  )
}
