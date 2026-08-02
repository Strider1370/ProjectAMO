# flight_category 프론트 표출 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 백엔드가 내보내는 시정·운고·관측지점·추세를 지도에 올린다. 새 레이어를 만드는 것이 아니라 이미 물려 있는 `flightCategory` 레이어를 새 자료 모양에 맞춘다.

**Architecture:** 기존 두 파일(`useFlightCategory.js`, `flightCategoryLayers.js`)을 고쳐 쓴다. 자료 가져오는 훅이 꾸러미를 갈라 반환하고, 레이어 모듈이 층 하나를 셋(시정 면·운고 면·관측지점)으로 늘린다. 패널 토글 하나를 둘로 쪼갠다. 지점 표식 판정처럼 순수 계산인 부분은 별도 모듈로 떼어 브라우저 없이 시험한다.

**Tech Stack:** React, mapbox-gl, Vitest(`npx vitest`), Playwright(`npx playwright`).

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-02-flight-category-frontend-design.md`. 스펙에 없는 사용자 영향 결정을 새로 만들지 않는다.
- 선행 스펙: `docs/superpowers/specs/2026-08-01-flight-category-redesign-design.md`. 백엔드는 `325fa24`에서 완료됐다.
- **병렬 세션이 `frontend/src/features/terminal/*` 와 여러 미추적 문서를 잡고 있다. `git add -A` / `git add .` 금지. 각 태스크가 지정한 파일만 스테이징한다.** 커밋 전 `git branch --show-current`가 `main`인지 확인한다.
- **`MapView.jsx`의 구분선 주석은 물음표로 깨져 있다**(예: `// ???? Sync flight category overlay ????`). 파일 자체는 UTF-8 정상이고 장식 문자만 손상된 것이다. **복구하려 들지 말고 그 줄을 건드리지 않는다.** 한글을 새로 넣을 때는 [encoding-safety](../policies/encoding-safety.md)를 따른다.
- 색은 백엔드가 도형에 실어 보낸다. 프론트에서 밴드 색을 새로 정의하지 않는다 — `['get', 'color']`를 쓴다.
- 자료 없음을 "기준 충족"으로 보이게 하지 않는다. 빈 화면·빈칸으로 두지 않고 "자료 없음"이라고 적는다.
- 기본 표시 상태는 `initMetVisibility()`가 정한다(`MapView.jsx:159`). 레이더만 켜짐이고 나머지 기상 레이어는 꺼짐 — 새 토글도 이 관례를 따른다.
- 단위 시험은 파일 옆에 `*.test.js`, Vitest. 브라우저 검증은 Playwright이며 임베디드 미리보기는 증거가 아니다([browser-verification](../policies/verification/browser-verification.md)).

## 백엔드가 실제로 주는 것 (2026-08-02 실측)

`GET /api/weather/flight-category-overlay`

```json
{
  "type": "flight_category_overlay",
  "fetched_at": "2026-08-01T15:22:13.722Z",
  "computed_at": "2026-08-01T15:22:13.722Z",
  "visibility": { "geojson": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "properties": { "band": "severe", "color": "#dc2626" }, "geometry": {} }
  ] } },
  "ceiling": { "geojson": { "type": "FeatureCollection", "features": [
    { "type": "Feature", "properties": { "band": "low", "color": "#dc2626" }, "geometry": {} }
  ] } },
  "query_grid": { "width": 128, "height": 128, "vis": [], "ceil_ft": [] },
  "stations": [
    { "id": "amos_RKSI", "name": "인천국제공항", "source": "AMOS",
      "lat": 37.46, "lon": 126.44,
      "ceiling_ft": 2953, "model_ceiling_ft": null, "diff_ft": null }
  ],
  "trend": { "hours": 3, "vis_delta": [] },
  "sources": {
    "kim": { "run": "2026080106", "hf": 0 },
    "ctps": { "frame_tm": "202608012320" },
    "missing_ratio": 0.8184158683270131,
    "stations": { "asos": 0, "amos": 1, "tm": "202608012200" }
  }
}
```

- 시정 밴드: `severe` / `below` / `marginal` / `missing`. `clear`는 도형을 만들지 않는다.
- 운고 밴드: `low` / `mid`. 900 m 초과는 도형을 만들지 않는다.
- `stations`가 빈 배열인 것은 정상이다 — 맑으면 보고 지점이 없다.
- `trend`가 `null`인 것도 정상이다 — 서버를 켠 지 3시간이 안 됐을 때.
- 산출물이 없으면 이 엔드포인트는 **503**을 준다(빈 200이 아니다).

`GET /api/weather/flight-category-overlay/point?lat=&lon=`

```json
{ "lat": 35.1, "lon": 129.03, "vis_m": 29500, "vis_band": "clear",
  "ceil_ft": null, "ceil_band": "missing", "vis_trend": 7600,
  "nearest_station": { "id": "asos_281", "name": "영천", "source": "ASOS",
    "distance_km": 97.7, "ceiling_ft": 19358, "model_ceiling_ft": null, "diff_ft": null } }
```

격자 밖이면 **400** `{"error":"out of domain"}`.

## 파일 구조

| 파일 | 책임 |
|---|---|
| `lib/flightCategoryStations.js` (신설) | 지점 표식 판정 — 순수 계산. 브라우저 없이 시험한다. |
| `lib/useFlightCategory.js` (수정) | 꾸러미를 받아 시정·운고·지점·출처로 갈라 반환 |
| `lib/flightCategoryLayers.js` (수정) | 지도 층 셋을 만들고 켜고 끈다. 말풍선. |
| `weather-overlays/WeatherOverlayPanel.jsx` (수정) | 토글 둘, 임시 숨김 제거 |
| `lib/weatherOverlayLayers.js` (수정) | `MET_LAYERS`에 `visibility`·`ceiling` 추가 |
| `map/layerActions.js` (수정) | 음성 명령 별칭 둘로 분리 |
| `map/MapView.jsx` (수정) | 훅 반환값을 레이어 동기화에 연결 |

---

## Task 1: 지점 표식 판정

지도와 무관한 순수 계산이라 먼저 만들고 브라우저 없이 못 박는다. 스펙 §3.3의 표가 그대로 시험이 된다.

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryStations.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryStations.test.js`

**Interfaces:**
- Produces: `stationMarkerStyle(station) => { fill: 'severe'|'caution'|'none', ring: boolean }`, `toStationFeatures(stations) => FeatureCollection`

- [ ] **Step 1: 실패하는 테스트 작성**

`flightCategoryStations.test.js`

```js
import { describe, it, expect } from 'vitest'
import { stationMarkerStyle, toStationFeatures } from './flightCategoryStations.js'

const stn = (over) => ({
  id: 'asos_1', name: '시험', source: 'ASOS', lat: 37, lon: 127,
  ceiling_ft: 1000, model_ceiling_ft: 2000, diff_ft: -1000, ...over,
})

describe('stationMarkerStyle', () => {
  it('색은 관측 운고 밴드를 따른다', () => {
    // 450 m = 1476 ft, 900 m = 2953 ft
    expect(stationMarkerStyle(stn({ ceiling_ft: 1000 })).fill).toBe('severe')
    expect(stationMarkerStyle(stn({ ceiling_ft: 2000 })).fill).toBe('caution')
    expect(stationMarkerStyle(stn({ ceiling_ft: 5000 })).fill).toBe('none')
  })

  it('한 밴드 이상 낮고 200 ft를 넘으면 테두리를 붙인다', () => {
    expect(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })).ring).toBe(true)
  })

  it('밴드는 달라도 차이가 작으면 붙이지 않는다', () => {
    // 1470 ft = low, 1480 ft = mid. 경계선을 살짝 걸친 것뿐이다.
    expect(stationMarkerStyle(stn({ ceiling_ft: 1470, model_ceiling_ft: 1480 })).ring).toBe(false)
  })

  it('모델이 더 보수적이면 붙이지 않는다', () => {
    expect(stationMarkerStyle(stn({ ceiling_ft: 2000, model_ceiling_ft: 1200 })).ring).toBe(false)
  })

  it('모델이 구름 없음인데 관측이 900 m 미만이면 붙인다', () => {
    expect(stationMarkerStyle(stn({ ceiling_ft: 1200, model_ceiling_ft: null, diff_ft: null })).ring).toBe(true)
  })

  it('모델이 구름 없음이어도 관측이 900 m 이상이면 붙이지 않는다', () => {
    // 어긋난 것은 맞지만 운항에 걸리는 높이가 아니다. 붙이면 경고가 흔해진다.
    expect(stationMarkerStyle(stn({ ceiling_ft: 5000, model_ceiling_ft: null, diff_ft: null })).ring).toBe(false)
  })
})

describe('toStationFeatures', () => {
  it('빈 목록도 유효한 FeatureCollection을 만든다', () => {
    const fc = toStationFeatures([])
    expect(fc.type).toBe('FeatureCollection')
    expect(fc.features).toEqual([])
  })

  it('좌표와 표식 속성을 실어 보낸다', () => {
    const [f] = toStationFeatures([stn({ ceiling_ft: 1200, model_ceiling_ft: 2000 })]).features
    expect(f.geometry.coordinates).toEqual([127, 37])
    expect(f.properties.fill).toBe('severe')
    expect(f.properties.ring).toBe(true)
    expect(f.properties.name).toBe('시험')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryStations.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`flightCategoryStations.js`

```js
// 운고 밴드 경계는 백엔드 CEILING_BANDS와 같은 값(450 m, 900 m)을 피트로 환산한 것이다.
// 미터 값을 피트와 그대로 비교하면 300 m(984 ft) 운고가 안전한 것으로 뒤집힌다.
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

/**
 * 지점 표식의 색과 테두리.
 *
 * 테두리는 "화면이 실제보다 안전해 보이는" 경우에만 붙인다. 모델이 더 보수적인
 * 방향은 안전 문제가 아니므로 붙이지 않는다.
 */
