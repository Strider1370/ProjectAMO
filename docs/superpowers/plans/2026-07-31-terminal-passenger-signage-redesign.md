# Terminal Passenger Signage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `/terminal` from a copied destination-weather prototype into a first-class ProjectAMO feature and redesign both comparison views for legible passenger use on 50–65-inch Full HD airport displays.

**Architecture:** Keep `/terminal` as a standalone full-screen route inside the existing frontend build. Replace the monolithic prototype-shaped component with a shared normalized display model, shared signage shell, two focused presentation components, scoped design tokens, and a dedicated Playwright contract. Both views consume the same fixtures now and the same adapter contract later; live flight/weather API integration remains outside this plan.

**Tech Stack:** React 19, Vite 7, JavaScript modules, scoped CSS, Node built-in test runner, Playwright contracts, locally hosted Pretendard GOV assets.

## Global Constraints

- Before implementation, read `Architecture.md` (directory structure, frontend feature roles, reference structure), `docs/policies/design/design-language.md`, `docs/policies/engineering/data-and-time.md`, `docs/policies/encoding-safety.md`, `docs/policies/verification/browser-verification.md`, `docs/policies/verification/contracts.md`, and `docs/operations/dev-server-and-capture.md`.
- Target hardware is 50–65-inch, 1920×1080 Full HD, 16:9, viewed from 3–5m at browser zoom 100%.
- Design against the 50-inch worst case; the same 1080p layout must be used on 65-inch displays.
- Required passenger text must never be smaller than 24px; ordinary labels and forecasts target at least 26px; only low-priority dates/disclaimers may use 22px; no text may be smaller than 20px.
- Information priority is destination/code → flight/status → departure/gate → arrival time/weather → post-arrival forecast → current destination weather → ancillary detail.
- Use the exact approved copy from `docs/superpowers/specs/2026-07-31-terminal-passenger-signage-redesign.md`; do not reintroduce “예정”, repeated `KST`, or long explanatory labels.
- Both 1안 and 3안 remain available during comparison; test controls remain visible in this implementation.
- 1안 keeps three equal columns. 3안 keeps three equal rows with a 32% flight-information region and a 68% arrival-weather region.
- Five forecast positions (arrival plus four later times) and current weather details remain available until the user makes the unresolved content decision; do not silently remove either.
- Fixed labels such as `출발`, `탑승구`, `도착`, `현지`, and `한국` never animate. Only changing values animate.
- FLAP, ROLL, WIPE, FADE, and 3안 CASCADE remain supported, including `prefers-reduced-motion` behavior.
- Use locally hosted Pretendard GOV. The terminal route must make no Google Fonts request.
- The production source of truth is `frontend/src/features/terminal/`; no production import may reference `prototypes/`.
- Delete `prototypes/destination-weather-comparison/` only after production parity, unit tests, browser contracts, and the production build pass.
- Actual Korea Airports Corporation flight API and destination-weather API integration are out of scope.
- Follow Ponytail: make the smallest safe change after tracing the flow; preserve unrelated work and existing server/API behavior.
- For every code change, use test-driven development: failing test, observed failure, minimal implementation, passing test.
- Browser-visible completion requires the managed Playwright contract and 1920×1080 Linux screenshots; an embedded preview is not evidence.

---

## File Structure

The implementation locks in the following ownership boundaries.

```text
frontend/src/features/terminal/
  TerminalPage.jsx                       # /terminal route composition only
  TerminalPage.structure.test.js         # route ownership and component wiring
  data/
    terminalFixtures.js                  # temporary canonical flight groups shared by both views
  model/
    terminalDisplayModel.js              # display-model validation and weather/copy helpers
    terminalDisplayModel.test.js
    terminalPager.js                     # view/page URL parsing and next-page calculation
    terminalPager.test.js
  components/
    airlineLogoRegistry.js               # logoKey -> bundled PNG module mapping; browser-only asset boundary
    TerminalHeader.jsx                   # title, KST clock, view/motion controls
    PageIndicator.jsx                    # visual + accessible page position
    WeatherVisual.jsx                    # icon, normalized Korean label, temperature
    BoardView.jsx                        # 1안 screen
    BoardFlightColumn.jsx                # one 1안 flight column
    RailView.jsx                         # 3안 screen
    RailFlightRow.jsx                    # one 3안 flight row
  motion/
    AnimatedValue.jsx                    # value-only animation boundary
    terminalPagerScheduler.js            # injectable timer ownership for auto/manual completion
    terminalPagerScheduler.test.js
    useTerminalPager.js                  # automatic/manual shared transition state
  terminal.css                           # route-scoped signage tokens and both layouts
  terminalStyle.test.js                  # local-font, size-floor, layout-ratio guards
frontend/verification/contracts/
  terminal-signage.spec.mjs              # 1920×1080 semantic, motion, and visual contract
docs/policies/verification/contracts.md  # register terminal-signage contract
frontend/scripts/
  terminal-signage-capture.mjs           # focused 1안/3안 evidence capture
scripts/projectamo-dev.mjs               # bounded terminal capture command
package.json                             # managed terminal capture script
frontend/src/shared/theme/tokens.{css,js} # shared physical-signage type tokens
docs/policies/design/design-language.md  # narrow /terminal signage token policy
Architecture.md                          # reflect final terminal ownership
```

`DestinationWeatherPage.jsx` is removed after its responsibilities are absorbed by the files above. Existing terminal image assets remain under `frontend/src/features/terminal/assets/`.

---

### Task 0: Capture and Record the Current Signage Baseline ✅

**Files:**
- Create: `frontend/scripts/terminal-signage-capture.mjs`
- Create: `frontend/scripts/terminal-signage-capture.test.mjs`
- Create: `scripts/projectamo-dev.test.mjs`
- Modify: `scripts/projectamo-dev.mjs`
- Modify: `package.json`
- Create evidence: `artifacts/responsive-screenshots/terminal-signage/<timestamp>_before/01-board.png`
- Create evidence: `artifacts/responsive-screenshots/terminal-signage/<timestamp>_before/02-rail.png`
- Create evidence: `artifacts/responsive-screenshots/terminal-signage/<timestamp>_before/manifest.json`
- Create review note: `artifacts/responsive-screenshots/terminal-signage/<timestamp>_before/review/issues.md`

**Interfaces:**
- Consumes: current `/terminal?autoplay=0` and `/terminal?view=rail&autoplay=0` routes.
- Produces: a read-only visual baseline and explicit issue list used by Tasks 3–7.

- [ ] **Step 1: Write failing capture-tooling tests**

`scripts/projectamo-dev.test.mjs` reads the root `package.json` and launcher source and asserts the `dev:terminal-capture` script exists, the launcher accepts `terminal-signage-capture`, invokes the focused script inside `withServers`, and retains cleanup in `finally`. `frontend/scripts/terminal-signage-capture.test.mjs` asserts the capture source contains both exact routes, a 1920×1080 viewport, `document.fonts.ready`, both current `data-testid` readiness selectors, PNG names, and manifest fields, and does not use `networkidle`.

- [ ] **Step 2: Run the tests and observe the expected failure**

```bash
node --test scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.test.mjs
```

Expected: FAIL because the focused script and launcher command do not exist.

- [ ] **Step 3: Add a bounded focused-capture command**

Add `terminal-signage-capture` to the allowed commands in `scripts/projectamo-dev.mjs`. Its `withServers` callback runs the focused Node capture script with `PROJECTAMO_URL` and always reaches the launcher's existing `finally` cleanup. Add the root script:

```json
"dev:terminal-capture": "node scripts/projectamo-dev.mjs terminal-signage-capture"
```

