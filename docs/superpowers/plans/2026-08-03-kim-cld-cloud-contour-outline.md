# KIM CLD Cloud Contour Outline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연직단면도에 KIM `cld >= 0.6`인 연결 영역의 외곽선만 구름 덩어리처럼 표시하고, 내부는 채우지 않으며 CLD 결측 구간은 서로 연결하지 않는다.

**Architecture:** 백엔드는 이미 KIM 압력면 파일에서 읽고 있는 `cld`를 착빙 계산과 분리해 기존 단면 응답의 각 거리·고도 표본에 보존하고, 가용 여부와 임계값을 응답 메타데이터에 싣는다. 프런트의 순수 계산 모듈이 거리×실제 등압면 고도 격자에 marching squares를 적용해 `CLD = 0.6` 선분을 만들고 연결 체인으로 조립하며, `VerticalProfileChart`는 체인을 SVG 외곽선으로만 렌더링한다. 지형은 현재처럼 기상 요소보다 나중에 그려 지형 아래 윤곽을 가리고, 자료 경계나 결측을 가로질러 외곽선을 인위적으로 닫지 않는다.

**Tech Stack:** Node.js ES modules, Express cross-section response, React 19, SVG, Node built-in test runner, Playwright.

## Global Constraints

- 새 외부 기상자료, 새 수집 작업, 새 런타임 의존성을 추가하지 않는다. 현재 KIM 압력면 격자에 저장된 `cld`와 `hgt`만 사용한다.
- `cld`는 관측 운고나 법정 ceiling이 아니다. 사용자 문구는 `KIM CLD 구름 윤곽`으로 쓰고 `ceiling`이라고 단정하지 않는다.
- 임계값은 기존 KIM 운고 진단과 동일한 `0.6` 하나를 백엔드 단일 상수로 유지한다. 프런트는 숫자를 복제하지 않고 응답의 `coverage.byVariable.cld.threshold`를 소비한다.
- 윤곽 계산에는 CLD가 수집된 모든 압력면을 사용한다. 975–700 hPa 최저층 탐색으로 줄이지 않는다. 그래야 구름 영역의 아래·위·옆 경계가 함께 나온다.
- 각 격자 꼭짓점의 고도는 `level.altFt` 평균이나 표준대기 환산값이 아니라 `level.values[index].altFt`를 사용한다. `cld`, `distanceNm`, `altFt` 중 하나라도 결측이면 그 꼭짓점이 포함된 셀에서는 선분을 만들지 않는다.
- 결측을 `0`, 맑음, 또는 임계값 미달로 바꾸지 않는다. 결측 셀은 건너뛰어 윤곽이 끊기게 하고, 화면에서는 `CLD 자료 없음`과 `CLD 0.6 이상 없음`을 구분한다.
- 선은 marching-squares 교차점의 선형 보간까지만 허용한다. Catmull–Rom, 블러, 임의 gap 연결, 격자 경계 밖 폐곡선 보완을 하지 않는다.
- SVG 외곽선은 명시적으로 `fill="none"`이어야 한다. 구름 영역 내부에 색, 투명도, 패턴을 채우지 않는다.
- 구름 레이어는 `구름` 토글로 독립 제어하고 기본값은 ON이다. 기존 `습도`↔`착빙` 상호배제에는 참여하지 않는다.
- 현재 차트의 고도 범위 계산을 CLD 최고층 때문에 확장하지 않는다. 보이는 고도 범위 안의 윤곽만 기존 `clipPath`로 자른다. VFR 저고도 판독 비율을 유지하기 위함이다.
- 기존 공통 route-axis와 단면 거리축을 그대로 사용한다. 별도의 경로 리샘플링이나 거리 계산을 만들지 않는다.
- `crossSection.run`의 KIM run/hf/validTime과 `coverage.byVariable.cld` 가용 상태를 보존한다. 결측을 정상 후보나 맑음으로 바꾸지 않는다.
- 테스트는 `node --test`, 브라우저 검증은 등록된 `briefing-view` Playwright 계약을 사용한다. 최종 증거는 desktop, iPad landscape, mobile 세 프로젝트의 Linux 차트 스냅샷이다.
- 현재 작업 트리에 이 계획을 만들기 전부터 있던 수정·미추적 파일은 모두 사용자 작업이다. 여기에는 `Architecture.md`, `docs/policies/verification/contracts.md`, `frontend/src/features/terminal/*`, `frontend/src/features/map/*`, `frontend/src/features/weather-overlays/*`의 기존 변경과 연구·스펙·상태 문서가 포함된다. 이 계획에서는 덮어쓰거나 함께 스테이징하지 않는다. 각 커밋은 태스크에 명시된 파일만 스테이징하고, 같은 파일에 새 사용자 변경이 나타나면 먼저 diff를 분리한다.
- 한글을 포함하는 파일은 `docs/policies/encoding-safety.md`에 따라 `apply_patch`로 편집하고 Node UTF-8 읽기로 검증한다.