export function stationMarkerStyle(station) {
  const obs = station?.ceiling_ft
  const model = station?.model_ceiling_ft
  const obsBand = band(obs)
  const fill = FILL_BY_BAND[obsBand]

  // 모델이 "구름 없음"이면 차이를 계산할 수 없다. 관측이 운항에 걸리는 높이일 때만 붙인다.
  if (!Number.isFinite(model)) {
    return { fill, ring: obsBand === 'low' || obsBand === 'mid' }
  }

  const modelBand = band(model)
  const order = { low: 0, mid: 1, high: 2, missing: 3 }
  const lowerByBand = order[obsBand] < order[modelBand]
  return { fill, ring: lowerByBand && model - obs > RING_MIN_DIFF_FT }
}

export function toStationFeatures(stations) {
  return {
    type: 'FeatureCollection',
    features: (stations ?? []).map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
      properties: {
        id: s.id,
        name: s.name,
        source: s.source,
        ceiling_ft: s.ceiling_ft,
        model_ceiling_ft: s.model_ceiling_ft,
        ...stationMarkerStyle(s),
      },
    })),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryStations.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryStations.js frontend/src/features/weather-overlays/lib/flightCategoryStations.test.js
git commit -m "feat(flight-category): station marker styling rules"
```

---

## Task 2: 자료 가져오기

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/useFlightCategory.js`
- Test: `frontend/src/features/weather-overlays/lib/useFlightCategory.test.js` (신설)

