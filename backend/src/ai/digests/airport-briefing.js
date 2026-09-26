// Model-facing airport briefing. The code, not the model, applies TAF change
// groups, judges hazards with the airport-panel thresholds, finds when each
// condition starts and ends, and states how fresh the observation is. The model
// only puts these conclusions into sentences.
import { categoryFor, airportMinima } from '../../briefing/flight-category.js'

const HOUR = 3_600_000
const KST = 9 * HOUR
const WX = { BR: '박무', FG: '안개', HZ: '연무', FU: '연기', DU: '먼지', SA: '모래', RA: '비', DZ: '이슬비', SN: '눈',
  SG: '쌀알눈', IC: '빙정', PL: '얼음싸라기', GR: '우박', GS: '싸락눈', UP: '미확인 강수', SQ: '스콜', FC: '깔때기구름',
  VA: '화산재', PO: '먼지회오리', SS: '모래폭풍', DS: '먼지폭풍' }
const DESCRIPTOR = { SH: '소나기성', FZ: '어는', MI: '얕은', BC: '산재한', PR: '부분적', DR: '낮게 날린', BL: '높게 날린' }
const WEATHER_CODE = /^([-+]|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*)$/

export const AIRPORT_BRIEFING_NOTE = '코드가 TAF 변화군 적용, 위험 판단(공항 패널 기준), 시각 변환을 끝낸 결과다. 값을 다시 계산하지 말고 그대로 쓴다. '
  + '질문 시간의 위험(hazards)은 시간 순서로 빠짐없이, 얼마나 나쁜지와 언제까지인지 말한다. '
  + 'allHazardsEnd는 일시적 변화까지 포함해 위험이 모두 끝나는 시각이고, nextCategoryChange는 주된 예보의 비행 등급이 바뀌는 시점이다. '
  + '위험이 없으면 조용하다고 말하고 바람 정도만 덧붙인다.'

export function weatherKo(code) {
  const match = String(code ?? '').match(WEATHER_CODE)
  if (!match || !code) return String(code ?? '')
  const intensity = match[1] === '-' ? '약한 ' : match[1] === '+' ? '강한 ' : match[1] === 'VC' ? '부근 ' : ''
  const phenomena = (match[3].match(/.{2}/g) ?? []).map((part) => WX[part] ?? part)
  if (match[2] === 'TS') return `${intensity}뇌우${phenomena.length ? `(${phenomena.join('·')} 동반)` : ''}`
  return `${intensity}${match[2] ? `${DESCRIPTOR[match[2]]} ` : ''}${phenomena.join('·')}`.trim()
}

// Display-timezone labels: KST "27일 7시(22Z)", UTC "26일 22Z".
function parts(ms, timezone) {
  const d = new Date(ms + (timezone === 'UTC' ? 0 : KST))
  return { month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() }
}
const zulu = (ms) => `${String(new Date(ms).getUTCHours()).padStart(2, '0')}Z`
function at(ms, timezone) {
  const p = parts(ms, timezone)
  return timezone === 'UTC' ? `${p.day}일 ${zulu(ms)}` : `${p.day}일 ${p.hour}시(${zulu(ms)})`
}
function range(start, end, timezone) {
  const s = parts(start, timezone), e = parts(end, timezone)
  const endDay = e.day === s.day ? '' : `${e.day}일 `
  return timezone === 'UTC' ? `${s.day}일 ${zulu(start)}~${endDay}${zulu(end)}`
    : `${s.day}일 ${s.hour}시~${endDay}${e.hour}시(${zulu(start)}–${zulu(end)})`
}

function ceilingOf(clouds) {
  const layers = (clouds ?? []).filter((c) => ['BKN', 'OVC', 'VV'].includes(c.amount) && Number.isFinite(c.baseFt))
  return layers.length ? Math.min(...layers.map((c) => c.baseFt)) : null
}

