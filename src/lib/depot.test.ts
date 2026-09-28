import { describe, expect, it } from 'vitest'
import seedZones from '../data/zones.json'
import { DEPOT_ID, DEPOT_SEED } from '../data/depot'
import { buildStoreList } from './storeList'
import { nearestStores } from './nearest'
import type { Zone } from '../types/zone'

const stores = seedZones as unknown as Zone[]
const all: Zone[] = [...stores, DEPOT_SEED] // depot deliberately last in input
const base = { liquorlandOnly: true, region: null, query: '', near: null }

describe('home depot', () => {
  it('has its own id and does not collide with bundled store ids', () => {
    expect(stores.some((z) => z.id === DEPOT_ID)).toBe(false)
    expect(stores).toHaveLength(151)
    expect(stores[0].id).toBe('ll-seq-001')
  })
  it('sits on Clyde Gessel Place, Eagle Farm', () => {
    // OSM way 267344427 (Clyde Gessel Place) bbox, padded ~150 m
    expect(DEPOT_SEED.lat).toBeGreaterThan(-27.4247)
    expect(DEPOT_SEED.lat).toBeLessThan(-27.419)
    expect(DEPOT_SEED.lng).toBeGreaterThan(153.0900)
    expect(DEPOT_SEED.lng).toBeLessThan(153.0948)
  })
  it('is always first: default, Liquorland only, region, search, Nearest', () => {
    const cases = [
      base,
      { ...base, liquorlandOnly: false },
      { ...base, region: 'Gold Coast' },
      { ...base, region: 'Sunshine Coast', liquorlandOnly: false },
      { ...base, query: 'Albany' },
      { ...base, query: 'zzz-no-match' },
      { ...base, near: { lat: -27.365, lng: 152.97 } },
      { ...base, near: { lat: -28.0, lng: 153.43 }, region: 'Gold Coast', query: 'liquorland' },
    ]
    for (const c of cases) {
      const list = buildStoreList(all, c)
      expect(list[0].id).toBe(DEPOT_ID)
      expect(list.filter((z) => z.id === DEPOT_ID)).toHaveLength(1)
    }
    expect(buildStoreList(all, base)).toHaveLength(152)
    expect(buildStoreList(all, { ...base, query: 'zzz-no-match' })).toHaveLength(1)
    expect(buildStoreList(all, { ...base, query: 'Albany' })[1].suburb).toContain('Albany')
  })
  it('is offered by the Arrive picker when it is the nearest', () => {
    const near = nearestStores(all, DEPOT_SEED.lat + 0.0005, DEPOT_SEED.lng, 5)
    expect(near[0].zone.id).toBe(DEPOT_ID)
    expect(near[0].zone.name).toBe('Depot - Eagle Farm')
    expect(near[0].distM).toBeLessThan(100)
  })
})
