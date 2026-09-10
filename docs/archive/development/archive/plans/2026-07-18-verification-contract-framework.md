# 검증 계약 프레임워크 재구축 — 구현계획

## 시작 전

1. [스펙](../specs/2026-07-18-verification-contract-framework.md), [상태](../status/2026-07-18-verification-contract-framework.status.md), `docs/policies/index.md`와 관련 정책을 읽는다.
2. 작업 범위에 맞는 계약을 먼저 찾는다. 새 화면 또는 새 진입 흐름이면 구현 전에 계약도 추가한다.
3. 코드 탐색은 병렬로 할 수 있지만 동일 포트·서버·브라우저를 조작하는 검증은 직렬로 실행한다.

## Task 1 — 기존 검증 자산 감사

### 할 일

- `frontend/scripts/`의 현재 browser-capable 스크립트 20개(캡처 17개, smoke/audit 3개)와 공유 helper를 조사한다. `lint-colors.mjs`는 브라우저 검증 자산이 아니므로 별도 기록한다.
- 각 스크립트의 역할, 실행 명령, 마지막 사용자 흐름, assertion, viewport, fixture, artifact 위치, 실제 실행 결과를 inventory에 기록한다.
- `package.json`, CI, README, Architecture, policy, dev-server 절차에서 inbound reference를 찾는다.
- desktop/iPad/mobile의 실제 진입 경로와 `getByRole`/`getByLabel`로 지목할 수 없는 control을 기록한다.
- `projectamo-dev.mjs`, readiness URL, 고정 데이터 모드, cleanup, 기존 artifact 위치를 확인한다.
- `dev:test`는 자동 수집만 멈추고 route/기상 fixture를 만들지 않는다는 점을 계약별 사전 조건에 기록한다. 경로·브리핑 계약은 필요한 로컬 데이터와 route fixture를 명시하기 전에는 활성화하지 않는다.

### 산출물·완료 조건

- `기존 자산 → 유지/대체/삭제/보류` inventory
- `활성 기능 → 계약` coverage matrix
- `과거 assertion/viewport/fixture → 새 계약 또는 retire 사유` 매핑표
- `data-testid` 추가 대상 목록
- 깨진 스크립트도 삭제하지 않고, 검증하려던 의미를 매핑표에 남긴다.

## Task 2 — 정책과 계약 레지스트리

### 만들 파일

```text
docs/policies/verification/browser-verification.md
docs/policies/verification/contracts.md
```

### 할 일

- `browser-verification.md`에는 사람이 지켜야 할 규칙만 둔다: 계약 선택, locator와 precondition 확인, 화면 전환 뒤 locator 재확인, 두 번째 실패 뒤 원인 분류·중단, browser mutation 직렬 실행, 구현 완료와 E2E 완료 분리 보고.
- 실행 설정이 강제하는 재시도·격리·artifact 수집 규칙은 문서에 중복하지 않는다.
- `contracts.md`에는 계약 id, 영향 기능/소유 파일, viewport, 사전 조건, spec 경로, 갱신 책임, 격리 상태와 사유·날짜를 기록한다.
- 정책 색인에서 두 문서를 올바르게 연결한다.

### 완료 조건

- 활성 계약의 실행 위치와 책임자가 레지스트리에 있다.
- 정책 문서와 Playwright 설정이 같은 규칙을 중복해서 정하지 않는다.

## Task 3 — Playwright 기반과 프로젝트 고유 계층

### 변경 대상

```text
frontend/package.json
package.json
frontend/playwright.config.js
frontend/verification/port-guard.mjs
frontend/verification/lib/app-ready.js
frontend/verification/lib/navigation.js
frontend/verification/lib/failure-probe.js
frontend/verification/lib/classify-reporter.js
frontend/verification/self-test/
```

### 할 일

1. `@playwright/test`를 frontend devDependency로 설치한다. 기존 `playwright`는 `@axe-core/playwright` 의존성이므로 유지한다.
2. `playwright.config.js`를 만든다.
   - contracts test directory, `workers: 1`, `fullyParallel: false`, `retries: 1`, `failOnFlakyTests: true`
   - desktop(1440×900), iPad landscape, mobile project
   - 실패 시 첫 재시도 trace와 screenshot, HTML report, repo-root `artifacts/verification/` output
   - backend health와 Vite를 `webServer`로 기동하며 `reuseExistingServer: false`
3. 먼저 기존 launcher와 `webServer` 경로를 각각 정상 종료·강제 중단으로 실행한다. 양쪽 모두 3001/5173 포트와 고아 프로세스를 정리하는지 확인한 뒤, 자동 검증의 정본을 확정한다.
4. `port-guard.mjs`를 Playwright 앞에서 실행한다. Windows와 POSIX에서 3001/5173 점유자를 보고 `artifacts/verification/port-conflict.json`에 남긴 뒤 non-zero로 끝낸다.
5. `app-ready.js`에는 공통 readiness와 시작 modal만, `navigation.js`에는 viewport별 실제 진입 경로만 둔다.
6. fixture의 `failure-probe.js`가 선언된 anchor를 재조회해 실패 원인을 관찰하고 annotation으로 남긴다. reporter는 annotation 또는 보수적 오류 형식만 집계해 manifest/history를 기록한다.
7. `dev:contract`와 `dev:contract:self-test` 명령을 만든다. 별도의 `verify` 명령은 만들지 않는다.

