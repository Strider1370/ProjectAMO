# 내 지도 구현 — 중단 기록과 재개 안내

**상태: 4단계까지 완료. 5단계(기관 공유)부터 남음.**

2026-09-20 갱신. 아래 중단 기록 이후 4단계를 마쳤다. 무엇을 고쳤고 무엇이 남았는지는
[구현 계획](2026-09-19-flight-map-implementation-plan.md)의 「4단계 완료 기록」이 최신이며,
재개 우선순위는 이 문서 끝의 「4단계 이후 남은 일」을 본다. 아래 본문은 중단 당시 기록 그대로 남긴다.

---

**아래는 2026-09-20 중단 시점의 기록이다.**

2026-09-20 KST. 사용자가 weekly 사용량 2%가 남아 즉시 중단하고 다음에 이어갈 수 있게 기록하라고 요청했다. 모든 서브에이전트에 interrupt를 보냈고 추가 구현·검증을 멈췄다. 재개 지시 전에는 작업을 자동으로 이어가지 않는다.

## 다음 세션에서 먼저 읽을 것

1. 이 문서
2. [구현 계획](2026-09-19-flight-map-implementation-plan.md)의 7절과 진행 기록
3. [연결 계약](2026-09-19-flight-map-contract.md)
4. [UI/UX 명세](2026-09-19-flight-map-ux-design.md)의 FM-01~21
5. [HTML 시안](../mockups/2026-09-19-flight-map.html), [시안 설명](../mockups/2026-09-19-flight-map.README.md)

사용자는 HTML 시안 디자인을 기준으로 구현하는지 재확인했다. **시안의 목록·보기·편집 패널 교체, 정보 배치, 버튼 위계를 구현 기준으로 유지한다.** 제품 지도와 기존 앱 외곽 UI는 유지하고 디자인 토큰을 사용한다. 기능만 연결해 놓고 시각 대조를 생략하면 안 된다.

## 작업공간 보존 상태

- 작업 위치 `/home/john_doe/ProjectAMO`. 변경은 아직 **커밋하지 않은 tracked 수정 + 다수 untracked 새 파일**로 남아 있다. `git clean`, reset/checkout으로 제거하지 않는다.
- 실제 배포·push·PR 생성 없음. 의존성 변경 없음.
- 중단 확인 시 3001/5173 리스닝 서버 없음. 마지막 managed browser 실행은 종료됨.
- 변경 파일 백업과 상태 목록은 ignored `artifacts/flight-map-pause/`에 함께 보관한다. 외부 실제 KMZ 파일은 백업이나 git에 넣지 않는다.
- AGENTS.md/CLAUDE.md는 변경하지 않았다. 한국어 응답, Node22.23.1/npm 규칙 준수.

## 구현된 범위와 주요 소유 파일

### 조회·시안 UI

- 기존 MapView의 동일 Mapbox 인스턴스 위에 개인/가져온 지도 표시. 여러 지도 동시 표시, 하나만 편집.
- 내 지도 기본 목록 → 보기 → 같은 자리 편집 전환. 모바일 더보기 진입도 추가.
- 원본 계층 폴더·검색·점진 목록, 항목 선택/표시 분리, 하단 상세·가변 메타데이터·원문 설명.
- `MyMapPanel`, `MyMapDetail`, `MapMetadataDetails`, `MyMapEditor`, `MapEditorToolbar`, `MapEditorTree`, `MapItemEditor`, `MapBulkCoordinatePanel`, `MyMapStorageStatus`, 대응 CSS/helper가 새 UI 영역.
- 실제 CHEONGJU 캡처에서 선택 시 패널 전체가 스크롤되는 문제를 발견했다. 선택 행 노출은 `.my-map-viewer-list`만 스크롤하도록 수정했고, 데스크톱 목록/상세를 55:45 독립 영역으로 만들었다. 최신 브라우저 캡처에서 둘 다 유지되는 것을 확인했다.
- HTML+metadataEntries가 있다고 설명 전체를 숨기던 정보 누락을 수정했다. `source.descriptionNarrativeText` 우선, 기존 문서는 descriptionText fallback, 긴 설명 펼치기.

