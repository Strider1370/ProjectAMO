# Flight Category Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한반도 전역의 VFR/IFR/LIFR 비행기상 구역을 맵에 면 단위 폴리곤으로 오버레이한다.

**Architecture:** 백엔드 파이프라인이 1시간마다 실행된다: sfc_obs_nc_api(시정 격자 2049×2049 ASCII) + CTPS(운정고도 HDF5) + AMOS 캐시(운고 지점) → IDW 보간(512×512) → CTH 마스킹 → 픽셀별 분류 → d3-contour 폴리곤 → GeoJSON 캐시. 프론트는 `/api/weather/flight-category-overlay`를 60초마다 폴링(ETag 조건부 요청)하여 Mapbox fill 레이어로 렌더링.

**Tech Stack:** Node.js ESM, d3-contour, @turf/simplify, h5wasm(기설치), Mapbox GL JS, React

---

## 사전 확인 사항 (모두 완료)

| 항목 | 결과 |
|---|---|
| ASOS CH_MIN 필드 | ✅ 28번 컬럼, 단위 100m |
| CTPS 엔드포인트 | ✅ LE2/CTPS/KO — CTH 변수(900×900, uint16, scale=0.01, fill=65535, km) |
| h5wasm 파싱 환경 | ✅ 이미 설치, satellite-parser.js 패턴 재사용 |
| d3-contour | ✅ v4.0.2 사용 가능 |
| IDW 성능 | ✅ 512×512 × 111pts = 36ms, Worker 불필요 |

---

## 파일 맵

**신규 생성:**
- `backend/src/lib/lcc-projection.js` — LCC 투영 수식 공유 라이브러리
- `backend/src/parsers/sfc-grid-parser.js` — ASCII 격자 파싱 + 좌표 매핑
- `backend/src/lib/idw.js` — IDW 보간
- `backend/src/processors/flight-category-processor.js` — 전체 파이프라인
- `frontend/src/features/map/layers/FlightCategoryLayer.jsx` — Mapbox fill 레이어

**수정:**
- `backend/src/parsers/satellite-parser.js` — LCC 수식을 공유 라이브러리로 교체
- `backend/src/config.js` — sfc_vis_url, ctps_url, flight_category 설정 추가
- `backend/src/store.js` — TYPES/FILE_PREFIX/cache에 flight_category_overlay 추가
- `backend/server.js` — `/api/weather/flight-category-overlay` 라우트 추가
- `backend/src/index.js` — flight_category 크론/락/초기수집 추가
- `backend/package.json` — d3-contour, @turf/simplify 설치
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — MET_LAYERS에 flightCategory 추가
- `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` — 기상 그룹에 토글 추가
- `frontend/src/features/map/MapView.jsx` — FlightCategoryLayer 마운트

---

## Task 1: 의존성 설치 + 설정 추가

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/config.js`

- [ ] **Step 1: npm install**

```bash
cd backend
npm install d3-contour @turf/simplify
```

Expected: `added N packages` (에러 없음)

- [ ] **Step 2: config.js에 flight_category 블록 추가**

`backend/src/config.js`의 `satellite` 블록(line ~139) 바로 뒤에 삽입:

```js
export const flight_category = {
  sfc_vis_url: process.env.SFC_VIS_URL ||
    'https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api',
  ctps_url: process.env.CTPS_URL ||
    'https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/CTPS/KO/data',
  timeout_ms: 30000,
  idw_grid_size: 512,
  simplify_tolerance: 0.01,
  collect_on_startup: process.env.FLIGHT_CATEGORY_ON_STARTUP !== '0',
}
```

`schedule` 블록(line ~190)에 추가:

```js
  flight_category_interval: '5 * * * *',
```

파일 맨 아래 `export default` 객체에 `flight_category` 추가.

- [ ] **Step 3: 검증**

```bash
cd backend
node -e "import('./src/config.js').then(m => console.log(m.flight_category))"
```

Expected:
```
{ sfc_vis_url: 'https://...', ctps_url: 'https://...', timeout_ms: 30000, idw_grid_size: 512, simplify_tolerance: 0.01, collect_on_startup: true }
```

- [ ] **Step 4: 커밋**

```bash
git add backend/package.json backend/package-lock.json backend/src/config.js
git commit -m "feat(flight-category): add deps and config"
```

---

## Task 2: LCC 공유 라이브러리 추출

**Files:**
- Create: `backend/src/lib/lcc-projection.js`
- Modify: `backend/src/parsers/satellite-parser.js`

`satellite-parser.js` 상단의 LCC 수식이 `flight-category-processor.js`에서도 필요하다. 중복 없이 공유한다.

- [ ] **Step 1: `backend/src/lib/lcc-projection.js` 생성**

```js
const DEG2RAD = Math.PI / 180
const PHI1 = 30.0 * DEG2RAD
const PHI2 = 60.0 * DEG2RAD
const PHI0 = 38.0 * DEG2RAD
const LAM0 = 126.0 * DEG2RAD
const R = 6371009

const _n = Math.log(Math.cos(PHI1) / Math.cos(PHI2)) /
  Math.log(Math.tan(Math.PI / 4 + PHI2 / 2) / Math.tan(Math.PI / 4 + PHI1 / 2))
