# 비행경로 연직단면도 기상 중첩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 비행경로 연직단면도에 KIM NWP 4종(TEMP 등온선 / Moisture·Icing 음영 / Wind 바브)을 연직 중첩하고, 이를 위해 KIM 수집 층을 확장(+hgt)하면서 예보시간은 단일화한다.

**Architecture:** 백엔드가 경로+단일 valid time을 받아 (거리×기압면) 행렬을 합성해 반환(`POST /api/briefing/cross-section`). 기압→고도는 수집한 `hgt`로 변환. 프론트는 기존 SVG 차트(`VerticalProfileChart`)에 음영/등온선/바브 레이어를 추가하고 토글한다. 수집 층 확장은 기존 KIM 파이프라인(`kim-nwp-model.js`/`kim-surface-wind-processor.js`/`config.js`)을 수정하며, 예보시간을 13개에서 1개로 줄여 총 호출량을 낮춘다.

**Tech Stack:** Node/Express(ESM, `node --test`), Vite + React, SVG, 기존 KIM int16-scaled JSON grid.

**Long-context note:** 이 작업은 backend+frontend·10+파일·신규 엔드포인트를 포함한다. 실행 시 `docs/policies/long-context-handoff.md` 절차를 따른다. 4개 Phase는 순차 의존(Phase 1 → 2/3 → 4)이며 각 Phase 종료 시 빌드/테스트가 녹색이어야 한다.

**참조 스펙:** `docs/archive/development/specs/2026-06-06-vertical-cross-section-overlay-design.md`

---

## File Structure

**Phase 1 — 데이터 레이어 (수집 층 확장 + hgt + 예보시간 단일화)**
- Modify: `backend/src/processors/kim-nwp-model.js` — `KIM_NWP_LEVELS`(+1000/250/200/150), moisture/icing level id, `hgt` 처리.
- Modify: `backend/src/processors/kim-surface-wind-processor.js` — `hgt` 컴포넌트 요청/병합, 완전성 기준에 hgt 반영, 단일 hf 선택.
- Modify: `backend/src/config.js` — `forecast_hours` 단일화 + 후보 풀, `collect_hgt` 토글.
- Create: `backend/src/processors/kim-forecast-hour.js` — 최근접 미래 hf 선택 순수 함수.
- Test: `backend/test/kim-forecast-hour.test.js`, `backend/test/kim-nwp-model.test.js`(기존 확장).

**Phase 2 — 지도 KIM 레이어 새 층 노출 검증/하드캡 제거**
- Inspect/Modify: `backend/server.js`(`filterKimNwpIndexForMap*`), `frontend/src/features/weather-overlays/lib/*`(레벨 라벨/색상 하드캡), `NwpSliderBar*`.

**Phase 3 — 백엔드 단면 합성**
- Create: `backend/src/briefing/cross-section-sampler.js` — grid 직접 샘플 → (거리×레벨) 행렬 + coverage.
- Modify: `backend/server.js` — `POST /api/briefing/cross-section` 라우트.
- Test: `backend/test/cross-section-sampler.test.js`.

**Phase 4 — 프론트 렌더 + 토글**
- Create: `frontend/src/features/route-briefing/lib/crossSectionGrid.js` — 기압→고도, 격자 보간, marching-squares 등온선, 바브 thinning, m/s→kt·풍향 (순수 함수).
- Test: `frontend/src/features/route-briefing/lib/crossSectionGrid.test.js`.
- Modify: `frontend/src/api/briefingApi.js` — `fetchCrossSection`.
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js` — 단면 fetch/상태.
- Modify: `frontend/src/features/route-briefing/VerticalProfileWindow.jsx` — 레이어 토글 UI.
- Modify: `frontend/src/features/route-briefing/VerticalProfileChart.jsx` — 단면 레이어 렌더.
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css` — 레이어/범례 스타일.

---

## Phase 1 — 데이터 레이어

### Task 1.1: 최근접 미래 예보시간 선택 함수

**Files:**
- Create: `backend/src/processors/kim-forecast-hour.js`
- Test: `backend/test/kim-forecast-hour.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// backend/test/kim-forecast-hour.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { selectNearestForecastHour } from '../src/processors/kim-forecast-hour.js'

test('picks the smallest valid time at or after now', () => {
  // run 2026060600 (UTC). now = run + 5h. candidates [0,3,6,9].
  const tmfc = '2026060600'
  const nowMs = Date.UTC(2026, 5, 6, 5) // 05:00Z
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6, 9] }), 6)
})

test('falls back to last candidate when now is past all valid times', () => {
  const tmfc = '2026060600'
  const nowMs = Date.UTC(2026, 5, 7, 0) // +24h, beyond [0..9]
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6, 9] }), 9)
})

test('returns first candidate when run is in the future', () => {
  const tmfc = '2026060612'
  const nowMs = Date.UTC(2026, 5, 6, 6)
  assert.equal(selectNearestForecastHour({ tmfc, nowMs, candidateHours: [0, 3, 6] }), 0)
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/kim-forecast-hour.test.js` (cwd: `backend`)
Expected: FAIL — `selectNearestForecastHour` not exported.

- [ ] **Step 3: 최소 구현**

```js
// backend/src/processors/kim-forecast-hour.js
function tmfcToMs(tmfc) {
  const s = String(tmfc || '')
  if (!/^\d{10}$/.test(s)) return null
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10))
}

// 최신 usable run(tmfc) 기준, valid time(tmfc+hf)이 now 이상인 가장 가까운 hf.
// 모두 과거면 마지막(가장 미래) 후보. run이 미래면 첫 후보.
export function selectNearestForecastHour({ tmfc, nowMs = Date.now(), candidateHours = [] }) {
  const baseMs = tmfcToMs(tmfc)
  const hours = [...candidateHours].sort((a, b) => a - b)
  if (baseMs == null || hours.length === 0) return hours[0] ?? 0
  const future = hours.filter((hf) => baseMs + hf * 3600_000 >= nowMs)
  return future.length > 0 ? future[0] : hours[hours.length - 1]
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/kim-forecast-hour.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/kim-forecast-hour.js backend/test/kim-forecast-hour.test.js
git commit -m "feat(kim): add nearest-future forecast hour selector"
```

### Task 1.2: 층 세트 확장 + hgt 레벨 상수

**Files:**
- Modify: `backend/src/processors/kim-nwp-model.js:5-18`
- Test: `backend/test/kim-nwp-model.test.js`

- [ ] **Step 1: 실패하는 테스트 추가**

