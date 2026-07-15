# 개발자 모드 콘솔(/dev) — 구현계획 (Phase 1~3)

> **작업자용:** 이 문서 하나로 배경·설계·태스크를 담는다(별도 spec 없음). 태스크는 체크박스로 추적. 실행은 superpowers:executing-plans 또는 subagent-driven-development 권장. 검증은 Playwright(`docs/dev-server-and-capture.md`), Preview MCP 금지(§8).

## 배경 / 목적

개발자 모드 = **① 조작(Trigger)** + **② 관찰(Observe)** 두 축.
- **조작:** 버튼을 눌러 기능(알림·브리핑·권한 등)을 강제 발생시켜 "의도대로 되는지" 직접 본다.
- **관찰:** 그때의 로그·데이터 흐름·비효율(폴링 낭비·통짜 payload·재계산 스파이크)을 눈으로 본다.

현재는 조작의 씨앗(악기상 주입/초기화)만 있고 **관찰이 통째로 비어있다.** 이 계획은 `/admin` 콘솔을 템플릿 삼아 `/dev` 대시보드로 둘을 채운다.

**운영 원칙(불변):**
- **테스트 인스턴스(`npm run dev:test`, `DISABLE_COLLECTION=1`, cron off)에서만 동작.** 운영 데이터·파일 미변경(주입은 store 캐시 in-memory).
- **운영 노출 0:** 프론트는 `import.meta.env.DEV`(빌드 시 제거) + 런타임 `testMode`, 백엔드 `/api/dev/*`는 `DISABLE_COLLECTION`일 때만 마운트(server.js). 이미 이 게이트가 있음.

## 재사용 인벤토리 (신규 백엔드 최소화)

**기존 엔드포인트:**
- `GET /api/admin/metrics?range=1h|24h|7d` — CPU·메모리·디스크 시계열 (`backend/src/admin/metrics.js`)
- `GET /api/admin/traffic` — 접속/방문자 (`backend/src/admin/visits.js`)
- `GET /api/stats` — 수집기 성공/실패 + 최근 50회 (`backend/src/stats.js`, ⚠️ 소요시간 없음)
- `GET /api/snapshot-meta` — 데이터셋 해시 상태 (5s TTL)
- `GET /api/health` — uptime, `testMode`
- `POST /api/dev/inject` · `POST /api/dev/reset` — 시나리오 주입/복구 (`backend/src/dev/scenario.js`)

**기존 프론트 컴포넌트:** `ResourceTimeline.jsx`(Recharts 시계열)·게이지·대시보드 폴링 골격 (`frontend/src/features/admin/AdminPage.jsx`), Fluent 배럴(`shared/ui/fluent.js`).

**게이트 패턴:** `App.jsx` pathname 라우팅(/admin·/test), `import.meta.env.DEV`, `/api/health testMode`, `DISABLE_COLLECTION`, `PersonalSettingsPanel` DevTab.

---

## 구조 결정

- **라우트:** `/dev` 독립 페이지(`/admin`·`/test`와 동일 패턴). `App.jsx`에 `import.meta.env.DEV` 게이트로 lazy 라우트 추가.
- **위치:** `frontend/src/features/developer/DeveloperPage.jsx` + `developerApi.js` + `tabs/*`.
- **백엔드:** 기존 dev 라우터(`backend/src/dev/scenario.js`)에 조작/관찰 엔드포인트를 추가(모두 `DISABLE_COLLECTION` 게이트 하위).
- **현 DevTab(개인설정) 이관:** Phase 1에서 `/dev`로 옮기고 개인설정 개발자 탭은 "→ /dev 열기" 링크만 남기거나 제거.

```
frontend/src/features/developer/
├── DeveloperPage.jsx        # 탭 컨테이너 (조작/관찰)
├── developerApi.js          # fetch 래퍼
└── tabs/
    ├── TriggerTab.jsx       # ① 조작
    └── ObserveTab.jsx       # ② 관찰
```

---

# Phase 1 — MVP (조립 위주)

