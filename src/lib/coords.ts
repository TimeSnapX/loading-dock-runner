/** Coordinate parsing / validation for pasted text, Google Maps URLs and DMS. */

export interface LatLng {
  lat: number
  lng: number
}

export type ParseResult =
  | { ok: true; lat: number; lng: number; format: string; note?: string }
  | { ok: false; error: string }

/** Rough South-East Queensland bounding box used for a sanity warning only. */
export const SEQ_BOUNDS = { minLat: -29.5, maxLat: -25.5, minLng: 151.5, maxLng: 154 }

export function inSeq(lat: number, lng: number): boolean {
  return (
    lat >= SEQ_BOUNDS.minLat &&
    lat <= SEQ_BOUNDS.maxLat &&
    lng >= SEQ_BOUNDS.minLng &&
    lng <= SEQ_BOUNDS.maxLng
  )
}

export function validRange(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return 'Latitude and longitude must be numbers.'
  if (lat < -90 || lat > 90) return 'Latitude must be between -90 and 90.'
  if (lng < -180 || lng > 180) return 'Longitude must be between -180 and 180.'
  return null
}

/** Warning text when a valid coordinate is outside SEQ (never blocks saving). */
export function seqWarning(lat: number, lng: number): string | null {
  if (inSeq(lat, lng)) return null
  if (inSeq(-lat, lng)) {
    return `Outside SEQ — latitude is positive. SEQ is south of the equator; did you mean ${(-lat).toFixed(6)}?`
  }
  if (inSeq(lng, lat)) return 'Outside SEQ — lat and lng look swapped.'
  return 'Outside SEQ (roughly lat -29.5 to -25.5, lng 151.5 to 154). Check the numbers — you can still save.'
}

export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6
}

const NUM = '[-+]?\\d+(?:\\.\\d+)?'

function finish(lat: number, lng: number, format: string, note?: string): ParseResult {
  let la = lat
  let ln = lng
  let n = note
  // Obvious swap: first value can't be a latitude but second can.
  if (Math.abs(la) > 90 && Math.abs(ln) <= 90) {
    ;[la, ln] = [ln, la]
    n = 'Values looked like lng, lat — swapped.'
  }
  const err = validRange(la, ln)
  if (err) return { ok: false, error: err }
  return { ok: true, lat: round6(la), lng: round6(ln), format, note: n }
}

function parseUrl(text: string): ParseResult | null {
  const looksUrl = /https?:\/\/|maps\.|goo\.gl|google\.[a-z.]+\/maps|geo:/i.test(text)
  if (!looksUrl) return null
  let s = text
  try {
    s = decodeURIComponent(text.replace(/\+/g, ' '))
  } catch {
    /* keep raw */
  }
  // Place pin (most accurate): !3d<lat>!4d<lng>
  let m = s.match(new RegExp(`!3d(${NUM})!4d(${NUM})`))
  if (m) return finish(+m[1], +m[2], 'Google Maps link (place pin)')
  // Query params
  m = s.match(
    new RegExp(`[?&](?:q|query|ll|sll|destination|daddr|center|saddr)=(?:loc:)?\\s*(${NUM})\\s*,\\s*(${NUM})`, 'i'),
  )
  if (m) return finish(+m[1], +m[2], 'Google Maps link (?q=)')
  // geo: URI
  m = s.match(new RegExp(`geo:(${NUM}),(${NUM})`, 'i'))
  if (m) return finish(+m[1], +m[2], 'geo: link')
  // /place/lat,lng or /search/lat,lng or /dir//lat,lng
  m = s.match(new RegExp(`/(?:place|search|dir(?:/[^/]*)?)/\\s*(${NUM})\\s*,\\s*(${NUM})`, 'i'))
  if (m) return finish(+m[1], +m[2], 'Google Maps link (place)')
  // Map viewport centre @lat,lng,zoom
  m = s.match(new RegExp(`@(${NUM}),(${NUM})`))
  if (m) return finish(+m[1], +m[2], 'Google Maps link (@ map centre)', 'Map centre from @ — drag the pin to fine-tune.')
  if (/goo\.gl|maps\.app/i.test(s)) {
    return {
      ok: false,
      error:
        'Short share links (maps.app.goo.gl) can’t be read here. Open it in Google Maps, long-press the spot, and copy the numbers shown (e.g. -27.4698, 153.0251).',
    }
  }
  return { ok: false, error: 'Could not find coordinates in that link.' }
}

