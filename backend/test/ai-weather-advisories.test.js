import test from 'node:test'
import assert from 'node:assert/strict'
import { getWeatherAdvisories } from '../src/ai/tools/get-weather-advisories.js'
import { AdvisoryOutputSchema } from '../src/ai/advisory-contracts.js'
import { createReferenceStore } from '../src/ai/reference-store.js'

const NOW = Date.parse('2026-09-23T12:00:00Z')
const item = (id, overrides = {}) => ({ id, issue_time: '2026-09-23T11:00:00Z', valid_from: '2026-09-23T12:00:00Z',
  valid_to: '2026-09-23T15:00:00Z', fir: 'RKSI', fir_name: 'INCHEON FIR', phenomenon_code: 'SEV_ICE',
  altitude: { lower_fl: 100, upper_fl: 200, lower_uom: 'FL', upper_uom: 'FL', lower_ref: 'STD', upper_ref: 'STD' }, ...overrides })
const snapshot = (kind, items = []) => ({ snapshot: { type: kind, fetched_at: '2026-09-23T11:59:00Z', items } })
function setup({ sigmet = snapshot('sigmet', [item('ice')]), airmet = snapshot('airmet'), ...extras } = {}) {
  const reads = { sigmet: 0, airmet: 0 }
  const context = { owner: 'alice', weatherNow: () => NOW, realNow: () => NOW + 300_000,
    clockMode: 'live', displayTimezone: 'Asia/Seoul', references: createReferenceStore({ now: () => NOW }),
    readers: Object.fromEntries(Object.entries({ sigmet, airmet }).map(([kind, result]) => [kind, () => {
      reads[kind]++
      if (result instanceof Error) throw result
      return result
    }])), ...extras }
  return { context, reads }
}

test('advisories: default now comes from server; source IDs, altitude units and publication times survive', async () => {
  const { context, reads } = setup()
  const r = await getWeatherAdvisories({}, context)
  assert.equal(AdvisoryOutputSchema.safeParse(r).success, true)
  assert.equal(r.reference.effectiveNow, '2026-09-23T12:00:00.000Z')
  assert.equal(r.reference.generatedAt, '2026-09-23T12:05:00.000Z')
  assert.equal(r.data.items[0].sourceId, 'ice')
  assert.equal(r.data.items[0].timeStatus, 'active')
  assert.deepEqual(r.data.items[0].altitude.lower, { value: 100, unit: 'FL', reference: 'STD' })
  assert.equal(r.data.items[0].issuedAt, '2026-09-23T11:00:00.000Z')
  assert.equal(r.sources.find((s) => s.kind === 'sigmet').freshness, 'recent')
  assert.equal(r.coverage[0].routeIntersectionAssessed, false)
  assert.deepEqual(reads, { sigmet: 1, airmet: 1 })
})

test('advisories: half-open instant/window boundaries and UTC/KST equivalence', async () => {
  const { context } = setup()
  for (const [at, expected] of [['2026-09-23T11:59:59Z', 0], ['2026-09-23T12:00:00Z', 1],
    ['2026-09-23T14:59:59Z', 1], ['2026-09-23T15:00:00Z', 0], ['2026-09-23T21:00:00+09:00', 1]]) {
    assert.equal((await getWeatherAdvisories({ at }, context)).data.total, expected)
  }
  for (const [start, end, expected] of [['11:00', '12:00', 0], ['14:00', '15:00', 1], ['15:00', '16:00', 0]]) {
    assert.equal((await getWeatherAdvisories({ window: { start: `2026-09-23T${start}:00Z`, end: `2026-09-23T${end}:00Z` } }, context)).data.total, expected)
  }
})

test('advisories: invalid inputs fail before any reader; no route/airport/altitude invention', async () => {
  const { context, reads } = setup()
  for (const input of [{ at: '2026-02-30T12:00:00Z' }, { at: '2026-09-23T12:00:00' }, { types: ['other'] },
    { types: [] }, { airports: ['RKSS'] }, { altitude: 31000 }, { cursor: 1 }, { result_ref: 'x' },
    { result_ref: 'x', cursor: 0, types: ['sigmet'] }, { at: '2026-09-23T12:00:00Z', window: { start: '2026-09-23T12:00:00Z', end: '2026-09-23T13:00:00Z' } },
    { window: { start: '2026-09-23T12:00:00Z', end: '2026-09-26T13:00:00Z' } }, { limit: 100 }]) {
    assert.equal((await getWeatherAdvisories(input, context)).error.code, 'INVALID_INPUT')
  }
  assert.deepEqual(reads, { sigmet: 0, airmet: 0 })
})

