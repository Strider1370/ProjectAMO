import { isothermSegments, chainContourSegments } from '../../../shared/weather/gridContours.js'
import { JET_MIN_KT, TROP_BANDS, TROP_CAP_FL, TROP_CLEAR_FL, TROP_EDGE_LEVELS } from '../../../shared/weather/tropopauseJetPresentation.js'


// ISA 기압고도(100 ft 단위 FL). FL은 기압고도이므로 지오퍼텐셜고도가 아니라 기압에서 바로 환산한다.
export function pressureToFl(hPa) {
  if (!Number.isFinite(hPa) || hPa <= 0) return NaN
  const meters = hPa >= 226.32 ? 44330.8 * (1 - (hPa / 1013.25) ** 0.190263) : 11000 + 6341.6 * Math.log(226.32 / hPa)
  return meters / 0.3048 / 100
}

// 보기 시각에 가장 가까운 예보시각. 자료가 없는 시각을 다른 자료로 채우지 않는다.
export function pickTropopauseTime(times, selectedMs) {
  if (!Array.isArray(times) || !times.length) return null
  const target = Number.isFinite(selectedMs) ? selectedMs : Date.now()
  return times.reduce((best, time) => Math.abs(Date.parse(time.validTime) - target) < Math.abs(Date.parse(best.validTime) - target) ? time : best)
}

function smoothOnce(values, nx, ny) {
  const out = new Float32Array(values.length)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let sum = 0, count = 0
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const y = Math.min(ny - 1, Math.max(0, j + dj)), x = Math.min(nx - 1, Math.max(0, i + di))
      const v = values[y * nx + x]
      if (Number.isFinite(v)) { sum += v; count++ }
    }
    out[j * nx + i] = count ? sum / count : NaN
  }
  return out
}

// 지도 표시용 권계면 FL: FL450 상한을 먼저 씌운 뒤 격자 잡음만 지울 정도(3×3 평균 6회, 약 0.25°)로 평활한다.
// 더 강하게 평활하면 권계면 단절(예: FL350 → FL500)이 실제로 없는 FL380·420 띠로 번져 보인다.
// 상한 위 권계면(모델 상단 위 포함)은 상한값으로 취급하고, 판정 불가 격자는 주변 값으로 메워진다.
export function buildTropDisplayFl(field, passes = 6) {
  const { nx, ny } = field.grid
  let values = Float32Array.from(field.trop, (p, i) => field.tropAboveTop?.[i] === 1 ? TROP_CAP_FL : Math.min(pressureToFl(p), TROP_CAP_FL))
  for (let n = 0; n < passes; n++) values = smoothOnce(values, nx, ny)
  return values
}

export function tropBandColor(fl) {
  if (!Number.isFinite(fl) || fl >= TROP_CLEAR_FL) return null
  return TROP_BANDS.find(band => fl >= band.from && fl < band.to)?.color ?? null
}

const hexRgb = hex => [1, 3, 5].map(k => Number.parseInt(hex.slice(k, k + 2), 16))

const mercatorY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
const latFromMercatorY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI

// Mapbox 이미지 소스는 네 모서리 사이를 지도 투영 좌표에서 선형으로 편다.
// 각 픽셀 중심의 Mercator 위도를 원 격자에 역투영해 경계선(map.project)과 면색을 맞춘다.
export function buildTropJetRaster(field, displayFl, scale = 4) {
  const { nx, ny, latMin, latMax } = field.grid
  const width = nx * scale, height = ny * scale
  const top = mercatorY(latMax), bottom = mercatorY(latMin)
  const data = new Uint8ClampedArray(width * height * 4)
  const sample = (values, gx, gy) => {
    const i = Math.min(nx - 2, Math.max(0, Math.floor(gx))), j = Math.min(ny - 2, Math.max(0, Math.floor(gy)))
    const fx = Math.min(1, Math.max(0, gx - i)), fy = Math.min(1, Math.max(0, gy - j))
    const a = values[j * nx + i], b = values[j * nx + i + 1], c = values[(j + 1) * nx + i], d = values[(j + 1) * nx + i + 1]
    if (![a, b, c, d].every(Number.isFinite)) return values[Math.round(gy) * nx + Math.round(gx)]
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
  }
  const rgbCache = new Map()
  for (let y = 0; y < height; y++) {
    const lat = latFromMercatorY(top - (y + 0.5) / height * (top - bottom))
    const gy = Math.min(ny - 1, Math.max(0, (lat - latMin) / (latMax - latMin) * (ny - 1)))
    for (let x = 0; x < width; x++) {
      const gx = (x + 0.5) / width * (nx - 1), o = (y * width + x) * 4
      const color = tropBandColor(sample(displayFl, gx, gy))
      if (color) {
        if (!rgbCache.has(color)) rgbCache.set(color, hexRgb(color))
        const [r, g, b] = rgbCache.get(color)
        data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 150
      }
    }
  }
  return { width, height, data }
}

function lines(field, values, level) {
  const { nx, ny, lonMin, latMin, lonMax, latMax } = field.grid
  const xs = Array.from({ length: nx }, (_, i) => lonMin + (lonMax - lonMin) * i / (nx - 1))
  const ys = Array.from({ length: ny }, (_, j) => latMin + (latMax - latMin) * j / (ny - 1))
  return chainContourSegments(isothermSegments({ nx, ny, values, xs, ys }, level)).map(chain => chain.map(p => [p.x, p.y]))
}

// 권계면 단계 경계선(TROP 라벨 위치).
export function buildTropEdges(field, displayFl) {
  return TROP_EDGE_LEVELS.map(level => ({ level, lines: lines(field, displayFl, level === TROP_CAP_FL ? TROP_CLEAR_FL : level) }))
}

