# Reference Study — Aviation / EFB Pre-Flight Weather Briefing Design

Date: 2026-06-27
Scope: Visual design pass for ProjectAMO's right-side "비행 전 브리핑" (pre-flight briefing) panel.
Author: design-research agent (read-only; no app code touched).

> **Provenance tags used below:** `[SOURCED]` = stated in a cited source. `[INFERRED]` = my reconstruction from screenshots/convention, not directly quoted. Hex values for flight category are de-facto community/SkyVector/AWC-leaflet values, marked `[CONVENTION]` — the official AWC docs name the colors but do **not** publish hex.

---

## 1. Reference list

1. **ForeFlight — Vertical Cross Section Chart (how to interpret)** — https://support.foreflight.com/hc/en-us/articles/360035369174 — The single most directly relevant source: exact axis layout (altitude left, 15 route segments bottom), terrain shading, icing curves, turbulence EDR boxes, wind barbs, temperature labels. This is the template for our ④ cross-section.
2. **ForeFlight — Weather in Profile View (enhancement)** — https://foreflight.com/enhancements/weather-in-profile-view — Layer selector model, "same color scale as overhead map," **hatch pattern for no-data** (no false certainty). Directly informs our icing/turbulence shading + missing-data handling.
3. **ForeFlight — Flight Category dots** — https://support.foreflight.com/hc/en-us/articles/204019615 — Confirms green/blue/red/magenta dot convention applied to airports.
4. **AWC — Graphical Forecasts for Aviation (GFA) Help** — https://aviationweather.gov/gfa/help/ — Authoritative flight-category thresholds + the **yellow ring around VFR dot** "potential problem" pattern (severity beyond color). The government standard our Korean tool should mirror.
5. **AWC — METAR & TAF interactive/plot help** — https://www.aviationweather.gov/metar (and /taf/help?page=plot) — Station-plot column model; raw-vs-decoded toggle convention.
6. **Garmin Pilot — weather widgets & flight profile (iPad Pilot News, 2025-10)** — https://ipadpilotnews.com/2025/10/weather-planning-with-garmin-pilot-widgets-and-flight-profile-pilot/ — Widget metadata footer (source · age · distance-off-route), time slider with map pin, side-view profile. Informs our chip board + TAF time scrubbing.
7. **SkyDemon — flight planning / virtual radar** — https://www.skydemon.aero/start/planning — Right-side tabbed weather panel (NOTAM / Weather / Airfields / Warnings); decoded-or-raw toggle; translucent weather "column." Validates our right-panel + section-nav structure.
8. **Jeppesen FliteDeck Pro — Briefing Module** — https://ww2.jeppesen.com/navigation-solutions/flitedeck-pro/briefing-module/ — Airline-grade briefing: digitized flight release, weather + NOTAM + sign-off in one ordered document. Confirms "one scrollable ordered briefing" model over scattered widgets.
9. **Neu Aviation — VFR/MVFR/IFR/LIFR dots explained** — https://www.neuaviation.com/blog/understanding-vfr-mvfr-ifr-and-lifr-what-the-weather-dots-really-mean — Clean threshold table + magenta-for-LIFR confirmation.
10. **experimentalaircraft.info — Decoding Colored METAR/TAF** (403 to bot, but indexed) / **MetarCentral — Flight Categories** https://metarcentral.com/learn/flight-categories — Cross-check on color application to station plots.

---

## 2. Layout patterns

**The dominant model is one ordered, scrollable briefing document — not a dashboard of free-floating widgets.** Jeppesen's Briefing Module digitizes "the entire contents of a flight release … weather, NOTAMs, sign-off workflows" as a single navigable artifact `[SOURCED]`. ForeFlight emails a single ordered briefing PDF after filing `[SOURCED]`. Our top→bottom section order (hazard → current → route → destination) matches this; keep it.

