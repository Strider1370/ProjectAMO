// NOAA Aviation Weather 국제 SIGMET(isigmet, JSON) → 기존 SIGMET 정규화 shape.
// 국내(KMA/IWXXM) SIGMET은 건드리지 않는다. NOAA는 전세계 1콜이므로 firId로 아시아 FIR만 필터.
// 입력: /api/data/isigmet?format=json 배열, firSet=포함할 FIR 집합(Set|배열).
// 출력: iwxxm-advisory-parser(parse) 결과와 동일한 item 배열.

const HAZARD_LABELS = {
  TURB: 'Turbulence',
  ICE: 'Icing',
  TS: 'Thunderstorm',
  TC: 'Tropical Cyclone',
  VA: 'Volcanic Ash',
  MTW: 'Mountain Wave',
  GR: 'Hail',
  DS: 'Duststorm',
  SS: 'Sandstorm',
  IFR: 'IFR',
}

const QUALIFIER_LABELS = {
  SEV: 'Severe', MOD: 'Moderate', EMBD: 'Embedded', ISOL: 'Isolated',
  OCNL: 'Occasional', FRQ: 'Frequent', OBSC: 'Obscured', SQL: 'Squall Line',
}

// hazard+qualifier → PHENOMENON_LABELS(iwxxm-advisory-parser)와 최대한 정합되는 code.
function resolvePhenomenon(hazard, qualifier) {
  const h = String(hazard || '').toUpperCase()
  const q = String(qualifier || '').toUpperCase()
  let code = h
  if ((h === 'TURB' || h === 'ICE') && (q === 'SEV' || q === 'MOD')) code = `${q}_${h === 'ICE' ? 'ICE' : 'TURB'}`
  else if (h === 'TS') {
    if (q === 'EMBD') code = 'EMBD_TS'
    else if (q === 'OBSC') code = 'OBSC_TS'
    else if (q === 'FRQ') code = 'FRQ_TS'
    else if (q === 'SQL') code = 'SQL_TS'
    else code = 'TS'
  }
  const hl = HAZARD_LABELS[h] || h
  const label = q && QUALIFIER_LABELS[q] ? `${QUALIFIER_LABELS[q]} ${hl}` : hl
  return { code: code || null, label: label || null }
}

function closeRing(coords) {
  if (coords.length < 3) return coords
  const [aLon, aLat] = coords[0]
  const [bLon, bLat] = coords[coords.length - 1]
  if (aLon === bLon && aLat === bLat) return coords
  return [...coords, [aLon, aLat]]
}

// 대부분의 NOAA AREA는 좌표 순서가 이미 올바른 링이다(오목 포함) — 그대로 둔다.
// 단, "라인으로 정의된" 구역(WI/NW OF LINE …)은 좌표가 순서대로 안 와 자기교차(bowtie)가 난다.
// → 주어진 순서가 실제로 자기교차할 때만 중심각 정렬로 복구(정상 오목 폴리곤은 손대지 않음).
function segmentsIntersect(a1, a2, b1, b2) {
  const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0])
  const d1 = cross(b1, b2, a1)
  const d2 = cross(b1, b2, a2)
  const d3 = cross(a1, a2, b1)
  const d4 = cross(a1, a2, b2)
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
}

// 닫히지 않은 점열(pts)의 변들(pts[i]→pts[i+1], 마지막→처음)이 서로 교차하는지.
function ringSelfIntersects(pts) {
  const n = pts.length
  if (n < 4) return false
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (j === i + 1) continue // 인접 변(꼭짓점 공유)
      if (i === 0 && j === n - 1) continue // 마지막 변과 첫 변도 인접
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true
    }
  }
  return false
}

function orderRing(points) {
  if (points.length < 4) return points
  const cx = points.reduce((s, [x]) => s + x, 0) / points.length
  const cy = points.reduce((s, [, y]) => s + y, 0) / points.length
  return [...points].sort(
    (a, b) => Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx),
  )
}

