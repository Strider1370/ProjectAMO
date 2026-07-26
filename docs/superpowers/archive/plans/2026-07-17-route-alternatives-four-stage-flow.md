# 경로 대안 4단계 흐름 — 구현 계획

- 날짜: 2026-07-17
- 상태: **구현 전 — 이 문서 승인 후 Phase 0부터 시작**
- 범위: 국내·해외 공항을 포함한 IFR en-route. VFR의 현재 경유점 편집 흐름은 변경하지 않는다.
- 연계 스펙: `2026-07-14-weather-aware-route-alternatives.md`, `2026-07-15-altitude-advisor.md`, `2026-07-15-navlog-leg-table.md`, `2026-07-16-preflight-weather-briefing-flow.md`

## 0. 현재 코드 기준선

| 현재 위치 | 현재 책임 | 이번 변경 방식 |
| --- | --- | --- |
| `frontend/src/features/route-briefing/useRouteBriefing.js` | `routeForm`, 단일 `routeResult`, 고도·브리핑 상태와 모든 경로 액션 | 4단계 상태와 후보 선택 상태의 단일 소유자. 선택 후보를 기존 `routeResult`에 반영해 기존 저장·브리핑 경로를 재사용한다. |
| `frontend/src/features/route-briefing/lib/routePlanner.js` | `enroute.json` graph에서 방향 검사 포함 단일 최단 IFR path 생성 | 같은 Dijkstra에 `blockedSegmentIds` 인자를 추가하고, 기본 경로의 위험 구간을 하나씩 막아 최대 3개 대안을 만든다. 새 graph/의존성은 만들지 않는다. |
| `frontend/src/features/route-briefing/lib/routeBriefingModel.js` | 지도용 `routePreviewModel`, terminal procedure 포함 현재 경로선 | `routeCandidates`, `selectedCandidateId`를 model에 추가한다. SID/STAR/IAP는 계속 선택 후보 한 개에만 적용한다. |
| `frontend/src/features/route-briefing/lib/routePreview.js`, `routePreviewSync.js` | route-preview/procedure-preview source와 단일 route line | 같은 `briefing-route-preview` source에 여러 en-route candidate feature를 넣고, 선택 후보만 굵고 진하게 그린다. `MapView.jsx`에는 상태/effect를 추가하지 않는다. |
| `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` | 현재 입력·검색·고도·브리핑 버튼을 한 패널에 배치 | 데스크톱 4탭과 단계별 본문을 조립한다. 단계별 상세 표는 별도 컴포넌트로 분리한다. |
| `backend/server.js` + `backend/src/briefing/*.js` | `/api/route-briefing`은 ETD·ETA·선택고도를 요구하고, 수평/수직 노출을 함께 조립 | 수평 전용 route-exposure와 고도 비교 endpoint를 별도로 추가한다. 기존 `/api/route-briefing`은 마지막 ④에서만 사용한다. |

## 1. 확정할 입력 계약

### 1.1 단계와 상태

`useRouteBriefing.js`에 아래 상태를 추가한다. 문자열은 UI 라벨이 아니라 안정적인 내부 값으로 쓴다.

```js
const [workflowStep, setWorkflowStep] = useState('settings')
const [eta, setEta] = useState('')
const [etaSource, setEtaSource] = useState('estimated') // 'estimated' | 'manual'
const [routeCandidates, setRouteCandidates] = useState([])
const [selectedCandidateId, setSelectedCandidateId] = useState(null)
const [routeExposure, setRouteExposure] = useState(null)
const [candidateLoading, setCandidateLoading] = useState(false)
const [candidateError, setCandidateError] = useState(null)
```

`routeResult`은 항상 **현재 선택된 후보**만 보관한다. 기존 `getCurrentRouteLineString`, 저장, 연직단면, 브리핑 생성은 이 값을 계속 사용하므로 대규모 교체가 필요 없다.

해외 출발·도착은 기존 `recommendProcedures()`의 `airport-route-links-overseas.json` 최근접 FIX 연결을 그대로 사용한다. 해외 endpoint에는 SID/STAR/IAP가 없으므로 해당 terminal 구간은 공항↔FIX 연결선으로만 표시한다. 후보 탐색은 이 entry FIX와 exit FIX **사이의 en-route segment만** 바꾼다.

