# Entry Points

> **Purpose**: Step-by-step start sequences for recurring task patterns.
> **Use**: Open this when a task matches one of the recurring changes below.
> **Maintenance**: Keep entries short and update paths when the file map changes.

---

## 1. Add a new aviation WFS layer

1. Add definition to `frontend/src/features/aviation-layers/aviationWfsLayers.js` (id, color, source url, line/fill/point options).
2. `addAviationWfsLayers.js` auto-creates sources and layers from the definition; no edit needed unless the new layer has a unique render mode (icon by property, tick marks, etc.).
3. Add toggle UI to `frontend/src/features/aviation-layers/AviationLayerPanel.jsx`.
4. Verify in browser: layer appears, toggle works, renders above raster overlays.

## 2. Modify ADS-B display

- Marker style, popup, fetch interval -> `frontend/src/features/aviation-layers/addAdsbLayer.js`.
- Backend fetch -> `frontend/src/api/adsbApi.js`.

## 3. Wire a new sidebar panel

1. Add icon to `topItems` or `bottomItems` in `frontend/src/app/layout/Sidebar.jsx`.
2. Add label/panelId mapping in `PANEL_MAP`.
3. In `frontend/src/features/map/MapView.jsx`, add a conditional render block guarded by `activePanel === '<panelId>'`.
4. App-level state lives in `frontend/src/app/App.jsx` (`activePanel` + `onPanelToggle`).

## 4. Add a new MET raster overlay

1. Add visibility/panel metadata to `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
2. Add frame selection or derived data to `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`.
3. Add Mapbox sync behavior to `syncRasterAndSigwxLayers` or a new weather-owned sync helper in `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js`.
4. Add toggle or legend UI under `frontend/src/features/weather-overlays/`.
5. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition if a new UI slot is needed.
6. Verify in browser: layer appears, toggle works, basemap switch preserves visibility, and aviation/geo layers remain above raster overlays.

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
3. Add route/procedure/boundary-fix map preview changes in `frontend/src/features/route-briefing/lib/routePreview.js` or `routePreviewSync.js`.
4. Add route panel UI changes in `frontend/src/features/route-briefing/RouteBriefingPanel.jsx`.
5. Keep `frontend/src/features/map/MapView.jsx` changes limited to high-level composition or a new cross-feature slot.
6. Verify IFR, VFR, FIR IN/EXIT, VFR waypoint editing, and vertical profile generation.
