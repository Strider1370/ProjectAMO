# Airport Current Weather Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default airport drawer tab that shows airport warning, compact METAR, and next-6-hour TAF in the fixed warning -> METAR -> TAF order.

**Architecture:** Keep data shaping in a new airport-panel view model and keep JSX in one new tab component. Reuse existing METAR/TAF airport-panel models where possible, and copy only the necessary monitoring warning banner behavior/style into airport-panel-specific code. No backend or API changes are required.

**Tech Stack:** Vite, React 19, Node `node:test`, existing airport-panel CSS, existing ProjectAMO dev-server and screenshot workflow.

---

## Source Spec

- `docs/superpowers/specs/2026-06-06-airport-current-weather-tab-design.md`

## Context And Constraints

- The new tab is the first/default airport drawer tab.
- Section order is fixed: airport warning, METAR, TAF.
- Desktop section ratio is `1fr 4fr 4fr`.
- Warning visual language must match the monitoring airport-warning banner colors and text method, but do not import `frontend/src/features/monitoring/legacy/App.css`.
- METAR is compact only. Do not render the full `MetarTab`.
- TAF is timeline only. Do not render the full `TafTab` switcher/table/grid.
- Show TAF slots by overlap: `slotStart < now + 6h && slotEnd > now`.
- RVR belongs inside the visibility card.
- Gust belongs inside the wind card.
- Daily rainfall belongs inside the current-weather card.
- Do not add a new `warningTypes` API/data flow.
- Keep implementation scoped to airport-panel files unless a test shows an existing helper needs a small extension.

## Subagent Execution Map

- **Task 1:** Implementer owns the view model and tests.
- **Task 2:** Implementer owns the new React tab component.
- **Task 3:** Implementer owns AirportPanel tab wiring.
- **Task 4:** Implementer owns CSS.
- **Task 5:** UI QA reviewer or design reviewer performs read-only screenshot review.
- **Task 6:** Main agent owns final verification and architecture-map update.

Keep Tasks 1-4 sequential. They touch one feature area and depend on the view model interface from Task 1.

## Files

- Create: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js`
- Create: `frontend/src/features/airport-panel/tabs/CurrentWeatherTab.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`
- Modify: `Architecture.md`

---

### Task 1: Current Weather View Model

**Files:**
- Create: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`
- Create: `frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js`

- [ ] **Step 1: Write failing view-model tests**

Create `frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js`:

