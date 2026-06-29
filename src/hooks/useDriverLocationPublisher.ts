import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type LocPublishStatus =
  | 'idle' // not on a trip
  | 'starting' // waiting for the first fix
  | 'publishing' // actively sharing
  | 'denied' // user blocked location
  | 'unavailable' // no geolocation (e.g. insecure origin / unsupported)
  | 'error' // transient failure

/**
 * While enabled (driver is on a trip), stream the device's GPS to
 * driver_states via the update_driver_location RPC. Grabs an immediate fix and
 * then watches for movement, so the commuter sees the driver in near real time.
 * Returns a status so the UI can tell the driver whether sharing is working.
 */
export function useDriverLocationPublisher(enabled: boolean): LocPublishStatus {
  const [status, setStatus] = useState<LocPublishStatus>('idle')

  useEffect(() => {
    if (!enabled) {
      setStatus('idle')
      return
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable')
      return
    }

    setStatus('starting')

    const publish = (pos: GeolocationPosition) => {
      setStatus('publishing')
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
      timeout: 15_000,
    })
    // Then keep streaming as the driver moves.
    const watchId = navigator.geolocation.watchPosition(publish, onError, {
      enableHighAccuracy: true,
      maximumAge: 5_000,
      timeout: 20_000,
    })

    return () => navigator.geolocation.clearWatch(watchId)
  }, [enabled])

  return status
}
