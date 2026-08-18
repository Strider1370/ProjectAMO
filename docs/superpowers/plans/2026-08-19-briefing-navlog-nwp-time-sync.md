# Briefing NAVLOG NWP Time Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the briefing-page NAVLOG's NWP-derived values synchronized with every waypoint-based NWP time change made in the vertical profile.

**Architecture:** Extract the existing route-weather-leg assembly from the full briefing composer into a reusable backend loader. A narrow API returns only regenerated NAVLOG legs/procedure summaries and the safe NWP time-rule metadata. On a waypoint-time change, the frontend requests that API and the cross-section API concurrently, then commits the new selection, chart data, and NAVLOG data together only when both responses succeed.

**Tech Stack:** Node 22 ESM, Express, React 19, Fluent UI, node:test, Playwright.

## Global Constraints

- Scope is the briefing page only; do not add NAVLOG to the altitude-comparison page or create a new window.
- Reuse the existing waypoint selection contract: `{ baseTime, waypointOverrides: [{ waypointId, offsetHours }] }`.
- Update only NWP-derived NAVLOG fields: wind component/vector, temperature, ISA deviation, icing, and KTG turbulence.
- Keep SIGMET/AIRMET, NOTAM, airport METAR/TAF, route geometry, and ETD/ETA semantics unchanged; the server may recompute their existing leg attachments only to preserve the current response shape.
- Never expose API keys, request URLs, raw grids, or source credentials in an API response or saved payload.
- Treat instants as UTC internally and preserve the existing KST/UTC formatter at the presentation boundary.
- Do not commit a partial result: when either the cross-section or NAVLOG refresh fails, retain the prior chart, prior NAVLOG, and prior saved selection, then show one retryable error state.
- Preserve `test-results/` and unrelated working-tree changes. Run `graphify update .` after code changes.

---

### Task 1: Extract a reusable NAVLOG-weather assembler from briefing composition

**Files:**
- Create: `backend/src/briefing/route-weather-loader.js`
- Create: `backend/test/route-weather-loader.test.js`
- Modify: `backend/src/briefing/briefing-composer.js`
- Modify: `backend/test/route-weather-legs.test.js` only if existing fixtures need the new exported request shape

**Interfaces:**
- Consumes:

```js
buildRouteWeatherPayload({
  request,          // routeGeometry, routeModel, routeMarkers, procedureContext,
                     // plannedCruiseAltitudeFt, etd, eta, nwpTimeSelection
  data,             // cached SIGMET/AIRMET/NOTAM/warning/typhoon/AIP data + dataRoot
  crossSectionResult, // optional result from loadRouteCrossSection
})
```

- Produces:

```js
{
  legs: Array,
  procedures: Array,
  totalDistanceNm: number | null,
  altitudeConstraintStatus: string,
  timeRules: object | null,
}
```

- `composeBriefing` continues to own airport summaries, destination, banner, provenance, and response envelope; it receives route-weather output through the new loader rather than maintaining another copy of the assembly logic.

- [ ] **Step 1: Write failing loader tests**

```js
test('buildRouteWeatherPayload uses the supplied mixed-time cross section for NAVLOG wind and temperature', () => {
  const out = buildRouteWeatherPayload({
    request: REQUEST_WITH_WP2_PLUS_1_HOUR,
    data: BRIEFING_DATA,
    crossSectionResult: MIXED_TIME_RESULT,
  })

  assert.equal(out.legs[0].wind.speedKt, 12)
  assert.equal(out.legs[1].wind.speedKt, 31)
  assert.equal(out.legs[1].temp.meanC, -18)
  assert.deepEqual(out.timeRules, MIXED_TIME_RESULT.timeRules)
})

test('composeBriefing keeps its NAVLOG output when the reusable loader is used', () => {
  const briefing = composeBriefing(REQUEST_WITHOUT_OVERRIDES, BRIEFING_DATA)
  assert.deepEqual(briefing.enroute.legs, EXPECTED_LEGACY_LEGS)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix backend test -- test/route-weather-loader.test.js`

