# 레이더 에코 이동 화살표 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 레이더 에코의 다가오는 앞면을 따라 일정 간격으로 빨간 이동 화살표를 지도에 표시한다.

**Architecture:** 백엔드가 5분마다 두 프레임을 SAD 블록 정합으로 추적하고, 앞면 벡터만 골라 Point GeoJSON으로 발행한다. 프론트엔드는 그 점에서 화살대 LineString을 만들어 선 레이어로, 화살촉은 끝점 심볼 레이어로 그린다. 토글 UI·상태 훅·계약은 이미 트리에 있으므로 되살려 쓴다.

**Tech Stack:** Node 22 (ESM, `node:test`), Express, Mapbox GL JS v3, React 19, Playwright.

## 2026-07-26 재계획 — 측정 결과로 순서를 바꿨다

게이트 A(Task 1) 실측이 착수 시 전제를 뒤집었다. 실제 강수 4개 사례·화살표 7,795개:

| | 정확도 |
|---|---|
| 단일 단계 SAD + no-data 클램프 | **86.6%** (사례별 81.6~90.9%) |
| 위 + 소수점 변위 보정 | 86.4% — **개선 없음** |
| 클램프 없음 | 82.2% |

기존 계산이 이미 86.6%다. 반면 표시 결함(180개 상한, 화살촉만 찍기, 회전 이중 적용 의심)은 계산과 무관하게 확정적이다.

**따라서 1차는 게이트 A에서 실측한 구성을 그대로 발행하고, 표시를 먼저 완성한다.** 실화면을 본 뒤에도 화살표가 못 미더우면 그때 MTREC을 만든다.

**보류 — 측정으로 이득이 확인되지 않았거나 미측정:**

| 항목 | 사유 |
|---|---|
| MTREC 150 km 지향류 + 20 km 국지 2단계 | 미측정 |
| 소수점 변위 보정 | **측정 결과 효과 없음**(-0.2%p, 4개 사례 일관) |
| 이웃 중앙값 평활화 | 미측정 |
| 피어슨 상관계수로의 척도 변경 | 미측정. 현행 SAD로 86.6%가 나왔다 |
| 게이트 B | 표시 완료 후 판단 |

참조 설계는 스펙의 "참조 설계 — MTREC 2단계 (보류)" 절에 남아 있다.

## ✅ 2026-07-26 완료 — Task 1~8 전부 끝

Task 6~8을 이어서 마쳤다. **Task 5가 만들었던 "깨진 중간 상태(백엔드 Point / 프론트 LineString)"는
Task 6이 `radarMotionLayers.js`를 통째로 교체하면서 해소됐다.** 실제 KMA 자료로 실화면을 확인했고,
계약 18개(3개 뷰포트)가 통과했다.

**전체 계약 스위트(114개)는 초록으로 확인하지 못했다.** 두 번은 Playwright가 띄운 테스트 서버가 중간에 죽어
(`ERR_CONNECTION_REFUSED`) 결과 자체가 무효였고, 작업 트리에 다른 세션의 미완성 변경(`MapView.jsx`,
`mapLayerUtils.js`, notam·aviation 파일, 미커밋 `shared/airspace-altitude.js`)이 섞여 있어 그쪽 계약들이 원래 깨져 있다.
**이 브랜치 범위의 증거는 `radar-motion` 계약 18/18, 프론트 단위 541개, 백엔드 486개, 그리고 실자료 실화면 캡처다.**
전체 스위트는 다른 세션 변경이 정리된 뒤에 돌릴 것.

**브랜치:** `agent/radar-echo-motion-arrows` (미푸시). `main`은 `5658a2a`에 그대로 있다.
**SDD 원장:** `.superpowers/sdd/2026-07-26-radar-echo-motion-arrows/progress.md`

### 실화면을 보고 사용자가 바꾼 값 세 가지 (2026-07-26)

계획서에 적힌 값과 다르다. **아래가 현재 값이다.**

| 항목 | 계획서 값 | 확정 값 | 위치 |
|---|---|---|---|
| 화살대 길이 | 5분 이동거리 | **10분 이동거리** | `radarMotionLayers.js`의 `ARROW_MINUTES`. 범례 문구도 "길이 = 10분 이동거리"로 같이 바꿨다 — 임의 배율을 곱해 길이의 뜻을 흐리지 않기 위해서다 |
| 화살촉 크기 | `icon-size` 0.7~1.1 | **0.45~0.7** | 같은 파일 |
| 화살표 간격 | 8 km(게이트 A 실측값) | **6 km** | `config.radar_echo_motion.spacing_km`. Task 8 Step 5가 요구한 육안 확인의 결과다 |

