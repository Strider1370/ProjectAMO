# Waypoint NWP Time Overrides Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a pilot choose a KIM NWP offset at a named waypoint so that offset applies from that waypoint until the next change, while the vertical profile visibly and accessibly shows those boundaries.

**Architecture:** A shared pure selection model normalizes stable waypoint-ID overrides and converts them into route-distance segments. The cross-section API accepts that selection plus route markers, samples each segment from its exact KIM valid time and nearest eligible KTG valid time, and returns safe applied-time metadata. The React controller persists only selection intent and renders an interactive, thin time line between the plot axis and the existing multi-lane waypoint labels.

**Tech Stack:** Node 22 ESM, Express, React 19, SVG, Fluent UI, node:test, Playwright.

## Global Constraints

- Keep the current single, ETD-based NWP reference time as the default; do not infer waypoint passage times.
- An override begins at a named route waypoint and applies through the next override or arrival.
- Present `기준` and `+1h` through `+12h`; disable values outside the actual KIM run range and never silently select a nearest KIM time.
- KIM uses the requested exact valid time; KTG uses the closest available `+6/+9/+12h` time and discloses its actual time.
- Persist only `baseTime` and `{ waypointId, offsetHours }`; never persist NWP bodies, request URLs, or credentials.
- The rail is always visible between the graph path axis and existing waypoint-name block. It shows time text only at the base and actual change points, not at every waypoint or segment.
- Preserve one 44px accessible hit target per selectable time-line segment even though the visible rail is thin.
- Do not touch existing untracked `test-results/` or unrelated dirty files. Re-run `graphify update .` after code changes.

---

### Task 1: Shared NWP-selection contract and stable profile marker IDs

**Files:**
- Create: `shared/nwp-time-selection.js`
- Create: `shared/nwp-time-selection.test.js`
- Modify: `frontend/src/features/route-briefing/lib/verticalProfileRequest.js:buildRouteProfileMarkersPayload,buildCrossSectionRequest`
- Modify: `frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js`
- Modify: `backend/src/briefing/profile-composer.js:buildProfileMarkers`
- Test: `backend/test/vertical-profile.test.js` (or the existing profile-marker test file)

**Interfaces:**
- Consumes: route markers shaped as `{ id?, label, lon, lat, kind }` and a base ISO time.
- Produces: `normalizeNwpTimeSelection({ baseTime, waypointOverrides }, orderedWaypointIds)` and `buildNwpTimeSegments({ markers, selection })` returning ordered `{ startWaypointId, startDistanceNm, endDistanceNm, offsetHours }` entries.
- Produces: cross-section request fields `{ routeMarkers, nwpTimeSelection }`; profile markers retain `{ id, label, distanceNm, kind }`.

- [ ] **Step 1: Write the failing shared-model tests**

```js
test('normalizes duplicate and unknown waypoint overrides in route order', () => {
  assert.deepEqual(normalizeNwpTimeSelection({
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [{ waypointId: 'WP4', offsetHours: 2 }, { waypointId: 'WP2', offsetHours: 1 }, { waypointId: 'WP2', offsetHours: 9 }, { waypointId: 'gone', offsetHours: 3 }],
  }, ['DEP', 'WP2', 'WP4', 'ARR']), {
    baseTime: '2026-08-19T10:00:00.000Z',
    waypointOverrides: [{ waypointId: 'WP2', offsetHours: 9 }, { waypointId: 'WP4', offsetHours: 2 }],
    missingWaypointIds: ['gone'],
  })
})

test('makes a changed waypoint govern every following leg until the next change', () => {
  assert.deepEqual(buildNwpTimeSegments({ markers, selection }), [
    { startWaypointId: 'DEP', startDistanceNm: 0, endDistanceNm: 40, offsetHours: 0 },
    { startWaypointId: 'WP2', startDistanceNm: 40, endDistanceNm: 90, offsetHours: 1 },
    { startWaypointId: 'WP4', startDistanceNm: 90, endDistanceNm: 120, offsetHours: 2 },
  ])
})
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test shared/nwp-time-selection.test.js`

Expected: FAIL because the shared selection module does not exist.

- [ ] **Step 3: Implement the minimal pure contract**

