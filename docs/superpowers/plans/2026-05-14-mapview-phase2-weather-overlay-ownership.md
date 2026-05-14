# MapView Phase 2 Weather Overlay Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move weather overlay data shaping and Mapbox layer sync ownership out of `MapView.jsx` and into `features/weather-overlays/lib` without changing user-facing behavior.

**Architecture:** `MapView.jsx` remains the map container and composition point for this phase, but weather-specific constants, derived models, SIGWX layer adapters, lightning layer adapters, and overlay sync calls move to weather-owned modules. React state stays in `MapView.jsx` unless a state boundary is clearly isolated and low risk.

**Tech Stack:** Vite, React 19, Mapbox GL JS, Node built-in test runner (`node --test`), PowerShell on Windows.

---

## Current State

Phase 1 appears complete in code:

- `frontend/src/features/map/lib/baseMapLayers.js` exists.
- `frontend/src/features/map/lib/mapLayerUtils.js` exists.
- `frontend/src/features/route-briefing/lib/routePreview.js` and tests exist.
- `frontend/src/features/route-briefing/lib/verticalProfileRequest.js` and tests exist.
- `MapView.jsx` imports `fetchSigwxCloudMeta` and `fetchSigwxFrontMeta` instead of hardcoding selected SIGWX metadata request URLs.
- `rg` finds no Phase 1 target helper definitions remaining in `MapView.jsx`.

Known working-tree note:

- `.codex/hooks.json` and `.codex/hooks/code_review_graph.py` are modified before this plan. Treat them as unrelated unless the user says otherwise.

---

## Scope

This plan implements only Phase 2 from `docs/superpowers/specs/2026-05-14-mapview-refactor-design.md`:

- Move weather layer constants and panel layer definitions from `MapView.jsx`.
- Move SIGWX_LOW Mapbox vector layer adapter from `MapView.jsx`.
- Move lightning GeoJSON and Mapbox adapter from `MapView.jsx`.
- Move weather/advisory derived data shaping into a testable model module.
- Move MET raster/SIGWX/advisory/lightning sync into a weather-owned sync boundary.
- Keep ADS-B polling and route briefing ownership out of scope.

Out of scope:

- Do not move IFR/VFR route state.
- Do not introduce `useRouteBriefing`.
- Do not redesign panel UI.
- Do not move ADS-B toggle placement.
- Do not normalize all `style.load` behavior; this phase only creates a weather-owned sync boundary that Phase 4 can build on.

---

## File Structure

Create:

- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
  - Owns MET layer definitions, raster overlay source/layer IDs, SIGWX_LOW Mapbox layer adapter, and high-level weather/advisory/lightning sync helpers.
- `frontend/src/features/weather-overlays/lib/lightningLayers.js`
  - Owns lightning age bands, GeoJSON creation, icon creation, layers, visibility, and blink paint sync.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
  - Owns radar/satellite/lightning frame selection, advisory panel payloads, SIGWX history/filter derived state, badge counts, legend labels, and panel counts.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
  - Tests pure model behavior.
- `frontend/src/features/weather-overlays/lib/lightningLayers.test.js`
  - Tests pure lightning GeoJSON behavior.

Modify:

- `frontend/src/features/map/MapView.jsx`
  - Replace local weather constants/helpers/derived blocks with imports and a smaller orchestration call.
- `frontend/src/features/weather-overlays/WeatherLegends.jsx`
  - No planned behavior change. Modify only if moving legend constants requires a prop shape adjustment.
- `Architecture.md`
  - Update after implementation because weather overlay ownership will have moved.
- `EntryPoints.md`
  - Update the "Add a new MET raster overlay" entry after the sync boundary exists.

Do not modify:

- `frontend/src/features/route-briefing/*`
- `frontend/src/features/aviation-layers/*`, except imports only if required by build.
- Backend files.

---

### Task 1: Confirm Phase 1 Baseline

