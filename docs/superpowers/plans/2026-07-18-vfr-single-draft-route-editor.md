# VFR 전체 문자열 단일 초안 구현계획

> 상태: 구현 전
> 선행 계획: `docs/superpowers/plans/2026-07-18-step1-route-editor-unification.md`
> 관련 상태: `docs/superpowers/status/2026-07-17-route-alternatives-four-stage-flow.status.md`

## 목표

VFR에서 사용자가 편집하는 경로의 기준을 전체 문자열 하나로 통일한다.

```text
RKSI DCT GONAX DCT RKPK
```

공항 선택, 텍스트 입력, 지도 선 드래그는 모두 이 문자열을 갱신한다. 지도선·거리·지도 waypoint는 문자열을 해석한 파생값이며 별도의 사용자 편집 상태가 아니다. `경로 적용` 전에는 초안 지도선만 바뀌고, 기본 경로·저장·고도 비교·브리핑은 바뀌지 않는다.

## 사용자 동작 계약

| 동작 | 전체 초안 문자열 | 적용 경로 |
| --- | --- | --- |
| RKSI/RKPK 선택 | `RKSI DCT RKPK` 생성 | 변경하지 않음 |
| 텍스트로 FIX 입력 | `RKSI DCT GONAX DCT RKPK` | 변경하지 않음 |
| 지도 선 드래그 | FIX 이름 또는 좌표 token을 같은 위치에 삽입 | 변경하지 않음 |
| `경로 적용` | 현재 문자열 유지 | 현재 초안을 base로 확정 |
| base 되돌리기 | 현재 적용 base 문자열로 복원 | 이전 base로 복원 |

- 양 끝 ICAO는 현재 선택한 출발·도착과 일치해야 한다.
- VFR은 `DCT`만 허용한다. 항공로 token은 기존 검증 오류를 유지한다.
- 입력 중 불완전한 문자열은 화면에 남기되 마지막 유효 초안선을 유지한다.
- 지도에서 가까운 공표 FIX가 발견되면 기존 확인 카드를 쓴다. 승인하면 FIX token, 발견하지 못하면 좌표 token을 넣는다. 취소하면 드래그 전 초안으로 돌아간다.

## 현재 구조의 문제

현재 VFR은 두 상태를 각각 직접 수정한다.

```text
routeEditor.rawText  ── 문자열 입력
vfrWaypoints         ── 지도 드래그, 목록 추가/삭제/정렬, 개별 고도
```

`handleVfrWaypointDrop()`, `addVfrWaypointByFix()`, `deleteVfrWaypoint()`, `reorderVfrWaypoint()`은 `vfrWaypoints`만 바꾸므로 문자열과 지도 순서가 어긋날 수 있다. 반대로 `updateRouteDraftText()`는 문자열만 바꾸며 VFR 초안선을 즉시 다시 만들지 않는다.

직항도 별도 문제다. `buildManualVfrRoute()`는 중간 경유점이 한 개 이상 필요하고, 출발/도착 공항은 함수 안에서 붙인다. 따라서 화면에 `RKSI DCT RKPK`를 표시하려면 양 끝 공항을 화면용으로만 처리하고 기존 builder에는 빈 중간 구간을 전달해야 한다.

또한 공항 변경 effect가 `runRouteSearch()`를 호출해 `routeResult`와 `vfrWaypoints`를 즉시 바꾼다. 이 흐름은 적용 전 초안과 적용 base를 섞는다.

## 목표 데이터 흐름

```text
공항 선택 / 텍스트 입력 / 지도 드래그
              │
              ▼
      routeEditor.rawText  (유일한 편집 기준)
              │
              ▼
       parseVfrDraftText()
              │
              ├─ 직항 ────── buildVfrRoute()
              └─ 경유점 있음 ─ buildManualVfrRoute()
                              │
                              ▼
                    routeEditor.preview
                              │
                              ▼
                  draftVfrWaypoints (초안 지도 전용)

경로 적용 → createRouteDesign(base) → appliedVfrWaypoints → 저장/고도/브리핑
```

두 배열은 이름과 소비자를 명확히 분리한다.

