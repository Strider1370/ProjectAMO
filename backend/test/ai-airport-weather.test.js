import test from 'node:test'
import assert from 'node:assert/strict'
import { AirportWeatherOutputSchema } from '../src/ai/contracts.js'
import { createDataContext } from '../src/ai/data-context.js'
import { getAirportWeather } from '../src/ai/tools/get-airport-weather.js'
import { buildMetarTac } from '../src/serializers/metar-tac.js'
import {
  REAL_NOW,
  WEATHER_NOW,
  WINDOW,
  metar,
  noaaMetar,
  taf,
  warningSnapshot,
} from './fixtures/ai-airport-weather.js'

const weatherNow = () => Date.parse(WEATHER_NOW)
const realNow = () => Date.parse(REAL_NOW)

function createTestContext({
  m = metar(),
  t = taf(),
  w = warningSnapshot(),
  mm = {},
  tm = {},
  wm = { collectionStatus: 'empty' },
  reject = null,
  calls = null,
  displayTimezone = 'Asia/Seoul',
  weatherClock = weatherNow,
  realClock = realNow,
} = {}) {
  const snapshots = { metar: m, taf: t, warning: w }
  const metadata = { metar: mm, taf: tm, warning: wm }
  const readers = Object.fromEntries(
    Object.keys(snapshots).map((kind) => [kind, async () => {
      if (calls) calls[kind] += 1
      if (reject === kind) throw new Error('reader failed')
      return { snapshot: snapshots[kind], meta: metadata[kind] }
    }]),
  )

  return createDataContext({
    readers,
    weatherNow: weatherClock,
    realNow: realClock,
    clockMode: 'fixture',
    displayTimezone,
  })
}

function run(input = {}, context = createTestContext()) {
  return getAirportWeather({
    airports: ['RKSI'],
    window: WINDOW,
    includeRaw: false,
    ...input,
  }, context)
}

function issue(result, code, kind, path) {
  return result.issues.find((candidate) => (
    candidate.code === code
    && candidate.kind === kind
    && candidate.path === path
  ))
}

function source(result, kind) {
  return result.sources.find((candidate) => candidate.kind === kind)
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value
  Object.freeze(value)
  for (const nested of Object.values(value)) deepFreeze(nested)
  return value
}

function reorderKeys(value) {
  if (Array.isArray(value)) return value.map(reorderKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, nested]) => [key, reorderKeys(nested)]),
  )
}

test('1A resolves aliases and rejects ambiguity before reading', async () => {
  const successCalls = { metar: 0, taf: 0, warning: 0 }
  const success = await run(
    { airports: [' rksi ', '인천', '김포공항', '김포국제공항', '부산'] },
    createTestContext({ calls: successCalls }),
  )
  assert.deepEqual(
    success.data.airports.map((airport) => airport.icao),
    ['RKSI', 'RKSS', 'RKPK'],
  )
  assert.deepEqual(successCalls, { metar: 1, taf: 1, warning: 1 })

  const ambiguousCalls = { metar: 0, taf: 0, warning: 0 }
  const ambiguous = await run(
    { airports: ['서울'] },
    createTestContext({ calls: ambiguousCalls }),
  )
  assert.equal(ambiguous.error.code, 'AMBIGUOUS_AIRPORT')
  assert.deepEqual(ambiguous.error.candidates, [
    { icao: 'RKSI', nameKo: '인천국제공항' },
    { icao: 'RKSS', nameKo: '김포국제공항' },
  ])
  assert.deepEqual(ambiguousCalls, { metar: 0, taf: 0, warning: 0 })

  for (const query of ['남부권', 'RKZZ', 'KJFK']) {
    const calls = { metar: 0, taf: 0, warning: 0 }
    const result = await run(
      { airports: [query] },
      createTestContext({ calls }),
    )
    assert.equal(result.error.code, 'AIRPORT_NOT_FOUND')
    assert.deepEqual(result.error.candidates, [])
    assert.deepEqual(calls, { metar: 0, taf: 0, warning: 0 })
  }
})

