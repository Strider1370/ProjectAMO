# 경로 파일 불러오기 (GPX·KML·GeoJSON) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 경로 파일(GeoJSON/GPX/KML)을 불러와 기존 VFR 경유점 파이프라인에 주입해, 그 경로를 따라 브리핑(위험·leg 지형·연직단면·목적지)이 그대로 동작하게 한다.

**Architecture:** 프런트 전용 어댑터. `routeImport.js`(순수 함수: 파싱→후보경로 추출→RDP 솎기→공항 스냅) → `buildVfrRouteFromWaypoints`(routeBriefingModel.js, 좌표를 수동 VFR 빌더와 동일 shape의 `routeResult`+`vfrWaypoints`로 변환) → `useRouteBriefing`의 `importRouteFromFile` 액션이 `loadSavedRoute`와 동일한 순서로 상태를 세팅(자동 VFR 생성 effect가 경유점을 덮어쓰지 않도록 `lastVfrKeyRef` 선점 필수) → `RouteBriefingPanel.jsx`에 버튼·다중 경로 선택 UI.

**Tech Stack:** React 19, 순수 JS 라이브러리(`@tmcw/togeojson`, `simplify-js`), `node --test`, Playwright(브라우저 검증).

**핵심 확인 사항(코드 조사로 검증됨, 재확인 불필요):**
- VFR 모드의 지도 렌더링은 `syncVfrWaypointData`(routePreviewSync.js:214-218)가 `vfrWaypoints`에서 `buildVfrGeoJSON`으로 직접 그린다. `routeResult.previewGeojson`은 VFR에서 지도 렌더링에 **쓰이지 않는다**(IFR 전용 분기만 `syncRoutePreviewLayers`에 있음). 따라서 임포트가 만드는 `previewGeojson`은 정확한 role 매칭이 필요 없다 — 참고용으로만 채운다.
- `getCurrentRouteLineString`(routeBriefingModel.js:251-265)의 VFR 분기는 `vfrWaypoints`에서 직접 LineString을 만든다 — `routeResult.previewGeojson`과 무관. 브리핑·연직단면 요청은 이 함수를 거치므로 `vfrWaypoints`만 정확하면 된다.
- `composeBriefing`(백엔드 briefing-composer.js:49-56)의 `buildBanner`는 `category !== 'UNKNOWN'`인 공항만 채택한다 — 공항 폴백(dep/arr 빈 문자열)이어도 브리핑은 안전하게 빈 배너로 응답한다(크래시 없음).
- VFR 자동 경로생성 effect(useRouteBriefing.js:611-621)는 `routeForm.departureAirport`/`arrivalAirport`가 바뀌는 순간 `lastVfrKeyRef.current`와 다르면 직선 경로로 **덮어쓴다**. `loadSavedRoute`(같은 파일:624-644)가 이미 이 문제를 `lastVfrKeyRef` 선점으로 해결한 패턴이며, 임포트도 동일하게 따른다.

---

## Task 1: `routeImport.js` — 파일 파싱 + 후보 경로 추출

**Files:**
- Create: `frontend/src/features/route-briefing/lib/routeImport.js`
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

- [ ] **Step 1: 의존성 설치**

Run: `npm install @tmcw/togeojson simplify-js @xmldom/xmldom --prefix "frontend"`

Expected: `frontend/package.json`의 `dependencies`에 `@tmcw/togeojson`, `simplify-js`, `@xmldom/xmldom`가 추가됨.

**중요 — `@xmldom/xmldom`이 왜 필요한가**: 브라우저는 전역 `DOMParser`를 갖고 있지만, 이 프로젝트의 단위테스트는 `node --test`(순수 Node, jsdom 없음)로 돈다. Node엔 전역 `DOMParser`가 없다(`node -e "console.log(typeof DOMParser)"` → `undefined`, Node 22.20.0 확인됨). `@tmcw/togeojson`도 [공식 문서](https://www.npmjs.com/package/@tmcw/togeojson)에서 Node 사용 시 xmldom과 조합하도록 안내한다. 그래서 `parseRouteFile`은 런타임에 전역 `DOMParser`가 있으면(브라우저) 그걸 쓰고, 없으면(Node 테스트) `@xmldom/xmldom`으로 폴백한다(Step 3 참고). GPX는 DOM 직접 파싱, KML은 `@tmcw/togeojson`을 쓴다 — 둘 다 이 폴백을 통해 만든 `doc`을 입력으로 받는다.

- [ ] **Step 2: 실패하는 테스트 작성 — GeoJSON 파싱 + 후보 추출**

`frontend/src/features/route-briefing/lib/routeImport.test.js` 새로 작성:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRouteFile, extractRoutePaths, simplifyRoute, snapEndpointsToAirports, isWithinKoreaFir } from './routeImport.js'

const GEOJSON_LINE = JSON.stringify({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { name: 'RKSS-RKPK VFR sample' },
      geometry: { type: 'LineString', coordinates: [[126.79, 37.5583], [127.4, 37.0], [128.9382, 35.1795]] },
    },
  ],
})

test('parseRouteFile + extractRoutePaths: GeoJSON LineString → 1개 후보', () => {
  const parsed = parseRouteFile('route.geojson', GEOJSON_LINE)
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK VFR sample')
  assert.equal(candidates[0].coords.length, 3)
  assert.deepEqual(candidates[0].coords[0], [126.79, 37.5583])
})

test('parseRouteFile: 확장자 .json도 GeoJSON으로 처리', () => {
  const parsed = parseRouteFile('route.json', GEOJSON_LINE)
  assert.equal(extractRoutePaths(parsed).length, 1)
})

test('parseRouteFile: 깨진 GeoJSON은 에러', () => {
  assert.throws(() => parseRouteFile('bad.geojson', '{not json'))
})
```

- [ ] **Step 2b: 테스트 실행 → 실패 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: FAIL — `Cannot find module './routeImport.js'`

- [ ] **Step 3: `routeImport.js` 최소 구현 — GeoJSON 경로만**

`frontend/src/features/route-briefing/lib/routeImport.js` 새로 작성:

```js
// 외부 경로 파일(GeoJSON/GPX/KML)을 우리 VFR 경유점 파이프라인이 먹을 수 있는
// [lon,lat] 좌표 배열로 바꾸는 순수 함수 모음. UI/상태 없음 — useRouteBriefing이 호출한다.
import { kml as kmlToGeoJSON } from '@tmcw/togeojson'
import { DOMParser as NodeDOMParser } from '@xmldom/xmldom'
import { greatCircleNm } from './routePreview.js'

