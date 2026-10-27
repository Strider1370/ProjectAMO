import { getFlightCategory } from '../../shared/weather/helpers.js'
import { phenomenonKo } from '../../shared/weather/phenomenonKo.js'
import { warningNameKo } from '../../../../shared/warning-types.js'

// 알림 패널·팝업·감시 대상 카드가 같이 쓰는 표시 규칙. 한눈에 읽히도록 "무엇이 일어났나"를 제목으로,
// 경로·시각·설명은 둘째 줄로 내린다. 빨간색은 기준을 넘은 값에만 쓴다(화면 쪽).

const BELOW = 'below'

// 기준 묶음. 값은 버튼 이름에 그대로 보여 주므로 고르는 사람이 무엇을 넣는지 안다.
export const METAR_PRESETS = [
  { id: 'vfr', label: 'VFR', visibility: 5000, ceiling: 1500 },
  { id: 'cat1', label: 'CAT I', visibility: 800, ceiling: 200 },
]

export function presetMatches(rules, preset) {
  return rules?.visibility?.enabled && rules?.ceiling?.enabled
    && Number(rules.visibility.threshold) === preset.visibility && Number(rules.ceiling.threshold) === preset.ceiling
}

// METAR 기준 알림 제목. 미만 기준(시정·운고)만 걸리면 "미달", 이상 기준(바람·기온)만이면 "초과",
// 섞이면 "도달". 급변풍·어는 비 같은 발생 보고는 "보고".
export function metarHeadline(metrics = []) {
  const thresholds = metrics.filter((m) => m.direction !== 'event')
  const events = metrics.filter((m) => m.direction === 'event')
  if (!thresholds.length && events.length) return `${events.map((m) => m.label).join('·')} 보고`
  const names = thresholds.map((m) => m.label).join('·')
  const below = thresholds.every((m) => m.direction === BELOW)
  const above = thresholds.every((m) => m.direction !== BELOW)
  const word = below ? '미달' : above ? '초과' : '도달'
  return `${names} 기준 ${word}${events.length ? ` · ${events.map((m) => m.label).join('·')}` : ''}`
}

export const metricValueText = (m) => (m.direction === 'event' ? '관측' : `${m.value}${m.unit}`)
export const metricThresholdText = (m) => (m.direction === 'event' ? '' : `기준 ${m.threshold}${m.unit} ${m.direction === BELOW ? '미만' : '이상'}`)

// SIGMET 현상: 한글 이름과 전문 약어를 함께("심한 착빙" + "SEV ICE").
export function sigmetName(code, fallback = 'SIGMET') {
  const abbr = code ? String(code).replace(/_/g, ' ') : null
  return { name: phenomenonKo(code) || fallback, abbr }
}

const flText = (ft) => `FL${String(Math.round(ft / 100)).padStart(3, '0')}`
export function sigmetBandText(band) {
  if (!band || !Number.isFinite(band.lowFt) || !Number.isFinite(band.highFt)) return '고도 미상'
  return `${band.lowFt <= 0 ? 'SFC' : flText(band.lowFt)}–${flText(band.highFt)}`
}

// 알림 한 건 → 카드·팝업 공통 표시값.
export function alertView(n) {
  const p = n?.payload ?? {}
  if (n?.source === 'route' || n?.type === 'sigmet') {
    const { name, abbr } = sigmetName(p.phenomenonCode, p.phenomenon)
    return { kind: 'sigmet', badge: '경로 SIGMET', title: name, abbr, code: p.phenomenonCode ?? null, target: p.routeName ?? n?.routeName ?? '경로',
      band: sigmetBandText(p.altitudeBandFt), mine: p.altitudeStatus === 'matched',
      segment: Number.isFinite(p.intersectFromNm) && Number.isFinite(p.intersectToNm) ? `${Math.round(p.intersectFromNm)}–${Math.round(p.intersectToNm)}NM` : null,
      validFrom: p.validFrom ?? null, validTo: p.validTo ?? null }
  }
  if (n?.type === 'metar') return { kind: 'metar', badge: 'METAR 기준 초과', title: metarHeadline(p.metrics), target: n.routeName ?? n.airportIcao, metrics: p.metrics ?? [], observedAt: p.observedAt ?? null }
  if (n?.type === 'taf') return { kind: 'taf', badge: p.reportType === 'AMD' ? 'TAF AMD' : 'TAF', title: p.reportType === 'AMD' ? 'TAF AMD 발표' : 'TAF 발표', target: n.routeName ?? n.airportIcao,
    text: p.text ?? '', issuedAt: p.issuedAt ?? null, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null }
  if (n?.type === 'airport_warning') return { kind: 'warning', badge: '공항경보', title: warningNameKo(p.warning) ?? p.title ?? '공항경보', target: n.routeName ?? n.airportIcao, validTo: p.validTo ?? null }
  if (n?.type === 'lightning') return { kind: 'lightning', badge: '낙뢰', title: `반경 ${p.radiusKm}km 낙뢰 ${p.count}건`, target: n.routeName ?? n.airportIcao, windowMinutes: p.windowMinutes }
  return { kind: 'other', badge: '알림', title: p.title ?? p.description ?? '알림', target: n?.routeName ?? '' }
}

