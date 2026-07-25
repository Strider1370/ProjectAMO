# KIM Icing Potential Layer Spec (K-FIP-inspired, NE57)

> **Revision 2026-07-25 — icing level set widened to match the temperature cross-section.**
> Phase-1 shipped icing on `925/850/700/600/500/400/300hPa`, so the route vertical section showed
> icing over a much shorter span than temperature (21 pressure levels). `KIM_NWP_ICING_LEVEL_IDS` is now
> derived as every pressure level `>= 300hPa` (1000 → 300, 18 levels). `250/200/150hPa` stay uncollected:
> they are structurally below the `-35 C` hard gate, so they would always encode class 0, which the
> renderer draws as fully transparent — collecting them costs ~924 KMA calls/day for zero pixels.
> Added collector load: 11 new levels x 7 icing variables x 11 forecast hours x 4 runs/day = **+3,388 calls/day**.
> The `300hPa` exclusion in "Scope" below is superseded (300hPa has been collected since a prior revision).
> Companion frontend fix: with the Icing layer on, levels lacking icing data no longer fall back to
> moisture shading in `VerticalProfileChart.jsx` — "no icing" and "moist" must not share a color.

## Purpose

Add a KIM NWP in-flight icing-potential overlay that reconstructs the SFIP/K-FIP family of icing guidance using only the KIM 8 km global model (KIMG/NE57) pressure-level products this project already ingests.

This is a **research/operational guidance proxy**, not an official icing forecast, SIGWX product, or certified severity. The UI and naming must say "Icing Potential (K-FIP-inspired)" and must not imply an official observation or certified severity.

## Background

The K-FIP-lite research plan (`reference/NWP/...`, internal research note) is written for the KIM **regional** model `r030` (KIMR, 12 km, GRIB endpoints) whose hydrometeor variables are `clmr/rwmr/icmr/snmr/grle/frcc`. This project uses the KIM **global** 8 km model (KIMG/NE57) through `nph-kim_nc_xy_txt2`. The official NE57 pressure-level variable table (`g576_v091_glob_prs.*.nc`) and a live API probe on 2026-05-20 (run `2026051912`, 850 hPa, hf 0) confirm NE57 exposes the equivalent variables, so the algorithm can be implemented on NE57 directly without adding r030.

### Live-verified NE57 variable mapping

| K-FIP-lite need | r030 name | NE57 name | NE57 meaning | probe |
|---|---|---|---|---|
| cloud liquid water | clmr | `tqc` | mass_fraction_of_cloud_liquid_water_in_air (kg/kg, per level) | OK |
| cloud ice | icmr | `tqi` | mass_fraction_of_cloud_ice_in_air | OK |
| rain | rwmr | `tqr` | mass_fraction_of_rain_in_air | OK |
| snow | snmr | `tqs` | mass_fraction_of_snow_in_air | OK |
| graupel | grle | — | not provided by NE57 | n/a |
| cloud fraction | frcc | `cld` | cloud_area_fraction_in_layer | OK |
| vertical velocity | dzdt | `w` | upward_air_velocity (m/s) | OK |
| temperature | tmpr | `T` | air_temperature (K) | already ingested |
| relative humidity | rhwt | `rh` / `rh_liq` | RH, and RH w.r.t. water | OK |
| geopotential height | ghgt | `hgt` | geopotential_height (m) | already ingested |

**Only graupel (`grle`) is missing.** It is used by the plan as a phase-penalty/convective-contamination term; dropping it has negligible impact on a guidance product.

## Scope

In scope:

- Add NE57 pressure-level `w`, `tqc`, `tqi`, `tqr`, `tqs`, `cld`, `rh_liq` to the existing `DATA_PATH/kim_nwp/` canonical grids alongside `u/v/T/rh`.
- Derive a continuous icing-potential score (0..1) and an ordinal potential class (0..3) at API/render time.
- Implement an SFIP-base reference score and the K-FIP-lite phase-aware extension.
- Extend the shared `KIM_NWP_LEVELS` with `600hPa` and `400hPa` (wind `u/v` and temp `T` collect at all pressure levels, so this also adds `600/400` to the wind/temp overlays — intended).
- Icing levels: `925hPa`, `850hPa`, `700hPa`, `600hPa`, `500hPa`, `400hPa` (pressure only; `300hPa` excluded — always below -35 C, gated to NONE; `10m` excluded — surface, not in-flight).
- Forecast hours already configured in `KIM_NWP_FORECAST_HOURS`.
- Add `GET /api/kim/icing/index` and `GET /api/kim/icing/field`.
- Add a frontend Icing fetch API, hook, raster renderer, legend, and MET panel toggle.
- Reuse the existing KIM NWP time/level sliders.
- Keep Wind, Temp, Cloud, and Icing mutually exclusive in the map UI for this phase.