### 작성 도메인·지도 입력

- `lib/mapDocument.js`, `mapCommands.js`: 문서/그룹/항목 ID, 점·선·면·원, 원 center/radiusNm, 복사, 순서, 그룹/다중 이동/스타일 명령.
- `useMyMapEditor.js`: 완료 자료와 draft/geometryEdit 분리, 연속 점, 속성 즉시 반영/입력 coalesce, undo/redo, 형태 완료/취소, 두 선택지 이탈(계속 그리기/그냥 나가기).
- `mapEditorGeometry.js`, `mapEditorOverlay.js`, `mapEditorInteraction.js`: 지도 클릭 작성, 꼭짓점/중간점 핸들, 도형 전체 드래그, 원 조절, 키보드 입력.
- `mapDocumentOverlay.js`: 조회 표시·선택·캐시·배경 스타일 재설치. **스타일 연결 누락은 아래 미완료 목록 참고.**
- `App.jsx`, `MapView.jsx`, Sidebar/MobileMoreMenu, routePreview: 패널/메뉴 이탈 게이트, 공항·경로 입력과 작성 충돌 방지. 전체 이탈 경로 최종 점검은 남음.
- Fluent Dialog를 열린 채 unmount하면 앱 접근성이 깨졌던 문제를 수정했다. MyMapPanel은 항상 mount하고 open prop으로 내용만 제어한다. Dialog도 open=false 전환을 유지한다.

### 개인 저장·복구

- `backend/src/maps/{schema,repository,router}.js`, `backend/test/maps.test.js`, DB personal_maps 테이블 구현. `/api/me/maps`를 backend/server.js에 연결했다.
- 활성 계정·소유권·trusted origin·expectedRevision 검사. 문서32MiB, 계정256MiB/100문서. 원본 source JSON 보존.
- 전역1MiB JSON parser에서 maps 경로만 제외하고 세션 뒤 maps router에서32MiB parser 적용. nginx **example만**32MiB 반영; 배포하지 않음.
- `mapAccountStore.js`: 계정 API, IndexedDB 완료본/초안 저장소.
- `mapSaveQueue.js`: 지도별 순차 전송, 최신 세대와 ACK revision 분리, 충돌 latch, 오래된 응답 차단, 로컬 쓰기 직렬화.
- `mapPersistence.js`: 계정 세션별 bootstrap/저장/복구/삭제/충돌. `{id,document,dirty,conflict}` envelope로 저장해 같은 revision의 미저장 내용을 구분한다.
- `useMyMap.js`: Auth scope 연결, 원본 파일/보기 설정까지 account:id와 guest:browser로 격리, 게스트 명시 사본 가져오기, 충돌 사본/서버본 열기, 완료본과 초안 분리, 작업 재개/버리기, beforeunload 경고.
- 리뷰 후 수정: 충돌 후 새 편집 자동 재전송, 계정 전환 때 최신 로컬 쓰기 누락, invalid ACK 성공 판정, 삭제 중 새 POST로 재생성, 미로딩 stub 초안 복구, 완료 초안 재노출, blocked 상태 flush 성공 반환.
- 계정 전환은 서버/화면 콜백을 무효화하되 이미 접수한 로컬 쓰기는 캡처한 이전 계정 키에 끝까지 저장한다.

### KML/KMZ

- `importMapDocument.js`, `mapMetadata.js`: Placemark당 논리 항목 하나, 복수 기하·내부 링·중복 필드·원문·원본 파일 보존.
- `mapKmlCodec.js`/test: exportMapKml(document,{groupId,itemIds}), previewMapConversion(document), convertImportedMap(document,{name}) 구현. **컨트롤러/UI에는 아직 연결하지 않았다.**
- 예약 ExtendedData version1으로 원 정의/style/label/altitude/source/geometryLayout을 왕복. 정상 예약 필드는 원본 metadata에 누적하지 않고, 검증 실패는 일반 KML+경고로 처리하는 계약.
- 리뷰에서 circle 정의-기하 불일치/내부 스타일 검증 누락과 ungroupedOrder 누락을 발견했다. 중단 직전 A가 일부 수정했다. 현재 디스크에는 circleGeometry import, sameCircleGeometry, 내부 payload 검사, importer ungroupedOrder, exporter root interleave가 들어 있다. **이 최신 수정의 테스트/독립 재검토 완료를 확인하지 못했으므로 재개 시 우선 검증한다.**

