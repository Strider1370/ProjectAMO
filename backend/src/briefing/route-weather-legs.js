import {
  exposureSummary,
  sampleWeights,
  weightedTemperature,
  weightedWind,
} from './altitude-weather-comparison.js'
import { ktgIntensity } from '../processors/ktg-model.js'
import { distanceMeters } from './route-axis.js'

const OVERLAP_EPSILON_NM = 0.2
const KTG_LEVELS = ['none', 'light', 'moderate', 'severe']

function overlapNm(a, b) {
  if (!a || !b) return 0
  return Math.max(0, Math.min(a.endNm, b.endNm) - Math.max(a.startNm, b.startNm))
}

function legWeights(axis, range) {
  const samples = axis?.samples ?? []
  const base = sampleWeights(samples)
  return samples.map((sample, index) => {
    const next = samples[index + 1]?.distanceNm
    if (!Number.isFinite(next)) return 0
    return Math.min(base[index], Math.max(0, Math.min(next, range.endNm) - Math.max(sample.distanceNm, range.startNm)))
  })
}

function exposures(summary) {
  return Object.entries(summary.exposureNmByGrade ?? {})
    .filter(([, distanceNm]) => distanceNm > 0)
    .map(([level, distanceNm]) => ({ level: Number.isNaN(Number(level)) ? level : Number(level), distanceNm }))
}

function intervalFor(hazard) {
  return hazard.routeIntervalNm ?? hazard.horizontalExposure?.intervals?.[0] ?? null
}

function courseTrueDeg(axis, weights) {
  const values = (axis?.samples ?? []).flatMap((sample, index) => weights[index] > 0 && Number.isFinite(sample.bearingDeg)
    ? [{ value: sample.bearingDeg, weight: weights[index] }]
    : [])
  if (!values.length) return null
  const total = values.reduce((sum, item) => sum + item.weight, 0)
  return Math.round(values.reduce((sum, item) => sum + item.value * item.weight, 0) / total)
}

function constraintFor(segment, entry, sourceCycle) {
  if (segment.kind === 'dct') return { status: 'unavailable', applicability: 'not_applicable', minimumFlightAltitude: null, lowerLimit: null, upperLimit: null, sourceCycle: null }
  return {
    status: entry?.status ?? 'unavailable',
    applicability: 'applicable',
    minimumFlightAltitude: entry?.constraints?.minimumFlightAltitude ?? null,
    lowerLimit: entry?.constraints?.lowerLimit ?? null,
    upperLimit: entry?.constraints?.upperLimit ?? null,
    sourceCycle,
  }
}

function unavailableLeg(segment, selectedCruiseAltitudeFt, sourceCycle) {
  return {
    from: segment.fromFix ?? null, to: segment.toFix ?? null, startNm: null, endNm: null, distanceNm: null,
    courseTrueDeg: null, selectedAltitudeFt: Number(selectedCruiseAltitudeFt) || null, alignmentStatus: 'unavailable',
    wind: null, temp: null, icing: null, turbulence: null, hazards: [], notams: [], timeStatus: 'unavailable',
    altitudeConstraint: constraintFor(segment, null, sourceCycle),
  }
}

function coordinateOf(point) {
  const lon = Number(point?.lon ?? point?.coordinates?.lon)
  const lat = Number(point?.lat ?? point?.coordinates?.lat)
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null
}

function distanceAlongRouteNm(coordinates, target) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !target) return null
  let cumulativeMeters = 0
  let nearest = { distanceSq: Infinity, distanceMeters: 0 }
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = coordinates[index]
    const end = coordinates[index + 1]
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const lengthSq = dx * dx + dy * dy
    const ratio = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((target[0] - start[0]) * dx + (target[1] - start[1]) * dy) / lengthSq))
    const projected = [start[0] + dx * ratio, start[1] + dy * ratio]
    const distanceSq = (target[0] - projected[0]) ** 2 + (target[1] - projected[1]) ** 2
    if (distanceSq < nearest.distanceSq) {
      nearest = { distanceSq, distanceMeters: cumulativeMeters + distanceMeters(start, end) * ratio }
    }
    cumulativeMeters += distanceMeters(start, end)
  }
  return Number((nearest.distanceMeters / 1852).toFixed(2))
}