- `draftVfrWaypoints`: `routeEditor.preview`에서만 파생한다. 초안 지도선과 VFR drag ref만 읽는다.
- `appliedVfrWaypoints`: 선택된 `base.routeResult`에서만 파생한다. 적용 지도선, 거리, 저장, fit, 수직 단면, 고도 비교, 브리핑만 읽는다.

단일 `vfrWaypoints` state를 둘의 대체물로 사용하지 않는다. `getCurrentRouteLineString`, `plannedDistanceNm`, `handleVerticalProfileRequest`, terrain/profile request, `handleGenerateBriefing`, `handleSaveCurrentRoute`, MapView의 briefing fit은 모두 applied 배열 또는 base route geometry만 읽도록 호출부를 바꾼다.

## 변경 파일과 정확한 작업

### `frontend/src/features/route-briefing/lib/manualRouteInput.js`

기존 `parseManualRouteString`, `formatManualRouteString`, `formatCoordinateToken`을 재사용한다. 새 VFR parser를 독립적으로 만들지 않는다.

추가할 helper:

```js
parseVfrDraftText(text, { departureAirport, arrivalAirport, userWaypoints })
// { enroute, displayText }; enroute는 중간 FIX/좌표만 포함

formatVfrDraftText({ departureAirport, arrivalAirport, enroute })
// 'RKSI DCT GONAX DCT RKPK'
```

처리 규칙:

1. 기존 VFR parser로 token을 검증한다.
2. 첫·마지막 token이 선택 공항인지 검사한다. 불일치 시 `출발/도착 공항이 선택값과 다릅니다.`를 낸다.
3. 양 끝 공항과 양끝 `DCT`를 떼어 `enroute`만 반환한다.
4. 중간 token이 없으면 직항으로 인정한다.
5. 포맷할 때는 중간 문자열을 양 공항 사이에 `DCT`로 붙인다.

`manualRouteInput.test.js`에 직항, FIX/좌표 왕복, 공항 불일치, VFR 항공로 거부, 중간 공항 ICAO 오용을 추가한다.

### `frontend/src/features/route-briefing/useRouteBriefing.js`

#### 공통 preview 경로

`buildEditorPreview()`의 VFR 분기에서 위 helper를 사용한다.

```js
const parsed = parseVfrDraftText(text, context)
const result = parsed.enroute.terms.length === 0
  ? await buildVfrRoute(editor.routeForm)
  : await buildManualVfrRoute({ ...editor.routeForm, enroute: parsed.enroute, userWaypoints })
```

VFR editor 계약을 다음처럼 고정한다.

```text
routeEditor.rawText           전체 표기: DEP DCT ... DCT ARR
routeEditor.enroute           중간 terms/legIntents만 보관
routeEditor.enroute.userWaypoints / nextWaypointNumber
                              좌표 token을 안정된 내부 waypoint로 보관
```

VFR의 `rawText`는 항상 `formatVfrDraftText()` 결과로 저장한다. `applyRouteDraft()`는 이 공통 preview 결과만 base로 확정한다. 적용 함수 안에 VFR 파싱/경로 생성 로직을 다시 복사하지 않는다. `buildManualVfrRoute()`가 `resolvedEnroute`를 반환하지 않는 점을 고려해, VFR adapter가 만든 중간 enroute와 user waypoint 번호를 editor에 명시적으로 유지한다. generic `formatManualRouteString()`로 VFR raw text를 다시 만들지 않는다. 그러면 양끝 공항이 사라진다.

#### 공항 변경과 텍스트 입력

- VFR 공항 effect에서 `runRouteSearch(routeForm)` 호출을 제거한다.
- 양 공항이 선택된 새 조합에서는 `RKSI DCT RKPK`를 만들고 `previewEditorRoute()`만 호출한다.
- 공항 변경은 `routeResult`, `routeDesigns`, base undo, briefing, vertical profile을 바꾸지 않는다.
- `updateRouteDraftText()`는 VFR에서 debounce 또는 blur 후 `previewEditorRoute()`를 호출한다. 지도 확인 카드의 적용은 debounce 없이 즉시 preview를 만든다.
- preview request id에는 text와 `departure>arrival` context key를 함께 보관한다. 늦은 요청은 둘 중 하나라도 달라졌으면 editor를 쓰지 않는다.
- 오류는 draft 전용 오류로 표시한다. 텍스트와 마지막 유효 preview는 유지하고 applied base 오류/상태를 지우지 않는다.
- IFR의 현재 적용 버튼 중심 흐름은 바꾸지 않는다.