test('1A validates strict absolute windows and timezone boundaries', async () => {
  const kst = await run({
    window: {
      start: '2026-09-23T00:00:00+09:00',
      end: '2026-09-23T02:00:00+09:00',
    },
  })
  const utc = await run({ window: WINDOW })

  assert.deepEqual(kst.data, utc.data)
  assert.deepEqual(kst.coverage, utc.coverage)
  assert.equal(kst.coverage[0].requested.start, '2026-09-22T15:00:00.000Z')
  assert.equal(kst.coverage[0].requested.end, '2026-09-22T17:00:00.000Z')
  assert.equal(kst.reference.displayTimezone, 'Asia/Seoul')

  const utcContext = await run({}, createTestContext({ displayTimezone: 'UTC' }))
  assert.equal(utcContext.reference.displayTimezone, 'UTC')

  const invalidInputs = [
    { window: { start: '2026-09-22T15:00:00', end: WINDOW.end } },
    { window: { start: '내일', end: WINDOW.end } },
    { window: { start: '2026-02-30T00:00:00Z', end: '2026-03-01T00:00:00Z' } },
    { window: { start: WINDOW.end, end: WINDOW.start } },
    { window: { start: WINDOW.start, end: WINDOW.start } },
    { window: { start: WINDOW.start, end: '2026-09-24T15:00:01Z' } },
    { userId: 'model-supplied' },
    { window: { ...WINDOW, timezone: 'UTC' } },
  ]
  for (const invalidInput of invalidInputs) {
    const calls = { metar: 0, taf: 0, warning: 0 }
    const result = await run(invalidInput, createTestContext({ calls }))
    assert.equal(result.error.code, 'INVALID_INPUT')
    assert.deepEqual(calls, { metar: 0, taf: 0, warning: 0 })
  }

  assert.throws(
    () => createDataContext({
      readers: {
        metar: async () => ({ snapshot: null }),
        taf: async () => ({ snapshot: null }),
        warning: async () => ({ snapshot: null }),
      },
      weatherNow,
      realNow,
      clockMode: 'fixture',
      displayTimezone: undefined,
    }),
    /displayTimezone/,
  )

  const invalidClockContext = createTestContext({ weatherClock: () => Number.NaN })
  await assert.rejects(() => run({}, invalidClockContext), /weatherNow/)
})

test('1A preserves METAR facts and reconstructed provenance', async () => {
  const hydrated = metar()
  const expectedRaw = buildMetarTac(hydrated.airports.RKSI)
  hydrated.airports.RKSI.header.raw_text = expectedRaw

  const withoutRaw = await run({}, createTestContext({ m: hydrated }))
  const digest = withoutRaw.data.airports[0].metar
  assert.equal(digest.reportType, 'SPECI')
  assert.equal(digest.observationTime, '2026-07-02T08:30:00.000Z')
  assert.deepEqual(digest.wind, {
    direction: 180,
    speed: 18,
    gust: 28,
    unit: 'KT',
    variable: false,
    calm: false,
  })
  assert.equal(digest.visibility.value, 3200)
  assert.deepEqual(digest.clouds, [
    { amount: 'OVC', baseFt: 800, type: null, raw: 'OVC008' },
  ])
  assert.deepEqual(digest.weather, ['BR'])
  assert.deepEqual(digest.temperature, { air: 15, dewpoint: 13, unit: 'C' })
  assert.deepEqual(digest.qnh, { value: 1009, unit: 'hPa' })
  assert.equal(digest.ceilingFt, 800)
  assert.equal(digest.category.derivedValue, 'IFR')
  assert.equal(digest.category.sourceValue, null)
  assert.deepEqual(digest.rvr, { status: 'not_reported', entries: [] })
  assert.equal(digest.rawKind, 'reconstructed')
  assert.equal(digest.raw, null)
  assert.doesNotMatch(JSON.stringify(digest.rvr), /2000/)

  const withRaw = await run(
    { includeRaw: true },
    createTestContext({ m: hydrated }),
  )
  assert.equal(withRaw.data.airports[0].metar.raw, expectedRaw)

  const trendSnapshot = metar()
  trendSnapshot.airports.RKSI.trend = ['TEMPO 3000 BR']
  const trend = await run({}, createTestContext({ m: trendSnapshot }))
  assert.equal(trend.status, 'partial')
  assert.ok(issue(trend, 'NON_PROJECTED_SIGNIFICANT_DATA', 'metar', 'trend'))

  const shearSnapshot = metar()
  shearSnapshot.airports.RKSI.observation.wind_shear = {
    all_runways: true,
    runways: null,
  }
  const shear = await run({}, createTestContext({ m: shearSnapshot }))
  assert.equal(shear.status, 'partial')
  assert.ok(issue(
    shear,
    'NON_PROJECTED_SIGNIFICANT_DATA',
    'metar',
    'observation.wind_shear',
  ))

  const missingSnapshot = metar()
  missingSnapshot.airports.RKSI.observation.qnh = null
  delete missingSnapshot.airports.RKSI.observation.rvr
  const missing = await run({}, createTestContext({ m: missingSnapshot }))
  assert.ok(missing.data.airports[0].metar.missingFields.includes('observation.qnh'))
  assert.ok(missing.data.airports[0].metar.missingFields.includes('observation.rvr'))
  assert.ok(issue(missing, 'MISSING_FIELD', 'metar', 'observation.qnh'))
  assert.equal(issue(missing, 'MISSING_FIELD', 'metar', 'observation.rvr'), undefined)
})

