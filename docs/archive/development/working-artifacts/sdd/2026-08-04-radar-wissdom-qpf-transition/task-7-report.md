# Task 7 report

Status: DONE

Added a map-composed QPF forecast status card. It renders only for an exact QPF
selection, names the MAPLE forecast source, and formats analysis/selected times
in the selected KST or UTC display zone. The responsive card uses existing map
tokens and wraps on narrow screens.

The shared legend now renders the selected QPF API legend only when both the
exact QPF status and that selected frame's `legendPath` are present. It is
explicitly labeled `초단기 강수예측 · MAPLE` and does not reuse radar visibility
or a radar legend path.

Verification run:

```sh
node --test frontend/src/features/weather-overlays/WeatherLegends.test.js
node --test frontend/src/features/weather-overlays/QpfStatusCard.test.js
```

Result: 7 focused tests passing.

Residual risk: per task instruction, verification was limited to focused Node
tests; no browser or dev-server check was run.
