# 비행 전 브리핑 Phase 2 (3D 고도 매칭 + ④ 노선·공역) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 위험기상 매칭을 수평+시간에서 **3D(수평∩수직∩시간)** 로 끌어올려 🔴조우(내 계획고도에서 실제 통과)/🟡주변(고도 밖)을 구분하고, 브리핑에 **④ 노선·공역 섹션 + "단면도 열기"** 를 추가한다.

**Architecture:** Phase 1의 순수 모듈 위에 얹는다 — `geo-time-match`에 경로∩폴리곤 **거리구간** 계산을 더하고, 신규 `planned-altitude`(계획 고도선)·`hazard-matcher`(조우/주변 판정)를 추가해 `hazard-section`→`briefing-composer`→`BriefingView`로 흘린다. 단면도는 **이미 구현된 연직 프로파일 창**을 재사용(링크만).

**Tech Stack:** Node.js(ESM) + Express, `node --test`. React 19 + Vite.

**스펙:** `docs/superpowers/specs/2026-06-26-preflight-weather-briefing-design.md` (§9 데이터-경로 매칭 3D). **선행:** Phase 1(`...-phase1.md`) 완료 — `flight-category/geo-time-match/airport-summary/taf-window/hazard-section/briefing-composer.js` + `POST /api/route-briefing` + `BriefingView` 존재.

**Phase 2 범위:** advisory(SIGMET/AIRMET)의 **고도밴드 ∩ 계획고도선** 판정 → 조우/주변 · ④ 노선·공역 섹션(조우 위험 + 계획고도 + 단면도 링크) · 회귀 검증.
**Phase 2 비범위(→ Phase 2b/이후):** ④에 KIM 바람·기온·구름·착빙 / KTG 난류의 **고도별 수치 요약**(서버측 필드 샘플링 필요), 미니맵 스크롤연동(Phase 3), 디자인 패스.

---

## 계약 변경 (응답에 추가되는 필드)
```jsonc
"sections": {
  "adverse": { "level":"red", "hazards":[ {
    "source":"SIGMET","code":"SEV_ICE","label":"Severe Icing","validFrom":"...","validTo":"...",
    "onRoute": true,
    "encounter": "on",            // "on"(조우) | "nearby"(주변)
    "verticalKnown": true,         // FL밴드가 없으면 false
    "bandFt": { "lowFt": 8000, "highFt": 14000 },  // null 가능
    "routeIntervalNm": { "startNm": 42.0, "endNm": 88.5 }
  } ] },
  "enroute": {                      // ④ 신규
    "level":"amber",
    "plannedCruiseAltitudeFt": 9000,
    "encounters": [ /* adverse.hazards 중 encounter==='on'인 것의 부분집합 형태 */ ],
    "crossSectionAvailable": true
  },
  "current": { ... }, "destination": { ... }
}
```

## 파일 구조
**백엔드 신규:** `backend/src/briefing/planned-altitude.js`, `backend/src/briefing/hazard-matcher.js` (+각 `backend/test/*.test.js`)
**백엔드 수정:** `geo-time-match.js`(거리구간 추가), `hazard-section.js`(3D 판정), `briefing-composer.js`(axis 빌드 + ④ 섹션)
**프런트 수정:** `BriefingView.jsx`(조우/주변 배지 + ④ 섹션 + 단면도 열기), `frontend/src/features/map/MapView.jsx`(onOpenProfile 전달)

---

## Task 1: 계획 고도선 + FL밴드 변환 (planned-altitude)

**Files:** Create `backend/src/briefing/planned-altitude.js`, Test `backend/test/planned-altitude.test.js`

계획 고도선은 climb 600ft/nm·descent 300ft/nm(기존 `profile-composer.js` 상수)로 근사한 삼각/사다리꼴 모델: `alt(d) = max(0, min(cruise, d*600, (total-d)*300))`. FL밴드는 advisory `altitude` 객체(`{lower_fl,upper_fl,lower_uom,upper_uom}`)를 ft로 변환.

