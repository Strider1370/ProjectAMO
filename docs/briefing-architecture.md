# Route Briefing Architecture Draft

## Goal

Build `ProjectAMO` toward a route-centered aviation briefing system that gathers weather, terrain, advisory, and flight-planning context into one place.

The long-term target is not "show each dataset somewhere on the map". The target is:

- accept a route request
- build a common route axis
- project multiple datasets onto that axis
- return a briefing payload that can drive map, summary, and vertical profile views

## Scope

This draft focuses on the architecture for:

- route briefing data flow
- vertical profile support
- data storage layers
- backend module boundaries
- frontend integration points

This draft does not define the full final UI design.

## Product Direction

The center of the system should move from "airport detail" toward "route briefing".

Current project strengths:

- airport weather and advisory collection
- route-building UI and route geometry
- map overlays and panel composition

Target product behavior:

- user selects departure, route, arrival, and briefing options
- system composes route-aware weather and hazard data
- system shows both lateral and vertical context
- system returns one coherent briefing instead of disconnected widgets

## Design Principles

### 1. Route-first, not dataset-first

Most external aviation datasets arrive as:

- airport-based
- polygon-based
- bulletin-based
- raster/grid-based

The briefing system should convert them into route-aware products rather than exposing raw formats directly to the frontend.

### 2. Preserve raw data

Do not replace all stored data with route-specific or vertical-specific output.

Use layered storage:

- `raw`
- `normalized`
- `briefing-ready`

Route-specific output should be built on demand from the reusable layers above it.

### 3. Use one common axis for profile products

Vertical profile layers must share the same coordinate system:

- `x`: cumulative route distance
- `y`: altitude

Terrain, cruise altitude, advisory bands, icing, turbulence, and wind all become easier to render when projected to the same route axis.

### 4. Keep frontend simple

The frontend should not interpret IWXXM, DEM binaries, or advisory geometry rules directly.

The backend should:

- read and normalize source datasets
- intersect them with the requested route
- return briefing-oriented JSON

## Target Outputs

The system should eventually support two related outputs.

### Route briefing summary

Examples:

- route sequence
- total distance
- departure and arrival weather summary
- route hazards and advisories
- key NOTAM items
- briefing warnings and highlights

### Vertical profile

Examples:

- terrain profile
- planned cruise altitude line
- cloud layer markers
- icing and turbulence bands
- wind and temperature fields
- SIGMET/AIRMET altitude bands
- NOTAM altitude-limited restrictions where applicable

## Core Domain Objects

### RouteBriefingRequest

User intent for one briefing run.

Suggested fields:

- departure airport
- arrival airport
- flight rule
- route type
- selected SID/STAR/IAP if applicable
- route geometry or route tokens
- planned cruise altitude
- requested layers
- target time or valid time

### RouteAxis

The shared sampled path used by briefing and profile builders.

Suggested fields per sample:

- `index`
- `distanceNm`
- `lon`
- `lat`
- `bearingDeg`

Optional later fields:

- `segmentKind`
- `legId`
- `airwayId`
- `procedureId`

### BriefingLayer

A normalized output layer projected onto the route.

Examples:

- terrain layer
- cruise altitude layer
- advisory layer
- cloud layer
- icing layer
- turbulence layer
- wind field layer

## Data Storage Strategy

Use three storage tiers.

### 1. Raw

Purpose:

- preserve source truth
- enable reprocessing when rules change

Examples:

- raw advisory payloads
- raw METAR/TAF parse results
- original DEM binary

### 2. Normalized

Purpose:

- make each dataset internally consistent
- hide source format differences
- support multiple products, not only route briefing

Examples:

- advisory polygons with altitude bands and valid time
- airport cloud layers
- terrain metadata and tile index
- route graph and procedure metadata

### 3. Briefing-ready

Purpose:

- speed up route-aware composition
- avoid repeating expensive preprocessing at request time

Examples:

- DEM tiles for terrain sampling
- advisory spatial indexes
- cached gridded weather volume chunks

Important rule:

- `briefing-ready` data should still be route-independent
- route-specific results belong in request-time composition or short-lived cache

## Dataset Readiness for Briefing

### Already useful for route briefing

- route geometry and route graph
- SIGMET/AIRMET with altitude ranges
- METAR/TAF cloud and weather layers
- AMOS near-surface weather values
- airport metadata
- DEM source file for terrain

### Partially useful

- SIGWX low-level cloud/front products
- airport bulletin content where structure can be extracted
- ADS-B altitude and climb/descent context for future comparison views

### Likely needs new source data later

- full upper-air wind fields
- continuous temperature and humidity fields aloft
- continuous icing and turbulence volumes
- route-usable NOTAM geometry and altitude restrictions if not already available

## Terrain Plan

### Source

Provided DEM source:

- file: `korea3sec.bin.Z`
- integrated Korea 3-arc-second terrain
- `integer*2` binary
- height unit: `1 m`
- stored in order: `E124.00 -> E130.00`, `N33.00 -> N43.00`

Recommended storage location:

- `backend/data/terrain/`

Do not place the DEM under `frontend/public/`.

Reason:

- the full DEM is backend processing input, not browser runtime asset
- sending it to the browser would waste bandwidth and expose unnecessary raw data
- the current project already ignores `backend/data/`, which is appropriate for large local terrain assets

### Recommended architecture

- keep original file as source data
- decompress once to `korea3sec.bin`
- build service-oriented terrain tiles from the raw grid
- sample tiles in backend when a route profile is requested

### Why tiles

Tiles are recommended because:

- the full DEM is large
- route requests only need a subset of the grid
- tile caching will be easier on a small VM
- the same tiles can support future products

Suggested first tile size:

