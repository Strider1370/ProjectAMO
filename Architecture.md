# Project Architecture

> **Purpose**: First stop for any task. Read this before searching code.
> **Rule**: Stay lean. If a section can be derived by reading one file, remove it.
> **Maintenance**: Update at the end of any task that changes the file map, non-obvious rules, or task patterns.

Vite + React aviation weather dashboard. Mapbox-based Korean aviation map, weather overlays, route briefing.

## File Map

```text
ProjectAMO/
  .claude/launch.json          -> dev server config (Frontend :5173, Backend :3001)
  docs/
    operations.md              -> GCE VM + nginx + PM2 deployment / cache / retention checklist
  frontend/
    vite.config.js
    public/                    -> Vite publicDir; map runtime assets live here
      data/                    -> runtime GeoJSON + navdata JSON for airports/FIR/navaids/sectors/waypoints + route graph/procedures
      Symbols/                 -> aviation SVG symbols used by Mapbox; `Reference Symbols/` is source/reference only
      basemap-thumbs/          -> local thumbnail PNGs for basemap switcher UI (standard/dark/satellite)
      logo3_01.png             -> 기상청 logo (used in 기상정보 tab)
      Geo/                     -> Korean boundary GeoJSON (neighbors, sido, sigungu)
    src/
      App.jsx                  -> shell state: activePanel, UTC clock, airport panel selection
      api/
        weatherApi.js          -> initial full load + snapshot-meta based incremental weather fetch
        adsbApi.js             -> ADS-B fetch
      components/
        AirportPanel/          -> airport detail drawer fed by map click selection + weather helpers
        Sidebar/Sidebar.jsx    -> icon-panel wiring (1=aviation, 2=met, 4=route-check)
        Map/MapView.jsx        -> map init, basemap switching, aviation/MET/advisory layers, route briefing overlays
        Map/MapView.css
      config/mapConfig.js      -> initial center/zoom/bounds + BASEMAP_OPTIONS
      layers/advisories/
        advisoryLayers.js      -> SIGMET/AIRMET source/layer defs + GeoJSON/icon conversion helpers
      layers/aviation/
        aviationWfsLayers.js   -> layer definitions (ids, colors, urls, options)
        addAviationWfsLayers.js-> Mapbox source/layer creation for aviation WFS layers
        addAdsbLayer.js        -> ADS-B source/layer/hover wiring
      services/navdata/
        routePlanner.js        -> route path search + procedure/navpoint loading from public navdata JSON
      utils/
        sigwx.js               -> SIGWX_LOW item-to-Mapbox GeoJSON/icon mapping helpers
        visual-mapper.js       -> airport weather code-to-Korean mapper used by airport/weather UI
  backend/
    server.js                  -> entry point, Express routes + snapshot-meta + /data cache headers
    collect.js                 -> manual one-shot data collection (node collect.js <type>)
    src/
      store.js                 -> in-memory cache with SHA-256 change detection
      index.js                 -> cron scheduler (14 weather types, per-type lock)
      api-client.js            -> upstream weather API calls
      parsers/                 -> per-type raw response parsers
      processors/              -> per-type data transformers
  shared/                      -> constants used by both frontend and backend
```

## Non-obvious Rules

- **Mapbox slots**: raster overlays (satellite, radar, SIGWX) ??`slot: 'middle'`; aviation/geo/ADS-B ??`slot: 'top'`. Aviation always renders above rasters.
- **Geo boundary visibility**: shown only when satellite or radar is active. Controlled in `MapView.jsx` via `useEffect` watching `metVisibility`.
- **Sido/sigungu zoom split**: sido visible zoom < 9, sigungu visible zoom ??9. Zoom 9 = initial zoom (6) + 3 steps.
- **Static assets path**: always use `frontend/public/` ??root-level `public/` is not served by Vite.
- **WFS layer split**: definitions in `aviationWfsLayers.js`, rendering in `addAviationWfsLayers.js`. Don't mix.
- **Basemap switching**: `switchBasemap()` calls `map.setStyle()`, which wipes all layers. The existing `style.load` handler in `MapView.jsx` re-adds all sources and layers on every style change ??do not bypass this. The zoom listener must be registered **outside** `style.load` to avoid duplicate registration on each switch.
- **Symbol SVG structure**: Core aviation symbols embed a white silhouette `<g id="...-bg">` layer internally to block route lines from rendering through icons. Do not flatten or re-export these SVGs without preserving that group.
- **Route preview source roles**: `ROUTE_PREVIEW_SOURCE` (`briefing-route-preview`) holds four feature roles: `route-preview-line` (full orange path), `route-preview-point` (IFR endpoint circles), `route-segment-line` (IFR per-segment LineStrings with `routeId`), `vfr-waypoint` (VFR draggable handles). IFR data comes from `buildPreviewGeometry`; VFR data from `buildVfrGeoJSON`. Do not remove any role ??each is filtered by a different layer.
- **Route highlight independence**: `applyRouteHighlight` adds 6 `ROUTE_HL_*` layers (waypoint icons/labels, navaid icons/labels, segment line/label) that are active whenever `routeResult` is set, regardless of aviation layer toggle state. Sourced from WFS for point layers, `ROUTE_PREVIEW_SOURCE` for segment lines.
- **VFR waypoint interaction pattern**: `bindVfrInteractions` is registered once via `vfrInteractionsBound` guard (same pattern as `airportHandlerBound`) to survive basemap switches. During drag, `vfrWaypointsRef.current` is mutated directly and `source.setData` called per frame ??`setVfrWaypoints` is called only on mouseup to avoid per-frame re-renders. The X delete button is a DOM overlay; `hideTimerRef` bridges the 120ms hide delay between the Mapbox `mouseleave` event and the React button's `onMouseEnter`.
- **airport_info API params**: Unlike other KMA endpoints, `AirPortService/getAirPort` uses `base_date` (YYYYMMDD), `base_time` (0600/1700 KST), `airPortCd` (ICAO). URL built in `buildAirportInfoUrl()` in `api-client.js`, not via the standard `buildUrl()`. Bulletins issued twice daily at 06:00 and 17:00 KST.
- **SIGWX_LOW display split**: `/api/sigwx-low` feeds Mapbox vector fill/line/label/icon layers from `utils/sigwx.js`; `/api/sigwx-front-meta` and `/api/sigwx-cloud-meta` feed pre-rendered raster overlays. Keep rasters in `slot: 'middle'` and vector symbols in `slot: 'top'`.
- **Incremental weather refresh**: `App.jsx` now loads the full weather bundle once, then polls `/api/snapshot-meta` every 60s and fetches only changed datasets via `weatherApi.js`. Static airport/navdata assets are not part of this polling loop.
- **Generated data cache policy**: `backend/server.js` serves `/api/*` with `Cache-Control: no-store`; radar/satellite/SIGWX overlay frame images under `/data/*` are cacheable for 3 hours; frame metadata JSON stays `no-cache`.
- **AirportPanel TAF/AMOS**: TAF tab uses hourly `taf.airports[icao].timeline` for timeline/table/grid views. AMOS displays only parsed AMOS fields; missing AMOS values stay blank/`-` and must not be filled from METAR.

## Task Patterns

Working draft note: `frontend/public/data/navdata/route-direction-segment-review.json` is an intermediate ENR 3.1/3.2 segment-direction review file and is not consumed by runtime logic.

If your task matches one of these, open `EntryPoints.md` at the listed number for the step-by-step flow.

1. Add a new aviation WFS layer
2. Modify ADS-B display
3. Wire a new sidebar panel
4. Add a new MET raster overlay
5. Add a new backend data type