Out of scope:

- Graupel term.
- Route-briefing icing risk bands and route vertical cross-section.
- Verification against PIREP/AMDAR/GK2A (this is a separate research/validation track; see Validation note).
- Membership/threshold calibration against observations (phase-1 ships literature default control points only).
- Time interpolation and vertical interpolation.
- Ensemble / time-lag products.
- Certified severity wording or official "icing forecast" labeling.
- `10m`/surface icing.
- Persisting derived score/grade as separate physical grid files (derive on request, like cloud potential).
- Changing the Moisture layer's level set (stays `925/850/700/500`).

## Product Behavior

- Icing overlay appears as a soft, semi-transparent raster, colored by potential class.
- Higher potential is more visible; NONE/dry/out-of-gate areas are transparent.
- Legend reads "Icing Potential" (K-FIP-inspired) with class labels, never "Icing Forecast" or certified severity.
- If no selectable future icing grid exists, Icing shows unavailable and never stays in `loading`.
- Basemap switches preserve the active Icing overlay.
- Turning Icing on turns Wind/Temp/Cloud off (mutual exclusion).

## Algorithm

Three layers are kept distinct so reviewers can separate "literature reproduction" from "NE57-specific extension."

### 1. Hard gate

Following the GK2A ICING ATBD outer condition, the score is forced to 0 outside:

```text
-35 C <= T <= 0 C   AND   RH_liq >= 60 %
```

`rh_liq` (RH with respect to water) is used for the gate and moisture membership because in-flight icing is governed by supercooled liquid water; this is the NE57 advantage over a single ice/water-ambiguous RH.

### 2. SFIP-base reference score

```text
S_base = M_T(T) * ( 0.35 * M_RH(RH_liq) + 0.20 * M_W(w) + 0.45 * M_CL(tqc) )
```

This is the literature baseline (Belo-Pereira 2015 / Morcrette 2019 weights). It uses only `T, rh_liq, w, tqc`.

### 3. K-FIP-lite phase-aware score

```text
liquid_ratio  = (tqc + tqr) / (tqc + tqr + tqi + tqs + eps)

phase_penalty = clip( (0.60 - liquid_ratio) / 0.60 , 0, 1 )

B_frz         = 1[ -8 <= T <= 0.5  AND  RH_liq >= 85 ] * min(1, tqr / 2e-4)

S_lite = clip(
  M_T * ( 0.20*M_RH(RH_liq) + 0.15*M_W(w) + 0.25*M_CL(tqc)
        + 0.20*M_LQ(liquid_ratio) + 0.20*M_CC(cld) )
        * (1 - 0.30*phase_penalty)
  + 0.10 * B_frz,
  0, 1)
```

Notes vs the r030 plan:
- `clmr -> tqc`, `rwmr -> tqr`, `icmr -> tqi`, `snmr -> tqs`.
- `grle` dropped from `liquid_ratio` denominator (NE57 has no graupel).
- `B_frz` uses `tqr` with the same `2e-4` kg/kg sensitivity scale.
- Moisture inputs use `rh_liq`.

### Membership control points (literature defaults; calibration is out of scope)

| function | control points (x, y) | shape |
|---|---|---|
| M_T(T °C) | (1,0),(0,0.3),(-4,0.8),(-8,1),(-15,1),(-20,0.7),(-30,0.2),(-35,0) | piecewise linear |
| M_RH(RH_liq %) | (60,0),(75,0.25),(85,0.65),(92,0.9),(98,1) | piecewise linear |
| M_W(w m/s) | (-0.1,0),(0,0.05),(0.05,0.25),(0.2,0.7),(0.5,1) | piecewise linear |
| M_CL(tqc kg/kg) | (1e-7,0),(1e-6,0.2),(1e-5,0.5),(1e-4,0.85),(5e-4,1) | log-scale linear |
| M_LQ(liquid_ratio) | (0.1,0),(0.3,0.25),(0.5,0.55),(0.7,0.85),(0.9,1) | piecewise linear |
| M_CC(cld 0..1) | (0.1,0),(0.3,0.25),(0.6,0.7),(0.8,1) | piecewise linear |

### Potential-class cutoffs (conservative)