```js
// backend/test/kim-nwp-model.test.js 에 추가
import {
  KIM_NWP_LEVELS,
  KIM_NWP_MOISTURE_LEVEL_IDS,
  KIM_NWP_ICING_LEVEL_IDS,
} from '../src/processors/kim-nwp-model.js'

test('expanded pressure level set tops at 150hPa for wind/temp', () => {
  const ids = KIM_NWP_LEVELS.map((l) => l.id)
  for (const id of ['10m', '1000hPa', '925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa', '250hPa', '200hPa', '150hPa']) {
    assert.ok(ids.includes(id), `missing ${id}`)
  }
  assert.ok(!ids.includes('100hPa'), '100hPa must be excluded')
})

test('moisture and icing level sets extended to 300hPa', () => {
  for (const id of ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa']) {
    assert.ok(KIM_NWP_MOISTURE_LEVEL_IDS.includes(id), `moisture missing ${id}`)
    assert.ok(KIM_NWP_ICING_LEVEL_IDS.includes(id), `icing missing ${id}`)
  }
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/kim-nwp-model.test.js`
Expected: FAIL — 1000/250/200/150hPa 부재, moisture/icing에 600/400/300 부족.

- [ ] **Step 3: 레벨 상수 확장**

`kim-nwp-model.js`의 `KIM_NWP_LEVELS`를 아래로 교체(기존 10m·925~300 유지, 1000/250/200/150 추가):

```js
export const KIM_NWP_LEVELS = [
  { id: '10m', label: '10m', kind: 'height', value: 10, unit: 'm', level: 0, uName: 'u10m', vName: 'v10m' },
  { id: '1000hPa', label: '1000', kind: 'pressure', value: 1000, unit: 'hPa', level: 1000, uName: 'u', vName: 'v' },
  { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa', level: 925, uName: 'u', vName: 'v' },
  { id: '850hPa', label: '850', kind: 'pressure', value: 850, unit: 'hPa', level: 850, uName: 'u', vName: 'v' },
  { id: '700hPa', label: '700', kind: 'pressure', value: 700, unit: 'hPa', level: 700, uName: 'u', vName: 'v' },
  { id: '600hPa', label: '600', kind: 'pressure', value: 600, unit: 'hPa', level: 600, uName: 'u', vName: 'v' },
  { id: '500hPa', label: '500', kind: 'pressure', value: 500, unit: 'hPa', level: 500, uName: 'u', vName: 'v' },
  { id: '400hPa', label: '400', kind: 'pressure', value: 400, unit: 'hPa', level: 400, uName: 'u', vName: 'v' },
  { id: '300hPa', label: '300', kind: 'pressure', value: 300, unit: 'hPa', level: 300, uName: 'u', vName: 'v' },
  { id: '250hPa', label: '250', kind: 'pressure', value: 250, unit: 'hPa', level: 250, uName: 'u', vName: 'v' },
  { id: '200hPa', label: '200', kind: 'pressure', value: 200, unit: 'hPa', level: 200, uName: 'u', vName: 'v' },
  { id: '150hPa', label: '150', kind: 'pressure', value: 150, unit: 'hPa', level: 150, uName: 'u', vName: 'v' },
]
export const KIM_NWP_MOISTURE_LEVEL_IDS = ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa']
export const KIM_NWP_ICING_LEVEL_IDS = ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa', '300hPa']
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/kim-nwp-model.test.js`
Expected: PASS. (기존 model 테스트도 함께 통과해야 함 — moisture/icing id 길이를 단언하는 기존 테스트가 있으면 새 세트로 갱신.)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/kim-nwp-model.js backend/test/kim-nwp-model.test.js
git commit -m "feat(kim): expand pressure levels to 150hPa and widen moisture/icing sets"
```

### Task 1.3: hgt 컴포넌트 수집/병합

**Files:**
- Modify: `backend/src/processors/kim-surface-wind-processor.js` (요청 resolver + 병합 + 태스크 합성)
- Modify: `backend/src/processors/kim-nwp-model.js` (`SCALE_BY_VARIABLE`에 `hgt`)
- Test: `backend/test/kim-surface-wind.test.js` (또는 기존 processor 테스트 파일)

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// backend/test/kim-hgt-merge.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveKimHgtComponentRequest, mergeHgtComponentIntoGrid } from '../src/processors/kim-surface-wind-processor.js'
import { KIM_NWP_LEVELS } from '../src/processors/kim-nwp-model.js'

test('hgt requested on pressure levels, not on 10m', () => {
  const p500 = KIM_NWP_LEVELS.find((l) => l.id === '500hPa')
  const surface = KIM_NWP_LEVELS.find((l) => l.id === '10m')
  assert.deepEqual(resolveKimHgtComponentRequest({ level: p500 }), { data: 'P', name: 'hgt', level: 500, variable: 'hgt', unit: 'm' })
  assert.equal(resolveKimHgtComponentRequest({ level: surface }), null)
})

test('mergeHgtComponentIntoGrid adds hgt variable', () => {
  const level = KIM_NWP_LEVELS.find((l) => l.id === '500hPa')
  const grid = { variables: {}, fetched_at: 't' }
  const hgtComponent = { nx: 2, ny: 1, bounds: { lonMin: 0, latMin: 0, lonMax: 1, latMax: 0 }, values: [5500, 5510], variable: 'hgt', unit: 'm' }
  const out = mergeHgtComponentIntoGrid({ grid, level, tmfc: '2026060600', hf: 3, hgtComponent })
  assert.ok(out.variables.hgt)
  assert.equal(out.variables.hgt.unit, 'm')
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/kim-hgt-merge.test.js`
Expected: FAIL — `resolveKimHgtComponentRequest`/`mergeHgtComponentIntoGrid` 미정의.

- [ ] **Step 3: 구현**

`kim-nwp-model.js`의 `SCALE_BY_VARIABLE`에 `hgt: 0.1` 추가(지위고도 m, 0.1m 해상도면 int16로 ±3276m 부족 → `hgt`는 큰 값이므로 scale 1 사용):

```js
const SCALE_BY_VARIABLE = {
  u: 0.01, v: 0.01, T: 0.01, rh: 0.01, rh_liq: 0.01,
  w: 0.001, cld: 0.0001, tqc: 2e-7, tqi: 2e-7, tqr: 2e-7, tqs: 2e-7,
  hgt: 1, // m, 정수 미터. int16 한계(±32767m)가 150hPa(~14km)까지 충분.
}
```

`kim-surface-wind-processor.js`에 resolver/fetch/merge 추가(기존 humidity 패턴 복제):

