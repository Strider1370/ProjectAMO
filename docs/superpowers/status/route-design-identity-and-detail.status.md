# 경로 설계안 색상 구분·표시 토글·위험기상 상세 Status

Updated: 2026-07-21 21:30 KST
Spec: docs/superpowers/specs/2026-07-21-route-design-identity-and-detail.md
Plan: docs/superpowers/plans/2026-07-21-route-design-identity-and-detail.md

## Resume Point

- Last completed: Task 2(`521e5d5`) — 지도 색상·숨김 필터 적용. Task 1(`6d89b0c`)도 완료.
- Next: Task 3 — 패널 색 점·눈 아이콘. 시작 전 사용자에게 지도 색상이 실제로 잘 보이는지 확인 요청함(내 스크립트는 로그인 세션이 없어 시각 확인 못 함).

## Regression Guard (2026-07-21)

- `trimRouteLineForProcedures()` is display-only. When it removes the departure coordinate for a SID, it carries `sourceIndexOffset: 1` on the rendered route line.
- `bindVfrInteractions()` keeps the displayed index for the temporary drag line, then restores the offset only for the route-editor insertion index. The model index must always refer to the untrimmed route model.
- Cause: `d57b5b2` trimmed the visible line but left the drag index unadjusted, shifting a waypoint one segment earlier. Covered by `routePreview.test.js` with a SID-trim drag regression test.

## Verified

- 지도 경로선 렌더링 위치 확인: `routePreview.js:198-261`(`ROUTE_BASELINE_LINE`, `ROUTE_DESIGN_LINE` 레이어), `routePreviewSync.js:152-241`(feature 생성, 이미 `designId`/`selected` 프로퍼티 부여).
- 현재는 선택 시 주황(`#f97316`)/미선택 시 회색(`#64748b`) 두 색뿐, 경로별 고유색 없음.
- `MAX_ROUTE_DESIGNS = 4`(기본+A+B+C, `routeDesigns.js:1`) — 사용자가 언급한 "D까지"는 실제로는 불가능, 대화에서 정정함.
- 기본 경로에 `onClick`이 없어 선택 불가했던 문제 원인 확인 및 수정 완료.
- `hazard.bandFt` 형태는 `{ lowFt, highFt }`(`planned-altitude.js:39-44`)로, `AltitudeWeatherComparison.jsx`의 `altitudeLabel()`이 쓰는 `{ lower_fl, upper_fl }`과 달라 재사용 불가 — 새 헬퍼 필요함을 확인.
- `timeStatus` 가능한 값: `'matched' | 'not_provided' | 'unavailable' | null`(`shared/briefing-status.js:16-20`).

## Verified (리뷰 이후 추가)

- 독립 리뷰어가 스펙·계획을 코드와 대조 검증함. 블로킹 이슈 1건(대안 카드가 `<button>` 전체라 눈 아이콘용 중첩 `<button>`을 넣을 수 없음) 발견 → 계획 Task 3 Step 4를 대안 카드를 `<div role="button" tabIndex={0}>`로 바꾸는 방식으로 확정 수정함(기본 경로에서 이미 쓴 형제-버튼 패턴과 동일 원리).
- `bandFt`/`timeStatus` 필드 형태, CSS 클래스(`.rb-card-hazard-detail`/`.rb-card-detail-line`) 기존 존재 여부, FR-001~007 전부 태스크 매핑됨을 리뷰어가 재확인함.
- Mapbox paint 표현식에 `['coalesce', ['get','color'], '#f97316']` 방어 코드 추가(일부 feature에 `color`가 안 붙으면 표현식 전체가 깨지는 것 방지) — 리뷰 권고 반영.

## Deviations from Plan

- 사용자 지적으로 색 구분 범위를 en-route 구간만으로 좁힘(원래 계획은 SID/STAR까지 포함한 전체 선을 색칠). 코드 확인 결과 "우회안 만들기"는 SID/STAR/IAP를 그대로 복사하고 이후 어떤 편집 경로도 절차를 바꾸지 않아, 절차 구간은 모든 설계안이 완전히 같은 좌표 — 색을 칠하면 같은 자리에 여러 색이 겹쳐 그려지는 착시만 생겨서 제외함. 스펙 FR-002·Non-Goals, 계획 Task 2 Step 3에 반영. `route-design-line`은 이제 `displayPreview()`(절차 병합) 대신 원본 `rawLine`을 쓰고, 절차 자체는 기존 `PROC_PREVIEW_SOURCE`가 그대로 그린다.
- 색 점 위치를 카드 이름(`<strong>`) 바로 옆으로 사용자가 직접 지정함(브라우저 요소 선택으로 확인) — 계획 Task 3과 일치, 변경 없음.

## Verified (Task 1-2 완료 후)

- `routePreviewSync.js` 호출부는 `MapView.jsx:436`의 `syncRoutePreviewLayers(map, routePreviewModel)` — `routePreviewModel`은 `useRouteBriefing.js:182`의 `buildRoutePreviewModel()`이 만듦. `hiddenRouteDesignIds`를 이 경로(훅 상태 → buildRoutePreviewModel 입력 → routePreviewModel → syncRoutePreviewLayers)로 전부 연결함.
- `routePreviewSync.test.js`가 이미 존재했고(계획엔 "존재 여부 미확인"이라고만 되어 있었음) 이번에 건드린 다중 설계안 비교 분기를 이미 3개 테스트가 커버하고 있었음 — 전부 통과. 색상·숨김 신규 동작을 검증하는 테스트 2개를 추가함(14/14 통과).
- 다중 설계안 비교 분기는 `baseDesign && routeDesigns.length > 1`(154행 부근)이 항상 참이라 원래 있던 두 번째 `else if (routeDesigns.length > 1)` 분기(230행 부근)는 사실상 도달 불가능한 코드임을 확인 — 그쪽은 이번 작업에서 건드리지 않음(불필요).
- `route-design-line`을 절차 병합 전 원본 선(`rawLine`)으로 바꿈 — SID/STAR는 `PROC_PREVIEW_SOURCE`가 그대로 그림.

## Unverified / Skipped

- **지도 실제 렌더링(색상)을 육안으로 확인 못 함.** 독립 캡처 스크립트가 라이브 dev 서버에 붙는데, 새 Playwright 브라우저 컨텍스트라 로그인 세션이 없어 `/api/auth/me` 401이 뜨고 지도가 빈 화면으로 나옴. 경로 비교 로직과 무관함(빈 페이지 로드에서도 재현 확인). 유닛 테스트(GeoJSON feature의 `color`/제외 여부)로만 검증했음 — 사용자의 이미 로그인된 탭에서 육안 확인 필요.