```js
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildCompactMetarModel,
  buildCompactTafModel,
  buildCurrentWarningModel,
  formatRvrSummary,
} from './currentWeatherViewModel.js'

describe('current weather tab view model', () => {
  it('builds an ok warning model when there are no active warnings', () => {
    const model = buildCurrentWarningModel({ warnings: [] })

    assert.equal(model.active, false)
    assert.equal(model.count, 0)
    assert.equal(model.label, '공항경보 없음')
    assert.deepEqual(model.items, [])
  })

  it('uses existing warning payload fields without warningTypes lookup', () => {
    const model = buildCurrentWarningModel({
      warnings: [
        {
          wrng_type_key: 'LOW_VISIBILITY',
          wrng_type_name: '저시정',
          valid_start: '2026-06-06T01:00:00Z',
          valid_end: '2026-06-06T04:30:00Z',
        },
      ],
    })

    assert.equal(model.active, true)
    assert.equal(model.count, 1)
    assert.equal(model.items[0].name, '저시정')
    assert.equal(model.items[0].timeText, '06 0100 - 06 0430')
  })

  it('falls back through warning type fields in priority order', () => {
    const model = buildCurrentWarningModel({
      warnings: [
        { type_label: '강풍', valid_start: null, valid_end: null },
        { type: 'THUNDERSTORM', valid_start: null, valid_end: null },
      ],
    })

    assert.equal(model.items[0].name, '강풍')
    assert.equal(model.items[1].name, 'THUNDERSTORM')
  })

  it('formats RVR summary from observation RVR entries', () => {
    const text = formatRvrSummary({
      rvr: [
        { runway: '33L', mean: 550 },
        { runway: '33R', mean: 700 },
      ],
    })

    assert.equal(text, 'R33L/550m, R33R/700m')
  })

  it('builds compact METAR cards with rainfall, gust, and RVR inside their parent cards', () => {
    const model = buildCompactMetarModel({
      icao: 'RKSI',
      airportMeta: { runway_hdg: 330 },
      amosData: { daily_rainfall: { mm: 2.4 } },
      metar: {
        header: { observation_time: '2026-06-06T03:00:00Z' },
        observation: {
          cavok: false,
          display: { weather: 'RA', visibility: 9000, qnh: 'Q1011' },
          wind: { direction: 270, speed: 12, gust: 28, unit: 'KT' },
          visibility: { value: 9000 },
          rvr: [{ runway: '33L', mean: 650 }],
          clouds: [{ amount: 'BKN', base: 1800 }],
          temperature: { air: 21, dewpoint: 18 },
        },
      },
    })

    assert.equal(model.empty, false)
    assert.equal(model.flightCategory, model.flight.category)
    assert.equal(model.cards.weather.secondary, '2.4 mm')
    assert.equal(model.cards.wind.secondary, 'G28kt')
    assert.equal(model.cards.visibility.secondary, 'R33L/650m')
    assert.equal(model.cards.qnh.value, '1011 hPa')
    assert.equal(model.cards.temperature.value, '21°C / 18°C')
  })

  it('returns an empty compact METAR model without METAR input', () => {
    const model = buildCompactMetarModel({ metar: null, amosData: null, icao: 'RKSI', airportMeta: null })

    assert.equal(model.empty, true)
  })

  it('keeps current valid TAF slot that started before now and trims after six hours', () => {
    const now = new Date('2026-06-06T03:30:00Z')
    const originalNow = Date.now
    Date.now = () => now.getTime()
    const taf = {
      header: {
        report_status: 'NORMAL',
        valid_start: '2026-06-06T00:00:00Z',
        valid_end: '2026-06-06T18:00:00Z',
      },
      timeline: [
        { time: '2026-06-06T02:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T03:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T09:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
        { time: '2026-06-06T10:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
      ],
    }

    try {
      const model = buildCompactTafModel({ taf, icao: 'RKSI', now })

      assert.equal(model.empty, false)
      assert.equal(model.sourceSlotCount, 4)
      assert.deepEqual(model.slots.map((slot) => slot.time), [
        '2026-06-06T03:00:00Z',
        '2026-06-06T09:00:00Z',
      ])
      assert.equal(model.hourCount, 2)
    } finally {
      Date.now = originalNow
    }
  })

  it('distinguishes source TAF data from an empty six-hour window', () => {
    const now = new Date('2026-06-06T03:30:00Z')
    const originalNow = Date.now
    Date.now = () => now.getTime()
    const taf = {
      header: {},
      timeline: [
        { time: '2026-06-06T12:00:00Z', display: {}, visibility: { value: 10000 }, clouds: [] },
      ],
    }

    try {
      const model = buildCompactTafModel({ taf, icao: 'RKSI', now })

      assert.equal(model.empty, false)
      assert.equal(model.sourceSlotCount, 1)
      assert.equal(model.slots.length, 0)
    } finally {
      Date.now = originalNow
    }
  })
})
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js
```

Expected: fails because `currentWeatherViewModel.js` does not exist.

- [ ] **Step 3: Implement the view model**

Create `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`:

```js
import { buildMetarViewModel } from './metarViewModel.js'
import { buildTafViewModel, formatTafHour, groupTafSlots, TAF_CATEGORY_COLOR } from './tafViewModel.js'

const HOUR_MS = 60 * 60 * 1000

function formatWarningTime(value) {
  if (!value) return '-- ----'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-- ----'
  return `${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}${String(date.getUTCMinutes()).padStart(2, '0')}`
}

function pickWarningName(item) {
  return item?.wrng_type_name || item?.type_label || item?.wrng_type_key || item?.type || '미확인 경보'
}

function formatCompactWind(vm) {
  const wind = vm.obs?.wind
  if (!wind) return '-'
  if (wind.calm) return 'CALM'
  const direction = wind.variable
    ? 'VRB'
    : Number.isFinite(wind.direction)
      ? String(wind.direction).padStart(3, '0')
      : '///'
  const speed = Number.isFinite(wind.speed) ? String(wind.speed).padStart(2, '0') : '//'
  return `${direction}/${speed}kt`
}

export function buildCurrentWarningModel(warning) {
  const warnings = Array.isArray(warning?.warnings) ? warning.warnings : []
  const items = warnings.map((item) => ({
    key: item?.wrng_type_key || item?.type || item?.wrng_type_name || 'UNKNOWN',
    name: pickWarningName(item),
    timeText: `${formatWarningTime(item?.valid_start)} - ${formatWarningTime(item?.valid_end)}`,
    raw: item,
  }))

  return {
    active: items.length > 0,
    count: items.length,
    label: items.length > 0 ? '공항경보' : '공항경보 없음',
    items,
  }
}

export function formatRvrSummary(obs) {
  const entries = Array.isArray(obs?.rvr) ? obs.rvr : []
  const text = entries
    .map((rvr) => {
      if (!rvr?.runway || !Number.isFinite(rvr?.mean)) return null
      return `R${rvr.runway}/${rvr.mean}m`
    })
    .filter(Boolean)
  return text.length > 0 ? text.join(', ') : null
}

export function buildCompactMetarModel({ metar, amosData, icao, airportMeta }) {
  if (!metar?.observation) return { empty: true }

  const vm = buildMetarViewModel({ metar, amosData, icao, airportMeta })
  const temp = vm.obs?.temperature || {}
  const tempText = Number.isFinite(temp.air) && Number.isFinite(temp.dewpoint)
    ? `${Math.round(temp.air)}°C / ${Math.round(temp.dewpoint)}°C`
    : vm.tempDisplay

  return {
    empty: false,
    flight: vm.flightCat,
    flightCategory: vm.flightCat.category,
    weatherVisual: vm.weatherVisual,
    windRotation: vm.windRotation,
    highWind: vm.highWind,
    precipitationWeather: vm.precipitationWeather,
    specialWeather: vm.specialWeather,
    cards: {
      weather: {
        id: 'weather',
        label: '현재날씨',
        value: vm.weatherKorean,
        secondary: vm.rainText,
        visual: vm.weatherVisual,
      },
      wind: {
        id: 'wind',
        label: '바람',
        value: formatCompactWind(vm),
        secondary: vm.windGustText ? `${vm.windGustText}kt` : null,
        windRotation: vm.windRotation,
        highWind: vm.highWind,
      },
      visibility: {
        id: 'visibility',
        label: '시정',
        value: vm.visValue,
        secondary: formatRvrSummary(vm.obs),
        category: vm.visCat,
      },
      ceiling: {
        id: 'ceiling',
        label: '운고',
        value: vm.ceilValue,
        category: vm.ceilCat,
      },
      qnh: {
        id: 'qnh',
        label: 'QNH',
        value: vm.qnh,
      },
      temperature: {
        id: 'temperature',
        label: '\uAE30\uC628/\uC774\uC2AC\uC810',
        value: tempText,
      },
    },
  }
}

export function buildCompactTafModel({ taf, icao, now = new Date(), hours = 6 }) {
  if (!taf?.timeline) return { empty: true, sourceSlotCount: 0, rawTimeline: [], slots: [], hdr: taf?.header || null, hourCount: 0 }

  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime()
  const windowEndMs = nowMs + hours * HOUR_MS
  const model = buildTafViewModel(taf, icao)
  const slots = model.slots.filter((item) => {
    const slotStart = new Date(item?.time).getTime()
    if (Number.isNaN(slotStart)) return false
    const slotEnd = slotStart + HOUR_MS
    return slotStart < windowEndMs && slotEnd > nowMs
  })

  return {
    ...model,
    empty: false,
    slots,
    sourceSlotCount: model.rawTimeline.length,
    hourCount: slots.length,
    formatTafHour,
    groupTafSlots,
    categoryColor: TAF_CATEGORY_COLOR,
  }
}
```

