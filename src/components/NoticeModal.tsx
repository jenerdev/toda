/**
 * Single-button informational modal — an acknowledgement, not a choice.
 * Controlled via `open`;
 * dismiss with the button or a backdrop tap. Layered above the map + the offer
 * overlay (z-[2000]), matching the ride-outcome modal.
 */
export function NoticeModal({
  open,
  emoji,
  title,
  message,
  buttonLabel = 'Got it',
  onClose,
}: {
  open: boolean
  emoji?: string
  title: string
  message: string
  buttonLabel?: string
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {emoji && <p className="text-4xl">{emoji}</p>}
        <p className="mt-2 text-lg font-bold text-gray-800">{title}</p>
        <p className="mt-1 text-sm text-gray-600">{message}</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-brand py-2.5 font-semibold text-white transition hover:bg-brand-dark"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  )
}
