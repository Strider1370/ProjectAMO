# ADS-B 항적 패널 분리 및 필터 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ADS-B를 기상 레이어 패널에서 떼어내 독립 `항적` 패널로 옮기고, 소속·고도·기종·편명 필터로 조건에 맞지 않는 항공기를 지도에서 숨긴다.

**Architecture:** 판정은 전부 순수 모듈 `trafficFilter.js` 한 곳에서 한다. 그 모듈이 조건에 맞는 기체의 `icao24` 목록을 만들고, 지도에는 `['in', ['get','icao24'], ['literal', ids]]` 한 줄짜리 규칙으로 적용한다. 표현식과 JS 판정이 갈라져 어긋나는 문제를 원천 제거하기 위해 판정은 JS 한 번만 하고 지도에는 결과 목록만 넘긴다. 데이터·레이어 정의(`addAdsbLayer.js`)와 백엔드는 손대지 않는다.

**Tech Stack:** React 18 (함수형 컴포넌트, 훅), MapLibre/Mapbox GL (`setFilter`), 테스트는 `node:test` + `node:assert/strict`, 브라우저 검증은 Playwright(`frontend/node_modules`), 스타일은 프로젝트 CSS 토큰 + 기존 `layer-drawer` 클래스.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-30-adsb-traffic-panel-design.md`. 스펙에 없는 사용자 영향 결정을 새로 만들지 않는다.
- 프런트엔드 전용. `backend/`, 파서, 데이터 스키마, `frontend/src/features/aviation-layers/addAdsbLayer.js`는 수정하지 않는다.
- 리눅스 셸에서만 실행한다(`npm`, `node`, `git`). 모든 명령은 저장소 루트 `~/ProjectAMO`에서 실행한다.
- 고도 단위: 지도 속성 `baro_altitude`는 **미터**, 화면 표시는 **ft**. 변환은 `trafficFilter.js`에서만 한다. 상수 `FEET_PER_METER = 3.28084`.
- 고도 슬라이더 범위 `0 ~ 45000 ft`, 단위 `500 ft`.
- 저장 키는 `amo.traffic.filters.v1`. 검색어는 저장하지 않는다. ADS-B 켜기/끄기도 저장하지 않는다.
- 필터 그룹 id 문자열은 `'airline' | 'agency' | 'unclassified'` 세 개로 고정하고 전 파일에서 이 철자를 쓴다.
- 한글 UI 문구는 계획에 적힌 문자열을 그대로 쓴다.
- 커밋 메시지는 한 줄 요약 + 빈 줄 + 아래 두 줄을 붙인다.
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
  ```
- 코드 변경 후 `graphify update .` 를 실행한다.

## File Structure

| 파일 | 책임 |
|---|---|
| `frontend/src/features/traffic/trafficFilter.js` (신규) | 순수 판정·집계. 소속 그룹 판정, 필터 통과 판정, 보이는 `icao24` 목록, 지도 규칙 생성, 소속별 대수, ft↔m 변환 |
| `frontend/src/features/traffic/trafficFilter.test.js` (신규) | 위 모듈의 단위 테스트 |
| `frontend/src/features/traffic/trafficStorage.js` (신규) | 저장값 파싱/직렬화 (순수) |
| `frontend/src/features/traffic/trafficStorage.test.js` (신규) | 저장값 검증 테스트 |
| `frontend/src/features/traffic/useTrafficFilters.js` (신규) | 필터 상태 훅 + localStorage 연결 |
| `frontend/src/features/traffic/TrafficPanel.jsx` (신규) | 패널 화면. 상태를 갖지 않고 props로만 받는다 |
| `frontend/src/features/traffic/TrafficPanel.css` (신규) | 패널 전용 스타일(기존 `layer-drawer` 재사용 + 필터 위젯) |
| `frontend/src/features/traffic/TrafficPanel.structure.test.js` (신규) | 패널 구조 회귀 테스트(문자열·클래스 존재) |
| `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` | `MET_LAYERS`에서 `adsb` 제거 |
| `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` | `traffic` 그룹·라벨 제거 |
| `frontend/src/features/map/layerActions.js` | `MET_META.adsb` 제거, `TRAFFIC_ACTIONS` 추가, `ALL_ACTIONS`에 합류 |
| `frontend/src/features/map/layerActions.test.js` | 항적 액션 커버리지 테스트 추가 |
| `frontend/src/app/layout/Sidebar.jsx` | `항적` 항목·`PANEL_MAP`·배지 추가 |
| `frontend/src/app/layout/MobileMapOverlay.jsx` | 모바일 `항적` 버튼 추가 |
| `frontend/src/app/App.jsx` | `MobileMapOverlay`에 `trafficCount` 전달 |
| `frontend/src/features/map/MapView.jsx` | `metVisibility.adsb` → 전용 상태, 패널 분기, 필터를 3개 레이어에 적용, 대수 계산 |
| `frontend/scripts/traffic-panel-capture.mjs` (신규) | Playwright 브라우저 검증 스크립트 |

---

### Task 1: trafficFilter.js — 순수 판정·집계

**Files:**
- Create: `frontend/src/features/traffic/trafficFilter.js`
- Test: `frontend/src/features/traffic/trafficFilter.test.js`

**Interfaces:**
- Consumes: `frontend/src/features/aviation-layers/airlines.js`의 `airlineCode(callsign)`, `AIRLINE_NAMES`; `frontend/src/features/aviation-layers/operators.js`의 `operatorCode(registration)`, `OPERATOR_NAMES`.
- Produces:
  - `DEFAULT_FILTERS` — `{ groups: [], codes: [], altitudeFt: [0, 45000], classes: [], search: '' }`
  - `ALTITUDE_MIN_FT = 0`, `ALTITUDE_MAX_FT = 45000`, `ALTITUDE_STEP_FT = 500`, `FEET_PER_METER = 3.28084`
  - `OPERATOR_GROUPS` — `['airline', 'agency', 'unclassified']`
  - `GROUP_LABELS` — `{ airline: '항공사', agency: '기관·훈련기', unclassified: '미분류' }`
  - `CLASS_LABELS` — `{ heavy: '대형기', jet: '제트', regional: '리저널', turboprop: '터보프롭', piston: '피스톤', helicopter: '헬기', unknown: '미분류' }`
  - `operatorInfo(props) -> { group, code, name }`
  - `hasActiveFilters(filters) -> boolean`
  - `matchesFilters(props, filters) -> boolean`
  - `visibleIds(features, filters) -> string[]`
  - `adsbIdFilter(ids) -> maplibre expression`
  - `countAircraft(features) -> { total, groups: {airline,agency,unclassified}, items: [{code,name,group,count}] }`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/traffic/trafficFilter.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_FILTERS, ALTITUDE_MAX_FT, FEET_PER_METER,
  operatorInfo, hasActiveFilters, matchesFilters, visibleIds, adsbIdFilter, countAircraft,
} from './trafficFilter.js'

// 지도에 올라가는 feature 모양 그대로(createAdsbGeoJSON) — 고도는 미터다.
function ac(over = {}) {
  return {
    properties: {
      icao24: 'aaa001', callsign: 'KAL123', registration: 'HL8123',
      aircraft_class: 'jet', baro_altitude: 10000 / FEET_PER_METER,
      ...over,
    },
  }
}
const KAL = ac()
const KFS = ac({ icao24: 'bbb002', callsign: 'HL9176', registration: 'HL9176', aircraft_class: 'helicopter', baro_altitude: 1500 / FEET_PER_METER })
const FOREIGN = ac({ icao24: 'ccc003', callsign: 'CPA411', registration: 'B-LAA', aircraft_class: 'heavy', baro_altitude: 35000 / FEET_PER_METER })
const NO_ALT = ac({ icao24: 'ddd004', callsign: 'JJA201', registration: 'HL8321', baro_altitude: null })

