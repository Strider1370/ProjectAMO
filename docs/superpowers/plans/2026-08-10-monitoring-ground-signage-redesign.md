# Monitoring Ground Signage Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/monitoring?mode=ground` left column as a fixed Full-HD signage stack with icon-led observations and one automatically alternating hourly/weekly forecast viewport.

**Architecture:** Keep the 1920px monitoring canvas, top header, right map, backend payloads, and operations mode unchanged. Add a pure ground-forecast view model for slot/scaling/metadata rules, let a dedicated `GroundForecastViewport` own the two forecast layers and their single 12-second timer, and keep hourly/weekly renderers focused on their own aligned data surfaces. Scope all new geometry and type rules to `data-dashboard-mode="ground"`.

**Tech Stack:** React 19 JSX, CSS Grid/table/SVG, `react-icons/wi`, Node `node:test`, Playwright contracts, existing monitoring fixture and Linux screenshot artifacts.

## Global Constraints

- Fixed screen is 1920×1080; the existing header and right map must not move or resize.
- Left content starts at `x=20`, is `1015px` wide, and keeps `12px` vertical gaps.
- Ground rows are alert `130px`, current observation `300px`, and forecast `507px`.
- Alert name is about `30px`; effective time is about `20px`.
- Current icon is about `104px`; current temperature `64px`; observation values `26px`; metric icons `36px`.
- Hourly forecast is one eight-column grid. Time, icon, temperature dot/label, precipitation bar, and percentage use the same column centre.
- Temperature dots and labels derive from one temperature scale; labels receive only one constant visual offset.
- Precipitation bars live in the same SVG as the temperature graph, use a separate 0–100% vertical scale, and share the hourly x scale.
- Weekly forecast is one six-day table with shared rows and `28px` left/right/bottom inset plus `26px` title-to-table spacing.
- Forecast starts on hourly, alternates every `12_000ms`, and fades only inside its viewport for `350ms`.
- The fixed title order is `시간별 예보 | 주간 예보`; only `현재`/`다음` emphasis changes.
- A `4px` blue progress line runs linearly for the same 12-second cycle; reuse the terminal progress treatment and its existing `#2f80ed` fill only for this timing indicator, as explicitly approved in the spec. No numeric countdown or manual control is added.
- Visible source metadata is only `동네예보 HH시 · 중기예보 HH시`. Do not display dates, minutes, `발표`, `단기예보`, or raw source keys.
- Missing hourly/weekly values retain eight/six slots with `-`; missing source time retains both labels and substitutes `-` for the value.
- Existing backend schemas and `data.groundForecast` flow remain unchanged.
- Preserve all user-owned dirty work. In particular, do not revert or accidentally commit the airport-selection hunks already present in `MonitoringPage.jsx`, `monitoring.spec.mjs`, and `monitoring-fixture.mjs`; use the new signage-specific fixture/contract files below and stage only task-owned hunks.
- Use real BasMilius weather assets through the existing registry and real `react-icons/wi` observation icons. Add no emoji, CSS-drawn icon, handcrafted SVG asset, gradient, or new dependency.
- Browser locators use role, accessible name, visible text, then test ID. CSS selectors are reserved for non-semantic geometry measurements inside an already scoped panel.

---

### Task 1: Add the pure forecast display model

**Files:**
- Create: `frontend/src/features/monitoring/legacy/utils/groundForecastViewModel.js`
- Create: `frontend/src/features/monitoring/legacy/utils/groundForecastViewModel.test.js`

**Interfaces:**
- Consumes: existing airport forecast shape `{ hourly, hourly_status, forecast, tmFc }`.
- Produces:
  - `GROUND_FORECAST_VIEW = { HOURLY: 'hourly', WEEKLY: 'weekly' }`
  - `GROUND_FORECAST_CYCLE_MS = 12_000`
  - `GROUND_FORECAST_FADE_MS = 350`
  - `selectHourlyForecastSlots(hourly): Array<HourlySlot|null>` with length 8
  - `selectWeeklyForecastDays(forecast): Array<ForecastDay|null>` with length 6 and today excluded
  - `forecastColumnCenter(index, { start, end, count }): number`
  - `createTemperatureScale(slots, { top, bottom }): (value) => number|null`
  - `precipitationBar(value, { top, bottom }): { value, y, height }`
  - `formatGroundForecastMeta(airportForecast): string`
  - `nextGroundForecastView(view): 'hourly'|'weekly'`

- [ ] **Step 1: Write failing unit tests for stable slots and scales**

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTemperatureScale,
  forecastColumnCenter,
  formatGroundForecastMeta,
  nextGroundForecastView,
  precipitationBar,
  selectHourlyForecastSlots,
  selectWeeklyForecastDays,
} from './groundForecastViewModel.js'

