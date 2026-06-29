import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './MapPicker'

const ROUTE_COLOR = '#dc2626' // red — the driver→pickup route line

const driverIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:26px;line-height:1">🏍️</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})
const pickupIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:26px;line-height:1">📍</div>',
  iconSize: [26, 26],
  iconAnchor: [13, 26],
})

/** Fit the view to whatever points we have (driver + pickup). */
function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap()
  useEffect(() => {
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16, { animate: true })
    } else {
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
        padding: [40, 40],
        maxZoom: 16,
      })
    }
  }, [map, points])
  return null
}

/**
 * Shared live map: a 🏍️ driver marker (when its position is known) and a 📍
 * pickup marker, auto-fit to both. Used by the commuter (driver position from
 * the DB) and the driver (their own device GPS).
 */
export function RouteMap({
  driver,
  pickup,
  route,
  routeLabel,
  waitingHint,
}: {
  driver: LatLng | null
  pickup: LatLng
  /** Road-following polyline (driver → pickup). When absent, a straight dashed
   *  line is drawn between the two points as a fallback. */
  route?: LatLng[] | null
  /** Caption shown under the map once the driver is known (e.g. distance/ETA). */
  routeLabel?: string
  /** Shown under the map while the driver position is still unknown. */
  waitingHint?: string
}) {
  // Fit to the whole road route when we have one; else to the two endpoints.
  const fitPoints = route && route.length ? route : driver ? [driver, pickup] : [pickup]

  return (
    <div className="overflow-hidden rounded-xl border">
      <MapContainer
        center={[pickup.lat, pickup.lng]}
        zoom={16}
        className="h-56 w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {route && route.length > 1 ? (
          <Polyline positions={route.map((p) => [p.lat, p.lng])} color={ROUTE_COLOR} weight={4} opacity={0.85} />
        ) : (
          driver && (
            <Polyline
              positions={[
                [driver.lat, driver.lng],
                [pickup.lat, pickup.lng],
              ]}
              color={ROUTE_COLOR}
              weight={3}
              opacity={0.6}
              dashArray="6"
            />
          )
        )}
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
        {driver && <Marker position={[driver.lat, driver.lng]} icon={driverIcon} />}
        <FitBounds points={fitPoints} />
      </MapContainer>
      {driver && routeLabel ? (
        <p className="bg-gray-50 px-3 py-2 text-center text-xs text-gray-500">{routeLabel}</p>
      ) : (
        !driver &&
        waitingHint && (
          <p className="bg-gray-50 px-3 py-2 text-center text-xs text-gray-400">{waitingHint}</p>
        )
      )}
    </div>
  )
}
