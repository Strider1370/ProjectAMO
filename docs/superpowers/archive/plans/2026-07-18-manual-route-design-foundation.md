# Manual Route Design Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic IFR detour candidates with up to four user-owned route designs that can be selected, copied, renamed, deleted, and carried into altitude comparison and briefing.

**Architecture:** `useRouteBriefing` owns an ordered `routeDesigns` collection. Each design stores its own IFR input snapshot, procedures, route result, route model, exposure facts, and future `viaFixes`/undo fields; all designs' en-route lines remain visible for comparison, while only the selected design's procedures, altitude comparison, and briefing flow downstream. The existing route-exposure API remains a factual calculation after an explicit route search, but `buildRouteAlternatives()` and automatic procedure-candidate generation leave the flow.

**Tech Stack:** React 19 hooks, existing Mapbox route-preview synchronizer, Node built-in test runner, Vite, existing route-exposure API, Playwright.

---

## Scope and non-goals

This is Phase 0 of the approved manual route-design specification. It changes the existing “경로 비교” step into “경로 설계·비교” and replaces generated alternatives with user-created copies. It does **not** add map editing, route-string parsing, freehand drawing, or segment detours; those are later plans. Do not add state or effects to `MapView.jsx`, new weather data, scores, safety claims, or recommendations.

## File structure

- Create: `frontend/src/features/route-briefing/lib/routeDesigns.js` — pure creation, selection-safe copy, rename, and deletion helpers; maximum-four rule lives here.
- Create: `frontend/src/features/route-briefing/lib/routeDesigns.test.js` — small Node tests for independent copies and collection limits.
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` — replace generated-candidate lifecycle with selected route-design lifecycle.
- Modify: `frontend/src/features/route-briefing/lib/routePlanner.js` — remove automatic detour generator.
- Modify: `frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js` — retain graph route test and remove detour-generator tests.
- Modify: `frontend/src/features/route-briefing/lib/routeBriefingModel.js` and `frontend/src/features/route-briefing/lib/routePreviewSync.js` — rename the preview input from candidates to designs and show all design lines without procedure-connector trimming.
- Modify: `frontend/src/features/route-briefing/lib/routePreviewSync.test.js` — assert selected/manual design rendering.
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx` and `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — present/manage manual designs, workflow labels, and selected-design summary.
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css` — reuse existing card/button tokens; add only layout needed for design actions.
- Modify: `docs/superpowers/status/2026-07-17-route-alternatives-four-stage-flow.status.md` — record Phase 0 plan and its resume point after implementation.

### Task 1: Lock the route-design data contract

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeDesigns.js`
- Test: `frontend/src/features/route-briefing/lib/routeDesigns.test.js`

- [ ] **Step 1: Write failing pure-model tests**

Cover a base design, copy independence, the four-design ceiling, rename trimming, and deletion that always retains one design:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createRouteDesign, duplicateRouteDesign, removeRouteDesign } from './routeDesigns.js'

test('duplicateRouteDesign gives the copy independent editable inputs', () => {
  const base = createRouteDesign({ routeForm: { flightRule: 'IFR' }, procedures: { sid: { id: 'SID1' } }, viaFixes: ['SEL'] })
  const { designs, selectedId } = duplicateRouteDesign([base], base.id)
  designs[1].viaFixes.push('KALOD')
  assert.equal(selectedId, designs[1].id)
  assert.deepEqual(designs[0].viaFixes, ['SEL'])
  assert.equal(designs[1].name, '경로 A')
})
```

- [ ] **Step 2: Run the new test and confirm it fails because the module does not exist**

Run: `npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/routeDesigns.test.js`

Expected: failure resolving `routeDesigns.js`.

- [ ] **Step 3: Implement the minimal pure helpers**

Use this data shape; do not store derived display strings or duplicate selected-design state:

```js
export const MAX_ROUTE_DESIGNS = 4

export function createRouteDesign({ id = 'base', name = '기본 경로', routeForm, procedures, routeResult, routeModel, routeExposure, viaFixes = [], undoStack = [] }) {
  return { id, name, routeForm: { ...routeForm }, procedures: { ...procedures }, routeResult, routeModel, routeExposure, viaFixes: [...viaFixes], undoStack: [...undoStack] }
}
```

`duplicateRouteDesign` must return the original collection unchanged when the selected design is absent or four designs already exist. Otherwise append a deep-enough input copy, assign `경로 A`, `경로 B`, then `경로 C` from its new position, and select it. `renameRouteDesign` trims input and keeps the old name when empty. `removeRouteDesign` must not remove the final remaining design; when it removes the selected design, select the preceding design or the first remaining design.

- [ ] **Step 4: Run the focused test**

Run: `npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/routeDesigns.test.js`

Expected: all route-design model tests pass.

