import { destCoords, type Zone } from '../types/zone'
import { distanceKm } from './geo'

export interface NearStore {
  zone: Zone
  /** Straight-line distance in metres to the dock pin (if known) or store pin. */
  distM: number
}

/** The n closest stores to a point, using the dock pin when known, else the store pin. */
export function nearestStores(zones: Zone[], lat: number, lon: number, n = 5): NearStore[] {
  const out: NearStore[] = []
  for (const z of zones) {
    const d = destCoords(z)
    if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue
    out.push({ zone: z, distM: distanceKm(lat, lon, d.lat, d.lng) * 1000 })
  }
  out.sort((a, b) => a.distM - b.distM)
  return out.slice(0, n)
}
