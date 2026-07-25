# 레이더 에코 이동 화살표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레이더 에코의 다가오는 앞면을 따라 일정 간격으로 빨간 이동 화살표를 지도에 표시한다.

**Architecture:** 백엔드가 5분마다 두 프레임을 MTREC 2단계(150 km 지향류 → 20 km 국지 움직임 → 합성 → 평활화)로 추적하고, 앞면 벡터만 골라 Point GeoJSON으로 발행한다. 프론트엔드는 그 점에서 화살대 LineString을 만들어 선 레이어로, 화살촉은 끝점 심볼 레이어로 그린다.

**Tech Stack:** Node 22 (ESM, `node:test`), Express, Mapbox GL JS v3, React 19, Playwright.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-26-radar-echo-motion-arrows-design.md`. 충돌 시 스펙이 우선한다.
- Linux 전용. `git`/`npm`/`node`를 Linux 셸에서만 실행한다.
- 작업 격자는 2 km 유지(`work_stride: 4`). 1 km 승격은 본 계획의 범위 밖이다.
- 큰 덩어리 150 km, 작은 덩어리 20 km, 벡터 간격 8 km, 최대속도 100 km/h, 앞면 판정 6 km.
- 유사도는 **피어슨 상관계수**를 쓴다. 절대차이 합(SAD)을 쓰지 않는다.
- 1차에서는 품질 필터를 걸지 않는다. `correlation`·`neighbourAgreement`는 속성으로 싣기만 한다.
- 화살촉 심볼에 `symbol-placement`를 지정하지 않는다(기본 `point`).
- 이동 계산 실패가 레이더 PNG·메타 발행을 막지 않는다.
- 한국어 주석·문자열을 쓴다. 인코딩은 UTF-8, `docs/policies/encoding-safety.md`를 따른다.
- 백엔드 테스트: `cd backend && npm test`. 프론트 단위 테스트: `cd frontend && npm test`. 브라우저 계약: `cd frontend && npm run dev:contract -- --grep <pattern>`.

## File Structure

**Create**
- `backend/src/processors/radar-motion-model.js` — 순수 계산. 상관계수, 지향류, 국지 벡터장, 평활화, 앞면 판정, GeoJSON 변환. 파일 I/O·설정 접근 없음.
- `backend/test/radar-motion-model.test.js` — 위 순수 함수 테스트.
- `backend/scripts/measure-motion-accuracy.mjs` — Task 1 측정 게이트 전용 스크립트. 운영 경로가 아님.
- `frontend/verification/contracts/radar-motion.spec.mjs` — 브라우저 계약.

**Modify**
- `backend/src/config.js` — `radar_echo_motion` 절 추가.
- `backend/src/processors/radar-motion.js` — 입력 준비·직렬화·오케스트레이션만 남기고 계산은 model로 위임. `deriveObservedMotion`는 제거.
- `backend/src/processors/radar-echo-processor.js:14` — `MOTION_ENABLED` 제거하고 설정값 사용. `attachMotionFrame` 갱신.
- `backend/test/radar-motion.test.js` — 약한 단언 교체.
- `backend/test/radar-echo-motion-publication.test.js` — 발행 계약 갱신.
- `frontend/src/features/weather-overlays/lib/radarMotionLayers.js` — 전면 교체.
- `frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js` — 전면 교체.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:60,82,481` — 소스·레이어 ID 등록.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js:12,220-234` — 플래그 제거, 모델 형태 갱신.
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` — 범례·토글.

---

### Task 1: 측정 게이트 — 개별 화살표 정확도

스펙의 필수 선행 측정이다. **이 결과 없이 Task 3 이후를 진행하지 않는다.**

**Files:**
- Create: `backend/scripts/measure-motion-accuracy.mjs`

**Interfaces:**
- Consumes: `backend/src/parsers/radar-echo-parser.js`의 `parseRadarBinary`, `backend/src/lib/fetchWithTimeout.js`의 `fetchWithTimeout`, `backend/src/config.js`.
- Produces: 표준출력 수치. 후속 태스크의 코드 의존성 없음.

- [ ] **Step 1: 측정 스크립트 작성**

`backend/scripts/measure-motion-accuracy.mjs`를 만든다. 기존 `backend/scripts/probe-radar-qcd-sites.mjs`의 형식을 따른다.

정답 정의: 프레임 T-5·T로 구한 화살표를 프레임 T에 적용해 T+5를 예측하고, 그 국소 패치가 실제 T+5 관측과 **"안 움직인다고 가정"보다 잘 맞으면 그 화살표는 옳다.**

```js
// 실제 강수 사례에서 개별 화살표의 정오답을 실측한다. 합성 데이터를 쓰지 않는다.
import config from '../src/config.js'
import { parseRadarBinary } from '../src/parsers/radar-echo-parser.js'
import { fetchWithTimeout } from '../src/lib/fetchWithTimeout.js'

const CASES = ['202607180635', '202607180035', '202607210335', '202607200935']
const WORK_STRIDE = 4
const CELL_KM = WORK_STRIDE * 0.5
const MIN_REFL = 2000
const PATCH = 6

const pad = (n) => String(n).padStart(2, '0')
const tmAt = (ms) => {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`
}
const tmToMs = (tm) => Date.UTC(+tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8), +tm.slice(8, 10), +tm.slice(10, 12))

async function fetchGrid(tm) {
  const url = `${config.api.radar_url}?${new URLSearchParams({
    tm, data: 'bin', cmp: config.radar_echo.cmp, authKey: config.api.radar_satellite_auth_key,
  })}`
  const res = await fetchWithTimeout(url, config.radar_echo.timeout_ms)
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10000 || buf[0] !== 0x1f || buf[1] !== 0x8b) return null
  const { refl, nx, ny } = parseRadarBinary(buf)
  const width = Math.ceil(nx / WORK_STRIDE)
  const height = Math.ceil(ny / WORK_STRIDE)
  const values = new Int16Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      let max = -32768
      for (let y = row * WORK_STRIDE; y < Math.min((row + 1) * WORK_STRIDE, ny); y += 1) {
        for (let x = col * WORK_STRIDE; x < Math.min((col + 1) * WORK_STRIDE, nx); x += 1) {
          max = Math.max(max, refl[y * nx + x])
        }
      }
      values[row * width + col] = max
    }
  }
  return { width, height, values }
}

const at = (g, x, y) => (x < 0 || y < 0 || x >= g.width || y >= g.height) ? 0 : g.values[y * g.width + x]

function sad(a, b, ax, ay, bx, by, half) {
  let sum = 0, n = 0
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) { sum += Math.abs(at(a, ax + dx, ay + dy) - at(b, bx + dx, by + dy)); n += 1 }
  }
  return sum / n
}

// 정합 후보를 정수 칸으로 고르고, 소수점 보정값도 함께 낸다(포물선 정점).
function bestOffset(prev, curr, x, y, search, half) {
  let best = null
  const score = new Map()
  for (let dy = -search; dy <= search; dy += 1) {
    for (let dx = -search; dx <= search; dx += 1) {
      const s = sad(prev, curr, x - dx, y - dy, x, y, half)
      score.set(`${dx}:${dy}`, s)
      if (!best || s < best.s) best = { dx, dy, s }
    }
  }
  const get = (dx, dy) => score.get(`${dx}:${dy}`) ?? best.s
  const parab = (m, c, p) => { const d = m - 2 * c + p; return d === 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / d)) }
  return {
    ...best,
    subDx: best.dx + parab(get(best.dx - 1, best.dy), best.s, get(best.dx + 1, best.dy)),
    subDy: best.dy + parab(get(best.dx, best.dy - 1), best.s, get(best.dx, best.dy + 1)),
  }
}

function scoreCase(g1, g2, g3, useSub) {
  const search = Math.ceil(100 * (5 / 60) / CELL_KM) // 100 km/h, 5분
  let total = 0, correct = 0
  for (let y = PATCH; y < g2.height - PATCH; y += 4) {
    for (let x = PATCH; x < g2.width - PATCH; x += 4) {
      if (at(g2, x, y) < MIN_REFL) continue
      const v = bestOffset(g1, g2, x, y, search, PATCH)
      const dx = useSub ? Math.round(v.subDx) : v.dx
      const dy = useSub ? Math.round(v.subDy) : v.dy
      const moved = sad(g2, g3, x - dx, y - dy, x, y, PATCH)
      const still = sad(g2, g3, x, y, x, y, PATCH)
      total += 1
      if (moved < still) correct += 1
    }
  }
  return { total, correct }
}

