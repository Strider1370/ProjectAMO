# flight_category 프론트 표출 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드가 내보내는 시정·운고·관측지점·추세를 지도에 올린다. 새 레이어를 만드는 것이 아니라 이미 물려 있는 `flightCategory` 레이어를 새 자료 모양에 맞춘다.

**Architecture:** 순수 계산(지점 표식 판정, 꾸러미 가르기, 말풍선 문구)을 먼저 모듈로 떼어 브라우저 없이 못 박고, 그다음 지도 배선을 **한 커밋에** 끝내 중간에 빌드가 깨지는 구간을 만들지 않는다. 범례는 기존 `WeatherLegends.jsx`에 붙이고 시각 표시는 기존 `WeatherLayerTimestampBar`를 그대로 쓴다.

**Tech Stack:** React, mapbox-gl, `node --test`(Node 내장), Playwright.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-02-flight-category-frontend-design.md`. 스펙에 없는 사용자 영향 결정을 새로 만들지 않는다.
- 선행 스펙: `docs/superpowers/specs/2026-08-01-flight-category-redesign-design.md`. 백엔드는 `325fa24`에서 완료됐다.
- **병렬 세션이 `frontend/src/features/terminal/*` 와 여러 미추적 문서를 잡고 있다. `git add -A` / `git add .` 금지.** 각 태스크가 지정한 파일만 스테이징하고, 커밋 전 `git branch --show-current`가 `main`인지 확인한다.
- **테스트는 `node --test`다.** `frontend/package.json`의 `"test": "node --test"`이고 이웃 파일들(`weatherOverlayLayers.test.js`, `layerActions.test.js`)은 `import test from 'node:test'` / `node:assert/strict`를 쓴다. **vitest는 이 저장소에 없다.** 새 시험도 같은 형식으로 쓴다.
- **Playwright 시험은 `frontend/verification/contracts/*.spec.mjs`에 둔다.** `playwright.config.js:15`의 `testDir`가 그곳이고, `webServer` 설정이 이미 `DISABLE_COLLECTION: '1'`을 넘긴다(`:37`) — 자료 고정을 따로 할 필요가 없다. 기준 이미지는 세 화면(desktop / ipad-landscape / mobile)마다 따로 생기며 Linux 전용이다.
- **`MapView.jsx`의 구분선 주석은 물음표로 깨져 있다**(예: `// ???? Sync flight category overlay ????`). 파일은 UTF-8 정상이고 장식 문자만 손상된 것이다. **복구하려 들지 말고 그 줄을 건드리지 않는다.** 한글을 새로 넣을 때는 [encoding-safety](../policies/encoding-safety.md)를 따른다.
- 색은 백엔드가 도형에 실어 보낸다. 프론트에서 밴드 색을 새로 정의하지 않는다 — `['get', 'color']`를 쓴다.
- 자료 없음을 "기준 충족"으로 보이게 하지 않는다. 빈 화면·빈칸으로 두지 않고 "자료 없음"이라고 적는다.
- Mapbox 표현식에서 `['get', ...]`를 조건으로 쓸 때는 이 저장소 관례대로 `['boolean', ['get', 'x'], false]`로 감싼다(`routePreview.js:291`, `baseMapLayers.js:77`). 감싸지 않으면 속성이 없을 때 표현식이 던진다.

## 백엔드가 실제로 주는 것 (2026-08-02 실측)

`GET /api/weather/flight-category-overlay` — 산출물이 없으면 **503**(빈 200이 아니다).

```json
{
  "computed_at": "2026-08-01T15:22:13.722Z",
  "visibility": { "geojson": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "properties": { "band": "severe", "color": "#dc2626" }, "geometry": {} } ] } },
  "ceiling": { "geojson": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "properties": { "band": "low", "color": "#dc2626" }, "geometry": {} } ] } },
  "stations": [ { "id": "amos_RKSI", "name": "인천국제공항", "source": "AMOS",
    "lat": 37.46, "lon": 126.44, "ceiling_ft": 2953, "model_ceiling_ft": null, "diff_ft": null } ],
  "trend": { "hours": 3, "vis_delta": [] },
  "sources": { "kim": { "run": "2026080106", "hf": 0 }, "ctps": { "frame_tm": "202608012320" },
    "missing_ratio": 0.8184158683270131, "stations": { "asos": 0, "amos": 1, "tm": "202608012200" } }
}
```

- 시정 밴드 `severe`/`below`/`marginal`/`missing`. 운고 밴드 `low`/`mid`. 기준을 넘는 구역은 도형을 만들지 않는다.
- `stations`가 빈 배열, `trend`가 `null`인 것은 **정상이다**(맑음 / 켠 지 3시간 미만).
- **시각의 시간대가 서로 다르다.** `computed_at`은 UTC(ISO), `sources.kim.run`은 UTC 모델 run, `sources.stations.tm`은 **KST**다. 나란히 보이려면 하나로 맞춰야 한다.

`GET /api/weather/flight-category-overlay/point?lat=&lon=` — 격자 밖이면 **400**.

```json
{ "vis_m": 29500, "vis_band": "clear", "ceil_ft": null, "ceil_band": "missing", "vis_trend": 7600,
  "nearest_station": { "name": "영천", "source": "ASOS", "distance_km": 97.7,
    "ceiling_ft": 19358, "model_ceiling_ft": null, "diff_ft": null } }
```

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/flightCategoryStations.js` (신설) | 지점 표식 판정 — 순수 계산 |
| `lib/flightCategoryPopup.js` (신설) | 말풍선 줄 만들기 — 순수 계산 |
| `lib/flightCategoryLegend.js` (신설) | 층별 시각·지점 수 — 순수 계산 |
| `lib/useFlightCategory.js` (수정) | 꾸러미를 갈라 반환 |
| `lib/flightCategoryLayers.js` (수정) | 지도 층 셋, 말풍선 묶기 |
| `WeatherLegends.jsx` (수정) | 색 범례, 안내 문구, 하위 옵션 두 개 |
| `WeatherOverlayPanel.jsx` / `lib/weatherOverlayLayers.js` / `map/layerActions.js` / `map/MapView.jsx` (수정) | 토글 둘로 분리, 배선 |
| `verification/contracts/flight-category-overlay.spec.mjs` (신설) | 브라우저 계약 |

---

## Task 1: 지점 표식 판정

지도와 무관한 순수 계산이라 먼저 못 박는다. 스펙 §3.3의 표가 그대로 시험이 된다.

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryStations.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryStations.test.js`

**Interfaces:**
- Produces: `stationMarkerStyle(station) => { fill: 'severe'|'caution'|'none', ring: boolean }`, `toStationFeatures(stations) => FeatureCollection`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { stationMarkerStyle, toStationFeatures } from './flightCategoryStations.js'

const stn = (over) => ({
  id: 'asos_1', name: '시험', source: 'ASOS', lat: 37, lon: 127,
  ceiling_ft: 1000, model_ceiling_ft: 2000, diff_ft: -1000, ...over,
})

test('색은 관측 운고 밴드를 따른다', () => {
  // 450 m = 1476 ft, 900 m = 2953 ft
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1000 })).fill, 'severe')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 2000 })).fill, 'caution')
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 5000 })).fill, 'none')
})

test('한 밴드 이상 낮고 200 ft를 넘으면 테두리를 붙인다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })).ring, true)
})

test('밴드는 달라도 차이가 작으면 붙이지 않는다', () => {
  // 1470 ft = low, 1480 ft = mid. 경계선을 살짝 걸친 것뿐이다.
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1470, model_ceiling_ft: 1480 })).ring, false)
})

test('모델이 더 보수적이면 붙이지 않는다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 2000, model_ceiling_ft: 1200 })).ring, false)
})

test('모델이 구름 없음인데 관측이 900 m 미만이면 붙인다', () => {
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: null, diff_ft: null })).ring, true)
})

test('모델이 구름 없음이어도 관측이 900 m 이상이면 붙이지 않는다', () => {
  // 어긋난 것은 맞지만 운항에 걸리는 높이가 아니다. 붙이면 경고가 흔해진다.
  assert.equal(stationMarkerStyle(stn({ ceiling_ft: 5000, model_ceiling_ft: null, diff_ft: null })).ring, false)
})

test('관측값이 없는 지점은 아예 그리지 않는다', () => {
  // 그리면 "속 빈 점"이 되어 스펙 §3.3의 "관측 900 m 초과"와 똑같이 보인다.
  // 자료 없음이 맑은 하늘로 읽히는 것 — 이 계획이 없애려는 실패 방식이다.
  assert.equal(toStationFeatures([stn({ ceiling_ft: null })]).features.length, 0)
  assert.equal(toStationFeatures([stn({ ceiling_ft: -1 })]).features.length, 0)
})

test('빈 목록도 유효한 FeatureCollection을 만든다', () => {
  const fc = toStationFeatures([])
  assert.equal(fc.type, 'FeatureCollection')
  assert.deepEqual(fc.features, [])
})

test('좌표와 표식 속성을 실어 보낸다', () => {
  const [f] = toStationFeatures([stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })]).features
  assert.deepEqual(f.geometry.coordinates, [127, 37])
  assert.equal(f.properties.fill, 'severe')
  assert.equal(f.properties.ring, true)
  assert.equal(f.properties.name, '시험')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryStations.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```js
// 운고 밴드 경계는 백엔드 CEILING_BANDS와 같은 값(450 m, 900 m)을 피트로 환산한 것이다.
// 미터 값을 피트와 그대로 비교하면 300 m(984 ft) 운고가 안전한 것으로 뒤집힌다 —
// 백엔드 Task 9에서 실제로 났던 오류다.
const M_TO_FT = 3.28084
const LOW_FT = 450 * M_TO_FT      // 1476
const MID_FT = 900 * M_TO_FT      // 2953
const RING_MIN_DIFF_FT = 200

function band(ceilFt) {
  if (!Number.isFinite(ceilFt) || ceilFt < 0) return 'missing'
  if (ceilFt < LOW_FT) return 'low'
  if (ceilFt < MID_FT) return 'mid'
  return 'high'
}

const FILL_BY_BAND = { low: 'severe', mid: 'caution', high: 'none', missing: 'none' }
const BAND_ORDER = { low: 0, mid: 1, high: 2, missing: 3 }

/**
 * 지점 표식의 색과 테두리.
 *
 * 테두리는 "화면이 실제보다 안전해 보이는" 경우에만 붙인다. 모델이 더 보수적인
 * 방향은 안전 문제가 아니므로 붙이지 않는다.
 */