`frontend/scripts/terminal-signage-capture.mjs` accepts `PROJECTAMO_SCREENSHOT_PHASE` and `PROJECTAMO_SCREENSHOT_LABEL`, opens both terminal routes at 1920×1080, waits for `[data-testid="option-one"]` or `[data-testid="option-three"]` and `document.fonts.ready` rather than `networkidle`, and writes the two PNG files plus `manifest.json`.

- [ ] **Step 4: Run the tests, then capture at the real target viewport**

Check the standard ports, then use the bounded command; do not leave `dev:serve` running:

```bash
node --test scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.test.mjs
ss -ltnp | grep -E ':3001|:5173' || true
PROJECTAMO_SCREENSHOT_PHASE=terminal-signage PROJECTAMO_SCREENSHOT_LABEL=before npm run dev:terminal-capture
```

Expected: the launcher starts both servers, the script captures `/terminal?autoplay=0` and `/terminal?view=rail&autoplay=0` at browser zoom 100%, and the launcher stops both servers even if capture fails.

- [ ] **Step 5: Inspect the screenshots and record the baseline defects**

Write `review/issues.md` with concrete evidence for scan order, text below the approved size floor, clipping/overlap, unused space, inconsistent columns/rows, weak arrival emphasis, fixed-label movement risk, and external-font dependency. Separate mechanical defects from information-hierarchy defects.

- [ ] **Step 6: Record capture metadata**

Verify `manifest.json` contains timestamp, Git revision, route URLs, viewport, browser, capture command, and the two screenshot filenames. Keep the generated evidence in the ignored artifact directory; do not commit it.

- [ ] **Step 7: Commit the reusable capture tooling**

```bash
git add package.json scripts/projectamo-dev.mjs scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.mjs frontend/scripts/terminal-signage-capture.test.mjs
git commit -m "test(terminal): add managed signage capture"
```

---

### Task 1: Introduce One Shared Terminal Display Model ✅

**Files:**
- Create: `frontend/src/features/terminal/model/terminalDisplayModel.js`
- Create: `frontend/src/features/terminal/model/terminalDisplayModel.test.js`
- Create: `frontend/src/features/terminal/data/terminalFixtures.js`
- Create: `frontend/src/features/terminal/components/airlineLogoRegistry.js`
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx`

**Interfaces:**
- Produces: `TERMINAL_WEATHER_LABELS: Readonly<Record<string, string>>`
- Produces: `normalizeTerminalFlight(raw): TerminalFlight`
- Produces: `normalizeTerminalDataState(raw): { phase: 'loading' | 'ready' | 'partial' | 'error', updatedAtKorea: string | null, hasNextPage: boolean }`
- Produces: `terminalFallback(value, copy = '정보 확인 중'): string | number`
- Produces: `TERMINAL_FLIGHT_GROUPS: TerminalFlight[][]`
- `TerminalFlight` shape:

```js
{
  id: 'JL92-HND-0930',
  destination: {
    city: '도쿄', airportName: '하네다 국제공항', code: 'HND', timezone: 'JST',
  },
  airline: { name: 'Japan Airlines', flightNumber: 'JL92', logoKey: 'jal' },
  operation: {
    status: '정상 운항', tone: 'ok', departure: '09:30', revisedDeparture: null,
    duration: '02:10', gate: '32',
  },
  clocks: {
    destinationNow: '09:15', destinationDate: '7/30', koreaNow: '09:15',
    arrivalLocal: '11:25', arrivalKorea: '11:25', arrivalKoreaDayOffset: 0,
  },
  weather: {
    current: { time: '09:15', type: 'rain', temperature: 27, feelsLike: 31, humidity: 78, wind: '남서 6m/s' },
    preArrival: { time: '10:00', type: 'cloudy', temperature: 27 },
    arrival: { time: '12:00', type: 'partly', temperature: 28 },
    afterArrival: [
      { time: '14:00', type: 'cloudy', temperature: 29 },
      { time: '16:00', type: 'cloudy', temperature: 28 },
      { time: '18:00', type: 'partly', temperature: 27 },
      { time: '20:00', type: 'cloudy', temperature: 26 },
    ],
  },
  dataState: { phase: 'ready', updatedAtKorea: '09:30', hasNextPage: true },
}
```

- Consumes later: `BoardView`, `RailView`, and future API adapters receive only `TerminalFlight` objects. Node-imported fixtures contain `logoKey` strings only; `airlineLogoRegistry.js` is the sole browser module that imports PNG files.

- [ ] **Step 1: Write the failing display-model tests**

Create tests that assert weather vocabulary, required fields, day-offset copy, and shared group identity:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  TERMINAL_WEATHER_LABELS,
  formatArrivalKorea,
  normalizeTerminalFlight,
  normalizeTerminalDataState,
} from './terminalDisplayModel.js'
import { TERMINAL_FLIGHT_GROUPS } from '../data/terminalFixtures.js'

test('승객용 날씨 문구는 승인된 어휘로 정규화한다', () => {
  assert.deepEqual(Object.values(TERMINAL_WEATHER_LABELS), [
    '맑음', '구름 조금', '구름 많음', '흐림', '비', '소나기', '눈', '뇌우',
  ])
})

test('한국 도착 시각은 날짜가 바뀔 때만 다음 날을 붙인다', () => {
  assert.equal(formatArrivalKorea({ time: '17:05', dayOffset: 0 }), '17:05')
  assert.equal(formatArrivalKorea({ time: '01:50', dayOffset: 1 }), '다음 날 01:50')
})

test('모든 화면은 같은 정규화 항공편 그룹을 소비한다', () => {
  const flight = TERMINAL_FLIGHT_GROUPS[0][0]
  assert.equal(flight.destination.code, 'HND')
  assert.equal(flight.weather.afterArrival.length, 4)
  assert.equal(flight.airline.flightNumber, 'JL92')
})

test('필수 승객 필드가 없으면 fixture 오류를 조기에 드러낸다', () => {
  assert.throws(
    () => normalizeTerminalFlight({ destination: { city: '도쿄' } }),
    /destination\.code/,
  )
})

test('부분 누락은 undefined나 -- 대신 승객용 문구로 정규화한다', () => {
  const flight = normalizeTerminalFlight({
    ...TERMINAL_FLIGHT_GROUPS[0][0],
    operation: { ...TERMINAL_FLIGHT_GROUPS[0][0].operation, gate: null, status: undefined },
    weather: { ...TERMINAL_FLIGHT_GROUPS[0][0].weather, current: null },
    dataState: { phase: 'partial', updatedAtKorea: null, hasNextPage: true },
  })
  assert.equal(flight.operation.gate, '정보 확인 중')
  assert.equal(flight.operation.status, '정보 확인 중')
  assert.equal(flight.weather.current.available, false)
  assert.equal(flight.weather.current.fallback, '예보 확인 중')
  assert.equal(flight.dataState.phase, 'partial')
  assert.doesNotMatch(JSON.stringify(flight), /undefined|"--"/)
})

test('로딩·오류·완료 상태를 명시적으로 정규화한다', () => {
  assert.deepEqual(normalizeTerminalDataState({ phase: 'loading' }), {
    phase: 'loading', updatedAtKorea: null, hasNextPage: false,
  })
  assert.equal(normalizeTerminalDataState({ phase: 'error' }).phase, 'error')
  assert.equal(normalizeTerminalDataState({ phase: 'ready', hasNextPage: true }).hasNextPage, true)
})
```

- [ ] **Step 2: Run the test and observe the expected failure**

Run:

```bash
node --test frontend/src/features/terminal/model/terminalDisplayModel.test.js
```

