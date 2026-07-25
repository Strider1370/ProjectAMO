# 공항 패널 개편 — 프로토타입 → 실제 React 구현 계획

> 작성: 2026-07-13. 상태: **계획(미착수).** UI 정본 = [스펙 §12·§13](../specs/2026-07-13-airport-panel-single-scroll-tac-hero-design.md) + 작동 프로토타입 `frontend/public/airport-panel-redesign.html`.
> 정보구조/색/배지 근거 = 같은 스펙 §4·§6·§10. TAC/경향 백엔드 = [TAC 재구성 플랜](2026-07-13-metar-taf-raw-tac-reconstruction-plan.md).

## 0. "프로토타입 그대로 나오나?" — 먼저 정직하게

**화면은 그대로 낼 수 있음. 단 자동/1:1 복붙은 불가.** 이유:
1. 프로토타입 = 바닐라 HTML/JS + 하드코딩 hex + 인라인 로직. 실제 앱 = React + **기존 뷰모델**(`metarViewModel`·`tafViewModel`·`notamViewModel`·`currentWeatherViewModel`) + 디자인 토큰. → **로직은 재작성 아니라 기존 뷰모델에 배선**.
2. 컨테이너가 **탭 전환**(`AirportPanel.jsx` `tab` state, 한 번에 한 탭) → **단일 스크롤 + 스크롤스파이**로 구조 변경.
3. 프로토타입은 **데스크톱 960px 고정**. 실제는 **iPad(주 기기)+PWA+폰** 반응형 필요(메모리: 태블릿 미대응 상태).
4. 색은 **디자인 토큰**(`design-language.md`, Pretendard, `--level-*`) 사용 — 프로토타입 하드코딩 hex 금지.
5. 국내 원문 TAC·경향은 **백엔드 선행** 없으면 접기·슬롯이 비어 있음.
6. **제한 공항**(AMOS·기상정보 없는 공항, `FULL_FEATURE_AIRPORTS`) → 해당 섹션·레일 항목 생략.

→ 즉 이 플랜의 단계를 거치면 "그 화면"이 실제 앱에서 나옴. 프로토타입은 **픽셀 목표(target)**로 옆에 띄워두고 대조.

## 1. 성공 기준 (verify)

- 데스크톱·iPad Playwright 스크린샷이 프로토타입과 **구성·순서·색 일치**.
- 레일 고정 + 스크롤스파이 + 부드러운 스크롤 동작.
- 각 섹션 접이(details) 동작, 통일 제목바(아이콘+제목+시각+접기).
- METAR = 디코더 우선 + 비행규칙 배너 + 경향 슬롯 + TAC 접기.
- 제한 공항에서 AMOS·기상정보 섹션/레일 미표시, 깨짐 없음.
- 색상 computed 값이 토큰과 일치(헌법 §187 절차).
- MapView/오버레이 불변(헌법 §196, ADR-0001 무관 — 이 작업은 패널 내부만).

## 2. 프론트 단계 (각 단계 verify 포함)

### Phase 1 — 컨테이너: 탭 → 단일 스크롤 + 레일
- `AirportPanel.jsx`: `tab` state 제거 → 앱셸(헤더 + `flex:1` 본문), 본문 = 레일(고정) + `.scroll`(`overflow-y:auto; scroll-behavior:smooth`).
- ⚠ **높이 주의(리뷰 지적)**: 실제 `.airport-panel`은 `height:100%`(드로어 전체), 프로토타입의 `calc(100vh-40px)`는 프로토타입 전용. UTC 바는 패널 **밖**(App 루트). → **프로토타입 셸 복붙 금지.** 실제 드로어 안에서 `.airport-panel{height:100%; display:flex; flex-direction:column}` + 본문만 스크롤로 맞추고 Playwright로 오버플로우/드로어 위치 확인 후 확정.
- 레일 = 섹션 네비(아이콘+라벨), 클릭 시 `#sec-*` 스크롤. 스크롤스파이 = `IntersectionObserver{root:.scroll, rootMargin:'-10% 0 -70% 0'}`.
- 섹션 순서(헌법 §116): `공항경보 → METAR → TAF → AMOS → NOTAM → 기상정보`. **제한 공항은 AMOS·기상정보 제외**(`FULL_FEATURE_AIRPORTS` 재사용, `AirportPanel.jsx:23`).
- ⚠ **지연 로딩 정정(리뷰 지적)**: deferred는 `airportInfo`(+`adsb`)뿐(`weatherApi.js:200`의 `DEFERRED_WEATHER_FETCHERS`). **AMOS·NOTAM·TAF·METAR는 메인 페이로드로 이미 로드됨** — "스크롤 진입 시 lazy 로드" 아님. 기상정보만 진입 시 `onRequestDeferredWeatherData(['airportInfo'])` 유지. (AMOS/NOTAM까지 지연 로드를 원하면 백엔드 deferred fetcher 추가가 별도 선행 — 현재 범위 밖.)
- **verify**: 레일 고정 + 스크롤스파이 Playwright(스크롤 후 활성 항목 전환) + 드로어 높이 오버플로우 없음.

