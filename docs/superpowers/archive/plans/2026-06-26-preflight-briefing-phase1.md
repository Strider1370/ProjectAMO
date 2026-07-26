# 비행 전 브리핑 Phase 1 (백엔드 골격 + 동작하는 기본 브리핑) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 경로 입력에 교체공항·출발시각을 더하고, 출발/도착/교체 공항 날씨와 경로에 걸린 위험기상을 색상 강조 표로 보여주는 **동작하는 기본 브리핑**을 만든다.

**Architecture:** 백엔드가 신규 `POST /api/route-briefing`에서 이미 수집 중인 METAR/TAF/SIGMET/AIRMET 캐시(`store.getCached`)를 읽어 **AIM 순서로 정렬된 브리핑 payload 하나**를 합성한다(위험 해석·비행범주 판정은 백엔드 소유). 프런트는 그 payload를 표·요약보드로 렌더만 한다. Phase 1은 **수평+시간 매칭**까지만(고도 매칭은 Phase 2).

**Tech Stack:** Node.js(ESM) + Express 백엔드, `node --test` 러너. React 19 + Vite 프런트.

**스펙:** `docs/superpowers/specs/2026-06-26-preflight-weather-briefing-design.md`

**Phase 1 범위:** ① 위험요약(SIGMET/AIRMET 수평∩시간) · ③ 현재실황(METAR→비행범주) · ⑤ 목적지예보(TAF ETA구간 + IFR 1-2-3) · 한눈 요약보드 · 경로폼에 교체공항+ETD+ETA · 전용 브리핑 뷰(표+임계값색).
**Phase 1 비범위(후속):** 3D 고도 매칭, ④ 노선 단면도, 종관, 공항경보(warning)·이륙예보·제주급변풍, VFR 일출몰, 미니맵 스크롤연동, PDF.

---

## 데이터 계약 (먼저 확정)

`POST /api/route-briefing`
```jsonc
// 요청
{
  "flightRule": "IFR",
  "departureAirport": "RKSI",
  "arrivalAirport": "RKPC",
  "alternateAirport": "RKPK",       // 없으면 null
  "routeGeometry": { "type": "LineString", "coordinates": [[126.45,37.46],[126.30,33.51]] },
  "etd": "2026-06-26T09:00:00Z",
  "eta": "2026-06-26T10:30:00Z",
  "plannedCruiseAltitudeFt": 9000
}
// 응답
{
  "meta": { "departureAirport":"RKSI","arrivalAirport":"RKPC","alternateAirport":"RKPK","flightRule":"IFR","etd":"...","eta":"...","generatedAt":"..." },
  "summary": [ {"key":"hazard","label":"위험","level":"red"}, {"key":"RKSI","label":"출발 RKSI","level":"green"}, ... ],
  "sections": {
    "adverse": { "level":"red", "hazards":[ {"source":"SIGMET","code":"SEV_ICE","label":"Severe Icing","validFrom":"...","validTo":"...","onRoute":true} ] },
    "current": { "airports":[ {"role":"departure","icao":"RKSI","category":"VFR","level":"green",
        "fields":{"wind":{"text":"27008KT","flag":false},"visibility":{"text":"9999","flag":false},
        "ceiling":{"text":"FEW030","flag":false},"temp":{"text":"18/09","flag":false},"qnh":{"text":"Q1018","flag":false},"weather":{"text":"-","flag":false}},
        "raw":"..." } ] },
    "destination": { "level":"red","taf":{"time":"...","wind":"...","visibility":"3000","ceiling":"BKN008","category":"IFR"},
        "alternateRequired":true,"alternateReason":"ETA±1h 운고<2000ft 또는 시정<5000m(≈3SM)" }
  },
  "warnings": []
}
```
`level`: `"green"|"amber"|"red"`. 비행범주→레벨: VFR=green, MVFR=amber, IFR·LIFR=red.

---

## 파일 구조

**백엔드 (신규)**
- `backend/src/briefing/flight-category.js` — 시정(m)+운고(ft)→VFR/MVFR/IFR/LIFR, 범주→level. 순수.
- `backend/src/briefing/geo-time-match.js` — point-in-polygon, 경로샘플∩폴리곤, 시간창 겹침. 순수.
- `backend/src/briefing/airport-summary.js` — METAR→{category, level, fields, raw}. 순수.
- `backend/src/briefing/taf-window.js` — TAF timeline에서 ETA 구간 선택 + IFR 1-2-3 판정. 순수.
- `backend/src/briefing/hazard-section.js` — SIGMET/AIRMET items ∩ (경로,시간)→hazards. 순수.
- `backend/src/briefing/briefing-composer.js` — 위를 조립해 payload 생성. 순수(데이터 주입식).
**백엔드 (수정)**
- `backend/server.js` — `POST /api/route-briefing` 라우트 추가.
**테스트 (신규)**
- `backend/test/flight-category.test.js`, `geo-time-match.test.js`, `airport-summary.test.js`, `taf-window.test.js`, `hazard-section.test.js`, `briefing-composer.test.js`
**프런트 (신규/수정)**
- `frontend/src/features/route-briefing/lib/etaCalc.js` (+`.test.js`) — ETD+거리+속도→ETA.
- `frontend/src/api/briefingApi.js` — `fetchRouteBriefing` 추가.
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — 교체공항·ETD·순항속도 입력 + "브리핑 생성" 버튼.
- `frontend/src/features/route-briefing/useRouteBriefing.js` — 입력 상태 + 브리핑 fetch.
- `frontend/src/features/route-briefing/BriefingView.jsx` (+`BriefingView.css`) — 요약보드 + 섹션 표.

---

## Task 1: 비행범주 판정 (flight-category)

**Files:**
- Create: `backend/src/briefing/flight-category.js`
- Test: `backend/test/flight-category.test.js`

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/flight-category.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryFor, levelForCategory } from '../src/briefing/flight-category.js'

