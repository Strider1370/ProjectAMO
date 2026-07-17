# Phase 3 — 고도별 기상 비교 구현 계획

- 날짜: 2026-07-17
- 상태: 구현 전
- 상위 계획: `2026-07-17-route-alternatives-four-stage-flow.md`의 Phase 3
- 스펙: `../specs/2026-07-15-altitude-advisor.md`

## 목적과 경계

선택한 경로와 사용자가 입력한 계획 순항고도를 기준으로, 공표된 항공로 고도 제약 안의 인접 고도 최대 다섯 개를 기상 정보와 함께 비교한다. 사용자가 고도를 선택하면 기존 상세 브리핑의 `cruiseAltitudeFt`만 바꾼다.

이 단계는 고도를 추천하거나, 항공기 성능·연료·예상 비행시간·운항 가능성을 판단하지 않는다. SID/STAR/IAP의 고도 제한도 순항 후보 생성에 넣지 않는다.

## 현재 코드 재사용 판정

| 기존 코드 | 그대로 재사용 | Phase 3에서 추가할 최소 처리 |
| --- | --- | --- |
| `aip-airway-constraints.js`의 `attachActiveAipConstraints()` | 선택 경로의 AIP 구간과 MFA·상/하한·방향별 FL 계열 연결 | 모든 구간을 합쳐 하한·상한·공통 FL 계열을 계산 |
| `enroute-cross-section.js`의 `loadRouteCrossSection()` | KIM 온도·바람·착빙, KTG 난류 단면 로드 | 표본별 KIM 고도를 보존하고 후보 고도별 정확값/두 인접면 보간과 거리 가중 요약 |
| `hazard-section.js`의 수평·수직·시간 판정 | SIGMET/AIRMET 교차 판단 | 수평·시간 결과를 재사용하고 후보 고도마다 수직 판정 |
| `notam-briefing.js`의 경로 NOTAM 매칭 | 경로·시간·고도 관련 NOTAM 식별 | `exclude`·`warn`·`undetermined`를 명시적으로 분류 |
| `useRouteBriefing.js`의 선택 경로·계획고도·기존 브리핑 전이 | 고도 선택과 최종 브리핑 연결 | 선택 후보 기준의 en-route geometry/model로 API 호출 상태 추가 |
| `RouteBriefingPanel.jsx`의 고도 단계 자리 | Phase 3 화면 진입과 입력 위치 | `AltitudeWeatherComparison.jsx`를 이 단계에만 조립 |

`MapView.jsx`에는 상태나 effect를 추가하지 않는다.

## 확인된 구현 전제와 처리 원칙

1. 국내의 활성 AIP 스냅샷은 구간별 MFA, 상/하한, 방향별 `Odd`/`Even` 순항 규칙을 제공한다. 저장된 ENR 1.7 원문 캡처(`artifacts/aip-pilot/2026-06-25/enr-1.7-rendered.png`)의 IFR 고도표로 이 규칙을 명시적 FL/고도 목록으로 전개한 뒤, 모든 구간의 공통 후보만 사용한다. 경로의 어느 구간이라도 매칭되지 않으면 자동 후보를 만들지 않는다.
2. 활성 매니페스트는 정상이나 검증 메타데이터에는 `reviewed-not-current` 표기가 있다. API는 cycle과 검증 상태를 `constraints`에 보존하며, 이를 최신성 보증으로 바꾸지 않는다.
3. KIM은 기압면 단면이다. 운용 고도와 정확히 일치하지 않으면 실제 인접 두 면 사이에서만 보간한다. 한쪽이라도 없으면 해당 행은 `weather_unavailable`이다.
4. 기존 NOTAM 충돌 결과는 불확실한 고도 조건도 보수적으로 충돌시킬 수 있다. 후보 삭제에는 고도·경로·시간이 모두 명확히 금지임을 확인한 경우만 사용한다. 나머지는 경고 또는 판정 불가로 남긴다.
5. 선택된 대안의 절차는 이미 후보 선택 때 적용된다. 고도 API에는 절차를 포함한 지도 표시선이 아니라 선택 후보의 en-route geometry와 route model만 전달한다.
6. 바람 성분은 경로 진행방위가 있어야 계산할 수 있다. endpoint는 cross-section과 같은 en-route geometry에서 `buildRouteAxis()`를 만들고, 그 축의 거리와 cross-section 표본 거리를 맞춘다.

