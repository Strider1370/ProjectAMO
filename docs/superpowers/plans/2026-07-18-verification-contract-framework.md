# 검증 계약 프레임워크 재구축 계획

## 목표

ProjectAMO의 흩어진 과거 Playwright capture/smoke 스크립트를 공식 검증 근거에서 제거하고, 기능별 **검증 계약**을 실행하는 새 프레임워크로 교체한다. 작업자는 정책 색인에서 해당 계약을 찾아 필요한 검증만 실행하며, 에이전트가 매번 화면 진입점·selector·서버 상태를 다시 추측하지 않게 한다.

완료 후에는 다음 결과가 있어야 한다.

- UI 작업마다 `docs/policies/index.md`가 공통 검증 정책과 해당 계약 문서를 가리킨다.
- 각 활성 기능은 desktop/iPad/mobile 적용 범위, 실제 사용자 진입 순서, 성공 조건, 실행 명령을 가진다.
- 검증 서버는 관리형 실행기 한 곳에서 기동·준비 확인·정리된다.
- 기능별 검증은 독립 browser context에서 한 번의 재현 가능한 흐름으로 실행된다.
- 실패는 screenshot/console/trace 증거와 함께 `selector 계약`, `앱`, `서버`, `데이터` 중 하나로 분류된다.
- 과거 기능별 capture/smoke/helper는 대체 계약이 통과한 뒤 삭제된다. 별도 archive는 만들지 않으며 Git 이력으로만 보존한다.
- 기존 Architecture·design·dev-server 정책은 계약 기반 절차와 모순되지 않게 같은 변경에서 갱신된다. 화면/레이아웃 변경의 screenshot·manifest·review 의무는 유지한다.

## 범위와 원칙

- 유지 후보는 서버 수명 관리를 담당하는 `scripts/projectamo-dev.mjs`와 현재 통과 중인 최소 공통 반응형 smoke뿐이다. 이 판단도 Task 1에서 실행 증거와 inbound reference로 확정한다.
- 과거 기능별 `*-capture.mjs`, `*-smoke.mjs`, 화면별 helper는 새 계약의 대체 성공 전에는 삭제하지 않는다. 대체 성공과 참조 제거를 같은 변경에서 확인한 뒤 삭제한다.
- 삭제 기준은 활성 운영 참조(package script, CI, README, Architecture, policy, dev-server procedure)로 한정한다. `archive/`, 과거 plan/spec, research는 역사 기록으로 보존한다.
- 새 프레임워크는 테스트 프레임워크를 추가하지 않는다. 이미 설치된 Playwright와 관리형 Node launcher를 재사용한다.
- 파일 탐색과 계약 조사는 병렬화할 수 있지만, 동일 포트·서버·브라우저 상태를 조작하는 실제 검증은 직렬로 실행한다.
- 공통 화면을 억지로 같은 selector로 만들지 않는다. desktop/iPad/mobile이 다른 실제 조작을 쓰면 계약도 별도 단계로 기록한다.

## Task 1 — 현재 검증 자산 병렬 감사

### 목적

무엇을 유지·대체·삭제할지 추측 없이 확정한다.

### 병렬 조사

주 담당은 아래 세 조사를 병렬로 배정하고, 결과를 합쳐 단일 inventory로 확정한다. 조사 담당은 읽기만 하며 삭제·수정하지 않는다.

1. **스크립트·참조 감사**
   - `frontend/scripts/**/*.mjs`, `scripts/projectamo-dev.mjs`, `package.json`, 문서/계획의 inbound reference를 조사한다.
   - 각 스크립트의 역할, 호출 명령, 사용 selector, 마지막 사용자 흐름, 산출물 위치를 목록화한다.
   - 현재 UI에 없는 selector, hard-coded sleep, 수동 서버 전제, 중복 server launch를 표시한다.

