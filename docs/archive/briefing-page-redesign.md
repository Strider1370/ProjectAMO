# 비행경로 브리핑 페이지 개편 기록

> **성격:** 살아있는 문서(living doc). 브리핑 페이지를 왜·어떻게 개편하는지 근거와 결정을 차곡차곡 쌓는다.
> **범위:** `frontend/src/features/route-briefing/` 및 관련 백엔드(`backend/src/briefing/`).
> **참고:** 데이터 흐름 아키텍처는 [briefing-architecture.md](briefing-architecture.md), UI 규칙은 [design/design-language.md](design/design-language.md)가 상위 출처.

---

## 1. 배경 — 왜 개편하나

현재 브리핑은 4섹션(① 위험 ② 현재 ③ 노선 ④ 목적지)으로, FAA 표준 브리핑의 뼈대는 따르지만 일부 요소가 빠진 축약본이다. 실제 조종사 실무·국제표준(ICAO)에 비춰 무엇을 어떤 순서로 보여줄지 재정리한다.

## 2. 리서치 요약 (근거)

### 2-1. FAA AIM 7-1-5 — 미국식 "표준 브리핑" 순서

미국 FAA 체계의 사실상 표준. 법적 근거는 14 CFR §91.103(Preflight Action). Standard Briefing 9요소·순서:

1. Adverse Conditions (위험 기상/항공 정보)
2. VFR Flight Not Recommended (VFR 위험 자문)
3. Synopsis (기압계 개황)
4. Current Conditions (METAR/PIREP)
5. En Route Forecast (경로 예보)
6. Destination Forecast (목적지 예보)
7. Winds/Temps Aloft (상층바람·기온)
8. NOTAMs
9. ATC Delays

브리핑 타입 3종: Standard(≤6h, 전체) / Abbreviated(업데이트분) / Outlook(≥6h, 계획용). ※ 순서는 강제가 아니며, 앞 3개는 브리퍼 재량으로 재배열 가능.

### 2-2. 조종사 실무 (커뮤니티·EFB)

- DUATS 폐지(2018) 이후 **EFB 셀프 브리핑이 표준**(ForeFlight, Garmin Pilot). 전화 브리핑은 소수.
- 실제 조종사는 순차 낭독이 아니라 **Go/No-go 게이트 우선**으로 스캔: ① 위험(SIGMET/AIRMET/뇌우/TFR) → ② 출발·목적지 METAR(법정 최저) → ③ 목적지 TAF → ④ 상층바람·착빙층 → ⑤ NOTAM → (필요시) Synopsis.
- 의사결정 프레임: **NWKRAFT**(NOTAM·Weather·Known delays·Runway·Alternates·Fuel·Takeoff/landing), **PAVE / 5 P's**.
- 커뮤니티가 "빠졌다"고 지적: 착빙/난류 **실황(PIREP)** 부족, **교체공항 비교**(목적지 외 2~3곳 TAF), 실시간 위험 레이더.

### 2-3. 한국·ICAO — "표준 순서" 규범 없음

- 한국은 FAA가 아니라 **ICAO Annex 3** 기반. 법적 의무는 항공안전법 시행규칙 §161(기장의 비행 전 기상·연료·대체경로 숙지)이나 **순서는 규정 안 함**.
- **ICAO Annex 3 Ch.9**("Meteorological information for operators and flight crew members")는 제공 방식(Briefing/Consultation, Flight documentation, Automated systems)과 **요소 목록**만 규정, **제시 순서는 미규정**.
- **ICAO 6요소**(비행문서): 상층바람·기온 / SIGWX / TAF / SIGMET·AIRMET+경보 / METAR·SPECI / 특별항공기상보고(PIREP).
- 한국 "AIM" 용어 주의: **AIP(항공정보간행물, GEN 3.5 = 기상서비스)** vs **항공정보매뉴얼(KOTSA 발간)** vs **aim.koca.go.kr(Aeronautical Information Management 포털)** — 셋 다 다른 것. 어디에도 FAA식 번호 매긴 브리핑 순서는 없음.

### 2-4. 결론 — 3층 합성 원칙

1. **순서 = FAA AIM 7-1-5** 뼈대 (익숙함)
2. **강조 = 조종사 실무의 Go/No-go 게이트** (맨 위 상태 먼저)
3. **완결성 = ICAO 6요소** 빠짐없이

→ FAA 순서는 **차용**이지 한국/ICAO 표준이 아님. 완결성은 ICAO 6요소로 채운다.

## 3. 목표 브리핑 구조