test('hourly display keeps exactly eight three-hour positions', () => {
  const hourly = Array.from({ length: 24 }, (_, index) => ({
    date: index < 9 ? '20260810' : '20260811',
    time: `${String((15 + index) % 24).padStart(2, '0')}00`,
    temp: 24 + (index % 5),
    rainProb: index * 4,
  }))
  const slots = selectHourlyForecastSlots(hourly)
  assert.equal(slots.length, 8)
  assert.deepEqual(slots.map((slot) => slot?.time), ['1500', '1800', '2100', '0000', '0300', '0600', '0900', '1200'])
})

test('shared x scale returns one centre per column', () => {
  assert.deepEqual(
    Array.from({ length: 8 }, (_, index) => forecastColumnCenter(index, { start: 80, end: 960, count: 8 })),
    [135, 245, 355, 465, 575, 685, 795, 905],
  )
})

test('temperature scale pads the data domain and handles a flat series', () => {
  const varied = createTemperatureScale([{ temp: 20 }, { temp: 24 }], { top: 120, bottom: 250 })
  assert.ok(varied(24) < varied(20))
  const flat = createTemperatureScale([{ temp: 22 }, { temp: 22 }], { top: 120, bottom: 250 })
  assert.equal(flat(22), 185)
})

test('precipitation bars clamp to the 0-100 percent band', () => {
  assert.deepEqual(precipitationBar(0, { top: 290, bottom: 370 }), { value: 0, y: 370, height: 0 })
  assert.deepEqual(precipitationBar(50, { top: 290, bottom: 370 }), { value: 50, y: 330, height: 40 })
  assert.deepEqual(precipitationBar(100, { top: 290, bottom: 370 }), { value: 100, y: 290, height: 80 })
})

test('metadata exposes only village and mid-range issue hours', () => {
  const label = formatGroundForecastMeta({ hourly_status: { base_time: '1400' }, tmFc: '202608100600' })
  assert.equal(label, '동네예보 14시 · 중기예보 06시')
  assert.equal(formatGroundForecastMeta({ hourly_status: { base_time: '1400' } }), '동네예보 14시 · 중기예보 -')
  assert.doesNotMatch(label, /mid|short|tmFc|발표|08\/10/i)
})
```

Add cases proving partial hourly/weekly arrays are padded with `null`, today is excluded, and `nextGroundForecastView()` alternates both ways.

- [ ] **Step 2: Run the unit file and verify RED**

Run:

```bash
npm --prefix frontend test -- src/features/monitoring/legacy/utils/groundForecastViewModel.test.js
```

Expected: FAIL because `groundForecastViewModel.js` does not exist.

- [ ] **Step 3: Implement the minimum pure model**

Use the existing hourly contract: select hours divisible by three, take the first eight in input order, then pad. Weekly selection filters `isToday`, takes six, then pads. The x helper treats `start`/`end` as the outer cell edges:

```js
export function forecastColumnCenter(index, { start, end, count }) {
  const width = (end - start) / count
  return start + width * (index + 0.5)
}

export function createTemperatureScale(slots, { top, bottom }) {
  const values = slots.map((slot) => slot?.temp).filter(Number.isFinite)
  if (!values.length) return () => null
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  if (rawMin === rawMax) return (value) => Number.isFinite(value) ? (top + bottom) / 2 : null
  const min = rawMin - 1
  const max = rawMax + 1
  return (value) => Number.isFinite(value)
    ? bottom - ((value - min) / (max - min)) * (bottom - top)
    : null
}

