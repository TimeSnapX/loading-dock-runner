/** Read GPS + date from a photo's EXIF, entirely on-device (no upload). */

export type PhotoGpsResult =
  | { ok: true; lat: number; lng: number; takenAt: string | null; accuracy: number | null }
  | { ok: false; reason: 'no-gps' | 'unreadable'; takenAt: string | null }

function fmtDate(d: unknown): string | null {
  if (d instanceof Date && !Number.isNaN(d.getTime())) {
    return d.toLocaleString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }
  if (typeof d === 'string' && d.trim()) return d
  return null
}

export async function readPhotoGps(file: Blob): Promise<PhotoGpsResult> {
  let data: Record<string, unknown> | undefined
  try {
    const exifr = (await import('exifr')).default
    data = await exifr.parse(file, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateValues: true,
      reviveValues: true,
    })
  } catch {
    return { ok: false, reason: 'unreadable', takenAt: null }
  }
  if (!data) return { ok: false, reason: 'no-gps', takenAt: null }
  const takenAt = fmtDate(data.DateTimeOriginal ?? data.CreateDate ?? data.ModifyDate)
  const lat = Number(data.latitude)
  const lng = Number(data.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    return { ok: false, reason: 'no-gps', takenAt }
  }
  const accRaw = Number(data.GPSHPositioningError)
  return {
    ok: true,
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    takenAt,
    accuracy: Number.isFinite(accRaw) ? accRaw : null,
  }
}
