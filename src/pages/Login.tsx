import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { useAuth } from '../context/AuthProvider'
import { phoneToEmail, derivePassword, isValidPhone, DEMO_OTP } from '../lib/phone'
import { BUILD_ID } from '../lib/buildId'

export default function Login() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Already signed in? Don't show the login screen.
  useEffect(() => {
    if (session) navigate('/', { replace: true })
  }, [session, navigate])

  function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isValidPhone(phone)) {
      setError('Please enter a valid phone number.')
      return
    }
    // Dummy OTP for the MVP — no SMS is actually sent.
    setStep('otp')
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (otp.trim() !== DEMO_OTP) {
      setError('Incorrect code. (Demo code is 1234.)')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(phone),
      password: derivePassword(phone),
    })
    setSubmitting(false)
    if (error) {
      const msg = /invalid login credentials/i.test(error.message)
        ? 'No account found for this number. Please sign up first.'
        : error.message
      setError(msg)
      return
    }
    // AuthProvider's onAuthStateChange updates the session; the effect above redirects.
  }

  const inputCls =
    'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-brand'

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6">
      <h1 className="mb-1 text-center text-3xl font-bold text-brand-dark">MotoQueue 🏍️</h1>
      <p className="mb-8 text-center text-gray-500">
        Get the next motorcycle in your subdivision.
      </p>

      {!isSupabaseConfigured && (
        <div className="mb-6 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          Supabase isn’t configured yet. Copy <code>.env.example</code> to{' '}
          <code>.env.local</code> and add your project URL + anon key.
        </div>
      )}

      {step === 'phone' ? (
        <form onSubmit={sendCode} className="rounded-xl border bg-white p-6">
          <label className="mb-4 block text-sm font-medium text-gray-700">
            Phone number
            <input
              type="tel"
              required
              autoFocus
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0917-xxx-xxxx"
              className={inputCls}
            />
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
        <form onSubmit={verifyCode} className="rounded-xl border bg-white p-6">
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

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
          >
            {submitting ? 'Verifying…' : 'Verify & log in'}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep('phone')
              setOtp('')
              setError(null)
            }}
            className="mt-3 w-full text-sm text-gray-500 hover:underline"
          >
            ← Change number
          </button>
        </form>
      )}

      <p className="mt-4 text-center text-sm text-gray-500">
        No account? <Link className="text-brand underline" to="/signup">Create one</Link>
      </p>

      <p className="mt-8 text-center text-[10px] text-gray-300">MotoQueue · build {BUILD_ID}</p>
    </div>
  )
}