```js
export function normalizeNwpTimeSelection(selection = {}, orderedWaypointIds = []) {
  const known = new Set(orderedWaypointIds)
  const lastById = new Map()
  const missingWaypointIds = []
  for (const item of selection.waypointOverrides ?? []) {
    if (!known.has(item?.waypointId)) { missingWaypointIds.push(item?.waypointId); continue }
    if (Number.isInteger(item.offsetHours) && item.offsetHours >= 0 && item.offsetHours <= 12) lastById.set(item.waypointId, item.offsetHours)
  }
  return {
    baseTime: Number.isFinite(Date.parse(selection.baseTime)) ? new Date(selection.baseTime).toISOString() : null,
    waypointOverrides: orderedWaypointIds.filter((id) => lastById.has(id)).map((waypointId) => ({ waypointId, offsetHours: lastById.get(waypointId) })),
    missingWaypointIds: [...new Set(missingWaypointIds.filter(Boolean))],
  }
}
```

Assign generated or existing stable marker IDs when building every profile-marker payload, preserve them in `buildProfileMarkers`, and include `routeMarkers` and `nwpTimeSelection` only when supplied in `buildCrossSectionRequest`.

For markers without an existing saved ID, derive `marker:${kind}:${normalizedLabel}:${lon.toFixed(6)}:${lat.toFixed(6)}:${sameLabelOccurrence}` in route order. Preserve existing IDs unchanged; coordinates plus occurrence distinguish duplicate labels, airports, and user-created points. Normalize legacy saved markers into this form on load, so a recalculated or changed-coordinate marker is surfaced as a missing anchor rather than receiving an override meant for a different waypoint.

- [ ] **Step 4: Run focused shared, frontend request, and backend marker tests**

Run: `node --test shared/nwp-time-selection.test.js && npm --prefix frontend test -- src/features/route-briefing/lib/verticalProfileRequest.test.js && npm --prefix backend test -- test/vertical-profile.test.js`

Expected: PASS; marker identity survives request-to-profile round trip and save/load, duplicate labels have separate IDs, inserted/reordered route markers retain their matching override, and no selection is added to legacy requests.

- [ ] **Step 5: Commit the contract change**

```bash
git add shared/nwp-time-selection.js shared/nwp-time-selection.test.js frontend/src/features/route-briefing/lib/verticalProfileRequest.js frontend/src/features/route-briefing/lib/verticalProfileRequest.test.js backend/src/briefing/profile-composer.js backend/test/vertical-profile.test.js
git commit -m "feat: define waypoint NWP time selections"
```

### Task 2: Compose KIM and KTG cross-sections by rule segment

**Files:**
- Modify: `backend/src/briefing/enroute-cross-section.js:loadRouteCrossSection`
- Modify: `backend/src/briefing/cross-section-sampler.js:buildCrossSection,buildKtgCrossSection`
- Modify: `backend/server.js:/api/briefing/cross-section`
- Modify: `backend/test/cross-section-sampler.test.js`
- Modify: `backend/test/cross-section-route.test.js`

**Interfaces:**
- Consumes: `body.routeMarkers`, `body.nwpTimeSelection`, actual KIM `availableTimes`, and KTG index times.
- Produces: sampled values whose source time is chosen per axis sample, plus response metadata:

```js
{
  timeRules: {
    baseTime: '2026-08-19T10:00:00.000Z',
    segments: [{ startWaypointId: 'WP2', startDistanceNm: 40, endDistanceNm: 90, offsetHours: 1, kim: { hf: 1, validTime }, ktg: { hf: 6, validTime } }],
    unavailableOffsets: [7, 8],
    missingWaypointIds: [],
  },
}
```

- [ ] **Step 1: Write failing backend tests for mixed-time sampling and API safety**

```js
test('cross-section takes exact KIM hf 0 before WP2 and hf 1 from WP2 onward', async () => {
  const body = await postCrossSection({
    routeGeometry: ROUTE_GEOMETRY, routeMarkers: MARKERS,
    nwpTimeSelection: { baseTime: validTimeFor(tmfc, 0), waypointOverrides: [{ waypointId: 'WP2', offsetHours: 1 }] },
  })
  assert.equal(body.levels[0].values[beforeWp2].sourceHf, 0)
  assert.equal(body.levels[0].values[afterWp2].sourceHf, 1)
  assert.equal(body.timeRules.segments[1].kim.hf, 1)
})

test('does not replace unavailable KIM offset with a nearer field', async () => {
  const body = await postCrossSection({ /* request +2 when only hf 0 and 1 exist */ })
  assert.ok(body.timeRules.unavailableOffsets.includes(2))
  assert.equal(body.levels[0].values[afterWp2].t, null)
})
```

- [ ] **Step 2: Run the focused backend tests to verify they fail**

