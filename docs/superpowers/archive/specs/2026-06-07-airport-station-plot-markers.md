# Airport Station Plot Marker Design

## Purpose

Upgrade the main map airport markers from simple dots into compact METAR-driven station plot markers.

The marker should let the operator identify current airport conditions directly on the map without opening the airport drawer first. It is not a replacement for the airport panel. The map marker should show only the highest-value current METAR cues:

- flight category
- sky cover
- visibility
- ceiling, only when a ceiling exists
- present weather
- wind direction and speed

## User Goal

When looking at the main map, the user should be able to answer these questions within a few seconds:

- Which airports are currently VFR, IFR, or LIFR?
- Is visibility reduced?
- Is there a ceiling that matters?
- Is present weather occurring?
- What direction and strength is the surface wind?

## Confirmed Product Decisions

- Marker data comes from current METAR data already loaded by the frontend.
- Backend/API changes are out of scope.
- Flight category colors are:
  - `VFR`: green
  - `IFR`: orange
  - `LIFR`: red
- `MVFR` is not part of the first design pass unless a separate category rule is approved later.
- Visibility is shown on the left side of the station marker.
- Present weather is shown on the right side of the station marker.
- The marker layout must be spatially consistent. Do not move present-weather or visibility slots dynamically to avoid wind overlap.
- Wind barb overlap is acceptable as long as the long stem remains readable.
- Ceiling is shown only when a real ceiling layer exists.
- Sky cover is represented by the center marker fill pattern.
- Flight category is represented by the center marker color.
- Airports with missing METAR-derived category inputs use a neutral fallback marker until enough data exists; this is not a fourth flight category.

## Marker Grammar

Use a compact fixed station-plot layout:

```text
VIS       WX
    [sky cover + category marker]--- wind barb
          CIG
          ICAO
```

Example:

```text
9999      RA
    (o)-------/
          008
          RKSS
```

### Slot meanings

| Slot | Meaning | Display rule |
|---|---|---|
| Left | Visibility | Eligible when METAR visibility exists; actual display follows zoom behavior |
| Center | Sky cover + flight category | Always visible when airport coordinate exists |
| Right | Present weather | Eligible only for meaningful present weather; actual display follows zoom behavior |
| Below center | Ceiling | Eligible only for BKN/OVC/VV ceiling; actual display follows zoom behavior |
| Below ceiling | ICAO | Always visible when the airport marker is visible |
| Rotating from center | Wind barb | Eligible when wind is not calm and direction/speed are usable; actual display follows zoom behavior |

## Center Marker

The center marker combines sky cover and flight category.

### Flight category color

Use these map marker colors:

```js
const AIRPORT_CATEGORY_COLORS = {
  VFR: '#15803d',
  IFR: '#f97316',
  LIFR: '#dc2626',
}
```

If category cannot be calculated from METAR visibility and ceiling, use a neutral fallback marker. This fallback is for missing/insufficient marker data only and must not be labeled as `VFR`, `IFR`, `LIFR`, or `MVFR`.

```js
const AIRPORT_CATEGORY_UNKNOWN_COLOR = '#64748b'
```

### Sky cover fill

The center marker shape follows station plot sky-cover logic:

| METAR cloud state | Center marker fill |
|---|---|
| `CAVOK`, `NSC`, `NCD`, `SKC`, `CLR`, no cloud layer | empty circle with category-colored stroke |
| `FEW` | one-quarter fill |
| `SCT` | one-half fill |
| `BKN` | three-quarter fill |
| `OVC`, `VV` | full fill |

When multiple cloud layers exist, choose the highest-coverage relevant layer by cloud amount priority:

```text
VV/OVC > BKN > SCT > FEW > clear
```

This is for marker shape only. Ceiling uses a separate rule.

### Rendering approach

Mapbox `circle` layers cannot express quarter/half/three-quarter sky-cover fills cleanly. Render the center marker as generated image icons and register them with `map.addImage()`.

Generate one icon per category and sky-cover combination:

```text
airport-station-vfr-clear
airport-station-vfr-few
airport-station-vfr-sct
airport-station-vfr-bkn
airport-station-vfr-ovc
airport-station-ifr-clear
...
airport-station-lifr-ovc
```