### Phase 2 — 섹션 컴포넌트화 + 접이 + 통일 제목바 (⚠ 삭제는 나중)
- 각 탭 컴포넌트 → 섹션으로: `<details class="ap-sec" open>` + `<summary>`(공통 `SectionHead`: 아이콘 + 제목 + 시각(meta, 제목 옆·굵게) + 접기 화살표 far-right). 공통 `SectionHead` 신규. meta 위치·색 = 스펙 §12.
- ⚠ **순서 정정(리뷰 지적): 새 섹션을 먼저 다 만들고 검증한 뒤에 `CurrentWeatherTab` 삭제.** 대체품 없이 먼저 지우면 폴백 없음. → 삭제는 **Phase 4b**로 이동.
- ⚠ **`CurrentWeatherTab`은 "완전 중복"이 아님(리뷰 지적).** 고유 UX 있음: **공항경보 페이지네이션 캐러셀**(`CurrentWeatherTab.jsx` L22-175 `WarningSummary` — ResizeObserver 레이아웃, 4200ms 회전, enter/leave 애니메이션). `WarningTab`엔 없음.
  - ✅ **결정(2026-07-13): 유지·이관.** `WarningSummary`(캐러셀 로직 + `.ap-current-warning-*` CSS)를 독립 컴포넌트 `WarningCarousel.jsx`로 추출 → 새 `공항경보` 섹션이 사용. `CurrentWeatherTab` 삭제(Phase 4b) 전에 이관 완료·검증. 관련 CSS도 `.ap-current-warning-*` → 섹션용으로 이전.
- **verify**: 6섹션(제한공항 4) 렌더 + 접이 토글.

### Phase 3 — METAR 섹션 (디코더 우선)
- `MetarTab` → `MetarSection`: 왼쪽 비행규칙 세로 배너(VFR/IFR/LIFR, `helpers.js`/공항 미니마 — 3단계, MVFR 미사용) + 오른쪽 **디코더 카드 2×4 기본**(`metarViewModel` 재사용) + **경향 슬롯**(§13) + **원문 TAC 접기**.
- 측풍·일강수량은 METAR에 없음(AMOS로 — 스펙 §9). 카드 = 바람·시정·운고·현재기상·기온/노점·QNH·RVR·체감.
- TAC 접기 내용 = `header.raw_text`(외국) 또는 재구성본(국내, Phase A 후). 없으면 접기 자체 숨김.
- **verify**: RKSI(국내)·해외공항 각각 카드/배너/접기 Playwright.

### Phase 4 — TAF · NOTAM · AMOS · 기상정보 · 공항경보
- **TAF**: 기존 `EnhancedTafTab` 색상 타임라인 유지 + 원문 TAC 접기. 타임라인 짤림 = **스펙 §11 별도 적용**(px/hour + 가로 스크롤).
- **NOTAM**: 기존 `NotamTab`+`NotamCell` 거의 그대로(이미 2열 셀·번역·시간배지). 섹션 헤더만 통일. 뷰모델 임포트 = `features/notam/lib/notamViewModel.js`(리뷰 지적: airport-panel/lib 아님).
- **AMOS**: 기존 `AmosTab` 센서 뷰 + 통일 헤더. 측풍·일강수량 여기로.
- **기상정보**: `AirportInfoTab` 원문 공보 유지. **⚠ 버그 수정: `warn`='○ 없음'인데 "경보 발효 중" 배지 뜨는 것 → `없음`이면 배지 미표시**(스펙 §12).
- **공항경보**: 발효 시 = 추출한 `WarningCarousel`(페이지네이션 유지), 없음 = 상태 박스(`WarningTab` 방식). 발효 최상단 적색 강조(스펙 §9 표).
- **verify**: 각 섹션 Playwright + 기상정보 배지 버그 회귀 테스트.