for (const tm of CASES) {
  const base = tmToMs(tm)
  const grids = []
  for (const step of [-10, -5, 0]) grids.push(await fetchGrid(tmAt(base + step * 60000)))
  if (grids.some((g) => !g)) { console.log(`${tm}: 프레임 수신 실패, 건너뜀`); continue }
  const [g1, g2, g3] = grids
  const plain = scoreCase(g1, g2, g3, false)
  const sub = scoreCase(g1, g2, g3, true)
  const pct = (r) => `${(r.correct / r.total * 100).toFixed(1)}%`
  console.log(`${tm}  화살표 ${plain.total}개 | 정수 변위 ${pct(plain)} | 소수점 보정 ${pct(sub)}`)
}
```

- [ ] **Step 2: 실행하고 수치를 기록**

Run: `cd backend && node --env-file=../.env scripts/measure-motion-accuracy.mjs`
Expected: 4개 사례 각각에 대해 화살표 개수와 정확도 두 열이 출력된다. 네트워크가 필요하다.

- [ ] **Step 3: 결과를 status 문서에 남긴다**

`docs/superpowers/status/radar-echo-motion-arrows.status.md`를 만들고 출력을 그대로 붙인다. 해석을 덧붙인다:
- 기존 1단계 방식의 개별 정확도가 몇 %인가.
- 소수점 보정이 개선을 주는가.

- [ ] **Step 4: 판단 지점 — 사용자에게 보고**

측정값을 사용자에게 보고하고 진행 여부를 확인받는다. 정확도가 이미 충분히 높으면(예: 80% 이상) MTREC 2단계 채택을 재검토한다. 스펙이 이 재검토를 명시적으로 요구한다.

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/measure-motion-accuracy.mjs docs/superpowers/status/radar-echo-motion-arrows.status.md
git commit -m "test(motion): measure per-arrow accuracy against the real next frame"
```

---

### Task 2: 설정 절 추가

**Files:**
- Modify: `backend/src/config.js` (`radar_echo` 절 바로 뒤, 약 156행)

**Interfaces:**
- Produces: `config.radar_echo_motion` — 아래 키를 가진 동결 객체. Task 3–6이 사용한다.

- [ ] **Step 1: 설정 절을 추가**

`export const radar_echo = { ... }` 블록 바로 다음에 넣는다.

```js
// 레이더 에코 이동벡터 — MTREC 2단계 추적(Wang et al. 2013)의 추적 부분만 사용한다.
// 예측 영상은 만들지 않는다. 산출물은 앞면 화살표 GeoJSON이다.
export const radar_echo_motion = {
  enabled: process.env.RADAR_MOTION_ENABLED !== '0',
  work_stride: 4,        // HSR 0.5 km를 4칸씩 솎아 2 km 작업 격자를 만든다.
  large_box_km: 150,     // 지향류(종관규모)를 잡는 덩어리. 논문이 100/150/200 중 150을 채택했다.
  small_box_km: 20,      // 국지 움직임(중규모)을 잡는 덩어리.
  spacing_km: 8,         // 화살표 간격. 핀란드 기상청 운영값.
  max_speed_kmh: 100,    // 탐색 반경 제한 R = v_max × Δt. 품질 필터가 아니라 계산의 정의역이다.
  edge_lookahead_km: 6,  // 이 거리 앞에 에코가 없으면 앞면으로 본다.
  min_reflectivity: 2000, // 스케일 dBZ(×100). 이 미만은 계산 대상이 아니다.
  max_calculation_ms: 30000,
}
```

- [ ] **Step 2: 기본 내보내기에 등록**

`backend/src/config.js` 말미의 `export default { ... }` 객체(약 343행 `radar_echo_top,` 옆)에 `radar_echo_motion,`을 추가한다.

- [ ] **Step 3: 로드되는지 확인**

Run: `cd backend && node -e "import('./src/config.js').then(m => console.log(m.default.radar_echo_motion))"`
Expected: 위 키가 모두 담긴 객체가 출력된다.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config.js
git commit -m "feat(motion): add the MTREC tracking config section"
```

---

### Task 3: 상관계수와 지향류 (MTREC 1단계)

**Files:**
- Create: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: 없음(순수 함수).
- Produces:
  - `MOTION_MODEL_DEFAULTS` — `{ workStride, largeBoxKm, smallBoxKm, spacingKm, maxSpeedKmh, edgeLookaheadKm, minReflectivity, frameIntervalMs }`.
  - `cellKm(settings) -> number`
  - `searchRadiusCells(settings) -> number`
  - `boxCorrelation(previous, current, prevCol, prevRow, currCol, currRow, halfBox, step) -> number|null` — 피어슨 상관계수. 유효 표본이 부족하면 `null`.
  - `deriveSteeringFlow(previous, current, settings) -> { boxCells, cols, rows, dx: Int16Array, dy: Int16Array, correlation: Float32Array }`
  - `steeringAt(steering, col, row) -> { dx, dy }`

  격자 입력은 기존 `createMotionInput` 산출물과 같은 `{ width, height, stride, values: Int16Array }` 형태다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/radar-motion-model.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOTION_MODEL_DEFAULTS, boxCorrelation, cellKm, deriveSteeringFlow, searchRadiusCells, steeringAt,
} from '../src/processors/radar-motion-model.js'

// 60x60 작업 격자에 매끈한 덩어리 몇 개를 놓고 통째로 옮긴다.
function fieldShifted(width, height, offsetX, offsetY) {
  const values = new Int16Array(width * height)
  const blobs = [
    { cx: 15, cy: 20, r: 6, peak: 5000 },
    { cx: 35, cy: 30, r: 8, peak: 6000 },
    { cx: 25, cy: 45, r: 5, peak: 4500 },
  ]
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let v = 0
      for (const b of blobs) {
        const d2 = (x - offsetX - b.cx) ** 2 + (y - offsetY - b.cy) ** 2
        v += b.peak * Math.exp(-d2 / (2 * b.r * b.r))
      }
      values[y * width + x] = Math.round(v)
    }
  }
  return { width, height, stride: 4, values }
}

test('cellKm은 작업 격자 한 칸의 km를 준다', () => {
  assert.equal(cellKm({ ...MOTION_MODEL_DEFAULTS, workStride: 4 }), 2)
  assert.equal(cellKm({ ...MOTION_MODEL_DEFAULTS, workStride: 2 }), 1)
})

test('탐색 반경은 최대속도와 프레임 간격에서 나온다', () => {
  // 100 km/h로 5분이면 8.33 km. 2 km 칸이면 5칸(올림).
  assert.equal(searchRadiusCells({ ...MOTION_MODEL_DEFAULTS, workStride: 4, maxSpeedKmh: 100, frameIntervalMs: 300000 }), 5)
})

test('같은 패턴의 상관계수는 1, 유효 표본이 없으면 null', () => {
  const a = fieldShifted(60, 60, 0, 0)
  assert.ok(boxCorrelation(a, a, 25, 30, 25, 30, 8, 1) > 0.999)
  const flat = { width: 60, height: 60, stride: 4, values: new Int16Array(3600) }
  assert.equal(boxCorrelation(flat, flat, 25, 30, 25, 30, 8, 1), null)
})

test('지향류는 통째로 옮긴 장의 변위를 되찾는다', () => {
  const previous = fieldShifted(60, 60, 0, 0)
  const current = fieldShifted(60, 60, 3, -2)
  const settings = { ...MOTION_MODEL_DEFAULTS, workStride: 4, largeBoxKm: 60, maxSpeedKmh: 100, frameIntervalMs: 300000 }
  const steering = deriveSteeringFlow(previous, current, settings)
  const { dx, dy } = steeringAt(steering, 30, 30)
  assert.equal(dx, 3)
  assert.equal(dy, -2)
})

test('에코가 없으면 지향류는 0 벡터를 준다', () => {
  const empty = { width: 60, height: 60, stride: 4, values: new Int16Array(3600) }
  const settings = { ...MOTION_MODEL_DEFAULTS, workStride: 4, largeBoxKm: 60, frameIntervalMs: 300000 }
  const steering = deriveSteeringFlow(empty, empty, settings)
  assert.deepEqual(steeringAt(steering, 30, 30), { dx: 0, dy: 0 })
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: FAIL — `Cannot find module '../src/processors/radar-motion-model.js'`

- [ ] **Step 3: 최소 구현**

`backend/src/processors/radar-motion-model.js`:

```js
// MTREC(Wang et al. 2013, Adv. Atmos. Sci. 30(2):448-460) 추적 부분의 순수 계산.
// 논문의 이류·강수예측 부분은 채택하지 않는다 — 산출물은 벡터이지 예측 영상이 아니다.
// 격자는 { width, height, stride, values: Int16Array } 형태를 받는다.

