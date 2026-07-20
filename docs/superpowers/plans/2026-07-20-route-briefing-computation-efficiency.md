# Plan: 경로 브리핑 계산 낭비 제거

**Spec:** `docs/superpowers/specs/2026-07-20-route-briefing-computation-efficiency.md`
**Goal:** 고도 대안, 수평 위험 노출, KIM NWP 수집의 계산 결과와 발행 계약을 유지하면서 반복 I/O, 임시 전체 격자 배열, 중복 공간 판정 및 수집 중 메모리 보관을 제거한다.

## Global Constraints

- KIM NWP forecast hour, level, 변수, 착빙 수집 범위와 API 응답 스키마를 변경하지 않는다.
- KIM/KTG 캐시는 `tmfc`, `hf`, `latest/index` revision이 모두 같은 경우에만 사용하고, 한 데이터군당 현재 조합 하나만 유지한다.
- partial run의 `complete:false` index/latest 발행 및 이전 complete run retention 의미를 유지한다.
- 위험구역 BBox는 정확 판정 이전의 탈락 조건일 뿐이며, 기존 표본 기반 폴리곤 판정을 대체하지 않는다.
- 새 의존성, Redis, GIS 데이터베이스, 워커 스레드 및 UI 변경을 추가하지 않는다.

---

## Task 1: 고도 대안 단면의 원시 격자 재사용과 표본 전용 중간값

**Files:**
- Modify: `backend/src/briefing/enroute-cross-section.js:74-139`
- Modify: `backend/src/briefing/cross-section-sampler.js:22-80`
- Modify: `backend/src/briefing/route-axis.js:44-96`
- Modify: `backend/server.js:963-1002`
- Modify: `backend/test/cross-section-sampler.test.js`
- Modify: `backend/test/cross-section-route.test.js`

**Interfaces:**
- Consumes: `readKimNwpLatest`, `readKimNwpIndex`, `readKimNwpGrid`, `readKtgLatest`, `readKtgGridSafe`, `buildRouteAxis`
- Produces: unchanged public response from `loadRouteCrossSection({ root, routeGeometry, body })`; its internal `metrics` object, structured `briefing.altitudes` server log, and test-only `clearRouteCrossSectionCache()` export

- [ ] Step 1: In `route-axis.js`, add a precomputed `bounds: { minLon, minLat, maxLon, maxLat }` to the existing axis return object without changing samples, distance, bearing, or spacing.
- [ ] Step 2: In `enroute-cross-section.js`, add one module-local cache per KIM and KTG data family keyed by `tmfc`, `hf`, and a revision derived from the current latest/index metadata. On any key change, clear the previous family cache before reading the requested grid; return cache hit/miss counts and per-stage elapsed milliseconds in the loader's internal `metrics` field, and export only `clearRouteCrossSectionCache()` for Node tests.
- [ ] Step 3: Replace `sparseDecode(size, ...)`, `sparseSpread(size, ...)`, and `sparseIcingGrade(size, ...)` with sample-indexed values. Decode each unique route grid index once, then construct only the existing per-sample `{ distanceNm, altFt, t, spread, icing, u, v }` output values.
- [ ] Step 4: Update `buildCrossSection` in `cross-section-sampler.js` to accept the sample-indexed level values produced by `loadLevel`; preserve the existing `levels`, `coverage`, warnings, run metadata, numeric rounding, and null behavior.
- [ ] Step 5: In `server.js`, emit one JSON log per `/api/briefing/altitudes` request with `event: 'briefing.altitudes'`, KIM/KTG revision, cache hit/miss counts, stage durations, route sample count, and `process.memoryUsage().rss`; do not add these metrics to the HTTP response.
- [ ] Step 6: Add tests proving a second same-revision route request produces the same cross-section while increasing the cache-hit metric, and a changed latest revision forces a cache miss. Add a sampler test proving the compact path returns the same level values as the current fixture.
- [ ] Step 7: Verify — run `npm --prefix backend test -- --test-name-pattern "cross-section"`; expect all matching tests to pass.
- [ ] Step 8: Commit — `git add backend/src/briefing/enroute-cross-section.js backend/src/briefing/cross-section-sampler.js backend/src/briefing/route-axis.js backend/server.js backend/test/cross-section-sampler.test.js backend/test/cross-section-route.test.js && git commit -m "Reuse briefing grids and keep route samples compact"`.