function procedureEntries(procedureContext) {
  const procedures = procedureContext?.procedures ?? []
  return ['SID', 'STAR', 'IAP'].flatMap((type) => procedures
    .filter((procedure) => String(procedure?.type ?? '').toUpperCase() === type)
    .slice(0, 1))
}

function endpointMarker(routeMarkers, index) {
  const marker = index < 0 ? routeMarkers?.at(index) : routeMarkers?.[index]
  const coordinates = coordinateOf(marker)
  if (!coordinates) return null
  return { id: String(marker?.label ?? marker?.id ?? '').trim() || null, coordinates }
}

function dedupeProcedurePoints(points) {
  return points.filter((point, index) => {
    if (!point?.id || !point.coordinates) return false
    const previous = points[index - 1]
    return !previous || previous.id !== point.id || previous.coordinates[0] !== point.coordinates[0] || previous.coordinates[1] !== point.coordinates[1]
  })
}

function buildProcedureGroups({ routeGeometry, routeMarkers, procedureContext, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams }) {
  const routeCoordinates = routeGeometry?.coordinates
  if (!Array.isArray(routeCoordinates) || routeCoordinates.length < 2) return []
  const departure = endpointMarker(routeMarkers, 0)
  const arrival = endpointMarker(routeMarkers, -1)
  return procedureEntries(procedureContext).flatMap((procedure) => {
    const type = String(procedure.type).toUpperCase()
    const fixes = (procedure.fixes ?? []).map((fix) => ({ id: String(fix?.id ?? '').trim() || null, coordinates: coordinateOf(fix) })).filter((fix) => fix.id && fix.coordinates)
    const points = dedupeProcedurePoints([
      ...(type === 'SID' && departure ? [departure] : []),
      ...fixes,
      ...(type === 'IAP' && arrival ? [arrival] : []),
    ])
    if (points.length < 2) return []
    const positioned = points.map((point) => ({ ...point, distanceNm: distanceAlongRouteNm(routeCoordinates, point.coordinates) }))
    if (positioned.some((point) => !Number.isFinite(point.distanceNm))) return []
    const startNm = positioned[0].distanceNm
    const endNm = positioned.at(-1).distanceNm
    if (endNm <= startNm) return []
    const legs = positioned.slice(0, -1).map((from, index) => {
      const to = positioned[index + 1]
      return buildLeg({
        segment: { kind: 'dct', fromFix: from.id, toFix: to.id, startNm: from.distanceNm, endNm: to.distanceNm, alignmentStatus: 'aligned' },
        weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, constraint: null, sourceCycle: null,
      })
    }).filter((leg) => leg.distanceNm > 0)
    return [{
      type,
      id: String(procedure.id ?? '').trim() || type,
      from: positioned[0].id,
      to: positioned.at(-1).id,
      startNm,
      endNm,
      distanceNm: Number((endNm - startNm).toFixed(2)),
      coordinates: points.map((point) => point.coordinates),
      legs,
    }]
  })
}