`clearRouteDisplay()`와 출발지·도착지·SID·STAR·IAP·route type 변경 경로는 다음을 함께 초기화한다.

```text
routeCandidates / selectedCandidateId / routeExposure / candidateError
verticalProfile / crossSection / briefing
workflowStep = 'settings'
```

### 1.2 시간

① 비행 설정에 ETD와 TAS를 둔다. 검색이 만든 선택 경로의 총거리와 TAS로 **예상 ETA**를 계산하고, 사용자는 ETA를 직접 고쳐 쓸 수 있다. `etaSource`는 자동 계산값이면 `estimated`, 사용자가 수정하면 `manual`이다.

- TAS는 기존 `computeEtaIso(etd, totalDistanceNm, tasKt)`로 계산한다. 바람·지상속도·연료·상승/하강은 반영하지 않는다.
- `ETD <= ETA`를 검증하며, TAS가 없거나 유효하지 않으면 ETA는 비운다.
- 예상 ETA 옆에는 `TAS 기준 예상 · 바람 미반영`을, 직접 수정한 값에는 `사용자 입력 ETA`를 표시한다.
- 대안 탐색은 이 ETD~ETA 전체 시간창과 위험기상 유효시간의 겹침만 사용한다. 각 leg의 통과 시각이나 조우 시각은 계산하지 않는다.
- TAS와 ETA가 모두 없으면 경로 검색은 가능하지만 자동 대안 탐색은 하지 않는다. ②에는 수평 노출과 `시간 판단 불가`만 표시한다.
- ④의 기존 `/api/route-briefing`은 ETD·ETA가 모두 있어야 실행한다. 둘 중 하나가 없으면 ④에서 입력 위치로 되돌려 오류를 설명한다.

이 ETA는 위험기상 유효시간을 대략 대조하기 위한 계획값이다. 실제 ETA, 예상 지상속도, 구간별 시각 또는 운항 가능성을 뜻하지 않는다.

### 1.3 후보별 ETA와 결과 무효화

자동 ETA는 후보별 총거리(선택 SID/STAR/IAP 포함)와 TAS로 각각 다시 계산한다. 그러므로 후보 카드의 시간 노출은 각 후보의 `estimatedEta`를 사용한다. 사용자가 ETA를 직접 수정하면 `etaSource = 'manual'`이며, 같은 수동 ETA를 모든 후보에 적용한다.

| 변경 | 즉시 비우는 상태 | 다시 계산하는 시점 |
| --- | --- | --- |
| 출발/도착, entry/exit FIX, SID/STAR/IAP, route type | 후보·선택 후보·노출·고도 비교·최종 브리핑 | 새 경로 검색 뒤 |
| ETD, TAS | 후보별 예상 ETA·노출·고도 비교·최종 브리핑 | 값 변경 뒤 노출 재조회; 선택 후보는 유지 |
| 사용자 ETA | 노출·고도 비교·최종 브리핑 | 값 변경 뒤 노출 재조회; 후보 경로는 유지 |
| 후보 선택 | 고도 비교·최종 브리핑 | 선택 직후 ③ 진입 시 |
| 계획고도 | 최종 브리핑 | ③ 고도 행 선택 직후 |

`updateRouteField()`를 그대로 호출하는 route type 탭은 이 규칙을 실행하지 못한다. `handleRouteTypeChange()`를 새로 두고, 출발/도착·절차 변경도 공통 `invalidateWorkflowFromSettings()`를 거치게 한다. 노출·고도 요청에는 각각 request ID를 두어 늦게 끝난 이전 응답이 새 상태를 덮어쓰지 못하게 한다.

## 2. Phase 0 — 수평 노출 API와 후보 모델

### 2.1 백엔드: route-exposure

새 파일 `backend/src/briefing/route-exposure.js`를 추가한다.

```js
buildRouteExposure({ routeGeometry, routeModel, etd, eta, sigmet, airmet, lightning, referenceTime })
// => {
//   trigger: 'ready' | 'time_unknown' | 'unavailable' | 'none',
//   hazards: [{ sourceId, phenomenon, label, validFrom, validTo, bandFt,
//               horizontalExposure, timeStatus, confidence }]
//   comparisonOnly: { lightning: { status, observedAt, within20NmCount } }
// }
```

