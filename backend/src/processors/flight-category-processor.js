import fs from 'node:fs'
import path from 'node:path'
import config from '../config.js'
import store from '../store.js'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { latLonToEN84 } from '../lib/lcc-projection.js'
import { ctpsIndexForLatLon } from '../lib/ctps-grid.js'
import { convectiveDir, readConvectiveMeta } from './convective-satellite-store.js'
import { decodeCtpsRecord } from './convective-satellite-model.js'
import { createDailyByteBudget } from '../lib/daily-byte-budget.js'
import { loadKimCeiling, buildCeilingGeoJson, maskCeilingWithCtps, sampleCeilingAt } from './flight-category/ceiling-kim.js'
import { buildStations } from './flight-category/stations.js'
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

/** `YYYYMMDDHHmm`에서 n시간을 뺀 같은 형식 문자열. 프레임 tm 비교용. */
function tmMinusHours(tm, hours) {
  if (!tm) return '0'
  const d = new Date(Date.UTC(
    +tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8), +tm.slice(8, 10), +tm.slice(10, 12),
  ) - hours * 3600 * 1000)
  return d.getUTCFullYear().toString()
    + String(d.getUTCMonth() + 1).padStart(2, '0')
    + String(d.getUTCDate()).padStart(2, '0')
    + String(d.getUTCHours()).padStart(2, '0')
    + String(d.getUTCMinutes()).padStart(2, '0')
}

/**
 * 위성 프로세서가 발행한 CTPS 이진을 읽어 "구름 없음" 조회기를 만든다.
 * 별도 수집하지 않는다 — 이미 5분 주기로 받고 있는 자료다.
 * 이진이 실제로 있는 가장 최근 프레임을 쓴다.
 */
