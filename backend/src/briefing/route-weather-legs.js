import {
  exposureSummary,
  sampleWeights,
  weightedTemperature,
  weightedWind,
} from './altitude-weather-comparison.js'
import { ktgIntensity } from '../processors/ktg-model.js'

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
  const notams = (routeNotams ?? []).flatMap((notam) => overlapNm(range, notam.routeIntervalNm) > OVERLAP_EPSILON_NM
    ? [{ id: notam.id, summary: notam.summary, effect: notam.comparisonStatus ?? (notam.conflict ? 'warn' : 'undetermined') }]
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
    wind: wind && { meanComponentKt: wind.averageKt, minComponentKt: wind.minKt, maxComponentKt: wind.maxKt },
    temp: weightedTemperature(crossSection?.levels ?? [], weatherAxis, selectedCruiseAltitudeFt, weights, false),
    icing: { peakLevel: icingSummary.highestGrade, exposures: exposures(icingSummary) },
    turbulence: { peakLevel: turbulenceSummary.highestGrade, exposures: exposures(turbulenceSummary) },
    hazards: legHazards,
    notams,
    timeStatus: legHazards.find((hazard) => hazard.timeStatus !== 'matched')?.timeStatus ?? 'matched',
    altitudeConstraint: constraintFor(segment, constraint, sourceCycle),
  }
}

export function buildRouteWeatherLegs({ routeModel, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards = [], routeNotams = [], aipConstraints } = {}) {
  const segments = [...(routeModel?.enRouteSegments ?? [])].sort((a, b) => (a.startNm ?? Infinity) - (b.startNm ?? Infinity))
  const constraints = new Map((aipConstraints?.segments ?? []).map((entry) => [entry.id, entry]))
  const sourceCycle = aipConstraints?.provenance?.publicationId ?? null
  return {
    legs: segments.map((segment) => buildLeg({ segment, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, constraint: constraints.get(segment.id), sourceCycle })),
    totalDistanceNm: weatherAxis?.totalDistanceNm ?? null,
    altitudeConstraintStatus: aipConstraints?.status ?? 'unavailable',
  }
}
