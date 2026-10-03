// Model-facing route weather. The code walks the flight in order, places every
// leg in a flight phase read from the planned altitude profile (상승 → 순항 → 강하,
// not the procedure names, so VFR and procedure-less IFR read the same way),
// merges consecutive hazardous legs of one kind within a phase, ranks them, adds
// profile-following model intervals, advisories and the cruise wind, and states
// coverage limits. The model only phrases it.

const SEVERITY = { 1: 'LIGHT', 2: 'MODERATE', 3: 'SEVERE' }
const MODEL_LEVEL = { 약: 1, 중: 2, 심: 3 }
const KINDS = [['icing', '착빙'], ['turbulence', '난류']]
// KTG turbulence is collected only up to this height for now.
const KTG_TOP_FT = 10000
const nm = (value) => Math.round(value)
const lengthText = (distance) => distance < 0.5 ? '1NM 미만' : `${nm(distance)}NM`
const altitudeText = (ft) => ft >= 14000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft).toLocaleString('en-US')}ft`
const positionText = (startNm, endNm) => endNm - startNm < 1 ? `출발 ${nm(startNm)}NM` : `출발 ${nm(startNm)}~${nm(endNm)}NM`

// Procedure name as pilots say it: SID/STAR by name, approaches by runway.
export function procedureName(procedure) {
  const parts = String(procedure.id ?? '').split('-')
  if (procedure.type === 'IAP') return parts.find((part) => /^RWY/.test(part)) ? `${parts.find((part) => /^RWY/.test(part))} 접근` : '접근'
  return parts.at(-1) || null
}

// Every leg in flight order with the procedure it belongs to (null on the enroute part).
function orderedLegs(enroute) {
  const procedures = enroute?.procedures ?? []
  const withName = (p) => (p.legs ?? []).map((leg) => ({ leg, procedure: procedureName(p), procedureType: p.type }))
  return [...procedures.filter((p) => p.type === 'SID').flatMap(withName),
    ...(enroute?.legs ?? []).map((leg) => ({ leg, procedure: null, procedureType: 'ENROUTE' })),
    ...procedures.filter((p) => p.type !== 'SID').flatMap(withName)]
}

function altitudeAt(points, distanceNm) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (distanceNm <= b.distanceNm) {
      const span = b.distanceNm - a.distanceNm
      return span > 0 ? a.altitudeFt + (b.altitudeFt - a.altitudeFt) * (distanceNm - a.distanceNm) / span : b.altitudeFt
    }
  }
  return points.at(-1)?.altitudeFt ?? null
}

// Phase at a distance along the route. IFR: before reaching the cruise altitude
// is 상승, after TOD is 강하. VFR: the planned altitude rising/falling between
// waypoints is 상승/강하, level flight is 순항 at that altitude. Without a profile
// the procedure type is the only evidence.
export function flightPhases(enroute, { cruiseAltitudeFt, flightRule } = {}) {
  const profile = enroute?.profile
  const points = (profile?.points ?? []).filter((p) => Number.isFinite(p.distanceNm) && Number.isFinite(p.altitudeFt))
    .sort((a, b) => a.distanceNm - b.distanceNm)
  const cruise = Number(cruiseAltitudeFt)
  const vfr = profile?.vfr || flightRule === 'VFR'
  if (points.length >= 2 && vfr) {
    return (distanceNm) => {
      const i = Math.max(1, points.findIndex((p) => p.distanceNm >= distanceNm))
      const a = points[i - 1], b = points[i] ?? a
      const change = b.altitudeFt - a.altitudeFt
      if (change > 100) return { phase: '상승', label: '상승' }
      if (change < -100) return { phase: '강하', label: '강하' }
      return { phase: '순항', label: `순항 ${altitudeText(a.altitudeFt)}`, altitudeFt: a.altitudeFt }
    }
  }
  if (points.length >= 2 && cruise > 0) {
    const reached = points.find((p) => p.altitudeFt >= cruise - 50)
    const tocNm = reached ? reached.distanceNm : null
    const lastCruise = [...points].reverse().find((p) => p.altitudeFt >= cruise - 50)
    const todNm = Number.isFinite(profile.todNm) ? profile.todNm : lastCruise?.distanceNm ?? null
    return (distanceNm) => {
      if (tocNm != null && distanceNm < tocNm) return { phase: '상승', label: '상승' }
      if (todNm != null && distanceNm > todNm) return { phase: '강하', label: '강하' }
      if (tocNm == null) {
        const altitude = altitudeAt(points, distanceNm)
        return altitude != null && altitude < cruise - 50 ? { phase: '상승', label: '상승' } : { phase: '순항', label: `순항 ${altitudeText(cruise)}`, altitudeFt: cruise }
      }
      return { phase: '순항', label: `순항 ${altitudeText(cruise)}`, altitudeFt: cruise }
    }
  }
  return null
}

function phaseOf(phases, entry, distanceNm, cruise) {
  if (phases) return phases(distanceNm)
  if (entry?.procedureType === 'SID') return { phase: '상승', label: '상승' }
  if (['STAR', 'IAP'].includes(entry?.procedureType)) return { phase: '강하', label: '강하' }
  return { phase: '순항', label: cruise > 0 ? `순항 ${altitudeText(cruise)}` : '순항', altitudeFt: cruise > 0 ? cruise : null }
}

function exposures(legs, key) {
  const totals = {}
  for (const leg of legs) {
    for (const { level, distanceNm } of leg[key]?.exposures ?? []) {
      if (Number(level) > 0 && distanceNm > 0) totals[level] = (totals[level] ?? 0) + distanceNm
    }
  }
  return Object.entries(totals).map(([grade, distance]) => ({ grade: Number(grade), distance }))
    .sort((a, b) => b.grade - a.grade)
}
// One severity: just the length (the row already names it). Several: "MODERATE 19NM, LIGHT 14NM".
const exposureText = (items) => items.length === 1 ? lengthText(items[0].distance)
  : items.map(({ grade, distance }) => `${SEVERITY[grade] ?? grade} ${lengthText(distance)}`).join(', ')
const levelFor = (grade) => grade >= 3 ? '경고' : grade >= 2 ? '주의' : '참고'
const procedureOf = (entries) => {
  const names = [...new Set(entries.map((e) => e.procedure))]
  return names.length === 1 ? names[0] : null
}

function item({ kind, label, grade, phase, where, procedure, startNm, endNm, amount, lengthNm, note = null, legDetails = [], highlight }) {
  const position = positionText(startNm, endNm)
  const place = `${where}${procedure ? ` (${procedure})` : ''}`
  return {
    kind, label, severity: SEVERITY[grade] ?? null, level: levelFor(grade),
    phase: phase.phase, phaseLabel: phase.label,
    where, procedure, position, amount, lengthNm: Math.round(lengthNm * 10) / 10, note,
    text: `${phase.label} ${label} ${SEVERITY[grade]}${amount ? ` ${amount}` : ''} · ${place} · ${position}${note ? ` · ${note}` : ''}`,
    ...(legDetails.length ? { legDetails } : {}),
    highlight,
  }
}

// Consecutive legs with this kind of hazard in the same phase become one row.
function legStretches(enroute, phases, cruise) {
  const entries = orderedLegs(enroute)
  const rows = []
  for (const [key, label] of KINDS) {
    const groups = []
    for (const entry of entries) {
      const { leg } = entry
      const hazardous = (leg[key]?.exposures ?? []).some((e) => Number(e.level) > 0 && e.distanceNm > 0)
      const last = groups.at(-1)
      if (!hazardous) { if (last) last.closed = true; continue }
      const phase = phaseOf(phases, entry, (leg.startNm + leg.endNm) / 2, cruise)
      if (last && !last.closed && last.phase.label === phase.label) last.entries.push(entry)
      else groups.push({ phase, entries: [entry] })
    }
    for (const { phase, entries: group } of groups) {
      const legs = group.map((e) => e.leg)
      const amounts = exposures(legs, key)
      if (!amounts.length) continue
      const first = legs[0], last = legs.at(-1)
      rows.push(item({
        kind: key, label, grade: amounts[0].grade, phase,
        where: `${first.from}→${last.to}`, procedure: procedureOf(group),
        startNm: first.startNm, endNm: last.endNm, amount: exposureText(amounts), lengthNm: amounts.reduce((sum, a) => sum + a.distance, 0),
        legDetails: legs.length > 1 ? legs.map((leg) => `${leg.from}→${leg.to}(${positionText(leg.startNm, leg.endNm)}): ${exposureText(exposures([leg], key)) || '없음'}`) : [],
        highlight: { from: first.from, to: last.to, startNm: first.startNm, endNm: last.endNm },
      }))
    }
  }
  return rows
}

// Profile-following model intervals (moderate or worse). Leg tables have no
// turbulence above the KTG top, so these carry it for climb and descent.
function profileIntervals(enroute, phases, cruise) {
  const entries = orderedLegs(enroute)
  const at = (distance) => entries.find(({ leg }) => leg.startNm <= distance && leg.endNm >= distance)
  return (enroute?.model?.elements ?? []).flatMap((element) => (element.intervals ?? []).map((interval) => {
    const grade = MODEL_LEVEL[interval.level] ?? 2
    const entry = at(interval.startNm)
    const phase = phaseOf(phases, entry, (interval.startNm + interval.endNm) / 2, cruise)
    return item({
      kind: element.kind, label: element.label, grade, phase,
      where: entry ? `${entry.leg.from} 부근` : '경로 위', procedure: entry?.procedure ?? null,
      startNm: interval.startNm, endNm: interval.endNm, amount: null, lengthNm: interval.endNm - interval.startNm,
      // Only worth saying when the flight also goes above the KTG top.
      note: element.kind === 'turbulence' && enroute?.model?.runs?.ktg?.product !== 'GKTG' && cruise > KTG_TOP_FT ? `${KTG_TOP_FT.toLocaleString('en-US')}ft 이하` : null,
      highlight: { startNm: interval.startNm, endNm: interval.endNm },
    })
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

const PHASE_ORDER = { 상승: 0, 순항: 1, 강하: 2 }
// SIGMET/AIRMET phenomena arrive with English labels; say them the way the rest of the brief does.
const PHENOMENON_KO = {
  SEV_ICE: '착빙 SEVERE', MOD_ICE: '착빙 MODERATE', SEV_TURB: '난류 SEVERE', MOD_TURB: '난류 MODERATE',
  TS: '뇌우', SQL_TS: '스콜선 뇌우', OBSC_TS: '가려진 뇌우', EMBD_TS: '구름 속 뇌우', FRQ_TS: '빈번한 뇌우', ISOL_TS: '고립된 뇌우', OCNL_TS: '간헐적 뇌우',
  GR: '우박', MTW: '산악파', SEV_MTW: '산악파 SEVERE', MOD_MTW: '산악파 MODERATE', TC: '열대저기압', VA: '화산재',
  CB: '적란운', ISOL_CB: '고립된 적란운', OCNL_CB: '간헐적 적란운', FRQ_CB: '빈번한 적란운',
  MT_OBSC: '산악 차폐', IFR: 'IFR', LLWS: '저층 윈드시어', SFC_VIS: '지상 시정 저하', SFC_WIND: '지상 강풍',
  BKN_CLD: '낮은 구름', OVC_CLD: '낮은 구름', HVY_DS: '강한 먼지폭풍', HVY_SS: '강한 모래폭풍', RDOACT_CLD: '방사능 구름',
}
const phenomenonKo = (h) => PHENOMENON_KO[h.code] ?? (/TS$/.test(h.code ?? '') ? '뇌우' : null) ?? h.label ?? h.code ?? '경보'

// Route advisories: kind of source, phenomenon, whether the planned altitude is inside it, and where.
function advisoryItem(h) {
  const typhoon = h.source === 'TYPHOON'
  const onRoute = h.encounter === 'on'
  const interval = h.routeIntervalNm && Number.isFinite(h.routeIntervalNm.startNm) ? h.routeIntervalNm : null
  // SIGMET inside the altitude (or altitude unknown) and a typhoon over the route are warnings.
  const level = typhoon ? (onRoute ? '경고' : '주의')
    : h.source === 'SIGMET' ? (onRoute ? '경고' : '주의') : (onRoute ? '주의' : '참고')
  const note = typhoon ? (onRoute ? '영향권 통과' : '경로 밖, 공항 영향 확인')
    : onRoute ? (h.verticalKnown ? '계획 고도 포함' : '고도 미확인') : '다른 고도'
  return {
    kind: 'advisory', source: h.source, label: typhoon ? '태풍' : h.source, level, phase: null, phaseLabel: null,
    phenomenon: typhoon ? h.label : phenomenonKo(h), encounter: onRoute ? 'on' : 'nearby',
    where: typhoon ? h.label : phenomenonKo(h), procedure: null, amount: null, note,
    position: interval ? positionText(interval.startNm, interval.endNm) : null,
    text: `${typhoon ? h.label : `${h.source} ${phenomenonKo(h)}`}${interval ? ` · ${positionText(interval.startNm, interval.endNm)}` : ''} · ${note}`,
    highlight: interval ? { startNm: interval.startNm, endNm: interval.endNm } : null,
  }
}

export function routeWeatherSummary(briefing) {
  const enroute = briefing?.sections?.enroute
  if (!enroute) return { available: false }
  const cruise = Number(enroute.plannedCruiseAltitudeFt) || 0
  const phases = flightPhases(enroute, { cruiseAltitudeFt: cruise, flightRule: briefing?.meta?.flightRule })
  const stretches = legStretches(enroute, phases, cruise)
  // Leg turbulence is missing above the KTG top; add model intervals the legs do not already show.
  const legTurbulence = stretches.some((s) => s.kind === 'turbulence')
  const intervals = profileIntervals(enroute, phases, cruise).filter((i) => i.kind !== 'turbulence' || !legTurbulence)
    .filter((i) => i.kind !== 'icing')
  const hazards = [...stretches, ...intervals]
    .sort((a, b) => (PHASE_ORDER[a.phase] - PHASE_ORDER[b.phase]) || (a.highlight.startNm - b.highlight.startNm))
  const adverse = briefing.sections?.adverse?.hazards ?? []
  const advisories = adverse.filter((h) => !h.airportScope).map(advisoryItem)
    .sort((a, b) => ({ 경고: 0, 주의: 1, 참고: 2 }[a.level] - { 경고: 0, 주의: 1, 참고: 2 }[b.level]))
  // 공항경보 have no route geometry; they belong to the departure/arrival airport lines.
  const airportWarnings = adverse.filter((h) => h.airportScope)
    .map((h) => ({ icao: h.airportScope, role: h.role ?? null, label: h.label ?? h.code ?? '공항경보', level: h.level === 'red' ? '경고' : '주의' }))
  const runs = enroute.model?.runs ?? {}
  const coverage = []
  if (!enroute.model) coverage.push('경로 수치모델 자료 없음')
  if (enroute.model && !runs.ktg) coverage.push('난류(GKTG) 자료 없음')
  else if (enroute.model && runs.ktg?.product !== 'GKTG' && cruise > KTG_TOP_FT) coverage.push(`${altitudeText(KTG_TOP_FT)} 위(순항 포함)는 난류 자료 없음`)
  return {
    available: Boolean(enroute.model),
    items: [...advisories, ...hazards],
    cruiseWind: cruiseWind(enroute),
    airportWarnings,
    notamConflicts: briefing.routeConflicts?.length ?? 0,
    coverage,
    modelRuns: runs,
  }
}
