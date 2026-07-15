# KIM Cloud Potential Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a KIM NWP moisture/cloud-potential map overlay using temperature-dewpoint spread, rendered as stepped green moist-area shading.

**Architecture:** Extend the existing `DATA_PATH/kim_nwp/` canonical grid by adding moisture-level `rh` alongside existing `T`, then derive dewpoint spread at API/render time. Keep storage variable-oriented, keep `MapView.jsx` as wiring only, and put field decoding/rendering under `frontend/src/features/weather-overlays/lib/`.

**Tech Stack:** Node/Express backend, KMA APIHub KIM `nph-kim_nc_xy_txt2`, existing KIM grid parser/store/model, React/Vite, Mapbox image raster overlay, Node test runner.

**Spec:** `docs/superpowers/specs/2026-05-20-kim-cloud-potential-layer.md`

---

## Post-Implementation Amendments

These amendments supersede the earlier task snippets below where they differ:

- The layer is presented in UI as `Moisture`, not `Cloud`, while API names remain `/api/kim/cloud/*` for compatibility.
- `rh` collection is limited to `925hPa`, `850hPa`, `700hPa`, and `500hPa`; `10m` and `300hPa` are excluded from the moisture-area layer.
- `T` collection remains unchanged for the temperature layer.
- Thresholds are level-dependent: `T - Td <= 4 C` for `925/850/700hPa`, and `T - Td <= 6 C` for `500hPa`.
- Rendering uses decoded `spread` values and stepped green opacity. `cloudPotential` remains in the field payload as a graded compatibility score, not the primary raster input.
- KIM NWP scheduled collection uses `00/06/12/18 UTC` with `+1h/+2h` retry windows at minute 12 and an explicit UTC cron timezone.
- Scheduled retry work skips when the latest run is already complete for required variables: `u/v/T` for all configured KIM NWP levels and `rh` for moisture-analysis levels.
- Map indexes expose the nearest past valid time plus future valid times so recently passed forecast times remain selectable.

## Evidence And Assumptions

- Existing outline: `docs/superpowers/specs/2026-05-18-kim-nwp-weather-layers-outline.md` Phase 4 already defines cloud potential using `T/rh` and `T - Td`.
- Existing temperature design: `docs/superpowers/specs/2026-05-19-kim-temp-layer-design.md` added `T` to the shared `kim_nwp` store.
- Live API probe on 2026-05-20 KST:
  - `tmfc=2026052000` returned `file is not exist`.
  - `tmfc=2026051918`, `data=P`, `level=850`, `hf=0` returned usable grids for `rh`, `cld`, `cldbulk`, `tqc`, and `tqi`.
  - `T/rh/cld` parsed as `205 x 169` for levels 925/850/700/500.
- Sample `T - Td <= 3 C` hit rates at `tmfc=2026051918`, `hf=0`:
  - 925hPa: 55.3% spread hit, 45.3% `cld > 0`
  - 850hPa: 48.7% spread hit, 49.3% `cld > 0`
  - 700hPa: 45.8% spread hit, 58.5% `cld > 0`
  - 500hPa: 41.8% spread hit, 56.3% `cld > 0`

Assumption: the user phrase `T-Td>=3 기준` means “use 3 C as the spread threshold.” For cloud-possible areas the meteorological condition is `T - Td <= 3 C`. Implementing `>= 3 C` would mark drier air and is not the intended cloud-potential product.

## Scope

In scope:

- Moisture-analysis pressure levels only: `925hPa`, `850hPa`, `700hPa`, `500hPa`.
- Forecast hours already configured in `KIM_NWP_FORECAST_HOURS`.
- Fetch and store KIM `rh` in existing `grid.json` as `variables.rh`.
- Derive dewpoint, spread, and graded moisture score from `T + rh`.
- Add `GET /api/kim/cloud/index`.
- Add `GET /api/kim/cloud/field?tmfc=...&hf=...&level=...`.
- Add frontend API helpers, hook, raster renderer, legend, and MET panel toggle.
- Keep Wind, Temp, and Moisture mutually exclusive for the first phase.

Out of scope:

