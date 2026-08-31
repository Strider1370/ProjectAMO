# 수집기 실행 이력과 미실행 감지 설계

**작성일:** 2026-08-31

**상태:** 사용자 검토 대기

## 배경

2026-08-31 지상예보 수집기는 11:30 KST에 마지막으로 성공한 뒤, 14:30·17:30 KST 예정 실행의 콜백이 시작되지 않았다. 다른 수집기는 계속 실행됐고 API 키도 활성 상태였다. 현재 시스템은 마지막 성공 시각만 남기므로, 이 사례를 오래된 자료로만 보며 `수집기가 실패했는지`, `의도적으로 건너뛰었는지`, `스케줄러가 실행하지 않았는지`를 구분할 수 없다.

## 목표

모든 백엔드 수집기가 다음 질문에 관리자 콘솔과 서버 로그만으로 답하게 한다.

1. 언제 실행할 예정이었는가?
2. 실제로 시작했는가?
3. 어떻게 끝났는가?
4. 수집 실행은 성공했지만 자료 품질에 경고가 있는가?
5. 예정된 실행이 시작되지 않았다면 언제부터인가?

외부 메시지·이메일·텔레그램 알림은 이 범위에 넣지 않는다. 이상 상태는 관리자 콘솔에 표시하고 서버 로그에 남긴다.

## 기존 구조와 판단

- `backend/src/stats.js`는 성공·실패·skip과 공용 최근 50건만 보존한다. 시작 이벤트와 수집기별 이력이 없다.
- `backend/src/admin/data-health.js`는 마지막 성공 시각으로 자료 신선도를 판정한다. 예정 실행의 미시작을 판정할 근거가 없다.
- `saved: false`는 내용이 같아 새 파일을 만들지 않았다는 뜻일 수 있으므로 실패가 아니다.
- `failedAirports`에는 실제 수집 실패뿐 아니라 일부 제품에서 허용된 설정 누락도 포함된다. 전 수집기에 공통인 실행 실패 기준으로 쓰면 안 된다.
- 기존의 자료 건강도는 계속 자료의 최신성·가용성을 나타내고, 새 실행 이력은 스케줄러와 수집 실행을 나타낸다. 두 상태를 하나의 신호등으로 합치지 않는다.

## 설계

### 1. 수집 실행 기록 모듈

`backend/src/collectors/execution-log.js`를 수집 실행 관측의 깊은 모듈로 둔다. 스케줄러와 관리자 라우터는 이 모듈의 작은 인터페이스만 사용한다.

```js
recordStart({ collector, scheduledFor, startedAt })
recordFinish({ runId, outcome, finishedAt, durationMs, summary, error })
recordMissed({ collector, scheduledFor, detectedAt, deadlineAt })
readCollectorStatus({ now })
readCollectorRuns({ collector, limit, before })
checkForMissedRuns({ now })
```

- `collector`는 `runWithLock`의 type이며, 모든 스케줄 수집기는 등록 대상이다.
- `scheduledFor`는 예정된 실행 시각, `startedAt`과 `finishedAt`은 UTC ISO 문자열이다.
- `summary`는 저장 여부, 부분 수집 오류 수, 실패 공항 수처럼 관리자 원인 추적에 필요한 비밀 없는 구조화 요약만 담는다. 원본 응답이나 API 인증키는 기록하지 않는다.
- 이 모듈은 SQLite의 실행 이력과 현재 상태를 함께 관리한다. 호출자는 테이블·보존·중복 방지 규칙을 알 필요가 없다.

### 2. 실행 결과의 의미

| 실행 outcome | 기준 | 콘솔 의미 |
| --- | --- | --- |
| `succeeded` | 수집기가 예외 없이 완료됨. `saved: false`도 포함 | 실행 성공 |
| `degraded` | 수집은 완료됐지만 모듈이 명시한 실제 부분 수집 경고가 있음 | 실행 성공 · 자료 확인 필요 |
| `failed` | 수집기가 예외로 종료했거나 유효한 결과를 만들지 못함 | 실행 실패 |
| `skipped` | `already_running`, `api_hub_key_blocked`, 시연 전환 취소처럼 명시 사유가 있음 | 의도·보호 로직에 따른 미실행 |
| `missed` | 예정 시각의 유예기한까지 `recordStart`가 없음 | 스케줄러 미실행 |

`degraded` 판정은 전역 `failedAirports` 배열에 의존하지 않는다. 각 수집기가 반환하는 명시적 품질 요약을 사용하며, 설정상 허용된 누락은 경고가 아니다. 기존 `data-health`의 `ok/late/stopped`는 여전히 자료 최신성 상태다.

### 3. 예정 실행 계약과 watchdog

수집기 등록을 한 곳으로 모아, cron 식·시간대·최대 기대 간격·유예시간을 같은 선언에서 제공한다. cron 식을 별도의 카탈로그에서 역해석하거나 중복 입력하지 않는다.

- 등록 wrapper는 node-cron에 콜백을 등록하고, 그 콜백이 호출된 순간 `recordStart`를 먼저 남긴다.
- 1분 `setInterval` watchdog는 등록된 실행 계약과 마지막 시작 기록을 대조한다.
- 최대 기대 간격과 유예시간을 넘겨 새 시작이 없으면 `missed`를 한 번 기록하고, 같은 예정 실행에 대해 중복 기록하지 않는다.
- 예: 지상예보는 3시간 주기와 35분 유예를 사용한다. 14:30 KST 예정 작업이 15:05까지 시작되지 않으면 `missed`다.
- 야간/운항시간 제한처럼 의도적으로 실행하지 않는 구간은 계약에 명시해 `missed`에서 제외한다.
- watchdog도 같은 Node 프로세스이므로 프로세스 전체 정지·호스트 장애를 감지하지는 못한다. 이 범위는 PM2/호스트 관측의 책임으로 남긴다.

