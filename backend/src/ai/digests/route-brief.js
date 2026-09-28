// Pre-flight route brief in fixed order (출발 → 항로 → 도착). The code ranks each
// item, groups the route by flight phase (상승 → 순항 → 강하), writes the one or two
// summary sentences and the whole body. The first answer to a route briefing is
// this code-made text; the model answers follow-up questions from the same brief.
// Hazardous stretches carry the NM range the map and profile highlight.
import { airportBriefing } from './airport-briefing.js'
import knownAirports from '../../../../shared/airports.js'

const HOUR = 3_600_000
export const ROUTE_BRIEF_NOTE = '코드가 비행 전 브리핑 항목을 정리하고 중요도를 매긴 결과다. 값을 다시 계산하지 말고 그대로 쓴다. '
  + '첫 브리핑은 앱이 summary와 본문으로 이미 보여 줬다. 이어지는 질문에는 물은 항목만 phaseLabel(상승·순항·강하)과 위치(where·position)로 짧게 답한다. '
  + '구간을 자세히 물으면 각 항목의 legDetails로 답한다(이미 전 구간이 들어 있다). cardOnly(LIGHT 착빙·난류 등)는 사용자가 그 항목을 물을 때 말한다. '
  + 'position의 "출발 5NM"은 출발점에서 잰 위치이지 길이가 아니다. 길이는 amount에만 있다. '
  + 'gaps는 답이 달라질 때만 말한다. 착빙·난류라는 용어를 쓰고, 가부를 판단하지 않는다.'