## File Map

| File | Responsibility |
| --- | --- |
| `backend/src/processors/kim-cloud-threshold.js` (new) | 기존 지도 운고 진단과 단면 구름 윤곽이 공유할 `0.6` 상수 |
| `backend/src/processors/flight-category/ceiling-kim.js` | 기존 `CLD_THRESHOLD` 공개 이름을 공유 상수에 연결 |
| `backend/src/briefing/enroute-cross-section.js` | `cld`를 착빙 변수 묶음과 독립적으로 디코딩해 경로 표본에 보존 |
| `backend/src/briefing/cross-section-sampler.js` | 단면 응답의 `values[].cld`와 CLD coverage 계약 생성 |
| `backend/test/cross-section-sampler.test.js` | CLD 정상·결측 coverage 단위 계약 |
| `backend/test/cross-section-route.test.js` | 실제 HTTP 응답에서 CLD, threshold, run identity 보존 계약 |
| `frontend/src/features/route-briefing/lib/cloudContour.js` (new) | SVG와 무관한 marching-squares 선분 생성, 결측 처리, 체인 연결 |
| `frontend/src/features/route-briefing/lib/cloudContour.test.js` (new) | 폐곡선, 분리 구름, 결측 gap, 실제 표본고도 사용 단위 계약 |
| `frontend/src/features/route-briefing/VerticalProfileChart.jsx` | contour 모델을 현재 거리·고도 축에 매핑하고 외곽선과 자료 상태 렌더링 |
| `frontend/src/features/route-briefing/crossSectionLayers.jsx` | 기본 ON `구름` 토글 추가 |
| `frontend/src/features/route-briefing/BriefingView.jsx` | 브리핑 전용 초기 레이어 상태에도 `cloud: true` 명시 |
| `frontend/src/features/route-briefing/RouteBriefing.css` | 채움 없는 구름 윤곽선 스타일 |
| `frontend/src/features/route-briefing/BriefingView.responsive.test.js` | 공유 토글과 모바일 전체화면 배선 정적 회귀 |
| `frontend/verification/route-fixture.mjs` | 두 구름 덩어리와 결측 gap이 있는 결정적 CLD 단면 fixture |
| `frontend/verification/contracts/briefing-view.spec.mjs` | 토글, 외곽선 수, 무채움, gap, 세 viewport 스냅샷 브라우저 계약 |
| `frontend/verification/contracts/briefing-view.spec.mjs-snapshots/*-linux.png` | 사용자가 실제 결과를 볼 수 있는 세 viewport 기준 이미지 |

---

### Task 1: Preserve CLD in the route cross-section response

**Files:**
- Create: `backend/src/processors/kim-cloud-threshold.js`
- Modify: `backend/src/processors/flight-category/ceiling-kim.js:5-11`
- Modify: `backend/src/briefing/enroute-cross-section.js:19,62-88`
- Modify: `backend/src/briefing/cross-section-sampler.js:28-79`
- Test: `backend/test/cross-section-sampler.test.js`
- Test: `backend/test/cross-section-route.test.js`

**Interfaces:**
- Produces: `KIM_CLOUD_CONTOUR_THRESHOLD = 0.6`.
- Preserves: `ceiling-kim.js`의 기존 `CLD_THRESHOLD` export와 `ceilingFromLevels()` 동작.
- Produces: cross-section `levels[].values[].cld: number | null` in the normalized `0..1` fraction unit.
- Produces: `coverage.byVariable.cld = { available: boolean, topPressure: number | null, threshold: 0.6, unit: '1' }`.
- Preserves: `crossSection.run = { tmfc, hf, validTime }` and all existing T/moisture/icing/wind fields.

- [ ] **Step 1: Write failing sampler contract tests**

Extend the existing `500hPa` fixture with one valid and one missing CLD sample and assert the response and coverage separately:

```js
values: [
  { distanceNm: 0, T: 253, hgt: 5500, u: 10, v: 0, spread: 5, icing: 1, cld: 0.72 },
  { distanceNm: 10, T: 256, hgt: 5500, u: 10, v: 0, spread: 6, icing: 2, cld: Number.NaN },
]

assert.equal(l.values[0].cld, 0.72)
assert.equal(l.values[1].cld, null)
assert.deepEqual(cs.coverage.byVariable.cld, {
  available: true,
  topPressure: 500,
  threshold: 0.6,
  unit: '1',
})
```

Add a second cross-section with no finite CLD values:

```js
assert.deepEqual(noCloudData.coverage.byVariable.cld, {
  available: false,
  topPressure: null,
  threshold: 0.6,
  unit: '1',
})
```

