# Satellite, Radar Overlay, and History Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give every active satellite product an exact three-hour, ten-minute observed history while keeping radar echo deterministically above either satellite image.

**Architecture:** Startup history collection remains one serialized satellite-worker job per product—not a direct processor call from `index.js`. A bounded `fillAll` command traverses scheduler, worker protocol, and worker-job seams. Each product publishes a complete candidate window only after every requested item succeeds; CI and CTPS publish as one complete frame. Map adapters use explicit anchors to converge creation, replacement, and style reload to infrared < visible < radar.

**Tech Stack:** Node.js ESM, node:test, Sharp, React, Mapbox GL JS, Playwright contracts.

## Global Constraints

- Satellite-family history is one frame every 10 minutes, 19 frames, including newest and exactly T-180 minutes.
- Upstream checks remain every five minutes and never re-download an already processed observation time.
- `fillAll` is valid only for a `current` satellite-family worker job and only initial collection emits it; cron stays a normal current job.
- Startup backfill stays serialized through `createSatelliteWorkQueue`; do not add concurrency or a retry loop.
- A failed requested item preserves that product's published metadata window and assets. CI/CTPS expose a frame only if both facets are complete.
- Missing FOG is a completed IR-only observation; it must not create a same-timestamp FOG retry.
- Valid satellite pixels use alpha 255; missing pixels remain transparent. IR and visible opacity are exactly 1.0.
- Stack is infrared < visible < radar across initial render, replacement, and style reload.
- Do not change HSR, HCI, inactive radar echo-bin, inactive Echo Top, packages, endpoints, UI controls, or configuration knobs.

---

## File Structure

- `backend/src/{config,index}.js` — retention/check schedule and initial worker command.
- `backend/src/satellite/{worker-protocol,worker-jobs,work-queue}.js` — command validation, forwarding, serialized boundary.
- `backend/src/processors/{satellite-processor,satellite-visible-processor,convective-satellite-processor,convective-satellite-store}.js` — candidate windows and complete convective frames.
- `backend/src/parsers/satellite-parser.js` — opaque IR/FOG valid pixels.
- `frontend/src/features/map/imageOverlay.js` — optional stable insertion anchor.
- `frontend/src/features/weather-overlays/lib/{weatherOverlayLayers,kmaCompositeLayers,rasterFrameTransition}.js` — canonical anchors.
- `backend/test/{satellite-worker-protocol,satellite-worker-entry,kim-scheduler,historical-weather-frames,satellite-download-budget,convective-satellite-store,satellite-render-alpha}.test.js` — regressions.
- `frontend/src/features/{map/imageOverlay,weather-overlays/lib/weatherOverlayLayers,weather-overlays/lib/rasterFrameTransition}.test.js` and `frontend/verification/contracts/map-base.spec.mjs` — unit and browser proof.

## Task 1: Pass initial history intent through the worker boundary

**Files:** Modify `backend/src/index.js`, `backend/src/satellite/worker-protocol.js`, and `backend/src/satellite/worker-jobs.js`. Test `backend/test/satellite-worker-protocol.test.js`, `backend/test/satellite-worker-entry.test.js`, and `backend/test/kim-scheduler.test.js`.

**Interfaces:** `satelliteJob(kind, { signal, fillAll? })` consumes the startup option. `assertSatelliteJob(message)` returns optional `fillAll: true` only for `mode: 'current'`. `runSatelliteJob({ kind, mode, now, frame, fillAll, deps })` forwards it to the selected processor.

- [ ] **Step 1: Write the failing boundary tests.** Assert that `{ kind: 'satellite_visible', mode: 'current', fillAll: true, now: ISO }` validates and that the same flag with `mode: 'backfill'` throws. Invoke the satellite initial job then its cron callback and assert calls equal `[['satellite', { signal, fillAll: true }], ['satellite', { signal }]]`.

- [ ] **Step 2: Verify failure.** Run `node --test backend/test/satellite-worker-protocol.test.js backend/test/satellite-worker-entry.test.js backend/test/kim-scheduler.test.js`. Expected: failure because the protocol rejects `fillAll`, worker jobs do not forward it, and startup is indistinguishable from cron.

- [ ] **Step 3: Implement the bounded command.** In `assertSatelliteJob`, reject non-boolean `fillAll` and reject `fillAll: true` unless the message mode is `current`; return the flag only when true. In `buildInitialCollectionJobs`, enqueue satellite and visible jobs as `satelliteJob(kind, { signal, fillAll: true })`; leave `scheduleSatelliteJobs` unchanged. In `runSatelliteJob`, forward the flag to both processors. Keep one queue job per product and do not add HTTP input, independent per-frame jobs, concurrency, or retry behavior.

