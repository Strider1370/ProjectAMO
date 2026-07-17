# Route alternatives four-stage flow — handoff

Updated: 2026-07-17 KST
Branch: `feat/route-alternatives-flow`
Baseline: `a6c3c86` (`origin/main`)
Plan: `docs/superpowers/plans/2026-07-17-route-alternatives-four-stage-flow.md`

## Resume point

Phases 0–3 are implemented and verified. The next work is a new manual route-design-and-comparison plan. The current automatic candidate generation is transitional: do not extend it, and replace it with user-created route designs before further route-alternatives work. See `docs/superpowers/specs/2026-07-17-route-input-map-interactions-design.md` §1.0 and `2026-07-17-manual-route-weather-aids.md`.

The manual route-design specs are user-approved and independently spec-reviewed. The approved direction includes a bidirectional external-compatible en-route string: `FIX → airway → FIX` plus `DCT`. SID/STAR/IAP remain per-design structured selections and appear only in AMO's human-readable full-plan display, not in the exchange string. Next: write a new implementation plan; do not extend the old automatic-alternatives plan.

Phase 0 added:

- `backend/src/briefing/route-exposure.js`: horizontal advisory exposure, TS/CB-only automatic trigger, domestic/overseas SIGMET parity, and recent lightning counts within 20 NM. It does not make safety, suitability, or recommendation judgments.
- `POST /api/briefing/route-exposure` in `backend/server.js` and `fetchRouteExposure()` in `frontend/src/api/briefingApi.js`.
- `buildRouteAlternatives()` in `frontend/src/features/route-briefing/lib/routePlanner.js`: it uses `routeModel.enRouteSegments` distance ranges, blocks one exposed segment per Dijkstra re-run, deduplicates results, applies the approved distance limits, and returns base plus at most three alternatives. The deliberate MVP ceiling is marked with a `ponytail:` comment.
- Tests: `backend/test/route-exposure.test.js`, `backend/test/geo-time-match.test.js`, and additions to `backend/test/route-briefing-integration.test.js` and `frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js`.

Phase 1 added:

- `workflowStep`, route candidates, selected candidate, route-exposure state, editable ETA, and IFR TAS (`tasKt`) in `useRouteBriefing`.
- The IFR base route calls `fetchRouteExposure()` with the en-route preview line and `buildRouteAlternatives()` only when the trigger is `ready`; candidate, selection, and selected route commit after exposure resolves.
- `RouteAlternativesStep.jsx` plus the shared desktop/mobile four-step flow in `RouteBriefingPanel.jsx`; `MapView.jsx` remains unchanged.
- IFR settings order is departure/arrival, alternate, ETD/TAS/ETA, route type, procedures, then search. Cruise altitude belongs to the altitude step.
- `RouteAlternativesStep.jsx` derives horizontal-intersection NM from returned route intervals; an intersecting SIGMET is no longer mislabeled as `수평 교차 없음` when the API does not provide a separate distance field.
- When a ready TS/CB SIGMET has no retained detour, the comparison step now states that no published-airway detour satisfied the current limits rather than implying no SIGMET was detected.

Phases 2–3 added:

- Selecting a candidate route commits its independent SID/STAR/IAP procedure set; the prior base-route procedures are not forced onto the candidate.
- `POST /api/briefing/altitudes` and `altitude-weather-comparison.js` compare only published ENR 1.7 odd/even candidates, with KIM wind/icing, KTG turbulence, and matched SIGMET/AIRMET details.
- The altitude step waits for an explicitly entered cruise altitude. Selecting a comparison candidate changes selection only; it does not send another altitude-comparison request.
- Route comparison now exposes only relevant existing map-layer chips. `MapView.jsx` only passes visibility/toggle and advisory props; it has no new state/effect.
- Altitude comparison requests all candidate profiles in one terrain-sampling pass. Each candidate is a full ground→climb→cruise→descent→ground plan; the selected one is emphasized without another comparison request. The chart appears at a fixed, vertically centred size in the map area to the right of the panel, and its TOD/meta label follow the selected altitude.
- `docs/superpowers/specs/2026-07-17-manual-route-weather-aids.md` records the approved product direction: manual weather-aware editing aids, not automatic avoidance recommendations.

