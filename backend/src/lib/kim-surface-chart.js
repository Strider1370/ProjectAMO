// KIM 지상 일기도 계산: 해면기압 등압선·H/L 중심, 3시간 강수 그림, 지상바람 격자.
// 입력은 넓은 수집 영역의 KIM 1/12° 격자이고, 출력은 표시 영역(view)으로 자른다.
// 근거와 기준값: docs/design/proposals/2026-09-22-kim-surface-chart.md
//  - 등압선: WPC Unified Surface Analysis Manual(4 hPa 기본, 2 hPa 보조), marching squares(@turf/turf)
//  - H/L: CycloneDetector(Prantl et al. 2022)의 가장 안쪽 닫힌 등압선 + 면적 필터로 후보를 뽑고,
//         TempestExtremes의 closed contour 기준(대권거리 6° 안에서 1 hPa)으로 확인한다. 표고 필터는 두지 않는다.
import * as turf from '@turf/turf'
import sharp from 'sharp'

import { KIM_SURFACE_CHART_PRECIP_RAMP } from '../../../shared/kim-surface-chart.js'

export const KIM_MISSING_VALUE = -99999

export const SURFACE_CHART_RULES = Object.freeze({
  coarseStep: 3, // 1/12° → 0.25°
  gaussianSigmaCells: 2, // 0.5° — H/L 판정용
  // 등압선은 사람이 그린 일기도처럼 완만해야 해서 더 세게 평활하고, 격자 모서리를 다듬고, 작은 고리를 뺀다.
  isobarSigmaCells: 6, // 1.5°
  isobarChaikinPasses: 2,
  isobarMinLoopDeg: 1.5,
  isobarSimplifyDeg: 0.01,
  isobarStepHpa: 2,
  majorStepHpa: 4,
  closedContourDeltaHpa: 1,
  closedContourDistDeg: 6,
  candidateAreaKm2: 10_000,
  parentAreaMultiple: 100,
  maxCentersPerKind: 20,
  centerPressureRadiusDeg: 1,
  windStepDeg: 0.25,
  precipImageWidth: 1400,
  precipImageHeight: 1000,
  precipEdgeFadeDeg: 1,
})

export const PRECIP_3H_RAMP = KIM_SURFACE_CHART_PRECIP_RAMP

const DEG = Math.PI / 180

export function greatCircleDeg(lon1, lat1, lon2, lat2) {
  const dLat = (lat2 - lat1) * DEG
  const dLon = (lon2 - lon1) * DEG
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLon / 2) ** 2
  return (2 * Math.asin(Math.min(1, Math.sqrt(h)))) / DEG
}

// 파싱한 KIM 격자를 좌표가 붙은 격자로 만든다. 값 순서는 남쪽 행(j=1)부터다.
export function toChartGrid(parsed, { grid, missingRatioMax = 0.01, name = parsed?.variable } = {}) {
  if (!parsed || parsed.nx !== grid.nx || parsed.ny !== grid.ny || parsed.values?.length !== grid.nx * grid.ny) {
    throw new Error(`kim_surface_chart_grid_shape:${name}`)
  }
  const values = new Float64Array(parsed.values.length)
  let missing = 0
  for (let k = 0; k < values.length; k += 1) {
    const value = parsed.values[k]
    if (value === KIM_MISSING_VALUE || !Number.isFinite(value)) { values[k] = Number.NaN; missing += 1 } else values[k] = value
  }
  if (missing / values.length > missingRatioMax) throw new Error(`kim_surface_chart_missing:${name}`)
  return { nx: grid.nx, ny: grid.ny, lonMin: grid.lonMin, latMin: grid.latMin, step: grid.step, values }
}

export function assertSeaLevelPressure(grid) {
  for (const value of grid.values) {
    if (Number.isNaN(value)) throw new Error('kim_surface_chart_psl_missing')
    if (value < 87_000 || value > 109_000) throw new Error('kim_surface_chart_psl_range')
  }
}

function valueAt(grid, lon, lat) {
  const i = Math.round((lon - grid.lonMin) / grid.step)
  const j = Math.round((lat - grid.latMin) / grid.step)
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return Number.NaN
  return grid.values[j * grid.nx + i]
}