### Task 2: Remove automatic detour generation at its source

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routePlanner.js`
- Modify: `frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

- [ ] **Step 1: Remove tests that assert generated detours**

Keep the `buildBriefingRoute` domestic-graph test. Delete the `alternativeNavdata` fixture and every `buildRouteAlternatives` test, then remove its import.

- [ ] **Step 2: Remove `buildRouteAlternatives()`**

Delete the exported function and private constants/helpers used only by it. Keep `buildBriefingRoute`, `canBuildBriefingRoutePath`, graph loading, and direction metadata unchanged. Confirm no caller remains:

Run: `rg -n "buildRouteAlternatives|alternativeNavdata" frontend`

Expected: no matches.

- [ ] **Step 3: Make an IFR search create one base design**

In `handleRouteSearch`, retain one explicit `fetchRouteExposure` request after `buildBriefingRoute` succeeds. Replace the generated-route/procedure-candidate branch with the equivalent single-design commit:

```js
const procedures = { sid: selectedSid, star: selectedStar, iapKey: selectedIapKey }
const base = createRouteDesign({
  routeForm: { ...routeForm, routeType: effectiveRouteType },
  procedures,
  routeResult: result,
  routeModel,
  routeExposure: baseExposure,
})
setRouteDesigns([base])
setSelectedRouteDesignId(base.id)
setRouteResult(base.routeResult)
setRouteExposure(base.routeExposure)
setWorkflowStep('compare')
```

For an unavailable geometry or exposure request error, create the same single base design with `trigger: 'unavailable'`; do not fabricate a clear hazard result. Remove `recommendProcedures(... includeAll: true)` from this path. Keep existing explicit procedure selection/recommendation behavior outside candidate generation intact.

- [ ] **Step 4: Replace candidate selection with design selection**

Replace `routeCandidates`/`selectedCandidateId` state and action names with `routeDesigns`/`selectedRouteDesignId`. `selectRouteDesign(id)` must update the route result, exposure, and selected SID/STAR/IAP from that design, then invalidate only altitude comparison, vertical profile/cross-section, and briefing. It must not recalculate route exposure or alter other designs.

When `clearRouteDisplay` or a new search starts, clear the design collection and selection. `requestAltitudeComparison`, `continueToAltitudeComparison`, briefing preparation, and workflow availability must read the selected design, with the selected route result as the fallback only while a search is in progress.

- [ ] **Step 5: Connect copy, rename, and deletion to hook state**

Add `duplicateSelectedRouteDesign`, `renameSelectedRouteDesign`, and `removeSelectedRouteDesign` actions in `useRouteBriefing`, backed by the pure helpers from Task 1. Return all three from `actions` for `RouteBriefingPanel`. Keep their names distinct from imported pure helpers.

`duplicateSelectedRouteDesign` must select the newly appended copy and synchronize `routeResult`, `routeExposure`, SID/STAR/IAP, and invalidated altitude/vertical-profile/briefing state through the same selected-design synchronization path as `selectRouteDesign`. `renameSelectedRouteDesign` changes only the matching design name and preserves selection/results. `removeSelectedRouteDesign` must use the helper's returned selected ID, then synchronize that surviving selected design through the same path. None of these actions may fetch exposure, regenerate a route, or mutate another design.

- [ ] **Step 6: Run existing route-planner tests**

Run: `npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/routePlanner.enroute.test.js`

Expected: the retained graph-route test passes and no deleted-generator symbol is referenced.

### Task 3: Add user-owned design actions and comparison UI

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Change the component contract to designs**

Keep the existing file to avoid a needless file rename, but change its public component name to `RouteDesignStep`. Accept `designs`, `selectedDesignId`, `onSelect`, `onDuplicate`, `onRename`, `onRemove`, `routeExposure`, `metVisibility`, `onToggleMet`, `onBack`, and `onContinue`.

Render `기본 경로`, `경로 A`, `경로 B`, `경로 C` from each design’s `name`; never render “대안” or distance-order/recommendation language. Keep existing exposure facts and map-layer chips, but derive the chips from the selected design exposure. Each card shows only available facts: distance, ETA, wind, icing/turbulence, and SIGMET/AIRMET exposure. Missing values must say `자료 없음`, not imply clear conditions.

- [ ] **Step 2: Add minimal design controls**

On the selected card provide accessible controls for `복제`, `이름 변경`, and `삭제`. Use the existing Fluent button/input patterns already imported by `RouteBriefingPanel`; do not introduce a modal or a new dependency. Disable copy at four designs and delete when only one design remains. Renaming can use a compact inline text input with explicit `저장` and `취소`; Enter saves and Escape cancels.

- [ ] **Step 3: Wire the panel and workflow text**

