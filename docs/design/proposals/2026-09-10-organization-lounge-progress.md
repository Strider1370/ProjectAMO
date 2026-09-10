# 기관 라운지 구현·인계 기록

## 기준과 진행

- 2026-09-10 작업 트리의 구현 계획·설계·HTML/CSS/JS를 기준으로 기관 DB/API, 라운지, 기존 앱 연결, 지도·합동 발표를 구현했다.
- 시작 시 기존 변경 목록: `artifacts/organization-lounge/initial-status.txt`. 다른 작업의 문서 변경·삭제를 보존한다.
- 로컬 실제 서버와 브라우저 통합 검증 결과는 아래 최신 기록을 기준으로 한다. 운영 배포·공개 검증은 수행하지 않았다. fixture와 실제 저장 자료, 최신 외부 자료 검증을 따로 기록한다.

## 파일 소유권

- 주 담당: 이 기록·공통 계약, `App.jsx`, `Sidebar.jsx`, `MapView.jsx`, `useRouteBriefing.js`, 서버 진입점, 공통 API 클라이언트, 의존성·통합·브라우저 검증.
- 서버 담당(sol/high): `backend/src/organizations/**`, DB 스키마/초기화, 기관 서버 테스트. 서버 진입점 변경은 주 담당에게 요청.
- 화면 담당(sol/medium): `frontend/src/features/organization-lounge/**` 중 API·지도·발표 모듈 제외. 셸/홈/자료/비행/준비/설정/알림.
- 지도 담당(sol/high): 기관 지도·발표 컴포넌트·어댑터, NWP 훅, 단면 차트, 도형 투영. `MapView.jsx` 변경은 주 담당에게 요청.
- 계약/독립 리뷰(astra/high): 읽기 전용 검토와 리뷰 기록. 구현하지 않은 코드 리뷰.

## 공통 계약 v1

- 기관 역할: `admin`, `planner`, `member`. 서비스 관리자와 구분한다.
- REST는 `/api/organizations/:orgId`; 목록은 `{ organizations|flights|materials|briefings|members|interests|notices|alerts: [] }`, 단건은 `{ organization|flight|material|briefing|run: {} }`.
- `GET /api/me/organizations`; `POST /api/admin/organizations`는 `{name, adminUserId}`.
- 예정비행 `{id, orgId, name, version, assignedUserId, etd, eta, status, snapshot, profileRequest, blocks, annotations, materialRefs, updatedAt}`. `snapshot`은 기존 v3 경로 저장 형식. 저장 시 geometry와 절차/단면 입력을 보존.
- 신규 비행 POST는 위 입력 필드, 편집 PATCH는 `expectedVersion` 필수. 자료/회차도 동일한 불변 버전·충돌 계약.
- `POST /flights/:id/weather-briefing` 요청 `{flightVersion, overrides:{etd?, cruiseAltitudeFt?, nwpTimeSelection?}}`. 응답은 envelope 없이 `{bundleId, flight, briefing, verticalProfile, crossSection, componentStatus, mapDataSelection, linkedItems, provenance}`.
- 기관 문맥 `{kind:'organization',orgId,flightId,flightVersion}`. 최초/고도/시각/재조회 모두 위 API 사용. 개인 API fallback 금지. 주 담당이 `MapView.loadRouteBriefing(entry, context)`와 훅 경계를 통합.
- `OrganizationLoungePage`는 App의 Auth/TimeZone Provider 내부 lazy entry. 화면 담당은 기존 Sidebar를 import해 사용하되 Sidebar 파일은 수정하지 않는다.
- 화면 API는 `features/organization-lounge/api.js`에서 `organizationRequest(orgId, path, {method,body,signal})`, `listOrganizations({signal})`, `fetchOrganizationBriefing({orgId,flightId,flightVersion,overrides,signal})` 사용. 결과는 서버 JSON 그대로.
- 지도/발표 담당은 `OrganizationMap.jsx`, `OrganizationPresentation.jsx`, `lib/**`, `hooks/**` 소유. UI 담당은 이 경로를 수정하지 않고 계약 필요사항을 전달.
- 회차 `{id,orgId,name,version,flightIds,materialRefs,blocks}`; run 시작 POST `/briefings/:id/runs`, 적용 POST `/briefings/:id/runs/:runId/apply`, 종료 POST `/briefings/:id/runs/:runId/end`. 서버 담당은 정확한 run 응답/적용 계약을 지도 담당과 확정 후 여기에 기록 요청.

## 검증 기록

- 구현 전: 문서에서 과거 예보를 정상으로 선택하는 사례가 확인됨. 기관 경계 검증 보완 대상.
- 단계별 결과는 아래 시간순 기록과 마지막 검증표를 참조한다. 중간 실패 기록은 이후 수정·재검증 결과와 함께 읽는다.

## 인계 시 확인할 항목

1. 마지막 검증표의 브라우저/전체검사 결과와 실제 자료 시각을 확인한다.
2. 운영 반영 시 full deploy, 비공개 파일 경로·권한, nginx `/data` 차단, DB+자료 버전 백업 복원을 확인한다. 이번 세션은 배포하지 않았다.
3. `dev:verify` 자동수집 중 종료 cleanup이 멈추는 현상은 별도 잔여다. 두 서버 readiness는 성공했으나 정상 종료 성공으로 기록하지 않는다. 검증자가 생성한 프로세스만 정리했으며, 통합 브라우저 검증은 수집을 끈 격리 서버에서 수행했다.
4. 실제 과거 낙뢰 발생 자료는 평가기에서 19건 교차까지 확인했다. 과거 시각을 주입한 전체 로그인 UI 검증은 수행하지 않았다. 최신 0건 관측은 수집 coverage 범위를 넘겨 정상으로 단정하지 않는다.

## 2026-09-10 20:16 KST 중간 검증

- Astra 공통 계약 리뷰 완료. `artifacts/organization-lounge/contract-review.md`에 기존 API 호출 경로·raw/flat 단면 shape·모델별 지도 선택·run apply 계약 기록. 기존 테스트 28개 통과는 기반 증거로만 구분.
- 기관 공급자/요청 취소 gate + 기존 저장 경로 복원 테스트 24개 통과. 기관 실패 시 개인 API fallback 없이 오류 반환, 늦은 응답 무효화 단위 검증. 브라우저 검증은 아직 대기.
- exact KTG run/hf/고도 조회, 삭제·revision 교체 검증 및 기존 KIM 캐시 회귀 2개 통과. KIM revision 명시 요청은 파일 검사 이전 304 반환을 하지 않는다.
- HTML 홈·B 발표를 Chromium 1180×820에서 직접 캡처·시각 확인: `artifacts/organization-lounge/mockup-{home,presentation-b}.png`. 실제 React 캡처와 구분한다.
- 실제 코드와 계획 차이: 수동 수집 `backend/collect.js`가 제거된 `installApiHubFetchGuard`와 없는 METAR/TAF `process()`를 호출해 실행 불가. 현재 전송 경계가 processor 내부에 있으므로 오래된 guard import/call을 제거하고 METAR/TAF는 `processAll()` 호출로 수정.
- 최신 실제 외부 수집 성공: METAR 15공항(11:14:13Z), TAF 15공항(11:14:22Z), 공항경보 0공항, SIGMET 1건, AIRMET 1건(11:14:26~27Z). `artifacts/organization-lounge/live-collection-result.json`. 사건 내용·HTTP·로그인 UI 대조 검증은 후속. NWP·낙뢰 최신 연동 검증은 미완료.
- PDF.js를 backend/frontend에 추가. 공식 라이브러리/worker 사용 예제: https://mozilla.github.io/pdf.js/examples/. 전체 배포 필요.

