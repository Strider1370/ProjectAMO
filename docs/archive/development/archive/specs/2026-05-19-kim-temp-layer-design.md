# KIM Temperature Layer Design

## Goal

Add a KIM NWP temperature overlay that follows the same time/level selection model as the new wind overlay, while keeping Wind and Temp mutually exclusive in the map UI.

This phase extends the existing `DATA_PATH/kim_nwp/` normalized store instead of creating a separate temperature store. The target is a reusable NWP grid shape for later route briefing and vertical weather sections, but this phase only displays temperature on the map.

## Product Decisions

- Wind and Temp must not be displayed at the same time in this first Temp phase.
- Selecting Temp turns Wind off. Selecting Wind turns Temp off.
- Wind and Temp share the same selected `tmfc + hf + level` state when possible.
- The existing bottom time slider and right-side vertical level slider remain the shared map controls.
- Temp renders as a color raster overlay only.
- Temp does not use wind particles, flow trail controls, speed controls, or kt legends.
- Keep the MET panel operational and compact. Add a Temp toggle near Wind, but keep detailed time/level controls on the map, not in the left panel.
- Temp collection runs inside the same KIM NWP collector job as Wind and shares the same `kim_surface_wind` collection lock. Do not add a separate Temp cron or independent processor that can concurrently rewrite the same `grid.json`.
- Keep one shared `kim_nwp/index.json`. Wind and Temp API routes filter the same index by required variables instead of maintaining separate physical index files.
- Temp field responses use a renderer-friendly `kim_nwp_temperature` schema with stored Kelvin values. Celsius conversion belongs to the frontend.
- Temp raster rendering uses client Canvas 2D to color a selected field, then publishes the result through a Mapbox image source. Do not add a second WebGL renderer for Temp in this phase.

## Scope

In scope:

- KIM `T` temperature variable only.
- Levels: `10m`, `925hPa`, `850hPa`, `700hPa`, `500hPa`, `300hPa`.
- Forecast hours: `0,3,6,9,12,15,18,21,24,27,30,33,36`.
- Canonical storage under `DATA_PATH/kim_nwp/`.
- New API endpoints:
  - `GET /api/kim/temp/index`
  - `GET /api/kim/temp/field?tmfc=...&hf=...&level=...`
- Frontend temperature fetch API.
- Frontend temperature hook/state with AbortController, request token, and Map cache.
- Temp overlay renderer under `frontend/src/features/weather-overlays/lib/`.
- Temp legend with Celsius units.
- Wind/Temp mutual exclusion in the MET overlay UI.
- Tests for model/store/API selection, stale request defense, and renderer color scale helpers.

Out of scope:

- `hgt`.
- WIN/TEMP combined aloft rendering.
- Route briefing API.
- Route vertical weather section.
- Time interpolation.
- Vertical interpolation.
- Icing/cloud potential.
- Temperature advection or derived hazards.
- Showing Wind and Temp simultaneously.

## Backend Design

### Store

Use the existing `kim_nwp` run layout:

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
          hf000/10m/t.txt
        normalized/
          hf000/10m/grid.json
          hf003/850hPa/grid.json