- Route briefing cloud risk bands.
- Time interpolation.
- Vertical interpolation.
- Icing potential.
- Persisting `Td` or cloud mask as separate grid files.
- Using `cld/cldbulk/tqc/tqi` as the primary criterion. They are verified available, but this phase uses them only for future QC.
- `10m` and `300hPa` moisture/cloud potential. Dewpoint/cloud probability on model moisture-analysis pressure levels is the useful first product.

## File Structure

- Modify `backend/src/processors/kim-nwp-model.js`: RH component support, dewpoint/spread math, cloud field response builder, cloud index filtering.
- Modify `backend/src/processors/kim-surface-wind-processor.js`: fetch `rh` after wind/temp collection and merge it into each pressure-level grid.
- Modify `backend/server.js`: cloud index/field routes and snapshot meta `kimNwp.variables.cloud`.
- Modify `backend/test/kim-nwp-model.test.js`: model math and response-shape tests.
- Modify `backend/test/kim-surface-wind.test.js`: RH request parameters and partial failure behavior.
- Modify `frontend/src/api/weatherApi.js`: cloud index/field fetch helpers.
- Create `frontend/src/features/weather-overlays/lib/cloudPotentialField.js`: decode spread/mask, color ramp, sampler, labels.
- Create `frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.js`: Mapbox image overlay lifecycle.
- Create `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js`: index/field hook matching Temp race-safety behavior.
- Add tests next to the new frontend files.
- Modify `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`: add Cloud toggle.
- Modify `frontend/src/features/weather-overlays/WeatherLegends.jsx`: cloud legend.
- Modify `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`: Wind/Temp/Cloud mutual exclusion.
- Modify `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`: MET layer definition.
- Modify `frontend/src/features/map/MapView.jsx`: high-level hook/sync/legend/slider wiring only.
- Modify `Architecture.md`: file-role updates after implementation.

## Subagent Execution Map

Use `superpowers:subagent-driven-development` for implementation unless the user explicitly chooses inline execution. The main agent remains the orchestrator and owns integration points.

- Task 1 can go to an `implementer`: backend model and tests only.
- Task 2 can go to an `implementer`: KIM processor and processor tests only.
- Task 3 should be main-agent owned: `backend/server.js` route registration and snapshot meta are integration points.
- Task 4 can go to an `implementer`: frontend cloud field/overlay helpers and tests only.
- Task 5 should be main-agent owned or split carefully: `MapView.jsx` and shared MET visibility wiring are integration points. If delegated, give the implementer a narrow write set and keep final wiring in the main agent.
- Task 6 should be main-agent owned: verification, browser smoke, and `Architecture.md` update.

After each implementation task, request a `reviewer` pass before moving on. Before final completion, request `spec-reviewer` for spec compliance and `test-gap-finder` for missing verification. Use `ui-qa-reviewer` after the browser smoke if Cloud overlay UI or Mapbox rendering changes are visible.

---

### Task 1: Cloud Math And Field Model

**Files:**
- Modify: `backend/src/processors/kim-nwp-model.js`
- Modify: `backend/test/kim-nwp-model.test.js`

- [x] **Step 1: Write failing model tests**

Add tests to `backend/test/kim-nwp-model.test.js`:

```js
test('buildKimCloudPotentialFieldFromGrid derives spread and mask from T and rh', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    hf: 3,
    level: KIM_NWP_LEVELS[2],
    components: [
      tempComponent([293.15, 293.15, 293.15, Number.NaN]),
      { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 60, 100, 80] },
    ],
  })

  const field = buildKimCloudPotentialFieldFromGrid(grid)

  assert.equal(field.type, 'kim_nwp_cloud_potential')
  assert.deepEqual(field.units, { spread: 'C', cloudPotential: '%' })
  assert.equal(field.thresholdC, 3)
  assert.equal(field.cloudPotential[0], 10000)
  assert.equal(field.cloudPotential[1], 0)
  assert.equal(field.cloudPotential[2], 10000)
  assert.equal(field.cloudPotential[3], -32768)
})

test('filterKimNwpIndexForVariables exposes cloud grids only when T and rh exist', () => {
  const index = buildKimNwpIndex({
    model: 'KIMG/NE57',
    tmfc: '2026051900',
    grids: [
      buildKimNwpGrid({ model: 'KIMG/NE57', tmfc: '2026051900', hf: 0, level: KIM_NWP_LEVELS[1], components: [tempComponent([279, 280, 281, 282])] }),
      buildKimNwpGrid({ model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, level: KIM_NWP_LEVELS[2], components: [tempComponent([279, 280, 281, 282]), { variable: 'rh', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 80, 70, 60] }] }),
    ],
    pathForGrid: (grid) => `kim_nwp/${grid.level.id}/${grid.hf}/grid.json`,
  })

  const cloudIndex = filterKimNwpIndexForVariables(index, ['T', 'rh'])
  assert.deepEqual(cloudIndex.levels.map((level) => level.id), ['850hPa'])
  assert.deepEqual(cloudIndex.availability['850hPa']['3'].variables, ['T', 'rh'])
})
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
node --test backend/test/kim-nwp-model.test.js
```

