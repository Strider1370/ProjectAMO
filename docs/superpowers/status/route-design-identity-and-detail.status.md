# 경로 설계안 색상 구분·표시 토글·위험기상 상세 Status

Updated: 2026-07-21 10:45 KST
Spec: docs/superpowers/specs/2026-07-21-route-design-identity-and-detail.md
Plan: docs/superpowers/plans/2026-07-21-route-design-identity-and-detail.md

## Resume Point

- Last completed: 스펙·계획 작성 완료(구현 미착수). 기본 경로 선택 버그는 별도로 이미 수정·커밋됨(`858cb36`, 이번 스펙 범위 밖 선행 작업).
- Next: Task 1 Step 1 — `routeDesignColors.js` 작성.

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

## Unverified / Skipped

- `routePreviewSync.js`를 실제로 호출하는 지점(MapView.jsx 내 정확한 위치)은 아직 안 찾음 — Task 2 Step 1에서 확인 예정.
- `frontend/src/features/route-briefing/lib/routePreviewSync.test.js` 존재 여부 미확인.
- 계획의 다른 줄번호(routePreviewSync.js 154/176/179/180/187/196/203/209/238행)는 이전 커밋 이후 밀렸을 수 있어 구현 시 grep으로 재확인 필요(계획에 명시함).
