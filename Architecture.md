# Project Architecture

Vite + React aviation weather dashboard with a Node/Express weather data backend.

## Directory Structure

```text
ProjectAMO/
  frontend/
    public/
      data/                    -> runtime GeoJSON, navdata, route graph, procedure data
      Symbols/                 -> Mapbox aviation SVG symbols
      basemap-thumbs/          -> basemap switcher thumbnails
      Geo/                     -> Korean boundary GeoJSON
    src/
      api/                     -> frontend API clients
      app/                     -> app shell, layout, and weather polling
      features/
        map/                   -> Mapbox lifecycle, map panels, route interactions
        monitoring/            -> standalone legacy-style ops/ground monitoring page with Mapbox overlay panel
        aviation-layers/       -> aviation WFS and ADS-B layers
        weather-overlays/      -> radar/satellite/lightning/SIGWX/advisory overlays
        route-briefing/        -> route search and procedure/navpoint lookup
        airport-panel/         -> airport detail drawer, tabs, and view models
      shared/
        ui/                    -> frontend-only reusable UI
        weather/               -> frontend-only weather display helpers
  backend/
    data/                    -> local development data root; terrain source/tiles live here when DATA_PATH is unset
    src/
      briefing/               -> route-axis, planned altitude profile, and vertical profile composition
      terrain/                 -> terrain tile cache and DEM sampling
      parsers/                 -> upstream raw response parsers
      processors/              -> normalized data transformers
  scripts/                     -> local preprocessing helpers such as terrain tile generation
  shared/                      -> backend/frontend common constants
  docs/                        -> operations, deployment, and route briefing architecture notes
```

## File Roles

### Frontend

- `frontend/src/main.jsx` -> React root bootstrap; imports app entry CSS.
- `frontend/src/app/App.jsx` -> app shell state, sidebar/panel composition, selected airport state.
- `frontend/src/app/App.css` -> app shell and layout CSS entry.
- `frontend/src/app/useWeatherPolling.js` -> initial full weather load plus snapshot-meta incremental polling.
- `frontend/src/app/snapshotMeta.js` -> snapshot-meta comparison helpers.
- `frontend/src/app/layout/Sidebar.jsx` -> sidebar item definitions and panel toggle UI.
- `frontend/src/app/layout/Sidebar.css` -> sidebar styles.
- `frontend/src/api/weatherApi.js` -> weather bundle, changed dataset, static airport/navdata fetch helpers.
- `frontend/src/api/adsbApi.js` -> ADS-B fetch helper.
- `frontend/src/api/briefingApi.js` -> route briefing and vertical profile API helpers.
- `frontend/src/features/map/MapView.jsx` -> Mapbox map creation, style reload handling, feature panel composition, route/VFR interactions.
- `frontend/src/features/map/MapView.css` -> map, overlay panel, and route briefing style entry.
- `frontend/src/features/map/mapConfig.js` -> map bounds, initial camera, basemap options.
- `frontend/src/features/map/imageOverlay.js` -> shared Mapbox image overlay helpers for raster/SIGWX frames.
- `frontend/src/features/map/basemapSwitcher/BasemapSwitcher.jsx` -> basemap switcher UI.
- `frontend/src/features/monitoring/MonitoringPage.jsx` -> standalone `/monitoring` legacy-style ops/ground screen.
- `frontend/src/features/monitoring/MonitoringMap.jsx` -> monitoring wrapper around the main MapView with local Aviation/MET icon toggles.
- `frontend/src/features/monitoring/monitoringApi.js` -> monitoring data loader using current API shape.
- `frontend/src/features/monitoring/legacy/*` -> copied previous-project dashboard components, alert utilities, CSS, and weather icon assets for the standalone monitoring screen.
- `frontend/src/features/aviation-layers/aviationWfsLayers.js` -> aviation WFS layer definitions.
- `frontend/src/features/aviation-layers/addAviationWfsLayers.js` -> WFS source/layer creation.
- `frontend/src/features/aviation-layers/addAdsbLayer.js` -> ADS-B source/layer/hover wiring.
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` -> aviation and ADS-B layer toggle panel.
- `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` -> MET overlay toggle panel.
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` -> radar/satellite/weather legend UI.
- `frontend/src/features/weather-overlays/SigwxLegendDialog.jsx` -> SIGWX legend dialog.
- `frontend/src/features/weather-overlays/SigwxHistoryBar.jsx` -> SIGWX history controls.
- `frontend/src/features/weather-overlays/AdvisoryBadges.jsx` -> SIGMET/AIRMET advisory badges.
- `frontend/src/features/weather-overlays/lib/advisoryLayers.js` -> SIGMET/AIRMET GeoJSON and layer helpers.
- `frontend/src/features/weather-overlays/lib/sigwxData.js` -> SIGWX_LOW GeoJSON/icon mapping helpers.
- `frontend/src/features/route-briefing/lib/routePlanner.js` -> route graph loading and route path search.
- `frontend/src/features/route-briefing/lib/procedureData.js` -> procedure/navpoint loading helpers.
- `frontend/src/features/route-briefing/VerticalProfileChart.jsx` -> SVG route vertical profile chart.
- `frontend/src/features/airport-panel/AirportPanel.jsx` -> airport drawer shell and tab selection.
- `frontend/src/features/airport-panel/AirportPanel.css` -> airport drawer and tab style entry.
- `frontend/src/features/airport-panel/tabs/MetarTab.jsx` -> METAR tab rendering.
- `frontend/src/features/airport-panel/tabs/TafTab.jsx` -> TAF tab rendering.
- `frontend/src/features/airport-panel/tabs/AmosTab.jsx` -> AMOS tab rendering.
- `frontend/src/features/airport-panel/tabs/WarningTab.jsx` -> airport warning tab rendering.
- `frontend/src/features/airport-panel/tabs/AirportInfoTab.jsx` -> airport information bulletin rendering.
- `frontend/src/features/airport-panel/lib/formatters.js` -> airport panel time/wind formatting helpers.
- `frontend/src/features/airport-panel/lib/metarViewModel.js` -> METAR display model builder.
- `frontend/src/features/airport-panel/lib/tafViewModel.js` -> TAF display model builder.
- `frontend/src/features/airport-panel/lib/amosViewModel.js` -> AMOS display model helpers.
- `frontend/src/shared/ui/WeatherIcon.jsx` -> weather icon renderer.
- `frontend/src/shared/weather/helpers.js` -> flight category, wind, humidity, and related weather helpers.
- `frontend/src/shared/weather/visual-mapper.js` -> weather code-to-Korean display mapping.
- `frontend/src/shared/weather/weather-visual-resolver.js` -> weather icon visual resolver.
- `frontend/src/shared/weather/weather-icon-registry.js` -> weather icon asset registry.