- [ ] **Step 2: Write the failing HTTP response test**

In the first `cross-section-route.test.js` grid, retain `u`/`v` so forecast-time selection still works and add only `hgt` and `cld`; deliberately omit the other icing variables:

```js
components: [
  { variable: 'u', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(5) },
  { variable: 'v', unit: 'm/s', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(0) },
  { variable: 'hgt', unit: 'm', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(1500) },
  { variable: 'cld', unit: '1', level: 850, nx: 73, ny: 85, bounds: BOUNDS, values: Array(73 * 85).fill(0.72) },
]
```

Assert that CLD survives even though icing cannot be calculated:

```js
const level850 = body.levels.find(({ pressure }) => pressure === 850)
assert.ok(level850)
assert.ok(Math.abs(level850.values[0].cld - 0.72) < 0.001)
assert.equal(level850.values[0].icing, null)
assert.equal(body.coverage.byVariable.cld.threshold, 0.6)
assert.equal(body.coverage.byVariable.cld.available, true)
assert.equal(body.run.tmfc, tmfc)
assert.equal(body.run.hf, hf)
```

- [ ] **Step 3: Run the focused backend tests and verify RED**

Run:

```bash
node --test backend/test/cross-section-sampler.test.js backend/test/cross-section-route.test.js
```

Expected: FAIL because `values[].cld` and `coverage.byVariable.cld` do not exist.

- [ ] **Step 4: Create the shared threshold and keep the old public name stable**

Create `kim-cloud-threshold.js`:

```js
export const KIM_CLOUD_CONTOUR_THRESHOLD = 0.6
```

Change `ceiling-kim.js` to consume it without breaking existing imports:

```js
import { KIM_CLOUD_CONTOUR_THRESHOLD } from '../kim-cloud-threshold.js'

export const CLD_THRESHOLD = KIM_CLOUD_CONTOUR_THRESHOLD
```

Do not move `CEILING_SEARCH_LEVELS`, contour generation, file I/O, or the existing flight-category tests in this task.

- [ ] **Step 5: Decode CLD independently from icing**

In `sampleLevelValues()`, decode CLD before the all-icing-variable gate and reuse it inside the icing input:

```js
if (variables?.cld) value.cld = decodeAt(variables.cld, idx)

if (KIM_ICING_REQUIRED_VARIABLES.every((name) => variables?.[name])) {
  const icing = {
    tempC: value.T - 273.15,
    rhLiq: decodeAt(variables.rh_liq, idx),
    w: decodeAt(variables.w, idx),
    tqc: decodeAt(variables.tqc, idx),
    tqi: decodeAt(variables.tqi, idx),
    tqr: decodeAt(variables.tqr, idx),
    tqs: decodeAt(variables.tqs, idx),
    cld: value.cld,
  }
  if (Object.values(icing).every(Number.isFinite)) {
    const { score, mCl, bFrz } = calcKFipLiteScore(icing)
    value.icing = icingGradeFor(score, { mCl, bFrz })
  }
}
```

The CLD assignment must not be nested inside `KIM_ICING_REQUIRED_VARIABLES.every(...)`.

- [ ] **Step 6: Add CLD to the normalized response and coverage**

Import `KIM_CLOUD_CONTOUR_THRESHOLD` in `cross-section-sampler.js`, add `cld` to `coverageTop`/`has`, and emit:

```js
cld: Number.isFinite(value.cld) ? value.cld : null,
```

Track availability exactly like the other variables:

```js
if (sampledValues.some((value) => Number.isFinite(value.cld))) {
  has.cld = true
  coverageTop.cld = trackTop(coverageTop.cld, pressure)
}
```

Return the metadata contract:

```js
cld: {
  available: has.cld,
  topPressure: coverageTop.cld,
  threshold: KIM_CLOUD_CONTOUR_THRESHOLD,
  unit: '1',
},
```

- [ ] **Step 7: Run backend CLD and existing ceiling tests**

Run:

```bash
node --test \
  backend/test/cross-section-sampler.test.js \
  backend/test/cross-section-route.test.js \
  backend/src/processors/flight-category/ceiling-kim.test.js
```

Expected: PASS. The route test proves CLD transport is independent from icing availability; the ceiling test proves the shared threshold extraction did not change existing behavior.

- [ ] **Step 8: Commit the backend contract**

```bash
git add \
  backend/src/processors/kim-cloud-threshold.js \
  backend/src/processors/flight-category/ceiling-kim.js \
  backend/src/briefing/enroute-cross-section.js \
  backend/src/briefing/cross-section-sampler.js \
  backend/test/cross-section-sampler.test.js \
  backend/test/cross-section-route.test.js
git commit -m "feat: expose KIM CLD in route cross sections"
```

