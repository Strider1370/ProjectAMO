# Plan: 위험기상 수평 교차와 경로 인접 분리

**Spec:** `docs/superpowers/specs/2026-07-23-horizontal-hazard-exposure-separation.md`
**Goal:** 2NM 항행 여유를 반영한 수평 교차와 30NM 경로 인접을 분리해, 경로 비교·고도 비교·정식 브리핑에서 같은 의미로 표시한다.

## Global Constraints

- 수평 교차는 계획 항로 중심선의 좌우 2NM 여유와 위험 폴리곤이 겹친 거리이며, 경로 인접은 2NM 밖부터 30NM 이내의 거리다.
- 기본·대안 경로는 고도와 무관하게 두 수평 결과만 표시한다. 고도 비교와 정식 브리핑의 `실제 조우`는 수평 교차·시간 일치·고도 일치가 모두 있을 때만 표시한다.
- 시간 불일치 advisory는 현재처럼 결과에서 제외한다. geometry 또는 시간·고도 정보가 불명확하면 기존 unavailable/partial 상태를 보존한다.
- SIGMET/AIRMET 수집·파싱·지도 폴리곤 렌더링·NOTAM 판정은 변경하지 않는다. 새 의존성도 추가하지 않는다.
- 경계 접촉은 별도 상태·표시·테스트를 만들지 않는다.

---

## Task 1: 연속 구간 기반의 공통 수평 관계 계산

**Files:**
- Modify: `backend/src/briefing/geo-time-match.js`
- Modify: `backend/src/briefing/hazard-exposure.js`
- Test: `backend/test/geo-time-match.test.js`
- Test: `backend/test/hazard-exposure.test.js`

**Interfaces:**
- Consumes: `axis.samples[]` (`distanceNm`, `lon`, `lat`), GeoJSON `Polygon`/`MultiPolygon`, `routeModel.enRouteRange`.
- Produces: `evaluateHorizontalExposure()` 반환값을 아래 호환 구조로 확장한다.
  ```js
  {
    status: 'intersects' | 'clear' | 'unavailable',
    intervals: [{ startNm, endNm }], // 기존 소비자용: 30NM 전체 합집합
    crossing: { intervals: [{ startNm, endNm }] }, // 2NM 항행 여유와 겹침
    nearby: { intervals: [{ startNm, endNm }] },   // 2NM 밖, 30NM 이내
  }
  ```

- [ ] Step 1: `geo-time-match.js`에 Polygon/MultiPolygon의 외곽과 hole을 모두 반영하는 점 포함 판정, 항로 선분과 ring의 교차 지점 계산, 선분-경계 최단거리 계산을 추가한다. 경로 축의 연속 샘플 사이를 분할해, 각 부분의 중간점이 폴리곤 내부인지와 경계까지의 거리를 판정한다.
- [ ] Step 2: 같은 파일에 인접한 동일 상태 조각만 병합해 `[{ startNm, endNm }]` 연속 구간을 만드는 helper를 추가한다. 폴리곤 재진입, MultiPolygon, hole 통과, 긴 변 중간을 지나는 근접 경로가 안전 구간을 포함하지 않도록 한다.
- [ ] Step 3: `hazard-exposure.js`에서 2NM 이내를 `crossing`, 2NM 초과·30NM 이내를 `nearby`로 분류하고 `enRouteRange`로 두 결과를 각각 자른다. 두 결과를 합친 `intervals`와 기존 `status`도 유지한다.
- [ ] Step 4: `backend/test/geo-time-match.test.js`에 실제 폴리곤 통과, 2NM 이내 비통과, 2NM 초과·30NM 이내, 30NM 밖, 재진입, MultiPolygon, hole, 긴 변 중간 근접을 추가한다. `backend/test/hazard-exposure.test.js`에는 두 결과가 겹치지 않고 기존 `status`가 유지됨을 추가한다.
- [ ] Step 5: Verify — `npm --prefix backend test -- --test-name-pattern "geo-time-match|hazard-exposure"`; 통과 기대.
- [ ] Step 6: Commit — `git add backend/src/briefing/geo-time-match.js backend/src/briefing/hazard-exposure.js backend/test/geo-time-match.test.js backend/test/hazard-exposure.test.js && git commit -m "Separate crossing and nearby route hazard exposure"`.

## Task 2: 백엔드 응답과 조우 의미 동기화

**Files:**
- Modify: `backend/src/briefing/route-exposure.js`
- Modify: `backend/src/briefing/hazard-section.js`
- Modify: `backend/src/briefing/altitude-weather-comparison.js`
- Modify: `backend/src/briefing/route-weather-legs.js`
- Modify: `backend/server.js`
- Modify: `backend/src/alerts/scheduler.js`
- Test: `backend/test/route-exposure.test.js`
- Test: `backend/test/hazard-section.test.js`
- Test: `backend/test/altitude-weather-comparison.test.js`
- Test: `backend/test/route-weather-legs.test.js`
- Test: `backend/test/alert-scheduler.test.js`

