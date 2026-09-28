import { FIRST_FIX_ACCURACY, GpsFilter, type FilterOptions } from './filter'
import type { RawFix, Run, Stop, TrackPoint } from './types'
import type { LiveSnapshot } from './storage'
import { distanceBetween } from './geo'

export type RecStatus = 'idle' | 'waiting' | 'recording' | 'paused'

export interface AddFixResult {
  accepted: boolean
  reason?: string
  /** Number of km splits newly completed by this fix. */
  newSplits: number
  /** True if this fix started the moving timer (first good fix after Start). */
  started?: boolean
  /** True if this fix was joined to the previous one across a GPS gap (estimated leg). */
  bridged?: boolean
  /** Length of that gap in ms. */
  gapMs?: number
}

/** No GPS fix at all for this long while tracking = a gap (screen locked, app in background, tunnel). */
export const GAP_MS = 20_000

export function estimatedDistance(points: TrackPoint[]): number {
  let m = 0
  for (let i = 1; i < points.length; i++) if (points[i].est) m += points[i].d - points[i - 1].d
  return m
}

/**
 * Framework-free run recorder: owns status, moving-time clock, segments and the GPS filter.
 * All times are passed in so it can be driven by synthetic data in tests.
 */
export class RecorderCore {
  status: RecStatus = 'idle'
  id = ''
  startedAt = 0
  points: TrackPoint[] = []
  stops: Stop[] = []
  seg = 0
  accumulatedMs = 0
  activeSince: number | null = null
  firstFixAccuracy = FIRST_FIX_ACCURACY
  private filter: GpsFilter
  private needAnchor = true
  private segHasPoints = false
  /** Time of the last fix received while recording (accepted or not). */
  private lastSeenT = 0

  constructor(filterOpts: Partial<FilterOptions> = {}) {
    this.filter = new GpsFilter(filterOpts)
  }

  movingMs(now: number): number {
    return this.accumulatedMs + (this.activeSince != null ? Math.max(0, now - this.activeSince) : 0)
  }

  get distanceM(): number {
    return this.points.length ? this.points[this.points.length - 1].d : 0
  }

  /** Press Start: wait for a decent fix before the clock and distance start. */
  start(id: string) {
    this.reset()
    this.id = id
    this.status = 'waiting'
  }

  /** Accept a weaker first fix (user chose "start anyway"). */
  relaxFirstFix() {
    this.firstFixAccuracy = this.filter.opts.maxAccuracy
  }

  pause(now: number) {
    if (this.status !== 'recording') return
    this.accumulatedMs = this.movingMs(now)
    this.activeSince = null
    this.status = 'paused'
  }

  resume(now: number) {
    if (this.status !== 'paused') return
    if (this.points.length) this.seg++
    this.segHasPoints = false
    this.needAnchor = true
    this.filter.reset()
    this.activeSince = now
    this.status = 'recording'
  }