Before committing, inspect `git diff --cached --name-only`; it must list only the six files above.

---

### Task 2: Build CLD threshold contour chains as a pure model

**Files:**
- Create: `frontend/src/features/route-briefing/lib/cloudContour.js`
- Create: `frontend/src/features/route-briefing/lib/cloudContour.test.js`

**Interfaces:**
- Consumes: `levels: Array<{ pressure, values: Array<{ distanceNm, altFt, cld }> }>` and `threshold: number`.
- Produces: `buildCloudContourModel(levels, threshold) => { status: 'unavailable' | 'not_detected' | 'detected', partial: boolean, threshold, chains }`.
- Produces: `chains: Array<Array<{ distanceNm: number, altFt: number }>>` in domain coordinates, with no SVG pixel or React dependency.
- Guarantees: a cell with any missing corner produces no segment; disconnected areas remain separate chains; chains reaching the data boundary remain open.

- [ ] **Step 1: Write failing tests for status and a closed cloud outline**

Use three altitude rows and three distance columns with one center value over the threshold:

```js
const levelsFrom = (matrix, altitudes = [1000, 3000, 5000]) => matrix.map((row, y) => ({
  pressure: [975, 925, 850][y],
  values: row.map((cld, x) => ({ distanceNm: x * 10, altFt: altitudes[y], cld })),
}))

test('builds one closed outline around an isolated CLD region', () => {
  const model = buildCloudContourModel(levelsFrom([
    [0.1, 0.1, 0.1],
    [0.1, 0.9, 0.1],
    [0.1, 0.1, 0.1],
  ]), 0.6)

  assert.equal(model.status, 'detected')
  assert.equal(model.partial, false)
  assert.equal(model.chains.length, 1)
  assert.deepEqual(model.chains[0][0], model.chains[0].at(-1))
})
```

Add status cases:

```js
assert.equal(buildCloudContourModel(levelsFrom([
  [null, null, null],
  [null, null, null],
  [null, null, null],
]), 0.6).status, 'unavailable')

assert.equal(buildCloudContourModel(levelsFrom([
  [0.1, 0.2, 0.1],
  [0.2, 0.5, 0.2],
  [0.1, 0.2, 0.1],
]), 0.6).status, 'not_detected')
```

- [ ] **Step 2: Write failing tests for separated clouds, a missing gap, and actual sample altitude**

Use a five-column matrix with two high centers separated by a full `null` column:

```js
test('does not bridge disconnected clouds across a missing CLD column', () => {
  const model = buildCloudContourModel(levelsFrom([
    [0.1, 0.1, null, 0.1, 0.1],
    [0.1, 0.9, null, 0.9, 0.1],
    [0.1, 0.1, null, 0.1, 0.1],
  ]), 0.6)

  assert.equal(model.chains.length, 2)
  assert.equal(model.partial, true)
  assert.ok(model.chains.every((chain) => chain.every((point) => point.distanceNm < 20 || point.distanceNm > 20)))
})
```

Use sloped per-sample altitude values and assert at least one interpolated point differs from every row mean:

```js
test('interpolates on each sample actual altFt instead of a level mean', () => {
  const levels = levelsFrom([
    [0.1, 0.1, 0.1],
    [0.1, 0.9, 0.1],
    [0.1, 0.1, 0.1],
  ])
  levels[1].values[1].altFt = 3600
  const model = buildCloudContourModel(levels, 0.6)
  assert.ok(model.chains.flat().some(({ altFt }) => altFt > 3000 && altFt < 3600))
})
```

- [ ] **Step 3: Run the contour tests and verify RED**

Run:

```bash
node --test frontend/src/features/route-briefing/lib/cloudContour.test.js
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` because `cloudContour.js` does not exist.

- [ ] **Step 4: Implement marching-squares edge interpolation**

Use this vertex and edge convention:

```js
const EDGE_VERTICES = {
  top: ['tl', 'tr'],
  right: ['tr', 'br'],
  bottom: ['br', 'bl'],
  left: ['bl', 'tl'],
}

const SIMPLE_CASES = {
  1: [['left', 'top']],
  2: [['top', 'right']],
  3: [['left', 'right']],
  4: [['right', 'bottom']],
  6: [['top', 'bottom']],
  7: [['left', 'bottom']],
  8: [['bottom', 'left']],
  9: [['top', 'bottom']],
  11: [['right', 'bottom']],
  12: [['left', 'right']],
  13: [['top', 'right']],
  14: [['left', 'top']],
}
```

Encode `tl=1`, `tr=2`, `br=4`, `bl=8`. Cases `0` and `15` produce no crossing. Resolve saddle cases with the arithmetic center value:

```js
function pairsFor(mask, centerInside) {
  if (mask === 5) {
    return centerInside
      ? [['top', 'right'], ['bottom', 'left']]
      : [['left', 'top'], ['right', 'bottom']]
  }
  if (mask === 10) {
    return centerInside
      ? [['left', 'top'], ['right', 'bottom']]
      : [['top', 'right'], ['bottom', 'left']]
  }
  return SIMPLE_CASES[mask] ?? []
}
```

Interpolate both distance and altitude along the selected cell edge using the same CLD ratio:

```js
function interpolatePoint(a, b, threshold) {
  const ratio = a.cld === b.cld ? 0.5 : (threshold - a.cld) / (b.cld - a.cld)
  return {
    distanceNm: a.distanceNm + (b.distanceNm - a.distanceNm) * ratio,
    altFt: a.altFt + (b.altFt - a.altFt) * ratio,
  }
}
```

Skip the entire cell unless all four vertices have finite `distanceNm`, `altFt`, and `cld`.

- [ ] **Step 5: Stitch segments without smoothing or gap repair**

Build endpoint keys from domain coordinates and consume each segment once:

```js
function endpointKey(point) {
  return `${point.distanceNm.toFixed(4)},${point.altFt.toFixed(2)}`
}
```

Grow each chain from both ends only when another unused segment has the exact rounded endpoint key. Do not search for a nearby point, infer across a missing cell, append a data-boundary segment, or pass the result through a spline.

After a chain is complete, normalize a closed chain so its last point is the same object value as its first point:

```js
if (endpointKey(chain[0]) === endpointKey(chain.at(-1))) {
  chain[chain.length - 1] = chain[0]
}
```

Determine model status independently from chain count. The chart passes only the pressure range covered by CLD, so a missing value inside these rows is a real partial-data condition rather than an uncollected upper level:

```js
const values = levels.flatMap((level) => level.values ?? [])
const finiteCld = values
  .map((value) => value.cld)
  .filter(Number.isFinite)
const partial = finiteCld.length > 0 && values.some((value) =>
  !Number.isFinite(value.cld)
  || !Number.isFinite(value.distanceNm)
  || !Number.isFinite(value.altFt))
const status = finiteCld.length === 0
  ? 'unavailable'
  : finiteCld.some((value) => value >= threshold)
    ? 'detected'
    : 'not_detected'
```

Return `partial` beside `status`. A partial grid may still produce honest contour chains on fully finite cells, but callers must not describe the whole route as having no qualifying CLD.

- [ ] **Step 6: Run the pure contour tests**

Run:

```bash
node --test frontend/src/features/route-briefing/lib/cloudContour.test.js
```

Expected: PASS with one closed outline, two disconnected outlines across the null column, honest unavailable/not-detected states, and per-sample altitude interpolation.

- [ ] **Step 7: Commit the contour model**

```bash
git add \
  frontend/src/features/route-briefing/lib/cloudContour.js \
  frontend/src/features/route-briefing/lib/cloudContour.test.js
git commit -m "feat: derive KIM CLD contour outlines"
```

---

### Task 3: Render outline-only cloud contours in every vertical-profile surface

**Files:**
- Modify: `frontend/src/features/route-briefing/VerticalProfileChart.jsx:1-3,330-425,515-595`
- Modify: `frontend/src/features/route-briefing/crossSectionLayers.jsx:5-25`
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx:75-87`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css:945-1000`
- Test: `frontend/src/features/route-briefing/BriefingView.responsive.test.js`

**Interfaces:**
- Consumes: `buildCloudContourModel(crossSection.levels, crossSection.coverage.byVariable.cld.threshold)`.
- Produces: `<g data-testid="kim-cloud-contours" aria-label="KIM CLD 구름 윤곽">` containing only `<path className="cs-cloud-contour" fill="none">` elements.
- Produces: layer state key `cloud: boolean`, shared by inline, detached, and mobile-full vertical-profile surfaces.
- Produces: visible metadata text `KIM CLD ≥ 0.6 윤곽`, `KIM CLD ≥ 0.6 윤곽 · 일부 결측`, `KIM CLD ≥ 0.6 없음`, `KIM CLD 일부 결측`, or `KIM CLD 자료 없음` while the layer is enabled.

- [ ] **Step 1: Add failing shared-layer wiring assertions**

Extend `BriefingView.responsive.test.js` to read `crossSectionLayers.jsx` and assert:

```js
assert.match(shared, /\['cloud', '구름'\]/)
assert.match(shared, /cloud: true/)
assert.match(jsx, /cloud: true/)
assert.match(profileChartJsx, /data-testid="kim-cloud-contours"/)
assert.match(profileChartJsx, /className="cs-cloud-contour"/)
assert.match(profileChartJsx, /fill="none"/)
```

Add `구름` to the existing mobile fullscreen control list in `briefing-view.spec.mjs` during Task 4; keep this task's Node test limited to source wiring.

