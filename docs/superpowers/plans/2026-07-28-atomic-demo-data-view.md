# Atomic Demo Data View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bulk snapshot restore with a Linux-atomic active-data pointer so demo start and stop immediately switch every weather reader, effective time, route hazard check, and briefing between immutable historical data and continuously collected live data.

**Architecture:** Keep the existing `DATA_PATH` as the live writer and operational-state root to avoid moving production data. Add `DATA_PATH/.active-data`, an atomic symlink that points to `.` for live or to a prepared demo view made of per-dataset symlinks. A deep `data-view` module owns pointer validation, mode/time derivation, serialization, and view revision; the store separates live publication cache from active reader cache.

**Tech Stack:** Node.js 22 ESM, synchronous POSIX filesystem operations for the sub-millisecond critical section, Express, React, nginx, Node test runner, Playwright.

## Global Constraints

- Linux only; the atomic contract relies on same-filesystem symlink creation plus `rename`.
- Existing `DATA_PATH` contents and the stored July 22 snapshot must not be copied or moved during migration.
- Collectors continue writing only to live `DATA_PATH` while demo is active.
- Demo-owned data never silently falls back to live; only explicitly listed pass-through data (`typhoon`, `terrain`) stays live.
- Demo start and stop perform no upstream request, collector drain, live backup, or bulk data copy.
- Runtime database, stats, process health, and snapshot storage stay outside the active weather view.
- The active pointer is the durable source of truth after a process restart.
- Route exposure and preflight briefing must consume the same active SIGMET and effective time.

---

### Task 1: Atomic Data View Module

**Files:**
- Create: `backend/src/dev/data-view.js`
- Test: `backend/test/data-view.test.js`
- Modify: `backend/src/config.js`

**Interfaces:**
- Produces: `ensureActiveDataView()`, `getActiveDataContext()`, `activateDemoView(name)`, `activateLiveView()`, and `isLiveViewActive()`.
- `getActiveDataContext()` returns `{ mode, name, root, referenceTime, revision }`.
- `activateDemoView(name)` validates the snapshot and builds a view whose snapshot directories are symlinked read-only while `typhoon` and `terrain` explicitly point to live directories.

- [ ] **Step 1: Write failing filesystem tests**

```js
test('activateDemoView atomically selects snapshot data and live passthrough data', () => {
  const context = activateDemoView('demo')
  assert.equal(context.mode, 'demo')
  assert.equal(fs.realpathSync(path.join(activePath, 'metar')), snapshotMetar)
  assert.equal(fs.realpathSync(path.join(activePath, 'typhoon')), liveTyphoon)
})
```

- [ ] **Step 2: Run the focused test and verify missing-module failure**

Run: `npm test --prefix backend -- --test-name-pattern="activateDemoView"`
Expected: FAIL because `backend/src/dev/data-view.js` does not exist.

- [ ] **Step 3: Implement the minimal atomic pointer module**

```js
const next = `${activePath}.next-${process.pid}`
fs.symlinkSync(relativeTarget, next, 'dir')
fs.renameSync(next, activePath)
```

Validate snapshot names, keep all resolved targets under the live or snapshot roots, derive demo time from `meta.json`, and serialize transitions with an in-process lock.

- [ ] **Step 4: Run the focused tests**

Run: `npm test --prefix backend -- --test-name-pattern="data view|activateDemoView"`
Expected: PASS.

### Task 2: Split Live Publication from Active Reading

**Files:**
- Modify: `backend/src/store.js`
- Modify: `backend/src/index.js`
- Modify: `backend/src/processors/adsb-processor.js`
- Test: `backend/test/store-data-view.test.js`
- Test: `backend/test/collection-demo-mode.test.js`

**Interfaces:**
- Consumes: `isLiveViewActive()` and `config.storage.active_path`.
- Produces: `initActiveFromFiles(root)` while preserving `save(type, data)` as a live-only publisher and `getCached(type)` as the active reader interface.

- [ ] **Step 1: Write failing cache isolation tests**

```js
test('live publication cannot replace active demo cache', () => {
  initActiveFromFiles(demoRoot)
  save('sigmet', liveSigmet)
  assert.deepEqual(getCached('sigmet'), demoSigmet)
})
```

- [ ] **Step 2: Verify the tests fail against the shared cache**

Run: `npm test --prefix backend -- --test-name-pattern="active demo cache"`
Expected: FAIL because `save()` currently updates the only cache.

- [ ] **Step 3: Add separate live and active caches**

Use the live cache for change detection and partial-collection merge. Update the active cache after publication only when the live view is active. Clear absent active types during a view reload so a missing historical type cannot leak from the prior live cache.

- [ ] **Step 4: Keep collectors running during demo**

Remove the demo-mode early return from scheduled collectors and ADS-B publication. Use the live root for ADS-B freshness while continuing to serve ADS-B from the active root.

- [ ] **Step 5: Run focused store and scheduler tests**

Run: `npm test --prefix backend -- --test-name-pattern="active demo cache|demo collection|ADS-B"`
Expected: PASS.

### Task 3: Replace Demo Restore with View Activation

**Files:**
- Modify: `backend/src/dev/demo-session.js`
- Modify: `backend/src/dev/demo-mode.js`
- Modify: `backend/src/admin/router.js`
- Modify: `backend/test/demo-session.test.js`
- Modify: `backend/test/admin.test.js`

**Interfaces:**
- Consumes: data-view activation functions and `store.initActiveFromFiles`.
- Produces: the existing admin HTTP interface with `revision`, without `_live_backup`, collector draining, or snapshot restore.

- [ ] **Step 1: Rewrite session tests around activation**