## 중단 당시 진행 중이던 작업

### A /root/map_data — Terra high

- 원본 파서/저장/backend/codec 담당. 중단 명령으로 interrupt함.
- `backend/src/maps/organization-repository.js`(162줄), `organization-router.js`(58줄)와 DB 기관 지도/불변 버전 스키마·트리거가 작성되어 있음. **미완성/미검증으로 취급. 기관 API 테스트 파일 없음, server.js에 mount 안 됨.**
- factory: `createOrganizationMapsRouter({db=null,trustedMutationOrigin=...})`, `/api/organizations`에 mount하면 내부 `/:orgId/maps`, `/:id`, `/:id/versions`, `/:id/versions/:version`.
- 합의: 조직 존재 + active membership + active user. 기존 organizations에는 active/status 열이 없어 새 열을 임의 추가하지 않음.
- 서버가 소유 personalMapId+expectedPersonalRevision을 읽어 snapshot 생성. 게시자/orgadmin만 업데이트·공유 중단, 관리자도 자기 개인 원본만 읽음. expectedSharedVersion CAS, note≤2000, 기관 전체 불변 버전 누적256MiB quota. 개인 원본 FK cascade 금지.
- codec 리뷰 수정과 기관 backend 사이에서 중단됨. 무엇이 실제 반영되었는지 파일부터 확인할 것.

### B /root/map_ui — Terra high

- UI/시안 담당. 저장 UI 및 CHEONGJU 스크롤 수정까지 build/diff 확인 완료.
- 마지막 배정: 새 `MyMapFileActions.jsx`와 패널 메뉴에 변환 미리보기/내보내기 Dialog 연결. **중단 확인 시 이 새 파일은 아직 없었음.** 작업 계획만 받았거나 준비 중이었다.
- 예정 controller: previewConversion(id), convertDocument(id,{name}), exportDocument(id,{groupId?,itemIds?}). root도 아직 메서드를 추가하지 않음.
- 사본 미리보기는 원본 유지, 이름, 평탄화 경로, 포함/변환/제외 개수·경고. 내보내기 전체/그룹/선택 범위와 완료 자료만 포함한다는 설명. 버튼 난립 대신 시안 V2 메뉴 밀도 유지.

### C /root/map_review — Astra high

- 읽기 전용 리뷰 완료, 추가 실행하지 않음. 코드 수정 금지 역할 유지.
- 실제 두 파일의 1회 KML 왕복에서 항목별 geometry/source/style/label/altitude/definition/kind/name/description/groupId/order와 그룹/문서source deep equality 차이0 확인.
- 리뷰 결함 중단 시 상태는 위 codec 기록 참고. 원본 대량 테스트 통과가 malicious reserved payload 검증을 대체하지 않는다.

서브에이전트는 다음 세션에 살아 있다고 가정하지 않는다. 필요하면 위 모델·역할로 다시 배정하되 좁은 파일 소유권을 준다. root는 App/MapView/useMyMap/도메인/지도어댑터/계약/server mount/브라우저를 담당한다. 공유 서버·브라우저 검증은 root만 직렬 실행한다.

## 재개 우선순위와 알려진 남은 문제

