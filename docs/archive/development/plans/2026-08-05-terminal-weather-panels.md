# Terminal Weather Panels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the shared current-weather treatment in terminal views 2 and 3, retain the automatic-transition progress line, and give view 3 its approved 40/60 forecast layout.

**Architecture:** Keep live weather and flight data untouched. Extend the existing `CurrentWeatherBlock` presentation contract with a dedicated terminal-weather variant used by `WeatherFirstScreen` and `WeeklyWeatherScreen`; use condition classes plus CSS pseudo-elements for the low-contrast backdrop so no data or image-fetch layer is added. Let 3안 retain its own page-grid and forecast-panel CSS, while removing only its route-summary wrapper.

**Tech Stack:** React JSX, CSS Grid/custom properties, react-icons, Playwright contracts.

## Global Constraints

- Use only `temp`, `feels`, `humidity`, `wind`, `icon`, `observedAt`, and the already-computed departure-temperature gap.
- Do not change API clients, simulation data, destination sequencing, `frameSeconds`, or `tw-frame-progress` behaviour.
- Apply the new current-weather treatment to 2안 and 3안 only; leave all other `CurrentWeatherBlock` consumers unchanged.
- Keep visible Korean labels beside metric icons and retain the existing `-` fallback for missing values.
- 3안 header has no destination pager but retains the animated blue transition progress line.
- Use the terminal-signage Playwright contract at 1920×1080 and capture the required RKPC 1319×960 evidence.

---

### Task 1: Specify the approved terminal-weather contract in Playwright

**Files:**
- Modify: `frontend/verification/contracts/terminal-signage.spec.mjs:92-136, 224-268`

**Interfaces:**
- Consumes: existing `data-testid="option-three"`, terminal fixture helpers, and both `/terminal/rkss?view=weather` and `?view=rail` routes.
- Produces: failing browser expectations for the shared top-panel semantics and the changed 3안 geometry.

- [ ] **Step 1: Write the failing tests**

Add tests scoped to each view’s `option-two`/`option-three` screen that assert the visible `목적지 날씨` header, date/time, the `tw-frame-progress` element, three labelled metrics (`체감`, `습도`, `바람`), and a text-form temperature-gap sentence when fixture data provides a gap. Replace the 3안 route-summary and pager assertions with no-summary/no-pager assertions and current-city assertions.

Add one 3안 geometry test which reads the existing semantic test IDs/explicit test IDs and asserts: the lower panel is taller than the upper panel, their left/right split remains aligned, and the flight-list header begins inside the full-height flight panel.

For **both** views, assert that the current-weather block contains the destination display name, `현지 시각`, `지금 · HH:MM 관측`, weather-condition text, and the existing metric labels. This prevents the new shared variant from accidentally dropping 3안’s local time or leaving it absent in 2안.

```js
test('terminal-signage 2안과 3안은 전환 진행선과 수치 날씨 레일을 표시한다', async ({ page }) => {
  for (const view of ['weather', 'rail']) {
    await page.goto(`/terminal/rkss?view=${view}&autoplay=0`)
    const screen = page.getByTestId(view === 'weather' ? 'option-two' : 'option-three')
    await expect(screen.getByRole('heading', { name: '목적지 날씨' })).toBeVisible()
    await expect(screen.getByTestId('current-weather-metrics')).toContainText('체감')
    await expect(screen.getByTestId('current-weather-metrics')).toContainText('습도')
    await expect(screen.getByTestId('current-weather-metrics')).toContainText('바람')
    await expect(screen.getByTestId('frame-progress')).toBeVisible()
  }
})
```

- [ ] **Step 2: Run the focused contract to verify it fails**

Run:

```bash
npm --prefix frontend run dev:contract:fast -- contracts/terminal-signage.spec.mjs -g "전환 진행선과 수치 날씨 레일"
```

Expected: FAIL because the current markup has no required test IDs and 2안 does not yet use the shared metric-rail variant.

- [ ] **Step 3: Keep test locators semantic**

Use role, text, then `data-testid` locators. Add test IDs in production markup only for the non-semantic weather rail and progress indicator; do not add CSS-path locators for the changed controls.

- [ ] **Step 4: Do not update implementation yet**

