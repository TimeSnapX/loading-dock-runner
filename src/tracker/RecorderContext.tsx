import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { estimatedDistance, RecorderCore, type RecStatus } from './recorder'
import type { RawFix, Run, Stop, TrackPoint } from './types'
import {
  addRun,
  clearLive,
  deleteRun as deleteRunKV,
  loadLive,
  loadRuns,
  loadSettings,
  newId,
  saveLive,
  saveSettings,
  type LiveSnapshot,
  type Settings,
  DEFAULT_SETTINGS,
  mergeRuns,
  readRunTrackerRuns,
  renameRun as renameRunKV,
  importBackup as importBackupKV,
} from './storage'
import { FIRST_FIX_ACCURACY } from './filter'

export type GpsQuality = 'off' | 'searching' | 'weak' | 'ok' | 'good'

export interface GpsState {
  fix: RawFix | null
  /** Date.now() when the last fix arrived. */
  at: number
  error: { code: number; message: string } | null
}

export interface WakeState {
  supported: boolean
  active: boolean
  error: string | null
}

interface Ctx {
  status: RecStatus
  points: TrackPoint[]
  stops: Stop[]
  /** Log arrival at a store. Returns the stop, or null if no trip is running. */
  addStop: (s: Omit<Stop, 'at' | 'tripDistM' | 'lat' | 'lon'> & { lat: number; lon: number }) => Stop | null
  undoStop: () => void
  /** Copy Run Tracker runs (same phone/origin) into trip history. */
  importRunTracker: () => { added: number; skipped: number; found: number }
  importBackup: (json: string) => { added: number; skipped: number; total: number }
  renameRun: (id: string, name: string) => void
  distanceM: number
  movingMs: number
  gps: GpsState
  quality: GpsQuality
  wake: WakeState
  /** Latest GPS gap: how long, and the estimated straight-line distance added (null = none added). */
  gap: { ms: number; estM: number | null } | null
  /** Part of the current trip distance that is estimated across gaps (m). */
  estimatedM: number
  /** Set when a trip was automatically resumed on reopen. */
  autoResumed: { closedMs: number } | null
  dismissAutoResumed: () => void
  dismissGap: () => void
  recovered: LiveSnapshot | null
  resumeRecovered: () => void
  saveRecovered: () => Run | null
  discardRecovered: () => void
  start: () => void
  startAnyway: () => void
  canStartAnyway: boolean
  cancelWaiting: () => void
  pause: () => void
  resume: () => void
  finish: () => Run | null
  discard: () => void
  setWarm: (on: boolean) => void
  retryGps: () => void
  runs: Run[]
  deleteRun: (id: string) => void
  reloadRuns: () => void
  settings: Settings
  updateSettings: (s: Partial<Settings>) => void
  storageError: string | null
  clearStorageError: () => void
  geoSupported: boolean
}

const RecorderCtx = createContext<Ctx | null>(null)

export function useRecorder(): Ctx {
  const c = useContext(RecorderCtx)
  if (!c) throw new Error('useRecorder outside provider')
  return c
}

const SAVE_EVERY_MS = 5000
const AUTO_RESUME_MS = 12 * 60 * 60 * 1000

export function qualityOf(gps: GpsState, now: number): GpsQuality {
  if (gps.error) return 'off'
  if (!gps.fix || now - gps.at > 15_000) return 'searching'
  const a = gps.fix.acc
  if (a > 50) return 'weak'
  if (a > FIRST_FIX_ACCURACY) return 'ok'
  return 'good'
}