function bilinearAt(grid, lon, lat) {
  const x = (lon - grid.lonMin) / grid.step
  const y = (lat - grid.latMin) / grid.step
  if (x < 0 || y < 0 || x > grid.nx - 1 || y > grid.ny - 1) return Number.NaN
  const i0 = Math.min(Math.floor(x), grid.nx - 2)
  const j0 = Math.min(Math.floor(y), grid.ny - 2)
  const tx = x - i0
  const ty = y - j0
  const v = (i, j) => grid.values[j * grid.nx + i]
  const top = v(i0, j0) + (v(i0 + 1, j0) - v(i0, j0)) * tx
  const bottom = v(i0, j0 + 1) + (v(i0 + 1, j0 + 1) - v(i0, j0 + 1)) * tx
  return top + (bottom - top) * ty
}

// 해면기압(Pa)을 step칸 블록 평균해 hPa 격자로 줄이고 가우시안으로 평활화한다.
export function buildPressureField(psl, rules = SURFACE_CHART_RULES) {
  const step = rules.coarseStep
  const nx = Math.floor(psl.nx / step)
  const ny = Math.floor(psl.ny / step)
  const offset = (psl.step * (step - 1)) / 2
  const values = new Float64Array(nx * ny)
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    let sum = 0
    for (let b = 0; b < step; b += 1) for (let a = 0; a < step; a += 1) sum += psl.values[(j * step + b) * psl.nx + i * step + a]
    values[j * nx + i] = sum / (step * step) / 100
  }
  const field = { nx, ny, lonMin: psl.lonMin + offset, latMin: psl.latMin + offset, step: psl.step * step, values }
  return { ...field, values: gaussianSmooth(field, rules.gaussianSigmaCells) }
}

export function gaussianSmooth(field, sigma) {
  const radius = Math.ceil(sigma * 3)
  const weights = []
  for (let t = -radius; t <= radius; t += 1) weights.push(Math.exp(-(t * t) / (2 * sigma * sigma)))
  const pass = (input, horizontal) => {
    const output = new Float64Array(input.length)
    for (let j = 0; j < field.ny; j += 1) for (let i = 0; i < field.nx; i += 1) {
      let sum = 0
      let weight = 0
      for (let t = -radius; t <= radius; t += 1) {
        const x = horizontal ? i + t : i
        const y = horizontal ? j : j + t
        if (x < 0 || y < 0 || x >= field.nx || y >= field.ny) continue // 가장자리는 있는 칸만으로 정규화
        sum += input[y * field.nx + x] * weights[t + radius]
        weight += weights[t + radius]
      }
      output[j * field.nx + i] = sum / weight
    }
    return output
  }
  return pass(pass(field.values, true), false)
}

const lonOf = (field, i) => field.lonMin + i * field.step
const latOf = (field, j) => field.latMin + j * field.step

function pointGrid(field) {
  const points = []
  for (let j = 0; j < field.ny; j += 1) for (let i = 0; i < field.nx; i += 1) {
    points.push(turf.point([lonOf(field, i), latOf(field, j)], { p: field.values[j * field.nx + i] }))
  }
  return turf.featureCollection(points)
}

function isobarLevels(field, stepHpa) {
  let min = Infinity
  let max = -Infinity
  for (const value of field.values) { min = Math.min(min, value); max = Math.max(max, value) }
  const levels = []
  for (let level = Math.ceil(min / stepHpa) * stepHpa; level <= max; level += stepHpa) levels.push(level)
  return levels
}

function isInView(view, lon, lat) {
  return lon >= view.lonMin && lon <= view.lonMax && lat >= view.latMin && lat <= view.latMax
}

function roundCoord([lon, lat]) {
  return [Math.round(lon * 1000) / 1000, Math.round(lat * 1000) / 1000]
}

// Chaikin 모서리 깎기. 닫힌 선은 이음매까지 순환으로 다듬는다.
export function smoothLine(points, passes) {
  if (points.length < 3 || passes <= 0) return points
  const closed = points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]
  let line = closed ? points.slice(0, -1) : points
  for (let pass = 0; pass < passes; pass += 1) {
    const out = closed ? [] : [line[0]]
    const segments = closed ? line.length : line.length - 1
    for (let i = 0; i < segments; i += 1) {
      const a = line[i]
      const b = line[(i + 1) % line.length]
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    if (!closed) out.push(line.at(-1))
    line = out
  }
  return closed ? [...line, line[0]] : line
}