const _F = Math.cos(PHI1) * Math.pow(Math.tan(Math.PI / 4 + PHI1 / 2), _n) / _n
const _rho0 = R * _F / Math.pow(Math.tan(Math.PI / 4 + PHI0 / 2), _n)

export function latLonToEN(latDeg, lonDeg) {
  const lat = latDeg * DEG2RAD
  const lon = lonDeg * DEG2RAD
  const rho = R * _F / Math.pow(Math.tan(Math.PI / 4 + lat / 2), _n)
  const theta = _n * (lon - LAM0)
  return [rho * Math.sin(theta), _rho0 - rho * Math.cos(theta)]
}
```

- [ ] **Step 2: `satellite-parser.js` 상단 수식 제거 후 import 교체**

`satellite-parser.js` line 4~36에 있는 `DEG2RAD`, `PHI1`, `PHI2`, `PHI0`, `LAM0`, `R`, `_n`, `_F`, `_rho0`, `latLonToEN` 정의를 모두 삭제하고 line 1에 추가:

```js
import { latLonToEN } from '../lib/lcc-projection.js'
```

- [ ] **Step 3: 위성 파서 로드 확인**

```bash
cd backend
node -e "import('./src/parsers/satellite-parser.js').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 4: 커밋**

```bash
git add backend/src/lib/lcc-projection.js backend/src/parsers/satellite-parser.js
git commit -m "refactor(satellite): extract LCC projection to shared lib"
```

---

## Task 3: sfc-grid-parser.js

**Files:**
- Create: `backend/src/parsers/sfc-grid-parser.js`
- Create: `backend/src/parsers/sfc-grid-parser.test.js`

nph-sfc_obs_nc_api ASCII 응답 파싱. 헤더 제거 후 Float32Array(미터) 반환. 좌표 매핑은 스펙 기재 경계값의 선형 보간(row 0 = 북단).

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/parsers/sfc-grid-parser.test.js`:

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from './sfc-grid-parser.js'

describe('parseSfcAscii', () => {
  it('returns Float32Array of SFC_W * SFC_H', () => {
    const total = SFC_W * SFC_H
    const vals = Array.from({ length: total }, (_, i) => i % 5 === 0 ? -999.0 : 50000.0)
    const text = `  ${SFC_W},  ${SFC_H},=\n${vals.join(',')}\n`
    const result = parseSfcAscii(text)
    assert.ok(result instanceof Float32Array)
    assert.equal(result.length, total)
  })

  it('converts raw 10m units to metres (÷10)', () => {
    const total = SFC_W * SFC_H
    const text = `  ${SFC_W},  ${SFC_H},=\n${Array(total).fill('50000.0').join(',')}\n`
    const result = parseSfcAscii(text)
    assert.ok(Math.abs(result[0] - 5000) < 0.1)
  })

  it('maps fill value (-999) to -1', () => {
    const total = SFC_W * SFC_H
    const text = `  ${SFC_W},  ${SFC_H},=\n${Array(total).fill('-999.0').join(',')}\n`
    const result = parseSfcAscii(text)
    assert.ok(result.every(v => v === -1))
  })
})

describe('sfcPixelToLatLon', () => {
  it('row 0, col 0 → northwest corner', () => {
    const { lat, lon } = sfcPixelToLatLon(0, 0)
    assert.ok(Math.abs(lat - 40.35) < 0.1, `lat=${lat}`)
    assert.ok(Math.abs(lon - 120.67) < 0.1, `lon=${lon}`)
  })

  it('bottom-right pixel → southeast corner', () => {
    const { lat, lon } = sfcPixelToLatLon(SFC_W - 1, SFC_H - 1)
    assert.ok(Math.abs(lat - 30.74) < 0.1, `lat=${lat}`)
    assert.ok(Math.abs(lon - 133.07) < 0.1, `lon=${lon}`)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
cd backend
node --test src/parsers/sfc-grid-parser.test.js 2>&1 | head -5
```

Expected: `Cannot find module './sfc-grid-parser.js'`

- [ ] **Step 3: 구현**

`backend/src/parsers/sfc-grid-parser.js`:

```js
export const SFC_W = 2049
export const SFC_H = 2049

const LAT_MAX = 40.35
const LAT_MIN = 30.74
const LON_MIN = 120.67
const LON_MAX = 133.07

/**
 * Parse nph-sfc_obs_nc_api ASCII response (obs=vs, disp=A).
 * Returns Float32Array(SFC_W * SFC_H), values in metres.
 * Fill (-999) → -1. Raw unit is 10m → ÷10.
 */
export function parseSfcAscii(text) {
  const eqIdx = text.indexOf('=')
  const dataStart = eqIdx >= 0 ? eqIdx + 1 : 0
  const result = new Float32Array(SFC_W * SFC_H)
  let idx = 0
  let numStart = -1

  for (let i = dataStart; i <= text.length && idx < result.length; i++) {
    const ch = text[i]
    const isDigit = ch >= '0' && ch <= '9'
    const isDot = ch === '.'
    const isMinus = ch === '-'
    const isNumChar = isDigit || isDot || isMinus

    if (isNumChar && numStart === -1) {
      numStart = i
    } else if (!isNumChar && numStart !== -1) {
      const v = parseFloat(text.slice(numStart, i))
      result[idx++] = v <= -999 ? -1 : v / 10
      numStart = -1
    }
  }
  if (numStart !== -1 && idx < result.length) {
    const v = parseFloat(text.slice(numStart))
    result[idx] = v <= -999 ? -1 : v / 10
  }

  return result
}

/**
 * Map sfc grid pixel (col, row) to {lat, lon}.
 * Row 0 = LAT_MAX (북단), Row H-1 = LAT_MIN (남단).
 * Col 0 = LON_MIN (서단), Col W-1 = LON_MAX (동단).
 */
export function sfcPixelToLatLon(col, row) {
  return {
    lat: LAT_MAX - (row / (SFC_H - 1)) * (LAT_MAX - LAT_MIN),
    lon: LON_MIN + (col / (SFC_W - 1)) * (LON_MAX - LON_MIN),
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend
node --test src/parsers/sfc-grid-parser.test.js
```

