# Collector Execution Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 활성 수집기의 마지막 실행 상태와 미실행을 관리자 콘솔에 표시하고, PM2 로그가 제한된 공간 안에서 원인 추적을 지원하게 한다.

**Architecture:** 실행 상태는 기존 `stats/latest.json` 안에서 수집기별 고정 크기 `execution` 객체로 보관한다. `backend/src/collector-execution.js`가 활성 수집기 계약과 watchdog 판정을 소유하고, `index.js`는 이 계약을 소비해 cron 등록과 `runWithLock` 기록을 연결한다. 기존 `/api/admin/data-health`는 자료 건강도와 별도로 `collectorExecution` 목록을 내려주며, UI는 문제 수집기를 별도 목록으로 보인다.

**Tech Stack:** Node.js 22 ESM, node-cron 3, Express, React 19, node:test, Playwright, PM2/pm2-logrotate, Bash.

## Global Constraints

- 모든 시각은 저장·비교 시 UTC ISO 또는 epoch milliseconds를 사용하고, 화면 표시는 기존 한국어 로케일 formatter를 사용한다.
- 자료 건강도 `ok/late/stopped/never/quiet/disabled`의 의미와 마지막 정상 스냅샷 보존 계약은 변경하지 않는다.
- 실행 outcome은 `succeeded`, `failed`, `skipped`, `missed`만 사용한다. `saved:false`는 `succeeded`이며 전역 `degraded`는 만들지 않는다.
- `last_outcome`은 현재 상태이고 `last_issue`는 최근 이상 사건이다. 복구된 과거 오류를 현재 장애로 표시하지 않는다.
- 새 SQLite 테이블, 실행별 장기 이력, 원본 API 응답, 인증키, 긴 스택 전문을 저장하거나 반환하지 않는다.
- 시작 상태 파일 쓰기는 최대 30초에 한 번으로 묶고, 기존 완료·실패 통계 저장 동작은 유지한다.
- PM2 stdout/stderr는 10M 또는 자정 회전, gzip 압축, 회전본 7개 보관을 적용한다.
- 브라우저 작업은 관리자 계약을 등록하고 Playwright 증거로 검증한다.

---

## File Structure

- Create: `backend/src/collector-execution.js` — 활성 수집기 계약, 상태 정규화, 미실행 판정과 watchdog lifecycle만 소유한다.
- Modify: `backend/src/stats.js` — 수집기별 `execution` 상태의 초기화·기록·최대 30초 시작 저장 debounce를 소유한다.
- Modify: `backend/src/index.js` — 모든 정규 cron을 계약 기반 helper로 등록하고 `runWithLock` 시작/종료 기록과 짧은 로그를 연결한다.
- Modify: `backend/src/admin/data-health.js`, `backend/src/admin/router.js` — 기존 자료 건강도 응답에 활성 수집기 실행 목록을 추가한다.
- Modify: `frontend/src/features/admin/lib/collectorExecution.js` (create), `menus.js`, `DataCollectionScreen.jsx`, `OverviewScreen.jsx` — 실행 문제의 순수 분류와 표시를 담당한다.
- Modify: `frontend/verification/contracts/admin-console.spec.mjs`, `docs/policies/verification/contracts.md` — 관리자 콘솔의 브라우저 계약을 등록하고 실행 문제 표시를 검증한다.
- Create: `deploy/configure-pm2-logrotate.sh` — `ec2-user`의 PM2에 회전을 idempotent하게 설치·설정·검증한다.
- Modify: `deploy/deploy-vm.sh`, `deploy/deploy-vm-full.sh`, `docs/operations/aws-ec2-manual-deploy.md` — 모든 배포 경로에서 로그 회전 설정과 검증을 보장한다.

## Task 1: Bounded execution state and pure watchdog

**Files:**

- Create: `backend/src/collector-execution.js`
- Modify: `backend/src/stats.js`
- Create: `backend/test/collector-execution.test.js`
- Create: `backend/test/stats-execution.test.js`

**Interfaces:**

