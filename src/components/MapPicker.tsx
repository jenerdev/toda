import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface LatLng {
  lat: number
  lng: number
}

// A self-contained pin via divIcon — avoids the classic broken default-marker
// image problem with bundlers (no external image assets needed).
const pinIcon = L.divIcon({
  className: '',
  html: '<div style="font-size:28px;line-height:1">📍</div>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

/** Keeps the Leaflet view centered when the pin is set from outside (search / geolocation). */
function Recenter({ lat, lng }: LatLng) {
  const map = useMap()
  useEffect(() => {
    map.setView([lat, lng], map.getZoom(), { animate: true })
  }, [lat, lng, map])
  return null
}

/** Tap anywhere on the map to drop/move the pin. */
function ClickToSet({ onChange }: { onChange: (p: LatLng) => void }) {
  useMapEvents({
    click(e) {
      onChange({ lat: e.latlng.lat, lng: e.latlng.lng })
    },
  })
  return null
}

export function MapPicker({
  value,
  onChange,
}: {
  value: LatLng
  onChange: (p: LatLng) => void
}) {
  return (
    <MapContainer
      center={[value.lat, value.lng]}
      zoom={16}
      className="h-72 w-full rounded-xl"
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker
        position={[value.lat, value.lng]}
        icon={pinIcon}
        draggable
        eventHandlers={{
          dragend: (e) => {
            const p = (e.target as L.Marker).getLatLng()
            onChange({ lat: p.lat, lng: p.lng })
          },
        }}
      />
      <ClickToSet onChange={onChange} />
      <Recenter lat={value.lat} lng={value.lng} />
    </MapContainer>
  )
}
