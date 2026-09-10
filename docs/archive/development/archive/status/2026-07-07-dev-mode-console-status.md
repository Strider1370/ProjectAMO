# 개발자 모드 콘솔 — 작업 상태 / 세션 핸드오프

> **새 세션 안내:** 이 파일 먼저 읽어라. 계획서 = [plans/2026-07-07-dev-mode-console.md](../plans/2026-07-07-dev-mode-console.md). 이 문서는 "지금까지 뭐가 됐고, 왜 이렇게 됐고, 무엇이 검증됐고, 함정이 뭐고, 다음에 뭘 할지"의 전체 맥락.

최종 갱신: 2026-07-07 · 상태: **Phase 1·2·3 전 구현·e2e 검증 완료 + 콘솔을 모달로 전환.** 계획서 Task 1~13 소진. 남은 건 커밋뿐.

### UX 변경 3(2026-07-07) — 로그인 불요 + 자동 로그인
- 사용자 요청: "1인 개발인데 로그인 왜 필요하냐, 로그인 안 해도 뜨게".
- `DeveloperConsoleButton`: 게이트에서 `!user` 제거 → 테스트 모드면 미로그인이어도 아이콘 렌더. 미로그인이면 `login('test','1234')` **자동 1회 호출**(useRef 가드, dev 빌드 전용). 백엔드 dev 라우터는 requireAuth 유지(세션 필요) — 자동 로그인으로 세션 확보라 우회 아님.
- ✅ e2e(dev:test, 쿠키 없는 새 컨텍스트): 로그인 안 했는데 아이콘 뜸 → 콘솔 열림 → 경로 드롭다운(RKSI→RJAA) 채워짐(=자동 로그인 성공). 초기 /api/auth/me 401은 게스트 최초 확인 호출(정상, 자동 로그인 전).