export function formatGroundForecastMeta(airportForecast) {
  const village = issueHour(airportForecast?.hourly_status?.base_time, 'base')
  const mid = issueHour(airportForecast?.tmFc, 'compact')
  return `동네예보 ${village ?? '-'} · 중기예보 ${mid ?? '-'}`
}
```

Keep `issueHour` private and return `HH시` with zero-padded hours.

- [ ] **Step 4: Run the unit file and verify GREEN**

Run the Step 2 command.

Expected: PASS with every slot, scale, metadata, and alternation assertion green.

- [ ] **Step 5: Commit the model**

```bash
git add frontend/src/features/monitoring/legacy/utils/groundForecastViewModel.js frontend/src/features/monitoring/legacy/utils/groundForecastViewModel.test.js
git commit -m "feat: add ground forecast display model"
```

---

### Task 2: Add deterministic signage fixtures, red browser contracts, and baseline capture

**Files:**
- Create: `frontend/verification/monitoring-ground-signage-fixture.mjs`
- Create: `frontend/verification/contracts/monitoring-ground-signage.spec.mjs`
- Create: `frontend/scripts/monitoring-ground-signage-capture.mjs`
- Modify: `scripts/projectamo-dev.mjs:122-174`
- Modify: `package.json:5-20`
- Modify: `frontend/package.json:10-25`

**Interfaces:**
- Consumes: `installMonitoringFixture(page)` from `monitoring-fixture.mjs`, then overrides only `/api/ground-forecast`, `/api/warning`, `/api/amos`, and `/api/environment` for the signage contract.
- Produces: `installGroundSignageFixture(page)`, one populated RKSI ground state, `ground-signage` Playwright tests, a bounded managed-server capture command, and deterministic Linux captures at 1920×1080.

- [ ] **Step 1: Build the signage-specific fixture without editing the shared dirty fixture**

Export a fixture installer that calls the shared installer and then registers later route handlers. Use 24 consecutive hourly values, today plus six future days, `hourly_status.base_time='1400'`, and `tmFc='202608100600'`. Deliberately set raw failure keys so the contract proves they are never visible:

```js
export const GROUND_SIGNAGE_NOW = new Date('2026-08-10T05:00:00Z')

export function buildGroundSignageForecast() {
  return {
    content_hash: 'ground-signage-001',
    airports: {
      RKSI: {
        hourly: buildHourlySlots(),
        hourly_status: { ok: true, base_date: '20260810', base_time: '1400' },
        tmFc: '202608100600',
        source_status: {
          short: { ok: false, announce_time: '202608101100' },
          mid_land: { ok: false, tmFc: '202608100600' },
          mid_ta: { ok: false, tmFc: '202608100600' },
        },
        forecast: buildSevenDays(),
      },
    },
  }
}
```

Provide one active RKSI warning with a known effective time, AMOS daily rainfall, and all PM/UV values so the visible design has no accidental placeholder except tests that explicitly override missing metadata.

- [ ] **Step 2: Write failing Full-HD contracts**

All new tests skip non-desktop projects, call `page.setViewportSize({ width: 1920, height: 1080 })`, install the page clock at `GROUND_SIGNAGE_NOW`, and enter `/monitoring?mode=ground`.

Add these tests:

1. `ground-signage keeps the fixed header and map while sizing the three left rows`
   - record the existing `.left-panel-header`, `.right-panel-top`, and `.map-panel-wrap` `[x, y, width, height]` from the pre-change Full-HD baseline, freeze those values in the contract before product edits, and assert the complete boxes; the known map values include `x=1055`, width `845`;
   - alert/current/forecast boxes have `y=74/216/528`, heights `130/300/507`, and `12px` gaps;
   - document and panels have no overflow.
2. `ground-signage enlarges alert/current values and shows six labelled metric icons`
   - computed sizes match 30/20, 64, 26, 104, and 36px targets within ±1px;
   - six metric icons are present and decorative while six Korean labels remain visible.
3. `ground-signage hourly rows share eight column centres`
   - eight time/icon/dot/temperature/precipitation/percentage elements exist;
   - each row’s measured centre equals its column centre within `1px`;
   - every label-to-dot y offset is the same constant;
   - precipitation tracks remain in the SVG lower band;
   - computed time/precipitation, temperature, and icon sizes are `20px/32px/64px` within ±1px.
4. `ground-signage alternates to a six-column weekly table`
   - initial title state is hourly `현재`, weekly `다음`;
   - active/inactive titles are `24px/22px`, metadata is `17px`, and the progress track is `4px` within ±1px;
   - metadata equals `동네예보 14시 · 중기예보 06시` and contains none of `/short|mid_land|mid_ta|tmFc|base_time|발표|단기예보/`;
   - progress is 0% at state start, about 50% at 6 seconds, and nearly 100% just before 12 seconds; inspect these by pausing its Web Animation and setting `currentTime` to `0/6000/11900`, not by advancing the mocked page clock;
   - after the first 12-second boundary, weekly is active, titles swap emphasis, progress restarts, and the map/alert/current boxes have not moved;
   - after the second 12-second boundary, hourly is active again with the same geometry, proving the title, content, and progress derive from the same cycle;
   - advance ten 12-second boundaries with the mocked clock and assert the expected state after every boundary, covering two logical minutes without real-time sleeping;
   - active/inactive layers expose `aria-hidden="false"/"true"`, the inactive layer has `inert`, and the hourly SVG has its approved accessible title/description;
   - on the first boundary, inspect the opacity transition's Web Animation timing as `350ms`, then finish only the forecast-layer opacity animations before geometry assertions;
   - the table has six equal-width day columns, shared four-row boundaries, 28px left/right/bottom inset, and 26px header gap;
   - computed weekly icon/weekday/date/precipitation/min-max sizes are `68px/24px/18px/20px/30px` within ±1px.
5. `ground-signage preserves empty and partial frames`
   - override the fixture with three hourly values, two future days, no active warning, and no `tmFc`;
   - alert/current/forecast retain the same fixed boxes, hourly/weekly retain eight/six positions, and missing values render `-`;
   - metadata is exactly `동네예보 14시 · 중기예보 -` in the same header position.
6. `ground-signage honours reduced motion without stopping rotation`
   - emulate `prefers-reduced-motion: reduce` before navigation;
   - fade duration is zero and the progress fill is a static full-width, low-opacity line;
   - advancing 12 seconds still changes hourly to weekly.

Use semantic region/table names plus stable hooks only where geometry has no semantic locator:

```js
const forecast = page.getByRole('region', { name: '지상 예보' })
const hourly = forecast.locator('[data-forecast-view="hourly"]')
const columns = hourly.locator('[data-hourly-column]')
await expect(columns).toHaveCount(8)

