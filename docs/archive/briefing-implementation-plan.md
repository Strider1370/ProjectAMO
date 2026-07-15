# 비행 전 브리핑 개편 — 구현 계획

> **근거:** [archived briefing-page-redesign.md](archive/briefing-page-redesign.md)(historical design decision) · [briefing-redesign-mockup.html](briefing-redesign-mockup.html)(시각 시안) · [design language](policies/design/design-language.md)(UI 헌법)
> **성격:** 실제 코드(`frontend/src/features/route-briefing/`, `backend/src/briefing/`)에 얹기 위한 단계별 작업 계획. 파일·데이터는 세션에서 확인된 실제 경로 기준.

---

## 0. 착수 전 필수 (프로젝트 규칙)

- 작업 시작 시 `Architecture.md` → Task Patterns 매칭 → `EntryPoints.md` 확인.
- **UI/CSS/레이아웃**: `design-language.md`가 단일 진실. 목업 색·타이포는 §5 토큰(`--cat-*`, `--level-*`, Pretendard)으로 매핑.
- **지도 오버레이/레이어**(전선·NOTAM 등): `docs/adr/0001-mapview-layer-gravity.md` 준수 — `MapView.jsx`에 state/useEffect 추가 금지, **`useXOverlay` 훅**으로.
- **인코딩 안전**: UTF-8 파일 `apply_patch`/Node `fs.writeFileSync('utf8')`. PowerShell 리다이렉트 금지.
- **graphify** 먼저, 광범위 grep 전. 코드 수정 후 `graphify update .`.
- **검증**: 로직은 단위 테스트(기존 `*.test.js` 패턴), 화면은 **Playwright**(`docs/dev-server-and-capture.md` 절차). Preview MCP 금지.

## 1. 시퀀싱 원칙

**기존 데이터·기존 코드 재사용부터 → 새 소스/전제 필요 항목은 뒤로.** 설계 문서의 구현 가능성 판정(🟢/🟡/🟠)을 그대로 우선순위로 사용.

---

## 2. Phase 0 — 공통 기반

| 작업 | 파일 | 내용 | 검증 |
|---|---|---|---|
| **3레벨 표시 fold** | `backend/src/briefing/flight-category.js` | `categoryDetail({visibilityM,ceilingFt})` → `{category, driver:'ceiling'\|'visibility'\|'both'}` 추가(기존 `categoryFor` 유지). 표시용 `to3Level(cat)`(MVFR→IFR) | `flight-category.test.js`에 케이스 추가 |
| 토큰 확인 | `frontend/src/shared/theme/` | `--cat-*`·`--level-*` 존재 확인(목업과 동일값) | — |

3레벨 fold는 **전 섹션 표시 일관**(배너·②·⑥) 규칙(결정 로그). 내부 `categoryFor`는 4등급 유지, 표시 시 fold.

## 3. Phase 1 — 기존 데이터로 즉시 (대부분 🟢)

### 3-1. Go/No-go 배너 (신규)
- **파일**: `frontend/src/features/route-briefing/BriefingBanner.jsx`(신규) + `BriefingView.jsx`에서 헤더 아래 배치.
- **데이터**: `sections.current.airports[].category` + `categoryDetail`의 `driver`(운고/시정). 최악(3레벨) 공항.
- **표시**: 솔리드 카테고리색 블록(도착공항 + 범주) + 이유 + 역할 체인(출발/도착/교체). advisory. 정상=차분(연녹/무채), 위험=솔리드(§2.2).
- **연기**: 개인 minima 판정(로그인 후).

### 3-2. ① Adverse 재설계
- **파일**: `BriefingView.jsx`(adverse 렌더), 아이콘 매핑 신규(현상 code→아이콘, ~15줄), `backend/src/briefing/hazard-section.js`(정렬·공항경보 병합).
- **작업**:
  - 정렬(조우>주변, red>amber), 2줄 위계+좌 색바+아이콘, **밴드 미상** 칩, **구간 NM**(이미 `routeIntervalNm` 프론트 도달 → 렌더만).
  - **공항경보/윈드시어 통합**(🟠): `server.js:773` `/api/route-briefing`의 `data`에 `warning: store.getCached('warning')` 추가(2줄) → `composeBriefing`에서 dep/arr/alt ICAO 필터 + 시간 겹침 → hazard 유사 shape(경로지오 없음, "RKPC 도착"). 렌더가 두 shape 처리.
  - severity 필터(치명적만 승격) 원칙 유지.
- **검증**: `hazardLayers.test.js`/신규 정렬 테스트.

