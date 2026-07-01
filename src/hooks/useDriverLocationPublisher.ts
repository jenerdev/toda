import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Throttle GPS writes. watchPosition (enableHighAccuracy, maximumAge: 0) fires
// ~1/sec on a moving vehicle; writing every fix is far more resolution than a
// rider's map needs and multiplies Realtime traffic. Publish at most once per
// MIN_INTERVAL_MS, but let a big jump through sooner so a fast-moving driver
// isn't shown lagging. The driver's own on-screen marker still updates from
// every fix (local state) — only the DB write is throttled.
const MIN_INTERVAL_MS = 10_000
const MIN_MOVE_METRES = 30

// Rough great-circle distance (metres) between two lat/lng points. Good enough
// for a "did we move ~30m?" gate at subdivision scale; no need for full haversine.
function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000 // Earth radius in metres
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const lat1 = (a.lat * Math.PI) / 180
  const lat2 = (b.lat * Math.PI) / 180
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export type LocPublishStatus =
  | 'idle' // not on a trip
  | 'starting' // waiting for the first fix
  | 'publishing' // actively sharing
  | 'denied' // user blocked location
  | 'unavailable' // no geolocation (e.g. insecure origin / unsupported)
  | 'error' // transient failure

export interface DriverLocationPublish {
  status: LocPublishStatus
  /** The driver's own latest fix, so their map can show where they are. */
  coords: { lat: number; lng: number } | null
  /** Reported accuracy of the latest fix, in metres (null until first fix).
      A large value usually means iOS "Precise Location" is off for the site. */
  accuracy: number | null
  /** Error message if the last update_driver_location write failed (so the
      driver knows the rider can't see them, and we can diagnose). */
  syncError: string | null
}

/**
 * While enabled (driver is on a trip), stream the device's GPS to the private
 * driver_locations table via the update_driver_location RPC. Grabs an immediate fix and
 * then watches for movement, so the commuter sees the driver in near real time.
 * Returns a status so the UI can tell the driver whether sharing is working,
 * plus the latest coords so the driver's own map can plot them.
 */
export function useDriverLocationPublisher(enabled: boolean): DriverLocationPublish {
  const [status, setStatus] = useState<LocPublishStatus>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setCoords(null)
      setAccuracy(null)
      setSyncError(null)
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }

    setStatus('starting')

    // Last position/time we actually wrote to the DB, so we can throttle writes
    // without dropping the driver's own live marker (which tracks every fix).
    let lastSentAt = 0
    let lastSent: { lat: number; lng: number } | null = null

    const publish = async (pos: GeolocationPosition) => {
      // Always update the driver's own marker + accuracy from every fix. We don't
      // silently drop coarse fixes — that just freezes the marker at a stale spot
      // with no explanation. Instead the UI warns the driver when accuracy is poor
      // (usually iOS "Precise Location" off), which is the actionable fix.
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setStatus('publishing')
      setCoords(next)
      setAccuracy(pos.coords.accuracy ?? null)

      // Throttle the DB write: skip unless it's been a while OR we've moved
      // meaningfully. The first fix (lastSent === null) always writes so the
      // rider sees us immediately.
      const now = Date.now()
      if (
        lastSent &&
        now - lastSentAt < MIN_INTERVAL_MS &&
        metresBetween(lastSent, next) < MIN_MOVE_METRES
      ) {
        return
      }
      lastSentAt = now
      lastSent = next

      // Write to the DB so the commuter can read it. Surface failures instead of
      // swallowing them — a failed write is exactly why a rider wouldn't see us.
      const { error } = await supabase.rpc('update_driver_location', {
        p_lat: next.lat,
        p_lng: next.lng,
      })
      setSyncError(error ? error.message || 'Unknown error' : null)
    }
    const onError = (err: GeolocationPositionError) => {
      setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error')
    }

    // Immediate first fix (don't wait for the device to move).
    navigator.geolocation.getCurrentPosition(publish, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 15_000,
    })
    // Then keep streaming as the driver moves. maximumAge: 0 so we never reuse
    // a stale, coarse cached position — every update is a fresh GPS read.
    const watchId = navigator.geolocation.watchPosition(publish, onError, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20_000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled])

  return { status, coords, accuracy, syncError }
}