  addFix(fix: RawFix, now: number): AddFixResult {
    if (this.status === 'waiting') {
      if (!(fix.acc <= this.firstFixAccuracy)) return { accepted: false, reason: 'waiting', newSplits: 0 }
      this.status = 'recording'
      this.startedAt = now
      this.activeSince = now
      this.needAnchor = true
      this.filter.reset()
      const r = this.addFix(fix, now)
      return { ...r, started: true }
    }
    if (this.status !== 'recording') return { accepted: false, reason: this.status, newSplits: 0 }

    // GPS gap: nothing at all received for a while (screen locked / app backgrounded).
    // Join the gap with a straight line and count it, marked as estimated.
    const seenBefore = this.lastSeenT
    this.lastSeenT = Math.max(this.lastSeenT, fix.t)
    const last = this.points.length ? this.points[this.points.length - 1] : null
    if (
      last &&
      !this.needAnchor &&
      last.seg === this.seg &&
      seenBefore &&
      fix.t - seenBefore > GAP_MS &&
      fix.acc <= this.filter.opts.maxAccuracy
    ) {
      const d = distanceBetween(last, fix)
      const dt = (fix.t - last.t) / 1000
      if (d >= this.filter.opts.minMove && dt > 0 && d / dt <= this.filter.opts.maxSpeed) {
        this.filter.reset(fix)
        const p: TrackPoint = {
          lat: fix.lat,
          lon: fix.lon,
          t: fix.t,
          acc: fix.acc,
          ele: fix.ele ?? null,
          seg: this.seg,
          d: last.d + d,
          mt: this.movingMs(now),
          est: true,
        }
        this.points.push(p)
        return { accepted: true, newSplits: 0, bridged: true, gapMs: fix.t - seenBefore }
      }
    }

    const v = this.filter.check(fix)
    if (!v.ok) return { accepted: false, reason: v.reason, newSplits: 0 }
    const before = this.distanceM
    const wasAnchor = this.needAnchor
    const add = wasAnchor || v.reanchor ? 0 : v.distance
    this.needAnchor = false
    // A re-anchor mid-segment starts a new segment so the map doesn't draw the bogus jump.
    if (v.reanchor && !wasAnchor && this.segHasPoints) this.seg++
    const p: TrackPoint = {
      lat: fix.lat,
      lon: fix.lon,
      t: fix.t,
      acc: fix.acc,
      ele: fix.ele ?? null,
      seg: this.seg,
      d: before + add,
      mt: this.movingMs(now),
    }
    this.segHasPoints = true
    this.points.push(p)
    const newSplits = Math.floor(p.d / 1000) - Math.floor(before / 1000)
    return { accepted: true, newSplits }
  }

  /** Log an arrival at a store (only while a trip is running or paused). */
  addStop(stop: Stop): boolean {
    if (this.status !== 'recording' && this.status !== 'paused') return false
    this.stops = [...this.stops, stop]
    return true
  }

  removeLastStop(): Stop | null {
    const last = this.stops[this.stops.length - 1] ?? null
    if (last) this.stops = this.stops.slice(0, -1)
    return last
  }

  snapshot(now: number): LiveSnapshot {
    return {
      id: this.id,
      startedAt: this.startedAt || now,
      accumulatedMs: this.movingMs(now),
      seg: this.seg,
      points: this.points,
      stops: this.stops,
      paused: this.status === 'paused',
      savedAt: now,
    }
  }

  /**
   * Auto-resume after the app was closed / killed mid-trip: carry on recording in the same segment,
   * anchored on the last point, so the next fix is joined across the gap as an estimated leg.
   * Time while the app was closed counts as trip time (you were still on the road).
   */
  restoreRunning(s: LiveSnapshot, now: number) {
    this.restore(s)
    if (s.paused) return
    this.accumulatedMs = s.accumulatedMs + Math.max(0, now - s.savedAt)
    this.activeSince = now
    this.status = 'recording'
    const last = this.points[this.points.length - 1]
    if (last) {
      this.filter.reset({ lat: last.lat, lon: last.lon, t: last.t, acc: last.acc })
      this.needAnchor = false
      this.segHasPoints = true
      this.lastSeenT = s.savedAt
    }
  }

  /** Restore from a crash snapshot into the paused state. */
  restore(s: LiveSnapshot) {
    this.reset()
    this.id = s.id
    this.startedAt = s.startedAt
    this.accumulatedMs = s.accumulatedMs
    this.seg = s.seg
    this.points = s.points
    this.stops = s.stops ?? []
    this.status = 'paused'
  }

  finish(now: number): Run {
    const movingMs = this.movingMs(now)
    const run: Run = {
      id: this.id,
      startedAt: this.startedAt || now,
      endedAt: now,
      movingMs,
      distanceM: this.distanceM,
      points: this.points,
      stops: this.stops,
      estimatedM: Math.round(estimatedDistance(this.points)),
      kind: 'trip',
    }
    this.reset()
    return run
  }

  reset() {
    this.status = 'idle'
    this.id = ''
    this.startedAt = 0
    this.points = []
    this.stops = []
    this.lastSeenT = 0
    this.seg = 0
    this.accumulatedMs = 0
    this.activeSince = null
    this.needAnchor = true
    this.segHasPoints = false
    this.firstFixAccuracy = FIRST_FIX_ACCURACY
    this.filter.reset()
  }
}
