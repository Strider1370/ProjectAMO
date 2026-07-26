# 첫 사용자 온보딩 투어 (코치마크) — 설계 스펙

- 작성일: 2026-07-14
- 상태: 구현 완료 · 검증 통과 (단위 9/9 + Playwright 9/9)
- 범위: 데스크톱 우선 (모바일 제외)

## 1. 목표

첫 사용자가 앱을 열었을 때, **안 알려주면 존재조차 모르는 핵심 기능**을 스포트라이트 코치마크로 순서대로 안내한다. 패턴은 "능동형(action-driven) 하이브리드" — 가능하면 사용자가 실제로 눌러야 다음으로 넘어가고, 애매하면 [다음] 폴백을 제공한다.

- 대상 사용자: 모두(일반, 로그인 전 게스트 포함)
- 발동: 최초 접속 자동 1회 + 재방문 차단 (localStorage)
- 재실행: 사이드바 `도움말`(HelpCircle, 현재 비활성) 버튼 활성화 → 클릭 시 처음부터
- 의존성: **신규 npm 의존성 0** (자체 구현)

판단 기준(무엇을 넣을지): 두 축 — 발견성(자명 vs 숨김) × 핵심도(본질 vs 부차). 투어는 **숨김 × 고핵심**만.

## 2. 스텝 (5개, 관찰 → 조작) — 최종

| # | 안내 | target (스포트라이트 구멍) | 문구 | advanceOn |
|---|---|---|---|---|
| 1 | 위험 요약 (관찰) | Advisory 배지 칩바 `[data-tour="advisory"]` (optional) | 위험(SIGMET·경보)은 여기 상시 요약됩니다 | `next` |
| 2 | 마커 색 + 공항 패널 (조작) | **지도 RKSI 마커** `mapAirport:'RKSI'` (원형·클릭형) | 마커 색=심각도(녹/앰버/적). RKSI를 눌러 METAR·TAF·경보 열고, 다 보면 다음 | `next` (클릭=RKSI 선택→패널 열림, **자동진행 안 함**) |
| 3 | 기상정보 패널 (조작) | 사이드바 `[aria-label="기상정보"]` | 기상정보를 눌러 레이더·위성·바람을 켜 보세요, 다 보면 다음 | `next` (클릭=패널 열림) |
| 4 | 항공정보 패널 (조작) | 사이드바 `[aria-label="항공정보"]` | 항공정보를 눌러 공역·항로·ADS-B를 보세요, 다 보면 다음 | `next` (클릭=패널 열림) |
| 5 | 비행 전 브리핑 (조작) | 사이드바 `[aria-label="비행 전 브리핑"]` | 브리핑을 눌러 Go/No-go 확인, 다 보면 다음 | `next` (클릭=패널 열림) |

순서 근거: "지금 위험한가?"(1 관찰) → "색+상세 보기"(2, RKSI 실물 클릭) → "레이어 조작"(3·4) → "종합 브리핑"(5, 마무리 킬러기능).

각 스텝 공통: 툴팁에 진행 번호(N/총) + 문구 + [이전]/[다음]/[건너뛰기].

**변경 이력:** ① 초기 6스텝 → 5스텝(구 마커색+공항클릭을 RKSI 실물 마커 클릭으로 병합, 타임라인 제외). ② **진행 전부 수동([다음])으로 통일** — watch 자동진행이 패널 열자마자 다음으로 넘겨 "볼 시간이 없다"는 피드백 반영. watch 기계(armed/watchFires/evalWatch/signals)는 죽은 코드라 제거. ③ **배경 스크림 0.55→0.28로 완화** — 열린 패널(공항/기상/항공)이 어둠에 묻히지 않고 읽히게(강조는 outline 링).

### 열린 패널 가림 방지 — reveal (사용자 피드백)
클릭으로 패널이 열리면 그 패널이 스포트라이트 원·툴팁을 가리고, 정작 봐야 할 열린 패널은 어두운 배경에 묻힘. → 스텝에 `revealSelector`(열린 패널 셀렉터)를 두어, 그 요소가 DOM에 있으면 **스포트라이트가 대상(마커/버튼)→열린 패널로 이동**하고, 툴팁은 `placeTooltip`이 패널 반대편 빈 공간에 배치(왼쪽 배치 추가 → 오른쪽 도킹 공항 패널 회피). 적용: 공항 `.airport-panel`, 기상/항공 `.layer-tile-groups`(동시 하나만 열림), 경로확인(브리핑) `.route-check-panel`(RouteBriefingPanel 루트 `<section>`의 평문 클래스 — Griffel form은 내부라 이 외곽 클래스 사용). mapAirport 스텝은 패널 열리면 원형·클릭형 해제(일반 하이라이트, 패널 그대로 조작 가능).

