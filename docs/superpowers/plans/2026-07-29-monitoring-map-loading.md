# Monitoring Map Loading Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the monitoring dashboard as soon as its data is ready while a map-local spinner remains until Mapbox finishes its initial style load.

**Architecture:** Keep the standalone monitoring route, MapView lifecycle, and monitoring data loader. Add one optional readiness callback at MapView's existing `style.load` boundary; MonitoringMap owns the UI state and accessible overlay. The global monitoring data overlay remains unchanged, so it stops blocking the dashboard as soon as existing initial data succeeds.

**Tech Stack:** React 19, Mapbox GL JS v3, CSS, Node `node:test`, Playwright.

## Global Constraints

- Do not reuse or move the main-page Mapbox instance.
- Do not add dependencies or change data APIs, polling, basemap selection, or layer defaults.
- Use the existing `style.load` event as readiness; do not wait for every map tile, font, or overlay image.
- The spinner is map-panel-only, has `role="status"` with `지도 불러오는 중…`, and cannot intercept input.
- Remove the loading status from both the visual and accessibility trees when the existing `.map-view-error` is present; keep that error and monitoring controls above the overlay.
- Preserve UTF-8 Korean and run `graphify update .` after code changes.

---

## File structure

- `frontend/src/features/map/MapView.jsx` — optional initial-style readiness notification.
- `frontend/src/features/map/lib/createOneShotNotifier.js` — testable one-shot callback guard for the initial style lifecycle.
- `frontend/src/features/map/lib/createOneShotNotifier.test.js` — runnable callback-count regression coverage.
- `frontend/src/features/map/MapView.test.js` — MapView lifecycle regression coverage.
- `frontend/src/features/monitoring/MonitoringMap.jsx` — monitoring-only readiness state and local loading status.
- `frontend/src/features/monitoring/MonitoringMap.test.js` — local accessible-overlay regression coverage.
- `frontend/src/features/monitoring/MonitoringPage.css` — scoped map loading presentation.
- `frontend/verification/monitoring-fixture.mjs` — deterministic pending and ready Mapbox-style fixture helpers.
- `frontend/verification/contracts/monitoring.spec.mjs` — pending, ready-transition, and error-state browser assertions.

### Task 1: Notify the monitoring wrapper when the initial Mapbox style is ready

**Files:**

- Modify: `frontend/src/features/map/MapView.jsx:305-400,1138-1190`
- Modify: `frontend/src/features/map/MapView.test.js`
- Create: `frontend/src/features/map/lib/createOneShotNotifier.js`
- Create: `frontend/src/features/map/lib/createOneShotNotifier.test.js`

**Interfaces:**

- Consumes: optional `onStyleReady?: () => void` prop.
- Produces: exactly one `onStyleReady?.()` notification per MapView instance from the existing `style.load` handler, after static resources and `isStyleReady` are established; later basemap style loads do not notify again.

- [ ] **Step 1: Write the failing test**

Create `createOneShotNotifier.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createOneShotNotifier } from './createOneShotNotifier.js'

test('notifies an optional callback only once', () => {
  let calls = 0
  const notify = createOneShotNotifier(() => { calls += 1 })
  notify()
  notify()
  assert.equal(calls, 1)
})

test('accepts an omitted callback', () => {
  const notify = createOneShotNotifier()
  assert.doesNotThrow(() => { notify(); notify() })
})
```

Add this lifecycle-connection test to the existing `MapView.test.js`:

```js
test('MapView connects the one-shot notifier to initial style readiness', () => {
  const source = readFileSync(join(__dirname, 'MapView.jsx'), 'utf8')
  assert.match(source, /import \{ createOneShotNotifier \} from '.\/lib\/createOneShotNotifier\.js'/)
  assert.match(source, /const notifyInitialStyleReady = useMemo\(\(\) => createOneShotNotifier\(onStyleReady\), \[onStyleReady\]\)/)
  assert.match(source, /setIsStyleReady\(true\)\s*\n\s*notifyInitialStyleReady\(\)/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix frontend test -- createOneShotNotifier.test.js MapView.test.js`

Expected: FAIL because the notifier module and MapView lifecycle connection do not exist.

- [ ] **Step 3: Implement the minimal callback**

Create the tiny pure helper:

```js
export function createOneShotNotifier(callback) {
  let notified = false
  return () => {
    if (notified) return
    notified = true
    callback?.()
  }
}
```

