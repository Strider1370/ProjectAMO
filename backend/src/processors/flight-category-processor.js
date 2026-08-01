import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'
import store from '../store.js'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { ctpsIndexForLatLon } from '../lib/ctps-grid.js'
import { convectiveDir, readConvectiveMeta } from './convective-satellite-store.js'
import { decodeCtpsRecord } from './convective-satellite-model.js'
import { createDailyByteBudget } from '../lib/daily-byte-budget.js'
import { loadKimCeiling, buildCeilingGeoJson } from './flight-category/ceiling-kim.js'
import { contours } from 'd3-contour'
import { simplify } from '@turf/simplify'

const budget = createDailyByteBudget({
  limitBytes: config.flight_category.daily_byte_limit,
})

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
    budget.add(Buffer.byteLength(text))
    if (text.includes('data_read: error')) throw new Error('sfc_vis: data_read error')
    return parseSfcAscii(text)
  })
}

/**
 * 위성 프로세서가 발행한 최신 CTPS 이진을 읽어 "구름 없음" 조회기를 만든다.
 * 별도 수집하지 않는다 — 이미 5분 주기로 받고 있는 자료다.
 */
export function loadCtpsMask(root) {
  const tm = readConvectiveMeta(root)?.latest?.tm
  if (!tm) return null
  const file = path.join(convectiveDir(root), `ctps_${tm}.bin`)
  if (!fs.existsSync(file)) return null
  let buffer
  try {
    buffer = fs.readFileSync(file)
  } catch {
    return null
  }
  return {
    frameTm: tm,
    isClearAt(lat, lon) {
      const idx = ctpsIndexForLatLon(lat, lon)
      if (idx === null) return true
      try {
        return decodeCtpsRecord(buffer, idx) === null
      } catch {
        return true
      }
    },
  }
}

const QUERY_GRID_SIZE = 128

function buildQueryGrid(visGrid) {
  const vis = new Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)
  for (let qr = 0; qr < QUERY_GRID_SIZE; qr++) {
    for (let qc = 0; qc < QUERY_GRID_SIZE; qc++) {
      const sr = Math.round((qr * (SFC_H - 1)) / (QUERY_GRID_SIZE - 1))
      const sc = Math.round((qc * (SFC_W - 1)) / (QUERY_GRID_SIZE - 1))
      vis[qr * QUERY_GRID_SIZE + qc] = visGrid[sr * SFC_W + sc]
    }
  }
  return { width: QUERY_GRID_SIZE, height: QUERY_GRID_SIZE, vis }
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
  } catch (e) {
    console.warn('flight-cat: simplify failed for', band, e.message)
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
  if (!budget.canSpend()) {
    console.warn('flight-cat: 일일 용량 한도 도달 — 이번 사이클 건너뜀')
    return { type: 'flight_category_overlay', saved: false, reason: 'daily budget exhausted' }
  }

  let visGrid
  try {
    visGrid = await fetchSfcVis()
  } catch (e) {
    console.warn('flight-cat: sfc_vis failed:', e.message)
    return { type: 'flight_category_overlay', saved: false, reason: 'sfc_vis unavailable' }
  }

  const root = config.storage.base_path
  const ctpsMask = loadCtpsMask(root)
  const kimCeiling = loadKimCeiling(root)
  // 둘 다 조용히 null이 될 수 있다(저장본 없음/구조 변경). 그러면 운고 면이 통째로 비므로
  // 운영자가 알아챌 수 있게 남긴다 — 시정만 나오는 화면은 정상처럼 보인다.
  if (!kimCeiling) console.warn('flight-cat: KIM 운고 자료 없음 — 운고 면 생략')
  if (!ctpsMask) console.warn('flight-cat: CTPS 저장본 없음 — 위성 구름 마스킹 생략')

  let missing = 0
  for (let i = 0; i < visGrid.length; i++) {
    if (classifyVisibility(visGrid[i]) === 'missing') missing++
  }

  const now = new Date().toISOString()
  const result = {
    type: 'flight_category_overlay',
    fetched_at: now,
    computed_at: now,
    visibility: { geojson: buildVisibilityGeoJson(visGrid) },
    ceiling: { geojson: buildCeilingGeoJson(kimCeiling, ctpsMask) },
    query_grid: buildQueryGrid(visGrid),
    sources: {
      kim: kimCeiling ? { run: kimCeiling.run, hf: 0 } : null,
      ctps: ctpsMask ? { frame_tm: ctpsMask.frameTm } : null,
      missing_ratio: missing / visGrid.length,
    },
  }

  const saved = store.save('flight_category_overlay', result)
  return {
    type: 'flight_category_overlay',
    saved: saved.saved,
    vis_features: result.visibility.geojson.features.length,
    ceiling_features: result.ceiling.geojson.features.length,
  }
}

export default { process }