const HSR_CELL_KM = 0.5

export const MOTION_MODEL_DEFAULTS = Object.freeze({
  workStride: 4,
  largeBoxKm: 150,
  smallBoxKm: 20,
  spacingKm: 8,
  maxSpeedKmh: 100,
  edgeLookaheadKm: 6,
  minReflectivity: 2000,
  frameIntervalMs: 5 * 60 * 1000,
})

export function cellKm(settings) {
  return settings.workStride * HSR_CELL_KM
}

export function searchRadiusCells(settings) {
  const hours = settings.frameIntervalMs / 3600000
  return Math.max(1, Math.ceil(settings.maxSpeedKmh * hours / cellKm(settings)))
}

function valueAt(grid, col, row) {
  if (col < 0 || row < 0 || col >= grid.width || row >= grid.height) return null
  return grid.values[row * grid.width + col]
}

// 피어슨 상관계수. step으로 큰 덩어리 내부를 솎아 본다(논문도 전수 계산을 요구하지 않는다).
export function boxCorrelation(previous, current, prevCol, prevRow, currCol, currRow, halfBox, step = 1) {
  let n = 0, sumA = 0, sumB = 0
  const a = [], b = []
  for (let dy = -halfBox; dy <= halfBox; dy += step) {
    for (let dx = -halfBox; dx <= halfBox; dx += step) {
      const va = valueAt(previous, prevCol + dx, prevRow + dy)
      const vb = valueAt(current, currCol + dx, currRow + dy)
      if (va === null || vb === null) continue
      a.push(va); b.push(vb); sumA += va; sumB += vb; n += 1
    }
  }
  if (n < 9) return null
  const meanA = sumA / n, meanB = sumB / n
  let num = 0, denA = 0, denB = 0
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA, db = b[i] - meanB
    num += da * db; denA += da * da; denB += db * db
  }
  if (denA <= 0 || denB <= 0) return null
  return num / Math.sqrt(denA * denB)
}

// MTREC 1단계 — 큰 덩어리로 종관규모 지향류를 구한다.
export function deriveSteeringFlow(previous, current, settings) {
  const boxCells = Math.max(1, Math.round(settings.largeBoxKm / cellKm(settings)))
  const half = Math.floor(boxCells / 2)
  const step = Math.max(1, Math.floor(boxCells / 25)) // 덩어리당 약 25x25 표본
  const search = searchRadiusCells(settings)
  const cols = Math.max(1, Math.ceil(current.width / boxCells))
  const rows = Math.max(1, Math.ceil(current.height / boxCells))
  const dx = new Int16Array(cols * rows)
  const dy = new Int16Array(cols * rows)
  const correlation = new Float32Array(cols * rows)

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cx = Math.min(current.width - 1, col * boxCells + half)
      const cy = Math.min(current.height - 1, row * boxCells + half)
      let best = null
      for (let oy = -search; oy <= search; oy += 1) {
        for (let ox = -search; ox <= search; ox += 1) {
          const cc = boxCorrelation(previous, current, cx - ox, cy - oy, cx, cy, half, step)
          if (cc === null) continue
          if (!best || cc > best.cc) best = { ox, oy, cc }
        }
      }
      const index = row * cols + col
      dx[index] = best ? best.ox : 0
      dy[index] = best ? best.oy : 0
      correlation[index] = best ? best.cc : 0
    }
  }
  return { boxCells, cols, rows, dx, dy, correlation }
}

export function steeringAt(steering, col, row) {
  const bc = Math.min(steering.cols - 1, Math.max(0, Math.floor(col / steering.boxCells)))
  const br = Math.min(steering.rows - 1, Math.max(0, Math.floor(row / steering.boxCells)))
  const index = br * steering.cols + bc
  return { dx: steering.dx[index], dy: steering.dy[index] }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 5개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): add Pearson correlation and the 150 km steering flow"
```

---

### Task 4: 국지 벡터장과 평활화 (MTREC 2·3·4단계)

**Files:**
- Modify: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: Task 3의 `deriveSteeringFlow`, `steeringAt`, `boxCorrelation`, `searchRadiusCells`, `cellKm`.
- Produces:
  - `deriveMotionField(previous, current, steering, settings) -> Array<{ col, row, dx, dy, correlation }>` — `dx`/`dy`는 소수점 보정이 들어간 실수. 작업 격자 칸 단위.
  - `smoothMotionField(vectors, settings) -> Array<{ col, row, dx, dy, correlation, neighbourAgreement }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/radar-motion-model.test.js`에 덧붙인다. `fieldShifted` 헬퍼를 재사용한다.

```js
import { deriveMotionField, smoothMotionField } from '../src/processors/radar-motion-model.js'

const FIELD_SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 4, largeBoxKm: 60, smallBoxKm: 20, spacingKm: 8,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
}

test('국지 벡터장은 대다수가 참 변위 방향을 가리킨다', () => {
  const previous = fieldShifted(60, 60, 0, 0)
  const current = fieldShifted(60, 60, 3, -2)
  const steering = deriveSteeringFlow(previous, current, FIELD_SETTINGS)
  const field = deriveMotionField(previous, current, steering, FIELD_SETTINGS)

  assert.ok(field.length > 0, '벡터가 하나도 없으면 안 된다')
  // 하나라도 맞으면 통과하는 약한 단언을 쓰지 않는다. 과반이 맞아야 한다.
  const close = field.filter((v) => Math.abs(v.dx - 3) <= 1 && Math.abs(v.dy - (-2)) <= 1)
  assert.ok(close.length / field.length > 0.7, `참 변위 근처 비율 ${close.length}/${field.length}`)
})

test('소수점 보정이 들어가 정수가 아닌 변위가 나온다', () => {
  const previous = fieldShifted(60, 60, 0, 0)
  const current = fieldShifted(60, 60, 3, -2)
  const steering = deriveSteeringFlow(previous, current, FIELD_SETTINGS)
  const field = deriveMotionField(previous, current, steering, FIELD_SETTINGS)
  assert.ok(field.some((v) => !Number.isInteger(v.dx) || !Number.isInteger(v.dy)))
})

test('에코가 없는 곳에는 벡터를 만들지 않는다', () => {
  const empty = { width: 60, height: 60, stride: 4, values: new Int16Array(3600) }
  const steering = deriveSteeringFlow(empty, empty, FIELD_SETTINGS)
  assert.deepEqual(deriveMotionField(empty, empty, steering, FIELD_SETTINGS), [])
})

test('평활화는 튀는 벡터를 이웃 중앙값으로 끌어오고 일치도를 매긴다', () => {
  const vectors = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) vectors.push({ col: col * 4, row: row * 4, dx: 3, dy: -2, correlation: 0.9 })
  }
  const rogue = vectors.find((v) => v.col === 8 && v.row === 8)
  rogue.dx = -7
  rogue.dy = 6

  const smoothed = smoothMotionField(vectors, { ...FIELD_SETTINGS, spacingKm: 8 })
  const fixed = smoothed.find((v) => v.col === 8 && v.row === 8)
  assert.equal(fixed.dx, 3)
  assert.equal(fixed.dy, -2)
  assert.ok(smoothed.every((v) => v.neighbourAgreement >= 0 && v.neighbourAgreement <= 1))
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: FAIL — `deriveMotionField is not a function`

- [ ] **Step 3: 최소 구현**

`radar-motion-model.js`에 덧붙인다.

