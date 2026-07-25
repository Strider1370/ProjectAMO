# 레이더 원자료 기반 재산출 Echo Top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-24-radar-derived-echo-top.md`

**Goal:** KMA 레이더 사이트 QCD HDF5 원자료에서 18 dBZ Echo Top(MSL)을 백엔드에서 재산출해, 기존 레이더 5분 시간축을 공유하는 독립 지도 레이어(기본 OFF)로 제공한다.

**Architecture:** 기존 위성 운정고도(CTPS) 레이어와 동일한 3단 구조를 그대로 따른다 — (1) 수집·계산 프로세서가 사이트별 HDF5를 받아 합성 격자를 만들고, (2) 스토어가 `.bin`(지점 조회 전용, 브라우저 비공개) + `.webp`(지도 오버레이) + `echotop_meta.json`을 원자적으로 발행하고, (3) 프런트엔드가 meta를 읽어 선택 시각과 **정확히 일치**하는 프레임만 이미지로 깔고 클릭 시 `/api/radar/echo-top-point`로 그 지점 값을 조회한다. 출력 격자는 기존 HSR 레이더 합성 격자(LCC)를 stride 4로 솎은 2 km 격자라, Echo Top 이미지가 기존 레이더 이미지와 경계·투영이 정확히 일치한다.

**Tech Stack:** Node 22 (ESM), `h5wasm`(이미 backend 의존성 — CF-Radial v2.2 HDF5 읽기), `sharp`(WebP 렌더), Express, `node --test`, React 19 + mapbox-gl, Playwright.

## Global Constraints

- 기준 반사도는 **18 dBZ** 고정. 사용자 임계값 선택 UI 없음.
- 고도 기준은 **MSL**. 지도 표기는 FL, 범례·상세정보에 `재산출 · 18 dBZ · MSL`을 명시.
- 레이어 기본 **OFF**. 현재 레이더 5분 시간축을 공유.
- **선택한 5분 시각과 파일의 실제 관측시각이 같은 5분 bucket일 때만** 그 프레임으로 발행·표시. 이전 프레임 재사용 금지.
- 호출 키는 **`KMA_RADAR_SATELLITE_AUTH_KEY`** (`config.api.radar_satellite_auth_key`). KIM NWP·항공기상 키와 섞지 않는다.
- 원시 HDF5, API 키, 사이트별 원시 gate 배열은 **브라우저 응답·정적 파일·로그에 절대 노출 금지**. `.bin`은 정적 서빙 404 처리.
- 지구반경 상수: `R_e = 4/3 × 6371008.8 m`. 빔 높이 `h_msl = sqrt(r² + R_e² + 2·r·R_e·sin(el)) − R_e + radar_altitude_msl`.
- KMA 공식 ETOP으로 오인될 표기 금지. 색상만으로 위험도·회피 권고 전달 금지.
- 한 사이트 실패가 다른 사이트 산출물을 폐기하거나 프레임 발행을 무기한 막아서는 안 된다.
- 비ASCII(한글) 편집 전 `docs/policies/encoding-safety.md` 준수.
- 코드 변경 후 `graphify update .` 실행.

## 계획에서 확정한 구현 선택 (스펙의 Open Implementation Choices 해소)

| 스펙의 미정 항목 | 이 계획의 결정 | 근거 |
|---|---|---|
| HDF5/CF-Radial 파서 라이브러리 | `h5wasm` (이미 backend 의존성) | `backend/src/parsers/satellite-parser.js`가 같은 방식으로 GK2A NC를 읽고 있음. 새 의존성 0개. |
| 공통 출력 격자 | 기존 HSR LCC 격자를 stride 4로 솎은 2 km 격자 (577 × 721) | 기존 `latLonToGrid`/`gridToLatLon` 재사용 → 레이더 레이어와 경계·투영 완전 일치. |
| 표현 방식 | `.webp` 이미지 오버레이 + `.bin` 지점 조회 (CTPS와 동일) | 검증된 패턴. 타일 서버 불필요. |
| 저장·만료 | `backend/data/radar/echotop/`, 최근 12프레임(1시간) 유지, 원본 HDF5 비보존 | 프레임당 약 1.7 MB. 메타에 사이트·관측시각을 남겨 재현 경로 확보. |
| 1차 운영 사이트 목록 | **Task 1의 실측으로 확정** (초기 목표 12~13) | 스펙 Gate 1이 요구. |
| 고도 컨트롤 공유 | 1차 버전에서는 공유하지 않음. 높이 필터 없음 | 스펙 Non-goals(다중 임계값 UI)와 일관. 필요해지면 CTPS의 minFl 패턴을 그대로 복제. |
| 표시 단위·범례 구간 | 주 표기 **FL**, 상세정보에 `ft MSL` 병기. 구간은 CTPS와 동일한 FL 밴드 (<100 / 100–199 / 200–299 / 300–399 / ≥400) | 같은 물리량(높이)에 같은 색 규칙 → 조종사 학습 비용 최소. 레이더 강수강도 팔레트와는 의미·범례가 분리됨. |

---

## File Structure

**Backend (새로 만듦)**
- `backend/src/lib/echo-top-grid.js` — 합성 격자 정의 + `echoTopIndexForLatLon()`. 프로세서와 `server.js`가 공유 (ctps-grid.js와 같은 역할).
- `backend/src/parsers/radar-qcd-parser.js` — h5wasm로 QCD HDF5를 읽어 순수 배열/스칼라로 변환. I/O 전담, 계산 없음.
- `backend/src/processors/echo-top-model.js` — 순수 계산: 빔 높이, 18 dBZ 판정, 상부 bracket 보간, 사이트 격자 산출, 다중 사이트 합성, 바이너리 인코딩/디코딩, 색상.
- `backend/src/processors/echo-top-store.js` — 원자적 발행, 메타 병합, 보존 정리, 경로 이탈 방지.
- `backend/src/processors/echo-top-processor.js` — 다운로드 오케스트레이션(동시성·타임아웃·재시도), 5분 bucket 검증, 부분 실패 처리.
- `backend/scripts/probe-radar-qcd-sites.mjs` — 운영 사이트 가용성·처리시간 실측 스크립트(Task 1, 11).

**Backend (수정)**
- `backend/src/config.js` — `radar_echo_top` 섹션, `schedule.echo_top_interval`.
- `backend/src/index.js` — 락·수집 등록·cron.
- `backend/server.js` — `.bin` 404 가드, 캐시 헤더, `/api/radar/echo-top-point`.

**Frontend (새로 만듦)**
- `frontend/src/features/weather-overlays/lib/echoTopLayers.js` — mapbox image source/layer 동기화.
- `frontend/src/features/weather-overlays/lib/useEchoTopOverlay.js` — 클릭 → 지점 조회 훅.
- `frontend/src/features/weather-overlays/EchoTopCard.jsx` — 클릭 상세정보 카드.
- `frontend/verification/contracts/echo-top.spec.mjs` — Playwright 계약.

**Frontend (수정)**
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` — `MET_LAYERS`에 `echoTop` 추가.
- `frontend/src/features/map/layerActions.js` — `MET_META`에 `echoTop` 추가.
- `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` — 라벨·아이콘·그룹.
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` — `echoTopFrame` 정확 시각 매칭.
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` — 범례.
- `frontend/src/api/weatherApi.js` — meta 로드·변경감지·지점 조회.
- `frontend/src/features/map/MapView.jsx` — 배선.

**Docs (수정)**
- `Architecture.md`, `docs/policies/verification/contracts.md`, `docs/superpowers/status/radar-derived-echo-top.status.md`.

---

## Task 1: 운영 게이트 — QCD 가용성 실측과 사이트 목록 확정

스펙 "Implementation and Verification Gates" 1번을 만족시키는 선행 작업. 이 작업의 산출물(확정 사이트 목록)이 없으면 이후 작업의 설정값이 허구가 된다.

**Files:**
- Create: `backend/scripts/probe-radar-qcd-sites.mjs`
- Create: `docs/superpowers/status/radar-derived-echo-top.status.md`
- Modify: `backend/src/config.js` (새 `radar_echo_top` 섹션 추가)

**Interfaces:**
- Produces: `config.radar_echo_top` — `{ url, sites: string[], concurrency, timeout_ms, retry, max_frames, delay_minutes, threshold_dbz, stride }`

- [ ] **Step 1: 사이트 프로브 스크립트 작성**

`backend/scripts/probe-radar-qcd-sites.mjs`:

```js
// 운영 사이트 게이트 — 어떤 stn 코드가 실제로 최신 QCD HDF5를 주는지 실측한다.
// 키는 어떤 출력에도 남기지 않는다(스펙 Gate 1).
import config from '../src/config.js'

const CANDIDATE_SITES = (process.env.RADAR_QCD_PROBE_SITES
  || 'BRI,GDK,KWK,KSN,MYN,PSN,GSN,SSP,JNI,IIA,GNG,PMK,SBS,YIT,CHY,MUJ,SDG,ODS')
  .split(',').map((s) => s.trim()).filter(Boolean)

function kstTm(offsetMinutes) {
  const kst = new Date(Date.now() + 9 * 3600 * 1000 - offsetMinutes * 60 * 1000)
  kst.setUTCMinutes(Math.floor(kst.getUTCMinutes() / 5) * 5, 0, 0)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}

async function probe(stn, tm) {
  const url = `${config.radar_echo_top.url}?tm=${tm}&data=qcd&stn=${stn}&authKey=${config.api.radar_satellite_auth_key}`
  const startedAt = Date.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) })
    const buffer = Buffer.from(await response.arrayBuffer())
    const isHdf5 = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x48 && buffer[2] === 0x44 && buffer[3] === 0x46
    return { stn, ok: response.ok && isHdf5, status: response.status, bytes: buffer.length, ms: Date.now() - startedAt, buffer: isHdf5 ? buffer : null }
  } catch (error) {
    return { stn, ok: false, status: 0, bytes: 0, ms: Date.now() - startedAt, error: error.message, buffer: null }
  }
}

const tm = kstTm(Number(process.env.RADAR_QCD_PROBE_DELAY_MIN || 15))
const results = []
for (const stn of CANDIDATE_SITES) results.push(await probe(stn, tm))

const ok = results.filter((r) => r.ok)
console.log(`tm=${tm} candidates=${results.length} ok=${ok.length}`)
for (const r of results) console.log(`${r.stn}\t${r.ok ? 'OK' : 'FAIL'}\tstatus=${r.status}\tbytes=${r.bytes}\tms=${r.ms}${r.error ? `\t${r.error}` : ''}`)
console.log(`\nCONFIRMED_SITES=${ok.map((r) => r.stn).join(',')}`)

if (process.env.RADAR_QCD_SAVE_FIXTURE && ok.length) {
  const fs = await import('node:fs')
  fs.mkdirSync('artifacts/radar-qcd', { recursive: true })
  for (const r of ok.slice(0, 2)) fs.writeFileSync(`artifacts/radar-qcd/${r.stn}_${tm}.h5`, r.buffer)
  console.log(`saved ${Math.min(2, ok.length)} fixture(s) to artifacts/radar-qcd/`)
}
```

- [ ] **Step 2: `config.js`에 `radar_echo_top` 섹션 추가**

`backend/src/config.js`의 `radar_echo` 블록(149~156행) 바로 아래에 삽입:

```js
// 레이더 사이트 QCD 원자료 기반 재산출 Echo Top(18 dBZ, MSL).
// KMA 공식 ETOP이 아니라 ProjectAMO가 원자료로 계산한 참고 산출물이다.
export const radar_echo_top = {
  url: process.env.RADAR_QCD_API_URL || 'https://apihub.kma.go.kr/api/typ04/url/rdr_site_file.php',
  // Task 1 실측으로 확정한 목록. 빈 값이면 프로세서가 명시적으로 실패한다.
  sites: (process.env.RADAR_QCD_SITES || '').split(',').map((s) => s.trim()).filter(Boolean),
  threshold_dbz: 18,
  stride: 4,          // HSR 0.5 km 격자를 4칸씩 솎아 2 km 합성 격자를 만든다.
  concurrency: 4,     // 한 프레임에서 동시에 받는 사이트 수.
  timeout_ms: 45000,
  retry: 1,
  delay_minutes: 15,  // QCD 파일 게시 지연. HSR(10분)보다 여유를 둔다.
  max_frames: 12,     // 1시간 보존.
  enabled: process.env.RADAR_ECHO_TOP_ENABLED !== '0',
}
```

같은 파일 하단 `export default { ... }`(319행 부근 `radar_echo,` 다음 줄)에 `radar_echo_top,`를 추가하고, `schedule` 객체의 `radar_echo_interval` 아래에 추가:

```js
  echo_top_interval: '*/5 * * * *',
