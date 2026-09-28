export type ZoneBrand = 'Liquorland' | 'Other'

export interface Zone {
  id: string
  name: string
  brand: ZoneBrand | string
  suburb: string
  region: string
  /** Storefront / store pin (always present) */
  lat: number
  lng: number
  /** Loading-dock pin when known; otherwise null — use store pin + dockNotes */
  dockLat: number | null
  dockLng: number | null
  dockNotes: string
  /** Optional recommended truck park-up / approach pin */
  parkLat: number | null
  parkLng: number | null
  parkNotes: string
  accessNotes: string
  window: string
  constraints: string
  tips: string[]
  tags: string[]
  starter?: boolean
  custom?: boolean
  /** The driver's home depot (not a store): always listed first, distinct badge and marker. */
  depot?: boolean
  /** Set when dock coords come from the driver's own saved pin (localStorage override) */
  dockMine?: boolean
  /** Set when park-up coords come from the driver's own saved pin */
  parkMine?: boolean
}

export type ZoneNotesMap = Record<string, string>

/** Prefer dock coords for nav/pin when present, else store lat/lng. */
export function destCoords(zone: Zone): { lat: number; lng: number; kind: 'dock' | 'store' } {
  if (zone.dockLat != null && zone.dockLng != null) {
    return { lat: zone.dockLat, lng: zone.dockLng, kind: 'dock' }
  }
  return { lat: zone.lat, lng: zone.lng, kind: 'store' }
}

export function hasParkCoords(zone: Zone): boolean {
  return zone.parkLat != null && zone.parkLng != null
}

export function isLiquorland(zone: Zone): boolean {
  const brand = (zone.brand || '').toLowerCase()
  if (brand === 'liquorland') return true
  return (zone.tags ?? []).some((t) => t.toLowerCase() === 'liquorland')
}

export function isDepot(zone: Zone): boolean {
  return !!zone.depot
}
