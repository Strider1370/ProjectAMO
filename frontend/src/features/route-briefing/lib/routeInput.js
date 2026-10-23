import { findProcedureByToken, procedureTokenForms, TOKEN_KINDS } from './routeTokens.js'

// 경로 알약 목록의 규칙. 알약 목록이 경로 입력의 원본이고, 위쪽 칸(출발·도착·SID·STAR)은
// 이 목록을 읽어 보여 준다. 목록을 고치는 규칙은 모두 여기 둔다 — 규칙이 처리 함수·확인창·
// 효과에 흩어져 있으면 고칠 때마다 한 갈래만 고쳐져 다른 갈래에서 같은 버그가 다시 난다.
// 제안서: docs/design/proposals/2026-10-23-route-input-rework.md

/** 절차를 알약 글자로. 가장 완전한 형태(활주로.절차.연결FIX)를 쓰고, 없으면 이름. */
export function procedureTokenText(procedure) {
  const forms = procedure ? procedureTokenForms([procedure]) : []
  return forms.find((form) => form.includes('.')) ?? forms[0] ?? null
}

/** 알약 목록을 처음부터 짠다: 출발 · SID · 항로… · STAR · 도착. 비어 있는 자리는 뺀다. */
export function buildRouteTokens({ departure = null, sid = null, enroute = [], star = null, arrival = null } = {}) {
  return [departure, procedureTokenText(sid), ...enroute, procedureTokenText(star), arrival].filter(Boolean)
}

/**
 * 목록의 양 끝 공항을 읽는다. 공항 알약이 하나뿐이면 그것이 출발인지 도착인지 목록만으로는
 * 모른다 — 지금 도착 칸 값과 같으면 도착으로 읽는다(도착부터 고른 경우). 그 밖에는 출발이다.
 */
export function readEndpoints(texts, isAirport, current = {}) {
  const first = isAirport(texts[0]) ? texts[0] : null
  const last = texts.length > 1 && isAirport(texts.at(-1)) ? texts.at(-1) : null
  if (first && !last && first === current.arrival && first !== current.departure) {
    return { departure: null, arrival: first }
  }
  return { departure: first, arrival: last }
}

/**
 * 출발 또는 도착 공항을 넣거나 바꾸거나(icao가 비면) 뺀다.
 * 공항이 바뀌면 그 공항에 딸린 절차 알약(출발 쪽 SID, 도착 쪽 STAR)도 뺀다 — 새 공항에는
 * 그 절차가 없어 '그런 지점이 없습니다'로 남는다. ownedProcedures는 바뀌기 전 공항의 절차 목록이다.
 */
export function placeEndpoint(texts, end, icao, { isAirport, current = {}, ownedProcedures = [] }) {
  const next = [...texts]
  const ends = readEndpoints(next, isAirport, current)
  const departureSide = end === 'departure'
  const present = departureSide ? ends.departure : ends.arrival
  if (present === (icao || null)) return texts

  // 바뀌는 쪽 공항 바로 안쪽 알약이 그 공항의 절차면 뺀다.
  const innerIndex = departureSide ? (present ? 1 : 0) : (present ? next.length - 2 : next.length - 1)
  if (present && innerIndex >= 0 && innerIndex < next.length && findProcedureByToken(next[innerIndex], ownedProcedures)) {
    next.splice(innerIndex, 1)
  }

  const index = departureSide ? 0 : next.length - 1
  if (!icao) {
    if (present) next.splice(index, 1)
    return next
  }
  if (present) next[index] = icao
  else if (departureSide) next.unshift(icao)
  else next.push(icao)
  return next
}

/**
 * IFR 경로에서 첫 공항과 마지막 공항 사이에 낀 공항 알약을 오류로 바꾼다. 그대로 두면 경로 계산이
 * 공항을 조용히 건너뛰어, 도착지를 바꾸려고 친 공항이 아무 일도 안 일으킨 것처럼 보인다.
 * 도착 공항 뒤에 지점을 친 경우(모바일은 커서가 맨 끝에 있다)는 오류가 아니다 — 뒤에 공항이 또 있을 때만 낀 것이다.
 */
export function flagMisplacedAirports(tokens, flightRule) {
  if (flightRule === 'VFR') return tokens
  const airportIndexes = tokens.flatMap((token, index) => (token?.kind === TOKEN_KINDS.AIRPORT ? [index] : []))
  const first = airportIndexes[0]
  const last = airportIndexes.at(-1)
  return tokens.map((token, index) => (
    token?.kind === TOKEN_KINDS.AIRPORT && index !== first && index !== last
      ? { ...token, kind: TOKEN_KINDS.ERROR, reason: `${token.text} — 공항은 경로 양 끝에만 둘 수 있습니다. 도착 공항은 위 도착 칸에서 바꾸세요` }
      : token
  ))
}

/**
 * 알약 → 위쪽 칸. 알약 목록을 읽어 칸(출발·도착·SID·STAR)을 무엇으로 바꿔야 하는지 돌려준다.
 * 이 방향 한 길뿐이다 — 칸이 알약을 고치는 길은 placeEndpoint·절차 알약 넣기가 맡는다.
 *
 * - 공항: 양 끝 공항이 칸과 다르면 칸을 바꾼다(비어 있는 쪽은 그대로 둔다 — 치는 중인 상태).
 * - 절차: 알약에 새로 들어온 절차를 칸에 넣는다. 알약에서 "있다가 없어진" 절차는 칸에서 뺀다.
 *   없다가 계속 없는 것은 건드리지 않는다 — 자동 생성처럼 칸이 먼저 바뀌고 알약이 다음 렌더에
 *   들어오는 경우, 비교안 전환처럼 알약과 무관하게 절차를 바꾸는 경우를 지우지 않기 위해서다.
 *
 * 돌려주는 값: { airports: {departureAirport?, arrivalAirport?}, sid?, star? } — 바꿀 것만 담는다.
 * sid/star가 null이면 "빼라", 절차 객체면 "이것으로", 키가 없으면 "그대로".
 */
export function fieldChangesFromTokens({ tokens, previousProcedureTexts = [], current = {}, sidOptions = [], starOptions = [] }) {
  const airportTexts = new Set(tokens.filter((token) => token.kind === TOKEN_KINDS.AIRPORT).map((token) => token.text))
  const ends = readEndpoints(tokens.map((token) => token.text), (value) => airportTexts.has(value), {
    departure: current.departure, arrival: current.arrival,
  })
  const airports = {}
  if (ends.departure && ends.departure !== current.departure) airports.departureAirport = ends.departure
  if (ends.arrival && ends.arrival !== current.arrival) airports.arrivalAirport = ends.arrival

  const changes = { airports }
  const procedureTexts = tokens.filter((token) => token.kind === TOKEN_KINDS.PROCEDURE).map((token) => token.text)
  const holds = (texts, procedure) => texts.some((text) => !!findProcedureByToken(text, [procedure]))
  for (const [key, options] of [['sid', sidOptions], ['star', starOptions]]) {
    const selected = current[key] ?? null
    const typed = procedureTexts.map((text) => findProcedureByToken(text, options)).find(Boolean) ?? null
    if (typed && typed.id !== selected?.id) changes[key] = typed
    else if (selected && holds(previousProcedureTexts, selected) && !holds(procedureTexts, selected)) changes[key] = null
  }
  return changes
}
