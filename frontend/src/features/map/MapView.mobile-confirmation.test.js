import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./MapView.css', import.meta.url), 'utf8')

test('mobile route confirmation stays within the map viewport', () => {
  assert.match(css, /\.route-map-interaction-confirm\.is-touch\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*1200;[^}]*left:\s*12px;[^}]*right:\s*12px;[^}]*transform:\s*none;/s)
  assert.match(css, /\.route-map-interaction-confirm button\s*\{[^}]*min-height:\s*var\(--touch-min\)/s)
})

test('route map interaction status clears the advisory badge bar', () => {
  assert.match(css, /\.route-map-interaction-status\s*\{[^}]*top:\s*64px;/s)
  assert.match(css, /@media \(max-width: 720px\)\s*\{[\s\S]*?\.route-map-interaction-status\s*\{[^}]*top:\s*88px;/s)
})
