# Isolated Satellite Workers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run every KMA satellite collection in a one-shot Node child process so `h5wasm` and `sharp` working memory is released after each job without restarting the API server.

**Architecture:** `backend/src/index.js` retains cron, API-Hub gating, statistics, locks, and cancellation, but calls a serialized satellite-work queue instead of importing satellite processors. The queue starts one worker at a time. A worker imports exactly one satellite processor, atomically publishes its existing output, sends JSON through IPC, and exits. IR/FOG deferred frames and FOG retries become parent-scheduled fresh workers.

**Tech Stack:** Node.js 22 ESM, `node:child_process` `fork`, IPC, `node:test`, `h5wasm`, `sharp`, PM2 on Linux EC2.

## Global Constraints

- Include IR105/FOG, CI/CTPS, and VI006 visible work. Do not move radar graphics, Echo Top, or other collectors.
- The long-lived backend must not import satellite modules that transitively load `h5wasm` or `sharp`.
- Preserve existing paths, metadata schemas, retention, stale-data behavior, API-Hub gating, and frontend/API contracts; introduce atomic temp-file-and-rename writes for normal satellite WebP and `sat_meta.json` before worker termination is possible.
- Job IPC is only `{ kind, mode, now, frame? }`; credentials stay in the inherited child environment. The sole success envelope is `{ ok: true, result: { result, followUps } }`.
- Serialize all satellite workers: only one HDF5/image child may run on the 2GiB EC2 VM.
- Any worker failure, timeout, cancellation, malformed IPC, or crash preserves last-good data and clears locks/timers.
- Completion requires both fixture-driven failure tests and live EC2 evidence; passing backend tests alone is not sufficient.
- Preserve unrelated dirty worktree changes. Use TDD and run `graphify update .` after implementation.

---

## File Structure

- Create `backend/src/satellite/worker-protocol.js`: job validation and safe terminal IPC messages.
- Create `backend/src/satellite/worker-jobs.js`: worker-only normal/visible product dispatch.
- Create `backend/src/satellite/worker-entry.js`: child IPC entrypoint.
- Create `backend/src/satellite/worker-runner.js`: parent `fork` adapter with timeout and abort cleanup.
- Create `backend/src/satellite/work-queue.js`: serial queue and delayed follow-up scheduler.
- Modify `backend/src/processors/satellite-processor.js`: explicit `current`, `backfill`, and `fog_retry` operations; remove process-lifetime timers.
- Modify `backend/src/processors/satellite-visible-processor.js` only for the common one-shot contract.
- Modify `backend/src/config.js`, `backend/src/index.js`, focused backend tests, operations docs, `Architecture.md`, and the registered browser contract for satellite assets.

### Task 1: Define the satellite worker IPC contract

**Files:**
- Create: `backend/src/satellite/worker-protocol.js`
- Test: `backend/test/satellite-worker-protocol.test.js`

**Interfaces:** `assertSatelliteJob(message)` returns `{ kind, mode, now, frame? }`. Kinds: `satellite`, `satellite_visible`. Satellite modes: `current`, `backfill`, `fog_retry`; visible permits `current` only. `successMessage(work)` returns `{ ok: true, result: { result, followUps } }`; `failureMessage(error)` returns `{ ok: false, error: { name, message } }`.

- [ ] **Step 1: Write the failing test**

```js
test('rejects invalid job before any processor is imported', () => {
  assert.throws(() => assertSatelliteJob({ kind: 'radar', mode: 'current' }), /invalid satellite worker kind/)
})
test('returns JSON-safe terminal messages', () => {
  assert.deepEqual(successMessage({ result: { saved: true }, followUps: [] }), { ok: true, result: { result: { saved: true }, followUps: [] } })
})
```

- [ ] **Step 2: Verify it fails**

Run: `npm test --prefix backend -- satellite-worker-protocol.test.js`

Expected: FAIL because the protocol module does not exist.

- [ ] **Step 3: Implement the minimal contract**

