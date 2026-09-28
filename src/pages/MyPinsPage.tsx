import { Link } from 'react-router-dom'
import { PinsTransferPanel } from '../components/PinsTransferSheet'
import { OtherAppsImport } from '../components/OtherAppsImport'
import { formatLatLng } from '../lib/coords'
import { FIELD_LABEL, type ImportResult, type PinField, type PinOverrides } from '../lib/pins'
import type { LzrImportResult } from '../hooks/useZones'

interface Props {
  pins: PinOverrides
  nameOf: (id: string) => string
  importPins: (text: string) => ImportResult
  importFromLzr: () => LzrImportResult
}

const SRC: Record<string, string> = { manual: 'typed/pasted', photo: 'photo', gps: 'GPS' }

export function MyPinsPage({ pins, nameOf, importPins, importFromLzr }: Props) {
  const rows = Object.entries(pins)
    .flatMap(([id, v]) =>
      (['dock', 'park'] as PinField[]).filter((f) => v[f]).map((f) => ({ id, field: f, pin: v[f]! })),
    )
    .sort((a, b) => nameOf(a.id).localeCompare(nameOf(b.id)) || a.field.localeCompare(b.field))

  return (
    <div className="page">
      <h2 className="page__title">My pins</h2>
      <section className="card pins-card">
        <PinsTransferPanel pins={pins} nameOf={nameOf} importPins={importPins} />
      </section>

      <OtherAppsImport importFromLzr={importFromLzr} />

      <section className="card">
        <h2 className="card__title">Saved pins ({rows.length})</h2>
        {rows.length ? (
          <ul className="pin-list" data-testid="pin-list">
            {rows.map((r) => (
              <li key={`${r.id}-${r.field}`}>
                <Link to={`/zone/${r.id}`} className="pin-list__item">
                  <span className="pin-list__name">{nameOf(r.id)}</span>
                  <span className="muted">
                    {FIELD_LABEL[r.field]} · {formatLatLng(r.pin.lat, r.pin.lng)} · {SRC[r.pin.source] ?? r.pin.source}
                    {r.pin.accuracy != null ? ` ±${Math.round(r.pin.accuracy)} m` : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            No pins yet. Open a store on the Stores tab and tap “📍 Set dock location” or “🅿️ Set park-up location”.
          </p>
        )}
      </section>
    </div>
  )
}
