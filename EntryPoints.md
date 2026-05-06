# Entry Points

> **Purpose**: Step-by-step start sequences for recurring task patterns.
> **Use**: Only opened when `Architecture.md` Task Patterns lists a match for the current task.
> **Maintenance**: When adding/removing/renaming an entry here, update the Task Patterns index in `Architecture.md` to match.

---

## 1. Add a new aviation WFS layer

1. Add definition to `frontend/src/layers/aviation/aviationWfsLayers.js` (id, color, source url, line/fill/point options).
2. `addAviationWfsLayers.js` auto-creates sources and layers from the definition — no edit needed unless the new layer has a unique render mode (icon by property, tick marks, etc.).
3. Add toggle UI to the Aviation panel in `frontend/src/components/Map/MapView.jsx`.
4. Verify in browser: layer appears, toggle works, renders above raster overlays.

## 2. Modify ADS-B display

- Marker style, popup, fetch interval → `frontend/src/layers/aviation/addAdsbLayer.js`.
- Backend fetch → `frontend/src/api/adsbApi.js`.

## 3. Wire a new sidebar panel

1. Add icon to `topItems` or `bottomItems` in `frontend/src/components/Sidebar/Sidebar.jsx`.
2. Add label→panelId mapping in `PANEL_MAP`.
3. In `MapView.jsx`, add a conditional render block guarded by `activePanel === '<panelId>'`.
4. App-level state lives in `App.jsx` (`activePanel` + `onPanelToggle`).

## 4. Add a new MET raster overlay

1. Extend `metVisibility` state in `MapView.jsx` with the new key.
2. Use `addOrUpdateImageOverlay` with `slot: 'middle'` (so aviation/geo stay above).
3. Add toggle to MET panel.
4. If overlay needs geo boundary visibility, extend the `useEffect` watching `metVisibility` to include the new key.

## 5. Add a new backend data type

1. Add fetch logic in `backend/src/api-client.js`.
2. Add parser in `backend/src/parsers/`.
3. Add processor in `backend/src/processors/`.
4. Register cron job in `backend/src/index.js` with a per-type lock.
5. Wire route in `backend/server.js` to expose cached data from `store.js`.
6. Add frontend client method in `frontend/src/api/weatherApi.js`.
