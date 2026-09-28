/** "Your pin" overrides for dock / park-up coordinates, stored in localStorage. */

export type PinField = 'dock' | 'park'
export type PinSource = 'manual' | 'photo' | 'gps'

export interface PinOverride {
  lat: number
  lng: number
  source: PinSource
  accuracy: number | null
  updatedAt: string
}

export type PinOverrides = Record<string, Partial<Record<PinField, PinOverride>>>

export interface PinExportRow {
  storeId: string
  name: string
  field: PinField
  latField: 'dockLat' | 'parkLat'
  lngField: 'dockLng' | 'parkLng'
  lat: number
  lng: number
  source: PinSource
  accuracy: number | null
  updatedAt: string
}

export const PINS_KEY = 'ldr-pin-overrides'
/** Loading Zone Routes' pins on the same origin (read-only here; never written or deleted). */
export const LZR_PINS_KEY = 'lzr-pin-overrides'

export const FIELD_KEYS = {
  dock: { lat: 'dockLat', lng: 'dockLng' },
  park: { lat: 'parkLat', lng: 'parkLng' },
} as const

export const FIELD_LABEL: Record<PinField, string> = { dock: 'Dock', park: 'Park-up' }

export function readPins(key: string = PINS_KEY): PinOverrides {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function writePins(pins: PinOverrides) {
  localStorage.setItem(PINS_KEY, JSON.stringify(pins))
}

export function countPins(pins: PinOverrides): number {
  let n = 0
  for (const v of Object.values(pins)) {
    if (v.dock) n++
    if (v.park) n++
  }
  return n
}

export function exportRows(pins: PinOverrides, nameOf: (id: string) => string): PinExportRow[] {
  const rows: PinExportRow[] = []
  for (const [storeId, v] of Object.entries(pins)) {
    for (const field of ['dock', 'park'] as PinField[]) {
      const p = v[field]
      if (!p) continue
      rows.push({
        storeId,
        name: nameOf(storeId),
        field,
        latField: FIELD_KEYS[field].lat,
        lngField: FIELD_KEYS[field].lng,
        lat: p.lat,
        lng: p.lng,
        source: p.source,
        accuracy: p.accuracy,
        updatedAt: p.updatedAt,
      })
    }
  }
  rows.sort((a, b) => a.storeId.localeCompare(b.storeId) || a.field.localeCompare(b.field))
  return rows
}

export function exportJson(pins: PinOverrides, nameOf: (id: string) => string): string {
  return JSON.stringify(
    {
      app: 'loading-dock-runner',
      kind: 'pin-overrides',
      version: 1,
      exportedAt: new Date().toISOString(),
      pins: exportRows(pins, nameOf),
    },
    null,
    2,
  )
}

export interface ImportResult {
  pins: PinOverrides
  added: number
  updated: number
  skipped: number
  errors: string[]
}

/** Merge exported JSON into existing overrides. Newer updatedAt wins on conflict. */
export function importJson(text: string, existing: PinOverrides): ImportResult {
  let data: unknown
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    return { pins: existing, added: 0, updated: 0, skipped: 0, errors: ['Not valid JSON.'] }
  }
  const rows: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { pins?: unknown }).pins)
      ? (data as { pins: unknown[] }).pins
      : []
  if (!rows.length) {
    return { pins: existing, added: 0, updated: 0, skipped: 0, errors: ['No pins found in that JSON.'] }
  }
  const next: PinOverrides = JSON.parse(JSON.stringify(existing))
  let added = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []
  rows.forEach((r, i) => {
    const row = r as Record<string, unknown>
    const storeId = String(row.storeId ?? row.id ?? '')
    const field = row.field as PinField
    const lat = Number(row.lat)
    const lng = Number(row.lng)
    if (!storeId || (field !== 'dock' && field !== 'park')) {
      errors.push(`Row ${i + 1}: missing storeId or field.`)
      return
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      errors.push(`Row ${i + 1}: bad lat/lng.`)
      return
    }
    const source: PinSource =
      row.source === 'photo' || row.source === 'gps' ? row.source : 'manual'
    const acc = row.accuracy == null ? null : Number(row.accuracy)
    const incoming: PinOverride = {
      lat,
      lng,
      source,
      accuracy: acc != null && Number.isFinite(acc) ? acc : null,
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : new Date().toISOString(),
    }
    const cur = next[storeId]?.[field]
    if (!cur) {
      next[storeId] = { ...next[storeId], [field]: incoming }
      added++
    } else if (Date.parse(incoming.updatedAt) > Date.parse(cur.updatedAt)) {
      next[storeId] = { ...next[storeId], [field]: incoming }
      updated++
    } else {
      skipped++
    }
  })
  return { pins: next, added, updated, skipped, errors }
}

/** Merge another pin map into ours (newer updatedAt wins), e.g. pins from Loading Zone Routes. */
export function mergePins(existing: PinOverrides, incoming: PinOverrides): ImportResult {
  const rows = exportRows(incoming, (id) => id)
  if (!rows.length) return { pins: existing, added: 0, updated: 0, skipped: 0, errors: [] }
  return importJson(JSON.stringify(rows), existing)
}