test('1A preserves original TAC and legacy MVFR without refolding', async () => {
  const raw = 'METAR RKSI 221500Z 27008KT 9999 BKN020 20/15 Q1013='
  const categorized = await run(
    { includeRaw: true },
    createTestContext({
      m: noaaMetar(),
      mm: {
        sourceCategories: {
          RKSI: { value: 'MVFR', path: 'legacy.category' },
        },
      },
    }),
  )
  const digest = categorized.data.airports[0].metar
  assert.equal(digest.visibility.value, 9999)
  assert.equal(digest.visibility.qualifier, 'at_least')
  assert.equal(digest.clouds[0].baseFt, 2000)
  assert.equal(digest.category.sourceValue, 'MVFR')
  assert.equal(digest.category.sourcePath, 'legacy.category')
  assert.equal(digest.category.derivedValue, 'VFR')
  assert.equal(digest.rawKind, 'original')
  assert.equal(digest.raw, raw)

  const uncategorized = await run({}, createTestContext({ m: noaaMetar() }))
  assert.equal(uncategorized.data.airports[0].metar.category.sourceValue, null)

  const oversizedRaw = noaaMetar()
  oversizedRaw.airports.RKSI.header.raw_text = 'X'.repeat(16 * 1024 + 1)
  const oversized = await run(
    { includeRaw: true },
    createTestContext({ m: oversizedRaw }),
  )
  assert.equal(oversized.data.airports[0].metar.rawKind, 'unavailable')
  assert.equal(oversized.data.airports[0].metar.raw, null)
  assert.equal(
    issue(oversized, 'RAW_UNAVAILABLE', 'metar', 'header.raw_text').reason,
    'RAW_TOO_LARGE',
  )

  for (const metadata of [
    { sourceCategories: { RKSI: { value: 'DANGER', path: 'legacy.category' } } },
    { collectionStatus: 'complete', unexpected: true },
  ]) {
    const invalid = await run({}, createTestContext({ m: noaaMetar(), mm: metadata }))
    assert.equal(source(invalid, 'metar').availability, 'invalid')
    assert.equal(invalid.data.airports[0].metar, null)
    assert.ok(invalid.issues.some((candidate) => (
      candidate.code === 'INVALID_SOURCE' && candidate.kind === 'metar'
    )))
  }
})

test('1A intersects TAF validity with half-open windows', async () => {
  const full = await run({
    window: {
      start: '2026-09-22T15:00:00Z',
      end: '2026-09-22T17:00:00Z',
    },
  })
  assert.equal(full.coverage[0].state, 'full')
  assert.deepEqual(full.coverage[0].uncovered, [])
  assert.deepEqual(
    full.data.airports[0].taf.samples.map((sample) => sample.time),
    ['2026-09-22T15:00:00.000Z', '2026-09-22T16:00:00.000Z'],
  )

  const partial = await run({
    window: {
      start: '2026-09-22T14:00:00Z',
      end: '2026-09-22T16:00:00Z',
    },
  })
  assert.equal(partial.coverage[0].state, 'partial')
  assert.deepEqual(partial.coverage[0].intersection, {
    start: '2026-09-22T15:00:00.000Z',
    end: '2026-09-22T16:00:00.000Z',
  })
  assert.deepEqual(partial.coverage[0].uncovered, [{
    start: '2026-09-22T14:00:00.000Z',
    end: '2026-09-22T15:00:00.000Z',
  }])

  const none = await run({
    window: {
      start: '2026-09-22T18:00:00Z',
      end: '2026-09-22T19:00:00Z',
    },
  })
  assert.equal(none.coverage[0].state, 'none')
  assert.equal(none.coverage[0].intersection, null)
  assert.deepEqual(none.coverage[0].uncovered, [{
    start: '2026-09-22T18:00:00.000Z',
    end: '2026-09-22T19:00:00.000Z',
  }])
  assert.deepEqual(none.data.airports[0].taf.samples, [])
  assert.ok(issue(none, 'TAF_OUTSIDE_WINDOW', 'taf', 'header.validity'))
  assert.equal(issue(none, 'TIMELINE_EMPTY', 'taf', 'timeline'), undefined)
})

