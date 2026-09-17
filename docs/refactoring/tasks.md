# 리팩토링 작업 목록

작업 상태의 기준 문서다. 범위와 근거는 [진단표](audit.md), 최신 세션의 다음 행동은 [진행 기록](progress.md)을 참고한다.

## 상태

- `pending`: 선행 작업 또는 범위 정의가 남음.
- `ready`: 범위·완료 조건·선행 조건이 확인돼 착수 가능.
- `in_progress`: 조사·구현·검증 중. 검증 대기는 완료가 아니다.
- `blocked`: 구체적인 외부 조건 때문에 해당 작업을 진행할 수 없음. 원인·재개 조건 필수.
- `done`: 해당 카드의 완료 조건을 충족하고 결과가 기록됨.
- `deferred`: 이번 회차에서 제외. 사유·재검토 조건 필수.

다음 작업은 ID 순서가 아니라 의존성과 준비 상태로 정한다. 개별 개선 작업의 번호는 RF-100부터 추가하며, 아래 회차 관리 항목의 완료와 개별 구현 완료를 구분한다.

## 회차 관리 작업

| ID | 작업 | 의존성 | 상태 | 완료 조건 |
| --- | --- | --- | --- | --- |
| RF-000 | 전체 계획·지속 기록 체계 | 없음 | done | 네 문서와 공통 진입 링크, 문서 검증, 재개 지점 기록 |
| RF-001 | 환경·현재 검증 기준선 | RF-000 | done | B01~B03에 명령·코드/자료 기준·실제 결과·기존 실패/skip/미실행 사유 기록 |
| RF-002 | 전체 범위 구조·데이터·도구 진단 | RF-000 | done | A01~A15의 추적 파일 범위 분류, 영역별 근거·유지/개선/추가 확인 판정, 누락 보완 |
| RF-003 | 대표 성능 경로 측정 | RF-001의 환경 확인, RF-002의 시나리오 선정 | done | B04/B05의 재현 가능한 수치와 미측정 범위·사유, 비용이 큰 경로 후보 |
| RF-004 | 진단 보고·사용자 작업 대상 선정 — **S007·S008 선정 기록 완료** | RF-001~003 결과 | done | 근거·효과·위험·의존성·추천 순서를 제시한 뒤, 사용자가 선택한 실제 작업 ID·범위·순서·지시 날짜 기록 |
| RF-005 | 첫 개선 묶음 완료·평가 — **RF-103 구현·브라우저 확인 완료** | RF-004, 선정한 개별 카드 | done | 첫 카드의 구현·검증·효과 확인, 이후 작업 방식에 반영할 결정 기록 |
| RF-006 | 선정한 나머지 개선 — **RF-157/100/101/102 작업별 검증 완료** | RF-005, 개별 카드의 의존성 | done | 모든 선정 카드의 검증 완료 또는 이유·재검토 조건이 있는 범위 조정 |
| RF-007 | 전체 회귀·성능 비교·문서 인계 — **S007 선정 범위 통합 검증 완료** | RF-006 | done | S007 선정 범위의 전체 검사·영향 브라우저 결과·문서 인계와 명시적 미실행 한계 기록 |

한 단계의 일부 환경 제한은 RF-004에 근거를 남겨 해당 결과가 필요 없는 작업과 분리한다. 미실행을 통과로 바꾸거나 확인하지 않은 영역을 완료로 바꾸는 방식으로 의존성을 해제하지 않는다.

## RF-001: 기준선 확보 절차와 재검증 조건

