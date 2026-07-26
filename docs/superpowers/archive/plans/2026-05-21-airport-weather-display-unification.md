# Airport Weather Display Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Airport panel METAR/TAF use the same weather-condition judgment as `/monitoring`, while keeping Airport drawer typography and CSS tuned for its narrower layout.

**Architecture:** Keep weather judgment in `frontend/src/shared/weather/helpers.js`. The Airport panel view models consume shared booleans and expose display flags; `/monitoring` keeps its legacy component/CSS structure but delegates matching condition checks to the shared helper layer. CSS stays screen-specific: Airport keeps `ap-*` classes, `/monitoring` keeps existing `taf-*` and `metar-*` classes.

**Tech Stack:** Vite, React 19, Node `node:test`, CSS modules by feature directory, existing browser verification through local Vite.

---

## Context And Constraints

- Do not change backend data, KIM science formulas, route vertical sections, or weather layer semantics.
- Do not rewrite `/monitoring` legacy UI. Only centralize the weather-condition logic needed for consistent highlighting.
- Do not copy `/monitoring` font sizes directly into Airport panel. Browser inspection showed `/monitoring` TAF uses about `15-17px` in a wider panel, while Airport drawer content is about `511px` wide. Airport should become readable without table overflow breaking the drawer.
- Keep `/monitoring` UI behavior visually unchanged except using shared condition helper logic.
- Implement tests before each behavior change.
- Design review constraint: do not apply red dashed special-weather outlines to compressed Airport TAF timeline bars. Use precipitation tint in the timeline, and reserve dashed special-weather outlines for METAR current-weather card plus TAF table/grid weather cells.
- Design review constraint: do not raise every Airport TAF font to `/monitoring` density. Keep timeline compact, make only modest readability improvements, and keep table overflow local if it needs horizontal scroll.
- Mixed-state rule: if a weather item is both precipitation and special weather, the blue tint and red dashed boundary may both appear in table/grid/METAR card, but it must still read as a normal drawer data tile rather than a full alert panel.

## Subagent Execution Map

- **Task 1:** Implementer can own shared helper tests and helper addition.
- **Task 2:** Implementer can own `/monitoring` legacy helper shim and component import cleanup.
- **Task 3:** Implementer can own Airport METAR/TAF view-model tests and data flags.
- **Task 4:** Implementer can own Airport JSX/CSS presentation changes.
- **Task 5:** Reviewer or UI QA reviewer should perform read-only browser verification and regression review after Tasks 1-4.
- **Task 6:** Main agent owns long-context status update and Architecture.md check.

Keep write-heavy work sequential. Tasks 1-4 touch related frontend weather display paths and should not be implemented in parallel.

## Files

- Modify: `frontend/src/shared/weather/helpers.js`
- Create: `frontend/src/shared/weather/helpers.test.js`
- Modify: `frontend/src/features/monitoring/legacy/utils/helpers.js`
- Modify: `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/TafTimeline.jsx`
- Create: `frontend/src/features/monitoring/legacy/utils/helpers.test.js`
- Modify: `frontend/src/features/airport-panel/lib/metarViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/metarViewModel.test.js`
- Modify: `frontend/src/features/airport-panel/lib/tafViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/tafViewModel.test.js`
- Modify: `frontend/src/features/airport-panel/tabs/MetarTab.jsx`
- Modify: `frontend/src/features/airport-panel/tabs/TafTab.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

---

### Task 1: Shared Weather Condition Helpers

**Files:**
- Modify: `frontend/src/shared/weather/helpers.js`
- Create: `frontend/src/shared/weather/helpers.test.js`

- [x] **Step 1: Add failing helper tests**

Create `frontend/src/shared/weather/helpers.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from './helpers.js'

