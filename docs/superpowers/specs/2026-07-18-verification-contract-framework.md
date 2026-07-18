# 검증 계약 프레임워크 재구축 — 스펙

## 문제

`frontend/scripts/`의 capture·smoke 스크립트는 기능별로 흩어져 있고 일부는 현재 UI와 어긋나 있다. 새 세션의 작업자는 화면 진입 경로, 요소 지목 방법, 서버 상태를 매번 다시 추측한다. 실패해도 selector·앱·서버·데이터 중 무엇이 원인인지 바로 알 수 없다.

## 완료 상태

- 정책 색인이 공통 브라우저 검증 규칙과 기능별 계약 레지스트리를 가리킨다.
- 모든 활성 UI 기능은 적용 viewport, 실제 사용자 진입 흐름, 성공 조건, 실행 명령을 가진다.
- `npm run dev:contract -- --grep <id>`가 자동 검증 서버의 기동·준비·정리까지 관리한다.
- 각 계약은 독립 browser context에서 재현 가능한 사용자 흐름 하나 이상을 검증한다.
- 실패 시 trace, screenshot, console 및 원인 분류(`SELECTOR`, `APP`, `SERVER`, `DATA`, `UNKNOWN`)가 한 artifact 위치에 남는다.
- 대체 계약이 통과한 과거 검증 스크립트만 제거되며, 활성 운영 참조도 함께 갱신된다.
- 기존 Architecture, design, dev-server 정책의 screenshot·manifest·review 의무는 유지된다.

## 범위

- `@playwright/test` 기반의 브라우저 검증 실행기와 설정을 도입한다.
- 계약 레지스트리, viewport별 navigation, 공통 앱 준비 처리, 실패 분류를 만든다.
- 기존 capture/smoke 자산을 조사하고 활성 기능 계약으로 단계적으로 이전한다.
- 이전이 완료된 과거 검증 자산과 활성 참조를 제거한다.

## 비범위

- 새 테스트 프레임워크, 자체 trace/evidence 실행기, AI selector healing을 만들지 않는다.
- `lint-colors.mjs`는 이 작업의 대상이 아니다.
- 사람이 사용하는 `projectamo-dev.mjs`의 `serve`, `serve:test`, `serve:no-nwp` 동작은 유지한다.

## 필수 제약

- 표준 기능이 있으면 사용한다. `@playwright/test`가 context 격리, 재시도, trace, screenshot, HTML report, 서버 lifecycle을 맡는다.
- 자동 검증은 Playwright `webServer`가 소유한다. 사람이 사용하는 개발 서버의 소유권과 섞지 않는다.
- 포트 점유 검사는 Playwright 실행 전에 한다. 점유 프로세스를 자동으로 종료하지 않고 PID·프로세스명과 충돌 기록을 남긴 뒤 중단한다.
- locator는 `getByRole` → `getByLabel` → `getByText` → `getByTestId` 순서로 선택한다. CSS 경로, XPath, `nth-child` 및 자동 selector 회복은 금지한다.
- 각 계약은 실패 분류용 `shell-anchor`, 필요 시 `data-anchor`, 필요한 모든 `target-anchor`를 선언한다. 선언되지 않은 데이터·selector 원인은 추측하지 않고 `UNKNOWN`으로 둔다.
- 실패 분류는 페이지를 볼 수 있는 fixture에서 관찰하고, reporter는 집계·출력만 한다. 확신 없는 결과는 반드시 `UNKNOWN`이다.
- 재시도 뒤 통과한 flaky도 실패로 처리한다.
- `waitForTimeout`은 animation 안정화 목적일 때만 최소로 쓰고 이유를 주석으로 남긴다.
- 과거 스크립트의 삭제 기준은 대체 계약 통과 하나다. 깨져 있거나 오래됐다는 사실만으로 삭제하지 않는다.
- `UNKNOWN`이 같은 계약에서 3회 연속 발생하면 격리 후보로 표시한다. 사람만 격리 여부를 결정하며, 2주 넘게 격리된 계약은 수리하거나 retire 사유를 기록하고 제거한다.

## 인수 조건

- `contracts.md`의 모든 활성 계약이 spec 태그와 실행 모듈에 연결된다.
- 대표 계약이 desktop, iPad, mobile에서 관리형 명령으로 통과한다.
- 실패 분류와 포트 충돌 차단, 종료 후 포트 해제, Ctrl+C 정리가 프레임워크 자체 검증으로 확인된다.
- 과거 자산의 의미 있는 assertion·viewport·fixture가 새 계약 또는 명시적 retire 사유에 매핑된다.
- 정책, 계약 레지스트리, 실행 명령, artifact 경로가 서로 모순되지 않는다.
