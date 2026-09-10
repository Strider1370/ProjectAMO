import { briefingTimeFields } from '../route-briefing/lib/briefingTime.js'

export function organizationFromMembership(membership) {
  return membership?.organization || membership || null
}

export function localDateTimeValue(value, tz = 'KST') {
  if (!Number.isFinite(Date.parse(value))) return ''
  const fields = briefingTimeFields(value, tz)
  return `${fields.year}-${String(fields.month).padStart(2, '0')}-${String(fields.day).padStart(2, '0')}T${String(fields.hour).padStart(2, '0')}:${String(fields.minute).padStart(2, '0')}`
}

export function shareFlightDefaults(source, tz = 'KST') {
  const altitude = source?.cruiseAltitudeFt ?? source?.profileRequest?.plannedCruiseAltitudeFt
  return {
    name: source?.name || '',
    etd: localDateTimeValue(source?.etd, tz),
    eta: localDateTimeValue(source?.eta, tz),
    cruiseAltitudeFt: altitude != null && Number.isFinite(Number(altitude)) ? String(Number(altitude)) : '',
  }
}

export function buildShareFlightBody({ source, name, etd, eta, cruiseAltitudeFt, tz = 'KST', toIso }) {
  if (!source?.id) throw new Error('공유할 저장 자료를 선택하세요.')
  const body = { savedRouteId: source.id }
  if (String(name || '').trim()) body.name = String(name).trim()
  if (etd) body.etd = toIso(etd, tz)
  if (eta) body.eta = toIso(eta, tz)
  if (cruiseAltitudeFt !== '' && cruiseAltitudeFt != null) body.cruiseAltitudeFt = Number(cruiseAltitudeFt)
  return body
}

export function organizationFlightHref(orgId, flightId) {
  return `/lounge/${encodeURIComponent(orgId)}/flights/${encodeURIComponent(flightId)}`
}
