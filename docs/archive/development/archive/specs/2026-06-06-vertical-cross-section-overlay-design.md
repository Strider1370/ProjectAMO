# 비행경로 연직단면도 기상 중첩 (Vertical Cross-Section Weather Overlay)

- 날짜: 2026-06-06
- 상태: 설계 승인 (spec-reviewer + Codex 지적 반영, 라이브 프로브로 층/hgt 확장 확정, 음영 상호배타 자동 off 확정)
- 관련 기능: route-briefing 연직단면도, weather-overlays KIM NWP

## 1. 개요 / 목적

기존 비행경로 연직단면도(`VerticalProfileChart`, 지형 + 계획고도 프로파일)에 KIM NWP
기상 변수 4종(TEMP, Moisture, Icing, Wind)을 **연직으로 중첩**해, 경로상 어느 거리·고도에서
어떤 기상 위험이 있는지 한 화면에서 읽도록 한다.

표현 방식은 항공 단면도 표준인 **등치선(컨투어) 조합**:
- **ICING / MOISTURE**: 음영(shading) — 둘은 상호배타 토글(하나 켜면 다른 하나 자동 off)
- **TEMP**: 등온선(isotherm) — 항상 중첩 가능
- **WIND**: 바브(barb) — 항상 중첩 가능

4개 모두 독립 토글. 음영 충돌만 가드한다.

## 2. 가능성 판단 (검토 결과)

가능하다. 근거는 KIM NWP 데이터가 이미 **다중 기압면(3D) 구조**이며, upstream(KMA API HUB)이
전 범위 기압면을 제공한다는 점.

**라이브 프로브 결과(2026-06-06, run 2026060606, hf=0):** `nph-kim_nc_xy_txt2`에 타깃 호출한
모든 변수×층이 데이터를 반환했다. 현재 코드의 제한된 층 세트는 **데이터 한계가 아니라 의도적인
호출량 절감**이었다(2026-05-18 outline §데이터 크기 참조).

| 변수 | 프로브로 확인된 가용 층 | upstream 변수명 |
|---|---|---|
| TEMP (T) | 1000,925,850,800,700,600,500,450,400,350,300,250,200,150,100 hPa | `T` (data=P), `t2m`(10m) |
| Wind (u/v) | 전 기압면 + 250/200 상위 확인 | `u`,`v` / `u10m`,`v10m` |
| **hgt (지위고도)** | 500,250 확인 (전 층 제공) | `hgt` — **고도축 변환용** |
| Moisture (rh) | 925~250 전 범위(600/400/300/250 확인) | `rh` |
| Icing 변수군 | 300/400 등 상위 확인 | `w,rh_liq,tqc,tqi,tqr,tqs,cld` |

→ 250hPa≈FL340, 200hPa≈FL386, 150hPa≈FL446. **FL300+ 제트기 순항고도까지 데이터 존재.**

연직단면도는 이미 경로상 각 점의 `lon/lat`(`axis.samples`)을 가진다. 따라서
(경로 거리 × 기압면) 격자마다 grid 값을 샘플해 단면을 합성할 수 있다.

**샘플러 현황(정확히):** 프론트에 TEMP(`temperatureField.js`)·WIND(`windField.js`)·
ICING(`icingPotentialField.js`)은 `lon/lat → 값` 샘플러가 있으나, **Moisture(`cloudPotentialField.js`)는
decode/color 헬퍼만 있고 샘플러가 없다.** 본 기능의 백엔드 단면 샘플러는 프론트 샘플러를 재사용하지
않고(아키텍처 경계상 backend가 frontend를 import 못 함) 백엔드에서 grid 배열을 직접 샘플한다(§4 참조).

**데이터 수집:** 기본 버전에 신규 upstream 수집은 불필요하나, 이는 **canonical store
(`DATA_PATH/kim_nwp/`)의 index availability에 해당 변수가 존재할 때**로 한정한다. Icing은
`KIM_NWP_COLLECT_ICING` 설정으로 꺼질 수 있고 partial run도 가능하므로, 엔드포인트는 index를
기준으로 변수별 결측/비활성을 `coverage`에 담아 반환한다(§3).

### 2.1 목표 층 세트 (변수별 차등) + hgt

