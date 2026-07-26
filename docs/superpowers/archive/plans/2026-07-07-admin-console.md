# 관리자 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin이 `/admin`에서 서버 지표(리소스 24h 타임라인·트래픽)를 보고, 가입을 승인/거절하고, 예보관 계정을 만드는 관리자 콘솔을 구현한다.

**Architecture:** 기존 auth(`backend/src/auth`, `backend/src/db/users.js`) 위에 얹는다. 백엔드는 `/api/admin/*`(requireRole admin) 라우터 + 리소스 샘플러 + 방문 추적 미들웨어. DB(better-sqlite3)에 `users.status`·`metrics`·`visits` 추가. 프론트는 `features/monitoring/MonitoringPage.jsx` 패턴을 따른 `features/admin/AdminPage.jsx`.

**Tech Stack:** Node/Express, better-sqlite3, bcrypt, zod, node:test. React + Fluent(Pretendard, slate accent). 차트는 인라인 SVG(외부 차트 라이브러리 없음).

스펙: `docs/superpowers/specs/2026-07-07-admin-console-design.md`

---

## 리뷰 반영 & 실행 지침 (필독 — 코드리뷰 결과 2026-07-07)

**검증·TDD는 최소로.** 태스크마다 test-first를 강제하지 않는다. 아래만 지킨다:
- 백엔드: **Task 5·6·7만** 통합 스모크 1개씩. 나머지는 구현 후 `npm --prefix backend test` 한 번 통과면 OK.
- 프론트: 파일마다 `npx esbuild ... --bundle=false` 빌드 스모크 + 마지막에 브라우저로 **한 번** 수동 확인(관리자 로그인→진입). Playwright 생략.

**정정 사항(계획 본문의 예시 코드보다 이게 우선):**

1. **테스트 패턴** — 이 레포는 `supertest`/`makeApp()` 안 씀. 실제는 `backend/test/auth.test.js`의 **`makeServer()`(→`{db, app}`) + 노드 `http` 리슨 + `fetch(at(server, path))`** 패턴이다. 아래 태스크의 `agent.post().expect()` 예시는 **무시**하고, auth.test.js 상단 헬퍼를 복붙해 최소 스모크만 작성한다.
2. **cookie-parser 필수 설치** — 현재 미설치. express-session은 일반 쿠키를 파싱하지 않으므로 `visits.js`의 `req.cookies`가 안 됨. → `npm --prefix backend install cookie-parser` 후 `server.js`에서 `import cookieParser from 'cookie-parser'; app.use(cookieParser())`(sessionMiddleware 앞). **backend 의존성 추가이므로 배포는 full deploy.**
3. **프론트 라우팅은 React Router가 아님** — `frontend/src/app/App.jsx`의 `App()`이 `window.location.pathname === '/monitoring'`이면 그 페이지를 통째로 렌더하는 방식. `/admin`도 동일하게:
   ```jsx
   const AdminPage = lazy(() => import('../features/admin/AdminPage.jsx'))
   // App() 안, 다른 pathname 분기 옆에:
   if (window.location.pathname === '/admin') {
     return <Suspense fallback={null}><AuthProvider><AdminPage /></AuthProvider></Suspense>
   }
   ```
   AuthProvider로 감싸 role을 알 수 있게 한다. AdminPage는 `/api/admin/*` 401·403이면 "관리자 전용" 안내만. 진입 링크는 Sidebar에 role이 admin일 때만 `href: '/admin'`(다른 항목처럼 `window.location.assign`). SPA fallback이라 서버 라우트 변경 불필요.
4. **SQLite CHECK 주의** — `ALTER TABLE ADD COLUMN ... CHECK`는 SQLite가 무시한다. `status` CHECK는 **fresh DB(CREATE TABLE)에서만** 강제되고, 기존 운영 DB는 앱 레벨 검증(`setUserStatus`의 화이트리스트)으로 보장 — 이게 정상, 추가 조치 불필요.
5. **verifyLogin이 status 반환**(Task 3 Step 4)에 로그인 차단(Task 4)이 의존 — 순서 지킬 것. 승인 후 사용자는 재로그인해야 세션 획득(정상 UX).

---

## 파일 구조