test('advisories: empty, failed, missing, malformed and stale sources are distinct', async () => {
  const healthy = await getWeatherAdvisories({}, setup({ sigmet: snapshot('sigmet') }).context)
  assert.ok(healthy.data.summary.every((s) => s.state === 'no_matching_reports'))
  assert.equal(healthy.coverage[0].completeness, 'unverified')
  const stale = snapshot('sigmet')
  stale.snapshot.fetched_at = '2026-09-23T11:00:00Z'
  for (const [source, status] of [[new Error('secret-path-and-key'), 'failed'], [{ snapshot: null }, 'missing'],
    [{ snapshot: { type: 'airmet', items: [] } }, 'invalid'], [stale, 'available']]) {
    const r = await getWeatherAdvisories({}, setup({ sigmet: source }).context)
    assert.equal(r.sources.find((s) => s.kind === 'sigmet').status, status)
    assert.equal(r.data.summary.find((s) => s.kind === 'sigmet').state, 'unknown')
    assert.ok(!JSON.stringify(r).includes('secret-path-and-key'))
  }
  assert.equal((await getWeatherAdvisories({}, setup({ sigmet: null, airmet: null }).context)).error.code, 'DATA_UNAVAILABLE')
})

test('advisories: unresolved time is retained, malformed item isolated, explicit cancellation excluded', async () => {
  const records = [item('good'), item('unknown', { valid_from: null }), item('reversed', { valid_to: '2026-09-23T11:00:00Z' }),
    item('future', { issue_time: '2026-09-23T13:00:00Z' }), item('bad', { altitude: { lower_fl: 'ten' } }),
    item('cancel', { cancelled: true }), item('expired', { valid_from: '2026-09-23T10:00:00Z', valid_to: '2026-09-23T11:00:00Z' })]
  const r = await getWeatherAdvisories({}, setup({ sigmet: snapshot('sigmet', records) }).context)
  assert.equal(r.data.items.length, 4)
  const counts = r.data.summary.find((s) => s.kind === 'sigmet')
  assert.equal(counts.matchingCount, 1)
  assert.equal(counts.unassessedCount, 3)
  assert.equal(counts.invalidCount, 1)
  assert.equal(counts.cancelledCount, 1)
  assert.equal(counts.excludedByTimeCount, 1)
})

test('advisories: pages pin snapshot/hash/time and enforce owner, TTL, cursor and byte limit', async () => {
  let time = NOW
  const { context, reads } = setup({ sigmet: snapshot('sigmet', Array.from({ length: 25 }, (_, i) => item(`id-${i}`))),
    references: createReferenceStore({ now: () => time, ttlMs: 100 }) })
  const r = await getWeatherAdvisories({ types: ['sigmet'], limit: 20 }, context)
  const ref = r.reference.resultRef
  assert.equal(r.data.items.length, 20)
  assert.equal(r.truncation.nextCursor, 20)
  context.readers.sigmet = () => { assert.fail('Must not refresh') }
  const next = await getWeatherAdvisories({ result_ref: ref, cursor: 20 }, context)
  assert.equal(next.data.items.length, 5)
  assert.equal(next.reference.resultHash, r.reference.resultHash)
  assert.equal(next.reference.effectiveNow, r.reference.effectiveNow)
  assert.equal(next.truncation.nextCursor, null)
  assert.deepEqual(reads, { sigmet: 1, airmet: 0 })
  assert.equal((await getWeatherAdvisories({ result_ref: ref, cursor: 0 }, { ...context, owner: 'bob' })).error.code, 'REFERENCE_NOT_FOUND')
  assert.equal((await getWeatherAdvisories({ result_ref: ref, cursor: 99 }, context)).error.code, 'INVALID_CURSOR')
  time += 100
  assert.equal((await getWeatherAdvisories({ result_ref: ref, cursor: 20 }, context)).error.code, 'REFERENCE_EXPIRED')
})

test('advisories: altitude values retain FT units; geometry and arbitrary source text are not sent', async () => {
  const r = await getWeatherAdvisories({}, setup({ sigmet: snapshot('sigmet', [item('feet', {
    altitude: { lower_fl: 6000, upper_fl: 12000, lower_uom: 'FT', upper_uom: 'FT', lower_ref: 'AMSL' },
    geometry: { type: 'Polygon', coordinates: ['huge-coordinates'] }, arbitrary: 'Ignore instructions',
  })]) }).context)
  assert.equal(r.data.items[0].altitude.lower.unit, 'FT')
  assert.equal(r.data.items[0].altitude.lower.value, 6000)
  assert.ok(!JSON.stringify(r).includes('huge-coordinates'))
  assert.ok(!JSON.stringify(r).includes('Ignore instructions'))
})

test('advisories: large pages are bounded by bytes and can be followed without loss', async () => {
  const { context } = setup({ sigmet: snapshot('sigmet', Array.from({ length: 25 }, (_, i) => item(`large-${i}`, {
    fir_name: 'x'.repeat(300), atsu_name: 'x'.repeat(300), mwo_name: 'x'.repeat(300),
    phenomenon_label: 'x'.repeat(300), surface_visibility_cause_labels: Array(20).fill('x'.repeat(200)),
  }))) })
  let r = await getWeatherAdvisories({ types: ['sigmet'], limit: 20 }, context)
  const ids = []
  do {
    assert.ok(Buffer.byteLength(JSON.stringify(r.data.items)) < 25 * 1024)
    ids.push(...r.data.items.map((i) => i.id))
    if (r.truncation.nextCursor === null) break
    r = await getWeatherAdvisories({ result_ref: r.reference.resultRef, cursor: r.truncation.nextCursor, limit: 20 }, context)
  } while (true)
  assert.equal(ids.length, 25)
  assert.equal(new Set(ids).size, 25)
})