**Interfaces:**
- Produces: `useFlightCategory() => { visibility, ceiling, stations, trend, sources, computedAt, hasData }`
  - `visibility` / `ceiling`: FeatureCollection. 자료가 없으면 features가 빈 배열.
  - `stations`: 배열. `trend`: 객체 또는 `null`. `sources`: 객체 또는 `null`.
  - `computedAt`: ISO 문자열 또는 `null`. **Task 6의 `legendStamps`가 시정 층 시각으로 쓴다.**
  - `hasData`: 산출물을 한 번이라도 받았는지. 범례가 "자료 없음"을 띄울지 판단한다.
- Consumes: 없음

- [ ] **Step 1: 실패하는 테스트 작성**

훅 전체가 아니라 응답을 가르는 부분만 시험한다. 그러려면 순수 함수로 떼어야 한다.

`useFlightCategory.test.js`

```js
import { describe, it, expect } from 'vitest'
import { splitOverlayPayload } from './useFlightCategory.js'

describe('splitOverlayPayload', () => {
  it('꾸러미를 갈라 낸다', () => {
    const out = splitOverlayPayload({
      visibility: { geojson: { type: 'FeatureCollection', features: [1] } },
      ceiling: { geojson: { type: 'FeatureCollection', features: [2] } },
      stations: [{ id: 'a' }],
      trend: { hours: 3, vis_delta: [] },
      sources: { missing_ratio: 0.8 },
    })
    expect(out.visibility.features).toEqual([1])
    expect(out.ceiling.features).toEqual([2])
    expect(out.stations).toEqual([{ id: 'a' }])
    expect(out.trend.hours).toBe(3)
    expect(out.hasData).toBe(true)
  })

  it('시정 층 시각으로 쓸 computed_at을 꺼낸다', () => {
    const out = splitOverlayPayload({ computed_at: '2026-08-01T15:22:13.722Z' })
    expect(out.computedAt).toBe('2026-08-01T15:22:13.722Z')
  })

  it('자료가 없으면 빈 도형을 주고 hasData가 거짓이다', () => {
    // 빈 화면을 "문제 없음"으로 읽게 두지 않기 위한 신호다.
    const out = splitOverlayPayload(null)
    expect(out.visibility.features).toEqual([])
    expect(out.ceiling.features).toEqual([])
    expect(out.stations).toEqual([])
    expect(out.trend).toBe(null)
    expect(out.hasData).toBe(false)
  })

  it('trend가 null인 산출물도 받아들인다', () => {
    // 서버를 켠 지 3시간이 안 되면 정상적으로 null이다.
    const out = splitOverlayPayload({ visibility: { geojson: { type: 'FeatureCollection', features: [] } }, trend: null })
    expect(out.trend).toBe(null)
    expect(out.hasData).toBe(true)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/useFlightCategory.test.js`
Expected: FAIL — `splitOverlayPayload` 미노출

- [ ] **Step 3: 구현**

`useFlightCategory.js`의 `EMPTY_FC` 아래에 추가하고, 훅이 이것을 쓰도록 바꾼다.

```js
const EMPTY_FC = { type: 'FeatureCollection', features: [] }

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

훅 본문에서 `useState(EMPTY_FC)`를 `useState(() => splitOverlayPayload(null))`로 바꾸고, 응답을 받으면 `setState(splitOverlayPayload(data))`로 넣는다. `return { geojson }`을 `return state`로 바꾼다.

**503은 오류가 아니라 "아직 자료 없음"이다.** `res.ok`가 아닐 때 기존처럼 조용히 반환하되, 한 번도 못 받았으면 `hasData`가 거짓으로 남는다. 이미 받아둔 자료가 있으면 그대로 유지한다 — 일시적 실패로 화면을 지우지 않는다.

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/useFlightCategory.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/useFlightCategory.js frontend/src/features/weather-overlays/lib/useFlightCategory.test.js
git commit -m "feat(flight-category): split the new overlay payload in the data hook"
```

---

## Task 3: 지도 층 셋

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/flightCategoryLayers.js` (전면 교체)

**Interfaces:**
- Consumes: Task 1의 `toStationFeatures`
- Produces: `syncFlightCategoryLayers(map, { visibility, ceiling, stations, showVisibility, showCeiling, showMissing, showStations, beforeLayerId })`, `removeFlightCategoryLayers(map)`, `FC_LAYER_IDS`

- [ ] **Step 1: 구현**

`flightCategoryLayers.js`를 아래로 교체한다. 말풍선(`bindFlightCategoryClick`)은 Task 5에서 다시 쓰므로 이 태스크에서는 지우고 넘어간다.

```js
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'
import { toStationFeatures } from './flightCategoryStations.js'