**Interfaces:**
- Consumes: Task 1의 `horizontalExposure.crossing.intervals` 및 `horizontalExposure.nearby.intervals`.
- Produces: 기존 `horizontalExposure`을 그대로 전달하고, 브리핑 위험 항목에는 `routeIntervalsNm: [{ startNm, endNm, relation: 'crossing' | 'nearby' }]`를 추가한다. 기존 `routeIntervalNm`은 첫 표시 구간으로 유지해 기존 소비자를 깨지 않는다.

- [ ] Step 1: `route-exposure.js`가 Task 1의 확장된 `horizontalExposure`을 API 응답에 그대로 보존하고, 시간 불일치 advisory를 계속 제외하는 회귀 테스트를 추가한다.
- [ ] Step 2: `hazard-section.js`에서 `routeIntervalsNm`을 수평 교차 구간 우선, 경로 인접 구간 다음 순서로 만든다. `encounter: 'on'`은 `crossing.intervals.length > 0`, 시간 일치, 고도 일치가 모두 있을 때만 설정하고, 경로 인접만 해당하면 `nearby`로 유지한다. 별도 `alertEligible`은 이전의 30NM 수평 해당·시간·고도 조건을 보존해, 화면 표기와 알림 정책을 분리한다. `hazardLevel()`도 `encounter`가 아니라 기존 30NM 적용 조건을 계속 사용한다.
- [ ] Step 3: `backend/server.js`의 `POST /api/briefing/altitudes`에서 요청의 `routeModel.enRouteRange`을 `buildAltitudeWeatherComparison()`에 전달한다. `altitude-weather-comparison.js`는 이를 `matchHazards()`와 `evaluateHorizontalExposure()`에 전달해 SID·STAR·IAP 구간의 advisory를 제외한다. 경로 인접 hazard는 en-route 범위 안에서는 고도 비교 사실로 계속 반환한다. `route-weather-legs.js`는 모든 `routeIntervalsNm`과 겹치는 leg에 hazard를 연결해 재진입 구간을 잃지 않게 한다.
- [ ] Step 4: `alerts/scheduler.js`가 `encounter` 대신 `alertEligible`을 사용해 기존 알림 범위를 보존하도록 수정한다. 백엔드 테스트에 경로 인접만인 hazard의 `encounter === 'nearby'` 및 기존 alert/severity 유지, 수평 교차+시간+고도 일치의 `encounter === 'on'`, 시간 불일치 제외, altitude API의 terminal-only hazard 제외, 교차/인접 다중 구간이 올바른 leg와 브리핑 구간에 연결됨을 고정한다.
- [ ] Step 5: Verify — `npm --prefix backend test -- --test-name-pattern "route exposure|hazard-section|altitude-weather-comparison|route-weather-legs"`; 통과 기대.
- [ ] Step 6: Commit — `git add backend/server.js backend/src/briefing/route-exposure.js backend/src/briefing/hazard-section.js backend/src/briefing/altitude-weather-comparison.js backend/src/briefing/route-weather-legs.js backend/src/alerts/scheduler.js backend/test/route-exposure.test.js backend/test/hazard-section.test.js backend/test/altitude-weather-comparison.test.js backend/test/route-weather-legs.test.js backend/test/alert-scheduler.test.js && git commit -m "Propagate separated route hazard exposure"`.

## Task 3: 경로 비교와 고도 비교 표시 분리

**Files:**
- Modify: `frontend/src/features/route-briefing/lib/routeComparison.js`
- Modify: `frontend/src/features/route-briefing/lib/routeComparison.test.js`
- Modify: `frontend/src/features/route-briefing/RouteAlternativesStep.jsx`
- Modify: `frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx`
- Modify: `frontend/src/features/route-briefing/AltitudeWeatherComparison.test.js`
- Modify: `frontend/src/features/route-briefing/RouteBriefing.css`

**Interfaces:**
- Consumes: Task 2의 `hazard.horizontalExposure.{crossing,nearby}.intervals`와 `hazard.encounter`.
- Produces: `relationExposureNm(hazard, relation)` 및 `mergeRelationExposureNm(hazards, relation)` 순수 helper, 그리고 기본·대안 경로 카드의 두 합계 및 위험기상별 두 라벨.

