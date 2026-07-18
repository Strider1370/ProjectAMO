# 경로비교 우회안 편집·비교 구현 계획

> 작성: 2026-07-19 · 상태: 구현 전
> 정본: `docs/superpowers/specs/2026-07-19-route-comparison-alternatives-design.md`
> 범위: 두 번째 탭을 `경로비교`로 바꾸고, 기준 경로를 보존한 IFR·VFR 우회안의 문자열/drag 편집과 사실 기반 비교를 구현한다.

## 0. 완료 모습과 지켜야 할 경계

조종사는 적용된 기준 경로를 건드리지 않은 채 `이 경로에서 우회안 만들기`로 복제본을 만들고, 그 복제본만 문자열 또는 지도 경유점/`+` 핸들 drag로 바꾼다. 적용 전에는 거리·ETA·위험 노출·고도 비교·브리핑·저장값이 변하지 않는다. 적용 뒤에는 기준 대비 변화량을 현상별로 비교하고, 명시적으로 선택한 적용 우회안만 고도 비교에 넘긴다.

- `MapView.jsx`에는 state나 `useEffect`를 추가하지 않는다.
- 첫 번째 `비행 설정` 탭의 기본 경로 생성과 VFR 단일 문자열 계약은 바꾸지 않는다.
- 자동 우회·안전 판정·종합 위험 점수는 만들지 않는다.
- 비교는 동일 ETD/TAS·서버가 한 번 고정한 동일 기상 snapshot·동일 final-route geometry 정책일 때만 변화량을 낸다.
- 새 지도 source/layer는 만들지 않는다. 아래의 기존 source/layer 역할을 확장해 사용한다.

## 1. 현재 구현 판정

| 현재 위치 | 확인된 상태 | 구현에서의 처리 |
| --- | --- | --- |
| `useRouteBriefing.js`의 전역 `routeEditor`, `routeDraftResult`, `pendingRouteEdit` | 선택 설계안과 분리되어 있어 A를 편집하다 B를 고르면 초안이 섞일 수 있다. | 우회안별 `draftEditor`와 `pendingEdit`를 도입하고, 전역 editor는 첫 탭 기본 경로 전용으로 남긴다. |
| `applyRouteStringToSelectedDesign()` / `commitIfrDesign()` | IFR만 설계안으로 적용한다. | 공통 설계안 preview/apply adapter로 바꾸고 VFR의 전체 raw string도 같은 경로로 적용한다. |
| `routeDesigns.js`의 `duplicateRouteDesign()` | 부모의 `undoStack`을 복사한다. | 복제본 undo를 비우고 applied snapshot만 깊은 복사한다. 기준 경로는 편집·삭제 불가로 명시한다. |
| `RouteAlternativesStep.jsx` | 지도 클릭·그리기·구간 우회 버튼, 전역 노출 경고, 선택만으로 고도/브리핑 상태를 지우는 흐름이 있다. | 기준 요약 → 우회안 목록 → 선택 우회안 편집/비교 구조로 교체한다. |
| `routePreview.js` | VFR은 `ROUTE_PREVIEW_SOURCE`의 waypoint/line drag, IFR은 `mapInteractionMode`의 click/draw/segment-detour를 쓴다. | 두 규칙을 설계안 draft drag adapter로 수렴시킨다. 빈 지도는 이벤트를 잡지 않는다. |
| `routePreviewSync.js` | VFR은 단일 전역 applied/draft branch, IFR design은 별도 branch라 동시에 비교할 수 없다. | 설계안 공통 projection을 한 번 만들고 base·selected applied·other applied·selected pending을 함께 쓴다. |
| `buildRouteExposure()` | SIGMET/AIRMET/낙뢰 기준 수평 노출을 만든다. | 새 기상 데이터를 만들지 않는다. 동일 cache snapshot으로 여러 경로를 계산하는 batch API를 추가하고, 제공되는 현상만 행으로 표시한다. 착빙의 수평 노출은 현 API가 제공할 때만 노출 행에 나타난다. |

## 2. 데이터 모델과 계산 계약

### Task 1 — 설계안 도메인 모델과 비교 view model을 먼저 고정

대상: `frontend/src/features/route-briefing/lib/routeDesigns.js`, 새 `lib/routeComparison.js`, 각 테스트 파일.

