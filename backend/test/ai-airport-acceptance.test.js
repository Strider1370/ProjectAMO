import test from 'node:test'
import assert from 'node:assert/strict'
import { createDataContext } from '../src/ai/data-context.js'
import { getAirportWeather } from '../src/ai/tools/get-airport-weather.js'

// Coordinator-owned acceptance cases: independent of the implementation fixture.
const epoch = Date.parse('2026-12-31T15:00:00Z')
const iso = hours => new Date(epoch + hours * 3_600_000).toISOString()
const input = (start = 0, end = 2) => ({ airports: ['김포'], window: { start: iso(start), end: iso(end) } })
function reports() {
  const clouds = [{ amount: 'BKN', base: 800, type: null, raw: 'BKN008' }]
  const wind = { direction: 180, speed: 12, gust: 24, unit: 'KT', variable: false, calm: false }
  return {
    metar: { fetched_at: iso(0), airports: { RKSS: {
      header: { icao: 'RKSS', report_type: 'METAR', observation_time: iso(0), issue_time: iso(0), source: { identifier: 'KMA' } },
      observation: { wind, visibility: { value: 3200, cavok: false }, clouds,
        weather: [{ raw: 'BR' }], temperature: { air: 10, dewpoint: 8 }, qnh: { value: 1010, unit: 'hPa' }, rvr: [] },
      trend: [],
    } } },
    taf: { fetched_at: iso(0), airports: { RKSS: {
      header: { icao: 'RKSS', issued: iso(-1), valid_start: iso(0), valid_end: iso(3), source: { identifier: 'KMA' } },
      base: { wind, vis: 3200, cavok_flag: false, clouds, wx: [{ raw: 'BR' }] },
      change_groups: [], timeline: [0, 1, 2].map(hour => ({ time: iso(hour), visibility: { value: 3200, cavok: false }, clouds, weather: [{ raw: 'BR' }] })),
    } } },
    warning: { fetched_at: iso(0), total_count: 0, airports: {} },
  }
}
function context(snapshots = reports(), overrides = {}) {
  return createDataContext({
    readers: Object.fromEntries(Object.entries(snapshots).map(([kind, snapshot]) => [kind, async () => ({
      snapshot, meta: { collectionStatus: kind === 'warning' ? 'empty' : 'complete' },
    })])),
    weatherNow: () => epoch, realNow: () => epoch + 1000,
    clockMode: 'fixture', displayTimezone: 'Asia/Seoul', ...overrides,
  })
}

test('1A acceptance: coverage matches interval arithmetic including exact boundaries', async () => {
  for (const start of [-2, -1, 0, 0.5, 1, 2, 3, 4]) {
    for (const duration of [0.5, 1, 2, 4]) {
      const end = start + duration
      const result = await getAirportWeather(input(start, end), context())
      assert.notEqual(result.status, 'error')
      const overlapStart = Math.max(start, 0), overlapEnd = Math.min(end, 3)
      const coverage = result.coverage.find(item => item.icao === 'RKSS')
      const overlap = overlapStart < overlapEnd
      assert.equal(coverage.state, !overlap ? 'none' : start >= 0 && end <= 3 ? 'full' : 'partial')
      assert.deepEqual(coverage.intersection, overlap ? { start: iso(overlapStart), end: iso(overlapEnd) } : null)
      assert.deepEqual(result.data.airports[0].taf.samples.map(sample => sample.time),
        [0, 1, 2].filter(hour => hour >= start && hour < end).map(iso))
    }
  }
})

test('1A acceptance: equivalent UTC and KST year-boundary windows preserve instants', async () => {
  const utc = await getAirportWeather(input(), context())
  const kst = await getAirportWeather({ airports: ['RKSS'], window: {
    start: '2027-01-01T00:00:00+09:00', end: '2027-01-01T02:00:00+09:00',
  } }, context())
  assert.deepEqual(kst.data, utc.data)
  assert.deepEqual(kst.coverage, utc.coverage)
  assert.equal(kst.reference.displayTimezone, 'Asia/Seoul')
})