// 브라우저는 전역 DOMParser를 우선 쓰고, 전역이 없는 환경(node --test)에선 xmldom로
// 폴백한다. 두 구현 모두 표준 DOM Level 1 API(getElementsByTagName·getAttribute·
// textContent)를 지원하므로 이후 코드는 어느 쪽이 만든 doc인지 신경 쓸 필요 없다.
function getDomParserCtor() {
  return typeof DOMParser !== 'undefined' ? DOMParser : NodeDOMParser
}

// 지도 maxBounds(frontend/src/features/map/mapConfig.js MAP_CONFIG.maxBounds)와 동일한
// 한국 FIR 근사 경계. 숫자 4개뿐이라 별도 import로 feature 간 결합을 만들지 않고 값만 미러링.
const KOREA_FIR_BOUNDS = { minLon: 116, maxLon: 139, minLat: 26, maxLat: 44 }

export function isWithinKoreaFir(lon, lat) {
  return (
    Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= KOREA_FIR_BOUNDS.minLon && lon <= KOREA_FIR_BOUNDS.maxLon &&
    lat >= KOREA_FIR_BOUNDS.minLat && lat <= KOREA_FIR_BOUNDS.maxLat
  )
}

function detectFileKind(name) {
  const ext = String(name ?? '').toLowerCase().split('.').pop()
  if (ext === 'gpx') return 'gpx'
  if (ext === 'kml') return 'kml'
  return 'geojson'
}

// 파일 텍스트 → 중간 표현. GeoJSON은 그대로 파싱, GPX는 DOM(다음 스텝에서 후보 추출 시
// 직접 순회), KML은 togeojson으로 변환. GPX/KML 파싱 실패(malformed XML) 감지는 이 계획
// 범위 밖 — 브라우저 DOMParser는 malformed XML에서도 예외를 던지지 않고 <parsererror>
// 요소를 문서에 심는 방식이라, xmldom과 동일하게 동작을 보장할 테스트가 없는 채로 감지
// 로직만 넣는 건 미검증 코드가 된다(YAGNI). 필요해지면 전용 테스트와 함께 추가한다.
export function parseRouteFile(name, text) {
  const kind = detectFileKind(name)
  if (kind === 'geojson') {
    let geojson
    try {
      geojson = JSON.parse(text)
    } catch {
      throw new Error('파일을 읽을 수 없습니다 (GeoJSON/GPX/KML 확인)')
    }
    return { format: 'geojson', geojson }
  }
  const Ctor = getDomParserCtor()
  const doc = new Ctor().parseFromString(text, 'text/xml')
  if (kind === 'gpx') return { format: 'gpx', doc }
  return { format: 'kml', geojson: kmlToGeoJSON(doc) }
}

function extractGeoJsonPaths(geojson) {
  const candidates = []
  const features = geojson?.type === 'FeatureCollection' ? geojson.features : [geojson]
  let routeIdx = 0
  const pointCoords = []
  for (const feature of features ?? []) {
    const geom = feature?.geometry
    if (!geom) continue
    if (geom.type === 'LineString' && geom.coordinates?.length >= 2) {
      routeIdx += 1
      candidates.push({ label: feature.properties?.name || `경로 ${routeIdx}`, kind: 'route', coords: geom.coordinates })
    } else if (geom.type === 'MultiLineString') {
      for (const line of geom.coordinates ?? []) {
        if (line.length >= 2) {
          routeIdx += 1
          candidates.push({ label: feature.properties?.name || `경로 ${routeIdx}`, kind: 'route', coords: line })
        }
      }
    } else if (geom.type === 'Point' && geom.coordinates?.length === 2) {
      pointCoords.push(geom.coordinates)
    }
  }
  if (candidates.length === 0 && pointCoords.length >= 2) {
    candidates.push({ label: '지점 모음', kind: 'points', coords: pointCoords })
  }
  return candidates
}

// parseRouteFile의 결과에서 "선택 가능한 경로 후보" 목록을 뽑는다. 파일에 경로가
// 여러 개면 전부 반환 — 고르는 건 호출부(useRouteBriefing) 책임.
export function extractRoutePaths(parsed) {
  if (parsed.format === 'gpx') return []
  return extractGeoJsonPaths(parsed.geojson)
}

export function simplifyRoute(coords, maxPts = 20) {
  return coords
}