```js
// 정합 점수 세 점에 포물선을 맞춰 소수점 변위를 얻는다.
// 정수 칸만 쓰면 변위가 1~2칸일 때 방위가 8방향으로 양자화되어 방향이 튄다.
function subCellPeak(minus, center, plus) {
  const denom = minus - 2 * center + plus
  if (denom === 0) return 0
  return Math.max(-0.5, Math.min(0.5, 0.5 * (minus - plus) / denom))
}

// MTREC 2·3단계 — 지향류에서 출발해 작은 덩어리로 국지 움직임을 구한다.
//
// ponytail: 논문은 이 단계 전에 준-라그랑주 이류로 영상 전체를 지향류만큼 밀어놓고
// 잔차에 대해 작은 덩어리를 적용한다. 여기서는 영상을 밀지 않고 탐색 시작점만
// 지향류로 옮긴다(수학적 근사, 훨씬 싸다). 정확도가 부족하면 정식 이류로 승격한다.
export function deriveMotionField(previous, current, steering, settings) {
  const km = cellKm(settings)
  const spacing = Math.max(1, Math.round(settings.spacingKm / km))
  const half = Math.max(1, Math.round(settings.smallBoxKm / km / 2))
  const local = Math.max(1, Math.ceil(searchRadiusCells(settings) / 2))
  const vectors = []

  for (let row = half; row < current.height - half; row += spacing) {
    for (let col = half; col < current.width - half; col += spacing) {
      if (current.values[row * current.width + col] < settings.minReflectivity) continue
      const base = steeringAt(steering, col, row)
      const scores = new Map()
      let best = null
      for (let oy = base.dy - local; oy <= base.dy + local; oy += 1) {
        for (let ox = base.dx - local; ox <= base.dx + local; ox += 1) {
          const cc = boxCorrelation(previous, current, col - ox, row - oy, col, row, half, 1)
          if (cc === null) continue
          scores.set(`${ox}:${oy}`, cc)
          if (!best || cc > best.cc) best = { ox, oy, cc }
        }
      }
      if (!best) continue
      const read = (ox, oy) => scores.get(`${ox}:${oy}`) ?? best.cc
      // 상관계수는 클수록 좋으므로 부호를 뒤집어 최소점 보정 공식을 쓴다.
      const sx = subCellPeak(-read(best.ox - 1, best.oy), -best.cc, -read(best.ox + 1, best.oy))
      const sy = subCellPeak(-read(best.ox, best.oy - 1), -best.cc, -read(best.ox, best.oy + 1))
      vectors.push({ col, row, dx: best.ox + sx, dy: best.oy + sy, correlation: best.cc })
    }
  }
  return vectors
}

// MTREC 4단계 — 이웃 중앙값으로 다듬고, 이웃과의 일치도를 품질 지표로 남긴다.
export function smoothMotionField(vectors, settings) {
  const km = cellKm(settings)
  const spacing = Math.max(1, Math.round(settings.spacingKm / km))
  const key = (col, row) => `${col}:${row}`
  const byKey = new Map(vectors.map((v) => [key(v.col, v.row), v]))

  return vectors.map((v) => {
    const dxs = [], dys = []
    let agree = 0, total = 0
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const n = byKey.get(key(v.col + ox * spacing, v.row + oy * spacing))
        if (!n) continue
        dxs.push(n.dx); dys.push(n.dy)
        if (ox === 0 && oy === 0) continue
        total += 1
        const m1 = Math.hypot(v.dx, v.dy), m2 = Math.hypot(n.dx, n.dy)
        if (m1 < 0.25 || m2 < 0.25) { if (Math.abs(m1 - m2) < 0.5) agree += 1; continue }
        if ((v.dx * n.dx + v.dy * n.dy) / (m1 * m2) > 0.7) agree += 1 // 약 45도 이내
      }
    }
    if (dxs.length < 3) return { ...v, neighbourAgreement: total ? agree / total : 0 }
    dxs.sort((a, b) => a - b); dys.sort((a, b) => a - b)
    const mid = dxs.length >> 1
    return { ...v, dx: dxs[mid], dy: dys[mid], neighbourAgreement: total ? agree / total : 0 }
  })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 9개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): add the 20 km local pass with sub-cell peak and median smoothing"
```

---

### Task 5: 앞면 판정과 GeoJSON 변환

**Files:**
- Modify: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: Task 4의 벡터 배열 형태.
- Produces:
  - `selectLeadingEdge(vectors, current, settings) -> Array<same shape>`
  - `motionVectorsToGeoJSON(vectors, options) -> FeatureCollection` — `options`는 `{ gridToLatLon, workStride, frameIntervalMs, observedAtMs, comparedFromMs }`. `gridToLatLon(x, y)`는 **원본 0.5 km 격자 좌표**를 받는다(`backend/src/parsers/radar-echo-parser.js`의 동명 함수와 같은 규약).
  - Feature 속성: `bearingDeg`(0–360 정수), `speedKt`(정수), `correlation`(소수 2자리), `neighbourAgreement`(소수 2자리).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { motionVectorsToGeoJSON, selectLeadingEdge } from '../src/processors/radar-motion-model.js'

test('앞면만 남기고 에코 내부와 후면은 버린다', () => {
  // 왼쪽 절반만 에코인 장. 동쪽(+x)으로 움직이면 오른쪽 경계가 앞면이다.
  const width = 40, height = 10
  const values = new Int16Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < 20; col += 1) values[row * width + col] = 5000
  }
  const current = { width, height, stride: 4, values }
  const settings = { ...MOTION_MODEL_DEFAULTS, workStride: 4, edgeLookaheadKm: 6, minReflectivity: 2000 }

  const inside = { col: 5, row: 5, dx: 2, dy: 0, correlation: 0.9, neighbourAgreement: 1 }
  const front = { col: 19, row: 5, dx: 2, dy: 0, correlation: 0.9, neighbourAgreement: 1 }
  const back = { col: 0, row: 5, dx: 2, dy: 0, correlation: 0.9, neighbourAgreement: 1 }

  const kept = selectLeadingEdge([inside, front, back], current, settings)
  assert.deepEqual(kept.map((v) => v.col), [19])
})

test('정지 벡터는 앞면 판정에서 제외한다', () => {
  const current = { width: 40, height: 10, stride: 4, values: new Int16Array(400).fill(5000) }
  const settings = { ...MOTION_MODEL_DEFAULTS, workStride: 4, edgeLookaheadKm: 6, minReflectivity: 2000 }
  assert.deepEqual(selectLeadingEdge([{ col: 5, row: 5, dx: 0, dy: 0, correlation: 0.9, neighbourAgreement: 1 }], current, settings), [])
})

test('GeoJSON은 Point와 방위·속도를 낸다', () => {
  // 경도만 커지는 단순 격자. +x는 동쪽, +y는 남쪽.
  const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 - y * 0.001 })
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, correlation: 0.812, neighbourAgreement: 0.875 }],
    { gridToLatLon, workStride: 4, frameIntervalMs: 300000, observedAtMs: 1000, comparedFromMs: 700 },
  )
  assert.equal(geojson.type, 'FeatureCollection')
  assert.equal(geojson.features.length, 1)
  const f = geojson.features[0]
  assert.equal(f.geometry.type, 'Point')
  assert.ok(Math.abs(f.properties.bearingDeg - 90) < 2, `동쪽이어야 하는데 ${f.properties.bearingDeg}`)
  assert.ok(f.properties.speedKt > 0)
  assert.equal(f.properties.correlation, 0.81)
  assert.equal(f.properties.neighbourAgreement, 0.88)
})

test('좌표를 못 구하는 벡터는 조용히 버린다', () => {
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, correlation: 0.5, neighbourAgreement: 0.5 }],
    { gridToLatLon: () => ({ lon: NaN, lat: NaN }), workStride: 4, frameIntervalMs: 300000 },
  )
  assert.deepEqual(geojson.features, [])
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: FAIL — `selectLeadingEdge is not a function`

- [ ] **Step 3: 최소 구현**