export function stationMarkerStyle(station) {
  const obs = station?.ceiling_ft
  const obsBand = band(obs)
  const fill = FILL_BY_BAND[obsBand]
  const modelBand = band(station?.model_ceiling_ft)

  // 모델이 "구름 없음"이면 차이를 계산할 수 없다. 관측이 운항에 걸리는 높이일 때만 붙인다.
  // 결측 판정을 band() 하나로만 하여 관측·모델이 같은 정의를 쓰게 한다.
  if (modelBand === 'missing') {
    return { fill, ring: obsBand === 'low' || obsBand === 'mid' }
  }

  const lowerByBand = BAND_ORDER[obsBand] < BAND_ORDER[modelBand]
  return { fill, ring: lowerByBand && station.model_ceiling_ft - obs > RING_MIN_DIFF_FT }
}

/** 관측값이 없는 지점은 뺀다 — 그리면 "구름 높음"과 구분되지 않는다. */
export function toStationFeatures(stations) {
  return {
    type: 'FeatureCollection',
    features: (stations ?? [])
      .filter((s) => band(s?.ceiling_ft) !== 'missing')
      .map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id, name: s.name, source: s.source,
          ceiling_ft: s.ceiling_ft, model_ceiling_ft: s.model_ceiling_ft,
          ...stationMarkerStyle(s),
        },
      })),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryStations.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryStations.js frontend/src/features/weather-overlays/lib/flightCategoryStations.test.js
