# 고도별 기상 비교 (Altitude Weather Comparison) 설계 스펙

- 상태: **설계 초안. 미구현.**
- 작성일: 2026-07-15
- 개정: 2026-07-16
- 목적: 조종사가 입력하거나 비행계획에서 가져온 계획 순항고도를 중심으로, 동일 경로에서 공표 제약을 만족하는 인접 고도의 기상 조건을 비교한다.
- 범위 원칙: ProjectAMO는 기상 의사결정 지원 플랫폼이다. 항공기 성능, 연료, 실제 예상비행시간, 운항 가능성 또는 최적 고도를 계산·보증하지 않는다.

## 1. 문제

현재 사용자는 `useRouteBriefing.js`의 `cruiseAltitudeFt`에 하나의 순항 고도를 입력하고, 그 고도 기준의 브리핑만 본다. 다른 고도에서 만날 바람·착빙·난기류·SIGMET/AIRMET의 차이를 비교하려면 고도를 바꿔 여러 번 다시 조회해야 한다.

이 기능은 고도를 추천하거나 장거리·단거리 경로에 맞는 시작 고도를 추정하지 않는다. 항공기 성능·중량·운항 정책 없이 앱이 시작 고도를 정하면 기상 정보 제공 범위를 넘어선다. 계획고도는 조종사 또는 가져온 비행계획이 제공하고, ProjectAMO는 그 주변의 공표상 비교 가능한 고도에 대한 기상 결과를 보여 준다.

## 2. 기존 데이터와 선행 데이터

`loadRouteCrossSection`(`backend/src/briefing/enroute-cross-section.js`)은 KIM pressure level의 `u`/`v`/`T`/`icingGrade`와 KTG 난기류 고도층을 경로 축을 따라 반환한다. 고도별 기상 요약은 이 단면을 재사용한다.

SIGMET/AIRMET은 기존 `hazard-section.js`와 `hazard-matcher.js`의 수평·수직·시간 매칭을 고도별로 적용한다. 기존 NOTAM 수집·저장 파이프라인은 새로 만들지 않고, 생성된 후보와 경로·고도·시간을 교차하는 단계에 연결한다.

후보 고도를 공표 제약으로 생성하려면 다음 대한민국 AIP 데이터를 먼저 구간 단위로 정규화해 저장해야 한다. 이 스펙의 기상 비교 API는 그 정규화된 데이터를 소비하며, AIP HTML/PDF 파서·갱신 작업 자체의 상세 구현은 별도 데이터 수집 작업으로 다룬다.

| AIP 자료 | 필요한 내용 | 사용처 |
| --- | --- | --- |
| ENR 3.1 ATS Routes | 항공로 구간, `Minimum flight altitude`, 상·하한, 방향별 `FL series`, 주석 | IFR ATS 항공로 후보 생성 |
| ENR 3.3 RNAV Routes | 위와 같은 구간별 제약 | RNAV 항공로 후보 생성 |
| ENR 1.7 | 전환고도/전환레벨, 고도 표기 규칙 | ft/FL 표기와 제약 해석 |
| ENR 4.4 | significant point 식별자와 좌표 | 현재 경로와 AIP 구간 매칭 |
| AIP Amendment/AIRAC Amendment/Supplement | 발효·폐기 변경분 | AIP 제약의 최신성 유지 |

정규화 레코드는 항공로 전체가 아니라 `fromFix → toFix` 구간 단위여야 하며, 원본 AIP cycle, 발효 시각, 원본 링크/페이지, 원문 값을 함께 보존한다.

```text
route: Y711
fromFix: ABC
toFix: DEF
direction: forward
minimumFlightAltitudeFt: 21000
lowerLimitFt: 20000
upperLimitFt: 46000
cruisingLevelSeriesFt: [21000, 23000, 25000, ...]
effectiveFrom: ...
airacCycle: ...
source: AIP ENR 3.1 ...
```

### 제외 범위

- 최적/권장 고도, 점수·순위, 순풍 최대화
- ETE/ETA, 연료, TAS/GS, 상승·하강·step climb 계산
- 항공기 성능·중량·산소·운항규정 검증
- 지형 DEM 또는 e-TOD 장애물 자료로 IFR 항공로 순항 하한을 재산정하는 기능
- 자동 우회 경로 생성
- SID/STAR/IAP 제한으로 순항 후보 간격을 생성하는 기능

