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

test('initial route-panel content does not get a separate step-transition attribute', () => {
  assert.match(panel, /const stepMotion = hasWorkflowStepTransition \? stepDirection : undefined/)
  assert.doesNotMatch(panel, /data-step-dir=\{stepDirection\}/)
  assert.match(panel, /data-step-dir=\{stepMotion\}/)
})

test('alternative routes expose NAVDATA and airway toggles without a collapsed disclosure', () => {
  const alternatives = readFileSync(new URL('./RouteAlternativesStep.jsx', import.meta.url), 'utf8')
  const layerActions = readFileSync(new URL('../map/layerActions.js', import.meta.url), 'utf8')
  assert.match(alternatives, /ariaLabel="대안 경로 항법 레이어"/)
  assert.match(layerActions, /'NAVDATA'/)
  assert.doesNotMatch(alternatives, /<details className="rb-hazard-disclosure"><summary>항법 표시<\/summary>/)
})

test('alternative route token validation includes that route’s custom waypoints', () => {
  const alternatives = readFileSync(new URL('./RouteAlternativesStep.jsx', import.meta.url), 'utf8')
  assert.match(alternatives, /classifyRouteTexts\(routeString\.trim\(\) \? routeString\.trim\(\)\.split\(\/\\s\+\/\) : \[\], \{\s*userWaypoints: \(selectedDesign\?\.draftEditor\?\.enroute \?\? selectedDesign\?\.enroute\)\?\.userWaypoints \?\? \[\]/s)
})
