# Destination Weather Comparison — Design QA

## Comparison target

- Option 1 source visual truth: `design-references/option-1-gate-board.png`
- Option 3 source visual truth: `design-references/option-3-forecast-rail.png`
- Option 1 implementation at rest with motion controls: `artifacts/motion-buttons-rest-v2.png`
- Option 3 implementation with requested airline logos: `artifacts/rail-airline-logos-v2.png`
- Latest Option 1 terminal-legibility implementation: `artifacts/terminal-typography-2026-07-30/option-1.png`
- Latest Option 3 terminal-legibility implementation: `artifacts/terminal-typography-2026-07-30/option-3.png`
- Latest Option 3 33:67 reflowed arrival-forward implementation: `artifacts/rail-prearrival-spacing-2026-07-31/option-3.png`
- Latest Option 1 fixed-rhythm implementation: `artifacts/layout-audit-2026-07-31/02-fixed-rhythm-option-1.png`
- CSS viewport: 1672 × 941
- Source pixels: 1672 × 941
- Implementation pixels: 1672 × 941
- Device scale factor: 1
- Density normalization: none required; source and implementation are the same pixel dimensions.
- State: first departure/weather group, animations at rest, autoplay disabled for capture.
- Latest comparison state: both concepts at rest, `autoplay=0`, after the user-scoped enlargement of weather-detail, arrival-context, and hourly-forecast text only.

## Evidence

- Full-view Option 1 comparison after motion revision: `artifacts/split-flap-option-1-qa.png`
- Full-view Option 3 comparison after airline-logo addition: `artifacts/rail-airline-logos-qa.png`
- Focused 1:1 comparison: `artifacts/exact-focused-qa.png`
- Option 1 value-level split-flap motion evidence: `artifacts/flap-elements-520ms.png` and `artifacts/flap-elements-final.png`
- Option 1 word-level vertical-roll motion evidence: `artifacts/vertical-roll-words-refined-480ms.png`, `artifacts/vertical-roll-words-refined-820ms.png`, and `artifacts/vertical-roll-words-refined-final.png`
- Option 1 wipe motion evidence: `artifacts/wipe-520ms.png` and `artifacts/wipe-final.png`
- Option 1 crossfade motion evidence: `artifacts/fade-520ms.png` and `artifacts/fade-final.png`
- Shared screen-switch evidence: `artifacts/view-switcher-board.png` and `artifacts/view-switcher-rail.png`
- Destination-local/KST time hierarchy evidence: `artifacts/time-hierarchy-audit/03-board-after.png` and `artifacts/time-hierarchy-audit/04-rail-after.png`
- Option 3 row motion evidence: `artifacts/exact-option-3-motion-180ms.png`
- Terminal-legibility full-view evidence: `artifacts/terminal-typography-2026-07-30/option-1.png` and `artifacts/terminal-typography-2026-07-30/option-3.png`
- Same-input before/after comparison evidence: `artifacts/terminal-typography-2026-07-30/comparison.png`
- Option 3 arrival-clock correction: `artifacts/arrival-time-layout-2026-07-30/option-3.png`
- Option 3 arrival-clock same-input before/after comparison: `artifacts/arrival-time-layout-2026-07-30/comparison.png`
- Option 3 transparent weather-icon correction: `artifacts/transparent-weather-icons-2026-07-30/option-3.png`
- Option 3 weather-icon same-input before/after comparison: `artifacts/transparent-weather-icons-2026-07-30/comparison.png`
- Option 1/Option 3 daytime weather-icon parity: `artifacts/option1-icon-parity-2026-07-30/comparison.png`
- Option 1/Option 3 alpha-clean weather-icon parity: `artifacts/forecast-alpha-fix-2026-07-30/comparison.png`
- Option 3 arrival-cell background cleanup: `artifacts/arrival-highlight-cleanup-2026-07-30/comparison.png`
- Option 3 arrival-axis and fixed clock-column correction: `artifacts/alignment-fix-2026-07-30/rail-viewport-fixed-columns.png`
- Option 3 32:68 reflowed, arrival-forward, neutral-emphasis comparison: `artifacts/option3-balance-2026-07-31/05-comparison.png`
- Option 3 separator correction full-view evidence: `artifacts/option3-balance-2026-07-31/13-stat-dividers-restored.png`
- Option 3 source/current same-input comparison: `artifacts/option3-balance-2026-07-31/12-comparison.png`
- Option 3 pre-arrival forecast full-view evidence: `artifacts/option3-balance-2026-07-31/14-pre-arrival-forecast.png`
- Option 3 pre-arrival forecast focused evidence: `artifacts/option3-balance-2026-07-31/15-pre-arrival-focus.png`
- Option 3 requested-location/current same-input comparison: `artifacts/option3-balance-2026-07-31/16-pre-arrival-comparison.png`
- Option 3 pre-arrival forecast replacing plane evidence: `artifacts/option3-balance-2026-07-31/17-pre-arrival-replaces-plane.png` and `artifacts/option3-balance-2026-07-31/18-pre-arrival-replaces-plane-focus.png`
- Option 1/Option 3 weather-condition label evidence: `artifacts/weather-condition-labels-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`
- Option 1/Option 3 arrival-period surface highlight: `artifacts/arrival-surface-highlight-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`
- Option 1/Option 3 Fluent selected-state arrival highlight: `artifacts/fluent-arrival-selected-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`
- Option 1/Option 3 Geist active-grid arrival highlight: `artifacts/geist-active-arrival-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`
- Option 3 flight/weather spacing revision: `artifacts/rail-prearrival-spacing-2026-07-31/option-3.png`, `first-row.png`, and `comparison.png`
- Option 1 fullscreen board redesign at the terminal target: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-1920x1080.png`
- Option 1 fullscreen next-group state: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-next-group.png`
- Option 1 signage-safe spacing revision: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-safe-spacing-1920x1080.png`
- Option 1 signage-safe next-group state: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-safe-spacing-next-group.png`
- Option 1 column-separation and footer revision: `artifacts/board-separation-footer-2026-07-30/option-1-final.png`
- Option 1 separated next-group state: `artifacts/board-separation-footer-2026-07-30/option-1-next-group.png`
- Option 1 enlarged secondary-information revision: `artifacts/terminal-secondary-legibility-2026-07-31/option-1-fixed.png`
- Option 1 local-clock focused evidence: `artifacts/terminal-secondary-legibility-2026-07-31/local-clock-focus.png`
- Option 1 weather-detail focused evidence: `artifacts/terminal-secondary-legibility-2026-07-31/weather-detail-focus.png`
- Option 1 fixed-rhythm source/implementation comparison: `artifacts/layout-audit-2026-07-31/03-reference-current-comparison.png`
- Option 1 proportional/fixed-rhythm before-and-after comparison: `artifacts/layout-audit-2026-07-31/05-before-after-comparison.png`
- Option 1 fixed-rhythm next-group state: `artifacts/layout-audit-2026-07-31/04-fixed-rhythm-next-group.png`
- Option 1 FLAP overlap correction at the same transition checkpoint: `artifacts/flap-overlap-2026-07-31/03-comparison.png`

