# MapView Refactor Design

Date: 2026-05-14
Status: Draft for user review

## Purpose

`frontend/src/features/map/MapView.jsx` has become the main integration hub for map lifecycle, weather overlays, aviation layers, route briefing, VFR waypoint editing, vertical profile requests, and panel rendering. This makes the project harder to extend because new map-adjacent features require editing one large file and understanding unrelated domains.

The goal is not just to split a large file. The goal is to make ownership match the existing project structure:

- `features/map` owns Mapbox runtime setup and cross-feature orchestration.
- `features/weather-overlays` owns weather overlay state, data shaping, layer adapters, and overlay UI.
- `features/route-briefing` owns IFR/VFR route state, route/procedure calculations, route UI, and vertical profile request composition.
- `features/aviation-layers` owns aviation WFS and ADS-B layer behavior.
- `frontend/src/api` owns backend API calls.

## Current Problems

### MapView has too many responsibilities

`MapView.jsx` currently contains:

- Mapbox creation, style reload handling, and basemap switching.
- Airport, geo boundary, aviation WFS, ADS-B, radar, satellite, SIGWX, lightning, SIGMET, and AIRMET layer orchestration.
- Weather timeline, SIGWX history/filter state, advisory badge state, and overlay legend state.
- IFR/VFR route form state, SID/STAR/IAP selection, FIR IN/EXIT handling, VFR waypoint editing, route preview rendering, route search, and vertical profile request composition.
- Panel composition for aviation, weather, route-check, settings, advisory badges, timelines, basemap switching, and vertical profile modal.

This creates a high regression surface. A change for one domain can accidentally affect map style reload, layer visibility, route preview, or panel rendering.

### Existing feature folders are underused

The project already has:

```text
frontend/src/features/
  map/
  aviation-layers/
  weather-overlays/
  route-briefing/
  monitoring/
  airport-panel/
```

The current issue is that several feature folders exist, but `MapView.jsx` still owns core behavior that belongs inside those feature areas.

### Mapbox style reload and React state are tightly coupled

The map initialization effect registers many layers inside `style.load` while also relying on React state captured by that effect. Basemap switching can therefore re-add layers using stale data or stale visibility. A better boundary is:

- `style.load` installs static sources/layers.
- dedicated sync functions apply current data and visibility after the style is ready.

### API calls leak into feature UI code

`MapView.jsx` directly fetches SIGWX metadata from `/api/sigwx-front-meta` and `/api/sigwx-cloud-meta`. Backend URL details and response handling should live in `frontend/src/api`, not inside a feature component.

### Route and weather map writes are scattered

Several handlers and effects directly mutate Mapbox sources such as route preview, procedure preview, weather images, lightning, advisory layers, and ADS-B. This makes the ordering difficult to reason about and hard to test.

## Target Architecture

### MapView role

`MapView.jsx` should become a thin map container and orchestrator:

- Create and destroy the Mapbox instance.
- Manage basemap selection and style readiness.
- Render high-level feature panels.
- Pass the map instance or map readiness state to feature-owned adapters.
- Avoid owning feature-specific state except for cross-feature composition concerns.

`MapView.jsx` should not directly implement weather overlay models, route briefing state machines, vertical profile payloads, or layer-specific rendering logic.

### Directory shape

```text
frontend/src/features/map/
  MapView.jsx
  MapView.css
  mapConfig.js
  imageOverlay.js
  lib/
    baseMapLayers.js
    mapLayerUtils.js

frontend/src/features/weather-overlays/
  WeatherOverlayPanel.jsx
  WeatherTimelineBar.jsx
  WeatherLegends.jsx
  SigwxHistoryBar.jsx
  SigwxLegendDialog.jsx
  AdvisoryBadges.jsx
  AdsbTimestamp.jsx
  lib/
    advisoryLayers.js
    lightningLayers.js
    sigwxLayers.js
    sigwxData.js
    weatherOverlayModel.js
    weatherTimeline.js

frontend/src/features/route-briefing/
  RouteCheckPanel.jsx
  VerticalProfileChart.jsx
  VerticalProfileWindow.jsx
  lib/
    procedureData.js
    routePlanner.js
    routePreview.js
    verticalProfileRequest.js

frontend/src/features/aviation-layers/
  AviationLayerPanel.jsx
  addAdsbLayer.js
  addAviationWfsLayers.js
  aviationWfsLayers.js
  adsbPolling.js
```

