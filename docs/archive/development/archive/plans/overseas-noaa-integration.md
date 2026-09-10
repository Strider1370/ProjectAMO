# 해외 공항 확장 — NOAA 통합 구현 계획

상태: 계획(구현 착수 전) · 작성 2026-07-05

## 배경 / 결정

국내(RK…) 서비스를 대한민국 인근 해외 공항으로 확장한다. 근거 조사(5갈래 리서치 + 실측)는
`docs/research/2026-07-05-overseas-data-research.md` 참조. 확정된 결정:

- **국내 = KMA 유지 / 해외 = NOAA 추가** (국내 파이프라인 무변경, 리스크 최소)
- **1차(MVP) 범위 = METAR / TAF / SIGMET** (경로 GFS 상층기상은 2차로 분리)
- 대상 = MVP 문서의 해외 50개 공항, FIR 20개

## 왜 NOAA인가 (요약)

- METAR/TAF: `aviationweather.gov/api/data/metar|taf` — 무료·무인증, **50개 한 번에**(`ids=` 콤마), 아시아 44/50 실측.
- SIGMET: `.../isigmet` — **한 번 호출로 전세계 활성 SIGMET**, 각 항목에 `firId`·위험종류·도형좌표(`coords[]`) 포함 → FIR별 분류·지도표시·경로매칭 그대로.
- KMA 세계공항(AftnAmmService)은 공항당 1콜 + 낮은 호출한도라 대량 폴링에 불리(실측 확인). 보조/교차검증용으로만 여지.

## 핵심 설계 원칙 — "파서 층에서 정규화"

NOAA는 JSON/원문, 기존 KMA는 IWXXM XML로 포맷이 다르다. **downstream(store·briefing·frontend)을
바꾸지 않기 위해**, NOAA 응답을 **기존 파서가 내놓던 정규화 객체와 동일한 shape**로 변환하는
NOAA 전용 파서를 타입별로 하나씩 추가한다. 그러면:

- `store.js`, `briefing/*`, `frontend/features/weather-overlays/*`, `airport-panel/*` = **무변경**
- 지도 마커·공항 패널·브리핑은 공항목록에 해외 공항이 추가되는 순간 자동 반영

> 구현 1번째 작업: 기존 정규화 shape를 **정확히** 확정한다 —
> `parsers/metar-parser.js`, `parsers/taf-parser.js`, `parsers/iwxxm-advisory-parser.js`의
> 출력 객체 필드를 읽어 NOAA 파서의 변환 목표로 삼는다. (graphify 우선)

## 소스 분기 방법

공항이 국내/해외인지로 소스를 고른다. **ICAO 접두 `RK` = KMA, 그 외 = NOAA**가 가장 단순
(별도 플래그 불필요). 단, 명시성을 위해 `shared/airports.js` 각 항목에 `source: 'kma'|'noaa'`를
두는 것도 허용 — 접두 규칙과 동치이면 접두 규칙(코드 0줄) 우선.

## 파일별 변경

### 데이터 정의
- `shared/airports.js` — 해외 50개 공항 추가(icao/name/nameKo/lat/lon; runway_hdg·amos_stn은
  해외 미적용이므로 null 허용). 좌표는 OurAirports(Public Domain)에서.
  - ⚠ 지도 카메라/바운즈(`frontend/src/features/map/mapConfig.js`)가 한반도로 고정이면 해외 마커가
    화면 밖 → 바운즈 확장 여부 별도 확인(1차에서는 마커만 등록, 카메라는 후속).

### 백엔드 수집
- `backend/src/config.js` — NOAA 블록 추가: `noaa.base_url`, METAR/TAF/isigmet 경로, 해외 공항
  선별 헬퍼. 스케줄에 해외 수집 편입(METAR 10분·TAF 30분·SIGMET 5분, 기존 주기 재사용).
- `backend/src/api-client.js` — NOAA 분기 추가. KMA 경로(resultCode 헤더 검사)와 분리:
  - `fetchNoaaMetarTaf(type, icaoList)` — `ids=` 벌크 1콜, JSON, `response.ok`만 검사(resultCode 없음).
  - `fetchNoaaIsigmet()` — 파라미터 없이 전세계 1콜.
  - EUC-KR 디코딩 로직은 KMA 전용이므로 NOAA 경로에는 태우지 않음.
- `backend/src/parsers/noaa-metar-parser.js` (신규) — NOAA METAR JSON → 기존 METAR 정규화 shape.
- `backend/src/parsers/noaa-taf-parser.js` (신규) — NOAA TAF JSON → 기존 TAF 정규화 shape
  (`base`/`change_groups` 포함 — `briefing/taf-window.js`가 요구).
- `backend/src/parsers/noaa-isigmet-parser.js` (신규) — NOAA isigmet JSON → 기존
  advisory 정규화 shape(도형 GeoJSON·FIR·위험종류·유효시간·고도밴드).
- `backend/src/processors/{metar,taf}-processor.js` — 루프를 국내/해외로 분기: 국내는 현행,
  해외는 NOAA 벌크 1콜 → NOAA 파서 → 같은 `store.save` 병합.
- `backend/src/processors/sigmet-processor.js` — 해외 SIGMET은 NOAA isigmet 1콜 → 파서 →
  FIR 20개로 필터 후 기존 국내 SIGMET과 병합 저장.
- `backend/src/index.js` — 스케줄 잡에 해외 수집 편입(기존 타입 잡 안에서 국내+해외 함께).

### 프론트 (원칙상 최소)
- 정규화 shape가 맞으면 `advisoryLayers.js`·`AdvisoryBadges.jsx`·`airport-panel/*` 무변경.
- 확인만: SIGMET의 공항 귀속(패널 "이 공항 관련 SIGMET")은 FIR 기준. 해외 공항→FIR 매핑이 있어야
  per-airport 표시 가능. **1차는 지도표시 + 경로 geometry 매칭까지만**(FIR 그룹핑은 후속)로 스코프.

## 스코프 밖(빈칸으로 둠 — 근거는 리서치 문서)
- AIRMET: 아시아 미발행(NOAA도 미국 전용) → "해당없음".
- 고고도 난류: 무료 글로벌 소스 없음 → 2차(WAFS/wind-shear proxy).
- 해외 공항경보: 해외 피드 없음 → TAF+SIGMET로 대체.
- FIR 경계선 폴리곤: SIGMET이 자체 도형을 들고오므로 표시엔 불필요 → 후속(장식용).
- 경로 상층바람/착빙(GFS): 2차.
- 항로(airway) navdata: 유료(Navigraph) 병목 — 경로 브리핑 뼈대는 별도 트랙.

## 검증 계획 (성공 기준)
1. NOAA 파서 3종: 실제 응답 픽스처 → 정규화 shape 단위 테스트(기존 파서 출력과 필드 동형).
2. 수집 후 `store.getCached`에 해외 공항 METAR/TAF·해외 SIGMET이 국내와 같은 형태로 존재.
3. 프론트: 해외 공항 마커·패널 METAR/TAF 표시, SIGMET 오버레이·배지 표시(Playwright 스크린샷).
4. 브리핑: 해외 목적지 노선에서 SIGMET 경로매칭 동작.

## 단계
- **1a** 정규화 shape 확정(기존 파서 3종 출력 정독) + NOAA 파서 3종 + 단위테스트
- **1b** api-client NOAA 분기 + config + 해외 공항목록
- **1c** processor 분기 + 스케줄 편입 → store 확인
- **1d** 프론트 표시 확인/미세보정 + Playwright 증빙
- (2차) GFS 상층기상 · FIR 경계 · 항로 navdata