2. **사용자 흐름·화면 계약 감사**
   - App, Sidebar, MobileTaskBar, MobileSheet, 각 feature panel을 따라 desktop/iPad/mobile 진입점을 조사한다.
   - 지도, 공항, 브리핑 IFR/VFR, import/save/load, monitoring, NOTAM, 설정 등 활성 surface를 계약 후보로 정리한다.
   - 각 surface에 필요한 데이터/로그인/viewport와 사용자가 실제로 누르는 control을 기록한다.

3. **실행 환경·신뢰성 감사**
   - `projectamo-dev.mjs`, dev-server 절차, Playwright 의존성, artifact/log 위치, 기존 smoke/screenshot 실행을 조사한다.
   - readiness URL, 포트 소유, cleanup, 고정 데이터 모드, console/trace/screenshot 수집의 현재 상태와 공백을 기록한다.

### 산출물과 완료 조건

- `기존 자산 → 유지/대체/삭제/보류` 표
- `활성 기능 → 필요한 계약` coverage matrix
- `과거 assertion/viewport/fixture → 새 assertion 또는 명시적 retire 이유` 매핑표
- 삭제 전 반드시 대체해야 할 검증 목록
- 세 조사 결과가 충돌하면 주 담당이 실제 UI와 실행 결과로 하나를 확정한다.

## Task 2 — 정책과 계약 레지스트리 설계

### 새 문서 구조

```text
docs/policies/
  index.md
  verification/
    browser-verification.md
    contracts.md
```

### `browser-verification.md`

변하지 않는 운영 규칙만 둔다.

- 변경 전에 영향받는 계약을 선택하거나 새 계약을 추가한다.
- `projectamo-dev`의 관리형 서버만 자동 검증에 사용한다.
- 매 action 전에는 현재 화면의 user-facing locator와 precondition을 확인한다.
- navigation, modal, sheet, tab, viewport 전환 뒤에는 이전 참조를 재사용하지 않는다.
- 실패 시 증거를 수집하고 clean context에서 한 번만 재시도한다.
- 두 번째 실패는 원인 분류 후 중단한다. timeout 증가·같은 클릭 반복·중복 서버 기동을 금지한다.
- 코드 탐색은 병렬 가능하지만 browser mutation은 직렬이다.
- 구현 완료와 실제 E2E 검증 완료를 분리 보고한다.

### `contracts.md`

살아 있는 계약의 레지스트리다. 계약마다 아래를 갖는다.

| 필드 | 내용 |
|---|---|
| 계약 이름 | 안정된 명령용 id |
| 영향 기능/소유 파일 | 어떤 변경이 이 계약을 요구하는지 |
| viewport | desktop, iPad landscape, mobile 중 실제 적용 범위 |
| 사전 조건 | URL, 테스트 데이터, 로그인/저장소 상태 |
| 실행 모듈 | 관리형 launcher가 호출할 contract module |
| 갱신 책임 | 새 진입점/새 route 추가 때 함께 갱신할 파일 |

### 완료 조건

- `index.md`에서 UI/browser 작업이 두 문서를 반드시 읽도록 연결한다.
- 각 활성 surface가 coverage matrix의 정확히 한 개 이상 계약에 배정된다.
- `contracts.md`는 id·소유 범위·viewport·실행 모듈·갱신 조건만 가진 짧은 registry다. 실제 사용자 단계와 assertion의 정본은 실행 contract module 하나로 둔다.
- 계약은 현재 UI를 관찰해 작성하며, 과거 selector를 복사하지 않는다.

## Task 3 — 새 공통 실행기와 증거 수집 기반

### 구현

기존 `scripts/projectamo-dev.mjs`를 서버 lifecycle 단일 소유자로 유지하고, 새 verification runner를 추가한다.

```text
frontend/scripts/verification/
  runner.mjs
  contracts/
  lib/app-ready.mjs
  lib/navigation.mjs
  lib/evidence.mjs
```