- [ ] **Step 1: 실패 테스트**
```js
// backend/test/planned-altitude.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { altitudeAtDistanceFt, plannedAltitudeRangeFt, bandToFt } from '../src/briefing/planned-altitude.js'

test('altitudeAtDistanceFt: climbs, cruises, descends', () => {
  const total = 200, cruise = 9000
  assert.equal(altitudeAtDistanceFt(0, total, cruise), 0)
  assert.equal(altitudeAtDistanceFt(15, total, cruise), 9000)   // 15nm*600=9000 → cruise
  assert.equal(altitudeAtDistanceFt(100, total, cruise), 9000)  // mid cruise
  assert.equal(altitudeAtDistanceFt(200, total, cruise), 0)     // arrival
  assert.equal(altitudeAtDistanceFt(190, total, cruise), 3000)  // (200-190)*300
})

test('altitudeAtDistanceFt: short route peaks below cruise', () => {
  // total 10nm, cruise 9000 → never reaches cruise
  const a = altitudeAtDistanceFt(5, 10, 9000)
  assert.ok(a < 9000 && a > 0)
})

test('plannedAltitudeRangeFt over an interval returns [min,max]', () => {
  const r = plannedAltitudeRangeFt(40, 90, 200, 9000) // both in cruise band region
  assert.equal(r.maxFt, 9000)
  assert.ok(r.minFt <= 9000)
})

test('bandToFt: FL units -> ft', () => {
  assert.deepEqual(bandToFt({ lower_fl: 80, upper_fl: 140, lower_uom: 'FL', upper_uom: 'FL' }), { lowFt: 8000, highFt: 14000 })
})
test('bandToFt: null limits -> surface/high fallback', () => {
  const b = bandToFt({ lower_fl: null, upper_fl: 100, lower_uom: null, upper_uom: 'FL' })
  assert.equal(b.lowFt, 0)
  assert.equal(b.highFt, 10000)
})
test('bandToFt: both null -> null', () => {
  assert.equal(bandToFt({ lower_fl: null, upper_fl: null }), null)
  assert.equal(bandToFt(null), null)
})
```

- [ ] **Step 2: 실패 확인** — `npm --prefix backend test -- --test-name-pattern="altitudeAtDistanceFt|plannedAltitudeRangeFt|bandToFt"`

- [ ] **Step 3: 구현**
```js
// backend/src/briefing/planned-altitude.js
const CLIMB_FT_PER_NM = 600
const DESCENT_FT_PER_NM = 300
const M_TO_FT = 3.28084
const HIGH_FT = 99999

export function altitudeAtDistanceFt(distanceNm, totalDistanceNm, cruiseAltitudeFt) {
  const d = Number(distanceNm)
  const total = Number(totalDistanceNm)
  const cruise = Number(cruiseAltitudeFt)
  if (!(total > 0) || !(cruise > 0) || !Number.isFinite(d)) return 0
  return Math.max(0, Math.min(cruise, d * CLIMB_FT_PER_NM, (total - d) * DESCENT_FT_PER_NM))
}

export function plannedAltitudeRangeFt(startNm, endNm, totalDistanceNm, cruiseAltitudeFt) {
  const a = Math.max(0, Math.min(startNm, endNm))
  const b = Math.min(totalDistanceNm, Math.max(startNm, endNm))
  const N = 12
  let minFt = Infinity, maxFt = -Infinity
  for (let i = 0; i <= N; i += 1) {
    const d = a + ((b - a) * i) / N
    const alt = altitudeAtDistanceFt(d, totalDistanceNm, cruiseAltitudeFt)
    if (alt < minFt) minFt = alt
    if (alt > maxFt) maxFt = alt
  }
  return { minFt: Number.isFinite(minFt) ? minFt : 0, maxFt: Number.isFinite(maxFt) ? maxFt : 0 }
}

function limitToFt(value, uom) {
  if (value == null || !Number.isFinite(Number(value))) return null
  const v = Number(value)
  const u = String(uom || '').trim().toUpperCase()
  if (u === 'FL') return v * 100
  if (u === 'FT' || u === '[FT_I]') return v
  if (u === 'M') return v * M_TO_FT
  // uom 미상: 작은 값은 FL로 간주(SIGMET 관행), 큰 값은 ft
  return v < 1000 ? v * 100 : v
}

export function bandToFt(altitude) {
  if (!altitude) return null
  const lowFt = limitToFt(altitude.lower_fl, altitude.lower_uom)
  const highFt = limitToFt(altitude.upper_fl, altitude.upper_uom)
  if (lowFt == null && highFt == null) return null
  return { lowFt: lowFt == null ? 0 : lowFt, highFt: highFt == null ? HIGH_FT : highFt }
}

export default { altitudeAtDistanceFt, plannedAltitudeRangeFt, bandToFt }
```

