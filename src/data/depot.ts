import type { Zone } from '../types/zone'

/**
 * The driver's home depot. Not a Liquorland store: it has its own id (never collides with the
 * bundled `ll-seq-###` ids) and is always pinned to the top of the Stores list.
 *
 * Coordinates: OpenStreetMap / Nominatim — the "BEVCHAIN" warehouse building (OSM way 1361911170,
 * addressed to Clyde Gessel Place, TradeCoast Central, Eagle Farm QLD 4009), building centroid.
 */
export const DEPOT_ID = 'depot-eagle-farm'

export const DEPOT_SEED: Zone = {
  id: DEPOT_ID,
  name: 'Depot - Eagle Farm',
  brand: 'BevChain',
  suburb: 'Eagle Farm',
  region: 'Brisbane metro',
  lat: -27.422364,
  lng: 153.091497,
  dockLat: null,
  dockLng: null,
  dockNotes: '',
  parkLat: null,
  parkLng: null,
  parkNotes: '',
  accessNotes: '51 Clyde Gessel Pl, Eagle Farm QLD 4009',
  window: '',
  constraints: 'BevChain / Linfox Eagle Farm depot (home depot)',
  tips: ['Home depot — set your own dock / park-up pins with Set dock / Set park-up'],
  tags: ['depot', 'bevchain', 'linfox'],
  starter: false,
  depot: true,
}
