# 비행계획 입력 — 첫 번째 탭 구현 계획

> 기준: `docs/superpowers/specs/2026-07-18-flight-plan-input-first-tab-design.md`
> 범위: 기본 경로 입력만. 대체 경로 비교 탭은 변경하지 않는다.

## 구현 가능성 검토

구현은 가능하다. 다만 현재 Phase 1~4의 `viaFixes` 모델만으로는 절차 미선택 문자열, DCT 좌표 waypoint, 적용 전 지도 미리보기를 정확히 표현할 수 없다. 아래 전환이 필요하다.

재사용 기반은 이미 있다.

- 절차·IAP 연동: `useRouteBriefing.js`, `procedureData.js`, `routeBriefingModel.js`
- 항로 그래프·거리·기상 노출: `routePlanner.js`, `buildCommonRouteModel`, `fetchRouteExposure`
- 지도 layer/binder: `routePreview.js`, `routePreviewSync.js`, `MapView.jsx`
- 설계안 복제·선택·undo: `routeDesigns.js`
- ETA 계산: `etaCalc.js`

현재 코드와 스펙의 차이도 명확하다.

1. `buildBriefingRoute()`는 entry/exit FIX가 필수여서 절차 미선택 수동 경로를 만들 수 없다.
2. `parseRouteString()`은 직접 인접한 항공로 구간만 읽어, `FIX airway FIX`의 중간 FIX 확장을 못 한다.
3. IFR 클릭/그리기는 즉시 확정하며 DCT 좌표와 확인 카드를 지원하지 않는다.
4. 자유곡선은 좌표를 모으지만 임시 선을 렌더하지 않는다.
5. 공항 변경은 자동 절차 검색을 예약하고 VFR은 즉시 확정한다.

## 데이터 계약

### 세 상태

`useRouteBriefing`에 아래를 분리한다.

| 상태 | 목적 | 하류 전달 |
|---|---|---|
| `baselinePreview` | 공항 두 개의 옅은 직선 | 없음 |
| `routeDraft` | 문자열·자동 생성·지도 제안의 미적용 초안 | 없음 |
| `routeDesigns[base]` | 적용된 기본 경로의 유일한 소유자 | 고도·브리핑·대체안 복제 |

공항/비행 규칙/절차 변경은 기준선과 초안만 갱신한다. 적용된 경로는 자동으로 덮지 않는다. 적용 후 기본 경로의 단일 소유자는 항상 `routeDesigns`의 `base`다. 호환 때문에 남아 있는 `routeResult`와 `routeExposure`는 선택된 설계안에서만 동기화하는 파생 mirror이며, 독립적으로 수정하지 않는다.

### en-route 입력

`routeDesigns.js`의 기본 경로와 `routeDraft`는 같은 `enroute` 구조를 쓴다.

    {
      tokens: [
        { kind: 'fix', id: 'OSPAT' },
        { kind: 'airway', id: 'Y711' },
        { kind: 'fix', id: 'GONA' },
        { kind: 'dct' },
        { kind: 'user-waypoint', id: 'user-wp-1' },
      ],
      userWaypoints: [{ id: 'user-wp-1', name: 'WP1', lat: 37.3567, lon: 127.2133 }],
    }

- 화면은 `WP1`을 표시하고, 외부 호환 문자열은 `N3721.4E12712.8` 단일 좌표 토큰을 출력한다.
- SID/STAR/IAP·공항은 en-route 문자열에 넣지 않는다.
- 기존 `viaFixes`는 이전 설계안 호환을 위해 읽을 수 있으나, 새 첫 번째 탭의 원본으로는 쓰지 않는다.

### 수동 경로 결과 계약

사용자 waypoint를 기존 navdata FIX처럼 가장하면 안 된다. `buildManualIfrRoute()`와 VFR 생성기는 아래 공통 결과를 만들고, 지도·거리·문자열·highlight는 이 결과만 읽는다.

```js
manualRoute: {
  points: [{ id, kind: 'published-fix' | 'user-waypoint', label, coordinates, editable }],
  legs: [{ kind: 'airway' | 'dct', routeId: null | 'Y711', pointIds: ['…', '…'] }],
  geometry, distanceNm, displayTokens,
}
```

