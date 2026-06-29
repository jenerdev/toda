import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * Shows a "new version available" banner when an updated service worker is
 * waiting (registerType: 'prompt'). Tapping Reload activates the new SW and
 * refreshes — so the latest deploy is one visible, explicit tap, never a guess.
 */
// How often to actively check the server for a new service worker.
const UPDATE_CHECK_MS = 60_000

export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // The default only checks for a new SW once at registration — an installed
    // PWA reopened from the background often never re-checks, so the update
    // banner never shows. Poll periodically and whenever the app regains focus
    // so a new deploy surfaces on its own.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) registration.update()
      }
      setInterval(check, UPDATE_CHECK_MS)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      window.addEventListener('online', check)
    },
  })

  if (!needRefresh) return null

  function reload() {
    // Reload as soon as the new service worker takes control. updateServiceWorker(true)
    // also reloads internally, but we add our own controllerchange listener plus a
    // timed fallback for flaky activations (notably iOS) where neither fires.
    let done = false
    const doReload = () => {
      if (done) return
      done = true
      window.location.reload()
    }
    navigator.serviceWorker?.addEventListener('controllerchange', doReload, { once: true })
    void updateServiceWorker(true)
    setTimeout(doReload, 3000)
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1100] mx-auto w-full max-w-md p-3">
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
          onClick={reload}
          className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
        >
          Reload
        </button>
      </div>
    </div>
  )
}
