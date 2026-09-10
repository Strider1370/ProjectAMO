# AMOS Airport Panel Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AMOS airport-panel tab with the console-style layout from `artifacts/amos-layout-prototype.html`, using real AMOS API values and preserving readable sizing inside the airport drawer.

**Architecture:** Keep the AMOS tab as a pure React rendering layer and move all API-field interpretation, wind conversion, active-runway selection, wind-component math, RVR/MOR formatting, and CSS custom-property preparation into `frontend/src/features/airport-panel/lib/amosViewModel.js`. The UI will render one board with two wind summary columns, one active-runway dial, two RVR/MOR cells, and five common weather cells, matching the prototype dimensions while scaling down safely in the existing airport panel. Backend parser renaming is deliberately not part of this implementation; the frontend will adapt the current normalized payload shape.

**Tech Stack:** React, Vite, plain CSS in `AirportPanel.css`, Node test runner (`node --test`), existing airport-panel view-model helpers.

---

## Reference And Constraints

- Prototype to copy visually: `artifacts/amos-layout-prototype.html`.
- Current AMOS tab: `frontend/src/features/airport-panel/tabs/AmosTab.jsx`.
- Current AMOS model helpers: `frontend/src/features/airport-panel/lib/amosViewModel.js`.
- Current AMOS styles: `frontend/src/features/airport-panel/AirportPanel.css`.
- UI operating standard: `docs/ui-responsive-guidelines.md`.
- Source files contain Korean text. Edit with `apply_patch` or UTF-8-safe Node writes only. Do not use PowerShell `Set-Content`, `Out-File`, or redirection to rewrite source files.

## API Data Facts To Preserve

The actual AMOS API wind fields are time-window groups, not runway-direction groups:

| Current normalized path | Actual AMOS field meaning | Display use |
| --- | --- | --- |
| `amos.runways[0].wind_speed` | `WS02`, 2-minute average wind speed, m/s | Left wind column, 평균풍속 |
| `amos.runways[0].wind_direction` | `WD02`, 2-minute average wind direction, degrees | Left wind column, 평균풍향 |
| `amos.runways[0].wind_speed_min` | `WS02_MIN`, 2-minute minimum wind speed, m/s | Left wind column, 최소풍속 |
| `amos.runways[0].wind_direction_min` | `WD02_MIN`, 2-minute left/min direction, degrees | Left wind column, 최소풍향 |
| `amos.runways[0].wind_speed_max` | `WS02_MAX`, 2-minute maximum wind speed, m/s | Left wind column, 최대풍속 |
| `amos.runways[0].wind_direction_max` | `WD02_MAX`, 2-minute right/max direction, degrees | Left wind column, 최대풍향 |
| `amos.runways[1].wind_speed` | `WS10`, 10-minute average wind speed, m/s | Right wind column, 평균풍속 |
| `amos.runways[1].wind_direction` | `WD10`, 10-minute average wind direction, degrees | Right wind column, 평균풍향 |
| `amos.runways[1].wind_speed_min` | `WS10_MIN`, 10-minute minimum wind speed, m/s | Right wind column, 최소풍속 |
| `amos.runways[1].wind_direction_min` | `WD10_MIN`, 10-minute left/min direction, degrees | Right wind column, 최소풍향 |
| `amos.runways[1].wind_speed_max` | `WS10_MAX`, 10-minute maximum wind speed, m/s | Right wind column, 최대풍속 |
| `amos.runways[1].wind_direction_max` | `WD10_MAX`, 10-minute right/max direction, degrees | Right wind column, 최대풍향 |
| `amos.runways[0].visibility_m` | `L_VIS` | First runway MOR value |
| `amos.runways[0].rvr_m` | `L_RVR` | First runway RVR value |
| `amos.runways[1].visibility_m` | `R_VIS` | Second runway MOR value |
| `amos.runways[1].rvr_m` | `R_RVR` | Second runway RVR value |
| `amos.weather.cloud_min_m` | cloud ceiling source currently exposed by parser | 운고(ft) value |
| `amos.pressure.qnh_hpa` | QNH hPa | QNH(hPa) and QNH(inHg) values |
| `amos.weather.temperature_c` | temperature Celsius | 기온(°C) value |
| `amos.weather.dewpoint_c` | dewpoint Celsius | 이슬점(°C) value |

## Target Layout

Copy the prototype structure into the real AMOS tab:

- Board max visual width: `780px`, but in the app use `width: min(780px, 100%)` and no page-level horizontal scroll.
- Header: two equal runway-number cells. Active runway cell shows `{runway} IN USE` and red background.
- Wind row: `220px 340px 220px` at full width, scaling with CSS variables in narrower panels.
- Left wind table: 2-minute wind group.
- Center dial: one active-runway wind visualization.
- Right wind table: 10-minute wind group.
- RVR/MOR row: two equal cells, label row `24px`, value row `110px`, no wrapping for `P2000/10000`.
- Common row: five equal cells, label row `26px`, value row `110px`; do not include the prototype's removed Cloud common cell.