- `1 degree` tiles

Suggested runtime strategy:

- small in-memory tile cache
- bilinear interpolation
- route resampling around `100m` to `250m`

## Composition Pipeline

Target backend pipeline:

1. Build or resolve route geometry
2. Build `RouteAxis`
3. Gather requested normalized datasets
4. Project datasets onto route axis
5. Return composed briefing payload

Suggested internal stages:

### Route axis builder

Responsibilities:

- resample route geometry
- compute cumulative distance
- tag segments by route or procedure context

### Terrain sampler

Responsibilities:

- load terrain tiles
- sample elevations along route axis
- return terrain profile

### Advisory projector

Responsibilities:

- intersect route with SIGMET/AIRMET/NOTAM geometry
- preserve altitude bands and valid time
- convert overlaps into route-distance intervals

### Weather projector

Responsibilities:

- convert airport-based or gridded weather into route-aware layers
- support both profile and summary views

### Briefing composer

Responsibilities:

- merge all route-aware layers
- shape one stable response contract for the frontend

## Backend Module Proposal

Suggested new backend area:

```text
backend/src/briefing/
  route-axis.js
  briefing-builder.js
  advisory-projector.js
  weather-projector.js
  profile-composer.js

backend/src/terrain/
  dem-reader.js
  dem-tiler.js
  terrain-cache.js
  terrain-sampler.js
```

Suggested route endpoints:

- `POST /api/route-briefing`
- `POST /api/vertical-profile`

Possible future consolidation:

- `POST /api/route-briefing` returns summary + optional profile
- `POST /api/vertical-profile` remains as a focused endpoint for profile-only refreshes

## Frontend Integration Proposal

### Existing route flow

Current good integration points:

- route building in `frontend/src/features/route-briefing/lib/routePlanner.js`
- route panel rendering in `frontend/src/features/map/MapView.jsx`

### First frontend additions

- `frontend/src/api/briefingApi.js`
- `frontend/src/api/terrainApi.js` if a separate profile endpoint is kept
- route briefing result block under the existing route panel
- vertical profile chart in the route result area

### Frontend rule

Frontend should consume:

- briefing payload
- profile payload

Frontend should not:

- parse DEM binaries
- perform advisory geometry intersections
- reconstruct altitude bands from raw source XML or bulletin formats

## API Draft

### `POST /api/route-briefing`

Input:

```json
{
  "flightRule": "IFR",
  "departureAirport": "RKSI",
  "arrivalAirport": "RKPC",
  "plannedCruiseAltitudeFt": 9000,
  "routeGeometry": {
    "type": "LineString",
    "coordinates": [
      [126.49, 37.46],
      [126.80, 36.90],
      [127.60, 35.60]
    ]
  },
  "include": {
    "terrain": true,
    "advisories": true,
    "profile": true
  }
}
```

Output shape:

```json
{
  "summary": {},
  "routeAxis": {},
  "profile": {},
  "advisories": {},
  "warnings": []
}
```

### `POST /api/vertical-profile`

Input:

```json
{
  "routeGeometry": {
    "type": "LineString",
    "coordinates": [
      [126.49, 37.46],
      [126.80, 36.90],
      [127.60, 35.60]
    ]
  },
  "plannedCruiseAltitudeFt": 9000,
  "layers": {
    "terrain": true,
    "advisories": true,
    "clouds": true
  }
}
```

Output shape:

```json
{
  "axis": {
    "totalDistanceNm": 182.4,
    "sampleSpacingMeters": 100,
    "samples": []
  },
  "terrain": {
    "unit": "m",
    "values": []
  },
  "flightPlan": {
    "segments": []
  },
  "advisories": {
    "sigmet": [],
    "airmet": [],
    "notam": []
  },
  "weather": {
    "clouds": [],
    "icing": [],
    "turbulence": [],
    "wind": []
  }
}
```

## MVP Recommendation

Do not start by trying to solve every future vertical layer.

Recommended MVP:

1. route axis
2. terrain profile
3. planned cruise altitude line
4. SIGMET/AIRMET altitude bands
5. basic profile UI

Why this MVP:

- route axis becomes reusable immediately
- terrain gives strong visible value
- cruise altitude creates briefing context
- advisory bands prove the projection model
- future weather layers can plug into the same response shape

## Expansion Order After MVP

Suggested order:

1. terrain
2. cruise altitude
3. SIGMET/AIRMET
4. cloud layers from METAR/TAF
5. low-level weather from AMOS
6. structured NOTAM overlays
7. continuous upper-air fields
8. icing and turbulence heatmaps

## Operational Considerations

### Small VM viability

This architecture is compatible with a small instance if implemented carefully.

Key rules:

- never decompress `.Z` files on request
- never load full DEM source per request
- preprocess into tiles
- cache active tiles
- cap route sample density
- project only requested layers

### Caching opportunities

- terrain tile cache
- route-axis cache keyed by route hash
- short-lived profile cache keyed by route hash + layer selection + time

## Open Questions

These questions should be answered before the first production-grade implementation:

- exact binary layout validation for `korea3sec.bin`
- NoData value and edge handling rules for DEM
- route sample spacing default for profile generation
- whether profile layers should be fetched separately or bundled into route briefing
- which upper-air source will provide continuous vertical weather fields
- how NOTAM geometry and altitude restrictions will be normalized

## Working Recommendation

For the next implementation phase:

- keep current dataset storage intact
- add a new briefing subsystem
- build terrain tiling and route-axis first
- treat vertical profile as a backend composition problem
- use one stable frontend-facing profile schema from the beginning

This keeps the current app moving while preparing it for a route-centered briefing product instead of a collection of isolated airport and overlay features.
