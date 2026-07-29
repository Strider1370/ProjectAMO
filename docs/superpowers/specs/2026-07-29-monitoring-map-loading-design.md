# Monitoring map loading design

## Goal

Reduce the perceived delay when entering `/monitoring` without changing the
standalone route or attempting to reuse the main-page Mapbox instance.

## Scope

- Keep the monitoring page's existing data-loading and Mapbox lifecycle.
- Render the monitoring dashboard as soon as its existing initial data is
  available.
- Show a loading spinner only over the monitoring map area until Mapbox has
  loaded its initial style.
- Surface the existing Mapbox error state in place of the spinner if map
  initialization fails.

## Chosen behavior

`MapView` already treats its initial `style.load` event as style readiness.
It will notify an optional caller callback once at that point. `MonitoringMap`
will use that callback to remove its local loading overlay.

The readiness boundary is Mapbox style readiness, not completion of every
visible map tile. Tiles, fonts, and image layers may continue to arrive after
the spinner is gone; this is intentional so the map becomes visibly active as
soon as possible.

The full-page `Loading data...` overlay remains responsible only for the
initial monitoring data. It must not wait for Mapbox readiness. The map-area
spinner must not block the rest of the dashboard.

## Interfaces

- `MapView` gains one optional readiness notification prop, used only by the
  monitoring wrapper. Existing callers retain current behavior.
- `MonitoringMap` owns the local boolean readiness state and its accessible
  loading status markup.
- Monitoring CSS scopes the overlay to `.monitoring-mapbox-panel`, preserving
  map controls and existing slideshow behavior.

## Error and accessibility behavior

- Before readiness, the map-area status uses an accessible live status such as
  `지도 불러오는 중…` and a decorative spinner.
- If the existing Mapbox initialization error appears, it remains the visible
  error; the loading status must no longer imply successful progress.
- The overlay is non-interactive and disappears after readiness, so it cannot
  trap keyboard or pointer input.

## Verification

- Unit coverage verifies the notification occurs when the Mapbox style-load
  lifecycle completes and only when a caller requests it.
- The monitoring browser contract verifies that the dashboard renders while
  the map readiness overlay is present, then that the overlay disappears once
  the map becomes ready.
- Run the affected monitoring contract using the documented managed server
  command.

## Non-goals

- Reusing the main-page Mapbox instance across `/monitoring`.
- Changing Mapbox tile caching, basemap choice, or data API contracts.
- Delaying or removing existing weather layers.
