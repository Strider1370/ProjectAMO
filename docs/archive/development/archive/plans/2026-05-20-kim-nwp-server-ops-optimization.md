# KIM NWP Server Operations Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce KIM NWP backend collection load, disk growth, API CPU work, and frontend-to-backend egress so Wind/Temp/Moisture/Icing layers can run more safely on a low-resource GCP free-tier VM.

**Architecture:** Keep the existing `DATA_PATH/kim_nwp/` canonical store and current React overlay UX. Optimize in narrow layers: production config defaults/docs, collector incremental retry, server-side snapshot/field caching, HTTP compression/cache headers, and frontend request throttling. Do not change KIM science formulas, UI layer semantics, or route vertical-section scope.

**Tech Stack:** Node.js/Express backend, Vite/React frontend, Mapbox image/raster overlays, `node:test`, local JSON file store under `DATA_PATH`.

---

## Operating Assumptions

- Target low-resource environment: GCP Always Free style VM, approximately 1GB RAM and limited shared CPU.
- KIM field URLs with `tmfc`, `hf`, `level`, and product are immutable for practical operations.
- KIM indexes and `/api/snapshot-meta` remain mutable because they track the latest published run.
- Raw KIM text files are debugging artifacts only. Frontend and field APIs read normalized `grid.json`, not `raw/*.txt`.
- Keep all optimizations backward-compatible for local development unless explicitly gated by environment variables.

## Subagent Execution Map

- **Task 1 mapper/reviewer:** read-only `code-mapper` or `architect-reviewer` to verify current config, cron, API cache, and frontend polling paths before edits.
- **Tasks 2-5 implementer:** sequential backend implementation; write sets overlap in `backend/server.js`, `backend/src/index.js`, and KIM processor files.
- **Task 6 implementer:** frontend-only implementation for slider debounce/shared polling.
- **Task 7 reviewer/test-gap:** read-only review for cache correctness, stale data risk, and missing tests.
- Keep implementation mostly sequential. Do not split `backend/server.js` edits across concurrent writers.

## File Structure

- Modify `backend/src/config.js`
  - Add operations-oriented KIM NWP config flags with environment-variable controls.
  - Preserve current local behavior unless production env chooses stricter settings.

- Modify `backend/src/index.js`
  - Gate initial KIM collection during backend startup.
  - Keep cron-based KIM collection unchanged.

- Modify `backend/src/processors/kim-surface-wind-processor.js`
  - Add incremental retry logic so existing complete grid variables are reused.
  - Avoid refetching already-present variables.

- Modify `backend/src/processors/kim-nwp-store.js`
  - Add safe helper(s) to read existing grids and inspect available variables without throwing for missing files.

- Modify `backend/server.js`
  - Add `/api/snapshot-meta` memoization keyed by file mtimes or a short TTL plus mtime invalidation.
  - Add KIM field-specific cache headers and ETag handling.
  - Keep `/api` default `no-store` for mutable weather endpoints.

- Modify `backend/package.json`
  - Add `compression` dependency if Express compression middleware is used.

- Modify `backend/test/kim-surface-wind.test.js`
  - Add incremental retry tests.

- Modify or create `backend/test/kim-server-cache.test.js`
  - Test KIM field cache headers/ETag and snapshot-meta memoization behavior.

- Modify `frontend/src/features/weather-overlays/NwpSliderBar.jsx`
  - Debounce slider field requests by committing selection on pointer/key finalization, or call a helper that delays selection updates.

- Modify `frontend/src/features/weather-overlays/NwpSliderBar.test.js`
  - Add debounce/commit behavior tests.

- Modify KIM hooks:
  - `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js`
  - `frontend/src/features/weather-overlays/lib/useKimTemperature.js`
  - `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js`
  - `frontend/src/features/weather-overlays/lib/useKimIcing.js`
  - Remove duplicate `fetchSnapshotMeta` polling if a shared snapshot source is introduced.

