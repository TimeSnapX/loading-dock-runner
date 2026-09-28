import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useZones } from './hooks/useZones'
import { HomePage } from './pages/HomePage'
import { ZoneDetailPage } from './pages/ZoneDetailPage'
import { ZoneFormPage } from './pages/ZoneFormPage'
import { TrackPage } from './pages/TrackPage'
import { HistoryPage } from './pages/HistoryPage'
import { TripDetailPage } from './pages/TripDetailPage'
import { MyPinsPage } from './pages/MyPinsPage'
import { RecorderProvider, useRecorder } from './tracker/RecorderContext'
import { countPins } from './lib/pins'
import { formatDuration, formatKm } from './tracker/format'

function TabBar({ pinCount }: { pinCount: number }) {
  const { status } = useRecorder()
  const loc = useLocation()
  const storesActive = loc.pathname === '/' || /^\/(zone|add|edit)\b/.test(loc.pathname)
  const historyActive = /^\/(history|trip)\b/.test(loc.pathname)
  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to="/" end className={() => (storesActive ? 'active' : '')}>
        <span className="tab-ico" aria-hidden="true">🏪</span>
        <span>Stores</span>
      </NavLink>
      <NavLink to="/track">
        <span className={`tab-ico ${status === 'recording' ? 'tab-ico--rec' : ''}`} aria-hidden="true">
          {status === 'recording' ? '●' : status === 'paused' ? '❚❚' : '▶'}
        </span>
        <span>Track</span>
      </NavLink>
      <NavLink to="/history" className={() => (historyActive ? 'active' : '')}>
        <span className="tab-ico" aria-hidden="true">☰</span>
        <span>History</span>
      </NavLink>
      <NavLink to="/pins">
        <span className="tab-ico" aria-hidden="true">📌</span>
        <span>My pins{pinCount ? ` (${pinCount})` : ''}</span>
      </NavLink>
    </nav>
  )
}

/** Small "trip running" bar shown on other tabs so the trip is never forgotten. */
function TripBar() {
  const r = useRecorder()
  const loc = useLocation()
  const nav = useNavigate()
  if (loc.pathname === '/track' || (r.status !== 'recording' && r.status !== 'paused')) return null
  return (
    <button className="tripbar" onClick={() => nav('/track')} data-testid="tripbar">
      <span>
        {r.status === 'recording' ? '● Trip' : '❚❚ Paused'} · {formatKm(r.distanceM, 1)} km ·{' '}
        {formatDuration(r.movingMs)} · {r.stops.length} stop{r.stops.length === 1 ? '' : 's'}
      </span>
      <b>Open Track ›</b>
    </button>
  )
}

export default function App() {
  const {
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
  } = useZones()
  const nameOf = (id: string) => getZone(id)?.name ?? id

  return (
    <HashRouter>
      <RecorderProvider>
        <div className="app-shell">
          <header className="topbar">
            <div className="topbar__brand">
              <p className="topbar__eyebrow">TimeSnap · BevChain SEQ</p>
              <h1 className="topbar__title">Loading Dock Runner</h1>
            </div>
          </header>
          <Routes>
            <Route path="/" element={<HomePage zones={zones} pins={pins} />} />
            <Route
              path="/zone/:id"
              element={
                <ZoneDetailPage
                  getZone={getZone}
                  notes={notes}
                  saveNote={saveNote}
                  updateZone={updateZone}
                  deleteCustomZone={deleteCustomZone}
                  pins={pins}
                  setPin={setPin}
                  clearPin={clearPin}
                  importPins={importPins}
                  getBundledZone={getBundledZone}
                  nameOf={nameOf}
                />
              }
            />
            <Route
              path="/add"
              element={<ZoneFormPage getZone={getBundledZone} addCustomZone={addCustomZone} updateZone={updateZone} />}
            />
            <Route
              path="/edit/:id"
              element={<ZoneFormPage getZone={getBundledZone} addCustomZone={addCustomZone} updateZone={updateZone} />}
            />
            <Route path="/track" element={<TrackPage zones={zones} />} />
            <Route path="/history" element={<HistoryPage importFromLzr={importFromLzr} />} />
            <Route path="/trip/:id" element={<TripDetailPage />} />
            <Route
              path="/pins"
              element={<MyPinsPage pins={pins} nameOf={nameOf} importPins={importPins} importFromLzr={importFromLzr} />}
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <TripBar />
          <TabBar pinCount={countPins(pins)} />
        </div>
      </RecorderProvider>
    </HashRouter>
  )
}
