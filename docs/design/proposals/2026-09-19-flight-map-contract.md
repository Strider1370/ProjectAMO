# 내 지도 구현 연결 계약 v1

2026-09-19 · 1단계 착수. UI/UX 명세 FM-01~21과 구현 계획 7절을 구현한다. 현재 공유 작업공간에서 이 계약과 공통 도메인 모듈은 주 에이전트가 소유한다. 변경 필요 시 근거를 전달하고 합류 후 적용한다.

## 문서와 원본

MapDocument JSON:

~~~js
{
  schemaVersion: 1, id: 'uuid', name: '내 지도',
  kind: 'personal', // personal | imported | organization
  revision: 0, createdAt: 'UTC ISO', updatedAt: 'UTC ISO',
  ungroupedOrder: 0,
  groups: [{ id: 'group-id', name: '그룹', parentId: null, order: 0, sourceVisibility: null }],
  items: [{
    id: 'item-id', groupId: null, order: 0,
    kind: 'point', // point | line | polygon | circle | compound
    name: '지점', description: '',
    geometry: { type: 'Point', coordinates: [126, 37] },
    definition: null, // circle: { center: [lng, lat], radiusNm }
    style: { color: '#475569', width: 2, opacity: 1, fillColor: '#475569', fillOpacity: 0.1, pointSize: 5, dash: 'solid', icon: 'dot' },
    label: { visible: true, size: 12, always: false },
    altitude: { floorFt: null, ceilingFt: null, datum: 'MSL' },
    source: null // imported source below; never overwrite with user edits
  }],
  source: null, // imported: { fileName, documentName, warnings: [] }
}
~~~

원본 item.source는 { sourceAssetId, itemId, folderPath, properties, metadataEntries, descriptionRaw, descriptionText, descriptionNarrativeText, summary, warnings }다. metadataEntries는 [{key, value}] 배열로 중복 이름과 순서를 보존한다. summary는 의미를 확실히 확인한 경우만 [{label, value}]를 담는다. descriptionRaw는 원본 문자열 또는 HTML 설명 객체, descriptionText는 실행 가능한 태그 없는 표시용 글이다. properties에는 보존할 원본 GeoJSON 속성을 담는다. 원본 고도는 이 자료에 보관하며 검증 없이 altitude.ft 필드에 옮기지 않는다.

읽기 원본의 groups는 parentId 계층을 유지한다. 신규 개인 그룹은 parentId=null만 사용한다. 원본 Placemark 하나가 item 하나다. compound의 GeometryCollection/Multi*는 렌더링에서 분해해도 원본 itemId로 연결한다. 그룹 없음은 null이며 가상 그룹을 저장하지 않는다. ID는 이름과 독립이고 문서 안에서 유일하다. 복제/변환은 새 ID와 참조 재매핑을 사용한다.

## 2단계 파서 연결 — A 소유

새 lib/importMapDocument.js:

~~~js
export async function importMapDocument(arrayBuffer, fileName, { id } = {})
// => MapDocument(kind=imported), 읽기 실패는 stage/message 있는 Error
~~~

새 lib/mapMetadata.js: 원본 설명/속성을 위 source에 맞게 정리하는 순수 함수와 테스트. DOMParser는 브라우저 전역, Node 테스트는 기존 xmldom 주입 방식. 기존 parseMyMapFile 및 /draw 계약은 이번 단계에서 변경하지 않는다. 자체 ID가 없는 원본도 파일 내 순번/경로 기반 식별 가능하게 한다. 원본 파일 보관은 컨트롤러가 담당한다. 새 의존성 없이 기존 파서와 DOM을 우선 활용한다.

## 패널 연결 — B 소유

MyMapPanel({ myMap, onClose })는 아래 컨트롤러를 받는다. 제품 패널의 보기 기본, 편집 별도 자리 교체를 유지한다. 현재 2단계에서는 읽기 화면만 먼저 구현한다.

