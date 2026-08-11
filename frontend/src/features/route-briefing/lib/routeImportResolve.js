// 불러온 경로 후보 하나를 경로 편집기가 먹을 수 있는 재료로 바꾼다. 순수 함수 —
// navdata 로딩은 호출부(useRouteBriefing)가 하고 여기엔 결과만 들어온다.
import { thinRoute, isWithinKoreaFir } from './routeImport.js'
import { greatCircleNm } from './routePreview.js'

export const AIRPORT_SNAP_NM = 10
export const FIX_MATCH_NM = 5

// 중간 경유점에 4글자 대문자 이름을 fix로 넘기면 manualRouteInput.js가 "중간 공항
// ICAO는 사용할 수 없습니다"로 거부한다. 그 이름은 좌표로 떨어뜨린다.
const LOOKS_LIKE_ICAO = /^[A-Z]{4}$/

function nearestAirport(coord, airports) {
  let best = null
  for (const airport of airports ?? []) {
    if (!Number.isFinite(airport.lon) || !Number.isFinite(airport.lat)) continue
    const distNm = greatCircleNm(coord[0], coord[1], airport.lon, airport.lat)
    if (!best || distNm < best.distNm) best = { icao: airport.icao, distNm }
  }
  return best
}

// FPL은 지점 종류를 싣는다. 끝점이 AIRPORT이고 그 식별자를 우리가 아는 공항이면
// 거리 탐색을 건너뛴다 — 파일이 명시한 것이 추측보다 정확하다.
function declaredAirport(name, type, airports) {
  if (type !== 'AIRPORT' || !name) return null
  return airports?.some((airport) => airport.icao === name) ? name : null
}

function resolveEndpoint(coord, name, type, airports) {
  const declared = declaredAirport(name, type, airports)
  if (declared) return { icao: declared, distNm: 0, absorb: true }
  const nearest = nearestAirport(coord, airports)
  if (nearest && nearest.distNm <= AIRPORT_SNAP_NM) return { ...nearest, absorb: true }
  return { icao: null, distNm: null, absorb: false }
}

function middleTerm(coord, name, navpoints, counters) {
  const asCoordinate = { kind: 'coordinate', coordinate: { lon: coord[0], lat: coord[1] } }
  if (!name) return asCoordinate
  const navpoint = navpoints?.[name]
  if (!navpoint) {
    counters.unknown.push(name)
    return asCoordinate
  }
  const distNm = greatCircleNm(coord[0], coord[1], navpoint.lon, navpoint.lat)
  if (distNm > FIX_MATCH_NM) {
    // 같은 식별자가 다른 FIR에 있거나 항법 데이터 주기가 오래됐을 수 있다.
    // 조종사가 계획한 위치는 파일 쪽이다.
    counters.moved.push({ name, distNm })
    return asCoordinate
  }
  if (LOOKS_LIKE_ICAO.test(name)) return asCoordinate
  return { kind: 'fix', id: name }
}

export function resolveImportedRoute({ candidate, airports = [], navpoints = {} }) {
  const thin = thinRoute(candidate)
  const { coords, names, types } = thin
  const notices = []

  const start = resolveEndpoint(coords[0], names[0], types[0], airports)
  const end = resolveEndpoint(coords.at(-1), names.at(-1), types.at(-1), airports)

  // 공항으로 흡수된 끝점은 경유점에서 뺀다 — 같은 장소를 두 점으로 두지 않는다.
  const from = start.absorb ? 1 : 0
  const to = end.absorb ? coords.length - 1 : coords.length

  const counters = { unknown: [], moved: [] }
  const terms = coords.slice(from, to).map((coord, i) => middleTerm(coord, names[from + i], navpoints, counters))

  const withDistance = (icao, distNm) => (distNm ? `${icao} (${distNm.toFixed(0)}NM)` : icao)
  if (start.icao && end.icao) {
    notices.push({
      level: 'info',
      code: 'airports-detected',
      message: `출발 ${withDistance(start.icao, start.distNm)}, 도착 ${withDistance(end.icao, end.distNm)}로 인식 — 다르면 바꾸세요`,
    })
  } else {
    notices.push({ level: 'action', code: 'airports-missing', message: '출발·도착 공항을 골라주세요' })
  }

  if (counters.unknown.length > 0) {
    notices.push({ level: 'info', code: 'fix-unknown', message: `지점 ${counters.unknown.length}개는 이름을 찾지 못해 좌표로 넣었습니다` })
  }
  for (const { name, distNm } of counters.moved) {
    notices.push({ level: 'info', code: 'fix-moved', message: `${name} — 우리 데이터와 위치가 ${distNm.toFixed(0)}NM 다릅니다. 파일 좌표를 씁니다` })
  }
  if (thin.thinned) {
    notices.push({ level: 'info', code: 'thinned', message: `기록점 ${thin.originalCount.toLocaleString('ko-KR')}개를 ${coords.length}개로 줄였습니다 (경로 오차 1NM 이내)` })
  }
  if (candidate.droppedCount > 0) {
    notices.push({ level: 'info', code: 'coords-dropped', message: `좌표 ${candidate.droppedCount}개는 값이 범위를 벗어나 제외했습니다` })
  }
  if (!isWithinKoreaFir(...coords[0]) || !isWithinKoreaFir(...coords.at(-1))) {
    notices.push({ level: 'info', code: 'outside-fir', message: '경로 일부가 한국 정보구역 밖 — 기상이 비어 있을 수 있습니다' })
  }

  return { departureAirport: start.icao, arrivalAirport: end.icao, terms, coordinates: coords, notices }
}
