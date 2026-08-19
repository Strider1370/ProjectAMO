# Monitoring-Only Data Loader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` for this approved plan, including `test-driven-development` and `verification-before-completion`.

**Goal:** Make `/monitoring` load and poll only its domestic situation-board data plus the approved map overlays, keeping its first visit below the nginx API rate-limit burst without changing the main application loader or nginx limits.

**Architecture:** Replace the monitoring feature's delegation to the general weather loader with an explicit, feature-owned endpoint table. Keep `useSnapshotPolling` and the existing card response shape, but define its snapshot/change ownership to the same limited dataset. `MonitoringMap` passes only approved layer payloads and an allow-list to `MapView`; `MapView` retains full `MET_LAYERS` by default for other callers.

**Tech Stack:** React 19, Vite, Node built-in test runner, Playwright contract tests.

## Global Constraints

- Do not modify `frontend/src/api/weatherApi.js`'s generic `loadWeatherData`, the main session loader, or nginx limits.
- Monitoring map keeps only HSR, HCI, lightning, GK2A infrared, GK2A visible, domestic SIGMET, and AIRMET.
- Keep situation-board data: airports, METAR, TAF, AMOS, warning, KMA special warning, ground forecast/overview, environment, airport info, warning types, and alert defaults.
- Do not request or expose NOTAM, overseas navdata/weather/advisories, WISSDOM, QPF, Echo Top, RainViewer, raw ECHO, CI/CTPS, SIGWX, ADS-B, SIGWX metadata/history, flight-category overlay, typhoon, or route-briefing navdata.
- Preserve desktop/iPad layout. Optional refresh failures retain last-good data. Read encoding safety before Korean text edits and run `graphify update .` after code edits.

---

### Task 1: Scope loader and polling ownership with tests

**Files:**

- Modify `frontend/src/features/monitoring/monitoringApi.js`
- Modify `frontend/src/features/monitoring/monitoringApi.test.js`

**Steps:**

1. Write failing tests that stub `globalThis.fetch`, invoke `loadMonitoringInitialData()`, and assert each allowed endpoint is called exactly once: `/api/airports`, `/api/metar`, `/api/taf`, `/api/amos`, `/api/warning`, `/api/kma-special-warning`, `/api/sigmet`, `/api/airmet`, `/api/lightning`, `/api/ground-forecast`, `/api/ground-overview`, `/api/environment`, `/api/airport-info`, `/api/warning-types`, `/api/alert-defaults`, HSR/HCI metadata, and IR/visible metadata. Assert every excluded product path (including overseas navdata) is absent, and restore `fetch` after tests.
2. Replace the old WISSDOM/QPF/RainViewer/convective snapshot expectation with tests that snapshots detect and refresh only card values plus HSR/HCI/IR/visible metadata. Cover an optional changed fetch yielding `undefined`, proving the prior snapshot remains.
3. Add loader failure tests that fix the compatibility policy: all cards/map metadata are optional (`null`), airports and warning types retain their empty fallback, and only alert defaults is required. Verify an optional initial failure still returns the existing safe shape and a required alert-defaults failure rejects as before.
4. Run `npm --prefix frontend test -- --test-name-pattern="monitoring"`; confirm new assertions fail.
5. Remove broad loader imports (`loadWeatherData`, deferred/changed variants), retaining only snapshot metadata access if needed. Implement one named local endpoint table with endpoint, output key, and optional policy. `loadMonitoringInitialData()` makes one deduplicated `Promise.all` and preserves `airports: []` / `warningTypes: {}` fallbacks; remove the duplicate static load path if unreferenced.
6. Implement `loadMonitoringData()` and `loadChangedMonitoringData(changes)` from that same table. Poll requests only changed owned keys and use preserve semantics for optional resources. Narrow `buildMonitoringSnapshot`, `detectMonitoringSnapshotChanges`, and `nextMonitoringSnapshot` to exactly those keys, accepting retained snake_case server aliases such as `ground_forecast`.
7. Re-run the focused test; expected: pass and no excluded initial/poll request. Commit only these two files with `fix: scope monitoring weather data loader`.

### Task 2: Limit monitoring map composition and controls without affecting main map

**Files:**

- Modify `frontend/src/features/monitoring/MonitoringMap.jsx`
- Modify `frontend/src/features/monitoring/MonitoringMap.test.js`
- Modify `frontend/src/features/map/MapView.jsx`
- Modify `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify `frontend/src/features/weather-overlays/lib/useFlightCategory.js` only if an explicit enabled/capability parameter is required
- Modify `frontend/src/features/weather-overlays/lib/typhoonOverlaySync.js` only if an explicit enabled/capability parameter is required
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js` only if an explicit enabled/capability parameter is required
- Add focused tests next to MapView/WeatherOverlayPanel only if current tests cannot cover the defaulted props.

