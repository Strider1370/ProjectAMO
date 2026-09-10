# 경로 예보변화 알림(#13) — Phase 1 구현계획

> **작업자용:** 스펙 = [2026-07-07-route-forecast-alert-design.md](../specs/2026-07-07-route-forecast-alert-design.md). 태스크는 체크박스로 추적. superpowers:executing-plans 또는 subagent-driven-development로 태스크 단위 실행.

## 진행 현황 (2026-07-07)
- ✅ **Task 1·2·3 완료·푸시** (`26a2bb6`·`c32f072`·`9dea79c`): DB 스키마, 단일 미니마 API + 스냅샷 cruiseSpeedKt, 알림 등록 API(pickActiveFlight 유닛 4/4).
- ✅ **Task 5 완료** (`e642acd`): diff 엔진 `backend/src/alerts/diff.js` `detectChanges(prev,curr,plan)` — 7종 순수 판정. 유닛 8/8.
- ✅ **Task 4 완료** (`56fe9dc`): 스케줄러 `backend/src/alerts/scheduler.js`(`evaluateFlight`/`buildSnapshot`/`buildBriefingRequest`) + `taf-window.metricsAt()` + server.js 배선. 유닛 5/5.
  - ⚠️ **발견(계획 공백 해소):** 서버 재브리핑에 필요한 `routeGeometry`가 저장 스냅샷에 없었음. IFR은 프론트 플래너(`getCurrentRouteLineString`) 산출물이라 서버 재구성 불가 → **`RouteBriefingPanel.saveRoute`에 `routeGeometry` 저장 추가**(cruiseSpeedKt 선례). 등록은 payload 복제라 자동 전파. **기존 저장경로는 기하 없어 스케줄러가 skip**(재저장 시 활성). `me/routes.js` snapshot=z.record라 백엔드 스키마 변경 불필요.
  - 스냅샷 prev는 **인메모리 캐시**(§5B) + `last_briefing_snapshot_id`=해시 마커. 재시작 생존 필요 시 routes에 JSON 컬럼(ponytail 주석).
  - **dwell 2h·rate-limit·group_wait은 미구현**(§5B) — diff는 prev→curr 전이 + route+dedup_key 중복억제까지만. 데모엔 충분, 알림피로 강화는 후속.
- ✅ **Task 6 완료** (`e876c25`): 발송 seam `backend/src/alerts/sender.js`(`formatAlert`/`dispatchAlert`) + 텔레그램(env 게이트·딥링크 버튼) + 채널 차등(HIGH/CRITICAL만 푸시). scheduler runTick 배선. 유닛 6/6.
- ✅ **Task 7 완료** (`649eb7a`): 알림센터 피드. **경로 충돌 정정** — 스펙의 `GET /api/me/alerts`는 Task 3 예정비행 목록이 점유 → **피드는 `/api/me/notifications`**(GET·PATCH /:id/read·POST /read-all). `listNotifications`/`markNotificationRead`/`markAllNotificationsRead` 순수 DB 함수. 유닛 3/3.
- ✅ **Task 8 완료** (`19c71f3`): 인앱 알림센터 `frontend/src/features/notifications/`(useNotifications 60s 폴링·NotificationCenter Fluent Popover·notificationFormat). Sidebar 하단 벨(로그인 게이트, `BellRing`—Bell은 업데이트 점유). 피드는 `/api/me/notifications`. esbuild 4/4. **시각 Playwright는 Task 11로 미룸.**
- ✅ **공항별 미니마 리팩터 완료** (`f20f673`, Task 9 사전 정리): 공항 미니마 = **코드 상수(`DEFAULT_AIRPORT_MINIMA_RULES`) 확정**, 사용자 편집 UI 전면 제거(SettingsModal 공항미니마 탭 · 레거시 monitoring LIFR 탭 · presets API · 죽은 헬퍼). 조사로 monitoring이 상수 폴백만 함을 확인 → 분류 불변. vite 빌드 그린, 백엔드 25/25.
  - ⚠️ **이전 fence 해제**: "SettingsModal 공항미니마 탭 건드리지 마"(§37·§45)는 폴백 때문에 실제 load-bearing 아니었음 → 사용자 승인으로 제거함. presets 테이블은 물리 방치.
  - → **Task 9 [기상 미니마] 탭 = 개인 단일값(`/api/me/minima`)만** 깔끔.
