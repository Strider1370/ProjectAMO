// KIM 지상 일기도 수집기. 최신 KIM 런의 +3·+6·+9·+12시간 해면기압·누적강수·지상바람(16장)을
// 레이더·위성 키로 받아, 시각마다 등압선·H/L·3시간 강수 그림·바람 격자를 만들어 발행한다.
// 16장이 모두 검증을 통과한 런만 원자적으로 발행하고, 실패하면 마지막 정상 런을 유지한다.
import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import store from '../store.js'
import { buildSurfaceChartFrame, toChartGrid } from '../lib/kim-surface-chart.js'
import { resolveKimSurfaceWindCandidates } from './kim-surface-wind-processor.js'

const TYPE = 'kim_surface_chart'
const ROOT_DIR = 'kim_surface_chart'
const MODEL = 'KIMG/NE57'
const HOUR_MS = 3_600_000
export const KIM_SURFACE_CHART_VARIABLES = Object.freeze(['psl', 'prec_acc', 'u10m', 'v10m'])
// 운영 nginx는 /data/*.geojson을 프론트엔드 정적 파일(항공 GeoJSON)로 보내므로 GeoJSON도 .json으로 저장한다.
const FRAME_FILES = Object.freeze({ isobars: 'isobars.json', centers: 'centers.json', precip: 'precip3h.png', wind: 'wind.json' })

export function parseTmfcMs(tmfc) {
  const raw = String(tmfc || '')
  if (!/^\d{10}$/.test(raw)) throw new Error('invalid_kim_tmfc')
  return Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)), Number(raw.slice(8, 10)))
}

export function buildSurfaceChartRunId(tmfc) {
  parseTmfcMs(tmfc)
  return `KIMG_NE57_${tmfc}`
}

export const hfDir = (hf) => `hf${String(hf).padStart(3, '0')}`

function rootDir(root) {
  return path.join(root, ROOT_DIR)
}

