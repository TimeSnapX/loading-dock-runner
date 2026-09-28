import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRecorder } from '../tracker/RecorderContext'
import { totals } from '../tracker/stats'
import { formatDate, formatDuration, formatKm, formatSpeed, formatTime, speedKmh, tripName } from '../tracker/format'
import { buildBackup } from '../tracker/storage'
import { downloadText } from '../tracker/download'
import { OtherAppsImport } from '../components/OtherAppsImport'
import type { LzrImportResult } from '../hooks/useZones'

export function HistoryPage({ importFromLzr }: { importFromLzr: () => LzrImportResult }) {
  const { runs, importBackup } = useRecorder()
  const t = totals(runs)
  const stopsTotal = runs.reduce((s, r) => s + (r.stops?.length ?? 0), 0)
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [paste, setPaste] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const doImport = (text: string) => {
    try {
      const res = importBackup(text)
      setMsg({ kind: 'ok', text: `Imported ${res.added} trip${res.added === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} already here)` : ''}.` })
      setPaste('')
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message })
    }
  }

  return (
    <div className="page">
      <h2 className="page__title">History</h2>
      <div className="stats stats--3">
        <div className="stat">
          <div className="stat-val">{t.weekKm.toFixed(1)}</div>
          <div className="stat-lbl">km this week ({t.weekRuns})</div>
        </div>
        <div className="stat">
          <div className="stat-val">{t.allKm.toFixed(1)}</div>
          <div className="stat-lbl">km all-time ({t.allRuns})</div>
        </div>
        <div className="stat">
          <div className="stat-val">{stopsTotal}</div>
          <div className="stat-lbl">stops logged</div>
        </div>
      </div>

      {!runs.length && <p className="muted center">No trips yet. Go to Track and tap Start trip.</p>}

      <ul className="run-list" data-testid="trip-list">
        {runs.map((run) => {
          const stops = run.stops ?? []
          return (
            <li key={run.id}>
              <Link to={`/trip/${run.id}`} className="run-item">
                <div className="run-item-head">
                  <span className="run-name">
                    {tripName(run)}
                    {run.kind === 'run' ? <span className="tag tag--run">Run Tracker</span> : null}
                  </span>
                  <span className="muted small">
                    {formatDate(run.startedAt)} · {formatTime(run.startedAt)}
                  </span>
                </div>
                <div className="run-item-stats">
                  <span>
                    <b>{formatKm(run.distanceM)}</b> km
                  </span>
                  <span>
                    <b>{formatDuration(run.movingMs)}</b>
                  </span>
                  <span>
                    <b>{formatSpeed(speedKmh(run.distanceM, run.movingMs))}</b> km/h
                  </span>
                </div>
                {stops.length ? (
                  <div className="run-item-stops muted small" data-testid="trip-stops-summary">
                    {stops.length} stop{stops.length === 1 ? '' : 's'}:{' '}
                    {stops.map((s) => `${s.name} ${formatTime(s.at)}`).join(' · ')}
                  </div>
                ) : null}
              </Link>
            </li>
          )
        })}
      </ul>

      <section className="card">
        <h2 className="card__title">Back up / restore trips</h2>
        <p className="muted" style={{ margin: 0 }}>
          Trips live only on this phone. Download a backup now and then. Import accepts Loading Dock Runner or Run
          Tracker backup files.
        </p>
        <div className="btn-row">
          <button
            className="btn btn--secondary btn--block"
            disabled={!runs.length}
            onClick={() => {
              const b = buildBackup(localStorage)
              const name = `ldr-trips-${new Date().toISOString().slice(0, 10)}.json`
              downloadText(name, JSON.stringify(b), 'application/json')
              setMsg({ kind: 'ok', text: `Downloaded ${name}.` })
            }}
          >
            Download trips backup
          </button>
          <button className="btn btn--ghost btn--block" onClick={() => fileRef.current?.click()}>
            Import trips from file
          </button>
        </div>
        <div className="field">
          <label htmlFor="trips-import" className="sr-only">
            Paste trips JSON
          </label>
          <textarea
            id="trips-import"
            rows={3}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder="Or paste a trips backup JSON here"
            spellCheck={false}
          />
        </div>
        <button className="btn btn--secondary btn--block" disabled={!paste.trim()} onClick={() => doImport(paste)}>
          Import pasted trips
        </button>
        {msg ? (
          <p className={`pin-msg pin-msg--${msg.kind}`} role="status" data-testid="trips-msg">
            {msg.text}
          </p>
        ) : null}
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,text/plain"
          hidden
          data-testid="trips-file"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) doImport(await f.text())
          }}
        />
      </section>

      <OtherAppsImport importFromLzr={importFromLzr} />
    </div>
  )
}