구현 순서:

1. `buildRouteAxis(routeGeometry, 2000)`를 호출한다.
2. 각 SIGMET/AIRMET에 기존 `evaluateHorizontalExposure()`와 `evaluateTimeStatus()`를 적용한다.
3. 국내·해외를 구분하지 않고 `TS/CB`, `TC`, `VA`이면서 polygon geometry·`horizontalExposure.status === 'intersects'`인 항목만 자동 탐색 trigger 후보로 삼는다. 현재는 국내·해외 SIGMET의 TS/CB를 사용한다. VAA/VA SIGMET·TCA/TC SIGMET은 예측 영향영역 polygon 어댑터가 준비된 뒤 같은 규칙으로 넣는다. 난류·착빙·낙뢰는 결과에 남아도 trigger에는 넣지 않는다.
4. trigger 우선순위는 다음과 같다. 하나라도 `matched`이면 `ready`; `matched`는 없고 수평 교차 TS/CB·TC·VA가 있으나 ETD/ETA가 없으면 `time_unknown`; trigger 후보 geometry가 전부 없거나 유효시간이 해석 불가이면 `unavailable`; 그 밖에는 `none`이다. geometry 없는 한 항목이 다른 유효 polygon의 `ready`를 `unavailable`로 바꾸지 않는다. 중심점만 있고 영향영역 polygon이 없는 화산재·태풍 자료는 개별 hazard를 `unavailable`로 남기며 후보 생성 근거로 쓰지 않는다.
5. `lightning.nationwide.strikes`의 최근 관측 point는 route-axis 표본에서 20NM 이내인 건수를 센다. payload의 `history_window_minutes` 밖이거나 좌표·시각이 없는 strike는 제외한다. 결과는 `comparisonOnly.lightning`에만 넣고, ETD/ETA와 매칭하거나 자동 대안 trigger로 사용하지 않는다.
6. 고도·속도·구간 통과 시각·안전 등급은 계산하거나 반환하지 않는다.

`backend/server.js`에 `POST /api/briefing/route-exposure`를 추가한다. 요청은 `{ routeGeometry, routeModel, etd, eta }`, 데이터는 기존 `/api/route-briefing`과 같은 `store.getCached('sigmet')`, `sigmet_overseas`, `airmet`에 `store.getCached('lightning')`을 더해 넘긴다. geometry 없는 요청은 400으로 처리한다.

`frontend/src/api/briefingApi.js`에 `fetchRouteExposure(payload)`를 추가한다.

테스트:

- 새 `backend/test/route-exposure.test.js`: 교차/비교차, geometry 없음, TS 시간 일치, TS 시간 미입력, 난류만 교차, 유효 polygon과 geometry 없음 항목 혼합, 최근 낙뢰 20NM 이내/밖/자료 없음 fixture를 둔다.
- `backend/test/route-briefing-integration.test.js`: 새 endpoint의 400 및 정상 응답 확인.
- `routeIntervalInGeometry()`의 현재 2km 표본 inside 판정 한계를 fixture로 고정한다: sample 사이 교차, polygon hole, 경계 접촉, MultiPolygon, 최대 2.5km 폭 polygon. 이 한계를 해결하기 전 카드 문구는 `수평 노출 약 N NM`으로 표현한다. 실제 선-폴리곤 교차가 필요해지면 이 순수 함수만 교체한다.

### 2.2 프런트: 후보 shape와 탐색

`routePlanner.js`에서 private `findShortestPath()`에 마지막 선택 인자 `blockedSegmentIds = new Set()`을 추가한다. link 순회 시 `blockedSegmentIds.has(link.segmentId)`이면 건너뛴다. 기존 `buildBriefingRoute()`는 인자를 넘기지 않아 동작이 바뀌지 않는다.

같은 파일에 아래 export를 추가한다. 새 그래프 파일이나 별도 planner class는 만들지 않는다.

