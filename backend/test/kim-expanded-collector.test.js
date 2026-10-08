import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../src/config.js'
import { KIM_NWP_MODEL, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { readKimNwpIndex, readKimNwpLatest, writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { collectExpandedRun, contiguousHours, kstCutoffMs } from '../src/processors/kim-expanded-collector.js'

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
function harness(root, { failHours = [], computeFail = [], stepMinutes = 10 } = {}) {
  let clock = kstCutoffMs(TMFC, '20:15')
  const log = []
  const collectTask = async ({ task }) => {
    if (failHours.includes(task.hf)) throw new Error('upstream 500')
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
  return { log, now: () => clock, options: { root, tmfc: TMFC, collectTask, prefetch, runDerived, now: () => clock } }
}

test('hours are fetched in order and each fetched hour is computed without publishing', async t => {
  const root = temporary(t)
  const { log, options } = harness(root)
  const result = await collectExpandedRun({ ...options, hours: [0, 1, 2], publish: false })
  // 받는 순서와 계산 순서는 각각 앞쪽부터이고, 시각마다 받은 뒤에 계산한다(다음 시각을 받는 동안 계산이 겹칠 수 있다).
  assert.deepEqual(log.filter(entry => entry.startsWith('prefetch')), ['prefetch:0', 'prefetch:1', 'prefetch:2'])
  assert.deepEqual(log.filter(entry => entry.startsWith('compute')), ['compute:kim_gktg:0', 'compute:kim_tropopause:0', 'compute:kim_gktg:1', 'compute:kim_tropopause:1', 'compute:kim_gktg:2', 'compute:kim_tropopause:2'])
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

test('a gap stops the published range; below the minimum the previous run is kept', async t => {
  const root = temporary(t)
  const hours = config.kim_expanded.cycles['06']
  const gap = harness(root, { failHours: [30], stepMinutes: 1 }) // +30h 수집 실패
  const result = await collectExpandedRun({ ...gap.options, stopAtMs: Number.POSITIVE_INFINITY, hours })
  assert.equal(result.lastHour, 27)
  assert.equal(result.published, true)
  assert.deepEqual(readKimNwpIndex(root, 'ea').times.map(time => time.hf).at(-1), 27)
  assert.ok(result.failures.some(failure => failure.hf === 30 && failure.stage === 'base'))

  const root2 = temporary(t)
  const broken = harness(root2, { computeFail: [10], stepMinutes: 1 })
  const short = await collectExpandedRun({ ...broken.options, stopAtMs: Number.POSITIVE_INFINITY, hours })
  assert.equal(short.lastHour, 9)
  assert.equal(short.published, false)
  assert.ok(short.failures.some(failure => failure.hf === 10 && failure.stage === 'compute'))
})

test('helpers: KST request cutoff and contiguous hours', () => {
  assert.equal(new Date(kstCutoffMs('2026100906', '23:50')).toISOString(), '2026-10-09T14:50:00.000Z')
  assert.deepEqual(contiguousHours([0, 1, 2, 27], [0, 1, 27]), [0, 1])
})
