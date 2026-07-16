# 경로 구간 기상 브리핑 (NavLog-style Route Weather Briefing) 설계 스펙

- 상태: **설계 초안. 미구현.**
- 작성일: 2026-07-15
- 개정: 2026-07-16
- 목적: 정식 운항 NavLog를 재현하지 않고, NavLog의 레그 단위 형식을 빌려 선택한 계획고도에서 경로의 어느 구간에 어떤 기상 조건과 위험기상이 있는지 읽게 한다.
- 연계 스펙: `2026-07-15-altitude-advisor.md`에서 사용자가 계획고도와 AIP 제약을 만족하는 비교 후보를 확인·선택한 뒤 이 브리핑을 연다.

## 1. 문제

현재 원자료 표(`rawWindsModel.js`의 `buildRawWindsTable`)는 행이 고도층이고 열이 웨이포인트다. 이는 고도 비교에는 유용하지만, 선택한 고도에서 비행 경로를 따라 위험기상이 어디에 있는지 빠르게 읽기 어렵다.

조종사가 필요한 질문은 다음과 같다.

> 선택한 계획고도에서, 다음 웨이포인트까지 어떤 바람·기온·난류·착빙·경로 교차 위험이 있는가?

이 기능은 항공기 성능 기반 NavLog가 아니다. TAS·Ground Speed·풍향 보정 Heading·레그 시간·ETA·연료·step climb을 계산하지 않는다. 이 값들은 항공기 성능, 중량, 상승·하강 프로파일과 운항 정책이 있어야 정직하게 계산할 수 있다.

## 2. 기존 데이터와 범위

다음 데이터는 이미 경로 거리축(`distanceNm`)에 연결되어 있거나, 고도별 기상 비교에서 재사용할 수 있다.

- 경로 웨이포인트와 순서: `verticalProfile.markers` 및 route briefing 경로 데이터
- 각 구간의 거리·진방위(Course): 경로 지오메트리와 route-axis
- 선택 고도의 KIM 바람·기온: route cross-section
- 난류·착빙 구간: `enroute.elements[].intervals`
- SIGMET/AIRMET 수평·수직 교차: `hazard-section.js` 및 `hazard-matcher.js`
- 기존 수집 NOTAM의 경로·고도·시간 교차 결과
- 고도별 기상 비교가 반환하는 AIP 제약 상태와 선택 고도 상태

기상 구간표는 계획고도 하나만 받아 그 고도의 결과를 상세화한다. 여러 고도의 상대 비교와 후보 생성은 `altitude-advisor` 스펙의 책임이다.

### 제외 범위

- TAS, Ground Speed, wind-correction Heading
- 레그별 minutes, 누적/잔여 시간, ETA, 실제 구간 통과 시각 계산
- 연료 소모·잔량, 비용, 항공기 성능, step climb
- 항공기 운항 NavLog/OFP 생성 또는 인쇄물 대체
- SID/STAR/IAP의 상승·하강 기상 프로파일 계산
- 고도 추천·자동 우회 경로 생성

`Course`는 경로 형상에서 얻는 진방위이며 `Heading`이 아니다. 바람 때문에 필요한 기수 방향을 뜻하는 것으로 오독되지 않도록 표기한다.

## 3. 사용자 흐름

```text
출발지·도착지·항로·절차 확정
→ 계획 순항고도 입력 또는 비행계획에서 가져오기
→ [고도별 기상 비교]에서 공표상 유효한 고도들을 비교
→ 사용자가 계획고도 선택
→ [경로 구간 기상 브리핑]에서 선택 고도의 구간별 조건 확인
→ 기존 상세 브리핑과 지도에서 위험 구간 상세 확인
```

고도별 비교에서 AIP 제약을 확인하지 못했거나 구간 계열이 충돌하더라도, 사용자가 입력한 고도에 대한 기상 구간표는 표시할 수 있다. 이 경우 표 상단에 `공표 항공로 고도 제약 확인 불가` 또는 `경로 구간별 고도 계열 확인 필요`를 표시하며, 선택 고도가 유효하다는 뜻으로 해석되지 않게 한다.

