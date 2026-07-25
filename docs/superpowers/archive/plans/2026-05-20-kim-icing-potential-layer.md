# KIM Icing Potential Layer Implementation Plan (K-FIP-inspired, NE57)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a KIM NWP icing-potential map overlay (K-FIP-inspired guidance) derived from NE57 pressure-level `T/rh_liq/w/tqc/tqi/tqr/tqs/cld`, scored with the SFIP/K-FIP-lite algorithm.

**Architecture:** Extend the existing `DATA_PATH/kim_nwp/` canonical grid with new pressure-level variables, derive the icing score/grade at API/render time (do not persist derived arrays as separate files), keep `MapView.jsx` as wiring only, and put field decoding/rendering under `frontend/src/features/weather-overlays/lib/`.

**Tech Stack:** Node/Express backend, KMA APIHub KIM `nph-kim_nc_xy_txt2` (KIMG/NE57), existing KIM grid parser/store/model, React/Vite, Mapbox image raster overlay, Node test runner.

**Spec:** `docs/superpowers/specs/2026-05-20-kim-icing-potential-layer.md`

---

## Decisions locked from spec review

These resolve the spec's open items so implementation is unambiguous:

1. **Per-variable scale (Task 1 first).** Keep `u/v/T/rh` at scale `0.01` (no regression). Add a variable→scale map for new variables. Generalize the encoder/decoder to honor per-variable scale and clip to int16 range, reserving `-32768` as the missing sentinel.
2. **Scales & overflow:** `w=0.001`, `rh_liq=0.01`, `cld=0.0001`, `tqc/tqi/tqr/tqs=2e-7`. Encode clips to `[-32767, 32767]`; `-32768` = missing. `2e-7` keeps up to `~6.5e-3 kg/kg` in range, above realistic hydrometeor maxima.
3. **Collection is config-gated bulk, not on-demand.** A `kim_nwp.collect_icing` flag (default on) makes the collector fetch the icing variable set in the same run with bounded concurrency. One HTTP call per variable (multi-`name` is unsupported, confirmed). Icing variable failure is partial and must not block wind/temp/cloud publication.
4. **SFIP-base is internal only.** Both `S_base` and `S_lite` are implemented and unit-tested in the model, but the field route serves `k-fip-lite` only. No `variant` query param in phase 1 (Simplicity).
5. **Mutual exclusion → additive update.** Keep the existing per-id `metLayerVisibility.js` conditionals and add an `icing` block. Do not replace the current wind/temp/cloud logic with a generic loop; the existing branches preserve `windSpeed`, `windFlow`, and low-power behavior.
6. **`rh_liq` for icing; leave `cloud`/Moisture's `rh` untouched** this phase.
7. **Levels:** extend the shared `KIM_NWP_LEVELS` with `600hPa` and `400hPa`. Wind (`u/v`) and Temp (`T`) collect at every pressure level, so adding `600/400` to the shared list makes wind/temp collect there automatically and exposes `600/400` in the wind/temp level sliders (intended — winds/temps aloft at FL140/FL240 are useful). Icing levels = `925/850/700/600/500/400` (drop `300`, which is always gated below -35 C; keep `300` in the shared list only for the pre-existing wind/temp behavior). Moisture stays `925/850/700/500` (unchanged this phase). Add `KIM_NWP_ICING_LEVEL_IDS` + `isKimNwpIcingLevel`, mirroring the existing `KIM_NWP_MOISTURE_LEVEL_IDS` / `isKimNwpMoistureLevel`.

**Cross-feature impact of #7:** adding `600/400` to `KIM_NWP_LEVELS` changes shipped wind/temp overlays (new selectable levels, more collection requests). Regression tests for wind/temp collection at the new levels are required, and the frontend wind/temp level sliders will show `600/400` automatically (they read available levels from the index).

## File Structure

