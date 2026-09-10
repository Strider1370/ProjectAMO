# MapView Phase 4 Mapbox Sync Boundaries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Normalize Mapbox style lifecycle and feature sync boundaries so basemap/style reload installs static map structure first, then reapplies current data, visibility, and feature state from current React state.

**Architecture:** `MapView.jsx` remains the Mapbox instance owner and high-level orchestrator, but `style.load` stops applying feature data or visibility from closures captured during map initialization. Feature-owned modules expose explicit install/sync functions plus owned source/layer ID lists. `MapView.jsx` uses a style revision signal to rerun current-state sync effects after every style reload.

**Tech Stack:** Vite, React 19, Mapbox GL JS, Node built-in test runner (`node --test`), Playwright for browser smoke, PowerShell on Windows.

---

## Current State

Phase 1, Phase 2, and Phase 3 are complete in code:

- Route briefing ownership lives under `frontend/src/features/route-briefing`.
- Weather overlay data shaping and weather layer sync helpers live under `frontend/src/features/weather-overlays/lib`.
- `MapView.jsx` is already much thinner, but it still owns Mapbox style lifecycle and several cross-feature sync effects.
- `MapView.jsx` still calls feature install/sync helpers inside `style.load` while the initialization effect has an empty dependency list. Those calls can read stale `aviationVisibility`, `metVisibility`, `airportGeoJSON`, `rasterAndSigwxModel`, `advisoryLayerModel`, `lightningLayerModel`, and ADS-B visibility after state changes followed by a basemap switch.
- Route, weather, ADS-B, airport, and geo boundary sync effects already exist outside `style.load`, but they do not all share a style revision dependency and some installer/sync responsibilities are still mixed.

Known working-tree note:

- `.codex/hooks.json` and `.codex/hooks/code_review_graph.py` may be modified because Code Review Graph is installed locally. Treat them as unrelated unless the user explicitly asks to include them.
- `docs/archive/development/plans/2026-05-15-mapview-phase3-route-briefing-ownership.md` may still be untracked locally. Preserve it.
- `backend/data/terrain/` may contain ignored local DEM terrain tiles. Do not add them to git.

---

## Scope

This plan implements only Phase 4 from `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`:

- Limit `style.load` to static source/layer installation and event binding setup.
- Make current data sync effects rerun after every style reload.
- Make current visibility sync effects rerun after every style reload.
- Make each feature sync module document or export the source/layer IDs it owns.
- Prevent duplicate Mapbox event handlers after repeated style switches.
- Preserve main map and `/monitoring` behavior.

Out of scope:

- Do not redesign any panel UI.
- Do not move weather overlay React state out of `MapView.jsx`.
- Do not move ADS-B toggle placement out of the MET panel.
- Do not implement new backend APIs.
- Do not change route briefing behavior.
- Do not perform Phase 5 documentation rewrite beyond comments/exports inside touched modules.

---

## Testing Strategy: Targeted TDD Plus Runtime Smoke

Phase 4 is not a pure TDD phase. Its riskiest behavior is Mapbox runtime lifecycle behavior: style reloads, basemap switching, source/layer reinstallation, event handler rebinding, and visible map state restoration. Those behaviors cannot be fully proven with Node unit tests because a mock Mapbox object does not faithfully represent Mapbox GL's style lifecycle.

Use TDD where the behavior is deterministic and mock-friendly:

- `mapStyleSync.js` helper behavior.
- source/layer ownership ID exports.
- cleanup-aware layer event binding.
- ADS-B hover cleanup and ADS-B data/visibility sync.
- weather static installer shape where a small Mapbox mock is representative.

Use implementation plus browser/runtime smoke where real Mapbox behavior matters:

- `style.load` sequencing.
- basemap switching after multiple layer toggles.
- route/weather/ADS-B/airport state restoration after style reload.
- duplicate hover/click handler detection.
- `/monitoring` map compatibility.

Practical rule for this phase:

- If a task creates or changes a pure helper or cleanup wrapper, write the failing test first.
- If a task changes Mapbox lifecycle orchestration in `MapView.jsx`, verify with focused tests for the helpers and Playwright/manual browser smoke for the actual lifecycle behavior.

---

## File Structure

Create:

- `frontend/src/features/map/lib/mapStyleSync.js`
  - Small generic helpers for style revision checks, layer event rebinding, and Mapbox mock-friendly source/layer ownership assertions.
