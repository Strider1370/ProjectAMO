# 알림 감시 엔진 재구성 — 명세 초안

작성일: 2026-07-28  
상태: **초안 — 사용자 승인 대기**

## 1. 배경

현재 알림은 `backend/src/alerts/scheduler.js`가 15분마다 활성 예정 비행을 골라 전체 경로 브리핑을 재계산한 뒤, 메모리의 직전 스냅샷과 비교한다. 작은 규모에서는 동작하지만, 원천 기상 데이터가 변하지 않아도 같은 계산을 반복한다. 서버 재시작 시 비교 스냅샷이 사라지고, 이력이 있는 만료 감시본은 자동 정리가 실패한 채 남는다.

새 알림 요소(태풍·공항경보·향후 NOTAM 등)를 추가해도 스케줄러의 조건문과 전체 재계산 비용이 함께 늘지 않도록, 감시를 독립된 깊은 module로 재구성한다.

## 2. 목표

1. 데이터 내용이 바뀐 경우에만 그 변화와 관계있는 활성 비행을 재평가한다.
2. 이전 비교 스냅샷·평가한 데이터 revision·현재 조건 상태를 DB에 보존해 재시작 뒤에도 판정을 이어 간다.
3. 예정 비행 감시, 현재 조건 상태, 사용자에게 보낸 이력을 구분해 각각의 수명주기를 명확히 한다.
4. 기존 개인설정·알림센터·`?flight=` 딥링크의 사용자 계약을 유지하고, PWA Web Push에서도 같은 비행 상세로 복귀한다.
5. 새 알림 규칙은 “의존 데이터 + 후보 추리 키 + 판정”만 추가하면 감시 엔진에 합류할 수 있게 한다.
6. 감시할 예정 비행이 없을 때 엔진은 polling·재브리핑·주기적 DB 전수 조회 없이 유휴 상태가 된다.
7. 사용자가 명시적으로 구독한 PWA에 HIGH/CRITICAL 경로 알림을 Web Push로 전달한다.

## 3. 범위 밖

- 새 사용자 알림 종류나 임계값의 추가·변경
- 이메일, 카카오 등 신규 전달 채널의 사용자 노출
- 공항·경로 편집 UI의 재설계
- PostGIS/R-tree/외부 큐 도입 또는 다중 서버 운영
- 현재 경로 브리핑의 표시 내용 자체 변경

이번 작업은 기존 판정 규칙을 더 효율적이고 재시작 안전하게 실행하는 기반 작업이다.

## 4. 확정 제안

### 4.1 감시 engine의 interface

`AlertWatchEngine` module은 외부에 두 동작만 제공한다.

```js
recordSourceChange(changeSet)
runDue(now)
```

- `recordSourceChange(changeSet)`: snapshot store가 의미 있는 새 revision을 발행할 때 호출한다. 영향 감시를 dirty로 표시할 뿐, 즉시 무거운 브리핑 계산은 하지 않는다.
- `runDue(now)`: dirty인 감시, 감시 시작/만료 시각이 도래한 감시, 시간 경계 때문에 재평가가 필요한 감시만 묶어 평가한다. 실패한 항목은 다른 감시를 막지 않고 재시도 가능 상태로 남긴다.

source별 변화 해석과 규칙별 판정은 engine 내부 seam이다. 호출자가 TAF·SIGMET·태풍 데이터의 세부 구조나 개별 규칙을 알 필요가 없다.

### 4.1.1 유휴와 다음 기상 시각

engine은 고정 15분 interval을 소유하지 않는다. 열려 있는 감시를 기준으로 다음 깨울 시각 하나만 계산해 one-shot timer를 건다.

```text
열려 있는 감시 없음
  → timer 없음, source change도 즉시 반환, DB 재조회 없음

미래 scheduled 감시만 있음
  → 가장 이른 starts_at에만 one-shot timer 설정
  → 그 전에는 source change를 평가 큐에 넣지 않음

active 감시 있음
  → source change가 해당 감시를 dirty로 표시
  → 짧은 debounce 뒤 runDue 실행
  → 다음 시간 경계(next_check_at / ETD / expires_at)에도 one-shot timer 설정
```

등록·수정·취소·만료와 서버 시작 시에만 다음 깨울 시각을 다시 계산한다. 서버 시작은 열려 있는 감시 존재 여부를 한 번 조회해 timer를 복구한다. 이 contract를 통하지 않는 직접 DB 수정은 지원하지 않는다.

### 4.2 데이터 변화 계약

기존 `store.save()`의 SHA-256 `content_hash` 변경 판정을 유지한다. 실제 내용이 같아 `saved: false`인 수집은 변화 이벤트를 만들지 않는다.

의미 있는 저장은 다음 형태의 `ChangeSet`을 만든다.

```text
source: taf | taf_overseas | sigmet | sigmet_overseas | airmet | warning | typhoon | enroute_model
revision: content_hash 또는 모델 revision
affected:
  - 공항 source: 변경된 ICAO 목록
  - 위험 source: 변경·삭제된 항목의 ID, bbox, 유효 시간
occurredAt: UTC ISO instant
```