```

- [ ] **Step 3: 프로브 실행 (최소 2개 사이트 확인)**

Run: `RADAR_QCD_SAVE_FIXTURE=1 node backend/scripts/probe-radar-qcd-sites.mjs`
Expected: `CONFIRMED_SITES=...` 줄에 12개 이상 코드, `artifacts/radar-qcd/`에 HDF5 2개.
실패 시(0개 OK): 키 권한 문제이므로 **여기서 멈추고 사용자에게 보고**한다. 이후 작업은 진행하지 않는다.

- [ ] **Step 4: 산출 사이트 목록을 `.env`와 상태 문서에 기록**

`.env`에 `RADAR_QCD_SITES=<CONFIRMED_SITES 값>` 추가(커밋하지 않음).
`docs/superpowers/status/radar-derived-echo-top.status.md` 생성:

```markdown
# Echo Top(재산출) 상태

**Plan:** docs/superpowers/plans/2026-07-25-radar-derived-echo-top.md
**Spec:** docs/superpowers/specs/2026-07-24-radar-derived-echo-top.md

## Gate 1 — QCD 가용성 실측 (YYYY-MM-DD)

- 시도한 후보 사이트: N개
- 응답 확인 사이트: `...` (M개)
- 사이트당 다운로드 시간: 최소 ~ms / 중앙값 ~ms / 최대 ~ms
- 표본 파일 크기: ~bytes
- 확정 1차 운영 목록: `...`

## 진행 상황

- [x] Task 1 게이트 통과
- [ ] Task 2 ...
```

- [ ] **Step 5: 커밋**

```bash
git add backend/scripts/probe-radar-qcd-sites.mjs backend/src/config.js docs/superpowers/status/radar-derived-echo-top.status.md
git commit -m "feat(echo-top): add QCD site availability probe and config section"
```

---

## Task 2: 합성 격자 (`echo-top-grid.js`)

**Files:**
- Create: `backend/src/lib/echo-top-grid.js`
- Test: `backend/test/echo-top-grid.test.js`

**Interfaces:**
- Consumes: `latLonToGrid`, `gridToLatLon` from `backend/src/parsers/radar-echo-parser.js` (이미 export됨)
- Produces:
  - `ECHO_TOP_GRID` = `{ nx: 577, ny: 721, stride: 4 }`
  - `echoTopIndexForLatLon(lat, lon)` → `number | null`
  - `echoTopCellToLatLon(ix, iy)` → `{ lat, lon }`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/echo-top-grid.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_GRID, echoTopCellToLatLon, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'

test('grid covers the HSR composite at 2 km spacing', () => {
  assert.equal(ECHO_TOP_GRID.stride, 4)
  assert.equal(ECHO_TOP_GRID.nx, 577)
  assert.equal(ECHO_TOP_GRID.ny, 721)
})

test('index round-trips through lat/lon near Seoul', () => {
  const index = echoTopIndexForLatLon(37.5665, 126.978)
  assert.ok(Number.isInteger(index) && index >= 0)
  const iy = Math.floor(index / ECHO_TOP_GRID.nx)
  const ix = index % ECHO_TOP_GRID.nx
  const { lat, lon } = echoTopCellToLatLon(ix, iy)
  assert.ok(Math.abs(lat - 37.5665) < 0.02, `lat ${lat}`)
  assert.ok(Math.abs(lon - 126.978) < 0.02, `lon ${lon}`)
})

test('points outside the composite return null', () => {
  assert.equal(echoTopIndexForLatLon(0, 0), null)
  assert.equal(echoTopIndexForLatLon(60, 126), null)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix backend test -- --test-name-pattern="grid"` 또는 `node --test backend/test/echo-top-grid.test.js`
Expected: FAIL — `Cannot find module '../src/lib/echo-top-grid.js'`

- [ ] **Step 3: 구현**

`backend/src/lib/echo-top-grid.js`:

```js
// Echo Top 합성 격자 — 기존 HSR 레이더 합성 격자(2305×2881, 0.5 km LCC)를
// stride 4로 솎은 2 km 격자. 같은 투영을 쓰므로 Echo Top 이미지가
// 레이더 이미지와 경계·픽셀 정렬이 정확히 일치한다.
import { gridToLatLon, latLonToGrid } from '../parsers/radar-echo-parser.js'

const HSR_NX = 2305
const HSR_NY = 2881

export const ECHO_TOP_GRID = Object.freeze({
  stride: 4,
  nx: Math.ceil(HSR_NX / 4), // 577
  ny: Math.ceil(HSR_NY / 4), // 721
})

export function echoTopIndexForLatLon(lat, lon, grid = ECHO_TOP_GRID) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const { x, y } = latLonToGrid(lat, lon)
  const ix = Math.round(x / grid.stride)
  const iy = Math.round(y / grid.stride)
  if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) return null
  return iy * grid.nx + ix
}

export function echoTopCellToLatLon(ix, iy, grid = ECHO_TOP_GRID) {
  return gridToLatLon(ix * grid.stride, iy * grid.stride)
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-grid.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/lib/echo-top-grid.js backend/test/echo-top-grid.test.js
git commit -m "feat(echo-top): add 2km composite grid sharing the HSR LCC projection"
```

---

## Task 3: 순수 계산 모델 — 빔 높이·18 dBZ·보간 (`echo-top-model.js` 1부)

스펙 Gate 2가 요구하는 단위 테스트 고정 지점. 여기가 이 기능의 과학적 핵심이며 전부 순수 함수라 완전히 테스트된다.

**Files:**
- Create: `backend/src/processors/echo-top-model.js`
- Test: `backend/test/echo-top-model.test.js`

**Interfaces:**
- Produces:
  - `EARTH_RADIUS_4_3_M` = `4/3 * 6371008.8`
  - `beamHeightMsl(rangeM, elevationDeg, radarAltitudeM)` → `number`
  - `ECHO_TOP_QUALITY` = `{ INTERPOLATED: 0, BEAM_CENTER_FLOOR: 1, INVALID: 255 }`
  - `echoTopFromColumn(samples, { thresholdDbz })` → `{ heightM, quality } | null`
    - `samples`: `Array<{ heightM: number, dbz: number }>` — 같은 방위·거리의 sweep 관측을 **고도 오름차순**으로 정렬해 전달한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/echo-top-model.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_QUALITY, beamHeightMsl, echoTopFromColumn } from '../src/processors/echo-top-model.js'

test('beam height uses the 4/3 earth radius and adds radar altitude', () => {
  // 0도 앙각, 100 km: 4/3 지구반경에서 약 736 m 상승 + 레이더 해발고도.
  const height = beamHeightMsl(100000, 0, 100)
  assert.ok(Math.abs(height - (736 + 100)) < 15, `height ${height}`)
})

test('beam height grows with elevation angle', () => {
  assert.ok(beamHeightMsl(50000, 5, 0) > beamHeightMsl(50000, 0.5, 0))
})

test('zero range returns the radar altitude itself', () => {
  assert.equal(Math.round(beamHeightMsl(0, 1.5, 250)), 250)
})

test('interpolates the 18 dBZ crossing between the top echo and the sample above it', () => {
  const result = echoTopFromColumn([
    { heightM: 1000, dbz: 40 },
    { heightM: 2000, dbz: 28 },
    { heightM: 3000, dbz: 8 },
  ], { thresholdDbz: 18 })
  // 2000 m(28 dBZ) ~ 3000 m(8 dBZ) 사이에서 18 dBZ 교차 = 2500 m.
  assert.equal(result.quality, ECHO_TOP_QUALITY.INTERPOLATED)
  assert.ok(Math.abs(result.heightM - 2500) < 1, `heightM ${result.heightM}`)
})

test('without a valid upper bracket it reports the beam-centre floor, never extrapolates', () => {
  const result = echoTopFromColumn([
    { heightM: 1000, dbz: 40 },
    { heightM: 2000, dbz: 30 },
  ], { thresholdDbz: 18 })
  assert.equal(result.quality, ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR)
  assert.equal(result.heightM, 2000)
})

test('a column with no sample at or above the threshold has no echo top', () => {
  assert.equal(echoTopFromColumn([
    { heightM: 1000, dbz: 10 },
    { heightM: 2000, dbz: 5 },
  ], { thresholdDbz: 18 }), null)
})

test('an empty column has no echo top', () => {
  assert.equal(echoTopFromColumn([], { thresholdDbz: 18 }), null)
})