| 순서(FAA) | 섹션 | 내용 | 표출 | 현재 |
|---|---|---|---|---|
| 0 | **Go/No-go 배너** | 최악 카테고리 + 이유 + 공항별 카테고리 | 상단 얇은 상태 스트립 | ❌ 신규 |
| ① | 위험 (Adverse) | SIGMET/AIRMET + **공항경보/윈드시어** · (+SIGWX위험·NOTAM·PIREP) | 배지 + 지도레이어 칩 | △ 확장 |
| ② | 현재 (Current) | 출발·목적지·교체 METAR 매트릭스 + AMOS(도착)·**이륙예보(출발)** 펼치기 | 비교 매트릭스 | ✅+α |
| ③ | 개황 (Synopsis) | **일기도 뷰어**(지상 기본 · 종류/기압면/시간 전환) + 자동요약 + SIGWX 전선 GIS | 인라인 뷰어 + 슬라이더 | ❌ 신규(§5-C) |
| ④ | 노선 (En route) | 경로 위험 + 착빙/난류 리본 + 연직단면도 + **상층바람 원자료 접기(경로 하이라이트)** | 리본 + 단면도 + 원자료 표 | ✅ 현행+α(§5-D) |
| ~~⑤~~ | ~~상층바람 (Winds Aloft)~~ | **신설 안 함** — 연료·시간=외부 자동, 착빙·난류·시어=이미 있음(§5-D) | — | ❌ 폐기 |
| ⑥ | 목적지 (Destination) | 카테고리 타임라인 막대 + 기간표(범주 앞) + **교체 TAF 병렬** + 원문 접기 | 시각화 + 표 | △→설계완(§5-E) |
| ⑦ | NOTAM | 공항·항로·공역 (치명적→①) | 목록 + 지도 오버레이 | 🔜 소스확보(AFTN)·밑그림 §5-F |
| ~~⑧~~ | ~~ATC Delays~~ | 생략(한국 GA 실익 낮음) | — | — |

## 4. 데이터 출처

**현재 확보 (기상청 apihub, 코드 확인됨):**

| 요소 | 출처 | 포맷 |
|---|---|---|
| METAR/TAF | `apihub.kma.go.kr .../AmmIwxxmService` | IWXXM |
| SIGMET/AIRMET | 동 apihub | IWXXM |
| SIGWX 저고도(~FL100) | `amo_sigwx.php` (5/11/17/23 UTC) | 커스텀 XML(odmap_ml) |
| AMOS 지상실황 | `amos.php` | — |
| 난류(KTG)·착빙(KIM) 모델 | KIM grid | 격자 |
| 지형(단면도) | korea3sec DEM | 바이너리 |

**추가 예정:**

| 요소 | 출처 | 상태 |
|---|---|---|
| SIGWX 중·고고도(FL100–600) | **WAFS SIGWX, IWXXM** (2024.11 통합) — WIFS **샘플 파일**로 시작 | 회사 WIFS 계정은 운영 주경로라 앱 직접사용 불가 → 샘플 요청 |
| NOTAM | aim.koca.go.kr PIB 등 | 소스 확인 필요 |
| PIREP | 미정 | 소스 확인 필요 |

**SIGWX 전 고도 통합:** WAFS SIGWX가 **IWXXM**이라 앱의 기존 IWXXM 파서(`iwxxm-advisory-parser.js`, `sigmet-parser.js`) 적응으로 해결(BUFR/GRIB2 아님). 경로 교차는 `geo-time-match.js`의 `routeIntervalInGeometry`(Polygon 전용) 재사용. 선 피처(제트·권계면)는 선-교차 확장 필요. 연속 3D 히트맵은 WAFS 격자형(GRIB2) 별건.

## 5. Go/No-go 배너 — 확정 설계 (1차)

### 5-1. 담백 버전 (현재 채택)

개인 minima·이륙치·go/no-go 판정은 **나중**. 1차는 **기상 카테고리 요약**만:

- **헤드라인**: 최악 카테고리(VFR/IFR/LIFR) + 어느 공항 + **이유(운고 or 시정)**
- **행**: 출발·목적지·교체 각 카테고리 뱃지 (**실제값 표시 X** — METAR/TAF가 아래 섹션에)
- **색**: 표준 항공 카테고리색 **단일축**(축이 하나뿐이라 색 혼동 없음)
- **이유 노출**: IFR이면 IFR인 이유, LIFR이면 LIFR인 이유(운고/시정 중 한계요인)를 명시

```
┌─ LIFR · 목적지 RKPC · 운고 300ft ──────────────────────┐
│   출발 RKSI  IFR       목적지 RKPC  LIFR      교체 RKSS  VFR  │
└──────────────────────────────────────────────────────────┘
```

### 5-2. 카테고리 정의 — 3레벨 (배너 한정, MVFR fold)

임계값은 `flight-category.js` 실제 코드 기준 (**시정 단위 = 미터**, 운고 = ft):

- **VFR**: 운고 ≥ 3000ft **AND** 시정 > 8000m (≈5SM)
- **LIFR**: 운고 < 500ft **OR** 시정 < 1600m (≈1SM)
- **IFR**: 그 사이 전부 (기존 MVFR 범위 = 운고 1000–3000ft 또는 시정 5000–8000m 를 흡수)

**중요 — 스코프:** 공유 함수 `categoryFor`는 **4등급(MVFR 포함) 유지**한다. ② 현재 실황의 `CatBadge`(표준 4색)가 이를 쓰므로 건드리지 않는다. 배너의 3레벨은 **배너 로컬에서 fold**(MVFR→IFR)로만 처리.

### 5-3. 색·접근성 규칙

- 표준 카테고리색: VFR `--cat-vfr` / IFR `--cat-ifr` / LIFR `--cat-lifr`.
- **§2.2 준수**: 전부 VFR일 땐 헤드라인 바탕을 초록으로 채우지 말고 무채색/subtle. IFR/LIFR일 때만 채색.
- **§3 준수**: 색 + 카테고리 라벨(텍스트) 병기. 색맹 대응.
- 컴포넌트: 신규 최소화 — Fluent `Badge`/`MessageBar` + 기존 토큰(`--cat-*`).

### 5-4. 배치