1. **중단 직전 부분 파일 확인 및 저장 브라우저 실패 정리.** 마지막 account test는 제품 오류 증거가 아니라 제목이 패널 header에 있는데 `.my-map-panel-content` 본문만 찾은 assertion 실패다. `frontend/verification/contracts/my-map.spec.mjs`의 마지막 테스트 337~341 부근 양쪽 계정 이름 assertion을 `.my-map-panel` 전체 기준으로 고치고 계정 테스트만 재실행한다. 아직 수정하지 않았다.
2. **codec 검증 마무리.** circle 실제 링/정의 일치, style/label/altitude/source 내부 형식, 악성/중복 예약 필드 fallback, 두 차례 export/import 후 metadata 증식 없음 확인. `copyMapDocument(flatten:true)`가 무조건 원 배열 index/group수로 순서를 바꾸므로 앱 생성 KML의 그룹 없음 상대 순서가 아직 손실될 수 있다. root가 그룹 표시 순서 DFS와 가상 ungrouped 블록을 함께 재매핑하도록 고쳐야 한다. exporter의 ungroupedAt은 현재 order를 root 배열 index로 취급하므로 부분 범위/중첩에서 의미가 맞는지도 확인.
3. **파일 변환/내보내기 UI+controller**, 원본 보존한 개인 사본 저장. previewMapConversion은 아직 itemCount/groupCount 위주이며 UX의 포함/변환/제외 개수가 부족하다. 외부 아이콘/미지원 KML 객체 경고도 누락 없이 보여야 한다.
4. **지도 스타일 실제 반영.** mapDocumentOverlay는 dashed/labelAlways를 속성으로만 만들고 실제 paint/layout에 연결하지 않았다. dotted도 미연결, icon 선택은 모두 circle로 표시. dash별 선, 아이콘 이미지/재설치, 항상/선택 이름 충돌 우선순위, 점 opacity를 구현하고 검증한다.
5. **기관 공유 backend/권한 검증 → frontend/화면 통합.** 최신 개인 저장 확정 후 공유, 기관 불변 snapshot, 명시 update, 받는 사람 수동 버전 적용, 개인 사본으로 편집, 개인 삭제 독립. API를 작성한 것만으로 완료 판정 금지.
6. **기존 /draw 자료 이전.** 아직 미착수. 검증 가능한 사본으로 이전하고 원본 제거 금지. 지원하지 않는 고급 도형은 보존·경고/읽기 처리. 기존 /draw를 제거하지 않는다.
7. **작성 전 범위 브라우저 및 회귀.** 현재 기본 점/선·형태 취소·이탈·복구만 확인했다. 면/원 완료, 전체 이동 commit, 꼭짓점 추가/삭제, 수치 반경, undo/redo, 그룹 DnD·다중 이동·좌표 일괄, 모든 이탈 경로·route 입력 guard 자체 검사 필요.
8. **전체 npm run check, 모바일/반응형, 시안 대조, FM-01~21 증거 갱신.** 실제 iPad Safari 기기 검증은 수행하지 않았으며 장비 없으면 미검증으로 명시한다.

추가 확인 후보: myMapStore.delete는 목록을 먼저 지운 후 openDb 실패 시 목록 rollback이 빠질 수 있다(중단 전 발견, 미수정). 삭제 실패에도 원본 재접근을 보장하도록 보완. 저장/삭제 경합과 beforeunload 경고도 새 브라우저 검증에서 재확인.

## 검증 근거 — 부분 성공과 미완료를 구별할 것

- 초기 도메인·원본·기존 draw 관련196개 통과.
- 작성 도메인/기하11개, routePreview 기존40개, 개인 API6개·기존 DB/me21개, nginx 포함 저장서버10개 통과 기록 있음.
- 저장 queue/persistence/account 관련18개 통과: `artifacts/flight-map-design/persistence-tests.txt`.
- codec/import/metadata 관련14개 통과와 실제 파일 왕복은 리뷰 수정 전 결과도 포함하므로 최신 codec 수정은 별도 재검증.
- frontend build는 storage 연결 후 통과: `artifacts/flight-map-design/storage-build.txt`. 이후 중단 직전 codec/기관 부분 작업까지 포함한 전체 build/check 완료 아님.
- 최신 브라우저 실행: `MY_MAP_REAL_FILES=1 npm run dev:contract -- --grep 'my-map (새 지도|기기 저장|계정 자동저장|실제 KMZ)' --project desktop --retries 0`
  - 실제 두 KMZ 상세/대량 표시 통과12.6초.
  - 새 지도 작성·형태 취소·미완성 이탈 통과21.6초.
  - 기기 저장·새로고침·미완성 초안 재개 통과19.8초.
  - 계정 자동저장/격리 테스트는 마지막 제목 locator assertion 실패. 실패 내용을 기록한 뒤 중단했으며 재실행 안 함.
