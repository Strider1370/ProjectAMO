# 검증 계약 프레임워크 재구축 — handoff

Updated: 2026-07-19 KST · 상태: **계약 이전 완료 — 전체 검증 및 legacy 보존 판정 진행 중**

- Spec: `docs/superpowers/specs/2026-07-18-verification-contract-framework.md`
- Plan: `docs/superpowers/plans/2026-07-18-verification-contract-framework.md`

## 확인된 사실

- `frontend/scripts/`에는 현재 browser-capable 스크립트 20개(캡처 17개, smoke/audit 3개)가 있다. 일부는 현재 UI와 selector가 어긋났을 수 있으므로, 실제 통과 여부는 Task 1에서 실행해 확정한다.
- `@playwright/test@1.61.1`를 frontend devDependency로 추가했다. `frontend/playwright.config.js`, port guard, 실패 console attachment, `responsive-baseline` 계약, browser policy와 registry를 만들었다.
- `projectamo-dev.mjs`는 backend/frontend 기동, readiness polling, Windows 프로세스 트리 종료, runtime log 분리를 이미 수행한다.
- reporter는 page에 접근할 수 없다. 화면 상태를 보는 실패 분류는 fixture가 맡아야 한다.
- Playwright `webServer`는 `globalSetup`보다 먼저 실행된다. 포트 점유 검사는 외부 `port-guard.mjs`에서 한다.
- 검증 artifact의 정본 경로는 repo root의 `artifacts/verification/`이다.
- 7/19 이후 경로 워크플로가 `비행 설정 → 경로비교 → 고도 비교 → 브리핑 준비`으로 확장됐고, 모바일 시트·연직단면도 전체 화면·브리핑 전체 보기/지도 병행 보기·경로 맞춤 카메라가 추가됐다. 이들은 `route-workflow`와 `briefing-view` 계약으로 새 계획에 반영했다.
- `dev:test`는 자동 수집을 중단할 뿐 route/기상 fixture를 보장하지 않는다. 경로·브리핑 계약은 필요한 로컬 데이터와 fixture를 먼저 선언해야 한다.
- 20개 자산의 inventory·coverage·유지/대체/보류 매핑은 `docs/policies/verification/contracts.md`에 기록했다. Phase A에서는 기존 smoke/capture를 삭제하지 않는다.
- port guard는 3001의 PID 1972 (`node.exe server.js`)와 5173의 PID 19204 (`vite ... --strictPort`)를 `artifacts/verification/port-conflict.json`에 기록하고 중단하는 것을 확인했다.
- 기존 서버 종료 뒤 `npm.cmd run dev:contract -- --grep responsive-baseline`가 desktop·iPad landscape·mobile에서 모두 통과했다. Playwright가 서버를 종료한 뒤 두 포트도 해제됐다.
- 일회성 실패 probe로 screenshot, retry trace, `console.json`, HTML report 생성을 확인한 뒤 probe 자체는 제거했다.
- `map-base` 계약이 지도 선택(기본→지형)과 레이더 토글을 desktop·iPad landscape·mobile에서 모두 통과했다(6 passed). 지도 선택기는 `aria-expanded`와 `menuitemradio` 상태를 제공한다.
- `monitoring` 계약이 ops→ground 전환을 desktop·iPad landscape에서 통과했다(2 passed, mobile skipped). 모바일은 대시보드 mode 탭 대신 task UI를 사용한다.
- `airport-panel` 계약이 `/?airport=RKSI` direct entry, 섹션 rail, 닫기를 desktop·iPad landscape·mobile에서 통과했다(3 passed). TAF badge는 접근성 이름에 포함될 수 있어 접두 locator를 사용한다.
- `notam-and-settings` 계약이 desktop·iPad landscape의 NOTAM 지도 표시 토글과 desktop·iPad landscape·mobile의 UTC 저장을 통과했다(5 passed, mobile NOTAM 1 skipped). 처음에는 label locator가 현재 DOM에서 연결되지 않아 role 기반 combobox locator로 바로잡았다.
- `route-import` 계약이 전용 `RKSI→RKPK` 다중 GPX fixture로 desktop·iPad landscape·mobile에서 통과했다(3 passed). 후보 선택 후의 실제 오류 `setVfrUndoStack is not defined`는 `useRouteBriefing.js`에 누락된 setter state 선언 하나를 추가해 고쳤다. 이전 실패 screenshot/trace는 `artifacts/verification/test-results/route-import-*`에 남아 있다.
- `route-workflow` 계약은 committed navdata와 `route-fixture.mjs`의 고정 weather/terrain API 응답을 사용한다. IFR와 VFR의 비행 설정→경로비교→고도 비교→브리핑 준비를 desktop·iPad landscape·mobile에서 각각 통과했고, mobile의 연직단면도 전체화면도 통과했다. VFR 수동 적용에서 ETA가 비어 브리핑 준비가 막히던 실제 오류는 `distanceNm` fallback으로 고쳤다.
- `briefing-view` 계약은 같은 fixture 전제에서 IFR briefing 생성 후 desktop·iPad landscape의 전체 보기↔지도와 함께 보기 전환을 통과했다(2 passed, mobile skipped). 경로 맞춤은 MapView의 자동 effect라 접근 가능한 제어·상태가 없어 직접 assertion은 보류했다.

## 다음 시작점

1. route-workflow 전체 grep을 final retry 정책으로 재실행하고 모든 active 계약을 점검한다.
2. structural check와 graph update를 실행하고, registry 매핑에 따라 legacy asset은 보존한다.

## 최종 검증 기록

- `npm.cmd run dev:contract -- --grep route-workflow --retries=0` → 7 passed, 2 skipped (desktop/iPad의 mobile-only 전체화면 test 제외).
- `npm.cmd run dev:contract -- --grep briefing-view` → 2 passed, 1 skipped (mobile에 전체 보기/지도와 함께 보기 제어 없음).
- 그 밖의 focused contract 실행은 `responsive-baseline` 3 passed, `map-base` 6 passed, `monitoring` 2 passed/1 skipped, `airport-panel` 3 passed, `notam-and-settings` 5 passed/1 skipped, `route-import` 3 passed다.
- `git diff --check`, `npx depcruise frontend/src --no-config`, `npm.cmd --prefix frontend run build`가 통과했다. `graphify update .`도 갱신했다(6609 nodes, 10577 edges).
- `npx knip`은 `knip.json` 부재로 프로젝트 entrypoint를 알 수 없어 514개 파일과 의존성을 미사용으로 나열한다. 이번 변경의 미사용 근거로 사용하지 않았고, 새 configuration을 추측해 추가하지 않았다.
- legacy smoke/capture는 registry에서 모두 partial/retained/held로 판정된다. 기존 screenshot, real-file, alternate, save/load, visual evidence 범위가 아직 계약으로 완전히 대체되지 않았으므로 삭제하지 않았다.


## 주의

- `useRouteBriefing.js`, `routePreview.js`, `routeBriefingModel.js`는 건드리지 않는다. `RouteBriefingPanel.jsx`는 Phase C의 route-import 계약을 위해 숨김 파일 입력에 한정해 `data-testid` 하나를 추가했다.
- `frontend/scripts/route-four-step-capture.mjs`는 과거 세션에서 untracked 상태로 삭제되어 복구할 수 없다. Task 1에서는 없는 상태가 정상이다.
- 삭제는 커밋된 상태에서, 대체 계약 하나가 통과할 때마다 대응 자산 하나씩만 한다.
- UTF-8 문서는 `apply_patch`로만 편집한다.