In `MapView`, create one notifier with `useMemo(() => createOneShotNotifier(onStyleReady), [onStyleReady])`, add `onStyleReady` to the props, and invoke that notifier immediately after the existing `setIsStyleReady(true)` in the existing `map.on('style.load', ...)` handler. Do not add another Mapbox event, timer, or global event.

- [ ] **Step 4: Run the focused test**

Run: `npm --prefix frontend test -- createOneShotNotifier.test.js MapView.test.js`

Expected: PASS, including repeated-notification, omitted-callback, and MapView lifecycle-connection coverage plus existing MapView tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/map/MapView.jsx frontend/src/features/map/MapView.test.js frontend/src/features/map/lib/createOneShotNotifier.js frontend/src/features/map/lib/createOneShotNotifier.test.js
git commit -m "feat(map): expose initial style readiness"
```

### Task 2: Add the monitoring-only map loading status

**Files:**

- Modify: `frontend/src/features/monitoring/MonitoringMap.jsx:10-102`
- Modify: `frontend/src/features/monitoring/MonitoringPage.css:6-56`
- Create: `frontend/src/features/monitoring/MonitoringMap.test.js`

**Interfaces:**

- Consumes: `MapView.onStyleReady={() => setMapStyleReady(true)}` from Task 1.
- Produces: `.monitoring-map-loading` status markup only until initial style readiness.

- [ ] **Step 1: Write the failing test**

Create `MonitoringMap.test.js`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('./MonitoringMap.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./MonitoringPage.css', import.meta.url), 'utf8')

test('monitoring map keeps an accessible local loading status until Mapbox style readiness', () => {
  assert.match(source, /const \[mapStyleReady, setMapStyleReady\] = useState\(false\)/)
  assert.match(source, /onStyleReady=\{\(\) => setMapStyleReady\(true\)\}/)
  assert.match(source, /!mapStyleReady && \([\s\S]*?className="monitoring-map-loading"[\s\S]*?role="status"[\s\S]*?지도 불러오는 중…/)
  assert.match(css, /\.monitoring-map-loading\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?z-index:\s*5;/)
  assert.match(css, /\.monitoring-mapbox-panel:has\(\.map-view-error\) \.monitoring-map-loading\s*\{[\s\S]*?display:\s*none;/)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix frontend test -- MonitoringMap.test.js`

Expected: FAIL because the readiness state, status markup, and CSS selector do not exist.

- [ ] **Step 3: Implement the smallest local overlay**

In `MonitoringMap.jsx`, initialize `const [mapStyleReady, setMapStyleReady] = useState(false)` and pass `onStyleReady={() => setMapStyleReady(true)}` to the existing MapView.

Immediately after MapView, render only while not ready:

```jsx
{!mapStyleReady && (
  <div className="monitoring-map-loading" role="status" aria-live="polite">
    <span className="monitoring-map-loading__spinner" aria-hidden="true" />
    <span>지도 불러오는 중…</span>
  </div>
)}
```

In `MonitoringPage.css`, make it an absolute inset flex overlay with `z-index: 5`, `pointer-events: none`, existing panel colors, and a small CSS-only rotating border spinner. Add `.monitoring-mapbox-panel:has(.map-view-error) .monitoring-map-loading { display: none; }` so the status is removed from the accessibility tree whenever the existing MapView error is rendered. Retain map controls at z-index 8 and MapView errors at z-index 6.

- [ ] **Step 4: Run focused tests**

Run: `npm --prefix frontend test -- MapView.test.js MonitoringMap.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/monitoring/MonitoringMap.jsx frontend/src/features/monitoring/MonitoringMap.test.js
git add -p frontend/src/features/monitoring/MonitoringPage.css
git commit -m "feat(monitoring): show map loading status"
```

### Task 3: Verify deterministic pending, ready, and error states in the browser

**Files:**

- Modify: `frontend/verification/monitoring-fixture.mjs:347-352`
- Modify: `frontend/verification/contracts/monitoring.spec.mjs`

**Interfaces:**

- Consumes: `.monitoring-map-loading[role="status"]` from Task 2 and a fixture helper that delays then fulfills a minimal valid Mapbox style JSON.
- Produces: contract coverage for dashboard-before-map and deterministic pending-to-ready removal; Task 2's source test covers error-status suppression.

- [ ] **Step 1: Write the failing contract case**

