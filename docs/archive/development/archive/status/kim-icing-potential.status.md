# KIM Icing Potential Status

Updated: 2026-05-20 19:15 KST
Spec: docs/archive/development/specs/2026-05-20-kim-icing-potential-layer.md
Plan: docs/archive/development/plans/2026-05-20-kim-icing-potential-layer.md

## Resume Point
- Last completed: KIM icing potential layer Tasks 1-7, plus KIM NWP server ops optimization plan Tasks 1-7.
  Ops review-gap fixes for partial-run retention and legacy surface-wind update safety are complete.
- Latest follow-up: radar/satellite/SIGWX raster source updates now skip unchanged frame URL/coordinates;
  weather timeline slider commits on final interaction; raster frames now reuse already-installed Mapbox
  image sources when looping back to earlier frames; SIGWX icon image loads skip duplicate pending and
  already-loaded `map.loadImage()` requests.
- Next: Restart the backend process so the live server picks up the new cache headers, compression, startup gating,
  and incremental retry behavior. Then let the KIM collector run once, or trigger it, and confirm
  `/api/kim/icing/index` exposes at least one icing level/time.
- Ops follow-up plan created: `docs/archive/development/plans/2026-05-20-kim-nwp-server-ops-optimization.md`.
  It covers free-tier env settings, startup KIM collection gating, incremental retry, snapshot-meta memoization,
  KIM field ETag/cache headers, gzip, and frontend NWP request reduction.

## Ops Optimization Baseline
- Local `backend/data/kim_nwp`: 1,026 files, 819,802,343 bytes.
- Latest local run raw vs normalized: `normalized` 0 files / 0 MB; `raw` 8 files / 0 MB.

## Free-Tier Runtime Recommendation
- `KIM_NWP_KEEP_RAW=0`: raw KMA text is debugging-only; normalized `grid.json` serves the app.
- `KIM_NWP_MAX_RUNS=1`: retain only the latest usable KIM run on small disks.
- `KIM_NWP_CONCURRENCY=2`: reduce CPU, disk I/O, and upstream request peaks on shared-core VMs while preserving acceptable collection time.
- `KIM_NWP_COLLECT_ON_STARTUP=0`: avoid large KIM collection bursts during deploy/restart.
- `KIM_NWP_INCREMENTAL_RETRY=1`: skip already-complete grid variables during retries.

## Verified
- Ops Task 1 PASS: KIM storage baseline recorded; config import includes `collect_on_startup` and
  `incremental_retry` (`node --input-type=module -e "import config from './backend/src/config.js'; ..."`).
- Ops Task 2 PASS: initial KIM NWP collection can be omitted while cron scheduling remains unchanged
  (`node --test backend/test/kim-scheduler.test.js`).
- Ops Task 3 PASS: incremental retry reuses complete existing grids and avoids refetch/writes
  (`node --test backend/test/kim-surface-wind.test.js backend/test/kim-nwp-store.test.js`).
- Ops Task 4 PASS: `/api/snapshot-meta` uses backend memoization and returns `Cache-Control: no-cache`
  (`node --test backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js backend/test/kim-server-index.test.js`).
- Ops Task 5 PASS: KIM field routes skip `/api` no-store, return immutable cache headers with ETags,
  and revalidate to 304; backend compression dependency installed
  (`node --test backend/test/kim-field-cache.test.js backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js`).
- Ops Task 6 PASS: NWP slider keeps draft drag state and commits selection on final interaction events;
  shared frontend snapshot polling intentionally skipped because backend memoization covers this phase with less hook churn
  (`node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/useKimIcing.test.js`).
- Ops review-gap fixes PASS: partial KIM retries keep previous complete runs when retaining one run, and legacy
  `kim_surface_wind` updates only from `10m` `hf=0`; focused re-review returned no findings.
- Ops Optimization Verification: backend KIM/API suite PASS
  (`node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js backend/test/kim-server-index.test.js backend/test/kim-field-cache.test.js backend/test/snapshot-meta-cache.test.js backend/test/compression.test.js`).
- Ops Optimization Verification: frontend NWP suite PASS
  (`node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/useKimIcing.test.js frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js`).
- Ops Optimization Verification: frontend build PASS (`npm.cmd run build --prefix frontend`); existing large
  chunk warning remains.
- Ops Optimization Verification: KIM field cache smoke PASS on an isolated current-code backend
  (`Cache-Control: public, max-age=86400, immutable`, strong ETag, 304 revalidation). The already-running
  backend on port 3001 still returned old `no-store` headers and needs restart.
