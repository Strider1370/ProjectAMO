// NOTAM 위치 결정. 본문 → (Q줄 검산) → KML → 위치 확인 불가.
// spec: docs/superpowers/specs/2026-07-26-notam-geometry-and-schedule-design.md
import { parsePositionText } from './notam-position-text.js'

const M_PER_NM = 1852
const CIRCLE_STEPS = 24 // KML이 원을 그리는 해상도와 같게 맞춘다(25점 = 24 + 닫는 점)
const Q_SLACK_NM = 1 // Q줄 좌표는 분 단위 반올림이라 최대 약 900m 오차가 있다

// Q)…/lower/upper/DDMMN DDDMME RRR — 끝의 좌표+반경(NM)
export function qCircleFromRawText(rawText) {
  const m = String(rawText || '').match(/Q\)[^\n]*?\/(\d{4})([NS])(\d{5})([EW])(\d{3})/)
  if (!m) return null
  const lat = (Number(m[1].slice(0, 2)) + Number(m[1].slice(2)) / 60) * (m[2] === 'N' ? 1 : -1)
  const lon = (Number(m[3].slice(0, 3)) + Number(m[3].slice(3)) / 60) * (m[4] === 'E' ? 1 : -1)
  return { lat, lon, radiusNm: Number(m[5]) }
}

function metersBetween(a, b) {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

function circleRing(center, radiusM) {
  const dLat = (radiusM / 111320)
  const dLon = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180) || 1)
  const ring = []
  for (let i = 0; i < CIRCLE_STEPS; i += 1) {
    const th = (2 * Math.PI * i) / CIRCLE_STEPS
    ring.push([center.lon + dLon * Math.cos(th), center.lat + dLat * Math.sin(th)])
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

function polygonFrom(coords) {
  const ring = coords.map((p) => [p.lon, p.lat])
  const [f] = ring, l = ring[ring.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) ring.push([f[0], f[1]])
  return { type: 'Polygon', coordinates: [ring] }
}

function geometryPoints(geometry) {
  if (!geometry) return []
  const flat = geometry.type === 'Polygon' ? geometry.coordinates.flat() : geometry.coordinates
  return flat.map(([lon, lat]) => ({ lon, lat }))
}

// 본문 해석이 Q줄 원을 크게 벗어나면 신뢰하지 않는다(좌표 오독 방지).
function withinQCircle(geometry, q) {
  if (!q) return true
  const limit = (q.radiusNm + Q_SLACK_NM) * M_PER_NM
  return geometryPoints(geometry).every((p) => metersBetween(p, q) <= limit)
}

// KML LineString이 이미 닫힌 고리면 면으로 취급한다(실측 89건).
function closeIfRing(geometry) {
  if (geometry?.type !== 'LineString') return geometry
  const c = geometry.coordinates
  if (c.length < 4) return geometry
  const [f] = c, l = c[c.length - 1]
  return f[0] === l[0] && f[1] === l[1] ? { type: 'Polygon', coordinates: [c] } : geometry
}

export function resolveNotamGeometry({ rawText, kmlGeometry }) {
  const q = qCircleFromRawText(rawText)
  const text = parsePositionText(rawText)
  const qGeometry = () => (q ? circleRing(q, q.radiusNm * M_PER_NM) : null)

  let fromText = null
  if (text.kind === 'circle' && text.coords.length && text.radiusM != null) {
    // 중심이 여럿이면 전부 담는다(크레인 2기 등). polygonsOf()가 MultiPolygon을 이미 처리한다.
    const rings = text.coords.map((c) => circleRing(c, text.radiusM).coordinates)
    fromText = rings.length === 1 ? { type: 'Polygon', coordinates: rings[0] } : { type: 'MultiPolygon', coordinates: rings }
  } else if (text.kind === 'polygon') fromText = polygonFrom(text.coords)
  else if (text.kind === 'corridor') fromText = { type: 'LineString', coordinates: text.coords.map((p) => [p.lon, p.lat]) }

  // 정확히 못 그리는 두 경우는 Q줄 원으로 넓게 덮는다.
  //  (1) 호·반원·제외구역이 섞인 건(원이든 다각형이든) — 본문이 그린 도형을 믿을 수 없다
  //      (E3260/26은 제외구역의 1.5NM을 집고, E3357/26 등은 다각형 좌표는 멀쩡해도 RMK의
  //      EXC가 실제 제외 구간을 표현 못 한다는 신호다 — approximated는 kind를 가리지 않는다)
  //  (2) 원본 결함으로 꼭짓점을 잃은 다각형 — KML도 같은 결함이라 내려갈 곳이 없다
  const needsQ = text.approximated || text.defective
  if (needsQ) {
    const qGeo = qGeometry()
    // Q줄이 없으면 억지로 그리지 않는다. 아래 KML → unresolved 경로로 내려간다.
    if (qGeo) return { geometry: qGeo, bufferNm: null, source: 'q', reason: null, approximated: true }
  } else if (fromText && withinQCircle(fromText, q)) {
    return { geometry: fromText, bufferNm: text.bufferNm ?? null, source: 'text', reason: null, approximated: text.approximated }
  }

  const kml = closeIfRing(kmlGeometry)
  if (kml) return { geometry: kml, bufferNm: null, source: 'kml', reason: null, approximated: false }

  return {
    geometry: null,
    bufferNm: null,
    source: 'none',
    reason: text.defective ? 'source_defect_no_q' : fromText ? 'text_outside_q_circle' : 'no_position_stated',
    approximated: false,
  }
}

export default { resolveNotamGeometry, qCircleFromRawText }
