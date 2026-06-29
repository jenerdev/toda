import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { VAPID_PUBLIC_KEY, pushSupported, urlBase64ToUint8Array } from '../lib/push'

export type PushStatus =
  | 'unsupported' // browser can't do Web Push (e.g. iOS Safari tab — must install the PWA)
  | 'unconfigured' // no VAPID public key in the build env
  | 'default' // supported, not yet enabled
  | 'denied' // user blocked notifications
  | 'subscribed' // active push subscription saved
  | 'error'

/**
 * Driver-side Web Push: subscribe this device and persist the subscription so
 * the notify-driver Edge Function can push a ride offer even when the app is
 * closed / the phone is locked.
 */
export function usePushNotifications(userId: string | undefined) {
  const [status, setStatus] = useState<PushStatus>('default')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!pushSupported()) return setStatus('unsupported')
    if (!VAPID_PUBLIC_KEY) return setStatus('unconfigured')
    if (Notification.permission === 'denied') return setStatus('denied')

    let cancelled = false
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setStatus(sub ? 'subscribed' : 'default')
      })
      .catch(() => {
        /* SW not ready yet — leave as default */
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function enable() {
    if (!pushSupported() || !VAPID_PUBLIC_KEY || !userId) return
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setStatus(permission === 'denied' ? 'denied' : 'default')
        return
      }

      const reg = await navigator.serviceWorker.ready
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast around the TS DOM lib's ArrayBufferLike/BufferSource mismatch.
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
        }))

      const json = sub.toJSON()
      if (!json.keys?.p256dh || !json.keys?.auth) throw new Error('Incomplete push subscription')

      const { error } = await supabase
        .from('push_subscriptions')
        .upsert(
          { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
          { onConflict: 'endpoint' },
        )
      if (error) throw error
      setStatus('subscribed')
    } catch {
      setStatus('error')
    } finally {
      setBusy(false)
    }
  }

  return { status, busy, enable }
}
