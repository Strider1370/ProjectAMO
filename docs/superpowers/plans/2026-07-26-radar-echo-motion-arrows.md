# 레이더 에코 이동 화살표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레이더 에코의 다가오는 앞면을 따라 일정 간격으로 빨간 이동 화살표를 지도에 표시한다.

**Architecture:** 백엔드가 5분마다 두 프레임을 MTREC 2단계(150 km 지향류 → 20 km 국지 움직임 → 합성 → 평활화)로 추적하고, 앞면 벡터만 골라 Point GeoJSON으로 발행한다. 프론트엔드는 그 점에서 화살대 LineString을 만들어 선 레이어로, 화살촉은 끝점 심볼 레이어로 그린다. 토글 UI·상태 훅·계약은 이미 트리에 있으므로 되살려 쓴다.

**Tech Stack:** Node 22 (ESM, `node:test`), Express, Mapbox GL JS v3, React 19, Playwright.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-26-radar-echo-motion-arrows-design.md`. 충돌 시 스펙이 우선한다.
- Linux 전용. `git`/`npm`/`node`를 Linux 셸에서만 실행한다.
- 작업 격자 2 km(`work_stride: 4`), 큰 덩어리 150 km, 작은 덩어리 20 km, 벡터 간격 8 km, 최대속도 100 km/h, 앞면 판정 6 km, 최소 표시 속도 3 kt.
- 유사도는 **피어슨 상관계수**. 절대차이 합(SAD)을 쓰지 않는다.
- **no-data(`-25000`)는 계산 전에 0으로 클램프한다.** 작업 격자의 89~91%가 no-data이고 그 무늬는 프레임 간 98.8% 동일하다. 클램프 없이는 정합이 고정 무늬에 끌려간다.
- 1차에서는 품질 필터를 걸지 않는다. `correlation`·`neighbourAgreement`는 속성으로 싣기만 한다.
- 화살촉 심볼에 `symbol-placement`를 지정하지 않는다(기본 `point`).
- 화살표 색 `#e11d2e`. 두 레이어 모두 `slot: 'top'`.
- 계산 시간 초과는 **루프 안에서** 확인해 즉시 중도 포기한다. 이동 계산 실패가 레이더 PNG·메타 발행을 막지 않는다.
- 표시 여부의 단일 소유자는 `useRadarMotionOverlay` 훅이다. 모델에 별도 가시성 키를 만들지 않는다.
- 한국어 주석·문자열. UTF-8. `docs/policies/encoding-safety.md`를 따른다.
- 백엔드 테스트 `cd backend && npm test`. 프론트 단위 `cd frontend && npm test`. 계약 `cd frontend && npm run dev:contract -- --grep <pattern>`.

## 확인된 기존 자산 — 새로 만들지 말 것

리뷰에서 실측 확인했다. 아래는 이미 온전하며 플래그 하나에만 막혀 있다.

| 자산 | 위치 | 상태 |
|---|---|---|
| 토글 버튼 `이동 화살표 표시` | `WeatherLegends.jsx:102-118`(데스크톱), `:339-352`(모바일) | 완성. `aria-pressed` 있음 |
| 표시 상태 훅 | `useRadarMotionOverlay.js` | 완성. 레이더 끄면 자동 해제 |
| MapView 배선 | `MapView.jsx:714-717, 883-885, 1631-1636` | 완성. 모델의 `visible`을 훅 값으로 덮어씀 |
| 모델의 `radarMotion` 블록 | `weatherOverlayModel.js:220-234` | `RADAR_MOTION_ENABLED`만 제거하면 됨 |
| 토글 계약 | `map-base.spec.mjs:62-74` | 존재. 단 GeoJSON 픽스처가 옛 LineString이라 갱신 필요 |
| 테스트용 지도 핸들 | `MapView.jsx:1126` `window.__map` (DEV 전용) | `__mapForTests`가 **아님** |

**죽은 플래그는 3개다:** `radar-echo-processor.js:14` `MOTION_ENABLED`, `weatherOverlayModel.js:12` `RADAR_MOTION_ENABLED`, `WeatherLegends.jsx:83` `radarMotionEnabled`.

## File Structure

**Create**
- `backend/src/processors/radar-motion-model.js` — 순수 계산. 상관계수, 지향류, 국지 벡터장, 평활화, 앞면 판정, GeoJSON 변환.
- `backend/test/radar-motion-model.test.js`
- `backend/scripts/measure-motion-accuracy.mjs` — 게이트 A·B 공용 측정 스크립트.
- `frontend/verification/contracts/radar-motion.spec.mjs`

**Modify**
- `backend/src/config.js` — `radar_echo_motion` 절.
- `backend/src/processors/radar-motion.js` — 클램프, 오케스트레이션. `deriveObservedMotion` 제거.
- `backend/src/processors/radar-echo-processor.js` — 플래그 제거, `attachMotionFrame` 갱신.
- `backend/test/radar-motion.test.js`, `backend/test/radar-echo-motion-publication.test.js`
- `frontend/src/features/weather-overlays/lib/radarMotionLayers.js` + `.test.js` — 전면 교체.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — 소스·레이어 ID 등록.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` + `.test.js`
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` + `.test.js`
- `frontend/verification/contracts/map-base.spec.mjs` — 픽스처를 Point로.
- `docs/policies/verification/contracts.md` — 계약 등록.

---

### Task 1: no-data 클램프와 게이트 A 측정

스펙의 게이트 A다. **이 태스크의 status 문서 없이 Task 3을 시작하지 않는다.** Task 3 Step 1이 그 존재를 강제한다.

클램프를 먼저 넣는다. 클램프 없이 잰 수치는 고정 무늬에 오염되어 방식을 구분하지 못한다.

**Files:**
- Modify: `backend/src/processors/radar-motion.js` (`createMotionInput`)
- Create: `backend/scripts/measure-motion-accuracy.mjs`
- Create: `docs/superpowers/status/radar-echo-motion-arrows.status.md`
- Test: `backend/test/radar-motion.test.js`

**Interfaces:**
- Produces: `createMotionInput(refl, geometry, options)` — 기존 시그니처 유지, no-data를 0으로 클램프. `{ width, height, stride, values: Int16Array, tm }`.

- [ ] **Step 1: 클램프 테스트를 쓴다**

`backend/test/radar-motion.test.js` 맨 위에 덧붙인다(기존 테스트는 Task 7에서 교체한다).

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createMotionInput } from '../src/processors/radar-motion.js'

test('no-data(-25000)는 0으로 클램프된다', () => {
  // 4x4 블록 하나는 전부 no-data, 하나는 에코.
  const nx = 8, ny = 4
  const refl = new Int16Array(nx * ny).fill(-25000)
  for (let y = 0; y < 4; y += 1) for (let x = 4; x < 8; x += 1) refl[y * nx + x] = 3000

  const input = createMotionInput(refl, { nx, ny }, { stride: 4 })
  assert.equal(input.values[0], 0, 'no-data 블록은 0이어야 한다')
  assert.equal(input.values[1], 3000, '에코 블록은 그대로여야 한다')
})