- Optionally create `frontend/src/features/weather-overlays/lib/useKimSnapshotMeta.js`
  - One shared hook or module-level polling store for KIM overlay metadata.

- Update `docs/archive/development/status/kim-icing-potential.status.md`
  - Record implementation milestones and verification results.

---

## Task 1: Baseline Measurements And Production Settings

**Files:**
- Modify: `backend/src/config.js`
- Modify: `docs/archive/development/status/kim-icing-potential.status.md`

- [x] **Step 1: Record current KIM storage baseline**

Run:

```powershell
Get-ChildItem backend\data\kim_nwp -Recurse -File |
  Measure-Object -Property Length -Sum |
  Select-Object Count,Sum
```

Expected: command reports file count and total byte size. Record the result in the status file under a new "Ops Optimization Baseline" bullet.

- [x] **Step 2: Record per-run raw vs normalized size**

Run:

```powershell
$run = Get-ChildItem backend\data\kim_nwp\runs -Directory |
  Sort-Object Name -Descending |
  Select-Object -First 1
foreach ($sub in 'normalized','raw') {
  $path = Join-Path $run.FullName $sub
  $sum = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
  $count = (Get-ChildItem $path -Recurse -File -ErrorAction SilentlyContinue | Measure-Object).Count
  [pscustomobject]@{ Part = $sub; Files = $count; MB = [math]::Round($sum / 1MB, 2) }
}
```

Expected: normalized and raw sizes are printed separately. Use this to verify raw storage is worth disabling in production.

- [x] **Step 3: Add production-facing config flags**

In `backend/src/config.js`, keep existing local defaults but add explicit env controls:

```js
export const kim_nwp = {
  max_runs: Number(process.env.KIM_NWP_MAX_RUNS || 2),
  keep_raw: process.env.KIM_NWP_KEEP_RAW !== '0',
  concurrency: Number(process.env.KIM_NWP_CONCURRENCY || 4),
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  collect_icing: process.env.KIM_NWP_COLLECT_ICING !== '0',
  collect_on_startup: process.env.KIM_NWP_COLLECT_ON_STARTUP !== '0',
  incremental_retry: process.env.KIM_NWP_INCREMENTAL_RETRY !== '0',
  icing_variables: ['w', 'rh_liq', 'tqc', 'tqi', 'tqr', 'tqs', 'cld'],
}
```

- [x] **Step 4: Document recommended free-tier environment values**

Add this exact block to `docs/archive/development/status/kim-icing-potential.status.md` under a new "Free-Tier Runtime Recommendation" section:

```markdown
## Free-Tier Runtime Recommendation
- `KIM_NWP_KEEP_RAW=0`: raw KMA text is debugging-only; normalized `grid.json` serves the app.
- `KIM_NWP_MAX_RUNS=1`: retain only the latest usable KIM run on small disks.
- `KIM_NWP_CONCURRENCY=2`: reduce CPU, disk I/O, and upstream request peaks on shared-core VMs.
- `KIM_NWP_COLLECT_ON_STARTUP=0`: avoid large KIM collection bursts during deploy/restart.
- `KIM_NWP_INCREMENTAL_RETRY=1`: skip already-complete grid variables during retries.
```

- [x] **Step 5: Verify config import**

Run:

```powershell
node --input-type=module -e "import config from './backend/src/config.js'; console.log(JSON.stringify(config.kim_nwp, null, 2))"
```

Expected: JSON includes `collect_on_startup` and `incremental_retry`.

---

## Task 2: Disable KIM Startup Collection When Configured

**Files:**
- Modify: `backend/src/index.js`
- Test: `backend/test/kim-scheduler.test.js` or create a focused backend scheduler test if the existing file lacks startup coverage.

- [x] **Step 1: Write a failing startup collection test**