test('소속 그룹 판정 — 항공사 / 기관·훈련기 / 미분류', () => {
  assert.deepEqual(operatorInfo(KAL.properties), { group: 'airline', code: 'KAL', name: '대한항공' })
  assert.deepEqual(operatorInfo(KFS.properties), { group: 'agency', code: 'KFS', name: '산림청' }) // HL9176은 operators.js 산림청 명단
  assert.equal(operatorInfo(FOREIGN.properties).group, 'unclassified')
  assert.equal(operatorInfo(FOREIGN.properties).code, 'CPA')
})

test('아무것도 고르지 않으면 필터 없음 — 전부 통과', () => {
  assert.equal(hasActiveFilters(DEFAULT_FILTERS), false)
  for (const a of [KAL, KFS, FOREIGN, NO_ALT]) {
    assert.equal(matchesFilters(a.properties, DEFAULT_FILTERS), true)
  }
})

test('그룹 체크는 그 그룹의 개별 체크와 같은 결과', () => {
  const byGroup = { ...DEFAULT_FILTERS, groups: ['agency'] }
  const byCode = { ...DEFAULT_FILTERS, codes: [operatorInfo(KFS.properties).code] }
  const all = [KAL, KFS, FOREIGN]
  assert.deepEqual(visibleIds(all, byGroup), visibleIds(all, byCode))
  assert.deepEqual(visibleIds(all, byGroup), ['bbb002'])
})

test('같은 필터 안에서는 OR, 다른 필터끼리는 AND', () => {
  const or = { ...DEFAULT_FILTERS, groups: ['agency', 'airline'] }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], or), ['aaa001', 'bbb002'])

  const and = { ...DEFAULT_FILTERS, groups: ['airline'], classes: ['helicopter'] }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], and), [])
})

test('고도 구간은 양끝을 포함한다', () => {
  const band = { ...DEFAULT_FILTERS, altitudeFt: [10000, 35000] }
  assert.equal(matchesFilters(KAL.properties, band), true)     // 정확히 10000ft
  assert.equal(matchesFilters(FOREIGN.properties, band), true)  // 정확히 35000ft
  assert.equal(matchesFilters(KFS.properties, band), false)     // 1500ft
})

test('고도 미보고 기체 — 전 구간이면 보이고, 구간을 좁히면 숨는다', () => {
  assert.equal(matchesFilters(NO_ALT.properties, DEFAULT_FILTERS), true)
  assert.equal(matchesFilters(NO_ALT.properties, { ...DEFAULT_FILTERS, altitudeFt: [0, ALTITUDE_MAX_FT - 500] }), false)
})

test('icao24 없는 기체는 필터가 걸린 동안 숨는다 — 식별 불가', () => {
  const ghost = ac({ icao24: null })
  assert.deepEqual(visibleIds([ghost], { ...DEFAULT_FILTERS, groups: ['airline'] }), [])
})

test('검색어가 있으면 다른 필터를 무시한다', () => {
  const filters = { ...DEFAULT_FILTERS, groups: ['agency'], altitudeFt: [0, 3000], search: 'kal' }
  assert.deepEqual(visibleIds([KAL, KFS, FOREIGN], filters), ['aaa001'])
})

test('검색은 편명·등록기호 부분일치, 대소문자 무시', () => {
  const byReg = { ...DEFAULT_FILTERS, search: 'hl91' }
  assert.deepEqual(visibleIds([KAL, KFS], byReg), ['bbb002'])
})

test('지도 규칙은 icao24 목록 하나로 만든다', () => {
  assert.deepEqual(adsbIdFilter(['aaa001', 'bbb002']), ['in', ['get', 'icao24'], ['literal', ['aaa001', 'bbb002']]])
})