Expected: FAIL because `buildKimCloudPotentialFieldFromGrid` does not exist.

- [x] **Step 3: Implement dewpoint and cloud field helpers**

Add to `backend/src/processors/kim-nwp-model.js`:

```js
function dewpointCFromTempRh(tempK, rhPct) {
  if (!Number.isFinite(tempK) || !Number.isFinite(rhPct)) return Number.NaN
  const tempC = tempK - 273.15
  const rh = Math.max(1e-6, Math.min(100, rhPct))
  const a = 17.625
  const b = 243.04
  const gamma = Math.log(rh / 100) + (a * tempC) / (b + tempC)
  return (b * gamma) / (a - gamma)
}

function statsForSpread(values) {
  let minSpread = Infinity
  let maxSpread = -Infinity
  let total = 0
  let count = 0
  for (const value of values) {
    if (!Number.isFinite(value)) continue
    minSpread = Math.min(minSpread, value)
    maxSpread = Math.max(maxSpread, value)
    total += value
    count += 1
  }
  return count > 0
    ? { minSpread: round(minSpread), maxSpread: round(maxSpread), meanSpread: round(total / count) }
    : { minSpread: null, maxSpread: null, meanSpread: null }
}

export function buildKimCloudPotentialFieldFromGrid(grid, { thresholdC = 3 } = {}) {
  const tempVariable = grid?.variables?.T
  const rhVariable = grid?.variables?.rh
  if (!tempVariable || !rhVariable) throw new Error('KIM NWP grid is missing T/rh variables')
  const tempValues = decodeComponent(tempVariable.values || [], tempVariable)
  const rhValues = decodeComponent(rhVariable.values || [], rhVariable)
  const spread = []
  const cloudPotential = []
  for (let index = 0; index < tempValues.length; index += 1) {
    const tdC = dewpointCFromTempRh(tempValues[index], rhValues[index])
    const tempC = tempValues[index] - 273.15
    const value = Number.isFinite(tdC) ? tempC - tdC : Number.NaN
    spread.push(value)
    cloudPotential.push(Number.isFinite(value) ? (value <= thresholdC ? 100 : 0) : Number.NaN)
  }
  return {
    type: 'kim_nwp_cloud_potential',
    model: grid.model,
    grid: grid.grid,
    time: { tmfc: grid.tmfc, hf: grid.hf, validTime: grid.validTime },
    level: grid.level,
    thresholdC,
    units: { spread: 'C', cloudPotential: '%' },
    stats: statsForSpread(spread),
    encoding: 'int16-scaled-json-v1',
    scale: 0.01,
    offset: 0,
    spread: encodeComponent(spread),
    cloudPotential: encodeComponent(cloudPotential),
    fetched_at: grid.fetched_at,
  }
}
```

Also export it in the default export.

- [x] **Step 4: Run model tests**

Run:

```bash
node --test backend/test/kim-nwp-model.test.js
```

Expected: PASS.

---

### Task 2: RH Collection Into Existing KIM NWP Grids

**Files:**
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/test/kim-surface-wind.test.js`

- [x] **Step 1: Write failing processor tests**

Add tests to `backend/test/kim-surface-wind.test.js`:

```js
test('resolveKimHumidityComponentRequest uses pressure rh params and skips 10m', () => {
  assert.equal(resolveKimHumidityComponentRequest({ level: { id: '10m', kind: 'height', level: 0 } }), null)
  assert.deepEqual(resolveKimHumidityComponentRequest({ level: { id: '850hPa', kind: 'pressure', level: 850 } }), {
    data: 'P',
    name: 'rh',
    level: 850,
    variable: 'rh',
    unit: '%',
  })
})

