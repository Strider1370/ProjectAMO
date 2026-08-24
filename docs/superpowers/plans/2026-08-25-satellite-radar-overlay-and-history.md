# Satellite, Radar Overlay, and History Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give every active satellite product an exact three-hour, ten-minute history and keep radar echo deterministically above either satellite image.

**Architecture:** Keep the existing GK2A processor/store boundaries and give all satellite products the existing config.satellite.max_frames limit of 19. Initial collection fills missing history once; recurring checks remain deduplicated. Extend the shared image-overlay helper with an optional insertion anchor, then use the weather-overlays adapters to enforce infrared < visible < radar without adding map state to MapView.

**Tech Stack:** Node.js ESM, node:test, Sharp, React, Mapbox GL JS, Playwright contracts.

## Global Constraints

- Satellite-family history is one frame every 10 minutes, 19 frames, including newest and exactly T-180 minutes.
- Upstream checking remains every five minutes and must not repeat a processed observation timestamp.
- Existing valid satellite pixels publish with alpha 255; missing pixels stay transparent.
- Satellite raster opacity is exactly 1.0; deterministic stack is infrared < visible < radar.
- Preserve last usable assets/metadata when a collection or backfill frame fails.
- Do not change HSR, HCI, inactive radar echo-bin, or inactive Echo Top collection.
- Do not add packages, endpoints, UI controls, or configuration knobs.
- Preserve the user's unrelated weather-overlay/advisory changes.

---

## File Structure

- backend/src/config.js — one 19-frame satellite-family retention value and a five-minute visible check.
- backend/src/processors/satellite-processor.js — initial full-history frame collection and CI/CTPS collection for each newly retained frame.
- backend/src/processors/satellite-visible-processor.js — existing timestamp collector reused to fill all missing visible frames and retain 19.
- backend/src/processors/convective-satellite-{processor,store}.js — CI/CTPS publish one complete frame atomically and use the same retention cap.
- backend/src/index.js — full-history mode only for initial collection; cron retains normal deduplicated mode.
- backend/src/parsers/satellite-parser.js — opaque valid IR/FOG RGBA output.
- backend/test/{historical-weather-frames,satellite-download-budget,convective-satellite-store,kim-scheduler,satellite-render-alpha}.test.js — server behavior regressions, including failed-backfill last-good retention.
- frontend/src/features/map/imageOverlay.js — optional insertion anchor.
- frontend/src/features/map/imageOverlay.test.js and frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js — source/layer order and opacity.
- frontend/src/features/weather-overlays/lib/{weatherOverlayLayers,kmaCompositeLayers}.js — canonical stack users.
- frontend/verification/contracts/map-base.spec.mjs — browser assertion using the existing window.__map handle.

## Task 1: Normalize retained history and startup backfill

**Files:**

- Modify: backend/src/config.js:235-246,363-369
- Modify: backend/src/processors/satellite-processor.js:35-337
- Modify: backend/src/processors/satellite-visible-processor.js:18-154
- Modify: backend/src/processors/convective-satellite-processor.js:13-28
- Modify: backend/src/processors/convective-satellite-store.js:1-20
- Modify: backend/src/index.js:180-280
- Test: backend/test/historical-weather-frames.test.js
- Test: backend/test/satellite-download-budget.test.js
- Create: backend/test/convective-satellite-store.test.js
- Test: backend/test/kim-scheduler.test.js

**Interfaces:**

- Consumes: config.satellite.max_frames, process({ now, fillAll, collectConvective }), and processSatelliteVisible({ now, deps }).
- Produces: exported buildFrameSpecs(latestRequestTm, frameCount); processSatelliteVisible({ now, deps, fillAll }); processed timestamp lists for saved and night frames; initial job functions injectable through buildInitialCollectionJobs dependencies.

- [ ] **Step 1: Write failing history, deduplication, and startup tests**

~~~
test('a 19-frame satellite window spans exactly 180 minutes', () => {
  const frames = buildFrameSpecs('202608250810', 19)
  assert.equal(frames.length, 19)
  assert.equal(frames[0].requestTm, '202608250510')
  assert.equal(frames.at(-1).requestTm, '202608250810')
})