Run: `npm --prefix backend test -- test/cross-section-sampler.test.js test/cross-section-route.test.js`

Expected: FAIL because the endpoint has no `timeRules` response and currently samples one global `hf`.

- [ ] **Step 3: Implement per-sample source resolution and loading**

Resolve the normalized selection against profile-marker distances before sampling. For each segment, resolve `baseTime + offsetHours` only to an exact KIM entry. Group sample indices by resolved hour; for each hour and level, load one grid, sample only that hour's indices, then release the raw grid before loading the next hour/level. Do not retain all hours or all levels in the existing grid cache: keep at most the documented 32-grid/sample-only working set, and invalidate it on NWP revision as today. Select KTG by the existing closest-time helper using that segment's resolved KIM valid time. Give each output sample a safe `sourceHf`/availability marker, return `timeRules`, and leave legacy requests on the old single-HF behavior. Do not add source URLs, credentials, or raw grid identities to the response.

- [ ] **Step 4: Run focused backend contract tests**

Run: `npm --prefix backend test -- test/cross-section-sampler.test.js test/cross-section-route.test.js`

Expected: PASS; the response contains the safe rule metadata, exact KIM data changes at the waypoint boundary, unavailable KIM data remains unavailable, KTG records its actual nearest valid time, and a 13-hour fixture proves raw-grid reads remain bounded rather than retaining every hour/level field.

- [ ] **Step 5: Commit the backend composition change**

```bash
git add backend/src/briefing/enroute-cross-section.js backend/src/briefing/cross-section-sampler.js backend/server.js backend/test/cross-section-sampler.test.js backend/test/cross-section-route.test.js
git commit -m "feat: compose cross sections by waypoint NWP time"
```

### Task 3: Route-briefing state, global reference selection, and saved-route intent

**Files:**
- Create: `frontend/src/features/route-briefing/lib/nwpTimeSelection.js`
- Create: `frontend/src/features/route-briefing/lib/nwpTimeSelection.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/lib/verticalProfileRequest.js`
- Modify: `frontend/src/features/route-briefing/lib/routeStore.js`
- Modify: `frontend/src/features/route-briefing/lib/savedRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/lib/routeStore.test.js`
- Modify: `frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`

**Interfaces:**
- Consumes: profile markers, response `availableTimes`, and `timeRules`.
- Produces: hook state `nwpTimeSelection` and `setWaypointNwpOffset(waypointId, offsetHours | null)`; every cross-section request carries the normalized state.
- Persists: `snapshot.nwpTimeSelection = { baseTime, waypointOverrides }` only.

- [ ] **Step 1: Write failing state and persistence tests**

```js
test('changing the global forecast base retains waypoint relative offsets', () => {
  assert.deepEqual(rebaseNwpTimeSelection(selection, '2026-08-19T11:00:00.000Z').waypointOverrides, selection.waypointOverrides)
})

test('saved routes preserve only baseTime and stable waypoint overrides', () => {
  const saved = normalizeRouteSnapshot({ version: 3, base, nwpTimeSelection: selection })
  assert.deepEqual(saved.nwpTimeSelection, selection)
  assert.equal(JSON.stringify(saved).includes('apiKey'), false)
})

test('setting an offset reloads the cross section with the next immutable selection', async () => {
  const request = await setWaypointNwpOffset('WP2', 1)
  assert.deepEqual(request.nwpTimeSelection.waypointOverrides, [{ waypointId: 'WP2', offsetHours: 1 }])
})
```

- [ ] **Step 2: Run the new frontend tests to verify they fail**

Run: `npm --prefix frontend test -- src/features/route-briefing/lib/nwpTimeSelection.test.js src/features/route-briefing/lib/routeStore.test.js src/features/route-briefing/lib/savedRouteBriefing.test.js`

Expected: FAIL because the selection reducer and snapshot field do not exist.

- [ ] **Step 3: Implement controller state and compatibility normalization**

Initialize a no-override selection whenever a route is created or changed, re-normalize it against the current markers after recalculation, retain only surviving stable IDs, and expose a removable missing-anchor warning. Rebase only `baseTime` when the existing ForecastHourNav changes the global reference; keep offsets unchanged. `setWaypointNwpOffset` must compute the next selection and immediately invoke the same cross-section reload path used by `handleSelectForecastHour`, with the existing request-ID stale-response guard and loading state; update state only after that request is launched so the rail cannot claim data that was not requested. Include markers and selection in every initial, reload, comparison, and selected-hour cross-section request. Add the field to the existing saved-route snapshot and loader without changing legacy snapshots lacking it; if old data has expired, retain the selection and show data unavailable rather than rebasing it.

