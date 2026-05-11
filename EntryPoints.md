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

1. Extend `metVisibility` state in `frontend/src/features/map/MapView.jsx` with the new key.
2. Use `addOrUpdateImageOverlay` with `slot: 'middle'` so aviation/geo stay above.
3. Add toggle to `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx`.
4. If overlay needs geo boundary visibility, extend the `useEffect` watching `metVisibility` to include the new key.

## 5. Add a new backend data type

1. Add fetch logic in `backend/src/api-client.js`.
2. Add parser in `backend/src/parsers/`.
3. Add processor in `backend/src/processors/`.
4. Register cron job in `backend/src/index.js` with a per-type lock.
5. Wire route in `backend/server.js` to expose cached data from `store.js`.
6. Add frontend client method in `frontend/src/api/weatherApi.js`.