**At-a-glance leads detail (status-first).** Across all products the airport-level *flight category* is the headline; the raw text is disclosure underneath. ForeFlight puts color-coded category dots on airports with wind barbs + ceiling/vis text, then the full METAR on tap `[SOURCED]`. Garmin widgets show the headline value with a metadata footer, full report on tap `[SOURCED]`. **Action implication:** our summary "board" of chips is the correct pattern; make each chip a real flight-category color, not a neutral pill.

**Route weather + cross-section coexist as map-aligned, time-aware strips.** Garmin's profile is "a side view of your flight, complete with terrain and weather," scrubbed by a **time slider** that drops a **pin on the map** at the scrubbed position `[SOURCED]`. ForeFlight Profile shows terrain/obstacles/airspace/icing/turbulence "relative to your route line" `[SOURCED]`. **Implication:** our hazard ribbon and cross-section should share one x-axis (route distance/time) and ideally cross-highlight with the map — which the recent commits already started ("align hazard ribbon track to cross-section plot x-range"). Keep that coupling explicit and visible (shared tick labels, a single hover/scrub line spanning ribbon + chart).

**Section nav as right-rail tabs is a real EFB pattern.** SkyDemon's weather lives in a right-side panel with tabs (NOTAM / Weather / Airfields / Warnings) `[SOURCED]`. Our sticky ①③④⑤ nav is consistent; the only refinement is to make the *active* section legible and the chips tappable to jump (you already have scroll-spy).

---

## 3. Tables / METAR readouts

**Column model.** AWC station plots and EFB readouts converge on the decoded fields in a fixed order. Our 6 columns (wind / visibility / ceiling / temp-dewpoint / weather / QNH) match the standard decoded METAR field order `[INFERRED from AWC plot/inter help + EFB readouts]`. Keep that order; it is what pilots scan.

**Density & alignment `[INFERRED, strong convention]`:**
- **Right-align all numerics** (wind kt, vis, ceiling ft, temp/dewpoint, QNH) so digits line up column-wise for fast vertical scanning. Left-align only the station identifier and the weather/wx-string column.
- **Tabular / monospaced figures** for the numeric columns (CSS `font-variant-numeric: tabular-nums`) so rows align even with proportional fonts.
- One airport = one row in a compact table; the flight-category badge is the **row's leading element** (left edge), mirroring ForeFlight's "category dot first" reading order `[SOURCED pattern]`.

**Raw vs decoded.** SkyDemon decodes bulletins "so you don't need to remember the jargon" but keeps a **raw view toggle** `[SOURCED]`. Garmin shows the headline in the widget and the **full raw report on tap** `[SOURCED]`. **Implication:** show decoded 6-column table by default; offer raw METAR/TAF text as a collapsible line or on-tap reveal (progressive disclosure), never both fighting for primary space.

**What they DON'T color.** This is the most reusable restraint lesson:
- The flight category color is applied to **one carrier element only** — the dot/badge (ForeFlight) or the station-plot circle (AWC) — **not** the whole row, not every cell, not the text values. Coloring everything destroys the signal.
- Numeric values (wind, QNH, temp) are rendered in **neutral text**; color is reserved for category and for explicit hazards.
- METAR *age* uses a **separate** color scale (ForeFlight: green 0–4 min, blue 5–59 min, orange 60–89 min) `[SOURCED]` — deliberately distinct from flight-category colors so "stale data" never reads as "bad weather." **If we color data freshness, use a different channel (e.g., a small dot or muted text), never green/blue/red/magenta.**

---

## 4. Color & severity

**Flight-category color standard (the law of this domain) `[SOURCED — AWC GFA]`:**

| Category | Color | Ceiling | Visibility |
|---|---|---|---|
| VFR | **Green** | > 3,000 ft AGL | > 5 sm |
| MVFR | **Blue** | 1,000–3,000 ft AGL | 3–5 sm |
| IFR | **Red** | 500–<1,000 ft AGL | 1–<3 sm |
| LIFR | **Magenta / Purple** | < 500 ft AGL | < 1 sm |

Category = the **worse** of ceiling or visibility. This 4-color scheme is consistent across AWC, ForeFlight, Garmin, SkyVector `[SOURCED, multiple]`.

