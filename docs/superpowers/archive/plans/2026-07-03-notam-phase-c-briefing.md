# NOTAM Phase C — Route-Briefing Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attach route-crossing NOTAMs to the pre-flight briefing — list them as facts under the route section, and raise a factual "경로 저촉" (route conflict) banner when an *airspace-restriction* NOTAM is *in effect* and the route *passes it at planned altitude*.

**Architecture:** A new pure module `notam-briefing.js` reuses the exported geo-time-match primitives (`timeWindowsOverlap`, `routeIntervalInGeometry`) + the altitude matcher (`classifyEncounter`) — NOT the private SIGMET-shaped `matchItems` and NOT `hazardLevel()` (no severity gradient). It returns `{ routeNotams, routeConflicts }`. The composer attaches both to the briefing; `server.js` feeds it `store.getCached('notam')`. The frontend lists route NOTAMs under ④노선, highlights conflicts, shows a conflict banner strip, and offers a "지도에 NOTAM 레이어 보기" chip.

**Tech Stack:** Node.js ESM (`node:test`), React (Fluent UI wrapper), Vite. No new dependencies.

**Design decisions locked in (from spec §Route-Briefing Integration):**
- **routeConflict = 3 conditions AND** (binary flag, not a level): (1) category ∈ `{prohibited, restricted, danger, firing}`; (2) in effect during flight (time overlap with ETD~ETA — guaranteed by the matcher's time filter); (3) route passes the polygon at planned altitude.
- **Altitude adapter required:** NOTAM `altitude` is `{ lower, upper, unit, ref }` (Phase A frozen contract), but `bandToFt` reads the SIGMET shape `{ lower_fl, upper_fl, ... }`. A new `notamBandToFt()` maps NOTAM → `{ lowFt, highFt }`. FL→×100; `FL /000/999/` (unlimited) → no ceiling; AGL/AMSL datum difference is ignored for this coarse vertical overlap (`ponytail:` comment names the ceiling).
- **Unknown altitude → conservative pass:** if the band is unknown (`verticalKnown === false`), condition (3) is treated as satisfied (don't under-alarm — matches SIGMET's `verticalKnown:false → red` stance).
- **`scope:'fir'` excluded** from route matching (nationwide polygon matches every route meaninglessly).
- **Sort:** in-effect-at-ETD first, then route-entry distance ascending.
- **Map chip shows route-matched NOTAMs only (user decision 2026-07-04):** the "지도에 NOTAM 레이어 보기" chip, when active in briefing map mode, restricts the NOTAM map layers to `routeNotams` ids (not all NOTAMs). Implemented as an optional `idFilter` on `setNotamCategoryFilter`, driven by an id list derived in MapView from `routeBriefing.state.briefing.routeNotams`. Outside briefing map mode the NOTAM layers behave exactly as today (all NOTAMs). **This is contained entirely in `MapView.jsx` + `notamLayers.js`** — BriefingView is rendered inside MapView (line ~1389), so no App-level prop threading is needed.
- **LineString / Point-only NOTAMs are not matched** — `routeIntervalInGeometry` only handles Polygon/MultiPolygon (known limitation, spec §알려진 한계). They still appear on the map/panel (Phase B), just not in briefing matching.

---

## File Structure

**Backend**
- Create: `backend/src/briefing/notam-briefing.js` — `notamBandToFt()` + `matchRouteNotams()`. One responsibility: turn NOTAM items + route context into `{ routeNotams, routeConflicts }`.
- Modify: `backend/src/briefing/briefing-composer.js` — call `matchRouteNotams`, attach `routeNotams`/`routeConflicts`, add conflict chip to `summary`.
- Modify: `backend/server.js:777` — add `notam: store.getCached('notam')` to the briefing data object.
- Create: `backend/test/notam-briefing.test.js` — unit tests for the new module.
- Modify: `backend/test/briefing-composer.test.js` — integration cases.

**Frontend**
- Modify: `frontend/src/features/route-briefing/lib/hazardLayers.js` — RULEBOOK gains a NOTAM-category→`['notam']` rule; `hazardMapLayers` also scans `briefing.routeNotams` categories.
- Modify: `frontend/src/features/route-briefing/lib/hazardLayers.test.js` — case for the NOTAM rule.
- Modify: `frontend/src/features/notam/lib/notamLayers.js` — `setNotamCategoryFilter` gains an optional `idFilter` param (route-only map filter).
- Create: `frontend/src/features/notam/lib/notamLayers.test.js` — unit test that `idFilter` is applied to the Mapbox filter.
- Modify: `frontend/src/features/map/MapView.jsx` — derive route NOTAM id filter from the briefing in the existing NOTAM sync effect (no new effect/hook; extends the existing one — ADR 0001 compliant).
- Modify: `frontend/src/features/route-briefing/BriefingBanner.jsx` — render a "경로 저촉" strip from `routeConflicts`.
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx` — "경로상 NOTAM" subsection under ④노선; pass `routeConflicts` to the banner; the existing `hazardMapLayers(briefing)` call now yields `notam`.

No `App.jsx` change: the whole `briefing` object already flows to `BriefingView` (rendered inside `MapView`); the new fields ride along, and MapView already holds the briefing + NOTAM filter state.

---

## Task 1: `notamBandToFt` — NOTAM altitude → feet band

**Files:**
- Create: `backend/src/briefing/notam-briefing.js`
- Test: `backend/test/notam-briefing.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/test/notam-briefing.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notamBandToFt } from '../src/briefing/notam-briefing.js'