- [ ] **Step 4: 통과 확인** (Step 2 명령)
- [ ] **Step 5: 커밋**
```
git add backend/src/briefing/planned-altitude.js backend/test/planned-altitude.test.js
git commit -m "feat(briefing): planned altitude profile + advisory FL band to ft"
```

---

## Task 2: 경로∩폴리곤 거리구간 (geo-time-match 확장)

**Files:** Modify `backend/src/briefing/geo-time-match.js`, `backend/test/geo-time-match.test.js`

기존 `pointInPolygon`을 재사용해, **route axis(샘플 배열)** 가 폴리곤 안에 드는 distanceNm 구간 `{entered, startNm, endNm}`를 반환. axis 샘플 모양: `{ distanceNm, lon, lat }`(Phase 1 `route-axis.js` 산출).

- [ ] **Step 1: 기존 테스트 파일에 추가**
```js
// backend/test/geo-time-match.test.js 에 append (import에 routeIntervalInGeometry 추가)
import { routeIntervalInGeometry } from '../src/briefing/geo-time-match.js'

const axis = { samples: [
  { distanceNm: 0, lon: -5, lat: -5 },
  { distanceNm: 10, lon: 2, lat: 2 },
  { distanceNm: 20, lon: 5, lat: 5 },
  { distanceNm: 30, lon: 8, lat: 8 },
  { distanceNm: 40, lon: 20, lat: 20 },
] }
const squareGeom = { type:'Polygon', coordinates: [[[0,0],[10,0],[10,10],[0,10],[0,0]]] }

test('routeIntervalInGeometry: returns entered interval by distance', () => {
  const r = routeIntervalInGeometry(axis, squareGeom)
  assert.equal(r.entered, true)
  assert.equal(r.startNm, 10)  // first sample inside (2,2)
  assert.equal(r.endNm, 30)    // last sample inside (8,8)
})
test('routeIntervalInGeometry: no entry', () => {
  const out = { samples: [{distanceNm:0,lon:20,lat:20},{distanceNm:5,lon:30,lat:30}] }
  assert.equal(routeIntervalInGeometry(out, squareGeom).entered, false)
})
```

- [ ] **Step 2: 실패 확인** — `npm --prefix backend test -- --test-name-pattern="routeIntervalInGeometry"`

- [ ] **Step 3: 구현 추가** (`geo-time-match.js` — `polygonsOf`/`pointInPolygon`은 이미 있음. export 함수 추가, default export에도 추가)
```js
export function routeIntervalInGeometry(axis, geometry) {
  const samples = axis?.samples ?? []
  const polygons = polygonsOf(geometry)
  let startNm = null, endNm = null
  for (const s of samples) {
    let inside = false
    for (const polygon of polygons) {
      const outer = polygon[0]
      if (outer && pointInPolygon([s.lon, s.lat], outer)) { inside = true; break }
    }
    if (inside) {
      if (startNm == null) startNm = s.distanceNm
      endNm = s.distanceNm
    }
  }
  return { entered: startNm != null, startNm, endNm }
}
```
> `polygonsOf`가 모듈 내 `function` 선언이라 hoisting으로 접근 가능. default export 객체에 `routeIntervalInGeometry`도 추가할 것.

- [ ] **Step 4: 통과 확인** (Step 2 명령) — 기존 geo-time-match 테스트도 같이 통과해야 함.
- [ ] **Step 5: 커밋**
```
git add backend/src/briefing/geo-time-match.js backend/test/geo-time-match.test.js
git commit -m "feat(briefing): compute route∩polygon distance interval for vertical matching"
```

---

## Task 3: 조우/주변 판정 (hazard-matcher)

**Files:** Create `backend/src/briefing/hazard-matcher.js`, Test `backend/test/hazard-matcher.test.js`

계획고도 범위(구간 [start,end])와 FL밴드를 비교해 'on'(겹침)/'nearby'(안 겹침) 분류. 밴드 null이면 수직 미확정 → 'nearby' + verticalKnown:false.