Expected: FAIL because `terminalDisplayModel.js` and `terminalFixtures.js` do not exist.

- [ ] **Step 3: Implement the model and canonical fixtures**

Implement a fixed approved label map, critical-identity validation, and optional-field fallback rather than allowing display components to infer fields. Missing `id`, destination city/code, or flight number is a fixture/programming error; optional operational/weather details normalize to `정보 확인 중`, and group-level phases render as `운항 정보를 불러오는 중입니다` or `운항 정보를 불러오지 못했습니다` rather than exposing blanks:

```js
export const TERMINAL_WEATHER_LABELS = Object.freeze({
  clear: '맑음',
  partly: '구름 조금',
  mostlyCloudy: '구름 많음',
  cloudy: '흐림',
  rain: '비',
  shower: '소나기',
  snow: '눈',
  storm: '뇌우',
})

const REQUIRED_PATHS = [
  'id', 'destination.city', 'destination.code', 'airline.flightNumber',
]

export function terminalFallback(value, copy = '정보 확인 중') {
  return value == null || value === '' || value === '--' ? copy : value
}

export function normalizeTerminalDataState(raw = {}) {
  const phase = ['loading', 'ready', 'partial', 'error'].includes(raw.phase) ? raw.phase : 'partial'
  return Object.freeze({
    phase,
    updatedAtKorea: raw.updatedAtKorea || null,
    hasNextPage: Boolean(raw.hasNextPage),
  })
}

export function normalizeWeatherPoint(raw) {
  if (!raw || !raw.type || raw.temperature == null || !raw.time) {
    return Object.freeze({ available: false, fallback: '예보 확인 중' })
  }
  return Object.freeze({
    ...raw,
    available: true,
    label: TERMINAL_WEATHER_LABELS[raw.type] || '예보 확인 중',
  })
}

export function formatArrivalKorea({ time, dayOffset = 0 }) {
  return dayOffset > 0 ? `다음 날 ${time}` : time
}

export function normalizeTerminalFlight(raw) {
  for (const path of REQUIRED_PATHS) {
    const value = path.split('.').reduce((current, key) => current?.[key], raw)
    if (value == null || value === '') throw new TypeError(`Missing terminal flight field: ${path}`)
  }
  return Object.freeze({
    ...raw,
    destination: {
      ...raw.destination,
      airportName: terminalFallback(raw.destination?.airportName),
      timezone: terminalFallback(raw.destination?.timezone),
    },
    airline: {
      ...raw.airline,
      name: terminalFallback(raw.airline?.name),
      logoKey: raw.airline?.logoKey || 'generic',
    },
    operation: {
      ...raw.operation,
      status: terminalFallback(raw.operation?.status),
      departure: terminalFallback(raw.operation?.departure),
      duration: terminalFallback(raw.operation?.duration),
      gate: terminalFallback(raw.operation?.gate),
    },
    clocks: {
      ...raw.clocks,
      destinationNow: terminalFallback(raw.clocks?.destinationNow),
      destinationDate: terminalFallback(raw.clocks?.destinationDate),
      koreaNow: terminalFallback(raw.clocks?.koreaNow),
      arrivalLocal: terminalFallback(raw.clocks?.arrivalLocal),
      arrivalKorea: terminalFallback(raw.clocks?.arrivalKorea),
    },
    weather: {
      current: normalizeWeatherPoint(raw.weather?.current),
      preArrival: normalizeWeatherPoint(raw.weather?.preArrival),
      arrival: normalizeWeatherPoint(raw.weather?.arrival),
      afterArrival: (raw.weather?.afterArrival || []).map(normalizeWeatherPoint),
    },
    dataState: normalizeTerminalDataState(raw.dataState),
  })
}
```

Construct two groups of three canonical fixtures by merging the current scenarios without changing their meaning: Tokyo/Osaka normal, Singapore/Bangkok normal or boarding-preparation, and Paris/Rome delayed or normal. Both 1안 and 3안 must receive the exact same group array. Keep only string `logoKey` values in this Node-safe fixture module; map them to imported PNG modules in `airlineLogoRegistry.js` at render time, with a bundled generic airline mark for unknown keys.

- [ ] **Step 4: Replace duplicated board/rail fixture arrays in the monolith**

Import `TERMINAL_FLIGHT_GROUPS` into `DestinationWeatherPage.jsx`, remove `boardFlights`, `railFlights`, and their alternate arrays, and temporarily adapt both current renderers to the normalized paths. Add explicit loading, partial, and error surfaces shared by both branches. Do not change the ready-state layout or copy in this task.

- [ ] **Step 5: Run the unit test and production build**

Run:

```bash
node --test frontend/src/features/terminal/model/terminalDisplayModel.test.js
npm run build --prefix frontend
```

Expected: PASS; the route still builds with one shared data source.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/terminal/model frontend/src/features/terminal/data frontend/src/features/terminal/components/airlineLogoRegistry.js frontend/src/features/terminal/DestinationWeatherPage.jsx
git commit -m "refactor(terminal): introduce shared signage model"
```

---

### Task 2: Split the Terminal Shell, Header, Controls, and Paging ✅

**Files:**
- Create: `frontend/src/features/terminal/model/terminalPager.js`
- Create: `frontend/src/features/terminal/model/terminalPager.test.js`
- Create: `frontend/src/features/terminal/motion/terminalPagerScheduler.js`
- Create: `frontend/src/features/terminal/motion/terminalPagerScheduler.test.js`
- Create: `frontend/src/features/terminal/motion/useTerminalPager.js`
- Create: `frontend/src/features/terminal/components/TerminalHeader.jsx`
- Create: `frontend/src/features/terminal/components/PageIndicator.jsx`
- Create: `frontend/src/features/terminal/TerminalPage.structure.test.js`
- Modify: `frontend/src/features/terminal/TerminalPage.jsx`
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx`

**Interfaces:**
- Produces: `parseTerminalView(search): 'board' | 'rail'`
- Produces: `parseTerminalFixtureState(search, { allowOverride }): 'ready' | 'loading' | 'partial' | 'error'`
- Produces: `applyTerminalFixtureState(groups, phase): TerminalFlight[][]`
- Produces: `nextPageIndex(currentPage, pageCount): number`
- Produces: `createTerminalPagerState(pageCount): TerminalPagerState`
- Produces: `terminalPagerReducer(state, event): TerminalPagerState`
- Produces: `createTerminalPagerScheduler({ clock, intervalMs, transitionMs, dispatch }): TerminalPagerScheduler`
- Produces: `useTerminalPager({ pageCount, intervalMs, enabled }): { currentPage, pendingPage, transitioning, advance, completeTransition }`
- Produces: `TerminalHeader({ view, motionMode, page, pageCount, onViewChange, onMotionChange, onAdvance })`
- Produces: `PageIndicator({ currentPage, pageCount })`

- [ ] **Step 1: Write failing pager tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createTerminalPagerState,
  nextPageIndex,
  parseTerminalView,
  terminalPagerReducer,
  parseTerminalFixtureState,
} from './terminalPager.js'

test('view=rail만 3안으로 해석한다', () => {
  assert.equal(parseTerminalView('?view=rail'), 'rail')
  assert.equal(parseTerminalView('?view=unknown'), 'board')
  assert.equal(parseTerminalView(''), 'board')
})

test('검증용 상태 override는 명시적으로 허용된 개발 환경에서만 해석한다', () => {
  assert.equal(parseTerminalFixtureState('?fixtureState=loading', { allowOverride: true }), 'loading')
  assert.equal(parseTerminalFixtureState('?fixtureState=partial', { allowOverride: true }), 'partial')
  assert.equal(parseTerminalFixtureState('?fixtureState=error', { allowOverride: true }), 'error')
  assert.equal(parseTerminalFixtureState('?fixtureState=error', { allowOverride: false }), 'ready')
})

