# Monitoring Signage Forecast Readability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve `/monitoring` signage readability while preserving the full weekly forecast.

**Architecture:** `GroundForecastPanel` assigns semantic weekend classes based on each existing weekday value. `App.css` owns all visual changes: signage grid allocation, enlarged forecast header/layer offsets, current-card spacing, and weekly-table typography/colours. No data interfaces or APIs change.

**Tech Stack:** React JSX, CSS, Vitest, Playwright.

## Global Constraints

- Restrict layout changes to `data-dashboard-mode="ground"` plus signage mode.
- Preserve the entire weekly forecast table after the 75px header expansion.
- Weekend colouring applies only to weekday labels: Saturday blue, Sunday red.
- Keep non-signage layouts and weather/alert data unchanged.

---

### Task 1: Expose weekend weekday semantics

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.jsx`
- Create: `frontend/src/features/monitoring/legacy/components/GroundForecastPanel.test.jsx`

**Interfaces:**
- Consumes: existing `airport.forecast` values and `selectWeeklyForecastDays`.
- Produces: `is-saturday` / `is-sunday` class names on `[data-weekly-weekday]`.

- [ ] **Step 1: Write the failing test**

```jsx
it('marks Saturday and Sunday weekday labels for semantic weekend styling', () => {
  render(<GroundForecastPanel airport={airportWithSaturdayAndSunday} />)
  expect(screen.getByText('토')).toHaveClass('is-saturday')
  expect(screen.getByText('일')).toHaveClass('is-sunday')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix frontend -- GroundForecastPanel.test.jsx`

Expected: FAIL because weekday labels have no weekend class.

- [ ] **Step 3: Write minimal implementation**

```jsx
const weekendClass = (weekday) => weekday === '토' ? 'is-saturday' : weekday === '일' ? 'is-sunday' : ''
```

Apply the result to the existing weekday `<strong>` element.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix frontend -- GroundForecastPanel.test.jsx`

Expected: PASS.

### Task 2: Apply signage readability styles

**Files:**
- Modify: `frontend/src/features/monitoring/legacy/App.css`

**Interfaces:**
- Consumes: existing signage data attributes and Task 1 weekend classes.
- Produces: a 75px centred forecast header and fully visible forecast content in signage mode.

- [ ] **Step 1: Extend the signage grid and forecast viewport**

Change the signage grid so its ground forecast row and `.ground-forecast-viewport` are 557px. Do not reserve a warning-banner grid row in signage mode.

- [ ] **Step 2: Align forecast-layer geometry with the enlarged header**

Set `.ground-forecast-viewport-header` to `height: 75px` and `align-items: center`; update the layer top inset from `54px` to `79px`.

- [ ] **Step 3: Improve text spacing and table legibility**

Add a vertical gap to `.ground-current-card-temp-wrap`, enlarge weekly table `th` labels, and colour `.is-saturday` blue and `.is-sunday` red.

- [ ] **Step 4: Run the focused component test**

Run: `npm test --prefix frontend -- GroundForecastPanel.test.jsx`

Expected: PASS.

### Task 3: Verify the browser contract

**Files:**
- Verify: `frontend/verification/contracts/monitoring.spec.mjs`

- [ ] **Step 1: Run the monitoring Playwright contract**

Run: `npm run dev:contract -- --grep monitoring`

Expected: the monitoring contract exits 0.

- [ ] **Step 2: Run a focused 1254x960 signage capture**

Run the registered monitoring contract/capture at 1254x960 and inspect its screenshot for the specified header, table, current-card, warning-banner, and weekend-colour conditions.
