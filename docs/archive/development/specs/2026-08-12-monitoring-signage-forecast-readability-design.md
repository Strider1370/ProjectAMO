# Monitoring signage forecast readability

## Goal

Improve readability of the `/monitoring` ground-weather signage without reducing the visible weekly forecast content.

## Scope

- In signage mode, remove the warning-banner slot from the left-panel layout so the forecast can use its vertical space.
- Increase the ground-forecast header from 50px to 75px and vertically centre its title and metadata.
- Move the forecast progress rail and forecast layer start down with the larger header, while keeping the weekly table fully visible.
- Add deliberate vertical space between the current temperature, apparent temperature, condition, and daily minimum/maximum text.
- Increase the weekly table's header/row-label typography.
- Render Saturday weekday labels blue and Sunday weekday labels red. The colour applies to the weekday label only; dates and values remain neutral.

## Non-goals

- Do not change weather data, forecast rotation, alert data, or non-signage layouts.
- Do not change the semantic meaning of existing weather colours.

## Design

The signage grid no longer reserves `104px + 12px` for the warning banner. Its forecast row grows from 507px to 532px, preserving the existing combined weekly-table height after the forecast header grows by 25px. The header uses flex-centering on its cross axis. The progress rail and overlay layer use positions aligned with the 75px header.

Weekend colour is exposed as semantic state in `GroundForecastPanel`, derived from the existing weekday value, then styled in CSS. This avoids brittle positional selectors and continues to work when the forecast start date changes.

## Verification

- Add a component test that asserts the Saturday and Sunday weekday labels expose their respective semantic classes.
- Run that focused test, then the monitoring contract at the supplied 1254x960 viewport.
- Capture a Playwright screenshot of `/monitoring` in signage mode and confirm: no warning banner, 100px centred header, fully visible weekly table, spaced current-weather text, readable table labels, and weekend label colours.