### UX 변경 2(2026-07-07) — 진입을 사이드바 전용 아이콘으로
- 사용자 요청: "개인설정에 넣지 말고 개발자 모드에선 전용 아이콘 하나 만들어라. (지금 안 보인다)".
- 신규 `frontend/src/features/developer/DeveloperConsoleButton.jsx`: 사이드바 아이콘(🔧 Wrench). 게이트 = `import.meta.env.DEV` + 런타임 `testMode`(/api/health) + 로그인. 클릭 시 `DeveloperConsole` 모달.
- `Sidebar.jsx`: `PersonalSettingsButton` 옆에 `<DeveloperConsoleButton>` 추가.
- `PersonalSettingsPanel`: 개발자 탭·DevTab·testMode·onOpenDevConsole **제거**(2탭으로 원복). `PersonalSettingsButton`도 콘솔 배선 제거.
- ✅ e2e(dev:test): 사이드바 개발자 콘솔 아이콘 노출(1), 개인설정 개발자 탭 없음(0), 아이콘 클릭→콘솔 모달(조작/관찰/주입). 일반 서버(dev:serve, testMode=false)에선 아이콘 미노출·/api/dev/* 404 실측. 콘솔 에러 0.

### UX 변경 1(2026-07-07) — 콘솔을 별도 페이지→모달로
- 사용자 요청: "페이지 따로 말고 설정창처럼 콘솔창이 뜨게".
- 신규 `frontend/src/features/developer/DeveloperConsole.jsx`: Fluent Dialog(760px)로 조작/관찰 탭을 담음. 닫히면 탭 언마운트(ObserveTab 폴링 중단).
- 진입: 개인설정(`PersonalSettingsPanel` 개발자 탭) "🛠 개발자 콘솔 열기" → `PersonalSettingsButton`이 `devOpen`으로 모달 렌더(lazy + `import.meta.env.DEV` 게이트 → 운영 빌드 제외). 개인설정은 닫히고 콘솔이 뜸.
- `/dev` 페이지는 **보조 진입(직접 URL/Playwright)** 으로 유지 — 같은 TriggerTab/ObserveTab 재사용이라 중복 아님.
- ✅ e2e(dev:test): 개인설정→개발자 탭→콘솔 열기→모달(조작/관찰·주입·역할전환·관찰패널) 지도 위에 오버레이. 콘솔 에러 0.

### Phase 3 완료(2026-07-07) — 조작 확장
- `scenario.js`: `injectRouteSigmet` 프리셋화(SIG_PHENOM ts=EMBD_TS / ice=SEV_ICE), `injectNotam`(location=ICAO 스코프) 추가. `inject`에 `routeIce`·`destNotam`. `POST /api/dev/role`(pilot/forecaster/admin — DB role+airports 갱신 + `req.session.role` 즉시 반영, 재로그인 불필요). INJECT_TYPES에 notam 추가(reset 복구).
- `TriggerTab.jsx`: 시나리오 체크박스 5종(LIFR/IFR/뇌우/착빙/NOTAM), 딥링크 생성기(`?flight=` URL+복사/새탭), 역할 전환(현재 role 뱃지 + 3버튼, `useAuth().refresh`). developerApi `setRole`.
- ✅ e2e(dev:test, `test`/`1234`, 실제 브리핑 파이프라인): 프리셋 주입 → 브리핑 hazards에 **SEV_ICE**, **destAlternateRequired=true**(TAF ETA±1h), NOTAM(TEST DANGER AREA) 섹션 반영. 역할 admin→`/api/admin/metrics` 200, pilot→403(세션 즉시 적용). 딥링크 `?flight=1` 생성·착지 확인. UI 렌더·콘솔 에러 0.
- ⚠️ 함정: enroute 착빙/난류는 **NWP 모델파일(kim/ktg) 전용**이라 store 주입 불가 → SIGMET phenomenon_code로 adverse hazards에만 반영(enroute 모델 섹션엔 안 뜸). 역할전환은 프론트 AuthContext가 페이지 새로고침/이동 시 `/me`로 갱신되어야 권한 UI(/admin 등) 반영.
- Task 13(단일공항 카테고리 강제·레이어 주입)은 별도 구현 안 함: 카테고리 강제는 inject overlay가 이미 수행, 레이어 토글은 프론트 상태 관심사(가치 낮음)로 판단해 생략. 필요 시 후속.

### Phase 2 완료(2026-07-07) — 관찰 심화 계측
- 신규 `backend/src/dev/instrument.js`: 요청 링버퍼(500) + snapshot-meta 캐시 hit/miss 카운터(in-memory, 파일 미변경).
- `server.js`: `DISABLE_COLLECTION`에서만 `/api` finish 미들웨어(경로·status·ms·content-length 적재) + `getCachedSnapshotMeta`에 hit/miss bump.
- `stats.js`: recent_runs에 `duration_ms`, 타입별 `skips`. `index.js` `runWithLock` 한 곳에서 소요시간 측정 + 스킵 카운트(모든 수집기 공통 chokepoint).
- dev 엔드포인트 추가: `GET /request-log`(경로별 지연·크기 집계), `GET /processor-log`(run·소요·요약), `GET /store-stats`(타입별 아이템수·바이트 + 캐시통계).
- `ObserveTab.jsx`: 엔드포인트 지연/크기 표·수집기 타임라인·store/캐시 카드 추가(기존 vitals·피드·해시 위에).
- ✅ e2e(dev:test, `test`/`1234`): request-log 12경로(inject 3665ms 실측)·캐시 hit5/miss3(5s TTL vs 2s 폴링 헛fetch 가시화)·store-stats 실측(taf_overseas 847KB·notam 611KB/430건·taf 283KB = 통짜 payload 노출)·processor-log 13타입/30run. 콘솔 에러 0.
- ⚠️ 함정: 테스트 모드는 cron off → request-log는 **콘솔 자체 폴링 트래픽**만, processor-log는 **stats/latest.json에서 로드된 마지막 실제 수집**(구파일엔 duration_ms 없어 '—', 실서버 1회 수집 후 채워짐). content-length 없는 응답은 request-log bytes=0(store-stats는 JSON 바이트 직접측정이라 정확).

### Phase 1 완료(2026-07-07) — 코드·검증
- 백엔드: `backend/src/alerts/scheduler.js` `runTick` export + `{evaluated,fired}` 반환. `backend/src/dev/scenario.js`에 `POST /api/dev/tick`(스케줄러 즉시 발화)·`POST /api/dev/clear-alerts`·`GET /api/dev/vitals` 추가. 모두 기존 `DISABLE_COLLECTION` 게이트 하위.
- 프론트: `frontend/src/features/developer/`(`DeveloperPage.jsx`·`developerApi.js`·`tabs/TriggerTab.jsx`·`tabs/ObserveTab.jsx`). `App.jsx`에 `/dev` lazy 라우트(`import.meta.env.DEV` 게이트). 개인설정 DevTab은 `/dev` 링크로 축소.
- 관찰 탭: 2초 폴링 — vitals(uptime/RSS/heap)·triggered_alerts 피드·snapshot-meta 해시(37행).
- ✅ e2e(Playwright, dev:test): testpilot 로그인 → `/dev` 두 탭 렌더(비-테스트 모드면 경고) → 주입 시 RKSI 알림 5건 발화·피드 반영 → 초기화로 실황 복구+알림 삭제. 콘솔 에러 0.
- 문서: `EntryPoints.md §11`(조작/관찰 테스트 흐름), `Architecture.md` features 트리에 `developer/` 추가, `graphify update` 완료.

---

## 0. 한 줄 요약

로컬 개발/테스트를 위해 **"테스트 인스턴스 모드"**(`npm run dev:test` = cron off + 데이터 고정 + 개발자 주입 도구)를 만들어 **검증 완료**했다. 다음 단계는 이 위에 **`/dev` 대시보드 페이지**(조작+관찰)를 계획서대로 구현하는 것. 부수적으로 딥링크 "전체 브리핑 보기"도 이 세션에서 고쳐서 작동한다.

---

## 1. 이 세션의 여정 (왜 지금 구조가 됐나)

1. 처음엔 "개발자 버튼으로 악기상 발생 → 알림 뜨는지" 요청. 초기 구현은 **운영 store/파일을 덮어쓰는 방식**이었음.
2. 문제 발생: cron이 몇 분 뒤 되덮음, 60초 폴링 지연, `readLatest`가 캐시↔디스크 대조로 되돌림, 지도 반영 안 됨 → **운영 데이터를 건드리는 접근이 근본적으로 나쁨**을 확인.
3. 사용자 통찰: **"메인이랑 똑같은데 cron이 안 도는 별도 테스트 환경"**을 원함 = 업계의 **staging/test instance** 패턴.
4. 채택: **같은 코드 + 설정만 다르게**. `DISABLE_COLLECTION=1`로 cron 끄고, 주입은 **메모리(store 캐시)에만**, 파일 미변경. → 완성·검증.
5. 그다음 사용자: 개발자 모드의 진짜 목적은 **조작(트리거) + 관찰(로그·데이터흐름·비효율)** 이라며, `/dev` 대시보드를 제대로 만들자 → 리서처 3 + 웹검색 → **계획서 작성(Phase 1~3)**.

---

## 2. 지금 실제로 구현·검증된 것 (코드 반영 완료)

### 2-1. 테스트 인스턴스 모드 (핵심, 검증됨)

- **cron 게이트** — `backend/src/index.js` `main()`: `stats.initFromFile` 직후 `if (process.env.DISABLE_COLLECTION) { log; return }`. store는 파일에서 로드(고정)되지만 **cron 스케줄·초기수집을 건너뜀**.
- **readLatest 게이트** — `backend/server.js` `readLatest(type)`: `if (process.env.DISABLE_COLLECTION) return cached`. 일반 모드는 캐시↔디스크 해시 대조로 되돌리는데(그래서 in-memory 주입이 무효화됐던 원인), 테스트 모드는 **캐시를 그대로 서빙** → 주입이 지도·API에 일관 반영, 파일 미변경.
- **health testMode** — `backend/server.js` `/api/health` → `{ ok, uptime, testMode: !!process.env.DISABLE_COLLECTION }`.
- **dev 라우터 마운트 게이트** — `backend/server.js`: `if (process.env.DISABLE_COLLECTION) app.use('/api/dev', createDevRouter())`. **테스트 모드에서만 존재**(일반/운영은 404).
- **런처** — `scripts/projectamo-dev.mjs`: `serve:test` 커맨드 추가 → `process.env.DISABLE_COLLECTION='1'` 세팅 후 serve. (startProcess가 env 상속)
- **npm 스크립트** — `package.json`: `"dev:test": "node scripts/projectamo-dev.mjs serve:test"`.

### 2-2. dev 라우터 (주입/초기화) — `backend/src/dev/scenario.js` (신규)

- `POST /api/dev/inject { routeId, scenario:{depLifr,destIfr,routeTs} }`: store 캐시(메모리)에 오버레이(출발 LIFR·목적지 IFR·경로 관통 TS SIGMET) `updateCache`로 얹고, `composeBriefing`+`buildSnapshot`+`detectChanges`(깨끗 baseline vs curr)로 알림 계산 → `triggered_alerts` 적재 + `dispatchAlert`(텔레그램, 400ms 간격 flood 회피). **파일 미변경.**
- `POST /api/dev/reset`: `loadLatest`로 metar/taf/sigmet를 파일에서 다시 읽어 `updateCache`(실황 복구) + 내 `triggered_alerts` 삭제.
- 게이트: `requireAuth`(자기 경로만).
- ⚠️ **`backend/src/dev/fire-alert.js`는 삭제됨**(옛 디스크덮어쓰기 방식). 지금은 scenario.js만.

### 2-3. 프론트 개발자 탭 — `frontend/src/features/personal/PersonalSettingsPanel.jsx`

- `DevTab`: 경로 선택(flights[0]) + [🌩 악기상 주입]/[↺ 초기화] → `/api/dev/inject`·`/api/dev/reset`. 성공 시 `setTimeout(reload, 900)`로 지도·SIGMET 즉시 반영.
- **이중 게이트**: `import.meta.env.DEV`(빌드 시 제거) + 런타임 `testMode`(`/api/health` fetch). → **테스트 모드에서만 개발자 탭이 뜸.**

### 2-4. `/test` 페이지 게이트 — `frontend/src/app/App.jsx`

- `if (pathname === '/test' && import.meta.env.DEV)` — 디자인 테스트 페이지를 운영 빌드에서 제거(전엔 게이트 없어 운영 노출됐음).

### 2-5. 딥링크 "전체 브리핑 보기" 수정 (이 세션에서 고침, 유지)

원래 알림의 [전체 브리핑 보기]가 빈 패널만 열거나 `.trim()` 크래시났음. 수정:
- `frontend/src/app/App.jsx` `onOpenRoute`: `listSavedRoutes()`로 백엔드 id 찾아 `mapRef.current.loadRouteBriefing(route)` + 패널 열기.
- `frontend/src/features/map/MapView.jsx`: imperative handle에 `loadRouteBriefing: (saved) => routeBriefing.actions.loadSavedRoute(saved, { autoBriefing: true })`.
- `frontend/src/features/route-briefing/useRouteBriefing.js`: `loadSavedRoute(saved, opts)` + `autoBriefingPending` state + `autoSearchRef` + **체인 effect**(자동추천이 픽스 채우면 → 검색 1회 실행 → routeResult 생기면 브리핑 생성). 국내(RKSI→RKPC)·국제(RKSI→RJAA) 모두 검증됨.
- `frontend/src/features/route-briefing/lib/routePlanner.js`: `normalizeIdent` = `(value ?? '').trim()...` (픽스 undefined 방어, 크래시 방지).
- ⚠️ **삭제됨**: `frontend/src/features/dev/DevScenarioPage.jsx`(+css) — 격리 시나리오 계산 페이지를 만들었다가 사용자가 "이게 아니라 테스트 인스턴스"라 해서 제거. App.jsx의 `/dev` 라우트도 제거.

### 2-6. 로컬 데이터/계정 상태

- **env: 루트 `.env` 하나에 통합** (로컬, gitignore). ⚠️ `config.js loadDotenv`는 backend/src에서 위로 올라가며 **첫 `.env` 하나만** 로드 → 처음엔 `backend/.env`를 만들어 루트 `.env`(API_AUTH_KEY·AIRKOREA·OPENSKY·KIM·DATA_PATH)를 가려서 auth-missing 발생 → **`backend/.env` 내용을 루트 `.env`에 합치고 삭제함.** 루트 `.env`에 이제 API 키들 + `SESSION_SECRET`·`NODE_ENV`·`FRONTEND_ORIGIN`·`TELEGRAM_BOT_TOKEN`·`TELEGRAM_CHAT_ID` 모두 있음. `DATA_PATH=./backend/data`→backend/data(불변).
- **테스트 계정: `test` / `1234`** (user id=1, 옛 `testpilot`에서 개명·비번 변경. `1234`는 register 최소길이(8) 미달이지만 verifyLogin엔 길이검사 없어 로그인 됨 — 로컬 테스트 전용).
- **route #1** = `test`(id=1) 소유, `RKSI→RJAA 데모`, `payload.routeGeometry` 있음(직선 8점), `alert_enabled=1`. inject는 이 경로의 `payload.routeGeometry`가 있어야 동작(SIGMET 박스용).
- ⚠️ 로컬 DB는 옛 스키마라 이 세션에서 **수동 ALTER**로 컬럼 채웠음.

---

## 3. 검증된 사실 (새 세션에서 재검증 불필요)

- ✅ `dev:test` → 로그 `[collection] DISABLE_COLLECTION 설정됨` (cron off).
- ✅ `/api/health` → `testMode:true` (테스트 모드), 일반 모드는 false.
- ✅ inject → 브리핑 RKSI 시정 4.0km→**0.8km**, 위험 0→**1(뇌우)**, `/api/sigmet` 아이템 1→**2**, 지도 SIGMET 뱃지 **2**(fresh load), 알림 4건+텔레그램.
- ✅ **파일 미변경**: inject 후 `data/taf/latest.json` RKSI base.vis = 4000 그대로.
- ✅ reset → 실황 복구(4.0km/위험0) + 알림 삭제.
- ✅ 개발자 탭: 테스트 모드에서만 렌더(Playwright 확인).
- ✅ 딥링크 [전체 브리핑 보기] → RKSI→RJAA 전체 항로(G597 웨이포인트) 그려지고 브리핑 렌더(크래시 없음).

---

## 4. 함정 / 주의 (반드시 인지)

1. **readLatest 되돌림**: 일반 모드(cron on)에선 `readLatest`가 캐시↔디스크 대조로 in-memory 주입을 되돌린다. 그래서 **주입은 테스트 모드에서만 유효**. (Phase에서 개발자 페이지도 테스트 모드 게이트 유지)
2. **Playwright reload 타이밍**: `window.location.reload()` 직후 뱃지를 읽으면 이전 값이 잡힐 수 있음(재fetch 전). 검증 시 fresh `goto` 또는 넉넉한 대기.
3. **inject엔 routeGeometry 필수**: `buildBriefingRequest`가 `payload.routeGeometry` 없으면 null → 400 no_geometry. route #1엔 있음.
4. **텔레그램 flood**: 여러 알림 연속 발송 시 429. dispatch 사이 400ms 간격 있음.
5. **국제 IFR 경로 재검색**: `KNOWN_AIRPORTS`는 국내 8개지만 공항 드롭다운은 더 큼(RJAA 선택 가능). loadSavedRoute의 체인 effect가 자동추천(exit fix 포함)까지 기다렸다 검색해야 완성됨 — 이미 반영.
6. **마이그레이션 순서 버그(별도 task chip 생성됨)**: `backend/src/db/index.js` `createDb`가 `schema.exec`(인덱스가 alert_enabled 참조)를 `ensureColumns`보다 먼저 실행 → **구버전 DB에서 서버 부팅 크래시**. AWS에 구DB로 #13 배포 시 위험. 회귀테스트+순서수정 필요(task chip으로 등록됨).
7. **recompute export**: `scheduler.js`에서 `export function recompute` 했는데 지금 scenario.js는 `buildBriefingRequest`·`buildSnapshot`만 씀 → recompute export는 현재 미사용(정리 후보, 무해).

---

## 5. 배포/운영 관련 (사용자와 논의된 것 — 중요)

- **프론트는 `npm run build`로 빌드해 nginx 정적 서빙** → `import.meta.env.DEV=false` → 개발자 탭·`/test` 코드가 **빌드 결과물에서 제거됨**(운영 노출 0). ✓
- **dev 라우터는 `DISABLE_COLLECTION`일 때만 마운트** → 운영엔 없음(운영은 그 플래그 안 켬). ✓
- ⚠️ **AWS 백엔드 `NODE_ENV=production` 미설정 의심**: PM2 시작 커맨드(`docs/operations.md`)에 없음. 미설정 시:
  - `SESSION_SECRET` 임시값 → **재시작(`pm2 restart`)마다 전체 로그아웃**.
  - 쿠키 `Secure` 안 붙음, CORS 안 조여짐.
  - **권장:** 서버 `backend/.env`에 `NODE_ENV=production` + `SESSION_SECRET`(openssl rand -hex 32) 세트 설정. (production인데 SESSION_SECRET 없으면 `session.js`가 throw → 부팅 실패, 반드시 세트로.)
- 운영 데이터 경로: `DATA_PATH=/opt/projectamo/shared/data` (PM2). 지형 4GB는 git 밖, 서버 직접 업로드.

---

## 6. 리서치 종합 (재실행 불필요 — 계획서 근거)

**리서처1(테스트할 상호작용 우선순위):** ⭐⭐⭐ 알림 스케줄러 즉시발화(15분 대기 제거)·브리핑 위험탐지 프리셋 > ⭐⭐ 역할전환/예보관승인·딥링크 > ⭐ 공항카테고리·레이어·NOTAM·저장경로.

**리서처2(데이터흐름·관찰):** 흐름 = cron수집→store캐시→API→60초 폴링(snapshot-meta). **안 찍히는 것**: 수집기 소요시간·캐시 hit/miss·응답크기·store크기. **비효율**: snapshot-meta 5s TTL vs 60s 폴링 헛fetch·METAR/TAF 전체 재fetch(델타X)·KIM NWP 20~30MB 통짜·알림 스케줄러 15분 전체 재계산·디스크 회전 I/O. **재사용 엔드포인트**: `/api/admin/metrics`(CPU/mem/disk)·`/api/stats`·`/api/snapshot-meta`·`/api/health`. **추가 제안**: `/api/dev/store-stats`, `/api/dev/request-log`(타이밍 미들웨어), `/api/dev/processor-log`(duration_ms).

**리서처3(재사용 인프라):** `/admin` 콘솔이 대시보드 템플릿 — `ResourceTimeline`(Recharts)·게이지·5초 폴링·테이블. dev 도구·게이팅 이미 있음. **권장: `/dev` 독립 페이지 + import.meta.env.DEV 게이트 + 기존 엔드포인트/컴포넌트 재사용 → 백엔드 ≈0, 프론트 ~200줄.** `frontend/src/features/developer/{DeveloperPage,developerApi,tabs/*}` 구조.

**웹 레퍼런스:** Feature Toggles(Fowler) / MSW(mswjs.io, 네트워크 목킹 — 우리 주입의 프론트판) / 관찰 Sentry·LogRocket·Highlight. 정석 = **"조작+관찰 세트, 개발/테스트 한정".**

---

## 7. 다음 할 일 (계획서 Phase 1부터)

계획서 [plans/2026-07-07-dev-mode-console.md](../plans/2026-07-07-dev-mode-console.md) 의 **Phase 1 (Task 1~5)** 부터:
1. `/dev` 라우트+페이지 골격(테스트모드 게이트) 2. 조작 탭(현 DevTab 이관) 3. 스케줄러 즉시발화+알림삭제 엔드포인트 4. 관찰 탭 기본3(triggered_alerts 피드·snapshot-meta·CPU/메모리) 5. 마무리(graphify·Architecture).

**착수 전 확인:** `npm run dev:test`로 띄우고 `testpilot/testpass123` 로그인, route #1 존재 확인.

---

## 8. 현재 러닝/정리 상태

- 이 세션 중 띄운 테스트 서버들은 사용자 요청으로 **포트(3001/5173) 비워둠**. 새 세션에선 `npm run dev:test`로 새로 띄우면 됨.
- 임시 검증 스크립트(`_*.mjs`)·시드 스크립트 전부 삭제됨(정리 완료). `_dev_backup.json` 없음.
- 커밋 안 함(이 세션 변경은 워킹트리에 있음) — 필요 시 커밋/브랜치는 사용자 지시 대기.
- 별도 task chip: "마이그레이션 크래시 수정"(§4-6) 등록됨.