- [ ] Step 1: `routeComparison.js`에 관계별 구간 거리 합계와 관계별 겹침 제거 합계를 계산하는 pure helper를 추가한다. 이전 `exposureNm`/`mergeExposureNm`은 30NM 전체 합집합을 계속 반환해 다른 기존 호출자의 의미를 보존한다.
- [ ] Step 2: `RouteAlternativesStep.jsx`에서 기본 경로와 대안 경로 모두에 `수평 교차 N NM` 및 `경로 인접 (30NM) N NM`을 표시한다. 각 값이 0NM이면 그 줄을 생략하고, 카드 합계도 두 값으로 분리한다. 색만으로 의미를 전달하지 않고 각 라벨을 그대로 표시한다.
- [ ] Step 3: `AltitudeWeatherComparison.jsx`에서 위험기상별로 수평 교차와 경로 인접 거리를 구분해 표시한다. `실제 조우`는 Task 2의 `encounter: 'on'`일 때만, 나머지는 `인근`으로 표시한다.
- [ ] Step 4: `routeComparison.test.js`와 `AltitudeWeatherComparison.test.js`에 2NM 수평 교차와 30NM 경로 인접이 각각 합산·표시되는 fixture를 추가하고, 경로 인접만인 경우 `실제 조우`가 표시되지 않음을 검증한다.
- [ ] Step 5: Verify — `npm --prefix frontend test -- routeComparison`; 통과 기대.
- [ ] Step 6: Verify — `npm --prefix frontend test -- AltitudeWeatherComparison`; 통과 기대.
- [ ] Step 7: Verify — `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 8: Commit — `git add frontend/src/features/route-briefing/lib/routeComparison.js frontend/src/features/route-briefing/lib/routeComparison.test.js frontend/src/features/route-briefing/RouteAlternativesStep.jsx frontend/src/features/route-briefing/AltitudeWeatherComparison.jsx frontend/src/features/route-briefing/AltitudeWeatherComparison.test.js frontend/src/features/route-briefing/RouteBriefing.css && git commit -m "Show crossing and nearby hazard distances separately"`.

## Task 4: 정식 브리핑 표시와 계약 검증

**Files:**
- Modify: `frontend/src/features/route-briefing/BriefingView.jsx`
- Modify: `frontend/verification/route-fixture.mjs`
- Modify: `frontend/verification/contracts/route-workflow.spec.mjs`
- Modify: `frontend/verification/contracts/briefing-view.spec.mjs`
- Modify: `Architecture.md` (Backend 및 route-briefing File Roles의 수평 위험기상 계약 설명)
- Modify: `docs/superpowers/status/horizontal-hazard-exposure-separation.status.md`

**Interfaces:**
- Consumes: Task 2의 `routeIntervalsNm` 및 `horizontalExposure`.
- Produces: 정식 브리핑의 `수평 교차 start–endNM` 또는 `경로 인접 (30NM) start–endNM` 구간 문구와 결정론적 Playwright fixture.

- [ ] Step 1: `BriefingView.jsx`가 `routeIntervalsNm`의 모든 구간을 관계 이름과 함께 표시하도록 바꾼다. 기존 `routeIntervalNm`만 있는 과거 payload는 동일한 기존 형식으로 표시해 저장된/캐시된 응답을 깨지 않는다.
- [ ] Step 2: `route-fixture.mjs`에 하나의 수평 교차 hazard와 하나의 경로 인접 hazard를 포함한 route-exposure, altitude, briefing fixture를 추가한다. `route-workflow.spec.mjs`는 기본 경로와 생성한 대안 경로에서 두 라벨을 role/text selector로 확인한다. `briefing-view.spec.mjs`는 정식 브리핑에서 두 구간 문구를 확인한다.
- [ ] Step 3: `Architecture.md`의 `geo-time-match.js`, `hazard-exposure.js`, `hazard-section.js`, `route-exposure.js`, `route-weather-legs.js`, `routeComparison.js` File Roles를 새 2NM/30NM 계약과 다중 구간 보존 방식으로 갱신한다.
- [ ] Step 4: Verify — `npm --prefix backend test`; 통과 기대.
- [ ] Step 5: Verify — `npm --prefix frontend test`; 통과 기대.
- [ ] Step 6: Verify — `npm --prefix frontend run build`; 성공 기대.
- [ ] Step 7: Verify — `npx depcruise .`; 순환 의존성 또는 구조 위반 없음 기대.
- [ ] Step 8: Verify — `npx knip`; 이번 변경으로 생긴 미사용 export/import 없음 기대.
- [ ] Step 9: Verify — `npm.cmd run dev:contract -- --grep "route-workflow|briefing-view"`; 데스크톱·iPad·모바일 계약이 통과하고, `artifacts/`에 실패 스크린샷이 없는 것 기대.
- [ ] Step 10: Commit — `git add frontend/src/features/route-briefing/BriefingView.jsx frontend/verification/route-fixture.mjs frontend/verification/contracts/route-workflow.spec.mjs frontend/verification/contracts/briefing-view.spec.mjs Architecture.md docs/superpowers/status/horizontal-hazard-exposure-separation.status.md && git commit -m "Verify separated route hazard exposure"`.

## Decision Completeness Review — required before implementation

Use a fresh read-only reviewer to compare this plan with the approved spec. Record `PASS` or any `DECISION GAP` in `docs/superpowers/status/horizontal-hazard-exposure-separation.status.md`. Do not begin Task 1 until the reviewer returns PASS.