데이터는 전 범위 가용이나, 수집 비용(호출/저장/수집시간 = 층수 × 변수 × 예보시간 13)을 고려해
**변수별 차등 세트**로 확장한다. Icing은 변수 7개라 가장 비싸고, 의미 있는 착빙대(~ -20~0°C,
대략 850~300hPa)에 집중하면 되므로 상단을 제한하는 것이 비용·기상 양면에서 합리적이다.

| 변수군 | v1 목표 층 세트 | 비고 |
|---|---|---|
| Wind(u/v) + TEMP(T) + **hgt** | 10m, 1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150 | 지표~FL446, 여객기 실링 커버 |
| Moisture(rh) | 925, 850, 700, 600, 500, 400, 300 | 현재 4 → 7층 |
| Icing(7변수) | 925, 850, 700, 600, 500, 400, 300 | 현재 6 → 7층(상단 300 제한) |

상단 근거: 민간 여객기 순항 FL310~410, 실링 ~FL410-430. 200hPa(FL386)는 고고도 순항/실링을
놓치므로 **150hPa(~FL446)** 로 잡아 전 여객기 + 대부분 비즈제트를 커버. 100hPa(FL530)은 제외.

- **hgt 추가:** 각 기압면의 실제 지위고도를 수집해 **기압→고도(ft) 변환을 정확히** 한다.
  표준대기 근사는 hgt 결측 시 fallback으로만 사용.
- 위 세트는 `config`/level 상수로 둬 조정 가능하게 한다. 정확한 hPa 목록은 구현 시 확정.

### 알려진 제약 (잔존)
1. 연직 해상도는 층수에 비례. 확장 후에도 층 사이 채움엔 격자 보간이 쓰이나 아티팩트는 미미.
2. **변수별 상단 차등은 유지**(Moisture/Icing 300hPa, Wind/Temp/hgt 150hPa). 단면 상단이 변수별로
   다르게 비며, 이는 데이터 한계가 아닌 의도적 비용 결정. `coverage`로 명시(§3), 렌더에서 구분(§5.1).
3. 층 확장은 **수집 부하 증가**를 수반(§4.1). 기존 지도 KIM 레이어도 더 많은 층을 갖게 됨(이득).

## 3. 데이터 흐름 (백엔드 단면 합성)

기존 `backend/src/briefing/vertical-profile.js`가 서버에서 합성하는 패턴과 동일하게,
경로 샘플링을 서버에서 수행하고 **압축된 (거리 × 레벨) 행렬**만 프론트로 반환한다.
프론트가 전국 grid를 레벨×변수만큼(~25회) 받는 방식은 채택하지 않는다.

```
RouteBriefingPanel → useRouteBriefing → briefingApi
  → backend: POST /api/briefing/cross-section
     → cross-section-sampler.js
        - axis.samples(lon/lat, distanceNm) 빌드/재사용
        - 각 기압면 grid에서 변수 샘플 (백엔드 grid 직접 샘플 — §4)
        - 반환 응답 스키마 ↓
  → VerticalProfileChart.jsx 가 단면 레이어 렌더
```

**엔드포인트 확정:** `POST /api/briefing/cross-section` **단일 라우트로 확정**한다.
기존 vertical-profile 응답에 합성하는 대안은 채택하지 않는다(혼선 제거).

**요청 스키마(필수):**
```
{ tmfc: string,        // 필수 — KIM run 식별
  hf: number,          // 필수 — forecast hour
  routeGeometry: GeoJSON LineString,  // 필수
  sampleSpacingMeters?: number }      // 선택, 기본 250
```
v1 프론트는 `tmfc/hf`를 자동 선택(최신 run·현재시각 근접)해 채운다. 슬라이더 확장 시 이 두 값만 교체.

**응답 스키마:**
```
{ run: { tmfc, hf, validTime },
  levels: [ { pressure, altFt,
              values: [ { distanceNm, t, moistureSpread, cloudPotential, icing, u, v } ] } ],
  coverage: { byVariable: { T:{topPressure, available:bool},
                            moisture:{topPressure, available},
                            icing:{topPressure, available, disabledByConfig:bool},
                            wind:{topPressure, available} } },
  warnings: [] }
```
결측 셀 값은 `null`. `coverage`는 index availability 기준으로 변수별 결측/비활성/상단 한계를 알린다.

