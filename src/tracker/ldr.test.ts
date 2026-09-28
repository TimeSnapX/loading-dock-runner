import { describe, expect, it } from 'vitest'
import { RecorderCore } from './recorder'
import { offsetMetres } from './geo'
import {
  addRun,
  importBackup,
  loadLive,
  loadRuns,
  mergeRuns,
  readRunTrackerRuns,
  RT_RUNS_KEY,
  saveLive,
  TRIPS_KEY,
  type KV,
} from './storage'
import { buildGpx } from './gpx'
import { speedKmh } from './format'

class Mem implements KV {
  m = new Map<string, string>()
  getItem(k: string) {
    return this.m.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.m.set(k, v)
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
}

function drive(core: RecorderCore, n: number, stepM: number, dtMs: number, t0 = 1_700_000_000_000) {
  let p = { lat: -27.47, lon: 153.02 }
  for (let i = 0; i < n; i++) {
    const t = t0 + i * dtMs
    core.addFix({ lat: p.lat, lon: p.lon, acc: 8, t }, t)
    p = offsetMetres(p.lat, p.lon, stepM, 0)
  }
  return t0 + (n - 1) * dtMs
}

describe('driving recorder', () => {
  it('accepts truck speeds (25 m/s) and logs stops', () => {
    const c = new RecorderCore()
    c.start('t1')
    const end = drive(c, 41, 125, 5000) // 25 m/s = 90 km/h
    expect(c.distanceM).toBeGreaterThan(4900)
    expect(c.distanceM).toBeLessThan(5100)
    expect(c.addStop({ storeId: 's1', name: 'Store 1', suburb: 'X', at: end, lat: 0, lon: 0, distToStoreM: 40, tripDistM: c.distanceM })).toBe(true)
    const run = c.finish(end)
    expect(run.stops).toHaveLength(1)
    expect(run.kind).toBe('trip')
    expect(speedKmh(run.distanceM, run.movingMs)).toBeCloseTo(90, 0)
    expect(buildGpx(run)).toContain('<wpt')
  })
  it('rejects implausible jumps (> 45 m/s)', () => {
    const c = new RecorderCore()
    c.start('t2')
    drive(c, 3, 500, 5000) // 100 m/s
    expect(c.distanceM).toBe(0)
  })
  it('no stops when idle', () => {
    const c = new RecorderCore()
    expect(c.addStop({ storeId: 's', name: '', suburb: '', at: 0, lat: 0, lon: 0, distToStoreM: 0, tripDistM: 0 })).toBe(false)
  })
})

describe('storage', () => {
  it('uses ldr- keys, keeps stops through live snapshot', () => {
    const kv = new Mem()
    const c = new RecorderCore()
    c.start('t3')
    const end = drive(c, 5, 50, 5000)
    c.addStop({ storeId: 's1', name: 'S', suburb: 'X', at: end, lat: 1, lon: 2, distToStoreM: 3, tripDistM: 4 })
    saveLive(kv, c.snapshot(end))
    expect([...kv.m.keys()]).toEqual(['ldr-live-trip-v1'])
    expect(loadLive(kv)!.stops).toHaveLength(1)
    addRun(kv, c.finish(end))
    expect(kv.m.has(TRIPS_KEY)).toBe(true)
    expect(loadRuns(kv)[0].stops![0].storeId).toBe('s1')
  })
  it('imports Run Tracker runs without touching rt.runs.v1', () => {
    const kv = new Mem()
    const rt = JSON.stringify([
      { id: 'r1', startedAt: 1000, endedAt: 2000, movingMs: 900, distanceM: 1234, points: [[-27.4, 153, 1000, 5, null, 0, 0, 0]] },
    ])
    kv.setItem(RT_RUNS_KEY, rt)
    const runs = readRunTrackerRuns(kv)
    expect(runs[0].kind).toBe('run')
    expect(mergeRuns(kv, runs).added).toBe(1)
    expect(mergeRuns(kv, runs).added).toBe(0)
    expect(kv.getItem(RT_RUNS_KEY)).toBe(rt)
    expect(loadRuns(kv)[0].source).toBe('run-tracker')
  })
  it('imports a Run Tracker backup file', () => {
    const kv = new Mem()
    const res = importBackup(kv, JSON.stringify({ app: 'run-tracker', version: 1, runs: [{ id: 'a', startedAt: 5, points: [] }] }))
    expect(res.added).toBe(1)
    expect(() => importBackup(kv, '{"x":1}')).toThrow()
  })
})

describe('background gaps', () => {
  it('joins a >20 s GPS gap with an estimated leg and counts it', () => {
    const c = new RecorderCore()
    c.start('g1')
    let t = drive(c, 5, 100, 5000) // 400 m real
    const last = c.points[c.points.length - 1]
    const far = offsetMetres(last.lat, last.lon, 1500, 0)
    t += 60_000 // screen locked for a minute, 1.5 km driven (25 m/s)
    const r = c.addFix({ lat: far.lat, lon: far.lon, acc: 8, t }, t)
    expect(r.bridged).toBe(true)
    expect(c.points[c.points.length - 1].est).toBe(true)
    expect(c.distanceM).toBeGreaterThan(1850)
    const run = c.finish(t)
    expect(run.estimatedM).toBeGreaterThan(1450)
  })
  it('does not flag slow stationary periods as gaps when fixes keep arriving', () => {
    const c = new RecorderCore()
    c.start('g2')
    let t = drive(c, 3, 100, 5000)
    const last = c.points[c.points.length - 1]
    for (let i = 0; i < 10; i++) { t += 5000; c.addFix({ lat: last.lat, lon: last.lon, acc: 8, t }, t) } // jitter-rejected
    const next = offsetMetres(last.lat, last.lon, 60, 0)
    t += 5000
    expect(c.addFix({ lat: next.lat, lon: next.lon, acc: 8, t }, t).bridged).toBeFalsy()
  })
  it('auto-resumes a running trip from a snapshot and bridges the next fix', () => {
    const kv = new Mem()
    const c = new RecorderCore()
    c.start('g3')
    const t = drive(c, 4, 100, 5000)
    saveLive(kv, c.snapshot(t))
    const s = loadLive(kv)!
    const c2 = new RecorderCore()
    c2.restoreRunning(s, t + 120_000)
    expect(c2.status).toBe('recording')
    expect(c2.movingMs(t + 120_000)).toBeGreaterThanOrEqual(135_000)
    const last = c2.points[c2.points.length - 1]
    const far = offsetMetres(last.lat, last.lon, 2000, 0)
    const r = c2.addFix({ lat: far.lat, lon: far.lon, acc: 8, t: t + 125_000 }, t + 125_000)
    expect(r.bridged).toBe(true)
    // est flag survives pack/unpack
    saveLive(kv, c2.snapshot(t + 125_000))
    expect(loadLive(kv)!.points.at(-1)!.est).toBe(true)
  })
})
