# 비행 전 브리핑 — 모바일 구조 제안서 (Proposal-First, 승인 전 구현 금지)

> 범위: 데스크톱 브리핑 리스타일(커밋 `edad73e`) 이후 남은 **모바일 구조** 작업.
> 규칙: `docs/ui-responsive-guidelines.md` §Proposal-First — 캡처·분석·제안만, **사용자 승인 후 구현**.
> 대상: `frontend/src/features/route-briefing/BriefingView.jsx` (+CSS), 마운트 `frontend/src/features/map/MapView.jsx:1285`.

## 1. 현재 상태 (Before) — 캡처 근거
- 캡처: `artifacts/design-refs/app-self/mobile-briefing-before-top.png`, `…-full.png` (390×844).
- 현재 모바일 = 데스크톱 패널을 `.briefing-view{width:100%}`로 **그대로 reflow**(임시 폴백). 모바일 재구조화 없음.

**기계적 깨짐 [M]**
- **헤더 가림**: 지도 셸의 레이어칩(항공/기상)·`활성 공항경보 없음` 상태바가 브리핑 헤더 위에 겹쳐 `RKSS → RKPC`·`교체 RKPK`가 가려짐. (브리핑이 화면을 점유하지 못함)
- **표 값 충돌**: 6열 메트릭이 390px에서 과밀 → `34002KT 9999`, `09007KT10000`처럼 바람+시정 값이 붙어 읽기 불가.
- 콘텐츠가 하단 태스크바 밑으로 흘러 잘림.

**운영 명료성 [C]**
- one-task/status-first 위반: 시트·탭 없이 전 섹션을 한 번에 쏟아냄. 공항별 비교가 가로 과밀.
- ④ 리본+단면도가 좁은 폭에 눌려 가독성 저하.
- 명시적 닫기/디텐트 없음(데스크톱은 `지도로`, 모바일은 시트 peek가 표준인데 미적용).

## 2. 제안 구조 (After) — 기존 컴포넌트 재사용, 신규 발명 없음
형제 폼(`RouteBriefingPanel`)이 이미 쓰는 패턴을 브리핑 뷰에 그대로 적용한다.

- **컨테이너**: `shared/ui/MobileSheet.jsx` (peek 66 / half / full 0.9h, grabber, footer, headerExtra, peekContent, detent/onDetentChange). 폼과 **동일**.
  - `eyebrow="비행 전 브리핑"`, `title="RKSS → RKPC"`, `headerExtra=<IFR 칩>`, `onClose`→peek(닫기 아님, 태스크는 유지; 태스크바로 이탈).
  - `peekContent` = `rb-peek-route` 스타일의 한 줄 요약: `RKSS → RKPC · IFR · 최악 카테고리(예: IFR) · 285NM`.
- **섹션 nav** = `route-type-segmented` pill 트랙(① 위험 / ③ 현재 / ④ 노선 / ⑤ 목적지). 기존 폼 토글과 동일 컴포넌트/스타일.
- **③ 현재 = 공항 탭**: `route-type-segmented`로 출발/도착/교체 탭(각 카테고리 점). 선택 공항만 **세로 스택 리드아웃**(라벨↔값) — 6열 표를 축소하지 않고 모바일용으로 재구성(가이드 §6).
- **④ 노선 = 전폭 블록**: 리본+단면도는 패널-로컬 **가로 스크롤** 전폭 블록(가이드 §Scroll, 2D 콘텐츠 폴백). 리본↔단면도 x정렬·margin(6.04%/2.71%) 불변.
- **① 위험 / ⑤ 목적지**: 카드 한 장씩, status-first(요약 먼저).
- 디자인 토큰: 데스크톱과 동일 slate+blue. 색/카드/칩 = 이미 만든 BriefingView 스타일 재사용.

목업(방향): 어제 렌더한 모바일 시안 + 스타일 레퍼런스 `artifacts/design-refs/app-self/mobile-briefing-peek.png`.