In `backend/test/kim-scheduler.test.js`, add a test that imports `main` with mocked processors if the existing test harness supports it. If the current module shape makes full `main()` mocking too invasive, extract the startup job list first in Step 3 and test that helper.

Target helper shape:

```js
export function buildInitialCollectionJobs({ includeKimNwp = config.kim_nwp?.collect_on_startup !== false } = {}) {
  const jobs = [
    ['metar', metarProcessor.processAll],
    ['taf', tafProcessor.processAll],
    ['warning', warningProcessor.process],
    ['sigmet', sigmetProcessor.process],
    ['airmet', airmetProcessor.process],
    ['sigwx_low', sigwxLowProcessor.process],
    ['amos', amosProcessor.process],
    ['lightning', lightningProcessor.process],
    ['radar_echo', radarEchoProcessor.process],
    ['adsb', adsbProcessor.process],
    ['satellite', satelliteProcessor.process],
    ['ground_forecast', groundForecastProcessor.process],
    ['environment', environmentProcessor.process],
    ['airport_info', airportInfoProcessor.process],
  ]
  if (includeKimNwp) jobs.splice(10, 0, ['kim_surface_wind', kimSurfaceWindProcessor.process])
  return jobs
}
```

Test expectation:

```js
test('initial collection can omit KIM NWP for low-resource startup', () => {
  assert.equal(
    buildInitialCollectionJobs({ includeKimNwp: false }).some(([type]) => type === 'kim_surface_wind'),
    false,
  )
  assert.equal(
    buildInitialCollectionJobs({ includeKimNwp: true }).some(([type]) => type === 'kim_surface_wind'),
    true,
  )
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test backend/test/kim-scheduler.test.js
```

Expected: FAIL because `buildInitialCollectionJobs` is not exported yet.

- [x] **Step 3: Implement startup job helper**

In `backend/src/index.js`, add `buildInitialCollectionJobs()` near `scheduleKimNwpJob()` and replace the hard-coded `Promise.allSettled([...])` block:

```js
export function buildInitialCollectionJobs({ includeKimNwp = config.kim_nwp?.collect_on_startup !== false } = {}) {
  const jobs = [
    ['metar', metarProcessor.processAll],
    ['taf', tafProcessor.processAll],
    ['warning', warningProcessor.process],
    ['sigmet', sigmetProcessor.process],
    ['airmet', airmetProcessor.process],
    ['sigwx_low', sigwxLowProcessor.process],
    ['amos', amosProcessor.process],
    ['lightning', lightningProcessor.process],
    ['radar_echo', radarEchoProcessor.process],
    ['adsb', adsbProcessor.process],
    ['satellite', satelliteProcessor.process],
    ['ground_forecast', groundForecastProcessor.process],
    ['environment', environmentProcessor.process],
    ['airport_info', airportInfoProcessor.process],
  ]
  if (includeKimNwp) jobs.splice(10, 0, ['kim_surface_wind', kimSurfaceWindProcessor.process])
  return jobs
}
```

Then replace startup collection with:

```js
await Promise.allSettled(
  buildInitialCollectionJobs().map(([type, job]) => runWithLock(type, job)),
)
```

Update default export to include `buildInitialCollectionJobs`.

- [x] **Step 4: Verify scheduler tests**

Run:

```powershell
node --test backend/test/kim-scheduler.test.js
```

Expected: PASS.

---

## Task 3: Incremental KIM Retry

**Files:**
- Modify: `backend/src/processors/kim-nwp-store.js`
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Test: `backend/test/kim-surface-wind.test.js`

- [x] **Step 1: Add safe existing-grid reader test**

In `backend/test/kim-surface-wind.test.js`, add a unit test around the collector helper behavior rather than filesystem internals:

```js
test('collectKimNwpTask reuses existing complete grid when incremental retry is enabled', async () => {
  const level = KIM_NWP_LEVELS.find((entry) => entry.id === '850hPa')
  const task = { level, tmfc: '2026051900', hf: 3 }
  const existingGrid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: task.tmfc,
    hf: task.hf,
    level,
    components: [
      { variable: 'u', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [1, 2, 3, 4] },
      { variable: 'v', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0, 1, 0, 1] },
      { variable: 'T', unit: 'K', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [279, 280, 281, 282] },
      { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [90, 90, 90, 90] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0.1, 0.1, 0.1, 0.1] },
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [90, 90, 90, 90] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [1e-4, 1e-4, 1e-4, 1e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0, 0, 0, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1', level: 850, nx: 2, ny: 2, bounds: BOUNDS_2X2, values: [0.8, 0.8, 0.8, 0.8] },
    ],
  })
  let fetchedWind = false
  const writes = []

  const result = await collectKimNwpTask({
    task,
    readExistingGrid: () => existingGrid,
    incrementalRetry: true,
    fetchWind: async () => {
      fetchedWind = true
      throw new Error('should not fetch complete grid')
    },
    writeGrid: (grid) => writes.push(grid),
  })

  assert.equal(result.grid, existingGrid)
  assert.equal(fetchedWind, false)
  assert.equal(writes.length, 0)
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test backend/test/kim-surface-wind.test.js
```

Expected: FAIL because `collectKimNwpTask` does not accept `readExistingGrid` or `incrementalRetry`.

- [x] **Step 3: Add safe store helper**

In `backend/src/processors/kim-nwp-store.js`, add:

```js
export function readKimNwpGridSafe({ root, model, tmfc, hf, levelId }) {
  try {
    return readKimNwpGrid({ root, model, tmfc, hf, levelId })
  } catch {
    return null
  }
}
```

Add it to the default export.

- [x] **Step 4: Add variable completeness helpers**

In `backend/src/processors/kim-surface-wind-processor.js`, add:

```js
function requiredVariablesForTask(level, { collectIcing = config.kim_nwp?.collect_icing !== false } = {}) {
  const variables = ['u', 'v', 'T']
  if (isKimNwpMoistureLevel(level)) variables.push('rh')
  if (collectIcing && isKimNwpIcingLevel(level)) {
    variables.push(...(config.kim_nwp?.icing_variables || DEFAULT_ICING_VARIABLES))
  }
  return variables
}

function hasGridVariables(grid, requiredVariables = []) {
  return requiredVariables.every((name) => grid?.variables?.[name])
}
```

- [x] **Step 5: Wire complete-grid skip into `collectKimNwpTask`**

Update `collectKimNwpTask` signature:

```js
export async function collectKimNwpTask({
  task,
  fetchWind = fetchWindGrid,
  addTemperature = addTemperatureToGrid,
  addHumidity = addHumidityToGrid,
  addIcing = addIcingToGrid,
  collectIcing = config.kim_nwp?.collect_icing !== false,
  incrementalRetry = config.kim_nwp?.incremental_retry !== false,
  readExistingGrid = ({ level, tmfc, hf }) => readKimNwpGridSafe({
    root: config.storage.base_path,
    model: KIM_NWP_MODEL,
    tmfc,
    hf,
    levelId: level.id,
  }),
  writeGrid = (grid) => writeKimNwpGrid({ root: config.storage.base_path, grid }),
}) {
```

At the top of the function:

```js
  if (incrementalRetry) {
    const existingGrid = readExistingGrid(task)
    if (hasGridVariables(existingGrid, requiredVariablesForTask(task.level, { collectIcing }))) {
      return { grid: existingGrid, lastError: null, reused: true }
    }
  }
```

Import `readKimNwpGridSafe`.

- [x] **Step 6: Pass incremental flag from process**

In `process()`, call:

```js
const { grid, lastError: taskError } = await collectKimNwpTask({
  task,
  collectIcing: config.kim_nwp?.collect_icing !== false,
  incrementalRetry: config.kim_nwp?.incremental_retry !== false,
})
```

