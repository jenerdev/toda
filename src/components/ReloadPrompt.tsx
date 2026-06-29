import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shows a "new version available" banner when an updated service worker is
 * waiting (registerType: 'prompt'). Tapping Reload activates the new SW and
 * refreshes — so the latest deploy is one visible, explicit tap, never a guess.
 */
export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md p-3">
      <div className="flex items-center gap-3 rounded-xl border border-brand bg-white p-3 shadow-lg">
        <span aria-hidden className="text-lg">
          🔄
        </span>
        <p className="flex-1 text-sm text-gray-700">A new version of MotoQueue is available.</p>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          className="rounded-lg px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          Later
        </button>
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
