# KIM Wind Time Level Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the current 10m KIM wind overlay so users can select forecast time and wind level, while preserving the existing wind animation and speed layer behavior.

**Architecture:** Implement wind-only KIM NWP storage first: `u/v` grids for `10m`, `925hPa`, `850hPa`, `700hPa`, `500hPa`, and `300hPa` through `+36h`. Store data with a bounded manifest-based `kim_nwp` store instead of putting all grids into `kim_surface_wind/latest.json`. Keep `/api/kim/surface-wind` as the current map compatibility endpoint, and add wind-facing index/field endpoints for time and level selection. `MapView.jsx` remains high-level wiring only; renderer details stay in `frontend/src/features/weather-overlays/lib/`.

**Tech Stack:** Node/Express backend, local `DATA_PATH` storage, KIM grid API text parser, React/Vite frontend, Mapbox GL, existing WebGL/Canvas wind renderers, Node test runner.

---

## Scope

This phase is **wind only**.

In scope:

- `u/v` wind components only
- levels: `10m`, `925hPa`, `850hPa`, `700hPa`, `500hPa`, `300hPa`
- forecast hours: `0,3,6,9,12,15,18,21,24,27,30,33,36`
- bounded backend storage
- `/api/kim/wind/index`
- `/api/kim/wind/field`
- existing `/api/kim/surface-wind` compatibility
- frontend time selector
- frontend level selector
- existing Flow animation and Speed layer update when selection changes

Out of scope for this phase:

- `T`
- `hgt`
- route briefing API wiring
- WIN/TEMP rendering
- vertical interpolation between pressure levels
- persisting route-specific sampled output

Use `kim_nwp` for internal storage and model helpers from the start. The public UI/API can remain wind-facing in this phase, but the persisted data must be reusable by later route briefing and vertical weather section work. Do not fetch or store `T/hgt` in this task.

## Storage Design

Do not store all selected times and levels inside `kim_surface_wind/latest.json`.

Use a dedicated NWP store under `DATA_PATH`:

```text
DATA_PATH/
  kim_nwp/
    latest.json
    index.json
    runs/
      KIMG_NE57_2026051900/
        manifest.json
        raw/
          hf000/10m/u.txt
          hf000/10m/v.txt
          hf003/850hPa/u.txt
          hf003/850hPa/v.txt
        normalized/
          hf000/10m/grid.json
          hf003/850hPa/grid.json
```

`latest.json` is a small pointer only:

```json
{
  "type": "kim_nwp_latest",
  "model": "KIMG/NE57",
  "latestRun": "2026051900",
  "latestRunId": "KIMG_NE57_2026051900",
  "indexPath": "kim_nwp/index.json",
  "updated_at": "2026-05-19T05:10:00.000Z",
  "content_hash": "sha256..."
}
```

`index.json` is the availability contract:

```json
{
  "type": "kim_nwp_index",
  "model": "KIMG/NE57",
  "latestRun": "2026051900",
  "levels": [
    { "id": "10m", "label": "10m", "kind": "height", "value": 10, "unit": "m" },
    { "id": "925hPa", "label": "925", "kind": "pressure", "value": 925, "unit": "hPa" }
  ],
  "times": [
    { "hf": 0, "validTime": "2026-05-19T00:00:00.000Z" },
    { "hf": 3, "validTime": "2026-05-19T03:00:00.000Z" }
  ],
  "availability": {
    "10m": {
      "0": { "variables": ["u", "v"], "path": "kim_nwp/runs/KIMG_NE57_2026051900/normalized/hf000/10m/grid.json" }
    },
    "925hPa": {
      "3": { "variables": ["u", "v"], "path": "kim_nwp/runs/KIMG_NE57_2026051900/normalized/hf003/925hPa/grid.json" }
    }
  }
}
```

Each `grid.json` stores one `tmfc + hf + level` NWP grid. This phase writes `u/v` only, but the `variables` map is the canonical briefing data shape for later `T/hgt` additions:

```json
{
  "type": "kim_nwp_grid",
  "model": "KIMG/NE57",
  "tmfc": "2026051900",
  "hf": 3,
  "validTime": "2026-05-19T03:00:00.000Z",
  "level": { "id": "925hPa", "label": "925", "kind": "pressure", "value": 925, "unit": "hPa" },
  "grid": { "nx": 205, "ny": 169, "lonMin": 119, "latMin": 30, "lonMax": 136, "latMax": 44, "dx": 0.083333, "dy": 0.083333 },
  "variables": {
    "u": { "unit": "m/s", "encoding": "int16-scaled-json-v1", "scale": 0.01, "offset": 0, "values": [] },
    "v": { "unit": "m/s", "encoding": "int16-scaled-json-v1", "scale": 0.01, "offset": 0, "values": [] }
  },
  "fetched_at": "2026-05-19T00:15:00.000Z"
}
```

## Retention

Storage must remain bounded on the VM.

Default:

- keep latest 2 usable runs
- keep raw `u/v` responses for latest 2 usable runs
- keep normalized `u/v` grids for latest 2 usable runs
- delete old data by removing whole run directories
- do not update `latest.json` if the new run has no usable `u/v` pair
- do not delete the previous usable run after failed collection
- write `grid.json`, `index.json`, and `latest.json` with temp-file-plus-rename atomic writes
- update `latest.json` only after the selected run has written a usable index
- run cleanup after `latest.json` is updated and always preserve the current `latestRunId`
- keep all usable `hf 0..36` grids on disk; past-time filtering is an API/UI exposure rule, not a store rule

Config:

```js
export const kim_nwp = {
  max_runs: Number(process.env.KIM_NWP_MAX_RUNS || 2),
  keep_raw: process.env.KIM_NWP_KEEP_RAW !== '0',
  concurrency: Number(process.env.KIM_NWP_CONCURRENCY || 4),
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
}
```

## Time And Level Rules

- KIM run candidates use synoptic cycles: `00`, `06`, `12`, `18` UTC.
- Collector probes latest candidate runs until one has at least one usable `u/v` pair.
- Store all configured forecast hours for the usable run, including valid times that are already in the past.
- `/api/kim/wind/index` filters exposed times using the backend server clock so the map UI does not offer past valid times.
- The frontend applies the same non-past filter defensively when selecting defaults.
- Default selection:
  - level: `10m` if available, otherwise first available level
  - time: earliest available non-past valid time