증거: `artifacts/responsive-screenshots/radar-motion/20260726-0705/`(최종, 간격 6 km·화살표 113개)와
`20260726-0650/`(첫 캡처, 8 km·55개).

### 방위 끝단 검증 — 이제 한 번 쟀다

계획서 주의사항 4번("방위 공식이 합성 스텁으로만 확인됐다")을 실자료로 확인했다. 두 프레임의 반사도 가중
중심 이동으로 잰 방위 63.5° 대 발행된 화살표 방위 중앙값 91°, 차이 27.5° — **180° 뒤집힘도 축 교환도 없다.**
다만 5분간 중심 이동이 약 4 km라 이 방법의 오차가 커서, **부호와 축이 맞다는 것까지가 측정 범위이고 방위 정밀도를
잰 값이 아니다.** 자세한 절차는 위 캡처 폴더의 README에 있다.

### 완료된 것

| Task | 커밋 | 결과 |
|---|---|---|
| 1 no-data 클램프 + 게이트 A | `05df2c2` `2c76e02` | 개별 화살표 정확도 **86.6%** 실측 확정 |
| 2 설정 절 | `245c275` | `config.radar_echo_motion` 9개 키 |
| 3 벡터장 + 이웃 일치도 | `af04e21` `2176ea6` `e52df00` | 측정 스크립트와 **비트 단위 동일** 확인 |
| 4 앞면 판정 + Point GeoJSON | `956d800` `96bfbd5` `6d99846` | |
| 5 발행 배선 + 죽은 플래그 3개 제거 | `e993a58` | **기능이 켜졌다** |
| 6 프론트 레이어(화살대 선 + 화살촉 심볼) | `c5d689d` | 프론트 단위 8개 신규, 541개 전부 통과 |
| 7 범례 문구 | `1405d7b` | "길이 = 10분 이동거리" |
| 8 브라우저 계약 + 실화면 | `95ad8b0` 외 | 계약 18개(3개 뷰포트) 통과, 실자료 캡처 3장 |

계획·스펙 교정 커밋: `91820ea`(표시 우선 재계획), `6df1ac6` `2d74b1e`(좌표 규약 오류).

### 남은 것 — 없음(1차 범위)

보류 항목은 그대로다: MTREC 2단계, 소수점 보정(측정상 효과 없음), 이웃 중앙값 평활화, 상관계수 척도, 게이트 B.
실화면에서 화살표가 에코 앞면을 제대로 따라가는 것이 확인됐으므로 1차는 여기서 닫는다.

### 재개 시 주의 (여전히 유효)

1. **좌표 규약은 `+x` 동쪽, `+y` 북쪽이다**(실측). 이 부호를 잘못 고치면 모든 화살표가 180° 돌아간다.
2. **`matchScore`는 평균 절대차로 낮을수록 좋다.** 0~1 신뢰도가 아니다.
3. **품질 필터는 없다.** `matchScore`·`neighbourAgreement`는 기록만 한다.
4. 저장소를 다른 세션과 공유 중이면 워크트리를 쓸 것. `git add`는 반드시 파일을 지정해서 할 것.

## Global Constraints

- 스펙: `docs/superpowers/specs/2026-07-26-radar-echo-motion-arrows-design.md`. 충돌 시 스펙이 우선한다.
- Linux 전용. `git`/`npm`/`node`를 Linux 셸에서만 실행한다.
- 작업 격자 2 km(`work_stride: 4`), 패치 반경 12 km, 벡터 간격 **6 km**(게이트 A 실측값 8에서 2026-07-26 실화면 확인으로 확정), 최대속도 100 km/h, 최소 표시 속도 3 kt, 앞면 판정 6 km. **전부 게이트 A에서 실측한 값이다 — 임의로 바꾸지 않는다.**
- 유사도는 **SAD(평균 절대차)**. 낮을수록 좋다. 피어슨 상관계수로 바꾸지 않는다.
- no-data(`-25000`) 클램프는 Task 1에서 `createMotionInput`에 이미 들어갔다. 제거하지 않는다.
- 1차에서는 품질 필터를 걸지 않는다. `matchScore`·`neighbourAgreement`는 속성으로 싣기만 한다.
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
| no-data 클램프 | `radar-motion.js` `createMotionInput` | **Task 1에서 완료** |

