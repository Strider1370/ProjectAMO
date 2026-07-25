# NavLog Leg Weather Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-15-navlog-leg-table.md`

**Goal:** Show one weather-briefing leg for every domestic IFR en-route waypoint-to-waypoint segment in the existing briefing window.

**Architecture:** A backend pure model derives `sections.enroute.legs` from the common `routeModel.enRouteSegments` and the already-loaded KIM/KTG route cross-section. `composeBriefing()` remains the single route-briefing response owner; it supplies the display-ready facts and statuses. A focused React component renders those facts as a desktop table or mobile cards without repeating weather, NOTAM, or AIP matching in the browser.

**Tech Stack:** Node.js ESM + `node:test`, Express route briefing response, React 19, Fluent UI table/card primitives, existing CSS custom properties, Playwright.

## Global Constraints

- Use `routeModel.enRouteSegments[].fromFix/toFix/startNm/endNm` as canonical leg boundaries. Do not rebuild route segments in the new model.
- Keep the 2,000m exposure axis and cross-section weather axis separate. `loadRouteCrossSection()` must return its sampled axis; only that axis may be index-aligned with `crossSection.levels[].values` or `turbulence.levels[].values`.
- Use one flat `selectedCruiseAltitudeFt` for both the existing en-route ribbon and leg rows. SID/STAR/IAP climb/descent remains a vertical-profile concern.
- En-route means `enRouteRange`; SID, STAR, IAP, airport-only warnings, and terminal NOTAMs do not create leg rows.
- Preserve unknown, unavailable, partial, conflicting, and unaligned states; never turn them into a clear weather, matched time, or valid AIP constraint.
- Return facts and data state only. Do not return TAS, Ground Speed, Heading, leg time, ETA, fuel, a safety score, or a recommendation.
- Reuse KIM/KTG, hazard, NOTAM, AIP constraint, and provenance data already used by route briefing. Add no dependency and no new HTTP endpoint.
- The first release is domestic IFR en-route. VFR and outside-coverage paths retain the existing briefing and must not claim equivalent leg completeness.
- Use Korean labels `경로 구간 기상 브리핑`, `자료 없음`, and `판정 불가`; distinguish them from a confirmed absence of a hazard.
- Browser-visible work follows `docs/operations/dev-server-and-capture.md` and includes a Playwright check before completion.

---

### Task 1: Build the pure en-route leg model and preserve NOTAM uncertainty

**Files:**

- Create: `backend/src/briefing/route-weather-legs.js`
- Create: `backend/test/route-weather-legs.test.js`
- Modify: `backend/src/briefing/notam-briefing.js:28-79`
- Modify: `backend/test/notam-briefing.test.js:44-106`
- Modify: `backend/src/briefing/altitude-weather-comparison.js:96-192`
- Modify: `backend/test/altitude-weather-comparison.test.js:1-132`
- Modify: `shared/route-model.test.js:1-63`

**Interfaces:**

- Consumes: `routeModel.enRouteSegments`, the cross-section's returned `weatherAxis`, KIM `crossSection.levels`, KTG `turbulence.levels`, `adverse.hazards`, route NOTAM records, and `aipConstraints.segments`.
- Produces: `buildRouteWeatherLegs({ routeModel, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, aipConstraints })`, returning `{ legs, totalDistanceNm, altitudeConstraintStatus }`.
- Produces: route NOTAM records that retain `timeStatus` and known route geometry when time, altitude, or geometry is insufficient, allowing a leg to display `effect: 'undetermined'` rather than hiding the uncertainty.

- [ ] **Step 1: Write the leg-model tests before creating the implementation**

Create `backend/test/route-weather-legs.test.js` with a three-leg fixture whose route segments have boundaries at 0, 30, 80, and 120 NM. Include assertions equivalent to:

```js
const result = buildRouteWeatherLegs({
  routeModel: { enRouteSegments: segments }, weatherAxis: axis,
  selectedCruiseAltitudeFt: 9000, crossSection, turbulence,
  hazards, routeNotams, aipConstraints,
})

assert.deepEqual(result.legs.map(({ from, to, distanceNm }) => ({ from, to, distanceNm })), [
  { from: 'A', to: 'B', distanceNm: 30 },
  { from: 'B', to: 'C', distanceNm: 50 },
  { from: 'C', to: 'D', distanceNm: 40 },
])
assert.equal(result.legs[1].wind.meanComponentKt, 35)
assert.equal(result.legs[1].turbulence.exposures[0].distanceNm, 20)
assert.deepEqual(result.legs[1].hazards.map(({ code }) => code), ['SEV_TURB'])
assert.deepEqual(result.legs[1].notams.map(({ effect }) => effect), ['warn', 'undetermined'])
assert.equal(result.legs[1].altitudeConstraint.status, 'matched')
assert.equal('eta' in result.legs[1], false)
assert.equal('headingDeg' in result.legs[1], false)
```

Add separate cases for: 12 consecutive segments with no sampling omission; a hazard whose interval is at least 1 NM outside a leg; a SIGMET with `altitudeExposure.status === 'unknown'`; unavailable KIM/KTG values; a selected altitude above 10,000 ft; a changed selected altitude; `dct` plus `not_applicable` applicability; an unaligned segment row; and an AIP conflict that returns no invented limit.