- Produces `recordStart(type)`, `recordSuccess(type, result, durationMs)`, `recordFailure(type, errorMsg, durationMs)`, `recordSkip(type, reason)`, `recordMissed(type, issue)`, and `getExecutionState(type)` from `stats.js`.
- Produces `activeCollectorContracts(config)`, `buildCollectorExecution({ contracts, statsTypes, nowMs })`, and `createExecutionWatchdog({ contracts, getStats, recordMissed, now, bootedAtMs })` from `collector-execution.js`.
- `buildCollectorExecution` returns `{ type, outcome, lastStartedAt, lastFinishedAt, lastIssue, isProblem }[]`; `isProblem` is true only for current `failed` and `missed` outcomes.

- [ ] **Step 1: Write failing stats execution-state tests**

Create `backend/test/stats-execution.test.js` with an isolated temporary stats directory. Exercise the public stats interface rather than mutating module internals.

```js
test('success preserves last issue but clears the current execution problem', () => {
  stats.recordFailure('ground_forecast', 'upstream_timeout', 1200)
  stats.recordStart('ground_forecast')
  stats.recordSuccess('ground_forecast', { saved: false }, 80)

  const execution = stats.getExecutionState('ground_forecast')
  assert.equal(execution.last_outcome, 'succeeded')
  assert.equal(execution.last_issue.code, 'collector_failed')
  assert.equal(execution.last_issue.message, 'upstream_timeout')
  assert.ok(execution.last_started_at)
  assert.ok(execution.last_finished_at)
})

test('start writes are coalesced while completion writes remain durable', () => {
  // Inject a fake timer/writer; 20 starts in 30 seconds must schedule one write.
})
```

- [ ] **Step 2: Run the new stats tests and verify failure**

Run: `npm --prefix backend test -- --test-name-pattern="execution" backend/test/stats-execution.test.js`

Expected: FAIL because `recordStart`, `getExecutionState`, and the injected write scheduling seam do not exist.

- [ ] **Step 3: Add the minimal execution state to `stats.js`**

Extend `makeTypeEntry()` and old-file migration so every known type gets this shape without deleting existing counters:

```js
execution: {
  last_started_at: null,
  last_finished_at: null,
  last_outcome: null,
  last_issue: null,
  last_missed_at: null,
}
```

Implement the following behavior:

```js
recordStart(type) // set last_started_at; queue one save no more than once per 30_000 ms
recordSuccess(type, result, durationMs) // set finished/outcome=succeeded; retain last_issue
recordFailure(type, errorMsg, durationMs) // outcome=failed; last_issue={ outcome:'failed', at, code:'collector_failed', message:errorMsg }
recordSkip(type, reason) // outcome=skipped; last_issue={ outcome:'skipped', at, code:reason, message:null }
recordMissed(type, issue) // outcome=missed; update last_missed_at and last_issue once per unresolved outage
getExecutionState(type) // return execution or the null-filled shape
```

Keep `last_error`, `recent_runs`, success/failure counters, and their existing public behavior intact. Make the save timer injectable only through a small exported test hook or a factory; do not expose production mutation endpoints.

- [ ] **Step 4: Write failing pure monitor tests**

Create `backend/test/collector-execution.test.js` for the time rules without node-cron or real timers.

```js
test('watchdog records one missed incident after the grace threshold', () => {
  const calls = []
  const recordMissed = (...args) => calls.push(args)
  const watchdog = createExecutionWatchdog({
    contracts: [{ type: 'ground_forecast', maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000 }],
    getStats: () => ({ types: { ground_forecast: { execution: { last_started_at: '2026-08-31T02:30:00.000Z', last_outcome: 'succeeded' } } }),
    recordMissed,
    bootedAtMs: Date.parse('2026-08-31T02:00:00.000Z'),
  })
  watchdog.check(Date.parse('2026-08-31T06:06:00.000Z'))
  watchdog.check(Date.parse('2026-08-31T06:07:00.000Z'))
  assert.equal(calls.length, 1)
})

test('a start after a missed incident resolves the current problem')
test('boot grace and configured quiet window do not create a missed incident')
test('disabled optional collector is absent from activeCollectorContracts')
```

- [ ] **Step 5: Implement contract and watchdog module**

