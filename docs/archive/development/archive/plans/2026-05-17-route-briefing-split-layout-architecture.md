# Route Briefing Split Layout Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define a safe implementation path for phone Route Briefing split layout without introducing fake map placeholders or a second Mapbox owner.

**Architecture:** `frontend/src/features/map/MapView.jsx` remains the single Mapbox runtime owner. Route Briefing UI may gain a phone-specific split surface only through parent-owned composition or a deliberate map viewport mode; `RouteBriefingPanel.jsx` and `RouteBriefing.css` must not be edited until this plan is explicitly approved.

**Tech Stack:** React 19, Vite, Mapbox GL JS, Node test runner, Playwright screenshots.

---

## Current Constraint

`MapView.jsx` owns `mapContainerRef`, `mapRef`, `new mapboxgl.Map(...)`, and the `<div ref={mapContainerRef} className="map-view" />` container. `RouteBriefingPanel.jsx` receives route state, refs, derived data, actions, and airports, but it does not own or receive a live map instance.

Do not ship a fake map placeholder. Do not create a second Mapbox instance for Route Briefing. Do not move Mapbox ownership into `RouteBriefingPanel.jsx`.

## Options

### Option A: Parent-Owned Map Slot

`MapView.jsx` keeps the live map container and renders a phone route briefing layout around it when `activePanel === 'route-check'`. The route panel remains a form/result overlay, while the parent creates a route-specific map context region by changing layout classes around the one existing `.map-view`.

**Pros:** Preserves single Mapbox owner, keeps real route preview layers, avoids duplicated map state.

**Cons:** Requires careful `MapView.jsx` and `MapView.css` composition work, plus focused screenshots because the main map shell changes.

**Recommendation:** Preferred if the product goal is “form and live map visible together.”

### Option B: Map Viewport Mode

Keep the route form as the primary phone surface and add an explicit route map mode in the parent. The mode hides the form and expands the existing map to a focused viewport with route preview layers visible.

**Pros:** Smallest live-map architecture change, readable on phone, no fake preview.

**Cons:** The form and map are not simultaneously visible; it is a task switch rather than a split view.

**Recommendation:** Preferred if speed and low regression risk matter more than simultaneous visibility.

### Option C: Static Preview Fallback

Render a non-Mapbox static route summary only after route geometry exists, such as distance, airports, and waypoint sequence. This is not a map placeholder and must not visually pretend to be a live map.

**Pros:** Avoids Mapbox layout changes and works without exposing a map slot to the panel.

**Cons:** Does not satisfy live map context; lower operational value.

**Recommendation:** Only acceptable if product explicitly decides a textual/geometry summary is enough.

## Recommended Path

Implement Option B first as the smallest approved route-map architecture step, then consider Option A after phone screenshots prove the route form and map mode are stable. Option C should remain a fallback for offline or no-token states, not the main split-layout solution.

## Files

- Modify after approval: `frontend/src/features/map/MapView.jsx`
  - Own route map mode state, parent composition, and any class/data attributes needed by CSS.
- Modify after approval: `frontend/src/features/map/MapView.css`
  - Add phone-only layout rules for route map mode or parent-owned split slot.
- Modify after approval if panel controls are approved: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
  - Add only explicit parent callbacks such as `onOpenMapMode`; do not pass or use `mapRef`.
- Modify after approval if panel controls are approved: `frontend/src/features/route-briefing/RouteBriefing.css`
  - Style only the new control or phone-specific panel spacing.
- Test: `frontend/src/app/layout/layoutTokens.test.js`
  - Assert the chosen route map mode/split structure uses parent-owned map composition and does not add a fake placeholder selector.
- Artifacts: `artifacts/responsive-screenshots/route-briefing-split-layout/<timestamp>/`
  - Store phone route form, phone route map mode or split mode, tablet sanity, capture log, and review notes.

## Task 1: Approval Gate

- [ ] **Step 1: Choose one implementation option**

Use this decision table:

```text
Need live form + live map visible together -> Option A
Need safe phone map context with lower regression risk -> Option B
Need only route summary, not map context -> Option C
```

Expected: the user explicitly approves Option A, B, or C before production file changes.

- [ ] **Step 2: Confirm restricted-file scope**

Run:

```powershell
git status --short --branch
```

Expected: existing unrelated dirty/untracked files remain untouched. Do not edit `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` or `frontend/src/features/route-briefing/RouteBriefing.css` unless the approved option requires a panel control and the user explicitly approves those files.

## Task 2: Failing Structure Test

- [ ] **Step 1: Add a failing test**

For Option B, add this assertion to `frontend/src/app/layout/layoutTokens.test.js`:

```js
test('route briefing phone map mode is parent-owned and does not use a fake map placeholder', () => {
  const mapView = readFileSync(new URL('../../features/map/MapView.jsx', import.meta.url), 'utf8')
  const mapViewCss = readFileSync(new URL('../../features/map/MapView.css', import.meta.url), 'utf8')

  assert.match(mapView, /routeBriefingMapMode/)
  assert.match(mapView, /data-route-briefing-map-mode/)
  assert.match(mapViewCss, /@media \(max-width: 719px\)[^]*data-route-briefing-map-mode/)
  assert.doesNotMatch(mapView, /route-check-(fake|placeholder|preview-map)/i)
})
```

- [ ] **Step 2: Verify RED**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
```

Expected: FAIL because route map mode does not exist yet.

## Task 3: Parent-Owned Map Mode Implementation

- [ ] **Step 1: Add parent state**

In `frontend/src/features/map/MapView.jsx`, add route map mode state near route briefing state:

```jsx
const [routeBriefingMapMode, setRouteBriefingMapMode] = useState(false)
```

Add an effect to leave map mode when the route panel is closed:

```jsx
useEffect(() => {
  if (activePanel !== 'route-check') setRouteBriefingMapMode(false)
}, [activePanel])
```

- [ ] **Step 2: Add parent-owned mode attribute**

On the map wrapper element, add:

```jsx
data-route-briefing-map-mode={activePanel === 'route-check' && routeBriefingMapMode ? 'true' : 'false'}
```

Expected: the existing `.map-view` remains the only live Mapbox container.

- [ ] **Step 3: Add explicit controls**

If panel-file edits are approved, pass callbacks:

```jsx
onOpenMapMode={() => setRouteBriefingMapMode(true)}
onCloseMapMode={() => setRouteBriefingMapMode(false)}
isMapModeOpen={routeBriefingMapMode}
```

If panel-file edits are not approved, render a parent-owned route map mode button in `MapView.jsx` adjacent to the route panel conditional.

- [ ] **Step 4: Add phone-only CSS**

In `frontend/src/features/map/MapView.css`, under the phone breakpoint, hide non-map route panel chrome only when `data-route-briefing-map-mode="true"` and keep `.map-view` full viewport height.

Do not create selectors named `placeholder`, `fake-map`, or `preview-map`.

## Task 4: Verification And Review

- [ ] **Step 1: Verify GREEN**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
```

Expected: PASS.

- [ ] **Step 2: Capture screenshots**

Use the established server URLs:

```powershell
npm.cmd run dev --prefix backend
npm.cmd run dev --prefix frontend -- --host 127.0.0.1
```

Capture:

```text
390x844 route form
390x844 route map mode
820x1180 route panel sanity
```

Store under:

```text
artifacts/responsive-screenshots/route-briefing-split-layout/<YYYY-MM-DD_HHMM>/
```

- [ ] **Step 3: Read-only reviews**

Dispatch read-only reviewers:

```text
ui-qa-reviewer: check phone route map mode for overlap, hidden controls, horizontal scroll, and whether the live map remains useful.
spec-reviewer: confirm single Mapbox owner, no fake placeholder, and approved-file scope.
```

- [ ] **Step 4: Final verification**

Run:

```powershell
npm.cmd run test:layout --prefix frontend
npm.cmd run build --prefix frontend
npm.cmd run smoke:responsive --prefix frontend
```

Expected: all commands exit 0. Existing Vite chunk-size warning is acceptable if unchanged.

## Self-Review

- Spec coverage: covers all three candidate approaches, chooses a default recommendation, and preserves `MapView.jsx` as Mapbox owner.
- Placeholder scan: no task instructs a fake map placeholder.
- Scope check: production implementation is gated behind explicit user approval, especially for `RouteBriefingPanel.jsx` and `RouteBriefing.css`.