test('a sample exactly at the threshold counts as an echo', () => {
  const result = echoTopFromColumn([{ heightM: 1500, dbz: 18 }], { thresholdDbz: 18 })
  assert.equal(result.quality, ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR)
  assert.equal(result.heightM, 1500)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`backend/src/processors/echo-top-model.js` (첫 부분):

```js
// 18 dBZ Echo Top 재산출 — 순수 계산만. 파일 I/O·네트워크 없음.
// 표준 4/3 지구반경 빔 기하를 쓰며, 유효한 상부 bracket이 없으면 절대 외삽하지 않는다.
const DEG2RAD = Math.PI / 180

export const EARTH_RADIUS_4_3_M = (4 / 3) * 6371008.8

export const ECHO_TOP_QUALITY = Object.freeze({
  INTERPOLATED: 0,       // 위쪽 유효 관측과의 18 dBZ 교차 고도를 선형 보간한 값.
  BEAM_CENTER_FLOOR: 1,  // 상부 bracket이 없어 최고 18 dBZ 빔 중심을 보수적 하한으로 쓴 값.
  INVALID: 255,
})

export function beamHeightMsl(rangeM, elevationDeg, radarAltitudeM = 0) {
  const r = Number(rangeM)
  const re = EARTH_RADIUS_4_3_M
  const sinEl = Math.sin(Number(elevationDeg) * DEG2RAD)
  return Math.sqrt(r * r + re * re + 2 * r * re * sinEl) - re + Number(radarAltitudeM || 0)
}

// samples: 같은 방위·거리 column의 유효 관측, 고도 오름차순. { heightM, dbz }
export function echoTopFromColumn(samples, { thresholdDbz = 18 } = {}) {
  if (!Array.isArray(samples) || samples.length === 0) return null

  let topIndex = -1
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    if (samples[i].dbz >= thresholdDbz) { topIndex = i; break }
  }
  if (topIndex === -1) return null

  const top = samples[topIndex]
  const above = samples[topIndex + 1]
  // 위쪽 유효 관측이 임계 미만이어야만 교차 고도를 보간할 수 있다.
  if (above && above.dbz < thresholdDbz && above.heightM > top.heightM) {
    const fraction = (top.dbz - thresholdDbz) / (top.dbz - above.dbz)
    return {
      heightM: top.heightM + fraction * (above.heightM - top.heightM),
      quality: ECHO_TOP_QUALITY.INTERPOLATED,
    }
  }
  return { heightM: top.heightM, quality: ECHO_TOP_QUALITY.BEAM_CENTER_FLOOR }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/echo-top-model.js backend/test/echo-top-model.test.js
git commit -m "feat(echo-top): add 4/3-earth beam geometry and 18 dBZ column solver"
```

---

## Task 4: 사이트 격자 산출과 다중 사이트 합성 (`echo-top-model.js` 2부)

**Files:**
- Modify: `backend/src/processors/echo-top-model.js`
- Test: `backend/test/echo-top-model.test.js` (테스트 추가)

**Interfaces:**
- Consumes: `ECHO_TOP_GRID`, `echoTopIndexForLatLon` (Task 2), `beamHeightMsl`, `echoTopFromColumn`, `ECHO_TOP_QUALITY` (Task 3)
- Produces:
  - `SiteVolume` 형태: `{ stn, latitude, longitude, altitudeM, rangeM: Float32Array, sweeps: Array<{ elevationDeg, azimuthDeg: Float32Array, dbz: Int16Array|Float32Array, scaleFactor, fillValue }> }`
  - `computeSiteEchoTop(volume, { thresholdDbz, grid })` → `{ heightM: Float32Array, quality: Uint8Array }` (격자 크기 `grid.nx*grid.ny`, 값 없음 = `quality[i] === INVALID`)
  - `mergeSiteEchoTops(siteResults, { grid })` → `{ heightM: Float32Array, quality: Uint8Array, siteIndex: Uint8Array }`
    - `siteResults`: `Array<{ stn, heightM, quality }>`; 중첩은 **더 높은 Echo Top 우선**, 값이 같으면 먼저 온 사이트 유지. `siteIndex`는 `siteResults` 배열 인덱스, 없음 = 255.

- [ ] **Step 1: 실패하는 테스트 추가**

`backend/test/echo-top-model.test.js` 하단에 추가:

```js
import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'
import { computeSiteEchoTop, mergeSiteEchoTops } from '../src/processors/echo-top-model.js'

// 관악산 부근에 가상 레이더 하나. 2개 sweep, 1개 방위, 2개 range gate.
function fakeVolume({ stn = 'TST', dbzHigh = 4000, dbzLow = 800 } = {}) {
  return {
    stn,
    latitude: 37.44,
    longitude: 126.96,
    altitudeM: 500,
    rangeM: Float32Array.from([10000, 20000]),
    sweeps: [
      { elevationDeg: 0.5, azimuthDeg: Float32Array.from([0]), dbz: Int16Array.from([dbzHigh, dbzHigh]), scaleFactor: 0.01, fillValue: -32768 },
      { elevationDeg: 6.0, azimuthDeg: Float32Array.from([0]), dbz: Int16Array.from([dbzLow, dbzLow]), scaleFactor: 0.01, fillValue: -32768 },
    ],
  }
}

test('site echo top marks cells along the observed ray and leaves the rest invalid', () => {
  const result = computeSiteEchoTop(fakeVolume(), { thresholdDbz: 18, grid: ECHO_TOP_GRID })
  assert.equal(result.heightM.length, ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny)
  const marked = result.quality.reduce((n, q) => n + (q !== 255 ? 1 : 0), 0)
  assert.ok(marked > 0 && marked < 50, `marked ${marked}`)
})

test('fill values are excluded from the echo top', () => {
  const volume = fakeVolume()
  volume.sweeps[0].dbz = Int16Array.from([-32768, -32768])
  volume.sweeps[1].dbz = Int16Array.from([-32768, -32768])
  const result = computeSiteEchoTop(volume, { thresholdDbz: 18, grid: ECHO_TOP_GRID })
  assert.equal(result.quality.reduce((n, q) => n + (q !== 255 ? 1 : 0), 0), 0)
})

test('merge keeps the higher echo top and records which site produced it', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const low = { stn: 'AAA', heightM: new Float32Array(size), quality: new Uint8Array(size).fill(255) }
  const high = { stn: 'BBB', heightM: new Float32Array(size), quality: new Uint8Array(size).fill(255) }
  const index = echoTopIndexForLatLon(37.5, 127.0)
  low.heightM[index] = 5000; low.quality[index] = 1
  high.heightM[index] = 9000; high.quality[index] = 0

  const merged = mergeSiteEchoTops([low, high], { grid: ECHO_TOP_GRID })
  assert.equal(merged.heightM[index], 9000)
  assert.equal(merged.quality[index], 0)
  assert.equal(merged.siteIndex[index], 1)
})

test('merging zero sites yields an entirely invalid composite', () => {
  const merged = mergeSiteEchoTops([], { grid: ECHO_TOP_GRID })
  assert.ok(merged.quality.every((q) => q === 255))
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: FAIL — `computeSiteEchoTop is not a function`

- [ ] **Step 3: 구현 추가**

`backend/src/processors/echo-top-model.js` 하단에 추가:

```js
import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../lib/echo-top-grid.js'

const M_PER_DEG_LAT = 111320

// 레이더 중심 기준 (방위, 거리) → 위경도. 지표 투영이라 소규모 거리에서 평면 근사로 충분하다.
// ponytail: 평면 근사, 250 km 반경에서 격자 한 칸(2 km) 미만 오차. 정밀도가 문제되면 측지 직접해로 교체.
function offsetLatLon(lat, lon, azimuthDeg, groundRangeM) {
  const azimuth = azimuthDeg * DEG2RAD
  const north = groundRangeM * Math.cos(azimuth)
  const east = groundRangeM * Math.sin(azimuth)
  return {
    lat: lat + north / M_PER_DEG_LAT,
    lon: lon + east / (M_PER_DEG_LAT * Math.cos(lat * DEG2RAD)),
  }
}

export function computeSiteEchoTop(volume, { thresholdDbz = 18, grid = ECHO_TOP_GRID } = {}) {
  const size = grid.nx * grid.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  if (!volume?.sweeps?.length || !volume.rangeM?.length) return { heightM, quality }

  const sweeps = [...volume.sweeps].sort((a, b) => a.elevationDeg - b.elevationDeg)
  const gateCount = volume.rangeM.length
  // 방위 인덱스는 sweep마다 ray 수가 다를 수 있으므로 1도 단위로 정규화해 column을 맞춘다.
  const azimuthBins = 360

  for (let bin = 0; bin < azimuthBins; bin += 1) {
    for (let gate = 0; gate < gateCount; gate += 1) {
      const r = volume.rangeM[gate]
      if (!Number.isFinite(r) || r <= 0) continue

      const samples = []
      for (const sweep of sweeps) {
        const rayCount = sweep.azimuthDeg.length
        if (!rayCount) continue
        let rayIndex = -1
        for (let ray = 0; ray < rayCount; ray += 1) {
          if (Math.round(sweep.azimuthDeg[ray]) % 360 === bin) { rayIndex = ray; break }
        }
        if (rayIndex === -1) continue
        const raw = sweep.dbz[rayIndex * gateCount + gate]
        if (raw === undefined || raw === sweep.fillValue) continue
        const dbz = raw * (sweep.scaleFactor ?? 1)
        if (!Number.isFinite(dbz)) continue
        samples.push({ heightM: beamHeightMsl(r, sweep.elevationDeg, volume.altitudeM), dbz })
      }
      if (!samples.length) continue

      const solved = echoTopFromColumn(samples, { thresholdDbz })
      if (!solved) continue

      const groundRange = r * Math.cos(sweeps[0].elevationDeg * DEG2RAD)
      const { lat, lon } = offsetLatLon(volume.latitude, volume.longitude, bin, groundRange)
      const index = echoTopIndexForLatLon(lat, lon, grid)
      if (index === null) continue
      if (quality[index] === ECHO_TOP_QUALITY.INVALID || solved.heightM > heightM[index]) {
        heightM[index] = solved.heightM
        quality[index] = solved.quality
      }
    }
  }
  return { heightM, quality }
}

export function mergeSiteEchoTops(siteResults, { grid = ECHO_TOP_GRID } = {}) {
  const size = grid.nx * grid.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  const siteIndex = new Uint8Array(size).fill(255)

  for (let s = 0; s < siteResults.length; s += 1) {
    const site = siteResults[s]
    if (!site?.quality) continue
    for (let i = 0; i < size; i += 1) {
      if (site.quality[i] === ECHO_TOP_QUALITY.INVALID) continue
      if (quality[i] === ECHO_TOP_QUALITY.INVALID || site.heightM[i] > heightM[i]) {
        heightM[i] = site.heightM[i]
        quality[i] = site.quality[i]
        siteIndex[i] = s
      }
    }
  }
  return { heightM, quality, siteIndex }
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: PASS (12 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/echo-top-model.js backend/test/echo-top-model.test.js
git commit -m "feat(echo-top): resample site volumes onto the composite grid and merge sites"
```

---

## Task 5: 바이너리 인코딩과 색상 렌더 (`echo-top-model.js` 3부)

**Files:**
- Modify: `backend/src/processors/echo-top-model.js`
- Test: `backend/test/echo-top-model.test.js` (테스트 추가)

**Interfaces:**
- Produces:
  - `encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid })` → `Buffer` (`AMOETOP1` 헤더 32 B + 셀당 4 B: `Uint16 heightM`, `Uint8 quality`, `Uint8 siteIndex`)
  - `decodeEchoTopRecord(buffer, index)` → `{ heightM, ft, fl, quality, qualityCode, siteIndex } | null`
  - `ECHO_TOP_FL_BANDS` = `[{ maxFl, color: [r,g,b] }, ...]`
  - `echoTopColor(heightM)` → `[r, g, b]`
  - `renderEchoTopRgba({ heightM, quality }, { grid, width, height, bounds })` → `Buffer` (RGBA raw)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
import { decodeEchoTopRecord, encodeEchoTopBinary, echoTopColor, renderEchoTopRgba } from '../src/processors/echo-top-model.js'

test('binary round-trips height, quality and site index', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(255)
  const siteIndex = new Uint8Array(size).fill(255)
  heightM[7] = 9327.4; quality[7] = 0; siteIndex[7] = 3

  const buffer = encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid: ECHO_TOP_GRID })
  assert.equal(buffer.toString('ascii', 0, 8), 'AMOETOP1')

  const record = decodeEchoTopRecord(buffer, 7)
  assert.equal(record.heightM, 9327)
  assert.equal(record.ft, Math.round(9327 * 3.280839895))
  assert.equal(record.fl, Math.round(9327 * 3.280839895 / 100))
  assert.equal(record.quality, 'interpolated')
  assert.equal(record.siteIndex, 3)
  assert.equal(decodeEchoTopRecord(buffer, 8), null)
})

test('binary rejects a corrupt header', () => {
  assert.throws(() => decodeEchoTopRecord(Buffer.alloc(40), 0), /Invalid Echo Top binary header/)
})

test('colour bands follow flight level, not danger', () => {
  assert.deepEqual(echoTopColor(1000), echoTopColor(2000))          // 둘 다 FL100 미만
  assert.notDeepEqual(echoTopColor(1000), echoTopColor(12500))      // FL100 미만 vs FL400 이상
})

test('render produces an opaque pixel only where the composite has data', () => {
  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(255)
  const rgba = renderEchoTopRgba({ heightM, quality }, { grid: ECHO_TOP_GRID, width: 40, height: 50 })
  assert.equal(rgba.length, 40 * 50 * 4)
  assert.ok(rgba.every((byte) => byte === 0))
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: FAIL — `encodeEchoTopBinary is not a function`

- [ ] **Step 3: 구현 추가**

```js
import { latLonToGrid } from '../parsers/radar-echo-parser.js'

const MAGIC = 'AMOETOP1'
const HEADER_BYTES = 32
const RECORD_BYTES = 4
const INVALID_HEIGHT = 0xffff
export const M_TO_FT = 3.280839895

// FL 밴드 — 위성 운정고도(CTPS)와 같은 색 규칙. 같은 물리량(높이)에 같은 색을 쓴다.
// 색은 높이를 뜻할 뿐이며 위험도나 회피 권고가 아니다.
export const ECHO_TOP_FL_BANDS = Object.freeze([
  { maxFl: 100, color: [22, 163, 74] },
  { maxFl: 200, color: [234, 179, 8] },
  { maxFl: 300, color: [249, 115, 22] },
  { maxFl: 400, color: [220, 38, 38] },
  { maxFl: Infinity, color: [126, 34, 206] },
])

export function echoTopColor(heightM) {
  const fl = (heightM * M_TO_FT) / 100
  return (ECHO_TOP_FL_BANDS.find((band) => fl < band.maxFl) || ECHO_TOP_FL_BANDS.at(-1)).color
}

export function encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid = ECHO_TOP_GRID } = {}) {
  const count = grid.nx * grid.ny
  const buffer = Buffer.alloc(HEADER_BYTES + count * RECORD_BYTES)
  buffer.write(MAGIC, 0, 'ascii')
  buffer.writeUInt16LE(grid.nx, 8)
  buffer.writeUInt16LE(grid.ny, 10)
  buffer.writeUInt16LE(grid.stride, 12)
  buffer.writeUInt8(RECORD_BYTES, 14)
  buffer.writeUInt32LE(count, 16)
  for (let i = 0; i < count; i += 1) {
    const offset = HEADER_BYTES + i * RECORD_BYTES
    const valid = quality[i] !== ECHO_TOP_QUALITY.INVALID && Number.isFinite(heightM[i]) && heightM[i] > 0
    buffer.writeUInt16LE(valid ? Math.min(INVALID_HEIGHT - 1, Math.round(heightM[i])) : INVALID_HEIGHT, offset)
    buffer.writeUInt8(valid ? quality[i] : ECHO_TOP_QUALITY.INVALID, offset + 2)
    buffer.writeUInt8(valid ? (siteIndex?.[i] ?? 255) : 255, offset + 3)
  }
  return buffer
}

export function decodeEchoTopRecord(buffer, index) {
  if (!Buffer.isBuffer(buffer) || buffer.length < HEADER_BYTES || buffer.toString('ascii', 0, 8) !== MAGIC) {
    throw new Error('Invalid Echo Top binary header')
  }
  const count = buffer.readUInt32LE(16)
  if (buffer.length !== HEADER_BYTES + count * RECORD_BYTES) throw new Error('Invalid Echo Top binary length')
  if (!Number.isInteger(index) || index < 0 || index >= count) return null

  const offset = HEADER_BYTES + index * RECORD_BYTES
  const raw = buffer.readUInt16LE(offset)
  const qualityCode = buffer.readUInt8(offset + 2)
  if (raw === INVALID_HEIGHT || qualityCode === ECHO_TOP_QUALITY.INVALID) return null

  const ft = Math.round(raw * M_TO_FT)
  return {
    heightM: raw,
    ft,
    fl: Math.round(ft / 100),
    qualityCode,
    quality: qualityCode === ECHO_TOP_QUALITY.INTERPOLATED ? 'interpolated' : 'beam_center_floor',
    siteIndex: buffer.readUInt8(offset + 3),
  }
}

