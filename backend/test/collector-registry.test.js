import assert from 'node:assert/strict'
import { test } from 'node:test'

import { activeCollectorRegistry, assertCollectorRegistry, COLLECTOR_REGISTRY } from '../src/collector-registry.js'
import config from '../src/config.js'

test('active registry resolves partial overrides and exposes watchdog contracts from the real schedules', () => {
  const active = activeCollectorRegistry({ ...config, api: { ...config.api, radar_satellite_auth_key: 'key' } })
  assert.ok(active.length > 20)
  assert.ok(active.every((collector) => collector.type && collector.binding && collector.schedule?.expression && collector.schedule?.timezone && Number.isFinite(collector.schedule?.maxIntervalMs) && Number.isFinite(collector.schedule?.graceMs)))
  assert.equal(new Set(COLLECTOR_REGISTRY.map((collector) => collector.type)).size, COLLECTOR_REGISTRY.length)
  assert.doesNotThrow(() => assertCollectorRegistry(COLLECTOR_REGISTRY, { ...config, api: { ...config.api, radar_satellite_auth_key: 'key' } }))

  const partial = activeCollectorRegistry({ api: { radar_satellite_auth_key: '' } })
  assert.equal(partial.some((collector) => collector.type === 'satellite'), false)
  assert.deepEqual(partial.find((collector) => collector.type === 'ground_forecast').schedule, {
    expression: '30 2,5,8,11,14,17,20,23 * * *', timezone: 'Asia/Seoul', maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000,
  })
  assert.deepEqual(partial.find((collector) => collector.type === 'ktg').schedule, {
    expression: '25 1,2,7,8,13,14,19,20 * * *', timezone: 'Etc/UTC', maxIntervalMs: 5 * 3600_000, graceMs: 35 * 60_000,
  })
  assert.deepEqual(partial.find((collector) => collector.type === 'terminal_flights').schedule, {
    expression: '*/1 4-23 * * *', timezone: 'Asia/Seoul', maxIntervalMs: 60_000, graceMs: 60_000, quiet: { fromHourKst: 0, toHourKst: 4 },
  })
  assert.equal(partial.find((collector) => collector.type === 'airport_info').schedule.maxIntervalMs, 12.5 * 3600_000)
})

test('radar graphics follows the scheduler enabled condition as well as the key', () => {
  const withoutGraphics = activeCollectorRegistry({ ...config, api: { ...config.api, radar_satellite_auth_key: 'key' }, radar_graphics: { ...config.radar_graphics, enabled: false } })
  assert.equal(withoutGraphics.some((collector) => collector.type === 'wissdom'), false)
})

test('radar graphics watchdog follows the configured scheduler cadence', () => {
  const graphics = activeCollectorRegistry({
    api: { radar_satellite_auth_key: 'key' },
    radar_graphics: { interval: '*/30 * * * *' },
  }).find((collector) => collector.type === 'wissdom')
  assert.equal(graphics.schedule.maxIntervalMs, 30 * 60_000)
  assert.equal(graphics.schedule.graceMs, 10 * 60_000)
})

test('registry rejects scheduler-invalid and watchdog-unsafe graphics cron expressions', () => {
  const validButUnsafeGraphics = { api: { radar_satellite_auth_key: 'key' }, radar_graphics: { interval: '* * 1 1 *' } }
  assert.throws(() => activeCollectorRegistry(validButUnsafeGraphics), { message: 'invalid_collector_schedule:wissdom' })
})

test('registry rejects invalid watchdog metadata', () => {
  for (const schedule of [
    { expression: '*/5 * * * *', timezone: 'Etc/UTC', maxIntervalMs: 0, graceMs: -1 },
    { expression: '*/5 * * * *', timezone: 'Etc/UTC', maxIntervalMs: 5 * 60_000, graceMs: 0, quiet: { fromHourKst: 4, toHourKst: 4 } },
    { expression: 'not cron', timezone: 'Etc/UTC', maxIntervalMs: 5 * 60_000, graceMs: 0 },
    { expression: '0 0 L * *', timezone: 'Etc/UTC', maxIntervalMs: 5 * 60_000, graceMs: 0 },
    { expression: '*/5 * * * *', timezone: 'not/a-timezone', maxIntervalMs: 5 * 60_000, graceMs: 0 },
    null,
  ]) {
    const invalid = [{ type: 'invalid', binding: 'invalid', enabled: () => true, schedule: () => schedule }]
    assert.throws(() => assertCollectorRegistry(invalid), { message: 'invalid_collector_schedule:invalid' })
  }
})
