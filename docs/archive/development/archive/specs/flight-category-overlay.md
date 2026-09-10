# 면단위 Flight Category 오버레이 — 기능 명세서

**버전**: 1.1  
**작성일**: 2026-06-08  
**상태**: 설계 확정

---

## 1. 개요

ASOS/AMOS 지점 관측값, KMA 고해상도 격자 시정자료, GK2A CTH 위성 마스킹을 조합하여 한반도 전역의 비행 기상 상태(Flight Category)를 면 단위로 맵에 시각화한다.

---

## 2. 데이터 소스

### 2-1. 시정 (Visibility)

| 항목 | 내용 |
|------|------|
| 제공처 | KMA API Hub — 고해상도 격자자료 |
| 엔드포인트 | `https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-sfc_obs_nc_api` |
| 파라미터 | `obs=vs`, `tm={YYYYMMDDHHMM KST}`, `disp=A`, `authKey={auth_key}` |
| 형식 | ASCII (`disp=A`) |
| 격자 | 2049 × 2049, 해상도 500m |
| 범위 | 위도 30.74°~40.35°, 경도 120.67°~133.07° |
| 단위 | 10m 단위 → ÷10 하면 m |
| 좌표 참조 | `sfc_grid_latlon.nc` (각 격자 인덱스 → 위경도 매핑) |
| 비고 | KMA 자체 보간 완료 제품, 별도 보간 불필요 |

#### `sfc_grid_latlon.nc` 처리 방식

서버 시작 시 1회 로드하여 메모리에 보관. 런타임마다 재파싱하지 않음.  
Node.js에서 NetCDF 파싱이 불가한 환경(빌드 실패 등)이면 **사전에 JSON으로 변환하는 별도 스크립트**를 준비하여 정적 파일로 배포. *(→ §8 사전 확인 필요 항목 참조)*

### 2-2. 운고 (Ceiling)

두 소스를 합산하여 IDW 보간.

| 소스 | 지점 수 | API / 방법 | 항목 | 단위 |
|------|---------|------------|------|------|
| AMOS (공항 METAR) | 15개 | 기존 METAR 파싱 결과 재활용 | BKN/OVC 최저 운저 | ft |
| ASOS (종관기상관측) | 96개 | `kma_sfctm2.php?tm=…&stn=0&authKey={auth_key}` | `CH_MIN` | 100m → ft 변환 |
| **합계** | **~111개** | | | ft 통일 |

#### 변환 공식
```
ASOS CH_MIN (단위: 100m) → ft
  ceiling_ft = CH_MIN × 100 × 3.281
```

#### IDW 보간
- 방법: Inverse Distance Weighting (power = 2)
- 출력 해상도: **512×512** (2049×2049 전체 사용 시 ~23억 연산 → Node.js 메인 스레드 수십 초 블로킹)
  - 셀 크기 약 2km × 2.2km — 지점 평균 간격(~30km)과 GK2A CTH 해상도(2km)에 적합
  - flight category 계산 전 시정 격자(2049×2049)에 맞춰 bilinear 업스케일

### 2-3. 위성 운고 마스킹

| 항목 | 내용 |
|------|------|
| 소스 | GK2A Level 2 — CTH (Cloud Top Height) |
| 엔드포인트 | `https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2/CTH/…` |
| 인증 | `auth_key` (기존 동일) |
| 원본 해상도 | 2km (한반도 영역) |
| 재투영 | 위성 투영계 → 위경도(EPSG:4326) 후 시정 격자에 bilinear 리샘플링 |
| 로직 | 픽셀 CTH = 0 또는 no-data → 해당 격자 **ceiling = CLEAR (무제한)** |
| 효과 | 구름 없는 구역에서 IDW 보간 오류로 인한 IFR 오판 방지 |

---

## 3. Flight Category 결정 기준

시정과 운고 각각의 카테고리를 산출한 후 **worst case** (더 나쁜 쪽) 기준으로 최종 카테고리 결정.

MVFR 카테고리는 사용하지 않음. 3단계로 단순화.

| Category | 시정 | 운고 |
|----------|------|------|
| **VFR** | ≥ 5,000m | ≥ 1,500ft |
| **IFR** | 800m ~ 5,000m | 500 ~ 1,500ft |
| **LIFR** | < 800m | < 500ft |

```
final_category = worst(visibility_category, ceiling_category)
```

오버레이 전용 분류 함수(`classifyFlightCategory`)를 신규 작성. 기존 `helpers.js`의 `getFlightCategory()`는 수정하지 않음.

### 색상

기존 앱 `AIRPORT_CATEGORY_COLORS` 동일 적용.

| Category | 색상 |
|----------|------|
| VFR | `#15803d` |
| IFR | `#f97316` |
| LIFR | `#dc2626` |

---

## 4. 백엔드 처리 흐름