1. 기존 applied 평면 필드는 그대로 정본으로 유지하고, 아래 세 필드만 더한다. `routeResult`, `routeModel`, `routeExposure`, `routeString`, `enroute`, `userWaypoints`, `undoStack`을 새 `applied` wrapper로 한꺼번에 옮기지 않는다.

   ```text
   { id, name, kind: 'base' | 'alternative',
     ...existing applied flat fields,
     draftEditor: null | { rawText, enroute, preview, previewWaypoints, error, requestVersion },
     pendingEdit: null | { kind, previousDraft, proposedDraft, mapCoordinates } }
   ```

   평면 applied 필드만 저장·거리·ETA·위험 노출·고도·브리핑의 정본이다. `draftEditor`/`pendingEdit`/요청 번호는 저장하지 않는다.
2. `createRouteDesign`, `snapshotRouteDesign`, `duplicateRouteDesign`, `renameRouteDesign`, `removeRouteDesign`을 이 최소 shape에 맞춘다. `base`는 rename/삭제/편집 대상이 아니고, 복제는 평면 applied 값만 독립 복사하며 undo stack은 `[]`다. 삭제 확정 뒤 선택 대상은 바로 앞 alternative, 없으면 base다.
3. 순수 `buildRouteComparison(base, alternatives, { etd, tasKt, weatherSnapshot })`를 만든다. 이 함수가 다음만 계산한다.
   - total distance와 기준 대비 NM;
   - 공통 TAS·ETD에서 재계산한 duration/ETA와 기준 대비 분;
   - `(source, phenomenon)` 안정 key별 interval NM 합계, 기준/대안/차이;
   - 한쪽만 현상이 있으면 반대는 `0 NM`; unavailable 또는 snapshot 불일치는 `자료 없음`과 비교 불가;
   - 1 NM/1분 반올림, 합산 위험 점수 없음.
4. `POST /api/briefing/route-exposure/batch`를 추가한다. 서버는 요청 시작 시 `sigmet`, `sigmet_overseas`, `airmet`, `lightning` cache를 한 번만 읽고 모든 base/alternative geometry에 `buildRouteExposure`를 적용한다. 응답에는 같은 `snapshot`의 source별 observed/fetched time과 stable version/hash를 넣는다. frontend는 batch 결과의 key가 다르거나 unavailable이면 delta를 숨기고 `동일 자료로 비교 불가`와 source time을 표시한다.
5. final geometry helper는 `getFinalRouteGeometry(design, procedureLookup)` 형태로 만든다. 각 design 자신의 `procedures`와 VFR waypoints를 읽어 SID/STAR/IAP 포함 정책을 적용한다. helper 적용 뒤에는 exposure caller에서 `previewGeojson`을 직접 읽지 않는다.

검증: base 불변, 복제 userWaypoint/undo 비공유, 삭제 선택 규칙, 0/자료없음/snapshot 불일치, 현상별 독립 delta, ETA 계산, design마다 다른 procedure final geometry를 단위 테스트로 추가한다.

### Task 2 — IFR/VFR 공통 설계안 draft·apply adapter

대상: `useRouteBriefing.js`, `lib/routeEditor.js`, `lib/manualRouteInput.js`, `lib/routePlanner.js`, `lib/routeBriefingModel.js`, 관련 tests.

1. `useRouteBriefing` 안에 선택 design을 대상으로 하는 다음 action을 만든다: `startAlternativeFrom`, `updateSelectedDesignDraftText`, `previewSelectedDesignDraft`, `confirmSelectedDesignDraft`, `cancelSelectedDesignDraft`, `applySelectedDesignDraft`, `undoSelectedAlternative`, `requestRemoveSelectedAlternative`, `confirmRemoveSelectedAlternative`, `cancelRemoveSelectedAlternative`.
2. 첫 탭의 `routeEditor`/`applyRouteDraft`는 base 생성만 계속 담당한다. 두 번째 탭은 전역 `routeEditor`, `routeDraftResult`, `pendingRouteEdit`를 읽거나 쓰지 않는다.
3. 공통 parser/builder adapter는 아래 순서를 강제한다.
   - IFR: `parseManualRouteString` → coordinate token을 `userWaypoints`로 안정적으로 materialize → `buildManualIfrRoute`.
   - VFR: `parseVfrDraftText`의 `DEP DCT … DCT ARR` 전체 문자열 → coordinate token materialize → enroute 없음이면 `buildVfrRoute`, 있으면 `buildManualVfrRoute`.
   - `buildManualVfrRoute()`가 `resolvedEnroute`를 돌려주지 않아도 parsed `userWaypoints`와 증가한 `nextWaypointNumber`를 applied/draft에 함께 보관한다.
   - formatter는 IFR에 `formatManualRouteString`, VFR에 `formatVfrDraftText`만 쓴다. VFR 공항을 별도 값으로 재조합하지 않는다.
