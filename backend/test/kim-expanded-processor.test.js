import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import config from '../src/config.js'
import { KIM_NWP_LEVELS, KIM_NWP_MODEL, addForecastHours } from '../src/processors/kim-nwp-model.js'
import { readKimNwpGrid, readKimNwpIndex, readKimNwpLatest, writeKimNwpGrid } from '../src/processors/kim-nwp-store.js'
import { cropGridDocument, publishKoreaFromExpanded } from '../src/processors/kim-korea-crop.js'
import { expandedAvailability, expandedRunElsewhere, expandedStartBlocked, koreaSixFromExpanded, markExpandedDisabled, processExpandedCycle } from '../src/processors/kim-expanded-processor.js'
import { kstCutoffMs } from '../src/processors/kim-expanded-collector.js'
import { startExpandedMonitor } from '../src/processors/kim-expanded-monitor.js'

const temporary = t => { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'amo-expanded-proc-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return root }
const KST = (date, hhmm) => kstCutoffMs(`${date.replaceAll('-', '')}00`, hhmm)

test.beforeEach(t => {
  const saved = { key: config.api.kma_bulk_auth_key, bulk: { ...config.kim_bulk }, enabled: config.kim_expanded.enabled }
  Object.assign(config.api, { kma_bulk_auth_key: 'bulk-key' })
  Object.assign(config.kim_bulk, { valid_until_kst: '2026-11-06' })
  config.kim_expanded.enabled = true
  t.after(() => { config.api.kma_bulk_auth_key = saved.key; Object.assign(config.kim_bulk, saved.bulk); config.kim_expanded.enabled = saved.enabled })
})

test('availability needs the flag, the bulk key and an unexpired approval; a rejected key stops it for that KST day', t => {
  const root = temporary(t)
  const now = KST('2026-10-09', '15:00')
  assert.deepEqual(expandedAvailability({ root, now }), { available: true, reason: null })
  assert.equal(expandedAvailability({ root, now: KST('2026-11-07', '15:00') }).reason, 'kim_bulk_credential_expired')
  markExpandedDisabled({ root, reason: 'kim_bulk_credential_rejected', now })
  assert.equal(expandedAvailability({ root, now: KST('2026-10-09', '20:15') }).reason, 'kim_bulk_credential_rejected')
  assert.equal(expandedAvailability({ root, now: KST('2026-10-10', '15:00') }).available, true)
  config.kim_expanded.enabled = false
  assert.equal(expandedAvailability({ root, now }).reason, 'kim_expanded_disabled')
})

test('the Korean collector leaves 06 UTC to the expanded crop until 21:30 KST, and only while expanded collection is usable', t => {
  const root = temporary(t)
  assert.equal(koreaSixFromExpanded({ root, tmfc: '2026100906', now: KST('2026-10-09', '20:12') }), true)
  assert.equal(koreaSixFromExpanded({ root, tmfc: '2026100906', now: KST('2026-10-09', '21:31') }), false)
  assert.equal(koreaSixFromExpanded({ root, tmfc: '2026100900', now: KST('2026-10-09', '20:12') }), false)
  config.kim_expanded.enabled = false
  assert.equal(koreaSixFromExpanded({ root, tmfc: '2026100906', now: KST('2026-10-09', '20:12') }), false)
})

// 확대 영역 격자(1/12°)에 칸마다 고유 값을 두고, 한반도로 잘랐을 때 같은 경위도 칸 값이 오는지 본다.
function expandedDoc({ tmfc = '2026100906', hf = 0, level = KIM_NWP_LEVELS[7] } = {}) {
  const grid = { nx: 841, ny: 529, lonMin: 90, latMin: 6, lonMax: 160, latMax: 50, dx: 0.083333, dy: 0.083333 }
  const values = Array.from({ length: grid.nx * grid.ny }, (_, i) => i % 30000)
  return { type: 'kim_nwp_grid', model: KIM_NWP_MODEL, tmfc, hf, validTime: addForecastHours(tmfc, hf), level, grid,
    variables: { u: { unit: 'm/s', encoding: 'int16-scaled-json-v1', scale: 0.01, offset: 0, values }, v: { unit: 'm/s', encoding: 'int16-scaled-json-v1', scale: 0.01, offset: 0, values } },
    fetched_at: '2099-01-01T00:00:00.000Z' }
}

test('cropping keeps the same lon/lat cells and the Korean grid description', () => {
  const doc = expandedDoc()
  const korea = config.kim_surface_wind.bounds
  const crop = cropGridDocument(doc, korea)
  assert.deepEqual(crop.grid, { nx: 205, ny: 169, lonMin: 119, latMin: 30, lonMax: 136, latMax: 44, dx: 0.083333, dy: 0.083333 })
  assert.deepEqual(Object.keys(crop.grid), ['nx', 'ny', 'lonMin', 'latMin', 'lonMax', 'latMax', 'dx', 'dy'])
  const at = (g, values, lon, lat) => values[Math.round((lat - g.latMin) * 12) * g.nx + Math.round((lon - g.lonMin) * 12)]
  for (const [lon, lat] of [[119, 30], [136, 44], [126.5, 37.5], [129.25, 35.0833333]]) {
    assert.equal(at(crop.grid, crop.variables.u.values, lon, lat), at(doc.grid, doc.variables.u.values, lon, lat))
  }
  assert.equal(crop.variables.u.scale, 0.01)
  assert.throws(() => cropGridDocument({ ...doc, grid: { ...doc.grid, lonMin: 125, lonMax: 195 } }, korea), /outside/)
})

test('a full expanded +0~12h is cropped and published as the Korean run once', t => {
  const root = temporary(t)
  const tmfc = '2026100906'
  const hours = [0, 1]
  for (const hf of hours) for (const level of KIM_NWP_LEVELS) writeKimNwpGrid({ root, grid: expandedDoc({ tmfc, hf, level }), domain: 'ea' })
  const published = publishKoreaFromExpanded({ root, tmfc, hours })
  assert.equal(published.saved, true)
  assert.equal(published.grids, hours.length * KIM_NWP_LEVELS.length)
  assert.equal(readKimNwpLatest(root).latestRun, tmfc)
  assert.equal(readKimNwpLatest(root).source, 'expanded_crop')
  assert.deepEqual(readKimNwpIndex(root).times.map(time => time.hf), hours)
  assert.equal(readKimNwpGrid({ root, model: KIM_NWP_MODEL, tmfc, hf: 1, levelId: '850hPa' }).grid.nx, 205)
  assert.equal(publishKoreaFromExpanded({ root, tmfc, hours }).reason, 'kim_korea_run_already_complete')
})

test('a cycle job skips when unusable or short of disk, crops Korea from 06 UTC, and 06 UTC stops a running 00 UTC resume', async t => {
  const root = temporary(t)
  let now = KST('2026-10-09', '20:15')
  config.kim_expanded.enabled = false
  const off = await processExpandedCycle({ cycle: '06', root, now: () => now })
  assert.equal(off.collection.outcome, 'empty')
  config.kim_expanded.enabled = true
  const full = await processExpandedCycle({ cycle: '06', root, now: () => now, diskFree: () => 1e9 })
  assert.equal(full.reason, 'disk_reserve')

  // 00 UTC 이어받기가 도는 중 06 UTC가 시작되면 00 UTC는 다음 시각부터 받지 않는다.
  let releaseZero
  const zeroStops = []
  const zero = processExpandedCycle({ cycle: '00', root, now: () => now, diskFree: () => 1e12,
    collect: async ({ beforeHour }) => { await new Promise(resolve => { releaseZero = resolve }); zeroStops.push(beforeHour({ hf: 5 })); return { published: false, stopReason: zeroStops[0], planned: 29 } } })
  let koreaCalls = 0
  let koreaPublished = 0
  const six = await processExpandedCycle({ cycle: '06', root, now: () => now, diskFree: () => 1e12,
    cropKorea: () => { koreaCalls++; return { saved: true } }, onKoreaPublished: async () => { koreaPublished++ },
    collect: async ({ onHourDownloaded, hours }) => {
      for (let hf = 0; hf <= 12; hf++) await onHourDownloaded({ hf, downloaded: Array.from({ length: hf + 1 }, (_, i) => i) })
      await onHourDownloaded({ hf: 13, downloaded: Array.from({ length: 14 }, (_, i) => i) })
      return { published: true, publishedHours: hours.length, planned: hours.length }
    } })
  releaseZero()
  const zeroResult = await zero
  assert.deepEqual(zeroStops, ['next_cycle_started'])
  assert.equal(zeroResult.collection.outcome, 'failed')
  assert.equal(six.collection.outcome, 'complete')
  assert.equal(koreaCalls, 1)
  assert.equal(koreaPublished, 1)
})

test('06 UTC crops Korea GKTG once both the Korea crop and its hours\' GKTG are ready, and falls back to the Korea calculation otherwise', async t => {
  const now = KST('2026-10-09', '20:15')
  const koreaHours = config.kim_nwp.forecast_hours
  const results = new Map(koreaHours.map(hf => [hf, { hf }]))
  const run = async ({ computeFirst = false, crop = async () => ({ revision: 'r', entries: [] }), compute = true } = {}) => {
    const calls = { crop: 0, fallback: 0, hours: null }
    // 실행마다 새 저장소: 같은 회차를 다시 시작하면 재시도 간격(retry_gap_minutes) 때문에 건너뛴다.
    const root = temporary(t)
    await processExpandedCycle({ cycle: '06', root, now: () => now, diskFree: () => 1e12, cropKorea: () => ({ saved: true }),
      cropKoreaGktg: async ({ hours, hourResults }) => { calls.crop++; calls.hours = hours; assert.equal(hourResults.length, hours.length); return crop() },
      onKoreaGktgFallback: async () => { calls.fallback++ },
      collect: async ({ onHourDownloaded, onGktgComputed, hours }) => {
        if (computeFirst && compute) await onGktgComputed({ hf: 12, results })
        for (let hf = 0; hf <= 12; hf++) await onHourDownloaded({ hf, downloaded: Array.from({ length: hf + 1 }, (_, i) => i) })
        if (!computeFirst && compute) {
          await onGktgComputed({ hf: 5, results: new Map([...results].filter(([hf]) => hf <= 5)) })
          await onGktgComputed({ hf: 12, results })
          await onGktgComputed({ hf: 13, results })
        }
        return { published: true, publishedHours: hours.length, planned: hours.length }
      } })
    return calls
  }
  assert.deepEqual(await run(), { crop: 1, fallback: 0, hours: koreaHours })
  assert.deepEqual(await run({ computeFirst: true }), { crop: 1, fallback: 0, hours: koreaHours })
  assert.deepEqual(await run({ crop: async () => { throw new Error('boom') } }), { crop: 1, fallback: 1, hours: koreaHours })
  assert.deepEqual(await run({ compute: false }), { crop: 0, fallback: 1, hours: null })
})

test('the memory monitor logs samples and stops new hours after three low readings in a row', async t => {
  const root = temporary(t)
  const readings = [900, 200, 200, 600, 200, 200, 200].map(mib => mib * 1048576)
  const monitor = startExpandedMonitor({ runDir: root, intervalMs: 3_600_000, readAvailable: () => readings.shift(),
    sample: () => ({ selfRss: 300 * 1048576, childrenRss: 500 * 1048576, swapUsed: 0 }) })
  const reasons = []
  for (let i = 0; i < 6; i++) { monitor.tick(); reasons.push(monitor.stopReason()) }
  const peak = monitor.stop()
  assert.deepEqual(reasons, [null, null, null, null, null, 'memory_reserve'])
  assert.equal(peak.minAvailableMiB, 200)
  assert.equal(peak.maxChildrenRssMiB, 500)
  assert.equal(peak.samples, 7)
  assert.equal(fs.readFileSync(path.join(root, 'monitor.jsonl'), 'utf8').trim().split('\n').length, 7)

  // 회차 작업은 감시 결과를 수집 중단 이유로 쓰고, 최댓값을 결과에 싣는다.
  const now = KST('2026-10-09', '20:15')
  let asked
  const result = await processExpandedCycle({ cycle: '06', root, now: () => now, diskFree: () => 1e12,
    startMonitor: () => ({ stopReason: () => 'memory_reserve', stop: () => ({ minAvailableMiB: 180 }) }),
    collect: async ({ beforeHour }) => { asked = beforeHour({ hf: 3 }); return { published: true, publishedHours: 28, planned: 33, stopReason: asked } } })
  assert.equal(asked, 'memory_reserve')
  assert.deepEqual(result.memory, { minAvailableMiB: 180 })
  assert.equal(result.collection.outcome, 'partial')
})

test('a run already going in another process makes the scheduled run skip; a stale lock is ignored and the lock is removed after', async t => {
  const root = temporary(t)
  const now = KST('2026-10-09', '17:00')
  const lock = path.join(root, 'kim_nwp_ea', 'run-00.lock')
  fs.mkdirSync(path.dirname(lock), { recursive: true })
  fs.writeFileSync(lock, JSON.stringify({ pid: process.ppid, tmfc: '2026100900' }))
  let collected = 0
  const collect = async () => { collected++; assert.equal(JSON.parse(fs.readFileSync(lock, 'utf8')).pid, process.pid); return { published: false, planned: 29 } }
  const skipped = await processExpandedCycle({ cycle: '00', root, now: () => now, diskFree: () => 1e12, collect })
  assert.equal(skipped.reason, 'kim_expanded_running_elsewhere')
  assert.equal(skipped.collection.outcome, 'empty')
  assert.equal(collected, 0)

  fs.writeFileSync(lock, JSON.stringify({ pid: 2 ** 22 + 12345, tmfc: '2026100900' }))
  assert.equal(expandedRunElsewhere(root, '00'), null)
  await processExpandedCycle({ cycle: '00', root, now: () => now, diskFree: () => 1e12, collect })
  assert.equal(collected, 1)
  assert.equal(fs.existsSync(lock), false)
})

test('06 UTC starts as soon as +0h is on KMA, starts without checking from 20:15, and waits retry_gap_minutes before retrying an unfinished run', async t => {
  const root = temporary(t)
  let now = KST('2026-10-09', '18:00')
  const checks = []
  let uploaded = false
  const checkUploaded = async (args) => { checks.push(args); if (uploaded === 'error') throw new Error('fetch failed'); return uploaded }
  let collected = 0
  const collect = async ({ hours }) => { collected++; now += 30 * 60_000; return { published: true, publishedHours: hours.length - 1, planned: hours.length } }
  const tick = () => processExpandedCycle({ cycle: '06', root, now: () => now, diskFree: () => 1e12, checkUploaded, collect })

  assert.equal((await tick()).reason, 'kim_expanded_not_uploaded')
  assert.deepEqual(checks.map(({ tmfc, hf, credential }) => ({ tmfc, hf, credential })), [{ tmfc: '2026100906', hf: 0, credential: 'bulk-key' }])
  uploaded = 'error'
  const failedCheck = await tick()
  assert.equal(failedCheck.reason, 'kim_expanded_upload_check_failed')
  assert.equal(failedCheck.collection.outcome, 'empty')
  assert.equal(collected, 0)

  uploaded = true
  assert.equal((await tick()).collection.outcome, 'partial')
  assert.equal(collected, 1)
  // 덜 끝난 회차(18:30에 끝남): 60분이 지나기 전에는 다시 시작하지 않고, 확인 요청도 보내지 않는다.
  now += 59 * 60_000
  const checksBefore = checks.length
  assert.equal((await tick()).reason, 'kim_expanded_retry_wait')
  assert.equal(checks.length, checksBefore)
  now += 60_000
  await tick()
  assert.equal(collected, 2)

  // 다른 날: 20:15가 지나면 확인 없이 시작한다. 00 UTC는 확인하지 않는다.
  const other = temporary(t)
  checks.length = 0
  uploaded = false
  now = KST('2026-10-10', '20:15')
  await processExpandedCycle({ cycle: '06', root: other, now: () => now, diskFree: () => 1e12, checkUploaded, collect })
  now = KST('2026-10-10', '15:00')
  await processExpandedCycle({ cycle: '00', root: other, now: () => now, diskFree: () => 1e12, checkUploaded, collect })
  assert.equal(checks.length, 0)
  assert.equal(collected, 4)
  assert.equal(await expandedStartBlocked({ root: other, cycle: '00', tmfc: '2026101000', now, checkUploaded }), null)
})
