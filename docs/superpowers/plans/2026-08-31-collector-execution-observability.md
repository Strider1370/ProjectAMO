# Collector Execution Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모든 활성 수집기의 마지막 실행 상태와 미실행을 관리자 콘솔에 표시하고, PM2 로그가 제한된 공간 안에서 원인 추적을 지원하게 한다.

**Architecture:** `backend/src/collector-registry.js`가 정기 수집기, 산출물, cron, 시간대, 건강도 메타데이터의 단일 등록부다. 실행 상태는 기존 `stats/latest.json` 안에서 수집기별 고정 크기 `execution` 객체로 보관하고, `backend/src/collector-execution.js`는 등록부를 소비해 watchdog 판정만 소유한다. `index.js`는 등록부와 type→processor binding을 검증해 cron 등록과 `runWithLock` 기록을 연결하며, 기존 `/api/admin/data-health`는 자료 건강도와 별도로 `collectorExecution` 목록을 내려준다.

**Tech Stack:** Node.js 22 ESM, node-cron 3, Express, React 19, node:test, Playwright, PM2/pm2-logrotate, Bash.

## Global Constraints

- 모든 시각은 저장·비교 시 UTC ISO 또는 epoch milliseconds를 사용하고, 화면 표시는 `TimeZoneProvider`의 선택 timezone을 명시적으로 전달한 formatter로 한다. UTC와 KST를 모두 시험한다.
- 자료 건강도 `ok/late/stopped/never/quiet/disabled`의 의미와 마지막 정상 스냅샷 보존 계약은 변경하지 않는다.
- 실행 outcome은 `succeeded`, `failed`, `skipped`, `missed`만 사용한다. `saved:false`는 `succeeded`이며 전역 `degraded`는 만들지 않는다.
- `last_outcome`은 현재 상태이고 `last_issue`는 최근 이상 사건이다. 복구된 과거 오류를 현재 장애로 표시하지 않는다.
- 정규 cron, 시작 초기 수집, 수동 수집은 각각 `scheduled`, `startup`, `manual` 출처로 기록한다. watchdog는 `last_scheduled_started_at`만 정규 실행 증거로 사용한다.
- 새 정기 수집기나 자료 제품은 등록부에 한 번 선언한다. `index.js`의 cron 호출, `stats.js`의 고정 type 목록, 자료 건강도 카탈로그, 관리자 목록에 별도 수동 항목을 추가하지 않는다.
- 새 SQLite 테이블, 실행별 장기 이력, 원본 API 응답, 인증키, 긴 스택 전문을 저장하거나 반환하지 않는다.
- 시작 상태 파일 쓰기는 최대 30초에 한 번으로 묶고, 기존 완료·실패 통계 저장 동작은 유지한다.
- PM2 stdout/stderr는 10M 또는 자정 회전, gzip 압축, 회전본 7개 보관을 적용한다.
- 브라우저 작업은 관리자 계약을 등록하고 Playwright 증거·axe·전후 캡처·read-only UI review로 검증한다.

---

## File Structure

