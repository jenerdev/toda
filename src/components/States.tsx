import type { ReactNode } from 'react'

/** Brand spinner. Size via className (default 1.25rem). */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={
        'inline-block animate-spin rounded-full border-2 border-brand border-t-transparent ' +
        (className ?? 'h-5 w-5')
      }
    />
  )
}

/** Centered loading row with a spinner + label. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-gray-400">
      <Spinner />
      {label}
    </div>
  )
}

/** Quiet empty-state card. */
export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border bg-white p-6 text-center text-sm text-gray-400">{children}</div>
  )
}

/** Error card with an optional retry. Distinct from empty so a failed load never
 *  reads as "nothing here". */
export function ErrorState({
  message = 'Something went wrong.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
      <p>{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
        >
          Try again
        </button>
      )}
    </div>
  )
}