```js
buildRouteAlternatives({
  departureAirport, entryFix, exitFix, arrivalAirport, routeType,
  triggerIntervals, baselineRoute,
})
// => [{ id: 'base' | 'alt-1'..., routeResult, addedDistanceNm, changedDistanceNm }]
```

구체 알고리즘:

1. `baselineRoute.segments.map((segment) => segment.id)`와 `routeModel.enRouteSegments[].startNm/endNm`를 교차시켜 `triggerIntervals`에 겹치는 baseline segment ID를 구한다.
2. 그 segment ID를 **한 번에 하나씩** `blockedSegmentIds`로 주어 Dijkstra를 재실행한다. 결과가 없는 경우는 건너뛴다.
3. `segmentIds.join('|')`로 중복을 제거하고, baseline과 다른 segment 거리(`changedDistanceNm`)를 계산한다.
4. 추가거리 상한 `min(50, max(15, baseline.distanceNm * .25))`, 최소 차이 `max(15, baseline.distanceNm * .20)`을 적용한다.
5. 거리 오름차순으로 정렬해 base 외 최대 3개를 남긴다.
6. `findShortestPath`, `buildPreviewGeometry`, `buildRouteDisplaySequence`은 현재 private 함수다. 같은 파일에서 `buildIfrRouteResult({ navdata, departureAirport, entryFix, exitFix, arrivalAirport, routeType, path })`를 추출하고, 기존 `buildBriefingRoute()`과 새 `buildRouteAlternatives()`가 함께 호출하게 한다. 이 함수가 `segments`, `navpointIds`, `previewGeojson`, `displaySequence`, `distanceNm`, `totalDistanceNm`을 같은 shape으로 반환하게 한다. `selectedSid`, `selectedStar`, `selectedIap`은 candidate에 저장하지 않고 hook의 현재 선택을 공유한다.

이 알고리즘은 “각 위험 구간에서 한 번 벗어난 짧은 길”만 찾는 MVP다. 각 후보의 trigger hazard별 수평 노출을 다시 계산해 기본 대비 `decreased`/`unchanged`/`increased`를 저장한다. 모든 trigger hazard가 `unchanged` 또는 `increased`인 후보는 버리고, 남는 후보가 없으면 `우회 후보 없음`을 표시한다. 최적 우회/권고 엔진이 아니므로, 코드 주석에 `ponytail:` ceiling과 이후 k-shortest-path 교체 지점을 남긴다.

테스트는 기존 `frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js`에 추가한다.

- baseline 포함, 대안 최대 3개
- blocked segment 우회
- 방향 불가 segment 제외
- detour 상한/최소 차이/중복 제거
- SID·STAR·IAP를 바꾸지 않는 candidate input

## 3. Phase 1 — hook 전이와 ① 비행 설정

### 3.1 `useRouteBriefing.js`

`handleRouteSearch()`의 성공 분기를 다음 순서로 바꾼다.

1. 기존 `buildBriefingRoute()` 결과를 base candidate로 만든다.
2. terminal procedure가 반영된 `getCurrentRouteLineString()`가 아니라 **기존 `routeResult.previewGeojson`의 en-route line**으로 `buildCommonRouteModel()`을 만든다.
3. `fetchRouteExposure()`를 호출한다.
4. 예상 또는 사용자 입력 ETA가 있는 상태에서 `trigger === 'ready'`일 때만 `buildRouteAlternatives()`를 호출하고, 모든 candidate의 en-route geometry에 `fetchRouteExposure()`를 병렬 호출한다.
5. candidate 배열·선택 ID·선택 `routeResult`를 한 번에 저장하고 `workflowStep = 'compare'`로 바꾼다.
6. `none`, `time_unknown`, `unavailable`은 base 한 개만 저장한다. 각 상태는 ②에서 그대로 표시한다.

새 액션은 다음 네 개뿐이다.

```js
selectRouteCandidate(id)       // routeResult와 selectedCandidateId만 변경, ③/④ 결과 초기화
continueToAltitudeComparison() // 선택 candidate 필요, workflowStep = 'altitude'
selectCruiseAltitude(value)    // cruiseAltitudeFt 변경, ④ 결과 초기화
continueToBriefing()           // ETA 검증 후 workflowStep = 'briefing'
```

