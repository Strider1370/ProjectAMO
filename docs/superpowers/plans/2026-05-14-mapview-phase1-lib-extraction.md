# MapView Phase 1 Lib Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `MapView.jsx` responsibility by extracting low-risk API helpers, pure route helpers, and base Mapbox layer utilities without changing UI behavior.

**Architecture:** This is the first implementation slice from `docs/superpowers/specs/2026-05-14-mapview-refactor-design.md`. It keeps `MapView.jsx` as the orchestrator for now, but moves stable non-UI logic into feature-local modules that match the approved lean structure. Do not move route form state, weather overlay state, or Mapbox lifecycle in this phase.

**Tech Stack:** Vite, React 19, Mapbox GL JS, Node built-in test runner (`node --test`), PowerShell on Windows.

---

## Scope

This plan implements only Phase 1 foundation work:

- Move direct SIGWX metadata API calls from `MapView.jsx` into `frontend/src/api/weatherApi.js`.
- Move small reusable Mapbox helpers into `frontend/src/features/map/lib/mapLayerUtils.js`.
- Move airport and geo boundary layer helpers into `frontend/src/features/map/lib/baseMapLayers.js`.
- Move route preview, VFR GeoJSON, and procedure preview helpers into `frontend/src/features/route-briefing/lib/routePreview.js`.
- Move vertical profile payload construction into `frontend/src/features/route-briefing/lib/verticalProfileRequest.js`.
- Add focused Node test coverage for pure helper behavior where practical.

Out of scope:

- Do not split `RouteCheckPanel.jsx` yet.
- Do not introduce `useRouteBriefing`.
- Do not move weather overlay state into `weatherOverlayModel.js`.
- Do not normalize `style.load` lifecycle yet.
- Do not move ADS-B polling yet.

## File Structure

Create:

- `frontend/src/features/map/lib/mapLayerUtils.js`
  - Owns generic Mapbox layer/source helpers currently embedded in `MapView.jsx`.
- `frontend/src/features/map/lib/baseMapLayers.js`
  - Owns base airport and geo boundary layer helpers.
- `frontend/src/features/route-briefing/lib/routePreview.js`
  - Owns VFR GeoJSON, procedure preview GeoJSON, and route preview layer helpers.
- `frontend/src/features/route-briefing/lib/verticalProfileRequest.js`
  - Owns vertical profile request payload construction.
- `frontend/src/features/route-briefing/lib/routePreview.test.js`
  - Tests pure route preview helpers.
- `frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js`
  - Tests IFR/VFR vertical profile payload construction.

Modify:

- `frontend/src/api/weatherApi.js`
  - Add SIGWX metadata API helper functions.
- `frontend/src/features/map/MapView.jsx`
  - Replace extracted helper definitions with imports.
  - Keep state, effects, handlers, JSX, and behavior unchanged.
- `docs/superpowers/specs/2026-05-14-mapview-refactor-design.md`
  - Update only if implementation discovers a necessary adjustment to the approved design.

Do not modify:

- `frontend/src/features/map/MapView.css`
- `frontend/src/features/weather-overlays/*`
- `frontend/src/features/aviation-layers/*`, except if imports require no-op formatting changes. Avoid touching them in this phase.

---

### Task 1: Add SIGWX Metadata API Helpers

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Inspect current weather API style**

Run:

```powershell
Get-Content frontend\src\api\weatherApi.js -Raw
```

Expected: file uses exported async helper functions around `fetch`.

- [ ] **Step 2: Add SIGWX metadata helpers**

In `frontend/src/api/weatherApi.js`, reuse the existing private `fetchJson(url, { optional = false } = {})` helper. Add these exports near `fetchSnapshotMeta`:

```js
export async function fetchSigwxFrontMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-front-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}

export async function fetchSigwxCloudMeta(tmfc) {
  if (!tmfc) return null
  return fetchJson(`/api/sigwx-cloud-meta?tmfc=${encodeURIComponent(tmfc)}`, { optional: true })
}
```