const mapBefore = await page.locator('.map-panel-wrap').boundingBox()
await page.clock.runFor(12_000)
await expect(forecast.locator('[data-forecast-title="weekly"]')).toHaveAttribute('aria-current', 'true')
expect(await page.locator('.map-panel-wrap').boundingBox()).toEqual(mapBefore)
```

Use Playwright's installed clock only for the React timeout. For progress samples, pause the progress Web Animation and set its `currentTime` explicitly; for fade settlement, call `finish()` only on each `.ground-forecast-layer` opacity animation so the new progress animation is not forced to 100%. Do not sleep in real time. Timer cleanup is verified by the injected-scheduler unit test in Task 4 rather than inferred from the absence of a browser error.

- [ ] **Step 3: Run the focused contract and verify RED**

Run:

```bash
npm --prefix frontend run dev:contract:fast -- contracts/monitoring-ground-signage.spec.mjs -g "ground-signage"
```

Expected: FAIL because the current page has four left children, no forecast viewport/progress/two-title state, text-only metrics, and the old hourly/weekly geometry.

- [ ] **Step 4: Add a bounded managed-server capture command**

Extend the existing launcher with one narrowly named command that runs the dedicated capture script inside `withServers(...)`, so startup, readiness, and process cleanup remain owned by `scripts/projectamo-dev.mjs`:

```js
if (command === 'ground-signage-capture') {
  await withServers(async () => {
    await runNpm(
      'ground signage capture',
      ['run', 'capture:monitoring-ground-signage', '--prefix', 'frontend'],
      { PROJECTAMO_URL: appUrl },
    )
  })
}
```

Add the matching root script:

```json
"dev:ground-signage-capture": "node scripts/projectamo-dev.mjs ground-signage-capture"
```

Add the frontend script that the launcher invokes from the correct package directory:

```json
"capture:monitoring-ground-signage": "node scripts/monitoring-ground-signage-capture.mjs"
```

Update the launcher's accepted-command list and usage string in the same edit. Do not change the behaviour of any existing launcher command.

- [ ] **Step 5: Capture the populated pre-change page**

Implement the capture script with `installGroundSignageFixture(page)`, a 1920×1080 Chromium context, and `PROJECTAMO_CAPTURE_PHASE=before|after`. On `before`, create one timestamped run root at `artifacts/responsive-screenshots/monitoring-ground-signage/<YYYY-MM-DD_HHmm>_monitoring-ground-signage/`, store its identifier in ignored `artifacts/responsive-screenshots/monitoring-ground-signage/active-run.json`, and write `before/monitoring-ground-before-linux.png` plus `before/layout.json`. Each layout file records complete bounding boxes for `.left-panel-header`, `.right-panel-top`, `.map-panel-wrap`, alert, current, and forecast regions. On `after`, read that same run identifier and write `after/monitoring-ground-hourly-linux.png`, advance only the automatic timeout by 12 seconds, finish the forecast-layer opacity animations, then write `after/monitoring-ground-weekly-linux.png` and `after/layout.json`. Resolve all relative paths against the repository root derived from `import.meta.url`, never the frontend npm process working directory. Write one root `manifest.json` containing route, viewport, generated time, git branch, distinct before/after commit IDs, Playwright/managed-launcher capture method, both phases, and the complete Task 5 unit/build/focused-contract/full-contract/capture command list.

Run before production edits:

```bash
PROJECTAMO_CAPTURE_PHASE=before npm run dev:ground-signage-capture
```

Expected: the managed launcher starts both servers, waits for readiness, writes the timestamped before image/layout plus root manifest in the ignored artifact directory, records the active run, and stops both servers. Copy the measured header/map box constants from `before/layout.json` into the red contract before any product edit.

- [ ] **Step 6: Commit only the task-owned verification files**

```bash
git add frontend/verification/monitoring-ground-signage-fixture.mjs frontend/verification/contracts/monitoring-ground-signage.spec.mjs frontend/scripts/monitoring-ground-signage-capture.mjs scripts/projectamo-dev.mjs package.json frontend/package.json
git commit -m "test: define ground signage browser contract"
```

Do not stage the existing dirty `monitoring.spec.mjs` or `monitoring-fixture.mjs`.

---

### Task 3: Enlarge the alert and build icon-led current observations

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx:1-8, 92-99, 144-190`
- Modify: `frontend/src/features/monitoring/legacy/App.css:194-319, 3758-3937`