`handleGenerateBriefing()`은 `computeEtaIso()` 호출을 제거하고 `eta` state만 payload로 사용한다. `cruiseSpeedKt` state와 `setCruiseSpeedKt`는 IFR 경로에서 제거한다. VFR에서 아직 사용 중이면 VFR 분기 안에만 남긴다.

### 3.2 `RouteBriefingPanel.jsx`

기존 데스크톱 `desktopBody`를 다음의 작은 렌더 단위로 교체한다.

```text
WorkflowTabs
  settings: FlightSettingsStep
  compare: RouteAlternativesStep
  altitude: AltitudeWeatherComparison
  briefing: RouteBriefingStep
```

새 파일은 실제 복잡도가 있는 세 개만 만든다.

| 파일 | 책임 | 받는 값 |
| --- | --- | --- |
| `RouteAlternativesStep.jsx` | base/대안 카드, 자료 상태, 선택·다음 버튼 | `candidates`, `selectedCandidateId`, `routeExposure`, `onSelect`, `onContinue` |
| `AltitudeWeatherComparison.jsx` | 계획고도 입력, 고도 후보 행, 선택 | Phase 3 API 응답과 `onSelectAltitude` |
| `RouteWeatherLegTable.jsx` | ④의 en-route leg 표 | Phase 4 briefing legs |

`RouteBriefingPanel.jsx`에는 탭 shell, 기존 AirportPicker/절차 picker, 버튼 wiring만 남긴다. 기존 `RouteBriefing.css`의 blanket selector는 늘리지 않고, 새 class는 각 step의 작은 CSS block으로 추가한다.

①의 정확한 필드 순서:

```text
IFR/VFR → 출발/도착 → 교체공항 → ETD/TAS/예상 ETA → 경로유형 → SID/STAR/IAP → 경로 검색
```

현재 `cruiseSpeedKt` 입력은 ①의 TAS 입력으로 이름과 설명을 정리해 유지한다. ETA strip은 `TAS 기준 예상 · 바람 미반영` 또는 `사용자 입력 ETA` 출처를 함께 보여 준다. 검색 성공 전 ②~④ 탭은 `disabled`이고, 검색 성공 뒤에도 ③은 candidate 선택·확정 전, ④는 고도 선택 전 `disabled`다.

교체공항 옵션은 `KNOWN_AIRPORTS`를 직접 쓰지 않고, 이미 출발·도착 picker가 사용하는 `allAirportOptions`에서 출발·도착을 뺀 목록을 사용한다. 따라서 해외 출발·도착과 해외 교체공항 모두 같은 검색·선택 UI로 고른다.

모바일은 기존 `mobileStep`을 4단계 `workflowStep`과 중복 유지하지 않는다. `mobileStep`과 footer를 제거하고 같은 `workflowStep`을 사용한다. 각 단계는 MobileSheet 안에서 한 작업만 보이고 footer의 버튼은 `경로 검색 → 고도 비교로 → 브리핑으로 → 브리핑 생성` 순으로 바뀐다.

## 4. Phase 2 — 다중 후보 지도

### 4.1 preview model

`routeBriefingModel.js`의 `buildRoutePreviewModel()` 반환값에 추가한다.

```js
routeCandidates: state.routeCandidates,
selectedCandidateId: state.selectedCandidateId,
```

### 4.2 GeoJSON과 layers

`routePreview.js`에 다음 상수를 추가한다.

```js
ROUTE_CANDIDATE_LINE = 'briefing-route-candidate-line'
ROUTE_CANDIDATE_LINE_HIT = 'briefing-route-candidate-line-hit'
```

`routePreview.js`의 `addRoutePreviewLayers()`에 candidate line/hit layer를 실제 등록한다. `routePreviewSync.js`는 두 ID를 import해 `ROUTE_PREVIEW_LAYER_IDS`에도 추가하므로 style reload cleanup과 `clearRoutePreviewLayers()`가 함께 처리한다. 기존 `route-preview-line` layer는 legacy 단일 경로와 VFR drag 용도로 그대로 둔다.

`routePreviewSync.js`의 `syncRoutePreviewLayers()`는 `routeCandidates.length > 0`일 때 `ROUTE_PREVIEW_SOURCE`에 다음 feature를 쓴다.

