import { bandToFt } from './planned-altitude.js'
import { evaluateHorizontalExposure, evaluateTimeStatus, evaluateAltitudeExposure } from './hazard-exposure.js'
import { notamBandToFt } from './notam-briefing.js'
import { routeIntervalInGeometry, timeWindowsOverlap } from './geo-time-match.js'
import { ktgIntensity } from '../processors/ktg-model.js'

const RESTRICTION_CATEGORIES = new Set(['prohibited', 'restricted', 'danger', 'firing'])

function ft(value) {
  if (value?.value == null || value.value === '' || !Number.isFinite(Number(value.value))) return null
  return String(value.unit ?? '').toUpperCase() === 'FL' ? Number(value.value) * 100 : Number(value.value)
}

function constraintStatus(routeSegments) {
  const states = routeSegments.map((segment) => segment.status)
  if (states.includes('conflicting')) return 'conflicting'
  if (states.every((state) => state === 'matched')) return 'matched'
  if (states.includes('matched')) return 'partial'
  return 'unavailable'
}

// ENR 1.7 (2026-06-25 rendered table): IFR 000°–179° uses odd thousands,
// 180°–359° uses even thousands; RVSM replaces FL290–410 with 1,000-ft steps.
const IFR_LEVELS = {
  odd: [...Array.from({ length: 15 }, (_, index) => (index * 2 + 1) * 1000), 31000, 33000, 35000, 37000, 39000, 41000, 45000, 49000],
  even: [...Array.from({ length: 14 }, (_, index) => (index + 1) * 2000), 30000, 32000, 34000, 36000, 38000, 40000, 43000, 47000, 51000],
}

function seriesFor(rule) {
  if (Array.isArray(rule)) return rule.map(Number).filter(Number.isFinite)
  const key = String(rule ?? '').toLowerCase()
  return IFR_LEVELS[key] ?? null
}

function commonSeries(routeSegments) {
  const series = routeSegments.map((segment) => seriesFor(segment.constraints?.cruisingLevelSeries?.series))
  if (!series.every(Array.isArray)) return null
  return [...series.slice(1).reduce((common, values) => common.filter((value) => values.includes(value)), series[0])].sort((a, b) => a - b)
}

export function buildAltitudeCandidates({ routeSegments = [], plannedCruiseAltitudeFt, crossSection } = {}) {
  const status = constraintStatus(routeSegments)
  const floor = Math.max(...routeSegments.map((segment) => ft(segment.constraints?.minimumFlightAltitude)).filter(Number.isFinite), -Infinity)
  const ceiling = Math.min(...routeSegments.map((segment) => ft(segment.constraints?.upperLimit)).filter(Number.isFinite), Infinity)
  const base = {
    status,
    routeFloorFt: Number.isFinite(floor) ? floor : null,
    routeCeilingFt: Number.isFinite(ceiling) ? ceiling : null,
    crossSectionAvailable: !!crossSection?.levels?.length,
  }
  const input = Number(plannedCruiseAltitudeFt)
  if (status !== 'matched') return { constraints: base, candidates: [] }
  const series = commonSeries(routeSegments)
  if (!series?.length) return { constraints: { ...base, status: 'conflicting' }, candidates: [] }
  const valid = series.filter((value) => value >= floor && value <= ceiling)
  const inputValid = valid.includes(input)
  const lower = valid.filter((value) => value < input).slice(-2)
  const upper = valid.filter((value) => value > input).slice(0, 2)
  const values = [...new Set([...lower, input, ...upper])]
  return {
    constraints: base,
    candidates: values.map((altitudeFt) => ({
      altitudeFt,
      status: altitudeFt === input && !inputValid ? 'input_invalid' : 'valid',
      displayMode: altitudeFt <= 14000 ? 'altitude' : 'flight_level',
      label: altitudeFt <= 14000 ? `${altitudeFt.toLocaleString()} ft` : `FL${String(altitudeFt / 100).padStart(3, '0')}`,
    })),
  }
}

function interpolate(levels, altitudeFt, distanceNm, field) {
  const points = levels.map((level) => ({ altFt: level.values?.find((value) => value.distanceNm === distanceNm)?.altFt, value: level.values?.find((value) => value.distanceNm === distanceNm)?.[field] }))
    .filter((point) => Number.isFinite(point.altFt) && Number.isFinite(point.value)).sort((a, b) => a.altFt - b.altFt)
  const exact = points.find((point) => point.altFt === altitudeFt)
  if (exact) return { value: exact.value, source: 'exact' }
  const lower = points.filter((point) => point.altFt < altitudeFt).at(-1)
  const upper = points.find((point) => point.altFt > altitudeFt)
  if (!lower || !upper) return null
  return { value: lower.value + (upper.value - lower.value) * ((altitudeFt - lower.altFt) / (upper.altFt - lower.altFt)), source: 'interpolated' }
}

function weightedWind(levels, axis, altitudeFt) {
  const values = []
  const samples = axis.samples ?? []
  const weights = sampleWeights(samples)
  for (const [index, sample] of samples.entries()) {
    const u = interpolate(levels, altitudeFt, sample.distanceNm, 'u')
    const v = interpolate(levels, altitudeFt, sample.distanceNm, 'v')
    if (!u || !v) continue
    const rad = sample.bearingDeg * Math.PI / 180
    values.push({ value: (u.value * Math.sin(rad) + v.value * Math.cos(rad)) * 1.94384, weight: weights[index] })
  }
  if (!values.length) return null
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  const average = totalWeight > 0
    ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : values.reduce((sum, item) => sum + item.value, 0) / values.length
  return { averageKt: Math.round(average), minKt: Math.round(Math.min(...values.map((item) => item.value))), maxKt: Math.round(Math.max(...values.map((item) => item.value))) }
}