Initial count:

```text
3 flight categories x 5 sky-cover states = 15 center icons
1 neutral fallback category x 5 sky-cover states = 5 fallback center icons
```

The generated center icon should be small and high contrast:

- base canvas: `48x48` or `64x64` logical drawing space
- visible circle radius: `6-8 px`
- stroke: category color
- fill: category color only for sky-cover wedges/full cover
- clear/no-cloud interior: transparent/empty
- halo: white or near-white stroke underlay for basemap contrast
- selected airport: separate outer highlight layer or selected feature-state variant

## Visibility

Visibility is displayed to the left of the center marker.

### Formatting

Use compact text, no unit suffix:

| Source value | Marker text |
|---:|---|
| `9999` | `9999` |
| `5000` | `5000` |
| `1500` | `1500` |
| `800` | `0800` |
| CAVOK with no explicit lower visibility | `CAVOK` |

Keep exact meter values for Korean METAR visibility. Do not convert to statute miles.

### Placement

Use a dedicated Mapbox `symbol` text layer:

```js
layout: {
  'text-field': ['get', 'visibilityText'],
  'text-offset': [-1.25, 0],
  'text-anchor': 'right',
  'text-size': [
    'interpolate', ['linear'], ['zoom'],
    6, 10,
    9, 11,
    12, 12,
  ],
}
```

Use text halo to preserve readability over radar, satellite, terrain, and dark basemaps.

## Ceiling

Ceiling is displayed only when the METAR has a ceiling layer.

### Ceiling rule

Treat only these cloud amounts as ceiling:

```text
BKN, OVC, VV
```

Do not show ceiling text for:

```text
FEW, SCT, NSC, NCD, SKC, CLR, CAVOK
```

Choose the lowest ceiling layer among `BKN`, `OVC`, and `VV`.

### Formatting

Display hundreds of feet as a three-digit station-plot value:

| Ceiling feet | Marker text |
|---:|---|
| `800` | `008` |
| `1500` | `015` |
| `2400` | `024` |
| `10000` | `100` |

### Placement

Use a dedicated Mapbox `symbol` text layer below the center marker:

```js
layout: {
  'text-field': ['get', 'ceilingText'],
  'text-offset': [0, 1.0],
  'text-anchor': 'top',
}
```

The ICAO label should sit below the ceiling. If no ceiling exists, ICAO can occupy the normal lower label position.

## Present Weather

Present weather is displayed to the right of the center marker.

### Data source

Use the existing frontend weather visual resolver used by the airport panel:

```js
import { resolveWeatherVisual } from '../../../shared/weather/weather-visual-resolver.js'
```

For each airport:

```js
const metar = metarData?.airports?.[icao]
const obs = metar?.observation
const time = metar?.header?.observation_time || metar?.header?.issue_time
const visual = resolveWeatherVisual(obs, time)
```

### Display filter

Do not show decorative clear/cloud icons on the map.

Show present-weather icons only when `visual.source === 'weather'` and the code indicates meaningful present weather or reduced visibility:

```text
RA, DZ, SN, SG, IC, PL, GR, GS, UP,
SH*, TS*, FZ*,
FG, BR, HZ, FU, VA, DU, SA,
PO, SQ, FC, SS, DS, BLSN, BLSA, BLDU, DRSN, DRSA, DRDU
```

Do not show icons for:

```text
NSW, CAVOK, clear-day, clear-night, unknown, cloud-only visual fallbacks
```

### Rendering approach

The airport panel can render `<WeatherIcon />` directly because it is React DOM. Mapbox symbol layers cannot render React components directly.

Use `visual.iconId` to map to an image registered in Mapbox:

```js
properties.weatherIconId = `airport-wx-${visual.iconId}`
```

Load or generate the icon images before adding the weather symbol layer. If using existing SVG assets, register them as Mapbox images. If SVG edges look poor at small sizes, render them into Canvas at a fixed high-DPI size first, then register the pixel data.

### Placement

Use a fixed right-side slot:

```js
layout: {
  'icon-image': ['get', 'weatherIconId'],
  'icon-offset': [1.2, 0],
  'icon-anchor': 'left',
  'icon-size': [
    'interpolate', ['linear'], ['zoom'],
    6, 0.34,
    9, 0.42,
    12, 0.5,
  ],
}
```

Do not move the present-weather icon to avoid wind barb overlap.

## Wind Barb

Render wind barbs as generated Canvas images registered with Mapbox `addImage()`. Do not use hand-authored SVG as the primary implementation, because small rotated SVG strokes tend to look uneven on map backgrounds.

### Reference behavior

Use standard station plot wind-barb semantics:

```text
5 kt  = half barb
10 kt = full barb
50 kt = filled flag
```

Wind is plotted in 5 kt increments. Calm wind should not show a wind barb; the center marker remains visible.

### Icon generation

Generate speed-bucket icons once per map style load:

```text
airport-wind-005
airport-wind-010
airport-wind-015
...
airport-wind-060
```

For speeds above `60 kt`, use `airport-wind-060` for the first pass. A later enhancement can add higher buckets if needed.

Bucket rule:

```js
const bucket = Math.min(60, Math.round(speedKt / 5) * 5)
```

### Canvas drawing rules

Use a high-DPI Canvas drawing function:

```js
function createWindBarbImage(speedKt, {
  size = 72,
  pixelRatio = window.devicePixelRatio || 1,
  color = '#0f172a',
  halo = '#ffffff',
} = {}) {
  // returns { width, height, data } for map.addImage()
}
```

Drawing conventions:

- draw the icon in a north-up orientation
- place the station center at the middle of the canvas
- draw the stem from center upward
- keep the stem long enough that overlap mostly affects the stem, not the barb feathers
- draw halo first, then the main dark stroke
- use `lineCap = 'round'` and `lineJoin = 'round'`
- use a filled triangle for 50 kt flags
- draw 10 kt full barbs and 5 kt half barbs from the far end of the stem toward the center

Suggested logical geometry:

```js
const centerX = size / 2
const centerY = size / 2
const stemLength = 28
const barbLength = 10
const halfBarbLength = 6
const barbSpacing = 5
const barbAngleDeg = 60
const haloWidth = 4
const strokeWidth = 2
```

### Direction and rotation

METAR wind direction is the direction from which the wind blows. The wind barb outer end should point toward the direction from which the wind is blowing.

Draw the generated icon with its stem pointing north. Then rotate using the METAR wind direction:

```js
layout: {
  'icon-image': ['get', 'windIconId'],
  'icon-rotate': ['get', 'windDirection'],
  'icon-rotation-alignment': 'map',
  'icon-anchor': 'center',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
}
```

If screenshot verification shows the barb pointing 180 degrees off, apply a data-model correction:

```js
windBarbRotation = (windDirection + 180) % 360
```

Do not guess this correction without screenshot evidence.

### Gust

Do not encode gust in the initial wind barb icon. Gust can be added later as a subtle ring, small `G` label, or stronger wind color. First-pass marker should keep the wind glyph readable.

## GeoJSON Data Model

Extend airport GeoJSON creation to merge METAR-derived marker properties.

Current source:

```js
createAirportGeoJSON(airports)
```

Proposed source:

```js
createAirportGeoJSON(airports, metarData)
```

Feature properties:

```js
{
  icao: 'RKSI',
  name: 'Incheon',
  flightCategory: 'VFR',
  categoryColor: '#15803d',
  skyCover: 'clear' | 'few' | 'sct' | 'bkn' | 'ovc',
  stationIconId: 'airport-station-vfr-clear',
  visibilityText: '9999',
  ceilingText: '',
  weatherIconId: '',
  windIconId: 'airport-wind-010',
  windDirection: 110,
}
```

Keep derived property generation in a small pure helper so it can be tested without Mapbox.

Suggested helper:

```text
frontend/src/features/map/lib/airportStationModel.js
```

Responsibilities:

- read METAR observation/header fields
- compute flight category with existing weather helpers
- compute sky-cover state
- compute ceiling text
- compute visibility text
- compute present-weather icon id
- compute wind icon id and wind rotation