- 범위: 실행 환경, 현재 테스트/빌드 결과, 대표 브라우저 흐름의 현재 결과를 기록한다. 구조 변경은 포함하지 않는다.
- 기준 변경 시 시작: `git status --short`, `git rev-parse HEAD`, `.nvmrc`, 실제 `node --version`/`npm --version`, 설치 상태와 사용 중 포트 확인.
- 검증: [진단표의 B01~B03](audit.md#기준선과-검증-범위)에 따라 검사한다. 루트 명령에서 실행되지 않는 테스트 그룹이 있는지도 확인한다.
- 기록: 기존 실패는 재현 명령·증상·영향 범위를 남긴다. 필요한 수정은 별도 카드로 등록하고 진단 작업에 섞지 않는다.
- S004 결과는 [기준선](baseline.md)에 보존했다. 코드·자료·검증 범위 변화가 없으면 새 세션이라고 반복 실행하지 않는다. 남은 skip/실패/미실행 중 선정한 작업에 필요한 부분만 재확인한다.

## RF-002: 전체 진단의 순서

1. A01/A14/A15: 추적 파일·진입점·설치/빌드/운영 경로를 분류하고 문서와 코드를 대조한다.
2. A10/A11: 외부 수집 → 정규화 → 저장·캐시 → API → 화면 소비 경로의 공통 규칙을 조사한다.
3. A02~A09: 주요 사용자 흐름별 상태·요청·의존성을 조사한다. 개인/기관 브리핑, 지도, 모니터링·터미널도 포함한다.
4. A12/A13: 각 흐름의 UI/CSS·자산과 테스트 범위를 대조한다. 앞선 조사에서 발견한 교차 문제를 합친다.
5. 모든 영역에 유지할 구조, 개선 근거, 남은 확인을 기록하고 RF-003/RF-004에 전달한다.

이 순서는 조사 경로이며 구현 우선순위가 아니다. 아래 독립 묶음은 서로 병렬로 진행할 수 있다. 완료한 영역은 이후 관련 변경이 있을 때만 다시 확인한다.

## RF-002 서브에이전트 조사 묶음

각 Wxx의 전체 ID는 `RF-002-Wxx`다. Wxx는 에이전트 이름이 아니라 세션을 넘어 유지되는 조사 작업 ID이며, 상태·완료 조건은 위의 상태 정의를 따른다. S004에서 W01~W03을 최초 배정했다. 실제 이력은 진행 기록과 S004 증거에 보존한다. RF-002 착수 시 주 담당이 기준 코드·범위·질문을 전달한 묶음을 `ready`/`in_progress`로 전환한다.

| 묶음 | 조사 영역 | 배정할 핵심 질문과 산출물 | 선행 입력 | 상태 |
| --- | --- | --- | --- | --- |
| W01 | A13 테스트 | 검사 명령이 어떤 테스트·흐름·엔진을 실행하는가? 정적 검사와 동작 검사의 경계, 누락 후보, 대표 실행 목록 | 기준 코드·진입점 목록 | done |
| W02 | A14 개발·빌드·배포 도구 | package/lock·스크립트·설정의 실제 사용 경로는 무엇인가? 중복/미사용 가설의 소비자 근거와 설치·배포 영향 | 기준 코드·추적 파일 목록 | done |
| W03 | A10 수집·저장·캐시 | 수집 등록부터 검증·게시·API 조회까지 소유자는 누구인가? 수집 방식별 목록, 락/취소/부분 실패 경계와 깊게 확인할 후보 | 기준 코드·진입점 목록 | done |
| W04 | A02 앱·요청·설정 | 초기/주기/화면 진입 요청의 소유자와 상태 원본은 무엇인가? 폴링·취소·타이머·저장 설정의 소비 경로 | 주 담당의 A01 분류 | done |
| W05 | A03 지도·도구·오버레이 | 지도 자원·이벤트·가시성·시간축을 누가 소유하는가? 기능별 자원 목록과 스타일 전환·정리 경로 | A01 분류와 지도 정책 | done |
| W06 | A04 경로·브리핑 | 편집·적용·저장/복원·기상 요청의 원본과 상태 전이는 무엇인가? 프론트→서버→지도 소비 경로, 개인/기관 경계 질문 | A01 분류와 브리핑 자료 계약 | done |
| W07 | A05 공항·모델 비교 | 관측/예보의 변환·UTC 정렬·표시·재조회에서 같은 규칙의 소유자가 일치하는가? 공통화 가능성과 의도적인 차이 | A01 분류, W03/W04의 관련 계약 메모 | done |
| W08 | A06 모니터링·터미널 | 메인과 공유하는 폴링·날씨 표시, 화면 전환·운항 데이터의 책임은 어디에 있는가? legacy 소비자와 반복 실행 검증 목록 | A01 분류, W04의 폴링 계약 메모 | done |
| W09 | A07 기관 라운지 | 기관 문맥·버전·고정 자료가 API/저장/지도/PDF까지 유지되는가? 공동 브리핑과 개인 기능의 경계 | A01 분류, W06의 개인/기관 경계 메모 | done |
| W10 | A08 계정·개인 저장·알림 | 세션·DB·개인 저장·알림의 계약과 실패/재시도 소유자는 누구인가? 권한·중복 처리의 확인/미확인 범위 | A01 분류 | done |
| W11 | A09 관리자·시연·운영 도구 | 실황/시연·유효시각·관리자 접근·백업과 관측 지표의 경계는 무엇인가? 현재 흐름과 문서 차이 | A01 분류, W03의 게시·조회 계약 메모 | done |
| W12 | A12 UI·CSS·자산 | 스타일·토큰·자산 생성/배포의 실제 사용처는 어디인가? 화면 간 중복, 생성/벤더 제외, 반응형 검증 후보 | A01 분류, W04/W07/W08/W09의 화면 목록 | done |

주 담당이 A01(전체 구조·누락 분류), A11(시간·상태·자료의 공통 계약), A15(문서·프로토타입·기타 추적 파일)를 직접 맡는다. W01~W12와 합쳐 A01~A15 전부를 포함한다. 다른 조사자가 관련 코드를 읽더라도 해당 영역의 최종 판정 책임은 이 배정을 따른다.

최초 실행은 주 담당의 B01·A01 기본 목록 확보 후 W01/W02/W03 세 묶음이다. 그동안 주 담당은 RF-001 검사와 A11/A15 조사를 진행한다. 이후 W04~W06, W07~W09, W10~W12 순으로 배정을 검토하되 필요한 입력이 있는 독립 묶음은 빈 슬롯에서 먼저 시작할 수 있다. 선행 입력은 관련 계약 메모이며 선행 영역 전체의 완료를 기다릴 필요는 없다.

W03/W05처럼 범위가 큰 영역은 첫 보고에서 기능별 목록·대표 경로·미확인 구간을 명시한다. 한 번의 배정으로 조사 범위를 다 확인하기 어렵다면 `RF-002-W05-02`처럼 후속 ID를 만들어 아래 표에 추가하고 남은 질문을 한정한다. 대표 사례만 확인한 결과를 영역 전체의 조사 완료로 처리하지 않는다.

### 추가·후속 조사

아래는 조사 범위를 줄여 반환한 **구체적 후속 질문**이다. 모두 `deferred`이며 사유는 이번 회차를 사용자 선택용 진단까지로 제한했기 때문이다. 재개 조건은 사용자가 해당 후보의 `추가 조사` 또는 이를 포함한 작업을 선택하거나, 관련 코드·데이터 근거가 바뀌는 경우다. 이미 확인한 전체 묶음을 다시 시작하지 않는다. 상세 입력/예상 효과/위험은 연결 보고서에 있다.

| 후속 ID | 영역·선행 입력 | 범위와 완료 조건 | 상태 |
| --- | --- | --- | --- |
| RF-002-W01-02 | A13 · baseline/W01 | RF-123 실패별 현행 계약과 fixture의 타당성 판정. FPL DOTOL2P pill 소실과 WebKit profile terrain request 경로를 각각 한 fixture로 재현. QCD 실자료·prototype 검사는 자료/별도build 확보 때만 | deferred |
| RF-002-W02-02 | A14 · W02 | nginx binary 공개/캐시 실제 응답, clean install 선택 engine/Python, 점유포트 launcher, 2build old-tab 수명 중 선정 부분만 재현하고 소유·실패 cleanup 확인 | deferred |
| RF-002-W03-02 | A10 · W03/RF-150 | parse-null/유효empty/전체실패·stale/hash·일반파일 중단·온디맨드 호출의 차이. 선정 producer별 latest/API/consumer와 실제 원문 대조, 전체35수집 재조사 아님 | deferred |
| RF-002-W04-02 | A02 · W04/RF-107~109/122/146 | NOTAM 초기전용 정책 결정, defaults 초기복구·storage throw·개인 late intent의 남은 UI 조건. 재현된 공통 polling 경쟁은 다시 전수 조사하지 않음 | deferred |
| RF-002-W05-02 | A03 · W05 Q1~Q8/RF-126 | 유효empty lightning, image/map 수명, GeoJSON identity, popup clock, cancel promise, draw timer, typhoon 활성중재조회, 같은tm 다른image 중 선정 부분. 지도메모리는 plateau/unmount/retainer 소유자 확인 | deferred |
| RF-002-W06-02 | A04 · W06/RF-110~114 | 대안action 인자·현재기상 commit·NWP envelope의 실제 UI, 저장대안 의도와 개인 unknown/provenance 계약. routeModel 소실은 기존 재현을 입력으로 사용 | deferred |
| RF-002-W07-02 | A05 · W07/RF-127~130 | 검증된 AMOS/wind 원문·unit 계약, VV/최저cloud·NSC/결측 oracle, 같은run raw오류→수정 재수집,200partial UI. 모델별 정상 추정·BECMG 차이는 유지 | deferred |
| RF-002-W08-02 | A06 · W08/RF-137~140 | multi-frame rail 편성·poll역순·fixture출처·KST/운항일·clock-only 경보·sound취소·A→B→A cooldown·slideshow IO 중 선정 조건만 검증 | deferred |
| RF-002-W09-02 | A07 · W09/RF-131~136 | 파일2요청 barrier, 다중창403/409·session전환, route자료 actualUI·A/Bgeometry candidate/apply. 메모리DB 재현3건은 입력으로 보존 | deferred |
| RF-002-W10-02 | A08 · W10/RF-141~149 | cookie 상태회수/PushManager 등록·실패전달·계정응답세대·알림재발/종료·TZ·문의retry의 선택 조건만 확인. 감시시각/상한/invalidETA는 기존HTTP 재현 입력 | deferred |
| RF-002-W11-02 | A09 · W11/RF-100/118/141/148 | 관리자/시연/백업의 반환된 구체 후보·운영정책·실제restore 경계를 선정 후 확인. 운영 데이터/발송/시연조작은 별도 범위 명시 필요 | deferred |
| RF-002-W12-02 | A12 · W12/RF-124/152~156 | 소비상태 computed CSS·WeatherIcon·모달keyboard, 회전/PWA inset, 고지 실제배포/원본/직접URL의 선정 범위만 확인. 모든glyph/자산/selector 전수검증으로 확대하지 않음 | deferred |
| RF-002-COMMON-02 | A01/A11/A15 · common/Wxx | 동적import/CJS/glob의 구체 경계, source별effective-now/단위 예외·public prototype 제공 의도·navdata원본 중 선택 질문. 현재2248파일 분류/601graph 재실행은 기준변경 때만 | deferred |

### 조사 배정문과 반환 형식

다음 형식을 배정 시 채운다. 정책의 해석이나 누락된 계약은 주 담당도 관련 원문을 확인한다.

```text
작업 ID / 연결 영역:
기준 HEAD·관련 미커밋 변경 / 앞선 확인 결과:
읽을 AGENTS.md·정책 / 시작 파일·소비 경로 / 조사 질문(1~3개):
허용 범위: 읽기 전용. 파일 변경·추가 에이전트 생성·서버/수집/전체 검사 실행 없음.
소유 경계: 다른 영역의 내부는 필요한 계약만 추적하고 깊은 후속 질문을 반환.
반환:
  확인한 파일·진입점·소비자·실행 흐름과 조사 범위
  발견별 임시 ID(예: W05-01), 파일:줄·심볼·호출자 근거
  확인된 사실 / 가설 / 미실행 검증의 구분
  유지할 구조와 이유 / 후보의 효과·위험·필요 선행 작업
  관련 테스트와 필요한 재현·측정 방법
  확인하지 못한 경로, 충돌하는 해석, 다음 좁은 질문
  실제 명령·실행 결과(미실행이면 미실행), 중간 재개 위치
완료: 할당 질문의 근거 있는 답 또는 부분 확인 범위·남은 질문을 반환.
```

보고서 반환 후 주 담당이 검수·문서 반영을 마치면 묶음을 `done`으로 표시한다. 범위를 줄여 부분 결과로 닫는 경우 남은 범위를 후속 묶음으로 연결하고 영역 상태는 `부분 확인`으로 유지한다. 임시 발견 ID를 전역 OBS ID와 연결하는 작업도 주 담당이 한다.

## RF-004 진단 보고와 사용자 선정

**S007·S008·S009 사용자 선정 기록 완료.** 보고서 작성과 추천만 완료된 이전 상태와 실제 선정 기록을 구분하며, 이 기록으로 RF-004를 `done`으로 전환했다. 구현 완료는 각 실행 카드에서 별도로 관리한다.

| 순서 | 선택 카드 | 이번 부분 범위 | 선택 |
| --- | --- | --- | --- |
| 1 | RF-103 | runner/server의 격리 `DATA_PATH`, 명시적 계정 fixture 생명주기, discovery 무변경, 기관 spec 선택 범위 | 이번에 작업 |
| 2 | RF-157 | 서버 test mutation gate만. 실행 모드·명시 플래그·격리 DB·인증 조건을 수집 비활성화와 분리 | 이번에 작업 |
| 3 | RF-100 | 수집기의 이전 실황 읽기 API와 카드에 적힌 일곱 호출자. 화면 active 읽기는 유지 | 이번에 작업 |
| 4 | RF-101 | 해외 예보 취소의 게시·부분 성공·통계·lock 해제. RF-100 뒤 같은 파일을 순차 수정 | 이번에 작업 |
| 5 | RF-102 | KTG 회차 usable/complete 판정과 구형 자료 호환·부분 파일 재시도. 타 모델 저장 형식 통합 제외 | 이번에 작업 |

이번 선정 밖의 후보는 기존 `미선정`/`deferred` 상태를 유지한다. RF-157의 UI capability와 overlay/reset/tick 전체 개편은 이번 선정에 포함하지 않는다.

**S008 선정:** 2026-09-12 사용자 지시에 따라 아래 세 항목을 새 구현 묶음으로 `이번에 작업`으로 선정했다. 이는 완료 판정이 아니다. S007의 다섯 카드 및 그 통합 검증은 보존하며, S008 결과는 각 카드의 실제 결과·검증란에만 반영한다.

| 순서 | 선택 카드 | 이번 부분 범위 | 선택·현재 상태 |
| --- | --- | --- | --- |
| 1 | RF-104 | `package.json`의 root check 연결과 root-checks 정책에 명시한 공통·오프라인 검사 범위. `react-icons/md` 의존성이 없는 prototype 별도 build는 기본 `check`에 넣지 않음 | 이번에 작업 · 구현·검증 완료 기록 있음 |
| 2 | RF-105 | transport deadline을 header 수신 뒤 body 완료/abort까지 유지하는 범위와 해당 timeout·cleanup 회귀 검사. retry 정책 확대는 제외 | 이번에 작업 · 구현·검증 완료 |
| 3 | RF-106 | nginx 직접 정적 서빙과 backend 차단의 URL·cache 계약을 대조하는 한정 범위. 운영 배포·전체 binary 일괄 차단·실운영 노출 판정은 제외 | 이번에 작업 · 정적 계약 구현 완료, nginx runtime 검증 제한 |

S008의 실제 배정과 결과는 RF-104 `gpt-5.6-terra` / `medium` (`ctx_b70e57ee1f86`, 완료), RF-105 `gpt-5.6-terra` / `high` (`ctx_649f6ea661ee`, 완료), RF-106 `gpt-5.6-terra` / `high` (`ctx_9009f1d6850d`, 정적 계약 구현 완료)이다. 기록은 `gpt-5.6-terra` / `medium` (`ctx_a55eb47b0beb`)이 맡았고, 최종 통합은 Codex `gpt-5.6-terra` / `high` (`task_dd3d022e33e4` / `ctx_780946f4e392`)에서 최신 전체 diff와 격리 검사를 대조했다. RF-106의 nginx runtime 검증은 완료로 전환하지 않으며, 그 제한과 재개 조건은 카드에 별도 보존한다.

**S009 선정:** 2026-09-12 사용자 지시에 따라 아래 전체 1단계를 실제 구현 대상으로 선정했다. 이 표의 `이번에 작업`은 사용자 선택 사실만 뜻하며, 카드별 구현·검증·통합 결과 또는 nginx runtime 검증 완료를 미리 판정하지 않는다. S007·S008의 선택·완료 기록은 보존하고, S009의 결과는 아래 실행 카드와 해당 개별 카드에 실제 영수증·검증 근거가 생긴 뒤에만 기록한다.

| 순서 | 선택 카드 | 이번 부분 범위 | 선택·현재 상태 |
| --- | --- | --- | --- |
| 1 | RF-106 | nginx가 설치된 동등 config·active data 환경에서 `nginx -t`, raw CTPS/Echo Top 404, 공개 WebP/GeoJSON 200·immutable, metadata no-cache, DB/organization-file 404와 live/demo 전환을 확인하여 runtime 검증을 마무리 | `done` · runtime 검증 완료 |
| 2 | RF-123 | 기존 기본 브라우저 58 fail을 원인·fixture·engine/viewport별로 정렬하고, 현재 화면 계약과 필요한 기대값·재현을 일치 | `done` · 범위 내 계약 정렬 완료, 전체 browser 재실행은 제한으로 별도 |
| 3 | RF-107 → RF-109 | snapshot 구독·재조회/NOTAM 정책, 초기·주기·지연 요청의 완료 순서, JSON 본문 실패·모니터링 초기 복구를 공유 hook 계약으로 순차 처리 | 모두 `done` |
| 4 | RF-121 → RF-122 | 배포 성공 표식·프로세스 대상 판정, 설정 저장 실패와 부트 기본값 복구 | 모두 `done` |
| 5 | RF-150 → RF-151 | 일반 수집의 게시·실패·조회 계약, 도구·설치·문서의 실제 실행 계약 | 모두 `done` |
| 6 | RF-157 | S007 서버 test-mutation gate 완료 범위 밖의 UI capability 및 overlay/reset/tick | `done` · S007 서버 gate와 구분해 UI/시연 범위를 완료 |
| 7 | RF-158 → RF-162 | 관리자 마지막 정상 상태, 시연 snapshot/활성 세대, 운영 상태·백업·자원/기간/시간대 지표 | 모두 `done` · RF-158/160/162의 backend·frontend 연결까지 확인 |

S009의 선행 순서는 위 표의 행 순서다. RF-107~109, RF-121~122, RF-150~151, RF-158~162는 같은 묶음 안에서도 왼쪽 ID부터 순차 통합한다. 공유 파일은 선행 카드의 diff·검증·파일 소유권 인계가 기록되기 전에는 다음 카드가 수정하지 않으며, 공통 파일 충돌은 주 담당이 한 번에 통합한다. 3001/5173 개발·브라우저 포트와 공용 `DATA_PATH`·`TMPDIR`·Playwright 출력은 한 실행만 소유하고, 다음 실행은 종료·정리 영수증 뒤에 시작한다.

### S009 실제 구현·배정·마감 판정

모든 실제 구현·검토·검증 배정은 Codex `gpt-5.6-terra`의 `medium` 또는 `high`였고 상향은 없었다. dispatch 영수증은 배정 사실만, 카드의 `done`은 현재 diff와 관련 검증까지 대조한 결과만 뜻한다.

| 카드 | 실제 결과와 검증 | 배정·추론 |
| --- | --- | --- |
| RF-106 | nginx 1.28.3 `nginx -t`, 직접 HTTP, raw CTPS/Echo Top 404, 공개 frame 200/cache, metadata no-cache, DB/organization 차단과 live/demo 전환 완료. | `ctx_3cb5362fdc2a` / high |
| RF-107~109 | snapshot 구독·epoch/완료순서·JSON 실패 복구를 구현; 전용 Chromium 계약 5 pass. | Terra medium/high, 상향 없음 |
| RF-121~122 | 배포 success marker/대상과 설정 저장 실패 뒤 부트 기본값 복구를 구현·관련 검사로 확인. | Terra high, 상향 없음 |
| RF-123 | FPL 계약 1 pass, terminal 69건과 ground 8건, monitoring visual 8건을 집중 확인했다. fixture/contract drift를 정렬했고 RF-151 fixture HTTP/shell 및 준비된 Playwright 계약도 확인했다. | Terra medium/high, 상향 없음; 후속 정리 `task_105c1b9d29dc` |
| RF-150~151 | 일반 수집의 게시·실패·조회와 설치/도구/문서 실행 경계를 구현·검증했다. | RF-150 `ctx_6d5e963ab372`, RF-151 `ctx_991469cc998d` / high |
| RF-157 | 서버 gate와 별개인 UI capability·overlay/reset/tick 범위를 구현·검증했다. | Terra high, 상향 없음 |
| RF-158~162 | 관리자 last-good, snapshot 세대, health/evaluation, backup 완료 세대, metric 기간·시간대의 backend와 frontend 연결을 완료했다. | RF-158 `ctx_3e712226b47f`, RF-159 `ctx_54abd3583492`, RF-160/162 `ctx_4d86635b9961`, RF-161 `ctx_a5bb436d04a6`, 보완 `ctx_6e5148cfa5ed` / high |

최종 `npm run check`은 격리 `DATA_PATH`/`TMPDIR`, `DISABLE_COLLECTION` unset에서 exit 0이었다. 원본 DB SHA-256 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62`, `git diff --check`, `AGENTS.md`= `CLAUDE.md`, 3001/5173 정리를 함께 확인했다. 전체 browser run은 마지막 세 수정 전에 시작했다가 독립 검토 결함으로 중단했고, 사용자의 과검증 중단 지시 뒤 수정 후 재실행하지 않았다; 모바일 route-token 최종 묶음도 중단되어 전체 통과에 산입하지 않는다. 수정 파일은 저장됐으며 이 제한은 `npm run check` 통과와 구분한다.

S005에서 보고서 앞부분에 [프로젝트 구조 종합평가와 리팩토링 방향](report.md#프로젝트-구조-종합평가와-리팩토링-방향)을 보완했다. 디렉터리·의존성·초기 세 파일의 책임 분리 판단과 유지할 구조를 기존 후보·근거에 연결했다. 보고서 보완 요청은 구현 대상 선정이 아니며, 후보 63개와 미선정 상태는 유지한다.

보고서는 개별 후보마다 다음 항목을 담고, 전체 구조의 종합평가와 영역별 유지/개선/미확인 판정도 함께 제시한다.

| 후보 ID | 확인된 문제·원인과 근거 | 제안 변경·영향 범위 | 예상 효과 | 위험·선행 작업·검증 | 추천 | 사용자 선택 |
| --- | --- | --- | --- | --- | --- | --- |

후보의 원인과 개선 효과를 아직 확인하지 못했다면 미검증 가설 또는 추가 조사로 표시한다. 추천과 사용자 선택을 별도 칸으로 관리하며, 선택은 `이번에 작업 / 보류 / 제외 / 추가 조사`로 기록한다. 새 후보와 기록 형식만 준비됐다는 사실은 구현 착수 조건이 아니다.

선정 후 선택한 작업 ID·범위·순서·사용자 지시 날짜를 이 절에 남기고 해당 카드에 연결한다. 선행 작업도 선택 범위에 포함되는지 명확히 한다. 같은 범위의 구현·검증은 재확인을 반복하지 않는다.

## 구현 난도별 모델과 실행 규모

2026-09-12 사용자 지시: 토큰 사용을 고려해 실제 난도에 맞춰 배정한다. 앞서 제안한 Astra/Sol 중심의 상시 구현·별도 검토 구성은 기본안으로 사용하지 않는다. **기본 구현은 `gpt-5.6-terra` / `medium`**, 상태·공통 계약이 복잡한 부분만 `high`로 배정한다. P1은 영향과 우선순위이며 구현 난도나 상위 모델 사용 조건이 아니다. 아래 난도는 기존 진단을 바탕으로 한 초기 판단이고 실제 모델별 구현 성능을 측정한 결과는 아니다.

| 난도·조건 | 예시와 범위 | 배정 기준 |
| --- | --- | --- |
| 낮음~보통: 원인·기대 동작·수정 경계가 명확 | RF-101의 합의된 취소·게시 처리, RF-109의 본문 실패 처리, RF-153의 공용 기본 스타일 소유 | Terra / medium. 관련 소비자와 실패·정상 회귀는 확인 |
| 보통: 여러 호출자·실행 단계·호환 조건을 함께 맞춤 | RF-100의 live 읽기 API·호출자, RF-102의 KTG 완료 기준, RF-103의 runner/fixture 격리, RF-157의 서버 gate 한정 범위 | Terra / high. 먼저 유지 계약을 고정하고, 권한·자료 보존은 주 담당이 변경과 검증 근거를 직접 검토 |
| 보통~높음: 상태 전환·비동기 순서·여러 소비자 결합 | RF-108 폴링, RF-110 경로 적용, RF-112 저장 모델, RF-124 진입점·CSS 분리 | Terra / high로 좁은 작업을 시작. 계약 충돌이나 해결되지 않은 회귀가 남으면 해당 질문만 Sol / high로 상향 |
| 높음 또는 미정: 원인이 아직 불명확 | RF-126 메모리 유지 원인, RF-134 파일 게시 경합 등 선정된 추가 조사 | 재현·측정 자료를 먼저 확보하고 Sol / high로 원인 분석. 그 뒤에도 여러 경계의 해석이 해결되지 않을 때만 Astra / high를 좁은 분석·검토에 사용 |

- **주 담당:** 다음 구현 세션의 비용을 고려한 추천은 Sol / medium이며 복잡한 통합 판단에만 high를 사용한다. 현재 대화의 실행 모델을 변경했다는 의미는 아니다. 이번에는 프로젝트 배정 정책만 기록하며 전역 Codex 설정은 변경하지 않는다.
- **에이전트 수:** 작은 작업은 주 담당 단독, 위임할 독립 작업이 있으면 서브에이전트 1명을 기본으로 한다. 파일·계약이 독립적이고 주 담당도 별도 유용한 작업을 수행할 때만 2명으로 늘린다. 최대3명은 상한이며, 세 번째는 특정 변경에 독립 검토가 필요할 때만 잠시 사용한다. 상시 검토 전담을 두지 않는다.
- **상향 조건:** 재현 자료를 확보한 뒤에도 계약 해석이 충돌하거나 같은 원인의 수정·검증이 반복해서 실패할 때, 원인 분석에 필요한 모델만 높인다. 자료·환경·제품 의도 부족은 모델을 높이는 것으로 해결됐다고 보지 않는다. 상향 이유·모델·추론 강도를 실행 카드에 남긴다. xhigh/max/ultra는 기본값으로 쓰지 않는다.
- **중복 비용:** 전체 대화·63개 후보를 매번 전달하지 않고 선택 카드, 관련 정책·파일, 재현 입력, 유지 조건과 완료 기준만 전달한다. 재작업은 기존 diff와 실패 근거부터 이어간다. 주 담당은 결과·핵심 diff·검증 근거를 확인하며 완료된 탐색을 반복하지 않는다.
- **검증:** 작은 변경마다 관련 검사부터 수행하고, 묶음 통합 때 필요한 전체 검사·브라우저를 순차 실행한다. 이미 통과한 검사는 새 변경·실패·미해결 우려가 있을 때만 반복한다. 토큰 절감을 이유로 데이터 보존·권한·동작 회귀 검증을 생략하지 않는다.

모델 구분은 2026-09-12 확인한 공식 [Terra](https://developers.openai.com/api/docs/models/gpt-5.6-terra), [Sol](https://developers.openai.com/api/docs/models/gpt-5.6-sol), [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra) 안내와 현재 배정 가능 목록을 참고했다. 구체적인 역할·추론 강도는 이 프로젝트에 대한 배정 판단이다. 이 정책 변경은 구현 대상 선정이 아니며, RF-004의 실제 선택은 별도로 기록한다.

## S007 선정 실행 카드

공통 기준 HEAD는 `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41`이며, S001~S006의 문서 변경과 로컬 자료를 보존했다. 커밋·푸시·배포는 하지 않았다. 주 담당은 공통 문서, 핵심 diff, 자료 보존·권한 경계, 공유 포트와 통합 검증을 조율했다. 아래 결과는 S007에서 사용자가 선정한 다섯 범위의 완료 근거이며, 전체 357건 브라우저 매트릭스와 성능 재측정은 이 변경 범위 밖의 기존 기준선으로 구분한다.

| 실제 배정 | 모델·추론 | task / dispatch | 이 문서 작성 시점의 확인 상태 |
| --- | --- | --- | --- |
| RF-102 구현 | `gpt-5.6-terra` / `high` | `task_4cc9cfccf6c8` / `ctx_d332bf2bf6ac` | 반환·주 담당 diff 재확인 및 집중 검사 7/7 통과 확인 |
| RF-100/101 독립 검토 | 1차 `gpt-5.6-terra` / `high`, 재시도 `gpt-5.6-terra` / `high` | 1차 `ctx_e17c3c9280d3`은 `consumer_fenced`; 재시도 `ctx_1ed0e757da74` | 재시도 성공, 관련 72 tests 통과; live 읽기·취소 게시·lock 해제 계약을 승인 |
| S007 브라우저 검증 | `gpt-5.6-terra` / `medium` | dispatch `ctx_7c416a8ccab5` | `admin-console` 30 pass, 기관 두 spec 24 pass / 0 fail / 0 skip; 격리 DATA_PATH teardown 및 3001/5173 정리 완료 |
| S007 문서 마감 | `gpt-5.6-terra` / `medium` | `task_3b1afc21edaf` / `ctx_2b45d762c5cf` | 실행 카드와 진행 기록의 사실 정리 완료; 코드·테스트·설정 변경 없음 |
| S007 최종 통합 | Codex `gpt-5.6-terra` / `high` (requested=effective) | `task_594ff9ac3c6b` / `ctx_c90c33a1b1ac` | 지정 격리 경로에서 `npm run check` exit 0, 문서·DB·포트·임시자료 최종 판정 완료 |

### RF-103 · 브라우저 검사 격리

- 상태/우선순위/근거: `done`, 검증·버그/P1, OBS-012·W01-02/03.
- 유지 계약: 실제 관리자 로그인·권한 확인, 기본 새 서버와 명시적 fast 재사용, 사용자 3001/5173 보존, 기존 스크린샷 기대값.
- 변경 경계: Playwright runner가 ignored artifacts 아래 격리 root를 만들고 backend `DATA_PATH`와 fixture에 동일하게 전달한다. 계정 준비는 discovery import에서 제거해 실제 실행 setup에서만 수행한다. 기관 설정은 두 기관 spec을 testMatch로 고정한다.
- 구현/검증: 빈 격리 root와 별도 기존 DB를 두고 `--list`/`--grep` 전후 DB 부재·해시, 기본/기관 목록, 관리자 로그인, cleanup과 포트 잔여를 확인한다.
- 완료 조건: discovery가 기존 DB를 열거나 변경하지 않고, 실제 계약은 격리 DB에서 계정을 준비하며, 기관 실행이 지정 spec 밖으로 확장되지 않는다. 결과를 RF-005 평가에 기록한다.
- 담당/난도: 주 담당 직접, 보통·여러 실행 단계. 사용자 기준상 Terra/high 대상이나 현재 세션 모델은 실행 환경 지정값이며 별도 상향 없음.
- 실제 결과/평가: discovery import에서 DB 접근을 제거했고 기본 runner가 고유 data root의 생성·전달·정리를 소유한다. 기존 DB SHA-256은 전후 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62`로 동일했고, `admin-console`은 30 pass, 기관 두 spec은 24 pass / 0 fail / 0 skip이었다. 첫 실제 실행에서 worker별 경로 재생성 결함을 잡아 상속 경로로 수정한 뒤 관리자 로그인 1/1을 확인했고, 계약 teardown과 3001/5173 포트 정리도 완료했다. 이 시범 결과에 따라 나머지 카드도 입력 경계의 명시 API와 실패 재현을 우선하고 전면 구조 분리는 하지 않았다.

### RF-157 · 서버의 테스트 변경 API 실행 경계

- 상태/범위: `done`, 버그·권한/P1. 서버 test mutation gate만 포함한다. UI capability 및 overlay/reset/tick 의미 개편은 제외한다.
- 유지 계약: 정상 운영의 관리자 시연 API, 인증 라우트와 실제 테스트용 dev 기능 목적, 자동 수집 on/off의 독립 제어.
- 변경 경계: non-production, 명시적 test mutation 플래그, 격리 DB, 인증을 모두 만족할 때만 `/api/dev` 변경 라우터를 mount한다. `DISABLE_COLLECTION`은 수집만 제어한다.
- 검증: 격리 DB에서 production/development/test, 플래그 없음/`1`/`0`, 수집 on/off, 익명/로그인 조합의 mount·404/401/허용 응답을 확인한다.
- 실제 변경·확인: `test-mutation-gate` helper와 server mount 조건을 추가했고 `serve:test`가 명시 플래그를 전달한다. non-production·명시 플래그·명시 `DATA_PATH`·인증 조건과 `DISABLE_COLLECTION` 독립성을 집중 검사에서 4/4 확인했다.
- 담당/난도: 주 담당 직접, 보통·실행/권한 계약. 사용자 기준 Terra/high 대상, 별도 상향 없음. 이후 격리 `npm run check` exit 0과 영향 브라우저 계약 결과를 통합 판정에 반영했다.

### RF-100 · 수집기의 이전 실황 읽기 경계

- 상태/범위: `done`, 구조·버그/P1. `airport_info`, `takeoff_fcst`, TAF previous, `ground_forecast`, `terminal_flights`, `overseas_forecast`, flight-category의 ASOS/AMOS 입력만 변경한다.
- 유지 계약: `getCached()`와 API/브리핑은 active view, 수집기의 병합·파생 입력과 `save()`는 live root, 부분 실패 시 마지막 usable live 자료 유지. 저장 형식 변경 없음.
- 구현/검증: store에 명시적 live 읽기 경계를 추가하고 일곱 호출자를 전환한다. 서로 다른 live/demo fixture에서 정상·부분·전체 실패와 시연 종료 뒤 실황을 확인하고 관련 processor/data-view 테스트를 실행한다.
- 실제 변경·확인: `store.getLiveCached()`를 추가하고 위 일곱 호출자를 live 읽기로 전환했다. demo가 active여도 live 신규 게시가 demo view를 덮지 않고 collector 읽기에는 보이는 경로와 관련 processor/data-view 검사를 36/36 통과로 확인했다.
- 담당/난도: 주 담당 직접, 보통·여러 호출자. 사용자 기준 Terra/high 대상, 별도 상향 없음. 1차 독립 검토 `ctx_e17c3c9280d3`은 `consumer_fenced`로 결과를 쓰지 않았고, 재시도 `ctx_1ed0e757da74` (`gpt-5.6-terra` / `high`)가 관련 72 tests 통과로 승인했다. 격리 전체 검사도 exit 0이다.

### RF-101 · 해외 예보 취소와 게시

- 상태/선행: `done`, 버그/P1, RF-100 구현 뒤 같은 processor를 순차 수정했다.
- 유지 계약: 정상 무변경과 부분 성공 게시, 마지막 정상 자료, 취소는 실패 공항과 별도 통계, 호출 lock의 항상 해제.
- 구현/검증: 호출 전·응답 대기·공항 중간·게시 직전 abort에서 취소 결과를 상위 실행 경계까지 전달하고 잘못된 빈 게시를 막는다. latest 해시와 다음 실행 가능 여부를 확인한다.
- 실제 변경·확인: request·공항 loop·대기·게시 직전에 `AbortSignal`을 전달·확인하도록 하고, 취소 시 빈/부분 결과를 저장하지 않으며 lock을 해제하도록 바꿨다. 정상 부분 성공은 실패 공항의 마지막 live 자료를 stale로 유지하는 경로를 포함해 취소/부분 성공/lock 검사 14/14를 통과했다.
- 담당/난도: 주 담당 직접, 낮음~보통이나 상위 실행 통계 연결 포함. 사용자 기준 Terra/medium에서 시작하는 범위, 별도 상향 없음. 1차 독립 검토 `ctx_e17c3c9280d3`은 `consumer_fenced`였고, 재시도 `ctx_1ed0e757da74` (`gpt-5.6-terra` / `high`)가 새 RF-101 취소/부분 성공/lock 검사를 포함한 관련 72 tests로 승인했다. 격리 전체 검사도 exit 0이다.

### RF-102 · KTG 회차 완료와 부분 파일

- 상태/범위: `done`, 저장·버그/P1. KTG processor/store의 기존 형식 호환 안에서 완료 판정을 보강하며 KIM 등과 일괄 통합하지 않는다.
- 유지 계약: 기존 complete 자료의 재다운로드 방지, index/latest 소비 호환, 부분 run 비게시와 마지막 usable 자료 보존.
- 구현/검증: 좌표와 기대 고도 grid의 구조·차원·식별자가 모두 usable한지 검사해 skip한다. 좌표만/고도 누락·손상/중간 쓰기 실패/정상 complete/구형 index 후 재시도를 확인한다.
- 실제 변경·확인: completion marker와 coords/grid 구조·차원·식별자 검사를 추가해 coords-only·누락·손상·중간 실패 run은 재시도하고, usable legacy complete run은 재다운로드하지 않게 했다. worker 반환 뒤 주 담당이 diff와 집중 검사 7/7을 재확인했다.
- 담당/난도: Codex `gpt-5.6-terra` / `high` worker 구현(`ctx_d332bf2bf6ac`), 주 담당 통합 검토. 상태·저장 호환을 함께 다뤄 사용자 기준의 high를 적용했으며 상위 모델 상향은 없음. 격리 전체 `npm run check` exit 0과 영향 브라우저 결과를 통합 판정에 반영했다.

### S007 통합 판정과 범위 제한

- 최종 명령: `DATA_PATH=/home/john_doe/ProjectAMO/artifacts/refactoring/S007/final-check-data`, `TMPDIR=/home/john_doe/ProjectAMO/artifacts/refactoring/S007/final-check-tmp`, `DISABLE_COLLECTION` unset으로 `npm run check`를 순차 실행해 exit 0을 확인했다. 추가로 다섯 변경 경계의 집중 재실행은 26 pass / 0 fail / 0 skip이었다.
- 최종 불변식: `git diff --check` 통과, `AGENTS.md`와 `CLAUDE.md` 동일, 원본 `backend/data/projectamo.db` SHA-256은 전후 동일, 3001/5173 리스너 없음, 위 final-check 및 집중 재실행의 data/TMPDIR은 모두 제거했다.
- 기존 baseline의 전체 브라우저 357사례(214 pass / 58 fail / 85 skip)와 B04/B05 성능 수치는 S007 변경 범위의 새 결과가 아니므로 재실행하지 않았다. 이 통합 판정은 이미 확정된 영향 계약(`admin-console` 30 pass, 기관 24 pass / 0 fail / 0 skip)을 대조한 것이며, 기존 baseline의 실패·skip 또는 성능 한계를 통과로 바꾸지 않는다.
- 다음 추천은 문서상 후보만 유지한다: [RF-104](report.md#rf-104)의 루트 검사 밖 공통 계약, [RF-105](report.md#rf-105)의 전송 timeout 본문 수명, [RF-106](report.md#rf-106)의 nginx runtime 경계는 사용자가 별도로 선정할 때만 재개한다. 이 S007에서는 해당 범위 밖 구현을 하지 않았다.

## S008 선정 실행 카드

S008은 S007 완료 범위와 별개인 2026-09-12 사용자 선정이다. 아래 상태는 실제 dispatch 결과를 기록한 시점의 상태이며, 선정 사실과 완료 사실을 혼합하지 않는다.

| 실제 배정 | 모델·추론 | dispatch | 이 문서 작성 시점의 확인 상태 |
| --- | --- | --- | --- |
| RF-104 구현·검증 | `gpt-5.6-terra` / `medium` | `ctx_b70e57ee1f86` | 완료. root 공통·오프라인 검사를 `check`에 연결했고, 격리 전체 검사에서 통과 |
| RF-105 구현·검증 | `gpt-5.6-terra` / `high` | `ctx_649f6ea661ee` | 완료. header/body deadline, partial body, 외부 abort, 정상 body와 cleanup 회귀를 포함한 최신 backend 검사 통과 |
| RF-106 구현·정적 검증 | `gpt-5.6-terra` / `high` | `ctx_9009f1d6850d` | S008 정적 계약 완료. 당시 nginx runtime은 미실행이었고, S009 `ctx_3cb5362fdc2a`의 runtime 검증으로 제한을 닫음 |
| 독립 읽기 검토 | `gpt-5.6-terra` / `high` | `task_7d440895e81e` / `ctx_97b183e8ca0b` | 운영 기본 `/tmp/projectamo-deploy.lock`을 offline 검사가 점유하는 충돌을 발견; 결과를 RF-104 lock 보완의 입력으로 사용 |
| RF-104 lock 보완 | `gpt-5.6-terra` / `high` | `task_3407ee6ff230` / `ctx_87b523792c84` | 운영 기본 lock은 유지하고 검사에만 고유 임시 lock을 주입하는 보완을 완료 |
| S008 기록 | `gpt-5.6-terra` / `medium` | `ctx_a55eb47b0beb` | 실행 카드와 진행 기록의 중간 결과를 보존 |
| S008 최종 통합 | Codex `gpt-5.6-terra` / `high` | `task_dd3d022e33e4` / `ctx_780946f4e392` | 최신 전체 diff, 격리 `npm run check`, 불변식과 nginx/prototype 제한을 최종 대조 |
| S008 최종 재검증 | Codex `gpt-5.6-terra` / `high` | `task_7255f489f99e` / `ctx_3e17e396c74b` | lock 주입 경로 회귀를 수정하고 최신 격리 전체 검사·정적 계약·불변식을 다시 확인 |

### RF-104 · 루트 검사 밖 공통 계약

- 상태/선정: `done`, 검증/P1, 2026-09-12 S008에서 `이번에 작업`으로 선정. 완료는 이 카드의 실제 검증 근거에 한정하며 S008의 다른 카드를 완료로 뜻하지 않는다.
- 부분 범위: `package.json`의 root check 연결과 root-checks 정책으로 공통·오프라인 검사 보장 범위를 명시한다. prototype의 `react-icons/md` 의존성 추가 또는 prototype build를 기본 check에 편입하는 변경은 제외한다.
- 실제 배정·결과: `gpt-5.6-terra` / `medium`, dispatch `ctx_b70e57ee1f86` 성공. 독립 읽기 검토 Codex `gpt-5.6-terra` / `high` (`task_7d440895e81e` / `ctx_97b183e8ca0b`)가 offline 검사가 운영 기본 `/tmp/projectamo-deploy.lock`을 점유하는 충돌을 발견했고, RF-104 lock 보완 Codex `gpt-5.6-terra` / `high` (`task_3407ee6ff230` / `ctx_87b523792c84`)이 운영 기본 경로를 유지하며 검사에만 고유 임시 lock을 주입했다. `test:offline`은 shared 14 case, nginx 정적 계약 4 case와 deploy lock 검사를 포함하며, 최신 격리 `npm run check`은 backend/frontend/offline 뒤 production build까지 exit 0으로 마쳤다. 최종 재검증 Codex `gpt-5.6-terra` / `high` (`task_7255f489f99e` / `ctx_3e17e396c74b`)에서는 그 주입 변수가 임의 파일을 열 수 있는 경로 오염 회귀를 발견해, 두 엔트리포인트가 기본값을 상수로 유지하고 `PROJECTAMO_DEPLOY_LOCK_TEST=1`일 때만 `/tmp/projectamo-deploy-lock-test.XXXXXX/deploy.lock` 형식을 허용하도록 최소 수정했다; shell 실행은 없고, 임의 경로는 lock redirection 전에 거부된다. 갱신한 검사는 하나의 고유 임시 lock만 점유해 두 실제 엔트리포인트의 held-lock 실패·명령 미실행과 임의 경로 미생성을 확인했고, nginx 정적 4건·request-observability 15건·backend cache 정책 3건 및 최신 격리 `npm run check`가 통과했다.
- 한계·후속: prototype은 `react-icons/md`를 import하지만 해당 prototype의 설치 트리에 패키지가 없어 별도 build가 실패하는 기존 독립 의존성 문제다. 이는 기본 `npm run check`에 포함되지 않으므로 RF-104 완료 근거나 nginx runtime 제한과 합산하지 않으며, 의존성/별도 build 처리 여부는 별도 선정 때 재개한다.

### RF-105 · 전송 timeout의 본문 수명

- 상태/선정: `done`, 버그/P2, 2026-09-12 S008에서 `이번에 작업`으로 선정.
- 부분 범위·제외: header 수신 뒤에도 body 완료 또는 abort까지 transport deadline을 유지하고 timeout·외부 abort·cleanup 회귀를 확인한다. validate 실패 retry 정책의 확대는 제외한다.
- 실제 배정·결과: `gpt-5.6-terra` / `high`, dispatch `ctx_649f6ea661ee`. `withTimeout`은 fetch와 `arrayBuffer()`를 같은 abort deadline으로 감싸고 finally에서 timer·외부 abort listener를 정리한다. header 대기, abort를 무시하는 stalled body, partial body, 외부 abort의 무재시도, 정상 1 MiB body와 cleanup을 회귀 검사로 보호했고, request-observability 15건과 관련 집중 suite 36건 및 최신 격리 전체 검사가 통과했다.

### RF-106 · nginx 직접 서빙과 backend 차단

- 상태/선정: `done`, 버그/보안 경계/P1, 2026-09-12 S008에서 `이번에 작업`으로 선정. S009 runtime 검증으로 완료했다.
- 부분 범위·제외: nginx와 backend의 공개/비공개 URL 및 cache 계약을 대조하고 CTPS/Echo Top binary 차단과 공개 정적 자료 제공의 한정 계약을 확인한다. 운영 배포, 모든 `.bin` 일괄 차단, 실운영 노출·민감도 판정은 제외한다.
- 실제 배정·정적 결과: `gpt-5.6-terra` / `high`, dispatch `ctx_9009f1d6850d`. nginx example은 generic `/data/` alias보다 먼저 exact CTPS/Echo Top raw `.bin` URL만 404로 막고, WebP/GeoJSON frame은 immutable, metadata는 no-cache로 backend `setGeneratedDataCacheHeaders`와 일치시킨다. `deploy/test-nginx-rate-limit.mjs`의 4개 정적 계약과 최신 전체 check가 통과했으며 blanket `.bin` denial이나 운영 배포는 추가하지 않았다.
- runtime 실제 결과: S009 `ctx_3cb5362fdc2a` (Codex `gpt-5.6-terra` / `high`)에서 nginx 1.28.3의 `nginx -t`, 직접 HTTP와 live/demo 전환을 통과했다. raw CTPS/Echo Top 차단, 공개 자료의 cache 계약, metadata no-cache 및 DB/organization-file 차단을 runtime에서 확인해 정적 구현 완료와 분리돼 있던 제한을 닫았다.

## S009 선정 실행 카드

S009은 S007·S008과 별개로 2026-09-12 사용자가 전체 1단계 구현을 승인하고 마감한 기록이다. 아래 표는 selection과 implementation을 분리한 실제 배정·검증 결과다. 모두 `gpt-5.6-terra` / `medium` 또는 `high`였으며 상향은 없었다.

| 실제 배정 | 모델·추론 | task / dispatch | 이 문서 작성 시점의 확인 상태 |
| --- | --- | --- | --- |
| RF-106 runtime 검증 | `gpt-5.6-terra` / `high` | `ctx_3cb5362fdc2a` | 완료. nginx 1.28.3에서 `nginx -t`, 직접 HTTP, live/demo 전환 검증을 통과 |
| RF-121 | `gpt-5.6-terra` / `high` | `ctx_61154f37ae37` | 완료 |
| RF-150 | `gpt-5.6-terra` / `high` | `ctx_6d5e963ab372` | 완료 |
| RF-151 | `gpt-5.6-terra` / `high` | `ctx_991469cc998d` | 완료 |
| RF-159 | `gpt-5.6-terra` / `high` | `ctx_54abd3583492`; 보완 `ctx_6e5148cfa5ed` | 완료 |
| RF-161 | `gpt-5.6-terra` / `high` | `ctx_a5bb436d04a6`; 보완 `ctx_6e5148cfa5ed` | 완료 |
| RF-158 | `gpt-5.6-terra` / `high` | `ctx_3e712226b47f` | backend와 frontend 연결 완료 |
| RF-160/162 | `gpt-5.6-terra` / `high` | `ctx_4d86635b9961` | backend와 frontend 연결 완료 |
| RF-107~109, RF-122, RF-157 | `gpt-5.6-terra` / `medium` 또는 `high` | 카드별 S009 실행 기록 | 구현·관련 집중 검증 완료 |
| RF-123 브라우저 실패 정렬 | `gpt-5.6-terra` / `medium` 또는 `high` | 후속 정리 `task_105c1b9d29dc` | contract/fixture 정렬 완료; 집중 결과만 기록 |

- 공통 실행 조건: 공유 파일·3001/5173·`DATA_PATH`·`TMPDIR`·Playwright output을 한 실행이 독점하고 종료·정리 뒤 후속을 시작했다.
- 파일·포트 조건: 공유 파일은 선행 카드가 통합·검증·소유권 인계를 마친 뒤에만 후속 카드가 수정한다. 3001/5173, `DATA_PATH`, `TMPDIR`, Playwright report/output은 한 실행이 독점하고 종료·정리 확인 전 병렬 실행하지 않는다.
- 완료 판정: S009의 `done`은 selection이나 dispatch 영수증만이 아니라 실제 구현과 카드별 검증을 대조한 결과다. 최종 `npm run check` pass는 전체 browser final pass가 아니며, 해당 browser 제한은 S009 마감 판정에 남겼다.

## 개별 개선 카드

S007에서 위 다섯 개별 구현 카드를 확정했다. 그 밖의 RF-100 이후 [보고서 후보](report.md)는 미선정이며 OBS 원장과 연결되어 있다. OBS-001~008의 세 파일을 먼저 수정하는 지시가 아니다. 이후 선정 카드가 늘면 다음 형식을 복사해 구체화한다. 카드가 길어지면 `tasks/RF-xxx.md`에 분리하고 이 문서에 ID·제목·상태·의존성·링크를 유지한다.

```text
ID / 제목:
상태 / 유형(구조·성능·검증·정리·버그) / 우선순위:
사용자 선택(미선정·이번에 작업·보류·제외·추가 조사) / 선택 날짜·범위:
관련 Axx·OBS-xxx / 근거 코드 기준:
현재 문제와 실제 수정·사용 시나리오:
유지할 동작·응답·저장/시간/권한 계약:
변경할 책임 경계·파일·소비자:
실행 담당 / 파일 수정 소유권 / 공통 파일 조율 담당:
난도 판단 / 배정 모델·추론 강도 / 상향 시 이유:
병렬 실행 가능한 카드 / 선행 계약 / 테스트·포트·데이터·출력 자원:
예상 효과(성능이면 기준값·목표·조건):
선행 작업 / 영향받는 후속 작업:
구현 순서(작은 검증 가능한 단위):
검증 명령·fixture·엔진/뷰포트·관찰 결과:
완료 조건:
되돌릴 단위 / 저장 형식·마이그레이션 유무:
실제 결과·커밋 또는 미커밋 파일:
검토 담당 / 주 담당의 통합 확인과 증거:
남은 검증 / 차단·보류 사유와 재개 조건:
진행 기록의 관련 세션:
```

카드의 완료 조건에는 ‘기능 유지’, ‘개선 목적 달성’, ‘관련 검사 통과 또는 명시적인 미검증 판단’, ‘문서 반영’을 포함한다. 성능 카드에는 전후 비교가 필요하다. 검증할 수 없는 핵심 동작이 남으면 `done`으로 전환하지 않는다.
