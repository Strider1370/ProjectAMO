# Task 4 report — exact-frame weather model and QPF timeline

Status: DONE

## Implemented

- Normalizes WISSDOM metadata by the selected height and selects it only when
  its `tm` exactly matches the rendered observed-radar frame.
- Normalizes and orders QPF metadata by `validTimeMs`; QPF selection is exact
  and never falls back to a neighbouring forecast frame.
- Adds QPF valid-time ticks to the separate future timeline list, without
  changing KIM/NWP selection semantics.
- When an exact QPF frame is selected, clears the observed radar raster and
  radar-motion output and exposes the MAPLE `mm/h` status payload.

## TDD evidence

- RED: `node --test frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`
  failed with the expected missing WISSDOM/QPF model outputs and missing QPF
  timeline ticks (6 failures).
- GREEN: the same command passes: 40 tests, 0 failures.

## Changed files

- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js`
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.test.js`
- `frontend/src/features/weather-overlays/lib/timelineRailModel.js`
- `frontend/src/features/weather-overlays/lib/timelineRailModel.test.js`

## Verification and scope

- `git diff --check` passed.
- `graphify update .` completed after the code change.
- Per the task packet, no dev server, browser check, or broad suite was run.

## Residual risk

- This task intentionally exposes pure-model outputs only. A later composition
  task must pass the polling metadata and control state into this model and
  supply `forecastTimelineTicks` to the timeline UI/overlay adapters.
