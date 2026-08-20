# 4단계 푸시 알림 — 상태

- 브랜치: `feat/push-alerts-stage4` (main에서 분기)
- 계획: [2026-08-19-push-alerts.md](../plans/2026-08-19-push-alerts.md)
- 태스크 1~9 구현·커밋 완료. **태스크 10(관문)은 사용자 확인 대기.**

## 구현 결과

| 태스크 | 커밋 | 한 줄 |
|---|---|---|
| 1 | `e6fe163` | `tafConditionsAt` 신규 — `max(내 미니마, 공항 접근최저치)` 판정 + TS/FG/SN. `metricsAt`은 유효기간 밖이면 `null`, `weatherAt` 추가 |
| 2 | `b302107` | `buildSnapshot`이 `{airports[{icao,role,minima,minimaBound,ts,fg,sn}], sigmets[]}`만 낸다 |
| 3 | `f34a778` | `diff.js` 전면 교체 — 상태 전이 + 신규 SIGMET. 짝짓기·dedupKey는 `공항:역할` |
| 4 | `0e89ad2` | `severity`는 고정 `'ALERT'`, `to_val`=미니마 종류, `source_id`=역할. 피드 SQL이 `role`을 낸다 |
| 5 | `f7b807c` | `shouldPush` 제거, 경로 소유자에게 Web Push, 404/410 구독 정리 |
| 6 | `8efe9cb` | 알림 클릭 → `/?flight=<id>`, 열린 창 재사용 |
| 7 | `6218e95` | 감시 시작 6/12/24시간(기본 6). 코드 기본값 두 곳 + 스키마까지 360 |
| 8 | `8c79b9b` | 개인설정에 푸시 스위치, `urlBase64ToUint8Array`를 `pushKey.js` 공용 모듈로. "이상없음 확인" 제거 |
| 9 | `2ea48ca` | 알림센터 문구를 백엔드와 같은 어휘로, 브리핑 상단 변경점 띠, `FlightAlertDetail` 삭제 |

## 계획과 달라진 것

세 가지를 계획서와 다르게 처리했다. 전부 실제 파일 상태를 확인한 결과다.

1. **태스크 4의 시험 값** — 계획서 예시는 `tafFor(800)`으로 미니마 발화를 기대했지만, 그 시험이 쓰는
   시험용 조종사의 미니마가 500ft라 800ft는 걸리지 않는다. `tafFor(400)`으로 고쳤다.
2. **`dev/scenario.js`** — 계획서에 없지만 `detectChanges`·`buildSnapshot`을 쓰는 소비처다.
   `cleanBaseline`이 옛 스냅샷 모양을 만들고 있어 새 모양(`{airports, sigmets}`)으로 함께 옮겼다.
   안 고쳤으면 개발자 콘솔의 [악기상 주입] 강제 발화가 조용히 아무것도 안 냈다.
3. **`db.test.js`** — 스키마 기본값 120을 단언하고 있어 360으로 맞췄다.

**변경점 띠는 딥링크(`?flight=<id>`)에서 비행 id를 읽는다.** 브리핑 훅이 불러온 저장물의 id를
들고 있지 않아서다. 알림을 탭해 들어온 경로가 정확히 그 딥링크라 목적에는 맞지만,
알림 없이 저장 브리핑을 연 사람에게는 띠가 안 뜬다(원래 의도대로 조용하다).

## 검증

- `npm --prefix backend test` — 929 통과 / 0 실패
- `npm --prefix frontend test` — 1419 통과 / 0 실패
- `npm --prefix frontend run build` — 성공
- VAPID 키: `.env`에 이미 있고 유효한 쌍(`web-push.setVapidDetails` 통과). 새로 만들 필요 없음
- 우리 커밋에 다른 세션의 변경이 섞이지 않았다(`git diff --name-only main..HEAD` 27개 전부 이 작업 파일)

## 관문 A~E — 서버 쪽 통과, 화면 확인만 남음

가짜 푸시 서비스(진짜 VAPID 암호화를 그대로 통과하는 로컬 endpoint)를 세워 실제 발송을 받아
복호화해 확인했다. 브라우저가 하는 일만 빼고 전부 실제 코드 경로다.

| 관문 | 내용 | 결과 |
|---|---|---|
| A | 구독 등록 API가 행을 남긴다 | **통과** (`push_subscriptions` 1행). 권한 팝업·스위치 유지는 화면 확인 필요 |
| B | 감시 시작 6/12/24시간만 받는다 | **통과** — 120은 `invalid_input`, 1440은 등록됨 |
| C | 실제로 폰으로 나간다 | **통과** — 아래 실제 발송 내용 참조 |
| D | 같은 조건으로 다시 안 울린다 | **통과** — 두 번째 tick `fired: 0` |
| E | ETD를 지나면 멈춘다 | **통과** — `evaluated: 0`, 목록의 `active: false` |

### 실제로 발송된 알림 (복호화한 원문)

주입 경로(알림 1건씩):

