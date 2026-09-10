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

## Fix round 1

- Live (`null`) selection now resolves to the latest observed tick instead of
  a future QPF tick.
- QPF valid-time collisions retain only the frame from the newest analysis.
- `useTimelinePlayback` now accepts QPF ticks separately from KIM/NWP times;
  its shared ordered-time/advance helpers are covered through the
  observed → QPF → wrapped-observation transition.
- Focused RED run failed for all three reviewed gaps; focused GREEN run passes
  43 tests with no failures.

## Fix round 2

- Main and monitoring MapView composition now pass `qpfMeta`; MapView passes
  `forecastTimelineTicks` as `qpfTimesMs` to playback, independently of KIM.
- With no observed tick, live selection remains `null` rather than resolving to
  an unselected future QPF tick.
- Focused RED run failed for both real-path defects; focused GREEN run passes
  48 tests with no failures.