git commit -m "feat(flight-category): station marker styling rules"
```

---

## Task 2: 자료 가르기

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/useFlightCategory.js`
- Test: `frontend/src/features/weather-overlays/lib/useFlightCategory.test.js` (신설)

**Interfaces:**
- Produces: `splitOverlayPayload(data) => { visibility, ceiling, stations, trend, sources, computedAt, hasData }`
  - 훅 `useFlightCategory()`가 이 객체를 그대로 반환한다.
  - `computedAt`: ISO 문자열 또는 `null`. **Task 5의 `legendStamps`가 시정 층 시각으로 쓴다.**
  - `hasData`: 산출물을 한 번이라도 받았는지. 범례가 "자료 없음"을 띄울지 판단한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { splitOverlayPayload } from './useFlightCategory.js'

test('꾸러미를 갈라 낸다', () => {
  const out = splitOverlayPayload({
    computed_at: '2026-08-01T15:22:13.722Z',
    visibility: { geojson: { type: 'FeatureCollection', features: [1] } },
    ceiling: { geojson: { type: 'FeatureCollection', features: [2] } },
    stations: [{ id: 'a' }],
    trend: { hours: 3, vis_delta: [] },
    sources: { missing_ratio: 0.8 },
  })
  assert.deepEqual(out.visibility.features, [1])
  assert.deepEqual(out.ceiling.features, [2])
  assert.deepEqual(out.stations, [{ id: 'a' }])
  assert.equal(out.trend.hours, 3)
  assert.equal(out.computedAt, '2026-08-01T15:22:13.722Z')
  assert.equal(out.hasData, true)
})

test('자료가 없으면 빈 도형을 주고 hasData가 거짓이다', () => {
  // 빈 화면을 "문제 없음"으로 읽게 두지 않기 위한 신호다.
  const out = splitOverlayPayload(null)
  assert.deepEqual(out.visibility.features, [])
  assert.deepEqual(out.ceiling.features, [])
  assert.deepEqual(out.stations, [])
  assert.equal(out.trend, null)
  assert.equal(out.computedAt, null)
  assert.equal(out.hasData, false)
})

