# 첫 번째 탭 경로 편집기 통합 구현계획

> 상태: 구현 전 · 스펙: `docs/superpowers/specs/2026-07-18-flight-plan-input-first-tab-design.md`

## 목표

첫 번째 탭의 공항·절차·문자열·자동 생성·지도 클릭·그리기·적용·되돌리기가 하나의 편집 초안을 읽고 갱신하게 한다. 적용 기본 경로는 `base` 설계안 하나만 소유하며, 문자열과 지도는 같은 초안 또는 같은 적용 경로를 항상 함께 보여 준다.

## 범위와 결정

- 편집 상태는 `기준선`, `경로 초안`, `적용 기본 경로` 세 상태로 한정한다.
- SID/STAR/IAP 선택은 초안에 즉시 반영해 지도에서 연결 모습을 보인다. 적용 전 base 설계안은 바꾸지 않는다.
- 자동 생성·지도 클릭·그리기는 모두 초안 문자열과 초안 지도 미리보기를 만든다. 적용/취소 전에는 base를 바꾸지 않는다.
- `적용`과 `되돌리기`는 하나의 공통 확정 경로 전환을 사용한다.
- `MapView.jsx`에는 새 state 또는 `useEffect`를 추가하지 않는다.
- ETA 자동/수동 모드와 데스크톱·모바일 화면 통일은 최신 사용자 결정에 따라 후속 작업으로 남긴다. 단, 이번 변경으로 같은 편집 상태를 읽도록 만든다.
- 자동 우회·추천 순위·안전 판정·새 기상 데이터/레이어/점수는 만들지 않는다.

## 공통 계약

```text
routeEditor (기준선 또는 초안)
  routeForm + procedures + enroute + rawText + preview + pending intent
                │
                ├── 지도/문자열/전체 계획 표시
                │
                └── applyBaseRoute() ──> base RouteDesign (적용 경로)
                                             │
                                             └── undo snapshot
```

- `routeEditor.rawText`는 사람이 편집하는 호환 en-route 문자열이다.
- `routeEditor.enroute`는 파싱/지도 제안에서 만든 구조 토큰과 사용자 waypoint다.
- `routeEditor.preview`는 적용 전 검증을 통과한 계산 결과다. 실패하면 이전 preview와 base를 유지한다.
- `routeDesigns.find(id === 'base')`는 적용 `routeForm`, 절차, enroute, 결과, route model, 노출과 undo snapshot의 유일한 소유자다.
- 선택된 base의 투영은 문자열·절차·지도에 동시에 수행한다. `routeResult`는 이 적용 설계안의 표시용 파생값이다.

## Task 1 — 순수 편집 상태와 투영 계약

