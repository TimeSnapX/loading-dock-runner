import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Zone } from '../types/zone'
import { destCoords, hasParkCoords } from '../types/zone'
import { useNavigate } from 'react-router-dom'
import 'leaflet/dist/leaflet.css'

const pinIcon = (selected: boolean, kind: 'dock' | 'store' | 'park', mine = false) =>
  L.divIcon({
    className: 'lzr-marker',
    html: `<div class="lzr-pin lzr-pin--${kind}${selected ? ' lzr-pin--selected' : ''}${mine ? ' lzr-pin--mine' : ''}"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -28],
  })

function FitBounds({ zones, selectedId }: { zones: Zone[]; selectedId?: string }) {
  const map = useMap()

  useEffect(() => {
    if (!zones.length) return
    if (selectedId) {
      const z = zones.find((x) => x.id === selectedId)
      if (z) {
        const d = destCoords(z)
        map.flyTo([d.lat, d.lng], 14, { duration: 0.6 })
        return
      }
    }
    const points: [number, number][] = []
    for (const z of zones) {
      const d = destCoords(z)
      points.push([d.lat, d.lng])
      if (hasParkCoords(z)) points.push([z.parkLat!, z.parkLng!])
    }
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds.pad(0.15), { animate: false })
  }, [map, zones, selectedId])

  return null
}

interface Props {
  zones: Zone[]
  selectedId?: string
  onSelect?: (id: string) => void
  /** When true, also show park-up markers for zones that have coords */
  showParkMarkers?: boolean
}

export function ZoneMap({
  zones,
  selectedId,
  onSelect,
  showParkMarkers = true,
}: Props) {
  const navigate = useNavigate()
  const centre = useMemo<[number, number]>(() => {
    if (!zones.length) return [-27.47, 153.02]
    const coords = zones.map((z) => destCoords(z))
    const lat = coords.reduce((s, c) => s + c.lat, 0) / coords.length
    const lng = coords.reduce((s, c) => s + c.lng, 0) / coords.length
    return [lat, lng]
  }, [zones])

  return (
    <div className="map-wrap" role="region" aria-label="Liquorland loading dock map">
      <MapContainer
        center={centre}
        zoom={11}
        scrollWheelZoom={false}
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds zones={zones} selectedId={selectedId} />
        {zones.map((z) => {
          const d = destCoords(z)
          return (
            <Marker
              key={z.id}
              position={[d.lat, d.lng]}
              icon={pinIcon(z.id === selectedId, d.kind, d.kind === 'dock' && !!z.dockMine)}
              eventHandlers={{
                click: () => {
                  onSelect?.(z.id)
                },
              }}
            >
              <Popup>
                <strong>{z.name}</strong>
                <br />
                {z.suburb}
                <br />
                <span style={{ fontSize: 12, opacity: 0.85 }}>
                  {d.kind === 'dock'
                    ? z.dockMine
                      ? '📌 Your dock pin'
                      : 'Dock pin (bundled)'
                    : 'Store pin (dock TBD)'}
                </span>
                <br />
                <button
                  type="button"
                  onClick={() => navigate(`/zone/${z.id}`)}
                  style={{
                    marginTop: 6,
                    cursor: 'pointer',
                    fontWeight: 700,
                    background: '#ffbf00',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 10px',
                  }}
                >
                  Open
                </button>
              </Popup>
            </Marker>
          )
        })}
        {showParkMarkers
          ? zones
              .filter(hasParkCoords)
              .map((z) => (
                <Marker
                  key={`${z.id}-park`}
                  position={[z.parkLat!, z.parkLng!]}
                  icon={pinIcon(false, 'park', !!z.parkMine)}
                  eventHandlers={{
                    click: () => onSelect?.(z.id),
                  }}
                >
                  <Popup>
                    <strong>Park-up · {z.name}</strong>
                    <br />
                    <span style={{ fontSize: 12, opacity: 0.85 }}>
                      {z.parkMine ? '📌 Your park-up pin' : 'Park-up pin (bundled)'}
                    </span>
                    <br />
                    {z.parkNotes || 'Recommended truck park / approach'}
                  </Popup>
                </Marker>
              ))
          : null}
      </MapContainer>
    </div>
  )
}
