import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { openDirections } from '../lib/maps'
import {
  destCoords,
  hasParkCoords,
  type Zone,
  type ZoneNotesMap,
} from '../types/zone'
import { ZoneMap } from '../components/ZoneMap'
import { PinSheet } from '../components/PinSheet'
import { PinsTransferSheet } from '../components/PinsTransferSheet'
import { formatLatLng } from '../lib/coords'
import type { ImportResult, PinField, PinOverride, PinOverrides } from '../lib/pins'

interface Props {
  getZone: (id: string) => Zone | undefined
  notes: ZoneNotesMap
  saveNote: (id: string, note: string) => void
  updateZone: (id: string, patch: Partial<Zone>) => void
  deleteCustomZone: (id: string) => void
  pins: PinOverrides
  setPin: (id: string, field: PinField, pin: PinOverride) => void
  clearPin: (id: string, field: PinField) => void
  importPins: (text: string) => ImportResult
  getBundledZone: (id: string) => Zone | undefined
  nameOf: (id: string) => string
}

const SRC: Record<string, string> = { manual: 'typed/pasted', photo: 'photo', gps: 'GPS' }

function PinLine({
  mine,
  lat,
  lng,
  pin,
  kind,
}: {
  mine: boolean
  lat: number | null
  lng: number | null
  pin?: PinOverride
  kind: 'dock' | 'park-up'
}) {
  if (lat == null || lng == null) {
    return (
      <p className="pin-line muted" data-testid={`pinline-${kind}`}>
        No {kind} GPS yet.
      </p>
    )
  }
  return (
    <p className="pin-line" data-testid={`pinline-${kind}`}>
      {mine ? <span className="tag tag--mine">📌 Your pin</span> : <span className="tag">Bundled</span>}{' '}
      <span className="pin-line__coords">{formatLatLng(lat, lng)}</span>
      {mine && pin ? (
        <span className="muted">
          {' '}
          · {SRC[pin.source] ?? pin.source}
          {pin.accuracy != null ? ` ±${Math.round(pin.accuracy)} m` : ''} · saved{' '}
          {new Date(pin.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
        </span>
      ) : null}
    </p>
  )
}

export function ZoneDetailPage({
  getZone,
  notes,
  saveNote,
  updateZone,
  deleteCustomZone,
  pins,
  setPin,
  clearPin,
  importPins,
  getBundledZone,
  nameOf,
}: Props) {
  const [pinSheet, setPinSheet] = useState<PinField | null>(null)
  const [pinsOpen, setPinsOpen] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const zone = getZone(id)
  const [editingNote, setEditingNote] = useState(false)
  const [noteDraft, setNoteDraft] = useState(notes[id] ?? '')
  const [editingTips, setEditingTips] = useState(false)
  const [tipsDraft, setTipsDraft] = useState(
    zone ? zone.tips.join('\n') : '',
  )

  if (!zone) {
    return (
      <div className="page">
        <Link to="/" className="detail__back">
          ← Back
        </Link>
        <div className="card empty">Store not found.</div>
      </div>
    )
  }

  const personalNote = notes[zone.id] ?? ''
  const dest = destCoords(zone)
  const parkOk = hasParkCoords(zone)
  const myPins = pins[zone.id] ?? {}
  const bundledZone = getBundledZone(zone.id)
  const bundledFor = (f: PinField) => {
    if (!bundledZone) return null
    const lat = f === 'dock' ? bundledZone.dockLat : bundledZone.parkLat
    const lng = f === 'dock' ? bundledZone.dockLng : bundledZone.parkLng
    return lat != null && lng != null ? { lat, lng } : null
  }
  const flash = (t: string) => {
    setToast(t)
    setTimeout(() => setToast(null), 2500)
  }

  return (
    <div className="page">
      <button type="button" className="detail__back" onClick={() => navigate(-1)}>
        ← Back
      </button>

      <header>
        <p className="detail__suburb-strong">{zone.suburb}</p>
        <h1 className="detail__name">{zone.name}</h1>
        <p className="detail__suburb">
          {zone.depot ? `Depot · ${zone.accessNotes}` : zone.brand}
          {zone.region ? ` · ${zone.region}` : ''}
        </p>
        <div className="zone-card__tags" style={{ marginTop: '0.55rem' }}>
          {zone.depot ? <span className="badge badge--depot" data-testid="depot-badge">🏭 Depot</span> : null}
          {zone.starter ? <span className="badge">Starter data</span> : null}
          {zone.custom ? <span className="badge badge--muted">Custom</span> : null}
          <span className="badge badge--muted">
            {dest.kind === 'dock'
              ? zone.dockMine
                ? '📌 Your dock pin'
                : 'Dock pin ready'
              : zone.depot
                ? 'Depot pin · dock TBD'
                : 'Store pin · dock TBD'}
          </span>
        </div>
      </header>

      <ZoneMap zones={[zone]} selectedId={zone.id} showParkMarkers />

      <div className="btn-row">
        <button
          type="button"
          className="btn btn--primary btn--block"
          onClick={() =>
            openDirections(dest.lat, dest.lng, `${zone.name} ${zone.suburb}`)
          }
        >
          Get there → {dest.kind === 'dock' ? (zone.dockMine ? 'Your dock pin' : 'Dock') : zone.depot ? 'Depot' : 'Store'} (Maps)
        </button>
        {parkOk ? (
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() =>
              openDirections(
                zone.parkLat!,
                zone.parkLng!,
                `Park-up ${zone.name}`,
              )
            }
          >
            Park-up{zone.parkMine ? ' (your pin)' : ''} → Maps
          </button>
        ) : null}
      </div>

      <section className="card detail__section">
        <p className="detail__label">Dock notes</p>
        <p className="detail__body">{zone.dockNotes || '—'}</p>
        {dest.kind === 'store' ? (
          <p className="muted" style={{ margin: 0 }}>
            No verified dock GPS yet — Get there uses the {zone.depot ? 'depot' : 'store'} pin.
          </p>
        ) : null}
        <PinLine mine={!!zone.dockMine} lat={zone.dockLat} lng={zone.dockLng} pin={myPins.dock} kind="dock" />
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => setPinSheet('dock')}
        >
          📍 Set dock location
        </button>
      </section>

      <section className="card detail__section">
        <p className="detail__label">Best park for storefront</p>
        <p className="detail__body">{zone.parkNotes || '—'}</p>
        {!parkOk ? (
          <p className="muted" style={{ margin: 0 }}>
            No park-up coords yet — guidance above only.
          </p>
        ) : null}
        <PinLine mine={!!zone.parkMine} lat={zone.parkLat} lng={zone.parkLng} pin={myPins.park} kind="park-up" />
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => setPinSheet('park')}
        >
          🅿️ Set park-up location
        </button>
      </section>

      <section className="card detail__section">
        <p className="detail__label">Access notes</p>
        <p className="detail__body">{zone.accessNotes || '—'}</p>
      </section>

      <section className="card detail__section">
        <p className="detail__label">Typical window</p>
        <p className="detail__body">{zone.window || '—'}</p>
      </section>

      <section className="card detail__section">
        <p className="detail__label">Truck constraints</p>
        <p className="detail__body">{zone.constraints || '—'}</p>
      </section>

      <section className="card detail__section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="detail__label">Tips</p>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
            onClick={() => {
              setTipsDraft(zone.tips.join('\n'))
              setEditingTips((v) => !v)
            }}
          >
            {editingTips ? 'Cancel' : 'Edit'}
          </button>
        </div>
        {editingTips ? (
          <div className="form-grid">
            <textarea
              value={tipsDraft}
              onChange={(e) => setTipsDraft(e.target.value)}
              rows={3}
              placeholder="One tip per line"
            />
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={() => {
                const tips = tipsDraft
                  .split('\n')
                  .map((t) => t.trim())
                  .filter(Boolean)
                updateZone(zone.id, { tips })
                setEditingTips(false)
              }}
            >
              Save tips
            </button>
          </div>
        ) : zone.tips.length ? (
          <ul className="detail__tips">
            {zone.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        ) : (
          <p className="detail__body">—</p>
        )}
      </section>

      <section className="card detail__section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p className="detail__label">Your notes</p>
          <button
            type="button"
            className="btn btn--ghost"
            style={{ minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.85rem' }}
            onClick={() => {
              setNoteDraft(personalNote)
              setEditingNote((v) => !v)
            }}
          >
            {editingNote ? 'Cancel' : personalNote ? 'Edit' : 'Add'}
          </button>
        </div>
        {editingNote ? (
          <div className="form-grid">
            <textarea
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Gate codes, quirks from real drops…"
              rows={4}
            />
            <button
              type="button"
              className="btn btn--secondary btn--block"
              onClick={() => {
                saveNote(zone.id, noteDraft)
                setEditingNote(false)
              }}
            >
              Save note
            </button>
          </div>
        ) : (
          <p className="detail__body muted">
            {personalNote || 'No personal notes yet — add what you learn on the run.'}
          </p>
        )}
      </section>

      {zone.custom ? (
        <div className="btn-row">
          <button
            type="button"
            className="btn btn--secondary btn--block"
            onClick={() => navigate(`/edit/${zone.id}`)}
          >
            Edit custom store
          </button>
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => {
              if (confirm(`Delete “${zone.name}”?`)) {
                deleteCustomZone(zone.id)
                navigate('/')
              }
            }}
          >
            Delete custom store
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn--secondary btn--block"
          onClick={() => navigate(`/edit/${zone.id}`)}
        >
          Edit store details
        </button>
      )}
      <button type="button" className="btn btn--ghost btn--block" onClick={() => setPinsOpen(true)}>
        📌 My pins — copy / download / import
      </button>

      {toast ? (
        <div className="toast" role="status" data-testid="toast">
          {toast}
        </div>
      ) : null}

      {pinSheet ? (
        <PinSheet
          key={pinSheet}
          zone={zone}
          field={pinSheet}
          bundled={bundledFor(pinSheet)}
          current={myPins[pinSheet]}
          onSave={(pin) => {
            setPin(zone.id, pinSheet, pin)
            setPinSheet(null)
            flash(pinSheet === 'dock' ? 'Dock pin saved' : 'Park-up pin saved')
          }}
          onClear={() => {
            clearPin(zone.id, pinSheet)
            setPinSheet(null)
            flash(pinSheet === 'dock' ? 'Dock pin cleared' : 'Park-up pin cleared')
          }}
          onClose={() => setPinSheet(null)}
        />
      ) : null}
      {pinsOpen ? (
        <PinsTransferSheet pins={pins} nameOf={nameOf} importPins={importPins} onClose={() => setPinsOpen(false)} />
      ) : null}
    </div>
  )
}