test('trend가 null인 산출물도 받아들인다', () => {
  // 서버를 켠 지 3시간이 안 되면 정상적으로 null이다.
  const out = splitOverlayPayload({ visibility: { geojson: { type: 'FeatureCollection', features: [] } }, trend: null })
  assert.equal(out.trend, null)
  assert.equal(out.hasData, true)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/useFlightCategory.test.js`
Expected: FAIL — `splitOverlayPayload` 미노출

- [ ] **Step 3: 구현**

`useFlightCategory.js`의 `EMPTY_FC` 아래에 추가한다.

```js
/** 백엔드 꾸러미를 화면이 쓰는 조각들로 가른다. 자료가 없으면 빈 도형을 준다. */
export function splitOverlayPayload(data) {
  if (!data) {
    return { visibility: EMPTY_FC, ceiling: EMPTY_FC, stations: [], trend: null, sources: null, computedAt: null, hasData: false }
  }
  return {
    visibility: data.visibility?.geojson ?? EMPTY_FC,
    ceiling: data.ceiling?.geojson ?? EMPTY_FC,
    stations: data.stations ?? [],
    trend: data.trend ?? null,
    sources: data.sources ?? null,
    computedAt: data.computed_at ?? null,
    hasData: true,
  }
}
```

훅 본문을 바꾼다.

- `useState(EMPTY_FC)` → `useState(() => splitOverlayPayload(null))`
- 응답 성공 시 `setGeojson(data)` → `setState(splitOverlayPayload(data))`
- `return { geojson }` → `return state`

**503은 오류가 아니라 "아직 자료 없음"이다.** `res.ok`가 아니면 기존처럼 조용히 반환한다 — 이미 받아둔 자료가 있으면 그대로 두어 일시적 실패로 화면을 지우지 않고, 한 번도 못 받았으면 `hasData`가 거짓으로 남는다.

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/useFlightCategory.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/useFlightCategory.js frontend/src/features/weather-overlays/lib/useFlightCategory.test.js
git commit -m "feat(flight-category): split the new overlay payload in the data hook"
```

---

## Task 3: 말풍선 문구

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryPopup.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryPopup.test.js`

**Interfaces:**
- Consumes: Task 1의 `stationMarkerStyle`
- Produces: `formatPointLines(point) => Array<{ label, value, note, alert }>`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { formatPointLines } from './flightCategoryPopup.js'

const point = {
  vis_m: 4200, vis_band: 'below', ceil_ft: 1713, ceil_band: 'mid', vis_trend: -2100,
  nearest_station: { name: '청주', distance_km: 12.3, ceiling_ft: 1200, model_ceiling_ft: 1713, diff_ft: -513 },
}
const find = (p, label) => formatPointLines(p).find((l) => l.label === label)

test('운고는 100 ft 단위로 반올림하고 약을 붙인다', () => {
  // 모델 층 간격이 200~250 m라 1,713 ft라고 적으면 없는 정밀도를 주장하게 된다.
  assert.equal(find(point, '운고').value, '약 1,700 ft')
})

test('추세는 미터로 적는다', () => {
  // 스펙 §4.2가 정한 형식이다.
  assert.equal(find(point, '추세').value, '지난 3시간 −2,100 m')
})

test('시정에는 관측소 줄을 붙이지 않는다', () => {
  // 시정 격자가 이미 ASOS 관측을 객관분석한 결과물이라 중복이다(선행 스펙 §5.1).
  assert.equal(formatPointLines(point).filter((l) => l.note?.includes('청주')).length, 1)
  assert.equal(formatPointLines(point).findIndex((l) => l.note?.includes('청주')), 2)
})

test('관측소 줄에 거리를 항상 적는다', () => {
  assert.ok(formatPointLines(point).find((l) => l.note?.includes('청주')).note.includes('12.3 km'))
})

test('관측이 모델보다 낮으면 그 줄을 눈에 띄게 한다', () => {
  assert.equal(formatPointLines(point).find((l) => l.note?.includes('청주')).alert, true)
})

test('모델이 구름 없음이어도 관측이 높으면 눈에 띄게 하지 않는다', () => {
  // 지도의 테두리 규칙과 같아야 한다. 다르면 점은 조용한데 말풍선만 빨개진다.
  const p = { ...point, nearest_station: { name: '영천', distance_km: 97.7, ceiling_ft: 19358, model_ceiling_ft: null, diff_ft: null } }
  assert.equal(formatPointLines(p).find((l) => l.note?.includes('영천')).alert, false)
})

test('자료가 없는 줄은 자료 없음으로 적는다', () => {
  // 빈칸은 0이나 "문제없음"으로 읽힌다.
  const p = { vis_m: null, ceil_ft: null, vis_trend: null, nearest_station: null }
  assert.equal(find(p, '시정').value, '자료 없음')
  assert.equal(find(p, '운고').value, '자료 없음')
  assert.equal(find(p, '추세').value, '자료 없음')
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryPopup.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```js
import { stationMarkerStyle } from './flightCategoryStations.js'

const NO_DATA = '자료 없음'
const VIS_BAND_KO = { severe: '기준 크게 미달', below: '기준 미달', marginal: '여유 적음', clear: '기준 충족', missing: NO_DATA }

/** 모델 층 간격이 200~250 m다. 100 ft 단위로 낮춰 없는 정밀도를 주장하지 않는다. */
function ceilingText(ft) {
  if (!Number.isFinite(ft)) return NO_DATA
  return `약 ${(Math.round(ft / 100) * 100).toLocaleString('en-US')} ft`
}

export function formatPointLines(point) {
  const lines = [
    {
      label: '시정',
      value: Number.isFinite(point?.vis_m) ? `${point.vis_m.toLocaleString('en-US')} m` : NO_DATA,
      note: VIS_BAND_KO[point?.vis_band] ?? null,
      alert: false,
    },
    { label: '운고', value: ceilingText(point?.ceil_ft), note: '모델', alert: false },
  ]

  const stn = point?.nearest_station
  if (stn && Number.isFinite(stn.ceiling_ft)) {
    // 강조 여부를 지도 표식과 같은 함수로 정한다. 규칙을 두 벌 만들면
    // 점은 조용한데 말풍선만 빨개지는 어긋남이 생긴다.
    lines.push({
      label: '',
      value: `${stn.ceiling_ft.toLocaleString('en-US')} ft`,
      // 거리를 항상 적는다 — 멀면 그 값이 이 지점을 대표하지 못한다.
      note: `${stn.name} ${stn.distance_km} km`,
      alert: stationMarkerStyle(stn).ring,
    })
  }

  lines.push({
    label: '추세',
    value: Number.isFinite(point?.vis_trend)
      ? `지난 3시간 ${point.vis_trend > 0 ? '+' : '−'}${Math.abs(point.vis_trend).toLocaleString('en-US')} m`
      : NO_DATA,
    note: null,
    alert: false,
  })

  return lines
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryPopup.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryPopup.js frontend/src/features/weather-overlays/lib/flightCategoryPopup.test.js
git commit -m "feat(flight-category): point popup lines with shared alert rule"
```

---

## Task 4: 지도 층과 배선 — 한 커밋에

**이 태스크를 쪼개면 빌드가 깨진 커밋이 남는다.** `MapView.jsx:85-88`이 `addFlightCategoryLayer`, `bindFlightCategoryClick`, `removeFlightCategoryLayer`, `syncFlightCategoryLayer` 넷을 이름으로 import하고, `:1195`·`:1514`·`:1519`·`:1541` 네 곳에서 쓴다. 레이어 모듈만 먼저 바꾸면 ESM 이름 불일치로 앱이 통째로 안 뜬다. 그래서 모듈 교체와 배선을 함께 한다.

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/flightCategoryLayers.js` (전면 교체)
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryLayers.test.js` (신설)
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:161`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/map/layerActions.js:37`
- Modify: `frontend/src/features/map/MapView.jsx`

**Interfaces:**
- Consumes: Task 1 `toStationFeatures`, Task 3 `formatPointLines`
- Produces: `syncFlightCategoryLayers(map, { visibility, ceiling, stations, showVisibility, showCeiling, showMissing, showStations, beforeLayerId })`, `removeFlightCategoryLayers(map)`, `bindFlightCategoryClick(map, popupRef)`, `filterMissing(fc, showMissing)`, `FC_VIS_LAYER`

- [ ] **Step 1: 결측 걸러내기 시험 먼저**

이 모듈에서 브라우저 없이 시험할 수 있는 것은 `filterMissing`뿐이다.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { filterMissing } from './flightCategoryLayers.js'

const fc = { type: 'FeatureCollection', features: [
  { properties: { band: 'severe' } }, { properties: { band: 'missing' } } ] }

test('꺼져 있으면 결측 밴드를 뺀다', () => {
  assert.deepEqual(filterMissing(fc, false).features.map((f) => f.properties.band), ['severe'])
})
test('켜져 있으면 그대로 둔다', () => {
  assert.equal(filterMissing(fc, true).features.length, 2)
})
test('값을 안 넘기면 빼는 쪽이 기본이다', () => {
  // 스펙 §3.4 기본 꺼짐. 실수로 빠뜨려도 안전한 쪽으로 떨어진다.
  assert.equal(filterMissing(fc).features.length, 1)
})
```

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryLayers.test.js`
Expected: FAIL — `filterMissing` 미노출

- [ ] **Step 2: 레이어 모듈 교체**

`flightCategoryLayers.js`를 아래로 통째로 바꾼다.

```js
import mapboxgl from 'mapbox-gl'
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import { toStationFeatures } from './flightCategoryStations.js'
import { formatPointLines } from './flightCategoryPopup.js'

export const FC_VIS_SOURCE = 'flight-category-vis-source'
export const FC_CEIL_SOURCE = 'flight-category-ceil-source'
export const FC_STATION_SOURCE = 'flight-category-station-source'

export const FC_VIS_LAYER = 'flight-category-vis-fill'
export const FC_CEIL_FILL_LAYER = 'flight-category-ceil-fill'
export const FC_CEIL_LINE_LAYER = 'flight-category-ceil-line'
export const FC_STATION_LAYER = 'flight-category-station'

// addLayer(def, before)는 before 바로 앞에 끼운다. 넷을 같은 before로 넣으면
// 최종 순서는 넣은 순서가 된다 — 아래 배열 순서가 곧 z축 순서다.
export const FC_LAYER_IDS = [FC_VIS_LAYER, FC_CEIL_FILL_LAYER, FC_CEIL_LINE_LAYER, FC_STATION_LAYER]
export const FC_SOURCE_IDS = [FC_VIS_SOURCE, FC_CEIL_SOURCE, FC_STATION_SOURCE]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

// 지점 색은 면과 같은 색판을 쓴다 — 점과 주변 면의 색이 다르면 그 자체가 불일치 신호다.
const STATION_FILL = ['match', ['get', 'fill'], 'severe', '#dc2626', 'caution', '#f97316', 'rgba(0,0,0,0)']
// ['get']을 조건으로 쓸 때는 boolean으로 감싼다 — 속성이 없으면 표현식이 던진다.
const HAS_RING = ['boolean', ['get', 'ring'], false]

function ensure(map, beforeLayerId) {
  const before = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined
  for (const id of FC_SOURCE_IDS) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC })
  }
  const add = (def) => { if (!map.getLayer(def.id)) map.addLayer(def, before) }

  // 시정은 면을 채운다.
  add({ id: FC_VIS_LAYER, type: 'fill', source: FC_VIS_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 } })
  // 운고는 시정과 같은 빨강·주황을 쓴다. 겹쳐 켜면 구분이 안 되므로 색을 바꾸지 않고
  // 그리는 방식을 달리한다 — 안쪽은 아주 옅게, 경계는 굵게.
  add({ id: FC_CEIL_FILL_LAYER, type: 'fill', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 } })
  add({ id: FC_CEIL_LINE_LAYER, type: 'line', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 } })
  add({ id: FC_STATION_LAYER, type: 'circle', source: FC_STATION_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 6,
      'circle-color': STATION_FILL,
      'circle-stroke-width': ['case', HAS_RING, 3, 1.5],
      'circle-stroke-color': ['case', HAS_RING, '#dc2626', '#334155'],
    } })
}