```
{"title":"RKSI → RKPK · ETD 2244Z · FL280","body":"출발 RKSI 내 미니마 미만 예보","url":"/?flight=3"}
{"title":"RKSI → RKPK · ETD 2244Z · FL280","body":"출발 RKSI 뇌전 예보","url":"/?flight=3"}
{"title":"RKSI → RKPK · ETD 2244Z · FL280","body":"경로상 신규 SIGMET (Embedded Thunderstorm)","url":"/?flight=3"}
```

실제 스케줄러 경로(§5B group_wait — 세 변화가 **한 건으로 묶여** 나갔다):

```
{"title":"RKSI → RKPK · ETD 2244Z · FL280",
 "body":"출발 RKSI 내 미니마 미만 예보\n출발 RKSI 뇌전 예보\n경로상 신규 SIGMET (Embedded Thunderstorm)",
 "url":"/?flight=3"}
```

알림센터 피드도 같은 어휘로 나온다(`role: 'dep'`, `toVal: 'personal'`, `routeId: 3`) — 폰과 앱이
같은 문장을 읽는다. `routeId`가 딥링크와 같아서 변경점 띠도 뜬다.

### 관문이 잡아낸 실제 버그 둘 (`742fb98`에서 고침)

계획서에 없던 `dev/scenario.js`가 두 군데 깨져 있었다. 유닛 테스트는 전부 통과하는데 화면에서만
깨지는 종류라, 관문을 안 돌렸으면 그대로 넘어갔다.

1. **주석이 SQL 템플릿 리터럴 안에 들어가 INSERT가 통째로 깨졌다.** 개발자 콘솔에서
   [악기상 주입]을 누르면 `SqliteError: near "/"`로 **백엔드가 죽었다.** 태스크 3에서 그 파일을
   새 스냅샷 모양으로 옮길 때 주석 위치를 잘못 잡은 것이다.
2. **`routeCtx`에 `user_id`가 없어 발송이 구독자를 못 찾았다.** 알림 행은 쌓이는데 폰도
   텔레그램도 조용했다 — "안 울린다"로만 보이는 가장 나쁜 형태다. 텔레그램 쪽은 이번 작업
   이전부터 같은 이유로 조용했다(이 경로 한정).

### 화면 확인에서 잡힌 것 — 서비스워커가 안 갈아끼워졌다 (`f2a750f`에서 고침)

알림은 새 코드 문구로 뜨는데 **누르면 첫 화면만 열렸다.** 원인은 `sw.js`에 `skipWaiting`이
없어서다 — 새 워커가 설치돼도 열려 있던 탭이 **전부** 닫힐 때까지 대기만 한다. 그래서 발송은
새 코드가, 클릭은 옛 코드가 처리하는 상태가 됐다. 지금 한 번이 아니라 **앞으로 모든 `sw.js`
변경이 같은 함정에 빠지고, 배포 뒤에도 마찬가지**라 근본을 고쳤다.

- `install`에서 `skipWaiting()`, `activate`에서 `clients.claim()` — 새로고침 한 번이면 넘어간다
- `client.navigate()`는 이 워커가 제어하지 않는 창에서 예외를 던진다(첫 등록 직후) —
  조용히 실패하면 아무 데도 못 가므로 새 창으로 떨어뜨린다

Playwright로 사용자 상황을 그대로 재현해 확인했다: `skipWaiting` 없는 워커를 먼저 등록해 둔
뒤 새 파일로 갈아끼우고 **새로고침 한 번**만 하면 새 워커가 바로 활성화되고 탭을 제어한다
(`waiting: false`, `controlled: true`).

### 화면에서만 확인 가능한 것 — 사용자 몫

기계가 대신할 수 없는 부분이다. 브라우저 권한과 실제 알림 배너는 진짜 크롬이 있어야 한다.

- 개인설정 > 비행 알림의 **푸시 알림 받기** 스위치가 권한 팝업을 띄우고, 켠 뒤 새로고침해도 남는가
- 크롬 알림 배너가 실제로 화면에 뜨는가
- 그 배너를 **클릭하면 그 비행의 브리핑**이 열리고 상단에 변경점 띠가 보이는가

## 남은 위험

- **iOS는 확인하지 않았다.** 홈 화면에 추가한 앱에서만 웹 알림이 오고 HTTPS가 필요하다.
- **이미 만들어진 DB의 `alert_start_min_before_etd` 기본값은 여전히 120이다.** SQLite가
  `ALTER TABLE`로 기본값을 못 바꾼다. 코드 기본값(360) 두 곳이 실질적인 안전망이다.
- **`send_no_change_confirm` 컬럼은 DB에 남아 있다.** 화면과 API에서만 뺐다.
- **관문에 쓴 시험 데이터는 전부 지웠다** — 가짜 구독 해지, 주입 기상 복구(`/api/dev/reset`),
  시험용 감시 등록 삭제. `push_subscriptions`·`triggered_alerts` 0행으로 되돌렸다.