- `frontend/src/features/map/lib/mapStyleSync.test.js`
  - Unit tests for helper behavior that can be tested without a real Mapbox instance.

Modify:

- `frontend/src/features/map/MapView.jsx`
  - Replace stale `style.load` feature sync calls with installer-only calls.
  - Add a `styleRevision` state counter and include it in all Mapbox sync effect dependencies.
  - Replace ad hoc layer event registration with cleanup-aware/idempotent binding helpers.
- `frontend/src/features/map/lib/baseMapLayers.js`
  - Export `BASE_MAP_SOURCE_IDS`, `BASE_MAP_LAYER_IDS`, and split static install from data/visibility sync where needed.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
  - Export `WEATHER_OVERLAY_SOURCE_IDS` and `WEATHER_OVERLAY_LAYER_IDS`.
  - Separate static advisory/lightning/SIGWX install from data/visibility sync where safe.
- `frontend/src/features/weather-overlays/lib/lightningLayers.js`
  - Export lightning source/layer ownership as needed by `weatherOverlayLayers.js`.
- `frontend/src/features/weather-overlays/lib/advisoryLayers.js`
  - Export advisory source/layer ownership as needed by `weatherOverlayLayers.js`.
- `frontend/src/features/route-briefing/lib/routePreviewSync.js`
  - Export `ROUTE_PREVIEW_SOURCE_IDS` and `ROUTE_PREVIEW_LAYER_IDS`.
  - Keep route sync behavior unchanged, but make install/sync responsibilities explicit.
- `frontend/src/features/aviation-layers/addAdsbLayer.js`
  - Export `ADSB_SOURCE_IDS` and `ADSB_LAYER_IDS`.
  - Make hover binding cleanup-aware or idempotent.
- `frontend/src/features/aviation-layers/addAviationWfsLayers.js`
  - Modify only if aviation WFS event/layer installation needs an explicit static install wrapper.

Do not modify:

- Backend files.
- Route briefing hook/UI files unless a build import adjustment is required.
- Weather model tests unless module exports require import changes.

---

### Task 1: Baseline, Graph Context, and Sync Ownership Inventory

**Files:**
- Read: `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`
- Read: `Architecture.md`
- Read: `EntryPoints.md`
- Read: `frontend/src/features/map/MapView.jsx`
- Read: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Read: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Read: `frontend/src/features/aviation-layers/addAdsbLayer.js`
- Read: `frontend/src/features/map/lib/baseMapLayers.js`

- [ ] **Step 1: Check working tree**

Run:

```powershell
git status --short --branch
```

Expected:

- Existing `.codex/hooks*` changes may be present and must not be reverted.
- Existing untracked Phase 3 plan may be present and must be preserved.
- If any `frontend/src/features/*` files are already modified, inspect them before editing.

- [ ] **Step 2: Check Code Review Graph**

Run:

```powershell
& 'C:\Users\John\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\code-review-graph.exe' status
& 'C:\Users\John\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\code-review-graph.exe' detect-changes
```

Expected:

- Graph status prints node/edge counts.
- Detect-changes does not report unexpected feature file changes before Phase 4 starts.

- [ ] **Step 3: Record current style.load responsibilities**

Run:

```powershell
rg -n "map\.on\('style\.load'|addAviationWfsLayers|installRoutePreviewLayers|syncRasterAndSigwxLayers|installAdvisoryLayers|syncLightningLayers|addGeoBoundaryLayers|addAirportLayers|addAdsbLayers|bindAdsbHover|setAdsbVisibility" frontend/src/features/map/MapView.jsx
```

Expected current inventory:

- `style.load` still installs aviation WFS, route preview, weather overlays, geo boundaries, airport layers, ADS-B layers, and some visibility/data sync.
- This output becomes the checklist for what must move to installer-only or current-state sync effects.

- [ ] **Step 4: Run current focused tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/routePreviewSync.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Commit nothing**

This task is discovery only. Do not commit.

---

### Task 2: Add Map Style Sync Helper and Tests

**Files:**
- Create: `frontend/src/features/map/lib/mapStyleSync.js`
- Create: `frontend/src/features/map/lib/mapStyleSync.test.js`

- [ ] **Step 1: Create failing tests for layer event rebinding and ID flattening**