describe('shared weather condition helpers', () => {
  it('detects precipitation weather tokens and ignores NSW', () => {
    assert.equal(hasPrecipitationWeather({ display: { weather: 'RA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: '-DZ BR' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'SHRA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'NSW' } }), false)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'FG' } }), false)
  })

  it('detects special weather used for dashed alert styling', () => {
    assert.equal(hasSpecialWeather({ display: { weather: 'TSRA' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'FG' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: '-SN' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'BR' } }), false)
    assert.equal(hasSpecialWeather({ display: { weather: 'NSW' } }), false)
  })

  it('detects high wind by sustained speed or gust threshold', () => {
    assert.equal(hasHighWindCondition({ speed: 25, gust: null }), true)
    assert.equal(hasHighWindCondition({ speed: 10, gust: 35 }), true)
    assert.equal(hasHighWindCondition({ speed: 24, gust: 34 }), false)
    assert.equal(hasHighWindCondition({ calm: true, speed: 40, gust: 50 }), false)
  })
})
```

- [x] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test frontend/src/shared/weather/helpers.test.js
```

Expected: fails because `hasSpecialWeather` is not exported.

- [x] **Step 3: Add shared helper**

In `frontend/src/shared/weather/helpers.js`, add this near `hasPrecipitationWeather`:

```js
const SPECIAL_WEATHER_TOKENS = ['TS', 'FG', 'SN']

export function hasSpecialWeather(source) {
  const raw = String(source?.display?.weather || source || '').toUpperCase()
  if (!raw || raw === 'NSW') return false
  return SPECIAL_WEATHER_TOKENS.some((token) => raw.includes(token))
}
```

- [x] **Step 4: Verify shared helper tests pass**

Run:

```powershell
node --test frontend/src/shared/weather/helpers.test.js
```

Expected: all tests pass.

---

### Task 2: Monitoring Uses Shared Condition Logic

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/utils/helpers.js`
- Modify: `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`
- Modify: `frontend/src/features/monitoring/legacy/components/TafTimeline.jsx`
- Create: `frontend/src/features/monitoring/legacy/utils/helpers.test.js`

- [x] **Step 1: Add failing legacy helper alignment tests**

Create `frontend/src/features/monitoring/legacy/utils/helpers.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from './helpers.js'

