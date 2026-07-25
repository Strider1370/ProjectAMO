# ETD/ETA Time-Aware Briefing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface the briefing's already-computed ETA-awareness in the UI (header ETD→ETA, ⑤ "ETA 기준 예보") and replace the year-cluttered native ETD input with a compact 월/일 + 시각 control that yields an auto-computed read-only ETA, with all times following the app-wide `useTimeZone()` (UTC/KST) setting.

**Architecture:** Frontend-only. The backend already composes the briefing at ETA (`taf-window.selectTafAtEta`/`alternateRequired`, `meta.etd`/`meta.eta` in payload) and the frontend already sends `{ etd, eta }`. We add one pure helper module (time build/format), store `etd` as a UTC ISO instant, expose a memoized planned distance for live ETA, and read those values in the form + briefing view. No payload/backend change.

**Tech Stack:** React 19, Vite, Node built-in test runner (`node --test` with `node:test`/`node:assert`), existing `computeEtaIso`, existing `useTimeZone()` context.

Spec: `docs/superpowers/specs/2026-06-27-etd-eta-time-aware-briefing-design.md`

---

## File Structure

- **Create** `frontend/src/features/route-briefing/lib/briefingTime.js` — pure time helpers: `buildEtdIso`, `etdFields`, `formatBriefingTime`. One responsibility: convert between a UTC ISO instant and tz-local wall-clock fields/labels.
- **Create** `frontend/src/features/route-briefing/lib/briefingTime.test.js` — unit tests for the helper.
- **Modify** `frontend/src/features/route-briefing/useRouteBriefing.js` — `etd` default becomes a UTC ISO instant; expose memoized `plannedDistanceNm` and reuse it in `handleGenerateBriefing` (DRY).
- **Modify** `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — custom ETD input (월/일 selects + `time` input) + read-only ETA, both desktop and mobile (shared `renderBriefingConditions`). Consumes `useTimeZone()`.
- **Modify** `frontend/src/features/route-briefing/RouteBriefing.css` — styles for the ETD/ETA controls.
- **Modify** `frontend/src/features/route-briefing/BriefingView.jsx` — header `ETD → ETA` line and ⑤ "ETA … 기준 예보" label, via `useTimeZone()` + `formatBriefingTime`.
- **Modify** `frontend/src/features/route-briefing/BriefingView.css` — style the header time line.

---

## Task 1: Time helper (`briefingTime.js`) — pure, TDD

**Files:**
- Create: `frontend/src/features/route-briefing/lib/briefingTime.js`
- Test: `frontend/src/features/route-briefing/lib/briefingTime.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildEtdIso, etdFields, formatBriefingTime } from './briefingTime.js'