The focused comparison uses unscaled 1:1 crops of the header and first destination/flight region. This was required because the screens contain dense timetable labels, carrier marks, weather icons, and timeline details that are too small to judge reliably from the full-view comparison alone.

## Findings

- No actionable P0, P1, or P2 mismatches remain.
- Fonts and typography: destination names, flight numbers, departure times, header titles, and status text retain the source hierarchy. Weather-detail labels, arrival context, and hourly forecast labels intentionally exceed the original source glyph metrics following on-device readability feedback; the enlargement is scoped and preserves the surrounding hierarchy. Korean glyph antialiasing differs slightly because the source is an ImageGen raster while the implementation uses browser-rendered Noto Sans KR.
- Spacing and layout rhythm: Option 1 column boundaries, header height, content dividers, schedule/status/weather bands, and next-page rail align with the source. Option 3 uses a user-directed 33:67 flight/weather split, a reflowed three-band flight-information layout, one outer pane-boundary rule, a 26 px inset before the pre-arrival forecast, and five arrival-forward forecast cells. The flight-number row has no horizontal rules; the three bottom flight stats retain two short vertical separators.
- Colors and tokens: off-white display background, navy text, green normal status, orange delay status, slate progress treatment, and gray dividers preserve the source balance without a separate blue arrival-text treatment.
- Arrival emphasis token: both concepts use a Geist-inspired active-grid treatment with a `#f2f7ff` low-chroma blue surface and `#d6e4f5` 1 px boundary. The cell has no radius, shadow, gradient, or accent stripe; existing typography and the Option 3 marker provide the additional cues.
- Image quality and asset fidelity: airline marks and weather artwork are source-derived raster assets at their intended display sizes. Standard interaction icons use the installed icon library. No placeholder, CSS-drawn, or handwritten SVG assets remain.
- Copy and content: cities, airport codes, airport names, flight numbers, schedules, gates, statuses, weather readings, local arrival times, forecast times, and update labels match the selected source images.
- Weather-condition copy: both concepts use one shared Korean label mapping—`맑음`, `구름 조금`, `흐림`, `비`, `소나기`, and `뇌우`—so the same icon state cannot receive different wording across screens.
- Requested extension: Option 3 now shows a source-derived airline mark directly before each flight number. This is an intentional user-requested addition to the selected static source.
- Requested extension: for a 50-inch terminal TV, Option 1 enlarges only current-weather detail, arrival context, and hourly forecast text; Option 3 enlarges only timeline context and hourly forecast text. Destination count, forecast-slot count, main display type, and layout geometry remain unchanged.
- Requested correction: Option 3 no longer combines `예상 도착` and `현지` into one label. `예상 도착` is the group title, while destination-local and Korean clocks occupy separate columns with equal 26 px time values; the Korean clock is no longer a small annotation on the progress line.
- Requested correction: Option 1 and Option 3 daytime forecasts now share four RGBA background-removed `forecast-*-transparent.png` files through `boardForecastAssets`. This preserves the original darker cloud illustration while eliminating the raster rectangle on both white and tinted cells. Transparent project-owned SVGs remain only for night states that have no Option 1 equivalent.
- Requested correction: Option 3 no longer uses a filled arrival-cell background, a pseudo-element reaching into the progress line, or blue arrival text. The arrival heading, marker, first-slot position, and type weight provide the emphasis.
- Requested correction: Option 3 now uses one shared horizontal axis for the arrival heading, progress marker, and first forecast cell. Its local/Korean arrival clocks use two non-expanding equal columns, so `다음 날` cannot move either time-zone label or the start of either clock.
- Requested correction: Option 1 is now a true fullscreen three-column board. The former 86 px side rail is removed; view, animation, and next-flight controls sit in the header, while all three destination columns divide the full content width and their proportional information bands extend through the bottom forecast row.
- Requested correction: Option 1 retains its existing information structure and test controls but now observes a deliberate signage-safe frame. The usable three-column canvas is inset 56 px horizontally, 32 px below the header, and 40 px from the bottom, with 24 px inter-column whitespace and 8 px between the existing information bands.
- Requested correction: Option 1 now places a full-height 1 px rule at the exact center of both 24 px inter-column gaps, making the three flights read as independent columns. It also mirrors Option 3's bottom convention with a bordered forecast-basis/disclaimer bar and next-update time.
- Requested correction: Option 1 now treats destination-local clock context and `체감/습도/바람` as distance-readable display information. The local block uses 14/32/13 px label/value/context type, and the weather detail uses a 190 px column with 20 px type and single-line wind values.
- Requested correction: Option 1 no longer stretches the six information bands with fractional viewport tracks or inserts a separate 8 px gap between every band. It restores a 32 px top and 40 px bottom safety frame and uses fixed 140/120/140/72/190/208 px band heights, so dividers and content-owned bands establish the vertical rhythm while the enlarged local-clock and weather-detail content remain in their original sections.
- Requested extension: Option 1 adds compact `FLAP / 뒤집기`, `ROLL / 세로 롤`, `WIPE / 마스크`, and `FADE / 겹침` comparison controls to the original next-page rail. This is an intentional user-requested addition to the selected static source.
- Motion behavior: Option 1 preserves the static source at rest and changes six information bands in order—destination, carrier/flight, departure/gate, status, current weather, and arrival forecast. `FLAP` keeps panels, dividers, and fixed labels stationary while only changing values rotate like an airport split-flap board. `ROLL` keeps panels and dividers fixed while individual city names, codes, flight values, labels, weather values, icons, and forecast values descend with an additional 18 ms item offset. The full-screen slide remains removed.
- Navigation behavior: a shared `1안 / 3안` control appears in both headers, supports pointer and keyboard activation, communicates selection with `aria-pressed`, and clears any active transition before changing screens.
- Time-zone behavior: every destination promotes its current local time to a 24–25 px tabular value, then shows its date and corresponding Korean time as secondary context with an explicit `KST` suffix. Arrival times remain destination-local; their Korean-time equivalents are shown alongside them, including next-day rollover where applicable. Option 3 timeline labels distinguish current Korean time from destination-local arrival time.