```js
{ role: 'route-candidate-line', candidateId, selected, kind: 'base' | 'alternative', geometry }
```

- candidate line layer: `role === 'route-candidate-line'` filter와 `selected` property expression으로 선택 후보는 accent `#334155`, width 5, opacity 1; 나머지는 neutral stroke, width 3, opacity 0.6으로 그린다.
- candidate hit layer: `role === 'route-candidate-line'`, opacity 0, width 20. 첫 구현에서는 클릭 handler를 연결하지 않아 hover/click 행동을 만들지 않는다.
- procedure source는 선택 candidate에만 SID/STAR/IAP geometry를 그린다.
- legacy `route-preview-line` 경로는 candidate 배열이 없을 때 그대로 그린다.

첫 구현에서는 지도선 클릭 선택을 넣지 않는다. 왼쪽 카드 선택이 유일한 선택 수단이며 지도는 즉시 강조 상태를 반영한다. 지도 클릭 handler는 `MapView` lifecycle 변경이 필요한 별도 개선으로 남긴다.

해외 route segment도 graph에 있고 기본 경로가 만들어졌다면 같은 방식으로 후보 탐색·비교한다. 해외 SID/STAR/IAP가 없다는 사실은 후보 탐색의 실패 사유가 아니다. 연결 FIX 또는 해외 graph가 없으면 현재와 같이 경로 검색 실패를 보이며 좌표나 항로를 추정하지 않는다.

테스트:

- `routePreviewSync.test.js`: 3 candidate feature가 source에 쓰이고 선택 ID 변경 시 `selected` 속성이 하나만 true이며 procedure source는 선택 후보 하나만 반영하는지 확인한다.
- `mapStyleSync.test.js`: 두 새 layer ID가 style reload 정리 대상에 포함되는지 확인한다.

## 5. Phase 3 — 고도 비교 구현

### 5.1 백엔드

새 파일 `backend/src/briefing/altitude-weather-comparison.js`:

```js
buildAltitudeCandidates({ routeSegments, plannedCruiseAltitudeFt, crossSection })
buildAltitudeWeatherComparison({ candidates, crossSection, axis, sigmet, airmet, notams, etd, eta })
```

`backend/server.js`에 `POST /api/briefing/altitudes`를 추가한다. body는 `{ routeGeometry, routeModel, plannedCruiseAltitudeFt, etd, eta }`이며, `attachActiveAipConstraints()`와 `loadRouteCrossSection()`의 결과를 재사용한다. 응답은 스펙의 `constraints`와 `rows`만 가진다. 추천 필드는 만들지 않는다.

테스트는 새 `backend/test/altitude-weather-comparison.test.js`에 둔다. floor/ceiling, 방향별 FL series, 기준 고도 ±2행, 입력 고도 무효, KIM 보간, 시간 미입력, AIP conflict를 fixture로 고정한다.

### 5.2 프런트

`briefingApi.js`에 `fetchAltitudeComparison()`을 추가하고, hook은 ③ 진입 시 선택 candidate의 route geometry와 routeModel로 한 번만 호출한다. `AltitudeWeatherComparison.jsx`는 한 행을 누르면 `selectCruiseAltitude()`만 호출하며 자동 브리핑을 생성하지 않는다.

행의 문구는 `FL230`, `평균 순풍 +8kt`, `착빙 보통 18NM`, `시간 판단 불가`처럼 사실만 표현한다. footer에는 스펙의 비권고 고지 한 줄을 항상 표시한다.

해외 segment가 포함돼 active Korean AIP constraint를 붙일 수 없으면 자동 고도 후보 행 대신 `공표 항공로 고도 제약 데이터 없음`을 표시한다. 현재 KIM/KTG cross-section은 해외 NWP adapter가 아니므로, 경로가 그 격자 범위 밖이면 사용자가 입력한 고도도 `고도 기상 비교 자료 없음`으로 표시한다. 해외 고도 기상값을 계속 제공한다고 약속하지 않으며, 해외 NWP adapter는 별도 범위다.

## 6. Phase 4 — 최종 브리핑

### 6.1 백엔드