**De-facto hex values `[CONVENTION — SkyVector / AWC leaflet community values; AWC docs name colors only, do not publish hex]`:**
- VFR green: `#3CB371` (some impls `#008000` / `#00B000`)
- MVFR blue: `#3C73D8` (some `#0000FF`, softened to `~#2E6FE0` for screens)
- IFR red: `#E03C3C` (some `#FF0000`)
- LIFR magenta: `#C03CC0` / `#FF00FF` softened to `~#B23CB2`

Recommendation: adopt **desaturated/operational** variants (not pure FF primaries) for a dark operational UI — pure `#00FF00`/`#FF0000` read as "amateur/alarm." Keep hue identity (green/blue/red/magenta) but lower saturation and tune for your background. Mark these as design tokens, e.g. `--fcat-vfr`, `--fcat-mvfr`, `--fcat-ifr`, `--fcat-lifr`.

**Severity encoded BEYOND color (critical for accessibility + restraint):**
- AWC GFA draws a **yellow ring around a green VFR dot** to flag "cloud bases below 3,000 ft — potential problems with low-level flights" `[SOURCED]`. → Encode secondary caveats as an **outline/ring or icon**, not a hue change.
- Icing severity = **number of bisecting lines** on a blue curve (trace→light→moderate→severe), i.e. a redundant non-color channel `[SOURCED]`.
- Always pair category color with the **text label** (VFR/MVFR/IFR/LIFR) — never color-only — for color-blind safety and print/briefing export.

**Restraint patterns observed:** large neutral canvas; color is rare and meaningful; one accent per element; hazards "pop" precisely because 90% of the panel is greyscale + tabular text. The fix for "looks amateur" is usually *removing* color, not adding it.

---

## 5. Vertical cross-section / profile (the ④ chart) — ForeFlight spec

This is the highest-fidelity, directly-copyable reference. From the ForeFlight interpretation article `[SOURCED]`:

- **Axes:** read left→right like a graph. **Altitude on the left axis**, from surface up to **highest planned altitude + at least 2,000 ft** of headroom. Route divided into **15 equal segments** along the bottom.
- **Terrain:** **dark-green** filled background = highest terrain along route (sampled ±0.1° lat/long). ForeFlight also offers a **grayscale "Shaded Terrain"** option described as "same detail … with less visual distraction" `[SOURCED]` — strongly consider grayscale terrain for our operational panel so weather hazards own the color.
- **Icing:** **blue curves with bisecting lines**; more lines = higher severity (trace/light/moderate/severe) `[SOURCED]`.
- **Turbulence:** **colored boxes**, intensity keyed to the **Turbulence EDR scale shown at the bottom of the chart** `[SOURCED]`.
- **Temperature:** each block labels temp in **°C, negative by default, `+` prefix when positive** `[SOURCED]` — so the **freezing level** is readable directly from the sign change. (We can draw an explicit 0°C isotherm; ForeFlight infers it from labels.)
- **Wind barbs:** standard barbs relative to flight direction — short=5 kt, long=10 kt, pennant=50 kt; sum the symbols `[SOURCED]`.
- **No-data honesty:** Profile View draws a **hatch / cross-hatch pattern where forecast data is unavailable** `[SOURCED]` — the literal embodiment of "no false certainty." We should adopt the same hatch for gaps rather than leaving blank (reads as "clear") or interpolating (reads as false certainty).
- **Layer selector:** toggle Airspace / Icing / Turbulence; one icing + one turbulence layer at a time; legends/scales match the overhead map `[SOURCED]`.

**Legend placement:** ForeFlight puts the EDR/turbulence scale **at the bottom of the chart**, inline with the plot, not in a detached side legend `[SOURCED]`. Mirror this: a compact inline legend strip directly under the cross-section.

**Markers `[INFERRED + Garmin SOURCED for slider]`:** cruise altitude = a horizontal reference line across the plot; TOD/TOC = vertical tick on the route axis. Garmin couples the profile's horizontal position to a **map pin via a draggable slider** `[SOURCED]` — adopt a single scrub line that drives both ribbon and map.

---

## 6. Concrete actions for OUR panel (prioritized)