In `backend/src/collector-execution.js`, define a single contract list for every `runWithLock` type that has a cron registration, including optional radar/satellite jobs and KST quiet windows. Use explicit `maxIntervalMs` and `graceMs`; do not parse cron text at runtime.

Implement the pure decision boundary:

```js
export function buildCollectorExecution({ contracts, statsTypes, nowMs }) {
  return contracts.map((contract) => {
    const execution = statsTypes[contract.type]?.execution ?? EMPTY_EXECUTION
    return {
      type: contract.type,
      outcome: execution.last_outcome ?? 'unknown',
      lastStartedAt: execution.last_started_at,
      lastFinishedAt: execution.last_finished_at,
      lastIssue: execution.last_issue,
      isProblem: execution.last_outcome === 'failed' || execution.last_outcome === 'missed',
    }
  })
}
```

`createExecutionWatchdog().check(nowMs)` must compare UTC epochs, ignore the process boot grace period, ignore a contract's explicit quiet window, call `recordMissed` only when current execution is not already the same unresolved `missed`, and return newly missed types for logging. `start()` owns exactly one 60-second interval and `stop()` clears it for tests/shutdown.

- [ ] **Step 6: Run backend state and monitor tests**

Run: `npm --prefix backend test -- backend/test/stats-execution.test.js backend/test/collector-execution.test.js backend/test/stats.test.js backend/test/stats-last-success.test.js`

Expected: PASS. Confirm old `last_success`, counters, and recent-run assertions still pass.

- [ ] **Step 7: Commit the bounded state layer**

```bash
git add backend/src/stats.js backend/src/collector-execution.js backend/test/stats-execution.test.js backend/test/collector-execution.test.js
git commit -m "feat: track bounded collector execution state"
```

## Task 2: Contract-backed scheduler registration and concise server logs

**Files:**

- Modify: `backend/src/index.js`
- Modify: `backend/test/kim-scheduler.test.js`
- Modify: `backend/test/collection-quiesce.test.js`
- Create: `backend/test/collector-scheduler.test.js`

**Interfaces:**

- Consumes `activeCollectorContracts`, `createExecutionWatchdog`, and stats recording functions from Task 1.
- Produces `scheduleCollector(type, expression, job, options)` inside `index.js`; each regular cron registration uses it.
- Produces a testable `startCollectorWatchdog()` and returns/stores its stop handle for controlled process shutdown tests.

- [ ] **Step 1: Write failing registration and logging tests**

Create `backend/test/collector-scheduler.test.js` with a fake scheduler that records every `schedule(expression, callback, options)` call.