test('visible full-history collection fetches each missing timestamp once', async () => {
  const result = await processSatelliteVisible({ now, deps, fillAll: true })
  await processSatelliteVisible({ now, deps, fillAll: true })
  assert.equal(result.frameCount, 19)
  assert.equal(counter.calls, 19)
})

test('FOG absence never causes the same IR timestamp to download again', async () => {
  await process({ now, fillAll: true, collectConvective: false })
  await process({ now, fillAll: true, collectConvective: false })
  assert.equal(irFetchesFor('202608250810'), 1)
  assert.equal(fogFetchesFor('202608250810'), 1)
})

test('failed backfill leaves previous IR, visible, CI, and CTPS metadata and assets usable', async () => {
  await assertLastGoodSnapshotAfterFailedFrame(root)
})

test('initial satellite jobs request full history', async () => {
  await satelliteJob()
  assert.deepEqual(satelliteCalls, [{ fillAll: true }])
})
~~~

- [ ] **Step 2: Run tests to verify failure**

Run: node --test backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js backend/test/kim-scheduler.test.js

Expected: FAIL because the public frame helper, persistent processed timestamps, atomic complete-frame publication, and injectable full-history initial jobs do not exist.

- [ ] **Step 3: Implement the smallest shared collection path**

~~~
satellite.max_frames = 19
schedule.satellite_interval = '*/5 * * * *'
schedule.satellite_visible_interval = '*/5 * * * *'

export async function processSatelliteVisible({ now = new Date(), deps = {}, fillAll = false } = {}) {
  // Build 10-minute request timestamps from newest through T-180.
  // fillAll calls the existing timestamp collector for missing frames only.
}

['satellite', () => satelliteProcessor.process({ fillAll: true })]
['satellite_visible', () => satelliteVisibleProcessor.processSatelliteVisible({ fillAll: true })]
~~~

Use activeConfig.satellite.max_frames for visible retention instead of MAX_FRAMES. In satelliteProcessor.process({ fillAll: true }), call collectConvectiveSatelliteFrame for every successful missing IR frame rather than only latestFrameSpec. Keep Promise.allSettled error isolation so a failed CI/CTPS frame cannot replace valid published output. Cron callbacks still call each processor with no arguments.

Replace the single visible lastCheckedTm value with a bounded processedTms list covering the same 19 source times, so night frames are also skipped on a second full backfill. Remove same-timestamp FOG retry scheduling: a FOG-unavailable frame is published as IR-only once and remains complete for deduplication. Make CI and CTPS render to temporary values first, then publish both facets with one store operation only when both are valid; a failure retains the prior complete frame and its assets. For IR and visible metadata, retain the prior published frame set and defer cleanup whenever a requested frame fails; only atomically publish/cleanup a complete candidate window. Export buildFrameSpecs deliberately for the exact-window test. Add optional satellite and visible processor functions to buildInitialCollectionJobs dependencies solely for the startup-job spy.

- [ ] **Step 4: Run focused tests to verify pass**

Run: node --test backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js backend/test/kim-scheduler.test.js

Expected: PASS; full history has 19 ten-minute frames, spans 180 minutes, repeated full backfill creates no duplicate request, and a failed frame leaves all four product metadata/assets usable.

- [ ] **Step 5: Commit Task 1**

~~~
git add backend/src/config.js backend/src/index.js backend/src/processors/satellite-processor.js backend/src/processors/satellite-visible-processor.js backend/src/processors/convective-satellite-processor.js backend/src/processors/convective-satellite-store.js backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js backend/test/convective-satellite-store.test.js backend/test/kim-scheduler.test.js
git commit -m "feat: normalize satellite history backfill"
~~~

## Task 2: Make valid satellite pixels opaque

**Files:**

- Modify: backend/src/parsers/satellite-parser.js:246-296
- Test: backend/test/satellite-render-alpha.test.js

**Interfaces:**

- Consumes: renderFogImage(irParsed, fogParsed) and renderVisible(parsed).
- Produces: RGBA buffers where every sampled source pixel has alpha 255; display-grid pixels with no source mapping retain alpha 0.