**죽은 플래그는 3개다:** `radar-echo-processor.js:14` `MOTION_ENABLED`, `weatherOverlayModel.js:12` `RADAR_MOTION_ENABLED`, `WeatherLegends.jsx:83` `radarMotionEnabled`.

## File Structure

**Create**
- `backend/src/processors/radar-motion-model.js` — 순수 계산. 벡터장, 이웃 일치도, 앞면 판정, GeoJSON 변환.
- `backend/test/radar-motion-model.test.js`
- `frontend/verification/contracts/radar-motion.spec.mjs`

**Modify**
- `backend/src/config.js` — `radar_echo_motion` 절.
- `backend/src/processors/radar-motion.js` — 오케스트레이션. `deriveObservedMotion` 제거.
- `backend/src/processors/radar-echo-processor.js` — 플래그 제거, `attachMotionFrame` 갱신.
- `backend/test/radar-motion.test.js`, `backend/test/radar-echo-motion-publication.test.js`
- `frontend/src/features/weather-overlays/lib/radarMotionLayers.js` + `.test.js` — 전면 교체.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` + `.test.js`
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` + `.test.js`
- `frontend/verification/contracts/map-base.spec.mjs`
- `docs/policies/verification/contracts.md`

**이미 완료 (Task 1, commits 05df2c2·2c76e02)**
- `backend/src/processors/radar-motion.js` — no-data 클램프
- `backend/scripts/measure-motion-accuracy.mjs` — 게이트 A·B 측정
- `docs/superpowers/status/radar-echo-motion-arrows.status.md` — 게이트 A 결과

---

### Task 1: no-data 클램프와 게이트 A 측정 — ✅ 완료

commits `05df2c2`, `2c76e02`. 결과는 위 재계획 절과 status 문서 참조. 재실행 불필요.

---

### Task 2: 설정 절 추가

**Files:**
- Modify: `backend/src/config.js` (`radar_echo` 절 뒤, 약 157행)

**Interfaces:**
- Produces: `config.radar_echo_motion`. Task 3–5가 사용한다.

- [ ] **Step 1: 설정 절을 추가**

`export const radar_echo = { ... }` 다음에 넣는다. **값은 게이트 A 실측 구성이다 — 임의로 바꾸지 않는다.**

```js
// 레이더 에코 이동벡터 — 5분 간격 두 프레임의 SAD 블록 정합으로 앞면 화살표를 만든다.
// 아래 수치는 2026-07-26 게이트 A 실측 구성(개별 화살표 정확도 86.6%)이다.
// MTREC 2단계·소수점 보정·평활화는 보류 상태다(스펙의 보류 표 참조).
export const radar_echo_motion = {
  enabled: process.env.RADAR_MOTION_ENABLED !== '0',
  work_stride: 4,          // HSR 0.5 km를 4칸씩 솎아 2 km 작업 격자를 만든다.
  patch_radius_km: 12,     // 정합 패치 반경. 실측값 6칸 × 2 km.
  spacing_km: 8,           // 화살표 간격. 실측값 4칸 × 2 km.
  max_speed_kmh: 100,      // 탐색 반경 R = v_max × Δt. 품질 필터가 아니라 계산의 정의역이다.
  min_speed_kt: 3,         // 이보다 느리면 방위가 무의미하므로 앞면 판정에서 제외한다.
  edge_lookahead_km: 6,    // 이 거리 앞에 에코가 없으면 앞면으로 본다.
  min_reflectivity: 2000,  // 스케일 dBZ(×100).
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
git commit -m "feat(motion): add the measured tracking config section"
```

---

### Task 3: 벡터장과 이웃 일치도

게이트 A에서 86.6%를 낸 구성을 그대로 순수 함수로 옮긴다. **새 알고리즘을 만드는 게 아니다** — `backend/scripts/measure-motion-accuracy.mjs`의 `sad`/`bestOffset`/`scoreCase` 루프가 참조 구현이며, 그 파일을 먼저 읽을 것.