- UI displays time in KST.
- Internal storage uses `tmfc`, `hf`, and ISO `validTime`.

## Speed Layer Scale

The speed layer uses one kt-based color scale across every wind level. The same color must always mean the same speed range, including at upper-air levels. Do not add level-specific or adaptive ramps unless the UI explicitly labels the scale as adaptive.

Default shared scale:

```text
0-5 kt
5-10 kt
10-20 kt
20-30 kt
30-40 kt
40-60 kt
60-80 kt
80-100 kt
100-130 kt
130+ kt
```

The renderer may still store and sample wind in `m/s`; legend labels and bin thresholds are expressed in kt for aviation users.

## API Design

Keep existing compatibility endpoint:

```text
GET /api/kim/surface-wind
```

Behavior:

- if no query is provided, return default selected field from `kim_nwp/index.json`
- if query is provided, return selected renderer-compatible field

Query shape:

```text
GET /api/kim/surface-wind?tmfc=2026051900&hf=3&level=925hPa
```

Add wind index endpoint:

```text
GET /api/kim/wind/index
```

Add selected field endpoint:

```text
GET /api/kim/wind/field?tmfc=2026051900&hf=3&level=925hPa
```

`/api/kim/wind/field` returns renderer-compatible field shape, not full manifest internals:

```js
{
  type: 'kim_surface_wind',
  model: 'KIMG/NE57',
  grid: { nx, ny, lonMin, latMin, lonMax, latMax, dx, dy },
  time: { tmfc, hf, validTime },
  level: { id, label, kind, value, unit },
  units: { u: 'm/s', v: 'm/s', speed: 'm/s' },
  stats: { minSpeed, maxSpeed, meanSpeed },
  encoding: 'int16-scaled-json-v1',
  scale: 0.01,
  offset: 0,
  u: [],
  v: [],
  fetched_at: '2026-05-19T00:15:00.000Z'
}
```

Snapshot meta adds:

```js
kimNwp: {
  hash,
  tmfc,
  updated_at,
  variables: {
    uv: { hash }
  }
}
```

`kimNwp.hash` remains the whole latest-run compatibility hash. Wind-specific frontend refresh should prefer `kimNwp.variables.uv.hash` when present and fall back to `kimNwp.hash`.

Keep `kimWind`, `kimSurfaceWind`, and snake_case aliases for current frontend compatibility while the hook migrates.

## Frontend Design

Panel behavior:

- Wind toggle turns Wind group on.
- Speed is on by default when Wind is enabled.
- Flow remains separately toggleable.
- Do not show time or level controls inside the panel.
- Time and level selection live in the map-level shared NWP slider.
- Disable or hide unavailable slider options.

Hook behavior:

```js
{
  windField,
  windIndex,
  selection,
  setSelection,
  availableLevels,
  availableTimes,
  status,
  error,
  meta,
  lowPower
}
```

`useKimSurfaceWind()` should:

- fetch `/api/kim/wind/index` when Wind is enabled
- choose default selection
- fetch one selected field from `/api/kim/wind/field`
- continue supporting old `/api/kim/surface-wind` fallback
- refetch index when snapshot meta `kimNwp.variables.uv.hash` changes, falling back to `kimNwp.hash` for older payloads
- not load all fields into frontend memory
- maintain an in-hook `Map` cache keyed by `${tmfc}:${hf}:${level}`
- cancel stale selected-field requests with `AbortController`
- guard state commits with a monotonically increasing request token so rapid level/time toggles cannot commit an older field over the current selection

`MapView.jsx` only passes hook state and callbacks into `WeatherOverlayPanel`.

## Renderer Boundary

Do not change renderer internals unless required by selected field metadata.

Preserve:

- `windOverlaySync` boundary
- `windField` sampler
- WebGL-first renderer selection
- Canvas fallback
- Flow toggle cleanup
- Speed layer toggle cleanup
- current tone/trail/width defaults
- current particle count and LOD behavior

Change:

- replace the current 10m-focused speed color ramp with the shared kt scale above
- keep one speed color scale across all levels

Only expected renderer-adjacent change:

- metadata label should show selected level and valid time

## Route Briefing / Vertical Section Readiness

This phase keeps the future NWP/WIN-TEMP path open without implementing it.

The normalized `kim_nwp` grid is the canonical data source. Renderer fields, particle state, and future speed-layer rasters are UI products derived from that canonical grid and must not be the only stored representation.

Future route briefing work should be able to read the same `kim_nwp` grids through store helpers:

```js
sampleKimNwpAlongRoute({
  routeAxis,
  tmfc,
  validTime,
  levels: ['925hPa', '850hPa', '700hPa'],
  variables: ['u', 'v'],
})
```

Later phases may extend the same contract to:

```js
variables: ['u', 'v', 'T', 'hgt']
```

Future sampler boundaries:

- horizontal bilinear interpolation belongs in the NWP sampler
- out-of-grid samples return `null`; do not clamp to the nearest grid cell by default
- decoded missing values or `NaN` cells return `null` for that variable
- time interpolation is out of scope here and must be decided in the route briefing phase
- vertical interpolation between pressure/height levels is out of scope here and must be decided in the vertical section phase
- route-specific sampled output is generated per request and is not persisted by this phase

The current implementation should not hard-code assumptions that prevent those later additions.

---

### Task 1: Wind Store And Retention

**Files:**
- Modify: `backend/src/config.js`
- Create: `backend/src/processors/kim-nwp-store.js`
- Test: `backend/test/kim-nwp-store.test.js`

- [ ] **Step 1: Write failing store tests**

Create `backend/test/kim-nwp-store.test.js`:

```js
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import {
  buildKimNwpRunId,
  cleanupKimNwpRuns,
  listKimNwpRuns,
  readKimNwpGrid,
  readKimNwpIndex,
  resolveKimNwpGridPath,
  validateKimNwpSelection,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
} from '../src/processors/kim-nwp-store.js'

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'projectamo-kim-nwp-'))
}

test('buildKimNwpRunId creates filesystem-safe run ids', () => {
  assert.equal(buildKimNwpRunId({ model: 'KIMG/NE57', tmfc: '2026051900' }), 'KIMG_NE57_2026051900')
})

test('resolveKimNwpGridPath groups grids by run, forecast hour, and level', () => {
  const root = tempRoot()
  assert.equal(
    resolveKimNwpGridPath({ root, model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, levelId: '925hPa' }),
    path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026051900', 'normalized', 'hf003', '925hPa', 'grid.json'),
  )
})

test('validateKimNwpSelection rejects path traversal inputs', () => {
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '2026051900', hf: 3, levelId: '../925hPa' }),
    /level/i,
  )
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '../../bad', hf: 3, levelId: '925hPa' }),
    /tmfc/i,
  )
  assert.throws(
    () => validateKimNwpSelection({ tmfc: '2026051900', hf: 999, levelId: '925hPa' }),
    /forecast hour/i,
  )
})

test('writeKimNwpGrid writes one selected time level grid', () => {
  const root = tempRoot()
  const grid = {
    type: 'kim_nwp_grid',
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: { id: '925hPa' },
    variables: { u: { values: [1] }, v: { values: [2] } },
  }

  const filePath = writeKimNwpGrid({ root, grid })

  assert.equal(fs.existsSync(filePath), true)
  assert.equal(JSON.parse(fs.readFileSync(filePath, 'utf8')).type, 'kim_nwp_grid')
  assert.deepEqual(readKimNwpGrid({ root, model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, levelId: '925hPa' }), grid)
})

test('writeKimNwpIndex writes compact index without grid values', () => {
  const root = tempRoot()
  const index = {
    type: 'kim_nwp_index',
    model: 'KIMG/NE57',
    latestRun: '2026051900',
    availability: { '10m': { 0: { variables: ['u', 'v'], path: 'x/grid.json' } } },
  }

  writeKimNwpIndex(root, index)

  assert.deepEqual(readKimNwpIndex(root), index)
  assert.equal(fs.readFileSync(path.join(root, 'kim_nwp', 'index.json'), 'utf8').includes('"values"'), false)
})

test('cleanupKimNwpRuns deletes old runs by run directory while preserving latestRunId', () => {
  const root = tempRoot()
  for (const runId of ['KIMG_NE57_2026051812', 'KIMG_NE57_2026051818', 'KIMG_NE57_2026051900']) {
    fs.mkdirSync(path.join(root, 'kim_nwp', 'runs', runId), { recursive: true })
  }

  cleanupKimNwpRuns({ root, maxRuns: 2, latestRunId: 'KIMG_NE57_2026051812' })

  assert.deepEqual(listKimNwpRuns(root), ['KIMG_NE57_2026051900', 'KIMG_NE57_2026051818', 'KIMG_NE57_2026051812'])
  assert.equal(fs.existsSync(path.join(root, 'kim_nwp', 'runs', 'KIMG_NE57_2026051812')), true)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test backend/test/kim-nwp-store.test.js
```

Expected: FAIL because `backend/src/processors/kim-nwp-store.js` does not exist.

- [ ] **Step 3: Add config**

Add to `backend/src/config.js`:

```js
export const kim_nwp = {
  max_runs: Number(process.env.KIM_NWP_MAX_RUNS || 2),
  keep_raw: process.env.KIM_NWP_KEEP_RAW !== '0',
  concurrency: Number(process.env.KIM_NWP_CONCURRENCY || 4),
  forecast_hours: [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
}
```

Add `kim_nwp` to the default export.

- [ ] **Step 4: Implement store helper**

Create `backend/src/processors/kim-nwp-store.js`:

```js
import fs from 'node:fs'
import path from 'node:path'

import { KIM_NWP_FORECAST_HOURS, KIM_NWP_LEVELS } from './kim-nwp-model.js'

const ROOT_DIR = 'kim_nwp'

function assertInsideRoot(root, filePath) {
  const rel = path.relative(root, filePath)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Resolved KIM NWP path escapes root: ${filePath}`)
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
  fs.renameSync(tmpPath, filePath)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function safeSegment(value) {
  return String(value || '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

export function buildKimNwpRunId({ model, tmfc }) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  return `${safeSegment(model)}_${tmfc}`
}

export function validateKimNwpSelection({ tmfc, hf, levelId }) {
  if (!/^\d{10}$/.test(String(tmfc || ''))) throw new Error('Invalid KIM NWP tmfc')
  if (!KIM_NWP_FORECAST_HOURS.includes(Number(hf))) throw new Error('Invalid KIM NWP forecast hour')
  if (!KIM_NWP_LEVELS.some((level) => level.id === levelId)) throw new Error('Invalid KIM NWP level')
}

export function resolveKimNwpRoot(root) {
  return path.join(root, ROOT_DIR)
}

export function resolveKimNwpRunDir({ root, model, tmfc }) {
  return path.join(resolveKimNwpRoot(root), 'runs', buildKimNwpRunId({ model, tmfc }))
}

export function resolveKimNwpGridPath({ root, model, tmfc, hf, levelId }) {
  validateKimNwpSelection({ tmfc, hf, levelId })
  const filePath = path.join(
    resolveKimNwpRunDir({ root, model, tmfc }),
    'normalized',
    `hf${String(hf).padStart(3, '0')}`,
    levelId,
    'grid.json',
  )
  assertInsideRoot(resolveKimNwpRoot(root), filePath)
  return filePath
}

export function writeKimNwpGrid({ root, grid }) {
  const filePath = resolveKimNwpGridPath({
    root,
    model: grid.model,
    tmfc: grid.tmfc,
    hf: grid.hf,
    levelId: grid.level.id,
  })
  writeJsonAtomic(filePath, grid)
  return filePath
}

export function writeKimNwpLatest(root, latest) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'latest.json'), latest)
}

export function writeKimNwpIndex(root, index) {
  writeJsonAtomic(path.join(resolveKimNwpRoot(root), 'index.json'), index)
}

export function readKimNwpGrid({ root, model, tmfc, hf, levelId }) {
  return readJson(resolveKimNwpGridPath({ root, model, tmfc, hf, levelId }))
}

export function readKimNwpIndex(root) {
  const filePath = path.join(resolveKimNwpRoot(root), 'index.json')
  if (!fs.existsSync(filePath)) return null
  return readJson(filePath)
}