```js
// 자기 이동 방향으로 edge_lookahead_km 앞에 에코가 없으면 앞면이다.
// 덩어리 분할이나 윤곽선 추출을 하지 않는다 — 규모를 가리지 않는 것이 목적이다.
export function selectLeadingEdge(vectors, current, settings) {
  const lookahead = settings.edgeLookaheadKm / cellKm(settings)
  return vectors.filter((v) => {
    const mag = Math.hypot(v.dx, v.dy)
    if (mag < 0.25) return false
    const col = Math.round(v.col + (v.dx / mag) * lookahead)
    const row = Math.round(v.row + (v.dy / mag) * lookahead)
    const ahead = valueAt(current, col, row)
    return ahead === null || ahead < settings.minReflectivity
  })
}

function bearingDegrees(start, end) {
  const toRad = Math.PI / 180
  const lat1 = start.lat * toRad, lat2 = end.lat * toRad
  const dLon = (end.lon - start.lon) * toRad
  const deg = Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  ) / toRad
  return (deg + 360) % 360
}

export function motionVectorsToGeoJSON(vectors, options) {
  const { gridToLatLon, workStride, frameIntervalMs } = options
  const km = workStride * HSR_CELL_KM
  const hours = frameIntervalMs / 3600000
  const features = []

  for (const v of vectors) {
    const start = gridToLatLon(v.col * workStride, v.row * workStride)
    const end = gridToLatLon((v.col + v.dx) * workStride, (v.row + v.dy) * workStride)
    if (!start || !end) continue
    if (![start.lon, start.lat, end.lon, end.lat].every(Number.isFinite)) continue
    const speedKt = Math.hypot(v.dx, v.dy) * km / hours / 1.852
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [start.lon, start.lat] },
      properties: {
        bearingDeg: Math.round(bearingDegrees(start, end)),
        speedKt: Math.round(speedKt),
        correlation: Number(v.correlation.toFixed(2)),
        neighbourAgreement: Number((v.neighbourAgreement ?? 0).toFixed(2)),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 13개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): select the leading edge and emit point GeoJSON"
```

---

### Task 6: 발행 배선 — 프로세서 연결과 기능 활성화

**Files:**
- Modify: `backend/src/processors/radar-motion.js`
- Modify: `backend/src/processors/radar-echo-processor.js:14,143-172,182-200`
- Test: `backend/test/radar-motion.test.js`, `backend/test/radar-echo-motion-publication.test.js`

**Interfaces:**
- Consumes: Task 2의 `config.radar_echo_motion`, Task 3–5의 model 함수, 기존 `createMotionInput`/`serializeMotionInput`/`deserializeMotionInput`.
- Produces: `deriveMotionGeoJSON(previous, current, options) -> FeatureCollection`. `options`는 `{ settings, gridToLatLon, observedAtMs, comparedFromMs }`.
- 발행 파일: `{DATA_PATH}/radar/motion_korea_{tm}.geojson`. 메타의 프레임에 `motion: { tm, observedAtMs, comparedFromMs, path }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/radar-motion.test.js`를 아래로 **교체**한다. 기존 "동쪽 화살표가 하나라도 있으면 통과" 단언은 남기지 않는다.

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createMotionInput, deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from '../src/processors/radar-motion.js'
import { MOTION_MODEL_DEFAULTS } from '../src/processors/radar-motion-model.js'

const SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 1, largeBoxKm: 15, smallBoxKm: 6, spacingKm: 2,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500, edgeLookaheadKm: 2,
}
const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.01, lat: 38 - y * 0.01 })

function shifted(offsetX, offsetY) {
  const width = 60, height = 60
  const refl = new Int16Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d2 = (x - offsetX - 25) ** 2 + (y - offsetY - 30) ** 2
      refl[y * width + x] = Math.round(6000 * Math.exp(-d2 / 100))
    }
  }
  return createMotionInput(refl, { nx: width, ny: height }, { stride: 1 })
}

test('동쪽으로 옮긴 에코는 과반이 동쪽 방위를 낸다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), {
    settings: SETTINGS, gridToLatLon, observedAtMs: 1000, comparedFromMs: 700,
  })
  assert.ok(geojson.features.length > 0)
  const east = geojson.features.filter((f) => f.properties.bearingDeg > 45 && f.properties.bearingDeg < 135)
  assert.ok(east.length / geojson.features.length > 0.6, `동쪽 비율 ${east.length}/${geojson.features.length}`)
})

test('모든 Feature는 Point이고 필수 속성을 갖는다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), {
    settings: SETTINGS, gridToLatLon, observedAtMs: 1000, comparedFromMs: 700,
  })
  for (const f of geojson.features) {
    assert.equal(f.geometry.type, 'Point')
    assert.ok(Number.isInteger(f.properties.bearingDeg))
    assert.ok(f.properties.bearingDeg >= 0 && f.properties.bearingDeg < 360)
    assert.ok(Number.isInteger(f.properties.speedKt))
    assert.equal(typeof f.properties.correlation, 'number')
    assert.equal(typeof f.properties.neighbourAgreement, 'number')
  }
})