- `bv-header` 바로 아래, `nav` 위. 데스크톱·모바일 동일.
- 모바일: `MobileSheet`의 `peek`에 헤드라인 공급 → 시트 접혀도 최악 카테고리 보임(P2).

## 5-A. ① Adverse 확장 설계

**현재:** SIGMET + AIRMET만. 경로+시간+고도 매칭 → 조우/주변 배지 + 출처·현상·밴드·유효시간 ([hazard-section.js](../backend/src/briefing/hazard-section.js), [BriefingView.jsx:128](../frontend/src/features/route-briefing/BriefingView.jsx)).

**원칙 — Adverse = 큐레이션, 덤프 아님:** FAA 정의(비행 취소·변경할 중요 정보)에 맞춰, 여러 소스에서 **심각한 부분집합만** 끌어온다. severity 필터가 없으면 딴 섹션과 중복돼 부푼다.

**확장 후보 + severity 필터 + 데이터:**

| 소스 | 넣을 부분(필터) | 중복 경계 | 데이터 | 우선 |
|---|---|---|---|---|
| **공항경보·윈드시어** | 출/도착/교체 공항 특보 (WIND_SHEAR 등) | — | ✅ **있음** — `warning-parser.js` AIRPORT_WARNINGS(ICAO별, `wrng_type_key`) | **상(바로 구현)** |
| SIGWX 위험 | SEV ICE·SEV TURB·CB·화산 **등고선만** | 전선·기압계 → ③ Synopsis | ✅ 저고도 있음(경로매칭만) | 중 |
| PIREP | **긴급(UUA)만** — 심한 착빙·난류·윈드시어·화산재 | 일반 → ② 현재 | ❌ 소스 필요 | 하 |
| NOTAM | **치명적만** — 공항·활주로 폐쇄, 항법시설 불능, TFR/공역통제 | 전량 → ⑦ 전용 | ❌ 소스 필요 | 하 |

**개선(현행 SIGMET/AIRMET 자체):** 심각도순 정렬(조우+red 먼저) — 저비용.

### 표출 설계 (확정)

기존 "연한 틴트 배지 + 정보 밀집 한 줄, 정렬·아이콘·위계 없음"을 **위험 다이제스트**로 개편:

- **심각도순 정렬**: 조우 > 주변, red > amber. 제일 위험이 맨 위. 헤더에 "N건 · 심각도순".
- **행 = 2줄 위계 + 좌측 severity 색바**(red=조우, amber=주변; 단면 border라 `border-radius:0`):
  - 1줄(굵게 500): `[현상 아이콘] 현상 · 밴드(low–high ft)`
  - 2줄(회색): `출처 · 구간NM · 유효시간`
- **배지**: 조우 = filled red / 주변 = tint amber.
- **밴드 미상**: `?` 대신 `밴드 미상` 칩(명시). (§P6)
- **구간 NM 노출**: "출발 후 32–68NM".
- **공항경보/윈드시어 행**: 경로위험과 한 리스트에 통합하되 **NM 생략**("RKPC 도착").
- 색: 구현 시 디자인 헌법 §5 토큰(`--level-red/amber`, `--cat-*`)으로 매핑. 아이콘은 앱 심볼 자산 또는 lucide.
- 위험 없음: "경로·시간에 걸린 위험기상 없음"(회색) 유지 — 정상=조용(§2.2).

### 구현 가능성 (검증 완료)

| 요소 | 데이터 | 난이도 |
|---|---|---|
| 정렬 / 2줄·색바·배지 / 밴드·밴드미상 | `encounter`·`source`·`bandFt`·`verticalKnown` 다 있음 | 🟢 무료(프론트) |
| 구간 NM | `routeIntervalNm`이 **이미 `sections.adverse.hazards`에 도달**(composeBriefing이 hazard 그대로 전달) — 렌더만 추가 | 🟢 무료 |
| 현상 아이콘 | SIGMET code→아이콘 매핑 **없음**(`weather-icon-registry`는 METAR용) → ~15줄 신규 | 🟡 소 |
| 공항경보/윈드시어 통합 | store `'warning'` 타입에 **이미 저장**([warning-processor.js](../backend/src/processors/warning-processor.js)), 브리핑 파이프라인 **미연결** | 🟠 중(배선) |

**공항경보 통합 3단계** (유일한 실작업, 새 외부소스 불필요):
1. **데이터 주입**: 브리핑 호출부에서 `store.load('warning')` → `composeBriefing`의 `data.warning`으로 전달.
2. **별도 병합 경로**: 공항경보는 **경로 지오메트리 없음**(공항 스코프) → `matchItems`(routeIntervalInGeometry) 안 탐. dep/arr/alt ICAO 필터 + 시간(ETD~ETA) 겹침 + hazard 유사 shape 변환(NM 없이 "RKPC 도착").
3. **렌더 분기**: 정렬·표시가 두 shape(경로위험 NM有 / 공항경보 NM無)를 함께 처리.

**결론:** 목업 ~90%는 기존 데이터로 바로 구현 가능(= `BriefingView` adverse 렌더 리팩터). 신규는 **아이콘 매핑(소) + 공항경보 배선(중)** 뿐.

## 5-B. ② Current 설계

**현재:** 공항별 METAR 6필드(바람·시정·운고·기온/노점·현상·QNH)를 **가로 표 3개 세로 스택**. 카테고리 CatBadge는 우측상단. 원문 METAR 없음(raw=null). ([airport-summary.js](../backend/src/briefing/airport-summary.js), [BriefingView.jsx:151](../frontend/src/features/route-briefing/BriefingView.jsx))

