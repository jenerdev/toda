import { useEffect, useState } from 'react'

/**
 * Install-to-home-screen UX for the PWA. The manifest + service worker are set
 * up by vite-plugin-pwa (see vite.config.ts); this hook drives the in-app
 * prompt:
 *  - Android/desktop Chromium fire `beforeinstallprompt`; we capture it and
 *    re-trigger it from our own button.
 *  - iOS Safari never fires that event — installing is a manual Share → "Add to
 *    Home Screen". We detect iOS and show instructions instead.
 *  - Already-installed (standalone) sessions and dismissals show nothing.
 */

interface BeforeInstallPromptEvent extends Event {
  readonly prompt: () => Promise<void>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

const DISMISS_KEY = 'mq:pwa-install-dismissed'

function isStandalone(): boolean {
  if (window.matchMedia('(display-mode: standalone)').matches) return true
  // iOS Safari exposes its own standalone flag off navigator.
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return nav.standalone === true
}

function isIos(): boolean {
  const ua = window.navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) && !('MSStream' in window)
}

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1'
  } catch {
    return false
  }
}

export function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(isStandalone)
  const [dismissed, setDismissed] = useState(wasDismissed)

  useEffect(() => {
    function onBeforeInstall(e: Event) {
      // Stop Chrome's default mini-infobar; we present our own prompt.
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    function onInstalled() {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  async function promptInstall() {
    if (!deferred) return
    await deferred.prompt()
    const { outcome } = await deferred.userChoice
    setDeferred(null)
    if (outcome === 'accepted') setInstalled(true)
  }

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* private mode — banner just won't persist its dismissal */
    }
  }

  const ios = isIos()
  const canPrompt = deferred !== null
  // Show the banner only if there's something actionable: a captured native
  // prompt, or iOS where we can give manual steps.
  const showBanner = !installed && !dismissed && (canPrompt || ios)

  return { showBanner, canPrompt, ios, promptInstall, dismiss }
}