function describe(state, icao) {
  const visibility = state.cavok ? 9999 : state.visibilityM
  const ceiling = state.cavok ? null : ceilingOf(state.clouds)
  const known = Number.isFinite(visibility) || ceiling != null
  const category = known ? categoryFor({ visibilityM: visibility === 9999 ? 10_000 : visibility, ceilingFt: ceiling, icao }) : 'UNKNOWN'
  const minima = airportMinima(icao)
  const hazards = []
  if (category === 'LIFR') hazards.push('공항 최저치 미만')
  else if (category === 'IFR') {
    const nearVisibility = Number.isFinite(minima?.visibilityM) && visibility <= minima.visibilityM * 2
    const nearCeiling = Number.isFinite(minima?.ceilingFt) && ceiling != null && ceiling <= minima.ceilingFt * 2
    hazards.push(nearVisibility || nearCeiling ? 'IFR, 공항 최저치 근접' : 'IFR')
  }
  const wind = state.wind
  if (wind && ((wind.speed ?? 0) >= 25 || (wind.gust ?? 0) >= 35)) hazards.push('강풍')
  else if (wind?.gust && wind.gust - (wind.speed ?? 0) >= 10) hazards.push('돌풍 편차 큼')
  for (const code of state.weather ?? []) if (/TS|FZ|FG|SN|GR|SQ|FC|\+/.test(code)) hazards.push(weatherKo(code))
  if ((state.clouds ?? []).some((c) => c.type === 'CB')) hazards.push('적란운')
  const unit = wind?.unit === 'MPS' ? 'm/s' : wind?.unit === 'KMH' ? 'km/h' : 'kt'
  return {
    category,
    visibility: state.cavok ? '10km 이상(CAVOK)' : visibility == null ? '확인 안 됨' : visibility >= 9999 ? '10km 이상' : `${visibility}m`,
    // Only ceilings that matter to an approach; high layers are noise for the answer.
    ...(ceiling != null && ceiling < 3000 ? { ceiling: `${ceiling}ft` } : {}),
    weather: (state.weather ?? []).length ? state.weather.map(weatherKo).join(', ') : '뚜렷한 현상 없음',
    wind: wind ? (wind.calm ? '무풍' : `${wind.variable ? '가변' : `${wind.direction}°`} ${wind.speed}${unit}${wind.gust ? ` 돌풍 ${wind.gust}${unit}` : ''}`) : null,
    hazards,
  }
}

function applyState(previous, change) {
  const next = { ...previous }
  if (change.wind) next.wind = change.wind
  if (change.cavok) return { ...next, cavok: true, visibilityM: 9999, clouds: [], weather: [] }
  if (change.visibilityM != null) Object.assign(next, { visibilityM: change.visibilityM, cavok: false })
  if (change.cloudsTouched || change.nsc) Object.assign(next, { clouds: change.nsc ? [] : change.clouds ?? [], cavok: false })
  if (change.weatherTouched || change.nsw) next.weather = change.nsw ? [] : change.weather ?? []
  return next
}

// Change-group windows come from the report text (DDhh/DDhh): some parsers end a
// group at the next group or at the TAF end instead of the BECMG transition end.
function withReportWindows(taf) {
  const lines = String(taf.raw ?? '').replace(/\s+(FM\d{6}|PROB\d{2}\s+TEMPO|PROB\d{2}|BECMG|TEMPO)\b/g, '\n$1').split('\n').slice(1)
  const changes = taf.changes ?? []
  if (!lines.length || lines.length !== changes.length) return taf
  const validStart = Date.parse(taf.validity.start)
  const ddhh = (dd, hh) => {
    const ref = new Date(validStart)
    let t = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), Number(dd), Number(hh))
    if (t < validStart - 20 * 24 * HOUR) t = Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, Number(dd), Number(hh))
    return t
  }
  return { ...taf, changes: changes.map((change, index) => {
    const m = lines[index].match(/\b(\d{2})(\d{2})\/(\d{2})(\d{2})\b/)
    if (!m || change.semantics === 'from') return change
    return { ...change, start: new Date(ddhh(m[1], m[2])).toISOString(), end: new Date(ddhh(m[3], m[4])).toISOString() }
  }) }
}

// Hourly prevailing state from base + BECMG/FM; TEMPO/PROB stay separate so a
// temporary condition is never presented as the prevailing one.
function prevailingPeriods(taf, icao) {
  const validStart = Date.parse(taf.validity.start), validEnd = Date.parse(taf.validity.end)
  const permanent = (taf.changes ?? []).filter((c) => ['transition', 'from'].includes(c.semantics))
  const periods = []
  let state = { ...taf.base, weather: taf.base?.weather ?? [] }
  for (let hour = validStart; hour < validEnd; hour += HOUR) {
    let changedBy = null
    for (const change of permanent) {
      const effective = change.semantics === 'from' ? Date.parse(change.start) : Date.parse(change.end)
      if (effective === hour || (hour === validStart && effective < validStart)) { state = applyState(state, change.state); changedBy = change }
    }
    const described = describe(state, icao)
    const key = JSON.stringify(described)
    const last = periods.at(-1)
    if (last && last.key === key) last.end = hour + HOUR
    else periods.push({ key, start: hour, end: hour + HOUR, change: changedBy, state: { ...state }, ...described })
  }
  return periods
}

function periodView(period, periods, timezone) {
  const how = period.change?.semantics === 'transition'
    ? `${range(Date.parse(period.change.start), Date.parse(period.change.end), timezone)} 사이에 바뀌어` : `${at(period.start, timezone)}부터`
  let until = period.end
  for (const next of periods.filter((p) => p.start >= period.end)) { if (next.category !== period.category) break; until = next.end }
  const { category, visibility, ceiling, weather, wind, hazards } = period
  return { when: how, category, categoryUntil: at(until, timezone), visibility, ...(ceiling ? { ceiling } : {}), weather, wind, hazards }
}

