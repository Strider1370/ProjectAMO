import config from '../config.js'
import store from '../store.js'
import { idwInterpolate } from '../lib/idw.js'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { ctpsIndexForLatLon } from '../lib/ctps-grid.js'
import { parseCtpsNC } from '../parsers/satellite-parser.js'
import { contours } from 'd3-contour'
import { simplify } from '@turf/simplify'

const CTH_FILL = 65535

// ─── 시정 밴드 ────────────────────────────────────────────────
// 별표 24 기준선 5,000m 를 가운데 두고 아래위로 한 단계씩.
export const VIS_BAND_COLORS = {
  severe: '#dc2626',
  below: '#f97316',
  marginal: '#fde047',
  missing: '#9ca3af',
}

export function classifyVisibility(visM) {
  if (!(visM >= 0)) return 'missing'
  if (visM < 3000) return 'severe'
  if (visM < 5000) return 'below'
  if (visM < 7000) return 'marginal'
  return 'clear'
}

// ─── CTH lookup table ─────────────────────────────────────────
// Maps each SFC pixel index → CTH flat index (-1 = outside CTH domain).
// Built once on first use: 4.2 M LCC projections up-front so the per-pixel loops
// only does a single Int32Array read per pixel instead of a trig projection.

let _cthLookup = null

function getCthLookup() {
  if (_cthLookup) return _cthLookup
  _cthLookup = new Int32Array(SFC_W * SFC_H)
  for (let i = 0; i < _cthLookup.length; i++) {
    const row = Math.floor(i / SFC_W), col = i % SFC_W
    const { lat, lon } = sfcPixelToLatLon(col, row)
    const idx = ctpsIndexForLatLon(lat, lon)
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
  const { lat, lon } = sfcPixelToLatLon(px, py)
  return [lon, lat]
}

function contourFeature(mask, band) {
  const gen = contours().size([SFC_W, SFC_H]).thresholds([0.5])
  const [contour] = gen(mask)
  if (!contour?.coordinates?.length) return null
  const feature = {
    type: 'Feature',
    properties: { band, color: VIS_BAND_COLORS[band] },
    geometry: {
      type: 'MultiPolygon',
      coordinates: contour.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(([px, py]) => pixelToLonLat(px, py))),
      ),
    },
  }
  try {
    const s = simplify(feature, {
      tolerance: config.flight_category.simplify_tolerance,
      highQuality: false,
    })
    return s.geometry?.coordinates?.length ? s : feature
  } catch {
    return feature
  }
}

/** clear 구역은 도형을 만들지 않는다. 배경이 곧 기준 충족이다. */
export function buildVisibilityGeoJson(visGrid) {
  const features = []
  for (const band of ['severe', 'below', 'marginal', 'missing']) {
    const mask = new Uint8Array(visGrid.length)
    for (let i = 0; i < visGrid.length; i++) {
      if (classifyVisibility(visGrid[i]) === band) mask[i] = 1
    }
    const f = contourFeature(mask, band)
    if (f) features.push(f)
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
  const geojson = buildVisibilityGeoJson(visGrid)

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