## 2026-09-10 20:30 KST 중간 검증

- 기관 조회 공급자와 실제 브리핑 화면을 연결. 기관 최초 진입/시각/고도/재조회는 기관 API만 사용하고 요청 취소·세대 번호로 이전 개인 응답 및 다른 기관 응답을 무효화한다. 저장 스냅샷에 실제 절차별 `profileRequest`를 보존한다.
- exact KTG/KIM API와 영상 frame API 연결. frame은 파일명뿐 아니라 bytes SHA-256까지 검증하며 동일 파일명 덮어쓰기·삭제는 410. 오래된 영상(60분 초과)은 unavailable. 단위/실제 HTTP 검증 3개 통과(`pinned-map-http-tests.log`).
- 최신 실제 NWP 수집: KIM `2026091006`, hf6(12:00Z), 22고도; 단일시각 수집이므로 현시각·전 비행구간을 포괄한다고 주장하지 않는다. legacy surface 필드는 제공 불가. KTG는 06차수 파일이 유효 NetCDF가 아니어서 공식 처리기가 `2026091000`의 hf6/9/12, 10고도를 확보했다. 수집 로그 `collect-{kim,ktg}-current.log`.
- SQLite 백업이 `organization_material_versions`의 원본·썸네일 모든 버전을 함께 복사하도록 보완. bytes hash 검증, 새 경로에만 복원하는 CLI 추가. 과거 버전 복원·누락·손상·덮어쓰기 거부 및 기존 백업 회귀 총 8개 통과(`db-backup-tests.log`).
- Express와 nginx 예제 모두 `/data`를 통한 DB/백업/기관 파일 공개를 차단. 운영 배포에는 nginx 설정 반영 및 PDF.js 의존성을 위한 full deploy가 필요하다. 이 세션에서 배포하지 않음.
- `dev:verify`는 두 서버 readiness를 출력했지만 cleanup 중 프로세스가 남아 정상 종료 완료 증거로 사용하지 않는다. 해당 세션이 띄운 PID만 종료하고 브라우저 계약 검증을 진행한다.

## 2026-09-10 20:38 KST 통합 결과

- 기관 공급자 브라우저 계약 Chromium desktop/iPad 2개 통과. 최초 진입→시각/고도 변경→503→재시도 전체에서 개인 분석 API 호출 0건. 오래된 예보 fixture의 판단 제한 표시를 확인.
- 첫 실행에서 기존 route token 재적용 effect가 기관 복원 이후 개인 `route-exposure`를 호출하고 편집 단계로 되돌리는 문제 발견. 기관 문맥에서는 해당 effect를 실행하지 않게 수정 후 재검증 통과. fixture만으로도 실제 hook/app 결함을 찾은 사례.
- 시각 확인에서 기존 위험 요약이 누락 예보에도 초록 배지/위험 없음 문구를 표시하는 문제 발견. 기관 상태가 불완전하면 위험 판단 제한/확정 불가로 표시하도록 기존 BriefingView 보완.
- 실제 HTTP 검증 스크립트 `scripts/verify-organization-live.mjs`: 최신 로컬 수집 디렉터리는 읽고 기관·사용자 DB와 비공개 파일은 artifacts 아래 독립 경로 사용. 관리자 로그인→기관 생성→조종사 배정→비행 저장→다른 조종사 조회→실제 weather-briefing 응답 성공. 비회원403/익명401/일반 구성원 계획변경403 확인.
- 실제 SIGMET SEV_ICE `RKSI-Z01-2026-09-10T103500Z`와 AIRMET SFC_WIND `RKSI-Q03-2026-09-10T090000Z`의 관심구역 교차 사건 확인. `live-http-result.json`과 기록된 instance의 `bundle.json`, `situation.json`. 이 검증의 NWP 결과는 partial이며 발표 고정 최종 모델별 계약 적용 전 결과이다. 최신 실제자료 로그인 브라우저 검증은 아직 후속.
- 발표 API 확정: GET run, POST run/candidates `{flightId,flightVersion,overrides}`→`{bundle}`, apply `{expectedRunVersion,flightId,bundleId}`, end `{expectedRunVersion}`. run은 `{id,version,status,startedBy,flightRefs,materialRefs,activeFlightId,appliedSnapshot:bundle}`. 후보는 서버가 계산·저장한 bundleId만 참조; 임의 appliedSnapshot 입력은 허용하지 않는다.

## 2026-09-10 20:52 KST 통합 결과

- 실제 로그인 HTTP→React 흐름을 Chromium/WebKit × 1920×1080·1180×820·1024×768에서 실행, 관리자 화면에서 추가 비행 저장과 별도 조종사 로그인 브리핑 조회까지 성공. 캡처 37개: `artifacts/organization-lounge/live-http-mZtQhh/`. 자동 흐름 성공과 시각 합격을 구분한다: 홈 지도 높이 0과 알림 현상 누락을 시각 검토에서 발견해 수정 중.
- WebKit route interception이 POST 일부를 실제 인증 서버로 보내 fixture 결과를 오염하는 현상 관찰. 모의 응답을 브라우저 fetch fixture로 통일하고, 실제 서버 권한/로그인은 별도 live harness에서 검증. 변경 후 WebKit 데스크톱 기관 공급자 3개 통과; 전체 18개 재실행 중.
- 최초 기관 조회 실패를 개인 계획 화면으로 보내지 않고 기관 재시도 화면 유지. 개인 경로 전환은 명시 버튼으로 수행하며 진행 중 응답을 무효화하고 URL의 기관 문맥도 제거한다.
- 기존 방문 통계 테스트의 고정 8월10일 fixture가 실제 오늘 기준 4주 범위에서 벗어나 실패하는 사실 발견. production 로직 변경 없이 테스트에 `now=2026-08-18T00:00Z` 주입해 시간 의존 제거(3개 통과).
- 기존 route token 구조 테스트가 직접 fetchRouteBriefing 호출 패턴만 고정해 공급자 분리 후 실패. 실제 procedure context/route markers 생성과 공급자 전달 경계를 검증하도록 기대값 갱신.
- 최신 실제 자료에서 NWP partial과 별개로 기존 공항 카테고리 배너가 “전 구간 VFR”을 표시하는 문제 확인. 기관 전체 자료가 불완전할 때 정상 전 구간 배너는 표시하지 않도록 보완. 개별 공항의 실제 관측 카테고리는 유지.