Create `frontend/src/features/map/lib/mapStyleSync.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bindLayerEvent,
  flattenLayerIds,
  hasStyleRevision,
} from './mapStyleSync.js'

function createMapMock() {
  const calls = []
  return {
    calls,
    on(type, layerId, handler) {
      calls.push(['on', type, layerId, handler])
    },
    off(type, layerId, handler) {
      calls.push(['off', type, layerId, handler])
    },
  }
}

test('hasStyleRevision returns true only for positive style revisions', () => {
  assert.equal(hasStyleRevision(0), false)
  assert.equal(hasStyleRevision(null), false)
  assert.equal(hasStyleRevision(1), true)
  assert.equal(hasStyleRevision(3), true)
})

test('flattenLayerIds removes empty values and duplicates while preserving order', () => {
  assert.deepEqual(
    flattenLayerIds(['a', null, ['b', 'a'], undefined, ['c', ['b']]]),
    ['a', 'b', 'c'],
  )
})

test('bindLayerEvent returns cleanup that unregisters the exact handler', () => {
  const map = createMapMock()
  const handler = () => {}
  const cleanup = bindLayerEvent(map, 'click', 'layer-a', handler)
  cleanup()
  assert.equal(map.calls.length, 2)
  assert.equal(map.calls[0][0], 'on')
  assert.equal(map.calls[1][0], 'off')
  assert.equal(map.calls[0][3], handler)
  assert.equal(map.calls[1][3], handler)
})

test('bindLayerEvent ignores missing maps or layer ids', () => {
  assert.equal(bindLayerEvent(null, 'click', 'layer-a', () => {}), null)
  assert.equal(bindLayerEvent(createMapMock(), 'click', '', () => {}), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js
```

Expected: FAIL because `mapStyleSync.js` does not exist.

- [ ] **Step 3: Implement helper**

Create `frontend/src/features/map/lib/mapStyleSync.js`:

```js
export function hasStyleRevision(styleRevision) {
  return Number.isInteger(styleRevision) && styleRevision > 0
}

export function flattenLayerIds(values) {
  const result = []
  const seen = new Set()

  function visit(value) {
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (!value || seen.has(value)) return
    seen.add(value)
    result.push(value)
  }

  visit(values)
  return result
}

export function bindLayerEvent(map, type, layerId, handler) {
  if (!map || !type || !layerId || typeof handler !== 'function') return null
  map.on(type, layerId, handler)
  return () => map.off(type, layerId, handler)
}
```

- [ ] **Step 4: Run helper test**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/features/map/lib/mapStyleSync.js frontend/src/features/map/lib/mapStyleSync.test.js
git commit -m "refactor: add map style sync helpers"
```

---

### Task 3: Export Source and Layer Ownership IDs

**Files:**
- Modify: `frontend/src/features/map/lib/baseMapLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Modify: `frontend/src/features/aviation-layers/addAdsbLayer.js`
- Test: `frontend/src/features/map/lib/mapStyleSync.test.js`

- [ ] **Step 1: Add ownership assertions to tests**

Append to `frontend/src/features/map/lib/mapStyleSync.test.js`:

```js
import { BASE_MAP_LAYER_IDS, BASE_MAP_SOURCE_IDS } from './baseMapLayers.js'
import { WEATHER_OVERLAY_LAYER_IDS, WEATHER_OVERLAY_SOURCE_IDS } from '../../weather-overlays/lib/weatherOverlayLayers.js'
import { ROUTE_PREVIEW_LAYER_IDS, ROUTE_PREVIEW_SOURCE_IDS } from '../../route-briefing/lib/routePreviewSync.js'
import { ADSB_LAYER_IDS, ADSB_SOURCE_IDS } from '../../aviation-layers/addAdsbLayer.js'

test('feature sync modules export non-empty source and layer ownership lists', () => {
  const groups = [
    BASE_MAP_SOURCE_IDS,
    BASE_MAP_LAYER_IDS,
    WEATHER_OVERLAY_SOURCE_IDS,
    WEATHER_OVERLAY_LAYER_IDS,
    ROUTE_PREVIEW_SOURCE_IDS,
    ROUTE_PREVIEW_LAYER_IDS,
    ADSB_SOURCE_IDS,
    ADSB_LAYER_IDS,
  ]

  groups.forEach((ids) => {
    assert.ok(Array.isArray(ids))
    assert.ok(ids.length > 0)
    ids.forEach((id) => assert.equal(typeof id, 'string'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js
```

Expected: FAIL because ownership exports do not exist yet.

