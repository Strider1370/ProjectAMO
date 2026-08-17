# 2단계: 재검색 없이 저장 경로 열기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장한 경로를 클릭 한 번에 브리핑 페이지로 연다. 항법 데이터를 다시 뒤지지 않고 저장된 것만 쓴다.

**Architecture:** 저장 시점에 이미 계산돼 있는 `routeModel`과 `routeMarkers`를 기하와 함께 저장한다(둘 다 좌표 목록이 아니라 이름·거리 배열이라 작다). 로드는 그 셋으로 브리핑 요청을 바로 조립한다 — `getProcedures`·`buildEditorPreview`·`runRouteSearch`를 호출하지 않는다. 기존 `loadSavedRoute`는 지우지 않고 남긴다.

**Tech Stack:** React 18 + Fluent UI, Express, `node --test`.

## Global Constraints

- 스펙: [`2026-08-17-saved-route-briefing-and-push-design.md`](../specs/2026-08-17-saved-route-briefing-and-push-design.md) · 선행: [1단계 상태](../status/2026-08-17-saved-route-geometry.status.md) (완료, main 병합)
- **저장 payload 상한 20,000 B** (`backend/src/me/routes.js:8`). 1단계 실측 기준선: 국내 IFR 2,721 B.
- **`routeModel`은 `routeGeometry`를 빼고 저장한다.** `routeModel` 안에 같은 선이 또 들어 있어 그대로 담으면 좌표가 두 번 저장된다. 로드 시 저장된 `routeGeometry`를 다시 끼운다.
- **재검색 금지.** 새 로드 경로에서 `getProcedures`, `loadIapData`, `buildEditorPreview`, `runRouteSearch`, `findShortestPath`를 호출하지 않는다. 이것이 이 단계의 존재 이유다.
- 새 필드는 스냅샷 **최상위**에 둔다(1단계와 동일).
- Linux 전용. 테스트는 `node --test`. 프레임워크 추가 금지.
- **작업 트리 주의:** 이 저장소는 여러 세션이 공유한다. `useRouteBriefing.js`는 다른 세션이 자주 건드리는 파일이다. 각 태스크 커밋 시 `git add`로 해당 파일만 골라 담는다. **`git add -A` 금지.** 커밋 전 `git status`로 남의 변경이 섞이지 않았는지 확인한다.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `frontend/src/features/route-briefing/lib/routeSaveGeometry.js` | 저장용 기하 + `routeModel`/`routeMarkers` 추출 | 수정 |
| `frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js` | 위 테스트 | 수정 |
| `frontend/src/features/route-briefing/lib/savedRouteBriefing.js` | 저장 스냅샷 → 브리핑 요청 입력 (순수) | **신규** |
| `frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js` | 위 테스트 | **신규** |
| `frontend/src/features/route-briefing/lib/routeStore.js` | 새 최상위 필드 보존 | 수정 |
| `frontend/src/features/route-briefing/lib/routeStore.test.js` | 위 테스트 | 수정 |
| `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` | 저장 시 새 필드 채우기 | 수정 |
| `frontend/src/features/route-briefing/useRouteBriefing.js` | 재검색 없는 로드 경로 추가 | 수정 |
| `frontend/src/features/map/MapView.jsx` | `loadRouteBriefing`을 새 경로로 | 수정 |
| `frontend/src/app/App.jsx` | 딥링크가 브리핑으로 직행 | 수정 |
| `frontend/src/features/personal/PersonalSettingsPanel.jsx` | 등록 비행 → 브리핑 열기 버튼 | 수정 |

---

## 배경 — 왜 재검색이 문제인가

현재 `loadSavedRoute`(`useRouteBriefing.js:1764`)는 저장된 입력값으로 **경로를 처음부터 다시 조립한다**:

1. `getProcedures(dep, 'SID')` / `getProcedures(arr, 'STAR')` / `loadIapData(arr)` — 절차를 라이브 조회
2. `buildEditorPreview(createRouteEditor({...}), saved.base.routeString)` — 경로 문자열을 다시 해석해 선을 만든다
3. 그 결과(`preview.result`)로 `routeGeometry`·`routeModel`을 계산

**절차 데이터는 한국 공항(`RK*`)에만 있다.** 해외 공항은 SID/STAR가 없고, 항로 그래프 탐색이 `No RNAV route path found`(`routePlanner.js:455`)로 실패한다. 저장된 경로선이 멀쩡히 있는데도 쓰지 않고 다시 찾다가 깨진다.