## 2026-09-10 21:18 KST 독립 리뷰·확장 검증

- 기관 공급자 브라우저 계약 18개 모두 통과(Chromium/WebKit × 세 화면 크기). 최초 실패, 시각/고도 변경, 재시도, 개인 전환 후 늦은 응답을 포함한다. `organization-provider-matrix.log`.
- 화면 담당 완료 후 슬롯을 해제하고 Astra/high 독립 코드 리뷰를 시작했다. `artifacts/organization-lounge/independent-review.md`. 리뷰에서 실제 재현한 P1을 구현 담당에게 반환하여 수정·재검토 중이며, 초기 테스트 통과를 완성 증거로 간주하지 않는다.
- 주요 발견: KTG 전날 수치가 displayData에 잔존, 자료 PATCH의 SQL 값 개수 불일치, PDF.js 6에서 document.destroy 미지원, 동일 bundle ID/다른 생성시각 충돌, 발표 run이 마지막 적용만 보존, KML 교체 후 옛 metadata 유지, 기관 새 작성버전을 발표에 적용할 경로 누락. 앞 네 가지와 run 이력은 수정·관련 테스트 통과 보고를 받았고 후속 재검토 중.
- 주 담당 UI 후속: 준비 비행 추가/제외·공통자료 선택·충돌 version 관리, 30초 기관 조회, 공지 없는 소식 서랍, 서랍 안 자료 뷰어와 초점 복귀, 주의사항 편집/삭제, 연결된 자료의 정확한 과거 버전 조회, 문서 블록/저장 경로 자료 등록을 추가했다. 최종 실제 브라우저 검증은 진행 중.
- same-run grid 보완/교체 동안 단면 캐시와 지도 revision이 섞이는 독립 재현에 대응: 기관 snapshot과 cache key에 현재 run의 grid/coords inode·size·mtimeNs·ctimeNs 서명을 포함, 계산 전후 문맥 재검증. 개인 캐시 기본 동작은 유지. 기관 same-run 교체 및 기존 단면 HTTP/캐시 회귀 4개 통과(`runtime-cache-tests.log`).
- 최신 실제 추가 수집: KIM 2026091006 hf6/9(12/15Z), KTG 2026091000 hf6/9/12/15. KTG 06/12차수는 유효 NetCDF가 없어 기존 공식 대체 후보00차수를 수집기가 선택한 사실을 기록한다. bundle 검증에서 실제 선택·유효범위는 별도로 확인한다. `collect-{kim,ktg}-range.log`.
- 최신 낙뢰 0건 수집은 11:45Z까지 coverage complete이며 현재 시각까지 완전하다는 뜻이 아니다. 실제 과거 발생 자료 `LIGHTNING_20260817T150001739Z.json`에서 지정 관심권역·30분 안 19건을 평가했고, 과거 자료에는 coverage 정보가 없어 unknown을 유지했다. `historical-lightning-evaluation.json`은 실제 과거 관측 평가이며 합성 fixture와 구분한다.
- 실제 HTTP/브라우저 harness를 PDF 2페이지·교체 v1/v2·KML·도형작성·소식·준비·발표 A/B·확대·후보 적용으로 확장했다. PDF는 명시적 합성 검증 파일, KML은 저장된 실제 NOTAM 좌표 자료, 기상은 최신 외부 수집본이다. 현재 재실행 중이며 성공 여부를 추후 추가한다.

### 발표 기관 버전 갱신 공통 계약 보완

- 최초 run은 시작 시 핀을 사용한다. 이후 후보의 `refreshOrganization:true`는 최신 기관 회차·비행·자료 참조를 서버가 `bundle.organizationSnapshot`에 고정한다.
- 표시 중 자료와 후보를 분리하며, 서버에 저장한 후보 적용 시에만 run의 기관 스냅샷/참조 및 표시 bundle을 함께 교체한다.
- `appliedBundles`는 비행별 최근 적용, `applicationHistory`/run events는 모든 실제 적용, `terminationRecord`는 종료 시 사용 버전/출처 기록이다. 새로고침에서도 단일 마지막 비행만 남지 않게 한다.

## 2026-09-10 21:39 KST 최종 통합 정리

- 관리자 UI 저장→다른 조종사 실제 로그인 조회→기관 실제 기상 브리핑 성공. 기관 회원·역할·Origin·익명/타기관 거부, PDF 원본 Range·v1/v2 불변 참조를 실제 Express 서버에서 확인했다.
- 실제 서버 브라우저 6조합(Chromium/WebKit × 1920×1080, 1180×820, 1024×768) 모두 성공. 홈/소식/비행/도형/PDF 2페이지·과거 버전/KML/알림/설정/준비/발표 B·A·단면 확대·고정자료·후보 적용/조종사 브리핑 캡처 103개. `artifacts/organization-lounge/live-http-NukV6s/`, `live-http-result.json`, `live-browser-final.log`.
- 화면 검증 자료를 구분한다: 계정·기관·비행·PDF는 테스트용 생성 자료, KML은 저장소의 실제 NOTAM 좌표, 기상은 최신 외부 수집 디렉터리를 읽었다. HTTP/브라우저 경로 자체는 모킹하지 않았다. 별도 `organization-provider-matrix.log` 18개는 모의 오류·시간/고도·응답 순서 제어를 위한 fixture 계약이다.
- 실제 최신 NWP는 전체 정상으로 표시하지 않았다. KIM/KTG는 모델별 사용 가능 구간을 유지하며 누락 고도·시각은 partial/unavailable, 오래된 영상은 표시 불가로 구분한다. KTG-only 실제 파일 및 경로 밖/요구 고도 coverage는 runtime+sampler 테스트 6개로 보완했다.
- 독립 Astra 리뷰에서 재현한 주요 결함 9건은 수정 후 재검토했다. 관련 77개 및 개인 기능 회귀 49개 통과. `artifacts/organization-lounge/independent-review.md`. 이후 발표 고도 레일·영상 실패 반복·스타일 교체 경계는 마지막 별도 리뷰와 브라우저 결과로 기록한다.
- 실제 발표 고도 레일이 pinned level ID만 받아 kind/value와 선택 가능성 정보가 없어 숨겨지는 결함을 브라우저에서 발견했다. 서버가 고정한 유효 resource revision에서만 레일을 구성하도록 수정했다. 스타일 diff로 `style.load` 없이 기관 source가 제거되는 경우도 감지해 현재 bundle을 다시 설치하도록 보완했다.
- 개발 기관 파일 기본 경로를 ignored `artifacts/organization-files`로 맞추고 백업도 같은 경로를 사용한다. production 기본 경로는 `/opt/projectamo/shared/organization-files`다.

### 최종 검증표