```js
export const SATELLITE_JOB_KINDS = new Set(['satellite', 'satellite_visible'])
export function assertSatelliteJob(message) {
  if (!message || !SATELLITE_JOB_KINDS.has(message.kind)) throw new Error('invalid satellite worker kind')
  if (!Number.isFinite(Date.parse(message.now))) throw new Error('invalid satellite worker time')
  return message
}
```

Validate allowed modes and the complete success envelope; reject Buffers, BigInts, cyclic values, and invalid follow-ups before IPC. Omit stacks, environment, and credentials from failure messages.

- [ ] **Step 4: Verify it passes**

Run: `npm test --prefix backend -- satellite-worker-protocol.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/satellite/worker-protocol.js backend/test/satellite-worker-protocol.test.js && git commit -m "feat: define satellite worker IPC protocol"`

### Task 2: Convert satellite work into one-shot job modes

**Files:**
- Create: `backend/src/satellite/worker-jobs.js`
- Modify: `backend/src/processors/satellite-processor.js`
- Modify: `backend/src/processors/satellite-visible-processor.js`
- Modify: `backend/test/satellite-download-budget.test.js`
- Test: `backend/test/satellite-worker-entry.test.js`

**Interfaces:** `runSatelliteJob({ kind, mode, now, frame, deps })` resolves `{ result, followUps }`. Each follow-up is `{ kind: 'satellite', mode: 'backfill' | 'fog_retry', now, frame?, delayMs }`, with no Buffer, handle, callback, or credential.

- [ ] **Step 1: Write the failing test**

```js
test('current satellite work returns follow-ups instead of retaining timers', async () => {
  const work = await runSatelliteJob({ kind: 'satellite', mode: 'current', now: '2026-08-18T14:10:00.000Z', deps })
  assert.equal(work.result.type, 'satellite')
  assert.ok(work.followUps.every(({ delayMs }) => Number.isInteger(delayMs) && delayMs >= 0))
})
test('visible work shares the contract but has no deferred work', async () => {
  const work = await runSatelliteJob({ kind: 'satellite_visible', mode: 'current', now: '2026-08-18T14:10:00.000Z', deps })
  assert.deepEqual(work.followUps, [])
})
```

- [ ] **Step 2: Verify it fails**

Run: `npm test --prefix backend -- satellite-download-budget.test.js satellite-worker-entry.test.js`

Expected: FAIL because `runSatelliteJob` and explicit modes do not exist.

- [ ] **Step 3: Implement job modes**

Split normal processing into one current-frame operation, one specified historical-frame operation, and one specified FOG retry. Replace `backgroundFillRunning`, `fogRetryTimers`, `scheduleBackgroundFill`, and `scheduleFogRetry` with returned follow-up descriptors. Replace the direct normal WebP and `sat_meta.json` writes with a temp file in the same directory followed by `rename`; publish metadata last. Add a forced write/termination failure test proving the old WebP and parseable old metadata remain. Preserve retention, `needsFogRefetch`, CI/CTPS, product URLs, and VI006 night-frame recording.

- [ ] **Step 4: Verify it passes**

Run: `npm test --prefix backend -- satellite-download-budget.test.js satellite-worker-entry.test.js`

Expected: PASS, including no-repeat VI006 download and bounded FOG retry.

- [ ] **Step 5: Commit**

Run: `git add backend/src/satellite/worker-jobs.js backend/src/processors/satellite-processor.js backend/src/processors/satellite-visible-processor.js backend/test/satellite-download-budget.test.js backend/test/satellite-worker-entry.test.js && git commit -m "refactor: expose one-shot satellite collection jobs"`

### Task 3: Implement the isolated runner

**Files:**
- Create: `backend/src/satellite/worker-entry.js`
- Create: `backend/src/satellite/worker-runner.js`
- Test: `backend/test/satellite-worker-runner.test.js`
- Test: `backend/test/satellite-worker-entry.test.js`

