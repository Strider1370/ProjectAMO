# 공항 상세 예보 분석 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지원 공항에서 같은 유효시각의 관측·TAF·KIM·ECMWF·GFS·ICON을 표와 그래프로 비교하고 공항 패널에서 요약과 진입 버튼을 제공한다.

**Architecture:** 기존 KIM 격자 수집을 확장하고 해외 모델만 별도 수집기로 등록한다. 실행별 공항 레코드 저장소와 캐시된 API를 거쳐, 하나의 프런트엔드 뷰모델을 패널 요약·전체화면 표·그래프가 공유한다. 독립 화면은 기존 `App.jsx`의 URL 분기 방식으로 추가한다.

**Tech Stack:** Linux, Node.js >=22.23.1, npm, ESM JavaScript, Express, React 19, Vite, 기존 Fluent UI·CSS 토큰, SVG, Node test runner, Playwright. 새 차트 라이브러리·GRIB 런타임 의존성은 추가하지 않는다.

**Spec:** [공항 상세 예보 분석 설계](../specs/2026-09-06-airport-multi-model-comparison-design.md)

**Status:** 계획 검토용. 이 문서는 코드 구현·배포 완료 보고가 아니다. 사용자 요청은 후속 과제 기록과 구현계획 작성까지이며, 여기서 구현을 시작하지 않는다.

**계획 리뷰:** 최초 계획은 2026-09-06 reviewer 검토를 마쳤다. 세부 실행 단계 확장본도 reviewer 재검토를 마쳤고 남은 중대한 계획 지적은 없다. 확장 검토에서 Open-Meteo 요청 시각 형식·stats 초기화·주입 경로 전파·관리자 성공 집계의 지적사항을 추가로 반영했다. API operation 연결, 재시도·watchdog, 스냅샷 탐색, 관리자 표시, GFS 인접 시각 강수, 공항별 발행 직렬화, 시간대 provider, 활성 뷰 revision의 지적사항을 반영했다. 남은 중대한 계획 지적은 없으며 실행 검증은 Task 9에서 수행한다.

## Global Constraints

- 화면 명칭 `상세 예보 분석`, 버튼 `분석 화면 열기 ↗`, 전체화면 제목 `{공항명} 상세 예보 분석`.
- 지원 공항은 RKSI·RKSS·RKPC·RKPU·RKJY·RKJB·RKNY·RKPK. 패널 구획은 AMOS 다음. 사이드바 항목은 추가하지 않는다.
- 첫 구현은 표·그래프·선택 시각의 바람·강수·운고 요약이다. 순위·1등 배지·자동 변화 판단·위험 임계값 강조는 후속 과제다. 모델 행은 KIM → ECMWF → GFS → ICON으로 고정한다.
- KIM·GFS·ICON은 실제 F000~F012. EC는 다른 모델 최신 완전 실행에 맞춰 13개 시각을 이동한다. `valid_at = run_at + forecast_hour`를 보존한다.
- 공통 시간축은 유효시각. UTC 저장·비교, KST 기본 표시 및 UTC 전환. 실제 F-hour는 모델별 상세에 표시한다.
- 패널 기준은 유효 현재시각 이상 첫 정시. 전체화면 진입·새로고침은 같은 선택 시각을 보존한다.
- `기온·RH` 표는 `23.0°C / 74%`처럼 병기. 두 그래프는 같은 시간축·모델 색상을 쓰고 단위별 세로축을 분리한다. TAF 행은 제외한다.
- 결측은 0으로 대체하지 않는다. `예보 범위 밖`, `자료 없음`, `5,000 ft 이하 조건 미검출`, 제공자가 명시한 ceiling 없음을 구분한다.
- 운고 계산·운량 출처·배지는 스펙 「모델별 확정 방식」과 「압력면 추정 절차」가 정본이다. KIM 원 응결물과 결측 코드를 구분하고, EC 습도 추정을 자체 운고로 표시하지 않는다.
- EC/ICON은 Open-Meteo, GFS는 NOMADS GRIB2 부분추출, KIM은 기존 KMA 격자 경로. 브라우저 외부 모델 API 직접 호출과 다른 실행의 셀 혼합은 금지한다.
- 수집기는 실황 `config.storage.base_path`에 쓰고, 사용자 API는 `getActiveDataContext().root`에서 읽는다. 데모 유효시각은 `getEffectiveNow()`를 사용한다.
- 개별 공항 실패가 마지막 완전 실행·구간을 덮지 않는다. 보존 기본값은 해외 모델별 4실행이며 마지막 성공 참조는 보호한다.
- 사용자 요청에 따라 목업·문서 변경에 TDD 절차를 강제하지 않는다. 아래 검증은 실 구현의 시간 계산·파서·발행·화면 동작을 확인하는 집중 검증이다. 문서 작성 단계에서 제품 테스트를 실행한 것으로 보고하지 않는다.
- 각 작업 시작 전 적용 정책과 최신 소스를 읽고, Graphify 쿼리로 관련 경로를 좁힌다. 코드 변경 후 `graphify update .`. 커밋·푸시·배포는 이 계획 작성 요청에 포함하지 않는다.

## 적용 정책과 확인한 기존 연결점

- `Architecture.md`: Frontend `AirportPanel.jsx`·`App.jsx`, Backend 수집·활성 데이터 뷰, Reference Structure.
- `docs/policies/engineering/data-and-time.md`, `docs/policies/engineering/entry-sequences.md`, `docs/policies/design/design-language.md`, `docs/policies/encoding-safety.md`.
- 브라우저 작업: `docs/policies/verification/browser-verification.md`, `docs/policies/verification/contracts.md`, `docs/operations/dev-server-and-capture.md`.
- 기존 KIM: `fetchKimGrid(params)` → `parseKimGridText()` → `kim-surface-wind-processor.js` → `kim-nwp-store.js`. `hasCompleteKimNwpRun()`의 조기 반환이 추가 공항 변수 수집을 건너뛰지 않도록 한다.
- 기존 수집 등록: `collector-registry.js` → `index.js`의 `processorBindings`, `runWithLock`, `buildInitialCollectionJobs`.
- 현재 `AirportPanel.jsx`에 `FULL_FEATURE_AIRPORTS`와 `sections` 배열이 있다. `App.jsx`는 `window.location.pathname`으로 독립 화면을 분기하고 `/?airport=RKSI` 진입을 지원한다.
- 현재 `store.loadRecent(type, limit)`는 실황 루트에서 읽는다. 사용자 비교 API에서 그대로 호출하면 데모 자료와 섞이므로 활성 루트를 받는 옵션을 추가해야 한다.
- 현재 기본 관측 보존은 10파일이며 AMOS는 요청한 최근 60분의 원행 중 현재값만 남긴다. 과거 3시간 표시는 Task 5에서 기존 수집 결과를 보존해 충당한다. 새 관측 API나 백필은 추가하지 않는다.
- 실자료 근거: `artifacts/nwp-live-validation-20260906/` 및 `RKPU/`. 이 경로는 ignored이므로 구현 테스트가 직접 의존하면 안 된다. 재현에 필요한 작은 원자료·기대값만 자격증명 없이 테스트 fixture로 옮긴다.

## 파일 구성과 작업 순서

**필수 화면 참고 자료:** `artifacts/airport-model-comparison-mockup.html` (현재 전체 경로: `/home/john_doe/ProjectAMO/artifacts/airport-model-comparison-mockup.html`). 이 HTML을 상세 화면의 주된 시각·상호작용 참고 자료로 사용한다. Task 8 시작 전에 소스를 읽고 브라우저에서 직접 열어 전체 화면과 요소별 보기를 확인한다. 중앙 비교 영역의 정보 순서, 표·그래프 배치와 밀도, 모델 구분, 범례·상세보기, 오른쪽 보조 카드의 관계를 충분히 참고한다. 문서만 읽고 화면을 새로 설계하지 않는다.

최신 이름·EC 시간 구간·기온RH·후속 과제 분리는 스펙이 우선하며 목업에 남은 순위·자동 판단 카드는 구현하지 않는다. 실제 앱에는 기존 디자인 토큰·접근성·반응형 규칙을 적용한다. 이 변경들 외에 목업의 주요 정보 구조나 조작 방식을 바꿔야 하면 차이와 이유를 작업 기록에 남긴다. 목업은 ignored artifact이므로 작업 checkout에서 파일 존재를 먼저 확인하고, 없으면 현재 워크스페이스의 원본을 확보한 뒤 화면 작업을 시작한다.

수집 함수의 선택 인자 `root`·`airports`는 테스트/검증 스크립트 주입점이다. 생략하면 실황 `config.storage.base_path`와 지원 목록으로 거른 `config.airports`를 사용한다. wrapper는 결정한 root/airports를 adapter와 store에 끝까지 전달한다. 제품 HTTP 요청에서는 이 인자를 받지 않는다.

신규 파일명과 아래 함수는 이 계획에서 정의하는 인터페이스다. 기존 함수인 것처럼 호출하지 말고 지정 작업에서 구현한다.

| 작업 | 소유 파일·책임 | 선행 |
| --- | --- | --- |
| 1 | `shared/airport-model-comparison.js`; `backend/src/airport-model-comparison/model.js` — 대상 공항, 레코드 검증, 시간 구간·운고 계산 | 없음 |
| 2 | `backend/src/airport-model-comparison/store.js` — 공항별 완전 실행·구간 발행·보존 | 1 |
| 3 | `backend/src/airport-model-comparison/kim.js`와 기존 KIM 수집기 — 추가 단일면·기존 등압면 추출 | 1, 2 |
| 4 | `backend/src/airport-model-comparison/open-meteo.js`, `gfs.js`, `backend/src/parsers/gfs-grib2-parser.js` — 해외 수집·정규화 | 1, 2 |
| 5 | `backend/src/airport-model-comparison/service.js`와 기존 관측 저장 경로 — 관측 시간열·캐시된 비교 API | 2~4 |
| 6 | `backend/src/airport-model-comparison/lifecycle.js`, 수집 registry·config·index·관리자 health/화면·demo snapshot — 운영 수명주기 | 3~5 |
| 7 | `frontend/src/api/modelComparisonApi.js`, `features/airport-model-comparison/{useModelComparison.js,modelComparisonViewModel.js}` — 읽기·공유 뷰모델 | 5 |
| 8 | 같은 feature의 `ModelComparisonPage.jsx`, `ModelComparisonTable.jsx`, `ModelComparisonChart.jsx`, `ModelComparisonSummary.jsx`, `ModelComparison.css`; `App.jsx`, `AirportPanel.jsx` — 화면·진입 | 7 |
| 9 | 검증 fixture·브라우저 계약·실자료 검증 스크립트·운영 문서 — 통합 검증 | 6, 8 |

## 실행 방식 — 메인 통합·모델별 병렬 구현

메인 세션이 공통 계약·작업 배정·공유 파일·통합 검증을 책임지고, 독립된 구현은 서브에이전트에 나눈다. 현재 실행 환경의 동시 작업 한도는 **메인 1개 + 서브에이전트 최대 3개**다. 작업 번호의 선행 조건을 유지하며, 아래 단계 안에서만 병렬로 진행한다.

### A. 공통 기반 — 메인 순차 구현

메인이 Task 1 → Task 2를 구현하고 집중 검증을 통과시킨다. 정규화 레코드, 함수 인자·반환값, 공항별 window, 오류·결측 표현, 저장소 발행 형식을 먼저 고정한다. Task 5의 API 응답 형식도 이때 인계 계약으로 명시한다. 이 기반이 준비되기 전에 모델별 구현을 동시에 시작하지 않는다.

### B. 모델 수집 — 세 작업 병렬

| 담당 | 구현 범위 | 직접 수정하는 파일 |
| --- | --- | --- |
| 서브 1 — KIM | Task 3 | `backend/src/airport-model-comparison/kim.js`, 기존 `kim-surface-wind-processor.js`·`kim-nwp-model.js`·`api-client.js`, KIM 관련 집중 테스트, `docs/operations/kim-nwp-variables.md` |
| 서브 2 — EC·ICON | Task 4.1~4.8 | `backend/src/airport-model-comparison/open-meteo.js`, Open-Meteo 테스트·전용 fixture |
| 서브 3 — GFS | Task 4.9~4.24 | `backend/src/airport-model-comparison/gfs.js`, `backend/src/parsers/gfs-grib2-parser.js`, GFS 테스트·전용 fixture |
| 메인 | 공통 설정·외부 operation 등록, Task 5 관측/API 준비 | `config.js`, `api-operation-registry.js`, `server.js`, 기존 `store.js`·`amos-processor.js`, 비교 `service.js` 및 해당 테스트 |

메인은 병렬 구간에서 Task 5의 관측 이력과 고정된 API 계약을 구현할 수 있다. **Task 5 완료 판정은 세 모델 작업의 결과를 연결한 뒤** 실제 adapter→store→service 시험을 통과했을 때 한다. 모델 결과가 아직 없는데 임시 fixture 응답만으로 완료 처리하지 않는다.

`shared/airport-model-comparison.js`와 비교 모듈의 공통 `model.js`·`store.js`는 메인 소유다. 모델 담당자가 계약 변경을 발견하면 필요한 변경과 영향받는 호출부를 메인에게 전달한다. 메인이 변경하고 다른 담당자에게 새 계약을 전달한 뒤 작업을 이어간다. `config.js`·operation registry에 필요한 변경도 같은 방식으로 메인에게 요청한다.

### C. 화면·운영 연결 — API 통합 후 병렬

- 화면 담당은 Task 7 → Task 8을 수행한다. `frontend/src/api/modelComparisonApi.js`, `frontend/src/features/airport-model-comparison/`, `App.jsx`·`AirportPanel.jsx`를 소유한다. 목업 HTML과 최신 스펙을 함께 받고, 목업 직접 확인·구현 후 대조 의무를 수행한다.
- 운영 담당은 Task 6의 관리자·스냅샷 부분을 수행한다. `backend/src/admin/data-health*.js`, `backend/src/dev/snapshot-store.js`, `DataCollectionScreen.jsx`와 해당 테스트·admin fixture를 소유한다.
- 메인은 Task 6의 수집 일정·lock·due 판정·통계 연결을 수행한다. `lifecycle.js`, `collector-registry.js`, `index.js`, `stats.js`, `config.js`와 해당 테스트를 소유한다. 화면/API 계약 변경과 통합 이슈도 메인이 조정한다.
- 남은 서브 슬롯은 완료된 작업의 읽기 전용 리뷰에 사용할 수 있다. API·화면·운영 연결이 준비된 뒤 Task 9의 전체 흐름을 검증한다. 브라우저 계약과 서버 시작·중지, 실자료 수집은 메인이 순서를 정해 직렬 실행한다.

### 작업 인계와 합치는 규칙

