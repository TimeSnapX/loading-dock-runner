import { useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Zone } from '../types/zone'

interface Props {
  getZone: (id: string) => Zone | undefined
  addCustomZone: (zone: Omit<Zone, 'id' | 'custom' | 'starter'>) => string
  updateZone: (id: string, patch: Partial<Zone>) => void
}

function parseOptionalCoord(raw: string): number | null {
  const t = raw.trim()
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const empty = {
  name: '',
  brand: 'Liquorland',
  suburb: '',
  region: '',
  lat: -27.47,
  lng: 153.02,
  dockLat: '',
  dockLng: '',
  dockNotes: '',
  parkLat: '',
  parkLng: '',
  parkNotes: '',
  accessNotes: '',
  window: '',
  constraints: '',
  tips: '',
  tags: 'liquorland',
}

export function ZoneFormPage({ getZone, addCustomZone, updateZone }: Props) {
  const { id } = useParams()
  const navigate = useNavigate()
  const existing = id ? getZone(id) : undefined
  const isEdit = Boolean(existing)

  const [form, setForm] = useState(() =>
    existing
      ? {
          name: existing.name,
          brand: existing.brand,
          suburb: existing.suburb,
          region: existing.region,
          lat: existing.lat,
          lng: existing.lng,
          dockLat: existing.dockLat == null ? '' : String(existing.dockLat),
          dockLng: existing.dockLng == null ? '' : String(existing.dockLng),
          dockNotes: existing.dockNotes,
          parkLat: existing.parkLat == null ? '' : String(existing.parkLat),
          parkLng: existing.parkLng == null ? '' : String(existing.parkLng),
          parkNotes: existing.parkNotes,
          accessNotes: existing.accessNotes,
          window: existing.window,
          constraints: existing.constraints,
          tips: existing.tips.join('\n'),
          tags: existing.tags.join(', '),
        }
      : empty,
  )

  const set =
    (key: keyof typeof form) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const raw = e.target.value
      if (key === 'lat' || key === 'lng') {
        setForm((f) => ({ ...f, [key]: Number(raw) }))
      } else {
        setForm((f) => ({ ...f, [key]: raw }))
      }
    }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.suburb.trim()) return
    if (!Number.isFinite(form.lat) || !Number.isFinite(form.lng)) return

    const tags = form.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)
    if (form.brand.toLowerCase() === 'liquorland' && !tags.includes('liquorland')) {
      tags.unshift('liquorland')
    }

    const tips = form.tips
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean)

    const payload: Omit<Zone, 'id' | 'custom' | 'starter'> = {
      name: form.name.trim(),
      brand: form.brand.trim() || 'Other',
      suburb: form.suburb.trim(),
      region: form.region.trim(),
      lat: form.lat,
      lng: form.lng,
      dockLat: parseOptionalCoord(form.dockLat),
      dockLng: parseOptionalCoord(form.dockLng),
      dockNotes: form.dockNotes.trim(),
      parkLat: parseOptionalCoord(form.parkLat),
      parkLng: parseOptionalCoord(form.parkLng),
      parkNotes: form.parkNotes.trim(),
      accessNotes: form.accessNotes.trim(),
      window: form.window.trim(),
      constraints: form.constraints.trim(),
      tips,
      tags,
    }

    if (isEdit && id) {
      updateZone(id, payload)
      navigate(`/zone/${id}`)
    } else {
      const newId = addCustomZone(payload)
      navigate(`/zone/${newId}`)
    }
  }

  return (
    <div className="page">
      <button type="button" className="detail__back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <h1 className="detail__name">{isEdit ? 'Edit store' : 'Add custom store'}</h1>
      <p className="muted" style={{ margin: 0 }}>
        {isEdit
          ? 'Changes are saved on this device (localStorage).'
          : 'Custom stores stay on this device until you clear site data. Leave dock/park coords empty unless verified.'}
      </p>

      <form className="form-grid" onSubmit={submit}>
        <div className="field">
          <label htmlFor="name">Name</label>
          <input id="name" required value={form.name} onChange={set('name')} />
        </div>
        <div className="field">
          <label htmlFor="brand">Brand</label>
          <select id="brand" value={form.brand} onChange={set('brand')}>
            <option value="Liquorland">Liquorland</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="suburb">Suburb</label>
          <input id="suburb" required value={form.suburb} onChange={set('suburb')} />
        </div>
        <div className="field">
          <label htmlFor="region">Region</label>
          <input
            id="region"
            value={form.region}
            onChange={set('region')}
            placeholder="e.g. Brisbane North, Gold Coast"
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="lat">Store lat</label>
            <input
              id="lat"
              type="number"
              step="any"
              required
              value={form.lat}
              onChange={set('lat')}
            />
          </div>
          <div className="field">
            <label htmlFor="lng">Store lng</label>
            <input
              id="lng"
              type="number"
              step="any"
              required
              value={form.lng}
              onChange={set('lng')}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="dockLat">Dock lat (optional)</label>
            <input
              id="dockLat"
              type="text"
              inputMode="decimal"
              value={form.dockLat}
              onChange={set('dockLat')}
              placeholder="Leave blank if unknown"
            />
          </div>
          <div className="field">
            <label htmlFor="dockLng">Dock lng (optional)</label>
            <input
              id="dockLng"
              type="text"
              inputMode="decimal"
              value={form.dockLng}
              onChange={set('dockLng')}
              placeholder="Leave blank if unknown"
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="dockNotes">Dock notes</label>
          <textarea
            id="dockNotes"
            value={form.dockNotes}
            onChange={set('dockNotes')}
            rows={3}
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="parkLat">Park lat (optional)</label>
            <input
              id="parkLat"
              type="text"
              inputMode="decimal"
              value={form.parkLat}
              onChange={set('parkLat')}
            />
          </div>
          <div className="field">
            <label htmlFor="parkLng">Park lng (optional)</label>
            <input
              id="parkLng"
              type="text"
              inputMode="decimal"
              value={form.parkLng}
              onChange={set('parkLng')}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="parkNotes">Best park for storefront</label>
          <textarea
            id="parkNotes"
            value={form.parkNotes}
            onChange={set('parkNotes')}
            rows={2}
            placeholder="Recommended truck park-up / approach"
          />
        </div>
        <div className="field">
          <label htmlFor="access">Access notes</label>
          <textarea id="access" value={form.accessNotes} onChange={set('accessNotes')} rows={2} />
        </div>
        <div className="field">
          <label htmlFor="window">Typical window</label>
          <input id="window" value={form.window} onChange={set('window')} />
        </div>
        <div className="field">
          <label htmlFor="constraints">Truck constraints</label>
          <textarea
            id="constraints"
            value={form.constraints}
            onChange={set('constraints')}
            rows={2}
          />
        </div>
        <div className="field">
          <label htmlFor="tips">Tips (one per line)</label>
          <textarea id="tips" value={form.tips} onChange={set('tips')} rows={2} />
        </div>
        <div className="field">
          <label htmlFor="tags">Tags (comma-separated)</label>
          <input id="tags" value={form.tags} onChange={set('tags')} />
        </div>
        <button type="submit" className="btn btn--primary btn--block">
          {isEdit ? 'Save changes' : 'Add store'}
        </button>
      </form>
    </div>
  )
}