**Files:**
- Read: `frontend/src/features/map/MapView.jsx`
- Read: `frontend/src/features/weather-overlays/lib/weatherTimeline.js`
- Read: `frontend/src/features/weather-overlays/lib/advisoryLayers.js`

- [ ] **Step 1: Check working tree before touching files**

Run:

```powershell
git status --short
```

Expected:

- Only pre-existing `.codex/hooks*` changes may be present.
- If weather/map files are already modified, inspect them before editing and preserve user changes.

- [ ] **Step 2: Run Phase 1 tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run frontend build**

Run:

```powershell
npm.cmd --prefix frontend run build
```

Expected: build succeeds before Phase 2 begins.

---

### Task 2: Extract Lightning Model and Layer Adapter

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/lightningLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/lightningLayers.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Move lightning constants and pure helpers**

Create `frontend/src/features/weather-overlays/lib/lightningLayers.js` with these exports moved from `MapView.jsx`:

```js
export const LIGHTNING_SOURCE = 'kma-lightning'
export const LIGHTNING_GROUND_LAYER = 'kma-lightning-ground'
export const LIGHTNING_CLOUD_LAYER = 'kma-lightning-cloud'
export const LIGHTNING_BLINK_INTERVAL_MS = 800
export const LIGHTNING_TIME_WINDOW_MINUTES = 60
export const LIGHTNING_AGE_BANDS = [
  { min: 0, max: 10, color: '#ff1f1f', opacity: 1, iconId: 'lightning-0-10' },
  { min: 10, max: 20, color: '#ff00ff', opacity: 0.92, iconId: 'lightning-10-20' },
  { min: 20, max: 30, color: '#2f55ff', opacity: 0.85, iconId: 'lightning-20-30' },
  { min: 30, max: 40, color: '#1dd9e6', opacity: 0.78, iconId: 'lightning-30-40' },
  { min: 40, max: 50, color: '#25d90a', opacity: 0.7, iconId: 'lightning-40-50' },
  { min: 50, max: 60, color: '#ffeb00', opacity: 0.62, iconId: 'lightning-50-60' },
]
```

Move these functions unchanged:

- `getLightningAgeBand`
- `buildLightningOpacityExpression`
- `createLightningGeoJSON`
- `createLightningCrossImage`
- `ensureLightningIcons`
- `addLightningLayers`
- `setLightningVisibility`
- `setLightningBlinkState`

Import `setMapLayerVisible` from `../../map/lib/mapLayerUtils.js`.

- [ ] **Step 2: Add lightning tests**

Create `frontend/src/features/weather-overlays/lib/lightningLayers.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  LIGHTNING_TIME_WINDOW_MINUTES,
  createLightningGeoJSON,
  getLightningAgeBand,
} from './lightningLayers.js'

test('getLightningAgeBand maps ages into configured bands', () => {
  assert.equal(getLightningAgeBand(0)?.iconId, 'lightning-0-10')
  assert.equal(getLightningAgeBand(19.9)?.iconId, 'lightning-10-20')
  assert.equal(getLightningAgeBand(59.9)?.iconId, 'lightning-50-60')
  assert.equal(getLightningAgeBand(LIGHTNING_TIME_WINDOW_MINUTES + 1), null)
})

test('createLightningGeoJSON keeps only recent valid strikes', () => {
  const referenceTimeMs = Date.UTC(2026, 4, 14, 3, 0, 0)
  const result = createLightningGeoJSON({
    nationwide: {
      strikes: [
        { lon: 126.1, lat: 37.1, time: new Date(referenceTimeMs - 5 * 60_000).toISOString(), type: 'CG' },
        { lon: 127.1, lat: 38.1, time: new Date(referenceTimeMs - 70 * 60_000).toISOString(), type: 'IC' },
        { lon: 'bad', lat: 37.2, time: new Date(referenceTimeMs - 5 * 60_000).toISOString(), type: 'CG' },
      ],
    },
  }, referenceTimeMs)

  assert.equal(result.type, 'FeatureCollection')
  assert.equal(result.features.length, 1)
  assert.deepEqual(result.features[0].geometry.coordinates, [126.1, 37.1])
  assert.equal(result.features[0].properties.iconId, 'lightning-0-10')
})
```

