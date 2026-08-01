# flight_category 재설계 — 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 꺼져 있는 `flight_category` 수집을 되살리되, 좌표 투영을 바로잡고 운고 근거를 AMOS 7지점 보간에서 KIM 모델 격자로 바꾼다.

**Architecture:** 기존 `flight-category-processor.js`(약 290줄) 안에서 고치는 것을 기본으로 한다. 새 파일은 KIM 운저 계산과 용량 가드 둘만 만든다. 시정은 기상청 관측 격자에서, 운고는 이미 수집 중인 KIM `cld`에서, 구름 유무 마스크는 이미 수집 중인 CTPS 저장본에서 가져온다.

**Tech Stack:** Node.js (ESM), `node --test`, `d3-contour`, `@turf/simplify`.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-08-01-flight-category-redesign-design.md`. 스펙에 없는 사용자 영향 결정을 새로 만들지 않는다.
- 기존 구면 LCC 함수 `latLonToEN` / `enToLatLon`은 **수정하지 않는다.** CTPS와 `구름 꼭대기` 레이어가 쓰고 있다.
- `parseSfcAscii`의 북쪽 우선 행 뒤집기(41–49행)는 **정상 동작이므로 유지한다.**
- 자료 없음을 "기준 충족"으로 표시하지 않는다.
- 시정 밴드 경계 3,000 / 5,000 / 7,000 m. 운고 밴드 경계 450 m(1,500 ft) / 900 m.
- 시정 면과 운고 면을 하나의 값으로 합치지 않는다.
- 테스트는 `node --test`, 파일은 대상 모듈 옆에 `*.test.js`.

**Task 1–5 범위에서 뺐다가 Task 6–9로 되살린 것**: ASOS 운고 지점 표시, 시정 3시간 추세. 되살리기에 필수가 아니어서 미뤘고, 수집이 정상 동작하는 것을 확인한 뒤 이어서 한다.

## Task 6–9 추가 제약 (2026-08-01)

- Task 1–5는 완료됐다. 시작점은 `a44ce51`. 실측 1회로 산출물을 확인했다(vis 4면, ceiling 2면, `missing_ratio` 0.8184).
- **`backend/server.js`의 두 엔드포인트가 현재 깨져 있다.** Task 5가 산출물 구조를 바꿨는데 API 계층을 같이 고치지 않았다. `/api/weather/flight-category-overlay`는 없어진 `data.geojson`을 읽어 **빈 FeatureCollection을 200으로 응답**하고, `/api/weather/flight-category-overlay/point`는 없어진 `query_grid.lat_max`·`ceil_ft`를 읽는다. Task 9에서 고친다.
- 점 조회 엔드포인트에는 **Task 2에서 제거한 "결측 = VFR" 판정이 아직 살아 있다**(`server.js:863-865`). 면에서만 지웠고 점에는 남았다.
- 점 조회 엔드포인트는 **Task 1에서 고친 선형 위경도 가정도 그대로 쓴다**(`server.js:845-846`). 격자를 만드는 쪽과 읽는 쪽이 각자 좌표 규칙을 갖고 있어 생긴 문제이므로, 읽는 함수를 격자를 정의한 모듈로 옮겨 규칙을 한 곳에 둔다.
- ASOS 수집은 **별도 프로세서로 분리한다.** CTPS·KIM과 같은 구조 — 각자 받아 저장하고 flight_category는 디스크에서 읽는다. ASOS가 죽어도 면은 계속 나와야 한다.
- 실측으로 확인된 API 사실(스펙 §5.4에 반영됨): `kma_sfctm2.php`는 정시에만 자료가 있다. `CH_MIN` −9는 결측이다. 응답은 EUC-KR이다. 행은 97줄 고정 46필드이고 `CH_MIN`은 28번째 필드다. `stn_inf.php?inf=SFC`는 97지점 좌표를 주며 관측 지점과 100% 일치한다.

---

## Task 1: 좌표를 WGS84 LCC로

현재 구현은 위경도 등간격 평면을 가정해 남한에서 평균 13.5 km(0.5 km 격자 27셀), 최대 44 km 어긋난다. `.nc` 헤더가 Lambert Conformal Conic을 명시하며, WGS84 타원체로 계산하면 오차 0.000 km로 재현된다(표본 8점 검증 완료).

**Files:**
- Modify: `backend/src/lib/lcc-projection.js` (끝에 추가)
- Modify: `backend/src/parsers/sfc-grid-parser.js:1-7`, `:54-64`
- Create: `backend/test/fixtures/sfc-grid-samples.json`
- Test: `backend/src/parsers/sfc-grid-parser.test.js`

**Interfaces:**
- Produces: `enToLatLon84(easting, northing) => [lat, lon]`, `latLonToEN84(lat, lon) => [easting, northing]`, 그리고 좌표가 바로잡힌 `sfcPixelToLatLon(col, row)`

- [ ] **Step 1: 픽스처 생성**

`backend/test/fixtures/sfc-grid-samples.json` — `sfc_grid_latlon.nc`에서 뽑은 값. **row는 `.nc` 원본 기준(남쪽이 0)이다.**

```json
{
  "note": "sfc_grid_latlon.nc 표본. row는 원본(남쪽 우선) 기준.",
  "width": 2049,
  "height": 2049,
  "samples": [
    { "row": 0,    "col": 0,    "lat": 30.8307, "lon": 121.3823 },
    { "row": 0,    "col": 2048, "lat": 30.7434, "lon": 132.1238 },
    { "row": 2048, "col": 0,    "lat": 40.2180, "lon": 120.6674 },
    { "row": 2048, "col": 2048, "lat": 40.1146, "lon": 133.0699 },
    { "row": 1024, "col": 1024, "lat": 35.6169, "lon": 126.8109 },
    { "row": 1540, "col": 880,  "lat": 38.0000, "lon": 126.0000 },
    { "row": 500,  "col": 1500, "lat": 33.1597, "lon": 129.3655 },
    { "row": 1800, "col": 300,  "lat": 39.1457, "lon": 122.5472 }
  ]
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/parsers/sfc-grid-parser.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from './sfc-grid-parser.js'

const fixture = JSON.parse(
  fs.readFileSync(new URL('../../test/fixtures/sfc-grid-samples.json', import.meta.url), 'utf8'),
)

test('격자 좌표가 원본 .nc 값과 100m 이내로 일치', () => {
  for (const s of fixture.samples) {
    // 픽스처 row는 남쪽 우선, sfcPixelToLatLon은 북쪽 우선을 받는다.
    const { lat, lon } = sfcPixelToLatLon(s.col, SFC_H - 1 - s.row)
    const dLat = (lat - s.lat) * 111.0
    const dLon = (lon - s.lon) * 111.0 * Math.cos((s.lat * Math.PI) / 180)
    const dist = Math.hypot(dLat, dLon)
    assert.ok(dist < 0.1, `row=${s.row} col=${s.col} 오차 ${dist.toFixed(3)}km`)
  }
})

test('결측 -999는 -1로, 유효값은 km에서 m로 변환된다', () => {
  const body = new Array(SFC_W * SFC_H).fill('-999.0')
  body[0] = '5.0'
  const text = `  2049,  2049,=\n${body.join(',')}`
  const grid = parseSfcAscii(text)
  // 파서가 행을 뒤집으므로 남쪽 첫 칸은 마지막 행으로 간다.
  assert.equal(grid[(SFC_H - 1) * SFC_W], 5000)
  assert.equal(grid[1], -1)
})
```

- [ ] **Step 3: 실패 확인**

Run: `cd backend && node --test src/parsers/sfc-grid-parser.test.js`
Expected: 첫 테스트 FAIL — 선형 가정 값이라 오차가 10 km 넘게 나온다

- [ ] **Step 4: WGS84 LCC 추가**

`backend/src/lib/lcc-projection.js` 파일 **끝에 덧붙인다.** 기존 코드는 건드리지 않는다.

```js
// ── WGS84 타원체 LCC ─────────────────────────────────────────
// 기상청 지상 격자(sfc_obs)가 쓰는 투영. 구면 근사로는 최대 2.2km 잔차가 남는다.
const A84 = 6378137.0
const FLAT84 = 1 / 298.257223563
const E84 = Math.sqrt(2 * FLAT84 - FLAT84 * FLAT84)

const _m84 = (p) => Math.cos(p) / Math.sqrt(1 - E84 * E84 * Math.sin(p) ** 2)
const _t84 = (p) =>
  Math.tan(Math.PI / 4 - p / 2) /
  Math.pow((1 - E84 * Math.sin(p)) / (1 + E84 * Math.sin(p)), E84 / 2)

const _n84 = (Math.log(_m84(PHI1)) - Math.log(_m84(PHI2))) /
  (Math.log(_t84(PHI1)) - Math.log(_t84(PHI2)))
const _F84 = _m84(PHI1) / (_n84 * Math.pow(_t84(PHI1), _n84))
const _rho0_84 = A84 * _F84 * Math.pow(_t84(PHI0), _n84)

export function latLonToEN84(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const rho = A84 * _F84 * Math.pow(_t84(lat), _n84)
  const theta = _n84 * (lon - LAM0)
  return [rho * Math.sin(theta), _rho0_84 - rho * Math.cos(theta)]
}

export function enToLatLon84(easting, northing) {
  const rho = Math.hypot(easting, _rho0_84 - northing)
  const theta = Math.atan2(easting, _rho0_84 - northing)
  const tt = Math.pow(rho / (A84 * _F84), 1 / _n84)
  let lat = Math.PI / 2 - 2 * Math.atan(tt)
  for (let i = 0; i < 8; i++) {
    lat = Math.PI / 2 - 2 * Math.atan(
      tt * Math.pow((1 - E84 * Math.sin(lat)) / (1 + E84 * Math.sin(lat)), E84 / 2),
    )
  }
  return [lat / DEG2RAD, (LAM0 + theta / _n84) / DEG2RAD]
}
```

- [ ] **Step 5: 파서 교체**

`backend/src/parsers/sfc-grid-parser.js`의 1–7행을 다음으로 바꾼다:

```js
import { enToLatLon84 } from '../lib/lcc-projection.js'

export const SFC_W = 2049
export const SFC_H = 2049

// sfc_grid_latlon.nc 헤더: 격자 0.5km, 투영 원점(38N,126E)이 col 880 / 남쪽기준 row 1540.
const CELL_M = 500
const ORIGIN_COL = 880
const ORIGIN_ROW_FROM_SOUTH = 1540
```

54–64행(`sfcPixelToLatLon` 정의 전체)을 다음으로 바꾼다:

```js
/**
 * 격자 픽셀 → 위경도. row 0 = 북단(parseSfcAscii가 뒤집은 뒤 관례).
 * WGS84 타원체 Lambert Conformal Conic.
 */
export function sfcPixelToLatLon(col, row) {
  const rowFromSouth = SFC_H - 1 - row
  const easting = (col - ORIGIN_COL) * CELL_M
  const northing = (rowFromSouth - ORIGIN_ROW_FROM_SOUTH) * CELL_M
  const [lat, lon] = enToLatLon84(easting, northing)
  return { lat, lon }
}
```

- [ ] **Step 6: 통과 확인**

Run: `cd backend && node --test src/parsers/sfc-grid-parser.test.js`
Expected: PASS (2 tests)

- [ ] **Step 7: 전체 회귀**

Run: `cd backend && node --test`
Expected: 전부 통과. `flight-category-processor.test.js`가 좌표를 단정하고 있으면 새 값으로 갱신한다.

- [ ] **Step 8: 커밋**

```bash
git add backend/src/lib/lcc-projection.js backend/src/parsers/sfc-grid-parser.js backend/src/parsers/sfc-grid-parser.test.js backend/test/fixtures/sfc-grid-samples.json
git commit -m "fix(sfc): use WGS84 LCC instead of linear lat/lon assumption"
```

---

## Task 2: 결측 분리와 시정 밴드

현재 `classifyFlightCategory`는 결측(−1)을 VFR로 친다. 자료가 없을수록 화면이 안전해 보이는 구조다. 시정과 운고를 worst-case로 묶던 것도 없앤다.

**Files:**
- Modify: `backend/src/processors/flight-category-processor.js:12-31`, `:195-246`
- Test: `backend/src/processors/flight-category-processor.test.js`

**Interfaces:**
- Produces: `classifyVisibility(visM) => 'severe' | 'below' | 'marginal' | 'clear' | 'missing'`, `buildVisibilityGeoJson(visGrid) => FeatureCollection`

- [ ] **Step 1: 실패하는 테스트 작성**

**기존 `backend/src/processors/flight-category-processor.test.js`를 통째로 아래 내용으로 교체한다.**

교체하는 이유: 기존 파일은 `classifyFlightCategory`, `worstCategory`, `CATEGORY_COLORS`, `cthIndexToPixel` **네 개를 모두 import**하는데, Task 2와 Task 4가 넷 다 없앤다. 일부만 지우면 남은 테스트가 깨진다.

삭제해도 안전한 것을 확인했다 — `CATEGORY_COLORS`의 백엔드 export는 프론트가 쓰지 않는다(프론트는 `frontend/src/features/map/lib/airportStationImages.js`에서 자체 `AIRPORT_CATEGORY_COLORS`를 쓴다). `cthIndexToPixel`은 이 테스트 파일에서만 쓰인다.

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyVisibility, buildVisibilityGeoJson } from './flight-category-processor.js'
import { SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'

test('시정 밴드 경계값', () => {
  assert.equal(classifyVisibility(2999), 'severe')
  assert.equal(classifyVisibility(3000), 'below')
  assert.equal(classifyVisibility(4999), 'below')
  assert.equal(classifyVisibility(5000), 'marginal')
  assert.equal(classifyVisibility(6999), 'marginal')
  assert.equal(classifyVisibility(7000), 'clear')
})

test('결측은 missing이며 절대 clear가 아니다', () => {
  assert.equal(classifyVisibility(-1), 'missing')
})

test('clear 구역은 폴리곤을 만들지 않는다', () => {
  const grid = new Float32Array(SFC_W * SFC_H).fill(9000)
  grid[SFC_W * 100 + 100] = 1000
  const bands = buildVisibilityGeoJson(grid).features.map((f) => f.properties.band)
  assert.ok(bands.includes('severe'))
  assert.ok(!bands.includes('clear'))
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && node --test src/processors/flight-category-processor.test.js`
Expected: FAIL — `classifyVisibility` 미노출

- [ ] **Step 3: 구현**

`flight-category-processor.js`의 12–31행(분류 상수와 `worstCategory`·`classifyFlightCategory`)을 다음으로 교체한다:

```js
// ─── 시정 밴드 ────────────────────────────────────────────────
// 별표 24 기준선 5,000m 를 가운데 두고 아래위로 한 단계씩.
export const VIS_BAND_COLORS = {
  severe: '#dc2626',
  below: '#f97316',
  marginal: '#fde047',
  missing: '#9ca3af',
}

export function classifyVisibility(visM) {
  if (!(visM >= 0)) return 'missing'
  if (visM < 3000) return 'severe'
  if (visM < 5000) return 'below'
  if (visM < 7000) return 'marginal'
  return 'clear'
}
```

195–246행(`categoryGridToGeoJson` 전체)을 다음으로 교체한다:

```js
function contourFeature(mask, band) {
  const gen = contours().size([SFC_W, SFC_H]).thresholds([0.5])
  const [contour] = gen(mask)
  if (!contour?.coordinates?.length) return null
  const feature = {
    type: 'Feature',
    properties: { band, color: VIS_BAND_COLORS[band] },
    geometry: {
      type: 'MultiPolygon',
      coordinates: contour.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(([px, py]) => pixelToLonLat(px, py))),
      ),
    },
  }
  try {
    const s = simplify(feature, {
      tolerance: config.flight_category.simplify_tolerance,
      highQuality: false,
    })
    return s.geometry?.coordinates?.length ? s : feature
  } catch {
    return feature
  }
}

/** clear 구역은 도형을 만들지 않는다. 배경이 곧 기준 충족이다. */
export function buildVisibilityGeoJson(visGrid) {
  const features = []
  for (const band of ['severe', 'below', 'marginal', 'missing']) {
    const mask = new Uint8Array(visGrid.length)
    for (let i = 0; i < visGrid.length; i++) {
      if (classifyVisibility(visGrid[i]) === band) mask[i] = 1
    }
    const f = contourFeature(mask, band)
    if (f) features.push(f)
  }
  return { type: 'FeatureCollection', features }
}
```

`pixelToLonLat`(185–193행)는 `sfcPixelToLatLon`을 쓰도록 바꾼다:

```js
function pixelToLonLat(px, py) {
  const { lat, lon } = sfcPixelToLatLon(px, py)
  return [lon, lat]
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && node --test src/processors/flight-category-processor.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/flight-category-processor.js backend/src/processors/flight-category-processor.test.js
git commit -m "fix(flight-category): stop treating missing data as VFR"
```

---

## Task 3: CTPS 저장본 재사용

위성 프로세서가 5분 주기로 이미 CTPS를 받아 `data/satellite/convective/ctps_{tm}.bin`에 저장한다. 같은 자료를 두 번 받지 않는다.

**Files:**
- Modify: `backend/src/processors/flight-category-processor.js:94-107` (`fetchCtps`, `parseCthBuffer` 제거)
- Test: `backend/src/processors/flight-category-processor.test.js`

**Interfaces:**
- Produces: `loadCtpsMask(root) => { frameTm, isClearAt(lat, lon) } | null`

`isClearAt`은 구름이 **없으면** `true`. 격자 밖이거나 무효 픽셀이면 `true`(구름 근거 없음). 저장본이 없으면 함수가 `null`을 반환하고 호출자는 마스킹을 생략한다.

- [ ] **Step 1: 실패하는 테스트 작성**

```js
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { encodeCtpsBinary } from './convective-satellite-model.js'
import { loadCtpsMask } from './flight-category-processor.js'

function makeRoot(tm, cloudy) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctps-'))
  const dir = path.join(root, 'satellite', 'convective')
  fs.mkdirSync(dir, { recursive: true })
  const size = 900 * 900
  fs.writeFileSync(path.join(dir, `ctps_${tm}.bin`), encodeCtpsBinary({
    attrs: { width: 900, height: 900, pixelSize: 2000, ulEasting: -899000, ulNorthing: 899000 },
    heightFt: new Uint32Array(size).fill(cloudy ? 12000 : 4294967295),
    temperatureCentiC: new Int16Array(size).fill(cloudy ? -1000 : 32767),
    quality: new Uint8Array(size).fill(cloudy ? 0 : 255),
  }))
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify({ frames: [{ tm }], latest: { tm } }))
  return root
}

test('저장본이 없으면 null', () => {
  assert.equal(loadCtpsMask(fs.mkdtempSync(path.join(os.tmpdir(), 'empty-'))), null)
})

test('구름 있는 프레임에서 국내 좌표는 clear가 아니다', () => {
  const mask = loadCtpsMask(makeRoot('202608010300', true))
  assert.equal(mask.frameTm, '202608010300')
  assert.equal(mask.isClearAt(37.5, 127.0), false)
})

test('무효 픽셀은 clear로 본다', () => {
  const mask = loadCtpsMask(makeRoot('202608010300', false))
  assert.equal(mask.isClearAt(37.5, 127.0), true)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && node --test src/processors/flight-category-processor.test.js`
Expected: FAIL — `loadCtpsMask` 미노출

- [ ] **Step 3: 구현**

`flight-category-processor.js`에서 `fetchCtps`(94–103행)와 `parseCthBuffer`(105–107행)를 **삭제**하고, `parseCtpsNC` import도 지운다. 대신 다음을 추가한다:

```js
import fs from 'node:fs'
import path from 'node:path'
import { convectiveDir, readConvectiveMeta } from './convective-satellite-store.js'
import { decodeCtpsRecord } from './convective-satellite-model.js'
```

```js
/**
 * 위성 프로세서가 발행한 최신 CTPS 이진을 읽어 "구름 없음" 조회기를 만든다.
 * 별도 수집하지 않는다 — 이미 5분 주기로 받고 있는 자료다.
 */
export function loadCtpsMask(root) {
  const tm = readConvectiveMeta(root)?.latest?.tm
  if (!tm) return null
  const file = path.join(convectiveDir(root), `ctps_${tm}.bin`)
  if (!fs.existsSync(file)) return null
  let buffer
  try {
    buffer = fs.readFileSync(file)
  } catch {
    return null
  }
  return {
    frameTm: tm,
    isClearAt(lat, lon) {
      const idx = ctpsIndexForLatLon(lat, lon)
      if (idx === null) return true
      try {
        return decodeCtpsRecord(buffer, idx) === null
      } catch {
        return true
      }
    },
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && node --test src/processors/flight-category-processor.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/flight-category-processor.js backend/src/processors/flight-category-processor.test.js
git commit -m "refactor(flight-category): reuse stored CTPS instead of refetching"
```

---

## Task 4: 운고를 KIM `cld`로 교체

AMOS 7지점(`amos_stn`이 있는 공항) IDW를 버리고 KIM 격자(205×169, 7.4×9.3 km)에서 운저를 계산한다. `cld`는 CF 표준명 `cloud_area_fraction_in_layer`, 0~1 비율이며 KIM 수집에 이미 포함돼 있다.

**저장 구조는 실물로 확인했다** (2026-08-01, run `KIMG_NE57_2026073106`):

- `data/kim_nwp/index.json`에 `latestRun: "2026073106"`, `levels` 21개, `resolution: { nx: 205, ny: 169, dx_km: 7.4, dy_km: 9.3 }`
- `data/kim_nwp/runs/KIMG_NE57_<run>/normalized/hf000/<level>/grid.json` 존재
- 그 안 `variables`에 `u, v, T, hgt, rh, w, rh_liq, tqc, tqi, tqr, tqs, cld`
- 인코딩 `int16-scaled-json-v1`, `cld`는 scale 0.0001, 결측 −32768
- 저층 실측: 975 hPa 평균고도 261 m, 950 hPa 491 m, 925 hPa 727 m

구조가 다르면 `loadKimCeiling`이 조용히 `null`을 반환해 운고 면이 비게 된다. Step 4 이후 실제 run으로 한 번 확인한다.

**Files:**
- Create: `backend/src/processors/flight-category/ceiling-kim.js`
- Test: `backend/src/processors/flight-category/ceiling-kim.test.js`
- Modify: `backend/src/processors/flight-category-processor.js` — `getAmosCeilingPoints`(109–125행), `bilinearUpscale`(127–144행), `buildCategoryGrid`(146–159행), `getCthLookup`(40–52행) 삭제. `idwInterpolate` import 제거.

**Interfaces:**
- Consumes: Task 3의 `loadCtpsMask`
- Produces:
  - `CLD_THRESHOLD` (0.6), `ceilingFromLevels(levels, index) => number | null`
  - `loadKimCeiling(root) => { run, grid, ceilingM } | null`
  - `buildCeilingGeoJson(kimCeiling, ctpsMask) => FeatureCollection`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/src/processors/flight-category/ceiling-kim.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ceilingFromLevels, CLD_THRESHOLD, buildCeilingGeoJson } from './ceiling-kim.js'