#### 지도 드래그

`handleVfrWaypointDrop()`을 문자열 갱신 handler로 교체한다.

1. `routePreview.js`에서 받은 최종 waypoint 배열의 변경 지점을 찾는다.
2. 기존 `resolveNearestNavpoint()`로 FIX 이름 또는 `formatCoordinateToken()`을 결정한다.
3. 확인 카드 승인 시 전체 VFR 문자열을 다시 만들고 `previewEditorRoute()`를 호출한다.
4. 취소 시 drag 전 `routeEditor`를 복원하고 확인 카드를 닫는다.

삭제할 독립 편집 state/action:

- `vfrUndoStack`, `snapshotVfr`, `undoVfrWaypoints`
- `addVfrWaypointByFix`, `deleteVfrWaypoint`, `beginVfrReorder`, `reorderVfrWaypoint`
- `updateVfrWaypointAltitude`, `applyCruiseAltitudeToVfrWaypoints`
- `editingVfrAltitudeIndex`와 목록 전용 hover state

`vfrWaypointsRef`는 드래그 중 임시 map source용으로만 유지한다. React가 전달하는 waypoint 배열은 VFR preview 또는 적용 base에서 `buildVfrWaypointsFromRouteResult()`로 파생한다. 이 helper가 현재 `crypto.randomUUID()`를 만들므로 result identity별 `useMemo`로 한 번만 계산해 drag index/ref와 React key가 렌더마다 바뀌지 않게 한다.

#### 적용, 저장, 고도 분석

- `applyRouteDraft()`는 `routeEditor.preview`의 geometry와 enroute로 base design을 만든다.
- `applyBaseRoute()` 뒤 지도/저장용 waypoint 배열도 base에서 파생한다.
- `handleVerticalProfileRequest()`와 `buildVerticalProfileRequest()`에는 적용 base의 좌표만 전달한다.
- `handleSaveCurrentRoute()`는 현재 draft나 임시 drag 배열을 저장하지 않고 base의 전체 VFR route string/enroute만 저장한다.
- `loadSavedRoute()`와 `applyImportedPath()`는 VFR에서 routeResult/vfrWaypoints를 직접 set하지 않는다. 전체 문자열 → preview → apply base 공통 경로로 보낸다.
- `loadSavedRoute()`는 오래된 `vfrWaypoints`만 가진 VFR snapshot을 전체 문자열로 정규화한다. 변환 불가 snapshot은 빈 base를 적용하지 않고 기존 안전한 재검색 경로로 보낸다.
- `undoBaseRoute()` 뒤 applied 배열은 복원된 base 결과에서 다시 파생한다. VFR 두 번 적용 뒤 되돌리면 지도·거리·저장 geometry가 모두 첫 base로 돌아가야 한다.

### `frontend/src/features/route-briefing/lib/routePreview.js`

`bindVfrInteractions()`는 Mapbox 이벤트와 드래그 중 임시 GeoJSON만 책임진다.

- mouse down: 이전 파생 waypoint 배열 보관
- mouse move: 임시 source만 갱신
- mouse up: 최종 배열, 이전 배열, 변경 index를 callback으로 한 번 전달

이 파일에서 route editor, 문자열, 고도 state를 직접 변경하지 않는다. `findInsertIndex()`와 `relabeledWaypoints()`는 임시 드래그용으로만 유지한다.

`routePreview.test.js`에는 중간 segment 삽입, mouseup callback 한 번, 고정 공항 drag 금지를 추가한다.

### `frontend/src/features/route-briefing/lib/routeBriefingModel.js`

`buildVfrWaypointsFromRouteResult()`를 지도/저장/단면 waypoint 배열의 단일 변환기로 유지한다.

- 직항 결과에서는 preview line의 첫·끝 공항만 배열에 들어가는지 테스트한다.
- manual VFR 결과에서는 공항 + FIX/좌표 순서가 유지되는지 테스트한다.
- `buildRoutePreviewModel()`은 적용 VFR 결과와 editor VFR preview를 구분해 synchronizer로 전달한다.

### `frontend/src/features/route-briefing/lib/routePreviewSync.js`