- [ ] **Step 1: Write the failing alpha test**

~~~
test('satellite renderers use opaque valid pixels and transparent unmapped pixels', async () => {
  const ir = await renderFogImage(parsedIr, { fogData: null, delFta: null })
  const pixels = await sharp(ir.pngBuffer).raw().toBuffer()
  assert.equal(pixels[3], 255)
  assert.equal(alphaAtUnmappedDisplayPixel(pixels), 0)

  const visible = await renderVisible(parsedVisible)
  assert.equal(visible.buffer[3], 255)
})
~~~

- [ ] **Step 2: Run test to verify failure**

Run: node --test backend/test/satellite-render-alpha.test.js

Expected: FAIL because IR and fog currently write alpha 200 and 220.

- [ ] **Step 3: Set only valid IR/FOG alpha bytes to 255**

~~~
buf[o + 3] = 255
~~~

Place this inside the existing valid display-pixel branch. Do not alter the zero-filled buffer or visible renderer alpha assignment.

- [ ] **Step 4: Run alpha and satellite tests**

Run: node --test backend/test/satellite-render-alpha.test.js backend/test/satellite-download-budget.test.js

Expected: PASS; valid IR, fog, and visible pixels are opaque; unmapped pixels remain transparent.

- [ ] **Step 5: Commit Task 2**

~~~
git add backend/src/parsers/satellite-parser.js backend/test/satellite-render-alpha.test.js
git commit -m "fix: make satellite pixels opaque"
~~~

## Task 3: Enforce canonical raster stack and opacity

**Files:**

- Modify: frontend/src/features/map/imageOverlay.js:26-72
- Modify: frontend/src/features/map/imageOverlay.test.js
- Modify: frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:37-40,477-513
- Modify: frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js:8-38
- Modify: frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js

**Interfaces:**

- Consumes: addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity, beforeId? }).
- Produces: a same-style insertion anchor; infrared and visible install below radar and frame replacement preserves that placement.

- [ ] **Step 1: Write failing ordering and opacity tests**

~~~
test('explicit beforeId is honored on install and replacement', () => {
  addOrUpdateImageOverlay(map, { sourceId: 'visible', layerId: 'visible', frame, opacity: 1, beforeId: 'radar' })
  assert.deepEqual(map.layerOrder, ['visible', 'radar'])
})

test('weather raster order is infrared, visible, then radar at opacity 1', () => {
  // The test map addLayer(layer, beforeId) must splice its layerOrder at beforeId.
  // Import syncKmaCompositeLayers and VISIBLE_LAYER explicitly.
  syncRasterAndSigwxLayers(map, satelliteAndRadarModel)
  syncKmaCompositeLayers(map, visibleModel)
  assert.ok(order.indexOf(SATELLITE_LAYER) < order.indexOf(VISIBLE_LAYER))
  assert.ok(order.indexOf(VISIBLE_LAYER) < order.indexOf(RADAR_LAYER))
  assert.equal(map.getLayer(SATELLITE_LAYER).paint['raster-opacity'], 1)
  assert.equal(map.getLayer(VISIBLE_LAYER).paint['raster-opacity'], 1)
})
~~~

- [ ] **Step 2: Run tests to verify failure**

Run: node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js

Expected: FAIL because beforeId is unsupported and satellite/visible use 0.92/0.9.

- [ ] **Step 3: Add one optional anchor and use it only in the owning adapters**

~~~
export function addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity, beforeId }) {
  // On first add and source replacement:
  map.addLayer(rasterLayer(layerId, currentSourceId, opacity), beforeId)
}

addOrUpdateImageOverlay(map, { sourceId: VISIBLE_SOURCE, layerId: VISIBLE_LAYER, frame: visibleFrame, opacity: 1, beforeId: RADAR_LAYER })
addOrUpdateImageOverlay(map, { sourceId: SATELLITE_SOURCE, layerId: SATELLITE_LAYER, frame: model.satelliteFrame, opacity: 1, beforeId: VISIBLE_LAYER })
addOrUpdateImageOverlay(map, { sourceId: RADAR_SOURCE, layerId: RADAR_LAYER, frame: model.radarFrame, opacity: 0.88 })
~~~

