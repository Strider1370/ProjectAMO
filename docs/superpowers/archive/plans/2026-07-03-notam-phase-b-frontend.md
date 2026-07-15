# NOTAM Phase B — Frontend UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consume the Phase A `GET /api/notam` snapshot in the frontend and surface NOTAMs on three surfaces — (A) a sidebar global NOTAM panel with category filter + map layer, (B) the airport-panel NOTAM tab with a nationwide-FIR section, and the map layers themselves — with color = time-state (not severity) and colorblind-safe shape cues.

**Architecture:** New `frontend/src/features/notam/` feature module. Pure view-model + GeoJSON helpers are unit-tested (`node --test` via the frontend test runner); Mapbox source/layer writes mirror the existing `advisoryLayers.js` pattern and are driven from `MapView.jsx` through a single `useStyleSyncedEffect` line per ADR 0001 (no new `useEffect` in MapView). The NOTAM master on/off is one `MET_LAYERS` toggle (`metVisibility.notam`); the 7 category tiles are a local filter applied as a Mapbox `filter` expression.

**Tech Stack:** React, Mapbox GL JS, `node --test` + `node:assert/strict` (frontend test runner already configured), Tabler/lucide icons.

---

## Required Reading Before Starting

- `docs/superpowers/specs/2026-07-03-notam-integration-design.md` — the design spec. **The canonical `/api/notam` item shape is frozen in Phase A plan "Global Constraints"; treat it as the input contract.**
- `docs/superpowers/specs/refs/2026-07-03-notam-ui-mockup.html` — the visual reference for all four surfaces (open in a browser). Structure, table columns, badge glyphs, tile grid come from here.
- **`docs/design/design-language.md` — the design constitution (single source of truth for tokens, color, typography Pretendard, responsive rules). All UI tasks MUST take token/color/size values from here + the spec's accessibility section, NOT from the mockup's local `:root` (those are mockup-only placeholders).**
- `Architecture.md` §"Adding a map overlay/layer" + `docs/adr/0001-mapview-layer-gravity.md` — layer sync belongs in the feature module as a hook/sync helper, driven by one `useStyleSyncedEffect` line in MapView.
- `EntryPoints.md` #3 (wire a sidebar panel) and #4 (add a MET overlay) — the two integration recipes this plan follows.

## Input Contract (from Phase A `/api/notam`)

```
{ fetched_at: ISO, horizon_hours: 24, items: [ {
  id, series, location, qcode, category, scope: 'airport'|'fir',
  valid_from: ISO, valid_to: ISO,
  altitude: { lower, upper, unit: 'FL'|'FT', ref: 'AGL'|'AMSL'|null } | null,
  summary, rawText, geometry: { type:'Point'|'Polygon'|'LineString', coordinates } | null
} ] }
```

Category enum (fixed): `prohibited` · `firing` · `danger` · `restricted` · `obstacle` · `facility` · `other`.

## Accessibility Requirements (spec §접근성, MANDATORY — bake into the components, do not defer)