test('no-data와 약한 에코가 섞인 블록은 에코 값을 쓴다', () => {
  const nx = 4, ny = 4
  const refl = new Int16Array(nx * ny).fill(-25000)
  refl[0] = 800
  const input = createMotionInput(refl, { nx, ny }, { stride: 4 })
  assert.equal(input.values[0], 800)
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion.test.js`
Expected: FAIL — `input.values[0]`이 `-25000`.

- [ ] **Step 3: 클램프를 넣는다**

`backend/src/processors/radar-motion.js`의 `createMotionInput` 안, `values[row * width + col] = max` 줄을 바꾼다. 파일 상단에 상수를 둔다.

```js
// KMA HSR 합성 격자의 no-data. 실측상 작업 격자의 89~91%가 이 값이고 프레임 간
// 98.8% 동일한 고정 무늬라, 클램프하지 않으면 정합이 에코가 아니라 무늬에 끌려간다.
const NO_DATA = -25000
```

```js
      values[row * width + col] = max <= NO_DATA ? 0 : max
```

`MOTION_DEFAULTS`는 Task 7에서 제거하므로 여기서는 손대지 않는다.

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion.test.js`
Expected: PASS.

- [ ] **Step 5: 측정 스크립트를 만든다**

`backend/scripts/measure-motion-accuracy.mjs`. `backend/scripts/probe-radar-qcd-sites.mjs`의 형식(최상단 ESM, `config` 직접 import, 표준출력)을 따른다.

정답 정의: 프레임 T-5·T로 구한 화살표를 프레임 T에 적용해 T+5를 예측하고, 그 국소 패치가 실제 T+5 관측과 **"안 움직인다고 가정"보다 잘 맞으면 그 화살표는 옳다.** 정답이 실제 관측이므로 조작 여지가 없다.

```js
// 실제 강수 사례에서 개별 화살표의 정오답을 실측한다. 합성 데이터를 쓰지 않는다.
// 게이트 A: --mode=baseline (기본). 게이트 B: --mode=mtrec.
import config from '../src/config.js'
import { parseRadarBinary } from '../src/parsers/radar-echo-parser.js'
import { fetchWithTimeout } from '../src/lib/fetchWithTimeout.js'
import { createMotionInput } from '../src/processors/radar-motion.js'

const CASES = ['202607180635', '202607180035', '202607210335', '202607200935']
const STRIDE = 4
const CELL_KM = STRIDE * 0.5
const MIN_REFL = 2000
const PATCH = 6
const NO_DATA = -25000

const mode = (process.argv.find((a) => a.startsWith('--mode=')) || '--mode=baseline').split('=')[1]

const pad = (n) => String(n).padStart(2, '0')
const tmAt = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}` }
const tmToMs = (tm) => Date.UTC(+tm.slice(0, 4), +tm.slice(4, 6) - 1, +tm.slice(6, 8), +tm.slice(8, 10), +tm.slice(10, 12))

async function fetchGrid(tm, { clamp }) {
  const url = `${config.api.radar_url}?${new URLSearchParams({
    tm, data: 'bin', cmp: config.radar_echo.cmp, authKey: config.api.radar_satellite_auth_key,
  })}`
  const res = await fetchWithTimeout(url, config.radar_echo.timeout_ms)
  if (!res.ok) return null
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 10000 || buf[0] !== 0x1f || buf[1] !== 0x8b) return null
  const { refl, nx, ny } = parseRadarBinary(buf)
  const grid = createMotionInput(refl, { nx, ny }, { stride: STRIDE, tm })
  if (clamp) return grid
  // 클램프 효과를 재기 위해 원본 no-data를 되살린 사본도 만든다.
  const values = Int16Array.from(grid.values)
  const width = Math.ceil(nx / STRIDE)
  for (let row = 0; row < grid.height; row += 1) {
    for (let col = 0; col < grid.width; col += 1) {
      let max = -32768
      for (let y = row * STRIDE; y < Math.min((row + 1) * STRIDE, ny); y += 1) {
        for (let x = col * STRIDE; x < Math.min((col + 1) * STRIDE, nx); x += 1) max = Math.max(max, refl[y * nx + x])
      }
      values[row * width + col] = max
    }
  }
  return { ...grid, values }
}

const at = (g, x, y) => (x < 0 || y < 0 || x >= g.width || y >= g.height) ? 0 : g.values[y * g.width + x]

function sad(a, b, ax, ay, bx, by, half) {
  let sum = 0, n = 0
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) { sum += Math.abs(at(a, ax + dx, ay + dy) - at(b, bx + dx, by + dy)); n += 1 }
  }
  return sum / n
}

const parab = (m, c, p) => { const d = m - 2 * c + p; return d <= 0 ? 0 : Math.max(-0.5, Math.min(0.5, 0.5 * (m - p) / d)) }

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
  return {
    ...best,
    subDx: best.dx + parab(get(best.dx - 1, best.dy), best.s, get(best.dx + 1, best.dy)),
    subDy: best.dy + parab(get(best.dx, best.dy - 1), best.s, get(best.dx, best.dy + 1)),
  }
}

function scoreCase(g1, g2, g3, useSub) {
  const search = Math.ceil(100 * (5 / 60) / CELL_KM)
  let total = 0, correct = 0
  for (let y = PATCH; y < g2.height - PATCH; y += 4) {
    for (let x = PATCH; x < g2.width - PATCH; x += 4) {
      if (at(g2, x, y) < MIN_REFL) continue
      const v = bestOffset(g1, g2, x, y, search, PATCH)
      const dx = Math.round(useSub ? v.subDx : v.dx)
      const dy = Math.round(useSub ? v.subDy : v.dy)
      total += 1
      if (sad(g2, g3, x - dx, y - dy, x, y, PATCH) < sad(g2, g3, x, y, x, y, PATCH)) correct += 1
    }
  }
  return { total, correct }
}

console.log(`모드: ${mode}`)
for (const tm of CASES) {
  const base = tmToMs(tm)
  const clamped = [], raw = []
  for (const step of [-10, -5, 0]) {
    clamped.push(await fetchGrid(tmAt(base + step * 60000), { clamp: true }))
    raw.push(await fetchGrid(tmAt(base + step * 60000), { clamp: false }))
  }
  if (clamped.some((g) => !g)) { console.log(`${tm}: 프레임 수신 실패, 건너뜀`); continue }
  const pct = (r) => `${(r.correct / r.total * 100).toFixed(1)}%`
  const c = scoreCase(...clamped, false)
  const cSub = scoreCase(...clamped, true)
  const r = scoreCase(...raw, false)
  console.log(`${tm}  화살표 ${c.total}개 | 클램프+정수 ${pct(c)} | 클램프+소수점 ${pct(cSub)} | 클램프없음 ${pct(r)}`)
}
```

- [ ] **Step 6: 실행하고 수치를 기록**

Run: `cd backend && node --env-file=../.env scripts/measure-motion-accuracy.mjs`
Expected: 4개 사례에 대해 화살표 개수와 정확도 세 열. 네트워크 필요.

- [ ] **Step 7: status 문서를 만든다**

`docs/superpowers/status/radar-echo-motion-arrows.status.md`를 만들고 출력을 그대로 붙인 뒤 해석을 적는다. **Task 3이 이 파일의 존재와 `## 게이트 A 결과` 제목을 확인하므로 제목을 정확히 쓴다.**

```markdown
# 레이더 에코 이동 화살표 — 상태

## 게이트 A 결과

측정일: <YYYY-MM-DD>
명령: `node --env-file=../.env scripts/measure-motion-accuracy.mjs`

<출력 붙여넣기>

### 해석
- 기존 1단계 방식 개별 정확도: <값>
- 소수점 보정 효과: <값>
- no-data 클램프 효과: <값>

## 게이트 B 결과

아직 측정하지 않음.
```

- [ ] **Step 8: 사용자에게 보고하고 진행 여부를 확인받는다**

스펙이 요구하는 판단 지점이다. 정확도가 이미 충분히 높으면 MTREC 채택을 재검토한다.

- [ ] **Step 9: 전체 테스트와 커밋**

Run: `cd backend && npm test`
Expected: 실패 0건.

```bash
git add backend/src/processors/radar-motion.js backend/test/radar-motion.test.js backend/scripts/measure-motion-accuracy.mjs docs/superpowers/status/radar-echo-motion-arrows.status.md
git commit -m "fix(motion): clamp radar no-data and measure per-arrow accuracy"
```

---

### Task 2: 설정 절 추가

**Files:**
- Modify: `backend/src/config.js` (`radar_echo` 절 뒤, 약 157행)

**Interfaces:**
- Produces: `config.radar_echo_motion`. Task 3–7이 사용한다.

- [ ] **Step 1: 설정 절을 추가**

`export const radar_echo = { ... }` 다음에 넣는다.

```js
// 레이더 에코 이동벡터 — MTREC 2단계 추적(Wang et al. 2013)의 추적 부분만 사용한다.
// 예측 영상은 만들지 않는다. 산출물은 앞면 화살표 GeoJSON이다.
export const radar_echo_motion = {
  enabled: process.env.RADAR_MOTION_ENABLED !== '0',
  work_stride: 4,         // HSR 0.5 km를 4칸씩 솎아 2 km 작업 격자를 만든다.
  large_box_km: 150,      // 지향류(종관규모). 논문이 100/150/200 중 150을 채택했다.
  small_box_km: 20,       // 국지 움직임(중규모).
  spacing_km: 8,          // 화살표 간격. 핀란드 기상청 운영값.
  max_speed_kmh: 100,     // 탐색 반경 R = v_max × Δt. 품질 필터가 아니라 계산의 정의역이다.
  min_speed_kt: 3,        // 이보다 느리면 방위가 무의미하므로 앞면 판정에서 제외한다.
  edge_lookahead_km: 6,   // 이 거리 앞에 에코가 없으면 앞면으로 본다.
  min_reflectivity: 2000, // 스케일 dBZ(×100).
  max_calculation_ms: 30000,
}
```

- [ ] **Step 2: 기본 내보내기에 등록**

파일 말미 `export default { ... }`의 `radar_echo_top,` 옆에 `radar_echo_motion,`을 추가한다.

- [ ] **Step 3: 로드 확인**

Run: `cd backend && node -e "import('./src/config.js').then(m => console.log(m.default.radar_echo_motion))"`
Expected: 위 키가 모두 담긴 객체.

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
- Consumes: 없음(순수 함수). **단 Task 1의 status 문서가 있어야 한다 — Step 1이 확인한다.**
- Produces:
  - `MOTION_MODEL_DEFAULTS` — `{ workStride, largeBoxKm, smallBoxKm, spacingKm, maxSpeedKmh, minSpeedKt, edgeLookaheadKm, minReflectivity, frameIntervalMs }`
  - `cellKm(settings) -> number`
  - `searchRadiusCells(settings) -> number`
  - `boxCorrelation(previous, current, prevCol, prevRow, currCol, currRow, halfBox, step) -> number|null`
  - `deriveSteeringFlow(previous, current, settings) -> { boxCells, cols, rows, dx: Int16Array, dy: Int16Array, correlation: Float32Array }`
  - `steeringAt(steering, col, row) -> { dx, dy }`

  격자 입력은 `createMotionInput` 산출물과 같은 `{ width, height, stride, values: Int16Array }`.