- [ ] **Step 3: Update MapView imports and remove local lightning code**

In `MapView.jsx`, import:

```js
import {
  LIGHTNING_AGE_BANDS,
  LIGHTNING_BLINK_INTERVAL_MS,
  LIGHTNING_SOURCE,
  addLightningLayers,
  createLightningGeoJSON,
  setLightningBlinkState,
  setLightningVisibility,
} from '../weather-overlays/lib/lightningLayers.js'
```

Remove local lightning constants and functions from `MapView.jsx`. Keep the existing React state and effects for now.

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/lightningLayers.test.js
npm.cmd --prefix frontend run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/weather-overlays/lib/lightningLayers.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js
git commit -m "refactor: extract lightning overlay layers"
```

---

### Task 3: Extract SIGWX_LOW and MET Layer Sync Adapter

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Move MET and raster/SIGWX constants**

Create `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.

Move these constants from `MapView.jsx`:

- `SATELLITE_SOURCE`
- `SATELLITE_LAYER`
- `RADAR_SOURCE`
- `RADAR_LAYER`
- `SIGWX_SOURCE`
- `SIGWX_LAYER`
- `SIGWX_CLOUD_SOURCE`
- `SIGWX_CLOUD_LAYER`
- `SIGWX_POLYGON_SOURCE`
- `SIGWX_POLYGON_LAYER`
- `SIGWX_POLYGON_OUTLINE_LAYER`
- `SIGWX_LINE_SOURCE`
- `SIGWX_LINE_LAYER`
- `SIGWX_LABEL_SOURCE`
- `SIGWX_LABEL_LAYER`
- `SIGWX_ICON_SOURCE`
- `SIGWX_ICON_LAYER`
- `SIGWX_ARROW_LABEL_SOURCE`
- `SIGWX_ARROW_LABEL_LAYER`
- `SIGWX_TEXT_CHIP_SOURCE`
- `SIGWX_TEXT_CHIP_LAYER`
- `SIGWX_VECTOR_LAYERS`
- `RADAR_RAINRATE_LEGEND`
- `MET_LAYERS`

`MET_LAYERS` should import `ADVISORY_LAYER_DEFS` from `./advisoryLayers.js`.

- [ ] **Step 2: Move SIGWX_LOW Mapbox adapter helpers**

Move these functions from `MapView.jsx` into `weatherOverlayLayers.js`:

- `ensureMapImage`
- `createSigwxChipImage`
- `ensureSigwxChipImages`
- `buildSigwxDashArrayExpression`
- `addOrUpdateSigwxLowLayers`
- `setSigwxLowVisibility`

Import:

```js
import { addOrUpdateImageOverlay } from '../../map/imageOverlay.js'
import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import {
  addAdvisoryLayers,
  setAdvisoryVisibility,
  updateAdvisoryLayerData,
} from './advisoryLayers.js'
import {
  LIGHTNING_SOURCE,
  addLightningLayers,
  setLightningBlinkState,
  setLightningVisibility,
} from './lightningLayers.js'
```

- [ ] **Step 3: Add sync helpers**

Add these exports to `weatherOverlayLayers.js`:

```js
export function syncRasterAndSigwxLayers(map, model) {
  const hasSat = addOrUpdateImageOverlay(map, {
    sourceId: SATELLITE_SOURCE,
    layerId: SATELLITE_LAYER,
    frame: model.satelliteFrame,
    opacity: 0.92,
  })
  const hasRadar = addOrUpdateImageOverlay(map, {
    sourceId: RADAR_SOURCE,
    layerId: RADAR_LAYER,
    frame: model.radarFrame,
    opacity: 0.88,
  })
  const hasSigwx = addOrUpdateImageOverlay(map, {
    sourceId: SIGWX_SOURCE,
    layerId: SIGWX_LAYER,
    frame: model.selectedSigwxFrontMeta,
    opacity: 0.85,
  })
  const hasSigwxCloud = addOrUpdateImageOverlay(map, {
    sourceId: SIGWX_CLOUD_SOURCE,
    layerId: SIGWX_CLOUD_LAYER,
    frame: model.selectedSigwxCloudMeta,
    opacity: 0.65,
  })

  addOrUpdateSigwxLowLayers(map, model.sigwxLowMapData)
  setMapLayerVisible(map, SATELLITE_LAYER, hasSat && model.visibility.satellite)
  setMapLayerVisible(map, RADAR_LAYER, hasRadar && model.visibility.radar)
  setMapLayerVisible(map, SIGWX_LAYER, hasSigwx && model.visibility.sigwx && model.showVisibleSigwxFrontOverlay)
  setMapLayerVisible(map, SIGWX_CLOUD_LAYER, hasSigwxCloud && model.visibility.sigwx && model.showVisibleSigwxCloudOverlay)
  setSigwxLowVisibility(map, model.visibility.sigwx)
}

export function syncAdvisoryLayers(map, model) {
  updateAdvisoryLayerData(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  updateAdvisoryLayerData(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}

export function installAdvisoryLayers(map, model) {
  addAdvisoryLayers(map, 'sigmet', model.sigmetFeatures, model.sigmetLabels)
  addAdvisoryLayers(map, 'airmet', model.airmetFeatures, model.airmetLabels)
  setAdvisoryVisibility(map, 'sigmet', model.visibility.sigmet)
  setAdvisoryVisibility(map, 'airmet', model.visibility.airmet)
}

export function syncLightningLayers(map, model) {
  addLightningLayers(map, model.lightningGeoJSON)
  map.getSource(LIGHTNING_SOURCE)?.setData(model.lightningGeoJSON)
  setLightningVisibility(map, model.visibility.lightning)
  setLightningBlinkState(map, model.visibility.lightning && model.blinkLightning && model.lightningBlinkOff)
}
```

- [ ] **Step 4: Replace MapView sync effect internals**

In `MapView.jsx`, import:

```js
import {
  MET_LAYERS,
  RADAR_RAINRATE_LEGEND,
  installAdvisoryLayers,
  syncAdvisoryLayers,
  syncLightningLayers,
  syncRasterAndSigwxLayers,
} from '../weather-overlays/lib/weatherOverlayLayers.js'
```

Replace the MET overlay effect body with:

```js
syncRasterAndSigwxLayers(map, weatherOverlayModel)
```

Replace the SIGMET/AIRMET effect body with:

```js
syncAdvisoryLayers(map, weatherOverlayModel)
```

Replace the lightning effect body with:

```js
syncLightningLayers(map, weatherOverlayModel)
```

In the `style.load` path where initial weather layers are installed, replace the duplicated advisory install calls with:

```js
installAdvisoryLayers(map, weatherOverlayModel)
```

- [ ] **Step 5: Run build**

Run:

```powershell
npm.cmd --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
git commit -m "refactor: extract weather overlay layer sync"
```

---

### Task 4: Extract Weather Overlay Derived Model

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Create: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Create pure model helpers**

Create `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`.

Move or recreate these pure helpers from `MapView.jsx`:

- `parseFrameTmToMs`
- `formatReferenceTimeLabel`
- `parseSigwxTmfcToMs`
- `formatSigwxStamp`
- `formatAdvisoryPanelLabel`
- `formatAdvisoryValidLabel`

Add:

```js
import {
  buildTimelineTicks,
  normalizeFrame,
  normalizeFrames,
  pickNearestPreviousFrame,
} from './weatherTimeline.js'
import { advisoryItemsToFeatureCollection, advisoryItemsToLabelFeatureCollection } from './advisoryLayers.js'
import { sigwxLowToMapboxData } from './sigwxData.js'
import { LIGHTNING_AGE_BANDS, createLightningGeoJSON } from './lightningLayers.js'
```