새 source나 layer를 만들지 않는다. 기존 VFR drag layer가 `ROUTE_PREVIEW_SOURCE`의 `VFR_WP_CIRCLE`과 `ROUTE_PREVIEW_LINE_HIT`만 듣기 때문이다.

- VFR 초안이 있으면 `ROUTE_PREVIEW_SOURCE`에 `draftVfrWaypoints` GeoJSON을 쓴다. 기존 waypoint circle/hit layer가 계속 drag를 받는다.
- 적용 base VFR은 기존 `briefing-route-baseline` source에 `appliedVfrWaypoints` GeoJSON을 쓴다.
- VFR 초안이 없을 때만 `ROUTE_PREVIEW_SOURCE`는 applied VFR GeoJSON을 쓴다.
- 초안은 기존 draft line 스타일, base는 기존 baseline 스타일을 사용한다. `briefing-route-pending`을 새 VFR 편집 source로 사용하지 않는다.
- 적용 base가 아직 없는 VFR 직항 초안도 `routeEditor.preview.flightRule === 'VFR'`만으로 이 branch를 타고 interactive하게 보여야 한다.

`routePreviewSync.test.js`에는 applied base와 draft가 동시에 있을 때 source 역할, base 없이 draft만 있을 때 VFR drag GeoJSON, 초안 제거 후 base 유지, waypoint 2개 미만 시 빈 GeoJSON을 추가한다.

### `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`

제거:

- `vfrRouteBuilder`, `vfrWaypointSection`, `vfrExpanded`
- VFR 목록 drag state, `useFlipRows`, 목록/고도 관련 import와 action props
- `③ 경유점` UI와 `순항고도 전체 적용`

변경:

- VFR label: `VFR 초안 경로 (공항 · FIX · DCT · 좌표)`
- placeholder: `예: RKSI DCT GONAX DCT RKPK`
- 안내: `지도에서 선을 끌어 지점을 넣으면 이 문자열이 갱신됩니다. 경로 적용 전에는 초안선만 바뀝니다.`
- 브리핑 조건 번호는 IFR/VFR 공통 `③`
- 적용 base 요약에는 VFR도 전체 문자열을 표시하고, 초안 안내와 섞지 않는다.
- 항공 지도 레이어 chip은 경유점 목록과 별개의 기능이므로 유지한다.
- 모바일의 현재 VFR 경로 입력은 `rb-vfr-note`만 보이므로, desktop과 같은 전체 문자열 textarea·적용 버튼·초안 오류·확인 카드를 mobile VFR에도 제공한다. Ctrl+Enter는 desktop 보조 동작으로만 둔다.

### `frontend/src/features/map/MapView.jsx`

새 state/useEffect를 추가하지 않는다.

`bindVfrInteractions(map, vfrWaypointsRef, vfrWaypointDropRef)` wiring은 유지한다. hook이 초안에서 파생한 배열을 ref에 제공한다. 목록 UI에만 쓰였던 hover overlay가 있다면 삭제하고, 지도 waypoint label/hover 기능은 유지한다.

### `frontend/src/features/route-briefing/lib/routeStore.js`

저장 version은 올리지 않는다.

- 새 VFR 저장은 base의 전체 route string/enroute를 정본으로 쓴다.
- 예전 `vfrWaypoints` snapshot은 load 시 고정 양끝을 제외하고, 이름 있는 점은 FIX id, 그 외 점은 좌표 token으로 전체 문자열을 만든다.
- `normalizeRouteSnapshot()`은 version 2 + base여도 legacy VFR `vfrWaypoints` overlay가 있으면 이 정규화를 수행한다. migration 책임을 hook과 나누지 않는다.
- IFR snapshot 정규화는 변경하지 않는다.

`routeStore.test.js`에는 legacy VFR waypoint snapshot 정규화와 IFR 회귀를 추가한다.

## 작업 순서와 검증

### Task 1 — 전체 문자열 adapter

1. `manualRouteInput.test.js`에 실패 테스트를 추가한다.
2. `parseVfrDraftText()`와 `formatVfrDraftText()`를 구현한다.
3. focused test 실행.

```powershell
npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/manualRouteInput.test.js
```

### Task 2 — VFR preview와 적용 경계