export function snapEndpointsToAirports(coords, airports, thresholdNm = 5) {
  return { departureAirport: null, arrivalAirport: null }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/package.json frontend/package-lock.json frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "feat(briefing): 경로 파일 파싱 — GeoJSON 후보 경로 추출

@tmcw/togeojson·simplify-js 추가. parseRouteFile/extractRoutePaths로
GeoJSON LineString/MultiLineString/Point를 선택 가능한 후보 경로로 변환."
```

---

## Task 2: GPX 후보 추출 (rte/track 구분 — DOM 직접 파싱)

GPX는 `<rte>`(계획 경로)와 `<trk>`(실제 궤적)를 종류로 구분해야 하는데, togeojson 변환 결과만으로는 둘 다 LineString이라 구분이 안 된다. 원본 GPX DOM에서 `<rte>`/`<trk>`/`<wpt>` 태그를 직접 순회해 종류를 붙인다(togeojson 불필요 — 좌표 읽기는 속성 접근뿐이라 간단).

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js`
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

- [ ] **Step 1: 실패하는 테스트 작성 — GPX rte/trk 구분**

`routeImport.test.js`에 추가:

```js
const GPX_ROUTE = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>RKSS-RKPK VFR sample</name>
    <rtept lat="37.5583" lon="126.7906"><name>RKSS</name></rtept>
    <rtept lat="37.0000" lon="127.4000"><name>WP1</name></rtept>
    <rtept lat="35.1795" lon="128.9382"><name>RKPK</name></rtept>
  </rte>
</gpx>`

const GPX_TRACK = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>실제 비행 궤적</name>
    <trkseg>
      <trkpt lat="37.5583" lon="126.7906"></trkpt>
      <trkpt lat="37.4000" lon="127.0000"></trkpt>
      <trkpt lat="35.1795" lon="128.9382"></trkpt>
    </trkseg>
  </trk>
</gpx>`

test('extractRoutePaths: GPX rte는 kind=route', () => {
  const parsed = parseRouteFile('route.gpx', GPX_ROUTE)
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK VFR sample')
  assert.equal(candidates[0].coords.length, 3)
  assert.deepEqual(candidates[0].coords[0], [126.7906, 37.5583]) // [lon, lat] 순서로 정규화
})

test('extractRoutePaths: GPX trk는 kind=track', () => {
  const parsed = parseRouteFile('track.gpx', GPX_TRACK)
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'track')
  assert.equal(candidates[0].label, '실제 비행 궤적')
  assert.equal(candidates[0].coords.length, 3)
})

test('extractRoutePaths: rte와 trk가 둘 다 있으면 후보 2개', () => {
  const combined = GPX_ROUTE.replace('</gpx>', '') + GPX_TRACK.replace(/^<\?xml[^>]*>\s*<gpx[^>]*>/, '')
  const parsed = parseRouteFile('both.gpx', combined)
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 2)
  assert.deepEqual(candidates.map((c) => c.kind).sort(), ['route', 'track'])
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: FAIL — 새 3개 테스트가 `candidates.length, 0`으로 실패 (extractRoutePaths가 gpx면 `[]` 반환 중)

- [ ] **Step 3: GPX 후보 추출 구현**

`routeImport.js`에서 `extractRoutePaths`를 다음으로 교체하고, 헬퍼 함수들을 추가:

```js
function coordsFromGpxPoints(nodeList) {
  return Array.from(nodeList)
    .map((el) => [Number(el.getAttribute('lon')), Number(el.getAttribute('lat'))])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat))
}

function extractGpxPaths(doc) {
  const candidates = []
  const rtes = Array.from(doc.getElementsByTagName('rte'))
  rtes.forEach((rte, i) => {
    const coords = coordsFromGpxPoints(rte.getElementsByTagName('rtept'))
    if (coords.length >= 2) {
      const nameEl = rte.getElementsByTagName('name')[0]
      candidates.push({ label: nameEl?.textContent?.trim() || `경로 ${i + 1}`, kind: 'route', coords })
    }
  })
  const trks = Array.from(doc.getElementsByTagName('trk'))
  trks.forEach((trk, i) => {
    const coords = coordsFromGpxPoints(trk.getElementsByTagName('trkpt'))
    if (coords.length >= 2) {
      const nameEl = trk.getElementsByTagName('name')[0]
      candidates.push({ label: nameEl?.textContent?.trim() || `궤적 ${i + 1}`, kind: 'track', coords })
    }
  })
  if (candidates.length === 0) {
    const wpts = coordsFromGpxPoints(doc.getElementsByTagName('wpt'))
    if (wpts.length >= 2) candidates.push({ label: '지점 모음', kind: 'points', coords: wpts })
  }
  return candidates
}

export function extractRoutePaths(parsed) {
  if (parsed.format === 'gpx') return extractGpxPaths(parsed.doc)
  return extractGeoJsonPaths(parsed.geojson)
}
```

(`extractGeoJsonPaths`는 Task 1에서 이미 작성됨 — 그대로 둔다. `export function extractRoutePaths` 기존 정의를 이 새 버전으로 교체.)

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "feat(briefing): GPX rte/trk 후보 구분 — DOM 직접 파싱

<rte>=kind:route(계획 경로), <trk>=kind:track(실제 궤적)를 원본 GPX DOM에서
직접 읽어 구분. togeojson은 rte/trk를 둘 다 LineString으로만 내놔 구분이
안 되므로, 좌표 읽기만 하는 이 정도는 DOM 순회로 직접 처리."
```

---

## Task 3: KML 후보 추출

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js`
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

- [ ] **Step 1: 실패하는 테스트 작성 — KML**

`routeImport.test.js`에 추가:

```js
const KML_LINE = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>RKSS-RKPK VFR sample</name>
    <Placemark>
      <name>RKSS-RKPK</name>
      <LineString>
        <coordinates>
          126.7906,37.5583,0
          127.4000,37.0000,0
          128.9382,35.1795,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`

test('extractRoutePaths: KML LineString은 kind=route', () => {
  const parsed = parseRouteFile('route.kml', KML_LINE)
  const candidates = extractRoutePaths(parsed)
  assert.equal(candidates.length, 1)
  assert.equal(candidates[0].kind, 'route')
  assert.equal(candidates[0].label, 'RKSS-RKPK')
  assert.equal(candidates[0].coords.length, 3)
  assert.deepEqual(candidates[0].coords[0], [126.7906, 37.5583])
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: FAIL — `extractGeoJsonPaths`가 `parsed.geojson`을 그대로 쓰는데, `parseRouteFile`이 kml에 대해 `kmlToGeoJSON(doc)`을 이미 geojson으로 넣고 있으므로 실제로는 **통과할 수도 있음**. 통과하면 이 스텝은 "이미 구현됨 확인"으로 취급하고 다음 스텝(회귀 테스트 전체 실행)으로 진행.

- [ ] **Step 3: (필요 시) KML 처리 보정**

`extractRoutePaths`에서 `parsed.format === 'kml'`도 `extractGeoJsonPaths(parsed.geojson)`을 타므로 별도 구현 불필요 — Step 2에서 이미 PASS라면 이 스텝은 스킵. FAIL이라면(예: togeojson의 KML 출력이 `Feature.properties.name`이 아닌 다른 필드를 쓰는 경우) 아래처럼 라벨 폴백을 보강:

```js
// extractGeoJsonPaths 내 라벨 산출부를 다음으로 교체(더 관대한 이름 추출):
const label = feature.properties?.name || feature.properties?.title || `경로 ${routeIdx}`
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "test(briefing): KML LineString 경로 추출 검증"
```

(Step 3에서 실제 코드 변경이 없었다면 `git commit`은 테스트 파일만 포함될 수 있음 — 정상.)

---

## Task 4: 점 솎기(RDP) + 공항 스냅

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeImport.js`
- Test: `frontend/src/features/route-briefing/lib/routeImport.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`routeImport.test.js`에 추가:

```js
test('simplifyRoute: 조밀한 입력을 20개 이하로 줄이고 첫·끝 점을 보존', () => {
  const dense = Array.from({ length: 500 }, (_, i) => [126.5 + i * 0.01, 36.0 + i * 0.002])
  const simplified = simplifyRoute(dense, 20)
  assert.ok(simplified.length <= 20, `expected <=20, got ${simplified.length}`)
  assert.ok(simplified.length >= 2)
  assert.deepEqual(simplified[0], dense[0])
  assert.deepEqual(simplified[simplified.length - 1], dense[dense.length - 1])
})

