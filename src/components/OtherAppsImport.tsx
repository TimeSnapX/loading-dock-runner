import { useMemo, useState } from 'react'
import { scanLzr, type LzrImportResult } from '../hooks/useZones'
import { useRecorder } from '../tracker/RecorderContext'
import { readRunTrackerRuns } from '../tracker/storage'
import { formatDate, formatTime } from '../tracker/format'

export const IMPORTED_KEY = 'ldr-imported-from-apps'

interface ImportRecord {
  at: number
  pins: number
  runs: number
  custom: number
  notes: number
}

function readRecord(): ImportRecord | null {
  try {
    const o = JSON.parse(localStorage.getItem(IMPORTED_KEY) || 'null')
    return o && typeof o.at === 'number' ? o : null
  } catch {
    return null
  }
}

const plural = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`

/**
 * One-time copy from Loading Zone Routes (lzr-* keys) and Run Tracker (rt.runs.v1).
 * Same origin (timesnapx.github.io) so the data is readable here; originals are never changed or deleted.
 */
export function OtherAppsImport({ importFromLzr }: { importFromLzr: () => LzrImportResult }) {
  const { importRunTracker } = useRecorder()
  const [record, setRecord] = useState<ImportRecord | null>(() => readRecord())
  const [msg, setMsg] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const found = useMemo(() => {
    const l = scanLzr()
    let runs = 0
    try {
      runs = readRunTrackerRuns(localStorage).length
    } catch {
      /* ignore */
    }
    return { ...l, runs }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick])
  const nothing = !found.pins && !found.runs && !found.custom && !found.notes && !found.edits

  const run = () => {
    const l = importFromLzr()
    const r = importRunTracker()
    const rec: ImportRecord = {
      at: Date.now(),
      pins: l.pinsAdded + l.pinsUpdated,
      runs: r.added,
      custom: l.customAdded,
      notes: l.notesAdded,
    }
    try {
      localStorage.setItem(IMPORTED_KEY, JSON.stringify(rec))
    } catch {
      /* ignore */
    }
    setRecord(rec)
    setTick((t) => t + 1)
    const parts = [
      `${plural(l.pinsAdded, 'pin')} added${l.pinsUpdated ? `, ${l.pinsUpdated} updated` : ''}${
        l.pinsSkipped ? `, ${l.pinsSkipped} already here` : ''
      }`,
      `${plural(r.added, 'run')} added to History${r.skipped ? ` (${r.skipped} already here)` : ''}`,
    ]
    if (l.customAdded) parts.push(plural(l.customAdded, 'custom store'))
    if (l.notesAdded) parts.push(plural(l.notesAdded, 'store note'))
    if (l.editsAdded) parts.push(plural(l.editsAdded, 'store edit'))
    setMsg(`Imported: ${parts.join(' · ')}. Your other apps still have their copies.`)
  }

  return (
    <section className="card other-apps" data-testid="other-apps">
      <h2 className="card__title">Import from my other apps</h2>
      <p className="muted" style={{ margin: 0 }}>
        Found on this phone: <b>{plural(found.pins, 'pin')}</b> in Loading Zone Routes
        {found.custom ? `, ${plural(found.custom, 'custom store')}` : ''}
        {found.notes ? `, ${plural(found.notes, 'note')}` : ''} and <b>{plural(found.runs, 'run')}</b> in Run Tracker.
        This copies them in here. Nothing is deleted from the other apps.
      </p>
      {record ? (
        <p className="pin-msg pin-msg--ok" data-testid="other-apps-done">
          Imported {formatDate(record.at)} {formatTime(record.at)} — {plural(record.pins, 'pin')},{' '}
          {plural(record.runs, 'run')}
          {record.custom ? `, ${plural(record.custom, 'custom store')}` : ''}.
        </p>
      ) : null}
      {msg ? (
        <p className="pin-msg pin-msg--ok" role="status" data-testid="other-apps-msg">
          {msg}
        </p>
      ) : null}
      {record ? (
        <button type="button" className="btn btn--ghost btn--block" onClick={run} disabled={nothing}>
          Import again (skips duplicates)
        </button>
      ) : (
        <button type="button" className="btn btn--primary btn--block" onClick={run} disabled={nothing}>
          Import from my other apps
        </button>
      )}
      {nothing && !record ? <p className="muted" style={{ margin: 0 }}>Nothing to import on this phone yet.</p> : null}
    </section>
  )
}