각 서브에이전트에게 스펙·계획의 해당 Task/세부 번호, 소유 파일, 선행 작업의 정확한 인터페이스, 적용 정책, 검증 명령과 fixture 위치를 전달한다. 모든 코드 작업 인계에는 **다른 작업자가 함께 작업 중이며 다른 사람의 변경을 되돌리지 말 것**, Graphify로 먼저 관련 흐름을 확인할 것, 공통 파일은 메인에게 변경 요청할 것을 명시한다. ignored 목업·실자료 artifact는 작업 환경에서 실제 접근 가능한지도 확인한다.

동일 파일은 한 시점에 한 담당자만 수정한다. 담당 변경은 메인이 알리고 이전 담당의 쓰기가 끝난 뒤 넘긴다. 별도 checkout을 쓰더라도 공통 인터페이스 변경은 메인과 먼저 맞춘다. 각 담당의 완료 보고에는 변경 파일·제공 인터페이스·실행한 검증과 결과·남은 문제를 포함한다.

메인은 작업 결과를 직접 확인하고 읽기 전용 리뷰 지적을 해결한 뒤 다음 단계에 연결한다. 서브에이전트의 “완료” 보고만으로 기능 완료를 선언하지 않는다. 최종 완료 기준은 Task 9의 실제 자료·API·브라우저·운영 검증이며, 메인이 전체 결과와 증거를 모아 보고한다. 진행 상황과 파일 담당은 실행 시 만드는 status 문서에 함께 기록한다.

## Task 1: 레코드·시간 구간·운고 계산

**Files:** Create `shared/airport-model-comparison.js`, `backend/src/airport-model-comparison/model.js`, `backend/test/airport-model-comparison-model.test.js`, `backend/test/fixtures/airport-model-comparison/expected.json`.

**Interfaces:**

```js
// shared/airport-model-comparison.js
export const MODEL_COMPARISON_AIRPORTS = ['RKSI', 'RKSS', 'RKPC', 'RKPU', 'RKJY', 'RKJB', 'RKNY', 'RKPK']
export const MODEL_ORDER = ['kim', 'ecmwf', 'gfs', 'icon']

// model.js; all instants are UTC ISO strings
// selectedRuns: [{ model, run_at }] of complete published runs only
export function selectForecastWindow({ model, run_at, selectedRuns }) {} // { start_at, end_at, forecast_hours }
export function estimateCeiling({ model, grid_elevation_m, layers }) {} // ceiling_* fields from spec
export function validateAirportRecords({ airport_icao, model, run_at, window, records }) {} // throws or returns records
```

- 실자료 fixture의 유효시각·기대값을 정리한다. RKPU EC 4524 ft·GFS 3680 ft, KIM/ICON 미검출과 RKSI GFS 20,000m 부근 특수값을 포함하고 출처·단위를 기록한다. 표 표시 반올림과 내부 정밀도를 구분한다.
- 구간 선택과 13개 시각의 중복·누락 검사를 구현한다. 모델/공항 allowlist, 유한 수치·단위 범위, UTC timestamp, `run_at + forecast_hour === valid_at` 검증을 공통 경계로 둔다.

```js
const hour = 3_600_000
const runMs = Date.parse(run_at)
const peers = selectedRuns.filter(r => r.model !== 'ecmwf').map(r => Date.parse(r.run_at))
const anchorMs = peers.length ? Math.max(...peers) : runMs
const offset = model === 'ecmwf' ? Math.max(0, (anchorMs - runMs) / hour) : 0
if (!Number.isInteger(offset)) throw new Error('unaligned_forecast_window')
const forecast_hours = Array.from({ length: 13 }, (_, i) => offset + i)
```

- 스펙의 운고 계산을 순수 함수로 구현한다. `layers` 각 항목은 `{ pressure_hpa, height_m, cloud_fraction, tqc_kgkg, tqi_kgkg }`. 30m 미만 제외·5000ft 상한·낮은 층 입력 결측·응결물 음수 보정·>50% 경계를 처리한다. GFS 진단 운고는 이 추정 함수에 넣지 않는다.
- 다음 집중 검증과 `node --test backend/test/airport-model-comparison-model.test.js`를 실행한다. 예상: EC 구간은 실제 F6~18, 50% 정확히는 통과하지 않음, 미검출과 입력 결측이 다름.

```js
import assert from 'node:assert/strict'
import { selectForecastWindow } from '../src/airport-model-comparison/model.js'
const window = selectForecastWindow({ model: 'ecmwf', run_at: '2026-09-06T00:00:00Z',
  selectedRuns: [{ model: 'kim', run_at: '2026-09-06T06:00:00Z' }] })
assert.deepEqual(window.forecast_hours, Array.from({ length: 13 }, (_, i) => i + 6))
assert.equal(window.end_at, '2026-09-06T18:00:00.000Z')
```

### 1-A. 실행 단위와 공통 레코드

각 Task 앞부분은 파일·인터페이스·완료 조건의 개요이고, 아래 번호가 실제 실행 단위다. 기존 기능 범위는 유지하며 각 번호별 결과를 확인한다. 기본 구현과 별도 검증을 한 덩어리로 넘기지 말고 각 번호의 결과를 확인한다.

- [ ] **1.1 — 공유 상수 파일을 만든다.** 지원 공항과 모델 순서만 root shared에 둔다. 서버 파일 시스템·React·색상값을 이 파일에 넣지 않는다. `MODEL_ORDER` 외 문자열로 모델을 식별하는 분기를 만들지 않는다.
- [ ] **1.2 — UTC 입력 검증을 만든다.** `run_at`·`valid_at`은 `Z` 또는 명시된 offset을 가진 값만 받아 ISO `Z`로 정규화한다. 날짜 없는 시간, local time 문자열, NaN 날짜를 거절한다. Open-Meteo의 offset 없는 시간은 해당 adapter가 응답의 UTC 계열 timezone(UTC/GMT/Etc/UTC/Etc/GMT)과 `utc_offset_seconds=0`을 함께 확인한 뒤 Z를 붙인다.
- [ ] **1.3 — `selectForecastWindow`를 완성한다.** `selectedRuns`는 한 공항의 완전 실행 목록이다. `forecast_hours`·`start_at`·`end_at` 세 값을 함께 반환한다. 다른 공항의 최신 실행을 anchor로 가져오지 않는다.
- [ ] **1.4 — 예상 유효시각 집합을 만든다.** 받은 레코드 수만 13인지 보지 말고 아래 집합과 정확히 같은지 확인한다. 동일시각 중복+다른 시각 누락은 13행이어도 실패다.

```js
const expectedTimes = window.forecast_hours.map(hf =>
  new Date(Date.parse(run_at) + hf * 3_600_000).toISOString())
const actualTimes = records.map(r => r.valid_at)
if (new Set(actualTimes).size !== 13 || actualTimes.length !== 13 ||
    expectedTimes.some(t => !actualTimes.includes(t))) {
  throw new Error('incomplete_forecast_window')
}
```

- [ ] **1.5 — 숫자와 결측 상태를 검증한다.** 필드가 아예 없는 잘못된 응답과 제공자가 반환한 null을 구분한다. wind speed/gust·강수는 비음수, RH·운량은 0~100, 풍향은 0~360, 기압은 양수, 기온은 유한수여야 한다. 이상값을 범위 끝으로 강제 보정하지 않는다. null에는 `field_provenance[field].missing_reason`을 남긴다. GFS 외 시정처럼 계획상 비제공 필드는 `not_provided`다.
- [ ] **1.6 — 레코드 식별 필드를 고정한다.** 모든 레코드에 스펙의 공통 필드를 넣고 `undefined`가 JSON 직렬화에서 조용히 사라지지 않게 한다. `field_provenance`는 아래 구조로 사용한다.

```js
const provenance = {
  source_variable: 'temperature_2m',
  source_unit: '°C',
  method: 'provider_value', // adapter-specific: provider_value | derived | converted
  missing_reason: null,   // not_provided | structural_f000 | provider_missing | invalid_value
}
// wind_direction_deg, cloud_total_pct etc. each receive their own provenance entry.
```

### 1-B. 운고 판정과 검증

- [ ] **1.7 — 층 입력을 정규화한다.** adapter는 cloud_fraction을 0~1로 맞춘다. 음수 결측값은 먼저 null로 바꾸고 KIM tqc/tqi의 작은 음수만 합산 시 0으로 제한한다. 원값은 `ceiling_source_levels`에 유지한다.
- [ ] **1.8 — 탐색 가능한 층을 결정한다.** AGL=`height_m-grid_elevation_m`이다. 지면 아래·30m 미만을 제외하고 낮은 AGL부터 탐색한다. 탐색 대상 압력면의 높이를 몰라 더 낮은 구름 존재 여부를 판단할 수 없으면 `missing_input`이다. 이미 찾은 ceiling 위쪽의 불필요한 값 때문에 결과를 지우지 않는다.
- [ ] **1.9 — 첫 통과 층 또는 상태를 반환한다.** 높이 보간은 하지 않는다. `value`일 때만 숫자를 넣고 나머지는 null이다. `ceiling_limit_ft=5000`과 모델별 method는 결과 상태와 무관하게 유지한다.

```js
const hasCloud = layer.cloud_fraction > 0.5
const hasCondensate = model !== 'kim' ||
  Math.max(0, layer.tqc_kgkg) + Math.max(0, layer.tqi_kgkg) > 1e-6
// Evaluate only after required layer fields have passed finite/missing validation.
const qualifies = hasCloud && hasCondensate
```

- [ ] **1.10 — 숫자 경계를 직접 검증한다.** 아래 사례를 이름 붙인 `node:test`로 옮긴 뒤 Task 1 명령을 실행한다. 고정값의 수치 오차 허용치는 변환에서만 사용하고 판정 임계값을 완화하지 않는다.

| 사례 | 입력 | 기대 결과 |
| --- | --- | --- |
| EC 이동 | EC00Z, KIM06Z | F6~18, 06Z~18Z |
| 다른 모델 없음 | EC00Z만 존재 | F0~12 |
| 중복 시간 | F7 두 행, F8 없음 | 발행 검증 실패 |
| 운량 경계 | cloud_fraction=0.5 | 통과하지 않음 |
| 응결물 경계 | KIM 합=1e-6 | 통과하지 않음 |
| 음수 미세값 | tqc=-5.82e-11, tqi=2e-6, cloud=.6 | 합산 때 tqc=0, 원값은 보존 |
| EC 실제 층 | terrain=95m, height=1474m, cloud=.53 | 약 4524.278ft |
| 낮은 층 결측 | 하층 cloud=null, 위층 cloud=.9 | missing_input |
| 탐색 범위 위 | 모든 통과층이 5000ft 초과 | not_detected_below_limit |

## Task 2: 마지막 완전 실행을 보존하는 저장소

**Files:** Create `backend/src/airport-model-comparison/store.js`, `backend/test/airport-model-comparison-store.test.js`.

**Interfaces:** consumes Task 1 validation; produces:

```js
export function publishAirportWindow({ root, model, airport_icao, run_at, window, records, metadata }) {} // { revision, published }
export function readAirportComparison({ root, airport_icao }) {} // { revision, models: [...], issues: [...] }
export function cleanupComparisonRuns({ root, model, maxRuns }) {} // removal report
// model entry: { model, run_at, window_start_at, window_end_at, available_at,
// collected_at, records, revision }; absent model stays absent
```

- `<root>/airport_model_comparison/<model>/runs/<runId>/` 아래 공항별 immutable 구간 JSON과 manifest를 저장한다. 구간 ID는 실제 시작/끝 시각으로 만든다. `latest.json`은 공항별 성공 구간 포인터다. 모델별 포인터로 모델 간 쓰기를 분리한다. 같은 모델의 공항 발행은 수집기 lock 안에서 `for...of`로 직렬 실행한다. 포인터의 read-modify-rename은 중간 await 없는 동기 구간으로 구현해 두 공항 갱신이 서로 지워지지 않게 한다.
- 포인터는 검증 성공 뒤 임시 파일 → 같은 디렉터리 `rename`으로 교체한다. EC 같은 실행의 F0~12 → F6~18도 새 revision이다. 실패 시 기존 포인터가 바뀌지 않는다. 원응답은 재사용에 필요한 최근 실행만 별도 보존하며 URL 인증값을 쓰지 않는다.

```js
// publication order; do not overwrite a pointed-to payload in place
validateAirportRecords({ airport_icao, model, run_at, window, records })
// write immutable window file, then atomically publish the airport pointer
```

- 경로 세그먼트는 allowlist/UTC 실행 ID에서 생성한다. cleanup은 현재 공항별 포인터가 참조하는 실행을 보호한다. 4실행을 초과하는 보호 실행이 생기면 해당 참조가 바뀐 뒤 정리하고 디스크 현황에 남긴다.
- 임시 디렉터리에서 정상 발행 뒤 한 공항의 12/13 레코드 실패를 재현한다. 성공 공항은 새 실행, 실패 공항은 이전 성공 실행이어야 한다. 같은 EC 실행의 구간 이동·재시작 재읽기·보호 참조 정리와 두 공항 연속 발행 후 두 포인터가 모두 남는 것을 검증한다.

```js
// In airport-model-comparison-store.test.js, seed a valid 13-record fixture first.
const before = readAirportComparison({ root, airport_icao: 'RKPU' })
assert.throws(() => publishAirportWindow({ ...validInput, records: validInput.records.slice(1) }))
assert.deepEqual(readAirportComparison({ root, airport_icao: 'RKPU' }), before)
```

Run: `node --test backend/test/airport-model-comparison-store.test.js` — 불완전 발행 거절, 기존 자료 유지.

### 2-A. 파일 형식과 발행 절차

- [ ] **2.1 — 실제 디렉터리를 아래 구조로 확정한다.** run ID는 UTC ISO의 숫자 부분으로 만든 `202609060000` 형식이다. 사용자 입력 경로를 붙이지 않는다. 아래 구조의 `metadata`는 공항·실행·window·출처와 content revision이다.

```text
airport_model_comparison/
  ecmwf/
    latest.json                         # airports[ICAO] -> immutable payload
    last-attempt.json                   # latest collector attempt, never weather values
    runs/202609060000/
      raw/                              # same-run provider responses, short retention
      RKPU/202609060600_202609061800_<revision>.json
  kim/...
  gfs/...
  icon/...
```

- [ ] **2.2 — 포인터 스키마를 만든다.** `path`는 모델 root 기준 상대경로이며 파일 내용의 model/run/window와 일치해야 한다. `revision`은 계산에 사용한 원자료·정규화 값의 해시다. 수집 재시도 시각만 바뀌었다고 immutable 파일을 계속 늘리지 않는다.

