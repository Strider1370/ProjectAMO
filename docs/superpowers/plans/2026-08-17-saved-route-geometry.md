# 1단계: 저장 경로에 기하 남기기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경로를 저장할 때 완성된 경로선·스켈레톤·AIRAC 주기·교체공항을 함께 남겨, 알림 스케줄러가 저장 경로를 건너뛰지 않게 한다.

**Architecture:** 저장 시점의 `routeDesigns[base].routeResult`에서 기하를 뽑는 순수 모듈을 새로 만들고, `routeStore.js`가 그 필드를 보존하도록 하고, `RouteBriefingPanel`의 저장 함수가 이를 채운다. 백엔드는 `buildBriefingRequest`가 실제 payload 모양(`base.routeForm`)을 읽도록 고치고, 기하가 없어 건너뛸 때 로그를 남긴다.

**Tech Stack:** React 18 + Fluent UI (frontend), Express + better-sqlite3 (backend), `node --test` (both).

## Global Constraints

- 스펙: [`docs/superpowers/specs/2026-08-17-saved-route-briefing-and-push-design.md`](../specs/2026-08-17-saved-route-briefing-and-push-design.md)
- **저장 payload 상한 20,000 B** (`backend/src/me/routes.js:8` `MAX_PAYLOAD`). 초과 시 저장이 400 `payload_too_large`로 거부된다.
- **`enrouteGeometry`는 IFR만 저장한다.** VFR은 `routeGeometry`가 곧 스켈레톤이므로 중복 저장하지 않는다.
- 새 필드는 전부 **스냅샷 최상위**에 둔다. 백엔드 `buildBriefingRequest`가 `payload.routeGeometry` / `payload.enrouteGeometry`를 최상위에서 읽는다.
- Linux 전용. `npm`, `bash`만 사용한다. PowerShell·`.cmd`·`C:\` 경로 금지.
- 테스트는 `node --test`. 프레임워크를 추가하지 않는다.
- 코드 주석은 기존 파일의 한국어 톤을 따른다.
- **작업 트리 주의:** 다른 세션이 `useRouteBriefing.js`, `routePreview.js`, `routeTokens.js`, `routeImportResolve.js`를 수정 중이다. **이 계획은 그 네 파일을 건드리지 않는다.** 커밋 시 `git add`로 해당 태스크의 파일만 골라 담는다. `git add -A` 금지.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `frontend/src/features/route-briefing/lib/routeSaveGeometry.js` | 저장용 기하 2종 추출 (순수) | **신규** |
| `frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js` | 위 테스트 | **신규** |
| `frontend/src/features/route-briefing/lib/routePlanner.js` | `loadNavdata()`가 `publicationId` 노출 | 수정 |
| `frontend/src/features/route-briefing/lib/routeStore.js` | 새 최상위 필드 보존 | 수정 |
| `frontend/src/features/route-briefing/lib/routeStore.test.js` | 위 테스트 | 신규 또는 수정 |
| `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` | 저장 시 필드 채우기 | 수정 |
| `backend/src/alerts/scheduler.js` | 실제 payload 모양 읽기 + 침묵 제거 | 수정 |
| `backend/test/alert-scheduler.test.js` | 위 테스트 | 수정 |

---

## 배경 — 왜 이걸 하는가

`normalizeRouteSnapshot`(`routeStore.js:30`)이 저장하는 것은 입력값뿐이다. 완성된 경로선이 없다. 그래서 `buildBriefingRequest`(`scheduler.js:32`)가 `payload.routeGeometry ?? payload.enrouteGeometry`를 읽으면 `undefined`가 나오고 `null`을 반환한다. `runTick`은 그 경로를 **조용히 건너뛴다**(`scheduler.js:222`). 에러도 로그도 없다.

**조사 중 두 번째 어긋남을 발견했다.** `buildBriefingRequest`는 `p.routeForm`을 **최상위에서** 읽는다(`scheduler.js:38`). 그러나 실제 payload에서 `routeForm`은 `base.routeForm` 아래에 있다. 또한 `routes` 테이블의 `dep`/`dest`/`altn`/`rules` 컬럼은 저장·알림등록 어느 경로에서도 채워지지 않는다(`me/routes.js:52`, `me/alerts.js:62`는 `name`/`etd`/`eta`/`payload`만 넣는다). 따라서 **기하를 저장해도 출발·도착 공항이 `undefined`가 되어 브리핑이 성립하지 않는다.** 스펙의 "백엔드는 손대지 않는다"는 이 발견으로 무효다 — Task 5가 이를 고친다.

기존 테스트(`backend/test/alert-scheduler.test.js:35`)는 `routeForm`을 최상위에 둔 가짜 payload를 쓴다. **테스트가 어긋남을 그대로 인코딩해서 통과하고 있었다.** Task 5에서 실제 모양의 테스트를 추가한다.

`alternateAirport`도 저장되지 않는다. 로더는 `saved.alternateAirport`를 기대하지만(`useRouteBriefing.js:1865`) 저장 함수가 쓴 적이 없다. Task 4에서 함께 넣는다.

---

### Task 1: `loadNavdata()`가 AIRAC 주기를 노출한다

`enroute.json`에 `publicationId: "2026-06-25"`가 있으나 `loadNavdata()`가 버린다. 저장 시점에 읽을 수 있어야 한다.

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routePlanner.js:85-113`
- Test: `frontend/src/features/route-briefing/lib/routePlanner.cache.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `loadNavdata()` 반환 객체에 `publicationId: string | null` 추가. Task 4가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/route-briefing/lib/routePlanner.cache.test.js` 끝에 추가한다. 이 파일의 기존 `fetch` 스텁 방식(`jsonResponse`, `stub`)을 그대로 재사용한다 — 파일 상단을 먼저 읽고 같은 헬퍼 이름을 쓴다.

