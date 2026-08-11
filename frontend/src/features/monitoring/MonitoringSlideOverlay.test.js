import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('./MonitoringSlideOverlay.jsx', import.meta.url)), 'utf8')

test('keeps the outgoing slide visible while returning to the live map', () => {
  assert.match(source, /useLayoutEffect/)
  assert.doesNotMatch(source, /monitoring-slide-overlay-controls/)
  assert.doesNotMatch(source, /화면 전환 종료/)
  assert.match(source, /const visible = showing \|\| Boolean\(leaving\)/)
  assert.match(source, /\$\{visible \? ['"] is-visible['"] : ['"]['"]\}/)
  assert.match(source, /aria-hidden=\{!visible\}/)
})
