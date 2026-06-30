import { useState } from 'react'

/**
 * Confirmation for cancelling an ACCEPTED ride, with one-tap reason chips
 * (role-specific — passed in by the caller). The reason is optional; the
 * destructive action is red. Replaces the generic confirm for this flow.
 * Layered above the map (z-[2000]), like the other modals.
 */
export function CancelReasonModal({
  open,
  title,
  reasons,
  confirmLabel,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean
  title: string
  reasons: string[]
  confirmLabel: string
  busy?: boolean
  onConfirm: (reason: string | null) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  if (!open) return null

  const close = () => {
    setSelected(null)
    onClose()
  }
  const confirm = () => {
    onConfirm(selected)
    setSelected(null)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-6"
      onClick={busy ? undefined : close}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-center text-lg font-bold text-gray-800">{title}</p>
        <p className="mt-1 text-center text-sm text-gray-600">
          Pick a reason <span className="text-gray-400">(optional)</span>:
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          {reasons.map((reason) => (
            <button
              key={reason}
              type="button"
              onClick={() => setSelected((r) => (r === reason ? null : reason))}
              className={
                'rounded-lg border px-3 py-2 text-left text-sm font-medium transition ' +
                (selected === reason
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50')
              }
            >
              {reason}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-lg bg-red-600 py-2.5 font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? '…' : confirmLabel}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="w-full rounded-lg border border-gray-300 py-2.5 font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
          >
            Keep ride
          </button>
        </div>
      </div>
    </div>
  )
}