- Modify `backend/src/processors/kim-nwp-model.js`: add `600hPa`/`400hPa` to `KIM_NWP_LEVELS`; add `KIM_NWP_ICING_LEVEL_IDS` + `isKimNwpIcingLevel`; per-variable scale; icing membership/score/grade math; icing field builder.
- Modify `backend/test/kim-nwp-model.test.js`: encoder regression + icing math/shape tests.
- Modify `backend/src/processors/kim-surface-wind-processor.js`: fetch icing variables and merge into each pressure-level grid.
- Modify `backend/test/kim-surface-wind.test.js`: icing request params + partial-failure behavior.
- Modify `backend/src/config.js`: `kim_nwp.collect_icing`, icing variable list.
- Modify `backend/server.js`: icing index/field routes + snapshot meta `kimNwp.variables.icing`.
- Create `frontend/src/features/weather-overlays/lib/icingPotentialField.js` + test.
- Create `frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.js` + test.
- Create `frontend/src/features/weather-overlays/lib/useKimIcing.js` + test.
- Modify `frontend/src/api/weatherApi.js`: icing index/field fetch helpers.
- Modify `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`: additive `icing` branch while preserving existing wind/temp/cloud behavior.
- Modify `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`: icing MET layer.
- Modify `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`: Icing toggle.
- Modify `frontend/src/features/weather-overlays/WeatherLegends.jsx`: icing legend.
- Modify `frontend/src/features/map/MapView.jsx`: high-level hook/sync/legend/slider wiring only.
- Modify `Architecture.md`: file-role updates after implementation.

## Subagent Execution Map

This plan is a long-context Superpowers workflow. The main agent remains the orchestrator and owns integration decisions, cross-feature risk calls, and final status updates. Use subagents where they add parallel review value, but keep write-heavy implementation mostly sequential because backend KIM collection, API routing, shared level lists, and frontend shared NWP selection all touch coupled behavior.

Recommended roles:

- `code-mapper` (read-only, before Task 1): confirm current KIM NWP data flow, exact files touched by `KIM_NWP_LEVELS`, retry-skip completeness, and weather overlay wiring. Output only affected paths and coupling risks.
- `implementer` (write, one task at a time): implement Task 1 through Task 6 sequentially unless a future orchestrator identifies clearly disjoint write sets. Tell implementers they are not alone in the codebase and must not revert unrelated edits.
- `reviewer` (read-only, after each backend or frontend implementation task): review for regressions, missing edge cases, and maintainability issues.
- `spec-reviewer` (read-only, after each task or task pair): verify the implementation still matches this spec/plan, especially naming, no public `variant`, potential-class wording, and scope boundaries.
- `test-gap-finder` (read-only, after Task 4 and Task 6): check whether backend API, scheduler completeness, hook race-safety, and overlay sync tests cover the new behavior.
- `ui-qa-reviewer` (read-only, after Task 6 browser smoke): check MET panel toggle behavior, mutual exclusion, legend wording, slider visibility, basemap switch preservation, and unavailable states.
- `architect-reviewer` (read-only, Task 7): verify `Architecture.md` updates match actual new file roles and that the route vertical-section note remains future-only, not implementation scope.

Parallelization guidance:

- Parallelize read-only mapping/review/test-gap/UI QA work when it does not block the next local implementation step.
- Do not run multiple implementers against shared KIM backend files or shared weather overlay state unless file ownership is explicitly disjoint.
- Main agent should directly handle integration points: `backend/server.js`, shared `KIM_NWP_LEVELS`, retry-skip guard decisions, `MapView.jsx` wiring, status updates, and `Architecture.md`.

---

### Task 1: Per-variable Scale (encoder generalization, regression-safe)

**Files:**
- Modify: `backend/src/processors/kim-nwp-model.js`
- Modify: `backend/test/kim-nwp-model.test.js`

- [ ] **Step 1: Write failing/regression tests**

Add to `backend/test/kim-nwp-model.test.js`:

```js
test('existing variables keep 0.01 scale (regression)', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57', tmfc: '2026051900', hf: 0, level: KIM_NWP_LEVELS[1],
    components: [tempComponent([273.15, 274.15, 275.15, 276.15])],
  })
  assert.equal(grid.variables.T.scale, 0.01)
  assert.equal(grid.variables.T.values[0], Math.round(273.15 / 0.01))
})

test('hydrometeor variables use per-variable fine scale and clip int16', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57', tmfc: '2026051900', hf: 0, level: KIM_NWP_LEVELS[2],
    components: [
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 1e-4, 5e-3, Number.NaN] },
      { variable: 'w', unit: 'm/s', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [-0.3, 0, 0.2, 0.5] },
    ],
  })
  assert.equal(grid.variables.tqc.scale, 2e-7)
  assert.equal(grid.variables.tqc.values[0], 0)
  assert.equal(grid.variables.tqc.values[1], Math.round(1e-4 / 2e-7)) // 500
  assert.equal(grid.variables.tqc.values[3], -32768)                  // NaN sentinel
  assert.ok(grid.variables.tqc.values[2] <= 32767)                    // clipped in range
  assert.equal(grid.variables.w.scale, 0.001)
})
```

- [ ] **Step 2: Run and verify failure**

```bash
node --test backend/test/kim-nwp-model.test.js
```

Expected: FAIL (current encoder is fixed-scale).

- [ ] **Step 3: Implement per-variable scale**

In `kim-nwp-model.js`:

```js
const SCALE_BY_VARIABLE = {
  u: 0.01, v: 0.01, T: 0.01, rh: 0.01, rh_liq: 0.01,
  w: 0.001, cld: 0.0001,
  tqc: 2e-7, tqi: 2e-7, tqr: 2e-7, tqs: 2e-7,
}
const DEFAULT_SCALE = 0.01
const INT16_MIN = -32767
const INT16_MAX = 32767

function scaleFor(variable) {
  return SCALE_BY_VARIABLE[variable] ?? DEFAULT_SCALE
}

function encodeComponentScaled(values, scale) {
  return values.map((value) => {
    if (!Number.isFinite(value)) return MISSING_ENCODED
    const enc = Math.round((value - OFFSET) / scale)
    return Math.max(INT16_MIN, Math.min(INT16_MAX, enc))
  })
}
```

In `buildKimNwpGrid`, set each variable's `scale = scaleFor(component.variable)` and encode with `encodeComponentScaled(component.values, scale)`. `decodeComponent` already honors `variable.scale`, so no decode change is needed; add a test confirming round-trip for a fine-scale variable.

- [ ] **Step 4: Run tests** -> PASS. Confirm existing wind/temp/cloud tests still pass.

```bash
node --test backend/test/kim-nwp-model.test.js backend/test/kim-nwp-store.test.js backend/test/kim-surface-wind.test.js
```

- [ ] **Step 5: Commit** — `feat: per-variable scale for kim nwp grids`

---

### Task 2: KIM Levels Extension + Icing Math And Field Model

**Files:**
- Modify: `backend/src/processors/kim-nwp-model.js`
- Modify: `backend/test/kim-nwp-model.test.js`

- [ ] **Step 0: Extend levels and add icing-level helper (do first)**

Add `600hPa` and `400hPa` to `KIM_NWP_LEVELS`, ordered by pressure:

```js
export const KIM_NWP_LEVELS = [
  { id: '10m',    label: '10m', kind: 'height',   value: 10,  unit: 'm',   level: 0,   uName: 'u10m', vName: 'v10m' },
  { id: '925hPa', label: '925', kind: 'pressure', value: 925, unit: 'hPa', level: 925, uName: 'u', vName: 'v' },
  { id: '850hPa', label: '850', kind: 'pressure', value: 850, unit: 'hPa', level: 850, uName: 'u', vName: 'v' },
  { id: '700hPa', label: '700', kind: 'pressure', value: 700, unit: 'hPa', level: 700, uName: 'u', vName: 'v' },
  { id: '600hPa', label: '600', kind: 'pressure', value: 600, unit: 'hPa', level: 600, uName: 'u', vName: 'v' }, // NEW
  { id: '500hPa', label: '500', kind: 'pressure', value: 500, unit: 'hPa', level: 500, uName: 'u', vName: 'v' },
  { id: '400hPa', label: '400', kind: 'pressure', value: 400, unit: 'hPa', level: 400, uName: 'u', vName: 'v' }, // NEW
  { id: '300hPa', label: '300', kind: 'pressure', value: 300, unit: 'hPa', level: 300, uName: 'u', vName: 'v' },
]

export const KIM_NWP_ICING_LEVEL_IDS = ['925hPa', '850hPa', '700hPa', '600hPa', '500hPa', '400hPa']
export const KIM_NWP_ICING_LEVELS = KIM_NWP_LEVELS.filter((level) => KIM_NWP_ICING_LEVEL_IDS.includes(level.id))
export function isKimNwpIcingLevel(level) {
  return KIM_NWP_ICING_LEVEL_IDS.includes(level?.id)
}
```

Export the new symbols. `KIM_NWP_MOISTURE_LEVEL_IDS` stays `925/850/700/500` (unchanged). Wind/Temp iterate `KIM_NWP_LEVELS`, so they now collect `u/v/T` at `600/400` automatically.

Add regression tests:

```js
test('KIM NWP levels include 600 and 400 hPa in pressure order', () => {
  const ids = KIM_NWP_LEVELS.map((l) => l.id)
  assert.deepEqual(ids, ['10m','925hPa','850hPa','700hPa','600hPa','500hPa','400hPa','300hPa'])
})

test('icing levels exclude 10m and 300hPa', () => {
  assert.deepEqual(KIM_NWP_ICING_LEVEL_IDS, ['925hPa','850hPa','700hPa','600hPa','500hPa','400hPa'])
  assert.equal(isKimNwpIcingLevel({ id: '300hPa' }), false)
  assert.equal(isKimNwpIcingLevel({ id: '10m' }), false)
  assert.equal(isKimNwpIcingLevel({ id: '600hPa' }), true)
})

test('moisture levels unchanged by icing levels addition', () => {
  assert.deepEqual(KIM_NWP_MOISTURE_LEVEL_IDS, ['925hPa','850hPa','700hPa','500hPa'])
})
```

Run existing model/store/wind/temp/cloud tests to confirm no regression from the new levels:

```bash
node --test backend/test/kim-nwp-model.test.js backend/test/kim-nwp-store.test.js backend/test/kim-surface-wind.test.js backend/test/kim-cloud-api.test.js
```

Before running that suite, update any level-position-dependent tests to select by `id` instead of array index. In particular, `backend/test/kim-cloud-api.test.js` currently uses `KIM_NWP_LEVELS[5]` as the excluded upper level; after inserting `600/400`, that index is no longer `300hPa`.

- [ ] **Step 1: Write failing tests**