Do not add a second JSON helper. Keep the exported function names exactly as above.

- [ ] **Step 3: Replace direct fetches in MapView**

In `frontend/src/features/map/MapView.jsx`, add:

```js
import { fetchSigwxCloudMeta, fetchSigwxFrontMeta } from '../../api/weatherApi.js'
```

Then replace the existing direct `Promise.all` body that calls:

```js
fetch(`/api/sigwx-front-meta?tmfc=${selectedTmfc}`)
fetch(`/api/sigwx-cloud-meta?tmfc=${selectedTmfc}`)
```

with:

```js
const [frontMeta, cloudMeta] = await Promise.all([
  fetchSigwxFrontMeta(selectedTmfc).catch(() => null),
  fetchSigwxCloudMeta(selectedTmfc).catch(() => null),
])
```

- [ ] **Step 4: Verify no direct SIGWX metadata fetch remains**

Run:

```powershell
rg -n "/api/sigwx-(front|cloud)-meta|fetchSigwx" frontend\src
```

Expected:

- `MapView.jsx` imports and calls `fetchSigwxFrontMeta` / `fetchSigwxCloudMeta`.
- Only API-client code in `weatherApi.js` contains `/api/sigwx-front-meta` and `/api/sigwx-cloud-meta` URL strings.

- [ ] **Step 5: Build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/api/weatherApi.js frontend/src/features/map/MapView.jsx
git commit -m "refactor: move SIGWX metadata fetch helpers"
```

---

### Task 2: Extract Generic Map Layer Utilities

**Files:**
- Create: `frontend/src/features/map/lib/mapLayerUtils.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Create map layer utility module**

Create `frontend/src/features/map/lib/mapLayerUtils.js`:

```js
export function setLayerVisibility(map, layer, isVisible) {
  if (!map || !layer) return
  if (map.getLayer(layer.id)) {
    map.setLayoutProperty(layer.id, 'visibility', isVisible ? 'visible' : 'none')
  }
}

export function setMapLayerVisible(map, layerId, isVisible) {
  if (!map || !layerId || !map.getLayer(layerId)) return
  map.setLayoutProperty(layerId, 'visibility', isVisible ? 'visible' : 'none')
}

export function addOrUpdateGeoJsonSource(map, sourceId, data) {
  const source = map.getSource(sourceId)
  if (source) {
    source.setData(data)
    return
  }
  map.addSource(sourceId, { type: 'geojson', data })
}
```

- [ ] **Step 2: Import utilities in MapView**

In `MapView.jsx`, add:

```js
import { addOrUpdateGeoJsonSource, setLayerVisibility, setMapLayerVisible } from './lib/mapLayerUtils.js'
```

- [ ] **Step 3: Remove duplicate local definitions**

Delete the local definitions of:

- `setLayerVisibility`
- `setMapLayerVisible`
- `addOrUpdateGeoJsonSource`

Do not change call sites unless import names conflict.

- [ ] **Step 4: Build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/lib/mapLayerUtils.js
git commit -m "refactor: extract map layer utilities"
```

---

### Task 3: Extract Base Airport and Geo Boundary Layers

**Files:**
- Create: `frontend/src/features/map/lib/baseMapLayers.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Move constants and helpers**

Create `frontend/src/features/map/lib/baseMapLayers.js` and move these constants/functions from `MapView.jsx` into it:

- `AIRPORT_SOURCE_ID`
- `AIRPORT_CIRCLE_LAYER`
- `AIRPORT_LABEL_LAYER`
- `GEO_BOUNDARY_COLOR`
- `GEO_BOUNDARY_WIDTH`
- `GEO_SIGUNGU_MIN_ZOOM`
- `GEO_LAYERS`
- `createAirportGeoJSON`
- `addAirportLayers`
- `addGeoBoundaryLayers`
- `setGeoBoundaryVisibility`

Export all moved constants/functions that are used by `MapView.jsx`.