test('1A acceptance: invalid leap date and model-supplied context never call readers', async () => {
  let calls = 0
  const reader = async () => { calls++; throw new Error('must not read') }
  for (const query of [
    { ...input(), userId: 'other-user' },
    { ...input(), window: { start: '2026-02-29T00:00:00Z', end: '2026-03-01T01:00:00Z' } },
    { ...input(), window: { ...input().window, timezone: 'UTC' } },
    { ...input(), includeRaw: 'false' },
  ]) {
    const result = await getAirportWeather(query, context(undefined, { readers: { metar: reader, taf: reader, warning: reader } }))
    assert.equal(result.status, 'error')
    assert.equal(result.error.code, 'INVALID_INPUT')
  }
  assert.equal(calls, 0)
})

test('1A acceptance: malformed selected source is isolated rather than discarded as internal error', async () => {
  for (const mutate of [
    value => { value.taf.airports.RKSS.header.icao = 'RKPC' },
    value => { value.taf.airports.RKSS.timeline[0].visibility.value = Infinity },
    value => { value.taf.airports.RKSS.change_groups = Array.from({ length: 201 }, () => ({})) },
  ]) {
    const snapshots = reports()
    mutate(snapshots)
    const result = await getAirportWeather(input(), context(snapshots))
    assert.equal(result.status, 'partial')
    assert.equal(result.error, null)
    assert.ok(result.data.airports[0].metar)
    assert.equal(result.data.airports[0].taf, null)
    assert.ok(result.issues.some(issue => issue.code === 'INVALID_SOURCE' && issue.kind === 'taf'))
  }
})

test('1A acceptance: reader failures do not leak error text or erase other weather', async () => {
  const snapshots = reports()
  const result = await getAirportWeather(input(), context(snapshots, { readers: {
    metar: async () => ({ snapshot: snapshots.metar }),
    taf: async () => { throw new Error('secret=DO_NOT_EXPOSE /private/config') },
    warning: async () => ({ snapshot: snapshots.warning }),
  } }))
  assert.equal(result.status, 'partial')
  assert.equal(result.data.airports[0].warnings.status, 'unknown')
  assert.ok(result.issues.some(issue => issue.code === 'READ_FAILED'))
  assert.doesNotMatch(JSON.stringify(result), /DO_NOT_EXPOSE|private\/config/)
})

test('1A acceptance: important unprojected weather cannot become a complete digest', async () => {
  const snapshots = reports()
  snapshots.metar.airports.RKSS.trend = ['TEMPO 1000 FG']
  snapshots.metar.airports.RKSS.observation.wind_shear = { all_runways: true, runways: null }
  const result = await getAirportWeather(input(), context(snapshots))
  assert.equal(result.status, 'partial')
  const paths = result.issues.filter(issue => issue.code === 'NON_PROJECTED_SIGNIFICANT_DATA').map(issue => issue.path)
  assert.ok(paths.includes('trend'))
  assert.ok(paths.includes('observation.wind_shear'))
})

test('1A acceptance: snapshots are read once per type even for duplicate airport aliases', async () => {
  const snapshots = reports(), calls = { metar: 0, taf: 0, warning: 0 }
  const result = await getAirportWeather({ ...input(), airports: ['김포', 'RKSS', '김포국제공항'] }, context(snapshots, {
    readers: Object.fromEntries(Object.entries(snapshots).map(([kind, snapshot]) => [kind, async () => {
      calls[kind]++; return { snapshot }
    }])),
  }))
  assert.notEqual(result.status, 'error')
  assert.equal(result.data.airports.length, 1)
  assert.deepEqual(calls, { metar: 1, taf: 1, warning: 1 })
})

test('1A acceptance: malformed warning containers never assert no warnings', async () => {
  for (const warning of [[], {}, { airports: 'bad' }, { airports: { RKSS: {} } },
    { airports: { RKSS: { warnings: 'bad' } } },
    { airports: { RKSS: { warnings: Array(1001).fill({}) } } }]) {
    const snapshots = reports()
    snapshots.warning = warning
    const result = await getAirportWeather(input(), context(snapshots))
    assert.equal(result.status, 'partial')
    assert.equal(result.data.airports[0].warnings.status, 'unavailable')
    assert.equal(result.sources.find(s => s.kind === 'warning').availability, 'invalid')
    assert.ok(result.issues.some(i => i.kind === 'warning' && i.code === 'INVALID_SOURCE'))
  }
})

