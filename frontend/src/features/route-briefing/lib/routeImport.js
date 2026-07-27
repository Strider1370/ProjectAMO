// 외부 경로 파일(GeoJSON/GPX/KML)을 우리 VFR 경유점 파이프라인이 먹을 수 있는
// [lon,lat] 좌표 배열로 바꾸는 순수 함수 모음. UI/상태 없음 — useRouteBriefing이 호출한다.
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import simplify from 'simplify-js'
import { greatCircleNm } from './routePreview.js'

// 전역 DOMParser만 쓴다. 브라우저는 내장이라 항상 있고, node --test에는 없으므로
// routeImport.test.js가 xmldom을 globalThis에 심어준다. 여기서 xmldom을 직접 import하면
// 브라우저에서 한 줄도 실행되지 않는 268KB(전송 68KB)가 첫 화면 번들에 실린다.
// 두 구현 모두 표준 DOM Level 1 API(getElementsByTagName·getAttribute·textContent)를
// 지원하므로 이후 코드는 어느 쪽이 만든 doc인지 신경 쓸 필요 없다.

// 지도 maxBounds(frontend/src/features/map/mapConfig.js MAP_CONFIG.maxBounds)와 동일한
// 한국 FIR 근사 경계. 숫자 4개뿐이라 별도 import로 feature 간 결합을 만들지 않고 값만 미러링.
const KOREA_FIR_BOUNDS = { minLon: 116, maxLon: 139, minLat: 26, maxLat: 44 }

export function isWithinKoreaFir(lon, lat) {
  return (
    Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= KOREA_FIR_BOUNDS.minLon && lon <= KOREA_FIR_BOUNDS.maxLon &&
    lat >= KOREA_FIR_BOUNDS.minLat && lat <= KOREA_FIR_BOUNDS.maxLat
  )
}

function detectFileKind(name) {
  const ext = String(name ?? '').toLowerCase().split('.').pop()
  if (ext === 'gpx') return 'gpx'
  if (ext === 'kml') return 'kml'
  return 'geojson'
}

// 파일 텍스트 → 중간 표현. GeoJSON은 그대로 파싱, GPX는 DOM(다음 스텝에서 후보 추출 시
// 직접 순회), KML은 togeojson으로 변환. GPX/KML 파싱 실패(malformed XML) 감지는 이 계획
// 범위 밖 — 브라우저 DOMParser는 malformed XML에서도 예외를 던지지 않고 <parsererror>
// 요소를 문서에 심는 방식이라, xmldom과 동일하게 동작을 보장할 테스트가 없는 채로 감지
// 로직만 넣는 건 미검증 코드가 된다(YAGNI). 필요해지면 전용 테스트와 함께 추가한다.
export function parseRouteFile(name, text) {
  const kind = detectFileKind(name)
  if (kind === 'geojson') {
    let geojson
    try {
      geojson = JSON.parse(text)
    } catch {
      throw new Error('파일을 읽을 수 없습니다 (GeoJSON/GPX/KML 확인)')
    }
    return { format: 'geojson', geojson }
  }
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (kind === 'gpx') return { format: 'gpx', doc }
  return { format: 'kml', geojson: kmlToGeoJSON(doc) }
}

// GeoJSON 최상위 문서 3종을 전부 "Feature 목록"으로 정규화한다: FeatureCollection,
// 래핑 없는 단일 Feature, 그리고 스펙상 허용되는 래핑 없는 순수 Geometry(예:
// { type:'LineString', coordinates:[...] }만 있는 파일 — 실제 공개 GeoJSON에서 발견됨).
function normalizeToFeatureList(geojson) {
  if (geojson?.type === 'FeatureCollection') return geojson.features ?? []
  if (geojson?.type === 'Feature') return [geojson]
  if (geojson?.type && geojson?.coordinates) return [{ type: 'Feature', properties: {}, geometry: geojson }]
  return []
}

// 지오메트리 하나(LineString/MultiLineString/Point/GeometryCollection)를 후보 배열에
// 누적한다. GeometryCollection은 KML <MultiGeometry>가 togeojson을 거치며 흔히 나오는
// 모양이라 재귀로 자식들을 같은 방식으로 처리한다(중첩 GeometryCollection도 방어).
function collectGeometry(geom, label, candidates, pointCoords, routeIdxRef) {
  if (!geom) return
  if (geom.type === 'LineString' && geom.coordinates?.length >= 2) {
    routeIdxRef.value += 1
    candidates.push({ label: label || `경로 ${routeIdxRef.value}`, kind: 'route', coords: geom.coordinates })
  } else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates ?? []) {
      if (line.length >= 2) {
        routeIdxRef.value += 1
        candidates.push({ label: label || `경로 ${routeIdxRef.value}`, kind: 'route', coords: line })
      }
    }
  } else if (geom.type === 'Point' && geom.coordinates?.length === 2) {
    pointCoords.push(geom.coordinates)
  } else if (geom.type === 'GeometryCollection') {
    for (const child of geom.geometries ?? []) {
      collectGeometry(child, label, candidates, pointCoords, routeIdxRef)
    }
  }
}

function extractGeoJsonPaths(geojson) {
  const candidates = []
  const features = normalizeToFeatureList(geojson)
  const routeIdxRef = { value: 0 }
  const pointCoords = []
  for (const feature of features ?? []) {
    collectGeometry(feature?.geometry, feature?.properties?.name, candidates, pointCoords, routeIdxRef)
  }
  if (candidates.length === 0 && pointCoords.length >= 2) {
    candidates.push({ label: '지점 모음', kind: 'points', coords: pointCoords })
  }
  return candidates
}