- [ ] **Step 3: Export base map ownership**

In `frontend/src/features/map/lib/baseMapLayers.js`, add after the existing constants:

```js
export const BASE_MAP_SOURCE_IDS = [
  AIRPORT_SOURCE_ID,
  ...GEO_LAYERS.map((layer) => layer.sourceId),
]

export const BASE_MAP_LAYER_IDS = [
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_LABEL_LAYER,
  ...GEO_LAYERS.map((layer) => layer.layerId),
]
```

- [ ] **Step 4: Export weather overlay ownership**

In `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`, add after `SIGWX_VECTOR_LAYERS`:

```js
export const WEATHER_OVERLAY_SOURCE_IDS = [
  SATELLITE_SOURCE,
  RADAR_SOURCE,
  SIGWX_SOURCE,
  SIGWX_CLOUD_SOURCE,
  SIGWX_POLYGON_SOURCE,
  SIGWX_LINE_SOURCE,
  SIGWX_LABEL_SOURCE,
  SIGWX_ICON_SOURCE,
  SIGWX_ARROW_LABEL_SOURCE,
  SIGWX_TEXT_CHIP_SOURCE,
  LIGHTNING_SOURCE,
  ADVISORY_LAYER_DEFS.sigmet.sourceId,
  ADVISORY_LAYER_DEFS.airmet.sourceId,
]

export const WEATHER_OVERLAY_LAYER_IDS = [
  SATELLITE_LAYER,
  RADAR_LAYER,
  SIGWX_LAYER,
  SIGWX_CLOUD_LAYER,
  ...SIGWX_VECTOR_LAYERS,
  ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
  ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
  ADVISORY_LAYER_DEFS.sigmet.labelLayerId,
  ADVISORY_LAYER_DEFS.airmet.fillLayerId,
  ADVISORY_LAYER_DEFS.airmet.lineLayerId,
  ADVISORY_LAYER_DEFS.airmet.labelLayerId,
]
```

If advisory defs do not expose `sourceId` or `labelLayerId`, inspect `advisoryLayers.js` and use the exact existing property names instead.

- [ ] **Step 5: Export route preview ownership**

In `frontend/src/features/route-briefing/lib/routePreviewSync.js`, import any missing route preview layer IDs from `routePreview.js`, then add:

```js
export const ROUTE_PREVIEW_SOURCE_IDS = [
  ROUTE_PREVIEW_SOURCE,
  PROC_PREVIEW_SOURCE,
  BOUNDARY_FIX_PREVIEW_SOURCE,
]

export const ROUTE_PREVIEW_LAYER_IDS = [
  BOUNDARY_FIX_PREVIEW_POINT,
  BOUNDARY_FIX_PREVIEW_LABEL,
  ...ROUTE_HL_LAYER_IDS,
]
```

Include VFR/procedure/route base layer IDs from `routePreview.js` if they are exported there. If they are not exported, add those exports in `routePreview.js` and include them here.

- [ ] **Step 6: Export ADS-B ownership**

In `frontend/src/features/aviation-layers/addAdsbLayer.js`, add after the ADS-B constants:

```js
export const ADSB_SOURCE_IDS = [ADSB_SOURCE_ID]
export const ADSB_LAYER_IDS = [ADSB_LAYER_ID]
```

- [ ] **Step 7: Run ownership tests**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js
```

Expected: PASS.

- [ ] **Step 8: Run frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```powershell
git add frontend/src/features/map/lib/baseMapLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/route-briefing/lib/routePreview.js frontend/src/features/route-briefing/lib/routePreviewSync.js frontend/src/features/aviation-layers/addAdsbLayer.js frontend/src/features/map/lib/mapStyleSync.test.js
git commit -m "refactor: export map sync ownership ids"
```

---

### Task 4: Make ADS-B Mapbox Binding Idempotent

**Files:**
- Modify: `frontend/src/features/aviation-layers/addAdsbLayer.js`
- Test: `frontend/src/features/aviation-layers/addAdsbLayer.test.js`

- [ ] **Step 1: Add ADS-B bind cleanup test**

Create or append `frontend/src/features/aviation-layers/addAdsbLayer.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { bindAdsbHover, syncAdsbLayer } from './addAdsbLayer.js'

