# Task 5 report — WISSDOM/QPF map adapters

## Status

DONE

## Changes

- Added WISSDOM and QPF Mapbox image-overlay adapters with weather-overlay source/layer ownership exports.
- Forwarded their Task 4 model frames through the existing MapView composition payload without adding MapView layer ownership or ordering logic.
- Removed radar-motion map adapter ownership and its tests.
- Removed superseded hashed image sources only after the raster layer has rebound to the new source.

## Verification

```bash
node --test frontend/src/features/weather-overlays/lib/wissdomLayers.test.js frontend/src/features/weather-overlays/lib/qpfLayers.test.js frontend/src/features/weather-overlays/lib/weatherOverlayLayers.test.js frontend/src/features/map/imageOverlay.test.js
```

Result: 18 passed, 0 failed.

## Residual risk

Browser verification was intentionally not run per the task packet. Slot-based Mapbox ordering is covered by unit-level layer specifications; browser style-reload evidence is deferred to the requested final contract work.
