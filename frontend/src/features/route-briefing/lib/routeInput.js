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
 * IFR 경로에서 양 끝이 아닌 자리에 놓인 공항 알약을 오류로 바꾼다. 그대로 두면 경로 계산이
 * 공항을 조용히 건너뛰어, 도착지를 바꾸려고 친 공항이 아무 일도 안 일으킨 것처럼 보인다.
 */
export function flagMisplacedAirports(tokens, flightRule) {
  if (flightRule === 'VFR') return tokens
  return tokens.map((token, index) => (
    token?.kind === TOKEN_KINDS.AIRPORT && index > 0 && index < tokens.length - 1
      ? { ...token, kind: TOKEN_KINDS.ERROR, reason: `${token.text} — 공항은 경로 양 끝에만 둘 수 있습니다. 도착 공항은 위 도착 칸에서 바꾸세요` }
      : token
  ))
}
