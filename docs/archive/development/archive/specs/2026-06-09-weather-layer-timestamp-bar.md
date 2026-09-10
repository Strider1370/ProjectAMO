# Weather Layer Timestamp Bar

**Date:** 2026-06-09

## Goal

When a weather layer is toggled on, display its issued time (발표시각) and valid time (유효시간) in a compact strip at the top of the map. Layers with no time data show nothing.

## Scope

Layers covered:
- Wind, Temp, Cloud (Moisture), Icing — each shown separately, all share `nwpSelection` time
- Turbulence (KTG) — separate entry
- 비행기상구역 (flightCategory) — separate entry, issued time only (no valid time in source data)

Layers excluded (already have time display elsewhere):
- 레이더 / 위성 / 낙뢰 → WeatherTimelineBar
- SIGWX → SigwxHistoryBar
- ADS-B → AdsbTimestamp
- SIGMET / AIRMET → not requested

## Time Data Sources

| Layer | 발표시각 | 유효시간 |
|---|---|---|
| Wind / Temp / Cloud / Icing | `nwpSelection.tmfc` (KST 12-digit) | `parseSigwxTmfcToMs(tmfc) + hf * 3600000` → ISO |
| Turbulence | `ktgGrid.tmfc` | `ktgGrid.validTime` (ISO string) |
| 비행기상구역 | `flightCategoryGeojson.fetched_at` (ISO) | — |

## Formatting

Reuse existing formatters:
- `formatSigwxStamp(value, tz)` — handles both KST 12-digit (`tmfc`) and ISO strings
- `useTimeZone` hook — KST/UTC toggle consistent with rest of app

Output format: `MM/DD HH:MM KST` or `MM/DD HH:MM UTC`

## Model Changes (`weatherOverlayModel.js`)

Add inputs:
- `nwpSelection` — `{ tmfc, hf }` from useNwpOverlays
- `ktgGrid` — from useKtgTurbulence (may be null)
- `flightCategoryGeojson` — from useFlightCategory (may be null)

Add outputs:
- `nwpIssueLabel` — `formatSigwxStamp(nwpSelection?.tmfc, tz)`
- `nwpValidLabel` — valid ISO string from `tmfc + hf hours`, formatted
- `ktgIssueLabel` — `formatSigwxStamp(ktgGrid?.tmfc, tz)`
- `ktgValidLabel` — `formatSigwxStamp(ktgGrid?.validTime, tz)`
- `flightCategoryIssueLabel` — `formatSigwxStamp(flightCategoryGeojson?.fetched_at, tz)`

Valid time for NWP: `new Date(parseSigwxTmfcToMs(tmfc) + hf * 3600000).toISOString()`
Use `parseSigwxTmfcToMs` (already in `weatherOverlayModel.js`) for `tmfc` → ms.

## New Component: `WeatherLayerTimestampBar`

File: `frontend/src/features/weather-overlays/WeatherLayerTimestampBar.jsx`

Props:
```js
{
  entries: [
    { key: string, label: string, issueLabel: string, validLabel?: string }
  ]
}
```

Renders a `<div className="layer-timestamp-bar">` at the top of the map.
Each entry = one row: `[label]  발표 {issueLabel}  유효 {validLabel}` (유효 omitted if null).
Returns null when entries is empty.

`entries` is built in MapView from the model outputs + visibility state:
- `wind` on + `nwpIssueLabel` → `{ key: 'wind', label: 'Wind', issueLabel, validLabel: nwpValidLabel }`
- `temp` on → `{ key: 'temp', label: 'Temp', ... }`
- `cloud` on → `{ key: 'cloud', label: 'Moisture', ... }`
- `icing` on → `{ key: 'icing', label: 'Icing', ... }`
- `turbulence` on + `ktgIssueLabel` → `{ key: 'turbulence', label: 'Turbulence', issueLabel: ktgIssueLabel, validLabel: ktgValidLabel }`
- `flightCategory` on + `flightCategoryIssueLabel` → `{ key: 'flightCategory', label: '비행기상구역', issueLabel: flightCategoryIssueLabel }`

Only include entries where `issueLabel` is a valid non-`'-'` string.

## MapView Changes

1. Pass `nwpSelection`, `ktgGrid`, `flightCategoryGeojson` into `buildWeatherOverlayModel`
2. Destructure new label fields from model
3. Build `timestampEntries` array (memoized)
4. Mount `<WeatherLayerTimestampBar entries={timestampEntries} />` at the top of the map overlay area

## CSS

Class `layer-timestamp-bar`:
- Positioned absolute, top of map, left-aligned (or full width)
- Semi-transparent dark background, small font
- Each row (`layer-timestamp-entry`): flex, gap between label / 발표 / 유효
- `layer-timestamp-name`: slightly bolder or colored
- Low z-index — below panels/drawers

## Test Coverage

- `weatherOverlayModel.test.js`: add cases for new label fields with valid/null inputs
- No new component tests required (pure display)