## Comparison history

1. Initial prototype had a dark monitoring-page palette and different information density.
   - Result: blocked by P1 palette, layout, and content mismatch.
   - Fix: reset both screens to the selected light airport-display references and source copy.
2. First exact pass had compressed Option 1 vertical sections and an undersized Option 3 flight-information region.
   - Result: blocked by P1 major-region proportions and P2 typography scale.
   - Fix: matched the 90 px headers, Option 1 column boundaries and vertical band coordinates, Option 3 465 px left region, row heights, timeline height, and forecast placement.
3. Second pass retained smaller typography and non-source weather/icon treatment.
   - Result: blocked by P2 typography and asset fidelity.
   - Fix: matched display type scale and extracted the visible airline/weather assets from the selected visual sources.
4. Final pass:
   - Evidence: the full-view and focused comparison files listed above.
   - Result: no actionable P0/P1/P2 findings.
5. Motion revision:
   - Replaced the Option 1 full-screen translation with sequential split-flap information bands.
   - Added airline marks before Option 3 flight numbers.
   - Verified the start, middle, and completed Option 1 animation states and the completed Option 3 logo state.
6. Motion comparison revision:
   - Added explicit split-flap, vertical-roll, wipe, and crossfade selection buttons to the Option 1 side rail.
   - Kept the same destination → flight → schedule → status → weather → forecast cascade in all four modes.
   - Refined vertical roll from whole-panel movement to word/value/icon-level movement.
   - Verified intermediate and completed states for all four modes at the 1672 × 941 target viewport.
