import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './MapPicker'

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
  waitingHint,
}: {
  driver: LatLng | null
  pickup: LatLng
  /** Shown under the map while the driver position is still unknown. */
  waitingHint?: string
}) {
  const points = driver ? [driver, pickup] : [pickup]

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
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
        {driver && <Marker position={[driver.lat, driver.lng]} icon={driverIcon} />}
        <FitBounds points={points} />
      </MapContainer>
      {!driver && waitingHint && (
        <p className="bg-gray-50 px-3 py-2 text-center text-xs text-gray-400">{waitingHint}</p>
      )}
    </div>
  )
}