## Mapbox Layer Model

The station marker should remain feature-layer based. Avoid HTML markers for the first implementation because the current map uses Mapbox source/layer ownership, feature-state selection, and style reload synchronization.

Suggested layers:

```text
kma-weather-airports-station-center
kma-weather-airports-wind-barb
kma-weather-airports-visibility
kma-weather-airports-weather
kma-weather-airports-ceiling
kma-weather-airports-label
```

Layer ordering:

1. center station icon
2. wind barb
3. visibility text
4. present weather icon
5. ceiling text
6. ICAO label

The existing airport click target must remain easy to hit. If the circle layer is replaced visually, preserve a transparent or low-opacity hit layer using the same source.

## Zoom Behavior

Avoid making low-zoom maps visually noisy.

Initial zoom behavior:

| Zoom | Visible marker components |
|---:|---|
| `< 6` | center marker + ICAO only |
| `6-8` | center marker + ICAO + wind barb + present weather |
| `>= 8` | center marker + ICAO + wind barb + present weather + visibility + ceiling |

Exact thresholds should be adjusted from screenshots.

## Interaction

- Clicking any airport marker component should select the airport and open the airport panel.
- Hover should use the same pointer behavior as the existing airport circle layer.
- Selected airport should preserve a clear selected state independent of category color.
- Existing WFS airport label hiding behavior should still hide duplicate labels where active airport station markers exist.

## Accessibility And Operational Clarity

- Do not rely on color alone for sky-cover; shape/fill communicates cloud amount.
- Category still uses color because it is a known aviation map convention, but the airport panel remains the text source of truth.
- Keep text short enough that radar/satellite overlays remain readable.
- Use halo strokes for text and line icons.
- Do not show clear/weather decorative icons on every airport.

## Out Of Scope

- Backend/API changes.
- TAF-based forecast station plots.
- AMOS-specific wind or runway wind substitution.
- Pressure, temperature, dewpoint, pressure tendency, and altimeter in map marker.
- Dynamic weather icon relocation to avoid wind barb overlap.
- Full official station-model replication.
- MVFR introduction unless product category thresholds are separately approved.

## Acceptance Criteria

- Airport markers derive current state from `metarData.airports[icao]`.
- Center marker color reflects `VFR`, `IFR`, or `LIFR`.
- Center marker fill reflects sky-cover state.
- Visibility appears on the left at high enough zoom.
- Present weather appears on the right only when meaningful present weather exists.
- Ceiling appears only for BKN/OVC/VV ceiling layers.
- Wind barb renders with standard 5/10/50 kt notation and rotates with METAR wind direction.
- Calm wind does not draw a wind barb.
- Generated center, wind, and present-weather images are registered or re-registered after Mapbox style reload and basemap switching.
- Browser console does not show missing-image warnings for station marker icons after initial load or basemap switch.
- Existing airport selection and panel opening behavior still works.
- No backend/API files are changed.
- Map screenshots verify at least:
  - no-weather VFR airport
  - airport with ceiling
  - airport with present weather
  - wind barb at two different non-opposite directions
  - calm wind state with no wind barb
  - station marker state after basemap switch/style reload

## Verification Commands

Expected focused tests after implementation:

```bash
node --test frontend/src/features/map/lib/airportStationModel.test.js
npm.cmd run build
```

If airport marker Mapbox sync helpers receive unit tests, also run the relevant existing map tests:

```bash
node --test frontend/src/features/map/lib/baseMapLayers.test.js
```

Because this is visible UI work, also follow `docs/ui-responsive-guidelines.md` and `docs/dev-server-and-capture.md`, then capture focused map screenshots in:

```text
artifacts/responsive-screenshots/airport-station-plot-markers/<YYYY-MM-DD_HHMM_label>/
```

## References

- NOAA/WPC station plot guidance: wind barbs use 5 kt increments, 10 kt lines, 5 kt half-lines, 50 kt flags, and sky cover is represented by center-circle fill.
- Mapbox GL JS supports generated runtime icons through `map.addImage()`.
- Mapbox symbol layers support `icon-rotate` for data-driven icon rotation.
