import { useEffect, useRef, useState } from 'react'
import { subscribeSnackbar } from '../lib/snackbar'

const VISIBLE_MS = 4000

/**
 * App-wide transient toast. Mounted once at the app root; listens to the
 * snackbar emitter (see lib/snackbar) and shows the latest message, auto-
 * dismissing after a few seconds. Tap to dismiss early. Sits above the map,
 * modals, and offer overlays (z-[3000] > the z-[2000] dialogs).
 */
export function Snackbar() {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return subscribeSnackbar((msg) => {
      setMessage(msg)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setMessage(null), VISIBLE_MS)
    })
  }, [])

  // Clear any pending timer on unmount.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  if (!message) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[3000] flex justify-center px-4">
      <div
        role="status"
        aria-live="polite"
        onClick={() => setMessage(null)}
        className="pointer-events-auto max-w-sm cursor-pointer rounded-full bg-gray-900/95 px-4 py-2.5 text-center text-sm font-medium text-white shadow-lg"
      >
        {message}
      </div>
    </div>
  )
}