**Backend**
- Modify `backend/src/db/schema.sql` — users.status, metrics·visits 테이블
- Modify `backend/src/db/index.js` — users.status idempotent 마이그레이션
- Modify `backend/src/db/users.js` — createUser status, verifyLogin status, listUsers/listPending/setUserStatus
- Modify `backend/src/auth/router.js` — register→pending, login이 비활성 차단
- Create `backend/src/admin/metrics.js` — 리소스 샘플링·저장·조회
- Create `backend/src/admin/visits.js` — 방문 추적 미들웨어·조회
- Create `backend/src/admin/router.js` — `/api/admin/*`
- Modify `backend/server.js` — visits 미들웨어·admin 라우터 마운트·샘플러 시작
- Tests: `backend/test/admin.test.js`, `backend/test/auth.test.js`(확장)

**Frontend**
- Create `frontend/src/features/admin/adminApi.js`
- Create `frontend/src/features/admin/AdminPage.jsx`
- Create `frontend/src/features/admin/ResourceTimeline.jsx`(SVG 차트)
- Create `frontend/src/features/admin/CreateForecasterDialog.jsx`
- Create `frontend/src/features/admin/AdminPage.css`
- Modify 앱 네비/라우팅(`frontend/src/app/App.jsx` + `Sidebar.jsx`) — admin 전용 `/admin` 진입

---

## Task 1: users.status 스키마 + 마이그레이션

**Files:**
- Modify: `backend/src/db/schema.sql`
- Modify: `backend/src/db/index.js:12-18`
- Test: `backend/test/db.test.js`

- [ ] **Step 1: 실패 테스트 작성** — `backend/test/db.test.js`에 추가

```js
import { createDb } from '../src/db/index.js'

test('users has status column defaulting to active', () => {
  const db = createDb(':memory:')
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name)
  assert.ok(cols.includes('status'))
  db.prepare("INSERT INTO users (username,password_hash,role,created_at) VALUES ('u','h','pilot','t')").run()
  const row = db.prepare("SELECT status FROM users WHERE username='u'").get()
  assert.equal(row.status, 'active')
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/db.test.js` · Expected: FAIL (`status` 컬럼 없음)

- [ ] **Step 3: schema.sql 수정** — `users` CREATE TABLE에 `created_at` 앞에 추가:

```sql
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','active','rejected')),
```

- [ ] **Step 4: index.js 마이그레이션** — `ensureColumns` 안, users airports 줄 아래 추가:

```js
  if (!userCols.includes('status')) database.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'") // 가입 승인
```

- [ ] **Step 5: 통과 확인** — Run: `node --test backend/test/db.test.js` · Expected: PASS

- [ ] **Step 6: Commit** — `git add backend/src/db/schema.sql backend/src/db/index.js backend/test/db.test.js && git commit -m "feat(db): users.status 컬럼 + 마이그레이션(기존=active)"`

---

## Task 2: metrics·visits 테이블

**Files:**
- Modify: `backend/src/db/schema.sql`
- Test: `backend/test/db.test.js`

- [ ] **Step 1: 실패 테스트**

```js
test('metrics and visits tables exist', () => {
  const db = createDb(':memory:')
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
  assert.ok(t.includes('metrics'))
  assert.ok(t.includes('visits'))
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/db.test.js` · Expected: FAIL

- [ ] **Step 3: schema.sql에 테이블 추가**

```sql
CREATE TABLE IF NOT EXISTS metrics (      -- 리소스 시계열(60초 샘플, 7일 보관)
  ts         TEXT NOT NULL,
  cpu_pct    REAL, mem_used INTEGER, mem_total INTEGER, disk_used INTEGER, disk_total INTEGER
);
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(ts);

CREATE TABLE IF NOT EXISTS visits (       -- 익명 포함 방문 추적
  visitor_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_visits_last ON visits(last_seen);
```

- [ ] **Step 4: 통과 확인** — Run: `node --test backend/test/db.test.js` · Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(db): metrics·visits 테이블"`

---

## Task 3: users.js — status 반영 + 관리 쿼리

**Files:**
- Modify: `backend/src/db/users.js`
- Test: `backend/test/db.test.js`

- [ ] **Step 1: 실패 테스트**

```js
import { createUser, verifyLogin, listUsers, listPending, setUserStatus } from '../src/db/users.js'

test('createUser status + verifyLogin returns status + admin queries', () => {
  const db = createDb(':memory:')
  createUser(db, { username: 'pilotA', password: 'password1', status: 'pending' })
  assert.equal(verifyLogin(db, 'pilotA', 'password1').status, 'pending')
  assert.equal(listPending(db).length, 1)
  setUserStatus(db, listPending(db)[0].id, 'active')
  assert.equal(verifyLogin(db, 'pilotA', 'password1').status, 'active')
  assert.equal(listUsers(db)[0].username, 'pilotA')
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/db.test.js` · Expected: FAIL

