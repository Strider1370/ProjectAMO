# MapView Phase 5 Architecture Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update ProjectAMO architecture and entry-point documentation so future MapView-adjacent work follows the ownership boundaries established by MapView refactor Phases 1-4.

**Architecture:** This phase changes documentation only. `Architecture.md` should describe `MapView.jsx` as the Mapbox runtime owner and high-level orchestrator, while feature-specific models and Mapbox adapters live under `features/weather-overlays`, `features/route-briefing`, and `features/aviation-layers`. `EntryPoints.md` should direct future MET, ADS-B, route briefing, and panel work to the correct feature-owned files, with `MapView.jsx` limited to composition and style-readiness orchestration.

**Tech Stack:** Markdown docs, Vite/React project structure, PowerShell on Windows, `rg`, Node test runner/build for sanity checks.

---

## Current State

MapView refactor Phases 1-4 are complete in code:

- Low-risk helpers were extracted from `MapView.jsx` into feature-local `lib` modules.
- Weather overlay data shaping and weather layer sync live under `frontend/src/features/weather-overlays/lib`.
- Route briefing state, UI, preview sync, and vertical-profile payload composition live under `frontend/src/features/route-briefing`.
- Mapbox style reload boundaries were normalized so `style.load` installs static map structure and `styleRevision` reruns current-state sync effects.
- Route, weather, base map, and ADS-B modules export source/layer ownership ID arrays.

The docs are close but not fully aligned:

- `Architecture.md` still describes `features/map` as owning "map panels, route interactions" and can be clearer that route/weather/ADS-B feature ownership moved out.
- `Architecture.md` mentions `AviationLayerPanel.jsx` as "aviation and ADS-B layer toggle panel", but ADS-B controls intentionally remain in the MET/weather overlay panel.
- `Architecture.md` does not list the new `frontend/src/features/map/lib/mapStyleSync.js` helper or the source/layer ownership export convention.
- `EntryPoints.md` is mostly current, but ADS-B display instructions still mention fetch interval in `addAdsbLayer.js`; polling currently remains in `MapView.jsx`, while ADS-B source/layer/hover/data shaping belong to `addAdsbLayer.js`.
- `EntryPoints.md` should explicitly state that basemap/style reload preservation depends on feature-owned sync helpers and `styleRevision`, so future changes do not reintroduce stale `style.load` sync.

Known working-tree notes:

- `.codex/hooks.json` and `.codex/hooks/code_review_graph.py` may be modified because Code Review Graph is installed locally. Treat them as unrelated.
- `docs/archive/development/plans/2026-05-15-mapview-phase3-route-briefing-ownership.md` and `docs/archive/development/plans/2026-05-16-mapview-phase4-mapbox-sync-boundaries.md` may be untracked locally. Preserve them.
- Temporary dev-server logs such as `.tmp-*-dev*.log` may exist. Do not include them in the Phase 5 docs commit.
- `backend/data/terrain/` may contain ignored local DEM terrain tiles. Do not add them.

---

## Scope

This plan implements only Phase 5 from `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`:

- Update `Architecture.md` to describe the current MapView role and feature-owned boundaries.
- Update `EntryPoints.md` so recurring task instructions point future work to the correct feature modules.
- Keep docs concise and scannable.

Out of scope:

- Do not change runtime source code.
- Do not refactor `MapView.jsx` further.
- Do not move ADS-B polling in this phase.
- Do not redesign the UI or add new features.
- Do not rewrite the full design spec; this phase only updates operational docs.

---

## File Structure

Modify:

- `Architecture.md`
  - Clarify `features/map` directory responsibility.
  - Clarify `MapView.jsx` role after Phase 4.
  - Add `frontend/src/features/map/lib/mapStyleSync.js`.
  - Update weather/route/ADS-B file roles where current wording is stale.
  - Add a short Mapbox sync ownership rule under Reference Structure.