test('격자 규격이 다르면 빈 FeatureCollection', () => {
  const a = shifted(0, 0)
  const b = { ...shifted(0, 0), width: a.width + 1 }
  assert.deepEqual(deriveMotionGeoJSON(a, b, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('에코가 없으면 빈 FeatureCollection', () => {
  const empty = createMotionInput(new Int16Array(3600), { nx: 60, ny: 60 }, { stride: 1 })
  assert.deepEqual(deriveMotionGeoJSON(empty, empty, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('직렬화는 왕복한다', () => {
  const input = shifted(0, 0)
  const restored = deserializeMotionInput(serializeMotionInput({ ...input, tm: '202607261200' }))
  assert.equal(restored.width, input.width)
  assert.equal(restored.stride, input.stride)
  assert.equal(restored.tm, '202607261200')
  assert.deepEqual(Array.from(restored.values.slice(0, 50)), Array.from(input.values.slice(0, 50)))
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion.test.js`
Expected: FAIL — `deriveMotionGeoJSON is not a function`

- [ ] **Step 3: `radar-motion.js`를 오케스트레이션으로 바꾼다**

`deriveObservedMotion`, `MOTION_DEFAULTS`, `valueAt`, `patchDifference`, `bearingDegrees`, `distanceKm`를 지우고 아래를 넣는다. `createMotionInput`, `serializeMotionInput`, `deserializeMotionInput`은 그대로 둔다.

```js
import {
  deriveMotionField, deriveSteeringFlow, motionVectorsToGeoJSON, selectLeadingEdge, smoothMotionField,
} from './radar-motion-model.js'

const EMPTY = { type: 'FeatureCollection', features: [] }

// MTREC 추적 4단계를 순서대로 돌려 앞면 화살표 GeoJSON을 만든다.
export function deriveMotionGeoJSON(previous, current, options) {
  const { settings, gridToLatLon, observedAtMs = null, comparedFromMs = null } = options
  if (!previous || !current) return EMPTY
  if (previous.width !== current.width || previous.height !== current.height || previous.stride !== current.stride) return EMPTY

  const steering = deriveSteeringFlow(previous, current, settings)
  const field = deriveMotionField(previous, current, steering, settings)
  if (!field.length) return EMPTY
  const smoothed = smoothMotionField(field, settings)
  const edge = selectLeadingEdge(smoothed, current, settings)
  return motionVectorsToGeoJSON(edge, {
    gridToLatLon,
    workStride: current.stride,
    frameIntervalMs: settings.frameIntervalMs,
    observedAtMs,
    comparedFromMs,
  })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion.test.js`
Expected: PASS, 5개 테스트 전부.

- [ ] **Step 5: 프로세서를 배선한다**

`backend/src/processors/radar-echo-processor.js`:

1. 14행 `const MOTION_ENABLED = false;`를 지운다.
2. import를 `import { createMotionInput, deserializeMotionInput, deriveMotionGeoJSON, serializeMotionInput } from './radar-motion.js';`로 바꾼다.
3. `attachMotionFrame`에서 `deriveObservedMotion` 호출을 아래로 교체한다.

```js
    const geojson = deriveMotionGeoJSON(previousInput, currentInput, {
      settings: {
        ...config.radar_echo_motion,
        workStride: config.radar_echo_motion.work_stride,
        largeBoxKm: config.radar_echo_motion.large_box_km,
        smallBoxKm: config.radar_echo_motion.small_box_km,
        spacingKm: config.radar_echo_motion.spacing_km,
        maxSpeedKmh: config.radar_echo_motion.max_speed_kmh,
        edgeLookaheadKm: config.radar_echo_motion.edge_lookahead_km,
        minReflectivity: config.radar_echo_motion.min_reflectivity,
        frameIntervalMs: 5 * 60 * 1000,
      },
      gridToLatLon,
      observedAtMs,
      comparedFromMs,
    });
```

4. `MOTION_MAX_CALCULATION_MS` 상수를 `config.radar_echo_motion.max_calculation_ms`로 바꾼다.
5. `renderFrame` 안의 `MOTION_ENABLED ? ... : null`을 `config.radar_echo_motion.enabled ? ... : null`로 바꾸고, `createMotionInput` 호출의 `stride`를 `config.radar_echo_motion.work_stride`로 넘긴다.

- [ ] **Step 6: 발행 테스트를 갱신하고 전체 테스트를 돌린다**

`backend/test/radar-echo-motion-publication.test.js`에서 GeoJSON 기하가 `Point`임을 확인하도록 단언을 고친다. 계산 실패가 PNG·메타 발행을 막지 않는다는 기존 단언은 유지한다.

Run: `cd backend && npm test`
Expected: PASS. 실패 0건.

- [ ] **Step 7: Commit**

```bash
git add backend/src/processors/radar-motion.js backend/src/processors/radar-echo-processor.js backend/test/radar-motion.test.js backend/test/radar-echo-motion-publication.test.js
git commit -m "feat(motion): publish leading-edge arrows and drop the disabled flag"
```

---

### Task 7: 프론트엔드 모델 — 플래그 제거와 형태 확정

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js:12,220-234`
- Test: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`

**Interfaces:**
- Produces: `model.radarMotion` — `{ visible, stale, frameTm, dataUrl, observedAtMs, comparedFromMs }`. Task 8이 소비한다.
- `RADAR_MOTION_ENABLED` 내보내기를 제거한다. 이 상수를 참조하는 곳이 없어야 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`weatherOverlayModel.test.js`에 덧붙인다.

```js
test('레이더가 켜져 있고 시각이 정확히 맞으면 이동 화살표가 보인다', () => {
  const observedAtMs = Date.UTC(2026, 6, 26, 3, 0)
  const model = buildWeatherOverlayModel({
    radarFrame: {
      tm: '202607261200',
      motion: { observedAtMs, comparedFromMs: observedAtMs - 300000, path: '/data/radar/motion_korea_202607261200.geojson' },
    },
    visibility: { radar: true, radarMotion: true },
  })
  assert.equal(model.radarMotion.visible, true)
  assert.equal(model.radarMotion.dataUrl, '/data/radar/motion_korea_202607261200.geojson')
})

test('시각이 어긋난 이동 자료는 쓰지 않는다', () => {
  const model = buildWeatherOverlayModel({
    radarFrame: {
      tm: '202607261200',
      motion: { observedAtMs: Date.UTC(2026, 6, 26, 2, 55), comparedFromMs: 0, path: '/data/radar/motion_korea_202607261155.geojson' },
    },
    visibility: { radar: true, radarMotion: true },
  })
  assert.equal(model.radarMotion.visible, false)
  assert.equal(model.radarMotion.dataUrl, null)
})

test('레이더가 꺼져 있으면 이동 화살표도 숨는다', () => {
  const observedAtMs = Date.UTC(2026, 6, 26, 3, 0)
  const model = buildWeatherOverlayModel({
    radarFrame: { tm: '202607261200', motion: { observedAtMs, comparedFromMs: 0, path: '/x.geojson' } },
    visibility: { radar: false, radarMotion: true },
  })
  assert.equal(model.radarMotion.visible, false)
})
```

기존 테스트가 `buildWeatherOverlayModel`을 다른 인자 형태로 호출한다면 그 형태에 맞춘다. 파일 상단의 기존 호출부를 먼저 읽고 따를 것.

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `RADAR_MOTION_ENABLED`가 false라 `visible`이 항상 false.

- [ ] **Step 3: 구현**

`weatherOverlayModel.js` 12행 `export const RADAR_MOTION_ENABLED = false`를 삭제하고, 220–234행 블록을 아래로 바꾼다.

```js
  const radarMotion = {
    visible: Boolean(visibility.radarMotion && visibility.radar && hasExactMotion && !motionStale),
    stale: Boolean(motionStale),
    frameTm: radarFrame?.tm ?? null,
    dataUrl: hasExactMotion ? motion.path : null,
    observedAtMs: hasExactMotion ? motion.observedAtMs : null,
    comparedFromMs: hasExactMotion ? motion.comparedFromMs ?? null : null,
  }
```

`RADAR_MOTION_ENABLED`를 import하던 다른 파일이 있으면 함께 제거한다.

Run: `cd frontend && grep -rn "RADAR_MOTION_ENABLED" src/` — 결과가 없어야 한다.

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js
git commit -m "feat(motion): drive arrow visibility from the layer toggle, not a dead flag"
```

---

### Task 8: 프론트엔드 레이어 — 화살대 선 + 화살촉 심볼

**Files:**
- Modify (전면 교체): `frontend/src/features/weather-overlays/lib/radarMotionLayers.js`
- Modify (전면 교체): `frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:25-28,60-66,82-88,481`

**Interfaces:**
- Consumes: Task 7의 `model.radarMotion`, 백엔드 Point GeoJSON.
- Produces:
  - `RADAR_MOTION_SOURCE = 'kma-radar-motion'` — 서버가 준 Point.
  - `RADAR_MOTION_SHAFT_SOURCE = 'kma-radar-motion-shaft'` — 클라이언트가 만든 LineString.
  - `RADAR_MOTION_SHAFT_LAYER = 'kma-radar-motion-shaft'`
  - `RADAR_MOTION_ARROW_LAYER = 'kma-radar-motion-arrow'`
  - `buildMotionShaftGeoJSON(points) -> FeatureCollection<LineString>` — 순수 함수, 테스트 대상.
  - `syncRadarMotionLayer(map, model)`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`radarMotionLayers.test.js`를 아래로 교체한다.

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RADAR_MOTION_ARROW_LAYER, RADAR_MOTION_SHAFT_LAYER, RADAR_MOTION_SHAFT_SOURCE, RADAR_MOTION_SOURCE,
  buildMotionShaftGeoJSON, syncRadarMotionLayer,
} from './radarMotionLayers.js'

function fakeMap() {
  const sources = new Map(), layers = new Map(), images = new Set()
  return {
    sources, layers, images,
    getSource: (id) => sources.get(id),
    addSource: (id, spec) => sources.set(id, { ...spec, setData(data) { this.data = data } }),
    getLayer: (id) => layers.get(id),
    addLayer: (spec) => layers.set(spec.id, spec),
    setLayoutProperty: (id, key, value) => { const l = layers.get(id); if (l) l.layout = { ...l.layout, [key]: value } },
    hasImage: (id) => images.has(id),
    addImage: (id) => images.add(id),
    on: () => {},
  }
}

const point = (lon, lat, bearingDeg, speedKt) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: { bearingDeg, speedKt, correlation: 0.8, neighbourAgreement: 0.9 },
})

test('화살대는 방위와 속도로 5분 이동거리만큼 뻗는다', () => {
  const shafts = buildMotionShaftGeoJSON({ type: 'FeatureCollection', features: [point(127, 37, 90, 30)] })
  assert.equal(shafts.features.length, 1)
  const coords = shafts.features[0].geometry.coordinates
  assert.equal(shafts.features[0].geometry.type, 'LineString')
  assert.equal(coords.length, 2)
  assert.ok(coords[1][0] > coords[0][0], '동쪽이면 경도가 커져야 한다')
  assert.ok(Math.abs(coords[1][1] - coords[0][1]) < 0.01, '동쪽이면 위도는 거의 그대로')
})

test('속도가 빠를수록 화살대가 길다', () => {
  const slow = buildMotionShaftGeoJSON({ type: 'FeatureCollection', features: [point(127, 37, 90, 10)] })
  const fast = buildMotionShaftGeoJSON({ type: 'FeatureCollection', features: [point(127, 37, 90, 40)] })
  const span = (g) => g.features[0].geometry.coordinates[1][0] - g.features[0].geometry.coordinates[0][0]
  assert.ok(span(fast) > span(slow) * 3)
})

test('속도 0은 화살대를 만들지 않는다', () => {
  assert.deepEqual(buildMotionShaftGeoJSON({ type: 'FeatureCollection', features: [point(127, 37, 90, 0)] }).features, [])
})

test('두 레이어를 등록하고 화살촉에 symbol-placement를 주지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: true, dataUrl: null })
  assert.ok(map.getSource(RADAR_MOTION_SOURCE))
  assert.ok(map.getSource(RADAR_MOTION_SHAFT_SOURCE))
  const arrow = map.getLayer(RADAR_MOTION_ARROW_LAYER)
  assert.equal(arrow.type, 'symbol')
  assert.equal(arrow.layout['symbol-placement'], undefined, 'line-center 이중 회전을 막아야 한다')
  assert.deepEqual(arrow.layout['icon-rotate'], ['get', 'bearingDeg'])
  assert.equal(arrow.layout['icon-rotation-alignment'], 'map')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).type, 'line')
})

test('재동기화해도 소스·레이어가 중복되지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: true, dataUrl: null })
  syncRadarMotionLayer(map, { visible: true, dataUrl: null })
  assert.equal(map.sources.size, 2)
  assert.equal(map.layers.size, 2)
})

test('숨김이면 두 레이어 모두 none', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.equal(map.getLayer(RADAR_MOTION_ARROW_LAYER).layout.visibility, 'none')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).layout.visibility, 'none')
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/radarMotionLayers.test.js`
Expected: FAIL — `buildMotionShaftGeoJSON is not a function`

- [ ] **Step 3: 구현**

`radarMotionLayers.js`를 전면 교체한다.

```js
import { addOrUpdateGeoJsonSource, setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const RADAR_MOTION_SOURCE = 'kma-radar-motion'
export const RADAR_MOTION_SHAFT_SOURCE = 'kma-radar-motion-shaft'
export const RADAR_MOTION_SHAFT_LAYER = 'kma-radar-motion-shaft'
export const RADAR_MOTION_ARROW_LAYER = 'kma-radar-motion-arrow'

const ARROW_ICON_ID = 'radar-motion-arrowhead'
const EMPTY = { type: 'FeatureCollection', features: [] }
const FRAME_MINUTES = 5
const EARTH_KM = 6371.0088
const ARROW_RED = '#e11d2e'

const stateByMap = new WeakMap()

function getState(map) {
  let state = stateByMap.get(map)
  if (!state) {
    state = { dataUrl: null, points: EMPTY, visible: false, requestId: 0 }
    stateByMap.set(map, state)
  }
  return state
}

// 시작점에서 방위 bearingDeg로 distanceKm 떨어진 지점. 대권 항법 공식.
function destination(lon, lat, bearingDeg, distanceKm) {
  const toRad = Math.PI / 180
  const d = distanceKm / EARTH_KM
  const brg = bearingDeg * toRad
  const lat1 = lat * toRad, lon1 = lon * toRad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
  const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / toRad, lat2 / toRad]
}

// 화살대는 실제 좌표를 갖는다 — 확대하면 같이 커지므로 길이가 속도로 읽힌다.
export function buildMotionShaftGeoJSON(points) {
  const features = []
  for (const f of points?.features || []) {
    const speedKt = Number(f?.properties?.speedKt)
    const bearingDeg = Number(f?.properties?.bearingDeg)
    const start = f?.geometry?.coordinates
    if (!Number.isFinite(speedKt) || speedKt <= 0) continue
    if (!Number.isFinite(bearingDeg) || !Array.isArray(start)) continue
    const distanceKm = speedKt * 1.852 * (FRAME_MINUTES / 60)
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [start, destination(start[0], start[1], bearingDeg, distanceKm)] },
      properties: { bearingDeg, speedKt },
    })
  }
  return { type: 'FeatureCollection', features }
}

