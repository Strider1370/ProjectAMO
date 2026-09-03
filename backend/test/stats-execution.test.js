import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import * as stats from '../src/stats.js'

function createFakeClock(iso) {
  let nowMs = Date.parse(iso)
  const timers = []
  return {
    now: () => nowMs,
    setTimeout(callback, delay) {
      timers.push({ at: nowMs + delay, callback })
    },
    advance(ms) {
      nowMs += ms
      for (const timer of timers.splice(0).filter((candidate) => candidate.at <= nowMs)) timer.callback()
    },
  }
}

test.beforeEach(() => {
  stats.initFromFile(fs.mkdtempSync(path.join(os.tmpdir(), 'stats-execution-')))
  stats.__setPersistenceForTest({})
})

test('success preserves last issue but clears the current execution problem', () => {
  const failed = stats.recordStart('ground_forecast', { source: 'scheduled' })
  stats.recordFailure('ground_forecast', 'upstream_timeout', 1200, failed)
  const succeeded = stats.recordStart('ground_forecast', { source: 'scheduled' })
  stats.recordSuccess('ground_forecast', { saved: false }, 80, succeeded)

  const execution = stats.getExecutionState('ground_forecast')
  assert.equal(execution.last_outcome, 'succeeded')
  assert.equal(execution.last_issue.code, 'collector_failed')
  assert.equal(execution.last_issue.message, 'upstream_timeout')
  assert.ok(execution.last_started_at)
  assert.ok(execution.last_finished_at)
})

test('manual success cannot clear an unresolved scheduled missed state', () => {
  stats.recordMissed('ground_forecast', { code: 'start_overdue' })
  const manual = stats.recordStart('ground_forecast', { source: 'manual' })
  stats.recordSuccess('ground_forecast', { saved: true }, 80, manual)
  assert.equal(stats.getExecutionState('ground_forecast').last_outcome, 'missed')
  const scheduled = stats.recordStart('ground_forecast', { source: 'scheduled' })
  stats.recordSuccess('ground_forecast', { saved: true }, 80, scheduled)
  assert.equal(stats.getExecutionState('ground_forecast').last_outcome, 'succeeded')
})

test('start writes are coalesced while completion writes remain durable', () => {
  const writes = []
  const clock = createFakeClock('2026-08-31T00:00:00.000Z')
  stats.__setPersistenceForTest({ now: clock.now, setTimeout: clock.setTimeout, write: () => writes.push(clock.now()) })
  for (let n = 0; n < 20; n += 1) stats.recordStart('metar', { source: 'scheduled' })
  assert.equal(writes.length, 0)
  clock.advance(30_000)
  assert.equal(writes.length, 1)
  stats.recordSuccess('metar', { saved: true }, 15)
  assert.equal(writes.length, 2)
})

test('issue normalization removes credentials and line breaks before persistence', () => {
  const issue = stats.normalizeCollectorIssue({ outcome: 'failed', at: '2026-08-31T00:00:00.000Z', code: 'collector_failed', message: 'GET /x?authKey=secret\nAuthorization: Bearer abcdef' })
  assert.equal(issue.message.includes('secret'), false)
  assert.equal(issue.message.includes('abcdef'), false)
  assert.equal(issue.message.includes('\n'), false)
})

test('legacy failure fields persist only the normalized issue message', () => {
  stats.recordFailure('metar', 'GET /x?serviceKey=secret\nAuthorization: Bearer abcdef', 10)
  const entry = stats.getStats().types.metar
  const recent = stats.getStats().recent_runs[0]
  assert.equal(entry.last_error.includes('secret'), false)
  assert.equal(recent.error.includes('abcdef'), false)
  assert.equal(Object.keys(entry.error_counts).some((key) => key.includes('\n')), false)
})

test('legacy non-registry stats types retain their counters without execution updates', () => {
  assert.doesNotThrow(() => stats.recordSuccess('radar_echo', { saved: true }, 12))
  const entry = stats.getStats().types.radar_echo
  assert.equal(entry.total_runs, 1)
  assert.equal(entry.success, 1)
  assert.deepEqual(entry.execution, {
    last_started_at: null,
    last_scheduled_started_at: null,
    last_finished_at: null,
    last_outcome: null,
    last_issue: null,
    last_missed_at: null,
  })
})

