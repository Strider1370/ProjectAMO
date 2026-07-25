# Plan: 모니터링 데이터 수명주기 통합

**Spec:** `docs/superpowers/specs/2026-07-23-monitoring-data-lifecycle-unification.md`
**Goal:** 메인과 `/monitoring`이 하나의 브라우저 데이터 수명주기 구현을 쓰되, 모니터링의 화면·알림·데이터 범위·갱신 주기를 그대로 유지한다.

## Global Constraints

- `backend/`, cron, store, 기존 API URL·응답 형식은 수정하지 않는다.
- `/monitoring`의 JSX 구조, CSS class, URL(`?mode=ops|ground`), 지도 진입 방식과 legacy 컴포넌트는 수정하지 않는다.
- 메인은 60초, 모니터링은 `poll_interval_seconds`(없음 또는 `0`이면 30초)라는 현재의 서로 다른 주기를 유지한다.
- 모니터링은 초기 진입 때 `sigwxLowHistory`, `groundOverview`, `environment`, `airportInfo`, `adsb`, SIGWX fronts/clouds와 알림 기본값을 현재처럼 수신한다. RainViewer·NOTAM을 모니터링 변경 갱신 범위에 추가하지 않는다.
- `MapView`의 ADS-B 레이어 전용 갱신은 유지하며, 공통 weather polling loop와 합치지 않는다.
- 새 전역 store, 새 패키지, 새 백엔드 endpoint를 만들지 않는다.
- 구현 전과 후에 같은 고정 fixture와 같은 viewport에서 모니터링 화면을 비교한다. 이미지 허용 차이는 0이다.

---

## Task 1: 고정 모니터링 fixture와 화면 불변 검증 기준 만들기

**Files:**
- Create: `frontend/verification/monitoring-fixture.mjs`
- Modify: `frontend/verification/contracts/monitoring.spec.mjs`
- Create: `frontend/verification/contracts/monitoring-visual.spec.mjs`
- Create: `frontend/verification/contracts/monitoring-visual.spec.mjs-snapshots/`의 Playwright 승인 이미지 12개

**Interfaces:**
- Produces: `installMonitoringFixture(page)` — `/monitoring`이 읽는 `/api/*`, radar/satellite metadata, `/api/snapshot-meta` 요청을 고정 응답으로 route 처리한다.
- Produces: `openMonitoringState(page, state)` — `ops`, `ground`, `map`, `settings` 상태를 URL과 사용자 클릭으로 연다. `map`은 실제 지도 레이어 패널을 연 상태다.
- Consumes: Playwright의 `expect(page).toHaveScreenshot()`과 기존 `desktop`, `ipad-landscape`, `mobile` project.

- [ ] Step 1: `monitoring-fixture.mjs`에 `installMonitoringFixture(page)`를 만든다. 공항 목록, METAR, TAF, AMOS, 경보, SIGMET/AIRMET, 낙뢰, SIGWX 및 fronts/clouds metadata, 지상 예보·개황, 환경, 공항 정보, ADS-B, 경보 유형, 알림 기본값과 `/api/snapshot-meta`를 명시적인 고정 JSON으로 `page.route()`에서 반환한다. fixture의 `snapshot-meta`는 첫 화면 안정화 중에는 같은 hash를 반환한다.
- [ ] Step 2: 같은 파일에 `openMonitoringState(page, state)`를 만든다. `ops`와 `ground`는 `/monitoring?mode=...` 직접 진입으로 연다. `map`은 mobile에서 먼저 `지도` task button을 누르고, 모든 viewport에서 `getByRole('button', { name: '항공', exact: true })`를 누른다. desktop/iPad에서는 `getByLabel('항공 레이어 토글')`, mobile에서는 `getByRole('dialog', { name: '항공 레이어' })`가 visible일 때까지 기다려, 항상 보이는 icon container가 아니라 실제 열린 항공 레이어 panel을 확인한다. `settings`는 mobile의 `설정` task button 또는 desktop/iPad의 `aria-label="설정"` button으로 연다. 각 상태에서 `.dashboard-root`, `data-dashboard-mode`, `data-phone-task`, 열린 레이어 panel 또는 설정 dialog를 기다린다.
- [ ] Step 3: 기존 `monitoring.spec.mjs`의 시작에 `await installMonitoringFixture(page)`를 추가한다. desktop/iPad의 운항→지상 URL·ARIA 검사는 유지하고, mobile에서는 `지도`와 `설정` task를 열어 기존 task tab이 동작함을 검사한다.
- [ ] Step 4: `monitoring-visual.spec.mjs`에 제목이 각각 `monitoring visual: ops`, `monitoring visual: ground`, `monitoring visual: map panel`, `monitoring visual: settings`인 test 네 개를 만든다. 각 test는 `desktop`, `ipad-landscape`, `mobile`에서 해당 상태를 연 뒤 `await expect(page).toHaveScreenshot('monitoring-<state>.png', { animations: 'disabled', caret: 'hide', maxDiffPixels: 0 })`를 실행한다. Mapbox tile, 현재 시각, 광고·외부 network 응답은 fixture 또는 route abort로 고정하여 이미지가 환경마다 변하지 않게 한다.
- [ ] Step 5: 변경 전 기준 branch에서 `cd frontend; npx playwright test verification/contracts/monitoring-visual.spec.mjs --update-snapshots`를 실행하고, 생성된 12개 승인 이미지를 눈으로 확인한다. 각 이미지가 ops·ground·지도·설정 상태와 해당 viewport를 실제로 나타내는지 확인한다.
- [ ] Step 6: Verify — `cd frontend; npx playwright test verification/contracts/monitoring-visual.spec.mjs`와 `npm.cmd run dev:contract -- --grep "monitoring visual|opens operations mode"`를 실행한다. 첫 명령은 12 visual assertion, 둘째 명령은 visual과 route/ARIA contract가 각각 실행되어 모두 통과해야 한다.
- [ ] Step 7: Commit — `test(monitoring): fix lifecycle-preservation visual baseline`.