**표출 설계 (확정) — 비교 매트릭스:**
- **공항 = 행, 필드 = 열** (표 3개 스택 → 단일 매트릭스, 출발·도착·교체 한눈 비교).
- **역할(출발/도착/교체) 강조**: 슬레이트 틴트 칩(`--level-gray-bg`/accent) + ICAO semibold — 행 식별 anchor.
- **범주(카테고리) 맨 앞 리딩 열**(우측상단→앞으로, §P2 상태 먼저), 표준 4색.
- **바람 kt**: `270/12kt`, 돌풍 `G28`(red). **측풍**은 바람 셀 보조(`측풍 L17kt`).
- **시정 포맷**: `≥10km`/`3.2km` (raw 미터 숫자 X).
- **기온/이슬점**: 헤더 `기온/이슬점`, 값 `18/9℃`.
- **관측시각을 행별로** + **SPECI 태그**(SPECI일 때만 앰버 subtle, METAR면 시각만). §2.2 정상 무채.
- **▸ 확장 = AMOS + 원문 METAR**(§P3 점진 노출). **원문 METAR은 확장 하단에 모노스페이스로 표시**(조종사 원문 확인 수요). ※ v3/v4 목업엔 있었으나 v5에서 누락 — **표시 확정, 재삽입 필요**.
- **▸ 출발 행 = 이륙예보 펼치기**: 출발공항 행 확장 시 **ETD 전후 바람·기온·QNH**(이륙 성능용). 도착 행=AMOS, **출발 행=이륙예보**로 대칭. ETD 시각 행 하이라이트.
- 한계초과 필드 = `--level-red` 볼드. 정상 = 무채.

**AMOS 확장 표시 내용** (raw 나열 X → 운영 성분):
사용 활주로 · **정풍 H/T · 측풍 L/R(kt)** · 10분 평균풍 · RVR(활주로별) · 운고 · QNH · 기온/이슬점. (2분/10분 전체 풍속표는 공항패널에 양보.)

### 구현 가능성 (검증 완료)

| 요소 | 데이터/로직 | 난이도 |
|---|---|---|
| 매트릭스·카테고리앞·바람kt·시정포맷·기온/이슬점·QNH | `airport-summary`/METAR 파서에 다 있음 | 🟢 무료(요약 필드 추가 + 렌더 재구성) |
| 관측시각·SPECI | `observation_time`·`report_type` 있음, summarizeAirport 미전달뿐 | 🟢 무료 |
| **측풍·활주로 매핑·사용활주로** | **이미 구현** — [amosViewModel.js](../frontend/src/features/airport-panel/lib/amosViewModel.js): `AMOS_REPRESENTATIVE_RUNWAYS`·`pickActiveRunwayLabel`·`calculateRunwayWindComponent` | 🟢 재사용 |
| AMOS 확장 전체 | 표시 로직(`buildAmosConsoleModel`) 있음. route-briefing이 이미 amos 참조([useRouteBriefing.js](../frontend/src/features/route-briefing/useRouteBriefing.js)) | 🟡 데이터 shape 연결만 |
| **원문 METAR 전체 문자열** | 소스가 IWXXM(XML) → **원본 TAC 없음**. 조각(`wind.raw` 등)만 | 🟡 재구성 or TAC 소스 확인 |
| **이륙예보(출발 행 펼치기)** | KMA apihub **이륙예보 조회 API**(seqApi=14/sub=260, `getAirInfo`류): 매시·icaoCode별 **wd·ws·ta·qnh**, 일반 XML/JSON(IWXXM 아님). **앱 미수집**(앱의 `airport_info`=`AirPortService/getAirPort` 메타데이터로 별개) | 🟡 신규 processor(`airport-info-processor` 패턴 복제, 같은 apihub·authKey) |

**AMOS 실측 필드**(참고): `runways[]`(L/R side) wind dir·speed(**m/s**, ×1.9438=kt)·min/max, rvr_m, visibility_m(MOR), cloud_min_m / temp·dewpoint·humidity·rainfall / qnh·station 기압. ⚠️ 상단 `wind_2m/wind_10m`은 항상 null(바람은 runways[]에만).

**결론:** 매트릭스 본체 + 관측시각/SPECI + **측풍/AMOS까지 대부분 기존 코드 재사용**으로 구현 가능. 유일한 진짜 갭은 **원문 METAR 전체 문자열**(IWXXM라 원본 없음 → 재구성 또는 TAC 소스).

## 5-C. ③ Synopsis 설계

**현재:** 없음(신규 섹션).

### 리서치 요약 (근거)