- [ ] **Step 2: Run the responsive test and verify RED**

Run:

```bash
node --test frontend/src/features/route-briefing/BriefingView.responsive.test.js
```

Expected: FAIL because the `cloud` layer, contour group, and outline class do not exist.

- [ ] **Step 3: Add the independent default-on cloud toggle**

Update the shared toggle list and defaults:

```js
export const CROSS_SECTION_TOGGLES = [
  ['temp', '기온'],
  ['moisture', '습도'],
  ['cloud', '구름'],
  ['icing', '착빙'],
  ['wind', '바람'],
  ['turbulence', '난류'],
  ['advisories', 'SIGMET/AIRMET'],
]

const DEFAULT_LAYERS = {
  temp: true,
  wind: true,
  icing: false,
  moisture: true,
  cloud: true,
  turbulence: false,
  advisories: true,
}
```

In `BriefingView.jsx`'s custom initial object, add `cloud: true` beside the always-on temperature/wind/advisory keys. Do not change the icing/moisture mutual-exclusion code.

- [ ] **Step 4: Map domain contour chains to the existing chart axes**

Import the pure model:

```js
import { buildCloudContourModel } from './lib/cloudContour.js'
```

After `csLevels` and `xFor`/`yFor` exist, derive the model only from response metadata:

```js
const cldCoverage = crossSection?.coverage?.byVariable?.cld
const cldLevels = Number.isFinite(cldCoverage?.topPressure)
  ? csLevels.filter((level) => Number(level.pressure) >= Number(cldCoverage.topPressure))
  : []
const cloudContour = Number.isFinite(cldCoverage?.threshold)
  ? buildCloudContourModel(cldLevels, cldCoverage.threshold)
  : { status: 'unavailable', partial: false, threshold: null, chains: [] }
const cloudPaths = layers.cloud
  ? cloudContour.chains
    .map((chain) => buildPath(chain.map((point) => ({
      x: xFor(point.distanceNm),
      y: yFor(point.altFt),
    }))))
    .filter(Boolean)
  : []
```

Do not use `altFor(level)`, `pressureToFallbackFt()`, `catmullRomPath()`, or `cs-blur` for these paths.

- [ ] **Step 5: Render no-fill paths in the weather clip group**

Render after temperature isotherms and before wind barbs so the outline remains legible over moisture/icing shading while wind and advisories keep their current priority:

```jsx
{layers.cloud && cloudPaths.length > 0 && (
  <g data-testid="kim-cloud-contours" aria-label="KIM CLD 구름 윤곽">
    {cloudPaths.map((path, index) => (
      <path key={`cld-${index}`} d={path} className="cs-cloud-contour" fill="none">
        <title>{`KIM CLD ${cloudContour.threshold} 구름 윤곽`}</title>
      </path>
    ))}
  </g>
)}
```

Keep this group inside the existing `cs-clip`. Keep terrain rendering after the clipped weather group so terrain naturally masks below-ground portions.

- [ ] **Step 6: Show an honest CLD state beside existing chart metadata**

While `layers.cloud` is true and a cross-section response exists, render one metadata item:

```jsx
<span className="vertical-profile-meta-item cs-cloud-meta">
  <span>구름 윤곽</span>
  <strong>{cloudContour.status === 'detected'
    ? `KIM CLD ≥ ${cloudContour.threshold} 윤곽${cloudContour.partial ? ' · 일부 결측' : ''}`
    : cloudContour.status === 'not_detected'
      ? cloudContour.partial
        ? 'KIM CLD 일부 결측'
        : `KIM CLD ≥ ${cloudContour.threshold} 없음`
      : 'KIM CLD 자료 없음'}</strong>
</span>
```

Do not show `없음` for `unavailable` or `partial` data, and do not call any state `ceiling`.

- [ ] **Step 7: Add the outline-only style**

Add:

```css
.cs-cloud-contour {
  fill: none;
  stroke: #0369a1;
  stroke-width: 2.25;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

.cs-cloud-meta strong {
  color: #0369a1;
}
```

Do not add opacity fill, blur, dash animation, or cloud icons.

- [ ] **Step 8: Run frontend unit/static tests and build**

Run:

```bash
node --test \
  frontend/src/features/route-briefing/lib/cloudContour.test.js \
  frontend/src/features/route-briefing/BriefingView.responsive.test.js
npm --prefix frontend run build
```

Expected: both tests PASS and Vite production build completes without unresolved imports or JSX errors.

- [ ] **Step 9: Commit the shared chart rendering**

```bash
git add \
  frontend/src/features/route-briefing/VerticalProfileChart.jsx \
  frontend/src/features/route-briefing/crossSectionLayers.jsx \
  frontend/src/features/route-briefing/BriefingView.jsx \
  frontend/src/features/route-briefing/RouteBriefing.css \
  frontend/src/features/route-briefing/BriefingView.responsive.test.js
git commit -m "feat: draw CLD cloud outlines in vertical profiles"
```

