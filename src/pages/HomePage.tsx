import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SearchBar } from '../components/SearchBar'
import { ZoneCard } from '../components/ZoneCard'
import { ZoneMap } from '../components/ZoneMap'
import { distanceKm, formatDistanceKm } from '../lib/geo'
import { destCoords, isDepot, type Zone } from '../types/zone'
import { buildStoreList } from '../lib/storeList'
import { countPins, type PinOverrides } from '../lib/pins'

interface Props {
  zones: Zone[]
  pins: PinOverrides
}

type GeoState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; lat: number; lng: number }
  | { status: 'denied'; message: string }

const REGION_CHIPS = [
  'Brisbane metro',
  'Gold Coast',
  'Sunshine Coast',
  'Other SEQ',
] as const

export function HomePage({ zones, pins }: Props) {
  const pinCount = countPins(pins)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<'map' | 'list'>('list')
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [liquorlandOnly, setLiquorlandOnly] = useState(true)
  const [regionFilter, setRegionFilter] = useState<string | null>(null)
  const [nearestOn, setNearestOn] = useState(false)
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })

  const requestNearest = useCallback(() => {
    if (!navigator.geolocation) {
      setGeo({ status: 'denied', message: 'Geolocation not supported on this device.' })
      setNearestOn(false)
      return
    }
    setGeo({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeo({
          status: 'ready',
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setNearestOn(true)
        setTab('list')
      },
      (err) => {
        setNearestOn(false)
        setGeo({
          status: 'denied',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location denied — search by suburb instead.'
              : 'Could not get location — try again or search by suburb.',
        })
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 60_000 },
    )
  }, [])

  const filtered = useMemo(
    () =>
      buildStoreList(zones, {
        liquorlandOnly,
        region: regionFilter,
        query,
        near: nearestOn && geo.status === 'ready' ? { lat: geo.lat, lng: geo.lng } : null,
      }),
    [zones, liquorlandOnly, regionFilter, query, nearestOn, geo],
  )

  const storeCount = filtered.filter((z) => !isDepot(z)).length
  const depotNote = filtered.some(isDepot) ? ' + depot' : ''

  const distLabel = (z: Zone): string | null => {
    if (!nearestOn || geo.status !== 'ready') return null
    const d = destCoords(z)
    return formatDistanceKm(distanceKm(geo.lat, geo.lng, d.lat, d.lng))
  }

  return (
    <div className="page">
      <div className="badge" role="status">
        151 Liquorland SEQ — verify dock on site
      </div>

      <SearchBar value={query} onChange={setQuery} />

      <div className="filter-row" role="group" aria-label="Filters">
        <button
          type="button"
          className={`chip ${liquorlandOnly ? 'chip--on' : ''}`}
          aria-pressed={liquorlandOnly}
          onClick={() => setLiquorlandOnly((v) => !v)}
        >
          Liquorland only
        </button>
        <button
          type="button"
          className={`chip chip--accent ${nearestOn && geo.status === 'ready' ? 'chip--on' : ''}`}
          aria-pressed={nearestOn && geo.status === 'ready'}
          disabled={geo.status === 'loading'}
          onClick={() => {
            if (nearestOn && geo.status === 'ready') {
              setNearestOn(false)
              return
            }
            requestNearest()
          }}
        >
          {geo.status === 'loading' ? 'Locating…' : nearestOn ? 'Nearest ✓' : 'Nearest'}
        </button>
      </div>

      <div className="filter-row filter-row--regions" role="group" aria-label="Region">
        {REGION_CHIPS.map((r) => (
          <button
            key={r}
            type="button"
            className={`chip chip--sm ${regionFilter === r ? 'chip--on' : ''}`}
            aria-pressed={regionFilter === r}
            onClick={() => setRegionFilter((cur) => (cur === r ? null : r))}
          >
            {r}
          </button>
        ))}
      </div>

      {geo.status === 'denied' ? (
        <p className="muted geo-msg" role="status">
          {geo.message}
        </p>
      ) : null}
      {nearestOn && geo.status === 'ready' ? (
        <p className="muted geo-msg" role="status">
          Sorted by distance to dock / store pin from you.
        </p>
      ) : null}

      <div className="tabs" role="tablist" aria-label="View">
        <button
          type="button"
          className="tabs__btn"
          role="tab"
          aria-selected={tab === 'map'}
          onClick={() => setTab('map')}
        >
          Map
        </button>
        <button
          type="button"
          className="tabs__btn"
          role="tab"
          aria-selected={tab === 'list'}
          onClick={() => setTab('list')}
        >
          List
        </button>
      </div>

      {tab === 'map' ? (
        <>
          <ZoneMap
            zones={filtered}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id)
            }}
          />
          <p className="muted" style={{ margin: 0 }}>
            {storeCount} store{storeCount === 1 ? '' : 's'}
            {depotNote}
            {selectedId
              ? ' · tap a pin, then open below'
              : ' · tap a pin or switch to List'}
          </p>
          {selectedId ? (
            (() => {
              const z = filtered.find((x) => x.id === selectedId)
              return z ? (
                <ZoneCard
                  zone={z}
                  distanceLabel={distLabel(z)}
                  onClick={() => navigate(`/zone/${z.id}`)}
                />
              ) : null
            })()
          ) : (
            <div className="list">
              {filtered.slice(0, 3).map((z) => (
                <ZoneCard
                  key={z.id}
                  zone={z}
                  distanceLabel={distLabel(z)}
                  onClick={() => navigate(`/zone/${z.id}`)}
                />
              ))}
              {filtered.length > 3 ? (
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  onClick={() => setTab('list')}
                >
                  Show all {storeCount}{depotNote} in list
                </button>
              ) : null}
            </div>
          )}
        </>
      ) : (
        <div className="list list--scroll">
          <p className="muted list__count" role="status">
            {storeCount} store{storeCount === 1 ? '' : 's'}
            {depotNote}
            {regionFilter ? ` · ${regionFilter}` : ''}
          </p>
          {filtered.map((z) =>
            isDepot(z) ? (
              <ZoneCard
                key={z.id}
                zone={z}
                distanceLabel={distLabel(z)}
                onClick={() => navigate(`/zone/${z.id}`)}
              />
            ) : null,
          )}
          {storeCount === 0 ? (
            <div className="card empty">
              No stores match
              {query ? ` “${query}”` : ''}
              {liquorlandOnly ? ' (Liquorland only on)' : ''}
              {regionFilter ? ` · ${regionFilter}` : ''}.
            </div>
          ) : (
            filtered.filter((z) => !isDepot(z)).map((z) => (
              <ZoneCard
                key={z.id}
                zone={z}
                distanceLabel={distLabel(z)}
                onClick={() => navigate(`/zone/${z.id}`)}
              />
            ))
          )}
        </div>
      )}

      <div className="fab-bar">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() => navigate('/add')}
        >
          + Add custom store
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => navigate('/pins')}
        >
          📌 My pins ({pinCount})
        </button>
      </div>
    </div>
  )
}