- [ ] **Step 1: 게이트 A를 확인한다 — 통과 못 하면 여기서 멈춘다**

Run:
```bash
cd /home/john_doe/ProjectAMO && grep -q '^## 게이트 A 결과' docs/superpowers/status/radar-echo-motion-arrows.status.md \
  && grep -q '기존 1단계 방식 개별 정확도: [0-9]' docs/superpowers/status/radar-echo-motion-arrows.status.md \
  && echo 'GATE A OK' || echo 'GATE A MISSING — STOP'
```
Expected: `GATE A OK`. `GATE A MISSING — STOP`이 나오면 **Task 1로 돌아간다.** 게이트 없이 진행하지 않는다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/test/radar-motion-model.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOTION_MODEL_DEFAULTS, boxCorrelation, cellKm, deriveSteeringFlow, searchRadiusCells, steeringAt,
} from '../src/processors/radar-motion-model.js'

// 매끈한 덩어리 몇 개를 놓고 통째로 옮긴 장을 만든다.
function fieldShifted(width, height, offsetX, offsetY) {
  const values = new Int16Array(width * height)
  const blobs = [
    { cx: 30, cy: 30, r: 9, peak: 5000 },
    { cx: 60, cy: 45, r: 11, peak: 6000 },
    { cx: 45, cy: 70, r: 8, peak: 4500 },
    { cx: 75, cy: 75, r: 10, peak: 5500 },
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

const BASE = { ...MOTION_MODEL_DEFAULTS, workStride: 4, frameIntervalMs: 300000, maxSpeedKmh: 100 }

test('cellKm은 작업 격자 한 칸의 km를 준다', () => {
  assert.equal(cellKm({ ...BASE, workStride: 4 }), 2)
  assert.equal(cellKm({ ...BASE, workStride: 2 }), 1)
})

test('탐색 반경은 최대속도와 프레임 간격에서 나온다', () => {
  // 100 km/h로 5분이면 8.33 km. 2 km 칸이면 5칸(올림).
  assert.equal(searchRadiusCells(BASE), 5)
})

test('같은 패턴의 상관계수는 1', () => {
  const a = fieldShifted(120, 120, 0, 0)
  assert.ok(boxCorrelation(a, a, 45, 45, 45, 45, 10, 1) > 0.999)
})

test('분산이 없는 상자는 null을 준다', () => {
  const flat = { width: 60, height: 60, stride: 4, values: new Int16Array(3600) }
  assert.equal(boxCorrelation(flat, flat, 30, 30, 30, 30, 10, 1), null)
})

test('표본이 너무 적게 남는 상자는 null을 준다', () => {
  const a = fieldShifted(120, 120, 0, 0)
  // 상자 대부분이 격자 밖으로 나가면 유효 표본이 절반 미만이 된다.
  assert.equal(boxCorrelation(a, a, -9, -9, -9, -9, 10, 1), null)
})

test('지향류는 내부 상자에서 참 변위를 되찾는다', () => {
  const previous = fieldShifted(120, 120, 0, 0)
  const current = fieldShifted(120, 120, 3, -2)
  // 120칸 격자에 60칸(=120km) 상자 → 2x2. (0,0) 상자는 온전히 격자 안에 있다.
  const settings = { ...BASE, largeBoxKm: 120 }
  const steering = deriveSteeringFlow(previous, current, settings)
  const { dx, dy } = steeringAt(steering, 20, 20)
  assert.ok(Math.abs(dx - 3) <= 1, `dx=${dx}, 기대 3±1`)
  assert.ok(Math.abs(dy - (-2)) <= 1, `dy=${dy}, 기대 -2±1`)
})

test('에코가 없으면 지향류는 0 벡터를 준다', () => {
  const empty = { width: 120, height: 120, stride: 4, values: new Int16Array(14400) }
  const steering = deriveSteeringFlow(empty, empty, { ...BASE, largeBoxKm: 120 })
  assert.deepEqual(steeringAt(steering, 20, 20), { dx: 0, dy: 0 })
})

test('steeringAt은 격자 밖 좌표를 가장자리 상자로 잘라낸다', () => {
  const a = fieldShifted(120, 120, 0, 0)
  const steering = deriveSteeringFlow(a, a, { ...BASE, largeBoxKm: 120 })
  assert.deepEqual(steeringAt(steering, -50, -50), steeringAt(steering, 0, 0))
  assert.deepEqual(steeringAt(steering, 9999, 9999), steeringAt(steering, 119, 119))
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: FAIL — `Cannot find module '../src/processors/radar-motion-model.js'`

- [ ] **Step 4: 최소 구현**

`backend/src/processors/radar-motion-model.js`:

```js
// MTREC(Wang et al. 2013, Adv. Atmos. Sci. 30(2):448-460) 추적 부분의 순수 계산.
// 논문의 이류·강수예측 부분은 채택하지 않는다 — 산출물은 벡터이지 예측 영상이 아니다.
// 격자는 { width, height, stride, values: Int16Array } 형태를 받는다.
// no-data는 이 파일에 오기 전에 createMotionInput이 0으로 클램프한다.

const HSR_CELL_KM = 0.5

export const MOTION_MODEL_DEFAULTS = Object.freeze({
  workStride: 4,
  largeBoxKm: 150,
  smallBoxKm: 20,
  spacingKm: 8,
  maxSpeedKmh: 100,
  minSpeedKt: 3,
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

// 피어슨 상관계수. 배열을 만들지 않고 한 번에 누적한다 — 호출 횟수가 10^7 규모라
// 표본마다 push하면 할당이 계산보다 비싸진다.
// step으로 큰 덩어리 내부를 솎아 본다.
export function boxCorrelation(previous, current, prevCol, prevRow, currCol, currRow, halfBox, step = 1) {
  let n = 0, sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0, considered = 0
  for (let dy = -halfBox; dy <= halfBox; dy += step) {
    for (let dx = -halfBox; dx <= halfBox; dx += step) {
      considered += 1
      const va = valueAt(previous, prevCol + dx, prevRow + dy)
      const vb = valueAt(current, currCol + dx, currRow + dy)
      if (va === null || vb === null) continue
      n += 1
      sumA += va; sumB += vb
      sumAA += va * va; sumBB += vb * vb; sumAB += va * vb
    }
  }
  // 잘린 상자는 표본이 적어 상관계수 분산이 커지고, 정규화 때문에 참 변위를 이길 수 있다.
  // 절반 미만이면 후보에서 제외한다.
  if (n < 9 || n * 2 < considered) return null
  const varA = sumAA - sumA * sumA / n
  const varB = sumBB - sumB * sumB / n
  if (varA <= 0 || varB <= 0) return null
  return (sumAB - sumA * sumB / n) / Math.sqrt(varA * varB)
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

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 8개 테스트 전부.

- [ ] **Step 6: Commit**

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
  - `deriveMotionField(previous, current, steering, settings, deadlineAtMs) -> Array<{ col, row, dx, dy, correlation }>` — `dx`/`dy`는 소수점 보정이 들어간 실수, 작업 격자 칸 단위. `deadlineAtMs`를 넘기면 초과 시 **루프 안에서 중도 포기하고 빈 배열**을 반환한다.
  - `smoothMotionField(vectors, settings) -> Array<{ col, row, dx, dy, correlation, neighbourAgreement }>`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`backend/test/radar-motion-model.test.js`에 덧붙인다. `fieldShifted`와 `BASE`를 재사용한다.

```js
import { deriveMotionField, smoothMotionField } from '../src/processors/radar-motion-model.js'

const FIELD = { ...BASE, largeBoxKm: 120, smallBoxKm: 20, spacingKm: 8, minReflectivity: 500 }

test('국지 벡터장은 과반이 참 변위 근처를 가리킨다', () => {
  const previous = fieldShifted(120, 120, 0, 0)
  const current = fieldShifted(120, 120, 3, -2)
  const steering = deriveSteeringFlow(previous, current, FIELD)
  const field = deriveMotionField(previous, current, steering, FIELD)

  assert.ok(field.length > 0, '벡터가 하나도 없으면 안 된다')
  // 하나라도 맞으면 통과하는 약한 단언을 쓰지 않는다.
  const close = field.filter((v) => Math.abs(v.dx - 3) <= 1 && Math.abs(v.dy - (-2)) <= 1)
  assert.ok(close.length / field.length > 0.7, `참 변위 근처 ${close.length}/${field.length}`)
})

test('소수점 보정이 들어가 정수가 아닌 변위가 나온다', () => {
  const steering = deriveSteeringFlow(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), FIELD)
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), steering, FIELD)
  assert.ok(field.some((v) => !Number.isInteger(v.dx) || !Number.isInteger(v.dy)))
})

test('에코가 없는 곳에는 벡터를 만들지 않는다', () => {
  const empty = { width: 120, height: 120, stride: 4, values: new Int16Array(14400) }
  const steering = deriveSteeringFlow(empty, empty, FIELD)
  assert.deepEqual(deriveMotionField(empty, empty, steering, FIELD), [])
})

test('마감시한이 지났으면 루프 안에서 포기하고 빈 배열을 준다', () => {
  const previous = fieldShifted(120, 120, 0, 0)
  const current = fieldShifted(120, 120, 3, -2)
  const steering = deriveSteeringFlow(previous, current, FIELD)
  const started = Date.now()
  const field = deriveMotionField(previous, current, steering, FIELD, Date.now() - 1)
  assert.deepEqual(field, [])
  assert.ok(Date.now() - started < 100, '전부 계산한 뒤 버리면 안 된다')
})

test('평활화는 튀는 벡터를 이웃 중앙값으로 끌어오고 일치도를 매긴다', () => {
  const vectors = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) vectors.push({ col: col * 4, row: row * 4, dx: 3, dy: -2, correlation: 0.9 })
  }
  const rogue = vectors.find((v) => v.col === 8 && v.row === 8)
  rogue.dx = -7
  rogue.dy = 6

  const smoothed = smoothMotionField(vectors, { ...FIELD, spacingKm: 8 })
  const fixed = smoothed.find((v) => v.col === 8 && v.row === 8)
  assert.equal(fixed.dx, 3)
  assert.equal(fixed.dy, -2)
  assert.ok(smoothed.every((v) => v.neighbourAgreement >= 0 && v.neighbourAgreement <= 1))
  // 튀던 벡터는 이웃 일치도가 낮게 기록되어야 한다 — 평활화 이전 값 기준.
  assert.ok(fixed.neighbourAgreement < 0.5, `일치도 ${fixed.neighbourAgreement}`)
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
// 입력은 최소점 기준이다(상관계수는 부호를 뒤집어 넘긴다).
function subCellPeak(minus, center, plus) {
  const denom = minus - 2 * center + plus
  // denom <= 0이면 볼록하지 않다 — 정점이 없거나 탐색 경계에 걸린 경우다. 보정하지 않는다.
  if (denom <= 0) return 0
  return Math.max(-0.5, Math.min(0.5, 0.5 * (minus - plus) / denom))
}

// MTREC 2·3단계 — 지향류에서 출발해 작은 덩어리로 국지 움직임을 구한다.
//
// ponytail: 논문은 이 단계 전에 준-라그랑주 이류로 영상 전체를 지향류만큼 밀어놓고
// 잔차에 대해 작은 덩어리를 적용한다. 여기서는 영상을 밀지 않고 탐색 시작점만
// 지향류로 옮긴다(수학적 근사, 훨씬 싸다). 정확도가 부족하면 정식 이류로 승격한다.
export function deriveMotionField(previous, current, steering, settings, deadlineAtMs = Infinity) {
  const km = cellKm(settings)
  const spacing = Math.max(1, Math.round(settings.spacingKm / km))
  const half = Math.max(1, Math.round(settings.smallBoxKm / km / 2))
  const local = Math.max(1, Math.ceil(searchRadiusCells(settings) / 2))
  const vectors = []

  for (let row = half; row < current.height - half; row += spacing) {
    // 마감시한은 바깥 루프마다 확인한다. 다 만든 뒤 버리면 5분 주기 수집이 밀린다.
    if (Date.now() >= deadlineAtMs) return []
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
// 일치도는 평활화 '이전' 값끼리 비교해야 튀던 벡터가 낮게 기록된다.
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
        dxs.push(n.dx); dys.push(n.dy) // 중앙값에는 자기 자신도 포함한다(표준 중앙값 필터).
        if (ox === 0 && oy === 0) continue
        total += 1
        const m1 = Math.hypot(v.dx, v.dy), m2 = Math.hypot(n.dx, n.dy)
        if (m1 < 0.25 || m2 < 0.25) { if (Math.abs(m1 - m2) < 0.5) agree += 1; continue }
        if ((v.dx * n.dx + v.dy * n.dy) / (m1 * m2) > 0.7) agree += 1 // 사잇각 약 45도 이내
      }
    }
    const neighbourAgreement = total ? agree / total : 0
    if (dxs.length < 3) return { ...v, neighbourAgreement }
    // 성분별 중앙값이다(벡터 중앙값이 아니다). 이웃에 없던 (dx,dy) 조합이 나올 수 있으나
    // 이 용도에서는 문제되지 않는다.
    dxs.sort((a, b) => a - b); dys.sort((a, b) => a - b)
    const mid = dxs.length >> 1
    return { ...v, dx: dxs[mid], dy: dys[mid], neighbourAgreement }
  })
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 13개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): add the 20 km local pass with sub-cell peak, smoothing and a deadline"
```

---

### Task 5: 앞면 판정과 GeoJSON 변환

**Files:**
- Modify: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: Task 4의 벡터 배열.
- Produces:
  - `selectLeadingEdge(vectors, current, settings) -> Array<same shape>`
  - `motionVectorsToGeoJSON(vectors, options) -> FeatureCollection` — `options`는 `{ gridToLatLon, workStride, frameIntervalMs }` **뿐이다.** 시각값은 메타 프레임이 갖고 있으므로 Feature에 싣지 않는다.
  - `gridToLatLon(x, y)`는 **원본 0.5 km 격자 좌표**를 받는다. `radar-echo-parser.js:40`의 동명 함수와 같은 규약이며, `+y`는 남쪽이다.
  - Feature 속성: `bearingDeg`(0–360 정수), `speedKt`(정수), `correlation`, `neighbourAgreement`(각 소수 2자리).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { motionVectorsToGeoJSON, selectLeadingEdge } from '../src/processors/radar-motion-model.js'

const EDGE = { ...BASE, edgeLookaheadKm: 6, minReflectivity: 2000, minSpeedKt: 3, spacingKm: 8, smallBoxKm: 20 }

// 왼쪽 절반만 에코인 장. 동쪽(+x)으로 움직이면 오른쪽 경계가 앞면이다.
function halfField() {
  const width = 40, height = 20
  const values = new Int16Array(width * height)
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < 20; col += 1) values[row * width + col] = 5000
  }
  return { width, height, stride: 4, values }
}

test('앞면만 남기고 에코 내부와 후면은 버린다', () => {
  const current = halfField()
  const mk = (col) => ({ col, row: 10, dx: 2, dy: 0, correlation: 0.9, neighbourAgreement: 1 })
  const kept = selectLeadingEdge([mk(5), mk(19), mk(10)], current, EDGE)
  assert.deepEqual(kept.map((v) => v.col), [19])
})

test('최소 속도 미만은 앞면 판정에서 제외한다', () => {
  const current = halfField()
  // 2km 칸, 5분 → 1칸이 약 12.9 kt. 0.2칸은 약 2.6 kt로 3 kt 미만이다.
  const slow = { col: 19, row: 10, dx: 0.2, dy: 0, correlation: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([slow], current, EDGE), [])
})

test('격자 밖을 내다보는 벡터는 앞면으로 치지 않는다', () => {
  const current = halfField()
  // col 39는 오른쪽 끝. 3칸 앞은 격자 밖이다 — 에코 없음으로 오인하면 안 된다.
  const atEdge = { col: 39, row: 10, dx: 2, dy: 0, correlation: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([atEdge], current, EDGE), [])
})

test('GeoJSON은 Point와 방위·속도를 낸다', () => {
  const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 - y * 0.001 })
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, correlation: 0.812, neighbourAgreement: 0.875 }],
    { gridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  assert.equal(geojson.type, 'FeatureCollection')
  const f = geojson.features[0]
  assert.equal(f.geometry.type, 'Point')
  assert.ok(Math.abs(f.properties.bearingDeg - 90) < 2, `동쪽이어야 하는데 ${f.properties.bearingDeg}`)
  assert.equal(f.properties.speedKt, 19) // 3칸 × 2km ÷ (5/60)h ÷ 1.852
  assert.equal(f.properties.correlation, 0.81)
  assert.equal(f.properties.neighbourAgreement, 0.88)
})

test('남쪽으로 가는 벡터는 방위 180 근처를 낸다', () => {
  const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 - y * 0.001 })
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 0, dy: 3, correlation: 0.8, neighbourAgreement: 0.8 }],
    { gridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  assert.ok(Math.abs(geojson.features[0].properties.bearingDeg - 180) < 2)
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
  const km = cellKm(settings)
  const lookahead = settings.edgeLookaheadKm / km
  const hours = settings.frameIntervalMs / 3600000
  const minCells = settings.minSpeedKt * 1.852 * hours / km

  return vectors.filter((v) => {
    const mag = Math.hypot(v.dx, v.dy)
    if (mag < minCells) return false
    const col = Math.round(v.col + (v.dx / mag) * lookahead)
    const row = Math.round(v.row + (v.dy / mag) * lookahead)
    const ahead = valueAt(current, col, row)
    // 격자 밖(null)은 '에코 없음'이 아니라 '모름'이다. 앞면으로 치지 않는다.
    if (ahead === null) return false
    return ahead < settings.minReflectivity
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
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [start.lon, start.lat] },
      properties: {
        bearingDeg: Math.round(bearingDegrees(start, end)),
        speedKt: Math.round(Math.hypot(v.dx, v.dy) * km / hours / 1.852),
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
Expected: PASS, 19개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): select the leading edge and emit point GeoJSON"
```