test('shouldPublishKimNwpRun allows rh-missing wind/temp grids', () => {
  assert.equal(shouldPublishKimNwpRun({
    expectedGridCount: 1,
    grids: [{ variables: { u: {}, v: {}, T: {} } }],
  }), true)
})
```

- [x] **Step 2: Run test and verify failure**

Run:

```bash
node --test backend/test/kim-surface-wind.test.js
```

Expected: FAIL because `resolveKimHumidityComponentRequest` does not exist.

- [x] **Step 3: Add RH request resolver and merge helper**

In `backend/src/processors/kim-surface-wind-processor.js`, add:

```js
export function resolveKimHumidityComponentRequest({ level }) {
  if (level?.kind !== 'pressure') return null
  return { data: 'P', name: 'rh', level: level.level, variable: 'rh', unit: '%' }
}
```

Update `rawComponentFileName()` before writing RH raw payloads so humidity does not overwrite `v.txt`:

```js
function rawComponentFileName({ level, name, variable }) {
  if (variable === 'T') return 'T.txt'
  if (variable === 'rh') return 'rh.txt'
  return `${name === level.uName ? 'u' : 'v'}.txt`
}
```

Add an RH fetch helper parallel to `fetchTemperatureComponent`:

```js
async function fetchHumidityComponent({ level, tmfc, hf }) {
  const request = resolveKimHumidityComponentRequest({ level })
  if (!request) return null
  const kim = config.kim_surface_wind
  const text = await fetchKimGrid({
    data: request.data,
    name: request.name,
    level: request.level,
    tmfc,
    hf,
    sub: kim.sub,
    map: 'S',
    disp: 'A',
  })
  writeRawComponent({ level, tmfc, hf, name: request.name, variable: 'rh', text })
  const grid = parseKimGridText(text, { variable: request.name, level: request.level, bounds: kim.bounds })
  return { ...grid, variable: request.variable, unit: request.unit }
}
```

Add `addHumidityToGrid`:

```js
async function addHumidityToGrid({ grid, level, tmfc, hf }) {
  const component = await fetchHumidityComponent({ level, tmfc, hf })
  if (!component) return grid
  validateGridBounds(component)
  return {
    ...grid,
    variables: {
      ...grid.variables,
      rh: buildKimNwpGrid({
        model: KIM_NWP_MODEL,
        tmfc,
        hf,
        level,
        components: [component],
        fetchedAt: grid.fetched_at,
      }).variables.rh,
    },
    fetched_at: new Date().toISOString(),
  }
}
```

- [x] **Step 4: Insert RH after Temp in collection**

In `process()`, after `addTemperatureToGrid`, add:

```js
try {
  grid = await addHumidityToGrid({ grid, ...task })
  writeKimNwpGrid({ root: config.storage.base_path, grid })
} catch (error) {
  lastError = error
}
```

RH failure must be partial: it omits cloud availability for that grid but must not prevent wind/temp publication.

- [x] **Step 5: Run backend tests**

Run:

```bash
node --test backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js backend/test/kim-nwp-store.test.js
```

Expected: PASS.

---

### Task 3: Cloud API And Snapshot Meta

**Files:**
- Modify: `backend/server.js`

- [x] **Step 1: Add imports**

Add `buildKimCloudPotentialFieldFromGrid` to the existing model import in `backend/server.js`.

- [x] **Step 2: Add cloud field reader**

Add near `readSelectedKimTempField`:

```js
function readSelectedKimCloudField(selection) {
  validateKimNwpSelection({ tmfc: selection.tmfc, hf: selection.hf, levelId: selection.level })
  const grid = readKimNwpGrid({
    root: DATA_ROOT,
    model: 'KIMG/NE57',
    tmfc: selection.tmfc,
    hf: Number(selection.hf),
    levelId: selection.level,
  })
  return buildKimCloudPotentialFieldFromGrid(grid)
}
```

- [x] **Step 3: Add routes**

Add:

```js
app.get('/api/kim/cloud/index', (_req, res) => {
  const index = readKimNwpIndex(DATA_ROOT)
  if (index) {
    res.json({
      ...filterKimNwpIndexForVariables(filterKimNwpIndexForMap(index), ['T', 'rh']),
      type: 'kim_nwp_cloud_index',
    })
    return
  }
  res.status(503).json({ error: 'kim cloud index unavailable' })
})