~~~js
myMap = {
  documents: [], // 위 MapDocument + loaded:boolean; 미로딩 파일도 목록에 표시
  currentId: null, selectedId: null,
  mode: 'library', // library | view | edit
  visibleIds: new Set(), hiddenGroups: new Set(), hiddenItems: new Set(),
  // hiddenGroups/Items 키는 `${documentId}:${id}`. 원본 기본 visibility는 초기 표시 판단에 반영.
  busy: null, error: null, notice: null,
  openDocument(id), showLibrary(), toggleDocument(id), removeDocument(id),
  addFile(file), selectItem(id), clearSelection(),
  toggleGroup(groupId), toggleItem(itemId), fitGroup(groupId), fitDocument(),
  setAllVisible(boolean),
  // 다음 단계의 존재하는 기능만 표시; undefined일 때 실행 가능한 것처럼 노출하지 않음.
  createDocument, startEditing, finishEditing, exportDocument, shareDocument,
}
~~~

선택 항목은 current document의 items에서 찾는다. source가 있으면 가변 메타데이터·원문 설명(안전한 텍스트/표)을 표시한다. 알려진 summary가 없으면 전체 속성표를 바로 펼친다. 많은 항목은 접힌 그룹의 자식을 렌더하지 않고 긴 목록은 점진 렌더/가상화를 고려한다. 그룹 카운트는 렌더링 조각이 아닌 items 수다. 검색은 항목 이름+폴더 이름, 조상 경로 포함. 원본 파일 전체 삭제는 확인한다.

기존 data-testid my-map-file, my-map-files, my-map-tree, my-map-search를 가능한 의미 유지하며 제공한다. 선택(열기)과 표시 토글은 분리하며 과거 파일 토글 하나로 열기까지 하던 계약 테스트는 새 UX에 맞게 주 에이전트가 갱신한다.

## 소유 파일

- 주 에이전트: 이 계약, lib/mapDocument.js와 도메인 테스트, useMyMap.js, 지도 어댑터, App/MapView 연결, 브라우저 계약.
- A: lib/importMapDocument.js, lib/mapMetadata.js 및 대응 테스트. 다음 단계에서 별도 배정 전 백엔드/기존 파서 수정 금지.
- B: MyMapPanel.jsx, MyMapPanel.css, 신규 MyMapDetail.jsx, MapMetadataDetails.jsx, lib/mapPanelRows.js 및 대응 테스트. 지도 훅/파서/공통 모델 수정 금지.
- C: 계약과 합류 코드 독립 검토. 소유 파일 수정 없이 재현·근거를 보고.

공유 코드/콜백 변경은 먼저 전달한다. 각 담당자는 완료 시 수정 파일·실행 명령·테스트 결과·미검증 범위를 반환한다. 부분 완료를 제품 전체 완료로 표시하지 않는다.

## 개인 저장 API 계약 v1 — 3단계 서버 선행

2026-09-19 확정. 자료/상태 전체 계약 중 저장 경계를 구체화한다. 작성 명령 계약은 별도 후속 절에 정의한다.