---

### Task 6: 게이트 B — MTREC 정확도 측정

스펙의 게이트 B다. **발행 배선(Task 7) 전에 잰다.** 개선이 없으면 채택을 재검토한다.

**Files:**
- Modify: `backend/scripts/measure-motion-accuracy.mjs` (`--mode=mtrec` 분기 추가)
- Modify: `docs/superpowers/status/radar-echo-motion-arrows.status.md`

**Interfaces:**
- Consumes: Task 3–5의 model 함수.

- [ ] **Step 1: mtrec 모드를 추가한다**

`measure-motion-accuracy.mjs`에 import와 분기를 넣는다. 정오답 판정(`sad(...) < sad(...)`)은 게이트 A와 **동일하게 유지한다** — 그래야 두 수치를 비교할 수 있다.

```js
import {
  MOTION_MODEL_DEFAULTS, deriveMotionField, deriveSteeringFlow, smoothMotionField,
} from '../src/processors/radar-motion-model.js'

const MTREC_SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: STRIDE, largeBoxKm: 150, smallBoxKm: 20, spacingKm: 8,
  maxSpeedKmh: 100, minReflectivity: MIN_REFL, frameIntervalMs: 300000,
}

function scoreMtrec(g1, g2, g3) {
  const steering = deriveSteeringFlow(g1, g2, MTREC_SETTINGS)
  const field = smoothMotionField(deriveMotionField(g1, g2, steering, MTREC_SETTINGS), MTREC_SETTINGS)
  let correct = 0
  for (const v of field) {
    const dx = Math.round(v.dx), dy = Math.round(v.dy)
    if (sad(g2, g3, v.col - dx, v.row - dy, v.col, v.row, PATCH) < sad(g2, g3, v.col, v.row, v.col, v.row, PATCH)) correct += 1
  }
  return { total: field.length, correct }
}
```

