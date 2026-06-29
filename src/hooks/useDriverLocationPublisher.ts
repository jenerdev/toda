import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

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
}

/**
 * While enabled (driver is on a trip), stream the device's GPS to
 * driver_states via the update_driver_location RPC. Grabs an immediate fix and
 * then watches for movement, so the commuter sees the driver in near real time.
 * Returns a status so the UI can tell the driver whether sharing is working,
 * plus the latest coords so the driver's own map can plot them.
 */
export function useDriverLocationPublisher(enabled: boolean): DriverLocationPublish {
  const [status, setStatus] = useState<LocPublishStatus>('idle')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [accuracy, setAccuracy] = useState<number | null>(null)

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      setCoords(null)
      setAccuracy(null)
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }

    setStatus('starting')

    const publish = (pos: GeolocationPosition) => {
      // Publish the best fix we get and surface its accuracy. We don't silently
      // drop coarse fixes — that just freezes the marker at a stale spot with no
      // explanation. Instead the UI warns the driver when accuracy is poor
      // (usually iOS "Precise Location" off), which is the actionable fix.
      setStatus('publishing')
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      setAccuracy(pos.coords.accuracy ?? null)
      void supabase.rpc('update_driver_location', {
        p_lat: pos.coords.latitude,
        p_lng: pos.coords.longitude,
      })
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

  return { status, coords, accuracy }
}