### 3-3. ② Current 비교 매트릭스
- **파일**: `BriefingView.jsx`(current 재구성), `backend/src/briefing/airport-summary.js`(필드 확장), `frontend/.../airport-panel/lib/amosViewModel.js`(재사용).
- **작업**:
  - 공항=행 매트릭스, **범주 맨 앞 리딩 열**, 바람 kt·시정 `≥10km/3.2km`·기온/이슬점.
  - `summarizeAirport` 반환에 `report_type`(SPECI)·`observation_time`·구조화 wind(dir/speed/gust) 추가(파서에 이미 있음).
  - **AMOS 확장**: `server.js:773` `data`에 `amos: store.getCached('amos')` 추가 → composer가 공항별(`amos.airports[icao]`) raw를 페이로드에 실음 → 프론트 `BriefingView`에서 **`buildAmosConsoleModel(amos, metar, airportMeta)` 재사용**(측풍·활주로·RVR 이미 구현, `AMOS_REPRESENTATIVE_RUNWAYS`에 RKSS/RKPC/RKPU 존재). 필요: `airportMeta`를 BriefingView에 전달.
  - 원문 METAR: IWXXM 재구성 or TAC 소스(🟡, §7 TODO).
  - **이륙예보(출발 행 펼치기)**(🟡 신규 소스, 쉬움): KMA apihub 이륙예보 조회 API(`getAirInfo`류, 매시·icaoCode, wd/ws/ta/qnh, 일반 XML) — **`airport-info-processor.js` 패턴 복제**(같은 apihub·`API_AUTH_KEY`) → store 타입 신규(`takeoff_fcst`) → 브리핑 `data` 주입 → 출발 행 확장(도착 AMOS와 동형, ETD 시각 하이라이트). 앱 `airport_info`(`AirPortService/getAirPort`)와 **별개 서비스**임에 주의.
- **검증**: `airport-summary` 스냅샷 + Playwright 매트릭스 캡처.

### 3-4. ④ En route — 원자료 표 + 경로 하이라이트
- **파일**: `BriefingView.jsx`(enroute), `backend/src/briefing/enroute-model.js` 또는 신규 유틸(u/v→dir/speed).
- **작업**: `crossSection.levels`(T + u/v, 이미 로드됨)를 층×웨이포인트 텍스트 표로. **경로 하이라이트** = 각 웨이포인트 `altitudeAtDistanceFt` 최근접 층(hgt). 접기(§P3).
- **주의**: 행 라벨 = KIM 압력면(hPa/hgt→FL 변환).
- **검증**: `enroute-model` 테스트에 경로-하이라이트 매핑 케이스.

### 3-5. ⑥ Destination — 타임라인 + 기간표 + 교체
- **파일**: `backend/src/briefing/briefing-composer.js`(destination 페이로드 확장), `backend/src/briefing/taf-window.js`, `BriefingView.jsx`(destination).
- **작업**:
  - composer `destination`에 **timeline + changeGroups(parseChangeGroups) + validity + 교체 TAF** 실어보내기(현재 `tafAtEta` 한 점만).
  - **카테고리 타임라인(결정론 단일 막대)** — 시간대별 최악 범주. **기간표**(base/TEMPO/BECMG, 범주 앞). **교체공항 TAF 병렬**. 원문 TAF 접기(재구성).
- **검증**: `taf-window.test.js` + composer 스냅샷.

## 4. Phase 2 — 새 소스/섹션

### 4-1. ③ 일기도 뷰어 (Synopsis)
- **게이팅**: KMA 지상/상층 **이미지 URL·apihub 엔드포인트·갱신주기·예상도 리드타임** 확인(§5-C 열린항목).
- **작업**: 이미지 수집·**시간순 아카이빙**(store `max_files` 패턴) → 뷰어 UI(종류/기압면 칩/시간 슬라이더). **자동 한 줄 요약** = `sigwx_low`의 `pressure`/`font_line` 좌표 → 지역 bbox 테이블 매핑. **전선 GIS 오버레이** = ADR 0001대로 `useSynopsisOverlay` 훅.
- **검증**: 지역매핑 단위 테스트, Playwright 차트 전환 캡처.

### 4-2. 분석 화면 (상세바람·단열선도·연직시계열)
- **게이팅**: 회사 내부망 소스 접근·포맷 확인. 뷰어 종류 버튼은 만들되 소스 붙는 대로 활성(목업의 "준비중"→활성).

## 5. Phase 3 — ⑦ NOTAM

- **소스**: AFTN 자체수신 확보됨(무료·전 시리즈, RKRR). 
- **작업**: AFTN NOTAM 인제스트 → **Q-line 파서**(sigmet 파서 패턴) → 지오(좌표+반경→원) → **`geo-time-match` 재사용**(경로 회랑+밴드+시간) → 전용 섹션 목록 + 지도 오버레이 + **치명적→① Adverse 승격**. Q-code 판독 사전(1회성 노가다).
- **난이도**: 🟡(자체파싱). 새 비용 0.