- [ ] **Step 3: createUser에 status 추가** — 시그니처·INSERT 수정:

```js
export function createUser(db, { username, password, role = 'pilot', displayName = null, airports = null, status = 'active' }) {
```
INSERT 문·값에 status 포함:
```js
      .prepare('INSERT INTO users (username, password_hash, role, display_name, airports, status, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(username, hash, role, displayName ?? username, airportsJson, status, now)
```

- [ ] **Step 4: verifyLogin이 status 반환** — SELECT·리턴에 status 추가:

```js
    .prepare('SELECT id, username, password_hash, role, display_name, airports, status FROM users WHERE username = ?')
```
리턴 객체에 `status: row.status` 추가.

- [ ] **Step 5: 관리 쿼리 추가** (파일 하단, default export 위):

```js
export function listUsers(db) {
  return db.prepare('SELECT id, username, role, status, created_at FROM users ORDER BY created_at DESC').all()
}
export function listPending(db) {
  return db.prepare("SELECT id, username, role, created_at FROM users WHERE status='pending' ORDER BY created_at").all()
}
export function setUserStatus(db, id, status) {
  if (!['pending', 'active', 'rejected'].includes(status)) throw new Error('invalid_status')
  return db.prepare('UPDATE users SET status=? WHERE id=?').run(status, id).changes
}
```
default export에 `listUsers, listPending, setUserStatus` 추가.

- [ ] **Step 6: 통과 확인** — Run: `node --test backend/test/db.test.js` · Expected: PASS

- [ ] **Step 7: Commit** — `git commit -am "feat(db): users status 반영 + listUsers/listPending/setUserStatus"`

---

## Task 4: 가입=대기 + 로그인 차단

**Files:**
- Modify: `backend/src/auth/router.js:15-40`
- Test: `backend/test/auth.test.js`

- [ ] **Step 1: 실패 테스트** — `backend/test/auth.test.js`에 추가(기존 supertest/앱 픽스처 패턴 재사용). 등록 후 즉시 로그인하면 승인대기로 막혀야 한다:

```js
test('register creates pending user and login is blocked until approved', async () => {
  const { agent, db } = makeApp() // 기존 테스트 헬퍼(앱+인메모리 db). 없으면 auth.test.js 상단 헬퍼 참고.
  await agent.post('/api/auth/register').send({ username: 'newpilot', password: 'password1' }).expect(201)
  await agent.post('/api/auth/login').send({ username: 'newpilot', password: 'password1' }).expect(403)
  setUserStatus(db, listPending(db)[0].id, 'active')
  await agent.post('/api/auth/login').send({ username: 'newpilot', password: 'password1' }).expect(200)
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/auth.test.js` · Expected: FAIL(로그인 200 남)

- [ ] **Step 3: register→pending** — `router.js` register 안 `createUser` 호출에 status 추가:

```js
      createUser(database(), { username: parsed.data.username, password: parsed.data.password, role: 'pilot', status: 'pending' })
```

- [ ] **Step 4: login이 비활성 차단** — login 핸들러에서 verifyLogin 성공 후, 세션 세팅 전에:

```js
    if (user.status !== 'active') {
      return res.status(403).json({ error: user.status === 'rejected' ? 'account_rejected' : 'pending_approval' })
    }
```

- [ ] **Step 5: 통과 확인** — Run: `node --test backend/test/auth.test.js` · Expected: PASS

- [ ] **Step 6: Commit** — `git commit -am "feat(auth): 가입=승인대기, 미승인 로그인 403 차단"`

---

## Task 5: 시스템 리소스 샘플러 (metrics.js)

**Files:**
- Create: `backend/src/admin/metrics.js`
- Test: `backend/test/admin-metrics.test.js`

- [ ] **Step 1: 실패 테스트** — `backend/test/admin-metrics.test.js`

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDb } from '../src/db/index.js'
import { sampleOnce, readMetrics, currentResources } from '../src/admin/metrics.js'

