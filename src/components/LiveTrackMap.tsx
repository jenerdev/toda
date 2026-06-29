import type { LatLng } from './MapPicker'
import { RouteMap } from './RouteMap'
import { useDriverLocation } from '../hooks/useDriverLocation'
import { useRoute } from '../hooks/useRoute'
import { formatDistance, formatEta } from '../lib/geo'

/** Commuter's live view of the driver heading to the pickup, with the road route. */
export function LiveTrackMap({
  driverId,
  pickup,
}: {
  driverId: string | null
  pickup: LatLng
}) {
  const loc = useDriverLocation(driverId)
  const driver: LatLng | null =
    loc.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null

  const route = useRoute(driver, pickup)
  const label = driver
    ? `Driver ~${formatDistance(route.distanceM)} away` +
      (route.durationS ? ` · ${formatEta(route.durationS)}` : '')
    : undefined

  return (
    <RouteMap
      driver={driver}
      pickup={pickup}
      route={route.positions}
      routeLabel={label}
      waitingHint="Waiting for driver’s live location…"
    />
  )
}
