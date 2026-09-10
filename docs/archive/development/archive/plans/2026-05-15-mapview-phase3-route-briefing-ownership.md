# MapView Phase 3 Route Briefing Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move IFR/VFR route briefing state, route panel UI, route/procedure preview sync, VFR waypoint model, and vertical profile request orchestration out of `MapView.jsx` and into `features/route-briefing` without changing user-facing behavior.

**Architecture:** `MapView.jsx` remains the Mapbox container, style readiness owner, and cross-feature composition point. Route-specific state transitions, UI, model helpers, async procedure loading, route search, vertical profile orchestration, and route-owned Mapbox preview sync move to `features/route-briefing`.

**Tech Stack:** Vite, React 19, Mapbox GL JS, Node built-in test runner (`node --test`), PowerShell on Windows.

---

## Current State

Phase 1 and Phase 2 appear complete in code:

- `frontend/src/features/route-briefing/lib/routePreview.js` exists and owns route/procedure/VFR GeoJSON helpers plus preview layer installation.
- `frontend/src/features/route-briefing/lib/verticalProfileRequest.js` exists and owns vertical profile payload composition.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`, `weatherOverlayLayers.js`, and `lightningLayers.js` exist.
- `MapView.jsx` no longer owns weather overlay derived model or weather layer sync internals.
- Focused route/weather tests and frontend build passed before this plan was written.

Current Phase 3 gaps:

- `MapView.jsx` still owns IFR/VFR route form state, route result, route loading/error, cruise altitude, vertical profile state, VFR waypoints, hovered VFR waypoint state, SID/STAR/IAP selection, FIR IN/EXIT options, navpoints, and auto-recommend state.
- `MapView.jsx` still owns SID/STAR/IAP async loading effects and some request ordering/cancellation behavior.
- `MapView.jsx` still owns route search, reset, auto-recommend, VFR altitude editing, vertical profile generation, and route panel close/reset behavior.
- `MapView.jsx` still directly mutates `ROUTE_PREVIEW_SOURCE`, `PROC_PREVIEW_SOURCE`, boundary fix preview, and route highlight sources/layers.
- `MapView.jsx` still renders the route-check panel and vertical profile window inline.
- Route/profile styles still live in `frontend/src/features/map/MapView.css`.

Known working-tree note:

- `.codex/hooks.json` and `.codex/hooks/code_review_graph.py` may be modified before this plan because Code Review Graph was installed locally. Treat them as unrelated unless the user explicitly asks to include them.

---

## Scope

This plan implements only Phase 3 from `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`:

- Move route briefing model helpers into `features/route-briefing/lib`.
- Move route form, procedure, VFR waypoint, route search, auto-recommend, and vertical profile state into a route-owned React hook.
- Move route-check panel and vertical profile modal UI into route-owned components.
- Move route preview, procedure preview, boundary fix preview, route highlight, VFR waypoint sync, and VFR hover/delete presentation behind route-owned sync/model boundaries.
- Keep backend API contracts unchanged.
- Keep `MapView.jsx` as the map container and high-level composition point.

Out of scope:

- Do not implement the future `/api/route-briefing` endpoint described in `docs/briefing-architecture.md`.
- Do not redesign the route panel UI.
- Do not move ADS-B behavior.
- Do not normalize all Mapbox style lifecycle behavior; Phase 4 owns broader Mapbox sync cleanup.
- Do not alter backend vertical profile response shape.
- Do not change navdata JSON formats.

---

## File Structure

Create:

- `frontend/src/features/route-briefing/lib/routeBriefingModel.js`
  - Pure route UI/model helpers: wind/runway selection, procedure filtering, FIR option shaping, IAP candidate shaping, IFR sequence tokens, distance breakdown, airport elevation lookup, VFR waypoint initialization, route geometry extraction, VFR altitude helpers.
- `frontend/src/features/route-briefing/lib/routeBriefingModel.test.js`
  - Focused tests for pure model behavior.
- `frontend/src/features/route-briefing/lib/routePreviewSync.js`
  - Route-owned Mapbox sync boundary for route preview, procedure preview, boundary fix preview, route highlight, and VFR waypoint data sync.
- `frontend/src/features/route-briefing/useRouteBriefing.js`
  - React hook owning route briefing state and route actions.
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
  - Route-check panel UI.
- `frontend/src/features/route-briefing/VerticalProfileWindow.jsx`
  - Vertical profile modal shell.
- `frontend/src/features/route-briefing/RouteBriefing.css`
  - Route panel, VFR waypoint delete, and vertical profile styles moved from `MapView.css`.

Modify:

- `frontend/src/features/map/MapView.jsx`
  - Remove route-specific state/actions/UI and call route-owned hook, panel, modal, and sync helpers.
- `frontend/src/features/map/MapView.css`
  - Remove route briefing and vertical profile styles after moving them.
- `frontend/src/features/route-briefing/lib/routePreview.js`
  - Keep existing public helpers; add exports only if `routePreviewSync.js` needs existing IDs/helpers.
- `Architecture.md`
  - Update route briefing and `MapView.jsx` roles after implementation.
- `EntryPoints.md`
  - Add or update a route briefing entry so future route behavior starts in `features/route-briefing`.

Do not modify:

- Backend files, unless a test reveals an actual API contract regression and the user agrees.
- Weather overlay files, except import fallout if build requires it.
- Aviation layer files.

---

### Task 1: Confirm Baseline and Route Ownership Gaps

**Files:**
- Read: `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`
- Read: `docs/briefing-architecture.md`
- Read: `frontend/src/features/map/MapView.jsx`
- Read: `frontend/src/features/route-briefing/lib/*`
- Read: `frontend/src/api/briefingApi.js`

- [ ] **Step 1: Check working tree**

Run:

```powershell
git status --short
```

Expected:

- Only unrelated pre-existing `.codex/hooks*` changes may be present.
- If route/map files are already modified, inspect them before editing and preserve user changes.

- [ ] **Step 2: Check Code Review Graph**

Run:

```powershell
code-review-graph status
code-review-graph detect-changes
```

Expected:

- Graph is available.
- Detect-changes only reports unrelated local hook edits before Phase 3 edits begin.

- [ ] **Step 3: Run current route/profile tests**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
node --test backend/test/vertical-profile.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Run current frontend build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: build succeeds before Phase 3 begins.

---

### Task 2: Extract Pure Route Briefing Model Helpers

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeBriefingModel.js`
- Create: `frontend/src/features/route-briefing/lib/routeBriefingModel.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: Move pure constants and helpers**

Create `routeBriefingModel.js` and move or recreate these route-owned constants/helpers from `MapView.jsx`:

- `FIR_EXIT_AIRPORT`
- `FIR_IN_AIRPORT`
- `FIR_IN_ALLOWED_FIXES`
- `ROUTE_SEQUENCE_COLORS`
- `M_TO_FT`
- `BOUNDARY_FIX_FLOW_LABELS`
- `getWindDirection`
- `pickBestRunwayGroup`
- `filterProceduresByRunway`
- `chooseIapKeyForRunway`
- `formatBoundaryFixLabel`

Add pure helpers that make later hook/UI extraction smaller:

```js
export function buildBoundaryFixOptions(routeDirectionMetadata) {}
export function buildIapCandidates(selectedStar, iapData, currentSelectedIapKey) {}
export function buildVisibleSidOptions(sidOptions, availableSidIds) {}
export function getAirportElevationFt(airports, icao) {}
export function getVfrAirportAltitudeFt(airports, waypoint) {}
export function buildInitialVfrWaypoints(routeResult, airports) {}
export function buildIfrSequenceTokens(routeResult, selectedSid, selectedStar, selectedIap) {}
export function buildIfrDistanceBreakdown(routeResult, selectedSid, selectedStar, selectedIap) {}
export function getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap }) {}
export function buildRoutePreviewModel(routeState) {}
```

Guidance:

- Keep the exact behavior currently embedded in `MapView.jsx`.
- Preserve Korean-facing messages in UI components, not in pure helpers unless the helper already owns labels.
- `buildRoutePreviewModel` should return data needed by `routePreviewSync.js`, not call Mapbox.

- [ ] **Step 2: Add model tests**

Create tests covering:

- `pickBestRunwayGroup` chooses the runway group closest to wind direction.
- `chooseIapKeyForRunway` preserves default behavior when runway is missing.
- `buildBoundaryFixOptions` filters and labels FIR IN/EXIT options from route metadata.
- `buildInitialVfrWaypoints` preserves fixed airport endpoints and airport elevation.
- `buildIfrSequenceTokens` inserts SID/STAR/IAP tokens around enroute sequence.
- `buildIfrDistanceBreakdown` preserves current total-distance math.
- `getCurrentRouteLineString` returns VFR waypoint geometry and IFR procedure-augmented route geometry.

- [ ] **Step 3: Update MapView imports without changing behavior**

Import the moved helpers/constants from `routeBriefingModel.js`.

Expected:

- `MapView.jsx` still owns route state after this task.
- Only pure helper definitions are removed from `MapView.jsx`.

- [ ] **Step 4: Run tests and build**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
npm.cmd run build --prefix frontend
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/lib/routeBriefingModel.js frontend/src/features/route-briefing/lib/routeBriefingModel.test.js
git commit -m "refactor: extract route briefing model helpers"
```

---

### Task 3: Create Route Preview Sync Boundary

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/route-briefing/lib/routePreview.js` only if needed

- [ ] **Step 1: Move boundary fix preview and route highlight layer ownership**

Create `routePreviewSync.js`.

Move these Mapbox source/layer constants and functions from `MapView.jsx`:

- `BOUNDARY_FIX_PREVIEW_SOURCE`
- `BOUNDARY_FIX_PREVIEW_POINT`
- `BOUNDARY_FIX_PREVIEW_LABEL`
- `ROUTE_HL_WP_ICON`
- `ROUTE_HL_WP_LABEL`
- `ROUTE_HL_NA_ICON`
- `ROUTE_HL_NA_LABEL`
- `ROUTE_HL_AW_LINE`
- `ROUTE_HL_AW_LABEL`
- `ROUTE_HL_LAYER_IDS`
- `addBoundaryFixPreviewLayers`
- `applyRouteHighlight`
- `clearRouteHighlight`

Import existing route preview helpers from `routePreview.js`:

```js
import {
  PROC_PREVIEW_SOURCE,
  ROUTE_PREVIEW_SOURCE,
  addProcedurePreviewLayers,
  addRoutePreviewLayers,
  addVfrWaypointLayers,
  augmentRouteWithProcedures,
  buildProcedureGeoJSON,
  buildVfrGeoJSON,
} from './routePreview.js'
```

- [ ] **Step 2: Add route-owned sync helpers**

Add these exports:

```js
export function installRoutePreviewLayers(map) {}
export function syncRoutePreviewLayers(map, model) {}
export function syncVfrWaypointData(map, model) {}
export function syncBoundaryFixPreview(map, model) {}
export function clearRoutePreviewLayers(map) {}
```

`syncRoutePreviewLayers` should own:

- IFR route preview data.
- Procedure waypoint-only source data when a route result exists.
- Full procedure preview data when no route result exists.
- Route highlight for IFR `navpointIds`.

`syncBoundaryFixPreview` should own:

- FIR IN selected entry fix preview.
- FIR EXIT selected exit fix preview.
- Optional fit-bounds signal or return value if MapView still needs to call `map.fitBounds`.

Guidance:

- Keep fit-bounds in `MapView.jsx` only if the helper cannot do it without coupling to Mapbox constructor details. Prefer returning coordinates to fit rather than burying all camera behavior in a broad helper.
- Keep VFR drag binding in `routePreview.js` for now; it already belongs to route briefing.

- [ ] **Step 3: Replace MapView direct route preview mutations**

In `MapView.jsx`:

- Replace route/procedure preview effects with `syncRoutePreviewLayers(map, routePreviewModel)`.
- Replace boundary fix preview effect with `syncBoundaryFixPreview(map, routePreviewModel)`.
- Replace route highlight effect with `syncRoutePreviewLayers` or a smaller route-owned sync call.
- Replace clear/reset source mutations with `clearRoutePreviewLayers(map)`.
- Keep `map.fitBounds` calls temporarily in `MapView.jsx` if needed, but route-owned helpers should provide the coordinate lists.

- [ ] **Step 4: Run focused tests and build**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
npm.cmd run build --prefix frontend
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/lib/routePreview.js frontend/src/features/route-briefing/lib/routePreviewSync.js
git commit -m "refactor: extract route preview sync"
```

---

### Task 4: Move Route State Into `useRouteBriefing`

**Files:**
- Create: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/route-briefing/lib/routeBriefingModel.js` if helper gaps appear

- [ ] **Step 1: Create hook with existing route state**

Create `useRouteBriefing({ activePanel, airports, metarData, isStyleReady })`.

Move these state groups from `MapView.jsx`:

- `routeForm`
- `routeResult`
- `routeError`
- `routeLoading`
- `cruiseAltitudeFt`
- `verticalProfile`
- `verticalProfileLoading`
- `verticalProfileError`
- `verticalProfileStale`
- `verticalProfileWindowOpen`
- `editingVfrAltitudeIndex`
- `vfrWaypoints`
- `hoveredWpInfo`
- `sidOptions`
- `availableSidIds`
- `starOptions`
- `selectedSid`
- `selectedStar`
- `iapData`
- `iapCandidates`
- `selectedIapKey`
- `firInOptions`
- `firExitOptions`
- `navpointsById`
- `autoRecommendRequested`
- `vfrWaypointsRef`
- `hideTimerRef`

The hook should return:

```js
{
  state,
  refs,
  derived,
  actions,
  routePreviewModel,
  verticalProfileWindow,
}
```

Keep the first implementation explicit and readable. Avoid a reducer unless it clearly removes duplicated transition bugs.

- [ ] **Step 2: Move route async loading effects**

Move these effects into the hook:

- SID loading when departure airport changes.
- available SID filtering when exit fix/route type/SID options change.
- STAR loading when arrival airport changes.
- FIR IN/EXIT boundary fix option loading.
- navpoint loading.
- IAP data loading when arrival airport changes.
- IAP candidate derivation when selected STAR/IAP data changes.
- auto-recommend effect.
- route panel close/reset effect for `activePanel !== 'route-check'`.
- vertical profile stale effect.

Add latest-request protection:

- Use monotonically increasing request IDs or a local `cancelled` flag per effect.
- SID/STAR/IAP loads must not overwrite state for a newer airport selection.
- route search results must not overwrite state if a newer search/reset happened.
- vertical profile results must not overwrite state if the route/profile request changed.

- [ ] **Step 3: Move route actions**

Move these handlers into the hook:

- `updateRouteField`
- `handleDepartureAirportChange`
- `handleArrivalAirportChange`
- `handleEntryFixChange`
- `handleExitFixChange`
- `switchFlightRule`
- `handleAutoRecommend`
- `handleRouteReset`
- `deleteVfrWaypoint`
- `handleRouteSearch`
- `updateVfrWaypointAltitude`
- `applyCruiseAltitudeToVfrWaypoints`
- `handleVerticalProfileRequest`
- `setHoveredWpInfo`
- `setEditingVfrAltitudeIndex`
- `setVerticalProfileWindowOpen`

Guidance:

- `handleRouteSearch` should no longer directly mutate Mapbox sources. It should update route-owned state; `routePreviewModel` plus sync helpers should update the map.
- The hook may return `fitBoundsCoordinates` or an event token for MapView to fit the camera after searches/previews. Do not hide broad camera ownership inside unrelated state transitions unless it is route-specific and well-contained.
- Keep backend contract through `fetchVerticalProfile(buildVerticalProfileRequest(...))`.

- [ ] **Step 4: Use the hook from MapView**

In `MapView.jsx`:

- Call `const routeBriefing = useRouteBriefing({ activePanel, airports, metarData })`.
- Replace local route state references with `routeBriefing.state`, `routeBriefing.derived`, and `routeBriefing.actions`.
- Keep route panel JSX inline until Task 5.
- Keep VFR interaction binding in map initialization, but pass `routeBriefing.refs.vfrWaypointsRef` and `routeBriefing.actions.setVfrWaypoints`.

- [ ] **Step 5: Run tests and build**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
node --test backend/test/vertical-profile.test.js
npm.cmd run build --prefix frontend
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/lib/routeBriefingModel.js
git commit -m "refactor: move route briefing state to hook"
```

---

### Task 5: Move Route Panel and Vertical Profile UI

**Files:**
- Create: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Create: `frontend/src/features/route-briefing/VerticalProfileWindow.jsx`
- Create: `frontend/src/features/route-briefing/RouteBriefing.css`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`

- [ ] **Step 1: Extract `VerticalProfileWindow`**

Create `VerticalProfileWindow.jsx`.

Props:

```js
export default function VerticalProfileWindow({ profile, isOpen, onClose }) {}
```

Move the modal shell out of `MapView.jsx`. Reuse `VerticalProfileChart`.

- [ ] **Step 2: Extract `RouteBriefingPanel`**

Create `RouteBriefingPanel.jsx`.

Props should stay narrow:

```js
export default function RouteBriefingPanel({
  state,
  derived,
  actions,
}) {}
```

Move the route-check panel JSX out of `MapView.jsx`.

The component should render the same:

- IFR/VFR switch.
- route type selector.
- departure/arrival selectors.
- FIR IN/FIR EXIT selects.
- SID/STAR/IAP selectors.
- direct ICAO/fix inputs.
- search/auto-search/reset buttons.
- route errors.
- IFR route sequence and distance breakdown.
- VFR distance, waypoint altitude rows, and cruise altitude apply button.
- vertical profile controls and stale/error/open states.

- [ ] **Step 3: Move route styles**

Create `RouteBriefing.css` and import it from `RouteBriefingPanel.jsx` or a route briefing entry component.

Move these selectors from `MapView.css`:

- `.route-check-*`
- `.vfr-altitude-*`
- `.vfr-waypoint-*`
- `.vertical-profile-*`
- `.dist-breakdown*`
- `.proc-direct-input`
- `.vfr-wp-delete`

Guidance:

- Do not restyle the UI.
- Preserve responsive behavior and current class names to minimize CSS churn.
- `MapView.css` should retain map/container/basemap/cross-feature styles only.

- [ ] **Step 4: Replace MapView JSX**

In `MapView.jsx`:

- Replace inline route panel with:

```jsx
{activePanel === 'route-check' && (
  <RouteBriefingPanel
    state={routeBriefing.state}
    derived={routeBriefing.derived}
    actions={routeBriefing.actions}
  />
)}
```

- Replace inline vertical profile window with:

```jsx
<VerticalProfileWindow
  profile={routeBriefing.state.verticalProfile}
  isOpen={routeBriefing.state.verticalProfileWindowOpen}
  onClose={() => routeBriefing.actions.setVerticalProfileWindowOpen(false)}
/>
```

- Move hovered VFR waypoint delete button into `RouteBriefingPanel` if it can be positioned from returned `hoveredWpInfo`. If it remains outside because it is absolutely positioned over the map, keep it as a small route-owned component such as `VfrWaypointDeleteButton`.

- [ ] **Step 5: Run build and route tests**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
npm.cmd run build --prefix frontend
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/MapView.css frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/VerticalProfileWindow.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "refactor: move route briefing panel UI"
```

---

### Task 6: Final MapView Route Cleanup and Acceptance Grep

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/route-briefing/*` if final ownership gaps remain

- [ ] **Step 1: Remove route-owned leftovers from MapView**

Run:

```powershell
rg -n "routeForm|setRouteForm|routeResult|setRouteResult|routeError|routeLoading|verticalProfile|vfrWaypoints|selectedSid|selectedStar|selectedIap|iapCandidates|firInOptions|firExitOptions|navpointsById|autoRecommend|handleRoute|handleVertical|buildIfrSequenceTokens|buildVerticalProfileRequest|fetchVerticalProfile|buildBriefingRoute|buildVfrRoute|getProcedures|loadIapData|loadNavpoints|loadRouteDirectionMetadata|ROUTE_HL|BOUNDARY_FIX|FIR_IN|FIR_EXIT|route-check|vertical-profile|vfr-wp" frontend/src/features/map/MapView.jsx
```

Expected:

- No local route briefing state or route-owned helper definitions remain.
- Imports/references may remain only for high-level route hook/component/sync composition.
- No direct `map.getSource(ROUTE_PREVIEW_SOURCE)?.setData(...)` or `map.getSource(PROC_PREVIEW_SOURCE)?.setData(...)` remains in `MapView.jsx`.

- [ ] **Step 2: Confirm MapView composition shape**

`MapView.jsx` should only:

- Create/destroy the Mapbox instance.
- Install route preview layers during `style.load` through a route-owned install helper.
- Bind VFR interactions using route-owned refs/actions.
- Call route-owned sync effects with `mapRef.current`, `isStyleReady`, and `routeBriefing.routePreviewModel`.
- Render route-owned panel/window components.

- [ ] **Step 3: Run focused tests**

Run:

```powershell
node --test frontend/src/features/route-briefing/lib/routeBriefingModel.test.js frontend/src/features/route-briefing/lib/routePreview.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js
```

Expected: all tests pass.

- [ ] **Step 4: Run backend profile contract tests**

Run:

```powershell
node --test backend/test/vertical-profile.test.js
```

Expected: backend vertical profile tests pass.

- [ ] **Step 5: Run build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: build succeeds.

- [ ] **Step 6: Commit cleanup**

```powershell
git add frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing
git commit -m "refactor: finish route briefing ownership cleanup"
```

---

### Task 7: Manual Browser Smoke

**Files:**
- No planned file changes.

- [ ] **Step 1: Start dev server**

Run:

```powershell
npm.cmd run dev
```

Expected:

- Backend and frontend start through the root `concurrently` script.
- If a port is occupied, stop the old server or use the existing project launch script.

- [ ] **Step 2: Main map smoke**

Verify:

- Main map loads.
- Opening/closing the route-check panel does not leave stale route/procedure preview data.
- Basemap switch preserves or restores current route preview state.

- [ ] **Step 3: IFR smoke**

Verify:

- IFR route search works.
- Direct fix entry works.
- Domestic airport SID/STAR selectors load.
- IAP selector appears when multiple runway candidates exist.
- Auto-search still chooses a plausible SID/STAR/IAP and fills entry/exit fixes.
- FIR IN route works.
- FIR EXIT route works.
- Reset clears route, procedure preview, boundary fix preview, and errors.

- [ ] **Step 4: VFR smoke**

Verify:

- VFR route search works.
- VFR line and waypoints render.
- Clicking route line inserts a waypoint.
- Dragging an editable waypoint updates the route.
- Hover delete button appears and deletes the waypoint.
- Airport endpoints remain fixed.
- Cruise altitude apply updates editable VFR waypoint altitudes while preserving airport elevation endpoints.

- [ ] **Step 5: Vertical profile smoke**

Verify:

- Vertical profile generation works for IFR.
- Vertical profile generation works for VFR.
- Invalid/missing route shows the existing error.
- Changing route/procedures/VFR waypoints marks existing profile stale.
- Profile modal opens and closes.

---

### Task 8: Documentation Updates

**Files:**
- Modify: `Architecture.md`
- Modify: `EntryPoints.md`

- [ ] **Step 1: Update `Architecture.md`**

Change or confirm `MapView.jsx` role:

```text
frontend/src/features/map/MapView.jsx -> Mapbox map container, style readiness, basemap switching, cross-feature panel composition, and high-level feature sync orchestration.
```

Add route briefing roles:

```text
frontend/src/features/route-briefing/useRouteBriefing.js -> route briefing state, async route/procedure transitions, VFR waypoint model, route search, and vertical profile orchestration.
frontend/src/features/route-briefing/RouteBriefingPanel.jsx -> route-check panel UI for IFR/VFR form, route result, VFR altitude editing, and vertical profile controls.
frontend/src/features/route-briefing/VerticalProfileWindow.jsx -> vertical profile modal shell.
frontend/src/features/route-briefing/lib/routeBriefingModel.js -> pure route briefing view/model helpers.
frontend/src/features/route-briefing/lib/routePreviewSync.js -> route/procedure/boundary-fix/highlight Mapbox sync helpers.
frontend/src/features/route-briefing/lib/routePreview.js -> route/procedure/VFR GeoJSON helpers, layer installation, and VFR map interaction binding.
```

- [ ] **Step 2: Update `EntryPoints.md`**

Add a route briefing entry:

```markdown
## 7. Modify route briefing behavior

1. Add pure route calculations or display model changes in `frontend/src/features/route-briefing/lib/routeBriefingModel.js`.
2. Add route search, procedure-loading, VFR waypoint, or vertical-profile state changes in `frontend/src/features/route-briefing/useRouteBriefing.js`.
3. Add route/procedure/boundary-fix map preview changes in `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
4. Add route panel UI changes in `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`.
5. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition or a new cross-feature slot.
6. Verify IFR, VFR, FIR IN/EXIT, VFR waypoint editing, and vertical profile generation.
```

- [ ] **Step 3: Run final status**

Run:

```powershell
git status --short
git log --oneline -8
```

Expected:

- Only intended Phase 3 files are changed.
- Pre-existing `.codex/hooks*` changes are still separate unless the user asked to include them.

- [ ] **Step 4: Commit docs**

```powershell
git add Architecture.md EntryPoints.md
git commit -m "docs: update route briefing ownership"
```

---

## Phase 3 Acceptance Criteria

- `MapView.jsx` does not own IFR/VFR route form state.
- `MapView.jsx` does not own SID/STAR/IAP option loading or route auto-recommend transitions.
- `MapView.jsx` does not own VFR waypoint model state or altitude editing.
- `MapView.jsx` does not build vertical profile API payloads or directly call `fetchVerticalProfile`.
- `MapView.jsx` does not directly mutate route/procedure preview Mapbox sources from route form handlers.
- Previous async route/procedure/profile requests cannot overwrite newer selected route state.
- Route panel UI lives under `features/route-briefing`.
- Route/profile styles live under `features/route-briefing`.
- Adding a new route briefing behavior primarily touches `features/route-briefing`, not weather overlay or aviation layer code.
- Focused route briefing tests pass.
- Backend vertical profile contract tests pass.
- Frontend build passes.
- Browser smoke confirms IFR, VFR, FIR IN/EXIT, VFR waypoint editing, panel close/reset clearing, and vertical profile generation.

## Execution Handoff

Plan complete and saved to `docs/archive/development/plans/2026-05-15-mapview-phase3-route-briefing-ownership.md`.

Recommended execution:

1. **Subagent-Driven** - use an implementer for each task, then run a reviewer/test-gap pass after Task 4 and Task 6.
2. **Keep commits small** - commit after each task so route UI, route state, and route Mapbox sync changes stay reviewable.
3. **Do not skip browser smoke** - Phase 3 changes route state and map previews, so build/tests are necessary but not sufficient.