- URL `/api/me/maps`, 로그인한 활성 계정만. 쓰기는 기존 trusted mutation origin 검사.
- `GET /` → `{ maps: [{id,name,revision,createdAt,updatedAt,itemCount,groupCount}] }`.
- `POST /` body `{ snapshot: MapDocument }` → 201 `{ document }`. 클라이언트 UUID id 유지, 최초 서버 revision=1. 같은 id가 이미 있으면 409 `map_exists` (남의 자료를 응답하지 않음). 네트워크 단절 재시도는 GET 후 사용자 로컬 변경을 유지하면서 revision 확인.
- `GET /:id` → `{ document }`. 다른 계정/없는 지도는 동일 404.
- `PUT /:id` body `{ expectedRevision: positiveInteger, snapshot }` → `{ document }`. snapshot.id=URL id, kind=personal. UPDATE와 소유권/revision 비교 원자 처리. 충돌은 409 `{ error:'revision_conflict', currentRevision }`, 자동 덮어쓰기 금지.
- `DELETE /:id` → `{ok:true}`. 소유자만, 기관 공유본과 독립. 없는 자료/남의 자료는 동일 404.
- 서버는 ownerId, revision, createdAt, updatedAt을 결정한다. 임의 조직/권한 필드를 믿거나 보관하지 않는다. 원본 item.source/properties/metadataEntries/descriptionRaw 등은 JSON 값과 순서를 그대로 보존한다.
- 개인 그룹은 한 단계 parentId=null, group/item id 유일·group 참조 유효·순서 유한 비음수. 원은 정의와 기하를 함께 검증한다. Point/LineString/Polygon 및 compound Multi*/GeometryCollection. 가져온 미해석 항목은 source가 있는 compound+geometry=null로 보관 가능하며 신규 생성 도구에는 사용하지 않는다.
- 좌표 유한 범위 경도 ±180/위도 ±90, 닫힌 면/내부 링, 양의 유한 반경, 고도 null/0 구분 및 floor<ceiling. 대량 원본 검증은 구조/좌표에 한정하고 O(n²) 자기교차 검사는 새 작성 완료 때 수행한다.
- 실측 JSON: 맥케이 약 13.45MB, 공역정보 약 6.75MB. 지도 전용 요청/문서 한도 **32MiB**, 계정 합계 **256MiB/100개**, 문서 최대 10,000 항목·2,000 그룹·1,000,000 좌표·100,000 기하 조각·중첩 32. 초과 시 명시적 413/용량 오류, 잘라서 저장하지 않음. 실제 파일을 현재의 전역 1mb parser에 넣지 않는다.
- 지도 전용 Express parser를 전역 1mb parser보다 앞에서 경로 한정 적용하며 동일 nginx 한도 설정은 주 에이전트 소유. 다른 API 한도는 유지.
- 저장 어댑터는 완료 자료만 전송. 변경 세대와 마지막 서버 확인 revision을 분리하여 이전 응답이 새 변경을 덮거나 synced로 표시하지 않음. 계정 전환 시 요청 취소/세대 무효화. 로컬 복구 키는 계정 id별, 비로그인은 guest별.

서버 구현 소유: A의 신규 backend/src/maps/{schema,repository,router}.js와 대응 테스트, backend/src/db/schema.sql의 신규 개인 지도 테이블. backend/server.js, 배포 nginx, 프론트 저장 큐는 주 에이전트가 합류한다. 기관 테이블/API는 후속 배정으로 구분한다.

용량은 UTF-8 JSON 바이트 기준이며 계정 quota 검사와 POST/PUT 쓰기를 같은 트랜잭션에서 원자 처리한다. PUT은 기존 문서 크기를 뺀 합계로 검사한다. 신규/편집 바닥과 천장이 모두 있으면 strict floor<ceiling을 적용한다(원본의 다른 값은 source에서 보존).

## 작성 컨트롤러 계약 v1 — 3단계

`myMap`에 아래 값을 추가한다. 문서/기하의 실제 변경은 컨트롤러만 수행하며 UI는 입력 중 문자열과 드래그 힌트만 보관한다. 편집 화면은 MyMapEditor가 맡고 mode=edit일 때 Viewer 대신 렌더한다. 보기 화면에서 도구를 노출하지 않는다.

```js
editor: {
  pane:'list', // list | item | bulk
  selectionIds:new Set(), selectionMode:false,
  activeTool:null, // point | line | polygon | circle | null
  continuousPoint:false, targetGroupId:null,
  draft:null, // {kind,coordinates:[],pointer:null}; circle center=coordinates[0]
  geometryEdit:null, // {itemId,item:previewItem,selectedVertex:null}
  canUndo:false, canRedo:false, exitPending:false,
},
saveStatus: {state:'local',message:'이 기기에 저장 중'}, // 실제 저장 결과만 표시, 없으면 숨김
createDocument(name), startEditing(id=currentId), finishEditing(),
continueEditing(), discardAndExit(),
setEditorPane(pane), selectEditorItem(itemId), clearEditorSelection(),
setSelectionMode(boolean), toggleEditorSelection(itemId),
setActiveTool(kind), setContinuousPoint(boolean), setTargetGroup(groupId),
undoDraftPoint(), finishDraft(), cancelDraft(),
updateItem(itemId,patch,{coalesce}={}), endPropertyEdit(),
beginGeometryEdit(itemId), commitGeometryEdit(), cancelGeometryEdit(),
updateGeometryDefinition({center,radiusNm}), deleteGeometryVertex(),
undoEdit(), redoEdit(),
createGroup(name), renameGroup(groupId,name), ungroup(groupId),
deleteGroup(groupId), // confirmation UI, deletes group and children in one undo
moveItems(itemIds,{targetGroupId,beforeItemId=null}),
moveGroup(groupId,{beforeGroupId=null}), // beforeGroupId null means last
setItemsStyle(itemIds,patch), setGroupLabels(groupId,boolean),
deleteItems(itemIds), // confirmation UI
addBulkPoints(rows,groupId), // rows [{name,coordinate:[lng,lat]}], atomic all-or-nothing
renameDocument(name),
```

