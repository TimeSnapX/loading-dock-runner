import { useCallback, useRef, useState } from 'react'
import { Sheet } from './Sheet'
import { PinPreviewMap } from './PinPreviewMap'
import {
  formatLatLng,
  parseCoordinates,
  round6,
  seqWarning,
  validRange,
} from '../lib/coords'
import { readPhotoGps } from '../lib/photoGps'
import { FIELD_LABEL, type PinField, type PinOverride, type PinSource } from '../lib/pins'
import type { Zone } from '../types/zone'

interface Candidate {
  lat: number
  lng: number
  source: PinSource
  accuracy: number | null
}

interface Props {
  zone: Zone
  field: PinField
  /** Bundled coords for this field (ignoring your pin), if any */
  bundled: { lat: number; lng: number } | null
  current: PinOverride | undefined
  onSave: (pin: PinOverride) => void
  onClear: () => void
  onClose: () => void
}

type Tab = 'manual' | 'photo' | 'gps'

type PhotoState =
  | { status: 'idle' }
  | { status: 'reading'; name: string }
  | { status: 'found'; name: string; takenAt: string | null; lat: number; lng: number }
  | { status: 'none'; name: string; takenAt: string | null; unreadable: boolean }

type GpsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; accuracy: number }
  | { status: 'error'; message: string }

const SOURCE_LABEL: Record<PinSource, string> = {
  manual: 'typed / pasted',
  photo: 'photo',
  gps: 'current location',
}