1단계에서 `routeGeometry`·`enrouteGeometry`는 저장하게 됐다. 남은 것은 **로드가 그것을 쓰게 만드는 것**이다.

## 왜 `routeModel`·`routeMarkers`도 저장해야 하는가

브리핑 요청은 `buildVerticalProfileRequest`(`verticalProfileRequest.js:69`)가 조립하고, 다음을 넘긴다: `flightRule`, `routeGeometry`, `routeModel`, `plannedCruiseAltitudeFt`, `procedureContext`, `routeMarkers`.

백엔드는 **NAVLOG 구간표를 `routeModel.enRouteSegments`에서 만든다**(`route-weather-legs.js:204`). 경로선만 넘기면 `enRouteSegments`가 빈 배열이 되어 구간표가 사라진다. 공항 기상·위험기상·단면도는 나오지만 구간별 착빙·난류 표가 빈다.

`routeMarkers`는 백엔드가 절차 그룹의 출발·도착 끝점을 잡는 데 쓴다(`route-weather-legs.js:120`).

둘 다 저장 시점에 이미 계산돼 있고 **좌표 목록이 아니다**:

- `routeModel.enRouteSegments[]` = `{id, kind, routeId, fromFix, toFix, routeType, sourceCycle, source, startNm, endNm, alignmentStatus}` — 좌표 없음
- `routeMarkers[]` = `{label, lon, lat, kind}` — 픽스 개수만큼(1단계 실측 경로는 11개)

그래서 저장해도 payload가 크게 늘지 않는다. Task 1의 관문에서 실측한다.

---

### Task 1: 저장에 `routeModel`·`routeMarkers`를 더한다

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeSaveGeometry.js`
- Modify: `frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js`

**Interfaces:**
- Consumes: `buildCommonRouteModel({routeGeometry, routeResult})` from `../../../../../shared/route-model.js`; `buildRouteProfileMarkersPayload({routeResult, vfrWaypoints})` from `./verticalProfileRequest.js`.
- Produces: `buildSavedGeometry(args)`가 `{ routeGeometry, enrouteGeometry, routeModel, routeMarkers }`를 반환한다. `routeModel`에는 `routeGeometry` 키가 **없다**. Task 3·4가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`routeSaveGeometry.test.js` 끝에 추가한다. 파일 상단의 `previewOf`, `SKELETON`, `SID`, `line`을 재사용한다.

```js
test('routeModel과 routeMarkers를 함께 낸다 — routeModel에 좌표선은 담지 않는다', () => {
  const routeResult = {
    flightRule: 'IFR',
    previewGeojson: previewOf(SKELETON),
    displaySequence: ['RKSS', 'BULTI', 'DOTOL', 'RKPC'],
    routeIds: ['A582'],
    segments: [{ id: 'A582-001', routeId: 'A582', kind: 'airway', geometry: [SKELETON[0], SKELETON[1]] }],
  }
  const result = buildSavedGeometry({ routeResult, selectedSid: SID })

  assert.equal(result.routeModel.schemaVersion, 1)
  assert.equal(result.routeModel.routeGeometry, undefined, 'routeGeometry는 따로 저장되므로 routeModel에 중복 담지 않는다')
  assert.ok(Array.isArray(result.routeModel.enRouteSegments))
  assert.equal(result.routeModel.enRouteSegments[0].routeId, 'A582')
  // routeMarkers는 항로 ID를 뺀 표시 순서에서 나온다.
  assert.deepEqual(result.routeMarkers.map((marker) => marker.label), ['RKSS', 'BULTI', 'DOTOL'])
  assert.equal(result.routeMarkers[0].kind, 'AIRPORT')
})

test('경로 없음: routeModel·routeMarkers도 null/빈배열', () => {
  const result = buildSavedGeometry({ routeResult: null })
  assert.equal(result.routeModel, null)
  assert.deepEqual(result.routeMarkers, [])
})
```

`routeMarkers`의 기대 라벨 수가 실제와 다르면(좌표 개수에 맞춰 잘리므로) 실제 출력을 보고 단언을 맞춘다 — `buildRouteProfileMarkersPayload`는 `baseCoordinates[index]`가 없는 라벨을 버린다. `SKELETON`이 3좌표라 라벨 3개까지만 남는 것이 정상이다.

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeSaveGeometry.test.js
```

Expected: FAIL — `result.routeModel`이 `undefined`

- [ ] **Step 3: 최소 구현**

`routeSaveGeometry.js`를 고친다.