**Interfaces:**
- Consumes: existing current weather, AMOS, environment, and today forecast values.
- Produces: `GroundMetric({ icon: Icon, label, children, valueClassName })`, six real `react-icons/wi` icons, and ground-scoped signage typography.

- [ ] **Step 1: Keep the current-observation contract red and implement a reusable metric cell**

Import exactly these installed icons:

```js
import { WiDaySunny, WiDust, WiHumidity, WiRaindrops, WiSmoke, WiStrongWind } from 'react-icons/wi'

function GroundMetric({ icon: Icon, label, valueClassName = '', children }) {
  return (
    <div className="ground-current-metric" data-ground-metric={label}>
      <Icon className="ground-current-metric-icon" aria-hidden="true" focusable="false" />
      <span className="ground-current-metric-label">{label}</span>
      <strong className={`ground-current-metric-value ${valueClassName}`.trim()}>{children}</strong>
    </div>
  )
}
```

Replace the six repeated articles with `GroundMetric` calls for 습도, 바람, 일강수량, 미세먼지(PM10), 초미세먼지(PM2.5), and 자외선. Preserve every existing value/fallback/grade class; icons are decorative and labels remain visible.

- [ ] **Step 2: Apply ground-scoped signage sizes**

Use selectors under `.dashboard-root[data-dashboard-mode="ground"]` so operations mode is untouched. Set the warning name/time to `30px/20px`, current card to exactly `300px`, current icon to a real `104px` box without transform scaling, current temperature to `64px`, status `24px`, feels-like `20px`, metric icon `36px`, metric label `17px`, and metric value `26px`.

Keep the existing 3×2 metric arrangement and semantic grade colours. Do not use colour for the metric identity; icon plus label does that.

- [ ] **Step 3: Run the observation-focused browser test**

Run:

```bash
npm --prefix frontend run dev:contract:fast -- contracts/monitoring-ground-signage.spec.mjs -g "enlarges alert/current values"
```

Expected: PASS. The overall layout and forecast tests remain red until Task 4.

- [ ] **Step 4: Commit the observation slice**

```bash
git add frontend/src/features/monitoring/legacy/components/GroundCurrentWeatherCard.jsx frontend/src/features/monitoring/legacy/App.css
git commit -m "feat: enlarge ground observations for signage"
```

---

### Task 4: Build the shared forecast viewport, aligned hourly SVG, and weekly table

**Files:**
- Create: `frontend/src/features/monitoring/legacy/components/GroundForecastViewport.jsx`
- Create: `frontend/src/features/monitoring/legacy/utils/groundForecastTimer.js`
- Create: `frontend/src/features/monitoring/legacy/utils/groundForecastTimer.test.js`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundHourlyStrip.jsx:1-170`
- Modify: `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx:1-145`
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx:20-45, 656-667, 795-802`
- Modify: `frontend/src/features/monitoring/legacy/App.css:73-81, 3429-3756, 3939-4015`

**Interfaces:**
- Consumes: all Task 1 view-model exports and existing weather icon registry.
- Produces: `GroundForecastViewport({ groundForecastData, icao })`, `scheduleGroundForecastAdvance(callback, timerApi)`, content-only hourly/weekly renderers, three-row ground stack, and all accessibility/geometry hooks used by Task 2.

- [ ] **Step 1: Write a failing timer cleanup unit test**

Inject the timer API so cleanup can be proved without relying on React silently ignoring an update after unmount:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { scheduleGroundForecastAdvance } from './groundForecastTimer.js'

