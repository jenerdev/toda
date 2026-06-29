import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { phoneToEmail, derivePassword, isValidPhone, normalizePhone, DEMO_OTP } from '../lib/phone'
import type { Role } from '../types/db'

export default function Signup() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [role, setRole] = useState<Role>('commuter')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fullName.trim()) {
      setError('Please enter your name.')
      return
    }
    if (!isValidPhone(phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    setStep('otp')
  }

  async function verifyAndCreate(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (otp.trim() !== DEMO_OTP) {
      setError('Incorrect code. (Demo code is 1234.)')
      return
    }

    setSubmitting(true)
    // Phone is the identifier; email + password are derived from it and hidden.
    // role / full_name / phone go into user metadata, which the DB trigger
    // (handle_new_user) reads to create the profile + driver_state.
    const { data, error } = await supabase.auth.signUp({
      email: phoneToEmail(phone),
      password: derivePassword(phone),
      options: { data: { role, full_name: fullName, phone: normalizePhone(phone) } },
    })
    setSubmitting(false)

    if (error) {
      const msg = /already registered/i.test(error.message)
        ? 'That phone number is already registered. Try logging in.'
        : error.message
      setError(msg)
      return
    }

    if (data.session) {
      // "Confirm email" is off — signed in; the effect above redirects.
      return
    }
    setNotice(
      'Account created, but the project requires email confirmation — which won’t work for ' +
        'phone sign-ups. Disable “Confirm email” in Supabase (Auth → Providers → Email).',
    )
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="mb-1 text-center text-3xl font-bold text-brand-dark">Create account</h1>
      <p className="mb-8 text-center text-gray-500">Join as a commuter or a driver.</p>

      {step === 'form' ? (
        <form onSubmit={sendCode} className="rounded-xl border bg-white p-6">
          <fieldset className="mb-4">
            <legend className="mb-2 text-sm font-medium text-gray-700">I am a…</legend>
            <div className="grid grid-cols-2 gap-2">
              {(['commuter', 'driver'] as Role[]).map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setRole(r)}
                  className={
                    'rounded-lg border py-2 text-sm font-semibold capitalize transition ' +
                    (role === r
                      ? 'border-brand bg-brand/10 text-brand-dark'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400')
                  }
                >
                  {r === 'driver' ? '🏍️ Driver' : '🧍 Commuter'}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="mb-3 block text-sm font-medium text-gray-700">
            Full name
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="mb-4 block text-sm font-medium text-gray-700">
            Phone number
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0917-xxx-xxxx"
              className={inputCls}
            />
            <span className="mt-1 block text-xs font-normal text-gray-400">
              You’ll use this number to log in.
            </span>
          </label>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark"
          >
            Send code
          </button>
        </form>
      ) : (
        <form onSubmit={verifyAndCreate} className="rounded-xl border bg-white p-6">
          <p className="mb-1 text-sm text-gray-600">
            Enter the code sent to <span className="font-semibold">{phone}</span>.
          </p>
          <p className="mb-4 text-xs text-gray-400">Demo code: 1234</p>
          <label className="mb-4 block text-sm font-medium text-gray-700">
            One-time code
            <input
              type="text"
              inputMode="numeric"
              required
              autoFocus
              maxLength={4}
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="••••"
              className={inputCls + ' text-center text-2xl tracking-[0.5em]'}
            />
          </label>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
          {notice && <p className="mb-3 text-sm text-amber-700">{notice}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Verify & create account'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('form')
              setOtp('')
              setError(null)
            }}
            className="mt-3 w-full text-sm text-gray-500 hover:underline"
          >
            ← Back
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-gray-500">
        Already have an account? <Link className="text-brand underline" to="/login">Log in</Link>
      </p>
    </div>
  )
}