export const FC_VIS_SOURCE = 'flight-category-vis-source'
export const FC_CEIL_SOURCE = 'flight-category-ceil-source'
export const FC_STATION_SOURCE = 'flight-category-station-source'

export const FC_VIS_LAYER = 'flight-category-vis-fill'
export const FC_CEIL_LINE_LAYER = 'flight-category-ceil-line'
export const FC_CEIL_FILL_LAYER = 'flight-category-ceil-fill'
export const FC_STATION_LAYER = 'flight-category-station'

// 위에서 아래로 그리는 순서. 지점이 면 아래로 가면 안 보이고,
// 운고 면이 시정 아래로 가면 시정에 덮인다(운고 면이 훨씬 좁다).
export const FC_LAYER_IDS = [FC_STATION_LAYER, FC_CEIL_LINE_LAYER, FC_CEIL_FILL_LAYER, FC_VIS_LAYER]
export const FC_SOURCE_IDS = [FC_VIS_SOURCE, FC_CEIL_SOURCE, FC_STATION_SOURCE]

const EMPTY_FC = { type: 'FeatureCollection', features: [] }

// 지점 표식 색. 면과 같은 색판을 쓴다 — 점과 주변 면의 색이 다르면 그 자체가 불일치 신호다.
const STATION_FILL = ['match', ['get', 'fill'], 'severe', '#dc2626', 'caution', '#f97316', 'rgba(0,0,0,0)']

function ensure(map, beforeLayerId) {
  const before = beforeLayerId && map.getLayer(beforeLayerId) ? beforeLayerId : undefined
  const add = (def) => { if (!map.getLayer(def.id)) map.addLayer(def, before) }

  for (const id of FC_SOURCE_IDS) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY_FC })
  }

  // 시정: 면을 채운다.
  add({
    id: FC_VIS_LAYER, type: 'fill', source: FC_VIS_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.35 },
  })
  // 운고: 시정과 같은 빨강·주황을 쓰므로 겹쳐 켜면 구분이 안 된다.
  // 색을 바꾸지 않고 그리는 방식을 달리한다 — 안쪽은 아주 옅게, 경계는 굵게.
  add({
    id: FC_CEIL_FILL_LAYER, type: 'fill', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.12 },
  })
  add({
    id: FC_CEIL_LINE_LAYER, type: 'line', source: FC_CEIL_SOURCE,
    layout: { visibility: 'none' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 2.5 },
  })
  add({
    id: FC_STATION_LAYER, type: 'circle', source: FC_STATION_SOURCE,
    layout: { visibility: 'none' },
    paint: {
      'circle-radius': 6,
      'circle-color': STATION_FILL,
      'circle-stroke-width': ['case', ['get', 'ring'], 3, 1.5],
      'circle-stroke-color': ['case', ['get', 'ring'], '#dc2626', '#334155'],
    },
  })
}

/** 결측 밴드는 시정 도형 안에 들어 있다. 별도 층을 만들지 않고 걸러낸다. */
function filterMissing(fc, showMissing) {
  if (showMissing) return fc
  return { ...fc, features: (fc?.features ?? []).filter((f) => f.properties?.band !== 'missing') }
}

export function syncFlightCategoryLayers(map, {
  visibility, ceiling, stations,
  showVisibility, showCeiling, showMissing, showStations,
  beforeLayerId,
}) {
  ensure(map, beforeLayerId)
  map.getSource(FC_VIS_SOURCE)?.setData(filterMissing(visibility || EMPTY_FC, showMissing))
  map.getSource(FC_CEIL_SOURCE)?.setData(ceiling || EMPTY_FC)
  map.getSource(FC_STATION_SOURCE)?.setData(toStationFeatures(stations))

  setMapLayerVisible(map, FC_VIS_LAYER, !!showVisibility)
  setMapLayerVisible(map, FC_CEIL_FILL_LAYER, !!showCeiling)
  setMapLayerVisible(map, FC_CEIL_LINE_LAYER, !!showCeiling)
  // 지점은 면 중 하나라도 켜져 있을 때만 의미가 있다 — 견줄 대상이 있어야 한다.
  setMapLayerVisible(map, FC_STATION_LAYER, !!showStations && (!!showVisibility || !!showCeiling))
}

export function removeFlightCategoryLayers(map) {
  try {
    for (const id of FC_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id)
    for (const id of FC_SOURCE_IDS) if (map.getSource(id)) map.removeSource(id)
  } catch {}
}
```

- [ ] **Step 2: 결측 걸러내기 시험**

이 파일에서 브라우저 없이 시험할 수 있는 것은 `filterMissing`뿐이다. 내보내서 못 박는다. `filterMissing`을 `export`로 바꾸고 `flightCategoryLayers.test.js`를 만든다.

```js
import { describe, it, expect } from 'vitest'
import { filterMissing } from './flightCategoryLayers.js'

const fc = {
  type: 'FeatureCollection',
  features: [
    { properties: { band: 'severe' } },
    { properties: { band: 'missing' } },
  ],
}

