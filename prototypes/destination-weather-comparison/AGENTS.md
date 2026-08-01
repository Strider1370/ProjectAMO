# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

For the 50-inch terminal-TV target, preserve the established large display type elsewhere, but keep the weather-detail, arrival-context, and hourly-forecast text in both concepts visibly larger than the original mock. Do not respond to this readability request by reducing the number of destinations or forecast slots unless the user separately asks for a density change.

In Option 1, the destination-local clock context and the current-weather detail list (`체감`, `습도`, `바람`) are distance-readable information, not microcopy. Use the available column width to keep them at the larger display scale and keep wind direction/speed on one line; do not restore the original 9–16 px treatment.

In Option 1, anchor each destination-local clock block to the far right of its destination band and show the destination's local time-zone abbreviation beside the large clock value (for example JST, SGT, CEST, or ICT). Keep the Korean comparison time and KST label on the context line below.

Use the same destination naming anatomy in both concepts: the large heading combines the city and familiar airport name followed by the IATA code (`도쿄 하네다 HND`, `파리 샤를 드 골 CDG`). Option 1 does not repeat a separate formal airport-name subtitle below that heading. Keep weather-section labels on the shorter city name.

Option 1 is a fullscreen three-destination board. Do not restore a right-side rail. Keep the `1안/3안`, animation-mode, and next-three-flight controls together in the top header. The destination columns must divide the usable viewport equally while retaining deliberate signage-safe whitespace around the content. Keep a visible vertical rule centered in each inter-column gap so the three flights read independently, and retain a bottom information bar with the forecast basis/disclaimer and next-update time, matching Option 3's footer convention.

Option 1 may use the extra horizontal space created by removing the right-side rail, but must not stretch its six information bands proportionally to consume the remaining viewport height. Preserve the source board's fixed vertical rhythm, use the band dividers rather than inserted row gaps to separate sections, and leave deliberate top/bottom safety space around the board. Enlarged local-clock and current-weather details stay inside their original destination/weather bands instead of being moved into unrelated empty areas.

During Option 1 `FLAP` transitions, an outgoing value must finish closing before its incoming replacement becomes visible. Do not allow old and new city names, weather values, arrival context, or forecast values to overlap in the same slot.

In Option 3, never combine the arrival concept and time zone into a label such as `예상 도착 · 현지`, and never demote the Korean arrival time to a small annotation on the progress line. Present `예상 도착` as the group title, then show the destination-local and Korean arrival clocks as separate, equally sized values.

In Option 3, show the same destination-local time-zone abbreviation beside each left-pane local clock as Option 1, while retaining the Korean comparison time and KST label on the line below.

Option 3 exposes five testable transition modes in its header: `CASCADE` keeps the established row-by-row directional slide; `FLAP` flips only changing destination, flight, clock, statistic, and forecast values; `ROLL` vertically replaces those same values; `WIPE` reveals each complete row through a left-to-right mask; and `FADE` crossfades rows with a short stagger. FLAP and ROLL keep rails, dividers, fixed labels, and highlight surfaces stable. Selecting a mode replays it immediately. Keep all modes transform/opacity/clip based, short enough to settle within the transition window, and subject to `prefers-reduced-motion`.

Option 3 has the same real two-page flight-group cycle as Option 1. Its top-center indicator shows both pages, and the header `다음 3편` control advances to the alternate Osaka Kansai, Bangkok Suvarnabhumi, and Rome Fiumicino group using the selected motion mode.

Option 3 gives 32% of each row to flight information and 68% to destination weather. The weather forecast begins with the arrival-time slot and proceeds only into later local times; do not spend forecast cells on pre-arrival hours. Keep arrival emphasis structural (heading, marker, alignment, and weight), not a blue text or filled-cell color treatment.

When Option 3's flight pane width changes, reflow its contents to use that width; do not retain stale internal positions inside a resized box. At the 32% target, use a three-band internal layout: destination above a right-aligned local clock in the top band, airline/flight and operating status across the middle, and departure/duration/gate across the full bottom width.

Option 1 and Option 3 daytime weather symbols must share the background-removed `forecast-*-transparent.png` files through `boardForecastAssets`, so their final rendered icons have identical contrast and no rectangular raster canvas on white or tinted cells. Do not restore the opaque source PNGs, a blend-mode workaround, or the low-contrast daytime Basmilius SVG mapping. Use the project-owned transparent night SVGs only for states that have no Option 1 equivalent.

Option 1 and Option 3 forecast icons must be optically centered with their time, condition label, and temperature using the visible-alpha bounds of the transparent weather assets, not merely the PNG canvas box. Both concepts show a top-center page indicator derived from the real slide-group count: outlined circles represent the full cycle and the filled circle represents the current page. Do not invent duplicate pages just to add dots.

Option 3 must not highlight the arrival forecast with a filled cell background, a pseudo-element extending into the flight-progress line, or blue arrival text. The arrival heading, progress-line marker, first forecast position, and type weight provide the complete emphasis.

In Option 3, the `예상 도착` clock group, progress-line arrival marker, and first forecast cell must share the first forecast slot's exact center coordinate. Keep the forecast left/right inset tokens and the five-column grid as the single alignment source.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.
