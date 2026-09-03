import assert from 'node:assert/strict'
import test from 'node:test'

import { activeCollectorRegistry } from '../src/collector-registry.js'
import { checkContractAt, createExecutionWatchdog } from '../src/collector-execution.js'

test('watchdog records one missed incident after the grace threshold', () => {
  const calls = []
  const recordMissed = (...args) => calls.push(args)
  const watchdog = createExecutionWatchdog({
    collectors: [{ type: 'ground_forecast', schedule: { maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000 } }],
    getStats: () => ({ types: { ground_forecast: { execution: { last_scheduled_started_at: '2026-08-31T02:30:00.000Z', last_outcome: 'succeeded' } } } }),
    recordMissed,
    bootedAtMs: Date.parse('2026-08-31T02:00:00.000Z'),
  })
  watchdog.check(Date.parse('2026-08-31T06:06:00.000Z'))
  watchdog.check(Date.parse('2026-08-31T06:07:00.000Z'))
  assert.equal(calls.length, 1)
})

test('startup and manual starts do not reset the scheduled-start watchdog evidence', () => {
  const execution = { last_scheduled_started_at: '2026-08-31T02:30:00.000Z', last_started_at: '2026-08-31T05:00:00.000Z' }
  const result = checkContractAt({ type: 'ground_forecast', schedule: { maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000 } }, execution, Date.parse('2026-08-31T06:06:00.000Z'), Date.parse('2026-08-31T02:00:00.000Z'))
  assert.equal(result.outcome, 'missed')
})

test('never-started active collector becomes missed after boot interval plus grace', () => {
  const result = checkContractAt({ type: 'environment', schedule: { maxIntervalMs: 3600_000, graceMs: 10 * 60_000 } }, {}, Date.parse('2026-08-31T01:11:00.000Z'), Date.parse('2026-08-31T00:00:00.000Z'))
  assert.equal(result.outcome, 'missed')
})

test('quiet and disabled registry entries do not create a missed incident', () => {
  assert.equal(checkContractAt({ type: 'terminal_flights', schedule: { quiet: { fromHourKst: 0, toHourKst: 4 }, maxIntervalMs: 60_000, graceMs: 60_000 } }, {}, Date.parse('2026-08-31T17:00:00.000Z'), 0), null)
  assert.deepEqual(activeCollectorRegistry({ api: { radar_satellite_auth_key: '' } }).map((collector) => collector.type).includes('satellite'), false)
})

test('quiet time defers the missed deadline until an eligible interval and grace after reopening', () => {
  const collector = { type: 'terminal_flights', schedule: { quiet: { fromHourKst: 0, toHourKst: 4 }, maxIntervalMs: 3600_000, graceMs: 10 * 60_000 } }
  const execution = { last_scheduled_started_at: '2026-08-31T14:00:00.000Z' }
  assert.equal(checkContractAt(collector, execution, Date.parse('2026-08-31T19:00:00.000Z'), 0), null)
  assert.equal(checkContractAt(collector, execution, Date.parse('2026-08-31T20:09:00.000Z'), 0), null)
  assert.equal(checkContractAt(collector, execution, Date.parse('2026-08-31T20:10:00.000Z'), 0).outcome, 'missed')
})

test('zero grace is a valid missed-start contract', () => {
  const result = checkContractAt({ type: 'metar', schedule: { maxIntervalMs: 60_000, graceMs: 0 } }, {}, 60_000, 0)
  assert.equal(result.outcome, 'missed')
})
