# Responsive Layout System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ProjectAMO's frontend feel consistent across scaled FHD laptops, WQHD desktops, tablets, and mobile by introducing shared responsive layout rules before broad UI rewrites.

**Architecture:** Add a small frontend layout token layer that defines breakpoints, shell sizes, panel widths, and density rules as CSS custom properties. Apply those tokens first to the main map shell and its panels, then to the standalone monitoring dashboard. Use viewport media queries for page-level layout modes and container queries only where component placement makes viewport-only rules unreliable.

**Tech Stack:** Vite, React 19, plain CSS modules/files, CSS custom properties, CSS `clamp()`, CSS media queries, optional CSS container queries, Node built-in test runner (`node --test`), Playwright for viewport smoke checks.

---

## Visual QA Principle

This work changes visible layout. Do not rely on code review alone.

Every implementation phase must include:

- A before/after screenshot set for the relevant page and viewports.
- A quick automatic overflow/bounds check.
- A human visual review for density, readability, image crop, control usability, and map occlusion.
- A read-only subagent review when the phase changes visible layout: use `ui-qa-reviewer` for browser/screenshot evidence, `design-reviewer` for visual/product consistency, and `spec-reviewer` to check the phase against this plan.

Use two levels of QA:

- Phase-local checks: run immediately after each task that changes visible layout. Check only the screens, tabs, and states touched by that task so regressions are easy to trace.
- Final regression checks: run after all implementation tasks are complete. Check the full screen coverage matrix, cross-feature transitions, browser zoom, empty/loading/error states, and map resize stability.

Use these viewport profiles unless a task gives a narrower list:

- `1536x864` scaled FHD laptop reference, similar to 1920x1080 at 125% OS scale.
- `1920x1080` standard FHD desktop.
- `2560x1440` WQHD desktop.
- `1180x820` tablet landscape planning target.
- `820x1180` tablet portrait planning target.
- `390x844` mobile planning target.

Important baseline rule:

- Do not treat the current physical laptop display as the canonical baseline.
- Use Playwright viewport dimensions as the baseline because they define CSS pixels independent of the host monitor's physical resolution and OS scaling.
- The current laptop view is still useful as one real-world smoke check, but it should not override the named viewport profiles above.
- For desktop consistency, compare at minimum `1536x864`, `1920x1080`, and `2560x1440`.
- Store screenshots for process review under a timestamped capture-pass folder such as `artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMM_label>/`. File names must include route/state and viewport, and the folder label must indicate whether it is before, after, follow-up, or post-fix.

For each screenshot checkpoint, inspect:

- Panel proportion: panels should feel related across laptop and WQHD, not identical in physical size.
- Text: labels, values, buttons, tabs, and Korean strings must remain readable and must not wrap awkwardly inside fixed-height controls.
- Images: airport header photos and weather icons must not crop important content or stretch.
- Controls: interactive targets must stay at least 24 by 24 CSS px on desktop and should move toward 44 by 44 CSS px for tablet/mobile phases.
- Map usability: floating panels, timelines, legends, and advisory badges must not unnecessarily cover core map reading areas.
- Scroll behavior: page-level horizontal scroll is a failure except for inherently two-dimensional content.

Operator-first review rule:

- Review every capture as if the reader is an active pilot, dispatcher, or controller who must identify weather, airport status, warnings, and route-impacting information within seconds.
- Prefer information hierarchy, scan speed, and error resistance over preserving the current desktop composition at all costs.
- A layout is not good enough merely because it technically fits. It must let an operational user answer the following quickly:
  - What airport or route am I looking at?
  - Is the current condition operationally safe or restricted?
  - What is the next important change in METAR, TAF, warning, or advisory data?
  - Where do I tap or click next for the most important supporting detail?
- Treat these as failures even if no CSS overflow exists:
  - Important status information is visually buried below lower-priority controls.
  - The user must scan across too many competing cards before finding runway-relevant weather or warnings.
  - The map, panel, and controls compete for the same attention area without a clear primary task.
  - Mobile users must context-switch across a crowded mixed map-and-data layout when a tabbed or stepwise flow would be clearer.

Operational QA prompts for subagents:

- `ui-qa-reviewer` should judge whether the current state is quickly readable under time pressure, not just whether it avoids clipping.
- `design-reviewer` should prefer changes that reduce decision friction for an operational user even when that means a more structural layout shift than a normal polish pass.
- When a screen feels operationally dense or confusing, reviewers should propose a clearer information architecture, not only narrower spacing or smaller fonts.
- Reviewers should explicitly separate:
  - mechanical breakage: clipping, overflow, hidden controls, blocked clicks
  - operational clarity issues: poor prioritization, weak grouping, too much simultaneous information, map competing with primary data
- If a proposed improvement changes navigation or layout structure, record it as a proposal for user review first instead of assuming it should ship immediately.

Subagent review gates:

- After each visual checkpoint, dispatch `ui-qa-reviewer` with the screenshot folder, changed files, viewport list, and the exact risks to inspect: hard-to-read text, clipped or truncated content, non-conforming UI against this plan/design rules, horizontal overflow, bad-density UI, bad image crop, tap target regression, and map occlusion.
- After each major panel family change, dispatch `design-reviewer` to compare the result against existing ProjectAMO UI patterns and call out only implementation-ready consistency issues.
- Before marking a task complete, dispatch `spec-reviewer` to verify the implementation and screenshot evidence satisfy the task requirements in this plan.
- Keep these agents read-only. The main orchestrator or an `implementer` agent owns edits.

Visual issue batching rule:

- During screenshot review, do not patch CSS immediately for each individual finding.
- If an issue blocks further capture, stop and record it in the issue report first. Continue with a non-CSS QA fallback when one is available, or ask the user before breaking the batching rule.
- For each visible-layout task, collect all user-facing issues first under `artifacts/responsive-screenshots/<phase>/review/`.
- Save a concise issue report as `artifacts/responsive-screenshots/<phase>/review/issues.md` with screenshot path, viewport, panel/tab/state, observed problem, severity, and likely owning file.
- Ask `ui-qa-reviewer` and, when the issue is visual consistency rather than mechanical overflow, `design-reviewer` to review the collected screenshots and append or confirm findings before edits begin.
- After all required states for the task are captured and reviewed, apply one focused batch of CSS/layout fixes, then rerun the same screenshot set and update the issue report with fixed/deferred status.
- If a finding is deferred because it belongs to a later task or a separate mobile redesign, record that explicitly instead of silently dropping it.

Screenshot archive rule:

- Keep screenshots as review artifacts, not source code, unless the user explicitly asks to commit them.
- The screenshot runner writes to `artifacts/responsive-screenshots/`, which is intended for local review and comparison.
- Do not leave screenshots loose in the phase root. Group each capture pass in a timestamped child folder, for example `2026-05-17_0026_task5-followup-postfix/`.
- Each capture-pass folder must include a short `README.md` or manifest that records capture time/timezone, branch, commit hash or "uncommitted", app URL, viewport matrix, capture method, fallback/smoke limitations, verification commands, and the issue-report path.
- If multiple capture passes exist for the same phase, keep a phase-level `README.md` index that identifies the current baseline folder and any older comparison folders.
- When reporting progress, include the key screenshot paths and summarize what changed visually.

Playwright capture method:

- Prefer real user flows first. For airport drawer checks, load `/`, wait for the app and weather data, wait for Mapbox style/layers when network is available, click a real airport marker such as `RKSI`, then wait for `.airport-panel` before taking screenshots.
- If Mapbox external requests are blocked in the normal browser automation environment, rerun the same visual checkpoint from a context that can reach Mapbox, or use a controlled Playwright fallback that opens the real app, waits for React to mount, and exposes the real airport drawer with RKSI data through a test-only harness or app-state helper. Then click the actual `.airport-panel-tab` buttons and in-tab controls. The fallback is acceptable only for panel layout QA; it does not replace a real map-click smoke check.
- Do not add permanent production UI just for screenshots. If a test-only harness/helper is needed, keep it isolated to Playwright setup or a clearly named development/test path and remove or document it before completing the task.
- When a click fails, wait for the UI to settle and inspect what element intercepts the pointer before declaring the state untestable. A pointer interception by `.sidebar`, overlay panels, or the map canvas is a layout bug to record in `review/issues.md`.
- Capture each tab or mode as a separate file. File names must include viewport and state, for example `mobile-taf-table.png` or `scaled-fhd-laptop-metar.png`.

User manual QA handoff:

- After each phase-local screenshot checkpoint and subagent review, pause and tell the user that the current phase is ready for manual visual QA.
- Do not continue to the next visible-layout task until the user either approves the captured state or explicitly says to continue with known issues logged.
- In the handoff message, include:
  - Local app URL.
  - Changed panel/page family.
  - Screenshot folder path.
  - Viewport profiles already captured.
  - Specific states the user should open manually.

Manual DevTools viewport check:

1. Open the local app in Chrome or Edge.
2. Open DevTools with `F12` or `Ctrl + Shift + I`.
3. Toggle Device Toolbar with the phone/tablet icon or `Ctrl + Shift + M`.
4. Enter these viewport sizes manually in the top toolbar:
   - `1536 x 864` for the scaled FHD laptop reference, similar to 1920x1080 at 125% OS scaling.
   - `1920 x 1080` for standard FHD desktop.
   - `2560 x 1440` for WQHD desktop.
   - `1180 x 820` for tablet landscape planning.
   - `820 x 1180` for tablet portrait planning.
   - `390 x 844` for mobile planning.
5. Keep Device Pixel Ratio at the default unless intentionally testing DPR-specific behavior.
6. Confirm the viewport from the Console when needed:

   ```js
   window.innerWidth
   window.innerHeight
   ```

7. Repeat quick desktop checks at browser zoom `90%`, `100%`, and `125%` for `1536x864` and `2560x1440`.

Manual QA pass criteria:

- Panels should feel proportionally consistent between `1536x864`, `1920x1080`, and `2560x1440`.
- Text, Korean labels, buttons, tabs, and values should not clip or wrap awkwardly inside fixed-height controls.
- Airport images, weather icons, legends, and map controls should not stretch, crop important content, or collide.
- Page-level horizontal scrolling is a failure unless the content is inherently two-dimensional, such as dense tables or map canvases.
- If the user sees a mismatch between manual DevTools output and saved Playwright screenshots, stop and capture both cases before continuing.

## Preflight Checks

Run these before editing implementation files. If any check fails, stop and update this plan before proceeding.

1. Confirm required subagents exist:

   ```powershell
   Get-ChildItem -Path .codex\agents -Filter *.toml | Select-Object -ExpandProperty BaseName
   ```

   Expected agents: `implementer`, `ui-qa-reviewer`, `design-reviewer`, `spec-reviewer`, `test-gap-finder`.
   If one is missing, the main agent performs the same read-only review manually and records the gap in the task notes.

2. Confirm monitoring receives global app CSS:

   ```powershell
   Select-String -Path frontend\src\main.jsx -Pattern "./app/App.css"
   Select-String -Path frontend\src\app\App.jsx -Pattern "MonitoringPage|window.location.pathname"
   ```

   Expected: `main.jsx` imports `App.css`, and `App.jsx` routes `/monitoring` to `MonitoringPage`. If monitoring is later split into a separate entry, add the token import there too.

3. Inventory monitoring breakpoints before Task 6:

   ```powershell
   Select-String -Path frontend\src\features\monitoring\legacy\App.css -Pattern "@media"
   ```

   Expected current inventory includes legacy thresholds such as `1400px`, `1024px`, `980px`, `900px`, and `768px`. Task 6 only aligns the dashboard shell threshold in this pass; component-specific legacy breakpoints stay documented unless visual QA flags them.

4. Confirm vertical profile and basemap switcher style ownership:

   ```powershell
   Select-String -Path frontend\src\features\route-briefing\RouteBriefing.css -Pattern "vertical-profile-window|basemap-switcher"
   ```

   Expected: both are styled in `RouteBriefing.css`, so Task 4 owns their responsive review.

## Final Regression Risk Checks

Run these only after the phase-local checks for all implementation tasks pass. If any item fails, fix it in the smallest relevant CSS/component area, then rerun the related phase-local checkpoint and the affected final regression item.

Empty, loading, and error states:

- Main app initial weather loading state.
- Backend/API failure state where an error banner or load failure is shown.
- Airport drawer tabs when METAR, TAF, AMOS, warning, or airport info data is missing.
- Weather overlay panels when SIGWX, SIGMET, AIRMET, lightning, ADS-B, radar, or satellite data is unavailable.
- Monitoring page loading state and failed load state.

Long-content states:

- Long Korean airport names in the airport drawer header.
- Long SID, STAR, IAP, FIR IN, and FIR EXIT option labels in route briefing.
- Long TAF raw text and TAF table/grid values.
- Long advisory labels/messages in SIGWX, SIGMET, and AIRMET detail panels.
- Long airport information bulletin text.

Scroll and overflow states:

- Every drawer/panel with enough content to require internal scrolling.
- Tables inside airport drawer tabs and monitoring panels.
- Bottom timeline plus ADS-B timestamp plus advisory badges when multiple overlays are visible.
- Browser page horizontal overflow at every required viewport.

Transition states:

- Sidebar collapsed to expanded while a map panel is open.
- Aviation panel to MET panel to Route Briefing panel.
- Airport drawer opened while sidebar is collapsed and expanded.
- Basemap Standard to Dark to Satellite while overlays are visible.
- Route Briefing open while basemap changes.
- Monitoring ops to ground mode and back.

Browser zoom states:

- Repeat desktop smoke checks at browser zoom `90%`, `100%`, and `125%` for `1536x864` and `2560x1440`.
- Treat zoom checks as real-world resilience checks, not as replacements for the fixed viewport baseline.

Keyboard and accessibility states:

- Keyboard focus outlines remain visible for sidebar buttons, panel toggles, route controls, airport drawer tabs, and monitoring settings controls.
- Controls remain at least 24 by 24 CSS px on desktop; tablet/mobile planning states should move toward 44 by 44 CSS px where practical.
- Reduced-motion preference does not leave required state changes invisible.

Map resize and overlay collision states:

- Mapbox canvas resizes correctly after sidebar expansion/collapse.
- Mapbox canvas resizes correctly after opening and closing the airport drawer.
- Mapbox controls do not collide with custom panels.
- Weather timelines, legends, advisory badges, and detail panels do not stack over each other in a way that blocks core map use.
- Basemap switches do not leave blank map areas or stale overlay UI positions.

## Required Screen Coverage Matrix

All visible pages, panels, and tabs must have their own screenshot file before this responsive layout work is considered complete. Capture each listed state after normal user-facing clicks or interactions, one state at a time. The route-level screenshot automation is only a baseline; it is insufficient unless supplemented by the per-state screenshots in this matrix.