SID/STAR/IAP의 고도·속도 제한은 출발·도착 절차의 별도 제약이다. 순항 후보의 상·하한 또는 간격에 섞지 않고, 선택 고도와 함께 `절차 제약 확인 필요`로 표시할 수 있다.

## 3. 사용자 흐름

```text
출발지·도착지·항로·절차 확정
→ ETD/ETA 입력 또는 확인
→ 계획 순항고도 입력 또는 비행계획에서 가져오기
→ [고도별 기상 비교] 열기
→ 입력 고도 주변의 공표상 유효 고도와 기상 조건 비교
→ 사용자가 계획 고도를 유지·변경
→ 선택 고도 기준으로 상세 기상 브리핑 생성
```

계획고도가 없으면 앱은 경로 길이·출발지·도착지로 중심 고도를 추정하거나 후보를 추천하지 않는다. 사용자는 계획 순항고도 하나 또는 비교할 고도 범위를 입력해야 한다.

고도 행을 선택하는 것은 `cruiseAltitudeFt`를 갱신하고 "이 고도로 기상 브리핑 보기"를 실행하는 동작이다. `권장 고도 적용`이나 운항 가능 판정으로 표현하지 않는다.

## 4. 후보 고도 모델

### 4-A. AIP 제약으로 유효 범위 산정

경로에서 실제 순항으로 사용하는 AIP 항공로 구간을 식별한다. 경로 전체의 비교 하한과 상한은 다음과 같이 계산한다.

```text
routeFloorFt = max(각 구간의 공표 Minimum Flight Altitude)
routeCeilingFt = min(각 구간의 공표 Upper limit)
```

- 값이 없는 구간은 값을 추정해 넣지 않는다. 필요한 제약 데이터가 없으면 `AIP 고도 제약 데이터 없음`으로 표시한다.
- 모든 구간의 `cruisingLevelSeries`와 진행 방향이 일치할 때만 자동 후보를 생성한다.
- 구간별 계열이 충돌하거나 방향/주석을 기계적으로 해석할 수 없으면 자동 후보 생성은 중단하고, 사용자가 입력한 고도만 기상 비교 대상으로 유지한다. `경로 구간별 고도 계열 확인 필요`를 표시한다.
- 후보의 유효성은 하한·상한뿐 아니라 경로를 이루는 모든 구간의 공표 계열에 대해 검사한다. 어느 한 구간에서라도 유효하지 않으면 후보에서 제외한다.
- KIM이 해당 고도 또는 필요한 인접 압력면을 제공하지 않으면 후보를 유효 기상 비교 행으로 만들지 않고 데이터 상태를 표시한다.

`Lower limit`의 의미와 `Minimum Flight Altitude`의 관계는 AIP 원문별로 보존한다. 자동 필터에는 검증된 `Minimum Flight Altitude`를 우선 사용하고, `Lower limit`은 항공로 데이터 모델에서 별도 보존한다. 의미 검증 전에는 두 값을 임의로 합산하거나 대체하지 않는다.

### 4-B. 입력 고도 주변 후보

기준은 사용자가 입력했거나 비행계획에서 가져온 `plannedCruiseAltitudeFt`다. 기준 고도와 동일한 경로 제약·방향 계열에서 가장 가까운 유효 고도를 아래 최대 2개, 위 최대 2개까지 가져온다. 기본 비교 목록은 최대 5개다.

```text
입력: FL250
경로 전체 유효 계열: FL210 · FL230 · FL250 · FL270 · FL290 · ...
표시: FL210 · FL230 · [FL250] · FL270 · FL290
```

입력 고도가 하한 미만·상한 초과·계열 불일치이면 입력값을 조용히 삭제하지 않는다. 입력 행에는 제외 사유를 표시하고, 대체 비교 후보만 유효 범위에서 제시한다.

```text
입력 FL190 — 경로 공표 하한 FL210 미만
비교 가능: FL210 · FL230 · FL250 · FL270 · FL290
```

후보 간격은 임의의 1,000 ft 또는 2,000 ft가 아니다. 해당 AIP 항공로 구간과 진행 방향에 공표된 `FL series`를 사용한다. SID/STAR/IAP나 일반적인 VFR/IFR 반원고도 규칙으로 간격을 보완하거나 추정하지 않는다.

### 4-C. NOTAM 교차

기존 NOTAM 데이터로 각 AIP 후보와 경로·수직 범위·유효 시간을 교차한다.