- 공개 FIX와 항공로의 내부 FIX는 `editable: false`; en-route token endpoint와 사용자 waypoint만 `editable: true`다.
- DCT leg는 `kind: 'dct'`, `routeId: null`이며 navdata segment가 아니어도 된다.
- 기존 `routeResult` 소비자는 이 공통 결과에서 제공하는 geometry/distance/displayTokens adapter로 이행한다. `buildCommonRouteModel`, exposure, vertical profile, briefing에는 geometry만 전달하고 navpoint lookup을 요구하지 않게 검증한다.
- 항공로 내부 FIX를 누르면 `항공로 내부 지점은 직접 삭제할 수 없습니다`라고 안내한다. 삭제하려면 문자열에서 항공로 구간을 분해하는 후속 기능이 필요하며 이번 범위에 넣지 않는다.

### 수동 IFR 경로 생성

`routePlanner.js`에 `buildManualIfrRoute({ departureAirport, arrivalAirport, enroute, routeType })`를 추가하고, 위 `manualRoute` 결과를 기존 화면/브리핑 계약으로 어댑트한다.

- 공개 FIX와 항공로는 기존 그래프를 재사용한다.
- `FIX airway FIX`는 해당 항공로만 따라가며 중간 FIX를 확장한다.
- `DCT`는 공개 FIX/사용자 waypoint 사이의 사용자가 지정한 직선 기하로 만든다. 승인·안전 판단은 하지 않는다.
- SID/STAR는 전체 계획 표시·지도 procedure preview에만 합성하며 en-route 입력을 바꾸지 않는다.
- 토큰·좌표·연결 중 하나라도 실패하면 예외를 반환하고 기존 적용 경로를 보존한다.

### 적용 절차 projection 이행표

현재 전역 `selectedSid`, `selectedStar`, `selectedIapKey`, `routeForm`, `routeResult`의 소비처를 다음 규칙으로 이행한다.

| 소비처 | 읽을 값 |
|---|---|
| 첫 번째 탭 절차 picker·문자열·전체 계획 초안 표시 | `routeDraft` |
| 적용 지도 procedure preview·거리·route preview model | 선택된 design의 `routeForm`·`procedures`·`routeResult` |
| 노출·고도·연직단면·브리핑 payload | 선택된 design의 `routeResult`·`routeModel` |
| 두 번째 탭 | 기존 선택 design 값만, UI 변경 없음 |

`selectedSid/Star/Iap` 전역 상태는 적용 design projection으로만 유지하거나 제거한다. 초안 picker가 이 값을 직접 바꾸는 경로는 남기지 않는다.

첫 번째 탭 진입은 `projectBaseForSettings()` 단일 전환을 호출한다. 이 함수는 `selectedRouteDesignId='base'`로 바꾸고 routeResult mirror, selected procedure projection, routePreviewModel/map source를 같은 base 값으로 동기화한다. 따라서 대체안 선택 뒤 첫 번째 탭에 들어가도 base form과 alternate map이 섞일 수 없다. 두 번째 탭 복귀는 base 선택에서 시작한다. base 적용은 `replaceBaseAndClearAlternatives()` 하나로 base 교체·대체안 폐기·선택 id를 base로 변경한다. 이를 여러 setState로 쪼개지 않아 중간에 대체안이 briefing으로 노출되지 않게 한다.

### DCT route model 결정

`shared/route-model.js`를 확장해 manual leg를 정식 지원한다. `buildManualIfrRoute()` adapter는 `routeResult.manualLegs`와 preview GeoJSON의 `route-segment-line` feature를 함께 낸다. leg는 `{ id, kind: 'airway' | 'dct', routeId, fromFix, toFix, geometry, routeType }`이고 DCT id는 `dct:<fromPointId>:<toPointId>`, `routeId:null`, `routeType:null`이다. from/to는 published FIX의 id 또는 user waypoint id와 표시 label을 모두 보존한다. `buildCommonRouteModel()`은 `manualLegs`가 있으면 그것을 en-route segments의 원본으로 사용하고, 각 leg geometry를 `finalRouteGeometry` 축에 정렬한다. 모든 leg가 정렬되면 DCT가 있어도 `enRouteRange.status:'aligned'`, `graphConnectionStatus:'manual'`을 낸다.