```js
test('loadNavdata: enroute.json의 publicationId를 그대로 노출한다', async () => {
  const navdata = await loadNavdata()
  assert.equal(navdata.publicationId, ENROUTE.publicationId)
})
```

`ENROUTE` 픽스처에 `publicationId`가 없으면 픽스처에 `publicationId: '2026-06-25'`를 추가한다.

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routePlanner.cache.test.js
```

Expected: FAIL — `undefined !== '2026-06-25'`

- [ ] **Step 3: 최소 구현**

`routePlanner.js:105`의 반환 객체에 한 줄 추가한다.

```js
    return {
      // AIRAC 주기 — 저장 경로에 기록해 나중에 "이 경로는 어느 주기 기준인가"를 말할 수 있게 한다.
      publicationId: enroute.publicationId ?? null,
      // 공항: 겹침 없음(국내 RK / 해외 그 외)
      airports: { ...airports, ...(airportsO || {}) },
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routePlanner.cache.test.js
```

Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routePlanner.js frontend/src/features/route-briefing/lib/routePlanner.cache.test.js
git commit -m "feat(route): expose navdata publicationId"
```

---

### Task 2: 저장용 기하 추출 모듈

저장 시점에 두 가지를 뽑는다. **최종선**(절차 포함)은 기존 `getCurrentRouteLineString()`이 이미 만들어 준다. **스켈레톤**(절차 제외)은 `routeResult.previewGeojson`에 그대로 들어 있다 — 절차 증강은 표시 시점에 일어나므로 `routeResult`는 증강 전 상태다.

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeSaveGeometry.js`
- Test: `frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js`

**Interfaces:**
- Consumes: `getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })` from `./routeBriefingModel.js` — `{ type: 'LineString', coordinates: [[lon,lat],...] } | null` 반환.
- Produces: `buildSavedGeometry(args) -> { routeGeometry: LineString|null, enrouteGeometry: LineString|null }`. Task 4가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSavedGeometry } from './routeSaveGeometry.js'

const line = (coordinates) => ({ type: 'LineString', coordinates })
const previewOf = (coordinates) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: line(coordinates) }],
})

const SKELETON = [[126.45, 37.45], [127.0, 36.5], [128.6, 35.2]]
const SID = { fixes: [
  { id: 'RWY33L', coordinates: { lat: 37.454, lon: 126.46 } },
  { id: 'CG050', coordinates: { lat: 37.371, lon: 126.585 } },
] }

test('IFR + 절차: 최종선과 스켈레톤을 모두 낸다', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'IFR', previewGeojson: previewOf(SKELETON) },
    selectedSid: SID,
  })
  assert.equal(result.routeGeometry.type, 'LineString')
  assert.ok(result.routeGeometry.coordinates.length > SKELETON.length, '절차가 붙어 최종선이 더 길어야 한다')
  assert.deepEqual(result.enrouteGeometry.coordinates, SKELETON)
})

test('IFR + 절차 없음: 최종선만 낸다 (스켈레톤 중복 저장 안 함)', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'IFR', previewGeojson: previewOf(SKELETON) },
  })
  assert.deepEqual(result.routeGeometry.coordinates, SKELETON)
  assert.equal(result.enrouteGeometry, null)
})

test('VFR: 최종선만 낸다 — 경로선이 곧 스켈레톤', () => {
  const result = buildSavedGeometry({
    routeResult: { flightRule: 'VFR' },
    vfrWaypoints: [{ lon: 126.4, lat: 37.4 }, { lon: 127.1, lat: 36.9 }],
  })
  assert.deepEqual(result.routeGeometry.coordinates, [[126.4, 37.4], [127.1, 36.9]])
  assert.equal(result.enrouteGeometry, null)
})

test('경로 없음: 둘 다 null', () => {
  assert.deepEqual(buildSavedGeometry({ routeResult: null }), { routeGeometry: null, enrouteGeometry: null })
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeSaveGeometry.test.js
```

