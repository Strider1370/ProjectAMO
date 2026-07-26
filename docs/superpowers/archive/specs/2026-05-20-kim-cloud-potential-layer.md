# KIM Moisture / Cloud Potential Layer Spec

## Purpose

Add a KIM NWP moisture-area overlay that highlights pressure-level areas where the model air mass is close to saturation based on temperature-dewpoint spread (`T - Td`).

This feature extends the existing KIM NWP wind/temperature pipeline. It is not an official cloud observation, SIGWX replacement, or deterministic forecast product. In the UI this is presented as a moisture/dewpoint-spread layer, not as cloud cover.

## User Value

Pilots and operators can scan model-derived moist layers by forecast time and pressure level using the same interaction model already used for KIM wind and temperature. The overlay should answer: "At this selected time and level, where is the air close enough to saturation that cloud or precipitation-supporting moist layers are plausible?"

## Core Rule

Use dewpoint depression / temperature-dewpoint spread:

```text
spreadC = T - Td
```

The operational thresholds are level-dependent:

```text
925hPa, 850hPa, 700hPa: spreadC <= 4 C
500hPa: spreadC <= 6 C
10m, 300hPa: excluded from the moisture-area layer
```

This follows the synoptic-chart style of moisture-area shading, where smaller `T - Td` means a moister or more nearly saturated layer. `T - Td >= threshold` indicates drier air and must not be used for moist-area highlighting.

## Data Source

Use KMA APIHub KIM 8km global model:

```text
endpoint: nph-kim_nc_xy_txt2
group=KIMG
nwp=NE57
data=P
name=T, rh
level=925,850,700,500
map=S
sub=1429,1441,1633,1609
```

Live probe on 2026-05-20 KST confirmed:

- latest `2026052000` run may return `file is not exist` before production is complete;
- previous `2026051918` run returns usable pressure-level grids for `rh`, `cld`, `cldbulk`, `tqc`, and `tqi`;
- `T/rh/cld` parse to the existing Korea subset shape, `205 x 169`.

`T` remains collected for all KIM NWP temperature levels because the temperature overlay depends on it. The request reduction applies to `rh`: this layer does not request `10m rh` or `300hPa rh`.

## Scope

In scope:

- Add `rh` to the existing `DATA_PATH/kim_nwp/` canonical grid for moisture-analysis levels only: `925hPa`, `850hPa`, `700hPa`, `500hPa`.
- Derive dewpoint from `T` and `rh`.
- Derive dewpoint spread (`T - Td`) and a graded moisture score from level-specific thresholds.
- Add cloud/moisture index and field API endpoints.
- Add a `Moisture` MET overlay toggle, backed by the existing cloud API names for compatibility.
- Reuse the existing KIM NWP time and pressure-level sliders.
- Keep Wind, Temp, and Moisture mutually exclusive in the map UI for this phase.
- Keep existing KIM NWP temperature collection intact for all temperature levels.
- Add focused backend/frontend tests.

Out of scope:

- Route briefing cloud risk bands.
- Vertical cross-section cloud products.
- Time or vertical interpolation.
- Icing potential.
- Primary use of `cld`, `cldbulk`, `tqc`, or `tqi`.
- Surface/10m cloud potential.
- 300hPa moisture-area display.
- Persisting derived `Td`, spread, or cloud mask as separate physical grid files.

## Product Behavior

- Moisture overlay appears as a soft, semi-transparent green raster similar to synoptic moisture-area shading.
- Smaller spread values are darker/stronger green; dry areas above the level threshold are transparent.
- The legend labels dewpoint spread, e.g. `T-Td C`, not Cloud Cover.
- The UI must not imply this is an official observation or SIGWX forecast.
- If no selectable moisture grid exists, Moisture shows unavailable and does not stay in loading.
- Basemap switches must preserve the active Moisture overlay.
- The selectable cloud/moisture index exposes only `925hPa`, `850hPa`, `700hPa`, and `500hPa`. If legacy cached grids include `300hPa rh`, the API must hide `300hPa` from this overlay.
- KIM NWP index exposure keeps the nearest valid past forecast time plus future forecast times so recently passed times such as `09:00` remain available at `09:06`.

## Backend Contract

Each `grid.json` remains one canonical `tmfc + hf + level` grid:

```json
{
  "type": "kim_nwp_grid",
  "variables": {
    "T": { "unit": "K", "encoding": "int16-scaled-json-v1", "scale": 0.01, "values": [] },
    "rh": { "unit": "%", "encoding": "int16-scaled-json-v1", "scale": 0.01, "values": [] }
  }
}
```

Cloud/moisture field API response:

```js
{
  type: 'kim_nwp_cloud_potential',
  grid,
  time: { tmfc, hf, validTime },
  level,
  thresholdC: 4, // or 6 for 500hPa
  units: { spread: 'C', cloudPotential: '%' },
  stats: { minSpread, maxSpread, meanSpread },
  encoding: 'int16-scaled-json-v1',
  scale: 0.01,
  offset: 0,
  spread: [],
  cloudPotential: []
}
```

API routes:

```text
GET /api/kim/cloud/index
GET /api/kim/cloud/field?tmfc=...&hf=...&level=...
```

Index exposure must require both `T` and `rh`, then filter to moisture-analysis levels only:

```text
925hPa, 850hPa, 700hPa, 500hPa
```

`10m` is excluded because this product is not a surface fog/ceiling layer. `300hPa` is excluded because upper-tropospheric jet/ice-cloud analysis needs different physics and should not use this moisture-area shading product.

## Frontend Contract

- Add `fetchKimCloudPotentialIndex`.
- Add `fetchKimCloudPotentialField`.
- Add `useKimCloudPotential`.
- Add `cloudPotentialField.js`.
- Add `cloudPotentialOverlaySync.js`.
- Wire Moisture in `MapView.jsx` only at the high-level hook/sync/legend/slider boundary.

`MapView.jsx` must not decode field values or draw rasters directly.

`cloudPotential` remains in the field response for compatibility and future scoring use, but raster rendering uses decoded `spread` values for stepped green shading.

## Scheduler And Time Selection

KIM NWP scheduled collection follows synoptic release timing:

```text
00/06/12/18 UTC + 0h/+1h/+2h retry windows, minute 12
```

The scheduler must use UTC explicitly. Retry runs skip API calls when the latest run is already complete for required variables:

- all configured KIM NWP levels and forecast hours have `u`, `v`, and `T`;
- moisture-analysis levels have `rh`;
- `300hPa rh` is not required.

KIM NWP map indexes expose the nearest valid past forecast time plus future valid times. This prevents a just-passed valid time from disappearing immediately.

## Verification

Backend:

- model tests for dewpoint/spread/graded moisture score;
- collection tests for moisture-level `rh` request parameters and `300hPa` exclusion;
- index filtering tests for `T + rh` and moisture-level filtering;
- route smoke for invalid selection rejection and snapshot meta cloud hash.

Frontend:

- field decode and green stepped color tests;
- overlay sync create/update/hide/destroy tests using `spread`;
- hook stale-response/cache behavior if practical within existing test style.

Manual:

- Moisture on turns Wind/Temp off.
- Time and level changes update the Moisture field.
- Basemap switch preserves Moisture overlay.
- Legend labels dewpoint spread (`T-Td C`) and uses green stepped shading.

## Risks

- `T - Td` thresholding can over-highlight broad saturated layers aloft.
- The first phase uses dewpoint over liquid water through the Magnus formula. At subfreezing upper levels, ice-saturation physics is more appropriate for ice clouds, so the product excludes `300hPa` and keeps `500hPa` as the highest selectable level with a looser `6 C` threshold. Further calibration should compare against `cld/tqc/tqi`.
- Broad low-level hit rates during synoptic low-pressure or moist-layer events are not automatically a bug. Do not tighten thresholds merely to reduce coverage without checking observed/cloud-variable evidence.
- KIM run availability lags; older synoptic candidates must remain supported.
- `rh` adds request volume. Keep bounded concurrency and partial failure tolerance. Current scope limits `rh` to four moisture-analysis pressure levels, reducing one `300hPa rh` request per forecast hour compared with collecting every pressure level.
- Cloud variables are available but not yet primary; using them without calibration could mislead users.
- If coverage feels visually heavy in widespread moist conditions, reduce visual weight with alpha/opacity treatment before changing meteorological thresholds. Current rendering uses stepped opacity by spread: strongest near `0-1 C`, weaker near the threshold, transparent above threshold.

## Post-Implementation Adjustments

The implementation evolved from a binary `T - Td <= 3 C` mask to a synoptic moisture-area product:

- `rh` collection is limited to `925/850/700/500hPa`; `10m` and `300hPa` are not requested for this layer.
- `cloudPotential` remains in the API response for compatibility, but rendering uses decoded `spread` values for stepped green shading.
- Level thresholds are `4 C` for `925/850/700hPa` and `6 C` for `500hPa`.
- The UI label is `Moisture`, with a `T-Td C` legend.
- KIM NWP scheduled collection runs around synoptic releases at `00/06/12/18 UTC` plus `+1h/+2h` retry windows, and skips retry work when the latest run is already complete for required variables.
- KIM NWP map indexes expose the nearest past valid time plus future valid times, so a recently passed forecast time remains selectable.