- root package의 단일 정본 명령은 `npm run dev:contract -- <contract-id>`로 정한다. `projectamo-dev.mjs`에 `contract` mode와 argv forwarding을 추가해 runner를 호출한다. 별도의 `verify` 명령은 만들지 않는다.
- `contract` mode는 `serve:test`와 같은 고정 데이터 설정(`DISABLE_COLLECTION=1`)을 명시적으로 켜고, 필요 계약만 별도 fixture를 선언한다.
- `runner.mjs`는 계약 id 하나만 받아 실행한다. 모든 계약을 무조건 실행하지 않는다.
- `app-ready.mjs`는 readiness와 업데이트 modal 같은 공통 시작 상태만 처리한다.
- `navigation.mjs`는 desktop/iPad/mobile의 실제 진입점을 명시적으로 분리한다.
- `evidence.mjs`는 실패 시 URL, viewport, DOM 요약, console, screenshot, trace를 같은 artifact directory에 기록한다.
- 각 계약은 새 browser context와 저장소 상태로 시작한다.
- runner는 첫 실패 뒤 clean context로 1회만 재시도하고, 재시도 결과를 `passed/flaky/failed`로 출력한다. flaky는 로컬에서도 non-zero로 종료해 숨은 회귀로 처리한다.
- launcher는 시작 전 3001/5173의 기존 소유자를 증거와 함께 실패 처리한다. 검증된 명시적 재사용 모드 외에는 기존 server를 재사용하지 않는다.

### 중요한 설계 제한

- 임의 selector 회복이나 AI selector healing을 넣지 않는다. 그것은 실제 UI 회귀를 숨길 수 있다.
- `waitForTimeout`은 화면 안정화가 꼭 필요한 animation에만 최소로 쓴다. readiness와 action 결과는 locator assertion으로 확인한다.
- baseline screenshot은 공통 시각 검토용이고, 기능 완료 근거는 계약 assertion이다.

### 완료 조건

- `npm run dev:contract -- <contract-id>` 형태의 단일 진입점이 서버 기동부터 cleanup까지 담당한다.
- 실패한 한 계약이 다른 계약의 localStorage, browser page, server process를 오염시키지 않는다.
- artifact manifest schema, 의도적 실패 fixture에서의 screenshot/trace/console 생성, 종료 뒤 포트 해제가 자동 검증된다.

## Task 4 — 전체 기능 계약을 세로로 이전

계약은 아래 순서로 만든다. 각 계약은 먼저 현재 화면에서 수동 관찰하고, 작은 focused flow로 구현하며, pass 증거를 남긴 뒤 다음 계약으로 넘어간다.

1. `responsive-baseline` — 기본 지도, desktop/iPad/mobile overflow와 최소 shell
2. `map-base` — 지도 초기화, 공통 레이어/도구 진입
3. `airport-panel` — 공항 panel과 주요 탭
4. `briefing-ifr` — IFR 입력, 적용, 브리핑 진입
5. `route-editor-vfr` — 전체 문자열 초안, 적용, drag 승인/취소/fallback, 저장/load/import/base undo
6. `route-import` — GeoJSON/GPX/KML과 다중 경로 선택
7. `monitoring` — 운영/지상 모드와 핵심 surface
8. `notam-and-settings` — NOTAM, 설정, 도움말 등 별도 surface

각 계약의 완료 조건:

- 최소 한 개의 실제 사용자 성공 흐름을 assertion으로 증명한다.
- 적용 viewport를 실행한다. 화면/레이아웃 변경이면 기존 Architecture·design 정책에 따라 영향 panel/tab의 screenshot·manifest·review를 남긴다. 전역 layout 변경일 때만 전체 baseline matrix를 실행한다.
- 계약 문서·실행 명령·artifact 위치가 일치한다.
- 해당 과거 스크립트가 검증하던 의미 있는 범위를 모두 대체했는지 inventory에 표시한다.

## Task 5 — 과거 검증 자료 제거

### 삭제 순서