test('소속별 대수 — 그룹 합계와 개별 항목', () => {
  const counts = countAircraft([KAL, KAL, KFS, FOREIGN])
  assert.equal(counts.total, 4)
  assert.deepEqual(counts.groups, { airline: 2, agency: 1, unclassified: 1 })
  const kal = counts.items.find((i) => i.code === 'KAL')
  assert.deepEqual(kal, { code: 'KAL', name: '대한항공', group: 'airline', count: 2 })
  assert.equal(counts.items.some((i) => i.group === 'unclassified'), false) // 미분류는 개별로 펼치지 않는다
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/traffic/trafficFilter.test.js`
Expected: FAIL — `Cannot find module ... trafficFilter.js`

- [ ] **Step 3: 구현 작성**

`frontend/src/features/traffic/trafficFilter.js`:

```js
// ADS-B 항적 필터의 판정·집계 — 순수 함수만. 지도(MapLibre)에는 판정 결과인 icao24 목록만 넘긴다.
// 표현식으로 같은 판정을 한 번 더 쓰지 않는 이유: 두 곳이 어긋나면 "숨겼는데 로고만 남는" 종류의
// 버그가 조용히 생긴다. 판정은 여기 한 번뿐이다.
import { AIRLINE_NAMES, airlineCode } from '../aviation-layers/airlines.js'
import { OPERATOR_NAMES, operatorCode } from '../aviation-layers/operators.js'

export const FEET_PER_METER = 3.28084
export const ALTITUDE_MIN_FT = 0
export const ALTITUDE_MAX_FT = 45000
export const ALTITUDE_STEP_FT = 500

export const OPERATOR_GROUPS = ['airline', 'agency', 'unclassified']
export const GROUP_LABELS = { airline: '항공사', agency: '기관·훈련기', unclassified: '미분류' }
export const CLASS_LABELS = {
  heavy: '대형기', jet: '제트', regional: '리저널', turboprop: '터보프롭',
  piston: '피스톤', helicopter: '헬기', unknown: '미분류',
}

export const DEFAULT_FILTERS = {
  groups: [],
  codes: [],
  altitudeFt: [ALTITUDE_MIN_FT, ALTITUDE_MAX_FT],
  classes: [],
  search: '',
}

// 소속은 지도 속성 operator를 쓰지 않는다 — 그 값은 "로고 파일이 있는 코드"라서 로고 없는
// 항공사(하이에어 등)가 빈 문자열로 온다. 편명·등록기호에서 다시 판정한다.
export function operatorInfo(props = {}) {
  const agency = operatorCode(props.registration)
  if (agency && OPERATOR_NAMES[agency]) return { group: 'agency', code: agency, name: OPERATOR_NAMES[agency] }
  const airline = airlineCode(props.callsign)
  if (airline && AIRLINE_NAMES[airline]) return { group: 'airline', code: airline, name: AIRLINE_NAMES[airline] }
  return { group: 'unclassified', code: airline || '', name: '' }
}

function isFullAltitudeRange([lo, hi] = []) {
  return lo <= ALTITUDE_MIN_FT && hi >= ALTITUDE_MAX_FT
}

export function hasActiveFilters(filters = DEFAULT_FILTERS) {
  if (filters.search?.trim()) return true
  if (filters.groups?.length || filters.codes?.length || filters.classes?.length) return true
  return !isFullAltitudeRange(filters.altitudeFt || [])
}

function matchesSearch(props, term) {
  const needle = term.trim().toLowerCase()
  return [props.callsign, props.registration]
    .some((v) => String(v || '').toLowerCase().includes(needle))
}

export function matchesFilters(props = {}, filters = DEFAULT_FILTERS) {
  // 검색은 "찾기"다 — 다른 조건 때문에 못 찾는 상황을 만들지 않는다.
  if (filters.search?.trim()) return matchesSearch(props, filters.search)

  const { group, code } = operatorInfo(props)
  const wantsOperator = (filters.groups?.length || 0) + (filters.codes?.length || 0) > 0
  if (wantsOperator && !(filters.groups?.includes(group) || (code && filters.codes?.includes(code)))) return false

  if (filters.classes?.length && !filters.classes.includes(props.aircraft_class || 'unknown')) return false

  const [lo, hi] = filters.altitudeFt || DEFAULT_FILTERS.altitudeFt
  if (!isFullAltitudeRange([lo, hi])) {
    // 고도를 안 보내는 기체는 구간 안인지 판정할 수 없다 → 구간이 좁혀져 있으면 숨긴다.
    if (!Number.isFinite(props.baro_altitude)) return false
    const ft = props.baro_altitude * FEET_PER_METER
    if (ft < lo || ft > hi) return false
  }
  return true
}

export function visibleIds(features = [], filters = DEFAULT_FILTERS) {
  const out = []
  for (const f of features) {
    const props = f?.properties || {}
    if (!props.icao24) continue // 식별할 수 없는 기체는 규칙에 넣을 수 없다
    if (matchesFilters(props, filters)) out.push(props.icao24)
  }
  return out
}

export function adsbIdFilter(ids = []) {
  return ['in', ['get', 'icao24'], ['literal', ids]]
}

export function countAircraft(features = []) {
  const groups = { airline: 0, agency: 0, unclassified: 0 }
  const byCode = new Map()
  for (const f of features) {
    const { group, code, name } = operatorInfo(f?.properties || {})
    groups[group] += 1
    if (group === 'unclassified') continue // 미분류는 개별로 펼치지 않는다
    const prev = byCode.get(code)
    if (prev) prev.count += 1
    else byCode.set(code, { code, name, group, count: 1 })
  }
  const items = [...byCode.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  return { total: features.length, groups, items }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/traffic/trafficFilter.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/traffic/trafficFilter.js frontend/src/features/traffic/trafficFilter.test.js
git commit -m "$(cat <<'EOF'
feat(traffic): add ADS-B filter predicate and counts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 2: 필터 저장/복원

**Files:**
- Create: `frontend/src/features/traffic/trafficStorage.js`, `frontend/src/features/traffic/useTrafficFilters.js`
- Test: `frontend/src/features/traffic/trafficStorage.test.js`

**Interfaces:**
- Consumes: Task 1의 `DEFAULT_FILTERS`, `ALTITUDE_MIN_FT`, `ALTITUDE_MAX_FT`, `ALTITUDE_STEP_FT`, `OPERATOR_GROUPS`, `CLASS_LABELS`.
- Produces:
  - `trafficStorage.js`: `STORAGE_KEY = 'amo.traffic.filters.v1'`, `parseStoredFilters(raw) -> filters`, `serializeFilters(filters) -> string`
  - `useTrafficFilters.js`: `useTrafficFilters() -> { filters, setFilters, resetFilters }` (`setFilters`는 부분 갱신 객체를 받는다)

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/traffic/trafficStorage.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { DEFAULT_FILTERS } from './trafficFilter.js'
import { parseStoredFilters, serializeFilters } from './trafficStorage.js'

test('정상 저장값을 그대로 복원한다', () => {
  const saved = serializeFilters({ ...DEFAULT_FILTERS, groups: ['agency'], codes: ['KFS'], classes: ['helicopter'], altitudeFt: [0, 5000] })
  assert.deepEqual(parseStoredFilters(saved), {
    groups: ['agency'], codes: ['KFS'], classes: ['helicopter'], altitudeFt: [0, 5000], search: '',
  })
})

test('검색어는 저장하지 않는다', () => {
  const saved = serializeFilters({ ...DEFAULT_FILTERS, search: 'KAL' })
  assert.equal(JSON.parse(saved).search, undefined)
  assert.equal(parseStoredFilters(saved).search, '')
})

test('깨진 값·없는 값은 기본값으로 떨어진다', () => {
  for (const raw of [null, '', 'not json', '[]', '{"groups":"agency"}']) {
    assert.deepEqual(parseStoredFilters(raw), DEFAULT_FILTERS)
  }
})

test('모르는 그룹·기종은 버린다', () => {
  const saved = JSON.stringify({ groups: ['agency', 'aliens'], classes: ['jet', 'ufo'] })
  const parsed = parseStoredFilters(saved)
  assert.deepEqual(parsed.groups, ['agency'])
  assert.deepEqual(parsed.classes, ['jet'])
})

test('고도 구간은 범위 안으로 자르고 순서를 바로잡는다', () => {
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: [90000, -20] })).altitudeFt, [0, 45000])
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: [12000, 3000] })).altitudeFt, [3000, 12000])
  assert.deepEqual(parseStoredFilters(JSON.stringify({ altitudeFt: ['a', 'b'] })).altitudeFt, [0, 45000])
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/traffic/trafficStorage.test.js`
Expected: FAIL — `Cannot find module ... trafficStorage.js`

- [ ] **Step 3: 구현 작성**

`frontend/src/features/traffic/trafficStorage.js`:

```js
// 필터 저장값 검증 — 저장소는 사용자가 손댈 수 있고 버전이 바뀔 수도 있으니, 모르는 값은
// 조용히 버리고 기본값으로 돌린다(필터가 깨져서 화면이 비는 것보다 전체 표시가 안전하다).
import { ALTITUDE_MAX_FT, ALTITUDE_MIN_FT, CLASS_LABELS, DEFAULT_FILTERS, OPERATOR_GROUPS } from './trafficFilter.js'

export const STORAGE_KEY = 'amo.traffic.filters.v1'

const CLASS_IDS = Object.keys(CLASS_LABELS)

function stringList(value, allowed) {
  if (!Array.isArray(value)) return []
  const out = value.filter((v) => typeof v === 'string' && (!allowed || allowed.includes(v)))
  return [...new Set(out)]
}

function altitudeRange(value) {
  if (!Array.isArray(value) || value.length !== 2) return [...DEFAULT_FILTERS.altitudeFt]
  const nums = value.map(Number)
  if (!nums.every(Number.isFinite)) return [...DEFAULT_FILTERS.altitudeFt]
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  return [
    Math.max(ALTITUDE_MIN_FT, Math.min(ALTITUDE_MAX_FT, lo)),
    Math.max(ALTITUDE_MIN_FT, Math.min(ALTITUDE_MAX_FT, hi)),
  ]
}

export function parseStoredFilters(raw) {
  let parsed = null
  try { parsed = JSON.parse(raw) } catch { parsed = null }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...DEFAULT_FILTERS }
  return {
    groups: stringList(parsed.groups, OPERATOR_GROUPS),
    codes: stringList(parsed.codes, null),
    classes: stringList(parsed.classes, CLASS_IDS),
    altitudeFt: altitudeRange(parsed.altitudeFt),
    search: '', // 검색어는 일회성 — 저장·복원하지 않는다
  }
}

export function serializeFilters(filters = DEFAULT_FILTERS) {
  const { search, ...rest } = filters
  return JSON.stringify(rest)
}
```

`frontend/src/features/traffic/useTrafficFilters.js`:

```js
import { useCallback, useEffect, useState } from 'react'

import { DEFAULT_FILTERS } from './trafficFilter.js'
import { STORAGE_KEY, parseStoredFilters, serializeFilters } from './trafficStorage.js'

