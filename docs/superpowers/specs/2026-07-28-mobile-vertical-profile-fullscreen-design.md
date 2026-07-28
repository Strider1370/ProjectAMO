# Mobile vertical-profile fullscreen controls

## Goal

Keep the existing forced 90-degree fullscreen presentation for the mobile route-briefing vertical profile while retaining every essential control and its current state at all mobile widths.

## Scope

- The briefing-view "단면도 크게 열기" path only.
- Mobile remains the shared `<=719px` breakpoint.
- Preserve the forced rotation that gives the chart a landscape reading surface.

## Required behavior

1. The rotated fullscreen surface shows all six cross-section layer controls: 기온, 습도, 착빙, 바람, 난류, and SIGMET/AIRMET.
2. It shows forecast-hour previous/next controls whenever more than one forecast hour is available.
3. It keeps the layer selections and forecast-hour state shared with the inline briefing chart; opening fullscreen cannot reset layers to a hard-coded subset.
4. It provides a visible, accessible close control.
5. At every mobile width, required controls remain in the fullscreen surface with no page-level horizontal overflow. The chart itself may retain its existing internal horizontal interaction.

## Rotated toolbar layout

The fullscreen content remains a 90-degree rotated landscape surface. Its toolbar is rendered inside that same rotated surface rather than outside it.

- Row 1: compact terrain/cruise summary (`minmax(0, 1fr)`), forecast navigation (`auto`), and a 44px close button.
- Row 2: the six layer controls. Use a responsive grid: one row when their intrinsic controls fit; otherwise three columns by two rows. Each control has at least a 44px hit target and an 8px gap.
- TOD and the calculation explanation remain secondary information and must not displace the required controls; retain them in the chart's existing secondary metadata/disclosure.
- The chart consumes the remaining vertical space below the toolbar.

## Implementation boundary

Reuse `CrossSectionToggles`, `ForecastHourNav`, and the existing `xLayers` / forecast-hour callbacks in `BriefingView`. Do not create a second layer-state model or change data fetching.

## Verification

- Add focused tests for the fullscreen control parity and responsive layout contract.
- In the running app, capture and inspect the mobile fullscreen vertical profile at a narrow phone viewport and a wider mobile viewport.
- Verify every required control is present, layer changes remain reflected in the inline chart after closing, forecast navigation remains available when the data offers it, and the page does not horizontally overflow.