**Interfaces:** `runSatelliteWorker(job, { forkImpl, timeoutMs, signal })` resolves `{ result, followUps }`; it rejects with a named timeout/exit error or the supplied abort reason. `config.satellite.worker_timeout_ms` defaults to exactly `180_000` and is supplied for every production invocation.

- [ ] **Step 1: Write the failing test**

```js
test('resolves only after success IPC and exit 0', async () => {
  const child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, timeoutMs: 100 })
  child.emit('message', successMessage({ result: { saved: true }, followUps: [] }))
  child.emit('exit', 0, null)
  await assert.doesNotReject(run)
})
test('terminates the child on collection abort', async () => {
  const controller = new AbortController(), child = fakeChild()
  const run = runSatelliteWorker(job, { forkImpl: () => child, signal: controller.signal, timeoutMs: 100 })
  controller.abort(new Error('collection_cancelled_for_data_transition'))
  assert.equal(child.killCalls[0], 'SIGTERM')
  await assert.rejects(run, /collection_cancelled_for_data_transition/)
})
```

- [ ] **Step 2: Verify it fails**

Run: `npm test --prefix backend -- satellite-worker-runner.test.js satellite-worker-entry.test.js`

Expected: FAIL because runner and entrypoint do not exist.

- [ ] **Step 3: Implement runner and entrypoint**

Fork with `fork(new URL('./worker-entry.js', import.meta.url), [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })`. Send a validated job only. The entrypoint validates one message, then imports `worker-jobs.js`, sends `successMessage({ result, followUps })` (therefore `{ ok: true, result: { result, followUps } }`), disconnects, and exits. On error it sends the safe error message then exits non-zero.

Require one valid terminal message plus clean exit before resolving. Cover malformed message, invalid JSON-safe payload, error event, non-zero exit, timeout, abort, SIGTERM then SIGKILL grace escalation, cleared timers, IPC disconnect, and listener cleanup. Add a test that the configured production default is finite and that an invocation without a test override times out and cleans up.

- [ ] **Step 4: Verify it passes**

Run: `npm test --prefix backend -- satellite-worker-runner.test.js satellite-worker-entry.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/satellite/worker-entry.js backend/src/satellite/worker-runner.js backend/test/satellite-worker-runner.test.js backend/test/satellite-worker-entry.test.js && git commit -m "feat: run satellite work in child processes"`

### Task 4: Serialize workers and schedule follow-ups

**Files:**
- Create: `backend/src/satellite/work-queue.js`
- Test: `backend/test/satellite-work-queue.test.js`
- Modify: `backend/test/collection-quiesce.test.js`

**Interfaces:** `createSatelliteWorkQueue({ runWorker, setTimeoutImpl, clearTimeoutImpl })` exposes `enqueue(job, { signal })`, `cancel()`, and `whenIdle({ timeoutMs, pollMs })`.

- [ ] **Step 1: Write the failing test**

```js
test('never overlaps normal and visible workers', async () => {
  const starts = [], gates = []
  const queue = createSatelliteWorkQueue({ runWorker: async (job) => {
    starts.push(job.kind); await new Promise((resolve) => gates.push(resolve))
    return { result: { saved: true }, followUps: [] }
  }})
  const normal = queue.enqueue(normalJob), visible = queue.enqueue(visibleJob)
  await waitFor(() => starts.length === 1)
  assert.deepEqual(starts, ['satellite'])
  gates.shift()(); await waitFor(() => starts.length === 2)
  gates.shift()(); await Promise.all([normal, visible])
})
```

Add a quiesce test that cancels a live satellite child and removes a delayed FOG retry before it reports idle.

- [ ] **Step 2: Verify it fails**

Run: `npm test --prefix backend -- satellite-work-queue.test.js collection-quiesce.test.js`

Expected: FAIL because the queue and satellite quiesce integration do not exist.

- [ ] **Step 3: Implement the queue**