7. Element-level flap and screen navigation revision:
   - Changed split-flap ownership from whole information bands to changing values only.
   - Kept fixed labels and structural dividers stationary throughout the split-flap transition.
   - Added a shared pointer-accessible `1안 / 3안` switch and verified round-trip navigation.
8. Destination time-zone revision:
   - Added destination-local and Korean current clocks to every Option 1 column and Option 3 row.
   - Added KST equivalents to local arrival times and made cross-date rollover explicit.
   - Verified Tokyo, Singapore, Paris, Osaka, Bangkok, and Rome offsets in the prototype data.
9. Terminal-legibility typography revision:
   - User feedback identified the small weather-detail, arrival-context, and hourly-forecast typography in both concepts as unreadable on a 50-inch terminal TV.
   - Enlarged only those text tiers; retained the existing destinations, forecast cells, primary typography, spacing model, and animations.
   - Verified both concepts at 1672 × 941 with no document or row overflow, no browser errors, and same-input before/after comparison evidence in `artifacts/terminal-typography-2026-07-30/comparison.png`.
10. Option 3 arrival-clock grouping revision:
   - Earlier finding: `예상 도착 · 현지` conflated the group and time-zone label, while the Korean arrival time was too small and visually collided with the progress line.
   - Fix: separated the `예상 도착` title from two equal `현지` and `한국` clock columns, using the same 26 px value size for both.
   - Post-fix evidence: all three rows retain a 35 px measured gap between the arrival block and progress line; Paris `다음 날 01:50` remains on one line; no row or body overflow and no browser errors were found.
   - Same-input visual evidence: `artifacts/arrival-time-layout-2026-07-30/comparison.png`.
11. Option 3 transparent weather-icon revision:
   - Earlier finding: every `rail-*.png` was an RGB raster without alpha, so its pale rectangular crop remained visible despite `mix-blend-mode: multiply`.
   - Fix: mapped all Option 3 states to the existing transparent Basmilius SVG weather set and removed the blend-mode workaround.
   - Post-fix evidence: all 15 rendered images report transparent backgrounds and normal compositing; the 88 × 72 px icon boxes remain within all three rows with no overflow.
   - Same-input visual evidence: `artifacts/transparent-weather-icons-2026-07-30/comparison.png`.
12. Option 1 icon-parity correction:
   - Earlier finding: the all-transparent Basmilius pass removed rectangles but made white-cloud states too low-contrast against the white terminal background.
   - Fix: replaced every Option 3 daytime state with the exact Option 1 forecast assets and restored their 72 × 64 px rendering treatment. Night-only states retain the project SVGs because Option 1 has no night equivalent.
   - Post-fix evidence: browser inspection confirms the day-state sources are `forecast-cloud.png`, `forecast-partly.png`, `forecast-rain.png`, and `forecast-storm.png`; all three rows have no overflow or browser errors.
   - Same-input visual evidence: `artifacts/option1-icon-parity-2026-07-30/comparison.png`.
13. Forecast raster alpha correction:
   - Earlier finding: using the same RGB files did not remove their 248–251 gray raster canvases. The rectangle was subtle on Option 1 white cells but visible in Option 3, especially over the tinted arrival column.
   - Fix: mechanically removed the near-white canvas from the four original forecast illustrations, emitted RGBA PNGs, routed both concepts through those shared assets, and removed the blend-mode workaround.
   - Post-fix evidence: all four files report PNG color type 6 (RGBA); both screens render them with transparent CSS backgrounds and normal compositing. All three Option 3 rows remain free of overflow and browser errors.
   - Same-input visual evidence: `artifacts/forecast-alpha-fix-2026-07-30/comparison.png`.
14. Arrival-cell highlight cleanup:
   - Earlier finding: the remaining rectangle was the Option 3 `.is-arrival` cell fill, not the icon raster. Its top edge began at the progress line, and its `::before` marker extended into the line.
   - Fix: removed the filled cell and pseudo-element; retained the circular progress marker and colored the arrival time and temperature blue.
   - Post-fix evidence: all three arrival cells report transparent backgrounds and no `::before` content; all rows remain free of overflow and browser errors.
   - Same-input visual evidence: `artifacts/arrival-highlight-cleanup-2026-07-30/comparison.png`.
