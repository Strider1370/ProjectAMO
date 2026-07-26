# Phase 1 — map-click route addition

## Goal

Let a user explicitly enter click-add mode and add a map point to the selected route design. VFR keeps its existing waypoint behavior; IFR resolves a valid published fix, updates only the selected design's `viaFixes`, and recalculates that design as one complete route.

## Constraints

- No automatic detour, recommendation, safety judgement, new weather data, or map layer.
- `MapView.jsx` receives only refs/callbacks; no route-design state or new effect.
- A failed IFR resolution or full-route connection leaves the design unchanged and explains the failure.
- Recalculation invalidates altitude/profile/briefing only for the edited selected design. Other designs remain unchanged.

## Tasks

1. Add pure planner tests and helpers:
   - extend `buildBriefingRoute({ viaFixes })` to connect entry → each via fix → exit with the existing graph/direction rules;
   - add `resolveMapInteraction` to snap an IFR map coordinate to a usable navpoint and validate the complete route;
   - preserve VFR coordinates and add the required `ponytail:` O(n) ceiling comment.
2. Add selected-design edit actions in `useRouteBriefing`:
   - expose explicit interaction mode and an `addMapPointToSelectedDesign` action;
   - clone/update only the selected design input snapshot, recalculate exposure after an explicit successful edit, and reject stale replies;
   - synchronize selected result/procedures and invalidate only selected downstream outputs.
3. Extend `routePreview` with a feature-owned click binder/mode gate. Reuse VFR insertion behavior; pass map coordinate to the IFR action. Do not put route state/effects in `MapView.jsx`.
4. Add minimal RouteBriefingPanel controls for click-add mode and failure feedback, using existing Fluent controls and tokens.
5. Verify focused planner/hook/preview tests, full frontend test/build, Madge, diff check, and Playwright desktop/iPad/mobile: mode off does nothing, VFR insertion, IFR valid insertion, invalid snap/connection preserved, selected-only invalidation, and weather chips do not alter designs.