- `EntryPoints.md`
  - Update "Modify ADS-B display" to distinguish ADS-B rendering/hover/data shaping from polling/toggle placement.
  - Update "Add a new MET raster overlay" to mention `installWeatherOverlayLayers`, source/layer ownership exports, and basemap switch preservation.
  - Update "Modify route briefing behavior" to mention route-owned preview sync and ownership ID exports.
  - Add a new recurring task pattern for Mapbox style/source-layer sync changes.

Do not modify:

- Frontend source files.
- Backend source files.
- Existing Phase 1-4 implementation plan files.

---

### Task 1: Baseline and Documentation Gap Inventory

**Files:**
- Read: `docs/archive/development/specs/2026-05-14-mapview-refactor-design.md`
- Read: `docs/archive/development/plans/2026-05-16-mapview-phase4-mapbox-sync-boundaries.md`
- Read: `Architecture.md`
- Read: `EntryPoints.md`
- Read: `frontend/src/features/map/MapView.jsx`
- Read: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Read: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Read: `frontend/src/features/aviation-layers/addAdsbLayer.js`

- [ ] **Step 1: Check working tree**

Run:

```powershell
git status --short --branch
```

Expected:

- `.codex/hooks.json` and `.codex/hooks/code_review_graph.py` may be modified and must not be reverted.
- Existing untracked Phase 3/Phase 4 plan files may be present and must be preserved.
- No source-code files should need editing for Phase 5.

- [ ] **Step 2: Check Code Review Graph state**

Run:

```powershell
& 'C:\Users\John\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\code-review-graph.exe' status
& 'C:\Users\John\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\Scripts\code-review-graph.exe' detect-changes
```

Expected:

- Graph status prints node/edge counts.
- Detect-changes may report local docs/hooks/log changes, but should not reveal unexpected source edits for this phase.

- [ ] **Step 3: Inventory current MapView sync boundaries**

Run:

```powershell
rg -n "styleRevision|installWeatherOverlayLayers|syncRasterAndSigwxLayers|syncAdvisoryLayers|syncLightningLayers|syncAdsbLayer|syncRoutePreviewLayers|ROUTE_PREVIEW_SOURCE_IDS|WEATHER_OVERLAY_SOURCE_IDS|ADSB_SOURCE_IDS|BASE_MAP_SOURCE_IDS" frontend/src/features/map/MapView.jsx frontend/src/features/map/lib/baseMapLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/route-briefing/lib/routePreviewSync.js frontend/src/features/aviation-layers/addAdsbLayer.js
```

Expected:

- `MapView.jsx` uses `styleRevision`.
- Weather install/sync helpers are in `weatherOverlayLayers.js`.
- Route preview ownership IDs are in `routePreviewSync.js`.
- ADS-B ownership IDs and sync helper are in `addAdsbLayer.js`.
- Base map ownership IDs are in `baseMapLayers.js`.

- [ ] **Step 4: Commit nothing**

This task is discovery only. Do not commit.

---

### Task 2: Update Architecture.md File Roles and Boundaries

**Files:**
- Modify: `Architecture.md`

- [ ] **Step 1: Update the directory description for `features/map`**

In `Architecture.md`, replace this line inside the directory tree:

```text
        map/                   -> Mapbox lifecycle, map panels, route interactions
```

with:

```text
        map/                   -> Mapbox lifecycle, basemap/style readiness, map-owned layers, and high-level feature orchestration
```

- [ ] **Step 2: Update the `MapView.jsx` role**

In `Architecture.md`, replace the current `MapView.jsx` file-role bullet:

```markdown
- `frontend/src/features/map/MapView.jsx` -> Mapbox map container, style readiness, basemap switching, cross-feature panel composition, and high-level feature sync orchestration.
```

with:

```markdown
- `frontend/src/features/map/MapView.jsx` -> Mapbox instance owner, style readiness/basemap switching coordinator, `styleRevision` sync trigger, high-level feature panel composition, and current-state sync orchestration. Feature-specific data shaping and layer adapters live in their owning feature modules.
```