export function listKimNwpRuns(root) {
  const runsDir = path.join(resolveKimNwpRoot(root), 'runs')
  if (!fs.existsSync(runsDir)) return []
  return fs.readdirSync(runsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a))
}

export function cleanupKimNwpRuns({ root, maxRuns, latestRunId }) {
  const limit = Number(maxRuns)
  if (!Number.isFinite(limit) || limit <= 0) return
  const runsDir = path.join(resolveKimNwpRoot(root), 'runs')
  const keep = new Set(listKimNwpRuns(root).slice(0, limit))
  if (latestRunId) keep.add(latestRunId)
  for (const runId of listKimNwpRuns(root)) {
    if (keep.has(runId)) continue
    fs.rmSync(path.join(runsDir, runId), { recursive: true, force: true })
  }
}
```

- [ ] **Step 5: Run store tests**

Run:

```bash
node --test backend/test/kim-nwp-store.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit store helper**

Run:

```bash
git add backend/src/config.js backend/src/processors/kim-nwp-store.js backend/test/kim-nwp-store.test.js
git commit -m "feat: add kim wind manifest store"
```

---

### Task 2: Wind Grid Model

**Files:**
- Create: `backend/src/processors/kim-nwp-model.js`
- Test: `backend/test/kim-nwp-model.test.js`

- [ ] **Step 1: Write failing model tests**

Create `backend/test/kim-nwp-model.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  KIM_NWP_FORECAST_HOURS,
  KIM_NWP_LEVELS,
  buildKimSurfaceWindFieldFromWindGrid,
  buildKimNwpGrid,
  buildKimNwpIndex,
} from '../src/processors/kim-nwp-model.js'

const BOUNDS = { lonMin: 119, latMin: 30, lonMax: 119.083333, latMax: 30.083333, dx: 0.083333, dy: 0.083333 }

function component(variable, values, level = 0) {
  return { variable, unit: 'm/s', level, nx: 2, ny: 2, bounds: BOUNDS, values }
}

test('KIM wind levels and forecast hours match this phase scope', () => {
  assert.deepEqual(KIM_NWP_LEVELS.map((level) => level.id), ['10m', '925hPa', '850hPa', '700hPa', '500hPa', '300hPa'])
  assert.deepEqual(KIM_NWP_FORECAST_HOURS, [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36])
})

test('buildKimNwpGrid stores u and v for one time and level', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[1],
    components: [
      component('u', [1, 2, 3, 4], 925),
      component('v', [0, 0, 1, 1], 925),
    ],
    fetchedAt: '2026-05-19T00:15:00.000Z',
  })

  assert.equal(grid.type, 'kim_nwp_grid')
  assert.equal(grid.validTime, '2026-05-19T03:00:00.000Z')
  assert.deepEqual(Object.keys(grid.variables), ['u', 'v'])
  assert.equal(grid.variables.u.encoding, 'int16-scaled-json-v1')
})

test('buildKimSurfaceWindFieldFromWindGrid derives renderer field', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[0],
    components: [
      component('u', [3, 0, 0, 8]),
      component('v', [4, 0, 12, 15]),
    ],
  })

  const field = buildKimSurfaceWindFieldFromWindGrid(grid)

  assert.equal(field.type, 'kim_surface_wind')
  assert.equal(field.level.id, '10m')
  assert.equal(field.stats.maxSpeed, 17)
  assert.deepEqual(field.u, grid.variables.u.values)
  assert.deepEqual(field.v, grid.variables.v.values)
})

test('buildKimNwpIndex omits encoded values', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 0,
    level: KIM_NWP_LEVELS[0],
    components: [
      component('u', [1, 1, 1, 1]),
      component('v', [0, 0, 0, 0]),
    ],
  })

  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    grids: [grid],
    pathForGrid: () => 'kim_nwp/runs/KIMG_NE57_2026051900/normalized/hf000/10m/grid.json',
  })

  assert.equal(index.type, 'kim_nwp_index')
  assert.equal(index.latestRun, '2026051900')
  assert.equal(JSON.stringify(index).includes('"values"'), false)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test backend/test/kim-nwp-model.test.js
```

Expected: FAIL because `kim-nwp-model.js` does not exist.

- [ ] **Step 3: Implement model helper**

Create `backend/src/processors/kim-nwp-model.js` with:

```js
const SCALE = 0.01
const OFFSET = 0

export const KIM_NWP_MODEL = 'KIMG/NE57'
export const KIM_NWP_FORECAST_HOURS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]

export const KIM_NWP_LEVELS = [
  { id: '10m', label: '10m', kind: 'height', value: 10, unit: 'm', level: 0, uName: 'u10m', vName: 'v10m' },
  { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa', level: 925, uName: 'u', vName: 'v' },
  { id: '850hPa', label: '850', kind: 'pressure', value: 850, unit: 'hPa', level: 850, uName: 'u', vName: 'v' },
  { id: '700hPa', label: '700', kind: 'pressure', value: 700, unit: 'hPa', level: 700, uName: 'u', vName: 'v' },
  { id: '500hPa', label: '500', kind: 'pressure', value: 500, unit: 'hPa', level: 500, uName: 'u', vName: 'v' },
  { id: '300hPa', label: '300', kind: 'pressure', value: 300, unit: 'hPa', level: 300, uName: 'u', vName: 'v' },
]

function encode(values) {
  return values.map((value) => Math.round((value - OFFSET) / SCALE))
}

function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function parseTmfc(tmfc) {
  const raw = String(tmfc || '')
  if (!/^\d{10}$/.test(raw)) return null
  return Date.UTC(Number(raw.slice(0, 4)), Number(raw.slice(4, 6)) - 1, Number(raw.slice(6, 8)), Number(raw.slice(8, 10)))
}

export function addForecastHours(tmfc, hf) {
  const baseMs = parseTmfc(tmfc)
  if (!Number.isFinite(baseMs)) return null
  return new Date(baseMs + Number(hf || 0) * 60 * 60 * 1000).toISOString()
}

function validateComponents(components) {
  if (!Array.isArray(components) || components.length === 0) throw new Error('KIM NWP grid requires components')
  const [first] = components
  for (const component of components) {
    if (!component?.variable) throw new Error('KIM NWP component requires variable')
    if (component.nx !== first.nx || component.ny !== first.ny) throw new Error('KIM NWP component dimensions differ')
    if (component.values.length !== first.values.length) throw new Error('KIM NWP component value counts differ')
  }
}

export function buildKimNwpGrid({ model = KIM_NWP_MODEL, tmfc, hf, level, components, fetchedAt = new Date().toISOString() }) {
  validateComponents(components)
  const [first] = components
  const variables = Object.fromEntries(components.map((component) => [
    component.variable,
    { unit: component.unit || 'm/s', encoding: 'int16-scaled-json-v1', scale: SCALE, offset: OFFSET, values: encode(component.values) },
  ]))
  return {
    type: 'kim_nwp_grid',
    model,
    tmfc,
    hf,
    validTime: addForecastHours(tmfc, hf),
    level: { id: level.id, label: level.label, kind: level.kind, value: level.value, unit: level.unit },
    grid: { nx: first.nx, ny: first.ny, ...first.bounds },
    variables,
    fetched_at: fetchedAt,
  }
}

export function buildKimSurfaceWindFieldFromWindGrid(grid) {
  const u = grid.variables?.u
  const v = grid.variables?.v
  if (!u || !v) throw new Error('KIM surface wind field requires u and v variables')
  if (u.values.length !== v.values.length) throw new Error('KIM u/v value counts differ')

  let minSpeed = Infinity
  let maxSpeed = -Infinity
  let totalSpeed = 0
  for (let index = 0; index < u.values.length; index += 1) {
    const uValue = u.values[index] * u.scale + u.offset
    const vValue = v.values[index] * v.scale + v.offset
    const speed = Math.hypot(uValue, vValue)
    minSpeed = Math.min(minSpeed, speed)
    maxSpeed = Math.max(maxSpeed, speed)
    totalSpeed += speed
  }

  return {
    type: 'kim_surface_wind',
    model: grid.model,
    grid: grid.grid,
    time: { tmfc: grid.tmfc, hf: grid.hf, validTime: grid.validTime },
    level: grid.level,
    units: { u: 'm/s', v: 'm/s', speed: 'm/s' },
    stats: { minSpeed: round(minSpeed), maxSpeed: round(maxSpeed), meanSpeed: round(totalSpeed / u.values.length) },
    encoding: 'int16-scaled-json-v1',
    scale: u.scale,
    offset: u.offset,
    u: u.values,
    v: v.values,
    fetched_at: grid.fetched_at,
  }
}

export function buildKimNwpIndex({ model = KIM_NWP_MODEL, tmfc, grids, pathForGrid }) {
  const levelMap = new Map()
  const timeMap = new Map()
  const availability = {}

  for (const grid of grids) {
    levelMap.set(grid.level.id, grid.level)
    timeMap.set(Number(grid.hf), { hf: Number(grid.hf), validTime: grid.validTime })
    availability[grid.level.id] ||= {}
    availability[grid.level.id][String(grid.hf)] = {
      variables: Object.keys(grid.variables),
      path: pathForGrid(grid),
    }
  }

  return {
    type: 'kim_nwp_index',
    model,
    latestRun: tmfc,
    levels: KIM_NWP_LEVELS.filter((level) => levelMap.has(level.id)).map(({ id, label, kind, value, unit }) => ({ id, label, kind, value, unit })),
    times: [...timeMap.values()].sort((a, b) => a.hf - b.hf),
    availability,
  }
}
```

- [ ] **Step 4: Run model tests**

Run:

```bash
node --test backend/test/kim-nwp-model.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit model helper**

Run:

```bash
git add backend/src/processors/kim-nwp-model.js backend/test/kim-nwp-model.test.js
git commit -m "feat: model kim wind grids"
```

---

### Task 3: Backend Collection And API

**Files:**
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/server.js`
- Modify: `backend/src/store.js`
- Test: `backend/test/kim-surface-wind.test.js`

- [ ] **Step 1: Write collection tests**

Extend `backend/test/kim-surface-wind.test.js` to verify:

- run candidates still resolve latest synoptic cycles
- level definitions include 6 levels
- request plan expands to `6 levels x 13 forecast hours x 2 variables = 156` component requests
- selected grid converts to renderer-compatible field
- index omits encoded values and uses string hf keys
- backend exposure helper filters past valid times without deleting stored grids
- partial failure omits only the failed level/time pair when at least one usable `u/v` pair remains
- selected field route rejects invalid `tmfc`, `hf`, and `level`

- [ ] **Step 2: Update processor imports**

In `backend/src/processors/kim-surface-wind-processor.js`, use:

```js
import {
  KIM_NWP_FORECAST_HOURS,
  KIM_NWP_LEVELS,
  KIM_NWP_MODEL,
  buildKimSurfaceWindFieldFromWindGrid,
  buildKimNwpGrid,
  buildKimNwpIndex,
} from './kim-nwp-model.js'
import {
  buildKimNwpRunId,
  cleanupKimNwpRuns,
  readKimNwpGrid,
  resolveKimNwpGridPath,
  writeKimNwpGrid,
  writeKimNwpIndex,
  writeKimNwpLatest,
} from './kim-nwp-store.js'
```

- [ ] **Step 3: Add level-aware component fetch**

Replace fixed `level: 0` fetch with:

```js
async function fetchComponent({ name, level, tmfc, hf }) {
  const kim = config.kim_surface_wind
  const text = await fetchKimGrid({
    data: 'U',
    name,
    level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
  })
  return parseKimGridText(text, {
    variable: name,
    level,
    bounds: kim.bounds,
  })
}
```

- [ ] **Step 4: Add level/hour fetch helper**

```js
async function fetchWindGrid({ level, tmfc, hf }) {
  const [uComponent, vComponent] = await Promise.all([
    fetchComponent({ name: level.uName, level: level.level, tmfc, hf }),
    fetchComponent({ name: level.vName, level: level.level, tmfc, hf }),
  ])
  return buildKimNwpGrid({ model: KIM_NWP_MODEL, tmfc, hf, level, components: [
    { ...uComponent, variable: 'u' },
    { ...vComponent, variable: 'v' },
  ] })
}
```

- [ ] **Step 5: Add bounded pool helper**

