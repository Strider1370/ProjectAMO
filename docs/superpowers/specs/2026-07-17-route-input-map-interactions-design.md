# 경로 입력 — 지도 인터랙션(클릭/그리기/구간우회) + 문자열 붙여넣기 디자인

> 작성: 2026-07-17. 상태: **승인됨(브레인스토밍 완료) → 리뷰 반영 완료, 구현 전.**
> 배경: 사용자가 "지금 방식(검색해서 하나씩 추가)이 불편할 것 같다"고 지적 → EFB(ForeFlight·Garmin Pilot 등) 4개 병렬 리서치로 가능한 입력 방식 11개 카탈로그 작성 → 이 중 지도 인터랙션 계열(클릭 추가, 자유곡선 그리기, 구간 드래그 우회)과 경로 문자열 붙여넣기를 이번 라운드에서 구현하기로 결정.
> **리뷰 반영(2026-07-17)**: 초안이 실제 코드와 다른 부분 2곳을 리뷰어가 발견 → §0·§2·§3·§5·§8 수정. (1) VFR 지도 클릭 추가는 이미 구현돼 있었음(`bindVfrInteractions`). (2) `buildBriefingRoute`는 경유 조건(via) 매개변수가 없어 "재호출"이 아니라 진입→경유·경유→이탈 두 번 계산해 잇는 새 로직이 필요함.

## 0. 배경 · 현재 상태 (조사 결과)

`frontend/src/features/route-briefing/`의 경로 입력은 VFR과 IFR이 완전히 다른 방식이다.

- **VFR**: `useRouteBriefing.js`의 `vfrWaypoints` 배열을 사람이 직접 편집. 검색으로 추가(`VfrFixSearch` → `addVfrWaypointByFix`, `useRouteBriefing.js:451`)뿐 아니라, **지도 위 경로선을 클릭해서 그 자리에 경유점을 끼워넣거나, 기존 경유점을 드래그해서 옮기는 기능도 이미 있다** (`routePreview.js`의 `bindVfrInteractions()`, L327-385 — `mousedown`으로 `ROUTE_PREVIEW_LINE_HIT`/`VFR_WP_CIRCLE` 레이어를 감지, `findInsertIndex`로 삽입 위치 계산). `MapView.jsx`가 이 함수를 실제로 호출해서 연결한다. 순서 변경, 웨이포인트별 고도 편집, 되돌리기(`vfrUndoStack`), 저장/불러오기, 파일 임포트(`routeImport.js`)도 있음.
- **IFR**: 사람이 웨이포인트를 직접 안 만진다. 출발/도착 공항 + 진입·이탈 지점(entry/exit fix) + routeType만 정하면 `routePlanner.js`의 `buildBriefingRoute()`(L393)가 **항로망(ENR 3.1/3.3 기반)을 따라 경로를 자동 계산**하고, `buildRouteAlternatives()`(L496)가 대안 경로 후보(`routeCandidates`/`selectedCandidateId`)까지 만들어준다. SID/STAR도 `recommendProcedures.js`가 자동 추천. **단, `buildBriefingRoute`는 진입점→이탈점 한 구간만 계산한다 — 경유 지점을 추가로 넣는 매개변수가 없다** (내부적으로 `findShortestPath(graph, ..., entryId, exitId, routeType)`를 한 번만 호출).
- **지도(`MapView.jsx`)**: **VFR용 클릭/드래그 핸들러(위 `bindVfrInteractions`)는 이미 연결돼 있다.** 없는 건 IFR용 지도 인터랙션과, NOTAM 마커 클릭(L301) 외의 다른 지도 상호작용이다.

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
        ├─ VFR: 기존 findInsertIndex(routePreview.js)로 vfrWaypoints에 끼워넣기 — 로직 재사용, 신규 없음(이미 지도에서 동작 중)
        └─ IFR: findShortestPath(entry→viaFix) + findShortestPath(viaFix→exit) 두 번 호출해 경로를 이어붙임
                (buildBriefingRoute는 viaFix 매개변수가 없어 "재호출"이 아니라 이 조합 로직을 새로 만들어야 함 — §0 참고)
        │
        ▼