- Create: `backend/src/collector-registry.js` — 정기 수집기·산출물·cron·시간대·health 메타데이터의 단일 등록부를 소유한다.
- Create: `backend/src/collector-execution.js` — 등록부를 소비한 상태 정규화, 미실행 판정과 watchdog lifecycle만 소유한다.
- Modify: `backend/src/stats.js` — 등록부 확인형 동적 type 생성, 수집기별 `execution` 상태의 초기화·기록·최대 30초 시작 저장 debounce를 소유한다.
- Modify: `backend/src/admin/data-health-catalog.js` — 등록부의 제품 메타데이터에서 기존 자료 건강도 카탈로그를 파생한다.
- Modify: `backend/src/index.js` — 모든 정규 cron을 등록부 기반 helper로 등록하고 `runWithLock` 시작/종료 기록과 짧은 로그를 연결한다.
- Modify: `backend/src/admin/data-health.js`, `backend/src/admin/router.js` — 기존 자료 건강도 응답에 활성 수집기 실행 목록을 추가한다.
- Modify: `frontend/src/app/App.jsx`, `frontend/src/features/admin/AdminShell.jsx`, `frontend/src/features/admin/lib/collectorExecution.js` (create), `adminTime.js` (create), `menus.js`, `DataCollectionScreen.jsx`, `OverviewScreen.jsx` — 선택된 표시 시간대와 실행 상태의 순수 분류·표시를 담당한다.
- Modify: `frontend/verification/contracts/admin-console.spec.mjs`, `docs/policies/verification/contracts.md` — 관리자 콘솔의 브라우저 계약을 등록하고 실행 문제 표시를 검증한다.
- Create: `deploy/configure-pm2-logrotate.sh` — `ec2-user`의 PM2에 회전을 idempotent하게 설치·설정·검증한다.
- Modify: `deploy/deploy-vm.sh`, `deploy/deploy-vm-full.sh`, `docs/operations/aws-ec2-manual-deploy.md` — 모든 배포 경로에서 로그 회전 설정과 검증을 보장한다.
- Create (ignored evidence): `artifacts/responsive-screenshots/collector-execution-observability/<timestamp>/{before,after}/manifest.md` and `review/issues.md` — 관리자 UI 변경 전후 상태와 read-only UI review 결론을 남긴다.

## Task 1: Single collector and product registry

**Files:**

- Create: `backend/src/collector-registry.js`
- Modify: `backend/src/admin/data-health-catalog.js`
- Modify: `backend/src/stats.js`
- Create: `backend/test/collector-registry.test.js`
- Modify: `backend/test/data-health-catalog.test.js`
- Modify: `backend/test/stats.test.js`

**Interfaces:**

- Produces `COLLECTOR_REGISTRY`, `activeCollectorRegistry(config)`, `collectorByType(type)`, and `assertCollectorRegistry({ activeCollectors, processorBindings })` from `collector-registry.js`.
- `COLLECTOR_REGISTRY` entry owns `{ type, binding, label, schedule(config), enabled(config), products }`; `activeCollectorRegistry(config)` resolves `schedule(config)` to `{ expression, cronOptions, maxIntervalMs, graceMs, quiet }` before returning an active entry. A documented on-demand entry has `schedule: null` and is excluded from cron/watchdog registration.
- Each `products` item owns `{ key, label, source, character, normalMs, lateMs, stoppedMs, meta, eventDriven, quiet, disabledWhen }`; `buildDataHealthCatalog()` derives the existing catalog rows from these product declarations.
- `stats.js` lazily creates a type entry for every registered collector instead of silently dropping an unknown type.

- [ ] **Step 1: Write failing registry parity tests**

Create `backend/test/collector-registry.test.js`:

```js
test('active registry owns every scheduled collector and its data products', () => {
  const active = activeCollectorRegistry(enabledConfig)
  assert.ok(active.some((entry) => entry.type === 'ground_forecast'))
  assert.deepEqual(buildDataHealthCatalog().map((row) => row.key), CATALOG.map((row) => row.key))
})

test('missing processor binding and unknown binding are startup errors', () => {
  assert.throws(() => assertCollectorRegistry({ activeCollectors: [collectorByType('ground_forecast')], processorBindings: {} }), /ground_forecast.*binding/)
  assert.throws(() => assertCollectorRegistry({ activeCollectors: [], processorBindings: { orphan: async () => ({}) } }), /orphan.*registry/)
})

test('stats records a declared collector type without a hand-maintained TYPES entry', () => {
  stats.recordStart('ground_forecast', { source: 'scheduled' })
  assert.ok(stats.getExecutionState('ground_forecast').last_scheduled_started_at)
})
```

- [ ] **Step 2: Run registry tests and verify failure**

Run: `npm --prefix backend test -- backend/test/collector-registry.test.js backend/test/data-health-catalog.test.js backend/test/stats.test.js`

Expected: FAIL because no registry exists and stats silently ignores unlisted types.

- [ ] **Step 3: Create the canonical registry and derive catalog rows**

Move the existing regular cron expressions/timezones from `index.js` and the 33 data-health product declarations from `data-health-catalog.js` into `COLLECTOR_REGISTRY`. Preserve every existing value, including KST/UTC options, optional radar/satellite enablement, quiet windows, `statsKey`-equivalent collector relationships, source, character, and freshness thresholds.

