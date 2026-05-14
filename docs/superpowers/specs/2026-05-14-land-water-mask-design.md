# Land/Water Mask for Vertical Profile

## Context

Vertical profile terrain currently comes from DEM sampling only. The DEM pipeline returns elevation values but does not carry a reliable land/water classification. Sea areas may appear as 0 m terrain, which makes them visually indistinguishable from flat low terrain or missing visual context.

The project already has Korean administrative boundary polygons in `frontend/public/Geo/sido.json`. Those polygons can be used as a lightweight proxy for land when building a route-profile land/water hint.

This design is intentionally conservative because the deployment target includes a small GCP free-tier VM. Runtime point-in-polygon checks against full SIDO geometry should be avoided if possible.

## Decision

Use a precomputed grid mask derived from `sido.json`, aligned to the existing DEM bounds.

DEM bounds are defined in `scripts/prepare-terrain-tiles.js`:

```js
{ minLon: 124, maxLon: 130, minLat: 33, maxLat: 43 }
```

The mask classifies each grid cell as:

- `1`: land, meaning the cell center is inside a SIDO polygon
- `0`: water or outside SIDO

The mask does not replace DEM elevation. DEM remains the source of terrain height.

## Current Implementation

Added script:

```text
scripts/prepare-land-water-mask.js
```

Default input:

```text
frontend/public/Geo/sido.json
```

Default output:

```text
backend/data/terrain/land-water-mask.json
```

Default grid:

```text
bounds: 124,130,33,43
resolution: 0.01 degrees
```

Usage:

```bash
node scripts/prepare-land-water-mask.js
```

Useful options:

```bash
node scripts/prepare-land-water-mask.js --resolution 0.02
node scripts/prepare-land-water-mask.js --bounds 124,130,33,43
node scripts/prepare-land-water-mask.js --output backend/data/terrain/land-water-mask.json
```

The script writes rows of string cells to keep the file easy to inspect and easy to load later:

```json
{
  "type": "land-water-grid-mask",
  "cellEncoding": "1=land,0=water-or-outside-sido",
  "bounds": { "minLon": 124, "maxLon": 130, "minLat": 33, "maxLat": 43 },
  "resolutionDeg": 0.01,
  "rows": 1000,
  "cols": 600,
  "cells": ["001..."]
}
```

## Runtime Plan

Do not run SIDO polygon checks during vertical-profile requests. Load the generated mask once in the backend terrain layer and use direct grid lookup.

Suggested lookup behavior:

```js
const col = Math.floor((lon - bounds.minLon) / resolutionDeg)
const row = Math.floor((lat - bounds.minLat) / resolutionDeg)
const isLand = cells[row]?.[col] === '1'
```

Suggested terrain sample shape:

```js
{
  index,
  elevationM,
  surface: 'land' | 'water' | 'unknown'
}
```

Recommended classification rule:

1. If the coordinate is outside mask bounds, use `unknown`.
2. If the mask cell is land, use `land`.
3. If the mask cell is water/outside SIDO, use `water`.
4. In the frontend, do not hide meaningful DEM terrain just because `surface` is `water`.

For display decisions, treat DEM height as higher priority than water classification:

```js
const hasMeaningfulTerrain = elevationM > 3
const showWaterBand = surface === 'water' && !hasMeaningfulTerrain
```

This avoids incorrectly hiding islands, foreign land, or any terrain present in the DEM.

## Frontend Display Direction

If this feature is continued, keep the visual treatment quiet:

- Show water as a thin blue band near the 0 ft baseline.
- Do not make water visually stronger than terrain, planned altitude, TOD, or procedure altitude.
- Avoid large legends or explanatory UI unless users ask for it.

The product value is contextual: it helps users understand why a long 0 ft section is flat, but it is not a primary safety signal.

## Verification Done

The script was verified with a small Seoul-area test range:

```bash
node scripts/prepare-land-water-mask.js --bounds 126.9,127.0,37.5,37.6 --resolution 0.05 --output backend/data/terrain/land-water-mask-test.json
```

Observed output:

```text
Grid: 2 x 2 (4 land, 0 water/outside)
```

Syntax check was also run:

```bash
node --check scripts/prepare-land-water-mask.js
```

The temporary test output file was removed. The full default `land-water-mask.json` has not been generated yet.

## Remaining Work

1. Generate the full mask on the target machine:

```bash
node scripts/prepare-land-water-mask.js
```

2. Add a backend mask loader and lookup helper under `backend/src/terrain/`.
3. Extend `terrain-sampler.js` to attach `surface`.
4. Add focused tests for lookup bounds, known land points, known sea points, and DEM-height-priority display behavior.
5. Optionally update `VerticalProfileChart.jsx` to render water bands.

## Non-Goals

- Do not introduce global high-resolution coastline datasets for this first version.
- Do not classify lakes, rivers, mudflats, or detailed coastlines separately.
- Do not make water classification part of terrain clearance or safety calculation.
- Do not perform full polygon checks per vertical-profile request on the GCP free-tier server.