const WARN = /최저치|뇌우|적란운|강한|안개|눈|어는|우박|스콜/
const pad = (n) => String(n).padStart(2, '0')
const zulu = (ms) => `${pad(new Date(ms).getUTCHours())}:${pad(new Date(ms).getUTCMinutes())}Z`
function local(ms, timezone) {
  const d = new Date(ms + (timezone === 'UTC' ? 0 : 9 * HOUR))
  return { day: d.getUTCDate(), time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` }
}
// Flight times keep minutes: "27일 16:32(07:32Z)" or "27일 07:32Z".
function flightTime(ms, timezone) {
  if (!Number.isFinite(ms)) return '확인 안 됨'
  const l = local(ms, timezone)
  return timezone === 'UTC' ? `${new Date(ms).getUTCDate()}일 ${zulu(ms)}` : `${l.day}일 ${l.time}(${zulu(ms)})`
}
// Header line: "28일 12:33 → 13:06 KST (03:33Z → 04:06Z)".
function timesText(etd, eta, timezone) {
  if (!Number.isFinite(etd) || !Number.isFinite(eta)) return `${flightTime(etd, timezone)} → ${flightTime(eta, timezone)}`
  if (timezone === 'UTC') return `${new Date(etd).getUTCDate()}일 ${zulu(etd)} → ${zulu(eta)}`
  const a = local(etd, timezone), b = local(eta, timezone)
  return `${a.day}일 ${a.time} → ${b.day === a.day ? '' : `${b.day}일 `}${b.time} KST (${zulu(etd)} → ${zulu(eta)})`
}
const altitudeText = (ft) => ft >= 14000 ? `FL${Math.round(ft / 100)}` : `${Math.round(ft).toLocaleString('en-US')}ft`
// "김포국제공항" → "김포"; an airport without weather still has its name.
const shortName = (airport, icao) => String(airport?.nameKo ?? knownAirports.find((a) => a.icao === icao)?.nameKo ?? '').replace(/(국제)?공항$/, '') || icao
// 은/는 by the last syllable's final consonant (non-Hangul endings take 는).
const topic = (word) => { const c = String(word).at(-1).charCodeAt(0) - 0xac00; return `${word}${c >= 0 && c < 11172 && c % 28 ? '은' : '는'}` }

function airportBrief(briefing, section) {
  const items = [], gaps = []
  const forecast = briefing.forecast
  if (typeof forecast === 'string' || typeof forecast?.inQuestionTime === 'string') gaps.push(`${section} 공항: ${typeof forecast === 'string' ? forecast : forecast.inQuestionTime}`)
  const add = (prefix, p) => {
    if (!p.hazards?.length) return
    const text = `${prefix}${p.category ?? ''}${p.visibility ? `, 시정 ${p.visibility}` : ''}${p.ceiling ? `, 운고 ${p.ceiling}` : ''}${p.weather ? `, ${p.weather}` : ''}${p.wind ? `, 바람 ${p.wind}` : ''} (${p.hazards.join('·')})`
    items.push({ section, level: p.hazards.some((h) => WARN.test(h)) ? '경고' : '주의', text, hazards: p.hazards })
  }
  if (typeof forecast === 'object') {
    for (const p of Array.isArray(forecast.inQuestionTime) ? forecast.inQuestionTime : []) add(`${p.when} `, p)
    for (const p of forecast.temporary ?? []) add(`${p.when} `, p)
  }
  const observation = briefing.observation
  if (typeof observation === 'object' && !/현재 관측/.test(observation.freshness ?? '')) gaps.push(`${section} 공항 관측: ${observation.freshness}`)
  const prevailing = Array.isArray(forecast?.inQuestionTime) ? forecast.inQuestionTime.at(-1) : null
  const quiet = prevailing ? `${prevailing.category}, 시정 ${prevailing.visibility}${prevailing.wind ? `, 바람 ${prevailing.wind}` : ''}, 특이사항 없음` : '예보 확인 안 됨'
  const status = prevailing ? `${prevailing.category} · 시정 ${prevailing.visibility}${prevailing.wind ? ` · 바람 ${prevailing.wind}` : ''}` : '예보 확인 안 됨'
  return { items, gaps, quiet, status, category: prevailing?.category ?? null }
}

// Route hazards grouped by flight phase in flight order; the cruise wind sits in the first 순항 group.
function phaseGroups(items, cruiseWind, cruiseLabel) {
  const groups = []
  for (const item of items.filter((i) => i.phaseLabel)) {
    const last = groups.at(-1)
    if (last?.label === item.phaseLabel) last.items.push(item)
    else groups.push({ phase: item.phase, label: item.phaseLabel, items: [item], wind: null })
  }
  if (cruiseWind) {
    let cruise = groups.find((g) => g.phase === '순항')
    if (!cruise) {
      cruise = { phase: '순항', label: cruiseLabel, items: [], wind: null }
      const after = groups.findLastIndex((g) => g.phase === '상승')
      groups.splice(after + 1, 0, cruise)
    }
    cruise.wind = cruiseWind
  }
  return groups
}

// "상승·강하 중 난류 MODERATE 2곳" — every phrase ends in 곳/건 so the sentence needs no particle choice.
function hazardPhrases(items) {
  const byKind = new Map()
  for (const item of items) {
    const key = `${item.label} ${item.severity}`
    const entry = byKind.get(key) ?? { phases: [], count: 0 }
    if (!entry.phases.includes(item.phase)) entry.phases.push(item.phase)
    entry.count++
    byKind.set(key, entry)
  }
  return [...byKind].map(([key, { phases, count }]) => `${phases.join('·')} 중 ${key} ${count}곳`)
}

// "SIGMET 뇌우 구간(출발 120~160NM, 계획 고도 포함)" / "3호 태풍 힌남노 영향권(출발 200~260NM)":
// every phrase ends in 구간/영향권 so "을 지나요" always reads right.
const advisoryPhrase = (i) => i.source === 'TYPHOON'
  ? `${i.phenomenon} 영향권${i.position ? `(${i.position})` : ''}`
  : `${i.source} ${i.phenomenon} 구간(${[i.position, i.note].filter(Boolean).join(', ')})`

// Airport line: 공항경보 first, then the hazardous forecast, else the flight category.
function airportSentence(depName, arrName, dep, arr) {
  const parts = [[depName, '출발', dep], [arrName, '도착', arr]].map(([name, when, a]) => {
    const warnings = a.items.filter((i) => i.kind === 'warning').map((i) => i.warning)
    const forecast = [...new Set(a.items.filter((i) => i.kind !== 'warning').flatMap((i) => i.hazards ?? []))]
    const listed = [warnings.length && `공항경보(${warnings.join('·')})`, forecast.length && `주의할 예보(${forecast.join('·')})`].filter(Boolean)
    return listed.length ? `${name} ${when} 시간대에 ${listed.join('와 ')}가 있어요.` : null
  }).filter(Boolean)
  if (parts.length) return parts.join(' ')
  if (dep.category && dep.category === arr.category) return `${depName}·${arrName} 모두 ${dep.category}이에요.`
  if (dep.category && arr.category) return `${depName} ${dep.category}, ${arrName} ${arr.category}이에요.`
  if (!dep.category && !arr.category) return `${depName}·${arrName} 공항 예보는 확인되지 않았어요.`
  const [known, unknown] = dep.category ? [[depName, dep], arrName] : [[arrName, arr], depName]
  return `${known[0]} ${known[1].category}이고, ${unknown} 예보는 확인되지 않았어요.`
}

// Summary order: route-crossing warnings → airports → route icing/turbulence to watch →
// everything else in one list → data that could not be checked.
function summaryText({ depName, arrName, dep, arr, route, cruise, modelTimeStatus }) {
  const sentences = []
  const items = route.items ?? []
  const advisories = items.filter((i) => i.kind === 'advisory')
  const crossing = advisories.filter((i) => i.level === '경고')
  if (crossing.length) sentences.push(`항로가 ${crossing.map(advisoryPhrase).join(', ')}을 지나요.`)
  sentences.push(airportSentence(depName, arrName, dep, arr))
  const modelOk = route.available !== false
  const hazards = items.filter((i) => i.kind === 'icing' || i.kind === 'turbulence')
  const watch = [...hazardPhrases(hazards.filter((i) => i.level !== '참고')),
    ...advisories.filter((i) => i.level === '주의' && i.encounter === 'on').map((i) => `${i.source} ${i.phenomenon} 1건`)]
  const light = hazards.filter((i) => i.level === '참고')
  const others = [
    ...advisories.filter((i) => i.source !== 'TYPHOON' && i.level !== '경고' && !(i.level === '주의' && i.encounter === 'on'))
      .map((i) => `다른 고도 ${i.source} ${i.phenomenon} 1건`),
    ...(route.notamConflicts ? [`NOTAM 경로 저촉 ${route.notamConflicts}건`] : []),
    ...[...new Set(light.map((i) => i.label))].map((label) => {
      const rows = light.filter((i) => i.label === label)
      const total = rows.reduce((sum, i) => sum + (i.lengthNm ?? 0), 0)
      return `LIGHT ${label} ${rows.length}곳${total >= 1 ? `(총 ${Math.round(total)}NM)` : ''}`
    }),
  ]
  if (!modelOk) sentences.push(`항로 착빙·난류는 확인하지 못했어요.${others.length ? ` ${others.join(', ')}도 있어요.` : ''}`)
  else if (watch.length) sentences.push(`항로에서는 ${watch.join(', ')}에 주의가 필요해요.${others.length ? ` 그 밖에 ${others.join(', ')}도 있어요.` : ''}`)
  else if (crossing.length) { if (others.length) sentences.push(`그 밖에 ${others.join(', ')}도 있어요.`) }
  else sentences.push(`항로에 주의할 착빙·난류·경보는 없어요.${others.length ? ` ${others.join(', ')}만 있어요.` : ''}`)
  for (const typhoon of advisories.filter((i) => i.source === 'TYPHOON' && i.encounter !== 'on')) sentences.push(`${topic(typhoon.phenomenon)} 경로 밖에 있어요.`)
  if (modelOk) {
    const coverage = route.coverage ?? []
    if (coverage.some((c) => c.includes('KTG'))) sentences.push('난류 자료가 없어 항로 난류는 확인하지 못했어요.')
    else if (cruise > 10000 && coverage.some((c) => c.includes('위(순항 포함)'))) sentences.push(`${altitudeText(cruise)} 순항 구간 난류 자료는 없어요.`)
    if (modelTimeStatus === 'outside_available_frames') sentences.push('비행 시각 일부가 수치예보 범위 밖이라 항로 착빙·난류는 일부만 확인했어요.')
  }
  return sentences.join(' ')
}

export function buildRouteBrief({ flight = {}, airports = [], routeSummary, nowMs, timezone = 'Asia/Seoul', details = null, modelTimeStatus = null }) {
  const etd = Date.parse(flight.etd), eta = Date.parse(flight.eta)
  const window = (center) => ({ start: new Date(center - HOUR).toISOString(), end: new Date(center + HOUR).toISOString() })
  const find = (icao) => airports.find((airport) => airport.icao === icao)
  const depAirport = find(flight.departureAirport), arrAirport = find(flight.arrivalAirport)
  const departure = depAirport && Number.isFinite(etd) ? airportBriefing(depAirport, window(etd), { nowMs, timezone }) : null
  const arrival = arrAirport && Number.isFinite(eta) ? airportBriefing(arrAirport, window(eta), { nowMs, timezone }) : null
  const dep = departure ? airportBrief(departure, '출발') : { items: [], gaps: ['출발 공항 자료 없음'], quiet: '확인 안 됨', status: '자료 없음', category: null }
  const arr = arrival ? airportBrief(arrival, '도착') : { items: [], gaps: ['도착 공항 자료 없음'], quiet: '확인 안 됨', status: '자료 없음', category: null }
  const route = routeSummary ?? {}
  // 공항경보 join their airport line.
  for (const [a, icao, section] of [[dep, flight.departureAirport, '출발'], [arr, flight.arrivalAirport, '도착']]) {
    const warnings = (route.airportWarnings ?? []).filter((w) => w.icao === icao)
    a.items.unshift(...warnings.map((w) => ({ section, kind: 'warning', level: w.level, warning: w.label, text: `공항경보 ${w.label}` })))
  }
  const enrouteItems = (route.items ?? []).map((item) => ({ section: '항로', ...item }))
  const notamRow = route.notamConflicts ? [{ section: '항로', kind: 'notam', label: 'NOTAM', level: '주의', text: `경로 저촉 ${route.notamConflicts}건` }] : []
  const all = [...dep.items, ...enrouteItems, ...arr.items]
  const altitude = Number(flight.plannedCruiseAltitudeFt)
  const cruiseText = Number.isFinite(altitude) && altitude > 0 ? altitudeText(altitude) : '고도 확인 안 됨'
  const gaps = [...dep.gaps, ...(route.available === false ? ['항로 수치모델 자료 없음, 항로 착빙·난류 확인 안 됨'] : route.coverage ?? []), ...arr.gaps]
  const depName = shortName(depAirport, flight.departureAirport), arrName = shortName(arrAirport, flight.arrivalAirport)
  const windText = route.cruiseWind ? `순항 ${cruiseText} ${route.cruiseWind}` : '순항 바람 확인 안 됨'
  return {
    flight: `${flight.departureAirport}→${flight.arrivalAirport} ${flight.flightRule ?? ''} ${cruiseText}, 출발 ${flightTime(etd, timezone)}, 도착 ${flightTime(eta, timezone)}${Number.isFinite(flight.distanceNm) ? `, ${Math.round(flight.distanceNm)}NM` : ''}`,
    header: {
      title: [`${flight.departureAirport} → ${flight.arrivalAirport}`, flight.flightRule, cruiseText, Number.isFinite(flight.tasKt) ? `TAS ${flight.tasKt}kt` : null].filter(Boolean).join(' · '),
      distance: Number.isFinite(flight.distanceNm) ? `${Math.round(flight.distanceNm)}NM` : null,
      times: timesText(etd, eta, timezone),
      etaNote: flight.etaBasis === 'user-specified' ? '도착 시각 직접 입력' : flight.etaBasis ? '바람 미반영' : null,
    },
    summary: summaryText({ depName, arrName, dep, arr, route, cruise: altitude, modelTimeStatus }),
    body: {
      departure: { title: `출발 · ${depName} ${flight.departureAirport}`, status: dep.status, items: dep.items.map(({ hazards: _h, warning: _w, ...i }) => i) },
      enroute: {
        advisories: [...enrouteItems.filter((i) => i.kind === 'advisory'), ...notamRow],
        phases: phaseGroups(enrouteItems, route.cruiseWind, `순항 ${cruiseText}`),
        quiet: route.available === false ? '항로 착빙·난류 확인 안 됨' : enrouteItems.length || notamRow.length ? null : '착빙·난류·경보 없음',
      },
      arrival: { title: `도착 · ${arrName} ${flight.arrivalAirport}`, status: arr.status, items: arr.items.map(({ hazards: _h, warning: _w, ...i }) => i) },
    },
    details,
    speak: [...all.filter((item) => item.level !== '참고' && item.section !== '도착').map(({ hazards: _h, ...i }) => i),
      { section: '항로', level: '바람', text: windText },
      ...all.filter((item) => item.level !== '참고' && item.section === '도착').map(({ hazards: _h, ...i }) => i)],
    quiet: { 출발: dep.items.length ? null : dep.quiet, 항로: enrouteItems.some((i) => i.level !== '참고') ? null : '주의할 착빙·난류·경보 없음', 도착: arr.items.length ? null : arr.quiet },
    cardOnly: all.filter((item) => item.level === '참고'),
    ...(route.notamConflicts ? { notamConflicts: route.notamConflicts } : {}),
    gaps,
    modelRuns: route.modelRuns ?? null,
    departure,
    arrival,
  }
}