app.get('/api/kim/cloud/field', (req, res) => {
  try {
    const selection = {
      tmfc: String(req.query.tmfc || ''),
      hf: Number(req.query.hf),
      level: String(req.query.level || ''),
    }
    res.json(readSelectedKimCloudField(selection))
  } catch (error) {
    res.status(400).json({ error: error.message || 'invalid kim cloud selection' })
  }
})
```

- [x] **Step 4: Add variable hash**

In `buildKimNwpSnapshotEntry()`, add:

```js
const cloudIndex = index ? filterKimNwpIndexForVariables(index, ['T', 'rh']) : null
```

and:

```js
cloud: { hash: cloudIndex ? store.canonicalHash(cloudIndex) : null },
```

- [x] **Step 5: API smoke after backend run**

Run:

```bash
curl http://127.0.0.1:3001/api/kim/cloud/index
curl "http://127.0.0.1:3001/api/kim/cloud/field?tmfc=<latestRun>&hf=<hf>&level=850hPa"
curl http://127.0.0.1:3001/api/snapshot-meta
```

Expected:

- index contains no `values`.
- field has `type: "kim_nwp_cloud_potential"`.
- field has `spread` and `cloudPotential`, not raw `T/rh`.
- invalid `level=../bad` returns 400.
- snapshot meta includes `kimNwp.variables.cloud.hash`.

---

### Task 4: Frontend Cloud Field And Renderer

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/cloudPotentialField.js`
- Create: `frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js`
- Create: `frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.js`
- Create: `frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js`

- [x] **Step 1: Write field tests**

Create `cloudPotentialField.test.js`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import { CLOUD_POTENTIAL_COLOR_RAMP, decodeCloudPotentialValue, decodeSpreadValue, pickCloudPotentialColor } from './cloudPotentialField.js'

const FIELD = { encoding: 'int16-scaled-json-v1', scale: 0.01, offset: 0 }

test('decodes spread and cloud potential sentinel values', () => {
  assert.equal(decodeSpreadValue(250, FIELD), 2.5)
  assert.equal(decodeSpreadValue(-32768, FIELD), null)
  assert.equal(decodeCloudPotentialValue(10000, FIELD), 100)
})

test('cloud potential ramp marks possible areas blue-white and dry areas transparent', () => {
  assert.equal(CLOUD_POTENTIAL_COLOR_RAMP[0].label, 'Possible')
  assert.equal(pickCloudPotentialColor(100).alpha > pickCloudPotentialColor(0).alpha, true)
})
```

- [x] **Step 2: Implement field helper**

Create `cloudPotentialField.js`:

```js
export const CLOUD_POTENTIAL_COLOR_RAMP = [
  { min: 1, max: 100, label: 'Possible', color: 'rgba(214, 240, 255, 0.58)', alpha: 0.58 },
  { min: 0, max: 1, label: 'Unlikely', color: 'rgba(214, 240, 255, 0)', alpha: 0 },
]

export function decodeScaledValue(value, field) {
  if (!Number.isFinite(value) || value === -32768) return null
  if (field?.encoding === 'int16-scaled-json-v1') return Math.round((value * (field.scale ?? 1) + (field.offset ?? 0)) * 100) / 100
  return value
}

export function decodeSpreadValue(value, field) {
  return decodeScaledValue(value, field)
}

export function decodeCloudPotentialValue(value, field) {
  return decodeScaledValue(value, field)
}