describe('filterMissing', () => {
  it('꺼져 있으면 결측 밴드를 뺀다', () => {
    expect(filterMissing(fc, false).features.map((f) => f.properties.band)).toEqual(['severe'])
  })
  it('켜져 있으면 그대로 둔다', () => {
    expect(filterMissing(fc, true).features).toHaveLength(2)
  })
})
```

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryLayers.test.js`
Expected: PASS (2 tests)

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryLayers.js frontend/src/features/weather-overlays/lib/flightCategoryLayers.test.js
git commit -m "feat(flight-category): three map layers with ceiling drawn as outline"
```

---

## Task 4: 토글 둘로 나누고 배선

이 태스크가 끝나야 화면에 무언가 나온다. 앞의 셋은 화면에 보이지 않는다.

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:161`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx:45-47`, `:57`, `layerLabels`
- Modify: `frontend/src/features/map/layerActions.js:37`
- Modify: `frontend/src/features/map/MapView.jsx` — `import` 부, `useFlightCategory()` 호출부(`:538`), 동기화부(`:1512-1519`)

**Interfaces:**
- Consumes: Task 2의 훅 반환값, Task 3의 `syncFlightCategoryLayers` / `removeFlightCategoryLayers`

- [ ] **Step 1: 레이어 목록 교체**

`weatherOverlayLayers.js:161`의 한 줄을 두 줄로 바꾼다.

```js
  { id: 'visibility', label: '시정', color: '#f97316' },
  { id: 'ceiling', label: '운고', color: '#dc2626' },
```

`flightCategory` 항목은 지운다. 이 배열이 `MET_ACTIONS`와 `initMetVisibility()`의 원본이라, 지우면 두 곳이 함께 따라온다.

- [ ] **Step 2: 패널 수정**

`WeatherOverlayPanel.jsx`

- `TEMP_HIDDEN_LAYER_IDS`를 **빈 배열로 바꾸고** 그 위 주석 두 줄을 지운다. 백엔드 수집이 재개됐다.
- `nwp` 그룹의 `ids`에서 `'flightCategory'`를 빼고 `'visibility', 'ceiling'`을 넣는다.
- `layerLabels`에서 `flightCategory` 줄을 지우고 `visibility: '시정'`, `ceiling: '운고'`를 넣는다.

- [ ] **Step 3: 음성 명령 별칭**

`layerActions.js:37`의 한 줄을 두 줄로 바꾼다.

```js
  visibility: { label: '시정', aliases: ['시정', 'visibility', '가시거리'] },
  ceiling: { label: '운고', aliases: ['운고', 'ceiling', '운저'] },
```

- [ ] **Step 4: MapView 배선**

`MapView.jsx`에서 import를 바꾼다(`:89` 근처).

```js
import { syncFlightCategoryLayers, removeFlightCategoryLayers } from '../weather-overlays/lib/flightCategoryLayers.js'
```

`:538`의 훅 호출을 바꾼다.

```js
  const flightCategory = useFlightCategory()
```

`:1512-1519`의 동기화를 바꾼다. **위 구분선 주석 줄(`// ???? Sync ...`)은 건드리지 않는다.**

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

하위 옵션 상태를 다른 `useState` 옆에 만든다(`:373` 근처). **결측은 꺼짐, 지점은 켜짐**이 스펙 §3.4다.

```js
  const [showFlightCategoryMissing, setShowFlightCategoryMissing] = useState(false)
  const [showFlightCategoryStations, setShowFlightCategoryStations] = useState(true)
```

`:841-842`의 범례 항목 등록에서 `metVisibility.flightCategory`를 쓰는 부분을 두 항목으로 나눈다. `:862-863`의 의존성 배열에 있는 `metVisibility.flightCategory`도 `metVisibility.visibility, metVisibility.ceiling`으로 바꾼다.

`weatherOverlayModel.js:153`의 `flightCategoryGeojson` 인자와 `:349`의 `flightCategoryIssueLabel`은 시각 표시에 쓰인다. 인자를 `flightCategorySources`로 바꾸고 Task 6에서 층별 시각으로 다시 손댄다. 이 태스크에서는 **이름만 맞춰 깨지지 않게** 해둔다.

- [ ] **Step 5: 남은 참조 확인**

Run: `cd frontend && grep -rn "flightCategory" src/ --include=*.js --include=*.jsx | grep -v "flightCategoryStations\|flightCategoryLayers\|useFlightCategory\|showFlightCategory\|flightCategorySources"`
Expected: 결과 없음. 남아 있으면 그 자리를 고친다.

- [ ] **Step 6: 앱이 뜨는지 확인**

Run: `cd frontend && npx vitest run`
Expected: 기존 시험이 모두 통과. 실패하면 이름이 안 맞는 자리를 고친다.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/layerActions.js frontend/src/features/map/MapView.jsx frontend/src/features/weather-overlays/lib/weatherOverlayModel.js
git commit -m "feat(flight-category): split the panel toggle into visibility and ceiling"
```

---

## Task 5: 점 조회 말풍선

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/flightCategoryLayers.js` (말풍선 추가)
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryPopup.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryPopup.test.js`
- Modify: `frontend/src/features/map/MapView.jsx` (클릭 연결)

**Interfaces:**
- Produces: `formatPointLines(point) => Array<{ label, value, note, alert }>`, `bindFlightCategoryClick(map, popupRef, { enabled })`

- [ ] **Step 1: 실패하는 테스트 작성**

말풍선 내용 만들기는 순수 계산이라 떼어내 시험한다.

`flightCategoryPopup.test.js`

```js
import { describe, it, expect } from 'vitest'
import { formatPointLines } from './flightCategoryPopup.js'