test('forecast advance cleanup clears the scheduled 12-second handle', () => {
  const calls = []
  const timerApi = {
    setTimeout(callback, delay) {
      calls.push(['set', callback, delay])
      return 41
    },
    clearTimeout(handle) {
      calls.push(['clear', handle])
    },
  }

  const cleanup = scheduleGroundForecastAdvance(() => {}, timerApi)
  assert.equal(calls[0][2], 12_000)
  cleanup()
  assert.deepEqual(calls.at(-1), ['clear', 41])
})
```

Run:

```bash
npm --prefix frontend test -- src/features/monitoring/legacy/utils/groundForecastTimer.test.js
```

Expected: FAIL because `groundForecastTimer.js` does not exist.

- [ ] **Step 2: Implement the timer helper and make the viewport own the only forecast timer and header**

Implement the minimum helper using the cycle constant from Task 1. Its return value always clears the exact handle returned by the injected `setTimeout`:

```js
export function scheduleGroundForecastAdvance(callback, timerApi = globalThis) {
  const handle = timerApi.setTimeout(callback, GROUND_FORECAST_CYCLE_MS)
  return () => timerApi.clearTimeout(handle)
}
```

Implement one recursive timeout and one CSS progress animation keyed by the active view:

```jsx
export default function GroundForecastViewport({ groundForecastData, icao }) {
  const [activeView, setActiveView] = useState(GROUND_FORECAST_VIEW.HOURLY)
  const airport = groundForecastData?.airports?.[icao] || null

  useEffect(() => {
    return scheduleGroundForecastAdvance(
      () => setActiveView((view) => nextGroundForecastView(view)),
      window,
    )
  }, [activeView])

  return (
    <section
      className="ground-forecast-viewport panel"
      role="region"
      aria-label="지상 예보"
      style={{
        '--ground-forecast-cycle-ms': `${GROUND_FORECAST_CYCLE_MS}ms`,
        '--ground-forecast-fade-ms': `${GROUND_FORECAST_FADE_MS}ms`,
      }}
    >
      {/* fixed title pair, metadata, progress, and two absolute layers */}
    </section>
  )
}
```

Render title labels in the fixed order. Give the active title `aria-current="true"`, visible `현재`, 24px strong text; give the inactive title visible `다음`, 22px muted text. They are spans, not tabs/buttons. Render `formatGroundForecastMeta(airport)` on the right.

The active layer has `aria-hidden="false"`; the inactive layer has `aria-hidden="true"` and `inert`. Both occupy the same absolute content box and differ only by opacity. Progress uses the same exported 12-second constant, reaches 100%, and restarts when the active-view key changes. Reduced-motion removes fade/progress animation but does not stop the timeout.

- [ ] **Step 3: Run the timer cleanup unit test and verify GREEN**

Run the Step 1 command. Expected: PASS, proving the active 12-second handle is cleared by the cleanup function returned from the viewport effect.

- [ ] **Step 4: Rebuild hourly as one eight-column SVG**

Use one SVG viewBox and one `xFor(index)` call per slot. Compute `tempY` exactly once per slot and reuse it:

```jsx
const x = forecastColumnCenter(index, { start: PLOT_LEFT, end: PLOT_RIGHT, count: 8 })
const tempY = temperatureScale(slot?.temp)
const rain = precipitationBar(slot?.rainProb, { top: PRECIP_TOP, bottom: PRECIP_BOTTOM })

<g data-hourly-column={index} data-center-x={x}>
  <text data-hourly-row="time" x={x} textAnchor="middle">{timeLabel}</text>
  <image data-hourly-row="icon" x={x - 32} width="64" height="64" href={iconSrc} />
  {tempY != null && <>
    <circle data-hourly-row="temp-dot" cx={x} cy={tempY} r="6" />
    <text data-hourly-row="temp-label" x={x} y={tempY - TEMP_LABEL_OFFSET} textAnchor="middle">{temp}°</text>
  </>}
  <rect data-hourly-row="precip-track" x={x - BAR_WIDTH / 2} y={PRECIP_TOP} width={BAR_WIDTH} height={PRECIP_BOTTOM - PRECIP_TOP} />
  <rect data-hourly-row="precip-bar" x={x - BAR_WIDTH / 2} y={rain.y} width={BAR_WIDTH} height={rain.height} />
  <text data-hourly-row="precip-label" x={x} y={PRECIP_LABEL_Y} textAnchor="middle">{rain.value}%</text>