## 구현 순서

### 1. 순수 비교 모듈

`backend/src/briefing/altitude-weather-comparison.js`를 추가한다. 외부 I/O 없이 아래 두 export만 둔다.

```js
buildAltitudeCandidates({ routeSegments, plannedCruiseAltitudeFt, crossSection })
buildAltitudeWeatherComparison({ candidates, crossSection, axis, hazards, notams, etd, eta })
```

`buildAltitudeCandidates()`는 다음을 수행한다.

- `routeFloorFt = max(MFA)`와 `routeCeilingFt = min(upperLimit)`를 계산한다.
- 각 구간의 진행 방향 `Odd`/`Even`을 ENR 1.7 IFR 고도표로 전개하고, 공통 계열의 교집합을 만든다. `Odd`는 000–179°, `Even`은 180–359° 표를 뜻하며 RVSM 구간도 원문 표 그대로 사용한다.
- 입력 고도와 가장 가까운 아래 둘·위 둘을 더해 최대 다섯 행을 만든다.
- 입력 고도가 범위/계열 밖이면 입력 행을 유지하고 `input_invalid` 근거를 붙인다.
- 제약 누락 또는 방향 규칙 누락이면 자동 후보를 만들지 않고 제약 상태만 반환한다.

`buildAltitudeWeatherComparison()`은 유효 후보에 한해 다음을 수행한다.

- KIM 정확 고도 또는 인접 두 기압면의 수직 보간을 명시한다.
- 표본 진행방위에 투영한 순풍 성분을 거리 가중 평균·최소·최대로 집계한다.
- 착빙·난류는 연속 표본을 등급별 거리로 합쳐 최고 등급과 노출 거리를 반환한다.
- SIGMET/AIRMET은 수평·수직·시간이 모두 맞을 때만 `encounter: 'on'`으로 표시한다. 시간 입력이 없으면 교차 여부를 숨기지 않고 `not_provided`으로 남긴다.
- NOTAM은 명확한 금지만 `exclude`, 관련 정보는 `warn`, 시간 또는 수직 범위가 불명확하면 `undetermined`로 반환한다.

이를 위해 `cross-section-sampler.js`는 각 KIM value에 원본 `hgt` 기반 `altFt`를 보존한다. route-average `level.altFt`는 표시용으로만 남기며 후보 고도의 정확/보간 면 선택에는 쓰지 않는다. NOTAM의 경우 기존 `matchRouteNotams()` 결과를 그대로 쓰지 않는다. raw NOTAM을 수평·수직·시간 순서로 분류해, 시간창이 없거나 해석할 수 없는 항목은 제거하지 않고 `undetermined`로 반환한다.

전환고도(14,000 ft) 아래 후보는 `FL090`으로 오인시키지 않고 `9,000 ft`처럼 고도 표기로 반환한다. 점수, 추천, 정렬 우선순위, 새로운 데이터 저장소는 만들지 않는다.

### 2. 고도 비교 API

`backend/server.js`에 `POST /api/briefing/altitudes`를 추가한다.

요청은 다음으로 고정한다.

```js
{ routeGeometry, routeModel, plannedCruiseAltitudeFt, etd, eta }
```

처리 순서:

1. geometry와 route model을 검증하고, 없으면 400을 반환한다.
2. 기존 `attachActiveAipConstraints()`와 `loadRouteCrossSection()`을 호출하고, 같은 en-route geometry로 `buildRouteAxis()`를 만든다.
3. 기존 SIGMET/AIRMET/NOTAM 캐시를 읽어 순수 모듈에 전달한다.
4. `constraints`, `rows`, 단면 run 출처만 반환한다. `recommended` 필드는 반환하지 않는다.

해외 구간 또는 AIP 제약 미매칭은 오류가 아니다. `constraints.status = 'unavailable'`와 빈 자동 후보를 반환하고, 사용자 입력 고도는 기상 자료가 있으면 비교 행으로 유지한다.