- [ ] **Step 2: Add `buildWeatherOverlayModel`**

Add this export and keep property names aligned with the current `MapView.jsx` local variables:

```js
export function buildWeatherOverlayModel({
  echoMeta,
  satMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  visibility,
  weatherTimelineIndex,
  sigwxHistoryIndex,
  sigwxFilter,
  hiddenAdvisoryKeys,
  selectedSigwxFrontMeta,
  selectedSigwxCloudMeta,
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
}) {
  const radarFrames = normalizeFrames(echoMeta?.frames?.length ? echoMeta.frames : [echoMeta?.nationwide])
  const satelliteFrames = normalizeFrames(satMeta?.frames?.length ? satMeta.frames : [satMeta?.latest])
  const lightningFrame = normalizeFrame({ tm: lightningData?.query?.tm })
  const lightningFrames = lightningFrame ? [lightningFrame] : []
  const weatherTimelineTicks = buildTimelineTicks([
    visibility.radar ? radarFrames : [],
    visibility.satellite ? satelliteFrames : [],
    visibility.lightning ? lightningFrames : [],
  ])
  const effectiveWeatherTimelineIndex = weatherTimelineTicks.length > 0
    ? weatherTimelineIndex >= 0
      ? Math.min(weatherTimelineIndex, weatherTimelineTicks.length - 1)
      : weatherTimelineTicks.length - 1
    : 0
  const selectedWeatherTimeMs = weatherTimelineTicks[effectiveWeatherTimelineIndex] ?? null
  const weatherTimelineVisible = (visibility.radar || visibility.satellite || visibility.lightning) && weatherTimelineTicks.length > 0
  const radarFrame = pickNearestPreviousFrame(radarFrames, selectedWeatherTimeMs)
  const satelliteFrame = pickNearestPreviousFrame(satelliteFrames, selectedWeatherTimeMs)
  const lightningGeoJSON = createLightningGeoJSON(lightningData, lightningReferenceTimeMs)

  const sigmetItems = (sigmetData?.items || []).map((item, index) => ({
    ...item,
    mapKey: item.id || `sigmet-${index}`,
    panelLabel: formatAdvisoryPanelLabel(item, 'sigmet'),
    validLabel: formatAdvisoryValidLabel(item),
  }))
  const airmetItems = (airmetData?.items || []).map((item, index) => ({
    ...item,
    mapKey: item.id || `airmet-${index}`,
    panelLabel: formatAdvisoryPanelLabel(item, 'airmet'),
    validLabel: formatAdvisoryValidLabel(item),
  }))
  const visibleSigmetPayload = {
    ...sigmetData,
    items: sigmetItems.filter((item) => !(hiddenAdvisoryKeys.sigmet || []).includes(item.mapKey)),
  }
  const visibleAirmetPayload = {
    ...airmetData,
    items: airmetItems.filter((item) => !(hiddenAdvisoryKeys.airmet || []).includes(item.mapKey)),
  }
  const sigmetFeatures = advisoryItemsToFeatureCollection(visibleSigmetPayload, 'sigmet')
  const sigmetLabels = advisoryItemsToLabelFeatureCollection(visibleSigmetPayload, 'sigmet')
  const airmetFeatures = advisoryItemsToFeatureCollection(visibleAirmetPayload, 'airmet')
  const airmetLabels = advisoryItemsToLabelFeatureCollection(visibleAirmetPayload, 'airmet')
  const sigwxHistoryEntries = Array.isArray(sigwxLowHistoryData) && sigwxLowHistoryData.length > 0
    ? sigwxLowHistoryData
    : sigwxLowData
      ? [sigwxLowData]
      : []
  const selectedSigwxEntry = sigwxHistoryEntries[sigwxHistoryIndex] || sigwxHistoryEntries[0] || sigwxLowData || null
  const sigwxLowMapData = sigwxLowToMapboxData(selectedSigwxEntry, {
    hiddenGroupKeys: hiddenAdvisoryKeys.sigwxLow,
    filters: sigwxFilter,
  })
  const sigwxGroups = sigwxLowMapData.groups || []
  const visibleSigwxGroups = sigwxGroups.filter((group) => !group.hidden && group.enabledByFilter)
  const showVisibleSigwxFrontOverlay = visibleSigwxGroups.some((group) => group.overlayRole === 'front')
  const showVisibleSigwxCloudOverlay = visibleSigwxGroups.some((group) => group.overlayRole === 'cloud')
  const advisoryBadgeItems = [
    visibility.sigwx ? { key: 'sigwxLow', label: 'SIGWX_LOW', count: sigwxGroups.length, tone: 'sigwx' } : null,
    visibility.sigmet ? { key: 'sigmet', label: 'SIGMET', count: sigmetItems.length, tone: 'sigmet' } : null,
    visibility.airmet ? { key: 'airmet', label: 'AIRMET', count: airmetItems.length, tone: 'airmet' } : null,
  ].filter(Boolean)

  return {
    visibility,
    radarFrames,
    satelliteFrames,
    lightningFrames,
    weatherTimelineTicks,
    effectiveWeatherTimelineIndex,
    selectedWeatherTimeMs,
    weatherTimelineVisible,
    radarFrame,
    satelliteFrame,
    lightningGeoJSON,
    selectedSigwxEntry,
    selectedSigwxFrontMeta,
    selectedSigwxCloudMeta,
    sigwxLowMapData,
    sigwxGroups,
    visibleSigwxGroups,
    showVisibleSigwxFrontOverlay,
    showVisibleSigwxCloudOverlay,
    sigmetItems,
    airmetItems,
    sigmetFeatures,
    sigmetLabels,
    airmetFeatures,
    airmetLabels,
    advisoryBadgeItems,
    sigmetCount: sigmetFeatures.features.length,
    airmetCount: airmetFeatures.features.length,
    sigwxCount: sigwxGroups.length,
    lightningCount: lightningGeoJSON.features.length,
    radarLegendVisible: visibility.radar && !!radarFrame,
    lightningLegendVisible: visibility.lightning,
    lightningLegendEntries: LIGHTNING_AGE_BANDS.map((band) => ({
      color: band.color,
      label: formatReferenceTimeLabel(lightningReferenceTimeMs - band.max * 60 * 1000),
    })),
    radarReferenceTimeMs: parseFrameTmToMs(radarFrame?.tm) ?? Date.now(),
    sigwxIssueLabel: formatSigwxStamp(selectedSigwxEntry?.fetched_at),
    sigwxValidLabel: formatSigwxStamp(selectedSigwxEntry?.tmfc),
    blinkLightning,
    lightningBlinkOff,
    lightningReferenceTimeMs,
  }
}
```