Expected: `✔ ...` (모두 pass)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/parsers/sfc-grid-parser.js backend/src/parsers/sfc-grid-parser.test.js
git commit -m "feat(flight-category): add sfc-grid-parser"
```

---

## Task 4: IDW 라이브러리

**Files:**
- Create: `backend/src/lib/idw.js`
- Create: `backend/src/lib/idw.test.js`

power=2 IDW 보간. 좌표는 [0,1] 정규화. 출력은 gridSize×gridSize Float32Array.

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/lib/idw.test.js`:

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { idwInterpolate } from './idw.js'

describe('idwInterpolate', () => {
  it('returns Float32Array of gridSize^2', () => {
    const result = idwInterpolate([{ x: 0.5, y: 0.5, value: 1000 }], 4)
    assert.ok(result instanceof Float32Array)
    assert.equal(result.length, 16)
  })

  it('returns source value at exact point location', () => {
    const result = idwInterpolate([{ x: 0, y: 0, value: 3000 }], 4)
    assert.ok(Math.abs(result[0] - 3000) < 1)
  })

  it('midpoint between two equal-distance points averages their values', () => {
    const pts = [{ x: 0, y: 0.5, value: 0 }, { x: 1, y: 0.5, value: 1000 }]
    const result = idwInterpolate(pts, 3)
    const mid = result[1 * 3 + 1]
    assert.ok(Math.abs(mid - 500) < 1, `mid=${mid}`)
  })

  it('fills constant value when all points have same value', () => {
    const pts = [
      { x: 0.2, y: 0.2, value: 2000 },
      { x: 0.8, y: 0.8, value: 2000 },
    ]
    const result = idwInterpolate(pts, 4)
    assert.ok(result.every(v => Math.abs(v - 2000) < 1))
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
cd backend
node --test src/lib/idw.test.js 2>&1 | head -5
```

Expected: `Cannot find module './idw.js'`

- [ ] **Step 3: 구현**

`backend/src/lib/idw.js`:

```js
/**
 * Inverse Distance Weighting interpolation (power=2).
 * @param {Array<{x:number, y:number, value:number}>} points  정규화 좌표 [0,1]
 * @param {number} gridSize  출력 격자 한 변의 길이
 * @returns {Float32Array}  row-major, row 0 = top (y=0)
 */
export function idwInterpolate(points, gridSize = 512) {
  const out = new Float32Array(gridSize * gridSize)
  const inv = 1 / (gridSize - 1 || 1)
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const px = c * inv
      const py = r * inv
      let num = 0, den = 0
      for (const p of points) {
        const dx = px - p.x
        const dy = py - p.y
        const d2 = dx * dx + dy * dy
        if (d2 < 1e-10) { num = p.value; den = 1; break }
        const w = 1 / d2
        num += w * p.value
        den += w
      }
      out[r * gridSize + c] = den > 0 ? num / den : 0
    }
  }
  return out
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend
node --test src/lib/idw.test.js
```

Expected: 모두 pass

- [ ] **Step 5: 커밋**

```bash
git add backend/src/lib/idw.js backend/src/lib/idw.test.js
git commit -m "feat(flight-category): add IDW interpolation"
```

---

## Task 5: flight-category-processor.js — 순수 함수

**Files:**
- Create: `backend/src/processors/flight-category-processor.js` (이 태스크에서는 순수 함수만)
- Create: `backend/src/processors/flight-category-processor.test.js`

테스트 가능한 순수 함수 먼저 구현: 분류, CTH 좌표 변환, GeoJSON 생성.

- [ ] **Step 1: 실패 테스트 작성**

`backend/src/processors/flight-category-processor.test.js`:

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyFlightCategory,
  worstCategory,
  CATEGORY_COLORS,
  cthIndexToPixel,
} from './flight-category-processor.js'

describe('classifyFlightCategory', () => {
  it('VFR: vis>=5000 and ceil>=1500ft', () => {
    assert.equal(classifyFlightCategory(5000, 1500), 'VFR')
    assert.equal(classifyFlightCategory(9999, 9999), 'VFR')
  })

  it('IFR: vis 800-4999', () => {
    assert.equal(classifyFlightCategory(800, 9999), 'IFR')
    assert.equal(classifyFlightCategory(4999, 9999), 'IFR')
  })

  it('IFR: ceil 500-1499ft', () => {
    assert.equal(classifyFlightCategory(9999, 500), 'IFR')
    assert.equal(classifyFlightCategory(9999, 1499), 'IFR')
  })

  it('LIFR: vis<800', () => {
    assert.equal(classifyFlightCategory(799, 9999), 'LIFR')
    assert.equal(classifyFlightCategory(0, 9999), 'LIFR')
  })

  it('LIFR: ceil<500ft', () => {
    assert.equal(classifyFlightCategory(9999, 499), 'LIFR')
  })

  it('worst wins: bad vis + high ceil = LIFR', () => {
    assert.equal(classifyFlightCategory(100, 9999), 'LIFR')
  })

  it('fill vis (-1) treated as clear', () => {
    assert.equal(classifyFlightCategory(-1, 9999), 'VFR')
  })

  it('fill ceil (-1) treated as clear', () => {
    assert.equal(classifyFlightCategory(9999, -1), 'VFR')
  })
})

describe('worstCategory', () => {
  it('LIFR > IFR > VFR', () => {
    assert.equal(worstCategory('VFR', 'IFR'), 'IFR')
    assert.equal(worstCategory('IFR', 'LIFR'), 'LIFR')
    assert.equal(worstCategory('VFR', 'LIFR'), 'LIFR')
    assert.equal(worstCategory('VFR', 'VFR'), 'VFR')
    assert.equal(worstCategory('LIFR', 'IFR'), 'LIFR')
  })
})

describe('CATEGORY_COLORS', () => {
  it('has correct colors', () => {
    assert.equal(CATEGORY_COLORS.VFR, '#15803d')
    assert.equal(CATEGORY_COLORS.IFR, '#f97316')
    assert.equal(CATEGORY_COLORS.LIFR, '#dc2626')
  })
})

describe('cthIndexToPixel', () => {
  it('returns valid index for point inside Korea', () => {
    const idx = cthIndexToPixel(37.5, 127.0)
    assert.ok(idx !== null)
    assert.ok(idx >= 0 && idx < 900 * 900)
  })

  it('returns null for point far outside domain', () => {
    assert.equal(cthIndexToPixel(0, 0), null)
    assert.equal(cthIndexToPixel(60, 90), null)
  })
})
```

- [ ] **Step 2: 실패 확인**

```bash
cd backend
node --test src/processors/flight-category-processor.test.js 2>&1 | head -5
```

Expected: `Cannot find module './flight-category-processor.js'`

- [ ] **Step 3: 순수 함수 구현 (파일 생성, 나중에 process() 추가)**

`backend/src/processors/flight-category-processor.js`:

```js
import config from '../config.js'
import store from '../store.js'
import { idwInterpolate } from '../lib/idw.js'
import { parseSfcAscii, sfcPixelToLatLon, SFC_W, SFC_H } from '../parsers/sfc-grid-parser.js'
import { latLonToEN } from '../lib/lcc-projection.js'
import { contours } from 'd3-contour'
import { simplify } from '@turf/simplify'

// ─── CTH 격자 상수 ────────────────────────────────────────────
const CTH_W = 900, CTH_H = 900
const CTH_PIXEL_SIZE = 2000   // m per pixel
// Upper-left pixel CENTER in LCC easting/northing.
// 900×900 grid at 2000 m/pixel, LCC origin = PHI0=38°N LAM0=126°E.
// Pixel-center convention: UL = -(450 - 0.5) × 2000 = -899,000 m
// Verify against GK2A CTPS product spec if spatial offset is suspected.
const CTH_UL_E = -899000
const CTH_UL_N = 899000
const CTH_FILL = 65535
const CTH_SCALE = 0.01        // raw uint16 → km (used for info only; masking uses fill/0 check)

// ─── 분류 상수 ────────────────────────────────────────────────
export const CATEGORY_COLORS = { VFR: '#15803d', IFR: '#f97316', LIFR: '#dc2626' }
const RANK = { VFR: 0, IFR: 1, LIFR: 2 }
const BY_RANK = ['VFR', 'IFR', 'LIFR']

// ─── 순수 함수 ────────────────────────────────────────────────

export function worstCategory(a, b) {
  return BY_RANK[Math.max(RANK[a], RANK[b])]
}

export function classifyFlightCategory(vis_m, ceil_ft) {
  // Negative = fill / no-data sentinel. Treated as unlimited (VFR) by design:
  //   vis: parser maps fill -999 → -1.
  //   ceil: IDW fallback fills with -1 when zero AMOS points are available.
  //   CTH masking independently overrides ceil to 99999 where sky is confirmed clear.
  const vc = vis_m < 0 ? 'VFR' : vis_m < 800 ? 'LIFR' : vis_m < 5000 ? 'IFR' : 'VFR'
  const cc = ceil_ft < 0 ? 'VFR' : ceil_ft < 500 ? 'LIFR' : ceil_ft < 1500 ? 'IFR' : 'VFR'
  return worstCategory(vc, cc)
}

/**
 * 위경도 → CTH 격자 선형 인덱스. 도메인 외 → null.
 */
export function cthIndexToPixel(lat, lon) {
  const [e, n] = latLonToEN(lat, lon)
  const col = Math.round((e - CTH_UL_E) / CTH_PIXEL_SIZE)
  const row = Math.round((CTH_UL_N - n) / CTH_PIXEL_SIZE)
  if (col < 0 || col >= CTH_W || row < 0 || row >= CTH_H) return null
  return row * CTH_W + col
}

// ─── h5wasm lazy singleton ────────────────────────────────────
// Initialise once at first use. h5wasm.ready is a Promise that resolves after
// the WASM binary is compiled; calling it on every CTPS fetch adds ~100 ms/call.
// Note: h5wasm WASM I/O is synchronous within the runtime, so AbortSignal from
// withTimeout cannot interrupt an in-progress file parse — only the outer fetch
// is cancellable. Keep this in mind if CTPS parse hangs.

let _h5wasm = null

async function getH5wasm() {
  if (!_h5wasm) {
    _h5wasm = await import('h5wasm')
    await _h5wasm.ready
  }
  return _h5wasm
}

// ─── 파이프라인 내부 함수 ─────────────────────────────────────

function formatKstTm(offsetMs = 0) {
  const kst = new Date(Date.now() - offsetMs + 9 * 3600 * 1000)
  kst.setUTCMinutes(Math.floor(kst.getUTCMinutes() / 10) * 10, 0, 0)
  return kst.getUTCFullYear().toString()
    + String(kst.getUTCMonth() + 1).padStart(2, '0')
    + String(kst.getUTCDate()).padStart(2, '0')
    + String(kst.getUTCHours()).padStart(2, '0')
    + String(kst.getUTCMinutes()).padStart(2, '0')
}

function formatUtcTm(offsetMs = 0) {
  const d = new Date(Date.now() - offsetMs)
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 10) * 10, 0, 0)
  return d.getUTCFullYear().toString()
    + String(d.getUTCMonth() + 1).padStart(2, '0')
    + String(d.getUTCDate()).padStart(2, '0')
    + String(d.getUTCHours()).padStart(2, '0')
    + String(d.getUTCMinutes()).padStart(2, '0')
}

async function withTimeout(fn, ms = config.flight_category.timeout_ms) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try { return await fn(controller.signal) } finally { clearTimeout(timer) }
}

async function fetchSfcVis() {
  const tm = formatKstTm(10 * 60 * 1000)
  const url = `${config.flight_category.sfc_vis_url}?obs=vs&tm=${tm}&disp=A&authKey=${config.api.auth_key}`
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`sfc_vis HTTP ${res.status}`)
    const text = await res.text()
    if (text.includes('data_read: error')) throw new Error('sfc_vis: data_read error')
    return parseSfcAscii(text)
  })
}

async function fetchCtps() {
  const tm = formatUtcTm(20 * 60 * 1000)
  const url = `${config.flight_category.ctps_url}?date=${tm}&authKey=${config.api.auth_key}`
  return withTimeout(async (signal) => {
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`CTPS HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    return parseCthBuffer(buf)
  })
}

