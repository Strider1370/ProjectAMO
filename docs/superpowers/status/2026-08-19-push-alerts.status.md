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

## 관문 A~E — 대기

데스크톱 크롬으로 확인하기로 정했다. 결과를 여기에 채운다.

| 관문 | 내용 | 결과 |
|---|---|---|
| A | 푸시 스위치가 켜지고 새로고침해도 남는다 | 대기 |
| B | 감시 시작 선택지가 6/12/24시간 | 대기 |
| C | 실제로 알림이 뜨고, 탭하면 그 브리핑으로 간다 | 대기 |
| D | 같은 조건으로 다시 울리지 않는다 | 대기 |
| E | ETD를 지나면 평가가 멈춘다 | 대기 |

## 남은 위험

- **iOS는 확인하지 않았다.** 홈 화면에 추가한 앱에서만 웹 알림이 오고 HTTPS가 필요하다.
- **이미 만들어진 DB의 `alert_start_min_before_etd` 기본값은 여전히 120이다.** SQLite가
  `ALTER TABLE`로 기본값을 못 바꾼다. 코드 기본값(360) 두 곳이 실질적인 안전망이다.
- **`send_no_change_confirm` 컬럼은 DB에 남아 있다.** 화면과 API에서만 뺐다.
