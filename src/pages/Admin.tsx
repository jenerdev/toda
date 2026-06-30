import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminRenewals, type PendingRenewal } from '../hooks/useAdminRenewals'
import { useAdminDriverApplications, type PendingApplication } from '../hooks/useAdminDriverApplications'
import { useRideStats, type StatsRange } from '../hooks/useRideStats'
import { Loading, EmptyState, ErrorState } from '../components/States'
import { supabase } from '../lib/supabase'
import { SUBSCRIPTION_PRICE } from '../lib/subscription'

export default function Admin() {
  const qc = useQueryClient()
  const { renewals, loading: rLoading, error: rError } = useAdminRenewals()
  const { applications, loading: aLoading, error: aError } = useAdminDriverApplications()

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h2 className="text-xl font-semibold">Admin review</h2>

      {/* Reports */}
      <ReportsSection />

      {/* Driver verification */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Driver verification
        </h3>
        <p className="-mt-1 text-xs text-gray-400">
          Check the license + motorcycle photos before approving. License images are PII — don't
          share them.
        </p>
        {aLoading ? (
          <Loading />
        ) : aError ? (
          <ErrorState
            message="Couldn’t load driver applications."
            onRetry={() => qc.invalidateQueries({ queryKey: ['adminDriverApplications'] })}
          />
        ) : applications.length === 0 ? (
          <EmptyState>No pending driver applications. 🎉</EmptyState>
        ) : (
          applications.map((a) => <DriverApplicationCard key={a.driver_id} application={a} />)
        )}
      </section>

      {/* Renewals */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Subscription renewals
        </h3>
        <p className="-mt-1 text-xs text-gray-400">
          Cross-check each GCash reference against the business account history (exists, ₱
          {SUBSCRIPTION_PRICE}, not reused) before approving.
        </p>
        {rLoading ? (
          <Loading />
        ) : rError ? (
          <ErrorState
            message="Couldn’t load renewals."
            onRetry={() => qc.invalidateQueries({ queryKey: ['adminRenewals'] })}
          />
        ) : renewals.length === 0 ? (
          <EmptyState>No pending renewals. 🎉</EmptyState>
        ) : (
          renewals.map((r) => <RenewalCard key={r.id} renewal={r} />)
        )}
      </section>
    </div>
  )
}

function ReportsSection() {
  const [range, setRange] = useState<StatsRange>('all')
  const { stats, loading, error, refetch, refreshing } = useRideStats(range)

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Reports</h3>
        <div className="flex items-center gap-1">
          {(['all', '30d'] as StatsRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
                range === r ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {r === 'all' ? 'All time' : 'Last 30 days'}
            </button>
          ))}
          <button
            onClick={() => refetch()}
            disabled={refreshing}
            className="ml-1 rounded-full px-2.5 py-1 text-xs font-semibold text-brand-dark hover:bg-gray-100 disabled:opacity-60"
          >
            {refreshing ? '…' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message="Couldn’t load reports." onRetry={() => refetch()} />
      ) : !stats ? (
        <EmptyState>No data yet.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <StatCard label="Completed" value={stats.completed} cls="text-green-700" />
            <StatCard label="Cancelled" value={stats.cancelled} cls="text-gray-700" />
            <StatCard
              label="Missed"
              value={stats.missed}
              cls="text-amber-700"
              hint="Driver let the offer expire"
            />
            <StatCard
              label="Fare declines"
              value={stats.fare_declined}
              cls="text-red-600"
              hint="Rejected fare proposals, not cancelled rides"
            />
            <StatCard
              label="No drivers"
              value={stats.no_drivers}
              cls="text-amber-700"
              hint="Booked but nobody available"
            />
          </div>

          <div className="mt-1 rounded-xl border bg-white p-4">
            <p className="text-sm font-medium">Cancellation reasons</p>
            <p className="-mt-0.5 text-xs text-gray-400">
              Only captured for rides cancelled after a driver accepted; earlier cancels have none.
            </p>
            {stats.cancellation_reasons.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No cancellation reasons recorded.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {stats.cancellation_reasons.map((r) => (
                  <li key={r.reason} className="flex justify-between gap-3 text-sm">
                    <span className="truncate text-gray-700">{r.reason}</span>
                    <span className="shrink-0 font-semibold text-gray-500">×{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function StatCard({
  label,
  value,
  cls,
  hint,
}: {
  label: string
  value: number
  cls: string
  hint?: string
}) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
      <p className="text-sm font-medium text-gray-700">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function DriverApplicationCard({ application }: { application: PendingApplication }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function viewDoc(path: string | null) {
    if (!path) return
    const { data, error } = await supabase.storage.from('driver-docs').createSignedUrl(path, 60)
    if (error || !data) {
      setError('Could not open the document.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function review(action: 'approve' | 'reject') {
    setError(null)
    if (action === 'reject' && !reason.trim()) {
      setRejecting(true)
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('review_driver', {
      p_driver_id: application.driver_id,
      p_action: action,
      p_reason: action === 'reject' ? reason.trim() : null,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    await qc.invalidateQueries({ queryKey: ['adminDriverApplications'] })
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="font-medium">{application.driver?.full_name ?? 'Unknown driver'}</p>
      <p className="text-sm text-gray-500">{application.driver?.phone ?? '—'}</p>
      <p className="mt-1 text-xs text-gray-400">
        Submitted {new Date(application.submitted_at).toLocaleString()}
      </p>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => viewDoc(application.license_path)}
          className="text-sm font-medium text-brand-dark underline-offset-2 hover:underline"
        >
          📎 License
        </button>
        <button
          onClick={() => viewDoc(application.motorcycle_path)}
          className="text-sm font-medium text-brand-dark underline-offset-2 hover:underline"
        >
          📎 Motorcycle
        </button>
      </div>

      {rejecting && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for rejection (shown to the driver)…"
          className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => review('approve')}
          disabled={busy}
          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : 'Approve'}
        </button>
        <button
          onClick={() => review('reject')}
          disabled={busy}
          className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {rejecting ? 'Confirm reject' : 'Reject'}
        </button>
      </div>
    </div>
  )
}

function RenewalCard({ renewal }: { renewal: PendingRenewal }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function viewScreenshot() {
    if (!renewal.screenshot_path) return
    const { data, error } = await supabase.storage
      .from('renewal-screenshots')
      .createSignedUrl(renewal.screenshot_path, 60)
    if (error || !data) {
      setError('Could not open the screenshot.')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  async function review(action: 'approve' | 'reject') {
    setError(null)
    if (action === 'reject' && !reason.trim()) {
      setRejecting(true)
      return
    }
    setBusy(true)
    const { error } = await supabase.rpc('review_renewal', {
      p_renewal_id: renewal.id,
      p_action: action,
      p_reason: action === 'reject' ? reason.trim() : null,
    })
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Realtime will drop it from the pending list; refresh promptly regardless.
    await qc.invalidateQueries({ queryKey: ['adminRenewals'] })
  }

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{renewal.user?.full_name ?? 'Unknown user'}</p>
          <p className="text-sm text-gray-500">{renewal.user?.phone ?? '—'}</p>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
          ₱{renewal.amount}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">GCash ref</dt>
          <dd className="font-mono font-semibold">{renewal.gcash_ref}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Submitted</dt>
          <dd>{new Date(renewal.created_at).toLocaleString()}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-gray-500">Current expiry</dt>
          <dd>
            {renewal.user?.subscription_until
              ? new Date(renewal.user.subscription_until).toLocaleDateString()
              : '—'}
          </dd>
        </div>
      </dl>

      {renewal.screenshot_path && (
        <button
          onClick={viewScreenshot}
          className="mt-3 text-sm font-medium text-brand-dark underline-offset-2 hover:underline"
        >
          📎 View screenshot
        </button>
      )}

      {rejecting && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Reason for rejection (shown to the user)…"
          className="mt-3 w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
      )}

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => review('approve')}
          disabled={busy}
          className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          {busy ? '…' : 'Approve (+1 month)'}
        </button>
        <button
          onClick={() => review('reject')}
          disabled={busy}
          className="flex-1 rounded-lg border border-red-300 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
        >
          {rejecting ? 'Confirm reject' : 'Reject'}
        </button>
      </div>
    </div>
  )
}