- [ ] **Step 4: Verify pass.** Re-run the Step 2 command. Expected: pass with JSON-safe commands and only startup jobs carrying `fillAll: true`.

- [ ] **Step 5: Commit.** Run `git add backend/src/index.js backend/src/satellite/worker-protocol.js backend/src/satellite/worker-jobs.js backend/test/satellite-worker-protocol.test.js backend/test/satellite-worker-entry.test.js backend/test/kim-scheduler.test.js && git commit -m "feat: request satellite history through worker jobs"`.

## Task 2: Collect complete IR and visible candidate windows

**Files:** Modify `backend/src/config.js`, `backend/src/processors/satellite-processor.js`, and `backend/src/processors/satellite-visible-processor.js`. Create `backend/test/historical-weather-frames.test.js`; extend `backend/test/satellite-download-budget.test.js`.

**Interfaces:** `processSatellite({ now, mode, frame, fillAll, deps })` and `processSatelliteVisible({ now, fillAll, deps })` consume the worker command. Export `buildFrameSpecs(latestRequestTm, frameCount)`. Visible metadata produces `processedTms`, bounded to 19 and including night checks.

- [ ] **Step 1: Write the failing history tests.** Assert `buildFrameSpecs('202608250810', 19)` has 19 items from `202608250510` through `202608250810`. Run visible `fillAll` twice with fixture fetch counting and assert exactly 19 requests plus 19 retained `processedTms`. Snapshot an existing IR window, fail one requested `fillAll` item, and assert metadata plus assets equal the snapshot.

- [ ] **Step 2: Verify failure.** Run `node --test backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js`. Expected: failure because visible has one check timestamp, retention is not 19, and backfill commits incrementally.

- [ ] **Step 3: Implement candidate-window collection.** Set `config.satellite.max_frames` to `19`, set visible scheduling to `*/5 * * * *`, remove the visible-only `MAX_FRAMES`, and export the oldest-to-newest ten-minute `buildFrameSpecs` helper. On `fillAll`, render each missing requested item into attempt-owned temporary assets; validate the complete requested candidate; only then atomically replace product metadata and prune old assets. On error, remove only attempt-owned temporary assets and preserve prior public assets/metadata. Current collection may still publish its one successful newest frame.

- [ ] **Step 4: Implement deduplication rules.** Replace visible `lastCheckedTm` with bounded `processedTms`, recording night timestamps. Remove `fog_retry` follow-ups and `needsFogRefetch` selection: unavailable FOG creates one IR-only completed frame. Preserve compatibility for current/backfill worker messages and persisted old metadata.

- [ ] **Step 5: Verify pass and commit.** Run the Step 2 command; expected pass with a 180-minute window, no repeated startup requests, and preserved last-good output after failure. Then run `git add backend/src/config.js backend/src/processors/satellite-processor.js backend/src/processors/satellite-visible-processor.js backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js && git commit -m "feat: retain complete satellite history windows"`.

## Task 3: Publish CI and CTPS as one complete convective frame

**Files:** Modify `backend/src/processors/convective-satellite-processor.js` and `backend/src/processors/convective-satellite-store.js`. Create `backend/test/convective-satellite-store.test.js`.

**Interfaces:** `publishCompleteConvectiveFrame({ root, frame, ci, ctps, maxFrames })` consumes prepared CI GeoJSON and exactly 12 prepared CTPS assets, and writes CI/CTPS metadata from one complete frame list.

- [ ] **Step 1: Write the failing atomicity tests.** Snapshot existing convective assets/metadata, submit a candidate with one CTPS level missing, assert rejection and exact unchanged snapshot. Submit a complete candidate, assert both CI and CTPS contain the same newest `frame.tm` and retention is 19.

- [ ] **Step 2: Verify failure.** Run `node --test backend/test/convective-satellite-store.test.js`. Expected: failure because the existing store merges CI and CTPS separately.

- [ ] **Step 3: Implement the complete-frame seam.** Have `collectConvectiveSatelliteFrame` render CI and CTPS via `Promise.allSettled`, but call `publishCompleteConvectiveFrame` only if both succeeded and CTPS contains all 12 levels. Stage all assets outside public names, rename them into place, update both metadata views from the same complete-frame list, and only then prune superseded assets. Any render, stage, or metadata failure removes only attempt-owned temporary files. Use `config.satellite.max_frames`.

- [ ] **Step 4: Verify pass and commit.** Run `node --test backend/test/convective-satellite-store.test.js backend/test/historical-weather-frames.test.js`; expected pass with no visible CI-only or CTPS-only frame. Then run `git add backend/src/processors/convective-satellite-processor.js backend/src/processors/convective-satellite-store.js backend/test/convective-satellite-store.test.js && git commit -m "feat: publish complete convective satellite frames"`.

