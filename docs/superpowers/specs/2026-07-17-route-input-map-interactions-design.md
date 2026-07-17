# 경로 입력 — 지도 인터랙션(클릭/그리기/구간우회) + 문자열 붙여넣기 디자인

> 작성: 2026-07-17. 상태: **승인됨(브레인스토밍 완료), 구현 전.**
> 배경: 사용자가 "지금 방식(검색해서 하나씩 추가)이 불편할 것 같다"고 지적 → EFB(ForeFlight·Garmin Pilot 등) 4개 병렬 리서치로 가능한 입력 방식 11개 카탈로그 작성 → 이 중 지도 인터랙션 계열(클릭 추가, 자유곡선 그리기, 구간 드래그 우회)과 경로 문자열 붙여넣기를 이번 라운드에서 구현하기로 결정.

## 0. 배경 · 현재 상태 (조사 결과)

`frontend/src/features/route-briefing/`의 경로 입력은 VFR과 IFR이 완전히 다른 방식이다.

- **VFR**: `useRouteBriefing.js`의 `vfrWaypoints` 배열을 사람이 직접 편집. 추가는 `VfrFixSearch`(검색 콤보박스, `RouteBriefingPanel.jsx:532`) → `addVfrWaypointByFix`(`useRouteBriefing.js:451`)만 존재. 순서 변경(드래그), 웨이포인트별 고도 편집, 되돌리기(`vfrUndoStack`), 저장/불러오기, 파일 임포트(`routeImport.js`)는 이미 있음.
- **IFR**: 사람이 웨이포인트를 직접 안 만진다. 출발/도착 공항 + 진입·이탈 지점(entry/exit fix) + routeType만 정하면 `routePlanner.js`의 `buildBriefingRoute()`(L393)가 **항로망(ENR 3.1/3.3 기반)을 따라 경로를 자동 계산**하고, `buildRouteAlternatives()`(L496)가 대안 경로 후보(`routeCandidates`/`selectedCandidateId`)까지 만들어준다. SID/STAR도 `recommendProcedures.js`가 자동 추천.
- **지도(`MapView.jsx`)**: 경로 입력용 클릭 핸들러가 **전혀 없음**(NOTAM 마커 클릭 하나뿐, L301). 지도를 눌러서 경로를 만드는 방법이 지금은 아예 없다.

## 1. 결정 사항

1. **범위**: 지도 클릭 추가 → 경로 문자열 붙여넣기 → 자유곡선 그리기 → 구간 드래그 우회, 4가지를 한 번에 설계하되 **공통 기반 1개 + 4단계 순차 구현**으로 나눈다(스펙 1개, 구현은 단계별).
2. **모드 전환은 버튼으로 명시적으로** — 지도가 항상 클릭에 반응하면 실수로 엉뚱한 지점이 추가될 위험이 있어서, "검색 / 클릭추가 / 그리기 / 구간우회 / 붙여넣기" 모드를 버튼으로 골라야 해당 인터랙션이 켜진다.
3. **IFR도 지도 인터랙션을 다 지원한다** — 단, "아무 좌표"가 아니라 항로망 위의 유효한 지점으로 변환한 뒤 기존 자동 계산 엔진(`buildBriefingRoute`)에 경유 조건으로 넣는다. VFR은 좌표(또는 근처 항행지점)를 그대로 웨이포인트로 쓴다. **이 변환 로직(좌표→유효 지점)이 4가지 기능이 공유하는 핵심 재료다.**
4. **재계산 결과는 미리보기 없이 바로 반영**하고, 기존 되돌리기(undo) 스택으로 백업한다 — VFR에 이미 있는 `vfrUndoStack` 패턴을 IFR에도 동일하게 적용.
5. **에러 처리**: 클릭/그리기 지점 근처에 유효한 항로가 없으면(IFR) 조용히 실패하고 안내 메시지만 띄운다(이상한 경로를 만들지 않음). 문자열 파싱 실패는 실패한 토큰만 표시하고 나머지는 정상 적용 — METAR TAC 작업 때와 같은 "부분 실패해도 전체가 안 죽는다" 원칙.