## 4. 백엔드 설계

- 신규: `backend/src/briefing/cross-section-sampler.js`
  - 입력: `axis`(기존 build 결과), 선택된 `tmfc/hf`.
  - 출력: §3 응답의 `levels[]` 행렬 + `coverage`. 결측은 `null`.
- 라우트: `backend/server.js`에 `POST /api/briefing/cross-section` 추가(확정).
- **KIM grid 접근 — 경계 확정:** server.js 로컬 함수(`readSelectedKim*Field`)에 의존하지 않는다
  (대부분 export되지 않은 내부 함수). 대신 store/model의 export를 직접 사용한다:
  - `kim-nwp-store.js`: `readKimNwpGrid` / `readKimNwpGridSafe` / `readKimNwpIndex`로 (tmfc,hf,level) grid 로드.
  - `kim-nwp-model.js`: `buildKimTemperatureFieldFromGrid` / `buildKimCloudPotentialFieldFromGrid` /
    `buildKimIcingFieldFromGrid` / `buildKimSurfaceWindFieldFromWindGrid`로 grid → 디코드된 field 변환.
  - 변환된 field 배열을 grid 인덱싱(`y*nx+x`)으로 직접 샘플(프론트 샘플러 미사용).
- **공통 샘플 로직 위치(선호안):** grid 인덱스 → 최근접 샘플 로직은 `cross-section-sampler.js` 내부
  헬퍼로 둔다(backend 전용). 루트 `shared/`로 빼지 않는다 — 프론트가 같은 로직을 필요로 하지 않기 때문.
  (frontend `shared/`는 프론트 전용이라 backend import 금지 — Architecture.md 규칙.)
- **Moisture 주의:** `cloudPotentialField.js`에는 샘플러가 없다. 백엔드는
  `buildKimCloudPotentialFieldFromGrid` 결과의 `spread`/`cloudPotential` 배열을 직접 샘플한다.

### 4.1 데이터 수집 확장 (선행/동반 작업)

단면을 위해 수집 층을 §2.1 세트로 확장하고 `hgt`를 추가한다. 이는 기존 수집 파이프라인 변경이다.

- `kim-nwp-model.js`: `KIM_NWP_LEVELS`에 1000/250/200 등 추가, `KIM_NWP_MOISTURE_LEVEL_IDS`·
  `KIM_NWP_ICING_LEVEL_IDS`를 §2.1 세트로 확장. `hgt`를 변수로 추가(레벨별 grid에 포함).
- `kim-surface-wind-processor.js`: 레벨 순회에 새 층 반영. `resolveKim*ComponentRequest`에 `hgt`
  요청(`data='P', name='hgt'`) 추가. `hasCompleteKimNwpRun` 완전성 기준도 새 세트로 갱신.
- `api-client.js`의 `buildKimGridUrl`은 `level` 파라미터화 완료 — 코드 변경 불필요.
- `config.js`: 비용 조절을 위해 변수별 층 세트를 env/config로 노출(선택).
- **예보시간 단일화(핵심 비용 절감):** `config.kim_nwp.forecast_hours`를 13개 전체에서 **단일
  최근접 미래 hf**로 줄인다(§7). 수집 호출이 13배 줄어 층 확장 비용을 상쇄하고도 남는다.
  - hf 선택: 최신 usable run의 `tmfc + hf` 중 now에 가장 가까운(약간 미래) 값. 정확한 규칙은 구현 시.
  - `kim-server-index`/snapshot-meta 등 hf 다중 가정 코드의 단일-hf 동작 회귀 확인.
- **비용 영향(순효과):** 층당 호출 = 바람 2 + T 1 + hgt 1 + rh 1 + icing 7. 층은 늘지만 hf가
  13→1이므로 run당 총 호출은 **현재보다 감소**. bounded concurrency·partial-run 재시도(기존) 유지.

### 4.2 지도 KIM 레이어 — 새 층 노출

수집 층 확장이 지도 overlay에도 반영되어야 한다(사용자 요구).
- **대부분 자동:** `getNwpSliderOptions`가 index `availability` 기반으로 `availableLevels`를 도출하므로,
  층이 늘면 지도 레벨 슬라이더가 자동으로 새 층을 노출한다.