- [ ] **Step 1: 실패 테스트**
```js
// backend/test/hazard-matcher.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyEncounter } from '../src/briefing/hazard-matcher.js'

const ctx = { totalDistanceNm: 200, cruiseAltitudeFt: 9000 }

test('on: planned altitude overlaps band over interval', () => {
  // interval mid-route (cruise 9000), band 8000-14000 → overlap
  const r = classifyEncounter({ startNm: 40, endNm: 90, bandFt: { lowFt: 8000, highFt: 14000 } }, ctx)
  assert.equal(r.encounter, 'on')
  assert.equal(r.verticalKnown, true)
})
test('nearby: band entirely above planned altitude', () => {
  // band 20000-30000, cruise 9000 → no overlap
  const r = classifyEncounter({ startNm: 40, endNm: 90, bandFt: { lowFt: 20000, highFt: 30000 } }, ctx)
  assert.equal(r.encounter, 'nearby')
  assert.equal(r.verticalKnown, true)
})
test('nearby + verticalKnown false when band null', () => {
  const r = classifyEncounter({ startNm: 40, endNm: 90, bandFt: null }, ctx)
  assert.equal(r.encounter, 'nearby')
  assert.equal(r.verticalKnown, false)
})
```

- [ ] **Step 2: 실패 확인** — `npm --prefix backend test -- --test-name-pattern="classifyEncounter|on: planned|nearby"`

- [ ] **Step 3: 구현**
```js
// backend/src/briefing/hazard-matcher.js
import { plannedAltitudeRangeFt } from './planned-altitude.js'

export function classifyEncounter({ startNm, endNm, bandFt }, ctx) {
  if (!bandFt) return { encounter: 'nearby', verticalKnown: false }
  const { minFt, maxFt } = plannedAltitudeRangeFt(startNm, endNm, ctx.totalDistanceNm, ctx.cruiseAltitudeFt)
  const overlap = minFt <= bandFt.highFt && bandFt.lowFt <= maxFt
  return { encounter: overlap ? 'on' : 'nearby', verticalKnown: true }
}

export default { classifyEncounter }
```

- [ ] **Step 4: 통과 확인** (Step 2 명령)
- [ ] **Step 5: 커밋**
```
git add backend/src/briefing/hazard-matcher.js backend/test/hazard-matcher.test.js
git commit -m "feat(briefing): classify hazard encounter (on/nearby) by planned altitude vs FL band"
```

---

## Task 4: hazard-section 3D 업그레이드

**Files:** Modify `backend/src/briefing/hazard-section.js`, `backend/test/hazard-section.test.js`

`buildHazardSection`이 이제 **axis + profileCtx(cruiseAltitudeFt,totalDistanceNm)** 를 받아, 각 위험에 `encounter/verticalKnown/bandFt/routeIntervalNm`를 붙인다. 수평∩시간 통과 + (위) 거리구간으로 수직 판정. level은 SIGMET 존재 시 red 유지하되, 모두 'nearby'면 amber로 완화.