## View-Model Contract

Add `buildAmosConsoleModel(amos, metar, airportMeta)` returning this shape:

```js
{
  observedTimeLabel: '2026-05-18 12:30 KST',
  runwayLabels: ['01', '19'],
  activeRunwayLabel: '19',
  inactiveRunwayLabel: '01',
  activeRunwayIndex: 1,
  activeHeadingDeg: 190,
  dial: {
    runwayRotationDeg: 100,
    windFromDeg: 330,
    arcStartDeg: 320,
    arcEndDeg: 340,
    headTailLabel: 'H',
    headTailValue: '03',
    crossLabel: 'L',
    crossValue: '00',
  },
  windGroups: [
    {
      key: 'twoMinute',
      label: '2분',
      rows: [
        { speedLabel: '평균풍속(kt)', speedValue: '3.1', directionLabel: '평균풍향(°)', directionValue: '340' },
        { speedLabel: '최소풍속(kt)', speedValue: '2.9', directionLabel: '최소풍향(°)', directionValue: '330' },
        { speedLabel: '최대풍속(kt)', speedValue: '3.5', directionLabel: '최대풍향(°)', directionValue: '350' },
      ],
    },
    {
      key: 'tenMinute',
      label: '10분',
      rows: [
        { speedLabel: '평균풍속(kt)', speedValue: '3.3', directionLabel: '평균풍향(°)', directionValue: '330' },
        { speedLabel: '최소풍속(kt)', speedValue: '2.3', directionLabel: '최소풍향(°)', directionValue: '320' },
        { speedLabel: '최대풍속(kt)', speedValue: '4.1', directionLabel: '최대풍향(°)', directionValue: '340' },
      ],
    },
  ],
  visibilityRows: [
    { label: 'RWY 01 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
    { label: 'RWY 19 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
  ],
  commonCells: [
    { label: '운고(ft)', value: 'NCD' },
    { label: 'QNH(hPa)', value: '1017' },
    { label: 'QNH(inHg)', value: '30.03' },
    { label: '기온(°C)', value: '18.2' },
    { label: '이슬점(°C)', value: '12.8' },
  ],
}
```

Important calculation rules:

```js
const KT_PER_MS = 1.943844
const HPA_TO_INHG = 0.0295299830714

function normalizeDegrees(value) {
  return Number.isFinite(value) ? ((value % 360) + 360) % 360 : null
}

function runwayHeadingFromLabel(label) {
  const match = String(label || '').match(/^(\d{2})/)
  if (!match) return null
  const value = Number(match[1])
  if (!Number.isFinite(value)) return null
  return (value % 36) * 10 || 360
}

function runwayRotationForCss(headingDeg) {
  return Number.isFinite(headingDeg) ? headingDeg - 90 : 0
}

function calculateRunwayWindComponent({ windDirectionDeg, windSpeedKt, runwayHeadingDeg }) {
  if (!Number.isFinite(windDirectionDeg) || !Number.isFinite(windSpeedKt) || !Number.isFinite(runwayHeadingDeg)) {
    return { headTailLabel: '-', headTailKt: null, crossLabel: '-', crossKt: null }
  }

  const angleRad = ((windDirectionDeg - runwayHeadingDeg) * Math.PI) / 180
  const headwind = Math.cos(angleRad) * windSpeedKt
  const crosswind = Math.sin(angleRad) * windSpeedKt

  return {
    headTailLabel: headwind >= 0 ? 'H' : 'T',
    headTailKt: Math.abs(headwind),
    crossLabel: crosswind >= 0 ? 'R' : 'L',
    crossKt: Math.abs(crosswind),
  }
}
```

The crosswind sign must be pinned by tests. If product review later decides the sign convention should be inverted for tower-controller wording, change only the label mapping, not the math.

## Task 1: Add AMOS Console View-Model Tests

**Files:**
- Create: `frontend/src/features/airport-panel/lib/amosViewModel.test.js`
- Modify: `frontend/src/features/airport-panel/lib/amosViewModel.js`

- [ ] **Step 1: Create failing tests for the new model contract**