### Backend

- `backend/server.js` -> Express entry point, API routes, cache headers, static data serving.
- `backend/src/briefing/route-axis.js` -> route LineString resampling, cumulative distance, and bearing helpers.
- `backend/src/briefing/profile-composer.js` -> route-aware planned altitude profile, markers, and segment metadata composition.
- `backend/src/briefing/vertical-profile.js` -> vertical profile response composition.
- `backend/src/terrain/terrain-cache.js` -> terrain tile metadata lookup and lazy tile cache.
- `backend/src/terrain/terrain-sampler.js` -> terrain sampling along route-axis samples.
- `backend/src/index.js` -> scheduled weather collection jobs and per-type locks.
- `backend/src/api-client.js` -> upstream KMA/weather API request construction.
- `backend/src/store.js` -> in-memory cache and SHA-256 change detection.
- `backend/src/parsers/*` -> per-type raw response parsers.
- `backend/src/processors/*` -> per-type normalized data processors.
- `backend/collect.js` -> manual one-shot collector.
- `scripts/prepare-terrain-tiles.js` -> converts decompressed Korea 3-second DEM into 1-degree terrain tiles.

## Reference Structure

- `frontend/src/main.jsx` imports only the app entry files.
- `frontend/src/app/*` may import `api/`, `features/`, and `shared/`.
- `frontend/src/features/*` may import `api/`, `shared/`, and local feature siblings when a UI flow requires it.
- `frontend/src/shared/*` must stay frontend-only and must not import from `app/` or `features/`.
- Root `shared/` is for backend/frontend common constants; do not mix it with `frontend/src/shared/`.
- `backend/*` must not import from `frontend/src/`.
- Runtime browser assets must live under `frontend/public/`.
- Raw terrain sources and generated terrain tiles stay under the backend data root at `terrain/`; locally this is `backend/data/terrain/`, while the GCP VM uses `DATA_PATH=/opt/projectamo/shared/data`, so runtime tiles must be under `/opt/projectamo/shared/data/terrain/tiles/`.
- Frontend requests vertical profile JSON instead of reading DEM files.
