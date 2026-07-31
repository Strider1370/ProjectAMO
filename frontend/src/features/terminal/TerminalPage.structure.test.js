import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('./TerminalPage.jsx', import.meta.url), 'utf8')

test('TerminalPage owns the URL, fixture seam, pager, and temporary presentation child', () => {
  assert.match(page, /parseTerminalView\(window\.location\.search\)/)
  assert.match(page, /parseTerminalFixtureState\(window\.location\.search, \{ allowOverride: import\.meta\.env\.DEV \}\)/)
  assert.match(page, /applyTerminalFixtureState\(TERMINAL_FLIGHT_GROUPS, fixtureState\)/)
  assert.match(page, /useTerminalPager/)
  assert.match(page, /<DestinationWeatherPage/)
})

test('TerminalPage validates motion modes and cancels pending motion replay frames', () => {
  assert.match(page, /parseTerminalMotionMode\(search, view\)/)
  assert.match(page, /createTerminalMotionReplay/)
  assert.match(page, /useEffect\(\(\) => \(\) => cancelMotionReplay\(\), \[cancelMotionReplay\]\)/)
})