// 출력 이미지는 기존 레이더 PNG와 같은 Web Mercator 범위를 쓴다(호출자가 bounds를 넘긴다).
export function renderEchoTopRgba({ heightM, quality }, { grid = ECHO_TOP_GRID, width, height, bounds } = {}) {
  const rgba = Buffer.alloc(width * height * 4)
  if (!bounds) return rgba
  const [[south, west], [north, east]] = bounds
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const minY = mercY(south)
  const maxY = mercY(north)

  for (let py = 0; py < height; py += 1) {
    const y = maxY - ((py + 0.5) / height) * (maxY - minY)
    const lat = (Math.atan(Math.sinh(y)) * 180) / Math.PI
    for (let px = 0; px < width; px += 1) {
      const lon = west + ((px + 0.5) / width) * (east - west)
      const g = latLonToGrid(lat, lon)
      const ix = Math.round(g.x / grid.stride)
      const iy = Math.round(g.y / grid.stride)
      if (ix < 0 || ix >= grid.nx || iy < 0 || iy >= grid.ny) continue
      const index = iy * grid.nx + ix
      if (quality[index] === ECHO_TOP_QUALITY.INVALID) continue
      const [r, gr, b] = echoTopColor(heightM[index])
      const offset = (py * width + px) * 4
      rgba[offset] = r; rgba[offset + 1] = gr; rgba[offset + 2] = b; rgba[offset + 3] = 210
    }
  }
  return rgba
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-model.test.js`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/echo-top-model.js backend/test/echo-top-model.test.js
git commit -m "feat(echo-top): encode composite binary and render FL-banded overlay"
```

---

## Task 6: QCD HDF5 파서 (`radar-qcd-parser.js`)

h5wasm 접근은 얇게 유지하고, 속성 해석 같은 순수 로직만 단위 테스트한다. 실제 HDF5를 읽는 경로는 Task 1이 받아 둔 표본으로 검증하며, 표본이 없으면 테스트가 스스로 건너뛴다(CI 안전).

**Files:**
- Create: `backend/src/parsers/radar-qcd-parser.js`
- Test: `backend/test/radar-qcd-parser.test.js`

**Interfaces:**
- Produces:
  - `parseQcdVolume(buffer, { stn })` → `SiteVolume & { timeCoverageStart: string, timeCoverageEnd: string }` (Task 4의 `SiteVolume` 형태 그대로 + ISO 8601 시각 2개)
  - `observedBucketMs(volume)` → `number | null` — `timeCoverageStart`를 5분 bucket으로 내림한 epoch ms
  - `isSameFiveMinuteBucket(observedMs, requestedMs)` → `boolean`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/radar-qcd-parser.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { isSameFiveMinuteBucket, observedBucketMs, parseQcdVolume } from '../src/parsers/radar-qcd-parser.js'

test('observation time is floored to its 5-minute bucket', () => {
  const ms = observedBucketMs({ timeCoverageStart: '2026-07-25T11:37:41Z' })
  assert.equal(new Date(ms).toISOString(), '2026-07-25T11:35:00.000Z')
})

test('a missing or malformed observation time yields null', () => {
  assert.equal(observedBucketMs({ timeCoverageStart: null }), null)
  assert.equal(observedBucketMs({ timeCoverageStart: 'not-a-time' }), null)
})

test('bucket comparison accepts the same bucket and rejects the neighbour', () => {
  const requested = Date.UTC(2026, 6, 25, 11, 35)
  assert.equal(isSameFiveMinuteBucket(Date.UTC(2026, 6, 25, 11, 35), requested), true)
  assert.equal(isSameFiveMinuteBucket(Date.UTC(2026, 6, 25, 11, 30), requested), false)
  assert.equal(isSameFiveMinuteBucket(null, requested), false)
})

// 실제 HDF5 표본은 Task 1이 artifacts/radar-qcd/ 에 받아 둔다(비커밋). 없으면 건너뛴다.
const fixtureDir = path.join(process.cwd(), 'artifacts', 'radar-qcd')
const fixture = fs.existsSync(fixtureDir) ? fs.readdirSync(fixtureDir).find((f) => f.endsWith('.h5')) : null

test('parses a real QCD volume', { skip: fixture ? false : 'no artifacts/radar-qcd/*.h5 fixture' }, async () => {
  const buffer = fs.readFileSync(path.join(fixtureDir, fixture))
  const volume = await parseQcdVolume(buffer, { stn: fixture.slice(0, 3) })

  assert.ok(Number.isFinite(volume.latitude) && Number.isFinite(volume.longitude))
  assert.ok(Number.isFinite(volume.altitudeM))
  assert.ok(volume.rangeM.length > 0)
  assert.ok(volume.sweeps.length > 0)
  assert.ok(volume.sweeps.every((s) => Number.isFinite(s.elevationDeg) && s.azimuthDeg.length > 0))
  assert.ok(volume.sweeps.every((s) => s.dbz.length === s.azimuthDeg.length * volume.rangeM.length))
  assert.match(volume.timeCoverageStart, /^\d{4}-\d{2}-\d{2}T/)
  // 검증 표본 기준: 스케일 적용 후 dBZ가 물리적으로 타당한 범위에 있어야 한다.
  const first = volume.sweeps[0]
  const scaled = [...first.dbz].filter((v) => v !== first.fillValue).map((v) => v * first.scaleFactor)
  assert.ok(scaled.every((v) => v > -40 && v < 100))
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/radar-qcd-parser.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`backend/src/parsers/radar-qcd-parser.js`:

```js
// KMA 레이더 사이트 QCD(CF-Radial v2.2, HDF5) 리더. h5wasm는 이미 위성 파서가 쓰는 의존성이다.
// 여기서는 읽기만 하고 과학 계산은 하지 않는다(계산은 echo-top-model.js).
import { randomUUID } from 'node:crypto'

const FIVE_MIN_MS = 5 * 60 * 1000

function attrValue(attr) {
  if (attr == null) return null
  const raw = typeof attr === 'object' && 'value' in attr ? attr.value : attr
  if (ArrayBuffer.isView(raw) && raw.length > 0) return raw.length === 1 ? Number(raw[0]) : raw
  if (Array.isArray(raw) && raw.length === 1) return raw[0]
  return raw
}

function datasetValue(file, name) {
  const dataset = file.get(name)
  if (!dataset) throw new Error(`Missing required dataset: ${name}`)
  return dataset.value
}

function firstNumber(value, fallback = null) {
  if (value == null) return fallback
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return value.length ? Number(value[0]) : fallback
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export async function parseQcdVolume(buffer, { stn } = {}) {
  const h5wasm = await import('h5wasm')
  await h5wasm.ready
  const name = `/qcd-${randomUUID()}.h5`
  h5wasm.FS.writeFile(name, new Uint8Array(buffer))
  const file = new h5wasm.File(name, 'r')

  try {
    const dbzhDataset = file.get('DBZH')
    if (!dbzhDataset) throw new Error('Missing required dataset: DBZH')
    const attrs = dbzhDataset.attrs || {}
    const scaleFactor = firstNumber(attrValue(attrs.scale_factor), 1)
    const fillValue = firstNumber(attrValue(attrs._FillValue), -32768)
    const dbz = dbzhDataset.value

    const rangeM = Float32Array.from(datasetValue(file, 'range'))
    const elevation = Float32Array.from(datasetValue(file, 'elevation'))
    const azimuth = Float32Array.from(datasetValue(file, 'azimuth'))
    const sweepStart = Int32Array.from(datasetValue(file, 'sweep_start_ray_index'))
    const sweepEnd = Int32Array.from(datasetValue(file, 'sweep_end_ray_index'))

    const gateCount = rangeM.length
    const sweeps = []
    for (let s = 0; s < sweepStart.length; s += 1) {
      const start = sweepStart[s]
      const end = sweepEnd[s]
      if (!Number.isInteger(start) || !Number.isInteger(end) || end < start) continue
      const rays = end - start + 1
      sweeps.push({
        elevationDeg: elevation[start],
        azimuthDeg: azimuth.slice(start, end + 1),
        dbz: dbz.slice(start * gateCount, (end + 1) * gateCount),
        scaleFactor,
        fillValue,
        rayCount: rays,
      })
    }

    const rootAttrs = file.attrs || {}
    return {
      stn: stn || String(attrValue(rootAttrs.instrument_name) || '').trim() || 'UNKNOWN',
      latitude: firstNumber(datasetValue(file, 'latitude')),
      longitude: firstNumber(datasetValue(file, 'longitude')),
      altitudeM: firstNumber(datasetValue(file, 'altitude'), 0),
      rangeM,
      sweeps,
      timeCoverageStart: String(attrValue(rootAttrs.time_coverage_start) ?? datasetValue(file, 'time_coverage_start') ?? ''),
      timeCoverageEnd: String(attrValue(rootAttrs.time_coverage_end) ?? datasetValue(file, 'time_coverage_end') ?? ''),
    }
  } finally {
    file.close()
    try { h5wasm.FS.unlink(name) } catch { /* 임시 파일은 이미 정리됐을 수 있다 */ }
  }
}

export function observedBucketMs(volume) {
  const ms = Date.parse(volume?.timeCoverageStart || '')
  return Number.isFinite(ms) ? Math.floor(ms / FIVE_MIN_MS) * FIVE_MIN_MS : null
}

export function isSameFiveMinuteBucket(observedMs, requestedMs) {
  if (!Number.isFinite(observedMs) || !Number.isFinite(requestedMs)) return false
  return Math.floor(observedMs / FIVE_MIN_MS) === Math.floor(requestedMs / FIVE_MIN_MS)
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/radar-qcd-parser.test.js`
Expected: PASS (4 tests; 표본이 있으면 4번째도 실행). 표본 테스트가 필드명 불일치로 실패하면 **패치가 아니라 실제 파일 구조를 확인해** `superpowers:systematic-debugging`으로 원인을 잡고 필드명을 고친다.

- [ ] **Step 5: 커밋**

```bash
git add backend/src/parsers/radar-qcd-parser.js backend/test/radar-qcd-parser.test.js
git commit -m "feat(echo-top): read CF-Radial QCD volumes with h5wasm"
```

---

## Task 7: 발행 스토어 (`echo-top-store.js`)

**Files:**
- Create: `backend/src/processors/echo-top-store.js`
- Test: `backend/test/echo-top-store.test.js`

**Interfaces:**
- Consumes: `encodeEchoTopBinary`, `renderEchoTopRgba` (Task 5)
- Produces:
  - `echoTopDir(root)` → `string` (`<root>/radar/echotop`)
  - `readEchoTopMeta(root)` → `object | null`
  - `publishEchoTopFrame({ root, tm, composite, image, bounds, width, height, sites, maxFrames })` → `meta`
    - `sites`: `Array<{ stn, status: 'ok'|'missing'|'stale'|'failed', observedAt: string|null, reason?: string }>`
    - 프레임 레코드: `{ tm, observedAt, bounds, width, height, path, threshold_dbz: 18, reference: 'MSL', sites, siteCount: { ok, total } }`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/echo-top-store.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { echoTopDir, publishEchoTopFrame, readEchoTopMeta } from '../src/processors/echo-top-store.js'

function publish(root, tm, overrides = {}) {
  return publishEchoTopFrame({
    root, tm,
    composite: Buffer.from('AMOETOP1binary'),
    image: Buffer.from('webp-bytes'),
    bounds: [[30, 120], [45, 135]], width: 100, height: 120,
    sites: [{ stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' }],
    maxFrames: 3,
    ...overrides,
  })
}

test('publishing writes the image, the binary and the meta', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  const meta = publish(root, '202607252035')

  assert.equal(meta.type, 'RADAR_ECHO_TOP')
  assert.equal(meta.threshold_dbz, 18)
  assert.equal(meta.tm, '202607252035')
  assert.equal(meta.frames[0].path, '/data/radar/echotop/echotop_202607252035.webp')
  assert.ok(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252035.webp')))
  assert.ok(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252035.bin')))
  assert.deepEqual(readEchoTopMeta(root).tm, '202607252035')
})

test('the frame records per-site status so partial coverage is identifiable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  const meta = publish(root, '202607252035', {
    sites: [
      { stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' },
      { stn: 'BBB', status: 'stale', observedAt: '2026-07-25T11:25:00.000Z' },
      { stn: 'CCC', status: 'failed', observedAt: null, reason: 'timeout' },
    ],
  })
  assert.deepEqual(meta.frames[0].siteCount, { ok: 1, total: 3 })
  assert.equal(meta.frames[0].sites.find((s) => s.stn === 'BBB').status, 'stale')
})

test('retention keeps only maxFrames and deletes the orphaned assets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  for (const tm of ['202607252015', '202607252020', '202607252025', '202607252030']) publish(root, tm)
  const meta = readEchoTopMeta(root)
  assert.equal(meta.frames.length, 3)
  assert.equal(meta.frames[0].tm, '202607252020')
  assert.equal(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252015.webp')), false)
  assert.equal(fs.existsSync(path.join(echoTopDir(root), 'echotop_202607252015.bin')), false)
})

test('an invalid tm is refused before anything is written', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-'))
  assert.throws(() => publish(root, '../../etc/passwd'), /Invalid Echo Top frame tm/)
  assert.equal(fs.existsSync(echoTopDir(root)), false)
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-store.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`backend/src/processors/echo-top-store.js`:

```js
import fs from 'node:fs'
import path from 'node:path'

const META_NAME = 'echotop_meta.json'
const RENDER_VERSION = 'echotop-18dbz-msl-v1'

export function echoTopDir(root) { return path.join(root, 'radar', 'echotop') }

function assertTm(tm) {
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)) throw new Error(`Invalid Echo Top frame tm: ${tm}`)
  return tm
}

function writeAtomic(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  fs.writeFileSync(temp, data)
  fs.renameSync(temp, filePath)
}

export function readEchoTopMeta(root) {
  const filePath = path.join(echoTopDir(root), META_NAME)
  if (!fs.existsSync(filePath)) return null
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')) } catch { return null }
}

function tmToIso(tm) {
  // tm은 KST 12자리. 실제 관측시각은 사이트 메타의 observedAt이 우선한다.
  return new Date(Date.UTC(
    Number(tm.slice(0, 4)), Number(tm.slice(4, 6)) - 1, Number(tm.slice(6, 8)),
    Number(tm.slice(8, 10)) - 9, Number(tm.slice(10, 12)),
  )).toISOString()
}

function cleanup(root, meta) {
  const keep = new Set()
  for (const frame of meta.frames) { keep.add(`echotop_${frame.tm}.webp`); keep.add(`echotop_${frame.tm}.bin`) }
  const dir = echoTopDir(root)
  if (!fs.existsSync(dir)) return
  for (const filename of fs.readdirSync(dir)) {
    if (/^echotop_\d{12}\.(?:webp|bin)$/.test(filename) && !keep.has(filename)) fs.unlinkSync(path.join(dir, filename))
  }
}

export function publishEchoTopFrame({ root, tm, composite, image, bounds, width, height, sites = [], maxFrames = 12 }) {
  assertTm(tm)
  const dir = echoTopDir(root)
  writeAtomic(path.join(dir, `echotop_${tm}.bin`), composite)
  writeAtomic(path.join(dir, `echotop_${tm}.webp`), image)

  const okSites = sites.filter((site) => site.status === 'ok')
  const record = {
    tm,
    // 실제 관측시각: 정상 사이트들의 최신 관측시각. 없으면 프레임 시각으로 대체.
    observedAt: okSites.map((site) => site.observedAt).filter(Boolean).sort().at(-1) || tmToIso(tm),
    bounds, width, height,
    path: `/data/radar/echotop/echotop_${tm}.webp`,
    threshold_dbz: 18,
    reference: 'MSL',
    sites,
    siteCount: { ok: okSites.length, total: sites.length },
  }

  const byTm = new Map((readEchoTopMeta(root)?.frames || []).map((frame) => [frame.tm, frame]))
  byTm.set(tm, record)
  const frames = [...byTm.values()].sort((a, b) => a.tm.localeCompare(b.tm)).slice(-maxFrames)
  const latest = frames.at(-1) || null

  const meta = {
    type: 'RADAR_ECHO_TOP',
    version: 1,
    render_version: RENDER_VERSION,
    threshold_dbz: 18,
    reference: 'MSL',
    source: 'KMA radar site QCD — ProjectAMO 재산출 (KMA 공식 ETOP 아님)',
    updated_at: new Date().toISOString(),
    tm: latest?.tm || null,
    latest,
    frames,
  }
  writeAtomic(path.join(dir, META_NAME), `${JSON.stringify(meta, null, 2)}\n`)
  cleanup(root, meta)
  return meta
}

export default { echoTopDir, publishEchoTopFrame, readEchoTopMeta }
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-store.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/src/processors/echo-top-store.js backend/test/echo-top-store.test.js
git commit -m "feat(echo-top): publish frames atomically with per-site status and retention"
```

---

## Task 8: 수집 프로세서와 스케줄 등록 (`echo-top-processor.js`)

**Files:**
- Create: `backend/src/processors/echo-top-processor.js`
- Modify: `backend/src/index.js` (13행 부근 import, 29행 `locks`, 105행 부근 수집 목록, 150행 부근 cron)
- Test: `backend/test/echo-top-processor.test.js`

**Interfaces:**
- Consumes: `parseQcdVolume`, `observedBucketMs`, `isSameFiveMinuteBucket` (Task 6), `computeSiteEchoTop`, `mergeSiteEchoTops`, `encodeEchoTopBinary`, `renderEchoTopRgba` (Task 4·5), `publishEchoTopFrame` (Task 7), `fetchWithTimeout` (`backend/src/lib/fetchWithTimeout.js`)
- Produces:
  - `collectSite({ stn, tm, requestedMs, deps })` → `{ stn, status, observedAt, volume, reason? }`
  - `process(deps = {})` → `{ type: 'radar_echo_top', saved, tm, siteCount, reason? }`
  - `deps` 주입 지점: `{ config, fetchFile, parseVolume, publish, root, now }`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/echo-top-processor.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { collectSite, process as runEchoTop } from '../src/processors/echo-top-processor.js'

const requestedMs = Date.UTC(2026, 6, 25, 11, 35)
const goodVolume = { latitude: 37.44, longitude: 126.96, altitudeM: 500, rangeM: Float32Array.from([10000]), sweeps: [], timeCoverageStart: '2026-07-25T11:36:10Z' }

test('a file whose observation falls in the requested bucket is accepted', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => goodVolume },
  })
  assert.equal(result.status, 'ok')
  assert.equal(result.observedAt, '2026-07-25T11:35:00.000Z')
})

test('a file from the previous bucket is rejected as stale, never republished', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => ({ ...goodVolume, timeCoverageStart: '2026-07-25T11:28:00Z' }) },
  })
  assert.equal(result.status, 'stale')
  assert.equal(result.volume, null)
})