Expected: FAIL — `Cannot find module './routeSaveGeometry.js'`

- [ ] **Step 3: 최소 구현**

Create `frontend/src/features/route-briefing/lib/routeSaveGeometry.js`:

```js
// 저장용 기하 추출 — 저장 시점의 routeResult에서 "다시 검색하지 않고 복원할 수 있는" 선을 뽑는다.
// routeGeometry = 절차 포함 최종선(브리핑·알림이 실제로 쓰는 것).
// enrouteGeometry = 절차 제외 스켈레톤. IFR만 — VFR은 최종선이 곧 스켈레톤이라 중복 저장하면 20KB 상한만 먹는다.
import { getCurrentRouteLineString } from './routeBriefingModel.js'

const ROUTE_LINE_ROLE = 'route-preview-line'

// routeResult.previewGeojson은 절차 증강 **전** 상태다(증강은 표시 시점에 일어난다) → 그대로 스켈레톤.
function skeletonOf(routeResult) {
  const coordinates = routeResult?.previewGeojson?.features
    ?.find((feature) => feature.properties?.role === ROUTE_LINE_ROLE)?.geometry?.coordinates
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? { type: 'LineString', coordinates }
    : null
}

export function buildSavedGeometry({
  routeResult = null,
  vfrWaypoints = [],
  selectedSid = null,
  selectedStar = null,
  selectedIap = null,
} = {}) {
  const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
  if (!routeGeometry) return { routeGeometry: null, enrouteGeometry: null }
  if (routeResult?.flightRule === 'VFR') return { routeGeometry, enrouteGeometry: null }

  const skeleton = skeletonOf(routeResult)
  // 절차가 하나도 안 붙었으면 최종선 == 스켈레톤 → 두 번 저장할 이유가 없다.
  // ponytail: 길이 비교로 동일 판정. 좌표를 전부 비교할 만큼 값어치 있는 정확도가 아니다.
  const unchanged = skeleton && skeleton.coordinates.length === routeGeometry.coordinates.length
  return { routeGeometry, enrouteGeometry: unchanged ? null : skeleton }
}

export default { buildSavedGeometry }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeSaveGeometry.test.js
```

Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeSaveGeometry.js frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js
git commit -m "feat(route): extract saved route geometry"
```

---

### Task 3: `routeStore`가 새 필드를 보존한다

`normalizeRouteSnapshot`은 v3 분기에서 **필드를 명시적으로 나열해 되돌린다**(`routeStore.js:30-40`). 나열에 없는 필드는 조용히 버려진다. 새 필드 넷을 나열에 추가한다.

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeStore.js:30-40`
- Test: `frontend/src/features/route-briefing/lib/routeStore.test.js` (없으면 생성)

**Interfaces:**
- Consumes: 없음
- Produces: `normalizeRouteSnapshot(snapshot)`이 최상위 `routeGeometry`, `enrouteGeometry`, `airacCycle`, `alternateAirport`를 보존한다. Task 4가 의존한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`frontend/src/features/route-briefing/lib/routeStore.test.js`가 이미 있으면 아래 테스트를 추가하고, 없으면 이 내용으로 생성한다.

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeRouteSnapshot } from './routeStore.js'

const GEOM = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9]] }
const SKEL = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9], [128.0, 36.0]] }