| 구분 | 결과 | 증거 |
| --- | --- | --- |
| 최종 `npm run check` | 성공, backend 1,129 통과/1 skip, frontend 1,520 통과, production build 성공 | `artifacts/organization-lounge/final-npm-check.log` |
| 기관 전용 조회·실패·재시도·개인 전환 | fixture 브라우저 18개 성공 | `organization-provider-matrix.log` |
| 실제 서버 권한·불변 자료·실제 브리핑 | HTTP 검사 10개 성공 | `live-http-result.json` |
| 실제 서버 로그인 화면 | 6조합 성공, 캡처 103개, 수평 넘침·uncaught page error 없음 | `live-http-NukV6s/`, `live-browser-final.log` |
| 발표 exact run/hf/level/revision/frame·후보 적용 | fixture 브라우저 6조합 모두 성공, 마지막 캡처 6개 | `presentation-pin-matrix.log` |
| 독립 검토 | 최초 계약 검토 및 주요 9건 수정 재검토 완료, 마지막 지도 경계도 독립 재현·검토 완료 | `independent-review.md`, `final-boundary-review.md` |

빌드의 500kB 초과 chunk 경고는 남아 있다. 실패가 아니며 번들 분할 최적화는 이번 기관 계약 검증과 구분한다. 위 로그의 상대 경로는 모두 `artifacts/organization-lounge/` 기준이다.

- 최종 실제 bundle의 모델 상태: KIM `2026091006/hf6`는 `model_values_incomplete`로 partial, KTG `2026091000/hf12`는 available, 전체 NWP는 partial. 사용 가능 시각/고도만 유지하며 전체 정상으로 승격하지 않는다.
- 마지막 Astra 한정 리뷰는 style diff source 소실을 독립 재현한 뒤 수정본 복원을 확인했고, 고도 레일의 변수별 비대칭 resource fixture 및 frame 오류 상태 순환 차단에서도 추가 확정 결함이 없었다. `final-boundary-review.md`.

- 발표 최종 매트릭스 6개 모두 통과(1.4분): 고도 700hPa exact revision 요청, 후보 적용 전 모델·frame 유지, A/B·확대 복귀, style diff 후 복원, 적용 후 지도·요약 bundle 교체, 보류된 이전 모델 응답 전달 이후 새 wind run 유지, 영상 410 표시·500ms 재요청 안정성. `presentation-pin-matrix.log`, `organization-{chromium,webkit}-{desktop,ipad,compact}-pinned-final.png` 6개. 이 경계는 합성 모델·영상 fixture이며 최신 실제 영상 성공으로 해석하지 않는다.
- 작업자 전원 완료 후 슬롯을 해제했다. 이 세션의 구현은 커밋·배포하지 않았고 기존 작업 트리의 다른 변경을 보존했다. 재개 시 위 인계 항목과 운영 검증 한계를 먼저 확인한다.

## 2026-09-10 22:12 KST 수동 테스트 진입 보완

- 사용자가 실행한 개발 서버는 `AUTO_ADMIN_LOGIN=1`의 `local_admin`이지만 기관 소속이 없었다. 이전 통합 검증은 별도 artifacts DB에서 수행했으므로 현재 서버의 수동 테스트 준비까지 완료한 것은 아니었다.
- 현재 localhost:3001의 실제 관리자 API로 `개발 테스트 기관`(id=1)을 생성하고 local_admin을 기관 관리자로 연결했다. 테스트용 광주–여수 비행, 남부 관심구역, 두 쪽 PDF, 공지, 합동 브리핑 회차를 추가했다. 운영 DB나 권한 미들웨어를 변경하지 않았다.
- 수동 진입: `http://127.0.0.1:5173/lounge/1`. 실제 Chromium에서 기관 내부 메뉴와 샘플 비행 표시 확인. `artifacts/organization-lounge/interactive-test-ready.json`, `interactive-test-home.png`.
- 추가로 명확히 기록할 잔여 UI: 서비스 관리자의 최초 기관 생성·초기 관리자 배정은 현재 서버 API만 제공하며 관리 화면에 연결되지 않았다. 기관 내부에는 기존 사용자 ID로 구성원을 등록하는 화면이 있다. 이번 조치는 현재 개발 인스턴스의 테스트 준비이며 초기 기관 개설 UI 구현을 의미하지 않는다.

## 회원 직접 공유 흐름 변경 — 2026-09-10 후속

사용자 확인으로 기존 기관 조작 패널과 관리자 중심 등록을 변경한다. 이번 요구가 이전 구현 계획의 역할/화면 설명보다 우선한다.

- 기관 중복 조회 패널은 정상 결과·결과 없는 화면 모두 제거. 성공은 기존 BriefingView, 실패는 공통 컴포넌트의 재시도·돌아가기만 표시. 내부 reason 코드는 노출하지 않으며 누락에 따른 기존 위험 판단 제한은 유지. 닫기는 기관 비행 상세로 복귀.
- 모든 활성 기관 구성원은 자신의 서버 저장 경로·브리핑을 기관 비행으로 공유할 수 있다. `POST /api/organizations/:orgId/flights/share`는 `{savedRouteId,name?,etd?,eta?,cruiseAltitudeFt?}`를 받아 서버의 `routes.id + session.userId`로 소유권을 검증한 독립 복사본을 생성한다. 담당자는 본인으로 고정하고 `createdBy`는 변경 불가.
- 일반 작성자는 본인이 공유한 비행계획 수정 가능, 다른 회원은 조회 가능. 기존 관리자·계획관리자의 관리 권한과 배정 조종사의 주의사항/연결자료 권한은 유지한다.
- 개인 저장 브리핑 목록의 `기관에 공유` 및 기관 예정비행의 `내 비행 공유`에서 동일 폼 사용. 개인 원본 삭제는 기관 공유본에 영향을 주지 않는다.
- 서버 구현 sol/high, 공유 UI sol/medium, 독립 리뷰 Astra/high, 주 담당은 중복 패널 제거·통합·검증·기록 소유. 기존 다른 작업의 변경 보존.
- CPU 부하에 대한 사용자 지적 후 병렬 브라우저 매트릭스와 실제 공유 검증을 중단하고 모든 검증 브라우저·임시 서버를 종료했다. 사용자 개발 서버(3001/5173)는 유지했다. 이후 검증은 단일 CPU 코어·순차 실행으로 제한한다. 중단한 매트릭스는 전체 통과로 기록하지 않는다.

### 후속 공유 흐름 검증