export function loadCtpsMask(root) {
  const meta = readConvectiveMeta(root)
  if (!meta) return null
  // `latest`를 그대로 믿으면 안 된다. 프레임은 CI만 있고 CTPS 이진이 없을 수 있어
  // 최신 프레임에 ctps_<tm>.bin이 없는 경우가 흔하다(실측: 프레임 18개 대 이진 15개).
  // 그때 null을 반환하면 위성 마스크가 조용히 통째로 꺼진다.
  const dir = convectiveDir(root)
  const frames = (meta.frames?.length ? meta.frames.map((f) => f.tm) : [meta.latest?.tm])
    .filter(Boolean).sort().reverse()
  // 한 시간 넘게 묵은 구름 판정으로 현재 운고를 지우지 않는다.
  const oldest = tmMinusHours(frames[0], 1)
  const tm = frames.find((t) => t >= oldest && fs.existsSync(path.join(dir, `ctps_${t}.bin`)))
  if (!tm) return null
  let buffer
  try {
    buffer = fs.readFileSync(path.join(dir, `ctps_${tm}.bin`))
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

/**
 * 조회 격자에서 lat/lon 좌표의 시정과 운고를 샘플링한다.
 * 모든 좌표 변환은 여기서 한다 — server.js는 좌표 산술을 하지 않는다.
 * LCC 투영을 사용해 격자를 만드는 쪽과 읽는 쪽이 같은 규칙을 쓴다.
 */
export function sampleQueryGrid(queryGrid, lat, lon) {
  // lat/lon → LCC 동-북쪽 좌표 (m)
  const [easting, northing] = latLonToEN84(lat, lon)

  // LCC 좌표 → 2049×2049 격자 픽셀 (원점 col 880, row_from_south 1540)
  const col = easting / 500 + 880
  const rowFromSouth = northing / 500 + 1540
  const row = SFC_H - 1 - rowFromSouth

  // 픽셀 좌표 → 128×128 조회 격자 칸
  const fc = (col * (QUERY_GRID_SIZE - 1)) / (SFC_W - 1)
  const fr = (row * (QUERY_GRID_SIZE - 1)) / (SFC_H - 1)

  // 범위 체크
  if (fc < 0 || fc > QUERY_GRID_SIZE - 1 || fr < 0 || fr > QUERY_GRID_SIZE - 1) {
    return null
  }

  const c0 = Math.floor(fc)
  const c1 = Math.min(c0 + 1, QUERY_GRID_SIZE - 1)
  const r0 = Math.floor(fr)
  const r1 = Math.min(r0 + 1, QUERY_GRID_SIZE - 1)
  const dc = fc - c0
  const dr = fr - r0

  // 쌍선형 보간
  const bilerp = (arr) =>
    arr[r0 * QUERY_GRID_SIZE + c0] * (1 - dc) * (1 - dr) +
    arr[r0 * QUERY_GRID_SIZE + c1] * dc * (1 - dr) +
    arr[r1 * QUERY_GRID_SIZE + c0] * (1 - dc) * dr +
    arr[r1 * QUERY_GRID_SIZE + c1] * dc * dr

  const vis_m = bilerp(queryGrid.vis)
  const ceil_ft = bilerp(queryGrid.ceil_ft)

  return { vis_m: Math.round(vis_m), ceil_ft: Math.round(ceil_ft) }
}

function buildQueryGrid(visGrid, ceilingMasked, kimGrid) {
  const vis = new Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)
  const ceil_ft = new Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)

  for (let qr = 0; qr < QUERY_GRID_SIZE; qr++) {
    for (let qc = 0; qc < QUERY_GRID_SIZE; qc++) {
      const sr = Math.round((qr * (SFC_H - 1)) / (QUERY_GRID_SIZE - 1))
      const sc = Math.round((qc * (SFC_W - 1)) / (QUERY_GRID_SIZE - 1))
      vis[qr * QUERY_GRID_SIZE + qc] = visGrid[sr * SFC_W + sc]

      // 운고는 지점 표시와 반드시 같은 함수로 읽는다. 따로 구현하면 같은 자리에서
      // 점과 격자가 다른 값을 답한다.
      let ceilValue = -1
      if (ceilingMasked && kimGrid) {
        const { lat, lon } = sfcPixelToLatLon(sc, sr)
        const ceilM = sampleCeilingAt(ceilingMasked, kimGrid, lat, lon)
        ceilValue = ceilM < 0 ? -1 : Math.round(ceilM * 3.28084)
      }
      ceil_ft[qr * QUERY_GRID_SIZE + qc] = ceilValue
    }
  }
  return { width: QUERY_GRID_SIZE, height: QUERY_GRID_SIZE, vis, ceil_ft }
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

/** 과거 산출물 목록에서 3시간 전에 가장 가까운 하나를 고른다. 20분을 넘으면 null. */
export function pickTrendBaseline(recent, now) {
  if (!Array.isArray(recent) || recent.length === 0) return null
  const targetTime = new Date(now.getTime() - 3 * 3600 * 1000)
  let closest = null
  let minDiff = Infinity
  for (const item of recent) {
    if (!item?.computed_at) continue
    const itemTime = new Date(item.computed_at)
    const diff = Math.abs(itemTime.getTime() - targetTime.getTime())
    if (diff < minDiff) {
      minDiff = diff
      closest = item
    }
  }
  // 20분(1200000ms) 보다 크면 쓰지 않는다
  if (minDiff > 20 * 60 * 1000) return null
  return closest
}

/** 현재와 과거 산출물에서 시정 추세를 낸다. 결측이 있으면 null. */
export function buildTrend(current, past) {
  if (!past) return null
  if (!current?.query_grid?.vis || !past?.query_grid?.vis) return null
  if (current.query_grid.vis.length !== past.query_grid.vis.length) return null

  const vis_delta = new Array(current.query_grid.vis.length)
  for (let i = 0; i < current.query_grid.vis.length; i++) {
    const curr = current.query_grid.vis[i]
    const prev = past.query_grid.vis[i]
    // If either is missing (negative), delta is null
    if (!(curr >= 0) || !(prev >= 0)) {
      vis_delta[i] = null
    } else {
      vis_delta[i] = curr - prev
    }
  }
  return { hours: 3, vis_delta }
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
  // 운영자가 알아챘을 수 있게 남긴다 — 시정만 나오는 화면은 정상처럼 보인다.
  if (!kimCeiling) console.warn('flight-cat: KIM 운고 자료 없음 — 운고 면 생략')
  if (!ctpsMask) console.warn('flight-cat: CTPS 저장본 없음 — 위성 구름 마스킹 생략')

  // 운고를 조회 격자로 샘플링하기 위해 마스킹된 천장을 준비한다
  let ceilingMasked = null
  if (kimCeiling) {
    ceilingMasked = maskCeilingWithCtps(kimCeiling.ceilingM, kimCeiling.grid, ctpsMask)
  }

  let missing = 0
  for (let i = 0; i < visGrid.length; i++) {
    if (classifyVisibility(visGrid[i]) === 'missing') missing++
  }

  const asos = store.getCached('asos_ceiling')
  let stations = []
  try {
    stations = buildStations({ asos, amos: store.getCached('amos'), kimCeiling, ctpsMask })
  } catch (e) {
    // 지점은 부가 정보다. 여기서 죽으면 시정·운고 면까지 같이 사라진다.
    console.warn('flight-cat: 지점 조립 실패 —', e.message)
  }

  // 조회 격자를 한 번 계산해 재사용한다
  const queryGrid = buildQueryGrid(visGrid, ceilingMasked, kimCeiling?.grid)

  // 3시간 추세를 계산한다
  let trend = null
  try {
    const recent = store.loadRecent('flight_category_overlay', 12)
    const nowForTrend = new Date()
    const baseline = pickTrendBaseline(recent, nowForTrend)
    trend = buildTrend({ query_grid: queryGrid }, baseline)
  } catch (e) {
    console.warn('flight-cat: 추세 계산 실패 —', e.message)
  }

  const now = new Date().toISOString()
  const result = {
    type: 'flight_category_overlay',
    fetched_at: now,
    computed_at: now,
    visibility: { geojson: buildVisibilityGeoJson(visGrid) },
    ceiling: { geojson: buildCeilingGeoJson(kimCeiling, ctpsMask) },
    query_grid: queryGrid,
    stations,
    trend,
    sources: {
      kim: kimCeiling ? { run: kimCeiling.run, hf: 0 } : null,
      ctps: ctpsMask ? { frame_tm: ctpsMask.frameTm } : null,
      missing_ratio: missing / visGrid.length,
      // 실제로 화면에 나가는 개수를 센다. 저장본에 든 개수를 세면 ASOS가 2시간을
      // 넘겨 통째로 빠진 상황에서도 "asos: 4"라고 말해 화면과 어긋난다.
      stations: {
        asos: stations.filter((s) => s.source === 'ASOS').length,
        amos: stations.filter((s) => s.source === 'AMOS').length,
        tm: asos?.tm ?? null,
      },
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