**Files:**
- Create: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: 없음(순수 함수). 격자 입력은 `createMotionInput` 산출물과 같은 `{ width, height, stride, values: Int16Array }`.
- Produces:
  - `MOTION_MODEL_DEFAULTS` — `{ workStride, patchRadiusKm, spacingKm, maxSpeedKmh, minSpeedKt, edgeLookaheadKm, minReflectivity, frameIntervalMs }`
  - `cellKm(settings) -> number`
  - `searchRadiusCells(settings) -> number`
  - `deriveMotionField(previous, current, settings, deadlineAtMs) -> Array<{ col, row, dx, dy, matchScore }>` — `dx`/`dy`는 정수 칸. `matchScore`는 평균 절대차(**낮을수록 좋음**). 마감시한 초과 시 루프 안에서 중도 포기하고 빈 배열.
  - `annotateNeighbourAgreement(vectors, settings) -> Array<{ ...v, neighbourAgreement }>` — 이웃과 사잇각 45° 이내인 비율. **벡터값을 바꾸지 않는다**(평활화는 보류 항목이다).

- [ ] **Step 1: 참조 구현을 읽는다**

Read `backend/scripts/measure-motion-accuracy.mjs`. `sad()`, `bestOffset()`, `scoreCase()`의 상수(PATCH=6, 후보 간격 4, 탐색 반경 유도식)를 확인한다. 이 태스크는 그 로직을 설정값 기반으로 옮기는 작업이다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`backend/test/radar-motion-model.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MOTION_MODEL_DEFAULTS, annotateNeighbourAgreement, cellKm, deriveMotionField, searchRadiusCells,
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

const BASE = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 4, patchRadiusKm: 12, spacingKm: 8,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
}

test('cellKm은 작업 격자 한 칸의 km를 준다', () => {
  assert.equal(cellKm({ ...BASE, workStride: 4 }), 2)
  assert.equal(cellKm({ ...BASE, workStride: 2 }), 1)
})

test('탐색 반경은 최대속도와 프레임 간격에서 나온다', () => {
  // 100 km/h로 5분이면 8.33 km. 2 km 칸이면 5칸(올림).
  assert.equal(searchRadiusCells(BASE), 5)
})

test('벡터장은 과반이 참 변위를 되찾는다', () => {
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), BASE)
  assert.ok(field.length > 0, '벡터가 하나도 없으면 안 된다')
  // 하나라도 맞으면 통과하는 약한 단언을 쓰지 않는다.
  const close = field.filter((v) => v.dx === 3 && v.dy === -2)
  assert.ok(close.length / field.length > 0.7, `참 변위 일치 ${close.length}/${field.length}`)
})

test('변위는 정수 칸이다 — 소수점 보정은 보류 항목이다', () => {
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), BASE)
  assert.ok(field.every((v) => Number.isInteger(v.dx) && Number.isInteger(v.dy)))
})

test('matchScore는 낮을수록 좋다 — 동일 장은 0에 가깝다', () => {
  const same = fieldShifted(120, 120, 0, 0)
  const field = deriveMotionField(same, same, BASE)
  assert.ok(field.length > 0)
  assert.ok(field.every((v) => v.matchScore < 1), `최대 ${Math.max(...field.map((v) => v.matchScore))}`)
})

test('에코가 없는 곳에는 벡터를 만들지 않는다', () => {
  const empty = { width: 120, height: 120, stride: 4, values: new Int16Array(14400) }
  assert.deepEqual(deriveMotionField(empty, empty, BASE), [])
})

test('마감시한이 지났으면 루프 안에서 포기하고 빈 배열을 준다', () => {
  const started = Date.now()
  const field = deriveMotionField(fieldShifted(120, 120, 0, 0), fieldShifted(120, 120, 3, -2), BASE, Date.now() - 1)
  assert.deepEqual(field, [])
  assert.ok(Date.now() - started < 100, '전부 계산한 뒤 버리면 안 된다')
})

test('이웃 일치도는 튀는 벡터를 낮게 매기고 값은 바꾸지 않는다', () => {
  const vectors = []
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) vectors.push({ col: col * 4, row: row * 4, dx: 3, dy: -2, matchScore: 100 })
  }
  const rogue = vectors.find((v) => v.col === 8 && v.row === 8)
  rogue.dx = -7
  rogue.dy = 6

  const annotated = annotateNeighbourAgreement(vectors, { ...BASE, spacingKm: 8 })
  const odd = annotated.find((v) => v.col === 8 && v.row === 8)
  const normal = annotated.find((v) => v.col === 4 && v.row === 4)

  assert.equal(odd.dx, -7, '평활화는 보류 항목 — 값을 바꾸면 안 된다')
  assert.equal(odd.dy, 6)
  assert.ok(odd.neighbourAgreement < 0.5, `튀는 벡터 일치도 ${odd.neighbourAgreement}`)
  assert.ok(normal.neighbourAgreement > 0.8, `정상 벡터 일치도 ${normal.neighbourAgreement}`)
  assert.ok(annotated.every((v) => v.neighbourAgreement >= 0 && v.neighbourAgreement <= 1))
})
```