- **개황용 종관일기도**: 지상 분석일기도(등압선·전선·H/L)가 핵심, + 지상 예상(12/24h), 상층(850 온도이류·500 steering·250/300 제트). 발표는 synoptic time(00/06/12/18Z).
- **누가 쓰나**: 지상일기도는 모두. 상층·제트는 IFR·고고도·디스패처. GA는 지상+저고도 SIGWX면 충분.
- **한국(KMA/항공기상청)**: 분석·예상 일기도를 **GIF/PNG 이미지**로 제공(`global.amo.go.kr`, `apihub.kma.go.kr` 차트조회 API), 상층 00/12Z. GRIB2는 `data.kma.go.kr` 신청·FTP(실시간 부적합). JMA ASAS/FSAS 병행.
- **EFB 표출**: ForeFlight·Garmin·aviationweather = **차트 이미지** 오버레이. Windy만 GRIB→등압선(marching squares). **전선은 어디서도 기계판독 데이터가 없음**(주관 분석, WAFS도 2007 제거) → 전선 보이려면 **이미지가 유일**. (우리 SIGWX 저고도 `font_line`은 예외적 전선 지오메트리 보유 — 국지·저고도.)
- **이미지 vs 데이터**: 이미지=1~2일·전선 포함·정적 / GRIB 등압선=2~3주·전선 없음. 소규모 팀엔 이미지가 명백 우위.

### 결정 — 브리핑 내 "일기도 뷰어" (in-briefing)

브리핑에서 바로 봐야 의미 있음 → 일기도 섹션을 **브리핑 안에** 둔다. 단 **한 장만 노출 + 버튼 전환**(§P3)이라 "다 펼치는" 과대함은 피한다. (이전 "별도 화면" 결정 대체.)

**구조 = 종류(1차) → 기압면/공항(2차) → 시간(3차):**
- **종류 버튼**: `[지상] [상층] [상세바람] [단열선도] [연직시계열]` — 지상 기본 활성.
- **2차 축**:
  - **상층·상세바람** = 면 자료 → **기압면 칩 `[850][700][500][300]`**. 기본선택 = **계획고도 최근접**(예 9,000ft→700).
  - **단열선도·연직시계열** = 지점 자료 → **공항 축(기본 도착공항)**.
- **시간(3차) = 시간 슬라이더**(연속 유효시각 스크럽). 단 **연직시계열은 시간축 자체**라 슬라이더 대신 **ETA 세로 마커**.
- **초기 표시(비행시간 매칭)**: 지상/상층 = **ETD** · 상세바람 = **ETD 최근접** · 단열선도/연직시계열 = **도착공항·ETA 포함 최신 예보**. (시간 매칭 = TAF의 `selectTafAtEta`와 동일 패턴, nearest valid-time.)
- **발표시각 + 유효시각 무조건 표시** + ETA와의 delta.
- **자동 한 줄 요약(지상 전용)**: SIGWX `font_line`/`pressure` 좌표 → 지역 매핑 → "한랭전선 서해상~남해상 · 저기압 남해상". (전선=선이라 구간 표현, 기압=점이라 지역 라벨.)
- **[지도에서 전선·기압 보기](지상 전용)**: SIGWX `font_line`/`pressure` GIS 오버레이 토글(우리 데이터). 상층/상세바람 등엔 숨김.

### 구현 가능성

| 요소 | 데이터/로직 | 난이도 |
|---|---|---|
| 지상일기도 임베드 + 슬라이더 | KMA 이미지(URL/apihub 확인) + **시간순 아카이빙**(store max_files 패턴) | 🟢~🟡 |
| 상층 기압면 칩 | KMA 상층 이미지(00/12Z) | 🟢 이미지 |
| 시간 매칭(ETD/ETA nearest) | `selectTafAtEta` 패턴 재사용 | 🟢 |
| 자동요약(전선/기압 지역매핑) | `sigwx_low` `font_line`/`pressure` 좌표 있음 + 지역 bbox 테이블(소) | 🟢 |
| SIGWX 전선 GIS 토글 | ✅ 데이터 있음 | 🟢 오버레이 |
| **상세바람·단열선도·연직시계열** | **회사 내부망** — 버튼은 처음부터, 데이터는 소스 붙는 대로(초기 "준비중" 비활성) | 백로그 §6-A |

**열린 항목**: KMA 지상/상층 **이미지 URL·apihub 엔드포인트**·**갱신주기**(지상 3h 여부)·**예상도 리드타임**(가용 T+N) 확인 / 슬라이더용 **아카이빙 방식**(자체 저장 vs KMA 시간지정 조회 API) / 표출 = 패널 이미지(쉬움) vs 지도 georeference(추가).

## 5-D. ④ En route + ⑤ Winds Aloft 결론

**현재 ④:** 이미 충실 — 계획고도, encounters(SIGMET/AIRMET 조우), 착빙(KIM)·난류(KTG) 리본+범례, 연직단면도(레이어 토글: 기온·습도·착빙·바람·난류·SIGMET/AIRMET) + "크게 열기". ([enroute-model.js](../backend/src/briefing/enroute-model.js), [enroute-cross-section.js](../backend/src/briefing/enroute-cross-section.js), [BriefingView.jsx:212](../frontend/src/features/route-briefing/BriefingView.jsx))

### ⑤ Winds Aloft = 신설 안 함 (YAGNI)

리서치: 상층바람/기온의 용도 = 연료·시간(EFB/디스패처 **자동**) · 착빙(결빙고도) · 난류/CAT(연직 시어) · 순항고도 선택(EFB/디스패처) · 기상계 이동. **우리 앱 기준 전부 (a) 외부 자동이거나 (b) 이미 있음**(착빙·난류 리본+단면도 착빙/바람/난류 레이어). → 화려한 상층바람 readout·독립 섹션 **폐기**.

### ④ 유일 추가 — 상층바람·기온 "원자료" 접기