async function parseCthBuffer(buf) {
  const h5 = await getH5wasm()
  const fname = `cth_${Date.now()}.nc`
  h5.FS.writeFile(fname, new Uint8Array(buf))
  const f = new h5.File(fname, 'r')
  const raw = f.get('CTH').value  // Uint16Array 900×900
  f.close()
  try { h5.FS.unlink(fname) } catch {}
  return raw
}

function getAmosCeilingPoints() {
  const amos = store.getCached('amos')
  if (!amos?.airports) return []
  const points = []
  for (const [icao, data] of Object.entries(amos.airports)) {
    const ceilM = data?.observation?.cloud_min_m
    if (ceilM == null) continue
    const airport = config.airports.find(a => a.icao === icao)
    if (!airport?.lat || !airport?.lon) continue
    points.push({
      x: (airport.lon - 120.67) / (133.07 - 120.67),
      y: (40.35 - airport.lat) / (40.35 - 30.74),
      value: ceilM * 3.281,  // m → ft
    })
  }
  return points
}

function bilinearUpscale(src, srcSize, dstW, dstH) {
  const dst = new Float32Array(dstW * dstH)
  const sx = srcSize / dstW, sy = srcSize / dstH
  for (let r = 0; r < dstH; r++) {
    for (let c = 0; c < dstW; c++) {
      const fx = c * sx, fy = r * sy
      const x0 = Math.floor(fx), y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, srcSize - 1), y1 = Math.min(y0 + 1, srcSize - 1)
      const dx = fx - x0, dy = fy - y0
      dst[r * dstW + c] =
        src[y0 * srcSize + x0] * (1 - dx) * (1 - dy) +
        src[y0 * srcSize + x1] * dx * (1 - dy) +
        src[y1 * srcSize + x0] * (1 - dx) * dy +
        src[y1 * srcSize + x1] * dx * dy
    }
  }
  return dst
}