- current selectedId는 편집 속성 항목, editor.selectionIds는 일괄 선택. selectEditorItem은 pane=item으로 전환, 목록 돌아가기는 setEditorPane('list'). 다중선택 모드에서는 항목 선택 체크박스와 이동/삭제/묶기 메뉴. 기존 toggleGroup/Item/setAllVisible 조회표시는 자료 편집과 독립.
- UI 도구/목록/속성/좌표 일괄 입력을 같은 패널 안에서 교체한다. 상세 속성은 name/description/style/label/altitude/groupId. 원의 중심/반경은 형태 편집에서 definition만 변경. 기하/source/id 등은 updateItem 일반 patch로 변경하지 않는다.
- updateItem은 유효한 값 즉시 적용, 잘못된 숫자/좌표는 로컬 입력칸 오류로 남겨 완료자료를 훼손하지 않음. 모든 변경 명령 `{ok:true}` 또는 `{ok:false,error}` 반환. coalesce는 `'itemId:field'` 문자열, focus~blur 사이 같은 필드 변경을 undo 한 단계로 합침; blur에서 endPropertyEdit.
- draft와 geometryEdit은 완료 문서와 분리한다. 지도에서 geometryEdit.item을 미리 표시하고 완료 시만 문서에 커밋. 취소는 원본을 바꾸지 않음. 미완성 상태에서 도구/항목/패널/문서 이동은 requestNavigation(next) 내부 게이트 → editor.exitPending. UI 선택지는 '계속 그리기'/'그냥 나가기' 두 개. 그냥 나가기는 미완성만 폐기하고 완료 문서 유지.
- 선2점/면3점 이상 및 면 자기교차 등 유효성검사 후 finishDraft. 원은 중심+둘째 클릭의 대권 거리(NM). 연속점은 매 클릭 완료 명령, 취소/이탈 시 이전 점 유지. 생성은 대상그룹/종류별 마지막스타일을 상속.
- group 한단계. 그룹 삭제는 내용 포함, ungroup은 group만 제거하며 항목 유지. moveItems/drop 한 번=undo 한 번. 검색 중 재정렬 금지, 드래그 외 키보드 이동 메뉴 제공. 그룹 없는 항목 블록도 ungroupedOrder로 유지.
- 일괄 좌표 UI는 raw string을 로컬 보관하고 기존 coordFormat parser로 모든 행 미리보기. 순서 lat-lng 기본을 명시하고 DD/DDM/DMS 선택. 오류 행 있으면 전체 추가 금지. root는 반환된 좌표를 다시 검증한다. 한 번 추가=한 번 undo.
- 개인문서만 편집 가능. compound는 속성/그룹/이동 대상으로 보존하지만 이번 단계의 꼭짓점 편집 버튼은 비활성 이유를 표시한다. 원본 읽기문서에서 수정은 후속 변환미리보기/개인사본 생성으로 이어진다.

UI 소유 B: MyMapEditor.jsx, MapEditorToolbar.jsx, MapEditorTree.jsx, MapItemEditor.jsx, MapBulkCoordinatePanel.jsx, MyMapEditor.css와 필요한 UI helper/test. MyMapPanel은 mode=edit 분기, 신규/수정 버튼·두 선택지 Dialog 배선만 변경한다. root 소유 useMyMapEditor.js, lib/mapCommands.js, lib/mapEditorOverlay.js, lib/mapEditorInteraction.js 및 테스트·App navigation 통합. 도메인 상태는 UI에서 별도로 복제하지 않는다.