interface Part {
  value: number
  hemi: string | null
}

function dmsToDec(deg: string, min?: string, sec?: string): number {
  const d = Math.abs(parseFloat(deg.replace(',', '.')))
  const mi = min ? parseFloat(min) : 0
  const se = sec ? parseFloat(sec) : 0
  return d + mi / 60 + se / 3600
}

function applyParts(a: Part, b: Part, format: string): ParseResult {
  let latP = a
  let lngP = b
  if ((a.hemi === 'E' || a.hemi === 'W') && (b.hemi === 'N' || b.hemi === 'S' || b.hemi == null)) {
    latP = b
    lngP = a
  }
  const sign = (p: Part, neg: string) => (p.hemi === neg ? -Math.abs(p.value) : p.value)
  return finish(sign(latP, 'S'), sign(lngP, 'W'), format)
}

function parseDms(text: string): ParseResult | null {
  const s = text
    .replace(/[′’‘`´]/g, "'")
    .replace(/[″“”]/g, '"')
    .replace(/''/g, '"')
    .replace(/[º˚]/g, '°')
    .toUpperCase()
  if (!/[°'"NSEW]/.test(s)) return null
  const re = new RegExp(
    `([NSEW])?\\s*([-+]?\\d+(?:\\.\\d+)?)\\s*°\\s*(?:(\\d+(?:\\.\\d+)?)\\s*'\\s*)?(?:(\\d+(?:\\.\\d+)?)\\s*"\\s*)?([NSEW])?`,
    'g',
  )
  const parts: Part[] = []
  for (const m of s.matchAll(re)) {
    const neg = m[2].startsWith('-')
    let v = dmsToDec(m[2], m[3], m[4])
    if (neg) v = -v
    parts.push({ value: v, hemi: m[1] || m[5] || null })
  }
  if (parts.length >= 2) return applyParts(parts[0], parts[1], 'Degrees / minutes / seconds')
  // Decimal with hemisphere letters: "27.4698 S, 153.0251 E" or "S 27.4698 E 153.0251"
  const re2 = new RegExp(`([NSEW])?\\s*(\\d+(?:\\.\\d+)?)\\s*([NSEW])?`, 'g')
  const p2: Part[] = []
  for (const m of s.matchAll(re2)) {
    if (!m[1] && !m[3]) continue
    p2.push({ value: parseFloat(m[2]), hemi: m[1] || m[3] })
  }
  if (p2.length >= 2) return applyParts(p2[0], p2[1], 'Decimal with N/S/E/W')
  return null
}

function parsePlain(text: string): ParseResult | null {
  const s = text.trim().replace(/^[([]|[)\]]$/g, '')
  const m = s.match(new RegExp(`^\\s*(${NUM})\\s*(?:[,;/]\\s*|\\s+)(${NUM})\\s*$`))
  if (m) return finish(+m[1], +m[2], 'Decimal lat, lng')
  // European decimal comma with semicolon/space separator: "-27,4698; 153,0251"
  const m2 = s.match(/^\s*([-+]?\d+,\d+)\s*[; ]\s*([-+]?\d+,\d+)\s*$/)
  if (m2) return finish(+m2[1].replace(',', '.'), +m2[2].replace(',', '.'), 'Decimal (comma decimals)')
  return null
}

/** Parse any supported coordinate text. */
export function parseCoordinates(input: string): ParseResult {
  const text = (input || '').trim()
  if (!text) return { ok: false, error: 'Paste coordinates or a Google Maps link.' }
  return (
    parseUrl(text) ??
    parsePlain(text) ??
    parseDms(text) ?? {
      ok: false,
      error:
        'Not recognised. Try "-27.4698, 153.0251", a Google Maps link, or 27°28\'11.3"S 153°01\'30.4"E.',
    }
  )
}

export function formatLatLng(lat: number, lng: number): string {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`
}