- [ ] **Step 3: 테스트가 실패하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: FAIL — `Cannot find module '../src/processors/radar-motion-model.js'`

- [ ] **Step 4: 최소 구현**

`backend/src/processors/radar-motion-model.js`:

```js
// 레이더 에코 이동벡터의 순수 계산.
// 2026-07-26 게이트 A에서 개별 화살표 정확도 86.6%를 낸 구성을 그대로 옮긴 것이다.
// 참조 구현: backend/scripts/measure-motion-accuracy.mjs
// 격자는 { width, height, stride, values: Int16Array } 형태를 받는다.
// no-data는 이 파일에 오기 전에 createMotionInput이 0으로 클램프한다.

const HSR_CELL_KM = 0.5

export const MOTION_MODEL_DEFAULTS = Object.freeze({
  workStride: 4,
  patchRadiusKm: 12,
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

function sampleAt(grid, col, row) {
  const v = valueAt(grid, col, row)
  return v === null ? 0 : v
}

// 평균 절대차. 낮을수록 잘 맞은 것이다.
function patchMismatch(previous, current, prevCol, prevRow, currCol, currRow, half) {
  let sum = 0, n = 0
  for (let dy = -half; dy <= half; dy += 1) {
    for (let dx = -half; dx <= half; dx += 1) {
      sum += Math.abs(sampleAt(previous, prevCol + dx, prevRow + dy) - sampleAt(current, currCol + dx, currRow + dy))
      n += 1
    }
  }
  return sum / n
}

// 두 프레임에서 각 지점의 변위를 구한다. 정수 칸 단위다.
// 소수점 보정은 게이트 A에서 이득이 없어(-0.2%p) 넣지 않는다.
export function deriveMotionField(previous, current, settings, deadlineAtMs = Infinity) {
  const km = cellKm(settings)
  const half = Math.max(1, Math.round(settings.patchRadiusKm / km))
  const spacing = Math.max(1, Math.round(settings.spacingKm / km))
  const search = searchRadiusCells(settings)
  const vectors = []

  for (let row = half; row < current.height - half; row += spacing) {
    // 마감시한은 바깥 루프마다 확인한다. 다 만든 뒤 버리면 5분 주기 수집이 밀린다.
    if (Date.now() >= deadlineAtMs) return []
    for (let col = half; col < current.width - half; col += spacing) {
      if (current.values[row * current.width + col] < settings.minReflectivity) continue
      let best = null
      for (let dy = -search; dy <= search; dy += 1) {
        for (let dx = -search; dx <= search; dx += 1) {
          const score = patchMismatch(previous, current, col - dx, row - dy, col, row, half)
          if (!best || score < best.score) best = { dx, dy, score }
        }
      }
      if (best) vectors.push({ col, row, dx: best.dx, dy: best.dy, matchScore: best.score })
    }
  }
  return vectors
}

// 이웃과 방향이 얼마나 맞는지 기록만 한다. 값은 바꾸지 않는다 —
// 중앙값 평활화는 아직 측정되지 않아 보류 항목이다.
export function annotateNeighbourAgreement(vectors, settings) {
  const spacing = Math.max(1, Math.round(settings.spacingKm / cellKm(settings)))
  const key = (col, row) => `${col}:${row}`
  const byKey = new Map(vectors.map((v) => [key(v.col, v.row), v]))

  return vectors.map((v) => {
    let agree = 0, total = 0
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        if (ox === 0 && oy === 0) continue
        const n = byKey.get(key(v.col + ox * spacing, v.row + oy * spacing))
        if (!n) continue
        total += 1
        const m1 = Math.hypot(v.dx, v.dy), m2 = Math.hypot(n.dx, n.dy)
        if (m1 < 0.25 || m2 < 0.25) { if (Math.abs(m1 - m2) < 0.5) agree += 1; continue }
        if ((v.dx * n.dx + v.dy * n.dy) / (m1 * m2) > 0.7) agree += 1 // 사잇각 약 45도 이내
      }
    }
    return { ...v, neighbourAgreement: total ? agree / total : 0 }
  })
}
```

