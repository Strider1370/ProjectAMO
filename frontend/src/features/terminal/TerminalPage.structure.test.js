import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const page = readFileSync(new URL('./TerminalPage.jsx', import.meta.url), 'utf8')
const boardView = readFileSync(new URL('./components/BoardView.jsx', import.meta.url), 'utf8')
const railView = readFileSync(new URL('./components/RailView.jsx', import.meta.url), 'utf8')

test('TerminalPage owns the URL, fixture seam, pager, and current board/rail presentation children', () => {
  assert.match(page, /parseTerminalView\(window\.location\.search\)/)
  assert.match(page, /parseTerminalFixtureState\(window\.location\.search, \{ allowOverride: import\.meta\.env\.DEV \}\)/)
  assert.match(page, /applyTerminalFixtureState\(TERMINAL_FLIGHT_GROUPS, fixtureState\)/)
  assert.match(page, /useTerminalPager/)
  assert.match(page, /import \{ BoardView \} from '\.\/components\/BoardView\.jsx'/)
  assert.match(page, /import \{ RailView \} from '\.\/components\/RailView\.jsx'/)
  assert.match(page, /\? <main className="prototype-shell"><BoardView \{\.\.\.screenProps\} \/><\/main>/)
  assert.match(page, /: <main className="prototype-shell"><RailView \{\.\.\.screenProps\} \/><\/main>/)
  assert.doesNotMatch(page, /DestinationWeatherPage/)
})

test('TerminalPage validates motion modes and cancels pending motion replay frames', () => {
  assert.match(page, /parseTerminalMotionMode\(search, view\)/)
  assert.match(page, /createTerminalMotionReplay/)
  assert.match(page, /useEffect\(\(\) => \(\) => cancelMotionReplay\(\), \[cancelMotionReplay\]\)/)
})

test('reduced motion exposes the entering page and hides the outgoing page during handoff', () => {
  assert.match(page, /const \[reducedMotion, setReducedMotion\] = useState/)
  assert.match(page, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)/)
  assert.match(page, /reducedMotion,/)
  for (const view of [boardView, railView]) {
    assert.match(view, /aria-hidden=\{transition && reducedMotion\}/)
    assert.match(view, /aria-hidden=\{!reducedMotion\}/)
  }
})