For tabbed or multi-mode panels, capture one screenshot per visible tab/mode instead of sampling only the default tab. Review from a user perspective: can the user read the labels and values, can they click the tab/control, is any content clipped, is any table or card too cramped, does any UI violate the plan/design rules, and does the panel respect the intended viewport width?

Main app route:

- `/` with no side panel open.
- `/` with sidebar collapsed.
- `/` with sidebar expanded.
- `/` with Aviation panel open.
- `/` with MET/weather panel open.
- `/` with Settings panel open.
- `/` with Route Briefing panel open in default IFR state.
- `/` with Route Briefing switched to VFR state.
- `/` with route result visible after a representative search, when sample data allows it.
- `/` with vertical profile window open, when route result data allows it.
- `/` with basemap switcher opened.
- `/` with Standard basemap selected.
- `/` with Dark basemap selected.
- `/` with Satellite basemap selected.

Weather overlay states:

- MET/weather panel with Weather group visible.
- MET/weather panel with Hazards group visible.
- MET/weather panel with Traffic group visible.
- Radar timeline visible.
- Satellite timeline visible.
- Lightning timeline/legend visible.
- SIGWX history bar visible.
- SIGWX legend dialog open.
- Advisory badge bar visible.
- SIGWX detail panel open when data exists.
- SIGMET detail panel open when data exists.
- AIRMET detail panel open when data exists.
- ADS-B timestamp visible when ADS-B is enabled.

Aviation panel states:

- FIR/Sector group expanded.
- Waypoint/Navaid/Airport toggles visible.
- CTR/TMA/Airspace toggles visible.
- ATS/RNAV route toggles visible.
- At least one dense layer group with long labels enabled.

Airport drawer states:

- Airport drawer opened for `RKSI` or the first available non-test airport.
- Airport drawer `METAR` tab.
- Airport drawer `TAF` tab in Timeline view.
- Airport drawer `TAF` tab in Table view.
- Airport drawer `TAF` tab in Grid view.
- Airport drawer `AMOS` tab.
- Airport drawer airport warning tab.
- Airport drawer airport information tab.
- Airport drawer with warning badge visible when warning data exists.
- Save the airport drawer tab set under a timestamped capture-pass folder in `artifacts/responsive-screenshots/airport-drawer-tabs/`, for example `artifacts/responsive-screenshots/airport-drawer-tabs/2026-05-17_0026_task5-followup-postfix/`, and collect review notes under that folder's `review/issues.md` before making additional CSS changes.
- The airport drawer QA pass must include normal tab clicks at the required viewports. If a tab cannot be clicked because another UI layer intercepts it, record the intercepting element and viewport as a layout issue.

Monitoring route states:

- `/monitoring?mode=ops` default dashboard.
- `/monitoring?mode=ops` with map panel visible.
- `/monitoring?mode=ops` with settings dialog open.
- `/monitoring?mode=ops` with TAF timeline/table mode currently selected by local storage.
- `/monitoring?mode=ground` default dashboard.
- `/monitoring?mode=ground` with ground forecast panel visible.
- `/monitoring?mode=ground` with map panel visible.
- `/monitoring?mode=ground` with settings dialog open.

Viewport coverage rule:

- Every state above must be checked at `1536x864`, `1920x1080`, and `2560x1440`.
- High-risk drawer, route briefing, monitoring, and mobile-planning states must also be checked at `1180x820`, `820x1180`, and `390x844`.
- If a state requires live data that is unavailable, capture the closest empty/loading state and record the gap in the UI QA report instead of silently skipping it.

## Research Basis

Use these references as the external standard behind the plan:

- W3C WCAG 2.1/2.2 Reflow: content should present without loss of information or functionality at 320 CSS px width for vertical scrolling content, with exceptions for interfaces that inherently need two-dimensional layout such as maps or data tables.
  Source: https://www.w3.org/WAI/WCAG21/Understanding/reflow
- W3C WCAG 2.2 Target Size Minimum: pointer targets should generally provide at least 24 by 24 CSS px target size unless an exception applies.
  Source: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- MDN Media Queries: media queries are a core responsive design tool for applying styles based on viewport and device characteristics.
  Source: https://developer.mozilla.org/en-US/docs/Web/CSS/Media_Queries
- MDN Container Queries: container queries apply styles based on an element's containing block instead of the viewport, which is useful for reusable panels placed in different shells.
  Source: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries
- MDN `clamp()`: `clamp(min, preferred, max)` is appropriate for bounded responsive sizes; avoid using it to prevent text zoom from reaching at least 200%.
  Source: https://developer.mozilla.org/docs/Web/CSS/Reference/Values/clamp
- Material responsive layout: Material's older responsive layout guidance uses multiple width breakpoints such as 480, 600, 840, 960, 1280, 1440, and 1600 as adaptation thresholds. Treat this as a reference scale, not a requirement to copy exactly.
  Source: https://m1.material.io/layout/responsive-ui.html

## Current State

- The main app shell uses `100vw`, `100vh`, and hard-coded sidebar offsets in `frontend/src/app/App.css`.
- The sidebar uses fixed collapsed and expanded widths in `frontend/src/app/layout/Sidebar.css`.
- The map overlay panels use fixed widths in `frontend/src/features/map/MapView.css`, including `286px`, `280px`, `196px`, and `160px`.
- The route briefing panel uses a fixed `376px` width in `frontend/src/features/route-briefing/RouteBriefing.css`.
- The airport drawer uses a fixed `800px` width in `frontend/src/features/airport-panel/AirportPanel.css`.
- The monitoring screen uses a separate legacy layout system in `frontend/src/features/monitoring/legacy/App.css`, including a `1.2fr 1fr` dashboard grid, multiple hard-coded heights, and separate breakpoint thresholds.
- Existing tests mostly cover data/model helpers. CSS layout behavior is not currently guarded by tests or viewport smoke checks.

## Responsive Policy

Use CSS pixels, not physical pixels, as the implementation unit. A 1920 by 1080 display at 125% Windows scaling behaves roughly like a 1536 by 864 CSS px viewport before browser chrome is considered, so the layout must be designed around CSS viewport size.

Define these page-level modes:

- `mobile`: `width <= 719px`
- `tablet`: `720px <= width <= 979px`
- `compact`: `980px <= width <= 1199px`
- `desktop`: `1200px <= width <= 1599px`
- `wide`: `width >= 1600px`

Breakpoint custom properties are policy and test anchors only. CSS custom properties cannot be used inside `@media` queries, so each CSS file must hardcode the same numeric breakpoint values in media queries.

Main map behavior:

- Desktop and wide keep the map as the primary full-screen workspace.
- Overlay controls use bounded responsive widths, not fixed desktop widths.
- Large right drawers such as the airport panel may grow on wide screens, but must not exceed a comfortable percentage of the map workspace on compact desktop.
- Mobile and tablet can be introduced as phased work: the first implementation should create the tokens and safe constraints, then later tasks can convert large side drawers into bottom sheets or full-height sheets.

Accessibility and interaction rules:

- Interactive controls should be at least 24 by 24 CSS px. Primary touch controls introduced for tablet/mobile should target 44 by 44 CSS px where practical.
- Avoid page-level horizontal scrolling except for content that is inherently two-dimensional, such as map canvases, charts, timelines, and dense data tables.
- Do not defeat browser zoom or OS scaling. The CSS should adapt to them.

Typography, media, and spacing rules:

- Text should not scale aggressively with viewport width. Use bounded token ranges for small UI text, and prefer reflow/repositioning over shrinking text below readable sizes.
- Body/control text should generally stay at 12px or larger for dense desktop controls unless the element is a secondary badge, legend label, or compact timestamp.
- Korean labels need extra wrap checks because a visually small English-safe button can still break with Korean text.
- Images should fit their containers with explicit crop behavior, usually `object-fit: cover` for decorative/header images and `object-fit: contain` for symbols, weather icons, and legends.
- Panel padding and internal gaps should use shared density tokens so a panel does not shrink while its internal spacing remains desktop-large.

---

## File Structure

Create:

- `frontend/src/app/layout/layoutTokens.css`
  - Shared CSS custom properties for breakpoints documentation, shell sizes, panel widths, spacing, and z-indexes.
- `frontend/src/app/layout/layoutTokens.test.js`
  - Node test that reads `layoutTokens.css` and verifies required tokens exist with expected `clamp()` or fixed values.
- `frontend/scripts/responsive-smoke.mjs`
  - Playwright smoke runner that checks key viewports and reports viewport size, shell width, panel bounds, and obvious horizontal overflow.
- `frontend/scripts/responsive-screenshots.mjs`
  - Playwright screenshot runner that captures named app states across viewport profiles for human comparison.

Modify:

- `frontend/src/app/App.css`
  - Import layout tokens and replace hard-coded sidebar/shell values with custom properties.
- `frontend/src/app/layout/Sidebar.css`
  - Use shared sidebar custom properties.
- `frontend/src/features/map/MapView.css`
  - Replace fixed overlay panel widths with bounded responsive custom properties.
- `frontend/src/features/route-briefing/RouteBriefing.css`
  - Use the shared medium panel width and add compact/mobile fallback rules for the route panel, vertical profile window, and basemap switcher styles.
- `frontend/src/features/airport-panel/AirportPanel.css`
  - Replace the fixed `800px` drawer with a bounded large drawer rule.
- `frontend/src/features/monitoring/legacy/App.css`
  - Align top-level dashboard breakpoints and density tokens without changing monitoring behavior.
- `frontend/package.json`
  - Add a `test:layout` script for the Node CSS token tests and a `smoke:responsive` script for the Playwright smoke runner.
- `Architecture.md`
  - Add the layout token file and the responsive layout rule only after code changes land.
- `EntryPoints.md`
  - Add a short task pattern for changing frontend layout density only after code changes land.

Do not modify:

- Backend files.
- Mapbox data/layer sync code.
- Route briefing data/model logic.
- Weather overlay model logic.

---

## Task 1: Add Shared Layout Tokens

**Files:**
- Create: `frontend/src/app/layout/layoutTokens.css`
- Create: `frontend/src/app/layout/layoutTokens.test.js`
- Modify: `frontend/src/app/App.css`
- Modify: `frontend/package.json`

- [x] **Step 1: Write the failing token test**

Create `frontend/src/app/layout/layoutTokens.test.js`:

```js
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const css = readFileSync(new URL('./layoutTokens.css', import.meta.url), 'utf8')

test('layout tokens define shell and panel sizing contracts', () => {
  for (const token of [
    '--sidebar-collapsed',
    '--sidebar-expanded',
    '--app-bottom-bar',
    '--panel-overlay-sm',
    '--panel-overlay-md',
    '--panel-drawer-lg',
    '--breakpoint-tablet',
    '--breakpoint-compact',
    '--breakpoint-desktop',
    '--breakpoint-wide',
  ]) {
    assert.match(css, new RegExp(`${token}\\s*:`), `${token} should be defined`)
  }

  assert.match(css, /--panel-overlay-sm:\s*clamp\(/)
  assert.match(css, /--panel-overlay-md:\s*clamp\(/)
  assert.match(css, /--panel-drawer-lg:\s*clamp\(/)
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because `test:layout` and `layoutTokens.css` do not exist yet.

- [x] **Step 3: Add the layout tokens**

Create `frontend/src/app/layout/layoutTokens.css`:

```css
:root {
  --breakpoint-mobile-max: 719px;
  --breakpoint-tablet: 720px;
  --breakpoint-compact: 980px;
  --breakpoint-desktop: 1200px;
  --breakpoint-wide: 1600px;

  --app-bottom-bar: 24px;
  --sidebar-collapsed: 56px;
  --sidebar-expanded: clamp(260px, 16vw, 280px);

  --panel-overlay-sm: clamp(260px, 20vw, 320px);
  --panel-overlay-md: clamp(320px, 26vw, 420px);
  --panel-drawer-lg: clamp(560px, 42vw, 800px);

  --panel-inset: 12px;
  --panel-padding-sm: clamp(8px, 0.7vw, 12px);
  --panel-padding-md: clamp(10px, 1vw, 18px);
  --panel-padding-lg: clamp(16px, 1.4vw, 24px);
  --panel-gap-sm: clamp(6px, 0.55vw, 10px);
  --panel-gap-md: clamp(8px, 0.75vw, 14px);
  --font-ui-xs: clamp(10px, 0.62vw, 11px);
  --font-ui-sm: clamp(11px, 0.68vw, 13px);
  --font-ui-md: clamp(13px, 0.78vw, 15px);
  --media-header-sm: clamp(130px, 18dvh, 170px);
  --panel-radius: 10px;
  --control-target-min: 24px;
  --touch-target-min: 44px;
}
```

- [x] **Step 4: Import tokens from the app CSS entry**

Add this as the first line of `frontend/src/app/App.css`:

```css
@import './layout/layoutTokens.css';
```

- [x] **Step 5: Add the layout test script**

Add this script to `frontend/package.json`:

```json
"test:layout": "node --test src/app/layout/layoutTokens.test.js"
```

- [x] **Step 6: Run the token test**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add frontend/src/app/layout/layoutTokens.css frontend/src/app/layout/layoutTokens.test.js frontend/src/app/App.css frontend/package.json
git commit -m "feat: add responsive layout tokens"
```

---

## Task 2: Normalize App Shell and Sidebar Sizing

**Files:**
- Modify: `frontend/src/app/App.css`
- Modify: `frontend/src/app/layout/Sidebar.css`
- Modify: `frontend/src/app/layout/layoutTokens.test.js`

- [x] **Step 1: Extend the token test for shell usage**

Append to `frontend/src/app/layout/layoutTokens.test.js`:

```js
const appCss = readFileSync(new URL('../App.css', import.meta.url), 'utf8')
const sidebarCss = readFileSync(new URL('./Sidebar.css', import.meta.url), 'utf8')

test('app shell and sidebar consume shared layout tokens', () => {
  assert.match(appCss, /var\(--sidebar-collapsed\)/)
  assert.match(appCss, /var\(--sidebar-expanded\)/)
  assert.match(appCss, /var\(--app-bottom-bar\)/)
  assert.match(appCss, /--active-sidebar-width:\s*var\(--sidebar-collapsed\)/)
  assert.match(sidebarCss, /var\(--sidebar-collapsed\)/)
  assert.match(sidebarCss, /var\(--sidebar-expanded\)/)
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because shell and sidebar CSS still use hard-coded values.

- [x] **Step 3: Replace app shell hard-coded dimensions**

In `frontend/src/app/App.css`, use this shape:

```css
#root {
  width: 100vw;
  height: 100dvh;
}

.app {
  --active-sidebar-width: var(--sidebar-collapsed);
  width: 100vw;
  height: 100dvh;
}

.map-shell {
  margin-left: var(--sidebar-collapsed);
  width: calc(100vw - var(--sidebar-collapsed));
  height: calc(100dvh - var(--app-bottom-bar));
}

