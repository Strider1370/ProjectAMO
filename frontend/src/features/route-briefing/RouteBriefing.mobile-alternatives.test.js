import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./RouteBriefing.css', import.meta.url), 'utf8')
const panel = readFileSync(new URL('./RouteBriefingPanel.jsx', import.meta.url), 'utf8')

test('mobile alternative cards retain their outline', () => {
  assert.match(css, /\.route-check-form\.rb-mobile \.rb-alternative-card\s*\{[^}]*border:\s*1px solid var\(--stroke-1\)/s)
})

test('mobile alternative selection and creation reveal the map with a peek sheet', () => {
  assert.match(panel, /const revealAlternativeOnMap = \(action\) =>[\s\S]*?setSheetDetent\('peek'\)/)
  assert.match(panel, /onSelect=\{revealAlternativeOnMap\(selectRouteDesign\)\}/)
  assert.match(panel, /onDuplicate=\{revealAlternativeOnMap\(duplicateSelectedRouteDesign\)\}/)
})
