import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./MapView.css', import.meta.url), 'utf8')

test('mobile route confirmation stays within the map viewport', () => {
  assert.match(css, /@media \(max-width: 719px\)\s*\{[\s\S]*?\.route-map-interaction-confirm\s*\{[^}]*left:\s*12px !important;[^}]*right:\s*12px;[^}]*top:\s*12px !important;[^}]*bottom:\s*auto;[^}]*transform:\s*none;/s)
})