원데이터 제공 의미만 살림. **기본 접힘 → 펼치면 텍스트 표**(§P3):
- **행 = KIM 압력면**(hPa, 라벨은 hgt→FL 변환 가능) · **열 = 웨이포인트**(RKSS…RKPC) · 셀 = `바람방향/속도 기온`.
- **하이라이트 = 실제 비행경로 고도**: 각 웨이포인트에서 항공기 고도(`altitudeAtDistanceFt`)에 최근접한 층 셀을 강조 → 표를 대각선 관통(상승→순항→강하). 평면 순항 행보다 유의미.
- 출처 캡션(`KIM NWP · 유효 …Z`).

### 구현 가능성 (검증 완료)

| 요소 | 근거 | 난이도 |
|---|---|---|
| 원자료 표(층×웨이포인트, 바람/기온) | `crossSection.levels`에 **T + u/v** 층별·거리별([enroute-cross-section.js:56-61]) — 이미 단면도 기온/바람 레이어가 사용 | 🟢 |
| u/v→방향/속도 | 바람 레이어에서 이미 수행 | 🟢 |
| 웨이포인트 열 | 단면도 x축 마커 존재 | 🟢 |
| 경로 하이라이트 | `altitudeAtDistanceFt` + 층 `hgt` 최근접 | 🟢 |
| encounters·리본·단면도 | 이미 구현 | ✅ |

**주의:** 표 행은 KIM 압력면(hPa)이라 라벨은 hPa/hgt→FL 변환. 임의 FL 아님. **새 데이터·소스 0.**

**결론:** ⑤ 폐기, ④ 현행 유지 + 원자료 접기(경로 하이라이트). encounters 스타일 통일(①의 2줄·색바)은 선택.

## 5-E. ⑥ Destination 설계

**현재:** ETA 최근접 TAF **한 줄**(운고+범주만) + 교체필요 경고. 바람·시정·현상·변화군 다 버림, 교체공항 TAF 자체 미표시. ([taf-window.js](../backend/src/briefing/taf-window.js), [briefing-composer.js:37-47](../backend/src/briefing/briefing-composer.js))

### 표출 설계 (확정) — 시각화

텍스트 한 줄 → **시간축 시각화 + 기간표**:
- **카테고리 타임라인 막대**: TAF 유효기간을 범주색으로 세그먼트(prevailing = base+BECMG), **TEMPO/PROB는 빗금 밴드**로 별도, **▼ETA 마커**. "도착 무렵 악화(TEMPO IFR)" 한눈에.
- **기간별 표(METAR식)**: 행 = base/TEMPO/BECMG, 열 = **범주(맨 앞)**·기간·바람·시정·운고·현상. **ETA 포함 기간 하이라이트**. 바람 kt·시정 ≥10km/3.2km 등 ②와 동일 규칙.
- **교체공항 TAF 병렬**: 교체필요 배지 + 교체공항 범주·ETA 요약 + (압축) 막대. 커뮤니티 지적 갭 해소.
- **원문 TAF = 접기(재구성)**.
- **범주 = 3레벨(VFR/IFR/LIFR)**, MVFR→IFR fold(전 섹션 일관, 아래 결정로그).

### 구현 가능성 (검증 완료)

| 요소 | 근거 | 난이도 |
|---|---|---|
| 타임라인 막대 | `taf.timeline` 시간별 상태 + `categoryFor` | 🟢 |
| TEMPO 밴드 · 기간표 | `parseChangeGroups`가 변화군 **구조화**(type·start·end·wind·vis·wx·clouds) [taf-parser.js:171] | 🟢 |
| 범주 3레벨 | 표시 fold | 🟢 |
| **교체 TAF 병렬** | `tafByIcao[alternate]` 있음, **composer가 현재 미전달** | 🟡 배선 |
| 원문 TAF 재구성 | 변화군 raw 필드 | 🟡 |

**유일 실작업:** composer `destination` 페이로드를 **timeline + 변화군 + validity + 교체 TAF**까지 확장(현재 `tafAtEta` 한 점 + 교체 필요여부만). 데이터 다 있음 → **전달만**, 새 소스 0.

**결론:** 시각화(막대+기간표)·교체 병렬 전부 기존 파싱 데이터로 가능. 실작업 = composer 페이로드 확장 + 프론트 렌더. → **⑥ Destination 설계 단계 종료.**

## 5-F. ⑦ NOTAM 밑그림 (추후 대비, 소스 확보됨)

### 소스 — ✅ 확보 (AFTN 자체수신, 무료)
회사 **AFTN 수신 전문에 NOTAM 존재, RKRR 조회됨**(확인 완료). → 유료 API(Notamify)·웹 폴백(FAA DINS) 불필요. 인천 FIR NOF = `RKRRYNYX`, 5개 시리즈(A·C·D·G·H).

### 리서치 결론 — 지도·시간·공간·연직·경로 전부 가능
ICAO **Q-line + 항목 A~G**가 기계판독 코어:
- **시간** B(시작)/C(종료), D(스케줄) · **연직** F(하한)/G(상한) · **공간** 좌표(11자)+반경(NM)→**원(circle)**, FIR, 공항(scope A) · 분류 Q-code·scope(A/E/W).
- **지도표시**: 좌표+반경→원, 공역→폴리곤, 공항scope→점. (모든 EFB 방식.)
- **경로 필터**(핵심 가치 — NOTAM 80%가 무관): 회랑 교차(공항 50NM/항로 30NM) + 고도밴드(F/G vs 프로파일) + 시간(B/C) + 공항 scope. → **`geo-time-match` 재사용**(원→폴리곤 교차·시간 겹침·밴드), **SIGMET과 동일 패턴.**
- 클래식 NOTAM=반구조화(자체 파싱), Digital NOTAM(AIXM)=완전구조화지만 배포 제한.