test('1A preserves BECMG TEMPO PROB and sampled limitations', async () => {
  const result = await run()
  const digest = result.data.airports[0].taf
  assert.equal(digest.base.visibilityM, 9999)
  assert.equal(digest.base.visibilityQualifier, 'at_least')
  assert.deepEqual(
    digest.changes.map((change) => change.type),
    ['BECMG', 'TEMPO', 'PROB30_TEMPO'],
  )
  assert.deepEqual(
    digest.changes.map((change) => [change.start, change.end]),
    [
      ['2026-09-22T15:00:00.000Z', '2026-09-22T16:00:00.000Z'],
      ['2026-09-22T16:00:00.000Z', '2026-09-22T17:00:00.000Z'],
      ['2026-09-22T16:00:00.000Z', '2026-09-22T18:00:00.000Z'],
    ],
  )
  assert.deepEqual(
    digest.changes.map((change) => change.state.visibilityM),
    [5000, 2000, 1000],
  )
  assert.deepEqual(
    digest.changes.map((change) => change.state.visibilityQualifier),
    ['reported', 'reported', 'reported'],
  )
  assert.deepEqual(
    digest.changes.map((change) => change.semantics),
    ['transition', 'temporary', 'probabilistic'],
  )
  assert.deepEqual(
    digest.changes.map((change) => change.probability),
    [null, null, 30],
  )
  assert.ok(digest.changes.every((change) => change.state.wind === null))
  assert.equal(digest.changes[1].state.weather[0], 'BR')
  assert.equal(digest.samples[1].visibilityM, 1000)
  assert.deepEqual(digest.samples[1].weather, ['BR'])
  assert.equal(digest.sampleSemantics, 'parser-merged-samples')

  const emptyTimeline = taf()
  emptyTimeline.airports.RKSI.timeline = []
  const empty = await run({}, createTestContext({ t: emptyTimeline }))
  assert.equal(empty.coverage[0].state, 'full')
  assert.deepEqual(empty.data.airports[0].taf.samples, [])
  assert.ok(issue(empty, 'TIMELINE_EMPTY', 'taf', 'timeline'))
})

test('1A distinguishes no data read failure and no warnings', async () => {
  const partial = await run({}, createTestContext({ reject: 'taf', w: null }))
  assert.equal(partial.status, 'partial')
  assert.equal(partial.data.airports[0].taf, null)
  assert.ok(partial.issues.some((candidate) => (
    candidate.code === 'READ_FAILED' && candidate.kind === 'taf'
  )))
  assert.equal(partial.data.airports[0].warnings.status, 'unavailable')
  assert.ok(partial.issues.some((candidate) => (
    candidate.code === 'DATA_UNAVAILABLE' && candidate.kind === 'warning'
  )))

  const none = await run({}, createTestContext({
    w: warningSnapshot(),
    wm: { collectionStatus: 'empty' },
  }))
  assert.equal(none.data.airports[0].warnings.status, 'none')
  assert.deepEqual(none.data.airports[0].warnings.items, [])

  const unknown = await run({}, createTestContext({
    w: warningSnapshot(),
    wm: { collectionStatus: 'unknown' },
  }))
  assert.equal(unknown.data.airports[0].warnings.status, 'unknown')

  const failed = await run({}, createTestContext({ reject: 'warning' }))
  assert.equal(failed.data.airports[0].warnings.status, 'failed')
  assert.ok(failed.issues.some((candidate) => (
    candidate.code === 'READ_FAILED' && candidate.kind === 'warning'
  )))

  const unavailable = await run({}, createTestContext({ m: null, t: null, w: null }))
  assert.equal(unavailable.status, 'error')
  assert.equal(unavailable.error.code, 'DATA_UNAVAILABLE')

  const priority = await run({}, createTestContext({
    m: null,
    w: null,
    reject: 'taf',
  }))
  assert.equal(priority.status, 'error')
  assert.equal(priority.error.code, 'READ_FAILED')
})