- [ ] **Step 3: Add map style sync helper role**

In `Architecture.md`, add this bullet after the `imageOverlay.js` bullet:

```markdown
- `frontend/src/features/map/lib/mapStyleSync.js` -> Mapbox style-reload helpers for cleanup-aware layer event binding, cleanup collections, and source/layer ownership tests.
```

- [ ] **Step 4: Update ADS-B panel wording**

In `Architecture.md`, replace this bullet:

```markdown
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` -> aviation and ADS-B layer toggle panel.
```

with:

```markdown
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` -> aviation WFS layer toggle panel. ADS-B remains controlled from the MET/weather overlay panel for the current UX.
```

- [ ] **Step 5: Update ADS-B layer wording**

In `Architecture.md`, replace this bullet:

```markdown
- `frontend/src/features/aviation-layers/addAdsbLayer.js` -> ADS-B source/layer/hover wiring.
```

with:

```markdown
- `frontend/src/features/aviation-layers/addAdsbLayer.js` -> ADS-B GeoJSON shaping, source/layer install, visibility sync, cleanup-aware hover popup binding, and ADS-B source/layer ownership IDs.
```

- [ ] **Step 6: Update weather layer wording**

In `Architecture.md`, replace this bullet:

```markdown
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` -> weather overlay Mapbox raster/SIGWX/advisory sync helpers and MET panel layer definitions.
```

with:

```markdown
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` -> MET panel layer definitions, weather overlay source/layer ownership IDs, static weather overlay installation, and radar/satellite/SIGWX/advisory/lightning Mapbox sync helpers.
```

- [ ] **Step 7: Update route preview sync wording**

In `Architecture.md`, replace this bullet:

```markdown
- `frontend/src/features/route-briefing/lib/routePreviewSync.js` -> route/procedure/boundary-fix/highlight Mapbox sync helpers.
```

with:

```markdown
- `frontend/src/features/route-briefing/lib/routePreviewSync.js` -> route/procedure/VFR/boundary-fix/highlight Mapbox install/sync helpers and route preview source/layer ownership IDs.
```

- [ ] **Step 8: Add Reference Structure rules for Mapbox sync ownership**

In `Architecture.md`, add these bullets near the end of the `Reference Structure` list, before the backend/frontend boundary bullets if possible:

```markdown
- `frontend/src/features/map/MapView.jsx` owns Mapbox instance creation, basemap switching, style readiness, and `styleRevision`; it should not apply feature data or visibility from stale `style.load` closures.
- Feature-owned Mapbox adapters should expose or document their source/layer IDs when they own persistent Mapbox resources.
- Weather overlay map writes belong under `frontend/src/features/weather-overlays/lib/`; route preview map writes belong under `frontend/src/features/route-briefing/lib/`; ADS-B map writes belong under `frontend/src/features/aviation-layers/`.
```

- [ ] **Step 9: Run doc sanity grep**

Run:

```powershell
rg -n "styleRevision|mapStyleSync|ADS-B remains controlled|source/layer ownership|Feature-specific data shaping" Architecture.md
```

Expected:

- The new `MapView.jsx` role appears.
- The `mapStyleSync.js` role appears.
- ADS-B panel ownership wording appears.
- Mapbox source/layer ownership rule appears.

- [ ] **Step 10: Commit**

Run:

```powershell
git add Architecture.md
git commit -m "docs: update mapview architecture boundaries"
```

---

### Task 3: Update EntryPoints.md Recurring Task Instructions

**Files:**
- Modify: `EntryPoints.md`

- [ ] **Step 1: Update ADS-B display entry**

In `EntryPoints.md`, replace the whole section:

```markdown
## 2. Modify ADS-B display

- Marker style, popup, fetch interval -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
- Backend fetch -> `frontend/src/api/adsbApi.js`.
```

with:

```markdown
## 2. Modify ADS-B display

1. Marker style, GeoJSON shaping, visibility sync, source/layer IDs, or hover popup behavior -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
2. Backend fetch helper -> `frontend/src/api/adsbApi.js`.
3. ADS-B toggle placement currently remains in `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`; do not move it into the aviation panel without a separate UX decision.
4. ADS-B polling is still orchestrated by `frontend/src/features/map/MapView.jsx`; keep changes there limited to polling/composition unless a dedicated ADS-B polling module is introduced in a separate refactor.
5. Verify in browser: ADS-B toggle works, hover popup appears once, and repeated basemap switches do not duplicate hover behavior.
```

- [ ] **Step 2: Update MET overlay entry**

In `EntryPoints.md`, replace section `## 4. Add a new MET raster overlay` with:

```markdown
## 4. Add a new MET raster overlay

1. Add visibility/panel metadata to `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
2. Add frame selection or derived data to `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`.
3. Add Mapbox sync behavior to `syncRasterAndSigwxLayers` or a new weather-owned sync helper in `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
4. If the overlay installs persistent Mapbox sources/layers, update `WEATHER_OVERLAY_SOURCE_IDS` and `WEATHER_OVERLAY_LAYER_IDS`.
5. If the overlay needs static source/layer installation after basemap reload, update `installWeatherOverlayLayers`.
6. Add toggle or legend UI under `frontend/src/features/weather-overlays/`.
7. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition, passing current model state into weather-owned sync helpers, or adding `styleRevision` to a sync effect dependency.
8. Verify in browser: layer appears, toggle works, basemap switch preserves visibility/data, and aviation/geo layers remain above raster overlays.
```

- [ ] **Step 3: Update route briefing entry**

In `EntryPoints.md`, replace section `## 7. Modify route briefing behavior` with:

```markdown
## 7. Modify route briefing behavior

1. Add pure route calculations or display model changes in `frontend/src/features/route-briefing/lib/routeBriefingModel.js`.
2. Add route search, procedure-loading, VFR waypoint, or vertical-profile state changes in `frontend/src/features/route-briefing/useRouteBriefing.js`.
3. Add route/procedure/VFR/boundary-fix map preview changes in `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
4. If route preview sources/layers change, update `ROUTE_PREVIEW_SOURCE_IDS` and `ROUTE_PREVIEW_LAYER_IDS` in `routePreviewSync.js`.
5. Add route panel UI changes in `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`.
6. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition, route preview sync invocation, or a new cross-feature slot.
7. Verify IFR, VFR, FIR IN/EXIT, VFR waypoint editing, vertical profile generation, and basemap switch preservation for visible route previews.
```

- [ ] **Step 4: Add Mapbox style/source-layer sync entry**

Append this new section after `## 7. Modify route briefing behavior`:

```markdown
## 8. Modify Mapbox style/source-layer sync

1. Keep `frontend/src/features/map/MapView.jsx` responsible for Mapbox instance lifecycle, basemap switching, style readiness, and `styleRevision`.
2. Do not apply current feature data or visibility directly inside `style.load`; install static sources/layers there, then let current-state sync effects rerun via `styleRevision`.
3. Put feature-specific Mapbox writes in the owning feature adapter:
   - Weather overlays -> `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
   - Route previews -> `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
   - ADS-B -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
   - Base airports/geo boundaries -> `frontend/src/features/map/lib/baseMapLayers.js`.
4. Use cleanup-aware event binding from `frontend/src/features/map/lib/mapStyleSync.js` for layer handlers that must survive repeated style reloads.
5. If a module owns persistent sources/layers, export or update its `*_SOURCE_IDS` and `*_LAYER_IDS` arrays.
6. Verify with focused tests where Mapbox mocks are representative, then browser smoke: toggle layers, switch basemap twice, confirm visibility/data and hover/click behavior remain stable.
```

- [ ] **Step 5: Run entry point sanity grep**

Run:

```powershell
rg -n "styleRevision|installWeatherOverlayLayers|WEATHER_OVERLAY_SOURCE_IDS|ROUTE_PREVIEW_SOURCE_IDS|ADSB toggle placement|cleanup-aware|Mapbox style/source-layer sync" EntryPoints.md
```

