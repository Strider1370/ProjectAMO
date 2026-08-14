import { parseCoordinateToken } from './manualRouteInput.js'

export const TOKEN_KINDS = {
  AIRPORT: 'airport',
  PROCEDURE: 'procedure',
  AIRWAY: 'airway',
  FIX: 'fix',
  COORDINATE: 'coordinate',
  DCT: 'dct',
  ERROR: 'error',
}

// 스펙 표 그대로. ForeFlight 배색을 따르되 주황을 쓰지 않는다 — 주황·황색은 이 앱에서
// 난류·주의 등급이 이미 쓰고 있다. 절차 셋(SID·STAR·접근)을 한 묶음으로 합쳤으므로
// ForeFlight가 접근절차에 쓰던 청록 자리가 비고, 항공로가 그 자리를 쓴다.
// 초록은 VFR·"좋음"과 겹치지만, 알약이 연하고 안에 든 것이 절차 이름이라 기상 표시로
// 읽힐 위험은 낮다고 보았다. 혼동이 생기면 청회색 계열로 옮긴다.
export const TOKEN_COLORS = {
  [TOKEN_KINDS.AIRPORT]: { bg: '#d3e3f7', fg: '#1c3f66' },
  [TOKEN_KINDS.PROCEDURE]: { bg: '#d7ecd0', fg: '#2f5d3a' },
  [TOKEN_KINDS.AIRWAY]: { bg: '#cdeaea', fg: '#14595c' },
  [TOKEN_KINDS.FIX]: { bg: '#dcdcf3', fg: '#3b3a8c' },
  // 좌표는 이름 없는 점이다. 색을 하나 더 늘리는 대신 점선 테두리로만 구분한다.
  [TOKEN_KINDS.COORDINATE]: { bg: '#dcdcf3', fg: '#3b3a8c', border: '1px dashed #3b3a8c' },
  // 빨강은 오직 오류. 테두리는 색을 못 알아보는 경우와 햇빛에 화면이 씻긴 경우를 위한 것이다.
  [TOKEN_KINDS.ERROR]: { bg: '#fee2e2', fg: '#c0291f', border: '1.5px solid #c0291f' },
}

// 판정 못 한 글자의 이유는 모양으로 추측한다. 오타인지 우리 자료에 없는 것인지
// 구분되어야 고칠 수 있다 — "알 수 없음" 한 마디로는 어디를 고칠지 알 수 없다.
const AIRPORT_SHAPE = /^[A-Z]{4}$/
const AIRWAY_SHAPE = /^[A-Z]\d{1,4}$/

function reasonFor(text) {
  if (AIRWAY_SHAPE.test(text)) return `${text} — 그런 항공로가 없습니다`
  if (AIRPORT_SHAPE.test(text) && text.startsWith('RK')) return `${text} — 그런 공항이 없습니다`
  return `${text} — 그런 지점이 없습니다`
}

export function classifyToken(text, lookups = {}) {
  const value = String(text ?? '').trim().toUpperCase()
  const { airports = [], navpoints = {}, routes = {}, procedures = [] } = lookups

  if (!value) return null
  if (value === 'DCT') return { kind: TOKEN_KINDS.DCT, text: value }
  if (procedures.includes(value)) return { kind: TOKEN_KINDS.PROCEDURE, text: value }
  if (airports.includes(value)) return { kind: TOKEN_KINDS.AIRPORT, text: value }
  if (Object.prototype.hasOwnProperty.call(routes, value)) return { kind: TOKEN_KINDS.AIRWAY, text: value }
  if (Object.prototype.hasOwnProperty.call(navpoints, value)) return { kind: TOKEN_KINDS.FIX, text: value }

  try {
    if (parseCoordinateToken(value)) return { kind: TOKEN_KINDS.COORDINATE, text: value }
  } catch {
    // 좌표 모양이지만 범위를 벗어난 값 — 아래에서 오류로 떨어진다.
  }

  return { kind: TOKEN_KINDS.ERROR, text: value, reason: reasonFor(value) }
}

export function classifyTokens(texts = [], lookups = {}) {
  return texts.map((text) => classifyToken(text, lookups)).filter(Boolean)
}

export function errorCount(tokens = []) {
  return tokens.filter((token) => token?.kind === TOKEN_KINDS.ERROR).length
}

// 절차가 경로 문자열에 나타나는 형태를 만든다: 활주로.절차ID.연결FIX (예: 32L.BULT2Q.BULTI).
// getProcedures의 label("BULT2Q (RWY 32L)")은 사람이 읽는 이름이라 대조에 쓸 수 없다 —
// 그대로 대조하면 절차를 정확히 쳐도 영원히 오류로 잡힌다.
// 활주로를 빼고 치는 경우도 있으므로 절차 ID 단독형도 함께 받는다.
export function procedureTokenForms(procedures = []) {
  const forms = new Set()
  for (const procedure of procedures) {
    const id = procedure?.id
    if (!id) continue
    forms.add(String(id).toUpperCase())
    const fix = procedure.enrouteFix
    for (const runway of procedure.runways ?? []) {
      forms.add(fix ? `${runway}.${id}.${fix}`.toUpperCase() : `${runway}.${id}`.toUpperCase())
    }
  }
  return [...forms]
}