test('a missing file is reported as missing, not as a crash', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => null, parseVolume: async () => goodVolume },
  })
  assert.equal(result.status, 'missing')
})

test('a parse failure is reported as failed with its reason', async () => {
  const result = await collectSite({
    stn: 'AAA', tm: '202607252035', requestedMs,
    deps: { fetchFile: async () => Buffer.from('x'), parseVolume: async () => { throw new Error('bad header') } },
  })
  assert.equal(result.status, 'failed')
  assert.equal(result.reason, 'bad header')
})

test('one failing site does not discard the healthy sites', async () => {
  const published = []
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: ['AAA', 'BBB'], threshold_dbz: 18, concurrency: 2, timeout_ms: 1000, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    fetchFile: async (stn) => (stn === 'BBB' ? null : Buffer.from('x')),
    parseVolume: async () => goodVolume,
    publish: (payload) => { published.push(payload); return { tm: payload.tm } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 55)),
  })
  assert.equal(result.saved, true)
  assert.equal(published.length, 1)
  assert.deepEqual(published[0].sites.map((s) => s.status), ['ok', 'missing'])
})

test('when no site produces a valid frame nothing is published', async () => {
  const published = []
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: ['AAA'], threshold_dbz: 18, concurrency: 1, timeout_ms: 1000, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    fetchFile: async () => null,
    parseVolume: async () => goodVolume,
    publish: (payload) => { published.push(payload); return { tm: payload.tm } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 55)),
  })
  assert.equal(result.saved, false)
  assert.equal(published.length, 0)
})