- [ ] **Step 5: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 8개 테스트 전부.

- [ ] **Step 6: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): port the measured tracking loop into a pure model"
```

---

### Task 4: 앞면 판정과 GeoJSON 변환

**Files:**
- Modify: `backend/src/processors/radar-motion-model.js`
- Test: `backend/test/radar-motion-model.test.js`

**Interfaces:**
- Consumes: Task 3의 벡터 배열(`annotateNeighbourAgreement` 산출물).
- Produces:
  - `selectLeadingEdge(vectors, current, settings) -> Array<same shape>`
  - `motionVectorsToGeoJSON(vectors, options) -> FeatureCollection` — `options`는 `{ gridToLatLon, workStride, frameIntervalMs }` **뿐이다.** 시각값은 메타 프레임이 갖고 있으므로 Feature에 싣지 않는다.
  - `gridToLatLon(x, y)`는 **원본 0.5 km 격자 좌표**를 받는다. `radar-echo-parser.js:40`의 동명 함수와 같은 규약이며, **`+x`는 동쪽, `+y`는 북쪽**이다(실측 확인: y 1640/1680/1720 → lat 37.8154/38.0000/38.1847, x 1100/1120/1140 → lon 125.8828/126.0000/126.1172).
  - Feature 속성: `bearingDeg`(0–360 정수), `speedKt`(정수), `matchScore`, `neighbourAgreement`(각 소수 2자리).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```js
import { motionVectorsToGeoJSON, selectLeadingEdge } from '../src/processors/radar-motion-model.js'

const EDGE = { ...BASE, edgeLookaheadKm: 6, minReflectivity: 2000, minSpeedKt: 3, spacingKm: 8, patchRadiusKm: 12 }

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
  const mk = (col) => ({ col, row: 10, dx: 2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 })
  const kept = selectLeadingEdge([mk(5), mk(19), mk(10)], current, EDGE)
  assert.deepEqual(kept.map((v) => v.col), [19])
})

test('최소 속도 미만은 앞면 판정에서 제외한다', () => {
  const current = halfField()
  // 2km 칸, 5분 → 1칸이 약 12.9 kt. 0.2칸은 약 2.6 kt로 3 kt 미만이다.
  const slow = { col: 19, row: 10, dx: 0.2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([slow], current, EDGE), [])
})

test('격자 밖을 내다보는 벡터는 앞면으로 치지 않는다', () => {
  const current = halfField()
  // col 39는 오른쪽 끝. 3칸 앞은 격자 밖이다 — 에코 없음으로 오인하면 안 된다.
  const atEdge = { col: 39, row: 10, dx: 2, dy: 0, matchScore: 0.9, neighbourAgreement: 1 }
  assert.deepEqual(selectLeadingEdge([atEdge], current, EDGE), [])
})

test('GeoJSON은 Point와 방위·속도를 낸다', () => {
  const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 + y * 0.001 }) // +x 동쪽, +y 북쪽 (실제 규약)
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, matchScore: 0.812, neighbourAgreement: 0.875 }],
    { gridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  assert.equal(geojson.type, 'FeatureCollection')
  const f = geojson.features[0]
  assert.equal(f.geometry.type, 'Point')
  assert.ok(Math.abs(f.properties.bearingDeg - 90) < 2, `동쪽이어야 하는데 ${f.properties.bearingDeg}`)
  assert.equal(f.properties.speedKt, 39) // 3칸 × 2km ÷ (5/60)h ÷ 1.852 = 38.9
  assert.equal(f.properties.matchScore, 0.81)
  assert.equal(f.properties.neighbourAgreement, 0.88)
})

test('북쪽으로 가는 벡터는 방위 0/360 근처를 낸다', () => {
  const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.001, lat: 38 + y * 0.001 }) // +x 동쪽, +y 북쪽 (실제 규약)
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 0, dy: 3, matchScore: 0.8, neighbourAgreement: 0.8 }],
    { gridToLatLon, workStride: 4, frameIntervalMs: 300000 },
  )
  const b = geojson.features[0].properties.bearingDeg
  assert.ok(Math.min(b, 360 - b) < 2, `북쪽이어야 하는데 ${b}`) // 0/360 경계 안전
})

