import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const config = readFileSync(new URL('./nginx/projectamo.conf.example', import.meta.url), 'utf8')

test('public API permits a 60-request initial-load burst per client IP', () => {
  assert.match(config, /limit_req_zone \$binary_remote_addr zone=projectamo_api:10m rate=5r\/s;/)
  assert.match(config, /limit_req zone=projectamo_api burst=60 nodelay;/)
})
