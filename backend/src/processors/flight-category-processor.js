import config from '../config.js'
import store from '../store.js'
import { idwInterpolate } from '../lib/idw.js'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { ctpsIndexForLatLon } from '../lib/ctps-grid.js'
import { parseCtpsNC } from '../parsers/satellite-parser.js'
import { contours } from 'd3-contour'
import { simplify } from '@turf/simplify'

const CTH_FILL = 65535

// ─── 분류 상수 ────────────────────────────────────────────────
export const CATEGORY_COLORS = { VFR: '#15803d', IFR: '#f97316', LIFR: '#dc2626' }
const RANK = { VFR: 0, IFR: 1, LIFR: 2 }
const BY_RANK = ['VFR', 'IFR', 'LIFR']

// ─── 순수 함수 ────────────────────────────────────────────────

export function worstCategory(a, b) {
  return BY_RANK[Math.max(RANK[a], RANK[b])]
}

export function classifyFlightCategory(vis_m, ceil_ft) {
  // Negative = fill / no-data sentinel. Treated as unlimited (VFR) by design:
  //   vis: parser maps fill -999 → -1.
  //   ceil: IDW fallback fills with -1 when zero AMOS points are available.
  //   CTH masking independently overrides ceil to 99999 where sky is confirmed clear.
  const vc = vis_m < 0 ? 'VFR' : vis_m < 800 ? 'LIFR' : vis_m < 5000 ? 'IFR' : 'VFR'
  const cc = ceil_ft < 0 ? 'VFR' : ceil_ft < 500 ? 'LIFR' : ceil_ft < 1500 ? 'IFR' : 'VFR'
  return worstCategory(vc, cc)
}

export const cthIndexToPixel = ctpsIndexForLatLon

// ─── CTH lookup table ─────────────────────────────────────────
// Maps each SFC pixel index → CTH flat index (-1 = outside CTH domain).
// Built once on first use: 4.2 M LCC projections up-front so buildCategoryGrid
// only does a single Int32Array read per pixel instead of a trig projection.

let _cthLookup = null

function getCthLookup() {
  if (_cthLookup) return _cthLookup
  _cthLookup = new Int32Array(SFC_W * SFC_H)
  for (let i = 0; i < _cthLookup.length; i++) {
    const row = Math.floor(i / SFC_W), col = i % SFC_W
    const { lat, lon } = sfcPixelToLatLon(col, row)
    const idx = cthIndexToPixel(lat, lon)
    _cthLookup[i] = idx !== null ? idx : -1
  }
  return _cthLookup
}

// ─── 파이프라인 내부 함수 ─────────────────────────────────────

function formatKstTm(offsetMs = 0) {
  const kst = new Date(Date.now() - offsetMs + 9 * 3600 * 1000)
  kst.setUTCMinutes(Math.floor(kst.getUTCMinutes() / 10) * 10, 0, 0)
  return kst.getUTCFullYear().toString()
    + String(kst.getUTCMonth() + 1).padStart(2, '0')
    + String(kst.getUTCDate()).padStart(2, '0')
    + String(kst.getUTCHours()).padStart(2, '0')
    + String(kst.getUTCMinutes()).padStart(2, '0')
}

function formatUtcTm(offsetMs = 0) {
  const d = new Date(Date.now() - offsetMs)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0)
  return d.getUTCFullYear().toString()
    + String(d.getUTCMonth() + 1).padStart(2, '0')
    + String(d.getUTCDate()).padStart(2, '0')
    + String(d.getUTCHours()).padStart(2, '0')
    + String(d.getUTCMinutes()).padStart(2, '0')
}

async function withTimeout(fn, ms = config.flight_category.timeout_ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await fn(controller.signal) } finally { clearTimeout(timer) }
}

async function fetchSfcVis() {
  const tm = formatKstTm(10 * 60 * 1000)
  const url = `${config.flight_category.sfc_vis_url}?obs=vs&tm=${tm}&disp=A&authKey=${config.api.auth_key}`
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`sfc_vis HTTP ${res.status}`)
    const text = await res.text()
    if (text.includes('data_read: error')) throw new Error('sfc_vis: data_read error')
    return parseSfcAscii(text)
  })
}

