# Hidden Constraints

Rules that are not obvious from the directory structure but can break runtime behavior.

- Mapbox `setStyle()` removes existing sources and layers. Re-add map layers from the style load path after every basemap switch.
- Raster overlays such as radar, satellite, and SIGWX rasters render in `slot: 'middle'`; aviation, geo, symbols, and ADS-B render in `slot: 'top'`.
- `frontend/public/` is the Vite public asset root. Root-level `public/` is not served by the frontend.
- VFR waypoint dragging mutates refs and Mapbox source data during drag; React state updates happen on mouseup to avoid per-frame re-renders.
- AirportPanel AMOS missing values must stay blank or `-`; do not fill them from METAR unless a field is explicitly designed as a METAR-derived display.
- Do not rewrite Korean/non-ASCII source files with PowerShell `Set-Content`, `Out-File`, or `>`. Use `apply_patch` for edits or Node UTF-8 read/write for mechanical rewrites.