**P0 — Color discipline (biggest "amateur → pro" lever):**
1. Apply flight-category color to **one element per airport** — the leading badge on each ③ table row — and make it the **first thing in the row** (ForeFlight dot-first reading order). Do **not** tint the whole row or numeric cells. `[ref: ForeFlight dots, AWC]`
2. Use **NWS magenta for LIFR** (`~#B23CB2`), red for IFR, blue for MVFR, green for VFR — as named design tokens. Desaturate from primaries for a dark operational UI. Always show the **text label beside the color**. `[ref: AWC GFA, Neu Aviation]`
3. **Reserve the 4 category hues exclusively for flight category.** Move data-freshness/age to a **separate channel** (muted text or a distinct dot), as ForeFlight separates age-color from category-color. `[ref: ForeFlight METAR age]`

**P1 — Table craft (③ current conditions):**
4. **Right-align all numeric columns** (wind/vis/ceiling/temp-dew/QNH) with **tabular-nums**; left-align only ident + wx-string. `[INFERRED convention]`
5. Keep the 6-column decoded order; add a **collapsible raw METAR/TAF line** (decoded-default, raw-on-demand). `[ref: SkyDemon, Garmin]`
6. Add the **yellow-ring "caveat" treatment** for VFR-but-marginal (e.g., low cloud / gusty / nearby hazard) instead of inventing new colors. `[ref: AWC GFA yellow ring]`

**P2 — Cross-section & ribbon (④):**
7. Switch terrain fill to **grayscale** so icing/turbulence color carries all the signal; ForeFlight explicitly offers this for "less visual distraction." `[ref: ForeFlight Shaded Terrain]`
8. Encode **icing severity with redundant line-count or texture**, not just color intensity; show the **turbulence/EDR scale as an inline legend strip at the bottom of the plot.** `[ref: ForeFlight]`
9. Draw an explicit **0°C isotherm** (freezing level) as a labeled line; label temps in °C. Add a **cruise-altitude reference line** with **+2,000 ft headroom** above the max planned altitude on the y-axis. `[ref: ForeFlight axis spec]`
10. Render **hatch/cross-hatch for no-data** spans in both ribbon and cross-section — never blank, never interpolated. `[ref: ForeFlight Profile no-data hatch]`
11. Make the hazard **ribbon and cross-section share one x-axis** and a **single scrub/hover line**; on hover, cross-highlight the map position (Garmin's slider-pin coupling). `[ref: Garmin profile slider]`

**P3 — Structure & restraint:**
12. Treat the whole panel as **one ordered briefing document** (Jeppesen model), not a widget grid; keep the sticky ①③④⑤ nav with a clearly-marked active section. `[ref: Jeppesen Briefing Module, SkyDemon tabs]`
13. Add a **metadata footer to each data block** — source · age · distance-off-route — like Garmin widgets, in muted small text. `[ref: Garmin widgets]`
14. **Reduce overall color and chrome**; large neutral/greyscale canvas with tabular text, color only on category + active hazards. This is the consistent "pro operational" signature across ForeFlight/Jeppesen/AWC.

---

## Inferred numeric specs (design starting points, validate visually)

`[INFERRED]` unless noted:
- Table row height: 28–32 px (operational density; not 44 px touch rows — this is desktop).
- Numeric column font: 13–14 px, `tabular-nums`, weight 500.
- Category badge: 18–22 px pill or 12 px dot + label; label 11–12 px uppercase.
- Section header: 13–14 px, uppercase, letter-spaced, muted; the *data* outranks the header visually.
- Cross-section y-axis: surface → (max planned alt + 2,000 ft) `[SOURCED headroom]`; ~15 x-segments `[SOURCED]`.
- Wind barb: short 5 kt / long 10 kt / pennant 50 kt `[SOURCED]`.
- Color tokens (operational, desaturated `[CONVENTION-derived]`): VFR `#3CB371`, MVFR `#3C73D8`, IFR `#E03C3C`, LIFR `#B23CB2`; caveat ring `#E6B800` (yellow).