test('categoryFor: VFR when vis and ceiling high', () => {
  assert.equal(categoryFor({ visibilityM: 9999, ceilingFt: 3000 }), 'VFR')
})
test('categoryFor: MVFR when ceiling 1000-3000', () => {
  assert.equal(categoryFor({ visibilityM: 9999, ceilingFt: 1500 }), 'MVFR')
})
test('categoryFor: IFR when vis 1600-5000', () => {
  assert.equal(categoryFor({ visibilityM: 3000, ceilingFt: 5000 }), 'IFR')
})
test('categoryFor: LIFR when ceiling below 500', () => {
  assert.equal(categoryFor({ visibilityM: 9999, ceilingFt: 200 }), 'LIFR')
})
test('categoryFor: takes the worse of vis and ceiling', () => {
  assert.equal(categoryFor({ visibilityM: 800, ceilingFt: 5000 }), 'LIFR')
})
test('categoryFor: null ceiling treated as unlimited', () => {
  assert.equal(categoryFor({ visibilityM: 9999, ceilingFt: null }), 'VFR')
})
test('levelForCategory maps to colors', () => {
  assert.equal(levelForCategory('VFR'), 'green')
  assert.equal(levelForCategory('MVFR'), 'amber')
  assert.equal(levelForCategory('IFR'), 'red')
  assert.equal(levelForCategory('LIFR'), 'red')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="categoryFor|levelForCategory"`
Expected: FAIL (module not found)

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/flight-category.js
// 표준 항공 비행범주. 시정 단위 m, 운고 단위 ft(최저 BKN/OVC).
export function categoryFor({ visibilityM, ceilingFt }) {
  const vis = Number.isFinite(visibilityM) ? visibilityM : Infinity
  const ceil = Number.isFinite(ceilingFt) ? ceilingFt : Infinity

  const byVis = vis < 1600 ? 'LIFR' : vis < 5000 ? 'IFR' : vis <= 8000 ? 'MVFR' : 'VFR'
  const byCeil = ceil < 500 ? 'LIFR' : ceil < 1000 ? 'IFR' : ceil <= 3000 ? 'MVFR' : 'VFR'

  const order = { LIFR: 0, IFR: 1, MVFR: 2, VFR: 3 }
  return order[byVis] <= order[byCeil] ? byVis : byCeil
}

export function levelForCategory(category) {
  if (category === 'VFR') return 'green'
  if (category === 'MVFR') return 'amber'
  return 'red' // IFR, LIFR
}

export default { categoryFor, levelForCategory }
```

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="categoryFor|levelForCategory"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/flight-category.js backend/test/flight-category.test.js
git commit -m "feat(briefing): add flight category classifier"
```

---

## Task 2: 경로·시간 매칭 (geo-time-match)

**Files:**
- Create: `backend/src/briefing/geo-time-match.js`
- Test: `backend/test/geo-time-match.test.js`

advisory `geometry`는 GeoJSON Polygon/MultiPolygon(`coordinates:[[[lon,lat]...]]`), `bbox:{min_lon,min_lat,max_lon,max_lat}`, `valid_from`/`valid_to`는 ISO 문자열(`iwxxm-advisory-parser.js` 참고).

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/geo-time-match.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pointInPolygon, routeIntersectsGeometry, timeWindowsOverlap } from '../src/briefing/geo-time-match.js'

const square = { type: 'Polygon', coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]] }

test('pointInPolygon: inside', () => {
  assert.equal(pointInPolygon([5,5], square.coordinates[0]), true)
})
test('pointInPolygon: outside', () => {
  assert.equal(pointInPolygon([20,20], square.coordinates[0]), false)
})
test('routeIntersectsGeometry: a route sample falls inside', () => {
  const route = { type:'LineString', coordinates: [[-5,-5],[5,5],[20,20]] }
  assert.equal(routeIntersectsGeometry(route, square), true)
})
test('routeIntersectsGeometry: route entirely outside', () => {
  const route = { type:'LineString', coordinates: [[20,20],[30,30]] }
  assert.equal(routeIntersectsGeometry(route, square), false)
})
test('routeIntersectsGeometry: MultiPolygon supported', () => {
  const multi = { type:'MultiPolygon', coordinates: [ square.coordinates ] }
  const route = { type:'LineString', coordinates: [[5,5],[5,6]] }
  assert.equal(routeIntersectsGeometry(route, multi), true)
})
test('timeWindowsOverlap: overlapping', () => {
  assert.equal(timeWindowsOverlap(
    '2026-06-26T09:00:00Z','2026-06-26T10:30:00Z',
    '2026-06-26T10:00:00Z','2026-06-26T14:00:00Z'), true)
})
test('timeWindowsOverlap: disjoint', () => {
  assert.equal(timeWindowsOverlap(
    '2026-06-26T09:00:00Z','2026-06-26T10:00:00Z',
    '2026-06-26T11:00:00Z','2026-06-26T14:00:00Z'), false)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="pointInPolygon|routeIntersectsGeometry|timeWindowsOverlap"`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/geo-time-match.js
// Phase 1: 수평(평면) + 시간만. 고도(FL밴드)는 Phase 2.

// ray casting. ring = [[lon,lat], ...] (닫힌 ring 가정)
export function pointInPolygon([x, y], ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function polygonsOf(geometry) {
  if (!geometry) return []
  if (geometry.type === 'Polygon') return [geometry.coordinates]
  if (geometry.type === 'MultiPolygon') return geometry.coordinates
  return []
}

// 경로 LineString의 어떤 정점이라도 어떤 외곽 ring 안에 들면 교차로 간주(Phase 1 근사).
export function routeIntersectsGeometry(routeGeometry, geometry) {
  const coords = routeGeometry?.coordinates ?? []
  const polygons = polygonsOf(geometry)
  for (const point of coords) {
    for (const polygon of polygons) {
      const outerRing = polygon[0]
      if (outerRing && pointInPolygon(point, outerRing)) return true
    }
  }
  return false
}

export function timeWindowsOverlap(aStart, aEnd, bStart, bEnd) {
  const a0 = Date.parse(aStart), a1 = Date.parse(aEnd)
  const b0 = Date.parse(bStart), b1 = Date.parse(bEnd)
  if (![a0, a1, b0, b1].every(Number.isFinite)) return false
  return a0 <= b1 && b0 <= a1
}

export default { pointInPolygon, routeIntersectsGeometry, timeWindowsOverlap }
```

> 참고: Phase 1은 정점 기준 근사다. 정점이 폴리곤을 "관통만" 하고 안에 안 들어가는 경우는 Phase 2에서 `route-axis` 리샘플 + 선분∩폴리곤으로 보강한다.

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="pointInPolygon|routeIntersectsGeometry|timeWindowsOverlap"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/geo-time-match.js backend/test/geo-time-match.test.js
git commit -m "feat(briefing): add horizontal + time route matching"
```

---

## Task 3: 공항 현재실황 요약 (airport-summary)

**Files:**
- Create: `backend/src/briefing/airport-summary.js`
- Test: `backend/test/airport-summary.test.js`

입력은 `store.getCached('metar').airports[icao]` 1건. 모양: `{ header:{icao,...}, observation:{ wind:{raw,speed,gust,...}, visibility:{value,cavok}, clouds:[{amount,base,raw}], weather:[{raw}], temperature:{air,dewpoint}, qnh:{value}, display:{...} }, cavok_flag }`.

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/airport-summary.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ceilingFromClouds, summarizeAirport } from '../src/briefing/airport-summary.js'

test('ceilingFromClouds: lowest BKN/OVC base', () => {
  assert.equal(ceilingFromClouds([{amount:'FEW',base:1000},{amount:'BKN',base:800},{amount:'OVC',base:1500}]), 800)
})
test('ceilingFromClouds: no BKN/OVC -> null', () => {
  assert.equal(ceilingFromClouds([{amount:'FEW',base:1000},{amount:'SCT',base:2000}]), null)
})

const metarRkpc = {
  header: { icao: 'RKPC' },
  observation: {
    wind: { raw: '14025G35KT', speed: 25, gust: 35 },
    visibility: { value: 3000, cavok: false },
    clouds: [{ amount: 'BKN', base: 800, raw: 'BKN008' }],
    weather: [{ raw: '-RA' }],
    temperature: { air: 14, dewpoint: 12 },
    qnh: { value: 1009 },
    display: { wind: '14025G35KT', clouds: 'BKN008', temperature: '14/12', qnh: 'Q1009' },
  },
  cavok_flag: false,
}

test('summarizeAirport: RKPC arrival is IFR/red with flagged fields', () => {
  const s = summarizeAirport('arrival', metarRkpc)
  assert.equal(s.icao, 'RKPC')
  assert.equal(s.category, 'IFR')
  assert.equal(s.level, 'red')
  assert.equal(s.fields.visibility.flag, true)   // vis 3000 < MVFR 5000
  assert.equal(s.fields.ceiling.flag, true)      // ceiling 800 < MVFR 1000
  assert.equal(s.fields.wind.flag, true)         // gust 35 >= 30
  assert.equal(s.fields.qnh.flag, false)
})

test('summarizeAirport: missing METAR -> unknown', () => {
  const s = summarizeAirport('alternate', null)
  assert.equal(s.category, 'UNKNOWN')
  assert.equal(s.level, 'gray')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="ceilingFromClouds|summarizeAirport"`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/airport-summary.js
import { categoryFor, levelForCategory } from './flight-category.js'

export function ceilingFromClouds(clouds) {
  const bases = (clouds ?? [])
    .filter((c) => c && (c.amount === 'BKN' || c.amount === 'OVC') && Number.isFinite(c.base))
    .map((c) => c.base)
  return bases.length ? Math.min(...bases) : null
}

function field(text, flag) { return { text: text ?? '-', flag: Boolean(flag) } }

export function summarizeAirport(role, metar) {
  if (!metar?.observation) {
    return { role, icao: metar?.header?.icao ?? null, category: 'UNKNOWN', level: 'gray', fields: {}, raw: null }
  }
  const obs = metar.observation
  const visibilityM = obs.visibility?.cavok ? 9999 : obs.visibility?.value
  const ceilingFt = ceilingFromClouds(obs.clouds)
  const category = categoryFor({ visibilityM, ceilingFt })
  const gust = obs.wind?.gust

  const fields = {
    wind: field(obs.display?.wind, Number.isFinite(gust) && gust >= 30),
    visibility: field(String(visibilityM ?? '-'), Number.isFinite(visibilityM) && visibilityM < 5000),
    ceiling: field(obs.display?.clouds, Number.isFinite(ceilingFt) && ceilingFt < 1000),
    temp: field(obs.display?.temperature, false),
    weather: field(obs.display?.weather || '-', (obs.weather ?? []).length > 0),
    qnh: field(obs.display?.qnh, false),
  }

  return {
    role,
    icao: metar.header?.icao ?? null,
    category,
    level: levelForCategory(category),
    fields,
    raw: null, // 원문 METAR 문자열 노출은 Phase 4에서 추가
  }
}

export default { ceilingFromClouds, summarizeAirport }
```

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="ceilingFromClouds|summarizeAirport"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/airport-summary.js backend/test/airport-summary.test.js
git commit -m "feat(briefing): summarize airport METAR into category + flagged fields"
```

---

## Task 4: 목적지 TAF 구간 + 1-2-3 (taf-window)

**Files:**
- Create: `backend/src/briefing/taf-window.js`
- Test: `backend/test/taf-window.test.js`

입력은 `store.getCached('taf').airports[icao]`. 모양: `{ header:{...}, timeline:[ {time, wind:{raw}, visibility:{value,cavok}, clouds:[{amount,base,raw}], display:{...} } ] }`. 1-2-3 규칙(근사): 도착 ETA(±1h) 구간에서 운고<2000ft 또는 시정<5000m이면 교체공항 필요.

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/taf-window.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectTafAtEta, alternateRequired } from '../src/briefing/taf-window.js'

const taf = {
  header: { icao: 'RKPC' },
  timeline: [
    { time: '2026-06-26T09:00:00Z', visibility:{value:9999,cavok:false}, clouds:[{amount:'SCT',base:3000,raw:'SCT030'}], display:{wind:'18010KT',clouds:'SCT030'} },
    { time: '2026-06-26T10:00:00Z', visibility:{value:3000,cavok:false}, clouds:[{amount:'BKN',base:600,raw:'BKN006'}], display:{wind:'14020KT',clouds:'BKN006'} },
    { time: '2026-06-26T11:00:00Z', visibility:{value:9999,cavok:false}, clouds:[{amount:'SCT',base:2000,raw:'SCT020'}], display:{wind:'18010KT',clouds:'SCT020'} },
  ],
}

test('selectTafAtEta picks the timeline entry nearest ETA', () => {
  const e = selectTafAtEta(taf, '2026-06-26T10:05:00Z')
  assert.equal(e.time, '2026-06-26T10:00:00Z')
  assert.equal(e.category, 'IFR')
})

test('alternateRequired true when ETA window breaches 2000ft/5000m', () => {
  const r = alternateRequired(taf, '2026-06-26T10:05:00Z')
  assert.equal(r.required, true)
})

test('alternateRequired false when ETA window is good', () => {
  const r = alternateRequired(taf, '2026-06-26T09:00:00Z')
  assert.equal(r.required, false)
})

test('selectTafAtEta returns null when no TAF', () => {
  assert.equal(selectTafAtEta(null, '2026-06-26T10:00:00Z'), null)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="selectTafAtEta|alternateRequired"`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/taf-window.js
import { categoryFor } from './flight-category.js'
import { ceilingFromClouds } from './airport-summary.js'

function entryMetrics(entry) {
  const visibilityM = entry.visibility?.cavok ? 9999 : entry.visibility?.value
  const ceilingFt = ceilingFromClouds(entry.clouds)
  return { visibilityM, ceilingFt }
}

export function selectTafAtEta(taf, etaIso) {
  const timeline = taf?.timeline ?? []
  if (timeline.length === 0) return null
  const eta = Date.parse(etaIso)
  if (!Number.isFinite(eta)) return null

  let best = null
  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t)) continue
    const delta = Math.abs(t - eta)
    if (!best || delta < best.delta) {
      const { visibilityM, ceilingFt } = entryMetrics(entry)
      best = { delta, entry: { time: entry.time, ...entry.display, category: categoryFor({ visibilityM, ceilingFt }) } }
    }
  }
  return best?.entry ?? null
}

// 1-2-3 근사: ETA ±1h 구간에서 운고<2000ft 또는 시정<5000m이면 교체공항 필요.
export function alternateRequired(taf, etaIso) {
  const timeline = taf?.timeline ?? []
  const eta = Date.parse(etaIso)
  if (timeline.length === 0 || !Number.isFinite(eta)) return { required: null, reason: 'TAF 없음' }
  const windowMs = 60 * 60 * 1000

  for (const entry of timeline) {
    const t = Date.parse(entry.time)
    if (!Number.isFinite(t) || Math.abs(t - eta) > windowMs) continue
    const { visibilityM, ceilingFt } = entryMetrics(entry)
    const lowCeiling = Number.isFinite(ceilingFt) && ceilingFt < 2000
    const lowVis = Number.isFinite(visibilityM) && visibilityM < 5000
    if (lowCeiling || lowVis) {
      return { required: true, reason: 'ETA±1h 운고<2000ft 또는 시정<5000m' }
    }
  }
  return { required: false, reason: 'ETA±1h 최저치 충족' }
}

export default { selectTafAtEta, alternateRequired }
```

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="selectTafAtEta|alternateRequired"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/taf-window.js backend/test/taf-window.test.js
git commit -m "feat(briefing): select destination TAF at ETA and evaluate 1-2-3 alternate rule"
```

---

## Task 5: 위험요약 섹션 (hazard-section)

**Files:**
- Create: `backend/src/briefing/hazard-section.js`
- Test: `backend/test/hazard-section.test.js`

입력은 `store.getCached('sigmet').items` + `store.getCached('airmet').items`. item 모양: `{ id, phenomenon_code, phenomenon_label, valid_from, valid_to, geometry, bbox }`.

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/hazard-section.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHazardSection } from '../src/briefing/hazard-section.js'

