import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './MapPicker'
import { useDriverLocation } from '../hooks/useDriverLocation'

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

/** Commuter's live view of the driver heading to the pickup. */
export function LiveTrackMap({
  driverId,
  pickup,
}: {
  driverId: string | null
  pickup: LatLng
}) {
  const loc = useDriverLocation(driverId)
  const hasDriver = loc.lat != null && loc.lng != null
  const driver: LatLng | null = hasDriver ? { lat: loc.lat!, lng: loc.lng! } : null

  const points = driver ? [driver, pickup] : [pickup]

  return (
    <div className="overflow-hidden rounded-xl border">
      <MapContainer center={[pickup.lat, pickup.lng]} zoom={16} className="h-56 w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[pickup.lat, pickup.lng]} icon={pickupIcon} />
        {driver && <Marker position={[driver.lat, driver.lng]} icon={driverIcon} />}
        <FitBounds points={points} />
      </MapContainer>
      {!hasDriver && (
        <p className="bg-gray-50 px-3 py-2 text-center text-xs text-gray-400">
          Waiting for driver’s live location…
        </p>
      )}
    </div>
  )
}