Create `frontend/src/features/airport-panel/lib/amosViewModel.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAmosConsoleModel,
  calculateRunwayWindComponent,
  formatInHgFromHpa,
  runwayHeadingFromLabel,
} from './amosViewModel.js'

const baseAmos = {
  observation: { observed_tm_kst: '202605181230' },
  runways: [
    {
      wind_speed: 1.6,
      wind_direction: 340,
      wind_speed_min: 1.5,
      wind_direction_min: 330,
      wind_speed_max: 1.8,
      wind_direction_max: 350,
      visibility_m: 10000,
      rvr_m: 2000,
    },
    {
      wind_speed: 1.7,
      wind_direction: 330,
      wind_speed_min: 1.2,
      wind_direction_min: 320,
      wind_speed_max: 2.1,
      wind_direction_max: 340,
      visibility_m: 10000,
      rvr_m: 2000,
    },
  ],
  weather: {
    cloud_min_m: null,
    temperature_c: 18.2,
    dewpoint_c: 12.8,
  },
  pressure: {
    qnh_hpa: 1017,
  },
}

describe('amosViewModel console model', () => {
  it('maps current normalized wind slots as 2-minute and 10-minute AMOS wind groups', () => {
    const model = buildAmosConsoleModel(baseAmos, null, { icao: 'RKJB' })

    assert.equal(model.windGroups[0].key, 'twoMinute')
    assert.equal(model.windGroups[0].rows[0].speedValue, '3.1')
    assert.equal(model.windGroups[0].rows[0].directionValue, '340')
    assert.equal(model.windGroups[0].rows[1].speedValue, '2.9')
    assert.equal(model.windGroups[0].rows[1].directionValue, '330')
    assert.equal(model.windGroups[0].rows[2].speedValue, '3.5')
    assert.equal(model.windGroups[0].rows[2].directionValue, '350')

    assert.equal(model.windGroups[1].key, 'tenMinute')
    assert.equal(model.windGroups[1].rows[0].speedValue, '3.3')
    assert.equal(model.windGroups[1].rows[0].directionValue, '330')
    assert.equal(model.windGroups[1].rows[1].speedValue, '2.3')
    assert.equal(model.windGroups[1].rows[1].directionValue, '320')
    assert.equal(model.windGroups[1].rows[2].speedValue, '4.1')
    assert.equal(model.windGroups[1].rows[2].directionValue, '340')
  })

  it('builds active runway, dial rotation, RVR/MOR, and common weather cells', () => {
    const model = buildAmosConsoleModel(baseAmos, null, { icao: 'RKJB' })

    assert.deepEqual(model.runwayLabels, ['01', '19'])
    assert.equal(model.activeRunwayLabel, '19')
    assert.equal(model.activeHeadingDeg, 190)
    assert.equal(model.dial.runwayRotationDeg, 100)
    assert.equal(model.dial.windFromDeg, 330)
    assert.equal(model.dial.arcStartDeg, 320)
    assert.equal(model.dial.arcEndDeg, 340)
    assert.equal(model.dial.headTailLabel, 'H')
    assert.equal(model.dial.crossLabel, 'L')

    assert.deepEqual(model.visibilityRows, [
      { label: 'RWY 01 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
      { label: 'RWY 19 RVR(m) / MOR(m)', rvrValue: 'P2000', morValue: '10000', isRvrGood: true },
    ])

    assert.deepEqual(model.commonCells, [
      { label: '운고(ft)', value: 'NCD' },
      { label: 'QNH(hPa)', value: '1017' },
      { label: 'QNH(inHg)', value: '30.03' },
      { label: '기온(°C)', value: '18.2' },
      { label: '이슬점(°C)', value: '12.8' },
    ])
  })

  it('formats QNH inHg from hPa', () => {
    assert.equal(formatInHgFromHpa(1017), '30.03')
    assert.equal(formatInHgFromHpa(null), '-')
  })

  it('derives runway heading from runway label', () => {
    assert.equal(runwayHeadingFromLabel('01'), 10)
    assert.equal(runwayHeadingFromLabel('19'), 190)
    assert.equal(runwayHeadingFromLabel('36'), 360)
    assert.equal(runwayHeadingFromLabel('15L'), 150)
    assert.equal(runwayHeadingFromLabel('RWY'), null)
  })

  it('calculates head-tail and crosswind components from active runway heading', () => {
    const component = calculateRunwayWindComponent({
      windDirectionDeg: 330,
      windSpeedKt: 3.3,
      runwayHeadingDeg: 190,
    })

    assert.equal(component.headTailLabel, 'H')
    assert.equal(Math.round(component.headTailKt), 3)
    assert.equal(component.crossLabel, 'L')
    assert.equal(Math.round(component.crossKt), 2)
  })
})
```

- [ ] **Step 2: Run tests and verify they fail because exports do not exist**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

Expected result:

```text
not ok
SyntaxError: The requested module './amosViewModel.js' does not provide an export named 'buildAmosConsoleModel'
```

## Task 2: Implement AMOS Console View-Model

**Files:**
- Modify: `frontend/src/features/airport-panel/lib/amosViewModel.js`
- Test: `frontend/src/features/airport-panel/lib/amosViewModel.test.js`

- [ ] **Step 1: Export runway heading and add numeric helpers**

In `frontend/src/features/airport-panel/lib/amosViewModel.js`, change the existing private `runwayHeadingFromLabel` to an exported function and add constants/helpers near the top:

```js
const KT_PER_MS = 1.943844
const HPA_TO_INHG = 0.0295299830714

function isFiniteNumber(value) {
  return Number.isFinite(value)
}

function normalizeDegrees(value) {
  if (!isFiniteNumber(value)) return null
  return ((value % 360) + 360) % 360
}

function formatOneDecimal(value) {
  return isFiniteNumber(value) ? value.toFixed(1) : '-'
}

function formatInteger(value) {
  return isFiniteNumber(value) ? String(Math.round(value)) : '-'
}
```