// ─── CTH lookup table ─────────────────────────────────────────
// Maps each SFC pixel index → CTH flat index (-1 = outside CTH domain).
// Built once on first use: 4.2 M LCC projections up-front so buildCategoryGrid
// only does a single Int32Array read per pixel instead of a trig projection.

let _cthLookup = null

function getCthLookup() {
  if (_cthLookup) return _cthLookup
  _cthLookup = new Int32Array(SFC_W * SFC_H)
  for (let i = 0; i < _cthLookup.length; i++) {
    const row = Math.floor(i / SFC_W), col = i % SFC_W
    const { lat, lon } = sfcPixelToLatLon(col, row)
    const idx = cthIndexToPixel(lat, lon)
    _cthLookup[i] = idx !== null ? idx : -1
  }
  return _cthLookup
}

function buildCategoryGrid(visGrid, ceilGrid, cthRaw) {
  const cat = new Uint8Array(SFC_W * SFC_H)
  const lookup = cthRaw ? getCthLookup() : null
  for (let i = 0; i < cat.length; i++) {
    let ceil_ft = ceilGrid[i]
    if (lookup) {
      const cthIdx = lookup[i]
      const cthVal = cthIdx >= 0 ? cthRaw[cthIdx] : CTH_FILL
      if (cthVal === CTH_FILL || cthVal === 0) ceil_ft = 99999  // CLEAR
    }
    cat[i] = RANK[classifyFlightCategory(visGrid[i], ceil_ft)]
  }
  return cat
}