.sidebar-is-expanded .map-shell {
  margin-left: var(--sidebar-expanded);
  width: calc(100vw - var(--sidebar-expanded));
}

.app.sidebar-is-expanded {
  --active-sidebar-width: var(--sidebar-expanded);
}

.utc-bar {
  height: var(--app-bottom-bar);
}
```

Keep the existing transition, color, font, and border declarations.

- [x] **Step 4: Replace sidebar width values**

In `frontend/src/app/layout/Sidebar.css`, replace:

```css
width: 56px;
```

with:

```css
width: var(--sidebar-collapsed);
```

Replace:

```css
width: 260px;
```

with:

```css
width: var(--sidebar-expanded);
```

- [x] **Step 5: Run the layout token test**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: PASS.

- [x] **Step 6: Run the frontend build**

Run:

```bash
npm run build --prefix frontend
```

Expected: Vite build succeeds.

- [x] **Step 7: Commit**

```bash
git add frontend/src/app/App.css frontend/src/app/layout/Sidebar.css frontend/src/app/layout/layoutTokens.test.js
git commit -m "refactor: use responsive shell sizing tokens"
```

---

## Task 3: Make Main Map Overlay Panels Density-Aware

**Files:**
- Modify: `frontend/src/features/map/MapView.css`
- Modify: `frontend/src/app/layout/layoutTokens.test.js`

- [x] **Step 1: Add CSS usage assertions**

Append to `frontend/src/app/layout/layoutTokens.test.js`:

```js
const mapCss = readFileSync(new URL('../../features/map/MapView.css', import.meta.url), 'utf8')

