import { useQuery } from '@tanstack/react-query'
import type { LatLng } from '../components/MapPicker'
import { haversineMeters } from '../lib/geo'

export interface RouteResult {
  /** Road-following polyline (driver → destination), or null when we fell back. */
  positions: LatLng[] | null
  /** Distance in metres — from OSRM, or great-circle when falling back. */
  distanceM: number
  /** Driving duration in seconds (OSRM only; 0 on fallback). */
  durationS: number
  /** True when OSRM was unavailable and we're showing a straight line. */
  isFallback: boolean
}

interface OsrmRoute {
  geometry: { coordinates: [number, number][] }
  distance: number
  duration: number
}

/**
 * Road route from `driver` to `to` via the keyless public OSRM demo server.
 * Throttled by coarsening the driver coords in the query key (~100 m) + an
 * infinite stale time, so the demo server isn't hit on every 5 s location tick.
 * On any failure it returns a null route + great-circle distance so the caller
 * can fall back to a straight line — the demo endpoint is best-effort.
 */
export function useRoute(driver: LatLng | null, to: LatLng): RouteResult {
  // Round to ~110 m so we only refetch when the driver meaningfully moves.
  const driverKey = driver ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}` : null

  const { data } = useQuery({
    queryKey: ['route', `${to.lat},${to.lng}`, driverKey],
    enabled: Boolean(driver),
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: 1,
    queryFn: async ({ signal }): Promise<{ positions: LatLng[]; distanceM: number; durationS: number }> => {
      const d = driver!
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${d.lng},${d.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`
      const res = await fetch(url, { signal })
      if (!res.ok) throw new Error(`OSRM ${res.status}`)
      const json = (await res.json()) as { code: string; routes?: OsrmRoute[] }
      const route = json.routes?.[0]
      if (json.code !== 'Ok' || !route) throw new Error('no route')
      // OSRM returns [lng, lat]; Leaflet wants { lat, lng }.
      const positions = route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
      return { positions, distanceM: route.distance, durationS: route.duration }
    },
  })

  if (data) return { ...data, isFallback: false }

  // No route yet (loading, disabled, or error) — straight-line fallback.
  return {
    positions: null,
    distanceM: driver ? haversineMeters(driver, to) : 0,
    durationS: 0,
    isFallback: true,
  }
}