새 `backend/src/briefing/route-weather-legs.js`의 `buildRouteWeatherLegs()`가 선택 routeModel의 `enRouteSegments[].startNm/endNm`과 `routeResult.navpointIds`를 경계로 leg를 나눈다. 별도의 marker 모델을 가정하지 않는다. `composeBriefing()`에서 `sections.enroute.legs`에 추가한다.

- leg에는 거리, true course, 선택고도, 거리 가중 바람·기온, 착빙/난류 노출, 위험·NOTAM·시간 상태만 넣는다.
- `minutes`, `groundSpeedKt`, `heading`, `fuel`, leg ETA는 반환하지 않는다.
- SID/STAR/IAP geometry는 leg 표에서 제외한다.

새 `backend/test/route-weather-legs.test.js`에서 segment 경계 4개/12개, 경계 접촉, 거리 가중, 고도 변경, 자료 없음과 시간을 검사한다.

### 6.2 프런트

④ 진입은 `continueToBriefing()`이며, 여기서 ETD/ETA·선택고도를 검증한다. `브리핑 생성`을 누르면 기존 `handleGenerateBriefing()`이 `/api/route-briefing`을 호출한다. 성공하면 MapView가 기존 `BriefingView`를 렌더하는 흐름은 유지한다.

`BriefingView.jsx`의 hazard ribbon 아래에 `RouteWeatherLegTable`을 넣는다. 데스크톱은 표, 모바일은 leg 카드다. 교체공항은 기존 destination/alternate summary에 남기며 candidate 카드에 반복하지 않는다.

## 7. 실행·검증 순서

각 번호를 마친 뒤 해당 테스트가 통과하지 않으면 다음 번호로 진행하지 않는다.

1. Phase 0 backend test + API client test.
2. Phase 1 `routePlanner.enroute.test.js` + hook 상태 초기화 회귀.
3. Phase 1 UI: `npm.cmd --prefix frontend test`, `npm.cmd --prefix frontend run build`, Playwright에서 RKJJ→RKPS 검색 후 ② 이동.
4. Phase 2 map tests + Playwright 카드 선택 시 지도 강조선 변경 + basemap 두 번 전환.
5. Phase 3 backend tests + 고도 선택 Playwright.
6. Phase 4 backend leg tests + 최종 브리핑 Playwright.
7. 마지막에 `npx depcruise .` 또는 `npx madge --circular .`, `npx knip`, `graphify update .`, frontend/backend 전체 테스트와 build를 실행한다.

추가 회귀 fixture: 수동 ETA, TAS/ETD 변경 뒤 stale 노출 응답 무시, route type 변경 뒤 후보 초기화, 개선 없는 후보 제거, 해외 교체공항의 비동기 목록 로드·출발/도착/FIR sentinel 제외, candidate+procedure source 분리, style 재설치다.

브라우저 증적은 `artifacts/responsive-screenshots/route-alternatives-flow/<timestamp>/`에 데스크톱·iPad 가로·모바일별로 저장하고, manifest에 route, 선택 candidate, 선택 고도, 위험 fixture와 결과를 기록한다.

## 8. 확정 UI/UX 설계

### 8.1 공통 레이아웃

- 데스크톱/iPad 가로: 기존 왼쪽 `route-check-panel`과 오른쪽 지도 구성을 유지한다. 패널은 현재 단계의 입력·비교·확정만 보이고, 지도는 항상 경로와 위험영역을 보인다.
- 패널 헤더 바로 아래에 `비행 설정 | 경로 비교 | 고도 비교 | 브리핑` 4개 탭을 고정한다. 활성 탭은 slate accent 밑줄, 완료 탭은 체크와 한 줄 요약, 선행 선택이 없는 탭은 비활성 상태로 표현한다.
- 탭은 제목만 바꾸는 장식이 아니다. `workflowStep`을 바꾸는 유일한 화면 전환이며, 전 단계의 확정 결과가 없으면 다음 탭으로 가지 못한다.
- 휴대폰은 지도와 4개 작업을 한 화면에 나란히 두지 않는다. 기존 `MobileSheet` 안에서 한 단계씩 보이고 footer가 단계의 다음 행동만 제공한다.

### 8.2 ① 비행 설정