Use FIFO pending jobs, an active `AbortController`, and a timer set. Queue returned follow-ups after `delayMs`; deduplicate retries by `(kind, mode, frame.tm)`. `cancel(reason)` rejects every pending `enqueue()` promise with `reason`, clears timers, aborts and awaits the active worker, then permits later enqueues. Test active-plus-pending cancellation and post-quiesce reuse. `whenIdle()` waits for no active child, queued job, or timer. Keep HDF5/image imports out of this module.

- [ ] **Step 4: Verify it passes**

Run: `npm test --prefix backend -- satellite-work-queue.test.js collection-quiesce.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/satellite/work-queue.js backend/test/satellite-work-queue.test.js backend/test/collection-quiesce.test.js && git commit -m "feat: serialize satellite worker jobs"`

### Task 5: Replace in-process scheduler wiring

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/index.js`
- Modify: `backend/test/kim-scheduler.test.js`

**Interfaces:** `runSatelliteCollection(kind, { signal })` queues `{ kind, mode: 'current', now: new Date().toISOString() }` with `config.satellite.worker_timeout_ms`. Collection names remain `satellite` and `satellite_visible`; API-Hub category remains `radar_satellite`. Export `scheduleSatelliteJobs(scheduler, satelliteJob)` for cron injection tests.

- [ ] **Step 1: Write the failing test**

```js
test('initial satellite collection calls the isolated adapter', async () => {
  const satelliteJob = async (kind) => { satelliteJob.calls.push(kind); return { saved: true } }
  satelliteJob.calls = []
  const jobs = buildInitialCollectionJobs({ includeRadarSatellite: true, satelliteJob })
  await jobs.find(([type]) => type === 'satellite')[1]({ signal: new AbortController().signal })
  assert.deepEqual(satelliteJob.calls, ['satellite'])
})
test('both cron entries retain their intervals and call the isolated adapter', () => {
  const calls = [], scheduler = { schedule: (...args) => calls.push(args) }
  scheduleSatelliteJobs(scheduler, fakeSatelliteJob)
  assert.deepEqual(calls.map(([interval]) => interval), [config.schedule.satellite_interval, config.schedule.satellite_visible_interval])
  calls[0][1](); calls[1][1]()
  assert.deepEqual(fakeSatelliteJob.calls, ['satellite', 'satellite_visible'])
})
```

- [ ] **Step 2: Verify it fails**

Run: `npm test --prefix backend -- kim-scheduler.test.js`

Expected: FAIL because startup/cron reference in-process satellite processors.

- [ ] **Step 3: Integrate queue-backed scheduling**

Add `satellite.worker_timeout_ms: 180_000` to configuration. Remove direct satellite processor imports from `index.js`; add a regression assertion that `index.js` has no import of `satellite-processor.js`, `satellite-visible-processor.js`, `h5wasm`, or `sharp`. Construct one queue, route both injectable cron callbacks and startup through `runSatelliteCollection`, and preserve `runWithLock`, intervals, API-Hub gate, names, logs, and stats. Make `abortActiveCollections` cancel the queue and `waitForCollectionIdle` include its `whenIdle` state.

- [ ] **Step 4: Verify it passes**

Run: `npm test --prefix backend -- kim-scheduler.test.js collection-quiesce.test.js satellite-work-queue.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add backend/src/config.js backend/src/index.js backend/test/kim-scheduler.test.js && git commit -m "refactor: isolate scheduled satellite collection"`

### Task 6: Verify operation and update documentation

**Files:**
- Modify: `docs/operations/operations.md`
- Modify: `docs/operations/aws-ec2-manual-deploy.md`
- Modify: `Architecture.md`
- Create: `frontend/verification/contracts/satellite-assets.spec.mjs`
- Modify: `docs/policies/verification/contracts.md`

- [ ] **Step 1: Run the complete backend suite**

Run: `npm test --prefix backend`

Expected: PASS with no test requiring an in-process satellite processor.

- [ ] **Step 2: Run isolated-worker fixture smoke tests**

Invoke both job kinds through `runSatelliteWorker` using network stubs. Assert each child exits, metadata remains readable, a forced failure preserves the old frame, and no worker PID remains after completion.

Add deterministic failure cases that terminate or withhold the test worker at each of these boundaries:

1. while the KMA download promise is pending;
2. after a new normal-satellite WebP temporary file is written but before its rename;
3. after frame files are complete but before `sat_meta.json` is renamed; and
4. after child startup with no terminal IPC message.

For every case, assert that the prior WebP and prior parseable metadata remain
the served version; no partial target filename is visible; the runner rejects
with the correct failure type; the queue settles every pending caller; and no
worker PID, timer, or collection lock remains. Add a concurrent normal plus
visible test that proves the second child starts only after the first has
exited.

- [ ] **Step 3: Update operational documentation**

State that PM2 owns the long-lived API/scheduler while satellite work is per-job children. Add:

```bash
pm2 status projectamo-backend
pgrep -af 'backend/src/satellite/worker-entry.js'
ps -o pid,ppid,rss,etimes,args -C node
curl -fsS http://127.0.0.1:3001/api/snapshot-meta
```

Document that a child is expected only during collection and must be absent afterward; do not present PM2 memory restart as the primary remedy.

- [ ] **Step 4: Deploy and capture evidence**

Use fast/full deployment according to package manifest changes. On EC2, record parent RSS before and after one normal and one visible worker; verify child disappearance, `/api/health`, `/api/snapshot-meta`, and newly published IR/FOG, CI, CTPS, and VI006 metadata/files. Add and register `satellite-assets`, then run `npm run dev:contract -- --grep satellite-assets`; it must load all four published asset families through the browser. Keep output in ignored artifacts.

Run a 24-hour production soak observation after deployment. Capture parent RSS
and the worker process list before the first observed job, during each normal
and visible job, and after each child exit. The observation passes only when:

- `pgrep -af 'backend/src/satellite/worker-entry.js'` is non-empty only while
  a satellite job is running and is empty after that job completes;
- at no capture point are two satellite worker PIDs alive together;
- the PM2 backend PID never restarts during the observation and its RSS has no
  persistent per-job upward staircase after worker exits (record the series,
  rather than judging a single sample);
- `/api/health` and `/api/snapshot-meta` succeed after every observed job;
- each newly published IR/FOG, CI, CTPS, and VI006 asset is readable in the
  browser; and
- no timeout, forced termination, or upstream collection failure replaces a
  last-good frame or metadata document with a partial file.

Capture with the following read-only commands and retain timestamped output in
an ignored artifact directory:

```bash
date -Is
pm2 status projectamo-backend
pgrep -af 'backend/src/satellite/worker-entry.js' || true
ps -o pid,ppid,rss,etimes,args -C node
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/snapshot-meta
```

- [ ] **Step 5: Refresh graph and commit**

Run: `graphify update . && git add docs/operations/operations.md docs/operations/aws-ec2-manual-deploy.md docs/policies/verification/contracts.md Architecture.md frontend/verification/contracts/satellite-assets.spec.mjs graphify-out && git commit -m "docs: document isolated satellite workers"`

## Plan self-review

- Spec coverage: Tasks 1–3 implement isolation and IPC; Task 4 serializes all satellite products plus retry/cancellation; Task 5 preserves scheduler, startup, API-Hub, locks, statistics, and data-view behavior; Task 6 verifies tests, EC2 memory, browser contract, docs, and graph.
- Placeholder scan: no unfinished-marker text; every task names files, interfaces, failing test, command, and expected result.
- Type consistency: scheduler calls `runSatelliteCollection(kind, { signal })`; runner calls `runSatelliteWorker(job, options)`; workers return `{ result, followUps }`; follow-ups use the validated job plus `delayMs`.

## Execution Handoff

The project workflow requires a reviewer check of this plan against the approved design and routed operations policy before implementation. After that approval, execute with **Subagent-Driven** work (recommended) or **Inline Execution** checkpoints.
