# Transactional Demo Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make demo mode an atomic operational switch that freezes every supported clock and collector, restores the immediately preceding live dataset without upstream calls, and refuses or clearly reports incomplete snapshots.

**Architecture:** Add a deep `demo-session` module as the single seam used by the admin router. It coordinates the existing demo clock, scheduler locks, snapshot store, and in-memory cache behind `captureSnapshot`, `startDemo`, `stopDemo`, and `inspectSnapshot`; snapshot publication/restoration becomes staged and replacement-safe. Frontend and backend consumers receive the same effective clock, while on-demand ADS-B and background publishers obey the same frozen-state invariant.

**Tech Stack:** Node.js 22 ESM, Express, React 19, Node test runner, filesystem-backed runtime data, PM2/nginx on EC2.

## Global Constraints

- Linux commands only; use `npm`, `node`, `bash`, and the EC2 runtime path `/opt/projectamo/shared/data`.
- Preserve the existing named `demo` snapshot and the user's unrelated `.claude/settings.local.json` change.
- Use UTC/epoch instants internally and pass the display timezone only to formatters.
- Newer top-level data types absent from an old snapshot remain live; snapshot-owned types are restored exactly.
- Demo stop must restore the captured pre-demo files without any upstream collection call.
- Do not claim completion without backend tests, frontend tests, graph refresh, and live browser/API evidence.

---

## File Structure

- `backend/src/dev/demo-session.js` — the deep module that owns transition ordering, rollback, and status.
- `backend/src/dev/snapshot-store.js` — staged snapshot capture/restore, live-backup lifecycle, and snapshot inspection.
- `backend/src/dev/demo-mode.js` — persisted frozen clock/state only.
- `backend/src/index.js` — pause/drain interface over scheduler locks.
- `backend/src/admin/router.js` — thin HTTP adapter over `demo-session`.
- `backend/src/processors/adsb-processor.js` — publication guard for the on-demand collector.
- `backend/server.js` — effective-clock injection for KIM indexes and route calculations.
- `frontend/src/shared/demoMode/useDemoMode.js` — browser adapter for the authoritative effective clock.
- `frontend/src/features/map/MapView.jsx` and `frontend/src/features/weather-overlays/TimelineRail.jsx` — map/timeline clock consumers.
- `frontend/src/features/route-briefing/useRouteBriefing.js` — demo-time ETD initialization.
- `frontend/src/features/admin/DemoModePanel.jsx` — snapshot readiness and transition result display.
- `backend/test/demo-session.test.js`, `backend/test/snapshot-store.test.js`, and focused frontend tests — interface-level regression coverage.
- `Architecture.md` and `docs/operations/operations.md` — describe the resulting operational reality and recovery contract.

---

### Task 1: Snapshot store safety and inspection

**Files:**
- Modify: `backend/src/dev/snapshot-store.js`
- Create: `backend/test/snapshot-store.test.js`

**Interfaces:**
- Produces: `discardLiveBackup(basePath): boolean`.
- Produces: `inspectSnapshot(basePath, name): { ready, blockers, warnings, referenceTime, types, summaries }`.
- Preserves: `saveSnapshot(basePath, name)` and `loadSnapshot(basePath, name, options)`.

- [ ] **Step 1: Write failing tests**

Cover these exact cases with temporary directories:

```js
test('discardLiveBackup removes only the reserved backup', () => {
  assert.equal(discardLiveBackup(root), true)
  assert.equal(hasLiveBackup(root), false)
  assert.equal(fs.existsSync(path.join(root, 'snapshots', 'demo')), true)
})

test('loadSnapshot atomically replaces owned JSON and full directories', () => {
  const result = loadSnapshot(root, 'demo', { skipBackup: true })
  assert.deepEqual(result.restored.sort(), ['metar', 'radar'])
  assert.equal(read(root, 'metar/latest.json').fetched_at, DEMO_NOW)
  assert.equal(read(root, 'radar/echo_meta.json').frames.length, 2)
  assert.equal(fs.existsSync(path.join(root, 'radar', 'live-only.png')), false)
})

test('inspectSnapshot blocks missing reference time and missing referenced radar frames', () => {
  const report = inspectSnapshot(root, 'demo')
  assert.equal(report.ready, false)
  assert.match(report.blockers.join('\n'), /referenceTime|radar/i)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && node --test test/snapshot-store.test.js`