- [ ] **Step 3: Add model tests**

Create `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildWeatherOverlayModel,
  formatAdvisoryPanelLabel,
  formatSigwxStamp,
} from './weatherOverlayModel.js'

const hiddenAdvisoryKeys = { sigwxLow: [], sigmet: [], airmet: [] }
const sigwxFilter = {}

test('formatSigwxStamp formats tmfc values as KST labels', () => {
  assert.equal(formatSigwxStamp('202605140300'), '05/14 03:00 KST')
})

test('formatAdvisoryPanelLabel includes kind, sequence, and phenomenon', () => {
  assert.equal(formatAdvisoryPanelLabel({
    sequence_number: '1',
    phenomenon_code: 'TS',
  }, 'sigmet'), 'SIGMET 1 TS')
})

test('buildWeatherOverlayModel selects latest visible timeline frame by default', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [{ tm: '202605140100', path: '/r1.png' }, { tm: '202605140200', path: '/r2.png' }] },
    satMeta: { frames: [{ tm: '202605140130', path: '/s1.png' }] },
    lightningData: { query: { tm: '202605140210' }, nationwide: { strikes: [] } },
    sigwxLowData: null,
    sigwxLowHistoryData: [],
    sigmetData: { items: [] },
    airmetData: { items: [] },
    visibility: { radar: true, satellite: true, lightning: false, sigwx: false, sigmet: false, airmet: false },
    weatherTimelineIndex: -1,
    sigwxHistoryIndex: 0,
    sigwxFilter,
    hiddenAdvisoryKeys,
    selectedSigwxFrontMeta: null,
    selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: Date.UTC(2026, 4, 14, 2, 10),
    blinkLightning: false,
    lightningBlinkOff: false,
  })

  assert.equal(model.weatherTimelineTicks.length, 3)
  assert.equal(model.radarFrame.tm, '202605140200')
  assert.equal(model.weatherTimelineVisible, true)
})
```