function isClosedLine(line) {
  return line.length > 3 && Math.hypot(line[0][0] - line.at(-1)[0], line[0][1] - line.at(-1)[1]) < 1e-9
}

export function buildIsobars(field, view, { points = pointGrid(field), rules = SURFACE_CHART_RULES } = {}) {
  const lines = turf.isolines(points, isobarLevels(field, rules.isobarStepHpa), { zProperty: 'p' })
  const bbox = [view.lonMin, view.latMin, view.lonMax, view.latMax]
  const features = []
  for (const feature of lines.features) {
    const pressure = feature.properties.p
    for (const rawLine of feature.geometry.coordinates) {
      if (rawLine.length < 2) continue
      if (isClosedLine(rawLine) && rules.isobarMinLoopDeg) {
        const [west, south, east, north] = turf.bbox(turf.lineString(rawLine))
        if (Math.max(east - west, north - south) < rules.isobarMinLoopDeg) continue
      }
      const line = smoothLine(rawLine, rules.isobarChaikinPasses || 0)
      const clipped = turf.bboxClip(turf.lineString(line), bbox).geometry
      const parts = clipped.type === 'LineString' ? [clipped.coordinates] : clipped.coordinates
      for (const part of parts) {
        if (part.length < 2) continue
        // 다듬으며 늘어난 점을 약 1 km 오차 안에서 줄인다(모양은 그대로, 파일 크기는 줄어든다).
        const simplified = turf.simplify(turf.lineString(part), { tolerance: rules.isobarSimplifyDeg ?? 0, highQuality: false })
        features.push(turf.lineString(simplified.geometry.coordinates.map(roundCoord), { p: pressure, major: pressure % rules.majorStepHpa === 0 }))
      }
    }
  }
  return turf.featureCollection(features)
}

// TempestExtremes closed contour: 중심에서 채워 나가 기준값(중심 ± delta)을 넘기 전에
// 거리 한계나 격자 경계에 닿으면 닫히지 않은 것이다.
export function hasClosedContour(field, kind, i0, j0, { deltaHpa, distDeg }) {
  const center = field.values[j0 * field.nx + i0]
  const lon0 = lonOf(field, i0)
  const lat0 = latOf(field, j0)
  const inside = kind === 'L' ? (value) => value < center + deltaHpa : (value) => value > center - deltaHpa
  const seen = new Uint8Array(field.nx * field.ny)
  const stack = [[i0, j0]]
  seen[j0 * field.nx + i0] = 1
  while (stack.length) {
    const [i, j] = stack.pop()
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = i + a
      const y = j + b
      if (x < 0 || y < 0 || x >= field.nx || y >= field.ny) return false
      const index = y * field.nx + x
      if (seen[index]) continue
      seen[index] = 1
      if (!inside(field.values[index])) continue
      if (greatCircleDeg(lon0, lat0, lonOf(field, x), latOf(field, y)) > distDeg) return false
      stack.push([x, y])
    }
  }
  return true
}

function aabbAreaKm2(bbox) {
  const midLat = (bbox[1] + bbox[3]) / 2
  const width = greatCircleDeg(bbox[0], midLat, bbox[2], midLat) * 111.2
  const height = (bbox[3] - bbox[1]) * 111.2
  return width * height
}

function closedRings(field, points, rules) {
  const lines = turf.isolines(points, isobarLevels(field, rules.isobarStepHpa), { zProperty: 'p' })
  const rings = []
  for (const feature of lines.features) for (const line of feature.geometry.coordinates) {
    const first = line[0]
    const last = line[line.length - 1]
    // 수집 영역 경계에서 열린 등압선은 닫힌 계가 아니므로 후보에서 뺀다.
    if (line.length < 4 || Math.hypot(first[0] - last[0], first[1] - last[1]) > 1e-9) continue
    const polygon = turf.polygon([line])
    const bbox = turf.bbox(polygon)
    rings.push({ level: feature.properties.p, polygon, bbox, area: aabbAreaKm2(bbox), sample: line[0] })
  }
  return rings
}