- [x] **Step 7: Verify tests**

Run:

```powershell
node --test backend/test/kim-surface-wind.test.js backend/test/kim-nwp-store.test.js
```

Expected: PASS.

---

## Task 4: Snapshot-Meta Backend Memoization

**Files:**
- Modify: `backend/server.js`
- Test: `backend/test/kim-server-index.test.js` or create `backend/test/snapshot-meta-cache.test.js`

- [x] **Step 1: Add focused cache helper functions**

In `backend/server.js`, near `buildSnapshotMeta`, add:

```js
const SNAPSHOT_META_CACHE_TTL_MS = 5000
const snapshotMetaCache = { key: null, value: null, expiresAt: 0 }

function fileMtimeMs(filePath) {
  try {
    return fs.statSync(filePath).mtimeMs
  } catch {
    return 0
  }
}

function buildSnapshotMetaCacheKey() {
  const files = [
    path.join(DATA_ROOT, 'kim_nwp', 'index.json'),
    path.join(DATA_ROOT, 'kim_nwp', 'latest.json'),
    path.join(DATA_ROOT, 'kim_surface_wind', 'latest.json'),
    path.join(DATA_ROOT, 'metar', 'latest.json'),
    path.join(DATA_ROOT, 'taf', 'latest.json'),
    path.join(DATA_ROOT, 'warning', 'latest.json'),
    path.join(DATA_ROOT, 'sigmet', 'latest.json'),
    path.join(DATA_ROOT, 'airmet', 'latest.json'),
    path.join(DATA_ROOT, 'sigwx_low', 'latest.json'),
    path.join(DATA_ROOT, 'amos', 'latest.json'),
    path.join(DATA_ROOT, 'lightning', 'latest.json'),
    path.join(DATA_ROOT, 'adsb', 'latest.json'),
    path.join(DATA_ROOT, 'ground_forecast', 'latest.json'),
    path.join(DATA_ROOT, 'ground_overview', 'latest.json'),
    path.join(DATA_ROOT, 'environment', 'latest.json'),
    path.join(DATA_ROOT, 'airport_info', 'latest.json'),
    path.join(DATA_ROOT, 'radar', 'echo_meta.json'),
    path.join(DATA_ROOT, 'satellite', 'sat_meta.json'),
  ]
  return files.map((filePath) => `${filePath}:${fileMtimeMs(filePath)}`).join('|')
}

function getCachedSnapshotMeta(nowMs = Date.now()) {
  const key = buildSnapshotMetaCacheKey()
  if (snapshotMetaCache.value && snapshotMetaCache.key === key && snapshotMetaCache.expiresAt > nowMs) {
    return snapshotMetaCache.value
  }
  const value = buildSnapshotMeta()
  snapshotMetaCache.key = key
  snapshotMetaCache.value = value
  snapshotMetaCache.expiresAt = nowMs + SNAPSHOT_META_CACHE_TTL_MS
  return value
}
```

- [x] **Step 2: Use cached snapshot-meta route**

Replace:

```js
app.get('/api/snapshot-meta', (_req, res) => res.json(buildSnapshotMeta()))
```

with:

```js
app.get('/api/snapshot-meta', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache')
  res.json(getCachedSnapshotMeta())
})
```

Export `getCachedSnapshotMeta` for tests:

```js
export { app, buildSnapshotMeta, getCachedSnapshotMeta, readSelectedKimCloudField, readSelectedKimIcingField }
```

- [x] **Step 3: Add a route/header test**

In a backend test that imports `app`, request `/api/snapshot-meta` and assert:

```js
assert.equal(res.headers.get('cache-control'), 'no-cache')
assert.equal(res.status, 200)
```

Use the repo's existing server test style from `backend/test/kim-icing-api.test.js`.

- [x] **Step 4: Verify backend API tests**

Run:

```powershell
node --test backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js backend/test/kim-server-index.test.js
```