| score | encoded class | UI label | extra condition |
|---|---:|---|---|
| < 0.15 | 0 | None | valid hard-gated cells are encoded as 0/None |
| 0.15–0.40 | 1 | Low potential | — |
| 0.40–0.70 | 2 | Medium potential | — |
| >= 0.70 | 3 | High potential | only if `M_CL(tqc) >= 0.7` OR `B_frz >= 0.5`; otherwise capped at class 2 |

The encoded class is a potential class, not predicted or certified icing severity. UI labels must avoid aviation severity wording such as "light/moderate/severe icing." Missing input cells use the missing sentinel, while valid cells that fail the hard gate use score `0` and class `0`.

## Backend Contract

Each `grid.json` stays one canonical `tmfc + hf + level` grid; icing adds variables to the same shape:

```json
{
  "type": "kim_nwp_grid",
  "variables": {
    "T":   { "unit": "K",     "encoding": "int16-scaled-json-v1", "scale": 0.01, "values": [] },
    "rh":  { "unit": "%",     "encoding": "int16-scaled-json-v1", "scale": 0.01, "values": [] },
    "rh_liq": { "unit": "%",  "encoding": "int16-scaled-json-v1", "scale": 0.01, "values": [] },
    "w":   { "unit": "m/s",   "encoding": "int16-scaled-json-v1", "scale": 0.001, "values": [] },
    "tqc": { "unit": "kg/kg", "encoding": "int16-scaled-json-v1", "scale": 2e-7, "values": [] },
    "tqi": { "unit": "kg/kg", "encoding": "int16-scaled-json-v1", "scale": 2e-7, "values": [] },
    "tqr": { "unit": "kg/kg", "encoding": "int16-scaled-json-v1", "scale": 2e-7, "values": [] },
    "tqs": { "unit": "kg/kg", "encoding": "int16-scaled-json-v1", "scale": 2e-7, "values": [] },
    "cld": { "unit": "1",     "encoding": "int16-scaled-json-v1", "scale": 0.0001, "values": [] }
  }
}
```

Note: hydrometeor values are ~1e-7..1e-3 kg/kg, so the default `0.01` scale is too coarse. The model helper must support a **per-variable scale** (existing encoder uses a fixed scale and must be generalized, or a per-variable scale must be stored and honored on decode). This is a required model change.

Icing field API response:

```js
{
  type: 'kim_nwp_icing_potential',
  variant: 'k-fip-lite',
  grid,
  time: { tmfc, hf, validTime },
  level,
  units: { icingScore: '0..1', icingGrade: 'ordinal' },
  thresholds: { gateTempMinC: -35, gateTempMaxC: 0, gateRhLiqMin: 60 },
  stats: { maxScore, meanScore, possibleFraction },
  encoding: 'int16-scaled-json-v1',
  scale: 0.0001,
  offset: 0,
  icingScore: [],                 // 0..1 scaled, NaN -> sentinel
  icingGrade: []                  // 0=None,1=Low,2=Medium,3=High; missing -> sentinel
}
```

API routes:

```text
GET /api/kim/icing/index
GET /api/kim/icing/field?tmfc=...&hf=...&level=...
```

- Index exposure requires `T`, `rh_liq`, `w`, `tqc`, `tqi`, `tqr`, `tqs`, `cld` all present, reusing `filterKimNwpIndexForVariables` + `filterKimNwpIndexForMap`.
- `S_base` is implemented and tested internally for comparison, but phase 1 exposes only `k-fip-lite`; there is no public `variant` query parameter.
- Field response must not expose raw `u/v` arrays.
- Missing/sentinel handling matches existing cloud/temp policy (`-32768` -> NaN; NaN cells transparent; stats exclude NaN).
- Snapshot meta adds `kimNwp.variables.icing.hash`.

## Frontend Contract

- Add `fetchKimIcingIndex`, `fetchKimIcingField`.
- Add `useKimIcing` (index/field hook) with the established race-safety: AbortController, monotonic request token, `Map` cache keyed `tmfc:hf:level:icing`, snapshot-hash-driven refetch, empty-index -> unavailable.
- Add `icingPotentialField.js`: decode score/grade, color ramp, sampler, labels.
- Add `icingPotentialOverlaySync.js`: Mapbox image-source lifecycle (client Canvas 2D -> image source, matching cloud/temp).
- Add `Icing` toggle to the MET panel; extend Wind/Temp/Cloud/Icing mutual exclusion.
- Wire Icing in `MapView.jsx` at the hook/sync/legend/slider boundary only. `MapView.jsx` must not decode score or draw rasters.

## Verification (build-time)