1. `buildEditorPreview()`와 `applyRouteDraft()`를 하나의 VFR adapter 흐름으로 통합한다.
2. 공항 자동 commit을 preview 생성으로 교체한다.
3. 직항/경유/공항 변경 취소를 model/hook 테스트로 확인한다.
4. 늦은 A preview 요청이 B 문자열 또는 다른 공항 선택 뒤 도착해 B preview를 덮지 않는지 확인한다.

### Task 3 — 지도 드래그

1. 드래그 callback을 전체 문자열 갱신으로 연결한다.
2. FIX 승인, 취소, 좌표 fallback, 삽입 순서를 테스트한다.
3. 확인 카드가 적용/취소 뒤 항상 닫히는지 확인한다.
4. cancel이 rawText와 preview를 모두 drag 전 상태로 복원하는지 확인한다.

### Task 4 — 중복 UI/state 제거

1. VFR 목록·개별 고도 UI와 action/state를 제거한다.
2. 거리·저장·연직단면에 필요한 파생 waypoint만 유지한다.
3. desktop/iPad/mobile 레이아웃과 섹션 번호를 확인한다.

### Task 5 — source 분리와 저장 호환성

1. VFR base/pending source를 분리한다.
2. 저장·불러오기·import·고도 분석이 applied base만 읽게 한다.
3. legacy v1/v2 VFR snapshot, 새 snapshot, base undo 회귀 테스트를 추가한다.

### Task 6 — 전체 검증 및 handoff

```powershell
npm.cmd run test --prefix frontend -- src/features/route-briefing/lib/manualRouteInput.test.js src/features/route-briefing/lib/routeBriefingModel.test.js src/features/route-briefing/lib/routePreview.test.js src/features/route-briefing/lib/routePreviewSync.test.js src/features/route-briefing/lib/routeStore.test.js
npx.cmd depcruise .
npx.cmd knip
npm.cmd run test --prefix frontend
npm.cmd run build --prefix frontend
git diff --check
graphify update .
```

`docs/operations/dev-server-and-capture.md` 절차에 따라 Playwright 검증을 한다.

1. Desktop: VFR 공항 선택 → 전체 직항 문자열과 초안선, 적용 base 불변 확인.
2. Desktop: 중간 선 drag → FIX 승인/취소·좌표 fallback이 문자열과 지도에 같은 순서로 반영되는지 확인.
3. Desktop: 문자열 FIX/좌표 편집 → 적용 전 base 불변, 적용/되돌리기 정상 확인.
4. Desktop: 저장/불러오기/import 뒤 문자열·지도·거리·고도 비교가 같은 applied base를 쓰는지 확인.
5. iPad landscape: 삭제된 목록/개별 고도 UI가 없고 입력·오류·적용 버튼이 잘리지 않는지 확인.
6. Mobile: VFR 문자열/적용 흐름이 중복 UI 없이 동작하는지 확인.

증적은 `artifacts/responsive-screenshots/vfr-single-draft-route-editor/<timestamp>/`에 저장하고, 실제 결과를 상태 문서에 기록한다. 커밋·푸시는 하지 않는다.

## 완료 조건

- [ ] VFR 사용자가 직접 고치는 경로 상태는 전체 문자열 하나뿐이다.
- [ ] 공항 선택, 텍스트 입력, 지도 drag 뒤 문자열과 초안선 순서가 같다.
- [ ] 적용 전 base·저장·고도 비교·브리핑 대상은 변하지 않는다.
- [ ] applied/draft VFR waypoint 배열과 지도 source 역할이 섞이지 않는다.
- [ ] `DEP DCT ARR` 직항이 유효하다.
- [ ] VFR 목록·개별 고도·전용 undo UI와 그 편집 state가 없다.
- [ ] 기존 VFR 저장 경로와 새 저장 경로를 모두 불러올 수 있다.
- [ ] VFR base undo 뒤 지도·거리·저장 geometry가 이전 base와 일치한다.
- [ ] `MapView.jsx`에 새 state/useEffect가 없다.
- [ ] focused tests, 구조 검사, 전체 frontend test/build, `git diff --check`, graphify update, desktop/iPad/mobile Playwright가 통과한다.

## 범위 밖

- waypoint별 통과고도 제약 입력
- VFR 항공로 사용
- 자동 우회·안전 점수·추천
- 새 MapView lifecycle/state
- 새 저장 version 또는 서버 schema migration