Extend `shared/route-model.test.js` with a representative resolved route fixture and assert that each rendered leg is exactly one existing `enRouteSegments` record. Do not add waypoint splitting to this feature.

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npm.cmd --prefix backend test -- test/route-weather-legs.test.js`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `route-weather-legs.js`.

- [ ] **Step 3: Write the minimal backend-only leg model**

Create `backend/src/briefing/route-weather-legs.js`. For each sorted `enRouteSegments` item, build one leg with `from`, `to`, and `alignmentStatus`. Aligned segments receive `startNm`, `endNm`, and rounded `distanceNm`; an unaligned segment remains a `자료 없음` row and must not be filtered out.

```js
export function buildRouteWeatherLegs({
  routeModel, weatherAxis, selectedCruiseAltitudeFt,
  crossSection, turbulence, hazards = [], routeNotams = [], aipConstraints,
} = {}) {
  const segments = [...(routeModel?.enRouteSegments ?? [])]
    .sort((a, b) => (a.startNm ?? Infinity) - (b.startNm ?? Infinity))
  const constraints = new Map((aipConstraints?.segments ?? []).map((entry) => [entry.id, entry]))
  return {
    legs: segments.map((segment) => buildLeg({ segment, weatherAxis, selectedCruiseAltitudeFt, crossSection, turbulence, hazards, routeNotams, constraint: constraints.get(segment.id), sourceCycle: aipConstraints?.provenance?.publicationId ?? null })),
    totalDistanceNm: weatherAxis?.totalDistanceNm ?? null,
    altitudeConstraintStatus: aipConstraints?.status ?? 'unavailable',
  }
}
```

Export the existing pure `weightedWind()`, `sampleWeights()`, and `exposureSummary()` helpers from `altitude-weather-comparison.js`; do not duplicate their interpolation or grade calculations. `buildLeg()` supplies clipped leg weights over `weatherAxis` and maps their existing return fields into the leg contract. Project `u/v` onto each weather-axis sample's true bearing to derive signed tail/headwind components. Compute `courseTrueDeg` from the same distance-weighted bearing samples and display no magnetic heading. Include a SIGMET/AIRMET when it is non-airport-scoped, has a leg overlap greater than 0.2 NM, and `altitudeExposure.status !== 'clear'`; preserve `timeStatus` and display an unknown vertical status as `고도 판정 불가`. Include route NOTAMs only with a leg overlap greater than 0.2 NM; map known applicable records to `warn` and any missing comparison input to `undetermined`.

For constraints, read `entry.constraints?.minimumFlightAltitude`, `entry.constraints?.lowerLimit`, and `entry.constraints?.upperLimit`. Preserve the actual per-segment status (`matched`, `unavailable`, or `conflicting`) and represent `dct` separately as `applicability: 'not_applicable'`. Do not calculate a replacement floor or ceiling.

- [ ] **Step 4: Extend `matchRouteNotams()` without changing known-match behavior**

Modify `backend/src/briefing/notam-briefing.js` so a geometrically on-route NOTAM with missing validity dates, ETD/ETA, or altitude range remains available to the leg model with an explicit unresolved status. Keep these existing rules unchanged: `scope: 'fir'` stays excluded; an item proven outside a complete time window stays excluded; airport-only NOTAMs keep `routeIntervalNm: null`; and `routeConflicts` still contains only confirmed restriction conflicts.

Each retained route NOTAM must include:

```js
{
  id, summary, routeIntervalNm, bandFt, verticalKnown, conflict,
  timeStatus: 'matched' | 'not_provided' | 'unavailable',
  comparisonStatus: 'warn' | 'undetermined',
}
```

Set `activeAtEtd` to `false` when either timestamp cannot be parsed, and sort unresolved records after known active records without subtracting `NaN` distances.

Update `backend/test/notam-briefing.test.js` with a route-crossing NOTAM that lacks `valid_from`/`valid_to` and assert it returns `comparisonStatus: 'undetermined'`, has no conflict, and is not converted to a clear result.

- [ ] **Step 5: Run focused backend tests**

Run: `npm.cmd --prefix backend test -- test/route-weather-legs.test.js test/notam-briefing.test.js`

Expected: PASS with all new leg and unresolved-NOTAM cases green.

- [ ] **Step 6: Commit the pure-model work**

```powershell
git add backend/src/briefing/route-weather-legs.js backend/src/briefing/notam-briefing.js backend/test/route-weather-legs.test.js backend/test/notam-briefing.test.js
git commit -m \"feat: add route weather leg model\"
```

### Task 2: Attach legs to the existing route-briefing response without loading cross-sections twice

**Files:**

- Modify: `backend/src/briefing/briefing-composer.js:79-177`
- Modify: `backend/src/briefing/enroute-model.js:79-122`
- Modify: `backend/src/briefing/enroute-cross-section.js:94-147`
- Modify: `backend/test/route-briefing-integration.test.js:1-47`
- Modify: `backend/test/briefing-composer.test.js:95-99`
- Modify: `backend/test/enroute-model.test.js:1-63`

**Interfaces:**

- Consumes: `buildRouteWeatherLegs()` from Task 1 and `loadRouteCrossSection()`.
- Produces: `briefing.sections.enroute.legs`, while preserving existing `encounters`, `model`, `aipConstraints`, and `provenance` response fields.

- [ ] **Step 1: Add a failing composed-response assertion**

Extend the existing integration fixture with a minimal aligned `request.routeModel.enRouteSegments`, injected `{ available: true, axis: weatherAxis, crossSection, turbulence }` data, and a route-crossing advisory. Assert:

```js
const briefing = composeBriefing(request, data)
assert.equal(briefing.sections.enroute.legs.length, 1)
assert.deepEqual(Object.keys(briefing.sections.enroute.legs[0].wind), ['meanComponentKt', 'minComponentKt', 'maxComponentKt'])
assert.equal(briefing.sections.enroute.legs[0].from, 'FIXA')
assert.equal(briefing.sections.enroute.legs[0].to, 'FIXB')
```

- [ ] **Step 2: Run the integration test to verify the `legs` assertion fails**

Run: `npm.cmd --prefix backend test -- test/route-briefing-integration.test.js`

Expected: FAIL because `briefing.sections.enroute.legs` is undefined.

- [ ] **Step 3: Reuse one loaded cross-section in `composeBriefing()`**

In `backend/src/briefing/enroute-cross-section.js`, return the locally created `axis` in every available `loadRouteCrossSection()` result. In `backend/src/briefing/briefing-composer.js`, replace the current `buildEnrouteModel({ root, routeGeometry, body, cruiseAltitudeFt })` call with one `loadRouteCrossSection({ root: data?.dataRoot, routeGeometry: request.routeGeometry, body: request })` call. Add the test-only injected-data seam `data.enrouteCrossSection ?? loadRouteCrossSection(...)`; production callers do not supply `enrouteCrossSection`. Pass `loaded.axis` only to `buildRouteWeatherLegs()`; keep the composer’s 2,000m `axis` for hazard, NOTAM, and AIP exposure matching.

Change `summarizeEnrouteModel()` to sample its icing/turbulence ribbon at the same constant `cruiseAltitudeFt`, not `altitudeAtDistanceFt()`. Update `backend/test/enroute-model.test.js` so the ribbon and leg fixtures agree on the selected-altitude semantics; terminal climb/descent remains only in the vertical-profile response.

Use this shape in the composed section:

```js
const enroute = {
  level: adverse.level,
  plannedCruiseAltitudeFt: cruiseAltitudeFt,
  encounters,
  crossSectionAvailable: Boolean(loaded?.available),
  model: enrouteModel,
  legs: buildRouteWeatherLegs({
    routeModel: request.routeModel, weatherAxis: loaded?.axis,
    selectedCruiseAltitudeFt: cruiseAltitudeFt,
    crossSection: loaded?.crossSection, turbulence: loaded?.turbulence,
    hazards: adverse.hazards, routeNotams, aipConstraints,
  }).legs,
  aipConstraints,
}
```

Keep `buildEnrouteModel()` only if another consumer remains; otherwise remove the unused wrapper and retain `summarizeEnrouteModel()` as the single summarizer. The composer must still succeed with `model: null` and `legs` containing status-only facts when KIM data is unavailable. Preserve the existing `crossSectionAvailable: true` compatibility contract unless its tests and `BriefingView` consumer are deliberately updated in the same task.

- [ ] **Step 4: Run the integration and existing en-route model tests**

Run: `npm.cmd --prefix backend test -- test/route-briefing-integration.test.js test/briefing-composer.test.js test/enroute-model.test.js`

Expected: PASS; the hazard ribbon and the new `sections.enroute.legs` field use the same selected-altitude semantics, and aligned segments produce leg rows.

- [ ] **Step 5: Commit the response integration**

```powershell
git add backend/src/briefing/briefing-composer.js backend/src/briefing/enroute-model.js backend/src/briefing/enroute-cross-section.js backend/test/route-briefing-integration.test.js backend/test/briefing-composer.test.js backend/test/enroute-model.test.js
git commit -m \"feat: include weather legs in route briefing\"
```

### Task 3: Render briefing legs in the existing briefing view

**Files:**

- Create: `frontend/src/features/route-briefing/RouteWeatherLegTable.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx:384-455,693-733`
- Modify: `frontend/src/features/route-briefing/BriefingView.css:168-220,254-258`
- Create: `frontend/src/features/route-briefing/RouteWeatherLegTable.test.js`
- Modify: `frontend/src/features/route-briefing/BriefingView.responsive.test.js:1-31`

**Interfaces:**

- Consumes: `sections.enroute.legs` and `plannedCruiseAltitudeFt`.
- Produces: `<RouteWeatherLegTable legs={legs} selectedAltitudeFt={plannedCruiseAltitudeFt} />`.

- [ ] **Step 1: Add a failing render-contract test**

Create `RouteWeatherLegTable.test.js` using source-level assertions consistent with existing frontend tests. Require the component to contain the Korean title, all seven desktop labels, `data-label` values for mobile cards, and the no-performance disclaimer:

```js
assert.match(jsx, /경로 구간 기상 브리핑/)
assert.match(jsx, /구간.*거리.*Course.*선택고도.*바람.*기온.*위험기상/s)
assert.match(jsx, /data-label=\"위험기상\"/)
assert.match(jsx, /ETA 또는 연료 계산을 포함하지 않습니다/)
```

Add to `BriefingView.responsive.test.js` an assertion that the component appears after `bv-ribbons` and before `bv-rawwinds` in `BriefingView.jsx`.

- [ ] **Step 2: Run the new frontend test to verify it fails**

Run: `npm.cmd --prefix frontend test -- src/features/route-briefing/RouteWeatherLegTable.test.js src/features/route-briefing/BriefingView.responsive.test.js`

Expected: FAIL because `RouteWeatherLegTable.jsx` does not exist.

- [ ] **Step 3: Create the display-only component**

Create `RouteWeatherLegTable.jsx`. It must not import API clients, route-axis helpers, or weather-matching code. Use `Table` on desktop and semantic leg cards at the existing narrow container breakpoint. Render every supplied leg, never use `pickColumns`, and display these values:

```jsx
<Caption1>{leg.from} → {leg.to}</Caption1>
<TableCell>{leg.distanceNm} NM</TableCell>
<TableCell>{leg.courseTrueDeg == null ? '자료 없음' : `\${leg.courseTrueDeg}°T`}</TableCell>
<TableCell>{formatAltitude(leg.selectedAltitudeFt)}</TableCell>
<TableCell>{formatWind(leg.wind)}</TableCell>
<TableCell>{formatTemp(leg.temp)}</TableCell>
<TableCell>{renderHazards(leg)}</TableCell>
```

`renderHazards()` must list icing/turbulence exposure, hazard labels with their time state, NOTAM summary with `warn` or `판정 불가`, and AIP status. A null weather field is `자료 없음`; an empty, available hazard list is `해당 없음`; these must use different text and styles. Each mobile card must carry `data-testid="route-weather-leg-card"`. Leg rows are not clickable in this scope.

- [ ] **Step 4: Integrate it into `BriefingView` and add contained styles**

Import the component in `BriefingView.jsx`, derive `const legs = sections.enroute?.legs ?? []`, and insert it immediately after the existing hazard ribbon block and before the cross-section/raw-wind content:

```jsx
{legs.length > 0 && (
  <RouteWeatherLegTable
    legs={legs}
    selectedAltitudeFt={sections.enroute.plannedCruiseAltitudeFt}
  />
)}
```

Add only `.bv-leg-*` styles in `BriefingView.css`: horizontally scrollable table on desktop, tabular numerals, text plus color for tail/headwind, neutral unresolved-status badges, and card layout under `@container briefing (max-width: 719px)`. Do not alter ribbon geometry or broad existing selectors.

- [ ] **Step 5: Run frontend unit tests and build**

Run: `npm.cmd --prefix frontend test -- src/features/route-briefing/RouteWeatherLegTable.test.js src/features/route-briefing/BriefingView.responsive.test.js`

Expected: PASS.

Run: `npm.cmd --prefix frontend run build`

Expected: Vite build exits with code 0.

- [ ] **Step 6: Commit the briefing view**

```powershell
git add frontend/src/features/route-briefing/RouteWeatherLegTable.jsx frontend/src/features/route-briefing/RouteWeatherLegTable.test.js frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css frontend/src/features/route-briefing/BriefingView.responsive.test.js
git commit -m \"feat: render route weather leg briefing\"
```

### Task 4: Verify the user flow and record the new file roles

**Files:**

- Modify: `Architecture.md:140,182-194`
- Modify: `docs/superpowers/specs/2026-07-15-navlog-leg-table.md:172-197` only if implementation reveals a spec/code mismatch
- Modify: `frontend/verification/route-fixture.mjs:33-45,64-126`
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs:1-45`

**Interfaces:**

- Consumes: the composed briefing response and rendered component from Tasks 1-3.
- Produces: updated File Roles entries and browser evidence for the supported domestic IFR flow.

- [ ] **Step 1: Update Architecture.md File Roles**

Add one File Roles entry for `backend/src/briefing/route-weather-legs.js`: it owns per-en-route-segment, selected-altitude weather/hazard/NOTAM/AIP fact aggregation and does not make recommendations. Extend the existing `BriefingView.jsx` entry to name `RouteWeatherLegTable` and its placement below the hazard ribbon. Add an entry for `RouteWeatherLegTable.jsx`: it is display-only and renders `sections.enroute.legs` as a desktop table/mobile cards.

- [ ] **Step 2: Run the complete focused regression suite**

Run:

```powershell
npm.cmd --prefix backend test -- test/route-weather-legs.test.js test/notam-briefing.test.js test/route-briefing-integration.test.js test/enroute-model.test.js
npm.cmd --prefix backend test -- test/briefing-composer.test.js test/altitude-weather-comparison.test.js
npm.cmd --prefix frontend test -- src/features/route-briefing/RouteWeatherLegTable.test.js src/features/route-briefing/BriefingView.responsive.test.js
npm.cmd --prefix frontend run build
```

Expected: all test commands and the frontend build exit with code 0.

- [ ] **Step 3: Verify the briefing window in Playwright**

Extend `frontend/verification/route-fixture.mjs` before running Playwright. Its `briefingFor()` fixture must include a two-leg `sections.enroute.legs` array with distinct `startNm`/`endNm`, known weather for one leg, and an unresolved NOTAM for the other; the fixture must not rely on unavailable KIM data to construct the legs.

In `frontend/verification/contracts/briefing-view.spec.mjs`, after `createBriefing(page)`, add explicit desktop and mobile assertions. Assert the title, two distinct leg labels, an unresolved fixture state, and the no-performance disclaimer. On mobile, assert at least two `[data-testid="route-weather-leg-card"]` elements. Map range focusing is outside this feature scope.

Follow `docs/operations/dev-server-and-capture.md` to start the approved dev servers and use this extended fixture. In Playwright, generate a briefing and verify:

```js
await expect(page.getByText('경로 구간 기상 브리핑')).toBeVisible()
await expect(page.getByText(/→/).first()).toBeVisible()
await expect(page.getByText(/운항 NavLog, ETA 또는 연료 계산을 포함하지 않습니다/)).toBeVisible()
```

At a mobile viewport, verify the same legs render as cards and no desktop table columns are silently removed. Save the required captures under the procedure's artifact path.

- [ ] **Step 4: Update the spec only for an implementation-discovered contract mismatch**

If a test shows the agreed `sections.enroute.legs` contract is impossible without changing scope, stop and revise the approved spec before broadening the implementation. Otherwise leave the approved requirements unchanged.

- [ ] **Step 5: Update the repository graph and commit documentation**

Run: `graphify update .`

Expected: graph update completes without an extraction error.

```powershell
git add Architecture.md docs/superpowers/specs/2026-07-15-navlog-leg-table.md graphify-out
git commit -m \"docs: document route weather leg briefing\"
```

## Requirement Coverage

| Spec requirement | Plan task |
| --- | --- |
| WP-to-WP en-route leg boundaries, no sampling omission | Task 1 |
| Selected-altitude, distance-weighted wind/temperature and icing/turbulence | Task 1 |
| Horizontal, vertical, and time-aware hazard facts | Tasks 1-2 |
| `warn`/`undetermined` NOTAM and original AIP states | Task 1 |
| Existing briefing response owns `sections.enroute.legs` | Task 2 |
| Desktop table, mobile cards, and no performance claims | Task 3 |
| Architecture, tests, Playwright, and graph refresh | Task 4 |
