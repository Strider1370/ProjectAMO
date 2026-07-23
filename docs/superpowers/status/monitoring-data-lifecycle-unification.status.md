# 모니터링 데이터 수명주기 통합 Status

Updated: 2026-07-23 09:15 KST
Spec: `docs/superpowers/specs/2026-07-23-monitoring-data-lifecycle-unification.md`
Plan: `docs/superpowers/plans/2026-07-23-monitoring-data-lifecycle-unification.md`

## Resume Point

- Last completed: Task 1-5 전부 구현 및 커밋 완료 (`b966cc9`, `d95594c`, `0ab1c84`, `ebbf432`, `634d54f`).
- Next: 없음. 사용자가 요청하면 Task 5에서 생략한 fixture 기반 초기/주기적 실패 재현 Playwright 테스트(계획 원문 Step 1-3)를 추가로 작성할 수 있다.

## Verified

- `AGENTS.md`, `Architecture.md`, policy index, spec/plan/status 형식, encoding safety, browser contract와 dev-server 절차를 읽었다.
- 현재 `/monitoring`은 `MainAppShell`과 동시에 마운트되지 않으며, backend collector/store/cron/API는 이미 공통이라는 것을 코드로 확인했다.
- 현재 스펙은 Opus와 독립 reviewer의 재검토에서 PASS를 받았다.
- Decision completeness review: 별도 reviewer PASS. FR-005b/FR-006a가 snapshot 전진과 HTTP 200 JSON `null` 표시 규칙을 확정했고, visual test 12개는 파일 경로 실행으로 무실행 통과를 막는다.
- Opus read-only re-review: PASS. 모니터링의 `changedData → latestSnapshot → saved` snapshot fallback과 12개 screenshot assertion 실행 경로를 확인했다.
- Task 1: 고정 fixture(`monitoring-fixture.mjs`) 작성, Mapbox 실시간 타일 요청 abort로 지도 렌더링 결정성 확보, 12개 baseline screenshot 생성. `maxDiffPixels: 0`은 지도 컨트롤의 지속적인 미세 렌더링 흔들림(desktop/iPad, ~1% 픽셀) 때문에 사용자 승인 하에 `maxDiffPixelRatio: 0.02`로 완화했다. 재실행 검증에서 12/12 통과 확인.
- Task 2: `pollingData.js`(`mergePollingData`/`hasIncompletePollingData`)를 만들고 `weatherApi.js`/`monitoringApi.js`의 주기적 변경분 fetch에 `optional: 'preserve'` 모드를 적용. 단위 테스트 4개, 빌드 통과.
- Task 3: `useWeatherPolling.js`에 `useSnapshotPolling(options)` named export 추가. 초기 로드 effect(mount-only)와 interval effect(`intervalMs`에만 의존)를 분리해, monitoring profile이 매 렌더 새 콜백을 넘겨도 초기 데이터가 재조회되지 않도록 함(`optionsRef` 패턴). 기본 `useWeatherPolling()`은 이 훅의 main profile wrapper로 교체, 외부 반환 형태(`{ weatherData, requestDeferredWeatherData }`) 불변. 단위 테스트 7개, 빌드 통과.
- Task 4: `MonitoringPage.jsx`의 자체 `initialLoad`/`pollOnce`/`pollingRef`/`snapshotRef`를 제거하고 `useSnapshotPolling` + monitoring profile(`monitoringApi.js`로 옮긴 `buildMonitoringSnapshot`/`detectMonitoringSnapshotChanges`/`nextMonitoringSnapshot`)로 교체. `rg`로 옛 식별자 잔존 없음 확인, 빌드 통과, monitoring contract+visual suite 15 passed(3 skipped, 프로젝트별 조건부)로 실제 상호작용(모드 전환·모바일 탭) 검증.
- Task 5(축소): `Architecture.md`에 `useSnapshotPolling`/`pollingData.js`/monitoringApi profile export 반영. `npx madge --circular frontend/src` 순환 의존성 없음. `backend/` 변경 없음(`git diff --name-only -- backend/` 빈 결과) 확인. 단위 테스트 7개 재실행 통과.

## Unverified / Skipped

- 계획 원문 Task 5 Step 1-3(fixture에 `initialFailure`/`incrementalFailure` 시나리오 추가, `monitoring initial failure`·`monitoring periodic failure retries all failed keys` Playwright 테스트 작성)은 사용자가 이번 pass의 검증 범위를 줄여달라고 명시적으로 요청해 생략했다. FR-006/FR-006a/SC-004/SC-010이 다루는 "주기적 실패 시 기존 데이터 유지, 실패 key만 재시도" 동작은 `pollingData.test.js`의 단위 테스트(undefined→보존, null→정상 빈 값 교체)로만 검증되었고, 브라우저 종단 시나리오로는 아직 확인되지 않았다.
- `npx knip`은 이 리포에 `knip.json`이 없어 554개 "미사용 파일" 기존 노이즈를 보고해 이번 변경에 대해 유의미한 신호를 주지 못했다(신규 export들은 실제 import 관계를 직접 코드로 확인함).

## Failed Attempts

- 기존 repository graph는 monitoring 수명주기 관계를 충분히 표현하지 않아, 관련 source와 contract를 직접 추적했다.
- 첫 구현 계획은 monitoring의 기존 `nextSnapshotState(snapshot, changedData, saved)`의 server snapshot fallback을 공통 hook contract에 넣지 않았다. client data로만 snapshot을 재구성하면 SIGWX fronts/clouds metadata처럼 server와 client가 별도로 key를 만든 자료가 매 주기 변경으로 재감지될 수 있다.
- `--grep monitoring`만으로 visual test 실행을 보장하려 했으나, Playwright grep은 파일명이 아니라 test title을 거른다. visual test의 title 또는 파일 경로 실행을 계획에 명시해야 한다.