backend AIP 제약은 `kind === 'dct'`를 snapshot·미해결 id·제약 계산 전에 제외한다. altitude candidate에는 airway constraint만 전달하며 airway leg가 하나도 없으면 결과는 실패가 아니라 `not_applicable`이다. provenance는 모든 manual leg의 id/kind와 `graphConnectionStatus:'manual'`을 남기되 미해결 AIP id에는 airway leg만 넣는다. 예: `A Y711 B DCT WP1 DCT C`는 Y711 airway constraint 하나, DCT manual leg 둘, 정렬된 final geometry 하나를 만든다. 노출·연직단면·브리핑은 그 final geometry와 route model을 함께 받는다. 이 변경 파일은 `shared/route-model.js`와 테스트, `backend/src/briefing/aip-airway-constraints.js`와 테스트, altitude/provenance 테스트다.

### VFR 범위

이번 구현은 IFR와 VFR 모두 지원한다. VFR은 airway 토큰을 허용하지 않고, 공개 FIX·DCT 좌표·사용자 waypoint만 쓰는 동일한 `enroute`/draft/pending 흐름을 사용한다. 공항 선택 후에는 IFR와 똑같이 기준선만 보이며, 지도 클릭·그리기·삭제는 모두 확인 카드와 undo를 거친다. 기존 VFR 즉시 삽입·드래그 확정은 제거한다.

### routeType과 자동 생성 결정

- RNAV/ATS 선택 UI를 제거한 뒤 새 수동/자동 기본 경로는 `routeType: 'ALL'`로 저장한다. legacy design의 기존 값은 보존한다.
- 명시적 `자동 생성` 버튼은 현재의 기존 runway/procedure 선택 로직을 그대로 사용한다. 이 로직이 이미 가진 METAR 입력은 새 데이터가 아니며, 버튼을 누른 경우에만 사용한다. 결과는 추천이나 안전 판단이 아닌 `자동 생성 초안`이다.

## 단계별 작업

### 0. 기준선과 초안 상태 분리

**파일:** `useRouteBriefing.js`, `routeBriefingModel.js`, `routeBriefingModel.test.js`, `routeDesigns.js`, `routeDesigns.test.js`

1. `routeDraft`, `baselinePreview`, `etaMode`, `pendingRouteEdit` 상태를 추가한다. `routeDesigns[base]`만 적용 경로의 단일 소유자로 정하고, `routeResult` mirror를 갱신하는 공통 `select/commit` 경로를 만든다.
   - `routeDraft = { routeForm, procedures, enroute }`로 두고 절차 UI는 초안만 바꾼다.
   - base design은 이 입력의 독립 복사본을 소유하며, routeResult/procedure preview/briefing은 base에서만 파생한다.
2. `routeDesigns.js`가 `enroute.userWaypoints`와 undo를 깊게 복제하게 한다.
3. 공항 두 개를 고르면 실제 `routeResult`/설계안/API 호출 없이 기준선만 만든다.
4. preview model에 기준선 role을 추가하고 hit 영역을 만들지 않는다.
5. 공항·비행 규칙·절차 변경의 `setAutoRecommendRequested(true)`를 제거한다. VFR 자동 확정 effect도 기준선 준비만 하게 바꾼다.
6. `settings → compare` 자동 이동을 없앤다. 첫 번째 탭에서 적용해도 `settings`에 머물고, base가 있을 때만 사용자가 두 번째 탭을 열 수 있다.
7. 공항/비행 규칙 변경은 먼저 `pendingContextChange`를 연다. 취소 시 무변경, 승인 시에만 요청을 취소하고 base와 대체안을 폐기한 뒤 새 기준선·빈 초안으로 전환한다.
8. VFR `vfrWaypoints`의 import·undo·저장 경로를 draft/base manual point 목록으로 어댑트한다. 기존 파일 import와 저장 경로의 waypoint 순서·좌표 회귀 테스트를 추가한다.
9. `routeStore.js`, `routeImport.js`, VFR altitude 관련 caller를 목록화해 `{ id, uid, lon, lat, fixed, altitudeFt, named }`가 save/load/import/undo에서 그대로 보존되는 migration matrix를 테스트로 고정한다.
10. 저장 snapshot v2를 추가한다. `{ version:2, base:{ routeForm, procedureIds, enroute, nextWaypointNumber, etaMode, manualEta }, flight:{ cruiseAltitudeFt, tasKt, etd, alternateAirport }, vfrWaypoints }`를 저장한다. procedure object·draft·pending은 저장하지 않는다. load는 v2를 먼저 복원하고 적용 base에서 draft를 복제한다. v1의 routeForm/flight/VFR waypoint를 v2로 이행하며, 누락 procedure key는 비선택으로 한다. 숨긴 alternateAirport도 보존한다. IFR DCT/rename, manual ETA와 TAS/ETD 기반 자동 ETA, VFR uid/fixed/altitude의 save→load, import→undo round-trip을 각각 테스트한다.