- 로그: `artifacts/flight-map-design/storage-browser-contract.txt`.
- 최신 캡처는 `artifacts/verification/test-results/`와 보존용 `artifacts/flight-map-design/product-captures/`. 다음 managed run은 test-results를 비우므로 필요 캡처를 먼저 보존할 것. 스크린샷은 animations:'disabled'로 변경했다.
- 전체 check, 기관 시나리오, 모든 FM 계약, 실제 iPad는 완료하지 않았다.

## 실제 파일과 수치

로컬 파일은 외부 업로드/저장소 복제 금지. 다음 경로가 같은 환경에 남아 있다.

- `/mnt/c/Users/Jond Doe/Downloads/맥케이 비행지도 ver.230729.kmz`: 2,135논리항목/175그룹/56,980표시조각, JSON약13.45MB. SEL은 한 항목에 점+1,388선.
- `/mnt/c/Users/Jond Doe/Downloads/공역정보 지도자료 및 사용방법('26년 5차 AIP 기준)/공역정보(AIRAC AIP 5_26 기준).kmz`:754항목/30그룹/756조각/10,497메타데이터 필드, JSON약6.75MB. CHEONGJU 상한5000 Feet Height, 하한Surface. 비행정보구역 내 공해의 내부 링 보존 중요.

## 다음 사용자 메시지 예시

“내 지도 구현 이어서 해. docs/design/proposals/2026-09-20-flight-map-resume.md부터 읽고 중단한 곳부터 진행해.”

이 문서를 읽은 다음 완료된 조사·검증을 처음부터 반복하지 말고, 최신 부분 변경과 명시된 실패/미완료부터 이어간다.

---

## 4단계 이후 남은 일 — 2026-09-20 갱신

4단계에서 처리한 항목은 위 「재개 우선순위와 알려진 남은 문제」의 1·2·3·4·6번과 myMapStore.delete 롤백이다.
4번 지도 스타일 반영(선 모양·아이콘·이름 항상 표시·점 투명도)도 이어서 끝냈다.
근거와 실행 로그는 [구현 계획](2026-09-19-flight-map-implementation-plan.md)의 「4단계 완료 기록」에 있다.

1. **기관 공유 backend 검증 → 화면 통합.** `backend/src/maps/organization-{repository,router}.js`는 작성만 되어 있다. `server.js`에 mount하지 않았고 테스트가 없다. 권한(조직 존재·활성 멤버십·활성 사용자), 불변 버전 CAS, 개인 원본과의 독립성을 API 테스트로 먼저 검증한 뒤 화면을 붙인다. API를 작성한 것만으로 완료 판정하지 않는다(FM-14~15).
2. **작성 전 범위 브라우저 검증.** 현재 통과한 것은 점/선 작성·형태 취소·이탈·저장 복구다. 면/원 완료, 전체 이동 commit, 꼭짓점 추가·삭제, 수치 반경, undo/redo, 그룹 DnD·다중 이동·좌표 일괄 입력, 모든 이탈 경로와 route 입력 guard가 남는다(FM-05~08, 18).
3. **모바일·반응형·시안 대조와 FM-01~21 증거 갱신.** 이번 4단계 검증은 데스크톱 계약만 실행했다. 실제 iPad Safari는 장비가 없으면 미검증으로 명시한다(FM-20).

## 환경 주의

정전이나 강제 종료로 dev 서버가 의존성 최적화 중에 죽으면 `frontend/node_modules/.vite` 사전번들 캐시가
깨져 앱이 빈 화면으로 뜬다. 콘솔에 `does not provide an export named 'SLOT_ELEMENT_TYPE_SYMBOL'` 같은
SyntaxError가 나오면 제품 코드가 아니라 이 캐시 문제다. 해당 디렉터리를 지우고 다시 실행한다.
