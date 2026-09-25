import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import test from 'node:test'

// Echo Top downloads GBs of raw radar on startup; it must never run unless explicitly enabled.
// An empty env value is not overridden by .env, so this checks the code default.
const enabled = (value) => execFileSync(process.execPath, ['--input-type=module', '-e',
  "import config from './src/config.js'; process.stdout.write(String(config.radar_echo_top.enabled))"],
{ cwd: new URL('..', import.meta.url), env: { ...process.env, RADAR_ECHO_TOP_ENABLED: value } }).toString()

test('Echo Top collection is off unless RADAR_ECHO_TOP_ENABLED=1', () => {
  assert.equal(enabled(''), 'false')
  assert.equal(enabled('0'), 'false')
  assert.equal(enabled('1'), 'true')
})
