# 전체 진단표와 기준선

진행 방법은 [전체 계획](README.md), 실행 상태는 [작업 목록](tasks.md), 최신 재개 위치는 [진행 기록](progress.md)을 참고한다.

## 조사 범위

아래 상태는 `미착수 → 조사 중 → 조사 완료`로 관리한다. `조사 완료`에는 아래 결과 기록 형식에 따른 근거가 필요하며, 구현 완료를 뜻하지 않는다. 일부만 확인했거나 실행 환경이 없으면 `부분 확인`으로 두고 남은 범위를 적는다.

S004는 추적 **2,248파일을 빠짐없이 주 소유 영역에 분류**하고 W01~W12 및 주 담당 공통 조사의 진입·생산·저장·소비 흐름을 대조했다. 아래 수는 주 소유 파일 수이며 읽은 파일 수·손코드 복잡도가 아니다. 예를 들어 A01 1개는 루트 진입 배정이고 실제 graph 분석은 전 영역601모듈이다. CSS·테스트 등 교차 조사는 중복 합산하지 않는다.

**진단 산출물과 영역의 모든 실행 검증을 구별한다.** 전체 영역의 유지/후보/미확인을 기록하더라도 대표 재현만으로 모든 분기를 조사 완료로 바꾸지 않는다. 따라서 영역 상태는 남은 구체 범위가 있는 `부분 확인`이며, 아래 후속 ID로 보존한다. RF-002 완료 조건은 이 전체 분류·근거·판정·누락 반환이고 제품 전체 무결성 선언이 아니다.

| ID | 영역 · 주 소유 파일 | 검수한 경로·유지 구조 | 실제 확인 상태·남은 범위 |
| --- | --- | --- | --- |
| A01 | 전체 분류·진입·import · 1 | [공통](audit/common.md) — runtime601/1297 graph와 실제 도구 예외; 기능 소유 경계 유지 | 부분 확인: 계산식 import/CJS/glob 전체 AST·동적 소비 |
| A02 | 앱·요청·설정 · 52 | [W04](audit/W04.md) — 초기/주기/deferred writer·metadata·storage·entry; profile/merge 경계 유지 | 부분 확인: 모든 느린 응답 조합·storage/개인 진입 UI |
| A03 | 지도·도구·오버레이 · 156 | [W05](audit/W05.md) — 10 feature 자원·style·시간축·파일·point 흐름; adapter와 cleanup 선례 유지 | 부분 확인: 세부 Q1~Q8·실제 style/장기 retainer·실기기 |
| A04 | 경로·개인 브리핑 · 87 | [W06](audit/W06.md) — 입력/적용/저장/복원→API→지도·차트; root routeModel·기관 분리 유지 | 부분 확인: 대안action·NWP envelope UI·FPL·WebKit 지형 fixture |
| A05 | 공항·모델 비교 · 34 | [W07](audit/W07.md) — 관측 단위/운고·TAF·모델 UTC·raw cache·partial; provider별 검증/provenance 유지 | 부분 확인: 실제 원단위 계약·raw cache 재회복·TZ UI |
| A06 | 모니터링·터미널 · 66 | [W08](audit/W08.md) — 전체66파일·자료/타이머/양쪽queue/경보; legacy 현재 소비·classic/signage 유지 | 부분 확인: 장시간 편성·quiet 경계·실제 sound·운항일 |
| A07 | 기관 라운지 · 44 | [W09](audit/W09.md) — ACL/version→candidate/apply→pinned 지도/PDF; CAS·immutable/private 유지 | 부분 확인: 파일 동시성·403/409 복구·실제 다중 창 |
| A08 | 계정·개인 저장·알림 · 39 | [W10](audit/W10.md) — 세션/DB·감시/ETA·push·딥링크; 소유 SQL·인앱/채널 분리 유지 | 부분 확인: 실제 push·SID/회수·delivery 실패·계정 전환 |
| A09 | 관리자·시연·운영 · 48 | [W11](audit/W11.md) — 48파일·관리/시연/예보관/관측/백업의 실제 소비; 역할 gate·active 전환·참조 첨부 백업 유지 | 부분 확인: production flag·snapshot 경합·reset/tick·백업 중단·운영 지표의 정책/실환경 |
| A10 | 수집·저장·캐시 · 110 | [W03](audit/W03.md) — 35 선언 수집+예약외목록·검증/게시/API; per-type lock·worker·bounded cache 유지 | 부분 확인: 전문 parser 전 필드·실제 upstream·강제중단·worker 부하 |
| A11 | 시간·상태·자료 공통 · 11 | [공통](audit/common.md) — UTC/epoch·active/live·null/undefined·unknown·단위 실제 소비 연결 | 부분 확인: source별 명세와 유효시각 예외·모든 상태 조합 |
| A12 | UI·CSS·자산 · 494 | [W12](audit/W12.md) — 494파일 분류+CSS44 import/선택자·생성/원본; font 개선·tokens 유지 | 부분 확인: 전체 computed cascade·keyboard/reader·PWA·원본 권리/직접URL |
| A13 | 검증 경로 · 501 | [W01](audit/W01.md) — 실제 discovery·28spec 엔진/fixture·기준선; 순수/HTTP/상태 검사 유지 | 부분 확인: QCD실자료·prototype·실기기·개별 실패/skip 경계 |
| A14 | 개발·빌드·배포 · 96 | [W02](audit/W02.md) — package/lock·설치/runner/nginx/PM2·수동도구; lock/staging 유지 | 부분 확인: clean install·nginx runtime·VM/old tab·포트 충돌 |
| A15 | 문서·프로토타입·기타 · 509 | [공통](audit/common.md) — 정본/과거기록·DEV/독립prototype·navdata/AIP·graphify 생성/참조 분류 | 부분 확인: prototype 별도build·자산 원본·public prototype 제공 범위 |