각 사례 루프에서 `mode === 'mtrec'`이면 `scoreMtrec(...clamped)`를, 아니면 기존 세 열을 출력하도록 분기한다. mtrec 모드에서는 계산 시간도 함께 찍는다.

```js
  if (mode === 'mtrec') {
    const started = Date.now()
    const m = scoreMtrec(...clamped)
    console.log(`${tm}  화살표 ${m.total}개 | MTREC 2단계 ${pct(m)} | 계산 ${((Date.now() - started) / 1000).toFixed(1)}초`)
    continue
  }
```

- [ ] **Step 2: 품질 지표 판별력을 함께 낸다**

`scoreMtrec`을 확장해, 정답표를 기준으로 `correlation`과 `neighbourAgreement` 상·하위 25%의 정답률을 출력한다. 스펙 게이트 B의 5번 항목이다.

```js
function reportDiscrimination(field, judged) {
  for (const key of ['correlation', 'neighbourAgreement']) {
    const sorted = [...judged].sort((a, b) => b.v[key] - a.v[key])
    const q = Math.max(1, Math.floor(sorted.length / 4))
    const rate = (arr) => `${(arr.filter((r) => r.ok).length / arr.length * 100).toFixed(0)}%`
    console.log(`    ${key}: 상위25% ${rate(sorted.slice(0, q))} / 하위25% ${rate(sorted.slice(-q))}`)
  }
}
```

`scoreMtrec`이 `{ total, correct, judged }`를 반환하도록 고치고(`judged`는 `{ v, ok }` 배열), 출력 뒤에 `reportDiscrimination`을 호출한다.

- [ ] **Step 3: 두 모드를 모두 돌린다**

Run:
```bash
cd backend
node --env-file=../.env scripts/measure-motion-accuracy.mjs
node --env-file=../.env scripts/measure-motion-accuracy.mjs --mode=mtrec
```
Expected: 게이트 A 세 열, 게이트 B 정확도·시간·판별력.

**계산 시간이 `max_calculation_ms`(30초)를 넘으면 Task 7 전에 보고한다.** 그 경우 `spacing_km`을 키우거나 `large_box_km` 표본 간격을 늘려 조정한다.

- [ ] **Step 4: status를 갱신하고 사용자에게 보고**

`## 게이트 B 결과` 절에 출력을 붙이고, 게이트 A 대비 개선 폭을 적는다. **개선이 없으면 MTREC 채택을 재검토하고 사용자 판단을 받는다.**

- [ ] **Step 5: Commit**

```bash
git add backend/scripts/measure-motion-accuracy.mjs docs/superpowers/status/radar-echo-motion-arrows.status.md
git commit -m "test(motion): measure MTREC accuracy and quality-metric discrimination"
```

---

### Task 7: 발행 배선과 죽은 플래그 3개 제거

**Files:**
- Modify: `backend/src/processors/radar-motion.js`
- Modify: `backend/src/processors/radar-echo-processor.js:14,143-172,182-200`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js:12,228-233`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx:83`
- Test: `backend/test/radar-motion.test.js`, `backend/test/radar-echo-motion-publication.test.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`, `frontend/src/features/weather-overlays/WeatherLegends.test.js`
- Modify: `frontend/verification/contracts/map-base.spec.mjs:15-19`

**Interfaces:**
- Produces: `deriveMotionGeoJSON(previous, current, options) -> FeatureCollection`. `options`는 `{ settings, gridToLatLon, deadlineAtMs }`.
- 발행: `{DATA_PATH}/radar/motion_korea_{tm}.geojson`, 메타 프레임에 `motion: { tm, observedAtMs, comparedFromMs, path }`.
- 모델의 `radarMotion.visible`은 `visibility.radar && hasExactMotion && !stale`만 본다. **훅이 최종 소유자다.**

- [ ] **Step 1: 백엔드 실패 테스트를 쓴다**

`backend/test/radar-motion.test.js`의 **클램프 테스트 두 개는 남기고**, 나머지를 아래로 교체한다. 기존의 "동쪽 화살표가 하나라도 있으면 통과" 단언은 남기지 않는다.

```js
import { deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from '../src/processors/radar-motion.js'
import { MOTION_MODEL_DEFAULTS } from '../src/processors/radar-motion-model.js'

const SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 1, largeBoxKm: 30, smallBoxKm: 6, spacingKm: 2,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
  edgeLookaheadKm: 2, minSpeedKt: 3,
}
const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.01, lat: 38 - y * 0.01 })

function shifted(offsetX, offsetY) {
  const width = 80, height = 80
  const refl = new Int16Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const d2 = (x - offsetX - 40) ** 2 + (y - offsetY - 40) ** 2
      refl[y * width + x] = Math.round(6000 * Math.exp(-d2 / 200))
    }
  }
  return createMotionInput(refl, { nx: width, ny: height }, { stride: 1 })
}

test('동쪽으로 옮긴 에코는 과반이 동쪽 방위를 낸다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), { settings: SETTINGS, gridToLatLon })
  assert.ok(geojson.features.length > 0, '화살표가 하나도 없으면 안 된다')
  const east = geojson.features.filter((f) => f.properties.bearingDeg > 45 && f.properties.bearingDeg < 135)
  assert.ok(east.length / geojson.features.length > 0.6, `동쪽 비율 ${east.length}/${geojson.features.length}`)
})

test('모든 Feature는 Point이고 필수 속성을 갖는다', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), { settings: SETTINGS, gridToLatLon })
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
  assert.deepEqual(deriveMotionGeoJSON(a, { ...a, width: a.width + 1 }, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('에코가 없으면 빈 FeatureCollection', () => {
  const empty = createMotionInput(new Int16Array(6400), { nx: 80, ny: 80 }, { stride: 1 })
  assert.deepEqual(deriveMotionGeoJSON(empty, empty, { settings: SETTINGS, gridToLatLon }).features, [])
})

test('마감시한이 지났으면 빈 FeatureCollection', () => {
  const geojson = deriveMotionGeoJSON(shifted(0, 0), shifted(3, 0), {
    settings: SETTINGS, gridToLatLon, deadlineAtMs: Date.now() - 1,
  })
  assert.deepEqual(geojson.features, [])
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

`deriveObservedMotion`, `MOTION_DEFAULTS`, `valueAt`, `patchDifference`, `bearingDegrees`, `distanceKm`, `FIVE_MINUTES_MS`를 지운다. `createMotionInput`(클램프 포함), `serializeMotionInput`, `deserializeMotionInput`은 남긴다.

**`MOTION_DEFAULTS`를 지우면 `createMotionInput`의 `options.stride ?? MOTION_DEFAULTS.stride`가 깨진다.** 기본값을 인라인한다.

```js
const stride = options.stride ?? 4
```

그리고 아래를 추가한다.

```js
import {
  deriveMotionField, deriveSteeringFlow, motionVectorsToGeoJSON, selectLeadingEdge, smoothMotionField,
} from './radar-motion-model.js'

const EMPTY = { type: 'FeatureCollection', features: [] }