작성 연결 보완: `moveGroup(null,{beforeGroupId})`는 그룹 없음 블록 이동. `beforeGroupId='__ungrouped__'`는 그룹 없음 앞 삽입, null은 맨끝. `updatePointCoordinate([lng,lat])`는 point geometryEdit의 미리보기만 수정한다. 개인 API는 POST/PUT 모두 kind=personal이며 매 요청 DB의 활성 계정을 확인한다. Express는 전역1MiB parser에서 지도 경로만 건너뛰고, 인증 세션 설치 뒤 maps router의32MiB parser를 사용한다.


## 개인 저장·복구 화면 연결 — 4단계

`storage={ready,account,states:{[id]:{state,revision,error}},drafts:{[id]:record},guestMaps,error}`와 `retrySave`, `copyConflict`, `openServerVersion`, `restoreDraft`, `discardRecoveredDraft`, `importGuestMap`을 컨트롤러에서 제공한다. 기기 저장 성공 후만 localOnly, 서버가 최신 변경을 확인한 후만 synced를 표시한다. 오류는 저장 위치에 맞게 설명한다.

복구 저장소의 완료 자료는 `{id,document,dirty,conflict}` envelope이다. revision이 같아도 dirty이면 미저장 내용을 다시 전송한다. 서버 revision이 앞서거나 기존 서버 문서가 삭제되었으면 자동 덮어쓰기/재생성 없이 충돌로 남긴다. 초안은 별도 저장소의 `{id,documentRevision,draft,geometryEdit,targetGroupId,baseGeometry,baseDefinition}`이며 명시적 작업 재개 후에만 편집기로 복원한다. 서버 문서를 먼저 열고 기존 도형이 달라졌으면 형태 초안 복원을 거절한다.

계정 키는 `account:id`, 비로그인 키는 `guest:browser`다. 원본 파일·보기 설정·복구 자료 모두 키를 분리한다. 이전 전역 원본 목록은 비로그인 영역에 남겨 보존하며 로그인 계정에 자동 귀속하지 않는다. 계정 전환 시 이전 서버 요청/화면 콜백·선택·undo를 무효화한다. 이미 접수한 로컬 쓰기는 캡처된 이전 계정 키에 최신본까지 완료한다. 충돌 후 새 편집은 로컬 복구만 갱신한다. 삭제 시작부터 새 저장/초안 입력을 차단하고 진행 중 서버 응답을 받은 뒤 삭제한다.

브라우저 종료에는 미완성 또는 확인되지 않은 저장이 있으면 기본 이탈 경고를 사용한다. 앱 내부의 두 선택지 이탈 확인과 구분한다.

## KML 변환/내보내기 계약 — 4단계

`previewMapConversion(document)`는 항목/그룹 개수·평탄화한 경로·미지원 표현 경고를 반환한다. `convertImportedMap(document,{name})`는 원본을 유지하고 새 ID의 개인 사본을 만든다. `exportMapKml(document,{groupId,itemIds})`는 문자열을 반환한다. 범위가 없으면 전체, groupId는 하위 폴더 포함, itemIds는 해당 항목만, 둘 다 있으면 교집합이다.

표준 Folder/Placemark/Style/좌표는 다른 KML 앱에서도 읽도록 작성한다. 예약 ExtendedData는 `projectamo:map-document`, `projectamo:folder`, `projectamo:item`의 version=1 JSON으로 순서·원 정의·스타일·이름표·고도·원본 source와 기하 타입 트리를 보존한다. 전체 예약 자료가 검증된 때에만 복원하며 불일치/미지원 버전/중복 키는 일반 KML로 읽고 경고한다. 유효 복원 시 운송 필드를 원본 메타데이터에 중복 추가하지 않는다. 실제 Z 좌표와 면 내부 링을 보존하고 고도 범위를 지도 지형 높이로 임의 변환하지 않는다.

HTML 설명의 `descriptionNarrativeText`는 표를 제외한 안전한 서술이다. 가변 표가 있다는 이유로 서술까지 숨기지 않는다. 필드가 없는 기존 문서는 descriptionText로 표시한다.
