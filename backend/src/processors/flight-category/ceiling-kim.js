import fs from 'node:fs'
import path from 'node:path'
import { contours } from 'd3-contour'

// 항공 ceiling 관례는 BKN(5/8) 이상. 흐린 날 표본으로 재조정할 수 있게 상수로 둔다.
export const CLD_THRESHOLD = 0.6

// 1000hPa는 평균 고도 36m로 지표에 붙어 지형 아래 격자가 많아 제외한다.
export const CEILING_SEARCH_LEVELS = [
  '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa',
]

// §172① 관제권 조건 450m(1,500ft)를 기준으로 아래·근처·위.
export const CEILING_BANDS = [
  { id: 'low', maxM: 450, color: '#dc2626' },
  { id: 'mid', maxM: 900, color: '#f97316' },
]

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