Expected: PASS.

---

## Task 5: KIM Field Cache Headers, ETag, And Compression

**Files:**
- Modify: `backend/server.js`
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json` if present or generated by install
- Test: create `backend/test/kim-field-cache.test.js`

- [x] **Step 1: Install compression dependency**

Run:

```powershell
npm.cmd install compression --prefix backend
```

Expected: `backend/package.json` includes `compression`; lockfile updates if present.

- [x] **Step 2: Add Express compression middleware**

In `backend/server.js`, add import:

```js
import compression from 'compression'
```

After `app.use(express.json({ limit: '1mb' }))`, add:

```js
app.use(compression())
```

- [x] **Step 3: Make `/api` no-store middleware skip immutable KIM fields**

Replace:

```js
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
```

with:

```js
function isImmutableKimFieldRequest(req) {
  return /^\/kim\/(?:wind|temp|cloud|icing)\/field$/i.test(req.path)
}

app.use('/api', (req, res, next) => {
  if (!isImmutableKimFieldRequest(req)) {
    res.setHeader('Cache-Control', 'no-store')
  }
  next()
})
```

- [x] **Step 4: Add ETag JSON sender**

Near `sendJsonFile`, add:

```js
function sendImmutableJson(res, payload, etagSeed) {
  const etag = `"${crypto.createHash('sha256').update(etagSeed).digest('hex')}"`
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
  res.setHeader('ETag', etag)
  res.setHeader('Vary', 'Accept-Encoding')
  if (res.req?.headers?.['if-none-match'] === etag) {
    res.status(304).end()
    return
  }
  res.json(payload)
}
```

Also add:

```js
import crypto from 'node:crypto'
```

- [x] **Step 5: Use immutable sender for KIM field routes**

For wind field inside `sendKimWindField`, replace:

```js
res.json(readSelectedKimNwpField(selection))
```

with:

```js
const field = readSelectedKimNwpField(selection)
sendImmutableJson(res, field, `kim-wind:${selection.tmfc}:${selection.hf}:${selection.level}:${field?.fetched_at || ''}`)
```

For temp/cloud/icing field routes, use the same pattern:

```js
const field = readSelectedKimTempField(selection)
sendImmutableJson(res, field, `kim-temp:${selection.tmfc}:${selection.hf}:${selection.level}:${field?.fetched_at || ''}`)
```

```js
const field = readSelectedKimCloudField(selection)
sendImmutableJson(res, field, `kim-cloud:${selection.tmfc}:${selection.hf}:${selection.level}:${field?.fetched_at || ''}`)
```

```js
const field = readSelectedKimIcingField(selection)
sendImmutableJson(res, field, `kim-icing:${selection.tmfc}:${selection.hf}:${selection.level}:${field?.fetched_at || ''}`)
```

- [x] **Step 6: Add KIM field cache tests**

Create `backend/test/kim-field-cache.test.js` following the `backend/test/kim-icing-api.test.js` temporary data-root pattern. Test:

```js
test('KIM field routes use immutable cache headers and ETag revalidation', async () => {
  const first = await request('/api/kim/icing/field?tmfc=2026051900&hf=0&level=850hPa')
  assert.equal(first.status, 200)
  assert.match(first.headers.get('cache-control'), /public/)
  assert.match(first.headers.get('cache-control'), /immutable/)
  const etag = first.headers.get('etag')
  assert.ok(etag)

  const second = await request('/api/kim/icing/field?tmfc=2026051900&hf=0&level=850hPa', {
    headers: { 'If-None-Match': etag },
  })
  assert.equal(second.status, 304)
})
```

Use existing test helpers for writing fixture grids; do not hit live KMA.

- [x] **Step 7: Verify backend tests**

Run:

```powershell
node --test backend/test/kim-field-cache.test.js backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js
```

Expected: PASS.

---

## Task 6: Frontend NWP Request Reduction

**Files:**
- Modify: `frontend/src/features/weather-overlays/NwpSliderBar.jsx`
- Modify: `frontend/src/features/weather-overlays/NwpSliderBar.test.js`
- Optionally create: `frontend/src/features/weather-overlays/lib/useKimSnapshotMeta.js`
- Modify: KIM hooks if shared snapshot polling is implemented.

- [x] **Step 1: Add NWP slider commit/debounce test**

In `frontend/src/features/weather-overlays/NwpSliderBar.test.js`, add a pure helper test if the component does not expose DOM event testing. Preferred helper:

```js
export function shouldCommitNwpSelection(eventType) {
  return ['change', 'pointerup', 'keyup', 'blur'].includes(eventType)
}
```

Test:

```js
test('NWP slider commits selection on final interaction events', () => {
  assert.equal(shouldCommitNwpSelection('input'), false)
  assert.equal(shouldCommitNwpSelection('pointermove'), false)
  assert.equal(shouldCommitNwpSelection('change'), true)
  assert.equal(shouldCommitNwpSelection('pointerup'), true)
  assert.equal(shouldCommitNwpSelection('keyup'), true)
  assert.equal(shouldCommitNwpSelection('blur'), true)
})
```

- [x] **Step 2: Run test to verify it fails**

Run:

```powershell
node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js
```

Expected: FAIL because helper is not exported.

- [x] **Step 3: Implement low-risk slider commit behavior**

In `NwpSliderBar.jsx`, keep visual slider state responsive but avoid calling `onSelectionChange` on every transient drag event. If the component currently calls selection change from `onChange`, introduce local state:

```js
const [draftSelection, setDraftSelection] = useState(selection)