- Astra 독립 리뷰 `artifacts/organization-lounge/member-sharing-review.md`에서 재배정 뒤 일반 작성자의 이름 편집이 담당자를 본인으로 되돌리는 문제와 주의사항 UI/API 불일치 두 건을 발견했다. 일반회원 PATCH는 담당자를 생략하며 현재 담당자를 읽기 전용으로 표시한다. 서버도 일반 작성자의 담당자 변경을 거부하고 작성자의 주의사항 권한을 유지하도록 수정했다. 주 담당이 담당자 재배정→작성자 변경 거부→이름만 수정 시 배정 유지→주의사항 생성 HTTP 회귀를 추가해 확인했다.
- 관련 서버 17개 통과: `member-sharing-backend-final.log`. 실제 Express router와 테스트 인증 주입을 사용하는 HTTP/저장소/브리핑 테스트다. 독립 리뷰 보고서는 발견 당시 코드 기준이며 위 수정 후 확인 결과와 구분한다.
- fixture 브라우저 Chromium 데스크톱 3개 통과: `member-share-provider-current.log`. 정상 결과의 기존 화면 사용, 비행 버전 변경 후 기관 API 재조회, 초기 실패 재시도, 복귀 뒤 늦은 응답 차단을 확인했다. 이전 병렬 매트릭스는 사용자 CPU 지적에 따라 중단했으므로 전체 통과로 간주하지 않는다.
- 실제 로그인 쿠키·서버·개인 저장·공유 API를 사용하는 `ORGANIZATION_SHARING_FOCUSED=1 node scripts/verify-organization-sharing.mjs` 통과: `member-sharing-result.json`, `member-sharing-browser-focused.log`. Chromium 1920×1080 및 WebKit 1180×820을 한 코어 안에서 순차 검증, 캡처 8개는 `member-sharing-g08saN/`. 다른 회원의 원본 공유 거부, 비소속 거부, 작성자 식별, 다른 구성원 읽기·계획 수정 거부, 기존 브리핑 화면과 닫기 복귀, 개인 원본 삭제 후 공유본 보존을 확인했다. iPad 브리핑 캡처는 본문 표시 시점이며 지도 타일의 완전 로딩 검증은 이번 검사의 범위가 아니다.
- 이 실제 HTTP/화면 검사의 계정·기관·비행은 합성 자료이고 기상은 로컬 `backend/data`에 이미 수집된 실제 자료다. 외부 새 수집은 실행하지 않았다. 화면의 자료 누락은 `위험 판단 제한`으로 표시하며 최신 자료 전체 정상으로 보고하지 않는다. API를 모킹한 fixture 검사와 실제 로컬 기상 검사를 구분한다.
- 작업자 전원 완료·해제. 기관 개설/초기 관리자 지정 관리 UI는 기존에 기록한 잔여이며 이번 회원 공유 수정 범위에 포함하지 않았다.
- 변경 후 최종 `npm run check` 통과: backend 1,130 통과/1 skip, frontend 1,526 통과, production build 성공. `artifacts/organization-lounge/member-sharing-npm-check.log`. CPU affinity 0과 nice 10을 지정한 프로세스에서 순차 실행했고, 기존 500kB chunk 경고는 남는다. 검증 브라우저와 임시 서버는 모두 종료했다.
- 사용자 기존 Orca 개발 터미널에서 `npm run dev:test`를 정상 중지 후 재시작했다. 3001 health 200, 5173 준비, local_admin 자동 로그인과 새 공유 API의 `saved_route_not_found` 입력 검증 응답으로 변경 반영을 확인했다. 기존 개발 테스트 기관과 자료를 유지했고 이번 재시작 확인을 위해 새 테스트 자료는 추가하지 않았다. 수동 사용은 새로고침 후 개인 브리핑 저장→계정의 `기관에 공유` 또는 기관 예정비행의 `내 비행 공유` 순서다.

## 홈 공간 활용·표현·예시 보완 — 2026-09-10 후속

- 사용자 화면 확인에 따라 라운지 본문의 1,760px 최대 폭을 해제하고 바깥 여백은 기존 토큰 16px로 줄였다. 홈은 뷰포트의 남은 높이를 사용하며 지도와 오른쪽 두 카드가 함께 늘어난다. 고정 590px에 머물던 지도 패널은 최소 600px 및 가용 높이를 사용한다.
- 홈 제목을 `운항 기상`, `기관 알림`, `비행 일정`으로 변경했다. `기관 알림`은 실제 기상 알림을 우선 표시하고 남는 자리에 게시 기간 안의 기관 공지를 보여 준다. 공지는 소식 서랍, 기상 알림은 기상 알림 화면으로 연결한다. 가짜 기상 경보는 생성하지 않았다.
- 현재 로컬 `개발 테스트 기관`에 관리자 HTTP API로 예시 공지 3건(id 2/3/4: 야간 브리핑, 훈련 참고자료, 운항일지) 및 비행 3건(id 2/3/4: 항법훈련, 복귀, 숙달비행)을 추가했다. 모든 새 제목에 `[예시]`를 표시하고 기존 자료는 보존했다. 재실행 시 같은 제목은 중복 생성하지 않는 스크립트와 결과는 `artifacts/organization-lounge/seed-home-examples.mjs`, `home-examples-result.json`이다. 서버 코드나 실제 기상 자료 변경은 없다.
- 실제 개발 서버를 Chromium 1920×1080과 WebKit 1180×820에서 한 번씩 순차 확인했다. 지도 패널 높이 928px/668px, 좌우 바깥 여백 16px, 가로 넘침 없음, 추가 세로 스크롤 없음, uncaught page error 없음. 예시 공지 클릭 후 소식 서랍을 열어 본문을 확인했다. 캡처 4개 `home-layout-{desktop,ipad}.png`, `home-notices-{desktop,ipad}.png`와 측정 `home-layout-result.json`은 artifacts/organization-lounge 아래에 있다. 이 확인은 배치·로컬 예시·공지 연결 검증이며 새로운 실제 기상 수집 검증이 아니다.
- 변경 후 최종 `npm run check` 통과: backend 1,130 통과/1 skip, frontend 1,526 통과, build 성공(기존 chunk 크기 경고 유지). `home-layout-npm-check.log`. 전체 검사는 CPU 한 코어·nice 10으로 브라우저 종료 후 순차 수행했다. 프런트엔드 HMR과 실제 개발 DB에 반영되어 새로고침으로 사용할 수 있다.

## 국내 공항 예시·실제 자동 생성 — 2026-09-10 후속

- 사용자 요청으로 단순 광주–여수 예시 3건을 김포–제주(RKSS→RKPC), 김해–김포(RKPK→RKSS), 청주–제주(RKTU→RKPC)로 변경했다. 최초 수동 테스트 비행(id 1)은 유지했다.
- 실제 5173 화면에서 각 노선의 IFR 출발·도착 공항을 선택하고 `자동 생성` 버튼을 눌렀다. 항공로 토큰이 2개보다 많고 적용된 경로가 다음 단계로 진행 가능한지 확인한 뒤 `현재 경로 저장`으로 서버 개인 경로(id 4/5/6)에 저장했다. fixture나 수동 좌표 직선으로 자동 생성 결과를 대신하지 않았다.
- 생성 결과: 김포–제주 BULTI/Y711/DOTOL, 김해–김포 KALOD/Y782/TGU/Z53/G585/GUKDO, 청주–제주 BULTI/Y711/DOTOL. 선택된 SID/STAR/IAP ID와 절차 포함 좌표(각 38/22/34개)를 그대로 보존했다. 기하·절차는 현재 로컬 navdata와 기존 자동 추천 로직의 결과이며 새 AIRAC 자료 수집이나 실제 운항 승인 검증을 뜻하지 않는다.
- 관리자 HTTP PATCH로 기존 예시 비행 id 2/3/4를 v2로 갱신했다. 이름·시각·고도·프로필·좌표를 함께 갱신하고 GET으로 읽어 좌표와 버전을 대조했다. 기존 v1은 불변 이력에 보존되고 별도 변경 전 JSON도 artifacts에 남겼다. 제목의 `[예시]` 표시를 유지했다.
- 재현/증거: `artifacts/organization-lounge/generate-domestic-examples.mjs`, `apply-domestic-examples.mjs`, `domestic-generated-result.json`, `domestic-examples-applied.json`, `auto-route-RKSS-RKPC.png`, `auto-route-RKPK-RKSS.png`, `auto-route-RKTU-RKPC.png`. 모든 브라우저는 단일 CPU 코어·nice 10, 순차 실행이다. 이번 변경은 로컬 예시 데이터와 기록이며 앱 소스 변경은 없다.
- 실제 홈에서 세 노선 표시를 확인한 뒤 김포–제주 예시를 눌러 기관 weather-briefing API 200 및 기존 BriefingView의 RKSS→RKPC 표시까지 확인했다. uncaught page error 없음. `domestic-shared-check.json`, `domestic-home.png`, `domestic-shared-briefing.png`. 기상은 현재 로컬 수집 자료를 조회했고 최신 외부 재수집은 실행하지 않았다. 브라우저는 확인 후 종료했다. 원래 광주–여수 예시를 만드는 `seed-home-examples.mjs`는 과거 준비용이며 현재 국내 노선 구성을 되돌리려는 목적 없이 재실행하지 않는다.