test('map overlay panels use responsive panel tokens', () => {
  assert.match(mapCss, /width:\s*var\(--panel-overlay-sm\)/)
  assert.match(mapCss, /width:\s*var\(--panel-overlay-md\)/)
  assert.doesNotMatch(mapCss, /\.map-view-wrapper \.layer-drawer\s*\{[^}]*width:\s*286px/s)
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because map overlay panel widths are still fixed.

- [x] **Step 3: Replace map overlay panel widths**

In `frontend/src/features/map/MapView.css`:

```css
.dev-layer-panel {
  width: var(--panel-overlay-sm);
}

.map-view-wrapper .layer-drawer {
  width: var(--panel-overlay-sm);
}

.sigwx-legend-modal {
  width: var(--panel-overlay-sm);
}

.settings-panel {
  width: min(196px, var(--panel-overlay-sm));
}
```

Keep the existing position, padding, borders, shadows, and color rules.

- [x] **Step 4: Add compact fallback for overlays**

Add to the existing `@media (max-width: 719px)` block in `MapView.css`:

```css
.map-view-wrapper .layer-drawer,
.dev-layer-panel {
  left: var(--panel-inset);
  right: var(--panel-inset);
  width: auto;
  max-width: none;
}
```

- [x] **Step 5: Run tests and build**

Run:

```bash
npm run test:layout --prefix frontend
npm run build --prefix frontend
```

Expected: both pass.

- [x] **Step 6: Capture map overlay visual checkpoint**

Run the dev server:

```bash
npm run dev
```

Open the app with Playwright or the Codex browser at:

```text
http://127.0.0.1:5173
```

Capture screenshots at:

```text
1536x864
1920x1080
2560x1440
```

Save them under:

```text
artifacts/responsive-screenshots/map-overlays/
```

Open the aviation layer panel and MET/weather panel before capturing at least one screenshot each. Verify:

- Layer drawer width feels similar in proportion on scaled FHD and WQHD.
- Drawer row labels do not truncate common Korean/English labels more than before.
- Right-side legends and bottom timeline still leave the map readable.
- Advisory badge bar does not collide with left overlay panels.

Dispatch `ui-qa-reviewer` after screenshots are saved. Ask it to review only the screenshot evidence and changed CSS for responsive breakage. Dispatch `design-reviewer` if the UI QA pass finds no functional breakage but the density still feels inconsistent.

- [x] **Step 7: Commit**

```bash
git add frontend/src/features/map/MapView.css frontend/src/app/layout/layoutTokens.test.js
git commit -m "refactor: make map overlays density aware"
```

---

## Task 4: Make Route Briefing Panel Density-Aware

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`
- Modify: `frontend/src/app/layout/layoutTokens.test.js`

- [x] **Step 1: Add route briefing CSS assertions**

Append to `frontend/src/app/layout/layoutTokens.test.js`:

```js
const routeCss = readFileSync(new URL('../../features/route-briefing/RouteBriefing.css', import.meta.url), 'utf8')

test('route briefing panel uses responsive medium panel token', () => {
  assert.match(routeCss, /width:\s*var\(--panel-overlay-md\)/)
  assert.match(routeCss, /\.vertical-profile-window/)
  assert.match(routeCss, /\.basemap-switcher/)
  assert.doesNotMatch(routeCss, /\.route-check-panel\s*\{[^}]*width:\s*376px/s)
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because `.route-check-panel` still uses `376px`.

- [x] **Step 3: Replace route panel width**

In `frontend/src/features/route-briefing/RouteBriefing.css`, change:

```css
width: 376px;
```

to:

```css
width: var(--panel-overlay-md);
```

Also inspect `.vertical-profile-window` and `.basemap-switcher` in the same file. Keep existing behavior if screenshots are stable, but do not leave newly introduced fixed panel widths in those sections.

- [x] **Step 4: Add compact route panel fallback**

Add near the panel rules:

```css
@media (max-width: 719px) {
  .route-check-panel {
    left: var(--panel-inset);
    right: var(--panel-inset);
    width: auto;
    max-height: calc(100% - 24px);
  }
}
```

- [x] **Step 5: Run tests and build**

Run:

```bash
npm run test:layout --prefix frontend
npm run build --prefix frontend
```

Expected: both pass.

- [x] **Step 6: Capture route briefing visual checkpoint**

With the dev server running, open the route briefing panel at:

```text
http://127.0.0.1:5173
```

Capture screenshots at:

```text
1536x864
1920x1080
2560x1440
820x1180
```

Save them under:

```text
artifacts/responsive-screenshots/route-briefing/
```

Verify:

- Input labels and values stay readable.
- IFR/VFR segmented controls keep stable height.
- The panel does not cover an excessive map area on the scaled FHD laptop profile.
- Tablet portrait is acceptable as a planning baseline even if final tablet UX is deferred.

Dispatch `ui-qa-reviewer` with the screenshot folder and ask it to check form control readability, panel/map balance, clipping, and overflow.

- [x] **Step 7: Commit**

```bash
git add frontend/src/features/route-briefing/RouteBriefing.css frontend/src/app/layout/layoutTokens.test.js
git commit -m "refactor: make route briefing panel responsive"
```

---

## Task 5: Make Airport Drawer Bounded and Responsive

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`
- Modify: `frontend/src/app/layout/layoutTokens.test.js`

- [x] **Step 1: Add airport drawer CSS assertions**

Append to `frontend/src/app/layout/layoutTokens.test.js`:

```js
const airportCss = readFileSync(new URL('../../features/airport-panel/AirportPanel.css', import.meta.url), 'utf8')

test('airport drawer uses responsive large drawer token', () => {
  assert.match(airportCss, /width:\s*min\(var\(--panel-drawer-lg\),\s*calc\(100vw - var\(--active-sidebar-width\)\)\)/)
  assert.doesNotMatch(airportCss, /\.airport-panel\s*\{[^}]*width:\s*800px/s)
})
```

- [x] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because `.airport-panel` still uses `800px`.

- [x] **Step 3: Replace fixed drawer width**

In `frontend/src/features/airport-panel/AirportPanel.css`, replace:

```css
width: 800px;
```

with:

```css
width: min(var(--panel-drawer-lg), calc(100vw - var(--active-sidebar-width)));
```

This must use `--active-sidebar-width` from `.app`, so the drawer accounts for both collapsed and expanded sidebar states.

- [x] **Step 4: Make airport header media density-aware**

In `frontend/src/features/airport-panel/AirportPanel.css`, change the fixed header height:

```css
height: 170px;
```

to:

```css
height: var(--media-header-sm);
```

Keep:

```css
object-fit: cover;
object-position: center 65%;
```

Then inspect screenshots for important airport image crop. If the crop becomes worse for common airports, adjust only `object-position`, not the layout token.

- [x] **Step 5: Add tablet/mobile drawer mode without changing content**

Keep the existing `@media (max-width: 719px)` block and add this drawer shell rule inside it:

```css
.airport-panel {
  left: 0;
  z-index: 120;
  width: 100vw;
}
```

The mobile drawer must stack above the fixed sidebar (`.sidebar` uses `z-index: 100`) so airport tabs and the close button remain clickable. Keep the existing mobile content rules in that file intact.

- [x] **Step 6: Run tests and build**

Run:

```bash
npm run test:layout --prefix frontend
npm run build --prefix frontend
```

Expected: both pass.

- [x] **Step 7: Capture airport drawer visual checkpoint**

Select an airport so the airport drawer opens. Capture screenshots at:

```text
1536x864
1920x1080
2560x1440
1180x820
820x1180
390x844
```

Save them under:

```text
artifacts/responsive-screenshots/airport-drawer/
```

Also capture every airport drawer tab/mode one by one at the same viewport list:

```text
artifacts/responsive-screenshots/airport-drawer-tabs/
```

Required tab/mode captures:

- `METAR`
- `TAF` Timeline view
- `TAF` Table view
- `TAF` Grid view
- `AMOS`
- Airport warning
- Airport information

Verify:

- Drawer width is less dominant on scaled FHD and not too narrow on WQHD.
- Header image crop still looks intentional.
- Airport title/name and tab labels do not collide with the close button.
- METAR/TAF/AMOS cards keep readable values.
- Mobile profile can be rough if final mobile UX is deferred, but it must not create horizontal page overflow.
- Every tab remains clickable at `390x844`; if the sidebar, map canvas, or another panel intercepts the click, record it as a layout bug.

Dispatch `ui-qa-reviewer` with the screenshot folder and ask it to check drawer dominance, title/close-button collision, tab label wrapping, card readability, image crop, and horizontal overflow. Dispatch `design-reviewer` to review whether the drawer still feels consistent with the rest of ProjectAMO after the width and header media changes.

- [x] **Step 8: Collect all visual findings before CSS follow-up**

Create the report inside the current timestamped capture-pass folder, for example:

```text
artifacts/responsive-screenshots/airport-drawer-tabs/<YYYY-MM-DD_HHMM_label>/review/issues.md
```

Record every user-facing problem found in the screenshots before making additional CSS changes:

```markdown
# Airport Drawer Tab QA Issues

| Severity | Viewport | State | Screenshot | Problem | Likely owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | 390x844 | METAR | ../mobile-metar.png | Example: sidebar intercepts tab clicks | frontend/src/features/airport-panel/AirportPanel.css | open |
```

Use severity `P1` for blocked interaction or clipped primary content, `P2` for hard-to-read or cramped content, and `P3` for polish or consistency issues.

- [x] **Step 9: Review collected findings with subagents, then batch fixes**

Dispatch `ui-qa-reviewer` with:

- `artifacts/responsive-screenshots/airport-drawer/`
- the current timestamped airport drawer tab capture folder under `artifacts/responsive-screenshots/airport-drawer-tabs/`
- that capture folder's `review/issues.md`
- Changed files for Task 5.

Ask it to identify only concrete user-facing issues: clipping, unreadable text, broken tab clicks, horizontal overflow, bad image crop, cramped tables/cards, and tap targets that are too small.

If the findings include visual hierarchy or consistency concerns, dispatch `design-reviewer` with the same folders. After both reviews, apply one focused batch of Task 5 CSS fixes, rerun tests/build, recapture the same tab screenshots, and update `issues.md` statuses to `fixed` or `deferred`.

- [x] **Step 10: Commit**

```bash
git add frontend/src/features/airport-panel/AirportPanel.css frontend/src/app/layout/layoutTokens.test.js
git commit -m "refactor: bound airport drawer width"
```

---

## Task 6: Align Monitoring Dashboard Breakpoints

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/App.css`
- Modify: `frontend/src/app/layout/layoutTokens.test.js`

- [x] **Step 1: Inventory existing monitoring breakpoints**

Run:

```powershell
Select-String -Path frontend\src\features\monitoring\legacy\App.css -Pattern "@media"
```

Expected current inventory includes one top-level dashboard breakpoint at `1024px` plus legacy component-specific breakpoints such as `1400px`, `980px`, `900px`, and `768px`. This task aligns the top-level dashboard shell breakpoint only. Leave component-specific legacy breakpoints unchanged unless visual QA proves they break the responsive policy.

- [x] **Step 2: Add monitoring CSS assertions**

Append to `frontend/src/app/layout/layoutTokens.test.js`:

```js
const monitoringCss = readFileSync(new URL('../../features/monitoring/legacy/App.css', import.meta.url), 'utf8')

test('monitoring dashboard documents shared responsive breakpoints', () => {
  assert.match(monitoringCss, /ProjectAMO responsive layout policy/)
  assert.match(monitoringCss, /@media \(max-width: 1199px\)/)
  assert.match(monitoringCss, /@media \(max-width: 979px\)/)
  assert.match(monitoringCss, /@media \(max-width: 719px\)/)
})
```

- [x] **Step 3: Run the test and verify it fails**

Run:

```bash
npm run test:layout --prefix frontend
```

Expected: FAIL because monitoring CSS has old breakpoint comments and values.

- [x] **Step 4: Add a responsive policy comment and non-disruptive breakpoint aliases**

Near the top of `frontend/src/features/monitoring/legacy/App.css`, after `:root`, add:

```css
/* ProjectAMO responsive layout policy:
   compact <= 1199px, tablet <= 979px, mobile <= 719px.
   Monitoring keeps its legacy card internals, but page-level mode thresholds
   should stay aligned with the main app layout system. */
```

- [x] **Step 5: Change top-level monitoring layout breakpoint**

Replace the top-level dashboard breakpoint:

```css
@media (max-width: 1024px) {
```

with:

```css
@media (max-width: 1199px) {
```

This makes the two-column monitoring dashboard collapse before it becomes crowded on scaled FHD laptop viewports.

- [x] **Step 6: Add tablet and mobile aliases for future work**

Add no-op scoped blocks near the responsive section:

```css
@media (max-width: 979px) {
  .dashboard-root {
    gap: 12px;
  }
}

@media (max-width: 719px) {
  .dashboard-root {
    padding: 12px;
  }
}
```

These blocks intentionally do only safe spacing work in this task. Full mobile monitoring redesign remains a later phase.

- [x] **Step 7: Record deferred monitoring component breakpoints**

Add this comment near the remaining legacy component-specific media queries if they stay unchanged:

```css
/* Deferred responsive alignment:
   The remaining 1400px, 980px, 900px, and 768px rules are component-specific
   legacy monitoring adjustments. Keep them until a dedicated monitoring
   component pass can validate each card/table state with screenshots. */
```

- [x] **Step 8: Run tests and build**

Run:

```bash
npm run test:layout --prefix frontend
npm run build --prefix frontend
```

Expected: both pass.

- [x] **Step 9: Capture monitoring visual checkpoint**

Capture screenshots for:

```text
http://127.0.0.1:5173/monitoring?mode=ops
http://127.0.0.1:5173/monitoring?mode=ground
```

Use viewports:

```text
1536x864
1920x1080
2560x1440
1180x820
820x1180
```

Save them under:

```text
artifacts/responsive-screenshots/monitoring/
```

Verify:

- The two-column dashboard does not feel cramped at scaled FHD.
- Mode switch, settings, and exit controls remain visible.
- METAR and TAF card text remains readable.
- Ground forecast table/card layout does not introduce unexpected horizontal overflow.
- Map panel remains usable after the dashboard breakpoint changes.

Dispatch `ui-qa-reviewer` with the screenshot folder and ask it to check ops and ground mode separately. Dispatch `test-gap-finder` if the reviewer finds an issue that the smoke runner did not catch.

- [x] **Step 8: Commit**

```bash
git add frontend/src/features/monitoring/legacy/App.css frontend/src/app/layout/layoutTokens.test.js
git commit -m "refactor: align monitoring layout breakpoints"
```

---

## Task 7: Add Responsive Smoke and Screenshot Checks

**Files:**
- Create: `frontend/scripts/responsive-smoke.mjs`
- Create: `frontend/scripts/responsive-screenshots.mjs`
- Modify: `frontend/package.json`

- [x] **Step 1: Create the smoke runner**

Create `frontend/scripts/responsive-smoke.mjs`:

```js
import { chromium } from 'playwright'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'

const viewports = [
  { name: 'scaled-fhd-laptop', width: 1536, height: 864 },
  { name: 'desktop-fhd', width: 1920, height: 1080 },
  { name: 'wqhd-desktop', width: 2560, height: 1440 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
]

function boxInfo(box) {
  if (!box) return null
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

const browser = await chromium.launch()
const failures = []

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport })
    await page.goto(APP_URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('.map-shell', { timeout: 15000 })

    const result = await page.evaluate(() => {
      const selectors = ['.sidebar', '.map-shell', '.map-view-wrapper', '.layer-drawer', '.route-check-panel', '.airport-panel']
      const boxes = Object.fromEntries(selectors.map((selector) => {
        const element = document.querySelector(selector)
        if (!element) return [selector, null]
        const rect = element.getBoundingClientRect()
        return [selector, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }]
      }))

      return {
        innerWidth,
        innerHeight,
        bodyScrollWidth: document.body.scrollWidth,
        documentScrollWidth: document.documentElement.scrollWidth,
        boxes,
      }
    })

    const maxScrollWidth = Math.max(result.bodyScrollWidth, result.documentScrollWidth)
    if (maxScrollWidth > result.innerWidth + 1) {
      failures.push(`${viewport.name}: horizontal overflow ${maxScrollWidth} > ${result.innerWidth}`)
    }

    const shell = result.boxes['.map-shell']
    if (!shell || shell.width < Math.min(320, result.innerWidth)) {
      failures.push(`${viewport.name}: map shell missing or too narrow`)
    }

    console.log(JSON.stringify({
      viewport: viewport.name,
      size: `${viewport.width}x${viewport.height}`,
      overflow: maxScrollWidth - result.innerWidth,
      boxes: Object.fromEntries(Object.entries(result.boxes).map(([selector, box]) => [selector, boxInfo(box)])),
    }))

    await page.close()
  }
} finally {
  await browser.close()
}

if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
```

- [x] **Step 2: Add smoke script**

Add this script to `frontend/package.json`:

```json
"smoke:responsive": "node scripts/responsive-smoke.mjs"
```

- [x] **Step 3: Create the screenshot runner**

Create `frontend/scripts/responsive-screenshots.mjs`:

```js
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const APP_URL = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const PHASE = process.env.PROJECTAMO_SCREENSHOT_PHASE || 'manual'
const OUT_DIR = new URL(`../../artifacts/responsive-screenshots/${PHASE}/`, import.meta.url)

const viewports = [
  { name: 'scaled-fhd-laptop', width: 1536, height: 864 },
  { name: 'desktop-fhd', width: 1920, height: 1080 },
  { name: 'wqhd-desktop', width: 2560, height: 1440 },
  { name: 'tablet-landscape', width: 1180, height: 820 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
  { name: 'mobile', width: 390, height: 844 },
]

const routes = [
  { name: 'main-map', path: '/' },
  { name: 'monitoring-ops', path: '/monitoring?mode=ops' },
  { name: 'monitoring-ground', path: '/monitoring?mode=ground' },
]

// This route-level runner captures stable baseline pages. Interactive states
// from the Required Screen Coverage Matrix are captured by the phase-specific
// Playwright/UI-QA checkpoint steps after opening panels, tabs, and dialogs.
// Do not use this baseline runner alone to mark visual QA complete.

await mkdir(OUT_DIR, { recursive: true })

const browser = await chromium.launch()
try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport })
      await page.goto(`${APP_URL}${route.path}`, { waitUntil: 'domcontentloaded' })
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {})
      const label = process.env.PROJECTAMO_SCREENSHOT_LABEL || 'after'
      const file = new URL(`${route.name}-${viewport.name}-${label}.png`, OUT_DIR)
      await page.screenshot({ path: file, fullPage: false })
      console.log(file.pathname)
      await page.close()
    }
  }
} finally {
  await browser.close()
}
```

- [x] **Step 4: Add screenshot script**

Add this script to `frontend/package.json`:

```json
"screenshots:responsive": "node scripts/responsive-screenshots.mjs"
```

- [x] **Step 5: Run the smoke check against the dev server**

Start the dev server in one terminal:

```bash
npm run dev
```

Run in another terminal:

```bash
npm run smoke:responsive --prefix frontend
```

Expected: PASS and JSON lines for all six viewport profiles.

- [x] **Step 6: Capture screenshot set**

Run:

```bash
npm run screenshots:responsive --prefix frontend
```

Expected: PNG screenshots under `artifacts/responsive-screenshots/<phase>/`.

This route-level set is only the baseline capture. Before marking responsive visual QA complete, supplement it with one screenshot file for every state listed in the Required Screen Coverage Matrix after opening the relevant panel, tab, mode, dialog, or basemap through user-facing interactions.

Review at least:

- `main-map-scaled-fhd-laptop-after.png`
- `main-map-wqhd-desktop-after.png`
- `monitoring-ops-scaled-fhd-laptop-after.png`
- `monitoring-ground-scaled-fhd-laptop-after.png`
- `main-map-tablet-portrait-after.png`
- `main-map-mobile-after.png`

If `PROJECTAMO_SCREENSHOT_LABEL=before` was used before a change and `PROJECTAMO_SCREENSHOT_LABEL=after` after a change, compare matching viewport names side by side before continuing.

- [x] **Step 7: Commit**

```bash
git add frontend/scripts/responsive-smoke.mjs frontend/scripts/responsive-screenshots.mjs frontend/package.json
git commit -m "test: add responsive viewport smoke checks"
```

---

## Task 8: Document the Responsive Layout Rule

**Files:**
- Modify: `Architecture.md`
- Modify: `EntryPoints.md`

- [x] **Step 1: Update Architecture file roles**

Add this frontend file role to the flat `Architecture.md` File Roles list, immediately after the existing `frontend/src/app/layout/Sidebar.css` entry:

```markdown
- `frontend/src/app/layout/layoutTokens.css` -> shared responsive layout tokens for shell widths, panel widths, breakpoint policy, spacing, and minimum control sizes.
```

- [x] **Step 2: Update Architecture reference structure**

Add this rule to the frontend reference structure after the existing rule that says `frontend/src/main.jsx` imports only the app entry files:

```markdown
- Frontend layout sizing should use `frontend/src/app/layout/layoutTokens.css` for shared shell, panel, and breakpoint values before adding new fixed pixel widths.
```

- [x] **Step 3: Add an EntryPoints task pattern**

Append this section to `EntryPoints.md` after the existing `## 8. Modify Mapbox style/source-layer sync` section:

```markdown
## 9. Modify responsive layout density

1. Check `frontend/src/app/layout/layoutTokens.css` before adding or changing fixed panel widths.
2. Main shell/sidebar sizing -> `frontend/src/app/App.css` and `frontend/src/app/layout/Sidebar.css`.
3. Map overlay panel sizing -> `frontend/src/features/map/MapView.css`.
4. Route briefing panel sizing -> `frontend/src/features/route-briefing/RouteBriefing.css`.
5. Airport drawer sizing -> `frontend/src/features/airport-panel/AirportPanel.css`.
6. Monitoring dashboard density -> `frontend/src/features/monitoring/legacy/App.css`.
7. Verify with `npm run test:layout --prefix frontend`, `npm run build --prefix frontend`, and `npm run smoke:responsive --prefix frontend` while the dev server is running.
```

- [x] **Step 4: Commit**

```bash
git add Architecture.md EntryPoints.md
git commit -m "docs: document responsive layout policy"
```

---

## Future Tablet and Mobile Layout Plan

The tasks above create the foundation and reduce the desktop/laptop inconsistency. Full tablet/mobile UX should be a separate plan after the token work lands.

Future scope:

- Convert the airport drawer into a bottom sheet or full-screen sheet for mobile.
- Convert route briefing into a bottom sheet with sticky action controls on tablet/mobile.
- Move dense layer lists into collapsible sections optimized for touch targets.
- Add orientation-specific behavior for tablet landscape vs tablet portrait.
- Add visual regression screenshots for `/monitoring?mode=ops` and `/monitoring?mode=ground`.
- Decide whether mobile should expose the full aviation weather workflow or a reduced quick-look workflow.

## Proposed Structural UX Changes For Review

The items below are intentional product/interaction proposals, not immediate CSS tasks. They exist so future responsive work can improve operational clarity instead of only shrinking the current desktop layout.

Principle:

- On tablet and mobile, do not assume that every desktop surface must remain visible at once.
- If showing everything together makes the interface slower to read or harder to operate, prefer a clearer task-based structure even when it is a more dramatic UX change.
- These proposals require user review before implementation.

Proposed mobile and tablet directions:

- Monitoring mobile split view:
  - Replace the simultaneous map-plus-dashboard composition with top-level task tabs such as `기상정보`, `지도`, and `설정` when the viewport is narrow.
  - Keep the default tab on the most operationally important weather summary rather than the map.
  - Treat the map as a dedicated task view on mobile instead of persistent background context.

- Monitoring ops priority stack:
  - In narrow viewports, surface airport identity, current flight category, warning state, and next-change forecast summary before secondary controls or supporting cards.
  - Lower-priority diagnostics, controls, or secondary cards may move into a later tab, sheet, or collapsed section.

- Monitoring ground mode restructuring:
  - If the weekly ground forecast becomes cramped, prefer a swipeable day rail, paged forecast cards, or a dedicated forecast view instead of forcing the full multi-day grid into a narrow panel.
  - Panel-local horizontal scrolling is acceptable as a fallback, but it is not automatically the preferred end state.

- Airport panel mobile model:
  - Replace the current side-drawer reading model with a full-screen step flow on mobile.
  - Treat airport detail as a focused reading task: summary first, then METAR, TAF, warnings, and supporting information in sequence.
  - Do not assume side tabs, bottom tabs, or segmented controls are the target mobile pattern for this panel. The primary review direction is a dedicated full-screen flow.

- Route briefing mobile model:
  - Consider a dedicated step flow or bottom-sheet workflow instead of preserving the full desktop panel density.
  - Prioritize departure, destination, route type, and key operational outputs before secondary editing controls.

- Main map workflow on mobile:
  - Treat the map as one primary mode and detailed panels as another primary mode when both cannot remain readable together.
  - A deliberate mode switch is preferable to a permanently cramped combined layout.

Proposal review checklist:

- Does this change help a pilot/controller identify the most important condition within a few seconds?
- Does it reduce the number of simultaneous things competing for attention?
- Does it make touch interaction clearer without hiding critical data behind too many steps?
- Is the map still available when it is the primary task, without forcing it to coexist with unreadable data panels?
- Is the proposal a real operational improvement, rather than just a visual rearrangement?

Execution rule for remaining responsive work:

- Tasks 1 through 8 above are complete.
- For the remaining responsive/mobile work after Task 8, do not implement new CSS or structural UI changes by default.
- The default mode is now review and proposal only:
  - capture evidence
  - identify deficiencies
  - summarize operator-facing problems
  - propose improvements for user review
- Do not ship responsive structure changes such as new mobile tab models, map/data mode splits, drawer-to-sheet conversions, or full-screen step flows until the user explicitly approves implementation.
- If a reviewer believes a structural change is needed, write it up as a proposal with rationale and expected operational benefit first.

---

## Verification Checklist

Run these after all implementation tasks and phase-local checks:

```bash
npm run test:layout --prefix frontend
npm run build --prefix frontend
npm run dev
npm run smoke:responsive --prefix frontend
npm run screenshots:responsive --prefix frontend
```

Expected:

- Layout token tests pass.
- Vite build succeeds.
- Responsive smoke reports no horizontal overflow for the six viewport profiles.
- Screenshot artifacts exist for main map and monitoring routes.
- Manual browser checks at 1536x864 and 2560x1440 show similar perceived panel proportions.
- Manual visual review confirms text, images, spacing, and controls remain usable after panel changes.
- Final Regression Risk Checks above have been reviewed and any failures have been fixed or explicitly logged as deferred tablet/mobile work.
- `/monitoring`, `/monitoring?mode=ops`, and `/monitoring?mode=ground` still load.

## Self-Review Notes

- The plan intentionally starts with shared tokens because changing individual panels first would preserve the current fragmented sizing system.
- The first implementation pass keeps mobile/tablet behavior conservative. It creates safe bounds and shared breakpoints without committing to a final mobile product design.
- The monitoring page is treated as a separate density pass because it uses copied legacy CSS and has different information-density needs from the main map app.
- The smoke runner uses bounding-box and overflow checks. It does not replace visual QA, but it catches the class of regressions that caused the current laptop vs WQHD concern.
- Breakpoint custom properties are documentation/test anchors. Actual `@media` rules must hardcode the matching numeric breakpoints because CSS custom properties do not work inside media query conditions.
- Sidebar expanded width keeps the existing `260px` minimum so the responsive token does not shrink the current navigation at the `1536x864` laptop CSS viewport.
- Airport drawer width uses `--active-sidebar-width`, not `--sidebar-collapsed`, so the drawer respects both collapsed and expanded sidebar states.
- Monitoring component-specific legacy breakpoints remain deferred in this first pass unless screenshots show visible breakage.
- Vertical profile window and basemap switcher responsive review is included through `RouteBriefing.css`; they are not separate CSS files in the current codebase.
