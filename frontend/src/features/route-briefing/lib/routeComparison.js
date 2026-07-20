import { computeEtaIso } from './etaCalc.js'
import { augmentRouteWithProcedures } from './routePreview.js'

const round = (value) => Math.round(value)

function routeDistance(design) {
  return Number(design?.routeResult?.totalDistanceNm ?? design?.routeResult?.distanceNm)
}

export function exposureNm(hazard) {
  return (hazard?.horizontalExposure?.intervals ?? []).reduce((total, interval) => {
    const start = Number(interval?.startNm)
    const end = Number(interval?.endNm)
    return Number.isFinite(start) && Number.isFinite(end) ? total + Math.max(0, end - start) : total
  }, 0)
}

function exposureRows(exposure) {
  if (!exposure || exposure.trigger === 'unavailable') return null
  return (exposure.hazards ?? []).reduce((rows, hazard) => {
    const key = `${hazard.source ?? 'unknown'}:${hazard.phenomenon ?? 'unknown'}`
    const prev = rows.get(key) ?? { nm: 0, label: hazard.label ?? hazard.phenomenon ?? key, source: hazard.source }
    rows.set(key, { ...prev, nm: prev.nm + exposureNm(hazard) })
    return rows
  }, new Map())
}

function snapshotMatches(exposure, weatherSnapshot) {
  if (!weatherSnapshot?.version) return !exposure?.snapshot?.version
  return exposure?.snapshot?.version === weatherSnapshot.version
}

export function getFinalRouteGeometry(design, procedureLookup) {
  const preview = design?.routeResult?.previewGeojson
  if (!preview) return null
  const procedures = design.procedures ?? {}
  const resolve = (kind, value) => typeof procedureLookup === 'function'
    ? procedureLookup(kind, value, design)
    : procedureLookup?.[kind]?.[value?.id ?? value] ?? value
  const finalPreview = augmentRouteWithProcedures(
    preview,
    resolve('sid', procedures.sid),
    resolve('star', procedures.star),
    resolve('iap', procedures.iap ?? procedures.iapKey),
  )
  return finalPreview.features.find((feature) => feature.properties?.role === 'route-preview-line')?.geometry ?? null
}

export function buildRouteComparison(base, alternatives, { etd, tasKt, weatherSnapshot } = {}) {
  const baseDistanceNm = routeDistance(base)
  const baseEta = computeEtaIso(etd, baseDistanceNm, tasKt)
  const baseExposure = exposureRows(base?.routeExposure)
  const snapshot = weatherSnapshot ?? base?.routeExposure?.snapshot
  const baseComparable = baseExposure && snapshotMatches(base.routeExposure, snapshot)

  return (alternatives ?? []).map((design) => {
    const distanceNm = routeDistance(design)
    const eta = computeEtaIso(etd, distanceNm, tasKt)
    const exposure = exposureRows(design?.routeExposure)
    const comparable = baseComparable && exposure && snapshotMatches(design.routeExposure, snapshot)
    const keys = new Set([...(baseExposure?.keys() ?? []), ...(exposure?.keys() ?? [])])
    return {
      id: design.id,
      distanceNm: Number.isFinite(distanceNm) ? round(distanceNm) : null,
      distanceDeltaNm: Number.isFinite(distanceNm) && Number.isFinite(baseDistanceNm) ? round(distanceNm - baseDistanceNm) : null,
      eta,
      etaDeltaMinutes: eta && baseEta ? round((Date.parse(eta) - Date.parse(baseEta)) / 60_000) : null,
      exposures: [...keys].map((key) => ({
        key,
        label: baseExposure?.get(key)?.label ?? exposure?.get(key)?.label ?? key,
        baseNm: comparable ? round(baseExposure.get(key)?.nm ?? 0) : null,
        alternativeNm: comparable ? round(exposure.get(key)?.nm ?? 0) : null,
        deltaNm: comparable ? round((exposure.get(key)?.nm ?? 0) - (baseExposure.get(key)?.nm ?? 0)) : null,
        unavailable: !comparable,
      })),
      comparisonUnavailable: !comparable,
    }
  })
}
