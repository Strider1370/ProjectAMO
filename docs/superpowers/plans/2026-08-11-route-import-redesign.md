# 경로 파일 불러오기 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 EFB에서 만든 경로 파일(GeoJSON·GPX·KML·FPL)을 거부 없이 불러들이고, 출발·도착 공항만 확정되면 그 경로의 기상정보를 계산한다.

**Architecture:** 파일 해석(`routeImport.js`)과 경로 재료 해석(`routeImportResolve.js`, 신규)을 순수 모듈로 분리하고, `useRouteBriefing.applyImportedPath`는 그 결과를 기존 경로 편집기에 얹는 얇은 배선만 담당한다. 경로 모델(`shared/route-model.js`)과 경로 생성기(`routePlanner.js`)의 계약은 변경하지 않는다.

**Tech Stack:** React, Fluent UI, `@tmcw/togeojson`, `simplify-js`, `node --test`, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-11-route-import-redesign-design.md`

**Policies:** [정책 색인](../../policies/index.md) → [recurring entry sequences](../../policies/engineering/entry-sequences.md) (route-briefing payload: 클라이언트 상태는 `useRouteBriefing`, 렌더링은 briefing 컴포넌트), [browser verification](../../policies/verification/browser-verification.md), [contract registry](../../policies/verification/contracts.md).

## Global Constraints

- Linux 전용. `npm`/`node`/`git`은 Linux 셸에서만 실행한다.
- 사용자 노출 문구는 한국어. 비ASCII 편집 전 [encoding safety](../../policies/encoding-safety.md)를 읽는다.
- `routeImport.js`는 **전역 `DOMParser`만** 쓴다. `@xmldom/xmldom`을 직접 import하면 브라우저 번들에 268KB가 실린다. 테스트가 `globalThis.DOMParser`를 심는다.
- 임계값 상수는 전부 named export로 두고 하드코딩하지 않는다: `AIRPORT_SNAP_NM = 10`, `FIX_MATCH_NM = 5`, `SIMPLIFY_TOLERANCE_DEG = 1/60`, `MAX_UNNAMED_POINTS = 200`, `MAX_IMPORT_BYTES = 10 * 1024 * 1024`.
- 불러오기는 스펙의 실패 3종(해석 불가 / 점 부족 / 좌표 범위 밖) 외에는 실패하지 않는다.
- 경로 모델과 `routePlanner.js`의 출발·도착 계약은 건드리지 않는다.
- 각 태스크는 `cd frontend && node --test <파일>` (디렉터리 경로는 이 Node 버전에서 동작하지 않는다 — 전체는 `npm test`)이 통과한 뒤에만 커밋한다.

## File Structure

| 파일 | 책임 |
| --- | --- |
| `frontend/src/features/route-briefing/lib/routeImport.js` (수정) | 파일 텍스트 → 경로 후보. 형식 판별, 파싱, 좌표 검증, 점 솎기. |
| `frontend/src/features/route-briefing/lib/routeImportResolve.js` (신규) | 경로 후보 + 공항/항법 데이터 → 경로 재료(출발·도착·terms·좌표·알림). 순수 함수, I/O 없음. |
| `frontend/src/features/route-briefing/lib/routeImportResolve.test.js` (신규) | 위 모듈 단위 시험. |
| `frontend/src/features/route-briefing/useRouteBriefing.js` (수정) | 배선만. 파일 읽기, `loadNavdata()` 호출, 편집기 상태 세팅, 알림 상태 보관. |
| `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` (수정) | `.fpl` 허용, 알림 목록 렌더링. |
| `frontend/test/fixtures/route-import/*.fpl`, `*.gpx` (신규) | 시험 fixture. |

`routeImportResolve.js`를 새로 만드는 이유: 현재 이 로직은 `useRouteBriefing.js`(1900줄) 안 `applyImportedPath`에 섞여 있어 단위 시험이 불가능하다. 순수 함수로 빼면 이름 대조·끝점 처리·솎기 판정을 전부 시험할 수 있고, `useRouteBriefing`은 배선만 남는다.

---

### Task 1: FPL 파일 해석

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js:25-51` (`detectFileKind`, `parseRouteFile`), `:160-163` (`extractRoutePaths`)
- Create: `frontend/test/fixtures/route-import/rksi-rkpk.fpl`
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `parseRouteFile(name, text)`가 `{ format: 'fpl', doc }`를 반환한다. `extractRoutePaths(parsed)`가 반환하는 후보 객체에 `types: (string|null)[]` 배열이 추가된다 — `coords`/`names`와 같은 길이·같은 순서이며, FPL의 `waypoint-type`(`AIRPORT`/`INT`/`VOR`/`NDB`/`USER`) 또는 그 외 형식에서는 전부 `null`이다.

- [ ] **Step 1: fixture 파일 작성**

`frontend/test/fixtures/route-import/rksi-rkpk.fpl`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<flight-plan xmlns="http://www8.garmin.com/xmlschemas/FlightPlan/v1">
  <created>2026-08-11T00:00:00Z</created>
  <waypoint-table>
    <waypoint>
      <identifier>RKSI</identifier>
      <type>AIRPORT</type>
      <country-code>KR</country-code>
      <lat>37.4691</lat>
      <lon>126.4505</lon>
    </waypoint>
    <waypoint>
      <identifier>GONAX</identifier>
      <type>INT</type>
      <country-code>KR</country-code>
      <lat>36.8000</lat>
      <lon>127.2000</lon>
    </waypoint>
    <waypoint>
      <identifier>RKPK</identifier>
      <type>AIRPORT</type>
      <country-code>KR</country-code>
      <lat>35.1795</lat>
      <lon>128.9382</lon>
    </waypoint>
  </waypoint-table>
  <route>
    <route-name>RKSI RKPK</route-name>
    <flight-plan-index>1</flight-plan-index>
    <route-point>
      <waypoint-identifier>RKSI</waypoint-identifier>
      <waypoint-type>AIRPORT</waypoint-type>
      <waypoint-country-code>KR</waypoint-country-code>
    </route-point>
    <route-point>
      <waypoint-identifier>GONAX</waypoint-identifier>
      <waypoint-type>INT</waypoint-type>
      <waypoint-country-code>KR</waypoint-country-code>
    </route-point>
    <route-point>
      <waypoint-identifier>RKPK</waypoint-identifier>
      <waypoint-type>AIRPORT</waypoint-type>
      <waypoint-country-code>KR</waypoint-country-code>
    </route-point>
  </route>
</flight-plan>
```

- [ ] **Step 2: 실패하는 시험 작성**

`routeImport.test.js` 끝에 추가. 파일 상단 import 목록은 그대로 둔다(`parseRouteFile`, `extractRoutePaths`는 이미 import되어 있다).

```js
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FPL_TEXT = readFileSync(fileURLToPath(new URL('../../../../test/fixtures/route-import/rksi-rkpk.fpl', import.meta.url)), 'utf8')

test('parseRouteFile + extractRoutePaths: FPL은 route-point 순서대로 후보 1개', () => {
  const parsed = parseRouteFile('plan.fpl', FPL_TEXT)
  assert.equal(parsed.format, 'fpl')
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSI RKPK')
  assert.deepEqual(candidates[0].coords, [[126.4505, 37.4691], [127.2, 36.8], [128.9382, 35.1795]])
  assert.deepEqual(candidates[0].names, ['RKSI', 'GONAX', 'RKPK'])
  assert.deepEqual(candidates[0].types, ['AIRPORT', 'INT', 'AIRPORT'])
})

test('extractRoutePaths: FPL route-point가 waypoint-table에 없으면 그 지점만 건너뛴다', () => {
  const text = FPL_TEXT.replace('<waypoint-identifier>GONAX</waypoint-identifier>', '<waypoint-identifier>NOPE</waypoint-identifier>')
  const candidates = extractRoutePaths(parseRouteFile('plan.fpl', text))
  assert.equal(candidates[0].coords.length, 2)
  assert.deepEqual(candidates[0].names, ['RKSI', 'RKPK'])
})

test('extractRoutePaths: 다른 형식의 후보는 types가 전부 null', () => {
  const candidates = extractRoutePaths(parseRouteFile('route.geojson', GEOJSON_LINE))
  assert.deepEqual(candidates[0].types, [null, null, null])
})
```

- [ ] **Step 3: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: FAIL — `parsed.format`이 `'geojson'`이고 JSON.parse가 던진다.

- [ ] **Step 4: 구현**

`routeImport.js`의 `detectFileKind`에 분기를 추가한다:

```js
function detectFileKind(name) {
  const ext = String(name ?? '').toLowerCase().split('.').pop()
  if (ext === 'gpx') return 'gpx'
  if (ext === 'kml') return 'kml'
  if (ext === 'fpl') return 'fpl'
  return 'geojson'
}
```

`parseRouteFile`의 XML 분기에 `fpl`을 추가한다:

```js
  const doc = new DOMParser().parseFromString(text, 'text/xml')
  if (kind === 'gpx') return { format: 'gpx', doc }
  if (kind === 'fpl') return { format: 'fpl', doc }
  return { format: 'kml', geojson: kmlToGeoJSON(doc) }
```

`extractGpxPaths` 아래에 FPL 추출기를 추가한다. FPL은 좌표를 `waypoint-table`에 한 번만 정의하고 `route`가 이름으로 참조하는 2단 구조라, 먼저 이름→지점 사전을 만들고 순서 목록을 훑는다:

```js
// FPL은 좌표를 <waypoint-table>에 한 번 정의하고 <route>가 <waypoint-identifier>로
// 참조한다. 그래서 사전을 먼저 만들고 순서 목록을 훑는다. 사전에 없는 참조는 그
// 지점만 건너뛴다 — 파일 하나가 통째로 못 쓰게 되는 것보다 낫다.
function fplWaypointTable(doc) {
  const table = new Map()
  for (const el of Array.from(doc.getElementsByTagName('waypoint'))) {
    const id = el.getElementsByTagName('identifier')[0]?.textContent?.trim()
    const lon = Number(el.getElementsByTagName('lon')[0]?.textContent)
    const lat = Number(el.getElementsByTagName('lat')[0]?.textContent)
    if (!id || !Number.isFinite(lon) || !Number.isFinite(lat)) continue
    table.set(id, { lon, lat, type: el.getElementsByTagName('type')[0]?.textContent?.trim() || null })
  }
  return table
}

function extractFplPaths(doc) {
  const table = fplWaypointTable(doc)
  const candidates = []
  Array.from(doc.getElementsByTagName('route')).forEach((route, i) => {
    const coords = []
    const names = []
    const types = []
    for (const point of Array.from(route.getElementsByTagName('route-point'))) {
      const id = point.getElementsByTagName('waypoint-identifier')[0]?.textContent?.trim()
      const entry = id ? table.get(id) : null
      if (!entry) continue
      coords.push([entry.lon, entry.lat])
      names.push(id)
      types.push(point.getElementsByTagName('waypoint-type')[0]?.textContent?.trim() || entry.type)
    }
    if (coords.length >= 2) {
      const nameEl = route.getElementsByTagName('route-name')[0]
      candidates.push({ label: nameEl?.textContent?.trim() || `경로 ${i + 1}`, kind: 'route', coords, names, types })
    }
  })
  return candidates
}
```

`extractRoutePaths`를 세 갈래로 바꾸고, 모든 후보가 `types`를 갖도록 정규화한다:

```js
export function extractRoutePaths(parsed) {
  const candidates = parsed.format === 'fpl' ? extractFplPaths(parsed.doc)
    : parsed.format === 'gpx' ? extractGpxPaths(parsed.doc)
    : extractGeoJsonPaths(parsed.geojson)
  // names/types는 항상 coords와 같은 길이로 맞춘다 — 하류(routeImportResolve)가
  // 인덱스로 짝지어 읽으므로 길이가 어긋나면 조용히 엉뚱한 이름이 붙는다.
  const normalized = candidates.map((c) => ({
    ...c,
    names: c.names ?? c.coords.map(() => null),
    types: c.types ?? c.coords.map(() => null),
  }))
  return disambiguateDuplicateLabels(normalized)
}
```

- [ ] **Step 5: 시험 통과 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: PASS — 기존 18개 + 신규 3개.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js frontend/test/fixtures/route-import/rksi-rkpk.fpl
git commit -m "feat(route-briefing): read Garmin FPL flight plans on import"
```

---

### Task 2: 좌표 검증과 오류 문구 분리

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js` (좌표 수집 지점 전체)
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

**Interfaces:**
- Consumes: Task 1의 `types` 정규화된 후보.
- Produces: `MAX_IMPORT_BYTES` 상수 export. 후보 객체에 `droppedCount: number` 추가 — 위경도 범위를 벗어나 버려진 점의 개수. `extractRoutePaths`는 좌표 2개 미만인 후보를 반환하지 않으므로, 호출부는 `candidates.length === 0`일 때 `droppedTotal > 0`인지로 "좌표 범위 밖"과 "점 부족"을 구분한다. 이를 위해 `extractRoutePaths`는 배열 대신 `{ candidates, droppedTotal }`을 반환한다.

- [ ] **Step 1: 실패하는 시험 작성**

```js
test('extractRoutePaths: 위경도 범위를 벗어난 점은 버리고 droppedCount에 센다', () => {
  const text = JSON.stringify({
    type: 'LineString',
    coordinates: [[126.79, 37.55], [999, 37.0], [128.93, 35.17]],
  })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('bad.geojson', text))
  assert.equal(droppedTotal, 1)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].coords.length, 2)
  assert.equal(candidates[0].droppedCount, 1)
})

test('extractRoutePaths: 전부 범위 밖이면 후보 없음 + droppedTotal로 구분 가능', () => {
  const text = JSON.stringify({ type: 'LineString', coordinates: [[999, 999], [888, 888]] })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('bad.geojson', text))
  assert.equal(candidates.length, 0)
  assert.equal(droppedTotal, 2)
})

test('extractRoutePaths: 점이 부족하면 후보 없음, droppedTotal은 0', () => {
  const text = JSON.stringify({ type: 'LineString', coordinates: [[126.79, 37.55]] })
  const { candidates, droppedTotal } = extractRoutePaths(parseRouteFile('short.geojson', text))
  assert.equal(candidates.length, 0)
  assert.equal(droppedTotal, 0)
})

test('MAX_IMPORT_BYTES는 10MB', () => {
  assert.equal(MAX_IMPORT_BYTES, 10 * 1024 * 1024)
})
```

기존 시험 중 `extractRoutePaths(...)`의 반환을 배열로 받는 것이 전부 있다. 모두 `extractRoutePaths(...).candidates`로 고친다.

import 줄에 `MAX_IMPORT_BYTES`를 추가한다.

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: FAIL — `MAX_IMPORT_BYTES`가 없고, `extractRoutePaths`가 배열을 반환한다.

- [ ] **Step 3: 구현**

`routeImport.js` 상단 상수 옆에 추가한다:

```js
// 밖에서 온 파일은 내용을 신뢰할 수 없다. 범위를 벗어난 좌표는 지도를 깨뜨리거나
// 엉뚱한 위치의 기상을 보여주고, 대용량 궤적 파일은 브라우저를 멈춘다.
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024

export function isValidLonLat(lon, lat) {
  return Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90
}
```

좌표를 모으는 세 곳 전부에서 `isValidLonLat`으로 거르고 버린 개수를 센다.

`collectGeometry`에 카운터를 넘긴다 (`dropRef = { value: 0 }`):

```js
function collectGeometry(geom, label, candidates, pointCoords, routeIdxRef, dropRef) {
  if (!geom) return
  // 후보 하나가 몇 점을 버렸는지 그 후보에 같이 싣는다 — 전체 합계만으로는
  // "이 경로에서 좌표가 빠졌다"는 알림을 만들 수 없다.
  const clean = (coords) => {
    const kept = (coords ?? []).filter(([lon, lat]) => isValidLonLat(lon, lat))
    const dropped = (coords?.length ?? 0) - kept.length
    dropRef.value += dropped
    return { coords: kept, dropped }
  }
  if (geom.type === 'LineString') {
    const { coords, dropped } = clean(geom.coordinates)
    if (coords.length >= 2) {
      routeIdxRef.value += 1
      candidates.push({ label: label || `경로 ${routeIdxRef.value}`, kind: 'route', coords, droppedCount: dropped })
    }
  } else if (geom.type === 'MultiLineString') {
    for (const line of geom.coordinates ?? []) {
      const { coords, dropped } = clean(line)
      if (coords.length >= 2) {
        routeIdxRef.value += 1
        candidates.push({ label: label || `경로 ${routeIdxRef.value}`, kind: 'route', coords, droppedCount: dropped })
      }
    }
  } else if (geom.type === 'Point') {
    const { coords } = clean([geom.coordinates ?? []])
    if (coords[0]) pointCoords.push(coords[0])
  } else if (geom.type === 'GeometryCollection') {
    for (const child of geom.geometries ?? []) {
      collectGeometry(child, label, candidates, pointCoords, routeIdxRef, dropRef)
    }
  }
}
```

`pointsFromGpxNodes`는 이미 비유한 값을 건너뛴다. 범위 검사로 바꾸고 개수를 센다:

```js
function pointsFromGpxNodes(nodeList, dropRef) {
  const coords = []
  const names = []
  for (const el of Array.from(nodeList)) {
    const lon = Number(el.getAttribute('lon'))
    const lat = Number(el.getAttribute('lat'))
    if (!isValidLonLat(lon, lat)) { dropRef.value += 1; continue }
    coords.push([lon, lat])
    const nameEl = el.getElementsByTagName('name')[0]
    names.push(nameEl?.textContent?.trim() || null)
  }
  return { coords, names }
}
```

`fplWaypointTable`의 `Number.isFinite` 검사를 `isValidLonLat(lon, lat)`으로 바꾸고, 거른 개수를 세도록 `dropRef`를 받는다.

`extractGeoJsonPaths` / `extractGpxPaths` / `extractFplPaths`는 각각 `dropRef`를 만들어 넘기고 `{ candidates, dropped }`를 반환한다. `extractRoutePaths`가 합산한다:

```js
export function extractRoutePaths(parsed) {
  const dropRef = { value: 0 }
  const candidates = parsed.format === 'fpl' ? extractFplPaths(parsed.doc, dropRef)
    : parsed.format === 'gpx' ? extractGpxPaths(parsed.doc, dropRef)
    : extractGeoJsonPaths(parsed.geojson, dropRef)
  const normalized = candidates.map((c) => ({
    ...c,
    names: c.names ?? c.coords.map(() => null),
    types: c.types ?? c.coords.map(() => null),
    droppedCount: c.droppedCount ?? 0,
  }))
  return { candidates: disambiguateDuplicateLabels(normalized), droppedTotal: dropRef.value }
}
```

`extractGpxPaths`·`extractFplPaths`도 같은 방식으로 후보마다 `droppedCount`를 넣는다. `pointsFromGpxNodes`는 `{ coords, names, dropped }`를 반환하도록 바꾸고, 호출부가 후보를 push할 때 `droppedCount: dropped`를 함께 넣는다. `extractFplPaths`는 `fplWaypointTable`이 좌표 범위 때문에 버린 개수만 `droppedCount`로 쓴다. `route-point`가 사전에 없어 건너뛴 경우는 좌표 문제가 아니므로 여기 세지 않는다 — 그 알림 문구("좌표 값이 범위를 벗어났습니다")가 사실과 달라진다.

`extractRoutePaths`의 정규화에서 `droppedCount: c.droppedCount ?? 0`가 이미 빠진 값을 0으로 채우므로, 세 추출기 중 하나가 누락해도 하류가 깨지지 않는다.

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "feat(route-briefing): reject out-of-range coordinates on import instead of trusting the file"
```

---

### Task 3: 점 솎기 규칙 교체

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js:165-185` (`simplifyRoute`)
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

**Interfaces:**
- Consumes: Task 1·2의 후보 형태 (`coords`, `names`, `types`, `droppedCount`).
- Produces: `thinRoute({ coords, names, types })` → `{ coords, names, types, originalCount, thinned: boolean }`. `SIMPLIFY_TOLERANCE_DEG`, `MAX_UNNAMED_POINTS` 상수 export. 기존 `simplifyRoute(coords, maxPts)`는 내부 헬퍼로 남기되 export를 유지한다(기존 시험이 쓴다).

- [ ] **Step 1: 실패하는 시험 작성**

```js
test('thinRoute: 이름이 하나라도 있으면 점을 버리지 않는다', () => {
  const coords = Array.from({ length: 40 }, (_, i) => [126 + i * 0.05, 37 + i * 0.05])
  const names = coords.map((_, i) => (i === 0 ? 'RKSI' : null))
  const out = thinRoute({ coords, names, types: coords.map(() => null) })
  assert.equal(out.coords.length, 40)
  assert.equal(out.thinned, false)
  assert.equal(out.originalCount, 40)
})

test('thinRoute: 이름이 전혀 없으면 1NM 오차 안에서 솎는다', () => {
  // 직선 위에 촘촘히 찍은 점 — 1NM 오차 안에서는 양 끝만 남아야 한다
  const coords = Array.from({ length: 500 }, (_, i) => [126 + i * 0.002, 37])
  const out = thinRoute({ coords, names: coords.map(() => null), types: coords.map(() => null) })
  assert.ok(out.coords.length < 10, `expected heavy thinning, got ${out.coords.length}`)
  assert.equal(out.thinned, true)
  assert.equal(out.originalCount, 500)
  assert.deepEqual(out.coords[0], [126, 37])
  assert.deepEqual(out.coords.at(-1), [126 + 499 * 0.002, 37])
})

test('thinRoute: 솎은 뒤에도 200점을 넘으면 200점에서 끊는다', () => {
  // 지그재그 — 1NM tolerance로는 거의 안 줄어든다
  const coords = Array.from({ length: 600 }, (_, i) => [126 + i * 0.05, 37 + (i % 2) * 0.5])
  const out = thinRoute({ coords, names: coords.map(() => null), types: coords.map(() => null) })
  assert.ok(out.coords.length <= 200, `expected <= 200, got ${out.coords.length}`)
})

test('thinRoute: names/types는 솎은 좌표와 길이가 맞는다', () => {
  const coords = Array.from({ length: 500 }, (_, i) => [126 + i * 0.002, 37])
  const out = thinRoute({ coords, names: coords.map(() => null), types: coords.map(() => null) })
  assert.equal(out.names.length, out.coords.length)
  assert.equal(out.types.length, out.coords.length)
})
```

import 줄에 `thinRoute`를 추가한다.

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: FAIL — `thinRoute is not a function`.

- [ ] **Step 3: 구현**

`simplifyRoute` 아래에 추가한다:

```js
// 1NM을 위도 기준 도 단위로 환산한 값. 경도 방향은 위도가 높을수록 실제 거리가
// 짧아지지만, 한반도 위도대에서 그 차이는 솎기 판정을 바꿀 정도가 아니다.
export const SIMPLIFY_TOLERANCE_DEG = 1 / 60
export const MAX_UNNAMED_POINTS = 200

// 이름이 붙은 지점은 조종사가 의도적으로 넣은 것이므로 개수와 무관하게 유지한다.
// 이름이 하나도 없는 좌표 나열(궤적 기록, 이름 없는 KML/GeoJSON 선)만 솎는다.
export function thinRoute({ coords, names = [], types = [] }) {
  const originalCount = coords.length
  const unchanged = { coords, names, types, originalCount, thinned: false }
  if (names.some(Boolean)) return unchanged

  const points = coords.map(([lon, lat]) => ({ x: lon, y: lat }))
  let kept = simplify(points, SIMPLIFY_TOLERANCE_DEG, true).map((p) => [p.x, p.y])
  if (kept.length > MAX_UNNAMED_POINTS) kept = simplifyRoute(coords, MAX_UNNAMED_POINTS)
  if (kept.length === originalCount) return unchanged

  // 이름·종류는 전부 null인 경우에만 여기 오므로 길이만 맞춰주면 된다.
  return {
    coords: kept,
    names: kept.map(() => null),
    types: kept.map(() => null),
    originalCount,
    thinned: true,
  }
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImport.test.js
```
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "feat(route-briefing): keep named waypoints whole and thin only recorded tracks"
```

---

### Task 4: 경로 재료 해석 모듈

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeImportResolve.js`
- Test: `frontend/src/features/route-briefing/lib/routeImportResolve.test.js`

**Interfaces:**
- Consumes: `thinRoute`, `isWithinKoreaFir` (`routeImport.js`), `greatCircleNm` (`routePreview.js`).
- Produces:

```js
export const AIRPORT_SNAP_NM = 10
export const FIX_MATCH_NM = 5

// candidate: { label, kind, coords, names, types, droppedCount }
// airports:  [{ icao, lon, lat }]            — useRouteBriefing의 airports prop
// navpoints: { [id]: { lon, lat } }          — loadNavdata().navpoints
// → {
//     departureAirport: string|null,
//     arrivalAirport: string|null,
//     terms: Array<{kind:'fix', id:string} | {kind:'coordinate', coordinate:{lon,lat}}>,
//     coordinates: [[lon,lat], ...],   // 지도 미리보기용 전체 선(출발·도착 포함)
//     notices: Array<{ level:'action'|'info', code:string, message:string }>,
//   }
export function resolveImportedRoute({ candidate, airports, navpoints })
```

`navpoints`의 좌표 형태는 `routePlanner.js`의 `coordinatesOf`가 다루는 것과 같다. 이 모듈은 I/O를 하지 않는다 — 호출부가 `loadNavdata()`를 await해서 `navpoints`를 넘긴다.

- [ ] **Step 1: 실패하는 시험 작성**

`frontend/src/features/route-briefing/lib/routeImportResolve.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveImportedRoute, AIRPORT_SNAP_NM, FIX_MATCH_NM } from './routeImportResolve.js'

const AIRPORTS = [
  { icao: 'RKSI', lon: 126.4505, lat: 37.4691 },
  { icao: 'RKPK', lon: 128.9382, lat: 35.1795 },
]
const NAVPOINTS = { GONAX: { lon: 127.2, lat: 36.8 } }

const candidate = (over = {}) => ({
  label: '경로 1', kind: 'route', droppedCount: 0,
  coords: [[126.4505, 37.4691], [127.2, 36.8], [128.9382, 35.1795]],
  names: [null, null, null],
  types: [null, null, null],
  ...over,
})

test('끝점이 공항 10NM 안이면 흡수하고 출발·도착을 채운다', () => {
  const out = resolveImportedRoute({ candidate: candidate(), airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, 'RKSI')
  assert.equal(out.arrivalAirport, 'RKPK')
  assert.equal(out.terms.length, 1)          // 양끝은 공항으로 흡수되고 가운데 1개만 남는다
  assert.equal(out.coordinates.length, 3)
  assert.ok(out.notices.some((n) => n.code === 'airports-detected'))
})

test('끝점이 공항에서 멀면 공항은 비우고 끝점을 경유점으로 남긴다', () => {
  const far = candidate({ coords: [[130.0, 40.0], [130.5, 40.5], [131.0, 41.0]] })
  const out = resolveImportedRoute({ candidate: far, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, null)
  assert.equal(out.arrivalAirport, null)
  assert.equal(out.terms.length, 3)          // 어느 점도 흡수되지 않는다
  assert.ok(out.notices.some((n) => n.code === 'airports-missing' && n.level === 'action'))
})

test('FPL의 AIRPORT 종류는 거리 탐색 없이 그 공항으로 확정한다', () => {
  const fpl = candidate({
    coords: [[126.90, 37.90], [127.2, 36.8], [128.9382, 35.1795]],  // 출발점이 RKSI에서 25NM 넘게 떨어져 있음
    names: ['RKSI', 'GONAX', 'RKPK'],
    types: ['AIRPORT', 'INT', 'AIRPORT'],
  })
  const out = resolveImportedRoute({ candidate: fpl, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.departureAirport, 'RKSI')
})

test('이름이 항법 데이터와 5NM 안으로 일치하면 fix로 쓴다', () => {
  const named = candidate({ names: [null, 'GONAX', null] })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.deepEqual(out.terms[0], { kind: 'fix', id: 'GONAX' })
})

test('이름은 같은데 위치가 5NM 넘게 다르면 파일 좌표를 쓰고 알린다', () => {
  const named = candidate({
    coords: [[126.4505, 37.4691], [128.0, 36.8], [128.9382, 35.1795]],
    names: [null, 'GONAX', null],
  })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.terms[0].kind, 'coordinate')
  assert.ok(out.notices.some((n) => n.code === 'fix-moved' && n.message.includes('GONAX')))
})

test('항법 데이터에 없는 이름은 좌표로 넣고 개수를 알린다', () => {
  const named = candidate({ names: [null, 'ZZZZZ', null] })
  const out = resolveImportedRoute({ candidate: named, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.equal(out.terms[0].kind, 'coordinate')
  assert.ok(out.notices.some((n) => n.code === 'fix-unknown'))
})

test('중간 지점 이름이 4글자 ICAO 꼴이면 좌표로 넣는다', () => {
  // manualRouteInput.js가 중간 term의 4글자 대문자 fix를 "중간 공항 ICAO"로 보고
  // 거부하므로, 그대로 fix로 넘기면 편집기 왕복에서 경로 전체가 실패한다.
  const named = candidate({ names: [null, 'RKSS', null] })
  const out = resolveImportedRoute({
    candidate: named,
    airports: AIRPORTS,
    navpoints: { ...NAVPOINTS, RKSS: { lon: 127.2, lat: 36.8 } },
  })
  assert.equal(out.terms[0].kind, 'coordinate')
})

test('궤적을 솎으면 알린다', () => {
  const track = candidate({
    coords: Array.from({ length: 500 }, (_, i) => [126.4505 + i * 0.005, 37.4691]),
    names: Array.from({ length: 500 }, () => null),
    types: Array.from({ length: 500 }, () => null),
  })
  const out = resolveImportedRoute({ candidate: track, airports: AIRPORTS, navpoints: NAVPOINTS })
  const notice = out.notices.find((n) => n.code === 'thinned')
  assert.ok(notice)
  assert.ok(notice.message.includes('500'))
})

test('경로가 한국 FIR 밖이면 알린다', () => {
  const far = candidate({ coords: [[150.0, 10.0], [151.0, 11.0], [152.0, 12.0]] })
  const out = resolveImportedRoute({ candidate: far, airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.ok(out.notices.some((n) => n.code === 'outside-fir'))
})

test('버려진 좌표가 있으면 알린다', () => {
  const out = resolveImportedRoute({ candidate: candidate({ droppedCount: 2 }), airports: AIRPORTS, navpoints: NAVPOINTS })
  assert.ok(out.notices.some((n) => n.code === 'coords-dropped'))
})

test('상수는 스펙 값과 같다', () => {
  assert.equal(AIRPORT_SNAP_NM, 10)
  assert.equal(FIX_MATCH_NM, 5)
})
```

- [ ] **Step 2: 시험이 실패하는지 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImportResolve.test.js
```
Expected: FAIL — 모듈이 없다.

- [ ] **Step 3: 구현**

`frontend/src/features/route-briefing/lib/routeImportResolve.js`:

```js
// 불러온 경로 후보 하나를 경로 편집기가 먹을 수 있는 재료로 바꾼다. 순수 함수 —
// navdata 로딩은 호출부(useRouteBriefing)가 하고 여기엔 결과만 들어온다.
import { thinRoute, isWithinKoreaFir } from './routeImport.js'
import { greatCircleNm } from './routePreview.js'

export const AIRPORT_SNAP_NM = 10
export const FIX_MATCH_NM = 5

// 중간 경유점에 4글자 대문자 이름을 fix로 넘기면 manualRouteInput.js가 "중간 공항
// ICAO는 사용할 수 없습니다"로 거부한다. 그 이름은 좌표로 떨어뜨린다.
const LOOKS_LIKE_ICAO = /^[A-Z]{4}$/

function nearestAirport(coord, airports) {
  let best = null
  for (const airport of airports ?? []) {
    if (!Number.isFinite(airport.lon) || !Number.isFinite(airport.lat)) continue
    const distNm = greatCircleNm(coord[0], coord[1], airport.lon, airport.lat)
    if (!best || distNm < best.distNm) best = { icao: airport.icao, distNm }
  }
  return best
}

// FPL은 지점 종류를 싣는다. 끝점이 AIRPORT이고 그 식별자를 우리가 아는 공항이면
// 거리 탐색을 건너뛴다 — 파일이 명시한 것이 추측보다 정확하다.
function declaredAirport(name, type, airports) {
  if (type !== 'AIRPORT' || !name) return null
  return airports?.some((airport) => airport.icao === name) ? name : null
}

function resolveEndpoint(coord, name, type, airports) {
  const declared = declaredAirport(name, type, airports)
  if (declared) return { icao: declared, distNm: 0, absorb: true }
  const nearest = nearestAirport(coord, airports)
  if (nearest && nearest.distNm <= AIRPORT_SNAP_NM) return { ...nearest, absorb: true }
  return { icao: null, distNm: null, absorb: false }
}

function middleTerm(coord, name, navpoints, counters) {
  if (!name) return { kind: 'coordinate', coordinate: { lon: coord[0], lat: coord[1] } }
  const navpoint = navpoints?.[name]
  if (!navpoint) {
    counters.unknown.push(name)
    return { kind: 'coordinate', coordinate: { lon: coord[0], lat: coord[1] } }
  }
  const distNm = greatCircleNm(coord[0], coord[1], navpoint.lon, navpoint.lat)
  if (distNm > FIX_MATCH_NM) {
    counters.moved.push({ name, distNm })
    return { kind: 'coordinate', coordinate: { lon: coord[0], lat: coord[1] } }
  }
  if (LOOKS_LIKE_ICAO.test(name)) {
    return { kind: 'coordinate', coordinate: { lon: coord[0], lat: coord[1] } }
  }
  return { kind: 'fix', id: name }
}

export function resolveImportedRoute({ candidate, airports = [], navpoints = {} }) {
  const thin = thinRoute(candidate)
  const { coords, names, types } = thin
  const notices = []

  const start = resolveEndpoint(coords[0], names[0], types[0], airports)
  const end = resolveEndpoint(coords.at(-1), names.at(-1), types.at(-1), airports)

  // 공항으로 흡수된 끝점은 경유점에서 뺀다 — 같은 장소를 두 점으로 두지 않는다.
  const from = start.absorb ? 1 : 0
  const to = end.absorb ? coords.length - 1 : coords.length

  const counters = { unknown: [], moved: [] }
  const terms = coords.slice(from, to).map((coord, i) => middleTerm(coord, names[from + i], navpoints, counters))

  if (start.icao && end.icao) {
    notices.push({
      level: 'info',
      code: 'airports-detected',
      message: `출발 ${start.icao}${start.distNm ? ` (${start.distNm.toFixed(0)}NM)` : ''}, 도착 ${end.icao}${end.distNm ? ` (${end.distNm.toFixed(0)}NM)` : ''}로 인식 — 다르면 바꾸세요`,
    })
  } else {
    notices.push({ level: 'action', code: 'airports-missing', message: '출발·도착 공항을 골라주세요' })
  }

  if (counters.unknown.length > 0) {
    notices.push({ level: 'info', code: 'fix-unknown', message: `지점 ${counters.unknown.length}개는 이름을 찾지 못해 좌표로 넣었습니다` })
  }
  for (const { name, distNm } of counters.moved) {
    notices.push({ level: 'info', code: 'fix-moved', message: `${name} — 우리 데이터와 위치가 ${distNm.toFixed(0)}NM 다릅니다. 파일 좌표를 씁니다` })
  }
  if (thin.thinned) {
    notices.push({ level: 'info', code: 'thinned', message: `기록점 ${thin.originalCount.toLocaleString('ko-KR')}개를 ${coords.length}개로 줄였습니다 (경로 오차 1NM 이내)` })
  }
  if (candidate.droppedCount > 0) {
    notices.push({ level: 'info', code: 'coords-dropped', message: `좌표 ${candidate.droppedCount}개는 값이 범위를 벗어나 제외했습니다` })
  }
  if (!isWithinKoreaFir(...coords[0]) || !isWithinKoreaFir(...coords.at(-1))) {
    notices.push({ level: 'info', code: 'outside-fir', message: '경로 일부가 한국 정보구역 밖 — 기상이 비어 있을 수 있습니다' })
  }

  return { departureAirport: start.icao, arrivalAirport: end.icao, terms, coordinates: coords, notices }
}
```

- [ ] **Step 4: 시험 통과 확인**

```bash
cd frontend && node --test src/features/route-briefing/lib/routeImportResolve.test.js
```
Expected: PASS — 11개.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/routeImportResolve.js frontend/src/features/route-briefing/lib/routeImportResolve.test.js
git commit -m "feat(route-briefing): resolve imported routes without requiring airports or known fixes"
```

---

### Task 5: 불러오기 배선 교체

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js:1505-1575` (`applyImportedPath`, `importRouteFromFile`), `:1860-1880` (반환 객체)

**Interfaces:**
- Consumes: `resolveImportedRoute` (Task 4), `MAX_IMPORT_BYTES`·`extractRoutePaths` (Task 1·2), `loadNavdata` (`routePlanner.js:82`).
- Produces: 훅 반환 객체가 `importError: string|null` 대신 `importNotices: Array<{level, code, message}>`를 노출한다. 기존 `importWarning`은 제거한다(알림 목록으로 대체). `importError`는 실패 3종에만 쓰이므로 유지한다. `importedPreview: {type:'LineString', coordinates}|null`을 추가한다 — 공항 미확정 상태에서 지도에 선을 그리는 데 쓴다.

- [ ] **Step 1: `importRouteFromFile`을 크기 검사와 오류 문구 분리로 교체**

`useRouteBriefing.js:1555-1575`를 다음으로 바꾼다:

```js
  // 파일 선택 → 파싱 → 후보 1개면 바로 적용, 여러 개면 선택 대기(importCandidates).
  async function importRouteFromFile(file) {
    setImportError(null)
    setImportNotices([])
    setImportedPreview(null)
    if (!file) return
    if (file.size > MAX_IMPORT_BYTES) {
      setImportError('파일이 너무 큽니다 (10MB 이하).')
      return
    }
    let candidates = []
    let droppedTotal = 0
    try {
      const text = await file.text()
      const parsed = parseRouteFile(file.name, text)
      const extracted = extractRoutePaths(parsed)
      candidates = extracted.candidates
      droppedTotal = extracted.droppedTotal
    } catch {
      setImportError('파일을 해석할 수 없습니다. GeoJSON·GPX·KML·FPL 파일인지 확인하세요.')
      return
    }
    if (candidates.length === 0) {
      setImportError(droppedTotal > 0
        ? '좌표 값이 범위를 벗어났습니다. 파일이 손상되었을 수 있습니다.'
        : '경로로 쓸 지점이 2개 이상 필요합니다.')
      return
    }
    if (candidates.length === 1) {
      applyImportedPath(candidates[0])
      return
    }
    setImportCandidates(candidates)
  }
```

- [ ] **Step 2: `applyImportedPath`를 해석 모듈 기반으로 교체**

`useRouteBriefing.js:1508-1552`를 다음으로 바꾼다:

```js
  // 선택된 후보 경로 1개를 실제로 적용 — loadSavedRoute와 동일한 순서로 상태를
  // 세팅해야 VFR 자동 경로생성 effect가 이 경유점을 직선으로 덮어쓰지 않는다:
  // lastVfrKeyRef 선점 → clearRouteDisplay → routeForm → 결과 세팅.
  async function applyImportedPath(candidate) {
    setImportError(null)
    setImportCandidates([])
    try {
      const navdata = await loadNavdata()
      const resolved = resolveImportedRoute({ candidate, airports, navpoints: navdata.navpoints })
      setImportNotices(resolved.notices)
      setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: resolved.coordinates, maxZoom: 8 })

      const importedForm = {
        ...routeForm,
        departureAirport: resolved.departureAirport ?? '',
        arrivalAirport: resolved.arrivalAirport ?? '',
      }
      setRouteForm(importedForm)

      // 공항이 아직 없으면 경로를 만들 수 없다. 파일의 선만 먼저 그려서 조종사가
      // 무엇이 들어왔는지 보게 하고, 공항이 채워지면 아래 effect가 이어받는다.
      if (!resolved.departureAirport || !resolved.arrivalAirport) {
        setImportedPreview({ type: 'LineString', coordinates: resolved.coordinates })
        pendingImportTermsRef.current = resolved.terms
        return
      }

      setImportedPreview(null)
      pendingImportTermsRef.current = null
      await commitImportedRoute(importedForm, resolved.terms)
    } catch (err) {
      setImportError(err.message)
    }
  }

  // 불러온 terms를 편집기에 얹는 부분. 공항이 처음부터 있었을 때와, 나중에
  // 조종사가 고른 뒤에 둘 다 여기를 지난다.
  async function commitImportedRoute(form, terms) {
    const legIntents = Array.from({ length: Math.max(0, terms.length - 1) }, () => ({ kind: 'dct' }))
    const enroute = { terms, legIntents }
    const importedText = form.flightRule === 'VFR'
      ? formatVfrDraftText({ departureAirport: form.departureAirport, arrivalAirport: form.arrivalAirport, enroute })
      : formatManualRouteString({ terms, legIntents })
    const preview = await buildEditorPreview(createRouteEditor({ routeForm: form, rawText: importedText }), importedText)
    const routeGeometry = getCurrentRouteLineString({
      routeResult: preview.result,
      vfrWaypoints: preview.result.flightRule === 'VFR' ? buildVfrWaypointsFromRouteResult(preview.result, airports) : [],
    })
    const routeModel = buildCommonRouteModel({ routeGeometry, routeResult: preview.result })

    lastVfrKeyRef.current = `${form.departureAirport ?? ''}>${form.arrivalAirport ?? ''}`
    clearRouteDisplay()
    applyBaseRoute(createRouteDesign({
      routeForm: form,
      procedures: { sid: null, star: null, iapKey: null },
      routeResult: preview.result,
      routeModel,
      routeExposure: { trigger: 'unavailable', hazards: [] },
      enroute: preview.editor.enroute,
      routeString: preview.editor.rawText,
    }))
  }
```

`flightRule: 'VFR'` 고정이 사라진 것이 핵심이다 — `routeForm.flightRule`을 그대로 쓰므로 IFR 탭에서 불러오면 IFR 경로가 된다.

- [ ] **Step 3: 공항이 나중에 채워지면 이어받는 effect 추가**

`applyImportedPath` 위에 ref와 effect를 추가한다:

```js
  const pendingImportTermsRef = useRef(null)

  // 공항 미확정 상태로 불러온 경로: 조종사가 출발·도착을 다 고르는 순간 이어서
  // 경로를 만든다. 별도 실행 버튼을 두지 않는다.
  useEffect(() => {
    const terms = pendingImportTermsRef.current
    if (!terms || !routeForm.departureAirport || !routeForm.arrivalAirport) return
    pendingImportTermsRef.current = null
    setImportedPreview(null)
    commitImportedRoute(routeForm, terms).catch((err) => setImportError(err.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeForm.departureAirport, routeForm.arrivalAirport])
```

- [ ] **Step 4: 상태와 반환 교체**

`importWarning` 상태 선언을 지우고 다음으로 바꾼다:

```js
  const [importNotices, setImportNotices] = useState([])
  const [importedPreview, setImportedPreview] = useState(null)
```

`setImportWarning(...)` 호출을 전부 지운다. 훅 반환 객체(`:1872` 근처)에서 `importWarning`을 지우고 `importNotices`, `importedPreview`를 추가한다.

import 줄을 보강한다:

```js
import { MAX_IMPORT_BYTES, parseRouteFile, extractRoutePaths } from './lib/routeImport.js'
import { resolveImportedRoute } from './lib/routeImportResolve.js'
```

`simplifyRoute`·`snapEndpointsToAirports`·`isWithinKoreaFir` import는 이 파일에서 더 이상 쓰지 않으므로 지운다(모듈 export는 그대로 둔다 — 시험이 쓴다).

`loadNavdata`, `formatManualRouteString`가 이미 import되어 있는지 확인하고 없으면 추가한다.

- [ ] **Step 5: 미리보기 선을 지도에 넘긴다**

`syncRoutePreviewLayers`는 `model.pendingRouteResult.previewGeojson`을 이미 그린다. `importedPreview`를 그 모양으로 감싸 넘기면 `routePreviewSync.js`를 고치지 않아도 된다.

`useRouteBriefing.js:233`의 `pendingRouteResult: routeDraftResult,`를 다음으로 바꾼다:

```js
    pendingRouteResult: importedPreview
      ? { previewGeojson: { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { role: 'route-preview-line' }, geometry: importedPreview }] } }
      : routeDraftResult,
```

`importedPreview`를 그 memo의 의존성 배열에 추가한다.

`MapView.jsx:1436`은 `routePreviewModel?.pendingRouteResult?.flightRule !== 'VFR'`로 VFR 경유점 처리를 가른다. 위 임시 객체에는 `flightRule`이 없으므로 그 분기는 자연히 건너뛴다 — 선만 그려지고 경유점 아이콘은 나오지 않는다. 공항 미확정 상태에서는 그게 맞다.

- [ ] **Step 6: 빌드와 기존 시험 확인**

```bash
cd frontend && npm run build && npm test
```
Expected: 빌드 성공, 모든 단위 시험 PASS.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(route-briefing): draw imported routes before airports are known and keep the tab's flight rule"
```

---

### Task 6: 알림 표시와 `.fpl` 허용

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx:208` (구조분해), `:353` (`accept`), `:380` (드롭존 문구), `:387-395` (`importFeedback`)

**Interfaces:**
- Consumes: `importNotices`, `importError` (Task 5).
- Produces: 없음 (UI 종단).

- [ ] **Step 1: 파일 선택 허용 목록과 안내 문구에 FPL 추가**

`:353`:
```jsx
        accept=".geojson,.json,.gpx,.kml,.fpl"
```

`:380`:
```jsx
              <span className="rb-import-dropzone-text">{'GeoJSON · GPX · KML · FPL 파일을 여기에 드래그하세요'}</span>
```

- [ ] **Step 2: 알림 목록 렌더링으로 교체**

`:387-395`의 `importFeedback`을 바꾼다. 조치가 필요한 항목(`level: 'action'`)은 `warning`으로, 단순 보고는 `info`로 낸다:

```jsx
  const importFeedback = (
    <>
      {importCandidates.length > 0 && (
        <RouteImportChooser candidates={importCandidates} onSelect={applyImportedPath} onCancel={cancelImportChoice} />
      )}
      {importNotices.map((notice) => (
        <MessageBar key={notice.code + notice.message} intent={notice.level === 'action' ? 'warning' : 'info'}>
          <MessageBarBody>{notice.message}</MessageBarBody>
        </MessageBar>
      ))}
      {importError && <MessageBar intent="error"><MessageBarBody>{importError}</MessageBarBody></MessageBar>}
    </>
  )
```

`key`에 `message`를 붙이는 이유: `fix-moved`는 지점마다 하나씩 나올 수 있어 `code`만으로는 중복된다.

- [ ] **Step 3: 구조분해 갱신**

`:208` 근처에서 `importWarning`을 `importNotices`, `importedPreview`로 바꾼다. `importedPreview`는 지도 모델로 넘기는 자리(Task 5 Step 5)에서 쓴다.

- [ ] **Step 4: 빌드 확인**

```bash
cd frontend && npm run build
```
Expected: 성공. `importWarning` 미정의 참조가 남아 있으면 여기서 잡힌다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx
git commit -m "feat(route-briefing): accept .fpl and list import notices instead of one warning line"
```

---

### Task 7: 브라우저 계약 시험

**Files:**
- Modify: `frontend/verification/contracts/route-import.spec.mjs`
- Create: `frontend/test/fixtures/route-import/no-airport-segment.gpx`
- Reference: [browser verification](../../policies/verification/browser-verification.md), [contract registry](../../policies/verification/contracts.md), [dev-server 절차](../../operations/dev-server-and-capture.md)

**Interfaces:**
- Consumes: Task 1-6 전부.
- Produces: 없음 (검증 종단).

- [ ] **Step 1: 공항이 없는 구간 fixture 작성**

`frontend/test/fixtures/route-import/no-airport-segment.gpx` — 양끝이 어느 공항에서도 10NM 밖인 동해상 구간:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>동해 구간</name>
    <rtept lat="37.8000" lon="130.2000"><name>WPT01</name></rtept>
    <rtept lat="37.4000" lon="130.6000"><name>WPT02</name></rtept>
    <rtept lat="37.0000" lon="131.0000"><name>WPT03</name></rtept>
  </rte>
</gpx>
```

- [ ] **Step 2: 기존 다중 경로 시험 갱신**

Task 3에서 이름 있는 지점을 더 이상 솎지 않으므로 후보 라벨의 점 개수 표시가 달라질 수 있다. `route-import.spec.mjs:28-30`의 기대 문자열을 실제 렌더 결과에 맞춘다. 먼저 현재 값을 확인한다:

```bash
cd frontend && npx playwright test verification/contracts/route-import.spec.mjs --reporter=line
```

실패 메시지에 실제 접근성 이름이 찍히므로 그 값으로 고친다.

- [ ] **Step 3: 공항 미확정 시나리오 추가**

`route-import.spec.mjs`의 `test.describe` 안에 추가한다. 첫 시험의 localStorage·네비게이션 준비 부분을 그대로 반복한다(헬퍼로 빼지 않는다 — 두 시험이 서로 다른 탭을 쓸 수 있어야 한다):

```js
const noAirportFile = fileURLToPath(new URL('../../test/fixtures/route-import/no-airport-segment.gpx', import.meta.url))
const fplFile = fileURLToPath(new URL('../../test/fixtures/route-import/rksi-rkpk.fpl', import.meta.url))

test('draws a route with no nearby airports and waits for the pilot to pick them', async ({ page }, testInfo) => {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '브리핑', exact: true }).click()
    await page.getByRole('button', { name: 'VFR', exact: true }).click()
  } else {
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    await page.getByRole('tab', { name: 'VFR', exact: true }).click()
  }

  await page.getByTestId('route-import-file').setInputFiles(noAirportFile)

  // 거부되지 않고, 공항을 고르라는 안내가 뜬다
  await expect(page.getByText('출발·도착 공항을 골라주세요')).toBeVisible()
  await expect(page.getByText(/파일을 해석할 수 없습니다/)).toHaveCount(0)
})

test('fills departure and arrival from an FPL without asking', async ({ page }, testInfo) => {
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '브리핑', exact: true }).click()
    await page.getByRole('button', { name: 'VFR', exact: true }).click()
  } else {
    await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
    await page.getByRole('tab', { name: 'VFR', exact: true }).click()
  }

  await page.getByTestId('route-import-file').setInputFiles(fplFile)

  await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /도착.*RKPK/ })).toBeVisible()
  await expect(page.getByText('출발·도착 공항을 골라주세요')).toHaveCount(0)
})

test('imports into IFR when the IFR tab is active', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'IFR 탭 진입 경로가 데스크톱과 다르다 — 데스크톱에서만 확인한다')
  await page.addInitScript((version) => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', version)
  }, CURRENT_VERSION)
  await page.goto('/', { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: '비행 전 브리핑', exact: true }).click()
  await page.getByRole('tab', { name: 'IFR', exact: true }).click()

  await page.getByTestId('route-import-file').setInputFiles(fplFile)

  await expect(page.getByRole('tab', { name: 'IFR', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: /출발.*RKSI/ })).toBeVisible()
})
```

- [ ] **Step 4: 계약 시험 실행**

[dev-server 절차](../../operations/dev-server-and-capture.md)에 따라 서버를 띄우고:

```bash
cd frontend && npx playwright test verification/contracts/route-import.spec.mjs --reporter=line
```
Expected: 전부 PASS. 실패하면 `superpowers:systematic-debugging`으로 원인을 찾고 해당 태스크로 돌아간다.

`.fpl` 파일 입력이 브라우저에서 거부되면 Task 6 Step 1의 `accept` 목록을 확인한다.

- [ ] **Step 5: 계약 등록부 갱신**

`docs/policies/verification/contracts.md`의 `route-import` 항목에 새 시나리오 3개를 적는다.

- [ ] **Step 6: 그래프 갱신과 커밋**

```bash
cd /home/john_doe/ProjectAMO && graphify update .
git add frontend/verification/contracts/route-import.spec.mjs frontend/test/fixtures/route-import/no-airport-segment.gpx docs/policies/verification/contracts.md
git commit -m "test(route-briefing): cover airport-less, FPL, and IFR route imports in the browser contract"
```

---

## 실물 파일 의존성

Task 1의 fixture는 Garmin FPL 규격에 맞춰 손으로 쓴 것이다. **EFB가 실제로 내보낸 FPL 파일 1개 이상으로 Task 7 이후 한 번 더 확인해야 한다.** 앱마다 네임스페이스 접두사, 요소 순서, `USER WAYPOINT` 표기가 다르다. 실물 파일을 받으면 `frontend/test/fixtures/route-import/real-world/`에 넣고 Task 1의 시험을 그 파일로 한 번 더 돌린다(해당 디렉터리는 이미 존재한다).

실물 파일에서 깨지면 `extractFplPaths`의 태그 조회를 네임스페이스에 무관하게 고치는 것이 첫 수순이다 — `getElementsByTagName`은 접두사가 붙은 문서(`<gfp:waypoint>`)에서 이름이 어긋난다.

## 완료 기준

- `cd frontend && npm test` 전부 통과
- `cd frontend && npm run build` 성공
- `route-import.spec.mjs` 계약 시험 전부 통과, 출력으로 증거 제시
- 스펙의 실패 3종 외에는 어떤 파일도 불러오기를 실패시키지 않음
- 실물 FPL 파일로 확인 완료
