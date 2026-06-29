import type { LatLng } from './MapPicker'
import { RouteMap } from './RouteMap'
import { useDriverLocation } from '../hooks/useDriverLocation'

/** Commuter's live view of the driver heading to the pickup. */
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

  return <RouteMap driver={driver} pickup={pickup} waitingHint="Waiting for driver’s live location…" />
}