4. preview는 해당 design의 `requestVersion`을 증가시킨 뒤 계산한다. await 뒤 design id와 version이 아직 현재 draft와 같은지 확인하고 나서만 state를 갱신한다. error는 그 design draft에만 기록한다.
5. apply는 preview 결과를 다시 검증해 final geometry·`buildCommonRouteModel`·공통 ETD/TAS ETA·`fetchRouteExposure`를 만든 뒤에만 `applied`를 교체하고 이전 applied snapshot을 그 alternative의 undo에 넣는다. 취소는 previousDraft로 정확히 복원하고 map confirmation을 닫는다.
6. `selectRouteDesign`은 비교 행 선택만 바꾼다. 고도 비교·브리핑·수직 단면을 clear하지 않는다. `continueToAltitudeComparison`에서만 해당 applied design을 active projection으로 확정하고 그때 stale 결과를 무효화한다.
7. 저장 schema 변경은 Task 5에서만 수행한다. 이 Task에서는 import가 routeResult 직접 set 대신 base 문자열 → preview → apply 공통 경로를 쓰도록만 수렴시킨다.

검증: IFR/VFR 각각 문자열 미적용→적용, drag 취소, 동시 A/B preview 응답, VFR coordinate 재적용, import, 두 번 base apply 후 undo를 focused test로 추가한다.

## 3. 지도 projection과 drag 계약

### Task 3 — 기존 지도 source/layer만으로 4개 상태를 동시에 표시

대상: `lib/routePreview.js`, `lib/routePreviewSync.js`, `lib/routeBriefingModel.js`, `MapView.jsx`의 기존 binding 호출(새 state/effect 없음), map tests.

| 기존 source/layer | writer | 표시 데이터 | 변경 방법 |
| --- | --- | --- | --- |
| `briefing-route-baseline` / `ROUTE_BASELINE_LINE` | `syncRoutePreviewLayers` | 적용 base final geometry | 회색 점선으로 style을 바꾸고 base만 쓴다. |
| `briefing-route-applied` (`ROUTE_PREVIEW_SOURCE`) / `ROUTE_PREVIEW_LINE`, `ROUTE_DESIGN_LINE`, existing point·label·VFR layers | 같은 sync | 선택 applied alternative, 다른 applied alternatives, 선택 alternative의 edit waypoint/`+` handle | feature에 `designId`, `selected`, `editable`, `handleKind`를 넣고 기존 layer filter/paint/layout expression을 확장한다. |
| `briefing-route-pending` / `ROUTE_PENDING_LINE`, point, label | 같은 sync | 선택 alternative의 draft preview만 | 마젠타 점선 pending으로 유지한다. applied/base source를 절대 덮지 않는다. |

1. `buildRoutePreviewModel`이 전역 `appliedVfrWaypoints`/`draftVfrWaypoints` 대신 selected design의 applied/draft projection과 base/others list를 넘기게 바꾼다. VFR와 IFR 모두 이 projection을 사용한다. 단, settings/base VFR의 기존 partition(`baseline`=applied, `briefing-route-applied`=draft)과 drag 승인·취소는 기존 tests를 그대로 통과시키는 migration gate를 먼저 둔다.
2. `syncRoutePreviewLayers`를 하나의 `buildComparisonGeoJSON` 호출로 단순화한다. base, all applied alternatives, selected pending, selected editable points, segment `+` handles를 각각 올바른 기존 source에 쓴다. style reload 뒤 `installRoutePreviewLayers`와 다음 sync가 같은 데이터를 되살리는지 보장한다.
3. 기존 `bindVfrInteractions`를 규칙명에 맞게 일반화한다. 구간 `+`는 기존 `route-preview-point` feature로 `{ handleKind: 'insert', editable: false, label: '+' }`를 넣고, 기존 point/label layer filter와 data-driven paint를 확장해 보인다. source feature의 `designId`, `editable`, `handleKind`, `waypointIndex`를 확인해 선택 alternative만 잡고:
   - waypoint drag는 해당 waypoint replacement 초안을,
   - `+` handle drag는 해당 segment insertion 초안을,
   - drop은 `onDesignWaypointDrop` ref에 `{ designId, kind, index, coordinates, previousDraft }`를 전달한다.
   기존 line 자체 mousedown으로 즉시 waypoint를 만드는 동작은 제거한다. `+` feature가 아닌 빈 지도/선은 Mapbox pan/zoom에 맡긴다.