1. Task 4의 대체 계약이 관리형 서버에서 통과한다.
2. `rg`로 활성 운영 참조(package script, CI, README, Architecture, policy, dev-server procedure)의 inbound reference를 찾는다. archive/과거 plan/spec/research는 역사 기록으로 남긴다.
3. 새 계약 명령으로 모든 활성 reference를 바꾼다.
4. 과거 기능별 `*-capture.mjs`, `*-smoke.mjs`, 화면 helper를 삭제한다.
5. `git diff --check`, focused contract, 전체 frontend test/build를 실행한다.

### 삭제 기준

- 과거 script가 현재 사용자 흐름과 selector가 다르면 수리하지 않고 삭제 후보로 둔다.
- Task 1 매핑표에서 해당 script의 모든 중요한 assertion/viewport/fixture가 새 계약으로 대체됐거나 명시적으로 retire됐을 때만 삭제한다.
- `responsive-smoke`과 공통 lifecycle은 새 runner가 같은 역할을 흡수하기 전까지 명시적으로 exempt한다.
- Architecture의 파일 역할, design policy, dev-server procedure, README의 활성 참조를 새 contract 명령으로 함께 갱신한 뒤 삭제한다.
- archive 복사본은 만들지 않는다. 복구가 필요하면 Git 이력을 사용한다.

## Task 6 — 운영 정착과 검증

### 작업 전 절차

1. `index.md`를 읽어 관련 정책과 계약을 찾는다.
2. 변경 파일과 영향 기능으로 필요한 contract id를 선택한다.
3. 새 사용자 흐름/새 화면 route가 있으면 구현 전에 계약을 갱신한다.
4. focused contract → common responsive baseline → 관련 unit test/build 순으로 실행한다.
5. 실패는 정해진 증거와 분류만 보고한다. 같은 흐름을 반복하지 않는다.

### 최종 완료 조건

- 모든 활성 UI feature가 contracts registry에 있다.
- 매핑표에서 대체 완료된 과거 capture/smoke/helper가 삭제되고, 활성 운영 inbound reference가 0이다.
- 관리형 명령으로 대표 계약 desktop/iPad/mobile이 각 1회 통과한다.
- 실패 artifact가 한 위치에 남고, 재시도 횟수와 실패 분류가 출력된다.
- `index.md` routing, 공통 정책, 계약 레지스트리, runner 명령이 서로 링크되고 모순이 없다.
- 전체 frontend test/build, `npx depcruise frontend/src --no-config`, `npx knip`(baseline 결과 기록), `git diff --check`, `graphify update .`를 실행한다.

## 위험과 판단 기준

- 기존 스크립트를 먼저 삭제하면 현재 보이지 않는 coverage까지 잃는다. 반드시 대체 계약의 pass를 먼저 얻는다.
- 계약을 너무 세분화하면 실행 목록 관리가 더 어려워진다. 사용자에게 보이는 독립 흐름 하나를 계약 단위로 한다.
- 모든 UI 변경에 전체 capture matrix를 요구하면 다시 검증 시간이 길어진다. baseline은 공통 레이아웃 변경 때만, 기능 계약은 영향 기능 때만 실행한다.
- 서버 재사용은 빠르지만 상태 누수가 생길 수 있다. 자동 검증은 관리형 launcher의 clean lifecycle을 기본값으로 한다.

## 단계별 checkpoint

- **Phase A — 기반과 pilot:** Task 1~3 및 `responsive-baseline`, `map-base`, route editor 한 계약만 완성한다. 정책 충돌 해소, managed `dev:contract`, artifact/cleanup 검증이 통과해야 Phase B로 간다.
- **Phase B — 나머지 계약 이전:** inventory 매핑표 순서대로 나머지 활성 surface를 이전한다. 각 계약은 현재 UI 관찰, focused pass, 영향 화면 capture/manifest/review를 마친다.
- **Phase C — 삭제:** 매핑표가 완료된 과거 script만 활성 참조 갱신과 같은 변경에서 삭제한다. 미이전 script는 보류하며 일괄 삭제하지 않는다.
