import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import config from '../src/config.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, buildKimNwpGrid } from '../src/processors/kim-nwp-model.js'
import { writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { readSurfaceChartLatest, process as processLegacyChart } from '../src/processors/kim-surface-chart-processor.js'
import { prefetchSurfaceChartInputs, process as buildFrames, publishExpandedSurfaceChart } from '../src/processors/kim-surface-chart-expanded.js'

const STEP = 1 / 12
const BOUNDS = { lonMin: 120, latMin: 30, lonMax: 130, latMax: 38, dx: STEP, dy: STEP }
const NX = 10 * 12 + 1
const NY = 8 * 12 + 1
const TMFC = '2026100906'

function gridText(valueAt) {
  const rows = [`# 변수명 = x, unit = x, level = 0, i = ${NX}, j = ${NY}, map = S`]
  for (let j = 0; j < NY; j += 1) {
    const row = []
    for (let i = 0; i < NX; i += 1) row.push(valueAt(BOUNDS.lonMin + i * STEP, BOUNDS.latMin + j * STEP).toExponential(5))
    rows.push(row.join(' '))
  }
  return rows.join('\n')
}
const lowPressure = (lon, lat) => 101_200 - 2_000 * Math.exp(-(((lon - 125) ** 2) + ((lat - 34) ** 2)) / (2 * 2 ** 2))
// 누적강수: 시각마다 1 mm씩 는다(직전 3시간 = 3 mm, +1h는 1 mm).
const precAt = (hf) => () => hf

test.beforeEach(t => {
  const saved = { bounds: config.kim_expanded.bounds, sub: config.kim_expanded.sub, key: config.api.kma_bulk_auth_key, from: config.kim_surface_chart.from_expanded, enabled: config.kim_expanded.enabled }
  Object.assign(config.kim_expanded, { bounds: BOUNDS, sub: '1441,1441,1561,1537', enabled: true })
  config.api.kma_bulk_auth_key = 'bulk-key'
  config.kim_surface_chart.from_expanded = true
  t.after(() => { Object.assign(config.kim_expanded, { bounds: saved.bounds, sub: saved.sub, enabled: saved.enabled }); config.api.kma_bulk_auth_key = saved.key; config.kim_surface_chart.from_expanded = saved.from })
})

test('expanded run fetches psl and accumulated precipitation per hour, builds hourly frames and publishes them as the precip layer', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-chart-ea-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const level = KIM_NWP_LEVELS.find(entry => entry.id === '10m')
  const calls = []
  const fetchGrid = async (params) => { calls.push(`${params.name}:${params.hf}:${params.credential}:${params.sub}`); return gridText(params.name === 'psl' ? lowPressure : precAt(params.hf)) }
  const hours = [0, 1, 2, 3, 4]
  for (const hf of hours) {
    writeKimNwpGrid({ root, domain: 'ea', grid: buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc: TMFC, hf, level, fetchedAt: '2099-01-01T00:00:00.000Z',
      components: [{ variable: 'u', unit: 'm/s', level: 0, nx: NX, ny: NY, bounds: BOUNDS, values: Array(NX * NY).fill(5) },
        { variable: 'v', unit: 'm/s', level: 0, nx: NX, ny: NY, bounds: BOUNDS, values: Array(NX * NY).fill(-3) }] }) })
    await prefetchSurfaceChartInputs({ root, domain: 'ea', tmfc: TMFC, hf, fetchGrid })
  }
  await prefetchSurfaceChartInputs({ root, domain: 'ea', tmfc: TMFC, hf: 1, fetchGrid }) // 이미 받은 시각은 다시 받지 않는다.
  await prefetchSurfaceChartInputs({ root, domain: 'kr', tmfc: TMFC, hf: 1, fetchGrid }) // 한반도 회차는 대상이 아니다.
  assert.deepEqual(calls, ['psl:0:bulk-key:1441,1441,1561,1537', ...[1, 2, 3, 4].flatMap(hf => [`psl:${hf}:bulk-key:1441,1441,1561,1537`, `prec_acc:${hf}:bulk-key:1441,1441,1561,1537`])])

  const result = await buildFrames({ root, tmfc: TMFC, forecastHours: hours })
  assert.deepEqual(result.failures, [])
  assert.equal(result.written, 5)
  assert.equal((await buildFrames({ root, tmfc: TMFC, forecastHours: hours })).written, 0)

  const latest = publishExpandedSurfaceChart({ root, tmfc: TMFC, hours, now: Date.parse('2026-10-09T13:00:00Z') })
  const run = latest.runs[0]
  assert.equal(run.source, 'kim_expanded')
  assert.deepEqual(run.view, { lonMin: 120, lonMax: 130, latMin: 30, latMax: 38 })
  assert.deepEqual(run.frames.map(frame => frame.hf), hours)
  // 직전 3시간 강수: +0h 0, +1h 1 mm(시작부터), +3h 3 mm, +4h 4−1 = 3 mm.
  assert.deepEqual(run.frames.map(frame => frame.precipMaxMm), [0, 1, 2, 3, 3])
  assert.equal(run.frames[3].precipStartMs, Date.parse('2026-10-09T06:00:00Z'))
  assert.equal(run.frames[4].precipStartMs, Date.parse('2026-10-09T07:00:00Z'))
  // 가장자리 3° 안쪽(123~127°E, 33~35°N)의 저기압 중심만 표시한다.
  const centers = JSON.parse(fs.readFileSync(path.join(root, run.frames[1].path, 'centers.json'), 'utf8'))
  assert.equal(centers.features.length, 1)
  assert.equal(centers.features[0].properties.kind, 'L')
  assert.equal(readSurfaceChartLatest(root).latestRun, TMFC)
})

test('the legacy precip collector skips while a recent expanded chart run exists and expanded collection is usable', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-chart-ea-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  fs.mkdirSync(path.join(root, 'kim_surface_chart', 'runs', `KIMG_NE57_${TMFC}`), { recursive: true })
  fs.writeFileSync(path.join(root, 'kim_surface_chart', 'runs', `KIMG_NE57_${TMFC}`, 'manifest.json'), '{}')
  fs.writeFileSync(path.join(root, 'kim_surface_chart', 'latest.json'), JSON.stringify({ runs: [{ runId: `KIMG_NE57_${TMFC}`, tmfc: TMFC, source: 'kim_expanded', analysisTimeMs: Date.parse('2026-10-09T06:00:00Z') }] }))
  let fetched = 0
  const settings = { ...config.kim_surface_chart, from_expanded: true }
  const args = { root, settings, credential: 'radar-key', candidates: [{ tmfc: '2026100912', hf: 0 }], fetchGrid: async () => { fetched++; return '# file is not exist\n' } }
  const skipped = await processLegacyChart({ ...args, now: () => Date.parse('2026-10-09T20:00:00Z') })
  assert.equal(skipped.reason, 'kim_surface_chart_from_expanded')
  assert.equal(fetched, 0)
  // 확대 런이 36시간 넘게 지나면 기존 방식으로 받는다.
  await assert.rejects(processLegacyChart({ ...args, now: () => Date.parse('2026-10-11T00:00:00Z') }))
  assert.ok(fetched > 0)
})