### 4. 저장과 보존

SQLite에 다음 두 종류의 자료를 둔다.

1. `collector_runs`: 시작·종료·skip·missed의 불변 실행 이력. 수집기, 예정·시작·종료 시각, outcome, duration, 안전한 요약, 오류 코드를 저장한다. **90일** 보관한다.
2. `collector_state`: 수집기별 마지막 예정·시작·종료·outcome·missed 사건을 요약한 현재 상태. 서버 재시작 뒤 watchdog가 즉시 같은 사건을 중복 생성하지 않게 한다.

정리는 새 실행 이력 기록 시 수행한다. `stats/latest.json`은 기존 성공률·공항별 통계의 호환성을 위해 유지하지만, 실행 이력의 단일 진실원은 SQLite다.

### 5. 서버 로그

모든 실행은 기존 PM2 stdout/stderr에도 사람이 읽을 수 있는 한 줄을 남긴다.

```text
[collector] ground_forecast scheduled=2026-08-31T05:30:00Z started run=...
[collector] ground_forecast succeeded run=... duration_ms=15324 saved=true warnings=0
[collector] ground_forecast missed scheduled=2026-08-31T05:30:00Z deadline=2026-08-31T06:05:00Z
```

오류는 메시지와 분류 코드만 기록한다. 요청 URL의 인증키·응답 본문·세션 정보는 로그나 SQLite에 저장하지 않는다.

### 6. 관리자 콘솔

기존 자료 수집 화면을 확장한다. 자료 신선도 표는 유지하고, 각 수집기 행에 아래를 추가한다.

- 실행 상태: 정상, 부분 성공, 실패, 건너뜀, 미실행
- 마지막 예정 / 시작 / 완료 시각
- 다음 실행 한계와 남은 시간 또는 초과 시간
- 마지막 실행의 소요시간·안전한 요약·오류 메시지
- 최근 실행 이력 펼침: 예정 시각, 시작·종료, outcome, 소요시간, 원인

상단에는 `failed`와 `missed` 수를 별도로 표시하고, `missed`가 있으면 자료가 아직 `late`일 뿐이어도 문제 목록에 포함한다. 기존 `data-health`의 `late/stopped` 수와 섞지 않는다.

관리자 전용 `GET /api/admin/collector-status`와 `GET /api/admin/collector-runs`가 위 데이터를 제공한다. 기존 `/api/admin/data-health` 응답 계약은 호환성을 유지한다.

## 오류 처리

- SQLite 기록 실패는 수집기를 실패시키지 않지만, 서버 로그에 `collector_observability_write_failed`로 남긴다. 콘솔은 마지막으로 읽을 수 있는 상태를 표시한다.
- 새 수집기가 실행 계약에 등록되지 않은 경우 개발·테스트에서 명시적으로 실패시킨다. 조용히 관측에서 빠지면 안 된다.
- restart 직후에는 `collector_state`를 복구한 뒤 watchdog를 시작한다. 재시작 자체로 과거 슬롯을 모두 `missed`로 만들지 않고, 재시작 이후의 유예기한만 판정한다.
- 수동 초기 수집은 `scheduledFor`를 시작 시각으로 기록하고, 정규 cron 슬롯의 미실행과 구분한다.

## 검증

1. 실행 기록 모듈 단위 테스트: start→succeeded, failed, skipped, degraded, 90일 보존 정리.
2. watchdog 단위 테스트: 지상예보처럼 3시간 주기의 수집기가 유예시간을 넘기면 한 번만 `missed`가 되는지, 시작 후에는 미실행이 해소되는지, 야간 제외가 적용되는지.
3. 수집 wrapper 테스트: 모든 스케줄 등록이 실행 계약을 함께 등록하고, 시작 기록이 processor 호출보다 먼저 만들어지는지.
4. 결과 분류 테스트: `saved:false`는 succeeded이고, 허용된 매핑 누락은 degraded가 아닌지, 실제 부분 수집 오류만 degraded가 되는지.
5. 관리자 API 테스트: 관리자만 실행 상태·이력을 읽을 수 있고, non-admin은 기존 인가 규칙대로 거부되는지.
6. 관리자 콘솔 단위/계약 테스트: `missed`가 자료 최신성 상태와 별도 문제로 보이고, 최근 이력의 시간·원인이 표시되는지.
7. Playwright: 관리자 자료 수집 화면에서 `missed`와 `failed`의 구분, 이력 펼침, 정상 상태를 브라우저로 확인한다.
8. 운영 검증: 배포 뒤 지상예보의 다음 정규 실행에서 서버 로그·SQLite 이력·관리자 콘솔 모두 같은 예정/시작/종료 시각과 `succeeded` 결과를 보이는지 확인한다.

## 범위 밖

- PM2·EC2·AWS 외부 가용성 감시 및 자동 복구
- Slack, 이메일, 텔레그램 등 외부 통보
- 수집기의 자동 재시작 또는 자동 재실행
- 원본 API 응답 전문·인증정보 보존
- 기존 2026-08-10 서버 응답 계측 설계의 API 요청 분포/백분위 기능
