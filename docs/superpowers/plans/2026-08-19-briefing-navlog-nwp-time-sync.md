# Briefing NAVLOG NWP Time Synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the briefing-page NAVLOG's NWP-derived values synchronized with every waypoint-based NWP time change made in the vertical profile.

**Architecture:** Extract a richer internal en-route weather context from the full briefing composer so composition keeps its existing hazards, NOTAMs, AIP constraints, model, and provenance inputs. One NWP time-refresh API loads KIM/KTG cross-section data exactly once, derives a NWP-only NAVLOG patch from that same in-memory result, and returns the safe chart, patch, and time-rule payload together. The frontend applies the response atomically behind one monotonic request guard.

**Tech Stack:** Node 22 ESM, Express, React 19, Fluent UI, node:test, Playwright.

## Global Constraints

- Scope is the briefing page only; do not add NAVLOG to the altitude-comparison page or create a new window.
- Reuse the existing waypoint selection contract: `{ baseTime, waypointOverrides: [{ waypointId, offsetHours }] }`.
- Update only NWP-derived NAVLOG fields: wind component/vector, temperature, ISA deviation, icing, and KTG turbulence.
- Keep SIGMET/AIRMET, NOTAM, airport METAR/TAF, route geometry, AIP constraints, and ETD/ETA semantics unchanged. The response must be a NWP-only patch, never a replacement NAVLOG.
- Never expose API keys, request URLs, raw grids, or source credentials in an API response or saved payload.
- Treat instants as UTC internally and preserve the existing KST/UTC formatter at the presentation boundary.
- Do not commit a partial result: when the single refresh request fails, retain the prior chart, prior NAVLOG, and prior saved selection, then show one retryable error state.
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
  routeWeatherLegs, adverse, routeNotams, routeConflicts,
  aipConstraints, enrouteModel, crossSectionResult,
  timeRules: object | null,
}
```

- `composeBriefing` continues to own airport summaries, destination, banner, provenance, and response envelope; it receives the complete en-route context through the new loader rather than losing inputs it still needs.

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
  assert.deepEqual(briefing.enroute.aipConstraints, EXPECTED_AIP_CONSTRAINTS)
  assert.deepEqual(briefing.routeConflicts, EXPECTED_ROUTE_CONFLICTS)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm --prefix backend test -- test/route-weather-loader.test.js`

Expected: FAIL because `route-weather-loader.js` and `buildRouteWeatherPayload` do not exist.

- [ ] **Step 3: Implement the smallest extraction**

Move only the common en-route preparation from `composeBriefing`: route axis, planned profile fallback, hazard section, route NOTAM matching, active AIP constraints, `loadRouteCrossSection`, `summarizeEnrouteModel`, and `buildRouteWeatherLegs`. Keep request validation and all airport/destination composition in their existing modules. Accept `crossSectionResult` so a caller that already loaded it does not read the KIM/KTG store twice. Return every extracted dependency the composer currently consumes; expose no public response from this internal helper.

- [ ] **Step 4: Run focused regression tests**

Run: `npm --prefix backend test -- test/route-weather-loader.test.js test/route-weather-legs.test.js test/briefing-composer.test.js`

Expected: PASS; no-override briefing retains its complete response envelope, while a mixed-time fixture changes only the affected post-waypoint NWP facts.

- [ ] **Step 5: Commit the extraction**

```bash
git add backend/src/briefing/route-weather-loader.js backend/src/briefing/briefing-composer.js backend/test/route-weather-loader.test.js backend/test/route-weather-legs.test.js backend/test/briefing-composer.test.js
git commit -m "refactor(briefing): share NAVLOG weather assembly"
```

### Task 2: Add one cross-section and NAVLOG time-refresh API contract

**Files:**
- Modify: `backend/server.js`
- Create: `backend/test/nwp-time-refresh-route.test.js`
- Modify: `frontend/src/api/briefingApi.js`
- Create: `frontend/src/api/briefingApi.test.js` if no route-helper contract test exists