Expected: FAIL because `route-weather-loader.js` and `buildRouteWeatherPayload` do not exist.

- [ ] **Step 3: Implement the smallest extraction**

Move only the common en-route preparation from `composeBriefing`: route axis, planned profile fallback, hazard section, route NOTAM matching, active AIP constraints, `loadRouteCrossSection`, and `buildRouteWeatherLegs`. Keep request validation and all airport/destination composition in their existing modules. Accept `crossSectionResult` so a caller that already loaded it does not read the KIM/KTG store twice. Return the exact `buildRouteWeatherLegs` fields plus `timeRules`; do not add display strings or raw meteorological fields.

- [ ] **Step 4: Run focused regression tests**

Run: `npm --prefix backend test -- test/route-weather-loader.test.js test/route-weather-legs.test.js test/briefing-composer.test.js`

Expected: PASS; no-override briefing legs retain their previous values, while a mixed-time fixture changes only the affected post-waypoint legs.

- [ ] **Step 5: Commit the extraction**

```bash
git add backend/src/briefing/route-weather-loader.js backend/src/briefing/briefing-composer.js backend/test/route-weather-loader.test.js backend/test/route-weather-legs.test.js backend/test/briefing-composer.test.js
git commit -m "refactor(briefing): share NAVLOG weather assembly"
```

### Task 2: Add a narrow NAVLOG weather-refresh API contract

**Files:**
- Modify: `backend/server.js`
- Create: `backend/test/navlog-weather-route.test.js`
- Modify: `frontend/src/api/briefingApi.js`
- Create: `frontend/src/api/briefingApi.test.js` if no route-helper contract test exists

**Interfaces:**
- New route: `POST /api/briefing/navlog-weather`.
- Request is the subset already available to the briefing page:

```js
{
  routeGeometry, routeModel, routeMarkers, procedureContext,
  plannedCruiseAltitudeFt, etd, eta,
  nwpTimeSelection,
}
```

- Success response:

```js
{
  legs, procedures, totalDistanceNm, altitudeConstraintStatus,
  timeRules,
}
```

- The frontend helper is `fetchNavlogWeather(payload)`. It uses the same `postJson` implementation and error behavior as `fetchCrossSection`.

- [ ] **Step 1: Write failing API tests**

