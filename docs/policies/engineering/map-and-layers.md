# Map and layers

## Applies when

Changing `MapView.jsx`, Mapbox lifecycle, overlays, sources/layers, visibility, timeline behavior, map interaction, or map-backed sidebar behavior.

## Does not apply when

Use the design policy for visual-only layout, and the data/time policy for collector or timestamp semantics that do not write to the map.

## Re-check trigger

Re-check the policy index before editing when a feature gains a persistent map resource, a style-reload dependency, or a cross-feature composition requirement.

## Ownership

`MapView.jsx` owns Mapbox creation, basemap/style readiness, `styleRevision`, and high-level composition. New feature data shaping, persistent sources/layers, interaction handlers, and visibility sync belong in that feature's adapter or `useXOverlay` hook. Do not add new feature state or bare `useEffect` calls to `MapView.jsx`.

NOTAM installation/filter/popup, route-preview composition, and ADS-B polling/composition currently remain transitional exceptions in or through MapView; they are facts to preserve during focused work, not templates for new features.

## Recurring sequences

- Aviation local GeoJSON: add the definition under `aviation-layers`, rely on its installer for ordinary render modes, add the panel toggle, then browser-check visibility and stacking. Do not describe this local source as WFS.
- ADS-B: change API client or aviation-layer adapter ownership IDs, GeoJSON, visibility, and hover behavior there; preserve the current panel and polling exception; browser-check a toggle, one popup, and repeated basemap switching.
- Sidebar panel: add sidebar item and panel mapping, compose the panel at the existing high-level MapView slot, and keep app-level active-panel state in `App.jsx`.
- MET overlay: keep metadata/model, source/layer installation, ID arrays, sync, and controls in weather-overlays; MapView only composes and reruns the owning sync on `styleRevision`.
- Route preview: keep route calculations/state, preview GeoJSON, source/layer IDs, and map interaction in route-briefing; MapView only provides the cross-feature composition slot and sync invocation.
- Style sync: install static resources after style replacement, rerun current-state feature sync through `styleRevision`, bind handlers with cleanup-aware helpers, and test toggles plus two basemap switches.
- NOTAM map sync: own fetch-to-GeoJSON adaptation, installation, filtering, and popup handlers in the NOTAM feature; verify the feature panel and style-reload preservation in the browser.

## Coupled symbols and runtime images

When one map feature has visual parts that must remain together (for example an advisory icon, motion arrow, speed, and nearby label), treat it as one anchored marker.

- Keep the geographic anchor immutable. For area advisories, use the interior point selected from the polygon and never move it in screen pixels then convert it back to longitude/latitude to avoid label collisions. Use Mapbox placement, zoom rules, clustering, or a deliberate grouped representation instead.
- Do not split mutually dependent icon, arrow, and speed into independently offset symbol layers. Their offsets, rotation alignment, collision rules, and reload timing can differ. Compose the coupled graphic into one runtime image when it must stay rigid; place explanatory text from the same source and anchor.
- Runtime images are removed when the map style is replaced. The owning adapter must recreate them after style sync, and an existing layer must have its layout updated when its image-property key changes.
- Do not bypass a feature's layer visibility with unmanaged DOM markers. A master toggle must control every visible part of that feature.

Before changing a coupled marker, diagnose the live map rather than infer from source code: inspect the layer layout, the GeoJSON feature properties, and map.hasImage(imageKey) through the development map handle. Then check image-load callback errors and verify at two zoom levels plus a style/basemap reload.