```js
test('every active collector contract is registered exactly once', () => {
  const scheduled = registerCollectorSchedules({ scheduler, config: enabledConfig, runWithLock })
  assert.deepEqual([...scheduled].sort(), activeCollectorContracts(enabledConfig).map((c) => c.type).sort())
})

test('disabled radar contracts are neither scheduled nor monitored')

test('runWithLock records a start before a key-blocked or lock-held skip')

test('successful collector log is one line and never serializes the processor result object')
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run: `npm --prefix backend test -- backend/test/collector-scheduler.test.js`

Expected: FAIL because `registerCollectorSchedules` and the contract-backed scheduler helper do not exist.

- [ ] **Step 3: Refactor cron registration through one helper**

In `backend/src/index.js`, add a local helper whose only job is to consume a known active contract and call the supplied scheduler:

```js
function scheduleCollector({ scheduler = cron, activeContracts, type, expression, job, runOptions, cronOptions }) {
  if (!activeContracts.has(type)) return null
  scheduledTypes.add(type)
  return scheduler.schedule(expression, () => runWithLock(type, job, runOptions), cronOptions)
}
```

Use it for direct `cron.schedule` calls and pass it into the existing `scheduleKimNwpJob`, `scheduleAirportInfoJob`, `scheduleTakeoffFcstJob`, `scheduleRadarGraphicsJobs`, `scheduleEchoTopJob`, and `scheduleSatelliteJobs` helpers. Preserve each existing timezone object and expression exactly. After registration, assert that the active-contract set equals the scheduled-type set; throw a descriptive startup error listing missing or unexpected types.

- [ ] **Step 4: Wire lifecycle recording and watchdog**

At the first line of `runWithLock`, call `stats.recordStart(type)` before API-key and in-flight-lock checks. Keep `recordSkip`, `recordSuccess`, and `recordFailure` as the terminal-state calls.

After all normal cron jobs register in `main()`, create and start one watchdog:

```js
const collectorWatchdog = createExecutionWatchdog({
  contracts: activeCollectorContracts(config),
  getStats: stats.getStats,
  recordMissed: stats.recordMissed,
  bootedAtMs: Date.now(),
})
collectorWatchdog.start()
```

Do not start it when `DISABLE_COLLECTION` is set. Make it reachable for test cleanup so it cannot leave a real interval open.

- [ ] **Step 5: Replace object dumps with safe one-line logs**

Replace `console.log(..., result)` with a formatter that emits only collector type, outcome, duration, and a boolean `saved` when supplied:

```text
[collector] ground_forecast outcome=succeeded duration_ms=15324 saved=true
[collector] ground_forecast outcome=failed code=collector_failed message="upstream timeout"
[collector] ground_forecast outcome=missed last_started=2026-08-31T02:30:00.000Z threshold_ms=12900000
```

Sanitize line breaks from messages and cap messages at 240 characters. Never log processor response objects, request URLs, headers, API keys, or stack traces.

- [ ] **Step 6: Run focused scheduler regression tests**

Run: `npm --prefix backend test -- backend/test/collector-scheduler.test.js backend/test/kim-scheduler.test.js backend/test/collection-quiesce.test.js`

Expected: PASS. Confirm existing KIM UTC and airport/KST scheduler option tests remain unchanged.

- [ ] **Step 7: Commit scheduler wiring**

```bash
git add backend/src/index.js backend/test/collector-scheduler.test.js backend/test/kim-scheduler.test.js backend/test/collection-quiesce.test.js
git commit -m "feat: detect missed collector executions"
```

## Task 3: Expose complete execution status through the existing admin API

**Files:**

- Modify: `backend/src/admin/data-health.js`
- Modify: `backend/src/admin/router.js`
- Modify: `backend/test/admin-data-health.test.js`
- Modify: `backend/test/admin.test.js`

**Interfaces:**

- Consumes `buildCollectorExecution` and `activeCollectorContracts` from Task 1.
- `readDataHealth()` accepts `getCollectorExecution` and returns `collectorExecution` alongside the unchanged `counts`, `rows`, and `groups` fields.
- `GET /api/admin/data-health` returns the new `collectorExecution` array only to existing admin-authorized callers.

- [ ] **Step 1: Write failing API-shape tests**

Add to `backend/test/admin-data-health.test.js`:

```js
test('execution problems are separate from stale-data rows', () => {
  const health = readDataHealth(base(), {
    getCached: () => null,
    getStats: statsFor({}),
    getCollectorExecution: () => [{
      type: 'ground_forecast', outcome: 'missed', lastStartedAt: '2026-08-31T02:30:00.000Z',
      lastFinishedAt: '2026-08-31T02:30:16.000Z', lastIssue: { outcome: 'missed', at: '2026-08-31T06:05:00.000Z', code: 'start_overdue', message: null }, isProblem: true,
    }],
  })
  assert.equal(health.collectorExecution[0].outcome, 'missed')
  assert.equal(health.rows.find((row) => row.key === 'ground_forecast').status, 'never')
})
```

Add to `backend/test/admin.test.js` an authenticated assertion that `collectorExecution` is an array and never appears in a 401 response.

- [ ] **Step 2: Run API tests and verify failure**

Run: `npm --prefix backend test -- backend/test/admin-data-health.test.js backend/test/admin.test.js`

Expected: FAIL because `readDataHealth` does not accept or return `collectorExecution`.

- [ ] **Step 3: Extend `readDataHealth` without changing data-health semantics**

Add an optional injected dependency with a safe default:

```js
export function readDataHealth(basePath, {
  getCached, getStats, getCollectorExecution = () => [], now = Date.now(), sun = {}, cfg = config,
}) {
  // existing rows/counts/groups stay byte-for-byte compatible in meaning
  return { generatedAt: new Date(now).toISOString(), counts, rows, groups, collectorExecution: getCollectorExecution() }
}
```

In `admin/router.js`, pass a closure that builds only active contracts from the live config and current stats. Do not add a route, database table, query parameter, or non-admin bypass.

- [ ] **Step 4: Run admin API regression suite**

Run: `npm --prefix backend test -- backend/test/admin-data-health.test.js backend/test/admin.test.js backend/test/data-health-catalog.test.js`

Expected: PASS. Confirm catalog row count and legacy `counts` assertions are unchanged.

- [ ] **Step 5: Commit admin API extension**

```bash
git add backend/src/admin/data-health.js backend/src/admin/router.js backend/test/admin-data-health.test.js backend/test/admin.test.js
git commit -m "feat: expose collector execution status to admins"
```

## Task 4: Show execution problems in the administrator console

**Files:**

- Create: `frontend/src/features/admin/lib/collectorExecution.js`
- Create: `frontend/src/features/admin/lib/collectorExecution.test.js`
- Modify: `frontend/src/features/admin/lib/menus.js`
- Modify: `frontend/src/features/admin/lib/menus.test.js`
- Modify: `frontend/src/features/admin/screens/DataCollectionScreen.jsx`
- Modify: `frontend/src/features/admin/screens/OverviewScreen.jsx`
- Modify: `frontend/verification/contracts/admin-console.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**