Expected: fail because `discardLiveBackup` and `inspectSnapshot` do not exist and restore is not staged.

- [ ] **Step 3: Implement staged capture and restore**

Use same-filesystem temporary directories/files and rename publication:

```js
function replaceDirectoryFromSnapshot(srcDir, destDir) {
  const stage = `${destDir}.restore-${process.pid}-${Date.now()}`
  const prior = `${destDir}.prior-${process.pid}-${Date.now()}`
  fs.cpSync(srcDir, stage, { recursive: true })
  if (fs.existsSync(destDir)) fs.renameSync(destDir, prior)
  try {
    fs.renameSync(stage, destDir)
    fs.rmSync(prior, { recursive: true, force: true })
  } catch (error) {
    if (!fs.existsSync(destDir) && fs.existsSync(prior)) fs.renameSync(prior, destDir)
    fs.rmSync(stage, { recursive: true, force: true })
    throw error
  }
}
```

Publish JSON through a sibling temporary file plus `renameSync`. Capture a snapshot into a staging directory and replace the named directory only after every type and `meta.json` have been copied. Validate each radar/satellite metadata path and each KIM/KTG index path in `inspectSnapshot`; report radar frame count/span as a warning when below the configured retention target.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `cd backend && node --test test/snapshot-store.test.js`

Expected: all snapshot-store tests pass.

### Task 2: Transactional demo session and fresh live backup

**Files:**
- Create: `backend/src/dev/demo-session.js`
- Create: `backend/test/demo-session.test.js`
- Modify: `backend/src/index.js`
- Modify: `backend/src/admin/router.js`

**Interfaces:**
- Consumes: `waitForCollectionIdle({ timeoutMs, pollMs })` from the scheduler.
- Produces: `createDemoSession(deps)` with `captureSnapshot(name)`, `startDemo(name)`, `stopDemo()`, and `status()`.
- Invariant: every transition from live to demo discards any stale reserved backup and captures a new one after collectors drain.

- [ ] **Step 1: Write failing session tests**

```js
test('startDemo replaces a stale backup with the immediate live state', async () => {
  const result = await session.startDemo('demo')
  assert.deepEqual(calls, [
    'freeze', 'drain', 'discard-live-backup', 'capture-live-backup',
    'restore-demo', `set-now:${DEMO_NOW}`,
  ])
  assert.equal(result.on, true)
})

test('switching snapshots during one demo session does not replace live backup', async () => {
  await session.startDemo('demo-a')
  await session.startDemo('demo-b')
  assert.equal(calls.filter((call) => call === 'capture-live-backup').length, 1)
})

test('stopDemo restores files before unfreezing and consumes the backup', async () => {
  await session.stopDemo()
  assert.deepEqual(calls, ['drain', 'restore-live-backup', 'unfreeze', 'discard-live-backup'])
})

test('failed restore stays frozen and preserves the live backup', async () => {
  await assert.rejects(session.startDemo('broken'))
  assert.equal(state.on, true)
  assert.equal(state.hasLiveBackup, true)
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `cd backend && node --test test/demo-session.test.js`

Expected: fail because the module does not exist.

- [ ] **Step 3: Add scheduler drain and session implementation**

Export a read-only lock snapshot and an async drain:

```js
export function activeCollectionTypes() {
  return Object.entries(locks).filter(([, active]) => active).map(([type]) => type)
}

