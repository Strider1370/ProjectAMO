import { computeEtaIso } from './etaCalc.js'
import { augmentRouteWithProcedures } from './routePreview.js'

const round = (value) => Math.round(value)

function routeDistance(design) {
  return Number(design?.routeResult?.totalDistanceNm ?? design?.routeResult?.distanceNm)
}

export function windLabel(componentKt) {
  if (!Number.isFinite(componentKt)) return null
  return `${componentKt >= 0 ? '순풍' : '맞바람'} ${Math.round(Math.abs(componentKt))}kt`
}

// 국내(KMA) SIGMET/AIRMET는 고정 코드-라벨 조합, 해외(NOAA) SIGMET는 "한정어 + 현상" 조합으로
// label을 만든다(noaa-sigmet-parser.js QUALIFIER_LABELS/HAZARD_LABELS). 현상 이름은 한글로
// 옮기되, EMBD/OBSC/FRQ/SQL/ISOL/OCNL 같은 SIGMET 한정어는 번역하지 않고 원문 약어를 그대로 둔다
// — 항공기상청 실제 SIGMET 화면(global.amo.go.kr)도 "EMBD TS"처럼 이 약어들을 번역 없이 쓰고,
// 이 약어들에 대응하는 공인 한글 용어를 찾지 못했다(2026-07-21 확인). SEV/MOD("심한"/"보통")는
// 항공 전문용어가 아닌 일반 한국어라 번역한다.
const PHENOMENON_LABEL_KO = {
  'Cumulonimbus': '적란운',
  'Mountain Obscuration': '산악 시정 저하',
  'Low Level Wind Shear': '저고도 윈드시어',
  'Surface Visibility': '지상 시정',
}
const TRANSLATED_QUALIFIER_KO = { Severe: '심한', Moderate: '보통' }
const UNTRANSLATED_QUALIFIERS = ['Embedded', 'Isolated', 'Occasional', 'Frequent', 'Obscured', 'Squall Line']
const QUALIFIER_ABBREVIATION = {
  Embedded: 'EMBD', Isolated: 'ISOL', Occasional: 'OCNL', Frequent: 'FRQ', Obscured: 'OBSC', 'Squall Line': 'SQL',
}
const HAZARD_KO = {
  Icing: '착빙', Turbulence: '난류', Thunderstorm: '뇌우', 'Tropical Cyclone': '열대저기압',
  'Volcanic Ash': '화산재', 'Mountain Wave': '산악파', Hail: '우박', Duststorm: '황사',
  Sandstorm: '모래폭풍', IFR: 'IFR 기상조건',
}

export function phenomenonLabelKo(label) {
  if (!label) return label
  if (PHENOMENON_LABEL_KO[label]) return PHENOMENON_LABEL_KO[label]
  for (const [qualifier, qualifierKo] of Object.entries(TRANSLATED_QUALIFIER_KO)) {
    if (label.startsWith(`${qualifier} `)) {
      const hazardKo = HAZARD_KO[label.slice(qualifier.length + 1)]
      if (hazardKo) return `${qualifierKo} ${hazardKo}`
    }
  }
  for (const qualifier of UNTRANSLATED_QUALIFIERS) {
    if (label.startsWith(`${qualifier} `)) {
      const hazardKo = HAZARD_KO[label.slice(qualifier.length + 1)]
      if (hazardKo) return `${QUALIFIER_ABBREVIATION[qualifier]} ${hazardKo}`
    }
  }
  return HAZARD_KO[label] ?? label
}

export function exposureNm(hazard) {
  return (hazard?.horizontalExposure?.intervals ?? []).reduce((total, interval) => {
    const start = Number(interval?.startNm)
    const end = Number(interval?.endNm)
    return Number.isFinite(start) && Number.isFinite(end) ? total + Math.max(0, end - start) : total
  }, 0)
}

// Sums exposureNm() per hazard independently, so two hazards overlapping the same
// stretch of route double-count that stretch. This merges intervals across all
// hazards first so shared stretches count once.
export function mergeExposureNm(hazards) {
  const intervals = (hazards ?? [])
    .flatMap((hazard) => hazard?.horizontalExposure?.intervals ?? [])
    .map((interval) => [Number(interval?.startNm), Number(interval?.endNm)])
    .filter(([start, end]) => Number.isFinite(start) && Number.isFinite(end) && end > start)
    .sort((a, b) => a[0] - b[0])
  let total = 0
  let cursor = -Infinity
  for (const [start, end] of intervals) {
    const mergedStart = Math.max(start, cursor)
    if (end > mergedStart) total += end - mergedStart
    cursor = Math.max(cursor, end)
  }
  return total
}

function exposureRows(exposure) {
  if (!exposure || exposure.trigger === 'unavailable') return null
  return (exposure.hazards ?? []).reduce((rows, hazard) => {
    const key = `${hazard.source ?? 'unknown'}:${hazard.phenomenon ?? 'unknown'}`
    const prev = rows.get(key) ?? { nm: 0, label: phenomenonLabelKo(hazard.label ?? hazard.phenomenon) ?? key, source: hazard.source }
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
