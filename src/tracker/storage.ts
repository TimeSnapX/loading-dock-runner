import type { Run, Stop, TrackPoint } from './types'

/** Minimal Storage interface so logic can be tested without a browser. */
export interface KV {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
  removeItem(k: string): void
}

/** Loading Dock Runner's own keys (all prefixed `ldr-`). */
export const TRIPS_KEY = 'ldr-trips-v1'
export const LIVE_KEY = 'ldr-live-trip-v1'
export const SETTINGS_KEY = 'ldr-settings-v1'

/** Run Tracker's key on the same origin (read-only here; never written or deleted). */
export const RT_RUNS_KEY = 'rt.runs.v1'

// Compact point encoding: [lat, lon, t, acc, ele|null, seg, d, mt, est?]  (9th element 1 = estimated gap leg)
type PackedPoint =
  | [number, number, number, number, number | null, number, number, number]
  | [number, number, number, number, number | null, number, number, number, 1]

const r = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp

export function packPoints(points: TrackPoint[]): PackedPoint[] {
  return points.map((p): PackedPoint => {
    const a: PackedPoint = [
      r(p.lat, 7),
      r(p.lon, 7),
      Math.round(p.t),
      r(p.acc, 1),
      p.ele != null && Number.isFinite(p.ele) ? r(p.ele, 1) : null,
      p.seg,
      r(p.d, 1),
      Math.round(p.mt),
    ]
    return p.est ? [...a, 1] as PackedPoint : a
  })
}

export function unpackPoints(packed: unknown): TrackPoint[] {
  if (!Array.isArray(packed)) return []
  const out: TrackPoint[] = []
  for (const a of packed) {
    if (Array.isArray(a) && a.length >= 8 && typeof a[0] === 'number' && typeof a[1] === 'number') {
      const p: TrackPoint = { lat: a[0], lon: a[1], t: a[2], acc: a[3], ele: a[4], seg: a[5], d: a[6], mt: a[7] }
      if (a[8] === 1) p.est = true
      out.push(p)
    } else if (a && typeof a === 'object' && typeof (a as TrackPoint).lat === 'number') {
      out.push(a as TrackPoint)
    }
  }
  return out
}

function parseStops(v: unknown): Stop[] {
  if (!Array.isArray(v)) return []
  const out: Stop[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') continue
    const s = x as Record<string, unknown>
    if (typeof s.storeId !== 'string' || typeof s.at !== 'number') continue
    out.push({
      storeId: s.storeId,
      name: String(s.name ?? s.storeId),
      suburb: String(s.suburb ?? ''),
      at: s.at,
      lat: Number(s.lat) || 0,
      lon: Number(s.lon) || 0,
      distToStoreM: Number(s.distToStoreM) || 0,
      tripDistM: Number(s.tripDistM) || 0,
    })
  }
  return out.sort((a, b) => a.at - b.at)
}

interface StoredRun extends Omit<Run, 'points'> {
  points: PackedPoint[]
}

export function serialiseRun(run: Run): StoredRun {
  return { ...run, points: packPoints(run.points) }
}

export function deserialiseRun(o: unknown): Run | null {
  if (!o || typeof o !== 'object') return null
  const x = o as Record<string, unknown>
  if (typeof x.id !== 'string' || typeof x.startedAt !== 'number') return null
  const points = unpackPoints(x.points)
  return {
    id: x.id,
    startedAt: x.startedAt,
    endedAt: typeof x.endedAt === 'number' ? x.endedAt : x.startedAt,
    movingMs: typeof x.movingMs === 'number' ? x.movingMs : 0,
    distanceM: typeof x.distanceM === 'number' ? x.distanceM : points.length ? points[points.length - 1].d : 0,
    points,
    name: typeof x.name === 'string' ? x.name : undefined,
    stops: parseStops(x.stops),
    estimatedM: typeof x.estimatedM === 'number' ? x.estimatedM : undefined,
    kind: x.kind === 'run' ? 'run' : 'trip',
    source: x.source === 'run-tracker' || x.source === 'backup' ? x.source : undefined,
  }
}

export class StorageFullError extends Error {}

function safeSet(kv: KV, key: string, value: string) {
  try {
    kv.setItem(key, value)
  } catch (e) {
    throw new StorageFullError(
      'Phone storage for this app is full. Download a backup and delete some old trips, then try again. ' +
        String((e as Error)?.message ?? ''),
    )
  }
}

function parseRunList(raw: string | null): Run[] {
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr.map(deserialiseRun).filter((x): x is Run => !!x)
  } catch {
    return []
  }
}

export function loadRuns(kv: KV): Run[] {
  return parseRunList(kv.getItem(TRIPS_KEY)).sort((a, b) => b.startedAt - a.startedAt)
}

export function saveRuns(kv: KV, runs: Run[]) {
  safeSet(kv, TRIPS_KEY, JSON.stringify(runs.map(serialiseRun)))
}

