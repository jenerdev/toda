import { useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { supabase } from '../lib/supabase'
import { notifyIfRateLimited } from '../lib/snackbar'
import type { DriverApplication } from '../types/db'

/**
 * Driver verification flow. A driver uploads a photo of their license + their
 * motorcycle for admin approval; until approved they can't go online. Reflects
 * the live status of their submission (pending / rejected-with-reason).
 *
 * `application`/`loading` are passed in from the parent (DriverHome) so we don't
 * open a second Realtime channel for the same data — both subscribing to the
 * same channel topic errors ("add callbacks after subscribe()").
 */
export function DriverVerificationPanel({
  application,
  loading,
}: {
  application: DriverApplication | null
  loading: boolean
}) {
  const { user } = useAuth()

  const [license, setLicense] = useState<File | null>(null)
  const [motorcycle, setMotorcycle] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pending = application?.status === 'pending'

  async function submit() {
    setError(null)
    if (!user) return
    if (!license || !motorcycle) {
      setError('Please attach both a license photo and a motorcycle photo.')
      return
    }
    setBusy(true)
    try {
      const stamp = Date.now()
      const licensePath = `${user.id}/license-${stamp}-${license.name}`
      const motoPath = `${user.id}/motorcycle-${stamp}-${motorcycle.name}`
      const up1 = await supabase.storage.from('driver-docs').upload(licensePath, license)
      if (up1.error) throw up1.error
      const up2 = await supabase.storage.from('driver-docs').upload(motoPath, motorcycle)
      if (up2.error) throw up2.error
      const { error } = await supabase.rpc('submit_driver_application', {
        p_license_path: licensePath,
        p_motorcycle_path: motoPath,
      })
      if (error) throw error
      setLicense(null)
      setMotorcycle(null)
    } catch (e) {
      if (!notifyIfRateLimited(e)) {
        setError(e instanceof Error ? e.message : 'Could not submit your documents.')
      }
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <div className="rounded-xl border bg-white p-4 text-sm text-gray-400">Loading…</div>
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="font-semibold text-brand-dark">Driver verification</p>

      {pending ? (
        <div className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          ⏳ Your documents are under review. You'll be able to go online once an admin approves your
          account (usually within ~24h).
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-600">
            To go online and receive rides, submit a photo of your driver's license and your
            motorcycle for admin approval.
          </p>

          {application?.status === 'rejected' && application.rejection_reason && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              Your last submission was rejected: {application.rejection_reason} — please correct and
              resubmit below.
            </div>
          )}

          <div className="mt-3 space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              Driver's license photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setLicense(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-dark"
              />
            </label>
            <label className="block text-sm font-medium text-gray-700">
              Motorcycle photo
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setMotorcycle(e.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-gray-500 file:mr-3 file:rounded-lg file:border-0 file:bg-brand/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-dark"
              />
            </label>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              onClick={submit}
              disabled={busy || !license || !motorcycle}
              className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
            >
              {busy ? 'Submitting…' : 'Submit for verification'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
