import { fmtKst } from './formatters.js'

export function formatAmosValue(value, suffix = '') {
  return Number.isFinite(value) ? `${value}${suffix}` : '-'
}

export function formatMsToKt(value) {
  return Number.isFinite(value) ? `${(value * 1.943844).toFixed(1)}` : '-'
}

export function formatAmosTime(value) {
  if (!value) return '愿痢≪떆媛??놁쓬'
  const compact = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/)
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4]}:${compact[5]} KST`
  return fmtKst(value)
}

const AMOS_REPRESENTATIVE_RUNWAYS = {
  RKSI: ['15L', '33R'],
  RKSS: ['14R', '32L'],
  RKPC: ['07', '25'],
  RKJB: ['01', '19'],
  RKNY: ['15', '33'],
  RKPU: ['18', '36'],
  RKJY: ['17', '35'],
}

export function enrichAmosRunways(amos) {
  const runways = Array.isArray(amos?.runways) ? amos.runways : []
  return [0, 1].map((index) => ({
    ...(runways[index] || {}),
    runway: runways[index]?.side || (index === 0 ? 'L' : 'R'),
  }))
}

function runwayNumberFromHeading(heading) {
  if (!Number.isFinite(heading)) return null
  const number = Math.round((((heading % 360) + 360) % 360) / 10) || 36
  return String(number).padStart(2, '0')
}

export function runwayLabelsFromAirport(airportMeta) {
  const mapped = AMOS_REPRESENTATIVE_RUNWAYS[airportMeta?.icao]
  if (mapped) return mapped
  const first = runwayNumberFromHeading(airportMeta?.runway_hdg)
  const second = Number.isFinite(airportMeta?.runway_hdg)
    ? runwayNumberFromHeading((airportMeta.runway_hdg + 180) % 360)
    : null
  return [first || 'RWY', second || 'RWY']
}

function runwayHeadingFromLabel(label) {
  if (!label) return null
  const match = String(label).match(/^(\d{2})/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return (value % 36) * 10 || 360
}

export function pickActiveRunwayLabel(labels, wind) {
  if (!Array.isArray(labels) || labels.length === 0) return null
  if (!Number.isFinite(wind?.direction)) return labels[0] || null
  const speed = Number.isFinite(wind?.speed) ? wind.speed : 0
  let bestLabel = labels[0] || null
  let bestHeadwind = -Infinity
  for (const label of labels) {
    const heading = runwayHeadingFromLabel(label)
    if (!Number.isFinite(heading)) continue
    const angleRad = ((wind.direction - heading) * Math.PI) / 180
    const headwind = Math.cos(angleRad) * speed
    if (headwind > bestHeadwind) {
      bestHeadwind = headwind
      bestLabel = label
    }
  }
  return bestLabel
}