// 좌표 + 각 지점의 <name>(있으면)을 나란한 배열 두 개로 뽑는다. 실제 EFB가 내보내는
// GPX route(rte)는 rtept마다 픽스/공항 이름을 싣는 게 표준이라(GPX 1.0 스펙, ForeFlight
// 등), 좌표만 뽑고 이름을 버리면 "AGAVO"가 "WP2"로 뭉개진다.
function pointsFromGpxNodes(nodeList) {
  const coords = []
  const names = []
  for (const el of Array.from(nodeList)) {
    const lon = Number(el.getAttribute('lon'))
    const lat = Number(el.getAttribute('lat'))
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue
    coords.push([lon, lat])
    const nameEl = el.getElementsByTagName('name')[0]
    names.push(nameEl?.textContent?.trim() || null)
  }
  return { coords, names }
}

function extractGpxPaths(doc) {
  const candidates = []
  const rtes = Array.from(doc.getElementsByTagName('rte'))
  rtes.forEach((rte, i) => {
    const { coords, names } = pointsFromGpxNodes(rte.getElementsByTagName('rtept'))
    if (coords.length >= 2) {
      const nameEl = rte.getElementsByTagName('name')[0]
      candidates.push({ label: nameEl?.textContent?.trim() || `경로 ${i + 1}`, kind: 'route', coords, names })
    }
  })
  const trks = Array.from(doc.getElementsByTagName('trk'))
  trks.forEach((trk, i) => {
    const { coords, names } = pointsFromGpxNodes(trk.getElementsByTagName('trkpt'))
    if (coords.length >= 2) {
      const nameEl = trk.getElementsByTagName('name')[0]
      candidates.push({ label: nameEl?.textContent?.trim() || `궤적 ${i + 1}`, kind: 'track', coords, names })
    }
  })
  if (candidates.length === 0) {
    const { coords, names } = pointsFromGpxNodes(doc.getElementsByTagName('wpt'))
    if (coords.length >= 2) candidates.push({ label: '지점 모음', kind: 'points', coords, names })
  }
  return candidates
}

// parseRouteFile의 결과에서 "선택 가능한 경로 후보" 목록을 뽑는다. 파일에 경로가
// 여러 개면 전부 반환 — 고르는 건 호출부(useRouteBriefing) 책임.
// 같은 이름의 후보가 여럿이면 선택 UI(RouteImportChooser)에서 구분이 안 된다 — 실제
// KML MultiGeometry(하나의 Placemark 이름 아래 LineString 여러 개)에서 흔히 발생.
// 라벨이 겹칠 때만 " (N)"을 붙인다(단일 후보나 이미 고유한 라벨은 그대로 둔다).
function disambiguateDuplicateLabels(candidates) {
  const counts = new Map()
  for (const c of candidates) counts.set(c.label, (counts.get(c.label) ?? 0) + 1)
  const seen = new Map()
  return candidates.map((c) => {
    if ((counts.get(c.label) ?? 0) <= 1) return c
    const next = (seen.get(c.label) ?? 0) + 1
    seen.set(c.label, next)
    return { ...c, label: `${c.label} (${next})` }
  })
}

export function extractRoutePaths(parsed) {
  const candidates = parsed.format === 'gpx' ? extractGpxPaths(parsed.doc) : extractGeoJsonPaths(parsed.geojson)
  return disambiguateDuplicateLabels(candidates)
}

// RDP(Ramer-Douglas-Peucker)로 점을 줄인다. tolerance(도 단위)를 이분 탐색으로
// 늘려가며 결과 길이가 maxPts 이하가 되는 가장 작은 tolerance를 찾는다.
// simplify-js는 첫·끝 점을 항상 보존한다(알고리즘 특성).
export function simplifyRoute(coords, maxPts = 20) {
  if (coords.length <= maxPts) return coords
  const points = coords.map(([lon, lat]) => ({ x: lon, y: lat }))
  let lo = 0
  let hi = 5 // 도 단위 상한 — 한반도 규모 경로에 충분히 넉넉함
  let best = points
  for (let i = 0; i < 25; i += 1) {
    const mid = (lo + hi) / 2
    const candidate = simplify(points, mid, true)
    if (candidate.length > maxPts) {
      lo = mid
    } else {
      best = candidate
      hi = mid
    }
  }
  return best.map((p) => [p.x, p.y])
}

// 끝점이 공항 임계거리(NM) 안이면 그 ICAO, 아니면 null(호출부가 일반 지점으로 폴백).
export function snapEndpointsToAirports(coords, airports, thresholdNm = 5) {
  function nearest([lon, lat]) {
    let best = null
    for (const airport of airports ?? []) {
      if (!Number.isFinite(airport.lon) || !Number.isFinite(airport.lat)) continue
      const distNm = greatCircleNm(lon, lat, airport.lon, airport.lat)
      if (distNm <= thresholdNm && (!best || distNm < best.distNm)) {
        best = { icao: airport.icao, distNm }
      }
    }
    return best?.icao ?? null
  }
  return {
    departureAirport: nearest(coords[0]),
    arrivalAirport: nearest(coords[coords.length - 1]),
  }
}
