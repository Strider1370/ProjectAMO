// Pre-flight route brief in fixed order (출발 → 항로 → 도착). The code ranks each
// item; the model speaks the 경고/주의 items and the wind, the card shows all of it,
// and hazardous stretches carry the NM range the map and profile highlight.
import { airportBriefing } from './airport-briefing.js'

const HOUR = 3_600_000
export const ROUTE_BRIEF_NOTE = '코드가 비행 전 브리핑 항목을 정리하고 중요도를 매긴 결과다. 값을 다시 계산하지 말고 그대로 쓴다. '
  + 'speak 항목(바람 포함)을 출발 → 항로 → 도착 순서로 하나도 빼지 않고, 위치(구간 이름·NM)와 함께 말하고, 그 구간에 speak 항목이 없으면 quiet 문구로 짧게 말한다. '
  + '구간을 자세히 물으면 각 항목의 legDetails로 답한다(이미 전 구간이 들어 있다). cardOnly(LIGHT 착빙·난류 등)는 사용자가 그 항목을 물을 때만 말한다. '
  + 'gaps는 답이 달라질 때만 말한다. 착빙·난류라는 용어를 쓰고, 가부를 판단하지 않는다.'
const WARN = /최저치|뇌우|적란운|강한|안개|눈|어는|우박|스콜/
// Flight times keep minutes: "27일 16:32(07:32Z)" or "27일 07:32Z".
function flightTime(ms, timezone) {
  if (!Number.isFinite(ms)) return '확인 안 됨'
  const pad = (n) => String(n).padStart(2, '0')
  const utc = new Date(ms), local = new Date(ms + (timezone === 'UTC' ? 0 : 9 * HOUR))
  const zulu = `${pad(utc.getUTCHours())}:${pad(utc.getUTCMinutes())}Z`
  return timezone === 'UTC' ? `${utc.getUTCDate()}일 ${zulu}` : `${local.getUTCDate()}일 ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}(${zulu})`
}

function airportBrief(briefing, section) {
  const items = [], gaps = []
  const forecast = briefing.forecast
  if (typeof forecast === 'string' || typeof forecast?.inQuestionTime === 'string') gaps.push(`${section} 공항: ${typeof forecast === 'string' ? forecast : forecast.inQuestionTime}`)
  const add = (prefix, p) => {
    if (!p.hazards?.length) return
    const text = `${prefix}${p.category ?? ''}${p.visibility ? `, 시정 ${p.visibility}` : ''}${p.ceiling ? `, 운고 ${p.ceiling}` : ''}${p.weather ? `, ${p.weather}` : ''}${p.wind ? `, 바람 ${p.wind}` : ''} (${p.hazards.join('·')})`
    items.push({ section, level: p.hazards.some((h) => WARN.test(h)) ? '경고' : '주의', text })
  }
  if (typeof forecast === 'object') {
    for (const p of Array.isArray(forecast.inQuestionTime) ? forecast.inQuestionTime : []) add(`${p.when} `, p)
    for (const p of forecast.temporary ?? []) add(`${p.when} `, p)
  }
  const observation = briefing.observation
  if (typeof observation === 'object' && !/현재 관측/.test(observation.freshness ?? '')) gaps.push(`${section} 공항 관측: ${observation.freshness}`)
  const prevailing = Array.isArray(forecast?.inQuestionTime) ? forecast.inQuestionTime.at(-1) : null
  const quiet = prevailing ? `${prevailing.category}, 시정 ${prevailing.visibility}${prevailing.wind ? `, 바람 ${prevailing.wind}` : ''}, 특이사항 없음` : '예보 확인 안 됨'
  return { items, gaps, quiet }
}

export function buildRouteBrief({ flight = {}, airports = [], routeSummary, nowMs, timezone = 'Asia/Seoul' }) {
  const etd = Date.parse(flight.etd), eta = Date.parse(flight.eta)
  const window = (center) => ({ start: new Date(center - HOUR).toISOString(), end: new Date(center + HOUR).toISOString() })
  const find = (icao) => airports.find((airport) => airport.icao === icao)
  const depAirport = find(flight.departureAirport), arrAirport = find(flight.arrivalAirport)
  const departure = depAirport && Number.isFinite(etd) ? airportBriefing(depAirport, window(etd), { nowMs, timezone }) : null
  const arrival = arrAirport && Number.isFinite(eta) ? airportBriefing(arrAirport, window(eta), { nowMs, timezone }) : null
  const dep = departure ? airportBrief(departure, '출발') : { items: [], gaps: ['출발 공항 자료 없음'], quiet: '확인 안 됨' }
  const arr = arrival ? airportBrief(arrival, '도착') : { items: [], gaps: ['도착 공항 자료 없음'], quiet: '확인 안 됨' }
  const route = routeSummary ?? {}
  const enrouteItems = (route.items ?? []).map((item) => ({ section: '항로', ...item }))
  const all = [...dep.items, ...enrouteItems, ...arr.items]
  const altitude = Number(flight.plannedCruiseAltitudeFt)
  const altitudeText = altitude >= 14000 ? `FL${Math.round(altitude / 100)}` : `${altitude}ft`
  const gaps = [...dep.gaps, ...(route.available === false ? ['항로 수치모델 자료 없음, 항로 착빙·난류 확인 안 됨'] : route.coverage ?? []), ...arr.gaps]
  return {
    flight: `${flight.departureAirport}→${flight.arrivalAirport} ${flight.flightRule ?? ''} ${altitudeText}, 출발 ${flightTime(etd, timezone)}, 도착 ${flightTime(eta, timezone)}${Number.isFinite(flight.distanceNm) ? `, ${Math.round(flight.distanceNm)}NM` : ''}`,
    speak: [...all.filter((item) => item.level !== '참고' && item.section !== '도착'),
      { section: '항로', level: '바람', text: route.cruiseWind ? `순항 ${altitudeText} ${route.cruiseWind}` : '순항 바람 확인 안 됨' },
      ...all.filter((item) => item.level !== '참고' && item.section === '도착')],
    quiet: { 출발: dep.items.length ? null : dep.quiet, 항로: enrouteItems.some((i) => i.level !== '참고') ? null : '주의할 착빙·난류·경보 없음', 도착: arr.items.length ? null : arr.quiet },
    cardOnly: all.filter((item) => item.level === '참고'),
    ...(route.notamConflicts ? { notamConflicts: route.notamConflicts } : {}),
    gaps,
    modelRuns: route.modelRuns ?? null,
    departure,
    arrival,
  }
}