**목표:** `/dev` 페이지가 뜨고, 현 주입/초기화 + "스케줄러 즉시 발화" + "알림 전체 삭제"를 조작 탭에서, triggered_alerts 실시간 피드 + snapshot-meta 해시 + CPU/메모리를 관찰 탭에서 본다. 백엔드 소형 엔드포인트 1~2개.

## Task 1: `/dev` 라우트 + 페이지 골격
- [ ] `App.jsx`: `const DeveloperPage = lazy(...)` + `if (pathname === '/dev' && import.meta.env.DEV) return <Suspense><TimeZoneProvider><AuthProvider><DeveloperPage/></AuthProvider></TimeZoneProvider></Suspense>`.
- [ ] `features/developer/DeveloperPage.jsx`: `/api/health`로 `testMode` 확인 → false면 "테스트 모드(npm run dev:test)에서만" 안내. TabList(조작/관찰). Fluent 토큰 스타일(AdminPage 참고).
- [ ] 검증: `dev:test`로 `/dev` 접속 → 두 탭 렌더(Playwright 1컷).

## Task 2: 조작 탭 — 현 주입/초기화 이관 + 시나리오 옵션
- [ ] `TriggerTab.jsx`: 경로 선택(드롭다운, `/api/me/routes`) + 시나리오 토글(출발 LIFR·목적지 IFR·경로 뇌우) + [주입]/[초기화]. 현 DevTab 로직(`PersonalSettingsPanel` DevTab) 이관 → `/api/dev/inject`·`/api/dev/reset`.
- [ ] 개인설정 DevTab은 제거하거나 "→ /dev" 링크로 축소.
- [ ] 검증: 주입 → 결과 메시지 + (재로딩) 지도·브리핑 반영.

## Task 3: 조작 — 스케줄러 즉시 발화 + 알림 전체 삭제
- [ ] 백엔드 `scenario.js`: `POST /api/dev/tick` — 활성 비행에 대해 스케줄러 1회 즉시 평가(`scheduler` 재사용)해 알림 적재/발송. 15분 대기 없이 발화.
- [ ] 백엔드 `POST /api/dev/clear-alerts` — 내 `triggered_alerts` 전체 삭제(현 reset의 알림삭제 분리).
- [ ] `TriggerTab.jsx`에 두 버튼 추가.
- [ ] 검증: [즉시 발화] → 알림 발생, [알림 삭제] → 0건.

## Task 4: 관찰 탭 — 기본 3종
- [ ] `ObserveTab.jsx`: 1s~2s 폴링으로
  - **triggered_alerts 실시간 피드**(백엔드 `GET /api/dev/alerts-feed` 또는 기존 `/api/me/notifications` 재사용) — 방금 발화한 알림이 뜨는 걸 실시간 확인.
  - **snapshot-meta 해시**(`/api/snapshot-meta`) — 데이터셋별 현재 해시(변경 감지 원천).
  - **CPU/메모리/디스크**(`/api/admin/metrics` 또는 `/api/health`) — `ResourceTimeline` 재사용 검토(admin 컴포넌트 import).
- [ ] 검증: 조작 탭에서 주입 → 관찰 탭 피드에 알림/해시 변화가 실시간으로 뜬다(Playwright).

## Task 5: 마무리
- [ ] `graphify update .`, `Architecture.md`/`EntryPoints.md`에 `features/developer/*`·`/api/dev/*` 반영.
- [ ] Playwright로 조작→관찰 e2e 1회 캡처.

---

# Phase 2 — 관찰 심화 (비효율이 눈에 보이게)

**목표:** 지금 안 찍히는 타이밍·크기·캐시를 계측해 리서치에서 나온 비효율을 드러낸다.

**드러낼 비효율(리서치):** snapshot-meta 5s TTL vs 60s 폴링 헛fetch · METAR/TAF 델타 없는 전체 재fetch · KIM NWP 20~30MB 통짜 전송 · 알림 스케줄러 15분 전체 재계산 · 디스크 회전 I/O.

