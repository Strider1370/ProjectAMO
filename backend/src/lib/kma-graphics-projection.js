// 기상청 레이더 그래픽(WISSDOM·QPF)은 람베르트 정각원추도법(LCC)으로 미리 그려져 온다.
// 우리 지도는 메르카토르라, 그 그림을 위경도 사각형에 그냥 붙이면 최대 350 km까지 어긋난다
// (공항 기준 실측: 제주 112 km, 인천 332 km, 강릉 351 km).
//
// 표준위도 30°/60°, 기준경도 126°는 기상 레이더 합성영상의 공개된 좌표계 정의를 따른다
// (기상기후데이터위키 「레이더:기상레이더」). 같은 문서가 지구 모양을 WGS84 타원체로 명시한다 —
// 레이더 에코 파서(parsers/radar-echo-parser.js)가 쓰는 구면 공식을 그대로 가져다 쓰면
// 위도 30~40° 구간에서 남북으로 20~23 km 밀린다. 실측으로도 확인했다: 유효시각이 지난 QPF를
// 같은 시각 실황 레이더와 겹쳐보니 남쪽 22 km, 타원체 공식과의 차이는 21.7 km로 일치했다.
//
// 원점도 격자와 다르다. 격자는 위도 38°가 원점이지만 그래픽 API의 imageCoverage*는 적도 원점이다
// (한반도에서 y가 380만~480만 m로 나오는 것이 그 근거).

const DEG = Math.PI / 180
const A = 6378137            // WGS84 장반경
const F = 1 / 298.257223563  // WGS84 편평률
const E = Math.sqrt(2 * F - F * F)
const PHI1 = 30 * DEG
const PHI2 = 60 * DEG
const LAM0 = 126 * DEG

const m = (phi) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2)
const t = (phi) => Math.tan(Math.PI / 4 - phi / 2)
  / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2)

const CONE = (Math.log(m(PHI1)) - Math.log(m(PHI2))) / (Math.log(t(PHI1)) - Math.log(t(PHI2)))
const SCALE = m(PHI1) / (CONE * Math.pow(t(PHI1), CONE))
const RHO_EQUATOR_M = A * SCALE // t(0) = 1이므로 적도에서의 rho

export function latLonToProjected(latDeg, lonDeg) {
  const rho = A * SCALE * Math.pow(t(latDeg * DEG), CONE)
  const theta = CONE * (lonDeg * DEG - LAM0)
  return [rho * Math.sin(theta), RHO_EQUATOR_M - rho * Math.cos(theta)]
}

export function projectedToLatLon(x, y) {
  const dy = RHO_EQUATOR_M - y
  const rho = Math.hypot(x, dy)
  if (rho === 0) return [90, 126]
  // 타원체에서는 t → 위도가 닫힌 식이 아니다. 표준 반복법(Snyder)으로 수렴시킨다.
  const tv = Math.pow(rho / (A * SCALE), 1 / CONE)
  let phi = Math.PI / 2 - 2 * Math.atan(tv)
  for (let i = 0; i < 8; i += 1) {
    phi = Math.PI / 2 - 2 * Math.atan(tv * Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2))
  }
  return [phi / DEG, (LAM0 + Math.atan2(x, dy) / CONE) / DEG]
}

export function lonToMercatorX(lon) {
  return lon * DEG
}

export function latToMercatorY(lat) {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat))
  return Math.log(Math.tan(Math.PI / 4 + clamped * DEG / 2))
}

export function mercatorYToLat(y) {
  return Math.atan(Math.sinh(y)) / DEG
}

// 환산 결과가 이 밖으로 나가면 응답을 믿을 수 없다는 뜻 — 인천 FIR을 넉넉히 감싸는 크기.
const PLAUSIBLE_LAT = [20, 55]
const PLAUSIBLE_LON = [110, 145]
const EDGE_SAMPLES = 64

// 원추도법에서는 그림의 위·아래 변이 위도선을 따라 휜다. 네 모서리만 보면 가운데가 볼록한
// 만큼을 놓치므로 네 변을 따라가며 실제 최대·최소를 찾는다.
export function coverageBounds(projected) {
  if (!Array.isArray(projected) || projected.length !== 4 || !projected.every(Number.isFinite)) return null
  const [startX, startY, endX, endY] = projected
  if (startX === endX || startY === endY) return null

  let south = Infinity, north = -Infinity, west = Infinity, east = -Infinity
  const visit = (x, y) => {
    const [lat, lon] = projectedToLatLon(x, y)
    if (lat < south) south = lat
    if (lat > north) north = lat
    if (lon < west) west = lon
    if (lon > east) east = lon
  }
  for (let i = 0; i <= EDGE_SAMPLES; i += 1) {
    const t = i / EDGE_SAMPLES
    const x = startX + (endX - startX) * t
    const y = startY + (endY - startY) * t
    visit(x, startY)
    visit(x, endY)
    visit(startX, y)
    visit(endX, y)
  }

  const inRange = ([min, max], value) => value >= min && value <= max
  if (![south, north].every((v) => inRange(PLAUSIBLE_LAT, v))) return null
  if (![west, east].every((v) => inRange(PLAUSIBLE_LON, v))) return null
  return [[south, west], [north, east]]
}

// LCC 원본 픽셀을 메르카토르 격자로 다시 표본화한다. 바람깃·강수 경계 같은 선화라
// 최근접 표본이 맞다 — 보간하면 색 경계가 섞여 없는 강도가 만들어진다.
export function reprojectToMercator({ data, width, height }, projected, bounds) {
  const [[south, west], [north, east]] = bounds
  const [startX, startY, endX, endY] = projected
  const minY = latToMercatorY(south)
  const maxY = latToMercatorY(north)
  const minX = lonToMercatorX(west)
  const maxX = lonToMercatorX(east)
  const outW = width
  const outH = Math.max(1, Math.round(((maxY - minY) / (maxX - minX)) * outW))
  const out = Buffer.alloc(outW * outH * 4)

  for (let py = 0; py < outH; py += 1) {
    const lat = mercatorYToLat(maxY - ((py + 0.5) / outH) * (maxY - minY))
    for (let px = 0; px < outW; px += 1) {
      const lon = west + ((px + 0.5) / outW) * (east - west)
      const [x, y] = latLonToProjected(lat, lon)
      const sx = Math.floor((x - startX) / (endX - startX) * width)
      const sy = Math.floor((y - startY) / (endY - startY) * height)
      if (sx < 0 || sx >= width || sy < 0 || sy >= height) continue
      const from = (sy * width + sx) * 4
      if (data[from + 3] === 0) continue
      const to = (py * outW + px) * 4
      out[to] = data[from]
      out[to + 1] = data[from + 1]
      out[to + 2] = data[from + 2]
      out[to + 3] = data[from + 3]
    }
  }
  return { data: out, width: outW, height: outH }
}