- [ ] **Step 4: Verify view-model tests pass**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js
```

Expected: all tests pass.

---

### Task 2: CurrentWeatherTab Component

**Files:**
- Create: `frontend/src/features/airport-panel/tabs/CurrentWeatherTab.jsx`

- [ ] **Step 1: Create the component**

Create `frontend/src/features/airport-panel/tabs/CurrentWeatherTab.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Check, MoveUp } from 'lucide-react'
import WeatherIcon from '../../../shared/ui/WeatherIcon.jsx'
import {
  buildCompactMetarModel,
  buildCompactTafModel,
  buildCurrentWarningModel,
} from '../lib/currentWeatherViewModel.js'

function WarningSummary({ warning }) {
  const model = useMemo(() => buildCurrentWarningModel(warning), [warning])
  const viewportRef = useRef(null)
  const measureRef = useRef(null)
  const [pages, setPages] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextPageIndex, setNextPageIndex] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [pageHeight, setPageHeight] = useState(52)

  useEffect(() => {
    if (!model.active) {
      setPages([])
      setPageIndex(0)
      setNextPageIndex(0)
      setIsAnimating(false)
      return undefined
    }

    const updateLayout = () => {
      const viewport = viewportRef.current
      const measure = measureRef.current
      if (!viewport || !measure) return

      const itemNodes = Array.from(measure.children)
      const nextPages = []
      let currentTop = null
      let currentPage = []

      itemNodes.forEach((node, index) => {
        const top = Math.round(node.offsetTop)
        if (currentTop === null || top === currentTop) {
          currentTop = top
          currentPage.push(index)
          return
        }
        nextPages.push(currentPage)
        currentTop = top
        currentPage = [index]
      })
      if (currentPage.length > 0) nextPages.push(currentPage)

      const measuredHeight = itemNodes.length > 0
        ? Math.ceil(Math.max(...itemNodes.map((node) => node.getBoundingClientRect().height)) + 8)
        : Math.ceil(measure.getBoundingClientRect().height)

      if (measuredHeight > 0) setPageHeight(measuredHeight)
      setPages(nextPages)
    }

    updateLayout()
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updateLayout) : null
    if (resizeObserver) {
      if (viewportRef.current) resizeObserver.observe(viewportRef.current)
      if (measureRef.current) resizeObserver.observe(measureRef.current)
      return () => resizeObserver.disconnect()
    }
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [model.active, model.items])

  useEffect(() => {
    if (pages.length <= 1) return undefined
    const interval = window.setInterval(() => {
      setNextPageIndex((pageIndex + 1) % pages.length)
      setIsAnimating(true)
    }, 4200)
    return () => window.clearInterval(interval)
  }, [pageIndex, pages])

  useEffect(() => {
    if (!isAnimating) return undefined
    const timer = window.setTimeout(() => {
      setPageIndex(nextPageIndex)
      setIsAnimating(false)
    }, 1000)
    return () => window.clearTimeout(timer)
  }, [isAnimating, nextPageIndex])

  if (!model.active) {
    return (
      <section className="ap-current-warning ap-current-warning--ok">
        <div className="ap-current-warning-side ap-current-warning-side--single">
          <Check className="ap-current-warning-icon" aria-hidden="true" />
          <span className="ap-current-warning-label">{model.label}</span>
        </div>
      </section>
    )
  }

  const normalizedPages = (pages.length > 0 ? pages : [model.items.map((_, index) => index)])
    .map((page) => page.filter((itemIndex) => itemIndex >= 0 && itemIndex < model.items.length))
    .filter((page) => page.length > 0)
  const activePage = normalizedPages[Math.min(pageIndex, normalizedPages.length - 1)] || []
  const incomingPage = normalizedPages[Math.min(nextPageIndex, normalizedPages.length - 1)] || activePage

  const renderItems = (page, keyPrefix) => page.map((itemIndex, index) => {
    const item = model.items[itemIndex]
    return (
      <span key={`${keyPrefix}-${item.key}-${index}`} className="ap-current-warning-item">
        <span className="ap-current-warning-entry">
          <strong className="ap-current-warning-name">{item.name}</strong>
          <span className="ap-current-warning-time">{item.timeText}</span>
        </span>
      </span>
    )
  })

  return (
    <section className="ap-current-warning ap-current-warning--danger">
      <div className="ap-current-warning-side">
        <AlertTriangle className="ap-current-warning-icon ap-current-warning-icon--alert" aria-hidden="true" />
        <span className="ap-current-warning-label">{model.label}</span>
      </div>
      <div ref={viewportRef} className="ap-current-warning-text" style={{ '--ap-warning-page-height': `${pageHeight}px` }}>
        <div className={`ap-current-warning-page${isAnimating ? ' ap-current-warning-page--leave' : ' ap-current-warning-page--active'}`}>
          <div className="ap-current-warning-group">{renderItems(activePage, `page-${pageIndex}`)}</div>
        </div>
        {isAnimating && (
          <div className="ap-current-warning-page ap-current-warning-page--enter">
            <div className="ap-current-warning-group">{renderItems(incomingPage, `page-${nextPageIndex}`)}</div>
          </div>
        )}
        <div className="ap-current-warning-measure" aria-hidden="true">
          <div ref={measureRef} className="ap-current-warning-group">{renderItems(model.items.map((_, index) => index), 'measure')}</div>
        </div>
      </div>
    </section>
  )
}