4. hook의 drop action은 nearest published FIX 제안 후 coordinate fallback을 만들고 Task 2 preview adapter로 넘긴다. IFR는 전체 연결을 builder로 검증한다. map confirmation의 apply/cancel은 그 design의 pending action만 호출한다.
5. 다음 순서로 구 binder를 제거한다: (a) `rg`로 click/draw/segment-detour의 모든 caller와 첫 탭 UI를 확인, (b) settings 탭에 의존성이 없음을 focused test로 고정하거나 필요한 settings-only binder를 분리, (c) compare의 `mapInteractionMode` action·UI·tests를 삭제, (d) `bindIfrClickInteraction`의 design path와 `ROUTE_DRAW_SOURCE`/`ROUTE_DRAW_LINE` install 코드를 삭제, (e) inbound-reference `rg`가 0임을 확인하고 구 스펙을 갱신한다. 이 gate 전에는 source/layer를 삭제하지 않는다.
6. MapView는 기존 refs를 전달하고 기존 style-load에서 binder를 한 번 연결하는 역할만 한다. 새 ref가 필요하면 `useRouteBriefing.refs`에 넣되 MapView의 state/effect를 추가하지 않는다.

검증: settings/base VFR의 기존 source partition과 승인/취소 회귀 없음, VFR pending이 base를 덮지 않음, IFR/VFR base·selected·other 3선 동시 표시, `route-preview-point`의 `+`만 insertion을 시작함, fixed airport/airway interior point는 drag 불가, 취소 후 source data 복구, style reload 뒤 binder 중복 없음, 빈 지도 pan이 각각 map-focused tests로 증명되어야 한다.

## 4. 화면과 workflow

### Task 4 — `경로비교` 화면을 결정을 돕는 구조로 교체

대상: `RouteAlternativesStep.jsx`, `RouteBriefingPanel.jsx`, `RouteBriefing.css`, `lib/routeComparison.js`.

1. 데스크톱·모바일 workflow label을 모두 `경로비교`로 바꾸고, 두 렌더 경로에 같은 props/actions를 전달한다.
2. `RouteAlternativesStep`의 순서를 다음으로 교체한다.
   - base summary: 구간, 총 거리, ETA, 현상별 노출, `이 경로에서 우회안 만들기` 하나의 주 행동;
   - base pinned row + alternatives max 3 rows: 거리/ETA/현상별 delta, visible selected state (`aria-selected`, 체크, 테두리);
   - selected alternative only: `항로 문자열 직접 편집`, 적용/Ctrl+Enter, 되돌리기, 접이 `더보기`(이름 변경·복제·삭제), 초안 error/pending confirmation;
   - 기준 대비 상세 표와 `이 우회안으로 고도 비교`.
3. `지도 클릭 추가`, `그리기`, `구간 우회`와 그 모드 문구를 비교 UI에서 모두 제거한다. route string의 이전/새 token을 표시하는 경우 index 기반 diff로 하여 중복 token을 잘못 강조하지 않는다.
4. 위험 표시 칩은 `위험 표시` disclosure 안으로 옮긴다. 레이어 toggle은 `metVisibility`만 바꾸며 route/draft/comparison action을 호출하지 않는다.
5. 삭제는 inline confirm card의 삭제/취소로만 확정한다. base에는 편집/rename/delete/undo control을 렌더하지 않는다. 카드 폭·세로 흐름은 iPad landscape와 mobile에서 목록→편집→비교 순서를 유지한다.
6. 지도 범례에는 base 점선, selected 실선, other 보조선, pending 점선, 위험 영역을 텍스트와 함께 보인다. 색만으로 상태를 구분하지 않는다.

검증: React/component tests로 base-only, max count, selected/deselected, no old buttons, unavailable rendering, delete confirmation을 확인한다. Playwright로 desktop·iPad landscape·mobile에서 같은 기능/문자열 fallback을 확인한다.

## 5. 수명주기, 브리핑 projection, 회귀 방지

### Task 5 — 선택과 적용을 분리하고 stale 결과를 막기

대상: `useRouteBriefing.js`, `RouteBriefingPanel.jsx`, 저장/import 관련 `lib/routeStore.js`와 `lib/routeImport.js`, tests.

