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

// 좌표는 자료 모양이 제각각이라(공항은 airportsById, 지점은 navpoints, 절차 FIX는 fixCoords)
// 한 군데서 꺼낸다. 없으면 null — 지도에 점을 찍지 않을 뿐 판정은 그대로다.
function coordinateOf(value, { airportsById = {}, navpoints = {}, fixCoords = {} }) {
  const source = airportsById[value] ?? navpoints[value] ?? fixCoords[value]
  const lat = source?.coordinates?.lat ?? source?.lat
  const lon = source?.coordinates?.lon ?? source?.lon
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

export function classifyToken(text, lookups = {}) {
  const value = String(text ?? '').trim().toUpperCase()
  const { airports = [], navpoints = {}, routes = {}, procedures = [], fixes = [], userWaypoints = [] } = lookups

  if (!value) return null
  if (value === 'DCT') return { kind: TOKEN_KINDS.DCT, text: value }
  const userWaypoint = userWaypoints.find((waypoint) => String(waypoint?.name ?? '').toUpperCase() === value)
  if (userWaypoint && Number.isFinite(userWaypoint.lon) && Number.isFinite(userWaypoint.lat)) {
    return { kind: TOKEN_KINDS.COORDINATE, text: value, coordinate: { lon: userWaypoint.lon, lat: userWaypoint.lat } }
  }
  if (procedures.includes(value)) return { kind: TOKEN_KINDS.PROCEDURE, text: value }
  if (airports.includes(value)) {
    return { kind: TOKEN_KINDS.AIRPORT, text: value, coordinate: coordinateOf(value, lookups) }
  }
  if (Object.prototype.hasOwnProperty.call(routes, value)) return { kind: TOKEN_KINDS.AIRWAY, text: value }
  if (Object.prototype.hasOwnProperty.call(navpoints, value)) {
    return { kind: TOKEN_KINDS.FIX, text: value, coordinate: coordinateOf(value, lookups) }
  }
  // enroute.json에는 항로 지점만 있다. OSPAT처럼 터미널 구역에만 있는 FIX는 절차 자료
  // 안에서만 나오는데, 조종사는 그것을 경로에 그대로 쓴다 — 없다고 하면 정상 입력이 오류가 된다.
  if (fixes.includes(value)) {
    return { kind: TOKEN_KINDS.FIX, text: value, coordinate: coordinateOf(value, lookups) }
  }

  try {
    const coordinate = parseCoordinateToken(value)
    if (coordinate) return { kind: TOKEN_KINDS.COORDINATE, text: value, coordinate }
  } catch {
    // 좌표 모양이지만 범위를 벗어난 값 — 아래에서 오류로 떨어진다.
  }

  return { kind: TOKEN_KINDS.ERROR, text: value, reason: reasonFor(value) }
}

// 지금까지 확정된 토큰이 지도에서 어디인지. 공항 하나만 쳐도 점 하나가 나오고, 둘 이상이면
// 그 사이를 잇는 선이 된다 — 목적지를 아직 안 정했어도 지금까지 친 것이 보여야 한다.
//
// 이 선은 계산된 경로가 아니다. 항공로(Y711 등)는 실제로 꺾여 가는데 여기서는 점과 점을
// 직선으로 잇는다. 그래서 화면에서 실제 경로와 반드시 다르게 보여야 한다(점선 등) —
// 곧게 그은 선을 실제 항로로 읽으면 위험하다.
export function tokenGeometry(tokens = []) {
  const points = tokens
    .filter((token) => token?.coordinate)
    .map((token) => ({ text: token.text, kind: token.kind, ...token.coordinate }))
  return {
    points,
    // 선은 점이 둘 이상일 때만 뜻이 있다.
    line: points.length > 1 ? points.map((point) => [point.lon, point.lat]) : [],
  }
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
// 절차 안 FIX의 좌표. 이름만 알면 판정은 되지만 지도에 점을 찍으려면 좌표가 필요하다.
export function procedureFixCoordinates(procedures = []) {
  const byId = {}
  const put = (id, lat, lon) => {
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) return
    const key = String(id).toUpperCase()
    if (!byId[key]) byId[key] = { lat, lon }
  }
  for (const procedure of procedures) {
    for (const fix of procedure?.fixes ?? []) put(fix?.id, fix?.lat, fix?.lon)
    for (const point of procedure?.displayPoints ?? []) put(point?.id, point?.lat, point?.lon)
  }
  return byId
}

// 절차 안에 나오는 FIX 이름들. 터미널 구역 FIX는 enroute.json에 없고 절차에만 있다.
export function procedureFixIds(procedures = []) {
  const ids = new Set()
  for (const procedure of procedures) {
    for (const fix of procedure?.fixes ?? []) if (fix?.id) ids.add(String(fix.id).toUpperCase())
    for (const point of procedure?.displayPoints ?? []) if (point?.id) ids.add(String(point.id).toUpperCase())
    if (procedure?.enrouteFix) ids.add(String(procedure.enrouteFix).toUpperCase())
    if (procedure?.startFix) ids.add(String(procedure.startFix).toUpperCase())
  }
  return [...ids]
}

// 활주로는 자료에 '15L/R'처럼 묶여 있다. 경로에는 한 쪽만 쓰므로 갈라놓는다.
function runwayForms(runway) {
  const value = String(runway ?? '').toUpperCase()
  const paired = value.match(/^(\d{2})([LRC])\/([LRC])$/)
  if (paired) return [`${paired[1]}${paired[2]}`, `${paired[1]}${paired[3]}`]
  return value ? [value] : []
}

// 절차가 경로에 나타나는 형태들.
//
// 조종사가 쓰는 이름은 `name`(BINIL3C)이다. `id`는 내부 키(RKSI-SID-BINIL3C)이고
// `label`은 사람이 읽는 표시(BINIL3C (RWY 15L/R))다 — 둘 다 경로에 치는 글자가 아니다.
// 이것을 헷갈리면 절차를 정확히 쳐도 오류로 잡힌다.
export function procedureTokenForms(procedures = []) {
  const forms = new Set()
  for (const procedure of procedures) {
    const name = procedure?.name ?? procedure?.id
    if (!name) continue
    forms.add(String(name).toUpperCase())
    const fix = procedure.enrouteFix
    for (const runway of procedure.runways ?? []) {
      for (const rwy of runwayForms(runway)) {
        // ForeFlight식 전체 형태: 활주로.절차.연결FIX
        forms.add(fix ? `${rwy}.${name}.${fix}`.toUpperCase() : `${rwy}.${name}`.toUpperCase())
      }
    }
  }
  return [...forms]
}

/** 토큰 글자가 어느 절차인지 찾는다. 위쪽 선택기를 그 절차로 맞추는 데 쓴다. */
export function findProcedureByToken(text, procedures = []) {
  const value = String(text ?? '').trim().toUpperCase()
  if (!value) return null
  return procedures.find((procedure) => procedureTokenForms([procedure]).includes(value)) ?? null
}

/** 이 글자가 주어진 절차 목록 중 하나인가. 선택기로 절차를 바꿀 때 옛 토큰을 걷어내는 데 쓴다. */
export function isProcedureText(text, procedures = []) {
  return !!findProcedureByToken(text, procedures)
}