S004의 `git ls-files` 원장과 위 영역 합계는 일치한다. 경계가 겹치는 경우 한 발견 ID에 관련 영역을 함께 적어 중복 작업을 피한다. 프로토타입 작업 전 해당 하위 `AGENTS.md`를 읽는다.

서브에이전트 배정·진행 상태는 [조사 묶음](tasks.md#rf-002-서브에이전트-조사-묶음)에서 관리한다. 이 표는 영역의 실제 조사 범위와 판정만 관리하며, 보고서 도착만으로 상태를 완료로 바꾸지 않는다. A01/A11/A15는 주 담당이 통합하고 나머지는 배정된 묶음의 근거를 검수해 반영한다.

`node_modules`, `dist`, ignored 로컬 데이터·로그·캡처는 손코드 복잡도 집계에서 제외한다. 생성 코드·벤더 자산·정적 데이터는 원본/생성기/소비자 관점으로 별도 조사하며, 파일 크기나 `legacy`·`spike`라는 이름만으로 제거하지 않는다.

## 영역별 결과 기록 형식

조사를 마친 영역마다 아래 형식으로 이 문서에 추가한다. 결과가 길어지면 `audit/Axx.md`로 분리하고 이 문서에는 상태와 링크를 남긴다.

```text
영역 ID / 조사일 / 코드 기준(HEAD와 관련 미커밋 변경):
조사 작업 ID / 보고서 검수 상태 / 임시 발견 ID와 OBS ID의 대응:
확인한 진입점·소비 경로·파일 범위:
발견 사항 ID와 근거(코드 위치·명령·재현):
기존에 잘 분리된 부분 / 유지 판단과 이유:
성능 관측 또는 미측정 항목:
판정: 개선 후보 / 유지 / 추가 확인
남은 범위·환경 제한·재검토 조건:
연결할 작업 ID:
```

## 초기 관찰 — 전체 진단 결과 아님

아래는 최초 기준 커밋에서 확인한 사실과 조사 가설이다. 실행 성능이나 실제 결함을 확인했다는 의미가 아니다. 신규 발견에는 다음 `OBS-xxx` 번호를 붙이고, 확인·기각·작업 연결을 같은 항목에 갱신한다.

| ID | 관찰 근거 | 후속 확인 / 연결 영역 |
| --- | --- | --- |
| OBS-001 | `backend/server.js` 1,400줄, 2026-08-01 이후 23개 커밋에서 변경. API와 캐시·자료 조회 도우미가 함께 있음 | API 묶음별 의존성과 HTTP 테스트 범위를 조사한 뒤 분리 효과 판단. A01/A10 |
| OBS-002 | `useRouteBriefing.js` 2,834줄, 같은 기간 34개 커밋에서 변경. 편집·저장·기상 요청·기관 문맥을 처리 | 상태 전이·원본·소비자를 그려 책임 분리와 요청 수명 검토. A04 |
| OBS-003 | `MapView.jsx` 2,340줄, 같은 기간 37개 커밋에서 변경. 정책에도 NOTAM·ADS-B·경로 처리의 과도기적 예외가 명시됨 | 기존 기능별 훅을 이용할 범위와 실제 스타일 복원·cleanup 검사. A03 |
| OBS-004 | `monitoring/legacy/App.css` 5,909줄, `AirportPanel.css` 3,451줄, `MapView.css` 2,702줄 | 실제 import·선택자·덮어쓰기와 화면별 사용을 확인. 크기만으로 미사용이나 성능 저하 판정 금지. A06/A12 |
| OBS-005 | `useRouteBriefing.selection.test.js`는 훅의 소스를 읽어 정규식으로 함수 내용을 검사 | 보호하려는 상태 전이를 확인하고 분리 대상의 동작 테스트 필요성 판단. A04/A13 |
| OBS-006 | 루트 `shared/`에 테스트 4개가 있음. 루트 `npm test`는 backend/frontend의 `node --test`를 실행 | 실제 discovery·CI에서 루트 테스트도 실행되는지 확인. 명령 구조만으로 누락 확정하지 않음. A13/A14 |
| OBS-007 | 기본 Playwright의 `ipad-landscape`는 Chromium, `ipad-safari`는 `route-token-input` 한정. 기관용 별도 설정은 Chromium/WebKit을 사용 | 계약별 실제 엔진·표면을 기록하고 미검증 흐름 확인. A13 |
| OBS-008 | 폰트 최적화는 최근 연구 문서에 구현·검증·배포까지 기록됨. 생성 CSS 5,772줄은 생성 결과 | 완료된 최적화를 재실행하지 않고 현재 빌드와 남은 외부 글꼴 사용을 확인. 과거 수치를 새 기준선으로 복사하지 않음. A12/A14 |

크기 재확인 예: `wc -l backend/server.js frontend/src/features/route-briefing/useRouteBriefing.js frontend/src/features/map/MapView.jsx`.
변경 빈도 재확인 예: `git log --since=2026-08-01 --format= --name-only -- frontend/src backend/src backend/server.js shared`의 파일별 등장 횟수. 날짜 범위와 HEAD를 함께 기록한다.

참고: [최근 폰트 최적화 기록](../research/2026-09-11-font-delivery-optimization.md), [이전 리팩토링 인계](../archive/refactoring-handoff.md). 이전 세션의 테스트 개수·통과 기록은 현재 실행 결과와 구분한다.

## 기준선과 검증 범위

S004의 실행 조건·명령·시나리오·수치·실패 분류는 [기준선](baseline.md)에 보존했다. 과거 기록의 수치와 분리한 현재 결과다.

| ID | 기준선 | 실행·기록 방법 | 상태 |
| --- | --- | --- | --- |
| B01 | 환경·코드·데이터 | HEAD/dirty files, Linux·Node/npm 버전, 설치 상태, 데이터 모드·revision·유효시각 기록 | 확보: 환경·자료 고정, DB discovery 예외 기록 |
| B02 | 단위·통합·빌드 | 루트 `npm run check`. 앞 단계 실패로 뒤 명령이 생략되면 backend/frontend 테스트와 build를 각각 실행·기록. 루트 shared/Python/배포 테스트 포함 여부는 A13에서 확인 | 확보: check 통과(backend1skip), 별도 shared/Python/deploy 결과 |
| B03 | 주요 브라우저 흐름 | 아래 표의 계약·현재 fixture·프로젝트를 확인하고 실행. 계약 밖 흐름·skip·실제 엔진을 별도 기록 | 확보: 기본214pass/58fail/85skip, 기관24pass |
| B04 | 프론트 로딩·실행 | production build에서 초기/지연 JS·CSS·자산 크기, 첫 방문/재방문 전송량·요청 수·화면 준비 시간, 지도 반복 조작·메모리 | 측정 완료: 첫/재방문 각5·map idle/switch 각5, 한계 명시 |
| B05 | 서버·자료 처리 | 대표 API 응답시간·크기, 요청 중복, 부모/수집 worker의 CPU·RSS, 파일 I/O·격자 캐시·보존량을 같은 데이터와 작업량으로 측정 | 측정 완료: 대표8 API 그룹·I/O/CPU/RSS, 외부 수집 worker 미측정 |

### 주요 흐름과 검증 출발점

다음은 기존 계약을 찾는 출발점이다. 각 파일이 전체 사용자 흐름을 보호하는지는 RF-001/A13에서 확인한다.

| 흐름 | 기존 계약 또는 확인할 검증 |
| --- | --- |
| 메인 진입·레이어·배경지도·시간축 | `responsive-baseline`, `map-base`, `notam-and-settings`, 관련 weather overlay 계약 |
| 경로 입력·가져오기·편집·브리핑·저장 복원 | `route-token-input`, `route-import`, `route-workflow`, `briefing-view`; 저장 복원은 실제 포함 사례 확인 |
| 공항 상세·예보 모델 비교 | `airport-panel`, `airport-model-comparison` |
| 모니터링·터미널 장시간 화면 | `monitoring-visual`, `monitoring-ground-signage`, `terminal-signage`; 타이머·반복 실행 별도 확인 |
| 기관 라운지·권한·버전 충돌·공동 발표 | `organization-lounge`, `organization-presentation`, 별도 기관 Playwright 설정과 backend 조직 HTTP 테스트 |
| 로그인·개인 저장·알림·관리·시연 | backend auth/me/alerts/organization/dev 테스트, `admin-console`; 브라우저 미포함 경로와 필요한 보완 확인 |

아래는 명령의 형태이며 실제 S004는 runner와 server에 동일한 artifacts DATA_PATH를 주입했다([기준선](baseline.md)). `--list`도 DB fixture를 import하므로 격리 없이 실행하지 않는다.

아래는 명령의 형태이며 실제 S004는 runner와 server에 동일한 artifacts DATA_PATH를 주입했다([기준선](baseline.md)). `--list`도 DB fixture를 import하므로 격리 없이 실행하지 않는다.

실행 예:

```bash
npm run check
node --test shared/*.test.js
npm run dev:contract -- --grep 'responsive-baseline|map-base'
npm run dev:contract -- --grep 'route-token-input|route-workflow|briefing-view'
npm run dev:contract -- --config=playwright.organization.config.js organization-briefing.spec.mjs organization-presentation.spec.mjs
```

실행 환경과 서버 관리 방식은 [개발 서버 안내](../operations/dev-server-and-capture.md)를 따른다. 기존 3001/5173 서버가 있으면 소유자를 확인하고, 관리형 계약 실행을 위해 사람의 서버를 임의로 중단하지 않는다. 기준선 수집은 자동 외부 수집을 끈 로컬 고정 데이터로 시작한다. 실제 외부 자료가 필요한 검증은 데이터 출처와 범위가 다른 별도 실행으로 기록한다.

일반 `ipad-landscape` 결과를 Safari 결과로 부르지 않는다. Safari의 입력·터치·레이아웃에 영향을 주는 작업은 해당 흐름의 WebKit 검증을 준비한다. 관리형 브라우저 실행으로 커버하지 못한 동작은 수동 확인 또는 추가 계약 필요로 표시한다.

### 성능 비교 기록

- 시나리오·코드 기준·production 빌드 옵션·브라우저·기기/CPU·네트워크·데이터 revision·유효시각·지도 레이어·캐시 상태를 고정한다.
- 첫 방문과 재방문을 나눠 동일 시나리오를 원칙적으로 5회 이상 반복하고 표본 수, 중앙값과 범위를 기록한다. 장시간 수집처럼 반복 비용이 큰 경우 횟수와 비교 한계를 명시한다.
- 빌드 산출물의 전체 크기, 첫 화면이 실제 요청한 크기, 압축 전·후 크기를 구분한다. 파일 분리나 번들 경고만으로 사용자 체감 개선을 주장하지 않는다.
- 서버 성능은 초기 실행과 캐시가 채워진 실행, 수집 유무, 부모와 자식 프로세스를 구분한다. 디스크 조사는 읽기 전용으로 시작한다.
- 측정 뒤 해당 작업의 목표와 허용할 회귀 범위를 정한다. 기준값 없이 개선율이나 일괄 목표 수치를 만들지 않는다.

```text
측정 ID / 관련 작업 / 날짜 / 코드 기준:
재현 명령 또는 스크립트와 시나리오:
환경 / 데이터 / 캐시 / 반복 수:
변경 전 수치 / 변경 후 수치 / 편차:
해석 가능한 효과 / 비교 한계:
원시 증거 경로:
```
## S004 통합 발견 원장

같은 원인의 W 발견은 한 OBS로 합쳤다. 후보의 원인·증거 수준·제안·위험·선행·검증·추천과 사용자 선택은 [보고서](report.md)의 연결 카드가 정본이다. 다음 표는 탐색 발견 ID이며 구현 완료를 뜻하지 않는다. 범위가 다른 부분은 카드 안에서 별도 선정 가능하게 표시했다.

| 전역 발견 | 임시 발견·선행 관찰 | 판정·연결 |
| --- | --- | --- |
| OBS-009 | W03-01; 공통 A11 | [RF-100 · 수집기가 이전 실황을 읽는 경계](report.md#rf-100) — 후보/추가 조사, 미선정 |
| OBS-010 | W03-02; W08-B2 | [RF-101 · 해외 예보 취소와 게시](report.md#rf-101) — 후보/추가 조사, 미선정 |
| OBS-011 | W03-06 | [RF-102 · KTG 회차 완료와 부분 파일](report.md#rf-102) — 후보/추가 조사, 미선정 |
| OBS-012 | W01-02/03 | [RF-103 · 브라우저 검사 진입 경계](report.md#rf-103) — 후보/추가 조사, 미선정 |
| OBS-013 | W01-01; W02-10; OBS-006 | [RF-104 · 루트 검사 밖 공통 계약](report.md#rf-104) — 후보/추가 조사, 미선정 |
| OBS-014 | W03-09 | [RF-105 · 전송 timeout의 본문 수명](report.md#rf-105) — 후보/추가 조사, 미선정 |
| OBS-015 | W02-01 | [RF-106 · nginx 직접 서빙과 backend 차단](report.md#rf-106) — 후보/추가 조사, 미선정 |
| OBS-016 | W04-02; W08 monitoring profile | [RF-107 · snapshot 구독·재조회 계약과 NOTAM 갱신 정책](report.md#rf-107) — 후보/추가 조사, 미선정 |
| OBS-017 | W04-01 | [RF-108 · 초기·주기·지연 요청의 완료 순서](report.md#rf-108) — 후보/추가 조사, 미선정 |
| OBS-018 | W04-03; W08-01 | [RF-109 · JSON 본문 실패와 모니터링 초기 복구](report.md#rf-109) — 후보/추가 조사, 미선정 |
| OBS-019 | W06-01/02; W01-04 | [RF-110 · 경로 적용 action과 요청 수명](report.md#rf-110) — 후보/추가 조사, 미선정 |
| OBS-020 | W06-03 | [RF-111 · NWP 갱신 응답과 차트의 시간 정보](report.md#rf-111) — 후보/추가 조사, 미선정 |
| OBS-021 | W06-04 | [RF-112 · 저장된 항로 모델의 갱신·재저장 보존](report.md#rf-112) — 후보/추가 조사, 미선정 |
| OBS-022 | W06-06 | [RF-113 · 개인 브리핑의 자료 없음과 위험 없음 구분](report.md#rf-113) — 후보/추가 조사, 미선정 |
| OBS-023 | W06-05/07 | [RF-114 · 개인 저장·갱신의 추가 정합성 조사](report.md#rf-114) — 후보/추가 조사, 미선정 |
| OBS-024 | W05-02 | [RF-115 · 영상 A→B→A 재선택의 늦은 프레임](report.md#rf-115) — 후보/추가 조사, 미선정 |
| OBS-025 | W05-01/06 | [RF-116 · 내 지도 파일별 식별자와 비동기 삭제](report.md#rf-116) — 후보/추가 조사, 미선정 |
| OBS-026 | W05-04 | [RF-117 · FIR 후설치 자원의 가시성 복원](report.md#rf-117) — 후보/추가 조사, 미선정 |
| OBS-027 | W04-04; W05-05; W07-06 | [RF-118 · 유효시각 원본과 시연 상태 구독](report.md#rf-118) — 후보/추가 조사, 미선정 |
| OBS-028 | W05-03/09 | [RF-119 · 지점 표고 요청의 최신 선택 보장](report.md#rf-119) — 후보/추가 조사, 미선정 |
| OBS-029 | W05-07 | [RF-120 · 개발 KML 뷰어의 지원 목록·종료 수명](report.md#rf-120) — 후보/추가 조사, 미선정 |
| OBS-030 | W02-02/06/07 | [RF-121 · 배포 성공 표식과 프로세스 대상](report.md#rf-121) — 후보/추가 조사, 미선정 |
| OBS-031 | W04-05 | [RF-122 · 설정 저장 실패와 부트 기본값](report.md#rf-122) — 후보/추가 조사, 미선정 |
| OBS-032 | W01-03/04; W05-08; W07-08; W08-C01~07; OBS-005/007 | [RF-123 · 현재 화면과 브라우저 계약의 일치](report.md#rf-123) — 후보/추가 조사, 미선정 |
| OBS-033 | W04 entry; W12-03; B04 | [RF-124 · 독립 화면 진입의 bundle 경계](report.md#rf-124) — 후보/추가 조사, 미선정 |
| OBS-034 | W06 NWP; B05 | [RF-125 · NWP 시간 규칙 경로의 격자 읽기](report.md#rf-125) — 후보/추가 조사, 미선정 |
| OBS-035 | W05 resource ownership; B04 | [RF-126 · 지도 반복 전환의 JS 메모리 추가 조사](report.md#rf-126) — 후보/추가 조사, 미선정 |
| OBS-036 | W07-01 | [RF-127 · 관측 풍속의 단위·결측 정규화](report.md#rf-127) — 후보/추가 조사, 미선정 |
| OBS-037 | W07-02/03 | [RF-128 · 관측 운고의 단위·선별·결측](report.md#rf-128) — 후보/추가 조사, 미선정 |
| OBS-038 | W07-04 | [RF-129 · 모델 원자료 cache의 검증 실패 복구](report.md#rf-129) — 후보/추가 조사, 미선정 |
| OBS-039 | W07-05 | [RF-130 · 모델 비교의 성공 응답 내 partial 상태 표시](report.md#rf-130) — 후보/추가 조사, 미선정 |
| OBS-040 | W09-01/02 | [RF-131 · 기관 경로 자료의 저장·발표 연결](report.md#rf-131) — 후보/추가 조사, 미선정 |
| OBS-041 | W09-03 | [RF-132 · 기관 발표·편집의 버전 충돌 복구](report.md#rf-132) — 후보/추가 조사, 미선정 |
| OBS-042 | W09-04 | [RF-133 · 기관 권한 상실과 비동기 화면 수명](report.md#rf-133) — 후보/추가 조사, 미선정 |
| OBS-043 | W09-05 | [RF-134 · 기관 파일 게시와 실패 정리의 동시성](report.md#rf-134) — 후보/추가 조사, 미선정 |
| OBS-044 | W09-06 | [RF-135 · 기관 알림 복합 입력의 실패 원자성](report.md#rf-135) — 후보/추가 조사, 미선정 |
| OBS-045 | W09-07 | [RF-136 · 기관 분석과 지도 경로의 정체성](report.md#rf-136) — 후보/추가 조사, 미선정 |
| OBS-046 | W08-02/04 | [RF-137 · 터미널의 실황·fixture·부분 실패 경계](report.md#rf-137) — 후보/추가 조사, 미선정 |
| OBS-047 | W08-03/05 | [RF-138 · 터미널 편성 적용과 결측 숫자](report.md#rf-138) — 후보/추가 조사, 미선정 |
| OBS-048 | W08-06 | [RF-139 · 터미널 KST 기준과 운항일 경계](report.md#rf-139) — 후보/추가 조사, 미선정 |
| OBS-049 | W08-07/08/09 | [RF-140 · 모니터링 경보의 시간 진행과 소리 수명](report.md#rf-140) — 후보/추가 조사, 미선정 |
| OBS-050 | W10-01 | [RF-141 · 계정 상태 변경과 기존 세션의 권한](report.md#rf-141) — 후보/추가 조사, 미선정 |
| OBS-051 | W10-02 | [RF-142 · 푸시 설정의 서버 성공과 계정 귀속](report.md#rf-142) — 후보/추가 조사, 미선정 |
| OBS-052 | W10-03/04/07 | [RF-143 · 개인 감시 복제본의 시각·목록·종료 수명](report.md#rf-143) — 후보/추가 조사, 미선정 |
| OBS-053 | W10-05 | [RF-144 · 개인 감시 ETA의 입력과 평가 범위](report.md#rf-144) — 후보/추가 조사, 미선정 |
| OBS-054 | W10-08/09 | [RF-145 · 개인 알림의 감지와 전달·재발 정책](report.md#rf-145) — 후보/추가 조사, 미선정 |
| OBS-055 | W10-10; W04-06 | [RF-146 · 개인 사용자 상태와 알림 딥링크 수명](report.md#rf-146) — 후보/추가 조사, 미선정 |
| OBS-056 | W10-06; W09-08 | [RF-147 · 날짜 입력과 선택 시간대의 일치](report.md#rf-147) — 후보/추가 조사, 미선정 |
| OBS-057 | W10-12; W11-12 | [RF-148 · 예보관 문의의 두 단계 저장·재시도](report.md#rf-148) — 후보/추가 조사, 미선정 |
| OBS-058 | W10-11; W04-05 | [RF-149 · 실제 계정·설정 동작과 사용자 안내](report.md#rf-149) — 후보/추가 조사, 미선정 |
| OBS-059 | W03-03/04/05/07 | [RF-150 · 일반 수집의 게시·실패·조회 경계 후속](report.md#rf-150) — 후보/추가 조사, 미선정 |
| OBS-060 | W02-03/04/05/08/09; W11-12; 공통 A15 | [RF-151 · 도구·설치·문서의 실제 실행 계약](report.md#rf-151) — 후보/추가 조사, 미선정 |
| OBS-061 | W12-01 | [RF-152 · 실제 화면에서 사용하는 미정의 CSS 변수](report.md#rf-152) — 후보/추가 조사, 미선정 |
| OBS-062 | W12-02 | [RF-153 · 공유 WeatherIcon의 스타일 소유](report.md#rf-153) — 후보/추가 조사, 미선정 |
| OBS-063 | W12-04 | [RF-154 · 모달·피커의 키보드와 포커스 계약](report.md#rf-154) — 후보/추가 조사, 미선정 |
| OBS-064 | W12-05 | [RF-155 · 화면 크기 변경과 TAF 표시·safe-area](report.md#rf-155) — 후보/추가 조사, 미선정 |
| OBS-065 | W12-06/07; OBS-004/008 | [RF-156 · 디자인 정본과 자산 출처·배포 고지](report.md#rf-156) — 후보/추가 조사, 미선정 |
| OBS-066 | W11-01/02/04 | [RF-157 · 테스트 변경 API와 수집·운영 시연의 분리](report.md#rf-157) — 후보/추가 조사, 미선정 |
| OBS-067 | W11-03 | [RF-158 · 관리자 조회 실패와 마지막 정상 상태](report.md#rf-158) — 후보/추가 조사, 미선정 |
| OBS-068 | W11-05 | [RF-159 · 시연 snapshot 이름과 활성 세대](report.md#rf-159) — 후보/추가 조사, 미선정 |
| OBS-069 | W11-06/07/08; W03-08 | [RF-160 · 운영 상태의 원본·이벤트 수·평가 대상](report.md#rf-160) — 후보/추가 조사, 미선정 |
| OBS-070 | W11-09 | [RF-161 · 백업 완료 판정과 이전 성공본 보존](report.md#rf-161) — 후보/추가 조사, 미선정 |
| OBS-071 | W11-10/11 | [RF-162 · 운영 자원·기간·시간대 지표의 의미](report.md#rf-162) — 후보/추가 조사, 미선정 |

## 초기 관찰과 유지·제외 판정

| 관찰·추가 원장 | 최종 진단 판정 |
| --- | --- |
| OBS-001/002/003 | server/hook/MapView 크기는 수정 근거가 아니었다. 실제 consumer와 상태 경계의 RF-100~150에 좁혀 연결. 세 파일의 일괄 분할은 이번 추천에서 제외 |
| OBS-004 | legacy CSS는 현재 monitoring consumer가 존재한다. undefined token/shared style/CSS order는 RF-152/153/124; 크기 기준 삭제·일괄 CSS Modules 전환 제외 |
| OBS-005 | 실제 순수/HTTP/상태 검증은 유지(W01-05). 문자열 검사가 놓치는 전이만 RF-123/110/132/146에서 보완 후보 |
| OBS-006/007 | discovery 누락과 engine/scope 차이를 현재 실행으로 확인. RF-103/104/123 및 baseline에 연결; skip을 pass로 바꾸지 않음 |
| OBS-008 | Wanted 자체호스팅/lazy/dedup·Pretendard 생성과 고지 유지. 현재 n=5 전송을 새로 측정했고 폰트 재최적화 제외. RF-156은 별도 정본/원본 기록 |
| OBS-090 · W06-08/W07-07 | 공통 routeModel·기관 exact resource와 provider별 모델 추정·TAF BECMG 두 소비 의미를 유지. 계산/표시 이름만 같다고 하나로 합치지 않음 |

## S009 구현 결과 연결

S009에서 OBS-015~018, OBS-030~032, OBS-059~060, OBS-066~071에 연결된 선정 카드의 구현·검증을 마감했다. 이는 S004의 관찰 근거나 다른 OBS의 `미선정` 판정을 삭제하는 변경이 아니며, 카드별 범위·실제 dispatch·제한은 [S009 실행 카드](tasks.md#s009-선정-실행-카드)에 있다. RF-123의 전체 browser 기준선은 새 전체 pass로 바꾸지 않는다: 집중 결과와 fixture/contract 분류만 기록했고, 전체 run 및 모바일 route-token 최종 묶음은 중단 상태다.
| OBS-091 · W01-05/W02-07/08/10 | 의미 있는 순수·HTTP 테스트, 배포 lock/staging, 실제 수동 도구·생성기 소비 유지. 모든 테스트/도구 재작성 제외 |
| OBS-092 · W05-Q1~Q8/W08 잔여 질문 | 실제 source identity/빈 자료/미완료 promise·타이머/날짜/사용처 질문은 후속 W-02로 보존. 지금 runtime 결함이라고 추가 확정하지 않음 |
| OBS-093 · 공통 A15/W12 | prototypes/design-test/graphify/navdata/AIP의 생성·참조 목적 유지. public 정적 prototype와 직접 URL/원본 고지는 추가 조사. 이름·size·src 검색미발견만으로 삭제 제외 |

후속의 ID·조건·완료 기준은 [tasks 추가·후속 조사](tasks.md#추가후속-조사), 실제 세션 재개는 [progress](progress.md)에서 관리한다. 이번 사용자 요청은 진단까지이며 잔여 질문을 핑계로 승인 없이 구현하지 않는다.
