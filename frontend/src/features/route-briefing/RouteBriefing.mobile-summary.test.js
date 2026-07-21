import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./RouteBriefing.css', import.meta.url), 'utf8')

test('mobile base-route summary grows to contain its stats and hazards', () => {
  assert.match(css, /\.route-check-form\.rb-mobile \.rb-comparison-summary-select\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*var\(--touch-min\)/s)
})