test('legacy non-registry stats types support a full start to terminal run', () => {
  const run = stats.recordStart('radar_echo', { source: 'scheduled' })
  assert.equal(run.source, 'scheduled')
  assert.doesNotThrow(() => stats.recordSuccess('radar_echo', { saved: true }, 12, run))
  assert.equal(stats.getStats().types.radar_echo.total_runs, 1)
  assert.equal(stats.getStats().types.radar_echo.execution.last_outcome, null)
})

test('API operation starts use the same coalesced persistence path as collector starts', () => {
  const writes = []
  const clock = createFakeClock('2026-08-31T00:00:00.000Z')
  stats.__setPersistenceForTest({ now: clock.now, setTimeout: clock.setTimeout, write: () => writes.push(clock.now()) })
  stats.recordApiOperationStart('metar')
  stats.recordApiOperationStart('metar')
  assert.equal(writes.length, 0)
  clock.advance(30_000)
  assert.equal(writes.length, 1)
  stats.recordApiOperationSuccess('metar')
  assert.equal(writes.length, 2)
})

test('loaded execution state is whitelisted, redacted, and separated by state kind', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-execution-loaded-'))
  fs.mkdirSync(path.join(dir, 'stats'))
  fs.writeFileSync(path.join(dir, 'stats', 'latest.json'), JSON.stringify({
    types: { metar: { execution: { last_outcome: 'failed', last_issue: { outcome: 'failed', code: 'x', message: 'authKey=secret\nBearer abc', at: '2026-08-31T00:00:00.000Z', injected: true }, injected: true } } },
    api_operations: { metar: { execution: { last_outcome: 'missed', last_missed_at: 'bad', last_issue: { outcome: 'failed', code: 'x', message: 'serviceKey=secret', at: '2026-08-31T00:00:00.000Z' } } }, unknown: { execution: { last_outcome: 'failed' } } },
  }))
  stats.initFromFile(dir)
  const collector = stats.getExecutionState('metar')
  assert.deepEqual(Object.keys(collector).sort(), ['last_finished_at', 'last_issue', 'last_missed_at', 'last_outcome', 'last_scheduled_started_at', 'last_started_at'])
  assert.equal(collector.last_issue.message.includes('secret'), false)
  assert.deepEqual(stats.getStats().api_operations.metar, { last_started_at: null, last_finished_at: null, last_outcome: null, last_issue: null })
  assert.equal(stats.getStats().api_operations.unknown, undefined)
})

test('loading drops unknown collector types and restores nested API operation state', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-execution-restart-'))
  fs.mkdirSync(path.join(dir, 'stats'))
  fs.writeFileSync(path.join(dir, 'stats', 'latest.json'), JSON.stringify({
    types: { unknown: { execution: { last_issue: { message: 'serviceKey=secret' } } } },
    api_operations: { metar: { execution: { last_started_at: '2026-08-31T00:00:00.000Z', last_finished_at: '2026-08-31T00:00:01.000Z', last_outcome: 'failed', last_issue: { outcome: 'failed', code: 'api_operation_failed', message: 'upstream timeout', at: '2026-08-31T00:00:01.000Z' } } } },
  }))
  stats.initFromFile(dir)
  assert.equal(stats.getStats().types.unknown, undefined)
  assert.deepEqual(stats.getStats().api_operations.metar, {
    last_started_at: '2026-08-31T00:00:00.000Z',
    last_finished_at: '2026-08-31T00:00:01.000Z',
    last_outcome: 'failed',
    last_issue: { outcome: 'failed', code: 'api_operation_failed', message: 'upstream timeout', at: '2026-08-31T00:00:01.000Z' },
  })
})

test('scheduled start preserves a historical missed issue across restart', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stats-execution-missed-'))
  stats.initFromFile(dir)
  const clock = createFakeClock('2026-08-31T00:00:00.000Z')
  stats.__setPersistenceForTest({ now: clock.now, setTimeout: clock.setTimeout })
  stats.recordMissed('metar', { code: 'start_overdue', message: 'previous missed start' })
  stats.recordStart('metar', { source: 'scheduled' })
  clock.advance(30_000)
  stats.initFromFile(dir)
  const execution = stats.getExecutionState('metar')
  assert.equal(execution.last_outcome, null)
  assert.deepEqual(execution.last_issue, {
    outcome: 'missed', code: 'start_overdue', message: 'previous missed start', at: execution.last_missed_at,
  })
})