function pixelToLonLat(px, py) {
  const LON_MIN = 120.67, LON_MAX = 133.07
  const LAT_MIN = 30.74, LAT_MAX = 40.35
  return [
    LON_MIN + (px / (SFC_W - 1)) * (LON_MAX - LON_MIN),
    LAT_MAX - (py / (SFC_H - 1)) * (LAT_MAX - LAT_MIN),
  ]
}

function categoryGridToGeoJson(catGrid) {
  // Per-category binary masks — one d3-contour pass per category.
  //
  // Why not thresholds([0.5, 1.5]) on the full grid?
  //   d3-contour threshold T produces polygons where value ≥ T.
  //   At T=0.5 that captures RANK≥1 = IFR ∪ LIFR (superset), not IFR alone.
  //   The IFR polygon would incorrectly cover LIFR pixels, causing wrong labels.
  //
  // Instead: build a separate {0,1} mask for each category, then contour at 0.5.
  // Each polygon covers exactly the pixels with that RANK value.

  const gen = contours().size([SFC_W, SFC_H]).thresholds([0.5])
  const categories = [
    { rank: 1, category: 'IFR' },
    { rank: 2, category: 'LIFR' },
  ]
  const features = []

  for (const { rank, category } of categories) {
    const mask = new Uint8Array(catGrid.length)
    for (let i = 0; i < catGrid.length; i++) {
      if (catGrid[i] === rank) mask[i] = 1
    }

    const [contour] = gen(mask)
    if (!contour?.coordinates?.length) continue

    const color = CATEGORY_COLORS[category]
    const transformedCoords = contour.coordinates.map(polygon =>
      polygon.map(ring => ring.map(([px, py]) => pixelToLonLat(px, py)))
    )

    const feature = {
      type: 'Feature',
      properties: { category, color },
      geometry: { type: 'MultiPolygon', coordinates: transformedCoords },
    }

    try {
      const simplified = simplify(feature, {
        tolerance: config.flight_category.simplify_tolerance,
        highQuality: false,
      })
      if (simplified.geometry?.coordinates?.length) features.push(simplified)
    } catch (e) {
      console.warn('flight-cat: simplify failed for', category, e.message)
      features.push(feature)
    }
  }

  return { type: 'FeatureCollection', features }
}

// ─── 공개 프로세서 함수 ───────────────────────────────────────

export async function process() {
  const [visGrid, cthRaw] = await Promise.all([
    fetchSfcVis().catch(e => { console.warn('flight-cat: sfc_vis failed:', e.message); return null }),
    fetchCtps().catch(e => { console.warn('flight-cat: CTPS failed:', e.message); return null }),
  ])

  if (!visGrid) {
    return { type: 'flight_category_overlay', saved: false, reason: 'sfc_vis unavailable' }
  }

  const amosPts = getAmosCeilingPoints()
  const idwGrid = amosPts.length > 0
    ? idwInterpolate(amosPts, config.flight_category.idw_grid_size)
    : new Float32Array(config.flight_category.idw_grid_size ** 2).fill(-1)

  const ceilFull = bilinearUpscale(idwGrid, config.flight_category.idw_grid_size, SFC_W, SFC_H)
  const catGrid = buildCategoryGrid(visGrid, ceilFull, cthRaw)
  const geojson = categoryGridToGeoJson(catGrid)

  const result = {
    type: 'flight_category_overlay',
    fetched_at: new Date().toISOString(),
    computed_at: new Date().toISOString(),
    feature_count: geojson.features.length,
    geojson,
  }

  // store.save() returns { saved: true, filePath } | { saved: false, reason: 'unchanged' }
  const saved = store.save('flight_category_overlay', result)
  return { type: 'flight_category_overlay', saved: saved.saved, feature_count: geojson.features.length }
}

export default { process }
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd backend
node --test src/processors/flight-category-processor.test.js
```

Expected: 모두 pass

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/flight-category-processor.js backend/src/processors/flight-category-processor.test.js
git commit -m "feat(flight-category): add processor"
```