Represent one-to-many production explicitly, for example the satellite collector owns both satellite and convective products:

```js
{
  type: 'satellite', binding: 'satellite', label: '위성',
  schedule: (cfg) => ({ expression: cfg.schedule.satellite_interval, cronOptions: undefined, maxIntervalMs: m(10), graceMs: m(10) }),
  enabled: (cfg) => Boolean(cfg.api?.radar_satellite_auth_key),
  products: [
    { key: 'satellite', label: '위성', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/sat_meta.json' },
    { key: 'convective', label: '대류 CI·CTPS', source: 'kma_radar', character: 'observation', normalMs: m(10), lateMs: m(30), stoppedMs: h(1), meta: 'satellite/convective/convective_meta.json', disabledWhen: (cfg) => cfg.satellite?.convective_enabled === false },
  ],
}
```

Keep `SOURCES`, `CHARACTERS`, and pure grouping helpers in `data-health-catalog.js`, but replace its handwritten `CATALOG` array with `buildDataHealthCatalog(COLLECTOR_REGISTRY)`. Do not put processor functions in the registry; `index.js` owns the type→processor binding map.

- [ ] **Step 4: Make stats type creation registry-safe**

Replace the early-return behavior for an unknown stats type with `ensureType(type)`, which creates `makeTypeEntry()` only after `collectorByType(type)` confirms the type is registered. Preserve explicit on-demand exceptions only through a documented registry entry with `schedule: null`. Throw for an unregistered type rather than silently dropping telemetry.

- [ ] **Step 5: Run registry and catalog regression tests**

Run: `npm --prefix backend test -- backend/test/collector-registry.test.js backend/test/data-health-catalog.test.js backend/test/admin-data-health.test.js backend/test/stats.test.js`

Expected: PASS. The catalog remains 33 products until a deliberately declared new product is added, and every active scheduled collector has exactly one registry entry.

- [ ] **Step 6: Commit the registry foundation**

```bash
git add backend/src/collector-registry.js backend/src/admin/data-health-catalog.js backend/src/stats.js backend/test/collector-registry.test.js backend/test/data-health-catalog.test.js backend/test/stats.test.js
git commit -m "refactor: centralize collector and product registration"
```

## Task 2: Bounded execution state and pure watchdog

**Files:**

- Create: `backend/src/collector-execution.js`
- Modify: `backend/src/stats.js`
- Create: `backend/test/collector-execution.test.js`
- Create: `backend/test/stats-execution.test.js`

**Interfaces:**

- Produces `recordStart(type, { source })`, `recordSuccess(type, result, durationMs)`, `recordFailure(type, errorMsg, durationMs)`, `recordSkip(type, reason)`, `recordMissed(type, issue)`, `getExecutionState(type)`, and test-only `__setPersistenceForTest({ now, write })` from `stats.js`.
- Consumes `activeCollectorRegistry(config)` from Task 1.
- Produces `buildCollectorExecution({ collectors, statsTypes, nowMs })`, `checkContractAt(collector, execution, nowMs, bootedAtMs)`, and `createExecutionWatchdog({ collectors, getStats, recordMissed, now, bootedAtMs })` from `collector-execution.js`.
- Produces `normalizeCollectorIssue({ outcome, code, message, at })`, shared by stats persistence, API output, and PM2 logging.
- `buildCollectorExecution` returns `{ type, outcome, lastStartedAt, lastFinishedAt, lastIssue, isProblem }[]`; `isProblem` is true only for current `failed` and `missed` outcomes. `skipped` remains a visible status but does not raise the high-priority alert count.

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
  const writes = []
  const clock = createFakeClock('2026-08-31T00:00:00.000Z')
  stats.__setPersistenceForTest({ now: clock.now, write: () => writes.push(clock.now()) })
  for (let n = 0; n < 20; n += 1) stats.recordStart('metar', { source: 'scheduled' })
  assert.equal(writes.length, 0)
  clock.advance(30_000)
  assert.equal(writes.length, 1)
  stats.recordSuccess('metar', { saved: true }, 15)
  assert.equal(writes.length, 2)
})