test('notamBandToFt: FT band passes through', () => {
  assert.deepEqual(notamBandToFt({ lower: 0, upper: 4000, unit: 'FT', ref: 'AGL' }), { lowFt: 0, highFt: 4000 })
})

test('notamBandToFt: FL band × 100', () => {
  assert.deepEqual(notamBandToFt({ lower: 40, upper: 120, unit: 'FL', ref: null }), { lowFt: 4000, highFt: 12000 })
})

test('notamBandToFt: FL 0..999 (전고도) → no ceiling', () => {
  const b = notamBandToFt({ lower: 0, upper: 999, unit: 'FL', ref: null })
  assert.equal(b.lowFt, 0)
  assert.ok(b.highFt >= 99999)
})

test('notamBandToFt: null altitude → null', () => {
  assert.equal(notamBandToFt(null), null)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-briefing.test.js`
Expected: FAIL — `notamBandToFt is not a function` (module/exports missing).

- [ ] **Step 3: Write minimal implementation**

Create `backend/src/briefing/notam-briefing.js`:

```js
// 경로상 NOTAM 매칭(사실 계산). geo-time-match 코어 재사용 — hazardLevel() 심각도 그라데이션은 쓰지 않음.
import { routeIntervalInGeometry, timeWindowsOverlap } from './geo-time-match.js'
import { classifyEncounter } from './hazard-matcher.js'

const HIGH_FT = 99999

// NOTAM altitude { lower, upper, unit, ref } → { lowFt, highFt }. bandToFt(SIGMET shape)와 필드가 달라 별도 어댑터.
// ponytail: AGL/AMSL 기준면 차이는 coarse 수직 겹침 판정에서 무시(지형고도 무시). 정밀 필요 시 ref별 지표고 보정.
export function notamBandToFt(altitude) {
  if (!altitude) return null
  const unit = String(altitude.unit || '').toUpperCase()
  const toFt = (v) => (unit === 'FL' ? Number(v) * 100 : Number(v))
  const lowFt = altitude.lower == null ? 0 : toFt(altitude.lower)
  const unlimited = altitude.upper == null || (unit === 'FL' && Number(altitude.upper) >= 999)
  const highFt = unlimited ? HIGH_FT : toFt(altitude.upper)
  if (!Number.isFinite(lowFt) && !Number.isFinite(highFt)) return null
  return { lowFt: Number.isFinite(lowFt) ? lowFt : 0, highFt: Number.isFinite(highFt) ? highFt : HIGH_FT }
}

export default { notamBandToFt }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/notam-briefing.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/briefing/notam-briefing.js backend/test/notam-briefing.test.js
git commit -m "feat(notam): notamBandToFt altitude adapter for briefing match"
```

---

## Task 2: `matchRouteNotams` — route/time/altitude matching + conflict flag

**Files:**
- Modify: `backend/src/briefing/notam-briefing.js`
- Test: `backend/test/notam-briefing.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/test/notam-briefing.test.js`:

```js
import { matchRouteNotams } from '../src/briefing/notam-briefing.js'
import { buildRouteAxis } from '../src/briefing/route-axis.js'

// 인천→제주 직선. axis 샘플이 lat 35~36 구간을 지난다.
const axis = buildRouteAxis({ type: 'LineString', coordinates: [[126.45, 37.46], [126.5, 33.5]] }, 2000)
const ctx = { axis, etd: '2026-06-26T09:00:00Z', eta: '2026-06-26T10:30:00Z', cruiseAltitudeFt: 9000 }
// 경로가 지나는 폴리곤(lat 35~36, lon 126~127).
const onRoutePoly = { type: 'Polygon', coordinates: [[[126, 35], [127, 35], [127, 36], [126, 36], [126, 35]]] }
const notam = (over) => ({
  id: 'A0001/26', category: 'danger', scope: 'airport',
  valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z',
  altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'DANGER AREA ACT',
  geometry: onRoutePoly, ...over,
})

test('matchRouteNotams: route-crossing restriction in effect at altitude → conflict', () => {
  const { routeNotams, routeConflicts } = matchRouteNotams([notam()], ctx)
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].conflict, true)
  assert.equal(routeConflicts.length, 1)
  assert.equal(routeConflicts[0].id, 'A0001/26')
})

test('matchRouteNotams: scope:fir excluded entirely', () => {
  const { routeNotams } = matchRouteNotams([notam({ scope: 'fir' })], ctx)
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: outside ETD~ETA time window excluded', () => {
  const { routeNotams } = matchRouteNotams([notam({ valid_from: '2026-06-27T00:00:00Z', valid_to: '2026-06-27T02:00:00Z' })], ctx)
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: obstacle on route is listed but NOT a conflict', () => {
  const { routeNotams, routeConflicts } = matchRouteNotams([notam({ category: 'obstacle' })], ctx)
  assert.equal(routeNotams.length, 1)
  assert.equal(routeNotams[0].conflict, false)
  assert.equal(routeConflicts.length, 0)
})

test('matchRouteNotams: restriction present but altitude band clear of cruise → not conflict', () => {
  // 계획고도 9000ft, 밴드 FL200~FL300(=20000~30000ft) → 통과 안 함.
  const { routeConflicts } = matchRouteNotams([notam({ altitude: { lower: 200, upper: 300, unit: 'FL', ref: null } })], ctx)
  assert.equal(routeConflicts.length, 0)
})