---

### Task 4: Add deterministic cloud blobs and browser-visible evidence

**Files:**
- Modify: `frontend/verification/route-fixture.mjs:108-112`
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs:46-108`
- Create: `frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-desktop-linux.png`
- Create: `frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-ipad-landscape-linux.png`
- Create: `frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-mobile-linux.png`

**Interfaces:**
- Produces: a deterministic cross-section fixture with two disconnected `CLD >= 0.6` regions and one full-height missing column.
- Produces: `briefing-view` browser assertions that the layer is default-on, draws exactly two outline chains, has no fill, toggles off/on, and causes no document overflow.
- Produces: three Linux visual baselines of the chart, one per registered viewport.

- [ ] **Step 1: Replace the empty cross-section fixture with a deterministic CLD matrix**

Create nine distance samples and five pressure levels. Every level value must include `distanceNm`, `altFt`, and `cld`; the sixth column is `null` at every level so the two areas cannot connect:

```js
const cloudDistancesNm = [0, 20, 40, 60, 80, 100, 120, 140, 160]
const cloudRows = [
  { pressure: 975, altFt: 1000, cld: [0.1, 0.1, 0.2, 0.2, 0.1, null, 0.1, 0.1, 0.1] },
  { pressure: 925, altFt: 2500, cld: [0.1, 0.2, 0.7, 0.8, 0.2, null, 0.1, 0.7, 0.1] },
  { pressure: 850, altFt: 5000, cld: [0.1, 0.7, 0.9, 0.8, 0.2, null, 0.7, 0.9, 0.2] },
  { pressure: 750, altFt: 8000, cld: [0.1, 0.2, 0.8, 0.3, 0.1, null, 0.2, 0.7, 0.1] },
  { pressure: 700, altFt: 10000, cld: [0.1, 0.1, 0.2, 0.1, 0.1, null, 0.1, 0.1, 0.1] },
]