- **확인 필요:** 프론트/백엔드에 **하드코딩된 레벨 목록·상한 캡**이 없는지 점검
  (`filterKimNwpIndexForMapVariables`, 레벨 라벨/색상 매핑, NwpSliderBar 렌더 한계 등).
  하드캡이 있으면 새 층 세트로 확장.
- 회귀: 기존 단일/소수 층에서 동작하던 지도 레이어가 다층에서도 정상 토글·렌더되는지 확인.

## 5. 프론트 렌더링 (`VerticalProfileChart.jsx` 확장)

- 동일 SVG, x=거리(NM)·y=고도(ft) 좌표계 유지. 지형/항로 프로파일 위에 단면 레이어를 깐다.
- **기압 → 고도(ft) 변환**: 수집한 **`hgt`(지위고도, m→ft)** 를 각 레벨의 실제 고도로 사용한다.
  hgt 결측 시에만 표준대기 근사로 fallback(925≈2,500 / 850≈5,000 / 700≈10,000 / 600≈13,800 /
  500≈18,300 / 400≈23,600 / 300≈30,000 / 250≈34,000 / 200≈38,600 / 150≈44,600 ft). 레벨 사이 선형 보간.
- 렌더 순서(아래→위): 지형 → 음영(ICING 또는 MOISTURE) → TEMP 등온선 → WIND 바브 → 항로 프로파일·마커.

### 5.1 변수별 렌더 규칙 (heatmap/raster로 흐르지 않도록 명시)

- **TEMP — 등온선(isotherm):**
  - 단면 격자(거리×고도, 레벨 사이 선형 보간)에서 marching-squares로 등치선 추출.
  - 간격 **5°C**(기본), 0°C 선은 굵게+강조(결빙고도 식별). 등온선마다 °C 라벨.
  - 색은 단색(예: 적색 계열) 선. `CELSIUS_TEMPERATURE_COLOR_RAMP`는 라벨/범례 참고용이며
    면(fill)으로 칠하지 않는다(음영은 ICING/MOISTURE 전용).
- **ICING / MOISTURE — 음영(밴드 fill), 상호배타:**
  - ICING: `icingPotentialField.js`의 등급 램프 밴드 경계로 셀 채색(등급 0/1/2/3 구간).
  - MOISTURE: `CLOUD_POTENTIAL_COLOR_RAMP` 밴드 경계로 cloudPotential(%) 채색.
  - 셀 = (인접 거리샘플 × 인접 레벨)로 만든 사각형. 레벨 사이는 값 보간 후 밴드 분류.
  - 동시에 하나만 렌더(상호배타 자동 off).
- **WIND — 바브(barb):**
  - 격자점 간격: 거리축 **~20NM**, 고도축은 각 기압면(레벨)마다 1개(과밀 방지 위해 화면폭 따라 thinning).
  - 단위 변환 **m/s → kt** (×1.943844). 바브 깃: 50kt 삼각, 10kt 긴 깃, 5kt 짧은 깃.
  - 방향: `u,v`로 풍향 계산(meteorological, "from" 방향). 풍속 0~2kt는 원(calm).
- **빈 상단 구간 처리:** 변수별 상단 한계(§2.1: Moisture/Icing 300hPa / TEMP·Wind·hgt 150hPa) 위
  영역은 채우지 않고 비워 둔다. 범례/주석에 "데이터 상한" 라인을 표기해 결측과 무위험을 구분.

## 6. 레이어 토글 UI

- `VerticalProfileWindow` 모달 안에 4개 토글: TEMP / MOISTURE / ICING / WIND.
- 음영 상호배타 가드: ICING ↔ MOISTURE 중 하나를 켜면 다른 하나 자동 off.
- 각 레이어 범례 표시. `RouteBriefing.css`에 스타일 추가.

## 7. 예보 시각 선택 (단일 valid time)

- **예보시간을 단일화한다.** 수집을 `forecast_hours` 전체(13개)에서 **가장 가까운 미래 1개**
  (valid time ≈ now+약 3h, 최신 usable run 기준)로 줄인다(§4.1). 비용 대폭 절감.