```js
test('NAVLOG refresh accepts an override and returns only safe leg fields plus time rules', async () => {
  const response = await postNavlogWeather({
    ...VALID_ROUTE_REQUEST,
    nwpTimeSelection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [{ waypointId: 'marker:FIX:WP2:127.000000:37.000000:0', offsetHours: 1 }],
    },
  })

  assert.equal(response.legs[1].selectedAltitudeFt, 28000)
  assert.equal(response.timeRules.segments[1].offsetHours, 1)
  assert.equal(JSON.stringify(response).includes('authKey'), false)
  assert.equal(JSON.stringify(response).includes('apiHub'), false)
})

test('NAVLOG refresh rejects a route without coordinates', async () => {
  const response = await postNavlogWeather({ routeModel: {} })
  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'routeGeometry required')
})
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `npm --prefix backend test -- test/navlog-weather-route.test.js`

Expected: FAIL with a missing route or a 404 response.

- [ ] **Step 3: Implement the route and client helper**

Validate `routeGeometry.coordinates` exactly as `/api/briefing/cross-section` does. Add `referenceTime` only with the same effective-now fallback used by that route. Call `buildRouteWeatherPayload` with cache snapshots from the same stores passed to `/api/route-briefing`; return only its payload. Set `Cache-Control: no-store`. Add `fetchNavlogWeather` beside `fetchCrossSection`; do not add a new generic client abstraction.

- [ ] **Step 4: Run focused API and contract tests**

Run: `npm --prefix backend test -- test/navlog-weather-route.test.js test/api-cache-policy.test.js && npm --prefix frontend test -- src/api/briefingApi.test.js`

Expected: PASS; the new route is no-store, has the intended 400 contract, returns no credentials/URLs, and carries the exact time-rule metadata used by the chart.

- [ ] **Step 5: Commit the API boundary**

```bash
git add backend/server.js backend/test/navlog-weather-route.test.js frontend/src/api/briefingApi.js frontend/src/api/briefingApi.test.js
git commit -m "feat(briefing): refresh NAVLOG weather by NWP time"
```

### Task 3: Synchronize briefing-page state as one atomic refresh

**Files:**
- Create: `frontend/src/features/route-briefing/lib/nwpTimeRefresh.js`
- Create: `frontend/src/features/route-briefing/lib/nwpTimeRefresh.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.css`

**Interfaces:**
- `refreshNwpTimeViews({ selection, crossSectionRequest, navlogRequest, fetchCrossSection, fetchNavlogWeather })` returns either:

```js
{ ok: true, selection, crossSection, navlog }
// or
{ ok: false, error }
```

- `useRouteBriefing.handleSetWaypointNwpOffset` creates the next immutable selection, invokes that helper, and on success commits `nwpTimeSelection`, `crossSection`, and `briefing.enroute.{legs, procedures, totalDistanceNm, altitudeConstraintStatus}` in one React state turn.
- `BriefingView` receives `nwpTimeRefreshing` and `nwpTimeRefreshError`; its NAVLOG heading exposes `role="status"` while refreshing and a visible retry action on failure.

- [ ] **Step 1: Write failing orchestration tests**

```js
test('commits matching cross-section and NAVLOG results only after both requests succeed', async () => {
  const result = await refreshNwpTimeViews({
    selection: PLUS_ONE_HOUR,
    crossSectionRequest: CROSS_SECTION_REQUEST,
    navlogRequest: NAVLOG_REQUEST,
    fetchCrossSection: async () => NEW_CROSS_SECTION,
    fetchNavlogWeather: async () => NEW_NAVLOG,
  })

  assert.deepEqual(result, { ok: true, selection: PLUS_ONE_HOUR, crossSection: NEW_CROSS_SECTION, navlog: NEW_NAVLOG })
})