## 비행 상세 조작부·운항 참고사항·기관 예시 확장 — 2026-09-10 후속

- 공통 PageHeading에서 action을 별도 flex 컨테이너로 묶었다. Fragment가 펼쳐져 제목·편집·브리핑이 3개 독립 자식으로 space-between 배치되던 원인을 수정했다. 비행계획 편집과 기상 브리핑 보기는 오른쪽에서 8px 간격으로 정렬된다. 다른 라운지 제목 조작부도 같은 계약을 사용한다.
- 비행 상세·작성/편집 대화상자·합동 준비·발표에서 `조종사 주의사항`을 `운항 참고사항`으로 통일하고 빈 상태·저장/삭제 안내를 정리했다. 기존 HTTP 브라우저 검증의 저장 버튼 locator도 새 이름으로 맞췄다. Chromium 데스크톱·WebKit iPad에서 버튼 정렬(8px), 편집 대화상자 열기, 운항 참고사항 작성 열기를 확인했다. `flight-heading-result.json`, `flight-heading-{desktop,ipad}.png`.
- 로컬 개발 테스트 기관에 관심 공항 김포/RKSS·김해/RKPK·제주/RKPC(id 2/3/4)와 관심 구역 `[예시] 서해안 항로 관심 구역`, `[예시] 제주 접근 관심 구역`(id 5/6)을 관리자 HTTP API로 추가했다. 기존 남부 관심구역은 유지한다. 예시 다각형은 기관의 사용자 지정 관심 구역이며 실제 관제 공역 경계 자료를 의미하지 않는다. `seed-interest-examples.mjs`, `interest-examples-result.json`. 홈 공항 요약은 실제 로컬 METAR 수집 상태가 delayed이므로 `자료 지연`으로 표시하며 예시 정상 날씨를 만들지 않는다.
- 실제 저장된 자동 생성 비행 v2를 참조하는 합동 브리핑 3개를 추가했다: 제주 노선(id 2, 비행 2/4), 김해–김포(id 3, 비행 3), 야간 운항 종합(id 4, 비행 2/3/4). 각 비행의 발표 메모를 채우고 공통 참고자료는 기존 PDF id 1 v1을 연결했다. 생성 후 GET으로 flightRefs·메모 개수를 대조했다. `seed-joint-examples.mjs`, `joint-examples-result.json`. 기존 합동 브리핑 id 1과 모든 기존 자료는 유지한다.
- 최종 Chromium 1920×1080·WebKit 1180×820에서 관심 공항 3개, 지도 organization-linked source의 예시 구역, 기관 설정 목록, 합동 브리핑 목록 4건(기존 1+신규 3), 종합 브리핑의 실제 연결 비행 3개와 발표 메모를 확인했다. 캡처 8개 `interest-home-*`, `interest-settings-*`, `joint-examples-*`, `joint-prepare-*`; 결과 `interest-joint-check.json`. 공항 카드가 3개일 때 네 번째 빈 칸을 남기지 않도록 데스크톱 열 개수를 실제 표시 개수와 맞췄다. 첫 검증의 textarea 내용 locator 오류는 textbox 값 검사로 수정한 후 통과했다.
- 최종 `npm run check` 통과: backend 1,130 통과/1 skip, frontend 1,526 통과, production build 성공. `lounge-examples-npm-check.log`. 기존 chunk 크기 경고만 유지한다. 브라우저 종료 후 검사도 CPU 1코어·nice 10에서 순차 실행했다. 변경은 개발 서버 HMR 및 실제 로컬 기관 DB에 반영됐으며 배포·커밋은 하지 않았다.

## 기관 지도 공항 관측 마커 연결 — 2026-09-11 후속