**Interfaces:**
- New route: `POST /api/briefing/nwp-time-refresh`.
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
  crossSection: { ...existingCrossSectionResponse, turbulence, availableTimes },
  navlogNwpPatch: {
    legs: [{ key, wind, temp, icing, turbulence }],
    procedures: [{ type, id, legs: [{ key, wind, temp, icing, turbulence }] }],
  },
  timeRules,
}
```

- The frontend helper is `fetchNwpTimeRefresh(payload)`. It uses the same `postJson` implementation and error behavior as `fetchCrossSection`.

- [ ] **Step 1: Write failing API tests**

```js
test('NWP time refresh calculates the chart and NAVLOG from one safe mixed-time result', async () => {
  const response = await postNwpTimeRefresh({
    ...VALID_ROUTE_REQUEST,
    nwpTimeSelection: {
      baseTime: '2026-08-19T10:00:00.000Z',
      waypointOverrides: [{ waypointId: 'marker:FIX:WP2:127.000000:37.000000:0', offsetHours: 1 }],
    },
  })

  assert.equal(response.crossSection.levels[0].values[AFTER_WP2].sourceHf, 1)
  assert.equal(response.navlogNwpPatch.legs[1].wind.speedKt, 31)
  assert.equal(response.timeRules.segments[1].offsetHours, 1)
  assert.equal(JSON.stringify(response).includes('authKey'), false)
  assert.equal(JSON.stringify(response).includes('apiHub'), false)
})

test('NWP time refresh rejects a route without coordinates', async () => {
  const response = await postNwpTimeRefresh({ routeModel: {} })
  assert.equal(response.status, 400)
  assert.equal(response.body.error, 'routeGeometry required')
})
```

- [ ] **Step 2: Run the API tests to verify they fail**

Run: `npm --prefix backend test -- test/nwp-time-refresh-route.test.js`

Expected: FAIL with a missing route or a 404 response.

- [ ] **Step 3: Implement the route and client helper**

Validate `routeGeometry.coordinates` exactly as `/api/briefing/cross-section` does. Add `referenceTime` only with the same effective-now fallback used by that route. Call `loadRouteCrossSection` once, pass that exact result as `crossSectionResult` to `buildRouteWeatherPayload`, and project only `{ key, wind, temp, icing, turbulence }` from each route/procedure leg into `navlogNwpPatch`. Set `Cache-Control: no-store`. Add `fetchNwpTimeRefresh` beside `fetchCrossSection`; do not add a new generic client abstraction or make a second KIM/KTG grid read.

- [ ] **Step 4: Run focused API and contract tests**

Run: `npm --prefix backend test -- test/nwp-time-refresh-route.test.js test/api-cache-policy.test.js && npm --prefix frontend test -- src/api/briefingApi.test.js`

Expected: PASS; the new route is no-store, has the intended 400 contract, reads the cross-section once per request, returns no credentials/URLs, and carries one identical `timeRules` value for both chart and NAVLOG.

Also add the following cases: no usable KIM run returns the current `503 kim run unavailable` contract; an unavailable selected KIM segment returns 200 with the exact segment unavailable (no nearest-KIM substitution); missing KTG returns an unavailable turbulence patch while KIM chart/NAVLOG fields remain usable.

- [ ] **Step 5: Commit the API boundary**

```bash
git add backend/server.js backend/test/nwp-time-refresh-route.test.js frontend/src/api/briefingApi.js frontend/src/api/briefingApi.test.js
git commit -m "feat(briefing): refresh NAVLOG and chart by NWP time"
```

### Task 3: Synchronize briefing-page state as one atomic refresh

**Files:**
- Create: `frontend/src/features/route-briefing/lib/nwpTimeRefresh.js`
- Create: `frontend/src/features/route-briefing/lib/nwpTimeRefresh.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.css`

**Interfaces:**
- `refreshNwpTimeViews({ selection, payload, fetchNwpTimeRefresh })` returns either:

```js
{ ok: true, selection, crossSection, navlogNwpPatch, timeRules }
// or
{ ok: false, error }
```

- `useRouteBriefing.handleSetWaypointNwpOffset` and `handleSelectForecastHour` both create the next immutable selection, invoke that helper, and on success commit `nwpTimeSelection`, `crossSection`, and an NWP-only merge into `briefing.enroute.legs/procedures` in one React state turn.
- `BriefingView` receives `nwpTimeRefreshing` and `nwpTimeRefreshError`; its NAVLOG heading exposes `role="status"` while refreshing and a visible retry action on failure.

- [ ] **Step 1: Write failing orchestration tests**

```js
test('commits matching cross-section and NAVLOG results from one refresh response', async () => {
  const result = await refreshNwpTimeViews({
    selection: PLUS_ONE_HOUR,
    payload: NWP_TIME_REFRESH_REQUEST,
    fetchNwpTimeRefresh: async () => ({ crossSection: NEW_CROSS_SECTION, navlogNwpPatch: NEW_NAVLOG_PATCH, timeRules: NEW_TIME_RULES }),
  })

  assert.deepEqual(result, { ok: true, selection: PLUS_ONE_HOUR, crossSection: NEW_CROSS_SECTION, navlogNwpPatch: NEW_NAVLOG_PATCH, timeRules: NEW_TIME_RULES })
})