| AIP 제약 상태 | 자동 후보 | 사용자 입력 고도 행 |
| --- | --- | --- |
| `matched` | 공통 FL 계열에서 생성 | 유효/무효 사유와 함께 표시 |
| `partial` | 생성하지 않음 | `AIP 고도 제약 데이터 일부 없음` 상태로만 표시 |
| `conflicting` | 생성하지 않음 | `경로 구간별 고도 계열 확인 필요` 상태로만 표시 |
| `unavailable` 또는 `not_applicable` | 생성하지 않음 | `공표 항공로 고도 제약 데이터 없음` 상태로만 표시 |

마지막 세 상태의 입력 행은 기상 비교 가능 행으로 보이지 않는다. 해외 또는 자료 없는 경로에서 KIM/KTG가 있더라도, AIP 제약이 없는 자동 고도 비교로 오해되지 않게 고도 기상 자료의 존재는 상태 문구로만 알린다.

### 3. 프런트 연결

`frontend/src/api/briefingApi.js`에 `fetchAltitudeComparison(payload)`만 추가한다.

`useRouteBriefing.js`는 다음 최소 상태만 소유한다.

```js
altitudeComparison
altitudeComparisonLoading
altitudeComparisonError
```

- 사용자가 ③ 고도 비교 단계에 들어갈 때 선택 후보와 계획고도가 유효하면 한 번 조회한다.
- 후보 선택·경로 설정·ETD/ETA 변경 시 이전 고도 비교와 최종 브리핑을 비운다.
- 고도 행 선택은 기존 `cruiseAltitudeFt`만 갱신하고, 자동으로 최종 브리핑을 만들지 않는다.
- 늦게 도착한 이전 응답을 막기 위해 기존 노출 요청과 같은 request ID 패턴을 재사용한다.

선택 후보의 en-route model이 hook 상태에 없다면, 이미 있는 `buildCommonRouteModel()`을 선택 후보의 en-route preview geometry에 적용한다. 절차를 포함한 공항 연결선은 이 요청에 쓰지 않는다.

### 4. 화면

`frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx`를 추가하고 `RouteBriefingPanel.jsx`의 Phase 3 placeholder를 교체한다.

- 계획 고도 입력, 공표 비교 범위, 최대 다섯 개의 라디오형 행을 표시한다.
- 각 행은 FL, 순풍/맞바람 텍스트와 부호, 착빙·난류 노출 거리, 위험/NOTAM/시간/자료 상태를 사실로만 표시한다.
- `AIP 고도 제약 데이터 없음`, `경로 구간별 고도 계열 확인 필요`, `고도 기상 비교 자료 없음`, `NOTAM 판정 불가`는 위험 없음과 구분한다.
- 표 하단에 스펙의 비권고 고지를 항상 표시한다.

새 지도 layer, 지도 클릭 선택, 고도 추천 배지는 추가하지 않는다.

## 검증 순서

1. `backend/test/altitude-weather-comparison.test.js`를 새로 작성한다. floor/ceiling, FL 교집합, 입력 고도 무효, 표본별 KIM 고도 보간, 거리 가중 바람, 착빙·난류 거리, 위험 시간 없음, NOTAM 세 분류를 한 테스트 파일에 둔다.
2. route AIP 제약 미매칭, KIM 자료 없음, 해외 경로의 API 응답을 endpoint 테스트에 추가한다.
3. focused backend tests, frontend tests, `npm.cmd --prefix frontend run build`, `git diff --check`를 실행한다.
4. dev-test 서버에서 Playwright로 국내 기본 경로와 절차가 다른 선택 후보 각각이 자신의 en-route geometry/model로 고도 비교를 요청하는지, 고도 비교 진입·행 선택·브리핑 고도 반영과 제약 자료 없는 경로의 상태를 확인한다.
5. 구조 검사는 `npx depcruise .` 또는 `npx madge --circular .`, `npx knip`을 실행한다. 설정 부재 또는 기존 repo-wide 결과는 새 변경 실패로 오인하지 않고 기록한다.

## 완료 기준

- 선택 경로의 공표 AIP 제약을 근거로 최대 다섯 개의 인접 고도를 비교한다.
- 제약·기상·시간·NOTAM의 불확실성을 `없음`으로 표시하지 않는다.
- 한 행을 선택하면 기존 상세 브리핑이 그 고도만 사용한다.
- API나 UI 어디에도 고도 추천·성능·연료·운항 가능성 판단이 없다.
