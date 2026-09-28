import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecorder } from '../tracker/RecorderContext'
import { TrackMap } from '../components/TrackMap'
import GpsIndicator from '../components/GpsIndicator'
import LocationHelp from '../components/LocationHelp'
import { paceSecPerKm, rollingPace } from '../tracker/stats'
import { formatDuration, formatKm, formatPace, formatSpeed, formatTime, speedKmh } from '../tracker/format'
import { nearestStores } from '../lib/nearest'
import { formatDistanceKm } from '../lib/geo'
import type { Zone } from '../types/zone'
import { PocketMode } from '../components/PocketMode'

interface Props {
  zones: Zone[]
}

export function TrackPage({ zones }: Props) {
  const r = useRecorder()
  const nav = useNavigate()
  const [follow, setFollow] = useState(r.settings.autoFollow)
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [pickOther, setPickOther] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [pocket, setPocket] = useState(false)

  const { setWarm } = r
  useEffect(() => {
    setWarm(true)
    return () => setWarm(false)
  }, [setWarm])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const n = r.points.length
  const lastPoint = n ? r.points[n - 1] : null
  const current = r.gps.fix
    ? { lat: r.gps.fix.lat, lon: r.gps.fix.lon, acc: r.gps.fix.acc }
    : lastPoint
      ? { lat: lastPoint.lat, lon: lastPoint.lon, acc: lastPoint.acc }
      : null

  const idle = r.status === 'idle'
  const inTrip = r.status === 'recording' || r.status === 'paused'
  const denied = r.gps.error
  const showPace = r.settings.showPace

  // Round position so the nearest list doesn't re-sort on every tiny GPS wobble.
  const qLat = current ? Math.round(current.lat * 1e4) / 1e4 : null
  const qLon = current ? Math.round(current.lon * 1e4) / 1e4 : null
  const near = useMemo(
    () => (qLat != null && qLon != null ? nearestStores(zones, qLat, qLon, 5) : []),
    [zones, qLat, qLon],
  )
  const nearest = near[0] ?? null

  const curPace = r.status === 'recording' ? rollingPace(r.points, r.movingMs, 20_000, 300) : null
  const curSpeed = curPace ? 3600 / curPace : r.status === 'recording' ? 0 : null
  const avgSpeed = speedKmh(r.distanceM, r.movingMs)
  const avgPace = paceSecPerKm(r.distanceM, r.movingMs)

  const arrive = (idx: number) => {
    const ns = near[idx]
    if (!ns || !current) return
    const stop = r.addStop({
      storeId: ns.zone.id,
      name: ns.zone.name,
      suburb: ns.zone.suburb,
      lat: current.lat,
      lon: current.lon,
      distToStoreM: Math.round(ns.distM),
    })
    setPickOther(false)
    if (stop) setToast(`Arrived at ${stop.name} · ${formatTime(stop.at)}`)
  }

  const onSave = () => {
    const run = r.finish()
    setConfirmEnd(false)
    if (run) nav(`/trip/${run.id}`)
  }
  const onDiscard = () => {
    if (window.confirm('Discard this trip? It will be deleted and cannot be recovered.')) {
      r.discard()
      setConfirmEnd(false)
    }
  }

  return (
    <div className={`page track status-${r.status}`}>
      <div className="track-top">
        <GpsIndicator quality={r.quality} acc={r.gps.fix?.acc ?? null} />
        {r.status === 'recording' && <span className="pill pill-rec">● TRIP</span>}
        {r.status === 'paused' && <span className="pill pill-paused">❚❚ PAUSED</span>}
        {!idle && r.wake.active && (
          <span className="pill" title="Screen will stay on">
            ☀ Screen on
          </span>
        )}
      </div>

      {!r.geoSupported && (
        <div className="banner banner-error">This browser doesn't support location, so trips can't be tracked.</div>
      )}
      {denied && <LocationHelp code={denied.code} onRetry={r.retryGps} />}

      {r.storageError && (
        <div className="banner banner-error">
          {r.storageError}
          <div className="banner-actions">
            <button className="btn btn--small" onClick={() => nav('/history')}>
              Backup
            </button>
            <button className="btn btn--small btn--ghost" onClick={r.clearStorageError}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {r.recovered && idle && (
        <div className="banner banner-warn" data-testid="recovered">
          <strong>Unfinished trip found</strong> — started {formatTime(r.recovered.startedAt)},{' '}
          {formatKm(r.recovered.points[r.recovered.points.length - 1]?.d ?? 0)} km,{' '}
          {r.recovered.stops.length} stop{r.recovered.stops.length === 1 ? '' : 's'}.
          <div className="banner-actions">
            <button className="btn btn--small" onClick={r.resumeRecovered}>
              Resume
            </button>
            <button
              className="btn btn--small btn--ghost"
              onClick={() => {
                const run = r.saveRecovered()
                if (run) nav(`/trip/${run.id}`)
              }}
            >
              Save
            </button>
            <button
              className="btn btn--small btn--danger"
              onClick={() => window.confirm('Discard the unfinished trip?') && r.discardRecovered()}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {!idle && (
        <div className="banner banner-keepon" role="status" data-testid="keepon-banner">
          <strong>Keep this screen on. Locking the phone pauses GPS.</strong>
          {r.settings.keepScreenOn && r.wake.active ? <span className="muted"> Screen lock is blocked while tracking.</span> : null}
        </div>
      )}

      {r.autoResumed && inTrip && (
        <div className="banner banner-warn" data-testid="autoresumed">
          <strong>Trip resumed.</strong> The app was closed for {formatDuration(r.autoResumed.closedMs)}. Tracking
          carried on from where it stopped; the gap will be joined with a dashed, estimated line.
          <div className="banner-actions">
            <button className="btn btn--small btn--ghost" onClick={r.dismissAutoResumed}>
              OK
            </button>
          </div>
        </div>
      )}

      {r.gap != null && (
        <div className="banner banner-warn" data-testid="gap-banner">
          <strong>GPS gap of {formatDuration(r.gap.ms)}.</strong>{' '}
          {r.gap.estM != null
            ? `Added ${formatKm(r.gap.estM, 2)} km as an estimated straight line (dashed on the map).`
            : 'Waiting for GPS — the gap will be joined with a dashed, estimated line.'}{' '}
          The browser gets no GPS while the screen is off or the app is in the background.
          <div className="banner-actions">
            <button className="btn btn--small btn--ghost" onClick={r.dismissGap}>
              OK
            </button>
          </div>
        </div>
      )}

      {!idle && r.settings.keepScreenOn && !r.wake.supported && (
        <div className="banner banner-info">This browser can't keep the screen on by itself — set Auto-Lock to Never while driving.</div>
      )}
      {!idle && r.settings.keepScreenOn && r.wake.supported && r.wake.error && (
        <div className="banner banner-info">Couldn't keep the screen awake ({r.wake.error}).</div>
      )}

      <div className="map-wrap map-wrap--track">
        <TrackMap
          points={r.points}
          zones={r.settings.showStores ? zones : []}
          stops={r.stops}
          highlightId={inTrip ? nearest?.zone.id : null}
          current={current}
          follow={follow}
          onUserPan={() => setFollow(false)}
          onOpenStore={(id) => nav(`/zone/${id}`)}
        />
        <div className="map-btns">
          <button
            className={`map-btn ${follow ? 'on' : ''}`}
            onClick={() => setFollow((f) => !f)}
            aria-pressed={follow}
          >
            {follow ? '◎ Following' : '◎ Follow'}
          </button>
          <button
            className={`map-btn ${r.settings.showStores ? 'on' : ''}`}
            onClick={() => r.updateSettings({ showStores: !r.settings.showStores })}
            aria-pressed={r.settings.showStores}
          >
            {r.settings.showStores ? '🏪 Stores' : '🏪 Stores off'}
          </button>
        </div>
      </div>

      <div className="stats" data-testid="stats">
        <div className="stat stat-big">
          <div className="stat-val" data-testid="stat-time">
            {formatDuration(r.movingMs)}
          </div>
          <div className="stat-lbl">Time</div>
        </div>
        <div className="stat stat-big">
          <div className="stat-val" data-testid="stat-km">
            {formatKm(r.distanceM)}
          </div>
          <div className="stat-lbl">km{r.estimatedM >= 10 ? <span data-testid="stat-est"> · incl. {formatKm(r.estimatedM, 1)} est.</span> : null}</div>
        </div>
        <div className="stat">
          <div className="stat-val" data-testid="stat-avg">
            {formatSpeed(avgSpeed)}
          </div>
          <div className="stat-lbl">Avg km/h</div>
        </div>
        <div className="stat">
          <div className="stat-val">{formatSpeed(curSpeed)}</div>
          <div className="stat-lbl">Now km/h</div>
        </div>
        {showPace && (
          <>
            <div className="stat">
              <div className="stat-val" data-testid="stat-pace">
                {formatPace(avgPace)}
              </div>
              <div className="stat-lbl">Avg /km</div>
            </div>
            <div className="stat">
              <div className="stat-val">{formatPace(curPace)}</div>
              <div className="stat-lbl">Now /km</div>
            </div>
          </>
        )}
      </div>

      <div className="controls">
        {idle && (
          <button
            className="btn btn--primary btn--huge btn--block"
            onClick={r.start}
            disabled={!r.geoSupported || !!denied}
          >
            Start trip
          </button>
        )}
        {r.status === 'waiting' && (
          <div className="waiting">
            <div className="waiting-msg">
              <span className="spinner" aria-hidden="true" /> Waiting for a good GPS fix
              {r.gps.fix ? ` (±${Math.round(r.gps.fix.acc)} m, need ±30 m)` : '…'}
            </div>
            <div className="btn-row btn-row--h">
              {r.canStartAnyway && (
                <button className="btn btn--primary" onClick={r.startAnyway}>
                  Start anyway
                </button>
              )}
              <button className="btn btn--ghost" onClick={r.cancelWaiting}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {inTrip && (
          <>
            <button
              className="btn btn--arrive btn--huge btn--block"
              data-testid="arrive-btn"
              disabled={!nearest}
              onClick={() => arrive(0)}
            >
              {nearest ? (
                <span className="arrive-lbl">
                  <span>Arrive at {nearest.zone.name}</span>
                  <small>
                    {nearest.zone.suburb} · {formatDistanceKm(nearest.distM / 1000)} away
                  </small>
                </span>
              ) : (
                'Arrive at nearest store (waiting for GPS)'
              )}
            </button>
            {nearest && nearest.distM > 1000 ? (
              <p className="muted small" role="status">
                Nearest store is {formatDistanceKm(nearest.distM / 1000)} away — check it's the right one.
              </p>
            ) : null}
            {near.length > 1 && (
              <button className="linklike" onClick={() => setPickOther((v) => !v)} aria-expanded={pickOther}>
                {pickOther ? 'Hide other stores' : 'Not this store? Pick another nearby'}
              </button>
            )}
            {pickOther && (
              <div className="btn-row" data-testid="other-stores">
                {near.slice(1).map((ns, i) => (
                  <button key={ns.zone.id} className="btn btn--secondary btn--block" onClick={() => arrive(i + 1)}>
                    Arrive at {ns.zone.name} · {formatDistanceKm(ns.distM / 1000)}
                  </button>
                ))}
              </div>
            )}
            <div className="btn-row btn-row--h">
              {r.status === 'recording' ? (
                <button className="btn btn--secondary btn--block" onClick={r.pause}>
                  Pause
                </button>
              ) : (
                <button className="btn btn--primary btn--block" onClick={r.resume}>
                  Resume
                </button>
              )}
              <button className="btn btn--danger btn--block" onClick={() => setConfirmEnd(true)}>
                End trip
              </button>
            </div>
          </>
        )}
      </div>

      {inTrip && (
        <section className="card" data-testid="trip-stops">
          <h2 className="card__title">Stops this trip ({r.stops.length})</h2>
          {r.stops.length ? (
            <ol className="stop-list">
              {r.stops.map((s, i) => (
                <li key={`${s.at}-${i}`}>
                  <span className="stop-list__name">{s.name}</span>
                  <span className="muted">
                    {s.suburb} · arrived {formatTime(s.at)} · {formatKm(s.tripDistM, 1)} km in
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              At a store? Tap “Arrive at …” to log the time.
            </p>
          )}
          {r.stops.length ? (
            <button className="btn btn--ghost btn--block" onClick={r.undoStop}>
              Undo last stop
            </button>
          ) : null}
        </section>
      )}

      {idle && (
        <p className="muted small center tip">
          Keep the screen on while tracking (phone in the cradle is ideal). Locking the phone pauses GPS in the browser.
          Trips are saved only on this phone.
        </p>
      )}

      {inTrip && (
        <button className="btn btn--secondary btn--block" onClick={() => setPocket(true)}>
          🌑 Pocket mode (black screen)
        </button>
      )}

      <label className="toggle">
        <input
          type="checkbox"
          checked={r.settings.keepScreenOn}
          onChange={(e) => r.updateSettings({ keepScreenOn: e.target.checked })}
        />
        <span>Keep screen on</span>
      </label>

      <label className="toggle">
        <input
          type="checkbox"
          checked={showPace}
          onChange={(e) => r.updateSettings({ showPace: e.target.checked })}
        />
        <span>Show pace (min/km)</span>
      </label>

      {pocket && inTrip ? (
        <PocketMode
          onExit={() => setPocket(false)}
          line={`${r.status === 'paused' ? 'Paused' : 'Tracking'} · ${formatKm(r.distanceM, 1)} km · ${formatDuration(r.movingMs)}`}
        />
      ) : null}

      {toast ? (
        <div className="toast" role="status" data-testid="toast">
          {toast}
        </div>
      ) : null}

      {confirmEnd && (
        <div className="sheet-backdrop" onClick={() => setConfirmEnd(false)}>
          <div className="sheet sheet--pad" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2 className="sheet__title">End trip?</h2>
            <p>
              {formatKm(r.distanceM)} km in {formatDuration(r.movingMs)} · {r.stops.length} stop
              {r.stops.length === 1 ? '' : 's'}
            </p>
            <button className="btn btn--primary btn--huge btn--block" onClick={onSave}>
              {n ? 'Save trip' : 'End (nothing recorded)'}
            </button>
            <button className="btn btn--ghost btn--block" onClick={() => setConfirmEnd(false)}>
              Keep going
            </button>
            <button className="btn btn--danger btn--block" onClick={onDiscard}>
              Discard trip
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