// MTREC 추적 4단계를 순서대로 돌려 앞면 화살표 GeoJSON을 만든다.
export function deriveMotionGeoJSON(previous, current, options) {
  const { settings, gridToLatLon, deadlineAtMs = Infinity } = options
  if (!previous || !current) return EMPTY
  if (previous.width !== current.width || previous.height !== current.height || previous.stride !== current.stride) return EMPTY

  const steering = deriveSteeringFlow(previous, current, settings)
  const field = deriveMotionField(previous, current, steering, settings, deadlineAtMs)
  if (!field.length) return EMPTY
  const edge = selectLeadingEdge(smoothMotionField(field, settings), current, settings)
  // workStride의 단일 출처는 격자다. settings와 어긋나면 속도가 조용히 틀어진다.
  return motionVectorsToGeoJSON(edge, {
    gridToLatLon,
    workStride: current.stride,
    frameIntervalMs: settings.frameIntervalMs,
  })
}
```

- [ ] **Step 4: 프로세서를 배선한다**

`backend/src/processors/radar-echo-processor.js`:

1. 14행 `const MOTION_ENABLED = false;` 삭제.
2. import를 `import { createMotionInput, deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from './radar-motion.js';`로 교체.
3. `MOTION_MAX_CALCULATION_MS` 상수 삭제.
4. `attachMotionFrame`의 `deriveObservedMotion` 호출을 교체한다.

```js
    const settings = {
      workStride: config.radar_echo_motion.work_stride,
      largeBoxKm: config.radar_echo_motion.large_box_km,
      smallBoxKm: config.radar_echo_motion.small_box_km,
      spacingKm: config.radar_echo_motion.spacing_km,
      maxSpeedKmh: config.radar_echo_motion.max_speed_kmh,
      minSpeedKt: config.radar_echo_motion.min_speed_kt,
      edgeLookaheadKm: config.radar_echo_motion.edge_lookahead_km,
      minReflectivity: config.radar_echo_motion.min_reflectivity,
      frameIntervalMs: 5 * 60 * 1000,
    };
    const geojson = deriveMotionGeoJSON(previousInput, currentInput, {
      settings,
      gridToLatLon,
      deadlineAtMs: startedAt + config.radar_echo_motion.max_calculation_ms,
    });
```

5. 그 아래 `if (Date.now() - startedAt > MOTION_MAX_CALCULATION_MS || !geojson.features.length)` 조건에서 시간 검사를 빼고 `if (!geojson.features.length)`로 남긴다. 마감은 이제 루프 안에서 처리된다.
6. `renderFrame`의 `MOTION_ENABLED ? ... : null`을 `config.radar_echo_motion.enabled ? ... : null`로 바꾸고, `createMotionInput` 호출에 `stride: config.radar_echo_motion.work_stride`를 넘긴다.

- [ ] **Step 5: 발행 테스트를 갱신한다**

`backend/test/radar-echo-motion-publication.test.js`에서 GeoJSON 기하가 `Point`임을 확인하도록 단언을 고친다. **"계산 실패가 PNG·메타 발행을 막지 않는다"는 기존 단언은 유지한다.**

Run: `cd backend && npm test`
Expected: 실패 0건.

- [ ] **Step 6: 프론트엔드 모델 테스트를 쓴다**

`frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`에 덧붙인다. **`buildWeatherOverlayModel`은 `radarFrame`을 인자로 받지 않는다** — `echoMeta.frames`와 `selectedWeatherTimeMs`로 넘긴다. 같은 파일 95–121행의 기존 호출 형태를 그대로 따른다.

```js
test('시각이 정확히 맞으면 이동 화살표 자료를 노출한다', () => {
  const observedAtMs = Date.UTC(2026, 4, 14, 3, 5)
  const model = buildWeatherOverlayModel({
    echoMeta: { frames: [
      { tm: '202605141205', path: '/r.png', motion: { observedAtMs, comparedFromMs: observedAtMs - 300000, path: '/data/radar/motion_korea_202605141205.geojson' } },
    ] },
    satMeta: null, lightningData: { nationwide: { strikes: [] } }, sigwxLowData: null, sigwxLowHistoryData: [],
    sigmetData: { items: [] }, airmetData: { items: [] },
    visibility: { radar: true }, selectedWeatherTimeMs: observedAtMs,
    sigwxHistoryIndex: 0, sigwxFilter, hiddenAdvisoryKeys, selectedSigwxFrontMeta: null, selectedSigwxCloudMeta: null,
    lightningReferenceTimeMs: observedAtMs, blinkLightning: false, lightningBlinkOff: false,
  })

  assert.equal(model.radarMotion.dataUrl, '/data/radar/motion_korea_202605141205.geojson')
  assert.equal(model.radarMotion.observedAtMs, observedAtMs)
  assert.equal(model.radarMotion.visible, true)
})
```

기존 95–110행 테스트의 `assert.equal(model.radarMotion.dataUrl, null)`은 그 픽스처에 `motion`이 없어서 여전히 옳다 — 그대로 둔다.

- [ ] **Step 7: 죽은 플래그 3개를 제거한다**

1. `weatherOverlayModel.js:12` `export const RADAR_MOTION_ENABLED = false` 삭제.
2. 228–233행의 `RADAR_MOTION_ENABLED &&` 조건을 모두 뺀다.

```js
  const radarMotion = {
    visible: Boolean(visibility.radar && hasExactMotion && !motionStale),
    stale: Boolean(motionStale),
    frameTm: radarFrame?.tm ?? null,
    dataUrl: hasExactMotion ? motion.path : null,
    observedAtMs: hasExactMotion ? motion.observedAtMs : null,
    comparedFromMs: hasExactMotion ? motion.comparedFromMs ?? null : null,
  }
```

3. `WeatherLegends.jsx:83` `const radarMotionEnabled = false`를 삭제하고, `:102`와 `:339`의 `radarMotionEnabled && ` 조건을 뺀다.

Run: `cd frontend && grep -rn "RADAR_MOTION_ENABLED\|radarMotionEnabled" src/` — 결과가 없어야 한다.

- [ ] **Step 8: 범례 테스트를 교체한다**

`WeatherLegends.test.js`는 **소스 문자열 검사** 방식이다. 12–16행의 `radar legend temporarily hides the motion toggle` 테스트를 아래로 바꾼다.

```js
test('radar legend shows the motion toggle', () => {
  assert.doesNotMatch(source, /const radarMotionEnabled/)
  assert.match(source, /이동 화살표 표시/)
  assert.match(css, /\.map-view-wrapper \.map-right-legends > \* \{[\s\S]*?pointer-events:\s*auto/)
})
```

- [ ] **Step 9: 계약 픽스처를 Point로 갱신한다**

`frontend/verification/contracts/map-base.spec.mjs:15-19`의 `motion_korea_*.geojson` 응답을 바꾼다. 옛 `LineString` + `confidence`는 더 이상 발행되지 않는다.

```js
  await page.route('**/data/radar/motion_korea_202605141205.geojson', (route) => route.fulfill({
    contentType: 'application/geo+json',
    body: JSON.stringify({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [126, 37] }, properties: { bearingDeg: 90, speedKt: 30, correlation: 0.8, neighbourAgreement: 0.9 } }],
    }),
  }))
