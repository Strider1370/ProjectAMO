# 모바일 UI/UX 정비 Status

Updated: 2026-07-01 (KST)
Spec: docs/superpowers/specs/2026-07-01-mobile-design-audit-design.md
Plan: docs/superpowers/archive/plans/2026-07-01-mobile-design-audit.md
Branch: feat/mobile-design-audit

## 상태: 완료 (2026-07-01)
- 전 Phase 완료 + frontend-design-audit 최종 검수·후속 반영까지.
- 커밋: Phase1 5c21e58 · Phase2 10a8a61 · Phase3 f215f9e · Phase5 9babf6a · contrast c25ad22 · Architecture 431960d · audit후속 a808d79
- **후속으로 남긴 것:** S6 브리핑 항로 상태배지(데이터 배선 필요 — spawn_task 칩 task_350077c3). F6 그래버 detent 순환은 표준 패턴이라 유지.
- 승인: 버킷1 전체 + 버킷2 전체 승인받아 구현함
- 구현 결과: 지도(MAP-04~07,S1,S2) · 공항(버킷1,S3,S5) · 브리핑(버킷1,S7,S8)
- **보류(후속):** S6 브리핑 상태배지(항로 flight-category 데이터가 route-briefing에 미배선 — 별도 데이터 배선 필요) · S4 이미 컨테이너쿼리 구현됨(skip) · MAP-08 재측정(map base mobile axe=0로 사실상 해소)
- **잔존:** 브리핑 3상태 color-contrast serious 4노드(disabled CTA/비활성 세그 추정, 폴리시급)

## Verified (Phase 5)
- 빌드: `npm run build` PASS(청크경고만)
- axe before→after: 공항 taf 1→0(critical 해소), amos 1→0(serious 해소)
- 시각: S1 지도칩 잘림 해소·S3 TAF 요약선두·S7 브리핑 점진노출 확인, 회귀 없음

## Verified
- Task 1: `--touch-min:44px` 토큰 추가 → `node --test tokens.test.js` PASS (parity)
- Task 3: `@axe-core/playwright ^4.12.1` 설치, import 스모크 OK
- Phase 1 커밋: 5c21e58
- Task 5: `frontend/scripts/mobile-audit-capture.mjs` — 17/17 캡처(지도5·공항6·브리핑4 + 지도/공항 데스크톱 패리티2), axe 정상. 산출물 `artifacts/responsive-screenshots/mobile-audit-2026-07-01/`(gitignore, 로컬).

## Unverified / Skipped
- 브리핑 데스크톱 패리티: 데스크톱엔 하단 탭바 없음 → 이 baseline에서 제외(map·airport 패리티로 커버). 필요 시 수동 캡처.
- 타임라인 활성 별도 상태: 지도 base에 타임라인 레일 상시 노출로 대체.
- 브리핑 수직프로파일 별도 상태: result에서 항로 생성까지 캡처('다음' 이후 미진입).

## Deviations from Plan
- Task 1: 의도적 RED 단계 생략(양쪽 동시 편집 후 parity 테스트 PASS로 검증) — 속도 우선
- axe: `browser.newPage` → `browser.newContext().newPage()`로 수정(axe-core 요구).