test('좌표를 못 구하는 벡터는 조용히 버린다', () => {
  const geojson = motionVectorsToGeoJSON(
    [{ col: 10, row: 10, dx: 3, dy: 0, matchScore: 0.5, neighbourAgreement: 0.5 }],
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
        matchScore: Number(v.matchScore.toFixed(2)),
        neighbourAgreement: Number((v.neighbourAgreement ?? 0).toFixed(2)),
      },
    })
  }
  return { type: 'FeatureCollection', features }
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인**

Run: `cd backend && node --test test/radar-motion-model.test.js`
Expected: PASS, 14개 테스트 전부.

- [ ] **Step 5: Commit**

```bash
git add backend/src/processors/radar-motion-model.js backend/test/radar-motion-model.test.js
git commit -m "feat(motion): select the leading edge and emit point GeoJSON"
```

---

### Task 5: 발행 배선과 죽은 플래그 3개 제거

**Files:**
- Modify: `backend/src/processors/radar-motion.js`
- Modify: `backend/src/processors/radar-echo-processor.js:14,143-172,182-200`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js:12,228-233`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx:83`
- Test: `backend/test/radar-motion.test.js`, `backend/test/radar-echo-motion-publication.test.js`, `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`, `frontend/src/features/weather-overlays/WeatherLegends.test.js`
- Modify: `frontend/verification/contracts/map-base.spec.mjs:15-19`

**Interfaces:**
- Consumes: Task 3의 `deriveMotionField`·`annotateNeighbourAgreement`, Task 4의 `selectLeadingEdge`·`motionVectorsToGeoJSON`.
- Produces: `deriveMotionGeoJSON(previous, current, options) -> FeatureCollection`. `options`는 `{ settings, gridToLatLon, deadlineAtMs }`.
- 발행: `{DATA_PATH}/radar/motion_korea_{tm}.geojson`, 메타 프레임에 `motion: { tm, observedAtMs, comparedFromMs, path }`.
- 모델의 `radarMotion.visible`은 `visibility.radar && hasExactMotion && !stale`만 본다. **훅이 최종 소유자다.**

- [ ] **Step 1: 백엔드 실패 테스트를 쓴다**

`backend/test/radar-motion.test.js`의 **클램프 테스트 두 개(Task 1에서 추가)는 그대로 남기고**, 나머지를 아래로 교체한다. 기존의 "동쪽 화살표가 하나라도 있으면 통과" 단언은 남기지 않는다.

```js
import { deriveMotionGeoJSON, deserializeMotionInput, serializeMotionInput } from '../src/processors/radar-motion.js'
import { MOTION_MODEL_DEFAULTS } from '../src/processors/radar-motion-model.js'

const SETTINGS = {
  ...MOTION_MODEL_DEFAULTS,
  workStride: 1, patchRadiusKm: 3, spacingKm: 2,
  maxSpeedKmh: 100, frameIntervalMs: 300000, minReflectivity: 500,
  edgeLookaheadKm: 2, minSpeedKt: 3,
}
const gridToLatLon = (x, y) => ({ lon: 126 + x * 0.01, lat: 38 + y * 0.01 }) // +x 동쪽, +y 북쪽 (실제 규약)

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
    assert.equal(typeof f.properties.matchScore, 'number')
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

`deriveObservedMotion`, `MOTION_DEFAULTS`, `valueAt`, `patchDifference`, `bearingDegrees`, `distanceKm`, `FIVE_MINUTES_MS`를 지운다. `createMotionInput`(**Task 1의 no-data 클램프 포함 — 건드리지 말 것**), `serializeMotionInput`, `deserializeMotionInput`은 남긴다.

**`MOTION_DEFAULTS`를 지우면 `createMotionInput`의 `options.stride ?? MOTION_DEFAULTS.stride`가 깨진다.** 기본값을 인라인한다.

```js
const stride = options.stride ?? 4
```

그리고 아래를 추가한다.

```js
import {
  annotateNeighbourAgreement, deriveMotionField, motionVectorsToGeoJSON, selectLeadingEdge,
} from './radar-motion-model.js'

const EMPTY = { type: 'FeatureCollection', features: [] }

