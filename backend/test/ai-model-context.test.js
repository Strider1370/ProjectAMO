import test from 'node:test'
import assert from 'node:assert/strict'
import { modelContext, modelToolResult, resolveAirportWindow, resolveAdvisoryTime, displayInstant } from '../src/ai/model-context.js'
import { CHAT_TOOLS } from '../src/ai/tool-registry.js'

test('KIM and KTG run IDs retain UTC identity and gain an explicit localized initialization time', () => {
  const run = { tmfc: '2026091006', hf: 6, validTime: '2026-09-10T12:00:00Z' }
  assert.deepEqual(modelContext(run, 'Asia/Seoul'), { tmfc: '2026091006', hf: 6,
    validTime: '2026-09-10 21:00:00 KST', initializedAtDisplay: '2026-09-10 15:00:00 KST' })
  assert.equal(modelContext(run, 'UTC').initializedAtDisplay, '2026-09-10 06:00:00 UTC')
  assert.equal(run.validTime, '2026-09-10T12:00:00Z')
  assert.deepEqual(modelContext({ tmfc: '2026023106' }, 'Asia/Seoul'), { tmfc: '2026023106' })
})

test('model projection localizes every instant, preserves all facts/gaps and leaves input untouched', () => {
  const input = { reference: { effectiveNow: '2026-09-23T15:01:00Z', resultHash: 'opaque' },
    data: { temperature: null, weather: [], warningStatus: 'unknown', raw: 'METAR RKSS 231500Z',
      samples: Array.from({ length: 40 }, (_, i) => ({ time: new Date(Date.UTC(2026, 8, 23, 15, i)).toISOString(), visibility: 900 + i })) },
    sources: [{ fetchedAt: '2026-09-23T15:02:00Z', retainedLastGood: true, freshness: 'unknown', contentHash: 'hash' }],
    coverage: [{ state: 'partial', uncovered: [{ start: '2026-09-23T14:00:00Z', end: '2026-09-23T15:00:00Z' }] }], issues: [{ code: 'MISSING_FIELD' }] }
  const before = structuredClone(input)
  const value = modelContext(input, 'Asia/Seoul')
  assert.equal(value.reference.effectiveNow, '2026-09-24 00:01:00 KST')
  assert.equal(value.data.samples[39].time, '2026-09-24 00:39:00 KST')
  assert.equal(value.data.temperature, null)
  assert.equal(value.sources[0].retainedLastGood, true)
  assert.equal(value.data.raw, before.data.raw)
  assert.equal(value.coverage[0].state, 'partial')
  assert.equal(value.reference.resultHash, undefined)
  assert.deepEqual(value.issues, before.issues)
  assert.deepEqual(input, before)
  assert.equal(displayInstant('2026-09-23T15:00:00Z', 'UTC'), '2026-09-23 15:00:00 UTC')
})

test('TAF projection excludes known outside-window changes but retains permanent and unresolved evidence', () => {
  const changes = [
    { index: 0, type: 'BECMG', semantics: 'transition', start: '2026-09-23T10:00:00Z', end: '2026-09-23T11:00:00Z' },
    { index: 1, type: 'FM', semantics: 'from', start: '2026-09-23T11:00:00Z', end: null },
    { index: 2, type: 'TEMPO', semantics: 'temporary', start: '2026-09-23T11:00:00Z', end: '2026-09-23T12:00:00Z' },
    { index: 3, type: 'BECMG', semantics: 'transition', start: '2026-09-23T13:00:00Z', end: '2026-09-23T15:00:00Z' },
    { index: 4, type: 'TEMPO', semantics: 'temporary', start: null, end: null },
    { index: 5, type: 'PROB30', semantics: 'probabilistic', start: '2026-09-23T12:30:00Z', end: '2026-09-23T14:00:00Z' },
  ]
  const original = { data: { airports: [{ icao: 'RKSS', taf: { changes } }] }, coverage: [{ icao: 'RKSS', requested: { start: '2026-09-23T12:00:00Z', end: '2026-09-23T13:00:00Z' } }] }
  const result = modelToolResult('get_route_briefing', original, 'UTC')
  assert.deepEqual(result.data.airports[0].taf.changes.map((c) => c.index), [0, 1, 4, 5])
  assert.deepEqual(result.data.airports[0].taf.windowProjection.omittedChanges.map((c) => c.index), [2, 3])
  assert.deepEqual(result.data.airports[0].taf.windowProjection.completedPermanentChanges.map(c => c.index), [0, 1])
  assert.equal(original.data.airports[0].taf.changes.length, 6)
})