### 스텝 전환 정리 (사용자 피드백)
[다음]으로 스텝을 넘길 때 이전 스텝이 연 것을 정리 — 안 하면 ① 공항 패널이 열린 채 남고 지도가 RKSI에 확대된 채 유지, ② 기상 패널이 열린 채 남으면 항공 스텝의 reveal이 **같은 클래스(`.layer-tile-groups`)** 인 잔여 기상 패널을 잡아 항공정보 버튼 하이라이트가 안 뜸. → App이 `tour.step.id` 변화를 관찰해 이전 스텝(prev)이 있으면 `setSelectedAirport(null)`+`setActivePanel(null)`(패널 닫기), **이전 스텝이 공항(`prev==='airport'`)일 때만** `mapRef.resetView()`로 초기 뷰 복귀. `resetView`는 공항 확대 직전 저장한 홈 뷰(`flyToAirport`에서 캡처, 없으면 `MAP_CONFIG`)로 flyTo — "사이트 진입 시 보던 줌"(측정값 6.0)과 일치.

## 3. 진행 메커니즘 — 전부 수동

- 모든 스텝 [다음] 버튼으로만 진행. 스텝 조작(공항/레이어 클릭)은 구멍/실제 버튼으로 하되 **자동진행하지 않음** — 사용자가 열린 패널을 볼 시간을 갖고 직접 [다음](사용자 피드백).
- Esc = 건너뛰기(종료). watch/자동감지 없음 → 셸 상태(`selectedAirport`/`activePanel`) 구독 불필요, `useTour`가 그 파라미터를 받지 않음.

### mapAirport 스텝 구현 상세 (canvas 마커)
- 마커는 Mapbox canvas라 DOM rect 없음 → MapView ref `getAirportPoint(icao)`가 실제 공항 좌표(`airports` prop, 마커와 동일 소스)를 `map.project`로 투영.
- **핵심 함정(사용자가 발견): `map.project`는 캔버스(컨테이너) 기준 픽셀 반환.** 사이드바만큼(≈56px) 오른쪽으로 밀린 캔버스라, `position:fixed` 스포트라이트에 그대로 쓰면 마커 **왼쪽(바다)으로 어긋남**. → `canvas.getBoundingClientRect().left/top`을 더해 뷰포트 좌표로 변환(수정 완료, `icaoAtHole==='RKSI'`로 검증).
- 구멍 자체가 클릭 버튼(`pointer-events:auto`) → Playwright/실사용 무관하게 클릭이 RKSI 선택을 트리거(canvas 히트테스트 의존 안 함). 하이라이트 밖 다른 마커는 딤 영역(`pointer-events:none`)으로 직접 클릭 가능.
- 진입 시 `flyToAirport('RKSI')`로 화면 중앙에 — 단, 데이터 로드 후(rect 최초 확보 시점) 1회 발동(진입 즉시는 데이터 전이라 no-op).

## 4. 스포트라이트 원리 (라이브러리 없이)

대상 rect에 맞춘 투명 div에 `box-shadow: 0 0 0 9999px rgba(0,0,0,.55)` → 그 div가 "구멍", 바깥 전체가 어두워짐. 마스크는 `pointer-events: none` → 밑의 실제 버튼/마커가 그대로 클릭됨(능동형의 핵심). 툴팁은 별도 요소로 rect 근처 배치(아래 공간 있으면 아래, 없으면 위). rect는 `getBoundingClientRect()`로 계산, 리사이즈/스크롤 시 재계산.

## 5. 파일 구조 (신규 feature 모듈)

```
frontend/src/features/onboarding/
  useTour.js       # 상태머신: step index, active, localStorage, advance/skip/restart, watch 평가, auto-skip
  tourSteps.js     # 스텝 정의 테이블 (target selector, text, advanceOn)
  TourOverlay.jsx  # 마스크 스포트라이트 + 툴팁 렌더 (rect 계산·리사이즈 대응)
  Tour.css         # §5 디자인 토큰만 사용
  useTour.test.js  # 상태머신 유닛 테스트 (진행/스킵/localStorage/auto-skip)
```

Architecture.md File Roles 갱신 필요(신규 모듈 추가).

## 6. 배선 (`frontend/src/app/App.jsx` — MainAppShell)

```jsx
const tour = useTour({ selectedAirport, activePanel, isMobile, hasUpdate })
// ...
<Sidebar ... onHelp={tour.restart} />         // 도움말 버튼 활성화 + 재실행 진입점
{tour.active && <TourOverlay tour={tour} />}  // 셸 맨 끝
```

- `Sidebar.jsx`: `도움말` 아이템 `disabled: true` 제거, `onHelp` prop 배선.
- `AdvisoryBadges.jsx` (라인 ~124, `<div className="advisory-badge-bar">`): `data-tour="advisory"` 속성 1개 추가. MapView 서브트리지만 상태/훅 없는 순수 속성이라 ADR 0001 무해.
- 자동 발동: 마운트 시 `localStorage['amo.tour.v1.done']` 없고 `!isMobile`이고 `!hasUpdate`이면 시작.
- 완료/스킵 시 `amo.tour.v1.done = '1'` 기록 → 재방문 안 뜸. 키에 버전(`v1`) 포함 → 향후 개편 시 재노출 가능.

## 7. 엣지 케이스 / 방어

