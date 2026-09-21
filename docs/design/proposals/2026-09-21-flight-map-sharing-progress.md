# 내 지도 5단계 — 기관 API·수신 상태 구현 기록

2026-09-21. 4단계 독립 검증에서 발견한 문제를 수정한 뒤 원래 구현 계획의 기관 공유 단계로 진행했다. **서버·수신 상태 모듈에 이어 화면 통합과 실제 두 계정의 데스크톱 검증까지 완료했다.** 아래 초기 기록 이후 「화면 통합 완료」 절을 갱신했다. 모바일 검증은 6단계에 남아 있다.

## 서버

- `backend/src/maps/organization-router.js`의 과거 버전 조회가 URL 문자열을 숫자 검증 함수에 그대로 넘겨 항상 400을 반환했다. HTTP 경계에서 숫자로 변환하고 양의 안전한 정수 검증을 유지했다. 본문의 expected revision/version은 숫자 타입을 계속 요구한다.
- `organization-repository.js` 목록 조회에서 사용하지 않는 snapshot을 SELECT하지 않도록 바꿨다. 목록만 열어도 대형 KML 스냅샷 전부를 읽는 불필요한 비용을 없앴다.
- `backend/server.js`에 기관 지도 라우터를 기존 기관 라우터 앞에 mount했다. 개인 지도와 기관 지도 모두 전역 JSON 파서를 건너뛰고 로그인·멤버십·Origin 검사 후 전용 파서를 실행한다. 기관 입력은 개인 지도 ID/revision/note만 보내므로 1MiB 제한이다.
- 기존 불변 버전 DB trigger, 기관 누적 quota, 게시자/관리자 권한 계약을 유지했다. 개인 원본 ID는 연쇄 삭제 참조가 아니므로 원본 삭제 후 공유본이 남는다.

검증:

- 신규 `backend/test/organization-maps.test.js` 7개: 사본 불변성·표준/과거 버전 조회·메타데이터 보존, 모든 읽기 경로 권한, 다른 기관/비활성 멤버/비활성 사용자, 타인 원본과 위조 snapshot 거부, 관리자도 본인 개인 원본만 사용, 동시 CAS, quota·rollback·불변 trigger, Origin·JSON·본문 크기·잘못된 버전.
- 개인 지도·기존 기관 HTTP를 포함한 관련 17개 통과. `artifacts/flight-map-review/organization-api.txt`.
- 전체 backend: 1,228개 중 1,227 통과·기존 1개 건너뜀. `organization-backend-all.txt`.
- `my-map-sharing.spec.mjs` 실제 서버 통합 계약 1개 통과. 격리된 CONTRACT_DATA_PATH DB에 두 계정을 만들고 실제 로그인 쿠키를 각각 사용한다. 개인 저장→공유→원본 수정→명시 업데이트→과거 버전 조회→원본 삭제→구성원 비활성화→공유 중단을 실제 API로 확인했다. 미인증 malformed JSON이 parser보다 먼저 401로 거부되는 것도 확인했다. `organization-runtime.txt`.
- 실제 서버 통합 검사는 HTTP 세션 검사이며 **지도 패널에서 버튼을 누르는 UI 검사가 아니다.** 계정 fixture 이름에 하이픈을 넣은 첫 시도는 사용자명 규칙 위반으로 실패했으며 밑줄로 수정 후 통과했다.
- 마지막 `npm run check` 통과: backend 1,227 통과·1개 건너뜀, frontend 1,665개 통과, offline 검사와 프런트 빌드 성공. 로그 `artifacts/flight-map-review/organization-check.txt`.

## 초기 프런트 수신 상태 모듈 기록

`frontend/src/features/my-map/lib/mapOrganizationStore.js`:

- API: `listMemberships`, `listOrganizationMaps`, `getOrganizationMap`, `shareOrganizationMap`, `updateOrganizationMap`, `stopOrganizationMap`. signal과 fetchImpl 주입 가능, 쿠키 포함, 상태/코드/충돌 상세를 가진 한국어 오류.
- 문서 ID: `organization:<orgId>:<mapId>`. 원본 개인 ID와 충돌하지 않는다. `organizationDocument(summary, membership, snapshot?)`가 서버 원본을 복사해 `kind:'organization'`으로 만든다. 원본 source·항목 메타데이터는 그대로 둔다.
- `document.organization`: organizationId, mapId, organizationName, role, version, latestVersion, publisherUserId, sourcePersonalMapId, sourcePersonalRevision, note, updatedAt.
- `createOrganizationMapSession({api?, onInstall, onRemove, onMemberships, onError})`: 계정별 인스턴스. `refresh()`, `load(id,{applyLatest?})`, `dispose()`.
- refresh는 목록과 권한을 다시 확인한다. 읽던 스냅샷은 유지하고 latestVersion만 바꾼다. `load(id,{applyLatest:true})`를 호출해야 교체한다. 공유 중단·기관 탈퇴·401/403은 자료를 가리고 늦은 상세/목록 응답이 되살리지 못하게 한다. 네트워크 오류는 기존 자료를 유지한다.
- 영속 캐시 없음. dispose는 AbortController로 요청을 중단하고 늦은 콜백 설치를 막는다. 계정 변경 시 기존 인스턴스를 반드시 폐기한다.
- 단위 `mapOrganizationStore.test.js` 6개 통과: 명시 적용, 탈퇴/공유 중단과 늦은 응답, 계정 폐기, 통신 실패와 권한 거부 구별, 늦은 목록의 역전, 공유 revision/쿠키/충돌 상세. `organization-session.txt`.

## 화면 통합 전 작업 목록 — 아래 완료 기록으로 대체

1. `useMyMap`에 계정별 기관 세션을 연결한다. onInstall은 기존 installDocument를 사용하되 개인 persistence.save에 넣지 않는다. onRemove는 문서·지도 표시·현재 선택을 함께 제거한다. 계정 reset/dispose를 함께 처리한다.
2. 로그인 계정에서 목록 새로고침·window focus·주기적 권한 재검증을 연결한다. 패널을 닫아도 표시 중인 기관 지도의 권한 재검증은 유지한다. 통신 실패/권한 회수 상태를 구별한다.
3. 새로 열기는 최신 자료를 읽고, 이미 보고 있는 지도에는 새 버전 알림과 명시 적용을 제공한다. 표시 토글 자체로 스냅샷이 교체되지 않게 한다. 읽던 기관 문서가 개인 저장큐/IndexedDB 복구에 들어가면 안 된다.
4. HTML 시안과 UX 9절을 대조하여 D1 공유(기관·지도 이름·메모·전체/숨김 개수), 공유본 업데이트, 기관 목록의 기관·버전·수정 시각, 개인 사본, 공유 중단을 붙인다. 게시자/관리자만 공유 중단과 업데이트 버튼을 제공하되 API가 최종 검사한다.
5. 공유는 `persistence.flush(id)`로 서버 확정 revision을 받은 뒤 그 revision을 API에 보낸다. 저장 실패/충돌·계정 변경 시 공유 성공을 표시하지 않는다. 공유 범위는 숨긴 항목 포함 지도 전체, 미완성 기하는 제외한다.
6. 두 사용자의 패널 흐름, 수신자가 적용하기 전/후의 실제 Mapbox 자료, 개인 사본의 독립성, 권한 회수 후 열린 지도 숨김을 브라우저에서 검증한다. 기관 API 작성만으로 FM-14~15 완료 판정하지 않는다.

커밋·배포·의존성 변경 없음. 기존 워킹트리의 4단계 수정 및 다른 문서 작업은 보존했다.

## 화면 통합 완료 — 2026-09-21

위 1~6번을 구현했다. `useMyMap`이 계정별 기관 세션을 생성/폐기하고 시작·30초 간격·window focus·목록으로 돌아올 때 권한과 목록을 다시 확인한다. 기관 스냅샷은 메모리에만 두며 권한 회수/공유 중단 후 지도 표시와 현재 선택도 제거한다. 목록에서 새로 열면 최신 버전을 가져오되 이미 표시하는 지도는 새 버전 알림만 보여준다.