**완료 조건:** 공항 선택 직후 절차·문자열·설계안은 비어 있고 지도에는 편집 불가능한 직선만 보인다.

### 1. 문자열 적용과 자동 생성 초안

**파일:** 새 `manualRouteInput.js`, 새 `manualRouteInput.test.js`, `routePlanner.js`, `routePlanner.enroute.test.js`, `useRouteBriefing.js`, `etaCalc.test.js`

1. 순수 파서/포매터를 만든다. 공개 FIX, 항공로, DCT, 단일 좌표 토큰, 현재 초안의 사용자 waypoint 이름만 허용한다.
2. `buildManualIfrRoute()`와 VFR 수동 생성기를 기존 그래프 탐색과 GeoJSON 생성 코드를 추출·재사용해 구현한다. 둘 다 `manualRoute` point/leg 계약과 기존 adapter를 만든다. adapter는 DCT에도 `routeId:null`, endpoint 좌표, route-segment feature를 제공하거나 `buildCommonRouteModel`에 manual leg를 정식 지원시킨다.
3. 항공로 확장은 routeId로 제한한 방향성 탐색을 쓴다. 0개 또는 복수 후보면 오류로 전체 적용을 거부한다.
4. `applyRouteDraft()`는 한 번의 검증·계산 뒤에만 기본 설계안과 exposure를 갱신한다. 실패하면 초안과 오류만 남긴다.
5. `handleAutoRecommend()`를 `generateRouteDraft()`로 바꾼다. 기존 base를 지우지 않고 절차·문자열 candidate만 만든 뒤, 확인 승인 때만 초안/base에 반영한다.
6. ETA는 기본 auto, 직접 입력 시 manual, `자동 계산` 시 auto로 복귀하게 한다.
7. `routeDraft`는 자동 생성 초안과 문자열 입력의 공통 원본이다. 지도 제안은 그 순간의 draft 또는 적용된 base에서 `pendingRouteEdit`를 파생한다. 취소/실패는 draft와 base를 모두 보존하고 pending만 비운다. 적용만 pending을 draft와 base에 복사한다.

**완료 조건:** 절차가 비어 있어도 `OSPAT Y711 GONA DCT KALOD`를 적용할 수 있고, 잘못된 전체 입력은 기존 경로를 유지한다.

### 2. 첫 번째 탭 UI 재구성

**파일:** `RouteBriefingPanel.jsx`, `RouteBriefing.css`, `AirportPickerField.jsx`, `AirportPickerField.css`

1. desktop/mobile 모두 IFR/VFR → 공항 → SID/STAR → 큰 문자열 → 자동 생성/지도 클릭/그리기 → TAS/ETD/ETA 순서로 렌더한다.
2. 첫 번째 탭에서 `검색`, `자동검색`, RNAV/ATS, 교체공항을 없앤다. 교체공항은 브리핑 준비에 남긴다.
3. 문자열은 여러 줄 `textarea`로 바꾸고 예시, 초안/오류 상태, `경로 적용`, Ctrl+Enter, 적용 뒤 변경 토큰 강조를 제공한다.
   전체 계획 읽기 전용 표시는 문자열 바로 아래에 두고, 초안/적용 중 어느 값을 보는지 상태 이름을 함께 보인다.
4. 자동 생성은 주 행동 한 개만 보인다. 덮어쓰기/초기화 확인은 Escape와 취소를 지원한다.
5. 공항 선택기에 목록 역할·현재 항목·열림 상태·화살표/Enter 선택·닫은 뒤 포커스 복귀를 구현한다.
6. mobile에서 문자열과 세 도구를 접지 않고 390px 가로 스크롤 없이 44px 터치 영역을 지킨다.

**완료 조건:** 두 화면 크기에서 같은 순서와 같은 행동 이름이 보이며, 사용자는 다음 행동을 기억하지 않아도 알 수 있다.

### 3. 지도 제안·확인·undo