- **target 부재 시 자동 스킵**: 스텝 1의 배지 칩바는 활성 위험이 0이면 DOM에 없음(count>0일 때만 렌더). 이때 해당 스텝을 건너뛰고 다음으로. 일반 로직으로 구현(모든 스텝에 적용).
- **업데이트 모달 충돌 — 우선순위 역전 주의 (구현 중 발견)**: 첫 방문자는 `hasUpdate`가 **항상 true**(lastSeen=null !== CURRENT_VERSION). 따라서 "`!hasUpdate`일 때만 투어"로 가드하면 정작 first-run 유저에게 투어가 영영 안 뜬다.
  - **결정: 앱 최초 방문자(lastSeen 없음)만 투어 자동발동.** `shouldAutoStart({done, isMobile, isFirstVisit})` — `isFirstVisit`는 `useLastSeenVersion`이 `lastSeen == null`로 노출(스토리지 키 단일 소유). `useTour`가 동기 `willAutoStart`를 노출 → App의 updates 자동표시 effect가 `hasUpdate && !tour.willAutoStart`로 양보.
  - **진짜 처음 유저**: 투어만, 업데이트 내역 미표시. 완료 시 `markSeen()`으로 changelog 소진.
  - **기존 사용자**(lastSeen 있음, 업데이트 있음): 평소대로 업데이트 내역 표시. 투어는 도움말 버튼으로만 재실행(자동발동 안 함).
- **모바일 가드**: `isMobile`이면 자동 발동 안 함(데스크톱 전용 결정). 도움말 버튼은 데스크톱 사이드바에만 존재.
- **z-index = 1100** (확정). 앱 내 모달 최상단 1000 위. 브리핑 라이트박스 9999는 온보딩 중 동시 등장 불가라 무관.
- **watch 진입 시 이미 참인 경우 (확정)**: 스텝 진입 시점에 predicate를 스냅샷 → **false → true 전이 시에만** 진행. 진입 시 이미 true면 자동통과 금지, [다음] 버튼을 강조해 수동 진행. 구현: `useTour`가 스텝 진입 때 `wasTrueOnEntry`를 기록하고, `armed = !wasTrueOnEntry`일 때만 watch가 진행을 트리거.
- **패널 토글 off 주의**: `togglePanel`은 토글이라 같은 버튼 두 번 누르면 `activePanel`이 다시 null. 스텝 4·5 툴팁 문구에 "열어두세요" 뉘앙스 포함(닫으면 predicate 재이탈).
- **사이드바 rect 안정성**: `is-expanded` CSS 트랜지션 중 `getBoundingClientRect()`는 위치가 틀어짐. rect는 트랜지션 종료 후/`requestAnimationFrame` 뒤 계산하고 `resize`·스크롤 시 재계산.
- **Fluent Popover 스택**: AdvisoryBadges의 Fluent Popover가 `document.body`로 portal되며 자체 스택 컨텍스트를 가질 수 있음 → 라이브 확인 필요(Playwright).

## 8. 접근성 (헌법 · CLAUDE.md 필수)

- 툴팁 `role="dialog"` + `aria-modal` 처리, 진행 상태 `aria-live`.
- Esc → 건너뛰기(투어 종료). [이전]/[다음]/[건너뛰기] 키보드 도달, 마운트 시 [다음]에 포커스.
- `prefers-reduced-motion` 존중(펄스/전환 애니메이션 축소).
- 대비: 딤 위 툴팁은 `--bg-1` 카드 + `--text-1`, 충분한 대비.

## 9. 검증 계획

1. `useTour.test.js` — 진행/스킵/localStorage/auto-skip 상태머신 (Node test runner).
2. Playwright 실주행 — 6스텝 순서, 스포트라이트 위치, 실제 클릭으로 watch 진행, 도움말 재실행, 재방문 차단. `docs/dev-server-and-capture.md` 절차 준수.
   - **스텝 1 검증 주의**: 배지 칩바는 실기상에 SIGMET/AIRMET/공항경보 있을 때만 렌더 → auto-skip 경로. 무풍파 날엔 강제 픽스처(advisory>0)로 스텝 1 표시를 별도 검증. 픽스처 없으면 스텝 1은 auto-skip 확인만.
   - z-index 스택: 모달·Fluent Popover 동시 상황에서 투어가 위에 뜨는지 라이브 확인.
3. 스크린샷 근거 — 각 스텝 상태 캡처.

## 10. 결정 로그 (리뷰 반영)

- **6스텝 유지**: 사용자가 직접 확정한 구성. 스텝 1은 무풍파 날 auto-skip → 실질 5스텝. 완주율 데이터 나오면 관찰 1+2 병합 재검토.
- **watch 진입 시 이미 참**: §7대로 스냅샷-온-엔트리 + 전이시에만 진행(`armed` 플래그).
- **스텝 3 (지도 마커)**: canvas라 정밀 조준 불가 수용. `.map-shell` 전체 스포트라이트 + watch(공항선택) 유지, [다음]을 1급 경로로 노출(화면에 공항 없을 때). "action-driven" 과장 안 함 — 관찰+선택적 조작.
- **localStorage**: try/catch 가드(useLastSeenVersion 패턴), 키 `amo.tour.v1.done`.
- **문구**: 명령형 한 줄, 구현 중 확정.