## Task 4: Normalize alpha and raster order

**Files:** Modify `backend/src/parsers/satellite-parser.js`, `frontend/src/features/map/imageOverlay.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`, `frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js`, and `frontend/src/features/weather-overlays/lib/rasterFrameTransition.js`. Test `backend/test/satellite-render-alpha.test.js`, `frontend/src/features/map/imageOverlay.test.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js`, and `frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js`.

**Interfaces:** Extend `addOrUpdateImageOverlay(map, { sourceId, layerId, frame, opacity, beforeId? })`; retain `syncRasterFrame(..., { beforeLayerId? })`. The adapters produce `SATELLITE_LAYER < VISIBLE_LAYER < RADAR_LAYER`.

- [ ] **Step 1: Write failing tests.** Assert valid IR/FOG alpha bytes are 255 while an unmapped display pixel remains 0. Assert first add, image-source replacement, and simulated `style.load` create the filtered order `[SATELLITE_LAYER, VISIBLE_LAYER, RADAR_LAYER]` with IR and visible opacity 1.

- [ ] **Step 2: Verify failure.** Run `node --test backend/test/satellite-render-alpha.test.js frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js`. Expected: failure because IR/FOG use alpha 200/220, image replacement lacks stable anchoring, and visible anchors only to HSR.

- [ ] **Step 3: Implement minimal presentation changes.** Set only valid IR/FOG display-pixel alpha bytes to 255. Honor `beforeId` on initial add and source replacement in `imageOverlay`. Give IR `beforeId: VISIBLE_LAYER` and visible `beforeLayerId: RADAR_LAYER`, each at opacity 1. On a missing anchor keep append fallback; once present, use the existing replacement path or `moveLayer` to converge. Keep radar `.88`, and do not move HSR/HCI/SIGWX or add MapView state.

- [ ] **Step 4: Verify pass and commit.** Re-run the Step 2 command; expected pass across first add, replacement, and reload. Then run `git add backend/src/parsers/satellite-parser.js backend/test/satellite-render-alpha.test.js frontend/src/features/map/imageOverlay.js frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/lib/kmaCompositeLayers.js frontend/src/features/weather-overlays/lib/rasterFrameTransition.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js && git commit -m "fix: normalize satellite raster presentation"`.

## Task 5: Prove browser contract and release state

**Files:** Modify `frontend/verification/contracts/map-base.spec.mjs`.

**Interfaces:** Consume deterministic satellite/radar fixtures and `window.__map`; produce browser evidence before and after basemap style replacement.

- [ ] **Step 1: Add the failing browser contract.** Enable radar, IR, and visible from deterministic fixtures. Filter the Mapbox style to the three IDs, assert their order is IR then visible then radar, assert both satellite opacity values equal 1, change basemap, and repeat the assertions. Capture visible+radar and IR+radar under the ignored verification artifact root.

- [ ] **Step 2: Verify failure.** Run `npm run dev:contract -- --project=chromium verification/contracts/map-base.spec.mjs -g "keeps radar above visible and infrared satellite"`. Expected: failure before Task 4 because opacity or order is not canonical.

- [ ] **Step 3: Verify pass and release state.** Re-run the focused contract; expected pass after Task 4. Then run `node --test backend/test/satellite-worker-protocol.test.js backend/test/satellite-worker-entry.test.js backend/test/kim-scheduler.test.js backend/test/historical-weather-frames.test.js backend/test/satellite-download-budget.test.js backend/test/convective-satellite-store.test.js backend/test/satellite-render-alpha.test.js && node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/rasterFrameTransition.test.js && npm run build && npm run dev:contract -- --grep map-base && graphify update .`; expected every command exits 0.

- [ ] **Step 4: Commit.** Run `git add frontend/verification/contracts/map-base.spec.mjs graphify-out && git commit -m "test: verify satellite radar overlay order"`.

## Self-Review

- **Spec coverage:** Tasks 1–3 cover the 19-frame/180-minute history, five-minute checks, startup backfill, worker transport, deduplication, no FOG retry, and complete CI+CTPS publication. Task 4 covers alpha and stack. Task 5 supplies browser evidence and release checks.
- **Feasibility corrections:** The plan includes `worker-protocol.js` and `worker-jobs.js`; startup retains the serialized queue rather than bypassing it. Candidate windows and complete convective-frame publication make the last-good guarantee implementable.
- **Placeholder scan:** No TBD/TODO items, unbounded retries, or unnamed interfaces remain.
- **Type consistency:** `fillAll` is an optional worker command and processor option. `publishCompleteConvectiveFrame` is the sole CI+CTPS publication seam. `beforeId`/`beforeLayerId` remain optional adapter placement inputs.