test('an empty site list fails loudly instead of publishing an empty frame', async () => {
  const result = await runEchoTop({
    config: { radar_echo_top: { enabled: true, sites: [], concurrency: 1, timeout_ms: 1, retry: 0, delay_minutes: 15, max_frames: 3, stride: 4 }, api: { radar_satellite_auth_key: 'k' }, storage: { base_path: '/tmp/none' } },
    now: () => new Date(Date.UTC(2026, 6, 25, 11, 55)),
  })
  assert.equal(result.saved, false)
  assert.equal(result.reason, 'no sites configured')
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-processor.test.js`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`backend/src/processors/echo-top-processor.js`:

```js
import sharp from 'sharp'
import defaultConfig from '../config.js'
import { fetchWithTimeout } from '../lib/fetchWithTimeout.js'
import { ECHO_TOP_GRID } from '../lib/echo-top-grid.js'
import { isSameFiveMinuteBucket, observedBucketMs, parseQcdVolume } from '../parsers/radar-qcd-parser.js'
import { computeSiteEchoTop, encodeEchoTopBinary, mergeSiteEchoTops, renderEchoTopRgba } from './echo-top-model.js'
import { publishEchoTopFrame } from './echo-top-store.js'

const OUTPUT_WIDTH = 1600

function formatKstTm(dateUtc) {
  const kst = new Date(dateUtc.getTime() + 9 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${kst.getUTCFullYear()}${p(kst.getUTCMonth() + 1)}${p(kst.getUTCDate())}${p(kst.getUTCHours())}${p(kst.getUTCMinutes())}`
}

async function defaultFetchFile(stn, tm, { config }) {
  const params = new URLSearchParams({ tm, data: 'qcd', stn, authKey: config.api.radar_satellite_auth_key })
  const response = await fetchWithTimeout(`${config.radar_echo_top.url}?${params.toString()}`, config.radar_echo_top.timeout_ms)
  if (!response.ok) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  // HDF5 시그니처가 아니면 파일 부재 안내문 등 비HDF5 응답이다.
  const isHdf5 = buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x48 && buffer[2] === 0x44 && buffer[3] === 0x46
  return isHdf5 ? buffer : null
}

export async function collectSite({ stn, tm, requestedMs, deps = {} }) {
  const fetchFile = deps.fetchFile || ((s, t) => defaultFetchFile(s, t, { config: deps.config || defaultConfig }))
  const parseVolume = deps.parseVolume || parseQcdVolume
  const retry = deps.config?.radar_echo_top?.retry ?? 0

  for (let attempt = 0; attempt <= retry; attempt += 1) {
    try {
      const buffer = await fetchFile(stn, tm)
      if (!buffer) { if (attempt < retry) continue; return { stn, status: 'missing', observedAt: null, volume: null } }

      const volume = await parseVolume(buffer, { stn })
      const observedMs = observedBucketMs(volume)
      if (!isSameFiveMinuteBucket(observedMs, requestedMs)) {
        // FR-002: 다른 bucket의 파일을 이 프레임으로 발행하지 않는다.
        return { stn, status: 'stale', observedAt: Number.isFinite(observedMs) ? new Date(observedMs).toISOString() : null, volume: null }
      }
      return { stn, status: 'ok', observedAt: new Date(observedMs).toISOString(), volume }
    } catch (error) {
      if (attempt < retry) continue
      // 키가 로그에 새지 않도록 메시지만 남긴다.
      return { stn, status: 'failed', observedAt: null, volume: null, reason: error.message }
    }
  }
  return { stn, status: 'failed', observedAt: null, volume: null, reason: 'exhausted' }
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }))
  return results
}

export async function process(deps = {}) {
  const config = deps.config || defaultConfig
  const settings = config.radar_echo_top
  if (!settings?.enabled) return { type: 'radar_echo_top', saved: false, reason: 'disabled' }
  if (!config.api.radar_satellite_auth_key) throw new Error('Radar echo top auth key missing (set KMA_RADAR_SATELLITE_AUTH_KEY)')
  if (!settings.sites.length) return { type: 'radar_echo_top', saved: false, reason: 'no sites configured' }

  const now = (deps.now || (() => new Date()))()
  const targetMs = Math.floor((now.getTime() - settings.delay_minutes * 60 * 1000) / (5 * 60 * 1000)) * 5 * 60 * 1000
  const tm = formatKstTm(new Date(targetMs))

  const collected = await mapWithConcurrency(settings.sites, settings.concurrency, (stn) =>
    collectSite({ stn, tm, requestedMs: targetMs, deps: { ...deps, config } }))

  const sites = collected.map(({ stn, status, observedAt, reason }) => ({ stn, status, observedAt, ...(reason ? { reason } : {}) }))
  const usable = collected.filter((site) => site.status === 'ok' && site.volume)
  for (const site of collected) {
    if (site.status !== 'ok') console.warn(`echo_top: ${site.stn} ${site.status}${site.reason ? ` (${site.reason})` : ''} for ${tm}`)
  }
  if (!usable.length) return { type: 'radar_echo_top', saved: false, tm, siteCount: { ok: 0, total: sites.length }, reason: 'no usable site' }

  const siteResults = usable.map((site) => ({ stn: site.stn, ...computeSiteEchoTop(site.volume, { thresholdDbz: settings.threshold_dbz, grid: ECHO_TOP_GRID }) }))
  const composite = mergeSiteEchoTops(siteResults, { grid: ECHO_TOP_GRID })

  // 기존 레이더 PNG와 같은 경계를 쓴다 — 두 레이어가 픽셀 단위로 겹치게 하기 위해서다.
  const echoMeta = deps.readEchoMeta ? deps.readEchoMeta() : null
  const bounds = echoMeta?.nationwide?.bounds || deps.bounds || [[30.0, 120.0], [44.0, 136.0]]
  const [[south, west], [north, east]] = bounds
  const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const width = OUTPUT_WIDTH
  const height = Math.max(1, Math.round(((mercY(north) - mercY(south)) / ((east - west) * Math.PI / 180)) * width))

  const rgba = renderEchoTopRgba(composite, { grid: ECHO_TOP_GRID, width, height, bounds })
  const image = deps.renderImage
    ? await deps.renderImage(rgba, width, height)
    : await sharp(rgba, { raw: { width, height, channels: 4 } }).webp({ quality: 80 }).toBuffer()

  const publish = deps.publish || publishEchoTopFrame
  publish({
    root: deps.root || config.storage.base_path,
    tm,
    composite: encodeEchoTopBinary(composite, { grid: ECHO_TOP_GRID }),
    image, bounds, width, height, sites,
    maxFrames: settings.max_frames,
  })

  return { type: 'radar_echo_top', saved: true, tm, siteCount: { ok: usable.length, total: sites.length } }
}

export default { process, collectSite }
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-processor.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: `index.js`에 락·수집·cron 등록**

`backend/src/index.js`:
- 13행 `import radarEchoProcessor ...` 아래에 `import echoTopProcessor from './processors/echo-top-processor.js'`
- 29행 `locks` 객체의 `radar_echo: false,` 뒤에 `echo_top: false,`
- 105행 `["radar_echo", radarEchoProcessor.process],` 아래에 `["echo_top", echoTopProcessor.process],`
- 150행 cron 등록 아래에:

```js
  cron.schedule(config.schedule.echo_top_interval, () => runWithLock("echo_top", echoTopProcessor.process));
```

- [ ] **Step 6: 백엔드 전체 테스트**

Run: `npm --prefix backend test`
Expected: 전체 PASS

- [ ] **Step 7: 커밋**

```bash
git add backend/src/processors/echo-top-processor.js backend/src/index.js backend/test/echo-top-processor.test.js
git commit -m "feat(echo-top): collect QCD sites with bucket validation and partial-failure tolerance"
```

---

## Task 9: API — 정적 가드와 지점 조회

**Files:**
- Modify: `backend/server.js` (118행 `setGeneratedDataCacheHeaders`, 155행 `.bin` 가드, 879행 부근 라우트)
- Test: `backend/test/echo-top-api.test.js`

**Interfaces:**
- Consumes: `echoTopIndexForLatLon` (Task 2), `decodeEchoTopRecord` (Task 5)
- Produces: `GET /api/radar/echo-top-point?tm=&lat=&lon=` → `200 { tm, observedAt, heightM, ft, fl, quality, qualityCode, threshold_dbz: 18, reference: 'MSL', site }` / `400 invalid_query` / `404 frame_not_found | point_unavailable` / `503 data_unavailable`
- Produces: `GET /api/radar/echo-top-meta` → `echotop_meta.json`

- [ ] **Step 1: 실패하는 테스트 작성**

`backend/test/echo-top-api.test.js` (`convective-satellite-api.test.js`의 서버 기동 패턴을 그대로 따른다):

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ECHO_TOP_GRID, echoTopIndexForLatLon } from '../src/lib/echo-top-grid.js'
import { ECHO_TOP_QUALITY, encodeEchoTopBinary } from '../src/processors/echo-top-model.js'

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app)
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

let root
let server

test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'echotop-api-'))
  process.env.NODE_ENV = 'test'
  process.env.DATA_PATH = root
  process.env.DISABLE_COLLECTION = '1'

  const dir = path.join(root, 'radar', 'echotop')
  fs.mkdirSync(dir, { recursive: true })

  const size = ECHO_TOP_GRID.nx * ECHO_TOP_GRID.ny
  const heightM = new Float32Array(size)
  const quality = new Uint8Array(size).fill(ECHO_TOP_QUALITY.INVALID)
  const siteIndex = new Uint8Array(size).fill(255)
  const index = echoTopIndexForLatLon(37.5, 127.0)
  heightM[index] = 9327; quality[index] = ECHO_TOP_QUALITY.INTERPOLATED; siteIndex[index] = 0

  fs.writeFileSync(path.join(dir, 'echotop_202607252035.bin'), encodeEchoTopBinary({ heightM, quality, siteIndex }, { grid: ECHO_TOP_GRID }))
  fs.writeFileSync(path.join(dir, 'echotop_202607252035.webp'), Buffer.from('webp'))
  fs.writeFileSync(path.join(dir, 'echotop_meta.json'), JSON.stringify({
    type: 'RADAR_ECHO_TOP', tm: '202607252035', threshold_dbz: 18, reference: 'MSL',
    frames: [{ tm: '202607252035', observedAt: '2026-07-25T11:35:00.000Z', path: '/data/radar/echotop/echotop_202607252035.webp', sites: [{ stn: 'AAA', status: 'ok', observedAt: '2026-07-25T11:35:00.000Z' }], siteCount: { ok: 1, total: 1 } }],
  }))

  const { default: app } = await import('../server.js')
  server = await listen(app)
})

test.after(() => { server?.close(); fs.rmSync(root, { recursive: true, force: true }) })

function get(pathname) {
  const { port } = server.address()
  return fetch(`http://127.0.0.1:${port}${pathname}`)
}

test('point query returns FL, feet and the interpolation state', async () => {
  const response = await get('/api/radar/echo-top-point?tm=202607252035&lat=37.5&lon=127.0')
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.heightM, 9327)
  assert.equal(body.fl, 306)
  assert.equal(body.quality, 'interpolated')
  assert.equal(body.threshold_dbz, 18)
  assert.equal(body.reference, 'MSL')
  assert.equal(body.observedAt, '2026-07-25T11:35:00.000Z')
  assert.equal(body.site, 'AAA')
})

test('a cell without an echo top is 404, not a fabricated value', async () => {
  const response = await get('/api/radar/echo-top-point?tm=202607252035&lat=33.0&lon=126.0')
  assert.equal(response.status, 404)
})

test('a malformed query is rejected', async () => {
  assert.equal((await get('/api/radar/echo-top-point?tm=nope&lat=37.5&lon=127.0')).status, 400)
  assert.equal((await get('/api/radar/echo-top-point?tm=202607252035&lat=999&lon=127.0')).status, 400)
})

test('an unknown frame is 404', async () => {
  assert.equal((await get('/api/radar/echo-top-point?tm=202607252000&lat=37.5&lon=127.0')).status, 404)
})

test('the raw composite binary is never served to the browser', async () => {
  assert.equal((await get('/data/radar/echotop/echotop_202607252035.bin')).status, 404)
  assert.equal((await get('/data/radar/echotop/echotop_202607252035.webp')).status, 200)
})

test('the meta endpoint serves the published frame list', async () => {
  const body = await (await get('/api/radar/echo-top-meta')).json()
  assert.equal(body.tm, '202607252035')
})
```

- [ ] **Step 2: 실패 확인**

Run: `node --test backend/test/echo-top-api.test.js`
Expected: FAIL — 404 for `/api/radar/echo-top-point`

- [ ] **Step 3: `server.js` 수정**

60행 import 블록에 추가:

```js
import { echoTopIndexForLatLon } from './src/lib/echo-top-grid.js'
import { decodeEchoTopRecord } from './src/processors/echo-top-model.js'
```

`setGeneratedDataCacheHeaders` 안, `radar/echo_korea...` 규칙(121행) 바로 아래에 추가:

```js
  if (/^radar\/echotop\/echotop_\d{12}\.webp$/i.test(relPath)) {
    res.setHeader('Cache-Control', 'public, max-age=10800, immutable')
    return
  }
```

같은 함수의 `no-cache` 메타 목록(143행 `relPath === 'radar/echo_meta.json'` 블록)에 `|| relPath === 'radar/echotop/echotop_meta.json'` 추가.

155행 `.bin` 가드 확장:

```js
app.use('/data', (req, res, next) => {
  if (/^\/satellite\/convective\/ctps_\d{12}\.bin$/i.test(req.path)) return res.status(404).end()
  // 사이트별 원시 gate 배열이 담긴 합성 바이너리는 브라우저에 절대 노출하지 않는다(FR-009).
  if (/^\/radar\/echotop\/echotop_\d{12}\.bin$/i.test(req.path)) return res.status(404).end()
  next()
})
```

879행 `/api/radar/echo-meta` 라우트 아래에 추가:

```js
app.get('/api/radar/echo-top-meta', (_req, res) =>
  sendJsonFile(res, path.join(DATA_ROOT, 'radar', 'echotop', 'echotop_meta.json')),
)

app.get('/api/radar/echo-top-point', (req, res) => {
  const { tm, lat, lon } = req.query
  const latitude = Number(lat)
  const longitude = Number(lon)
  if (typeof tm !== 'string' || !/^\d{12}$/.test(tm)
    || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return res.status(400).json({ error: 'invalid_query' })
  }

  const meta = readJsonFileSafe(path.join(DATA_ROOT, 'radar', 'echotop', 'echotop_meta.json'))
  const frame = meta?.frames?.find((item) => item.tm === tm)
  if (!frame) return res.status(404).json({ error: 'frame_not_found' })

  const index = echoTopIndexForLatLon(latitude, longitude)
  if (index === null) return res.status(404).json({ error: 'point_unavailable' })

  try {
    const binary = fs.readFileSync(path.join(DATA_ROOT, 'radar', 'echotop', `echotop_${tm}.bin`))
    const point = decodeEchoTopRecord(binary, index)
    if (!point) return res.status(404).json({ error: 'point_unavailable' })
    sendImmutableJson(res, {
      tm,
      observedAt: frame.observedAt ?? null,
      heightM: point.heightM,
      ft: point.ft,
      fl: point.fl,
      quality: point.quality,
      qualityCode: point.qualityCode,
      threshold_dbz: 18,
      reference: 'MSL',
      site: frame.sites?.[point.siteIndex]?.stn ?? null,
    }, `echo-top-point:${tm}:${latitude}:${longitude}`)
  } catch {
    res.status(503).json({ error: 'data_unavailable' })
  }
})
```

- [ ] **Step 4: 통과 확인**

Run: `node --test backend/test/echo-top-api.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add backend/server.js backend/test/echo-top-api.test.js
git commit -m "feat(echo-top): expose meta and point-query API, block the raw composite"
```

---

## Task 10: 프런트엔드 데이터 모델과 레이어 등록

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js:144` (MET_LAYERS)
- Modify: `frontend/src/features/map/layerActions.js:24` (MET_META)
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx:14,44,50` (아이콘·그룹·라벨)
- Modify: `frontend/src/api/weatherApi.js` (loadWeatherData, 변경감지, 지점 조회)
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` (echoTopFrame)
- Test: `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js` (테스트 추가)

**Interfaces:**
- Produces:
  - `MET_LAYERS`에 `{ id: 'echoTop', label: '에코탑(재산출)', color: '#7E22CE' }`
  - `weatherApi.fetchEchoTopPoint({ tm, lat, lon }, { signal })` → `Promise<object>`
  - `buildWeatherOverlayModel({ echoTopMeta, ... })` 반환값에 `echoTopFrame` — 선택 시각과 **정확히 같은 tm**일 때만 프레임, 아니면 `null`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js` 하단에 추가:

```js
const echoTopMeta = {
  tm: '202607252035',
  frames: [
    { tm: '202607252030', path: '/data/radar/echotop/echotop_202607252030.webp', observedAt: '2026-07-25T11:30:00.000Z', bounds: [[30, 120], [44, 136]], siteCount: { ok: 12, total: 13 } },
    { tm: '202607252035', path: '/data/radar/echotop/echotop_202607252035.webp', observedAt: '2026-07-25T11:35:00.000Z', bounds: [[30, 120], [44, 136]], siteCount: { ok: 13, total: 13 } },
  ],
}
const radarMeta = { tm: '202607252035', frames: [{ tm: '202607252030', path: '/a.png' }, { tm: '202607252035', path: '/b.png' }] }

test('echo top frame is exposed only when its tm matches the selected time exactly', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame.tm, '202607252035')
  assert.equal(model.echoTopFrame.observedAt, '2026-07-25T11:35:00.000Z')
})