First, add `installDelayedMapboxStyleFixture(page)` to `monitoring-fixture.mjs`. It removes the fixture's broad Mapbox-abort route, delays the `/styles/v1/mapbox/standard` response behind a resolver returned to the test, fulfills it with `{ version: 8, sources: {}, layers: [] }`, then aborts every other Mapbox request. This leaves initial style loading under the test's control without live Mapbox traffic.

Then add after the operations-mode entry test:

```js
test('operations dashboard renders while its Mapbox style is still loading, then removes its status when ready', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')
  const releaseStyle = await installDelayedMapboxStyleFixture(page)
  const navigation = page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
  const mapLoadingStatus = page.getByRole('status').filter({ hasText: '지도 불러오는 중…' })
  await expect(page.getByText('METAR', { exact: true })).toBeVisible()
  await expect(mapLoadingStatus).toBeVisible()
  releaseStyle()
  await navigation
  await expect(mapLoadingStatus).toHaveCount(0)
})
```

Add this separately gated missing-token case to the same contract:

```js
test('missing Mapbox token exposes the existing error without a loading status', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'mobile monitoring is redirected away')
  test.skip(process.env.PROJECTAMO_EXPECT_MISSING_MAPBOX_TOKEN !== '1', 'requires the no-token managed server')
  await page.goto('/monitoring?mode=ops', { waitUntil: 'load' })
  await expect(page.getByRole('alert')).toContainText('VITE_MAPBOX_TOKEN is required.')
  await expect(page.getByRole('status').filter({ hasText: '지도 불러오는 중…' })).toHaveCount(0)
})
```

Keep contract locators role/text based; do not use CSS selector locators. Task 2's CSS regression assertion and this browser case together cover removal of the status when MapView's existing error appears.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm --prefix frontend run dev:contract:fast -- contracts/monitoring.spec.mjs -g "operations dashboard renders while its Mapbox style is still loading, then removes its status when ready"`

Expected: FAIL because the local status and controlled ready transition do not exist.

- [ ] **Step 3: Run it after Tasks 1–2**

Run: `npm --prefix frontend run dev:contract:fast -- contracts/monitoring.spec.mjs -g "operations dashboard renders while its Mapbox style is still loading, then removes its status when ready"`

Expected: PASS on desktop; it observes both the status and its removal without the external Mapbox service.

- [ ] **Step 3a: Run the managed missing-token error contract**

Run: `VITE_MAPBOX_TOKEN= PROJECTAMO_EXPECT_MISSING_MAPBOX_TOKEN=1 npm run dev:contract -- --grep "missing Mapbox token exposes the existing error without a loading status"`

Expected: PASS. The empty exported token takes precedence over any value loaded from Vite environment files, so MapView renders its existing error path; the named loading status is absent.

- [ ] **Step 4: Check actual Mapbox readiness in the browser**

Start the documented managed local server with a valid `VITE_MAPBOX_TOKEN`, open `/monitoring` at desktop width, and verify:

1. The map-local status is visible while the style is pending.
2. Dashboard METAR/TAF content is usable during that interval.
3. The status disappears after the initial Mapbox `style.load`.
4. Map controls remain clickable after the status disappears.
5. Switching the basemap does not recreate the status or re-notify the monitoring wrapper.
6. With `VITE_MAPBOX_TOKEN` intentionally unset before starting the dev server, the existing map error is visible and the loading status is absent from the accessibility tree.

Do not wait for `networkidle`; tiles may continue loading after style readiness.

- [ ] **Step 5: Run the full managed monitoring contract**

Run: `npm run dev:contract -- --grep monitoring`

Expected: PASS for desktop and iPad projects; the mobile redirect remains unchanged.

- [ ] **Step 6: Update graph and commit verification coverage**

```bash
graphify update .
git add frontend/verification/monitoring-fixture.mjs frontend/verification/contracts/monitoring.spec.mjs
git add -p graphify-out
git commit -m "test(monitoring): cover map loading state"
```

## Plan self-review

- Spec coverage: Task 1 defines readiness; Task 2 provides local accessible and non-blocking UI while preserving error/control stacking; Task 3 verifies pre-ready dashboard rendering, live readiness, and the registered contract.
- Completeness scan: every task names its files, exact interface, implementation, test command, and expected result.
- Interface consistency: Task 1 defines `onStyleReady`; Task 2 consumes it and emits `.monitoring-map-loading`; Task 3 asserts that exact selector.