// 필터 상태 + 브라우저 저장. 켜기/끄기는 여기 없다(다른 지도 레이어와 같이 저장하지 않는다).
export default function useTrafficFilters() {
  const [filters, setFiltersState] = useState(() => {
    try { return parseStoredFilters(window.localStorage.getItem(STORAGE_KEY)) } catch { return { ...DEFAULT_FILTERS } }
  })

  useEffect(() => {
    try { window.localStorage.setItem(STORAGE_KEY, serializeFilters(filters)) } catch { /* 저장 실패는 무시 — 필터는 계속 동작한다 */ }
  }, [filters])

  const setFilters = useCallback((patch) => {
    setFiltersState((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetFilters = useCallback(() => {
    setFiltersState({ ...DEFAULT_FILTERS })
  }, [])

  return { filters, setFilters, resetFilters }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/traffic/trafficStorage.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/traffic/trafficStorage.js frontend/src/features/traffic/trafficStorage.test.js frontend/src/features/traffic/useTrafficFilters.js
git commit -m "$(cat <<'EOF'
feat(traffic): persist ADS-B filters across sessions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 3: TrafficPanel 화면

**Files:**
- Create: `frontend/src/features/traffic/TrafficPanel.jsx`, `frontend/src/features/traffic/TrafficPanel.css`
- Test: `frontend/src/features/traffic/TrafficPanel.structure.test.js`

**Interfaces:**
- Consumes: Task 1의 `CLASS_LABELS`, `GROUP_LABELS`, `OPERATOR_GROUPS`, `ALTITUDE_MIN_FT`, `ALTITUDE_MAX_FT`, `ALTITUDE_STEP_FT`, `hasActiveFilters`.
- Produces: `TrafficPanel` 기본 내보내기. props:
  - `visible: boolean` — ADS-B 표시 켜짐
  - `onToggleVisible: () => void`
  - `filters`, `onChangeFilters(patch)`, `onResetFilters()`
  - `counts: { total, groups, items }` (Task 1 `countAircraft` 결과)
  - `visibleCount: number`
  - `receiving: boolean` — 첫 응답 대기 중
  - `onClose: () => void`

- [ ] **Step 1: 실패하는 테스트 작성**

이 테스트는 화면 구조의 회귀만 잡는다(문구·클래스·필수 위젯 존재). 실제 동작 확인은 Task 7의 Playwright다. 프로젝트에 DOM 렌더 테스트 도구가 없어 기존 `TafTab.compact.test.js`와 같은 소스 구조 검사 방식을 따른다.

`frontend/src/features/traffic/TrafficPanel.structure.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./TrafficPanel.jsx', import.meta.url), 'utf8')
const css = readFileSync(new URL('./TrafficPanel.css', import.meta.url), 'utf8')

test('기존 패널 껍데기를 재사용한다', () => {
  assert.match(source, /dev-layer-panel layer-drawer/)
  assert.match(source, /aria-label="항적 필터"/)
})

test('켜기/끄기 스위치와 다섯 구역이 있다', () => {
  assert.match(source, /ADS-B 표시/)
  for (const title of ['소속', '고도', '기종', '검색']) {
    assert.ok(source.includes(title), `구역 없음: ${title}`)
  }
  assert.match(source, /필터 초기화/)
})

test('고도는 슬라이더 두 개(이중 슬라이더)다', () => {
  const ranges = source.match(/type="range"/g) || []
  assert.equal(ranges.length, 2)
  assert.match(source, /ALTITUDE_STEP_FT/)
  assert.match(css, /\.traffic-alt-slider/)
})

test('꺼져 있으면 필터를 비활성하고 안내를 보여준다', () => {
  assert.match(source, /ADS-B를 켜면 지금 떠 있는 소속이 표시됩니다/)
  assert.match(source, /disabled=\{!visible\}/)
})

test('수신 중·조건에 맞는 기체 없음·안 떠 있는 선택을 각각 안내한다', () => {
  assert.match(source, /수신 중/)
  assert.match(source, /조건에 맞는 항공기 없음/)
  assert.match(source, /선택했지만 지금 안 떠 있음/)
})

test('보이는 수와 전체 수를 함께 보여준다', () => {
  assert.match(source, /보이는 항공기/)
  assert.match(source, /\{visibleCount\}/)
  assert.match(source, /\{counts\.total\}/)
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/traffic/TrafficPanel.structure.test.js`
Expected: FAIL — `ENOENT ... TrafficPanel.jsx`

- [ ] **Step 3: 구현 작성**

`frontend/src/features/traffic/TrafficPanel.jsx`:

```jsx
import { useState } from 'react'
import { Radio, X } from 'lucide-react'

import {
  ALTITUDE_MAX_FT, ALTITUDE_MIN_FT, ALTITUDE_STEP_FT,
  CLASS_LABELS, GROUP_LABELS, OPERATOR_GROUPS, hasActiveFilters,
} from './trafficFilter.js'
import './TrafficPanel.css'

const CLASS_IDS = Object.keys(CLASS_LABELS)

function toggleInList(list = [], value) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

function OperatorGroup({ group, counts, filters, onChangeFilters, disabled }) {
  const [open, setOpen] = useState(false)
  const items = counts.items.filter((i) => i.group === group)
  const checked = filters.groups.includes(group)
  return (
    <div className="traffic-group">
      <div className="traffic-group-head">
        <label className="traffic-check">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={() => onChangeFilters({ groups: toggleInList(filters.groups, group) })}
          />
          <span>{GROUP_LABELS[group]}</span>
        </label>
        <span className="traffic-count">{counts.groups[group] ?? 0}</span>
        {items.length > 0 && (
          <button type="button" className="traffic-group-fold" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '▾' : '▸'}
          </button>
        )}
      </div>
      {open && items.map((item) => (
        <label className="traffic-check traffic-check--child" key={item.code}>
          <input
            type="checkbox"
            checked={filters.codes.includes(item.code)}
            disabled={disabled || checked}
            onChange={() => onChangeFilters({ codes: toggleInList(filters.codes, item.code) })}
          />
          <span>{item.name}</span>
          <span className="traffic-count">{item.count}</span>
        </label>
      ))}
    </div>
  )
}

export default function TrafficPanel({
  visible, onToggleVisible,
  filters, onChangeFilters, onResetFilters,
  counts, visibleCount, receiving, onClose,
}) {
  const [lo, hi] = filters.altitudeFt
  // 선택한 소속이 지금 하늘에 없으면 목록에 안 뜬다 → 조건이 살아 있다는 걸 따로 보여준다.
  const missingCodes = filters.codes.filter((code) => !counts.items.some((i) => i.code === code))
  const filtered = hasActiveFilters(filters)

  return (
    <div className="dev-layer-panel layer-drawer traffic-panel" aria-label="항적 필터">
      <div className="layer-drawer-header">
        <div>
          <div className="layer-drawer-eyebrow">교통</div>
          <div className="layer-drawer-title">항적 (ADS-B)</div>
        </div>
        <button type="button" className="layer-drawer-close" aria-label="닫기" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      <div className="layer-drawer-body">
        <label className="traffic-switch">
          <input type="checkbox" checked={visible} onChange={onToggleVisible} />
          <Radio size={18} aria-hidden="true" />
          <span>ADS-B 표시</span>
        </label>

        {!visible && <p className="traffic-hint">ADS-B를 켜면 지금 떠 있는 소속이 표시됩니다.</p>}
        {visible && receiving && <p className="traffic-hint">수신 중…</p>}

        <section className="traffic-section">
          <h3 className="traffic-section-title">소속</h3>
          {OPERATOR_GROUPS.map((group) => (
            <OperatorGroup
              key={group}
              group={group}
              counts={counts}
              filters={filters}
              onChangeFilters={onChangeFilters}
              disabled={!visible}
            />
          ))}
          {missingCodes.length > 0 && (
            <p className="traffic-hint">선택했지만 지금 안 떠 있음: {missingCodes.join(', ')}</p>
          )}
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">고도</h3>
          <div className="traffic-alt-value">{lo.toLocaleString()} – {hi.toLocaleString()} ft</div>
          <div className="traffic-alt-slider">
            <input
              type="range"
              aria-label="고도 하한"
              min={ALTITUDE_MIN_FT} max={ALTITUDE_MAX_FT} step={ALTITUDE_STEP_FT}
              value={lo}
              disabled={!visible}
              onChange={(e) => onChangeFilters({ altitudeFt: [Math.min(Number(e.target.value), hi), hi] })}
            />
            <input
              type="range"
              aria-label="고도 상한"
              min={ALTITUDE_MIN_FT} max={ALTITUDE_MAX_FT} step={ALTITUDE_STEP_FT}
              value={hi}
              disabled={!visible}
              onChange={(e) => onChangeFilters({ altitudeFt: [lo, Math.max(Number(e.target.value), lo)] })}
            />
          </div>
          <p className="traffic-note">고도를 보내지 않는 기체는 구간을 좁히면 숨겨집니다.</p>
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">기종</h3>
          <div className="traffic-chips">
            {CLASS_IDS.map((id) => (
              <button
                type="button"
                key={id}
                className={`traffic-chip${filters.classes.includes(id) ? ' is-on' : ''}`}
                aria-pressed={filters.classes.includes(id)}
                disabled={!visible}
                onClick={() => onChangeFilters({ classes: toggleInList(filters.classes, id) })}
              >
                {CLASS_LABELS[id]}
              </button>
            ))}
          </div>
        </section>

        <section className="traffic-section">
          <h3 className="traffic-section-title">검색</h3>
          <input
            type="search"
            className="traffic-search"
            placeholder="편명 또는 등록기호 (KAL123, HL1234)"
            value={filters.search}
            disabled={!visible}
            onChange={(e) => onChangeFilters({ search: e.target.value })}
          />
          <p className="traffic-note">검색 중에는 위 조건을 무시하고 찾습니다.</p>
        </section>
      </div>

      <div className="layer-drawer-footer traffic-footer">
        <button type="button" className="layer-sheet-clear" disabled={!filtered} onClick={onResetFilters}>
          필터 초기화
        </button>
        <span className="layer-drawer-status">
          보이는 항공기 {visibleCount} / 전체 {counts.total}
        </span>
      </div>

      {visible && !receiving && counts.total > 0 && visibleCount === 0 && (
        <p className="traffic-hint traffic-hint--empty">조건에 맞는 항공기 없음</p>
      )}
    </div>
  )
}
```

`frontend/src/features/traffic/TrafficPanel.css`:

```css
/* 항적 패널 — 껍데기(layer-drawer)는 기상·항공 패널과 공유하고, 필터 위젯만 여기서 정의한다. */
.traffic-panel .layer-drawer-body { display: flex; flex-direction: column; gap: var(--space-m); }

.traffic-switch { display: flex; align-items: center; gap: var(--space-s); font-weight: var(--fw-semibold); }
.traffic-hint { margin: 0; font-size: var(--fs-200); color: var(--text-3); }
.traffic-hint--empty { padding: 0 var(--space-m) var(--space-m); color: var(--level-amber); }
.traffic-note { margin: var(--space-snudge) 0 0; font-size: var(--fs-200); color: var(--text-3); }

.traffic-section { display: flex; flex-direction: column; gap: var(--space-xs); }
.traffic-section-title { margin: 0; font-size: var(--fs-200); font-weight: 800; color: var(--accent); }

.traffic-group-head { display: flex; align-items: center; gap: var(--space-xs); }
.traffic-check { display: flex; align-items: center; gap: var(--space-xs); flex: 1; min-width: 0; }
.traffic-check--child { padding-left: var(--space-l); }
.traffic-check span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.traffic-count { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--text-3); }
.traffic-group-fold { background: none; border: 0; cursor: pointer; color: var(--text-3); }

/* 이중 슬라이더 — 두 개의 native range를 겹쳐 둔다(라이브러리 없이). 아래쪽 트랙만 보이게
   하고 손잡이만 각각 잡히도록 pointer-events를 손잡이에만 준다. */
.traffic-alt-slider { position: relative; height: 28px; }
.traffic-alt-slider input[type='range'] {
  position: absolute; inset: 0; width: 100%; margin: 0;
  background: none; pointer-events: none; -webkit-appearance: none; appearance: none;
}
.traffic-alt-slider input[type='range']::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; }
.traffic-alt-slider input[type='range']::-moz-range-thumb { pointer-events: auto; width: 16px; height: 16px; border-radius: 50%; background: var(--accent); border: 2px solid #fff; }
.traffic-alt-slider::before {
  content: ''; position: absolute; left: 0; right: 0; top: 13px; height: 2px; background: var(--stroke-2);
}
.traffic-alt-value { font-variant-numeric: tabular-nums; font-weight: var(--fw-semibold); }

.traffic-chips { display: flex; flex-wrap: wrap; gap: var(--space-xs); }
.traffic-chip { padding: 4px 10px; border: 1px solid var(--stroke-2); border-radius: 999px; background: var(--bg-1); font-size: var(--fs-200); cursor: pointer; }
.traffic-chip.is-on { background: var(--accent); border-color: var(--accent); color: #fff; }

.traffic-search { width: 100%; padding: 6px 8px; border: 1px solid var(--stroke-2); border-radius: var(--radius-md); font-size: var(--fs-300); }

.traffic-footer { display: flex; align-items: center; gap: var(--space-s); }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/traffic/TrafficPanel.structure.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/traffic/TrafficPanel.jsx frontend/src/features/traffic/TrafficPanel.css frontend/src/features/traffic/TrafficPanel.structure.test.js
git commit -m "$(cat <<'EOF'
feat(traffic): add ADS-B traffic filter panel UI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 4: 레지스트리에서 ADS-B를 기상 → 항적으로 옮기기

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:161`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx:61` (그룹), 같은 파일의 `layerLabels`에서 `adsb` 항목
- Modify: `frontend/src/features/map/layerActions.js:37` 부근 (`MET_META.adsb` 제거), `MET_ACTIONS` 아래에 `TRAFFIC_ACTIONS` 추가, `ALL_ACTIONS`
- Test: `frontend/src/features/map/layerActions.test.js`

**Interfaces:**
- Consumes: 없음(정의 이동만).
- Produces: `layerActions.js`에서 `TRAFFIC_ACTIONS` — `[{ id: 'adsb', type: 'traffic', panelId: 'traffic', label: 'ADS-B', aliases: ['항공기', '실시간항공기', 'adsb', '항적'] }]`. Task 5의 `setLayerOn(id, 'traffic')`이 이 `type`을 받는다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/map/layerActions.test.js`의 `import` 목록에 `TRAFFIC_ACTIONS`를 추가하고(`MET_ACTIONS, AVIATION_ACTIONS, BASEMAP_ACTIONS,` 뒤), 아래 두 테스트를 `test('every basemap is registered', ...)` 다음에 넣는다.

```js
test('ADS-B는 기상이 아니라 항적 액션이다', () => {
  assert.equal(MET_ACTIONS.some((a) => a.id === 'adsb'), false)
  const adsb = TRAFFIC_ACTIONS.find((a) => a.id === 'adsb')
  assert.ok(adsb, '항적 액션 미등록: adsb')
  assert.equal(adsb.type, 'traffic')
  assert.equal(adsb.panelId, 'traffic')
})

test('"항공기"로 검색하면 항적 액션이 나온다', () => {
  const hits = matchSearch(ALL(), '항공기')
  assert.equal(hits[0].id, 'adsb')
  assert.equal(hits[0].type, 'traffic')
})
```

같은 파일의 `모든 action 라벨이 비어있지 않다` 테스트 배열에 `...TRAFFIC_ACTIONS`를 추가한다.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/map/layerActions.test.js`
Expected: FAIL — `TRAFFIC_ACTIONS`가 없어 `SyntaxError` 또는 `undefined`

- [ ] **Step 3: 구현 작성**

1. `weatherOverlayLayers.js` — `MET_LAYERS`에서 이 줄을 삭제한다.

```js
  { id: 'adsb', label: 'ADS-B', color: '#10b981' },
```

2. `WeatherOverlayPanel.jsx` — `groups` 배열에서 마지막 항목을 삭제하고, 위 주석의 "마지막이 참고용 항적" 문구를 정리한다.

```js
    { id: 'nwp', title: '수치모델', ids: showWind ? ['wind', 'temp', 'cloud', 'icing', 'turbulence', 'flightCategory'] : [] },
  ]
```

주석은 다음으로 바꾼다.

```js
  // 순서는 조종사가 보는 급한 순서 — 발효 중인 위험기상이 먼저, 그다음 실제 관측(레이더·위성),
  // 마지막이 예보(수치모델). 항적(ADS-B)은 기상이 아니라 교통이라 별도 '항적' 패널에 있다.
```

`layerLabels`에서 `adsb: 'ADS-B',` 줄을 삭제한다.

3. `layerActions.js` — `MET_META`에서 `adsb` 줄을 삭제하고, `MET_ACTIONS` 정의 바로 아래에 다음을 넣는다.

```js
// B-2. 항적(ADS-B) — 기상이 아니라 교통이라 전용 패널('traffic')을 연다.
export const TRAFFIC_ACTIONS = [
  { id: 'adsb', type: 'traffic', panelId: 'traffic', label: 'ADS-B', aliases: ['항공기', '실시간항공기', 'adsb', '항적'] },
]
```

`ALL_ACTIONS`를 다음으로 바꾼다.

```js
export const ALL_ACTIONS = [...PANEL_ACTIONS, ...MET_ACTIONS, ...TRAFFIC_ACTIONS, ...AVIATION_ACTIONS, ...BASEMAP_ACTIONS]
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/map/layerActions.test.js`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/map/layerActions.js frontend/src/features/map/layerActions.test.js
git commit -m "$(cat <<'EOF'
refactor(traffic): move ADS-B out of weather layer registry

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 5: 패널 진입점과 켜기/끄기 상태 이동

**Files:**
- Modify: `frontend/src/app/layout/Sidebar.jsx:12-18` (`topItems`), `:48-55` (`PANEL_MAP`), `:67-70` (`badgeFor`)
- Modify: `frontend/src/app/layout/MobileMapOverlay.jsx`
- Modify: `frontend/src/app/App.jsx:246-252` (`MobileMapOverlay` props)
- Modify: `frontend/src/features/map/MapView.jsx` — `metVisibility.adsb` 사용 지점 5곳(`:1062`, `:1082`, `:1497-1498`, `:1819`), `setLayerOn`(`:473-477`), 패널 렌더 분기, `onLayerCountsChange`(`:1654`)
- Test: `frontend/src/features/traffic/trafficWiring.test.js` (신규)

**Interfaces:**
- Consumes: Task 3의 `TrafficPanel`, Task 2의 `useTrafficFilters`, Task 4의 `TRAFFIC_ACTIONS`.
- Produces: MapView 안의 `trafficVisible` 상태와 `toggleTraffic()`; `onLayerCountsChange`가 `{ aviation, met, traffic }`를 넘긴다(`traffic`은 켜져 있으면 1, 아니면 0).

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/traffic/trafficWiring.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const sidebar = read('../../app/layout/Sidebar.jsx')
const mobile = read('../../app/layout/MobileMapOverlay.jsx')
const mapView = read('../map/MapView.jsx')
const metPanel = read('../weather-overlays/WeatherOverlayPanel.jsx')

test('사이드바에 항적 항목과 패널 연결이 있다', () => {
  assert.match(sidebar, /label: '항적'/)
  assert.match(sidebar, /항적:\s+'traffic'/)
  assert.match(sidebar, /counts\.traffic/)
})

test('모바일 지도 버튼에 항적이 있다', () => {
  assert.match(mobile, /activePanel === 'traffic'/)
  assert.match(mobile, /trafficCount/)
})

test('기상 패널에는 항적이 남아 있지 않다', () => {
  assert.doesNotMatch(metPanel, /'adsb'/)
  assert.doesNotMatch(metPanel, /title: '항적'/)
})

test('ADS-B 켜기/끄기가 기상 레이어 상태에서 빠졌다', () => {
  assert.doesNotMatch(mapView, /metVisibility\.adsb/)
  assert.match(mapView, /const \[trafficVisible, setTrafficVisible\] = useState\(false\)/)
})

test('MapView가 항적 패널을 렌더하고 대수를 넘긴다', () => {
  assert.match(mapView, /activePanel === 'traffic'/)
  assert.match(mapView, /<TrafficPanel/)
  assert.match(mapView, /traffic: trafficVisible \? 1 : 0/)
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/traffic/trafficWiring.test.js`
Expected: FAIL — 5개 중 최소 4개 실패

- [ ] **Step 3: 구현 작성**

1. `Sidebar.jsx` — `topItems`의 `기상정보` 다음에 넣는다(`Radio`를 `lucide-react` import에 추가).

```js
  { label: '항적',             icon: Radio },
```

`PANEL_MAP`에 추가:

```js
  항적:            'traffic',
```

`badgeFor`를 다음으로 바꾼다:

```js
  const badgeFor = (label) =>
    label === '항공정보' ? counts.aviation || undefined
    : label === '기상정보' ? counts.met || undefined
    : label === '항적' ? counts.traffic || undefined
    : undefined
```

2. `MobileMapOverlay.jsx` — `Radio`를 import에 추가하고, `기상` 버튼 다음에 넣는다. 시그니처에 `trafficCount = 0`을 추가한다.

```jsx
        <button
          type="button"
          className={`mobile-map-layer-btn${activePanel === 'traffic' ? ' is-active' : ''}`}
          onClick={() => onToggle('traffic')}
          aria-label="항적"
        >
          <Radio size={20} strokeWidth={2} />
          <span>항적</span>
          {trafficCount > 0 && <span className="mobile-map-layer-count">{trafficCount}</span>}
        </button>
```

3. `App.jsx` — `MobileMapOverlay`에 한 줄 추가.

```jsx
          trafficCount={layerCounts.traffic}
```

4. `MapView.jsx`

import 추가:

```js
import TrafficPanel from '../traffic/TrafficPanel.jsx'
import useTrafficFilters from '../traffic/useTrafficFilters.js'
import { adsbIdFilter, countAircraft, hasActiveFilters, visibleIds } from '../traffic/trafficFilter.js'
```

`const [adsbLoading, setAdsbLoading] = useState(false)` 아래에 추가:

```js
  // ADS-B 켜기/끄기는 기상 레이어에서 분리됐다 — 항적 패널이 소유한다. 저장하지 않는다.
  const [trafficVisible, setTrafficVisible] = useState(false)
  const { filters: trafficFilters, setFilters: setTrafficFilters, resetFilters: resetTrafficFilters } = useTrafficFilters()
```

`setLayerOn`에 분기 추가:

```js
    else if (kind === 'traffic') setTrafficVisible(true)
```

`metVisibility.adsb` 4곳을 `trafficVisible`로 바꾼다 — ADS-B 폴링 `useEffect` 조건과 의존성 배열(`:1062`, `:1082`), `syncAdsbLayer` 호출과 의존성 배열(`:1497-1498`), `AdsbTimestamp`의 `isVisible`(`:1819`).

`onLayerCountsChange` 호출을 바꾼다:

```js
    onLayerCountsChange?.({ aviation: aviationActiveCount, met: metActiveCount, traffic: trafficVisible ? 1 : 0 })
  }, [aviationActiveCount, metActiveCount, trafficVisible, onLayerCountsChange])
```

`{activePanel === 'met' && (` 블록 앞에 패널을 추가한다. `adsbCounts`/`adsbVisibleIds`는 Task 6에서 계산하므로, 이 태스크에서는 다음 임시 계산을 같은 파일 `adsbGeoJSON` 정의 아래에 둔다(Task 6에서 그대로 사용한다).

```js
  const adsbCounts = useMemo(() => countAircraft(adsbGeoJSON.features), [adsbGeoJSON])
  const adsbVisibleIds = useMemo(() => visibleIds(adsbGeoJSON.features, trafficFilters), [adsbGeoJSON, trafficFilters])
```

```jsx
      {activePanel === 'traffic' && (
        <TrafficPanel
          visible={trafficVisible}
          onToggleVisible={() => setTrafficVisible((v) => !v)}
          filters={trafficFilters}
          onChangeFilters={setTrafficFilters}
          onResetFilters={resetTrafficFilters}
          counts={adsbCounts}
          visibleCount={adsbVisibleIds.length}
          receiving={adsbLoading}
          onClose={onClosePanel}
        />
      )}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/traffic/trafficWiring.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 전체 프런트엔드 테스트로 회귀 확인**

Run: `node --test $(git ls-files 'frontend/src/**/*.test.js')`
Expected: PASS — 실패 0

- [ ] **Step 6: 커밋**

```bash
git add frontend/src/app/layout/Sidebar.jsx frontend/src/app/layout/MobileMapOverlay.jsx frontend/src/app/App.jsx frontend/src/features/map/MapView.jsx frontend/src/features/traffic/trafficWiring.test.js
git commit -m "$(cat <<'EOF'
feat(traffic): open ADS-B panel from sidebar and own its visibility

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 6: 필터를 지도 세 겹에 적용

**Files:**
- Modify: `frontend/src/features/map/MapView.jsx` (`syncAdsbLayer` 호출 `useEffect` 부근 `:1497`)
- Test: `frontend/src/features/traffic/applyAdsbFilter.test.js` (신규)

**Interfaces:**
- Consumes: Task 1의 `adsbIdFilter`, `hasActiveFilters`; Task 5의 `adsbVisibleIds`, `trafficFilters`.
- Produces: `frontend/src/features/traffic/applyAdsbFilter.js` — `applyAdsbFilter(map, { ids, filtered })`. 아이콘·로고·궤적 세 레이어에 규칙을 걸고, 필터가 없으면 원래 상태로 되돌린다.

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/traffic/applyAdsbFilter.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { applyAdsbFilter } from './applyAdsbFilter.js'

// 지도 대역 — setFilter 호출만 기록한다.
function fakeMap() {
  const calls = []
  return {
    calls,
    getLayer: () => true,
    setFilter: (id, filter) => calls.push([id, filter]),
  }
}

test('필터가 걸리면 아이콘·로고·궤적 세 겹에 모두 적용한다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  const ids = map.calls.map(([id]) => id)
  assert.deepEqual(ids, ['adsb-layer', 'adsb-logo-layer', 'adsb-trail-layer'])
})

test('로고 레이어는 자체 조건을 유지한 채 AND로 묶는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  const [, logoFilter] = map.calls.find(([id]) => id === 'adsb-logo-layer')
  assert.deepEqual(logoFilter, [
    'all',
    ['!=', ['get', 'operator'], ''],
    ['in', ['get', 'icao24'], ['literal', ['aaa001']]],
  ])
})

test('필터가 없으면 원래 상태로 되돌린다 — 긴 목록을 매번 넘기지 않는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: [], filtered: false })
  assert.deepEqual(map.calls, [
    ['adsb-layer', null],
    ['adsb-logo-layer', ['!=', ['get', 'operator'], '']],
    ['adsb-trail-layer', null],
  ])
})

test('수신 범위 원에는 손대지 않는다', () => {
  const map = fakeMap()
  applyAdsbFilter(map, { ids: ['aaa001'], filtered: true })
  assert.equal(map.calls.some(([id]) => id === 'adsb-range-layer'), false)
})

test('레이어가 아직 없으면 아무 일도 하지 않는다', () => {
  const map = { ...fakeMap(), getLayer: () => false }
  const calls = []
  applyAdsbFilter({ getLayer: () => false, setFilter: (...a) => calls.push(a) }, { ids: [], filtered: true })
  assert.deepEqual(calls, [])
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test frontend/src/features/traffic/applyAdsbFilter.test.js`
Expected: FAIL — `Cannot find module ... applyAdsbFilter.js`

- [ ] **Step 3: 구현 작성**

`frontend/src/features/traffic/applyAdsbFilter.js`:

```js
// 필터를 지도에 거는 곳. 항공기는 아이콘·로고·궤적 세 겹으로 그려지므로 세 겹 모두에 걸어야
// 한다(아이콘만 숨기면 숨긴 기체의 로고와 궤적이 지도에 남는다). 수신 범위 원은 항공기가
// 아니므로 건드리지 않는다.
import {
  ADSB_LAYER_ID, ADSB_LOGO_LAYER_ID, ADSB_TRAIL_LAYER_ID,
} from '../aviation-layers/addAdsbLayer.js'
import { adsbIdFilter } from './trafficFilter.js'

// addAdsbLayer.js가 로고 레이어에 원래 걸어둔 조건 — 로고 이미지가 있는 기체만 그린다.
const LOGO_BASE_FILTER = ['!=', ['get', 'operator'], '']

export function applyAdsbFilter(map, { ids = [], filtered = false } = {}) {
  if (!map?.getLayer?.(ADSB_LAYER_ID)) return
  const idFilter = adsbIdFilter(ids)
  map.setFilter(ADSB_LAYER_ID, filtered ? idFilter : null)
  map.setFilter(ADSB_LOGO_LAYER_ID, filtered ? ['all', LOGO_BASE_FILTER, idFilter] : LOGO_BASE_FILTER)
  // 궤적 데이터에는 icao24만 있다 — 같은 규칙이 그대로 통한다.
  map.setFilter(ADSB_TRAIL_LAYER_ID, filtered ? idFilter : null)
}
```

`MapView.jsx` — `// Sync ADS-B` 구역의 기존 블록(`useStyleSyncedEffect(...)`)에 한 줄과 의존성 두 개를 더한다. 스타일이 다시 깔릴 때 레이어가 새로 만들어지므로 규칙도 같은 훅 안에서 다시 걸어야 한다.

```js
  useStyleSyncedEffect(mapRef, isStyleReady, styleRevision, (map) => {
    registerAircraftImages(map)
    registerAirlineLogos(map)
    syncAdsbLayer(map, { geojson: adsbGeoJSON, trailGeojson: adsbTrailGeoJSON, isVisible: trafficVisible })
    applyAdsbFilter(map, { ids: adsbVisibleIds, filtered: hasActiveFilters(trafficFilters) })
  }, [adsbGeoJSON, adsbTrailGeoJSON, trafficVisible, adsbVisibleIds, trafficFilters])
```

import에 다음을 추가한다.

```js
import { applyAdsbFilter } from '../traffic/applyAdsbFilter.js'
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test frontend/src/features/traffic/applyAdsbFilter.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/traffic/applyAdsbFilter.js frontend/src/features/traffic/applyAdsbFilter.test.js frontend/src/features/map/MapView.jsx
git commit -m "$(cat <<'EOF'
feat(traffic): hide filtered aircraft on icon, logo and trail layers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

### Task 7: 브라우저 검증

**Files:**
- Create: `frontend/scripts/traffic-panel-capture.mjs`
- Modify: `docs/policies/verification/contracts.md` (항적 패널 계약 한 줄 추가)

**Interfaces:**
- Consumes: Task 1~6의 결과 화면.
- Produces: `artifacts/traffic-panel/*.png` 스크린샷과 콘솔 측정값.

- [ ] **Step 1: 개발 서버 확인**

Run: `ss -ltnp | grep 5173`
Expected: vite가 5173에서 듣고 있음. 없으면 `npm run dev`를 실행하고 `docs/operations/dev-server-and-capture.md` 절차를 따른다.

- [ ] **Step 2: 검증 스크립트 작성**

`frontend/scripts/traffic-panel-capture.mjs`:

```js
// 항적 패널 브라우저 검증 — ADS-B를 켜고 필터를 걸어 지도 위 항공기가 실제로 줄어드는지 본다.
// 실행: node frontend/scripts/traffic-panel-capture.mjs   (playwright는 frontend/node_modules)
import fs from 'node:fs/promises'
import { chromium } from 'playwright'

const url = process.env.PROJECTAMO_URL || 'http://127.0.0.1:5173'
const outDir = process.env.PROJECTAMO_CAPTURE_DIR || 'artifacts/traffic-panel'
await fs.mkdir(outDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newContext({ viewport: { width: 1440, height: 900 } }).then((c) => c.newPage())

function countAircraftOnMap() {
  // 지도에 실제로 그려진 기체 수. MapView가 개발 모드에서 window.__map으로 지도를 노출한다.
  return page.evaluate(() => window.__map.queryRenderedFeatures({ layers: ['adsb-layer'] }).length)
}

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.map-shell', { timeout: 30000 })
const closeModal = page.locator('.updates-modal__close')
if (await closeModal.count()) { await closeModal.first().click() }

// 1) 사이드바 → 항적 패널
await page.getByRole('button', { name: '항적' }).first().click()
await page.waitForSelector('[aria-label="항적 필터"]', { timeout: 10000 })
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/01-panel-off.png` })

// 2) 기상 패널에 항적 그룹이 없다
await page.getByRole('button', { name: '기상정보' }).first().click()
await page.waitForSelector('[aria-label="기상 레이어 토글"]', { timeout: 10000 })
const metText = await page.locator('[aria-label="기상 레이어 토글"]').innerText()
console.log('기상 패널에 ADS-B 흔적:', /ADS-B|항적/.test(metText))

// 3) ADS-B 켜기 → 수신 대기
await page.getByRole('button', { name: '항적' }).first().click()
await page.locator('[aria-label="항적 필터"] .traffic-switch input').check()
await page.waitForFunction(() => !document.querySelector('[aria-label="항적 필터"]')?.innerText.includes('전체 0'), { timeout: 60000 })
const total = await countAircraftOnMap()
console.log('전체 항공기:', total)
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/02-panel-on.png` })

// 4) 소속 하나만 체크 → 줄어드는지
await page.locator('[aria-label="항적 필터"] .traffic-group input[type=checkbox]').first().check()
await page.waitForTimeout(500)
const afterOperator = await countAircraftOnMap()
const panelCount = await page.locator('.layer-drawer-status').innerText()
console.log('소속 필터 후 지도:', afterOperator, '| 패널 표기:', panelCount)

// 5) 고도 구간 좁히기
await page.locator('[aria-label="항적 필터"] input[aria-label="고도 상한"]').fill('10000')
await page.waitForTimeout(500)
console.log('고도 필터 후 지도:', await countAircraftOnMap())

// 6) 검색
await page.locator('[aria-label="항적 필터"] .traffic-search').fill('KAL')
await page.waitForTimeout(500)
console.log('검색 후 지도:', await countAircraftOnMap())
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/03-filtered.png` })

// 7) 새로고침 → 필터 유지, 표시는 꺼짐
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.map-shell', { timeout: 30000 })
await page.getByRole('button', { name: '항적' }).first().click()
await page.waitForSelector('[aria-label="항적 필터"]')
console.log('새로고침 후 표시 켜짐:', await page.locator('[aria-label="항적 필터"] .traffic-switch input').isChecked())
console.log('새로고침 후 필터 유지:', await page.locator('[aria-label="항적 필터"] .traffic-group input[type=checkbox]').first().isChecked())
await page.locator('[aria-label="항적 필터"]').screenshot({ path: `${outDir}/04-after-reload.png` })

await browser.close()
```

`window.__map`은 `MapView.jsx`가 `import.meta.env.DEV`에서만 노출한다(`:1197`). 프로덕션 빌드로 확인할 때는 `queryRenderedFeatures` 대신 패널 하단 `보이는 항공기 N / 전체 M` 문자열로 검증한다.

- [ ] **Step 3: 실행하고 출력 확인**

Run: `node frontend/scripts/traffic-panel-capture.mjs`
Expected:
- `기상 패널에 ADS-B 흔적: false`
- `전체 항공기`가 1 이상
- 소속 필터 후 지도 수 < 전체, 패널 표기의 두 숫자가 지도 수와 일치
- 고도 필터 후 ≤ 소속 필터 후
- 검색 후 ≥ 1이고, 고도 조건 때문에 0이 되지 않음(검색 우선)
- `새로고침 후 표시 켜짐: false`, `새로고침 후 필터 유지: true`

출력 중 하나라도 어긋나면 `superpowers:systematic-debugging`으로 원인을 잡고 해당 태스크로 돌아간다.

- [ ] **Step 4: 계약 문서에 한 줄 추가**

`docs/policies/verification/contracts.md`의 표 형식을 그대로 따라 다음 계약을 추가한다.

```markdown
| 항적 패널 | 사이드바 `항적` → 패널이 열리고, ADS-B를 켠 뒤 소속/고도/검색을 걸면 지도에 그려진 기체 수가 패널 하단 `보이는 항공기 N / 전체 M`과 일치한다. 새로고침하면 필터는 유지되고 표시는 꺼진다. | `node frontend/scripts/traffic-panel-capture.mjs` |
```

- [ ] **Step 5: 그래프 갱신과 커밋**

```bash
graphify update .
git add frontend/scripts/traffic-panel-capture.mjs docs/policies/verification/contracts.md
git commit -m "$(cat <<'EOF'
test(traffic): add browser verification for ADS-B panel filters

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_018cxj3kGrYzkjqBvXcbgU3Y
EOF
)"
```

---

## 스펙 대응표

| 스펙 항목 | 태스크 |
|---|---|
| §3 패널 위치·독립 패널 | 5 |
| §3 켜기/끄기 이동 | 4, 5 |
| §3 불일치 기체 숨김 | 1, 6 |
| §3 소속 3그룹·개별 선택·대수 | 1, 3 |
| §3 고도 이중 슬라이더 | 3 |
| §3 1단계 필터 4종 | 1, 3 |
| §3 필터 기억(검색어 제외) | 2 |
| §3 켜기/끄기는 저장 안 함 | 5 |
| §4 화면 구성·비활성·배지 | 3, 5 |
| §5 AND/OR·빈 선택·검색 우선·미터↔ft·고도 미보고 | 1 |
| §6 켜기 전 빈 목록·수신 중·안 떠 있는 선택 | 3 |
| §7 파일 경계·`addAdsbLayer.js` 불변 | 1~6 (Task 6은 상수만 import) |
| §8 세 겹 모두 적용·범위 원 제외 | 6 |
| §9 저장값 오류·0대·수신 실패 | 2, 3 |
| §10 단위 테스트·브라우저 검증 | 1~3, 6, 7 |
| §11 범위 밖 항목 | 어느 태스크에도 없음(의도) |
