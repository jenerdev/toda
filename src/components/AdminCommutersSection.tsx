import { useQueryClient } from '@tanstack/react-query'
import { useAdminCommuters } from '../hooks/useAdminCommuters'
import { accessState } from '../lib/subscription'
import { Loading, EmptyState, ErrorState } from './States'

/** Admin roster of commuters with their subscription status. */
export function AdminCommutersSection() {
  const qc = useQueryClient()
  const { commuters, loading, error, refetch, refreshing } = useAdminCommuters()

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Commuters{commuters.length > 0 && <span className="text-gray-400"> ({commuters.length})</span>}
        </h3>
        <button
          onClick={() => refetch()}
          disabled={refreshing}
          className="rounded-full px-2.5 py-1 text-xs font-semibold text-brand-dark hover:bg-gray-100 disabled:opacity-60"
        >
          {refreshing ? '…' : '↻ Refresh'}
        </button>
      </div>

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState
          message="Couldn’t load commuters."
          onRetry={() => qc.invalidateQueries({ queryKey: ['adminCommuters'] })}
        />
      ) : commuters.length === 0 ? (
        <EmptyState>No commuters yet.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {commuters.map((c) => {
            const { active, inGrace, until } = accessState({ subscription_until: c.subscription_until })
            return (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-800">{c.full_name ?? 'Unnamed'}</p>
                  <p className="truncate text-sm text-gray-500">{c.phone ?? '—'}</p>
                </div>
                <div className="shrink-0 text-right">
                  {active ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                      Active
                    </span>
                  ) : inGrace ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                      In grace
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                      {until ? 'Expired' : 'No sub'}
                    </span>
                  )}
                  {until && (
                    <p className="mt-1 text-xs text-gray-400">until {until.toLocaleDateString()}</p>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
