import type { Zone } from '../types/zone'

interface Props {
  zone: Zone
  onClick: () => void
  distanceKm?: number | null
  distanceLabel?: string | null
}

export function ZoneCard({ zone, onClick, distanceLabel }: Props) {
  const preview =
    zone.dockNotes || zone.parkNotes || zone.accessNotes || 'No dock notes yet'

  const depot = !!zone.depot
  return (
    <button
      type="button"
      className={`card zone-card zone-card--tap${depot ? ' zone-card--depot' : ''}`}
      onClick={onClick}
      data-testid={depot ? 'depot-card' : undefined}
    >
      <div className="zone-card__row">
        <div className="zone-card__pin" aria-hidden>
          {depot ? '🏭' : '📍'}
        </div>
        <div className="zone-card__meta">
          <p className="zone-card__suburb-strong">{zone.suburb}</p>
          <h3 className="zone-card__name">{zone.name}</h3>
          {zone.region ? (
            <p className="zone-card__region">{zone.region}</p>
          ) : null}
        </div>
        {distanceLabel ? (
          <span className="zone-card__dist" aria-label={`Distance ${distanceLabel}`}>
            {distanceLabel}
          </span>
        ) : null}
      </div>
      <p className="zone-card__notes">{preview}</p>
      <div className="zone-card__tags">
        {depot ? (
          <span className="tag tag--depot">🏭 Depot</span>
        ) : (
          <span className="tag tag--liquor">{zone.brand || 'Store'}</span>
        )}
        {zone.window ? <span className="tag">{zone.window}</span> : null}
        {zone.dockLat != null && zone.dockLng != null ? (
          zone.dockMine ? (
            <span className="tag tag--mine">📌 Your dock pin</span>
          ) : (
            <span className="tag tag--ok">Dock pin</span>
          )
        ) : (
          <span className="tag">Store pin</span>
        )}
        {zone.parkLat != null && zone.parkLng != null ? (
          zone.parkMine ? (
            <span className="tag tag--mine">📌 Your park-up</span>
          ) : (
            <span className="tag tag--park">Park-up</span>
          )
        ) : null}
        {zone.custom ? <span className="tag tag--custom">Custom</span> : null}
        {zone.starter ? <span className="tag">Starter</span> : null}
      </div>
    </button>
  )
}