```js
const pointer = {
  airport_icao: 'RKPU', model: 'ecmwf', run_at: '2026-09-06T00:00:00.000Z',
  window_start_at: '2026-09-06T06:00:00.000Z', window_end_at: '2026-09-06T18:00:00.000Z',
  path: 'runs/202609060000/RKPU/202609060600_202609061800_<revision>.json',
  revision: '<content hash>', available_at: null, collected_at: '<actual collection ISO>',
}
// latest.json shape: { schema_version: 1, model: 'ecmwf', airports: { RKPU: pointer } }
```

- [ ] **2.3 — 파일 쓰기 helper를 내부 함수로 만든다.** payload를 UTF-8 JSON으로 임시 파일에 쓴 다음 rename한다. 실패 시 현재 task가 만든 임시 파일만 지우고 이전 payload/포인터는 남긴다. 임시 파일명 충돌은 `process.pid`와 `crypto.randomUUID()`로 피한다.
- [ ] **2.4 — 발행 순서를 구현한다.** validate → immutable payload 작성 → 기존 latest 재읽기 → 해당 ICAO 포인터 교체 → latest 원자 rename 순서다. 같은 모델 수집 lock 아래 공항별로 순차 실행하며 latest read-modify-write 사이에는 await를 넣지 않는다.
- [ ] **2.5 — 읽기 실패를 국소화한다.** 한 모델 JSON 손상이나 포인터 파일 부재가 다른 모델까지 500 오류로 만들지 않게 한다. read 반환에 `issues: [{ model, code }]`를 추가하고 해당 모델은 제외한다. API는 이를 자료 없음으로 표시하며 성공 모델을 유지한다. 포인터가 가리키지 않는 다른 실행에서 셀을 임의 복구하지 않는다.
- [ ] **2.6 — 수집 시도 보고를 별도로 보존한다.** 아래 store 함수를 추가한다. Task 6이 오류를 throw하기 **전에** 이 파일을 갱신하므로 `runWithLock`가 오류 객체의 추가 필드를 버려도 관리자 상세는 남는다.

```js
export function writeCollectionAttempt({ root, model, report }) {} // atomic last-attempt.json
export function readCollectionAttempt({ root, model }) {} // report or null
// report: { started_at, finished_at, target_run_at, publishedAirports: [],
// reusedAirports: [], failedAirports: [], deferred: false,
// errors: [{ airport_icao, code, message }], next_check_at }
// never store credentials, auth query strings, or entire provider error bodies
```

- [ ] **2.7 — 보존 정리를 구현한다.** 모델별 최신 4실행과 모든 현재 포인터의 참조 실행을 합쳐 보호한다. 그 밖의 실행만 지운다. 같은 실행 안에서도 현재 포인터·최근 필요 구간을 제외한 중복 window payload를 정리한다. 원응답은 현재/직전 run 재사용에 필요한 것만 남긴다.

### 2-B. 중단 지점별 검증

- [ ] **2.8 — 디스크 임시 경로 fixture를 만든다.** `fs.mkdtempSync()`로 root를 만들고 `t.after()`에서 그 경로만 정리한다. 제품 DATA_PATH에 파일을 만들지 않는다.
- [ ] **2.9 — payload 쓰기 후 포인터 발행 전 중단을 재현한다.** 이전 latest가 그대로 읽히고, 새 미참조 payload가 있어도 사용자 자료가 바뀌지 않아야 한다.
- [ ] **2.10 — 두 공항 성공+한 공항 실패를 재현한다.** 성공 두 공항의 포인터가 모두 남고 실패 공항은 이전 포인터를 유지한다. 동일 EC run의 window 이동도 같은 시험에 포함한다.
- [ ] **2.11 — 프로세스 재시작을 파일 재읽기로 검증한다.** 인메모리 캐시 없이 새로운 reader가 같은 결과를 읽어야 한다. 보호 run 정리 전후 결과도 비교한 뒤 Task 2 명령을 실행한다.

## Task 3: KIM 격자에서 공항 레코드 생성

**Files:** Create `backend/src/airport-model-comparison/kim.js`, `backend/test/airport-model-comparison-kim.test.js`; Modify `backend/src/processors/kim-surface-wind-processor.js`, `backend/src/api-client.js`, `backend/src/config.js`, `backend/src/processors/kim-nwp-model.js`, `docs/operations/kim-nwp-variables.md`.

**Interfaces:** reuse `fetchKimGrid(params)`, `parseKimGridText()`, 기존 격자/원문 저장; new:

```js
export async function collectKimAirportComparison({ tmfc, forecastHours, credential, signal, root, airports }) {} // per-airport publication report
// Uses real tmfc parsing, selectForecastWindow, estimateCeiling, publishAirportWindow.
```

- `config.kim_nwp.forecast_hours`를 `[0,1,2,3,4,5,6,7,8,9,10,11,12]`로 수정한다. `KIM_NWP_FORECAST_HOURS`는 기존 저장소 조회 허용 범위를 확인해 유지하고 F005~016 설명만 갱신한다. 기존 single-forecast 운영 옵션은 유지하되 13시각이 없으면 비교 자료를 완전으로 발행하지 않는다.
- 동일한 `tmfc`·`hf`의 기존 u10m/v10m/t2m, cld/tqc/tqi/hgt를 재사용한다. 기존 지형·단일면 저장 유무를 확인하고 부족한 `gust`, `pr`, `prec_acc`, `tcld/lcld/mcld/hcld`, `td2m/rh2m`, `psl`, `topo`만 기존 `kim_grid` operation으로 수집한다. 한반도 격자 범위·동시성·실행별 자격증명 선택 규칙을 유지한다.
- 최근접 격자를 공항별로 뽑고 요청 좌표·선택 좌표·지형고도·선택 방식을 남긴다. ceiling 응결물은 가능한 기존 원문 정밀도를 사용하고 이미 스케일링된 격자를 다시 스케일링하지 않는다. topo는 같은 격자 정의에서 재사용한다.

```js
const fields = {
  temperature_c: t2m == null ? null : t2m - 273.15,
  precipitation_mm: pr == null ? null : pr * 3600,
  cloud_total_pct: tcld == null ? null : tcld * 100,
}
// Decode missing sentinels before these conversions.
```

- 기존 KIM 완전 실행 조기 반환 전에도 공항 비교 manifest 완전 여부를 검사한다. 기존 격자가 완전하면 격자 전체 재수집 없이 공항 추가 변수만 이어 받는다. 비교 추가 변수 실패가 기존 지도용 성공 격자를 무효화하지 않는다.
- `node --test backend/test/airport-model-comparison-kim.test.js backend/test/kim-surface-wind.test.js backend/test/kim-nwp-model.test.js backend/test/kim-single-forecast.test.js` 실행. 요청 수는 격자·변수·시각 기준이고 공항 수만큼 같은 격자를 재요청하지 않는지 확인한다.

### 3-A. 기존 수집기와 연결하는 순서

- [ ] **3.1 — 현재 KIM 파일 배치를 fixture 기준으로 기록한다.** `resolveKimNwpRunDir`, `rawComponentFileName`, `readKimNwpGridSafe`의 실제 반환을 확인한다. 지상 기온은 `10m` 격자의 T 필드에 있지만 원변수는 t2m이다. 10m 높이 기온으로 잘못 이름 붙이지 않는다.
- [ ] **3.2 — 단일면 요청 목록을 상수로 만든다.** 추가 요청은 `data='U', level=0, name=<변수>`이고 기존 `sub/map/disp`·credential 선택을 유지한다. topo는 격자 정의가 같은 동안 재사용하고 요청 공항별 루프 안에서 격자를 다시 받지 않는다.

| 수집 입력 | 레코드 출력 | 변환 |
| --- | --- | --- |
| u10m/v10m | wind_direction_deg, wind_speed_kt | 기상학적 from 방향, hypot×1.943844492 |
| gust | wind_gust_kt | m/s×1.943844492 |
| pr | precipitation_mm | kg/m²/s×3600 |
| t2m/td2m | temperature_c/dew_point_c | K−273.15 |
| rh2m | relative_humidity_pct | % 유지 |
| psl | pressure_msl_hpa | Pa÷100 |
| tcld/lcld/mcld/hcld | cloud_total/low/mid/high_pct | fraction×100 |
| topo 및 hgt | grid_elevation_m, ceiling 입력 | m 유지 |

- [ ] **3.3 — 원자료와 정규화 격자 재사용 순서를 구현한다.** 같은 run/hf/variable/level의 기존 원문 → 기존 정규화 격자 → 없을 때만 fetch 순서다. 각 단계에서 격자 nx/ny/bounds가 일치하는지 확인한다. 스케일은 `kim-nwp-model.js`의 저장 계약에서 한 번만 되돌린다.
- [ ] **3.4 — KIM 원문 정밀도 예외를 처리한다.** 현재 tqc/tqi 격자 스케일은 2e-7이고 판정 조건은 1e-6이므로 원문이 있으면 그것을 사용한다. 원문이 없으면 저장 정밀도 사용 사실을 provenance에 기록한다. 원문을 쓰기 위해 모든 기존 KIM 수집을 다시 돌리지 않는다.
- [ ] **3.5 — 격자 샘플러를 만든다.** `kim.js` 내부 `sampleKimAirport(grid, airport)`는 최근접 인덱스·위경도·값을 반환한다. 범위 밖 공항은 edge로 clamp하지 않고 실패한다. 동일 grid index를 단일면 변수 전체에 공유한다. 압력면 격자 정의가 다르면 해당 격자에서 별도로 좌표를 검증한다.
- [ ] **3.6 — 한 hf를 끝까지 연결한다.** 샘플링 → 단위 변환 → 층 배열 → estimateCeiling → 공통 레코드 생성까지 RKPU F009로 통과시킨다. 원문 필드만 가져온 중간 객체를 최종 API 객체로 쓰지 않는다.
- [ ] **3.7 — 13시각 완전성 확인을 붙인다.** 13개 레코드를 임시 메모리에 모은 뒤 Task 1 검증을 통과한 공항만 발행한다. 실제 F000의 비제공 강수·돌풍은 사유 있는 null이고, 단순히 첫 배열 원소라는 이유로 결측을 만들지 않는다.
- [ ] **3.8 — 조기 반환 분기를 수정한다.** 기존 지도용 run이 완전이면 격자 재수집 분기는 건너뛰고 비교 manifest 검사로 간다. 비교까지 완전할 때만 기존 `kim_nwp_latest_run_complete`로 반환한다. 지도 실패/비교 실패의 보고 원인을 구분한다.
- [ ] **3.9 — 중단 신호를 전파한다.** 새 추가 요청 루프는 매 요청 전 `signal?.throwIfAborted()`를 확인한다. 기존 `fetchKimGrid`가 signal을 받지 않는 부분은 호출 호환성을 유지하며 optional signal을 추가해 `requestObservedApi`로 전달한다. 이에 따라 `backend/src/api-client.js`도 이 작업의 Modify 파일이다.
- [ ] **3.10 — 호출 수와 회귀를 검증한다.** 8공항이어도 같은 변수/예보시각 격자는 1번만 요청하는지 stub 호출 수로 단언한다. 중단 시 다음 요청 없음, 비교 변수 실패에도 지도 latest 유지, single-forecast에서는 비교 완전 발행 없음까지 확인한 뒤 Task 3 명령을 실행한다.

## Task 4: EC·ICON 실행 고정 수집과 GFS 부분 GRIB

**Files:** Create `backend/src/airport-model-comparison/open-meteo.js`, `gfs.js`, `backend/src/parsers/gfs-grib2-parser.js`; Create `backend/test/airport-model-comparison-open-meteo.test.js`, `backend/test/airport-model-comparison-gfs.test.js`, `backend/test/fixtures/airport-model-comparison/`의 작은 raw JSON·GRIB fixture. Modify `backend/src/api-operation-registry.js`.

**Interfaces:** consumes Tasks 1/2; produces:

```js
export async function collectOpenMeteo({ model, selectedRuns, signal, root, airports }) {} // model: ecmwf | icon, publication report
// selectedRuns here: { [airport_icao]: [{ model, run_at }] }; pass one airport array to Task 1.
export async function collectGfs({ signal, root, airports }) {} // publication report
export function parseGfsGrib2(buffer) {} // [{ parameter, level, stepType, startStep, endStep, run_at, grid, values, packing }]
export function sampleGfsMessage(message, airport) {} // { value, grid_lat, grid_lon }; nearest regular-grid point, respects scanning mode
// All collectors return { model, publishedAirports, reusedAirports, failedAirports,
// run_at, windows: { [airport_icao]: window }, deferred, errors }.
// A per-airport windows map preserves different EC anchors after partial peer publication.
```

- 스펙의 여섯 operation(`open_meteo_ecmwf_meta`, `open_meteo_icon_meta`, `open_meteo_ecmwf_single_runs`, `open_meteo_icon_single_runs`, `open_meteo_icon_pressure_window`, `nomads_gfs_filter`)을 실제 수집기 `nwp_ecmwf`·`nwp_icon`·`nwp_gfs`에 연결한다. 메타 경로 또는 `models` query로 구분하고 canonicalUrl에도 모델 식별값을 포함한다. 각 URL이 한 operation에만 매칭되는지 기존 registry assertion을 실행한다. `requestObservedApi()`의 실제 fetch options·AbortSignal 인터페이스를 따르고 timeout·재시도·허용 URL을 registry 정책으로 제한한다. 키·원문 URL은 로그에 남기지 않는다.
- Open-Meteo 메타에서 run/availability를 읽고 안정화 10분 이후 공항 묶음 요청을 보낸다. 아래 설정을 적용하고 응답 격자·단위·길이·run 출처를 검증한다.

```js
const options = {
  models: model === 'ecmwf' ? 'ecmwf_ifs025' : 'icon_global',
  cell_selection: 'nearest', elevation: airports.map(() => 'nan').join(','),
  // run is the actual provider initialization time, never comparison_anchor_at
}
```

- 지상 기온·RH·이슬점·풍향·풍속·돌풍·강수·기압·전/저/중/상층 운량을 스펙 필드로 변환한다. EC 층별 운량·높이는 최소 1000/925/850/700hPa, ICON은 1000/975/950/925/900/850hPa. 모든 모델에 temporal_method와 필드별 파생 근거를 남긴다.
- EC는 이동 구간 끝까지 응답을 확보한 다음 유효시각으로 13행을 선택한다. 같은 run 원응답에 이미 있으면 재사용한다. ICON 일반 API 보완은 요청 전후 메타가 선택 run과 같고 중첩 값도 일치할 때만 합친다. 실패하면 낮은 층을 추정으로 메우지 않고 해당 공항을 발행하지 않는다.
- GFS 요청은 스펙의 한반도 bbox와 모든 필요 level/variable을 그대로 사용한다. GRIB 판독기는 제공되는 단순압축 5.0만 지원하며 message/section 길이, 격자 수, bitmap, scanning mode, 제품 시간 구간·단위·파라미터를 검사한다. 미지원 template은 명시 실패하고 이전 실행을 유지한다. `Buffer` 경계 밖 읽기·부정 길이를 거절한다.
- 풍향은 u/v로 계산, 강수는 같은 실행의 인접 F-hour 파일을 수집기에서 함께 읽어 시간 누적 차분, 운량은 순간값 레코드만 선택한다. GRIB 평균·누적 interval metadata를 생략하지 않는다. 진단 운고는 AGL이며 20,000m 없음 표식에 packing 양자화 허용 오차를 적용한다.