```js
export function resolveKimHgtComponentRequest({ level }) {
  if (level?.kind !== 'pressure') return null
  return { data: 'P', name: 'hgt', level: level.level, variable: 'hgt', unit: 'm' }
}

async function fetchHgtComponent({ level, tmfc, hf }) {
  const kim = config.kim_surface_wind
  const request = resolveKimHgtComponentRequest({ level })
  if (!request) return null
  const text = await fetchKimGrid({ data: request.data, name: request.name, level: request.level, tmfc, hf, sub: kim.sub, map: 'S', disp: 'A' })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'hgt', text })
  const grid = parseKimGridText(text, { variable: request.name, level: request.level, bounds: kim.bounds })
  return { ...grid, variable: request.variable, unit: request.unit }
}

export function mergeHgtComponentIntoGrid({ grid, level, tmfc, hf, hgtComponent, fetchedAt = new Date().toISOString() }) {
  if (!hgtComponent) return grid
  validateGridBounds(hgtComponent)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      hgt: buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc, hf, level, components: [hgtComponent], fetchedAt: grid.fetched_at }).variables.hgt,
    },
    fetched_at: fetchedAt,
  }
}

async function addHgtToGrid({ grid, level, tmfc, hf }) {
  const hgtComponent = await fetchHgtComponent({ level, tmfc, hf })
  return mergeHgtComponentIntoGrid({ grid, level, tmfc, hf, hgtComponent })
}
```

`collectKimNwpTask`에 hgt 단계 추가(temperature 단계 직후, humidity 앞):

```js
  // inside collectKimNwpTask, after addTemperature block:
  try {
    grid = await addHgtToGrid({ grid, ...task })
    writeGrid(grid)
  } catch (error) {
    lastError = error
  }
```

`requiredVariablesForTask`에 hgt를 압력면 필수로 추가:

```js
function requiredVariablesForTask(level, { collectIcing = config.kim_nwp?.collect_icing !== false } = {}) {
  const variables = ['u', 'v', 'T']
  if (level.kind === 'pressure') variables.push('hgt')
  if (isKimNwpMoistureLevel(level)) variables.push('rh')
  if (collectIcing && isKimNwpIcingLevel(level)) variables.push(...(config.kim_nwp?.icing_variables || DEFAULT_ICING_VARIABLES))
  return variables
}
```

`hasCompleteKimNwpRun`의 압력면 검사에 hgt 추가:

```js
      if (!variables.includes('u') || !variables.includes('v') || !variables.includes('T')) return false
      if (level.kind === 'pressure' && !variables.includes('hgt')) return false
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/kim-hgt-merge.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/kim-surface-wind-processor.js backend/src/processors/kim-nwp-model.js backend/test/kim-hgt-merge.test.js
git commit -m "feat(kim): collect geopotential height (hgt) per pressure level"
```

### Task 1.4: 예보시간 단일화 (수집 호출 절감)

**Files:**
- Modify: `backend/src/config.js:169-178`
- Modify: `backend/src/processors/kim-surface-wind-processor.js:470-498`(process 내 forecastHours 결정)
- Test: `backend/test/kim-scheduler.test.js`(기존) 또는 신규 동작 테스트

- [ ] **Step 1: config에 후보 풀 + 단일화 의도 명시**

`config.js`의 `kim_nwp`를 수정 — `forecast_hours`는 후보 풀로 두되, 수집은 단일 선택:

```js
export const kim_nwp = {
  max_runs: Number(process.env.KIM_NWP_MAX_RUNS || 2),
  keep_raw: process.env.KIM_NWP_KEEP_RAW !== '0',
  concurrency: Number(process.env.KIM_NWP_CONCURRENCY || 4),
  // 후보 풀에서 최근접 미래 1개만 수집(비용 절감). 다중 수집은 single_forecast=false로 복원.
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  single_forecast: process.env.KIM_NWP_SINGLE_FORECAST !== '0',
  collect_icing: process.env.KIM_NWP_COLLECT_ICING !== '0',
  collect_on_startup: process.env.KIM_NWP_COLLECT_ON_STARTUP !== '0',
  incremental_retry: process.env.KIM_NWP_INCREMENTAL_RETRY !== '0',
  icing_variables: ['w', 'rh_liq', 'tqc', 'tqi', 'tqr', 'tqs', 'cld'],
}
```

- [ ] **Step 2: process()에서 단일 hf 적용 — 실패 테스트 작성**

```js
// backend/test/kim-single-forecast.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveCollectedForecastHours } from '../src/processors/kim-surface-wind-processor.js'

test('single_forecast reduces to one nearest-future hf', () => {
  const hours = resolveCollectedForecastHours({
    tmfc: '2026060600',
    nowMs: Date.UTC(2026, 5, 6, 5),
    candidateHours: [0, 3, 6, 9, 12],
    single: true,
  })
  assert.deepEqual(hours, [6])
})

test('single_forecast=false keeps full candidate set', () => {
  const hours = resolveCollectedForecastHours({
    tmfc: '2026060600',
    nowMs: Date.UTC(2026, 5, 6, 5),
    candidateHours: [0, 3, 6],
    single: false,
  })
  assert.deepEqual(hours, [0, 3, 6])
})
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `node --test test/kim-single-forecast.test.js`
Expected: FAIL — `resolveCollectedForecastHours` 미정의.

- [ ] **Step 4: 구현**

`kim-surface-wind-processor.js` 상단 import에 추가: `import { selectNearestForecastHour } from './kim-forecast-hour.js'`

```js
export function resolveCollectedForecastHours({ tmfc, nowMs = Date.now(), candidateHours, single }) {
  if (!single) return [...candidateHours]
  return [selectNearestForecastHour({ tmfc, nowMs, candidateHours })]
}
```

`process()`의 forecastHours 결정부(현재 `const forecastHours = config.kim_nwp?.forecast_hours || KIM_NWP_FORECAST_HOURS`)를 교체:

```js
    const candidateHours = config.kim_nwp?.forecast_hours || KIM_NWP_FORECAST_HOURS
    const forecastHours = resolveCollectedForecastHours({
      tmfc: candidate.tmfc,
      candidateHours,
      single: config.kim_nwp?.single_forecast !== false,
    })
