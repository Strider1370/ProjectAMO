# Mobile Vertical-Profile Fullscreen Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep all route-briefing vertical-profile controls usable in the forced-rotation mobile fullscreen view.

**Architecture:** `BriefingView` remains the single owner of the inline/fullscreen layer state and forecast-hour callback. The fullscreen branch will render the same shared `CrossSectionToggles` and `ForecastHourNav` components inside its rotated surface; CSS will give those controls a two-row, width-bounded toolbar while the chart takes remaining space.

**Tech Stack:** React, CSS grid/flex, Node built-in test runner, Orca browser automation.

## Global Constraints

- Keep the current forced 90-degree rotated fullscreen presentation.
- Use the shared mobile breakpoint (`<=719px`); do not introduce a competing breakpoint.
- Render all six layers, forecast navigation when available, and a visible close action inside fullscreen.
- Reuse `xLayers`, `toggleXLayer`, and `onSelectForecastHour`; no duplicate state or data fetch.
- Every primary mobile control has a `var(--touch-min)` (44px) hit target and at least `var(--space-s)` (8px) gap.
- Do not add dependencies.
- Verify with the running browser at narrow and wide mobile viewports, with no page-level horizontal overflow.

---

### Task 1: Lock fullscreen control parity with focused tests

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingView.responsive.test.js`

**Interfaces:**
- Consumes: `BriefingView` fullscreen JSX and `BriefingView.css` source text.
- Produces: Source-level regression checks for state sharing, all required fullscreen controls, and responsive toolbar geometry.

- [x] **Step 1: Write the failing tests**

Add a `node:test` case that slices only the `xsectionFull` JSX branch, then asserts that branch uses `layers={xLayers}`, includes `<ForecastHourNav crossSection={crossSection} onSelect={onSelectForecastHour} loading={crossSectionHourLoading}`, and includes `<CrossSectionToggles layers={xLayers} onToggle={toggleXLayer}`. Add CSS assertions for `.bv-xfull-toolbar`, `grid-template-columns: minmax(0, 1fr) auto var(--touch-min)`, `height: 100dvw`, flex/min-height containment for the chart, `min-height: var(--touch-min)`, `gap: var(--space-s)`, and the three-column layer-grid fallback.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/BriefingView.responsive.test.js`

Expected: FAIL because the fullscreen branch passes a literal layer object and has no fullscreen toolbar classes.

- [x] **Step 3: Keep the assertions limited to user-visible contracts**

Do not assert incidental whitespace or a copied implementation. The test should only lock the scoped shared state, required controls, touch targets/gaps, chart containment, and responsive grid contract.

- [ ] **Step 4: Commit the failing test only if it is independently useful**

Do not commit a deliberately failing test alone; retain it in the working tree for Task 2 so every commit stays runnable.

### Task 2: Render the shared controls inside the rotated fullscreen surface

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx:749-755`
- Modify: `frontend/src/features/route-briefing/BriefingView.css:346-357`
- Test: `frontend/src/features/route-briefing/BriefingView.responsive.test.js`

**Interfaces:**
- Consumes: `xLayers`, `toggleXLayer`, `crossSection`, `onSelectForecastHour`, `crossSectionHourLoading`, `verticalProfile`, and `pinnedLeg` from `BriefingView`.
- Produces: `.bv-xfull-toolbar`, `.bv-xfull-summary`, `.bv-xfull-layers`, and `.bv-xfull-close` fullscreen controls; the existing `VerticalProfileChart` receives the same `xLayers` object as the inline chart.

- [x] **Step 1: Implement the minimal fullscreen toolbar JSX**

Inside `.bv-xfull-rotate`, add a toolbar before `VerticalProfileChart`. Its first row contains a compact terrain/cruise summary, `ForecastHourNav` (including `loading={crossSectionHourLoading}`), and the existing close action. Its second row wraps `CrossSectionToggles` using `layers={xLayers}` and `onToggle={toggleXLayer}`. Pass `layers={xLayers}` and `advisories={advisories}` to the fullscreen chart, preserving `highlightRangeNm={pinnedLeg}`.

- [x] **Step 2: Implement width-bounded rotated toolbar CSS**

Keep `.bv-xfull-rotate` as the current 90-degree surface, but make it a bounded column: `height: 100dvw`, `display: flex`, `flex-direction: column`, and `overflow: hidden`. The toolbar is width-bounded (`width: 100%`) and the chart/body/plot become `flex: 1` with `min-height: 0`, overriding the chart's fixed plot height so it consumes only the remaining rotated height.

Use `grid-template-columns: minmax(0, 1fr) auto var(--touch-min)` for the first row. Scope the close button and `ForecastHourNav` buttons to `width` and `min-height: var(--touch-min)`, and use `gap: var(--space-s)`. Make the layer group a six-column grid when it fits, with a container-query fallback to `repeat(3, minmax(0, 1fr))` below the measured six-target width; give each `.cs-toggle` `min-height: var(--touch-min)` and `min-width: 0`. This keeps every control tappable without adding a viewport breakpoint that conflicts with `useIsMobile`.

- [x] **Step 3: Run the focused test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/BriefingView.responsive.test.js`