describe('monitoring legacy weather helper compatibility', () => {
  it('delegates precipitation semantics used by Airport panel', () => {
    assert.equal(hasPrecipitationWeather({ display: { weather: 'RA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'SHRA' } }), true)
    assert.equal(hasPrecipitationWeather({ display: { weather: 'FG' } }), false)
  })

  it('exposes shared special-weather semantics for monitoring components', () => {
    assert.equal(hasSpecialWeather({ display: { weather: 'TSRA' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'FG' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: '-SN' } }), true)
    assert.equal(hasSpecialWeather({ display: { weather: 'BR' } }), false)
  })

  it('keeps high-wind display thresholds unchanged', () => {
    assert.equal(hasHighWindCondition({ speed: 25 }), true)
    assert.equal(hasHighWindCondition({ gust: 35 }), true)
    assert.equal(hasHighWindCondition({ speed: 24, gust: 34 }), false)
  })
})
```

- [x] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test frontend/src/features/monitoring/legacy/utils/helpers.test.js
```

Expected: fails because legacy helpers do not export `hasSpecialWeather`.

- [x] **Step 3: Delegate legacy condition helpers to shared helpers**

At the top of `frontend/src/features/monitoring/legacy/utils/helpers.js`, add:

```js
import {
  hasHighWindCondition as sharedHasHighWindCondition,
  hasPrecipitationWeather as sharedHasPrecipitationWeather,
  hasSpecialWeather as sharedHasSpecialWeather,
} from '../../../../shared/weather/helpers.js'
```

Replace the local `hasPrecipitationWeather` and `hasHighWindCondition` bodies with:

```js
export function hasPrecipitationWeather(source) {
  return sharedHasPrecipitationWeather(source)
}

export function hasSpecialWeather(source) {
  return sharedHasSpecialWeather(source)
}

export function hasHighWindCondition(wind, speedThreshold = 25, gustThreshold = 35) {
  return sharedHasHighWindCondition(wind, speedThreshold, gustThreshold)
}
```

- [x] **Step 4: Remove component-local special-weather functions**

In `frontend/src/features/monitoring/legacy/components/MetarCard.jsx`, add `hasSpecialWeather` to the existing helpers import and remove the local function:

```js
import {
  classifyCeilingCategory,
  classifyVisibilityCategory,
  getFlightCategory,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
} from '../utils/helpers'
```

Remove:

```js
function hasSpecialWeather(observation) {
  const raw = String(observation?.display?.weather || "").toUpperCase();
  return ["TS", "FG", "SN"].some((token) => raw.includes(token));
}
```

In `frontend/src/features/monitoring/legacy/components/TafTimeline.jsx`, add `hasSpecialWeather` to the helpers import and remove its local function:

```js
import {
  classifyCeilingCategory,
  classifyVisibilityCategory,
  getDisplayDate,
  getFlightCategory,
  getSeverityLevel,
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
  isDarkTheme,
  safe,
} from '../utils/helpers'
```

Remove:

```js
function hasSpecialWeather(slot) {
  const raw = String(slot?.display?.weather || "").toUpperCase();
  return ["TS", "SN", "FG"].some((token) => raw.includes(token));
}
```

- [x] **Step 5: Verify monitoring helper compatibility**

Run:

```powershell
node --test frontend/src/features/monitoring/legacy/utils/helpers.test.js
```

Expected: all tests pass.

---

### Task 3: Airport View Models Expose Weather Highlight Flags

**Files:**
- Modify: `frontend/src/features/airport-panel/lib/metarViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/metarViewModel.test.js`
- Modify: `frontend/src/features/airport-panel/lib/tafViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/tafViewModel.test.js`

- [x] **Step 1: Add failing METAR view-model tests**

Create `frontend/src/features/airport-panel/lib/metarViewModel.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildMetarViewModel } from './metarViewModel.js'

const baseMetar = {
  header: { observation_time: '2026-05-21T10:00:00Z' },
  observation: {
    cavok: false,
    display: { weather: 'TSRA', visibility: '3000', qnh: 'Q1008' },
    visibility: { value: 3000 },
    wind: { direction: 250, speed: 12, gust: 36, unit: 'KT' },
    clouds: [{ amount: 'BKN', base: 1200 }],
    temperature: { air: 19, dewpoint: 17 },
  },
}

describe('airport METAR view model weather highlighting', () => {
  it('exposes precipitation and special-weather flags for current weather card', () => {
    const model = buildMetarViewModel({
      metar: baseMetar,
      amosData: { daily_rainfall: { mm: 2.9 } },
      icao: 'RKSI',
      airportMeta: { runway_hdg: 150 },
    })

    assert.equal(model.precipitationWeather, true)
    assert.equal(model.specialWeather, true)
    assert.equal(model.highWind, true)
    assert.equal(model.weatherKorean, '뇌우')
    assert.equal(model.qnh, '1008 hPa')
    assert.equal(model.rainText, '2.9 mm')
  })

  it('does not mark mist as special or precipitation weather', () => {
    const model = buildMetarViewModel({
      metar: {
        ...baseMetar,
        observation: {
          ...baseMetar.observation,
          display: { ...baseMetar.observation.display, weather: 'BR' },
          weather: [],
        },
      },
      amosData: null,
      icao: 'RKSI',
      airportMeta: { runway_hdg: 150 },
    })

    assert.equal(model.precipitationWeather, false)
    assert.equal(model.specialWeather, false)
  })
})
```

- [x] **Step 2: Add failing TAF view-model tests**

Create `frontend/src/features/airport-panel/lib/tafViewModel.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildTafViewModel, formatTafHour, groupTafSlots } from './tafViewModel.js'

function futureSlot(offsetHours, weather, overrides = {}) {
  return {
    time: new Date(Date.now() + offsetHours * 3600 * 1000).toISOString(),
    display: { weather, visibility: '9999' },
    visibility: { value: 9999 },
    wind: { direction: 180, speed: 8, unit: 'KT' },
    clouds: [{ amount: 'BKN', base: 2500 }],
    ...overrides,
  }
}

describe('airport TAF view model weather highlighting', () => {
  it('exposes precipitation and special-weather flags per slot', () => {
    const taf = {
      header: { valid_start: '2026-05-21T06:00:00Z', valid_end: '2026-05-22T12:00:00Z' },
      timeline: [
        futureSlot(2, 'RA'),
        futureSlot(3, 'FG'),
        futureSlot(4, 'NSW'),
      ],
    }

    const model = buildTafViewModel(taf, 'RKSI')

    assert.deepEqual(model.slots.map((slot) => slot.hasPrecipitation), [true, false, false])
    assert.deepEqual(model.slots.map((slot) => slot.isSpecialWeather), [false, true, false])
  })

  it('keeps contiguous group width calculation unchanged', () => {
    const groups = groupTafSlots(
      [{ key: 'A' }, { key: 'A' }, { key: 'B' }, { key: 'A' }],
      (item) => item.key,
    )

    assert.deepEqual(groups.map((group) => group.key), ['A', 'B', 'A'])
    assert.deepEqual(groups.map((group) => group.width), ['50%', '25%', '25%'])
  })

  it('formats invalid TAF hour safely', () => {
    assert.equal(formatTafHour('bad-date'), '--')
  })
})
```

- [x] **Step 3: Run tests and confirm failure**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/metarViewModel.test.js frontend/src/features/airport-panel/lib/tafViewModel.test.js
```

Expected: fails because `precipitationWeather`, `specialWeather`, `hasPrecipitation`, and `isSpecialWeather` are missing.

- [x] **Step 4: Add METAR flags**

In `frontend/src/features/airport-panel/lib/metarViewModel.js`, extend the helpers import:

```js
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
```

After `weatherVisual`:

```js
  const precipitationWeather = hasPrecipitationWeather(obs)
  const specialWeather = hasSpecialWeather(obs)
```

Return those fields:

```js
    precipitationWeather,
    specialWeather,
```

- [x] **Step 5: Add TAF flags**

In `frontend/src/features/airport-panel/lib/tafViewModel.js`, extend the helpers import:

```js
  hasHighWindCondition,
  hasPrecipitationWeather,
  hasSpecialWeather,
```

In the `tafSlotView()` return object, add:

```js
    hasPrecipitation: hasPrecipitationWeather(slot),
    isSpecialWeather: hasSpecialWeather(slot),
```

- [x] **Step 6: Verify Airport view-model tests**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/metarViewModel.test.js frontend/src/features/airport-panel/lib/tafViewModel.test.js
```

Expected: all tests pass.

---

### Task 4: Airport Panel Markup And CSS

**Files:**
- Modify: `frontend/src/features/airport-panel/tabs/MetarTab.jsx`
- Modify: `frontend/src/features/airport-panel/tabs/TafTab.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

- [x] **Step 1: Add weather state class helpers in `TafTab.jsx`**

Near `TAF_VIEWS`, add:

```js
function tafWeatherClass(item, baseClass, { includeSpecial = true } = {}) {
  return [
    baseClass,
    item?.hasPrecipitation ? `${baseClass}--precip` : '',
    includeSpecial && item?.isSpecialWeather ? `${baseClass}--special` : '',
  ].filter(Boolean).join(' ')
}
```

- [x] **Step 2: Apply TAF weather classes in all three TAF views**

In the timeline weather segment, change the segment `className` to use the helper only for the weather row:

```jsx
className={label === '날씨' ? tafWeatherClass(group.first, 'ap-taf-seg', { includeSpecial: false }) : 'ap-taf-seg'}
```

Change the weather row style callback from:

```js
() => ({ background: '#f8fafc', color: '#0f172a' })
```

to:

```js
(item) => ({
  background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc',
  color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a',
})
```

In the table weather cell:

```jsx
<td className={tafWeatherClass(item, 'ap-taf-weather-cell')}>
  <WeatherIcon visual={item.visual} className="ap-taf-mini-icon" />
  {item.weatherLabel}
</td>
```

Wrap the table with:

```jsx
<div className="ap-taf-table-wrap">
  <table className="ap-taf-table">
    ...
  </table>
</div>
```

In the grid weather area:

```jsx
<div className={tafWeatherClass(item, 'ap-taf-card-weather')}>
  <WeatherIcon visual={item.visual} className="ap-taf-card-icon" />
  {item.weatherLabel}
</div>
```

- [x] **Step 3: Apply METAR current-weather classes**

In `frontend/src/features/airport-panel/tabs/MetarTab.jsx`, destructure the two new model flags:

```js
    precipitationWeather,
    specialWeather,
```

Change the current weather card class:

```jsx
<div
  className={[
    'ap-mv2-card',
    precipitationWeather ? 'ap-mv2-card--precip-weather' : '',
    specialWeather ? 'ap-mv2-card--special-weather' : '',
  ].filter(Boolean).join(' ')}
>
```

- [x] **Step 4: Tune Airport-only CSS**

In `frontend/src/features/airport-panel/AirportPanel.css`, adjust the Airport TAF section:

```css
.ap-taf-header {
  font-size: 12px;
  gap: 4px;
  margin-bottom: 12px;
}

.ap-taf-switch-btn {
  font-size: 12px;
  padding: 6px 10px;
}

.ap-taf-scale {
  font-size: 11px;
}

.ap-taf-line-label {
  font-size: 12px;
}

.ap-taf-seg {
  min-height: 36px;
  font-size: 12px;
  padding: 0 5px;
  line-height: 1.15;
}

.ap-taf-mini-icon {
  width: 20px;
  height: 20px;
}

.ap-taf-table-wrap {
  overflow-x: auto;
  max-width: 100%;
}

.ap-taf-table {
  min-width: 540px;
  font-size: 12px;
}

.ap-taf-table th,
.ap-taf-table td {
  padding: 8px 6px;
}

.ap-taf-weather-cell {
  border-radius: 8px;
  padding: 5px 8px;
}

.ap-taf-weather-cell--precip,
.ap-taf-card-weather--precip,
.ap-taf-seg--precip {
  background: rgba(186, 230, 253, 0.72) !important;
  color: #0c4a6e !important;
}

.ap-taf-weather-cell--special,
.ap-taf-card-weather--special,
.ap-taf-seg--special,
.ap-mv2-card--special-weather {
  outline: 2px dashed #dc2626;
  outline-offset: -2px;
}

.ap-taf-card {
  padding: 10px;
}

.ap-taf-card-head,
.ap-taf-card-row {
  font-size: 12px;
}

.ap-taf-card-weather {
  min-height: 40px;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 13px;
}

.ap-mv2-card--precip-weather {
  background: rgba(186, 230, 253, 0.72);
}
```

- [x] **Step 5: Run focused tests and build**

Run:

```powershell
node --test frontend/src/shared/weather/helpers.test.js frontend/src/features/monitoring/legacy/utils/helpers.test.js frontend/src/features/airport-panel/lib/metarViewModel.test.js frontend/src/features/airport-panel/lib/tafViewModel.test.js
npm.cmd run build --prefix frontend
```

Expected: tests pass and build succeeds.

---

### Task 5: Browser Verification

**Files:**
- No source changes expected.

- [x] **Step 1: Start or reuse local dev server**

Run only if no dev server is already responding:

```powershell
npm.cmd run dev
```

Expected: Vite serves `http://localhost:5173/`.

- [x] **Step 2: Verify Airport panel TAF states**

In the browser:

1. Open `http://localhost:5173/`.
2. Click a visible airport marker, for example RKSI.
3. Open `TAF`.
4. Check `타임라인`, `테이블`, and `그리드`.

Expected:

- TAF text is materially more readable than before.
- Airport drawer does not get page-level horizontal scroll.
- Table horizontal scroll, if present, is local to the TAF table area.
- Weather cells with precipitation use blue background.
- Weather cells with TS/FG/SN use red dashed outline.

- [x] **Step 3: Verify METAR current-weather card**

Open an airport whose METAR currently has `RA`, `TS`, `FG`, or `SN` if local data provides one.

Expected:

- Current weather card uses blue background for precipitation.
- Current weather card uses red dashed outline for TS/FG/SN.
- Mist/BR does not get the red dashed special-weather outline.

- [x] **Step 4: Verify `/monitoring` did not visually regress**

Open:

```text
http://localhost:5173/monitoring
```

Expected:

- Existing `/monitoring` METAR/TAF weather highlighting still appears.
- Current weather title image behavior still works.
- TAF view switcher still works.

- [x] **Step 5: Final verification command**

Run all frontend tests:

```powershell
$files = Get-ChildItem -Path 'frontend\src' -Recurse -Filter '*.test.js' | ForEach-Object { $_.FullName }; node --test $files
npm.cmd run build --prefix frontend
```

Expected: all tests pass and build succeeds.

---

### Task 6: Long-Context Status And Architecture Check

**Files:**
- Modify: `docs/superpowers/status/airport-weather-display-unification.status.md`
- Possibly modify: `Architecture.md`

- [x] **Step 1: Update status resume point**

Update `docs/superpowers/status/airport-weather-display-unification.status.md` with:

```markdown
# Airport Weather Display Unification Status

Updated: YYYY-MM-DD HH:MM KST
Plan: docs/superpowers/plans/2026-05-21-airport-weather-display-unification.md

## Resume Point
- Last completed: Task 5 verification
- Next: Final review and commit

## Verified
- node --test frontend/src/shared/weather/helpers.test.js frontend/src/features/monitoring/legacy/utils/helpers.test.js frontend/src/features/airport-panel/lib/metarViewModel.test.js frontend/src/features/airport-panel/lib/tafViewModel.test.js
- npm.cmd run build --prefix frontend
- Browser checked Airport TAF timeline/table/grid and /monitoring TAF/METAR
```

- [x] **Step 2: Check Architecture.md**

Open `Architecture.md` and decide whether the new helper/test files require File Roles updates.

Expected:

- If only tests were added and existing file roles remain accurate, leave `Architecture.md` unchanged.
- If shared helper responsibility meaningfully changes, add a short File Role update for `frontend/src/shared/weather/helpers.js` and any new non-obvious test files.

- [x] **Step 3: Final git status check**

Run:

```powershell
git status --short
```

Expected: only intended frontend/weather-display plan files and user-approved status/docs updates are listed, plus any pre-existing unrelated dirty files.

---

## Known Non-Goals

- Do not merge `/monitoring` legacy `visual-mapper.js` or `weather-visual-resolver.js` into shared modules in this pass. The legacy path has UI-specific asset behavior such as `/gisang-i/*` title images.
- Do not change METAR/TAF parsing, expiration, collection schedule, or backend cache policy.
- Do not make Airport panel structurally full-screen or redesign its tab flow in this pass.
- Do not make TAF table the only primary view. Keep the three existing TAF view modes unless the product direction changes separately.

## Self-Review

- **Spec coverage:** Covers shared condition logic, Airport METAR current-weather highlighting, Airport TAF timeline/table/grid highlighting, typography/readability, `/monitoring` compatibility, long-context status, and verification.
- **Placeholder scan:** No placeholder markers.
- **Type consistency:** Uses `precipitationWeather` and `specialWeather` for METAR view model; uses `hasPrecipitation` and `isSpecialWeather` for TAF slots; CSS suffixes match JSX helper output.
