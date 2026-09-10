# AMOS Responsive Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the AMOS airport-panel tab so phone, tablet, narrow drawer, and desktop layouts prioritize operational readability instead of preserving the prototype board at all widths.

**Architecture:** Preserve the existing AMOS view-model contract and domain semantics unless capture evidence proves the UI needs additional derived fields. Treat the current console board as the desktop/wide-panel baseline, collect screenshot evidence first, then choose an approved responsive layout option before changing JSX or CSS. Use layout tokens and panel-width constraints from `frontend/src/app/layout/layoutTokens.css`; do not make the AMOS tab depend on page-level horizontal scrolling.

**Tech Stack:** Vite, React, plain CSS in `AirportPanel.css`, Node test runner, Playwright or Browser-driven screenshot capture, existing ProjectAMO responsive layout tokens.

---

## Required Reading Checklist

- [x] `AGENTS.md`
- [x] `Architecture.md`
- [x] `EntryPoints.md`
- [x] `docs/ui-responsive-guidelines.md`
- [x] `frontend/src/app/layout/layoutTokens.css`
- [x] `frontend/src/app/layout/layoutTokens.test.js`
- [x] `docs/archive/development/plans/2026-05-17-responsive-surface-implementation-plan.md`
- [x] `docs/archive/development/plans/2026-05-18-amos-airport-panel-layout.md`
- [x] `frontend/src/features/airport-panel/tabs/AmosTab.jsx`
- [x] `frontend/src/features/airport-panel/lib/amosViewModel.js`
- [x] `frontend/src/features/airport-panel/lib/amosViewModel.test.js`
- [x] `frontend/src/features/airport-panel/AirportPanel.css`

## Current AMOS Implementation Summary

- `AmosTab.jsx` renders a console-style board with a two-cell runway header, 2-minute wind table, center dial, 10-minute wind table, RVR/MOR row, and five common weather cells.
- `amosViewModel.js` owns time formatting, representative runway labels, active runway selection, m/s to kt conversion, QNH inHg formatting, RVR/MOR formatting, and wind-component calculations.
- `amosViewModel.test.js` pins the normalized AMOS rule that `amos.runways[0]` is the 2-minute wind group and `amos.runways[1]` is the 10-minute wind group. RVR/MOR still use left/right runway slots.
- `AirportPanel.css` currently keeps the original console board feel by using a full board width around `780px` and internal minimum widths around `720px`; narrow panels fall back to board-local horizontal scroll.
- `Architecture.md` already records the important AMOS domain rule: wind groups are time-window groups, while visibility and RVR keep runway-side semantics.

## Responsive Success Criteria

Derived from `docs/ui-responsive-guidelines.md`, `layoutTokens.css`, and the airport-panel drawer contract:

- No page-level horizontal scroll at any reviewed viewport.
- Phone `390x844`: the first screen must show the most important AMOS operational state without forcing the user to understand a desktop table first.
- Tablet portrait `820x1180`: do not blindly preserve the desktop console if it slows recognition; tablet may use a simplified reading order.
- Tablet landscape `1180x820`: preserve more console structure only if wind component, RVR/MOR, and common values remain scannable.
- Desktop comparator `1920x1080`: keep the console-board strengths where the drawer has enough width.
- Actual airport panel width range `560px` to `800px`: verify the AMOS tab inside the real drawer sizing rule, not only full viewport screenshots.
- Korean labels and values must not clip, overlap, or become illegible.
- RVR/MOR must either stay on one line or have an explicit mobile alternative that reads clearly.
- Dial, runway strip, bearing labels, wind arrow, and component values must not overlap.
- Panel-local horizontal scroll is allowed only as a fallback for dense two-dimensional content, not as the primary phone/tablet UX.

## Capture Matrix

Store every capture pass under:

```text
artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/
```

Required files in each pass:

```text
README.md
capture-log.json
review/issues.md
```

Required viewport captures:

| Target | Size | Purpose |
| --- | --- | --- |
| phone | `390x844` | Prove first-screen operational readability and absence of page-level horizontal scroll. |
| tablet portrait | `820x1180` | Check whether the console is too dense for portrait reading. |
| tablet landscape | `1180x820` | Check whether console-like composition still works. |
| desktop comparator | `1920x1080` | Preserve desktop/wide-panel console advantages. |

Required panel-width captures:

| Harness width | Purpose |
| --- | --- |
| `560px` | Minimum drawer width from `--panel-drawer-lg`; expected worst case for internal AMOS density. |
| `640px` | Mid-narrow drawer; likely tablet/compact desktop pressure point. |
| `800px` | Maximum drawer width; should resemble the existing console board. |

Harness approach:

- Prefer the real app and real airport panel when possible.
- If the real viewport cannot produce exact drawer widths, create a temporary local capture harness script that opens the app, selects an AMOS-capable airport, forces the airport panel container width through browser-side style injection, captures the AMOS tab, records DOM metrics, then closes without changing production files.
- Record `document.documentElement.scrollWidth`, `document.body.scrollWidth`, `.airport-panel` bounds, `.airport-panel-body` bounds, `.ap-amos-console-board` bounds, and any board-local scroll width in `capture-log.json`.

## Baseline Issue Hypotheses

Capture should confirm or reject these before implementation:

- Phone may depend on board-local horizontal scroll because the console keeps a `720px` internal minimum.
- Dial, wind tables, RVR/MOR, and common cells currently compete for first-read priority; the most safety-relevant state may not be visible quickly.
- 2-minute and 10-minute wind tables may be too dense on `560px`, `640px`, and phone surfaces.
- RVR/MOR and head/tailwind/crosswind may be visually secondary even though they are high-value operational cues.
- The dial may consume too much vertical space on phone before the user sees RVR/MOR and common weather values.
- Korean labels in the table headers may technically fit only by becoming too small or clipped.

## Layout Proposals

### Option A: Desktop Console With Narrow-Panel Compression

Keep the existing console board as the dominant structure. Improve narrow-panel behavior with measured CSS changes:

- Keep runway header, wind table, dial, RVR/MOR row, and common row in the same order.
- At `800px`, preserve the current console visual.
- At `640px` and `560px`, reduce dial size, reduce row heights, tighten value typography, and allow board-local horizontal scroll only where dense rows cannot responsibly collapse.
- Keep JSX changes minimal; most work stays in `AirportPanel.css`.

Pros:

- Lowest implementation risk.
- Preserves current prototype fidelity.
- Least chance of breaking `amosViewModel.test.js`.
- Good for desktop and wide airport-panel users.

Cons:

- May still fail operational clarity on phone.
- Internal horizontal scrolling remains a core interaction on narrow widths.
- Dense desktop tables may remain hard to scan on tablet portrait.

### Option B: Information-Priority Layout For Phone And Tablet

Use the console board for desktop/wide panels, but restructure phone and narrow-panel reading order around operational priority:

- First block: active runway, observed time, head/tailwind, crosswind, wind direction/speed summary.
- Second block: RVR/MOR for both runway ends with explicit one-line or stacked mobile treatment.
- Third block: 2-minute and 10-minute wind groups as compact stacked cards instead of side-by-side tables.
- Fourth block: common weather values in a two-column or single-column mobile grid.
- Dial becomes a secondary compact visual or collapses below the component summary on phone.
- Tablet portrait may use the same priority order, while tablet landscape can retain a split console-like layout.

Pros:

- Best aligned with operational clarity guidance.
- Avoids treating panel-local horizontal scroll as the final phone UX.
- Makes RVR/MOR and wind components faster to read.
- Allows phone and tablet portrait to stop preserving a desktop table when it hurts comprehension.

Cons:

- Requires JSX structure changes and more CSS.
- Needs explicit user approval because it changes information architecture.
- More visual QA required across all target widths.

### Option C: Hybrid Summary-First Console

Add a compact summary band above the existing console board, then tune the board below:

