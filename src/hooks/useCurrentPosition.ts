import { useEffect, useState } from 'react'
import type { LatLng } from '../components/MapPicker'

/**
 * One-shot read of the device's current GPS position (null until/unless it
 * resolves). Used where we need "where am I right now" without the trip-only
 * location publisher — e.g. the driver's offer card, to estimate distance to a
 * pickup before accepting. Stays null silently if permission is denied.
 */
export function useCurrentPosition(): LatLng | null {
  const [pos, setPos] = useState<LatLng | null>(null)

  useEffect(() => {
    if (!('geolocation' in navigator)) return
    let cancelled = false
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (!cancelled) setPos({ lat: p.coords.latitude, lng: p.coords.longitude })
      },
      () => {
        /* denied / unavailable — leave null, callers degrade gracefully */
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return pos
}
