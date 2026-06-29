import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthProvider'
import { useRideHistory } from '../hooks/useRideHistory'
import { useRenewalHistory } from '../hooks/useRenewalHistory'
import { Loading, EmptyState, ErrorState } from '../components/States'
import type { Ride, RideStatus, Renewal, RenewalStatus } from '../types/db'

const RIDE_BADGE: Record<RideStatus, { label: string; cls: string }> = {
  completed: { label: 'Completed', cls: 'bg-green-100 text-green-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-gray-200 text-gray-600' },
  no_drivers: { label: 'No drivers', cls: 'bg-amber-100 text-amber-700' },
  searching: { label: 'Searching', cls: 'bg-blue-100 text-blue-700' },
  accepted: { label: 'Accepted', cls: 'bg-blue-100 text-blue-700' },
  enroute: { label: 'En route', cls: 'bg-blue-100 text-blue-700' },
}

const RENEWAL_BADGE: Record<RenewalStatus, { label: string; cls: string }> = {
  pending: { label: 'Under review', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-green-100 text-green-700' },
  rejected: { label: 'Rejected', cls: 'bg-red-100 text-red-700' },
}

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function Activity() {
  const { user, profile } = useAuth()
  const qc = useQueryClient()
  const { rides, loading: ridesLoading, error: ridesError } = useRideHistory(user?.id, profile?.role)
  const { renewals, loading: renewalsLoading, error: renewalsError } = useRenewalHistory(user?.id)

  return (
    <div className="flex flex-1 flex-col gap-6 p-4">
      <h2 className="text-xl font-semibold">Activity</h2>

      {/* Rides */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          {profile?.role === 'driver' ? 'Trip history' : 'Ride history'}
        </h3>
        {ridesLoading ? (
          <Loading />
        ) : ridesError ? (
          <ErrorState
            message="Couldn’t load your rides."
            onRetry={() => qc.invalidateQueries({ queryKey: ['rideHistory'] })}
          />
        ) : rides.length === 0 ? (
          <EmptyState>No rides yet.</EmptyState>
        ) : (
          rides.map((r) => <RideRow key={r.id} ride={r} />)
        )}
      </section>

      {/* Renewals */}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Subscription history
        </h3>
        {renewalsLoading ? (
          <Loading />
        ) : renewalsError ? (
          <ErrorState
            message="Couldn’t load your subscription history."
            onRetry={() => qc.invalidateQueries({ queryKey: ['renewalHistory'] })}
          />
        ) : renewals.length === 0 ? (
          <EmptyState>No renewals submitted yet.</EmptyState>
        ) : (
          renewals.map((r) => <RenewalRow key={r.id} renewal={r} />)
        )}
      </section>
    </div>
  )
}

function RideRow({ ride }: { ride: Ride }) {
  const badge = RIDE_BADGE[ride.status]
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border bg-white p-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-800">
          {ride.pickup_address || 'Pinned location'}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">{fmt(ride.completed_at ?? ride.created_at)}</p>
      </div>
      <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' + badge.cls}>
        {badge.label}
      </span>
    </div>
  )
}

function RenewalRow({ renewal }: { renewal: Renewal }) {
  const badge = RENEWAL_BADGE[renewal.status]
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-gray-800">
            ₱{renewal.amount} · ref <span className="font-mono">{renewal.gcash_ref}</span>
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{fmt(renewal.created_at)}</p>
        </div>
        <span className={'shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ' + badge.cls}>
          {badge.label}
        </span>
      </div>
      {renewal.status === 'rejected' && renewal.rejection_reason && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
          Reason: {renewal.rejection_reason}
        </p>
      )}
    </div>
  )
}