This uses the existing `features/*/lib` pattern where it improves locality. `lib` contains feature-local non-UI code: calculations, data shaping, Mapbox layer adapters, selectors, and API payload builders.

The file list above is a lean target, not a requirement to create every possible boundary immediately. New files should be created only when they remove meaningful complexity from `MapView.jsx` or provide a stable testable boundary. If a helper stays small, has one consumer, and has no clear independent test value, keep it grouped with related helpers instead of splitting it into a one-purpose file.

ADS-B is intentionally split during the migration:

- ADS-B source/layer creation, hover wiring, data shaping, and polling belong to `features/aviation-layers`.
- The existing ADS-B toggle placement in the MET/overlay panel and `AdsbTimestamp.jsx` should remain where they are unless a separate UX decision moves traffic controls into the aviation panel.
- This avoids changing user-facing navigation while still moving implementation ownership out of `MapView.jsx`.

## Responsibility Boundaries

### `features/map`

Owns:

- Mapbox instance lifecycle.
- Basemap options and style readiness.
- Common helper behavior used by multiple feature adapters.
- Map-only layers that are not domain features, such as base airport markers and geo boundaries.

Does not own:

- Weather overlay state or weather-specific layer construction.
- Route form state, route calculation, or vertical profile request payloads.
- ADS-B polling.

### `features/weather-overlays`

Owns:

- MET layer visibility model.
- Radar, satellite, lightning, SIGWX, SIGMET, and AIRMET overlay state.
- Weather timeline state and derived frame selection.
- SIGWX history/filter behavior.
- Advisory badge/panel data shaping.
- Weather-specific Mapbox layer adapters.
- The existing overlay-panel UI slot that currently includes ADS-B visibility controls.

Does not own:

- ADS-B polling.
- ADS-B GeoJSON shaping.
- ADS-B Mapbox source/layer/hover implementation.

Expected extension path for a new MET overlay:

1. Add data/model logic in `features/weather-overlays/lib`.
2. Add Mapbox adapter in `features/weather-overlays/lib`.
3. Add panel toggle or legend UI in `features/weather-overlays`.
4. Register the adapter through the weather overlay orchestration point.
5. Avoid editing `MapView.jsx` unless the new overlay needs a new cross-feature slot.

### `features/route-briefing`

Owns:

- IFR/VFR route form state.
- SID/STAR/IAP selection and procedure options.
- FIR IN/EXIT handling.
- VFR waypoint model and GeoJSON shaping.
- Route preview and procedure preview layer adapters.
- Vertical profile request payload composition.
- Route-check panel and vertical profile modal UI.

Expected extension path for a new route feature:

1. Add model/calculation code in `features/route-briefing/lib`.
2. Add UI in `features/route-briefing`.
3. Add or update route preview adapter if map rendering changes.
4. Keep `MapView.jsx` changes limited to composition.

### `features/aviation-layers`

Owns:

- Aviation WFS layer definitions and layer creation.
- ADS-B source/layer/hover behavior.
- ADS-B polling behavior once extracted from `MapView.jsx`.
- Aviation layer panel state helpers if needed.

Does not own:

- A user-facing relocation of the ADS-B toggle from the current overlay panel. That should be handled as a separate UX change if desired.

### `frontend/src/api`

Owns all backend calls, including SIGWX metadata helpers. Feature code should import API helpers instead of hardcoding `/api/*` URLs.

## Migration Strategy

The target structure should be reached in small, verifiable changes. The order matters because Mapbox style reload and layer ordering are regression-prone.