// 운고 = BKN·OVC·VV 중 가장 낮은 층.
function ceilingFtOf(observation) {
  const layers = (observation?.clouds ?? []).filter((c) => ['BKN', 'OVC', 'VV'].includes(String(c.amount ?? c.cover ?? '').toUpperCase()))
  const bases = layers.map((c) => Number(c.base_ft ?? c.base ?? c.height_ft)).filter(Number.isFinite)
  return bases.length ? Math.min(...bases) : null
}

// 감시 카드·편집 화면의 "지금" 값. METAR 원문 대신 범주와 핵심 수치.
export function metarNow(metar, icao) {
  const o = metar?.observation
  if (!o) return null
  const visibilityM = o.visibility?.cavok ? 9999 : Number.isFinite(o.visibility?.value) ? o.visibility.value : null
  const ceilingFt = metar.cavok_flag || metar.nsc_flag ? null : ceilingFtOf(o)
  const category = visibilityM == null ? null : getFlightCategory(visibilityM, ceilingFt, icao)?.category ?? null
  return {
    category, visibilityM, ceilingFt,
    windKt: Number.isFinite(o.wind?.speed) ? o.wind.speed : null,
    gustKt: Number.isFinite(o.wind?.gust) ? o.wind.gust : null,
    tempC: Number.isFinite(o.temperature?.air) ? o.temperature.air : null,
    observedAt: metar.header?.observation_time ?? null,
  }
}

export const visibilityText = (m) => (m == null ? '—' : m >= 9999 ? '10km+' : `${m}m`)
export const ceilingText = (ft) => (ft == null ? '운고 없음' : `${ft}ft`)

// 지금 값이 기준에 걸리는지(편집 화면의 ✓ 표시용).
export function ruleState(key, rule, now) {
  if (!rule?.enabled || !now) return null
  const t = Number(rule.threshold)
  if (key === 'visibility') return now.visibilityM == null ? null : now.visibilityM < t ? 'hit' : 'ok'
  if (key === 'ceiling') return now.ceilingFt == null ? 'ok' : now.ceilingFt < t ? 'hit' : 'ok'
  if (key === 'wind') return now.windKt == null ? null : now.windKt >= t ? 'hit' : 'ok'
  if (key === 'gust') return now.gustKt == null ? 'ok' : now.gustKt >= t ? 'hit' : 'ok'
  if (key === 'temperature') return now.tempC == null ? null : (rule.direction === 'below' ? now.tempC <= t : now.tempC >= t) ? 'hit' : 'ok'
  return null
}

// 감시 카드의 조건 칩. icon은 화면이 아이콘으로 바꾼다.
export function ruleChips(rules) {
  if (!rules) return []
  const chips = []
  if (rules.visibility?.enabled) chips.push({ key: 'visibility', icon: 'vis', text: `<${rules.visibility.threshold}m` })
  if (rules.ceiling?.enabled) chips.push({ key: 'ceiling', icon: 'ceiling', text: `<${rules.ceiling.threshold}ft` })
  if (rules.wind?.enabled || rules.gust?.enabled) chips.push({ key: 'wind', icon: 'wind',
    text: [rules.wind?.enabled && `${rules.wind.threshold}`, rules.gust?.enabled && `G${rules.gust.threshold}`].filter(Boolean).join(' · ') + 'kt' })
  if (rules.temperature?.enabled) chips.push({ key: 'temperature', icon: 'temp', text: `${rules.temperature.direction === 'below' ? '≤' : '≥'}${rules.temperature.threshold}℃` })
  if (rules.windshear?.enabled) chips.push({ key: 'windshear', icon: 'wind', text: '급변풍' })
  if (rules.fzra?.enabled) chips.push({ key: 'fzra', icon: 'ice', text: 'FZRA' })
  if (rules.tafNew?.enabled || rules.tafAmd?.enabled) chips.push({ key: 'taf', icon: 'taf', text: [rules.tafNew?.enabled && 'TAF', rules.tafAmd?.enabled && 'AMD'].filter(Boolean).join('·') })
  if (rules.airportWarning?.enabled) chips.push({ key: 'warning', icon: 'warning', text: '공항경보' })
  if (rules.lightning?.enabled) chips.push({ key: 'lightning', icon: 'lightning', text: `낙뢰 ${rules.lightning.radiusKm}km` })
  return chips
}

// 진행 중인 알림을 대상별로 묶는다 — 감시 카드의 "기준 해당 중" 표시.
export function activeByTarget(notifications = []) {
  const airports = new Map()
  const routes = new Map()
  for (const n of notifications) {
    if (!n.active) continue
    if (n.source === 'airport' && n.airportIcao) airports.set(n.airportIcao, [...(airports.get(n.airportIcao) ?? []), n])
    if (n.source === 'route' && n.routeId != null) routes.set(n.routeId, [...(routes.get(n.routeId) ?? []), n])
  }
  return { airports, routes }
}