function createMapMock() {
  const calls = []
  const source = { data: null, setData(data) { this.data = data } }
  return {
    calls,
    source,
    on(type, layerId, handler) { calls.push(['on', type, layerId, handler]) },
    off(type, layerId, handler) { calls.push(['off', type, layerId, handler]) },
    getSource() { return source },
    getLayer() { return true },
    setLayoutProperty(layerId, property, value) { calls.push(['layout', layerId, property, value]) },
  }
}

test('bindAdsbHover returns cleanup for all registered handlers', () => {
  const map = createMapMock()
  const cleanup = bindAdsbHover(map)
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.equal(map.calls.filter((call) => call[0] === 'on').length, 3)
  assert.equal(map.calls.filter((call) => call[0] === 'off').length, 3)
})

test('syncAdsbLayer applies current data and visibility', () => {
  const map = createMapMock()
  const geojson = { type: 'FeatureCollection', features: [] }
  syncAdsbLayer(map, { geojson, isVisible: true })
  assert.equal(map.source.data, geojson)
  assert.deepEqual(map.calls.at(-1), ['layout', 'adsb-layer', 'visibility', 'visible'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/features/aviation-layers/addAdsbLayer.test.js
```

Expected: FAIL because `syncAdsbLayer` does not exist and `bindAdsbHover` does not return cleanup.

- [ ] **Step 3: Update ADS-B module**

In `frontend/src/features/aviation-layers/addAdsbLayer.js`:

- Keep `addAdsbLayers(map)` as the static installer.
- Change `bindAdsbHover(map)` to return a cleanup function that calls `map.off` for the three handlers it registers.
- Add:

```js
export function syncAdsbLayer(map, { geojson, isVisible }) {
  map.getSource(ADSB_SOURCE_ID)?.setData(geojson)
  setAdsbVisibility(map, isVisible)
}
```

Use the existing popup behavior unchanged inside the handlers.

- [ ] **Step 4: Run ADS-B test**

Run:

```powershell
node --test frontend/src/features/aviation-layers/addAdsbLayer.test.js
```

Expected: PASS.

- [ ] **Step 5: Run frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/features/aviation-layers/addAdsbLayer.js frontend/src/features/aviation-layers/addAdsbLayer.test.js
git commit -m "refactor: make adsb map sync idempotent"
```

---

### Task 5: Convert MapView Style Load to Static Installation

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/aviation-layers/addAdsbLayer.js` only if import names changed in Task 4

- [ ] **Step 1: Add style revision state**

In `MapView.jsx`, replace:

```js
const [isStyleReady, setIsStyleReady] = useState(false)
```

with:

```js
const [isStyleReady, setIsStyleReady] = useState(false)
const [styleRevision, setStyleRevision] = useState(0)
```

- [ ] **Step 2: Update ADS-B imports**

Replace the ADS-B import with:

```js
import { fetchAdsbData } from '../../api/adsbApi.js'
import { addAdsbLayers, bindAdsbHover, createAdsbGeoJSON, syncAdsbLayer } from '../aviation-layers/addAdsbLayer.js'
```

Remove `setAdsbVisibility` and `ADSB_SOURCE_ID` imports if they are no longer used.

- [ ] **Step 3: Remove current-state sync from `style.load`**

Inside `map.on('style.load', () => { ... })`, keep only static installation and style readiness updates:

```js
map.on('style.load', () => {
  applyRoadVisibility(map, roadsVisible)

  addAviationWfsLayers(map, import.meta.env.VITE_VWORLD_KEY, import.meta.env.VITE_VWORLD_DOMAIN)
  installRoutePreviewLayers(map)
  bindSectorHover(map)
  if (!vfrInteractionsBound) {
    vfrInteractionsBound = true
    bindVfrInteractions(map, vfrWaypointsRef, setVfrWaypoints)
  }

  addGeoBoundaryLayers(map)
  addAirportLayers(map, { type: 'FeatureCollection', features: [] })
  addAdsbLayers(map)

  setStyleRevision((value) => value + 1)
  setIsStyleReady(true)
})
```

Remove these calls from `style.load`:

```js
AVIATION_WFS_LAYERS.forEach((l) => setLayerVisibility(map, l, aviationVisibility[l.id]))
syncRasterAndSigwxLayers(map, rasterAndSigwxModel)
installAdvisoryLayers(map, advisoryLayerModel)
syncLightningLayers(map, lightningLayerModel)
addAirportLayers(map, airportGeoJSON)
setAdsbVisibility(map, metVisibility.adsb)
```

If `installAdvisoryLayers(map, advisoryLayerModel)` is still needed to create static layers before sync, replace it with a model-independent installer added in Task 6. Do not keep current-state advisory data application inside `style.load`.

- [ ] **Step 4: Update sync effect dependencies**

For every Mapbox sync effect currently depending on `isStyleReady`, add `styleRevision` to the dependency array:

```js
}, [aviationVisibility, isStyleReady, styleRevision])
```

Do this for:

- aviation WFS visibility
- route preview sync
- boundary fix sync
- route fit bounds
- VFR waypoint sync
- VFR hover handler binding if it must rebind after style load
- raster/SIGWX sync
- advisory sync
- lightning sync
- geo boundary visibility sync
- ADS-B data/visibility sync
- airport data sync
- airport selected state sync

- [ ] **Step 5: Replace ADS-B sync effect body**

Replace:

```js
map.getSource(ADSB_SOURCE_ID)?.setData(adsbGeoJSON)
setAdsbVisibility(map, metVisibility.adsb)
```

with:

```js
syncAdsbLayer(map, { geojson: adsbGeoJSON, isVisible: metVisibility.adsb })
```

- [ ] **Step 6: Run acceptance grep**

Run:

```powershell
rg -n "style\.load|syncRasterAndSigwxLayers|installAdvisoryLayers|syncLightningLayers|setAdsbVisibility|airportGeoJSON|aviationVisibility|metVisibility" frontend/src/features/map/MapView.jsx
```

Expected:

- `style.load` remains.
- Current-state variables such as `aviationVisibility`, `metVisibility`, and `airportGeoJSON` are not referenced inside the `style.load` callback.
- They remain in sync effects and render logic.

- [ ] **Step 7: Run focused tests and build**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js frontend/src/features/aviation-layers/addAdsbLayer.test.js frontend/src/features/route-briefing/lib/routePreviewSync.test.js
npm.cmd run build --prefix frontend
```

Expected: all pass.

- [ ] **Step 8: Commit**

Run:

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/aviation-layers/addAdsbLayer.js
git commit -m "refactor: rerun map sync after style reload"
```

---

### Task 6: Split Weather Static Install From Data and Visibility Sync

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Test: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`

- [ ] **Step 1: Add weather layer sync test skeleton**

Create `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WEATHER_OVERLAY_LAYER_IDS,
  WEATHER_OVERLAY_SOURCE_IDS,
  installWeatherOverlayLayers,
} from './weatherOverlayLayers.js'

function createMapMock() {
  const sources = new Set()
  const layers = new Set()
  const images = new Set()
  return {
    sources,
    layers,
    images,
    getSource(id) { return sources.has(id) ? { setData() {} } : null },
    addSource(id) { sources.add(id) },
    getLayer(id) { return layers.has(id) },
    addLayer(layer) { layers.add(layer.id) },
    hasImage(id) { return images.has(id) },
    addImage(id) { images.add(id) },
    setLayoutProperty() {},
    setPaintProperty() {},
    loadImage(_url, cb) { cb(null, {}) },
  }
}

test('weather overlay ownership exports are unique', () => {
  assert.equal(new Set(WEATHER_OVERLAY_SOURCE_IDS).size, WEATHER_OVERLAY_SOURCE_IDS.length)
  assert.equal(new Set(WEATHER_OVERLAY_LAYER_IDS).size, WEATHER_OVERLAY_LAYER_IDS.length)
})

test('installWeatherOverlayLayers can run with empty data', () => {
  const map = createMapMock()
  installWeatherOverlayLayers(map)
  assert.ok(map.sources.size > 0)
  assert.ok(map.layers.size > 0)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js
```

Expected: FAIL because `installWeatherOverlayLayers` does not exist.

- [ ] **Step 3: Add static install helper**

In `weatherOverlayLayers.js`, add:

```js
export function installWeatherOverlayLayers(map) {
  addOrUpdateSigwxLowLayers(map, null)
  installAdvisoryLayers(map, {
    sigmetFeatures: EMPTY_GEOJSON,
    sigmetLabels: EMPTY_GEOJSON,
    airmetFeatures: EMPTY_GEOJSON,
    airmetLabels: EMPTY_GEOJSON,
    visibility: { sigmet: false, airmet: false },
  })
  syncLightningLayers(map, {
    lightningGeoJSON: EMPTY_GEOJSON,
    visibility: { lightning: false },
    blinkLightning: false,
    lightningBlinkOff: false,
  })
}
```

Keep raster image overlays in `syncRasterAndSigwxLayers`, because Mapbox image sources require frame coordinates. The important Phase 4 boundary is that raster sync runs from current-state effects after `style.load`, not from the stale `style.load` closure.

- [ ] **Step 4: Use installer in MapView style.load**

In `MapView.jsx`, import:

```js
installWeatherOverlayLayers,
```

from `weatherOverlayLayers.js`, then call this inside `style.load`:

```js
installWeatherOverlayLayers(map)
```

Do not pass `weatherOverlayModel`, `advisoryLayerModel`, or `lightningLayerModel` into `style.load`.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/map/lib/mapStyleSync.test.js
npm.cmd run build --prefix frontend
```

Expected: all pass.

- [ ] **Step 6: Commit**

Run:

```powershell
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/map/MapView.jsx
git commit -m "refactor: split weather overlay install and sync"
```

---

### Task 7: Normalize Layer Event Handler Rebinding

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/lib/mapStyleSync.js`

- [ ] **Step 1: Add cleanup collection helper**

Extend `mapStyleSync.js`:

```js
export function cleanupAll(cleanups) {
  cleanups.filter(Boolean).forEach((cleanup) => cleanup())
}
```

Add test to `mapStyleSync.test.js`:

```js
import { cleanupAll } from './mapStyleSync.js'

test('cleanupAll runs every cleanup function', () => {
  const calls = []
  cleanupAll([() => calls.push(1), null, () => calls.push(2)])
  assert.deepEqual(calls, [1, 2])
})
```

- [ ] **Step 2: Use cleanup refs in MapView**

In `MapView.jsx`, import:

```js
import { bindLayerEvent, cleanupAll } from './lib/mapStyleSync.js'
```

Add refs near existing map refs:

```js
const airportEventCleanupRef = useRef([])
const advisoryEventCleanupRef = useRef([])
const adsbEventCleanupRef = useRef(null)
```

- [ ] **Step 3: Rebind airport/advisory/ADSB layer handlers after each style revision**

Move airport click/mouse handlers, advisory popup handlers, and ADS-B hover binding out of `style.load` into an effect:

```js
useEffect(() => {
  const map = mapRef.current
  if (!map || !isStyleReady) return undefined

  cleanupAll(airportEventCleanupRef.current)
  cleanupAll(advisoryEventCleanupRef.current)
  adsbEventCleanupRef.current?.()

  airportEventCleanupRef.current = [
    bindLayerEvent(map, 'click', AIRPORT_CIRCLE_LAYER, (e) => {
      const icao = e.features?.[0]?.properties?.icao
      if (icao) onSelectRef.current?.(icao)
    }),
    bindLayerEvent(map, 'mouseenter', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = 'pointer' }),
    bindLayerEvent(map, 'mouseleave', AIRPORT_CIRCLE_LAYER, () => { map.getCanvas().style.cursor = '' }),
  ]

  advisoryEventCleanupRef.current = [
    ADVISORY_LAYER_DEFS.sigmet.fillLayerId,
    ADVISORY_LAYER_DEFS.sigmet.lineLayerId,
    ADVISORY_LAYER_DEFS.airmet.fillLayerId,
    ADVISORY_LAYER_DEFS.airmet.lineLayerId,
  ].flatMap((layerId) => [
    bindLayerEvent(map, 'click', layerId, (e) => {
      const desc = e.features?.[0]?.properties?.description
      if (!desc) return
      new mapboxgl.Popup({ closeButton: true, maxWidth: '320px' })
        .setLngLat(e.lngLat)
        .setHTML(`<pre class="mapbox-advisory-popup">${desc.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))}</pre>`)
        .addTo(map)
    }),
    bindLayerEvent(map, 'mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer' }),
    bindLayerEvent(map, 'mouseleave', layerId, () => { map.getCanvas().style.cursor = '' }),
  ])

  adsbEventCleanupRef.current = bindAdsbHover(map)

  return () => {
    cleanupAll(airportEventCleanupRef.current)
    cleanupAll(advisoryEventCleanupRef.current)
    adsbEventCleanupRef.current?.()
    airportEventCleanupRef.current = []
    advisoryEventCleanupRef.current = []
    adsbEventCleanupRef.current = null
  }
}, [isStyleReady, styleRevision])
```