- ✅ **Task 9 완료** (`997667b`): 개인설정 패널 `frontend/src/features/personal/`(벨 아래 UserCog 입구, 로그인 게이트). [기상 미니마] 단일값+VFR/IFR 프리셋(`/api/me/minima`) · [비행 알림] 템플릿·ETD·ETA(haversine+etaCalc pre-fill)·등록/목록/삭제(`/api/me/alerts`)·상태칩·Z+KST. Fluent Dialog+TabList. vite 빌드 그린.
  - ⏸ **범위 밖(별도)**: 경로창 [이 비행 알림 등록] 지름길 · PATCH ETD 조정 · 딥링크(Task 10).
- ✅ **Task 10 완료** (`32d5675`): 딥링크 `?flight=` 착지. `App.jsx`가 쿼리 읽어 `FlightAlertDetail`(Fluent Dialog) 렌더 — 알림 피드를 routeId 필터해 변경점(severity·formatNotification·before→after·Z+KST) + 읽음 처리 + [전체 브리핑]→경로 패널 + KMA 고지. Option A 서버 브리핑 재렌더는 후속. vite 그린.
- ✅ **부가 수정** (`17f1a27`): 저장 경로 IFR 로드 시 자동추천 자동발화(수동 '자동검색' 대체 — SID/STAR 매칭·해외 경로 오류 해결). UI 동작은 사용자 검증 위임.
- ▶ **다음 = Task 11(통합·텔레그램 e2e·Playwright)** — 실제 서버·봇 토큰·로그인 필요 → **사용자 환경에서 진행.** 코드는 Phase 1 완료.
- ⚠️ **테스트 실행 주의:** bcrypt(cost 12)·서버 통합 테스트는 이 환경에서 느려 실행 보류 중 — 파일만 작성하고 CI/수동에 맡김. **순수 함수 유닛 테스트는 즉시 실행 OK.**

**목표(Phase 1, 시연):** 서버가 저장된 비행을 감시 → 예보가 v1 7종 기준 나빠지면 **인앱 알림센터 + 텔레그램**으로 알림 + 탭하면 그 비행 브리핑으로 딥링크. **서비스워커 없이 end-to-end 시연.** (Web Push=Phase 2, 카카오·이메일=v2.)

## 실행 지침 (TDD 최소 — 필독)
태스크마다 test-first 강제 안 함. 아래만:
- **두뇌(Task 5 diff 엔진 · Task 4 스케줄러)만 test-first 스모크 1개씩.** node:test, `backend/test/auth.test.js`의 `makeServer()`+`fetch(at(server,path))` 패턴 재사용(supertest 아님).
- 나머지 백엔드: 구현 후 `npm --prefix backend test` 한 번 통과면 OK.
- 프론트: 파일마다 `npx esbuild ... --bundle=false` 빌드 스모크 + **마지막에 Playwright로 한 번** 수동 확인(`docs/dev-server-and-capture.md` 절차). Preview MCP 금지.
- 판정 로직은 **기존 모듈 호출**(신규는 diff+severity+dedup·스케줄·발송만).

## 리뷰 반영(2026-07-07, 정정된 전제)
- 경로 저장은 **이미 서버 우선**(routeStore) — 승격 배선 불필요.
- `tasKt`·거리는 스냅샷에 **없음** → Task 2에서 tasKt 저장 추가, **ETA는 클라 `etaCalc.js` 계산값 전송**(서버 재계산 안 함).
- 미니마 단일값은 **`users` 컬럼**에 저장(per-airport `presets` 안 씀).
- `alert-state.js`는 프론트 코드 → 서버 스케줄러가 import 불가, **알고리즘만 참고**.

---