Backend:
- model tests: dewpoint not needed here; test M_* membership interpolation, liquid_ratio, phase_penalty, B_frz, hard gate, potential-class mapping incl. the class-3 extra condition.
- collection tests: pressure-level request params for `w/tqc/tqi/tqr/tqs/cld/rh_liq`; partial failure omits only the affected `level+hf`; icing failure must not break wind/temp/cloud.
- index filtering tests: icing index requires the full variable set.
- route smoke: invalid `tmfc/hf/level` rejected; field has `type: kim_nwp_icing_potential` and no raw `u/v`.

Frontend:
- field decode/color tests (incl. sentinel -> transparent, grade->color).
- overlay sync create/update/hide/destroy.
- hook stale-response/cache and empty-index-unavailable.

Manual:
- Icing on turns Wind/Temp/Cloud off.
- Time/level changes update the field.
- Basemap switch preserves overlay.
- Legend labels "Icing Potential (K-FIP-inspired)", not certified severity.

## Validation note (separate research track, not phase-1)

Scientific validation against PIREP/AMDAR/GK2A/WIFS (the research plan's core) is **not** part of this map-overlay phase. It requires observation matching, blocked temporal splits, and threshold recalibration, and should be its own spec/plan. Phase-1 ships literature-default control points clearly labeled as uncalibrated guidance.

## Future Consideration: Route Vertical Sections

Route-based vertical sections are not part of this implementation. A later spec/plan should revisit how to display wind, temperature, moisture/cloud, and icing potential along a flight path.

Considerations for that later work:

- Reuse the canonical `tmfc + hf + level` KIM NWP grids where practical.
- Reuse backend-derived helpers for moisture spread and icing potential instead of duplicating those formulas in UI code.
- Decide whether route-section "cloud" means the current Moisture (`T - Td`) product, `cld` cloud fraction, or both.
- Decide whether to collect `hgt` for a real altitude axis instead of pressure-level-only display.
- Decide how route-axis sampling, vertical interpolation, and chart rendering should fit under the existing route-briefing backend/frontend boundaries.

## Risks

- Icing potential is a model-derived proxy, not certified severity; naming and legend must stay conservative.
- Membership control points are literature defaults, uncalibrated for the Korea/NE57 regime; over/under-highlighting is expected until validated.
- `grle` absence slightly weakens convective phase penalty; acceptable for guidance.
- Adding `w/tqc/tqi/tqr/tqs/cld/rh_liq` increases collector requests substantially (7 extra variables x 6 icing levels x N forecast hours, one HTTP call per variable). **Confirmed 2026-05-20: `nph-kim_nc_xy_txt2` does NOT accept comma-separated `name=` (a `name=tqc,tqi` call returns `NetCDF: Variable not found`), so each variable is a separate call.** Combined with existing wind/temp/cloud variables this approaches ~900+ calls/run; use `collect_icing`, bounded effective concurrency, partial-failure tolerance, and the retry-skip completeness guard. Lazy or split collection remains a later optimization if measured run duration is unacceptable.
- Hydrometeor values are tiny (1e-7..1e-3 kg/kg); the encoder must use per-variable scale or precision will be lost.
- Adding `600/400` to the shared `KIM_NWP_LEVELS` changes shipped wind/temp overlays (new selectable levels, more requests). This is intended (winds/temps aloft are useful) but requires wind/temp regression coverage and a frontend slider check.
- Collector request volume grows to ~900+ calls/run (multi-name unsupported, one call per variable). `collect_icing` gating + bounded concurrency + retry-skip guard required; the retry-skip completeness check must include icing variables or icing will never collect.
- `300hPa` is excluded from icing (almost always below -35 C, gated to NONE); it remains in `KIM_NWP_LEVELS` only for pre-existing wind/temp behavior.

## Open Questions

- ~~Does `nph-kim_nc_xy_txt2` accept multiple comma-separated `name=` values?~~ **Resolved 2026-05-20: NO** (`NetCDF: Variable not found`). One HTTP call per variable; design collection accordingly.
- Confirm `w` sign/units convention (upward positive, m/s) against a known ascent case so `M_W` is oriented correctly. Probe shows signed values (e.g. -0.298) in the m/s range, consistent with `upward_air_velocity`, but the positive orientation should be spot-checked on a known convective cell during the plan stage.
- Confirm `tqc/tqi/tqr/tqs` units are kg/kg as documented (not g/kg) by spot-checking magnitudes with a clean per-cell parser during the plan stage (the spec's encoder scales assume kg/kg ~1e-7..1e-3).
