import { usePwaInstall } from '../hooks/usePwaInstall'

/**
 * Slim, dismissible "add to home screen" banner shown in the app chrome.
 * Renders nothing unless the app is installable and hasn't been installed or
 * dismissed. On iOS (no native prompt) it shows the manual Share-sheet steps.
 */
export function InstallBanner() {
  const { showBanner, canPrompt, ios, promptInstall, dismiss } = usePwaInstall()
  if (!showBanner) return null

  return (
    <div className="flex items-center gap-3 border-b border-brand/20 bg-brand/5 px-4 py-2.5">
      <span aria-hidden className="text-lg">
        📲
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-brand-dark">Install MotoQueue</p>
        <p className="text-xs text-gray-500">
          {ios
            ? 'Tap the Share button, then “Add to Home Screen”.'
            : 'Add it to your home screen for one-tap booking.'}
        </p>
      </div>
      {canPrompt && (
        <button
          type="button"
          onClick={promptInstall}
          className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Install
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="shrink-0 rounded p-1 text-gray-400 transition hover:text-gray-600"
      >
        ✕
      </button>
    </div>
  )
}