test('does not yield a partial state when the combined refresh fails', async () => {
  const result = await refreshNwpTimeViews({
    selection: PLUS_ONE_HOUR,
    payload: NWP_TIME_REFRESH_REQUEST,
    fetchNwpTimeRefresh: async () => { throw new Error('NWP time refresh failed') },
  })

  assert.deepEqual(result, { ok: false, error: 'NWP time refresh failed' })
})

test('keeps only the most recent NWP refresh result after rapid edits', async () => {
  const first = deferred()
  const second = deferred()
  const state = createNwpTimeRefreshGuard()
  state.run(PLUS_ONE_HOUR, () => first.promise)
  state.run(PLUS_TWO_HOURS, () => second.promise)
  second.resolve(PLUS_TWO_RESPONSE)
  first.resolve(PLUS_ONE_RESPONSE)
  assert.deepEqual(await state.latest(), PLUS_TWO_RESPONSE)
})
```

- [ ] **Step 2: Run the orchestration tests to verify they fail**

Run: `npm --prefix frontend test -- src/features/route-briefing/lib/nwpTimeRefresh.test.js`

Expected: FAIL because the refresh coordinator does not exist.

- [ ] **Step 3: Implement the coordinator and hook integration**

Build one request from the next selection and the same stable markers. Use the existing monotonic request-ref pattern (or one `AbortController`) for both offset edits and `handleSelectForecastHour`; a route reset/unmount invalidates the same request identity. In either handler, leave the currently rendered rail/chart/NAVLOG intact while `nwpTimeRefreshing` is true. On success, replace the chart and merge the NWP-only patch by leg key, preserving hazards, NOTAMs, constraints, and all non-NWP facts; then persist the next selection state. On failure, retain the former values and expose the returned error. Reuse the existing `onSetWaypointNwpOffset` callback chain so the profile's time-rail UI does not acquire a second state owner. Add a compact NAVLOG status line: `NWP 시간 반영 중…`; after failure show `NWP 시간 반영 실패` and a `다시 시도` button bound to the exact failed pending selection.

Include `nwpTimeSelection` in both initial `fetchRouteBriefing` call sites: normal briefing generation and saved-briefing reopen. Add a saved briefing regression where the persisted rule points at no longer retained data: it remains selected, returns explicit no-data for that segment, and never rebases to a nearest KIM time.

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
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs`
- Modify: `frontend/verification/route-fixture.mjs`
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
  await expect(page.getByText('적용 NWP +1h')).toBeVisible()
})
```

- [ ] **Step 2: Run the browser contract to verify it fails**

Run: `npm run dev:contract -- --grep "briefing NWP time rule updates"`

Expected: FAIL because NAVLOG remains at the briefing's original NWP values and the fixture has no combined refresh response.

- [ ] **Step 3: Add only necessary accessibility hooks and responsive styling**

If the existing NAVLOG table cells lack stable accessible names, add `aria-label` values based on their already displayed column/leg content; do not use CSS or positional selectors in the test. Add a fixture response that changes chart rule metadata and one NWP patch field, plus a rejected response that proves the old chart, NAVLOG, and selected rule remain visible before retry. Keep the refresh status within the NAVLOG section and preserve the current desktop/iPad/mobile table behavior.

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
git add frontend/verification/contracts/briefing-view.spec.mjs frontend/verification/route-fixture.mjs docs/policies/verification/contracts.md
git commit -m "test(briefing): cover NAVLOG NWP time synchronization"
```

## Plan self-review

- **Coverage:** Tasks 1–2 retain the full briefing envelope internally and establish one single-read API for chart/NAVLOG refresh; Task 3 covers offset and base-hour edits, stale-response guards, saved reopen, and NWP-only patching; Task 4 validates success, chart metadata, failure/retry, and the user-visible contract.
- **Scope:** The plan deliberately excludes altitude-comparison NAVLOG, a new detail window, ETD/ETA recalculation, and changes to advisory/NOTAM data rules.
- **Consistency:** `nwpTimeSelection`, `timeRules`, `fetchNwpTimeRefresh`, `buildRouteWeatherPayload`, and `navlogNwpPatch` have a single declared shape and producer/consumer in the task that introduces each one.
- **No placeholders:** Commands, routes, function signatures, error behavior, and test assertions are specified for every task.
