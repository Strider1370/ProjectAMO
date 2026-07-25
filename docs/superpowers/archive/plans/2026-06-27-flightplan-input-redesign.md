# Flight-Plan Input Redesign (Performance + ETD) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace curated presets with direct TAS/altitude input + named "내 항공기" profiles, drop ETE (ETA-only derived summary), and give ETD platform-specific entry (desktop typed, mobile wheel + today/tomorrow + relative chips), with ft/FL altitude + VFR hint and a mobile 3-step wizard.

**Architecture:** Frontend-only. Two pure helper modules (profiles via injectable storage, altitude format/VFR) are unit-tested with `node --test`. New `EtdField` and `AircraftProfileField` components compose into `RouteBriefingPanel` (desktop one-screen form; mobile 3-step `MobileSheet` wizard). Reuses the shipped `briefingTime`, `computeEtaIso`, `derived.plannedDistanceNm`, and `useTimeZone`. No backend/payload change.

**Tech Stack:** React 19, Vite, Node test runner (`node:test`/`node:assert`), localStorage, existing `MobileSheet`/`AirportPickerField`.

Spec: `docs/superpowers/specs/2026-06-27-flightplan-input-redesign-design.md`

---

## File Structure

- **Create** `frontend/src/features/route-briefing/lib/aircraftProfiles.js` — localStorage CRUD for named profiles + last-used perf, with an injectable storage for tests.
- **Create** `frontend/src/features/route-briefing/lib/aircraftProfiles.test.js`
- **Create** `frontend/src/features/route-briefing/lib/altitude.js` — `formatAltitude`, `stepAltitude`, `vfrCruiseHint`, `initialBearingDeg`.
- **Create** `frontend/src/features/route-briefing/lib/altitude.test.js`
- **Create** `frontend/src/features/route-briefing/EtdField.jsx` — ETD entry, `variant="desktop"|"mobile"`.
- **Create** `frontend/src/features/route-briefing/AircraftProfileField.jsx` — load/save named profiles + direct TAS/altitude inputs.
- **Modify** `frontend/src/features/route-briefing/useRouteBriefing.js` — load last-used perf into cruiseSpeedKt/cruiseAltitudeFt defaults; expose `magCourseDeg` derived (dep→arr).
- **Modify** `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — desktop layout (profile + perf/time + summary strip, ETE removed), mobile 3-step wizard.
- **Modify** `frontend/src/features/route-briefing/RouteBriefing.css` — styles.

---

## Task 1: `aircraftProfiles.js` (injectable storage) — TDD

**Files:**
- Create: `frontend/src/features/route-briefing/lib/aircraftProfiles.js`
- Test: `frontend/src/features/route-briefing/lib/aircraftProfiles.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { listProfiles, saveProfile, deleteProfile, getLastUsed, setLastUsed } from './aircraftProfiles.js'

function fakeStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}

test('save/list/delete named profiles round-trips', () => {
  const s = fakeStore()
  assert.deepEqual(listProfiles(s), [])
  saveProfile({ name: '세스나 172', tasKt: 120, altitudeFt: 9000 }, s)
  saveProfile({ name: 'TBM', tasKt: 250, altitudeFt: 20000 }, s)
  assert.deepEqual(listProfiles(s).map((p) => p.name), ['세스나 172', 'TBM'])
  // saving same name updates, not duplicates
  saveProfile({ name: '세스나 172', tasKt: 110, altitudeFt: 8000 }, s)
  assert.equal(listProfiles(s).length, 2)
  assert.equal(listProfiles(s).find((p) => p.name === '세스나 172').tasKt, 110)
  deleteProfile('TBM', s)
  assert.deepEqual(listProfiles(s).map((p) => p.name), ['세스나 172'])
})

test('last-used perf round-trips and tolerates empty', () => {
  const s = fakeStore()
  assert.equal(getLastUsed(s), null)
  setLastUsed({ tasKt: 140, altitudeFt: 7500 }, s)
  assert.deepEqual(getLastUsed(s), { tasKt: 140, altitudeFt: 7500 })
})