/** 결측 밴드는 시정 도형 안에 들어 있다. 별도 층을 만들지 않고 걸러낸다. */
export function filterMissing(fc, showMissing = false) {
  if (showMissing) return fc
  return { ...fc, features: (fc?.features ?? []).filter((f) => f.properties?.band !== 'missing') }
}

export function syncFlightCategoryLayers(map, {
  visibility, ceiling, stations, showVisibility, showCeiling, showMissing, showStations, beforeLayerId,
}) {
  ensure(map, beforeLayerId)
  map.getSource(FC_VIS_SOURCE)?.setData(filterMissing(visibility || EMPTY_FC, showMissing))
  map.getSource(FC_CEIL_SOURCE)?.setData(ceiling || EMPTY_FC)
  map.getSource(FC_STATION_SOURCE)?.setData(toStationFeatures(stations))

  setMapLayerVisible(map, FC_VIS_LAYER, !!showVisibility)
  setMapLayerVisible(map, FC_CEIL_FILL_LAYER, !!showCeiling)
  setMapLayerVisible(map, FC_CEIL_LINE_LAYER, !!showCeiling)
  // 지점은 견줄 면이 있어야 뜻이 있다.
  setMapLayerVisible(map, FC_STATION_LAYER, !!showStations && (!!showVisibility || !!showCeiling))
}

export function removeFlightCategoryLayers(map) {
  try {
    for (const id of FC_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of FC_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id)
  } catch {}
}

export function bindFlightCategoryClick(map, popupRef) {
  async function handleClick(e) {
    const { lat, lng } = e.lngLat
    let point = null
    try {
      const res = await fetch(`/api/weather/flight-category-overlay/point?lat=${lat}&lon=${lng}`)
      if (res.ok) point = await res.json()
    } catch { /* 일시적 오류 — 아래에서 자료 없음으로 그린다 */ }

    const rows = formatPointLines(point).map((l) => `
      <div style="display:flex;gap:8px;font-size:12px;line-height:1.7;${l.alert ? 'color:#dc2626;font-weight:700' : 'color:#1e293b'}">
        <span style="width:34px;color:#64748b;font-weight:600">${l.label}</span>
        <span>${l.value}</span>
        ${l.note ? `<span style="color:#64748b">${l.note}</span>` : ''}
      </div>`).join('')

    popupRef.current?.remove()
    popupRef.current = new mapboxgl.Popup({ closeButton: true, offset: 8, maxWidth: '260px' })
      .setLngLat(e.lngLat).setHTML(`<div style="font-family:'Noto Sans KR',sans-serif;padding:2px 0">${rows}</div>`)
      .addTo(map)
  }
  const onEnter = () => { map.getCanvas().style.cursor = 'pointer' }
  const onLeave = () => { map.getCanvas().style.cursor = '' }
  map.on('click', FC_VIS_LAYER, handleClick)
  map.on('mouseenter', FC_VIS_LAYER, onEnter)
  map.on('mouseleave', FC_VIS_LAYER, onLeave)
  return () => {
    map.off('click', FC_VIS_LAYER, handleClick)
    map.off('mouseenter', FC_VIS_LAYER, onEnter)
    map.off('mouseleave', FC_VIS_LAYER, onLeave)
    popupRef.current?.remove()
  }
}
```

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryLayers.test.js`
Expected: PASS (3 tests)

- [ ] **Step 3: 레이어 목록 교체**

`weatherOverlayLayers.js:161`의 `flightCategory` 한 줄을 두 줄로 바꾼다.