```
[1] 시정 격자 수신
    nph-sfc_obs_nc_api?obs=vs → 2049×2049 float 배열 (단위: 10m)
    ASCII 파싱 후 ÷10 → m 단위
    sfc_grid_latlon.nc (메모리 캐시)로 격자 인덱스 → 위경도 변환

[2] 운고 지점 수집
    AMOS 15개 (METAR ceiling_ft) +
    ASOS  96개 (CH_MIN → ft 변환)
    → IDW 보간 (512×512) → bilinear 업스케일 → 2049×2049 float 배열 (단위: ft)

[3] 위성 마스킹
    GK2A CTH (2km 격자) → 위경도 재투영 → 시정 격자 해상도 리샘플링
    CTH = 0 또는 no-data → ceiling = Infinity

[4] Flight category 계산
    for each pixel (i, j):
      vis_cat  = classifyVis(visibility[i][j])
      ceil_cat = classifyCeil(ceiling[i][j])
      category[i][j] = worst(vis_cat, ceil_cat)

[5] 폴리곤 생성 (Marching Squares)
    같은 category 인접 픽셀의 경계를 따라 폴리곤 생성 (d3-contour 또는 직접 구현)
    → @turf/simplify로 꼭짓점 수 축소 (tolerance 값은 실측 후 결정)
    → GeoJSON FeatureCollection
      { type: "Feature",
        properties: { category: "IFR", color: "#f97316" },
        geometry: { type: "Polygon", ... } }

[6] 캐시 및 제공
    결과 GeoJSON을 메모리에 캐시 (기존 store.js 패턴 활용, TYPES에 flight_category_overlay 추가)
    실패 시 → 이전 캐시 결과 반환 (없으면 빈 FeatureCollection)
    GET /api/weather/flight-category-overlay → GeoJSON 응답
    응답 헤더에 Last-Modified 포함 → 프론트에서 변경 여부 확인 가능
```

---

## 5. 업데이트 주기

| 항목 | 내용 |
|------|------|
| 주기 | 1시간 (ASOS 관측 주기 기준) |
| 실행 시각 | 매 정각 + 5분 (예: 14:05, 15:05) — 관측 지연 여유 |
| 스케줄러 | 기존 백엔드 `node-cron` 활용 |

---

## 6. 프론트엔드

### 레이어 구성

| 항목 | 내용 |
|------|------|
| Mapbox layer type | `fill` |
| `fill-opacity` | `0.35` |
| `fill-color` | `["get", "color"]` (GeoJSON properties에서 읽음) |
| 레이어 순서 | 레이더/위성 오버레이 위, 공항 마커 아래 |

### 토글

기존 레이어 패널에 **"비행기상구역"** 항목 추가. 다른 오버레이(레이더, 위성 등)와 동일한 방식으로 켜고 끔.

### 데이터 갱신

백엔드 갱신 주기(1시간)와 프론트 폴링 주기(60초)가 다르므로, 응답의 `Last-Modified` 헤더를 확인하여 변경된 경우에만 레이어를 업데이트. 불필요한 GeoJSON 파싱/렌더링 방지.

### 에러 처리

API 실패 시 → 레이어 숨김 처리 (기존 데이터 잔존 없음). 별도 에러 뱃지 표시 없음.

---

## 7. 신규 추가 파일 목록 (예상)

```
backend/src/processors/flight-category-processor.js  — 전체 처리 로직 (classifyFlightCategory 포함)
backend/src/parsers/sfc-grid-parser.js               — ASCII 격자 파싱 + sfc_grid_latlon.nc 로딩
backend/src/lib/idw.js                               — IDW 보간 (512×512)
backend/src/lib/marching-squares.js                  — 폴리곤 생성 + turf simplify
frontend/src/features/map/layers/FlightCategoryLayer.jsx
```

수정 파일:
```
backend/src/store.js                                 — TYPES에 flight_category_overlay 추가
```

---

## 8. 의존성 / 사전 확인 필요 항목

| 항목 | 내용 | 상태 |
|------|------|------|
| `auth_key`로 ASOS `kma_sfctm2.php` 호출 가능 여부 및 `CH_MIN` 필드 실존 | API허브 서비스별 활용신청 필요할 수 있음. 단위(100m)도 실응답으로 검증 | ❓ 확인 필요 |
| GK2A LE2/CTH 엔드포인트 URL 및 파라미터 | 기존 `LE2/FOG` 패턴 참고. 바이너리/ASCII 여부 확인 | ❓ 확인 필요 |
| `sfc_grid_latlon.nc` 파싱 환경 | 배포 환경에서 `netcdf4` 네이티브 빌드 가능한지 확인. 불가 시 사전 JSON 변환 스크립트 준비 | ❓ 확인 필요 |
| Marching Squares 라이브러리 | `d3-contour` (GeoJSON 변환 추가 필요) 또는 직접 구현 | ❓ 결정 필요 |
| IDW 성능 실측 | 512×512 해상도로 Node.js 단독 실행 시 소요 시간 측정. 3초 초과 시 Worker thread 도입 | ❓ 벤치마크 필요 |
| GeoJSON 크기 실측 | 256×256 또는 512×512에서 Marching Squares 실행 후 꼭짓점 수 / 바이트 측정. simplify tolerance 결정 기준 | ❓ 실측 필요 |
