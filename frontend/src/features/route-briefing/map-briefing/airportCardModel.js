// 지도형 브리핑 공항 카드(6단계, spec §2.3): 접힌 3줄 = 머리(역할·ICAO·공항명·비행등급·깃발) + METAR 한 줄 + TAF ±1시간 한 줄.
// 판정은 서버가 한 것(sections.current.airports, adverse.hazards의 공항경보, routeNotams)을 모아 글로 만들기만 한다.
// "상세"는 기존 공항 패널을 연다 — 앱 공항 목록(국내 + 해외 METAR 수집 공항)에 있는 공항만.

import { classifyCeilingCategory, classifyVisibilityCategory, hasHighWindCondition } from '../../../shared/weather/helpers.js'

const ROLE_KO = { departure: '출발', arrival: '도착', alternate: '교체' }
// 공항경보 배지 이름. 경보마다 배지 하나(2026-10-24): '공항경보 n' 묶음 대신 무슨 경보인지 바로 보이게.
const WARNING_KO = {
  WIND_SHEAR: '윈드시어', LOW_VISIBILITY: '저시정', STRONG_WIND: '강풍', HEAVY_RAIN: '호우', LOW_CEILING: '저운고',
  THUNDERSTORM: '뇌우', TYPHOON: '태풍', HEAVY_SNOW: '대설', YELLOW_DUST: '황사',
}
const CATEGORY_LEVEL = { VFR: 'vfr', MVFR: 'mvfr', IFR: 'ifr', LIFR: 'lifr' }

export function metarText(metar) {
  const obs = metar?.observation
  if (!obs) return null
  const d = obs.display ?? {}
  // METAR 표기대로: 10km 이상은 9999.
  const visibility = obs.visibility?.cavok ? 'CAVOK' : Number.isFinite(obs.visibility?.value) ? String(Math.min(9999, obs.visibility.value)).padStart(4, '0') : null
  const clouds = obs.visibility?.cavok ? null : d.clouds
  return [d.wind, visibility, d.weather && d.weather !== '-' ? d.weather : null, clouds, d.temperature].filter(Boolean).join(' ') || null
}

// 출발·도착이 같은 공항이면 한 장(역할 '출발/도착').
function roleLabel(airport) {
  const roles = airport.roles?.length ? airport.roles : [airport.role]
  return roles.map((role) => ROLE_KO[role] ?? role).join('/')
}

export function airportCards(briefing, { airportList = [], nameFor = (icao) => icao } = {}) {
  const airports = briefing?.sections?.current?.airports ?? []
  const hazards = briefing?.sections?.adverse?.hazards ?? []
  const known = new Map(airportList.map((airport) => [airport.icao, airport]))
  const seen = new Set()
  const cards = []
  for (const airport of airports) {
    if (!airport?.icao || seen.has(airport.icao)) continue
    seen.add(airport.icao)
    const listed = known.get(airport.icao)
    const warnings = hazards.filter((hazard) => hazard.airportScope === airport.icao)
    const window = airport.tafWindow
    cards.push({
      icao: airport.icao,
      role: airport.role,
      roleLabel: roleLabel(airport),
      name: nameFor(airport.icao),
      category: airport.category && airport.category !== 'UNKNOWN' ? airport.category : null,
      categoryLevel: CATEGORY_LEVEL[airport.category] ?? 'unknown',
      position: Number.isFinite(listed?.lat) && Number.isFinite(listed?.lon) ? [listed.lon, listed.lat] : null,
      canOpenPanel: Boolean(listed),
      metar: { text: metarText(airport.metar), time: airport.observationTime ?? null, speci: airport.reportType === 'SPECI', report: airport.metar ?? null },
      taf: window
        ? { basis: window.basis, time: window.time ?? null, issued: window.issued ?? null, text: window.outOfRange ? 'TAF 유효기간 밖' : (window.at?.text ?? null), changes: window.changes ?? [], outOfRange: Boolean(window.outOfRange), previous: Boolean(window.previous) }
        : { basis: airport.role === 'departure' ? 'ETD' : 'ETA', time: null, issued: null, text: null, changes: [], outOfRange: false, previous: false },
      // 같은 경보가 둘 이상 겹쳐 와도 배지는 하나. 윈드시어가 먼저, 나머지는 받은 순서.
      warnings: warningBadges(warnings),
    })
  }
  return cards
}

// "앞뒤 변화 n건"의 툴팁: "TEMPO 13–19 30010KT 6000 …" 한 줄씩.
export function changeLines(changes, formatHour = (iso) => iso) {
  return (changes ?? []).map((change) => `${change.type} ${formatHour(change.start)}${change.end ? `–${formatHour(change.end)}` : ''} ${change.text ?? ''}`.trim())
}

// 접은 카드 기억: 공항이 아니라 역할(출발·도착·교체)로 — 다음 브리핑에서도 "도착 카드는 접어 둠"이 이어지게.
// 기본은 모두 접은 칩(2026-10-23 사용자 결정). 저장소가 막혀 있어도 접은 상태로 동작한다.
const COLLAPSED_KEY = 'projectamo.airportCardsCollapsed'
const ROLES = ['departure', 'arrival', 'alternate']
export function readCollapsedRoles(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(COLLAPSED_KEY)
    if (raw == null) return [...ROLES]
    const saved = JSON.parse(raw)
    return Array.isArray(saved) ? saved.filter((role) => ROLES.includes(role)) : [...ROLES]
  } catch { return [...ROLES] }
}
export function writeCollapsedRoles(roles, storage = globalThis.localStorage) {
  try { storage?.setItem(COLLAPSED_KEY, JSON.stringify(roles.filter((role) => ROLES.includes(role)))) } catch { /* 기억만 못 할 뿐 */ }
}