## 2. 아키텍처

```
[지도 UI] 클릭 / 드래그 / 자유곡선(연속 좌표)
        │
        ▼
resolveMapInteraction(coord, { flightRule, navdata })   ← 신규 공통 함수
        │
        ├─ VFR: 좌표 그대로, 또는 근처(반경 내) 항행지점이 있으면 그 지점으로 스냅
        └─ IFR: 항로망(loadNavdata/loadRouteDirectionMetadata로 이미 로드되는 ENR 3.1/3.3 그래프)에서
                가장 가까운 유효 fix를 찾아 반환. 근처에 없으면 null(실패로 처리, §1-5)
        │
        ▼
applyRouteConstraint(point, { flightRule, mode })        ← 신규 공통 함수
        │
        ├─ VFR: 기존 findInsertIndex(routePreview.js)로 vfrWaypoints에 끼워넣기 — 로직 재사용, 신규 없음
        └─ IFR: 그 지점을 경유 조건(viaFix)으로 buildBriefingRoute 재호출 → routeResult 갱신
        │
        ▼
적용 전 스냅샷을 undo 스택에 push (VFR: 기존 vfrUndoStack 재사용 / IFR: 동일 패턴으로 신설)
```

`resolveMapInteraction`이 이 스펙의 핵심 신규 로직이다. 나머지 3개 기능(그리기/구간우회/붙여넣기)은 전부 "여러 좌표를 순서대로 `resolveMapInteraction`에 넣고 결과를 이어붙이는" 확장이다:
- **그리기** = 드래그 중 일정 간격으로 샘플링한 좌표들을 순서대로 `resolveMapInteraction` 호출.
- **구간 드래그 우회** = 기존 경로에서 선택한 구간의 시작/끝 지점은 고정하고, 드래그로 지정한 새 중간 지점만 `resolveMapInteraction`에 넣어서 그 구간만 재계산.
- **문자열 붙여넣기** = 좌표가 아니라 텍스트 토큰이 입력이라는 점만 다름 — IFR은 토큰을 그대로 fix ID로 보고 항로망에서 유효성만 검사, VFR은 공백 구분 지점 ID 목록을 파싱해 `vfrWaypoints`로 변환. `resolveMapInteraction`과 별도의 `parseRouteString(text, flightRule)` 함수를 둔다(좌표가 아니라 텍스트가 입력이므로 좌표 스냅 로직과는 분리).

## 3. 컴포넌트 변경

- **모드 전환 버튼 그룹**(신규): `RouteBriefingPanel.jsx`에 검색/클릭추가/그리기/구간우회/붙여넣기 버튼. 기존 `VfrFixSearch` 자리 근처, 헌법 §5 토큰(버튼 스타일은 기존 Fluent 컴포넌트 재사용, 새 하드코딩 색 금지).
- **지도 이벤트 핸들러**(신규): `MapView.jsx`에 모드별 `click`/`mousedown`+`mousemove`+`mouseup`(드래그·그리기용) 핸들러 추가. 지금 있는 `onNotamClick`(L301) 패턴을 참고하되 별도 핸들러로 분리(NOTAM 클릭과 충돌 안 나게 모드가 켜져 있을 때만 활성화).
- **`resolveMapInteraction`, `applyRouteConstraint`, `parseRouteString`**(신규): `routePlanner.js`에 추가(기존 `buildBriefingRoute`/`buildVfrRoute`와 같은 파일 — 항로망 데이터를 이미 이 파일이 로드하고 있어서 재사용하기 쉬움).
- **경로 문자열 붙여넣기 입력창**(신규): 작은 텍스트 입력 + "적용" 버튼. IFR은 파싱 결과를 경유 조건으로 `buildBriefingRoute`에 전달, VFR은 `vfrWaypoints`로 직접 변환.
- **구간 드래그 우회용 UI**(신규): 기존 경로 라인 위에서 특정 구간을 선택 가능하게(지도 위 경로 렌더링에 선택 가능한 hit-area 추가) — 4단계 중 마지막이라 세부는 해당 단계 착수 시 재확인.