export function addRun(kv: KV, run: Run): Run[] {
  const runs = loadRuns(kv).filter((x) => x.id !== run.id)
  runs.unshift(run)
  runs.sort((a, b) => b.startedAt - a.startedAt)
  saveRuns(kv, runs)
  return runs
}

export function deleteRun(kv: KV, id: string): Run[] {
  const runs = loadRuns(kv).filter((x) => x.id !== id)
  saveRuns(kv, runs)
  return runs
}

export function renameRun(kv: KV, id: string, name: string): Run[] {
  const runs = loadRuns(kv).map((x) => (x.id === id ? { ...x, name: name.trim() || undefined } : x))
  saveRuns(kv, runs)
  return runs
}

/** Merge runs into the trip list; entries whose id already exists are skipped. */
export function mergeRuns(kv: KV, incoming: Run[]): { added: number; skipped: number; total: number } {
  const existing = loadRuns(kv)
  const ids = new Set(existing.map((x) => x.id))
  let added = 0
  let skipped = 0
  for (const run of incoming) {
    if (ids.has(run.id)) {
      skipped++
      continue
    }
    existing.push(run)
    ids.add(run.id)
    added++
  }
  existing.sort((a, b) => b.startedAt - a.startedAt)
  if (added) saveRuns(kv, existing)
  return { added, skipped, total: existing.length }
}

// ---- Run Tracker (same origin) ----

/** Runs saved by Run Tracker on this phone (read-only). */
export function readRunTrackerRuns(kv: KV): Run[] {
  return parseRunList(kv.getItem(RT_RUNS_KEY)).map((x) => ({
    ...x,
    kind: 'run' as const,
    source: 'run-tracker' as const,
    stops: [],
  }))
}

// ---- In-progress trip snapshot (crash safety) ----

export interface LiveSnapshot {
  id: string
  startedAt: number
  accumulatedMs: number
  seg: number
  points: TrackPoint[]
  stops: Stop[]
  /** True if the trip was paused when saved. */
  paused?: boolean
  savedAt: number
}

export function saveLive(kv: KV, s: LiveSnapshot) {
  try {
    kv.setItem(LIVE_KEY, JSON.stringify({ ...s, points: packPoints(s.points) }))
  } catch {
    /* best effort – never break tracking because of storage */
  }
}

export function loadLive(kv: KV): LiveSnapshot | null {
  try {
    const raw = kv.getItem(LIVE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (!o || typeof o.id !== 'string') return null
    return {
      id: o.id,
      startedAt: o.startedAt,
      accumulatedMs: o.accumulatedMs || 0,
      seg: o.seg || 0,
      points: unpackPoints(o.points),
      stops: parseStops(o.stops),
      paused: !!o.paused,
      savedAt: o.savedAt || Date.now(),
    }
  } catch {
    return null
  }
}

export function clearLive(kv: KV) {
  kv.removeItem(LIVE_KEY)
}

// ---- Settings ----

export interface Settings {
  /** Show pace (min/km) alongside speed. */
  showPace: boolean
  autoFollow: boolean
  /** Show Liquorland stores on the Track map. */
  showStores: boolean
  /** Hold a screen Wake Lock while tracking. */
  keepScreenOn: boolean
}

export const DEFAULT_SETTINGS: Settings = { showPace: false, autoFollow: true, showStores: true, keepScreenOn: true }

export function loadSettings(kv: KV): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(kv.getItem(SETTINGS_KEY) || '{}') }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(kv: KV, s: Settings) {
  try {
    kv.setItem(SETTINGS_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

// ---- Backup / restore ----

export interface Backup {
  app: 'loading-dock-runner'
  kind: 'trips'
  version: 1
  exportedAt: string
  trips: StoredRun[]
}

export function buildBackup(kv: KV): Backup {
  return {
    app: 'loading-dock-runner',
    kind: 'trips',
    version: 1,
    exportedAt: new Date().toISOString(),
    trips: loadRuns(kv).map(serialiseRun),
  }
}

/**
 * Import a trips backup (this app) or a Run Tracker backup file (`app: 'run-tracker'`, `runs: [...]`).
 * Existing entries with the same id are kept.
 */
export function importBackup(kv: KV, json: string): { added: number; skipped: number; total: number } {
  let o: unknown
  try {
    o = JSON.parse(json.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('That is not valid JSON.')
  }
  const b = o as Record<string, unknown>
  let list: unknown[] | null = null
  let fromRt = false
  if (b && b.app === 'loading-dock-runner' && Array.isArray(b.trips)) list = b.trips
  else if (b && b.app === 'run-tracker' && Array.isArray(b.runs)) {
    list = b.runs
    fromRt = true
  } else if (Array.isArray(o)) list = o
  if (!list) throw new Error("That doesn't look like a Loading Dock Runner or Run Tracker backup.")
  const runs = list
    .map(deserialiseRun)
    .filter((x): x is Run => !!x)
    .map((x) => (fromRt ? { ...x, kind: 'run' as const, source: 'run-tracker' as const, stops: [] } : x))
  if (!runs.length) throw new Error('No trips found in that backup.')
  return mergeRuns(kv, runs)
}

export function newId(): string {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}
