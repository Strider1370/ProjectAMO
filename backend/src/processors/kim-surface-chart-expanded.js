// 지도 "강수" 레이어(KIM 지상 일기도)를 확대 영역 회차에서 만든다(대용량 키, 00·06 UTC, 매시간).
// 계획: docs/design/proposals/2026-10-09-kim-precip-expanded-plan.md
//
// - 받기(prefetchSurfaceChartInputs): 확대 회차가 시각마다 기본 격자를 받은 뒤 해면기압(psl)·누적강수(prec_acc)를
//   같은 범위로 받아 회차 폴더 raw/chart/에 원문으로 둔다. 지상바람은 확대 회차 10 m 격자를 그대로 쓴다.
// - 만들기(process, 파생 작업 kim_surface_chart): 시각마다 등압선·H/L·직전 3시간 강수 그림·바람 격자를 만들어
//   derived/surface-chart/hfNNN/에 쓴다(별도 계산 프로세스).
// - 게시(publishExpandedSurfaceChart): 확대 회차를 게시할 때 기존 강수 레이어 위치(kim_surface_chart/)에 함께 게시한다.
// 확대 영역을 쓸 수 없으면 기존 수집기(kim-surface-chart-processor.js, 레이더·위성 키)가 지금 방식으로 받는다.
import fs from 'node:fs'
import path from 'node:path'

import config from '../config.js'
import { fetchKimGrid } from '../api-client.js'
import { parseKimGridText } from '../parsers/kim-grid-parser.js'
import { buildSurfaceChartFrame, toChartGrid } from '../lib/kim-surface-chart.js'
import { KIM_NWP_MODEL, decodeComponent } from './kim-nwp-model.js'
import { readKimNwpGrid, resolveKimNwpRunDir } from './kim-nwp-store.js'
import { readKimRawText, writeKimRawText } from './kim-doc-store.js'
import { kimDomainRequest } from './kim-domain.js'
import { kimBulkCredentialOptions, selectKimRunCredential } from './kim-run-credential.js'
import { appendKimRunEvent } from './kim-run-events.js'
import { hfDir, parseTmfcMs, publishSurfaceChartRun } from './kim-surface-chart-processor.js'

const DOMAIN = 'ea'
const HOUR_MS = 3_600_000
const CELLS_PER_DEGREE = 12
// H/L은 확대 영역 가장자리에서 이만큼 안쪽에서만 표시한다(가장자리 근처는 닫힌 등압선 판정이 불완전).
export const EXPANDED_CHART_CENTER_MARGIN_DEG = 3
export const EXPANDED_CHART_SOURCE = 'kim_expanded'
const FRAME_META = 'frame.json'

export function expandedChartEnabled(settings = config.kim_surface_chart) {
  return settings?.from_expanded !== false
}

function chartGridSpec() {
  const { bounds } = kimDomainRequest(config, DOMAIN)
  return {
    nx: Math.round((bounds.lonMax - bounds.lonMin) * CELLS_PER_DEGREE) + 1,
    ny: Math.round((bounds.latMax - bounds.latMin) * CELLS_PER_DEGREE) + 1,
    lonMin: bounds.lonMin,
    latMin: bounds.latMin,
    step: 1 / CELLS_PER_DEGREE,
  }
}

export function expandedChartView() {
  const { bounds } = kimDomainRequest(config, DOMAIN)
  return { lonMin: bounds.lonMin, lonMax: bounds.lonMax, latMin: bounds.latMin, latMax: bounds.latMax }
}

function centerView(view) {
  const m = EXPANDED_CHART_CENTER_MARGIN_DEG
  return { lonMin: view.lonMin + m, lonMax: view.lonMax - m, latMin: view.latMin + m, latMax: view.latMax - m }
}

function rawFile({ root, tmfc, hf, name }) {
  return path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: DOMAIN }), 'raw', 'chart', `hf${hf}-${name}.txt`)
}

function frameDir({ root, tmfc, hf }) {
  return path.join(resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain: DOMAIN }), 'derived', 'surface-chart', hfDir(hf))
}

function parseChartText(text, name) {
  return toChartGrid(parseKimGridText(text, { variable: name, level: 0 }), { grid: chartGridSpec(), name })
}

// +0h에는 누적강수가 없다(시작값 0). 받지 않는다.
const inputNames = (hf) => (hf === 0 ? ['psl'] : ['psl', 'prec_acc'])

export async function prefetchSurfaceChartInputs({ root = config.storage.base_path, domain, tmfc, hf, signal, fetchGrid = fetchKimGrid }) {
  if (domain !== DOMAIN || !expandedChartEnabled()) return
  for (const name of inputNames(hf)) {
    const file = rawFile({ root, tmfc, hf, name })
    if (readKimRawText(file) !== null) continue
    signal?.throwIfAborted()
    const credential = selectKimRunCredential({ tmfc, ...kimBulkCredentialOptions(config, Date.now(), { required: true }) })
    // 작업 분류는 확대 회차의 다른 격자처럼 kim_grid(대용량 키)다. kim_grid_chart는 기존 수집기 범위(sub)로만 판별된다.
    const text = await fetchGrid({ data: 'U', name, level: 0, tmfc, hf, map: 'S', disp: 'A',
      sub: kimDomainRequest(config, DOMAIN).sub, credential, signal })
    parseChartText(text, name) // 받은 그대로 검증한 뒤 저장한다(격자 모양·결측 비율).
    writeKimRawText(file, text)
  }
}