test('1A acceptance: wrong source types and timestamps are isolated without throwing', async () => {
  for (const [kind, mutate] of [
    ['metar', r => { r.observation.clouds = {} }],
    ['metar', r => { r.observation.wind = 'bad' }],
    ['metar', r => { r.observation.visibility.value = 'bad' }],
    ['metar', r => { r.observation.weather = [null] }],
    ['taf', r => { r.header.valid_end = 'bad' }],
    ['taf', r => { r.header.valid_end = iso(-1) }],
    ['taf', r => { r.timeline[0].time = '2026-02-30T00:00:00Z' }],
    ['taf', r => { r.base.clouds = Array(101).fill({ amount: 'BKN', base: 500 }) }],
    ['taf', r => { r.change_groups = [{ type: 'TEMPO', start: iso(0), end: iso(1), wind: 'bad' }] }],
    ['taf', r => { r.header.temperatures = { max: { time: { toString: 7 }, value: 12 } } }],
  ]) {
    const snapshots = reports()
    mutate(snapshots[kind].airports.RKSS)
    const result = await getAirportWeather(input(), context(snapshots))
    assert.equal(result.status, 'partial')
    assert.equal(result.data.airports[0][kind], null)
    assert.ok(result.issues.some(i => i.kind === kind && i.code === 'INVALID_SOURCE'))
    assert.ok(result.data.airports[0][kind === 'metar' ? 'taf' : 'metar'])
  }
})

test('1A acceptance: last-good belongs to selected report and forecast qualifiers survive', async () => {
  const snapshots = reports()
  snapshots.metar.airports.RKSS._stale = true
  snapshots.taf.airports.RKSS.base.vis = 9999
  const result = await getAirportWeather(input(), context(snapshots))
  assert.equal(result.sources.find(s => s.kind === 'metar').retainedLastGood, true)
  assert.equal(result.data.airports[0].taf.base.visibilityQualifier, 'at_least')
})

test('1A acceptance: reversed warning validity remains unknown, not none', async () => {
  const snapshots = reports()
  snapshots.warning.airports.RKSS = { warnings: [{ wrng_type: 'wind', valid_start: iso(2), valid_end: iso(1) }] }
  const result = await getAirportWeather(input(), context(snapshots))
  assert.equal(result.data.airports[0].warnings.status, 'unknown')
  assert.equal(result.data.airports[0].warnings.unassessedCount, 1)
  assert.ok(result.issues.some(i => i.code === 'UNKNOWN_WARNING_VALIDITY'))
})

test('1A acceptance: warning provider is evidenced, not inferred from presence', async () => {
  for (const [snapshot, expected] of [
    [{ airports: {} }, null],
    [{ type: 'AIRPORT_WARNINGS', airports: {} }, 'KMA'],
    ['malformed', null],
  ]) {
    const snapshots = reports()
    snapshots.warning = snapshot
    const result = await getAirportWeather(input(), context(snapshots))
    assert.equal(result.sources.find(source => source.kind === 'warning').provider, expected)
  }
})

test('1A acceptance: malformed TAC-only weather fields cannot erase other sources', async () => {
  for (const kind of ['metar', 'taf']) {
    const snapshots = reports()
    const report = snapshots[kind].airports.RKSS
    const list = kind === 'metar' ? report.observation.weather : report.base.wx
    list[0].phenomena = { length: 1 }
    const result = await getAirportWeather(input(), context(snapshots))
    assert.equal(result.status, 'partial')
    assert.equal(result.data.airports[0][kind], null)
    assert.ok(result.data.airports[0][kind === 'metar' ? 'taf' : 'metar'])
    assert.equal(result.sources.find(source => source.kind === kind).availability, 'invalid')
    assert.ok(result.issues.some(issue => issue.kind === kind && issue.code === 'INVALID_SOURCE'))
    if (kind === 'taf') assert.equal(result.coverage[0].state, 'unknown')
  }
})

test('1A acceptance: unexpected serializer failures retain structured facts', async () => {
  const snapshots = reports()
  snapshots.metar.airports.RKSS.observation.wind_shear = { raw: { toString: 7 } }
  const result = await getAirportWeather({ ...input(), includeRaw: true }, context(snapshots))
  assert.equal(result.status, 'partial')
  assert.ok(result.data.airports[0].metar)
  assert.ok(result.data.airports[0].taf)
  assert.equal(result.data.airports[0].metar.rawKind, 'unavailable')
  assert.equal(result.data.airports[0].metar.raw, null)
  assert.ok(result.issues.some(issue => issue.code === 'RAW_UNAVAILABLE' && issue.kind === 'metar'))
})