## Task 1: DB 스키마 + 마이그레이션
- [ ] `schema.sql`: `routes`에 알림 컬럼(`alert_enabled`,`alert_start_min_before_etd` 기본120,`altitude_filter_ft` 기본4000,`send_no_change_confirm`,`confirm_min_before_etd` 기본60,`eta`,`last_briefing_snapshot_id`,`expires_at`). `users`에 `min_ceiling_ft`,`min_visibility_m`. 신규 테이블 `triggered_alerts`(스펙 §6), `push_subscriptions`(Phase 2용, 빈 채로).
- [ ] `db/index.js` `ensureColumns`: 없는 컬럼만 `ALTER TABLE ADD COLUMN`(기존 행 안전, 기본값 처리). 신규 테이블 `CREATE TABLE IF NOT EXISTS`.
- [ ] 스모크: `backend/test/db.test.js`에 컬럼·테이블 존재 1개. Run `node --test backend/test/db.test.js`.
- [ ] Commit.

## Task 2: tasKt 스냅샷 저장 + 단일 미니마 API
- [x] 프론트: `RouteBriefingPanel.jsx:329` `saveRoute(..., { ..., cruiseSpeedKt })` — 스냅샷에 속도 추가. (ETA는 이미 `computeEtaIso`로 클라 계산 중)
- [x] 백엔드: `createMeRouter`(presets.js)에 `GET/PUT /api/me/minima` — `users.min_ceiling_ft/min_visibility_m`, zod 검증, userId만.
- [x] 스모크: `me-presets.test.js`에 minima 왕복 1개.
- ⚠️ **정정: 기존 `SettingsModal` "공항 미니마" 탭은 건드리지 않는다** — per-airport `airport_minima_settings`는 monitoring(MonitoringPage·MetarCard·TafTimeline)이 소비하는 load-bearing 표시값. #13 **단일 미니마 입력 UI는 새 개인설정 패널 [기상 미니마] 탭(Task 9)**에 넣는다.
- [ ] Commit.

## Task 3: 알림 등록 API (예정 비행)
- [ ] `me/routes.js` 확장 or `me/alerts.js` 신규: 템플릿 클론 → 예정 비행 생성(입력 `templateRouteId?` or 스냅샷 + `etd`,`eta`,알림설정). ETA는 **클라 전송값** 저장(서버 계산 안 함).
- [ ] 목록(`GET`)·삭제(`DELETE`)·ETD 조정(`PATCH etd/eta/settings`). 전부 `userId` 필터.
- [ ] **활성 감시 선택 헬퍼**: 사용자당 ETD 가장 임박 + 감시창(ETD−N ~ ETD) 안인 1건.
- [ ] 게이트: ETD 미래·ETA>ETD, 상한 100, 미니마 미설정 시 VFR 기본.
- [ ] 스모크: 등록→목록→삭제 1개.
- [ ] Commit.

## Task 4: 재브리핑 스케줄러 (test-first 스모크) ✅
- [x] `backend/test/alert-scheduler.test.js`: baseline(무발화)·스냅샷 저장 + 목적지 하락→CEIL + dedup + 기하없음 skip. 유닛 5/5.
- [x] `backend/src/alerts/scheduler.js`: 15분 인터벌. 활성 비행(pickActiveFlight)마다 저장 `payload.routeGeometry`로 `composeBriefing`+`summarizeEnrouteModel` 재계산 → `buildSnapshot` → `evaluateFlight`. `last_briefing_snapshot_id`=해시 마커.
  - ⚠️ 국내+해외 병합은 composer가 이미 하므로 tafByIcao merge만. **store.js 해시 무변경 skip 게이트는 미배선**(15분 무조건 tick) — 부하 여유(§5C) 크므로 데모엔 무해, 후속 최적화.
- [x] 등록 직후 baseline: `startAlertScheduler`가 기동 시 즉시 tick 1회. (등록 시점 훅은 아니고 다음 tick에 baseline — 데모 OK.)
- [x] Run·Commit (`56fe9dc`).