Leave the contract red until Task 2 supplies the shared variant and Task 3 supplies the 3안 layout.

### Task 2: Capture the pre-change UI evidence and issue record

**Files:**
- Create: `artifacts/responsive-screenshots/terminal-weather-panels/<timestamp>/before/*.png`
- Create: `artifacts/responsive-screenshots/terminal-weather-panels/<timestamp>/review/issues.md`

**Interfaces:**
- Consumes: current `/terminal/rkss?view=weather&autoplay=0` and `/terminal/rkpc?view=rail&autoplay=0` routes.
- Produces: an auditable baseline that distinguishes the approved hierarchy/spacing issues from implementation regressions.

- [ ] **Step 1: Capture the two affected baseline states**

Using the managed terminal procedure, capture 1920×1080 2안 and the registered 1319×960 RKPC 3안 viewport before editing production JSX/CSS.

- [ ] **Step 2: Record the observed issues**

Write `review/issues.md` with the baseline route/viewport and these explicitly approved issues: destination pager occupies the header; current-weather metrics are text-only/card-like; temperature/icon outweigh the desired illustration; 3안’s upper content is too tall; 3안 route summary consumes flight-table height; lower forecast insets are too tight.

- [ ] **Step 3: Preserve the evidence**

Do not overwrite baseline captures during post-change verification; post-change images go under a separate `after/` directory in Task 5.

### Task 3: Add a shared 2안·3안 current-weather presentation variant

**Files:**
- Modify: `frontend/src/features/terminal/terminalShared.jsx:364-400`
- Modify: `frontend/src/features/terminal/WeatherFirstScreen.jsx:1-10, 162-169, 193`
- Modify: `frontend/src/features/terminal/WeeklyWeatherScreen.jsx:1-14, 239-255, 273-280`

**Interfaces:**
- Consumes: `CurrentWeatherBlock({ flight, departureName, departureTemp, variant })`, `temperatureGap`, `shortAirportName`, and `flight.current` fields.
- Produces: `variant="terminal-weather"` markup shared by views 2 and 3, plus stable `data-testid="current-weather-metrics"` and `data-testid="frame-progress"` hooks.

- [ ] **Step 1: Implement the minimum shared variant**

Extend `CurrentWeatherBlock` so the new terminal-weather variant:

1. adds a condition-derived class such as `tw-current-weather--sun` from the existing icon type;
2. renders the gap immediately after `WeatherCondition` as `김포보다 2°C 높아요` / `낮아요` (not a signed value or pill);
3. renders destination display name, current destination airport name, local time, observation time, current condition, then the gap sentence in the same information order for both 2안 and 3안;
4. renders the existing feels/humidity/wind values in three metric cells, each with an `aria-hidden` outline icon and its existing Korean `dt` label;
5. retains `-` fallback values and the default/legacy markup path.

Use the already installed `react-icons` package and select stable outline icons for thermometer, droplet, and wind. Do not introduce a new weather data field.

- [ ] **Step 2: Route both screens through the variant**

Pass `variant="terminal-weather"` from `WeatherFirstScreen` and `WeeklyWeatherScreen`. Move the currently weekly-only airport display-name and local-time conditions into this common variant so 2안 and 3안 expose identical top-panel information. Keep `variant="weekly"` only if a compact compatibility distinction remains necessary; do not let it create a second visual treatment.

Remove `DestinationPager` from **both** `WeatherFirstScreen` and `WeeklyWeatherScreen` imports and header JSX, but leave each screen’s `tw-frame-progress` rendered with the same `frameSeconds` style and key. Add `data-testid="frame-progress"` to both indicators.

Remove 3안’s `.ww-flight-summary` JSX wrapper so `RollingFlightList` is the direct flight-panel child.

- [ ] **Step 3: Run the focused contract**

Run the Task 1 command again.

Expected: shared-header/metric assertions pass; geometry assertions can remain red until Task 3.

### Task 4: Apply approved panel hierarchy and 3안 forecast spacing

**Files:**
- Modify: `frontend/src/features/terminal/terminal.css:499-625, 704-856`