export function RecorderProvider({ children }: { children: ReactNode }) {
  const kv = typeof localStorage !== 'undefined' ? localStorage : null
  const core = useRef(new RecorderCore())
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const [now, setNow] = useState(() => Date.now())
  const [warm, setWarmState] = useState(0)
  const [watchKey, setWatchKey] = useState(0)
  const [gps, setGps] = useState<GpsState>({ fix: null, at: 0, error: null })
  const [wake, setWake] = useState<WakeState>({
    supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
    active: false,
    error: null,
  })
  const [gap, setGap] = useState<{ ms: number; estM: number | null } | null>(null)
  // Auto-resume: a trip saved in the last 12 h is picked straight back up (recording again, gap bridged
  // on the next fix). Older snapshots are offered via the Resume / Save / Discard banner instead.
  const boot = useRef<{ snap: LiveSnapshot | null; auto: { closedMs: number } | null } | null>(null)
  if (!boot.current) {
    const s = kv ? loadLive(kv) : null
    const t = Date.now()
    if (s && s.points.length && t - s.savedAt < AUTO_RESUME_MS) {
      core.current.restoreRunning(s, t)
      boot.current = { snap: null, auto: { closedMs: t - s.savedAt } }
    } else boot.current = { snap: s && s.points.length ? s : null, auto: null }
  }
  const [recovered, setRecovered] = useState<LiveSnapshot | null>(() => boot.current!.snap)
  const [autoResumed, setAutoResumed] = useState<{ closedMs: number } | null>(() => boot.current!.auto)
  const [runs, setRuns] = useState<Run[]>(() => (kv ? loadRuns(kv) : []))
  const [settings, setSettings] = useState<Settings>(() => (kv ? loadSettings(kv) : { ...DEFAULT_SETTINGS }))
  const [storageError, setStorageError] = useState<string | null>(null)
  const lastAcceptedAt = useRef(0)

  const status = core.current.status
  const geoSupported = typeof navigator !== 'undefined' && 'geolocation' in navigator
  const wantGps = warm > 0 || status !== 'idle'

  // ---- Persistence ----
  const persist = useCallback(() => {
    const c = core.current
    if (!kv || c.status === 'idle' || !c.points.length) return
    saveLive(kv, c.snapshot(Date.now()))
  }, [kv])

  // ---- Geolocation ----
  useEffect(() => {
    if (!wantGps || !geoSupported) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const t = Date.now()
        // Some devices report odd timestamps; fall back to the local clock if it's way off.
        const ts = Math.abs(pos.timestamp - t) < 60_000 ? pos.timestamp : t
        const fix: RawFix = {
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: pos.coords.accuracy,
          ele: pos.coords.altitude,
          t: ts,
        }
        setGps({ fix, at: t, error: null })
        const c = core.current
        const prevD = c.distanceM
        const r = c.addFix(fix, t)
        if (r.accepted) {
          if (r.bridged) setGap({ ms: r.gapMs ?? 0, estM: c.distanceM - prevD })
          lastAcceptedAt.current = t
          // Save the in-progress trip on every accepted GPS point, so a backgrounded/killed tab loses nothing.
          persist()
          bump()
        }
      },
      (err) => {
        // TIMEOUT is not fatal for a watch; keep going.
        if (err.code === err.TIMEOUT) return
        setGps((g) => ({ ...g, error: { code: err.code, message: err.message } }))
      },
      { enableHighAccuracy: true, maximumAge: 0 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [wantGps, geoSupported, watchKey, persist])

  // ---- Clock + periodic save ----
  useEffect(() => {
    if (status === 'idle') return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    const save = setInterval(persist, SAVE_EVERY_MS)
    return () => {
      clearInterval(tick)
      clearInterval(save)
    }
  }, [status, persist])

  // Keep the GPS indicator fresh even when idle.
  useEffect(() => {
    if (!wantGps || status !== 'idle') return
    const tick = setInterval(() => setNow(Date.now()), 3000)
    return () => clearInterval(tick)
  }, [wantGps, status])

  // ---- Wake lock + visibility gap detection ----
  const active = status !== 'idle'
  const keepOn = settings.keepScreenOn
  useEffect(() => {
    if (!active) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false
    let hiddenAt = 0
    let acceptedAtHide = 0

    const acquire = async () => {
      if (!keepOn) {
        setWake((w) => ({ ...w, active: false, error: null }))
        return
      }
      if (!('wakeLock' in navigator)) {
        setWake({ supported: false, active: false, error: null })
        return
      }
      if (sentinel && !sentinel.released) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) {
          s.release().catch(() => {})
          return
        }
        sentinel = s
        setWake({ supported: true, active: true, error: null })
        s.addEventListener('release', () => {
          if (!cancelled) setWake((w) => ({ ...w, active: false }))
        })
      } catch (e) {
        setWake({ supported: true, active: false, error: (e as Error)?.message || 'Wake lock refused' })
      }
    }

    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        acceptedAtHide = lastAcceptedAt.current
        persist()
      } else {
        acquire() // Wake Lock is dropped when the page is hidden; take it again.
        const away = Date.now() - hiddenAt
        if (hiddenAt && core.current.status === 'recording' && away > 10_000 && lastAcceptedAt.current <= acceptedAtHide) {
          setGap({ ms: away, estM: null })
          // Restart the GPS watch to get a fresh fix straight away; that fix is joined across the gap.
          setWatchKey((k) => k + 1)
        }
        hiddenAt = 0
        setNow(Date.now())
      }
    }
    const onHide = () => persist()

    acquire()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onHide)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onHide)
      sentinel?.release().catch(() => {})
      setWake((w) => ({ ...w, active: false }))
    }
  }, [active, persist, keepOn])

  // ---- Actions ----
  const start = useCallback(() => {
    const c = core.current
    c.start(newId())
    setAutoResumed(null)
    // If we already have a good, fresh fix, feed it straight in.
    if (gps.fix && Date.now() - gps.at < 5000) c.addFix(gps.fix, Date.now())
    setGap(null)
    setNow(Date.now())
    bump()
  }, [gps])

  const startAnyway = useCallback(() => {
    const c = core.current
    c.relaxFirstFix()
    if (gps.fix && Date.now() - gps.at < 5000) c.addFix(gps.fix, Date.now())
    bump()
  }, [gps])

  const cancelWaiting = useCallback(() => {
    core.current.reset()
    bump()
  }, [])

  const pause = useCallback(() => {
    core.current.pause(Date.now())
    persist()
    setNow(Date.now())
    bump()
  }, [persist])

  const resume = useCallback(() => {
    core.current.resume(Date.now())
    setGap(null)
    setNow(Date.now())
    bump()
  }, [])

  const saveRunSafely = useCallback(
    (run: Run): boolean => {
      if (!kv) return false
      try {
        setRuns(addRun(kv, run))
        clearLive(kv)
        return true
      } catch (e) {
        setStorageError((e as Error).message)
        // Keep the live snapshot so nothing is lost.
        return false
      }
    },
    [kv],
  )

  const finish = useCallback((): Run | null => {
    const c = core.current
    if (!c.points.length) {
      c.reset()
      if (kv) clearLive(kv)
      bump()
      return null
    }
    const snap = c.snapshot(Date.now())
    const run = c.finish(Date.now())
    if (!saveRunSafely(run)) {
      c.restore(snap)
      bump()
      return null
    }
    setGap(null)
    bump()
    return run
  }, [kv, saveRunSafely])

  const discard = useCallback(() => {
    core.current.reset()
    if (kv) clearLive(kv)
    setGap(null)
    bump()
  }, [kv])

  const resumeRecovered = useCallback(() => {
    if (!recovered) return
    core.current.restore(recovered)
    setRecovered(null)
    bump()
  }, [recovered])

  const saveRecovered = useCallback((): Run | null => {
    if (!recovered) return null
    const tmp = new RecorderCore()
    tmp.restore(recovered)
    const lastT = recovered.points[recovered.points.length - 1]?.t ?? recovered.savedAt
    const run = tmp.finish(lastT)
    run.movingMs = recovered.accumulatedMs
    if (saveRunSafely(run)) {
      setRecovered(null)
      return run
    }
    return null
  }, [recovered, saveRunSafely])

  const discardRecovered = useCallback(() => {
    if (kv) clearLive(kv)
    setRecovered(null)
  }, [kv])

  const setWarm = useCallback((on: boolean) => setWarmState((w) => Math.max(0, w + (on ? 1 : -1))), [])
  const retryGps = useCallback(() => {
    setGps({ fix: null, at: 0, error: null })
    setWatchKey((k) => k + 1)
  }, [])

  const deleteRun = useCallback(
    (id: string) => {
      if (!kv) return
      try {
        setRuns(deleteRunKV(kv, id))
      } catch (e) {
        setStorageError((e as Error).message)
      }
    },
    [kv],
  )
  const reloadRuns = useCallback(() => kv && setRuns(loadRuns(kv)), [kv])

  const addStop = useCallback<Ctx['addStop']>(
    (s) => {
      const c = core.current
      const stop: Stop = { ...s, at: Date.now(), tripDistM: c.distanceM }
      if (!c.addStop(stop)) return null
      persist()
      bump()
      return stop
    },
    [persist],
  )

  const undoStop = useCallback(() => {
    core.current.removeLastStop()
    persist()
    bump()
  }, [persist])

  const importRunTracker = useCallback(() => {
    if (!kv) return { added: 0, skipped: 0, found: 0 }
    const found = readRunTrackerRuns(kv)
    try {
      const res = mergeRuns(kv, found)
      setRuns(loadRuns(kv))
      return { added: res.added, skipped: res.skipped, found: found.length }
    } catch (e) {
      setStorageError((e as Error).message)
      return { added: 0, skipped: 0, found: found.length }
    }
  }, [kv])

  const importBackup = useCallback(
    (json: string) => {
      if (!kv) throw new Error('Storage not available.')
      const res = importBackupKV(kv, json)
      setRuns(loadRuns(kv))
      return res
    },
    [kv],
  )

  const renameRun = useCallback(
    (id: string, name: string) => {
      if (!kv) return
      try {
        setRuns(renameRunKV(kv, id, name))
      } catch (e) {
        setStorageError((e as Error).message)
      }
    },
    [kv],
  )

  const updateSettings = useCallback(
    (s: Partial<Settings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...s }
        if (kv) saveSettings(kv, next)
        return next
      })
    },
    [kv],
  )

  const c = core.current
  const quality = qualityOf(gps, now)
  const canStartAnyway = c.status === 'waiting' && !!gps.fix && gps.fix.acc <= 50 && now - gps.at < 15_000

  const value = useMemo<Ctx>(
    () => ({
      status: c.status,
      points: c.points,
      stops: c.stops,
      addStop,
      undoStop,
      importRunTracker,
      importBackup,
      renameRun,
      distanceM: c.distanceM,
      movingMs: c.movingMs(Math.max(now, Date.now())),
      gps,
      quality,
      wake,
      gap,
      estimatedM: estimatedDistance(c.points),
      autoResumed,
      dismissAutoResumed: () => setAutoResumed(null),
      dismissGap: () => setGap(null),
      recovered,
      resumeRecovered,
      saveRecovered,
      discardRecovered,
      start,
      startAnyway,
      canStartAnyway,
      cancelWaiting,
      pause,
      resume,
      finish,
      discard,
      setWarm,
      retryGps,
      runs,
      deleteRun,
      reloadRuns,
      settings,
      updateSettings,
      storageError,
      clearStorageError: () => setStorageError(null),
      geoSupported,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c.status, c.points.length, c.stops, now, autoResumed, gps, quality, wake, gap, recovered, runs, settings, storageError, canStartAnyway,
      resumeRecovered, saveRecovered, discardRecovered, start, startAnyway, cancelWaiting, pause, resume, finish, discard,
      setWarm, retryGps, deleteRun, reloadRuns, updateSettings, geoSupported, addStop, undoStop, importRunTracker,
      importBackup, renameRun],
  )

  return <RecorderCtx.Provider value={value}>{children}</RecorderCtx.Provider>
}
