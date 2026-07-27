import { evaluateHorizontalExposure, evaluateTimeStatus, evaluateAltitudeExposure, hazardBandFt } from './hazard-exposure.js'
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

function interpolate(levels, altitudeFt, sampleIndex, field) {
  const points = levels.map((level) => {
    const sample = level.values?.[sampleIndex]
    return { altFt: sample?.altFt, value: sample?.[field] }
  })
    .filter((point) => Number.isFinite(point.altFt) && Number.isFinite(point.value)).sort((a, b) => a.altFt - b.altFt)
  const exact = points.find((point) => point.altFt === altitudeFt)
  if (exact) return { value: exact.value, source: 'exact' }
  const lower = points.filter((point) => point.altFt < altitudeFt).at(-1)
  const upper = points.find((point) => point.altFt > altitudeFt)
  if (!lower || !upper) return null
  return { value: lower.value + (upper.value - lower.value) * ((altitudeFt - lower.altFt) / (upper.altFt - lower.altFt)), source: 'interpolated' }
}

const MS_TO_KT = 1.94384

// 동서(u)·남북(v) 성분 → 바람이 "불어오는" 방향(도)과 세기(kt). 항공 관례대로 풍향은 from 기준.
function windVector(uMs, vMs) {
  const speedKt = Math.round(Math.hypot(uMs, vMs) * MS_TO_KT)
  if (speedKt === 0) return { directionDeg: null, speedKt: 0 }
  const directionDeg = (Math.round(Math.atan2(-uMs, -vMs) * 180 / Math.PI) + 360) % 360
  return { directionDeg: directionDeg === 0 ? 360 : directionDeg, speedKt }
}

export function weightedWind(levels, axis, altitudeFt, weights, includeZeroWeight = true) {
  const values = []
  const vectors = []
  const samples = axis.samples ?? []
  for (const [index, sample] of samples.entries()) {
    if (!includeZeroWeight && !(weights[index] > 0)) continue
    const u = interpolate(levels, altitudeFt, index, 'u')
    const v = interpolate(levels, altitudeFt, index, 'v')
    if (!u || !v) continue
    const rad = sample.bearingDeg * Math.PI / 180
    values.push({ value: (u.value * Math.sin(rad) + v.value * Math.cos(rad)) * MS_TO_KT, weight: weights[index] })
    // 풍향은 각도 평균을 내면 359°와 1° 사이에서 무너지므로 u·v 벡터를 평균한 뒤 각도로 되돌린다.
    vectors.push({ u: u.value, v: v.value, weight: weights[index] })
  }
  if (!values.length) return null
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  const average = totalWeight > 0
    ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : values.reduce((sum, item) => sum + item.value, 0) / values.length
  const vectorWeight = vectors.reduce((sum, item) => sum + item.weight, 0)
  const meanOf = (key) => (vectorWeight > 0
    ? vectors.reduce((sum, item) => sum + item[key] * item.weight, 0) / vectorWeight
    : vectors.reduce((sum, item) => sum + item[key], 0) / vectors.length)
  return {
    averageKt: Math.round(average),
    minKt: Math.round(Math.min(...values.map((item) => item.value))),
    maxKt: Math.round(Math.max(...values.map((item) => item.value))),
    ...windVector(meanOf('u'), meanOf('v')),
  }
}

export function sampleWeights(samples) {
  return samples.map((sample, index) => {
    const next = samples[index + 1]?.distanceNm
    return Number.isFinite(next) ? Math.max(0, next - sample.distanceNm) : 0
  })
}

function gradeRank(value) {
  if (Number.isFinite(Number(value))) return Number(value)
  return ({ none: 0, light: 1, moderate: 2, severe: 3 }[String(value).toLowerCase()] ?? 0)
}

function categoricalAt(levels, altitudeFt, sampleIndex, field) {
  const choices = levels.map((level) => {
    const sample = level.values?.[sampleIndex]
    const value = sample?.[field]
    const sampleAltitude = sample?.altFt ?? level.altFt
    return { value, altitudeFt: sampleAltitude }
  }).filter((choice) => choice.value != null && Number.isFinite(choice.altitudeFt))
  if (!choices.length) return null
  return choices.sort((a, b) => Math.abs(a.altitudeFt - altitudeFt) - Math.abs(b.altitudeFt - altitudeFt))[0].value
}

