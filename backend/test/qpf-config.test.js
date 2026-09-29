import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

import config from '../src/config.js'
import { activeCollectorRegistry } from '../src/collector-registry.js'
import { CATALOG } from '../src/admin/data-health-catalog.js'

// QPF is unused; like Echo Top it must never be collected unless explicitly enabled.
// An empty env value is not overridden by .env, so this checks the code default.
const enabled = (value) => execFileSync(process.execPath, ['--input-type=module', '-e',
  "import config from './src/config.js'; process.stdout.write(String(config.radar_graphics.qpf_enabled))"],
{ cwd: new URL('..', import.meta.url), env: { ...process.env, RADAR_QPF_ENABLED: value } }).toString()

const withKey = (qpfEnabled) => ({
  ...config,
  api: { ...config.api, radar_satellite_auth_key: 'key' },
  radar_graphics: { ...config.radar_graphics, enabled: true, qpf_enabled: qpfEnabled },
})
const types = (activeConfig) => activeCollectorRegistry(activeConfig).map((collector) => collector.type)

test('QPF collection is off unless RADAR_QPF_ENABLED=1', () => {
  assert.equal(enabled(''), 'false')
  assert.equal(enabled('0'), 'false')
  assert.equal(enabled('1'), 'true')
})

test('QPF collector is registered only when enabled, other radar graphics stay on', () => {
  assert.equal(types(withKey(false)).includes('qpf'), false)
  assert.ok(['wissdom', 'hsr', 'hci'].every((type) => types(withKey(false)).includes(type)))
  assert.equal(types(withKey(true)).includes('qpf'), true)
})

test('switched-off QPF reads as off in data health, not stopped', () => {
  const qpf = CATALOG.find((item) => item.key === 'qpf')
  assert.equal(qpf.disabledWhen(withKey(false)), true)
  assert.equal(qpf.disabledWhen(withKey(true)), false)
})