Change the second workflow label to `경로 설계·비교` in desktop and mobile arrays. Pass route-design state/actions to the component. In briefing preparation, replace `selectedRouteCandidate` with the selected design name. Keep its current “selected route” summary and downstream navigation behavior.

- [ ] **Step 4: Add only required CSS**

Reuse `.rb-alternative-card`, `.rb-step-actions`, and design tokens. Add a small action row and inline rename row; make desktop cards readable and mobile controls at least `var(--touch-min)`. Do not add colors beyond existing semantic/token values.

### Task 4: Make map preview use manual designs without procedure corruption

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeBriefingModel.js`
- Modify: `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Modify: `frontend/src/features/route-briefing/lib/routePreviewSync.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

- [ ] **Step 1: Rename the preview model field**

Rename `routeCandidates` to `routeDesigns` and `selectedCandidateId` to `selectedRouteDesignId` through `buildRoutePreviewModel`, the hook memo, and `syncRoutePreviewLayers`. Do not change `MapView.jsx`; it already forwards the preview model to the synchronizer.

- [ ] **Step 2: Render each design’s en-route line exactly as calculated**

When there is more than one design, write one `route-design-line` feature per design. Set `{ designId, selected, kind: 'design' }` properties. Do not slice first/last coordinates for stored procedures: each design already owns its procedure selection, and only the selected design’s SID/STAR/IAP preview belongs in `PROC_PREVIEW_SOURCE`.

- [ ] **Step 3: Update focused preview tests**

Replace candidate terminology in the tests and add this assertion:

```js
assert.deepEqual(features.map((feature) => feature.properties.selected), [false, true])
assert.deepEqual(features[0].geometry.coordinates, [[126, 37], [127, 37], [128, 37], [129, 37]])
```

This proves manual designs retain their full calculated geometry and only the selected design is highlighted.

- [ ] **Step 4: Run focused tests**

Run: `npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/routeDesigns.test.js src/features/route-briefing/lib/routePlanner.enroute.test.js src/features/route-briefing/lib/routePreviewSync.test.js`

Expected: all focused tests pass.

### Task 5: Verify the complete Phase 0 workflow and hand off

**Files:**
- Modify: `docs/superpowers/status/2026-07-17-route-alternatives-four-stage-flow.status.md`

- [ ] **Step 1: Run static and production checks**

Run:

```powershell
npm.cmd run test --prefix frontend
npm.cmd run build --prefix frontend
npx.cmd madge --circular frontend/src/features/route-briefing/useRouteBriefing.js
git diff --check
```

Expected: frontend tests and build pass, Madge reports no circular dependency, and `git diff --check` is empty.

- [ ] **Step 2: Run browser verification using the documented fixed-data server**

Start with `npm.cmd run dev:verify` or reuse a verified `npm.cmd run dev:test` instance according to `docs/operations/dev-server-and-capture.md`. Use Playwright at desktop, 1180×820 iPad landscape, and 390×844 mobile to verify:

1. RKSI → RKPK IFR search enters `경로 설계·비교` with only `기본 경로`.
2. `복제` creates `경로 A`; selecting each design changes only the highlighted map line and selected summary.
3. Renaming changes only that design; deleting `경로 A` leaves `기본 경로`; copying stops at four designs.
4. The selected design alone opens altitude comparison and appears in briefing preparation.
5. SIGMET/AIRMET/radar/lightning chips still toggle map layers but do not add, reorder, or rate designs.

Save focused screenshots and a short manifest under `artifacts/responsive-screenshots/manual-route-design-foundation/<timestamp>/`.

- [ ] **Step 3: Update status, without committing**

Record Phase 0 completion, verification evidence, changed files, and the next resume point: Phase 1 map-click addition. Preserve unrelated working-tree files. Do not commit or push unless the user explicitly requests it.

## Phase 0 acceptance checklist

- [ ] No `buildRouteAlternatives` symbol, generated detour, automatic procedure candidate, distance-order wording, safety claim, or recommendation remains in the route-design path.
- [ ] A route search produces one base design; users can manually own at most four designs.
- [ ] Each copied design has independent route input/procedure snapshots; selecting one does not mutate another.
- [ ] Only the selected design feeds altitude comparison, vertical profile, and briefing.
- [ ] Existing relevant hazard-layer chips continue to be display controls only.
- [ ] `MapView.jsx` has no new state or effect.
- [ ] Focused tests, frontend suite/build, structural check, and desktop/iPad/mobile Playwright evidence pass.

## Follow-on plans

After Phase 0 is verified, write separate plans in this order: Phase 1 IFR/VFR map-click add with shared coordinate resolver; Phase 2 bidirectional compatible route-string parsing/formatting; Phase 3 freehand; Phase 4 segment detour. Each must re-check the current Phase 0 data contract before implementation.