---

## Task 6: 백엔드 배선 (store + server + index)

**Files:**
- Modify: `backend/src/store.js`
- Modify: `backend/server.js`
- Modify: `backend/src/index.js`

- [ ] **Step 1: store.js — TYPES/FILE_PREFIX/cache에 항목 추가**

`backend/src/store.js` line 6의 `TYPES` 배열 끝에 `'flight_category_overlay'` 추가:

```js
const TYPES = ['metar', 'taf', 'warning', 'lightning', 'sigmet', 'airmet', 'sigwx_low', 'amos', 'adsb', 'kim_surface_wind', 'ground_forecast', 'ground_overview', 'environment', 'airport_info', 'flight_category_overlay']
```

`FILE_PREFIX` 객체(line 7–21) 끝, `airport_info` 줄 바로 뒤에 추가:

```js
  flight_category_overlay: 'FLIGHT_CATEGORY',
```

`cache` 객체(line 23–38) 끝, `airport_info` 줄 바로 뒤에 추가:

```js
  flight_category_overlay: { hash: null, prev_data: null },
```

> **확인**: `store.save()` 는 type이 TYPES에 없으면 즉시 throw한다 (line 204). 위 3줄이 모두 추가돼야 정상 작동.

- [ ] **Step 2: store 로드 확인**

```bash
cd backend
node -e "import('./src/store.js').then(() => console.log('OK'))"
```

Expected: `OK`

- [ ] **Step 3: server.js — 라우트 추가**

`backend/server.js`의 라우트 블록(line ~510 근처) 끝에 추가:

```js
app.get('/api/weather/flight-category-overlay', (req, res) => {
  const data = store.getCached('flight_category_overlay')
  if (!data?.geojson) {
    return res.json({ type: 'FeatureCollection', features: [] })
  }
  const etag = `"${data.content_hash || store.canonicalHash(data.geojson)}"`
  res.setHeader('Last-Modified', new Date(data.computed_at).toUTCString())
  res.setHeader('ETag', etag)
  res.setHeader('Cache-Control', 'no-cache')
  if (req.headers['if-none-match'] === etag) return res.status(304).end()
  res.json(data.geojson)
})
```

- [ ] **Step 4: index.js — import + locks + cron + 초기수집 추가**

`backend/src/index.js`:

imports 블록(line ~19) 끝에:
```js
import flightCategoryProcessor from './processors/flight-category-processor.js'
```

`locks` 객체(line 21)에 `flight_category: false` 추가:
```js
const locks = { ..., airport_info: false, flight_category: false }
```

`main()` 안의 cron 등록 블록(line ~102) 끝에:
```js
  cron.schedule(config.schedule.flight_category_interval, () =>
    runWithLock('flight_category', flightCategoryProcessor.process))
```

`buildInitialCollectionJobs()`의 `jobs` 배열 끝에:
```js
  if (config.flight_category?.collect_on_startup !== false)
    jobs.push(['flight_category', flightCategoryProcessor.process])
```

- [ ] **Step 5: 서버 시작 + 엔드포인트 확인**

```bash
cd backend
node server.js &
sleep 4
curl -s http://localhost:3001/api/weather/flight-category-overlay | python3 -c "import sys,json; d=json.load(sys.stdin); print('features:', len(d.get('features', [])))"
kill %1
```

Expected: `features: 0` (첫 수집 전) 또는 숫자

- [ ] **Step 6: 커밋**

```bash
git add backend/src/store.js backend/server.js backend/src/index.js
git commit -m "feat(flight-category): wire up API route and cron"
```

---

## Task 7: FlightCategoryLayer.jsx

**Files:**
- Create: `frontend/src/features/map/layers/FlightCategoryLayer.jsx`

60초 폴링, ETag 조건부 요청, Mapbox fill 레이어.

- [ ] **Step 1: `layers/` 디렉터리 및 컴포넌트 생성**

`frontend/src/features/map/layers/FlightCategoryLayer.jsx`:

```jsx
import { useEffect, useRef } from 'react'

const SOURCE_ID = 'flight-category-source'
const LAYER_ID = 'flight-category-fill'
const POLL_MS = 60 * 1000

export default function FlightCategoryLayer({ map, visible, beforeLayerId }) {
  const etagRef = useRef(null)
  const timerRef = useRef(null)

  useEffect(() => {
    if (!map) return

    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
    }

    if (!map.getLayer(LAYER_ID)) {
      const layerDef = {
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        layout: { visibility: visible ? 'visible' : 'none' },
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.35,
        },
      }
      // 공항 마커 레이어보다 아래에 삽입
      if (beforeLayerId && map.getLayer(beforeLayerId)) {
        map.addLayer(layerDef, beforeLayerId)
      } else {
        map.addLayer(layerDef)
      }
    }

    async function fetchData() {
      try {
        const headers = {}
        if (etagRef.current) headers['If-None-Match'] = etagRef.current
        const res = await fetch('/api/weather/flight-category-overlay', { headers })
        if (res.status === 304) return
        if (!res.ok) {
          // 스펙: "API 실패 시 레이어 숨김, 기존 데이터 잔존 없음"
          map.getSource(SOURCE_ID)?.setData({ type: 'FeatureCollection', features: [] })
          if (map.getLayer(LAYER_ID)) map.setLayoutProperty(LAYER_ID, 'visibility', 'none')
          return
        }
        const etag = res.headers.get('ETag')
        if (etag) etagRef.current = etag
        const geojson = await res.json()
        map.getSource(SOURCE_ID)?.setData(geojson)
      } catch (e) {
        console.warn('FlightCategoryLayer:', e.message)
      }
    }

    fetchData()
    timerRef.current = setInterval(fetchData, POLL_MS)

    return () => {
      clearInterval(timerRef.current)
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch {}
    }
  }, [map])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!map?.getLayer(LAYER_ID)) return
    map.setLayoutProperty(LAYER_ID, 'visibility', visible ? 'visible' : 'none')
  }, [map, visible])

  return null
}
```