- 고도·경로·시간에서 명확히 운항을 불가하게 만드는 NOTAM만 후보 제외 사유가 될 수 있다.
- 그 밖의 관련 NOTAM은 후보를 제거하지 않고 `NOTAM 영향 있음`과 근거를 표시한다.
- NOTAM의 유효 시간이나 수직 범위를 판정할 수 없으면 `NOTAM 판정 불가`로 표시하며, 영향 없음으로 취급하지 않는다.

## 5. 고도별 기상 비교 모델

### 5-A. API: `POST /api/briefing/altitudes`

기존 cross-section 로더와 정규화된 AIP 항공로 제약을 재사용하는 고도별 기상 비교 API다.

```js
// 요청
{
  routeGeometry,
  routeSegments,             // 식별된 순항 AIP 구간
  plannedCruiseAltitudeFt,
  etd,
  eta,
  tmfc?,
  hf?
}

// 응답
{
  available: true,
  totalDistanceNm,
  run: { tmfc, hf, validTime },
  constraints: {
    status: 'matched' | 'unavailable' | 'conflicting',
    routeFloorFt,
    routeCeilingFt,
    sourceCycles: [],
    reasons: []
  },
  rows: [{
    altFt,
    fl,
    candidateStatus: 'valid' | 'input_invalid' | 'weather_unavailable',
    reasons: [],
    weatherLevel: {
      mode: 'exact' | 'interpolated' | 'unavailable',
      lowerAltFt,
      upperAltFt
    },
    wind: {
      meanComponentKt,
      minComponentKt,
      maxComponentKt
    } | null,
    tempC,
    icing: { peakLevel, exposures: [{ level, distanceNm }] },
    turbulence: { peakLevel, exposures: [{ level, distanceNm }] },
    hazards: [{ code, label, encounter: 'on' | 'nearby', routeDistanceNm }],
    notams: [{ id, summary, effect: 'exclude' | 'warn' | 'undetermined' }],
    timeStatus: 'matched' | 'not_provided' | 'unavailable',
    available: true | false
  }]
}
```

`recommended` 필드와 추천 알고리즘은 반환하지 않는다.

### 5-B. KIM 고도 매핑과 바람 집계

후보의 운영 고도는 AIP `FL series`로 정한다. 해당 고도에 정확한 KIM pressure level이 있으면 그 값을 쓰고, 그렇지 않으면 인접한 실제 KIM pressure level 두 개 사이를 수직 보간한다. 보간한 행은 `KIM FLxxx–FLyyy 보간`으로 명시하며, 양쪽 레벨이 없으면 `weather_unavailable`로 표시한다.

각 route-axis 표본에서 해당 고도의 `u`/`v`를 표본 진행방위에 투영해 순풍 성분을 구한다.

```text
tailwindKt = (u × sin(track) + v × cos(track)) × 1.94384
```

`meanComponentKt`는 표본 간 경로 거리로 가중한 평균이다. 풍향·풍속을 단순 평균하지 않는다. 표본 사이의 국지적인 강한 맞바람 또는 순풍을 숨기지 않도록 `minComponentKt`와 `maxComponentKt`도 함께 제공한다.

```text
평균 순풍 +12kt
범위: 맞바람 7kt ~ 순풍 28kt
```

### 5-C. 착빙·난기류 집계

착빙과 난기류는 최고 등급 하나로만 표시하지 않는다. 각 고도에서 인접 표본을 연속 구간으로 묶고, 등급별 경로 노출 거리를 합산한다. 행 요약은 `최고 등급 + 등급별 노출 거리`다.

```text
착빙 보통 18NM · 강함 2NM
난기류 없음
```

결측 구간은 `없음`으로 합산하지 않으며, 행의 `available: false` 또는 데이터 상태로 드러낸다.

### 5-D. SIGMET/AIRMET 매칭

행의 `hazards`에는 다음 세 조건이 모두 맞는 위험만 `encounter: 'on'`으로 넣는다.

1. 경로 축과 위험 도형이 수평으로 교차한다.
2. 비교 고도가 위험의 고도/FL 범위와 수직으로 겹친다.
3. 계획 시간축이 위험 유효 시간과 겹친다.

ETD/ETA가 없으면 수평·수직 교차는 계산하되 `timeStatus: 'not_provided'`으로 표기한다. 이 상태에서 위험을 `없음`으로 표현하지 않는다. 공항 범위 경보처럼 `routeIntervalNm`이 없는 항목은 고도별 경로 교차 목록에 넣지 않고 기존 공항 경보 표면에서 다룬다.

### 5-E. 백엔드 순수 모듈

`backend/src/briefing/altitude-weather-comparison.js`를 추가한다.

