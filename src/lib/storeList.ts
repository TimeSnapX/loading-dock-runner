import { destCoords, isDepot, isLiquorland, type Zone } from '../types/zone'
import { distanceKm } from './geo'

export interface StoreListOpts {
  liquorlandOnly: boolean
  region: string | null
  query: string
  /** When set, sort by distance from this point (dock pin if known, else store pin). */
  near: { lat: number; lng: number } | null
}

/**
 * Filter + sort the Stores list. The home depot is ALWAYS first, whatever the
 * Liquorland-only / region / search / Nearest settings; they only apply to the stores after it.
 */
export function buildStoreList(zones: Zone[], o: StoreListOpts): Zone[] {
  const depots = zones.filter(isDepot)
  let list = zones.filter((z) => !isDepot(z))
  if (o.liquorlandOnly) list = list.filter(isLiquorland)
  if (o.region) list = list.filter((z) => z.region === o.region)

  const q = o.query.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (z) =>
        z.name.toLowerCase().includes(q) ||
        z.suburb.toLowerCase().includes(q) ||
        z.region.toLowerCase().includes(q) ||
        z.brand.toLowerCase().includes(q),
    )
  }

  if (o.near) {
    const { lat, lng } = o.near
    list = [...list].sort((a, b) => {
      const da = destCoords(a)
      const db = destCoords(b)
      return distanceKm(lat, lng, da.lat, da.lng) - distanceKm(lat, lng, db.lat, db.lng)
    })
  } else {
    list = [...list].sort((a, b) => a.suburb.localeCompare(b.suburb) || a.name.localeCompare(b.name))
  }
  return [...depots, ...list]
}