```

(주의: `hasCompleteKimNwpRun`·`expectedGridCount`는 이미 지역변수 `forecastHours`를 사용하므로 단일 hf 기준으로 자동 정합.)

- [ ] **Step 5: 테스트 통과 + 기존 스케줄러 테스트 회귀**

Run: `node --test test/kim-single-forecast.test.js test/kim-scheduler.test.js`
Expected: PASS. (스케줄러 테스트가 13-hf를 가정하면 단일-hf 동작에 맞게 갱신.)

- [ ] **Step 6: 커밋**

```bash
git add backend/src/config.js backend/src/processors/kim-surface-wind-processor.js backend/test/kim-single-forecast.test.js
git commit -m "feat(kim): collect single nearest-future forecast hour to cut API volume"
```

### Task 1.5: Phase 1 통합 검증

- [ ] **Step 1: 백엔드 전체 테스트**

Run: `node --test` (cwd: `backend`)
Expected: 전부 PASS. 실패 시 해당 가정(레벨 수/hf 수)을 새 세트로 수정.

- [ ] **Step 2: 라이브 수집 스모크(선택, 네트워크 필요)**

`KMA_AUTH_KEY` 있는 환경에서 `node collect.js`(또는 수집 트리거) 1회 실행 후
`DATA_PATH/kim_nwp/index.json`의 `times` 길이가 1, `levels`에 150hPa 포함, `availability`의 압력면에 `hgt` 포함 확인.

- [ ] **Step 3: 커밋(스모크 산출물 제외)** — 코드 변경 없으면 생략.

---

## Phase 2 — 지도 KIM 레이어 새 층 노출

### Task 2.1: 하드코딩 레벨/캡 점검

**Files:**
- Inspect: `backend/server.js`(`filterKimNwpIndexForMapVariables`/`filterKimCloudIndexForMap`/`filterKimIcingIndexForMap`)
- Inspect: `frontend/src/features/weather-overlays/lib/`(레벨 라벨·색상·선택 기본값), `NwpSliderBar.jsx`/`NwpSliderBarModel.js`

- [ ] **Step 1: 레벨 하드코딩 검색**

Run (repo root): `git grep -nE "925hPa|850hPa|300hPa|levelOrder|LEVELS\\b|level.*\\[" -- frontend/src backend/src | grep -iv test`
점검: index 필터가 특정 레벨만 통과시키는지, 프론트에 `['925hPa',...]` 고정 배열·색상 맵 누락·기본 선택 레벨 하드코딩이 있는지 기록.

- [ ] **Step 2: 발견된 하드캡만 새 세트로 확장**

원칙: 데이터 기반(`availability`)으로 흐르는 코드는 변경 금지. **고정 배열/누락 매핑만** §2.1 세트로 확장. (예: 레벨 라벨/색상 lookup에 1000/250/200/150 항목 추가, 기본 선택 레벨이 제거된 레벨이면 유효 레벨로 보정.)

- [ ] **Step 3: 단위 테스트가 있는 모델 헬퍼면 테스트 추가**

`getNwpSliderOptions`에 12개 레벨·단일 time 입력 시 `availableLevels`가 12개, `showTimeSlider===false`를 단언하는 테스트를 `NwpSliderBarModel` 테스트(있으면)나 신규로 추가.

- [ ] **Step 4: 빌드 + 레이아웃 테스트**

Run: `npm.cmd run build --prefix frontend`
Expected: 성공.

- [ ] **Step 5: 브라우저 스모크(수동)**

dev 서버에서 KIM wind/temp/cloud/icing 레이어 토글 → 레벨 슬라이더에 새 층(1000/250/200/150) 노출, 시간 슬라이더 미표시(time 1개), basemap 전환 후 유지 확인. `docs/ui-responsive-guidelines.md` 준수, 스크린샷 증거 저장.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "feat(weather-overlays): expose expanded KIM levels on map, hide single-time slider"
```

---

## Phase 3 — 백엔드 단면 합성

### Task 3.1: 단면 샘플러 (grid 직접 샘플 → 행렬 + coverage)

**Files:**
- Create: `backend/src/briefing/cross-section-sampler.js`
- Test: `backend/test/cross-section-sampler.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// backend/test/cross-section-sampler.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sampleGridAt, buildCrossSection } from '../src/briefing/cross-section-sampler.js'

const grid2x2 = { grid: { nx: 2, ny: 2, lonMin: 0, lonMax: 1, latMin: 0, latMax: 1 } }

test('sampleGridAt nearest-neighbour indexing', () => {
  const values = [10, 20, 30, 40] // y*nx + x ; (x0y0,x1y0,x0y1,x1y1)
  assert.equal(sampleGridAt(grid2x2.grid, values, 0.0, 0.0), 10)
  assert.equal(sampleGridAt(grid2x2.grid, values, 1.0, 1.0), 40)
  assert.equal(sampleGridAt(grid2x2.grid, values, 5, 5), null) // out of grid
})

test('buildCrossSection assembles levels with altFt from hgt and per-variable coverage', () => {
  const axis = { samples: [{ lon: 0, lat: 0, distanceNm: 0 }, { lon: 1, lat: 1, distanceNm: 10 }] }
  // fieldsByLevel: provider returns decoded field arrays per level/variable.
  const loadLevel = (levelId) => {
    if (levelId === '500hPa') return {
      pressure: 500, grid: grid2x2.grid,
      T: [253, 254, 255, 256], rh: [80, 82, 84, 86], hgt: [5500, 5500, 5500, 5500],
      u: [10, 10, 10, 10], v: [0, 0, 0, 0],
      icingGrade: [1, 1, 2, 2], cloudPotential: [50, 50, 60, 60],
    }
    return null // level not available
  }
  const cs = buildCrossSection({
    axis,
    run: { tmfc: '2026060600', hf: 6, validTime: '2026-06-06T06:00:00Z' },
    levelIds: ['500hPa', '300hPa'],
    loadLevel,
  })
  assert.equal(cs.levels.length, 1) // only 500hPa available
  const l = cs.levels[0]
  assert.equal(l.pressure, 500)
  assert.ok(Math.abs(l.altFt - 5500 * 3.28084) < 1) // hgt m -> ft
  assert.equal(l.values.length, 2)
  assert.equal(l.values[0].distanceNm, 0)
  assert.equal(typeof l.values[0].t, 'number')
  assert.equal(cs.coverage.byVariable.T.available, true)
  assert.equal(cs.coverage.byVariable.T.topPressure, 500)
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/cross-section-sampler.test.js`
Expected: FAIL — 모듈 미존재.

- [ ] **Step 3: 구현**

