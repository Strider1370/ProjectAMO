# Route-briefing Deepening Status

세션 간 핸드오프용. 출처: 2026-07-15 아키텍처 리뷰(improve-codebase-architecture). 한 페이지 유지.

## 목표
리뷰가 도출한 deepening 후보 #5~#12 중 안전·고레버리지부터 순차 진화. 각 후보는 grilling→구현→검증→커밋 루프.

## 하드 제약
- **route-briefing 대형 파일 테스트 0** → 손대기 전 특성화 테스트 먼저(#5·#7·#8·#9).
- **#10·#12는 ADR-0001상 단독 금지** → 다음 카메라/인터랙션 기능에 strangler-fig로 얹음. 이 세션에선 보류.

## 진행 상태

| # | 후보 | 파일 | 상태 |
|---|---|---|---|
| — | 백엔드 #1~3 | confidence/enroute/etag | ✅ 커밋 `384a85c` (branch refactor/briefing-backend-deepening) |
| — | 백엔드 #4 hazard-matcher | — | ⛔ 기각(호출자 2곳=진짜 seam. 리뷰 'sole caller' 오류) |
| 6 | auto-recommend 추출 | useRouteBriefing.js → lib/recommendProcedures.js(+test 4) | ✅ 구현·검증(87/87·빌드). 커밋 대기 |
| 7 | BriefingView → viewModel | BriefingView.jsx → lib/briefingViewModel.js(+test 7) | ✅ 구현·검증(94/94·빌드). 커밋 대기. tz 의존(kstParts·fmtPeriod·catBar)은 잔류=후속 |
| 8 | VerticalProfileChart 지오메트리 | VerticalProfileChart.jsx(621) → buildProfileGeometry() | ⬜ |
| 11 | useNotamOverlay | MapView.jsx:270-311 → useNotamOverlay 훅 (Playwright 필요) | ⬜ |
| 5 | useRouteBriefing 훅 분해(XL) | useRouteBriefing.js(1078) → 집중 훅들 | ⬜ 특성화 테스트 선행 |
| 9 | RouteBriefingPanel 분리(L) | RouteBriefingPanel.jsx(1047) | ⬜ |
| 10 | useMapCamera | MapView 카메라 | ⛔ ADR 보류 |
| 12 | 인터랙션 seam | MapView 이벤트 | ⛔ ADR 보류 |

## 리포트
후보 전체 상세: 임시 HTML `architecture-review.html`(+ `-ko`). 레포 밖 temp. 필요 시 docs로 정식 보관.

## 다음 액션
#6 grilling — useRouteBriefing.js:261-433 auto-recommend 클로저를 순수 함수로 추출. 먼저 그 클로저 정독.
