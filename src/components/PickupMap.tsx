import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { LatLng } from './MapPicker'

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

/** Read-only map showing a single pinned point (the commuter's pickup). */
export function PickupMap({ point }: { point: LatLng }) {
  return (
    <div className="overflow-hidden rounded-xl border">
      <MapContainer
        center={[point.lat, point.lng]}
        zoom={16}
        className="h-56 w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[point.lat, point.lng]} icon={pinIcon} />
      </MapContainer>
    </div>
  )
}