```js
// Collector joins distinct F008 and F009 files for the same run/grid.
// previousHourMessages = parseGfsGrib2(F008 buffer); currentHourMessages = parseGfsGrib2(F009 buffer).
// F009 also contains 6..9 APCP; that message must not be selected.
const previous = previousHourMessages.find(m => m.parameter === 'APCP' && m.startStep === 0 && m.endStep === 8)
const current = currentHourMessages.find(m => m.parameter === 'APCP' && m.startStep === 0 && m.endStep === 9)
const previousPoint = previous ? sampleGfsMessage(previous, airport) : null
const currentPoint = current ? sampleGfsMessage(current, airport) : null
// Validate equal run, grid definition, and selected grid coordinates before subtraction.
const hourlyMm = Number.isFinite(previousPoint?.value) && Number.isFinite(currentPoint?.value)
  ? currentPoint.value - previousPoint.value : null
// Do not turn a negative inconsistent difference into dry weather.
```

- `node --test backend/test/airport-model-comparison-open-meteo.test.js backend/test/airport-model-comparison-gfs.test.js` 실행. F008·F009 GRIB fixture를 각각 두고 차분 기대값은 실자료 ecCodes 결과와 대조한다. 또한 EC 13×20 값·ICON run 변경 거절·F0/F6 차이·GRIB 파손·GFS ceiling 특수값을 확인한다. ecCodes는 검증용이며 서버 런타임 의존성으로 추가하지 않는다.

### 4-A. Open-Meteo 요청·응답 경계

- [ ] **4.1 — operation matcher를 먼저 구현한다.** hostname/path를 먼저 검사하고 single-runs는 `models` 값이 정확히 ecmwf_ifs025 또는 icon_global인지 검사한다. 두 모델을 한 요청에 섞지 않는다. 메타의 directory는 각각 ecmwf_ifs025/dwd_icon이다. canonical URL 6개를 `resolveApiOperation()`에 넣어 서로 다른 collectorType으로 귀속되는지 확인한다.
- [ ] **4.2 — 요청 builder를 만든다.** `open-meteo.js`의 내부 함수 `buildOpenMeteoRequest({ model, airports, run_at, window, pressureLevels })`는 URL 객체를 반환한다. 위치는 여러 공항을 묶고 run은 실제 초기화 시각으로 넣는다. 요청/응답 식별에 공항 배열 순서만 믿지 말고 배열 길이·요청 좌표·반환 격자를 함께 검증한다.

```js
const surfaceFields = [
  'wind_direction_10m', 'wind_speed_10m', 'wind_gusts_10m', 'precipitation',
  'temperature_2m', 'relative_humidity_2m', 'dew_point_2m', 'pressure_msl',
  'cloud_cover', 'cloud_cover_low', 'cloud_cover_mid', 'cloud_cover_high',
]
const pressureFields = pressureLevels.flatMap(p =>
  [`cloud_cover_${p}hPa`, `geopotential_height_${p}hPa`])
// run_at must first be canonical UTC ISO; provider run format is YYYY-MM-DDTHH:MM.
const query = new URLSearchParams({
  models: model === 'ecmwf' ? 'ecmwf_ifs025' : 'icon_global',
  latitude: airports.map(a => a.lat).join(','), longitude: airports.map(a => a.lon).join(','),
  elevation: airports.map(() => 'nan').join(','), cell_selection: 'nearest',
  timezone: 'UTC', wind_speed_unit: 'kn',
  hourly: [...surfaceFields, ...pressureFields].join(','), run: run_at.slice(0, 16),
})
// Fetch a response extending through window.end_at, then select by UTC valid_at.
```

- [ ] **4.3 — 시간 범위를 응답 내용으로 확인한다.** default horizon을 13으로 제한하지 않는다. 목표 start/end가 실제 hourly.time에 모두 있는지 검사하고 13개의 인덱스를 얻는다. 배열 index를 F-hour라고 가정하지 않는다. 범위를 덜 받은 응답은 성공으로 발행하지 않는다.
- [ ] **4.4 — ECMWF 변환 함수를 만든다.** 내부 `normalizeOpenMeteoAirport({ payload, airport, model, run_at, window, available_at })`가 13개 레코드를 반환한다. 각 hourly 배열의 길이·unit을 검증하고 숫자가 아닌 문자열을 묵시적으로 Number 변환하지 않는다. 층 운량 %를 fraction으로 바꾼 뒤 estimateCeiling에 넣는다.
- [ ] **4.5 — EC 동일 run 원응답을 재사용한다.** raw cache key는 model/run/요청 공항 좌표/변수 목록/선택 격자 조건이다. anchor만 바뀌었고 응답에 새 end가 있으면 재슬라이스한다. 없으면 같은 run을 다시 요청한다. 이전 요청의 collected_at과 새 자료 선택/발행 시각을 혼동하지 않는다.
- [ ] **4.6 — ICON 보완 요청의 합치기 조건을 구현한다.** 선택 run의 single-runs 응답과 일반 forecast의 pressure window를 독립 검증한다. 일반 응답의 전후 meta가 같고 선택 run과 일치해야 하며, 중첩하는 숫자 필드도 일치해야 한다. 일반 응답이 null인 필드를 single-runs 숫자와 같은 값으로 취급하지 않는다. 불일치 시 `icon_run_changed`로 해당 공항을 실패 처리한다.
- [ ] **4.7 — ICON 한 공항 실패를 묶음 응답 전체 실패와 구분한다.** 응답 개수·run 식별 자체가 잘못되면 전체 실패, 특정 공항의 필드/시간 누락이면 그 공항만 실패다. 정상 공항은 순차 발행하고 `failedAirports`를 반환한다.
- [ ] **4.8 — 고정 응답으로 검증한다.** 요청 query의 `timezone=UTC`, `run=2026-09-06T00:00`을 정확히 단언한다. UTC/GMT 응답 alias는 offset=0일 때만 허용하고 KST offset 응답은 거절한다. EC의 00Z raw를 F6~18로 잘랐을 때 13×20 필드, KST/UTC 동일 instant, 첫 F6의 강수 유지, ICON meta 변경 거절, 요청 cancellation을 확인한다. 실자료 fixture와 synthetic null/갱신 fixture를 이름으로 구분한다.

### 4-B. GFS 판독 범위를 먼저 고정

이번 저장된 실자료를 다시 읽은 결과는 F008 **20개 message**, F009 **21개 message**, grid template 3.0, **33×25=825점**, scanning mode **64**, product template **4.0/4.8**, packing **5.0**, bitmap indicator **255**였다. 이 값은 fixture 검증 기대값이며 모든 미래 응답이 같을 것이라는 가정은 아니다. 계획에 적은 비트 읽기·sign-magnitude·scale 계산 예제를 별도로 실행해 두 파일의 총 41개 message에서 공항 격자값이 저장된 ecCodes 기대값과 1e-7 이내로 일치하는 것도 확인했다. 이는 예제 수식 확인이며 완성된 제품 GRIB 파서 검증을 대신하지 않는다.