export function PinSheet({ zone, field, bundled, current, onSave, onClear, onClose }: Props) {
  const label = FIELD_LABEL[field]
  const lower = field === 'dock' ? 'dock' : 'park-up'
  const [tab, setTab] = useState<Tab>('manual')
  const [cand, setCand] = useState<Candidate | null>(null)
  const [recenterKey, setRecenterKey] = useState(0)
  const [paste, setPaste] = useState('')
  const [pasteMsg, setPasteMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [latText, setLatText] = useState('')
  const [lngText, setLngText] = useState('')
  const [manualErr, setManualErr] = useState<string | null>(null)
  const [photo, setPhoto] = useState<PhotoState>({ status: 'idle' })
  const [gps, setGps] = useState<GpsState>({ status: 'idle' })
  const [fineTuned, setFineTuned] = useState(false)
  const camRef = useRef<HTMLInputElement>(null)
  const galRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const start = current ?? bundled ?? { lat: zone.lat, lng: zone.lng }

  const choose = useCallback((c: Candidate) => {
    setCand(c)
    setLatText(String(c.lat))
    setLngText(String(c.lng))
    setManualErr(null)
    setFineTuned(false)
    setRecenterKey((k) => k + 1)
  }, [])

  const onPasteChange = (text: string) => {
    setPaste(text)
    if (!text.trim()) {
      setPasteMsg(null)
      return
    }
    const r = parseCoordinates(text)
    if (r.ok) {
      choose({ lat: r.lat, lng: r.lng, source: 'manual', accuracy: null })
      setPasteMsg({ kind: 'ok', text: `Read ${formatLatLng(r.lat, r.lng)} · ${r.format}${r.note ? ` · ${r.note}` : ''}` })
    } else {
      setPasteMsg({ kind: 'err', text: r.error })
    }
  }

  const onLatLngChange = (la: string, ln: string) => {
    setLatText(la)
    setLngText(ln)
    if (!la.trim() || !ln.trim()) {
      setManualErr(null)
      return
    }
    const lat = Number(la.trim().replace(',', '.'))
    const lng = Number(ln.trim().replace(',', '.'))
    const err = validRange(lat, lng)
    if (err) {
      setManualErr(err)
      return
    }
    setManualErr(null)
    setCand({ lat: round6(lat), lng: round6(lng), source: 'manual', accuracy: null })
    setFineTuned(false)
    setRecenterKey((k) => k + 1)
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setPhoto({ status: 'reading', name: file.name })
    const r = await readPhotoGps(file)
    if (r.ok) {
      setPhoto({ status: 'found', name: file.name, takenAt: r.takenAt, lat: r.lat, lng: r.lng })
      choose({ lat: r.lat, lng: r.lng, source: 'photo', accuracy: r.accuracy })
    } else {
      setPhoto({ status: 'none', name: file.name, takenAt: r.takenAt, unreadable: r.reason === 'unreadable' })
    }
  }

  const useMyLocation = () => {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error', message: 'This browser can’t get your location.' })
      return
    }
    setGps({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const acc = Math.round(pos.coords.accuracy)
        setGps({ status: 'ready', accuracy: acc })
        choose({
          lat: round6(pos.coords.latitude),
          lng: round6(pos.coords.longitude),
          source: 'gps',
          accuracy: acc,
        })
      },
      (err) => {
        setGps({
          status: 'error',
          message:
            err.code === err.PERMISSION_DENIED
              ? 'Location permission denied. Allow location for this site in Chrome (tap the icon left of the address), then try again.'
              : err.code === err.TIMEOUT
                ? 'Timed out getting a GPS fix. Step outside the cab/away from the building and try again.'
                : 'Couldn’t get your location. Try again.',
        })
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    )
  }

  const onMove = useCallback((lat: number, lng: number) => {
    setCand((prev) => ({
      lat: round6(lat),
      lng: round6(lng),
      source: prev?.source ?? 'manual',
      accuracy: null,
    }))
    setLatText(String(round6(lat)))
    setLngText(String(round6(lng)))
    setFineTuned(true)
  }, [])

  const warn = cand ? seqWarning(cand.lat, cand.lng) : null
  const flipLat = cand && cand.lat > 0 && seqWarning(-cand.lat, cand.lng) == null

  return (
    <Sheet title={`Set ${lower} location`} onClose={onClose} labelId="pin-sheet-title">
      <p className="muted sheet__sub">
        {zone.name} · {zone.suburb}
      </p>
      <div className="pin-status" data-testid="pin-status">
        {current ? (
          <>
            <span className="tag tag--mine">Your pin</span> {formatLatLng(current.lat, current.lng)} ·{' '}
            {SOURCE_LABEL[current.source]}
            {current.accuracy != null ? ` · ±${Math.round(current.accuracy)} m` : ''}
          </>
        ) : bundled ? (
          <>
            <span className="tag">Bundled</span> {formatLatLng(bundled.lat, bundled.lng)}
          </>
        ) : (
          <>No {lower} GPS yet — pin starts at the store.</>
        )}
      </div>

      <div className="tabs tabs--3" role="tablist" aria-label="How to set location">
        {(
          [
            ['manual', 'Type / paste'],
            ['photo', 'Photo'],
            ['gps', 'My location'],
          ] as [Tab, string][]
        ).map(([t, l]) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="tabs__btn"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === 'manual' ? (
        <div className="form-grid" role="tabpanel">
          <div className="field">
            <label htmlFor="pin-paste">Paste coordinates or Google Maps link</label>
            <textarea
              id="pin-paste"
              rows={2}
              value={paste}
              onChange={(e) => onPasteChange(e.target.value)}
              placeholder={'-27.4698, 153.0251  or  maps link  or  27°28\'11.3"S 153°01\'30.4"E'}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {pasteMsg ? (
            <p className={`pin-msg pin-msg--${pasteMsg.kind}`} role="status" data-testid="paste-msg">
              {pasteMsg.text}
            </p>
          ) : null}
          <div className="form-row">
            <div className="field">
              <label htmlFor="pin-lat">Latitude</label>
              <input
                id="pin-lat"
                type="text"
                inputMode="text"
                value={latText}
                onChange={(e) => onLatLngChange(e.target.value, lngText)}
                placeholder="-27.4698"
                autoComplete="off"
              />
            </div>
            <div className="field">
              <label htmlFor="pin-lng">Longitude</label>
              <input
                id="pin-lng"
                type="text"
                inputMode="text"
                value={lngText}
                onChange={(e) => onLatLngChange(latText, e.target.value)}
                placeholder="153.0251"
                autoComplete="off"
              />
            </div>
          </div>
          {manualErr ? <p className="pin-msg pin-msg--err">{manualErr}</p> : null}
        </div>
      ) : null}

      {tab === 'photo' ? (
        <div className="form-grid" role="tabpanel">
          <p className="muted" style={{ margin: 0 }}>
            Reads the GPS saved inside the photo — on your phone only, nothing is uploaded.
          </p>
          <div className="btn-row">
            <button type="button" className="btn btn--secondary btn--block" onClick={() => camRef.current?.click()}>
              📷 Take photo now
            </button>
            <button type="button" className="btn btn--secondary btn--block" onClick={() => galRef.current?.click()}>
              🖼️ Choose from Gallery
            </button>
          </div>
          <button type="button" className="btn btn--ghost btn--block" onClick={() => fileRef.current?.click()}>
            Browse files instead
          </button>
          <input
            ref={camRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            data-testid="photo-camera"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={galRef}
            type="file"
            accept="image/*"
            hidden
            data-testid="photo-gallery"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <input
            ref={fileRef}
            type="file"
            hidden
            data-testid="photo-file"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {photo.status === 'reading' ? <p className="muted">Reading {photo.name}…</p> : null}
          {photo.status === 'found' ? (
            <p className="pin-msg pin-msg--ok" role="status" data-testid="photo-msg">
              Found GPS in photo: {formatLatLng(photo.lat, photo.lng)}
              {photo.takenAt ? ` · taken ${photo.takenAt}` : ''}
            </p>
          ) : null}
          {photo.status === 'none' ? (
            <div className="pin-msg pin-msg--err" role="status" data-testid="photo-msg">
              <strong>
                {photo.unreadable ? 'Couldn’t read that photo’s details.' : 'No GPS location in this photo.'}
              </strong>
              {photo.takenAt ? <div>Photo taken {photo.takenAt}.</div> : null}
              <ul>
                <li>Your camera’s location tag may be off (Camera → Settings → Location tags).</li>
                <li>
                  Photos sent through Messenger / Facebook (and most chat apps) have the location stripped — pick
                  the <em>original</em> from your Gallery instead.
                </li>
                <li>If the Gallery picker still gives no GPS, try “Browse files instead”.</li>
                <li>
                  Or use{' '}
                  <button type="button" className="linklike" onClick={() => setTab('gps')}>
                    My location
                  </button>{' '}
                  while you’re standing at the {lower}.
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {tab === 'gps' ? (
        <div className="form-grid" role="tabpanel">
          <p className="muted" style={{ margin: 0 }}>
            Stand at the {lower} (out of the cab if you can) for the best fix.
          </p>
          <button
            type="button"
            className="btn btn--primary btn--block"
            onClick={useMyLocation}
            disabled={gps.status === 'loading'}
          >
            {gps.status === 'loading' ? 'Getting GPS fix…' : gps.status === 'ready' ? '📍 Try again' : '📍 Use my current location'}
          </button>
          {gps.status === 'ready' ? (
            <p className={`pin-msg ${gps.accuracy > 50 ? 'pin-msg--warn' : 'pin-msg--ok'}`} role="status" data-testid="gps-msg">
              Accuracy ±{gps.accuracy} m
              {gps.accuracy > 50 ? ' — weak fix; try again or drag the pin to fine-tune.' : ''}
            </p>
          ) : null}
          {gps.status === 'error' ? <p className="pin-msg pin-msg--err">{gps.message}</p> : null}
        </div>
      ) : null}

      <PinPreviewMap
        value={cand}
        start={start}
        store={{ lat: zone.lat, lng: zone.lng }}
        kind={field}
        recenterKey={recenterKey}
        onMove={onMove}
      />
      <p className="muted" style={{ margin: 0 }} data-testid="cand-line">
        {cand
          ? `New ${lower} pin: ${formatLatLng(cand.lat, cand.lng)} · ${SOURCE_LABEL[cand.source]}${
              cand.accuracy != null ? ` · ±${Math.round(cand.accuracy)} m` : ''
            }${fineTuned ? ' · fine-tuned' : ''}`
          : 'Drag the pin or tap the map to place it. Yellow dot = store.'}
      </p>
      {warn ? (
        <div className="pin-msg pin-msg--warn" role="status" data-testid="seq-warn">
          ⚠️ {warn}
          {flipLat && cand ? (
            <div>
              <button
                type="button"
                className="btn btn--ghost"
                style={{ minHeight: 40, marginTop: 6 }}
                onClick={() => choose({ ...cand, lat: -cand.lat })}
              >
                Use {(-cand.lat).toFixed(6)}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="sheet__actions">
        <button
          type="button"
          className="btn btn--primary btn--block"
          disabled={!cand}
          onClick={() => {
            if (!cand) return
            onSave({
              lat: cand.lat,
              lng: cand.lng,
              source: cand.source,
              accuracy: cand.accuracy,
              updatedAt: new Date().toISOString(),
            })
          }}
        >
          Save {label.toLowerCase()} pin
        </button>
        {current ? (
          <button
            type="button"
            className="btn btn--danger btn--block"
            onClick={() => {
              if (confirm(`Clear your ${lower} pin for ${zone.name}?`)) onClear()
            }}
          >
            Clear my {lower} pin
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost btn--block" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Sheet>
  )
}