```text
buildAltitudeCandidates({ routeSegments, plannedCruiseAltitudeFt, crossSection }) -> constraints, candidates
buildAltitudeWeatherComparison({ candidates, crossSection, axis, hazards, notams, etd, eta }) -> rows
```

- 후보 생성은 AIP 제약을 담당하고, 기상 비교는 후보에 대해서만 수행한다.
- SIGMET/AIRMET의 수평·시간 매칭 결과는 고도별로 재사용하고, 수직 매칭만 후보 고도마다 적용한다.
- 점수화, 추천, ETE/연료 계산을 추가하지 않는다.

## 6. 프런트엔드

`frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx`를 `RouteBriefingPanel`의 계획 고도 입력 옆에서 연다.

계획 고도 입력과 후보 행에는 다음 정보를 표시한다.

```text
계획고도: FL250
공표 비교 범위: FL210–FL390 (AIP 2026-08)

FL230
평균 순풍 +8kt · 범위 맞바람 4kt ~ 순풍 19kt
착빙 보통 18NM · 난기류 없음
SIGMET 1건 경로 교차
```

- 순풍/맞바람은 색상뿐 아니라 `순풍`/`맞바람` 텍스트와 부호를 함께 보인다.
- 착빙·난기류는 최고 등급과 노출 거리를 함께 보인다.
- `시간 판정 불가`, `자료 없음`, `AIP 제약 데이터 없음`, `NOTAM 판정 불가`는 위험 없음과 시각적으로 구분한다.
- 입력 고도와 후보 제외 사유를 명확히 보여 준다. 유효 후보 행 선택은 해당 `cruiseAltitudeFt`를 적용하고 기존 브리핑을 갱신한다.
- 표 하단에는 다음 한 줄을 항상 표시한다: `공표 항공로 제약을 기준으로 한 기상 비교 정보이며, 관제 허가·항공기 성능·연료·운항 제한을 결정하지 않습니다.`

## 7. 검증

`backend/test/altitude-weather-comparison.test.js`에 다음을 둔다.

| 입력 | 기대 |
| --- | --- |
| 구간 하한 FL180, FL210 | `routeFloorFt === FL210` |
| 구간 상한 FL460, FL390 | `routeCeilingFt === FL390` |
| 기준 FL250, 유효 계열 FL210·230·250·270·290 | 아래·위 최대 2개씩 포함한 5개 후보 |
| 기준 FL190, 경로 하한 FL210 | 입력 행은 `input_invalid`, 대체 후보는 FL210 이상 |
| 한 구간에서 후보 FL270 불허 | FL270은 후보에서 제외 |
| 구간별 계열 또는 방향이 충돌 | 자동 후보 생성 중단, `constraints.status === 'conflicting'` |
| KIM 인접 두 압력면만 존재 | `weatherLevel.mode === 'interpolated'`와 양쪽 레벨 표기 |
| 동풍(`u>0`, `v=0`), 경로 진행방위 090° | `meanComponentKt > 0`, 화면은 순풍으로 표시 |
| 거리가 다른 표본의 순풍 성분 | 단순 산술 평균이 아닌 거리 가중 평균 |
| 짧은 강한 착빙 2NM와 보통 착빙 18NM | 최고 등급과 두 노출 거리가 모두 반환 |
| 위험 도형·고도 범위·유효 시간이 모두 겹침 | `hazards`에 `encounter: 'on'`으로 반환 |
| 고도·경로·시간에서 명확히 금지하는 NOTAM | 후보 제외 사유로 반환 |
| 수평·수직은 겹치나 ETD/ETA 없음 | 교차 후보는 남기고 `timeStatus: 'not_provided'` |
| 고도 행 선택 | `cruiseAltitudeFt` 갱신 후 기존 브리핑의 위험구간이 선택 고도 기준으로 변경 |

## 8. 완료 기준

- 조종사는 계획 순항고도를 중심으로, 경로 전체에 유효한 공표 항공로 고도 계열의 기상 차이를 한 화면에서 비교할 수 있다.
- 하한 미만·상한 초과·구간 불일치·명확한 NOTAM 제한 후보는 근거와 함께 제외된다.
- AIP 제약 데이터, KIM 고도 보간, 위험·NOTAM·시간 판정 불가 상태가 `없음`과 혼동되지 않는다.
- 어떤 행도 최적/권장 고도, 예상비행시간, 연료 또는 운항 가능성을 주장하지 않는다.
- 선택한 고도는 기존 상세 브리핑의 고도 기준으로만 사용된다.
