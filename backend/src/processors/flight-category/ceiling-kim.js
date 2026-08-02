import fs from 'node:fs'
import path from 'node:path'
import { contours } from 'd3-contour'
import { KIM_CLOUD_CONTOUR_THRESHOLD } from '../kim-cloud-threshold.js'

// 항공 ceiling 관례는 BKN(5/8) 이상. 흐린 날 표본으로 재조정할 수 있게 상수로 둔다.
export const CLD_THRESHOLD = KIM_CLOUD_CONTOUR_THRESHOLD

// 1000hPa는 평균 고도 36m로 지표에 붙어 지형 아래 격자가 많아 제외한다.
export const CEILING_SEARCH_LEVELS = [
  '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa',
]

// §172① 관제권 조건 450m(1,500ft)를 기준으로 아래·근처·위.
export const CEILING_BANDS = [
  { id: 'low', maxM: 450, color: '#dc2626' },
  { id: 'mid', maxM: 900, color: '#f97316' },
]

const M_TO_FT = 3.28084

/**
 * 운고(피트) → 밴드. 면을 그리는 `CEILING_BANDS`와 같은 경계를 쓴다.
 * 경계값이 미터이므로 반드시 환산해서 견준다 — 450/900을 피트 값과 그대로
 * 비교하면 300 m(984 ft) 운고가 'high'로 분류되어 위험이 사라진다.
 */
export function classifyCeilingFt(ceilFt) {
  // `null >= 0`은 자바스크립트에서 참이다. Number.isFinite로 걸러야 결측이
  // 'low'(최악 밴드)로 둔갑하지 않는다.
  if (!Number.isFinite(ceilFt) || ceilFt < 0) return 'missing'
  for (const band of CEILING_BANDS) {
    if (ceilFt < band.maxM * M_TO_FT) return band.id
  }
  return 'high'
}

/** 한 격자점에서 저층부터 훑어 처음 임계값을 넘는 층의 hgt(m). 없으면 null. */
export function ceilingFromLevels(levels, index) {
  for (const level of levels) {
    const c = level.cld[index]
    if (!Number.isFinite(c)) continue
    if (c >= CLD_THRESHOLD) {
      const h = level.hgt[index]
      if (Number.isFinite(h)) return h
    }
  }
  return null
}

function decodeVariable(variable) {
  if (!variable) return null
  const { scale = 1, offset = 0, values } = variable
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    out[i] = values[i] === -32768 ? Number.NaN : values[i] * scale + offset
  }
  return out
}

/** 최신 KIM run의 hf000에서 저층 cld/hgt를 읽어 운저 격자를 만든다. */
export function loadKimCeiling(root) {
  const indexPath = path.join(root, 'kim_nwp', 'index.json')
  if (!fs.existsSync(indexPath)) return null
  let index
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch {
    return null
  }
  const run = index?.latestRun
  if (!run) return null

  const runDir = path.join(root, 'kim_nwp', 'runs', `KIMG_NE57_${run}`, 'normalized', 'hf000')
  const levels = []
  let grid = null
  for (const id of CEILING_SEARCH_LEVELS) {
    const file = path.join(runDir, id, 'grid.json')
    if (!fs.existsSync(file)) continue
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const cld = decodeVariable(doc?.variables?.cld)
    const hgt = decodeVariable(doc?.variables?.hgt)
    if (!cld || !hgt) continue
    grid = grid || doc.grid
    levels.push({ id, cld, hgt })
  }
  if (!levels.length || !grid) return null

  const ceilingM = new Float32Array(levels[0].cld.length)
  for (let i = 0; i < ceilingM.length; i++) {
    const c = ceilingFromLevels(levels, i)
    ceilingM[i] = c === null ? -1 : c
  }
  return { run, grid, ceilingM }
}

export function cellToLonLat(grid, px, py) {
  const lon = grid.lonMin + (px / Math.max(grid.nx - 1, 1)) * (grid.lonMax - grid.lonMin)
  const lat = grid.latMin + (py / Math.max(grid.ny - 1, 1)) * (grid.latMax - grid.latMin)
  return [lon, lat]
}

/**
 * 위경도가 속한 격자 칸의 운저(m). 없으면 -1. `cellToLonLat`의 역이다.
 *
 * 보간하지 않는다. 운고 격자에는 -1(운저 없음)이 섞여 있어 -1과 300 m를 섞으면
 * 아무 뜻도 없는 값이 나오고, 면을 그리는 `buildCeilingGeoJson`도 칸 단위로
 * 밴드를 나누므로 보간하면 점과 면이 서로 다른 값을 말하게 된다.
 *
 * 지점 표시(stations.js)와 조회 격자(flight-category-processor.js)가 **둘 다
 * 이 함수를 쓴다.** 각자 구현하면 같은 자리에서 다른 답이 나온다.
 */
export function sampleCeilingAt(ceilingM, grid, lat, lon) {
  if (!ceilingM || !grid) return -1
  // 축이 한 칸뿐이면(폭 0) 그 축은 0번 칸이다. 나눗셈을 하면 NaN이 된다.
  const cell = (value, min, max, n) =>
    n <= 1 || !(max - min > 0) ? 0 : Math.round(((value - min) / (max - min)) * (n - 1))
  const px = cell(lon, grid.lonMin, grid.lonMax, grid.nx)
  const py = cell(lat, grid.latMin, grid.latMax, grid.ny)
  if (!(px >= 0 && px <= grid.nx - 1 && py >= 0 && py <= grid.ny - 1)) return -1
  const v = ceilingM[py * grid.nx + px]
  return v >= 0 ? v : -1
}

/**
 * 위성이 "구름 없음"이라 하는 격자의 운저를 지운다. 원본을 건드리지 않는다.
 * 면 그리기와 지점 조회가 같은 마스크를 써야 일관성을 유지한다.
 */
export function maskCeilingWithCtps(ceilingM, grid, ctpsMask) {
  const masked = Float32Array.from(ceilingM)
  if (!ctpsMask) return masked
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] < 0) continue
    const [lon, lat] = cellToLonLat(grid, i % grid.nx, Math.floor(i / grid.nx))
    if (ctpsMask.isClearAt(lat, lon)) masked[i] = -1
  }
  return masked
}

/**
 * 운저 격자 → 밴드 폴리곤.
 * 위성이 "구름 없음"이라 하는 격자는 운저를 지운다 — 한 방향 마스크.
 */
export function buildCeilingGeoJson(kimCeiling, ctpsMask) {
  if (!kimCeiling) return { type: 'FeatureCollection', features: [] }
  const { grid, ceilingM } = kimCeiling
  const masked = maskCeilingWithCtps(ceilingM, grid, ctpsMask)

  const features = []
  let lower = 0
  for (const band of CEILING_BANDS) {
    const mask = new Uint8Array(masked.length)
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] >= lower && masked[i] < band.maxM) mask[i] = 1
    }
    const [contour] = contours().size([grid.nx, grid.ny]).thresholds([0.5])(mask)
    if (contour?.coordinates?.length) {
      features.push({
        type: 'Feature',
        properties: { band: band.id, color: band.color },
        geometry: {
          type: 'MultiPolygon',
          coordinates: contour.coordinates.map((polygon) =>
            polygon.map((ring) => ring.map(([px, py]) => cellToLonLat(grid, px, py))),
          ),
        },
      })
    }
    lower = band.maxM
  }
  return { type: 'FeatureCollection', features }
}