// 화살촉만 그리는 아이콘. 위(북)를 향하게 그려두고 bearingDeg로 회전시킨다.
function ensureArrowImage(map) {
  if (map.hasImage(ARROW_ICON_ID) || typeof document === 'undefined') return
  const size = 24
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d', { alpha: true })
  ctx.translate(size / 2, size / 2)
  ctx.fillStyle = ARROW_RED
  ctx.beginPath()
  ctx.moveTo(0, -8)
  ctx.lineTo(5.5, 5)
  ctx.lineTo(0, 2.5)
  ctx.lineTo(-5.5, 5)
  ctx.closePath()
  ctx.fill()
  const { data, width, height } = ctx.getImageData(0, 0, size, size)
  map.addImage(ARROW_ICON_ID, { data, width, height })
}

function ensureLayers(map) {
  addOrUpdateGeoJsonSource(map, RADAR_MOTION_SHAFT_SOURCE, EMPTY)
  addOrUpdateGeoJsonSource(map, RADAR_MOTION_SOURCE, EMPTY)
  ensureArrowImage(map)

  if (!map.getLayer(RADAR_MOTION_SHAFT_LAYER)) {
    map.addLayer({
      id: RADAR_MOTION_SHAFT_LAYER,
      type: 'line',
      source: RADAR_MOTION_SHAFT_SOURCE,
      slot: 'top',
      layout: { 'line-cap': 'round' },
      paint: { 'line-color': ARROW_RED, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 10, 2.4] },
    })
  }
  if (!map.getLayer(RADAR_MOTION_ARROW_LAYER)) {
    map.addLayer({
      id: RADAR_MOTION_ARROW_LAYER,
      type: 'symbol',
      source: RADAR_MOTION_SOURCE,
      slot: 'top',
      layout: {
        // symbol-placement를 지정하지 않는다(기본 point). 선 위 배치는 아이콘을 선
        // 방향으로 한 번 더 돌려 방위가 이중 적용된다.
        'icon-image': ARROW_ICON_ID,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 10, 1.1],
        'icon-rotate': ['get', 'bearingDeg'],
        'icon-rotation-alignment': 'map',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    })
  }
}

// 화살촉은 화살대 끝에 놓아야 한다. 서버 Point는 시작점이므로 끝점으로 옮겨 그린다.
function pointsAtArrowTip(points) {
  const features = []
  for (const f of points?.features || []) {
    const speedKt = Number(f?.properties?.speedKt)
    const bearingDeg = Number(f?.properties?.bearingDeg)
    const start = f?.geometry?.coordinates
    if (!Number.isFinite(speedKt) || speedKt <= 0 || !Number.isFinite(bearingDeg) || !Array.isArray(start)) continue
    const distanceKm = speedKt * 1.852 * (FRAME_MINUTES / 60)
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: destination(start[0], start[1], bearingDeg, distanceKm) },
      properties: f.properties,
    })
  }
  return { type: 'FeatureCollection', features }
}

function applyData(map, state) {
  const points = state.visible ? state.points : EMPTY
  map.getSource(RADAR_MOTION_SHAFT_SOURCE)?.setData(buildMotionShaftGeoJSON(points))
  map.getSource(RADAR_MOTION_SOURCE)?.setData(pointsAtArrowTip(points))
}

function loadData(map, state, dataUrl) {
  state.dataUrl = dataUrl
  const requestId = ++state.requestId
  fetch(dataUrl)
    .then((response) => (response.ok ? response.json() : EMPTY))
    .catch(() => EMPTY)
    .then((data) => {
      if (state.requestId !== requestId || state.dataUrl !== dataUrl) return
      state.points = data?.type === 'FeatureCollection' ? data : EMPTY
      applyData(map, state)
    })
}

export function syncRadarMotionLayer(map, model) {
  ensureLayers(map)
  const state = getState(map)
  state.visible = Boolean(model?.visible && model?.dataUrl)
  setMapLayerVisible(map, RADAR_MOTION_SHAFT_LAYER, state.visible)
  setMapLayerVisible(map, RADAR_MOTION_ARROW_LAYER, state.visible)

  if (model?.dataUrl && state.dataUrl !== model.dataUrl) loadData(map, state, model.dataUrl)
  applyData(map, state)
}
```

- [ ] **Step 4: 등록 배열을 갱신한다**

`weatherOverlayLayers.js`:
- 25–28행 import에 `RADAR_MOTION_SHAFT_LAYER`, `RADAR_MOTION_SHAFT_SOURCE`를 추가한다.
- `WEATHER_OVERLAY_SOURCE_IDS`(60행 부근)에 `RADAR_MOTION_SHAFT_SOURCE`를 추가한다.
- `WEATHER_OVERLAY_LAYER_IDS`(82행 부근)에 `RADAR_MOTION_SHAFT_LAYER`를 추가한다.

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/weather-overlays/lib/radarMotionLayers.js frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
git commit -m "feat(motion): draw red arrows as a scaled shaft plus a point-anchored head"
```

