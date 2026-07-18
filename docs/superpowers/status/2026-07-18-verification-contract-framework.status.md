# 검증 계약 프레임워크 재구축 — handoff

Updated: 2026-07-19 KST · 상태: **계획 확정, 구현 착수 전**

- Spec: `docs/superpowers/specs/2026-07-18-verification-contract-framework.md`
- Plan: `docs/superpowers/plans/2026-07-18-verification-contract-framework.md`

## 확인된 사실

- `frontend/scripts/`에는 capture 16개와 smoke/audit 4개가 있으며, 일부는 현재 UI와 selector가 어긋났을 수 있다. 실제 통과 여부는 Task 1에서 실행해 확정한다.
- `@playwright/test`는 아직 설치되지 않았다. `playwright@1.61.1`과 `@axe-core/playwright`만 설치되어 있다.
- `projectamo-dev.mjs`는 backend/frontend 기동, readiness polling, Windows 프로세스 트리 종료, runtime log 분리를 이미 수행한다.
- reporter는 page에 접근할 수 없다. 화면 상태를 보는 실패 분류는 fixture가 맡아야 한다.
- Playwright `webServer`는 `globalSetup`보다 먼저 실행된다. 포트 점유 검사는 외부 `port-guard.mjs`에서 한다.
- 검증 artifact의 정본 경로는 repo root의 `artifacts/verification/`이다.

## 다음 시작점

1. 계획 Task 1: 기존 검증 자산을 실제 실행하고 inventory·coverage matrix·대체 매핑표를 만든다.
2. Task 2: 정책과 계약 레지스트리를 만든다.
3. Task 3 시작 시, 먼저 기존 launcher와 Playwright `webServer`의 종료 정리를 비교한다.
4. Phase A는 `responsive-baseline` 한 개만 이전한다. 이전에 2시간을 넘기면 중단하고 방식을 재검토한다.

## 주의

- 사용자가 작업 중인 `useRouteBriefing.js`, `routePreview.js`, `RouteBriefingPanel.jsx`, `routeBriefingModel.js`는 건드리지 않는다.
- `frontend/scripts/route-four-step-capture.mjs`는 과거 세션에서 untracked 상태로 삭제되어 복구할 수 없다. Task 1에서는 없는 상태가 정상이다.
- 삭제는 커밋된 상태에서, 대체 계약 하나가 통과할 때마다 대응 자산 하나씩만 한다.
- UTF-8 문서는 `apply_patch`로만 편집한다.