**Interfaces:**
- Consumes: variant/condition classes and test IDs from Task 3; existing terminal spacing and safe-area custom properties.
- Produces: a shared 2안·3안 current-weather treatment and a 3안 80/400/600 grid at Full HD.

- [ ] **Step 1: Style the shared current-weather variant without changing legacy blocks**

Scope rules below a new terminal-weather variant class. Use pseudo-elements for a clipped, low-opacity condition backdrop (sun/cloud/rain families) with content positioned above it. Reduce the foreground weather icon and temperature from the current 3안 dimensions; preserve strong current-temperature hierarchy. Place the gap in normal document flow below the condition text.

Turn the metric area into a flat three-column rail: no white rounded container, no outer border/background, thin internal separators, outline icon + label + value aligned in each column. Keep colours and text contrast within existing terminal tokens.

- [ ] **Step 2: Compact headers while preserving progress animation**

Change only 2안/3안 header grid rules needed after pager removal. Set 3안’s `grid-template-rows` to the approved Full HD baseline:

```css
.ww-screen {
  grid-template-rows: 80px minmax(400px, 400fr) minmax(600px, 600fr);
}
.ww-page {
  grid-template-rows: minmax(400px, 400fr) minmax(600px, 600fr);
}
```

Keep `.tw-frame-progress` absolute at the header bottom and its current keyframe animation unchanged.

- [ ] **Step 3: Make 3안 flight and forecast panels use their freed space**

Set `.ww-flight-panel` to one full-height grid row and delete route-summary rules. Increase horizontal/vertical inset of `.ww-panel-title`, `.ww-hourly-strip`, `.ww-weekly-header`, and `.ww-weekly-list` while preserving the common 58%/42% column line and the fixed forecast row counts.

- [ ] **Step 4: Run focused terminal contract tests**

Run:

```bash
npm --prefix frontend run dev:contract:fast -- contracts/terminal-signage.spec.mjs -g "(전환 진행선과 수치 날씨 레일|위아래 패널|항공편 패널|현재 목적지)"
```

Expected: PASS.

### Task 5: Verify the complete terminal-signage contract and visual evidence

**Files:**
- Modify only if required by a genuine contract failure: files from Tasks 1–3
- Create: `artifacts/responsive-screenshots/terminal-weather-panels/<timestamp>/README.md`
- Create: `artifacts/responsive-screenshots/terminal-weather-panels/<timestamp>/after/*.png`

**Interfaces:**
- Consumes: finished terminal views, managed contract server, and terminal-signage fixture.
- Produces: passing browser contract and captured desktop/RKPC evidence.

- [ ] **Step 1: Run the full managed contract**

Run:

```bash
npm run dev:contract -- --grep terminal-signage
```

Expected: PASS at every registered terminal-signage viewport.

- [ ] **Step 2: Capture the two approved visual states**

Use the managed server procedure to capture 1920×1080 `/terminal/rkss?view=weather&autoplay=0` and `/terminal/rkpc?view=rail&autoplay=0` at 1319×960. Store screenshots and a README naming the route, viewport, timestamp, commit, and command.

- [ ] **Step 3: Inspect and report evidence**

Confirm visually that the progress line animates, the background illustration stays subordinate, icon/labels remain legible, 3안’s lower panel is visibly larger, and no route heading or destination pager remains in 3안.

- [ ] **Step 4: Update graph data**

Run:

```bash
graphify update .
```

Expected: graph update completes without changing product behaviour.

## Plan Self-Review

| Spec requirement | Plan task |
| --- | --- |
| Existing-data-only scope | Tasks 2–3 global constraints |
| 2안·3안 common header/current-weather treatment | Tasks 1, 3–4 |
| Required automatic transition progress line | Tasks 1, 3–4 |
| Text-form temperature-gap statement | Tasks 1, 3 |
| Icon-led three-metric rail | Tasks 1, 3–4 |
| Condition-aware subordinate backdrop | Task 4 |
| 3안 40/60 layout and no route summary | Tasks 1, 3–4 |
| Lower-panel inset | Task 4 |
| Pre-change and post-change browser evidence | Tasks 2, 5 |
| Graph update | Task 5 |

No placeholder markers or unmatched interfaces remain. The plan makes no unapproved data, route, or interaction changes.