**Steps:**

1. Write failing `MonitoringMap` tests asserting only `hsrMeta`, `hciMeta`, `satMeta`, `satVisibleMeta`, domestic `sigmetData`, `airmetData`, and `lightningData` are passed; assert `enableWindOverlay={false}` and exactly `radarHsr`, `radarHci`, `lightning`, `satellite`, `satelliteVisible`, `sigmet`, `airmet` are allowed. Assert former generic payload props are absent.
2. Add defaulted `metLayerIds = null` prop to `MapView`. Derive `availableMetLayers`: full `MET_LAYERS` by default, allow-list-filtered otherwise. Use it consistently for the WeatherOverlayPanel, active count, and clear-all. Initial unsupported visibility must neither render nor count.
3. Add defaulted `showRadarWindControl = true` through MapView to WeatherOverlayPanel and guard the “레이더 바람장 (WISSDOM)” action. Test main-map defaults retain the full panel and WISSDOM control.
4. Trace the mount-time `useFlightCategory`, `useTyphoonOverlay`, and `useRouteBriefing` calls in MapView. Add defaulted capability props (all `true`) that stop their initial network work when false; pass false only from MonitoringMap. Preserve the hooks' cleanup/order requirements, and add tests proving false performs no fetch while the default preserves current main behavior.
5. Update MonitoringMap: stop merging overseas airport/advisory data; pass domestic METAR/SIGMET and only approved payloads; pass the exact allow-list, `enableWindOverlay={false}`, `showRadarWindControl={false}`, and the three disabled background-data capabilities. Keep readiness, basemap, selection, rings, slideshow, and legends unchanged.
6. Before editing `MapView.jsx`, inspect and preserve the unrelated briefing diff. Stage monitoring hunks only with `git add -p` (or wait for its owning task to commit); inspect `git diff --cached` before every commit so briefing changes cannot be included.
7. Run focused tests then `npm --prefix frontend test`; expected: monitoring has seven tiles only and no flight-category/typhoon/route navdata requests, while other MapView callers retain generic tiles and background features. Commit only owned hunks with `fix: limit monitoring map weather layers`.

### Task 3: Enforce request scope through the browser contract

**Files:**

- Modify `frontend/verification/monitoring-fixture.mjs`
- Modify `frontend/verification/contracts/monitoring.spec.mjs`

**Steps:**

1. Add a failing fixture/contract assertion that records `/api/` and `/data/` GET requests plus every `/api/` response status after fixture installation. Keep deterministic retained API fixtures; remove obsolete excluded fixtures or make accidental excluded calls fail diagnostically. Add HSR/HCI/visible metadata fixtures if missing.
2. In the registered desktop monitoring flow, wait by role/label contract for dashboard/map state; assert retained initial paths occur, excluded paths never occur (including flight-category, typhoon, and route navdata), every captured API status is not 503, the seven approved weather labels exist, and “레이더 바람장 (WISSDOM)” does not.
3. Add explicit role/label/text assertions for the current core card groups in both operations and ground modes, so the contract proves the retained data still renders rather than only proving the root mounted. Keep Mapbox aborted for deterministic runs.
4. Run the managed monitoring Playwright contract at its registry desktop and iPad viewports using `docs/operations/dev-server-and-capture.md`; expected: both pass. Then run `npm test`, `npm run build`, and `graphify update .`. Commit fixture/contract/graph output with `test: verify monitoring request scope`.

### Task 4: Deploy and verify the nginx boundary

**Files:** No product code changes.

**Steps:**

1. Build locally and deploy the approved main commit using the established release procedure: sync local `frontend/dist/` to `/opt/projectamo/current/frontend/dist/`, fast-forward production source, restart PM2, and test/reload nginx. Do not build Vite on the 2 GiB host.
2. From a desktop browser with cache disabled, load `/monitoring` and verify every monitoring API response succeeds and no excluded product is requested.
3. Inspect nginx access/error logs for this load. Expected: no 503 and no `limiting requests` message for `/monitoring`; verify `/` still exposes generic weather layers as a regression check.
4. Record deployed commit, contract output, and nginx evidence in handoff, then use `verification-before-completion` and `finishing-a-development-branch`; push only plan-owned changes.
