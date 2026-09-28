/** Build a Google Maps directions URL for a destination. */
export function directionsUrl(lat: number, lng: number, label?: string): string {
  const dest =
    Number.isFinite(lat) && Number.isFinite(lng)
      ? `${lat},${lng}`
      : encodeURIComponent(label || '')
  // origin omitted → Google Maps uses current location when available
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=driving`
}

export function openDirections(lat: number, lng: number, label?: string) {
  window.open(directionsUrl(lat, lng, label), '_blank', 'noopener,noreferrer')
}
