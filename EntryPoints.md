# Entry Points

> **Purpose**: Step-by-step start sequences for recurring task patterns.
> **Use**: Open this when a task matches one of the recurring changes below.
> **Maintenance**: Keep entries short and update paths when the file map changes.

---

## MapView Boundary Rule

For map-related work, do not default to editing `frontend/src/features/map/MapView.jsx`.

Use `MapView.jsx` only for:
- Mapbox instance lifecycle.
- Basemap switching.
- Style readiness and `styleRevision`.
- High-level panel composition.
- Calling feature-owned sync helpers.
- Temporary polling orchestration that has not yet been moved to a feature module.

Feature-specific model, source/layer, GeoJSON, popup, route, weather, or ADS-B logic belongs in the owning `features/*` module.

## 1. Add a new aviation WFS layer

1. Add definition to `frontend/src/features/aviation-layers/aviationWfsLayers.js` (id, color, source url, line/fill/point options).
2. `addAviationWfsLayers.js` auto-creates sources and layers from the definition; no edit needed unless the new layer has a unique render mode (icon by property, tick marks, etc.).
3. Add toggle UI to `frontend/src/features/aviation-layers/AviationLayerPanel.jsx`.
4. Verify in browser: layer appears, toggle works, renders above raster overlays.

## 2. Modify ADS-B display

1. Marker style, GeoJSON shaping, visibility sync, `ADSB_SOURCE_IDS`/`ADSB_LAYER_IDS`, or hover popup behavior -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
2. Backend fetch helper -> `frontend/src/api/adsbApi.js`.
3. ADS-B toggle placement currently remains in `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`; do not move it into the aviation panel without a separate UX decision.
4. ADS-B polling is still orchestrated by `frontend/src/features/map/MapView.jsx`; keep changes there limited to polling/composition unless a dedicated ADS-B polling module is introduced in a separate refactor.
5. Verify in browser: ADS-B toggle works, hover popup appears once, and repeated basemap switches do not duplicate hover behavior.

## 3. Wire a new sidebar panel

1. Add icon to `topItems` or `bottomItems` in `frontend/src/app/layout/Sidebar.jsx`.
2. Add label/panelId mapping in `PANEL_MAP`.
3. In `frontend/src/features/map/MapView.jsx`, add a conditional render block guarded by `activePanel === '<panelId>'`.
4. App-level state lives in `frontend/src/app/App.jsx` (`activePanel` + `onPanelToggle`).

## 4. Add a new MET raster overlay

1. Add visibility/panel metadata to `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
2. Add frame selection or derived data to `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`.
3. Add Mapbox sync behavior to `syncRasterAndSigwxLayers` or a new weather-owned sync helper in `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
4. If the overlay installs persistent Mapbox sources/layers, update `WEATHER_OVERLAY_SOURCE_IDS` and `WEATHER_OVERLAY_LAYER_IDS`.
5. If the overlay needs static source/layer installation after basemap reload, update `installWeatherOverlayLayers`.
6. Add toggle or legend UI under `frontend/src/features/weather-overlays/`.
7. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition, passing current model state into weather-owned sync helpers, or adding `styleRevision` to a sync effect dependency.
8. Verify in browser: layer appears, toggle works, basemap switch preserves visibility/data, and aviation/geo layers remain above raster overlays.

## 5. Add a new backend data type

1. Add fetch logic in `backend/src/api-client.js`.
2. Add parser in `backend/src/parsers/`.
3. Add processor in `backend/src/processors/`.
4. Register cron job in `backend/src/index.js` with a per-type lock.
5. Wire route in `backend/server.js` to expose cached data from `store.js`.
6. Add frontend client method in `frontend/src/api/weatherApi.js`.

## 6. Add a standalone app route

1. Add the route component under `frontend/src/features/<feature>/`.
2. Branch in `frontend/src/app/App.jsx` before rendering the main shell.
3. If sidebar navigation is needed, add an item in `frontend/src/app/layout/Sidebar.jsx` that navigates by URL instead of toggling a panel.
4. Verify direct entry, refresh, and existing main-shell route behavior.

## 7. Modify route briefing behavior

1. Add pure route calculations or display model changes in `frontend/src/features/route-briefing/lib/routeBriefingModel.js`.
2. Add route search, procedure-loading, VFR waypoint, or vertical-profile state changes in `frontend/src/features/route-briefing/useRouteBriefing.js`.
3. Add route/procedure/VFR/boundary-fix map preview changes in `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
4. If route preview sources/layers change, update `ROUTE_PREVIEW_SOURCE_IDS` and `ROUTE_PREVIEW_LAYER_IDS` in `routePreviewSync.js`.
5. Add route panel UI changes in `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`.
6. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition, route preview sync invocation, or a new cross-feature slot.
7. Verify IFR, VFR, FIR IN/EXIT, VFR waypoint editing, vertical profile generation, and basemap switch preservation for visible route previews.

## 8. Modify Mapbox style/source-layer sync

1. Keep `frontend/src/features/map/MapView.jsx` responsible for Mapbox instance lifecycle, basemap switching, style readiness, and `styleRevision`.
2. Do not apply current feature data or visibility directly inside `style.load`; install static sources/layers there, then let current-state sync effects rerun via `styleRevision`.
3. Put feature-specific Mapbox writes in the owning feature adapter:
   - Weather overlays -> `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
   - Route previews -> `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
   - ADS-B -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
   - Base airports/geo boundaries -> `frontend/src/features/map/lib/baseMapLayers.js`.
4. Use cleanup-aware event binding from `frontend/src/features/map/lib/mapStyleSync.js` for layer handlers that must survive repeated style reloads.
5. If a module owns persistent sources/layers, export or update its `*_SOURCE_IDS` and `*_LAYER_IDS` arrays.
6. Verify with focused tests where Mapbox mocks are representative, then browser smoke: toggle layers, switch basemap twice, confirm visibility/data and hover/click behavior remain stable.

## 9. Modify responsive layout density

1. Check `frontend/src/app/layout/layoutTokens.css` before adding or changing fixed panel widths.
2. Main shell/sidebar sizing -> `frontend/src/app/App.css` and `frontend/src/app/layout/Sidebar.css`.
3. Map overlay panel sizing -> `frontend/src/features/map/MapView.css`.
4. Route briefing panel sizing -> `frontend/src/features/route-briefing/RouteBriefing.css`.
5. Airport drawer sizing -> `frontend/src/features/airport-panel/AirportPanel.css`.
6. Monitoring dashboard density -> `frontend/src/features/monitoring/legacy/App.css`.
7. Verify with `npm.cmd run test:layout --prefix frontend`, `npm.cmd run build --prefix frontend`, and `npm.cmd run smoke:responsive --prefix frontend` while the dev server is running.
