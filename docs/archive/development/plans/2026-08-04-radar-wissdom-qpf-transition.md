# Radar WISSDOM and MAPLE QPF Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the derived radar-echo motion-vector control with exact-frame KMA WISSDOM imagery, and show MAPLE QPF imagery only in the future portion of the unified weather timeline while retaining the existing high-resolution ProjectAMO radar renderer.

**Architecture:** A new backend radar-graphics collector owns authenticated KMA `imgp` calls, image normalization, the existing ProjectAMO HSR nationwide WGS84 visual-alignment bounds, immutable image publication, and per-product frame metadata. `weather-overlays` owns all new Mapbox sources, frame selection, visibility, and the radar-contextual control; `MapView` only composes its model and style-sync calls. WISSDOM matches the selected radar `tm` exactly; QPF publishes future valid times and replaces, rather than overlaps, the observed radar raster.

**Tech Stack:** Node.js, Express, Sharp, KMA API Hub `typ03/cgi/rdr` graphics APIs, React 19, Mapbox GL JS, Node test runner, Playwright.

## Global Constraints

- Keep `backend/src/processors/radar-echo-processor.js` and its 1600×1830 ProjectAMO radar renderer; do not add KMA 4.1 HSR imagery in this plan.
- Use `KMA_RADAR_SATELLITE_AUTH_KEY` only on the backend; no browser URL, JSON field, browser bundle, or static data file may contain an API key.
- Store and compare all instants as epoch milliseconds or UTC; parse compact KMA `tm` at the backend boundary as KST and pass `tz` only to display formatters.
- Before implementation, record authoritative KMA evidence for the LCC definition, usable WISSDOM height catalog/basis/cadence, QPF `ef` catalog, cache/service terms, and a deliberately approved initial WISSDOM height. KMA has not published an `imgp` viewport-coordinate transform, so use the existing ProjectAMO HSR nationwide WGS84 bounds as the user-approved visual-alignment calibration; do not claim 100 m accuracy or add a speculative LCC transform.
- WISSDOM is visible only when `wissdomFrame.tm === radarFrame.tm`; nearest-frame fallback is forbidden.
- WISSDOM exposes exactly `305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048` metre choices (live-validated 1,000 ft-equivalent spacing), defaults to `1524`, and labels only metres: never FL, AGL, or MSL.
- WISSDOM height is metres and must not share KIM pressure-level state or be labelled AGL, MSL, or FL.
- QPF is MAPLE forecast imagery. It must show its source, analysis time, valid time, lead time, and `mm/h` in a map status card, and must never be composited with a radar frame.
- Map-owned resources live under `frontend/src/features/weather-overlays/lib/`; `MapView.jsx` does not gain feature-specific bare effects or layer IDs.
- A collector failure preserves the last complete metadata/image set. Publish images before their metadata and use atomic metadata writes.
- Remove the old radar-motion backend calculation/publication and all old frontend source/layer/control paths once the WISSDOM path passes its contracts.
- Browser completion evidence uses the repository Playwright contracts, a real development server, a radar/WISSDOM/QPF fixture, and two basemap switches.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/lib/kma-radar-graphics.js` | Pure KMA compact-time, `imgp` JSON, image-path, lead-time, palette/background, and user-approved visual-alignment bounds helpers. |
| `backend/src/processors/radar-graphics-processor.js` | Authenticated WISSDOM/QPF collection, image fetch/normalization, atomic per-product metadata publication, retention, and safe partial failure handling. |
| `backend/src/config.js` | KMA graphics endpoints, height/lead-time catalog, retention, delay, timeout, and schedule configuration. |
| `backend/src/index.js` | Guarded collector registration and cron schedule. |
| `backend/server.js` | Static cache policy, snapshot-meta entries, and read-only metadata routes. |
| `backend/test/kma-radar-graphics.test.js` | Parser, time, visual-alignment bounds, alpha-normalization, and no-key unit tests. |
| `backend/test/radar-graphics-processor.test.js` | Collector publication, failure preservation, exact metadata, retention, and request construction tests. |
| `frontend/src/api/weatherApi.js` | Initial, changed-data, and snapshot metadata wiring for WISSDOM/QPF indexes. |
| `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` | Exact WISSDOM selection; future QPF selection; timeline tick and status-card derived model. |
| `frontend/src/features/weather-overlays/lib/wissdomLayers.js` | WISSDOM Mapbox image lifecycle and public source/layer ownership IDs. |
| `frontend/src/features/weather-overlays/lib/qpfLayers.js` | QPF Mapbox image lifecycle and public source/layer ownership IDs. |
| `frontend/src/features/map/imageOverlay.js` | Releases superseded hashed Mapbox image sources on frame change, preserving one owned source per overlay. |
| `frontend/src/features/weather-overlays/lib/useRadarWindOverlay.js` | Radar-gated WISSDOM intent, selected-height state, and exact-frame availability. |
| `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` | Delegates WISSDOM/QPF installation and visibility sync; removes radar-motion ownership. |
| `frontend/src/features/weather-overlays/lib/metLayerVisibility.js` | Keeps the existing radar master rule while preventing stale WISSDOM intent when radar is disabled. |
| `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` | Replaces the motion action with the accessible WISSDOM control and height-source handoff. |
| `frontend/src/features/weather-overlays/WeatherLegends.jsx` | WISSDOM and QPF API-bar rendering plus source/time disclosures. |
| `frontend/src/features/weather-overlays/QpfStatusCard.jsx` | Map status card for forecast source, analysis/valid time, lead time, and unit. |
| `frontend/src/features/map/MapView.jsx` | High-level hook/model composition only; removes radar-motion composition. |
| `frontend/src/features/map/MapView.css` | Existing map visual tokens for the WISSDOM control, API legend, QPF status card, desktop/mobile layout. |
| `frontend/src/features/weather-overlays/*.test.js` | Pure selection, layer ownership, and control regressions. |
| `frontend/verification/contracts/radar-wissdom-qpf.spec.mjs` | Browser contract replacing `radar-motion.spec.mjs`. |
| `docs/policies/verification/contracts.md` | Replaces the active `radar-motion` registry row with this contract. |
| `Architecture.md` | Removes deleted radar-motion file roles and records WISSDOM/QPF ownership. |

## Task 1: Lock the KMA graphics contract before writing the collector

**Files:**
- Create: `backend/src/lib/kma-radar-graphics.js`
- Create: `backend/test/kma-radar-graphics.test.js`
- Modify: `backend/src/config.js`

**Interfaces:**
- Produces `parseKmaKstTm(tm): { tm: string, timeMs: number } | null`.
- Produces `parseImpgResult(payload, options): { tm, timeMs, validTimeMs, leadMinutes, imagePath, legendPath, projectedBounds, title } | null`.
- Produces `buildImpgRequest(product, { tm, heightM, leadMinutes }): URLSearchParams`.
- Produces `visualAlignmentBounds(): [[south, west], [north, east]]` from ProjectAMO's existing HSR nationwide renderer bounds; the KMA projected viewport rectangle is retained as source metadata but is not converted by a speculative transform.

- [ ] **Step 1: Record API fixtures and the visual-alignment evidence.**

  Complete this evidence record before Task 2: official KMA LCC definition; the documented absence of an `imgp` viewport-coordinate transform; ProjectAMO's existing HSR renderer bounds used as the user-approved visual-alignment calibration; supported WISSDOM heights, their vertical datum, cadence, and source default; supported QPF `ef` values/cadence; and cache/service terms. Save key-free WISSDOM/QPF response fixtures containing `imageCoverage*ProjX/Y`, `dateTime`, `title`, `url`, and `bar` plus the evidence record used by tests.

- [ ] **Step 2: Write failing pure-contract tests.**

  Add tests that prove:

  ```js
  assert.deepEqual(parseKmaKstTm('202307201700'), {
    tm: '202307201700',
    timeMs: Date.UTC(2023, 6, 20, 8, 0),
  })
  assert.equal(parseKmaKstTm('20230720170'), null)

  const qpf = parseImpgResult(qpfFixture, { product: 'qpf', requestedTm: '202307201700', leadMinutes: 60 })
  assert.equal(qpf.validTimeMs, Date.UTC(2023, 6, 20, 9, 0))
  assert.equal(qpf.leadMinutes, 60)
  assert.equal(qpf.imagePath.startsWith('/data/'), true)
  assert.equal(qpf.imagePath.includes('authKey'), false)
  ```

  Test that `visualAlignmentBounds()` returns the existing HSR nationwide renderer bounds exactly and that every returned coordinate is finite and correctly ordered. Retain the four KMA projected viewport values as source metadata, but do not assert or implement an unverified projected-coordinate conversion. Test that a missing/error `meta.errCd`, a non-`/data/` path, malformed KMA timestamp, or invalid rectangle returns `null`.

- [ ] **Step 3: Run the tests to prove the helpers do not exist.**

  Run: `node --test backend/test/kma-radar-graphics.test.js`  
  Expected: FAIL because the module and named exports do not exist.

- [ ] **Step 4: Implement the smallest pure helpers.**

  In `kma-radar-graphics.js`, use `URLSearchParams`; never concatenate an authentication URL into metadata. Validate `meta.errCd === '000'`, `data.result.url`, `data.result.bar`, and four finite projected bounds before returning a frame. Attach the fixed `visualAlignmentBounds()` result to each returned frame and retain the KMA rectangle as `projectedBounds`; do not raster-reproject. Keep the KMA product configuration in a table:

  ```js
  export const KMA_GRAPHIC_PRODUCTS = Object.freeze({
    wissdom: { endpoint: 'nph-rdr_wis_ana_imgp', dataDtlCd: 'rdr_rdr_wis_nqc_0', data1: 'r01', data2: 'rdr_wis_nqc' },
    qpf: { endpoint: 'nph-qpf_ana_imgp', dataDtlCd: 'rdr_rdr_qpf_ana1_0', data1: 'r01', data2: 'rdr_qpf_ana1' },
  })
  ```

  Add `config.radar_graphics` from the Task 1 evidence record: `wissdom_heights_m: [305, 610, 914, 1219, 1524, 1829, 2134, 2438, 2743, 3048]`, `initial_wissdom_height_m: 1524`, `qpf_lead_minutes`, `frame_step_minutes`, and `max_frames`; no API key values. If product terms/rate limit cannot support the calculated retained-frame request count, stop before Task 2 and revise the approved spec rather than silently reducing coverage.

- [ ] **Step 5: Run the unit test.**

  Run: `node --test backend/test/kma-radar-graphics.test.js`  
  Expected: PASS.

- [ ] **Step 6: Commit.**

  ```bash
  git add backend/src/lib/kma-radar-graphics.js backend/src/config.js backend/test/kma-radar-graphics.test.js
  git commit -m "feat: define KMA radar graphics contract"
  ```

## Task 2: Collect, normalize, and atomically publish KMA graphics frames

**Files:**
- Create: `backend/src/processors/radar-graphics-processor.js`
- Create: `backend/test/radar-graphics-processor.test.js`
- Modify: `backend/src/index.js`
- Modify: `backend/server.js`

**Interfaces:**
- Consumes Task 1's product table and parsed image descriptor.
- Produces `/data/radar/wissdom/wissdom_<heightM>_<tm>.webp`, `/data/radar/wissdom/wissdom_meta.json`, `/data/radar/qpf/qpf_<analysisTm>_p<leadMinutes>.webp`, and `/data/radar/qpf/qpf_meta.json`.
- Exports `processWissdom({ now, deps } = {}): Promise<{ type: 'wissdom', saved: boolean }>` and `processQpf({ now, deps } = {}): Promise<{ type: 'qpf', saved: boolean }>` for independent `runWithLock` registrations.

- [ ] **Step 1: Write failing processor tests with injected network and filesystem dependencies.**

  Cover these cases:

  ```js
  await processWissdom({ now: new Date('2026-08-04T08:07:00Z'), deps })
  assert.equal(readMeta('wissdom').framesByHeight['1500'].at(-1).tm, '202608041705')
  assert.equal(readMeta('qpf').frames.at(-1).leadMinutes, 60)
  assert.equal(readMeta('qpf').frames.at(-1).validTimeMs, Date.UTC(2026, 7, 4, 9, 5))
  ```

  Assert image files are written before metadata, no image URL includes `authKey`, transparent output retains a coloured rainfall/wind pixel while replacing declared KMA background pixels with alpha zero, and a failed fetch leaves the prior complete metadata untouched. Assert missing KMA data is an absent frame, while transport or image validation failure preserves the prior frame. Assert a WISSDOM failure does not stop QPF publication and a QPF failure does not stop WISSDOM publication. Assert cleanup retains only configured frames and legends referenced by retained metadata.

- [ ] **Step 2: Run the processor test to verify failure.**

  Run: `node --test backend/test/radar-graphics-processor.test.js`  
  Expected: FAIL because the collector is absent.

- [ ] **Step 3: Implement collection and image publication.**

  Implement one module with independent product writers and entry points under `radar/wissdom/` and `radar/qpf/`:

  - Compute missing frames first. Request only absent WISSDOM `(heightM, tm)` pairs and absent QPF `(analysisTm, leadMinutes)` pairs; never redownload an already published complete pair.
  - Request WISSDOM only on the evidence-confirmed source cadence and publish a frame only when KMA's returned `tm` equals the requested timestamp.
  - Request every evidence-confirmed QPF lead for the latest available analysis timestamp; publish only frames whose parsed valid time equals `analysisTimeMs + leadMinutes * 60_000`.
  - Download image and API legend server-side, validate PNG/WebP signatures, normalize them with Sharp to WebP, and apply the tested background-alpha rule.
  - Publish image and legend atomically, then write metadata atomically. Store `tm`, `timeMs`, `analysisTimeMs`, `validTimeMs`, `leadMinutes`, `heightM`, `bounds`, `path`, `legendPath`, `title`, and `source: 'KMA'`.
  - Preserve last successful frames if any request in a later run fails; never replace an index with an empty index.

- [ ] **Step 4: Register the collector and cache policy.**

  Add separate `wissdom` and `qpf` locks, enabled/auth-key guards, initial registrations, and evidence-confirmed schedules in `backend/src/index.js`. Add tests that a disabled product or missing key does not register/collect that product. Add static cache rules in `backend/server.js` for only the exact `radar/wissdom/...webp`, `radar/qpf/...webp`, and their legend filenames. Register both metadata files in `SNAPSHOT_SOURCES`, plus read-only `/api/radar/wissdom-meta` and `/api/radar/qpf-meta` routes.

- [ ] **Step 5: Run targeted tests.**

  Run: `node --test backend/test/kma-radar-graphics.test.js backend/test/radar-graphics-processor.test.js`  
  Expected: PASS.

- [ ] **Step 6: Commit.**

  ```bash
  git add backend/src/processors/radar-graphics-processor.js backend/test/radar-graphics-processor.test.js backend/src/index.js backend/server.js
  git commit -m "feat: collect KMA WISSDOM and QPF graphics"
  ```

## Task 3: Deliver new metadata through the polling contract

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `frontend/src/app/pollingData.js`
- Modify: `frontend/src/app/snapshotMeta.test.js`
- Modify: `frontend/src/app/pollingData.test.js`

**Interfaces:**
- Consumes `/data/radar/wissdom/wissdom_meta.json` and `/data/radar/qpf/qpf_meta.json`.
- Produces `weatherData.wissdomMeta` and `weatherData.qpfMeta` and matching snapshot keys `wissdomMeta`, `qpfMeta`.

- [ ] **Step 1: Write failing snapshot and changed-data tests.**

  Add a fixture with old and new metadata `tm`/content hash. Assert `detectSnapshotChanges()` reports only the changed graphics key, `loadChangedWeatherData()` fetches only the corresponding metadata URL, and `mergePollingData()` preserves the prior known-good graphics metadata when a changed request returns `undefined`.

- [ ] **Step 2: Run the tests to verify failure.**

  Run: `node --test frontend/src/app/snapshotMeta.test.js frontend/src/app/pollingData.test.js`  
  Expected: FAIL because neither key is part of the frontend snapshot contract.

- [ ] **Step 3: Implement initial and changed-data wiring.**

  Add both metadata URLs to `loadWeatherData()`, `buildSnapshotMetaFromData()`, and `loadChangedWeatherData()`. Treat both as normal non-deferred weather data: their visibility and exact-frame availability must update within the standard 60-second polling cycle without opening another panel.

- [ ] **Step 4: Run the tests.**

  Run: `node --test frontend/src/app/snapshotMeta.test.js frontend/src/app/pollingData.test.js`  
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/api/weatherApi.js frontend/src/app/snapshotMeta.js frontend/src/app/pollingData.js frontend/src/app/snapshotMeta.test.js frontend/src/app/pollingData.test.js
  git commit -m "feat: poll radar graphics metadata"
  ```

## Task 4: Build the exact-frame weather model and unified future QPF timeline

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.js`
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`

**Interfaces:**
- Consumes `echoMeta`, `wissdomMeta`, `qpfMeta`, `visibility.radar`, `selectedWeatherTimeMs`, `radarWindHeightM`, and `radarWindRequested`.
- Produces `wissdomFrame`, `qpfFrame`, `qpfStatus`, `forecastTimelineTicks`, and `radarDisplayVisible` in `buildWeatherOverlayModel()`.

- [ ] **Step 1: Add failing selection tests.**

  Use radar frames at 10:20/10:25 and WISSDOM frames at 10:20/10:30. Assert that selection at 10:25 returns `wissdomFrame: null` and `wissdomAvailable: false`; adding a 10:25 WISSDOM frame returns only that frame. Test changing `radarWindHeightM` selects that height's index without changing any KIM selection.

  Add QPF fixtures with analysis time 10:25 and valid times 10:35/10:45/10:55. Assert selection at 10:45 returns only the +20 QPF frame, `qpfStatus = { source: 'MAPLE', analysisTimeMs, validTimeMs, leadMinutes: 20, unit: 'mm/h' }`, and `radarDisplayVisible === false`. Assert a time between ticks, a past time, or a missing QPF frame returns no QPF and never chooses a nearest forecast.

- [ ] **Step 2: Run model tests to verify failure.**

  Run: `node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`  
  Expected: FAIL because the model lacks graphics inputs and exact selection.

- [ ] **Step 3: Implement the pure model.**

  Normalize backend metadata into sorted `{ tm, timeMs, ... }` records. Add QPF valid times to the existing future timeline list without treating them as KIM forecast times. Select QPF by exact `validTimeMs`; select WISSDOM by exact radar `tm` and selected height. In a future QPF frame, suppress the observed radar raster and radar-motion model. Keep existing radar nearest-previous behaviour only in the observed portion of the rail. Add playback stepping tests that cross the final observation → first QPF tick and back without retaining either stale raster.

- [ ] **Step 4: Run model tests.**

  Run: `node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`  
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/timelineRailModel.js frontend/src/features/weather-overlays/lib/timelineRailModel.test.js
  git commit -m "feat: select exact WISSDOM and future QPF frames"
  ```

## Task 5: Replace radar-motion map ownership with WISSDOM/QPF image adapters

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/wissdomLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/qpfLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/wissdomLayers.test.js`
- Create: `frontend/src/features/weather-overlays/lib/qpfLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`
- Modify: `frontend/src/features/map/imageOverlay.js`
- Modify: `frontend/src/features/map/imageOverlay.test.js`
- Delete: `frontend/src/features/weather-overlays/lib/radarMotionLayers.js`
- Delete: `frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js`

**Interfaces:**
- Produces `WISSDOM_SOURCE`, `WISSDOM_LAYER`, `syncWissdomLayer(map, model)`.
- Produces `QPF_SOURCE`, `QPF_LAYER`, `syncQpfLayer(map, model)`.
- Both adapters consume a `{ path, bounds }` frame and use `addOrUpdateImageOverlay()`; QPF and WISSDOM layer IDs are exported in weather-overlay ownership arrays.

- [ ] **Step 1: Write failing map-adapter tests.**

  With the existing Mapbox mock, assert exact source URL and four image coordinates, visibility false for null/mismatched frames, and one source/layer after a repeated sync. Add an A→B→A frame test that asserts the old hashed image source is removed after each change and layer ordering remains stable. Assert QPF is above observed radar, WISSDOM is above radar but below advisory vectors, and both are correctly recreated after calling `installWeatherOverlayLayers()` on a fresh mock.

- [ ] **Step 2: Run tests to verify failure.**

  Run: `node --test frontend/src/features/weather-overlays/lib/wissdomLayers.test.js frontend/src/features/weather-overlays/lib/qpfLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`  
  Expected: FAIL because neither adapter or ownership ID exists.

- [ ] **Step 3: Implement adapters and remove motion ownership.**

  Use `addOrUpdateImageOverlay()` rather than DOM images or HTML markers. Change `imageOverlay.js` so replacing a frame removes the old owned hashed source after the raster layer is rebound, and add the new IDs to `WEATHER_OVERLAY_SOURCE_IDS`/`WEATHER_OVERLAY_LAYER_IDS`; call both sync functions from `syncRasterAndSigwxLayers()`. Remove motion imports, model fields, source IDs, and sync calls. Do not modify `MapView` layer ordering directly.

- [ ] **Step 4: Run map unit tests.**

  Run: `node --test frontend/src/features/weather-overlays/lib/wissdomLayers.test.js frontend/src/features/weather-overlays/lib/qpfLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`  
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/features/weather-overlays/lib/wissdomLayers.js frontend/src/features/weather-overlays/lib/qpfLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/wissdomLayers.test.js frontend/src/features/weather-overlays/lib/qpfLayers.test.js frontend/src/features/map/imageOverlay.js frontend/src/features/map/imageOverlay.test.js
  git rm frontend/src/features/weather-overlays/lib/radarMotionLayers.js frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js
  git commit -m "feat: render WISSDOM and QPF map layers"
  ```

## Task 6: Replace the radar-motion control with the WISSDOM height-aware control

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/useRadarWindOverlay.js`
- Create: `frontend/src/features/weather-overlays/lib/useRadarWindOverlay.test.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Delete: `frontend/src/features/weather-overlays/lib/useRadarMotionOverlay.js`

**Interfaces:**
- `useRadarWindOverlay({ radarEnabled, availableHeightsM, exactFrameAvailable })` returns `{ requestedVisible, effectiveVisible, heightM, setHeightM, setRequestedVisible }`.
- `WeatherOverlayPanel` receives `radarWindAvailable`, `radarWindRequested`, `radarWindHeightM`, `onRadarWindRequestedChange`, and `onRadarWindHeightChange`.

- [ ] **Step 1: Write failing hook and panel tests.**

  Assert the hook initializes with `initial_wissdom_height_m: 1524`, resets `requestedVisible` to false when radar turns off, never reports effective visibility without an exact matching frame, and retains its height while availability temporarily disappears. Update the panel string test so it requires `레이더 바람장 (WISSDOM)` and rejects `레이더 에코 이동벡터 표시`.

- [ ] **Step 2: Run tests to verify failure.**

  Run: `node --test frontend/src/features/weather-overlays/lib/useRadarWindOverlay.test.js frontend/src/features/weather-overlays/WeatherLegends.test.js`  
  Expected: FAIL because the WISSDOM hook and control do not exist.

- [ ] **Step 3: Implement the UI state replacement.**

  Replace the existing panel title action with one accessible pressed button labelled `레이더 바람장 (WISSDOM) · ${heightM.toLocaleString()} m`; retain the button location under `레이더/위성`, show it only while radar is enabled, and disable it with `표시 시각의 WISSDOM 자료 없음` when exact availability is false. Remove all radar-motion props and state from `MapView`, weather model destructuring, and `WeatherLegends` motion notes. Add the WISSDOM API legend and actual KMA observation timestamp only while effective visibility is true.

- [ ] **Step 4: Integrate with the existing vertical rail without sharing KIM state.**

  Extend the existing vertical-rail composition so it exposes a WISSDOM source selector only when both KIM and WISSDOM controls are active. The active source label is `WISSDOM · {heightM} m` or the existing KIM pressure label. Selecting WISSDOM changes only `heightM`; selecting KIM changes only `nwpSelection.level`. Preserve keyboard vertical-arrow forwarding and the existing mobile control path.

- [ ] **Step 5: Run the targeted frontend tests.**

  Run: `node --test frontend/src/features/weather-overlays/lib/useRadarWindOverlay.test.js frontend/src/features/weather-overlays/WeatherLegends.test.js frontend/src/features/weather-overlays/lib/metLayerVisibility.test.js`  
  Expected: PASS.

- [ ] **Step 6: Commit.**

  ```bash
  git add frontend/src/features/weather-overlays/lib/useRadarWindOverlay.js frontend/src/features/weather-overlays/lib/useRadarWindOverlay.test.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/WeatherLegends.test.js frontend/src/features/weather-overlays/lib/metLayerVisibility.js frontend/src/features/map/MapView.jsx
  git rm frontend/src/features/weather-overlays/lib/useRadarMotionOverlay.js
  git commit -m "feat: replace radar motion control with WISSDOM"
  ```

## Task 7: Add the QPF map status card and responsive disclosure layout

**Files:**
- Create: `frontend/src/features/weather-overlays/QpfStatusCard.jsx`
- Create: `frontend/src/features/weather-overlays/QpfStatusCard.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`

**Interfaces:**
- `QpfStatusCard({ status, tz })` renders `null` without an exact QPF status; otherwise renders source, analysis time, valid time, lead minutes, and unit.
- `MapView` supplies only `weatherOverlayModel.qpfStatus` and `tz`.

- [ ] **Step 1: Write failing component tests.**

  Assert `QpfStatusCard` renders nothing for `null`, and for a fixed status renders the Korean source label, `MAPLE`, both KST and UTC format cases, `+30분`, and `mm/h`. Assert no rendered text calls QPF observed radar or omits the forecast qualifier.

- [ ] **Step 2: Run the component test to verify failure.**

  Run: `node --test frontend/src/features/weather-overlays/QpfStatusCard.test.js`  
  Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the card and layout.**

  Render the card in the existing map overlay composition area, not inside the general legend drawer. Use the existing map CSS tokens and a solid, readable panel:

  ```text
  초단기 강수예측
  MAPLE · 기준 10:25 KST
  선택 10:55 KST · +30분 · mm/h
  ```

  Position it so it does not cover basemap selection, desktop panel controls, mobile sheet controls, the unified time rail, or the QPF API legend. Let narrow layouts wrap within the card; do not introduce a new fixed mobile breakpoint.

- [ ] **Step 4: Run the component test.**

  Run: `node --test frontend/src/features/weather-overlays/QpfStatusCard.test.js`  
  Expected: PASS.

- [ ] **Step 5: Commit.**

  ```bash
  git add frontend/src/features/weather-overlays/QpfStatusCard.jsx frontend/src/features/weather-overlays/QpfStatusCard.test.js frontend/src/features/map/MapView.jsx frontend/src/features/map/MapView.css frontend/src/features/weather-overlays/WeatherLegends.jsx
  git commit -m "feat: disclose MAPLE forecast state on map"
  ```

## Task 8: Remove backend radar-motion artifacts and replace browser contracts

**Files:**
- Modify: `backend/src/processors/radar-echo-processor.js`
- Modify: `backend/src/config.js`
- Modify: `backend/server.js`
- Delete: `backend/src/processors/radar-motion.js`
- Delete: `backend/src/processors/radar-motion-model.js`
- Delete: `backend/test/radar-motion.test.js`
- Delete: `backend/test/radar-motion-model.test.js`
- Delete: `backend/test/radar-echo-motion-publication.test.js`
- Delete: `frontend/verification/contracts/radar-motion.spec.mjs`
- Create: `frontend/verification/contracts/radar-wissdom-qpf.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`
- Modify: `Architecture.md`

**Interfaces:**
- Removes every `motion` field from radar metadata and all `motion_korea_*.geojson` cache handling.
- Browser fixture publishes `echo_meta`, WISSDOM height metadata, QPF metadata, and image routes with deterministic KST timestamps.

- [ ] **Step 1: Write the replacement Playwright contract first.**

  Build an exact fixture with radar 10:20/10:25, WISSDOM 10:20/10:25 at 1524 m but only 10:20 at 3048 m, and QPF valid times 10:35/+10 and 10:55/+30. The contract must prove:

  1. The WISSDOM button is enabled at 10:25/1524 m, toggles the WISSDOM raster layer, and announces `1,524 m`.
  2. Changing to 3048 m at 10:25 disables the control and removes the WISSDOM layer because no exact frame exists.
  3. Changing back to 10:20/3048 m makes the exact WISSDOM frame available.
  4. Moving to QPF 10:55 hides the radar and WISSDOM layers, shows QPF, and exposes `MAPLE`, the correct basis time, `+30분`, and `mm/h` in the map card.
  5. Returning to 10:25 hides QPF and the status card and restores the observed radar state.
  6. With KIM Wind active at a fixed pressure level, changing WISSDOM height leaves the KIM pressure selection unchanged; changing KIM pressure leaves WISSDOM height unchanged.
  7. The WISSDOM API legend changes with height/frame and the QPF API legend remains tied to the exact selected QPF frame.
  8. Playback crosses observed → forecast and forecast → observed without retaining a stale source/layer.
  9. Two basemap switches retain a single WISSDOM and QPF source/layer with the correct visibility, and coast/major-airport visual checks record whether the user-approved HSR-bounds calibration is acceptable; this check does not claim 100 m accuracy.
  10. Axe finds no violations in the WISSDOM control and QPF status card on desktop and mobile projects.
  11. A test scan of frontend build output, fixture responses, published metadata, and image URLs finds no KMA authentication key.

- [ ] **Step 2: Run the new browser contract to verify it fails.**

  Run: `npm run dev:contract -- --grep "레이더 WISSDOM 및 MAPLE QPF"`  
  Expected: FAIL because the fixture routes, controls, and layers do not exist.

- [ ] **Step 3: Remove radar-motion backend code and metadata paths.**

  Remove `createMotionInput`, `attachMotionFrame`, `motion_input_latest.bin`, motion filename cleanup, motion configuration, and all motion routes/cache headers. Keep the raw radar fetch, parser, high-resolution PNG render, frame retention, and `echo_meta.json` shape except for its removed `motion` property.

- [ ] **Step 4: Execute all targeted tests and the actual browser contract.**

  Run:

  ```bash
  node --test backend/test/kma-radar-graphics.test.js backend/test/radar-graphics-processor.test.js backend/test/radar-echo-parser.test.js
  node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/wissdomLayers.test.js frontend/src/features/weather-overlays/lib/qpfLayers.test.js frontend/src/features/weather-overlays/lib/useRadarWindOverlay.test.js frontend/src/features/weather-overlays/QpfStatusCard.test.js
  npm run dev:contract -- --grep "레이더 WISSDOM 및 MAPLE QPF"
  ```

  Expected: PASS. If any command fails, stop and apply `systematic-debugging` before changing more code.

- [ ] **Step 5: Capture browser evidence.**

  Follow `docs/operations/dev-server-and-capture.md` and the verification contract registry. Capture desktop and mobile screenshots for: observed radar with WISSDOM, exact-frame unavailable WISSDOM, QPF +30, and post-basemap-switch QPF. Save the manifest and QA notes under `artifacts/responsive-screenshots/radar-wissdom-qpf/YYYY-MM-DD_HHMM_label/`.

- [ ] **Step 6: Commit.**

  ```bash
  git add backend/src/processors/radar-echo-processor.js backend/src/config.js backend/server.js frontend/verification/contracts/radar-wissdom-qpf.spec.mjs docs/policies/verification/contracts.md Architecture.md
  git rm backend/src/processors/radar-motion.js backend/src/processors/radar-motion-model.js backend/test/radar-motion.test.js backend/test/radar-motion-model.test.js backend/test/radar-echo-motion-publication.test.js frontend/verification/contracts/radar-motion.spec.mjs
  git commit -m "feat: replace radar motion with WISSDOM and QPF"
  ```

## Self-review

| Spec requirement | Plan task |
|---|---|
| Keep existing high-resolution radar; exclude 4.1 HSR | Global constraints, Tasks 2 and 8 |
| Backend-only credentials, atomic publish, failure preservation | Tasks 1–3 |
| WISSDOM radar-gated, exact timestamp only, height in metres | Tasks 2, 4, 5, 6, 8 |
| Separate WISSDOM height and KIM pressure selection | Tasks 4 and 6 |
| QPF future-only, no radar overlap, API source/time/lead/unit disclosure | Tasks 2, 4, 5, 7, 8 |
| Style reload/basemap resilience and browser evidence | Tasks 5 and 8 |
| Remove radar-motion feature end-to-end | Tasks 5, 6, and 8 |

Placeholder scan completed: no `TODO`, `TBD`, or unnamed implementation/test steps remain. Interface names introduced in later tasks are defined in the task that produces them.
