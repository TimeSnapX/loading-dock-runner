import { useCallback, useEffect, useMemo, useState } from 'react'
import seedZones from '../data/zones.json'
import type { Zone, ZoneNotesMap } from '../types/zone'
import {
  importJson,
  LZR_PINS_KEY,
  mergePins,
  PINS_KEY,
  readPins,
  writePins,
  type ImportResult,
  type PinField,
  type PinOverride,
  type PinOverrides,
} from '../lib/pins'

const CUSTOM_KEY = 'ldr-custom-zones'
const NOTES_KEY = 'ldr-zone-notes'
const EDITS_KEY = 'ldr-zone-edits'
/** Loading Zone Routes keys on the same origin — read-only, used by "Import from my other apps". */
export const LZR_KEYS = {
  custom: 'lzr-custom-zones',
  notes: 'lzr-zone-notes',
  edits: 'lzr-zone-edits',
  pins: LZR_PINS_KEY,
} as const

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

/** Normalise legacy localStorage / seed shapes into the current Zone model. */
function normaliseZone(raw: Record<string, unknown>): Zone {
  const tipsRaw = raw.tips
  let tips: string[] = []
  if (Array.isArray(tipsRaw)) tips = tipsRaw.map(String)
  else if (typeof tipsRaw === 'string' && tipsRaw.trim()) tips = [tipsRaw.trim()]

  const brand =
    (typeof raw.brand === 'string' && raw.brand) ||
    (raw.category === 'liquor' ? 'Liquorland' : 'Other')

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    brand,
    suburb: String(raw.suburb ?? ''),
    region: String(raw.region ?? ''),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    dockLat: raw.dockLat == null ? null : Number(raw.dockLat),
    dockLng: raw.dockLng == null ? null : Number(raw.dockLng),
    dockNotes: String(raw.dockNotes ?? ''),
    parkLat: raw.parkLat == null ? null : Number(raw.parkLat),
    parkLng: raw.parkLng == null ? null : Number(raw.parkLng),
    parkNotes: String(raw.parkNotes ?? ''),
    accessNotes: String(raw.accessNotes ?? ''),
    window: String(raw.window ?? raw.typicalWindow ?? ''),
    constraints: String(raw.constraints ?? raw.truckConstraints ?? ''),
    tips,
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    starter: Boolean(raw.starter),
    custom: Boolean(raw.custom),
  }
}

const seed = (seedZones as Partial<Zone>[]).map(normaliseZone)