test('simplifyRoute: 이미 목표보다 적으면 그대로 반환', () => {
  const coords = [[126.79, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  assert.deepEqual(simplifyRoute(coords, 20), coords)
})

test('snapEndpointsToAirports: 임계 안이면 스냅', () => {
  const airports = [
    { icao: 'RKSS', lon: 126.7906, lat: 37.5583 },
    { icao: 'RKPK', lon: 128.9382, lat: 35.1795 },
  ]
  const coords = [[126.79, 37.558], [127.4, 37.0], [128.94, 35.18]]
  const { departureAirport, arrivalAirport } = snapEndpointsToAirports(coords, airports, 5)
  assert.equal(departureAirport, 'RKSS')
  assert.equal(arrivalAirport, 'RKPK')
})

test('snapEndpointsToAirports: 임계 밖이면 null(폴백)', () => {
  const airports = [{ icao: 'RKSS', lon: 126.7906, lat: 37.5583 }]
  const coords = [[130.0, 40.0], [131.0, 41.0]] // 멀리 떨어진 좌표
  const { departureAirport, arrivalAirport } = snapEndpointsToAirports(coords, airports, 5)
  assert.equal(departureAirport, null)
  assert.equal(arrivalAirport, null)
})

test('isWithinKoreaFir: 경계 안/밖 판정', () => {
  assert.equal(isWithinKoreaFir(127.5, 36.5), true)
  assert.equal(isWithinKoreaFir(0, 0), false)
  assert.equal(isWithinKoreaFir(150, 50), false)
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: FAIL — `simplifyRoute`는 항상 원본 그대로 반환(500개), `snapEndpointsToAirports`는 항상 `null, null` 반환 중이라 스냅 성공 케이스가 실패.

- [ ] **Step 3: 구현**

`routeImport.js`의 `simplifyRoute`·`snapEndpointsToAirports` 자리표시자를 다음으로 교체. 상단 import에 `simplify-js` 추가:

```js
import simplify from 'simplify-js'
```

```js
// RDP(Ramer-Douglas-Peucker)로 점을 줄인다. tolerance(도 단위)를 이분 탐색으로
// 늘려가며 결과 길이가 maxPts 이하가 되는 가장 작은 tolerance를 찾는다.
// simplify-js는 첫·끝 점을 항상 보존한다(알고리즘 특성).
export function simplifyRoute(coords, maxPts = 20) {
  if (coords.length <= maxPts) return coords
  const points = coords.map(([lon, lat]) => ({ x: lon, y: lat }))
  let lo = 0
  let hi = 5 // 도 단위 상한 — 한반도 규모 경로에 충분히 넉넉함
  let best = points
  for (let i = 0; i < 25; i += 1) {
    const mid = (lo + hi) / 2
    const candidate = simplify(points, mid, true)
    if (candidate.length > maxPts) {
      lo = mid
    } else {
      best = candidate
      hi = mid
    }
  }
  return best.map((p) => [p.x, p.y])
}

// 끝점이 공항 임계거리(NM) 안이면 그 ICAO, 아니면 null(호출부가 일반 지점으로 폴백).
export function snapEndpointsToAirports(coords, airports, thresholdNm = 5) {
  function nearest([lon, lat]) {
    let best = null
    for (const airport of airports ?? []) {
      if (!Number.isFinite(airport.lon) || !Number.isFinite(airport.lat)) continue
      const distNm = greatCircleNm(lon, lat, airport.lon, airport.lat)
      if (distNm <= thresholdNm && (!best || distNm < best.distNm)) {
        best = { icao: airport.icao, distNm }
      }
    }
    return best?.icao ?? null
  }
  return {
    departureAirport: nearest(coords[0]),
    arrivalAirport: nearest(coords[coords.length - 1]),
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeImport.test.js"`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/lib/routeImport.js frontend/src/features/route-briefing/lib/routeImport.test.js
git commit -m "feat(briefing): 경로 임포트 — RDP 점 솎기(N=20) + 공항 스냅(5NM)"
```

---

## Task 5: `buildVfrRouteFromWaypoints` — 좌표 → VFR routeResult

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeBriefingModel.js`
- Test: `frontend/src/features/route-briefing/lib/routeBriefingModel.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

`routeBriefingModel.test.js` 상단 import에 `buildVfrRouteFromWaypoints` 추가, 파일 끝에 테스트 추가:

```js
import {
  buildBoundaryFixOptions,
  buildIfrDistanceBreakdown,
  buildIfrSequenceTokens,
  buildInitialVfrWaypoints,
  buildIapCandidates,
  buildVfrRouteFromWaypoints,
  chooseIapKeyForRunway,
  getCurrentRouteLineString,
  pickBestRunwayGroup,
} from './routeBriefingModel.js'
```

```js
test('buildVfrRouteFromWaypoints: 공항 둘 다 스냅됨 — fixed 끝점 + 중간 WP', () => {
  const airports = [
    { icao: 'RKSS', elevationFt: 18 },
    { icao: 'RKPK', elevationFt: 9 },
  ]
  const coords = [[126.7906, 37.5583], [127.4, 37.0], [128.9382, 35.1795]]
  const { routeResult, vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: 'RKSS',
    arrivalAirport: 'RKPK',
    airports,
  })

  assert.equal(routeResult.flightRule, 'VFR')
  assert.equal(routeResult.departureAirport, 'RKSS')
  assert.equal(routeResult.arrivalAirport, 'RKPK')
  assert.ok(routeResult.distanceNm > 0)
  assert.ok(routeResult.previewGeojson?.type === 'FeatureCollection')

  assert.equal(vfrWaypoints.length, 3)
  assert.equal(vfrWaypoints[0].id, 'RKSS')
  assert.equal(vfrWaypoints[0].fixed, true)
  assert.equal(vfrWaypoints[0].airportElevationFt, 18)
  assert.equal(vfrWaypoints[2].id, 'RKPK')
  assert.equal(vfrWaypoints[2].fixed, true)
  assert.equal(vfrWaypoints[1].fixed, false)
  assert.equal(vfrWaypoints[1].id, 'WP1')
})

test('buildVfrRouteFromWaypoints: 공항 폴백(스냅 안 됨) — 전부 일반 지점', () => {
  const coords = [[130.0, 40.0], [131.0, 41.0]]
  const { routeResult, vfrWaypoints } = buildVfrRouteFromWaypoints(coords, {
    departureAirport: null,
    arrivalAirport: null,
    airports: [],
  })

  assert.equal(routeResult.flightRule, 'VFR')
  assert.equal(routeResult.departureAirport, '')
  assert.equal(routeResult.arrivalAirport, '')
  assert.equal(vfrWaypoints.length, 2)
  assert.equal(vfrWaypoints[0].fixed, false)
  assert.equal(vfrWaypoints[1].fixed, false)
})

test('buildVfrRouteFromWaypoints: 점이 2개 미만이면 에러', () => {
  assert.throws(() => buildVfrRouteFromWaypoints([[126.79, 37.5]], { airports: [] }))
})
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeBriefingModel.test.js"`
Expected: FAIL — `buildVfrRouteFromWaypoints is not a function` (또는 undefined import)

- [ ] **Step 3: 구현**

`routeBriefingModel.js` 상단 import를 확장(기존 `import { augmentRouteWithProcedures } from './routePreview.js'`를 아래로 교체):

```js
import { augmentRouteWithProcedures, buildVfrGeoJSON, calcVfrDistance, relabeledWaypoints } from './routePreview.js'
```

`getVfrAirportAltitudeFt` 함수(파일 내 기존 정의) 근처에 추가:

```js
// 불러온 좌표 배열을 수동 VFR 빌더(buildVfrRoute, routePlanner.js)와 동일한 shape의
// routeResult + vfrWaypoints로 변환한다. 끝점이 공항으로 스냅됐으면 fixed 경유점(공항
// 표고 포함) — 배너·현재·목적지 섹션이 정상 작동. 스냅 안 됐으면 일반 지점(중간 WP와
// 동일 취급) — 해당 공항 의존 섹션만 자연히 비게 된다(composeBriefing이 빈 ICAO를
// 안전하게 무시함, briefing-composer.js buildBanner 참고).
//
// 참고: previewGeojson은 VFR 지도 렌더링에 쓰이지 않는다(syncVfrWaypointData가
// vfrWaypoints에서 직접 그림, routePreviewSync.js) — 여기선 구조 일관성을 위해서만 채운다.
export function buildVfrRouteFromWaypoints(coords, { departureAirport = null, arrivalAirport = null, airports = [] } = {}) {
  if (!Array.isArray(coords) || coords.length < 2) {
    throw new Error('경로 점이 부족합니다')
  }

  const departureElevationFt = departureAirport ? getAirportElevationFt(airports, departureAirport) : null
  const arrivalElevationFt = arrivalAirport ? getAirportElevationFt(airports, arrivalAirport) : null

  const waypoints = relabeledWaypoints(coords.map(([lon, lat], index) => {
    const isFirst = index === 0
    const isLast = index === coords.length - 1
    if (isFirst && departureAirport) {
      return {
        id: departureAirport, uid: crypto.randomUUID(), lon, lat,
        fixed: true, airportElevationFt: departureElevationFt, altitudeFt: departureElevationFt ?? 0,
      }
    }
    if (isLast && arrivalAirport) {
      return {
        id: arrivalAirport, uid: crypto.randomUUID(), lon, lat,
        fixed: true, airportElevationFt: arrivalElevationFt, altitudeFt: arrivalElevationFt ?? 0,
      }
    }
    return { id: `WP${index}`, uid: crypto.randomUUID(), lon, lat, fixed: false, altitudeFt: null }
  }))

  return {
    routeResult: {
      flightRule: 'VFR',
      departureAirport: departureAirport ?? '',
      arrivalAirport: arrivalAirport ?? '',
      distanceNm: calcVfrDistance(waypoints),
      previewGeojson: buildVfrGeoJSON(waypoints),
    },
    vfrWaypoints: waypoints,
  }
}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `node --test "frontend\src\features\route-briefing\lib\routeBriefingModel.test.js"`
Expected: PASS (기존 테스트 전부 + 신규 3개)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/lib/routeBriefingModel.js frontend/src/features/route-briefing/lib/routeBriefingModel.test.js
git commit -m "feat(briefing): buildVfrRouteFromWaypoints — 임포트 좌표를 VFR routeResult로"
```

---

## Task 6: `useRouteBriefing` — `importRouteFromFile` 액션 (단일 경로 케이스)

먼저 파일에 후보 경로가 1개뿐인 단순 케이스부터 배선한다. 다중 후보 선택 UI는 Task 7에서 얹는다.

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

- [ ] **Step 1: import 추가 + 상태 추가**

`useRouteBriefing.js` 상단 import 블록(4번째 줄 `import { buildBriefingRoute, ...`) 아래에 추가:

```js
import { parseRouteFile, extractRoutePaths, simplifyRoute, snapEndpointsToAirports, isWithinKoreaFir } from './lib/routeImport.js'
import { buildVfrRouteFromWaypoints } from './lib/routeBriefingModel.js'
```

`useRouteBriefing` 함수 내부, `const [vfrWaypoints, setVfrWaypoints] = useState([])` 아래에 상태 추가:

```js
  const [importCandidates, setImportCandidates] = useState([]) // 다중 경로 파일일 때 사용자 선택 대기 목록
  const [importWarning, setImportWarning] = useState(null)
  const [importError, setImportError] = useState(null)
```

- [ ] **Step 2: `applyImportedPath` + `importRouteFromFile` 액션 작성**

`loadSavedRoute` 함수(약 624-644줄) 바로 아래에 추가:

```js
  // 선택된 후보 경로 1개를 실제로 적용 — loadSavedRoute와 동일한 순서로 상태를
  // 세팅해야 VFR 자동 경로생성 effect(위 611-621줄)가 이 경유점을 직선으로
  // 덮어쓰지 않는다: lastVfrKeyRef 선점 → clearRouteDisplay → routeForm → 결과 세팅.
  function applyImportedPath(candidate) {
    setImportError(null)
    try {
      const simplified = simplifyRoute(candidate.coords, 20)
      const { departureAirport, arrivalAirport } = snapEndpointsToAirports(simplified, airports, 5)
      const { routeResult: importedResult, vfrWaypoints: importedWaypoints } = buildVfrRouteFromWaypoints(simplified, {
        departureAirport, arrivalAirport, airports,
      })

      lastVfrKeyRef.current = `${departureAirport ?? ''}>${arrivalAirport ?? ''}`
      clearRouteDisplay()
      setRouteForm((prev) => ({
        ...prev,
        flightRule: 'VFR',
        departureAirport: departureAirport ?? '',
        arrivalAirport: arrivalAirport ?? '',
      }))
      setRouteResult(importedResult)
      setVfrWaypoints(importedWaypoints)
      setFitBoundsRequest({ id: ++fitBoundsRequestRef.current, coordinates: simplified, maxZoom: 8 })

      const warnings = []
      const [firstLon, firstLat] = simplified[0]
      const [lastLon, lastLat] = simplified[simplified.length - 1]
      if (!isWithinKoreaFir(firstLon, firstLat) || !isWithinKoreaFir(lastLon, lastLat)) {
        warnings.push('경로가 한국 정보구역 밖 — 기상이 비어 있을 수 있습니다.')
      }
      setImportWarning(warnings.join(' ') || null)
    } catch (err) {
      setImportError(err.message)
    }
    setImportCandidates([])
  }

  // 파일 선택 → 파싱 → 후보 1개면 바로 적용, 여러 개면 선택 대기(importCandidates).
  async function importRouteFromFile(file) {
    setImportError(null)
    setImportWarning(null)
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseRouteFile(file.name, text)
      const candidates = extractRoutePaths(parsed)
      if (candidates.length === 0) {
        setImportError('경로 점이 부족합니다.')
        return
      }
      if (candidates.length === 1) {
        applyImportedPath(candidates[0])
        return
      }
      setImportCandidates(candidates)
    } catch (err) {
      setImportError(err.message || '파일을 읽을 수 없습니다 (GeoJSON/GPX/KML 확인)')
    }
  }
```

- [ ] **Step 3: 반환 객체에 노출**

`return { state: { ... }, ... actions: { ... } }` 블록에서 `state` 객체(약 776-796줄)에 추가. **참고**: `vfrWaypoints`는 이미 이 객체 리터럴에 있음(vfrLegs 기능 커밋에서 추가됨) — 객체 리터럴은 중복 키가 문법 에러는 아니지만(마지막 값이 이김), 혼동 방지를 위해 아래 3개만 추가:

```js
      importCandidates,
      importWarning,
      importError,
```

`actions` 객체(기존 `loadSavedRoute,` 라인 근처, 888줄)에 추가(`loadSavedRoute`는 이미 있으므로 다시 넣지 않는다):

```js
      importRouteFromFile,
      applyImportedPath,
```

- [ ] **Step 4: 수동 회귀 확인 (단위테스트 없이 — 브라우저에서 배선 확인)**

Run: `npx vite build --logLevel warn --prefix "frontend"` 또는 `cd "frontend" && npx vite build --logLevel warn`
Expected: exit code 0, 새 import·미사용 변수 에러 없음. (버튼 UI는 Task 8에서 붙이므로 이 시점엔 액션이 아직 어디서도 안 불림 — 컴파일 클린만 확인.)

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(briefing): importRouteFromFile 액션 — loadSavedRoute 패턴으로 경유점 주입

lastVfrKeyRef 선점 + routeForm 공항 세팅으로 VFR 자동 경로생성 effect가
불러온 경유점을 직선으로 덮어쓰지 않게 한다. 단일 후보 경로 케이스만 처리
(다중 후보 선택 UI는 별도 태스크)."
```

---

## Task 7: 다중 경로 선택 UI (`RouteImportChooser.jsx`)

**Files:**
- Create: `frontend/src/features/route-briefing/RouteImportChooser.jsx`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` (액션 1개 추가)

- [ ] **Step 1: 컴포넌트 작성**

`frontend/src/features/route-briefing/RouteImportChooser.jsx` 새로 작성:

```jsx
import { Button, MessageBar, MessageBarBody } from '../../shared/ui/fluent.js'

const KIND_LABEL = { route: '계획 경로', track: '실제 궤적', points: '지점 모음' }

// 파일에 경로 후보가 여러 개일 때만 뜨는 선택 목록. 단일 후보면 이 컴포넌트를
// 아예 렌더하지 않는다(호출부 조건부 렌더).
export default function RouteImportChooser({ candidates, onSelect, onCancel }) {
  if (!candidates || candidates.length === 0) return null

  return (
    <MessageBar intent="info">
      <MessageBarBody>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{'파일에 경로가 여러 개 있습니다. 하나를 선택하세요.'}</span>
          {candidates.map((candidate, index) => (
            <Button
              key={`${candidate.label}-${index}`}
              appearance="secondary"
              size="small"
              onClick={() => onSelect(candidate)}
            >
              {`${candidate.label} · ${KIND_LABEL[candidate.kind] ?? candidate.kind} · ${candidate.coords.length}점`}
            </Button>
          ))}
          <Button appearance="subtle" size="small" onClick={onCancel}>{'취소'}</Button>
        </div>
      </MessageBarBody>
    </MessageBar>
  )
}
```

- [ ] **Step 2: `useRouteBriefing`에 취소 액션 추가**

`useRouteBriefing.js`의 `applyImportedPath` 함수 바로 아래에 추가:

```js
  function cancelImportChoice() {
    setImportCandidates([])
  }
```

반환 `actions` 블록에 추가(Task 6 Step 3에서 추가한 줄들 아래):

```js
      cancelImportChoice,
```

- [ ] **Step 3: 컴포넌트 파일이 fluent.js의 named export를 실제로 갖는지 확인**

Run: `grep -n "export.*MessageBar" "frontend\src\shared\ui\fluent.js"`
Expected: `MessageBar`, `MessageBarBody`, `Button`이 export 목록에 있음(RouteBriefingPanel.jsx가 이미 이 모듈에서 같은 이름들을 가져다 쓰고 있으므로 존재 확인용 — 이미 확인됨, 별도 수정 불필요).

- [ ] **Step 4: 빌드 확인**

Run: `cd "frontend" && npx vite build --logLevel warn`
Expected: exit code 0

- [ ] **Step 5: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/RouteImportChooser.jsx frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(briefing): 다중 경로 파일용 선택 UI(RouteImportChooser)"
```

---

## Task 8: `RouteBriefingPanel.jsx` — 파일 선택 버튼 + 배선

**Files:**
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`

(레이아웃은 파일 내 기존 관례대로 인라인 `style={{...}}`로 처리 — 이 파일은 이미 여러 곳에서 작은 일회성 레이아웃을 CSS 클래스 대신 인라인으로 쓴다(예: `vfr-layer-toggles` 블록, `summaryStrip`). `RouteBriefing.css` 변경 불필요.)

- [ ] **Step 1: import 추가**

`RouteBriefingPanel.jsx` 상단 import 블록에 추가(기존 `import LayerToggleChips from '../map/LayerToggleChips.jsx'` 아래):

```js
import RouteImportChooser from './RouteImportChooser.jsx'
```

- [ ] **Step 2: state 구조분해 확장**

`const { routeForm, routeResult, ... } = state` 블록(약 198-224줄)에 추가. **주의**: `vfrWaypoints`는 이미 이 구조분해에 있음(198-224줄에 `vfrWaypoints,` 존재) — 다시 넣으면 `Identifier 'vfrWaypoints' has already been declared` SyntaxError. 아래 3개만 추가:

```js
    importCandidates,
    importWarning,
    importError,
```

`const { updateRouteField, ... } = actions` 블록(약 227-257줄)에 추가:

```js
    loadSavedRoute,
    importRouteFromFile,
    applyImportedPath,
    cancelImportChoice,
```

(이미 `loadSavedRoute`는 있으므로 나머지 3개만 실제로 추가.)

- [ ] **Step 3: 파일 입력 + 버튼 + ref 추가**

`routeMenu` 정의(약 306-326줄) 바로 아래에 추가:

```js
  const importFileInputRef = useRef(null)
  function handleImportFileChange(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // 같은 파일 재선택 가능하도록
    if (file) importRouteFromFile(file)
  }
  const importButton = (
    <>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".geojson,.json,.gpx,.kml"
        style={{ display: 'none' }}
        onChange={handleImportFileChange}
      />
      <Button appearance="outline" size="small" onClick={() => importFileInputRef.current?.click()}>
        {'경로 불러오기'}
      </Button>
    </>
  )
  const importFeedback = (
    <>
      {importCandidates.length > 0 && (
        <RouteImportChooser candidates={importCandidates} onSelect={applyImportedPath} onCancel={cancelImportChoice} />
      )}
      {importWarning && <MessageBar intent="warning"><MessageBarBody>{importWarning}</MessageBarBody></MessageBar>}
      {importError && <MessageBar intent="error"><MessageBarBody>{importError}</MessageBarBody></MessageBar>}
    </>
  )
```

- [ ] **Step 4: 데스크톱 헤더에 버튼 배치**

`② 경로` 섹션 헤더(`<h3 className={s.sectionTitle}>{'② 경로'}</h3>` 바로 아래, 초기화 버튼이 있는 `s.sectionHead` 블록, 약 686-690줄)를 다음으로 교체:

```jsx
        <div className={s.section}>
          <div className={s.sectionHead}>
            <h3 className={s.sectionTitle}>{'② 경로'}</h3>
            <div style={{ display: 'flex', gap: 'var(--space-xs, 6px)' }}>
              {importButton}
              <Button appearance="secondary" size="small" type="button" icon={<RotateCcw size={14} />} onClick={armOrReset} disabled={routeLoading}>{resetArmed ? '초기화 확인' : '초기화'}</Button>
            </div>
          </div>
```

이 블록 바로 다음(기존 `<div className={s.routeRow}>` 앞)에 `{importFeedback}`을 넣지 않고, 대신 `errorBlock` 렌더 위치(기존 `{errorBlock}`, 약 728줄) 바로 위에 `{importFeedback}`을 추가:

```jsx
        {importFeedback}
        {errorBlock}
```

- [ ] **Step 5: 모바일 진입점 배치**

모바일 스텝1 블록에서 `route-type-segmented`(IFR/VFR 토글) 바로 아래(약 763-766줄) 다음에 추가:

```jsx
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-xs, 6px)' }}>
            {importButton}
          </div>
```

`{errorBlock}` 렌더 위치(모바일, 약 810줄) 바로 위에 추가:

```jsx
          {importFeedback}
```

- [ ] **Step 6: 브라우저 검증 (Playwright)**

프로젝트 §8 규칙에 따라 dev 서버를 띄우고([docs/dev-server-and-capture.md](../../dev-server-and-capture.md) 절차) 다음을 확인:

1. VFR 탭에서 "경로 불러오기" 버튼 클릭 → 파일 선택창이 뜸.
2. 샘플 GeoJSON 파일(`frontend/test/fixtures/route-import/rkss-rkpk.geojson` — Task 9에서 생성) 선택 → 경유점 3개(RKSS·WP1·RKPK)가 목록에 표시되고 지도가 경로에 맞춰 확대됨.
3. `④ 경로 결과`에 총거리가 0이 아닌 값으로 표시됨.
4. "브리핑 생성" 클릭 → 에러 없이 브리핑이 생성됨(배너에 RKSS·RKPK 카테고리가 보임).
5. GPX 파일(`rkss-rkpk.gpx`) 선택 → 동일하게 동작.
6. rte+trk 둘 다 있는 GPX 파일 선택 → `RouteImportChooser`가 뜨고, 하나를 고르면 그 경로만 반영됨.

Expected: 위 6개 항목 모두 에러 없이 통과. 스크린샷으로 경유점 목록 + 브리핑 배너 확인.

- [ ] **Step 7: 커밋**

```bash
cd "."
git add frontend/src/features/route-briefing/RouteBriefingPanel.jsx
git commit -m "feat(briefing): 경로 불러오기 버튼 — 데스크톱·모바일 배선 + 브라우저 검증"
```

---

## Task 9: 샘플 픽스처 승격 + 회귀 스윕

**Files:**
- Create: `frontend/test/fixtures/route-import/rkss-rkpk.geojson`
- Create: `frontend/test/fixtures/route-import/rkss-rkpk.gpx`
- Create: `frontend/test/fixtures/route-import/rkss-rkpk.kml`

(스펙 §7 열린 항목 — 스크래치패드 샘플을 리포에 픽스처로 승격해, 이후 세션에서도 Task 8 Step 6 브라우저 검증을 재현 가능하게 한다. 단위테스트는 이미 Task 1-4에서 인라인 문자열로 자기완결적이라 이 픽스처는 **수동/Playwright 검증 전용**이다.)

- [ ] **Step 1: 픽스처 파일 생성**

`frontend/test/fixtures/route-import/rkss-rkpk.geojson`:

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "RKSS-RKPK VFR sample" },
      "geometry": {
        "type": "LineString",
        "coordinates": [
          [126.7906, 37.5583],
          [127.4000, 37.0000],
          [127.9000, 36.3000],
          [128.4000, 35.7000],
          [128.9382, 35.1795]
        ]
      }
    }
  ]
}
```

`frontend/test/fixtures/route-import/rkss-rkpk.gpx`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="ProjectAMO sample" xmlns="http://www.topografix.com/GPX/1/1">
  <rte>
    <name>RKSS-RKPK VFR sample</name>
    <rtept lat="37.5583" lon="126.7906"><name>RKSS</name></rtept>
    <rtept lat="37.0000" lon="127.4000"><name>WP1</name></rtept>
    <rtept lat="36.3000" lon="127.9000"><name>WP2</name></rtept>
    <rtept lat="35.7000" lon="128.4000"><name>WP3</name></rtept>
    <rtept lat="35.1795" lon="128.9382"><name>RKPK</name></rtept>
  </rte>
</gpx>
```