## 3. 재사용 컴포넌트 / 마운트
| 용도 | 기존 자산 |
|---|---|
| 바텀시트(디텐트) | `shared/ui/MobileSheet.jsx` |
| 섹션 nav / 공항 탭 | `.route-type-segmented`/`.route-type-seg` (RouteBriefing.css) |
| 모바일 분기 | `shared/ui/useIsMobile.js` |
| 액션/푸터 패턴 | `.mobile-sheet-footer .route-check-actions` |
| 마운트 지점 | `MapView.jsx:1285` — 모바일이면 `<MobileSheet>`로 감싸 `BriefingView` 렌더 |

데스크톱 경로(`.briefing-view` 절대 패널)는 **불변**. 모바일 분기만 추가.

## 4. 절대 깨지면 안 되는 것 (회귀 금지)
- `/api/route-briefing` payload 계약.
- 스크롤연동: IntersectionObserver `root`를 **시트 스크롤 컨테이너**로(현재 `containerRef` 기반이라 시트 내부에서도 동작해야 함 — 구현 시 root 확인) + `onFocus`→지도 패닝.
- 리본↔단면도 x정렬(margin 6.04%/2.71%), "단면도 크게 열기", 브리핑 완성 시 경로 센터링.
- 검증: `node frontend/scripts/briefing-smoke.mjs`(1680), `npm --prefix frontend run build`, 그리고 **모바일 스모크 추가**(390 뷰포트, 시트 디텐트·공항탭·리본 확인).

## 5. 기대 효과
- 헤더 가림·값 충돌 해소(기계적 깨짐 제거).
- one-task/status-first: peek 요약 → half(①+③) → full(전체)로 점진적 노출.
- 폼↔브리핑이 같은 시트 언어 → 앱 일관성, 학습비용 0.
- 지도와 공존(시트가 backdrop 점유 안 함) — 가이드 §4 "지도는 task".

## 6. 승인된 결정 (2026-06-27)
1. **디텐트 기본값** = `half` (①+③ 보임, 지도 공존). ✅
2. **③ 현재** = 공항 **탭**(출발/도착/교체 pill 트랙) + 세로 스택 리드아웃. ✅
3. **④ 단면도** = 인라인 가로 스크롤 유지 + **"크게 열기" → landscape 풀스크린 뷰어**. ✅
   - 버튼 탭 시 전체화면 오버레이에 단면도를 **90° 가로**로 회전/배치해 폰 화면을 꽉 채움(가로로 긴 단면도를 폰 세로 화면에서 최대 크기로). 닫기 버튼 + OS 뒤로가기.
   - 구현: 풀스크린 오버레이에 차트를 `transform: rotate(90deg)`(landscape 비율 강제)로 viewport 채움. 기존 `VerticalProfileWindow`(데스크톱 모달)와 분리된 모바일 전용 표시.
4. **peek 요약** = 노선+규칙+거리 + **최악 공항 카테고리 배지** 포함(status-first). ✅

## 7. 구현 계획 (승인 후에만)
1. `MapView.jsx` 모바일 분기: `BriefingView`를 `MobileSheet`로 래핑(detent state, peek 요약, headerExtra=IFR칩).
2. `BriefingView`에 `compact`/`mobile` 모드: nav→pill 트랙, ③→공항 탭+스택 리드아웃, ④→전폭 가로 스크롤. 데스크톱 마크업/셀렉터 보존(조건 분기).
3. 모바일 CSS(BriefingView.css @media ≤719px) — 신규 px 최소화, 공유 토큰/기존 클래스 우선.
4. 검증: 데스크톱 스모크 그린 유지 + 모바일 스모크 추가 + build. design-critique/ui-qa 리뷰.
5. 캡처 재기록(before/after), 이슈 로그 업데이트.

---
**상태: 승인 대기.** §6의 4개 결정에 답 주시면 그 기준으로 구현 시작.