- [ ] **Step 4: Run focused frontend state/persistence tests**

Run: `npm --prefix frontend test -- src/features/route-briefing/lib/nwpTimeSelection.test.js src/features/route-briefing/lib/verticalProfileRequest.test.js src/features/route-briefing/lib/routeStore.test.js src/features/route-briefing/lib/savedRouteBriefing.test.js src/features/route-briefing/useRouteBriefing.selection.test.js`

Expected: PASS; route changes prune only missing anchors, base-time changes preserve offsets, setting an override makes a race-safe cross-section request, saved/reloaded routes reproduce intent without weather payloads, and an expired-data response leaves the rule unchanged while reporting unavailable data.

- [ ] **Step 5: Commit the controller and persistence change**

```bash
git add frontend/src/features/route-briefing/lib/nwpTimeSelection.js frontend/src/features/route-briefing/lib/nwpTimeSelection.test.js frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/lib/verticalProfileRequest.js frontend/src/features/route-briefing/lib/routeStore.js frontend/src/features/route-briefing/lib/savedRouteBriefing.js frontend/src/features/route-briefing/lib/routeStore.test.js frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js frontend/src/features/route-briefing/RouteBriefingPanel.jsx
git commit -m "feat: persist waypoint NWP time intent"
```

### Task 4: Always-visible, segment-clickable NWP time line in the vertical profile

**Files:**
- Create: `frontend/src/features/route-briefing/NwpTimeRuleRail.jsx`
- Create: `frontend/src/features/route-briefing/NwpTimeRuleRail.test.js`
- Modify: `frontend/src/features/route-briefing/VerticalProfileChart.jsx`
- Modify: `frontend/src/features/route-briefing/VerticalProfileWindow.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`
- Modify: `frontend/src/features/route-briefing/BriefingView.responsive.test.js`

**Interfaces:**
- Consumes: `profile.markers`, `crossSection.timeRules`, `availableTimes`, current selection, and `onSetWaypointNwpOffset`.
- Produces: an SVG-aligned rule line directly below the plotted route axis and above the existing lane-packed marker labels; clicking an interval opens an anchored offset menu for that interval's start waypoint.

- [ ] **Step 1: Write the failing visual-model and responsive-source tests**

```js
test('renders labels only at base and changed waypoint boundaries', () => {
  const rail = buildNwpTimeRuleRail({ markers, segments: [{ startWaypointId: 'DEP', offsetHours: 0 }, { startWaypointId: 'BIKSI', offsetHours: 1 }] })
  assert.deepEqual(rail.labels.map((item) => item.waypointId), ['DEP', 'BIKSI'])
})

test('assigns a segment hit target to the waypoint immediately on its left', () => {
  assert.equal(hitTestNwpRail({ x: 181, markers: markerXs }).startWaypointId, 'BIKSI')
})
```

Also assert that the chart's bottom padding includes rail height before marker-lane height, and that the rail has accessible text equivalent to its color/opacity state.

- [ ] **Step 2: Run the focused UI tests to verify they fail**

Run: `npm --prefix frontend test -- src/features/route-briefing/NwpTimeRuleRail.test.js src/features/route-briefing/BriefingView.responsive.test.js`

Expected: FAIL because the rail component and chart integration do not exist.

- [ ] **Step 3: Implement the rail and popover interaction**

Increase `VerticalProfileChart` bottom padding by a fixed rail allocation before adding its existing dynamic marker-lane allocation. Draw one thin rail segment per rule range, small waypoint points, and a vertical boundary plus compact `+Nh` label only at departure or an override. Render transparent 44px SVG/HTML button targets over each interval; their action opens a Fluent UI menu/popover labelled `“{waypoint label}부터 적용”` with `기준`, `+1h`…`+12h`, disabled unavailable values carrying `수집된 NWP 시간 범위 밖`, and `변경점 삭제` for existing overrides. Pass the same props through inline briefing, full profile window, and mobile window. Include KTG's actual time and unavailable state in the existing chart metadata/legend rather than pretending it matched KIM.

- [ ] **Step 4: Run focused UI tests and build**

Run: `npm --prefix frontend test -- src/features/route-briefing/NwpTimeRuleRail.test.js src/features/route-briefing/BriefingView.responsive.test.js && npm --prefix frontend run build`

