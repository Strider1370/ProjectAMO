# Monitoring-specific data loader design

## Purpose

Make the standalone `/monitoring` page load only the data its situation-board cards and selected map overlays use. It must no longer make an initial burst of unrelated main-app API requests that trips nginx's per-IP API limit (`5r/s`, burst `30`).

The main application continues using its existing full weather-data loader unchanged.

## User-facing behavior

The monitoring page keeps its current cards and its current desktop/iPad entry behavior. Its map keeps these layers:

- HSR: the KMA composite real-time precipitation-intensity image (`mm/h`)
- HCI: the KMA precipitation-type image (rain, snow, hail, ice crystals)
- lightning
- GK2A infrared satellite
- GK2A visible satellite
- SIGMET
- AIRMET

The page does not load or expose these map data products through its initial or polling loaders:

- WISSDOM wind field
- QPF precipitation forecast
- Echo Top
- RainViewer overseas radar
- raw ECHO radar layer
- CI/CTPS convective satellite products
- SIGWX products

The page also does not load NOTAM, overseas airport navdata, or overseas METAR, TAF, and SIGMET. Those are not rendered by the monitoring cards or the retained map layers.

## Design

`frontend/src/api/weatherApi.js` remains the main-screen aggregate loader. A monitoring-specific loader in `frontend/src/features/monitoring/monitoringApi.js` composes the same small fetch helpers, but with an explicit monitoring payload.

The initial monitoring payload contains:

1. Domestic situation-board card data: airports, METAR, TAF, AMOS, warnings, KMA special warnings, ground forecast, ground overview, environment, airport information, warning types, and alert defaults.
2. Retained map API data: lightning, SIGMET, and AIRMET.
3. Retained map metadata assets: HSR, HCI, IR satellite, and visible satellite metadata.

Each item is fetched once. In particular, the current parallel static-data and generic-data paths must not duplicate airports or warning types.

Polling uses the same explicit ownership list. It refreshes a changed retained payload while preserving the last good value on a failed optional refresh. A snapshot change for an excluded product must not create a request from `/monitoring`.

The monitoring map receives null/empty values for removed overlays and its layer controls show only the retained set. This is a data-scope change, not a change to `MapView` ownership: MapView continues to compose weather-overlay adapters and the monitoring feature owns the data selection.

No nginx limit change is part of this work. The normal fresh `/monitoring` load must stay below the existing burst budget through a smaller, non-duplicated request set.

## Error handling

- A missing optional retained map asset leaves that layer unavailable without preventing the cards from rendering.
- Required card data keeps the current initial-load failure behavior.
- Polling retains the previous successful retained value when a refresh fails.
- No monitoring request may fall back to loading excluded main-app data.

## Verification

1. Unit tests prove that the monitoring initial and changed loaders request every retained item, make no duplicate airport/warning-type request, and never request excluded endpoints.
2. Existing monitoring browser contract passes on desktop and iPad landscape with all cards present and HSR/HCI, lightning, IR/visible satellite, SIGMET, and AIRMET available to the map.
3. A focused browser/network assertion confirms a cold `/monitoring` entry receives no `503` API response.
4. Production verification checks nginx access/error logs after a fresh desktop `/monitoring` load and confirms no rate-limit entry for that load.

## Scope boundaries

- Do not alter collectors, stored weather assets, or the main-app loader.
- Do not raise or remove nginx's global API rate limit.
- Do not change the monitoring page's visual layout, cards, or mobile redirect behavior.