function ringContains(outer, inner) {
  return outer !== inner
    && inner.bbox[0] >= outer.bbox[0] && inner.bbox[2] <= outer.bbox[2]
    && inner.bbox[1] >= outer.bbox[1] && inner.bbox[3] <= outer.bbox[3]
    && turf.booleanPointInPolygon(turf.point(inner.sample), outer.polygon)
}

function rawCenterPressure(psl, kind, lon, lat, radiusDeg) {
  const ci = Math.round((lon - psl.lonMin) / psl.step)
  const cj = Math.round((lat - psl.latMin) / psl.step)
  const radius = Math.round(radiusDeg / psl.step)
  let best = kind === 'L' ? Infinity : -Infinity
  for (let b = -radius; b <= radius; b += 1) for (let a = -radius; a <= radius; a += 1) {
    const x = ci + a
    const y = cj + b
    if (x < 0 || y < 0 || x >= psl.nx || y >= psl.ny) continue
    const value = psl.values[y * psl.nx + x] / 100
    best = kind === 'L' ? Math.min(best, value) : Math.max(best, value)
  }
  return best
}

// CycloneDetector 후보(가장 안쪽 닫힌 등압선, 면적 미만은 부모로 승격) → 안쪽 극값 → TE 닫힘 확인.
export function detectPressureCenters(field, psl, view, { points = pointGrid(field), rules = SURFACE_CHART_RULES } = {}) {
  const rings = closedRings(field, points, rules)
  for (const ring of rings) {
    ring.childCount = rings.filter((other) => ringContains(ring, other)).length
    ring.parent = rings.filter((other) => ringContains(other, ring)).sort((a, b) => a.area - b.area)[0] || null
  }
  const promoted = new Set()
  for (let ring of rings.filter((item) => item.childCount === 0)) {
    while (ring && ring.area < rules.candidateAreaKm2) {
      ring = ring.parent && ring.parent.area < rules.parentAreaMultiple * rules.candidateAreaKm2 ? ring.parent : null
    }
    if (ring) promoted.add(ring)
  }
  const candidates = [...promoted].filter((ring) => ![...promoted].some((other) => ringContains(ring, other)))

  const centers = []
  for (const ring of candidates) {
    let low = { value: Infinity }
    let high = { value: -Infinity }
    for (let j = 0; j < field.ny; j += 1) {
      const lat = latOf(field, j)
      if (lat < ring.bbox[1] || lat > ring.bbox[3]) continue
      for (let i = 0; i < field.nx; i += 1) {
        const lon = lonOf(field, i)
        if (lon < ring.bbox[0] || lon > ring.bbox[2]) continue
        if (!turf.booleanPointInPolygon([lon, lat], ring.polygon)) continue
        const value = field.values[j * field.nx + i]
        if (value < low.value) low = { value, i, j }
        if (value > high.value) high = { value, i, j }
      }
    }
    if (!Number.isFinite(low.value)) continue
    const kind = ring.level - low.value > high.value - ring.level ? 'L' : 'H'
    const extreme = kind === 'L' ? low : high
    const lon = lonOf(field, extreme.i)
    const lat = latOf(field, extreme.j)
    if (!isInView(view, lon, lat)) continue
    if (!hasClosedContour(field, kind, extreme.i, extreme.j, { deltaHpa: rules.closedContourDeltaHpa, distDeg: rules.closedContourDistDeg })) continue
    centers.push({
      kind,
      lon: Math.round(lon * 100) / 100,
      lat: Math.round(lat * 100) / 100,
      pressureHpa: Math.round(rawCenterPressure(psl, kind, lon, lat, rules.centerPressureRadiusDeg)),
      smoothedHpa: extreme.value,
    })
  }
  // GEMPAK HILO처럼 종류별 표시 개수에 상한을 둔다. 강한 계부터 남긴다.
  const limit = (kind) => centers
    .filter((center) => center.kind === kind)
    .sort((a, b) => (kind === 'L' ? a.smoothedHpa - b.smoothedHpa : b.smoothedHpa - a.smoothedHpa))
    .slice(0, rules.maxCentersPerKind)
  return [...limit('H'), ...limit('L')].map(({ smoothedHpa: _drop, ...center }) => center)
}

export function precipColor(mm) {
  let color = null
  for (const [threshold, rgb] of PRECIP_3H_RAMP) if (mm >= threshold) color = rgb
  return color
}