</g>
```

Draw the temperature polyline only through finite points. Keep temperature content above and precipitation tracks below with no overlap. Use `20px` time/precipitation text, `32px` temperature text, `64px` images, and one accessible SVG title/description. Null slots keep their column and display `-` without fake weather art.

- [ ] **Step 5: Rebuild weekly as one semantic six-day table**

Select exactly six non-today days from Task 1. Render one `<table aria-label="주간 예보">` with a row-label gutter and six day columns, not six articles/cards:

```jsx
<table className="ground-weekly-table" aria-label="주간 예보">
  <thead>
    <tr><th scope="col">날짜</th>{days.map(renderDayHeading)}</tr>
  </thead>
  <tbody>
    <tr><th scope="row">오전</th>{days.map((day) => renderPeriodCell(day?.am))}</tr>
    <tr><th scope="row">오후</th>{days.map((day) => renderPeriodCell(day?.pm))}</tr>
    <tr><th scope="row">최저 / 최고</th>{days.map(renderTemperatureCell)}</tr>
  </tbody>
</table>
```

Use a single connected border grid, no per-day outer card/radius/shadow. Apply `28px` left/right/bottom inset, `26px` space below the shared viewport header, common row heights `64px 123px 122px 88px`, `68px` weather icons, `24px` weekday, `18px` date, `20px` precipitation, and `30px` min/max values. Null days/periods show `-` in their preserved cell.

- [ ] **Step 6: Integrate the viewport and exact ground stack**

In `MonitoringPage.jsx`, import `GroundForecastViewport`, replace the two separate ground forecast renders with one viewport, and leave ops-mode `TafTimeline` unchanged. Preserve the existing airport-selection import, filtering, `selectAirport`, and handlers exactly.

The ground body becomes exactly three children: `WarningList`, `GroundCurrentWeatherCard`, `GroundForecastViewport`.

```css
.dashboard-root[data-dashboard-mode="ground"] .left-panel-body {
  display: grid;
  grid-template-rows: 130px 300px 507px;
  gap: 12px;
  align-content: start;
}

.ground-forecast-viewport {
  position: relative;
  height: 507px;
  padding: 0;
  overflow: hidden;
}

.ground-forecast-layer {
  position: absolute;
  inset: 54px 0 0;
  opacity: 0;
  transition: opacity var(--ground-forecast-fade-ms) cubic-bezier(.2, 0, 0, 1);
}