- Cache follow-up PASS: unchanged raster frame `updateImage()` calls are skipped; weather timeline drag no longer
  commits every input event; duplicate pending SIGWX icon `map.loadImage()` calls are skipped
  (`node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- Cache follow-up refinement PASS: raster frame A/B/A loops install each frame URL only once and reuse the
  existing Mapbox image source on repeat visits; SIGWX icons also avoid reloading after a successful add
  (`node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/map/lib/mapStyleSync.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- SIGWX icon root-cause fix PASS: `syncRasterAndSigwxLayers` previously ran SIGWX low icon loading on every
  raster timeline sync even when `visibility.sigwx=false`; icon loading is now gated behind SIGWX visibility
  while keeping SIGWX sources/layers installed
  (`node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/map/lib/mapStyleSync.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- Weather timeline drag behavior restored PASS: radar/satellite timeline now updates selected frame on `input`/`change`
  during drag rather than waiting for `pointerup`/`blur`; network-repeat prevention remains in `imageOverlay.js`
  and SIGWX icon visibility gating remains in `weatherOverlayLayers.js`
  (`node --test frontend/src/features/map/imageOverlay.test.js frontend/src/features/weather-overlays/lib/weatherTimeline.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/map/lib/mapStyleSync.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- Advisory marker text removal PASS: SIGMET/AIRMET map markers no longer create a separate text-label
  symbol layer; the icon layer, advisory polygon/line click popup data, top badges, and detail panel data remain
  (`node --test frontend/src/features/weather-overlays/lib/advisoryLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/map/lib/mapStyleSync.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains). Browser reload on
  `http://localhost:5173/` completed; DOM text check did not show the old map label strings.
- Route preview persistence PASS: closing the route-check panel no longer clears `routeResult`/route preview
  state; route input changes and the Reset button still call the existing clear path
  (`node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreviewSync.test.js`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- Network/request optimization follow-up PASS: static config APIs and mutable weather GET APIs now use
  ETag revalidation instead of broad `no-store`; KIM field routes remain immutable; KIM NWP overlay hooks
  share one snapshot-meta poller; initial main weather load defers panel-only datasets; monitoring and
  route/vertical UI chunks are lazy-loaded.
  (`node --test backend/test/api-cache-policy.test.js backend/test/kim-field-cache.test.js backend/test/snapshot-meta-cache.test.js`;
  `npm.cmd test --prefix backend`;
  `$files = Get-ChildItem -Path 'frontend\src' -Recurse -Filter '*.test.js' | ForEach-Object { $_.FullName }; node --test $files`;
  `npm.cmd run build --prefix frontend`, existing large chunk warning remains).
- Final backend KIM/API suite PASS: node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js backend/test/kim-server-index.test.js
- Final frontend helper/overlay suite PASS: node --test useKimIcing/useKimCloudPotential/icing field+sync/metLayerVisibility/cloud field+sync tests.
- Frontend build PASS: npm.cmd run build --prefix frontend.
- Browser smoke PASS on http://127.0.0.1:5173 with Mapbox network allowed: MET panel rendered Icing Potential (K-FIP-inspired); only optional backend-data 503s appeared.
- Empty-toggle root cause found after browser/API smoke: live `/api/kim/icing/index` was empty because
  `backend/data/kim_nwp/index.json` still pointed at old run `2026051912` without 600/400hPa or icing variables.
  New attempted run `2026052000` had usable icing grids (for example hf000/500hPa contained
  `u,v,T,rh,w,rh_liq,tqc,tqi,tqr,tqs,cld`), but collector publish was blocked by all-or-nothing `gridCount`
  checking (`18/104`), so the UI never saw the partial successful run.
- Partial-run publish fix PASS: `node --test backend/test/kim-surface-wind.test.js backend/test/kim-icing-api.test.js backend/test/kim-nwp-model.test.js`.
- WAFS-like icing palette update PASS: `node --test frontend/src/features/weather-overlays/lib/icingPotentialField.test.js frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.test.js`
  and `npm.cmd run build --prefix frontend`.
- NWP overlay basemap-boundary contrast update PASS: `node --test frontend/src/features/map/lib/baseMapLayers.test.js frontend/src/features/map/lib/mapStyleSync.test.js frontend/src/features/weather-overlays/lib/metLayerVisibility.test.js`
  and `npm.cmd run build --prefix frontend`.
- Icing opacity tuning PASS: `node --test frontend/src/features/weather-overlays/lib/icingPotentialField.test.js frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.test.js`
  and `npm.cmd run build --prefix frontend`.
- Icing renderer parity with Temp/Moisture PASS: `node --test frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.test.js frontend/src/features/weather-overlays/lib/icingPotentialField.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js`
  and `npm.cmd run build --prefix frontend`.
- Live KIM API probe (run 2026051912, 850hPa, hf0): tqc/tqi/tqr/tqs/w/cld/rh_liq all return
  200 OK full grids via nph-kim_nc_xy_txt2 (KIMG/NE57, data=P).
- Confirmed multi-variable call unsupported: `name=tqc,tqi` -> `NetCDF: Variable not found`.
  One HTTP call per variable.
- `w` is signed (e.g. -0.298), consistent with upward_air_velocity m/s.
- Official NE57 variable table (reference/NWP/251114_kimg_varn_8km.pdf) confirms tqc/tqi/tqr/tqs
  are per-level mass_fraction (kg/kg, 30 levels), not column-integrated. Only graupel (grle) is absent.
- Existing helpers confirmed present: encodeComponent/decodeComponent (MISSING_ENCODED=-32768),
  buildKimNwpIndex, filterKimNwpIndexForVariables, filterKimNwpIndexForMap (server.js), readKimNwpIndex.
- `node --test backend/test/kim-nwp-model.test.js backend/test/kim-nwp-store.test.js backend/test/kim-surface-wind.test.js`
  -> PASS after Task 1 per-variable scale change.
- `node --test backend/test/kim-nwp-model.test.js backend/test/kim-nwp-store.test.js backend/test/kim-surface-wind.test.js backend/test/kim-cloud-api.test.js`
  -> PASS after Task 2 and reviewer-gap fixes.
- Live KMA sanity at run `2026051912`, `850hPa`, `hf0`: `w` min/max `-0.298128/0.35636`; `tqc`
  `0..0.000662268`, `tqi=0`, `tqr 0..0.000330184`, `tqs=0`, `cld 0..1`; no values clip at planned
  scales. `w` semantics remain documented as upward_air_velocity.
- Codex code/docs review confirmed current frontend sliders read levels from filtered indexes, so
  600/400hPa should render automatically for wind/temp once present in the wind/temp indexes.
- Current `metLayerVisibility.js` has per-id wind/temp/cloud branches with windFlow/windSpeed details;
  implementation must add `icing` to those branches rather than replacing them with a generic loop.

## Unverified / Skipped
- Live API re-check after the partial-run publish fix requires backend restart / collector rerun. The code-level
  regression suite passes, and direct field access to an existing partial run returned `kim_nwp_icing_potential`.
- rh_liq live retry timed out during Task 3 sanity probe; hydrometeor magnitude and w orientation
  sanity were completed.

## Deviations from Plan
- Documentation-only reconciliation before implementation: spec/plan now use potential-class wording,
  no public `variant`, filter-before-map index ordering, additive mutual exclusion, and explicit
  real-data sanity checks.
- Added spec outline note as a future-only consideration for route vertical sections; it does not add
  implementation scope to this phase.
- Added a Subagent Execution Map to the plan so implementation can follow the long-context/Superpowers
  workflow with read-only mapper/reviewer/spec/test-gap/UI/architecture agents and sequential
  implementer ownership for coupled backend/frontend edits.

## Open Decisions Resolved
- Per-variable scale: keep u/v/T/rh at 0.01, add fine scales for new vars (w=0.001, cld=1e-4,
  tqc/tqi/tqr/tqs=2e-7), clip to int16, -32768 = missing.
- Collection: config-gated bulk fetch (kim_nwp.collect_icing) in same run, bounded concurrency,
  partial failure tolerant; NOT on-demand.
- SFIP-base implemented + tested internally but NOT exposed via API/UI (no variant param).
- Mutual exclusion: ADDITIVE icing block in metLayerVisibility.js (NOT a single-rule refactor),
  to preserve existing passing metLayerVisibility tests and windFlow/windSpeed/lowPower detail.
- Display palette: icing potential now uses WAFS-like blue severity labels (`Trace potential`,
  `Moderate potential`, `Severe potential`) while keeping transparent `None` and the same K-FIP-inspired
  score/grade thresholds. Opacity is currently 1.0 for trace/moderate/severe as a visual comparison pass;
  only `None` remains transparent. Icing PNG rendering follows the Temp/Moisture pattern: one pixel per source
  grid cell with Mapbox `raster-resampling: linear`; the custom 3x feather pass was removed after visual review.
- Basemap contrast: geo-boundary overlays now show on any basemap when a KIM NWP overlay
  (`wind`, `temp`, `cloud`, or `icing`) is active, matching the previous dark/radar/satellite contrast behavior.
- rh_liq used for icing; Moisture's rh untouched this phase.
- Levels: extend shared KIM_NWP_LEVELS with 600hPa + 400hPa. Wind(u/v) and Temp(T) collect at all
  pressure levels, so wind/temp overlays gain 600/400 (intended, winds/temps aloft). Icing levels =
  925/850/700/600/500/400 (drop 300 = always gated below -35C; drop 10m = surface). Moisture stays
  925/850/700/500.

## Dependencies from the Moisture layer (now shipped)
- "Cloud Potential" was renamed to "Moisture" (T-Td spread, stepped green) but keeps internal names
  cloud / kim_nwp_cloud_potential / kimNwp.variables.cloud.hash. Mutual-exclusion key stays `cloud`,
  so the icing 4-way list (wind|temp|cloud|icing) is correct.
- Scheduler now has a retry-skip completeness guard (u/v/T all levels + rh moisture levels). ICING MUST
  extend it to also require icing variables when collect_icing is on, else retries are skipped before
  icing is collected and icing never populates. Captured in Task 3 Step 5.
- filterKimNwpIndexForMap now exposes nearest-past + future valid times; icing index inherits this
  automatically (no change needed).

## Notes for Next Session / Codex
- Icing is the 4th KIM NWP overlay after wind/temp/Moisture, on the same kim_nwp pipeline.
- This is "K-FIP-inspired guidance", NOT an official icing forecast. Keep naming conservative.
- Scientific validation (PIREP/AMDAR/GK2A) is a separate future track, not this map phase.
