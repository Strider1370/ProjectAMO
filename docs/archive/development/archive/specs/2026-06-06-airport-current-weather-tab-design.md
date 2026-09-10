# Airport Current Weather Tab Design

## Purpose

Add a compact current-weather tab to the airport drawer. The tab summarizes the airport's active warning status, current METAR, and next 6 hours of TAF in one scan-friendly view.

The tab is not a replacement for the existing `METAR`, `TAF`, or airport warning tabs. It is a first-look operational summary that becomes the default airport drawer tab, while the detailed tabs remain available for full text, expanded timelines, and secondary fields.

## User Goal

When an airport marker is selected, the user should be able to answer these questions from the default airport drawer tab:

- Is there an active airport warning?
- What is the current observed flight/weather condition?
- What are the next 6 hours expected to do?

## Confirmed Product Decisions

- Section order is fixed: **airport warning -> METAR -> TAF**.
- Vertical height ratio is **1 : 4 : 4** on desktop drawer body layouts.
- The warning section should visually match the monitoring page airport-warning banner colors and text style.
- METAR should be compressed, not copied from the full METAR tab.
- TAF should keep the existing timeline style, but show only the next 6 hours.

## Layout

The new tab uses one vertical stack. On desktop drawer body layouts, use a section container whose visual rows are `1fr 4fr 4fr` for warning, METAR, and TAF.

```text
[ Airport warning banner ]     ratio 1

[ METAR compact summary ]      ratio 4

[ TAF 6-hour timeline ]        ratio 4
```

On a typical 900 px-tall desktop viewport, the airport drawer has roughly 680-700 px of usable body height after the image header and body padding. The following pixel values are examples only, not acceptance criteria:

| Section | Target height | Notes |
|---|---:|---|
| Airport warning | 64-80 px | One compact monitoring-style warning banner |
| METAR | 240-280 px | Status banner plus six compact cards |
| TAF 6h | 260-320 px | Timeline rows only |

The tab may scroll on shorter screens. Preserve the order and relative priority while allowing tab-local scrolling; do not force all content into a fixed viewport if doing so would make text unreadable.

## Airport Warning Section

Use the monitoring page airport-warning visual language from:

- `frontend/src/features/monitoring/legacy/components/WarningList.jsx`
- `frontend/src/features/monitoring/legacy/App.css` warning-banner styles

Do not import the full monitoring legacy stylesheet into the airport panel. Recreate the necessary compact styles inside `AirportPanel.css` using airport-panel-specific class names.

### Warning states

No active warning:

- Green-tinted background: `#ecfdf5`.
- Green text: `#15803d`.
- Use the monitoring ok-border accent color `#86efac` where the compact design needs a divider/accent.
- Left side: check icon/text and "Airport warning none" equivalent label.

Active warning:

- Orange background: `#f97316`.
- Light text: `#fff7ed`.
- Left side: alert icon/text and "Airport warning" equivalent label.
- Right side: warning name and valid time.

### Text format

Follow the monitoring banner style:

```text
<warning name>
DD HHMM - DD HHMM
```

If multiple warnings are active, use the same paged/viewport text display pattern as `WarningList` unless the user explicitly approves a different display method. Preserve the monitoring entry structure concept:

```text
warning-banner-page
  warning-banner-group
    warning-banner-item
      warning-banner-entry
        warning-banner-name
        warning-banner-time
```

The airport drawer implementation can use airport-panel-specific class names, but the display method should remain the same.

## METAR Section

Use `buildMetarViewModel()` from:

- `frontend/src/features/airport-panel/lib/metarViewModel.js`

Do not render the full `MetarTab`. Build a compact METAR section from the view model.

### Structure

```text
[ Flight category banner ]

[ Current weather ][ Wind ]
[ Visibility      ][ Ceiling ]
[ QNH             ][ Temp / dewpoint ]
```

### Field rules

Flight category banner:

- Shows `VFR`, `MVFR`, `IFR`, or `LIFR`.
- Uses the existing category color style.

Current weather card:

- Primary: weather icon and Korean weather label from the METAR view model.
- Secondary: daily rainfall amount, only when available and greater than zero.
- Do not repeat precipitation codes in a separate alert row.

Wind card:

- Primary: direction/speed, e.g. `270/12kt`, `VRB/05kt`, or `CALM`.
- Secondary: gust, only when available, e.g. `G28kt`.
- Keep a compact wind arrow if it fits without crowding.
- High wind should be expressed by card emphasis, not by adding a separate row.

Visibility card:

- Primary: visibility value.
- Secondary: RVR summary, only when present.
- RVR belongs inside the visibility card, not in a separate special-condition row.
- Derive RVR text from `obs.rvr`, for example:

```js
obs.rvr.map((r) => `R${r.runway}/${r.mean}m`)
```

Ceiling card:

- Primary: lowest BKN/OVC ceiling or `NSC`.

QNH card:

- Primary: QNH in hPa.

Temperature/dewpoint card:

- Primary: air temperature / dewpoint.
- Relative humidity and feels-like temperature are out of scope for this compact tab unless later requested.

### Excluded from compact METAR

The compact tab should not include:

- METAR raw text.
- Full footer from the current METAR tab.
- Separate special-condition row.
- Standalone precipitation-code alert.
- AMOS-focused details except daily rainfall secondary text.

## TAF Section

Use the existing TAF timeline model and visual language from:

- `frontend/src/features/airport-panel/tabs/TafTab.jsx`
- `frontend/src/features/airport-panel/lib/tafViewModel.js`

Do not render the full `TafTab`. Build a compact timeline-only section.

### Structure

```text
Time axis
Flight condition
Weather
Wind
Visibility
Ceiling
```

### Time range

Show only forecast slots from now through now + 6 hours.

Use a time-window overlap filter instead of assuming exactly six hourly slots. Do not require the slot start time to be after `now`, because the currently valid slot may have started before `now`.

```text
slotStart < now + 6h && slotEnd > now
```

The existing `buildTafViewModel()` already filters expired slots with the current one-hour slot model. Unless the TAF model exposes explicit end times, treat each slot as one hour when testing overlap.

### Behavior

- Keep existing category colors.
- Keep existing weather icons.
- Keep wind arrows if available.
- Remove the `timeline/table/grid` view switcher.
- Full TAF remains available in the existing TAF tab.

## Data Flow

`AirportPanel.jsx` already resolves the needed per-airport data:

```text
metar   = weatherData?.metar?.airports?.[icao]
taf     = weatherData?.taf?.airports?.[icao]
warning = weatherData?.warning?.airports?.[icao]
amos    = weatherData?.amos?.airports?.[icao]
```

The new tab should receive:

```text
icao
airportMeta
warning
metar
taf
amosData
```

The main airport drawer data path does not currently load `warningTypes`. Do not add a new API call for this tab. Use normalized warning fields already present in the warning payload, preferring:

```text
wrng_type_key
wrng_type_name
type_label
type
```

If a future implementation needs the full monitoring `warningMeta()` mapping, that should be a separate data-flow change.

## Files To Touch

Expected implementation files:

- `frontend/src/features/airport-panel/AirportPanel.jsx`
  - Add the new tab entry.
  - Make the new current-weather tab the first/default tab.
  - Render the new tab body.

- `frontend/src/features/airport-panel/tabs/CurrentWeatherTab.jsx`
  - New compact tab component.
  - Contains three internal sections: warning, METAR, TAF.

- `frontend/src/features/airport-panel/AirportPanel.css`
  - Add compact warning styles based on monitoring banner colors.
  - Add compact METAR card grid styles.
  - Add compact TAF timeline overrides if existing `.ap-taf-*` classes are not enough.

Optional helper files:

- `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js`
  - Only if the component becomes too dense.
  - Can house the TAF 6-hour overlap filter, compact warning formatting, and derived RVR text.

- `frontend/src/features/airport-panel/lib/tafViewModel.js`
  - Add a shared 6-hour filter helper only if it is useful outside the new tab.

## Out Of Scope

- Removing or replacing the existing METAR, TAF, AMOS, warning, or info tabs.
- Changing backend data shape.
- Adding new API calls.
- Changing monitoring page behavior.
- Importing the full monitoring legacy CSS into the airport drawer.
- Adding new alerting behavior or sounds.
- Showing full METAR/TAF raw text in the compact tab.

## Verification

Implementation should be verified with:

- Frontend build.
- Existing airport panel tests if affected.
- Focused UI/responsive screenshot evidence following `docs/dev-server-and-capture.md`.
- Store screenshot artifacts under `artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMM_label>/` with a short manifest when screenshots are captured.
- Manual browser check on at least:
  - Airport with no active warning.
  - Airport with active warning, if local/mock data exists.
  - Airport with METAR + TAF available.
  - Airport with missing TAF or missing METAR.

Visual checks:

- Section order is warning -> METAR -> TAF.
- Warning colors match the monitoring warning banner.
- METAR stays compact and does not duplicate rainfall/gust/RVR in separate rows.
- TAF shows only the next 6 hours.
- The tab remains readable on desktop drawer width and mobile full-width drawer.