**파일:** `routePreview.js`, `routePreview.test.js`, `routePreviewSync.js`, `routePreviewSync.test.js`, `useRouteBriefing.js`, `RouteBriefingPanel.jsx`, `RouteBriefing.css`, `MapView.jsx`(기존 binder 호출 인자만)

1. `bindIfrClickInteraction()`과 VFR binder가 즉시 확정 대신 `insert`, `delete`, `draw`, `select-segment` 의도를 hook ref로 보낸다.
2. 지도 선을 먼저 누르면 그 구간을 강조한다. 이후 FIX/DCT는 선택 구간 우선, 없으면 가장 가까운 구간에 삽입한다.
3. 공개 FIX 클릭은 5 NM FIX 제안, 빈 지도 클릭은 DCT 사용자 waypoint 제안, 기존 입력 FIX 클릭은 삭제 제안을 만든다.
4. hook은 `pendingRouteEdit`에 새 en-route, `A → P → B`, 변경 문자열, 임시 geometry를 저장한다. 적용 전 설계안·고도·브리핑·exposure는 건드리지 않는다.
5. source를 `briefing-route-baseline`, `briefing-route-applied`, `briefing-route-pending`, `briefing-route-draw`로 고정한다. persistent source 세 개는 `syncRoutePreviewLayers`만 소유하고, draw source만 binder가 소유한다. 기존 `briefing-route-preview` line/hit/point와 VFR circle/label은 applied compositor로 이행한다. `briefing-route-design-line[_HIT]`는 두 번째 탭만의 legacy design source/layer로 유지하고, `procedure-preview`도 유지한다. `syncVfrWaypointData`의 직접 setData는 제거해 compositor 입력으로 이행한다. style.load 뒤 synchronizer가 baseline/applied/pending, procedure, legacy design을 생성·setData한 후 binder가 draw source와 이벤트를 복원한다. 공항 좌표는 preview model에 명시적으로 전달한다.
6. 단일 hit resolver가 `queryRenderedFeatures`로 `기존 editable point 삭제 → 이미 선택한 구간 삽입 → route line 구간 선택 → published FIX 삽입 → 빈 지도 DCT`를 한 번만 판정한다. 단계 시작 시 실제 WFS/published FIX/ROUTE_PREVIEW_POINT layer ID와 속성을 조사 문서에 고정하고 event matrix를 테스트에 고정한다.
7. synchronizer는 임시 선·점·선택 구간을 별도 스타일로 표시한다. 패널의 확인 카드에서 적용/취소/다른 구간 선택을 제공한다.
8. 적용 시 한 번만 경로·노출을 갱신하고 undo snapshot을 남긴다. 취소/실패는 임시 레이어만 지운다.

**완료 조건:** FIX 추가·삭제·DCT 추가 모두 적용 전에는 실제 경로가 바뀌지 않고, undo로 한 번에 되돌릴 수 있다.

### 4. 자유곡선과 사용자 waypoint 이름

**파일:** `routePreview.js`, `routePreviewSync.js`, `useRouteBriefing.js`, `RouteBriefingPanel.jsx`, `RouteBriefing.css`, `manualRouteInput.test.js`

1. 임시 자유곡선 source/layer를 설치하고 pointer move에는 좌표와 선만 갱신한다.
2. pointer up 한 번에만 공개 FIX/항공로/DCT 후보를 해석한다. 이동 중 planner/exposure API는 호출하지 않는다.
3. 성공하면 단계 3의 확인 카드에 문자열·임시 경로를 보인다. 실패하면 선을 지우고 기존 경로를 유지한다.
4. DCT 지점은 설계안별 단조 증가 번호로 `WP1`, `WP2`를 만든다. 삭제해도 같은 설계안에서 번호를 재사용하지 않는다. 이름 변경은 대소문자 무시 중복, 빈 이름, `DCT`, 항공로명, 좌표 토큰과의 충돌을 막는다. add/rename/delete 모두 deep clone·undo 대상이며 외부 출력은 항상 좌표다.
5. 좌표 parser는 스펙의 단일 token, 반구, 범위, 반올림 규칙을 테스트로 고정한다.

**완료 조건:** 그리는 동안 선이 즉시 보이며, 손을 뗀 후에만 한 번 초안을 계산한다.

### 5. 두 번째 탭 회귀 보호

**파일:** 관련 regression test와 상태 문서만