```

Each `grid.json` remains one `tmfc + hf + level` canonical grid. Temp adds a `T` variable to the same normalized data shape:

```json
{
  "type": "kim_nwp_grid",
  "model": "KIMG/NE57",
  "tmfc": "2026051900",
  "hf": 3,
  "validTime": "2026-05-19T03:00:00.000Z",
  "level": { "id": "850hPa", "label": "850", "kind": "pressure", "value": 850, "unit": "hPa" },
  "grid": { "nx": 205, "ny": 169, "lonMin": 119, "latMin": 30, "lonMax": 136, "latMax": 44, "dx": 0.083333, "dy": 0.083333 },
  "variables": {
    "u": { "unit": "m/s", "encoding": "int16-scaled-json-v1", "scale": 0.01, "offset": 0, "values": [] },
    "v": { "unit": "m/s", "encoding": "int16-scaled-json-v1", "scale": 0.01, "offset": 0, "values": [] },
    "T": { "unit": "K", "encoding": "int16-scaled-json-v1", "scale": 0.01, "offset": 0, "values": [] }
  }
}
```

The same collector job must perform Wind and Temp writes in a deterministic sequence so two jobs never rewrite the same `grid.json` at the same time. Atomic rename protects crash consistency, but it does not protect against lost updates from concurrent read-modify-write operations.

The collector may read an existing wind grid and atomically rewrite it with `variables.T` added. If a grid does not exist yet, the collector may create a temp-only grid with `variables.T`. Wind APIs must continue to require `u/v`; Temp APIs must require `T`.

Do not choose these alternatives for this phase:

- variable-specific sibling files such as `T.json`;
- per-grid lock files;
- a separate Temp cron job.

Those alternatives add operational complexity without solving a current product need.

### Upstream Fetch

Pressure levels use:

```text
data=P
name=T
level=925,850,700,500,300
```

For `10m`, verify the exact KIM API parameter before implementation. Do not guess silently. If KIM does not expose a 10m temperature variable through the same endpoint shape, pause and report the evidence before choosing a fallback. Acceptable fallbacks require explicit approval:

- omit `10m` from Temp availability, or
- use a surface/screen temperature variable if KIM API confirms one, or
- keep Temp pressure-level-only for this phase.

### Model Helpers

Extend `backend/src/processors/kim-nwp-model.js` with temperature-specific helpers:

- `buildKimNwpGrid` remains the canonical variable container.
- Add a temperature field conversion helper, for example `buildKimTemperatureFieldFromGrid(grid)`.
- Generalize `buildKimNwpGrid` so it can store arbitrary validated variable components. Move `u/v` pair validation into wind-specific helpers such as `buildKimSurfaceWindFieldFromWindGrid` or a wind-only builder.
- Keep backend temperature field values and stats in Kelvin. `frontend/src/features/weather-overlays/lib/temperatureField.js` owns Celsius labels, Celsius color ramp input, and display conversion.
- Build compact temp indexes from grids that contain `variables.T`.

### Processor

Prefer extending the current KIM NWP collection path instead of creating a parallel store. The collection phase should:

1. Resolve latest synoptic candidates.
2. Fetch `T` for configured levels and forecast hours with bounded concurrency.
3. Write raw text only when `kim_nwp.keep_raw` is enabled.
4. Merge `T` into the normalized `grid.json` for each `tmfc + hf + level`.
5. Write/update run `manifest.json` atomically.
6. Write temp availability into the shared `kim_nwp/index.json` without breaking wind availability.
7. Preserve latest usable wind data if Temp collection partially or fully fails.

Partial failure rule:

- A failed Temp pair omits only that `level + hf` from `/api/kim/temp/index`.
- It must not remove existing `u/v` wind grids.
- It must not update latest pointers to an unusable run.
- Cleanup still preserves the current `latestRunId` and latest 2 usable runs.

Index rule:

- `buildKimNwpIndex` records whatever variable keys exist in each grid.
- Add a shared route/helper filter, for example `filterKimNwpIndexForVariables(index, requiredVariables)`, and use it before both server responses and frontend default selection.
- `/api/kim/wind/index` exposes only entries whose `variables` contain both `u` and `v`.
- `/api/kim/temp/index` exposes only entries whose `variables` contain `T`.

## API Design

### `GET /api/kim/temp/index`

Returns a compact index with no grid values:

```json
{
  "type": "kim_nwp_temp_index",
  "model": "KIMG/NE57",
  "latestRun": "2026051900",
  "levels": [],
  "times": [],
  "availability": {
    "850hPa": {
      "3": {
        "variables": ["T"],
        "path": "kim_nwp/runs/KIMG_NE57_2026051900/normalized/hf003/850hPa/grid.json"
      }
    }
  }
}
```

Server clock filtering matches wind:

- Do not expose past `validTime` in API response.
- Keep all usable `hf 0..36` grids on disk.
- If no future valid times remain, return a valid empty index or a clear 503. The frontend must not stay in `loading`.

### `GET /api/kim/temp/field`

Validates:

- `tmfc` matches `/^\d{10}$/`.
- `hf` is one of the configured forecast hours.
- `level` is in the level whitelist.
- resolved path stays under `DATA_PATH/kim_nwp/`.
- selected grid contains `variables.T`.

Response must be renderer-friendly and must not expose unrelated `u/v` arrays.

Canonical response shape:

```js
{
  type: 'kim_nwp_temperature',
  model: 'KIMG/NE57',
  grid: { nx, ny, lonMin, latMin, lonMax, latMax, dx, dy },
  time: { tmfc, hf, validTime },
  level: { id, label, kind, value, unit },
  units: { T: 'K' },
  stats: { minT, maxT, meanT },
  encoding: 'int16-scaled-json-v1',
  scale: 0.01,
  offset: 0,
  T: [],
  fetched_at: '...'
}
```

The backend keeps `T` in Kelvin. `stats` are also Kelvin and must exclude NaN or missing cells.

Missing value policy:

- Decode known sentinel values, including `-32768` after int16 decoding if used by the storage format, to `NaN`.
- Exclude `NaN` cells from stats.
- Return `null` from future route samplers for missing cells.
- Render `NaN` cells as transparent pixels in the map overlay.

## Snapshot Meta

Keep the existing `kimNwp` compatibility key, but include variable-level hashes so Wind and Temp hooks do not refetch when only the other variable changes.

Target shape:

```js
kimNwp: {
  hash,
  tmfc,
  updated_at,
  variables: {
    uv: { hash },
    T: { hash }
  }
}
```

Frontend hooks should compare their own variable hash first:

- Wind watches `kimNwp.variables.uv.hash`, falling back to `kimNwp.hash`.
- Temp watches `kimNwp.variables.T.hash`, falling back to `kimNwp.hash`.

## Frontend Design

### State

Use a shared KIM NWP selection model:

```js
{
  tmfc,
  hf,
  level
}
```

Wind and Temp can share the current selected time/level, but active layer state is mutually exclusive:

- Turning `metVisibility.temp` on turns `metVisibility.wind` off.
- Turning `metVisibility.wind` on turns `metVisibility.temp` off.
- `toggleMet('wind')` sets `temp: false`.
- `toggleMet('temp')` sets `wind: false`, `windFlow: false`, and leaves `windSpeed` inactive because speed is a wind-only sublayer.
- `windFlow` and `windSpeed` controls are meaningful only while Wind is active.
- Turning off the active NWP layer hides the shared time/level sliders when no active NWP layer remains.

Selection fallback rule:

- Keep the current `tmfc + hf + level` selection when it is available in the newly active layer's filtered index.
- Otherwise keep the same `level` and choose the earliest non-past available `hf` for that level.
- If that level is unavailable, choose the first available level and its earliest non-past `hf`.
- If no valid pair exists, clear selection and show the layer as unavailable rather than leaving it in `loading`.

### Hooks

Do not duplicate the race-prone parts of `useKimSurfaceWind`.

Preferred implementation path:

1. Extract a small shared helper for index normalization, selection validation, request key creation, AbortController/request-token/cache behavior.
2. Keep wind-specific field conversion and temp-specific field conversion separate.
3. Add `useKimTemperature` or a generic `useKimNwpOverlay({ kind })` only if the shared boundary stays simple.

Temp hook requirements:

- AbortController for in-flight field requests.
- request token that is incremented on every selection change, including cache hits.
- `Map` cache keyed by `tmfc:hf:level:T`.
- no stale field commit after rapid time/level/layer changes.
- no infinite `loading` when index has no selectable future time.

### UI

MET panel:

- Add `Temp` as a peer to `Wind`.
- `Wind` and `Temp` are mutually exclusive toggles.
- Wind retains Flow/Speed/Tone/Trail/Width controls.
- Temp has no Flow/Speed controls.
- Temp may show a small status line only for loading/error.

Map controls:

- Reuse the bottom time slider and right vertical level slider.
- The controls appear when either Wind or Temp is active and an index has selectable values.
- The same compact time label rule applies: show date at first tick and date transitions, otherwise show time only.

Legend:

- Temp legend is Celsius.
- Use one fixed Celsius color scale across all levels for this phase so color meaning is stable across altitude.
- Emphasize the `0 C` boundary with a visible hue or lightness transition because the freezing level is operationally important.
- Initial proposed scale:

```text
<= -60 C
-60 to -50 C
-50 to -40 C
-40 to -30 C
-30 to -20 C
-20 to -10 C
-10 to 0 C
0 to 10 C
10 to 20 C
20 to 30 C
>= 30 C
```

This scale can be adjusted after sample KIM data is inspected, but it must remain fixed and labeled if shared across levels.

### Rendering

Implement Temp rendering under:

```text
frontend/src/features/weather-overlays/lib/
```

Suggested files:

- `temperatureField.js`: decode temperature field, Kelvin-to-Celsius conversion, sampler, color ramp, metadata label.
- `temperatureOverlaySync.js`: Mapbox overlay lifecycle for temp raster.

Use client Canvas 2D to color the selected temperature grid, convert that canvas to an image, and publish it as a Mapbox image source. `temperatureOverlaySync.js` owns image source lifecycle, update, and cleanup.

Do not mix Temp rendering into the WebGL wind particle renderer. Keep wind flow and speed code unchanged except for active-layer coordination.

## MapView Boundary

`frontend/src/features/map/MapView.jsx` may only:

- own high-level visibility state,
- pass selected NWP state and callbacks,
- call weather-owned sync helpers,
- render shared sliders/legends.

Do not put Temp sampling, color ramp, raster generation, or API shaping in `MapView.jsx`.

## Testing Plan

Backend:

- `kim-nwp-model.test.js`
  - `T` grid variable build.
  - Kelvin-to-Celsius conversion helper.
  - temp index excludes grids without `T`.
- `kim-nwp-store.test.js`
  - existing path traversal tests remain valid for Temp.
  - manifest/retention still treats usable runs correctly when Temp is partial.
- processor tests
  - pressure level `T` fetch uses `data=P`, `name=T`.
  - partial Temp failure omits only failed `level + hf`.
  - Temp failure does not break wind latest/index.
- server route tests or direct handler tests
  - `/api/kim/temp/index` omits grid values.
  - invalid `level=../bad` is rejected.
  - past valid times are not exposed.
  - `/api/kim/wind/index` and `/api/kim/temp/index` filter the same shared index by their required variables.

Frontend:

- API client tests if existing pattern supports them.
- hook tests:
  - default selection uses earliest non-past temp availability.
  - empty future index does not stay loading.
  - rapid selection changes do not commit stale temp fields.
  - Wind/Temp toggles are mutually exclusive.
- field tests:
  - decode `T` and convert to Celsius.
  - fixed Celsius color ramp labels and thresholds.
- sync tests:
  - temp raster is created/updated/destroyed.
  - basemap switch preserves visible Temp overlay through weather-owned sync.

Documentation:

- Update `Architecture.md` File Roles for every new non-obvious file.
- Expected additions include:
  - backend temperature model/processor helpers, if split out during planning;
  - `frontend/src/features/weather-overlays/lib/temperatureField.js`;
  - `frontend/src/features/weather-overlays/lib/temperatureOverlaySync.js`;
  - shared NWP slider/selection files if introduced;
  - corresponding test files.

Manual/browser smoke:

- Wind on, then Temp on: Wind turns off.
- Temp on, then Wind on: Temp turns off.
- Temp time change.
- Temp level change.
- Basemap switch while Temp is on.
- Temp legend shows Celsius, not kt.
- Wind Flow/Speed controls do not appear for Temp.
- Left panel does not show time/level controls.

## Open Question Before Implementation

The only blocker before implementation is the exact KIM API parameter for `10m` temperature. Pressure-level Temp is expected to be `data=P&name=T&level=<hPa>`. The implementation must verify the 10m/surface temperature parameter before adding `10m` Temp availability.

If 10m Temp is unavailable or inconsistent, use pressure-level Temp only after confirming with the user.