---

### Task 9: 범례와 토글

**Files:**
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Test: `frontend/src/features/weather-overlays/WeatherLegends.test.js`

**Interfaces:**
- Consumes: Task 7의 `model.radarMotion.visible`.
- Produces: 범례 항목 `{ key: 'radarMotion', title: '에코 이동', note: '길이 = 5분 이동거리 · 관측 기반, 예측 아님' }`.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`WeatherLegends.test.js`에 기존 `echoTopLegendVisible` 테스트와 같은 형식으로 덧붙인다.

```js
test('이동 화살표 범례는 켜졌을 때만 나온다', () => {
  const hidden = buildLegendEntries({ radarMotionLegendVisible: false })
  assert.ok(!hidden.some((e) => e.key === 'radarMotion'))

  const shown = buildLegendEntries({ radarMotionLegendVisible: true })
  const entry = shown.find((e) => e.key === 'radarMotion')
  assert.ok(entry)
  assert.match(entry.note, /5분 이동거리/)
  assert.match(entry.note, /예측 아님/)
})
```

기존 파일의 실제 헬퍼 이름과 호출 형태를 먼저 확인하고 맞춘다(`WeatherLegends.jsx` 311·328행 부근의 배열 조립부).

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `radarMotion` 항목이 없다.

- [ ] **Step 3: 구현**

`WeatherLegends.jsx`:
- props에 `radarMotionLegendVisible = false`를 추가한다(41·59행 부근의 기존 prop 목록 형식을 따른다).
- 311행 부근의 조기 반환 조건에 `&& !radarMotionLegendVisible`을 추가한다.
- 328행 부근 배열에 항목을 추가한다.

```jsx
    radarMotionLegendVisible && {
      key: 'radarMotion',
      title: '에코 이동',
      entries: [{ color: '#e11d2e', label: '이동 방향' }],
      note: '길이 = 5분 이동거리 · 관측 기반, 예측 아님',
    },
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/WeatherLegends.test.js
git commit -m "feat(motion): add the arrow legend and toggle"
```

---

### Task 10: 브라우저 계약과 실화면 확인

**Files:**
- Create: `frontend/verification/contracts/radar-motion.spec.mjs`

**Interfaces:**
- Consumes: Task 6이 발행하는 GeoJSON 형태, Task 8의 레이어 ID.

- [ ] **Step 1: 계약을 쓴다**

`map-base.spec.mjs`의 `installRadarMotionFixture` 형식을 따르되, **Point 기하**로 바꾼다.

```js
import { test, expect } from '../fixtures.mjs'

async function installMotionFixture(page) {
  const observedAtMs = Date.UTC(2026, 6, 26, 3, 0)
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO', tm: '202607261200',
      frames: [
        { tm: '202607261155', path: '/data/radar/echo_korea_202607261155.png', bounds: [[30, 120], [40, 130]] },
        {
          tm: '202607261200', path: '/data/radar/echo_korea_202607261200.png', bounds: [[30, 120], [40, 130]],
          motion: { tm: '202607261200', observedAtMs, comparedFromMs: observedAtMs - 300000, path: '/data/radar/motion_korea_202607261200.geojson' },
        },
      ],
    }),
  }))
  await page.route('**/data/radar/motion_korea_202607261200.geojson', (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0, 37.4] }, properties: { bearingDeg: 90, speedKt: 30, correlation: 0.8, neighbourAgreement: 0.9 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.4, 37.6] }, properties: { bearingDeg: 45, speedKt: 18, correlation: 0.6, neighbourAgreement: 0.7 } },
      ],
    }),
  }))
}

const layerState = (page, id) => page.evaluate((layerId) => {
  const map = window.__mapForTests
  if (!map?.getLayer(layerId)) return null
  return { visibility: map.getLayoutProperty(layerId, 'visibility') ?? 'visible', placement: map.getLayoutProperty(layerId, 'symbol-placement') ?? null }
}, id)

test.describe('레이더 에코 이동 화살표', () => {
  test.beforeEach(async ({ page }) => { await installMotionFixture(page) })

  test('레이더와 토글을 켜면 화살대와 화살촉이 모두 뜬다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /국내 레이더/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-shaft')).toMatchObject({ visibility: 'visible' })
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'visible' })
  })

  test('화살촉에 symbol-placement가 설정되지 않는다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /국내 레이더/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ placement: null })
  })

  test('토글을 끄면 두 레이어가 함께 숨는다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /국내 레이더/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-shaft')).toMatchObject({ visibility: 'none' })
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'none' })
  })

  test('이동 자료가 없는 시각에는 뜨지 않는다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /국내 레이더/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await page.keyboard.press('ArrowLeft') // 202607261155 — motion 없음
    await expect.poll(() => layerState(page, 'kma-radar-motion-shaft')).toMatchObject({ visibility: 'none' })
  })

  test('베이스맵을 바꿔도 레이어가 살아남고 중복되지 않는다', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /국내 레이더/ }).click()
    await page.getByRole('button', { name: /에코 이동/ }).click()
    await page.getByRole('button', { name: /위성/ }).click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'visible' })
  })
})
```

`window.__mapForTests` 노출 이름과 토글 버튼 접근명은 `echo-top.spec.mjs`에서 실제로 쓰는 것을 확인해 맞춘다.

- [ ] **Step 2: 계약을 돌린다**

Run: `cd frontend && npm run dev:contract -- --grep "레이더 에코 이동 화살표"`
Expected: 5개 테스트 PASS.

- [ ] **Step 3: 실화면 스크린샷을 남긴다**

3개 뷰포트(1280/1024/375)에서 화살표가 보이는 화면을 캡처해 `artifacts/responsive-screenshots/radar-motion/<timestamp>/`에 저장하고, 명령·뷰포트·관찰 내용을 `README.md`로 남긴다. 절차는 `docs/operations/dev-server-and-capture.md`를 따른다.

- [ ] **Step 4: 사용자에게 밀도를 확인받는다**

스크린샷을 보여주고 화살표 밀도가 적절한지 확인받는다. 조밀하거나 성기면 `config.radar_echo_motion.spacing_km`만 조정한다(기본 8). 스펙이 이 확인을 요구한다.

- [ ] **Step 5: 전체 검증과 커밋**

Run: `cd backend && npm test && cd ../frontend && npm test`
Expected: 양쪽 모두 실패 0건.

```bash
git add frontend/verification/contracts/radar-motion.spec.mjs
git commit -m "test(motion): add the browser contract for the arrow layers"
```

- [ ] **Step 6: 그래프 갱신**

Run: `graphify update .`

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 담당 |
|---|---|
| 앞면 판정 6 km | Task 5 |
| MTREC 150 km 지향류 | Task 3 |
| MTREC 20 km 국지 + 합성 + 평활화 | Task 4 |
| 상관계수 척도 | Task 3 (`boxCorrelation`) |
| 최대속도 100 km/h | Task 3 (`searchRadiusCells`) |
| 소수점 변위 보정 | Task 4 (`subCellPeak`), Task 1에서 효과 측정 |
| 품질 지표를 싣되 거르지 않음 | Task 5 (`motionVectorsToGeoJSON` 속성) |
| Point + 방위 계약 | Task 5, Task 8 |
| 설정값 8개 | Task 2 |
| 화살대 실제 축척 비례 | Task 8 (`buildMotionShaftGeoJSON`) |
| `symbol-placement` 미지정 | Task 8 구현 + Task 8·10 단언 |
| 시각 정확 일치 시에만 표시 | Task 7, Task 10 |
| 실패 시 레이더 발행 무영향 | Task 6 Step 6 |
| 약한 테스트 단언 교체 | Task 6 Step 1 |
| 측정 게이트 | Task 1 |
| 밀도 육안 확인 | Task 10 Step 4 |

**미결 의존성:** Task 1의 결과가 Task 3–6의 채택 여부를 좌우한다. Task 1 Step 4의 보고 없이 Task 3으로 넘어가지 않는다.

**타입 일관성:** 벡터 객체는 전 구간 `{ col, row, dx, dy, correlation, neighbourAgreement? }`로 통일했다. 격자는 `{ width, height, stride, values }`. `gridToLatLon`은 항상 원본 0.5 km 좌표를 받는다(Task 5에서 `col * workStride`로 변환).