function readChartInput({ root, tmfc, hf, name }) {
  const text = readKimRawText(rawFile({ root, tmfc, hf, name }))
  if (text === null) throw new Error(`kim_surface_chart_input_missing:${name}:${hf}`)
  return parseChartText(text, name)
}

function windGrid(doc, name) {
  const variable = doc.variables?.[name]
  if (!variable) throw new Error(`kim_surface_chart_wind_missing:${name}`)
  const decoded = decodeComponent(variable.values || [], variable)
  const values = Float64Array.from(decoded, (value) => (value == null || !Number.isFinite(value) ? Number.NaN : value))
  return { nx: doc.grid.nx, ny: doc.grid.ny, lonMin: doc.grid.lonMin, latMin: doc.grid.latMin, step: doc.grid.dx, values }
}

// 한 시각의 일기도 장. 강수는 직전 3시간(+1·2h는 시작부터).
export async function buildExpandedChartFrame({ root, tmfc, hf }) {
  const psl = readChartInput({ root, tmfc, hf, name: 'psl' })
  const zero = { ...psl, values: new Float64Array(psl.values.length) }
  const precNow = hf === 0 ? zero : readChartInput({ root, tmfc, hf, name: 'prec_acc' })
  const precPrev = hf - 3 > 0 ? readChartInput({ root, tmfc, hf: hf - 3, name: 'prec_acc' }) : null
  const wind = readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf, levelId: '10m', domain: DOMAIN })
  const view = expandedChartView()
  return buildSurfaceChartFrame({ psl, precNow, precPrev, u: windGrid(wind, 'u'), v: windGrid(wind, 'v'), view, centerView: centerView(view) })
}

function writeFrame({ root, tmfc, hf, frame }) {
  const dir = frameDir({ root, tmfc, hf })
  const staging = `${dir}.${process.pid}.${Date.now()}.tmp`
  fs.mkdirSync(staging, { recursive: true })
  fs.writeFileSync(path.join(staging, 'isobars.json'), JSON.stringify(frame.isobars))
  fs.writeFileSync(path.join(staging, 'centers.json'), JSON.stringify(frame.centers))
  fs.writeFileSync(path.join(staging, 'precip3h.png'), frame.precip.png)
  fs.writeFileSync(path.join(staging, 'wind.json'), JSON.stringify(frame.wind))
  fs.writeFileSync(path.join(staging, FRAME_META), JSON.stringify({ hf, precipMaxMm: frame.precip.maxMm, centerCount: frame.centers.features.length }))
  fs.rmSync(dir, { recursive: true, force: true })
  fs.renameSync(staging, dir)
}

// 파생 작업(kim_surface_chart): 지정한 시각들의 일기도 장을 만든다. 이미 있으면 건너뛴다.
export async function process({ root = config.storage.base_path, domain = DOMAIN, tmfc, forecastHours = [], signal, turn = async () => () => {} } = {}) {
  if (domain !== DOMAIN) throw new Error('kim_surface_chart expanded frames need the expanded domain')
  const runDir = resolveKimNwpRunDir({ root, model: KIM_NWP_MODEL, tmfc, domain })
  const failures = []
  let written = 0
  for (const hf of forecastHours) {
    signal?.throwIfAborted()
    if (fs.existsSync(path.join(frameDir({ root, tmfc, hf }), FRAME_META))) continue
    const started = Date.now()
    const release = await turn()
    try {
      writeFrame({ root, tmfc, hf, frame: await buildExpandedChartFrame({ root, tmfc, hf }) })
      written += 1
      appendKimRunEvent(runDir, { type: 'surface_chart_hour', hf, ms: Date.now() - started })
    } catch (error) {
      if (signal?.aborted) throw error
      failures.push({ hf, reason: String(error.code || error.message).slice(0, 200) })
      appendKimRunEvent(runDir, { type: 'surface_chart_hour_failed', hf, ms: Date.now() - started, reason: String(error.code || error.message).slice(0, 200) })
    } finally {
      release?.()
    }
  }
  return { type: 'kim_surface_chart', tmfc, written, failures, saved: failures.length === 0 }
}

// 확대 회차 게시 때: 만들어 둔 장(게시 시각 중 있는 것)을 기존 강수 레이어 위치에 게시한다. 장이 없으면 게시하지 않는다.
export function publishExpandedSurfaceChart({ root = config.storage.base_path, tmfc, hours, now = Date.now() }) {
  if (!expandedChartEnabled()) return null
  const analysisTimeMs = parseTmfcMs(tmfc)
  const frames = []
  for (const hf of hours) {
    const dir = frameDir({ root, tmfc, hf })
    let meta
    try { meta = JSON.parse(fs.readFileSync(path.join(dir, FRAME_META), 'utf8')) } catch { continue }
    frames.push({
      hf,
      validTimeMs: analysisTimeMs + hf * HOUR_MS,
      precipStartMs: analysisTimeMs + Math.max(0, hf - 3) * HOUR_MS,
      isobars: JSON.parse(fs.readFileSync(path.join(dir, 'isobars.json'), 'utf8')),
      centers: JSON.parse(fs.readFileSync(path.join(dir, 'centers.json'), 'utf8')),
      precip: { png: fs.readFileSync(path.join(dir, 'precip3h.png')), maxMm: meta.precipMaxMm },
      wind: JSON.parse(fs.readFileSync(path.join(dir, 'wind.json'), 'utf8')),
    })
  }
  if (!frames.length) return null
  return publishSurfaceChartRun({ root, run: { tmfc, analysisTimeMs, frames }, settings: { ...config.kim_surface_chart, view: expandedChartView() },
    source: EXPANDED_CHART_SOURCE, now })
}

export default { process }