Replace `formatMsToKt` with:

```js
export function formatMsToKt(value) {
  return isFiniteNumber(value) ? formatOneDecimal(value * KT_PER_MS) : '-'
}
```

Replace:

```js
function runwayHeadingFromLabel(label) {
```

with:

```js
export function runwayHeadingFromLabel(label) {
```

- [ ] **Step 2: Add QNH, RVR, wind-row, and component helpers**

Append these helpers below `pickActiveRunwayLabel`:

```js
export function formatInHgFromHpa(value) {
  return isFiniteNumber(value) ? (value * HPA_TO_INHG).toFixed(2) : '-'
}

function formatRvrValue(value) {
  if (!isFiniteNumber(value)) return '-'
  return value >= 2000 ? 'P2000' : String(Math.round(value))
}

function formatMorValue(value) {
  return isFiniteNumber(value) ? String(Math.round(value)) : '-'
}

function isRvrGood(value) {
  return isFiniteNumber(value) && value >= 2000
}

function buildWindRows(source) {
  return [
    {
      speedLabel: '평균풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed),
      directionLabel: '평균풍향(°)',
      directionValue: formatInteger(source?.wind_direction),
    },
    {
      speedLabel: '최소풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed_min),
      directionLabel: '최소풍향(°)',
      directionValue: formatInteger(source?.wind_direction_min),
    },
    {
      speedLabel: '최대풍속(kt)',
      speedValue: formatMsToKt(source?.wind_speed_max),
      directionLabel: '최대풍향(°)',
      directionValue: formatInteger(source?.wind_direction_max),
    },
  ]
}

function formatComponentValue(value) {
  return isFiniteNumber(value) ? String(Math.round(value)).padStart(2, '0') : '--'
}

export function calculateRunwayWindComponent({ windDirectionDeg, windSpeedKt, runwayHeadingDeg }) {
  if (!isFiniteNumber(windDirectionDeg) || !isFiniteNumber(windSpeedKt) || !isFiniteNumber(runwayHeadingDeg)) {
    return { headTailLabel: '-', headTailKt: null, crossLabel: '-', crossKt: null }
  }

  const angleRad = ((windDirectionDeg - runwayHeadingDeg) * Math.PI) / 180
  const headwind = Math.cos(angleRad) * windSpeedKt
  const crosswind = Math.sin(angleRad) * windSpeedKt

  return {
    headTailLabel: headwind >= 0 ? 'H' : 'T',
    headTailKt: Math.abs(headwind),
    crossLabel: crosswind >= 0 ? 'R' : 'L',
    crossKt: Math.abs(crosswind),
  }
}
```

- [ ] **Step 3: Add `buildAmosConsoleModel`**

Append:

```js
export function buildAmosConsoleModel(amos, metar, airportMeta) {
  const runways = enrichAmosRunways(amos)
  const runwayLabels = runwayLabelsFromAirport(airportMeta)
  const twoMinute = runways[0] || {}
  const tenMinute = runways[1] || {}
  const componentWindSource = tenMinute
  const windDirection = normalizeDegrees(componentWindSource.wind_direction)
  const windSpeedKt = isFiniteNumber(componentWindSource.wind_speed)
    ? componentWindSource.wind_speed * KT_PER_MS
    : null
  const activeRunwayLabel = pickActiveRunwayLabel(runwayLabels, {
    direction: windDirection ?? metar?.observation?.wind?.direction,
    speed: windSpeedKt ?? metar?.observation?.wind?.speed ?? 0,
  })
  const activeRunwayIndex = runwayLabels[1] === activeRunwayLabel ? 1 : 0
  const activeHeadingDeg = runwayHeadingFromLabel(activeRunwayLabel)
  const component = calculateRunwayWindComponent({
    windDirectionDeg: windDirection,
    windSpeedKt,
    runwayHeadingDeg: activeHeadingDeg,
  })
  const arcStartDeg = normalizeDegrees(componentWindSource.wind_direction_min)
  const arcEndDeg = normalizeDegrees(componentWindSource.wind_direction_max)
  const rf = amos?.daily_rainfall
  const obs = amos?.observation || {}
  const observedTime = rf?.observed_tm_kst || obs.observed_tm_kst

  return {
    observedTimeLabel: formatAmosTime(observedTime),
    runwayLabels,
    activeRunwayLabel,
    inactiveRunwayLabel: runwayLabels[activeRunwayIndex === 1 ? 0 : 1] || null,
    activeRunwayIndex,
    activeHeadingDeg,
    dial: {
      runwayRotationDeg: isFiniteNumber(activeHeadingDeg) ? activeHeadingDeg - 90 : 0,
      windFromDeg: windDirection,
      arcStartDeg,
      arcEndDeg,
      headTailLabel: component.headTailLabel,
      headTailValue: formatComponentValue(component.headTailKt),
      crossLabel: component.crossLabel,
      crossValue: formatComponentValue(component.crossKt),
    },
    windGroups: [
      { key: 'twoMinute', label: '2분', rows: buildWindRows(twoMinute) },
      { key: 'tenMinute', label: '10분', rows: buildWindRows(tenMinute) },
    ],
    visibilityRows: runwayLabels.map((label, index) => {
      const runway = runways[index] || {}
      return {
        label: `RWY ${label} RVR(m) / MOR(m)`,
        rvrValue: formatRvrValue(runway.rvr_m),
        morValue: formatMorValue(runway.visibility_m),
        isRvrGood: isRvrGood(runway.rvr_m),
      }
    }),
    commonCells: [
      { label: '운고(ft)', value: amos?.weather?.cloud_min_m == null ? 'NCD' : formatInteger(amos.weather.cloud_min_m) },
      { label: 'QNH(hPa)', value: formatInteger(amos?.pressure?.qnh_hpa) },
      { label: 'QNH(inHg)', value: formatInHgFromHpa(amos?.pressure?.qnh_hpa) },
      { label: '기온(°C)', value: formatOneDecimal(amos?.weather?.temperature_c) },
      { label: '이슬점(°C)', value: formatOneDecimal(amos?.weather?.dewpoint_c) },
    ],
  }
}
```