.ground-forecast-layer.is-active { opacity: 1; }
```

Do not alter `.dashboard-root` columns, `.left-panel-header`, `.right-panel-top`, `.map-panel-wrap`, `MonitoringMap`, or `MonitoringPage.css`.

- [ ] **Step 7: Run unit and focused browser tests**

Run:

```bash
npm --prefix frontend test -- src/features/monitoring/legacy/utils/groundForecastViewModel.test.js
npm --prefix frontend test -- src/features/monitoring/legacy/utils/groundForecastTimer.test.js
npm --prefix frontend run dev:contract:fast -- contracts/monitoring-ground-signage.spec.mjs -g "ground-signage"
```

Expected: all three commands PASS. If a visual/geometry assertion fails, invoke systematic debugging and fix the shared scale/layout source rather than applying per-column offsets.

- [ ] **Step 8: Commit only task-owned changes**

Stage the new viewport, timer helper/test, and the three legacy component/CSS files normally. For `MonitoringPage.jsx`, inspect the diff and stage only the forecast import/composition hunks; leave all pre-existing airport-selection hunks unstaged. If safe hunk separation is not possible, stop and ask the user rather than committing their work.

Commit message:

```bash
git commit -m "feat: redesign ground monitoring signage"
```

---

### Task 5: Verify the real browser contract and capture hourly/weekly evidence

**Files:**
- Modify only for a diagnosed failure: files owned by Tasks 1–4
- Modify after a full pass: `docs/policies/verification/contracts.md`
- Generate ignored evidence under the Task 2 timestamped run root: `before/*`, `after/*`, `manifest.json`, and `review/issues.md`

**Interfaces:**
- Consumes: finished ground signage, managed Playwright servers, signage fixture, and capture script.
- Produces: a passing `ground-signage`/`monitoring` browser contract, production build evidence, two inspected Full-HD states, and current graph data.

- [ ] **Step 1: Run all unit tests and the production build**

Run:

```bash
npm --prefix frontend test
npm --prefix frontend run build
```

Expected: both exit 0. Report any unrelated pre-existing failure separately; do not weaken tests.

- [ ] **Step 2: Run the focused signage contract with clean managed servers**

Run:

```bash
npm run dev:contract -- --grep ground-signage
```

Expected: PASS for the desktop Full-HD test; non-desktop projects are explicitly skipped because this is a fixed-signage contract.

- [ ] **Step 3: Run the full registered monitoring contract**

Run:

```bash
npm run dev:contract -- contracts/monitoring.spec.mjs contracts/monitoring-ground-signage.spec.mjs
```

Expected: PASS for every applicable project in both monitoring contract files, proving the new Full-HD signage state plus ops mode, iPad behaviour, settings, and existing alert flows did not regress.

- [ ] **Step 4: Capture both automatic forecast states at 1920×1080**

Run the dedicated capture through the bounded managed-server command:

```bash
PROJECTAMO_CAPTURE_PHASE=after npm run dev:ground-signage-capture
```

Expected files:

- `<timestamp>_monitoring-ground-signage/after/monitoring-ground-hourly-linux.png`
- `<timestamp>_monitoring-ground-signage/after/monitoring-ground-weekly-linux.png`
- `<timestamp>_monitoring-ground-signage/after/layout.json`
- `<timestamp>_monitoring-ground-signage/manifest.json`

The script must reach weekly through the automatic 12-second clock advance; it must not expose or click a manual forecast control. It finishes only the opacity animations before the weekly screenshot. Compare `before/layout.json` with `after/layout.json` and fail the capture if the complete header or map bounding box differs.

- [ ] **Step 5: Inspect both screenshots and measure the rendered page**

Open the before image and both after images with the image viewer. Compare the baseline against each final state, then compare hourly against weekly. Confirm:

- complete header and map bounds match the baseline and their pixels show no unintended visual change;
- alert and current observation do not move;
- all hourly centres match and temperature/precipitation bands do not overlap;
- weekly table has visible 28px side/bottom inset and common row lines;
- current/next emphasis and progress reset are correct;
- text and icons are not cropped, overlapped, or too small at signage distance;
- no raw source keys, date/minute, `발표`, or `단기예보` appear.

Always create `<timestamp>_monitoring-ground-signage/review/issues.md`. Record `No issues found` plus the inspected files and commands when clean; otherwise record each finding, return to the owning task, and repeat the contract/capture.

- [ ] **Step 6: Run the required read-only QA/design review checkpoint**

Dispatch a `reviewer` subagent with the approved spec, browser/design policies, passing command output, the before/hourly/weekly image paths, both `layout.json` files, and `manifest.json`. The reviewer must inspect the images, not only the source, and lead with any cropping, legibility, alignment, policy, or baseline-regression findings. It makes no edits. Append its verdict and findings to `review/issues.md`; resolve every blocking finding and rerun Tasks 5.2–5.6 before continuing.

- [ ] **Step 7: Update the contract registry and graph**

After the full contract and read-only review pass, add a dedicated Active `ground-signage` registry row with its own contract file, fixture, Full-HD viewport, owner, evidence path, and pass date. Leave the existing `monitoring` row unchanged. Then run:

```bash
graphify update .
```

Expected: graph update completes and no product source outside the approved files changes.

- [ ] **Step 8: Commit verification documentation only**

```bash
git add docs/policies/verification/contracts.md
git commit -m "docs: register ground signage verification"
```

Screenshot artifacts remain ignored and are reported to the user by absolute path; do not force-add them.

## Plan Self-Review

| Approved requirement | Implementation task |
| --- | --- |
| Fixed 1920×1080 canvas; header/map unchanged | Tasks 2, 4, 5 |
| Left rows 130/300/507 with 12px gaps | Tasks 2, 4 |
| Larger alert/current/metric typography | Tasks 2, 3 |
| Six observation icons with visible labels | Tasks 2, 3 |
| One eight-column hourly grid | Tasks 1, 2, 4 |
| Shared x scale for time/icon/temp/precip | Tasks 1, 2, 4 |
| Same temperature scale for dots and labels | Tasks 1, 2, 4 |
| Precipitation bars inside the temperature SVG | Tasks 1, 2, 4 |
| One six-day table with common rows and margins | Tasks 1, 2, 4 |
| Automatic 12s/350ms forecast-only fade | Tasks 1, 2, 4 |
| Timer cleanup and two-minute cycle synchronization | Tasks 2, 4 |
| Fixed current/next titles and 4px progress | Tasks 1, 2, 4 |
| Only village/mid-range issue-hour metadata | Tasks 1, 2, 4 |
| Stable empty/partial states and accessibility | Tasks 1, 2, 4 |
| Timestamped before/hourly/weekly Full-HD evidence and read-only visual review | Tasks 2, 5 |
| No operations/backend/API changes | Global constraints; Tasks 4–5 |
| Preserve current airport-selection work | Global constraints; Tasks 2 and 4 commit gates |

No placeholder markers, unmatched interfaces, new dependencies, backend changes, manual forecast controls, or unapproved responsive redesigns remain in this plan.