During migration, the design spec is the target direction, while `EntryPoints.md` remains the current-state operational guide until the relevant phase updates it. If the implementation has completed a phase and the old entry point would send future work back into `MapView.jsx`, update `EntryPoints.md` in the same phase.

### Phase 1: Stabilize and extract low-risk utilities

Move pure or nearly pure helpers out of `MapView.jsx` without changing behavior.

Candidates:

- airport GeoJSON creation, airport layer helpers, and geo boundary helpers into `features/map/lib/baseMapLayers.js`.
- shared layer visibility/source utilities into `features/map/lib/mapLayerUtils.js`.
- VFR GeoJSON helpers.
- procedure preview GeoJSON helpers.
- lightning GeoJSON/icon/layer helpers.
- SIGWX vector layer helpers.
- vertical profile request payload builder.
- SIGWX metadata API helpers.

Verification:

- `npm run build --prefix frontend`
- focused unit tests for pure helpers where fixture data is practical.

Phase acceptance:

- `MapView.jsx` no longer contains direct `/api/sigwx-*` fetch calls.
- Extracted helpers are imported from feature-local `lib` modules.
- Extracted helper behavior is covered by tests when the input/output can be represented without a real Mapbox instance.
- No panel layout or user-facing behavior changes are introduced.
- The implementation avoids one-function files unless the function represents a stable external contract or a clearly independent domain adapter.

### Phase 2: Move weather overlay ownership

Create a weather overlay orchestration module inside `features/weather-overlays/lib`.

Responsibilities:

- derive selected radar/satellite/lightning frames.
- manage SIGWX history/filter derived state.
- shape advisory badge/panel data.
- expose a small data model consumed by UI and Mapbox adapters.
- apply weather overlay layers through a single sync boundary.

Expected interface:

```js
const weatherOverlayModel = buildWeatherOverlayModel({
  echoMeta,
  satMeta,
  lightningData,
  sigwxLowData,
  sigwxLowHistoryData,
  sigmetData,
  airmetData,
  visibility,
  timelineState,
  sigwxState,
})

syncWeatherOverlayLayers(map, weatherOverlayModel)
```

The exact object shape can change during implementation, but ownership should not: weather data shaping and weather layer sync should live in `features/weather-overlays/lib`, not in `MapView.jsx`.

Verification:

- build passes.
- radar, satellite, lightning, SIGWX, SIGMET, and AIRMET toggles still work.
- basemap switch preserves current weather visibility and data.
- SIGWX history and filters still work.

Phase acceptance:

- `MapView.jsx` does not calculate weather timeline ticks, SIGWX group visibility, advisory panel payloads, or lightning GeoJSON directly.
- Weather-specific Mapbox source/layer creation lives under `features/weather-overlays/lib`.
- Adding a new weather overlay should not require adding a new weather-specific helper inside `features/map`.

### Phase 3: Move route briefing ownership

Create route briefing UI and model boundaries inside `features/route-briefing`.

Responsibilities:

- route form state and transitions.
- route search and auto-recommend behavior.
- SID/STAR/IAP option loading with latest-request protection.
- VFR waypoint model.
- route preview model.
- vertical profile request payload composition.

Expected interfaces:

```js
const routeBriefing = useRouteBriefing({
  metarData,
  airports,
  activePanel,
})

const routePreviewModel = buildRoutePreviewModel(routeBriefing.state)

syncRoutePreviewLayers(map, routePreviewModel)

const payload = buildVerticalProfileRequest(routeBriefing.state)
```

The implementation plan can adjust names or avoid introducing hooks until React lifecycle ownership is clear. Route preview behavior should initially be grouped in `features/route-briefing/lib/routePreview.js` unless it grows large enough to justify splitting VFR, procedure, and Mapbox adapter logic.

Verification:

- IFR search works.
- VFR search works.
- FIR IN/EXIT options work.
- VFR waypoint add/delete/drag/altitude edit works.
- route panel close/reset clears preview consistently.
- vertical profile request payload remains compatible with backend.

Phase acceptance:

- `MapView.jsx` does not own IFR/VFR route form state.
- `MapView.jsx` does not build vertical profile API payloads.
- `MapView.jsx` does not directly mutate route/procedure preview sources from route form handlers.
- Previous async route/procedure requests cannot overwrite newer selected route state.

### Phase 4: Normalize Mapbox sync boundaries

After feature ownership is clearer, clean up Mapbox lifecycle:

- `style.load` installs static layer/source definitions.
- data sync effects apply current data.
- visibility sync effects apply current visibility.
- each sync effect owns a clear set of source/layer IDs.

Verification:

- basemap switching after multiple layer toggles restores the same visible state.
- no duplicate handlers after repeated style switches.
- monitoring route still renders correctly.

Phase acceptance:

- `style.load` is limited to installing static source/layer definitions and triggering sync.
- Current data and visibility are applied from current state, not stale closures captured during map initialization.
- Each sync module documents or exports the source/layer IDs it owns.

### Phase 5: Update architecture docs and entry points

Update docs only when the implementation changes reality:

- `Architecture.md`: update `MapView.jsx` role after extraction.
- `EntryPoints.md`: update new MET overlay, ADS-B display, route briefing, and panel wiring instructions.

Phase acceptance:

- `Architecture.md` describes the new `MapView.jsx` role and the feature-owned layer/model boundaries.
- `EntryPoints.md` no longer instructs new MET overlay or ADS-B work to add implementation details directly to `MapView.jsx` when those flows have moved.
- Any remaining `MapView.jsx` entry point instructions are limited to composition or panel registration.

## Testing and Verification Plan

Success criteria for the refactor:

- Adding a new MET overlay should primarily touch `features/weather-overlays` and API helpers, not route briefing or generic map lifecycle code.
- Adding a new route briefing behavior should primarily touch `features/route-briefing`, not weather overlay or aviation layer code.
- `MapView.jsx` should no longer contain feature-specific data shaping, API payload builders, or layer-specific Mapbox adapter implementations.
- Basemap style switching should preserve current layer data and visibility.
- Main map and `/monitoring` map behavior should remain compatible with the existing `MapView` consumers.

Required command gate:

```powershell
npm run build --prefix frontend
```

Recommended automated tests:

- Pure helper tests for VFR GeoJSON, procedure preview model, vertical profile request payload, and weather timeline/SIGWX selectors.
- Request ordering tests for SID/STAR/IAP loaders and route search.
- Mapbox mock smoke tests for style reload preserving layer data and visibility.

Manual browser smoke:

- Main map loads.
- `/monitoring` map loads.
- Basemap switch works.
- Aviation toggles work.
- MET toggles work.
- Radar/satellite/lightning timeline works.
- SIGWX history/filter/legend works.
- ADS-B on/off polling cleanup works.
- IFR route search works.
- VFR waypoint add/delete/drag/altitude edit works.
- Vertical profile generation works.

## Non-goals

- Do not redesign the UI visual style.
- Do not change backend API contracts except through existing API client helpers.
- Do not introduce a global state library unless a later implementation plan proves it is necessary.
- Do not move unrelated airport panel or monitoring behavior unless directly required by `MapView.jsx` extraction.
- Do not rewrite all Mapbox integration at once.

## Implementation Planning Notes

The current recommended default is to use `features/*/lib` for feature-local non-UI logic, including Mapbox adapters. This matches existing `weather-overlays/lib` and `route-briefing/lib` usage.

The exact implementation plan should decide whether React hooks are introduced as separate files or whether state orchestration remains in plain feature-local modules first. The safer default is to extract pure `lib` modules first, then introduce hooks only where React lifecycle ownership is clear.

File-splitting guardrails:

- Prefer one cohesive feature module over several tiny files when helpers change together.
- Split when a module owns a distinct Mapbox source/layer family, a backend request contract, or a separately testable model.
- Avoid generic `utils.js` growth by using domain names such as `routePreview.js`, `sigwxLayers.js`, or `baseMapLayers.js`.
- Treat the directory shape as an implementation ceiling. The first implementation plan should create fewer files than the target shape when a combined module is simpler.