test('does not yield a partial state when NAVLOG refresh fails', async () => {
  const result = await refreshNwpTimeViews({
    selection: PLUS_ONE_HOUR,
    crossSectionRequest: CROSS_SECTION_REQUEST,
    navlogRequest: NAVLOG_REQUEST,
    fetchCrossSection: async () => NEW_CROSS_SECTION,
    fetchNavlogWeather: async () => { throw new Error('NAVLOG refresh failed') },
  })

  assert.deepEqual(result, { ok: false, error: 'NAVLOG refresh failed' })
})
```

- [ ] **Step 2: Run the orchestration tests to verify they fail**

Run: `npm --prefix frontend test -- src/features/route-briefing/lib/nwpTimeRefresh.test.js`

Expected: FAIL because the refresh coordinator does not exist.

- [ ] **Step 3: Implement the coordinator and hook integration**

Use `Promise.all` inside the coordinator. Build both requests from the same next selection and the same stable markers. In `handleSetWaypointNwpOffset`, leave the currently rendered rail/chart/NAVLOG intact while `nwpTimeRefreshing` is true. On success, replace both data models and then persist the next selection state; on failure, retain the former values and expose the returned error. Reuse the existing `onSetWaypointNwpOffset` callback chain so the profile's time-rail UI does not acquire a second state owner. Add a compact NAVLOG status line: `NWP 시간 반영 중…`; after failure show `NWP 시간 반영 실패` and a `다시 시도` button that repeats the same pending selection.

Also include `nwpTimeSelection` in the initial `fetchRouteBriefing` request so a newly generated briefing NAVLOG starts from the same rule that its inline cross section uses.

- [ ] **Step 4: Run focused frontend tests**

Run: `npm --prefix frontend test -- src/features/route-briefing/lib/nwpTimeRefresh.test.js src/features/route-briefing/lib/verticalProfileRequest.test.js src/features/route-briefing/lib/savedRouteBriefing.test.js`

Expected: PASS; success changes chart and NAVLOG together, one rejected request preserves the prior UI model, and saved selections remain intent-only.

- [ ] **Step 5: Commit the synchronized frontend state**

```bash
git add frontend/src/features/route-briefing/lib/nwpTimeRefresh.js frontend/src/features/route-briefing/lib/nwpTimeRefresh.test.js frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css
git commit -m "feat(briefing): synchronize NAVLOG with NWP time rules"
```

### Task 4: Verify the briefing-page behavior and guard the public contract

**Files:**
- Create: `frontend/e2e/briefing-navlog-nwp-time.spec.js` (or the repository's existing route-briefing Playwright suite if one already covers this workflow)
- Modify: `docs/policies/verification/contracts.md` only if the route-briefing contract registry requires a new named scenario

**Interfaces:**
- Browser scenario starts from a route with at least two named markers and KIM hours `0` and `1` available.
- It identifies the NAVLOG by accessible heading, changes the first eligible timeline segment to `+1h`, and observes a changed NWP-derived NAVLOG cell after the synchronized loading state clears.

- [ ] **Step 1: Write the failing browser contract**

```js
test('briefing NWP time rule updates the vertical profile and NAVLOG together', async ({ page }) => {
  await openReadyBriefing(page, { route: 'RKSS WP2 RKPC', altitudeFt: 28000 })
  const priorWind = await page.getByRole('region', { name: 'NAVLOG' }).getByLabel('풍향/풍속').first().textContent()

  await page.getByRole('button', { name: '+1h' }).click()
  await expect(page.getByText('NWP 시간 반영 중…')).toBeVisible()
  await expect(page.getByText('NWP 시간 반영 중…')).toBeHidden()
  await expect(page.getByRole('region', { name: 'NAVLOG' }).getByLabel('풍향/풍속').first()).not.toHaveText(priorWind)
})
```

- [ ] **Step 2: Run the browser contract to verify it fails**

Run: `npm run dev:contract -- --grep "briefing NWP time rule updates"`

Expected: FAIL because NAVLOG remains at the briefing's original NWP values.

- [ ] **Step 3: Add only necessary accessibility hooks and responsive styling**

If the existing NAVLOG table cells lack stable accessible names, add `aria-label` values based on their already displayed column/leg content; do not use CSS or positional selectors in the test. Keep the refresh status within the NAVLOG section and preserve the current desktop/iPad/mobile table behavior.

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm --prefix frontend run build
npm run dev:contract -- --grep "briefing NWP time rule updates"
graphify update .
```

Expected: all backend/frontend tests and production build pass; the browser contract shows the synchronized loading state and changed NAVLOG NWP value without exposing keys or source URLs.

- [ ] **Step 5: Commit verification assets**

```bash
git add frontend/e2e/briefing-navlog-nwp-time.spec.js docs/policies/verification/contracts.md
git commit -m "test(briefing): cover NAVLOG NWP time synchronization"
```

## Plan self-review

- **Coverage:** Tasks 1–2 establish one reusable, safe server source for the NAVLOG refresh; Task 3 guarantees atomic chart/NAVLOG state and preserves saved selection semantics; Task 4 validates the user-visible contract.
- **Scope:** The plan deliberately excludes altitude-comparison NAVLOG, a new detail window, ETD/ETA recalculation, and changes to advisory/NOTAM data rules.
- **Consistency:** `nwpTimeSelection`, `timeRules`, `fetchNavlogWeather`, and `buildRouteWeatherPayload` have a single declared shape and producer/consumer in the task that introduces each one.
- **No placeholders:** Commands, routes, function signatures, error behavior, and test assertions are specified for every task.