- [ ] **Step 1: 테스트 갱신** (기존 파일 교체 — axis/ctx 입력으로)
```js
// backend/test/hazard-section.test.js  (전체 교체)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildHazardSection } from '../src/briefing/hazard-section.js'

const onRoutePoly = { type:'Polygon', coordinates: [[[125,32],[128,32],[128,35],[125,35],[125,32]]] }
// axis: 일부 샘플이 폴리곤 내부(126.5,33.5)에 들도록
const axis = { totalDistanceNm: 200, samples: [
  { distanceNm: 0, lon: 126.45, lat: 37.46 },
  { distanceNm: 80, lon: 126.5, lat: 34.0 },
  { distanceNm: 120, lon: 126.6, lat: 33.0 },
  { distanceNm: 200, lon: 126.5, lat: 31.0 },
] }
const ctxBase = { etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z', cruiseAltitudeFt: 9000 }

const icingOnAlt = { id:'s1', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing',
  valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
  altitude:{ lower_fl:80, upper_fl:140, lower_uom:'FL', upper_uom:'FL' } }
const turbHighAlt = { id:'s2', phenomenon_code:'SEV_TURB', phenomenon_label:'Severe Turbulence',
  valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
  altitude:{ lower_fl:300, upper_fl:400, lower_uom:'FL', upper_uom:'FL' } }

test('on-route + planned altitude in band -> encounter on, red', () => {
  const sec = buildHazardSection({ sigmet:[icingOnAlt], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards.length, 1)
  assert.equal(sec.hazards[0].encounter, 'on')
  assert.equal(sec.hazards[0].verticalKnown, true)
  assert.deepEqual(sec.hazards[0].bandFt, { lowFt: 8000, highFt: 14000 })
  assert.equal(sec.hazards[0].routeIntervalNm.startNm, 80)
  assert.equal(sec.level, 'red')
})

test('on-route but above planned altitude -> nearby, amber', () => {
  const sec = buildHazardSection({ sigmet:[turbHighAlt], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards[0].encounter, 'nearby')
  assert.equal(sec.level, 'amber') // SIGMET이지만 조우 없음 → 완화
})

test('band-unknown SIGMET stays red (no under-alarm)', () => {
  const tsNoBand = { id:'s3', phenomenon_code:'EMBD_TS', phenomenon_label:'Embedded TS',
    valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly, altitude:null }
  const sec = buildHazardSection({ sigmet:[tsNoBand], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards[0].verticalKnown, false)
  assert.equal(sec.hazards[0].encounter, 'nearby')
  assert.equal(sec.level, 'red')
})

test('AIRMET at planned altitude stays amber', () => {
  const airmetOnAlt = { id:'a1', phenomenon_code:'MOD_TURB', phenomenon_label:'Moderate Turbulence',
    valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:onRoutePoly,
    altitude:{ lower_fl:60, upper_fl:120, lower_uom:'FL', upper_uom:'FL' } }
  const sec = buildHazardSection({ sigmet:[], airmet:[airmetOnAlt], axis, ...ctxBase })
  assert.equal(sec.hazards[0].encounter, 'on')
  assert.equal(sec.level, 'amber')
})

test('off-route dropped', () => {
  const offPoly = { type:'Polygon', coordinates: [[[100,10],[101,10],[101,11],[100,11],[100,10]]] }
  const off = { ...icingOnAlt, geometry: offPoly }
  const sec = buildHazardSection({ sigmet:[off], airmet:[], axis, ...ctxBase })
  assert.equal(sec.hazards.length, 0)
  assert.equal(sec.level, 'green')
})
```

- [ ] **Step 2: 실패 확인** — `npm --prefix backend test -- --test-name-pattern="encounter on|nearby|off-route dropped"`

- [ ] **Step 3: 구현 교체**
```js
// backend/src/briefing/hazard-section.js
import { routeIntervalInGeometry, timeWindowsOverlap } from './geo-time-match.js'
import { bandToFt } from './planned-altitude.js'
import { classifyEncounter } from './hazard-matcher.js'

function matchItems(items, source, ctx) {
  const out = []
  for (const it of (items ?? [])) {
    if (!it?.geometry || !it.valid_from || !it.valid_to) continue
    if (!timeWindowsOverlap(ctx.etd, ctx.eta, it.valid_from, it.valid_to)) continue
    const interval = routeIntervalInGeometry(ctx.axis, it.geometry)
    if (!interval.entered) continue
    const bandFt = bandToFt(it.altitude)
    const { encounter, verticalKnown } = classifyEncounter(
      { startNm: interval.startNm, endNm: interval.endNm, bandFt },
      { totalDistanceNm: ctx.axis?.totalDistanceNm, cruiseAltitudeFt: ctx.cruiseAltitudeFt },
    )
    out.push({
      source,
      code: it.phenomenon_code,
      label: it.phenomenon_label || it.phenomenon_code,
      validFrom: it.valid_from,
      validTo: it.valid_to,
      onRoute: true,
      encounter,
      verticalKnown,
      bandFt,
      routeIntervalNm: { startNm: interval.startNm, endNm: interval.endNm },
    })
  }
  return out
}

// 보수적 위험별 레벨: SIGMET은 red, 단 "수직 확인되고 내 고도 밖(nearby)"이면 amber로만 완화.
// 밴드 미상 SIGMET(verticalKnown=false)은 under-alarm 금지로 red 유지. AIRMET은 항상 amber.
function hazardLevel(h) {
  if (h.source === 'SIGMET') return (h.verticalKnown && h.encounter === 'nearby') ? 'amber' : 'red'
  return 'amber'
}
const LEVEL_RANK = { green: 0, amber: 1, red: 2 }

export function buildHazardSection({ sigmet, airmet, axis, etd, eta, cruiseAltitudeFt }) {
  const ctx = { axis, etd, eta, cruiseAltitudeFt }
  const hazards = [
    ...matchItems(sigmet, 'SIGMET', ctx),
    ...matchItems(airmet, 'AIRMET', ctx),
  ]
  const level = hazards.reduce(
    (acc, h) => (LEVEL_RANK[hazardLevel(h)] > LEVEL_RANK[acc] ? hazardLevel(h) : acc),
    'green',
  )
  return { level, hazards }
}

export default { buildHazardSection }
```
> 변경점: SIGMET 존재만으로 red가 아니라 **조우(on)가 있을 때 red**, 주변만이면 amber. 이게 3D의 핵심 가치.