test('completed permanent changes are chronological, exclude temporary changes and preserve unresolved timing', () => {
  const result = { data: { airports: [{ icao: 'RKPC', taf: { base: { wind: { direction: 110, speed: 7 } }, changes: [
    { index: 1, semantics: 'transition', start: '2026-09-23T23:00:00Z', end: '2026-09-24T01:00:00Z', state: { wind: { direction: 50, speed: 7 } } },
    { index: 0, semantics: 'transition', start: '2026-09-23T13:00:00Z', end: '2026-09-23T15:00:00Z', state: { wind: { direction: 170, speed: 5 } } },
    { index: 2, semantics: 'from', start: '2026-09-23T12:00:00Z', end: null },
    { index: 3, semantics: 'transition', start: null, end: null },
    { index: 4, semantics: 'probabilistic', start: '2026-09-23T18:00:00Z', end: '2026-09-23T20:00:00Z' },
    { index: 5, semantics: 'transition', start: '2026-09-23T20:00:00Z', end: '2026-09-23T19:00:00Z' },
  ] } }] }, coverage: [{ icao: 'RKPC', requested: { start: '2026-09-24T00:03:00Z', end: '2026-09-24T00:36:00Z' } }] }
  for (const zone of ['UTC', 'Asia/Seoul']) {
    const taf = modelToolResult('get_route_briefing', result, zone).data.airports[0].taf
    assert.deepEqual(taf.windowProjection.completedPermanentChanges.map(c => c.index), [2, 0])
    assert.equal(taf.changes.find(c => c.index === 0).state.wind.direction, 170)
    assert.ok(taf.changes.some(c => c.index === 3))
    assert.equal(taf.base.wind.direction, 110)
  }
})

test('advisory local times convert without changing pure MCP input contract; conflicting filters fail', () => {
  assert.deepEqual(resolveAdvisoryTime({ types: ['sigmet'], localAt: '2026-09-23T21:03' }, 'Asia/Seoul'),
    { types: ['sigmet'], at: '2026-09-23T12:03:00.000Z' })
  assert.deepEqual(resolveAdvisoryTime({ localWindow: { start: '2026-09-24T00:03', end: '2026-09-24T01:30' } }, 'UTC').window,
    { start: '2026-09-24T00:03:00.000Z', end: '2026-09-24T01:30:00.000Z' })
  assert.equal(CHAT_TOOLS.get_weather_advisories.schema.safeParse({ at: '2026-09-23T12:03:00Z', localAt: '2026-09-23T21:03' }).success, false)
  assert.equal(CHAT_TOOLS.get_weather_advisories.schema.safeParse({ result_ref: 'x', cursor: 0, localAt: '2026-09-23T21:03' }).success, false)
})

test('route and saved-current briefings scope airport changes identically without losing raw evidence, coverage or gaps', () => {
  // App airport questions use the code-made briefing instead (ai-airport-briefing.test.js).
  const input = {
    data: { mode: 'current_briefing', savedRoute: { id: 7 }, flight: { etd: '2026-09-23T12:03:00Z' },
      airports: [{ icao: 'RKSS', taf: { base: { cavok: true }, changes: [
        { index: 0, type: 'FM', semantics: 'from', start: '2026-09-23T11:00:00Z', end: null, wind: { speed: 10 } },
        { index: 1, type: 'BECMG', semantics: 'transition', start: '2026-09-23T15:00:00Z', end: '2026-09-23T17:00:00Z' },
        { index: 2, type: 'TEMPO', semantics: 'temporary', start: null, end: null },
      ] } }], enroute: { weatherAvailable: false } },
    coverage: [{ icao: 'RKSS', requested: { start: '2026-09-23T12:03:00Z', end: '2026-09-23T12:36:00Z' }, state: 'partial' }],
    issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED' }], sources: [{ kind: 'taf', status: 'available' }],
  }
  const original = structuredClone(input)
  for (const tool of ['get_route_briefing', 'get_my_saved_route']) {
    const projected = modelToolResult(tool, input, 'Asia/Seoul')
    const taf = projected.data.airports[0].taf
    assert.deepEqual(taf.changes.map(c => c.index), [0, 2])
    assert.equal(taf.changes[0].wind.speed, 10)
    assert.equal(taf.windowProjection.requested.start, '2026-09-23 21:03:00 KST')
    assert.deepEqual(taf.windowProjection.omittedChanges, [{ index: 1, type: 'BECMG', reason: 'starts_after_request' }])
    assert.equal(projected.coverage[0].state, 'partial')
    assert.equal(projected.data.enroute.weatherAvailable, false)
    // Gaps are never dropped; standing caveats only gain a mention-on-request note.
    assert.deepEqual(projected.issues.map((issue) => issue.code), input.issues.map((issue) => issue.code))
    assert.deepEqual(projected.sources, input.sources)
  }
  assert.deepEqual(input, original)
  for (const requested of [null, { start: 'invalid', end: 'invalid' }, { start: '2026-09-23T13:00:00Z', end: '2026-09-23T12:00:00Z' }]) {
    const value = { ...input, coverage: [{ icao: 'RKSS', requested }] }
    assert.equal(modelToolResult('get_route_briefing', value, 'UTC').data.airports[0].taf.changes.length, 3)
  }
  const historical = { ...input, data: { ...input.data, mode: 'historical_result' } }
  assert.equal(modelToolResult('get_my_saved_route', historical, 'UTC').data.airports[0].taf.changes.length, 3)
})