```js
// 저장용 기하 추출 — 저장 시점의 routeResult에서 "다시 검색하지 않고 복원할 수 있는" 것만 뽑는다.
// routeGeometry = 절차 포함 최종선(브리핑·알림이 실제로 쓰는 것).
// enrouteGeometry = 절차 제외 스켈레톤. IFR만 — VFR은 최종선이 곧 스켈레톤이라 중복 저장하면 20KB 상한만 먹는다.
// routeModel/routeMarkers = 백엔드가 NAVLOG 구간표와 절차 그룹을 만드는 재료. 좌표 목록이 아니라 이름·거리라 싸다.
import { getCurrentRouteLineString } from './routeBriefingModel.js'
import { buildRouteProfileMarkersPayload } from './verticalProfileRequest.js'
import { buildCommonRouteModel } from '../../../../../shared/route-model.js'

const ROUTE_LINE_ROLE = 'route-preview-line'

// routeResult.previewGeojson은 절차 증강 **전** 상태다(증강은 표시 시점에 일어난다) → 그대로 스켈레톤.
function skeletonOf(routeResult) {
  const coordinates = routeResult?.previewGeojson?.features
    ?.find((feature) => feature.properties?.role === ROUTE_LINE_ROLE)?.geometry?.coordinates
  return Array.isArray(coordinates) && coordinates.length >= 2
    ? { type: 'LineString', coordinates }
    : null
}

// routeGeometry는 따로 저장하므로 routeModel에서 뺀다 — 안 빼면 같은 좌표선이 두 번 들어간다.
function modelWithoutGeometry(routeGeometry, routeResult) {
  try {
    const { routeGeometry: _dropped, ...rest } = buildCommonRouteModel({ routeGeometry, routeResult })
    return rest
  } catch {
    return null // 좌표가 2개 미만이면 buildCommonRouteModel이 던진다 — 저장은 계속되게 한다.
  }
}

export function buildSavedGeometry({
  routeResult = null,
  vfrWaypoints = [],
  selectedSid = null,
  selectedStar = null,
  selectedIap = null,
} = {}) {
  const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
  if (!routeGeometry) return { routeGeometry: null, enrouteGeometry: null, routeModel: null, routeMarkers: [] }

  const routeModel = modelWithoutGeometry(routeGeometry, routeResult)
  const routeMarkers = buildRouteProfileMarkersPayload({ routeResult, vfrWaypoints })

  if (routeResult?.flightRule === 'VFR') return { routeGeometry, enrouteGeometry: null, routeModel, routeMarkers }

  const skeleton = skeletonOf(routeResult)
  // 절차가 하나도 안 붙었으면 최종선 == 스켈레톤 → 두 번 저장할 이유가 없다.
  // ponytail: 길이 비교로 동일 판정. 좌표를 전부 비교할 만큼 값어치 있는 정확도가 아니다.
  const unchanged = skeleton && skeleton.coordinates.length === routeGeometry.coordinates.length
  return { routeGeometry, enrouteGeometry: unchanged ? null : skeleton, routeModel, routeMarkers }
}

export default { buildSavedGeometry }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeSaveGeometry.test.js
```

Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git status --short   # 남의 변경이 섞였는지 확인
git add frontend/src/features/route-briefing/lib/routeSaveGeometry.js frontend/src/features/route-briefing/lib/routeSaveGeometry.test.js
git commit -m "feat(route): save route model and markers alongside geometry"
```

---

### Task 2: `routeStore`가 새 필드 둘을 보존한다

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeStore.js` (v3 분기)
- Modify: `frontend/src/features/route-briefing/lib/routeStore.test.js`

**Interfaces:**
- Produces: `normalizeRouteSnapshot`이 최상위 `routeModel`, `routeMarkers`를 보존한다. Task 3이 의존한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
test('normalizeRouteSnapshot: routeModel·routeMarkers를 보존한다', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'IFR' }, enroute: {}, routeString: 'SEL' },
    routeGeometry: GEOM,
    routeModel: { schemaVersion: 1, enRouteSegments: [{ id: 'A582-001', routeId: 'A582' }] },
    routeMarkers: [{ label: 'RKSS', lon: 126.4, lat: 37.4, kind: 'AIRPORT' }],
  })
  assert.equal(out.routeModel.enRouteSegments[0].routeId, 'A582')
  assert.equal(out.routeMarkers[0].label, 'RKSS')
})