test('1A retains last good metadata and unknown warning time', async () => {
  const staleMetar = metar()
  staleMetar.airports.RKSI._stale = true
  staleMetar.airports.RKSI.header.issue_time = null
  const warning = warningSnapshot()
  warning.total_count = 1
  warning.airports.RKSI = {
    airport_name: '인천국제공항',
    warnings: [{
      issued: null,
      wrng_type: '1',
      wrng_type_key: 'WIND',
      wrng_type_name: 'Strong Wind',
      valid_start: null,
      valid_end: null,
    }],
  }

  const result = await run({}, createTestContext({
    m: staleMetar,
    mm: {
      collectionStatus: 'failed',
      collectionReason: 'UPSTREAM_FAILED',
      snapshotId: 's1',
      contentHash: 'h1',
      publicationId: 'p1',
      runId: 'r1',
    },
    w: warning,
    wm: { collectionStatus: 'complete' },
  }))
  const metarSource = source(result, 'metar')
  assert.ok(result.data.airports[0].metar)
  assert.equal(metarSource.retainedLastGood, true)
  assert.equal(metarSource.collectionStatus, 'failed')
  assert.equal(metarSource.snapshotId, 's1')
  assert.equal(metarSource.contentHash, 'h1')
  assert.equal(metarSource.publicationId, 'p1')
  assert.equal(metarSource.runId, 'r1')
  assert.equal(metarSource.hashBasis, 'reader')
  assert.equal(metarSource.issuedAt, null)
  assert.equal(metarSource.fetchedAt, REAL_NOW)
  assert.ok(issue(
    result,
    'COLLECTION_FAILED',
    'metar',
    'meta.collectionStatus',
  ))

  const warnings = result.data.airports[0].warnings
  assert.equal(source(result, 'warning').provider, 'KMA')
  assert.equal(warnings.status, 'unknown')
  assert.equal(warnings.unassessedCount, 1)
  assert.equal(warnings.items[0].relation, 'unknown')
  assert.ok(issue(
    result,
    'UNKNOWN_WARNING_VALIDITY',
    'warning',
    'airports.RKSI.warnings.0',
  ))
})

test('1A imports without side effects and never mutates snapshots', async () => {
  const snapshots = {
    metar: deepFreeze(metar()),
    taf: deepFreeze(taf()),
    warning: deepFreeze(warningSnapshot()),
  }
  const before = JSON.stringify(snapshots)
  const frozenResult = await run({}, createTestContext({
    m: snapshots.metar,
    t: snapshots.taf,
    w: snapshots.warning,
  }))
  assert.equal(JSON.stringify(snapshots), before)
  assert.notEqual(frozenResult.status, 'error')

  const extraKey = structuredClone(frozenResult)
  extraKey.data.airports[0].metar.wind.extra = true
  assert.equal(AirportWeatherOutputSchema.safeParse(extraKey).success, false)

  const infinity = structuredClone(frozenResult)
  infinity.data.airports[0].metar.visibility.value = Infinity
  assert.equal(AirportWeatherOutputSchema.safeParse(infinity).success, false)

  const badCategory = structuredClone(frozenResult)
  badCategory.data.airports[0].metar.category.sourceValue = 'DANGER'
  assert.equal(AirportWeatherOutputSchema.safeParse(badCategory).success, false)

  const badIssue = structuredClone(frozenResult)
  badIssue.issues.push({
    code: 'BOGUS',
    icao: null,
    kind: null,
    path: 'x',
    reason: 'x',
  })
  assert.equal(AirportWeatherOutputSchema.safeParse(badIssue).success, false)

  const ordered = metar()
  const reordered = reorderKeys(ordered)
  const changed = metar()
  changed.airports.RKSI.observation.visibility.value += 1
  const orderedResult = await run({}, createTestContext({ m: ordered }))
  const reorderedResult = await run({}, createTestContext({ m: reordered }))
  const changedResult = await run({}, createTestContext({ m: changed }))
  assert.equal(
    source(orderedResult, 'metar').contentHash,
    source(reorderedResult, 'metar').contentHash,
  )
  assert.notEqual(
    source(orderedResult, 'metar').contentHash,
    source(changedResult, 'metar').contentHash,
  )

  const oversized = metar()
  oversized.airports.RKSI.observation.clouds = Array.from(
    { length: 101 },
    () => ({ amount: 'BKN', base: 800, type: null, raw: 'BKN008' }),
  )
  const invalid = await run({}, createTestContext({ m: oversized }))
  assert.equal(source(invalid, 'metar').availability, 'invalid')
  assert.equal(invalid.data.airports[0].metar, null)

  const invalidTemperature = taf()
  invalidTemperature.airports.RKSI.header.temperatures = {
    max: { value: 25, time: {} },
    min: { value: 10, time: null },
  }
  const invalidTaf = await run({}, createTestContext({ t: invalidTemperature }))
  assert.equal(source(invalidTaf, 'taf').availability, 'invalid')
  assert.equal(invalidTaf.data.airports[0].taf, null)
})
