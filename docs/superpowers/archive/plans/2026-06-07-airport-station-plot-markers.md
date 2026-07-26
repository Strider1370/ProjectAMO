# Airport Station Plot Markers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. This is a lean plan: do not run full verification after every small edit. Run focused unit tests after model/icon work, then run build and screenshot verification after integration.

**Goal:** Replace simple airport dots on the main map with METAR-driven station plot markers showing visibility, present weather, sky cover, ceiling, flight category, and wind barb.

**Architecture:** Keep airport marker rendering in the existing Mapbox source/layer flow under `frontend/src/features/map/`. Add a small pure model helper for METAR-derived marker properties, generated Canvas image helpers for station/cloud and wind icons, then wire those into `baseMapLayers.js` and `MapView.jsx`. No backend/API changes.

**Tech Stack:** Vite, React 19, Mapbox GL JS, Canvas-generated Mapbox images, Node `node:test`, existing ProjectAMO screenshot workflow.

---

## Source Spec

- `docs/superpowers/specs/2026-06-07-airport-station-plot-markers.md`

## Read Before Implementation

- `AGENTS.md`
- `Architecture.md`
- `docs/ui-responsive-guidelines.md`
- `docs/dev-server-and-capture.md`
- `docs/superpowers/specs/2026-06-07-airport-station-plot-markers.md`

## Constraints

- Do not change backend/API files.
- Do not touch VWorld or ADS-B recent changes.
- Keep markers Mapbox source/layer based; do not switch to HTML markers.
- Use current frontend `metarData.airports[icao]`.
- Keep fixed station plot slots:

```text
VIS       WX
    [sky cover + category marker]--- wind barb
          CIG
          ICAO
```

- `VIS` left, `WX` right.
- Center marker: color is flight category, fill pattern is sky cover.
- Ceiling text only for `BKN`, `OVC`, or `VV`.
- Calm wind draws no wind barb.
- Present weather icon uses the same weather resolver concept as the airport panel, but Mapbox receives registered images, not React components.
- Selected airport must keep a visible outer highlight independent of category color.

## Files

- Create: `frontend/src/features/map/lib/airportStationModel.js`
- Create: `frontend/src/features/map/lib/airportStationModel.test.js`
- Create: `frontend/src/features/map/lib/airportStationImages.js`
- Modify: `frontend/src/features/map/lib/baseMapLayers.js`
- Modify: `frontend/src/features/map/MapView.jsx`
- Modify: `Architecture.md` only if file roles or map ownership rules change enough to make the current architecture note stale.

Do not modify airport-panel code unless implementation discovers a shared helper bug.

---

## Phase 1: Data Model

Build the pure METAR-to-marker model first. This is the only part that needs focused unit coverage before map integration.

### Work

- Add `airportStationModel.js`.
- Export a function like:

```js
export function buildAirportStationMarkerModel({ airport, metar }) {
  // returns marker properties for GeoJSON feature properties
}
```

- Derive:
  - `flightCategory`: `VFR`, `IFR`, `LIFR`, or neutral fallback
  - `stationIconId`
  - `skyCover`: `clear`, `few`, `sct`, `bkn`, `ovc`
  - `visibilityText`
  - `ceilingText`
  - `weatherIconId`
  - `windIconId`
  - `windDirection`

- Use existing helpers where possible:
  - `getFlightCategory()` from `frontend/src/shared/weather/helpers.js`
  - `resolveWeatherVisual()` from `frontend/src/shared/weather/weather-visual-resolver.js`

### Model Rules

- Category colors:
  - `VFR`: `#15803d`
  - `IFR`: `#f97316`
  - `LIFR`: `#dc2626`
  - fallback: `#64748b`
- Sky cover priority: `VV/OVC > BKN > SCT > FEW > clear`.
- Ceiling: lowest `BKN/OVC/VV` layer only.
- Ceiling text: hundreds of feet, 3 digits. Example: `800 ft -> 008`.
- Visibility: meters without unit. Example: `800 -> 0800`, `9999 -> 9999`.
- Present weather: only meaningful current weather or reduced-visibility weather. Do not show clear/cloud fallback icons.
- Present-weather filtering must follow the exact allowed/disallowed token list in the source spec; include reduced-visibility tokens such as `BR`, `HZ`, and `FG`, and exclude `NSW`/`CAVOK`.
- Wind bucket: round speed to nearest 5 kt, cap at 60 kt. No wind icon for calm or missing direction/speed.

### Focused Verification

Run once after Phase 1:

```bash
node --test frontend/src/features/map/lib/airportStationModel.test.js
```

Test cases should cover:

- VFR clear marker with no ceiling.
- IFR/LIFR category from low visibility or low ceiling.
- `FEW/SCT` do not produce ceiling text.
- `BKN/OVC/VV` produce ceiling text.
- present weather produces `weatherIconId`.
- reduced-visibility weather such as `BR` or `FG` produces `weatherIconId`.
- `NSW`, `CAVOK`, and clear/cloud-only weather produce no `weatherIconId`.
- calm wind produces no `windIconId`.
- two non-calm winds produce expected 5 kt buckets.

---

## Phase 2: Generated Images

Add Canvas image generation helpers. Keep these helpers small and independent of Mapbox where practical.

### Work

- Add `airportStationImages.js`.
- Export registration helpers:

```js
export function registerAirportStationImages(map) {}
export function registerAirportWindBarbImages(map) {}
export async function registerAirportWeatherImages(map, iconIds) {}
```

- Register station center icons:
  - `3 flight categories x 5 sky-cover states = 15`
  - `1 fallback category x 5 sky-cover states = 5`
- Register wind barb icons:
  - `airport-wind-005` through `airport-wind-060`