test('normalizeRouteSnapshot: 기하·AIRAC·교체공항을 최상위에 보존한다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' }, enroute: {}, routeString: 'SEL' },
    cruiseAltitudeFt: 31000,
    routeGeometry: GEOM,
    enrouteGeometry: SKEL,
    airacCycle: '2026-06-25',
    alternateAirport: 'RKPK',
  })
  assert.deepEqual(out.routeGeometry, GEOM)
  assert.deepEqual(out.enrouteGeometry, SKEL)
  assert.equal(out.airacCycle, '2026-06-25')
  assert.equal(out.alternateAirport, 'RKPK')
})

test('normalizeRouteSnapshot: 새 필드가 없으면 null로 채운다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'VFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(out.routeGeometry, null)
  assert.equal(out.enrouteGeometry, null)
  assert.equal(out.airacCycle, null)
  assert.equal(out.alternateAirport, null)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
```

Expected: FAIL — `undefined` vs `GEOM`

- [ ] **Step 3: 최소 구현**

`routeStore.js`의 v3 분기(`if (snapshot.version === 3 && snapshot.base) return {`)에 네 줄을 추가한다.

```js
  if (snapshot.version === 3 && snapshot.base) return {
    version: 3,
    base: persistedDesign(snapshot.base),
    alternatives: (snapshot.alternatives ?? []).map(persistedDesign),
    selectedAlternativeId: snapshot.selectedAlternativeId ?? null,
    cruiseAltitudeFt: snapshot.cruiseAltitudeFt,
    etd: snapshot.etd,
    tasKt: snapshot.tasKt,
    etaPolicy: snapshot.etaPolicy,
    // 재검색 없이 복원하기 위한 기하 — 백엔드 buildBriefingRequest가 최상위에서 읽는다.
    routeGeometry: snapshot.routeGeometry ?? null,
    enrouteGeometry: snapshot.enrouteGeometry ?? null,
    // 저장 당시 AIRAC 주기. 기록만 한다(이번 범위에서 화면에 쓰지 않는다) — 나중엔 소급이 불가능하다.
    airacCycle: snapshot.airacCycle ?? null,
    alternateAirport: snapshot.alternateAirport ?? null,
  }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
```

Expected: PASS

- [ ] **Step 5: 프론트엔드 전체 테스트로 회귀를 확인한다**

```bash
npm --prefix frontend test
```

Expected: 기존 테스트 전부 PASS

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeStore.js frontend/src/features/route-briefing/lib/routeStore.test.js
git commit -m "feat(route): persist geometry and airac cycle in saved snapshot"
```

---

### Task 4: 저장 함수가 새 필드를 채운다

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx:355-379` (`handleSaveCurrentRoute`)

**Interfaces:**
- Consumes: `buildSavedGeometry` (Task 2), `loadNavdata().publicationId` (Task 1), `normalizeRouteSnapshot`의 보존 필드 (Task 3).
- Produces: 없음 (종단)

이 태스크는 UI 상호작용이라 유닛 테스트로 덮지 않는다. **검증은 Task 7의 실제 저장으로 한다.** 대신 Task 2·3이 로직을 이미 덮고 있어 여기 남는 것은 배선뿐이다.

- [ ] **Step 1: import를 추가한다**

`RouteBriefingPanel.jsx` 상단의 기존 `./lib/...` import 무리 옆에 붙인다.

```js
import { buildSavedGeometry } from './lib/routeSaveGeometry.js'
import { loadNavdata } from './lib/routePlanner.js'
```

`loadNavdata`가 이미 import 되어 있으면 중복해서 넣지 않는다.

- [ ] **Step 2: 패널이 이미 갖고 있는 값을 확인한다**

`RouteBriefingPanel.jsx:205`에 `const { isFirInMode, isFirExitMode, selectedIap, ... } = derived`가 있다. `selectedSid`, `selectedStar`, `routeResult`, `vfrWaypoints`, `alternateAirport`도 이 컴포넌트 스코프에 있는지 확인한다. 없는 것이 있으면 `useRouteBriefing()` 구조분해(`:157` 부근)에서 꺼낸다 — **훅 파일 자체는 수정하지 않는다.** 훅이 이미 반환하고 있는 값만 꺼내 쓴다.

- [ ] **Step 3: `handleSaveCurrentRoute`에 기하를 채운다**

`const base = routeDesigns.find(...)` 다음 줄에 삽입하고, `saveRoute(...)` 인자에 네 필드를 더한다.

```js
    const base = routeDesigns.find((design) => design.id === 'base')
    const { routeGeometry, enrouteGeometry } = buildSavedGeometry({
      routeResult: base?.routeResult ?? routeResult,
      vfrWaypoints,
      selectedSid: base?.procedures?.sid ?? selectedSid,
      selectedStar: base?.procedures?.star ?? selectedStar,
      selectedIap,
    })
    const airacCycle = (await loadNavdata()).publicationId ?? null
    await saveRoute(name.trim() || def, {
      version: 3,
      cruiseAltitudeFt, tasKt, etd,
      routeGeometry, enrouteGeometry, airacCycle,
      alternateAirport: alternateAirport || null,
      selectedAlternativeId: selectedRouteDesignId === 'base' ? null : selectedRouteDesignId,
      base: base && {
```

나머지 `base: {...}`, `alternatives: [...]`는 그대로 둔다.

- [ ] **Step 4: 빌드가 깨지지 않는지 확인한다**

```bash
npm --prefix frontend run build
```

Expected: 성공. 실패하면 `alternateAirport`·`vfrWaypoints`·`selectedSid`·`selectedStar`가 스코프에 없다는 뜻이다 — Step 2로 돌아가 훅 반환값에서 꺼낸다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx
git commit -m "feat(route): save route geometry, airac cycle, alternate"
```

---

### Task 5: 백엔드가 실제 payload 모양을 읽는다

`buildBriefingRequest`가 `p.routeForm`을 최상위에서 읽는데 실제 payload는 `p.base.routeForm`이다. `routes.dep`/`dest`/`altn` 컬럼도 채워진 적이 없어 폴백도 없다. 기하만 저장해서는 여전히 브리핑이 성립하지 않는다.

**Files:**
- Modify: `backend/src/alerts/scheduler.js:32-47`
- Test: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: Task 3·4가 저장하는 payload 모양.
- Produces: `buildBriefingRequest(route)`가 `base.routeForm` 형태의 실제 payload에서 유효한 요청 body를 낸다. Task 6이 이에 의존한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/alert-scheduler.test.js`에 추가한다. 파일 상단의 `GEOM`·`ETD`·`ETA` 상수를 재사용한다.

**중요:** 기존 테스트의 `mk`(`:47`)는 `dep: 'RKSI', dest: 'RKPC'`를 채운 행을 만든다. 실제 저장·알림등록 경로는 그 컬럼을 **비운 채로** 행을 만든다(`me/routes.js:52`, `me/alerts.js:62`). 그래서 기존 테스트가 어긋남을 가린다. 새 테스트는 컬럼을 `null`로 둔다.

```js
test('buildBriefingRequest: 실제 저장 모양(base.routeForm, dep/dest 컬럼 없음)', () => {
  // 실제 행: dep/dest/altn/rules 컬럼은 저장·알림등록 어느 쪽도 채우지 않는다 → payload만이 유일한 출처.
  const realRow = (payload) => ({
    payload: JSON.stringify(payload), etd: ETD, eta: ETA,
    dep: null, dest: null, altn: null, rules: null,
  })
  const req = buildBriefingRequest(realRow({
    version: 3,
    base: {
      routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' },
      enroute: {}, routeString: 'SEL',
    },
    routeGeometry: GEOM,
    alternateAirport: 'RKPK',
    cruiseAltitudeFt: 31000,
  }))
  assert.ok(req, '실제 저장 모양에서 null이 나오면 안 된다')
  assert.equal(req.departureAirport, 'RKSI')
  assert.equal(req.arrivalAirport, 'RKPC')
  assert.equal(req.alternateAirport, 'RKPK')
  assert.equal(req.flightRule, 'IFR')
  assert.equal(req.plannedCruiseAltitudeFt, 31000)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: FAIL — `departureAirport`가 `undefined`

- [ ] **Step 3: 최소 구현**

`scheduler.js:38`의 `const form = ...` 한 줄을 바꾼다.

```js
  // routeForm은 실제 저장 payload에서 base 아래에 있다(routeStore.normalizeRouteSnapshot).
  // 최상위 폴백은 구형/합성 payload용으로 남긴다.
  const form = p.base?.routeForm ?? p.routeForm ?? {}
```

나머지 줄은 그대로 둔다 — `p.alternateAirport`는 이미 최상위를 읽고 있고 Task 4가 거기에 쓴다.

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: PASS. 기존 테스트도 전부 PASS여야 한다(최상위 폴백을 남겼으므로).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/alerts/scheduler.js backend/test/alert-scheduler.test.js
git commit -m "fix(alerts): read routeForm from the shape actually saved"
```

---

### Task 6: 침묵을 없앤다

기하가 없어 건너뛸 때 아무 흔적이 없다. 이것이 이 사고가 몇 주간 보이지 않은 실질적 원인이다.

**Files:**
- Modify: `backend/src/alerts/scheduler.js:215-232` (`runTick`)
- Test: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: Task 5의 `buildBriefingRequest`.
- Produces: `runTick(db, now)`가 `{ evaluated, fired, skipped }`를 반환한다. `dev/scenario.js`의 `/tick`이 그대로 노출한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`runTick`을 import 목록(`:5`)에 추가한다. DB는 이 파일의 다른 테스트와 같이 `createDb(':memory:')`를 직접 쓴다.

```js
test('runTick: 기하 없는 경로를 세어서 반환한다', async () => {
  const db = createDb(':memory:')
  const now = Date.parse('2026-08-17T00:00:00Z')
  const nowIso = new Date(now).toISOString()
  const etd = new Date(now + 60 * 60 * 1000).toISOString() // 감시창(ETD-2h ~ ETD) 안
  const uid = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?,?,?)")
    .run('pilot-skip', 'x', nowIso).lastInsertRowid
  // 기하 없는 payload — 실제 오늘의 저장 결과와 같은 모양.
  const payload = JSON.stringify({
    version: 3,
    base: { routeForm: { flightRule: 'IFR', departureAirport: 'RKSI', arrivalAirport: 'RKPC' }, enroute: {}, routeString: 'SEL' },
  })
  db.prepare(`INSERT INTO routes (user_id, name, etd, payload, alert_enabled, alert_start_min_before_etd, created_at, updated_at)
    VALUES (?,?,?,?,1,120,?,?)`).run(uid, 'RKSI→RKPC', etd, payload, nowIso, nowIso)

  const result = await runTick(db, now)
  assert.equal(result.skipped, 1)
  assert.equal(result.evaluated, 0)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix backend test -- test/alert-scheduler.test.js
```

Expected: FAIL — `result.skipped`가 `undefined`

- [ ] **Step 3: 최소 구현**

`runTick`을 고친다.

```js
export async function runTick(db, now = Date.now()) {
  cleanupExpired(db, now)
  let evaluated = 0
  let fired = 0
  let skipped = 0
  for (const route of activeFlights(db, now)) {
    try {
      const res = recompute(route)
      // 저장 payload에 경로 기하가 없으면 브리핑을 재구성할 수 없다. 조용히 넘기지 않는다 —
      // 이 침묵 때문에 저장 경로가 한 건도 평가되지 않는 상태를 오래 알아채지 못했다.
      if (!res) {
        skipped++
        console.warn(`[alert-scheduler] route ${route.id} 건너뜀 — 저장 payload에 경로 기하 없음`)
        continue
      }
      evaluated++
      const { changes } = evaluateFlight({ db, route, briefing: res.briefing, tafByIcao: res.tafByIcao, now })
      // §5B group_wait: 이 비행의 이번 변화들을 텔레그램 1건으로 묶어 발송(인앱은 이미 행 저장).
      if (changes?.length) { await dispatchFlightAlerts(db, changes, route, { now }); fired += changes.length }
    } catch (err) {
      console.error(`[alert-scheduler] route ${route.id} 평가 실패:`, err.message)
    }
  }
  if (skipped) console.warn(`[alert-scheduler] ${skipped}개 경로를 기하 없음으로 건너뜀`)
  return { evaluated, fired, skipped }
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix backend test
```

Expected: 전체 PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/alerts/scheduler.js backend/test/alert-scheduler.test.js
git commit -m "fix(alerts): count and log routes skipped for missing geometry"
```

---

### Task 7: 실제 저장으로 관문을 통과한다

**이 태스크의 결과가 2단계 착수 여부를 가른다.** 유닛 테스트는 우리가 상상한 payload 모양만 검증한다. 실제 UI가 만드는 모양을 확인해야 한다.

**Files:** 없음 (검증만)

- [ ] **Step 1: 개발 서버를 띄운다**

```bash
npm run dev:serve
```

절차는 [dev-server-and-capture](../../operations/dev-server-and-capture.md)를 따른다.

- [ ] **Step 2: 로그인하고 경로 두 개를 저장한다**

브라우저에서 직접 한다.

1. **국내 IFR** — RKSI → RKPC, SID/STAR 선택까지 마치고 `경로 > ＋ 현재 경로 저장…`
2. **해외 IFR** — RKSI → RJTT (또는 기존에 실패하던 해외 노선), 같은 방식으로 저장

- [ ] **Step 3: payload를 눈으로 확인한다**

```bash
node backend/scripts/measure-route-payload.js
```

Expected:
- 경로 수 2
- 각 행에 `coords=`가 0이 아니다
- `proj=` 값이 20000 미만 — 스펙 실측표(해외 장거리 둘 다 저장 시 9,581 B)와 같은 자릿수여야 한다. 크게 벗어나면 멈추고 원인을 조사한다.

`airacCycle`과 `alternateAirport`도 들어갔는지 확인한다.

```bash
node -e "
const Database = require('better-sqlite3')
const db = new Database('backend/data/projectamo.db', { readonly: true })
for (const r of db.prepare('SELECT id, name, payload FROM routes').all()) {
  const p = JSON.parse(r.payload)
  console.log(r.id, r.name, {
    coords: p.routeGeometry?.coordinates?.length ?? 0,
    skeleton: p.enrouteGeometry?.coordinates?.length ?? 0,
    airac: p.airacCycle,
    altn: p.alternateAirport,
    dep: p.base?.routeForm?.departureAirport,
  })
}
"
```

- [ ] **Step 4: 비행 알림으로 등록한다**

설정 모달 > 개인설정 > 비행 알림 탭에서 위 경로를 템플릿으로 골라 ETD를 **현재 + 1시간**으로 등록한다. 감시 시작은 기본값(2시간 전)이면 바로 감시창 안에 든다.

- [ ] **Step 5: 관문 — 스케줄러를 1회 돌린다**

`dev/scenario.js`의 `/tick` 엔드포인트를 호출한다. 정확한 경로는 `backend/src/dev/scenario.js`에서 확인한다.

```bash
curl -s -X POST http://127.0.0.1:3000/api/dev/scenario/tick | cat
```

**Expected: `evaluated`가 1 이상, `skipped`가 0.**

`skipped`가 1 이상이면 서버 로그에 `route N 건너뜀 — 저장 payload에 경로 기하 없음`이 찍혀 있다. **그 경우 2단계로 넘어가지 않는다.** [systematic-debugging](../../../.claude/plugins/cache/superpowers-dev/superpowers/6.2.0/skills/systematic-debugging/SKILL.md)으로 근본 원인을 찾아 Task 4 또는 5로 돌아간다.

- [ ] **Step 6: 결과를 상태 파일에 남긴다**

`docs/superpowers/status/2026-08-17-saved-route-geometry.status.md`를 만들고 한 페이지 안에서 기록한다: 저장한 경로 2건의 실제 payload 크기, `runTick` 반환값, 남은 위험.

- [ ] **Step 7: 커밋**

```bash
git add docs/superpowers/status/2026-08-17-saved-route-geometry.status.md
git commit -m "docs: record stage 1 gate results"
```

---

## 완료 조건

- `npm test` (루트) 전체 통과
- `npm --prefix frontend run build` 성공
- Task 7 Step 5의 관문 통과 — `evaluated >= 1`, `skipped == 0`
- `git status`에 이 계획이 건드리지 않기로 한 네 파일(`useRouteBriefing.js`, `routePreview.js`, `routeTokens.js`, `routeImportResolve.js`)의 변경이 **우리 커밋에 섞이지 않았다**

## 이 단계에서 하지 않는 것

- 불러오기 경로 변경 — 2단계. `loadSavedRoute`는 그대로 재검색한다.
- `airacCycle`을 화면에 표시 — 기록만 한다.
- 알림 규칙 교체 — 3단계. 이 단계에서는 기존 7종 판정이 그대로 돈다.
- 저장 UI 변경 — 저장 버튼·이름 프롬프트 그대로.