## Task 2: 수평 위험 노출의 안전한 후보 제거와 중복 요청 제거

**Files:**
- Modify: `backend/src/briefing/geo-time-match.js:1-62`
- Modify: `backend/src/briefing/hazard-exposure.js:17-33`
- Modify: `backend/src/briefing/route-exposure.js:47-85`
- Modify: `backend/test/geo-time-match.test.js`
- Modify: `backend/test/route-exposure.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js:911-930,1334-1383`
- Modify: `frontend/verification/contracts/route-workflow.spec.mjs:1-75`
- Modify: `frontend/verification/route-fixture.mjs`

**Interfaces:**
- Consumes: axis `bounds`, `routeIntervalInGeometry(axis, geometry)`, `fetchRouteExposure`, `fetchRouteExposureBatch`
- Produces: unchanged `buildRouteExposure(...)` and `routeIntervalInGeometry(...)` results; `geometryBounds(geometry)` and `boundsOverlap(a, b)` helpers for exact-test prefiltering

- [ ] Step 1: In `geo-time-match.js`, add `geometryBounds(geometry)` backed by a `WeakMap`, plus `boundsOverlap(a, b)`. At the start of `routeIntervalInGeometry`, return `{ entered: false, startNm: null, endNm: null }` when axis and geometry bounds cannot overlap; otherwise run the existing point-in-polygon loop unchanged.
- [ ] Step 2: Ensure `hazard-exposure.js`, `route-exposure.js`, altitude hazard matching, and NOTAM matching continue to reach `routeIntervalInGeometry`, so the same prefilter applies without duplicating geometry rules.
- [ ] Step 3: In `useRouteBriefing.js`, remove the single-route exposure fetches that are immediately followed by a batch fetch for the same updated design collection. Build the updated designs first, issue one `fetchRouteExposureBatch({ routes })`, then apply its result to each design and the active exposure.
- [ ] Step 4: Add geo tests for non-overlapping Polygon and MultiPolygon bounds, plus route-exposure regression tests showing intersecting, outside, unavailable-geometry, and lightning results remain unchanged.
- [ ] Step 5: In `route-fixture.mjs`, count exposure fixture requests by stable route payload; in `route-workflow.spec.mjs`, assert the route edit flow performs one batch exposure request per applied design and no preceding duplicate single-route exposure request.
- [ ] Step 6: Verify — run `npm --prefix backend test -- --test-name-pattern "route exposure|geo-time"`; expect all matching tests to pass.
- [ ] Step 7: Verify — run `npm --prefix frontend run build`; expect a successful production build.
- [ ] Step 8: Preflight with `Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue` and `Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue`; expect no unrelated listener to occupy either port.
- [ ] Step 9: Verify the browser contract with `npm.cmd run dev:contract -- --grep route-workflow`; expect the managed fixed-data backend/frontend lifecycle and all desktop, iPad, and mobile route-workflow checks to pass.
- [ ] Step 10: Commit — `git add backend/src/briefing/geo-time-match.js backend/src/briefing/hazard-exposure.js backend/src/briefing/route-exposure.js backend/test/geo-time-match.test.js backend/test/route-exposure.test.js frontend/src/features/route-briefing/useRouteBriefing.js frontend/verification/contracts/route-workflow.spec.mjs frontend/verification/route-fixture.mjs && git commit -m "Skip impossible route hazard checks"`.

## Task 3: KIM NWP 수집의 전체 격자 보관 및 반복 저장 제거

**Files:**
- Modify: `backend/src/processors/kim-surface-wind-processor.js:444-663`
- Modify: `backend/src/processors/kim-nwp-model.js:355-599`
- Modify: `backend/src/index.js:28-50`
- Modify: `backend/test/kim-nwp-model.test.js`
- Modify: `backend/test/kim-scheduler.test.js:1-50`
- Create: `backend/test/kim-nwp-collector-efficiency.test.js`

