import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const jsx = readFileSync(new URL('./BriefingView.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./BriefingView.css', import.meta.url), 'utf8')

test('renders current airport reports as TAC cards', () => {
  assert.match(jsx, /className="bv-current-tac"/)
  assert.match(jsx, /className="bv-current-tac-raw"/)
  assert.match(jsx, /buildMetarTacSegments\(raw, vm\)/)
  assert.doesNotMatch(jsx, /const raw = a\.raw \? <div className="bv-amos-raw"/)
  assert.match(jsx, /\{a\.icao\} \{a\.reportType === 'SPECI' \? 'SPECI' : 'METAR'\}/)
})

test('turns destination forecast rows into labelled cards in a narrow briefing panel', () => {
  assert.match(jsx, /data-label="기간"/)
  assert.match(css, /@container briefing \(max-width: 719px\)/)
  assert.match(css, /\.bv-dest-periods tr/)
})

test('uses the airport panel compact TAF view and marks the ETA period', () => {
  assert.match(jsx, /<EnhancedTafTab taf=\{dest\.sourceTaf\} icao=\{dest\.icao\} eta=\{meta\.eta\} forceCompact \/>/)
})

test('keeps the mobile go/no-go banner in two columns', () => {
  assert.match(css, /\.bv-mobile \.bv-banner \{ flex-wrap: nowrap; \}/)
  assert.match(css, /\.bv-mobile \.bv-banner-body \{ min-width: 0;/)
})