```

- [ ] **Step 10: 전체 테스트와 커밋**

Run: `cd backend && npm test && cd ../frontend && npm test`
Expected: 양쪽 실패 0건.

```bash
git add backend/src/processors/radar-motion.js backend/src/processors/radar-echo-processor.js backend/test/ frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/WeatherLegends.test.js frontend/verification/contracts/map-base.spec.mjs
git commit -m "feat(motion): publish leading-edge arrows and remove all three dead flags"
```

---

### Task 8: 프론트엔드 레이어 — 화살대 선 + 화살촉 심볼

**Files:**
- Modify (전면 교체): `frontend/src/features/weather-overlays/lib/radarMotionLayers.js`
- Modify (전면 교체): `frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:25-28,60-66,82-88`

**Interfaces:**
- Consumes: `model.radarMotion` (`{ visible, dataUrl, ... }`), 백엔드 Point GeoJSON.
- Produces:
  - `RADAR_MOTION_SOURCE = 'kma-radar-motion'` (화살촉 Point), `RADAR_MOTION_SHAFT_SOURCE = 'kma-radar-motion-shaft'` (화살대 LineString)
  - `RADAR_MOTION_ARROW_LAYER = 'kma-radar-motion-arrow'`, `RADAR_MOTION_SHAFT_LAYER = 'kma-radar-motion-shaft'`
  - `arrowTip(feature) -> [lon, lat] | null` — 화살대 끝점. 화살대와 화살촉이 **같은 함수**를 쓴다.
  - `buildMotionShaftGeoJSON(points) -> FeatureCollection<LineString>`
  - `buildMotionHeadGeoJSON(points) -> FeatureCollection<Point>`
  - `syncRadarMotionLayer(map, model)`
- `addOrUpdateGeoJsonSource(map, id, data)`와 `setMapLayerVisible(map, id, visible)`는 `frontend/src/features/map/lib/mapLayerUtils.js`의 기존 시그니처다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`radarMotionLayers.test.js`를 아래로 교체한다.

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RADAR_MOTION_ARROW_LAYER, RADAR_MOTION_SHAFT_LAYER, RADAR_MOTION_SHAFT_SOURCE, RADAR_MOTION_SOURCE,
  arrowTip, buildMotionHeadGeoJSON, buildMotionShaftGeoJSON, syncRadarMotionLayer,
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
const fc = (...features) => ({ type: 'FeatureCollection', features })

test('화살대는 방위와 속도로 5분 이동거리만큼 뻗는다', () => {
  const shafts = buildMotionShaftGeoJSON(fc(point(127, 37, 90, 30)))
  assert.equal(shafts.features.length, 1)
  const coords = shafts.features[0].geometry.coordinates
  assert.equal(shafts.features[0].geometry.type, 'LineString')
  assert.ok(coords[1][0] > coords[0][0], '동쪽이면 경도가 커져야 한다')
  assert.ok(Math.abs(coords[1][1] - coords[0][1]) < 0.01, '동쪽이면 위도는 거의 그대로')
})

test('화살촉은 화살대 끝점과 정확히 같은 좌표에 놓인다', () => {
  const points = fc(point(127, 37, 45, 25))
  const tip = buildMotionShaftGeoJSON(points).features[0].geometry.coordinates[1]
  const head = buildMotionHeadGeoJSON(points).features[0].geometry.coordinates
  assert.deepEqual(head, tip)
  assert.deepEqual(head, arrowTip(points.features[0]))
})

test('속도가 빠를수록 화살대가 길다', () => {
  const span = (kt) => {
    const c = buildMotionShaftGeoJSON(fc(point(127, 37, 90, kt))).features[0].geometry.coordinates
    return c[1][0] - c[0][0]
  }
  assert.ok(span(40) > span(10) * 3)
})

test('속도 0이나 방위 결측은 버린다', () => {
  assert.deepEqual(buildMotionShaftGeoJSON(fc(point(127, 37, 90, 0))).features, [])
  assert.deepEqual(buildMotionHeadGeoJSON(fc(point(127, 37, NaN, 20))).features, [])
})

test('두 레이어를 등록하고 화살촉에 symbol-placement를 주지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.ok(map.getSource(RADAR_MOTION_SOURCE))
  assert.ok(map.getSource(RADAR_MOTION_SHAFT_SOURCE))
  const arrow = map.getLayer(RADAR_MOTION_ARROW_LAYER)
  assert.equal(arrow.type, 'symbol')
  assert.equal(arrow.layout['symbol-placement'], undefined, 'line-center 이중 회전을 막아야 한다')
  assert.deepEqual(arrow.layout['icon-rotate'], ['get', 'bearingDeg'])
  assert.equal(arrow.layout['icon-rotation-alignment'], 'map')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).type, 'line')
})

test('보이는 상태에서 받은 점이 두 소스에 실제로 들어간다', async () => {
  const map = fakeMap()
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => fc(point(127, 37, 90, 30), point(127.5, 37.5, 180, 20)) })
  try {
    syncRadarMotionLayer(map, { visible: true, dataUrl: '/data/radar/motion_korea_202607261200.geojson' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).layout.visibility, 'visible')
    assert.equal(map.getSource(RADAR_MOTION_SHAFT_SOURCE).data.features.length, 2)
    assert.equal(map.getSource(RADAR_MOTION_SOURCE).data.features.length, 2)
  } finally { globalThis.fetch = original }
})

test('재동기화해도 소스·레이어가 중복되지 않는다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.equal(map.sources.size, 2)
  assert.equal(map.layers.size, 2)
})

test('숨김이면 두 레이어 모두 none이고 소스가 비워진다', () => {
  const map = fakeMap()
  syncRadarMotionLayer(map, { visible: false, dataUrl: null })
  assert.equal(map.getLayer(RADAR_MOTION_ARROW_LAYER).layout.visibility, 'none')
  assert.equal(map.getLayer(RADAR_MOTION_SHAFT_LAYER).layout.visibility, 'none')
  assert.deepEqual(map.getSource(RADAR_MOTION_SOURCE).data.features, [])
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && node --test src/features/weather-overlays/lib/radarMotionLayers.test.js`
Expected: FAIL — `arrowTip is not a function`

- [ ] **Step 3: 구현**

`radarMotionLayers.js` 전면 교체.

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

// 화살대 끝점. 화살대와 화살촉이 반드시 같은 좌표를 쓰도록 한 곳에서만 계산한다.
export function arrowTip(feature) {
  const speedKt = Number(feature?.properties?.speedKt)
  const bearingDeg = Number(feature?.properties?.bearingDeg)
  const start = feature?.geometry?.coordinates
  if (!Number.isFinite(speedKt) || speedKt <= 0) return null
  if (!Number.isFinite(bearingDeg) || !Array.isArray(start)) return null

  const toRad = Math.PI / 180
  const d = (speedKt * 1.852 * (FRAME_MINUTES / 60)) / EARTH_KM
  const brg = bearingDeg * toRad
  const lat1 = start[1] * toRad, lon1 = start[0] * toRad
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg))
  const lon2 = lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
  return [lon2 / toRad, lat2 / toRad]
}

// 화살대는 실제 좌표를 갖는다 — 확대하면 같이 커지므로 길이가 속도로 읽힌다.
export function buildMotionShaftGeoJSON(points) {
  const features = []
  for (const f of points?.features || []) {
    const tip = arrowTip(f)
    if (!tip) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: [f.geometry.coordinates, tip] },
      properties: f.properties,
    })
  }
  return { type: 'FeatureCollection', features }
}

// 화살촉은 화살대 끝에 놓는다. 서버가 준 Point는 시작점이다.
export function buildMotionHeadGeoJSON(points) {
  const features = []
  for (const f of points?.features || []) {
    const tip = arrowTip(f)
    if (!tip) continue
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: tip }, properties: f.properties })
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