test('matchRouteNotams: off-route restriction excluded', () => {
  const off = { type: 'Polygon', coordinates: [[[120, 20], [121, 20], [121, 21], [120, 21], [120, 20]]] }
  const { routeNotams } = matchRouteNotams([notam({ geometry: off })], ctx)
  assert.equal(routeNotams.length, 0)
})

test('matchRouteNotams: sorted in-effect-at-ETD first, then entry distance', () => {
  const later = notam({ id: 'LATER/26', valid_from: '2026-06-26T09:30:00Z' }) // ETD(09:00) 이후 발효 → activeAtEtd=false
  const now = notam({ id: 'NOW/26', valid_from: '2026-06-26T08:00:00Z' })     // ETD 이전 발효 → activeAtEtd=true
  const { routeNotams } = matchRouteNotams([later, now], ctx)
  assert.equal(routeNotams[0].id, 'NOW/26')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/notam-briefing.test.js`
Expected: FAIL — `matchRouteNotams is not a function`.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/src/briefing/notam-briefing.js` — add above the `export default` line:

```js
// spec §Route-Briefing Integration: 공역 제한 계열(ICAO Q-code 정의). 장애물/시설/기타는 정보성 → 저촉 아님.
const RESTRICTION_CATEGORIES = new Set(['prohibited', 'restricted', 'danger', 'firing'])

// items: /api/notam items. ctx: { axis, etd, eta, cruiseAltitudeFt }.
// 반환: { routeNotams(사실 나열, 정렬됨), routeConflicts(3조건 AND) }.
export function matchRouteNotams(items, ctx) {
  const routeNotams = []
  for (const it of (items ?? [])) {
    if (it?.scope === 'fir') continue // 전국 스코프는 경로 매칭에서 제외(무의미한 전량 매칭)
    if (!it?.geometry || !it.valid_from || !it.valid_to) continue
    if (!timeWindowsOverlap(ctx.etd, ctx.eta, it.valid_from, it.valid_to)) continue // 발효중(비행 시간창 겹침)
    const interval = routeIntervalInGeometry(ctx.axis, it.geometry) // Polygon/MultiPolygon만; Line/Point → entered=false
    if (!interval.entered) continue
    const bandFt = notamBandToFt(it.altitude)
    const { encounter, verticalKnown } = classifyEncounter(
      { startNm: interval.startNm, endNm: interval.endNm, bandFt },
      { totalDistanceNm: ctx.axis?.totalDistanceNm, cruiseAltitudeFt: ctx.cruiseAltitudeFt },
    )
    // 고도 통과: 밴드 미상이면 보수적으로 통과 간주(under-alarm 금지, spec 안전 규칙).
    const passesAltitude = !verticalKnown || encounter === 'on'
    routeNotams.push({
      id: it.id,
      category: it.category,
      summary: it.summary,
      altitude: it.altitude,
      validFrom: it.valid_from,
      validTo: it.valid_to,
      onRoute: true,
      routeIntervalNm: { startNm: interval.startNm, endNm: interval.endNm },
      bandFt,
      verticalKnown,
      activeAtEtd: Date.parse(it.valid_from) <= Date.parse(ctx.etd),
      conflict: RESTRICTION_CATEGORIES.has(it.category) && passesAltitude,
    })
  }
  // 정렬: 발효중(ETD시점 유효) 먼저, 그다음 경로 진입거리순.
  routeNotams.sort((a, b) =>
    (a.activeAtEtd === b.activeAtEtd ? 0 : a.activeAtEtd ? -1 : 1) ||
    (a.routeIntervalNm.startNm - b.routeIntervalNm.startNm))
  const routeConflicts = routeNotams.filter((n) => n.conflict)
  return { routeNotams, routeConflicts }
}
```

Update the default export line to:

```js
export default { notamBandToFt, matchRouteNotams }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/notam-briefing.test.js`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/briefing/notam-briefing.js backend/test/notam-briefing.test.js
git commit -m "feat(notam): matchRouteNotams route/time/altitude match + conflict flag"
```

---

## Task 3: Attach `routeNotams`/`routeConflicts` in the composer

**Files:**
- Modify: `backend/src/briefing/briefing-composer.js`
- Test: `backend/test/briefing-composer.test.js`

- [ ] **Step 1: Write the failing test**

Append to `backend/test/briefing-composer.test.js` (the existing `data` fixture already has `sigmet` with a polygon; we add a `notam` section reusing that route). Add:

```js
const onRoutePoly = { type: 'Polygon', coordinates: [[[125, 34], [128, 34], [128, 36], [125, 36], [125, 34]]] }
const notamData = (over = {}) => ({
  ...data,
  notam: { fetched_at: '2026-06-26T08:00:00Z', horizon_hours: 24, items: [
    { id: 'D0001/26', category: 'danger', scope: 'airport', valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z',
      altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'DANGER AREA ACT', geometry: onRoutePoly },
    { id: 'O0002/26', category: 'obstacle', scope: 'airport', valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z',
      altitude: { lower: 0, upper: 500, unit: 'FT', ref: 'AGL' }, summary: 'CRANE', geometry: onRoutePoly },
    { id: 'F0003/26', category: 'danger', scope: 'fir', valid_from: '2026-06-26T08:00:00Z', valid_to: '2026-06-26T14:00:00Z',
      altitude: { lower: 0, upper: 999, unit: 'FL', ref: null }, summary: 'NATIONWIDE', geometry: onRoutePoly },
    ...(over.extraItems ?? []),
  ] },
})

test('composeBriefing: routeNotams lists route-crossing NOTAMs, excludes scope:fir', () => {
  const b = composeBriefing(request, notamData())
  const ids = b.routeNotams.map((n) => n.id)
  assert.ok(ids.includes('D0001/26'))
  assert.ok(ids.includes('O0002/26'))
  assert.ok(!ids.includes('F0003/26')) // fir 제외
})

test('composeBriefing: routeConflicts = restriction in effect crossing at altitude (obstacle excluded)', () => {
  const b = composeBriefing(request, notamData())
  assert.equal(b.routeConflicts.length, 1)
  assert.equal(b.routeConflicts[0].id, 'D0001/26')
})

test('composeBriefing: routeConflicts raises a summary chip', () => {
  const b = composeBriefing(request, notamData())
  const chip = b.summary.find((s) => s.key === 'notam')
  assert.ok(chip)
  assert.equal(chip.level, 'red')
})

test('composeBriefing: no notam data → empty routeNotams, no chip', () => {
  const b = composeBriefing(request, data)
  assert.deepEqual(b.routeNotams, [])
  assert.deepEqual(b.routeConflicts, [])
  assert.equal(b.summary.some((s) => s.key === 'notam'), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/briefing-composer.test.js`
Expected: FAIL — `b.routeNotams` is undefined.

- [ ] **Step 3: Write minimal implementation**

Edit `backend/src/briefing/briefing-composer.js`:

Add the import after line 6 (`import { timeWindowsOverlap } ...`):

```js
import { matchRouteNotams } from './notam-briefing.js'
```

Inside `composeBriefing`, after the `adverse` block (after line 73), add:

```js
  const { routeNotams, routeConflicts } = matchRouteNotams(data?.notam?.items ?? [], {
    axis, etd: request.etd, eta: request.eta, cruiseAltitudeFt,
  })
```

Change the `summary` array (lines 100-103) to append a conflict chip:

```js
  const summary = [
    { key: 'hazard', label: '위험', level: adverse.level },
    ...airports.map((a) => ({ key: a.icao, label: `${ROLE_LABEL[a.role]} ${a.icao}`, level: a.level })),
    ...(routeConflicts.length ? [{ key: 'notam', label: `경로 저촉 ${routeConflicts.length}`, level: 'red' }] : []),
  ]
```

Add `routeNotams` and `routeConflicts` to the returned object (after `banner,` on line ~116, top level so the frontend reads `briefing.routeNotams`):

```js
    summary,
    banner,
    routeNotams,
    routeConflicts,
    sections: { adverse, enroute, current: { airports }, destination },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test test/briefing-composer.test.js`
Expected: PASS (existing + 4 new). Also run the whole backend suite:
Run: `cd backend && node --test`
Expected: PASS (no regressions).

- [ ] **Step 5: Commit**

```bash
git add backend/src/briefing/briefing-composer.js backend/test/briefing-composer.test.js
git commit -m "feat(notam): compose routeNotams/routeConflicts into briefing + summary chip"
```

---

## Task 4: Feed cached NOTAM into the route-briefing handler

**Files:**
- Modify: `backend/server.js:777-785`
- Test: manual curl smoke (below) — the composer already covered by Task 3.

- [ ] **Step 1: Modify the handler**

Edit `backend/server.js`, the `data` object inside `app.post('/api/route-briefing', ...)` (around line 777), add the `notam` line:

```js
    const data = {
      metar: store.getCached('metar'),
      taf: store.getCached('taf'),
      sigmet: store.getCached('sigmet'),
      airmet: store.getCached('airmet'),
      warning: store.getCached('warning'),
      amos: store.getCached('amos'),
      takeoff_fcst: store.getCached('takeoff_fcst'),
      notam: store.getCached('notam'),
    }
```

- [ ] **Step 2: Verify server still boots & existing integration test passes**

Run: `cd backend && node --test test/route-briefing-integration.test.js`
Expected: PASS (no regression — handler still returns a briefing; `notam` cache may be null in test, matchRouteNotams handles `?? []`).

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(notam): inject cached notam into /api/route-briefing"
```

---

## Task 5: `hazardMapLayers` — "지도에 NOTAM 레이어 보기" chip

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/hazardLayers.js`
- Test: `frontend/src/features/route-briefing/lib/hazardLayers.test.js`

- [ ] **Step 1: Write the failing test**

Edit `frontend/src/features/route-briefing/lib/hazardLayers.test.js`. Change the `briefing` helper to accept `routeNotams`, and add two cases:

```js
const briefing = (hazards = [], modelKinds = [], routeNotams = []) => ({
  routeNotams,
  sections: {
    adverse: { hazards },
    enroute: { model: { elements: modelKinds.map((kind) => ({ kind })) } },
  },
})
```

Add:

```js
test('경로상 NOTAM이 있으면 notam 레이어', () => {
  const ids = hazardMapLayers(briefing([], [], [{ id: 'D1/26', category: 'danger' }]))
  assert.ok(ids.includes('notam'))
})

test('경로상 NOTAM 없으면 notam 레이어 아님', () => {
  assert.ok(!hazardMapLayers(briefing([{ code: 'EMBD_TS' }])).includes('notam'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/route-briefing/lib/hazardLayers.test.js`
Expected: FAIL — `ids` does not include `notam`.

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/features/route-briefing/lib/hazardLayers.js`. Add a RULEBOOK entry (keep RULEBOOK the single source of category→layer knowledge, per spec §6) — after the existing rules:

```js
  // NOTAM 카테고리(사실 분류) → notam 마스터 레이어. 경로상 NOTAM 있으면 "지도에 NOTAM 레이어 보기" 칩.
  { codes: ['prohibited', 'restricted', 'danger', 'firing', 'obstacle', 'facility', 'other'], layers: ['notam'] },
```

Change `hazardMapLayers` to also scan `briefing.routeNotams` categories through the RULEBOOK:

```js
export function hazardMapLayers(briefing) {
  const codes = (briefing?.sections?.adverse?.hazards ?? []).map((h) => h.code || '')
  const notamCats = (briefing?.routeNotams ?? []).map((n) => n.category || '')
  const modelKinds = new Set((briefing?.sections?.enroute?.model?.elements ?? []).map((e) => e.kind))
  const layers = new Set()

  for (const code of [...codes, ...notamCats])
    for (const rule of RULEBOOK)
      if (rule.codes.includes(code)) rule.layers.forEach((l) => layers.add(l))

  if (modelKinds.has('icing')) layers.add('icing')
  if (modelKinds.has('turbulence')) layers.add('turbulence')

  return [...layers]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/route-briefing/lib/hazardLayers.test.js`
Expected: PASS (existing 6 + 2 new). The existing "반환 id는 모두 실제 MET 레이어 id" test still passes because `notam` is a registered `MET_LAYERS` id.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/route-briefing/lib/hazardLayers.js frontend/src/features/route-briefing/lib/hazardLayers.test.js
git commit -m "feat(notam): route NOTAM categories drive the notam map-layer chip"
```

---

## Task 6: Route-only NOTAM map filter (`idFilter`)

**Files:**
- Modify: `frontend/src/features/notam/lib/notamLayers.js`
- Create: `frontend/src/features/notam/lib/notamLayers.test.js`
- Modify: `frontend/src/features/map/MapView.jsx:259-287` (existing NOTAM sync effect)

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/notam/lib/notamLayers.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { setNotamCategoryFilter } from './notamLayers.js'

// setFilter 호출을 기록하는 최소 fake map.
function fakeMap() {
  const filters = {}
  return {
    filters,
    getLayer: () => true,
    setFilter: (id, f) => { filters[id] = f },
  }
}
// 필터 표현식 안에 특정 문자열이 들어있는지(중첩 배열 평탄 검사).
function exprHas(expr, needle) {
  return JSON.stringify(expr).includes(needle)
}

test('idFilter=null → no id constraint in filter', () => {
  const map = fakeMap()
  setNotamCategoryFilter(map, ['danger'], 'all', null)
  assert.ok(!exprHas(map.filters['notam-fill'], '"id"'))
})

test('idFilter=[ids] → id "in" constraint applied to every notam layer', () => {
  const map = fakeMap()
  setNotamCategoryFilter(map, ['danger'], 'all', ['D0001/26', 'D0002/26'])
  for (const id of ['notam-fill', 'notam-line', 'notam-marker', 'notam-obstacle', 'notam-label']) {
    assert.ok(exprHas(map.filters[id], 'D0001/26'), `id filter missing on ${id}`)
    assert.ok(exprHas(map.filters[id], '"id"'), `id get missing on ${id}`)
  }
})

test('idFilter=[] → shows nothing (empty in-list)', () => {
  const map = fakeMap()
  setNotamCategoryFilter(map, ['danger'], 'all', [])
  assert.ok(exprHas(map.filters['notam-fill'], '"literal",[]') || exprHas(map.filters['notam-fill'], '"literal", []'))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && node --test src/features/notam/lib/notamLayers.test.js`
Expected: FAIL — id constraint not present (param not yet supported).

- [ ] **Step 3: Write minimal implementation**

Edit `frontend/src/features/notam/lib/notamLayers.js`. Change `setNotamCategoryFilter` (line 127) to accept `idFilter`:

```js
// 카테고리 + 위치 + (선택)id 필터를 지도 레이어에 적용.
// idFilter가 배열이면 해당 NOTAM id만(브리핑 "경로에 걸린 NOTAM만" 모드). null이면 전체.
export function setNotamCategoryFilter(map, activeCategoryIds, locationFilter = 'all', idFilter = null) {
  const catFilter = ['in', ['get', 'category'], ['literal', activeCategoryIds]]
  const locFilter = (locationFilter && locationFilter !== 'all') ? ['==', ['get', 'location'], locationFilter] : true
  const idExpr = Array.isArray(idFilter) ? ['in', ['get', 'id'], ['literal', idFilter]] : true
  const F = (...conds) => ['all', catFilter, locFilter, idExpr, ...conds]
  if (map.getLayer('notam-fill')) map.setFilter('notam-fill', F(POLYGON_FILTER))
  if (map.getLayer('notam-line')) map.setFilter('notam-line', F(NOT_FIR))
  if (map.getLayer('notam-fir-line')) map.setFilter('notam-fir-line', F(IS_FIR))
  if (map.getLayer('notam-obstacle')) map.setFilter('notam-obstacle', F(IS_POINT, IS_OBSTACLE))
  if (map.getLayer('notam-marker')) map.setFilter('notam-marker', F(IS_POINT, ['!', IS_OBSTACLE]))
  if (map.getLayer('notam-label')) map.setFilter('notam-label', F(IS_AREA))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && node --test src/features/notam/lib/notamLayers.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the id filter into MapView's NOTAM sync effect**

Edit `frontend/src/features/map/MapView.jsx`. In the NOTAM sync effect (line ~259), just before the `applyNotamCategoryFilter(...)` call (line 264), derive the filter and pass it. Replace line 264 with:

```jsx
    // 브리핑 "경로에 걸린 NOTAM만" 모드: 맵모드 + 브리핑 존재 시 routeNotams id로 제한. 그 외엔 전체(null).
    const notamIdFilter = (routeBriefingMapMode && routeBriefing.state.briefing)
      ? (routeBriefing.state.briefing.routeNotams ?? []).map((n) => n.id)
      : null
    applyNotamCategoryFilter(map, notamCategoryFilter, notamLocationFilter, notamIdFilter)
```

In the same effect, make the click-popup respect the id filter — change the `polyHits` line (line 270-271) to also filter by id:

```jsx
      const polyHits = notamsAtPoint(notamFc.features, e.lngLat.lng, e.lngLat.lat, notamCategoryFilter)
        .filter((f) => notamLocationFilter === 'all' || f.properties?.location === notamLocationFilter)
        .filter((f) => !notamIdFilter || notamIdFilter.includes(f.properties?.id))
```

Add the two new dependencies to the effect's dependency array (line 287):

```jsx
  }, [notamFc, metVisibility.notam, notamCategoryFilter, notamLocationFilter, routeBriefingMapMode, routeBriefing.state.briefing])
```

`ponytail:` this extends the *existing* NOTAM sync effect (no new effect/state added to MapView) — ADR 0001 keeps NOTAM overlay logic in one place; we only thread one derived filter through it.

- [ ] **Step 6: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/features/notam/lib/notamLayers.js frontend/src/features/notam/lib/notamLayers.test.js frontend/src/features/map/MapView.jsx
git commit -m "feat(notam): route-only map filter when briefing NOTAM chip is active"
```

---

## Task 7: "경로 저촉" banner strip in BriefingBanner

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingBanner.jsx`

- [ ] **Step 1: Modify the component**

Edit `frontend/src/features/route-briefing/BriefingBanner.jsx`. Replace the whole file with:

```jsx
import { AlertTriangle, Check } from 'lucide-react'
import { NOTAM_CATEGORIES } from '../notam/lib/notamViewModel.js'

// Go/No-go 배너: 최악 카테고리(3레벨) + 공항 + 이유(운고/시정) + 역할별 범주 체인.
// §2.2 정상=차분(무채/연녹), 위험(IFR/LIFR)만 솔리드 채색.
const CAT_COLOR = { VFR: 'var(--cat-vfr)', IFR: 'var(--cat-ifr)', LIFR: 'var(--cat-lifr)' }
const ROLE_LABEL = { departure: '출발', arrival: '도착', alternate: '교체' }
const DRIVER_LABEL = { ceiling: '운고', visibility: '시정', both: '운고·시정' }
const NOTAM_CAT_LABEL = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))

export default function BriefingBanner({ banner, routeConflicts = [] }) {
  const worst = banner?.worst
  const hasConflict = routeConflicts.length > 0
  if (!worst && !hasConflict) return null
  const good = worst?.category === 'VFR'
  const catColor = CAT_COLOR[worst?.category] || 'var(--text-3)'

  const reason = good
    ? '전 구간 시정·운고 여유'
    : worst ? `${ROLE_LABEL[worst.role]}공항 ${DRIVER_LABEL[worst.driver] || '기상'} 기준 ${worst.category}` : ''

  return (
    <>
      {worst && (
        <div className="bv-banner" data-bvid="banner" data-good={good ? 'true' : 'false'} style={{ borderColor: catColor }}>
          <div className="bv-banner-cat" style={good ? undefined : { background: catColor }}>
            <span className="bv-banner-cat-role">{good ? '전 구간' : `${ROLE_LABEL[worst.role]}공항 ${worst.icao}`}</span>
            <span className="bv-banner-cat-val">{worst.category}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: catColor }}>
              {good ? <Check size={16} /> : <AlertTriangle size={16} />} {reason}
            </div>
            <div className="bv-banner-chain">
              {banner.airports.map((a) => (
                <span key={a.role} className="bv-banner-chain-item">
                  <span className="bv-banner-chain-role">{ROLE_LABEL[a.role]}</span>
                  <b>{a.icao}</b>
                  <b style={{ color: CAT_COLOR[a.category] || 'var(--text-3)' }}>{a.category}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {hasConflict && (
        // 사실 고지 — 명령 아님. 최종 go/no-go는 파일럿.
        <div className="bv-banner bv-banner-notam" data-good="false" style={{ borderColor: 'var(--level-red)' }}>
          <div className="bv-banner-cat" style={{ background: 'var(--level-red)' }}>
            <span className="bv-banner-cat-role">경로 저촉</span>
            <span className="bv-banner-cat-val">{routeConflicts.length}</span>
          </div>
          <div className="bv-banner-body">
            <div className="bv-banner-reason" style={{ color: 'var(--level-red)' }}>
              <AlertTriangle size={16} /> 발효 중 공역 제한이 경로에 걸립니다 — 확인 필요
            </div>
            <div className="bv-banner-chain">
              {routeConflicts.map((n) => (
                <span key={n.id} className="bv-banner-chain-item">
                  <span className="bv-banner-chain-role">{NOTAM_CAT_LABEL[n.category] || n.category}</span>
                  <b>{n.id}</b>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

Note: only the weather banner keeps `data-bvid="banner"` (the nav's jump target). The conflict strip has none — it sits directly beneath it. `ponytail:` single anchor is enough; conflict strip is always adjacent.

- [ ] **Step 2: Verify build (no test file for this component)**

Run: `cd frontend && npm run build`
Expected: build succeeds (verified fully in Task 8).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/route-briefing/BriefingBanner.jsx
git commit -m "feat(notam): route-conflict banner strip (factual notice)"
```

---

## Task 8: "경로상 NOTAM" subsection in BriefingView

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`

- [ ] **Step 1: Add imports**

Edit `frontend/src/features/route-briefing/BriefingView.jsx`. After the existing imports (after line 22), add:

```jsx
import { deriveTimeState, formatAltitude, notamSummary, NOTAM_CATEGORIES, TIME_STATE } from '../notam/lib/notamViewModel.js'
```

Below the module-level constants (after line 29), add:

```jsx
const NOTAM_CAT_LABEL = Object.fromEntries(NOTAM_CATEGORIES.map((c) => [c.id, c.label]))
// 시간상태 색(색의 유일한 축). 안전값(고도·요약)은 --text-2 이상, 흐린 색 금지(spec 접근성 #2).
const TS_COLOR = { active: 'var(--level-red)', soon: 'var(--level-amber)', upcoming: 'var(--text-3)' }
```

- [ ] **Step 2: Build the subsection and wire the banner**

Still in `BriefingView.jsx`, after the `enroute` const block (ends at line ~442, `)` closing the enroute section), add:

```jsx
  const routeNotams = briefing.routeNotams ?? []
  const routeConflicts = briefing.routeConflicts ?? []
  const notamSection = routeNotams.length > 0 && (
    <section data-bvid="notam" className="bv-section">
      <Card>
        <div className="bv-haz-head">
          <Subtitle2 as="h3">경로상 NOTAM</Subtitle2>
          <Caption1 style={{ color: 'var(--text-3)' }}>
            {routeNotams.length}건{routeConflicts.length ? ` · 저촉 ${routeConflicts.length}` : ''}
          </Caption1>
        </div>
        {routeNotams.map((n) => {
          const ts = deriveTimeState(n.validFrom, n.validTo, Date.now())
          const t = TIME_STATE[ts]
          return (
            <div key={n.id} className="bv-notam-row" data-conflict={n.conflict ? 'true' : 'false'}>
              <Badge appearance={n.conflict ? 'filled' : 'tint'}
                style={n.conflict ? { backgroundColor: TS_COLOR[ts], color: '#fff' } : { color: TS_COLOR[ts] }}>
                {t.glyph} {NOTAM_CAT_LABEL[n.category] || n.category}
              </Badge>
              <div className="bv-notam-main">
                <div className="bv-notam-line1">
                  {n.conflict ? <b style={{ color: 'var(--level-red)' }}>경로 저촉 · </b> : null}
                  <span style={{ color: 'var(--text-2)' }}>{notamSummary(n) || n.summary || n.id}</span>
                  <span className="bv-haz-code">{n.id}</span>
                </div>
                <Caption1 style={{ color: 'var(--text-2)' }}>
                  {t.label} · {formatAltitude(n.altitude) || '고도 미상'} · <span className="tnum">{n.routeIntervalNm.startNm}–{n.routeIntervalNm.endNm}NM</span>
                </Caption1>
              </div>
            </div>
          )
        })}
      </Card>
    </section>
  )
```

- [ ] **Step 3: Insert the section and pass conflicts to the banner (both desktop & mobile)**

In the mobile return (line ~552-553), change:

```jsx
            <BriefingBanner banner={briefing.banner} routeConflicts={routeConflicts} />
            {nav}{board}{layerAction}{adverse}{currentMobile}<BriefingSynopsis />{enroute}{notamSection}{destination}
```

In the desktop return (line ~582-583), change:

```jsx
      <BriefingBanner banner={briefing.banner} routeConflicts={routeConflicts} />
      {nav}{board}{layerAction}{adverse}{currentDesktop}<BriefingSynopsis />{enroute}{notamSection}{destination}
```

Add a nav step for the section — change the `steps` array (lines 99-108) to include a NOTAM step when present. Since `routeNotams` is computed after `steps`, compute a boolean up top instead: replace the `steps` block with:

```jsx
  const hasNotam = (briefing?.routeNotams ?? []).length > 0
  const steps = briefing
    ? [
        { id: 'banner', label: 'Go/No-go' },
        { id: 'adverse', label: '① 위험' },
        { id: 'current', label: '② 현재' },
        { id: 'synopsis', label: '③ 개황' },
        ...(hasEnroute ? [{ id: 'enroute', label: '④ 노선' }] : []),
        ...(hasNotam ? [{ id: 'notam', label: 'NOTAM' }] : []),
        { id: 'destination', label: '⑤ 목적지' },
      ]
    : []
```

- [ ] **Step 4: Add minimal styles**

Edit `frontend/src/features/route-briefing/BriefingView.css` — append (reuse existing `bv-haz-row` spacing conventions):

```css
.bv-notam-row { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-top: 1px solid var(--stroke-1, #e5e7eb); }
.bv-notam-row:first-of-type { border-top: none; }
.bv-notam-main { min-width: 0; }
.bv-notam-line1 { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
.bv-banner-notam { margin-top: 6px; }
```

(If `--stroke-1` is not defined in this project, use the literal fallback shown — `#e5e7eb`.)

- [ ] **Step 5: Build**

Run: `cd frontend && npm run build`
Expected: build succeeds, no unresolved imports.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css
git commit -m "feat(notam): route NOTAM subsection under ④노선 + conflict highlight"
```

---

## Task 9: Full test + build gate

**Files:** none (verification only)

- [ ] **Step 1: Backend full suite**

Run: `cd backend && node --test`
Expected: all PASS.

- [ ] **Step 2: Frontend unit tests + build**

Run: `cd frontend && node --test && npm run build`
Expected: all PASS, build succeeds.

- [ ] **Step 3: Commit (only if any fixups were needed)**

```bash
git add -A
git commit -m "test(notam): phase C green — backend + frontend"
```

---

## Task 10: Browser smoke (Playwright)

**Files:** temporary Playwright script (scratchpad; do not commit).

Read `docs/dev-server-and-capture.md` first and follow its verified ProjectAMO server + capture procedure. Do NOT use `preview_*` MCP tools (project rule §8).

- [ ] **Step 1: Start backend + frontend per docs/dev-server-and-capture.md.**

Precondition: `store.getCached('notam')` must have data. If the live crawler hasn't populated it, temporarily seed `backend/data/notam/latest.json` with a small fixture containing (a) a `danger`/`airport` polygon crossing a test route at low altitude (conflict), and (b) an `obstacle` polygon on-route (listed, not conflict). Note the seed in the smoke log; do not commit the seed.

- [ ] **Step 2: Drive the UI:** enter a route (departure → arrival) whose great-circle passes the seeded polygons, generate the briefing.

- [ ] **Step 3: Assert & screenshot:**
  - "경로상 NOTAM" subsection appears under ④노선 and lists both NOTAMs with category label + time-state glyph/color + summary + altitude.
  - The `danger` (in-effect, on-route, at altitude) NOTAM shows "경로 저촉" and a red conflict banner strip appears; the summary board shows the "경로 저촉 N" chip.
  - The `obstacle`-only case (remove the danger seed, keep obstacle) shows the NOTAM in the list but **no** conflict banner and **no** chip.
  - "지도에 관련 레이어 보기" reveals a `NOTAM` chip; toggling it on shows **only the route-matched** NOTAMs on the map (seed an extra off-route NOTAM and confirm it does NOT appear while the chip is active); switching back to "입력 보기"/closing the briefing restores all NOTAMs.

Capture screenshots for both the conflict and no-conflict states, plus the route-only map state.

- [ ] **Step 4: Update `Architecture.md`** if a File Role memo drifted (new `notam-briefing.js`; briefing now emits `routeNotams`/`routeConflicts`). Keep it to one line each; remove a line before adding if possible.

---

## Self-Review

**1. Spec coverage (§Route-Briefing Integration 1-4 + §알려진 한계 + §Testing):**
- §1 `matchItems` core reuse → routeNotams (facts), fir excluded, sorted active-first + entry-distance → **Task 2**. routeConflicts = 3-AND (restriction ∩ in-effect ∩ altitude-pass), binary flag, no `hazardLevel()` → **Task 2** (`RESTRICTION_CATEGORIES`, `conflict`).
- §2 server injection → **Task 4**.
- §3 BriefingView "경로상 NOTAM" subsection + conflict highlight; BriefingBanner conflict strip → **Tasks 7, 8**.
- §4 hazardLayers RULEBOOK → `['notam']` chip; `notam` already in `MET_LAYERS` (Phase B, confirmed line 124) → **Task 5**. Chip shows **route-matched NOTAMs only** (user decision 2026-07-04) via `idFilter` on `setNotamCategoryFilter`, wired in MapView's existing NOTAM sync effect → **Task 6**.
- §알려진 한계 LineString/Point not matched → inherent in `routeIntervalInGeometry` (Polygon/MultiPolygon only); no code needed, covered by `matchRouteNotams` off-route/entered semantics. Altitude F)/G) vs Q-line already normalized by Phase A parser into `altitude`; `notamBandToFt` consumes it → **Task 1**.
- §Testing route-match / fir-exclude / time-window / conflict / banner cases → **Tasks 2, 3**; browser smoke → **Task 9**.

**2. Placeholder scan:** No TBD/TODO. Every code step shows full code. Playwright script content is procedural (Task 9) but references the mandated project doc and lists exact assertions — acceptable since the doc owns the verified commands.

**3. Type consistency:** `matchRouteNotams(items, ctx)` returns `{ routeNotams, routeConflicts }` — same names used by composer (Task 3), BriefingView (Task 7), hazardLayers (Task 5). Each routeNotam field (`id, category, summary, altitude, validFrom, validTo, routeIntervalNm, conflict, activeAtEtd, bandFt, verticalKnown`) is defined in Task 2 and only these are read downstream. `notamBandToFt` name consistent Tasks 1→2. Frontend reuses `deriveTimeState/formatAltitude/notamSummary/NOTAM_CATEGORIES/TIME_STATE` — all confirmed exports of `notamViewModel.js`. `setNotamCategoryFilter`'s new 4th param `idFilter` (Task 6) is optional with a `null` default, so the existing MapView call is backward-compatible; the only caller passing it is the same effect (Task 6 Step 5).

**Note on numbering:** spec says "③노선" but the live BriefingView route section is "④ 노선·공역"; the subsection attaches after the enroute (④) section — intent (under the route section) preserved.