형식 근거: [NOAA 격자 3.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_temp3-0.shtml), [순간값 4.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_temp4-0.shtml), [통계 구간 4.8](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_temp4-8.shtml), [단순압축 5.0](https://www.nco.ncep.noaa.gov/pmb/docs/grib2/grib2_doc/grib2_temp5-0.shtml). 아래 offset은 **각 section 시작을 0으로 한 바이트 위치**이며 문서의 1-based octet에서 1을 뺀다.

- [ ] **4.9 — 작은 fixture를 별도 파일로 옮긴다.** `gfs-f008.grib2`, `gfs-f009.grib2`, `gfs-eccodes-expected.json`을 `backend/test/fixtures/airport-model-comparison/`에 둔다. expected JSON에는 shortName만이 아니라 run/step/level/단위/격자좌표/값을 남긴다. 손상 fixture는 원본을 복제한 Buffer에서 테스트 중 만든다.
- [ ] **4.10 — 메시지 경계부터 읽는다.** GRIB magic, edition=2, 64-bit totalLength, 마지막 7777을 검사한다. 전체 파일은 message 여러 개가 이어진 형태다. totalLength가 남은 Buffer보다 크거나 JS safe integer 범위를 넘으면 거절한다.

```js
const totalBig = buffer.readBigUInt64BE(offset + 8)
if (totalBig > BigInt(buffer.length - offset) || totalBig < 20n) {
  throw new Error('grib_message_length')
}
const end = offset + Number(totalBig)
if (buffer.toString('ascii', end - 4, end) !== '7777') throw new Error('grib_end_marker')
// Read sections from offset+16 to end-4, then move to the next message at end.
```

- [ ] **4.11 — section 반복자를 구현한다.** section length는 첫 4바이트 unsigned, number는 다음 1바이트다. 최소 길이와 message 내부 경계를 확인한 후 읽는다. 1/3의 공통 metadata와 4→5→6→7 field 묶음을 유지한다. 메시지 안에서 여러 field 묶음이 반복되는 경우도 section 순서로 처리하고, 필수 section 없이 7에 도달하면 실패한다.
- [ ] **4.12 — section 1의 실제 run을 읽는다.** 연·월·일·시·분·초를 UTC로 구성하고 요청 파일명 run과 같은지 검사한다. section 4로 계산한 종료 시각이 요청 hf와 같은지도 확인한다. 파일명만으로 내용을 믿지 않는다.
- [ ] **4.13 — grid 3.0을 읽는다.** Ni(offset30), Nj(34), basic angle(38), subdivisions(42), 첫 위도(46)·경도(50), 마지막 위도(55)·경도(59), Di(63)·Dj(67), scan(71)을 읽는다. 각도 단위는 문서의 기본값 또는 basic angle/subdivisions를 적용한다. nx×ny와 declared point count를 확인한다.
- [ ] **4.14 — 지원 scanning mode를 분명히 한다.** regular row-major의 i/j 정·역방향은 처리한다. column-major·엇갈린 행·staggered grid는 첫 구현에서 명시적으로 거절한다. 거절 사유는 `unsupported_grib_scan`이며 숫자 배열을 반대로 짐작해서 읽지 않는다. fixture64와 synthetic 남북 역순 격자 모두 같은 공항 좌표를 선택해야 한다.
- [ ] **4.15 — 제품 정의 4.0/4.8을 읽는다.** category(9), parameter number(10), forecast time unit(17), forecast time(18), surface type(22), scale(23), value(24)를 읽는다. 순간값은 startStep=endStep이다. 4.8은 종료 UTC와 통계 구간 descriptor를 읽어 avg/accum/max를 구분한다. 처음에는 단일 time-range만 지원하고 복합 통계는 명시 실패한다. 분·시간·일 time unit은 시간으로 변환 후 정수 hf를 확인한다.
- [ ] **4.16 — 5.0 복호화 helper를 구현한다.** R은 offset11의 Float32BE, E/D는 offset15/17의 sign-magnitude 정수, packed bits는 offset19다. signed integer를 2의 보수 `readInt16BE`로 읽지 않는다. 아래 helper는 `gfs-grib2-parser.js`에 두고 수치 helper 검증을 위해 named export한다.

```js
export function readSignMagnitude16(buffer, offset) {
  const raw = buffer.readUInt16BE(offset)
  return (raw & 0x8000 ? -1 : 1) * (raw & 0x7fff)
}
export function readPackedUnsigned(buffer, startBit, bits) {
  if (!Number.isInteger(bits) || bits < 0 || bits > 32 || !Number.isInteger(startBit) || startBit < 0 ||
      startBit + bits > buffer.length * 8) throw new Error('grib_bit_range')
  let value = 0
  for (let i = 0; i < bits; i++) {
    const bit = startBit + i
    value = value * 2 + ((buffer[Math.floor(bit / 8)] >> (7 - bit % 8)) & 1)
  }
  return value
}
// each non-missing sample: (R + packedUnsigned * 2 ** E) * 10 ** (-D)
// bits=0 is a constant field, not a missing or empty field.
```

- [ ] **4.17 — bitmap을 복원한다.** indicator255면 모든 점이 값이다. 0이면 bitmap의 1에 대해서만 packed 값을 소비하고 0인 격자에는 null을 둔다. bitmap 재사용/사전정의 indicator는 첫 구현에서 명시 거절한다. packed count·필요 bit 길이·825개 복원 길이가 맞는지 검사한다.
- [ ] **4.18 — 파라미터를 숫자와 층으로 선택한다.** 아래 매핑은 실제 F009에서 대조한 항목이다. 요청에 TMP를 넣으면 surface temperature도 함께 오므로 2m만 골라야 한다. GFS 값 선택은 결과가 정확히 1개일 때만 성공한다.

| 출력 | discipline/category/number | surface type / 높이 | 통계 |
| --- | --- | --- | --- |
| 해면기압 | 0/3/1 | 101 | instant |
| 지형고도 | 0/3/5 | 1 | instant |
| 모델 운고 | 0/3/5 | 215 | instant |
| 시정 | 0/19/0 | 1 | instant |
| 돌풍 | 0/2/22 | 1 | 반환된 순간값 또는 명시된 기간값 |
| 기온·이슬점·RH | 0/0/0, 0/0/6, 0/1/1 | 103 / 2m | instant |
| U·V | 0/2/2, 0/2/3 | 103 / 10m | instant |
| APCP | 0/1/8 | 1 | accum |
| 전·저·중·상층 운량 | 0/6/1, 0/6/3, 0/6/4, 0/6/5 | 10, 214, 224, 234 | instant만 |

- [ ] **4.19 — 최근접 격자를 추출한다.** `sampleGfsMessage`는 첫 격자점·increment·scan 부호로 공항의 i/j를 계산하고 최근접 정수 인덱스를 선택한다. 범위를 벗어나면 null을 반환하고 edge 값으로 clamp하지 않는다. 경도 표현은 원 격자와 맞춘다. 숫자뿐 아니라 grid_lat/grid_lon도 반환해 F008/F009가 같은 점인지 확인한다.
- [ ] **4.20 — 운고 특수값을 판별한다.** decoded 값의 양자화 간격은 `2**E * 10**(-D)`다. 20,000m 표식과의 차이가 반 양자화 간격+부동소수 오차 이내일 때 no_ceiling으로 처리한다. bitmap 결측은 missing_input이다. 정상 값은 ft로 바꾸고 5000ft를 넘는다고 버리지 않는다.

### 4-C. GFS 수집기와 단위 검증

- [ ] **4.21 — F000~F012 파일을 같은 run으로 수집한다.** 한반도 부분추출 URL은 스펙 것을 그대로 builder로 옮긴다. 파일별 raw cache를 사용해 인접 강수 계산 때문에 같은 파일을 두 번 요청하지 않는다. HTTP 오류 본문이나 HTML을 GRIB 파서에 정상 파일로 넘기지 않는다.
- [ ] **4.22 — 시간당 강수를 파일 간 연결한다.** h>0에서 h 파일의 0~h APCP와 h−1 파일의 0~h−1 APCP를 고른다. F001의 APCP가 명시적으로 0~1시간 누적이면 그 값 자체가 1시간 강수이므로 바로 사용한다. F000을 가짜 0 레코드로 만들지 않는다. h≥2에서는 앞서 정한 동일 실행 누적 차분을 사용한다. 같은 run·grid·단위 확인 뒤 차분하며 음수 차분은 결측/실패 근거를 남긴다.
- [ ] **4.23 — fixture와 독립 기대값을 비교한다.** 먼저 20/21개 message, 825점, run/time/단위를 확인하고 다음 RKPU 값들을 기존 ecCodes 결과와 비교한다. 기온·RH·바람·운량도 expected JSON의 원 정밀도로 대조한다.

```js
import assert from 'node:assert/strict'
import { readPackedUnsigned, readSignMagnitude16 } from '../src/parsers/gfs-grib2-parser.js'
assert.equal(readPackedUnsigned(Buffer.from([0b10110000]), 0, 3), 5)
assert.equal(readPackedUnsigned(Buffer.from([0b10110000]), 3, 3), 4)
assert.equal(readSignMagnitude16(Buffer.from([0x80, 0x02]), 0), -2)
// Real RKPU GFS ceiling source: 1121.5376220703126 gpm -> about 3679.585 ft.
// Real RKSI no-ceiling source: 19999.937622070312 gpm -> no_ceiling, never a plotted height.
```

- [ ] **4.24 — 정상 0 강수만으로 차분을 검증하지 않는다.** synthetic F008 누적=2.0mm, F009 0~9=3.2mm와 별도 6~9=0.7mm를 넣고 1.2mm가 나오는지 확인한다. 이 데이터는 합성 fixture로 표시한다. 손상 section length, 다른 run의 F008, 잘못된 bitmap count, 평균 운량만 있는 응답도 각각 거절되는지 확인한 뒤 Task 4 검증 명령을 실행한다.

## Task 5: 관측 시간열과 캐시된 공항 API

**Files:** Create `backend/src/airport-model-comparison/service.js`, `backend/test/airport-model-comparison-api.test.js`; Modify `backend/server.js`, `backend/src/store.js`, `backend/src/config.js`, `backend/src/processors/amos-processor.js`; Test extensions in `backend/test/airport-model-comparison-api.test.js`.

**Interfaces:**

```js
// Extend the existing API compatibly; existing callers retain their default root.
loadRecent(type, limit = 12, { root = config.storage.base_path } = {})
export function buildAirportComparison({ airport_icao, root, viewRevision, nowMs }) {} // API payload below
// GET /api/airport/:icao/model-comparison
// { airport, effective_now, revision, models, observations: { metar, taf, amos }, status }
// observation records retain observed_at/issued_at/valid interval and actual source fields
```

- 기존 METAR·AMOS의 저장 파일 수를 필요한 4시간을 포함하도록 보완한다(5분 수집 기준 최소 49파일; 기본 60파일). AMOS는 이미 반환된 60분 raw rows에서 정시 `RN`을 정규화해 compact `hourly_rainfall` 이력으로 남긴다. 새 외부 호출 없이 기존 snapshot 이력에서 읽는다. 초기 기동에 과거가 없으면 결측으로 둔다.
- 시간당 RN은 KST 정시 누적량 차분이다. 같은 날의 두 정시 값이 있으면 차분하고, 같은 날 감소·누락은 자료 없음이다. KST 자정 리셋을 가로지르는 구간은 전날 종료 누적 등 해당 1시간을 복원할 입력이 없으면 자료 없음으로 둔다. 새 날짜의 0을 직전 1시간 무강수로 쓰지 않는다. 미래 관측·오래된 관측을 정시 관측으로 복제하지 않는다. METAR 기온·이슬점에서 RH를 계산할 때 보고된 실제 관측시각을 보존한다. TAF는 기존 `base`·`change_groups`의 기간을 유지하고 TEMPO/BECMG/PROB 조건을 단일 확정 예보로 합치지 않는다.
- `buildAirportComparison()`은 활성 root의 모델 포인터·관측 snapshot만 읽는다. 서버는 ICAO를 검증하고 지원하지 않는 공항은 404, 잘못된 ICAO는 400. 지원 공항 자료가 아직 없으면 모델별 빈 상태의 200 응답이다. 기존 인증·캐시 미들웨어 순서를 유지한다.

```js
app.get('/api/airport/:icao/model-comparison', (req, res) => {
  const icao = String(req.params.icao).toUpperCase()
  if (!/^[A-Z]{4}$/.test(icao)) return res.status(400).json({ error: 'invalid_airport' })
  if (!MODEL_COMPARISON_AIRPORTS.includes(icao)) return res.status(404).json({ error: 'unsupported_airport' })
  const { root, revision: viewRevision } = getActiveDataContext()
  res.set('Cache-Control', 'private, no-cache')
  res.json(buildAirportComparison({ airport_icao: icao, root, viewRevision, nowMs: getEffectiveNow().getTime() }))
})
```

- 응답 revision에 모델 구간·관측 revision·활성 데이터 뷰를 포함한다. 수집시간을 발표시각으로 대체하지 않는다. 마지막 성공 자료를 읽되 run/수집시각·health 상태를 명시하고, 선택 구간 밖은 예보 범위 밖이다. API 호출이 수집을 일으키지 않는다.
- `node --test backend/test/airport-model-comparison-api.test.js` 실행. 서로 다른 날짜의 실황/데모 fixture를 사용해 데이터 혼합 없음·자정 RN·없는 AMOS 김해·EC 혼합 run 금지·API 외부 호출 0회를 검증한다. 모델/관측 revision이 같아도 활성 뷰 revision이 바뀌면 API revision이 달라지는지도 확인한다.

### 5-A. 관측 이력과 시간당 강수

- [ ] **5.1 — `loadRecent`의 root 옵션만 확장한다.** 내부 `getTypeDir`에 인자로 받은 root를 전달하고 기존 호출은 기존 실황 root를 사용하게 둔다. API에서 `config.storage.base_path`를 직접 읽는 호출이 남지 않는지 확인한다.
- [ ] **5.2 — 관측 파일 보존을 설정한다.** `storage.max_files_by_type.metar=60`, `amos=60`을 추가한다. 동일 관측이 여러 snapshot에 반복될 수 있으므로 snapshot 파일 수를 관측 수로 세지 않는다. 보존을 늘려도 초기 설치 직후 과거 자료가 생기는 것은 아니다.
- [ ] **5.3 — AMOS 원응답에서 정시 누적을 보존한다.** `parseAmosRows()`가 반환한 `tm`이 HH00인 행을 선택하고 `rn_raw/10`을 mm로 변환한다. 현재값을 고르는 `pickDailyRainfallAtTime()`의 nearest fallback을 이력 생성에 쓰지 않는다. 아래 항목을 해당 공항 payload의 `hourly_rainfall`에 추가한다.

```js
// one actual source row, not a carried-forward latest reading
const sample = {
  observed_at: '2026-09-06T08:00:00.000Z',
  observed_tm_kst: '202609061700',
  daily_total_mm: 3.2,
  source: 'AMOS',
}
```

- [ ] **5.4 — 중복 관측을 제거한다.** service에서 최근 snapshot들의 hourly_rainfall을 모으고 ICAO+observed_at으로 deduplicate한다. 같은 관측시각의 원값이 수정됐으면 fetched_at이 최신인 snapshot을 택한다. fetched_at을 관측시각으로 바꾸지 않는다.
- [ ] **5.5 — 정시 차분 helper를 만든다.** `service.js` 내부 `buildHourlyAmosRainfall(samples)`는 끝시각 t의 직전 정시 t−1h를 정확히 찾는다. 같은 KST 날짜이며 두 값이 유효할 때만 차분한다. 자정 리셋/증발 같은 감소·직전값 부재는 사유 있는 null이다.

| 전후 관측 | 기대 시간당 값 |
| --- | --- |
| 같은 날 17시 3.2 → 18시 4.4 | 1.2mm |
| 같은 날 17시 3.2 → 18시 3.2 | 0.0mm |
| 17시 없음 → 18시 4.4 | 자료 없음 |
| 같은 날 3.2 → 2.1 | 자료 없음, 누적 역전 |
| 전날23시 7.0 → 당일00시 0.0 | 자료 없음, 리셋을 무강수로 간주하지 않음 |
| 김해 amos_stn 없음 | 자료 없음, NWP 비교는 정상 |

- [ ] **5.6 — METAR/TAF는 기존 정규화를 재사용한다.** 최근 METAR snapshot의 `airports[ICAO]`에서 원 관측시각으로 중복을 제거한다. 기존 파서의 기온·이슬점·풍향·풍속·구름·현재날씨 구조를 field adapter에서 한 번만 옮긴다. 보고가 없던 시각은 새 관측을 생성하지 않는다. TAF는 최신 유효한 발표의 base/change_groups를 가져오며 유효기간 밖에 연장하지 않는다.
- [ ] **5.7 — METAR RH에 기존 계산 함수를 재사용한다.** 서버는 실제 관측시각과 기온·이슬점 수치를 보존해 전달한다. RH 계산은 Task 7의 공통 뷰모델에서 기존 프런트엔드 함수로 한 번 수행한다. 서버가 frontend 모듈을 import하거나 새로운 상수의 근사식을 중복 구현하지 않는다. 실제 존재하는 함수는 다음 경로다.

```js
// modelComparisonViewModel.js (Task 7)
import { computeRelativeHumidity } from '../../shared/weather/helpers.js'
const relative_humidity_pct = computeRelativeHumidity(temperature_c, dew_point_c)
// Existing helper returns null for non-finite inputs and keeps its established bounds behavior.
```

### 5-B. API 스키마와 실패 처리

- [ ] **5.8 — 응답 wrapper를 고정한다.** Task 2 모델 항목은 변경 없이 `models`에 담는다. observations의 METAR/AMOS는 실제 관측 레코드 배열, TAF는 `{ issued_at, valid_from, valid_to, base, change_groups }` 또는 null이다. 공항명·좌표는 기존 config.airports를 사용한다. status는 자료 존재 상태이며 비행 가능 여부가 아니다.

```js
const payload = {
  airport: { icao: 'RKPU', name: '울산공항', lat: 35.5935, lon: 129.3518 },
  effective_now: '2026-09-06T08:20:00.000Z',
  revision: '<view+model+observation digest>',
  models: [], observations: { metar: [], taf: null, amos: [] },
  status: 'empty', // ready | partial | empty; errors do not become zero weather
  issues: [],
}
```

- [ ] **5.9 — 빈 자료와 요청 실패를 구분한다.** 자료가 없다는 정상 200과 서버 5xx를 구분하고, 한 모델 손상은 partial/issue로 내려준다. null 값을 지닌 레코드도 원자료 상태가 유효하면 레코드로 보존한다. 아직 수집되지 않은 모델은 models에 허위 run을 만들지 않는다.
- [ ] **5.10 — 활성 뷰를 한 번에 읽는다.** `getActiveDataContext()`의 root/revision과 getEffectiveNow를 route에서 받는다. root가 `.active-data` symlink이므로 수집 중 전환 가능성을 감안해 service 읽기 전후 context revision이 달라지면 새 뷰로 한 번 다시 읽는다. 계속 전환되면 503으로 응답하고 프런트가 기존 데이터를 유지하게 한다. 실황/데모 조각을 한 응답에 섞지 않는다.
- [ ] **5.11 — HTTP 경계를 검사한다.** `RKPU` 정상, 미지원 `RJAA` 404, 잘못된 ICAO 400, 지원 공항 빈 상태 200, 한 모델 손상 partial을 각각 확인한다. 응답에 원문 자격증명·내부 파일 전체 경로가 포함되지 않는지 검사한다. 성공 응답은 private/no-cache다.
- [ ] **5.12 — API 실제 통합 시험을 실행한다.** 임시 데이터 root에 Task 2로 발행한 fixture와 METAR/TAF/AMOS snapshot을 넣고 실제 service/route를 호출한다. 순수 mock JSON 반환만 검사하지 않는다. 동일 content revision의 live/demo fixture도 viewRevision으로 응답 revision이 달라지는지 확인한 뒤 Task 5 명령을 실행한다.

## Task 6: 수집 일정·관리자 상태·데모 연결

**Files:** Modify `backend/src/config.js`, `backend/src/collector-registry.js`, `backend/src/index.js`, `backend/src/stats.js`, `backend/src/admin/data-health-catalog.js`, `backend/src/admin/data-health.js`, `backend/src/dev/snapshot-store.js`, `frontend/src/features/admin/screens/DataCollectionScreen.jsx`; Create `backend/src/airport-model-comparison/lifecycle.js`, `backend/test/airport-model-comparison-lifecycle.test.js`; extend existing `backend/test/api-operation-registry.test.js`, `backend/test/collector-registry.test.js`, `backend/test/collector-scheduler.test.js`, `backend/test/collector-execution.test.js`, `backend/test/data-health-catalog.test.js`, `backend/test/snapshot-store.test.js` only where their contract changes.

**Interfaces:** Tasks 3/4 collection report → 새 `lifecycle.js` → `runWithLock`의 기존 실행 관측 경로. `readAirportComparison()`의 성공 시각/실행/실패 상태를 admin health adapter가 읽는다.

```js
// lifecycle.js; model: ecmwf | icon | gfs; root is the live storage root
export function isNwpCollectionDue({ model, root, nowMs }) {} // boolean; filesystem only
export async function collectNwpModel({ model, signal, nowMs = Date.now(), root, airports }) {} // report or throws aggregate error
```

Due 기준: 요청 가능 지연은 EC 7시간40분, ICON 4시간40분, GFS 6시간10분이다. `floor((nowMs - delayMs) / 6h) * 6h`가 이번 점검의 예상 대상 실행이다. 8공항 중 이 실행 이상인 완전 구간이 없는 공항이 있거나 EC 저장 구간이 최신 anchor 목표와 다르면 true다. 실제 수집은 메타·파일이 확인한 run을 사용하며 예상 시각을 실제 run으로 위조하지 않는다. 저장소만으로 판정하므로 재시작 후에도 미완료 목표가 다시 선택된다.

- `overseas_nwp = { enabled, max_runs: 4 }`와 모델별 schedule을 config에 둔다. 모델별 cron을 `*/10 * * * *` UTC로 등록하되 watchdog `maxIntervalMs`는 실제 실행 간격인 6시간, grace는 EC 90분·ICON 60분·GFS 75분으로 둔다. noop 점검 때문에 정상 모델이 10분마다 미실행 판정을 받지 않도록 한다. 가벼운 due 검사 후에만 실제 수집을 실행한다. 최초 자료 요청은 스펙의 UTC 지연+30분 시점부터다. 예: EC 기준 첫 시도 01:40/07:40/13:40/19:40Z, ICON 04:40/10:40/16:40/22:40Z, GFS 00:10/06:10/12:10/18:10Z. 실행 전 메타·실제 파일 가용성이 최종 기준이며 시각만으로 발행하지 않는다. 같은 완전 run/window의 noop 점검은 외부 요청과 성공 통계 갱신을 발생시키지 않는다.
- `nwp_ecmwf`, `nwp_icon`, `nwp_gfs`를 각각 registry·processorBindings·초기수집에 연결한다. 기존 `runWithLock`가 중복 실행·중단·실패 관측을 소유한다. 재시도는 별도 timer를 만들지 않고 다음 10분 cron 점검에서 수행한다. due 판정은 마지막 완전 구간·예상 새 실행의 요청 가능 시각·실패 보고·공항별 EC anchor 차이를 읽는다. 새 실행이 생기면 새 목표를 우선하고 이전 목표 재시도는 폐기한다. enabled=false에서는 시작 작업·cron·후속 실행이 모두 차단된다. 기존 `scheduleCollector`의 cron callback은 NWP 3종에만 `isNwpCollectionDue()`를 먼저 적용한 뒤 `runner(type, job, ...)`를 호출한다. 기존 다른 수집기의 동작은 바꾸지 않는다. 초기수집과 anchor 변경 후 직접 실행도 같은 guard를 사용한다.

```js
// index.js: use the new lifecycle wrapper so partial failures are not successes.
const nwpBindings = {
  nwp_gfs: ({ signal }) => collectNwpModel({ model: 'gfs', signal }),
  nwp_icon: ({ signal }) => collectNwpModel({ model: 'icon', signal }),
  nwp_ecmwf: ({ signal }) => collectNwpModel({ model: 'ecmwf', signal }),
}
// lifecycle.js: derive the per-airport map for collectOpenMeteo.
function readSelectedRuns({ root, airports }) {
  return Object.fromEntries(airports.map(({ icao: airport_icao }) => [
    airport_icao, readAirportComparison({ root, airport_icao }).models
      .map(({ model, run_at }) => ({ model, run_at })),
  ]))
}
// collectNwpModel passes readSelectedRuns({ root, airports }) to collectOpenMeteo.
// Inside collectNwpModel, after successful airport publications:
if (report.failedAirports.length || report.deferred) {
  const error = new Error('nwp_collection_incomplete')
  error.report = report
  throw error
}
return report
```

- KIM/GFS/ICON이 새 완전 실행을 발행하면 같은 수집 관리 경로로 EC 구간 재평가를 요청한다. 공항별 최신 성공 실행이 다르면 공항별 anchor로 묶어 EC 요청을 구성한다. EC가 실행 중이면 기존 lock을 존중하고 다음 10분 점검에서 최신 anchor를 다시 읽는다. 메모리 timer/대기열을 만들지 않아 재시작 때도 저장된 완전 구간과 anchor 차이로 복구한다. 같은 실행·구간 완전이면 외부 재요청하지 않는다.
- 관리자 catalog 출처 Open-Meteo, 모델 3종, OFF 상태, 스펙 normal/late/stopped 시간 기준을 연결한다. `readDataHealth` 모델 행에 `modelRunAt`, `availableAt`, `collectedAt`, `successAirports`, `failedAirports`, `nextCheckAt`을 추가한다. `DataCollectionScreen.jsx`의 기존 모델 행 안에 이 값을 짧은 상세 줄로 렌더링한다. 다른 자료 행은 기존 구성을 유지한다. 스토어 성공 시각뿐 아니라 마지막 실패·공항 성공 수·다음 확인 시각을 기존 data collection 화면에 노출한다. API Hub 키 한도에는 포함하지 않는다.
- `snapshot-store.js`의 `EXTRA_CAPTURE_TYPES`와 `FULL_DIR_TYPES` 양쪽에 `airport_model_comparison`을 포함한다. METAR·AMOS는 기존 디렉터리 발견 규칙을 사용하되 `FULL_DIR_TYPES`에 추가해 Task 5의 제한된 이력 파일도 캡처한다. 새 snapshot은 모델별 포인터가 참조한 구간을 포함한다. 오래된 snapshot의 새 자료 부재는 해당 화면에서 자료 없음으로 처리하고 실황 fallback은 하지 않는다. 기존 전체 데모 시작을 새 선택 기능 때문에 차단하지 않는다.
- `node --test backend/test/airport-model-comparison-lifecycle.test.js backend/test/api-operation-registry.test.js backend/test/collector-registry.test.js backend/test/data-health-catalog.test.js backend/test/snapshot-store.test.js` 실행. fake clock·요청 stub으로 2회 연속 실패 후 복구, 마지막 성공 보존, 실행 중 anchor 변경, OFF, 재시작, demo/live 복귀를 확인한다. 완전 실행 뒤 10분 noop 점검이 반복돼도 다음 실제 수집 주기 전까지 watchdog이 missed로 바뀌지 않는지 검사한다.

### 6-A. 실행 흐름을 코드 경계별로 연결

- [ ] **6.1 — 설정·registry·통계 초기화를 추가한다.** `overseas_nwp.enabled` 기본 활성과 환경변수 `OVERSEAS_NWP_DISABLED=1`에 따른 비활성, max_runs=4를 둔다. 세 schedule key는 모두 UTC 10분 점검이고 maxIntervalMs/grace는 위 정의를 따른다. API Hub category는 빈 배열이다. `backend/src/stats.js`의 별도 `TYPES` 초기화 목록에도 `nwp_ecmwf`·`nwp_icon`·`nwp_gfs`를 추가하고 기존 통계 파일 reload 시 없는 새 type entry가 생성되는지 확인한다. registry만 추가하면 `recordStart` 단계에서 없는 통계 entry를 읽을 수 있으므로 둘을 같은 변경으로 처리한다.
- [ ] **6.2 — `isNwpCollectionDue`를 순수한 디스크 판정으로 구현한다.** 8공항 중 어느 하나라도 예상 run의 13시각 완전 포인터가 없으면 due다. EC는 그 공항의 peer 최신 완전 실행으로 계산한 window도 비교한다. 마지막 수집 실패가 있었다는 이유만으로 이미 회복된 완전 구간을 계속 재요청하지 않는다.
- [ ] **6.3 — cron callback 앞에 guard를 넣는다.** `scheduleCollector`에서 3개 NWP type만 model로 변환하고 due=false면 즉시 반환한다. 이때 `recordStart`를 호출하지 않는다. 테스트에서는 guard와 now를 주입해 실제 파일 시스템·시간에 의존하지 않게 한다. 기존 수집기의 scheduling 인자는 유지한다.
- [ ] **6.4 — 초기수집·수동실행도 같은 collector wrapper를 사용한다.** `processorBindings`와 `buildInitialCollectionJobs`에 세 모델을 추가한다. enabled=false일 때 jobs에도 없어야 한다. root/settings를 테스트 주입하려면 `collectNwpModel`의 선택 인자로 넘기며 HTTP에서 임의 root를 받지 않는다.
- [ ] **6.5 — 수집 결과를 일관된 report로 반환한다.** 성공한 공항은 발행, 완전 cache 재사용은 reusedAirports, 실패는 failedAirports에 넣는다. source가 아직 준비되지 않으면 deferred다. 예외가 먼저 발생한 경우에도 last-attempt.json에 전체 실패 원인을 기록한다.
- [ ] **6.6 — 보고 저장 후 aggregate 실패를 던진다.** Task 2 `writeCollectionAttempt`를 실행하고 failedAirports/deferred가 있으면 error.report를 붙여 throw한다. `runWithLock`의 recordFailure가 호출되고, 성공 공항 pointer는 유지돼야 한다. 로그의 오류 문자열에는 모델/실패 공항 수/안전한 오류코드만 넣는다.
- [ ] **6.7 — EC anchor 재평가를 연결한다.** KIM·GFS·ICON job의 try/finally 뒤, 발행 전후 peer pointer revision이 달라졌으면 기존 runner로 EC 확인을 요청한다. 부분 성공 후 wrapper가 throw한 경우에도 변경된 공항 anchor를 놓치지 않는다. 별도 EC 요청이 already_running으로 건너뛰어지면 다음 cron이 최신 pointer를 읽는다.
- [ ] **6.8 — cancellation을 발행 경계까지 전달한다.** HTTP 요청 signal, 공항 정규화 loop, 다음 immutable payload 발행 직전까지 중단 여부를 확인한다. 이미 원자 발행이 끝난 성공 공항을 롤백하지 않는다. 취소 후 남은 공항을 백그라운드에서 계속 쓰지 않는다.

### 6-B. 관리자와 데모

- [ ] **6.9 — 관리자 health adapter를 확장한다.** admin `successAirports`는 `new Set([...report.publishedAirports, ...report.reusedAirports]).size`, admin `failedAirports`는 report.failedAirports의 중복 제거 개수다. report 자체의 필드는 ICAO 배열, admin의 두 필드는 정수 개수로 고정한다. 실제 성공 pointer의 run/available/collected, last-attempt의 성공·실패 공항/원인, 다음 10분 확인 시각을 읽는다. 서로 다른 run을 가진 성공 공항이 있으면 `modelRunAt` 하나로 거짓 대표하지 말고 상세에 공항별 run 목록도 표시한다.
- [ ] **6.10 — `DataCollectionScreen.jsx` 모델 행을 수정한다.** 기존 열을 늘리는 대신 해당 모델 행 안의 detail 영역에 실행시각·가용시각·수집시각·공항 수를 넣는다. “다음 점검”과 “새 실행 요청 가능 시각”은 다르므로 label로 구분한다. OFF일 때 다음 점검은 없음으로 표시한다.
- [ ] **6.11 — snapshot 발견과 복사를 함께 변경한다.** EXTRA_CAPTURE_TYPES에 comparison root를 추가하고 FULL_DIR_TYPES에 comparison/metar/amos를 추가한다. 새 자료를 DEMO_REQUIRED_TYPES에 무조건 추가해 구형 snapshot의 전체 데모를 차단하지 않는다.
- [ ] **6.12 — snapshot 내부 참조를 확인한다.** 저장 시 비교 latest가 참조한 각 immutable 파일이 snapshot 아래 존재해야 한다. inspectSnapshot은 comparison이 존재할 때만 그 참조 무결성을 검사한다. 원자료 URL·절대 실황 경로를 따라 외부 디렉터리에서 파일을 찾지 않는다.
- [ ] **6.13 — 활성 데이터 뷰 전환을 검증한다.** model 값이 다른 live/demo와 값은 같고 revision만 다른 live/demo 두 쌍을 사용한다. 사용자 API는 demo root, collector는 live root를 사용하며 collector를 실행해도 demo 화면 값은 바뀌지 않아야 한다.

### 6-C. 시간 시나리오 검증

- [ ] **6.14 — 아래 상태 전이를 fake clock과 request stub으로 구현한다.** `backend/test/collector-scheduler.test.js`와 `backend/test/collector-execution.test.js`도 수정 대상 검증에 포함한다. 각 단계에서 요청 수·pointer·stats·next_check를 함께 단언한다. 먼저 세 모델 모두 실제 stats의 초기화→recordStart→성공/실패→파일 reload를 통과하는지 임시 root에서 확인한다. registry stub만으로 stats 연결을 대체하지 않는다.

| 시나리오 | 전제/동작 | 기대 |
| --- | --- | --- |
| 요청 가능 전 | EC00Z 대상, now07:30Z, 이전 run 완전 | 새 run 요청 없음 |
| 최초 due | now07:40Z | EC00Z 수집 시도 |
| 완전 자료 | 같은 target/window로 다음 점검 | 외부 요청 0, 성공시각 불변 |
| 두 번 실패 | 07:40 실패, 07:50 실패, 08:00 성공 | 마지막 성공 보존 후 새 pointer 발행 |
| 부분 성공 | RKSI 성공·RKPU 실패 | RKSI 유지, 다음 점검에서 미완료 목표 복구 |
| EC 실행 중 anchor 변경 | peer06Z 발행 | lock 존중, 다음 확인에 F6~18 반영 |
| 재시작 | pending timer 없이 종료/재시작 | pointer 차이로 미완료 목표 다시 발견 |
| 장시간 noop | 10분 점검 반복, 실제 수집은 6시간 주기 | 정상 구간에서 watchdog missed 없음 |
| OFF | disabled config로 시작 | jobs·cron·외부요청 없음, admin OFF |
| 취소 | 두 번째 공항 전 signal abort | 첫 성공 유지, 이후 발행 없음 |

- [ ] **6.15 — Task 6 명령에 scheduler/execution 검증을 포함해 실행한다.** API operation unique-match/OFF, last-attempt 보존, snapshot readback 결과까지 모두 확인한 뒤 다음 작업으로 넘어간다.

## Task 7: 프런트엔드 API와 공통 뷰모델

**Files:** Create `frontend/src/api/modelComparisonApi.js`, `frontend/src/features/airport-model-comparison/useModelComparison.js`, `modelComparisonViewModel.js`, `modelComparisonViewModel.test.js`.

**Interfaces:** consumes Task 5 JSON; produces:

```js
export async function fetchModelComparison(icao, { signal } = {}) {} // JSON or throw
export function useModelComparison(icao) {} // { data, loading, error, refreshing }
export function buildComparisonViewModel({ data, nowMs, selectedValidAt, tz }) {} // { times, rows, charts, summary, modelChips }
export function firstForecastHour(nowMs) { return new Date(Math.ceil(nowMs / 3_600_000) * 3_600_000).toISOString() }
```

- 공항 패널/독립 화면이 활성화됐을 때만 비교 API를 요청한다. 60초 갱신, 요청 중복 방지·unmount AbortController·공항 변경 후 늦은 응답 무시를 적용한다. 실패 시 같은 공항 마지막 성공값 유지와 갱신 실패 표시를 분리한다. 다른 공항의 값은 재사용하지 않는다.
- 사용자 시간대는 `useTimeZone()`, 유효 현재시각은 API `effective_now`와 기존 `useDemoMode()` 흐름을 따른다. 고정된 데모 시간을 실제 wall clock으로 진행시키지 않는다. 과거 3칸과 모델별 미래 커버리지 합집합을 1시간 단위로 생성하며 사용자가 선택한 시각도 표시한다.
- 표·그래프·요약은 같은 레코드 lookup을 공유한다. NWP는 `valid_at` 정확 일치, METAR는 실제 관측시각을 해당 시간 구간에 표시하고 정시 예보값으로 재명명하지 않는다. 조건부 TAF는 조건과 기간을 보존한다. 강수 누적은 모든 모델에 동일한 표시 시작시각을 쓰고 중간 결측부터 선을 끊는다. KIM 실행누적 `prec_acc`를 다른 모델의 표시창 누적과 혼용하지 않는다.
- 요약은 선택 시각의 풍속/돌풍 범위·모델별 시간당 강수·모델별 운고/상태를 만든다. 모델 수는 해당 시각 완전 레코드 참여 수이며 변수 결측은 별도다. 빈 배열의 min/max·풍향 산술평균·결측 0은 금지한다.

```js
const pair = `${temperature_c == null ? '자료 없음' : temperature_c.toFixed(1) + '°C'} / ${relative_humidity_pct == null ? '자료 없음' : Math.round(relative_humidity_pct) + '%'}`
// same formatted pair in table and focused/tapped detail
```

- `node --test frontend/src/features/airport-model-comparison/modelComparisonViewModel.test.js` 실행. 14:20/15:00/15:01 경계·KST/UTC·EC F18·한쪽 기온/RH 결측·TAF 제외·누적선 결측·미검출 포함 모델 수를 확인한다.

### 7-A. 요청 수명주기와 뷰모델

- [ ] **7.1 — API client의 경계를 구현한다.** ICAO allowlist 확인 후 내부 GET만 호출하고 AbortSignal을 전달한다. HTTP 200 빈 payload와 HTTP 오류를 분리하며 오류 때 null 성공값을 반환하지 않는다. 반환 JSON의 airport.icao가 요청 공항과 다르면 거절한다.
- [ ] **7.2 — hook의 상태를 공항에 묶는다.** `{ icao, data, loading, error }`를 함께 저장한다. 공항 변경 즉시 화면에 이전 공항 데이터를 내보내지 않으며 이전 request를 abort한다. unmount 뒤에는 setState를 하지 않는다.
- [ ] **7.3 — 갱신 중복과 늦은 응답을 막는다.** 최초 load 후 60초 interval은 진행 중 요청이 없을 때만 호출한다. request sequence와 ICAO를 확인한 최신 응답만 채택한다. 같은 공항 실패는 data를 보존하고 error만 갱신한다. 다음 성공은 error를 지운다.
- [ ] **7.4 — 시각 선택 상태를 한 곳에 둔다.** query valid_at이 유효하면 초기 선택에 쓰고, 없으면 firstForecastHour(nowMs)를 쓴다. 데이터 재수집·모드 전환·시간대 변경이 사용자의 선택 UTC 시각을 초기화하지 않는다. panel은 매 시각 갱신마다 현재 이상 첫 정시를 계산한다.
- [ ] **7.5 — 시간축과 셀 lookup을 만든다.** 표시 시작은 현재 이상 첫 정시−3시간, 끝은 모델별 window_end_at과 선택 시각 중 미래 최대다. NWP lookup key는 model+run_at+valid_at이다. METAR는 관측이 속한 시간 구간에 실제 분을 표시하고, 한 시간 여러 보고가 있으면 원시각을 구분한다. `observed_at > nowMs`인 관측은 표시하지 않는다.
- [ ] **7.6 — 셀의 수치와 문구를 분리한다.** cell에 raw value/state, formatted text, run/valid time, method detail을 함께 둔다. 그래프가 formatted text의 `parseFloat`를 사용하지 않도록 한다. 아래 내부 형태를 rows/charts/summary에서 공유한다.

```js
const cell = {
  valid_at: '2026-09-06T09:00:00.000Z', model: 'ecmwf',
  value: 4524.278215223097, status: 'value', text: '4,524 ft',
  run_at: '2026-09-06T00:00:00.000Z', forecast_hour: 9,
  method: 'humidity_based_estimate', sourceLevels: [],
}
// outside_run/missing_input/not_detected_below_limit/no_ceiling have value:null.
```

- [ ] **7.7 — 기온/RH 쌍을 만든다.** 모델값은 그대로 사용하고 METAR RH는 기존 `computeRelativeHumidity(tempC, dewpointC)`로 공통 뷰모델에서 한 번 계산한다. 표와 hover에 같은 pair를 사용하되 그래프 값은 각각 수치다. TAF는 이 section의 rows에 넣지 않는다.
- [ ] **7.8 — 누적 강수는 동일한 구간으로 합산한다.** 표시축의 첫 시간당 강수 구간부터 공통 시작을 잡고 합산한다. 누적을 유지할 수 없는 결측 이후는 null로 남겨 전체 합계인 것처럼 보이지 않게 한다. `prec_acc`는 원 실행 누적 확인용 상세 필드로만 보존한다.

```js
function cumulativeHourly(values) {
  let total = 0
  let complete = true
  return values.map(value => {
    if (!Number.isFinite(value)) complete = false
    if (!complete) return null
    total += value
    return total
  })
}
// [0, 0.5, null, 0.2] -> [0, 0.5, null, null], never [0, .5, .5, .7]
```

- [ ] **7.9 — 요약을 값으로부터 만든다.** 바람 수치가 있는 모델만 풍속·돌풍 범위를 만들고 참여/결측 모델을 구분한다. 강수는 모델별 같은 시각 시간당 값, 운고는 모델명+숫자 또는 상태다. 숫자 운고가 있는 두 모델만으로 “4개 모델 공통” 문구를 만들지 않는다.
- [ ] **7.10 — 뷰모델 검증을 실행한다.** frozen fixture에서 모드 변경 전후 cell.value·summary·chart point가 동일한지 확인한다. UTC/KST 전환은 label만 바뀌어야 한다. null pair, EC F18, 부분 모델, 모든 모델 범위 밖, 과거 선택도 별도 assertion으로 확인한다.

## Task 8: 공항 패널 진입과 전체화면 표·그래프

**Files:** Create `frontend/src/features/airport-model-comparison/ModelComparisonPage.jsx`, `ModelComparisonTable.jsx`, `ModelComparisonChart.jsx`, `ModelComparisonSummary.jsx`, `ModelComparison.css`; Modify `frontend/src/app/App.jsx`, `frontend/src/features/airport-panel/AirportPanel.jsx`. Reuse `frontend/src/app/layout/layoutTokens.css` and existing Fluent controls; no global CSS reset.

**Interfaces:** `ModelComparisonSummary({ summary })`, `ModelComparisonTable({ section, rows, times, selectedValidAt, onSelectTime })`, `ModelComparisonChart({ series, times, unit, selectedValidAt, onSelectTime })`; `ModelComparisonPage` owns mode/tab/selected time and consumes Task 7 hook.

- `AirportPanel.jsx`의 기존 지원 공항 목록을 shared 상수로 대체하고 `sections`의 AMOS 다음에 요약·버튼을 추가한다. section icon·scrollspy·접근성 제목도 같은 배열에 연결한다. 미지원 공항은 구획·데이터 요청 모두 없다.
- `App.jsx`에서 메인 shell 이전 `/airport/([A-Z]{4})/models` 분기와 lazy import를 추가한다. 이 분기는 기존 메인 shell의 provider보다 먼저 반환하므로 `<TimeZoneProvider><Suspense><ModelComparisonPage /></Suspense></TimeZoneProvider>`로 감싸 기존 저장된 시간대와 전환 동작을 유지한다. 선택 시각은 query `valid_at`으로 전달한다. 날짜를 검증하고 유효하지 않으면 현재 이상 첫 정시를 쓴다. 복귀 링크는 기존 `/?airport={ICAO}`를 사용한다.

```js
const href = `/airport/${icao}/models?valid_at=${encodeURIComponent(summary.valid_at)}`
// <a href={href}>분석 화면 열기 ↗</a>
// return link: /?airport=RKSI ; no external returnTo parameter
```

- 전체 보기 기본값과 `바람 | 강수 | 운고·운량 | 기온·RH` 요소별 보기를 구현한다. 날짜·시간대·선택 실행 칩을 상단에 두고 로딩·빈자료·부분자료·갱신 실패 상태를 표시한다. 풍향 barb/풍속과 돌풍은 두 줄, 운량은 전/저/중/상층 %, 운고는 방식 배지와 상태, 기온·RH는 같은 셀의 두 값이다. 이슬점·기압은 접힌 보조 정보에 둔다.
- SVG 차트에서 공통 `times` 인덱스로 x좌표를 계산한다. 풍속 실선·돌풍 점선·샘플 점 표시, 강수 표시창 누적, 운고, 기온·RH 각 단위 그래프를 제공한다. 누락 값은 선을 잇지 않는다. 모델별 색상 외에도 범례와 이름·선 모양으로 구분한다.

```js
const xAt = index => padding + index * (width - 2 * padding) / Math.max(1, times.length - 1)
// Use one times array for all charts and table columns.
// Break path segments at null rather than filtering nulls and connecting the rest.
```

- hover와 같은 정보를 포커스·탭으로 고정할 수 있게 한다. 공항·실행·유효시각·F-hour·원/보간 여부·격자·운고 근거를 표시한다. 시간 열/점 선택은 하나의 `selectedValidAt`만 갱신한다.
- 오른쪽 두 카드는 자급 가능한 정적 예시 SVG로 만들고 `임시 예시 — 현재 공항·실행자료와 연결되지 않음`을 표시한다. 실제 이미지 API/연직 프로파일 수집을 연결하지 않는다. 좁은 화면은 비교 영역 우선으로 세로 배치하고 표 내부만 가로 스크롤한다. iPad 1180×820, desktop, mobile에서 페이지 가로 overflow가 없어야 한다.
- `npm --prefix frontend run build` 실행 후 Task 9 브라우저 계약으로 진입→비교→복귀를 확인한다. 표시 변경만 확인하는 중복 단위 테스트는 추가하지 않는다.

### 8-A. 진입과 독립 페이지

- [ ] **8.1 — 목업을 직접 확인한 뒤 Summary component를 만든다.** `artifacts/airport-model-comparison-mockup.html`을 브라우저로 열어 전체 보기·요소별 보기·표·그래프 상세 동작을 확인하고 기준 화면을 캡처한다. 최신 스펙과 달라 적용하지 않을 요소를 짧게 기록한다. 이어 `ModelComparisonSummary`는 summary prop만 받아 바람·강수·운고 3줄과 시각·모델 수를 렌더링한다. 내부에서 fetch나 모델 계산을 하지 않는다. 데이터 대기 상태를 위해 summary=null도 받을 수 있게 한다.
- [ ] **8.2 — 패널용 container를 만든다.** `ModelComparisonSummary.jsx`에 named export `AirportModelComparisonSection({ icao })`를 두고 hook→뷰모델→Summary→진입 링크를 연결한다. 부모 AirportPanel에 별도의 조건부 hook을 넣지 않는다. 부모에서는 isFullFeature일 때 container를 렌더링한다.
- [ ] **8.3 — sections와 icon registry를 같이 수정한다.** AMOS 다음 `id='model-analysis'`, label/title='상세 예보 분석' 구획을 추가한다. 스크롤 이동 버튼도 같은 sections 배열을 사용한다. 비지원 공항의 네트워크 탭에 비교 GET이 없는지 확인한다.
- [ ] **8.4 — 독립 route를 연결한다.** 경로 regexp의 ICAO를 shared allowlist로 검증하고 provider와 Suspense로 감싼다. query valid_at은 encodeURIComponent/URLSearchParams로 처리한다. return link는 `/`의 airport query만 허용한다.
- [ ] **8.5 — 페이지 상단을 만든다.** 공항명·ICAO, 시간대 전환, 선택 시각, 모델별 run/가용시각 chip, Summary, 표시 모드 순으로 배치한다. stale/error는 기존 값 위에 별도 상태로 보이고 회색 숫자 0으로 바꾸지 않는다.

### 8-B. 표와 그래프

- [ ] **8.6 — 공통 표 frame을 만든다.** `table/caption/thead/tbody`, scope=col/row, 고정 모델명 열, 공통 시간 열을 사용한다. caption/aria-label은 바람·강수·운고·운량·기온RH별로 고유하게 준다. 풍속/돌풍 2줄과 기온/RH 쌍은 cell 내부 렌더링만 달리한다.
- [ ] **8.7 — 운량과 운고를 연결한다.** 전/저/중/상층 운량 %는 NWP cloud 값이고 METAR/TAF cloud amount는 원 부호로 유지한다. 운고 badge는 스펙의 네 문구를 모델 method에서 선택한다. 추정 미검출과 no_ceiling을 같은 빈칸으로 표시하지 않는다.
- [ ] **8.8 — 차트 x축을 시간으로 고정한다.** NWP는 정시 timestamp, 관측 그래프를 그리는 경우는 실제 observed_at을 x값으로 쓴다. 시작/끝 시각과 tick은 table의 times에서 가져온다. 각 chart마다 별도 필터로 시간축을 당기지 않는다.

```js
const startMs = Date.parse(times[0])
const endMs = Date.parse(times.at(-1))
const xAtTime = iso => padding +
  (Date.parse(iso) - startMs) / Math.max(1, endMs - startMs) * (width - 2 * padding)
// all sections use the same startMs/endMs, including temperature and RH
```

- [ ] **8.9 — null마다 SVG path를 끊는다.** `series.points`를 연속 finite 구간들로 나눈 뒤 구간별 path를 만든다. 값 0은 정상 점이며 null은 빈 구간이다. 전부 null인 모델은 범례에 상태를 표시하고 선을 만들지 않는다. 기온/RH는 같은 model 색상과 서로 다른 y축 범위를 쓴다.
- [ ] **8.10 — 선택과 상세 포커스를 연결한다.** 표 시간 머리글 버튼·그래프 sample 선택·hover 고정은 `onSelectTime(UTC ISO)`로 통일한다. 터치에서는 탭으로 상세를 고정하고 키보드는 focus/Enter로 같은 내용을 읽을 수 있게 한다. 시각이 바뀌면 Summary와 URL query도 함께 바뀐다.
- [ ] **8.11 — 두 표시 모드를 연결한다.** `전체 보기`에서는 모든 section, `요소별 보기`에서는 tabpanel 하나만 렌더링한다. 모드/탭은 UI 상태만 바꾸고 API를 재요청하거나 다른 데이터 배열을 만들지 않는다. 페이지에서 compute를 반복하지 않고 같은 vm을 전달한다.
- [ ] **8.12 — 임시 일기도를 분리한다.** 두 정적 SVG card에는 준비 중/임시 문구를 넣고 데이터 시각·모델명이 실제 연결된 것처럼 표시하지 않는다. 링크나 버튼으로 실제 자료 수집을 일으키지 않는다. 예시 SVG는 `ModelComparisonPage.jsx` 안의 작은 정적 markup으로 충분하다.

### 8-C. 접근성과 화면 상태

- [ ] **8.13 — 반응형 구조를 적용한다.** desktop은 비교 본문+보조 카드, iPad/좁은 폭은 본문 먼저 세로 배치한다. table/chart를 함께 감싸는 비교 영역에서 시간 열을 맞추고 내부 가로 스크롤을 제공한다. 폰트 축소로 13시간을 화면에 억지로 넣지 않는다.
- [ ] **8.14 — 상세 상태를 화면으로 확인한다.** loading, empty, partial, error-with-last-data, supported-without-AMOS, outside-window 여섯 상태를 fixture에서 연다. 모든 상태에서 닫기/복귀와 시간대 조작이 가능해야 한다.
- [ ] **8.15 — UI build와 브라우저 계약을 실행한다.** 기존 airport-panel 동선, 독립 URL direct entry/refresh/back, UTC/KST, 3뷰포트, 키보드/터치, 순위/자동판단 부재를 확인한다. 증거 파일 이름에는 viewport/공항/mode/tab을 넣는다.

## Task 9: 전체 흐름 검증과 구현 인계 기록

**Files:** Create `frontend/verification/model-comparison-fixture.mjs`, `frontend/verification/contracts/airport-model-comparison.spec.mjs`, `scripts/verify-airport-model-comparison.mjs`, `docs/operations/airport-model-comparison.md`; Modify `frontend/verification/admin-fixture.mjs`, `frontend/verification/contracts/admin-console.spec.mjs`, `docs/policies/verification/contracts.md`, `Architecture.md`의 새 파일 책임 항목. Test fixture 재사용은 backend에 둔 작은 raw/expected 자료에서 한다.

**Interfaces:** 검증 스크립트 CLI `node scripts/verify-airport-model-comparison.mjs --airport RKSI --output artifacts/airport-model-comparison/`는 프로덕션 수집 모듈·파서를 임시 DATA_PATH에서 사용하고 수집 보고·정규화 JSON을 저장한다. import 전에 DATA_PATH를 설정하고 실제 저장소·실제 관리자 설정은 변경하지 않는다.

- raw fixture → 실제 parser/processor/store → API를 통과하는 통합 검증을 추가한다. 브라우저 UI 계약용 API fixture와 구분한다. 합성한 강수·실패 사례는 합성으로 명시하고, 실자료의 실제 숫자를 수정해 실측이라고 부르지 않는다.
- 새 계약 `airport-model-comparison`을 desktop·ipad-landscape·mobile에 등록한다. 기존 fixture lifecycle/정식 포트를 따르고 외부 요청은 차단한다. 다음 예시의 선택자는 실제 accessible name을 구현과 맞춰 사용한다.

```js
import { test, expect } from '../fixtures.mjs'
import { installModelComparisonFixture } from '../model-comparison-fixture.mjs'
test('airport-model-comparison: preserves selected time and paired temperature/RH', async ({ page }) => {
  await installModelComparisonFixture(page) // fixed now 2026-09-06T08:20Z; target 09:00Z; RKPU real sample values
  // New fixture module sets demo clock + comparison API + version/onboarding state.
  await page.goto('/?airport=RKPU', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: '분석 화면 열기 ↗', exact: true }).click()
  await expect(page.getByRole('heading', { name: '울산공항 상세 예보 분석' })).toBeVisible()
  await expect(page).toHaveURL(/\/airport\/RKPU\/models\?valid_at=/)
  await page.reload()
  await page.getByRole('button', { name: '요소별 보기', exact: true }).click()
  await page.getByRole('tab', { name: '기온·RH', exact: true }).click()
  await expect(page.getByRole('table', { name: '기온·RH' }).getByText('23.0°C / 74%', { exact: true })).toBeVisible()
})
```

- 같은 계약에 EC 00Z F18 표시, 4모델/부분자료/빈자료/갱신실패, 운고 4방식·상태, 순위·자동 판단 없음, 전체/요소 보기 값 일치, TAF 기온·RH 행 없음, UTC/KST, 터치 상세·복귀·미지원 공항을 포함한다. 새로고침 후 선택 시간이 query와 같은지도 값으로 단언한다.
- `npm --prefix frontend run dev:contract -- --grep 'airport-model-comparison|airport-panel'` 실행. 예상: 등록된 세 프로젝트 통과, 새 기능에서 발생한 console/pageerror 없음, 페이지 가로 스크롤 없음. 자동 실행 증거와 상태별 screenshot을 ignored artifact에 저장한다. 실패 시 같은 흐름 반복 대신 로그·원인을 확인한다.
- 실자료 RKSI/RKPU를 production parser로 한 번씩 확인하고 KIM/GFS/ICON 13시각, EC 이동 13시각의 모든 필수 필드·허용 결측·샘플 근거를 보고한다. 자동 수집을 기다리는 대신 주입한 clock과 fixture로 새 실행/동일 EC run 구간 이동/부분 실패/재시도/재시작을 별도 재현한다. 실호출 실패를 fixture 통과로 대신 완료 처리하지 않는다.
- 관리자 페이지 모델 3종의 정상/지연/OFF·마지막 실패·다음 확인을 기존 admin fixture 계약에 보완하고 snapshot 저장→demo진입→live복귀 시 같은 API가 다른 활성 뷰를 읽는 것을 확인한다.
- `docs/operations/airport-model-comparison.md`에 켜기/끄기, 모델별 run/window 확인, 수집 재시도, 보존, fixture/실자료 명령, 운고 추정 한계를 적는다. `Architecture.md`는 실제 추가된 모듈 책임만 갱신한다. Graphify update 후 변경 파일·검증 결과·남은 후속 과제를 보고한다.

### 9-A. fixture·실자료 검증을 분리

- [ ] **9.1 — fixture manifest를 만든다.** `backend/test/fixtures/airport-model-comparison/manifest.json`에 파일명·공항·run·valid 구간·수집일·raw/derived/synthetic 구분·SHA256을 기록한다. ignored artifact 경로는 출처 기록으로만 남긴다. 테스트 실행은 committed fixture만으로 가능해야 한다.
- [ ] **9.2 — 실자료 검증 스크립트 인자를 검증한다.** `--airport`는 지원 목록만 받고 `--output`은 프로젝트 ignored artifacts 아래 task 경로로 제한한다. 임시 DATA_PATH를 생성한 뒤 dynamic import로 config/collector를 읽는다. 브라우저 표시 검증에 쓰는 시각도 결과 report에 명시한다.
- [ ] **9.3 — 기존 KIM 실황 자료를 안전하게 재사용한다.** 검증 root에 필요한 KIM run 파일을 복사하거나 read-only 입력 경로로 주입한다. KIM 전체 격자 수집을 검증 스크립트에서 무조건 다시 돌리지 않는다. 필요한 비교 추가 변수만 실제 API로 확보하고 호출 수를 보고한다.
- [ ] **9.4 — 실행별 보고를 저장한다.** 모델마다 requested run/window, actual run/window, 필드 개수, allowed null, missing 필드, 발행 성공 공항, 요청 횟수·바이트·오류를 JSON으로 출력한다. 실제 수집 성공과 fixture 재현을 같은 success boolean으로 합치지 않는다.
- [ ] **9.5 — GRIB 검증을 독립 도구와 대조한다.** F008/F009 fixture의 expected는 앞서 저장한 ecCodes 결과이고 새 판독기 출력으로 expected를 재생성하지 않는다. 새 실제 run을 받으면 임시 검증 환경의 ecCodes와 비교해 template/level/시간/수치를 확인한다. 제품 runtime에 Python 의존성을 넣지 않는다.

### 9-B. 브라우저 검증 행렬

- [ ] **9.6 — `installModelComparisonFixture(page)`를 구현한다.** CURRENT_VERSION/onboarding 상태를 설정하고 유효 now=08:20Z, RKPU09Z 실자료 값을 반환한다. 13시간을 임의로 복제할 때는 synthetic horizon임을 manifest에 밝힌다. 세 모델의 누락·갱신·오류 시나리오는 fixture option으로 선택한다.
- [ ] **9.7 — 기본 경로를 실제로 클릭한다.** `/?airport=RKPU` → panel section → 분석 link → 독립 화면 → 요소별 보기 → 기온RH → refresh → 복귀까지 수행한다. GET을 막고 HTML만 렌더하는 검증은 기본 동선 완료 증거로 사용하지 않는다.
- [ ] **9.8 — 다음 행렬을 계약에 넣는다.** selector는 소유 region/table 안에서 role/label/text로 찾는다. 같은 값이 여러 곳에 있으면 first()/nth()로 피하지 말고 모델 row·시간 열로 범위를 좁힌다.

| 검증 축 | 반드시 확인할 내용 |
| --- | --- |
| 이름/진입 | AMOS 다음 구획, 지원 공항만 요청, 선택 시간 query 유지 |
| 시간 | EC00Z F18 vs peer06Z F12, KST/UTC label, refresh 후 같은 instant |
| 값 일치 | 같은 model/time의 표·chart detail·summary 숫자/상태 일치 |
| 기온RH | 23.0°C/74%, 한쪽 null, TAF 행 부재, 각 그래프 단위 |
| 운고 | 네 산출 배지, 값/미검출/no_ceiling/결측/범위 밖 |
| 강수 | METAR/TAF는 현상, AMOS는 mm, 누적은 공통 구간, 결측 이후 선 없음 |
| 갱신 | 늦은 공항 응답 무시, 실패 시 이전 값 보존, 다음 성공 후 오류 해제 |
| 조작 | 키보드 focus/Enter, 터치 상세 고정, 전체/요소 모드 상태 유지 |
| 레이아웃 | desktop1440, iPad1180, mobile, 페이지 overflow 없음 |
| 제외 범위 | 순위/1등/자동변화/위험강조 없음, 일기도 임시 문구 있음 |

- [ ] **9.9 — 관리자와 snapshot을 이어 검증한다.** `frontend/verification/admin-fixture.mjs`, `frontend/verification/contracts/admin-console.spec.mjs`의 모델 fixture·assertion을 추가한다. 각 모델의 run/available/collected/공항 수/OFF/다음 점검을 실제 detail에서 읽는다. snapshot 변경은 backend 실제 파일 경로 시험과 사용자 API 재조회로 확인한다.
- [ ] **9.10 — 목업과 대조하고 브라우저 캡처 증거를 저장한다.** Task 8.1의 목업 기준 캡처와 구현 화면을 같은 viewport·표시 모드로 나란히 비교한다. 주요 배치·정보 순서·표와 그래프의 대응·범례·상세 조작이 유지됐는지 확인하고, 최신 스펙에 따른 차이와 수정이 필요한 차이를 구분해 기록한다. `artifacts/responsive-screenshots/airport-model-comparison/<timestamp>/`에 manifest, desktop/ipad/mobile 각 mode/tab screenshot, console.json, failure trace, `review/issues.md`를 남긴다. 새 계약의 성공 상태는 정식 명령으로 세 프로젝트가 모두 통과한 뒤에만 갱신한다.

### 9-C. 완료 판단과 인계

- [ ] **9.11 — 최종 검증 명령을 실행한다.** 실패한 항목을 목록에서 빼서 통과시키지 않는다. 제품 동작 단위의 집중 tests → frontend build → 관리되는 browser contract 순서다. 무관한 전체 회귀를 반복 실행하지 않는다.

```bash
node --test backend/test/airport-model-comparison-*.test.js
node --test backend/test/api-operation-registry.test.js backend/test/collector-registry.test.js backend/test/collector-scheduler.test.js backend/test/collector-execution.test.js backend/test/snapshot-store.test.js
node --test frontend/src/features/airport-model-comparison/modelComparisonViewModel.test.js
npm --prefix frontend run build
npm --prefix frontend run dev:contract -- --grep 'airport-model-comparison|airport-panel|admin-console'
```

- [ ] **9.12 — 실제 수집 결과를 별도 확인한다.** RKSI/RKPU에 대해 비교 대상 13시각과 모델별 실제 run을 report에서 읽는다. 외부 제공자가 실패하면 마지막 성공 보존 검증과 실자료 신규 수집 미완료를 각각 보고한다. 1개 시간의 기존 실자료가 있다는 것만으로 전체 수집 완료를 주장하지 않는다.
- [ ] **9.13 — 문서와 status를 갱신한다.** 작업 번호별 완료 여부·검증 명령/결과·artifact 링크·실자료 미완료가 있으면 그 이유를 기록한다. 후속 과제는 스펙의 목록을 참조한다. 배포·커밋·푸시를 자동으로 수행하지 않는다.

## 스펙 수용 기준 대응

| 스펙 기준 | 구현·검증 작업 |
| --- | --- |
| 0, 0-1: 패널 위치·이름·대상·정시·진입 | 7, 8, 9 |
| 1, 2, 2-1, 3: 자료 출처·공통시각·실행·EC 이동·추적 | 1~7, 9 |
| 3-1, 4, 4-1, 4-2: 관측/TAF·동일값·결측·기온RH | 5, 7~9 |
| 5, 5-1, 5-2, 5-3, 6: 운량·운고·F0 | 1, 3, 4, 7, 9 |
| 7: 고정 행·자동 판단 제외 | 7~9 |
| 8, 8-1~8-4: 성공 자료 보존·관리자·외부호출·OFF·보존 | 2, 4, 6, 9 |
| 9: 일기도 임시 표시 | 8, 9 |
| 본문 데모·과거관측·전체/요소 보기 | 5~9 |

## 실행 경계와 후속 과제

이 계획의 작업 1~9가 첫 구현이다. 순위·오차 점수·자동 변화 감지·위험 강조·운고 정확도 평가·예보시간 확대·실제 일기도는 스펙의 후속 과제 표에 남기며 이 계획에 작업을 만들지 않는다. 전체 수집·갱신·실패 복구 검증은 Task 9의 필수 완료 조건이다.

계획 검토에서 파일·인터페이스·수용 기준 누락을 해결한 뒤 사용자 검토에 넘긴다. 실제 실행을 요청받으면 Task 1부터 진행하고, 각 완료 작업과 검증 증거는 `docs/superpowers/status/2026-09-06-airport-detailed-forecast-analysis.md`에 기록한다(실행 시 생성).