test('listProfiles tolerates corrupt storage', () => {
  const s = fakeStore()
  s.setItem('amo_aircraft_profiles', 'not json')
  assert.deepEqual(listProfiles(s), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/route-briefing/lib/aircraftProfiles.test.js`
Expected: FAIL — `Cannot find module './aircraftProfiles.js'`.

- [ ] **Step 3: Write minimal implementation**

```js
const PROFILES_KEY = 'amo_aircraft_profiles'
const LAST_KEY = 'amo_last_perf'

function memStore() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }
}
const fallback = memStore()
function store(s) {
  if (s) return s
  return typeof localStorage !== 'undefined' ? localStorage : fallback
}
function readJson(s, key, dflt) {
  try {
    const raw = store(s).getItem(key)
    return raw ? JSON.parse(raw) : dflt
  } catch { return dflt }
}

export function listProfiles(s) {
  const list = readJson(s, PROFILES_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveProfile({ name, tasKt, altitudeFt }, s) {
  const list = listProfiles(s).filter((p) => p.name !== name)
  list.push({ name, tasKt: Number(tasKt), altitudeFt: Number(altitudeFt) })
  store(s).setItem(PROFILES_KEY, JSON.stringify(list))
  return list
}

export function deleteProfile(name, s) {
  const list = listProfiles(s).filter((p) => p.name !== name)
  store(s).setItem(PROFILES_KEY, JSON.stringify(list))
  return list
}

export function getLastUsed(s) {
  return readJson(s, LAST_KEY, null)
}

export function setLastUsed({ tasKt, altitudeFt }, s) {
  const perf = { tasKt: Number(tasKt), altitudeFt: Number(altitudeFt) }
  store(s).setItem(LAST_KEY, JSON.stringify(perf))
  return perf
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/features/route-briefing/lib/aircraftProfiles.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/lib/aircraftProfiles.js frontend/src/features/route-briefing/lib/aircraftProfiles.test.js
git commit -m "feat(briefing): aircraft profile + last-used perf storage (injectable)"
```

---

## Task 2: `altitude.js` (format / step / VFR hint / bearing) — TDD

**Files:**
- Create: `frontend/src/features/route-briefing/lib/altitude.js`
- Test: `frontend/src/features/route-briefing/lib/altitude.test.js`

Note: Korea (RKRR FIR) transition altitude is **14,000 ft** — at/above it, display flight levels; below, feet. Magnetic variation in Korea ≈ **8° W**, so magnetic course = true course + 8 (mod 360). These are encoded as constants `TRANSITION_FT` and `MAG_VAR_DEG`.

- [ ] **Step 1: Write the failing test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatAltitude, stepAltitude, vfrCruiseHint, initialBearingDeg } from './altitude.js'

test('formatAltitude shows feet below transition, FL at/above', () => {
  assert.equal(formatAltitude(9000), '9,000 ft')
  assert.equal(formatAltitude(13500), '13,500 ft')
  assert.equal(formatAltitude(14000), 'FL140')
  assert.equal(formatAltitude(18000), 'FL180')
})

test('stepAltitude snaps to 500-ft grid and clamps at 0', () => {
  assert.equal(stepAltitude(9000, 1), 9500)
  assert.equal(stepAltitude(9000, -1), 8500)
  assert.equal(stepAltitude(9200, 1), 9500)
  assert.equal(stepAltitude(0, -1), 0)
})

test('vfrCruiseHint picks odd/even by magnetic course', () => {
  assert.match(vfrCruiseHint(90), /홀수/)   // eastbound 0-179
  assert.match(vfrCruiseHint(200), /짝수/)  // westbound 180-359
})

test('initialBearingDeg is ~180 for due-south leg', () => {
  // RKSS(37.55,126.79) -> roughly south to RKPC(33.51,126.49)
  const b = initialBearingDeg(37.55, 126.79, 33.51, 126.49)
  assert.ok(b > 175 && b < 190, `expected ~south, got ${b}`)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test frontend/src/features/route-briefing/lib/altitude.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
const TRANSITION_FT = 14000
const MAG_VAR_DEG = 8 // Korea ~8°W; magnetic = true + west variation

export function formatAltitude(ft) {
  const n = Number(ft)
  if (!Number.isFinite(n)) return '—'
  if (n >= TRANSITION_FT) return `FL${Math.round(n / 100)}`
  return `${Math.round(n).toLocaleString()} ft`
}

export function stepAltitude(ft, dir) {
  const base = Math.round(Number(ft) / 500) * 500
  return Math.max(0, base + dir * 500)
}

export function vfrCruiseHint(magCourseDeg) {
  const c = ((Number(magCourseDeg) % 360) + 360) % 360
  return c < 180
    ? 'VFR 권장: 홀수천 + 500 ft (예: 9,500)'
    : 'VFR 권장: 짝수천 + 500 ft (예: 8,500)'
}

export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180
  const φ1 = toRad(lat1); const φ2 = toRad(lat2); const Δλ = toRad(lon2 - lon1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

export function magneticCourse(trueCourseDeg) {
  return ((Number(trueCourseDeg) + MAG_VAR_DEG) % 360 + 360) % 360
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test frontend/src/features/route-briefing/lib/altitude.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/lib/altitude.js frontend/src/features/route-briefing/lib/altitude.test.js
git commit -m "feat(briefing): altitude format/step + VFR hint + bearing helpers"
```

---

## Task 3: `EtdField.jsx` (desktop typed / mobile wheel + chips)

**Files:**
- Create: `frontend/src/features/route-briefing/EtdField.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` (use it in `renderBriefingConditions` and mobile body)
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Create `EtdField.jsx`**

```jsx
import { buildEtdIso, etdFields } from './lib/briefingTime.js'

const RELATIVE = [['지금', 0], ['+30분', 30], ['+1시간', 60], ['+2시간', 120]]

function nowPlusIso(minutes) {
  const d = new Date(Date.now() + minutes * 60000)
  d.setUTCSeconds(0, 0)
  return d.toISOString().replace('.000Z', 'Z')
}

export default function EtdField({ etd, tz, variant, onChange }) {
  const f = etdFields(etd, tz)
  const setPart = (patch) => onChange(buildEtdIso({ ...f, ...patch }, tz))
  const timeValue = `${String(f.hour).padStart(2, '0')}:${String(f.minute).padStart(2, '0')}`
  const onTime = (e) => {
    const [h, mi] = e.target.value.split(':').map(Number)
    if (Number.isFinite(h) && Number.isFinite(mi)) setPart({ hour: h, minute: mi })
  }
  const chips = (
    <div className="etd-chips">
      {RELATIVE.map(([label, mins]) => (
        <button key={label} type="button" className="etd-chip" onClick={() => onChange(nowPlusIso(mins))}>{label}</button>
      ))}
    </div>
  )

  if (variant === 'mobile') {
    const today = etdFields(nowPlusIso(0), tz)
    const isTomorrow = f.day !== today.day
    return (
      <div className="etd-field etd-field--mobile">
        <div className="etd-day-chips">
          <button type="button" className={`etd-chip${!isTomorrow ? ' is-active' : ''}`} onClick={() => setPart({ month: today.month, day: today.day })}>오늘</button>
          <button type="button" className={`etd-chip${isTomorrow ? ' is-active' : ''}`} onClick={() => { const t = etdFields(nowPlusIso(24 * 60), tz); setPart({ month: t.month, day: t.day }) }}>내일</button>
        </div>
        <input className="etd-time-wheel" type="time" value={timeValue} onChange={onTime} aria-label="출발 시각" />
        {chips}
      </div>
    )
  }

  return (
    <div className="etd-field etd-field--desktop">
      <div className="etd-row">
        <select value={f.month} onChange={(e) => setPart({ month: Number(e.target.value) })} aria-label="출발 월">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}월</option>)}
        </select>
        <select value={f.day} onChange={(e) => setPart({ day: Number(e.target.value) })} aria-label="출발 일">
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}일</option>)}
        </select>
        <input className="etd-time-typed" type="time" value={timeValue} onChange={onTime} aria-label="출발 시각" />
      </div>
      {chips}
    </div>
  )
}
```

- [ ] **Step 2: Use `EtdField` in the form**

In `RouteBriefingPanel.jsx`, add `import EtdField from './EtdField.jsx'` near the other imports.

In `renderBriefingConditions`, replace the entire `<div className="route-check-field route-check-field--etd"> … </div>` block (the custom month/day/time + ETA from the prior feature) with:

```jsx
        <div className="route-check-field route-check-field--etd">
          <div className="route-check-field-label">{`ETD (${tz})`}</div>
          <EtdField etd={etd} tz={tz} variant={isMobile ? 'mobile' : 'desktop'} onChange={setEtd} />
        </div>
```

(The read-only ETA moves into the summary strip in Task 5; remove the old `.eta-readout` line here.)

- [ ] **Step 3: Style the ETD field**

Append to `RouteBriefing.css`:

```css
.etd-field { display: grid; gap: 7px; }
.etd-row { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: 6px; }
.etd-field select, .etd-field input[type="time"] {
  height: 36px; padding: 0 8px; border: 1px solid rgba(148,163,184,0.58);
  border-radius: 7px; background: #fff; color: #0f172a; font-size: 13px; font-weight: 700;
}
.etd-chips, .etd-day-chips { display: flex; gap: 5px; }
.etd-day-chips { margin-bottom: 1px; }
.etd-chip { border: 0; border-radius: 999px; padding: 5px 12px; background: #eef2f7;
  color: #475569; font-size: 11px; font-weight: 800; cursor: pointer; }
.etd-chip.is-active { background: #eff6ff; color: #2563eb; }
.etd-field--mobile .etd-time-wheel { width: 100%; }
```

- [ ] **Step 4: Build and verify (desktop + mobile)**

Run: `npm --prefix frontend run build`
Expected: `✓ built`.

With dev servers running, capture the form on desktop (month/day selects + typed time + 지금/+30분/+1시간/+2시간 chips) and at 390px (오늘/내일 chips + native time wheel + chips). Confirm tapping a chip changes ETD.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/EtdField.jsx frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(briefing): EtdField with desktop-typed / mobile-wheel + relative chips"
```

---

## Task 4: `AircraftProfileField.jsx` + last-used defaults

**Files:**
- Create: `frontend/src/features/route-briefing/AircraftProfileField.jsx`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Default cruise speed/altitude from last-used**

In `useRouteBriefing.js`, add `import { getLastUsed } from './lib/aircraftProfiles.js'` at the top.

Replace the `cruiseSpeedKt` initializer:

```js
  const [cruiseSpeedKt, setCruiseSpeedKt] = useState(120)
```

with:

```js
  const [cruiseSpeedKt, setCruiseSpeedKt] = useState(() => getLastUsed()?.tasKt ?? 120)
```

Find the `cruiseAltitudeFt` state initializer in this file (search `cruiseAltitudeFt`). It is initialized from `DEFAULT_CRUISE_ALTITUDE_FT`. Change it to prefer last-used:

```js
  const [cruiseAltitudeFt, setCruiseAltitudeFt] = useState(() => getLastUsed()?.altitudeFt ?? DEFAULT_CRUISE_ALTITUDE_FT)
```

- [ ] **Step 2: Expose dep→arr magnetic course for the VFR hint**

In `useRouteBriefing.js`, add `import { initialBearingDeg, magneticCourse } from './lib/altitude.js'`.

Add a memoized derived value near `plannedDistanceNm`:

```js
  const magCourseDeg = useMemo(() => {
    const dep = airports.find((a) => a.icao === routeForm.departureAirport)
    const arr = airports.find((a) => a.icao === routeForm.arrivalAirport)
    if (!dep || !arr || !Number.isFinite(dep.lat) || !Number.isFinite(arr.lat)) return null
    return magneticCourse(initialBearingDeg(dep.lat, dep.lon, arr.lat, arr.lon))
  }, [airports, routeForm.departureAirport, routeForm.arrivalAirport])
```

Add `magCourseDeg` to the returned `derived` object (alongside `plannedDistanceNm`).

(Note: `airports` is already a parameter of `useRouteBriefing`. Confirm each airport has `lat`/`lon`; the VFR waypoint altitude code in this file already reads airport coordinates.)

- [ ] **Step 3: Create `AircraftProfileField.jsx`**

```jsx
import { useState } from 'react'
import { listProfiles, saveProfile, deleteProfile, setLastUsed } from './lib/aircraftProfiles.js'
import { formatAltitude, stepAltitude, vfrCruiseHint } from './lib/altitude.js'

export default function AircraftProfileField({ tasKt, altitudeFt, magCourseDeg, onChange }) {
  const [profiles, setProfiles] = useState(() => listProfiles())
  const [open, setOpen] = useState(false)

  const apply = (tas, alt) => { onChange({ tasKt: tas, altitudeFt: alt }); setLastUsed({ tasKt: tas, altitudeFt: alt }) }
  const pick = (p) => { apply(p.tasKt, p.altitudeFt); setOpen(false) }
  const onSave = () => {
    const name = window.prompt('항공기 이름')
    if (!name) return
    setProfiles(saveProfile({ name, tasKt: tasKt, altitudeFt: altitudeFt }))
  }
  const onDelete = (name) => setProfiles(deleteProfile(name))

  return (
    <div className="acp">
      <div className="acp-head">
        <button type="button" className="acp-select" onClick={() => setOpen((o) => !o)}>
          <span className="acp-label">내 항공기</span>
          <span className="acp-value">{tasKt}kt · {formatAltitude(altitudeFt)} ▾</span>
        </button>
        <button type="button" className="acp-save" onClick={onSave}>저장</button>
      </div>
      {open && (
        <div className="acp-list">
          {profiles.length === 0 && <div className="acp-empty">저장된 항공기 없음</div>}
          {profiles.map((p) => (
            <div key={p.name} className="acp-item">
              <button type="button" className="acp-item-pick" onClick={() => pick(p)}>{p.name} <span>{p.tasKt}kt · {formatAltitude(p.altitudeFt)}</span></button>
              <button type="button" className="acp-item-del" onClick={() => onDelete(p.name)} aria-label="삭제">×</button>
            </div>
          ))}
        </div>
      )}
      <div className="acp-perf">
        <label className="acp-field">
          <span>순항속도 (TAS)</span>
          <input type="number" min="1" step="1" value={tasKt} onChange={(e) => apply(Number(e.target.value), altitudeFt)} />
          <em>kt</em>
        </label>
        <label className="acp-field">
          <span>순항고도</span>
          <div className="acp-alt">
            <input type="number" min="0" step="500" value={altitudeFt} onChange={(e) => apply(tasKt, Number(e.target.value))} />
            <span className="acp-alt-fmt">{formatAltitude(altitudeFt)}</span>
            <span className="acp-step">
              <button type="button" onClick={() => apply(tasKt, stepAltitude(altitudeFt, 1))} aria-label="고도 올림">▲</button>
              <button type="button" onClick={() => apply(tasKt, stepAltitude(altitudeFt, -1))} aria-label="고도 내림">▼</button>
            </span>
          </div>
        </label>
      </div>
      {magCourseDeg != null && <div className="acp-hint">{vfrCruiseHint(magCourseDeg)}</div>}
    </div>
  )
}
```

- [ ] **Step 4: Style the profile field**

Append to `RouteBriefing.css`:

```css
.acp { display: grid; gap: 8px; }
.acp-head { display: flex; align-items: center; gap: 8px; }
.acp-select { flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  border: 1px solid #e7ebf2; border-radius: 10px; background: #fff; padding: 7px 11px; cursor: pointer; }
.acp-label { font-size: 10px; font-weight: 800; color: #94a3b8; }
.acp-value { font-size: 14px; font-weight: 850; color: #0f172a; }
.acp-save { border: 0; background: transparent; color: #2563eb; font-size: 11px; font-weight: 800; cursor: pointer; }
.acp-list { border: 1px solid #e7ebf2; border-radius: 10px; background: #fff; padding: 4px; }
.acp-empty { font-size: 12px; color: #94a3b8; padding: 8px; }
.acp-item { display: flex; align-items: center; }
.acp-item-pick { flex: 1; text-align: left; border: 0; background: transparent; padding: 8px; font-size: 13px; font-weight: 800; color: #0f172a; cursor: pointer; }
.acp-item-pick span { color: #94a3b8; font-weight: 600; }
.acp-item-del { border: 0; background: transparent; color: #c0291f; font-size: 16px; cursor: pointer; padding: 0 8px; }
.acp-perf { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.acp-field { display: grid; gap: 4px; font-size: 10px; font-weight: 800; color: #94a3b8; position: relative; }
.acp-field input { height: 36px; padding: 0 8px; border: 1px solid rgba(148,163,184,0.58); border-radius: 7px; font-size: 14px; font-weight: 800; color: #0f172a; }
.acp-field em { position: absolute; right: 10px; bottom: 9px; font-style: normal; font-size: 11px; color: #94a3b8; }
.acp-alt { position: relative; }
.acp-alt-fmt { position: absolute; right: 30px; bottom: 9px; font-size: 11px; font-weight: 700; color: #64748b; }
.acp-step { position: absolute; right: 6px; bottom: 5px; display: flex; flex-direction: column; line-height: .7; }
.acp-step button { border: 0; background: transparent; color: #94a3b8; font-size: 10px; cursor: pointer; }
.acp-hint { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; color: #92400e;
  background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 6px 10px; }
```

- [ ] **Step 5: Build (component compiles; wired into the panel in Task 5)**

Run: `npm --prefix frontend run build`
Expected: `✓ built` (the new component is imported in Task 5; verify no syntax errors by temporarily importing it, or proceed to Task 5 which wires it).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/route-briefing/AircraftProfileField.jsx frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(briefing): aircraft profile field + last-used perf defaults + dep→arr course"
```

---

## Task 5: Desktop layout — profile + perf/time + summary strip (drop ETE/old ETA line)

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Imports + derived ETA/summary in the component**

In `RouteBriefingPanel.jsx`, add:

```jsx
import AircraftProfileField from './AircraftProfileField.jsx'
```

`computeEtaIso`, `formatBriefingTime` are already imported (from the prior ETD feature). Inside the component, after `const etaIso = computeEtaIso(...)`, the summary line uses tz:

```jsx
  const applyPerf = ({ tasKt, altitudeFt }) => { setCruiseSpeedKt(tasKt); setCruiseAltitudeFt(altitudeFt) }
  const summaryStrip = (
    <div className="rb-summary">
      <div className="rb-summary-dist"><span>거리</span><strong>{Math.round(derived.plannedDistanceNm)}<em>NM</em></strong></div>
      <div className="rb-summary-time"><span>ETD → ETA</span><strong>{formatBriefingTime(etd, tz)} → {etaIso ? formatBriefingTime(etaIso, tz) : '—'}</strong></div>
    </div>
  )
```

(`setCruiseAltitudeFt` is in `actions`; ensure it is destructured — it already is, used by the existing 순항고도 input.)

- [ ] **Step 2: Replace the 브리핑 조건 section body (desktop) with profile + ETD + summary**

In `renderBriefingConditions`, replace the `route-check-section-grid` (교체공항 + ETD + 순항속도) and the standalone `순항고도`/`순항속도` handling so the section becomes:

```jsx
  const renderBriefingConditions = (showGenerate) => (
    <div className="route-check-section route-check-section--briefing">
      <div className="route-check-section-title">{'브리핑 조건'}</div>
      <AircraftProfileField
        tasKt={cruiseSpeedKt}
        altitudeFt={Number(cruiseAltitudeFt) || 0}
        magCourseDeg={derived.magCourseDeg}
        onChange={applyPerf}
      />
      <label className="rb-altn">{'교체 공항'}
        <select value={alternateAirport} onChange={(e) => setAlternateAirport(e.target.value)}>
          <option value="">{'-- 없음 --'}</option>
          {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
        </select>
      </label>
      <div className="route-check-field">
        <div className="route-check-field-label">{`ETD (${tz})`}</div>
        <EtdField etd={etd} tz={tz} variant={isMobile ? 'mobile' : 'desktop'} onChange={setEtd} />
      </div>
      {summaryStrip}
      {showGenerate && (
        <button className="route-check-search-button" type="button" onClick={handleGenerateBriefing} disabled={!routeResult || briefingLoading}>
          {briefingLoading ? '브리핑 생성 중...' : '브리핑 생성'}
        </button>
      )}
      {briefingError && <div className="route-check-error">{briefingError}</div>}
    </div>
  )
```

This removes the old 2-col grid (and the separate 순항고도/순항속도 — now inside `AircraftProfileField`) and the old `.eta-readout`. (The `vertical-profile-control` 순항고도(ft) input that drives the inline cross-section in `resultsBlock` is separate and stays.)

- [ ] **Step 3: Style the summary strip + section spacing**

Append to `RouteBriefing.css`:

```css
.route-check-section--briefing { display: grid; gap: 10px; }
.rb-altn { display: grid; gap: 4px; color: #64748b; font-size: 10px; font-weight: 800; }
.rb-altn select { height: 36px; padding: 0 8px; border: 1px solid rgba(148,163,184,0.58); border-radius: 7px; font-size: 13px; font-weight: 700; color: #0f172a; }
.rb-summary { display: flex; align-items: center; gap: 12px; background: #eff6ff; border: 1px solid #d4e3f7; border-radius: 11px; padding: 10px 12px; }
.rb-summary-dist { flex: 0 0 auto; padding-right: 12px; border-right: 1px solid #d4e3f7; text-align: center; }
.rb-summary-time { flex: 1; text-align: center; }
.rb-summary span { display: block; font-size: 10px; font-weight: 800; color: #5b7da8; }
.rb-summary strong { font-size: 16px; font-weight: 850; color: #0f2742; font-variant-numeric: tabular-nums; }
.rb-summary em { font-size: 11px; font-style: normal; }
```

- [ ] **Step 4: Build + desktop smoke + capture**

Run: `npm --prefix frontend run build`
Expected: `✓ built`.

Run: `node frontend/scripts/briefing-smoke.mjs`
Expected: `"ok": true` (briefing still generates; the section restructure keeps `handleGenerateBriefing`).

Capture the desktop form and confirm: 내 항공기 selector (TAS · altitude) + 저장, 교체공항, ETD (typed + chips), and the `거리 · ETD→ETA` summary strip. No ETE.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(briefing): desktop perf+ETD layout with 내 항공기 + 거리·ETD→ETA summary"
```

---

## Task 6: Mobile 3-step sheet wizard

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: Add a step state and step nav**

In `RouteBriefingPanel.jsx`, near the other `useState`, add:

```jsx
  const [mobileStep, setMobileStep] = useState(1)
```

Define a step pill nav (reuse the segmented-track look):

```jsx
  const stepNav = (
    <div className="rb-steps">
      {[[1, '① 경로'], [2, '② 절차'], [3, '③ 성능·시간']].map(([n, label]) => (
        <button key={n} type="button" className={`rb-step${mobileStep === n ? ' is-active' : ''}`} onClick={() => setMobileStep(n)}>{label}</button>
      ))}
    </div>
  )
```

- [ ] **Step 2: Split the existing `mobileBody` into three steps**

Replace the single `mobileBody` form with a step-gated version. Keep the existing controls; just gate by `mobileStep`:

```jsx
  const mobileBody = (
    <form id="rb-mobile-form" className="route-check-form rb-mobile" onSubmit={handleRouteSearch}>
      {stepNav}
      {mobileStep === 1 && (
        <>
          <div className="route-type-segmented">
            <button type="button" className={`route-type-seg${isIfr ? ' is-active' : ''}`} onClick={() => switchFlightRule('IFR')}>IFR</button>
            <button type="button" className={`route-type-seg${!isIfr ? ' is-active' : ''}`} onClick={() => switchFlightRule('VFR')}>VFR</button>
          </div>
          <div className="rb-route">
            <AirportPickerField label="출발" value={routeForm.departureAirport} options={AIRPORT_OPTIONS} firOption={{ value: FIR_IN_AIRPORT, label: 'FIR 진입' }} onChange={handleDepartureAirportChange} disabledValue={routeForm.arrivalAirport} />
            <div className="rb-swap"><button type="button" className="rb-swap-btn" onClick={swapAirports} disabled={firOnEitherSide} aria-label="출발 도착 교환">⇅</button></div>
            <AirportPickerField label="도착" value={routeForm.arrivalAirport} options={AIRPORT_OPTIONS} firOption={{ value: FIR_EXIT_AIRPORT, label: 'FIR 이탈' }} onChange={handleArrivalAirportChange} disabledValue={routeForm.departureAirport} />
          </div>
          <label className="rb-altn">{'교체 공항'}
            <select value={alternateAirport} onChange={(e) => setAlternateAirport(e.target.value)}>
              <option value="">{'-- 없음 --'}</option>
              {KNOWN_AIRPORTS.map((ap) => <option key={ap} value={ap}>{ap}</option>)}
            </select>
          </label>
        </>
      )}
      {mobileStep === 2 && (
        <>
          {isIfr && (
            <div className="route-type-segmented">
              {[['ALL', '전체'], ['RNAV', 'RNAV'], ['ATS', 'ATS']].map(([val, lbl]) => (
                <button key={val} type="button" className={`route-type-seg${routeForm.routeType === val ? ' is-active' : ''}`} onClick={() => updateRouteField('routeType', val)}>{lbl}</button>
              ))}
            </div>
          )}
          <div className="rb-procedures">
            {isIfr && depChosen && (isFirInMode
              ? <PickerField label="진입 FIX" value={routeForm.entryFix} options={[NONE_OPTION, ...firInOptions.map((o) => ({ value: o.value, label: o.label }))]} onChange={handleEntryFixChange} />
              : <PickerField label="SID" value={selectedSid?.id ?? ''} options={[NONE_OPTION, ...visibleSidOptions.map((p) => ({ value: p.id, label: p.label }))]} onChange={(id) => handleSidChange(id ? (visibleSidOptions.find((p) => p.id === id) ?? null) : null)} />)}
            {isIfr && arrChosen && (isFirExitMode
              ? <PickerField label="이탈 FIX" value={routeForm.exitFix} options={[NONE_OPTION, ...firExitOptions.map((o) => ({ value: o.value, label: o.label }))]} onChange={handleExitFixChange} />
              : <PickerField label="STAR" value={selectedStar?.id ?? ''} options={[NONE_OPTION, ...starOptions.map((p) => ({ value: p.id, label: p.label }))]} onChange={(id) => handleStarChange(id ? (starOptions.find((p) => p.id === id) ?? null) : null)} />)}
            {isIfr && arrChosen && !isFirExitMode && iapCandidates.length > 1 && (
              <PickerField label="RWY" value={selectedIapKey ?? ''} options={iapCandidates.map(({ key, label }) => ({ value: key, label }))} onChange={handleIapChange} />
            )}
            {!isIfr && <div className="rb-vfr-note">VFR — 지도에서 경유점을 추가하세요</div>}
          </div>
        </>
      )}
      {mobileStep === 3 && (
        <>
          <AircraftProfileField tasKt={cruiseSpeedKt} altitudeFt={Number(cruiseAltitudeFt) || 0} magCourseDeg={derived.magCourseDeg} onChange={applyPerf} />
          <div className="route-check-field">
            <div className="route-check-field-label">{`ETD (${tz})`}</div>
            <EtdField etd={etd} tz={tz} variant="mobile" onChange={setEtd} />
          </div>
          {summaryStrip}
        </>
      )}
      {errorBlock}
      {resultsBlock}
    </form>
  )
```

- [ ] **Step 3: Make the mobile footer step-aware**

Replace `mobileFooter` so steps 1–2 advance and step 3 generates:

```jsx
  const mobileFooter = mobileStep < 3 ? (
    <div className="route-check-actions is-step">
      {mobileStep > 1 && <button type="button" className="route-check-secondary-button" onClick={() => setMobileStep((s) => s - 1)}>{'이전'}</button>}
      <button type="button" className="route-check-search-button" onClick={() => { if (mobileStep === 1 && !routeResult) handleRouteSearch({ preventDefault() {} }); setMobileStep((s) => s + 1) }}>{'다음'}</button>
    </div>
  ) : (
    <div className="route-check-actions is-step">
      <button type="button" className="route-check-secondary-button" onClick={() => setMobileStep((s) => s - 1)}>{'이전'}</button>
      <button type="button" className="route-check-search-button" onClick={handleGenerateBriefing} disabled={!routeResult || briefingLoading}>{briefingLoading ? '브리핑 생성 중...' : '브리핑 생성'}</button>
    </div>
  )
```

- [ ] **Step 4: Style the step nav**

Append to `RouteBriefing.css`:

```css
.rb-steps { display: flex; gap: 3px; padding: 3px; border-radius: 10px; background: #eef2f7; margin-bottom: 12px; }
.rb-step { flex: 1; border: 0; border-radius: 8px; background: transparent; padding: 8px 4px; font-size: 12px; font-weight: 800; color: #64748b; cursor: pointer; }
.rb-step.is-active { background: #fff; color: #2563eb; box-shadow: 0 1px 2px rgba(15,23,42,.12); }
.rb-procedures { display: grid; gap: 8px; }
.rb-vfr-note { font-size: 12px; font-weight: 700; color: #64748b; padding: 8px; }
```

- [ ] **Step 5: Build + mobile capture**

Run: `npm --prefix frontend run build`
Expected: `✓ built`.

At 390px, capture the sheet: confirm the ① 경로 / ② 절차 / ③ 성능·시간 step nav, that 다음/이전 navigate, and step ③ shows 내 항공기 + ETD(wheel + 오늘/내일 + chips) + 거리·ETD→ETA summary + 브리핑 생성.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(briefing): mobile 3-step flight-plan wizard (경로/절차/성능·시간)"
```

---

## Task 7: Final verification + push

- [ ] **Step 1: Unit tests**

Run: `node --test frontend/src/features/route-briefing/lib/aircraftProfiles.test.js frontend/src/features/route-briefing/lib/altitude.test.js frontend/src/features/route-briefing/lib/briefingTime.test.js frontend/src/features/route-briefing/lib/etaCalc.test.js`
Expected: all PASS.

- [ ] **Step 2: Build**

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

- **Spec coverage:** 내 항공기 profiles + direct input (Task 1, 4) ✓ · TAS label (Task 4) ✓ · ft/FL + stepper + VFR hint (Task 2, 4) ✓ · ETE dropped, 거리·ETD→ETA summary (Task 5) ✓ · ETD desktop typed / mobile wheel + today/tomorrow + relative chips (Task 3) ✓ · ETA read-only derived (Task 5 summary, reuses computeEtaIso) ✓ · mobile 3-step wizard (Task 6) ✓ · frontend-only, payload unchanged (no backend tasks) ✓ · last-used defaults (Task 4) ✓.
- **Placeholders:** none — pure libs have full code+tests; UI tasks have full JSX/CSS and build/smoke/capture verification.
- **Type consistency:** `aircraftProfiles` exports (`listProfiles/saveProfile/deleteProfile/getLastUsed/setLastUsed`) used identically in Tasks 1/4; `altitude` exports (`formatAltitude/stepAltitude/vfrCruiseHint/initialBearingDeg/magneticCourse`) used in Tasks 2/4; `EtdField` props `{etd,tz,variant,onChange}` consistent Tasks 3/5/6; `AircraftProfileField` props `{tasKt,altitudeFt,magCourseDeg,onChange}` consistent Tasks 4/5/6; `derived.plannedDistanceNm`/`derived.magCourseDeg` defined Task 4, consumed Tasks 5/6.
- **Edge cases:** corrupt storage → `[]` (Task 1) · no profile → direct input + last-used/default (Task 4) · ETA `—` before route (Task 5) · ft↔FL at 14,000 (Task 2).
- **Note for implementer:** confirm `airports[].lat/lon` property names against the existing VFR-waypoint-altitude code before relying on them in Task 4 Step 2; adjust the accessor if the fields are named differently.