```js
assert.deepEqual(calls, ['activate-demo:demo', 'reload-active'])
assert.deepEqual(stopCalls, ['activate-live', 'reload-active'])
```

Assert idempotent repeated start/stop and transition conflict rejection.

- [ ] **Step 2: Run session tests and observe restore-era failures**

Run: `npm test --prefix backend -- --test-name-pattern="demo session"`
Expected: FAIL because the session still drains, captures, and restores.

- [ ] **Step 3: Implement path-only session transitions**

`startDemo` inspects the snapshot, activates its view, reloads active cache, and returns the context. `stopDemo` activates live and reloads active cache. Snapshot capture may still quiesce collectors because capture consistency is separate from switching.

- [ ] **Step 4: Derive mode and effective time from the active view**

Remove `.demo-mode-state.json` as a second source of truth. Keep the public `isDemoMode()` and `getEffectiveNow()` compatibility functions as adapters over `getActiveDataContext()`.

- [ ] **Step 5: Run session and admin tests**

Run: `npm test --prefix backend -- --test-name-pattern="demo session|admin snapshot"`
Expected: PASS.

### Task 4: Route Every Consumer through Active Data

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/src/alerts/scheduler.js`
- Modify: `backend/src/admin/router.js`
- Test: `backend/test/demo-data-view-integration.test.js`
- Test: `backend/test/snapshot-meta-cache.test.js`

**Interfaces:**
- Consumes: `config.storage.active_path`, active cache, and data-view context.
- Produces: `/api/demo-mode` and `/api/snapshot-meta` responses containing the same `viewRevision`.

- [ ] **Step 1: Write integration tests**

Start from live, activate a demo fixture, and assert `/api/sigmet`, `/api/briefing/route-exposure`, `/api/route-briefing`, KIM index, and radar metadata all read the demo root. Publish a live SIGMET during demo and assert those responses remain historical. Stop demo and assert the live SIGMET appears without a fetch.

- [ ] **Step 2: Verify at least one route or briefing assertion fails**

Run: `npm test --prefix backend -- --test-name-pattern="atomic demo data view integration"`
Expected: FAIL while `server.js` still binds `DATA_ROOT` to the live root.

- [ ] **Step 3: Move user-facing filesystem reads to `active_path`**

Keep DB, stats, disk health, snapshots, collector writers, and process-health writes on `base_path`. Move weather APIs, KIM/KTG, generated `/data`, route cross-section, route exposure, and briefing data roots to `active_path`.

- [ ] **Step 4: Add view revision to snapshot metadata**

Include `viewRevision` in `/api/snapshot-meta`; invalidate its backend memo immediately on a pointer change through the cache key. Frontend snapshot comparison treats a revision change as a change to every weather source.

- [ ] **Step 5: Run integration and snapshot tests**

Run: `npm test --prefix backend -- --test-name-pattern="atomic demo data view integration|snapshot meta"`
Expected: PASS.

### Task 5: Frontend and nginx Transition Contract

**Files:**
- Modify: `frontend/src/app/snapshotMeta.js`
- Modify: `frontend/src/app/snapshotMeta.test.js`
- Modify: `frontend/src/features/admin/DemoModePanel.jsx`
- Modify: `deploy/nginx/projectamo.conf.example`
- Test: `frontend/verification/contracts/demo-data-view.spec.mjs`

**Interfaces:**
- Consumes: `viewRevision`.
- Produces: all-source refetch after a view change and nginx static reads through `.active-data`.

- [ ] **Step 1: Write a failing snapshot comparison test**

```js
assert.ok(Object.values(detectSnapshotChanges(
  { viewRevision: 'live:1' },
  { viewRevision: 'demo:demo:2' },
)).every(Boolean))
```

- [ ] **Step 2: Implement revision-wide invalidation**

When revisions differ, return `true` for every key emitted by `detectSnapshotChanges`. Update admin copy to describe an immediate pointer switch and live collection continuing in the background.

- [ ] **Step 3: Point every nginx `/data/` alias at `.active-data`**

Use `/opt/projectamo/shared/data/.active-data/` for generic and regex locations. Keep the admin control endpoint under `/api/`; the operation is now short enough that no long proxy timeout is required.

- [ ] **Step 4: Run frontend unit tests**

Run: `npm test --prefix frontend -- --run`
Expected: PASS.

### Task 6: Migration, Full Verification, and Documentation

**Files:**
- Create: `scripts/verify-demo-data-view.mjs`
- Modify: `Architecture.md`
- Modify: `docs/operations/operations.md`

**Interfaces:**
- Consumes: public/admin demo endpoints and the existing `demo` snapshot.
- Produces: a repeatable local verification report and an operations-safe deployment sequence.

- [ ] **Step 1: Add the verification script**

The script records live hashes, activates `demo`, checks July 22 effective time, 36 radar frames and referenced files, known SIGMET route intersection, route briefing inclusion, live publication isolation, restart recovery, and instant live return.

- [ ] **Step 2: Run all backend and frontend tests**

Run: `npm test`
Expected: all tests pass with only documented skips.

- [ ] **Step 3: Run the real local test instance and browser contract**

Run: `npm run dev:test`
Run: `npm run dev:contract -- demo-data-view.spec.mjs`
Expected: the browser shows demo mode, the historical SIGMET in route risk and briefing, then returns to live without waiting for collection.

- [ ] **Step 4: Refresh the architecture graph**

Run: `graphify update .`
Expected: successful AST graph update.

- [ ] **Step 5: Document the production migration without deploying**

Document creating `.active-data -> .`, changing nginx aliases, validating config, restarting PM2, and running the same verification script. Production execution remains gated on explicit user approval after local evidence.