test('다음 페이지는 마지막에서 처음으로 순환한다', () => {
  assert.equal(nextPageIndex(0, 2), 1)
  assert.equal(nextPageIndex(1, 2), 0)
})

test('자동과 수동 진행은 같은 ADVANCE 전이를 사용한다', () => {
  const initial = createTerminalPagerState(2)
  const manual = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'manual' })
  const automatic = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'automatic' })
  assert.deepEqual(manual, automatic)
  assert.deepEqual(manual, { currentPage: 0, pendingPage: 1, transitioning: true, pageCount: 2 })
})

test('전환 중 반복 입력은 무시하고 완료 시 한 번만 확정한다', () => {
  const initial = createTerminalPagerState(2)
  const entering = terminalPagerReducer(initial, { type: 'ADVANCE', source: 'manual' })
  assert.equal(terminalPagerReducer(entering, { type: 'ADVANCE', source: 'manual' }), entering)
  assert.deepEqual(
    terminalPagerReducer(entering, { type: 'COMPLETE' }),
    { currentPage: 1, pendingPage: 0, transitioning: false, pageCount: 2 },
  )
})

test('화면 전환 취소는 중간 페이지를 남기지 않는다', () => {
  const entering = terminalPagerReducer(createTerminalPagerState(2), { type: 'ADVANCE' })
  const cancelled = terminalPagerReducer(entering, { type: 'CANCEL' })
  assert.deepEqual(cancelled, createTerminalPagerState(2))
  assert.equal(terminalPagerReducer(cancelled, { type: 'COMPLETE' }), cancelled)
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
node --test frontend/src/features/terminal/model/terminalPager.test.js
```

Expected: FAIL because `terminalPager.js` is absent.

- [ ] **Step 3: Implement the pure pager helpers**

```js
export function parseTerminalView(search = '') {
  return new URLSearchParams(search).get('view') === 'rail' ? 'rail' : 'board'
}

export function nextPageIndex(currentPage, pageCount) {
  if (!Number.isInteger(pageCount) || pageCount < 1) throw new RangeError('pageCount must be positive')
  return (currentPage + 1) % pageCount
}

export function parseTerminalFixtureState(search = '', { allowOverride = false } = {}) {
  if (!allowOverride) return 'ready'
  const requested = new URLSearchParams(search).get('fixtureState')
  return ['loading', 'partial', 'error'].includes(requested) ? requested : 'ready'
}

export function createTerminalPagerState(pageCount) {
  return { currentPage: 0, pendingPage: nextPageIndex(0, pageCount), transitioning: false, pageCount }
}

export function terminalPagerReducer(state, event) {
  if (event.type === 'ADVANCE') {
    if (state.transitioning) return state
    return { ...state, pendingPage: nextPageIndex(state.currentPage, state.pageCount), transitioning: true }
  }
  if (event.type === 'COMPLETE') {
    if (!state.transitioning) return state
    const currentPage = state.pendingPage
    return { ...state, currentPage, pendingPage: nextPageIndex(currentPage, state.pageCount), transitioning: false }
  }
  if (event.type === 'CANCEL') {
    return { ...state, pendingPage: nextPageIndex(state.currentPage, state.pageCount), transitioning: false }
  }
  return state
}
```

- [ ] **Step 4: Write the failing scheduler lifecycle test**

Create an injectable fake clock that records interval/timeout callbacks and clear calls. Assert `start()` dispatches automatic `ADVANCE`, `scheduleCompletion()` dispatches `COMPLETE`, `cancel()` clears the completion timer and dispatches `CANCEL`, and `dispose()` clears both interval and timeout. Also assert invoking a captured stale timeout after cancellation cannot advance the reducer.

Run:

```bash
node --test frontend/src/features/terminal/motion/terminalPagerScheduler.test.js
```

Expected: FAIL because `terminalPagerScheduler.js` does not exist.

- [ ] **Step 5: Implement the timer scheduler and React paging lifecycle**

Implement `createTerminalPagerScheduler` against the injected clock, then move the current timer, pending-page, transition-completion, and manual replay logic into `useTerminalPager` backed by `terminalPagerReducer` and that scheduler. The hook must dispatch the same `ADVANCE` event for automatic and manual transitions. `autoplay=0` disables only the interval, not the manual control. Its effect cleanup calls `dispose()`; view changes call `cancel()` before rendering the other view.

- [ ] **Step 6: Add the development-only browser state seam**

First add failing fixture tests for `applyTerminalFixtureState(groups, phase)` and a source-structure test asserting `TerminalPage` passes `allowOverride: import.meta.env.DEV`; run them and observe failure. Then implement the helper in `terminalFixtures.js`: `loading` and `error` set the group state without erasing critical identity; `partial` removes one operational value and one weather point so both fallback paths are exercised. `TerminalPage` calls `parseTerminalFixtureState(window.location.search, { allowOverride: import.meta.env.DEV })`, then applies that state. Production builds always resolve to `ready` even if `fixtureState` is present in the URL.

- [ ] **Step 7: Extract header and page indicator**

`TerminalHeader` renders the exact common title `출발 항공편 · 도착지 날씨`, comparison controls, mode-specific animation controls, `다음 3편`, and the Korean clock. `PageIndicator` renders:

```jsx
<div
  className="terminal-page-indicator"
  role="img"
  aria-label={`${currentPage + 1} / ${pageCount} 페이지`}
>
  {Array.from({ length: pageCount }, (_, index) => (
    <i key={index} aria-hidden="true" className={index === currentPage ? 'is-current' : ''} />
  ))}
</div>
```

- [ ] **Step 8: Make `TerminalPage` the composition owner**

`TerminalPage` reads the URL once, owns the selected view and motion mode, gets `TERMINAL_FLIGHT_GROUPS`, and chooses `BoardView` or `RailView`. Until Tasks 4–5 create those components, keep `DestinationWeatherPage` as the temporary presentation child.

- [ ] **Step 9: Run tests and build**

```bash
node --test frontend/src/features/terminal/model/terminalPager.test.js
node --test frontend/src/features/terminal/model/terminalDisplayModel.test.js
node --test frontend/src/features/terminal/motion/terminalPagerScheduler.test.js
node --test frontend/src/features/terminal/TerminalPage.structure.test.js
npm run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/features/terminal
git commit -m "refactor(terminal): split signage shell and paging"
```

---

### Task 3: Establish the Scoped 50–65-Inch Signage Foundation ✅

**Files:**
- Create: `frontend/src/features/terminal/terminalStyle.test.js`
- Modify: `frontend/src/features/terminal/terminal.css`
- Modify: `frontend/src/features/terminal/TerminalPage.jsx`
- Modify: `frontend/src/shared/theme/tokens.css`
- Modify: `frontend/src/shared/theme/tokens.js`
- Modify: `frontend/src/shared/theme/tokens.test.js`
- Modify: `docs/policies/design/design-language.md`

**Interfaces:**
- Produces: shared `--signage-*` physical-display tokens and route-scoped `.terminal-signage` layout rules.
- Consumes later: all terminal components use shared signage/theme tokens rather than ad-hoc font sizes, colors, spacing, or radii.

- [ ] **Step 1: Write failing CSS ownership and token tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./terminal.css', import.meta.url), 'utf8')
const themeCss = readFileSync(new URL('../../shared/theme/tokens.css', import.meta.url), 'utf8')

test('터미널은 외부 폰트를 요청하지 않는다', () => {
  assert.doesNotMatch(css, /fonts\.googleapis|@import\s+url/)
  assert.match(css, /font-family:\s*var\(--font-base\)/)
})

test('50인치 기준 사이니지 타입 토큰은 공유 테마가 소유한다', () => {
  for (const declaration of [
    '--signage-title: 40px', '--signage-destination: 64px',
    '--signage-code: 34px', '--signage-flight: 48px',
    '--signage-primary: 56px', '--signage-temperature: 60px',
    '--signage-arrival: 40px', '--signage-clock: 36px',
    '--signage-status: 30px', '--signage-body: 28px',
    '--signage-label: 26px', '--signage-caption: 24px',
    '--signage-footer: 22px',
  ]) assert.match(themeCss, new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(css, /font-size:\s*var\(--signage-destination\)/)
})

test('시각 숫자는 고정 폭 숫자 정렬을 사용한다', () => {
  assert.match(css, /\.terminal-time-value[^}]*font-variant-numeric:\s*tabular-nums/s)
})

test('3안의 좌우 비율은 32 대 68이다', () => {
  assert.match(css, /grid-template-columns:\s*32%\s+68%/)
})
```

- [ ] **Step 2: Verify the tests fail against the current prototype CSS**

```bash
node --test frontend/src/features/terminal/terminalStyle.test.js
```

Expected: FAIL on Google Fonts, missing shared signage tokens/tabular numerals, and the current `33% 67%` ratio.

- [ ] **Step 3: Add the narrow signage token policy and shared tokens**

Add a `Terminal passenger signage` subsection to `docs/policies/design/design-language.md`: `/terminal` at fixed 1920×1080 may use the approved 22–64px physical-distance scale, but the scale must be declared once as `--signage-*` variables in `frontend/src/shared/theme/tokens.css` and mirrored in `tokens.js`; all colors, spacing, radii, and semantic states remain on the existing Fluent tokens. Add the approved values plus `--signage-safe-x: 40px` and `--signage-safe-y: 24px` to both token sources, update `tokens.test.js`, and run it.

- [ ] **Step 4: Scope the foundation to the route**

Replace the global `:root`, `html`, `body`, and generic `*` ownership with a route wrapper:

```css
.terminal-signage {
  box-sizing: border-box;
  min-width: 320px;
  min-height: 100vh;
  overflow: hidden;
  color: var(--text-1);
  background: var(--bg-5);
  font-family: var(--font-base);
}

.terminal-signage *,
.terminal-signage *::before,
.terminal-signage *::after { box-sizing: border-box; }

.terminal-time-value { font-variant-numeric: tabular-nums; }
```

Keep the exact 16:9 screen using `width: min(100vw, calc(100vh * 16 / 9))` and protect edge content with `--signage-safe-x` and `--signage-safe-y`.

- [ ] **Step 5: Replace passenger-facing literal font sizes with tokens**

Map each selector to the shared `--signage-*` table. Test-only controls may use 20–22px operator text during comparison, but nothing may fall below 20px; all elements marked `data-signage-text="required"` or `data-signage-text="ordinary"` must resolve to at least 24px and 26px respectively. Apply `.terminal-time-value` to every displayed clock, duration, gate, and temperature numeral.

- [ ] **Step 6: Apply the exact 32/68 rail ratio and page-dot dimensions**

Set `.rail-flight-row { grid-template-columns: 32% 68%; }`. Set page dots to 12px with at least 10px gap; use 14px only if the 1920×1080 capture shows insufficient visibility.

- [ ] **Step 7: Run tests and build**

```bash
node --test frontend/src/shared/theme/tokens.test.js
node --test frontend/src/features/terminal/terminalStyle.test.js
npm run build --prefix frontend
```

Expected: PASS with no Google Fonts import.

- [ ] **Step 8: Commit**

```bash
git add docs/policies/design/design-language.md frontend/src/shared/theme frontend/src/features/terminal/terminal.css frontend/src/features/terminal/terminalStyle.test.js frontend/src/features/terminal/TerminalPage.jsx
git commit -m "style(terminal): establish signage type foundation"
```

---

### Task 4: Rebuild 1안 Around Arrival Weather ✅

**Files:**
- Create: `frontend/src/features/terminal/components/WeatherVisual.jsx`
- Create: `frontend/src/features/terminal/components/BoardView.jsx`
- Create: `frontend/src/features/terminal/components/BoardFlightColumn.jsx`
- Create: `frontend/src/features/terminal/components/BoardFlightColumn.structure.test.js`
- Modify: `frontend/src/features/terminal/TerminalPage.jsx`
- Modify: `frontend/src/features/terminal/terminal.css`
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx`

**Interfaces:**
- Produces: `WeatherVisual({ weather, size, includeCondition, textPriority })`
- Produces: `BoardView({ activeFlights, pendingFlights, transition })`
- Produces: `BoardFlightColumn({ flight, columnIndex })`
- Consumes: `TerminalFlight` from Task 1 and shared shell from Task 2.

- [ ] **Step 1: Write the failing source-structure test for approved order and copy**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./BoardFlightColumn.jsx', import.meta.url), 'utf8')

test('1안은 승객 우선순위 순서로 렌더한다', () => {
  const sections = ['identity', 'flight', 'departure', 'arrival', 'forecast', 'current-weather']
  const positions = sections.map((name) => source.indexOf(`data-section="${name}"`))
  assert.ok(positions.every((position) => position >= 0))
  assert.deepEqual([...positions].sort((a, b) => a - b), positions)
})

test('승객용 고정 문구는 짧은 승인 문구를 사용한다', () => {
  assert.match(source, />출발</)
  assert.match(source, />탑승구</)
  assert.match(source, />도착</)
  assert.doesNotMatch(source, /출발 예정|도착 예정|예상 도착|운항 상태/)
})
```

- [ ] **Step 2: Verify failure**

```bash
node --test frontend/src/features/terminal/components/BoardFlightColumn.structure.test.js
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the ordered column markup**

Use explicit section markers and keep fixed labels outside animated values:

```jsx
<article className="terminal-board-flight">
  <section data-section="identity" className="terminal-board-identity">…</section>
  <section data-section="flight" className="terminal-board-flight-id">…</section>
  <section data-section="departure" className="terminal-board-departure">…</section>
  <section data-section="arrival" className="terminal-arrival-surface">…</section>
  <section data-section="forecast" className="terminal-board-forecast">…</section>
  <section data-section="current-weather" className="terminal-current-weather">…</section>
</article>
```

Render the destination city at 64px, the airport code at 34px, and the airport name as 26px secondary text. Use `현지 시각` with a 36px value and 24px date/Korean conversion. Do not place a long airport name inside the large city line.

If `flight.dataState.phase` is `loading` or `error`, render the full-column messages `운항 정보를 불러오는 중입니다` or `운항 정보를 불러오지 못했습니다`. For `partial`, keep available higher-priority sections and render `정보 확인 중` or `예보 확인 중` only in the affected value/group; never render an empty text node, `undefined`, or `--`.

- [ ] **Step 4: Implement the arrival highlight surface**

The surface contains `도착`, equal local/Korean clocks, arrival icon, approved weather label, and temperature. Use `var(--bg-3)` with a `var(--stroke-1)` 1px border; no gradient, shadow, badge, or large radius. Mark the time, condition, and temperature as ordinary or required signage text for the browser size contract. `WeatherVisual` checks `weather.available`; an unavailable point renders the single fixed phrase `예보 확인 중` without a broken icon or empty temperature.

- [ ] **Step 5: Preserve five forecast positions without shrinking text**

Render arrival plus four `afterArrival` items as five equal cells. Each cell order is time → icon → condition → temperature. If the current fixtures overflow at 26px, reduce icon width and internal gaps first; do not reduce text below the token floor and do not remove a cell in this plan.

- [ ] **Step 6: Move current weather after the forecast and compact ancillary detail**

Render `${city} 현재 날씨`, temperature, condition, and a compact detail line. Keep feels-like, humidity, and wind available but visually secondary. The section must not exceed the arrival surface's visual weight.

- [ ] **Step 7: Wire `BoardView` into `TerminalPage` and remove its old monolith branch**

Keep both active and pending pages mounted only during transition. Pass the same `TERMINAL_FLIGHT_GROUPS` used by 3안.

- [ ] **Step 8: Run focused tests and build**

```bash
node --test frontend/src/features/terminal/components/BoardFlightColumn.structure.test.js
node --test frontend/src/features/terminal/model/terminalDisplayModel.test.js
node --test frontend/src/features/terminal/terminalStyle.test.js
npm run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/features/terminal
git commit -m "feat(terminal): redesign three-column passenger board"
```

---

### Task 5: Rebuild 3안 Around the Arrival Forecast Rail ✅

**Files:**
- Create: `frontend/src/features/terminal/components/RailView.jsx`
- Create: `frontend/src/features/terminal/components/RailFlightRow.jsx`
- Create: `frontend/src/features/terminal/components/RailFlightRow.structure.test.js`
- Modify: `frontend/src/features/terminal/TerminalPage.jsx`
- Modify: `frontend/src/features/terminal/terminal.css`
- Modify: `frontend/src/features/terminal/DestinationWeatherPage.jsx`

**Interfaces:**
- Produces: `RailView({ activeFlights, pendingFlights, transition })`
- Produces: `RailFlightRow({ flight, rowIndex })`
- Consumes: the same `TerminalFlight` objects and `WeatherVisual` as 1안.

- [ ] **Step 1: Write the failing rail structure test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./RailFlightRow.jsx', import.meta.url), 'utf8')

test('3안은 운항정보와 도착예보를 명시적으로 분리한다', () => {
  assert.match(source, /data-region="flight-info"/)
  assert.match(source, /data-region="arrival-weather"/)
})

test('도착 예보가 일반 과거 예보보다 먼저 온다', () => {
  const arrival = source.indexOf('data-section="arrival"')
  const future = source.indexOf('data-section="future-forecast"')
  const preArrival = source.indexOf('data-section="pre-arrival"')
  assert.ok(arrival >= 0 && future > arrival && preArrival > arrival)
  assert.doesNotMatch(source, /pastForecast/)
})

test('도착 시각은 현지와 한국 고정 열을 사용한다', () => {
  assert.match(source, />현지</)
  assert.match(source, />한국</)
  assert.doesNotMatch(source, /한국[^<]*KST/)
})
```

- [ ] **Step 2: Verify failure**

```bash
node --test frontend/src/features/terminal/components/RailFlightRow.structure.test.js
```

Expected: FAIL because `RailFlightRow.jsx` is absent.

- [ ] **Step 3: Implement the 32% flight-information region**

Render city/code, airport/local clock, logo/flight/status, then departure/duration/gate. Keep vertical dividers only between the three operational values. Do not add horizontal rules above or below the flight number.

Use the same `loading`, `partial`, and `error` rules and exact fallback copy as 1안. State handling is shared display-model behavior, not a layout-specific interpretation.

- [ ] **Step 4: Implement the 68% arrival-weather region**

At the top, render `도착` and a stable two-column clock grid:

```jsx
<div className="terminal-arrival-clocks">
  <div><span>현지</span><strong>{flight.clocks.arrivalLocal}</strong></div>
  <div><span>한국</span><strong>{formatArrivalKorea({ time: flight.clocks.arrivalKorea, dayOffset: flight.clocks.arrivalKoreaDayOffset })}</strong></div>
</div>
```

The label columns stay fixed when `다음 날` appears. Place the arrival forecast as the first emphasized forecast surface, followed by the four future items. Place `도착 1시간 전` in the former aircraft-icon area as a smaller auxiliary forecast, never as the primary marker.

- [ ] **Step 5: Apply the signage type tokens**

Use the same shared tokens as 1안: `--signage-destination` (64px), `--signage-flight` (48px), `--signage-primary` (56px), `--signage-arrival` (40px), and `--signage-label` (26px). Do not introduce rail-only hard-coded font sizes. If a long destination or three operational values compete for space, reduce internal gaps, wrap secondary airport text, or remove lower-priority ancillary copy before changing these sizes. Keep the page within one 1080p frame.

- [ ] **Step 6: Wire `RailView` and remove the old rail branch**

`TerminalPage` selects `RailView` for `?view=rail`. Both views receive the same group and page index; switching view must not reset to a different fixture universe.

- [ ] **Step 7: Run focused tests and build**

```bash
node --test frontend/src/features/terminal/components/RailFlightRow.structure.test.js
node --test frontend/src/features/terminal/model/terminalDisplayModel.test.js
node --test frontend/src/features/terminal/terminalStyle.test.js
npm run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/terminal
git commit -m "feat(terminal): redesign passenger forecast rail"
```

---

### Task 6: Restrict Motion to Changing Values ✅

**Files:**
- Create: `frontend/src/features/terminal/motion/AnimatedValue.jsx`
- Create: `frontend/src/features/terminal/motion/AnimatedValue.structure.test.js`
- Modify: `frontend/src/features/terminal/components/BoardFlightColumn.jsx`
- Modify: `frontend/src/features/terminal/components/RailFlightRow.jsx`
- Modify: `frontend/src/features/terminal/terminal.css`

**Interfaces:**
- Produces: `AnimatedValue({ as, mode, order, children, className })`
- Fixed labels remain ordinary DOM siblings outside `AnimatedValue`.
- Motion unit selector: `[data-terminal-motion-value]`

- [ ] **Step 1: Write failing motion-boundary tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const board = readFileSync(new URL('../components/BoardFlightColumn.jsx', import.meta.url), 'utf8')
const rail = readFileSync(new URL('../components/RailFlightRow.jsx', import.meta.url), 'utf8')
const motion = readFileSync(new URL('./AnimatedValue.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('../terminal.css', import.meta.url), 'utf8')

test('애니메이션 경계는 값에만 식별자를 부여한다', () => {
  assert.match(motion, /data-terminal-motion-value/)
  for (const label of ['출발', '탑승구', '도착', '현지', '한국', '현재 날씨']) {
    assert.doesNotMatch(board, new RegExp(`<AnimatedValue[^>]*>${label}`))
    assert.doesNotMatch(rail, new RegExp(`<AnimatedValue[^>]*>${label}`))
  }
})

test('CASCADE도 행이 아니라 값 묶음에만 시차를 준다', () => {
  assert.doesNotMatch(css, /rail-motion-cascade[^}]*\.rail-flight-row[^}]*transform/s)
  assert.match(css, /rail-motion-cascade[^}]*\[data-terminal-motion-value\]/s)
})
```

- [ ] **Step 2: Verify failure**

```bash
node --test frontend/src/features/terminal/motion/AnimatedValue.structure.test.js
```

Expected: FAIL because `AnimatedValue.jsx` is absent.

- [ ] **Step 3: Implement one value animation primitive**

```jsx
export default function AnimatedValue({ as: Element = 'span', mode, order = 0, className = '', children }) {
  return (
    <Element
      className={`terminal-motion-value terminal-motion-value--${mode} ${className}`.trim()}
      data-terminal-motion-value=""
      style={{ '--terminal-motion-order': order }}
    >
      {children}
    </Element>
  )
}
```

Use it for destination values, flight number, operational values, clock values, weather icon/condition/temperature groups, and no fixed labels. Render `${city} 현재 날씨` as an animated city value followed by a fixed `현재 날씨` label so the whole heading does not move.

- [ ] **Step 4: Consolidate every mode on stationary-row value boundaries**

Target `.terminal-motion-value` rather than entire panels, rows, or label/value containers. FLAP, ROLL, WIPE, and FADE animate each value boundary. CASCADE keeps every 3안 row and fixed label stationary and applies staggered delays only to value groups, using `rowIndex` to derive the value order without transforming `.rail-flight-row`. Ensure an entering value starts hidden while the leaving value is visible, then reverse without an overlap frame.

- [ ] **Step 5: Preserve reduced-motion behavior**

Under `@media (prefers-reduced-motion: reduce)`, disable transform/clip animation and use an effectively immediate opacity swap. Keep the new value visible after transition completion.

- [ ] **Step 6: Run tests and build**

```bash
node --test frontend/src/features/terminal/motion/AnimatedValue.structure.test.js
node --test frontend/src/features/terminal/components/BoardFlightColumn.structure.test.js
node --test frontend/src/features/terminal/components/RailFlightRow.structure.test.js
npm run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/terminal
git commit -m "fix(terminal): animate changing signage values only"
```

---

### Task 7: Add the Managed 1920×1080 Terminal Signage Contract ✅

**Files:**
- Create: `frontend/verification/contracts/terminal-signage.spec.mjs`
- Create generated baselines: `frontend/verification/contracts/terminal-signage.spec.mjs-snapshots/*-desktop-linux.png`
- Modify: `frontend/scripts/terminal-signage-capture.mjs`
- Modify: `frontend/scripts/terminal-signage-capture.test.mjs`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**
- Produces contract id: `terminal-signage`
- Contract route states: `/terminal?autoplay=0` and `/terminal?view=rail&autoplay=0`
- Evidence directory: `artifacts/responsive-screenshots/terminal-signage/<timestamp>_<label>/`

- [ ] **Step 1: Write the failing Playwright contract**

Create a desktop-only 1920×1080 contract with role/text locators and data attributes, not positional CSS selectors:

```js
import { test, expect } from '@playwright/test'

test.use({ viewport: { width: 1920, height: 1080 } })
test.beforeEach(({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'terminal signage has one fixed 1920x1080 contract')
})

const cases = [
  { name: 'board', url: '/terminal?autoplay=0', button: '1안' },
  { name: 'rail', url: '/terminal?view=rail&autoplay=0', button: '3안' },
]

for (const target of cases) {
  test(`terminal-signage ${target.name} keeps passenger text legible`, async ({ page }) => {
    const externalFonts = []
    page.on('request', (request) => {
      if (/fonts\.googleapis|fonts\.gstatic/.test(request.url())) externalFonts.push(request.url())
    })
    await page.goto(target.url)
    await expect(page.getByRole('heading', { name: '출발 항공편 · 도착지 날씨' })).toBeVisible()
    await expect(page.getByRole('button', { name: target.button })).toHaveClass(/is-active/)

    const metrics = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      required: [...document.querySelectorAll('[data-signage-text="required"]')]
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      ordinary: [...document.querySelectorAll('[data-signage-text="ordinary"]')]
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      auxiliary: [...document.querySelectorAll('[data-signage-text="auxiliary"]')]
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
      allText: [...document.querySelectorAll('.terminal-signage *')]
        .filter((node) => [...node.childNodes].some((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()))
        .map((node) => Number.parseFloat(getComputedStyle(node).fontSize)),
    }))

    expect(metrics.width).toBeLessThanOrEqual(1920)
    expect(metrics.height).toBeLessThanOrEqual(1080)
    expect(metrics.required.length).toBeGreaterThan(0)
    expect(metrics.ordinary.length).toBeGreaterThan(0)
    expect(metrics.auxiliary.length).toBeGreaterThan(0)
    expect(metrics.allText.length).toBeGreaterThan(0)
    expect(Math.min(...metrics.required)).toBeGreaterThanOrEqual(24)
    expect(Math.min(...metrics.ordinary)).toBeGreaterThanOrEqual(26)
    expect(Math.min(...metrics.auxiliary)).toBeGreaterThanOrEqual(22)
    expect(Math.min(...metrics.allText)).toBeGreaterThanOrEqual(20)
    expect(externalFonts).toEqual([])
    await expect(page).toHaveScreenshot(`terminal-${target.name}.png`, { animations: 'disabled' })
  })
}
```

- [ ] **Step 2: Add semantic order, state, paging, and motion assertions**

For 1안, compare section bounding boxes and assert identity < flight < departure < arrival < forecast < current weather. For 3안, assert the arrival surface begins before future forecast cells and the flight-info/arrival-weather widths are within ±1% of 32/68. Exercise FLAP, ROLL, WIPE, and FADE in both views plus CASCADE in 3안. For every mode, click `다음 3편`, inspect `[data-fixed-label]`, and assert their text and bounding boxes remain unchanged throughout the transition; add a dedicated CASCADE assertion that all three row boxes remain fixed while ordered value groups animate. Within `.terminal-signage`, assert only `[data-terminal-motion-value]` elements report active animations.

Advance to both committed flight groups and assert the Paris/Rome `다음 날` clock and the longest destination/airport name remain inside their regions. Switch view during an active transition, record the page indicator, wait longer than the old transition timeout, and verify no `.is-entering` page remains and the page indicator did not advance.

Use the Task 2 development-only seam at `/terminal?autoplay=0&fixtureState=loading|partial|error` and `/terminal?view=rail&autoplay=0&fixtureState=loading|partial|error`. Both views must show the approved readable fallback copy, never `undefined`, blank output, or `--`. The pure parser/source tests separately prove this override resolves to `ready` when `import.meta.env.DEV` is false.

- [ ] **Step 3: Run the contract and confirm it fails before all markup hooks exist**

Run:

```bash
npm run dev:contract -- --project=desktop --grep terminal-signage
```

Expected: FAIL on missing semantic hooks, state rendering, size attributes, or Linux screenshot baselines until the implementation is complete.

- [ ] **Step 4: Add only the missing semantic hooks and fix real layout failures**

Add `data-signage-text`, `data-fixed-label`, `data-section`, and `data-region` to production markup. If screenshots reveal clipping, adjust icon size, internal spacing, or secondary content wrapping before changing font tokens. Do not reduce type below the specified floors.

- [ ] **Step 5: Finalize the focused capture script**

First extend `terminal-signage-capture.test.mjs` to require the final common heading and active view/motion fields in the manifest; observe the failure. Then update the Task 0 script so its final-state capture:

1. use `PROJECTAMO_URL` or `http://127.0.0.1:5173`;
2. open both route states at 1920×1080;
3. wait for the common heading rather than `networkidle`;
4. save `01-board.png` and `02-rail.png`;
5. write a JSON manifest containing timestamp, Git revision, viewport, URLs, command, and active view/motion state.

Rerun the focused test immediately after the script change:

```bash
node --test frontend/scripts/terminal-signage-capture.test.mjs
```

Expected: PASS before snapshot generation proceeds.

- [ ] **Step 6: Generate and visually review Linux screenshot baselines**

After all semantic assertions pass, generate the baselines explicitly:

```bash
npm run dev:contract -- --project=desktop --grep terminal-signage --update-snapshots
```

Inspect every generated `frontend/verification/contracts/terminal-signage.spec.mjs-snapshots/*-desktop-linux.png` directly at 1920×1080. Confirm scan order, arrival emphasis, five forecast positions, long-name fit, `다음 날` alignment, and absence of overlap. Do not accept the files merely because Playwright wrote them.

- [ ] **Step 7: Register the contract**

Add this row to `docs/policies/verification/contracts.md`:

```markdown
| `terminal-signage` | `/terminal`; 1안 board, 3안 rail, type floors, value-only motion | 1920×1080 desktop | committed terminal fixtures; `autoplay=0` | `frontend/verification/contracts/terminal-signage.spec.mjs` | frontend | active |
```

- [ ] **Step 8: Rerun without update mode**

```bash
npm run dev:contract -- --project=desktop --grep terminal-signage
```

Expected: all semantic, size, motion, overflow, and screenshot assertions PASS.

- [ ] **Step 9: Commit the contract and reviewed baselines**

```bash
git add frontend/verification/contracts/terminal-signage.spec.mjs frontend/verification/contracts/terminal-signage.spec.mjs-snapshots frontend/scripts/terminal-signage-capture.mjs frontend/scripts/terminal-signage-capture.test.mjs docs/policies/verification/contracts.md frontend/src/features/terminal
git commit -m "test(terminal): add passenger signage contract"
```

---

### Task 8: Remove the Prototype and Finish the First-Class Feature ✅

**Files:**
- Delete: `prototypes/destination-weather-comparison/`
- Delete: `frontend/src/features/terminal/DestinationWeatherPage.jsx`
- Modify: `frontend/src/features/terminal/TerminalPage.structure.test.js`
- Modify: `Architecture.md`
- Verify: `frontend/src/app/App.jsx`

**Interfaces:**
- Final production entry: `App.jsx` lazy-loads `features/terminal/TerminalPage.jsx` for `/terminal`.
- Final production ownership: every runtime source and asset is below `frontend/`.

- [ ] **Step 1: Write the failing ownership test before deletion**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../../app/App.jsx', import.meta.url), 'utf8')
const terminal = readFileSync(new URL('./TerminalPage.jsx', import.meta.url), 'utf8')

test('/terminal은 정식 feature entry만 lazy-load한다', () => {
  assert.match(app, /features\/terminal\/TerminalPage\.jsx/)
  assert.doesNotMatch(app, /prototypes\/|DestinationWeatherPage/)
  assert.doesNotMatch(terminal, /prototypes\/|DestinationWeatherPage/)
})
```

Run:

```bash
node --test frontend/src/features/terminal/TerminalPage.structure.test.js
```

Expected: FAIL while `TerminalPage.jsx` still imports `DestinationWeatherPage.jsx`.

- [ ] **Step 2: Point `TerminalPage` only at the final components**

Remove the compatibility import and render the shared shell with `BoardView` or `RailView` directly. Keep the `/terminal` lazy route in `App.jsx` unchanged.

- [ ] **Step 3: Reconfirm the committed visual contract before deletion**

Run:

```bash
set -e
test "$(git ls-files 'frontend/verification/contracts/terminal-signage.spec.mjs-snapshots/*-desktop-linux.png' | wc -l)" -eq 2
node --test scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.test.mjs frontend/src/shared/theme/tokens.test.js $(rg --files frontend/src/features/terminal -g '*.test.js' | sort)
npm run build --prefix frontend
npm run dev:contract -- --project=desktop --grep terminal-signage
```

Expected: exactly two reviewed Linux baselines are tracked; the ownership test and every other terminal/tooling/token unit test pass; the production build passes; and the clean managed contract passes without `--update-snapshots`. The shell command sequence must stop before `git rm` if any check fails.

- [ ] **Step 4: Delete the superseded prototype and compatibility component**

```bash
git rm -r prototypes/destination-weather-comparison
git rm frontend/src/features/terminal/DestinationWeatherPage.jsx
```

The approved spec contains the retained design decisions, so the prototype-only Vite config, package files, QA HTML, worker, screenshots, duplicated assets, and prototype notes are all removed together.

- [ ] **Step 5: Update architecture ownership**

Update the terminal entry in `Architecture.md` to list `TerminalPage`, shared model/data, board/rail components, motion boundary, scoped CSS, and the `terminal-signage` browser contract. Remove wording that describes the page as a copied prototype.

- [ ] **Step 6: Prove there are no prototype references**

Run:

```bash
rg -n "prototypes/destination-weather-comparison|DestinationWeatherPage" frontend Architecture.md package.json frontend/package.json
```

Expected: no runtime or architecture references. Historical references in Git history do not matter.

- [ ] **Step 7: Run the full focused verification set**

```bash
set -e
node --test scripts/projectamo-dev.test.mjs frontend/scripts/terminal-signage-capture.test.mjs frontend/src/shared/theme/tokens.test.js $(rg --files frontend/src/features/terminal -g '*.test.js' | sort)
npm run build --prefix frontend
npm run dev:contract -- --project=desktop --grep terminal-signage
git diff --check
```

Expected: all unit tests PASS, production build PASS, terminal contract PASS, and no whitespace errors.

- [ ] **Step 8: Produce final Linux screenshot evidence**

Run the bounded managed capture procedure:

```bash
PROJECTAMO_SCREENSHOT_PHASE=terminal-signage PROJECTAMO_SCREENSHOT_LABEL=after npm run dev:terminal-capture
```

Inspect both 1920×1080 images directly. Record any remaining physical-display-only checks as pending rather than claiming 5m readability from a desktop screenshot.

- [ ] **Step 9: Refresh the code graph**

```bash
graphify update .
```

Expected: graph updates without a blocking error; warnings about the installed graphify skill version or optional SQL parser may be recorded but are not terminal-feature failures.

- [ ] **Step 10: Commit**

```bash
git add Architecture.md frontend/src/features/terminal docs/policies/verification/contracts.md frontend/verification/contracts/terminal-signage.spec.mjs frontend/scripts/terminal-signage-capture.mjs
git commit -m "chore(terminal): promote signage feature and remove prototype"
```

---

## Final Acceptance Checklist

- [ ] `/terminal?autoplay=0` renders 1안 from the final frontend feature only.
- [ ] `/terminal?view=rail&autoplay=0` renders 3안 from the same normalized flight group.
- [ ] Both views show `출발 항공편 · 도착지 날씨` and the approved short labels.
- [ ] 1안 orders arrival weather before current destination weather.
- [ ] 3안 uses 32/68 and starts the main weather sequence at arrival, followed by future forecasts.
- [ ] Required/ordinary/auxiliary text meets 24/26/22px floors at 1920×1080.
- [ ] No visible terminal text, including test controls, is below 20px.
- [ ] All time, duration, gate, and temperature numerals use tabular figures.
- [ ] No Google Fonts request occurs.
- [ ] Page dots are 12–14px with at least 10px spacing and an accessible page-count name.
- [ ] Fixed labels remain stable in every animation mode.
- [ ] CASCADE staggers value groups while all three row boxes and fixed labels stay stationary.
- [ ] FLAP and ROLL never show old/new values fully opaque at the same time.
- [ ] Reduced-motion users receive no substantive translation or rotation.
- [ ] Five forecast positions and current-weather detail remain available pending the user's later content decision.
- [ ] Test controls remain available pending the user's later production-control decision.
- [ ] Loading, partial, and error states use readable Korean fallback copy with no blank, `undefined`, or `--` output.
- [ ] No runtime import or file remains under `prototypes/destination-weather-comparison/`.
- [ ] Reviewed desktop Linux screenshot baselines are tracked and pass without update mode.
- [ ] Unit tests, production build, managed Playwright contract, and `git diff --check` pass.
- [ ] Linux 1920×1080 screenshots are stored with a manifest and visually inspected.
- [ ] Physical 50-inch and 65-inch, 3m and 5m checks remain an explicit onsite acceptance step.
