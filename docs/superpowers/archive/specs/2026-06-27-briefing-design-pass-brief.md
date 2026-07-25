# 비행 전 브리핑 — 디자인 패스 브리프 (새 세션용)

> 목적: 기능은 완성된 사전 브리핑 패널의 **시각 디자인 패스**. 기능 변경이 아니라 가독성·위계·색·밀도·모바일 정리.
> 선행: `feat/preflight-weather-briefing` 브랜치(Phase 1~3 구현 완료, push됨). 이 브리프 한 장만 읽고 시작할 수 있게 작성.

## 0. 시작 전 필수로 읽기
- `docs/ui-responsive-guidelines.md` — **이 앱의 디자인 가이드(최우선 규범).** 운영 도구, status-first, "fit보다 운영 명료성", 구조적 모바일 변경은 **Proposal-First(승인 전 구현 금지)**, 공유 토큰 우선/shrink-to-fit 금지, capture→review→fix 워크플로.
- `frontend/src/app/layout/layoutTokens.css` — 공유 레이아웃 토큰(폭·브레이크포인트·간격·최소 컨트롤 크기). **새 px 추가 전 여기부터 확인.**
- `docs/superpowers/specs/2026-06-26-preflight-weather-briefing-design.md` — 기능 스펙(철학: decision-support, 거짓확정성 금지, progressive disclosure).

## 1. 대상 파일
- `frontend/src/features/route-briefing/BriefingView.jsx` + `BriefingView.css` — **메인 대상**(우측 패널: 헤더 → sticky 순서목차 `.bv-nav` → 요약보드 `.bv-board` 칩 → ① 위험요약 → ③ 현재실황(공항별 6열 표) → ④ 노선·공역(위험 리본 `.bv-ribbon` + 인라인 단면도) → ⑤ 목적지예보).
- `frontend/src/features/route-briefing/VerticalProfileChart.jsx` — 인라인 단면도(자체 색상: `icingColor`, `ktgColor`, isotherm 등). 색 어휘 통일 시 함께 검토.
- `frontend/src/features/map/MapView.jsx` — 패널/지도 레이아웃·스크롤연동(`focusBriefingSection`). **레이아웃 만지면 깨지지 않게 주의.**

## 2. 현재 상태(스크린샷으로 확인)
기능은 동작하나 시각이 거칢: ad-hoc 색/간격, 플랫한 위계, 테두리 노이즈, 표 정렬·고정폭숫자 미적용. 데스크톱 우측 패널 `clamp(480px,52%,1040px)` + 모바일(<=719px) 전체폭 폴백(임시).

## 3. 디자인 방향 (리서치 근거, 2026-06-27)
**(a) 위계·레이아웃**
- 8pt 스페이싱 토큰(4/8/12/16/24/32)으로 셀 패딩·섹션 간격·칩 간격 통일.
- 타이포 스케일 고정: 라벨 11~12 / 본문 13 / 섹션헤더 16~18 / 패널헤더 20~24px. **값=semibold, 라벨=regular**(색이 아니라 크기+굵기로 위계). 11px 미만 금지.
- 섹션 구분은 **두꺼운 테두리 대신 여백 + 1px 초저대비 디바이더(또는 얕은 틴트 카드)**. 카드 중첩 금지. 상단 요약보드만 시각 우위.

**(b) 색/심각도**
- 항공 표준 색 어휘 고정: **VFR=녹 / MVFR=파 / IFR=적 / LIFR=자홍**. 상태 칩 RAG(정상/주의/위험)는 한 의미=한 색.
- **정상 셀 무채색, 임계 초과 셀만 저채도 틴트(8~15%)로 강조.** 솔리드 색은 위험 경보에만(색을 "예외 강조"로 절약).
- **접근성(중요): 색만으로 의미 금지** — 색 + 아이콘 + 텍스트 라벨 병기(적록색약 8%). 최종 팔레트를 색약 시뮬레이터로 검증.

**(c) 표(6열, 좁은 패널)**
- 행 높이 condensed 36~40px, 라벨 좌측·수치 우측 정렬, **tabular-nums**, 단위 줄바꿈 방지(nbsp).
- 격자선 대신 **수평선만**. 제브라 쓰면 초저대비. 개별 셀 강조(행 전체 X).

**(d) 항공 레퍼런스 차용**
- ForeFlight식 "구획화된 섹션 + 논리적 순서"(우리 ①③④⑤ 동일), at-a-glance→detail, progressive disclosure(섹션 접기 옵션 검토).

**(e) sticky 순서목차**
- active 상태를 색만으로 X → **굵기 + 2~3px 강조선 + 약한 틴트 + 이동 마커**, `aria-current`. 스티키 헤더 높이만큼 scroll offset 보정(이미 `scroll-margin-top` 있음).

**(f) 모바일 — Proposal-First (구현 전 캡처+제안+승인)**
- 가이드의 Canonical Mobile Philosophy 준수: one task per screen, status before controls, 지도는 backdrop 아닌 task, 데스크톱 구조 축소 금지.
- 브리핑은 풀스크린 폴백 대신 **peek/half/full 3단 바텀 시트**(지도와 공존) 또는 task 전환 검토. peek=요약칩, half=①위험+보드, full=전체. 명시적 닫기(X) 버튼 + OS 뒤로가기.
- ⑥ 표는 공항별 탭/아코디언(이미 mobile airport-tabs 패턴 있음), ④ 리본+단면도는 가로 스크롤 전폭 블록.
- **단, 이 구조 변경들은 Proposal-First** — 캡처·분석·제안서 작성 후 사용자 승인받고 구현.

## 4. 절대 깨지면 안 되는 것 (기능 회귀 금지)
- `/api/route-briefing` payload 계약(sections.adverse/enroute/current/destination, encounter, model.intervals 등).
- 스크롤 연동(IntersectionObserver scroll-spy + `onFocus`→지도 패닝), 리본↔단면도 x축 정렬(트랙 margin 6.04%/2.71% = 차트 plot 여백), 브리핑 완성 시 경로 센터링, "단면도 크게 열기".
- 검증: `npm --prefix backend test`, `npm --prefix frontend run build`, `node frontend/scripts/briefing-smoke.mjs`(Playwright, 1680뷰포트, ④/리본/단면도/지도 확인 + 스크린샷 `artifacts/briefing-phase2b/`).

## 5. 워크플로 (가이드 §Review Workflow 준수)
1. dev 서버: `npm run dev:serve` (프런트 5173 / 백엔드 3001). 스모크로 상태 캡처.
2. **캡처 → 이슈 기록(편집 전)** → 기계적 깨짐 vs 운영 명료성 문제 분리.
3. 데스크톱부터 디자인 적용(색 어휘·토큰·타이포·표·디바이더·nav active). 토큰은 layoutTokens.css 우선.
4. 모바일은 **캡처+제안서 먼저**(Proposal-First), 승인 후 구현.
5. `design:design-critique` / 디자인 리뷰 서브에이전트로 검토 → 집중 수정 → 재캡처.

## 6. Top 8 우선 변경(데스크톱부터)
1. 8pt 스페이싱 토큰 통일 · 2. 타이포 스케일+굵기 위계 · 3. 표 tabular-nums+우측정렬+condensed · 4. 항공 색 어휘 고정 · 5. 정상 무채색·초과만 틴트 · 6. 색+아이콘+텍스트 병기(색약) · 7. 테두리→여백/디바이더 · 8. nav active 강화.