변경 추출은 캐시를 덮어쓰기 전에 이전과 새 snapshot을 비교한다. 부분 수집 실패로 이전 자료를 보존한 경우에는 기존 store의 last-good 규칙을 그대로 따른다.

### 4.3 감시 후보 인덱스

예정 비행 등록 또는 마이그레이션 시 경로 snapshot에서 다음을 한 번 파생해 저장한다.

```text
watch_airports: watch_id, icao, role(departure|arrival|alternate)
watch_dependencies: watch_id, source
```

- TAF 변화는 `watch_airports`의 ICAO로 후보를 고른다.
- SIGMET/AIRMET/태풍/공항경보 변화는 해당 `source`를 구독하는 활성 감시를 후보로 고른 뒤, 기존 브리핑 모듈의 경로·시간·고도 교차 판정으로 최종 확인한다.
- 처음에는 공간 DB를 도입하지 않는다. 후보를 SQL로 줄인 뒤 현재의 `hazard-section`/`typhoon-briefing` 로직을 재사용한다.

### 4.4 평가 상태와 알림 이력

감시별 상태는 DB에 영속화한다.

```text
alert_watch_state
  watch_id
  snapshot_json                 # 현재 최소 비교 스냅샷
  evaluated_revisions_json      # source별 마지막 평가 revision
  dirty_sources_json
  next_check_at                 # 시간 기반 재평가 시각(UTC)
  last_evaluated_at
```

알림 조건의 현재 상태와 사용자 이력을 분리한다.

```text
alert_condition_state
  watch_id, condition_key, status(inactive|firing|resolved)
  fingerprint, opened_at, last_notified_at, resolved_at

triggered_alerts
  기존 사용자 표시·읽음·전달 이력 유지
  watch_id를 추가해 감시본을 명시적으로 연결
```

기존 `route_id + dedup_key` 영구 1회 억제는 condition state로 대체한다. 같은 조건이 해소된 뒤 다시 발생하면 새 사건으로 알릴 수 있고, 같은 사건의 재실행은 중복 발송하지 않는다. dwell·히스테리시스·rate limit은 이 상태 모델 위에 후속으로 추가 가능하지만, 이번 작업에서 사용자 임계값을 바꾸지는 않는다.

### 4.5 감시 수명주기

```text
scheduled → active → completed → expired
                         └────→ cancelled
```

- `scheduled`: 등록부터 `starts_at` 전까지. 재브리핑하지 않는다.
- `active`: `starts_at`부터 ETD까지. 첫 평가는 baseline을 저장하며, 이 기존 사용자 동작은 유지한다.
- `completed`: ETD 도달 뒤 감시 중단. 이력은 유지한다.
- `expired`: ETD+3시간 뒤 정리 대상. 이력이 있어도 감시는 반드시 비활성화한다.
- `cancelled`: 사용자가 삭제한 감시. 이력은 유지한다.

자동 만료는 더 이상 route 삭제 실패에 의존하지 않는다. 이력이 있는 감시도 상태만 `expired`로 전이하고, 보존 기간 후 별도 정리 정책에 따라 archive/delete한다.

### 4.6 전달

판정과 채널 I/O를 분리한다.

```text
평가 트랜잭션
  → condition state 갱신
  → triggered_alerts 이력 생성
  → alert_outbox 레코드 생성

전달 worker
  → 인앱 상태 기록
  → Telegram / 향후 Web Push 전송
  → 결과·재시도 시각 기록
```

인앱은 모든 발생 이력을 유지한다. Telegram과 PWA Web Push는 기존 즉시 통지 등급에 맞춰 HIGH/CRITICAL만 전달한다. Telegram의 관리자 전용 정책은 유지하고, PWA Web Push는 해당 알림을 소유한 구독 사용자에게 전달한다.

### 4.7 PWA Web Push

기존 `manifest.json`, `sw.js`, `push_subscriptions`, VAPID sender와 개발자 콘솔의 테스트 구독 코드를 운영 기능으로 완성한다.

```text
개인설정 [비행 알림]
  → “기기 알림 켜기” (명시적 사용자 동작)
  → Notification 권한 요청
  → service worker 준비 대기
  → VAPID 공개키 수신
  → PushManager 구독
  → /api/me/push/subscribe에 저장

outbox worker
  → user_id의 유효 구독을 조회
  → { title, body, url, alertId, watchId } 전송
  → 404/410 구독은 삭제
  → 일시 실패는 재시도 상태로 기록

service worker notificationclick
  → 같은 origin의 url을 열거나 기존 창에 focus
  → /?flight=<routeId>로 비행 알림 상세 복귀
```

개인설정은 다음 상태를 사용자에게 명확히 보인다.

```text
unsupported | permission-needed | denied | subscribed | error
```

- 권한 요청은 반드시 사용자의 버튼 동작에서만 발생한다.
- VAPID 비밀키는 서버 환경 변수에만 두며, 브라우저에는 공개키만 반환한다.
- 운영 Push는 HTTPS에서만 지원한다(개발 localhost 예외). 지원하지 않는 브라우저·권한 거부는 인앱 알림을 계속 사용한다.
- 기존 개발자 콘솔의 test endpoint는 관리자 진단용으로 유지하되, 운영 사용자 구독·실제 경로 알림 검증의 대체 수단으로 보지 않는다.