test('issue normalization removes credentials and line breaks before persistence', () => {
  const issue = normalizeCollectorIssue({ outcome: 'failed', at: '2026-08-31T00:00:00.000Z', code: 'collector_failed', message: 'GET /x?authKey=secret\nAuthorization: Bearer abcdef' })
  assert.equal(issue.message.includes('secret'), false)
  assert.equal(issue.message.includes('abcdef'), false)
  assert.equal(issue.message.includes('\n'), false)
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
  last_scheduled_started_at: null,
  last_finished_at: null,
  last_outcome: null,
  last_issue: null,
  last_missed_at: null,
}
```

Implement the following behavior:

```js
recordStart(type, { source }) // always set last_started_at; set last_scheduled_started_at only for source='scheduled'; queue one save no more than once per 30_000 ms
recordSuccess(type, result, durationMs) // set finished/outcome=succeeded; retain last_issue
recordFailure(type, errorMsg, durationMs) // outcome=failed; last_issue=normalizeCollectorIssue({ outcome:'failed', at, code:'collector_failed', message:errorMsg })
recordSkip(type, reason) // outcome=skipped; last_issue=normalizeCollectorIssue({ outcome:'skipped', at, code:reason, message:null })
recordMissed(type, issue) // outcome=missed; update last_missed_at and last_issue once per unresolved outage
getExecutionState(type) // return execution or the null-filled shape
```

`normalizeCollectorIssue` must remove line breaks, cap the message at 240 characters, and replace URL query strings, `authKey`/`serviceKey` assignments, and bearer-token-like values with `[redacted]` before any persistence, API response, or log output. Keep `last_error`, `recent_runs`, success/failure counters, and their existing public behavior intact. Make the save timer injectable only through a small exported test hook or a factory; do not expose production mutation endpoints.

- [ ] **Step 4: Write failing pure monitor tests**

Create `backend/test/collector-execution.test.js` for the time rules without node-cron or real timers.

```js
test('watchdog records one missed incident after the grace threshold', () => {
  const calls = []
  const recordMissed = (...args) => calls.push(args)
  const watchdog = createExecutionWatchdog({
    collectors: [{ type: 'ground_forecast', schedule: { maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000 } }],
    getStats: () => ({ types: { ground_forecast: { execution: { last_scheduled_started_at: '2026-08-31T02:30:00.000Z', last_outcome: 'succeeded' } } }),
    recordMissed,
    bootedAtMs: Date.parse('2026-08-31T02:00:00.000Z'),
  })
  watchdog.check(Date.parse('2026-08-31T06:06:00.000Z'))
  watchdog.check(Date.parse('2026-08-31T06:07:00.000Z'))
  assert.equal(calls.length, 1)
})

test('startup and manual starts do not reset the scheduled-start watchdog evidence', () => {
  const execution = { last_scheduled_started_at: '2026-08-31T02:30:00.000Z', last_started_at: '2026-08-31T05:00:00.000Z' }
  const result = checkContractAt({ type: 'ground_forecast', schedule: { maxIntervalMs: 3 * 3600_000, graceMs: 35 * 60_000 } }, execution, Date.parse('2026-08-31T06:06:00.000Z'), Date.parse('2026-08-31T02:00:00.000Z'))
  assert.equal(result.outcome, 'missed')
})

test('never-started active collector becomes missed after boot interval plus grace', () => {
  const result = checkContractAt({ type: 'environment', schedule: { maxIntervalMs: 3600_000, graceMs: 10 * 60_000 } }, {}, Date.parse('2026-08-31T01:11:00.000Z'), Date.parse('2026-08-31T00:00:00.000Z'))
  assert.equal(result.outcome, 'missed')
})

test('quiet and disabled registry entries do not create a missed incident', () => {
  assert.equal(checkContractAt({ type: 'terminal_flights', schedule: { quiet: { fromHourKst: 0, toHourKst: 4 }, maxIntervalMs: 60_000, graceMs: 60_000 } }, {}, Date.parse('2026-08-31T17:00:00.000Z'), 0), null)
  assert.deepEqual(activeCollectorRegistry({ api: { radar_satellite_auth_key: '' } }).map((c) => c.type).includes('satellite'), false)
})
```

- [ ] **Step 5: Implement registry-backed watchdog module**

In `backend/src/collector-execution.js`, consume the Task 1 registry entries for every active regular collector, including optional radar/satellite jobs and KST quiet windows. Use each entry's `schedule` object; do not parse cron text at runtime or duplicate its expression/timezone in this module or `index.js`.

Implement the pure decision boundary:

```js
export function buildCollectorExecution({ collectors, statsTypes, nowMs }) {
  return collectors.map((collector) => {
    const execution = statsTypes[collector.type]?.execution ?? EMPTY_EXECUTION
    return {
      type: collector.type,
      outcome: execution.last_outcome ?? 'unknown',
      lastStartedAt: execution.last_started_at,
      lastFinishedAt: execution.last_finished_at,
      lastIssue: execution.last_issue,
      isProblem: execution.last_outcome === 'failed' || execution.last_outcome === 'missed',
    }
  })
}
```

`createExecutionWatchdog().check(nowMs)` must compare UTC epochs, use `last_scheduled_started_at` (or `bootedAtMs` when null), ignore the process boot grace period and a registry entry's explicit quiet window, call `recordMissed` only when current execution is not already the same unresolved `missed`, and return newly missed types for logging. `start()` owns exactly one 60-second interval and `stop()` clears it for tests/shutdown.

- [ ] **Step 6: Run backend state and monitor tests**

Run: `npm --prefix backend test -- backend/test/stats-execution.test.js backend/test/collector-execution.test.js backend/test/stats.test.js backend/test/stats-last-success.test.js`

Expected: PASS. Confirm old `last_success`, counters, and recent-run assertions still pass.

- [ ] **Step 7: Commit the bounded state layer**

```bash
git add backend/src/stats.js backend/src/collector-execution.js backend/test/stats-execution.test.js backend/test/collector-execution.test.js
git commit -m "feat: track bounded collector execution state"
```

## Task 3: Registry-backed scheduler registration and concise server logs

**Files:**

- Modify: `backend/src/index.js`
- Modify: `backend/test/kim-scheduler.test.js`
- Modify: `backend/test/collection-quiesce.test.js`
- Create: `backend/test/collector-scheduler.test.js`

**Interfaces:**

- Consumes `activeCollectorRegistry`, `assertCollectorRegistry`, `createExecutionWatchdog`, and stats recording functions from Tasks 1–2.
- Produces exported `registerCollectorSchedules({ scheduler, config, runWithLock, processorBindings })`, which consumes each active registry entry's own expression and timezone exactly once and returns its scheduled type set.
- Extends `runWithLock(type, job, { source, apiHubCategories, isBlocked, stats: recorder = stats, logger = console })` only with injected recorder/logger seams for tests; production callers continue to use the module defaults.
- Produces a testable `startCollectorWatchdog()` and returns/stores its stop handle for controlled process shutdown tests.

- [ ] **Step 1: Write failing registration and logging tests**

Create `backend/test/collector-scheduler.test.js` with a fake scheduler that records every `schedule(expression, callback, options)` call.

```js
test('every active collector is registered exactly once with its declared expression and timezone', () => {
  const scheduled = registerCollectorSchedules({ scheduler, config: enabledConfig, runWithLock, processorBindings })
  const collectors = activeCollectorRegistry(enabledConfig)
  assert.deepEqual([...scheduled].sort(), collectors.map((c) => c.type).sort())
  assert.deepEqual(scheduler.calls.map((call) => [call.expression, call.options]), collectors.map((c) => [c.schedule.expression, c.schedule.cronOptions]))
})

test('disabled radar collectors are neither scheduled nor monitored', () => {
  const scheduled = registerCollectorSchedules({ scheduler, config: { ...enabledConfig, api: { radar_satellite_auth_key: '' } }, runWithLock, processorBindings })
  assert.equal(scheduled.has('satellite'), false)
  assert.equal(scheduler.calls.some((call) => call.type === 'satellite'), false)
})

test('runWithLock records a start before a key-blocked or lock-held skip', async () => {
  const calls = []
  await runWithLock('ground_forecast', async () => ({ saved: true }), { source: 'scheduled', apiHubCategories: ['aviation'], isBlocked: () => true, stats: { recordStart: () => calls.push('start'), recordSkip: () => calls.push('skip') } })
  assert.deepEqual(calls, ['start', 'skip'])
})

test('successful collector log is one line and never serializes the processor result object', async () => {
  const lines = []
  await runWithLock('ground_forecast', async () => ({ saved: true, rawResponse: 'do-not-log' }), { source: 'scheduled', logger: { info: (line) => lines.push(line) } })
  assert.equal(lines.length, 1)
  assert.match(lines[0], /outcome=succeeded/)
  assert.equal(lines[0].includes('rawResponse'), false)
})
```

- [ ] **Step 2: Run scheduler tests and verify failure**

Run: `npm --prefix backend test -- backend/test/collector-scheduler.test.js`

Expected: FAIL because `registerCollectorSchedules` and the registry-backed scheduler helper do not exist.

- [ ] **Step 3: Refactor cron registration through one helper**

In `backend/src/index.js`, add a local helper whose only job is to consume a known active registry entry and call the supplied scheduler:

```js
function scheduleCollector({ scheduler = cron, collector, job, runOptions }) {
  scheduledTypes.add(collector.type)
  return scheduler.schedule(
    collector.schedule.expression,
    () => runWithLock(collector.type, job, { ...runOptions, source: 'scheduled' }),
    collector.schedule.cronOptions,
  )
}
```

Implement and export `registerCollectorSchedules({ scheduler = cron, config: activeConfig = config, runWithLock: runner = runWithLock, processorBindings })`. It selects `activeCollectorRegistry(activeConfig)`, calls `assertCollectorRegistry({ activeCollectors, processorBindings })`, passes each registry entry to `scheduleCollector`, and binds its processor job from the entry's `binding` key. Move the special KIM, airport, radar graphics, echo-top, and satellite helper registrations behind this function so their expression/timezone come from the registry, not a second local constant. After registration, assert that the active-registry set equals the scheduled-type set; throw a descriptive startup error listing missing or unexpected types.

- [ ] **Step 4: Wire lifecycle recording and watchdog**

At the first line of `runWithLock`, call `stats.recordStart(type, { source })` before API-key and in-flight-lock checks. Scheduled callbacks pass `source: 'scheduled'`; `buildInitialCollectionJobs()` passes `source: 'startup'`; explicit one-shot/manual callers pass `source: 'manual'`. Keep `recordSkip`, `recordSuccess`, and `recordFailure` as the terminal-state calls.

After all normal cron jobs register in `main()`, create and start one watchdog:

```js
const collectorWatchdog = createExecutionWatchdog({
  collectors: activeCollectorRegistry(config),
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

Pass all issue details through Task 2's `normalizeCollectorIssue` before logging. Never log processor response objects, request URLs, headers, API keys, or stack traces.

- [ ] **Step 6: Run focused scheduler regression tests**

Run: `npm --prefix backend test -- backend/test/collector-scheduler.test.js backend/test/kim-scheduler.test.js backend/test/collection-quiesce.test.js`

Expected: PASS. Confirm existing KIM UTC and airport/KST scheduler option tests remain unchanged.

- [ ] **Step 7: Commit scheduler wiring**

```bash
git add backend/src/index.js backend/test/collector-scheduler.test.js backend/test/kim-scheduler.test.js backend/test/collection-quiesce.test.js
git commit -m "feat: detect missed collector executions"
```

## Task 4: Expose complete execution status through the existing admin API

**Files:**

- Modify: `backend/src/admin/data-health.js`
- Modify: `backend/src/admin/router.js`
- Modify: `backend/src/admin/data-health-catalog.js`
- Modify: `backend/test/admin-data-health.test.js`
- Modify: `backend/test/admin.test.js`
- Modify: `backend/test/data-health-catalog.test.js`

**Interfaces:**

- Consumes `buildCollectorExecution` from Task 2 and `activeCollectorRegistry`/derived `CATALOG` from Task 1.
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

In `admin/router.js`, pass a closure that builds only active registry entries from the live config and current stats. `readDataHealth` must consume the registry-derived catalog, not a second handwritten output list. Do not add a route, database table, query parameter, or non-admin bypass.

- [ ] **Step 4: Run admin API regression suite**

Run: `npm --prefix backend test -- backend/test/admin-data-health.test.js backend/test/admin.test.js backend/test/data-health-catalog.test.js backend/test/collector-registry.test.js`

Expected: PASS. Confirm catalog row count and legacy `counts` assertions are unchanged.

- [ ] **Step 5: Commit admin API extension**

```bash
git add backend/src/admin/data-health.js backend/src/admin/router.js backend/src/admin/data-health-catalog.js backend/test/admin-data-health.test.js backend/test/admin.test.js backend/test/data-health-catalog.test.js
git commit -m "feat: expose collector execution status to admins"
```

## Task 5: Show execution problems in the administrator console

**Files:**

- Create: `frontend/src/features/admin/lib/collectorExecution.js`
- Create: `frontend/src/features/admin/lib/collectorExecution.test.js`
- Create: `frontend/src/features/admin/lib/adminTime.js`
- Create: `frontend/src/features/admin/lib/adminTime.test.js`
- Modify: `frontend/src/app/App.jsx`
- Modify: `frontend/src/features/admin/AdminShell.jsx`
- Modify: `frontend/src/features/admin/lib/menus.js`
- Modify: `frontend/src/features/admin/lib/menus.test.js`
- Modify: `frontend/src/features/admin/screens/DataCollectionScreen.jsx`
- Modify: `frontend/src/features/admin/screens/OverviewScreen.jsx`
- Modify: `frontend/verification/contracts/admin-console.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`

**Interfaces:**

- Consumes `health.collectorExecution` from Task 4; callers treat missing data as an empty array during rolling deployment.
- Produces `executionProblems(entries)` and `executionSummary(entries)` from `collectorExecution.js`; `executionSummary` returns the supplied active-registry order unchanged.
- Produces `formatAdminExecutionTime(iso, tz)` from `adminTime.js`; it passes `tz` to `Intl.DateTimeFormat` and returns `—` for invalid input.
- `executionProblems` returns current `failed` and `missed` entries in registry order. `skipped` and recovered entries remain visible in the full execution-status table but do not raise the high-priority count.

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

test('skipped and recovered outcomes remain in the status list without raising an alert', () => {
  const entries = [{ type: 'taf', outcome: 'skipped' }, { type: 'metar', outcome: 'succeeded', lastIssue: { outcome: 'failed' } }]
  assert.deepEqual(executionSummary(entries).map((entry) => entry.type), ['taf', 'metar'])
  assert.deepEqual(executionProblems(entries), [])
})
```

Add `adminTime.test.js` assertions that `formatAdminExecutionTime('2026-08-31T02:30:00.000Z', 'Asia/Seoul')` includes `11:30` and the same input with `UTC` includes `02:30`. Extend `menus.test.js` so the existing `수집` signal keeps its warning tone, reports the number of current `failed`/`missed` entries, is green after recovery, and preserves the existing four-signal shape.

- [ ] **Step 2: Run frontend logic tests and verify failure**

Run: `npm --prefix frontend test -- src/features/admin/lib/collectorExecution.test.js src/features/admin/lib/adminTime.test.js src/features/admin/lib/menus.test.js`

Expected: FAIL because the execution helper and collector-aware signal logic do not exist.

- [ ] **Step 3: Implement pure execution presentation helpers and top signal**

Create `collectorExecution.js` with a Korean label map:

```js
export const EXECUTION_WORD = {
  succeeded: '성공', failed: '실패', skipped: '건너뜀', missed: '미실행', unknown: '기록 없음',
}

export function executionProblems(entries = []) {
  return entries.filter((entry) => entry?.outcome === 'missed' || entry?.outcome === 'failed')
    .slice()
}
```

Wrap the `/admin` route in the existing `TimeZoneProvider` in `App.jsx`. In `AdminShell.jsx`, read `const { tz } = useTimeZone()` and pass `tz` to the overview and data-collection screens. Implement `formatAdminExecutionTime` with `Intl.DateTimeFormat('ko-KR', { timeZone: tz, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })`. Update `topSignals` and `menuBadges` to use `executionProblems` while retaining all current stale-data counts and menu behavior when `collectorExecution` is absent.

- [ ] **Step 4: Implement compact, accessible UI**

Before editing UI, capture the existing desktop administrator overview and data screen into `artifacts/responsive-screenshots/collector-execution-observability/<timestamp>/before/`, write a manifest naming viewport, route, login fixture, and source commit, and record the pre-edit issue statement in `review/issues.md`. Dispatch a read-only UI reviewer to evaluate hierarchy, color meaning, scanability, and accessibility against `docs/policies/design/design-language.md`.

In `DataCollectionScreen.jsx`, add a section before the existing data table containing both a high-priority problem list and a compact full status table:

```jsx
<section className="ac-sec ac-flush" aria-labelledby="collector-execution-heading">
  <h2 id="collector-execution-heading">수집 실행 문제 <em>{problems.length}건</em></h2>
  <p>{problems.length ? '실패 또는 미실행 수집기를 확인하세요.' : '현재 실패 또는 미실행 수집기가 없습니다.'}</p>
</section>
```

The full execution table must show every active collector in registry order with type, textual outcome, last start, last finish, and either current issue code/message or (for recovered `succeeded`) only the `lastIssue.at` timestamp. This makes `skipped` visible without treating normal recovery as active failure. Use `formatAdminExecutionTime(iso, tz)` for every new timestamp. Keep the 33-row data table, its existing filters, and its `lastError` column unchanged. In `OverviewScreen.jsx`, include the same high-priority execution-problem entries in a clearly labeled compact section without replacing stale-data attention items. Reuse existing CSS tokens and semantic status classes; do not introduce new hard-coded colors, sizes, or interaction patterns.

- [ ] **Step 5: Add the administrator browser contract case**

In `admin-console.spec.mjs`, intercept only `**/api/admin/data-health` before navigation in a new test and return an otherwise valid payload with registry-order entries for `succeeded`, `failed`, `skipped`, `missed`, and a recovered `succeeded` entry containing `lastIssue.at`. Use role/text selectors scoped to the execution section; do not use CSS paths or positional rows.

```js
await expect(page.getByRole('heading', { name: /수집 실행 문제/ })).toBeVisible()
await expect(page.getByText('ground_forecast', { exact: true })).toBeVisible()
await expect(page.getByText('미실행', { exact: true })).toBeVisible()
await expect(page.getByText('건너뜀', { exact: true })).toBeVisible()
await expect(page.getByText('최근 이상', { exact: true })).toBeVisible()
```

Register `admin-console` in the Active contract table in `docs/policies/verification/contracts.md` with desktop viewport, `verification/admin-fixture.mjs` precondition, and `admin-console.spec.mjs` owner. Do not alter unrelated contracts.

- [ ] **Step 6: Run frontend unit and focused browser checks**

Run:

```bash
npm --prefix frontend test -- src/features/admin/lib/collectorExecution.test.js src/features/admin/lib/adminTime.test.js src/features/admin/lib/menus.test.js
npm run dev:contract -- --grep "관리자 콘솔"
```

After implementation, capture the same states into `artifacts/responsive-screenshots/collector-execution-observability/<timestamp>/after/`, update the manifest and issues review with resolved/unresolved items, run axe in the administrator contract, and obtain a second read-only UI review. Expected: all frontend tests pass; Playwright and screenshots prove textual normal, failed, skipped, missed, and recovered execution states are visible to an authenticated administrator without color-only meaning.

- [ ] **Step 7: Commit the administrator UI**

```bash
git add frontend/src/features/admin frontend/verification/contracts/admin-console.spec.mjs docs/policies/verification/contracts.md
git commit -m "feat: show collector execution problems in admin"
```

## Task 6: Make PM2 log rotation reproducible and verify the production bound

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

## Task 7: Full verification and production acceptance

**Files:**

- Create: `docs/superpowers/status/2026-08-31-collector-execution-observability.md`

**Interfaces:**

- Consumes the completed code and deployment helper from Tasks 1–6.
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

Expected: health is `ok:true`; PM2 app is online; rotation configuration matches Task 6; the authorized data-health response contains `collectorExecution` with active collector types and no credential fields.

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
