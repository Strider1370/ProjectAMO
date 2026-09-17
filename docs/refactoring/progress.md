# 진행 상태와 세션 인계

새 세션은 이 문서 → [작업 목록](tasks.md) → 선택한 항목의 [진단 근거](audit.md) 순으로 읽는다. 단계·운영 원칙은 [전체 계획](README.md)에 있다.

## 현재 재개 지점

- 마지막 갱신: 2026-09-12, 세션 **S009 전체 1단계 문서 마감**.
- S009 선정 카드 RF-106, RF-107~109, RF-121~123, RF-150~151, RF-157, RF-158~162는 모두 `done`이다. selection(사용자 선택)과 implementation(현재 diff·카드별 검증 완료)은 [S009 실행 카드](tasks.md#s009-선정-실행-카드)에서 분리해 보존했다.
- 최종 통합: 격리 `DATA_PATH`/`TMPDIR`, `DISABLE_COLLECTION` unset의 `npm run check`을 마감 문서 편집 뒤 다시 실행해 exit 0; DB `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62` 불변, `git diff --check`, AGENTS/CLAUDE 동일성, 3001/5173 비점유을 확인했다. 수정 파일은 저장됐지만 전체 browser final은 마지막 세 수정 전 독립 검토 결함으로 중단했고 사용자 과검증 중단 지시 후 재실행하지 않았으며, 모바일 route-token 최종 묶음도 전체 통과로 산입하지 않는다.
- 다음 Stage 2 추천 시작점: 전체 browser를 재시작하기보다 먼저 RF-110(경로 적용 action·요청 수명)을 사용자 선택으로 좁혀, mobile route-token의 제품 범위와 계약 oracle을 분리한 뒤 필요한 지원 viewport만 재검증한다. S007/S008의 선택·완료·제한 기록과 RF-004~007 판정은 변경하지 않는다.
- 공유 실행 조건: 공유 파일은 선행 카드의 통합·검증·소유권 인계 후에만 후속 카드가 수정한다. 3001/5173과 공용 `DATA_PATH`·`TMPDIR`·Playwright output은 한 실행이 독점하고 종료·정리 확인 뒤 다음 실행을 시작한다.
- S007·S008의 선정·완료·제한 기록은 보존한다. RF-104/105의 `done`과 RF-106 정적 계약 구현 기록은 변하지 않으며, S009에서 runtime 검증 근거가 생겨 RF-106도 `done`으로 갱신됐다.
- S008 이전 최종 재검증 기록: deploy lock 주입 경로 회귀 수정 및 전체 검사 완료.
- S008 사용자 선정은 RF-104→RF-105→RF-106 순서다. S007의 선정 다섯 카드와 통합 판정은 완료 기록으로 보존한다. S008 당시 RF-106은 nginx runtime 검증 제한으로 `in_progress`였으나, S009의 nginx 1.28.3 직접 검증으로 완료됐다.
- S008 실제 배정: RF-104 `gpt-5.6-terra` / `medium` dispatch `ctx_b70e57ee1f86`, RF-105 `gpt-5.6-terra` / `high` dispatch `ctx_649f6ea661ee`, RF-106 `gpt-5.6-terra` / `high` dispatch `ctx_9009f1d6850d`의 결과를 통합 검토했다. 독립 읽기 검토 Codex `gpt-5.6-terra` / `high` `task_7d440895e81e` / `ctx_97b183e8ca0b`가 운영 `/tmp` lock 충돌을 발견했고, RF-104 lock 보완 Codex `gpt-5.6-terra` / `high` `task_3407ee6ff230` / `ctx_87b523792c84`가 이를 정정했다. 기록은 `gpt-5.6-terra` / `medium` dispatch `ctx_a55eb47b0beb`, 앞선 최종 통합은 Codex `gpt-5.6-terra` / `high` `task_dd3d022e33e4` / `ctx_780946f4e392`, 최종 재검증은 같은 모델·추론 강도 `task_7255f489f99e` / `ctx_3e17e396c74b`에서 수행했다.
- RF-104는 `package.json` root check 연결과 root-checks 정책의 공통·오프라인 검사 보장이다. 독립 검토에서 offline deploy lock 검사가 실제 `/tmp/projectamo-deploy.lock`을 점유하는 충돌을 발견했고, lock 보완은 운영 기본 경로를 유지하며 검사에만 고유 임시 lock을 주입했다. 최신 diff 재검토에서는 test lock 경로가 환경 변수로 임의 파일을 열 수 있음을 발견해, 두 실제 entrypoint가 기본 `/tmp/projectamo-deploy.lock`을 상수로 유지하고 `PROJECTAMO_DEPLOY_LOCK_TEST=1`일 때만 mktemp가 만드는 `/tmp/projectamo-deploy-lock-test.XXXXXX/deploy.lock` 경로를 받도록 정정했다. 이 형식 밖의 입력은 redirection 전에 종료하므로 shell 실행이나 경로 오염이 없고, lock 검사는 하나의 고유 임시 lock만 점유하면서 fast/full 모두의 held-lock·명령 미실행과 거부 경로 미생성을 확인한다. 갱신된 `test:offline`(shared 14건, nginx 정적 4건, deploy lock), request-observability 15건, backend cache 정책 3건과 최신 격리 `npm run check`은 통과했다. prototype은 `react-icons/md`를 import하지만 prototype 설치 트리에 패키지가 없어 별도 build가 실패하는 독립 의존성 문제이며 기본 check에 포함되지 않는다.
- RF-105는 fetch header부터 body `arrayBuffer()` 완료/abort까지 같은 deadline을 유지하고 finally cleanup한다. header 지연, stalled/partial body, 외부 abort, 정상 large body와 timer/listener cleanup 회귀 검사는 request-observability 15건과 관련 집중 suite 36건 및 최신 전체 검사에서 통과했다; validate 실패 retry 정책은 건드리지 않았다.
- RF-106은 example nginx의 exact CTPS/Echo Top raw binary 404, published immutable WebP/GeoJSON, revalidated metadata를 backend와 대조하는 정적 계약을 완료했다. S008 당시 nginx binary 부재로 runtime은 미실행이었으나, S009에서 동등 config/data의 nginx 1.28.3 `nginx -t`·직접 HTTP·deny/200/cache·DB/organization 404·live/demo 전환으로 제한을 닫았다.
- 최종 재검증: `DATA_PATH=/home/john_doe/ProjectAMO/artifacts/refactoring/S008/final-data`, `TMPDIR=/home/john_doe/ProjectAMO/artifacts/refactoring/S008/final-tmp`, `DISABLE_COLLECTION` unset으로 `npm run check` exit 0. UI/브라우저 동작 변경이 없어 browser contract는 실행하지 않았고, 이를 통과로 산입하지 않는다. 원본 DB SHA-256 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62` 보존, `git diff --check`, AGENTS/CLAUDE 동일성, 3001/5173 비점유와 두 격리 경로 정리를 확인했다.
- RF-004는 사용자 선정 기록으로 `done`이며, RF-005(RF-103)는 브라우저 격리와 영향 계약 확인으로 `done`, RF-006(RF-157/100/101/102)는 작업별 검증으로 `done`, RF-007은 격리 `npm run check`와 최종 불변식·문서 인계로 `done`이다.
- [진단 보고서](report.md)의 63개 카드 중 S007에서는 다섯 개, S008에서는 RF-104/105/106 세 개를 구현 대상으로 선정했다. RF-157의 UI capability와 overlay/reset/tick 전체 개편, KTG 저장 형식 일괄 통합, S008 부분 범위 밖 항목과 나머지 후보 구현은 제외한다.
- S005 보완: 보고서 앞에 [프로젝트 구조 종합평가와 리팩토링 방향](report.md#프로젝트-구조-종합평가와-리팩토링-방향)을 추가했다. 기존 구조를 유지할 근거, 디렉터리·의존성·세 파일의 책임 분리 판단, 보완할 경계와 기존 후보를 연결했다. 새 조사·후보·구현 선정은 없다.
- S006 지시: [난도별 모델·실행 규모](tasks.md#구현-난도별-모델과-실행-규모)로 비용을 조정했다. 기본 Terra/medium, 상태·공통 계약은 high, 해결되지 않은 질문만 Sol→Astra로 상향. 주 담당 단독 또는 서브에이전트1명 기본이며 상시 검토자·3명 동시 구현을 기본으로 두지 않는다. 모델 정책 선택과 구현 대상 선정은 구분한다.
- [15영역 진단표](audit.md): 추적2,248파일 분류, W01~W12 검수 완료. 대표 경로 외 실제 운영/동시성/실기기/정책 질문은 영역별 `부분 확인` 및13개 후속 `deferred`로 남겼다. 전체 분기 검증 완료를 뜻하지 않는다.
- [기준선](baseline.md): 현재 테스트·빌드, 기본 browser214pass/58fail/85skip와 기관24pass, n=5 대표 성능·실제 미측정 범위. 옛 검증 결과를 새 결과로 쓰지 않았다.
- 기준 HEAD `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41`, main. 시작의 AGENTS/CLAUDE/docs/README 변경과 신규 계획 디렉터리를 보존했다. S004 자체 변경은 docs/refactoring 및 ignored artifacts다. 앱 코드·설정·저장 형식·영구 테스트 개선, 커밋·푸시·배포 없음.
- 원시 증거: ignored `artifacts/refactoring/S004/`. 임시 자료/스크립트/로그/캡처를 보존했다. 최초 비격리 browser `--list`의 DB 접근 예외는 아래 및 baseline에 명시했다.
- Orca run `run_eee3920c3cc6`: 최대 worker3으로12묶음을 실행했고 전부 반환·검수했다. 현 소유 worker 자원은 모두 release, active/reclaimable0. 과거 재사용 dispatch7개의 retained 표시는 resource absent이며 실행 중 terminal이 아니다. 3001/5173 리스너 없음.
- **확인된 집중 검증:** RF-103 실제 관리자 로그인 1/1, RF-157 gate/mount/익명401·인증200 4/4, RF-100 관련 processor/data-view 36/36, RF-101 취소/부분 성공/lock 14/14, RF-102 7/7 통과. 이는 전체 회귀 통과가 아니다.
- **마감 배정과 결과:** RF-102 구현은 `gpt-5.6-terra`/`high` (`ctx_d332bf2bf6ac`)로 7/7을 확인했다. RF-100/101 독립 검토의 1차 `ctx_e17c3c9280d3`은 `consumer_fenced`였고, 재시도 `ctx_1ed0e757da74` (`gpt-5.6-terra`/`high`)가 관련 72 tests로 성공했다. 브라우저 `ctx_7c416a8ccab5` (`gpt-5.6-terra`/`medium`)는 admin-console 30 pass와 기관 24 pass / 0 fail / 0 skip, DATA_PATH teardown·포트 정리를 확인했고, 문서 `task_3b1afc21edaf` / `ctx_2b45d762c5cf` (`gpt-5.6-terra`/`medium`)의 기록을 반영했다. 최종 통합은 `task_594ff9ac3c6b` / `ctx_c90c33a1b1ac` (Codex `gpt-5.6-terra` / `high`, requested=effective)에서 완료했다.
- **S008 후속(당시 기록):** RF-104와 RF-105는 `done`이고 RF-106은 정적 구현·정적 계약 검증까지 완료한 상태였다. 이 runtime 재검증 조건은 S009에서 충족됐으므로 현재 상태는 상단 S009 마감 기록을 따른다.

## 다음 세션 시작 절차

1. `git status --short`, 브랜치·HEAD로 위 기준과 기존 변경을 대조한다. 현재 문서와 artifacts를 기존 작업으로 보존한다.
2. [보고서 선택 목록](report.md#사용자-선택-목록)과 최신 사용자 지시를 읽는다. 진행률 질문이나 보고서 검토만으로 구현 승인이 생기지 않는다.
3. 사용자가 고른 `이번에 작업 / 보류 / 제외 / 추가 조사`를 [tasks](tasks.md#rf-004-진단-보고와-사용자-선정)에 기록한다. 일부 범위·선행 작업 포함 여부를 반영하고 선정한 카드의 실행/검증 계획만 구체화한다.
4. `추가 조사`는 연결 후속 W-02의 좁은 질문만 재개한다. 코드를 변경하지 않고 이미 재현된 근거를 입력으로 사용한다. `이번에 작업`은 그 범위의 구현·검증까지 진행하되 일상적 재확인을 반복하지 않는다.
5. 기준 코드/자료/요구가 달라졌을 때 관련 근거만 재검증한다. 새 세션이라는 이유로 RF-001 검사·W01~W12·성능 전체를 처음부터 반복하지 않는다. 이전 worker가 살아 있다고 가정하지 않는다.

## S004 배정·검수 이력

기준 HEAD는 상단과 동일. 모든 W는 소스 읽기 전용+자기 artifacts 보고서만 작성한다. 앱/설정/영구테스트/공통계획 변경·추가 에이전트·서버/수집/검사 실행 금지. 공유 실행과 소스 재현은 주 담당 소유다.

| 작업 | task / dispatch | 배정·반환 (UTC, KST는 +9h) | 체크포인트와 다음 행동 |
| --- | --- | --- | --- |
| W01 A13 | task_e9cd13bb1326 / ctx_7097234a4159 | 15:30 배정, 15:43:52 반환 | [보고서](audit/W01.md) 검수. root discovery, fixture DB import, 기관 grep 범위, 문자열 검사 확인. W04 재사용 |
| W02 A14 | task_a5facb7de318 / ctx_5c8fb288c4b9 | 15:30 배정, 15:43:35 반환 | [보고서](audit/W02.md) 검수. nginx·배포·설치·의존성 분리. nginx binary runtime은 바이너리 미설치로 미재현. W05 재사용 |
| W03 A10 | task_a80c34a00ac9 / ctx_77df7271414a | 15:30 배정, 15:43:42 반환 | [보고서](audit/W03.md) 검수. 35 예약+예약외 목록, 부분 확인 잔여 질문. 주 담당이 live/demo·overseas abort·KTG·timeout 추가 재현. W06 재사용 |
| W04 A02 | task_9c3211a2c165 / ctx_051315e5fd07 | 15:44 배정, 16:03:58 반환 | [보고서](audit/W04.md) 검수. NOTAM 초기 전용 반대 근거 검수, W07 연결 |
| W05 A03 | task_4ce3288b9eba / ctx_099bc43e358a | 15:44 배정, 16:04:51 반환 | [보고서](audit/W05.md) 검수. A→B→A raster 재현, W08 재사용 |
| W06 A04 | task_655c5b8e7de7 / ctx_ad7e2ee867b1 | 15:44 배정, 16:01:34 반환 | [보고서](audit/W06.md) 검수. 저장 모델 소실 재현, W09 재사용 |

| W07 A05 | task_fbe351425ebc / ctx_4c92d370bac3 | 16:08 배정, 16:18:41 반환 | [보고서](audit/W07.md) 검수. 풍속·AMOS·VV helper 재현, 모델6건 tab drift 확인. W10 재사용 |
| W08 A06 | task_ca6c0a95f29a / ctx_e0d9471c6e16 | 16:07 배정, 16:29:11 반환 | [보고서](audit/W08.md) 검수. terminal cursor·null helper, ground 의도 충돌 확인. W11 재사용 |
| W09 A07 | task_7d3795717d85 / ctx_79428862fb51 | 16:07 배정, 16:24:02 반환 | [보고서](audit/W09.md) 검수. route material/geometry/invalid ack 메모리DB 재현. W12 연결 |
| W10 A08 | task_a779a1a43898 / ctx_21b7691ed7b2 | 16:19 배정, 16:33:10 반환 | [보고서](audit/W10.md) 검수. 감시시각/상한/invalid ETA 실제 임시HTTP 재현. terminal release |
| W11 A09 | task_a9008101bcea / ctx_7574e76df659 | 16:30 배정, 16:50:21 반환 | [보고서](audit/W11.md) 검수. mount 조건·snapshot/backup·health 의미 대조, admin helper 재현. terminal release |
| W12 A12 | task_b9a88cc49be2 / ctx_22a88ac3e0b2 | 16:25 배정, 16:37:49 반환 | [보고서](audit/W12.md) 검수. 494파일·CSS44 소비 원장, 토큰/WeatherIcon/focus 근거 대조. terminal release |

가용 worker 최대3을 유지하며 반환→검수→terminal 재사용 또는 release→delivery ack로 운영했다. W04→W07 및 W09→W12의 terminal 재사용은 agent_unconfigured로 거절되어 완료 terminal을 먼저 release하고 새 terminal을 사용했다. W01~W12 모두 검수·반영했고 마지막 worker 자원도 해제했다. 시작/반환/해제 receipt는 ignored artifacts에 보존했다.

주 담당 재현 결과(소스 변경 없음): `repro-data-view.json`은 demo 중 airport_info 실패 fallback이 live 파일에 demo-value 게시. `repro-collector-boundaries.json`은 overseas pre-abort가 빈 airports를 저장, coords-only KTG를 완료 처리 후 재시도 skip, 20ms timeout의 body80ms 성공을 확인. 모든 외부 fetch 0, 임시 root만 썼다. 전체 API/processor 의미 전수 검증으로 일반화하지 않는다. `repro-polling-keys.json`은 NOTAM/특보 hash만 바뀌어도 diff key가 없어 fetch0인 경로를 추가 확인했다. 실제 main→지도/공항 NOTAM 소비와 연결해 RF-107에 기록했으나, W04 검수에서 초기 전용 명시 테스트를 확인해 단순 버그 해석을 수정했다. main 특보 표시 소비자도 미확인이다. convective 불변 재조회와 NOTAM 정책을 구분한다.

주의: 최초 browser `--list`만 DATA_PATH 격리 없이 실행되어 기존 DB open/schema init 경계를 밟았다. 로그에 기존 두 계정 모두 `이미 있음`, 신규 생성 0. 이후 실제 계약 runner/server에는 같은 격리 DATA_PATH를 전달했다. 기존 DB 변경이 전혀 없었다는 해시 증명은 없으므로 그렇게 주장하지 않는다.

## 마지막 검증

앱·브라우저·성능은 S004의 실제 종료 결과다. 원시 증거는 ignored `artifacts/refactoring/S004/`에 있으며 조건·세부 분류는 [기준선](baseline.md)에 보존했다. S005~S006은 문서만 보완하며 앱 검사·성능 측정을 재실행하지 않았다. 최신 문서 검증은 S006 세션 기록에 구분한다.

| 범위 | 결과 | 근거 |
| --- | --- | --- |
| B01 환경 | 확인 | WSL2 Linux x86_64, Node v22.23.1/npm 10.9.8, 16 logical CPU, 세 package 설치됨, 시작 시 3001/5173 비어 있음 |
| 기존 로컬 데이터 | 복사 기반, DB 예외 기록 | `backend/data/.active-data → .`, live revision. 브라우저용 latest26종6,872,175B, 측정용KIM/KTG 별도 복사. 실황 포인터 유지; 최초 DB discovery 예외는 위 주의 참조 |
| 첫 `npm run check` | 환경 영향 실패 | `DISABLE_COLLECTION=1` 전역 주입 시 backend 1,139 pass / 2 fail / 1 skip. `readLatest()` 디스크 경로를 건너뛰어 파일 기반 캐시 테스트와 충돌. 코드 결함으로 집계하지 않음 |
| 수정한 실행 환경의 `npm run check` | 통과, 1 skip | `DISABLE_COLLECTION` unset, 격리 DATA_PATH/TMPDIR. backend 1,141 pass / 0 fail / 1 skip, frontend 1,539 pass / 0 fail; production build 통과. 총 24.37 s |
| 별도 root shared | 통과 | `node --test shared/*.test.js`: 14 pass / 0 fail / 0 skip. 루트 test discovery 밖임을 W01에서 확인 |
| Backend skip | 미검증 | QCD 실제 HDF5 9 sweeps 사례: `artifacts/radar-qcd/*.h5` 부재 |
| B03 기본 주요 브라우저 | 실패 포함 종료1 | 357사례: 214 pass / 58 fail / 85 skip / flaky0, 1,896.03s. 기본 3뷰포트 + route-token-input WebKit. 재시도0, 격리자료, 자동수집off. 기관 2spec×6project 24pass/0fail/0skip,218.53s 종료0 |
| A01 분류 | 임시 검사 완료 | 추적 2,248파일 15영역 배정. 정규식 import graph 601 source modules / 1,297 edges, 금지 방향·다중파일 SCC 0. 제외한 86 target은 CSS/자산. AST·번들 그래프 전체 증명이 아님 |
| B04/B05 | 측정·통합 완료 | production 첫/재방문 main/terminal 각5, API대표8그룹, map idle/switch 각5. [기준선](baseline.md)에 조건·수치·한계 기록. |
| 문서 최종 검사 | 통과 | 22파일·로컬링크/앵커308개·63선택카드/OBS·15영역·12보고/13후속, UTF-8/LF/공백 오류0. diff check·AGENTS=CLAUDE·기존dirty경로 보존·포트/worker 자원 확인 |

## 결정 기록

| ID | 날짜 | 결정과 이유 | 재검토 조건 |
| --- | --- | --- | --- |
| D001 | 2026-09-11 | 사용자 요청에 따라 전체 프로젝트를 조사한다. 세 파일은 초기 관찰로만 남긴다 | 사용자가 회차 범위를 변경할 때 |
| D002 | 2026-09-11 | 현재 계획은 `docs/refactoring/`에 두고 루트 공통 안내와 docs 목차에서 연결한다. 과거 archive와 구분한다 | 회차 종료 후 현재 안내·후속 작업을 보존하며 보관 위치 정리할 때 |
| D003 | 2026-09-11 | 전체 범위 진단과 기준선 확보 후 구현 순서를 정한다. 현재는 구현 카드 미확정 | RF-004에서 근거를 바탕으로 개별 작업 확정 |
| D004 | 2026-09-11 | 기록은 네 문서로 시작하고 큰 진단/작업만 하위 파일로 분리한다. 별도 관리 도구·의존성을 추가하지 않는다 | 문서 규모로 작업 찾기·중복 방지가 어려워질 때 |
| D005 | 2026-09-11 | 과거 테스트·폰트 최적화 수치는 참고로만 남기고 새 코드 기준의 성능 측정을 구분한다 | 기준 커밋·환경·재현 조건이 일치함을 확인할 때 |
| D006 | 2026-09-12 | 영역별 조사 묶음 W01~W12를 최대 3개씩 배정하고 주 담당은 A01/A11/A15와 통합을 맡는다. 고정된 프론트/백엔드 담당보다 범위·질문·완료 조건을 좁힌다 | 첫 W01~W03의 근거 품질·중복·검수 비용을 평가할 때 |
| D007 | 2026-09-12 | 조사 단계는 읽기 전용, 구현은 파일 소유권별 배정, 공통 기록과 공유 실행 자원은 주 담당이 관리한다 | 실제 파일/프로세스 격리가 확보돼 병렬 검증의 이득을 확인할 때 |
| D008 | 2026-09-12 | 사용자 요청에 따라 정교한 진단 보고서를 먼저 제시하고, 사용자가 실제 작업 대상을 선정한 뒤 구현한다. 진단의 후보·추천과 구현 선택을 분리한다 | 사용자가 진행 방식을 명시적으로 변경할 때 |
| D009 | 2026-09-12 | S007에서 RF-103/157/100/101/102와 명시된 부분 범위를 해당 순서로 선정한다. UI capability 및 dev overlay/reset/tick 전체 개편과 타 모델 저장 통합은 제외한다 | 사용자가 범위를 변경할 때 |
| D010 | 2026-09-12 | RF-103 시범에서 discovery 무변경·runner/server 경로 일치·실제 로그인·기관 목록을 먼저 검증했다. worker 재평가로 드러난 임시 경로 불일치를 같은 카드에서 수정했고 이후에도 입력 경계와 실패 재현 중심의 좁은 수정을 유지한다 | 통합 브라우저에서 격리 생명주기 회귀가 발견될 때 |
| D011 | 2026-09-12 | 사용자 지시에 따라 S009에서 RF-106→RF-123→RF-107~109→RF-121~122→RF-150~151→RF-157 잔여 UI capability/overlay-reset-tick→RF-158~162를 전체 1단계 실제 구현 대상으로 선정한다. 선정·배정 계획·영수증과 구현 완료를 분리하고, S007/S008 기록은 보존한다 | 사용자가 순서·부분 범위·공유 실행 조건을 변경할 때 |

## 세션 S001 — 2026-09-11

- 요청: 전체 얼개와 기록 체계를 먼저 만들고 세션이 바뀌어도 이어갈 수 있도록 준비.
- 조사: 공통 안내·아키텍처·정책·개발 서버 절차, 문서 목차, 소스 디렉터리, 주요 파일 크기·변경 이력, 테스트 명령·Playwright 설정, 최근 폰트 최적화와 과거 인계 기록.
- 변경: `AGENTS.md`, `CLAUDE.md`, `docs/README.md`; 신규 `docs/refactoring/{README,audit,tasks,progress}.md`.
- 결과: 전체 범위를 15개 진단 영역으로 분류하고 8개 회차 관리 작업, 초기 관찰 8건, 기준선 5종, 작업 카드와 성능 기록 형식, 재개·인계 절차를 준비.
- 검증: `git diff --check`, `cmp AGENTS.md CLAUDE.md` 종료 0. 읽기 전용 인라인 Node 검사로 7개 파일의 UTF-8/LF·최종 개행·줄 끝 공백, 상대 링크/앵커 43개, 진단/관찰/기준선/작업/결정 ID 정의 41개를 검사해 오류 0. 명령·브라우저 설정은 현재 package.json과 Playwright 설정 파일에 대조.
- 결과 상태: RF-000 완료. RF-001/RF-002 착수 가능. 전체 진단·앱 검증·성능 측정은 후속 작업.
- 커밋: 없음. 위 7개 파일의 문서 변경만 작업 트리에 존재.

## 세션 S002 — 2026-09-12

- 요청: 기록한 전체 계획에 맞춰 서브에이전트를 어떻게 활용할지 구체화.
- 시작: HEAD는 S001과 동일. S001의 7개 문서 변경이 미커밋으로 존재하며 보존했다.
- 조사: 15개 진단 영역과 RF-001~007의 의존성, 기본/기관 Playwright의 공유 포트·보고서 경로를 대조.
- 변경: `docs/refactoring/{README,audit,tasks,progress}.md`. 단계별 위임 기준, 12개 조사 묶음과 전체 영역 대응, 배정/반환 형식, 보고서 검수, 파일·실행 자원 소유권, 세션 재개 기록을 추가.
- 결정: D006/D007. 첫 배정은 W01(검증 경로), W02(개발·빌드·배포), W03(수집·저장). 주 담당은 환경과 전체 범위·공통 계약을 확인한다.
- 검증: `git diff --check`, `cmp AGENTS.md CLAUDE.md` 종료 0. 읽기 전용 인라인 Node 검사에서 7개 문서의 로컬 링크/앵커 49개, 조사 묶음 12개와 주 담당 영역 3개의 전체 범위 대응, 회차 작업 8개·결정 7개·미착수 상태·UTF-8/LF를 확인해 통과. 앱 검사·성능 측정·조사 에이전트 실행은 하지 않음.
- 상태: RF-000 완료 유지, RF-001/RF-002 `ready`, W01~W12 `pending`. 다음은 상단 재개 지점.
- 커밋: 없음. S001부터 누적된 7개 문서 파일이 미커밋 상태.

## 세션 S003 — 2026-09-12

- 요청: 정교한 탐색으로 개선 필요 사항을 확인하고, 결과를 보며 실제 작업 대상을 구분한 뒤 구현하는 순서인지 확인.
- 확인: 기존 계획에 진단→우선순위→구현은 있었으나 사용자 선정 조건은 명시되지 않았다.
- 변경: `README.md`, `tasks.md`, 이 진행 기록에 진단/구현 경계, 보고서 내용, 추천과 사용자 선택의 구분, RF-004 완료 조건과 미선정 상태를 명시했다.
- 결정: D008. 조사·보고서 준비를 먼저 완료해 제시하고 사용자의 대상 선택 뒤 구현한다. 선정된 범위 내 재확인은 반복하지 않는다.
- 검증: `git diff --check`, `cmp AGENTS.md CLAUDE.md` 종료 0. 인라인 Node 검사로 7개 문서의 로컬 링크/앵커 49개·UTF-8/LF와 RF-004 선정 선행 조건·미선정 상태를 확인해 통과. 실제 탐색·앱 검사·구현은 시작하지 않았다.
- 커밋: 없음. 앞선 문서 변경을 보존했고 모두 미커밋 상태다.

## 세션 S004 — 2026-09-12

- 요청: RF-001~003의 정교한 탐색 및 RF-004 선택용 보고서 작성까지만 진행. 최대3 worker, 소스/설정/저장형식/영구테스트 개선 금지, 사용자 선정 전 구현 금지.
- 시작: HEAD/main 및 기존 미커밋 변경은 S003과 동일. AGENTS/정본/정책과 기록을 읽고 Orca orchestration skill의 실행/반환/자원 회수 절차를 사용했다. 앱 구현 skill은 적용하지 않았다.
- 조사: 추적2,248파일을15영역에 배정, 주 담당 A01/A11/A15와 W01~W12 전체 반환 검수. source graph601모듈/1,297 edges, 실제 tooling 예외2개, 영역별 생산→저장→API→상태→표시/소비자와 유지 구조를 연결했다. 대표 경로 밖은 명시적 부분 확인과13개 후속이다.
- 검사: 표준 환경의 격리 `npm run check` exit0(backend1,141pass/1skip, frontend1,539pass, buildpass); shared14pass. 첫 DISABLE_COLLECTION 주입 실패는 실행 환경 원인으로 분리. Python4파일·Node nginx정적1·stub deploy lock 통과. QCD 실자료/prototype 별도build/nginx runtime/실운영 검증은 미실행 이유 기록.
- 브라우저: 기본13spec/357사례214pass58fail85skip, exit1,1,896.03s. 기관2spec×6project24pass,exit0,218.53s. 기본iPad Chromium과 제한WebKit을 구별.58실패를 분류하고 실제/기대 이미지를 검토했다. screenshot baseline 갱신 없음.
- 자료 경계 예외: 최초 `--list`에 DATA_PATH 격리를 빠뜨려 기존 DB open/schema 경계를 밟음. 기존2계정·신규0, 전후hash없어 무변경 증명 불가. 이후 runner/server·임시재현은 모두 격리. 원래 weather root에 collector/시연 mutation을 실행하지 않았다.
- 측정: production main/terminal 첫·재방문 각5, API8그룹·일반cold/warm·timeRules의 read/CPU/elapsed/RSS, map idle/switch 각5. terminal도 entry3,347,094B decoded를 요청, timeRules 반복35reads/114,126,422B. 지도10회전환의 GC후증가 중앙62.009MiB vsidle0.216MiB. 원인/plateau 미확인, terminal은운항종료화면, 외부수집worker성능미측정.
- 재현: live/demo fallback·overseasabort·KTG·bodytimeout·metadata/decode·actualReactpoll race·저장routeModel·raster A→B→A·풍속/운고·기관material/geometry/alert·terminalnull/cursor·개인감시시각/상한/invalidETA·admin신호/낙뢰계수/미완료백업. 모두 소스 유지+임시 입력. 자세한 값과 조건은 report/common/baseline에 있어 원시artifact가 없어도 판단 가능하다.
- 반대 근거: NOTAM 초기전용 명시 테스트를 확인해 첫 버그 해석을 철회하고 정책 질문으로 수정. monitoring ground 경보 숨김은 상충하는 dated 요구를 기록, 실제 사용자 의도 확인 전 CSS오타로 단정하지 않음. 모델6실패는 초기sounding/profile 기대 차이. terminal 간격 실패는 국내에서 생략한local clock을 읽는 검사 조건으로 좁혔다.
- 산출물: report63개 선택카드(RF-100~162), OBS009~071 및 유지OBS090~093, audit15영역+12상세보고+common, baseline5종, tasks/progress/README 갱신. 앱코드/설정/저장형식/영구테스트는 개선하지 않았다.
- 검증: 문서22파일 UTF-8/LF·최종개행·공백·상대링크/앵커,63후보 선택/OBS·15영역·12W·13후속 대응; `git diff --check`, `cmp AGENTS.md CLAUDE.md`, 시작/종료 dirty path·포트·worker 자원 점검. 최종 문서 검사22파일/308링크/63후보/15영역/12W 오류0,13후속을 확인했다. diff check와 AGENTS/CLAUDE 비교는 exit0, 시작 dirty path와 동일하며 app 변경0,3001/5173리스너0, active/reclaimable worker0이다.
- 상태: RF-001/002/003 done(진단 산출물), RF-004 **in_progress — 보고 완료·사용자 선정 대기**. 당시 실제 사용자 선택0이어서 RF-005~007은 착수 전이었다. 모든 영역의 모든 런타임 검증/제품 무결성을 완료했다고 주장하지 않는다.
- 커밋/배포: 없음. 시작 미커밋 변경을 보존하고 계획 문서와 ignored 증거만 추가/갱신했다.
- 다음: 사용자 선택을 tasks에 기록한 뒤 선정 범위만 진행. 다음 세션 S005. 과거 worker 재시작이나 전체검사 반복이 첫 행동이 아니다.

## 세션 S005 — 2026-09-12

- 요청: 리팩토링 범위를 판단할 수 있도록 디렉터리 구조·코드 의존성·파일 분리에 대한 종합평가를 진단 보고서에 명시.
- 시작: HEAD/main과 기존 미커밋 경로는 S004와 동일. 완료된 공통 조사·W04/W06·관련 후보, Architecture와 지도·자료·진입 정책을 대조했다. 전체 조사·테스트·브라우저·성능 재실행 및 새 worker 배정 없음.
- 변경: `docs/refactoring/{report,README,tasks,progress}.md`. 보고서 앞에 구조 평가, 의존성 분석 범위·도구 예외, 초기 세 파일의 역할별 판단, 보완할 책임 경계·검증 기준과 기존 카드 연결을 추가했다. README의 보고서 역할과 RF-004 기록을 맞췄다.
- 판단: 큰 디렉터리·런타임 의존성 방향은 대체로 적절하다. 경로 상태·자료 읽기·화면 진입점·공용 스타일은 확인한 소비 흐름에 맞춰 보완할 후보이며, 전면 재설계를 필수로 권고할 근거는 없다. 실운영 무결성이나 모든 동적 의존성을 검증했다는 의미가 아니다.
- 검증: `python3 artifacts/refactoring/S005/verify-docs.py` 종료0. 문서22파일·로컬링크/앵커326개·후보63개·영역15개·W보고12개 및 후속 대응, UTF-8/LF·최종개행·공백 오류0. `git diff --check`와 `cmp AGENTS.md CLAUDE.md` 통과. 편집 전후 추적 파일 SHA-256 변화0, 기존 dirty 경로 동일, 임시 도구의 ignore 적용 확인. S004의 앱 검사 결과는 과거 기준선으로 유지하며 재실행하지 않았다.
- 상태: RF-001~003 done 유지, RF-004 **in_progress — 보고 완료·사용자 선정 대기**, 후보63개·실제 선정0개 유지. 앱 코드·설정·저장 형식·영구 테스트 변경 없음. 커밋·푸시·배포 없음.
- 인계: 임시 문서 검증·편집 전 스냅샷은 ignored `artifacts/refactoring/S005/`. 다음 세션 S006은 최신 사용자 선정이 있으면 tasks에 ID·부분 범위·순서·날짜를 기록하고 해당 범위만 진행한다.

## 세션 S006 — 2026-09-12

- 요청: 앞서 제안한 구현용 모델 구성이 토큰을 과하게 사용할 수 있으므로 프로젝트의 실제 난도에 맞춰 조정.
- 근거·판단: 기존 후보에서 영향도와 구현 난도를 구분했다. 원인·소비 경로가 좁혀진 수정은 Terra부터 시작하고, 상태 경쟁·공통 계약은 추론 강도를 높이며, 미해결 분석만 상위 모델에 한정한다. 새 전체 조사나 모델 비교 벤치마크는 수행하지 않았다.
- 변경: `docs/refactoring/{tasks,README,progress}.md`. 난도별 모델·예시·상향 조건, 기본 서브에이전트0~1명, 중복 문맥·조사·검증 실행을 줄이는 기준을 기록했다. 다음 구현 세션의 주 담당 추천은 Sol/medium이다. 현재 대화 모델과 전역 Codex 설정은 변경하지 않았다.
- 검증: `python3 artifacts/refactoring/S006/verify-docs.py` 종료0, 문서22파일·로컬링크/앵커328개·후보63개·영역15개·W보고12개 및 후속 대응 오류0. `git diff --check`, `cmp AGENTS.md CLAUDE.md` 종료0. 앱 테스트·브라우저·성능 및 에이전트 실행 없음.
- 상태: 모델 배정 정책만 변경. 구현 카드 선정0개, RF-004 **in_progress — 보고 완료·사용자 선정 대기** 유지. 앱 코드·설정·저장 형식·영구 테스트 변경, 커밋·푸시·배포 없음.
- 다음: S007에서 최신 사용자 선정과 이 배정 기준을 적용하고, 해당 카드에 난도·실제 모델·추론 강도를 기록한다. 기존 조사를 반복하지 않는다.

## 세션 S007 — 2026-09-12 (선정 범위 통합 검증 완료)

- 요청·선정: RF-103→RF-157 서버 gate 한정→RF-100→RF-101→RF-102를 구현·검증한다. UI capability와 dev overlay/reset/tick 전체 개편, 타 모델 저장 통합, 나머지 후보는 제외한다.
- 시작: HEAD/main은 `075eb89a8a2ffe5fde8ccf9bf1cbec954284fa41`. S001~S006의 공통 안내 3개와 `docs/refactoring/` 미커밋 변경, `backend/data` 로컬 자료를 보존했다.
- RF-103: Playwright runner가 ignored artifacts의 고유 DATA_PATH를 backend와 worker에 전달하고 종료 시 소유 root만 정리한다. admin fixture DB import를 실제 test `beforeAll`로 늦췄고 기관 config를 두 spec의 `testMatch`로 고정했다. list/grep 전후 기존 DB SHA-256 `fb53a69b...62` 불변, 새 DB root 없음, 기관 2파일 24 case, 실제 admin desktop 1/1 pass. 첫 실제 실행에서 worker config가 경로를 재생성해 401이 난 새 실패를 확인했고 CONTRACT_DATA_PATH 상속으로 수정 후 통과했다.
- RF-157: `ENABLE_TEST_MUTATIONS=1`, non-production/non-unit-test, 명시 DATA_PATH를 요구하는 server mount helper를 추가했다. DISABLE_COLLECTION은 gate와 독립이며 `serve:test`가 명시 플래그를 설정한다. UI capability와 라우터 내부 기능은 변경하지 않았다. gate/mount/익명401·인증200 4/4 pass.
- RF-100: store의 active `getCached`와 collector live `getLiveCached`를 분리하고 카드의 일곱 호출자만 전환했다. demo 활성 중 live 신규 게시가 active demo를 덮지 않으면서 live 읽기에는 보이는 테스트와 관련 processor 검사 36/36 pass.
- RF-101: 해외 예보 request·loop·대기·게시 직전에 AbortSignal을 전달/확인한다. 취소는 reject되어 빈/부분 결과를 저장하지 않고 runWithLock이 cancel skip을 기록한 뒤 lock을 해제한다. 정상 부분 성공은 실패 공항의 마지막 live 자료를 stale로 유지한다. 관련 취소/부분 성공/lock 검사 포함 14/14 pass.
- RF-102: Orca run `run_72ce89168b87`, task `task_4cc9cfccf6c8`, dispatch `ctx_d332bf2bf6ac`에 Codex `gpt-5.6-terra` / `high`를 배정했고 requested/effective가 일치했다. KTG 전용 complete marker와 coords/grid 구조 검사를 추가해 coords-only·누락·손상·중간 실패를 재시도하고 legacy 완전 자료는 재다운로드하지 않는다. worker 반환 뒤 주 담당이 diff와 7/7 집중 검사를 재확인했고 terminal release·delivery ack·reclaimable 0을 확인했다.
- 추가 실제 배정과 마감: RF-100/101 독립 검토 1차는 Codex `gpt-5.6-terra` / `high` (dispatch `ctx_e17c3c9280d3`)였으나 `consumer_fenced`로 결과를 사용하지 않았다. 재시도 `ctx_1ed0e757da74`는 같은 모델·추론 강도로 관련 72 tests를 통과했다. 브라우저 검증은 Codex `gpt-5.6-terra` / `medium` (dispatch `ctx_7c416a8ccab5`)으로 admin-console 30 pass와 기관 24 pass / 0 fail / 0 skip, 격리 DATA_PATH teardown 및 포트 정리를 확인했다. 문서 마감은 Codex `gpt-5.6-terra` / `medium` (`task_3b1afc21edaf` / `ctx_2b45d762c5cf`)이 맡았고, 최종 통합은 Codex `gpt-5.6-terra` / `high` (requested=effective) (`task_594ff9ac3c6b` / `ctx_c90c33a1b1ac`)가 수행했다.
- 최종 검증: 지정한 `DATA_PATH=/home/john_doe/ProjectAMO/artifacts/refactoring/S007/final-check-data`, `TMPDIR=/home/john_doe/ProjectAMO/artifacts/refactoring/S007/final-check-tmp`, `DISABLE_COLLECTION` unset 환경에서 `npm run check` exit 0. 추가 집중 재실행은 26 pass / 0 fail / 0 skip이었다. `git diff --check`, AGENTS/CLAUDE 동일성, 원본 DB SHA-256 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62`, 3001/5173 비점유, 두 격리 자료 경로 제거를 확인해 RF-005~007을 `done`으로 마감했다.
- 범위 제한: 전체 브라우저 357사례(기준선 214 pass / 58 fail / 85 skip)와 B04/B05 성능은 S007 변경 범위 밖이라 재실행하지 않았다. 기존 baseline의 결과·실패·skip·성능 제한은 그대로이며, 영향 계약의 확정 결과와 혼합하지 않는다.
- 변경 원칙: server.js·MapView.jsx·useRouteBriefing.js 전면 분리 없음, 새 의존성·마이그레이션 없음, 커밋·푸시·배포 없음.

## 세션 S008 — 2026-09-12 (RF-104→RF-105 완료·RF-106 정적 계약 구현/통합 검증)

- 요청·선정: 사용자 지시에 따라 RF-104→RF-105→RF-106을 실제 구현 대상으로 순서대로 선정했다. S007 선정·완료 기록은 변경하지 않으며, 선정 자체와 각 카드의 구현 완료를 분리한다.
- 부분 범위: RF-104는 `package.json` root check 연결과 root-checks 정책의 공통·오프라인 검사 범위만 포함한다. RF-105는 header 뒤 body 완료/abort까지의 transport timeout 수명과 cleanup 검사, RF-106은 nginx 직접 서빙과 backend 차단의 URL·cache 계약만 포함한다. RF-104 prototype 의존성 추가, RF-105 retry 정책 확대, RF-106 운영 배포·전체 binary 차단·실운영 노출 판정은 이번 부분 범위 밖이다.
- 실제 배정·결과: RF-104 `gpt-5.6-terra` / `medium` (`ctx_b70e57ee1f86`)과 RF-105 `gpt-5.6-terra` / `high` (`ctx_649f6ea661ee`)은 완료했다. 독립 읽기 검토 Codex `gpt-5.6-terra` / `high` (`task_7d440895e81e` / `ctx_97b183e8ca0b`)가 운영 `/tmp` lock 충돌을 발견했고, RF-104 lock 보완 Codex `gpt-5.6-terra` / `high` (`task_3407ee6ff230` / `ctx_87b523792c84`)이 검사 전용 고유 lock으로 정정했다. RF-106 `gpt-5.6-terra` / `high` (`ctx_9009f1d6850d`)은 정적 계약 구현을 완료했고, 기록은 `gpt-5.6-terra` / `medium` (`ctx_a55eb47b0beb`)이 맡았다. 최종 통합은 Codex `gpt-5.6-terra` / `high` (`task_dd3d022e33e4` / `ctx_780946f4e392`), 최종 재검증은 같은 모델·추론 강도 (`task_7255f489f99e` / `ctx_3e17e396c74b`)에서 최신 전체 diff로 수행했다.
- 통합 결과: 지정 격리 환경의 최신 `npm run check`은 exit 0이다. `test:offline`은 shared 14건·nginx 정적 계약 4건·deploy lock 검사를 포함하고, request-observability 15건과 관련 집중 suite 36건도 통과했다. nginx/backend 정적 계약, 원본 DB SHA-256 보존, 3001/5173 비점유와 S008 격리 data/tmp 정리는 확인했으나, UI 코드·브라우저 계약 대상 변경이 없어 browser contract는 실행하지 않았고 이를 통과로 세지 않는다.
- 제한·재개 조건: nginx binary 부재로 `nginx -t`와 실제 HTTP는 미실행이다. nginx를 설치하고 example과 active data root를 반영한 환경에서 exact raw binary 404, published frame 200/cache, metadata no-cache, DB/organization-file 404와 live/demo 전환 후 재검증하면 RF-106 runtime 한계를 닫을 수 있다. prototype의 `react-icons/md` 누락은 기본 check 밖의 별도 의존성 문제로 그대로 남기며, 의존성 추가 또는 prototype build 편입을 별도 선정할 때만 다룬다.

## 세션 S009 — 2026-09-12 (전체 1단계 마감)

- 요청·선정: RF-106 runtime → RF-123 → RF-107~109 → RF-121~122 → RF-150~151 → RF-157 잔여 → RF-158~162를 실제 구현 대상으로 순차 선택했다. selection은 표의 사용자 선택 사실이고, implementation은 각 카드의 현재 diff·관련 검증과 별도로 대조했다.
- 실제 구현·배정: 모든 실제 작업은 Codex `gpt-5.6-terra`의 `medium` 또는 `high`이고 상향은 없었다. RF-106 runtime `ctx_3cb5362fdc2a`, RF-121 `ctx_61154f37ae37`, RF-150 `ctx_6d5e963ab372`, RF-151 `ctx_991469cc998d`, RF-158 `ctx_3e712226b47f`, RF-159 `ctx_54abd3583492`, RF-160/162 `ctx_4d86635b9961`, RF-161 `ctx_a5bb436d04a6`, 보완 `ctx_6e5148cfa5ed`를 포함해 카드 범위와 frontend 연결까지 확인했다. RF-107~109, RF-122, RF-123, RF-157의 실제 작업도 Terra medium/high로 수행했으며, 카드별 상세와 집중 결과는 tasks와 `artifacts/refactoring/S009/`에 보존했다.
- browser 집중 결과: RF-107~109 5 pass, admin 30 pass, settings 5 pass, RF-123 FPL 1 pass·terminal 69·ground 8·monitoring visual 8을 확인했다. RF-151 fixture HTTP/shell과 준비된 Playwright 계약도 확인했고, snapshot은 필요한 경우만 개별 검토·갱신했다.
- 최종 검증: 격리 `DATA_PATH`/`TMPDIR`, `DISABLE_COLLECTION` unset에서 `npm run check` exit 0이다. `git diff --check`, AGENTS=CLAUDE, 원본 DB SHA-256 `fb53a69bd31f8d7c0f68eedfc299dc33b636cc68cac5adf85ad461f2e9b4fd62`, 3001/5173 비점유를 통과로 기록한다.
- 제한: 전체 browser final은 마지막 세 수정 전에 시작했다가 독립 검토 결함 때문에 중단했으며, 사용자 과검증 중단 지시 뒤 수정 후 전체 재실행을 하지 않았다. 모바일 route-token 최종 묶음도 중단되어 전체 browser 통과로 산입하지 않는다. 수정 파일은 저장됐고 `npm run check`는 통과했지만, 이를 전체 browser final 통과로 읽지 않는다.
- 다음 Stage 2: RF-110을 사용자 선택으로 좁혀 route action과 mobile token 표면의 제품 범위·contract oracle을 먼저 확정한다. 이 추천은 구현 지시가 아니며 RF-004~007 및 S007/S008 기록을 변경하지 않는다.

## 후속 세션 기록 형식

다음 세션은 S009부터 추가한다. 상단의 재개 지점과 마지막 검증도 함께 갱신한다.

```text
세션 ID / 날짜 / 작업 ID:
시작 HEAD·브랜치·관련 기존 변경:
수행한 조사·변경 / 확인한 근거:
검증 명령·실행 위치·환경/데이터·종료 코드·통과/실패/skip:
핵심 결과(원시 artifacts가 없어도 판단 가능하게):
계획과 달라진 점·결정 ID:
커밋 또는 미커밋 파일 / 원시 로그·캡처 경로:
남은 일·차단 이유·재개 조건:
다음 작업 ID와 첫 행동:
```