`frontend/test/fixtures/route-import/rkss-rkpk.kml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>RKSS-RKPK VFR sample</name>
    <Placemark>
      <name>RKSS-RKPK</name>
      <LineString>
        <coordinates>
          126.7906,37.5583,0
          127.4000,37.0000,0
          127.9000,36.3000,0
          128.4000,35.7000,0
          128.9382,35.1795,0
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>
```

- [ ] **Step 2: 전체 회귀 실행**

Run:
```bash
cd "frontend"
node --test src/features/route-briefing/lib/routeImport.test.js
node --test src/features/route-briefing/lib/routeBriefingModel.test.js
node --test src/features/route-briefing/lib/routePreview.test.js
node --test src/features/route-briefing/lib/altitude.test.js
npx vite build --logLevel warn
```
Expected: 모든 `node --test` PASS, `vite build` exit code 0.

- [ ] **Step 3: 커밋**

```bash
cd "."
git add frontend/test/fixtures/route-import/
git commit -m "test(briefing): 경로 임포트 수동 검증용 샘플 픽스처(RKSS-RKPK) 추가"
```

---

## Self-Review Notes (작성자 기록)

- **스펙 §1 결정 5개** 전부 태스크에 반영: 용도(파일 형식 불문 처리, Task 1-3) / 공항 스냅+폴백(Task 4-5) / RDP N=20(Task 4) / 다중 경로 사용자 선택(Task 7) / `loadSavedRoute` 패턴 필수(Task 6) — 확인됨.
- **스펙 §4 에러/엣지** 커버리지: 파싱실패(Task1 Step2), 점<2(Task5 Step1 세번째 테스트), FIR밖 경고(Task6 Step2), 경로다수(Task7), 파일고도무시(설계상 애초에 안 읽음 — coords만 추출), 끝점 동일공항 왕복(자연히 허용됨, 별도 분기 없음). **과대 파일/점 상한**은 이 계획에 태스크 없음 — Out of scope 취급하지 않고 스펙에 있었으므로 후속 태스크로 명시(아래 "미포함" 참고).
- **스펙 §7 열린 항목**: `buildVfrRouteFromWaypoints` 위치는 `routeBriefingModel.js`로 확정(Task 5) — VFR 관련 다른 헬퍼(`buildInitialVfrWaypoints`, `getVfrAirportAltitudeFt`)가 이미 이 파일에 있어 일관성 유지. GPX rte/trk 판별은 DOM 직접 파싱으로 확정(Task 2) — togeojson 출력만으로는 구분 불가능함을 코드 조사로 확인했기 때문. 공항 폴백 시 `buildDestination(null,…)` 안전성은 `composeBriefing`이 애초에 destination을 `tafByIcao[request.arrivalAirport]`(빈 문자열 키 → `undefined` → `?? null`)로 안전 처리함을 확인 — 별도 방어 코드 불필요.
- **미포함(향후 태스크로 분리 권장, 이번 계획 범위 아님)**: 과대 파일/점 개수 상한 가드(스펙 §4 마지막 항목). 이유: RDP 솎기가 이미 목록 폭발은 막고, DOM 파싱 자체가 매우 큰 파일에서 느릴 수 있다는 리스크는 있으나 실사용 임계치를 정하려면 실측이 필요해 이번 최소 구현 이후 별도로 다루는 게 YAGNI에 맞음.
- **타입 일관성 확인**: `candidate.coords`(routeImport.js) → `simplifyRoute` 입력/출력 → `buildVfrRouteFromWaypoints(coords, …)` 전부 `[lon, lat]` 순서로 통일. `vfrWaypoints` shape(`id, uid, lon, lat, fixed, airportElevationFt?, altitudeFt`)이 Task 5와 기존 `buildInitialVfrWaypoints`(routeBriefingModel.js:165-192) 사이에 필드명 일치 확인됨.