## Task 2: 공통 polling의 부분 실패 병합 규칙을 순수 함수로 고정하기

**Files:**
- Create: `frontend/src/app/pollingData.js`
- Create: `frontend/src/app/pollingData.test.js`
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/features/monitoring/monitoringApi.js`

**Interfaces:**
- Produces: `mergePollingData(previousData, changedData)` — `changedData`의 값이 `undefined`인 key는 이전 정상 값을 유지하고, HTTP 200 JSON `null`은 정상 빈 값으로 반영한다.
- Produces: `hasIncompletePollingData(changedData)` — 변경 요청 중 하나라도 network/HTTP 실패로 `undefined`가 반환됐는지 판단한다.
- Produces: `loadChangedWeatherData(changes, options)`와 `loadChangedMonitoringData(changes)`의 기존 반환 object. 주기적 요청 실패 key만 `undefined`가 된다.

- [ ] Step 1: `pollingData.js`에 `mergePollingData(previousData = {}, changedData = {})`를 만든다. `Object.entries(changedData)`를 순회해 value가 `undefined`인 항목은 제외하고, 나머지만 `{ ...previousData, ...availableData }`에 병합한다. `null`은 제외하지 않는다.
- [ ] Step 2: 같은 파일에 `hasIncompletePollingData(changedData = {})`를 만들고 `Object.values(changedData).some((value) => value === undefined)`를 반환한다.
- [ ] Step 3: `pollingData.test.js`에 Node `assert` 테스트 네 개를 작성한다: 정상 payload는 교체됨, `undefined`인 METAR와 SIGWX fronts 두 key는 기존 값을 각각 보존함, HTTP 200 JSON `null`은 정상 빈 응답으로 기존 값을 지움, 두 `undefined` key가 있으면 `hasIncompletePollingData()`가 true를 반환함. `node --test src/app/pollingData.test.js`가 네 테스트 모두 통과해야 한다.
- [ ] Step 4: `weatherApi.js`의 내부 `fetchJson`에 `optional: 'preserve'` 모드를 추가한다. HTTP/network 실패 때만 `undefined`를 반환하고, HTTP 200의 JSON `null`은 그대로 반환한다. `loadChangedWeatherData` 안의 모든 변경분 fetch를 이 모드로 바꾼다. 초기 `loadWeatherData`와 지연 초기 수신의 현재 `optional: true` 동작은 바꾸지 않는다.
- [ ] Step 5: `monitoringApi.js`의 내부 `fetchJson`에도 같은 `optional: 'preserve'` 모드를 추가한다. `loadChangedMonitoringData`의 SIGWX fronts/clouds 재수신은 이 모드를 사용해, 주기적 실패가 기존 보조 metadata를 지우지 않게 한다.
- [ ] Step 6: Verify — `cd frontend; node --test src/app/pollingData.test.js`와 `npm.cmd run build`를 실행한다. 둘 다 exit code 0이어야 한다.
- [ ] Step 7: Commit — `fix(weather): preserve last polling data on partial refresh failure`.

## Task 3: 메인 polling 훅에서 재사용 가능한 수명주기만 추출하기

**Files:**
- Modify: `frontend/src/app/useWeatherPolling.js`
- Modify: `frontend/src/app/snapshotMeta.js`
- Create: `frontend/src/app/snapshotMeta.test.js` (파일이 없을 때만; 이미 있으면 Modify)

**Interfaces:**
- Produces: `useSnapshotPolling(options)` named export.
- Consumes: `mergePollingData`, `hasIncompletePollingData`, `buildSnapshotMetaFromData`, `detectSnapshotChanges`, `hasSnapshotChanges`.
- Preserves: default `useWeatherPolling()` return shape `{ weatherData, requestDeferredWeatherData }`.

- [ ] Step 1: `useWeatherPolling.js`에 named hook `useSnapshotPolling({ loadInitialData, selectInitialData, onInitialData, fetchSnapshot, buildSnapshot, advanceSnapshot, detectChanges, hasChanges, loadChangedData, intervalMs, initialErrorMode, logPrefix })`를 추가한다. `advanceSnapshot({ latestSnapshot, changedData, previousSnapshot, mergedData })`는 성공한 변경분 뒤에만 호출한다. `initialErrorMode`는 `'silent'` 또는 `'state'`만 받으며, 반환값은 `{ data, loading, initialError }`로 고정한다.
- [ ] Step 2: 이 hook의 최초 effect에서 `loadInitialData()`를 한 번 실행하고 `selectInitialData(result)`를 state와 snapshot에 저장한다. cleanup 뒤 state를 쓰지 않는다. 최초 실패는 `initialErrorMode === 'state'`일 때만 `initialError`에 저장하고, `'silent'`일 때는 기존 메인처럼 console warning만 남긴다.
- [ ] Step 3: 같은 hook에 interval effect를 둔다. `intervalMs === null`이면 timer를 만들지 않고, 숫자이면 단 하나의 timer만 만든다. in-flight guard로 중첩 polling을 막고, snapshot이 없으면 초기 수신을 재시도한다.
- [ ] Step 4: 변경 polling에서 `fetchSnapshot` → `detectChanges` → `loadChangedData` 순서로 실행한다. 변화가 없으면 state를 건드리지 않는다. 변화가 있으면 `mergePollingData`로 성공한 key만 병합한다. `hasIncompletePollingData(changedData)`가 true면 snapshot을 전진시키지 않아 다음 주기에 같은 모든 변경 key를 재시도한다. false일 때만 `advanceSnapshot({ latestSnapshot, changedData, previousSnapshot, mergedData })`의 반환값을 snapshot에 저장한다. 주기적 실패는 `initialError`를 설정하지 않고 console warning만 남긴다.
- [ ] Step 5: 기존 default `useWeatherPolling()`을 이 hook의 메인 profile wrapper로 바꾼다. `loadWeatherData`, `fetchSnapshotMeta`, `buildSnapshotMetaFromData`, `detectSnapshotChanges`, `loadChangedWeatherData`, 60,000ms와 `advanceSnapshot: ({ mergedData }) => buildSnapshotMetaFromData(mergedData)`를 넘긴다. `loadedDeferredKeysRef` 및 `requestDeferredWeatherData`의 현재 public 동작은 그대로 둔다. 지연 자료가 수신되면 `buildSnapshotMetaFromData`로 snapshot을 다시 계산한다.
- [ ] Step 6: `snapshotMeta.test.js`에 메인 profile이 RainViewer·NOTAM 변경을 현재처럼 감지하고, monitoring profile에 넘기지 않을 key가 여기서 새로 추가되지 않는 회귀 테스트를 둔다.
- [ ] Step 7: Verify — `cd frontend; node --test src/app/pollingData.test.js src/app/snapshotMeta.test.js`와 `npm.cmd run build`를 실행한다. tests와 build가 통과해야 한다.
- [ ] Step 8: Commit — `refactor(app): extract shared snapshot polling lifecycle`.

## Task 4: 모니터링을 공통 수명주기에 연결하고 페이지의 자체 polling 제거하기

**Files:**
- Modify: `frontend/src/features/monitoring/monitoringApi.js`
- Modify: `frontend/src/features/monitoring/MonitoringPage.jsx`
- Modify: `frontend/src/app/useWeatherPolling.js`

**Interfaces:**
- Consumes: `useSnapshotPolling`, `mergePollingData`, `hasIncompletePollingData`.
- Produces: `loadMonitoringInitialData()` returning `{ data, alertDefaults }`.
- Produces: `buildMonitoringSnapshot(data)`, `detectMonitoringSnapshotChanges(snapshot, saved)`, `nextMonitoringSnapshot(latestSnapshot, changedData, saved)` exports from `monitoringApi.js`.

- [ ] Step 1: `monitoringApi.js`에 `loadMonitoringInitialData()`를 만든다. 기존처럼 `Promise.all([loadMonitoringStaticData(), loadMonitoringData()])`로 병렬 요청하고, 기존 `MonitoringPage`와 같은 airport/warningTypes 병합 규칙을 적용한 뒤 `{ data: merged, alertDefaults: defaults }`를 반환한다. 중복 요청 제거는 하지 않는다.
- [ ] Step 2: `MonitoringPage.jsx` 안의 `hashOf`, `tmOf`, `overlayKey`, `buildSnapshotStateFromData`, `detectChanges`, `nextSnapshotState`를 `monitoringApi.js`로 옮긴다. 이름은 각각 `buildMonitoringSnapshot`, `detectMonitoringSnapshotChanges`, `nextMonitoringSnapshot`으로 export한다. `nextMonitoringSnapshot(latestSnapshot, changedData, saved)`는 기존처럼 `changedData hash → latestSnapshot hash → saved hash` fallback 순서를 유지한다. 현재 감지 key 집합(METAR, TAF, warning, SIGMET/AIRMET, SIGWX, AMOS, lightning, ADS-B, ground, environment, airportInfo, echo, satellite, fronts/clouds)과 alias 처리(`metar_overseas` 등)를 byte-for-byte 동등한 논리로 유지한다. RainViewer·NOTAM을 새로 넣지 않는다.
- [ ] Step 3: `MonitoringPage.jsx`에서 `data`, `loading`, `error`의 자체 state와 `initialLoad`, `pollOnce`, `pollingRef`, `pollingInFlightRef`, `snapshotRef`를 제거한다. `useSnapshotPolling`에 `loadMonitoringInitialData`, `selectInitialData: ({ data }) => data`, `fetchMonitoringSnapshotMeta`, `buildMonitoringSnapshot`, `detectMonitoringSnapshotChanges`, `hasChanges: (changes) => Object.values(changes).some(Boolean)`, `loadChangedMonitoringData`, `advanceSnapshot: ({ latestSnapshot, changedData, previousSnapshot }) => nextMonitoringSnapshot(latestSnapshot, changedData, previousSnapshot)`, `initialErrorMode: 'state'`, `logPrefix: '[Monitoring]'`을 전달한다.
- [ ] Step 4: `onInitialData`에서 기존과 같은 selected airport 유효성 계산을 실행하고 `alertDefaults`를 저장한다. `intervalMs`는 `alertDefaults`가 아직 없을 때 `null`, 그 뒤 `resolveSettings(alertDefaults).global.poll_interval_seconds || 30`의 초 단위를 ms로 변환한 값으로 넘긴다. 이 값 변경은 timer만 재설정하며 초기 데이터를 다시 받지 않는다.
- [ ] Step 5: 기존 alert evaluation effect, localStorage effects, mode URL 변경, popup/sound/marquee, `MonitoringMap` props, JSX 및 CSS class를 변경하지 않는다. 화면의 loading overlay는 공통 hook의 `loading`, initial error overlay는 `initialError`를 사용한다. 주기적 실패는 error overlay를 열지 않는다.
- [ ] Step 6: Verify — `rg -n "setInterval|pollOnce|initialLoad|snapshotRef|pollingRef" frontend/src/features/monitoring/MonitoringPage.jsx` 결과에 모니터링 자체 polling 식별자가 남지 않는지 확인한다. 이어 `cd frontend; npm.cmd run build`를 실행해 통과시킨다.
- [ ] Step 7: Commit — `refactor(monitoring): use shared weather polling lifecycle`.

## Task 5: 실패 경로·화면 보존을 검증하고 아키텍처 문서를 동기화하기

**Files:**
- Modify: `frontend/verification/monitoring-fixture.mjs`
- Modify: `frontend/verification/contracts/monitoring.spec.mjs`
- Modify: `frontend/verification/contracts/monitoring-visual.spec.mjs`
- Modify: `Architecture.md`

**Interfaces:**
- Consumes: `installMonitoringFixture(page)`, `openMonitoringState(page, state)`, `useSnapshotPolling`.
- Produces: deterministic initial-failure and periodic-failure contract coverage.

- [ ] Step 1: fixture에 두 failure scenario를 추가한다. `initialFailure`는 최초 `/api/alert-defaults`를 HTTP 500으로 만들어 `.error-message`가 보이도록 하고, `incrementalFailure`는 첫 `/api/snapshot-meta`에서 METAR와 SIGWX fronts hash 변경을 반환한 뒤 첫 `/api/metar`와 `/api/sigwx-low-fronts`를 각각 HTTP 500으로 만든다.
- [ ] Step 2: 제목이 `monitoring initial failure`인 monitoring contract test를 추가한다. `/monitoring?mode=ops` 진입 뒤 `Load failed:` overlay가 보이고 `.dashboard-root`가 없음을 검사한다.
- [ ] Step 3: 제목이 `monitoring periodic failure retries all failed keys`인 monitoring contract test를 추가한다. 초기 METAR와 선택 공항을 확인하고, 첫 변경분의 `/api/metar`와 `/api/sigwx-low-fronts` 실패 뒤에도 같은 카드/선택 공항과 기존 SIGWX fronts가 남음을 검사한다. 1초 뒤 두 번째 polling에서는 같은 hash 변경에 대한 두 endpoint 재요청이 발생하고 새 METAR·fronts가 모두 표시됨을 검사한다. fixture alert default의 `poll_interval_seconds`는 1로 고정하고, 각 request는 Playwright `page.waitForRequest()`로 최대 4초를 기다린다.
- [ ] Step 4: 고정 fixture 상태에서 `cd frontend; npx playwright test verification/contracts/monitoring-visual.spec.mjs`와 `npm.cmd run dev:contract -- --grep "monitoring visual|opens operations mode|initial failure|periodic failure"`를 실행한다. 첫 명령은 12 visual assertion, 둘째 명령은 visual·route·failure tests를 모두 실행하며 screenshot mismatch가 0이어야 한다.
- [ ] Step 5: `npx depcruise .` 또는 `npx madge --circular frontend/src` 중 설치되어 있는 명령을 실행한다. 새 app→feature 또는 shared→feature 순환 의존성이 없음을 확인한다. `npx knip`도 실행하고, 이번에 만든 export가 unused로 보고되면 사용 위치를 고치거나 불필요한 export를 제거한다.
- [ ] Step 6: `Architecture.md`의 Frontend File Roles에서 `useWeatherPolling.js`를 “공통 snapshot polling lifecycle와 메인 profile wrapper”로, `monitoringApi.js`를 “모니터링 profile·초기/변경 loader”로 갱신한다. 새 `pollingData.js`의 역할도 한 줄 추가한다.
- [ ] Step 7: Verify — `git diff --check`, `git diff --name-only -- backend`가 빈 결과인지 확인, `cd frontend; npm.cmd run build`, `npx playwright test verification/contracts/monitoring-visual.spec.mjs`, `npm.cmd run dev:contract -- --grep "monitoring visual|opens operations mode|initial failure|periodic failure"`, 그리고 선택한 구조 검사 명령이 모두 exit code 0인지 확인한다.
- [ ] Step 8: Commit — `test(monitoring): verify lifecycle migration preserves UI`.

## Requirement Coverage

| Spec requirement | Plan task |
| --- | --- |
| FR-001, FR-005, FR-005a, FR-005b, FR-011 | Task 3, Task 4 |
| FR-002, FR-003 | Task 3, Task 4 |
| FR-004, FR-004a, FR-007, FR-008 | Task 4, Task 5 |
| FR-006, FR-006a | Task 2, Task 3, Task 5 |
| FR-009, FR-010 | Task 1, Task 4, Task 5 |
| SC-001 through SC-010 | Task 1 through Task 5 |

## Pre-implementation Gate

코드 변경 전, 이 계획을 작성하지 않은 별도 reviewer가 Decision completeness review를 수행해야 한다. 이 계획은 현재 승인된 스펙의 결정을 번역한 것만 포함한다. reviewer 결과가 **PASS**일 때만 Task 1을 시작한다. **DECISION GAP**이면 구현을 시작하지 않고 스펙 보정과 사용자 승인을 먼저 받는다.