function MetarSummary({ metar, amosData, icao, airportMeta }) {
  const model = buildCompactMetarModel({ metar, amosData, icao, airportMeta })
  if (model.empty) return <section className="ap-current-section"><div className="ap-empty">METAR 데이터 없음</div></section>

  const cardList = [
    model.cards.weather,
    model.cards.wind,
    model.cards.visibility,
    model.cards.ceiling,
    model.cards.qnh,
    model.cards.temperature,
  ]

  return (
    <section className="ap-current-section ap-current-metar">
      <div className="ap-current-flight" style={{ background: model.flight.bg, color: model.flight.valueColor }}>
        <span>{model.flightCategory}</span>
      </div>
      <div className="ap-current-metar-grid">
        {cardList.map((card) => (
          <article key={card.id} className={`ap-current-card ap-current-card--${card.id}${card.highWind ? ' is-alert' : ''}`}>
            <span className="ap-current-card-label">{card.label}</span>
            <strong className="ap-current-card-value">
              {card.visual && <WeatherIcon visual={card.visual} className="ap-current-card-icon" />}
              {Number.isFinite(card.windRotation) && <MoveUp className="ap-current-card-arrow" style={{ transform: `rotate(${card.windRotation}deg)` }} />}
              <span>{card.value}</span>
            </strong>
            {card.secondary && <span className="ap-current-card-secondary">{card.secondary}</span>}
          </article>
        ))}
      </div>
    </section>
  )
}