## 4. 구간 모델

### 4-A. 대상 구간

표의 한 행은 연속한 두 순항 웨이포인트 사이의 레그다.

- 항공로 구간 ID와 일치하는 웨이포인트 경계를 우선 사용한다.
- AIP 항공로 데이터가 아직 매칭되지 않은 경로는 기존 경로 웨이포인트/marker 경계를 사용한다.
- 출발 SID, 도착 STAR, IAP의 절차 구간은 이 표의 기상 요약 대상에서 제외한다. 절차별 고도 제한과 기상은 기존 상세 브리핑·차트에서 별도로 다룬다.
- 모든 leg를 표시한다. 기존 `pickColumns`처럼 7개만 표본 추출하지 않으며, 많은 leg는 스크롤로 처리한다.

### 4-B. 행 데이터

```js
buildRouteWeatherLegs({
  enrouteMarkers,
  routeAxis,
  selectedCruiseAltitudeFt,
  crossSection,
  enroute,
  hazards,
  routeNotams,
  altitudeConstraints,
  etd,
  eta,
}) -> {
  legs: [{
    from,
    to,
    startNm,
    endNm,
    distanceNm,
    courseTrueDeg,
    selectedAltitudeFt,
    wind: {
      meanComponentKt,
      minComponentKt,
      maxComponentKt
    } | null,
    temp: {
      meanC,
      minC,
      maxC
    } | null,
    icing: { peakLevel, exposures: [{ level, distanceNm }] },
    turbulence: { peakLevel, exposures: [{ level, distanceNm }] },
    hazards: [{ code, label, routeDistanceNm }],
    notams: [{ id, summary, effect: 'warn' | 'undetermined' }],
    timeStatus: 'matched' | 'not_provided' | 'unavailable',
    altitudeConstraint: {
      status: 'matched' | 'unavailable' | 'conflicting',
      minimumFlightAltitudeFt,
      upperLimitFt,
      sourceCycle
    }
  }],
  totalDistanceNm,
  altitudeConstraintStatus
}
```

`minutes`, `totalMinutes`, `cruiseSpeedKt`, `groundSpeedKt`, `headingDeg`, `fuel`, `ETA`는 반환하지 않는다.

### 4-C. 구간 기상 집계

구간의 바람·기온은 중점 하나의 값이 아니라 leg에 포함된 route-axis 표본의 거리 가중 집계다.

- 바람은 진행방위에 투영한 평균 순풍/맞바람 성분과 구간 내 최소·최대 성분을 반환한다.
- 기온은 구간 평균과 최소·최대값을 반환한다.
- 착빙·난류는 구간에서의 최고 등급과 등급별 노출 거리를 반환한다.
- 데이터가 일부 또는 전부 결측이면 `없음`으로 바꾸지 않고 `자료 없음` 또는 결측 상태를 반환한다.

표시 예:

```text
평균 맞바람 8kt · 범위 맞바람 3–18kt
평균 -32°C · 범위 -35~-29°C
난류 보통 12NM · 착빙 없음
```

### 4-D. 위험기상과 NOTAM

한 leg에는 다음 조건을 만족하는 위험만 넣는다.

```text
leg과 위험 구간의 수평 거리축이 겹침
AND 선택 고도가 위험 고도 범위와 겹침
```

SIGMET/AIRMET의 유효시간은 ETD/ETA 경로 시간창과의 판정 상태를 함께 보여 준다. ProjectAMO는 구간 통과 시각을 계산하지 않으므로, 특정 시각에 그 leg에서 위험을 만난다는 주장은 하지 않는다.

