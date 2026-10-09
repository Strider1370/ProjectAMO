import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../src/config.js'
import { KIM_NWP_MODEL, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { readKimNwpIndex, readKimNwpLatest, writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { collectExpandedRun, kstCutoffMs, publishableHours } from '../src/processors/kim-expanded-collector.js'

const TMFC = '2099010106'
const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-expanded-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }

// 대용량 키: 시험 시계(2099년)에서도 승인 기간 안이 되게 둔다.
test.beforeEach(t => {
  const saved = { key: config.api.kma_bulk_auth_key, bulk: { ...config.kim_bulk } }
  config.api.kma_bulk_auth_key = 'bulk-key'
  config.kim_bulk.valid_until_kst = '2999-12-31'
  t.after(() => { config.api.kma_bulk_auth_key = saved.key; Object.assign(config.kim_bulk, saved.bulk) })
})

// 실제 API 대신 격자를 바로 저장하는 가짜 수집. 시계는 시각 하나에 10분씩 간다.
function harness(root, { failHours = [], flakyTasks = 0, computeFail = [], stepMinutes = 10 } = {}) {
  let clock = kstCutoffMs(TMFC, '20:15')
  const log = []
  const collectTask = async ({ task }) => {
    if (failHours.includes(task.hf)) throw new Error('upstream 500')
    if (flakyTasks > 0) { flakyTasks--; log.push(`flaky:${task.hf}:${task.level.id}`); throw new Error('fetch failed') }
    const grid = { type: 'kim_nwp_grid', model: KIM_NWP_MODEL, tmfc: task.tmfc, hf: task.hf, validTime: addForecastHours(task.tmfc, task.hf), level: task.level,
      grid: { nx: 2, ny: 1, lonMin: 90, lonMax: 90.083333, latMin: 6, latMax: 6 }, variables: { u: { values: [1, 2] }, v: { values: [3, 4] } } }
    writeKimNwpGrid({ root, grid, domain: task.domain })
    return { grid, lastError: null }
  }
  const prefetch = [async ({ hf }) => { log.push(`prefetch:${hf}`); clock += stepMinutes * 60_000 }]
  const runDerived = async (kind, { jobOptions }) => {
    log.push(`${jobOptions.publish ? 'publish' : 'compute'}:${kind}:${jobOptions.forecastHours.join(',')}`)
    if (!jobOptions.publish && computeFail.includes(jobOptions.forecastHours[0])) return { failures: [{ hf: jobOptions.forecastHours[0], reason: 'python_failed' }] }
    return { saved: true, failures: [] }
  }
  return { log, now: () => clock, options: { root, tmfc: TMFC, collectTask, prefetch, runDerived, now: () => clock, retryDelaysMs: [0, 0] } }
}

test('hours are fetched in order and each fetched hour is computed without publishing', async t => {
  const root = temporary(t)
  const { log, options } = harness(root)
  const result = await collectExpandedRun({ ...options, hours: [0, 1, 2], publish: false })
  // 받는 순서와 계산 순서는 각각 앞쪽부터이고, 시각마다 받은 뒤에 계산한다(다음 시각을 받는 동안 계산이 겹칠 수 있다).
  assert.deepEqual(log.filter(entry => entry.startsWith('prefetch')), ['prefetch:0', 'prefetch:1', 'prefetch:2'])
  assert.deepEqual(log.filter(entry => entry.startsWith('compute')), [0, 1, 2].flatMap(hf => [`compute:kim_gktg:${hf}`, `compute:kim_tropopause:${hf}`, `compute:kim_map_responses:${hf}`, `compute:kim_surface_chart:${hf}`]))
  for (const hf of [0, 1, 2]) assert.ok(log.indexOf(`prefetch:${hf}`) < log.indexOf(`compute:kim_gktg:${hf}`))
  assert.equal(result.downloaded, 3)
  assert.equal(result.computed, 3)
  assert.equal(result.published, false)
})

test('new requests stop at 23:50 KST; a run reaching +27h for 06 UTC is published up to its last contiguous hour', async t => {
  const root = temporary(t)
  const { log, options } = harness(root)
  const result = await collectExpandedRun(options)
  // 20:15에 시작해 시각마다 10분: 23:50 전까지 22개 시각(+0~21h)만 받는다 → 06 UTC 기준(+27h) 미달.
  assert.equal(result.stopReason, 'request_cutoff')
  assert.equal(result.downloaded, 22)
  assert.equal(result.published, false)
  assert.equal(readKimNwpLatest(root, 'ea'), null)
  assert.equal(log.some(entry => entry.startsWith('publish')), false)

  const root2 = temporary(t)
  const fast = harness(root2, { stepMinutes: 1 })
  const quick = await collectExpandedRun({ ...fast.options, stopAtMs: Number.POSITIVE_INFINITY, hours: config.kim_expanded.cycles['06'] })
  assert.equal(quick.published, true)
  assert.equal(quick.publishedHours, 33)
  assert.deepEqual(fast.log.filter(entry => entry.startsWith('publish')), ['publish:kim_gktg:' + config.kim_expanded.cycles['06'].join(','), 'publish:kim_tropopause:' + config.kim_expanded.cycles['06'].join(',')])
  assert.equal(readKimNwpLatest(root2, 'ea').latestRun, TMFC)
  assert.deepEqual(readKimNwpIndex(root2, 'ea').times.map(time => time.hf), config.kim_expanded.cycles['06'])
  // 한반도 저장소는 건드리지 않는다.
  assert.equal(readKimNwpLatest(root2), null)
})

test('a missing hour in the middle only drops that hour; a run ending below the minimum keeps the previous run', async t => {
  const root = temporary(t)
  const hours = config.kim_expanded.cycles['06']
  const gap = harness(root, { failHours: [10], stepMinutes: 1 }) // +10h 수집 실패(재시도 후에도)
  const result = await collectExpandedRun({ ...gap.options, stopAtMs: Number.POSITIVE_INFINITY, hours })
  assert.equal(result.published, true)
  assert.equal(result.lastHour, 48)
  assert.equal(result.publishedHours, hours.length - 1)
  const published = readKimNwpIndex(root, 'ea').times.map(time => time.hf)
  assert.equal(published.includes(10), false)
  assert.equal(published.includes(11), true)
  assert.ok(result.failures.some(failure => failure.hf === 10 && failure.stage === 'base'))

  // 06 UTC가 23:50 마감으로 +24h에서 끊기면(기준 +27h 미만) 게시하지 않는다.
  const root2 = temporary(t)
  const cut = harness(root2, { stepMinutes: 1 })
  const short = await collectExpandedRun({ ...cut.options, stopAtMs: Number.POSITIVE_INFINITY, hours: hours.filter(hf => hf <= 24) })
  assert.equal(short.lastHour, 24)
  assert.equal(short.published, false)
})

test('helpers: KST request cutoff and publishable hours', () => {
  assert.equal(new Date(kstCutoffMs('2026100906', '23:50')).toISOString(), '2026-10-09T14:50:00.000Z')
  assert.deepEqual(publishableHours([0, 1, 2, 27], [27, 0, 2, 1], [0, 2, 27]), [0, 2, 27])
})

test('a level that fails once inside an hour is fetched again, and the hour still counts', async t => {
  const root = temporary(t)
  const { log, options } = harness(root, { flakyTasks: 1 })
  const result = await collectExpandedRun({ ...options, hours: [0, 1], publish: false })
  assert.equal(log.filter(entry => entry.startsWith('flaky:')).length, 1)
  assert.equal(result.downloaded, 2)
  assert.deepEqual(result.failures, [])
  const events = fs.readFileSync(path.join(root, 'kim_nwp_ea', 'runs', `KIMG_NE57_${TMFC}`, 'events.jsonl'), 'utf8')
  assert.match(events, /"type":"expanded_hour_retry","hf":0,"attempt":1,"failedTasks":1/)
})

test('ACI input or publication failure does not block the base KIM publication', async t => {
  const root = temporary(t), { options } = harness(root, { stepMinutes: 1 })
  const result = await collectExpandedRun({ ...options, hours:[0,1,27],stopAtMs:Infinity,aciEnabled:true,
    prefetchAci:async({hf})=>{if(hf===1)throw new Error('q2m unavailable')},
    runDerived:async(kind,{jobOptions})=>kind==='kim_aci'?{entries:[{hf:jobOptions.forecastHours[0],revision:'a'.repeat(24)}],failures:[]}:{saved:true,failures:[]},
    publishAci:()=>{throw new Error('ACI publication failed')} })
  assert.equal(result.published,true)
  assert.equal(result.computed,3)
  assert.deepEqual(result.aci,{inputs:2,computed:2,published:0})
  assert.equal(readKimNwpLatest(root,'ea').latestRun,TMFC)
})