- [ ] **Step 4: Run view-model tests**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

Expected result:

```text
ok
```

- [ ] **Step 5: Commit view-model work**

Run:

```powershell
git add frontend/src/features/airport-panel/lib/amosViewModel.js frontend/src/features/airport-panel/lib/amosViewModel.test.js
git commit -m "feat: add amos console view model"
```

## Task 3: Replace AMOS Tab Markup With Console Layout

**Files:**
- Modify: `frontend/src/features/airport-panel/tabs/AmosTab.jsx`
- Test: `frontend/src/features/airport-panel/lib/amosViewModel.test.js`

- [ ] **Step 1: Replace old AMOS board components**

Replace the contents of `frontend/src/features/airport-panel/tabs/AmosTab.jsx` with:

```jsx
import { buildAmosConsoleModel } from '../lib/amosViewModel.js'

const BEARINGS = [
  ['36', 0],
  ['3', 30],
  ['6', 60],
  ['9', 90],
  ['12', 120],
  ['15', 150],
  ['18', 180],
  ['21', 210],
  ['24', 240],
  ['27', 270],
  ['30', 300],
  ['33', 330],
]

function WindMetricColumn({ group, side }) {
  return (
    <aside className={`ap-amos-console-wind-metrics ap-amos-console-wind-metrics--${side}`}>
      {group.rows.map((row) => (
        <div className="ap-amos-console-metric-band" key={`${group.key}-${row.speedLabel}`}>
          <div className="ap-amos-console-metric">
            <div className="ap-amos-console-label">{row.speedLabel}</div>
            <div className="ap-amos-console-value">{row.speedValue}</div>
          </div>
          <div className="ap-amos-console-metric">
            <div className="ap-amos-console-label">{row.directionLabel}</div>
            <div className="ap-amos-console-value">{row.directionValue}</div>
          </div>
        </div>
      ))}
    </aside>
  )
}

function WindDial({ dial, activeRunwayIndex }) {
  const dialStyle = {
    '--ap-amos-runway-rotation': `${dial.runwayRotationDeg}deg`,
    '--ap-amos-wind-from': `${dial.windFromDeg ?? 0}deg`,
  }

  return (
    <section className="ap-amos-console-dial-panel">
      <div className="ap-amos-console-component-stack">
        <div className="ap-amos-console-dial" style={dialStyle} aria-label="active runway wind component">
          <div className="ap-amos-console-major-ticks" aria-hidden="true" />
          <div className="ap-amos-console-ticks" aria-hidden="true" />
          {BEARINGS.map(([label, angle]) => (
            <span className="ap-amos-console-bearing" style={{ '--angle': `${angle}deg` }} key={label}>
              {label}
            </span>
          ))}
          {Number.isFinite(dial.windFromDeg) ? <div className="ap-amos-console-wind-arrow" aria-hidden="true" /> : null}
          <div className="ap-amos-console-runway-strip" aria-hidden="true">
            <span className={`ap-amos-console-active-end ap-amos-console-active-end--${activeRunwayIndex === 1 ? 'end' : 'start'}`} />
          </div>
        </div>
        <div className="ap-amos-console-components">
          <div className="ap-amos-console-component">
            <span>H/T-WS(kt)</span>
            <strong>{dial.headTailLabel} {dial.headTailValue}</strong>
          </div>
          <div className="ap-amos-console-component">
            <span>CROSS-WS(kt)</span>
            <strong>{dial.crossLabel} {dial.crossValue}</strong>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function AmosBoardTab({ amos, metar, airportMeta }) {
  if (!amos) return <div className="ap-empty">AMOS 데이터 없음</div>

  const model = buildAmosConsoleModel(amos, metar, airportMeta)

  return (
    <div className="ap-amos ap-amos-console-wrap">
      <div className="ap-amos-head">
        <div>
          <h3>공항기상관측장비(AMOS)</h3>
        </div>
        <span className="ap-amos-time">{model.observedTimeLabel}</span>
      </div>

      <section className="ap-amos-console-board" aria-label="AMOS layout">
        <header className="ap-amos-console-top">
          {model.runwayLabels.map((label) => (
            <div className={`ap-amos-console-runway-id${label === model.activeRunwayLabel ? ' is-active' : ''}`} key={label}>
              {label === model.activeRunwayLabel ? `${label} IN USE` : label}
            </div>
          ))}
        </header>

        <section className="ap-amos-console-wind-row">
          <WindMetricColumn group={model.windGroups[0]} side="left" />
          <WindDial dial={model.dial} activeRunwayIndex={model.activeRunwayIndex} />
          <WindMetricColumn group={model.windGroups[1]} side="right" />
        </section>

        <section className="ap-amos-console-rvr-row" aria-label="visibility and rvr">
          {model.visibilityRows.map((row) => (
            <div className="ap-amos-console-rvr-cell" key={row.label}>
              <div className="ap-amos-console-label">{row.label}</div>
              <div className="ap-amos-console-rvr-value">
                <span className={row.isRvrGood ? 'is-good' : undefined}>{row.rvrValue}</span>/{row.morValue}
              </div>
            </div>
          ))}
        </section>

        <section className="ap-amos-console-common-grid" aria-label="common weather">
          {model.commonCells.map((cell) => (
            <div className="ap-amos-console-bottom-cell" key={cell.label}>
              <div className="ap-amos-console-label">{cell.label}</div>
              <div className="ap-amos-console-bottom-value">{cell.value}</div>
            </div>
          ))}
        </section>
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Run view-model tests**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

Expected result:

```text
ok
```

- [ ] **Step 3: Commit markup work**

Run:

```powershell
git add frontend/src/features/airport-panel/tabs/AmosTab.jsx
git commit -m "feat: render amos console layout"
```

## Task 4: Add Airport-Panel CSS For Prototype Layout

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

- [ ] **Step 1: Add console layout styles after the current AMOS styles**

Append this CSS after the existing `.ap-amos-*` section. Do not delete older AMOS CSS until browser verification confirms no other tab path uses it.

```css
.ap-amos-console-wrap {
  gap: 12px;
}