function toGeometry(geom, coords) {
  const pts = (coords || [])
    .map((c) => [Number(c.lon), Number(c.lat)])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
  if (pts.length === 0) return { geometry: null, points: [] }

  const g = String(geom || 'AREA').toUpperCase()
  if (g === 'POINT' || pts.length === 1) return { geometry: { type: 'Point', coordinates: pts[0] }, points: pts }
  if (g === 'LINE' || pts.length === 2) return { geometry: { type: 'LineString', coordinates: pts }, points: pts }
  // 정상 링은 원래 순서 유지, 자기교차(라인정의 등)만 중심각 정렬로 복구.
  const ring = closeRing(ringSelfIntersects(pts) ? orderRing(pts) : pts)
  return ring.length >= 4
    ? { geometry: { type: 'Polygon', coordinates: [ring] }, points: pts }
    : { geometry: { type: 'LineString', coordinates: pts }, points: pts }
}

function computeBbox(points) {
  if (!points.length) return null
  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  return { min_lon: Math.min(...lons), min_lat: Math.min(...lats), max_lon: Math.max(...lons), max_lat: Math.max(...lats) }
}

function toIso(sec) {
  if (!Number.isFinite(sec)) return null
  return new Date(sec * 1000).toISOString().replace('.000Z', 'Z')
}

// base/top(ft) → FL(=ft/100). SFC(0)은 lower_ref='SFC'.
function toFl(ft) {
  return Number.isFinite(ft) ? Math.round(ft / 100) : null
}

const COMPASS_DEGREES = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 }

function parseMotion(direction, speed) {
  const text = typeof direction === 'string' && direction.trim() !== '-' ? direction.trim().toUpperCase() : null
  const numericDirection = Number(direction)
  const numericSpeed = Number(speed)
  return {
    direction_deg: text ? COMPASS_DEGREES[text] ?? null : (Number.isFinite(numericDirection) ? numericDirection : null),
    direction_text: text,
    speed_kt: Number.isFinite(numericSpeed) && numericSpeed > 0 ? numericSpeed : null,
  }
}
function mapIntensityChange(chng) {
  const c = String(chng || '').toUpperCase()
  if (c === 'WKN') return 'WEAKENING'
  if (c === 'INTSF') return 'INTENSIFYING'
  if (c === 'NC') return 'NO_CHANGE'
  return null
}

export function parse(entries, firSet) {
  const firs = firSet instanceof Set ? firSet : new Set(firSet || [])
  const nowMs = Date.now()

  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e && firs.has(String(e.firId || '').toUpperCase()))
    .map((e) => {
      const validFrom = toIso(e.validTimeFrom)
      const validTo = toIso(e.validTimeTo)
      const { geometry, points } = toGeometry(e.geom, e.coords)
      const phenom = resolvePhenomenon(e.hazard, e.qualifier)
      const seq = e.seriesId || e.airSigmetType || 'UNK'
      const lowerFl = toFl(e.base)

      return {
        id: `NOAA-${e.firId}-${seq}-${(validFrom || '').replace(/[:]/g, '')}`,
        sequence_number: e.seriesId || null,
        report_status: 'NORMAL',
        cancelled: false,
        cancelled_sequence_number: null,
        cancelled_valid_from: null,
        cancelled_valid_to: null,
        issue_time: validFrom,
        valid_from: validFrom,
        valid_to: validTo,
        fir: e.firId || null,
        fir_name: e.firName || null,
        atsu: e.firId || null,
        atsu_name: e.firName || null,
        mwo: null,
        mwo_name: null,
        phenomenon_code: phenom.code,
        phenomenon_label: phenom.label,
        time_indicator: null,
        intensity_change: mapIntensityChange(e.chng),
        altitude: {
          lower_fl: lowerFl,
          upper_fl: toFl(e.top),
          lower_ref: e.base === 0 ? 'SFC' : 'STD',
          upper_ref: 'STD',
          lower_uom: 'FL',
          upper_uom: 'FL',
        },
        motion: parseMotion(e.dir, e.spd),
        surface_visibility_m: null,
        surface_visibility_causes: [],
        surface_visibility_cause_labels: [],
        surface_wind: { direction_deg: null, speed_kt: null },
        geometry,
        bbox: computeBbox(points),
        raw_xml_id: null,
        raw_sigmet: e.rawSigmet || null,
        source: 'NOAA',
      }
    })
    // 유효기간 지난 것 제외(방어적 — 프로세서 mergeAdvisories도 다시 거른다).
    .filter((item) => {
      const end = Date.parse(item.valid_to)
      return !Number.isFinite(end) || end > nowMs
    })
}

export default { parse }