1. `selectedRouteDesignId`는 비교 화면의 focus일 뿐이고 briefing projection id와 분리한다. 새 `activeAppliedDesignId` 또는 동등한 derived projection을 고도 비교 진입 시에만 바꾼다. active id가 삭제되거나 base apply/undo로 무효가 되면 base로 즉시 fallback한다.
2. `requestAltitudeComparison`, vertical profile, briefing request는 active applied design의 `getFinalRouteGeometry()`/model만 읽는다. 비교 목록 선택은 기존 결과를 clear하지 않는다.
3. route exposure, altitude, briefing 요청에 design id/version guard와 취소 ref를 일관되게 둔다. base apply/undo/delete는 해당 요청을 무효화하고 없는 design 응답을 버린다.
4. 저장 schema를 v3로 한 번만 변경한다. `{ version: 3, base, alternatives[], selectedAlternativeId, cruiseAltitudeFt, etd, tasKt, etaPolicy }`에서 각 design은 applied 입력값(`routeForm`, procedure ids, `enroute`, `userWaypoints`, `routeString`)만 저장한다. routeResult/geometry/draft/pending은 저장하지 않는다. v1/v2는 `normalizeRouteSnapshot()`에서 v3 base로 올리고 legacy VFR waypoint snapshot은 고정 양끝 제외 FIX/coordinate token의 전체 문자열로 normalize한다.
5. load는 v3의 base와 alternatives를 각각 공통 문자열 → preview → apply adapter로 재계산한다. navdata는 최신일 수 있으므로 geometry byte-for-byte 동일성을 요구하지 않는다. 대신 raw route string/user waypoint/selection이 유지되고 각 applied route가 재계산 성공해야 한다. exact geometry 비교는 navdata version을 저장·고정하는 별도 요구가 생길 때만 추가한다.

검증: alternative 선택만으로 briefing/card가 사라지지 않음, 명시적 고도 비교 전환 뒤에만 projection 변경, stale A response 무시, v2→v3 migration, load/import/base undo, active deletion fallback persistence tests.

## 6. 실행 순서와 완료 검증

### Task 6 — 작은 단위로 merge 가능한 구현 순서

1. Task 1 순수 모델/tests를 먼저 완료한다. 이 시점에는 UI/지도 동작을 바꾸지 않는다.
2. Task 2 adapter와 state 소유를 옮기고 focused tests를 통과시킨다. legacy load/import/base undo까지 이 단계에서 고친다.
3. Task 3 projection/binder를 바꾸고 지도-focused tests를 통과시킨다. `MapView.jsx`의 새 state/effect 없음도 diff로 확인한다.
4. Task 4 UI/CSS와 Task 5 workflow projection·v3 persistence를 연결한다.
5. 아래 검증 순서를 반드시 지킨다. 실패하면 해당 단계의 진입점·fixture를 먼저 고치고 전체 검증을 반복 실행하지 않는다.

```text
1) 변경 파일 focused tests
2) npx depcruise .
3) npx knip
4) frontend 전체 tests
5) frontend build
6) git diff --check
7) graphify update .
8) docs/operations/dev-server-and-capture.md 절차로 서버 시작
9) Playwright: desktop, iPad landscape, mobile
```

### Playwright 시나리오

1. IFR base 생성 → 우회안 생성 → 문자열 pending → 적용 전 base 거리/브리핑 불변 → 적용 뒤 동일 batch snapshot delta 표시.
2. VFR `DEP DCT FIX DCT ARR` 우회안 → `+` drag/FIX 승인 → 취소 → rawText·지도·비교 복원 → 적용 → undo.
3. 기준/선택/다른 우회안/pending이 동시에 지도에 보이고, blank-map drag는 pan이며 route를 바꾸지 않음.
4. VFR base도 경로비교에 진입해 우회안 생성 가능, 우회안 3개 제한, 삭제 취소/확정, alternative 선택만으로 briefing 유지, `이 우회안으로 고도 비교` 후에만 projection 전환.
5. desktop(기본), iPad landscape, mobile에서 문자열 입력·오류·적용·삭제 확인·위험 표시 disclosure가 접근 가능함.

## 완료 판정

스펙의 완료 기준 1–13과 위 Playwright 5개가 모두 통과하고, v2→v3 복원·base undo·VFR 취소가 각 계약을 지킬 때만 완료다. 어느 한 경로에서라도 draft가 applied 또는 다른 설계안에 섞이면 구현을 완료로 주장하지 않는다.