test('a selected time with no matching echo top frame yields null, never the previous frame', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta,
    echoTopMeta: { tm: '202607252030', frames: [echoTopMeta.frames[0]] },
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame, null)
})

test('the echo top frame is hidden while the layer is off', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: false },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 35),
  })
  assert.equal(model.echoTopFrame, null)
})

test('partial site coverage is carried on the frame so the UI can flag it', () => {
  const model = buildWeatherOverlayModel({
    echoMeta: radarMeta, echoTopMeta,
    visibility: { radar: true, echoTop: true },
    selectedWeatherTimeMs: Date.UTC(2026, 6, 25, 11, 30),
  })
  assert.equal(model.echoTopFrame.partial, true)
  assert.deepEqual(model.echoTopFrame.siteCount, { ok: 12, total: 13 })
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix frontend test -- weatherOverlayModel`
Expected: FAIL — `model.echoTopFrame is undefined`

- [ ] **Step 3: 구현**

`weatherOverlayLayers.js` `MET_LAYERS`의 `{ id: 'radarOverseas', ... }` 다음 줄에 추가:

```js
  { id: 'echoTop', label: '에코탑(재산출)', color: '#7E22CE' },
```

`layerActions.js` `MET_META`의 `radarOverseas` 다음 줄에 추가:

```js
  echoTop: { label: '에코탑(재산출)', aliases: ['에코탑', 'echo top', 'echotop', '에코 top', '구름 높이 레이더'] },
```

`WeatherOverlayPanel.jsx`:
- 2~4행 import에 `Mountain`을 추가하고, `WEATHER_TILE_ICON`의 `radarOverseas` 아래에 `echoTop: Mountain,`
- 44행 그룹: `{ id: 'radar', title: '레이더', ids: ['radar', 'radarOverseas', 'echoTop', 'lightning'] },`
- 52행 라벨: `echoTop: '에코탑(재산출)',`

`weatherApi.js`:
- `loadWeatherData()`의 `Promise.all` 배열에서 `fetchJson('/data/radar/rainviewer_meta.json', ...)` 다음에 `fetchJson('/data/radar/echotop/echotop_meta.json', { optional: true }),`를 추가하고, 구조분해 이름 목록과 반환 객체에 `echoTopMeta`를 추가한다.
- `buildHashEntry` 스냅샷 함수(124행 부근)에 추가: `echoTopMeta: data.echoTopMeta?.tm ? { tm: data.echoTopMeta.tm } : null,`
- 변경 감지(333행 부근)에 추가:

```js
  if (changes.echoTopMeta) { fetches.push(fetchJson('/data/radar/echotop/echotop_meta.json', { optional: 'preserve' })); keys.push('echoTopMeta') }
```

- `fetchConvectiveCtpsPoint` 아래에 추가:

```js
export async function fetchEchoTopPoint({ tm, lat, lon }, { signal } = {}) {
  const params = new URLSearchParams({ tm, lat: String(lat), lon: String(lon) })
  return fetchJson(`/api/radar/echo-top-point?${params.toString()}`, { signal })
}
```

`weatherOverlayModel.js`:
- `buildWeatherOverlayModel`의 인자 목록에 `echoTopMeta,`를 추가(`rainviewerMeta` 옆).
- `const radarFrame = pickNearestPreviousFrame(...)` 아래에 추가:

```js
  // Echo Top은 재산출 산출물이라 "가장 가까운 과거 프레임" 대체가 금지된다(FR-002/FR-005).
  // 선택 시각과 tm이 정확히 같은 프레임만 쓰고, 없으면 레이어를 숨긴다.
  const echoTopFrames = normalizeFrames(echoTopMeta?.frames?.length ? echoTopMeta.frames : [echoTopMeta?.latest])
  const echoTopExact = visibility.echoTop
    ? echoTopFrames.find((frame) => frame.timeMs === resolvedWeatherTimeMs) || null
    : null
  const echoTopFrame = echoTopExact
    ? {
      ...echoTopExact,
      partial: Number.isFinite(echoTopExact.siteCount?.ok)
        && Number.isFinite(echoTopExact.siteCount?.total)
        && echoTopExact.siteCount.ok < echoTopExact.siteCount.total,
    }
    : null
```

- 타임라인 눈금(`buildTimelineTicks` 호출)에 한 줄 추가: `visibility.echoTop ? echoTopFrames : [],`
- `weatherTimelineVisible` 조건에 `|| visibility.echoTop` 추가.
- 반환 객체에 `echoTopFrame,` 추가.

- [ ] **Step 4: 통과 확인**

Run: `npm --prefix frontend test -- weatherOverlayModel layerActions`
Expected: PASS (기존 `layerActions.test.js` 커버리지 테스트도 통과 — MET_META 등록을 빠뜨리면 여기서 깨진다)

- [ ] **Step 5: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.js frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/map/layerActions.js frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/api/weatherApi.js
git commit -m "feat(echo-top): register the layer and expose exact-time frame selection"
```

---

## Task 11: 지도 레이어·범례·클릭 상세정보

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/echoTopLayers.js`
- Create: `frontend/src/features/weather-overlays/lib/useEchoTopOverlay.js`
- Create: `frontend/src/features/weather-overlays/EchoTopCard.jsx`
- Test: `frontend/src/features/weather-overlays/lib/echoTopLayers.test.js`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx:27,260,309`
- Modify: `frontend/src/features/map/MapView.jsx` (699행 부근 훅 배선, 1615행 부근 범례, 1712행 부근 카드)

**Interfaces:**
- Consumes: `echoTopFrame` (Task 10), `fetchEchoTopPoint` (Task 10), `setMapLayerVisible` (`frontend/src/features/map/lib/mapLayerUtils.js`)
- Produces:
  - `ECHO_TOP_SOURCE = 'radar-echotop-source'`, `ECHO_TOP_LAYER = 'radar-echotop-raster'`
  - `syncEchoTopLayer(map, { frame, visible })` → `boolean` (표시 여부)
  - `useEchoTopOverlay({ mapRef, isStyleReady, styleRevision, visible, frame, fetchPoint })` → `{ selection, clearSelection }`
  - `<EchoTopCard selection={...} tz="KST" />`

- [ ] **Step 1: 실패하는 테스트 작성**

`frontend/src/features/weather-overlays/lib/echoTopLayers.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { ECHO_TOP_LAYER, ECHO_TOP_SOURCE, syncEchoTopLayer } from './echoTopLayers.js'

function fakeMap() {
  const sources = new Map()
  const layers = new Map()
  return {
    sources, layers,
    getSource: (id) => sources.get(id),
    addSource: (id, def) => sources.set(id, { ...def, updateImage: (next) => sources.set(id, { ...def, ...next }) }),
    removeSource: (id) => sources.delete(id),
    getLayer: (id) => layers.get(id),
    addLayer: (def) => layers.set(def.id, { ...def, layout: {} }),
    removeLayer: (id) => layers.delete(id),
    setLayoutProperty: (id, key, value) => { layers.get(id).layout[key] = value },
  }
}

const frame = { path: '/data/radar/echotop/echotop_202607252035.webp', bounds: [[30, 120], [44, 136]] }

test('a valid frame installs the image source and shows the layer', () => {
  const map = fakeMap()
  assert.equal(syncEchoTopLayer(map, { frame, visible: true }), true)
  assert.ok(map.getSource(ECHO_TOP_SOURCE))
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'visible')
})

test('turning the layer off hides it without tearing the source down', () => {
  const map = fakeMap()
  syncEchoTopLayer(map, { frame, visible: true })
  assert.equal(syncEchoTopLayer(map, { frame, visible: false }), false)
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'none')
})

test('a null frame hides the layer — no stale image is left on the map', () => {
  const map = fakeMap()
  syncEchoTopLayer(map, { frame, visible: true })
  assert.equal(syncEchoTopLayer(map, { frame: null, visible: true }), false)
  assert.equal(map.getLayer(ECHO_TOP_LAYER).layout.visibility, 'none')
})

test('a frame without bounds is refused rather than rendered at the wrong place', () => {
  const map = fakeMap()
  assert.equal(syncEchoTopLayer(map, { frame: { path: '/x.webp' }, visible: true }), false)
})
```

- [ ] **Step 2: 실패 확인**

Run: `npm --prefix frontend test -- echoTopLayers`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현**

`frontend/src/features/weather-overlays/lib/echoTopLayers.js`:

```js
import { setMapLayerVisible } from '../../map/lib/mapLayerUtils.js'

export const ECHO_TOP_SOURCE = 'radar-echotop-source'
export const ECHO_TOP_LAYER = 'radar-echotop-raster'

function imageCoordinates(bounds) {
  if (!Array.isArray(bounds) || bounds.length !== 2) return null
  const [[south, west], [north, east]] = bounds
  return [south, west, north, east].every(Number.isFinite)
    ? [[west, north], [east, north], [east, south], [west, south]]
    : null
}

export function syncEchoTopLayer(map, { frame, visible }) {
  const url = frame?.path
  const coordinates = imageCoordinates(frame?.bounds)
  const usable = Boolean(url && coordinates)

  if (usable) {
    const source = map.getSource(ECHO_TOP_SOURCE)
    if (source?.updateImage) source.updateImage({ url, coordinates })
    else if (!source) map.addSource(ECHO_TOP_SOURCE, { type: 'image', url, coordinates })
    if (!map.getLayer(ECHO_TOP_LAYER)) {
      map.addLayer({ id: ECHO_TOP_LAYER, type: 'raster', source: ECHO_TOP_SOURCE, slot: 'middle', paint: { 'raster-opacity': 0.65, 'raster-fade-duration': 0 } })
    }
  }

  const shown = Boolean(usable && visible)
  if (map.getLayer(ECHO_TOP_LAYER)) setMapLayerVisible(map, ECHO_TOP_LAYER, shown)
  return shown
}
```

`frontend/src/features/weather-overlays/lib/useEchoTopOverlay.js`:

```js
import { useEffect, useRef, useState } from 'react'
import { syncEchoTopLayer } from './echoTopLayers.js'

export function useEchoTopOverlay({ mapRef, isStyleReady, styleRevision, visible, frame, fetchPoint }) {
  const [selection, setSelection] = useState(null)
  const [point, setPoint] = useState(null)
  const requestTokenRef = useRef(0)

  useEffect(() => {
    const map = mapRef.current
    if (map && isStyleReady) syncEchoTopLayer(map, { frame, visible })
  }, [mapRef, isStyleReady, styleRevision, frame, visible])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !isStyleReady) return undefined
    const onClick = (event) => setPoint({ lng: event.lngLat.lng, lat: event.lngLat.lat, mapPoint: event.point })
    map.on('click', onClick)
    return () => map.off?.('click', onClick)
  }, [mapRef, isStyleReady])

  useEffect(() => {
    // OFF이거나 이 시각에 프레임이 없으면 값도 함께 사라져야 한다(UI 계약: Toggle off, No matching frame).
    if (!visible || !frame?.tm || !fetchPoint) {
      requestTokenRef.current += 1
      setPoint(null)
      setSelection(null)
      return undefined
    }
    if (!point) return undefined

    const token = ++requestTokenRef.current
    const controller = new AbortController()
    fetchPoint({ tm: frame.tm, lat: point.lat, lon: point.lng }, { signal: controller.signal })
      .then((value) => {
        if (token !== requestTokenRef.current || controller.signal.aborted) return
        setSelection({ lng: point.lng, lat: point.lat, point: point.mapPoint, echoTop: value, partial: Boolean(frame.partial) })
      })
      .catch(() => {
        if (token !== requestTokenRef.current || controller.signal.aborted) return
        setSelection(null)
      })
    return () => controller.abort()
  }, [visible, frame, point, fetchPoint])

  const clearSelection = () => { requestTokenRef.current += 1; setPoint(null); setSelection(null) }
  return { selection, clearSelection }
}
```

`frontend/src/features/weather-overlays/EchoTopCard.jsx`:

```js
function formatObservedAt(observedAt, tz) {
  if (!observedAt) return null
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: tz === 'UTC' ? 'UTC' : 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(observedAt))
}

function formatCoordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(4)}°${value >= 0 ? positive : negative}`
}

export default function EchoTopCard({ selection, tz = 'KST' }) {
  const value = selection?.echoTop
  if (!value) return null
  const style = selection.point && {
    '--convective-card-x': `${selection.point.x}px`,
    '--convective-card-y': `${selection.point.y}px`,
  }
  return (
    <section className="convective-overlay-card" aria-label="선택 지점의 재산출 에코탑 상세" style={style}>
      <strong>{formatCoordinate(selection.lat, 'N', 'S')}, {formatCoordinate(selection.lng, 'E', 'W')}</strong>
      <span className="convective-overlay-card__time">관측 {formatObservedAt(value.observedAt, tz)} {tz}</span>
      <div>에코탑: FL{value.fl} · {value.ft.toLocaleString('en-US')} ft MSL</div>
      <div className="convective-legend__note">
        재산출 · 18 dBZ · MSL · {value.quality === 'interpolated' ? '보간값' : '보수적 하한(빔 중심)'}
        {selection.partial ? ' · 일부 사이트 결측' : ''}
      </div>
    </section>
  )
}
```

- [ ] **Step 4: 범례 추가 (`WeatherLegends.jsx`)**

27행 `CTPS_LEGEND` 아래에 추가하고, 두 레이어가 같은 FL 밴드 색을 공유함을 주석으로 남긴다:

```js
// Echo Top(재산출)은 위성 운정고도와 같은 물리량(높이)이라 같은 FL 밴드 색을 쓴다.
// 색은 높이만 뜻하며 위험등급·회피 권고가 아니다.
const ECHO_TOP_LEGEND = CTPS_LEGEND
```

- 33행 props에 `echoTopLegendVisible = false,` 추가
- 260행 CTPS 범례 아래에 추가:

```jsx
      {echoTopLegendVisible && <ConvectiveLegend title="에코탑(재산출)" entries={ECHO_TOP_LEGEND} note="재산출 · 18 dBZ · MSL — KMA 공식 ETOP 아님" />}
```

- 295행 조기 반환 조건에 `&& !echoTopLegendVisible` 추가
- 309행 모바일 독 목록에 추가: `echoTopLegendVisible && { key: 'echoTop', title: '에코탑(재산출) · FL', entries: ECHO_TOP_LEGEND },`

- [ ] **Step 5: `MapView.jsx` 배선**

- import 추가: `import { useEchoTopOverlay } from '../weather-overlays/lib/useEchoTopOverlay.js'`, `import EchoTopCard from '../weather-overlays/EchoTopCard.jsx'`, 그리고 `weatherApi`에서 `fetchEchoTopPoint`
- 699행 `useConvectiveOverlay({...})` 호출 아래에 추가:

```js
  const echoTopOverlay = useEchoTopOverlay({
    mapRef, isStyleReady, styleRevision,
    visible: metVisibility.echoTop,
    frame: weatherOverlayModel.echoTopFrame,
    fetchPoint: fetchEchoTopPoint,
  })
```

- 1615행 `<WeatherLegends ... ctpsLegendVisible={...}` 옆에 `echoTopLegendVisible={!!metVisibility.echoTop && !!weatherOverlayModel.echoTopFrame}` 추가
- 1712행 `<ConvectiveOverlayControls ... />` 옆에 추가: `<EchoTopCard selection={echoTopOverlay.selection} tz={tz} />`
- `weatherData.echoTopMeta`를 `buildWeatherOverlayModel` 입력에 `echoTopMeta={...}`로 전달 (662행 부근 모델 입력 객체)
- 자료 없음 안내: 레이어 ON인데 `echoTopFrame`이 null이면 기존 `rainviewerOutOfRange` 안내와 같은 자리에 "이 시각 에코탑 자료 없음"을 띄운다(같은 컴포넌트 패턴 재사용).

- [ ] **Step 6: 프런트엔드 테스트 전체 실행**

Run: `npm --prefix frontend test`
Expected: 전체 PASS

- [ ] **Step 7: 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 8: 커밋**

```bash
git add frontend/src/features/weather-overlays/lib/echoTopLayers.js frontend/src/features/weather-overlays/lib/echoTopLayers.test.js frontend/src/features/weather-overlays/lib/useEchoTopOverlay.js frontend/src/features/weather-overlays/EchoTopCard.jsx frontend/src/features/weather-overlays/WeatherLegends.jsx frontend/src/features/map/MapView.jsx
git commit -m "feat(echo-top): draw the overlay, legend and click inspector"
```

---

## Task 12: 브라우저 계약 검증 · 용량 측정 · 문서

스펙 Gate 4·5·6.

**Files:**
- Create: `frontend/verification/contracts/echo-top.spec.mjs`
- Modify: `docs/policies/verification/contracts.md` (Active 표)
- Modify: `Architecture.md` (레이더/기상 레이어 절)
- Modify: `docs/superpowers/status/radar-derived-echo-top.status.md`

- [ ] **Step 1: Playwright 계약 작성**

`frontend/verification/contracts/echo-top.spec.mjs` — 기존 `map-base.spec.mjs`의 뼈대(뷰포트 3종, 셀렉터 규약)를 그대로 따르고 다음을 단언한다:

1. 초기 상태에서 `echoTop` 타일이 OFF이고 `radar-echotop-raster` 레이어가 보이지 않는다.
2. 타일을 켜면 레이어가 보이고 범례에 `재산출`, `18 dBZ`, `MSL` 문자열이 모두 나타난다.
3. 5분 시간축을 한 칸 이동해 대응 프레임이 없는 시각으로 가면 레이어가 숨겨지고 자료 없음 안내가 뜬다.
4. 부분 커버리지 프레임(fixture)에서 부분 커버리지 표시가 나타난다.
5. 지도를 클릭하면 상세정보에 `FL`·`ft MSL`·보간 상태가 보인다.
6. 타일을 다시 끄면 레이어와 상세정보가 모두 사라진다.

fixture는 `route-fixture.mjs` 패턴대로 `/api/radar/echo-top-meta`, `/data/radar/echotop/*.webp`, `/api/radar/echo-top-point`를 가로채 고정 응답을 준다.

- [ ] **Step 2: 계약 실행 (증거 확보)**

Run: `npm run dev:contract -- --grep echo-top`
Expected: 3개 뷰포트 전부 PASS. 출력 전문을 상태 문서에 붙인다. **실패하면 `superpowers:systematic-debugging`으로 근본원인을 잡는다 — 단언을 완화하지 않는다.**

- [ ] **Step 3: 실 데이터 운영 검증 (Gate 4)**

`RADAR_ECHO_TOP_ENABLED=1`로 백엔드를 띄우고 최소 3프레임을 수집한 뒤, 같은 시각의 레이더 반사도 대류 셀과 Echo Top 고값 영역이 공간적으로 일치하는지 스크린샷으로 확인한다. KMA 공식 ETOP과의 수치 동등성은 판정 기준이 아니다.

- [ ] **Step 4: 용량·처리시간 측정 (Gate 6)**

12~13개 사이트에서 5분 주기 10회 이상 돌린 뒤 기록: 프레임당 총 처리시간(중앙값·최대), 사이트별 다운로드 실패율, 프로세스 최대 RSS, 프레임 산출물 크기. **5분 안에 안정적으로 끝나지 않으면 사이트 확대를 진행하지 않고 상태 문서에 그대로 적는다.**

- [ ] **Step 5: 계약 등록과 문서 갱신**

`docs/policies/verification/contracts.md`의 Active 표에 한 행 추가:

```
| `echo-top` | `echoTopLayers.js`, `useEchoTopOverlay.js`, `WeatherLegends.jsx` | desktop, iPad landscape, mobile | `echo-top-fixture.mjs`가 meta·이미지·지점조회 API를 가로챔 | `frontend/verification/contracts/echo-top.spec.mjs` | frontend | active — passed YYYY-MM-DD |
```

`Architecture.md`의 기상 레이어 절에 Echo Top 레이어를 추가한다 — 데이터 원천(레이더 사이트 QCD), 산출 주체(ProjectAMO 재산출), 기준(18 dBZ / MSL), 그리고 기존 최대반사도·운정고도·CI 레이어와 원천이 다르다는 점을 명시(FR-008).

상태 문서에 Gate 3~6 결과와 확정 사이트 수를 기록한다.

- [ ] **Step 6: 그래프 갱신과 최종 검증**

Run: `graphify update .`
Run: `npm run check`
Expected: 백엔드·프런트엔드 테스트 전체 통과 + 빌드 성공

- [ ] **Step 7: 커밋**

```bash
git add frontend/verification/contracts/echo-top.spec.mjs docs/policies/verification/contracts.md Architecture.md docs/superpowers/status/radar-derived-echo-top.status.md graphify-out
git commit -m "test(echo-top): add browser contract, record capacity gates and update docs"
```

---

## Self-Review

**스펙 요구사항 → 작업 매핑**

| 요구사항 | 담당 작업 |
|---|---|
| FR-001 사이트별 수집 + 실제 관측시각·사이트 식별자 기록 | Task 6(파싱), 8(수집), 7(메타 기록) |
| FR-002 5분 bucket 불일치 프레임 발행 금지 | Task 6(`isSameFiveMinuteBucket`), 8(`collectSite` → `stale`), 10(정확 시각 매칭) |
| FR-003 Scientific Processing Contract 준수 | Task 3(빔 기하·보간), 4(격자·합성), 6(scale/fill) |
| FR-004 부분 실패 내성 + 사이트 상태 식별 | Task 8(부분 실패 테스트), 7(`sites`, `siteCount`) |
| FR-005 독립 토글·기본 OFF·정확 시각만 표시 | Task 10(`MET_LAYERS`, `initMetVisibility`가 기본 false), 11(`syncEchoTopLayer`) |
| FR-006 범례·상세정보 표기 | Task 11(범례 note, 카드 note) |
| FR-007 값·단위·보간 여부 | Task 9(API `quality`), 11(`EchoTopCard`) |
| FR-008 기존 레이어와 독립 | Task 10(별도 id·별도 meta), 12(Architecture.md 명시) |
| FR-009 원본·키·gate 배열 비노출 | Task 9(`.bin` 404 가드 + 테스트), 8(로그에 메시지만), Task 1(프로브가 키 미출력) |
| UI 계약: 초기 OFF / 정상 프레임 / 클릭 / 자료 없음 / 부분 커버리지 / stale / 토글 | Task 10~11 구현, Task 12 계약 6항목이 전부 검증 |
| Gate 1 사전 실측 | Task 1 |
| Gate 2 단위 테스트 고정 | Task 3·4·5·6 |
| Gate 3 통합 테스트(시간 일치·부분 실패·stale 거부) | Task 8·9 |
| Gate 4 운영 공간 일관성 | Task 12 Step 3 |
| Gate 5 Playwright | Task 12 Step 1~2 |
| Gate 6 용량 측정 | Task 12 Step 4 |
| Capacity: 동시성·재시도·타임아웃, 한 사이트가 프레임을 막지 않음 | Task 1(config), 8(`mapWithConcurrency`, retry, timeout) |
| Non-goals | 임계값 UI·다중 임계값 없음, UF 경로 미사용, 클라이언트 파싱 없음 — 계획 전체에서 미포함 |

**타입 일관성 확인**

- `SiteVolume` 형태: Task 6이 만들고 Task 4가 소비 — `{ stn, latitude, longitude, altitudeM, rangeM, sweeps[{elevationDeg, azimuthDeg, dbz, scaleFactor, fillValue}] }`로 일치.
- `ECHO_TOP_QUALITY` 코드값(0/1/255)이 Task 3 정의 → Task 4·5 인코딩 → Task 9 API 문자열(`interpolated`/`beam_center_floor`) → Task 11 카드 표기까지 한 줄로 이어짐.
- `echoTopFrame`의 필드(`tm`, `path`, `bounds`, `observedAt`, `partial`, `siteCount`)가 Task 7 메타 레코드 → Task 10 모델 → Task 11 레이어·카드에서 동일 이름으로 쓰임.
- 격자 상수 `ECHO_TOP_GRID`는 Task 2에서 한 번만 정의되고 Task 4·5·8·9가 모두 그것을 import — 격자 정의 중복 없음.

**알려진 잔여 위험 (구현 중 확인할 것)**

1. Task 6의 CF-Radial 필드명(`sweep_start_ray_index` 등)은 검증 표본 구조에 대한 합리적 추정이다. 실제 파일이 다르면 Task 6 Step 4에서 드러나며, 그때 필드명을 실제 구조에 맞춘다(계획의 다른 부분은 영향 없음).
2. Task 4의 방위 정규화(1도 bin)와 평면 근사는 2 km 격자에 충분하지만, Gate 4에서 반사도 셀과 어긋나 보이면 sweep별 실제 ray 방위로 보간하는 방식으로 올린다.
3. 프레임당 처리시간은 사이트 수 × sweep × ray × gate에 비례한다. Gate 6에서 5분을 넘기면 사이트 확대 대신 gate 간격 솎기(range decimation)를 먼저 검토한다.