### Phase 4b — `CurrentWeatherTab` 삭제 (새 섹션 검증 후에만)
- Phase 2~4 새 섹션이 다 동작 + 고유 캐러셀 처리(이관/폐기) 결정 반영 확인 후 삭제.
- `knip`으로 사용처 0 확인 후 제거. import 정리.
- **verify**: `knip` 통과 + 전체 패널 Playwright 회귀(6/4섹션).

### Phase 5 — 레일 심각도 배지 (스펙 §10)
- 각 레일 항목에 주의 개수 배지 + 최악 심각도 색. 판별 로직 = **기존 뷰모델 재사용**(세는 계층만 신규). 카운트 단위·기준 = 스펙 §10 표.
- 접근성: 색+숫자 aria-label 병기, `9+` 캡.
- **verify**: 스펙 §10 실측 케이스(RKSI 정상=배지없음, 기상정보 2앰버 등) 재현.

### Phase 6 — 색·배경·헤더
- 토큰화: 프로토타입 하드코딩 hex → `design-language.md` 토큰. 패널 배경 중립 near-white, 헤더 = **실제 공항 사진**(프로토타입은 그라데이션 대체품, 실앱은 기존 `.ap-hero` 사진 패턴 사용).
- **verify**: computed 색 = 토큰(헌법 §187).

### Phase 7 — 반응형 (iPad/폰) · **Proposal-First**
- iPad(주 기기)+PWA+폰. 헌법 §182 가로 스크롤 금지, §183 패널 내부 폴백만.
- 메모리: **주요 모바일/태블릿 구조 변경은 기본 미실행 — 증거·제안서 먼저, 사용자 승인 후.** → 이 Phase는 데스크톱/iPad 확정 후 별도 제안서로 분리.

## 3. 백엔드 병행 트랙 (TAC·경향)

- **Phase A(지금 가능)**: `metar-tac.js`/`taf-tac.js` 직렬화기 → 국내 `header.raw_text` 채움. 픽스처 검증(API 호출 불필요). → Phase 3·4의 원문 접기가 국내서도 채워짐.
- **Phase B(보류)**: 경향(`trendForecast`)·비고 — **KMA API 호출량 소진으로 원본 IWXXM 덤프 대기**. 리셋 후 존재 확인 → 파서 확장 → 경향 슬롯 자동 표시. 상세 = [TAC 재구성 플랜 §7·§8](2026-07-13-metar-taf-raw-tac-reconstruction-plan.md).

## 4. 리스크 / 미결
- **스크롤스파이 + deferred 로딩 상호작용**: 기상정보가 접혀/아직 로딩 전일 때 IntersectionObserver 트리거 타이밍.
- **제한 공항 레일**: 섹션 수 가변 → 스크롤스파이 대상 동적.
- **TAF 타임라인 짤림(§11)**: 별도 작업, Phase 4와 순서 조율.
- **iPad 반응형**: 프로토타입에 없음 — Phase 7 제안서에서 결정.
- 국내 원문/경향: 백엔드 트랙 지연 시 접기·슬롯 빈 상태로 출시 가능(안내 문구).

## 5. 작업 규칙 (프로젝트 정책)
- 인코딩: `apply_patch`/`fs.writeFileSync(utf8)`만(§encoding-safety). PowerShell `Set-Content` 금지.
- 코드 수정 후 `graphify update .`.
- 검증 = **Playwright**(preview MCP 금지), `docs/dev-server-and-capture.md` 절차. 로컬은 `localhost`(IPv6 바인딩 주의 — `127.0.0.1` 안 될 수 있음).
- MapView/오버레이 무변경(ADR-0001, 헌법 §196).