### 프레임워크 자체 검증

- 일반 계약 밖의 Node 스크립트가 `SERVER` 분류, 포트 충돌 차단, 정상 종료 뒤 포트 해제, Ctrl+C 정리를 확인한다.
- 4개 분류와 flaky에 대한 의도적 실패 fixture를 만들고 trace/screenshot/console·종료 상태를 확인한다.

### 완료 조건

- `npm run dev:contract -- --grep <id>`가 서버 기동부터 cleanup까지 담당한다.
- 계약 간 localStorage, page, server process 상태가 누출되지 않는다.
- 자체 검증이 통과하기 전에는 Phase B로 가지 않는다.

## Task 4 — 기능 계약 이전

다음 순서로 현재 UI를 관찰한 뒤 작은 focused flow로 이전한다.

1. `responsive-baseline`
2. `map-base`
3. `route-workflow` — IFR/VFR 비행 설정, 경로비교, 고도 비교, 브리핑 준비, 모바일 시트, 연직단면도 전체 화면을 하나의 사용자 흐름으로 검증한다.
4. `briefing-view` — 생성된 브리핑, 전체 보기/지도와 함께 보기, 경로 맞춤 카메라를 검증한다.
5. `airport-panel`
6. `route-import`
7. `monitoring`
8. `notam-and-settings`

각 계약에서 다음을 수행한다.

- 과거 selector를 복사하지 않고 현재 UI에서 locator를 확인한다.
- 재사용할 진입 경로는 `navigation.js`에 넣는다.
- `shell-anchor`, 필요한 `data-anchor`, 필요한 모든 `target-anchor`를 선언한다.
- 실제 사용자 성공 흐름 하나 이상을 assertion으로 증명한다.
- 경로·브리핑 계약은 fixture가 보장하는 데이터와 그렇지 않은 외부·캐시 데이터를 분리해 선언한다. 보장되지 않은 데이터를 원인으로 한 실패는 selector 문제로 추측하지 않는다.
- 적용 viewport를 실행한다. 화면/레이아웃 변경이면 기존 screenshot·manifest·review 절차도 따른다.
- inventory에서 대체 범위를 갱신한다.

### Phase 기준

- Phase A: Task 1~3과 `responsive-baseline` 하나만 완료한다. 이 계약 이전에 2시간을 넘기면 중단하고 Playwright 채택 결정을 재검토한다.
- Phase B: `map-base`, `route-workflow`를 추가한다. 성격이 다른 세 계약이 안정적으로 통과해야 한다.
- Phase C: 나머지 활성 surface를 매핑표 순서로 이전한다.

## Task 5 — 과거 자산 제거

계약 하나가 대체 범위를 통과할 때마다 다음을 수행한다.

1. 활성 운영 inbound reference를 다시 찾는다.
2. 새 계약 명령으로 참조를 갱신한다.
3. 대응하는 과거 script 또는 helper 하나만 삭제한다.
4. `git diff --check`, focused contract, 관련 frontend test/build를 실행한다.

`serve`, `serve:test`, `serve:no-nwp`는 유지한다. `dev:verify`는 새 계약 명령으로 대체한 뒤 제거한다. `smoke`는 `responsive-baseline`이 통과한 뒤 제거한다. `screenshots`는 Task 1에서 baseline 계약에 흡수되는지 확인한 뒤 결정한다.

## Task 6 — 운영 정착과 최종 검증

- 모든 활성 UI feature가 계약 레지스트리에 있는지 확인한다.
- 대표 계약을 desktop, iPad, mobile에서 각각 실행한다.
- artifact, retry 횟수, 분류 결과가 한 위치에 남는지 확인한다.
- 정책 index, 공통 정책, registry, 실행 명령의 링크와 내용이 일치하는지 확인한다.
- 전체 frontend test/build, `npx depcruise frontend/src --no-config`, `npx knip`, `git diff --check`, `graphify update .`를 실행한다.

## 실행 중단 규칙

- 같은 흐름이 두 번째 실패하면 timeout 증가, 같은 클릭 반복, 중복 서버 기동 대신 artifact와 분류를 보고 원인을 해결한다.
- `UNKNOWN` 3회 연속은 자동 격리하지 않고 후보로 보고한다. 사람이 판단한 격리 상태만 registry에 기록한다.
- 대체 계약이 통과하지 않았거나 활성 참조를 갱신하지 않았다면 과거 자산을 삭제하지 않는다.