function TafSummary({ taf, icao }) {
  const model = buildCompactTafModel({ taf, icao })
  if (model.empty) return <section className="ap-current-section"><div className="ap-empty">TAF 데이터 없음</div></section>
  if (model.sourceSlotCount === 0) return <section className="ap-current-section"><div className="ap-empty">TAF 시간대 데이터 없음</div></section>
  if (model.slots.length === 0) return <section className="ap-current-section"><div className="ap-empty">향후 6시간 TAF 없음</div></section>

  const rows = [
    ['비행조건', model.groupTafSlots(model.slots, (item) => item.flight.category), (item) => item.flight.category, (item) => ({ background: model.categoryColor[item.flight.category] || '#15803d', color: '#fff' })],
    ['날씨', model.groupTafSlots(model.slots, (item) => item.weatherLabel), (item) => item.weatherLabel, (item) => ({ background: item.hasPrecipitation ? '#bae6fd' : '#f8fafc', color: item.hasPrecipitation ? '#0c4a6e' : '#0f172a' })],
    ['바람', model.groupTafSlots(model.slots, (item) => item.windText), (item) => item.windText, (item) => ({ background: item.highWind ? '#fff1f2' : '#f8fafc', color: item.highWind ? '#be123c' : '#0f172a' })],
    ['시정', model.groupTafSlots(model.slots, (item) => item.visibilityText), (item) => item.visibilityText, (item) => ({ background: item.visibilityCategory.bg, color: item.visibilityCategory.valueColor })],
    ['운고', model.groupTafSlots(model.slots, (item) => item.ceilingText), (item) => item.ceilingText, (item) => ({ background: item.ceilingCategory.bg, color: item.ceilingCategory.valueColor })],
  ]

  return (
    <section className="ap-current-section ap-current-taf">
      <div className="ap-taf-timeline">
        <div className="ap-taf-scale" style={{ '--taf-hour-count': model.slots.length }}>
          {model.slots.map((item, index) => <span key={item.time || index}>{index % 3 === 0 || index === 0 ? model.formatTafHour(item.time) : ''}</span>)}
        </div>
        {rows.map(([label, groups, textFn, styleFn]) => (
          <div className="ap-taf-line" key={label}>
            <div className="ap-taf-line-label">{label}</div>
            <div className="ap-taf-line-track">
              {groups.map((group, index) => (
                <div key={index} className={group.first?.hasPrecipitation && label === '날씨' ? 'ap-taf-seg ap-taf-seg--precip' : 'ap-taf-seg'} style={{ width: group.width, ...styleFn(group.first) }} title={textFn(group.first)}>
                  {label === '날씨' && <WeatherIcon visual={group.first.visual} className="ap-taf-mini-icon" />}
                  {label === '바람' && <MoveUp className="ap-taf-mini-arrow" style={{ transform: `rotate(${group.first.windRotation}deg)` }} />}
                  <span>{textFn(group.first)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function CurrentWeatherTab({ icao, airportMeta, warning, metar, taf, amosData }) {
  return (
    <div className="ap-current-weather">
      <WarningSummary warning={warning} />
      <MetarSummary metar={metar} amosData={amosData} icao={icao} airportMeta={airportMeta} />
      <TafSummary taf={taf} icao={icao} />
    </div>
  )
}
```

- [ ] **Step 2: Build component syntax**

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: build fails only if the new component has syntax/import errors. Fix syntax before continuing.

---

### Task 3: Wire The New Default Tab

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.jsx`

- [ ] **Step 1: Import the new tab**

Add the import near the existing airport-panel tab imports:

```js
import CurrentWeatherTab from './tabs/CurrentWeatherTab.jsx'
```

- [ ] **Step 2: Make current weather the first/default tab**

Replace the tab list and default state with:

```js
const TABS = [
  { id: 'current', label: '현재날씨' },
  { id: 'metar', label: 'METAR' },
  { id: 'taf',   label: 'TAF' },
  { id: 'amos',  label: 'AMOS' },
  { id: 'warn',  label: '공항경보' },
  { id: 'info',  label: '기상정보' },
]
```

```js
const [tab, setTab] = useState('current')
```

- [ ] **Step 3: Render the tab body**

Add this before the existing METAR tab branch:

```jsx
{tab === 'current' && (
  <CurrentWeatherTab
    icao={icao}
    airportMeta={airport}
    warning={warning}
    metar={metar}
    taf={taf}
    amosData={amos}
  />
)}
```

- [ ] **Step 4: Verify build**

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: build passes.

---

### Task 4: Airport Panel CSS

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

- [ ] **Step 1: Add current-weather layout styles**

Add styles near the existing airport-panel tab/body styles or before the METAR section:

```css
.ap-current-weather {
  min-height: 100%;
  display: grid;
  grid-template-rows: minmax(64px, 1fr) minmax(220px, 4fr) minmax(240px, 4fr);
  gap: 12px;
}

.ap-current-section {
  min-height: 0;
  overflow: hidden;
}

.ap-current-metar,
.ap-current-taf {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
```

- [ ] **Step 2: Add compact warning banner styles**

Add airport-panel-specific warning styles:

```css
.ap-current-warning {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  align-items: stretch;
  min-height: 64px;
  border-radius: 6px;
  overflow: hidden;
}

.ap-current-warning--ok {
  background: #ecfdf5;
  color: #15803d;
  border: 1px solid #86efac;
}

.ap-current-warning--danger {
  background: #f97316;
  color: #fff7ed;
}

.ap-current-warning-side {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  min-width: 0;
}

.ap-current-warning-side--single {
  grid-column: 1 / -1;
}

.ap-current-warning-icon {
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
}

.ap-current-warning-icon--alert {
  animation: ap-warning-icon-blink 1s steps(1, end) infinite;
}

.ap-current-warning-label {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.15;
  white-space: nowrap;
}

.ap-current-warning-text {
  min-width: 0;
  position: relative;
  overflow: hidden;
  height: var(--ap-warning-page-height);
  min-height: var(--ap-warning-page-height);
  align-self: center;
}

.ap-current-warning-page {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  width: 100%;
}

.ap-current-warning-page--leave {
  animation: ap-warning-page-out 1000ms ease forwards;
}

.ap-current-warning-page--enter {
  animation: ap-warning-page-in 1000ms ease forwards;
}

.ap-current-warning-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: nowrap;
  white-space: nowrap;
}

.ap-current-warning-item {
  display: inline-flex;
  flex: 0 0 auto;
}

.ap-current-warning-entry {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-left: 10px;
  border-left: 1px solid rgba(255, 247, 237, 0.45);
}

.ap-current-warning-name {
  font-size: 15px;
  font-weight: 800;
  line-height: 1.15;
}

.ap-current-warning-time {
  font-size: 12px;
  font-family: 'Consolas', 'Menlo', monospace;
  line-height: 1.15;
  opacity: 0.94;
}

.ap-current-warning-measure {
  position: absolute;
  visibility: hidden;
  pointer-events: none;
  left: 0;
  top: -9999px;
  width: 100%;
}

.ap-current-warning-measure .ap-current-warning-group {
  width: 100%;
  height: auto;
  flex-wrap: wrap;
  white-space: normal;
  align-items: flex-start;
}

@keyframes ap-warning-icon-blink {
  50% {
    opacity: 0.32;
  }
}

@keyframes ap-warning-page-out {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(calc(-1 * var(--ap-warning-page-height)));
  }
}

@keyframes ap-warning-page-in {
  from {
    transform: translateY(var(--ap-warning-page-height));
  }
  to {
    transform: translateY(0);
  }
}
```

- [ ] **Step 3: Add compact METAR styles**

Add:

```css
.ap-current-flight {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  border-radius: 6px;
  font-size: 18px;
  font-weight: 900;
}

.ap-current-metar-grid {
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(58px, 1fr));
  gap: 8px;
}

.ap-current-card {
  min-width: 0;
  min-height: 58px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  padding: 9px 10px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
}

.ap-current-card.is-alert {
  border-color: #fecdd3;
  background: #fff1f2;
}

.ap-current-card-label {
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
}

.ap-current-card-value {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #0f172a;
  font-size: 15px;
  font-weight: 900;
  line-height: 1.2;
  overflow-wrap: anywhere;
}

.ap-current-card-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
}

.ap-current-card-arrow {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.ap-current-card-secondary {
  color: #64748b;
  font-size: 11px;
  font-family: 'Consolas', 'Menlo', monospace;
  line-height: 1.15;
}
```

- [ ] **Step 4: Add compact TAF and mobile constraints**

Add:

```css
.ap-current-taf .ap-taf-timeline {
  min-height: 0;
  overflow: hidden;
}

.ap-current-taf .ap-taf-line-track {
  min-height: 30px;
}

.ap-current-taf .ap-taf-seg {
  min-height: 30px;
}

@media (max-width: 640px) {
  .ap-current-weather {
    display: flex;
    flex-direction: column;
  }

  .ap-current-warning {
    grid-template-columns: 1fr;
  }

  .ap-current-warning-text {
    margin: 0 8px 8px;
  }

  .ap-current-metar-grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
}
```

- [ ] **Step 5: Verify build**

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: build passes.

---

### Task 5: UI Verification

**Files:**
- No source edits unless verification finds a focused UI issue.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js
```

Expected: pass.

Run:

```powershell
npm.cmd run test:airport-panel --prefix frontend
```

Expected: pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: pass.

- [ ] **Step 3: Run responsive smoke**

Because this uses the local dev server, follow `docs/dev-server-and-capture.md` and request sandbox escalation in Codex if needed.

Run from repository root:

```powershell
npm.cmd run dev:smoke
```

Expected: pass.

- [ ] **Step 4: Capture focused airport drawer screenshots**

Use the managed server procedure from `docs/dev-server-and-capture.md`. Capture at least:

```text
desktop 1365x768: airport drawer open on RKSI, current-weather tab
desktop 1920x1080: airport drawer open on RKSI, current-weather tab
mobile 390x844: airport drawer open on RKSI, current-weather tab
```

Store under:

```text
artifacts/responsive-screenshots/airport-current-weather-tab/<YYYY-MM-DD_HHMM_after>/
```

Include a README or manifest with:

```text
capture time
branch and commit
viewport matrix
commands used
known limitations
```

- [ ] **Step 5: Read-only UI QA review**

Ask a UI QA reviewer or design reviewer to inspect the screenshots for:

```text
warning/METAR/TAF order is correct
desktop section ratio reads as 1:4:4
warning colors and paged text method match monitoring banner intent
RVR/gust/rainfall appear only as secondary text inside their parent cards
TAF shows timeline only
TAF current valid slot is not dropped
no text overlap or horizontal overflow in airport drawer
```

Apply only focused CSS fixes if the review finds issues.

---

### Task 6: Architecture Map And Final Verification

**Files:**
- Modify: `Architecture.md`

- [ ] **Step 1: Update file roles**

In `Architecture.md`, add these file roles in the airport-panel section:

```text
- `frontend/src/features/airport-panel/tabs/CurrentWeatherTab.jsx` -> compact default airport drawer weather summary for warning, METAR, and next-6-hour TAF.
- `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js` -> current-weather tab warning, compact METAR, RVR, and next-6-hour TAF view-model helpers.
```

- [ ] **Step 2: Run final focused verification**

Run:

```powershell
node --test frontend/src/features/airport-panel/lib/currentWeatherViewModel.test.js
```

Expected: pass.

Run:

```powershell
npm.cmd run test:airport-panel --prefix frontend
```

Expected: pass.

Run:

```powershell
npm.cmd run build
```

Working directory: `frontend`

Expected: pass.

- [ ] **Step 3: Check final diff**

Run:

```powershell
git diff -- frontend/src/features/airport-panel docs/superpowers Architecture.md
```

Expected:

- Only the current-weather tab plan/spec/implementation, airport-panel CSS, and Architecture file-role updates changed.
- No backend/API changes.
- No monitoring legacy stylesheet import into the airport panel.

---

## Self-Review Checklist

- Spec coverage:
  - New default tab: Task 3.
  - Fixed warning -> METAR -> TAF order: Task 2.
  - `1fr 4fr 4fr` desktop ratio: Task 4.
  - Monitoring warning colors and paged text method: Tasks 2 and 4.
  - Compact METAR with RVR/gust/rain secondary placement: Tasks 1 and 2.
  - TAF timeline only and next-six-hour overlap filter: Tasks 1 and 2.
  - No new warningTypes/API flow: Task 1.
  - Screenshot evidence: Task 5.
- Placeholder scan:
  - No placeholder markers or undefined future steps.
- Type consistency:
  - Component imports match Task 1 exports.
  - `CurrentWeatherTab` props match `AirportPanel.jsx` data flow.
  - CSS class names match JSX class names.