const mercatorY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2))
const latFromMercatorY = (y) => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / DEG

// 3시간 강수(mm)를 Web Mercator 위도 간격 PNG로 그린다. Mapbox 이미지 소스가 네 모서리 사이를
// 선형으로 펴므로 등간격 위도 그림을 쓰면 남북으로 어긋난다. 표시 영역 가장자리 1°는 서서히 투명해진다.
export async function buildPrecipImage(precNow, precPrev, view, rules = SURFACE_CHART_RULES) {
  const width = rules.precipImageWidth
  const height = rules.precipImageHeight
  const top = mercatorY(view.latMax)
  const bottom = mercatorY(view.latMin)
  const rgba = Buffer.alloc(width * height * 4)
  let maxMm = 0
  for (let py = 0; py < height; py += 1) {
    const lat = latFromMercatorY(top - ((py + 0.5) / height) * (top - bottom))
    for (let px = 0; px < width; px += 1) {
      const lon = view.lonMin + ((px + 0.5) / width) * (view.lonMax - view.lonMin)
      const now = bilinearAt(precNow, lon, lat)
      const prev = precPrev ? bilinearAt(precPrev, lon, lat) : 0
      const mm = Math.max(0, now - prev)
      if (!Number.isFinite(mm)) continue
      maxMm = Math.max(maxMm, mm)
      const color = precipColor(mm)
      if (!color) continue
      const edge = Math.min(lon - view.lonMin, view.lonMax - lon, lat - view.latMin, view.latMax - lat)
      const fade = Math.max(0, Math.min(1, edge / rules.precipEdgeFadeDeg))
      const offset = (py * width + px) * 4
      rgba[offset] = color[0]
      rgba[offset + 1] = color[1]
      rgba[offset + 2] = color[2]
      rgba[offset + 3] = Math.round(255 * fade)
    }
  }
  const png = await sharp(rgba, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()
  return { png, maxMm: Math.round(maxMm * 10) / 10, width, height }
}

// 지상바람을 표시 영역의 0.25° 격자로 줄인다(3×3 평균). 기존 바람 필드 형식(grid·u·v, m/s)을 따른다.
export function buildWindField(u, v, view, rules = SURFACE_CHART_RULES) {
  const step = rules.windStepDeg
  const nx = Math.round((view.lonMax - view.lonMin) / step) + 1
  const ny = Math.round((view.latMax - view.latMin) / step) + 1
  const average = (grid, lon, lat) => {
    let sum = 0
    let count = 0
    for (let b = -1; b <= 1; b += 1) for (let a = -1; a <= 1; a += 1) {
      const value = valueAt(grid, lon + a * grid.step, lat + b * grid.step)
      if (Number.isFinite(value)) { sum += value; count += 1 }
    }
    return count ? Math.round((sum / count) * 10) / 10 : null
  }
  const uValues = []
  const vValues = []
  for (let j = 0; j < ny; j += 1) for (let i = 0; i < nx; i += 1) {
    const lon = view.lonMin + i * step
    const lat = view.latMin + j * step
    uValues.push(average(u, lon, lat))
    vValues.push(average(v, lon, lat))
  }
  return {
    grid: { lonMin: view.lonMin, lonMax: view.lonMax, latMin: view.latMin, latMax: view.latMax, nx, ny, dx: step, dy: step },
    unit: 'm/s',
    u: uValues,
    v: vValues,
  }
}

export async function buildSurfaceChartFrame({ psl, precNow, precPrev = null, u, v, view, rules = SURFACE_CHART_RULES }) {
  assertSeaLevelPressure(psl)
  const pressure = buildPressureField(psl, rules)
  const isobarField = buildPressureField(psl, { ...rules, gaussianSigmaCells: rules.isobarSigmaCells ?? rules.gaussianSigmaCells })
  const isobars = buildIsobars(isobarField, view, { rules })
  const centers = detectPressureCenters(pressure, psl, view, { rules })
  const precip = await buildPrecipImage(precNow, precPrev, view, rules)
  const wind = buildWindField(u, v, view, rules)
  return { isobars, centers: turf.featureCollection(centers.map(({ lon, lat, ...rest }) => turf.point([lon, lat], rest))), precip, wind }
}