export function useZones() {
  const [customZones, setCustomZones] = useState<Zone[]>(() =>
    readJson<Partial<Zone>[]>(CUSTOM_KEY, []).map(normaliseZone),
  )
  const [edits, setEdits] = useState<Record<string, Partial<Zone>>>(() =>
    readJson(EDITS_KEY, {}),
  )
  const [notes, setNotes] = useState<ZoneNotesMap>(() =>
    readJson(NOTES_KEY, {}),
  )

  const [pins, setPins] = useState<PinOverrides>(() => readPins())

  useEffect(() => {
    writePins(pins)
  }, [pins])

  // Keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === PINS_KEY) setPins(readPins())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    writeJson(CUSTOM_KEY, customZones)
  }, [customZones])

  useEffect(() => {
    writeJson(EDITS_KEY, edits)
  }, [edits])

  useEffect(() => {
    writeJson(NOTES_KEY, notes)
  }, [notes])

  const zones = useMemo(() => {
    const base = seed.map((z) => normaliseZone({ ...z, ...edits[z.id] }))
    const customIds = new Set(customZones.map((z) => z.id))
    const customs = customZones.map((z) =>
      normaliseZone({ ...z, ...edits[z.id], custom: true }),
    )
    // Driver's own pins win over bundled data and edits (bundled JSON is never mutated)
    const withPins = (z: Zone): Zone => {
      const p = pins[z.id]
      if (!p) return z
      const out = { ...z }
      if (p.dock) {
        out.dockLat = p.dock.lat
        out.dockLng = p.dock.lng
        out.dockMine = true
      }
      if (p.park) {
        out.parkLat = p.park.lat
        out.parkLng = p.park.lng
        out.parkMine = true
      }
      return out
    }
    return [...base.filter((z) => !customIds.has(z.id)), ...customs].map(withPins)
  }, [customZones, edits, pins])

  /** Bundled (seed + edits) coords, ignoring the driver's pins — for "bundled" display. */
  const getBundledZone = useCallback(
    (id: string): Zone | undefined => {
      const s = seed.find((z) => z.id === id)
      if (s) return normaliseZone({ ...s, ...edits[id] })
      const c = customZones.find((z) => z.id === id)
      return c ? normaliseZone({ ...c, ...edits[id], custom: true }) : undefined
    },
    [customZones, edits],
  )

  const setPin = useCallback((id: string, field: PinField, pin: PinOverride) => {
    setPins((prev) => ({ ...prev, [id]: { ...prev[id], [field]: pin } }))
  }, [])

  const clearPin = useCallback((id: string, field: PinField) => {
    setPins((prev) => {
      const cur = { ...prev[id] }
      delete cur[field]
      const next = { ...prev }
      if (!cur.dock && !cur.park) delete next[id]
      else next[id] = cur
      return next
    })
  }, [])

  const importPins = useCallback(
    (text: string): ImportResult => {
      const res = importJson(text, pins)
      if (res.added || res.updated) setPins(res.pins)
      return res
    },
    [pins],
  )

  /** One-time copy of Loading Zone Routes data (pins, custom stores, notes, edits). Originals untouched. */
  const importFromLzr = useCallback((): LzrImportResult => {
    const theirPins = readPins(LZR_PINS_KEY)
    const pr = mergePins(pins, theirPins)
    if (pr.added || pr.updated) setPins(pr.pins)

    const theirCustom = readJson<Partial<Zone>[]>(LZR_KEYS.custom, [])
    const haveIds = new Set(customZones.map((z) => z.id))
    const newCustom = (Array.isArray(theirCustom) ? theirCustom : [])
      .filter((z) => z && typeof z.id === 'string' && !haveIds.has(z.id))
      .map((z) => normaliseZone({ ...z, custom: true } as Record<string, unknown>))
    if (newCustom.length) setCustomZones((prev) => [...prev, ...newCustom])

    const theirNotes = readJson<ZoneNotesMap>(LZR_KEYS.notes, {})
    let notesAdded = 0
    const nextNotes = { ...notes }
    for (const [id, n] of Object.entries(theirNotes ?? {})) {
      if (typeof n === 'string' && n.trim() && !nextNotes[id]) {
        nextNotes[id] = n
        notesAdded++
      }
    }
    if (notesAdded) setNotes(nextNotes)

    const theirEdits = readJson<Record<string, Partial<Zone>>>(LZR_KEYS.edits, {})
    let editsAdded = 0
    const nextEdits = { ...edits }
    for (const [id, e] of Object.entries(theirEdits ?? {})) {
      if (e && typeof e === 'object' && !nextEdits[id]) {
        nextEdits[id] = e
        editsAdded++
      }
    }
    if (editsAdded) setEdits(nextEdits)

    return {
      pinsAdded: pr.added,
      pinsUpdated: pr.updated,
      pinsSkipped: pr.skipped,
      customAdded: newCustom.length,
      notesAdded,
      editsAdded,
    }
  }, [pins, customZones, notes, edits])

  const getZone = useCallback(
    (id: string) => zones.find((z) => z.id === id),
    [zones],
  )

  const saveNote = useCallback((id: string, note: string) => {
    setNotes((prev) => {
      const next = { ...prev }
      if (!note.trim()) delete next[id]
      else next[id] = note
      return next
    })
  }, [])

  const addCustomZone = useCallback(
    (zone: Omit<Zone, 'id' | 'custom' | 'starter'>) => {
      const id = `custom-${Date.now()}`
      const newZone: Zone = { ...zone, id, custom: true, starter: false }
      setCustomZones((prev) => [...prev, newZone])
      return id
    },
    [],
  )

  const updateZone = useCallback(
    (id: string, patch: Partial<Zone>) => {
      const isCustom = customZones.some((z) => z.id === id)
      if (isCustom) {
        setCustomZones((prev) =>
          prev.map((z) => (z.id === id ? { ...z, ...patch } : z)),
        )
      } else {
        setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
      }
    },
    [customZones],
  )

  const deleteCustomZone = useCallback((id: string) => {
    setCustomZones((prev) => prev.filter((z) => z.id !== id))
    setNotes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setEdits((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  return {
    zones,
    notes,
    getZone,
    saveNote,
    addCustomZone,
    updateZone,
    deleteCustomZone,
    pins,
    setPin,
    clearPin,
    importPins,
    getBundledZone,
    importFromLzr,
  }
}

export interface LzrImportResult {
  pinsAdded: number
  pinsUpdated: number
  pinsSkipped: number
  customAdded: number
  notesAdded: number
  editsAdded: number
}

/** What Loading Zone Routes has saved on this phone (for the import card). */
export function scanLzr(): { pins: number; custom: number; notes: number; edits: number } {
  const pins = readPins(LZR_PINS_KEY)
  let n = 0
  for (const v of Object.values(pins)) {
    if (v?.dock) n++
    if (v?.park) n++
  }
  const c = readJson<unknown[]>(LZR_KEYS.custom, [])
  const notes = readJson<Record<string, string>>(LZR_KEYS.notes, {})
  const edits = readJson<Record<string, unknown>>(LZR_KEYS.edits, {})
  return {
    pins: n,
    custom: Array.isArray(c) ? c.length : 0,
    notes: notes && typeof notes === 'object' ? Object.keys(notes).length : 0,
    edits: edits && typeof edits === 'object' ? Object.keys(edits).length : 0,
  }
}