export async function waitForCollectionIdle({ timeoutMs = 120_000, pollMs = 100 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (activeCollectionTypes().length) {
    if (Date.now() >= deadline) throw new Error(`collection_drain_timeout:${activeCollectionTypes().join(',')}`)
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }
}
```

`startDemo` sets frozen mode before draining, refreshes `_live_backup` only when entering from live, restores the selected snapshot, applies its reference time, and returns the inspection report. `stopDemo` restores `_live_backup`, reloads the store, disables frozen mode, then removes the consumed backup. Do not unfreeze on a failed restore.

- [ ] **Step 4: Replace router choreography with the session interface**

Make `/snapshot/save`, `/snapshot/load`, and `/demo-mode/revert` async handlers that call only the session interface for transition ordering. Convert known inspection/transition errors to 400/409/503 without exposing paths or stack traces.

- [ ] **Step 5: Run focused backend tests**

Run: `cd backend && node --test test/demo-session.test.js test/snapshot-store.test.js test/admin.test.js`

Expected: pass.

### Task 3: One authoritative effective clock

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/test/kim-server-index.test.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/weather-overlays/TimelineRail.jsx`
- Modify: `frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`
- Modify: `frontend/src/features/route-briefing/useRouteBriefing.js`
- Create: `frontend/src/features/route-briefing/demoTime.test.js`

**Interfaces:**
- Consumes: `getEffectiveNow().getTime()` on the server.
- Consumes: `{ on, nowMs }` from `useDemoMode()` in the browser.
- Produces: `resolveDemoEtd({ currentEtd, demoOn, demoNowMs, previousDemoOn }): string`.

- [ ] **Step 1: Write failing backend and frontend clock tests**

Verify KIM map index filtering around `2026-07-22T10:00:00Z`, TimelineRail domain/“now” placement using injected time, and a one-time ETD reset when demo changes from off to on. Verify subsequent 30-second polls do not overwrite a user-edited ETD.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd backend && node --test test/kim-server-index.test.js
cd ../frontend && node --test src/features/weather-overlays/lib/timelineRailModel.test.js src/features/route-briefing/demoTime.test.js
```

- [ ] **Step 3: Inject the effective clock**

Pass `getEffectiveNow().getTime()` to every KIM index filter/default selection in `backend/server.js`. In `MapView`, retain both `demoMode` and `demoNowMs`, pass `demoNowMs` to TimelineRail and NOTAM adapters, and pass demo state into `useRouteBriefing`. TimelineRail uses an injected finite `nowMs` without starting its real-clock interval.

- [ ] **Step 4: Make route ETD follow demo activation once**

Extract a pure transition helper and apply it from an effect keyed by `demoMode`/`demoNowMs`. The helper changes ETD only on the off→on transition; route exposure and briefing then receive a 7 July 22 ETD rather than the browser's July 28 clock.

- [ ] **Step 5: Run tests and verify GREEN**

Run the commands from Step 2 and expect all pass.

### Task 4: Freeze every publisher, including on-demand ADS-B

**Files:**
- Modify: `backend/src/processors/adsb-processor.js`
- Create: `backend/test/adsb-demo-mode.test.js`
- Verify: `backend/src/processors/radar-echo-processor.js`
- Verify: `backend/src/processors/satellite-processor.js`
- Verify: `backend/src/processors/echo-top-processor.js`
- Verify: `backend/src/alerts/scheduler.js`

**Interfaces:**
- Consumes: `isDemoMode()`.
- Invariant: after `startDemo` returns, no collector may publish into snapshot-owned storage until `stopDemo` has restored live files.

- [ ] **Step 1: Write the failing ADS-B test**

Inject `isDemoMode: () => true` and assert that `process()` returns `{ skipped: true, reason: 'demo_mode' }` without calling the upstream adapter or `store.save`.

- [ ] **Step 2: Run test and verify RED**

Run: `cd backend && node --test test/adsb-demo-mode.test.js`

- [ ] **Step 3: Add the publication guard and audit independent timers**

Guard ADS-B at the processor entry and immediately before publication. Confirm existing radar, satellite, Echo Top, and alert-scheduler timer guards run after asynchronous work; add a pre-publication guard only where a completed in-flight job can still overwrite frozen files.

- [ ] **Step 4: Run processor tests**

Run:

```bash
cd backend
node --test test/adsb-demo-mode.test.js test/radar-echo-motion-publication.test.js test/echo-top-processor.test.js test/alert-scheduler.test.js
```

Expected: pass.

### Task 5: Snapshot readiness in the admin interface

**Files:**
- Modify: `backend/src/admin/router.js`
- Modify: `frontend/src/features/admin/adminApi.js`
- Modify: `frontend/src/features/admin/DemoModePanel.jsx`
- Create: `frontend/src/features/admin/DemoModePanel.test.js`

**Interfaces:**
- Produces: `GET /api/admin/snapshot/:name/inspect`.
- Consumes: `{ ready, blockers, warnings, referenceTime, summaries }`.

- [ ] **Step 1: Write a failing panel/model test**

Verify an incomplete snapshot shows a red “시연 시작 불가” state with exact blockers; warnings show frame counts and time span; a ready snapshot enables one start button.

- [ ] **Step 2: Run and verify RED**

Run: `cd frontend && node --test src/features/admin/DemoModePanel.test.js`

- [ ] **Step 3: Implement readiness display**

Fetch inspection reports with the snapshot list, disable start only for blockers, show `레이더 2/36 프레임 · 5분` and other summaries, and surface transition drain/restore progress from the response. Keep the existing single start/stop mental model.

- [ ] **Step 4: Run and verify GREEN**

Run the test from Step 2 and `npm run build`.

### Task 6: Repair the July 22 demo packet and verify live rollback

**Files:**
- Create: `scripts/rebuild-demo-radar.mjs`
- Modify: `docs/operations/operations.md`
- Modify: `Architecture.md`

**Interfaces:**
- Script consumes: snapshot name, target UTC instant, frame count, and existing server configuration.
- Script produces: a staged radar directory whose metadata references every generated frame before replacing only `snapshots/<name>/radar`.

- [ ] **Step 1: Add dry-run validation**

For `demo`, target `2026-07-22T10:00:00.495Z`, generate the 36 five-minute frame timestamps ending at the nearest prior delayed bucket, fetch one probe, and print the planned UTC/KST span without writing.

- [ ] **Step 2: Add staged historical radar rebuild**

Reuse exported radar rendering helpers rather than duplicating parser/render logic. Write into a server artifact staging directory, validate 36 image paths and monotonic timestamps, then replace the snapshot radar directory while preserving its existing `rainviewer_meta.json`. Do not touch live radar.

- [ ] **Step 3: Run the snapshot inspection gate**

Run:

```bash
node scripts/rebuild-demo-radar.mjs --snapshot demo --target 2026-07-22T10:00:00.495Z --frames 36 --dry-run
node scripts/rebuild-demo-radar.mjs --snapshot demo --target 2026-07-22T10:00:00.495Z --frames 36
```

Expected: `inspectSnapshot(...).ready === true` and radar span is 175 minutes.

- [ ] **Step 4: Update architecture and operations**

Document the `demo-session` seam, the fresh/consumed live-backup invariant, frozen effective clock, snapshot inspection, and the incident recovery rule: prefer the newest retained JSON history for immediate restoration; use upstream collection only for full-directory products whose prior live directory was not captured.

- [ ] **Step 5: Refresh graph and run the complete test set**

Run:

```bash
graphify update .
cd backend && npm test
cd ../frontend && npm test && npm run build
```

- [ ] **Step 6: Deploy and prove both directions on EC2**

Use the repository deployment procedure, then capture:

```bash
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:3001/api/demo-mode
curl http://127.0.0.1:3001/api/snapshot-meta
```

Record hashes/timestamps for live METAR, radar metadata, KIM latest, and KTG latest. Start `demo`, verify the effective clock is July 22, radar exposes 36 frames, KIM index exposes the target forecast window, SIGMET intersects a July 22 ETD route, and hashes remain unchanged across two polling intervals. Stop demo and verify the previously recorded live hashes return immediately before any collector runs; confirm `_live_backup` is consumed.

## Self-Review

- Spec coverage: fresh live backup, no-upstream rollback, full clock propagation, collector freeze, incomplete-snapshot reporting, July 22 radar repair, and EC2 proof each map to a task.
- Placeholder scan: no TBD/TODO/“similar to” placeholders remain.
- Type consistency: `inspectSnapshot`, `discardLiveBackup`, `waitForCollectionIdle`, and the four `demo-session` methods are named consistently across producing and consuming tasks.