```js
test('hard gate zeroes score outside T/RH_liq window', () => {
  assert.equal(icingHardGate({ tempC: 5, rhLiq: 90 }), false)   // too warm
  assert.equal(icingHardGate({ tempC: -40, rhLiq: 90 }), false) // too cold
  assert.equal(icingHardGate({ tempC: -10, rhLiq: 50 }), false) // too dry
  assert.equal(icingHardGate({ tempC: -10, rhLiq: 80 }), true)
})

test('liquid_ratio and phase_penalty', () => {
  assert.ok(Math.abs(calcLiquidRatio({ tqc: 1e-4, tqr: 0, tqi: 0, tqs: 0 }) - 1) < 1e-6)
  assert.ok(calcPhasePenalty(1.0) === 0)
  assert.ok(calcPhasePenalty(0.0) === 1)
})

test('buildKimIcingFieldFromGrid derives score and grade', () => {
  const grid = buildKimNwpGrid({
    model: 'KIMG/NE57', tmfc: '2026051900', hf: 3, level: KIM_NWP_LEVELS[2],
    components: [
      tempComponent([263.15, 263.15, 263.15, Number.NaN]),   // -10C, last NaN
      { variable: 'rh_liq', unit: '%', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [90, 40, 95, 90] },
      { variable: 'w',  unit: 'm/s',   level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.2, 0.2, 0.2, 0.2] },
      { variable: 'tqc', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [2e-4, 2e-4, 2e-4, 2e-4] },
      { variable: 'tqi', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 5e-4, 0] },
      { variable: 'tqr', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'tqs', unit: 'kg/kg', level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0, 0, 0, 0] },
      { variable: 'cld', unit: '1',     level: 850, nx: 2, ny: 2, bounds: BOUNDS, values: [0.8, 0.8, 0.8, 0.8] },
    ],
  })
  const field = buildKimIcingFieldFromGrid(grid)
  assert.equal(field.type, 'kim_nwp_icing_potential')
  assert.equal(field.variant, 'k-fip-lite')
  assert.ok(field.icingScore[0] > field.icingScore[1])   // moist > dry-gated
  assert.equal(field.icingGrade[1], 0)                    // gated (RH 40) -> NONE
  assert.ok(field.icingScore[2] < field.icingScore[0])    // ice-dominant penalized
  assert.equal(field.icingGrade[3], 0)                    // NaN temp -> sentinel/NONE
})

test('class 3 requires high M_CL or freezing-rain bonus', () => {
  // score >= 0.7 but low M_CL and no B_frz must cap at class 2
  assert.equal(icingGradeFor(0.8, { mCl: 0.3, bFrz: 0 }), 2)
  assert.equal(icingGradeFor(0.8, { mCl: 0.8, bFrz: 0 }), 3)
})
```

- [ ] **Step 2: Run and verify failure** -> FAIL.

- [ ] **Step 3: Implement icing model**

Add membership helpers, `icingHardGate`, `calcLiquidRatio`, `calcPhasePenalty`, `calcFreezingBonus`, `calcSfipBaseScore`, `calcKFipLiteScore`, `icingGradeFor`, and `buildKimIcingFieldFromGrid()`. Decode inputs with `decodeComponent`. Use control points and the score formulas from the spec. `icingScore` is encoded with scale `0.0001` (0..1 -> 0..10000), and `icingGrade` is raw 0..3 ints. Missing input cells use `-32768`; valid cells that fail the hard gate use score `0` and grade `0`. Internal `calcSfipBaseScore` is exported for tests but not used by the route.

- [ ] **Step 4: Run tests** -> PASS.

- [ ] **Step 5: Commit** — `feat: kim icing potential model (k-fip-lite)`

---

### Task 3: Icing Variable Collection

**Files:**
- Modify: `backend/src/config.js`
- Modify: `backend/src/processors/kim-surface-wind-processor.js`
- Modify: `backend/test/kim-surface-wind.test.js`

- [ ] **Step 0: Real-data sanity before trusting scores**

Using a clean parser that ignores coordinate/index columns, spot-check one recent usable run for `w/tqc/tqi/tqr/tqs` at an icing level. Record min/max and whether any value would clip at scale `2e-7`. Confirm `w` positive orientation against a known ascent/convection case or documented `upward_air_velocity` semantics. If `w` orientation or hydrometeor magnitude contradicts the assumptions, pause and update the spec/plan before implementing scoring.

- [ ] **Step 1: Failing tests**

```js
test('resolveKimIcingComponentRequests gates to icing levels (no 10m, no 300hPa)', () => {
  assert.equal(resolveKimIcingComponentRequests({ level: { id: '10m', kind: 'height' } }).length, 0)
  assert.equal(resolveKimIcingComponentRequests({ level: { id: '300hPa', kind: 'pressure', level: 300 } }).length, 0)
  const reqs = resolveKimIcingComponentRequests({ level: { id: '600hPa', kind: 'pressure', level: 600 } })
  assert.deepEqual(reqs.map((r) => r.name).sort(), ['cld','rh_liq','tqc','tqi','tqr','tqs','w'])
})

test('icing collection failure does not drop existing u/v/T grids', () => {
  assert.equal(shouldPublishKimNwpRun({ expectedGridCount: 1, grids: [{ variables: { u:{}, v:{}, T:{} } }] }), true)
})
```

