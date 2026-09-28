import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Stop, TrackPoint } from '../tracker/types'
import { destCoords, type Zone } from '../types/zone'

interface Props {
  points: TrackPoint[]
  /** Liquorland stores to show as small markers. */
  zones?: Zone[]
  /** Arrivals to mark on the map. */
  stops?: Stop[]
  /** Store to highlight (e.g. the nearest one). */
  highlightId?: string | null
  current?: { lat: number; lon: number; acc: number } | null
  follow?: boolean
  onUserPan?: () => void
  /** Fit the whole route (history detail). */
  fit?: boolean
  onOpenStore?: (id: string) => void
  className?: string
}

const AMBER = '#ffbf00'
const BRISBANE: L.LatLngTuple = [-27.4698, 153.0251]

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/** Plain-Leaflet map for trips: stores + route + live position + arrivals. */
export function TrackMap({
  points,
  zones,
  stops,
  highlightId,
  current,
  follow,
  onUserPan,
  fit,
  onOpenStore,
  className,
}: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const storeLayer = useRef<L.LayerGroup | null>(null)
  const route = useRef<L.LayerGroup | null>(null)
  const stopLayer = useRef<L.LayerGroup | null>(null)
  const marker = useRef<L.CircleMarker | null>(null)
  const accCircle = useRef<L.Circle | null>(null)
  const panCb = useRef(onUserPan)
  panCb.current = onUserPan
  const openCb = useRef(onOpenStore)
  openCb.current = onOpenStore
  const centred = useRef(false)

  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { zoomControl: false, attributionControl: true, zoomAnimation: !fit, fadeAnimation: !fit }).setView(BRISBANE, 11)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    storeLayer.current = L.layerGroup().addTo(m)
    route.current = L.layerGroup().addTo(m)
    stopLayer.current = L.layerGroup().addTo(m)
    m.on('dragstart', () => panCb.current?.())
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    // Popup "Open" buttons
    const onClick = (e: MouseEvent) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-open-store]')
      if (t) openCb.current?.(t.dataset.openStore!)
    }
    el.current.addEventListener('click', onClick)
    const node = el.current
    return () => {
      node.removeEventListener('click', onClick)
      ro.disconnect()
      m.stop() // cancel any pan/zoom animation so it can't fire after removal
      m.off()
      m.remove()
      map.current = null
      marker.current = null
      accCircle.current = null
      centred.current = false
    }
  }, [])

  // Stores
  useEffect(() => {
    const g = storeLayer.current
    if (!g) return
    g.clearLayers()
    for (const z of zones ?? []) {
      const d = destCoords(z)
      const hi = z.id === highlightId
      if (z.depot) {
        L.marker([d.lat, d.lng], {
          icon: L.divIcon({
            className: 'ldr-depot-icon',
            html: `<div class="ldr-depot${hi ? ' ldr-depot--hi' : ''}${d.kind === 'dock' && z.dockMine ? ' ldr-depot--mine' : ''}" title="Depot">🏭</div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 17],
            popupAnchor: [0, -17],
          }),
          zIndexOffset: 1000,
        })
          .bindPopup(
            `<strong>🏭 ${esc(z.name)}</strong><br>Depot · ${esc(z.accessNotes || z.suburb)}<br><span style="font-size:12px;opacity:.8">${
              d.kind === 'dock' ? (z.dockMine ? '📌 Your dock pin' : 'Dock pin') : 'Depot pin (dock TBD)'
            }</span><br><button type="button" class="map-open" data-open-store="${esc(z.id)}">Open</button>`,
          )
          .addTo(g)
        continue
      }
      L.circleMarker([d.lat, d.lng], {
        radius: hi ? 9 : 6,
        color: '#111',
        weight: 2,
        fillColor: hi ? '#3dd68c' : d.kind === 'dock' ? AMBER : '#e8e3d0',
        fillOpacity: 0.95,
        className: 'ldr-store-dot',
      })
        .bindPopup(
          `<strong>${esc(z.name)}</strong><br>${esc(z.suburb)}<br><span style="font-size:12px;opacity:.8">${
            d.kind === 'dock' ? (z.dockMine ? '📌 Your dock pin' : 'Dock pin') : 'Store pin (dock TBD)'
          }</span><br><button type="button" class="map-open" data-open-store="${esc(z.id)}">Open</button>`,
        )
        .addTo(g)
    }
  }, [zones, highlightId])

  // Route: one polyline per segment
  const n = points.length
  const lastSeg = n ? points[n - 1].seg : -1
  useEffect(() => {
    const g = route.current
    const m = map.current
    if (!g || !m) return
    g.clearLayers()
    // Solid runs of real GPS; a point flagged `est` is reached by a dashed straight line across a GPS gap.
    const solid: L.LatLngTuple[][] = []
    const dashed: L.LatLngTuple[][] = []
    let cur: L.LatLngTuple[] = []
    for (let i = 0; i < points.length; i++) {
      const p = points[i]
      const prev = i ? points[i - 1] : null
      const ll: L.LatLngTuple = [p.lat, p.lon]
      if (!prev || prev.seg !== p.seg) {
        if (cur.length) solid.push(cur)
        cur = [ll]
      } else if (p.est) {
        if (cur.length) solid.push(cur)
        dashed.push([[prev.lat, prev.lon], ll])
        cur = [ll]
      } else cur.push(ll)
    }
    if (cur.length) solid.push(cur)
    for (const latlngs of solid) {
      L.polyline(latlngs, { color: '#000', weight: 9, opacity: 0.45, interactive: false }).addTo(g)
      L.polyline(latlngs, { color: AMBER, weight: 5, opacity: 1, className: 'ldr-route', interactive: false }).addTo(g)
    }
    for (const latlngs of dashed) {
      L.polyline(latlngs, {
        color: AMBER,
        weight: 4,
        opacity: 0.9,
        dashArray: '8 10',
        className: 'ldr-route-est',
      })
        .bindTooltip('Estimated — no GPS (screen was off / app in background)')
        .addTo(g)
    }
    if (fit && n) {
      const s = points[0]
      const e = points[n - 1]
      L.circleMarker([s.lat, s.lon], { radius: 7, color: '#111', weight: 2, fillColor: '#3ddc84', fillOpacity: 1 })
        .bindTooltip('Start')
        .addTo(g)
      L.circleMarker([e.lat, e.lon], { radius: 7, color: '#111', weight: 2, fillColor: '#ff5252', fillOpacity: 1 })
        .bindTooltip('Finish')
        .addTo(g)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, lastSeg, fit, points])

  // Arrivals
  const stopCount = stops?.length ?? 0
  useEffect(() => {
    const g = stopLayer.current
    if (!g) return
    g.clearLayers()
    ;(stops ?? []).forEach((s, i) => {
      L.marker([s.lat, s.lon], {
        icon: L.divIcon({
          className: 'ldr-stop-icon',
          html: `<div class="ldr-stop">${i + 1}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        }),
      })
        .bindTooltip(`${i + 1}. ${esc(s.name)}`)
        .addTo(g)
    })
  }, [stopCount, stops])

  // Fit route + stops on detail view
  useEffect(() => {
    const m = map.current
    if (!m || !fit) return
    const ll: L.LatLngTuple[] = points.map((p) => [p.lat, p.lon])
    for (const s of stops ?? []) ll.push([s.lat, s.lon])
    if (ll.length > 1) m.fitBounds(L.latLngBounds(ll), { padding: [24, 24], animate: false })
    else if (ll.length === 1) m.setView(ll[0], 15, { animate: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, n, stopCount])

  // Live marker
  useEffect(() => {
    const m = map.current
    if (!m || !current) return
    const ll: L.LatLngTuple = [current.lat, current.lon]
    if (!marker.current) {
      accCircle.current = L.circle(ll, {
        radius: current.acc,
        color: '#4da3ff',
        weight: 1,
        fillColor: '#4da3ff',
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(m)
      marker.current = L.circleMarker(ll, {
        radius: 9,
        color: '#fff',
        weight: 3,
        fillColor: '#4da3ff',
        fillOpacity: 1,
        interactive: false,
        className: 'ldr-me',
      }).addTo(m)
    } else {
      marker.current.setLatLng(ll)
      accCircle.current?.setLatLng(ll).setRadius(current.acc)
    }
    if (!centred.current) {
      m.setView(ll, 15, { animate: false })
      centred.current = true
    } else if (follow) {
      m.panTo(ll, { animate: true, duration: 0.5 })
    }
  }, [current?.lat, current?.lon, current?.acc, follow]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className={className ?? 'track-map'} data-testid="track-map" />
}