**Files:**
- Create `frontend/src/features/route-briefing/lib/routeEditor.js`
- Create `frontend/src/features/route-briefing/lib/routeEditor.test.js`
- Modify `frontend/src/features/route-briefing/lib/routeDesigns.js`
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js`

1. `createRouteEditor`, `editorFromBase`, `emptyEditorForContext`, `replaceEditorEnroute`, `replaceEditorProcedures`의 순수 helper와 테스트를 만든다.
2. 테스트는 빈 공항 기준선, base에서 초안 복원, 절차 변경이 base를 건드리지 않는지, 사용자 waypoint/문자열 독립성을 확인한다.
3. `useRouteBriefing`의 분산된 `routeForm`, 절차 선택값, `routeDraftText`, `routeDraftResult`, `pendingRouteEdit`를 `routeEditor`로 옮긴다. UI 호환용 파생값만 기존 이름으로 노출한다.
4. `projectBaseForSettings()`와 base undo가 `editorFromBase()` 하나를 사용하게 한다.

**Acceptance:** base를 선택하거나 undo하면 공항·절차·문자열·지도 입력이 동일한 base snapshot으로 복원된다.

## Task 2 — 초안 갱신과 공항/절차 전환 정리

**Files:**
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Extend `frontend/src/features/route-briefing/lib/routeEditor.test.js`

1. 공항, 비행 규칙, 공항 교환, 진입 FIX, 이탈 FIX, SID, STAR, IAP 변경을 `updateEditorContext()`로 통일한다.
2. 공항 교환은 출발/도착을 한 번에 바꾸고 기존 base가 있으면 한 번만 확인한다.
3. 진입 FIX 직접 변경은 SID만, 이탈 FIX 직접 변경은 STAR만 해제하도록 고친다.
4. 절차 선택은 editor에 즉시 반영하고 procedure preview를 갱신한다. base 절차는 적용 전 유지한다.
5. 공항/비행 규칙 변경 확인의 승인 시에만 base와 대체안을 폐기하고 새 기준선·빈 editor로 전환한다.
6. 문자열이 비었을 때 `경로 적용`은 비활성화한다. 지도 클릭/그리기는 공항 두 개가 있으면 활성화한다.

**Acceptance:** 하나의 입력 변경이 현재 초안만 바꾸며, 확인 전 적용 경로·대체안·브리핑 입력은 변하지 않는다.

## Task 3 — 공통 초안 검증과 지도 미리보기

**Files:**
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify `frontend/src/features/route-briefing/lib/routeBriefingModel.js`
- Modify `frontend/src/features/route-briefing/lib/routePreviewSync.js`
- Modify `frontend/src/features/route-briefing/lib/routePreviewSync.test.js`
- Modify `frontend/src/features/route-briefing/lib/routePreview.js`

1. `previewEditorRoute()`를 추가한다. editor의 `{ routeForm, procedures, enroute }`만 받아 수동 경로를 검증·계산하고, 마지막 요청만 반영한다.
2. 자동 생성은 editor의 절차·문자열·enroute를 채운 뒤 이 preview를 호출한다. 기존 base를 직접 바꾸지 않는다.
3. 지도 클릭은 선택 FIX/DCT와 삽입 구간을 editor에 제안하고, 문자열과 pending preview를 즉시 갱신한다.
4. 그리기는 포인터 이동 중 임시 선만 표시한다. mouseup 뒤 한 번만 FIX를 해석해 editor 문자열과 pending preview를 만든다.
5. `routePreviewModel`은 baseline, applied base, pending editor preview를 명시적으로 전달한다. `syncRoutePreviewLayers`는 각 source를 한 번만 쓰며 applied와 pending을 덮어쓰지 않는다.
6. 확인 카드는 pending preview의 `A → P → B`, 변경 문자열 조각, 적용/취소를 표시한다. 버튼 이벤트는 지도 클릭으로 재전파되지 않아야 한다.

**Acceptance:** 자동 생성·클릭·그리기 후 적용 전에도 문자열과 지도 pending 선이 같은 초안을 보이고, 취소/실패는 base를 보존한다.

## Task 4 — 단일 적용·되돌리기 전환

**Files:**
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify `frontend/src/features/route-briefing/lib/routeDesigns.js`
- Extend `frontend/src/features/route-briefing/lib/routeEditor.test.js`
- Extend `frontend/src/features/route-briefing/lib/routePlanner.enroute.test.js`

1. `applyBaseRoute(editor)` 하나를 만든다. 검증된 preview로 base 설계안을 만들고, 이전 base 전체 snapshot을 undo에 저장한다.
2. 이 함수가 base의 `routeForm`, 절차, enroute, `routeString`, route result, route model, 노출을 동시에 갱신하게 한다.
3. 적용 뒤 editor는 새 base에서 다시 투영하고, pending preview/확인/오류를 정리하며 지도 모드를 종료한다.
4. 고도 비교·연직단면·브리핑은 적용 경로 변경 시 무효화한다. 다른 대체안은 base 적용 시에만 명시적으로 폐기한다.
5. `undoBaseRoute()`는 snapshot을 base에 복원한 뒤 같은 projection을 사용한다. 문자열과 지도만 따로 갱신하는 코드를 없앤다.
6. 선택 설계안 편집의 문자열 갱신 규칙은 이번 공통 formatter를 재사용하되, 두 번째 탭 UX 자체는 바꾸지 않는다.

**Acceptance:** 적용과 되돌리기 각각 뒤에 base, 문자열, 절차, 주황색 지도선, undo 가능 여부가 모두 같은 snapshot을 가리킨다.

## Task 5 — 첫 번째 탭 UI 연결과 오류 상태

**Files:**
- Modify `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`
- Modify `frontend/src/features/route-briefing/RouteBriefing.css`
- Extend focused tests above

1. 첫 번째 탭 필드를 editor 파생값에 연결하고, `초안`/`적용됨` 상태를 텍스트로 명확히 표시한다.
2. 전체 계획 표시를 문자열 아래에 두어 초안 절차·en-route·도착을 함께 보여 준다. 호환 문자열에는 SID/STAR/IAP를 넣지 않는다.
3. `자동 생성`, `지도 클릭`, `그리기`의 버튼 상태와 현재 지도 모드를 일관되게 표시한다.
4. 입력 오류, 지도 해석 실패, 연결 실패, 적용 성공을 전역 오류 하나로 덮어쓰지 않고 editor 작업의 문맥에 맞게 표시한다.
5. Enter는 문자열 적용만 실행하고, 첫 번째 탭 전체 form submit이 별도 자동 경로 검색을 실행하지 않게 한다.
6. 모바일은 이번 범위에서 동일 editor와 action을 읽도록 연결한다. 세부 화면 순서/버튼 배치는 후속 반응형 작업으로 남긴다.

**Acceptance:** 사용자에게 현재 보이는 문자열·지도선·절차·버튼 상태가 초안인지 적용 경로인지 항상 설명된다.

## Task 6 — 저장/불러오기·검증·문서화

**Files:**
- Modify `frontend/src/features/route-briefing/lib/routeStore.js` 및 테스트
- Modify `frontend/src/features/route-briefing/useRouteBriefing.js`
- Modify `Architecture.md`
- Modify `docs/superpowers/status/2026-07-17-route-alternatives-four-stage-flow.status.md`

1. 저장 snapshot v2가 base의 절차 key, enroute tokens, 사용자 waypoint, 다음 waypoint 번호를 보존하는지 확인하고 필요한 최소 이행을 구현한다.
2. 저장 경로를 불러오면 자동 생성으로 덮어쓰지 않고 base→editor projection을 사용한다. TAS/ETD/교체공항도 기존 저장 계약에 맞게 round-trip한다.
3. focused Node tests: editor 상태, 문자열/항공로/DCT, 클릭/그리기 후보, apply/undo projection, 저장 이행.
4. 전체 frontend tests, production build, `npx madge --circular frontend/src/features/route-briefing/useRouteBriefing.js`, `git diff --check`, `graphify update .`를 실행한다.
5. 문서화된 dev:test/dev-server 절차와 Playwright로 desktop, iPad landscape 1180×820, mobile 390×844를 검증한다. 캡처와 manifest는 `artifacts/responsive-screenshots/`에 저장한다.
6. Architecture file roles와 상태 문서를 갱신한다. 커밋·푸시는 하지 않는다.

## 완료 기준

- 어떤 경로 입력 방식이든 동일한 editor draft를 갱신한다.
- 적용/되돌리기 뒤 문자열·지도·절차·base 설계안이 서로 다른 경로를 보이지 않는다.
- 적용 전 제안은 항상 지도와 문자열로 확인할 수 있고, 실패/취소는 base를 보존한다.
- MapView 제약, 최대 4개 설계안, 선택 설계안만 downstream 전달, 기상 레이어 비개입 제약을 지킨다.