- 사용자 요청: 메인 지도와 같은 공항 이름·바람깃·원형 운량/상태 표시를 기관 지도에서도 사용하되 공항 클릭 패널은 열지 않는다.
- 변경 전 실제 개발 map handle로 확인한 `kma-weather-airports` source: 메인 69개, 라운지 0개. 레이어 설치 기능 자체가 아니라 OrganizationMap에 전달하는 airports/METAR가 비어 있었다. 근거 `airport-marker-before.json` 및 로그. 당시 진단 로그의 wind=false는 windBarbIconId라는 잘못된 검사 키 때문이며 실제 모델 키는 windIconId다. 최종 검증은 올바른 키를 사용한다.
- 서버 상황 응답과 기관 기상 bundle에 mapData.airports/metar를 추가했다. 메인과 같은 국내·해외 공항 목록 및 METAR 병합 순서를 사용한다. 원본 관측 시각과 누락 값은 보존하며 임의 정상 관측은 만들지 않는다. 화면은 기존 MapView 공항 source/레이어/아이콘을 그대로 재사용하고 onAirportSelect를 연결하지 않는다.
- 발표 bundle에도 공항 관측 복사본을 포함해 bundle ID 계산과 저장에 함께 고정한다. 프런트엔드 pinned 모드는 상황의 최신 METAR로 fallback하지 않는다. 새 bundle 적용 때만 관측 마커가 바뀌며 과거 bundle에 공항 관측이 없으면 새 자료를 섞지 않는다.
- 관련 파일: backend/src/organizations/map-weather.js, situation.js, briefing.js; frontend/src/features/organization-lounge/OrganizationMap.jsx, lib/organizationMapWeather.js. MapView 공통 렌더러와 개인 기상 API는 변경하지 않았다. 개발 서버를 기존 Orca 터미널에서 재시작해 API 변경을 반영했다.
- 배경지도 전환 확인 중 관심 구역 overlay가 외부 타일/이미지 로딩 완료를 기다리느라 복원되지 않는 경계도 발견했다. adapter의 설치 준비 조건을 전체 isStyleLoaded 대신 style 직렬화 가능 여부로 바꿨다. style 자체가 준비되지 않아 getStyle이 실패하면 계속 대기하고, 개별 타일이 늦어도 기관 source/레이어는 복원한다. 최종 브라우저 검사에 전환 후 organization-linked source와 fill layer 존재를 추가했다.
- 최초 WebKit 실행에서 외부 Mapbox 글꼴/리소스에 `due to access control checks` 오류가 나왔다. 최종 스크립트는 이 메시지를 resourceErrors로 별도 기록하고 그 외 pageerror는 실패 처리한다. 자원 접근 오류를 없앴다고 보고하지 않는다. 공항 데이터·아이콘 등록·전환 후 레이어 검사는 이 분류와 별도로 모두 assert한다.
- 최종 실제 브라우저 확인은 Chromium 데스크톱 1600×1000, WebKit iPad 1180×820 모두 통과했다. 공항 69개, 김포/인천/제주/김해/도쿄 마커의 GeoJSON이 메인과 일치, station/wind/weather runtime image 존재, 확대 6/8, 단색→기본 배경 전환 2회 후 공항·관심 구역 레이어 유지, 공항 클릭 시 패널 미노출을 확인했다. 재실행의 resourceErrors와 pageerror는 둘 다 0이다. `airport-markers-browser-result.json`, `airport-markers-{desktop,ipad}-{z6,z8,final}.png`.
- 실제 자료 검사는 자동수집이 꺼진 개발 서버의 로컬 관측을 사용했다. 브리핑/발표 관측 고정과 소스 mutation 방지는 합성 관측으로 별도 단위 검증한다. 과거 bundle에는 mapData가 없을 수 있으며 새 발표 자료를 적용해야 공항 관측 마커가 포함된다.
- 최종 `npm run check` 통과: backend 1,132 통과/1 skip, frontend 1,527 통과, production build 성공. `airport-markers-npm-check.log`. 기존 chunk 크기 경고만 남는다. 모든 검증은 한 CPU 코어·nice 10에서 순차 실행하고 브라우저를 종료했다. 개발 서버에 반영되어 새로고침으로 확인 가능하다.

### 2026-09-11 — 기관 지도 패널 버튼과 지도만 보기

- 요청: 라운지 지도 왼쪽 위에 모바일 지도처럼 항공정보·기상정보·내 지도 진입 버튼 추가. 지도 제목 줄에서 조작부 전체 숨기기/보이기 지원.
- `OrganizationMap`의 live 지도에 로컬 패널 상태와 44px 터치 버튼을 연결했다. 기존 MapView 항공/기상/내 지도 패널을 재사용하며, 같은 버튼을 다시 누르면 닫고 다른 버튼을 누르면 패널이 전환된다. 패널은 버튼 아래에서 지도 안의 높이만 사용한다.
- 기존 기관 mapData는 공항/METAR 중심이어서 영상·특보 props가 비어 있었다. 공개 지도자료 로더를 재사용해 레이더·위성·특보·낙뢰·SIGWX·NOTAM 메타데이터를 연결하고 60초 간격으로 겹치지 않게 갱신한다. 부분 실패(undefined)는 마지막 사용 가능한 값을 보존한다. 기관 비행 브리핑 API에는 관여하지 않는다.
- 합동 발표의 pinned 지도는 새 live 조회와 패널을 사용하지 않는다. 전달된 최신 overlay 자료가 있어도 적용된 bundle만 선택하는 회귀 테스트를 추가했다.
- 홈 ‘운항 기상’ 제목 오른쪽의 ‘지도만 보기 / 조작 버튼 보기’가 패널·시간축·범례·배경지도·확대/축소 조작부를 함께 숨기고 복원한다. 지도 인스턴스와 카메라·레이어·파일은 유지하며, 지도 공급자 표기와 오류/시연 고지는 유지한다.
- 실제 로컬 수집 자료 검증: Chromium 1600×1000, WebKit 1180×820에서 항공정보 토글, 레이더 토글, 적외영상 선택, 공항 69개 유지, 레이더/위성 메타 HTTP 200 및 실제 Mapbox 레이어 visible을 확인했다. API 응답을 fixture로 대체하지 않았다. 수집이 정지된 개발 서버의 저장 자료이며, 외부 최신 관측 수집 검증은 아니다.
- Fixture 검증: 브라우저 임시 컨텍스트에 검증용 KML 선 하나를 업로드하여 `my-map-src` 도형 생성을 확인했다. 사용자 브라우저 저장소에는 예시 파일을 추가하지 않았다.
- 숨기기/복원은 두 브라우저에서 버튼·패널·배경지도·확대 버튼의 visibility, 같은 지도 인스턴스, 같은 중심좌표, 공항 69개 및 attribution 유지로 확인했다.
- 캡처/기록: `artifacts/organization-lounge/map-panels-{desktop,ipad}-{aviation,weather,my-map}.png`, `map-panels-browser-result.json`, `map-only-{desktop,ipad}-{hidden,restored}.png`, `map-only-browser-result.json`. 테스트와 브라우저는 한 CPU 코어/nice 10으로 순차 실행했다.
- 최종 `npm run check` 통과: backend 1,132 + frontend 1,528 = 2,660 tests passed, 기존 skip 1, frontend production build 성공. 기존 500kB chunk 경고는 남아 있다. 로그: `artifacts/organization-lounge/map-controls-npm-check.log`.
- 이번 요청의 남은 구현 작업 없음. 외부 최신 수집 데이터로의 재확인은 별도이며, 이번 검증 결과를 최신 실황 검증으로 취급하지 않는다.

### 2026-09-11 — 비구성원·비로그인 사용자의 라운지 미리보기