## 5. 데이터 모델 전환

`routes`는 재사용 경로 템플릿으로 유지한다. 새 `alert_watches`가 예정 비행 감시 snapshot과 시간·상태를 소유한다.

```text
alert_watches
  id, user_id, route_id(nullable), route_snapshot_json
  etd, eta, starts_at, expires_at, status
  alert_start_min_before_etd, settings_json
  created_at, updated_at
```

기존 `routes.alert_enabled=1` 행은 마이그레이션 시 `alert_watches`로 복제한다. 기존 HTTP 경로(`/api/me/alerts`)와 프런트 반환 shape는 adapter가 유지해, UI 전환을 별도 사용자 작업으로 만들지 않는다. 마이그레이션이 검증된 뒤에만 기존 알림 컬럼 제거 여부를 결정한다.

## 6. 구현 순서

1. 현재 수명주기 버그를 고친다: 이력 있는 만료 감시도 비활성화하고, 만료·취소를 테스트한다.
2. 새 테이블과 마이그레이션을 추가하고 기존 예정 비행을 `alert_watches`로 옮긴다. 기존 HTTP contract는 유지한다.
3. snapshot store가 revision과 `ChangeSet`을 발행하도록 하고, source별 변화 추출 테스트를 작성한다.
4. 감시 인덱스와 `AlertWatchEngine`을 만든다. one-shot wake scheduler를 먼저 넣어 감시가 없으면 완전히 유휴이고, 미래 감시만 있으면 다음 `starts_at`에만 깨어나게 한다.
5. 우선 TAF·SIGMET/AIRMET·공항경보·태풍·enroute model의 현재 의존성을 engine에 연결한다.
6. 기존 `recompute()`를 공항 예보/경로 위험/엔루트 모델 평가로 내부 분해하고, 변화 source와 관련 없는 계산은 건너뛴다.
7. condition state와 outbox를 추가한 뒤 기존 sender를 outbox worker adapter로 옮긴다.
8. PWA 구독 상태를 개인설정에 추가하고, outbox에 Web Push adapter·만료 구독 정리·딥링크 click handler를 연결한다.
9. 기존 15분 전수 tick을 제거하고, source change 처리·시간 경계·PWA 전달을 종단 간 검증한다.

## 7. 검증 기준

1. 같은 TAF revision은 두 번 평가해도 두 번째 평가가 실행되지 않는다.
2. RKPC TAF 변화는 RKPC를 출발·도착·교체로 쓰는 활성 감시만 후보로 선택한다.
3. SIGMET/태풍 변화는 source 후보만 고른 뒤 기존 경로·시간·고도 교차 조건을 만족할 때만 발화한다.
4. 서버 재시작 뒤에도 이전 snapshot과 revision을 읽어 변화 판정을 이어 간다.
5. 만료·취소 감시는 다시 평가되지 않으며, 이력은 알림센터에 남는다.
6. 같은 condition 사건은 중복 전송되지 않고, 해소 후 재발생은 새 이력으로 남는다.
7. Telegram 실패는 이력을 잃지 않고 outbox 재시도 대상으로 남는다.
8. 열린 감시가 없을 때 timer·주기 DB 조회·브리핑 계산이 없고, 미래 감시만 있을 때 가장 이른 `starts_at`에만 깨어나는 것을 fake clock 테스트로 검증한다.
9. 구독한 사용자의 HIGH/CRITICAL 알림은 PWA Push payload로 한 번 전송되고, 404/410 응답 구독은 제거되며 일시 실패는 재시도된다.
10. HTTPS 환경의 실제 지원 브라우저에서 권한 부여 → 구독 → 앱/탭 종료 → 실제 경로 알림 수신 → 탭하여 `?flight=<routeId>` 상세 복귀를 검증한다.
11. 기존 `/api/me/alerts`, `/api/me/notifications`, 알림센터, `?flight=` 동작을 Playwright와 실제 서버 시나리오로 검증한다.

## 8. 승인할 제안

이 초안은 다음 제품·운영 결정을 전제로 한다.

1. 첫 active 평가는 현행처럼 baseline만 저장하고, 이미 나쁜 상태라는 이유만으로 즉시 알리지 않는다.
2. 예정 비행 감시를 템플릿 `routes`와 분리한 새 `alert_watches` 모델로 전환한다.
3. 알림 이력은 유지하고, 만료 감시는 삭제가 아니라 상태 전이로 종료한다.
4. Web Push는 사용자가 명시적으로 구독한 경우에만 HIGH/CRITICAL 경로 알림을 보내며, 클릭하면 해당 비행 상세 딥링크로 복귀한다.
5. 열려 있는 감시가 없을 때는 engine을 완전히 유휴로 두고, 미래 감시는 다음 `starts_at`에만 깨운다.

승인 뒤에 이 명세를 기준으로 상세 실행 계획과 코드 검토를 진행한다.