Expected: PASS; waypoint labels remain in their original lane system, only change points receive text, controls expose labels and disabled explanations, and the build succeeds.

- [ ] **Step 5: Commit the visual interaction**

```bash
git add frontend/src/features/route-briefing/NwpTimeRuleRail.jsx frontend/src/features/route-briefing/NwpTimeRuleRail.test.js frontend/src/features/route-briefing/VerticalProfileChart.jsx frontend/src/features/route-briefing/VerticalProfileWindow.jsx frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/map/MapView.jsx frontend/src/features/route-briefing/RouteBriefing.css frontend/src/features/route-briefing/BriefingView.responsive.test.js
git commit -m "feat: add waypoint NWP time rail"
```

### Task 5: End-to-end contract and browser verification

**Files:**
- Modify: `backend/test/cross-section-route.test.js`
- Create: `frontend/verification/contracts/route-briefing-nwp-time-overrides.spec.mjs`
- Modify: `docs/policies/verification/contracts.md` only if a new stable browser contract is added

**Interfaces:**
- Consumes: live `/api/briefing/cross-section` response and visible vertical-profile rail.
- Produces: evidence that a saved/reloaded route preserves user intent, KIM segments are exact, KTG disclosure is accurate, and no key/URL appears in the API response or saved snapshot.

- [ ] **Step 1: Write the failing contract test**

```js
test('profile rail changes only the selected downstream segment and restores after route save/load', async ({ page }) => {
  await page.getByRole('button', { name: /BIKSI부터 적용/ }).click()
  await page.getByRole('button', { name: '+1h' }).click()
  await expect(page.getByLabel('NWP 시간 규칙')).toContainText('+1h')
  await saveAndReloadCurrentRoute(page)
  await expect(page.getByLabel('NWP 시간 규칙')).toContainText('+1h')
})

test('missing saved waypoint anchors remain visible as removable warnings and unavailable offsets stay disabled', async ({ page }) => {
  await loadSavedRouteWithMissingNwpAnchor(page)
  await expect(page.getByRole('alert')).toContainText('웨이포인트를 찾을 수 없음')
  await expect(page.getByRole('button', { name: '+12h' })).toBeDisabled()
})
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `npm --prefix frontend run dev:contract -- verification/contracts/route-briefing-nwp-time-overrides.spec.mjs`

Expected: FAIL until the rail and persistence path are implemented.

- [ ] **Step 3: Add only the fixtures and stable selectors needed for the contract**

Use existing dev-server and route-briefing fixtures. Cover a dense waypoint interval (interval hit target remains 44px), mobile horizontal scrolling without accidental time changes, KTG actual-time disclosure, disabled-option reason, a missing saved waypoint anchor, and an expired-data response that preserves the saved rule. Do not add API credentials, URLs, or raw NWP values to browser-visible fixture output. Add the contract registry entry if the repository requires all new browser contracts to be registered.

- [ ] **Step 4: Run the complete required verification**

Run: `npm test && npm run build && npm --prefix frontend run dev:contract -- verification/contracts/route-briefing-nwp-time-overrides.spec.mjs && graphify update .`

Expected: all backend/frontend tests and production build pass; Playwright captures desktop, iPad landscape, and mobile evidence for visible rail, 44px interaction, disabled unavailable options, KTG actual-time disclosure, missing-anchor removal, expired-data preservation, safe mobile scroll behavior, and save/load restoration.

- [ ] **Step 5: Commit verification artifacts and contract updates**

```bash
git add backend/test/cross-section-route.test.js frontend/verification/contracts/route-briefing-nwp-time-overrides.spec.mjs docs/policies/verification/contracts.md
git commit -m "test: verify waypoint NWP time overrides"
```

## Self-Review

- Spec coverage: Tasks 1–2 cover deterministic stable anchors, exact KIM, nearest KTG, unavailable data, bounded grid loading, and the API contract. Task 3 covers global base-time rebasing, immediate race-safe refresh, route changes, expired data, and saved-route restoration. Task 4 covers the agreed rail placement, interval interaction, sparse labels, accessibility, and responsive layout. Task 5 covers browser evidence and security boundaries.
- Placeholder scan: every task names interfaces, tests, commands, and a minimal implementation direction; none defers work to an unspecified later step.
- Type consistency: `nwpTimeSelection`, `waypointOverrides`, `waypointId`, `offsetHours`, `timeRules`, and `segments` use the same names throughout. `routeMarkers` carries the IDs needed by both payload and rail.
