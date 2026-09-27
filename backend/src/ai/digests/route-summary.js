// Model-facing route weather. The code walks the climb, enroute and descent legs,
// merges consecutive hazardous legs into named stretches with exposure by
// severity, ranks them, adds profile-following model intervals, advisories and
// the cruise wind, and states coverage limits. The model only phrases it.

const SEVERITY = { 1: 'LIGHT', 2: 'MODERATE', 3: 'SEVERE' }
const MODEL_LEVEL = { 약: 1, 중: 2, 심: 3 }
const PHASE = { SID: '출발 SID', STAR: '도착 STAR', IAP: '접근' }
const nm = (value) => Math.round(value)

function exposureByGrade(legs, key) {
  const totals = {}
  for (const leg of legs) {
    for (const { level, distanceNm } of leg[key]?.exposures ?? []) {
      if (Number(level) > 0 && distanceNm > 0) totals[level] = (totals[level] ?? 0) + distanceNm
    }
  }
  return Object.entries(totals).map(([grade, distance]) => ({ grade: Number(grade), nm: nm(distance) }))
    .filter((item) => item.nm > 0).sort((a, b) => b.grade - a.grade)
}
const gradeText = (items) => items.map(({ grade, nm: distance }) => `${SEVERITY[grade] ?? grade} ${distance}NM`).join(', ')

// Every leg in flight order with the stretch it belongs to.
function orderedLegs(enroute) {
  const procedures = (enroute?.procedures ?? []).map((p) => ({ type: p.type, name: `${PHASE[p.type] ?? p.type} ${String(p.id ?? '').split('-').pop()}`.trim(), legs: p.legs ?? [] }))
  return [...procedures.filter((p) => p.type === 'SID'), { type: 'ENROUTE', name: '순항', legs: enroute?.legs ?? [] },
    ...procedures.filter((p) => p.type !== 'SID')]
    .flatMap(({ name, legs }) => legs.map((leg) => ({ stretch: name, leg })))
}

// Advisories are listed once from the route-level list, not per stretch.
const hasHazard = (leg) => (leg.icing?.peakLevel ?? 0) > 0 || (leg.turbulence?.peakLevel ?? 0) > 0

function segments(enroute) {
  const groups = []
  for (const { stretch, leg } of orderedLegs(enroute)) {
    const last = groups.at(-1)
    if (!hasHazard(leg)) { if (last) last.closed = true; continue }
    if (last && !last.closed && last.stretch === stretch) last.legs.push(leg)
    else groups.push({ stretch, legs: [leg] })
  }
  return groups.map(({ stretch, legs }) => {
    const icing = exposureByGrade(legs, 'icing'), turbulence = exposureByGrade(legs, 'turbulence')
    const worst = Math.max(0, ...icing.map((i) => i.grade), ...turbulence.map((t) => t.grade))
    const parts = [icing.length && `착빙 ${gradeText(icing)}`, turbulence.length && `난류 ${gradeText(turbulence)}`].filter(Boolean)
    const level = worst >= 3 ? '경고' : worst >= 2 ? '주의' : '참고'
    // Leg-by-leg breakdown so "자세히" is answered here, not from partial detail pages.
    const legDetails = legs.map((leg) => {
      const legIcing = exposureByGrade([leg], 'icing'), legTurbulence = exposureByGrade([leg], 'turbulence')
      const legParts = [legIcing.length && `착빙 ${gradeText(legIcing)}`, legTurbulence.length && `난류 ${gradeText(legTurbulence)}`].filter(Boolean)
      return `${leg.from}→${leg.to}(${nm(leg.startNm)}~${nm(leg.endNm)}NM): ${legParts.join(' / ') || '없음'}`
    })
    return { level, text: `${stretch} ${legs[0].from}→${legs.at(-1).to}(${nm(legs[0].startNm)}~${nm(legs.at(-1).endNm)}NM): ${parts.join(' / ')}`, legDetails,
      highlight: { from: legs[0].from, to: legs.at(-1).to, startNm: legs[0].startNm, endNm: legs.at(-1).endNm } }
  })
}

// Profile-following model intervals (moderate or worse). Leg tables have no
// turbulence on legs above the KTG top, so these carry it for climb and descent.
function profileIntervals(enroute) {
  const legs = orderedLegs(enroute)
  const where = (distance) => legs.find(({ leg }) => leg.startNm <= distance && leg.endNm >= distance)
  return (enroute?.model?.elements ?? []).flatMap((element) => (element.intervals ?? []).map((interval) => {
    const grade = MODEL_LEVEL[interval.level] ?? 2
    const at = where(interval.startNm)
    return { kind: element.kind, level: grade >= 3 ? '경고' : '주의', highlight: { startNm: interval.startNm, endNm: interval.endNm },
      // KTG covers only 10,000 ft and below, so a turbulence interval is on the climb or descent there.
      text: `${element.label} ${SEVERITY[grade]} ${nm(interval.startNm)}~${nm(interval.endNm)}NM${at ? `(${at.stretch} ${at.leg.from} 부근부터${element.kind === 'turbulence' ? ', 10,000ft 이하 상승·강하 중' : ''})` : ''}` }
  }))
}

// Distance-weighted along-track component over the cruise legs.
function cruiseWind(enroute) {
  const legs = (enroute?.legs ?? []).filter((leg) => Number.isFinite(leg.wind?.meanComponentKt) && leg.distanceNm > 0)
  if (!legs.length) return null
  const total = legs.reduce((sum, leg) => sum + leg.distanceNm, 0)
  const average = Math.round(legs.reduce((sum, leg) => sum + leg.wind.meanComponentKt * leg.distanceNm, 0) / total)
  return average < 0 ? `평균 정풍 ${-average}kt` : average > 0 ? `평균 배풍 ${average}kt` : '정풍·배풍 성분 거의 없음'
}

export function routeWeatherSummary(briefing) {
  const enroute = briefing?.sections?.enroute
  if (!enroute) return { available: false }
  const stretches = segments(enroute)
  // Leg turbulence is missing above the KTG top; add model intervals the legs do not already show.
  const legTurbulence = stretches.some((s) => s.text.includes('난류'))
  const intervals = profileIntervals(enroute).filter((i) => i.kind !== 'turbulence' || !legTurbulence)
    .filter((i) => i.kind !== 'icing')
  const advisories = (briefing.sections?.adverse?.hazards ?? []).filter((h) => !h.airportScope)
    .map((h) => ({ level: h.encounter === 'on' ? '경고' : '주의', text: `${h.source ?? '경보'} ${h.label ?? h.code ?? ''}${h.encounter === 'on' ? '' : '(인근)'}`.trim() }))
  const runs = enroute.model?.runs ?? {}
  const coverage = []
  if (!enroute.model) coverage.push('경로 수치모델 자료 없음')
  if (enroute.model && !runs.ktg) coverage.push('난류(KTG) 자료 없음')
  else if (enroute.model) coverage.push('10,000ft 위(순항 포함) 구간은 난류 자료 없음, 10,000ft 이하 상승·강하 구간만 난류 확인')
  return {
    available: Boolean(enroute.model),
    items: [...stretches, ...intervals, ...advisories],
    cruiseWind: cruiseWind(enroute),
    notamConflicts: briefing.routeConflicts?.length ?? 0,
    coverage,
    modelRuns: runs,
  }
}