```js
  { id: 'visibility', label: '시정', color: '#f97316' },
  { id: 'ceiling', label: '운고', color: '#dc2626' },
```

이 배열이 `MET_ACTIONS`(`layerActions.js:39`)와 `initMetVisibility()`(`MapView.jsx:160`)의 원본이라 둘이 함께 따라온다. 다른 소비처는 id를 가리지 않는다 — 확인 완료.

- [ ] **Step 4: 패널 수정**

`WeatherOverlayPanel.jsx`

- `TEMP_HIDDEN_LAYER_IDS`를 `[]`로 바꾸고 그 위 주석 두 줄을 지운다. 백엔드 수집이 재개됐다.
- `nwp` 그룹 `ids`에서 `'flightCategory'`를 빼고 `'visibility', 'ceiling'`을 넣는다.
- `layerLabels`에서 `flightCategory` 줄을 지우고 `visibility: '시정'`, `ceiling: '운고'`를 넣는다.
- **`WEATHER_TILE_ICON`(`:9-29`)에도 두 항목을 넣는다.** 빠뜨리면 두 타일만 아이콘 없이 렌더된다. 시정은 `Eye`, 운고는 `CloudFog`를 쓴다(둘 다 lucide-react에 있다). import 목록에 추가한다.

- [ ] **Step 5: 음성 명령 별칭**

`layerActions.js:37`의 한 줄을 두 줄로 바꾼다.

```js
  visibility: { label: '시정', aliases: ['시정', 'visibility', '가시거리'] },
  ceiling: { label: '운고', aliases: ['운고', 'ceiling', '운저'] },
```

- [ ] **Step 6: MapView 배선 — 네 자리 모두**

`:85-88` import를 바꾼다.

```js
  syncFlightCategoryLayers,
  removeFlightCategoryLayers,
  bindFlightCategoryClick,
```

`:1195`의 `addFlightCategoryLayer(map, AIRPORT_CIRCLE_LAYER)` **줄을 지운다.** 새 모듈의 `ensure()`가 첫 동기화 때 소스와 레이어를 만든다.

`:538`의 훅 호출을 `const flightCategory = useFlightCategory()`로 바꾼다.

하위 옵션 상태를 다른 `useState` 옆(`:373` 근처)에 만든다. **결측 꺼짐, 지점 켜짐**이 스펙 §3.4다.

```js
  const [showFlightCategoryMissing, setShowFlightCategoryMissing] = useState(false)
  const [showFlightCategoryStations, setShowFlightCategoryStations] = useState(true)
```

`:1512-1519`의 동기화를 바꾼다. **위 구분선 주석 줄은 건드리지 않는다.**

```js
  useWeatherFieldOverlay(mapRef, isStyleReady, styleRevision, (map) => {
    syncFlightCategoryLayers(map, {
      visibility: flightCategory.visibility,
      ceiling: flightCategory.ceiling,
      stations: flightCategory.stations,
      showVisibility: !!metVisibility.visibility,
      showCeiling: !!metVisibility.ceiling,
      showMissing: showFlightCategoryMissing,
      showStations: showFlightCategoryStations,
      beforeLayerId: AIRPORT_CIRCLE_LAYER,
    })
  }, removeFlightCategoryLayers, [
    flightCategory.visibility, flightCategory.ceiling, flightCategory.stations,
    metVisibility.visibility, metVisibility.ceiling,
    showFlightCategoryMissing, showFlightCategoryStations,
  ])
```

`:1541`의 `bindFlightCategoryClick(map, fcPopupRef)`는 **시그니처가 같으므로 그대로 둔다.**

`:841-842`의 시각 항목 등록에서 `metVisibility.flightCategory`를 쓰는 줄과 `:862-863` 의존성 배열의 같은 이름은 Task 5에서 손댄다. 이 태스크에서는 **`metVisibility.visibility`로만 바꿔 깨지지 않게** 해둔다.

- [ ] **Step 7: 남은 참조 확인**

Run: `cd frontend && grep -rniE "flightcategory|flight-category" src/ verification/ | grep -viE "flightCategoryStations|flightCategoryLayers|flightCategoryPopup|useFlightCategory|showFlightCategory|flight-category-overlay|FC_"`
Expected: 결과 없음. 남으면 그 자리를 고친다. **대소문자를 가리지 않는 `-i`가 중요하다** — `addFlightCategoryLayer` 같은 이름은 소문자 검색으로는 안 잡힌다.

- [ ] **Step 8: 전체 회귀와 앱 기동**

Run: `cd frontend && npm test`
Expected: 기존 시험 전부 통과 + 새 시험.

Run: `cd frontend && npx vite build`
Expected: 성공. ESM 이름 불일치가 남아 있으면 여기서 잡힌다.

