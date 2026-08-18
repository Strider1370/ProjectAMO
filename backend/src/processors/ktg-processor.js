import { NetCDFReader } from 'netcdfjs'
import config from '../config.js'
import {
  KTG_FORECAST_HOURS,
  addForecastHoursKtg,
  buildKtgCoords,
  buildKtgGrid,
} from './ktg-model.js'
import {
  cleanupKtgRuns,
  readKtgCoords,
  readKtgIndex,
  readKtgLatest,
  writeKtgCoords,
  writeKtgGrid,
  writeKtgIndex,
  writeKtgLatest,
} from './ktg-store.js'
import { selectNearestForecastHour } from './kim-forecast-hour.js'
import { selectKimRunCredential } from './kim-run-credential.js'

const TYPE = 'ktg'
const SYNOPTIC_HOURS = [0, 6, 12, 18]

function formatTmfc(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}`
}

function latestSynopticCycle(now = new Date()) {
  const h = now.getUTCHours()
  const cycle = [...SYNOPTIC_HOURS].reverse().find((c) => c <= h) ?? 18
  const d = new Date(now)
  if (cycle === 18 && h < 18) d.setUTCDate(d.getUTCDate() - 1)
  d.setUTCHours(cycle, 0, 0, 0)
  return d
}

export function resolveKtgCandidates(now = new Date()) {
  const cycle = latestSynopticCycle(now)
  return Array.from({ length: 4 }, (_, i) => {
    const d = new Date(cycle.getTime() - i * 6 * 3600000)
    return formatTmfc(d)
  })
}

export function buildKtgUrl({ tmfc, ef, credential = config.api.kim_nwp_auth_key }) {
  const efStr = String(Number(ef)).padStart(2, '0')
  return `https://apihub.kma.go.kr/api/typ01/url/amo_nwp_file_down.php?tmfc=${tmfc}&ef=${efStr}&authKey=${credential}`
}

export function selectKtgRunCredential(tmfc) {
  return selectKimRunCredential({
    tmfc,
    kimCredential: config.api.kim_nwp_auth_key,
    aviationCredential: config.api.auth_key,
  })
}

async function fetchKtgFile({ tmfc, ef, credential }) {
  const efStr = String(Number(ef)).padStart(2, '0')
  const url = buildKtgUrl({ tmfc, ef, credential })
  const timeoutMs = config.ktg?.timeout_ms ?? 60000
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`KTG API HTTP ${res.status} for tmfc=${tmfc} ef=${efStr}`)
    const buf = await res.arrayBuffer()
    return Buffer.from(buf)
  } finally {
    clearTimeout(timer)
  }
}

function parseKtgNetCdf(buffer) {
  const nc = new NetCDFReader(buffer)
  const nz = nc.dimensions.find((d) => d.name === 'nz')?.size ?? 0
  const ny = nc.dimensions.find((d) => d.name === 'ny')?.size ?? 0
  const nx = nc.dimensions.find((d) => d.name === 'nx')?.size ?? 0
  if (nz === 0 || ny === 0 || nx === 0) throw new Error('KTG NetCDF: unexpected dimensions')
  const lat = nc.getDataVariable('lat')
  const lon = nc.getDataVariable('lon')
  const alt = nc.getDataVariable('alt')
  const ktg = nc.getDataVariable('KTG')
  return { lat, lon, alt, ktg, nz, ny, nx }
}

// Fetch+parse+write one forecast hour (coords + per-altitude grids).
// Returns { hf, validTime, altLevelsFt } or throws on fetch/parse failure.
async function collectKtgHf({ root, tmfc, hf, fetchedAt, credential }) {
  const buffer = await fetchKtgFile({ tmfc, ef: hf, credential })
  const { lat, lon, alt, ktg, nz, ny, nx } = parseKtgNetCdf(buffer)
  const validTime = addForecastHoursKtg(tmfc, hf)

  // coords.json — shared across all altitude levels for this hf
  writeKtgCoords({ root, tmfc, hf, coords: buildKtgCoords({ ny, nx, lat, lon }) })

  // one grid.json per altitude level
  for (let zi = 0; zi < nz; zi++) {
    const altFt = alt[zi]
    const sliceStart = zi * ny * nx
    const ktgSlice = ktg.slice(sliceStart, sliceStart + ny * nx)
    writeKtgGrid({ root, grid: buildKtgGrid({ tmfc, hf, altFt, validTime, ny, nx, ktgSlice, fetchedAt }) })
  }
  return { hf, validTime, altLevelsFt: Array.from(alt) }
}