useEffect(() => {
  setDraftSelection(selection)
}, [selection?.tmfc, selection?.hf, selection?.level])

function commitSelection(nextSelection) {
  onSelectionChange?.(nextSelection)
}
```

Use `setDraftSelection` on range `onInput`, and `commitSelection` on `onChange`, `onPointerUp`, `onKeyUp`, and `onBlur`. Keep keyboard accessibility intact.

- [x] **Step 4: Verify slider test**

Run:

```powershell
node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js
```

Expected: PASS.

- [x] **Step 5: Decide whether to implement shared snapshot polling now**

If Task 4 backend memoization is already done, shared frontend polling is optional. If implemented, create `frontend/src/features/weather-overlays/lib/useKimSnapshotMeta.js`:

```js
import { useEffect, useState } from 'react'
import { fetchSnapshotMeta } from '../../../api/weatherApi.js'

const REFRESH_INTERVAL_MS = 60_000
let currentSnapshot = null
let timer = null
const listeners = new Set()

function notify(snapshot) {
  currentSnapshot = snapshot
  for (const listener of listeners) listener(snapshot)
}

async function poll() {
  const snapshot = await fetchSnapshotMeta()
  if (snapshot) notify(snapshot)
}

function ensureTimer() {
  if (timer || typeof window === 'undefined') return
  timer = window.setInterval(() => { poll().catch(() => {}) }, REFRESH_INTERVAL_MS)
  poll().catch(() => {})
}

function stopTimerIfIdle() {
  if (!timer || listeners.size > 0 || typeof window === 'undefined') return
  window.clearInterval(timer)
  timer = null
}