- [ ] **Step 9: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryLayers.js frontend/src/features/weather-overlays/lib/flightCategoryLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/layerActions.js frontend/src/features/map/MapView.jsx
git commit -m "feat(flight-category): three map layers wired as visibility and ceiling toggles"
```

---

## Task 5: 범례와 층별 시각

**범례는 `WeatherLegends.jsx`다.** `WeatherLayerTimestampBar`는 시각을 **한 번에 하나씩** 보여주는 캐러셀이라(`:7` `validEntries`, `:8` `selectedKey`) 색 범례나 체크박스를 넣을 곳이 아니다. 체크박스 선례가 이미 있다 — 낙뢰 범례의 `blinkLightning` / `onBlinkLightningChange`(`WeatherLegends.jsx:43-44`, `:170-177`)가 `<button aria-pressed>`로 되어 있다. 같은 모양을 쓴다.

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryLegend.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryLegend.test.js`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`

**Interfaces:**
- Produces: `legendStamps(sources, hasData, computedAt, tz) => { visibility, ceiling, stations, stationCount }`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { legendStamps } from './flightCategoryLegend.js'

const sources = { kim: { run: '2026080106', hf: 0 }, stations: { asos: 4, amos: 1, tm: '202608012200' } }

test('층마다 다른 시각을 준다', () => {
  // 시정 20분, 운고 하루 네 번, 지점 매시. 하나로 뭉치면 여섯 시간 묵은
  // 운고를 방금 것으로 착각한다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.notEqual(out.visibility, out.ceiling)
  assert.notEqual(out.ceiling, out.stations)
})

test('세 시각이 같은 시간대로 나온다', () => {
  // computed_at은 UTC, kim.run도 UTC, stations.tm은 KST다. 그대로 늘어놓으면
  // 9시간 어긋난 값이 나란히 보인다.
  const out = legendStamps(sources, true, '2026-08-01T15:22:13.722Z', 'Asia/Seoul')
  assert.equal(out.visibility, '00:22')   // 15:22Z = 익일 00:22 KST
  assert.equal(out.ceiling, '15:00')      // 2026080106Z = 15:00 KST
  assert.equal(out.stations, '22:00')     // 이미 KST
})

test('자료를 한 번도 못 받았으면 자료 없음이다', () => {
  const out = legendStamps(null, false, null, 'Asia/Seoul')
  assert.equal(out.visibility, '자료 없음')
  assert.equal(out.ceiling, '자료 없음')
  assert.equal(out.stations, '자료 없음')
})

test('지점 수를 센다', () => {
  // 맑은 날 97곳 중 4곳뿐인 것이 정상이다. 숫자가 없으면 고장으로 오해한다.
  assert.equal(legendStamps(sources, true, null, 'Asia/Seoul').stationCount, 5)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryLegend.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

```js
const NO_DATA = '자료 없음'

function hhmmInTz(date, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

/** `YYYYMMDDHH[mm]`(UTC)를 Date로. 형식이 아니면 null. */
function parseUtcTm(tm) {
  if (typeof tm !== 'string' || tm.length < 10) return null
  return new Date(Date.UTC(
    +tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8),
    +tm.slice(8, 10), tm.length >= 12 ? +tm.slice(10, 12) : 0))
}

/**
 * 층별 기준 시각. 갱신 주기가 서로 달라 하나로 합치면 안 된다 —
 * 시정 20분, 운고 하루 네 번, 관측지점 매시.
 *
 * 세 값의 원래 시간대가 다르다: computed_at은 UTC(ISO), kim.run은 UTC,
 * stations.tm은 KST. 모두 tz로 맞춰 내보낸다.
 */
export function legendStamps(sources, hasData, computedAt, tz = 'Asia/Seoul') {
  if (!hasData) return { visibility: NO_DATA, ceiling: NO_DATA, stations: NO_DATA, stationCount: 0 }

  const visDate = computedAt ? new Date(computedAt) : null
  const kimDate = parseUtcTm(sources?.kim?.run)
  const stnTm = sources?.stations?.tm
  // 관측 시각만 이미 KST다. UTC로 되돌린 뒤 같은 경로로 형식을 맞춘다.
  const stnDate = stnTm ? new Date((parseUtcTm(stnTm)?.getTime() ?? NaN) - 9 * 3600 * 1000) : null

  const fmt = (d) => (d && !Number.isNaN(d.getTime()) ? hhmmInTz(d, tz) : NO_DATA)
  return {
    visibility: fmt(visDate),
    ceiling: fmt(kimDate),
    stations: fmt(stnDate),
    stationCount: (sources?.stations?.asos ?? 0) + (sources?.stations?.amos ?? 0),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/flightCategoryLegend.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 범례 블록 추가**

`WeatherLegends.jsx`의 props 목록에 넣는다(낙뢰 블록 바로 아래에 렌더).

```jsx
  flightCategoryLegendVisible = false,
  flightCategoryBands = [],
  flightCategoryStationCount = 0,
  showFlightCategoryMissing = false,
  onShowFlightCategoryMissingChange,
  showFlightCategoryStations = true,
  onShowFlightCategoryStationsChange,
```

렌더 블록. `HLegend`가 이미 `note`를 받으므로 안내 문구는 그쪽에 넘긴다.

```jsx
      {flightCategoryLegendVisible && (
        <div className="flight-category-legend" aria-label="Flight category legend">
          <HLegend title="시정" entries={flightCategoryBands} note="색 없음 = 기준 충족 또는 자료 없음" />
          <button type="button" aria-pressed={showFlightCategoryMissing}
            onClick={() => onShowFlightCategoryMissingChange?.((prev) => !prev)}>
            자료없음 표시 {showFlightCategoryMissing ? 'ON' : 'OFF'}
          </button>
          <button type="button" aria-pressed={showFlightCategoryStations}
            onClick={() => onShowFlightCategoryStationsChange?.((prev) => !prev)}>
            관측지점 {flightCategoryStationCount}곳
          </button>
        </div>
      )}
```

`MapView.jsx:1697`의 `<WeatherLegends …>`에 위 props를 넘긴다. `flightCategoryLegendVisible`은 `metVisibility.visibility || metVisibility.ceiling`, `flightCategoryBands`는 `[{ label: '3 km 미만', color: '#dc2626' }, { label: '3~5 km', color: '#f97316' }, { label: '5~7 km', color: '#fde047' }]`. `HLegend`가 기대하는 entry 모양을 그 파일에서 확인해 맞춘다.

- [ ] **Step 6: 시각 항목 연결**

`MapView.jsx:841` 근처에서 시정과 운고를 각각 등록한다.

```js
    const fcStamps = legendStamps(flightCategory.sources, flightCategory.hasData, flightCategory.computedAt, tz)
    if (metVisibility.visibility)
      entries.push({ key: 'visibility', label: '시정', issueLabel: fcStamps.visibility })
    if (metVisibility.ceiling)
      entries.push({ key: 'ceiling', label: '운고', issueLabel: fcStamps.ceiling })
    if (showFlightCategoryStations && (metVisibility.visibility || metVisibility.ceiling))
      entries.push({ key: 'fcStations', label: '관측지점', issueLabel: fcStamps.stations })
```

의존성 배열(`:862-863`)에서 `metVisibility.flightCategory`와 `flightCategoryIssueLabel`을 빼고 `metVisibility.visibility`, `metVisibility.ceiling`, `flightCategory.sources`, `flightCategory.hasData`, `flightCategory.computedAt`, `showFlightCategoryStations`를 넣는다.

`weatherOverlayModel.js:153`의 `flightCategoryGeojson` 인자와 `:349`의 `flightCategoryIssueLabel`을 지우고, 그 이름을 쓰던 자리를 모두 고친다. 층별 시각이 대신한다.

- [ ] **Step 7: 회귀와 커밋**

Run: `cd frontend && npm test && npx vite build`

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryLegend.js frontend/src/features/weather-overlays/lib/flightCategoryLegend.test.js frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/map/MapView.jsx
git commit -m "feat(flight-category): legend swatches, sub-options, per-layer timestamps"
```

---

## Task 6: 브라우저 검증

**Files:**
- Create: `frontend/verification/contracts/flight-category-overlay.spec.mjs`

- [ ] **Step 1: 이웃 계약을 먼저 읽는다**

`frontend/verification/contracts/` 안의 기존 `*.spec.mjs` 하나(예: `echo-top.spec.mjs`)를 열어 **앱을 띄우고 레이어 패널을 여는 방법**을 그대로 따른다. `page.goto('/')`만으로는 패널이 열리지 않는다. 자료는 `playwright.config.js:37`이 이미 `DISABLE_COLLECTION: '1'`로 고정한다.

- [ ] **Step 2: 산출물에 무엇이 들어 있는지 확인**

```bash
cd backend && node --input-type=module -e "
import fs from 'node:fs'
const d=JSON.parse(fs.readFileSync('./data/flight_category_overlay/latest.json','utf8'))
console.log('시정 밴드:', d.visibility.geojson.features.map(f=>f.properties.band).join(','))
console.log('운고 밴드:', d.ceiling.geojson.features.map(f=>f.properties.band).join(','))
console.log('지점:', d.stations.length, '| 테두리 대상:', d.stations.filter(s=>s.model_ceiling_ft===null?s.ceiling_ft<2953:s.ceiling_ft<s.model_ceiling_ft-200).length)
console.log('추세:', d.trend ? '있음' : 'null')
"
```

- [ ] **Step 3: 계약 작성**

`frontend/verification/contracts/flight-category-overlay.spec.mjs` — 스펙 §6의 다섯 가지. 하위 옵션은 체크박스가 아니라 `<button aria-pressed>`다(낙뢰 선례와 같은 모양).

```js
import { test, expect } from '@playwright/test'
// 앱 기동과 패널 열기는 이웃 계약의 헬퍼를 그대로 쓴다.

test('시정을 켜면 면이 나오고 끄면 사라진다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  await expect(page.locator('canvas')).toHaveScreenshot('vis-on.png')
  await page.getByRole('button', { name: '시정' }).click()
  await expect(page.locator('canvas')).toHaveScreenshot('vis-off.png')
})

test('운고는 윤곽선으로 나오고 시정과 구분된다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  await page.getByRole('button', { name: '운고' }).click()
  await expect(page.locator('canvas')).toHaveScreenshot('vis-and-ceil.png')
})

