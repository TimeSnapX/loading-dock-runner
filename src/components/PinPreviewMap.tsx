import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const icon = (cls: string) =>
  L.divIcon({
    className: 'lzr-marker',
    html: `<div class="lzr-pin ${cls}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  })

interface Props {
  /** Draggable candidate pin (null = nothing chosen yet; marker sits at `start`) */
  value: { lat: number; lng: number } | null
  /** Where to show the marker before anything is chosen */
  start: { lat: number; lng: number }
  /** Store pin for reference */
  store: { lat: number; lng: number }
  kind: 'dock' | 'park'
  /** Bump to re-centre the map on `value` */
  recenterKey: number
  onMove: (lat: number, lng: number) => void
}

function Recentre({ pos, recenterKey }: { pos: [number, number]; recenterKey: number }) {
  const map = useMap()
  const first = useRef(true)
  const posRef = useRef(pos)
  useEffect(() => {
    posRef.current = pos
  })
  useEffect(() => {
    // Leaflet inside a freshly opened sheet needs a size refresh
    const t = setTimeout(() => map.invalidateSize(), 60)
    return () => clearTimeout(t)
  }, [map])
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    map.setView(posRef.current, Math.max(map.getZoom(), 17), { animate: false })
  }, [map, recenterKey])
  return null
}

function TapToMove({ onMove }: { onMove: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMove(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

export function PinPreviewMap({ value, start, store, kind, recenterKey, onMove }: Props) {
  const pos: [number, number] = value ? [value.lat, value.lng] : [start.lat, start.lng]
  const handlers = useMemo(
    () => ({
      dragend(e: L.LeafletEvent) {
        const ll = (e.target as L.Marker).getLatLng()
        onMove(ll.lat, ll.lng)
      },
    }),
    [onMove],
  )
  return (
    <div className="pin-preview" data-testid="pin-preview">
      <MapContainer center={pos} zoom={17} scrollWheelZoom={false} style={{ width: '100%', height: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <Recentre pos={pos} recenterKey={recenterKey} />
        <TapToMove onMove={onMove} />
        <Marker position={[store.lat, store.lng]} icon={icon('lzr-pin--ref')} interactive={false} />
        <Marker
          position={pos}
          draggable
          autoPan
          icon={icon(`lzr-pin--${kind} lzr-pin--mine lzr-pin--drag${value ? '' : ' lzr-pin--ghost'}`)}
          eventHandlers={handlers}
        />
      </MapContainer>
    </div>
  )
}