The module should begin with:

```js
const emptyGeoJSON = { type: 'FeatureCollection', features: [] }
```

Only include `emptyGeoJSON` here if a moved helper needs it. Do not export it unless `MapView.jsx` still needs this local constant.

- [ ] **Step 2: Import base layer helpers in MapView**

In `MapView.jsx`, add:

```js
import {
  AIRPORT_CIRCLE_LAYER,
  AIRPORT_SOURCE_ID,
  addAirportLayers,
  addGeoBoundaryLayers,
  createAirportGeoJSON,
  setGeoBoundaryVisibility,
} from './lib/baseMapLayers.js'
```

Also import `AIRPORT_LABEL_LAYER` only if `MapView.jsx` still references it after the extraction.

- [ ] **Step 3: Remove moved code from MapView**

Delete the moved constants/functions from `MapView.jsx`. Keep call sites unchanged.

- [ ] **Step 4: Verify references**

Run:

```powershell
rg -n "AIRPORT_SOURCE_ID|AIRPORT_CIRCLE_LAYER|AIRPORT_LABEL_LAYER|GEO_LAYERS|createAirportGeoJSON|addAirportLayers|addGeoBoundaryLayers|setGeoBoundaryVisibility" frontend\src\features\map
```

Expected:

- Definitions live in `baseMapLayers.js`.
- `MapView.jsx` only imports and calls the helpers/constants it needs.

- [ ] **Step 5: Build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/lib/baseMapLayers.js
git commit -m "refactor: extract base map layer helpers"
```

---

### Task 4: Extract Route Preview Helpers

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routePreview.js`
- Create: `frontend/src/features/route-briefing/lib/routePreview.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Move route preview constants and pure helpers**

Create `frontend/src/features/route-briefing/lib/routePreview.js` and move these constants/functions from `MapView.jsx`:

- `ROUTE_PREVIEW_SOURCE`
- `ROUTE_PREVIEW_LINE`
- `ROUTE_PREVIEW_POINT`
- `VFR_WP_CIRCLE`
- `VFR_WP_LABEL`
- `PROC_PREVIEW_SOURCE`
- `PROC_SID_LINE`
- `PROC_STAR_LINE`
- `PROC_IAP_LINE`
- `PROC_WP_CIRCLE`
- `PROC_WP_LABEL`
- `greatCircleNm`
- `calcVfrDistance`
- `segmentPointDistSq`
- `findInsertIndex`
- `relabeledWaypoints`
- `buildVfrGeoJSON`
- `getProcedureLineCoordinates`
- `buildProcedureGeoJSON`
- `augmentRouteWithProcedures`

Also move these Mapbox adapter helpers if they only depend on the constants above:

- `addRoutePreviewLayers`
- `addProcedurePreviewLayers`
- `addVfrWaypointLayers`
- `bindVfrInteractions`

Export the functions/constants still referenced by `MapView.jsx`.

- [ ] **Step 2: Add route preview tests**

Create `frontend/src/features/route-briefing/lib/routePreview.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  augmentRouteWithProcedures,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
  calcVfrDistance,
  relabeledWaypoints,
} from './routePreview.js'

test('relabeledWaypoints preserves fixed points and labels editable points in order', () => {
  const result = relabeledWaypoints([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'custom-a', lon: 127, lat: 37 },
    { id: 'custom-b', lon: 128, lat: 36 },
  ])

  assert.equal(result[0].id, 'RKSI')
  assert.equal(result[1].id, 'WP1')
  assert.equal(result[2].id, 'WP2')
})

test('buildVfrGeoJSON returns a route line and waypoint features', () => {
  const result = buildVfrGeoJSON([
    { id: 'RKSI', fixed: true, lon: 126.45, lat: 37.46 },
    { id: 'WP1', lon: 127, lat: 37 },
  ])

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 3)
  assert.equal(result.features[0].geometry.type, 'LineString')
  assert.deepEqual(result.features[0].geometry.coordinates, [[126.45, 37.46], [127, 37]])
})