필드 순서는 `IFR/VFR → 출발/도착 → 교체공항 → ETD/TAS/예상 ETA → 경로유형 → SID/STAR/IAP → 경로 검색`이다.

- ETA는 `TAS 기준 예상 · 바람 미반영` 또는 `사용자 입력 ETA` 출처를 함께 표시한다.
- 검색 전 지도에는 현재 선택 절차와 기본 경로 미리보기만 보인다.
- ②~④ 탭은 검색 전 비활성이다.

### 8.3 ② 경로 비교

패널 맨 위는 후보 카드보다 먼저 비교가 열린 근거를 보여 준다.

```text
기본 경로가 TS SIGMET 영역과 24 NM 수평 교차
예상 시간창과 위험기상 유효시간 겹침
```

각 후보 카드는 같은 세 줄 구조를 쓴다.

```text
기본 경로                         82 NM
TS SIGMET 수평 교차 24 NM
새 노출 없음 · 자료 13:10 KST

대안 A                           +18 NM
TS SIGMET 수평 교차 없음
새 노출: 최근 낙뢰 3건 · 고도 확인 필요
```

- 카드 전체가 버튼이다. 선택 카드는 slate 테두리와 왼쪽 강조선, `선택됨` 텍스트를 함께 보인다.
- 카드 색·순서는 안전·추천 순위를 뜻하지 않는다. 후보는 거리순이며, 위험 감소와 새 노출을 같은 무게로 쓴다.
- 목적지 TAF·공항 경보·교체공항 정보는 후보 카드마다 반복하지 않는다.
- 자동 탐색 대상 노출이 없으면 후보 카드 목록을 만들지 않는다. 기본 경로·자료 시각과 `대안 비교 대상 위험기상 노출 없음`을 표시하며, 이는 안전 판정이 아니다.

지도 표현:

- 선택 경로: slate accent 실선, width 5, opacity 1.
- 비선택 비교 경로: neutral stroke 실선, width 3, opacity 0.6.
- SID/STAR/IAP: 선택 경로에만 기존 procedure 색으로 유지.
- 위험기상 polygon: 기존 시맨틱 위험색·라벨·해칭을 유지한다.
- 지도 범례에는 `선택 경로 / 비교 경로 / 위험 영역`을 보인다.
- 첫 구현은 카드만 선택 수단으로 삼는다. 지도선 클릭 선택은 범위에서 제외한다.

### 8.4 ③ 고도 비교

선택 경로 하나만 지도에 강조한 상태에서, 왼쪽에는 계획고도 입력과 최대 다섯 행을 보인다.

```text
FL230  평균 순풍 +8kt   착빙 보통 18 NM   난류 없음
FL250  현재 선택         난류 보통 12 NM
FL270  평균 맞바람 4kt   자료 일부 없음
```

- 행 선택은 라디오형 선택과 `현재 선택` 텍스트를 함께 쓴다.
- 색만으로 좋은/나쁜 고도를 말하지 않는다. 공표 제약, 자료 없음, 시간 판단 불가는 해당 행의 텍스트 상태다.
- 연직단면은 이 표와 경쟁하지 않게 별도 `연직단면도 열기` 행동으로 둔다.

### 8.5 ④ 브리핑

상단에 확정 결과를 고정한다.

```text
RKJJ → RKPS · 대안 A · FL250 · ETD 10:00Z · 예상 ETA 11:18Z
```

그 아래는 출발, en-route leg별 기상, 도착, 교체공항 순서로 읽는다. ④는 새 경로/고도를 고르는 단계가 아니며, 마지막에만 `브리핑 생성`을 둔다. 교체공항은 후보 항로와 섞지 않고 도착 브리핑 영역에 별도로 둔다.

## 9. 변경하지 않는 것

- `MapView.jsx`에 새 route-alternative state/effect를 추가하지 않는다.
- `enroute.json` 구조나 AIP terminal procedure JSON을 바꾸지 않는다.
- TAS/GS/연료/성능/자동 우회 권고/안전·최적 판단을 추가하지 않는다.
- VAA/TCA adapter가 준비될 때까지 TS/CB 외 VA·TC 자동 탐색은 feature flag가 아니라 데이터 부재 상태로 보류한다.