const lv = (id, cld, hgt) => ({ id, cld: Float32Array.from([cld]), hgt: Float32Array.from([hgt]) })

test('임계값을 처음 넘는 층의 고도를 운저로 삼는다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.1, 261), lv('950hPa', 0.7, 491)], 0), 491)
})

test('모든 층이 미달이면 운저 없음', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', 0.0, 261), lv('950hPa', 0.2, 491)], 0), null)
})

test('임계값 경계는 이상(>=)으로 판정한다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', CLD_THRESHOLD, 261)], 0), 261)
})

test('결측 층은 건너뛴다', () => {
  assert.equal(ceilingFromLevels([lv('975hPa', Number.NaN, 261), lv('950hPa', 0.8, 491)], 0), 491)
})

test('위성이 구름 없다고 하면 그 격자는 운저를 지운다', () => {
  const kim = {
    run: '2026080100',
    grid: { nx: 2, ny: 1, lonMin: 126, latMin: 37, lonMax: 127, latMax: 37 },
    ceilingM: Float32Array.from([300, 300]),
  }
  const alwaysClear = { frameTm: 'x', isClearAt: () => true }
  const fc = buildCeilingGeoJson(kim, alwaysClear)
  assert.equal(fc.features.length, 0)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && node --test src/processors/flight-category/ceiling-kim.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`backend/src/processors/flight-category/ceiling-kim.js`

```js
import fs from 'node:fs'
import path from 'node:path'
import { contours } from 'd3-contour'

// 항공 ceiling 관례는 BKN(5/8) 이상. 흐린 날 표본으로 재조정할 수 있게 상수로 둔다.
export const CLD_THRESHOLD = 0.6

// 1000hPa는 평균 고도 36m로 지표에 붙어 지형 아래 격자가 많아 제외한다.
export const CEILING_SEARCH_LEVELS = [
  '975hPa', '950hPa', '925hPa', '900hPa', '875hPa', '850hPa', '800hPa', '750hPa', '700hPa',
]

// §172① 관제권 조건 450m(1,500ft)를 기준으로 아래·근처·위.
export const CEILING_BANDS = [
  { id: 'low', maxM: 450, color: '#dc2626' },
  { id: 'mid', maxM: 900, color: '#f97316' },
]

/** 한 격자점에서 저층부터 훑어 처음 임계값을 넘는 층의 hgt(m). 없으면 null. */
export function ceilingFromLevels(levels, index) {
  for (const level of levels) {
    const c = level.cld[index]
    if (!Number.isFinite(c)) continue
    if (c >= CLD_THRESHOLD) {
      const h = level.hgt[index]
      if (Number.isFinite(h)) return h
    }
  }
  return null
}

function decodeVariable(variable) {
  if (!variable) return null
  const { scale = 1, offset = 0, values } = variable
  const out = new Float32Array(values.length)
  for (let i = 0; i < values.length; i++) {
    out[i] = values[i] === -32768 ? Number.NaN : values[i] * scale + offset
  }
  return out
}

/** 최신 KIM run의 hf000에서 저층 cld/hgt를 읽어 운저 격자를 만든다. */
export function loadKimCeiling(root) {
  const indexPath = path.join(root, 'kim_nwp', 'index.json')
  if (!fs.existsSync(indexPath)) return null
  let index
  try {
    index = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
  } catch {
    return null
  }
  const run = index?.latestRun
  if (!run) return null

  const runDir = path.join(root, 'kim_nwp', 'runs', `KIMG_NE57_${run}`, 'normalized', 'hf000')
  const levels = []
  let grid = null
  for (const id of CEILING_SEARCH_LEVELS) {
    const file = path.join(runDir, id, 'grid.json')
    if (!fs.existsSync(file)) continue
    let doc
    try {
      doc = JSON.parse(fs.readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const cld = decodeVariable(doc?.variables?.cld)
    const hgt = decodeVariable(doc?.variables?.hgt)
    if (!cld || !hgt) continue
    grid = grid || doc.grid
    levels.push({ id, cld, hgt })
  }
  if (!levels.length || !grid) return null

  const ceilingM = new Float32Array(levels[0].cld.length)
  for (let i = 0; i < ceilingM.length; i++) {
    const c = ceilingFromLevels(levels, i)
    ceilingM[i] = c === null ? -1 : c
  }
  return { run, grid, ceilingM }
}

function cellToLonLat(grid, px, py) {
  const lon = grid.lonMin + (px / Math.max(grid.nx - 1, 1)) * (grid.lonMax - grid.lonMin)
  const lat = grid.latMin + (py / Math.max(grid.ny - 1, 1)) * (grid.latMax - grid.latMin)
  return [lon, lat]
}

/**
 * 운저 격자 → 밴드 폴리곤.
 * 위성이 "구름 없음"이라 하는 격자는 운저를 지운다 — 한 방향 마스크.
 */
export function buildCeilingGeoJson(kimCeiling, ctpsMask) {
  if (!kimCeiling) return { type: 'FeatureCollection', features: [] }
  const { grid, ceilingM } = kimCeiling
  const masked = Float32Array.from(ceilingM)
  if (ctpsMask) {
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] < 0) continue
      const py = Math.floor(i / grid.nx)
      const px = i % grid.nx
      const [lon, lat] = cellToLonLat(grid, px, py)
      if (ctpsMask.isClearAt(lat, lon)) masked[i] = -1
    }
  }

  const features = []
  let lower = 0
  for (const band of CEILING_BANDS) {
    const mask = new Uint8Array(masked.length)
    for (let i = 0; i < masked.length; i++) {
      if (masked[i] >= lower && masked[i] < band.maxM) mask[i] = 1
    }
    const [contour] = contours().size([grid.nx, grid.ny]).thresholds([0.5])(mask)
    if (contour?.coordinates?.length) {
      features.push({
        type: 'Feature',
        properties: { band: band.id, color: band.color },
        geometry: {
          type: 'MultiPolygon',
          coordinates: contour.coordinates.map((polygon) =>
            polygon.map((ring) => ring.map(([px, py]) => cellToLonLat(grid, px, py))),
          ),
        },
      })
    }
    lower = band.maxM
  }
  return { type: 'FeatureCollection', features }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && node --test src/processors/flight-category/ceiling-kim.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 프로세서에서 옛 운고 경로 제거**

`flight-category-processor.js`에서 다음을 **삭제**한다.

| 대상 | 행 | 비고 |
|---|---|---|
| `cthIndexToPixel` 재수출 | 33 | 테스트에서만 쓰였고 Task 2에서 테스트를 교체했다 |
| `let _cthLookup = null` | 40 | 함수와 함께 지운다. 이 줄을 남기면 미사용 변수가 된다 |
| `getCthLookup` 함수 | 42–52 | |
| `getAmosCeilingPoints` | 109–125 | |
| `bilinearUpscale` | 127–144 | |
| `buildCategoryGrid` | 146–159 | |

import도 함께 정리한다: `idwInterpolate`, `ctpsIndexForLatLon`(Task 3의 `loadCtpsMask`가 계속 쓰므로 **남긴다**), `parseCtpsNC`(Task 3에서 이미 제거).

삭제 전 확인 완료 — 위 심볼들을 저장소의 다른 모듈이 import하지 않는다.

- [ ] **Step 6: 회귀 확인**

Run: `cd backend && node --test`
Expected: 전부 통과

- [ ] **Step 7: 커밋**

```bash
git add backend/src/processors/flight-category/ceiling-kim.js backend/src/processors/flight-category/ceiling-kim.test.js backend/src/processors/flight-category-processor.js
git commit -m "feat(flight-category): derive ceiling from KIM cloud fraction instead of 7-point IDW"
```

---

## Task 5: 산출물 조립·용량 가드·수집 재활성화

**Files:**
- Create: `backend/src/lib/daily-byte-budget.js`
- Test: `backend/src/lib/daily-byte-budget.test.js`
- Modify: `backend/src/processors/flight-category-processor.js:250-292` (`process` 전체)
- Modify: `backend/src/config.js`
- Modify: `backend/src/index.js:151-153`, `:202-203`

**Interfaces:**
- Produces: `createDailyByteBudget({ limitBytes, now }) => { canSpend(), add(bytes), spent() }`

- [ ] **Step 1: 가드 테스트 작성**

`backend/src/lib/daily-byte-budget.test.js`

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createDailyByteBudget } from './daily-byte-budget.js'

test('한도에 닿으면 막는다', () => {
  const b = createDailyByteBudget({ limitBytes: 100, now: () => new Date('2026-08-01T00:00:00Z') })
  b.add(100)
  assert.equal(b.canSpend(), false)
})

test('KST 자정을 넘기면 초기화된다', () => {
  let t = new Date('2026-08-01T05:00:00Z')   // KST 14:00
  const b = createDailyByteBudget({ limitBytes: 100, now: () => t })
  b.add(100)
  assert.equal(b.canSpend(), false)
  t = new Date('2026-08-01T16:00:00Z')       // KST 다음날 01:00
  assert.equal(b.canSpend(), true)
  assert.equal(b.spent(), 0)
})
```

- [ ] **Step 2: 실패 확인**

Run: `cd backend && node --test src/lib/daily-byte-budget.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 가드 구현**

`backend/src/lib/daily-byte-budget.js`

```js
function kstDayKey(date) {
  const kst = new Date(date.getTime() + 9 * 3600 * 1000)
  return `${kst.getUTCFullYear()}-${kst.getUTCMonth() + 1}-${kst.getUTCDate()}`
}

/**
 * 하루 누적 다운로드 바이트를 세고 한도에 닿으면 막는다.
 * 이 수집기가 폭주해도 같은 API 키를 쓰는 METAR·TAF까지 죽지 않게 하는 backstop.
 */
export function createDailyByteBudget({ limitBytes, now = () => new Date() }) {
  let day = kstDayKey(now())
  let used = 0
  const roll = () => {
    const today = kstDayKey(now())
    if (today !== day) { day = today; used = 0 }
  }
  return {
    canSpend() { roll(); return used < limitBytes },
    add(bytes) { roll(); used += Number(bytes) || 0 },
    spent() { roll(); return used },
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `cd backend && node --test src/lib/daily-byte-budget.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: `process()` 교체**

`flight-category-processor.js`의 `process`(250–292행)를 다음으로 바꾼다.

```js
const budget = createDailyByteBudget({
  limitBytes: config.flight_category.daily_byte_limit,
})

export async function process() {
  if (!budget.canSpend()) {
    console.warn('flight-cat: 일일 용량 한도 도달 — 이번 사이클 건너뜀')
    return { type: 'flight_category_overlay', saved: false, reason: 'daily budget exhausted' }
  }

  let visGrid
  try {
    visGrid = await fetchSfcVis()
  } catch (e) {
    console.warn('flight-cat: sfc_vis failed:', e.message)
    return { type: 'flight_category_overlay', saved: false, reason: 'sfc_vis unavailable' }
  }

  const root = config.storage.base_path
  const ctpsMask = loadCtpsMask(root)
  const kimCeiling = loadKimCeiling(root)

  let missing = 0
  for (let i = 0; i < visGrid.length; i++) {
    if (classifyVisibility(visGrid[i]) === 'missing') missing++
  }

  const now = new Date().toISOString()
  const result = {
    type: 'flight_category_overlay',
    fetched_at: now,
    computed_at: now,
    visibility: { geojson: buildVisibilityGeoJson(visGrid) },
    ceiling: { geojson: buildCeilingGeoJson(kimCeiling, ctpsMask) },
    query_grid: buildQueryGrid(visGrid),
    sources: {
      kim: kimCeiling ? { run: kimCeiling.run, hf: 0 } : null,
      ctps: ctpsMask ? { frame_tm: ctpsMask.frameTm } : null,
      missing_ratio: missing / visGrid.length,
    },
  }

  const saved = store.save('flight_category_overlay', result)
  return {
    type: 'flight_category_overlay',
    saved: saved.saved,
    vis_features: result.visibility.geojson.features.length,
    ceiling_features: result.ceiling.geojson.features.length,
  }
}
```

`fetchSfcVis`에 바이트 계상 한 줄을 넣는다(`const text = await res.text()` 바로 다음):

```js
    budget.add(Buffer.byteLength(text))
```

`buildQueryGrids`(163–183행)는 운고 항목을 빼고 시정만 남기도록 이름과 본문을 줄인다:

```js
const QUERY_GRID_SIZE = 128

function buildQueryGrid(visGrid) {
  const vis = new Array(QUERY_GRID_SIZE * QUERY_GRID_SIZE)
  for (let qr = 0; qr < QUERY_GRID_SIZE; qr++) {
    for (let qc = 0; qc < QUERY_GRID_SIZE; qc++) {
      const sr = Math.round((qr * (SFC_H - 1)) / (QUERY_GRID_SIZE - 1))
      const sc = Math.round((qc * (SFC_W - 1)) / (QUERY_GRID_SIZE - 1))
      vis[qr * QUERY_GRID_SIZE + qc] = visGrid[sr * SFC_W + sc]
    }
  }
  return { width: QUERY_GRID_SIZE, height: QUERY_GRID_SIZE, vis }
}
```

필요한 import를 추가한다:

```js
import { createDailyByteBudget } from '../lib/daily-byte-budget.js'
import { loadKimCeiling, buildCeilingGeoJson } from './flight-category/ceiling-kim.js'
```

- [ ] **Step 6: 설정 갱신**

`backend/src/config.js`의 `flight_category` 객체에서 `idw_grid_size`를 지우고 `daily_byte_limit`을 넣는다:

```js
export const flight_category = {
  sfc_vis_url: process.env.SFC_VIS_URL ||
    'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api',
  ctps_url: process.env.CTPS_URL ||
    'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/CTPS/KO/data',
  timeout_ms: 30000,
  simplify_tolerance: 0.01,
  // 정상 사용량 1.92GB/일(20분 주기) 대비 여유를 둔 backstop.
  daily_byte_limit: Number(process.env.FLIGHT_CATEGORY_DAILY_BYTES || 3_000_000_000),
  collect_on_startup: process.env.FLIGHT_CATEGORY_ON_STARTUP !== '0',
}
```

`ctps_url`은 위성 프로세서가 계속 쓰므로 **남긴다.**

`schedule`에서 주기를 바꾼다:

```js
  flight_category_interval: '*/20 * * * *',
```

- [ ] **Step 7: 수집 재활성화**

`backend/src/index.js` 151–153행의 주석 세 줄을 다음 한 줄로 바꾼다:

```js
  if (config.flight_category?.collect_on_startup !== false) jobs.push(["flight_category", flightCategoryProcessor.process])
```

202–203행의 주석 두 줄을 다음 한 줄로 바꾼다:

```js
  cron.schedule(config.schedule.flight_category_interval, () => runWithLock('flight_category', flightCategoryProcessor.process))
```

- [ ] **Step 8: 실제 수집 1회 확인**

Run: `cd backend && node -e "import('./src/processors/flight-category-processor.js').then(m => m.default.process()).then(r => console.log(r))"`
Expected: `{ type: 'flight_category_overlay', saved: true, vis_features: <숫자>, ceiling_features: <숫자> }`

**주의**: 실제 API를 26.7 MB 호출한다. 한 번만 돌린다.

- [ ] **Step 9: 산출물 점검**

Run: `cd backend && node -e "const j=JSON.parse(require('fs').readFileSync('data/flight_category_overlay/latest.json','utf8'));console.log(j.sources);console.log('vis bands:', j.visibility.geojson.features.map(f=>f.properties.band));console.log('ceil bands:', j.ceiling.geojson.features.map(f=>f.properties.band))"`
Expected: `missing_ratio`가 0.8 근처, vis bands에 `clear` 없음, `sources.kim`에 run 값

- [ ] **Step 10: 전체 회귀와 커밋**

Run: `cd backend && node --test`

```bash
git add backend/src/lib/daily-byte-budget.js backend/src/lib/daily-byte-budget.test.js backend/src/processors/flight-category-processor.js backend/src/config.js backend/src/index.js
git commit -m "feat(flight-category): re-enable collection at 20-minute cadence with byte guard"
```

---

## Task 6: ASOS 운고 수집기

스펙 §5.4. 매시 1회 ASOS 97지점을 받아 운고가 있는 지점만 파일로 남긴다. flight_category는 이 파일을 읽기만 한다.

**Files:**
- Create: `shared/asos-stations.js` (좌표표, 커밋)
- Create: `backend/src/processors/asos-ceiling-processor.js`
- Create: `backend/src/processors/asos-ceiling-processor.test.js`
- Modify: `backend/src/config.js` (`asos_ceiling` 설정, `schedule.asos_ceiling_interval`)
- Modify: `backend/src/index.js` (시작수집 job + cron)

**Interfaces:**
- Produces: `parseAsosCeiling(text) => [{ stn, ceiling_ft }]`, `process() => { type, saved, station_count }`
- 저장: `asos_ceiling` — `{ tm, stations: [{ stn, name, lat, lon, ceiling_ft }] }`

- [ ] **Step 1: 좌표표 생성**

`stn_inf.php?inf=SFC`를 **한 번만** 호출해 `shared/asos-stations.js`를 만든다. 응답은 EUC-KR, 19필드, 첫 3필드가 `STN LON LAT`, 11번째가 `STN_KO`.

```bash
cd backend && node --input-type=module -e "
const c=(await import('./src/config.js')).default
const r=await fetch('https://apihub.kma.go.kr/api/typ01/url/stn_inf.php?inf=SFC&authKey='+c.api.auth_key)
const t=new TextDecoder('euc-kr').decode(Buffer.from(await r.arrayBuffer()))
const rows=t.split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>l.trim().split(/\s+/))
const out=rows.map(f=>({stn:Number(f[0]),lon:Number(f[1]),lat:Number(f[2]),name:f[10]}))
console.log('export const ASOS_STATIONS = '+JSON.stringify(out,null,2))
" > ../shared/asos-stations.js
```

97개인지, 좌표가 위경도 범위 안인지 눈으로 확인한다. 이 호출은 구현 때 1회뿐이며 런타임에는 하지 않는다.

- [ ] **Step 2: 실패하는 테스트 작성**

`backend/src/processors/asos-ceiling-processor.test.js`. 실제 응답에서 잘라온 고정 문자열을 쓴다 — 네트워크를 타지 않는다.

```js
test('CH_MIN -9는 결측이므로 제외한다', () => {
  // 46필드, 28번째가 CH_MIN
  const row = (stn, ch) => Array.from({length: 46}, (_, i) =>
    i === 1 ? stn : i === 27 ? ch : '0').join(' ')
  const text = `#START7777\n${row('108', '-9')}\n${row('112', '10')}\n#7777END`
  const out = parseAsosCeiling(text)
  assert.equal(out.length, 1)
  assert.equal(out[0].stn, 112)
  assert.equal(Math.round(out[0].ceiling_ft), 3281)   // 10 × 100 m × 3.281
})
```

**한국어 지점명 디코딩도 함께 고정한다.** 위 모의 문자열은 전부 ASCII라 EUC-KR 처리를 잘못해도 통과한다. 좌표표(`ASOS_STATIONS`)에서 붙는 이름이 깨지지 않는지 별도로 확인한다 — 실제 바이트로 검증하며, 콘솔 출력 모양으로 판단하지 않는다([encoding-safety](../../policies/encoding-safety.md)).

```js
test('지점명이 깨지지 않는다', () => {
  const seoul = ASOS_STATIONS.find((s) => s.stn === 108)
  assert.equal(seoul.name, '서울')
  assert.equal(Buffer.from(seoul.name, 'utf8').length, 6)   // 한글 2자 = UTF-8 6바이트
})
```

- [ ] **Step 3: 구현**

- 요청 `tm`은 **직전 정시**(KST). cron은 매시 15분에 돌아 여유를 둔다.
- 응답이 0행이면 한 시간 전으로 한 번 물러난다. 그래도 없으면 저장하지 않고 직전 저장본을 남긴다.
- 응답 본문은 `new TextDecoder('euc-kr')`로 디코딩한다 ([encoding-safety](../../policies/encoding-safety.md)).
- `CH_MIN === -9` 제외. `ceiling_ft = CH_MIN * 100 * 3.281`.
- 좌표와 이름은 `ASOS_STATIONS`에서 `stn`으로 붙인다. 표에 없는 `stn`은 버리고 `console.warn`으로 남긴다.

- [ ] **Step 4: 수집 1회 확인**

Run: `cd backend && node -e "import('./src/processors/asos-ceiling-processor.js').then(m=>m.default.process()).then(console.log)"`
Expected: `station_count`가 0 이상. **0이어도 정상이다** — 맑으면 보고 지점이 없다. 실측 2026-08-01 21시는 4곳이었다.

- [ ] **Step 5: 커밋**

```bash
git add shared/asos-stations.js backend/src/processors/asos-ceiling-processor.js backend/src/processors/asos-ceiling-processor.test.js backend/src/config.js backend/src/index.js
git commit -m "feat(asos): collect hourly ASOS ceiling observations"
```

---

## Task 7: 지점 병합과 모델 차이

ASOS와 AMOS를 한 목록으로 묶고, 각 지점에서 운고 면의 값을 읽어 차이를 미리 낸다.

**Files:**
- Create: `backend/src/processors/flight-category/stations.js`
- Create: `backend/src/processors/flight-category/stations.test.js`
- Modify: `backend/src/processors/flight-category-processor.js` (`process`에 `stations` 추가)

**Interfaces:**
- Produces: `buildStations({ asos, amos, kimCeiling, ctpsMask }) => [{ id, name, source, lat, lon, ceiling_ft, model_ceiling_ft, diff_ft }]`

- [ ] **Step 1: 실패하는 테스트 작성**

세 가지를 고정한다.

```js
test('위성이 구름 없다고 한 자리는 모델값이 빈다', () => {
  // 관측은 300 m를 보는데 위성 마스크가 모델 운고를 지운 경우 —
  // 화면은 색이 없는데 실제로는 낮은 구름이 있다. 가장 쓸모 있는 불일치다.
  const s = buildStations({
    asos: { stations: [{ stn: 108, name: '서울', lat: 37.5714, lon: 126.9658, ceiling_ft: 984 }] },
    amos: null,
    kimCeiling: KIM_FIXTURE,
    ctpsMask: { frameTm: 'x', isClearAt: () => true },
  })
  assert.equal(s[0].model_ceiling_ft, null)
  assert.equal(s[0].diff_ft, null)
  assert.equal(s[0].ceiling_ft, 984)
})

test('AMOS의 25000 이상은 구름 없음이므로 제외한다', () => { /* … */ })
test('모델값이 있으면 차이를 낸다', () => { /* diff_ft = 관측 - 모델 */ })
```

- [ ] **Step 2: 마스킹을 먼저 추출한다 (중복 방지)**

지금 위성 마스킹은 `ceiling-kim.js`의 `buildCeilingGeoJson` **안에 박혀 있다**(97–105행). 그대로 두고 `stations.js`에서 같은 판정을 하면 7줄을 복사하게 되고, 나중에 마스킹 규칙이 바뀌면 **면과 지점이 서로 다른 말을 하게 된다.** 그러니 먼저 함수로 뽑는다.

`ceiling-kim.js`에 추가하고 `buildCeilingGeoJson`이 이것을 부르도록 바꾼다. 동작은 그대로여서 기존 5개 테스트가 계속 통과해야 한다.

```js
/** 위성이 "구름 없음"이라 하는 격자의 운저를 지운다. 원본을 건드리지 않는다. */
export function maskCeilingWithCtps(ceilingM, grid, ctpsMask) {
  const masked = Float32Array.from(ceilingM)
  if (!ctpsMask) return masked
  for (let i = 0; i < masked.length; i++) {
    if (masked[i] < 0) continue
    const [lon, lat] = cellToLonLat(grid, i % grid.nx, Math.floor(i / grid.nx))
    if (ctpsMask.isClearAt(lat, lon)) masked[i] = -1
  }
  return masked
}
```

`cellToLonLat`도 함께 export한다 — `stations.js`가 지점 좌표를 격자 칸으로 되돌릴 때 같은 함수를 써야 한다.

- [ ] **Step 3: 구현**

- **`maskCeilingWithCtps`의 결과에서** 지점 좌표의 운고를 읽는다. 화면에 그려진 면과 같은 값이어야 지점과 면이 같은 말을 한다.
- `amos`는 `store.getCached('amos')`를 그대로 넘긴다. 실측 구조(2026-08-01): `airports`에 15개 ICAO 키가 있고 각각 `observation.cloud_min_m`(m 단위)를 갖는다. 운고를 실제로 주는 곳은 그중 7곳이다. 좌표는 `config.airports`에서 ICAO로 찾는다(Task 4에서 지운 `getAmosCeilingPoints`가 쓰던 것과 같은 경로).
- `asos`는 `store.getCached('asos_ceiling')`. 없거나(`null`) 비어 있어도 예외 없이 빈 목록을 반환해야 한다.
- 모델값이 없으면 `model_ceiling_ft`와 `diff_ft`를 `null`로 둔다. 0으로 채우지 않는다.
- `source`는 `'ASOS'` 또는 `'AMOS'`. 같은 위치에 둘 다 있으면 AMOS(공항)를 남긴다.
- ASOS 저장본이 **2시간 넘게 오래됐으면 쓰지 않는다.** 수집기가 죽었을 때 어제 값이 계속 떠 있는 것이 가장 위험하다.

- [ ] **Step 4: `process()`에 연결 — 수집이 살아 있으므로 절대 던지면 안 된다**

Task 5에서 수집을 `*/20` cron으로 되살렸다. Task 1–5 때와 달리 `process()`가 실제로 20분마다 돈다. 여기서 예외가 나면 오버레이 갱신이 그 자리에서 멈춘다. 그런데 `process()`에는 테스트가 없으므로 `node --test`는 이것을 잡지 못한다.

`flight-category-processor.js`의 `process()` 안, `result` 조립 직전에 넣는다:

```js
  const asos = store.getCached('asos_ceiling')
  let stations = []
  try {
    stations = buildStations({ asos, amos: store.getCached('amos'), kimCeiling, ctpsMask })
  } catch (e) {
    // 지점은 부가 정보다. 여기서 죽으면 시정·운고 면까지 같이 사라진다.
    console.warn('flight-cat: 지점 조립 실패 —', e.message)
  }
```

`result`에 `stations`와 `sources.stations = { asos: n, amos: n, tm }`를 더한다.

- [ ] **Step 5: 회귀와 실제 1회 확인**

Run: `cd backend && node --test`
Run: `cd backend && node -e "import('./src/processors/flight-category-processor.js').then(m=>m.default.process()).then(console.log)"`

`process()`는 테스트가 없다 — 손으로 한 번 돌려 예외가 없는지 본다. Task 2에서 `process()`가 깨진 채 전체 테스트가 통과했던 전례가 있다.

- [ ] **Step 6: 커밋**

```bash
git commit -m "feat(flight-category): add observation stations with model difference"
```

---

## Task 8: 시정 추세, 조회 격자 운고, 보관 정책

**Files:**
- Modify: `backend/src/processors/flight-category-processor.js` (`buildQueryGrid`, `process`)
- Modify: `backend/src/config.js` (`storage.max_files_by_type`)
- Test: `backend/src/processors/flight-category-processor.test.js`

**Interfaces:**
- Produces: `buildQueryGrid(visGrid, ceilGrid) => { width, height, vis, ceil_ft }`, `buildTrend(current, past) => { hours: 3, vis_delta } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
test('결측은 추세를 만들지 않는다', () => {
  // 결측을 0으로 채우면 화면에 "변화 없음"으로 보인다.
  // Task 2에서 없앤 것과 같은 종류의 거짓 안심이다.
  const t = buildTrend({ vis: [5000, -1, 4000] }, { vis: [7000, 6000, -1] })
  assert.equal(t.vis_delta[0], -2000)
  assert.equal(t.vis_delta[1], null)   // 지금이 결측
  assert.equal(t.vis_delta[2], null)   // 3시간 전이 결측
})

test('3시간 전 산출물이 없으면 추세는 null', () => {
  assert.equal(buildTrend({ vis: [5000] }, null), null)
})
```

- [ ] **Step 2: 구현**

- `buildQueryGrid`에 운고를 더한다. **`maskCeilingWithCtps`의 결과에서** 뽑아 피트로. 결측은 음수로 둔다(별도 플래그 없음 — 스펙 §8).
- 서버 시작 후 3시간 동안 `trend`가 `null`인 것은 정상이다.

**과거 산출물 읽기 — 쓸 수 있는 함수가 없다.** `readRecent(type, limit)`은 `backend/server.js:308`의 **비공개 함수**라 프로세서에서 import할 수 없다. `store.js`에는 `loadLatest`만 있고 과거 목록을 주는 export가 없다. 그러니 `store.js`에 하나 추가한다:

```js
/** 해당 타입의 저장 파일을 최신순으로 읽는다. latest.json은 중복이므로 제외한다. */
export function loadRecent(type, limit = 12) {
  const dir = getTypeDir(config.storage.base_path, type)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir)
    .filter((n) => n.endsWith('.json') && n !== 'latest.json')
    .sort().reverse().slice(0, limit)
    .map((n) => readJsonSafe(path.join(dir, n)))
    .filter(Boolean)
}
```

`buildTrend`는 이 목록에서 `computed_at`이 **3시간 전에 가장 가까운 하나**를 고른다. 차이가 20분을 넘으면 쓰지 않고 `null`을 반환한다. 후보가 여럿이면 가장 가까운 것 하나만 쓴다.

`buildTrend(current, past)`는 **이미 읽어놓은 두 객체를 받는다** — 파일을 직접 열지 않는다. 그래야 테스트가 디스크 없이 돌고, 파일 고르는 규칙과 뺄셈 규칙을 따로 검증할 수 있다. 파일 고르기는 `pickTrendBaseline(recent, now)`로 분리해 따로 테스트한다.

- [ ] **Step 3: 보관 개수 늘리기**

`backend/src/config.js`의 `storage.max_files_by_type`에 추가한다. 지금 10개면 200분치라 3시간 추세가 경계에 걸린다.

```js
  max_files_by_type: {
    lightning: 48,
    sigwx_low: 12,
    flight_category_overlay: 12,   // 20분 주기 × 12 = 4시간. 3시간 추세 + 여유.
  },
```

- [ ] **Step 4: 회귀와 커밋**

```bash
git commit -m "feat(flight-category): add 3-hour visibility trend and ceiling query grid"
```

---

## Task 9: API 창구 수리

`backend/server.js`의 두 엔드포인트가 Task 5 이후 깨져 있다. 여기서 고친다.

**Files:**
- Modify: `backend/server.js` (`:835-873`, `:875-883`)
- Modify: `backend/src/processors/flight-category-processor.js` (조회 함수 추가)
- Test: `backend/src/processors/flight-category-processor.test.js`

**Interfaces:**
- Produces: `sampleQueryGrid(queryGrid, lat, lon) => { vis_m, ceil_ft } | null`

- [ ] **Step 1: 실패하는 테스트 작성**

**시험 지점을 서울로 잡으면 안 된다.** 계산해 보면 서울에서는 LCC와 선형 가정이 5.0 km밖에 안 벌어지고, 8 km짜리 조회 격자에서는 **같은 칸을 짚는다.** 잘못된 구현이 그대로 통과한다. 어긋남이 조회 격자 한 칸을 확실히 넘는 지점을 쓴다.

실측 어긋남 (2026-08-01 계산):

| 지점 | 위경도 | 선형과의 차이 | 조회 칸 차 |
|---|---|---|---|
| 서울 | 37.5714, 126.9658 | 5.0 km | 1칸 — **부적합** |
| 속초 | 38.25, 128.56 | 6.6 km | 1칸 — 부적합 |
| **부산** | **35.10, 129.03** | **21.1 km** | **2.2칸** |
| 울릉도 | 37.48, 130.90 | 19.6 km | 2.2칸 |
| 제주 | 33.51, 126.53 | 14.0 km | 2.2칸 |

```js
// 부산 — LCC와 선형 가정이 21 km(조회 격자 2칸 이상) 벌어지는 지점.
// 서울은 5 km라 같은 칸을 짚어 잘못된 구현도 통과한다.
const BUSAN = { lat: 35.10, lon: 129.03 }

test('점 조회는 LCC 변환을 쓴다 — 선형 가정이면 다른 칸을 짚는다', () => {
  // 128×128 격자에 부산 칸만 표식을 넣고 나머지는 0으로 둔다.
  const grid = { width: 128, height: 128, vis: new Array(128 * 128).fill(0), ceil_ft: new Array(128 * 128).fill(-1) }
  const { qc, qr } = queryCellFor(BUSAN.lat, BUSAN.lon)   // LCC 기준 칸
  grid.vis[qr * 128 + qc] = 4242
  assert.equal(sampleQueryGrid(grid, BUSAN.lat, BUSAN.lon).vis_m, 4242)
})

test('격자 밖은 null', () => {
  assert.equal(sampleQueryGrid(GRID_FIXTURE, 10, 100), null)
})
```

`queryCellFor`는 `sampleQueryGrid`가 내부에서 쓰는 것과 같은 변환이어야 한다. 테스트가 자기 자신을 증명하는 것을 막으려면, **표식 칸을 상수로 박아 넣는다** — 부산의 LCC 기준 칸을 미리 계산해 숫자로 적고, 구현이 그 칸을 짚는지 본다. 계산은 아래로 뽑는다:

```bash
cd backend && node --input-type=module -e "
const {latLonToEN84}=await import('./src/lib/lcc-projection.js')
const {SFC_W,SFC_H}=await import('./src/parsers/sfc-grid-parser.js')
const [e,n]=latLonToEN84(35.10,129.03)
const col=e/500+880, row=SFC_H-1-(n/500+1540)
console.log('qc=',Math.round(col*127/(SFC_W-1)),'qr=',Math.round(row*127/(SFC_H-1)))
"
```

- [ ] **Step 2: 조회 함수를 격자 쪽으로 옮긴다**

`sampleQueryGrid`를 `flight-category-processor.js`에 둔다. `latLonToEN84` → 2049 격자 픽셀 → 조회 격자 칸 순으로 간다. **`server.js`에 좌표 산술을 남기지 않는다** — 격자를 만드는 쪽과 읽는 쪽이 각자 규칙을 갖고 있었던 것이 이번 오류의 원인이다.

- [ ] **Step 3: 오버레이 엔드포인트 수정**

`data.geojson` → 새 구조 전체(`visibility` / `ceiling` / `stations` / `trend` / `sources`). ETag는 `content_hash` 유지. 산출물이 없으면 **빈 FeatureCollection 200이 아니라 503**을 준다 — 조용한 빈 응답이 이번 문제를 늦게 발견하게 만든 원인이다.

- [ ] **Step 4: 점 조회 엔드포인트 재작성**

- `sampleQueryGrid`를 쓴다.
- **`ranks`/`vcat`/`ccat`의 VFR·IFR·LIFR 판정을 삭제한다.** Task 2에서 면에서만 지웠고 여기 남아 있다.
- 응답: 시정 값과 밴드(`classifyVisibility`), 운고 값과 밴드, 3시간 추세, 가장 가까운 관측 지점(`stations`에서 최근접 + 거리 km).
- 결측은 `null`로 내보낸다. 절대 양호로 바꾸지 않는다.

- [ ] **Step 5: 실제 응답으로 검증**

서버를 띄우고 두 창구를 직접 부른다. 임베디드 프리뷰가 아니라 실제 응답이 증거다.

```bash
curl -s localhost:<port>/api/weather/flight-category-overlay | head -c 400
curl -s "localhost:<port>/api/weather/flight-category-overlay/point?lat=37.5714&lon=126.9658"
```

Expected: 오버레이에 `visibility`·`ceiling` 키가 있고, 점 조회가 서울 근방의 그럴듯한 시정을 준다. 선형 가정이 남아 있으면 엉뚱한 지역 값이 나온다.

- [ ] **Step 6: 회귀와 커밋**

```bash
cd backend && node --test
git commit -m "fix(api): repair flight-category endpoints after payload redesign"
```

---

## 후속 (이번 범위 밖)

- **프론트 표출** — 시정/운고 레이어 분리, 범례, 점 조회. Task 9까지 끝난 뒤 별도 계획으로. 스펙 §5.5에 따라 결측 층은 **기본 꺼둠 + 토글**이어야 한다(격자의 81.8%라 켜두면 지도가 회색이 된다).
- **더 조밀한 ASOS 운고** — `kma_sfctm3`·`kma_sfctm5`·`nph-aws_min`이 403(활용신청 필요). 열려도 실익이 낮다(스펙 §5.4). 수집 주기는 설정값이므로 열리면 값만 바꾼다.
- **`disp` 이진 형식 / 영역 지정 확인** — 성공하면 주기를 10분으로.
- **`cld` 임계값 0.6 재확인** — 흐린 날 KIM run 표본으로.
- **CTPS 격자 투영 확인** — `ctps-grid.js`의 구면 근사가 약 1픽셀 오차를 낳는지.