test('local clock conversion is deterministic at midnight; impossible dates and mixed modes are rejected', () => {
  const input = { airports: ['RKSS'], localWindow: { start: '2026-09-24T00:03', end: '2026-09-24T01:30' } }
  assert.deepEqual(resolveAirportWindow(input, { timezone: 'Asia/Seoul', now: 0 }).window,
    { start: '2026-09-23T15:03:00.000Z', end: '2026-09-23T16:30:00.000Z' })
  assert.deepEqual(resolveAirportWindow(input, { timezone: 'UTC', now: 0 }).window,
    { start: '2026-09-24T00:03:00.000Z', end: '2026-09-24T01:30:00.000Z' })
  assert.throws(() => resolveAirportWindow({ ...input, localWindow: { start: '2026-02-30T10:00', end: '2026-03-01T10:00' } }, { timezone: 'UTC' }), { code: 'INVALID_LOCAL_TIME' })
  for (const conflicting of [ { usePreviousWindow: true }, { hoursFromNow: 1 }, { window: { start: '2026-09-23T15:03:00Z', end: '2026-09-23T16:30:00Z' } } ]) {
    assert.equal(CHAT_TOOLS.get_airport_weather.schema.safeParse({ ...input, ...conflicting }).success, false)
  }
})

test('standing coverage caveats are kept but marked as mention-on-request; real warning gaps are not', () => {
  const advisory = modelToolResult('get_weather_advisories', { status: 'partial', data: { items: [] },
    issues: [{ code: 'SOURCE_COVERAGE_UNVERIFIED', reason: 'x' }, { code: 'UNASSESSED_VALIDITY', count: 1 }] }, 'UTC')
  assert.equal(advisory.issues[0].code, 'SOURCE_COVERAGE_UNVERIFIED')
  assert.match(advisory.issues[0].note, /only if the user asks/)
  assert.equal(advisory.issues[1].note, undefined)
  const airports = modelToolResult('get_route_briefing', { status: 'ok', coverage: [], issues: [], data: { airports: [
    { icao: 'RKSS', warnings: { status: 'unknown', items: [], unassessedCount: 0 } },
    { icao: 'RKPC', warnings: { status: 'unknown', items: [], unassessedCount: 1 } },
    { icao: 'RKPK', warnings: { status: 'failed', items: [], unassessedCount: 0 } },
  ] } }, 'UTC')
  assert.equal(airports.data.airports[0].warnings.status, 'unknown')
  assert.match(airports.data.airports[0].warnings.note, /only if the user asks/)
  assert.equal(airports.data.airports[1].warnings.note, undefined)
  assert.equal(airports.data.airports[2].warnings.note, undefined)
})

test('startsInHours lets the server compute a future airport window instead of the model', () => {
  const now = Date.parse('2026-09-25T12:40:00Z')
  const later = resolveAirportWindow({ airports: ['김해'], startsInHours: 3 }, { now, timezone: 'Asia/Seoul' })
  assert.deepEqual(later.window, { start: '2026-09-25T15:40:00.000Z', end: '2026-09-25T16:40:00.000Z' })
  assert.equal(later.startsInHours, undefined)
  const longer = resolveAirportWindow({ airports: ['김해'], startsInHours: 3, hoursFromNow: 2 }, { now, timezone: 'Asia/Seoul' })
  assert.equal(longer.window.end, '2026-09-25T17:40:00.000Z')
  const schema = CHAT_TOOLS.get_airport_weather.schema
  assert.equal(schema.safeParse({ airports: ['김해'], startsInHours: 3, hoursFromNow: 2 }).success, true)
  assert.equal(schema.safeParse({ airports: ['김해'], startsInHours: 3, localWindow: { start: '2026-09-26T00:00', end: '2026-09-26T01:00' } }).success, false)
  assert.equal(schema.safeParse({ airports: ['김해'], startsInHours: 0 }).success, false)
})