## Verification

- Focused backend route-exposure/geometry/API tests: 14/14 passed.
- Full backend suite: 360/360 passed.
- Full frontend suite: passed (exit 0).
- Frontend production build: passed.
- `git diff --check`: passed.
- Playwright is not required for Phase 0 because no browser-visible behavior was wired yet.
- Phase 1 frontend tests: 371 passed. Production build and `git diff --check` passed.
- Phase 1 Playwright on the current-code managed server: RKJJ -> RKPS posted `/api/briefing/route-exposure` with 200; desktop and 390px mobile both reached route comparison, altitude comparison, and briefing with the computed ETA. The only remaining browser errors were expected unauthenticated `/api/auth/me` 401 responses.
- Phase 3 focused backend tests: 10/10 passed; production build and `git diff --check` passed.
- Phase 3 Playwright on `dev:test`: RKSI -> RKPK showed relevant Radar/Lightning/SIGMET chips, readable hazard detail (`Embedded Thunderstorm`, `Surface Visibility`), candidate-altitude vertical profile, and selection change from FL290 to FL310 without a new comparison action. Screenshot: `output/playwright/route-alternatives-altitude-comparison.png`.
- Follow-up Playwright on `dev:test`: RKSI -> RKPK, FL250 comparison, then FL290 selection showed all candidates as climb/cruise/descent lines in the right-side centred chart; the meta label and TOD changed to `선택 순항고도 29,000 ft` and `TOD: KALOD 48.0NM 전`. Screenshot: `output/playwright/route-alternatives-fl290-highlight-final.png`.
- `npx depcruise frontend/src backend/src --no-config --output-type err`: 458 modules / 977 dependencies, no violations. Full-repo depcruise needs a missing project config; `npx knip` also has no project config and reports repo-wide baseline findings.

## Important constraints

- Do not touch `.claude/settings.json`, `.claude/settings.local.json`, `.claude/worktrees/`, `.playwright-cli/`, `debug.log`, `frontend/debug.log`, or `scripts/__pycache__/`.
- Do not commit or push unless the user explicitly asks.
- Use `apply_patch` for manual text edits.
- Graphify incremental detection currently sees 1,183 files (570 code, 359 docs, 254 images), indicating an old/incompatible manifest rather than a small update. Do not start that effectively full rebuild without the user narrowing or reconfirming scope.
- Phase 1 must call the completed route-exposure API after building the base IFR route, create `routeModel` from the en-route line (not the procedure-augmented display line), and invoke `buildRouteAlternatives()` only for `trigger === 'ready'`.
- `buildRouteAlternatives()` requires `routeModel` as well as `baselineRoute`; this is necessary because current `routeResult.segments` intentionally have no NM start/end positions.
- Keep `MapView.jsx` free of new state/effects. Browser-visible Phase 1 work requires the documented Playwright dev-server procedure.

## Working-tree scope

Expected task files so far:

```text
backend/server.js
backend/src/briefing/route-exposure.js
backend/test/geo-time-match.test.js
backend/test/route-briefing-integration.test.js
backend/test/route-exposure.test.js
frontend/src/api/briefingApi.js
frontend/src/features/route-briefing/lib/routePlanner.js
frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js
frontend/src/features/route-briefing/RouteAlternativesStep.jsx
frontend/src/features/route-briefing/RouteBriefing.css
frontend/src/features/route-briefing/RouteBriefingPanel.jsx
frontend/src/features/route-briefing/useRouteBriefing.js
frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx
frontend/src/features/route-briefing/VerticalProfileChart.jsx
frontend/src/features/route-briefing/VerticalProfileWindow.jsx
frontend/src/features/route-briefing/lib/verticalProfileRequest.js
backend/src/briefing/vertical-profile.js
backend/test/vertical-profile.test.js
docs/superpowers/specs/2026-07-17-manual-route-weather-aids.md
```

The approved plan file is currently untracked and user-owned. Preserve it.