test('자료없음 표시는 기본이 꺼짐이다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  const missing = page.getByRole('button', { name: /자료없음 표시/ })
  await expect(missing).toHaveAttribute('aria-pressed', 'false')
  await missing.click()
  await expect(page.locator('canvas')).toHaveScreenshot('missing-on.png')
})

test('관측지점은 기본이 켜짐이고 개수를 적는다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  const stations = page.getByRole('button', { name: /관측지점/ })
  await expect(stations).toHaveAttribute('aria-pressed', 'true')
  await expect(stations).toHaveText(/관측지점 \d+곳/)
})

test('지도를 누르면 말풍선이 뜬다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  await page.locator('canvas').click({ position: { x: 400, y: 300 } })
  await expect(page.getByText('추세')).toBeVisible()
})
```

- [ ] **Step 4: 돌리고 눈으로 확인**

Run: `cd frontend && npx playwright test flight-category-overlay --project=desktop`

기준 이미지는 처음에 `--update-snapshots`로 만들고 **열어서 눈으로 확인한 뒤** 커밋한다. 화면이 비었는데 통과하는 일이 없도록 면·윤곽선·점이 실제로 보이는지 본다. `--project=desktop`을 빼면 세 화면 모두 기준 이미지가 생기며, 모바일은 패널이 `MobileSheet`라 선택자가 다를 수 있다.

- [ ] **Step 5: 확인 못 한 것을 적는다**

Step 2에서 "테두리 대상"이 0이었으면 **빨간 테두리는 화면으로 확인되지 않은 것이다.** Task 1의 시험이 규칙을 못 박고 있으나 화면 확인은 아니다. **확인했다고 적지 않는다.** 실제 불일치가 나오는 날 다시 본다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/verification/contracts/flight-category-overlay.spec.mjs frontend/verification/contracts/flight-category-overlay.spec.mjs-snapshots
git commit -m "test(flight-category): browser contract for the two overlay layers"
```

---

## 후속 (이번 범위 밖)

- **운고 밴드 정의를 백엔드에서 받아 쓰기** — Task 1이 450 m/900 m 경계를 피트로 다시 계산한다. 값은 지금 백엔드 `CEILING_BANDS`와 정확히 같지만 정의가 두 곳에 있다. 백엔드가 `stations[]`에 `band`를 실어 보내면 한 곳으로 줄어든다. 백엔드 한 줄 작업이다.
- **운고 층 구간 표시** — 선행 스펙 §5.2가 원하는 "950~975 hPa 사이" 형태. 백엔드가 어느 층에서 임계값을 넘었는지 저장해야 한다.
- **빨간 테두리 화면 확인** — 모델과 관측이 실제로 어긋나는 날.
- **모바일 화면 확인** — 패널이 `MobileSheet`라 선택자와 배치가 다르다.