- For present weather icons:
  - use existing icon asset URLs from `getWeatherIconSrc(iconId)`
  - load/register only the icon IDs currently present in GeoJSON, or register a small known set if simpler

### Image Rules

- Station clear/no-cloud: empty interior with category-colored stroke.
- Station cloud fill: category-colored wedge/full fill.
- Wind barb:
  - generated with Canvas, not hand-authored SVG
  - north-up base icon
  - white halo stroke first, dark main stroke second
  - 5 kt half barb, 10 kt full barb, 50 kt flag
  - long stem so overlap usually hits stem, not feathers

### Lightweight Verification

Do not overbuild image unit tests unless the drawing code becomes complex. At minimum, verify by build and screenshots after integration.

---

## Phase 3: Mapbox Layer Integration

Wire the new model and images into the existing airport source/layer flow.

### Work

- Change `createAirportGeoJSON(airports)` to accept METAR:

```js
createAirportGeoJSON(airports, metarData)
```

- Keep existing source ID:

```js
AIRPORT_SOURCE_ID = 'kma-weather-airports'
```

- Replace or visually supersede the current simple circle with station marker layers.
- Preserve a click/hover hit target. The old circle layer can become transparent or low-opacity if useful.
- Add a visible selected-airport highlight that remains distinct from VFR/IFR/LIFR category color.
- Place ICAO below `ceilingText` when ceiling exists; when no ceiling exists, keep ICAO in the normal lower label position. Use conditional offset or separate label layers if needed to avoid overlap.
- Export station layer ID constants and include persistent airport station layers in `BASE_MAP_LAYER_IDS`.
- Add layer IDs for:

```text
kma-weather-airports-station-center
kma-weather-airports-wind-barb
kma-weather-airports-visibility
kma-weather-airports-weather
kma-weather-airports-ceiling
kma-weather-airports-label
```

- Ensure every airport marker component can still select the airport and open the airport panel. Prefer binding events to the hit layer, and keep enough hit radius for usability.

### Zoom Behavior

Implement the spec's initial zoom behavior:

| Zoom | Visible marker components |
|---:|---|
| `< 6` | center marker + ICAO only |
| `6-8` | center marker + ICAO + wind barb + present weather |
| `>= 8` | center marker + ICAO + wind barb + present weather + visibility + ceiling |

Use Mapbox layer `minzoom` where simple. Use style expressions only where needed.

---

## Phase 4: MapView Wiring And Style Reload

Make the data and generated images survive style reloads and basemap switches.

### Work

- Update `MapView.jsx`:

```js
const airportGeoJSON = useMemo(
  () => createAirportGeoJSON(airports, metarData),
  [airports, metarData],
)
```

- Before adding station layers after style readiness, register:
  - center station images
  - wind barb images
  - present weather images needed by the current GeoJSON
- Ensure registration runs after Mapbox style reload/basemap switch when `styleRevision` changes.
- Keep existing WFS airport-label hiding behavior.
- Keep selected-airport feature-state logic working with the same source feature IDs.
- Confirm selected highlight still appears after style reload/basemap switch.

### Failure Modes To Avoid

- Missing Mapbox images after basemap switch.
- Click target disappearing because the visual circle layer was replaced.
- Label duplication with WFS airport labels.
- Weather icon registration racing layer creation.

---

## Phase 5: Final Verification

Run grouped verification after implementation is integrated.

### Commands

```bash
node --test frontend/src/features/map/lib/airportStationModel.test.js
npm.cmd run build
```

If `baseMapLayers` helper behavior receives tests or substantial changes, also run:

```bash
node --test frontend/src/features/map/lib/baseMapLayers.test.js
```

### Screenshot Evidence

Follow:

- `docs/ui-responsive-guidelines.md`
- `docs/dev-server-and-capture.md`

Capture focused screenshots under:

```text
artifacts/responsive-screenshots/airport-station-plot-markers/<YYYY-MM-DD_HHMM_label>/
```

Required visual states:

- no-weather VFR airport
- airport with ceiling
- no-ceiling airport with ICAO in normal lower label position
- airport with present weather
- two non-opposite wind directions
- calm wind with no wind barb
- basemap switch/style reload state with no missing images
- selected airport highlight before and after basemap switch

Use fixture/mock data if live METAR does not naturally contain these states.

### Acceptance Checklist

- [ ] Markers derive state from `metarData.airports[icao]`.
- [ ] `VIS` appears left and `WX` appears right.
- [ ] Center marker color reflects `VFR`, `IFR`, or `LIFR`.
- [ ] Clear/no-cloud center marker is outline-only.
- [ ] Cloud cover fill pattern reflects `FEW/SCT/BKN/OVC/VV`.
- [ ] Ceiling appears only for `BKN/OVC/VV`.
- [ ] Wind barb uses 5/10/50 kt notation and rotates correctly.
- [ ] Calm wind draws no wind barb.
- [ ] Airport click/hover/selection still works.
- [ ] Selected airport has a visible highlight independent of category color.
- [ ] ICAO and ceiling labels do not overlap.
- [ ] Browser console has no station-marker missing-image warnings on initial load or after basemap switch.
- [ ] Basemap switch does not produce missing-image warnings.
- [ ] New persistent station layers are represented in `BASE_MAP_LAYER_IDS`.
- [ ] No backend/API files changed.

---

## Suggested Execution Style

Keep implementation in one branch/session. Commit only after the feature is visually verified or at a stable checkpoint.

Recommended split:

1. Data model + tests.
2. Image generation + Mapbox layer integration.
3. Screenshot fixes + final verification.

Do not stop after only adding the data model; the feature is user-visible only when the Mapbox marker layers are integrated and captured.