- Consumes `health.collectorExecution` from Task 3; callers treat missing data as an empty array during rolling deployment.
- Produces `executionProblems(entries)` and `executionSummary(entries)` from `collectorExecution.js`.
- `executionProblems` returns only `failed` and `missed` entries, sorted `missed` before `failed` then type; recovered entries are excluded.

- [ ] **Step 1: Write failing pure frontend tests**

Create `frontend/src/features/admin/lib/collectorExecution.test.js`:

```js
test('only current failed and missed outcomes raise an execution problem', () => {
  const problems = executionProblems([
    { type: 'ground_forecast', outcome: 'missed', isProblem: true },
    { type: 'metar', outcome: 'succeeded', lastIssue: { outcome: 'failed' }, isProblem: false },
    { type: 'taf', outcome: 'skipped', isProblem: false },
  ])
  assert.deepEqual(problems.map((entry) => entry.type), ['ground_forecast'])
})
```

Extend `menus.test.js` so the top `수집` signal is red with the number of `failed`/`missed` entries, is green after recovery, and preserves the existing four-signal shape.

- [ ] **Step 2: Run frontend logic tests and verify failure**

Run: `npm --prefix frontend test -- src/features/admin/lib/collectorExecution.test.js src/features/admin/lib/menus.test.js`

Expected: FAIL because the execution helper and collector-aware signal logic do not exist.

- [ ] **Step 3: Implement pure execution presentation helpers and top signal**

Create `collectorExecution.js` with a Korean label map:

```js
export const EXECUTION_WORD = {
  succeeded: '성공', failed: '실패', skipped: '건너뜀', missed: '미실행', unknown: '기록 없음',
}

export function executionProblems(entries = []) {
  return entries.filter((entry) => entry?.outcome === 'missed' || entry?.outcome === 'failed')
    .slice().sort((a, b) => (a.outcome === 'missed' ? -1 : 1) - (b.outcome === 'missed' ? -1 : 1) || a.type.localeCompare(b.type))
}
```

Update `topSignals` and `menuBadges` to use this helper while retaining all current stale-data counts and menu behavior when `collectorExecution` is absent.

- [ ] **Step 4: Implement compact, accessible UI**

In `DataCollectionScreen.jsx`, add a section before the existing data table:

```jsx
<section className="ac-sec ac-flush" aria-labelledby="collector-execution-heading">
  <h2 id="collector-execution-heading">수집 실행 문제 <em>{problems.length}건</em></h2>
  {/* type, 상태 글자, 마지막 시작/완료, 현재 issue code/message only */}
</section>
```

For an empty problem list, show the existing-style all-clear copy. For a recovered collector, do not put the historical `lastIssue.message` into the problem list. Keep the 33-row data table, its existing filters, and its `lastError` column unchanged. In `OverviewScreen.jsx`, include the same execution-problem entries in the attention area or a clearly labeled compact section, without replacing stale-data attention items.