- [ ] **Step 4: 통과 확인** (Step 2 명령)
- [ ] **Step 5: 커밋**
```
git add backend/src/briefing/hazard-section.js backend/test/hazard-section.test.js
git commit -m "feat(briefing): 3D hazard section — encounter/nearby by altitude band"
```

---

## Task 5: composer가 axis 빌드 + ④ 노선 섹션

**Files:** Modify `backend/src/briefing/briefing-composer.js`, `backend/test/briefing-composer.test.js`

composer가 `buildRouteAxis(routeGeometry, 2000)`로 axis를 만들어 hazard-section에 넘기고, `cruiseAltitudeFt = request.plannedCruiseAltitudeFt`를 전달. ④ `enroute` 섹션 추가(조우 위험 + 계획고도 + crossSectionAvailable).

- [ ] **Step 1: 테스트 갱신** (기존 composer 테스트의 sigmet item에 `altitude` 추가 + ④ 단언)
```js
// backend/test/briefing-composer.test.js — 변경점만:
// 1) data.sigmet.items[0]에 altitude 추가:
//    altitude:{ lower_fl:60, upper_fl:120, lower_uom:'FL', upper_uom:'FL' }
//    (route 코드와 cruise 9000ft 기준으로 조우가 되도록 6000~12000ft 밴드)
// 2) 새 테스트 추가:
test('enroute section reflects 3D encounters', () => {
  const b = composeBriefing(request, data)
  assert.ok(b.sections.enroute)
  assert.equal(b.sections.enroute.plannedCruiseAltitudeFt, 9000)
  assert.equal(b.sections.enroute.crossSectionAvailable, true)
  // adverse hazard가 조우면 enroute.encounters에 포함
  const onCount = b.sections.adverse.hazards.filter(h => h.encounter === 'on').length
  assert.equal(b.sections.enroute.encounters.length, onCount)
})
```
> 기존 `composeBriefing returns ...` 테스트의 `b.sections.adverse.hazards.length === 1`은 유지(조우 1건). route coordinates `[[126.45,37.46],[126.5,33.5]]`가 폴리곤을 통과하므로 axis 샘플이 내부에 듦.

- [ ] **Step 2: 실패 확인** — `npm --prefix backend test -- --test-name-pattern="enroute section|composeBriefing"`

- [ ] **Step 3: 구현 수정** (import 추가 + adverse 호출부 + enroute 섹션)
```js
// 상단 import에 추가:
import { buildRouteAxis } from './route-axis.js'

// composeBriefing 내부, adverse 계산을 axis 기반으로 교체:
const axis = buildRouteAxis(request.routeGeometry, 2000)
const cruiseAltitudeFt = Number(request.plannedCruiseAltitudeFt) || 0
const adverse = buildHazardSection({
  sigmet: data?.sigmet?.items ?? [],
  airmet: data?.airmet?.items ?? [],
  axis,
  etd: request.etd,
  eta: request.eta,
  cruiseAltitudeFt,
})

// destination 계산 뒤, enroute 섹션 추가:
const encounters = adverse.hazards.filter((h) => h.encounter === 'on')
const enroute = {
  level: encounters.length > 0 ? 'red' : adverse.hazards.length > 0 ? 'amber' : 'green',
  plannedCruiseAltitudeFt: cruiseAltitudeFt,
  encounters,
  crossSectionAvailable: true,
}

// 반환 sections에 enroute 추가:
sections: { adverse, enroute, current: { airports }, destination },
```
> `buildRouteAxis`의 인자는 `(routeGeometry, sampleSpacingMeters)`. 기존 `vertical-profile.js` 사용례와 동일. 반환 axis는 `{ totalDistanceNm, samples:[{distanceNm,lon,lat,...}] }`.