.ap-amos-console-board {
  --ap-amos-console-line: rgba(148, 163, 184, .45);
  --ap-amos-console-text: #0f172a;
  --ap-amos-console-muted: #64748b;
  --ap-amos-console-blue: #d9e8fb;
  --ap-amos-console-accent: #2563eb;
  --ap-amos-console-red: #ef4444;
  --ap-amos-console-green: #16a34a;
  width: min(780px, 100%);
  overflow: hidden;
  border: 1px solid var(--ap-amos-console-line);
  background: rgba(255, 255, 255, .84);
  color: var(--ap-amos-console-text);
  box-shadow: 0 14px 30px rgba(15, 23, 42, .1);
}

.ap-amos-console-top {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 38px;
  border-bottom: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-runway-id {
  display: grid;
  place-items: center;
  min-width: 0;
  border-right: 1px solid var(--ap-amos-console-line);
  color: var(--ap-amos-console-text);
  font-size: 20px;
  font-weight: 900;
  line-height: 1;
}

.ap-amos-console-runway-id:last-child {
  border-right: 0;
}

.ap-amos-console-runway-id.is-active {
  background: var(--ap-amos-console-red);
  color: #fff;
}

.ap-amos-console-wind-row {
  display: grid;
  grid-template-columns: minmax(180px, 220px) minmax(280px, 340px) minmax(180px, 220px);
  min-height: 410px;
  border-bottom: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-wind-metrics {
  display: grid;
  grid-template-rows: repeat(3, minmax(0, 1fr));
  min-width: 0;
  border-right: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-wind-metrics--right {
  border-right: 0;
  border-left: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-metric-band {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-width: 0;
  border-bottom: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-metric-band:last-child {
  border-bottom: 0;
}

.ap-amos-console-metric {
  display: grid;
  grid-template-rows: 26px minmax(68px, 1fr);
  min-width: 0;
  border-right: 1px solid rgba(148, 163, 184, .35);
}

.ap-amos-console-metric:last-child {
  border-right: 0;
}

.ap-amos-console-label {
  display: grid;
  place-items: center;
  min-width: 0;
  overflow: hidden;
  background: var(--ap-amos-console-blue);
  color: var(--ap-amos-console-accent);
  font-size: 12px;
  font-weight: 900;
  line-height: 1.1;
  text-align: center;
  white-space: nowrap;
}

.ap-amos-console-value {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 8px;
  color: var(--ap-amos-console-text);
  font-size: 32px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.ap-amos-console-dial-panel {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 46px 8px 18px;
}

.ap-amos-console-component-stack {
  display: grid;
  justify-items: center;
  gap: 40px;
}

.ap-amos-console-dial {
  position: relative;
  display: grid;
  place-items: center;
  width: 222px;
  aspect-ratio: 1;
  border-radius: 50%;
  background:
    radial-gradient(circle at center, #f8fafc 0 57%, transparent 58%),
    conic-gradient(from 0deg, #94a3b8 0 310deg, #4fd6e6 310deg 350deg, #94a3b8 350deg 360deg);
  box-shadow:
    inset 0 0 0 10px rgba(37, 99, 235, .08),
    inset 0 0 0 18px rgba(15, 23, 42, .08);
}

.ap-amos-console-dial::before {
  content: "";
  position: absolute;
  inset: 24px;
  border: 2px solid rgba(15, 23, 42, .42);
  border-radius: 50%;
}

.ap-amos-console-ticks {
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background:
    repeating-conic-gradient(from 0deg, rgba(15, 23, 42, .85) 0 1deg, transparent 1deg 10deg),
    repeating-conic-gradient(from 0deg, rgba(15, 23, 42, .36) 0 .7deg, transparent .7deg 5deg);
  mask: radial-gradient(circle, transparent 0 70%, #000 71% 78%, transparent 79%);
}

.ap-amos-console-major-ticks {
  position: absolute;
  inset: -12px;
  border-radius: 50%;
  background: repeating-conic-gradient(from 0deg, rgba(15, 23, 42, .8) 0 2deg, transparent 2deg 30deg);
  mask: radial-gradient(circle, transparent 0 68%, #000 69% 82%, transparent 83%);
}

.ap-amos-console-bearing {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 2;
  width: 22px;
  height: 18px;
  margin: -9px 0 0 -11px;
  color: var(--ap-amos-console-text);
  font-size: 11px;
  font-weight: 900;
  line-height: 18px;
  text-align: center;
  transform: rotate(var(--angle)) translateY(-136px) rotate(calc(-1 * var(--angle)));
  transform-origin: center;
}

.ap-amos-console-wind-arrow {
  position: absolute;
  left: 50%;
  top: 50%;
  z-index: 3;
  width: 22px;
  height: 18px;
  margin: -9px 0 0 -11px;
  background: #25d9ef;
  clip-path: polygon(50% 0, 0 100%, 100% 100%);
  transform: rotate(var(--ap-amos-wind-from)) translateY(-70px) rotate(180deg);
  transform-origin: center;
}

.ap-amos-console-runway-strip {
  position: relative;
  z-index: 1;
  display: block;
  width: 106px;
  height: 18px;
  border: 1px solid rgba(15, 23, 42, .42);
  background: #0f172a;
  transform: rotate(var(--ap-amos-runway-rotation));
}

.ap-amos-console-active-end {
  position: absolute;
  top: -1px;
  bottom: -1px;
  width: 14px;
  background: var(--ap-amos-console-red);
}

.ap-amos-console-active-end--start {
  left: -1px;
}

.ap-amos-console-active-end--end {
  right: -1px;
}

.ap-amos-console-components {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  gap: 8px;
  padding-bottom: 4px;
}

.ap-amos-console-component {
  display: grid;
  justify-items: center;
  min-width: 0;
  gap: 2px;
}

.ap-amos-console-component span {
  color: var(--ap-amos-console-accent);
  font-size: 13px;
  font-weight: 900;
}

.ap-amos-console-component strong {
  color: var(--ap-amos-console-text);
  font-size: 28px;
  font-weight: 900;
  line-height: 1;
}

.ap-amos-console-rvr-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-bottom: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-rvr-cell {
  display: grid;
  grid-template-rows: 24px 110px;
  min-width: 0;
  border-right: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-rvr-cell:last-child {
  border-right: 0;
}

.ap-amos-console-rvr-value {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 6px;
  color: var(--ap-amos-console-text);
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.ap-amos-console-rvr-value .is-good {
  color: var(--ap-amos-console-green);
}

.ap-amos-console-common-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.ap-amos-console-bottom-cell {
  display: grid;
  grid-template-rows: 26px 110px;
  min-width: 0;
  border-right: 1px solid var(--ap-amos-console-line);
}

.ap-amos-console-bottom-cell:last-child {
  border-right: 0;
}

.ap-amos-console-bottom-value {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 6px;
  color: var(--ap-amos-console-text);
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

@media (max-width: 760px) {
  .ap-amos-console-board {
    overflow-x: auto;
  }

  .ap-amos-console-wind-row,
  .ap-amos-console-top,
  .ap-amos-console-rvr-row,
  .ap-amos-console-common-grid {
    min-width: 720px;
  }
}
```

- [ ] **Step 2: Run frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected result:

```text
built in
```

- [ ] **Step 3: Commit CSS work**

Run:

```powershell
git add frontend/src/features/airport-panel/AirportPanel.css
git commit -m "style: add amos console board styles"
```

## Task 5: Browser Verify AMOS Panel Against Prototype

**Files:**
- Inspect: `artifacts/amos-layout-prototype.html`
- Inspect: local app AMOS airport panel
- Modify if needed: `frontend/src/features/airport-panel/AirportPanel.css`
- Modify if needed: `frontend/src/features/airport-panel/tabs/AmosTab.jsx`

- [ ] **Step 1: Start the frontend dev server**

Run:

```powershell
npm.cmd run dev --prefix frontend
```

Expected result:

```text
Local: http://localhost:5173/
```

- [ ] **Step 2: Open the prototype and record visual requirements**

Open:

```text
file:///C:/Users/Jond%20Doe/Desktop/Project/ProjectAMO/artifacts/amos-layout-prototype.html
```

Record these pass/fail checks:

```text
Header: two equal runway cells, active cell red
Wind row: left 2-minute table, center single dial, right 10-minute table
Dial: bearing numbers do not overlap ticks or component values
Runway strip: black, rotated to active runway heading, active end red
Wind arrow: cyan, inside dial, pointing from average 10-minute wind direction
RVR/MOR: values remain on one line
Common cells: five cells only, no Cloud cell
```

- [ ] **Step 3: Open the app and compare AMOS panel**

Open the app, select an airport with AMOS data, and switch to AMOS tab. Use RKJB first because the representative runway labels are `01/19`.

Expected visual result:

```text
The AMOS app panel matches the prototype structure and uses the app's light airport-panel palette.
No page-level horizontal scroll appears.
If the drawer is narrower than the board, only the AMOS board gets local horizontal scroll.
All Korean labels, RVR/MOR values, and common values fit inside their cells.
```

- [ ] **Step 4: Fix focused visual defects only**

If browser review finds spacing defects, keep edits limited to the AMOS console selectors added in Task 4. Common likely adjustments:

```css
.ap-amos-console-dial-panel {
  padding-top: 50px;
}

.ap-amos-console-component-stack {
  gap: 44px;
}

.ap-amos-console-label {
  font-size: 11px;
}
```

Do not change airport drawer shell sizing in this task.

- [ ] **Step 5: Re-run build and tests**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
npm.cmd run build --prefix frontend
```

Expected result:

```text
ok
built in
```

- [ ] **Step 6: Commit visual verification fixes**

Run:

```powershell
git add frontend/src/features/airport-panel/tabs/AmosTab.jsx frontend/src/features/airport-panel/AirportPanel.css
git commit -m "fix: tune amos console panel layout"
```

## Task 6: Update Architecture Notes If The AMOS Flow Changed

**Files:**
- Inspect: `Architecture.md`
- Modify only if needed: `Architecture.md`

- [ ] **Step 1: Check whether file-role text is still accurate**

Inspect the AMOS lines:

```text
frontend/src/features/airport-panel/tabs/AmosTab.jsx -> AMOS tab rendering.
frontend/src/features/airport-panel/lib/amosViewModel.js -> AMOS display model helpers.
```

Expected decision:

```text
No Architecture.md change is required if these role descriptions still cover the work.
```

- [ ] **Step 2: Update only if a new non-obvious rule must be documented**

If the implementation establishes the permanent rule that current AMOS `runways[0]` and `runways[1]` wind values are actually 2-minute and 10-minute groups, add one concise bullet under Reference Structure:

```markdown
- AMOS frontend wind rendering treats current normalized `amos.runways[0]` as the 2-minute wind group and `amos.runways[1]` as the 10-minute wind group; L/R runway semantics only apply to visibility and RVR until the backend parser is renamed.
```

- [ ] **Step 3: Commit docs only if changed**

Run only if `Architecture.md` changed:

```powershell
git add Architecture.md
git commit -m "docs: document amos wind group mapping"
```

## Final Verification

- [ ] Run view-model tests:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

Expected:

```text
ok
```

- [ ] Run frontend build:

```powershell
npm.cmd run build --prefix frontend
```

Expected:

```text
built in
```

- [ ] Browser-check the AMOS tab for at least RKJB and one non-`01/19` representative airport such as RKPU.

Expected:

```text
RKJB shows 01/19 labels with the active runway highlighted.
RKPU uses its configured representative labels from AMOS_REPRESENTATIVE_RUNWAYS.
The dial runway strip rotation follows the active runway label.
The wind tables show 2-minute and 10-minute AMOS wind groups, not runway-side wind groups.
```

## Follow-Up Not Included In This Plan

The backend parser should eventually rename the normalized wind fields so `runways[0]` and `runways[1]` are not overloaded as wind time windows. That is a separate parser/API compatibility task because it can affect consumers outside the airport panel. This plan keeps the visible AMOS panel correct without changing backend payload contracts.
