/**
 * In-app confirmation modal — replaces native `window.confirm`, which can't be
 * styled, doesn't match the PWA chrome, and is suppressed by some mobile
 * browsers. Controlled: the parent owns `open` and the confirm/cancel handlers.
 * Layered above the Leaflet map + other chrome (z-[2000]), same as the
 * ride-outcome modal.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep',
  busy = false,
  destructive = false,
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-6"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-lg font-bold text-gray-800">{title}</p>
        <p className="mt-1 text-sm text-gray-600">{message}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={
              'w-full rounded-lg py-2.5 font-semibold text-white transition disabled:opacity-60 ' +
              (destructive ? 'bg-red-600 hover:bg-red-700' : 'bg-brand hover:bg-brand-dark')
            }
          >
            {busy ? '…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="w-full rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