### 역할·표출
- **전용 섹션 ⑦**(그룹: 출발/도착/교체 공항 + 항로/공역) + **치명적 NOTAM은 ① Adverse 승격**(폐쇄·항법시설 U/S·TFR, §5-A).
- 항목 = `ID + plain-language 요약 + 유효시간 + [원문 펼치기]` + 분류 아이콘, 치명적 상단·red.
- 지오메트리 있는 것 → **지도 오버레이 + 경로 교차**.

### 작업 항목 (구현 시)
1. **AFTN NOTAM 인제스트** — AFTN 터미널 전문 → 백엔드 피드(파일/연동)
2. **Q-line 파서** — 시간·고도·좌표+반경 추출 (SIGMET 파서 패턴)
3. **지오메트리 도출** — 좌표+반경 → 원 폴리곤
4. **Q-code 판독 사전** — plain-language용 (ICAO Doc 8400, ~100+ 코드 — 지루하지만 1회성)
5. **필터** — `geo-time-match` 재사용
6. **표출** — 목록 + 지도 + Adverse 승격

**난이도**: 🟡 자체파싱(SIGMET 패턴 재사용). 판독 사전이 유일한 노가다. **새 비용 0(AFTN 무료).**

## 6. 결정 로그

- **채택**: 3층 합성 원칙 / 배너=카테고리 단일축 담백 버전 / 이유(운고·시정) 노출 / 실제값은 배너에 표시 안 함(하단 중복 회피).
- **채택(Adverse)**: 큐레이션 원칙(severity 필터) / **공항경보·윈드시어를 우선 확장**(데이터 이미 있음 `warning-parser.js`) / SIGWX 위험은 위험 등고선만 / PIREP·NOTAM은 심각·치명 부분집합만.
- **확정(Adverse 마무리)**: 표출 설계(2줄 위계·색바·아이콘·정렬·NM·밴드미상) + 구현 가능성 검증 완료(§5-A). 목업 90% 기존 데이터, 신규는 아이콘 매핑·공항경보 배선뿐. → **① Adverse 설계 단계 종료.**
- **확정(Current 마무리)**: 비교 매트릭스(공항=행)·역할 강조·범주 앞·바람 kt·시정 포맷·기온/이슬점·관측시각+SPECI·AMOS 확장(정풍/측풍 성분) 설계 + 구현 가능성 검증(§5-B). 측풍·활주로·AMOS 표시는 `amosViewModel` 재사용, 유일 갭은 원문 METAR(IWXXM라 원본 없음). → **② Current 설계 단계 종료.**
- **확정(En route ④ / Winds Aloft ⑤)**: **⑤ 신설 안 함**(연료·시간=EFB/디스패처 자동, 착빙·난류·시어·고도선택·바람변화=이미 리본/단면도에 있음, YAGNI). **④ 현행 유지 + 상층바람·기온 "원자료" 접기 추가**(층×웨이포인트 텍스트 표, **실제 비행경로 고도 하이라이트**). 데이터는 `crossSection.levels`(T+u/v)·`altitudeAtDistanceFt` 재사용 → 새 소스 0, 전부 🟢. → **④/⑤ 설계 단계 종료.**
- **채택(Synopsis, 갱신)**: 브리핑 **내** 일기도 뷰어. 종류(지상 기본/상층/상세바람/단열선도/연직시계열) → 상층·상세바람은 기압면 칩(기본=계획고도 최근접)·지점자료는 공항축 → 시간 슬라이더(연직시계열은 ETA 마커). 초기표시 지상/상층·상세바람=ETD, 지점자료=도착·ETA. 발표+유효시각 필수, 자동요약(전선/기압 지역매핑, 지상전용), 지도 전선토글(지상전용). 한 장 노출+버튼전환이라 §1 담백 유지. **이전 "지상 1장/별도화면" 결정 대체.** 전선은 이미지에만 존재(기계판독 데이터 없음).
- **확정(Destination ⑥)**: TAF를 텍스트 한 줄 → **카테고리 타임라인 막대(TEMPO 빗금·ETA 마커) + 기간별 표(범주 앞, ②규칙) + 교체공항 TAF 병렬 + 원문 접기(재구성)**. 데이터(timeline·변화군·validity)는 다 파싱됨, 실작업은 composer 페이로드 확장뿐(§5-E). → ⑥ 종료.
- **채택(이륙예보)**: **② Current 출발 행 펼치기 = 이륙예보**(바람·기온·QNH, ETD 전후). 도착=AMOS와 대칭. 소스 = KMA apihub 이륙예보 조회 API(getAirInfo류, 일반 XML, 앱 미수집) → `airport-info-processor` 패턴 복제. "이륙 제한치" 연기와 별개(예보는 소스 확인됨).
- **기각**: MVFR — **표시는 3레벨(VFR/IFR/LIFR) 전 섹션 일관**(배너·② Current·⑥ Destination 모두). 내부 `categoryFor`는 4등급 계산하되 **표시 시 MVFR→IFR fold**. (이전 §5-2의 "② CatBadge 4색 유지" 메모는 이 결정으로 정정 — 표시 4색 아님.)
- **채택(NOTAM ⑦, 밑그림)**: 소스 **AFTN 자체수신 확보**(회사 전문에 NOTAM·RKRR 조회됨, 무료·전 시리즈) → 유료/폴백 불필요. Q-line 자체파싱 → 지도(좌표+반경→원)·시간(B/C)·연직(F/G)·경로(회랑+밴드+시간, `geo-time-match` 재사용) 전부 가능. 치명적→① Adverse 승격. 난이도 🟡(판독 사전이 노가다). 추후 구현(§5-F).
- **연기**: 개인별 minima(→ 로그인 후 사용자 프로필 저장, 큰 작업) / Go/No-go 판정 로직 / 이륙 제한치(상업운송 ODP·takeoff minima 미모델링) / NOTAM·PIREP(소스 확보 후) / WAFS SIGWX(WIFS 샘플 후).