**Interfaces:**
- Consumes: `collectKimNwpTask`, `writeKimNwpGrid`, `buildKimNwpIndex`, `shouldPublishKimNwpRun`, `runWithLock`
- Produces: `buildKimNwpIndexEntry(grid, path)`, compact index-entry collection in KIM `process()`, KIM result metrics `{ peakRssBytes, normalizedGridWrites, retainedGridCount }`, and common collector lifecycle logs from `runWithLock`

- [ ] Step 1: In `kim-nwp-model.js`, extract `buildKimNwpIndexEntry(grid, path)` from the existing `buildKimNwpIndex` loop. Keep `buildKimNwpIndex` compatible with current callers by accepting compact entries as well as existing full-grid inputs, and assert both forms produce the same index fixture.
- [ ] Step 2: In `collectKimNwpTask`, fetch and merge all required components in memory, then call `writeGrid(grid)` once after all component attempts. If a component fails, write the final partial grid once and return its error as today; do not publish index/latest from a failed task set.
- [ ] Step 3: In `process()`, replace the full `grids` accumulator with compact index entries and one retained surface-wind grid only when it is needed for the legacy field. Derive `shouldPublishKimNwpRun`, index construction, manifest counts, and completion checks from those compact entries.
- [ ] Step 4: Sample `process.memoryUsage().rss` before and after each completed KIM task, count normalized full-grid writes, record the largest retained full-grid count, and return those values from the KIM processor. Export `runWithLock` from `index.js`; in it emit JSON `collector.started` and `collector.finished` records for every collector type with UTC `startedAt`, `finishedAt`, `durationMs`, status, and any returned processor metrics. This makes KIM–KTG overlap measurable without modifying KTG processing semantics.
- [ ] Step 5: Add a fixed multi-level collector fixture that asserts: final grid write count is one per task, retained full-grid count is at most one, partial run index/latest behavior matches the existing contract, and the compact index equals the index built from full grids.
- [ ] Step 6: Add a scheduler test that invokes `runWithLock` with a fake collector result and asserts both lifecycle records contain the same type, ordered UTC timestamps, duration, and metrics; retain the existing UTC KIM schedule test.
- [ ] Step 7: Verify — run `npm --prefix backend test -- --test-name-pattern "KIM NWP|kim nwp|kim scheduler"`; expect all matching tests to pass.
- [ ] Step 8: Commit — `git add backend/src/processors/kim-surface-wind-processor.js backend/src/processors/kim-nwp-model.js backend/src/index.js backend/test/kim-nwp-model.test.js backend/test/kim-scheduler.test.js backend/test/kim-nwp-collector-efficiency.test.js && git commit -m "Reduce KIM NWP collection peak memory"`.

## Task 4: 계약·성능 회귀 검증과 아키텍처 기록

**Files:**
- Modify: `Architecture.md:174-214`
- Modify: `docs/superpowers/status/route-briefing-computation-efficiency.status.md`

**Interfaces:**
- Consumes: the metrics returned by `loadRouteCrossSection`, KIM NWP `process()`, and common collector lifecycle logs
- Produces: recorded collector metrics/overlap evidence and updated File Roles descriptions

- [ ] Step 1: Run `node --test backend/test/kim-nwp-collector-efficiency.test.js`; expect the fixed fixture to report `peakRssBytes`, retain at most one complete grid, and write each complete or partial normalized grid exactly once.
- [ ] Step 2: Run `npm --prefix backend test`; expect the complete backend suite to pass.
- [ ] Step 3: Run `npm run build --prefix frontend`; expect the frontend production build to pass.
- [ ] Step 4: Run `npm.cmd run dev:contract -- --grep route-workflow`; expect the route-workflow Playwright contract to pass again after all backend and frontend changes.
- [ ] Step 5: Update the `Architecture.md` File Roles entries for `enroute-cross-section.js`, `geo-time-match.js`, `kim-surface-wind-processor.js`, and `kim-nwp-model.js` to describe the bounded revision-aware cache, BBox prefilter, compact collector entries, final-write rule, and metrics.
- [ ] Step 6: Update `docs/superpowers/status/route-briefing-computation-efficiency.status.md` with the final commit, verification commands/results, emitted collector metrics, and any skipped live cron overlap observation.
- [ ] Step 7: Commit — `git add Architecture.md docs/superpowers/status/route-briefing-computation-efficiency.status.md && git commit -m "Document briefing computation efficiency verification"`.