// 두 프레임 -> 벡터장 -> 이웃 일치도 기록 -> 앞면만 선별 -> Point GeoJSON.
export function deriveMotionGeoJSON(previous, current, options) {
  const { settings, gridToLatLon, deadlineAtMs = Infinity } = options
  if (!previous || !current) return EMPTY
  if (previous.width !== current.width || previous.height !== current.height || previous.stride !== current.stride) return EMPTY

  const field = deriveMotionField(previous, current, settings, deadlineAtMs)
  if (!field.length) return EMPTY
  const edge = selectLeadingEdge(annotateNeighbourAgreement(field, settings), current, settings)
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
      patchRadiusKm: config.radar_echo_motion.patch_radius_km,
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
      features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [126, 37] }, properties: { bearingDeg: 90, speedKt: 30, matchScore: 120, neighbourAgreement: 0.9 } }],
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

### Task 6: 프론트엔드 레이어 — 화살대 선 + 화살촉 심볼

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
  properties: { bearingDeg, speedKt, matchScore: 120, neighbourAgreement: 0.9 },
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

### Task 7: 범례 문구에 길이의 뜻 추가

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

### Task 8: 브라우저 계약, 접근성, 실화면 확인

**Files:**
- Create: `frontend/verification/contracts/radar-motion.spec.mjs`
- Modify: `docs/policies/verification/contracts.md` (등록 표에 행 추가)

**Interfaces:**
- Consumes: Task 5의 GeoJSON 계약, Task 6의 레이어 ID.
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
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.0, 37.4] }, properties: { bearingDeg: 90, speedKt: 30, matchScore: 120, neighbourAgreement: 0.9 } },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [127.4, 37.6] }, properties: { bearingDeg: 45, speedKt: 18, matchScore: 260, neighbourAgreement: 0.7 } },
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

**스펙 커버리지 (1차 범위)**

| 스펙 요구 | 담당 |
|---|---|
| no-data 클램프 | Task 1 ✅ |
| 게이트 A | Task 1 ✅ |
| 측정된 단일 단계 구성 그대로 발행 | Task 3 |
| 최대속도 100 km/h | Task 3 `searchRadiusCells` |
| 최소 표시 속도 3 kt | Task 4 `selectLeadingEdge` |
| 앞면 판정 6 km | Task 4 |
| 품질 지표를 싣되 거르지 않음 | Task 3 `annotateNeighbourAgreement`, Task 4 GeoJSON 속성 |
| Point + 방위 계약 | Task 4, 5, 6 |
| 설정값 9개 | Task 2 |
| 죽은 플래그 3개 제거 | Task 5 |
| 화살대 실제 축척 비례 | Task 6 `arrowTip` |
| `symbol-placement` 미지정 | Task 6 구현 + Task 6·8 단언 |
| 시각 정확 일치 시에만 표시 | Task 5, Task 8 |
| 계산 시간 초과를 루프 안에서 중도 포기 | Task 3 `deadlineAtMs`, Task 5 |
| 실패 시 레이더 발행 무영향 | Task 5 Step 5 |
| 범례 문구에 길이 설명 | Task 7 |
| 계약 등록·3개 프로젝트·접근성 | Task 8 |
| 밀도 육안 확인 | Task 8 Step 5 |

**보류 항목 (스펙의 보류 표와 일치)**: MTREC 2단계, 소수점 보정, 중앙값 평활화, 상관계수 척도, 게이트 B. 실화면 확인 후 판단한다.

**타입 일관성:** 벡터는 전 구간 `{ col, row, dx, dy, matchScore, neighbourAgreement? }`. `matchScore`는 평균 절대차로 **낮을수록 좋다** — 0~1 신뢰도가 아니다. 격자는 `{ width, height, stride, values }`. `gridToLatLon`은 항상 원본 0.5 km 좌표를 받는다. `workStride`의 단일 출처는 격자의 `stride`다. 화살대 끝점은 `arrowTip` 한 곳에서만 계산한다.

**약한 단언 제거:** Task 3의 벡터장 단언은 과반(70%)이 참 변위와 정확히 일치할 것을 요구한다. Task 5의 모델 테스트는 `echoMeta.frames` 형태로 호출해 실제 자료 경로를 검사한다. Task 6은 `fetch`를 스텁해 보이는 상태에서 점이 소스에 들어가는지 확인한다.