export function exposureSummary(levels, axis, altitudeFt, field, weights, transform = (value) => value, includeZeroWeight = true) {
  if (!Array.isArray(levels) || !levels.length || !axis?.samples?.length) return { status: 'unavailable', highestGrade: null, exposureNmByGrade: {} }
  const byGrade = {}
  let highest = null
  for (const [index, sample] of axis.samples.entries()) {
    if (!includeZeroWeight && !(weights[index] > 0)) continue
    const rawGrade = categoricalAt(levels, altitudeFt, index, field)
    const grade = rawGrade == null ? null : transform(rawGrade)
    if (grade == null) continue
    const key = String(grade)
    byGrade[key] = Number(((byGrade[key] ?? 0) + weights[index]).toFixed(2))
    if (highest == null || gradeRank(grade) > gradeRank(highest)) highest = grade
  }
  return highest == null
    ? { status: 'unavailable', highestGrade: null, highestGradeExposureNm: 0, exposureNmByGrade: {} }
    : { status: 'available', highestGrade: highest, highestGradeExposureNm: byGrade[String(highest)] ?? 0, exposureNmByGrade: byGrade }
}

// 국제표준대기(ISA) 기온. 해면 15°C에서 1,000ft당 1.98°C씩 내려가고, 대류권계면
// (36,089ft) 위로는 -56.5°C로 일정하다. 성능·결빙 판단은 절대기온이 아니라 이 기준
// 대비 편차로 하므로 기온과 함께 낸다.
export function isaTemperatureC(altitudeFt) {
  return altitudeFt >= 36089 ? -56.5 : 15 - 1.98 * (altitudeFt / 1000)
}

export function weightedTemperature(levels, axis, altitudeFt, weights, includeZeroWeight = true) {
  const values = []
  for (const [index] of (axis?.samples ?? []).entries()) {
    if (!includeZeroWeight && !(weights[index] > 0)) continue
    // 단면 샘플러가 내보내는 키는 소문자 t이고 이미 섭씨다(cross-section-sampler의 nullableC).
    // 대문자 'T' + 켈빈 변환은 원본 격자 필드명을 그대로 쓴 것이라 항상 null이 됐다.
    const value = interpolate(levels, altitudeFt, index, 't')
    if (value) values.push({ value: value.value, weight: weights[index] })
  }
  if (!values.length) return null
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0)
  const average = totalWeight > 0
    ? values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight
    : values.reduce((sum, item) => sum + item.value, 0) / values.length
  return {
    meanC: Math.round(average),
    minC: Math.round(Math.min(...values.map((item) => item.value))),
    maxC: Math.round(Math.max(...values.map((item) => item.value))),
    isaDevC: Math.round(average - isaTemperatureC(altitudeFt)),
  }
}

function matchHazards(hazards, axis, altitudeFt, etd, eta) {
  return hazards.flatMap(({ source, item }) => {
    const horizontalExposure = evaluateHorizontalExposure({ axis, geometry: item.geometry })
    if (horizontalExposure.status !== 'intersects') return []
    const altitudeExposure = evaluateAltitudeExposure({ horizontalExposure, bandFt: hazardBandFt(item), plannedCruiseAltitudeFt: altitudeFt })
    // bandFt가 있고(SIGMET/AIRMET 원문에 명시된 고도대) 이 후보 고도가 확실히 그 밖이면
    // "인근"이 아니라 이 고도와 무관한 것이다 — 목록에서 아예 뺀다.
    if (altitudeExposure.status === 'clear') return []
    const timeStatus = evaluateTimeStatus({ etd, eta, validFrom: item.valid_from, validTo: item.valid_to })
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
      horizontalExposure,
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
  const weights = sampleWeights(axis?.samples ?? [])
  return candidates.map((candidate) => {
    if (candidate.status !== 'valid') return { ...candidate, weatherStatus: 'unavailable' }
    const wind = weightedWind(crossSection?.levels ?? [], axis, candidate.altitudeFt, weights)
    const weatherStatus = wind ? 'available' : 'weather_unavailable'
    return {
      ...candidate,
      weatherStatus,
      wind,
      icing: { summary: exposureSummary(crossSection?.levels, axis, candidate.altitudeFt, 'icing', weights) },
      turbulence: { summary: exposureSummary(turbulence?.levels, axis, candidate.altitudeFt, 'ktg', weights, ktgIntensity) },
      hazards: matchHazards(hazards, axis, candidate.altitudeFt, etd, eta),
      notams: matchNotams(notams, axis, candidate.altitudeFt, etd, eta),
    }
  })
}