async function fetchCtps() {
  const tm = formatUtcTm(20 * 60 * 1000)
  const url = `${config.flight_category.ctps_url}?date=${tm}&authKey=${config.api.radar_satellite_auth_key}`
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`CTPS HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return parseCthBuffer(buf)
  })
}

async function parseCthBuffer(buf) {
  return (await parseCtpsNC(buf)).cth
}

function getAmosCeilingPoints() {
  const amos = store.getCached('amos')
  if (!amos?.airports) return []
  const points = []
  for (const [icao, data] of Object.entries(amos.airports)) {
    const ceilM = data?.observation?.cloud_min_m
    if (ceilM == null || ceilM >= 25000) continue  // 25000 = NSC sentinel
    const airport = config.airports.find(a => a.icao === icao)
    if (!airport?.lat || !airport?.lon) continue
    points.push({
      x: (airport.lon - 120.67) / (133.07 - 120.67),
      y: (40.35 - airport.lat) / (40.35 - 30.74),
      value: ceilM * 3.281,  // m → ft
    })
  }
  return points
}

function bilinearUpscale(src, srcSize, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH)
  const sx = srcSize / dstW, sy = srcSize / dstH
  for (let r = 0; r < dstH; r++) {
    for (let c = 0; c < dstW; c++) {
      const fx = c * sx, fy = r * sy
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, srcSize - 1), y1 = Math.min(y0 + 1, srcSize - 1)
      const dx = fx - x0, dy = fy - y0
      dst[r * dstW + c] =
        src[y0 * srcSize + x0] * (1 - dx) * (1 - dy) +
        src[y0 * srcSize + x1] * dx * (1 - dy) +
        src[y1 * srcSize + x0] * (1 - dx) * dy +
        src[y1 * srcSize + x1] * dx * dy
    }
  }
  return dst
}

function buildCategoryGrid(visGrid, ceilGrid, cthRaw) {
  const cat = new Uint8Array(SFC_W * SFC_H)
  const lookup = cthRaw ? getCthLookup() : null
  for (let i = 0; i < cat.length; i++) {
    let ceil_ft = ceilGrid[i]
    if (lookup) {
      const cthIdx = lookup[i]
      const cthVal = cthIdx >= 0 ? cthRaw[cthIdx] : CTH_FILL
      if (cthVal === CTH_FILL || cthVal === 0) ceil_ft = 99999  // CLEAR
    }
    cat[i] = RANK[classifyFlightCategory(visGrid[i], ceil_ft)]
  }
  return cat
}

const QUERY_GRID_SIZE = 128

function buildQueryGrids(visGrid, ceilFull, cthRaw) {
  const lookup = cthRaw ? getCthLookup() : null
  const vis = new Float32Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)
  const ceil = new Float32Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)
  for (let qr = 0; qr < QUERY_GRID_SIZE; qr++) {
    for (let qc = 0; qc < QUERY_GRID_SIZE; qc++) {
      const sr = Math.round(qr * (SFC_H - 1) / (QUERY_GRID_SIZE - 1))
      const sc = Math.round(qc * (SFC_W - 1) / (QUERY_GRID_SIZE - 1))
      const i = sr * SFC_W + sc
      vis[qr * QUERY_GRID_SIZE + qc] = visGrid[i]
      let ceil_ft = ceilFull[i]
      if (lookup) {
        const cthIdx = lookup[i]
        const cthVal = cthIdx >= 0 ? cthRaw[cthIdx] : CTH_FILL
        if (cthVal === CTH_FILL || cthVal === 0) ceil_ft = 99999
      }
      ceil[qr * QUERY_GRID_SIZE + qc] = ceil_ft
    }
  }
  return { vis: Array.from(vis), ceil_ft: Array.from(ceil) }
}

function pixelToLonLat(px, py) {
  const LON_MIN = 120.67, LON_MAX = 133.07
  const LAT_MAX = 40.35
  const LAT_MIN = 30.74
  return [
    LON_MIN + (px / (SFC_W - 1)) * (LON_MAX - LON_MIN),
    LAT_MAX - (py / (SFC_H - 1)) * (LAT_MAX - LAT_MIN),
  ]
}

function categoryGridToGeoJson(catGrid) {
  // Per-category binary masks — one d3-contour pass per category.
  //
  // Why not thresholds([0.5, 1.5]) on the full grid?
  //   d3-contour threshold T produces polygons where value ≥ T.
  //   At T=0.5 that captures RANK≥1 = IFR ∪ LIFR (superset), not IFR alone.
  //   The IFR polygon would incorrectly cover LIFR pixels, causing wrong labels.
  //
  // Instead: build a separate {0,1} mask for each category, then contour at 0.5.
  // Each polygon covers exactly the pixels with that RANK value.

  const gen = contours().size([SFC_W, SFC_H]).thresholds([0.5])
  const categories = [
    { rank: 1, category: 'IFR' },
    { rank: 2, category: 'LIFR' },
  ]
  const features = []

  for (const { rank, category } of categories) {
    const mask = new Uint8Array(catGrid.length)
    for (let i = 0; i < catGrid.length; i++) {
      if (catGrid[i] === rank) mask[i] = 1
    }

    const [contour] = gen(mask)
    if (!contour?.coordinates?.length) continue

    const color = CATEGORY_COLORS[category]
    const transformedCoords = contour.coordinates.map(polygon =>
      polygon.map(ring => ring.map(([px, py]) => pixelToLonLat(px, py)))
    )

    const feature = {
      type: 'Feature',
      properties: { category, color },
      geometry: { type: 'MultiPolygon', coordinates: transformedCoords },
    }

    try {
      const simplified = simplify(feature, {
        tolerance: config.flight_category.simplify_tolerance,
        highQuality: false,
      })
      if (simplified.geometry?.coordinates?.length) features.push(simplified)
    } catch (e) {
      console.warn('flight-cat: simplify failed for', category, e.message)
      features.push(feature)
    }
  }

  return { type: 'FeatureCollection', features }
}

// ─── 공개 프로세서 함수 ───────────────────────────────────────

export async function process() {
  const [visGrid, cthRaw] = await Promise.all([
    fetchSfcVis().catch(e => { console.warn('flight-cat: sfc_vis failed:', e.message); return null }),
    fetchCtps().catch(e => { console.warn('flight-cat: CTPS failed:', e.message); return null }),
  ])

  if (!visGrid) {
    return { type: 'flight_category_overlay', saved: false, reason: 'sfc_vis unavailable' }
  }

  const amosPts = getAmosCeilingPoints()
  const idwGrid = amosPts.length > 0
    ? idwInterpolate(amosPts, config.flight_category.idw_grid_size)
    : new Float32Array(config.flight_category.idw_grid_size ** 2).fill(-1)

  const ceilFull = bilinearUpscale(idwGrid, config.flight_category.idw_grid_size, SFC_W, SFC_H)
  const catGrid = buildCategoryGrid(visGrid, ceilFull, cthRaw)
  const geojson = categoryGridToGeoJson(catGrid)

  const queryGrids = buildQueryGrids(visGrid, ceilFull, cthRaw)
  const amosFetchedAt = store.getCached('amos')?.fetched_at ?? null
  const result = {
    type: 'flight_category_overlay',
    fetched_at: new Date().toISOString(),
    amos_fetched_at: amosFetchedAt,
    computed_at: new Date().toISOString(),
    feature_count: geojson.features.length,
    geojson,
    query_grid: {
      width: QUERY_GRID_SIZE,
      height: QUERY_GRID_SIZE,
      lat_max: 40.35, lat_min: 30.74, lon_min: 120.67, lon_max: 133.07,
      vis: queryGrids.vis,
      ceil_ft: queryGrids.ceil_ft,
    },
  }

  // store.save() returns { saved: true, filePath } | { saved: false, reason: 'unchanged' }
  const saved = store.save('flight_category_overlay', result)
  return { type: 'flight_category_overlay', saved: saved.saved, feature_count: geojson.features.length }
}

export default { process }