export function pickCloudPotentialColor(value) {
  const possible = Number(value) >= 1
  return possible ? CLOUD_POTENTIAL_COLOR_RAMP[0] : CLOUD_POTENTIAL_COLOR_RAMP[1]
}
```

- [x] **Step 3: Write sync test**

Pattern it after `temperatureOverlaySync.test.js`, asserting an image source/layer is created, hidden, and destroyed.

- [x] **Step 4: Implement sync helper**

Create `cloudPotentialOverlaySync.js` by following `temperatureOverlaySync.js`, with IDs:

```js
const CLOUD_IMAGE_SOURCE_ID = 'kim-cloud-potential-image-source'
const CLOUD_IMAGE_LAYER_ID = 'kim-cloud-potential-image-layer'
```

Use `field.cloudPotential` for opacity/color and render missing cells transparent.

- [x] **Step 5: Run frontend field/sync tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js
```

Expected: PASS.

---

### Task 5: Frontend API, Hook, UI Wiring

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Create: `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js`
- Create: `frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js`
- Modify: `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`

- [x] **Step 1: Add API helpers**

Add to `weatherApi.js`:

```js
export async function fetchKimCloudPotentialIndex(options = {}) {
  return fetchJson('/api/kim/cloud/index', options)
}

export async function fetchKimCloudPotentialField({ tmfc, hf, level }, options = {}) {
  const params = new URLSearchParams({ tmfc, hf: String(hf), level })
  return fetchJson(`/api/kim/cloud/field?${params.toString()}`, options)
}
```

- [x] **Step 2: Add hook**

Create `useKimCloudPotential.js` by adapting `useKimTemperature.js`:

- fetch `/api/kim/cloud/index`;
- cache field by `${tmfc}:${hf}:${level}:cloud`;
- watch `snapshot.kimNwp.variables.cloud.hash`;
- use `selectFallbackKimNwpSelection(index, prev)`;
- return `cloudField`, `cloudIndex`, `availableLevels`, `availableTimes`, `status`, `error`.

- [x] **Step 3: Add hook tests**

Create `useKimCloudPotential.test.js` for pure helpers exported from the hook. If the hook keeps most behavior inside React effects, extract small testable helpers instead of testing implementation details.

Required coverage:

```js
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getKimCloudFieldForSelection,
  getKimCloudSnapshotHash,
  makeKimCloudSelectionKey,
  selectCloudFallbackSelection,
} from './useKimCloudPotential.js'

const INDEX = {
  latestRun: '2026051900',
  levels: [{ id: '850hPa' }],
  times: [{ hf: 3, validTime: '2026-05-19T03:00:00.000Z' }],
  availability: { '850hPa': { 3: { variables: ['T', 'rh'] } } },
}

test('selectCloudFallbackSelection returns null for empty cloud availability', () => {
  assert.equal(selectCloudFallbackSelection({ latestRun: '2026051900', levels: [], times: [], availability: {} }, null), null)
})

test('selectCloudFallbackSelection keeps available selected pressure level', () => {
  assert.deepEqual(
    selectCloudFallbackSelection(INDEX, { tmfc: 'old', hf: 3, level: '850hPa' }),
    { tmfc: '2026051900', hf: 3, level: '850hPa' },
  )
})

test('cloud cache key includes variable kind', () => {
  assert.equal(makeKimCloudSelectionKey({ tmfc: '2026051900', hf: 3, level: '850hPa' }), '2026051900:3:850hPa:cloud')
})

test('snapshot hash prefers cloud variable hash', () => {
  assert.equal(getKimCloudSnapshotHash({ kimNwp: { hash: 'all', variables: { cloud: { hash: 'cloud' } } } }), 'cloud')
})

test('field selection rejects stale cached field', () => {
  const field = { type: 'kim_nwp_cloud_potential' }
  assert.equal(getKimCloudFieldForSelection(field, '2026051900:6:850hPa:cloud', { tmfc: '2026051900', hf: 3, level: '850hPa' }), null)
})
```

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js
```

Expected: PASS after helper exports are implemented. The empty-index test is the automated guard for “unavailable, not endless loading.”

- [x] **Step 4: Add Cloud layer definition**

In `weatherOverlayLayers.js`, add a MET layer:

```js
{ id: 'cloud', label: 'Cloud', color: 'rgba(214, 240, 255, 0.7)' }
```

- [x] **Step 5: Make Wind/Temp/Cloud mutually exclusive**

In `metLayerVisibility.js`, update NWP toggling rules:

```js
if (id === 'cloud') return { ...prev, cloud: !prev.cloud, wind: false, temp: false, windFlow: false }
if (id === 'temp') return { ...prev, temp: !prev.temp, wind: false, cloud: false, windFlow: false }
if (id === 'wind') return { ...prev, wind: !prev.wind, temp: false, cloud: false }
```

Keep existing low-power and windSpeed behavior intact.

- [x] **Step 6: Add panel control**

In `WeatherOverlayPanel.jsx`, include `cloud` beside Wind and Temp and display `Cloud unavailable` for `error/unavailable`.

- [x] **Step 7: Wire MapView**

In `MapView.jsx`:

- import `useKimCloudPotential`;
- import `syncCloudPotentialOverlay` and `destroyCloudPotentialOverlay`;
- import `CLOUD_POTENTIAL_COLOR_RAMP`;
- call the hook with `cloudEnabled`;
- sync the overlay in a dedicated `useEffect`;
- include Cloud in `NwpSliderBar` source selection;
- show the cloud legend when Cloud is active and field exists.

`MapView.jsx` must not decode `spread` or draw the raster directly.

- [x] **Step 8: Run frontend tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/temperatureField.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js
```