- [ ] **Step 2: Run -> FAIL.**

- [ ] **Step 3: Config + resolver**

`config.js`:
```js
export const kim_nwp = {
  // ...existing...
  collect_icing: process.env.KIM_NWP_COLLECT_ICING !== '0',
  icing_variables: ['w', 'rh_liq', 'tqc', 'tqi', 'tqr', 'tqs', 'cld'],
}
```

`kim-surface-wind-processor.js`: add `resolveKimIcingComponentRequests({ level })` returning `[]` when `!isKimNwpIcingLevel(level)` (so `10m` and `300hPa` are skipped), else one request per `kim_nwp.icing_variables` with `{ data:'P', name, level: level.level, variable: name, unit }`. Add `fetchIcingComponents` + `addIcingToGrid` that fetches icing variables sequentially inside each already-bounded KIM NWP task, or with an explicit small per-task cap, so the effective concurrent KMA calls remain bounded by design instead of multiplying `kim_nwp.concurrency` by 7. Parse successful components and merge them into the grid's `variables`. **Extend `rawComponentFileName`** so each icing variable writes its own raw file (`w.txt`, `tqc.txt`, `tqi.txt`, `tqr.txt`, `tqs.txt`, `cld.txt`, `rh_liq.txt`) instead of colliding with `u/v/rh`. Failure of any single variable is logged to `lastError` and skipped (partial), never aborting the run.

- [ ] **Step 4: Wire into `process()`** after temp/cloud merge, gated by `config.kim_nwp.collect_icing`. Re-write the grid with `writeKimNwpGrid` after merge. Keep total run within the existing KIM lock; document the effective maximum concurrent KMA requests when choosing sequential vs capped per-task icing fetches.

- [ ] **Step 5: Extend the retry-skip completeness guard (critical integration point)**

The Moisture work added a scheduler retry-skip guard that skips a retry run when the latest run is "complete" (all configured levels/hours have `u/v/T`, moisture levels have `rh`). **If `collect_icing` is enabled, that completeness check must also require the icing variable set on icing levels** — otherwise the scheduler treats a run as complete and skips before icing is ever collected, so icing never populates. Update the completeness predicate to include: icing levels (`925/850/700/600/500/400`) have `w/tqc/tqi/tqr/tqs/cld/rh_liq`. Add a test for "run with u/v/T + moisture rh but no icing vars is NOT complete when collect_icing is on".

- [ ] **Step 6: Run backend tests** -> PASS.

- [ ] **Step 7: Commit** — `feat: collect kim icing variables`

---

### Task 4: Icing API And Snapshot Meta

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1:** import `buildKimIcingFieldFromGrid`; add `readSelectedKimIcingField(selection)` mirroring `readSelectedKimCloudField` (validate selection, `readKimNwpGrid`, build field).

- [ ] **Step 2: Routes**

```js
app.get('/api/kim/icing/index', (_req, res) => {
  const index = readKimNwpIndex(DATA_ROOT)
  if (!index) return res.status(503).json({ error: 'kim icing index unavailable' })
  res.json({
    ...filterKimNwpIndexForMap(filterKimNwpIndexForVariables(index, ['T','rh_liq','w','tqc','tqi','tqr','tqs','cld'])),
    type: 'kim_nwp_icing_index',
  })
})

app.get('/api/kim/icing/field', (req, res) => {
  try {
    res.json(readSelectedKimIcingField({
      tmfc: String(req.query.tmfc || ''), hf: Number(req.query.hf), level: String(req.query.level || ''),
    }))
  } catch (error) {
    res.status(400).json({ error: error.message || 'invalid kim icing selection' })
  }
})
```