test('sampleOnce writes a row; readMetrics returns it with peak', () => {
  const db = createDb(':memory:')
  sampleOnce(db)
  const out = readMetrics(db, '24h')
  assert.ok(out.series.length >= 1)
  assert.ok(Number.isFinite(out.peakCpu.cpu_pct))
  const cur = currentResources()
  assert.ok(cur.memTotal > 0)
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/admin-metrics.test.js` · Expected: FAIL

- [ ] **Step 3: metrics.js 구현**

```js
import os from 'node:os'
import { execSync } from 'node:child_process'

const WINDOW = { '1h': 3600e3, '24h': 86400e3, '7d': 604800e3 }
const RETAIN_MS = WINDOW['7d']

export function currentResources() {
  const cpuPct = Math.min(100, Math.round((os.loadavg()[0] / os.cpus().length) * 100))
  const memTotal = os.totalmem(); const memUsed = memTotal - os.freemem()
  let diskUsed = 0; let diskTotal = 0
  try {
    const line = execSync('df -kP /', { encoding: 'utf8' }).trim().split('\n').pop().split(/\s+/)
    diskTotal = Number(line[1]) * 1024; diskUsed = Number(line[2]) * 1024 // Linux/mac. Windows면 0(무해).
  } catch { /* df 없음(Windows dev) → 0 */ }
  return { cpuPct, memUsed, memTotal, diskUsed, diskTotal }
}

export function sampleOnce(db) {
  const r = currentResources(); const now = new Date().toISOString()
  db.prepare('INSERT INTO metrics (ts,cpu_pct,mem_used,mem_total,disk_used,disk_total) VALUES (?,?,?,?,?,?)')
    .run(now, r.cpuPct, r.memUsed, r.memTotal, r.diskUsed, r.diskTotal)
  db.prepare('DELETE FROM metrics WHERE ts < ?').run(new Date(Date.now() - RETAIN_MS).toISOString())
}

export function readMetrics(db, range = '24h') {
  const since = new Date(Date.now() - (WINDOW[range] ?? WINDOW['24h'])).toISOString()
  const series = db.prepare('SELECT ts,cpu_pct,mem_used,mem_total,disk_used,disk_total FROM metrics WHERE ts >= ? ORDER BY ts').all(since)
  const peakCpu = series.reduce((m, r) => (r.cpu_pct > (m?.cpu_pct ?? -1) ? r : m), series[0] ?? { cpu_pct: 0 })
  return { range, series, peakCpu, current: currentResources() }
}

export function startSampler(db, intervalMs = 60000) {
  sampleOnce(db)
  const t = setInterval(() => { try { sampleOnce(db) } catch { /* noop */ } }, intervalMs)
  t.unref?.()
  return () => clearInterval(t)
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test backend/test/admin-metrics.test.js` · Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): 리소스 샘플러(metrics.js) — os+df, 7일 보관"`

---

## Task 6: 방문 추적 (visits.js)

**Files:**
- Create: `backend/src/admin/visits.js`
- Test: `backend/test/admin-visits.test.js`

- [ ] **Step 1: 실패 테스트**

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { createDb } from '../src/db/index.js'
import { recordVisit, trafficStats } from '../src/admin/visits.js'

test('recordVisit upserts; trafficStats counts online(5m) and total', () => {
  const db = createDb(':memory:')
  recordVisit(db, 'vis-1'); recordVisit(db, 'vis-1'); recordVisit(db, 'vis-2')
  const s = trafficStats(db)
  assert.equal(s.total, 2)
  assert.equal(s.online, 2) // 방금 기록 → 5분 내
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/admin-visits.test.js` · Expected: FAIL

- [ ] **Step 3: visits.js 구현**

```js
import { randomUUID } from 'node:crypto'

const COOKIE = 'amo.vid'
const ONLINE_MS = 5 * 60 * 1000

export function recordVisit(db, visitorId) {
  const now = new Date().toISOString()
  db.prepare('INSERT INTO visits (visitor_id,first_seen,last_seen) VALUES (?,?,?) ON CONFLICT(visitor_id) DO UPDATE SET last_seen=?')
    .run(visitorId, now, now, now)
}

export function trafficStats(db) {
  const since = new Date(Date.now() - ONLINE_MS).toISOString()
  const online = db.prepare('SELECT COUNT(*) n FROM visits WHERE last_seen >= ?').get(since).n
  const total = db.prepare('SELECT COUNT(*) n FROM visits').get().n
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const rows = db.prepare("SELECT substr(last_seen,12,2) hh, COUNT(*) n FROM visits WHERE last_seen >= ? GROUP BY hh").all(today.toISOString())
  return { online, total, byHour: rows }
}

// 봇/헬스체크/정적 제외. 모든 방문자에 익명 쿠키 부여 후 기록.
export function visitTracker(getDb) {
  return (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/') || req.path.startsWith('/data/')) return next()
    let vid = req.cookies?.[COOKIE]
    if (!vid) { vid = randomUUID(); res.cookie(COOKIE, vid, { httpOnly: true, sameSite: 'lax', maxAge: 31536000000 }) }
    try { recordVisit(getDb(), vid) } catch { /* noop */ }
    next()
  }
}
```

주: `req.cookies` 필요 → server.js에 `cookie-parser`가 없으면 세션 쿠키 파싱을 쓰거나 `cookie-parser` 추가. **의존성 추가 여부는 Task 8에서 확인**(있으면 그대로, 없으면 full deploy 대상).

- [ ] **Step 4: 통과 확인** — Run: `node --test backend/test/admin-visits.test.js` · Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): 방문 추적(visits.js) — 익명 쿠키, online(5m)·total"`

---

## Task 7: admin 라우터 (`/api/admin/*`)

**Files:**
- Create: `backend/src/admin/router.js`
- Test: `backend/test/admin.test.js`

- [ ] **Step 1: 실패 테스트** — admin 세션으로 각 엔드포인트 200, 비admin 403.

```js
test('admin endpoints require admin and return data', async () => {
  const { agent, db } = makeApp()
  createUser(db, { username: 'boss', password: 'password1', role: 'admin' })
  createUser(db, { username: 'p1', password: 'password1', status: 'pending' })
  await agent.post('/api/auth/login').send({ username: 'boss', password: 'password1' }).expect(200)
  assert.equal((await agent.get('/api/admin/pending').expect(200)).body.length, 1)
  await agent.get('/api/admin/users').expect(200)
  await agent.get('/api/admin/metrics?range=24h').expect(200)
  await agent.get('/api/admin/traffic').expect(200)
  const pid = (await agent.get('/api/admin/pending')).body[0].id
  await agent.post(`/api/admin/users/${pid}/approve`).expect(200)
  await agent.post('/api/admin/forecasters').send({ username: 'fc1', password: 'password1', displayName: '인천', airports: ['RKSI'] }).expect(201)
})
```

- [ ] **Step 2: 실패 확인** — Run: `node --test backend/test/admin.test.js` · Expected: FAIL

- [ ] **Step 3: router.js 구현**

```js
import { Router } from 'express'
import { getDb } from '../db/index.js'
import { requireRole } from '../auth/middleware.js'
import { createUser, listUsers, listPending, setUserStatus } from '../db/users.js'
import { readMetrics } from './metrics.js'
import { trafficStats } from './visits.js'

export function createAdminRouter({ db = null } = {}) {
  const router = Router()
  const database = () => db || getDb()
  router.use(requireRole('admin'))

  router.get('/metrics', (req, res) => res.json(readMetrics(database(), String(req.query.range || '24h'))))
  router.get('/traffic', (req, res) => res.json(trafficStats(database())))
  router.get('/users', (req, res) => res.json(listUsers(database())))
  router.get('/pending', (req, res) => res.json(listPending(database())))
  router.post('/users/:id/approve', (req, res) => { setUserStatus(database(), Number(req.params.id), 'active'); res.json({ ok: true }) })
  router.post('/users/:id/reject', (req, res) => { setUserStatus(database(), Number(req.params.id), 'rejected'); res.json({ ok: true }) })
  router.post('/forecasters', (req, res) => {
    try {
      const u = createUser(database(), { username: req.body.username, password: req.body.password, role: 'forecaster', displayName: req.body.displayName, airports: req.body.airports, status: 'active' })
      res.status(201).json(u)
    } catch (err) {
      res.status(400).json({ error: err.message })
    }
  })
  return router
}
export default createAdminRouter
```

- [ ] **Step 4: 통과 확인** — Run: `node --test backend/test/admin.test.js` · Expected: PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): /api/admin 라우터(metrics·traffic·users·pending·approve·forecasters)"`

---

## Task 8: server.js 배선

**Files:**
- Modify: `backend/server.js` (import·미들웨어·마운트·샘플러)
- 확인: `backend/package.json`에 `cookie-parser` 존재 여부

- [ ] **Step 1: cookie 파싱 확인** — Run: `node -e "require('cookie-parser')" ` (backend에서). 실패면:
  Run: `npm --prefix backend install cookie-parser` → **이 경우 배포는 full deploy**(Task 12 참고).

- [ ] **Step 2: server.js 수정** — import 추가:

```js
import cookieParser from 'cookie-parser'
import { createAdminRouter } from './src/admin/router.js'
import { visitTracker } from './src/admin/visits.js'
import { startSampler } from './src/admin/metrics.js'
import { getDb } from './src/db/index.js'
```
`app.use(express.json(...))` 부근에 `app.use(cookieParser())`. 정적 서빙 앞에 `app.use(visitTracker(getDb))`. 라우터 마운트부에 `app.use('/api/admin', createAdminRouter())`. 서버 listen 직후 `startSampler(getDb())`.

- [ ] **Step 3: 스모크** — Run: `npm --prefix backend run dev`(또는 test 스크립트). `curl -s localhost:3001/api/admin/metrics` → 401(비로그인). admin 로그인 세션이면 200. (수동 확인 or admin.test.js가 커버.)

- [ ] **Step 4: 전체 백엔드 테스트** — Run: `npm --prefix backend test` · Expected: 전부 PASS

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): server.js 배선 — cookieParser·visitTracker·admin 라우터·샘플러"`

---

## Task 9: 프론트 adminApi + 페이지 뼈대

**Files:**
- Create: `frontend/src/features/admin/adminApi.js`
- Create: `frontend/src/features/admin/AdminPage.jsx`
- Create: `frontend/src/features/admin/AdminPage.css`
- 참고 패턴: `frontend/src/features/monitoring/MonitoringPage.jsx`(페이지), `frontend/src/features/auth/AuthModal.jsx`(fetch·credentials)

- [ ] **Step 1: adminApi.js** — 모든 요청 `credentials: 'include'`. 함수: `getMetrics(range)`, `getTraffic()`, `getUsers()`, `getPending()`, `approve(id)`, `reject(id)`, `createForecaster(body)`. (기존 api fetch 헬퍼가 있으면 재사용.)

```js
const base = '/api/admin'
const j = (r) => { if (!r.ok) throw new Error(String(r.status)); return r.json() }
export const getMetrics = (range) => fetch(`${base}/metrics?range=${range}`, { credentials: 'include' }).then(j)
export const getTraffic = () => fetch(`${base}/traffic`, { credentials: 'include' }).then(j)
export const getUsers = () => fetch(`${base}/users`, { credentials: 'include' }).then(j)
export const getPending = () => fetch(`${base}/pending`, { credentials: 'include' }).then(j)
export const approve = (id) => fetch(`${base}/users/${id}/approve`, { method: 'POST', credentials: 'include' }).then(j)
export const reject = (id) => fetch(`${base}/users/${id}/reject`, { method: 'POST', credentials: 'include' }).then(j)
export const createForecaster = (body) => fetch(`${base}/forecasters`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(j)
```

- [ ] **Step 2: AdminPage.jsx 뼈대** — `MonitoringPage.jsx` 구조를 따른다. `useState`+`useEffect`로 metrics/traffic/users/pending 로드, 5초 폴링(`setInterval`, cleanup). 목업 v3 레이아웃대로 섹션 배치: ①시스템 리소스(ResourceTimeline + 현재값 + 1h/24h/7d 토글) ②트래픽·가입승인 2열 ③사용자 표(우상단 "예보관 추가" 버튼). 색·토큰은 `docs/design/design-language.md`(accent `#334155`, level green/amber/red).
  - 임계 색 함수: `pct<70?'#166534':pct<90?'#92400e':'#c0291f'`.
  - 승인/거절 버튼 → `approve(id)`/`reject(id)` 후 목록 갱신.

- [ ] **Step 3: 스모크(빌드)** — Run: `npx esbuild frontend/src/features/admin/AdminPage.jsx --loader:.jsx=jsx --bundle=false >/dev/null && echo OK` · Expected: OK

- [ ] **Step 4: Commit** — `git commit -m "feat(admin-ui): adminApi + AdminPage 뼈대(대시보드·승인·사용자표)"`

---

## Task 10: ResourceTimeline (SVG 차트) + CreateForecasterDialog

**Files:**
- Create: `frontend/src/features/admin/ResourceTimeline.jsx`
- Create: `frontend/src/features/admin/CreateForecasterDialog.jsx`

- [ ] **Step 1: ResourceTimeline.jsx** — props: `series`(metrics rows), `peakCpu`. 인라인 SVG로 CPU·mem%·disk% 3선(각 `mem_used/mem_total`, `disk_used/disk_total` → %). x=시간, y=%(0~100 역스케일). 피크 점+라벨(`피크 {cpu}% · {hh:mm}`). 목업 v3의 SVG를 데이터 바인딩으로. 빈 데이터면 "데이터 수집 중" 표시.

- [ ] **Step 2: CreateForecasterDialog.jsx** — Fluent Dialog(기존 모달 패턴, 예: `SettingsModal.jsx`/`AuthModal.jsx` 참고). 필드: 아이디·비번·표시이름·담당공항(다중 토글, 국내 7공항 — 기존 `forecaster-airports.js`의 집합과 동일). 제출 → `createForecaster(body)`, 성공 시 사용자 목록 갱신·닫기, 에러 표시(username_taken 등 한글 매핑).

- [ ] **Step 3: 빌드 스모크** — Run: `npx esbuild frontend/src/features/admin/ResourceTimeline.jsx frontend/src/features/admin/CreateForecasterDialog.jsx --loader:.jsx=jsx --bundle=false >/dev/null && echo OK` · Expected: OK

- [ ] **Step 4: Commit** — `git commit -m "feat(admin-ui): ResourceTimeline SVG 차트 + 예보관 생성 다이얼로그"`

---

## Task 11: 라우팅/진입 (admin 전용) + 로그인 안내

**Files:**
- Modify: `frontend/src/app/App.jsx`(라우팅/화면 전환), `frontend/src/app/layout/Sidebar.jsx`(admin 메뉴)
- Modify: `frontend/src/features/auth/AuthModal.jsx`(로그인 403 안내)

- [ ] **Step 1: 진입** — 앱의 화면 전환 방식(App.jsx가 라우터인지 상태기반인지 먼저 확인)에 맞춰 `/admin`(또는 admin 뷰) 추가. **admin 역할만** 노출: 현재 로그인 유저 role이 admin일 때만 Sidebar에 "관리자" 항목 표시 + AdminPage 렌더. 비admin이 강제 진입해도 백엔드가 403이므로 빈 상태/안내.

- [ ] **Step 2: 로그인 안내** — AuthModal 로그인 처리에서 403 응답의 `error`가 `pending_approval`이면 "가입 승인 대기 중입니다", `account_rejected`면 "가입이 거절되었습니다" 문구 표시.

- [ ] **Step 3: 브라우저 검증(Playwright)** — `docs/dev-server-and-capture.md` 절차로 서버 기동 후, admin 계정 로그인 → 관리자 진입 → 대시보드/승인/예보관 다이얼로그 스크린샷. (admin 계정은 `USERNAME=.. PASSWORD=.. ROLE=admin node backend/src/db/create-user.js`로 생성.)

- [ ] **Step 4: Commit** — `git commit -m "feat(admin-ui): admin 전용 진입 + 로그인 승인대기 안내"`

---

## Task 12: 최종 검증 + 배포

- [ ] **Step 1: 전체 테스트** — Run: `npm --prefix backend test` · Expected: 전부 PASS
- [ ] **Step 2: 프론트 빌드** — Run: `npm --prefix frontend run build` · Expected: 성공
- [ ] **Step 3: Push** — `git push origin main`
- [ ] **Step 4: 배포** — `docs/aws-ec2-manual-deploy.md`. `cookie-parser`를 새로 설치했으면(Task 8) **full deploy**(`bash deploy/deploy-vm-full.sh`), 아니면 fast(`bash deploy/deploy-vm.sh`). 서버에서 `SESSION_SECRET` 확인. admin 계정 없으면 `create-user.js`로 생성.
- [ ] **Step 5: 배포 후 확인** — `/api/health` 200, admin 로그인 → `/admin` 동작, 지표·승인 표출.

---

## 배포 주의

- **DB 마이그레이션**: 운영 DB는 `startup 시 ensureColumns`가 자동 적용(기존 사용자 = active). 별도 수동 마이그레이션 불필요.
- **의존성**: `cookie-parser` 추가 시 full deploy. metrics의 `df`는 리눅스 서버에서 정상(Windows dev에선 0으로 무해).
- terrain 타일과 무관(이 기능은 DB만).