- [ ] **Step 5: Add the administrator browser contract case**

In `admin-console.spec.mjs`, intercept only `**/api/admin/data-health` before navigation in a new test and return an otherwise valid payload containing a `ground_forecast` execution item with `outcome: 'missed'` and `isProblem: true`. Use role/text selectors scoped to the execution section; do not use CSS paths or positional rows.

```js
await expect(page.getByRole('heading', { name: /수집 실행 문제/ })).toBeVisible()
await expect(page.getByText('ground_forecast', { exact: true })).toBeVisible()
await expect(page.getByText('미실행', { exact: true })).toBeVisible()
```

Register `admin-console` in the Active contract table in `docs/policies/verification/contracts.md` with desktop viewport, `verification/admin-fixture.mjs` precondition, and `admin-console.spec.mjs` owner. Do not alter unrelated contracts.

- [ ] **Step 6: Run frontend unit and focused browser checks**

Run:

```bash
npm --prefix frontend test -- src/features/admin/lib/collectorExecution.test.js src/features/admin/lib/menus.test.js
npm run dev:contract -- --grep "관리자 콘솔"
```

Expected: all frontend tests pass; Playwright proves a textual `미실행` execution problem is visible to an authenticated administrator.

- [ ] **Step 7: Commit the administrator UI**

```bash
git add frontend/src/features/admin frontend/verification/contracts/admin-console.spec.mjs docs/policies/verification/contracts.md
git commit -m "feat: show collector execution problems in admin"
```

## Task 5: Make PM2 log rotation reproducible and verify the production bound

**Files:**

- Create: `deploy/configure-pm2-logrotate.sh`
- Modify: `deploy/deploy-vm.sh`
- Modify: `deploy/deploy-vm-full.sh`
- Modify: `docs/operations/aws-ec2-manual-deploy.md`

**Interfaces:**

- `deploy/configure-pm2-logrotate.sh` is run as the PM2 owner (`ec2-user`) and exits nonzero unless the installed module reports `max_size=10M`, `retain=7`, `compress=true`, and `rotateInterval=0 0 * * *`.
- Both deployment scripts call this helper after restarting `ecosystem.config.cjs` and before their final health checks.

- [ ] **Step 1: Write the deployment helper with idempotent commands**

Create `deploy/configure-pm2-logrotate.sh` using Bash strict mode:

```bash
#!/usr/bin/env bash
set -euo pipefail

pm2 show pm2-logrotate >/dev/null 2>&1 || pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
pm2 set pm2-logrotate:rotateModule true
pm2 save
pm2 conf pm2-logrotate
```

After `pm2 conf`, parse/check each expected key and fail with an explicit mismatch message. Do not run `pm2 flush`: old logs remain intact until rotation has been confirmed.

- [ ] **Step 2: Validate the helper syntax before wiring it**

Run: `bash -n deploy/configure-pm2-logrotate.sh`

Expected: exit 0.

- [ ] **Step 3: Invoke it from both deployment paths**

Immediately after `pm2 restart ecosystem.config.cjs --update-env` in both deploy scripts, invoke:

```bash
bash deploy/configure-pm2-logrotate.sh
```

Keep the existing `pm2 save`, nginx validation, process-option verification, backend health check, and site health check. The helper must not change `NODE_OPTIONS`, data paths, or nginx configuration.

- [ ] **Step 4: Document exact production verification**

Add a PM2 log rotation subsection to `docs/operations/aws-ec2-manual-deploy.md` containing the install/configuration command, `pm2 conf pm2-logrotate`, and this bounded evidence check:

```bash
find ~/.pm2/logs -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
find ~/.pm2/logs -maxdepth 1 -name 'projectamo-backend-*.log.*.gz' -type f | wc -l
```

State that a current file can exceed exactly 10M by up to the module's 30-second check interval, but rotated archives are gzip-compressed and retention is at most seven per log stream.

- [ ] **Step 5: Run shell and documentation checks**

Run:

```bash
bash -n deploy/configure-pm2-logrotate.sh deploy/deploy-vm.sh deploy/deploy-vm-full.sh
rg -n "pm2-logrotate|max_size 10M|retain 7|compress true" deploy docs/operations/aws-ec2-manual-deploy.md
```

