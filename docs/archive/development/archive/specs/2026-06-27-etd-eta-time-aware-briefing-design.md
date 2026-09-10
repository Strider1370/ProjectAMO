# 시간 인지형 브리핑 (ETD/ETA) — 설계 스펙

> 상태: 승인됨(2026-06-27). 다음 단계: writing-plans로 구현 계획.
> 성격: **프런트 전용 "드러내기 + 입력 정리"**. 백엔드/payload 변경 없음.

## 0. 핵심 발견 (스코프 축소의 근거)
백엔드는 **이미 ETA 기준으로 브리핑을 구성**한다 — 새 기능이 아니라 *드러내기*가 본질:
- `backend/src/briefing/taf-window.js` · `selectTafAtEta(taf, eta)` → 목적지 TAF를 ETA에 가장 가까운 timeline 구간으로 선택(+카테고리).
- 같은 파일 `alternateRequired(taf, eta)` → ETA±1h에 1-2-3 근사(운고<2000ft 또는 시정<5000m)로 교체공항 필요 판단.
- `backend/src/briefing/briefing-composer.js` → payload에 `meta.etd`, `meta.eta`, `sections.destination.taf`(=ETA 슬라이스), `sections.destination.alternateRequired/Reason` 포함.
- 프런트 `useRouteBriefing.handleGenerateBriefing` → `computeEtaIso(etdIso, distanceNm, cruiseSpeedKt)`로 ETA 계산해 `{ etd, eta }` 전송(이미 동작).

→ 즉 데이터·계산은 전부 존재. UI가 ETD/ETA와 "ETA 기준"임을 **안 보여줄 뿐**이다.

## 1. 목표 / 결정 (승인됨)
- **ETA**: 입력 아님 → ETD+경로거리+순항속도로 **자동 계산·읽기전용 표시**.
- **ETD 입력**: 네이티브 `datetime-local`(연도 노출) → **커스텀 월-일 + 시각(HH:mm), 연도 없음**(올해로 추정).
- **시각 표기**: 하드코딩 금지 → 앱 전역 `useTimeZone()`(UTC/KST, `localStorage 'time_zone'`, 기본 KST) **설정을 따라감**.
- **브리핑 범위**: 최소·핵심 — 헤더 ETD→ETA + ⑤ 목적지 "ETA 기준 예보" 라벨. (③/enroute 시간확장은 out-of-scope.)

## 2. 변경 대상
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` + `RouteBriefing.css` — ETD 커스텀 입력 + ETA 읽기전용.
- `frontend/src/features/route-briefing/BriefingView.jsx` + `BriefingView.css` — 헤더 ETD→ETA, ⑤ 라벨.
- `frontend/src/shared/timezone/TimeZoneContext.jsx`(`useTimeZone`) 소비.
- 시각 포맷: `frontend/src/features/airport-panel/lib/formatters.js`의 `fmtKst(iso, tz)` 류 재사용, 필요 시 공유 위치에 짧은 헬퍼 추가(`HH:mmZ` / `HH:mm KST`, 날짜 다르면 `MM-DD HH:mm`).

## 3. 설계

### A. ETD 입력 (폼)
- 위젯: 월-일(MM-DD) + 시각(HH:mm) 두 컴팩트 컨트롤. 연도 미표시. 기본값=현재 시각(분 반올림 선택).
- tz 해석: 입력 wall-clock을 현재 `tz`로 해석해 ISO 생성. tz=UTC면 입력=Z, tz=KST면 입력=KST(−9h로 ISO).
  - 연도: 올해. (지난 날짜로 떨어져도 사용자 책임 — 단순 유지. 필요 시 "과거면 +1년" 룰은 구현 계획에서 판단.)
- `etd` state는 `new Date(etd)`로 파싱 가능한 값 유지 → `handleGenerateBriefing`의 `etdIso` 변환 계약 불변.
- **ETA 읽기전용**: `computeEtaIso(etdIso, distanceNm, cruiseSpeedKt)`. `distanceNm`은 routeResult 기반(없으면 `—`). 경로/속도/ETD 바뀌면 자동 갱신. tz로 포맷 표시.
- 순항속도 입력 유지(ETA 입력값). 데스크톱·모바일 공통(모바일은 이미 전폭 스택).

### B. 브리핑 화면 (드러내기)
- 헤더: 기존 `eyebrow + 노선 + (교체)` 아래/옆에 한 줄 `ETD {fmt(meta.etd)} → ETA {fmt(meta.eta)}`. 데스크톱 `.bv-meta`, 모바일 시트 헤더/상단.
- ⑤ 목적지: 기존 `taf.time · clouds · category` → **`ETA {fmt} 기준 예보 · clouds · category`**. `alternateRequired===true`면 기존 경고 라인 유지(근거 `alternateReason` = "ETA±1h …" 노출).
- 카테고리 색/카드 등 기존 스타일 재사용.

### C. 시각 표기
- `useTimeZone()` 구독, 모든 ETD/ETA/TAF 시각을 tz로 포맷. tz 토글 시 리렌더로 자동 갱신.
- 포맷: 짧게(`HH:mm` + `Z`/`KST`); ETD와 날짜가 다른 ETA/TAF는 `MM-DD HH:mm` 포함. 기존 `fmtKst`/`fmtKstShort` 재사용 또는 공유 헬퍼.

## 4. 절대 불변 (회귀 금지)
- 백엔드·`/api/route-briefing` payload 계약 불변(읽기만).
- `handleGenerateBriefing`의 `{ etd, eta }` 전송·`computeEtaIso` 사용 불변.
- 스크롤연동·리본↔단면도 정렬·스모크(`briefing-smoke.mjs`)·`frontend build` 그린 유지.
- 모바일 시트/공항탭/가로보기 등 최근 작업 불변.

## 5. 엣지 / 검증
- 경로 검색 전: ETA `—`(거리 없음).
- TAF 없음: 기존 "TAF 없음" 유지(ETA 라벨은 생략 또는 "ETA 기준 예보 없음").
- tz 토글: 즉시 재포맷.
- 테스트: `etaCalc.test.js` 존재. 포맷 헬퍼 추가 시 소형 단위테스트. UI는 스모크 + 캡처.

## 6. Out of scope (이번 아님)
- ③ 현재실황 관측시각/나이 표기, 도착=ETA 맥락.
- enroute 시간창(시간대별 위험).
- ETA 수동 입력 / 속도 역산.
- 백엔드 TAF 로직 변경.
