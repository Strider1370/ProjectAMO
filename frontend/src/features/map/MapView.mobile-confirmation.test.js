import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./MapView.css', import.meta.url), 'utf8')

test('mobile route confirmation stays within the map viewport', () => {
  assert.match(css, /\.route-map-interaction-confirm\.is-touch\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*1200;[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*transform:\s*none;/s)
  assert.match(css, /\.route-map-interaction-confirm button\s*\{[^}]*min-height:\s*var\(--touch-min\)/s)
})