Expected:

- ADS-B toggle placement guidance appears.
- MET overlay ownership ID guidance appears.
- Route preview ownership ID guidance appears.
- New Mapbox style/source-layer sync entry appears.

- [ ] **Step 6: Commit**

Run:

```powershell
git add EntryPoints.md
git commit -m "docs: update mapview entry points"
```

---

### Task 4: Final Documentation Verification

**Files:**
- Verify: `Architecture.md`
- Verify: `EntryPoints.md`

- [ ] **Step 1: Run doc acceptance greps**

Run:

```powershell
rg -n "MapView.jsx.*styleRevision|mapStyleSync|WEATHER_OVERLAY_SOURCE_IDS|ROUTE_PREVIEW_SOURCE_IDS|ADSB_SOURCE_IDS|Mapbox style/source-layer sync" Architecture.md EntryPoints.md
```

Expected:

- `Architecture.md` mentions `styleRevision` and `mapStyleSync`.
- `EntryPoints.md` mentions weather and route source/layer ownership IDs.
- `EntryPoints.md` has the Mapbox style/source-layer sync task pattern.

- [ ] **Step 2: Confirm stale guidance is gone**

Run:

```powershell
rg -n "aviation and ADS-B layer toggle panel|fetch interval -> `frontend/src/features/aviation-layers/addAdsbLayer.js`|Add Mapbox sync behavior.*MapView.jsx" Architecture.md EntryPoints.md
```

Expected:

- No matches.
- If a match appears, update the stale wording so future work is not sent to the wrong ownership boundary.

- [ ] **Step 3: Run build sanity check**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected:

- PASS.
- Existing Vite large chunk warning may appear and is not part of Phase 5.

- [ ] **Step 4: Check final working tree**

Run:

```powershell
git status --short --branch
```

Expected:

- Only the intended docs commits are new.
- Pre-existing `.codex/hooks*`, untracked prior plan files, temporary logs, and ignored terrain data remain unrelated.

- [ ] **Step 5: Commit final cleanup only if needed**

If Task 4 required documentation edits:

```powershell
git add Architecture.md EntryPoints.md
git commit -m "docs: align mapview refactor docs"
```

If Task 4 did not require edits, do not create an empty commit.

---

## Final Verification Gate

Before claiming Phase 5 complete, run:

```powershell
rg -n "MapView.jsx.*styleRevision|mapStyleSync|WEATHER_OVERLAY_SOURCE_IDS|ROUTE_PREVIEW_SOURCE_IDS|ADSB_SOURCE_IDS|Mapbox style/source-layer sync" Architecture.md EntryPoints.md
rg -n "aviation and ADS-B layer toggle panel|fetch interval -> `frontend/src/features/aviation-layers/addAdsbLayer.js`|Add Mapbox sync behavior.*MapView.jsx" Architecture.md EntryPoints.md
npm.cmd run build --prefix frontend
git status --short --branch
```

Required interpretation:

- First grep prints expected current-boundary documentation.
- Second grep prints no stale guidance.
- Frontend build passes.
- `git status` shows no accidental source-code edits and no accidental staging of logs, hook files, or local DEM data.

---

## Phase 5 Acceptance

- `Architecture.md` describes `MapView.jsx` as the Mapbox runtime/style readiness/high-level orchestration owner, not the owner of weather, route briefing, or ADS-B feature implementation.
- `Architecture.md` lists the current feature-owned layer/model boundaries and `mapStyleSync.js`.
- `EntryPoints.md` no longer directs new MET overlay, ADS-B, or route briefing implementation details into `MapView.jsx` except for composition, polling orchestration, or style sync triggers that genuinely belong there.
- `EntryPoints.md` includes guidance for preserving basemap/style reload behavior and updating source/layer ownership ID exports.
- No runtime source code is changed in this phase.

---

## Execution Options

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, with checkpoints after each major task.