Expected: exit 0 and exactly the intended deployment/manual references.

- [ ] **Step 6: Commit deployment safety**

```bash
git add deploy/configure-pm2-logrotate.sh deploy/deploy-vm.sh deploy/deploy-vm-full.sh docs/operations/aws-ec2-manual-deploy.md
git commit -m "ops: rotate PM2 logs within a fixed bound"
```

## Task 6: Full verification and production acceptance

**Files:**

- Modify: `docs/superpowers/status/2026-08-31-collector-execution-observability.md`

**Interfaces:**

- Consumes the completed code and deployment helper from Tasks 1–5.
- Produces a dated status record containing commands, results, deployed revision, the next ground forecast run, and measured PM2 log archive count.

- [ ] **Step 1: Run the complete automated suite**

Run:

```bash
npm --prefix backend test
npm --prefix frontend test
npm run build
npm run dev:contract -- --grep "관리자 콘솔"
```

Expected: all commands exit 0. If any command fails, use `systematic-debugging` before changing implementation; do not continue to deployment on a failing suite.

- [ ] **Step 2: Update the code graph and inspect the final diff**

Run:

```bash
graphify update .
git diff --check main...HEAD
git status --short
```

Expected: no whitespace errors; only the planned files are changed. Preserve the user's unrelated `docs/research/2026-08-27-coast-guard-fixed-wing-pilot-feedback.md` file.

- [ ] **Step 3: Deploy with the appropriate path**

Because this change introduces no application npm dependency, use the fast deploy after its scripts are on `main`:

```bash
ssh -i ~/.ssh/key.pem ec2-user@3.34.113.37 'cd /opt/projectamo/current && bash deploy/deploy-vm.sh'
```

If package manifests changed during implementation, use `bash deploy/deploy-vm-full.sh` instead. Do not manually restart by application name; the deploy scripts must restart `ecosystem.config.cjs --update-env`.

- [ ] **Step 4: Verify the deployed API and state**

Run from the server after deployment:

```bash
curl -fsS http://127.0.0.1:3001/api/health
pm2 status projectamo-backend
pm2 conf pm2-logrotate
curl -fsS -b "<admin session cookie>" http://127.0.0.1:3001/api/admin/data-health
```

Expected: health is `ok:true`; PM2 app is online; rotation configuration matches Task 5; the authorized data-health response contains `collectorExecution` with active collector types and no credential fields.

- [ ] **Step 5: Verify a real scheduled ground forecast run**

At the next configured ground forecast slot, record all three independent observations:

```bash
pm2 logs projectamo-backend --lines 120 --nostream | rg '\[collector\] ground_forecast'
curl -fsS http://127.0.0.1:3001/api/ground-forecast | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);console.log(JSON.stringify({fetched_at:x.fetched_at,base_time:x.hourly_status?.base_time}))})"
curl -fsS -b "<admin session cookie>" http://127.0.0.1:3001/api/admin/data-health | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const x=JSON.parse(s);console.log(x.collectorExecution.find(r=>r.type==='ground_forecast'))})"
```

Expected: the same run has a concise `succeeded` log, a new source `fetched_at`/base time, and `lastStartedAt`/`lastFinishedAt` with `outcome: 'succeeded'` in the admin response.

- [ ] **Step 6: Verify the production log-size bound without deleting logs**

Run:

```bash
du -sh ~/.pm2/logs
find ~/.pm2/logs -maxdepth 1 -type f -printf '%f %s bytes\n' | sort
find ~/.pm2/logs -maxdepth 1 -name 'projectamo-backend-*.log.*.gz' -type f | wc -l
```

Expected: active logs exist, rotated archives are compressed, and each stream has no more than seven retained archives after enough rotations occur. Do not force rotation by generating production log noise and do not flush historical logs without separate user approval.

- [ ] **Step 7: Record acceptance evidence and commit**

Create the status document with UTC/KST timestamps, command exit status, deployed commit, PM2 config, observed next scheduled run, and archive count. Then commit it:

```bash
git add docs/superpowers/status/2026-08-31-collector-execution-observability.md
git commit -m "docs: record collector observability verification"
```