## Task 6: 요청 타이밍 미들웨어
- [ ] `server.js`: `/api/*`에 `req.on('finish')` 미들웨어 — 경로·상태·소요ms·응답크기(content-length)를 링버퍼(최근 N=500)에 적재. `DISABLE_COLLECTION`에서만.
- [ ] `GET /api/dev/request-log?limit=` — 최근 요청 로그(경로별 지연·크기 집계).

## Task 7: 관찰 — 엔드포인트 지연·크기 패널
- [ ] `ObserveTab.jsx`: 엔드포인트별 **평균/최대 지연 + 응답크기** 표/막대. KIM NWP 통짜 payload가 한눈에 보이게. 폴링당 fetch 횟수 표시(헛fetch 감지).

## Task 8: 수집기 타임라인 + 소요시간
- [ ] `stats.js`: 각 수집 run에 `duration_ms` 추가(fetch→저장). (지금은 성공/실패만)
- [ ] `GET /api/dev/processor-log?limit=` — 최근 run(타입·시작·소요·성공여부·락스킵).
- [ ] `ObserveTab.jsx`: 수집기 타임라인(간트/리스트) + 소요시간.

## Task 9: store 상태 + 캐시 적중률
- [ ] `GET /api/dev/store-stats` — 타입별 아이템 수·대략 크기·마지막 갱신 시각. snapshot-meta cache hit/miss 카운터.
- [ ] `ObserveTab.jsx`: store 상태 카드 + 캐시 적중률.

---

# Phase 3 — 조작 확장 (더 많은 기능을 강제 테스트)

**목표:** 알림 외 기능들도 개발자 페이지에서 트리거·검증.

## Task 10: 브리핑 위험 프리셋
- [ ] 시나리오 확장(`scenario.js`): 목적지 IFR·경로 착빙(심)·경로 NOTAM·교체공항 필요 등을 세트 프리셋으로 주입 → 브리핑 6섹션·위험 아이콘·카테고리 배지 검증. (`briefing-composer.js`·`notam-briefing.js` 매칭 확인)
- [ ] 조작 탭에 프리셋 선택 UI.

## Task 11: 딥링크 생성기
- [ ] 선택 경로로 `?flight=<routeId>` URL 생성 + 테스트 알림 심기 버튼 → 링크 클릭 시 `FlightAlertDetail` 착지 확인.

## Task 12: 역할 전환 / 예보관 승인 (보안 민감 — 신중)
- [ ] 테스트 모드에서만: 내 계정 role 임시 전환(조종사↔예보관↔관리자) 또는 테스트 예보관 생성→원클릭 승인 → 권한별 UI·API 403 검증. **운영 절대 노출 금지 재확인.**

## Task 13: 공항 카테고리·레이어 토글 등 시각 조작
- [ ] 단일 공항 카테고리 강제(VFR/IFR/LIFR) · 기상 레이어 주입(바람/위성/SIGMET) — 지도·범례 반응 확인.

---

## 범위 밖 / 백로그
- 세션 리플레이(LogRocket류)·외부 에러추적(Sentry)·기능플래그 SaaS — 지금 규모 밖(YAGNI). 필요 시 후속.
- WebSocket 실시간 스트림 — Phase 1~2는 1~2s 폴링으로 충분, 부하 문제 생기면 전환.
- 관찰 지표의 영속화(히스토리 DB) — admin metrics 외 신규 테이블은 필요할 때만.

## 참고 (리서치 출처 파일)
- 데이터흐름·비효율: `backend/src/index.js`, `store.js`, `server.js`(readLatest·snapshot-meta), `useWeatherPolling.js`, `alerts/scheduler.js`
- 재사용 인프라: `backend/src/admin/*`, `frontend/src/features/admin/AdminPage.jsx`(+ ResourceTimeline), `backend/src/dev/scenario.js`, `PersonalSettingsPanel` DevTab
- 웹 레퍼런스: Feature Toggles(Fowler), MSW(mswjs.io), 관찰(Sentry/LogRocket/Highlight) — "조작+관찰 세트, 개발/테스트 한정"이 정석