function runsDir(root) {
  return path.join(rootDir(root), 'runs')
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

export function readSurfaceChartLatest(root = config.storage.base_path) {
  try {
    return JSON.parse(fs.readFileSync(path.join(rootDir(root), 'latest.json'), 'utf8'))
  } catch {
    return null
  }
}

// 강수는 모델 시작부터의 누적값이다. +3시간은 시작값이 0이므로 이전 값 없이 그대로 3시간 강수다.
export function buildSurfaceChartRequests(tmfc, forecastHours = config.kim_surface_chart.forecast_hours) {
  const hours = new Set(forecastHours)
  const requests = []
  for (const hf of forecastHours) {
    for (const name of KIM_SURFACE_CHART_VARIABLES) requests.push({ tmfc, hf, name })
    if (hf - 3 > 0 && !hours.has(hf - 3)) requests.push({ tmfc, hf: hf - 3, name: 'prec_acc' })
  }
  return requests
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  const run = async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}

function isFileNotAvailable(error) {
  return error?.code === 'KIM_FILE_NOT_AVAILABLE'
}

export async function fetchSurfaceChartGrid({ tmfc, hf, name, signal, fetchGrid = fetchKimGrid, settings = config.kim_surface_chart, credential = config.api.radar_satellite_auth_key }) {
  signal?.throwIfAborted()
  const text = await fetchGrid({
    operation: 'kim_grid_chart',
    data: 'U',
    name,
    level: 0,
    tmfc,
    hf,
    map: 'S',
    sub: settings.sub,
    disp: 'A',
    credential,
    signal,
  })
  return toChartGrid(parseKimGridText(text, { variable: name, level: 0 }), { grid: settings.grid, name })
}

export async function buildSurfaceChartRun({ tmfc, signal, fetchGrid = fetchKimGrid, settings = config.kim_surface_chart, credential = config.api.radar_satellite_auth_key }) {
  const requests = buildSurfaceChartRequests(tmfc, settings.forecast_hours)
  // 아직 공개되지 않은 런에 16장을 다 부르지 않도록 첫 장으로 먼저 확인한다.
  const first = await fetchSurfaceChartGrid({ ...requests[0], signal, fetchGrid, settings, credential })
  const rest = await mapWithConcurrency(requests.slice(1), settings.concurrency || 2, (request) => fetchSurfaceChartGrid({ ...request, signal, fetchGrid, settings, credential }))
  const grids = new Map([first, ...rest].map((grid, index) => [`${requests[index].name}:${requests[index].hf}`, grid]))
  const analysisTimeMs = parseTmfcMs(tmfc)
  const frames = []
  for (const hf of settings.forecast_hours) {
    signal?.throwIfAborted()
    const frame = await buildSurfaceChartFrame({
      psl: grids.get(`psl:${hf}`),
      precNow: grids.get(`prec_acc:${hf}`),
      precPrev: hf - 3 > 0 ? grids.get(`prec_acc:${hf - 3}`) : null,
      u: grids.get(`u10m:${hf}`),
      v: grids.get(`v10m:${hf}`),
      view: settings.view,
    })
    frames.push({ hf, validTimeMs: analysisTimeMs + hf * HOUR_MS, precipStartMs: analysisTimeMs + (hf - 3) * HOUR_MS, ...frame })
  }
  return { tmfc, analysisTimeMs, frames }
}

// 런 폴더를 임시 이름으로 다 쓴 뒤 한 번에 이름을 바꾸고, 그다음 latest.json을 바꾼다.
export function publishSurfaceChartRun({ root = config.storage.base_path, run, settings = config.kim_surface_chart, now = Date.now() }) {
  const runId = buildSurfaceChartRunId(run.tmfc)
  const finalDir = path.join(runsDir(root), runId)
  const stagingDir = path.join(runsDir(root), `.${runId}.${process.pid}.${now}.tmp`)
  fs.rmSync(stagingDir, { recursive: true, force: true })
  const frames = []
  for (const frame of run.frames) {
    const dir = path.join(stagingDir, hfDir(frame.hf))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, FRAME_FILES.isobars), JSON.stringify(frame.isobars))
    fs.writeFileSync(path.join(dir, FRAME_FILES.centers), JSON.stringify(frame.centers))
    fs.writeFileSync(path.join(dir, FRAME_FILES.precip), frame.precip.png)
    fs.writeFileSync(path.join(dir, FRAME_FILES.wind), JSON.stringify(frame.wind))
    frames.push({
      hf: frame.hf,
      validTimeMs: frame.validTimeMs,
      precipStartMs: frame.precipStartMs,
      precipMaxMm: frame.precip.maxMm,
      centerCount: frame.centers.features.length,
      path: `${ROOT_DIR}/runs/${runId}/${hfDir(frame.hf)}`,
    })
  }
  // revision: 같은 런을 다시 발행해도(계산 방식 변경 등) 브라우저가 예전 파일을 쓰지 않도록 주소에 붙이는 값.
  const manifest = { type: 'kim_surface_chart_run', model: MODEL, runId, tmfc: run.tmfc, analysisTimeMs: run.analysisTimeMs, revision: now, view: settings.view, files: FRAME_FILES, frames }
  fs.writeFileSync(path.join(stagingDir, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
  fs.rmSync(finalDir, { recursive: true, force: true })
  fs.renameSync(stagingDir, finalDir)

  const previous = readSurfaceChartLatest(root)
  const retained = [manifest, ...(previous?.runs || []).filter((item) => item.runId !== runId)]
    .filter((item) => fs.existsSync(path.join(runsDir(root), item.runId, 'manifest.json')))
    .sort((a, b) => b.analysisTimeMs - a.analysisTimeMs)
    .slice(0, settings.max_runs || 2)
    .map(({ type: _type, ...item }) => item)
  const latest = {
    type: 'kim_surface_chart_latest',
    model: MODEL,
    latestRunId: retained[0].runId,
    latestRun: retained[0].tmfc,
    view: settings.view,
    files: FRAME_FILES,
    runs: retained,
    updated_at: new Date(now).toISOString(),
  }
  latest.content_hash = store.canonicalHash({ ...latest, updated_at: null })
  writeJsonAtomic(path.join(rootDir(root), 'latest.json'), latest)
  cleanupSurfaceChartRuns({ root, keep: retained.map((item) => item.runId) })
  return latest
}

export function cleanupSurfaceChartRuns({ root = config.storage.base_path, keep }) {
  let entries = []
  try { entries = fs.readdirSync(runsDir(root)) } catch { return }
  for (const entry of entries) {
    if (keep.includes(entry)) continue
    fs.rmSync(path.join(runsDir(root), entry), { recursive: true, force: true })
  }
}

export async function process({
  candidates = resolveKimSurfaceWindCandidates(),
  signal,
  fetchGrid = fetchKimGrid,
  root = config.storage.base_path,
  settings = config.kim_surface_chart,
  credential = config.api.radar_satellite_auth_key,
} = {}) {
  if (!credential) throw new Error('kim_surface_chart_credential_missing')
  const published = new Set((readSurfaceChartLatest(root)?.runs || []).map((item) => item.tmfc))
  let lastError = null
  // 최신 후보부터 시도한다. 이미 발행한 런에 닿으면 그보다 새 런은 아직 공개 전이므로 기다린다.
  for (const candidate of candidates) {
    if (published.has(candidate.tmfc)) {
      return { type: TYPE, skipped: true, reason: 'kim_surface_chart_latest_run_published', latestRun: candidate.tmfc }
    }
    try {
      const run = await buildSurfaceChartRun({ tmfc: candidate.tmfc, signal, fetchGrid, settings, credential })
      signal?.throwIfAborted()
      const latest = publishSurfaceChartRun({ root, run, settings })
      return { type: TYPE, saved: true, latestRun: latest.latestRun, frames: run.frames.length }
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw error
      lastError = error
      if (isFileNotAvailable(error)) continue
      // 공개된 런인데 검증에 실패했다면 더 오래된 런으로 대체하지 않는다. 마지막 정상 런을 유지한다.
      throw error
    }
  }
  throw lastError || new Error('kim_surface_chart_collection_failed')
}

export default { process }