`MyMapSharingActions.jsx`가 HTML 시안 D1을 기준으로 공유할 기관·지도 이름·전달 메모·전체/그룹/숨김 수를 보여준다. 숨긴 항목도 포함하는 전체 공유이며 개인 지도의 서버 저장 완료를 기다린 뒤 확정 revision을 보낸다. 공유 이름은 개인 원본 이름과 독립적이므로 서버 입력에 선택적 `name`을 추가했다. 불변 snapshot 자체는 개인 저장본과 같다.

기관 지도에는 기관명·판·수정 시각(선택한 KST/UTC), 읽기 전용 표시, 전달 메모, ‘내 지도로 복사’를 제공한다. 새 버전은 ‘적용’해야 실제 Mapbox 자료가 바뀐다. 게시자/관리자만 업데이트·공유 중단을 제공한다. 관리자는 자신 소유의 개인 지도를 선택해 업데이트한다. 개인 사본은 새 지도/그룹/항목 ID로 생성하고 편집 패널을 연다.

보완한 연결 결함:

- 수정하지 않고 연 저장본은 저장큐에 기록이 없어 flush가 null이었다. 이 경우 이미 확정된 문서/revision을 반환하도록 했고 단위 회귀를 추가했다.
- 기존 navigate가 requestNavigation의 boolean을 반환해 비동기 변환·공유 작업을 기다리지 못했다. 강제로 저장을 지연한 브라우저 검사에서 공유 완료 전 확인창이 닫히는 것을 재현했다. 이탈 여부 판단은 유지하면서 실행한 작업의 Promise/결과를 호출자에게 반환하도록 고쳤다.
- 공유창 숨김 개수 계산에서 배열 반환 helper를 Set으로 취급한 오류를 첫 화면 검사에서 발견해 수정했다.
- 공유 대상 버전은 확인창에서 선택한 값으로 고정한다. 백그라운드 갱신이 CAS 기준 버전을 몰래 바꾸지 않는다. 저장·공유 실패는 확인창을 유지하며 오류를 보여준다.

최종 증거:

- `npm run check` 통과: backend 1,227 통과·1개 건너뜀, frontend 1,666개 통과, offline 검사·빌드 성공. `sharing-all-check.txt`.
- 실제 두 KMZ를 포함한 my-map 데스크톱 전체 실행에서 기존 18개+기관 HTTP 1개 통과. 신규 기관 UI의 저장 지연 검사는 위 navigate 문제로 실패했고 이후 수정했다. `sharing-all-browser.txt`.
- 수정 후 영향 경로 3개 재검증 통과: 기관 공유 화면 전체, 기존 작성·이탈+비로그인 공유 안내, 편집본 변환·KML 내보내기. `sharing-confirm-contract.txt`. 전체 20개를 수정 후 한 번에 다시 통과한 것으로 기록하지 않는다.
- navigate 보완 이후 최종 프런트 빌드도 통과했다(`sharing-final-build.txt`). 최종 캡처는 `artifacts/flight-map-review/share-dialog-final.png`, `shared-version-applied-final.png`에 별도 보존했다.
- 기관 UI 계약은 실제 로그인 쿠키 두 개와 실제 DB/API를 사용한다. 개인 작성→숨김 항목 포함 공유→개인 원본 수정→PUT 500 실패 시 공유 POST 0회/대화상자 유지→저장 재시도 지연 시 공유 POST 0회→저장 후 공유 업데이트→수신자 적용 전 기존 지도 유지→적용 후 변경→개인 사본의 새 ID/저장→멤버 비활성화 후 기관 지도 제거→게시자의 공유 중단→개인 원본/사본 유지까지 검사한다. 기관 snapshot이 IndexedDB의 completed 복구에 들어가지 않는 것도 확인했다.
- 화면 캡처를 직접 확인했다. 초기 통과 캡처 `artifacts/flight-map-review/share-dialog.png`, `shared-version-applied.png`; 최종 실행 캡처는 `artifacts/verification/test-results/my-map-sharing-*/`에 있다. 새 managed run 전에 필요 캡처를 보존한다.

5단계 T6/FM-14~15의 데스크톱 완료 근거이며, 작성 전체 범위·모바일/반응형·iPad 실기기·FM-01~21 전체 완료 근거는 아니다. 다음은 재개 문서의 작성 전 범위 검사다.