- Summary band appears first on all widths or only below a container threshold.
- Summary band includes active runway, head/tailwind, crosswind, RVR/MOR, QNH, temperature/dewpoint.
- Existing console board remains below as the detailed diagnostic view.
- On phone, the board may be visually de-emphasized or remain horizontally scrollable as fallback detail.

Pros:

- Improves first-read clarity without fully replacing the console.
- Allows desktop users to keep the prototype-like board.
- Lower risk than a full mobile restructuring.

Cons:

- Duplicates information unless carefully designed.
- May increase vertical length.
- Still leaves the detailed console with narrow-width density problems.

## Approval Gates

The user must approve before any implementation:

- Whether to implement Option A, B, C, or a refined combination.
- Whether phone may break the original console order.
- Whether tablet portrait should follow phone priority order or keep a compressed console.
- Whether the dial can move below text summaries on phone.
- Whether RVR/MOR may switch from one-line `RVR/MOR` display to a stacked mobile expression if one-line values become unreadable.
- Whether to add a summary band that duplicates values already present in the console board.

## Implementation Tasks

### Task 1: Baseline Verification And Screenshot Evidence

**Files:**
- Read only: `frontend/src/features/airport-panel/tabs/AmosTab.jsx`
- Read only: `frontend/src/features/airport-panel/lib/amosViewModel.js`
- Read only: `frontend/src/features/airport-panel/AirportPanel.css`
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/README.md`
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/capture-log.json`
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/review/issues.md`

- [ ] Run the baseline AMOS view-model test:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

Expected: PASS before responsive changes.

- [ ] Run layout-token test:

```powershell
node --test frontend/src/app/layout/layoutTokens.test.js
```

Expected: PASS before responsive changes.

- [ ] Start or reuse the frontend dev server:

```powershell
npm.cmd run dev --prefix frontend
```

Expected: app available at the reported local URL.

- [ ] Capture AMOS tab screenshots for `390x844`, `820x1180`, `1180x820`, and `1920x1080`.
- [ ] Capture AMOS tab screenshots with airport-panel widths forced or observed at `560px`, `640px`, and `800px`.
- [ ] Write `README.md` with capture time, branch, commit, app URL, viewport matrix, panel-width matrix, capture method, and verification commands.
- [ ] Write `capture-log.json` with viewport, screenshot filename, scroll metrics, and key element bounds.
- [ ] Write `review/issues.md` separating mechanical breakage from operational clarity problems.

### Task 2: Read-Only Review Of Baseline Issues

**Files:**
- Modify: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/review/issues.md`

- [ ] Review each screenshot for page-level horizontal scroll, board-local horizontal scroll, clipped text, overlap, and unreadable values.
- [ ] Review operational clarity separately: first visible state, RVR/MOR recognition, wind-component recognition, and table density.
- [ ] If using subagents during implementation, dispatch read-only `ui-qa-reviewer` and `design-reviewer` against the artifact folder.
- [ ] Update `review/issues.md` with severity, viewport, screenshot, problem, likely owner, and minimal fix direction.

### Task 3: Choose Responsive Direction