## 6. 연기 (전제 필요)

- **개인 minima**(배너 2층): 로그인 + 사용자 프로필 구축 후.
- **WAFS SIGWX 전 고도**(IWXXM): WIFS 샘플 파일 수령 후 기존 IWXXM 파서 확장.
- **ATC Delays**: 제외(한국 GA 실익 낮음).
- **ADS-B**: 브리핑 비포함(실시간 지도/백엔드 보정 몫).

## 7. 검증 전략

- **단위**: category fold/categoryDetail · TAF timeline·changeGroups 매핑 · 경로 하이라이트 · 지역 bbox 매핑 → `*.test.js`.
- **통합**: `composeBriefing` 스냅샷(악기상/양호 시나리오).
- **브라우저**: Playwright로 섹션별 렌더·펼치기·차트전환·매트릭스 캡처(`dev-server-and-capture.md`). 목업이 시각 회귀 기준선.
- **회귀**: 기존 route-briefing 테스트 유지.
- **접근성**(실 구현 필수, 목업 미적용분): 시맨틱 헤딩/랜드마크, 키보드(펼치기·라이트박스), `:focus-visible`, alt 동기화, 대비 — design-language §P6.

## 8. 권장 착수 순서

1. **Phase 0** 공통 fold + `categoryDetail` (+테스트)
2. **Go/No-go 배너** (가장 눈에 띄는 성과, 기존 데이터)
3. **② Current 매트릭스** (+AMOS 재사용)
4. **① Adverse 재배치** (+공항경보 배선)
5. **④ 원자료 표**
6. **⑥ Destination 타임라인** (+composer 확장)
7. **③ 일기도 뷰어** (KMA 소스 확인 후)
8. **⑦ NOTAM** (AFTN 파이프라인)

각 단계: 설계 문서 §해당절 재확인 → 구현 → 단위테스트 → Playwright 캡처 → `graphify update .`.

## 9. 리스크·게이팅 요약

| 항목 | 게이트 | 없으면 |
|---|---|---|
| ③ 일기도 | **[확인됨] 백엔드에 이미지 fetch 파이프라인 부재** — KMA 엔드포인트 확보 + fetch·아카이빙 processor 신규 필요 | 뷰어 UI만, 이미지 미표시 |
| 원문 METAR/TAF | IWXXM 재구성 vs TAC 소스 | "재구성" 라벨로 표시 or 생략 |
| AMOS 브리핑 연결 | route-briefing에 amos 전달 여부 | 확장 행 비활성 |
| 공항경보 통합 | shape 병합 + composer 주입 | ①에 SIGMET/AIRMET만 |
| ⑦ NOTAM | AFTN 인제스트 파이프라인 | 섹션 보류 |

## 10. 코드 검증 결과 (이 계획이 실제로 되는가)

세션에서 코드 확인한 결과 — **Phase 1은 검증 완료, 실제 가능**:

| 확인 항목 | 결과 |
|---|---|
| warning/amos 주입 지점 | ✅ `server.js:773` `data={metar,taf,sigmet,airmet}` (모두 `store.getCached`) → **2줄 추가로 끝**. 브리핑 단일 페이로드라 프론트 자동 수신 |
| 디자인 토큰 | ✅ `frontend/src/shared/theme/tokens.js`·`tokens.css`에 `--cat-*`/`--level-*` 실재, BriefingView 사용 중 |
| routeIntervalNm(①구간NM) | ✅ composer가 hazard 그대로 전달 → 프론트 도달 |
| ④ 원자료(바람/기온) | ✅ `crossSection.levels`에 T+u/v 존재(단면도 레이어가 사용) |
| ⑥ 변화군 | ✅ `parseChangeGroups`가 TEMPO/BECMG 구조화 |
| 측풍·활주로 | ✅ `amosViewModel` 계산 완비, `AMOS_REPRESENTATIVE_RUNWAYS`에 RKSS/RKPC/RKPU 존재 |
| **③ 일기도 이미지 fetch** | 🔴 **부재 확인** — 백엔드에 KMA 분석일기도 이미지 수집 없음(ktg/kim 격자만). `docs/일기도`는 수동 다운로드. → ③의 실제 관문 |

**결론:** 배너·①·②·④·⑥은 **기존 데이터·기존 코드 재사용으로 구현 가능**(새 외부소스 0, 배선은 대부분 서버 2줄+composer 로직+프론트 렌더). ③은 **이미지 fetch/아카이빙 신규**가 선행, ⑦은 AFTN 파이프라인, 개인 minima·WAFS·내부망 차트는 전제 확보 후.