1. **Time-state never by color alone (colorblind).** List badges = color + shape glyph (`●` active / `◐` soon / `○` upcoming) + text. Map markers = color + shape (filled / half / outline).
2. **Safety-critical values (altitude, summary) not dimmed.** Altitude/summary text ≥ `--text-2`, ≥ 11px. Altitude keeps its AGL/AMSL label always.
3. **Active category tile explicit.** On tile = filled accent tint + accent border + accent icon/text + check (✓); reuse `AviationLayerPanel`'s `.layer-tile.is-active` pattern. Show a "N개 켜짐" count. Not opacity-only.
4. amber uses `--amber` (spec: #8a3d0b), ≥ 11px. Filter toggles have `aria-pressed`; the master switch has `role="switch"` + `aria-checked`.

## File Structure

**Create (feature module):**
- `frontend/src/features/notam/lib/notamViewModel.js` — pure: `deriveTimeState`, `formatAltitude`, `sortActiveFirst`, `NOTAM_CATEGORIES` metadata (icon/label/order), time-state glyph/label. Consumed by panel + tab + geojson.
- `frontend/src/features/notam/lib/notamGeoJson.js` — pure: payload → GeoJSON FeatureCollection with category + time-state properties; **excludes `scope:'fir'`**.
- `frontend/src/features/notam/lib/notamLayers.js` — Mapbox source/layer install/sync/visibility/category-filter; owns `NOTAM_SOURCE_IDS`/`NOTAM_LAYER_IDS`. Mirrors `advisoryLayers.js`.
- `frontend/src/features/notam/NotamPanel.jsx` — (A) global sidebar panel.
- `frontend/src/features/airport-panel/tabs/NotamTab.jsx` — (B) airport tab + FIR global section.
- Tests: `frontend/src/features/notam/lib/notamViewModel.test.js`, `notamGeoJson.test.js`.

**Modify:**
- `frontend/src/api/weatherApi.js` — add `fetchNotam()` + fold `notam` into deferred/changed dataset loading.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — add `{ id: 'notam', label: 'NOTAM', color }` to `MET_LAYERS`.
- `frontend/src/app/layout/Sidebar.jsx` — re-add NOTAM to `topItems` + `PANEL_MAP`.
- `frontend/src/app/layout/MobileMoreMenu.jsx` — re-enable NOTAM entry.
- `frontend/src/app/App.jsx` — hold `notam` data + `activePanel==='notam'` wiring; pass to MapView/NotamPanel.
- `frontend/src/features/map/MapView.jsx` — `activePanel==='notam'` panel render + ONE `useStyleSyncedEffect(... syncNotamLayers ...)`; hold `notamCategoryFilter` + `notamMasterOn` UI state (co-located like existing `openAdvisoryPanel`).
- `frontend/src/features/airport-panel/AirportPanel.jsx` — add `{ id:'notam', label:'NOTAM' }` to `TABS_FULL`/`TABS_LIMITED` + render `NotamTab`.

**Scope note:** Route-briefing NOTAM integration (`routeNotams`/`routeConflicts`/banner/hazardLayers RULEBOOK) is **Phase C**, not here. This plan's map layer + `MET_LAYERS` registration is the prerequisite Phase C depends on.

---

### Task 1: API client — `fetchNotam()` + fold into the initial weather bundle

**Files:**
- Modify: `frontend/src/api/weatherApi.js`

**Reviewer-corrected structure (verified):** `sigmet`/`amos`/`warning` are NOT deferred — they load in the initial `Promise.all()` inside `loadWeatherData()` (~L99-140) and are returned as flat keys on the bundle object. `DEFERRED_WEATHER_FETCHERS` (~L145) holds only `sigwxLowHistory`/`groundOverview`/`environment`/`airportInfo`/`adsb`. NOTAM belongs in the **initial bundle**, not deferred.

- [ ] **Step 1: Add the standalone fetch export** (used by the changed-dataset loader; near the other `fetch*` exports):
```javascript
export async function fetchNotam() {
  return fetchJson('/api/notam', { optional: true })
}
```

- [ ] **Step 2: Add `notam` to the initial `loadWeatherData()` bundle**

In `loadWeatherData()`: add `fetchJson('/api/notam', { optional: true })` to the initial `Promise.all([...])`, bind it to a `notam` variable in the destructuring array, and add `notam,` to the returned object (alongside `sigmet`, `amos`, `warning`). Match the exact surrounding style; do not restructure.

- [ ] **Step 3: Add `notam` to the changed-dataset loader**

In the changed loader (`loadChangedWeatherData(changes, ...)`, ~L227-272), add alongside the `changes.sigmet`/`changes.amos` lines:
```javascript
if (changes.notam) { fetches.push(fetchJson('/api/notam', { optional: true })); keys.push('notam') }
```
The caller (`useWeatherPolling` via snapshot-meta diffing) decides which datasets changed and passes `changes` — do NOT modify change-detection logic here; `notam` snapshot-meta is already registered backend-side.

- [ ] **Step 3: Verify build + no unused-import lint**

Run: `npm.cmd run build --prefix frontend`
Expected: build succeeds. (No dedicated unit test — this mirrors the untested sibling fetchers; behavior is verified by the panel rendering in Task 9.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/weatherApi.js
git commit -m "feat(notam): fetchNotam client + deferred/changed dataset wiring"
```

---

### Task 2: Time-state + altitude view model (pure, TDD)

**Files:**
- Create: `frontend/src/features/notam/lib/notamViewModel.js`
- Test: `frontend/src/features/notam/lib/notamViewModel.test.js`

**Interfaces:**
- `deriveTimeState(validFrom, validTo, nowMs, soonWindowMs?) → 'active'|'soon'|'upcoming'`
- `formatAltitude(altitude) → string` — AGL/AMSL preserved; SFC(0)→unlimited(999 FL) → "전고도".
- `TIME_STATE = { active:{glyph:'●',label:'발효 중',key:'active'}, soon:{glyph:'◐',label:'곧 발효'}, upcoming:{glyph:'○',label:'예정'} }`
- `NOTAM_CATEGORIES` — ordered array `[{ id, label, icon }]` for the 7 categories (order from mockup: 금지/사격/위험/제한/장애물/시설/기타).
- `sortActiveFirst(items, nowMs) → items` — active → soon → upcoming, stable within.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/notam/lib/notamViewModel.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deriveTimeState, formatAltitude, sortActiveFirst, NOTAM_CATEGORIES } from './notamViewModel.js'

const SOON = 2 * 60 * 60 * 1000

test('deriveTimeState: active when now within [from,to]', () => {
  const from = Date.parse('2026-07-03T00:00:00Z')
  const to = Date.parse('2026-07-03T12:00:00Z')
  assert.equal(deriveTimeState(from, to, Date.parse('2026-07-03T06:00:00Z'), SOON), 'active')
})

test('deriveTimeState: soon when from within soon window', () => {
  const from = Date.parse('2026-07-03T06:00:00Z')
  const to = Date.parse('2026-07-03T12:00:00Z')
  const now = Date.parse('2026-07-03T05:00:00Z') // 1h before from, inside 2h window
  assert.equal(deriveTimeState(from, to, now, SOON), 'soon')
})

test('deriveTimeState: upcoming when from beyond soon window', () => {
  const from = Date.parse('2026-07-03T12:00:00Z')
  const to = Date.parse('2026-07-03T18:00:00Z')
  const now = Date.parse('2026-07-03T06:00:00Z') // 6h before
  assert.equal(deriveTimeState(from, to, now, SOON), 'upcoming')
})

test('formatAltitude: SFC to unlimited FL → 전고도', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 999, unit: 'FL', ref: null }), '전고도')
})

test('formatAltitude: FT band keeps AGL/AMSL label', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 4920, unit: 'FT', ref: 'AGL' }), 'SFC–4,920FT AGL')
  assert.equal(formatAltitude({ lower: 4000, upper: 6000, unit: 'FT', ref: 'AMSL' }), '4,000–6,000FT AMSL')
})

test('formatAltitude: FT band with null ref → no trailing label', () => {
  assert.equal(formatAltitude({ lower: 0, upper: 4920, unit: 'FT', ref: null }), 'SFC–4,920FT')
})

test('formatAltitude: FL band', () => {
  assert.equal(formatAltitude({ lower: 100, upper: 200, unit: 'FL', ref: null }), 'FL100–FL200')
})

test('formatAltitude: null → empty', () => {
  assert.equal(formatAltitude(null), '')
})

test('NOTAM_CATEGORIES: 7 categories in mockup order', () => {
  assert.deepEqual(NOTAM_CATEGORIES.map((c) => c.id),
    ['prohibited', 'firing', 'danger', 'restricted', 'obstacle', 'facility', 'other'])
})

test('sortActiveFirst: active before soon before upcoming', () => {
  const now = Date.parse('2026-07-03T06:00:00Z')
  const mk = (id, from, to) => ({ id, valid_from: from, valid_to: to })
  const items = [
    mk('up', '2026-07-03T12:00:00Z', '2026-07-03T18:00:00Z'),   // upcoming
    mk('act', '2026-07-03T00:00:00Z', '2026-07-03T12:00:00Z'),  // active
    mk('soon', '2026-07-03T07:00:00Z', '2026-07-03T09:00:00Z'), // soon
  ]
  assert.deepEqual(sortActiveFirst(items, now).map((i) => i.id), ['act', 'soon', 'up'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/notam/lib/notamViewModel.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the view model**

Create `frontend/src/features/notam/lib/notamViewModel.js`:
```javascript
// 시간상태(색의 유일한 축) + 고도 포맷(AGL/AMSL 기준면 보존). 순수 함수, 렌더 시점 계산.
export const SOON_WINDOW_MS = 2 * 60 * 60 * 1000 // "곧 발효" 판정 임계값(config 상수)

export const TIME_STATE = {
  active:   { key: 'active',   glyph: '●', label: '발효 중' },
  soon:     { key: 'soon',     glyph: '◐', label: '곧 발효' },
  upcoming: { key: 'upcoming', glyph: '○', label: '예정' },
}

// 카테고리는 아이콘 + 라벨로만 구분(색과 무관). 아이콘 키는 NotamPanel/Tab에서 tabler로 매핑.
export const NOTAM_CATEGORIES = [
  { id: 'prohibited', label: '금지',   icon: 'ban' },
  { id: 'firing',     label: '사격',   icon: 'target-arrow' },
  { id: 'danger',     label: '위험',   icon: 'alert-triangle' },
  { id: 'restricted', label: '제한',   icon: 'shield-half' },
  { id: 'obstacle',   label: '장애물', icon: 'antenna' },
  { id: 'facility',   label: '시설',   icon: 'broadcast' },
  { id: 'other',      label: '기타',   icon: 'dots' },
]

export function deriveTimeState(validFrom, validTo, nowMs, soonWindowMs = SOON_WINDOW_MS) {
  const from = typeof validFrom === 'number' ? validFrom : Date.parse(validFrom)
  const to = typeof validTo === 'number' ? validTo : Date.parse(validTo)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 'upcoming'
  if (nowMs >= from && nowMs <= to) return 'active'
  if (nowMs < from && from - nowMs <= soonWindowMs) return 'soon'
  return 'upcoming'
}

function comma(n) {
  return Number(n).toLocaleString('en-US')
}

// SFC(0)~무제한(FL 999 등) → "전고도". 그 외 실제 범위. FT는 AGL/AMSL 라벨 보존, FL은 FLxxx.
export function formatAltitude(altitude) {
  if (!altitude) return ''
  const { lower, upper, unit, ref } = altitude
  if (unit === 'FL' && Number(lower) === 0 && Number(upper) >= 999) return '전고도'
  if (unit === 'FL') return `FL${lower}–FL${upper}`
  const lo = Number(lower) === 0 ? 'SFC' : comma(lower)
  const hi = `${comma(upper)}FT`
  const label = ref ? ` ${ref}` : '' // AGL/AMSL 라벨은 있을 때만; 기준면 불명이면 라벨 없이 값만(spec 안전 규칙)
  return `${lo}–${hi}${label}`
}

const RANK = { active: 0, soon: 1, upcoming: 2 }
export function sortActiveFirst(items, nowMs) {
  return [...items].sort((a, b) =>
    RANK[deriveTimeState(a.valid_from, a.valid_to, nowMs)] -
    RANK[deriveTimeState(b.valid_from, b.valid_to, nowMs)])
}

export default { deriveTimeState, formatAltitude, sortActiveFirst, NOTAM_CATEGORIES, TIME_STATE, SOON_WINDOW_MS }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/features/notam/lib/notamViewModel.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/notam/lib/notamViewModel.js frontend/src/features/notam/lib/notamViewModel.test.js
git commit -m "feat(notam): time-state + altitude view model (colorblind-safe glyphs)"
```

---

### Task 3: GeoJSON conversion (pure, TDD) — excludes FIR scope

**Files:**
- Create: `frontend/src/features/notam/lib/notamGeoJson.js`
- Test: `frontend/src/features/notam/lib/notamGeoJson.test.js`

**Interfaces:**
- `notamToFeatureCollection(payload, nowMs) → FeatureCollection` — one feature per item **with geometry** and **`scope!=='fir'`**. Each feature `properties`: `{ id, category, timeState, summary, altitude(formatted), location }`. `timeState` is precomputed for the Mapbox color/shape expressions.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/notam/lib/notamGeoJson.test.js`:
```javascript
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notamToFeatureCollection } from './notamGeoJson.js'

const now = Date.parse('2026-07-03T06:00:00Z')
const base = {
  fetched_at: '2026-07-03T06:00:00Z', horizon_hours: 24,
  items: [
    { id: 'G1/26', category: 'restricted', scope: 'airport', location: 'RKSI',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'GPS RAIM',
      geometry: { type: 'Polygon', coordinates: [[[126,37],[127,37],[127,38],[126,38],[126,37]]] } },
    { id: 'D9/26', category: 'danger', scope: 'fir', location: 'RKRR',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-04T00:00:00Z',
      altitude: null, summary: 'FIR-wide', geometry: { type: 'Polygon', coordinates: [[[124,33],[132,33],[132,39],[124,39],[124,33]]] } },
    { id: 'A2/26', category: 'facility', scope: 'airport', location: 'RKSS',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: null, summary: 'no geom', geometry: null },
    { id: 'L5/26', category: 'danger', scope: 'airport', location: 'RKPC',
      valid_from: '2026-07-03T00:00:00Z', valid_to: '2026-07-03T12:00:00Z',
      altitude: null, summary: 'corridor', geometry: { type: 'LineString', coordinates: [[126,35],[127,36]] } },
  ],
}

test('excludes scope:fir and null-geometry items', () => {
  const fc = notamToFeatureCollection(base, now)
  assert.equal(fc.type, 'FeatureCollection')
  const ids = fc.features.map((f) => f.properties.id)
  assert.ok(!ids.includes('D9/26'), 'FIR scope excluded from map')
  assert.ok(!ids.includes('A2/26'), 'null-geometry excluded')
})

test('keeps LineString geometry (map/tab exposure; only briefing-matching excludes it)', () => {
  const fc = notamToFeatureCollection(base, now)
  const line = fc.features.find((f) => f.properties.id === 'L5/26')
  assert.ok(line, 'LineString NOTAM survives GeoJSON conversion')
  assert.equal(line.geometry.type, 'LineString')
})

test('feature carries category + precomputed timeState + formatted altitude', () => {
  const f = notamToFeatureCollection(base, now).features[0]
  assert.equal(f.properties.category, 'restricted')
  assert.equal(f.properties.timeState, 'active')
  assert.equal(f.properties.altitude, '전고도')
  assert.equal(f.geometry.type, 'Polygon')
})

test('empty / missing payload → empty collection', () => {
  assert.deepEqual(notamToFeatureCollection(null, now).features, [])
  assert.deepEqual(notamToFeatureCollection({ items: [] }, now).features, [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/notam/lib/notamGeoJson.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the converter**

Create `frontend/src/features/notam/lib/notamGeoJson.js`:
```javascript
import { deriveTimeState, formatAltitude } from './notamViewModel.js'

// 백엔드 페이로드 → GeoJSON. scope:'fir'(전국 폴리곤)과 지오메트리 없는 항목은 지도에서 제외.
// (FIR 342건을 다 그리면 화면이 붉게 뒤덮임 — 리스트에서만 노출. spec FIR 광역 스코프 참조.)
export function notamToFeatureCollection(payload, nowMs = Date.now()) {
  const items = Array.isArray(payload?.items) ? payload.items : []
  return {
    type: 'FeatureCollection',
    features: items
      .filter((it) => it?.scope !== 'fir' && it?.geometry?.type && it?.geometry?.coordinates)
      .map((it) => ({
        type: 'Feature',
        id: it.id,
        properties: {
          id: it.id,
          category: it.category || 'other',
          timeState: deriveTimeState(it.valid_from, it.valid_to, nowMs),
          summary: it.summary || '',
          altitude: formatAltitude(it.altitude),
          location: it.location || '',
        },
        geometry: it.geometry,
      })),
  }
}

export default { notamToFeatureCollection }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/features/notam/lib/notamGeoJson.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/notam/lib/notamGeoJson.js frontend/src/features/notam/lib/notamGeoJson.test.js
git commit -m "feat(notam): GeoJSON conversion (excludes FIR scope + null geometry)"
```

---

### Task 4: Zoom-transition spike (marker↔polygon) — DELETE after

**Why:** The spec (§지도 렌더링) notes there is **no precedent** in this codebase for a same-source marker↔polygon zoom transition, and asks to verify with a spike before Task 5. This de-risks Task 5's layer definitions.

**Files:**
- Create (throwaway): `frontend/scripts/_spike-notam-zoom.mjs`

- [ ] **Step 1: Write a minimal Playwright spike** that installs a GeoJSON source with one Polygon + one Point feature, adds (a) a `fill` layer with `minzoom: 9`, (b) a `symbol`/`circle` marker layer with `maxzoom: 9`, then asserts via `map.getZoom()` transitions that only one is visible at z=6 vs z=11. Follow `docs/dev-server-and-capture.md` for launching. (Reuse an existing Playwright script under `frontend/` as the harness template.)

- [ ] **Step 2: Run the spike and record the result.** Expected output: at z≈6 only the marker layer renders (polygon hidden), at z≈11 only the polygon/line renders (marker hidden) — confirming a clean split at the boundary. Record the confirmed values (starting hypothesis `minzoom: 9` on fill/line, `maxzoom: 9` on marker) as a comment at the top of Task 5's `notamLayers.js`. If the boundary flickers/overlaps, adjust the split (e.g. marker `maxzoom: 8.5`, fill `minzoom: 8.5`) and record the working numbers.

- [ ] **Step 3: Delete the spike.**
```bash
rm -f frontend/scripts/_spike-notam-zoom.mjs
```
(No commit — throwaway. The learning lands in Task 5.)

---

### Task 5: Mapbox NOTAM layers (`notamLayers.js`) — mirrors advisoryLayers.js

**Files:**
- Create: `frontend/src/features/notam/lib/notamLayers.js`

**Interfaces (mirror `advisoryLayers.js` exports):**
- `NOTAM_SOURCE_IDS`, `NOTAM_LAYER_IDS` — ownership arrays (for MapView style-reload cleanup tests).
- `addNotamLayers(map, featureData)` — install source + polygon fill/line + point marker layers; color = time-state (`●/◐/○` semantics via filled/half/outline paint), category via icon; `minzoom`/`maxzoom` split from Task 4.
- `updateNotamLayerData(map, featureData)` — install-then-`setData`.
- `setNotamVisibility(map, isVisible)` — master on/off (all NOTAM layers).
- `setNotamCategoryFilter(map, activeCategoryIds)` — apply Mapbox `filter` `['in', ['get','category'], ['literal', activeCategoryIds]]` to every NOTAM layer.

- [ ] **Step 1: Write the layer module**

Create `frontend/src/features/notam/lib/notamLayers.js`. **Color = time-state only (red active / amber soon / gray upcoming), uniform across categories.** Hex values confirmed from `docs/design/design-language.md` §5 tokens — reuse the existing `--level-*` scale (same palette as flight-category/advisory):
```javascript
// 시간상태 3색(카테고리 무관 균일). design-language.md §5: --level-red/amber/gray.
const LEVEL = { red: '#c0291f', amber: '#92400e', gray: '#475569' }
const TIME_COLOR = [
  'match', ['get', 'timeState'],
  'active', LEVEL.red,
  'soon', LEVEL.amber,
  /* upcoming */ LEVEL.gray,
]

export const NOTAM_SOURCE_IDS = ['notam-src']
export const NOTAM_LAYER_IDS = ['notam-fill', 'notam-line', 'notam-marker']

export function addNotamLayers(map, featureData) {
  if (!map.getSource('notam-src')) {
    map.addSource('notam-src', { type: 'geojson', data: featureData })
  }
  // 폴리곤/라인은 확대(z≥9)에서만, 마커는 축소에서(전국 카테고리 아이콘). split은 Task 4 스파이크로 확정.
  if (!map.getLayer('notam-fill')) {
    map.addLayer({
      id: 'notam-fill', type: 'fill', source: 'notam-src', slot: 'top', minzoom: 9,
      paint: { 'fill-color': TIME_COLOR, 'fill-opacity': 0.14 },
      filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']],
    })
  }
  if (!map.getLayer('notam-line')) {
    map.addLayer({
      id: 'notam-line', type: 'line', source: 'notam-src', slot: 'top', minzoom: 9,
      paint: { 'line-color': TIME_COLOR, 'line-width': 2, 'line-opacity': 0.9 },
    })
  }
  if (!map.getLayer('notam-marker')) {
    // 형태 단서(색맹 대비): 발효중=채운 원 / 곧발효=반채움 / 예정=외곽선만.
    map.addLayer({
      id: 'notam-marker', type: 'circle', source: 'notam-src', slot: 'top', maxzoom: 9,
      paint: {
        'circle-color': ['match', ['get', 'timeState'], 'upcoming', 'rgba(0,0,0,0)', TIME_COLOR],
        'circle-stroke-color': TIME_COLOR,
        'circle-stroke-width': 2,
        'circle-radius': 6,
      },
    })
  }
  if (map.getLayer('notam-marker') && typeof map.moveLayer === 'function') map.moveLayer('notam-marker')
}

export function updateNotamLayerData(map, featureData) {
  addNotamLayers(map, featureData)
  map.getSource('notam-src')?.setData(featureData)
}

export function setNotamVisibility(map, isVisible) {
  const v = isVisible ? 'visible' : 'none'
  for (const id of NOTAM_LAYER_IDS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v)
}

export function setNotamCategoryFilter(map, activeCategoryIds) {
  const catFilter = ['in', ['get', 'category'], ['literal', activeCategoryIds]]
  const withGeom = (base) => ['all', base, catFilter]
  if (map.getLayer('notam-fill')) map.setFilter('notam-fill', withGeom(['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'MultiPolygon']]))
  if (map.getLayer('notam-line')) map.setFilter('notam-line', catFilter)
  if (map.getLayer('notam-marker')) map.setFilter('notam-marker', catFilter)
}

export default { NOTAM_SOURCE_IDS, NOTAM_LAYER_IDS, addNotamLayers, updateNotamLayerData, setNotamVisibility, setNotamCategoryFilter }
```

**ponytail:** category tiles use a `circle` marker (not per-category symbol icons) for v1 — colorblind-safe shape + time color already carry the safety signal; per-category map symbols are a polish follow-up. Add when a design pass provides the 7 symbol SVGs. (Spec allows "구체 심볼은 구현 단계에서 확정".)

- [ ] **Step 2: Verify build**

Run: `npm.cmd run build --prefix frontend`
Expected: build succeeds (no unit test — Mapbox writes are integration-verified in Task 9's browser smoke, matching how `advisoryLayers.js` is verified).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/notam/lib/notamLayers.js
git commit -m "feat(notam): Mapbox layers — time-state color, colorblind shape, zoom split"
```

---

### Task 6: Register NOTAM master toggle in `MET_LAYERS`

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` (`MET_LAYERS` array, ~L110-123)

- [ ] **Step 1: Add the toggle entry**

The `MET_LAYERS` `color` is only the panel chip swatch (single color); the NOTAM map layers use the time-state 3-color scheme separately (Task 5). Use the `--accent` token `#334155` (matches the "항공정보/NOTAM" identity in the mockup header):
```javascript
  { id: 'notam', label: 'NOTAM', color: '#334155' },
```

- [ ] **Step 2: Verify build + existing hazardLayers test still green**

Run: `npm.cmd run build --prefix frontend`
Then: `node --test frontend/src/features/route-briefing/lib/hazardLayers.test.js`
Expected: build OK; hazardLayers test PASS (registering the id keeps `MET_LAYERS`↔RULEBOOK sync intact — Phase C will add the RULEBOOK rule).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
git commit -m "feat(notam): register NOTAM master toggle in MET_LAYERS"
```

---

### Task 7: Global NOTAM panel — `NotamPanel.jsx` (surface A)

**Files:**
- Create: `frontend/src/features/notam/NotamPanel.jsx`

**Interface (props):** `{ payload, selectedAirport, categoryFilter, onCategoryToggle, masterOn, onMasterToggle, nowMs, tz }`. `payload` = `/api/notam` response.

- [ ] **Step 1: Build the panel** following the mockup surface (A) structure exactly (open `refs/2026-07-03-notam-ui-mockup.html`), with these regions top→bottom:
  1. Header: "NOTAM" + master switch (`role="switch"` `aria-checked={masterOn}`, `onMasterToggle`).
  2. Data-horizon strip: "향후 {payload.horizon_hours}시간 기준 · {fmt(payload.fetched_at, tz)} 수집".
  3. Time-state legend: `TIME_STATE` glyph + color + label (active/soon/upcoming).
  4. Category filter tiles: `NOTAM_CATEGORIES.map(...)` as a tile grid; on-state = `AviationLayerPanel` `.layer-tile.is-active` pattern (accent tint + border + ✓, `aria-pressed`); header shows "N개 켜짐".
  5. `selectedAirport` priority section (if set): items where `item.location === selectedAirport`, above the table.
  6. Dense table (mirror `ap-taf-table` styling): columns 구분(icon+label) / 공항(location or "전역 공지" when `scope==='fir'`) / 요약 / 고도(`formatAltitude`) / 상태(time-state badge glyph+color+text). Rows sorted `sortActiveFirst`; filtered by `categoryFilter`. Chunked "더 보기" (initial 15).

  **Accessibility:** altitude/summary ≥ `--text-2`, ≥ 11px; amber via `--amber`; row `cursor:pointer` + hover + chevron for raw-text expand (원문 = `item.rawText`, untouched).

  Use `deriveTimeState`/`formatAltitude`/`sortActiveFirst`/`NOTAM_CATEGORIES`/`TIME_STATE` from `notamViewModel.js`. Icons: map `category.icon` to tabler (`ti ti-*`) as in the mockup.

- [ ] **Step 2: Verify build**

Run: `npm.cmd run build --prefix frontend`
Expected: build succeeds. (Rendering/interaction verified in Task 9 browser smoke.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/notam/NotamPanel.jsx
git commit -m "feat(notam): global NOTAM panel — filter tiles, dense table, horizon disclosure"
```

---

### Task 8: Airport NOTAM tab — `NotamTab.jsx` (surface B)

**Files:**
- Create: `frontend/src/features/airport-panel/tabs/NotamTab.jsx`
- Modify: `frontend/src/features/airport-panel/AirportPanel.jsx` (`TABS_FULL`/`TABS_LIMITED` ~L24-37, render block ~L122-126)

**Interface:** `NotamTab({ notam, icao, tz, nowMs })` — `notam` = `/api/notam` payload.

- [ ] **Step 1: Build the tab** following mockup surface (B):
  - Airport list: items where `item.location === icao` (exact match), as cards (icon + category label + time-state badge + `id` + `formatAltitude` + summary + "원문 보기" chevron → `rawText`).
  - "전역 공지(인천FIR) · N건" section below: items where `item.scope === 'fir'` (regardless of `icao`), compact rows with time-state badge.
  - Empty state: reuse `ap-empty` when no airport items AND no FIR items.
  - Sort each group `sortActiveFirst`.

- [ ] **Step 2: Register the tab in AirportPanel**

**Reviewer-corrected (verified):** `AirportPanel({ airport, weatherData, onClose, onRequestDeferredWeatherData })` reads datasets nested from the single `weatherData` object (e.g. `weatherData?.metar`), NOT individual props. So **do not add a `notam` prop to AirportPanel** — read `weatherData?.notam`. Since Task 1 adds `notam` to the bundle, `weatherData.notam` already exists; no signature change, no App.jsx edit for this.

Add `{ id: 'notam', label: 'NOTAM' }` to both `TABS_FULL` and `TABS_LIMITED`, import `NotamTab`, and add to the render block right after the existing `{tab === 'info' && <AirportInfoTab .../>}` line (~L126):
```javascript
{tab === 'notam' && <NotamTab notam={weatherData?.notam || null} icao={icao} tz={tz} nowMs={Date.now()} />}
```
(`tz` is already available in AirportPanel where the other tabs read it; if not in scope, thread it the same way `MetarTab` receives its display context.)

- [ ] **Step 3: Verify build**

Run: `npm.cmd run build --prefix frontend`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/airport-panel/tabs/NotamTab.jsx frontend/src/features/airport-panel/AirportPanel.jsx
git commit -m "feat(notam): airport NOTAM tab + nationwide FIR section"
```

---

### Task 9: Map click + overlap popup (surface D) — reuse SIGMET popup pattern

**Why:** Spec §지도 팝업/겹침 처리 + accessibility item 5, shown as mockup surface (D). NOTAM markers/polygons overlap at low zoom; a click must resolve all candidates at the point, not just the top feature.

**Files:**
- Modify: `frontend/src/features/notam/lib/notamLayers.js` (add click-binding + popup HTML helper)
- Modify: `frontend/src/features/map/MapView.jsx` (bind on the NOTAM layers via the existing cleanup-aware event pattern, like `advisoryEventCleanupRef`)

**Interface:**
- `bindNotamPopup(map, { onOpenPanelAt }) → cleanupFn` — on click over `NOTAM_LAYER_IDS`, run `map.queryRenderedFeatures(point, { layers: NOTAM_LAYER_IDS })`; dedupe by `properties.id`.

- [ ] **Step 1: Implement the overlap-aware popup** in `notamLayers.js`, matching mockup surface (D):
  - **1 feature:** popup shows category icon + label + `id` + time-state badge(glyph+color+text) + summary + `formatAltitude`.
  - **2–3 features:** mini-list header "이 지점에 N건" + one row each (icon + label + `id` + time badge + summary), each row expandable.
  - **4+ features:** header "이 지점에 N건" + top 3 rows + a "전체 목록에서 보기 →" link that calls `onOpenPanelAt(location)` (opens `NotamPanel` and scrolls/filters to that location — reuse the spec §6-P3 "table over map-popup for scanning" rationale).
  - Use cleanup-aware binding from `frontend/src/features/map/lib/mapStyleSync.js` so handlers survive style reloads (same as advisory popups). Badges keep glyph+text (colorblind), not color alone.

  Popup HTML builder sketch (transcribe mockup surface D structure; `TIME_STATE`/`formatAltitude` from `notamViewModel.js`):
  ```javascript
  function notamPopupHtml(features) {
    const rows = features.slice(0, features.length <= 3 ? features.length : 3).map((f) => {
      const p = f.properties
      const ts = TIME_STATE[p.timeState]
      return `<div class="notam-pop-row"><span class="cat">${catLabel(p.category)}</span>
        <span class="id">${p.id}</span>
        <span class="ts ts-${ts.key}">${ts.glyph} ${ts.label}</span>
        <div class="sum">${p.summary}${p.altitude ? ' · ' + p.altitude : ''}</div></div>`
    }).join('')
    const header = features.length === 1 ? '' : `<div class="notam-pop-head">이 지점에 ${features.length}건</div>`
    const more = features.length > 3
      ? `<a class="notam-pop-more" data-loc="${features[0].properties.location}">전체 목록에서 보기 →</a>` : ''
    return `<div class="notam-pop">${header}${rows}${more}</div>`
  }
  ```
  Wire the `.notam-pop-more` click to `onOpenPanelAt(location)`. Style classes live in the feature's CSS; take colors from the `--level-*` tokens.

- [ ] **Step 2: Bind/unbind in MapView** alongside the existing advisory popup binding — store the cleanup in a ref (mirror `advisoryEventCleanupRef`) and re-bind inside the same NOTAM `useStyleSyncedEffect` (Task 10 Step 3) so it re-attaches after style reload. `onOpenPanelAt` sets `activePanel='notam'` + a `notamFocusLocation` state consumed by `NotamPanel`.

- [ ] **Step 3: Verify build**

Run: `npm.cmd run build --prefix frontend`
Expected: build succeeds (interaction verified in Task 10 browser smoke).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/notam/lib/notamLayers.js frontend/src/features/map/MapView.jsx
git commit -m "feat(notam): map click + overlap popup (1 / 2-3 mini-list / 4+ see-all)"
```

---

### Task 10: Wire panel + map into the app shell (integration + browser smoke)

**Files:**
- Modify: `frontend/src/app/App.jsx` (hold `notam` data from the weather bundle; `activePanel==='notam'` state; pass `notam` to MapView + AirportPanel)
- Modify: `frontend/src/app/layout/Sidebar.jsx` (re-add NOTAM to `topItems` + `PANEL_MAP`)
- Modify: `frontend/src/app/layout/MobileMoreMenu.jsx` (re-enable NOTAM entry)
- Modify: `frontend/src/features/map/MapView.jsx` (panel render + one `useStyleSyncedEffect`; `notamCategoryFilter`/`notamMasterOn` state)

- [ ] **Step 1: Re-add the sidebar entry**

In `Sidebar.jsx`, add to `topItems` (with the NOTAM icon, e.g. lucide `FileWarning`/`Bell` — match design), and add `NOTAM: 'notam'` to `PANEL_MAP`. Remove the "숨김" comment (L8). Do the equivalent re-enable in `MobileMoreMenu.jsx`.

- [ ] **Step 2: Pass data in App.jsx**

**Reviewer-corrected (verified):** App does NOT hold per-dataset state — it gets `weatherData` from `useWeatherPolling()` and threads it. `togglePanel` is generic (`setActivePanel(cur => cur === id ? null : id)`), so **no valid-panel whitelist to edit** — `'notam'` works once `PANEL_MAP` maps to it (Step 1). Two small edits:
- `AirportPanel` already receives `weatherData` (Task 8 reads `weatherData.notam`) — nothing to add.
- `MapView` receives **individual** dataset props (e.g. `sigmetData={weatherData?.sigmet}`); add `notamData={weatherData?.notam || null}` in the same `<MapView ...>` prop list (~L147-152).

- [ ] **Step 3: MapView panel render + single sync line (ADR 0001)**

In `MapView.jsx` (`notamData` is the prop added in Step 2):
- Co-locate `notamCategoryFilter` with the other MapView UI states — put it right after the `hiddenAdvisoryKeys` state (~L245, the advisory filter state), NOT with the cleanup refs: `const [notamCategoryFilter, setNotamCategoryFilter] = useState(NOTAM_CATEGORIES.map((c) => c.id))` (all on by default). Master on/off reuses `metVisibility.notam` (no new state).
- Build the feature collection with `useMemo`: `const notamFc = useMemo(() => notamToFeatureCollection(notamData, Date.now()), [notamData])`.
- ONE sync effect (no new bare `useEffect` — ADR 0001):
```javascript
useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
  updateNotamLayerData(map, notamFc)
  setNotamVisibility(map, metVisibility.notam)
  setNotamCategoryFilter(map, notamCategoryFilter)
}, [notamFc, metVisibility.notam, notamCategoryFilter])
```
- Under the panel-composition area (where `activePanel === 'route-check'` / advisory panels render), add `activePanel === 'notam'` → render `<NotamPanel payload={notamData} selectedAirport={selectedAirport} categoryFilter={notamCategoryFilter} onCategoryToggle={(id) => setNotamCategoryFilter((cur) => cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id])} masterOn={metVisibility.notam} onMasterToggle={() => toggleMet('notam')} nowMs={Date.now()} tz={tz} />`. Reuse the existing `toggleMet` so the map layer + panel master switch stay in sync.

- [ ] **Step 4: Full frontend build + unit tests**

Run: `npm.cmd run build --prefix frontend`
Then: `node --test frontend/src/features/notam/lib/notamViewModel.test.js frontend/src/features/notam/lib/notamGeoJson.test.js`
Expected: build OK; all NOTAM unit tests PASS.

- [ ] **Step 5: Browser smoke (Playwright, per `docs/dev-server-and-capture.md`)**

Start servers (`npm.cmd run dev:serve`) with the backend serving `/api/notam` (376 items live). Verify and capture screenshots for:
  1. Sidebar → NOTAM opens the global panel; category tiles toggle (on = accent+✓, count updates); table sorted active-first; horizon strip shows fetched time.
  2. Master switch off → map NOTAM layers hidden; on → visible. Category tile off → those features drop from the map.
  3. Zoom out (z≈6) shows category markers; zoom in (z≈11) shows polygons/lines (Task 4 split).
  4. Select an airport → NOTAM tab shows airport items + "전역 공지(FIR)" section.
  5. Click a map cluster/overlap point → popup resolves all candidates (1 / 2-3 mini-list / 4+ "전체 목록에서 보기" opening the panel). (Task 9)
  6. Colorblind check: badges show glyph (●◐○) + text, not color alone.
Store evidence under `artifacts/responsive-screenshots/notam-phase-b/<YYYY-MM-DD_HHMM_after>/` with a manifest (branch/commit, viewport, method).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/App.jsx frontend/src/app/layout/Sidebar.jsx frontend/src/app/layout/MobileMoreMenu.jsx frontend/src/features/map/MapView.jsx
git commit -m "feat(notam): wire global panel + map layers + airport tab into app shell"
```

---

### Task 11: Update Architecture.md + EntryPoints.md

**Files:**
- Modify: `Architecture.md` (Frontend File Roles — add the notam feature files)
- Modify: `EntryPoints.md` (optional: note NOTAM as a concrete example under #3/#4)

- [ ] **Step 1: Add Frontend File Roles entries** for `features/notam/NotamPanel.jsx`, `features/notam/lib/notamViewModel.js`, `notamGeoJson.js`, `notamLayers.js` (`NOTAM_SOURCE_IDS`/`NOTAM_LAYER_IDS` ownership), `airport-panel/tabs/NotamTab.jsx`, and the `weatherApi.js` `fetchNotam` + `MET_LAYERS` `notam` toggle. Mirror the wording style of the existing advisory entries.

- [ ] **Step 2: Commit**

```bash
git add Architecture.md EntryPoints.md
git commit -m "docs(notam): Architecture.md frontend roles for NOTAM UI (Phase B)"
```

---

## Self-Review Notes

- **Spec coverage:** fetchNotam ✓ T1 · time-state/altitude(AGL/AMSL/전고도) ✓ T2 · GeoJSON + FIR exclusion ✓ T3 · zoom transition spike ✓ T4 · map layers (time-color, colorblind shape, category filter) ✓ T5 · MET_LAYERS master toggle ✓ T6 · global panel (tiles, dense table, selected-airport priority, horizon disclosure) ✓ T7 · airport tab + FIR section ✓ T8 · map click + overlap popup (surface D, 1/2-3/4+) ✓ T9 · sidebar/mobile re-enable + MapView ADR-0001 wiring ✓ T10 · docs ✓ T11.
- **Mockup fidelity:** the four mockup surfaces map to tasks — (A) global panel → T7, (B) airport tab + FIR → T8, (C) briefing route NOTAM → **Phase C** (not here), (D) map overlap popup → T9. Implementers open `refs/2026-07-03-notam-ui-mockup.html` for exact column layout, tile grid, legend row, badge glyphs, and popup structure.
- **Deferred to Phase C (not this plan):** `routeNotams`/`routeConflicts`, briefing banner, `hazardLayers.js` RULEBOOK rule, LineString route-matching limitation. T6 lays the `MET_LAYERS` groundwork Phase C's "지도에 NOTAM 레이어 보기" chip needs.
- **Accessibility:** color+shape+text triple (badge glyphs T2, marker shapes T5), non-dimmed safety values + active-tile clarity baked into T7/T8 acceptance.
- **Type consistency:** `timeState` string ('active'|'soon'|'upcoming') is produced by `deriveTimeState` (T2), stamped into GeoJSON properties (T3), and read by Mapbox `match` expressions (T5) — same three literals throughout. Category ids are the frozen Phase A enum used in `NOTAM_CATEGORIES` (T2), GeoJSON `category` (T3), and the `setNotamCategoryFilter` literal list (T5).
- **Open item for implementer:** exact token hex values (red/amber/gray/accent) and the NOTAM sidebar icon come from `docs/design/design-language.md` — the plan deliberately does not hardcode mockup-local values.

## Execution Handoff

Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute in-session with checkpoints.
