import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRecorder } from '../tracker/RecorderContext'
import { TrackMap } from '../components/TrackMap'
import { paceSecPerKm } from '../tracker/stats'
import {
  formatDate,
  formatDuration,
  formatKm,
  formatPace,
  formatSpeed,
  formatTime,
  speedKmh,
  tripName,
} from '../tracker/format'
import { buildGpx, gpxFilename } from '../tracker/gpx'
import { canShareFiles, downloadText, shareText } from '../tracker/download'
import { formatDistanceKm } from '../lib/geo'

export function TripDetailPage() {
  const { id } = useParams()
  const { runs, deleteRun, renameRun, settings } = useRecorder()
  const nav = useNavigate()
  const run = runs.find((x) => x.id === id)
  if (!run) {
    return (
      <div className="page">
        <p>Trip not found.</p>
        <Link to="/history" className="btn btn--secondary">
          Back to history
        </Link>
      </div>
    )
  }
  const stops = run.stops ?? []
  const gpx = () => buildGpx(run)
  const share = canShareFiles()

  return (
    <div className="page">
      <Link to="/history" className="detail__back" aria-label="Back to history">
        ‹ History
      </Link>
      <h2 className="page__title" data-testid="trip-title">
        {tripName(run)}
        {run.kind === 'run' ? <span className="tag tag--run">Run Tracker</span> : null}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {formatDate(run.startedAt)} · {formatTime(run.startedAt)}–{formatTime(run.endedAt)}
      </p>
      <div className="map-wrap">
        {run.points.length ? (
          <TrackMap points={run.points} stops={stops} fit onOpenStore={(sid) => nav(`/zone/${sid}`)} />
        ) : (
          <p className="muted center">No GPS points.</p>
        )}
      </div>
      <div className="stats">
        <div className="stat stat-big">
          <div className="stat-val">{formatKm(run.distanceM)}</div>
          <div className="stat-lbl">km</div>
        </div>
        <div className="stat stat-big">
          <div className="stat-val">{formatDuration(run.movingMs)}</div>
          <div className="stat-lbl">Time</div>
        </div>
        <div className="stat">
          <div className="stat-val">{formatSpeed(speedKmh(run.distanceM, run.movingMs))}</div>
          <div className="stat-lbl">Avg km/h</div>
        </div>
        <div className="stat">
          <div className="stat-val">{stops.length}</div>
          <div className="stat-lbl">Stops</div>
        </div>
        {settings.showPace || run.kind === 'run' ? (
          <div className="stat">
            <div className="stat-val">{formatPace(paceSecPerKm(run.distanceM, run.movingMs))}</div>
            <div className="stat-lbl">Avg /km</div>
          </div>
        ) : null}
      </div>
      <p className="muted small" style={{ margin: 0 }}>
        Total elapsed (incl. pauses): {formatDuration(run.endedAt - run.startedAt)}
      </p>
      {run.estimatedM && run.estimatedM >= 10 ? (
        <p className="muted small" style={{ margin: 0 }} data-testid="detail-est">
          Includes {formatKm(run.estimatedM, 2)} km estimated across GPS gaps (dashed on the map).
        </p>
      ) : null}

      <section className="card" data-testid="detail-stops">
        <h2 className="card__title">Stops ({stops.length})</h2>
        {stops.length ? (
          <ol className="stop-list">
            {stops.map((s, i) => (
              <li key={`${s.at}-${i}`}>
                <Link to={`/zone/${s.storeId}`} className="stop-list__name">
                  {s.name}
                </Link>
                <span className="muted">
                  {s.suburb} · arrived {formatTime(s.at)} · {formatKm(s.tripDistM, 1)} km in ·{' '}
                  {formatDistanceKm(s.distToStoreM / 1000)} from pin
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No store arrivals logged on this {run.kind === 'run' ? 'run' : 'trip'}.
          </p>
        )}
      </section>

      <div className="btn-row">
        <button className="btn btn--primary btn--block" onClick={() => downloadText(gpxFilename(run), gpx(), 'application/gpx+xml')}>
          Download GPX
        </button>
        {share && (
          <button className="btn btn--secondary btn--block" onClick={() => shareText(gpxFilename(run), gpx(), 'application/gpx+xml')}>
            Share GPX
          </button>
        )}
        <button
          className="btn btn--ghost btn--block"
          onClick={() => {
            const name = window.prompt('Trip name', tripName(run))
            if (name != null) renameRun(run.id, name)
          }}
        >
          Rename
        </button>
        <button
          className="btn btn--danger btn--block"
          onClick={() => {
            if (window.confirm('Delete this trip? This cannot be undone.')) {
              deleteRun(run.id)
              nav('/history')
            }
          }}
        >
          Delete trip
        </button>
      </div>
    </div>
  )
}