적용 전 스냅샷을 undo 스택에 push (VFR: 기존 vfrUndoStack 재사용 / IFR: 동일 패턴으로 신설)
```

`resolveMapInteraction`이 이 스펙의 핵심 신규 로직이다. 나머지 3개 기능(그리기/구간우회/붙여넣기)은 전부 "여러 좌표를 순서대로 `resolveMapInteraction`에 넣고 결과를 이어붙이는" 확장이다:
- **그리기** = 드래그 중 일정 간격으로 샘플링한 좌표들을 순서대로 `resolveMapInteraction` 호출.
- **구간 드래그 우회** = 기존 경로에서 선택한 구간의 시작/끝 지점은 고정하고, 드래그로 지정한 새 중간 지점만 `resolveMapInteraction`에 넣어서 그 구간만 재계산.
- **문자열 붙여넣기** = 좌표가 아니라 텍스트 토큰이 입력이라는 점만 다름 — IFR은 토큰을 그대로 fix ID로 보고 항로망에서 유효성만 검사, VFR은 공백 구분 지점 ID 목록을 파싱해 `vfrWaypoints`로 변환. `resolveMapInteraction`과 별도의 `parseRouteString(text, flightRule)` 함수를 둔다(좌표가 아니라 텍스트가 입력이므로 좌표 스냅 로직과는 분리).

## 3. 컴포넌트 변경

- **모드 전환 버튼 그룹**(신규): `RouteBriefingPanel.jsx`에 검색/클릭추가/그리기/구간우회/붙여넣기 버튼. 기존 `VfrFixSearch` 자리 근처, 헌법 §5 토큰(버튼 스타일은 기존 Fluent 컴포넌트 재사용, 새 하드코딩 색 금지). VFR은 지금 `bindVfrInteractions`가 항상 켜져 있는데, 모드 버튼이 생기면 "클릭추가" 모드일 때만 활성화되도록 게이팅을 추가한다(다른 모드에서 실수로 경유점이 끼워지지 않게).
- **지도 이벤트 핸들러(IFR, 신규)**: `MapView.jsx`에 IFR용 `mousedown`/`mousemove`/`mouseup` 핸들러를 `bindVfrInteractions`와 같은 패턴으로 새로 추가. VFR용은 이미 있으니 모드 게이팅만 씌운다.
- **`resolveMapInteraction`, `applyRouteConstraint`, `parseRouteString`**(신규): `routePlanner.js`에 추가(기존 `buildBriefingRoute`/`buildVfrRoute`와 같은 파일 — 항로망 데이터를 이미 이 파일이 로드하고 있어서 재사용하기 쉬움). IFR용 "가장 가까운 유효 fix 찾기"는 `loadNavdata()`가 주는 navpoints를 순회하는 O(n) 선형 탐색으로 시작한다(공간 인덱스 없음) — `// ponytail: O(n) 선형 탐색, 체감 느려지면 KD-tree 등 공간 인덱스로 승격` 주석을 남긴다. 국내 FIR 규모(navpoints 약 1천~2천 개)면 1단계에서는 충분할 것으로 보되, Playwright 검증 때 실측한다.
- **경로 문자열 붙여넣기 입력창**(신규): 작은 텍스트 입력 + "적용" 버튼. IFR은 파싱된 지점들을 §2의 `applyRouteConstraint` 경유-조합 로직에 순서대로 전달, VFR은 `vfrWaypoints`로 직접 변환.
- **구간 드래그 우회용 UI**(신규): 기존 경로 라인 위에서 특정 구간을 선택 가능하게(지도 위 경로 렌더링에 선택 가능한 hit-area 추가) — 4단계 중 마지막이라 세부는 해당 단계 착수 시 재확인.

## 4. 에러 처리

- IFR에서 클릭/그리기 지점 근처에 유효한 항로 fix가 없으면 → `resolveMapInteraction`이 `null` 반환 → 적용 안 하고 "근처에 항로가 없습니다" 안내만 표시. 원래 경로는 그대로 유지. 탐색 반경은 **5nm**을 시작값으로 한다(국내 항로점 간 평균 간격을 감안한 추정치) — 1단계 구현 중 실제 항로망 밀도로 검증해 조정.
- 문자열 파싱: 토큰 단위로 개별 검증 — 실패한 토큰만 표시하고, 성공한 토큰들은 정상 반영. 전체 실패로 취급하지 않음(METAR TAC의 "찾은 것만 색칠, 못 찾으면 그냥 평문" 원칙과 동일한 정신 — 여기서는 "찾은 토큰만 적용, 못 찾은 토큰만 에러 표시").
- 모든 적용은 undo 가능 — 실수로 이상한 지점을 추가해도 한 번에 되돌릴 수 있어야 한다.

## 5. 구현 순서 (4단계, 각자 독립적으로 검증 가능)

1. **지도 클릭 추가** — VFR은 이미 되는 기능(`bindVfrInteractions`)에 모드 게이팅만 씌우고, IFR용은 `resolveMapInteraction`/`applyRouteConstraint`(경유-조합 로직 포함)를 여기서 새로 만든다. 이 단계가 두 함수의 기반을 확립.
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

- `frontend/src/features/route-briefing/lib/routePlanner.js` (수정 — `resolveMapInteraction`/`applyRouteConstraint`(IFR 경유-조합 포함)/`parseRouteString` 추가)
- `frontend/src/features/route-briefing/lib/routePreview.js` (수정 — `bindVfrInteractions`에 모드 게이팅 추가; 새로 만들 IFR 인터랙션 바인더도 이 파일에 추가하는 게 기존 구조와 일관적)
- `frontend/src/features/route-briefing/useRouteBriefing.js` (수정 — 모드 상태(`routeInteractionMode`), IFR용 undo 스택(`ifrUndoStack`) 신설)
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` (수정 — 모드 전환 버튼, 붙여넣기 입력창)
- `frontend/src/features/map/MapView.jsx` (수정 — IFR용 지도 이벤트 핸들러 연결. VFR용 `bindVfrInteractions` 연결부는 이미 있음)
- 각 신규 함수의 테스트 파일 (`routePlanner.test.js` 등, 단계별로 추가)

## 9. 리뷰에서 나왔지만 이번엔 반영 안 한 것

- **Codex와의 충돌 가능성**: 같은 브랜치(`feat/route-alternatives-flow`)에서 Codex가 `useRouteBriefing.js`/`RouteBriefingPanel.jsx`/`routePlanner.js`를 활발히 수정 중. 리뷰어는 "이 스펙의 신규 함수들이 기존 파일에 새 함수를 추가하는 형태라 구조적 충돌 위험은 낮다"고 평가함 — 실제 착수 시점(1단계 계획 작성 전)에 그 파일들의 최신 상태를 다시 확인하는 걸 전제로 한다.