export function sampleField(field, name, lon, lat) {
  const { nx, ny, lonMin, latMin, lonMax, latMax } = field.grid
  const i = Math.round((lon - lonMin) / (lonMax - lonMin) * (nx - 1)), j = Math.round((lat - latMin) / (latMax - latMin) * (ny - 1))
  if (i < 0 || j < 0 || i >= nx || j >= ny) return null
  const v = field[name]?.[j * nx + i]
  return Number.isFinite(v) ? v : null
}

const distanceKm = ([lo1, la1], [lo2, la2]) => Math.hypot((lo2 - lo1) * 111.2 * Math.cos((la1 + la2) / 2 * Math.PI / 180), (la2 - la1) * 111.2)

// SIGWX 규칙: 핵 지점 + 직전 깃보다 풍속 ±20 kt 또는 고도 ±3,000 ft 바뀐 지점, 깃 사이 최소 400 km.
// 화살촉과 겹치지 않게 축 끝 130 km 안의 깃은 뒤로 물린다. 값은 그 지점의 원 격자 최대풍.
export function pickJetBarbs(field, jet, { minSpacingKm = 400, endKm = 130 } = {}) {
  const pts = jet.coordinates
  if (!Array.isArray(pts) || pts.length < 2) return []
  const cum = [0]
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + distanceKm(pts[k - 1], pts[k]))
  const total = cum.at(-1)
  const valueAt = k => ({ kt: sampleField(field, 'vmax', ...pts[k]), fl: pressureToFl(sampleField(field, 'pmax', ...pts[k])) })
  let coreK = 0
  pts.forEach((p, k) => { if (distanceKm(p, [jet.core.lon, jet.core.lat]) < distanceKm(pts[coreK], [jet.core.lon, jet.core.lat])) coreK = k })
  const core = { k: coreK, kt: jet.core.speedKt, fl: pressureToFl(jet.core.pressureHpa), layer: jet.core.layer80KtHpa?.map(pressureToFl) ?? null, core: true }
  const picks = [core]
  for (const dir of [-1, 1]) {
    let last = core
    for (let k = coreK + dir; k >= 0 && k < pts.length; k += dir) {
      if (Math.abs(cum[k] - cum[last.k]) < minSpacingKm || total - cum[k] < endKm || cum[k] < 60) continue
      const v = valueAt(k)
      if (!Number.isFinite(v.kt) || v.kt < JET_MIN_KT || !Number.isFinite(v.fl)) continue
      if (Math.abs(v.kt - last.kt) >= 20 || Math.abs(v.fl - last.fl) >= 30) { last = { k, ...v, core: false }; picks.push(last) }
    }
  }
  return picks.map(pick => {
    let k = pick.k
    if (total - cum[k] < endKm) k = Math.max(0, cum.findIndex(c => c >= total - endKm))
    return { ...pick, k, coordinates: pts[k], speedKt: Math.round(pick.kt / 5) * 5, flightLevel: Math.round(pick.fl / 10) * 10,
      layerLabel: pick.core && pick.layer?.every(Number.isFinite) ? `${Math.round(pick.layer[0] / 10) * 10}/${Math.round(pick.layer[1] / 10) * 10}` : null }
  })
}

// 렌더러에 넘길 한 시각의 표출 모델.
export function buildTropopauseJetModel(field) {
  if (!field?.grid?.nx || !Array.isArray(field.trop)) return null
  const displayFl = buildTropDisplayFl(field)
  return {
    key: `${field.time.tmfc}:${field.time.hf}:${field.revision}`,
    grid: field.grid,
    raster: buildTropJetRaster(field, displayFl),
    edges: buildTropEdges(field, displayFl),
    // 제트는 축 선과 가장 센 지점의 깃·FL 하나만 표시한다(강풍역 면·80 kt 선은 고도 정보가 없어 생략).
    jets: field.jets.filter(jet => jet.axisShown).map(jet => ({ ...jet, barbs: pickJetBarbs(field, jet).filter(barb => barb.core),
      // 화면에 핵·변화 지점이 없을 때 쓸 축 위 원 격자 최대풍(렌더러가 보이는 구간 최대에 깃을 하나 둔다).
      samples: jet.coordinates.map(([lon, lat]) => ({ kt: sampleField(field, 'vmax', lon, lat), fl: pressureToFl(sampleField(field, 'pmax', lon, lat)) })) })),
    checks: field.checks,
  }
}

// 지점 조회: 원 격자 값(평활하지 않음).
export function describeTropopauseJetPoint(field, lon, lat) {
  if (!field) return null
  const i = (() => {
    const { nx, ny, lonMin, latMin, lonMax, latMax } = field.grid
    const x = Math.round((lon - lonMin) / (lonMax - lonMin) * (nx - 1)), y = Math.round((lat - latMin) / (latMax - latMin) * (ny - 1))
    return x < 0 || y < 0 || x >= nx || y >= ny ? null : y * nx + x
  })()
  if (i == null) return null
  const above = field.tropAboveTop?.[i] === 1
  const fl = pressureToFl(field.trop[i])
  return {
    tropopause: above ? { aboveTop: true } : Number.isFinite(fl) ? { flightLevel: Math.round(fl), temperatureC: field.tropT[i] } : { unavailable: true },
    maxWind: Number.isFinite(field.vmax[i]) ? { speedKt: Math.round(field.vmax[i]), flightLevel: Math.round(pressureToFl(field.pmax[i])) } : null,
  }
}