## 6-A. 일기도 뷰어 확장 (내부망 소스 대기)

③ 일기도 뷰어의 종류 버튼은 처음부터 다 만들되, **데이터는 소스 붙는 대로**(초기 "준비중" 비활성). 대부분 **회사 내부망**.

- **상세바람장**(면, 기압면 칩 — 상층과 동일 패턴 / ICAO winds aloft, ⑤와 연결) · **단열선도(Skew-T)**(지점=도착공항, ETA) · **공항별 연직시계열(meteogram)**(지점=도착공항, ETA 마커).
- 착수 전: 내부망 소스 접근·포맷 확인. 뷰어 UI·시간매칭은 지상/상층에서 먼저 확립 후 재사용.

## 7. 열린 항목 / TODO

- [x] **확인됨** — `flight-category.js`는 `byVis`·`byCeil`을 내부 계산하나 **나쁜 쪽 문자열만 반환**, 한계요인은 버림. 이유 노출은 저비용.
- [ ] **이유 노출 구현** — 기존 `categoryFor`(string)은 그대로 두고 형제 함수 **추가**(호출부 무영향):
  ```js
  export function categoryDetail({ visibilityM, ceilingFt }) {
    // byVis / byCeil 계산 후
    const worse  = order[byVis] <= order[byCeil] ? byVis : byCeil
    const driver = byVis === byCeil ? 'both'
                 : (order[byVis] < order[byCeil] ? 'visibility' : 'ceiling')
    return { category: worse, driver }
  }
  ```
- [ ] **배너 상태 계산** (배너 로컬):
  ```
  input:  airports[{ role, icao, visibilityM, ceilingFt }]   // 이미 있음
  step1:  각 공항 categoryDetail() → { category, driver }
  step2:  3레벨 fold: MVFR → IFR
  step3:  최악 = order 최소 공항
  output: { worst:{icao, role, category, driver}, airports:[{icao,role,category3}] }
          헤드라인 = worst.category + roleLabel + driver('운고'|'시정')
  ```
- [ ] 배너 컴포넌트 props·CSS 스펙 확정 후 구현 (§7 proposal-first: 새 상단 구조라 승인 후 착수).
- [ ] 교체공항 TAF를 ⑥ 목적지 섹션에 병렬 표시(현재 alternate 메타만).
- [ ] Synopsis 섹션: SIGWX 저고도 pressure/front 항목 목록화(경로 교차 불필요).
- [ ] WAFS SIGWX IWXXM 샘플 수령 → 스키마 확인 → 파서 확장.
- [ ] **원문 METAR 소스 결정**: IWXXM엔 원본 TAC 문자열 없음 → (a) 파싱 조각으로 재구성 표시 or (b) apihub TAC METAR 엔드포인트 확인. ② Current 확장 하단 표시용.

## 8. 출처 (리서치)

- [FAA AIM §7-1-5 Preflight Briefing](https://faraim.org/faa/aim/chapter-7/section-7-1-5.html)
- [14 CFR §91.103 Preflight Action](https://www.law.cornell.edu/cfr/text/14/91.103)
- [FAA AC 91-92 Pilot's Guide to a Preflight Briefing](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1036892)
- [AOPA — The Weather Briefing](https://www.aopa.org/training-and-safety/students/crosscountry/special/the-weather-briefing)
- [NWKRAFT 설명](https://northstarvfr.com/blogs/news/how-and-when-pilots-use-nwkraft-in-real-world-aviation-scenarios)
- [PAVE Checklist — Pilot Institute](https://pilotinstitute.com/pave-checklist/)
- [항공안전법 시행규칙 (국가법령정보센터)](https://law.go.kr/%EB%B2%95%EB%A0%B9/%ED%95%AD%EA%B3%B5%EC%95%88%EC%A0%84%EB%B2%95%EC%8B%9C%ED%96%89%EA%B7%9C%EC%B9%99)
- [항공기상청 (KMA AMO)](https://amo.kma.go.kr/)
- [AIM-Korea 포털](https://aim.koca.go.kr/)
- [WAFS SIGWX upgrade Nov 2024 (ICAO APAC MET SG-28)](https://www.icao.int/sites/default/files/APAC/Meetings/2024/2024%20MET%20SG-28%20and%20MET%20Seminar/5-Presentations/SP01_WAFS-SIGWX-Presentation.pdf)
- [Changes to WAFS SIGWX Forecasts (ICAO flyer, Apr 2024)](https://www.icao.int/sites/default/files/METP/Documents/WAFS-SIGWX-flyer-Apr-2024.pdf)