15. Arrival-axis and fixed clock-column correction:
   - Earlier finding: the arrival heading, line marker, and arrival forecast were centered against three subtly different boxes. The clock pair also used intrinsic grid sizing, so Paris `다음 날 01:50` widened the Korean clock and shifted both time-zone labels.
   - Fix: bound all three arrival indicators to the forecast-grid center and changed the clock pair to two `minmax(0, 1fr)` columns with fixed internal label/time start positions.
   - Post-fix evidence: all three rows measure the arrival heading and line marker at x=1270.00 px and the forecast cell at x=1269.99 px. `현지` remains at x=1078 px, `한국` at x=1299 px, and both time values start at x=1122/1343 px in every row, including the next-day Paris row.
   - Visual evidence: `artifacts/alignment-fix-2026-07-30/rail-viewport-fixed-columns.png`.
16. Option 1 fullscreen board redesign:
   - Earlier finding: the right-side control rail reserved 86 px and the fixed-height content bands left a large unused area below the forecasts on a fullscreen 50-inch display.
   - Fix: moved the view switcher, four animation controls, and next-three-flight action into the top header; removed the side rail; changed the three destination columns to equal full-width tracks and the six information bands to proportional full-height rows.
   - Post-fix evidence: at 1920 × 1080 the screen bounds are exactly 1920 × 1080, each destination column is 640 × 990 px, and the header, body, and all six columns report zero horizontal or vertical overflow. The next-three-flight action successfully changes the visible cities to Osaka, Bangkok, and Rome without changing those bounds.
   - Visual evidence: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-1920x1080.png` and `artifacts/fullscreen-board-redesign-2026-07-30/option-1-next-group.png`.
17. Option 1 signage-safe spacing revision:
   - Earlier finding: expanding all three columns to every content-edge pixel removed the visual breathing room expected on a public information display, especially below the header and forecast row.
   - Fix: retained the existing six information bands and all test controls, but inset the board canvas 56 px from each side, 32 px below the header, and 40 px from the bottom. Added 24 px whitespace between equal destination columns and 8 px between existing bands without introducing new information groups.
   - Post-fix evidence: at 1920 × 1080 the board canvas measures 1808 × 918 px, all three columns measure 586.66–586.67 × 918 px, and the header, body, both flight groups, and Option 3 all report zero overflow.
   - Visual evidence: `artifacts/fullscreen-board-redesign-2026-07-30/option-1-safe-spacing-1920x1080.png` and `artifacts/fullscreen-board-redesign-2026-07-30/option-1-safe-spacing-next-group.png`.
18. Option 1 flight separation and footer revision:
   - Earlier finding: whitespace alone did not establish enough ownership between adjacent flights, so the three destinations still read as one broad surface. Option 1 also lacked the reference basis and update context already present in Option 3.
   - Fix: inserted two dedicated 1 px separator tracks centered in the 24 px inter-column gaps and added a 48 px bottom information bar with forecast basis, disclaimer, and next-update time.
   - Post-fix evidence: at 1920 × 1080 all three columns measure exactly 586 × 890 px, separator tracks measure 1 × 890 px at x=654/1265, and the page, columns, first/next flight groups, and Option 3 all report zero overflow.
   - Visual evidence: `artifacts/board-separation-footer-2026-07-30/option-1-final.png` and `artifacts/board-separation-footer-2026-07-30/option-1-next-group.png`.
19. Option 1 secondary-information legibility revision:
   - Earlier finding: destination local-time labels remained at 9–10 px and current-weather detail at 16 px despite substantial unused width in both areas, making them unsuitable for the 50-inch viewing target.
   - Fix: enlarged local clock label/value/context to 14/32/13 px in a 220 px block. Enlarged current-weather detail to 20 px in a 190 px column, widened its label track, and kept wind direction/speed on one line.
   - Correction during visual QA: the first pass constrained `현지 시각` to 52 px and wrapped it. Replaced that fixed label track with an auto-sized no-wrap track after inspecting the full and focused browser captures.
   - Post-fix evidence: every local label measures 55.45 × 20 px on one line, every clock block is 220 × 52.59 px, every weather list is 190 × 89 px, and all three columns report zero overflow.
   - Visual evidence: `artifacts/terminal-secondary-legibility-2026-07-31/option-1-fixed.png`, `local-clock-focus.png`, and `weather-detail-focus.png` in the same folder.
20. Option 1 fixed vertical-rhythm revision:
   - Earlier finding: removing the right-side rail correctly expanded the three columns, but fractional row tracks, inserted row gaps, and layered vertical padding made the information bands feel stretched and weakened the source board's spacing rhythm.
   - Fix: retained the fullscreen equal-width columns, header controls, footer, separators, and enlarged secondary information; replaced proportional rows with six fixed source-aligned tracks, removed the inserted row gaps and column vertical padding, and restored the 32 px top/40 px bottom safety frame.
   - Post-fix evidence: the board page measures 1808 × 870 px at x=56/y=122; every column shares exact 140/120/140/72/190/208 px row bounds; separators remain centered at x=654/1265; the first and next flight groups have no document overflow or error overlay.
   - Visual evidence: `artifacts/layout-audit-2026-07-31/02-fixed-rhythm-option-1.png`, `03-reference-current-comparison.png`, `04-fixed-rhythm-next-group.png`, and `05-before-after-comparison.png`.
21. Option 1 FLAP replacement-overlap correction:
   - Earlier finding: the outgoing value closed for 280 ms while the incoming replacement began after only 180 ms, and both full board pages independently rendered fixed labels and dividers. In the weather heading, the fixed trailing `날씨` position was also derived from the old city's intrinsic width, so a longer incoming city could collide with it even after the opacity timing changed.
   - Fix: delayed each incoming value until its outgoing value is closed; made the outgoing page the only owner of fixed FLAP labels and separators; limited the incoming page to `.flap-unit` values; and gave each weather heading a shared city-name slot sized from the longer current/pending city so `현재` and `날씨` keep one stable position.
   - Post-fix evidence: at the same mid-transition checkpoint, all six incoming fixed weather-label spans are `visibility:hidden`, the outgoing fixed spans remain visible once, and the old/new city spans share the exact same bounding slot. In the second column the fixed labels occupy x=691–724.125 and x=805.125–838.25, while both city states occupy x=728.625–800.625; the incoming city ends 4.5 px before `날씨`, including the problematic short-to-long `방콕 → 싱가포르` direction.
   - Visual evidence: `artifacts/flap-overlap-2026-07-31/01-before-760ms.png`, `04-shared-shell-760ms.png`, `05-slot-rest.png`, `06-slot-transition-760ms.png`, `08-long-city-transition-760ms.png`, and `03-comparison.png`.
22. Option 3 flight/weather balance, internal reflow, and arrival-forward revision:
   - Earlier finding: the 465 px flight-information pane used only 24.2% of the 1920 px row while the weather pane spent two forecast cells on pre-arrival hours. The arrival cell was distinguished with blue time/temperature text, which added a separate color cue without improving the reading sequence.
   - Fix: changed each row to a 32:68 flight/weather split and reflowed the left pane into three full-width bands: destination above a right-aligned local clock, flight/status across the middle, and departure/duration/gate across the bottom. Retained one outer pane boundary while removing internal vertical rules between the three bottom stats, made forecast slot zero the arrival-hour forecast, replaced all earlier slots with later destination-local forecasts, and removed blue arrival text in favor of heading/marker/alignment/weight.
   - Post-fix evidence: at 1920 × 1080 the flight pane measures 614.39 px (31.9995%) and the weather pane fills the remainder. None of the three destination titles intersects its local-clock block. The arrival heading center, marker center, and first forecast center differ by at most 0.016 px. The first cells are 12:00, 16:00, and 19:00 for Tokyo, Singapore, and Paris respectively; no row or document overflow is present.
   - Visual evidence: `artifacts/option3-balance-2026-07-31/01-before.png`, `06-reflow-first-pass.png`, `07-32-percent.png`, and `05-comparison.png`.
23. Option 3 separator correction:
   - Earlier finding: the reflow introduced horizontal rules above and below the airline/flight-number row, while a follow-up cleanup also removed the two requested separators between departure, estimated flight duration, and gate.
   - Fix: removed both horizontal rules from `.rail-flight-status`, retained the 32:68 outer pane boundary, and restored only the two short vertical rules between the three bottom operational statistics.
   - Post-fix evidence: browser-computed styles report no top or bottom border on the flight-number row, 1 px borders on the second and third statistic cells, a 1 px right border on the flight pane, no viewport overflow, and no error overlay.
   - Visual evidence: `artifacts/option3-balance-2026-07-31/13-stat-dividers-restored.png` and `artifacts/option3-balance-2026-07-31/12-comparison.png`.
24. Option 3 one-hour pre-arrival forecast:
   - Earlier finding: the dotted current-to-arrival segment left of the arrival marker was visually empty even though it represented useful pre-arrival context.
   - Fix: added one destination-local hourly forecast labeled `도착 1시간 전`, centered between the current-position plane and arrival marker. Existing arrival and post-arrival forecast positions remain unchanged.
   - Post-fix evidence: all three rows render exactly one pre-arrival forecast; their boxes end before the arrival marker, no row or document overflow is present, and no error overlay is rendered.
   - Visual evidence: `artifacts/option3-balance-2026-07-31/14-pre-arrival-forecast.png`, `15-pre-arrival-focus.png`, and `16-pre-arrival-comparison.png`.
25. Option 3 current-position plane replacement:
   - Earlier finding: the plane icon and pre-arrival forecast both occupied the current-to-arrival segment, creating two competing visual anchors.
   - Fix: removed the plane icon entirely and moved the pre-arrival forecast to its former center position at the start of the dotted segment. The arrival marker and all arrival/post-arrival forecasts remain fixed.
   - Post-fix evidence: the browser renders zero `.plane-dot` elements and three pre-arrival forecasts. Each pre-arrival center is x=703.36 px, aligned with the former plane position and safely before the x=942.11 px arrival marker; no overflow or error overlay is present.
   - Visual evidence: `artifacts/option3-balance-2026-07-31/17-pre-arrival-replaces-plane.png`, `18-pre-arrival-replaces-plane-focus.png`, and the updated `16-pre-arrival-comparison.png`.
26. Shared weather-condition labels:
   - Earlier finding: weather icons in both concepts relied on image recognition alone, with temperatures but no textual condition.
   - Fix: added a shared icon-to-Korean-condition mapping and rendered the condition immediately below every current, pre-arrival, arrival, and hourly forecast icon while retaining temperatures underneath.
   - Post-fix evidence: each concept renders 18 condition labels. All three Option 1 columns and Option 3 rows report zero internal overflow; the document has no overflow or error overlay in either view.
   - Visual evidence: `artifacts/weather-condition-labels-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`.
27. Shared arrival-period surface highlight:
   - Earlier finding: arrival-hour forecasts used typography weight and the Option 3 progress marker, but neither concept gave the complete forecast reading a sufficiently clear visual surface.
   - Fix: gave only the arrival-hour cell a pale cool-gray card surface with a hairline outline and inset navy top accent. Option 1 applies it to the first arrival forecast in each column; Option 3 insets it below the flight line so it cannot collide with the arrival marker.
   - Post-fix evidence: each concept renders exactly three highlighted arrival surfaces using identical color and border tokens. All columns, rows, and the document report zero overflow, and no error overlay is present.
   - Visual evidence: `artifacts/arrival-surface-highlight-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`.
28. Fluent selected-state correction:
   - Earlier finding: the first surface pass used rounded corners, a border, and an inset blue top accent, which made the arrival forecast look like a newly inserted standalone card rather than a state of the existing forecast grid.
   - Fix: followed Fluent selected-state tokens instead of Card anatomy. Removed the margin, border, radius, and shadow; changed only the existing cell surface to the neutral selected background and retained bold arrival time/temperature plus the Option 3 marker.
   - Post-fix evidence: all six arrival cells report `rgb(235, 235, 235)`, `0px` border, `0px` radius, and no shadow. Both concepts retain zero document overflow and no error overlay.
   - Visual evidence: `artifacts/fluent-arrival-selected-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`.
29. Geist active-grid alternative:
   - User-selected direction: option 1 from the researched modern SaaS treatments—an active grid cell rather than a neutral enterprise selected row.
   - Fix: replaced the Fluent neutral gray with a very low-chroma blue background and a 1 px related-color boundary while retaining square corners, flat elevation, and the existing grid geometry.
   - Post-fix evidence: all six arrival cells report `rgb(242, 247, 255)`, a `1px solid rgb(214, 228, 245)` border, `0px` radius, and no shadow. Both views retain zero document or internal overflow and no error overlay.
   - Visual evidence: `artifacts/geist-active-arrival-2026-07-31/option-1.png`, `option-3.png`, and `comparison.png`.
30. Option 3 pre-arrival edge-spacing revision:
   - Earlier finding: after replacing the plane icon, the 100 px pre-arrival forecast box began essentially at the flight/weather pane boundary, making the seam and forecast label feel crowded.
   - Fix: adjusted the row split from 32:68 to 33:67 and moved the dotted-segment/pre-arrival anchor 28 px deeper into the weather pane. The arrival grid, marker, and five post-arrival cells retain their shared axis.
   - Post-fix evidence: at 2048 × 1152 the flight pane measures 675.83 px and the weather pane 1372.16 px. The first pre-arrival box begins 26 px after the pane boundary in every row; arrival marker and first forecast centers differ by only 0.008 px. No internal or document overflow and no error overlay are present.
   - Visual evidence: `artifacts/rail-prearrival-spacing-2026-07-31/option-3.png`, `first-row.png`, and `comparison.png`.
31. Shared optical icon alignment and page-cycle indicator:
   - Earlier finding: the transparent forecast PNG canvases were centered, but their visible alpha bounds sat 1.5–6.5 source pixels left of the canvas center, so the icon artwork appeared subtly left of its centered condition and temperature labels. Neither concept exposed the size or current position of its slide cycle.
   - Fix: added per-asset optical offsets derived from each transparent PNG's visible alpha bounds and applied them to the shared forecast images in both concepts. Added a top-center page indicator driven by each concept's real slide-group count; outlined circles represent the full cycle and the filled circle represents the active page.
   - Post-fix evidence: all 15 visible Option 1 forecast icons have a maximum visible-artwork-to-label center delta of 0.018 px, and the active Option 3 icon differs by 0.013 px. Option 1 reports `2페이지 중 1페이지`, changes to `2페이지 중 2페이지` after the next-group transition, and Option 3 honestly reports `1페이지 중 1페이지`; no duplicate data page was invented. Neither view has document overflow or an error overlay.
   - Visual evidence: `artifacts/page-indicator-optical-alignment-2026-07-31/option-1.png`, `option-3.png`, and `option-1-page-2.png`.
32. Option 1 far-edge local-time placement and time-zone context:
   - Earlier finding: the local-time block's flex parent used intrinsic content width, leaving the clock well inside the destination band instead of at its right edge, and the large local value had no local time-zone abbreviation.
   - Fix: expanded the destination-band content wrapper to the full column width, anchored the clock block to its far right, and added each destination's actual local abbreviation beside the clock value: JST, SGT, CEST, or ICT.
   - Post-fix evidence: at 2048 × 1152 all three clock blocks end exactly at their column content edge with a 0 px delta. The first group renders JST/SGT/CEST and the second renders JST/ICT/CEST while retaining the Korean comparison time and KST context below.
   - Visual evidence: `artifacts/page-indicator-optical-alignment-2026-07-31/option-1-timezones.png` and `option-1-page-2.png`.
33. Shared airport-name anatomy and Option 3 local time zones:
   - Earlier finding: Option 1 split the city and formal airport name across a large title and a secondary subtitle while Option 3 used one large familiar `도시 + 공항명 + IATA` heading. Option 3 also lacked the local time-zone abbreviation newly added to Option 1.
   - Fix: gave Option 1 the same heading anatomy as Option 3 (`도쿄 하네다 HND`, `파리 샤를 드 골 CDG`) and removed the duplicate formal-airport subtitle. Added JST, SGT, and CEST beside the three Option 3 local clocks while retaining the Korean comparison line below.
   - Post-fix evidence: both Option 1 pages render all six combined headings without horizontal overflow. In Option 3 all three local-clock blocks remain right-aligned within 1 px of the pane content edge, report the correct time-zone abbreviations, and have no internal overflow. A controlled 2.3-second post-FLAP capture confirms one settled page, no entering/leaving nodes, and zero active animations.
   - Visual evidence: `artifacts/shared-airport-timezone-2026-07-31/option-1-page-1.png`, `option-1-page-2-controlled.png`, `option-3.png`, and `comparison.png`.
34. Option 3 selectable motion modes and real second flight page:
   - Earlier finding: Option 3 only demonstrated a row-panel slide and replayed the same three flights, so its page indicator could honestly show only one page and no alternative element-level motion could be compared.
   - Fix: added header controls for `CASCADE`, element-only `FLAP`, element-only `ROLL`, row `WIPE`, and row `FADE`, plus a `다음 3편` control. Added a real second group for Osaka Kansai, Bangkok Suvarnabhumi, and Rome Fiumicino and bound it to the two-dot page indicator. FLAP/ROLL preserve fixed labels, row dividers, the timeline rail, and arrival-cell surface while changing only destination, flight, clock, statistic, and forecast values.
   - Post-fix evidence: every mode completed a full 1→2 or 2→1 page transition and settled with one `.rail-page`, three rows, zero active animations, and the correct indicator/city set. At the sampled FLAP mid-frame, none of 51 matched old/new motion slots were simultaneously visible and only three fixed local-clock labels remained visible. Both settled pages have zero horizontal/vertical document overflow and no error overlay.
   - Visual evidence: `artifacts/rail-motion-modes-2026-07-31/controls-with-flap.png`, `flap-mid-fixed.png`, `flap-page-2.png`, `roll-two-pages-mid.png`, `wipe-two-pages-mid.png`, `fade-two-pages-mid.png`, `cascade-two-pages-mid.png`, and `comparison.png`.

## Primary interactions tested

- `?view=rail` selects Option 3; the default route selects Option 1.
- Keyboard `1` and `3` switch between the two independent concepts.
- Header `1안` and `3안` buttons switch between the concepts in either direction.
- Keyboard `R` replays the transition.
- Option 1 `FLAP`, `ROLL`, `WIPE`, and `FADE` buttons select and immediately replay their corresponding animation.
- Option 1 changes six information bands from top to bottom; each destination column follows with a short offset.
- Option 3 moves rows independently with 0 ms, 120 ms, and 240 ms entry delays.
- Autoplay can be disabled with `?autoplay=0`.
- Browser check found no Vite error overlay, no viewport overflow, and meaningful content in all three rows.
- Latest fixed-rhythm browser check found meaningful content, no captured console errors, no Vite error overlay, and no horizontal or vertical document overflow after the next-flight transition and the `1안` → `3안` → `1안` round trip.
- Browser-computed latest sizes: Option 3 timeline labels 18 px, arrival values 28 px, forecast times 18 px, and forecast temperatures 20 px. Option 1 uses 18 px section/arrival labels, 16 px weather details and forecast times, 18 px forecast temperatures, and 14 px arrival context.

## Follow-up polish

- P3: a production integration can replace the source-derived weather rasters with a licensed weather icon set of the same optical weight.
- P3: actual terminal font availability should be pinned locally rather than fetched from Google Fonts.

final result: passed