If this effect duplicates handler setup that remains in `style.load`, remove the `style.load` handler setup. Preserve existing popup HTML escaping exactly.

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js frontend/src/features/aviation-layers/addAdsbLayer.test.js
npm.cmd run build --prefix frontend
```

Expected: all pass.

- [ ] **Step 5: Commit**

Run:

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/lib/mapStyleSync.js frontend/src/features/map/lib/mapStyleSync.test.js
git commit -m "refactor: rebind map layer handlers by style revision"
```

---

### Task 8: Final Acceptance Grep and Browser Smoke

**Files:**
- Verify: `frontend/src/features/map/MapView.jsx`
- Verify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Verify: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Verify: `frontend/src/features/aviation-layers/addAdsbLayer.js`

- [ ] **Step 1: Run full focused automated tests**

Run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js frontend/src/features/aviation-layers/addAdsbLayer.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/routePreviewSync.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run backend vertical profile regression**

Run:

```powershell
node --test backend/test/vertical-profile.test.js
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 4: Run acceptance greps**

Run:

```powershell
rg -n "map\.on\('style\.load'" frontend/src/features/map/MapView.jsx
rg -n "style\.load[\s\S]*(aviationVisibility|metVisibility|airportGeoJSON|rasterAndSigwxModel|advisoryLayerModel|lightningLayerModel|adsbGeoJSON)" frontend/src/features/map/MapView.jsx
rg -n "SOURCE_IDS|LAYER_IDS" frontend/src/features/map/lib/baseMapLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/route-briefing/lib/routePreviewSync.js frontend/src/features/aviation-layers/addAdsbLayer.js
```

Expected:

- `style.load` exists once.
- The second grep should produce no matches. If PowerShell/rg cannot match multiline reliably, manually inspect the `style.load` callback and confirm no current-state model variables are used inside it.
- Ownership ID exports are present in all touched sync modules.

- [ ] **Step 5: Browser smoke setup**

Start local servers if they are not already running:

```powershell
npm.cmd run dev --prefix backend
npm.cmd run dev --prefix frontend -- --host 127.0.0.1
```

If ports are already in use, use the existing local servers. Do not kill unrelated user processes.

- [ ] **Step 6: Manual browser smoke checklist**

Use Playwright or the in-app browser to verify:

- Main map loads.
- Route panel opens.
- IFR route search works.
- VFR route search works.
- VFR waypoint add/delete/drag/altitude edit works.
- Vertical profile generation opens the profile window when local terrain tiles are present.
- Radar toggle persists after switching basemap.
- Satellite toggle persists after switching basemap.
- Lightning toggle and blink setting persist after switching basemap.
- SIGMET/AIRMET badges and map layers persist after switching basemap.
- SIGWX history/filter state persists after switching basemap.
- ADS-B toggle persists after switching basemap and does not create duplicate hover popups.
- Airport click selection still works after switching basemap twice.
- `/monitoring` route loads and map renders.

- [ ] **Step 7: Commit final cleanup if needed**

If Task 8 required code changes:

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/lib frontend/src/features/weather-overlays/lib frontend/src/features/route-briefing/lib frontend/src/features/aviation-layers
git commit -m "refactor: normalize mapbox sync boundaries"
```

If no code changes were needed in Task 8, do not create an empty commit.

---

## Final Verification Gate

Before claiming Phase 4 complete, run:

```powershell
node --test frontend/src/features/map/lib/mapStyleSync.test.js frontend/src/features/aviation-layers/addAdsbLayer.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/routePreviewSync.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
node --test backend/test/vertical-profile.test.js
npm.cmd run build --prefix frontend
```

Required manual smoke:

- Basemap switching after multiple layer toggles restores the same visible state.
- No duplicate hover/click handlers after repeated style switches.
- Main map route briefing still works.
- Weather overlays still work.
- Aviation panel still works.
- ADS-B toggle and hover still work.
- `/monitoring` map still renders.

---

## Phase 4 Acceptance

- `style.load` is limited to static source/layer installation, event binding setup that is safe across style reloads, and triggering `styleRevision`.
- Current data and visibility are applied from current React state through effects that depend on `styleRevision`.
- Route, weather, base map, and ADS-B sync modules export source/layer ownership IDs.
- Basemap switching no longer depends on stale state captured by the map initialization effect.
- Repeated basemap switches do not duplicate layer event handlers.
- User-facing behavior is unchanged.

---

## Execution Options

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each major task.