- [ ] **Step 2: 커밋**

```bash
git add frontend/src/features/map/layers/FlightCategoryLayer.jsx
git commit -m "feat(flight-category): add FlightCategoryLayer component"
```

---

## Task 8: MapView + WeatherOverlayPanel 통합

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: MET_LAYERS에 flightCategory 추가**

`frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` line 121 (`adsb` 항목 뒤):

```js
  { id: 'flightCategory', label: '비행기상구역', color: '#f97316' },
```

- [ ] **Step 2: WeatherOverlayPanel — 기상 그룹과 레이블 추가**

`frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`:

`groups[0]` (기상 그룹)의 `ids` 배열에 `'flightCategory'` 추가:
```js
{ id: 'weather', title: '기상', ids: showWind
  ? ['radar', 'satellite', 'lightning', 'wind', 'temp', 'cloud', 'icing', 'turbulence', 'flightCategory']
  : ['radar', 'satellite', 'lightning', 'flightCategory'] },
```

`layerLabels` 객체에 추가:
```js
    flightCategory: '비행기상구역',
```

- [ ] **Step 3: MapView.jsx — import + 레이어 마운트**

`frontend/src/features/map/MapView.jsx` imports 끝에 추가:
```js
import FlightCategoryLayer from './layers/FlightCategoryLayer'
import { AIRPORT_CIRCLE_LAYER } from './lib/baseMapLayers.js'
```

(`AIRPORT_CIRCLE_LAYER`는 `'kma-weather-airports-circle'` — 이미 import되어 있으면 중복 추가 불필요)

JSX 렌더 부분에서 다른 `<XxxLayer map={map}...>` 컴포넌트들 근처에 추가:
```jsx
<FlightCategoryLayer
  map={map}
  visible={!!metVisibility.flightCategory}
  beforeLayerId={AIRPORT_CIRCLE_LAYER}
/>
```

- [ ] **Step 4: 앱 빌드 확인**

```bash
cd frontend
npm run build 2>&1 | tail -20
```

Expected: 에러 없음, `dist/` 생성

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js \
        frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx \
        frontend/src/features/map/MapView.jsx
git commit -m "feat(flight-category): integrate layer toggle in map UI"
```

---

## 자체 검토 (스펙 대비)

| 스펙 요구사항 | 구현 태스크 |
|---|---|
| 시정 격자 2049×2049 ASCII 파싱 | Task 3 |
| AMOS 운고 IDW (15개 공항) | Task 5 (getAmosCeilingPoints) |
| ASOS CH_MIN 96개 지점 | **미구현** — 좌표 테이블 별도 추가 필요 (아래 참조) |
| GK2A CTPS CTH 마스킹 | Task 5 (fetchCtps + buildCategoryGrid) |
| VFR/IFR/LIFR 3단계 분류 | Task 5 (classifyFlightCategory) |
| Marching Squares + simplify | Task 5 (categoryGridToGeoJson) |
| store 캐시 + 실패 시 이전 캐시 유지 | Task 6 (store.save 기존 패턴) |
| GET /api/weather/flight-category-overlay | Task 6 |
| Last-Modified 헤더 | Task 6 |
| 1시간 크론 (매 정각+5분) | Task 6 |
| Mapbox fill opacity 0.35 | Task 7 |
| 레이더/위성 위, 마커 아래 | Task 7 (beforeLayerId) |
| 레이어 패널 토글 | Task 8 |
| API 실패 시 레이어 숨김 | Task 7 (빈 GeoJSON 유지) |

### 알려진 갭: ASOS CH_MIN 96개 지점 좌표

`getAmosCeilingPoints()`는 AMOS(공항) 지점만 사용한다. ASOS 96개 지점을 추가하려면 KMA 지점 좌표 테이블(STN ID → lat/lon)이 필요하다. 이 데이터는 `shared/asos-stations.js`로 추가하면 되며, 1차 배포 후 별도 태스크로 처리한다. AMOS 15개만으로도 IDW는 동작한다.

### 타입 일관성

- `classifyFlightCategory(vis_m, ceil_ft)` — 테스트와 구현 일치
- `cthIndexToPixel(lat, lon)` — 테스트와 구현 일치
- `CATEGORY_COLORS.{VFR,IFR,LIFR}` — 테스트와 구현 일치
- `FlightCategoryLayer({ map, visible, beforeLayerId })` — MapView 호출과 일치