export function useKimSnapshotMeta(enabled) {
  const [snapshot, setSnapshot] = useState(currentSnapshot)
  useEffect(() => {
    if (!enabled) return undefined
    listeners.add(setSnapshot)
    ensureTimer()
    return () => {
      listeners.delete(setSnapshot)
      stopTimerIfIdle()
    }
  }, [enabled])
  return snapshot
}
```

Then replace per-hook `setInterval(fetchSnapshotMeta)` with `const snapshot = useKimSnapshotMeta(enabled)` and a small effect that compares hashes.

- [x] **Step 6: Verify frontend NWP tests**

Run:

```powershell
node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/useKimIcing.test.js
```

Expected: PASS.

---

## Task 7: Full Verification And Ops Notes

**Files:**
- Modify: `docs/archive/development/status/kim-icing-potential.status.md`
- Optionally create: `docs/operations/kim-nwp-free-tier.md`

- [x] **Step 1: Run backend KIM suite**

Run:

```powershell
node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-icing-api.test.js backend/test/kim-cloud-api.test.js backend/test/kim-server-index.test.js backend/test/kim-field-cache.test.js
```

Expected: PASS.

- [x] **Step 2: Run frontend NWP suite**

Run:

```powershell
node --test frontend/src/features/weather-overlays/NwpSliderBar.test.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/useKimIcing.test.js frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js
```

Expected: PASS.

- [x] **Step 3: Run production build**

Run:

```powershell
npm.cmd run build --prefix frontend
```

Expected: PASS. The existing large chunk warning may remain; do not treat it as failure unless a new error appears.

- [x] **Step 4: Smoke check cache headers locally**

With backend running, run:

```powershell
$r = Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/kim/icing/field?tmfc=2026052000&hf=3&level=500hPa' -UseBasicParsing
$r.Headers['Cache-Control']
$r.Headers['ETag']
```

Expected:

```text
public, max-age=86400, immutable
"<some hash>"
```

Then run:

```powershell
$etag = $r.Headers['ETag']
(Invoke-WebRequest -Uri 'http://127.0.0.1:3001/api/kim/icing/field?tmfc=2026052000&hf=3&level=500hPa' -Headers @{ 'If-None-Match' = $etag } -UseBasicParsing).StatusCode
```

Expected: `304`.

- [x] **Step 5: Update status file**

Add final verification notes to `docs/archive/development/status/kim-icing-potential.status.md`:

```markdown
## Ops Optimization Verification
- Backend KIM suite: PASS (`node --test ...`).
- Frontend NWP suite: PASS (`node --test ...`).
- Frontend build: PASS (`npm.cmd run build --prefix frontend`).
- KIM field cache smoke: PASS (`Cache-Control: public, max-age=86400, immutable`, ETag 304 revalidation).
- Recommended free-tier env remains: `KIM_NWP_KEEP_RAW=0`, `KIM_NWP_MAX_RUNS=1`, `KIM_NWP_CONCURRENCY=2`, `KIM_NWP_COLLECT_ON_STARTUP=0`, `KIM_NWP_INCREMENTAL_RETRY=1`.
```

---

## Risk Notes

- `KIM_NWP_KEEP_RAW=0` removes raw debugging payloads on production. Keep raw enabled locally when investigating KMA parser issues.
- `KIM_NWP_CONCURRENCY=2` can make first successful collection slower than local defaults. This is acceptable on a free VM because it reduces peak CPU/I/O.
- KIM field `immutable` cache must only apply to selected `field` routes. Do not apply immutable cache to KIM `index`, `/api/snapshot-meta`, METAR, TAF, warnings, radar meta, or satellite meta.
- ETag must vary by product and selected `tmfc/hf/level`. Reusing one ETag across products can serve stale or wrong fields.
- Incremental retry must not publish a run as complete unless `hasCompleteKimNwpRun()` sees every required variable for configured levels/hours.
- Shared frontend snapshot polling is optional after backend memoization; implement it only if hook churn stays contained.

## Self-Review

- Spec coverage: Covers raw storage, concurrency, incremental retry, startup KIM collection, snapshot-meta duplication, ETag/cache headers, gzip, and frontend slider request reduction.
- Placeholder scan: No unfinished placeholder markers are present; optional items state explicit decision criteria.
- Type consistency: Uses existing `kim_nwp`, `collect_icing`, `KIM_NWP_LEVELS`, field route names, and hook names from the current codebase.
