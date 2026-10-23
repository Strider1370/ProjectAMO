import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { process as collect } from '../src/processors/sigwx-high-processor.js'
import { createWifsUsage } from '../src/wifs-usage.js'

async function fixture(events, exitCode, run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'projectamo-wifs-test-'))
  const python = path.join(root, 'fake-python')
  await fs.writeFile(python, `#!/bin/sh\ncat <<'EVENTS'\n${events.map(event => JSON.stringify(event)).join('\n')}\nEVENTS\nexit ${exitCode}\n`, { mode: 0o700 })
  const calls = []
  const operationStats = {
    recordApiOperationStart: id => calls.push(['start', id]),
    recordApiOperationSuccess: (id, ms) => calls.push(['success', id, ms]),
    recordApiOperationFailure: (id, message) => calls.push(['failure', id, message]),
  }
  try {
    await run({ root, python, calls, operationStats, usage: createWifsUsage({ root }) })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

test('WIFS requests appear separately in API execution stats and daily usage', async () => {
  await fixture([
    { event: 'started', endpoint: 'metadata', forecastHour: null },
    { event: 'completed', endpoint: 'metadata', forecastHour: null, status: 200, bytes: 240, durationMs: 8 },
    { event: 'started', endpoint: 'forecast', forecastHour: 6 },
    { event: 'completed', endpoint: 'forecast', forecastHour: 6, status: 200, bytes: 892640, durationMs: 38 },
    { event: 'result', saved: true, runId: '2026102306', frames: 11 },
  ], 0, async ({ root, python, calls, operationStats, usage }) => {
    const result = await collect({ root, python, credential: 'test-key', usage, operationStats })
    assert.deepEqual(result, { type: 'sigwx_high', saved: true, runId: '2026102306', frames: 11 })
    assert.deepEqual(calls, [
      ['start', 'wifs_sigwx_metadata'], ['success', 'wifs_sigwx_metadata', 8],
      ['start', 'wifs_sigwx_forecast'], ['success', 'wifs_sigwx_forecast', 38],
    ])
    assert.equal(usage.snapshot().requests, 2)
    assert.equal(usage.snapshot().bytes, 892880)
    assert.equal(usage.snapshot().endpoints.forecast.lastForecastHour, 6)
    assert.equal(createWifsUsage({ root }).snapshot().requests, 2)
  })
})

test('WIFS HTTP 429 is recorded and the collector fails without publishing', async () => {
  await fixture([
    { event: 'started', endpoint: 'metadata', forecastHour: null },
    { event: 'completed', endpoint: 'metadata', forecastHour: null, status: 200, bytes: 240, durationMs: 8 },
    { event: 'started', endpoint: 'forecast', forecastHour: 6 },
    { event: 'completed', endpoint: 'forecast', forecastHour: 6, status: 429, bytes: 0, durationMs: 12 },
  ], 1, async ({ root, python, calls, operationStats, usage }) => {
    await assert.rejects(collect({ root, python, credential: 'test-key', usage, operationStats }), /wifs_sigwx_collector_failed/)
    assert.deepEqual(calls.at(-1), ['failure', 'wifs_sigwx_forecast', 'WIFS HTTP 429; 수집 중단'])
    assert.equal(usage.snapshot().requests, 2)
    assert.equal(usage.snapshot().failures, 1)
    assert.equal(usage.snapshot().endpoints.forecast.lastStatus, 429)
  })
})

test('WIFS usage resets on UTC day boundary while retaining the previous day', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'projectamo-wifs-usage-'))
  let clock = Date.parse('2026-10-23T23:59:00Z')
  try {
    const usage = createWifsUsage({ root, now: () => clock })
    usage.record({ endpoint: 'metadata', status: 200, bytes: 200 })
    clock = Date.parse('2026-10-24T00:01:00Z')
    assert.equal(usage.snapshot().requests, 0)
    usage.record({ endpoint: 'forecast', status: 403, bytes: 0, forecastHour: 6 })
    assert.equal(createWifsUsage({ root, now: () => clock }).snapshot().endpoints.forecast.lastStatus, 403)
    assert.equal(usage.snapshot().failures, 1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