```js
// backend/src/briefing/cross-section-sampler.js
const M_TO_FT = 3.28084

function gridStep(min, max, count, fallback) {
  if (Number.isFinite(min) && Number.isFinite(max) && count > 1) return (max - min) / (count - 1)
  return fallback
}

export function sampleGridAt(grid, values, lon, lat) {
  if (!grid || !Array.isArray(values)) return null
  const dx = gridStep(grid.lonMin, grid.lonMax, grid.nx, grid.dx)
  const dy = gridStep(grid.latMin, grid.latMax, grid.ny, grid.dy)
  const x = Math.round((lon - grid.lonMin) / dx)
  const y = Math.round((lat - grid.latMin) / dy)
  if (x < 0 || y < 0 || x >= grid.nx || y >= grid.ny) return null
  const v = values[y * grid.nx + x]
  return Number.isFinite(v) ? v : null
}

// loadLevel(levelId) -> { pressure, grid, T, rh, hgt, u, v, icingGrade, cloudPotential } | null
// 결측 변수는 배열 없음(undefined)일 수 있음 → 해당 셀 null.
export function buildCrossSection({ axis, run, levelIds, loadLevel }) {
  const samples = axis?.samples ?? []
  const levels = []
  const coverageTop = { T: null, moisture: null, icing: null, wind: null }
  const has = { T: false, moisture: false, icing: false, wind: false }

  for (const levelId of levelIds) {
    const field = loadLevel(levelId)
    if (!field) continue
    const { pressure, grid } = field
    const altFt = (() => {
      if (!Array.isArray(field.hgt)) return null
      // 경로 평균 지위고도(m) → ft
      let sum = 0
      let n = 0
      for (const s of samples) {
        const h = sampleGridAt(grid, field.hgt, s.lon, s.lat)
        if (Number.isFinite(h)) { sum += h; n += 1 }
      }
      return n > 0 ? (sum / n) * M_TO_FT : null
    })()

    const values = samples.map((s) => ({
      distanceNm: s.distanceNm,
      t: field.T ? nullableC(sampleGridAt(grid, field.T, s.lon, s.lat)) : null,
      moistureSpread: null,
      cloudPotential: field.cloudPotential ? sampleGridAt(grid, field.cloudPotential, s.lon, s.lat) : null,
      icing: field.icingGrade ? sampleGridAt(grid, field.icingGrade, s.lon, s.lat) : null,
      u: field.u ? sampleGridAt(grid, field.u, s.lon, s.lat) : null,
      v: field.v ? sampleGridAt(grid, field.v, s.lon, s.lat) : null,
    }))

    if (field.T) { has.T = true; coverageTop.T = trackTop(coverageTop.T, pressure) }
    if (field.cloudPotential) { has.moisture = true; coverageTop.moisture = trackTop(coverageTop.moisture, pressure) }
    if (field.icingGrade) { has.icing = true; coverageTop.icing = trackTop(coverageTop.icing, pressure) }
    if (field.u && field.v) { has.wind = true; coverageTop.wind = trackTop(coverageTop.wind, pressure) }

    levels.push({ pressure, altFt, values })
  }

  return {
    run,
    levels,
    coverage: {
      byVariable: {
        T: { available: has.T, topPressure: coverageTop.T },
        moisture: { available: has.moisture, topPressure: coverageTop.moisture },
        icing: { available: has.icing, topPressure: coverageTop.icing, disabledByConfig: !has.icing },
        wind: { available: has.wind, topPressure: coverageTop.wind },
      },
    },
    warnings: [],
  }
}

function nullableC(kelvin) {
  return Number.isFinite(kelvin) ? Math.round((kelvin - 273.15) * 100) / 100 : null
}
// topPressure = 가장 낮은 hPa(가장 높은 고도)까지 가용
function trackTop(prev, pressure) {
  return prev == null ? pressure : Math.min(prev, pressure)
}
```