function sampleWeights(samples) {
  return samples.map((sample, index) => {
    const next = samples[index + 1]?.distanceNm
    return Number.isFinite(next) ? Math.max(0, next - sample.distanceNm) : 0
  })
}

function gradeRank(value) {
  if (Number.isFinite(Number(value))) return Number(value)
  return ({ none: 0, light: 1, moderate: 2, severe: 3 }[String(value).toLowerCase()] ?? 0)
}

function categoricalAt(levels, altitudeFt, distanceNm, field) {
  const choices = levels.map((level) => {
    const value = level.values?.find((sample) => sample.distanceNm === distanceNm)?.[field]
    const sampleAltitude = level.values?.find((sample) => sample.distanceNm === distanceNm)?.altFt ?? level.altFt
    return { value, altitudeFt: sampleAltitude }
  }).filter((choice) => choice.value != null && Number.isFinite(choice.altitudeFt))
  if (!choices.length) return null
  return choices.sort((a, b) => Math.abs(a.altitudeFt - altitudeFt) - Math.abs(b.altitudeFt - altitudeFt))[0].value
}

function exposureSummary(levels, axis, altitudeFt, field, transform = (value) => value) {
  if (!Array.isArray(levels) || !levels.length || !axis?.samples?.length) return { status: 'unavailable', highestGrade: null, exposureNmByGrade: {} }
  const byGrade = {}
  let highest = null
  for (const [index, sample] of axis.samples.entries()) {
    const rawGrade = categoricalAt(levels, altitudeFt, sample.distanceNm, field)
    const grade = rawGrade == null ? null : transform(rawGrade)
    if (grade == null) continue
    const key = String(grade)
    byGrade[key] = Number(((byGrade[key] ?? 0) + sampleWeights(axis.samples)[index]).toFixed(2))
    if (highest == null || gradeRank(grade) > gradeRank(highest)) highest = grade
  }
  return highest == null
    ? { status: 'unavailable', highestGrade: null, highestGradeExposureNm: 0, exposureNmByGrade: {} }
    : { status: 'available', highestGrade: highest, highestGradeExposureNm: byGrade[String(highest)] ?? 0, exposureNmByGrade: byGrade }
}

function matchHazards(hazards, axis, altitudeFt, etd, eta) {
  return hazards.flatMap(({ source, item }) => {
    const horizontalExposure = evaluateHorizontalExposure({ axis, geometry: item.geometry })
    if (horizontalExposure.status !== 'intersects') return []
    const timeStatus = evaluateTimeStatus({ etd, eta, validFrom: item.valid_from, validTo: item.valid_to })
    const altitudeExposure = evaluateAltitudeExposure({ horizontalExposure, bandFt: bandToFt(item.altitude), plannedCruiseAltitudeFt: altitudeFt })
    return [{
      source,
      sourceId: item.id ?? null,
      label: item.phenomenon_label ?? item.phenomenon_code ?? '현상명 없음',
      altitude: item.altitude ?? null,
      validFrom: item.valid_from ?? null,
      validTo: item.valid_to ?? null,
      encounter: altitudeExposure.status === 'intersects' && timeStatus === 'matched' ? 'on' : 'nearby',
      timeStatus,
      verticalStatus: altitudeExposure.status,
    }]
  })
}

function matchNotams(notams, axis, altitudeFt, etd, eta) {
  return (notams ?? []).flatMap((item) => {
    if (item.scope === 'fir') return []
    const interval = item.geometry ? routeIntervalInGeometry(axis, item.geometry) : { entered: false }
    if (!interval.entered) return []
    const timeKnown = !!item.valid_from && !!item.valid_to && !!etd && !!eta
    if (!timeKnown) return [{ id: item.id, status: 'undetermined' }]
    if (!timeWindowsOverlap(etd, eta, item.valid_from, item.valid_to)) return []
    const band = notamBandToFt(item.altitude)
    if (!band) return [{ id: item.id, status: 'undetermined' }]
    const vertical = altitudeFt >= band.lowFt && altitudeFt <= band.highFt
    if (RESTRICTION_CATEGORIES.has(item.category) && vertical) return [{ id: item.id, status: 'exclude' }]
    return [{ id: item.id, status: 'warn' }]
  })
}

export function buildAltitudeWeatherComparison({ candidates = [], crossSection, turbulence, axis, hazards = [], notams = [], etd, eta } = {}) {
  return candidates.map((candidate) => {
    if (candidate.status !== 'valid') return { ...candidate, weatherStatus: 'unavailable' }
    const wind = weightedWind(crossSection?.levels ?? [], axis, candidate.altitudeFt)
    const weatherStatus = wind ? 'available' : 'weather_unavailable'
    return {
      ...candidate,
      weatherStatus,
      wind,
      icing: { summary: exposureSummary(crossSection?.levels, axis, candidate.altitudeFt, 'icing') },
      turbulence: { summary: exposureSummary(turbulence?.levels, axis, candidate.altitudeFt, 'ktg', ktgIntensity) },
      hazards: matchHazards(hazards, axis, candidate.altitudeFt, etd, eta),
      notams: matchNotams(notams, axis, candidate.altitudeFt, etd, eta),
    }
  })
}