function temporaryView(change, periods, icao, timezone) {
  const start = Date.parse(change.start)
  const base = periods.find((p) => p.start <= start && p.end > start)?.state ?? {}
  const merged = describe(applyState(base, change.state), icao)
  const s = change.state
  return {
    when: `${range(start, Date.parse(change.end), timezone)} 사이 ${change.type === 'TEMPO' ? '일시적' : `확률 ${change.probability ?? ''}%`}`,
    category: merged.category,
    ...(s.visibilityM != null || s.cavok ? { visibility: merged.visibility } : {}),
    ...((s.cloudsTouched || s.nsc) && merged.ceiling ? { ceiling: merged.ceiling } : {}),
    ...(s.weatherTouched || s.nsw ? { weather: merged.weather } : {}),
    ...(s.wind ? { wind: merged.wind } : {}),
    hazards: merged.hazards,
  }
}

function forecastView(taf, icao, windowStart, windowEnd, timezone) {
  const report = withReportWindows(taf)
  const validEnd = Date.parse(report.validity.end)
  const periods = prevailingPeriods(report, icao)
  const transitionStart = (p) => (p.change?.semantics === 'transition' ? Date.parse(p.change.start) : p.start)
  // A period counts if it prevails in the question time or its transition is under way then.
  const inWindow = periods.filter((p) => transitionStart(p) < windowEnd && p.end > windowStart)
  if (!inWindow.length) return { issued: at(Date.parse(report.issuedAt), timezone), inQuestionTime: '질문 시간이 TAF 유효기간 밖' }
  const temporary = (report.changes ?? []).filter((c) => ['temporary', 'probabilistic'].includes(c.semantics))
  const lastCategory = inWindow.at(-1).category
  const nextChange = periods.filter((p) => p.start >= inWindow.at(-1).end).find((p) => p.category !== lastCategory)
  // When every hazard, temporary ones included, is over. Answers "언제 좋아져?" from the report.
  const hazardEnds = [
    ...periods.filter((p) => p.hazards.length && p.end > windowStart).map((p) => p.end),
    ...temporary.filter((c) => Date.parse(c.end) > windowStart && describe(applyState(periods.find((p) => p.start <= Date.parse(c.start) && p.end > Date.parse(c.start))?.state ?? {}, c.state), icao).hazards.length)
      .map((c) => Date.parse(c.end)),
  ]
  const lastHazard = hazardEnds.length ? Math.max(...hazardEnds) : null
  return {
    issued: at(Date.parse(report.issuedAt), timezone),
    inQuestionTime: inWindow.map((p) => periodView(p, periods, timezone)),
    temporary: temporary.filter((c) => Date.parse(c.start) < windowEnd && Date.parse(c.end) > windowStart)
      .map((c) => temporaryView(c, periods, icao, timezone)),
    nextCategoryChange: nextChange ? periodView(nextChange, periods, timezone) : '예보 끝까지 같은 비행 등급',
    ...(lastHazard == null ? {} : { allHazardsEnd: lastHazard >= validEnd ? `예보 끝(${at(validEnd, timezone)})까지 이어짐` : at(lastHazard, timezone) }),
  }
}

function observationView(metar, icao, nowMs, timezone) {
  const observed = Date.parse(metar.observationTime)
  const ageMinutes = Math.round((nowMs - observed) / 60_000)
  const p = parts(observed, timezone)
  const described = describe({ wind: metar.wind, visibilityM: metar.visibility?.value, cavok: metar.visibility?.cavok,
    clouds: metar.clouds, weather: metar.weather ?? [] }, icao)
  const { category, visibility, ceiling, weather, wind, hazards } = described
  return { time: at(observed, timezone),
    freshness: ageMinutes <= 90 ? `현재 관측(${ageMinutes}분 전)` : `${p.month}월 ${p.day}일 관측이라 현재 상태로 볼 수 없음`,
    category, visibility, ...(ceiling ? { ceiling } : {}), weather, wind, hazards }
}

export function airportBriefing(airport, window, { nowMs, timezone = 'Asia/Seoul' }) {
  const windowStart = Date.parse(window.start), windowEnd = Date.parse(window.end)
  const briefing = { airport: [airport.icao, airport.nameKo].filter(Boolean).join(' '), questionTime: range(windowStart, windowEnd, timezone) }
  briefing.observation = airport.metar?.observationTime ? observationView(airport.metar, airport.icao, nowMs, timezone) : '관측 자료 없음'
  briefing.forecast = airport.taf?.validity && airport.taf.base
    ? forecastView(airport.taf, airport.icao, windowStart, windowEnd, timezone) : '예보 자료 없음'
  // A failed or partly unassessed warning lookup is a real gap; "unknown" with
  // nothing unassessed is the standing collector caveat and stays in the card.
  const warnings = airport.warnings
  if (warnings?.items?.length) {
    briefing.airportWarnings = warnings.items.map(({ name, type, validStart, validEnd, relation }) => ({ name: name ?? type, validStart, validEnd, relation }))
  } else if (['failed', 'unavailable'].includes(warnings?.status)) briefing.airportWarnings = '공항경보 조회 실패, 확인 안 됨'
  else if (warnings?.unassessedCount) briefing.airportWarnings = `공항경보 ${warnings.unassessedCount}건의 유효시간 확인 안 됨`
  return briefing
}