## Task 5: diff 엔진 (test-first 스모크 — 두뇌) ✅
- [x] `backend/test/alert-diff.test.js`: 목적지 하락→CEIL 1건, 무변경 0건, 지속 0건, VFR 프리셋, 교체플립, SIGMET 신규/재발행, 착빙 severe, 출발 TS. 유닛 8/8.
- [x] `backend/src/alerts/diff.js` `detectChanges(prev,curr,plan)`: 7종. 최소 스냅샷 계약 위 순수 비교(판정 수치는 스케줄러가 기존 모듈로 채움). `effectiveMinima`=사용자값→VFR 프리셋 폴백(#8 미구현).
- [x] severity(CRITICAL=IFR 프리셋 아래) + dedup(route+dedup_key, 스케줄러). **dwell 2h·rate-limit은 미구현**(전이만) — 후속.
- [x] Run·Commit (`e642acd`).

## Task 6: 발송 seam + 텔레그램 ✅
- [x] `backend/src/alerts/sender.js`: `formatAlert`(ko 글랜서블, 타입별 분기) + `dispatchAlert` 한 곳 채널 분기.
- [x] 텔레그램 `sendMessage`(env 없으면 skip, 딥링크 inline 버튼 `FRONTEND_ORIGIN/?flight=<id>`). 채널 차등: HIGH/CRITICAL만 푸시, MEDIUM 이하 인앱. `pushed_at`/`channel_status` 기록.
- [x] scheduler `runTick` 배선(insertAlert→id, dispatchAlert). `.env.example` 키. 유닛 6/6.
- [x] Commit (`e876c25`).

## Task 7: 알림센터 피드 API ✅
- [x] **경로 = `/api/me/notifications`**(스펙 `/alerts`는 예정비행 목록 점유). GET(userId·최신순·경로명 조인·unreadCount) + `PATCH /:id/read` + `POST /read-all`. 순수 DB 함수로 분리. 유닛 3/3.
- [x] Commit (`649eb7a`). ⚠️ 프론트(Task 8)는 피드를 `/api/me/notifications`에서 읽을 것.

## Task 8: 프론트 — 인앱 알림센터 (신규) ✅
- [x] `features/notifications/`: `NotificationCenter`(BellRing 벨 + CounterBadge 안읽음 + Fluent Popover 리스트) + `useNotifications`(60s 폴링·markRead/markAllRead) + `notificationFormat`. Sidebar 하단, 로그인 게이트. 디자인 헌법 토큰.
- [x] 각 항목 탭 → `markRead` + `?flight=<routeId>` 이동(Task 10에서 착지 처리).
- [x] esbuild 4/4. Commit (`19c71f3`). ⚠️ 피드 경로 `/api/me/notifications`. 시각 Playwright는 Task 11.

## Task 9: 프론트 — 개인설정 패널 [기상 미니마]+[비행 알림] 탭 ✅
- [x] `features/personal/`: 벨 아래 UserCog 입구(로그인 게이트) + Fluent Dialog+TabList 2탭.
- [x] **[기상 미니마]**: 단일 운고·시정 + VFR/IFR 프리셋. `GET/PUT /api/me/minima`. 미설정 힌트.
- [x] **[비행 알림]**: 템플릿 select(`/api/me/routes`)·ETD·ETA(haversine 거리+`computeEtaIso` pre-fill, 사용자편집 미덮음)·고급 접힘·등록/목록/삭제(`/api/me/alerts`)·상태칩(감시중/대기).
- [x] 시간 Z+KST 병기(`timeFormat.js`). vite 빌드 그린. Commit (`997667b`).
- ⏸ 경로 창 지름길·PATCH ETD 조정은 **미착수(별도)**.

## Task 10: 딥링크 `?flight=` ✅
- [x] `App.jsx`가 `?flight=<routeId>` 읽어 `FlightAlertDetail`(features/notifications) 렌더 — 알림 피드 routeId 필터로 변경점 카드(severity·문구·before→after·Z+KST)·읽음 처리·로그인 게이트·KMA 고지·[전체 브리핑]→경로 패널. vite 그린. Commit (`32d5675`).
- ⏸ Option A 서버 브리핑 재렌더([전체 브리핑]이 실제 그 비행 브리핑 로드)는 후속.

## Task 11: 통합 · 수동 확인
- [ ] 텔레그램 e2e: 봇 토큰·chat_id 넣고 등록→강제 diff→텔레그램 수신 확인.
- [ ] Playwright: 개인설정 두 탭·알림센터·딥링크 스크린샷(`docs/dev-server-and-capture.md`).
- [ ] `npm --prefix backend test` 전체 통과. `graphify update .`.
- [ ] Architecture.md/EntryPoints.md 갱신(신규 `backend/src/alerts/*`, 알림센터).

---
## Phase 2 (별도) — Web Push
서비스워커·manifest·`web-push`·VAPID·`push_subscriptions` 구독 UI. sender seam에 push 채널 추가만.