## 4. 에러 처리

- IFR에서 클릭/그리기 지점 근처에 유효한 항로 fix가 없으면 → `resolveMapInteraction`이 `null` 반환 → 적용 안 하고 "근처에 항로가 없습니다" 안내만 표시. 원래 경로는 그대로 유지. 탐색 반경은 **5nm**을 시작값으로 한다(국내 항로점 간 평균 간격을 감안한 추정치) — 1단계 구현 중 실제 항로망 밀도로 검증해 조정.
- 문자열 파싱: 토큰 단위로 개별 검증 — 실패한 토큰만 표시하고, 성공한 토큰들은 정상 반영. 전체 실패로 취급하지 않음(METAR TAC의 "찾은 것만 색칠, 못 찾으면 그냥 평문" 원칙과 동일한 정신 — 여기서는 "찾은 토큰만 적용, 못 찾은 토큰만 에러 표시").
- 모든 적용은 undo 가능 — 실수로 이상한 지점을 추가해도 한 번에 되돌릴 수 있어야 한다.

## 5. 구현 순서 (4단계, 각자 독립적으로 검증 가능)

1. **지도 클릭 추가** — `resolveMapInteraction`/`applyRouteConstraint` 기반을 여기서 확립. VFR·IFR 둘 다 커버.
2. **경로 문자열 붙여넣기** — 1단계 기반 위에 `parseRouteString`만 추가.
3. **자유곡선 그리기** — 1단계 기반 위에 "연속 좌표 처리" 추가.
4. **구간 드래그 우회** — 기존 경로의 특정 구간만 재계산하는 부분이 제일 까다로워서 마지막.

각 단계는 별도 구현 계획(plan) 문서로 쪼갠다 — 이 스펙 문서는 4단계 전체의 공통 설계 기준점 역할만 한다.

## 6. 테스트

- `resolveMapInteraction`/`applyRouteConstraint`: 단위 테스트 — VFR 좌표 스냅, IFR 항로 fix 스냅 성공/실패(근처에 항로 없음) 케이스.
- `parseRouteString`: 정상 파싱, 일부 토큰 실패 시 나머지는 정상 반영되는지.
- Playwright: 지도 클릭으로 VFR/IFR 각각 경유점 추가 → 경로 갱신 확인, undo로 되돌리기 확인, 모드 버튼 전환 시 이전 모드 핸들러가 비활성화되는지 확인.

## 7. 범위 밖

- 관제 이력 기반 추천 경로(패턴 6번, 별도 대화에서 이미 데이터 소스 부재로 제외 결정됨).
- 항로망 자체를 이용한 "출발-도착 최적 경로 자동 계산 알고리즘 고도화"는 이미 `buildBriefingRoute`가 하고 있어 이번 스펙의 범위가 아님(입력 UX만 다룸).
- 구간 드래그 우회의 세부 상호작용(어디를 눌러야 "구간 선택"이 되는지 등)은 4단계 착수 시점에 재확정 — 지금은 아키텍처 수준 결정만.

## 8. 영향받는 파일 (전체 4단계 기준, 단계별로 나눠서 실제 구현)

- `frontend/src/features/route-briefing/lib/routePlanner.js` (수정 — `resolveMapInteraction`/`applyRouteConstraint`/`parseRouteString` 추가)
- `frontend/src/features/route-briefing/useRouteBriefing.js` (수정 — 모드 상태, IFR용 undo 스택 추가)
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` (수정 — 모드 전환 버튼, 붙여넣기 입력창)
- `frontend/src/features/map/MapView.jsx` (수정 — 모드별 지도 이벤트 핸들러)
- 각 신규 함수의 테스트 파일 (`routePlanner.test.js` 등, 단계별로 추가)
