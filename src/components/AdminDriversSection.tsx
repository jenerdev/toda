import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminDrivers } from '../hooks/useAdminDrivers'
import { Loading, EmptyState, ErrorState } from './States'

type Filter = 'all' | 'online' | 'offline'

// A driver who toggled online but hasn't sent a heartbeat recently isn't really
// reachable for dispatch (mirrors the server's 60s stale cutoff). Flag it so a
// stale "online" doesn't mislead the admin.
const STALE_MS = 60_000

function lastSeen(updatedAt: string | null): string {
  if (!updatedAt) return 'never'
  const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Admin roster of drivers with a live online/offline split + filter. */
export function AdminDriversSection() {
  const qc = useQueryClient()
  const { drivers, loading, error, refetch, refreshing } = useAdminDrivers()
  const [filter, setFilter] = useState<Filter>('all')

  const onlineCount = drivers.filter((d) => d.is_online).length
  const offlineCount = drivers.length - onlineCount
  const shown =
    filter === 'all'
      ? drivers
      : drivers.filter((d) => (filter === 'online' ? d.is_online : !d.is_online))

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Drivers</h3>
        <button
          onClick={() => refetch()}
          disabled={refreshing}
          className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-dark hover:bg-gray-100 disabled:opacity-60"
        >
          {refreshing ? '…' : '↻ Refresh'}
        </button>
      </div>

      {/* Online / offline counts double as filter chips. */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip label={`All ${drivers.length}`} active={filter === 'all'} onClick={() => setFilter('all')} />
        <FilterChip
          label={`🟢 Online ${onlineCount}`}
          active={filter === 'online'}
          onClick={() => setFilter('online')}
        />
        <FilterChip
          label={`⚪ Offline ${offlineCount}`}
          active={filter === 'offline'}
          onClick={() => setFilter('offline')}
        />
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState
          message="Couldn’t load drivers."
          onRetry={() => qc.invalidateQueries({ queryKey: ['adminDrivers'] })}
        />
      ) : shown.length === 0 ? (
        <EmptyState>{filter === 'all' ? 'No drivers yet.' : `No ${filter} drivers.`}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((d) => {
            const stale =
              d.is_online &&
              d.updated_at != null &&
              Date.now() - new Date(d.updated_at).getTime() > STALE_MS
            return (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">
                    {d.full_name ?? 'Unnamed driver'}
                  </p>
                  <p className="truncate text-sm text-gray-500">{d.phone ?? '—'}</p>
                </div>
                <div className="shrink-0 text-right">
                  {d.is_online ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      🟢 {d.availability === 'on_trip' ? 'On trip' : 'Online'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                      ⚪ Offline
                    </span>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    {stale ? `⚠ stale · ${lastSeen(d.updated_at)}` : `seen ${lastSeen(d.updated_at)}`}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-semibold transition ${
        active ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {label}
    </button>
  )
}