Expected: PASS.

---

### Task 6: Verification And Documentation

**Files:**
- Modify: `Architecture.md`

- [x] **Step 1: Run backend tests**

Run:

```bash
node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js
```

Expected: PASS.

- [x] **Step 2: Run frontend tests**

Run:

```bash
node --test frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js frontend/src/features/weather-overlays/lib/windField.test.js frontend/src/features/weather-overlays/lib/windOverlaySync.test.js frontend/src/features/weather-overlays/lib/temperatureField.test.js frontend/src/features/weather-overlays/lib/temperatureOverlaySync.test.js frontend/src/features/weather-overlays/lib/cloudPotentialField.test.js frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.test.js
```

Expected: PASS.

- [x] **Step 3: Build frontend**

Run:

```bash
npm.cmd run build --prefix frontend
```

Expected: PASS.

- [x] **Step 4: Browser smoke**

Run:

```bash
npm.cmd run dev
```

Manual checks:

- Open the map.
- Turn Cloud on.
- Confirm Wind and Temp turn off.
- Change forecast time.
- Change pressure level.
- Temporarily test an empty cloud index response or no future cloud availability and confirm the panel shows Cloud unavailable instead of staying in loading.
- Switch basemap twice.
- Confirm Cloud overlay remains aligned with Korea bbox.
- Confirm legend labels this as cloud potential, not official cloud observation.

- [x] **Step 5: Update Architecture.md**

Add concise File Roles for:

- `frontend/src/features/weather-overlays/lib/cloudPotentialField.js`
- `frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.js`
- `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js`
- `frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js`
- updated backend cloud-potential behavior in `kim-nwp-model.js` and `kim-surface-wind-processor.js`

## Risks

- `T - Td <= 3 C` is a cloud-potential proxy, not a certified cloud cover product.
- Phase 1 uses liquid-water dewpoint via Magnus. At subfreezing upper levels, especially near 300hPa, ice-saturation physics may be more appropriate for ice clouds, so this can conservatively under-detect high cloud potential. Keep the fixed 3 C threshold for this phase; layer-dependent thresholds or ice correction belong in a later calibration pass against `cld/tqc/tqi`.
- Broad hit rates in low-pressure or widespread moist-layer cases are not automatically over-highlighting bugs. Do not tighten the threshold just to reduce map coverage without checking observed/cloud-variable evidence.
- High RH/spread hits may visually paint broad areas. Keep the visual soft and label as “Potential.”
- If binary 0/100 coverage feels too heavy, prefer alpha/opacity treatment before changing the meteorological threshold. A near-term future improvement can map alpha to spread strength, for example `alpha proportional to (3 - spread) / 3`, while keeping the Phase 1 binary mask.
- API candidate runs can lag; collector must continue probing older synoptic cycles.
- `rh` partial failure must not invalidate otherwise usable wind/temp runs.
- Adding `rh` increases collector requests by `5 pressure levels x 13 forecast hours = 65` calls per run. Keep bounded concurrency.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-20-kim-cloud-potential-layer.md`.

Two execution options:

1. Subagent-Driven (recommended) - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. Inline Execution - execute tasks in this session using executing-plans, batch execution with checkpoints.
