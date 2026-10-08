import test from 'node:test'
import assert from 'node:assert/strict'
import { readMemAvailableBytes, waitForMemoryReserve } from '../src/lib/memory-reserve.js'

test('MemAvailable is read in bytes; unreadable meminfo never blocks', () => {
  assert.equal(readMemAvailableBytes('MemTotal: 1958948 kB\nMemFree: 100 kB\nMemAvailable:    1316060 kB\n'), 1316060 * 1024)
  assert.equal(readMemAvailableBytes('MemTotal: 1 kB\n'), Number.POSITIVE_INFINITY)
})

test('waits until enough memory is free, and gives up after the wait limit', async () => {
  const readings = [100, 200, 600]
  let clock = 0
  const waited = await waitForMemoryReserve({ minBytes: 512, timeoutMs: 1_000, pollMs: 1, read: () => readings.shift(), now: () => (clock += 10) })
  assert.ok(waited > 0)
  assert.equal(readings.length, 0)
  clock = 0
  await assert.rejects(waitForMemoryReserve({ minBytes: 512, timeoutMs: 30, pollMs: 1, read: () => 100, now: () => (clock += 10) }), { code: 'memory_reserve_timeout' })
})