**Files:**
- Modify: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>/review/issues.md`
- No production source changes.

- [ ] Compare baseline evidence against Options A, B, and C.
- [ ] Recommend one option with a short rationale tied to captured evidence.
- [ ] Pause for user approval before implementation.

### Task 4: Test-First Implementation Prep

**Files:**
- Modify only if needed: `frontend/src/features/airport-panel/lib/amosViewModel.test.js`
- Modify only if needed: `frontend/src/app/layout/layoutTokens.test.js`

- [ ] Decide whether the selected layout needs new view-model fields. Expected default: no view-model change for Option A; possible summary fields for Option B or C.
- [ ] If adding view-model fields, first add focused tests for the new derived summary contract while preserving existing AMOS wind-group tests.
- [ ] If adding a documented responsive policy selector or token usage rule, first add or update layout-token tests.
- [ ] Run the targeted tests and confirm the new tests fail for the intended reason before implementation.

### Task 5: JSX Structure Changes

**Files:**
- Modify if approved: `frontend/src/features/airport-panel/tabs/AmosTab.jsx`

- [ ] For Option A, keep JSX largely unchanged and only add semantic wrappers if CSS cannot target states cleanly.
- [ ] For Option B, introduce explicit summary, RVR/MOR, wind-group, dial, and common-value sections so CSS can reorder without relying on fragile source-order hacks.
- [ ] For Option C, add a compact summary band while keeping the existing detailed console below.
- [ ] Keep AMOS data semantics intact: wind groups are 2-minute and 10-minute; RVR/MOR are runway-side.

### Task 6: CSS Responsive Strategy

**Files:**
- Modify: `frontend/src/features/airport-panel/AirportPanel.css`

- [ ] Use existing breakpoints: `719px`, `720px`, `980px`, `1200px`, `1600px`.
- [ ] Use container-sensitive rules where practical for the AMOS board or airport-panel body, because the real drawer ranges from `560px` to `800px` independent of full viewport size.
- [ ] Keep desktop and wide-panel console styling recognizable at `800px` panel width and `1920x1080`.
- [ ] For phone and `560px` panels, prioritize readable summary blocks over forcing the three-column console.
- [ ] Treat board-local horizontal scroll as fallback detail only, and document when it remains.
- [ ] Avoid shrinking text until it merely fits; if density remains poor, change structure instead.

### Task 7: Browser Capture And Reverification

**Files:**
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>-after/README.md`
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>-after/capture-log.json`
- Create: `artifacts/responsive-screenshots/amos-panel-responsive/<timestamp>-after/review/issues.md`

- [ ] Recapture the full viewport matrix: `390x844`, `820x1180`, `1180x820`, `1920x1080`.
- [ ] Recapture the panel-width matrix: `560px`, `640px`, `800px`.
- [ ] Compare before/after screenshots.
- [ ] Update `review/issues.md` with fixed, deferred, and newly introduced findings.
- [ ] If issues remain, apply a focused CSS/JSX correction batch and recapture only the affected states.

### Task 8: Final Verification

**Files:**
- Inspect: `Architecture.md`
- Modify only if reality drifts: `Architecture.md`

- [ ] Run AMOS view-model tests:

```powershell
node --test frontend/src/features/airport-panel/lib/amosViewModel.test.js
```

- [ ] Run layout-token tests:

```powershell
node --test frontend/src/app/layout/layoutTokens.test.js
```

- [ ] Run frontend build:

```powershell
npm.cmd run build --prefix frontend
```

- [ ] Check whether `Architecture.md` needs an update. Expected default: no change, because AMOS wind-group semantics are already documented.
- [ ] Confirm `git status --short --branch` shows only intentional source, doc, and artifact changes.

## Completion Criteria

- Page-level horizontal scroll is absent.
- Phone `390x844` shows core AMOS state in the first screen.
- Tablet portrait and landscape do not preserve desktop structure when it harms readability.
- Desktop comparator keeps the existing console-board advantages.
- Korean labels and values do not overflow or clip.
- RVR/MOR stays on one line where feasible, or the mobile alternative is explicit and clear.
- Dial, runway strip, bearing labels, wind arrow, and wind component values do not overlap.
- `amosViewModel.test.js` still passes and preserves 2-minute/10-minute wind semantics.
- `layoutTokens.test.js` passes.
- `npm.cmd run build --prefix frontend` passes.
- Screenshot artifacts include `README.md`, `capture-log.json`, and `review/issues.md`.

## Recommended Decision For Approval

Start with baseline captures, then choose between:

- **A** if evidence shows the console remains readable at `560px` with only density tuning.
- **B** if phone or tablet portrait requires faster first-read recognition than the console can provide.
- **C** if the team wants a lower-risk bridge: summary-first clarity plus detailed console below.

Based on the current known risk that narrow widths rely on a `720px` board minimum, Option B or C is more likely to satisfy ProjectAMO's operational clarity standard than Option A alone.