const cloudLevels = cloudRows.map((row) => ({
  pressure: row.pressure,
  altFt: row.altFt,
  values: row.cld.map((cld, index) => ({
    distanceNm: cloudDistancesNm[index],
    altFt: row.altFt,
    cld,
    t: null,
    spread: null,
    icing: null,
    u: null,
    v: null,
  })),
}))
```

Use it in the fixture response:

```js
const crossSection = {
  run: { id: 'contract-fixture', model: 'fixture', tmfc: '2026071800', hf: 0, validTime: '2026-07-18T09:00:00Z' },
  availableTimes: [
    { hf: 0, validTime: '2026-07-18T09:00:00Z' },
    { hf: 3, validTime: '2026-07-18T12:00:00Z' },
  ],
  levels: cloudLevels,
  coverage: {
    byVariable: {
      cld: { available: true, topPressure: 700, threshold: 0.6, unit: '1' },
    },
  },
  turbulence: { available: false, levels: [] },
}
```

- [ ] **Step 2: Add the failing browser contract before regenerating images**

Add a focused test under `test.describe('briefing-view')`:

```js
test('shows two outline-only KIM CLD cloud regions and toggles them', async ({ page }) => {
  await createBriefing(page)

  const profile = page.getByRole('region', { name: '연직단면도', exact: true })
  const cloudToggle = profile.getByRole('button', { name: '구름', exact: true })
  await expect(cloudToggle).toHaveAttribute('aria-pressed', 'true')

  const contours = profile.getByTestId('kim-cloud-contours')
  await expect(contours).toBeVisible()
  await expect(contours.locator('path.cs-cloud-contour')).toHaveCount(2)
  await expect(profile.getByText('KIM CLD ≥ 0.6 윤곽 · 일부 결측', { exact: true })).toBeVisible()
  expect(await contours.locator('path.cs-cloud-contour').evaluateAll((paths) =>
    paths.every((path) => path.getAttribute('fill') === 'none' && getComputedStyle(path).fill === 'none'))).toBe(true)

  await cloudToggle.click()
  await expect(profile.getByTestId('kim-cloud-contours')).toHaveCount(0)
  await cloudToggle.click()
  await expect(profile.getByTestId('kim-cloud-contours')).toBeVisible()

  await expect(profile.locator('.vertical-profile-chart')).toHaveScreenshot('kim-cld-cloud-contours.png', {
    animations: 'disabled',
  })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
```

If the existing `aria-label="연직단면도"` region matches more than one surface in a project, scope first to `.bv-leg-briefing` and then continue using role/name locators for controls. Do not use a CSS path or positional selector for the `구름` button.

Add `구름` to the existing mobile fullscreen expected-control loop:

```js
for (const label of ['기온', '습도', '구름', '착빙', '바람', '난류', 'SIGMET/AIRMET']) {
  await expect(fullscreen.getByRole('button', { name: label, exact: true })).toBeVisible()
}
```

- [ ] **Step 3: Run the focused contract and verify RED**

Run:

```bash
npm --prefix frontend run dev:contract:fast -- \
  contracts/briefing-view.spec.mjs \
  -g "shows two outline-only KIM CLD cloud regions"
```

Expected: FAIL before fixture/rendering completion because the contour group or snapshot does not exist. If it fails before reaching the assertion, invoke `systematic-debugging`, classify the actual fixture/entry-flow cause, and return to this step.

- [ ] **Step 4: Generate and inspect all three Linux baselines**

With ports 3001 and 5173 free, run the managed all-project command:

```bash
npm --prefix frontend run dev:contract -- \
  contracts/briefing-view.spec.mjs \
  -g "shows two outline-only KIM CLD cloud regions" \
  --update-snapshots
```

Expected: desktop, iPad landscape, and mobile each create one `*-linux.png` baseline. Open all three images with `view_image` and confirm:

- exactly two disconnected blue contour shapes are visible;
- neither contour has an interior fill;
- the missing column leaves a visible gap rather than a bridge;
- terrain and the planned flight profile remain legible;
- the `구름` control is visible without causing document-level horizontal overflow.

Do not accept the snapshots merely because Playwright wrote files; visual inspection is part of this step.

- [ ] **Step 5: Re-run the focused contract without updating snapshots**

Run:

```bash
npm --prefix frontend run dev:contract -- \
  contracts/briefing-view.spec.mjs \
  -g "shows two outline-only KIM CLD cloud regions"
```

Expected: 3/3 projects PASS against the committed Linux baselines.

- [ ] **Step 6: Commit deterministic browser evidence**

```bash
git add \
  frontend/verification/route-fixture.mjs \
  frontend/verification/contracts/briefing-view.spec.mjs \
  frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-desktop-linux.png \
  frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-ipad-landscape-linux.png \
  frontend/verification/contracts/briefing-view.spec.mjs-snapshots/kim-cld-cloud-contours-mobile-linux.png
git commit -m "test: verify CLD outlines across profile viewports"
```

---

### Task 5: Full verification and graph refresh

**Files:**
- Modify after code changes: `graphify-out/*` through `graphify update .`
- No architecture or policy document changes are required: the existing file-role descriptions remain true and the active `briefing-view` contract already owns this surface.

**Interfaces:**
- Verifies: backend CLD transport, pure contour topology, shared layer state, production build, all registered `briefing-view` scenarios, and graph freshness.
- Produces: final report with test output and direct links to the three baseline images.

- [ ] **Step 1: Run the complete backend and frontend test suites**

Run:

```bash
npm test
```

Expected: backend and frontend Node test suites PASS. Any failure invokes `systematic-debugging`; do not patch around it or continue to completion claims.

- [ ] **Step 2: Run the production build**

Run:

```bash
npm run build
```

Expected: Vite production build PASS.

- [ ] **Step 3: Run the full registered briefing-view contract**

Run from the repository root with ports 3001 and 5173 free:

```bash
npm run dev:contract -- --grep briefing-view
```

Expected: every `briefing-view` test passes for desktop, iPad landscape, and mobile. Report implementation completion separately from end-to-end completion if any project fails.

- [ ] **Step 4: Verify UTF-8 text and patch cleanliness**

Run:

```bash
node -e "const fs=require('node:fs'); for (const p of ['frontend/src/features/route-briefing/crossSectionLayers.jsx','frontend/src/features/route-briefing/VerticalProfileChart.jsx','frontend/verification/contracts/briefing-view.spec.mjs']) { const s=fs.readFileSync(p,'utf8'); if (!s.includes('구름')) throw new Error(p + ' missing Korean label') }"
git diff --check
```

Expected: no exception and no whitespace errors.

- [ ] **Step 5: Refresh the project graph**

Run:

```bash
graphify update .
```

Expected: graph update completes and includes `cloudContour.js`, `buildCloudContourModel()`, and the `VerticalProfileChart` dependency. Dirty `graphify-out/` files are expected and are not a failure.

- [ ] **Step 6: Inspect final scope and report the visual result**

Run:

```bash
git status --short
git log --oneline -4
```

Confirm no user-owned terminal, architecture, policy, research, or pre-existing status files entered the feature commits. In the completion response, link all three Linux baseline images and state:

- CLD source and threshold (`KIM`, `0.6`);
- outline-only rendering (`fill="none"`);
- missing-cell behavior (no bridge);
- browser contract result for all three viewports;
- any remaining limitation: 8 km horizontal grid and discrete pressure-level vertical resolution.