두 번째 탭의 현 UI·행동은 변경하지 않는다. 첫 번째 탭의 공유 hook 이행 뒤에도 base 복제·선택·이름 변경·삭제·비교가 그대로 동작하는 회귀 테스트만 추가한다. 두 번째 탭의 문자열·지도 편집 재설계는 별도 승인 작업이다.

## 테스트와 검증

### Focused Node tests

- 설계안 복제 시 en-route/user waypoint/undo 독립성
- 항공로 압축·중간 FIX 확장·DCT 좌표 round-trip·WP 이름 해석
- 잘못된 FIX/항공로/좌표의 전체 거부와 기존 경로 보존
- 절차 미선택 수동 IFR 경로
- DCT 포함 경로가 exposure·vertical profile·briefing 요청까지 유효 manual leg/model로 전달됨
- 항공로 중간 FIX 확장, 역방향 불허, 분기/모호 구간 전체 거부, endpoint 삭제 후 고아 token 정리
- VFR 기준선, VFR DCT/FIX/그리기 pending 적용·취소·undo
- ETA auto/manual/자동 계산 복귀
- 기준선은 편집 hit 대상이 아님, source별 applied/pending/draw 보존, move 중 planner 호출 없음
- event matrix의 삭제/선택 구간/published FIX/DCT 우선순위
- 공항 선택기의 DOM ARIA/focus 동작은 Playwright에서 검증한다. Node test에는 DOM 없이 검증 가능한 순수 선택 helper만 추가한다.
- manual route의 user waypoint가 geometry/distance/preview/route model/exposure/vertical profile/briefing까지 전달되는 integration test
- snapshot v2와 v1 migration: procedure id, IFR DCT user waypoint rename/next number, manual ETA와 TAS/ETD/cruise altitude/alternateAirport, VFR uid/fixed/altitude/named의 save-load-import-undo round-trip
- SID + DCT + STAR/IAP `finalRouteGeometry` alignment, mixed airway+DCT AIP filtering/provenance, DCT-only `not_applicable`
- 대체안 선택 뒤 첫 번째 탭 복귀 → `projectBaseForSettings()`가 base form·procedure·route preview source를 함께 투영 → base 교체와 대체안 원자적 폐기

### Playwright

문서화된 `dev:test` 절차로 desktop, iPad landscape 1180×820, mobile 390×844에서 확인한다.

1. 공항 두 개 선택 → 직선 기준선만, 자동 생성 미실행.
2. 문자열 적용 → 중간 FIX 포함 지도 경로·ETA.
3. 오류 문자열 → 입력 근처 오류, 기존 경로 유지.
4. 자동 생성 → 확인 뒤 절차·문자열·지도 초안 반영; 취소 시 기존 수동 경로 보존.
5. 지도 FIX/DCT/삭제 → `A → P → B` 카드 → 취소/적용/undo.
6. 그리기 → 실시간 선 → pointer up 후 한 번만 초안 → 취소/다시 그리기/적용.
7. ETA 수동 입력 → 경로 변경 뒤 유지 → 자동 계산 복귀.
8. 키보드만으로 공항·문자열·확인 카드 조작.
9. mobile 가로 스크롤 없이 문자열·세 도구·시간 입력 접근.
10. VFR 공항 선택 → 기준선만 → 지도 click/draw 제안 → 취소/적용/undo.
11. 기본 경로 적용 뒤 첫 번째 탭에 머무름 → 두 번째 탭을 직접 열어 base만 복제.
12. 확인 카드 Escape와 포커스 복귀, 자동 생성 취소 뒤 기존 base 보존, style reload 뒤 baseline/applied/pending/draw source 복원, 기존 VFR import 회귀.
13. mobile 390px에서 `documentElement.scrollWidth <= viewport.width`를 확인한다.

스크린샷과 manifest는 `artifacts/responsive-screenshots/flight-plan-input-first-tab/<timestamp>/`에 저장한다.

### 최종 명령

- `npm.cmd run test --prefix frontend -- <focused files>`
- `npm.cmd run test --prefix frontend`
- `npm.cmd run build --prefix frontend`
- `npx.cmd madge --circular frontend/src/features/route-briefing/useRouteBriefing.js`
- `git diff --check`

`MapView.jsx`에는 새 state/useEffect를 넣지 않는다. 기상 칩은 지도 표시만 바꾼다. 자동 우회·추천 순위·안전 판정·새 기상 데이터/레이어/점수는 만들지 않는다. 커밋·푸시는 하지 않는다.