- 요청: 기관 선택/미가입 안내 화면에서 ‘미리보기 체험’을 눌러 로컬 관리자가 보던 예시를 조회하고 직접 조작할 수 있도록 제공.
- 주 담당: 체험 서버·예시 데이터·통합 검증. 화면 담당(sol/medium): 진입·API 연결·기존 브리핑·개인 저장 경계. 독립 리뷰(astra/high): 권한·세션·자료 URL·초기화 동시성. 최대 동시 작업은 주 담당 포함 3개.
- `/lounge/preview/home`은 기존 라운지 화면을 재사용한다. 비행/자료/관심대상 편집, 내 비행 공유, 발표 준비·발표, 지도 조작은 실제 서버 처리를 사용한다. 기관 및 기상 브리핑 링크의 식별자 `preview`는 하위 자료 뷰어·확대 발표까지 유지한다.
- `/api/lounge-preview`는 실제 로그인 세션 미들웨어 **앞**에 종결 라우터로 연결했다. 별도 HttpOnly/SameSite=Strict/path 제한 무작위 쿠키가 브라우저별 in-memory DB와 전용 임시 파일 디렉터리를 식별한다. 실제 로그인 세션·기관 DB를 읽거나 복제하지 않는다. 기존 기관 라우터와 개인 경로 라우터에 체험 DB를 명시적으로 주입해 불변 버전·자료 검증·소유권 검사를 재사용한다.
- 공개 예시는 `preview-samples.json`의 허용 필드만 정적으로 정리했다. 기존 김포–제주, 김해–김포, 청주–제주 자동 생성 기하/절차와 관심 공항 3개·관심 구역 2개·공지 3개·합동 브리핑 3개를 포함한다. 계정명·소유자 식별자·실제 기관 파일 경로/비공개 데이터는 복사하지 않았다. PDF는 기존 합성 두 쪽 예시를 재생성했으며 편집 가능한 운항 인계 문서를 추가했다.
- 운항일은 체험 시작일 KST로 배치하며 기상 관측/예보 시각·AIRAC 출처는 조작하지 않는다. 실제 저장 기상을 조회하고 누락·지연을 계속 표시한다. 예시 경로는 실운항 승인 경로를 의미하지 않는다.
- 체험은 2시간 절대 만료이며 초기화 시 해당 브라우저의 DB·파일을 다시 생성한다. 세션 최대 24개, 동시 생성 4개, 분당 요청 180개, 세션 쓰기 200회·누적 요청 본문 32MiB·DB 16MiB 제한. chunked 쓰기는 크기 우회 방지를 위해 거부한다. 만료 정리에서 진행 중 비동기 작업을 기다리며 초기화 중 새 CRUD를 막는다. 서버 재시작 시 체험 상태는 유지되지 않는다.
- 독립 리뷰 지적 수정: Content-Length 없는 업로드 한도 우회, 초기화/연결 종료의 비동기 DB 종료 경합, 발표 확대 시 숫자 기관 ID로 되돌아가는 자료 URL, 메인 브리핑 개인 저장의 실제 계정/로컬 저장소 폴백. 관련 HTTP 및 frontend 회귀 테스트를 추가했다.
- 실제 오늘 날짜의 예시 브리핑에서 기존 `weightedWind`가 단면 예보의 axis 누락 시 예외를 내는 문제를 발견했다. 축 누락은 바람 null·구간 timeStatus unavailable로 처리하고 공식 위험기상과 경로 구간은 유지하는 회귀 테스트를 추가했다.
- WebKit에서 지도 종료 중 래스터 전환이 남는 오류를 발견해 오버레이 정리 후 map.remove를 실행하고 래스터/낙뢰 전환 작업을 먼저 취소하도록 보완했다. 개발 서버 재시작 뒤 PDF 번들에 504 Outdated Optimize Dep가 발생한 경우 생성 캐시 `frontend/node_modules/.vite`를 지우고 재시작했다(소스 변경 아님).
- 지도 종료 보완의 최종 범위: 래스터 source 대기의 fallback 타이머·이벤트 리스너를 취소하고, RainViewer 비표시 상태에서 source를 만들지 않으며 동일 URL의 반복 setTiles를 방지한다. map.remove 전에 RainViewer 레이어/source를 제거해 진행 중 TileJSON 요청을 정리한다. 독립 리뷰에서 최종 수정의 추가 차단 이슈가 없음을 확인했다.
- 실제 HTTP 경계 테스트 6개 통과: 익명 CRUD/방문자 격리, 불변 버전 충돌, 비공개 파일·Range 요청, 위조/다른 세션/기관 접근 거부, Origin·만료·용량, 개인 저장 경로 격리, 연결 종료 중 초기화 경합, chunked 쓰기 거부. 로그 `artifacts/organization-lounge/preview-http-tests.log`.
- 최종 화면 검증 통과: Chromium 1600×1000(비로그인), WebKit 1180×820(로그인한 기관 미가입자)에서 진입 버튼, 예시 비행 3개·관심 공항 3개·합동 브리핑 3개, 비행 편집/초기화, PDF 2쪽 넘기기를 확인했다. 데스크톱에서는 실제 발표 시작·B 기본/A/B 전환·PDF 확대·발표 종료·기존 기상 브리핑 HTTP 200과 화면 표시도 확인했다. 실제 기관 `/api/organizations/` 요청, pageerror, 최종 resourceErrors는 모두 0이다.
- Fixture와 실제 데이터 구분: 로컬 AUTO_ADMIN_LOGIN 환경의 로그인 조회만 비로그인/미가입 응답으로 대체했다. 비행·공지·PDF는 공개 체험용 합성/정적 예시이며, 미리보기 CRUD·발표·파일·기상 API는 실제 개발 서버에 요청했다. 기상은 자동수집이 중지된 서버의 저장 자료로 확인했으며 최신 외부 수집 검증은 아니다. 예보 범위 누락 시 기존 브리핑에 ‘위험 판단 제한’이 표시되는 것을 확인했다.
- 화면 증거: `artifacts/organization-lounge/preview-browser-result.json`, `preview-browser.log`, `verify-preview.mjs`, `preview-{desktop,ipad}-{home,edited,material,briefings}.png`, `preview-desktop-presentation.png`, `preview-desktop-expanded-pdf.png`, `preview-desktop-weather-briefing.png`.
- 최종 `npm run check` 통과: backend 1,140 + frontend 1,537 = 2,677 tests passed, 기존 skip 1, production build 성공. 기존 500kB chunk 크기 경고는 유지된다. 로그 `artifacts/organization-lounge/preview-npm-check.log`. 모든 테스트·브라우저·빌드는 CPU 1코어/nice 10으로 순차 실행했다.
- 이번 미리보기 요청의 남은 구현 작업 없음. 개발 서버에 반영했으며 이번 후속 변경은 아직 커밋/푸시하지 않았다. 앞선 라운지 구현은 46812147로 origin/main에 푸시 완료 상태다. 다른 작업의 변경은 보존했다.

### 2026-09-11 — v0.4.0 및 전체 세션 변경 통합

- 사용자 요청으로 앱 버전을 0.3.0에서 0.4.0으로 올리고 라운지·비행 공유·공유자료·합동 발표·지도 조작·미리보기의 사용자용 업데이트 내역을 추가했다. frontend package/lockfile/CURRENT_VERSION 일치를 확인했다.
- 이어진 명시적 요청에 따라 미리보기뿐 아니라 다른 세션의 공항 모델 비교 개선, 개발 문서 보관 경로 이동, 작업 도구 설정 정리와 저장소에서 제외 해제된 그래프 자료까지 현재 전체 변경을 커밋·푸시 범위에 포함했다.
- 전체 변경 상태의 최종 `npm run check` 재실행 통과: backend 1,140, frontend 1,537, 총 2,677 통과/기존 skip 1, production build 성공. 로그 `artifacts/organization-lounge/v0.4.0-all-changes-check.log`. 기존 chunk 크기 경고 외 실패 없음. CPU 1코어/nice 10으로 순차 실행했다.
- AGENTS.md와 CLAUDE.md 동일성을 확인했다. 이동된 문서 3개의 Markdown 줄바꿈은 뒤 공백 대신 역슬래시로 보존해 staged diff 공백 검사도 통과했다. 앞 절의 ‘미커밋/미푸시’는 당시 상태이며 이번 통합에서 포함한다.