const point = {
  vis_m: 4200, vis_band: 'below',
  ceil_ft: 1713, ceil_band: 'mid', vis_trend: -2100,
  nearest_station: { name: '청주', distance_km: 12.3, ceiling_ft: 1200, model_ceiling_ft: 1713, diff_ft: -513 },
}

describe('formatPointLines', () => {
  it('운고는 100 ft 단위로 반올림하고 약을 붙인다', () => {
    // 모델 층 간격이 200~250 m라 1,713 ft라고 적으면 없는 정밀도를 주장하게 된다.
    const ceil = formatPointLines(point).find((l) => l.label === '운고')
    expect(ceil.value).toBe('약 1,700 ft')
  })

  it('시정에는 관측소 줄을 붙이지 않는다', () => {
    // 시정 격자가 이미 ASOS 관측을 객관분석한 결과물이라 중복이다(선행 스펙 §5.1).
    const lines = formatPointLines(point)
    const visIndex = lines.findIndex((l) => l.label === '시정')
    expect(lines[visIndex + 1].label).not.toBe('')
    expect(lines.filter((l) => l.note?.includes('청주'))).toHaveLength(1)
  })

  it('관측소 줄에 거리를 항상 적는다', () => {
    const stn = formatPointLines(point).find((l) => l.note?.includes('청주'))
    expect(stn.note).toContain('12.3 km')
  })

  it('관측이 모델보다 낮으면 그 줄을 눈에 띄게 한다', () => {
    const stn = formatPointLines(point).find((l) => l.note?.includes('청주'))
    expect(stn.alert).toBe(true)
  })

  it('자료가 없는 줄은 자료 없음으로 적는다', () => {
    // 빈칸은 0이나 "문제없음"으로 읽힌다.
    const lines = formatPointLines({ vis_m: null, ceil_ft: null, vis_trend: null, nearest_station: null })
    expect(lines.find((l) => l.label === '시정').value).toBe('자료 없음')
    expect(lines.find((l) => l.label === '운고').value).toBe('자료 없음')
    expect(lines.find((l) => l.label === '추세').value).toBe('자료 없음')
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryPopup.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`flightCategoryPopup.js`

```js
const NO_DATA = '자료 없음'
const km = (m) => `${(m / 1000).toFixed(1)} km`

/** 모델 층 간격이 200~250 m다. 100 ft 단위로 낮춰 없는 정밀도를 주장하지 않는다. */
function ceilingText(ft) {
  if (!Number.isFinite(ft)) return NO_DATA
  return `약 ${(Math.round(ft / 100) * 100).toLocaleString()} ft`
}

const VIS_BAND_KO = { severe: '기준 크게 미달', below: '기준 미달', marginal: '여유 적음', clear: '기준 충족', missing: NO_DATA }

export function formatPointLines(point) {
  const lines = []

  lines.push({
    label: '시정',
    value: Number.isFinite(point?.vis_m) ? `${point.vis_m.toLocaleString()} m` : NO_DATA,
    note: VIS_BAND_KO[point?.vis_band] ?? null,
    alert: false,
  })

  lines.push({ label: '운고', value: ceilingText(point?.ceil_ft), note: '모델', alert: false })

  const stn = point?.nearest_station
  if (stn && Number.isFinite(stn.ceiling_ft)) {
    // 거리를 항상 적는다 — 멀면 그 값이 이 지점을 대표하지 못한다.
    lines.push({
      label: '',
      value: `${stn.ceiling_ft.toLocaleString()} ft`,
      note: `${stn.name} ${stn.distance_km} km`,
      alert: Number.isFinite(stn.model_ceiling_ft)
        ? stn.ceiling_ft < stn.model_ceiling_ft
        : true,   // 모델이 구름 없다는데 관측은 보고 있다
    })
  }

  lines.push({
    label: '추세',
    value: Number.isFinite(point?.vis_trend)
      ? `지난 3시간 ${point.vis_trend > 0 ? '+' : '−'}${km(Math.abs(point.vis_trend))}`
      : NO_DATA,
    note: null,
    alert: false,
  })

  return lines
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryPopup.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 지도 클릭에 연결**

`flightCategoryLayers.js`에 추가한다. 시정 면을 누를 때만 뜬다 — 운고 면은 윤곽선이라 누르기 어렵다.

```js
import mapboxgl from 'mapbox-gl'
import { formatPointLines } from './flightCategoryPopup.js'

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
      .setLngLat(e.lngLat)
      .setHTML(`<div style="font-family:'Noto Sans KR',sans-serif;padding:2px 0">${rows}</div>`)
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

`MapView.jsx`는 이미 `bindFlightCategoryClick(map, fcPopupRef)`를 부르고 있다(`:86` import, `:1541` 호출). **시그니처가 그대로이므로 호출부는 손대지 않는다.** 바뀌는 것은 이 함수가 어느 레이어에 묶이느냐뿐이다 — 없어진 `FC_LAYER_ID` 대신 `FC_VIS_LAYER`에 묶는다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryPopup.js frontend/src/features/weather-overlays/lib/flightCategoryPopup.test.js frontend/src/features/weather-overlays/lib/flightCategoryLayers.js frontend/src/features/map/MapView.jsx
git commit -m "feat(flight-category): point query popup with per-line no-data"
```

---

## Task 6: 범례와 자료 상태

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js:153`, `:349`
- Modify: `frontend/src/features/map/MapView.jsx` (범례 항목)
- Create: `frontend/src/features/weather-overlays/lib/flightCategoryLegend.js`
- Test: `frontend/src/features/weather-overlays/lib/flightCategoryLegend.test.js`

**Interfaces:**
- Produces: `legendStamps(sources, hasData) => { visibility, ceiling, stations }` — 층별 기준 시각 문구

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { describe, it, expect } from 'vitest'
import { legendStamps } from './flightCategoryLegend.js'

describe('legendStamps', () => {
  it('층마다 다른 기준 시각을 준다', () => {
    // 시정 20분, 운고 하루 네 번, 지점 매시. 하나로 뭉치면 여섯 시간 묵은
    // 운고를 방금 것으로 착각한다.
    const out = legendStamps({
      kim: { run: '2026080106', hf: 0 },
      stations: { asos: 4, amos: 1, tm: '202608012200' },
    }, true, '2026-08-01T15:22:13.722Z')
    expect(out.ceiling).toContain('06')
    expect(out.stations).toContain('22')
    expect(out.visibility).not.toBe(out.ceiling)
  })

  it('자료를 한 번도 못 받았으면 자료 없음이다', () => {
    const out = legendStamps(null, false, null)
    expect(out.visibility).toBe('자료 없음')
    expect(out.ceiling).toBe('자료 없음')
    expect(out.stations).toBe('자료 없음')
  })

  it('지점 수를 센다', () => {
    // 맑은 날 97곳 중 4곳뿐인 것이 정상이다. 숫자가 없으면 고장으로 오해한다.
    expect(legendStamps({ stations: { asos: 4, amos: 1, tm: '202608012200' } }, true, null).stationCount).toBe(5)
  })
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryLegend.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`flightCategoryLegend.js`

```js
const NO_DATA = '자료 없음'

/** `YYYYMMDDHH[mm]` → `HH:mm`. 형식이 아니면 null. */
function hhmm(tm) {
  if (typeof tm !== 'string' || tm.length < 10) return null
  return `${tm.slice(8, 10)}:${tm.length >= 12 ? tm.slice(10, 12) : '00'}`
}

/**
 * 층별 기준 시각. 갱신 주기가 서로 달라 하나로 합치면 안 된다 —
 * 시정 20분, 운고 하루 네 번, 관측지점 매시.
 */
export function legendStamps(sources, hasData, computedAt) {
  if (!hasData) {
    return { visibility: NO_DATA, ceiling: NO_DATA, stations: NO_DATA, stationCount: 0 }
  }
  const vis = computedAt ? new Date(computedAt).toISOString().slice(11, 16) : NO_DATA
  const kimRun = hhmm(sources?.kim?.run)
  const stnTm = hhmm(sources?.stations?.tm)
  return {
    visibility: vis,
    ceiling: kimRun ? `${kimRun} 발표` : NO_DATA,
    stations: stnTm ?? NO_DATA,
    stationCount: (sources?.stations?.asos ?? 0) + (sources?.stations?.amos ?? 0),
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd frontend && npx vitest run src/features/weather-overlays/lib/flightCategoryLegend.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 범례에 연결**

범례 항목은 `{ key, label, issueLabel }` 모양으로 `entries`에 넣는다(`MapView.jsx:836-842`에 다른 레이어들의 예가 있다). `flightCategory` 한 줄을 두 줄로 바꾼다.

```js
    const fcStamps = legendStamps(flightCategory.sources, flightCategory.hasData, flightCategory.computedAt)
    if (metVisibility.visibility)
      entries.push({
        key: 'visibility',
        label: '시정',
        issueLabel: fcStamps.visibility,
        note: '색 없음 = 기준 충족 또는 자료 없음',
        options: [
          { id: 'fcMissing', label: '자료없음 표시', checked: showFlightCategoryMissing, onChange: setShowFlightCategoryMissing },
          { id: 'fcStations', label: `관측지점 ${fcStamps.stationCount}곳`, checked: showFlightCategoryStations, onChange: setShowFlightCategoryStations },
        ],
      })
    if (metVisibility.ceiling)
      entries.push({
        key: 'ceiling',
        label: '운고',
        issueLabel: fcStamps.ceiling,
        // 시정이 꺼져 있으면 관측지점 옵션이 여기 붙는다 — 운고와도 견줄 수 있다.
        options: metVisibility.visibility ? [] : [
          { id: 'fcStations', label: `관측지점 ${fcStamps.stationCount}곳`, checked: showFlightCategoryStations, onChange: setShowFlightCategoryStations },
        ],
      })
```

`legendStamps`를 import하고, 의존성 배열(`:862-863`)에 `flightCategory.sources`, `flightCategory.hasData`, `flightCategory.computedAt`, `showFlightCategoryMissing`, `showFlightCategoryStations`를 넣는다.

**결측 옵션은 시정 항목에만 있다** — 결측은 시정 도형의 밴드라 시정이 꺼져 있으면 켜고 끌 대상이 없다. **관측지점 옵션은 시정에 붙이되, 시정이 꺼져 있고 운고만 켜져 있으면 운고로 옮긴다.**

범례를 그리는 쪽이 `note`와 `options`를 아직 모른다면 그 컴포넌트에 두 필드를 받는 코드를 더한다. `note`는 항목 아래 회색 작은 글씨 한 줄, `options`는 체크박스 목록이다. 기존 항목들은 두 필드가 없으므로 `?? null` / `?? []`로 받아 영향이 없게 한다.

`weatherOverlayModel.js:153`의 `flightCategoryGeojson` 인자를 `flightCategorySources`로 바꾸고, `:349`의 `flightCategoryIssueLabel`은 지운다 — 층별 시각이 대신한다. 이 이름을 쓰던 자리를 모두 고친다.

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/flightCategoryLegend.js frontend/src/features/weather-overlays/lib/flightCategoryLegend.test.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/map/MapView.jsx
git commit -m "feat(flight-category): per-layer timestamps and legend sub-options"
```

---

## Task 7: 브라우저 검증

임베디드 미리보기는 증거가 아니다. 실제 브라우저로 확인하고 결과를 남긴다.

**Files:**
- Create: `frontend/tests/flight-category-overlay.spec.js`

- [ ] **Step 1: 자료를 고정한다**

수집이 켜져 있으면 20분마다 화면이 바뀌어 같은 결과가 두 번 나오지 않는다. 백엔드를 `DISABLE_COLLECTION=1`로 띄워 저장된 산출물 하나로 돌린다. 절차는 [dev-server-and-capture](../operations/dev-server-and-capture.md)를 따른다.

먼저 그 산출물에 무엇이 들어 있는지 확인한다.

```bash
cd backend && node --input-type=module -e "
import fs from 'node:fs'
const d=JSON.parse(fs.readFileSync('./data/flight_category_overlay/latest.json','utf8'))
console.log('시정 밴드:', d.visibility.geojson.features.map(f=>f.properties.band).join(','))
console.log('운고 밴드:', d.ceiling.geojson.features.map(f=>f.properties.band).join(','))
console.log('지점:', d.stations.length, '| 테두리 대상:', d.stations.filter(s=>s.model_ceiling_ft===null||s.ceiling_ft<s.model_ceiling_ft).length)
console.log('추세:', d.trend ? '있음' : 'null')
"
```

- [ ] **Step 2: 검증 시나리오 작성**

`frontend/tests/flight-category-overlay.spec.js` — 스펙 §6의 다섯 가지를 그대로 옮긴다.

```js
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => { await page.goto('/') })

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

test('결측 표시는 기본이 꺼짐이고 켜면 회색이 덮인다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  const missing = page.getByRole('checkbox', { name: /자료없음/ })
  await expect(missing).not.toBeChecked()
  await missing.check()
  await expect(page.locator('canvas')).toHaveScreenshot('missing-on.png')
})

test('관측지점은 기본이 켜짐이고 개수를 적는다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  const stations = page.getByRole('checkbox', { name: /관측지점/ })
  await expect(stations).toBeChecked()
  await expect(page.getByText(/관측지점 \d+곳/)).toBeVisible()
})

test('지도를 누르면 말풍선이 뜬다', async ({ page }) => {
  await page.getByRole('button', { name: '시정' }).click()
  await page.locator('canvas').click({ position: { x: 400, y: 300 } })
  await expect(page.getByText('시정')).toBeVisible()
  await expect(page.getByText('추세')).toBeVisible()
})
```

- [ ] **Step 3: 돌리고 결과를 남긴다**

Run: `cd frontend && npx playwright test tests/flight-category-overlay.spec.js`

기준 이미지는 Linux 전용(`*-linux.png`)이다. 처음에는 `--update-snapshots`로 만들고 **눈으로 확인한 뒤** 커밋한다. 화면이 비어 있는데 통과하는 일이 없도록, 각 이미지를 실제로 열어 면·윤곽선·점이 보이는지 확인한다.

- [ ] **Step 4: 확인 못 한 것을 적는다**

Step 1에서 "테두리 대상"이 0이었으면 **빨간 테두리는 화면으로 확인되지 않은 것이다.** Task 1의 단위 시험이 규칙을 못 박고 있으나 화면 확인은 아니다. 확인했다고 적지 않는다. 실제 불일치가 나오는 날 다시 본다.

- [ ] **Step 5: 커밋**

```bash
git add frontend/tests/flight-category-overlay.spec.js frontend/tests/flight-category-overlay.spec.js-snapshots
git commit -m "test(flight-category): browser contract for the two overlay layers"
```

---

## 후속 (이번 범위 밖)

- **운고 층 구간 표시** — 선행 스펙 §5.2가 원하는 "950~975 hPa 사이" 형태. 백엔드가 어느 층에서 임계값을 넘었는지 저장해야 한다.
- **`cld` 임계값 0.6 재확인** — 흐린 날 표본으로. 백엔드 후속 항목.
- **빨간 테두리 화면 확인** — 모델과 관측이 실제로 어긋나는 날.