test('buildEtdIso interprets wall-clock as UTC when tz=UTC', () => {
  assert.equal(buildEtdIso({ year: 2026, month: 6, day: 27, hour: 11, minute: 50 }, 'UTC'), '2026-06-27T11:50:00Z')
})
test('buildEtdIso interprets wall-clock as KST (UTC+9) when tz=KST', () => {
  // 11:50 KST == 02:50 UTC
  assert.equal(buildEtdIso({ year: 2026, month: 6, day: 27, hour: 11, minute: 50 }, 'KST'), '2026-06-27T02:50:00Z')
})
test('etdFields round-trips an ISO instant back to tz wall-clock', () => {
  assert.deepEqual(etdFields('2026-06-27T02:50:00Z', 'KST'), { year: 2026, month: 6, day: 27, hour: 11, minute: 50 })
  assert.deepEqual(etdFields('2026-06-27T11:50:00Z', 'UTC'), { year: 2026, month: 6, day: 27, hour: 11, minute: 50 })
})
test('formatBriefingTime renders compact tz label', () => {
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC'), '11:50Z')
  assert.equal(formatBriefingTime('2026-06-27T02:50:00Z', 'KST'), '11:50 KST')
  assert.equal(formatBriefingTime('2026-06-27T11:50:00Z', 'UTC', { withDate: true }), '06-27 11:50Z')
})
test('formatBriefingTime returns dash on invalid input', () => {
  assert.equal(formatBriefingTime(null, 'UTC'), '—')
  assert.equal(formatBriefingTime('nope', 'KST'), '—')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/route-briefing/lib/briefingTime.test.js`
Expected: FAIL — `Cannot find module './briefingTime.js'` (or export not defined).

- [ ] **Step 3: Write minimal implementation**

```js
const HOUR_MS = 3600 * 1000
const KST_OFFSET_MS = 9 * HOUR_MS

function pad2(n) { return String(n).padStart(2, '0') }

// Build a UTC ISO instant from wall-clock fields interpreted in tz ('UTC' | 'KST').
export function buildEtdIso({ year, month, day, hour, minute }, tz) {
  const y = Number.isFinite(year) ? year : new Date().getUTCFullYear()
  const utcMs = Date.UTC(y, month - 1, day, hour, minute, 0)
  const instant = tz === 'KST' ? utcMs - KST_OFFSET_MS : utcMs
  return new Date(instant).toISOString().replace('.000Z', 'Z')
}

// Decompose a UTC ISO instant into tz wall-clock fields (for the input).
export function etdFields(iso, tz) {
  const t = Date.parse(iso)
  const base = Number.isFinite(t) ? t : Date.now()
  const d = new Date(tz === 'KST' ? base + KST_OFFSET_MS : base)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() }
}

// Compact time label in tz. withDate prepends 'MM-DD '.
export function formatBriefingTime(iso, tz, { withDate = false } = {}) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const d = new Date(tz === 'KST' ? t + KST_OFFSET_MS : t)
  const hm = `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`
  const label = tz === 'KST' ? `${hm} KST` : `${hm}Z`
  return withDate ? `${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${label}` : label
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/features/route-briefing/lib/briefingTime.test.js`
Expected: PASS — all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/lib/briefingTime.js frontend/src/features/route-briefing/lib/briefingTime.test.js
git commit -m "feat(briefing): add briefingTime tz helper (build/format ETD-ETA)"
```

---

## Task 2: `etd` as UTC ISO + memoized `plannedDistanceNm`

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

- [ ] **Step 1: Change the `etd` default to a UTC ISO instant**

Replace (currently ~lines 75-79):

```js
  const [etd, setEtd] = useState(() => {
    // datetime-local expects local wall-clock; toISOString() is UTC, so offset back to local first.
    const now = new Date()
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  })
```

with:

```js
  const [etd, setEtd] = useState(() => {
    // Absolute UTC instant; the ETD field renders/edits it in the app timezone.
    const d = new Date()
    d.setUTCSeconds(0, 0)
    return d.toISOString().replace('.000Z', 'Z')
  })
```

- [ ] **Step 2: Add a memoized `plannedDistanceNm` derived value**

Confirm `useMemo` is imported at the top of the file (`import { ..., useMemo } from 'react'`). If not present, add it.

Add this near the other derived computations (after `selectedIap` is available; place just above `handleGenerateBriefing`):

```js
  const plannedDistanceNm = useMemo(() => {
    if (!routeResult) return 0
    return routeForm.flightRule === 'VFR'
      ? calcVfrDistance(vfrWaypoints)
      : (buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })?.totalDistanceNm
          || Number(routeResult?.distanceNm) || 0)
  }, [routeResult, routeForm.flightRule, vfrWaypoints, selectedSid, selectedStar, selectedIap])
```

(`calcVfrDistance` and `buildIfrDistanceBreakdown` are already imported in this file.)

- [ ] **Step 3: Reuse `plannedDistanceNm` in `handleGenerateBriefing` (DRY)**

Replace the inline distance block (currently ~lines 611-615):

```js
    const distanceNm = routeForm.flightRule === 'VFR'
      ? calcVfrDistance(vfrWaypoints)
      : (buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })?.totalDistanceNm
          || Number(routeResult?.distanceNm) || 0)
```

with:

```js
    const distanceNm = plannedDistanceNm
```

- [ ] **Step 4: Expose `plannedDistanceNm` to consumers**

In the returned `derived` object (the block that currently returns `isFirInMode, isFirExitMode, selectedIap, visibleSidOptions`), add `plannedDistanceNm`:

```js
    derived: {
      isFirInMode,
      isFirExitMode,
      selectedIap,
      visibleSidOptions,
      plannedDistanceNm,
    },
```

- [ ] **Step 5: Verify generation still works (regression)**

Ensure the dev servers are running (`npm run dev:serve`).
Run: `node frontend/scripts/briefing-smoke.mjs`
Expected: JSON with `"ok": true`, `navActiveEnrouteOnClick: true`, `inlineCrossSection.present: true`. (Briefing still generates; ETD now stored as ISO.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "refactor(briefing): store etd as UTC ISO; expose memoized plannedDistanceNm"
```

---

## Task 3: Custom ETD input + read-only ETA (form)

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Add imports**

At the top of `RouteBriefingPanel.jsx`, add:

```js
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { computeEtaIso } from './lib/etaCalc.js'
import { buildEtdIso, etdFields, formatBriefingTime } from './lib/briefingTime.js'
```

- [ ] **Step 2: Read tz, ETD fields, and computed ETA inside the component**

Inside `RouteBriefingPanel(...)`, after `const isMobile = useIsMobile()`, add:

```js
  const { tz } = useTimeZone()
  const etdParts = etdFields(etd, tz)
  const etaIso = computeEtaIso(etd, derived.plannedDistanceNm, cruiseSpeedKt)
  const setEtdPart = (patch) => setEtd(buildEtdIso({ ...etdParts, ...patch }, tz))
```

(`etd`, `cruiseSpeedKt`, `setEtd` are already destructured from `state`/`actions`; `derived` is a prop.)

- [ ] **Step 3: Replace the ETD field inside `renderBriefingConditions`**

In `renderBriefingConditions`, replace the ETD `<label>` block:

```js
        <label>{'ETD'}
          <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} />
        </label>
```

with the custom 월/일 + 시각 control plus a read-only ETA:

```js
        <div className="route-check-field">
          <div className="route-check-field-label">{`ETD (${tz})`}</div>
          <div className="etd-input">
            <select value={etdParts.month} onChange={(e) => setEtdPart({ month: Number(e.target.value) })} aria-label="출발 월">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
            </select>
            <select value={etdParts.day} onChange={(e) => setEtdPart({ day: Number(e.target.value) })} aria-label="출발 일">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
            </select>
            <input
              type="time"
              value={`${String(etdParts.hour).padStart(2, '0')}:${String(etdParts.minute).padStart(2, '0')}`}
              onChange={(e) => {
                const [h, mi] = e.target.value.split(':').map(Number)
                if (Number.isFinite(h) && Number.isFinite(mi)) setEtdPart({ hour: h, minute: mi })
              }}
              aria-label="출발 시각"
            />
          </div>
          <div className="eta-readout">{'ETA'} <strong>{etaIso ? formatBriefingTime(etaIso, tz, { withDate: etaIso.slice(0, 10) !== etd.slice(0, 10) }) : '—'}</strong></div>
        </div>
```

- [ ] **Step 4: Style the ETD/ETA controls**

Append to `RouteBriefing.css`:

```css
.etd-input { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 6px; }
.etd-input select,
.etd-input input {
  height: 36px;
  padding: 0 8px;
  border: 1px solid rgba(148, 163, 184, 0.58);
  border-radius: 7px;
  background: #ffffff;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
}
.eta-readout { margin-top: 6px; font-size: 11px; font-weight: 800; color: #64748b; }
.eta-readout strong { color: #0f172a; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 5: Build and visually verify (desktop + mobile)**

Run: `npm --prefix frontend run build`
Expected: `✓ built in …` (no errors).

With dev servers running, capture the form (desktop and mobile) and confirm: ETD shows `월/일 + 시각` (no year), `ETD (UTC)` or `(KST)` label matches the app setting, and `ETA —` before a route / a computed time after a route. (Reuse the capture approach from the session, e.g. open 비행 전 브리핑, select RKSS→RKPC, 자동검색, 검색, read the ETA line.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(briefing): custom 월/일+시각 ETD input with auto-computed read-only ETA"
```

---

## Task 4: Surface ETD→ETA + "ETA 기준" in the briefing view

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Modify: `frontend/src/features/route-briefing/BriefingView.css`

- [ ] **Step 1: Add imports + tz**

At the top of `BriefingView.jsx`, add:

```js
import { useTimeZone } from '../../shared/timezone/TimeZoneContext.jsx'
import { formatBriefingTime } from './lib/briefingTime.js'
```

Inside `BriefingView(...)`, after `const isMobile = useIsMobile()`, add:

```js
  const { tz } = useTimeZone()
```

- [ ] **Step 2: Build a reusable ETD→ETA time line**

After `const { meta, summary, sections } = briefing`, add:

```js
  const etdEtaLine = (meta.etd || meta.eta)
    ? `ETD ${formatBriefingTime(meta.etd, tz)} → ETA ${formatBriefingTime(meta.eta, tz, { withDate: (meta.eta || '').slice(0, 10) !== (meta.etd || '').slice(0, 10) })}`
    : null
```

- [ ] **Step 3: Show it in the desktop header**

In the desktop `return`, replace the `.bv-meta` line:

```js
          <div className="bv-meta">{meta.alternateAirport ? `교체 ${meta.alternateAirport}` : '단일 목적지'}</div>
```

with:

```js
          <div className="bv-meta">{meta.alternateAirport ? `교체 ${meta.alternateAirport}` : '단일 목적지'}</div>
          {etdEtaLine && <div className="bv-time">{etdEtaLine}</div>}
```

- [ ] **Step 4: Show it in the mobile sheet body**

In the mobile branch, insert the time line at the top of `.bv-mobile`, right before `{navEl}`:

```js
        <div className="bv-mobile" ref={containerRef}>
          {etdEtaLine && <div className="bv-time">{etdEtaLine}</div>}
          {navEl}
```

- [ ] **Step 5: Label the ⑤ destination TAF as ETA-based**

In `destinationSection`, replace:

```js
      {sections.destination.taf
        ? <p>{sections.destination.taf.time} · {sections.destination.taf.clouds} · {sections.destination.taf.category}</p>
        : <p className="bv-muted">TAF 없음</p>}
```

with:

```js
      {sections.destination.taf
        ? <p><b>ETA {formatBriefingTime(meta.eta, tz)} 기준 예보</b> · {sections.destination.taf.clouds} · {sections.destination.taf.category}</p>
        : <p className="bv-muted">TAF 없음</p>}
```

- [ ] **Step 6: Style the time line**

Append to `BriefingView.css`:

```css
.bv-time { font-size: 12px; font-weight: 800; color: #1d4ed8; font-variant-numeric: tabular-nums; margin-top: 3px; }
.bv-mobile .bv-time { margin: 0 0 var(--space-2); }
```

- [ ] **Step 7: Build + smoke + capture**

Run: `npm --prefix frontend run build`
Expected: `✓ built in …`.

Run: `node frontend/scripts/briefing-smoke.mjs`
Expected: `"ok": true` (sections/cross-section/nav unchanged).

Capture desktop + mobile briefing and confirm: header shows `ETD … → ETA …` in the app tz, and ⑤ 목적지 shows `ETA … 기준 예보 · …`. Toggle the app UTC/KST setting and confirm times reformat.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css
git commit -m "feat(briefing): surface ETD→ETA in header and ETA-based label on ⑤ destination"
```

---

## Task 5: Final verification + push

- [ ] **Step 1: Run the helper unit tests**

Run: `node --test frontend/src/features/route-briefing/lib/briefingTime.test.js frontend/src/features/route-briefing/lib/etaCalc.test.js`
Expected: all PASS.

- [ ] **Step 2: Production build**

Run: `npm --prefix frontend run build`
Expected: `✓ built`.

- [ ] **Step 3: Desktop smoke**

Run: `node frontend/scripts/briefing-smoke.mjs`
Expected: `"ok": true`, cross-section present, nav active.

- [ ] **Step 4: Push**

```bash
git push
```

---

## Self-Review (completed during planning)

- **Spec coverage:** ETA auto read-only (Task 3) ✓ · 월/일+시각 no-year ETD (Task 3) ✓ · `useTimeZone()` everywhere (Tasks 3-4 via `formatBriefingTime`/label) ✓ · header ETD→ETA (Task 4) ✓ · ⑤ "ETA 기준 예보" + existing alternate reason (Task 4; alternate line already rendered) ✓ · no backend/payload change (read-only of `meta.etd/eta`, `destination.taf`) ✓.
- **Placeholders:** none — every step has concrete code/commands.
- **Type consistency:** helper exports `buildEtdIso`/`etdFields`/`formatBriefingTime` used with identical signatures across Tasks 1, 3, 4; `derived.plannedDistanceNm` defined in Task 2 and consumed in Task 3.
- **Edge cases:** ETA `—` before route (Task 3 ternary) · invalid time → `—` (helper) · TAF 없음 retained (Task 4).