- [ ] **Step 4: 통과 확인** (Step 2 명령) — 전체 `npm --prefix backend test`도 회귀 없어야 함.
- [ ] **Step 5: 커밋**
```
git add backend/src/briefing/briefing-composer.js backend/test/briefing-composer.test.js
git commit -m "feat(briefing): build route axis for 3D matching and add enroute section"
```

---

## Task 6: BriefingView 조우/주변 배지 + ④ 섹션 + 단면도 열기

**Files:** Modify `frontend/src/features/route-briefing/BriefingView.jsx`, `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: BriefingView에 onOpenProfile prop + 배지 + ④ 섹션 추가**

`BriefingView`의 시그니처를 `({ briefing, onClose, onOpenProfile })`로 바꾸고:
1. ① 위험 요약의 각 hazard `<li>`에 조우/주변 배지를 추가:
```jsx
{sections.adverse.hazards.map((h, i) => (
  <li key={i}>
    <span className={`bv-enc ${h.encounter === 'on' ? 'bv-red' : 'bv-amber'}`}>
      {h.encounter === 'on' ? '🔴 조우' : '🟡 주변'}{h.verticalKnown === false ? '?' : ''}
    </span>{' '}
    <b>{h.source}</b> {h.label}
    {h.bandFt ? <span className="bv-muted"> {h.bandFt.lowFt}–{h.bandFt.highFt}ft</span> : null}
    <span className="bv-muted"> ({h.validFrom}~{h.validTo})</span>
  </li>
))}
```
2. ③ 현재 실황 섹션과 ⑤ 사이에 ④ 노선·공역 섹션 추가:
```jsx
{sections.enroute && (
  <section className={`bv-section ${LEVEL_CLASS[sections.enroute.level]}`}>
    <h3>④ 노선·공역</h3>
    <p className="bv-muted">계획고도 {sections.enroute.plannedCruiseAltitudeFt}ft</p>
    {sections.enroute.encounters.length === 0
      ? <p className="bv-muted">계획고도에서 조우하는 위험 없음</p>
      : <ul>{sections.enroute.encounters.map((h, i) => (
          <li key={i}><b>{h.label}</b> {h.bandFt ? `${h.bandFt.lowFt}–${h.bandFt.highFt}ft` : ''} · {h.routeIntervalNm.startNm}–{h.routeIntervalNm.endNm}NM</li>
        ))}</ul>}
    {sections.enroute.crossSectionAvailable && onOpenProfile && (
      <button type="button" className="bv-link-btn" onClick={onOpenProfile}>단면도 열기</button>
    )}
  </section>
)}
```

- [ ] **Step 2: CSS 추가** (`BriefingView.css`에 append)
```css
.bv-enc { padding:1px 7px; border-radius:10px; font-size:11px; font-weight:600; }
.bv-link-btn { margin-top:6px; padding:4px 10px; border:1px solid var(--border,#e2e4e8); border-radius:6px; background:transparent; cursor:pointer; }
```

- [ ] **Step 3: MapView가 onOpenProfile 전달**

`MapView.jsx`의 `<BriefingView ... />` 렌더에 prop 추가 — 기존 연직 프로파일 요청 액션을 재사용:
```jsx
<BriefingView
  briefing={routeBriefing.state.briefing}
  onClose={() => routeBriefing.actions.setBriefing(null)}
  onOpenProfile={routeBriefing.actions.handleVerticalProfileRequest}
/>
```
> `handleVerticalProfileRequest`는 Phase 1 이전부터 훅 `actions`에 존재(연직 프로파일 창 오픈). prop 이름이 다르면 실제 액션명을 확인해 사용.

- [ ] **Step 4: 빌드 검증** — `npm --prefix frontend run build` 성공.

- [ ] **Step 5: 커밋**
```
git add frontend/src/features/route-briefing/BriefingView.jsx frontend/src/features/route-briefing/BriefingView.css frontend/src/features/map/MapView.jsx
git commit -m "feat(briefing): show encounter/nearby badges and enroute section with profile link"
```

---

## Task 7: 회귀 검증 (백엔드 + 브라우저 스모크)

**Files:** Create `backend/test/route-briefing-integration.test.js`

엔드포인트 핸들러를 거치지 않고 `composeBriefing`를 실데이터형 입력으로 한 번 더 잠그는 통합 테스트(빠르고 결정적). 브라우저 스모크는 기존 Playwright 하니스 재사용.

- [ ] **Step 1: 통합 테스트 작성**
```js
// backend/test/route-briefing-integration.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { composeBriefing } from '../src/briefing/briefing-composer.js'

const poly = { type:'Polygon', coordinates: [[[125,32],[128,32],[128,35],[125,35],[125,32]]] }
const request = {
  flightRule:'IFR', departureAirport:'RKSI', arrivalAirport:'RKPC', alternateAirport:'RKPK',
  routeGeometry:{ type:'LineString', coordinates:[[126.45,37.46],[126.5,33.5]] },
  etd:'2026-06-26T09:00:00Z', eta:'2026-06-26T10:30:00Z', plannedCruiseAltitudeFt:9000,
}
const obs = { observation:{ wind:{raw:'27008KT',speed:8}, visibility:{value:9999}, clouds:[{amount:'FEW',base:3000}], weather:[], temperature:{air:18,dewpoint:9}, qnh:{value:1018}, display:{wind:'27008KT',clouds:'FEW030',temperature:'18/09',qnh:'Q1018',weather:'-'} } }
const data = {
  metar:{ airports:{ RKSI:{header:{icao:'RKSI'},...obs}, RKPC:{header:{icao:'RKPC'},...obs}, RKPK:{header:{icao:'RKPK'},...obs} } },
  taf:{ airports:{} },
  sigmet:{ items:[
    { id:'on', phenomenon_code:'SEV_ICE', phenomenon_label:'Severe Icing', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:poly, altitude:{lower_fl:60,upper_fl:120,lower_uom:'FL',upper_uom:'FL'} },   // 6000–12000ft ∩ cruise 9000 → 조우
    { id:'near', phenomenon_code:'SEV_TURB', phenomenon_label:'Severe Turbulence', valid_from:'2026-06-26T08:00:00Z', valid_to:'2026-06-26T14:00:00Z', geometry:poly, altitude:{lower_fl:300,upper_fl:400,lower_uom:'FL',upper_uom:'FL'} }, // 30000–40000ft → 주변
  ] },
  airmet:{ items:[] },
}

test('integration: 3D briefing payload is internally consistent', () => {
  const b = composeBriefing(request, data)
  assert.equal(b.sections.adverse.hazards.length, 2)
  const enc = b.sections.adverse.hazards.find(h => h.code === 'SEV_ICE')
  const near = b.sections.adverse.hazards.find(h => h.code === 'SEV_TURB')
  assert.equal(enc.encounter, 'on')
  assert.equal(near.encounter, 'nearby')
  assert.equal(b.sections.adverse.level, 'red')          // 조우 존재
  assert.equal(b.sections.enroute.encounters.length, 1)  // 조우만
  assert.equal(b.sections.enroute.encounters[0].code, 'SEV_ICE')
  assert.equal(b.sections.enroute.plannedCruiseAltitudeFt, 9000)
  assert.equal(b.sections.current.airports.length, 3)
})
```
- [ ] **Step 2: 백엔드 전체 테스트** — `npm --prefix backend test` → 신규/기존 전부 통과(사전 결함 sfc/kim 제외).
- [ ] **Step 3: 프런트 빌드** — `npm --prefix frontend run build` 성공.
- [ ] **Step 4: 브라우저 스모크** — 백엔드/프런트 dev 서버 기동 후, 사이드바 "비행 전 브리핑" → IFR 경로 검색 → "브리핑 생성" → ① 위험요약에 조우/주변 배지, ④ 노선·공역 섹션 + "단면도 열기" 동작 확인. 기존 `npm run dev:smoke`(Playwright responsive) 통과 확인. 스크린샷 첨부.
- [ ] **Step 5: 커밋**
```
git add backend/test/route-briefing-integration.test.js
git commit -m "test(briefing): integration lock for 3D briefing payload"
```

---

## 최종 검증
- [ ] `npm --prefix backend test` 전부 PASS (사전 sfc/kim 결함 제외)
- [ ] `npm --prefix frontend run build` 성공
- [ ] 브라우저: 조우(red)/주변(amber) 구분 + ④ 노선·공역 + 단면도 열기 동작 (스크린샷)
- [ ] `Architecture.md`/`EntryPoints.md`에 `planned-altitude.js`·`hazard-matcher.js`·④ enroute 섹션·`enroute` payload 필드 반영
- [ ] 다음(Phase 2b): ④에 KIM/KTG 고도별 수치 요약(서버측 필드 샘플링) — 별도 계획서