- [ ] **Step 4: Replace MapView derived weather block**

In `MapView.jsx`, import:

```js
import {
  buildWeatherOverlayModel,
  formatReferenceTimeLabel,
} from '../weather-overlays/lib/weatherOverlayModel.js'
```

Replace the local derived `useMemo` block for radar/satellite/lightning/SIGWX/advisory data with:

```js
const weatherOverlayModel = useMemo(() => buildWeatherOverlayModel({
  echoMeta,
  satMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  visibility: metVisibility,
  weatherTimelineIndex,
  sigwxHistoryIndex,
  sigwxFilter,
  hiddenAdvisoryKeys,
  selectedSigwxFrontMeta,
  selectedSigwxCloudMeta,
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
}), [
  echoMeta,
  satMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  metVisibility,
  weatherTimelineIndex,
  sigwxHistoryIndex,
  sigwxFilter,
  hiddenAdvisoryKeys,
  selectedSigwxFrontMeta,
  selectedSigwxCloudMeta,
  lightningReferenceTimeMs,
  blinkLightning,
  lightningBlinkOff,
])
```

Then destructure only values that JSX and handlers still need:

```js
const {
  radarFrames,
  satelliteFrames,
  weatherTimelineTicks,
  effectiveWeatherTimelineIndex,
  selectedWeatherTimeMs,
  weatherTimelineVisible,
  selectedSigwxEntry,
  sigwxGroups,
  sigmetItems,
  airmetItems,
  advisoryBadgeItems,
  sigmetCount,
  airmetCount,
  sigwxCount,
  lightningCount,
  radarLegendVisible,
  lightningLegendVisible,
  lightningLegendEntries,
  radarReferenceTimeMs,
  sigwxIssueLabel,
  sigwxValidLabel,
} = weatherOverlayModel
```

Remove duplicated local helper functions now owned by `weatherOverlayModel.js`.

- [ ] **Step 5: Update sync effects to depend on model slices**

Keep effects explicit enough to avoid unnecessary Mapbox writes:

```js
useEffect(() => {
  const map = mapRef.current
  if (!map || !isStyleReady) return
  syncRasterAndSigwxLayers(map, weatherOverlayModel)
}, [weatherOverlayModel, isStyleReady])
```

If this causes excessive sync churn, memoize smaller objects inside `weatherOverlayModel.js` only after seeing a measurable issue. Do not prematurely split the model.

- [ ] **Step 6: Run model tests and build**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/weather-overlays/lib/weatherTimeline.test.js
npm.cmd --prefix frontend run build
```

Expected: tests and build pass.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js
git commit -m "refactor: extract weather overlay model"
```

---

### Task 5: Final Verification and Documentation

**Files:**
- Modify: `Architecture.md`
- Modify: `EntryPoints.md`

- [ ] **Step 1: Run acceptance grep**

Run:

```powershell
rg -n "SATELLITE_SOURCE|RADAR_SOURCE|SIGWX_POLYGON_SOURCE|LIGHTNING_SOURCE|function createLightningGeoJSON|function addOrUpdateSigwxLowLayers|function formatAdvisoryPanelLabel|function formatSigwxStamp|advisoryItemsToFeatureCollection|sigwxLowToMapboxData" frontend/src/features/map/MapView.jsx
```

Expected:

- No local definitions remain.
- Imports or destructured names may remain only when they are UI composition values.

- [ ] **Step 2: Run all focused tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/weather-overlays/lib/lightningLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 3: Run build**

Run:

```powershell
npm.cmd --prefix frontend run build
```

Expected: build succeeds.

- [ ] **Step 4: Manual browser smoke**

Start the frontend with the existing project command, then verify:

- Main map loads.
- `/monitoring` map loads.
- Basemap switch preserves radar/satellite/SIGWX/lightning visibility.
- Radar and satellite timeline still selects frames.
- Lightning toggle and blink still work.
- SIGWX history, filters, legend, front/cloud raster overlays, and vector groups still work.
- SIGMET/AIRMET badges, panels, map labels, and visibility toggles still work.
- ADS-B toggle and timestamp still work even though ADS-B remains in current UI placement.

- [ ] **Step 5: Update `Architecture.md`**

Change the `MapView.jsx` role from broad weather ownership to:

```text
frontend/src/features/map/MapView.jsx -> Mapbox map container, style readiness, basemap switching, cross-feature panel composition, and high-level sync orchestration.
```

Add or update weather overlay roles:

```text
frontend/src/features/weather-overlays/lib/weatherOverlayModel.js -> weather overlay derived model for timeline, SIGWX history/filter state, advisory panel data, badge counts, and legend labels.
frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js -> weather overlay Mapbox raster/SIGWX/advisory sync helpers and MET panel layer definitions.
frontend/src/features/weather-overlays/lib/lightningLayers.js -> lightning GeoJSON, icon, layer, visibility, and blink helpers.
```

- [ ] **Step 6: Update `EntryPoints.md`**

Replace the "Add a new MET raster overlay" entry with:

```markdown
## 4. Add a new MET raster overlay

1. Add visibility/panel metadata to `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
2. Add frame selection or derived data to `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`.
3. Add Mapbox sync behavior to `syncRasterAndSigwxLayers` or a new weather-owned sync helper in `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
4. Add toggle or legend UI under `frontend/src/features/weather-overlays/`.
5. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition if a new UI slot is needed.
6. Verify in browser: layer appears, toggle works, basemap switch preserves visibility, and aviation/geo layers remain above raster overlays.
```

- [ ] **Step 7: Final status**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected:

- Only intended Phase 2 files are changed.
- Pre-existing `.codex/hooks*` changes are still separate unless the user asked to include them.

- [ ] **Step 8: Commit docs**

```powershell
git add Architecture.md EntryPoints.md
git commit -m "docs: update weather overlay ownership"
```

---

## Phase 2 Acceptance Criteria

- `MapView.jsx` no longer defines weather-specific Mapbox source/layer constants.
- `MapView.jsx` no longer defines lightning GeoJSON/icon/layer helpers.
- `MapView.jsx` no longer defines SIGWX_LOW vector layer helpers.
- `MapView.jsx` no longer calculates weather timeline ticks, SIGWX group visibility, advisory panel payloads, or lightning GeoJSON directly.
- Weather-specific Mapbox sync lives under `frontend/src/features/weather-overlays/lib`.
- Adding a new weather overlay primarily touches `features/weather-overlays` and API helpers.
- Build passes.
- Focused weather overlay tests pass.
- Browser smoke confirms basemap switching preserves weather overlay data and visibility.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-14-mapview-phase2-weather-overlay-ownership.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh implementer per task, review after each task, and keep commits small.
2. **Inline Execution** - execute tasks in this session with checkpoints after each task.