- 단면도·지도 모두 **단일 valid time**만 보여준다. **시각 슬라이더는 도입하지 않는다**(목표 폐기).
  - 지도: `getNwpSliderOptions`가 `showTimeSlider = availableTimes.length > 1`이라 시각 1개면
    시간 슬라이더가 자동으로 숨겨진다(코드 변경 불필요).
- 엔드포인트는 여전히 `tmfc/hf`를 받지만, 프론트가 단일 선택값을 자동으로 채운다.
- (후속 필요 시 `forecast_hours`를 다시 늘리면 슬라이더 도입이 가능하나 현 범위 밖.)

## 8. 범위 밖 (추후 과제)

- 예보시간 다중 수집 + 시각 슬라이더 재도입(필요 시 `forecast_hours` 재확장).
- 100hPa(FL530) 등 성층권 추가 확장 — 비즈제트 실링/특수 운용 필요 시에만.
- 1km KIM(l010) 등 고해상도 모델 전환.
- 난류가능역(turbulence) 단면.

(주: FL300+ 고고도 커버는 §2.1 층 확장으로 v1 범위에 포함됨 — 더 이상 추후 과제 아님.)

## 8.1 검토 반영 이력 (spec-reviewer + Codex 검토)

해소됨:
- 렌더 규칙 구체화(등온선 간격/라벨, 음영 밴드, 바브 간격·단위·방향) → §5.1.
- 샘플러 실재성 정정(Moisture 샘플러 없음, 백엔드 직접 샘플) → §2, §4.
- KIM grid 접근 경계 확정(store/model export 직접 사용, server.js 로컬 미의존) → §4.
- 엔드포인트 단일 확정(`POST /api/briefing/cross-section`, 요청/응답 스키마 고정) → §3.
- "수집 불필요"를 index availability 조건부로 한정 + `coverage` 반환 → §2, §3.
- 빈 상단 구간 시각 처리 정의 → §5.1.

라이브 프로브(2026-06-06) 반영:
- 전 변수 전 범위 가용 확인 → 층 한계는 비용 결정임을 명시(§2). FL300 천장 제약 제거.
- 변수별 차등 목표 층 세트 + hgt 고도축 결정(§2.1), 수집 확장 작업 추가(§4.1).
- 고도 변환을 hgt 기반으로 전환, 표준대기는 fallback(§5).
- Wind/Temp/hgt 상단 150hPa(~FL446) 확정(민간 실링 커버), 100hPa 제외.

예보시간 단일화 결정 반영:
- `forecast_hours` 13→단일 최근접 hf로 축소(§4.1, §7). 층 확장 비용 상쇄.
- 시각 슬라이더 목표 폐기 — 단일 valid time. 지도 시간 슬라이더는 자동 숨김(§7).
- 지도 KIM 레이어가 새 층 자동 노출(§4.2), 하드캡 점검 필요.

계획 단계로 이월:
- "정확한 거리·고도 렌더"를 구체적 검증 단언으로 변환(레벨→ft 매핑·hgt 기반 단위테스트) → §9.
- 공통 샘플 로직 위치는 backend 전용으로 선호 확정(§4), 구현 시 재확인.
- §2.1 정확한 hPa 목록과 변수별 세트 최종 확정(비용 측정 후) → 구현 초기.
- 수집 확장의 스케줄/타임아웃/저장 영향 측정 → §4.1.

## 9. 검증 기준

- 백엔드: `cross-section-sampler` 단위 테스트(레벨 샘플링, 결측 처리, 기압→고도 매핑).
  `backend/test/`에 추가. `node --test` 통과.
- 프론트: 단면 레이어가 지형/프로파일 위에 정확한 거리·고도에 렌더. 토글 동작.
  음영 상호배타 확인. 브라우저 스모크.
- UI 작업이므로 `docs/ui-responsive-guidelines.md` 준수 + 스크린샷 증거.
- 수집: 단일-hf 수집 후 index `times` 길이 1, `availability`에 새 층 포함 확인.
- 지도 회귀: 새 층이 레벨 슬라이더에 노출, 시간 슬라이더 자동 숨김, 기존 토글·렌더 정상.
- 회귀: 기존 vertical-profile(지형·계획고도) 동작 불변 확인.