- `timeStatus: matched`: 경로 시간창과 위험 유효시간이 교차함
- `timeStatus: not_provided`: ETD/ETA가 없어 시간 교차를 판정하지 못함
- `timeStatus: unavailable`: 필요한 시간 데이터가 없어 판정하지 못함

NOTAM도 기존 데이터의 경로·고도·시간 교차 결과를 leg에 연결한다. 명확한 운영 불가 NOTAM은 고도 비교 단계에서 이미 후보 제외 사유가 되므로, 이 표에는 `warn` 또는 `undetermined` 영향을 중심으로 표시한다.

## 5. 프런트엔드

`frontend/src/features/route-briefing/RouteWeatherLegTable.jsx`를 기존 브리핑의 원자료 표 위, hazard ribbon 아래에 둔다. 표 제목은 **경로 구간 기상 브리핑**으로 표시하고, `NavLog` 단독 명칭은 사용하지 않는다.

데스크톱 기본 열:

```text
구간 | 거리 | Course | 선택고도 | 바람 | 기온 | 위험기상
```

각 행의 위험기상 열에는 난류·착빙의 노출거리, SIGMET/AIRMET, NOTAM 영향을 함께 표시한다. 여러 위험은 생략하지 않고 칩으로 모두 보이며, 상세 클릭은 기존 지도·상세 브리핑의 해당 거리 구간을 선택한다.

- `Course`는 `143°T`처럼 진방위를 명시한다.
- 순풍/맞바람은 색상뿐 아니라 텍스트와 부호를 함께 표시한다.
- `시간 판정 불가`, `자료 없음`, `공표 항공로 고도 제약 확인 불가`, `NOTAM 판정 불가`는 위험 없음과 시각적으로 구분한다.
- 모바일에서는 열을 축소하지 않고 leg별 카드로 표시한다.
- 표 상단에는 `선택 고도 FL250 기준 · 기상 정보 브리핑이며 운항 NavLog, ETA 또는 연료 계산을 포함하지 않습니다.`를 표시한다.

## 6. 검증

`frontend/src/features/route-briefing/lib/routeWeatherLegModel.test.js`에 다음을 둔다.

| 입력 | 기대 |
| --- | --- |
| 순항 marker 4개(0/30/80/120 NM) | `legs.length === 3`, 거리 30/50/40 NM |
| marker 12개 | `legs.length === 11`; 표본 추출 없이 모두 반환 |
| 거리 다른 표본의 순풍 성분 | 단순 산술 평균이 아닌 거리 가중 평균 |
| 난류 구간 40~60 NM, leg 30~80 NM | 해당 leg에 난류 노출 거리와 최고 등급 반환 |
| 위험 구간이 leg 경계에만 접함 | 엄격한 겹침 규칙에 따라 교차로 반환하지 않음 |
| `routeIntervalNm: null`인 공항 범위 경보 | 어느 leg에도 넣지 않음 |
| ETD/ETA 없음, 수평·수직 위험 교차 | 위험은 남기고 `timeStatus: 'not_provided'` |
| 선택 고도 변경 | 바람·기온·착빙·난류·위험 결과가 새 선택 고도 기준으로 갱신 |
| AIP 제약 미매칭 | leg 표는 유지하고 `altitudeConstraintStatus: 'unavailable'` 표시 |
| 반환 객체 | 시간·속도·연료·ETA 관련 필드 없음 |

## 7. 완료 기준

- 조종사는 선택한 계획고도에서 웨이포인트 사이 각 구간의 Course·거리·바람·기온·위험기상을 한 화면에서 확인할 수 있다.
- 고도별 기상 비교에서 고도를 바꾸면 모든 leg의 기상 요약이 같은 선택 고도 기준으로 바뀐다.
- 난류·착빙·SIGMET/AIRMET·NOTAM의 구간 교차와 시간 판정 상태가 위험 없음과 혼동되지 않는다.
- 표는 항법·기상 인지에만 쓰이며 TAS·GS·시간·ETA·연료·Heading·성능 계산을 주장하지 않는다.