Expected: PASS.

- [x] **Step 4: Run the route-briefing unit suite**

Run: `cd frontend && node --test src/features/route-briefing/**/*.test.js`

Expected: PASS with no unrelated test failures.

- [ ] **Step 5: Commit the implementation and test**

```bash
git add frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css frontend/src/features/route-briefing/BriefingView.responsive.test.js
git commit -m "fix: retain mobile vertical profile controls"
```

### Task 3: Extend the mobile browser contract and capture evidence

**Files:**
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs`
- Modify: `frontend/verification/route-fixture.mjs`
- Modify: `docs/policies/verification/contracts.md`
- Create: `artifacts/responsive-screenshots/mobile-vertical-profile-fullscreen/<YYYY-MM-DD_HHMM_label>/manifest.md`
- Create: `artifacts/responsive-screenshots/mobile-vertical-profile-fullscreen/<YYYY-MM-DD_HHMM_label>/review/issues.md`

**Interfaces:**
- Consumes: the existing local frontend and backend development servers plus the `BriefingView` fullscreen action.
- Produces: inspected narrow- and wide-mobile screenshots and a manifest recording viewport, required visible controls, and overflow result.

- [x] **Step 1: Make the fixture expose two forecast times**

Extend only the route-briefing fixture's cross-section response so the mobile contract can exercise previous/next forecast navigation. Keep existing consumers deterministic. Update the `briefing-view` registry entry to say its fullscreen mobile contract runs on the `mobile` Playwright project and requires two fixture hours.

- [x] **Step 2: Add a focused mobile fullscreen contract**

In `briefing-view.spec.mjs`, add a `testInfo.project.name === 'mobile'` test that creates the briefing, opens `단면도 크게 열기`, and uses role/label locators to assert the visible close action, previous/next forecast buttons, and all six layer controls. Toggle one layer, close fullscreen, and assert the inline control retains that pressed state. Assert document/root `scrollWidth <= innerWidth` at 375px. Do not rely on `dev:contract:fast`, which is desktop-only.

- [x] **Step 3: Open the route briefing in Orca's browser at a narrow mobile viewport**

Use the existing route briefing data, open `단면도 크게 열기`, and capture the fullscreen state at 375px wide. Confirm the close action, previous/next forecast controls when available, and all six named layer buttons are in the accessibility snapshot.

- [x] **Step 4: Verify layer-state parity at the narrow viewport**

Toggle one layer in fullscreen, close it, and confirm the inline briefing chart's corresponding layer control has the same pressed state. Use the DOM snapshot before each action and after each state change.

- [ ] **Step 5: Repeat at a wider mobile viewport**

Capture the same fullscreen state at 430px wide. Confirm all required controls remain visible and the page root's `scrollWidth` does not exceed `innerWidth`.

- [x] **Step 6: Save evidence and manifest**

Save both accepted screenshots under the timestamped responsive-artifact directory. Write `manifest.md` with the viewport dimensions, control list, state-parity result, and horizontal-overflow result; write `review/issues.md` even when it records no remaining issues.

- [ ] **Step 7: Run the browser contract commands**

Run focused while iterating:

```bash
cd frontend && npx playwright test --project=mobile verification/contracts/briefing-view.spec.mjs -g "fullscreen vertical profile"
```

Then run the registered contract across managed projects:

```bash
cd frontend && npm run dev:contract -- --grep "briefing-view"
```

Expected: PASS using the local development server. The focused command proves the mobile branch; the registered command proves the whole briefing contract. If either fails, invoke `systematic-debugging` and return to the failing task.

**2026-07-28 result:** the focused mobile command passed. The three-viewport reuse-server run hit two existing iPad banner/navigation timeouts outside this fullscreen change; keep this step open until that separate contract instability is resolved.

## Plan self-review

- Spec coverage: Task 2 implements forced rotation, control parity, state sharing, 44px targets, responsive layout, and bounded remaining chart height; Task 3 verifies two mobile widths, state parity, forecast navigation, and no horizontal overflow.
- Placeholder scan: no TBD/TODO or unspecified tests remain.
- Type consistency: all named props already exist on `BriefingView`, `CrossSectionToggles`, `ForecastHourNav`, and `VerticalProfileChart`.
