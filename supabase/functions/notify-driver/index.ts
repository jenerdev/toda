// notify-driver — Supabase Edge Function (Deno).
//
// Triggered by a Database Webhook on INSERT into public.ride_offers. Sends a
// Web Push to the offered driver's devices so they get the ride even when the
// app is closed / phone locked.
//
// Required function secrets (set in Dashboard → Edge Functions → notify-driver
// → Secrets, or `supabase secrets set`):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  — your VAPID keypair
//   VAPID_SUBJECT                        — e.g. mailto:you@example.com
//   WEBHOOK_SECRET                       — shared secret; the webhook must send
//                                          it as the x-webhook-secret header
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')!
const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')!
const vapidSubject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@motoqueue.app'
const webhookSecret = Deno.env.get('WEBHOOK_SECRET') ?? ''

webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
const admin = createClient(supabaseUrl, serviceRole)

Deno.serve(async (req) => {
  // Only the webhook (which knows the shared secret) may invoke this.
  if (webhookSecret && req.headers.get('x-webhook-secret') !== webhookSecret) {
    return new Response('unauthorized', { status: 401 })
  }

  let body: { record?: { driver_id?: string; ride_id?: string; status?: string } }
  try {
    body = await req.json()
  } catch {
    return new Response('bad request', { status: 400 })
  }

  const record = body.record
  // Only notify on a fresh pending offer to a specific driver.
  if (!record || record.status !== 'pending' || !record.driver_id) {
    return Response.json({ skipped: true })
  }

  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', record.driver_id)
  if (error) return new Response(error.message, { status: 500 })

  const payload = JSON.stringify({
    title: 'New ride offer 🛵',
    body: 'A rider needs you — tap to accept before it passes to the next driver.',
    url: '/driver',
    tag: `ride-offer-${record.ride_id}`,
  })

  let sent = 0
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (e) {
      // 404/410 mean the subscription is dead — prune it so we stop trying.
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
  }

  return Response.json({ sent })
})