(테스트의 `T:[253..]`는 K로 가정하므로 `nullableC`가 °C 변환. 테스트의 `t` 타입만 검증하므로 통과.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/cross-section-sampler.test.js`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/briefing/cross-section-sampler.js backend/test/cross-section-sampler.test.js
git commit -m "feat(briefing): add cross-section grid sampler with per-variable coverage"
```

### Task 3.2: 단면 라우트 `POST /api/briefing/cross-section`

**Files:**
- Modify: `backend/server.js` (라우트 + level field loader 조립)
- Test: `backend/test/cross-section-route.test.js`

- [ ] **Step 1: 실패하는 테스트 작성(라우트 핸들러 단위)**

```js
// backend/test/cross-section-route.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { app } from '../server.js'

async function call(payload) {
  const res = await app.inject ? null : null // express: use supertest-less fetch via listen
  return res
}

test('cross-section route validates required fields', async () => {
  // 최소 검증: routeGeometry 없는 요청은 400
  // (server.js가 express이므로 통합 호출은 listen 기반 헬퍼 사용 — 기존 테스트 패턴을 따른다)
  assert.ok(typeof app === 'function')
})
```

> 주의: 기존 `backend/test/*`의 Express 호출 패턴(예: `kim-server-index.test.js`)을 그대로 따르라. supertest를 쓰는지 `http.createServer(app).listen` 후 fetch 하는지 확인해 동일 방식으로 작성하고, 위 placeholder를 실제 요청/응답 단언으로 대체:
> - `routeGeometry` 누락 → 400.
> - 정상 요청 → 200 + `{ run, levels, coverage }` 구조, `levels`가 배열.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/cross-section-route.test.js`
Expected: 초기엔 통과(placeholder)지만, 실제 단언으로 교체 후 라우트 미존재로 FAIL.

- [ ] **Step 3: 라우트 구현**

`server.js` 상단 import에 추가:
```js
import { buildCrossSection } from './src/briefing/cross-section-sampler.js'
import { buildRouteAxis } from './src/briefing/route-axis.js'
import { readKimNwpLatest } from './src/processors/kim-nwp-store.js'
import { selectNearestForecastHour } from './src/processors/kim-forecast-hour.js'
import { KIM_NWP_LEVELS, buildKimTemperatureFieldFromGrid, buildKimCloudPotentialFieldFromGrid, buildKimIcingFieldFromGrid } from './src/processors/kim-nwp-model.js'
```
(`readKimNwpGrid`는 이미 import됨.)

`/api/vertical-profile` 라우트 아래에 추가:

```js
app.post('/api/briefing/cross-section', (req, res) => {
  try {
    const { routeGeometry, sampleSpacingMeters } = req.body || {}
    if (!routeGeometry?.coordinates?.length) {
      return res.status(400).json({ error: 'routeGeometry required' })
    }
    const latest = readKimNwpLatest(DATA_ROOT)
    if (!latest?.latestRun) return res.status(503).json({ error: 'kim run unavailable' })
    const tmfc = String(req.body.tmfc || latest.latestRun)
    const candidateHours = (config.kim_nwp?.forecast_hours) || [0, 3, 6, 9, 12]
    const hf = Number.isFinite(Number(req.body.hf))
      ? Number(req.body.hf)
      : selectNearestForecastHour({ tmfc, candidateHours })

    const axis = buildRouteAxis(routeGeometry, sampleSpacingMeters ?? 250)

    const loadLevel = (levelId) => {
      const level = KIM_NWP_LEVELS.find((l) => l.id === levelId)
      if (!level || level.kind !== 'pressure') return null
      let grid
      try {
        grid = readKimNwpGrid({ root: DATA_ROOT, model: 'KIMG/NE57', tmfc, hf, levelId })
      } catch { return null }
      if (!grid) return null
      const out = { pressure: level.value, grid: grid.grid }
      // hgt
      if (grid.variables?.hgt) {
        out.hgt = decodeVar(grid.variables.hgt)
      }
      // T (K)
      if (grid.variables?.T) {
        out.T = decodeVar(grid.variables.T)
      }
      // wind
      if (grid.variables?.u && grid.variables?.v) {
        out.u = decodeVar(grid.variables.u)
        out.v = decodeVar(grid.variables.v)
      }
      // moisture (cloudPotential)
      if (grid.variables?.T && grid.variables?.rh) {
        const f = buildKimCloudPotentialFieldFromGrid(grid)
        out.cloudPotential = decodeArr(f.cloudPotential, f)
      }
      // icing grade
      const icingVars = ['T', 'rh_liq', 'w', 'tqc', 'tqi', 'tqr', 'tqs', 'cld']
      if (icingVars.every((n) => grid.variables?.[n])) {
        const f = buildKimIcingFieldFromGrid(grid)
        out.icingGrade = f.icingGrade.map((v) => (v === -32768 ? null : v))
      }
      return out
    }

    const result = buildCrossSection({
      axis,
      run: { tmfc, hf, validTime: latest.validTime ?? null },
      levelIds: KIM_NWP_LEVELS.filter((l) => l.kind === 'pressure').map((l) => l.id),
      loadLevel,
    })
    sendNoStoreJson(res, result)
  } catch (error) {
    res.status(400).json({ error: error.message || 'cross-section failed' })
  }
})
```

헬퍼(파일 내 지역 함수, 기존 디코드 규칙과 동일):
```js
function decodeVar(variable) {
  const { values = [], scale = 1, offset = 0, encoding } = variable || {}
  if (encoding === 'int16-scaled-json-v1') {
    return values.map((v) => (v === -32768 || !Number.isFinite(v) ? Number.NaN : v * scale + offset))
  }
  return values
}
function decodeArr(values, field) {
  return decodeVar({ values, scale: field.scale, offset: field.offset, encoding: field.encoding })
}
```
(`sendNoStoreJson` 없으면 `setNoStore(res); res.json(result)` 사용 — 기존 헬퍼 이름 확인.)

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/cross-section-route.test.js`
Expected: PASS (400 검증 + 정상 구조).

- [ ] **Step 5: 커밋**

```bash
git add backend/server.js backend/test/cross-section-route.test.js
git commit -m "feat(briefing): add POST /api/briefing/cross-section endpoint"
```

---

## Phase 4 — 프론트 렌더 + 토글

### Task 4.1: 단면 렌더 순수 함수 (고도 변환·보간·등온선·바브)

**Files:**
- Create: `frontend/src/features/route-briefing/lib/crossSectionGrid.js`
- Test: `frontend/src/features/route-briefing/lib/crossSectionGrid.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import { describe, it, expect } from 'vitest'
import { msToKt, windBarbFeathers, windDirectionFromUV, isothermSegments } from './crossSectionGrid.js'

describe('wind helpers', () => {
  it('converts m/s to kt', () => {
    expect(Math.round(msToKt(10))).toBe(19)
  })
  it('computes meteorological from-direction', () => {
    // wind blowing toward east (u>0,v=0) comes FROM west = 270deg
    expect(Math.round(windDirectionFromUV(5, 0))).toBe(270)
    // toward north (v>0) comes FROM south = 180
    expect(Math.round(windDirectionFromUV(0, 5))).toBe(180)
  })
  it('builds barb feathers from knots', () => {
    expect(windBarbFeathers(0)).toEqual({ pennants: 0, full: 0, half: 0 })
    expect(windBarbFeathers(75)).toEqual({ pennants: 1, full: 2, half: 1 }) // 50+10+10+5
  })
})

describe('isothermSegments (marching squares)', () => {
  it('finds a 0C crossing on a 2x2 cell', () => {
    // grid cell values: bottom-left -2, bottom-right 2, top-left -2, top-right 2 (C)
    const cells = { nx: 2, ny: 2, values: [-2, 2, -2, 2], xs: [0, 10], ys: [0, 10] }
    const segs = isothermSegments(cells, 0)
    expect(segs.length).toBeGreaterThan(0)
    // crossing near x=5 on both rows
    expect(Math.abs(segs[0][0].x - 5)).toBeLessThan(0.01)
  })
})
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm.cmd run test --prefix frontend -- crossSectionGrid`
Expected: FAIL — 모듈 미존재. (테스트 러너가 vitest인지 확인; 다르면 기존 프론트 테스트와 동일 러너/문법 사용.)

- [ ] **Step 3: 구현**

```js
// frontend/src/features/route-briefing/lib/crossSectionGrid.js
export const MS_TO_KT = 1.943844

export function msToKt(ms) {
  return Number.isFinite(ms) ? ms * MS_TO_KT : NaN
}

// meteorological direction wind blows FROM, degrees [0,360)
export function windDirectionFromUV(u, v) {
  const dir = (Math.atan2(-u, -v) * 180) / Math.PI
  return (dir + 360) % 360
}

// 50kt pennant, 10kt full, 5kt half
export function windBarbFeathers(kt) {
  let k = Math.max(0, Math.round((Number(kt) || 0) / 5) * 5)
  const pennants = Math.floor(k / 50); k -= pennants * 50
  const full = Math.floor(k / 10); k -= full * 10
  const half = Math.floor(k / 5)
  return { pennants, full, half }
}

export function pressureToFallbackFt(pressure) {
  const table = [[1000, 364], [925, 2500], [850, 5000], [700, 10000], [600, 13800], [500, 18300], [400, 23600], [300, 30000], [250, 34000], [200, 38600], [150, 44600]]
  for (let i = 1; i < table.length; i += 1) {
    if (pressure >= table[i][0]) {
      const [p0, a0] = table[i - 1]; const [p1, a1] = table[i]
      const r = (pressure - p0) / (p1 - p0)
      return a0 + r * (a1 - a0)
    }
  }
  return table[table.length - 1][1]
}

// cells: { nx, ny, values:[row-major y*nx+x], xs:[px per col], ys:[px per row] }
// returns array of segments; each segment = [{x,y},{x,y}]
export function isothermSegments(cells, level) {
  const { nx, ny, values, xs, ys } = cells
  const segs = []
  const at = (x, y) => values[y * nx + x]
  const interp = (a, b, va, vb) => (va === vb ? a : a + (b - a) * ((level - va) / (vb - va)))
  for (let y = 0; y < ny - 1; y += 1) {
    for (let x = 0; x < nx - 1; x += 1) {
      const tl = at(x, y); const tr = at(x + 1, y); const bl = at(x, y + 1); const br = at(x + 1, y + 1)
      if (![tl, tr, bl, br].every(Number.isFinite)) continue
      const pts = []
      // top edge
      if ((tl - level) * (tr - level) < 0) pts.push({ x: interp(xs[x], xs[x + 1], tl, tr), y: ys[y] })
      // bottom edge
      if ((bl - level) * (br - level) < 0) pts.push({ x: interp(xs[x], xs[x + 1], bl, br), y: ys[y + 1] })
      // left edge
      if ((tl - level) * (bl - level) < 0) pts.push({ x: xs[x], y: interp(ys[y], ys[y + 1], tl, bl) })
      // right edge
      if ((tr - level) * (br - level) < 0) pts.push({ x: xs[x + 1], y: interp(ys[y], ys[y + 1], tr, br) })
      if (pts.length >= 2) segs.push([pts[0], pts[1]])
    }
  }
  return segs
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm.cmd run test --prefix frontend -- crossSectionGrid`
Expected: PASS.

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/route-briefing/lib/crossSectionGrid.js frontend/src/features/route-briefing/lib/crossSectionGrid.test.js
git commit -m "feat(route-briefing): cross-section render helpers (alt, isotherms, barbs)"
```

### Task 4.2: 단면 API 클라이언트

**Files:**
- Modify: `frontend/src/api/briefingApi.js`

- [ ] **Step 1: 추가**

```js
export function fetchCrossSection(payload) {
  return postJson('/api/briefing/cross-section', payload)
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npm.cmd run build --prefix frontend`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/api/briefingApi.js
git commit -m "feat(api): add fetchCrossSection client"
```

### Task 4.3: 단면 상태 wiring (useRouteBriefing)

**Files:**
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`

- [ ] **Step 1: 단면 fetch 연동**

기존 vertical profile을 생성/저장하는 지점(=`fetchVerticalProfile` 호출 직후)에서, 동일 payload로 `fetchCrossSection`을 병렬 호출하고 `crossSection` 상태에 저장한다. 실패해도 단면도 본체는 표시되도록 try/catch로 분리:

```js
import { fetchVerticalProfile, fetchCrossSection } from '../../api/briefingApi.js'
// ... 기존 프로파일 생성 함수 내부:
const [profile, crossSection] = await Promise.all([
  fetchVerticalProfile(payload),
  fetchCrossSection(payload).catch(() => null),
])
setVerticalProfile(profile)
setCrossSection(crossSection)
```

`crossSection` state와 반환 객체에 노출(예: `return { ..., crossSection }`). 정확한 변수/세터 이름은 기존 코드의 verticalProfile 패턴을 그대로 따른다.

- [ ] **Step 2: 빌드 확인**

Run: `npm.cmd run build --prefix frontend`
Expected: 성공.

- [ ] **Step 3: 커밋**

```bash
git add frontend/src/features/route-briefing/useRouteBriefing.js
git commit -m "feat(route-briefing): fetch cross-section alongside vertical profile"
```

### Task 4.4: 레이어 토글 UI (VerticalProfileWindow)

**Files:**
- Modify: `frontend/src/features/route-briefing/VerticalProfileWindow.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: 토글 상태 + 음영 상호배타**

`VerticalProfileWindow`에 4개 토글 상태를 둔다. 음영 가드: ICING↔MOISTURE 중 하나를 켜면 다른 하나 off.

```jsx
import { useState } from 'react'
import VerticalProfileChart from './VerticalProfileChart.jsx'

export default function VerticalProfileWindow({ profile, crossSection, isOpen, onClose }) {
  const [layers, setLayers] = useState({ temp: true, wind: true, icing: false, moisture: false })
  if (!profile || !isOpen) return null

  const toggle = (key) => setLayers((prev) => {
    const next = { ...prev, [key]: !prev[key] }
    if (key === 'icing' && next.icing) next.moisture = false
    if (key === 'moisture' && next.moisture) next.icing = false
    return next
  })

  return (
    <div className="vertical-profile-window-backdrop" role="presentation">
      <section className="vertical-profile-window" role="dialog" aria-modal="true" aria-label={'연직단면도'}>
        <div className="vertical-profile-window-header">
          <div>
            <div className="vertical-profile-window-eyebrow">Vertical Profile</div>
            <div className="vertical-profile-window-title">{'연직단면도'}</div>
          </div>
          <button type="button" className="vertical-profile-window-close" onClick={onClose}>{'닫기'}</button>
        </div>
        <div className="cross-section-toggles" role="group" aria-label="레이어">
          {[['temp', 'TEMP'], ['moisture', 'Moisture'], ['icing', 'Icing'], ['wind', 'Wind']].map(([k, label]) => (
            <button key={k} type="button" className={`cs-toggle${layers[k] ? ' is-on' : ''}`} aria-pressed={layers[k]} onClick={() => toggle(k)}>{label}</button>
          ))}
        </div>
        <VerticalProfileChart profile={profile} crossSection={crossSection} layers={layers} />
      </section>
    </div>
  )
}
```

`App.jsx`/호출부에서 `crossSection`을 prop으로 전달하도록 연결(useRouteBriefing 반환값 사용).

- [ ] **Step 2: CSS 추가**

`RouteBriefing.css`에 `.cross-section-toggles`, `.cs-toggle`, `.cs-toggle.is-on` 스타일 추가(기존 토큰/색상 관습 따름).

- [ ] **Step 3: 빌드 확인**

Run: `npm.cmd run build --prefix frontend`
Expected: 성공.

- [ ] **Step 4: 커밋**

```bash
git add frontend/src/features/route-briefing/VerticalProfileWindow.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(route-briefing): add cross-section layer toggles with shading mutual-exclusion"
```

### Task 4.5: 단면 레이어 렌더 (VerticalProfileChart)

**Files:**
- Modify: `frontend/src/features/route-briefing/VerticalProfileChart.jsx`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

- [ ] **Step 1: props 수용 + 좌표 매핑**

`VerticalProfileChart`가 `crossSection`, `layers` props를 받는다. 기존 `xFor(distanceNm)`·`yFor(altitudeFt)`를 재사용. 각 level의 `altFt`(hgt 기반, 없으면 `pressureToFallbackFt(pressure)`)로 y를 구한다.

```jsx
import { msToKt, windBarbFeathers, windDirectionFromUV, isothermSegments, pressureToFallbackFt } from './lib/crossSectionGrid.js'
// 시그니처: export default function VerticalProfileChart({ profile, crossSection = null, layers = {} }) {
```

- [ ] **Step 2: 음영(ICING/MOISTURE) 렌더**

`crossSection.levels`를 거리×고도 셀로 그린다. 각 인접(level i, level i+1)×(sample j, j+1) 사각형을, 활성 음영 변수값(icing grade 또는 cloudPotential)의 평균 밴드 색으로 채운다. 색 매핑은 간단 밴드 함수(아래)로 시작, 추후 기존 램프와 일치시킨다.

```jsx
const altFor = (lvl) => Number.isFinite(lvl.altFt) ? lvl.altFt : pressureToFallbackFt(lvl.pressure)
function icingColor(g) { return ['rgba(0,0,0,0)', 'rgba(120,180,255,0.35)', 'rgba(120,120,255,0.5)', 'rgba(150,80,220,0.6)'][Math.max(0, Math.min(3, Math.round(g)))] }
function moistureColor(p) { if (!Number.isFinite(p)) return 'rgba(0,0,0,0)'; const a = Math.max(0, Math.min(1, p / 100)); return `rgba(60,140,90,${0.15 + a * 0.45})` }
```

활성 음영(`layers.icing` 또는 `layers.moisture`)일 때만 셀 `<rect>`(또는 `<polygon>`)를 그린다. 상단 빈 구간(해당 변수 미가용 level)은 건너뛴다.

- [ ] **Step 3: TEMP 등온선 렌더**

`layers.temp`이면, 거리×고도 격자의 `t`값으로 `isothermSegments`를 5°C 간격(예: -60..40)으로 호출해 선을 그린다. 0°C는 굵게. 격자 `cells`는 levels×samples를 픽셀좌표(xFor/yFor)로 변환해 구성.

- [ ] **Step 4: WIND 바브 렌더**

`layers.wind`이면, 거리축 ~20NM 간격으로 샘플 인덱스를 thinning하고 각 level마다 `u,v`→`msToKt`/`windDirectionFromUV`/`windBarbFeathers`로 바브 path를 그린다.

- [ ] **Step 5: 범례 + 데이터 상한 라인**

활성 레이어 범례와 `coverage.byVariable[*].topPressure`에 해당하는 고도에 "데이터 상한" 점선 표기.

- [ ] **Step 6: 빌드 + 기존 차트 회귀**

Run: `npm.cmd run build --prefix frontend`
Expected: 성공. crossSection이 null이어도 기존 지형/프로파일 정상 렌더.

- [ ] **Step 7: 커밋**

```bash
git add frontend/src/features/route-briefing/VerticalProfileChart.jsx frontend/src/features/route-briefing/RouteBriefing.css
git commit -m "feat(route-briefing): render cross-section shading, isotherms, and wind barbs"
```

### Task 4.6: 통합 검증 (브라우저)

- [ ] **Step 1: dev 서버 기동 후 단면도 열기**

경로 검색 → 연직단면도 열기. 토글 동작 확인:
- TEMP 등온선·0°C 강조, WIND 바브 항상 중첩.
- ICING↔MOISTURE 음영 상호배타(하나 켜면 다른 하나 off).
- Moisture/Icing 상단(300hPa)·Temp/Wind 상단(150hPa) 빈 구간 처리.

- [ ] **Step 2: 회귀**

- 기존 vertical-profile(지형·계획고도·TOD·마커) 불변.
- 단면 API 실패/결측 시 본체만 정상 표시.

- [ ] **Step 3: UI 증거**

`docs/ui-responsive-guidelines.md`에 따라 데스크톱/모바일 뷰포트 스크린샷을 타임스탬프 폴더에 저장, 리뷰 이슈 정리.

---

## Self-Review (작성자 체크 — 완료)

**Spec coverage:**
- §1 4종 중첩/표현 → Task 4.4(토글·상호배타), 4.5(등온선/음영/바브). ✓
- §2.1 차등 층 + hgt → Task 1.2, 1.3. ✓
- §4.1 수집 확장 + 단일 hf → Task 1.3, 1.4. ✓
- §4.2 지도 새 층 노출 → Phase 2. ✓
- §3 엔드포인트/스키마 → Task 3.1, 3.2. ✓
- §5 hgt 고도축 + fallback → Task 3.1(altFt), 4.1(pressureToFallbackFt), 4.5. ✓
- §5.1 렌더 규칙 → Task 4.1(순수함수), 4.5(렌더). ✓
- §6 토글 UI → Task 4.4. ✓
- §7 단일 valid time/슬라이더 폐기 → Task 1.4 + 지도 자동 숨김(Phase 2). ✓
- §9 검증 → 각 Phase 검증 Task + 4.6. ✓

**Placeholder scan:** Task 3.2 Step1은 기존 Express 테스트 패턴을 따르라는 지시 + 실제 단언 명세를 둠(러너 확인 필요 항목). 실행자는 동일 디렉터리의 기존 route 테스트를 모델로 사용할 것.

**Type consistency:** `selectNearestForecastHour`(1.1)→processor(1.4)·server(3.2) 동일 사용. `buildCrossSection`/`sampleGridAt`(3.1) 시그니처가 route(3.2)·테스트와 일치. `crossSection`/`layers` props가 4.3→4.4→4.5 일관. `pressureToFallbackFt`/`isothermSegments`/`windBarbFeathers`(4.1)→4.5 사용 일치.

**구현 중 확인할 환경 의존 항목(플랜이 단정하지 않음):**
- 프론트 테스트 러너(vitest 가정) — 기존 프론트 테스트 문법에 맞춰 조정.
- Express 통합 테스트 방식 — 기존 `backend/test`의 route 테스트 패턴 준수.
- `setNoStore`/JSON 헬퍼 정확한 이름 — server.js 기존 헬퍼 확인.