test('calcVfrDistance returns zero for fewer than two waypoints', () => {
  assert.equal(calcVfrDistance([]), 0)
  assert.equal(calcVfrDistance([{ lon: 126.45, lat: 37.46 }]), 0)
})

test('buildProcedureGeoJSON includes line and waypoint features for SID, STAR, and IAP', () => {
  const sid = {
    fixes: [{ id: 'A', lon: 126, lat: 37 }, { id: 'B', lon: 127, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
  }
  const star = {
    fixes: [{ id: 'C', lon: 128, lat: 37 }, { id: 'D', lon: 129, lat: 38 }],
    geometry: { type: 'LineString', coordinates: [[128, 37], [129, 38]] },
  }
  const iap = {
    fixes: [
      { id: 'E', coordinates: { lon: 130, lat: 37 } },
      { id: 'F', coordinates: { lon: 131, lat: 38 } },
    ],
    geometry: { type: 'LineString', coordinates: [[130, 37], [131, 38]] },
  }

  const result = buildProcedureGeoJSON(sid, star, iap)
  const roles = result.features.map((feature) => feature.properties.role)

  assert.ok(roles.includes('sid-line'))
  assert.ok(roles.includes('star-line'))
  assert.ok(roles.includes('iap-line'))
  assert.ok(roles.includes('sid-wp'))
  assert.ok(roles.includes('star-wp'))
  assert.ok(roles.includes('iap-wp'))
})

test('augmentRouteWithProcedures leaves route unchanged when no procedures exist', () => {
  const preview = buildVfrGeoJSON([
    { id: 'A', lon: 126, lat: 37 },
    { id: 'B', lon: 127, lat: 38 },
  ])

  assert.deepEqual(augmentRouteWithProcedures(preview, null, null, null), preview)
})
```

- [ ] **Step 3: Update MapView imports**

In `MapView.jsx`, import the moved route helpers/constants:

```js
import {
  PROC_PREVIEW_SOURCE,
  ROUTE_PREVIEW_LINE,
  ROUTE_PREVIEW_SOURCE,
  VFR_WP_CIRCLE,
  addProcedurePreviewLayers,
  addRoutePreviewLayers,
  addVfrWaypointLayers,
  augmentRouteWithProcedures,
  bindVfrInteractions,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
  calcVfrDistance,
  findInsertIndex,
  relabeledWaypoints,
} from '../route-briefing/lib/routePreview.js'
```

Adjust the import list to include any additional moved constants that `MapView.jsx` still references.

- [ ] **Step 4: Remove moved code from MapView**

Delete the moved constants/functions from `MapView.jsx`. Do not alter route behavior.

- [ ] **Step 5: Run route preview tests**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routePreview.test.js
```

Expected: all tests pass.

- [ ] **Step 6: Build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/lib/routePreview.js frontend/src/features/route-briefing/lib/routePreview.test.js
git commit -m "refactor: extract route preview helpers"
```

---

### Task 5: Extract Vertical Profile Request Builder

**Files:**
- Create: `frontend/src/features/route-briefing/lib/verticalProfileRequest.js`
- Create: `frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Create vertical profile request module**

Create `frontend/src/features/route-briefing/lib/verticalProfileRequest.js`:

```js
export function buildProcedurePayload(procedure, type) {
  if (!procedure) return null
  return {
    id: procedure.id ?? procedure.name ?? null,
    type,
    fixes: (procedure.fixes ?? []).map((fix) => ({
      id: fix.id,
      lon: fix.lon ?? fix.coordinates?.lon ?? null,
      lat: fix.lat ?? fix.coordinates?.lat ?? null,
      legDistanceNm: fix.legDistanceNm ?? null,
      altitude: fix.altitude ?? null,
    })),
  }
}

export function buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }) {
  if (routeResult?.flightRule !== 'IFR') return null
  return {
    entryFix: routeResult.entryFix ?? null,
    exitFix: routeResult.exitFix ?? null,
    procedures: [
      buildProcedurePayload(selectedSid, 'SID'),
      buildProcedurePayload(selectedStar, 'STAR'),
      buildProcedurePayload(selectedIap, 'IAP'),
    ].filter(Boolean),
  }
}

export function buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }) {
  if (!routeResult) return []

  if (routeResult?.flightRule === 'VFR') {
    return (vfrWaypoints ?? []).map((wp) => ({
      label: wp.id,
      lon: wp.lon,
      lat: wp.lat,
      kind: wp.fixed ? 'AIRPORT' : 'WAYPOINT',
    }))
  }

  const baseLine = routeResult.previewGeojson?.features?.find((feature) => feature.properties.role === 'route-preview-line')
  const baseCoordinates = baseLine?.geometry?.coordinates ?? []
  const routeIds = new Set(routeResult.routeIds ?? [])
  const labels = (routeResult.displaySequence ?? []).filter((item) => !routeIds.has(item))

  return labels
    .map((label, index) => {
      const coordinate = baseCoordinates[index]
      if (!coordinate) return null
      return {
        label,
        lon: coordinate[0],
        lat: coordinate[1],
        kind: index === 0 || index === labels.length - 1 ? 'AIRPORT' : 'FIX',
      }
    })
    .filter(Boolean)
}

export function buildVerticalProfileRequest({
  routeGeometry,
  routeResult,
  selectedSid,
  selectedStar,
  selectedIap,
  vfrWaypoints,
  plannedCruiseAltitudeFt,
}) {
  return {
    flightRule: routeResult?.flightRule,
    routeGeometry,
    plannedCruiseAltitudeFt,
    procedureContext: buildProcedureContextPayload({ routeResult, selectedSid, selectedStar, selectedIap }),
    vfrWaypoints: routeResult?.flightRule === 'VFR' ? vfrWaypoints : undefined,
    routeMarkers: buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints }),
    sampleSpacingMeters: 250,
  }
}
```

Before committing, compare this output shape with the current inline `handleVerticalProfileRequest` payload in `MapView.jsx`. Preserve the current property names exactly.

- [ ] **Step 2: Add vertical profile request tests**

Create `frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildProcedureContextPayload,
  buildProcedurePayload,
  buildVerticalProfileRequest,
} from './verticalProfileRequest.js'

test('buildProcedurePayload normalizes procedure fixes', () => {
  const result = buildProcedurePayload({
    id: 'SID1',
    label: 'SID 1',
    fixes: [
      { id: 'A', lon: 126, lat: 37, legDistanceNm: 3.2, altitude: '5000' },
      { id: 'B', coordinates: { lon: 127, lat: 38 } },
    ],
  }, 'SID')

  assert.equal(result.type, 'SID')
  assert.equal(result.id, 'SID1')
  assert.equal(result.fixes.length, 2)
  assert.deepEqual(result.fixes[0], {
    id: 'A',
    lon: 126,
    lat: 37,
    legDistanceNm: 3.2,
    altitude: '5000',
  })
})

test('buildProcedureContextPayload omits empty procedures and preserves route fixes', () => {
  const result = buildProcedureContextPayload({
    routeResult: { flightRule: 'IFR', entryFix: 'AGAVO', exitFix: 'SAPRA' },
    selectedSid: { id: 'SID1', fixes: [] },
    selectedStar: null,
    selectedIap: { id: 'IAP1', fixes: [] },
  })

  assert.equal(result.entryFix, 'AGAVO')
  assert.equal(result.exitFix, 'SAPRA')
  assert.deepEqual(result.procedures.map((procedure) => procedure.type), ['SID', 'IAP'])
})

test('buildProcedureContextPayload returns null for VFR routes', () => {
  assert.equal(buildProcedureContextPayload({
    routeResult: { flightRule: 'VFR' },
    selectedSid: { id: 'SID1', fixes: [] },
    selectedStar: null,
    selectedIap: null,
  }), null)
})

test('buildVerticalProfileRequest includes VFR waypoints only for VFR routes', () => {
  const vfrWaypoints = [{ id: 'WP1', lon: 126, lat: 37, fixed: false }]
  const result = buildVerticalProfileRequest({
    routeGeometry: { type: 'LineString', coordinates: [[126, 37], [127, 38]] },
    routeResult: { flightRule: 'VFR' },
    selectedSid: null,
    selectedStar: null,
    selectedIap: null,
    vfrWaypoints,
    plannedCruiseAltitudeFt: 5500,
  })

  assert.equal(result.flightRule, 'VFR')
  assert.equal(result.plannedCruiseAltitudeFt, 5500)
  assert.equal(result.vfrWaypoints, vfrWaypoints)
  assert.deepEqual(result.routeMarkers[0], {
    label: 'WP1',
    lon: 126,
    lat: 37,
    kind: 'WAYPOINT',
  })
  assert.equal(result.sampleSpacingMeters, 250)
})
```

- [ ] **Step 3: Replace inline payload helpers in MapView**

In `MapView.jsx`, import:

```js
import { buildVerticalProfileRequest } from '../route-briefing/lib/verticalProfileRequest.js'
```

Remove the local definitions of:

- `buildProcedurePayload`
- `buildProcedureContextPayload`
- `buildRouteProfileMarkersPayload`

Keep `getCurrentRouteLineString` local for now if it still reads MapView state directly.

Inside `handleVerticalProfileRequest`, replace the object literal passed to `fetchVerticalProfile` with:

```js
const profile = await fetchVerticalProfile(buildVerticalProfileRequest({
  routeGeometry,
  routeResult,
  selectedSid,
  selectedStar,
  selectedIap,
  vfrWaypoints,
  plannedCruiseAltitudeFt,
}))
```

Keep the current local variable names from `handleVerticalProfileRequest`: `routeGeometry` and `plannedCruiseAltitudeFt`.

- [ ] **Step 4: Run vertical profile request tests**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 5: Build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/lib/verticalProfileRequest.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
git commit -m "refactor: extract vertical profile request builder"
```

---

### Task 6: Final Phase 1 Verification and Documentation Check

**Files:**
- Modify: `Architecture.md` only if the actual implementation already changed the described role of `MapView.jsx`.
- Modify: `EntryPoints.md` only if the implementation changed an entry point instruction that would now be misleading.

- [ ] **Step 1: Run focused tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```powershell
Push-Location frontend
npm.cmd run build
Pop-Location
```

Expected: build succeeds.

- [ ] **Step 3: Check MapView still owns orchestration only for this phase**

Run:

```powershell
rg -n "/api/sigwx-(front|cloud)-meta|function buildVfrGeoJSON|function buildProcedureGeoJSON|function buildProcedurePayload|function buildProcedureContextPayload|function buildRouteProfileMarkersPayload|function addAirportLayers|function addGeoBoundaryLayers" frontend\src\features\map\MapView.jsx
```

Expected: no matches.

- [ ] **Step 4: Check docs for drift**

Read:

```powershell
Get-Content Architecture.md -Raw
Get-Content EntryPoints.md -Raw
```

Expected:

- If `MapView.jsx` is still the high-level composition point, `Architecture.md` can remain unchanged in this phase.
- If `EntryPoints.md` still accurately describes current code after Phase 1, leave it unchanged.
- If either file now points future work to code that no longer exists in `MapView.jsx`, update that file in the same commit.

- [ ] **Step 5: Commit doc updates if needed**

If docs changed:

```powershell
git add Architecture.md EntryPoints.md
git commit -m "docs: update MapView extraction entry points"
```

If no docs changed, do not create an empty commit.

- [ ] **Step 6: Record final changed files**

Run:

```powershell
git status --short
git log --oneline -6
```

Expected:

- working tree is clean.
- recent commits show each Phase 1 extraction task.