test('normalizeRouteSnapshot: routeModel·routeMarkers가 없으면 null/빈배열', () => {
  const out = normalizeRouteSnapshot({
    version: 3,
    base: { routeForm: { flightRule: 'VFR' }, enroute: {}, routeString: '' },
  })
  assert.equal(out.routeModel, null)
  assert.deepEqual(out.routeMarkers, [])
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
```

Expected: FAIL — `out.routeModel`이 `undefined`

- [ ] **Step 3: 최소 구현**

`routeStore.js`의 v3 분기, 1단계에서 넣은 네 줄 아래에 두 줄을 더한다.

```js
    routeGeometry: snapshot.routeGeometry ?? null,
    enrouteGeometry: snapshot.enrouteGeometry ?? null,
    // 백엔드가 NAVLOG 구간표·절차 그룹을 만드는 재료. 좌표선은 routeGeometry에만 있다.
    routeModel: snapshot.routeModel ?? null,
    routeMarkers: snapshot.routeMarkers ?? [],
    airacCycle: snapshot.airacCycle ?? null,
    alternateAirport: snapshot.alternateAirport ?? null,
  }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/routeStore.test.js
npm --prefix frontend test
```

Expected: 둘 다 PASS

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/routeStore.js frontend/src/features/route-briefing/lib/routeStore.test.js
git commit -m "feat(route): preserve route model and markers in saved snapshot"
```

---

### Task 3: 저장 스냅샷 → 브리핑 요청 입력 (순수 모듈)

로드 경로가 상태를 세팅하기 전에, **저장분만으로 브리핑 요청에 필요한 값이 다 나오는지**를 순수 함수로 못 박는다. 여기가 "재검색 안 함"의 계약이다.

**Files:**
- Create: `frontend/src/features/route-briefing/lib/savedRouteBriefing.js`
- Create: `frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js`

**Interfaces:**
- Consumes: `normalizeRouteSnapshot` (Task 2), `computeEtaIso` from `./etaCalc.js`.
- Produces:
  - `buildSavedBriefingInputs(saved) -> { ok: true, flightRule, departureAirport, arrivalAirport, alternateAirport, routeGeometry, routeModel, routeMarkers, etd, eta, cruiseAltitudeFt, tasKt, routeString, enroute, procedureIds } | { ok: false, reason: string }`
  - Task 4가 쓴다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `savedRouteBriefing.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { buildSavedBriefingInputs } from './savedRouteBriefing.js'

const GEOM = { type: 'LineString', coordinates: [[126.4, 37.4], [127.1, 36.9], [128.0, 36.0]] }
const MODEL = { schemaVersion: 1, enRouteSegments: [{ id: 'A582-001', routeId: 'A582', startNm: 0, endNm: 40 }] }
const MARKERS = [{ label: 'RKSS', lon: 126.4, lat: 37.4, kind: 'AIRPORT' }]

const savedRoute = (overrides = {}) => ({
  version: 3,
  base: {
    routeForm: { flightRule: 'IFR', departureAirport: 'RKSS', arrivalAirport: 'RKPC' },
    procedureIds: { sid: 'RKSS-SID-X', star: null, iapKey: null },
    enroute: { terms: [] },
    routeString: 'BULTI A582 DOTOL',
  },
  routeGeometry: GEOM,
  routeModel: MODEL,
  routeMarkers: MARKERS,
  alternateAirport: 'RKPK',
  cruiseAltitudeFt: 31000,
  tasKt: 450,
  etd: '2026-08-18T02:00:00Z',
  ...overrides,
})

test('저장분만으로 브리핑 입력이 완성된다', () => {
  const out = buildSavedBriefingInputs(savedRoute())
  assert.equal(out.ok, true)
  assert.equal(out.flightRule, 'IFR')
  assert.equal(out.departureAirport, 'RKSS')
  assert.equal(out.arrivalAirport, 'RKPC')
  assert.equal(out.alternateAirport, 'RKPK')
  assert.deepEqual(out.routeGeometry, GEOM)
  assert.equal(out.cruiseAltitudeFt, 31000)
  assert.equal(out.etd, '2026-08-18T02:00:00Z')
})

test('routeModel에 routeGeometry를 다시 끼운다 — 브리핑 요청이 그 모양을 기대한다', () => {
  const out = buildSavedBriefingInputs(savedRoute())
  assert.deepEqual(out.routeModel.routeGeometry, GEOM)
  assert.equal(out.routeModel.enRouteSegments[0].routeId, 'A582')
})

test('ETA가 없으면 거리·TAS로 계산한다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: null }))
  assert.ok(Number.isFinite(Date.parse(out.eta)), 'ETA가 계산돼야 한다')
  assert.ok(Date.parse(out.eta) > Date.parse(out.etd))
})

test('저장된 ETA가 있으면 그대로 쓴다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ eta: '2026-08-18T03:30:00Z' }))
  assert.equal(out.eta, '2026-08-18T03:30:00Z')
})

test('기하가 없으면 ok:false — 재검색으로 넘길 신호', () => {
  const out = buildSavedBriefingInputs(savedRoute({ routeGeometry: null, enrouteGeometry: null }))
  assert.equal(out.ok, false)
  assert.equal(out.reason, 'no_geometry')
})

test('routeModel이 없어도 브리핑은 성립한다 — 구간표만 빈다', () => {
  const out = buildSavedBriefingInputs(savedRoute({ routeModel: null }))
  assert.equal(out.ok, true)
  assert.deepEqual(out.routeModel.enRouteSegments, [])
  assert.deepEqual(out.routeModel.routeGeometry, GEOM)
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/savedRouteBriefing.test.js
```

Expected: FAIL — `Cannot find module './savedRouteBriefing.js'`

- [ ] **Step 3: 최소 구현**

Create `savedRouteBriefing.js`:

```js
// 저장 스냅샷 → 브리핑 요청 입력. 순수 함수 — 네트워크·항법데이터 조회 없음.
// 이 모듈이 "재검색하지 않는다"의 계약이다: 여기서 나오는 값만으로 브리핑이 성립해야 한다.
import { normalizeRouteSnapshot } from './routeStore.js'
import { computeEtaIso } from './etaCalc.js'

const EARTH_RADIUS_NM = 3440.065

function legNm([lon1, lat1], [lon2, lat2]) {
  const toRad = (value) => value * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(a))
}

// 저장된 선의 총 거리. 재검색 결과의 totalDistanceNm을 대신한다.
export function geometryDistanceNm(routeGeometry) {
  const coordinates = routeGeometry?.coordinates ?? []
  let total = 0
  for (let index = 1; index < coordinates.length; index += 1) total += legNm(coordinates[index - 1], coordinates[index])
  return Number(total.toFixed(2))
}

const isoOf = (value) => (Number.isFinite(Date.parse(value)) ? new Date(value).toISOString().replace('.000Z', 'Z') : null)

export function buildSavedBriefingInputs(rawSaved) {
  const saved = normalizeRouteSnapshot(rawSaved ?? {})
  const form = saved.base?.routeForm ?? saved.routeForm ?? {}
  const routeGeometry = saved.routeGeometry ?? saved.enrouteGeometry ?? null
  if (!routeGeometry?.coordinates || routeGeometry.coordinates.length < 2) return { ok: false, reason: 'no_geometry' }

  const etd = isoOf(saved.etd)
  const distanceNm = geometryDistanceNm(routeGeometry)
  const eta = isoOf(saved.eta) ?? isoOf(computeEtaIso(etd, distanceNm, saved.tasKt)) ?? null

  return {
    ok: true,
    flightRule: form.flightRule ?? 'IFR',
    departureAirport: form.departureAirport ?? null,
    arrivalAirport: form.arrivalAirport ?? null,
    alternateAirport: saved.alternateAirport || null,
    routeGeometry,
    // 브리핑 요청은 routeModel 안에 routeGeometry가 있는 모양을 기대한다(shared/route-model.js).
    // 저장 때 중복을 피해 뺐으므로 여기서 다시 끼운다.
    routeModel: { schemaVersion: 1, enRouteSegments: [], enRouteRange: null, terminalRanges: null, graphConnectionStatus: 'unavailable', ...(saved.routeModel ?? {}), routeGeometry },
    routeMarkers: saved.routeMarkers ?? [],
    etd,
    eta,
    cruiseAltitudeFt: Number(saved.cruiseAltitudeFt) || null,
    tasKt: saved.tasKt ?? null,
    distanceNm,
    routeString: saved.base?.routeString ?? '',
    enroute: saved.base?.enroute ?? null,
    procedureIds: saved.base?.procedureIds ?? {},
  }
}

export default { buildSavedBriefingInputs, geometryDistanceNm }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
npm --prefix frontend test -- src/features/route-briefing/lib/savedRouteBriefing.test.js
```

Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/lib/savedRouteBriefing.js frontend/src/features/route-briefing/lib/savedRouteBriefing.test.js
git commit -m "feat(route): build briefing inputs from a saved snapshot"
```

---

### Task 4: 재검색 없는 로드 경로

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` (`loadSavedRoute` 근처에 새 함수 추가, 훅 반환 객체에 노출)

**Interfaces:**
- Consumes: `buildSavedBriefingInputs` (Task 3).
- Produces: `openSavedRouteBriefing(saved)` — 훅의 `actions`에 노출. 성공 시 브리핑까지 렌더된 상태, 실패 시 `loadSavedRoute(saved, { autoBriefing: true })`로 위임. Task 5·6이 쓴다.

**Step 0 전 확인:** 이 파일은 크고 여러 세션이 건드린다. 시작 전 `git status`가 깨끗한지 확인하고, 아니면 멈추고 사람에게 알린다.

- [ ] **Step 1: import를 추가한다**

`useRouteBriefing.js`의 기존 `./lib/...` import 무리에 붙인다.

```js
import { buildSavedBriefingInputs } from './lib/savedRouteBriefing.js'
```

- [ ] **Step 2: 새 로드 함수를 `loadSavedRoute` 바로 위에 추가한다**

`fetchRouteBriefing`, `buildCrossSectionRequest`, `fetchVerticalProfile`, `fetchCrossSection`, `setBriefing`, `setFitBoundsRequest`, `setBriefingLoading`, `setBriefingError`, `setWorkflowStep`가 이 스코프에 이미 있다(`handleGenerateBriefing`이 쓴다). 그것들을 그대로 쓴다.

```js
  // 저장 경로를 재검색 없이 연다 — 저장된 기하·routeModel·markers만으로 브리핑을 만든다.
  // 해외 IFR은 절차 데이터가 없어 재검색(getProcedures/buildEditorPreview)이 깨진다. 그 경로를 아예 타지 않는다.
  // 저장분이 부족하면(구형 저장분) 기존 재검색 경로로 위임한다.
  async function openSavedRouteBriefing(saved) {
    const inputs = buildSavedBriefingInputs(saved)
    if (!inputs.ok) return loadSavedRoute(saved, { autoBriefing: true })
    if (!inputs.etd || !inputs.eta) { setBriefingError('저장된 경로에 ETD/ETA가 없습니다.'); return }

    const resetVersion = routeResetVersionRef.current
    setBriefingLoading(true)
    setBriefingError(null)
    try {
      const plannedCruiseAltitudeFt = inputs.cruiseAltitudeFt || DEFAULT_CRUISE_ALTITUDE_FT
      const result = await fetchRouteBriefing({
        flightRule: inputs.flightRule,
        routeGeometry: inputs.routeGeometry,
        routeModel: inputs.routeModel,
        routeMarkers: inputs.routeMarkers,
        plannedCruiseAltitudeFt,
        candidateCruiseAltitudesFt: [],
        sampleSpacingMeters: 250,
        departureAirport: inputs.departureAirport,
        arrivalAirport: inputs.arrivalAirport,
        alternateAirport: inputs.alternateAirport,
        etd: inputs.etd,
        eta: inputs.eta,
      })
      if (resetVersion !== routeResetVersionRef.current) return
      setRouteForm((previous) => ({
        ...previous,
        flightRule: inputs.flightRule,
        departureAirport: inputs.departureAirport ?? '',
        arrivalAirport: inputs.arrivalAirport ?? '',
      }))
      setAlternateAirport(inputs.alternateAirport || '')
      if (inputs.etd) setEtd(inputs.etd)
      setEta(inputs.eta)
      if (inputs.tasKt) updateTasKt(inputs.tasKt)
      if (Number.isFinite(Number(inputs.cruiseAltitudeFt))) updateCruiseAltitudeFt(Number(inputs.cruiseAltitudeFt))
      setBriefing(result)
      setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: inputs.routeGeometry.coordinates, maxZoom: 8 })
      setWorkflowStep('briefing')
      // 단면도는 있으면 좋고 없어도 브리핑은 성립한다.
      try {
        const cs = await fetchCrossSection(buildCrossSectionRequest({ routeGeometry: inputs.routeGeometry, etd: inputs.etd }))
        if (resetVersion === routeResetVersionRef.current) setCrossSection(cs)
      } catch { /* optional */ }
    } catch (err) {
      setBriefingError(err.message)
    } finally {
      setBriefingLoading(false)
    }
  }
```

`setWorkflowStep('briefing')`가 올바른 단계 이름인지 확인한다 — `workflowAvailability`에 `briefing` 키가 있다(`useRouteBriefing.js:2268` 부근). 이름이 다르면 그 객체의 키를 따른다.

- [ ] **Step 3: 훅 반환에 노출한다**

훅이 반환하는 `actions` 객체에서 `loadSavedRoute`가 있는 자리 옆에 `openSavedRouteBriefing`을 더한다.

- [ ] **Step 4: 빌드 확인**

```bash
npm --prefix frontend run build
```

Expected: 성공. `setCrossSection`·`fetchCrossSection`·`updateTasKt`가 스코프에 없다는 오류가 나면 `handleGenerateBriefing`(`:2232`)이 쓰는 이름을 확인해 맞춘다.

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(route): open a saved route briefing without re-searching"
```

---

### Task 5: 딥링크와 '로드' 버튼을 새 경로로

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx:531`
- Modify: `frontend/src/app/App.jsx:278-291`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` (저장 목록의 '로드' 버튼)

**Interfaces:**
- Consumes: `openSavedRouteBriefing` (Task 4).

- [ ] **Step 1: `MapView`의 노출 함수를 바꾼다**

```js
    loadRouteBriefing: (saved) => routeBriefing.actions.openSavedRouteBriefing(saved),
```

- [ ] **Step 2: 딥링크가 브리핑으로 직행하게 한다**

`App.jsx:278-291`의 `{deeplinkFlightId != null && (<FlightAlertDetail ... />)}` 렌더 블록을 **삭제**하고, `FlightAlertDetail` import도 지운다. 대신 `deeplinkFlightId`가 세팅되면 곧바로 경로를 여는 효과를 추가한다 — 다이얼로그 한 겹과 탭 한 번이 사라진다.

```jsx
  useEffect(() => {
    if (deeplinkFlightId == null) return
    const id = deeplinkFlightId
    setDeeplinkFlightId(null)
    setActivePanel('route-check')
    ;(async () => {
      try {
        const routes = await listSavedRoutes()
        const route = routes.find((r) => r.id === id)
        if (route) mapRef.current?.loadRouteBriefing?.(route)
      } catch { /* best-effort: 경로 로드 실패해도 패널은 열림 */ }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deeplinkFlightId])
```

`FlightAlertDetail` 렌더 블록과 그 import를 제거한다. **파일 자체는 지우지 않는다** — 3단계에서 변경점 표시를 브리핑 상단 띠로 옮길 때 참고한다. 스펙의 "변경점 띠"와 "알림 없이 들어오는 입구"는 3단계에서 다룬다.

- [ ] **Step 3: 저장 목록의 '로드' 버튼을 바꾼다**

`RouteBriefingPanel.jsx`의 저장 목록 행에서 `onClick={() => { setMenuOpen(false); loadSavedRoute(r) }}`를 `openSavedRouteBriefing(r)`로 바꾼다. 훅 액션 구조분해에 이름을 더한다.

- [ ] **Step 4: 빌드와 테스트**

```bash
npm --prefix frontend run build
npm --prefix frontend test
```

Expected: 둘 다 성공. `FlightAlertDetail`을 참조하는 테스트가 깨지면 그 테스트가 무엇을 지키려 했는지 읽고, 딥링크가 브리핑으로 가는 것을 확인하는 테스트로 고친다. **그냥 지우지 않는다.**

- [ ] **Step 5: 커밋**

```bash
git status --short
git add frontend/src/features/map/MapView.jsx frontend/src/app/App.jsx frontend/src/features/route-briefing/RouteBriefingPanel.jsx
git commit -m "feat(route): open saved routes and deep links straight to the briefing"
```

---

### Task 6: 관문 — 해외 IFR을 원클릭으로 연다

**이 태스크의 결과가 3단계 착수 여부를 가른다.**

**Files:** 없음 (검증만)

- [ ] **Step 1: 서버를 띄운다**

```bash
ss -ltnp | grep -E ':3001|:5173'   # 비어 있는지 먼저 확인
npm run dev:serve
```

- [ ] **Step 2: 일반 사용자로 경로 둘을 저장한다**

`test` / `test1234` (role=pilot, 1단계에서 만든 개발 계정)로 로그인한다.

1. **국내 IFR** — RKSS → RKPC, SID/STAR 선택까지
2. **해외 IFR** — RKSI → RJTT (또는 전에 `No RNAV route path`로 깨지던 노선)

해외가 저장까지 못 가면 멈추고 사람에게 알린다 — 이 계획은 "저장된 해외 경로를 여는 것"을 고치는 것이고, 저장 자체가 안 되면 다른 문제다.

- [ ] **Step 3: payload 크기를 확인한다**

```bash
node backend/scripts/measure-route-payload.js
```

**관문 A: 어느 경로도 20,000 B를 넘지 않는다.** 1단계 기준선은 국내 IFR 2,721 B였다. `routeModel`·`routeMarkers`가 더해진 만큼을 기록한다.

```bash
cd backend && node -e "
const D=require('better-sqlite3');const db=new D('data/projectamo.db',{readonly:true});
for (const r of db.prepare('SELECT id, name, payload FROM routes').all()) {
  const p=JSON.parse(r.payload);
  console.log(r.id, r.name, {
    bytes: Buffer.byteLength(r.payload,'utf8'),
    coords: p.routeGeometry?.coordinates?.length ?? 0,
    segments: p.routeModel?.enRouteSegments?.length ?? 0,
    markers: p.routeMarkers?.length ?? 0,
    modelHasGeometry: p.routeModel?.routeGeometry != null,
  });
}
"
```

`modelHasGeometry`가 `true`면 좌표선이 두 번 저장된 것이다 — Task 1의 `modelWithoutGeometry`가 안 먹은 것이니 고친다.

- [ ] **Step 4: 관문 B — 브라우저를 새로 고치고 원클릭으로 연다**

페이지를 완전히 새로 고쳐 메모리 상태를 비운다(저장분만으로 열리는지 보려면 필수). 그다음 `경로` 메뉴에서 **해외 IFR** 경로의 `로드`를 누른다.

**Expected:**
- 브리핑이 뜬다. `No RNAV route path` 오류가 없다.
- 공항 기상(출발·도착·교체), 위험기상, **NAVLOG 구간표**가 채워져 있다.
- 지도에 저장한 그 경로선이 그려진다.

국내 경로로도 같은 확인을 한다 — 회귀 점검.

- [ ] **Step 5: 관문 C — 재검색이 정말 안 도는지 확인한다**

브라우저 개발자도구 네트워크 탭을 열고 `로드`를 누른다.

**Expected:** `procedures/*.json`, `enroute.json`, `route-graph-overseas.json` 같은 항법 데이터 요청이 **새로 발생하지 않는다**(이미 캐시된 것 재사용은 무관 — 새 요청이 없어야 한다). `/api/route-briefing` 요청은 발생한다.

새 항법 요청이 보이면 재검색 경로를 아직 타고 있다는 뜻이다. 멈추고 어디서 부르는지 찾는다.

- [ ] **Step 6: 브라우저 계약 검증**

```bash
npm run dev:contract -- --grep route
```

관련 계약이 있으면 통과해야 한다. 없으면 그 사실을 기록한다. 절차는 [browser-verification](../../policies/verification/browser-verification.md)을 따른다.

- [ ] **Step 7: 결과를 상태 파일에 남긴다**

`docs/superpowers/status/2026-08-17-saved-route-load-without-research.status.md`에 한 페이지로: 저장 경로별 payload 크기와 구간·마커 수, 해외 IFR 브리핑 스크린샷 경로, 네트워크 탭 확인 결과, 남은 위험.

- [ ] **Step 8: 커밋**

```bash
git add docs/superpowers/status/2026-08-17-saved-route-load-without-research.status.md
git commit -m "docs: record stage 2 gate results"
```

---

## 완료 조건

- `npm test` (루트) 전체 통과
- `npm --prefix frontend run build` 성공
- 관문 A: 모든 저장 payload가 20,000 B 미만
- 관문 B: 해외 IFR 저장 경로가 새로고침 후 원클릭으로 브리핑까지, NAVLOG 포함
- 관문 C: 로드 시 새 항법 데이터 요청 없음
- 우리 커밋에 다른 세션의 변경이 섞이지 않았다

## 이 단계에서 하지 않는 것

- **변경점 띠와 `FlightAlertDetail` 제거** — 3단계. 띠에 무엇을 쓸지는 알림 규칙이 바뀐 뒤에 정해야 한다. 이 단계에서는 딥링크만 브리핑으로 돌린다.
- **등록한 비행 진입점** — 3단계. 푸시 설정 화면과 같은 자리라 함께 만드는 것이 낫다.
- **고도 단면 차트 축 이름표 복원** — 사용자가 명시적으로 필요 없다고 했다. `routeMarkers`를 저장하므로 부수적으로 일부 살아날 수 있으나 목표가 아니다.
- **항법 데이터 개정 경고** — `airacCycle`은 1단계에서 기록만 한다.
- **`loadSavedRoute` 제거** — 구형 저장분(기하 없음) 폴백으로 남긴다.
- **경로 조립을 서버로 옮기기** — 스펙의 "하지 않는 것" 그대로.