export async function process() {
  const root = config.storage.base_path
  const candidates = resolveKtgCandidates()
  const forecastHours = config.ktg?.forecast_hours ?? KTG_FORECAST_HOURS
  const single = config.ktg?.single_forecast !== false

  for (const tmfc of candidates) {
    const credential = selectKtgRunCredential(tmfc)
    // single: 최근 1스텝만. multi: 미래예보 전체 hf.
    const hfs = single
      ? [selectNearestForecastHour({ tmfc, nowMs: Date.now(), candidateHours: forecastHours })]
      : forecastHours

    const fetchedAt = new Date().toISOString()
    const collected = []      // { hf, validTime } — 이번 run에 확보된 전체(기존+신규)
    let altLevelsFt = null
    let fetchedAny = false

    for (const hf of hfs) {
      // 이미 디스크에 있는 hf는 재다운로드 안 함(coords.json 존재 = 수집완료). → cron 반복 시 API 낭비 0.
      if (readKtgCoords({ root, tmfc, hf })) {
        collected.push({ hf, validTime: addForecastHoursKtg(tmfc, hf) })
        continue
      }
      try {
        const r = await collectKtgHf({ root, tmfc, hf, fetchedAt, credential })
        collected.push({ hf: r.hf, validTime: r.validTime })
        altLevelsFt = r.altLevelsFt
        fetchedAny = true
      } catch (err) {
        console.warn(`[ktg] skipping tmfc=${tmfc} hf=${hf}: ${err.message}`)
      }
    }

    if (collected.length === 0) continue  // 이 tmfc는 아직 자료 없음 → 더 과거 candidate로

    collected.sort((a, b) => a.hf - b.hf)
    // altLevelsFt: 신규 fetch분에서, 없으면(전부 스킵) 기존 index에서 재사용.
    altLevelsFt = altLevelsFt ?? readKtgIndex(root)?.altLevelsFt ?? []

    // 기본 "최신" 뷰 = 확보된 hf 중 nearest(현재시각에 가장 가까운 예보시각).
    const nearestHf = selectNearestForecastHour({ tmfc, nowMs: Date.now(), candidateHours: collected.map((c) => c.hf) })
    const nearest = collected.find((c) => c.hf === nearestHf) ?? collected[0]

    // 신규 다운로드가 하나도 없고 이미 이 tmfc 전체가 있으면 스킵(idempotent).
    if (!fetchedAny) {
      const already = readKtgLatest(root)
      if (already?.tmfc === tmfc && collected.length === hfs.length) {
        return { type: TYPE, skipped: true, reason: 'already_collected', tmfc, hours: collected.length }
      }
    }

    writeKtgIndex(root, {
      type: 'ktg_index',
      tmfc,
      hf: nearest.hf,            // 하위호환: 단일 hf 소비자용 기본값
      validTime: nearest.validTime,
      hours: collected,          // NEW: 확보된 예보시간 전체 [{hf, validTime}]
      altLevelsFt,
      fetched_at: fetchedAt,
    })
    writeKtgLatest(root, {
      type: 'ktg_latest',
      tmfc,
      hf: nearest.hf,
      validTime: nearest.validTime,
      updated_at: fetchedAt,
    })
    cleanupKtgRuns({ root, maxRuns: config.ktg?.max_runs ?? 2, latestTmfc: tmfc })

    return { type: TYPE, tmfc, hours: collected.length, hfs: collected.map((c) => c.hf), altLevels: altLevelsFt.length }
  }

  throw new Error('KTG collection failed: no valid candidate found')
}

export default { process, resolveKtgCandidates }