If an anchor does not exist, retain the helper's current append behavior. Do not move HSR/HCI or SIGWX layers.

- [ ] **Step 4: Run focused tests to verify pass**

Run: node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js

Expected: PASS; either initial metadata order and every frame replacement converges to infrared < visible < radar.

- [ ] **Step 5: Commit Task 3**

~~~
git add frontend/src/features/map/imageOverlay.js frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js
git commit -m "fix: keep radar above satellite imagery"
~~~

## Task 4: Verify the Mapbox browser contract and release state

**Files:**

- Modify: frontend/verification/contracts/map-base.spec.mjs:22-110

**Interfaces:**

- Consumes: the existing map-base fixture lifecycle and window.__map development handle.
- Produces: browser evidence that checks visibility, opacity, and order after a basemap replacement, plus named visible+radar and infrared+radar screenshots.

- [ ] **Step 1: Add a failing deterministic overlay fixture and browser assertion**

~~~
test('keeps radar above visible and infrared satellite after a style replacement', async ({ page }) => {
  await installSatelliteRadarFixture(page)
  await openWeatherPanelAndEnable(page, ['레이더', '적외영상', '가시영상'])
  await expect.poll(() => page.evaluate(() => {
    const ids = window.__map.getStyle().layers.map(({ id }) => id)
    return {
      ir: ids.indexOf('kma-satellite-overlay'),
      visible: ids.indexOf('gk2a-visible-overlay'),
      radar: ids.indexOf('kma-radar-overlay'),
      irOpacity: window.__map.getPaintProperty('kma-satellite-overlay', 'raster-opacity'),
      visibleOpacity: window.__map.getPaintProperty('gk2a-visible-overlay', 'raster-opacity'),
    }
  })).toMatchObject({ irOpacity: 1, visibleOpacity: 1 })
  await page.screenshot({ path: 'artifacts/verification/satellite-radar-visible-linux.png' })
  // Turn visible off, infrared on; capture satellite-radar-infrared-linux.png.
  // Switch base map away and back; assert ir < visible < radar again.
})
~~~

- [ ] **Step 2: Run the focused contract to verify failure**

Run: npm --prefix frontend run dev:contract:fast -- contracts/map-base.spec.mjs -g "keeps radar above visible and infrared satellite"

Expected: FAIL before Task 3 because satellite opacity or order is not canonical.

- [ ] **Step 3: Run the focused contract after Tasks 1-3**

Run: npm --prefix frontend run dev:contract:fast -- contracts/map-base.spec.mjs -g "keeps radar above visible and infrared satellite"

Expected: PASS on desktop; radar stays above both satellite layers after style replacement. The two captures show opaque satellite imagery without basemap tint and the same radar echo above visible and infrared fixtures.

- [ ] **Step 4: Run release checks and update the graph**

Run: node --test backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js backend/test/convective-satellite-store.test.js backend/test/satellite-render-alpha.test.js backend/test/kim-scheduler.test.js && node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js && npm --prefix frontend run build && npm run dev:contract -- --grep map-base && graphify update .

Expected: every command exits 0. The final contract covers desktop, iPad landscape, and mobile with managed servers.

- [ ] **Step 5: Commit Task 4**

~~~
git add frontend/verification/contracts/map-base.spec.mjs graphify-out
git commit -m "test: verify satellite radar overlay order"
~~~

## Self-Review

- **Spec coverage:** Task 1 covers 10-minute/19-frame/exact-three-hour retention, five-minute checks, immediate backfill, duplicate prevention including fog/night paths, CI/CTPS, and tested last-good isolation. Task 2 covers alpha normalization. Task 3 covers opacity and deterministic IR < visible < radar ordering without HSR/HCI changes. Task 4 covers Mapbox assertions, two visual captures, and release checks.
- **Placeholder scan:** No TBD/TODO placeholders or unspecified test steps are present.
- **Type consistency:** fillAll is the existing IR processor option and becomes the visible processor option. beforeId is optional at the shared image-overlay boundary and used only by weather-overlay adapters.