- [ ] **Step 3:** snapshot meta `kimNwp.variables.icing.hash` from the filtered icing index.

- [ ] **Step 4: API smoke**

```bash
curl http://127.0.0.1:3001/api/kim/icing/index
curl "http://127.0.0.1:3001/api/kim/icing/field?tmfc=<run>&hf=<hf>&level=850hPa"
```
Expect: index has no `values`; field `type: kim_nwp_icing_potential`, has `icingScore`/`icingGrade`, no raw `u/v`; invalid `level=../bad` -> 400.

- [ ] **Step 5: Commit** — `feat: kim icing api`

---

### Task 5: Frontend Icing Field And Renderer

**Files:**
- Create: `frontend/src/features/weather-overlays/lib/icingPotentialField.js` (+ test)
- Create: `frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.js` (+ test)

- [ ] **Step 1: Field tests** — decode score (scale 0.0001) and grade, sentinel -> null/transparent, `ICING_COLOR_RAMP` has None/Low/Medium/High potential labels with increasing alpha, `pickIcingColor(grade)` maps correctly.

- [ ] **Step 2: Implement `icingPotentialField.js`** — `ICING_COLOR_RAMP`, `decodeIcingScore`, `decodeIcingGrade`, `pickIcingColor`, metadata label `"Icing Potential (K-FIP-inspired)"`.

- [ ] **Step 3: Sync test** — pattern after `cloudPotentialOverlaySync.test.js`: image source/layer created, updated, hidden, destroyed.

- [ ] **Step 4: Implement `icingPotentialOverlaySync.js`** — Canvas 2D color by grade -> Mapbox image source. IDs `kim-icing-image-source` / `kim-icing-image-layer`. Missing/NONE cells transparent.

- [ ] **Step 5: Run tests** -> PASS.

- [ ] **Step 6: Commit** — `feat: kim icing field and renderer`

---

### Task 6: Frontend API, Hook, UI Wiring, Additive Mutual Exclusion

**Files:**
- Modify: `frontend/src/api/weatherApi.js`
- Create: `frontend/src/features/weather-overlays/lib/useKimIcing.js` (+ test)
- Modify: `frontend/src/features/weather-overlays/lib/metLayerVisibility.js`
- Modify: `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`
- Modify: `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`
- Modify: `frontend/src/features/weather-overlays/WeatherLegends.jsx`
- Modify: `frontend/src/features/map/MapView.jsx`

- [ ] **Step 1: API helpers** — `fetchKimIcingIndex`, `fetchKimIcingField({tmfc,hf,level})`.

- [ ] **Step 2: Hook** — `useKimIcing` adapted from `useKimCloudPotential`: cache key `tmfc:hf:level:icing`, watch `snapshot.kimNwp.variables.icing.hash`, AbortController + request token, empty-index -> unavailable. Export pure helpers (`selectIcingFallbackSelection`, `makeKimIcingSelectionKey`, `getKimIcingSnapshotHash`, `getKimIcingFieldForSelection`) for tests.

- [ ] **Step 3: Hook tests** — fallback selection, cache key, snapshot hash preference, stale-field rejection, empty-index unavailable.

- [ ] **Step 4: Add `icing` to mutual exclusion (additive, low-risk)**

`metLayerVisibility.js` is already implemented and covered by `metLayerVisibility.test.js` (passing). The existing wind/temp/cloud blocks carry specific behavior — wind enable sets `windSpeed: true` and `windFlow: !lowPower`; temp/cloud enable set `windFlow: false`. **Do NOT replace these with a generic loop** (it risks the windSpeed/windFlow/lowPower details and the existing passing tests). Instead **add an `icing` block matching the existing pattern**, and make every NWP-on case turn the other three off:

```js
if (id === 'icing') {
  const nextIcing = !prev.icing
  return { ...prev, icing: nextIcing, wind: false, temp: false, cloud: false, windFlow: false }
}
```
Also add `icing: false` to the wind/temp/cloud blocks' returned objects so enabling any of them clears icing. Keep windFlow/windSpeed/lowPower behavior identical. Add `metLayerVisibility.test.js` cases: icing-on clears wind/temp/cloud(+windFlow); wind/temp/cloud-on clears icing; existing cases stay green.

- [ ] **Step 5: Panel + legend** — add `icing` peer toggle; legend labels potential classes as `None`, `Low potential`, `Medium potential`, `High potential` with "(K-FIP-inspired)"; do not use aviation severity wording such as `Light`, `Moderate`, or `Severe`; show `Icing unavailable` on error/unavailable.

- [ ] **Step 6: Wire MapView** — import hook + sync + ramp; call hook with `icingEnabled`; dedicated sync `useEffect`; include icing in `NwpSliderBar` source; show icing legend when active. No decode/raster in `MapView.jsx`.

- [ ] **Step 7: Run frontend tests** (wind/temp/cloud/icing field+sync+hook) -> PASS.

- [ ] **Step 8: Commit** — `feat: kim icing ui and mutual exclusion`

---

### Task 7: Verification And Documentation

**Files:**
- Modify: `Architecture.md`

- [ ] **Step 1: Backend tests**
```bash
node --test backend/test/kim-nwp-store.test.js backend/test/kim-nwp-model.test.js backend/test/kim-surface-wind.test.js
```
- [ ] **Step 2: Frontend tests** (wind/temp/cloud/icing field/sync/hook) -> PASS.
- [ ] **Step 3: Build** — `npm.cmd run build --prefix frontend`.
- [ ] **Step 4: Browser smoke** — Icing on turns Wind/Temp/Cloud off; time/level change updates field; basemap switch preserves overlay; legend says "Icing Potential (K-FIP-inspired)" and uses potential labels, not certified severity labels; empty/no-future index shows unavailable, not endless loading.
- [ ] **Step 5: Update `Architecture.md`** — file roles for `icingPotentialField.js`, `icingPotentialOverlaySync.js`, `useKimIcing.js`, and the per-variable-scale/icing changes in `kim-nwp-model.js` and `kim-surface-wind-processor.js`.

## Risks

- Membership control points are literature defaults, uncalibrated for NE57/Korea; over/under-highlighting expected until validated (validation is a separate track).
- **Cross-feature change:** adding `600/400` to `KIM_NWP_LEVELS` alters shipped wind/temp overlays (new selectable levels + more collection). Requires wind/temp regression tests (Task 2 Step 0) and a frontend check that wind/temp level sliders render the new levels. Moisture is unchanged (still `925/850/700/500`).
- Collector request volume rises sharply (one call per variable, multi-name unsupported). Rough per-run estimate with 7 pressure levels + 10m: wind `2 x 8 x 13 ~= 208`, temp `8 x 13 ~= 104`, moisture rh `4 x 13 ~= 52`, icing `7 x 6 x 13 ~= 546` = **~910 calls/run** (vs ~741 without 600/400). `collect_icing` gating, bounded concurrency, partial-failure tolerance, and the retry-skip guard mitigate; monitor run duration under the shared KIM lock so other collections (METAR/TAF) are not starved.
- `tqc` scale `2e-7` clips above ~6.5e-3 kg/kg; verify realistic maxima during plan execution; widen scale if clipping observed.
- `w` sign orientation and `tqc/tqi/tqr/tqs` units (kg/kg vs g/kg) must be confirmed on real data before trusting scores (Task 3 includes a magnitude sanity check).
- `grle` absence slightly weakens convective phase penalty; acceptable for guidance.

## Open Items For Codex Review (pending)

This plan is drafted while the spec review by Codex is still in progress. After that review, reconcile:
- per-variable scale migration safety (Task 1) vs Codex findings;
- collection design (bulk vs lazy) vs Codex preference;
- whether SFIP-base stays internal-only.
