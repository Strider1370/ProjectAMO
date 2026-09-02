import assert from 'node:assert/strict'
import { test } from 'node:test'

import { activeCollectorRegistry, assertCollectorRegistry, COLLECTOR_REGISTRY } from '../src/collector-registry.js'
import config from '../src/config.js'

test('active registry exposes each scheduled collector with its schedule', () => {
  const active = activeCollectorRegistry({ ...config, api: { ...config.api, radar_satellite_auth_key: 'key' } })
  assert.ok(active.length > 20)
  assert.ok(active.every((collector) => collector.type && collector.binding && collector.schedule?.expression && collector.schedule?.timezone))
  assert.equal(new Set(COLLECTOR_REGISTRY.map((collector) => collector.type)).size, COLLECTOR_REGISTRY.length)
  assert.doesNotThrow(() => assertCollectorRegistry(COLLECTOR_REGISTRY, { ...config, api: { ...config.api, radar_satellite_auth_key: 'key' } }))
})

test('radar graphics follows the scheduler enabled condition as well as the key', () => {
  const withoutGraphics = activeCollectorRegistry({ ...config, api: { ...config.api, radar_satellite_auth_key: 'key' }, radar_graphics: { ...config.radar_graphics, enabled: false } })
  assert.equal(withoutGraphics.some((collector) => collector.type === 'wissdom'), false)
})