Use a small local Promise pool for KIM API calls. Default concurrency: `4`.

```js
async function mapWithConcurrency(items, concurrency, worker) {
  const results = []
  let nextIndex = 0
  async function run() {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run))
  return results
}
```

- [ ] **Step 6: Implement run collection**

Update `process()`:

```js
export async function process() {
  const candidates = resolveKimSurfaceWindCandidates().map(({ tmfc }) => ({ tmfc }))
  let lastError = null

  for (const candidate of candidates) {
    const grids = []
    const tasks = []

    for (const hf of (config.kim_nwp?.forecast_hours || KIM_NWP_FORECAST_HOURS)) {
      for (const level of KIM_NWP_LEVELS) {
        tasks.push({ level, tmfc: candidate.tmfc, hf })
      }
    }

    await mapWithConcurrency(tasks, config.kim_nwp?.concurrency || 4, async (task) => {
        try {
          const grid = await fetchWindGrid(task)
          writeKimNwpGrid({ root: config.storage.base_path, grid })
          grids.push(grid)
        } catch (error) {
          lastError = error
        }
    })

    if (grids.length > 0) {
      const latestRunId = buildKimNwpRunId({ model: KIM_NWP_MODEL, tmfc: candidate.tmfc })
      const index = buildKimNwpIndex({
        model: KIM_NWP_MODEL,
        tmfc: candidate.tmfc,
        grids,
        pathForGrid: (grid) => path.relative(
          config.storage.base_path,
          resolveKimNwpGridPath({
            root: config.storage.base_path,
            model: grid.model,
            tmfc: grid.tmfc,
            hf: grid.hf,
            levelId: grid.level.id,
          }),
        ).replace(/\\/g, '/'),
      })
      writeKimNwpIndex(config.storage.base_path, index)
      writeKimNwpLatest(config.storage.base_path, {
        type: 'kim_nwp_latest',
        model: KIM_NWP_MODEL,
        latestRun: candidate.tmfc,
        latestRunId,
        indexPath: 'kim_nwp/index.json',
        updated_at: new Date().toISOString(),
      })
      cleanupKimNwpRuns({ root: config.storage.base_path, maxRuns: config.kim_nwp?.max_runs || 2, latestRunId })
      return { type: 'kim_nwp', saved: true, tmfc: candidate.tmfc, fields: grids.length }
    }
  }

  throw lastError || new Error('KIM wind collection failed')
}
```

Adjust exact code to existing module style; keep path import explicit.

- [ ] **Step 7: Keep compatibility field helper**

Add exported helper:

```js
export function readSelectedKimNwpField({ tmfc, hf, level }) {
  const grid = readKimNwpGrid({ root: config.storage.base_path, model: KIM_NWP_MODEL, tmfc, hf, levelId: level })
  return buildKimSurfaceWindFieldFromWindGrid(grid)
}
```

`readKimNwpGrid()` must already exist from Task 1.

- [ ] **Step 8: Add server routes**

In `backend/server.js`:

```js
function filterKimNwpIndexForMap(index, nowMs = Date.now()) {
  const exposedTimes = (index?.times || []).filter((time) => {
    const validMs = Date.parse(time.validTime)
    return Number.isFinite(validMs) && validMs >= nowMs
  })
  const exposedHfs = new Set(exposedTimes.map((time) => String(time.hf)))
  const availability = {}
  for (const [levelId, byHf] of Object.entries(index?.availability || {})) {
    for (const [hf, entry] of Object.entries(byHf || {})) {
      if (!exposedHfs.has(String(hf))) continue
      availability[levelId] ||= {}
      availability[levelId][String(hf)] = entry
    }
  }
  const levels = (index?.levels || []).filter((level) => availability[level.id])
  return { ...index, levels, times: exposedTimes, availability }
}

function filterKimNwpIndexForVariables(index, requiredVariables) {
  const availability = {}
  for (const [levelId, byHf] of Object.entries(index?.availability || {})) {
    for (const [hf, entry] of Object.entries(byHf || {})) {
      const variables = entry?.variables || []
      if (!requiredVariables.every((name) => variables.includes(name))) continue
      availability[levelId] ||= {}
      availability[levelId][String(hf)] = entry
    }
  }
  const availableHfs = new Set(Object.values(availability).flatMap((byHf) => Object.keys(byHf)))
  return {
    ...index,
    levels: (index?.levels || []).filter((level) => availability[level.id]),
    times: (index?.times || []).filter((time) => availableHfs.has(String(time.hf))),
    availability,
  }
}

app.get('/api/kim/wind/index', (_req, res) => {
  const data = readJsonFileSafe(path.join(DATA_ROOT, 'kim_nwp', 'index.json'))
  if (data) return res.json(filterKimNwpIndexForVariables(filterKimNwpIndexForMap(data), ['u', 'v']))
  res.status(503).json({ error: 'kim wind index unavailable' })
})
```

The index route must filter response `times`, `levels`, and `availability` before returning JSON. Do not delete past grids from disk; this is only the map UI exposure contract. Wind index exposure must require both `u` and `v` so later Temp-only entries in the shared index cannot appear as selectable wind fields.

Add selected field route using safe store helper path resolution.

Update `/api/kim/surface-wind` to accept optional `tmfc/hf/level` query or return default selected field.

- [ ] **Step 9: Update snapshot meta**

In `buildSnapshotMeta()`, add `kimNwp` and `kim_nwp` based on `kim_nwp/latest.json`, including `kimNwp.variables.uv.hash` for wind-specific refresh.

Keep existing `kimWind`, `kimSurfaceWind`, `kim_wind`, and `kim_surface_wind` aliases during migration.

- [ ] **Step 10: Update Architecture.md**

Add concise file-role entries for:

- `backend/src/processors/kim-nwp-store.js`
- `backend/src/processors/kim-nwp-model.js`
- `backend/test/kim-nwp-store.test.js`
- `backend/test/kim-nwp-model.test.js`
- `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js`

- [ ] **Step 11: Run backend tests**

Run:

```bash
node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js
```

Expected: PASS.

- [ ] **Step 12: Commit backend collection/API**

Run:

```bash
git add backend/src/processors/kim-surface-wind-processor.js backend/server.js backend/src/store.js backend/test/kim-surface-wind.test.js
git commit -m "feat: collect kim wind time level fields"
```

---

### Task 4: Frontend Selection Hook And API

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Modify: `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js`
- Create: `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js`

- [ ] **Step 1: Write hook tests**

Create tests for pure helpers exported from `useKimSurfaceWind.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeKimNwpIndex,
  selectDefaultKimNwp,
  selectKimNwpAvailability,
} from './useKimSurfaceWind.js'

const INDEX = {
  type: 'kim_nwp_index',
  latestRun: '2026051900',
  levels: [
    { id: '10m', label: '10m', kind: 'height', value: 10, unit: 'm' },
    { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa' },
  ],
  times: [
    { hf: 0, validTime: '2026-05-19T00:00:00.000Z' },
    { hf: 3, validTime: '2026-05-19T03:00:00.000Z' },
  ],
  availability: {
    '10m': { 0: { variables: ['u', 'v'] } },
    '925hPa': { 3: { variables: ['u', 'v'] } },
  },
}

test('selectDefaultKimNwp prefers 10m and earliest available time', () => {
  assert.deepEqual(selectDefaultKimNwp(INDEX), { tmfc: '2026051900', level: '10m', hf: 0 })
})

test('selectKimNwpAvailability returns null for missing level time pair', () => {
  assert.equal(selectKimNwpAvailability(INDEX, { level: '925hPa', hf: 0 }), null)
  assert.deepEqual(selectKimNwpAvailability(INDEX, { level: '925hPa', hf: 3 }), { variables: ['u', 'v'] })
})

test('normalizeKimNwpIndex exposes levels and times', () => {
  const normalized = normalizeKimNwpIndex(INDEX)
  assert.equal(normalized.availableLevels.length, 2)
  assert.equal(normalized.availableTimes.length, 2)
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js
```

Expected: FAIL until helper exports exist.

- [ ] **Step 3: Add API helpers**

In `frontend/src/api/weatherApi.js`:

```js
export async function fetchKimNwpIndex() {
  return fetchJson('/api/kim/wind/index')
}

export async function fetchKimNwpField({ tmfc, hf, level }) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/wind/field?${params.toString()}`)
}
```

Keep `fetchKimSurfaceWind()`.

- [ ] **Step 4: Add hook helpers**

Export:

```js
export function selectKimNwpAvailability(index, selection) {
  if (!index || !selection?.level || !Number.isFinite(Number(selection.hf))) return null
  return index.availability?.[selection.level]?.[String(selection.hf)] || null
}

export function selectDefaultKimNwp(index) {
  const preferredLevel = index?.levels?.find((level) => level.id === '10m') || index?.levels?.[0]
  if (!preferredLevel) return null
  const time = (index.times || []).find((candidate) =>
    selectKimNwpAvailability(index, { level: preferredLevel.id, hf: candidate.hf }))
  return time ? { tmfc: index.latestRun, level: preferredLevel.id, hf: time.hf } : null
}

export function normalizeKimNwpIndex(index) {
  return {
    windIndex: index || null,
    availableLevels: index?.levels || [],
    availableTimes: index?.times || [],
    defaultSelection: selectDefaultKimNwp(index),
  }
}
```

- [ ] **Step 5: Update hook runtime**

`useKimSurfaceWind(enabled)` should:

- fetch index first when enabled
- set default selection if none exists
- fetch selected field only
- set `windField` from selected response
- keep existing old `/api/kim/surface-wind` fallback if index route is unavailable
- refetch index when snapshot meta `kimNwp.variables.uv.hash` changes, falling back to `kimNwp.hash`
- keep selected field responses in a `Map` cache keyed by `tmfc:hf:level`
- abort in-flight selected field fetches when selection changes
- use a request token to ignore stale responses that complete after a newer selection

- [ ] **Step 6: Run hook tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit hook/API**

Run:

```bash
git add frontend/src/api/weatherApi.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js
git commit -m "feat: fetch selected kim wind fields"
```

---

### Task 5: Shared Map NWP Time And Level Controls

**Files:**
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Add: `frontend/src/features/weather-overlays/NwpSliderBar.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `frontend/src/features/map/MapView.css`

- [ ] **Step 1: Keep Wind panel compact**

Do not add time or level controls inside `WeatherOverlayPanel.jsx`.

The Wind block in the left panel should keep only:

- Wind master toggle
- Flow toggle
- Tone, Trail, Width controls when Flow is enabled
- Speed toggle
- loading/error/low-power status text

Remove or avoid:

- panel-level segmented buttons;
- panel-level time `<select>`;
- selected KIM meta text inside the panel.

- [ ] **Step 2: Add shared map slider component**

Create `frontend/src/features/weather-overlays/NwpSliderBar.jsx`.

The component owns only UI formatting and selection callbacks. It does not fetch data and does not decode fields.

Props:

```js
isVisible,
levels,
times,
selection,
availability,
isElevated,
onSelectionChange,
```

Behavior:

- render a bottom transparent time range slider when the selected level has more than one available time;
- render a right-side vertical level range slider when more than one level is available;
- keep the level slider visible even when only one future time remains;
- show date on the first time tick and when the date changes, otherwise show time only;
- if the selected level does not have the current `hf`, select the first available `hf` for the new level;
- render nothing when no Wind/Temp NWP layer is active or no selectable values exist.

- [ ] **Step 3: Add shared selection state contract**

Keep one `tmfc + hf + level` selection for NWP map overlays. Wind uses it in this phase; Temp will reuse it later.

Preferred shape:

```js
{
  tmfc,
  hf,
  level
}
```

For the wind-only phase this may live in `useKimSurfaceWind`, but the API must make it easy to lift into a shared `useNwpSelection` helper before Temp is added. Do not let Wind and Temp hooks keep independent selected time/level state in the Temp phase.

- [ ] **Step 4: Add map overlay CSS**

Add CSS near map overlay controls:

- bottom transparent time slider;
- right vertical level slider;
- compact tick labels;
- responsive rules so the time slider does not overflow narrow viewports;
- no panel-specific `.wind-select-control` or `.wind-level-segment` CSS.

- [ ] **Step 5: Wire MapView only**

Pass:

```jsx
<NwpSliderBar
  isVisible={enableWindOverlay && metVisibility.wind}
  levels={kimSurfaceWind.availableLevels}
  times={kimSurfaceWind.availableTimes}
  selection={kimSurfaceWind.selection}
  availability={kimSurfaceWind.windIndex?.availability}
  isElevated={weatherTimelineVisible}
  onSelectionChange={kimSurfaceWind.setSelection}
/>
```

`MapView.jsx` remains high-level wiring only. It may render the shared slider next to `WeatherTimelineBar`, but it must not parse indexes, fetch fields, decode grids, or render raster data directly.

- [ ] **Step 6: Run frontend tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS.

- [ ] **Step 7: Commit UI controls**

Run:

```bash
git add frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx frontend/src/features/weather-overlays/NwpSliderBar.jsx frontend/src/features/map/MapView.jsx frontend/src/features/map/MapView.css
git commit -m "feat: add kim wind time level controls"
```

---

### Task 6: Renderer Metadata Preservation

**Files:**
- Modify: `frontend/src/features/weather-overlays/lib/windField.js`
- Modify: `frontend/src/features/weather-overlays/lib/windField.test.js`

- [ ] **Step 1: Add label tests**

Add tests:

```js
test('formatKimWindMetaLabel renders selected pressure level', () => {
  const field = {
    time: { validTime: '2026-05-18T03:00:00.000Z' },
    level: { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa' },
  }
  assert.equal(formatKimWindMetaLabel(field), 'KIM 8km · 925hPa · 05/18 12:00 KST')
})

test('formatKimWindMetaLabel falls back to 10m when level metadata is missing', () => {
  assert.equal(formatKimWindMetaLabel({ time: { validTime: '2026-05-18T03:00:00.000Z' } }), 'KIM 8km · 10m · 05/18 12:00 KST')
})

test('wind speed color ramp uses one kt scale through upper-air winds', () => {
  assert.deepEqual(WIND_SPEED_COLOR_RAMP.map((entry) => entry.label), [
    '0-5 kt',
    '5-10 kt',
    '10-20 kt',
    '20-30 kt',
    '30-40 kt',
    '40-60 kt',
    '60-80 kt',
    '80-100 kt',
    '100-130 kt',
    '130+ kt',
  ])
})
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/windField.test.js
```

Expected: FAIL if label still hard-codes `10m`.

- [ ] **Step 3: Implement label formatting**

Add helper:

```js
function formatWindLevelLabel(field) {
  const level = field?.level
  if (!level?.id) return '10m'
  if (level.unit === 'hPa') return `${level.value}hPa`
  if (level.unit === 'm') return `${level.value}m`
  return level.label || level.id
}
```

Use it inside `formatKimWindMetaLabel()`.

- [ ] **Step 4: Run wind tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit metadata changes**

Run:

```bash
git add frontend/src/features/weather-overlays/lib/windField.js frontend/src/features/weather-overlays/lib/windField.test.js
git commit -m "feat: label selected kim wind level"
```

---

### Task 7: Verification

**Files:**
- No planned source changes.

- [ ] **Step 1: Run backend tests**

Run:

```bash
node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js
```

Expected: PASS.

- [ ] **Step 2: Run frontend wind tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js
```

Expected: PASS.

- [ ] **Step 3: Run frontend build**

Run:

```bash
npm.cmd run build --prefix frontend
```

Expected: PASS.

- [ ] **Step 4: Browser smoke**

Run:

```bash
npm.cmd run dev
```

Manual checks:

- Open `http://localhost:5173`.
- Turn on Wind.
- Confirm Speed is on by default.
- Confirm Flow animation is visible.
- Change time.
- Change level.
- Confirm Flow and Speed update to selected field.
- Confirm the speed legend uses the same kt bins at `10m` and pressure levels.
- Confirm Flow off removes animation.
- Confirm Speed off removes speed layer.
- Switch basemap twice.
- Confirm selected field remains active.

- [ ] **Step 5: API smoke**

With the backend running and at least one KIM NWP run available:

```bash
curl http://127.0.0.1:3001/api/kim/wind/index
curl "http://127.0.0.1:3001/api/kim/wind/field?tmfc=<latestRun>&hf=<hf>&level=<level>"
curl http://127.0.0.1:3001/api/snapshot-meta
```

Expected:

- index response contains no `values`
- selected field response has `type: "kim_surface_wind"`
- invalid `level=../bad` returns a 4xx response
- snapshot meta includes `kimNwp` plus compatibility aliases

## Risks And Constraints

- Pressure-level KIM variable names may differ from assumed `u/v`. If unavailable, omit the level/time pair instead of showing a broken option.
- Fetching one run at full scope is `6 levels x 13 forecast hours x 2 variables = 156 component requests`; collector must run under the existing `kim_surface_wind` lock and use bounded concurrency, default `4`.
- `latest.json` and `index.json` must not contain encoded grid values.
- `grid.json`, `latest.json`, and `index.json` must use atomic temp-file-plus-rename writes because future route samplers may read while collection is running.
- Failed collection must not delete the previous usable run.
- Cleanup must preserve the current `latestRunId` even if lexical sorting would otherwise delete it.
- Do not implement `T/hgt` in this phase.
- `MapView.jsx` must remain high-level wiring only.
- Existing WebGL renderer, Canvas fallback, sampler, Speed layer, Flow toggle, and performance controls must remain compatible with one selected field object.
- The shared kt speed scale reduces confusion across levels, but 10m low-speed detail will be less granular than the current 10m-only ramp.
- Route briefing time interpolation and vertical interpolation remain future work; this phase only ensures the stored grid shape does not block them.

## Self-Review

- Spec coverage: This plan covers wind-only time/level expansion, `kim_nwp` canonical storage, bounded retention, API index/field split, frontend selectors, animation/speed layer preservation, shared kt speed scale, and route briefing readiness.
- Placeholder scan: No `TBD` remains. KIM variable uncertainty is handled by availability omission. Time and vertical interpolation are explicitly out of scope and assigned to future route/vertical-section phases.
- Type consistency: The plan consistently uses `kim_nwp`, `tmfc`, `hf`, `validTime`, `level.id`, `variables.u/v`, `index`, and selected renderer-compatible `kim_surface_wind` fields.