const onRoutePoly = { type:'Polygon', coordinates: [[[125,32],[128,32],[128,35],[125,35],[125,32]]] }
const offRoutePoly = { type:'Polygon', coordinates: [[[100,10],[101,10],[101,11],[100,11],[100,10]]] }
const route = { type:'LineString', coordinates: [[126.45,37.46],[126.5,33.5]] } // 33.5,126.5 is inside onRoutePoly

const sigmet = [
  { id:'s1', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly },
  { id:'s2', phenomenon_code:'TC', phenomenon_label:'Tropical Cyclone', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:offRoutePoly },
]

test('buildHazardSection keeps on-route + time-overlapping hazards', () => {
  const sec = buildHazardSection({ sigmet, airmet: [], routeGeometry: route, etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z' })
  const codes = sec.hazards.map((h) => h.code)
  assert.deepEqual(codes, ['SEV_ICE'])
  assert.equal(sec.hazards[0].source, 'SIGMET')
  assert.equal(sec.level, 'red')
})

test('buildHazardSection drops time-disjoint hazards', () => {
  const sec = buildHazardSection({ sigmet, airmet: [], routeGeometry: route, etd:'2026-06-26T15:00:00Z', eta:'2026-06-26T16:00:00Z' })
  assert.equal(sec.hazards.length, 0)
  assert.equal(sec.level, 'green')
})

test('AIRMET classified amber, SIGMET red', () => {
  const airmet = [{ id:'a1', phenomenon_code:'MOD_TURB', phenomenon_label:'Moderate Turbulence', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly }]
  const sec = buildHazardSection({ sigmet: [], airmet, routeGeometry: route, etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z' })
  assert.equal(sec.hazards[0].source, 'AIRMET')
  assert.equal(sec.level, 'amber')
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="buildHazardSection|AIRMET classified"`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/hazard-section.js
import { routeIntersectsGeometry, timeWindowsOverlap } from './geo-time-match.js'

function matchItems(items, source, ctx) {
  return (items ?? [])
    .filter((it) => it?.geometry && it.valid_from && it.valid_to)
    .filter((it) => timeWindowsOverlap(ctx.etd, ctx.eta, it.valid_from, it.valid_to))
    .filter((it) => routeIntersectsGeometry(ctx.routeGeometry, it.geometry))
    .map((it) => ({
      source,
      code: it.phenomenon_code,
      label: it.phenomenon_label || it.phenomenon_code,
      validFrom: it.valid_from,
      validTo: it.valid_to,
      onRoute: true,
    }))
}

export function buildHazardSection({ sigmet, airmet, routeGeometry, etd, eta }) {
  const ctx = { routeGeometry, etd, eta }
  const hazards = [
    ...matchItems(sigmet, 'SIGMET', ctx),
    ...matchItems(airmet, 'AIRMET', ctx),
  ]
  const hasSigmet = hazards.some((h) => h.source === 'SIGMET')
  const level = hasSigmet ? 'red' : hazards.length > 0 ? 'amber' : 'green'
  return { level, hazards }
}

export default { buildHazardSection }
```

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="buildHazardSection|AIRMET classified"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/hazard-section.js backend/test/hazard-section.test.js
git commit -m "feat(briefing): build adverse hazard section from SIGMET/AIRMET on route+time"
```

---

## Task 6: 브리핑 합성 (briefing-composer)

**Files:**
- Create: `backend/src/briefing/briefing-composer.js`
- Test: `backend/test/briefing-composer.test.js`

`composeBriefing(request, data)`는 순수 함수 — `data`로 캐시를 주입받는다(테스트 용이). `data = { metar, taf, sigmet, airmet }` 각각 store에서 읽은 객체(`{airports}` 또는 `{items}`).

- [ ] **Step 1: 실패 테스트 작성**

```js
// backend/test/briefing-composer.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeBriefing } from '../src/briefing/briefing-composer.js'

const request = {
  flightRule: 'IFR',
  departureAirport: 'RKSI', arrivalAirport: 'RKPC', alternateAirport: 'RKPK',
  routeGeometry: { type:'LineString', coordinates: [[126.45,37.46],[126.5,33.5]] },
  etd: '2026-06-26T09:00:00Z', eta: '2026-06-26T10:30:00Z', plannedCruiseAltitudeFt: 9000,
}

const goodObs = (cat) => ({
  observation: cat === 'VFR'
    ? { wind:{raw:'27008KT',speed:8}, visibility:{value:9999}, clouds:[{amount:'FEW',base:3000}], weather:[], temperature:{air:18,dewpoint:9}, qnh:{value:1018}, display:{wind:'27008KT',clouds:'FEW030',temperature:'18/09',qnh:'Q1018',weather:'-'} }
    : { wind:{raw:'14025G35KT',speed:25,gust:35}, visibility:{value:3000}, clouds:[{amount:'BKN',base:800}], weather:[{raw:'-RA'}], temperature:{air:14,dewpoint:12}, qnh:{value:1009}, display:{wind:'14025G35KT',clouds:'BKN008',temperature:'14/12',qnh:'Q1009',weather:'-RA'} },
})
const data = {
  metar: { airports: { RKSI: { header:{icao:'RKSI'}, ...goodObs('VFR') }, RKPC: { header:{icao:'RKPC'}, ...goodObs('IFR') }, RKPK: { header:{icao:'RKPK'}, ...goodObs('VFR') } } },
  taf: { airports: { RKPC: { header:{icao:'RKPC'}, timeline:[{ time:'2026-06-26T10:00:00Z', visibility:{value:3000}, clouds:[{amount:'BKN',base:600,raw:'BKN006'}], display:{wind:'14020KT',clouds:'BKN006'} }] } } },
  sigmet: { items: [{ id:'s1', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:{type:'Polygon',coordinates:[[[125,32],[128,32],[128,35],[125,35],[125,32]]]} }] },
  airmet: { items: [] },
}

test('composeBriefing returns meta, summary, sections', () => {
  const b = composeBriefing(request, data)
  assert.equal(b.meta.departureAirport, 'RKSI')
  assert.equal(b.sections.adverse.hazards.length, 1)
  assert.equal(b.sections.current.airports.length, 3)
  const dep = b.sections.current.airports.find((a) => a.role === 'departure')
  assert.equal(dep.category, 'VFR')
  assert.equal(b.sections.destination.taf.category, 'IFR')
  assert.equal(b.sections.destination.alternateRequired, true)
})

test('summary board has hazard + 3 airports', () => {
  const b = composeBriefing(request, data)
  const keys = b.summary.map((s) => s.key)
  assert.deepEqual(keys, ['hazard', 'RKSI', 'RKPC', 'RKPK'])
  assert.equal(b.summary.find((s) => s.key === 'hazard').level, 'red')
})

test('alternate omitted when null', () => {
  const b = composeBriefing({ ...request, alternateAirport: null }, data)
  assert.equal(b.sections.current.airports.length, 2)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="composeBriefing|summary board|alternate omitted"`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/briefing-composer.js
import { summarizeAirport } from './airport-summary.js'
import { selectTafAtEta, alternateRequired } from './taf-window.js'
import { buildHazardSection } from './hazard-section.js'

function airportRoles(request) {
  const roles = [
    { role: 'departure', icao: request.departureAirport },
    { role: 'arrival', icao: request.arrivalAirport },
  ]
  if (request.alternateAirport) roles.push({ role: 'alternate', icao: request.alternateAirport })
  return roles
}

const ROLE_LABEL = { departure: '출발', arrival: '도착', alternate: '교체' }

export function composeBriefing(request, data) {
  const metarByIcao = data?.metar?.airports ?? {}
  const tafByIcao = data?.taf?.airports ?? {}

  const adverse = buildHazardSection({
    sigmet: data?.sigmet?.items ?? [],
    airmet: data?.airmet?.items ?? [],
    routeGeometry: request.routeGeometry,
    etd: request.etd,
    eta: request.eta,
  })

  const airports = airportRoles(request).map(({ role, icao }) =>
    summarizeAirport(role, metarByIcao[icao] ?? { header: { icao } }))

  const arrivalTaf = tafByIcao[request.arrivalAirport] ?? null
  const tafAtEta = selectTafAtEta(arrivalTaf, request.eta)
  const alt = request.flightRule === 'IFR'
    ? alternateRequired(arrivalTaf, request.eta)
    : { required: null, reason: 'VFR' }
  const destination = {
    level: tafAtEta ? (tafAtEta.category === 'VFR' ? 'green' : tafAtEta.category === 'MVFR' ? 'amber' : 'red') : 'gray',
    taf: tafAtEta,
    alternateRequired: alt.required,
    alternateReason: alt.reason,
  }

  const summary = [
    { key: 'hazard', label: '위험', level: adverse.level },
    ...airports.map((a) => ({ key: a.icao, label: `${ROLE_LABEL[a.role]} ${a.icao}`, level: a.level })),
  ]

  return {
    meta: {
      departureAirport: request.departureAirport,
      arrivalAirport: request.arrivalAirport,
      alternateAirport: request.alternateAirport ?? null,
      flightRule: request.flightRule,
      etd: request.etd,
      eta: request.eta,
      generatedAt: new Date().toISOString(),
    },
    summary,
    sections: { adverse, current: { airports }, destination },
    warnings: [],
  }
}

export default { composeBriefing }
```

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix backend test -- --test-name-pattern="composeBriefing|summary board|alternate omitted"`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/briefing-composer.js backend/test/briefing-composer.test.js
git commit -m "feat(briefing): compose AIM-ordered briefing payload"
```

---

## Task 7: API 라우트 `POST /api/route-briefing`

**Files:**
- Modify: `backend/server.js`

`POST /api/vertical-profile` 라우트가 이미 있는 패턴을 따른다(`backend/server.js`에서 `buildVerticalProfile` 호출부 검색). 캐시는 `store.getCached(type)`로 읽는다.

- [ ] **Step 1: import 추가**

`backend/server.js` 상단 import 블록(`buildVerticalProfile` import 근처)에 추가:

```js
import { composeBriefing } from './src/briefing/briefing-composer.js'
```

- [ ] **Step 2: 라우트 추가**

`backend/server.js`에서 `app.post('/api/vertical-profile', ...)` 핸들러 **바로 아래**에 추가:

```js
app.post('/api/route-briefing', (req, res) => {
  const body = req.body || {}
  if (!body.departureAirport || !body.arrivalAirport || !body.routeGeometry?.coordinates?.length) {
    return res.status(400).json({ error: 'departureAirport, arrivalAirport, routeGeometry are required' })
  }
  if (!body.etd || !body.eta) {
    return res.status(400).json({ error: 'etd and eta are required' })
  }
  try {
    const data = {
      metar: store.getCached('metar'),
      taf: store.getCached('taf'),
      sigmet: store.getCached('sigmet'),
      airmet: store.getCached('airmet'),
    }
    const briefing = composeBriefing(body, data)
    res.set('Cache-Control', 'no-store')
    res.json(briefing)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})
```

- [ ] **Step 3: 서버 기동 + 수동 호출 검증**

Run (dev 서버 실행 중 가정, 아니면 `npm run dev:serve`):
```bash
curl -s -X POST http://127.0.0.1:3001/api/route-briefing \
  -H 'Content-Type: application/json' \
  -d '{"flightRule":"IFR","departureAirport":"RKSI","arrivalAirport":"RKPC","alternateAirport":"RKPK","routeGeometry":{"type":"LineString","coordinates":[[126.45,37.46],[126.5,33.5]]},"etd":"2026-06-26T09:00:00Z","eta":"2026-06-26T10:30:00Z","plannedCruiseAltitudeFt":9000}' | head -c 600
```
Expected: `meta`/`summary`/`sections` 키가 있는 JSON. 400/500이면 에러 메시지 확인.

- [ ] **Step 4: 커밋**

```bash
git add backend/server.js
git commit -m "feat(briefing): expose POST /api/route-briefing"
```

---

## Task 8: ETA 계산 헬퍼 (프런트, 순수)

**Files:**
- Create: `frontend/src/features/route-briefing/lib/etaCalc.js`
- Test: `frontend/src/features/route-briefing/lib/etaCalc.test.js`

- [ ] **Step 1: 실패 테스트 작성**

```js
// frontend/src/features/route-briefing/lib/etaCalc.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeEtaIso } from './etaCalc.js'

test('computeEtaIso adds distance/speed hours to ETD', () => {
  // 180nm / 120kt = 1.5h
  assert.equal(
    computeEtaIso('2026-06-26T09:00:00Z', 180, 120),
    '2026-06-26T10:30:00Z',
  )
})
test('computeEtaIso returns null on bad input', () => {
  assert.equal(computeEtaIso('2026-06-26T09:00:00Z', 0, 0), null)
  assert.equal(computeEtaIso('nope', 180, 120), null)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test frontend/src/features/route-briefing/lib/etaCalc.test.js`
Expected: FAIL

- [ ] **Step 3: 구현**

```js
// frontend/src/features/route-briefing/lib/etaCalc.js
export function computeEtaIso(etdIso, distanceNm, speedKt) {
  const etd = Date.parse(etdIso)
  const d = Number(distanceNm)
  const v = Number(speedKt)
  if (!Number.isFinite(etd) || !(d > 0) || !(v > 0)) return null
  const ms = (d / v) * 3600 * 1000
  return new Date(etd + ms).toISOString().replace('.000Z', 'Z')
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test frontend/src/features/route-briefing/lib/etaCalc.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/etaCalc.js frontend/src/features/route-briefing/lib/etaCalc.test.js
git commit -m "feat(briefing): add ETA calculator helper"
```

---

## Task 9: 프런트 API 클라이언트 + 폼 입력 + 브리핑 뷰

**Files:**
- Modify: `frontend/src/api/briefingApi.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify: `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Create: `frontend/src/features/route-briefing/BriefingView.jsx`
- Create: `frontend/src/features/route-briefing/BriefingView.css`
- Modify: `frontend/src/features/map/MapView.jsx` (브리핑 뷰 렌더 슬롯)

- [ ] **Step 1: API 클라이언트 추가**

`frontend/src/api/briefingApi.js` 끝에 추가:

```js
export function fetchRouteBriefing(payload) {
  return postJson('/api/route-briefing', payload)
}
```

- [ ] **Step 2: 훅에 입력 상태 + fetch 추가**

`useRouteBriefing.js`:
1. import 추가: `import { fetchRouteBriefing } from '../../api/briefingApi.js'` 와 `import { computeEtaIso } from './lib/etaCalc.js'`. 그리고 **기존 `./lib/routeBriefingModel.js` import 줄(이미 `getCurrentRouteLineString` 등을 가져옴)에 `buildIfrDistanceBreakdown, calcVfrDistance`를 추가**한다(ETA용 총거리 산출에 사용).

> ⚠️ **순서 의존성(리뷰 B2/B4):** 아래 상태와 `handleGenerateBriefing`는 반드시 **훅 본문 안, `selectedIap`(지역 변수)가 정의된 줄 이후**에 둔다. 그리고 5번에서 **반환 객체의 `state`/`actions`에 등록**해야 패널·MapView가 접근할 수 있다(등록 안 하면 `briefing`이 `undefined`라 뷰가 안 뜸).

2. 상태 추가(다른 `useState` 근처, 단 `selectedIap` 정의 이후):

```js
const [alternateAirport, setAlternateAirport] = useState('')
const [etd, setEtd] = useState(() => new Date().toISOString().slice(0, 16)) // datetime-local
const [cruiseSpeedKt, setCruiseSpeedKt] = useState(120)
const [briefing, setBriefing] = useState(null)
const [briefingLoading, setBriefingLoading] = useState(false)
const [briefingError, setBriefingError] = useState(null)
```

3. 액션 추가:

```js
async function handleGenerateBriefing() {
  const routeGeometry = getCurrentRouteLineString({ routeResult, vfrWaypoints, selectedSid, selectedStar, selectedIap })
  if (!routeGeometry) { setBriefingError('먼저 경로를 검색하세요.'); return }
  // 리뷰 B1/Y4: IFR routeResult.distanceNm은 항로(ENR) 구간만 → SID/STAR/IAP 포함 총거리를 써야 ETA가 맞음.
  const distanceNm = routeForm.flightRule === 'VFR'
    ? calcVfrDistance(vfrWaypoints)
    : (buildIfrDistanceBreakdown({ routeResult, selectedSid, selectedStar, selectedIap })?.totalDistanceNm
        || Number(routeResult?.distanceNm) || 0)
  const etdIso = new Date(etd).toISOString().replace('.000Z', 'Z')
  const etaIso = computeEtaIso(etdIso, distanceNm, cruiseSpeedKt) || etdIso
  setBriefingLoading(true); setBriefingError(null)
  try {
    const result = await fetchRouteBriefing({
      flightRule: routeForm.flightRule,
      departureAirport: routeForm.departureAirport,
      arrivalAirport: routeForm.arrivalAirport,
      alternateAirport: alternateAirport || null,
      routeGeometry,
      etd: etdIso,
      eta: etaIso,
      plannedCruiseAltitudeFt: Number(cruiseAltitudeFt) || DEFAULT_CRUISE_ALTITUDE_FT,
    })
    setBriefing(result)
  } catch (err) { setBriefingError(err.message) }
  finally { setBriefingLoading(false) }
}
```

4. 반환 객체 `state`에 `alternateAirport, etd, cruiseSpeedKt, briefing, briefingLoading, briefingError` 추가, `actions`에 `setAlternateAirport, setEtd, setCruiseSpeedKt, handleGenerateBriefing, setBriefing` 추가.

- [ ] **Step 3: 폼에 입력 + 버튼 추가**

`RouteBriefingPanel.jsx`의 도착 섹션(`route-check-section` "도착") 다음, actions(`route-check-actions`) 앞에 추가한다.

> ⚠️ **교체공항 후보 목록(리뷰 B3):** 아래 예시는 `airports` prop을 쓰지만, 이는 지도 공항 메타 전체다. **출발/도착 드롭다운이 쓰는 것과 동일한 공항 목록 소스를 그대로 재사용**하라(같은 섹션의 출발/도착 `<select>` 옵션 생성 코드를 복사). 출발/도착과 후보가 일치해야 한다.

```jsx
<div className="route-check-section">
  <div className="route-check-section-title">{'브리핑 조건'}</div>
  <div className="route-check-section-grid">
    <label className="route-check-field">
      <span className="route-check-field-label">{'교체공항'}</span>
      <select value={alternateAirport} onChange={(e) => setAlternateAirport(e.target.value)}>
        <option value="">{'없음'}</option>
        {airports.map((a) => <option key={a.icao} value={a.icao}>{a.icao}</option>)}
      </select>
    </label>
    <label className="route-check-field">
      <span className="route-check-field-label">{'출발시각(ETD)'}</span>
      <input type="datetime-local" value={etd} onChange={(e) => setEtd(e.target.value)} />
    </label>
    <label className="route-check-field">
      <span className="route-check-field-label">{'순항속도(kt)'}</span>
      <input type="number" min="1" value={cruiseSpeedKt} onChange={(e) => setCruiseSpeedKt(e.target.value)} />
    </label>
  </div>
  <button type="button" className="route-check-search-button" disabled={!routeResult || briefingLoading} onClick={handleGenerateBriefing}>
    {briefingLoading ? '생성 중...' : '브리핑 생성'}
  </button>
  {briefingError && <div className="route-check-error">{briefingError}</div>}
</div>
```

`RouteBriefingPanel`의 props 구조분해에 `alternateAirport, etd, cruiseSpeedKt, briefingLoading, briefingError`(state)와 `setAlternateAirport, setEtd, setCruiseSpeedKt, handleGenerateBriefing`(actions)을 추가한다.

- [ ] **Step 4: 브리핑 뷰 컴포넌트 작성**

```jsx
// frontend/src/features/route-briefing/BriefingView.jsx
import './BriefingView.css'

const LEVEL_CLASS = { green: 'bv-green', amber: 'bv-amber', red: 'bv-red', gray: 'bv-gray' }

function Cell({ field }) {
  return <td className={field?.flag ? 'bv-flag' : ''}>{field?.text ?? '-'}</td>
}

export default function BriefingView({ briefing, onClose }) {
  if (!briefing) return null
  const { meta, summary, sections } = briefing
  return (
    <div className="briefing-view">
      <div className="bv-header">
        <div><b>{meta.departureAirport} → {meta.arrivalAirport}</b>{meta.alternateAirport ? ` (교체 ${meta.alternateAirport})` : ''} · {meta.flightRule}</div>
        <button type="button" onClick={onClose}>{'지도로'}</button>
      </div>

      <div className="bv-board">
        {summary.map((s) => (
          <span key={s.key} className={`bv-chip ${LEVEL_CLASS[s.level] || ''}`}>{s.label}</span>
        ))}
      </div>

      <section className={`bv-section ${LEVEL_CLASS[sections.adverse.level]}`}>
        <h3>① 위험 요약</h3>
        {sections.adverse.hazards.length === 0
          ? <p className="bv-muted">경로·시간에 걸린 위험기상 없음</p>
          : <ul>{sections.adverse.hazards.map((h, i) => (
              <li key={i}><b>{h.source}</b> {h.label} <span className="bv-muted">({h.validFrom}~{h.validTo})</span></li>
            ))}</ul>}
      </section>

      <section className="bv-section">
        <h3>③ 현재 실황</h3>
        {sections.current.airports.map((a) => (
          <div key={a.role} className="bv-airport">
            <div className="bv-airport-title">
              {a.role === 'departure' ? '출발' : a.role === 'arrival' ? '도착' : '교체'}공항 · {a.icao}
              <span className={`bv-cat ${LEVEL_CLASS[a.level]}`}>{a.category}</span>
            </div>
            <table className="bv-table">
              <thead><tr><th>바람</th><th>시정</th><th>운고</th><th>기온/노점</th><th>현상</th><th>QNH</th></tr></thead>
              <tbody><tr>
                <Cell field={a.fields.wind} /><Cell field={a.fields.visibility} /><Cell field={a.fields.ceiling} />
                <Cell field={a.fields.temp} /><Cell field={a.fields.weather} /><Cell field={a.fields.qnh} />
              </tr></tbody>
            </table>
          </div>
        ))}
      </section>

      <section className={`bv-section ${LEVEL_CLASS[sections.destination.level]}`}>
        <h3>⑤ 목적지 예보</h3>
        {sections.destination.taf
          ? <p>{sections.destination.taf.time} · {sections.destination.taf.clouds} · {sections.destination.taf.category}</p>
          : <p className="bv-muted">TAF 없음</p>}
        {sections.destination.alternateRequired === true &&
          <p className="bv-flag-text">⚠️ 교체공항 필요 — {sections.destination.alternateReason}</p>}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: 스타일 작성**

```css
/* frontend/src/features/route-briefing/BriefingView.css */
.briefing-view { position:absolute; inset:0; z-index:20; overflow-y:auto; padding:16px;
  background:var(--surface, #fff); color:var(--text, #1a1a1a); }
.bv-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;
  border-bottom:2px solid var(--border,#e2e4e8); padding-bottom:8px; }
.bv-board { display:flex; gap:6px; flex-wrap:wrap; margin-bottom:16px; }
.bv-chip { padding:3px 10px; border-radius:12px; font-size:12px; background:#eee; }
.bv-green { background:rgba(46,158,91,.18); }
.bv-amber { background:rgba(224,168,0,.20); }
.bv-red { background:rgba(192,57,43,.18); }
.bv-gray { background:rgba(120,120,120,.15); }
.bv-section { border:1px solid var(--border,#e2e4e8); border-radius:8px; padding:10px 12px; margin-bottom:12px; }
.bv-section h3 { margin:0 0 8px; font-size:14px; }
.bv-airport { margin-bottom:10px; }
.bv-airport-title { font-weight:700; margin-bottom:4px; }
.bv-cat { margin-left:8px; padding:1px 8px; border-radius:10px; font-size:12px; }
.bv-table { width:100%; border-collapse:collapse; font-size:13px; text-align:center; }
.bv-table th { background:var(--surface-2,#f3f4f6); font-weight:500; color:#666; padding:6px; }
.bv-table td { padding:7px; border:1px solid var(--border,#e2e4e8); }
.bv-flag { background:rgba(192,57,43,.18); font-weight:600; }
.bv-flag-text { color:#c0392b; font-weight:600; }
.bv-muted { color:#888; }
```

- [ ] **Step 6: MapView에 렌더 슬롯 추가**

`frontend/src/features/map/MapView.jsx`에서 `RouteBriefingPanel`을 lazy import한 부분 근처에 추가:

```js
const BriefingView = lazy(() => import('../route-briefing/BriefingView.jsx'))
```

`activePanel === 'route-check'` 블록 안, `RouteBriefingPanel` 렌더 근처에 브리핑 뷰를 조건부 렌더(브리핑이 있으면 위에 덮음):

```jsx
{activePanel === 'route-check' && routeBriefing.state.briefing && (
  <Suspense fallback={null}>
    <BriefingView
      briefing={routeBriefing.state.briefing}
      onClose={() => routeBriefing.actions.setBriefing(null)}
    />
  </Suspense>
)}
```

> 주: `routeBriefing`은 `MapView`에서 `useRouteBriefing(...)`를 호출해 `RouteBriefingPanel`에 넘기는 객체와 동일하다. 이미 `state`/`actions`로 전달 중이므로 같은 참조를 쓴다. `Suspense`가 파일에 import되어 있지 않으면 `import { lazy, Suspense } from 'react'`로 보강한다.

- [ ] **Step 7: 빌드 + 브라우저 검증**

Run:
```bash
npm --prefix frontend run build
```
Expected: 빌드 성공.

그다음 dev 서버를 띄우고(preview_start 또는 `npm run dev:serve`) 검증:
1. 사이드바 "비행 전 브리핑" → 경로 검색(RKSI→RKPC) → 교체공항 RKPK, ETD/순항속도 입력 → "브리핑 생성".
2. 요약 보드 칩(위험/출발/도착/교체)이 색상으로 뜨고, ③ 현재실황 표에서 도착(RKPC) 행의 시정·운고 칸이 빨갛게, ⑤ 목적지에 교체공항 필요 경고가 보이는지 확인.
3. "지도로" 버튼으로 닫히는지 확인.

`preview_screenshot`으로 결과를 캡처해 첨부.

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/api/briefingApi.js frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/route-briefing/RouteBriefingPanel.jsx frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css frontend/src/features/map/MapView.jsx
git commit -m "feat(briefing): add briefing inputs, fetch, and Phase 1 briefing view"
```

---

## 최종 검증

- [ ] 백엔드 전체 테스트: `npm --prefix backend test` → 전부 PASS
- [ ] 프런트 빌드: `npm --prefix frontend run build` → 성공
- [ ] 브라우저: RKSI→RKPC IFR 브리핑이 요약보드 + 3공항 표 + 위험요약 + 목적지(1-2-3)로 뜨고, 임계 초과 칸이 색상 강조됨 (스크린샷 첨부)
- [ ] `Architecture.md` / `EntryPoints.md` 갱신: 새 `briefing/*` 모듈과 `/api/route-briefing`, 브리핑 뷰 진입 흐름 반영