function buildLeg({ segment, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, constraint, sourceCycle }) {
  if (segment.alignmentStatus !== 'aligned' || !Number.isFinite(segment.startNm) || !Number.isFinite(segment.endNm)) {
    return unavailableLeg(segment, selectedCruiseAltitudeFt, sourceCycle)
  }
  const range = { startNm: segment.startNm, endNm: segment.endNm }
  const weights = legWeights(weatherAxis, range)
  const wind = weightedWind(crossSection?.levels ?? [], weatherAxis, selectedCruiseAltitudeFt, weights, false)
  const icingSummary = exposureSummary(crossSection?.levels, weatherAxis, selectedCruiseAltitudeFt, 'icing', weights, (value) => value, false)
  const maxTurbulenceAltitude = Math.max(...(turbulence?.levels ?? []).map((level) => Number(level.altFt)).filter(Number.isFinite), -Infinity)
  const turbulenceSummary = selectedCruiseAltitudeFt > maxTurbulenceAltitude
    ? { status: 'unavailable', highestGrade: null, exposureNmByGrade: {} }
    : exposureSummary(turbulence?.levels, weatherAxis, selectedCruiseAltitudeFt, 'ktg', weights, (value) => KTG_LEVELS[ktgIntensity(value)], false)
  const legHazards = (hazards ?? []).flatMap((hazard) => {
    const interval = intervalFor(hazard)
    if (hazard.airportScope || hazard.altitudeExposure?.status === 'clear' || overlapNm(range, interval) <= OVERLAP_EPSILON_NM) return []
    return [{ code: hazard.code ?? hazard.sourceId ?? null, label: hazard.label ?? hazard.code ?? null, routeDistanceNm: overlapNm(range, interval), verticalStatus: hazard.altitudeExposure?.status ?? 'unknown', timeStatus: hazard.timeStatus ?? 'unavailable' }]
  })
  // effect는 "실제 저촉인가"다. comparisonStatus를 그대로 쓰면 안 된다 — 그건 "시간·고도를
  // 비교할 수 있었나"라서, 정보성 시설 NOTAM(TAR 정비 등)까지 warn으로 올라간다.
  const notams = (routeNotams ?? []).flatMap((notam) => overlapNm(range, notam.routeIntervalNm) > OVERLAP_EPSILON_NM
    ? [{
        id: notam.id,
        summary: notam.summary,
        effect: notam.conflict ? 'warn' : (notam.comparisonStatus === 'undetermined' ? 'undetermined' : 'info'),
      }]
    : [])
  return {
    from: segment.fromFix ?? null,
    to: segment.toFix ?? null,
    startNm: segment.startNm,
    endNm: segment.endNm,
    distanceNm: Math.round((segment.endNm - segment.startNm) * 100) / 100,
    courseTrueDeg: courseTrueDeg(weatherAxis, weights),
    selectedAltitudeFt: Number(selectedCruiseAltitudeFt) || null,
    alignmentStatus: 'aligned',
    wind: wind && { meanComponentKt: wind.averageKt, minComponentKt: wind.minKt, maxComponentKt: wind.maxKt, directionDeg: wind.directionDeg, speedKt: wind.speedKt },
    temp: weightedTemperature(crossSection?.levels ?? [], weatherAxis, selectedCruiseAltitudeFt, weights, false),
    icing: { peakLevel: icingSummary.highestGrade, exposures: exposures(icingSummary) },
    turbulence: { peakLevel: turbulenceSummary.highestGrade, exposures: exposures(turbulenceSummary) },
    hazards: legHazards,
    notams,
    timeStatus: legHazards.find((hazard) => hazard.timeStatus !== 'matched')?.timeStatus ?? 'matched',
    altitudeConstraint: constraintFor(segment, constraint, sourceCycle),
  }
}

export function buildRouteWeatherLegs({ routeModel, routeGeometry, routeMarkers, procedureContext, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards = [], routeNotams = [], aipConstraints } = {}) {
  const segments = [...(routeModel?.enRouteSegments ?? [])].sort((a, b) => (a.startNm ?? Infinity) - (b.startNm ?? Infinity))
  const constraints = new Map((aipConstraints?.segments ?? []).map((entry) => [entry.id, entry]))
  const sourceCycle = aipConstraints?.provenance?.publicationId ?? null
  return {
    legs: segments.map((segment) => buildLeg({ segment, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, constraint: constraints.get(segment.id), sourceCycle })),
    procedures: buildProcedureGroups({ routeGeometry, routeMarkers, procedureContext, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams }),
    totalDistanceNm: weatherAxis?.totalDistanceNm ?? null,
    altitudeConstraintStatus: aipConstraints?.status ?? 'unavailable',
  }
}