function applyData(map, state) {
  const points = state.visible ? state.points : EMPTY
  map.getSource(RADAR_MOTION_SHAFT_SOURCE)?.setData(buildMotionShaftGeoJSON(points))
  map.getSource(RADAR_MOTION_SOURCE)?.setData(buildMotionHeadGeoJSON(points))
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
- 25–28행 import에 `RADAR_MOTION_SHAFT_LAYER`, `RADAR_MOTION_SHAFT_SOURCE` 추가.
- `WEATHER_OVERLAY_SOURCE_IDS`(60행 부근)에 `RADAR_MOTION_SHAFT_SOURCE` 추가.
- `WEATHER_OVERLAY_LAYER_IDS`(82행 부근)에 `RADAR_MOTION_SHAFT_LAYER` 추가.
- 481행 `syncRadarMotionLayer(map, model.radarMotion)` 호출은 그대로 둔다.

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/weather-overlays/lib/radarMotionLayers.js frontend/src/features/weather-overlays/lib/radarMotionLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js
git commit -m "feat(motion): draw red arrows as a scaled shaft plus a point-anchored head"
```

---

### Task 9: 범례 문구에 길이의 뜻 추가

**Files:**
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx` (설명줄 2곳)
- Test: `frontend/src/features/weather-overlays/WeatherLegends.test.js`

**Interfaces:**
- 새 범례 항목을 만들지 않는다. 기존 `radar-motion-note` 문구만 늘린다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`WeatherLegends.test.js`(소스 문자열 검사 방식)에 덧붙인다.

```js
test('motion note explains what the arrow length means', () => {
  assert.match(source, /길이 = 5분 이동거리/)
  assert.match(source, /예측 아님/)
})
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `cd frontend && npm test`
Expected: FAIL — `길이 = 5분 이동거리`가 없다.

- [ ] **Step 3: 구현**

`WeatherLegends.jsx`의 `radar-motion-note` 안, 자료가 있을 때의 문구에 길이 설명을 넣는다. 데스크톱(약 116행)과 모바일(약 347행) 두 곳 모두 고친다.

```jsx
                  ? `관측 ${formatReferenceTimeLabel(radarMotionObservedAtMs)} · 비교 ${formatReferenceTimeLabel(radarMotionComparedFromMs)} · 길이 = 5분 이동거리 · 예측 아님`
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/weather-overlays/WeatherLegends.test.js
git commit -m "feat(motion): say what the arrow length means in the legend note"
```

---

### Task 10: 브라우저 계약, 접근성, 실화면 확인

**Files:**
- Create: `frontend/verification/contracts/radar-motion.spec.mjs`
- Modify: `docs/policies/verification/contracts.md` (등록 표에 행 추가)

**Interfaces:**
- Consumes: Task 7의 GeoJSON 계약, Task 8의 레이어 ID.
- 지도 핸들은 `window.__map`이다(`MapView.jsx:1126`, DEV 전용). `__mapForTests`는 존재하지 않는다.
- Playwright 프로젝트는 `desktop`(1440×900), `ipad-landscape`(iPad Pro 11), `mobile`(Pixel 5) 3개다. **테스트는 세 프로젝트 모두에서 돌아야 한다.**

- [ ] **Step 1: 계약을 쓴다**

`map-base.spec.mjs:62-74`의 실제 조작 순서를 따른다: 기상정보 패널을 열고 → `레이더`(정확 일치) 클릭 → 모바일은 `범례` 클릭 → `이동 화살표 표시` 클릭.

```js
import { test, expect } from '../fixtures.mjs'
import AxeBuilder from '@axe-core/playwright'

const OBSERVED_AT_MS = Date.UTC(2026, 6, 26, 3, 0)

async function installMotionFixture(page) {
  await page.route('**/data/radar/echo_meta.json', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      type: 'RADAR_ECHO', tm: '202607261200',
      frames: [
        { tm: '202607261155', path: '/data/radar/echo_korea_202607261155.png', bounds: [[30, 120], [40, 130]] },
        {
          tm: '202607261200', path: '/data/radar/echo_korea_202607261200.png', bounds: [[30, 120], [40, 130]],
          motion: { tm: '202607261200', observedAtMs: OBSERVED_AT_MS, comparedFromMs: OBSERVED_AT_MS - 300000, path: '/data/radar/motion_korea_202607261200.geojson' },
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
  const map = window.__map
  if (!map?.getLayer(layerId)) return null
  return {
    visibility: map.getLayoutProperty(layerId, 'visibility') ?? 'visible',
    placement: map.getLayoutProperty(layerId, 'symbol-placement') ?? null,
    features: map.getSource(layerId)?._data?.features?.length ?? null,
  }
}, id)

async function openMotion(page, testInfo) {
  await page.addInitScript(() => {
    localStorage.setItem('amo.tour.v1.done', 'true')
    localStorage.setItem('projectamo:lastSeenVersion', '0.2.5')
  })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const entry = testInfo.project.name === 'mobile' ? '기상정보 레이어' : '기상정보'
  await page.getByRole('button', { name: entry }).click()

  const radar = page.getByRole('button', { name: '레이더', exact: true })
  if (await radar.getAttribute('aria-pressed') !== 'true') await radar.click()
  await expect(radar).toHaveAttribute('aria-pressed', 'true')

  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: '범례' }).click()
  return page.getByRole('button', { name: '이동 화살표 표시' })
}

test.describe('레이더 에코 이동 화살표', () => {
  test.beforeEach(async ({ page }) => { await installMotionFixture(page) })

  test('토글을 켜면 화살대와 화살촉이 모두 뜨고 점이 들어간다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await expect(motion).toBeEnabled()
    await motion.click()
    await expect(motion).toHaveAttribute('aria-pressed', 'true')

    await expect.poll(() => layerState(page, 'kma-radar-motion-shaft')).toMatchObject({ visibility: 'visible', features: 2 })
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'visible', features: 2 })
  })

  test('화살촉에 symbol-placement가 설정되지 않는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ placement: null })
  })

  test('토글을 끄면 두 레이어가 함께 숨는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await expect(motion).toHaveAttribute('aria-pressed', 'true')
    await motion.click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-shaft')).toMatchObject({ visibility: 'none' })
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'none' })
  })

  test('이동 자료가 없는 시각에는 토글이 비활성이다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    const slider = page.getByRole('slider', { name: /기상 자료 시각/ })
    await slider.focus()
    await slider.press('ArrowLeft') // 202607261155 — motion 없음
    await expect(motion).toBeDisabled()
  })

  test('베이스맵을 바꿔도 레이어가 살아남는다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    await page.getByRole('button', { name: /위성/ }).click()
    await expect.poll(() => layerState(page, 'kma-radar-motion-arrow')).toMatchObject({ visibility: 'visible' })
  })

  test('토글에 접근성 위반이 없다', async ({ page }, testInfo) => {
    const motion = await openMotion(page, testInfo)
    await motion.click()
    const results = await new AxeBuilder({ page }).include('.radar-motion-control').analyze()
    expect(results.violations).toEqual([])
  })
})
```

슬라이더 접근명 `/기상 자료 시각/`과 `slider.press('ArrowLeft')` 패턴은 `echo-top.spec.mjs:172-174`에서 확인했다. **베이스맵 전환 버튼의 접근명은 아직 확인하지 않았다** — `map-base.spec.mjs`의 베이스맵 전환 테스트를 읽어 실제 이름으로 맞출 것. 추정 금지.

- [ ] **Step 2: 세 프로젝트 모두에서 돌린다**

Run: `cd frontend && npm run dev:contract -- --grep "레이더 에코 이동 화살표"`
Expected: 6개 테스트 × 3개 프로젝트 = **18개 PASS.** 정책상 계약은 등록된 모든 프로젝트에서 통과해야 완료다.

- [ ] **Step 3: 계약을 등록한다**

`docs/policies/verification/contracts.md`의 활성 계약 표에 행을 추가한다. 표는 7열이다: `Contract | Features / owners | Viewports | Preconditions | Spec | Owner | Status`.

```markdown
| `radar-motion` | `radarMotionLayers.js`, `useRadarMotionOverlay.js`, `WeatherLegends.jsx` 토글 | desktop, iPad landscape, mobile | `echo_meta.json`과 `motion_korea_*.geojson` 라우트 픽스처 | `frontend/verification/contracts/radar-motion.spec.mjs` | frontend | active — passed YYYY-MM-DD |
```

- [ ] **Step 4: 실화면 스크린샷을 남긴다**

실제 강수 사례 시각으로 3개 뷰포트 캡처를 `artifacts/responsive-screenshots/radar-motion/<timestamp>/`에 저장하고, 명령·뷰포트·관찰 내용을 `README.md`로 남긴다. 절차는 `docs/operations/dev-server-and-capture.md`를 따른다.

- [ ] **Step 5: 사용자에게 밀도를 확인받는다**

스크린샷을 보여주고 화살표 밀도를 확인받는다. 조밀하거나 성기면 `config.radar_echo_motion.spacing_km`만 조정한다(기본 8). 스펙이 이 확인을 요구한다.

- [ ] **Step 6: 전체 검증과 커밋**

Run: `cd backend && npm test && cd ../frontend && npm test && npm run dev:contract`
Expected: 전부 실패 0건.

```bash
git add frontend/verification/contracts/radar-motion.spec.mjs docs/policies/verification/contracts.md
git commit -m "test(motion): add the browser contract and register it"
```

- [ ] **Step 7: 그래프 갱신**

Run: `graphify update .`

---

## Self-Review

**스펙 커버리지**

| 스펙 요구 | 담당 |
|---|---|
| no-data 클램프 | Task 1 |
| 게이트 A(기존 정확도·소수점 보정·클램프 효과) | Task 1 |
| 게이트 B(MTREC 정확도·품질 지표 판별력) | Task 6 |
| MTREC 150 km 지향류 | Task 3 |
| MTREC 20 km 국지 + 합성 + 평활화 | Task 4 |
| 상관계수 척도 | Task 3 `boxCorrelation` |
| 최대속도 100 km/h | Task 3 `searchRadiusCells` |
| 최소 표시 속도 3 kt | Task 5 `selectLeadingEdge` |
| 소수점 변위 보정 | Task 4 `subCellPeak` |
| 앞면 판정 6 km | Task 5 |
| 품질 지표를 싣되 거르지 않음 | Task 5 |
| Point + 방위 계약 | Task 5, 7, 8 |
| 설정값 10개 | Task 2 |
| 죽은 플래그 3개 제거 | Task 7 |
| 화살대 실제 축척 비례 | Task 8 `arrowTip` |
| `symbol-placement` 미지정 | Task 8 구현 + Task 8·10 단언 |
| 시각 정확 일치 시에만 표시 | Task 7, Task 10 |
| 계산 시간 초과를 루프 안에서 중도 포기 | Task 4 `deadlineAtMs`, Task 7 |
| 실패 시 레이더 발행 무영향 | Task 7 Step 5 |
| 범례 문구에 길이 설명 | Task 9 |
| 계약 등록·3개 프로젝트·접근성 | Task 10 |
| 밀도 육안 확인 | Task 10 Step 5 |

**게이트 강제:** Task 3 Step 1이 status 문서의 `## 게이트 A 결과` 제목과 기록된 수치를 `grep`으로 확인하고, 없으면 중단하라고 지시한다. 산문 약속이 아니라 실행 가능한 검사다.

**타입 일관성:** 벡터는 전 구간 `{ col, row, dx, dy, correlation, neighbourAgreement? }`. 격자는 `{ width, height, stride, values }`. `gridToLatLon`은 항상 원본 0.5 km 좌표를 받는다. `workStride`의 단일 출처는 격자의 `stride`다(`deriveMotionGeoJSON`이 `current.stride`를 넘긴다). 화살대 끝점은 `arrowTip` 한 곳에서만 계산한다.

**약한 단언 제거:** Task 7의 모델 테스트는 `echoMeta.frames` 형태로 호출해 실제로 자료가 흐르는 경로를 검사한다. Task 8은 `fetch`를 스텁해 **보이는 상태에서 점이 소스에 들어가는지**를 확인한다. Task 3의 지향류 단언은 격자 안쪽 상자를 질의하고 ±1 허용오차를 쓴다.
