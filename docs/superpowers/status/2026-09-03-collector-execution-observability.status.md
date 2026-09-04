# 수집기 실행 관측 Status

Updated: 2026-09-03 KST
State: **구현 재개 — 아직 푸시·배포하지 않음**
Branch: `main` (`origin/main` 대비 로컬 커밋 8개 앞섬)
Spec: `docs/superpowers/specs/2026-08-31-collector-execution-observability-design.md`
Plan: `docs/superpowers/plans/2026-08-31-collector-execution-observability.md`
SDD ledger: `.superpowers/sdd/2026-08-31-collector-execution-observability/`

> **2026-09-04 구현 현황 (이 문서의 이전 미완료 목록보다 우선):** 코드 구현은 완료 단계다. 아직 원격 푸시·서버 배포는 하지 않았다. 사용자 연구 문서는 계속 이 작업의 대상이 아니다.

## 2026-09-04 완료 구현

- 모든 등록 외부 API는 `request-observability` wrapper로 정책 검증, API Hub 물리 호출량, 최종 성공/실패, UTC 시작·완료 시각, 소요 시간을 남긴다. 인증키·Bearer 값과 URL query는 로그·저장 오류에서 제거한다.
- API Hub의 위성 워커는 별도 프로세스라 부모 stats 파일을 직접 쓰지 않는다. 대신 응답 endpoint·상태·소요 시간을 IPC로 보내고, 부모가 사용량 장부와 API 실행 상태를 함께 기록한다.
- API operation registry는 새 호출의 provider/matcher/정상 호출 계약/관리자 행 관계의 단일 등록 지점이다. 위성 IR·FOG·CI·CTPS·가시 자료도 해당 수집기의 다음 예정 시각을 상속한다.
- `/api/admin/data-health`는 자료 행별 API 실행 결과·소요 시간·정상 주기·다음 예정과 별도로 `collectorExecution`, 현재 실패 API 목록(`apiProblems`)을 제공한다. 온디맨드 실패도 상단 API 경고에 포함한다.
- 관리자 콘솔은 상단 API/수집 경고와 메뉴 배지, 개요의 실행 문제, 자료 수집의 watchdog 미실행/실패 목록, 자료별 API 실행 열, API 사용량의 온디맨드 실행 목록을 표시한다. API Hub 열쇠가 없더라도 온디맨드 상태 화면은 숨기지 않는다.
- PM2 배포 경로는 10MB 또는 자정 회전, gzip 압축, 로그 스트림당 7개 보관을 idempotent하게 설정·검증한다.

### 최신 검증 근거

```sh
npm --prefix backend test -- test/admin-data-health.test.js test/admin.test.js test/stats-execution.test.js test/request-observability.test.js test/satellite-usage-report.test.js
npm --prefix frontend test -- src/features/admin/lib/adminFormat.test.js src/features/admin/lib/menus.test.js
npm --prefix frontend run build
graphify update .
git diff --check
```

위 명령은 2026-09-04 로컬에서 통과했다. 브라우저 계약은 메뉴 배지 때문에 모호했던 전역 버튼 선택자를 사이드바 범위 선택자로 고쳤고, 로그인 제한을 넘지 않도록 한 worker 안에서 발급 세션을 재사용한다. 데스크톱·iPad 가로·모바일 21개 계약이 통과했다. 외부 기상 API를 호출하는 검증은 수행하지 않는다.

## 사용자 확정 범위

- KMA API HUB뿐 아니라 **모든 외부 API 호출**을 등록·관측한다.
- 정기/조건부 API는 기존 관리자 데이터 상태 행에 연결해, 마지막 실행 결과와 정상 호출 주기·예정 시각을 보여 준다.
- 온디맨드 API만 기존 관리자 API 사용량 화면에서 표시한다. 데이터 상태 행에는 붙이지 않는다.
- 새 API 호출은 등록부에 선언하면 로그·상태·관리자 노출 대상에 자동 편입되어야 한다. 수동 목록을 따로 유지하지 않는다.
- 서버 로그는 원인 추적에 충분해야 하고, 문제가 생기면 관리자 콘솔에서 확인 가능해야 한다.

## 현재 완료된 기반 작업 — Task 1A

`backend/src/collector-registry.js`와 `backend/src/api-operation-registry.js`를 추가했다.

- 수집기의 활성 조건·스케줄·표시 이름을 선언형으로 정리했다.
- API HUB 엔드포인트 라벨/URL 매칭을 API 작업 등록부로 옮겼다.
- API별 호출 계약(수집기 소속 cron, 자체 cron, 조건부, 온디맨드), KST/UTC, quiet window, 다음 실제 예정 시각과 표시 문구를 계산한다.
- API HUB 및 알려진 직접 외부 호출의 기존 timeout·총 물리 시도 횟수(`maxAttempts`)·허용 override·예외 전송 경로를 등록부에 선언했다.
- 지상/중기예보의 `SELF_SIGNED_CERT_IN_CHAIN` 대체 전송은 등록부 메타데이터로만 모델링했다. 아직 공통 wrapper에는 연결하지 않았으므로 다른 호출에 TLS 검증 해제가 전파되지 않는다.
- 등록부는 URL/명시적 id의 일대일 대응, 중복·모호 매처, 잘못된 cron/quiet/policy/data-health 키 등을 시작 시 거부하도록 검증한다.

### 검증 근거

가장 최근 집중 회귀:

```sh
npm --prefix backend test -- test/collector-registry.test.js test/api-operation-registry.test.js test/api-hub-usage.test.js test/fetch-api-hub.test.js test/admin-data-health.test.js
```

결과: **43 passing, 0 failing**. 각 보완은 RED → GREEN으로 진행했고 `git diff --check`, `graphify update .`도 통과했다. 상세 기록은 `.superpowers/sdd/2026-08-31-collector-execution-observability/task-1-report.md`에 있다.

## 미완료 작업

Task 1 전체는 아직 완료가 아니다. 등록부가 실행 경로의 단일 진실 원천이 되기 전이므로, 현재 상태로는 모든 외부 호출의 실행 결과가 자동으로 상태/관리자에 나오지 않는다.

1. **계약 동기화 확인 후 Task 1A 확정**
   - 마지막 리뷰는 코드의 `maxAttempts` 전환을 승인했지만, 계획/작업 명세에는 옛 `maxRetries`가 남아 있다고 지적했다.
   - 계획 문서와 ignored SDD 작업 명세는 `maxAttempts`(첫 시도 포함 총 물리 HTTP 시도 횟수)로 이미 수정했다.
   - 마지막 독립 재검토가 통과했다. Task 1A는 확정됐고, Task 1의 실행 경로 이전은 계속 진행한다.

2. **Task 1B — 공통 관측 wrapper**
   - `backend/src/lib/request-observability.js`를 구현한다.
   - 물리 HTTP 시도마다 API HUB ledger를 정확히 한 번 기록하고, decode/논리 검증 뒤 Task 2의 bounded 최종 작업 상태(`lastStartedAt`, `lastFinishedAt`, `lastOutcome`, `lastIssue`, `durationMs`)를 갱신한다.
   - 실패 원인은 비밀값·응답 본문을 남기지 않는 구조화 로그로 남긴다.

3. **Task 1C — 모든 외부 호출의 wrapper 경유**
   - API HUB 전역 `fetch` monkeypatch를 제거한다.
   - `fetch`, `http/https.request|get`, `fetchWithTimeout` 직접 호출을 wrapper 하나로 이전하고, 새 직접 외부 호출을 막는 AST/lint guard를 추가한다.
   - 지상/중기예보의 선언된 fallback은 해당 오류에만 적용한다.

4. **Task 3 — 수집기 스케줄 등록부 연결 — 완료**
   - `index.js`의 정기 스케줄·활성 조건을 `COLLECTOR_REGISTRY`에서 읽고 시작 시 binding을 검증한다.
   - 정기/초기/수동 출처 기록, 1분 watchdog lifecycle, 안전한 한 줄 collector 로그를 연결했다.
   - `Architecture.md` Backend 절 갱신은 Task 1C 완료 시 실제 request wrapper와 함께 진행한다.

5. **관리자 API·화면과 운영**
   - `/api/admin/data-health` 응답에 비온디맨드 API의 상태·정상 호출 계약·다음 예정 시각을 데이터 상태 행별로 제공한다.
   - 온디맨드 API 상태는 기존 API 사용량 응답/화면에 제공한다.
   - `ApiUsageScreen` 및 데이터 상태 화면의 browser contract를 추가/갱신하고 실제 Playwright로 검증한다.
   - 로그 회전/보존, 관리자 경보 표시, 운영 문서/배포 절차는 계획의 나머지 Task에 따라 구현·검증한다.

## 재개 순서

1. `git status --short`와 이 문서의 브랜치/커밋 상태를 다시 확인한다. 사용자 연구 문서 `docs/research/2026-08-27-coast-guard-fixed-wing-pilot-feedback.md`는 다른 변경이므로 건드리지 않는다.
2. 마지막 독립 리뷰의 문서 계약 동기화 지적만 재검토한다. 통과 전 Task 1A 완료라고 표시하지 않는다.
3. SDD ledger의 Task 1을 계속 진행한다. Task 1B부터 TDD(RED 확인 후 GREEN), 과제별 독립 리뷰를 적용한다.
4. 코드 탐색 전 `graphify query`를 실행하고, 코드 변경 뒤 `graphify update .`를 실행한다.
5. 최종 단계에서 백엔드 회귀, 실제 관리자 API, Playwright browser contract, 배포 전 운영 검증을 모두 통과한 뒤에만 푸시·배포를 논의한다.

## 커밋과 작업 트리

로컬에만 있으며 아직 푸시하지 않은 관련 커밋:

```text
f5ad9101 docs: place on-demand api status in usage view
68457da6 feat(backend): add collector and API operation registries
faa3140d docs: record Task 1A verification
ae7fd06c fix(backend): tighten operation registry contracts
2bbeec91 fix(backend): validate operation contracts precisely
3b44e928 fix(backend): model API Hub transport policies
c26c7d7a fix(backend): model fallback transport policy
19ec3240 fix(backend): clarify operation attempt policy
```

현재 미커밋 변경:

- `docs/superpowers/plans/2026-08-31-collector-execution-observability.md`: `maxRetries`를 `maxAttempts`로 계약 동기화. 이 상태 문서도 함께 검토·커밋한다.
- `docs/research/2026-08-27-coast-guard-fixed-wing-pilot-feedback.md`: 사용자가 만든 미추적 연구 문서. 본 작업의 대상이 아니다.

`.superpowers/`는 ignored 작업 기록이므로, 여기의 ledger/brief/report는 참고용이며 커밋 대상이 아니다.