// 접은 칩 폭(자리 계산용): 색 띠·여백 + ICAO + 비행등급 칩 + 경보 점 + 펼치기 표시.
export function chipWidth(card) {
  return 30 + card.icao.length * 10 + (card.category ? card.category.length * 8 + 14 : 0) + (hasAlertFlag(card) ? 12 : 0) + 18
}
export function hasAlertFlag(card) {
  return card.warnings.length > 0
}

export function warningBadges(hazards = []) {
  const byCode = new Map()
  for (const hazard of hazards) {
    const code = hazard.code ?? hazard.label
    if (!code || byCode.has(code)) continue
    byCode.set(code, {
      code,
      label: `${WARNING_KO[code] ?? hazard.label ?? code} 경보`,
      red: code === 'WIND_SHEAR' || hazard.level === 'red',
      validFrom: hazard.validFrom ?? null,
      validTo: hazard.validTo ?? null,
    })
  }
  return [...byCode.values()].sort((a, b) => Number(b.code === 'WIND_SHEAR') - Number(a.code === 'WIND_SHEAR'))
}

// ── 과거 보기(7단계): 보관 보고를 카드 한 줄로 ──

// 과거 TAF의 기준 시각(ETD/ETA) 예보 한 줄: 시간별 타임라인에서 30분 안의 가장 가까운 항목. 유효기간 밖이면 그렇게 적는다.
export function tafTextAt(report, iso) {
  const at = Date.parse(iso)
  const start = Date.parse(report?.header?.valid_start), end = Date.parse(report?.header?.valid_end)
  if (Number.isFinite(start) && Number.isFinite(end) && (at < start || at > end)) return '그 발표의 유효기간 밖'
  let best = null
  for (const entry of report?.timeline ?? []) {
    const delta = Math.abs(Date.parse(entry.time) - at)
    if (Number.isFinite(delta) && (!best || delta < best.delta)) best = { delta, entry }
  }
  if (!best || best.delta > 30 * 60 * 1000) return null
  const { entry } = best
  if (entry.display) {
    const d = entry.display
    return [d.wind, d.visibility, d.weather && d.weather !== '-' ? d.weather : null, d.clouds].filter(Boolean).join(' ') || null
  }
  const cavok = entry.visibility?.cavok
  const vis = cavok ? 'CAVOK' : Number.isFinite(entry.visibility?.value) ? String(entry.visibility.value).padStart(4, '0') : null
  return [entry.wind?.raw, vis, (entry.weather ?? []).map((w) => w.raw ?? w).join(' ') || null, cavok ? null : (entry.clouds ?? []).map((c) => c.raw).join(' ') || null]
    .filter(Boolean).join(' ') || null
}

// ── 카드 한 줄 색칠: 공항 패널 METAR·TAF 원문과 같은 기준 ──
// 패널은 서버가 붙인 토큰 역할(tac-annotation)로 칠한다. 카드 줄은 조립된 글이라 같은 규칙을 글자에서 다시 읽는다:
// 강풍(평균 25kt·돌풍 35kt 이상), 시정·운고(공항 기준 등급 IFR 이하), CB, 뇌전·결빙·안개·눈(특수), 강수.
const WIND_RE = /^(?:\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/
const VIS_RE = /^\d{4}$/
const CEILING_RE = /^(?:BKN|OVC|VV)(\d{3})$/
const CB_RE = /^(?:FEW|SCT|BKN|OVC)\d{3}(?:CB|TCU)$/
const WX_RE = /^(?:\+|-|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:RA|DZ|SN|SG|IC|PL|GR|GS|UP|FG|BR|HZ|FU|VA|DU|SA|PY|PO|SQ|FC|SS|DS)+)$/

function levelClass(category) {
  return category && category !== 'VFR' ? `is-${category.toLowerCase()}` : null
}

export function cardTokenClass(token, icao) {
  const wind = token.match(WIND_RE)
  if (wind) return hasHighWindCondition({ speed: Number(wind[1]), gust: wind[2] ? Number(wind[2]) : null }) ? 'is-wind' : null
  if (VIS_RE.test(token)) return levelClass(classifyVisibilityCategory(Number(token), icao)?.category)
  if (CB_RE.test(token)) return 'is-special'
  const ceiling = token.match(CEILING_RE)
  if (ceiling) return levelClass(classifyCeilingCategory(Number(ceiling[1]) * 100, icao)?.category)
  const wx = token.match(WX_RE)
  if (wx) {
    const [, descriptor, phenomena] = wx
    const codes = phenomena.match(/../g)
    if (descriptor === 'TS' || descriptor === 'FZ' || codes.includes('FG') || codes.includes('SN')) return 'is-special'
    if (descriptor === 'SH' || codes.some((code) => ['RA', 'DZ', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP'].includes(code))) return 'is-precip'
  }
  return null
}

/** 카드 한 줄을 색칠할 조각으로. 빈칸은 그대로 남긴다. */
export function cardLineSegments(text, icao) {
  if (!text) return []
  return String(text).split(/(\s+)/).filter(Boolean).map((part) => ({ text: part, className: /^\s+$/.test(part) ? null : cardTokenClass(part, icao) }))
}
