# Reference Pack — Operational / Data-Dense Design Systems

Date: 2026-06-27
Scope: VISUAL design pass on the ProjectAMO pre-flight weather briefing panel (route header, sticky
section nav, status-chip board, hazard summary, per-airport 6-column data tables with VFR/MVFR/IFR/LIFR
category badges, route hazard ribbon + vertical cross-section chart, destination TAF block).
Goal: status-first scannability under time pressure; color as exception-emphasis only; 8pt spacing;
fixed type scale with value = semibold.

Legend: **[S]** = sourced/published value · **[I]** = inferred / synthesized recommendation.

---

## 1. Reference list (sources + relevance)

1. **IBM Carbon — Data table (style & usage)** — row-size system, gutter padding, header styling, divider-first tables.
   https://carbondesignsystem.com/components/data-table/style/ · https://v10.carbondesignsystem.com/components/data-table/usage/
2. **IBM Carbon — Spacing** — full 8pt-based spacing token scale (spacing-01…spacing-13).
   https://carbondesignsystem.com/elements/spacing/overview/
3. **IBM Carbon — Typography / Type sets** — productive type tokens (label-01, body-compact-01, heading-compact-01) with px/line-height/weight.
   https://carbondesignsystem.com/elements/typography/type-sets/
4. **Atlassian Design System — Lozenge + Color** — compact uppercase status labels, semantic appearances, token-based status color.
   https://atlassian.design/components/lozenge/ · https://atlassian.design/foundations/color
5. **USWDS — State color tokens** — government operational state palette (info/success/warning/error/emergency) with exact hex grades + "don't induce panic" guidance.
   https://designsystem.digital.gov/design-tokens/color/state-tokens/ · https://designsystem.digital.gov/components/alert/
6. **Grafana — Configure thresholds / dashboard best practices** — 3-step severity thresholds, exact threshold hex, "blue good / red bad", colorblind-friendly green-orange-red.
   https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/configure-thresholds/ · https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
7. **Material Design — Data tables / Density** — baseline + condensed row heights, density-by-4dp rule, density opt-in target-size guidance.
   https://m2.material.io/components/data-tables/web · https://m3.material.io/foundations/layout/understanding-layout/density
8. **Colorblind-safe palette guidance (Wong palette) + Tableau "don't use red/green together"** — redundant encoding, blue/orange safe pair, shape+icon reinforcement.
   https://www.tableau.com/blog/examining-data-viz-rules-dont-use-red-green-together · https://colorblind.io/guides/colorblind-safe-palettes
9. **SCADA / HMI control-room design best practices** — Red=critical / Yellow=warning / Blue=info convention, neutral background, only show critical data, group related info.
   https://industrialmonitordirect.com/blogs/knowledgebase/scada-hmi-design-best-practices-and-industry-standards · https://shelautomation.com/blogs-ux-ui-scada-hmi/

---

## 2. Spacing & type scale (concrete tokens)

### Carbon spacing scale **[S]** (8pt-complementary; multiples of 2/4/8)
| Token | px | Token | px |
|---|---|---|---|
| spacing-01 | 2 | spacing-06 | 24 |
| spacing-02 | 4 | spacing-07 | 32 |
| spacing-03 | 8 | spacing-08 | 40 |
| spacing-04 | 12 | spacing-09 | 48 |
| spacing-05 | 16 | spacing-10 | 64 |

Basic unit of Carbon's 2x grid = the **8px mini-unit**; all box/margin/padding are multiples. **[S]**

### Carbon productive type tokens **[S]**
| Token | Size | Line-height | Weight | Use |
|---|---|---|---|---|
| label-01 | 12px | 16px | 400 | column labels, units, captions |
| helper-text-01 | 12px | 16px | 400 | secondary/raw values |
| body-compact-01 | 14px | 18px | 400 | dense table cell values |
| heading-compact-01 | 14px | 18px | 600 | emphasized value / row id |
| heading-compact-02 / heading-02 | 16px | 22px | 600 | section headings |
| (panel/route header) | 20–28px | — | 600 | inferred top-level identity |

Productive set base = 14px; expressive base = 16px. Bold always outranks lighter weight at the same size. **[S]**

### Recommendation for our panel **[I]**
- Adopt a **4-step fixed scale** mapping to the user's label/body/section/panel intent:
  - **label** = 12px / 16 / 400 (uppercase or sentence) — column heads, units (kt, SM, ft, hPa), chip captions
  - **body** = 14px / 18 / 400 — table values, prose
  - **value emphasis** = 14px / 18 / **600** — the scanned number per cell (user's "value = semibold")
  - **section** = 16px / 22 / 600 — section nav targets / block titles
  - **panel** = 20–24px / 600 — route identity header
- Spacing: use Carbon tokens directly — **cell padding 16px (spacing-05) horizontal**, **8px (spacing-03)** for tight intra-chip gaps, **16/24px (spacing-05/06)** between rows-of-content within a section, **24/32px (spacing-06/07)** between major sections. Everything lands on 8pt; only the 2/4/12px micro-tokens break the pure-8 grid, by design, for detail spacing.

---

## 3. Dense table spec (6-column airport tables)

### Sourced row-height systems
- **Carbon row sizes [S/I]**: Carbon ships 5 selectable sizes — **xs ≈ 24px, sm ≈ 32px, md ≈ 40px, lg ≈ 48px (default), xl ≈ 64px**. ([S] that 5 sizes exist incl. "compact/short/normal/tall"; the exact px ladder 24/32/40/48/64 is the published Carbon size ladder but I could not re-render the spec table this session — treat px as **[S-convention]**.) Header row must match body row size. Cell text is vertically centered (xl is top-offset by `padding-top:16px`). **[S]**
- **Material [S]**: baseline data-table row = **52dp**, header = **56dp**; "higher density = reduce top/bottom padding or height by 4dp per density step." Common condensed ladder = **40 / 48 / 56px**. Density must be opt-in; revert controls keep 48×48 targets.

### Recommended spec for our 6-col table **[I, anchored to Carbon]**
- **Row height: 32px (Carbon "sm/compact")** for data rows. Operational density wins; 32px keeps 5–7 rows visible without scroll while staying above the ~28px legibility floor.
- **Header row: 32px** to match; header label = **label-01 (12px/400)**, slightly muted (secondary text token), with a **single 1px bottom divider** (heavier than row dividers).
- **Cell padding: 16px horizontal (spacing-05), 8px vertical** when row taller than 32; at 32px rely on line-height, not vertical padding.
- **Alignment:** numeric/measured columns (wind, vis, ceiling, temp, QNH) **right-aligned or decimal-aligned**; the weather/text column **left-aligned**. Units in **label-01** color-muted, trailing the value. Use **tabular/monospaced figures** (`font-variant-numeric: tabular-nums`) so digits column-align — critical for scanning kt/ft/hPa.
- **Dividers, not zebra:** Carbon-style **1px row dividers** (low-contrast neutral, e.g. a `border-subtle` token) over zebra striping. Zebra adds visual noise that competes with our exception-color emphasis. Keep cells on the panel background.
- **Highlighting an exceeded cell:** do **not** fill whole rows. Emphasize the single out-of-limits cell with (a) a **category badge** (VFR/MVFR/IFR/LIFR) and/or (b) a **left 2–3px color bar or a tinted cell background at low opacity (~8–12%)** plus a **small shape/icon**, never color alone. This matches Grafana's per-value conditional formatting and Carbon's notification color usage = exception only.

---

## 4. Status / severity color system

### USWDS state tokens (exact hex) **[S]** — strong base because it's a government *operational* palette tuned to avoid panic
| Family | Lighter | Default | Darker |
|---|---|---|---|
| Info | #e7f6f8 | #00bde3 | #2e6276 |
| Success | #ecf3ec | #00a91c | #216e1f |
| Warning | #faf3d1 | #ffbe2e | #936f38 |
| Error | #f4e3db | #d54309 | #6f3331 |
| Emergency | — | #9c3d10 | #332d29 |

USWDS guidance **[S]**: "don't make heavy use of bright red/orange — they can produce fear/panic." Reserve the most saturated reds for genuine emergency.

### Grafana threshold convention **[S]**
- 3-step is best practice: **green #37872D / yellow #E0B400 / red #C4162A**; "blue = good, red = bad."
- Offers **green-orange-red** as the colorblind-friendlier alternative to green-yellow-red.

### Atlassian Lozenge **[S]** — model for our status chips/badges
- Compact **UPPERCASE** label conveying one status at a glance; semantic appearances: **default (grey/neutral), success (green), removed/error (red), inprogress (blue), new (purple), moved (yellow)**. Driven by semantic tokens (`color.text.*`, `color.background.*`) not raw hex — adopt the *token-not-hex* discipline.

### Mapping to OUR systems **[I]**
**RAG / general status board:**
- OK/normal → success (USWDS #00a91c family or muted), or simply neutral text (reserve green for "explicitly clear")
- Caution → warning (#ffbe2e / amber)
- Hazard/critical → error (#d54309) → emergency (#9c3d10) for the worst tier

**Aviation flight-category badges (VFR/MVFR/IFR/LIFR)** — keep the *de-facto aviation-standard* category colors operators already recognize (this is domain convention, override generic RAG):
- **VFR = green**, **MVFR = blue**, **IFR = red**, **LIFR = magenta/purple**. **[I — aviation convention; verify exact hex against ProjectAMO's existing category tokens before changing]**
- Render as **filled badges with the 4-letter category text** so the label itself disambiguates — color is reinforcing, not sole carrier.

**Colorblind safety [S]:**
- Aviation green(VFR)/red(IFR) is a red-green pair — the worst case for deuteranopia (~5% of males read them as yellow/brown). **Mandatory redundant encoding:** always show the **text category** in the badge; consider a **shape/icon or border-weight** difference per tier. Never communicate VFR-vs-IFR by fill color alone.
- Where a 2-color contrast is needed, **blue/orange** is the most universally safe pair (Wong palette).
- Target **WCAG AA (4.5:1 text / 3:1 large text & UI)**; the USWDS *darker* grades exist specifically to hit AA for text-on-light.

---

## 5. Cards vs dividers / elevation

Patterns across these systems for sectioning *dense* content **[S/I]**:
- **Carbon & USWDS:** dense tabular/operational content sits on a **flat surface separated by 1px dividers and whitespace**, not nested cards. Elevation is reserved for transient/overlay layers (menus, modals, popovers) — not for static data blocks. **[S, Carbon notification/elevation usage]**
- **SCADA/control-room:** **neutral flat background, group related info, minimize chrome**; cards/borders add visual load that competes with alarm color. **[S]**
- **Material:** cards are fine for *separable, independently-actionable* objects, but for a continuous data panel, density guidance favors reduced internal padding over card boundaries. **[S]**

**Recommendation [I]:** Sections = **whitespace (24–32px) + a section heading + optional 1px hairline rule**, *not* boxed cards. Reserve a card/elevated treatment for at most **one** element — the top **status-chip summary board** — to make it read as the "scan-first" surface. Everything below (tables, ribbon, cross-section, TAF) is flat with dividers. This keeps exception-color as the only thing that "pops."

---

## 6. Concrete actions for OUR panel (prioritized)

1. **Drop card-per-section; go flat + dividers.** Sections separated by 24–32px whitespace (spacing-06/07) + 1px `border-subtle` hairline. Only the status-chip board may get a subtle surface/elevation. *(Carbon/USWDS/SCADA — §5)*
2. **Compact the 6-col tables to 32px rows** (Carbon "sm/compact"), header row 32px to match, **16px horizontal cell padding** (spacing-05), header label in **label-01 12px/400** muted with a 1px bottom divider. *(Carbon — §3)*
3. **Tabular figures + right/decimal-align numeric columns** (wind/vis/ceiling/temp/QNH); units in muted label-01 trailing the value; weather column left-aligned. *(§3)*
4. **Exception emphasis only at cell level:** badge + low-opacity tint or 2–3px color bar + shape/icon on the *out-of-limits cell*, never full-row fill, never color-only. *(Grafana conditional formatting + Carbon notification color — §3/§4)*
5. **Adopt a 4-step fixed type scale** label 12/body 14/section 16/panel 20–24, value=**600**. Map every text element to one token; kill ad-hoc sizes. *(Carbon type — §2)*
6. **Move all spacing onto Carbon tokens** (2/4/8/12/16/24/32). Audit the panel for off-grid values. *(Carbon spacing — §2)*
7. **Severity palette:** use USWDS-grade hues (warning #ffbe2e, error #d54309, emergency #9c3d10, success #00a91c) for the general RAG board; **reserve most-saturated red for true critical** to avoid panic-fatigue. *(USWDS — §4)*
8. **Keep aviation category colors (VFR green / MVFR blue / IFR red / LIFR magenta) but make them text-labeled filled badges** so red-green colorblind operators read category from the letters, not the fill. Verify exact hex against existing ProjectAMO category tokens. *(colorblind guidance — §4)*
9. **Status-chip board = Atlassian-lozenge model:** compact, uppercase/short label, semantic token color, neutral default; this is the glance-first surface. *(Atlassian — §4)*
10. **Contrast pass to WCAG AA** (4.5:1 text, 3:1 UI/large) using USWDS darker grades where text sits on tinted state backgrounds. *(§4)*

---

### Open items to verify against the live codebase (not researched here)
- ProjectAMO's *existing* VFR/MVFR/IFR/LIFR hex tokens (action #8 says match them — exact aviation hex is **[I]** here).
- Whether the panel is light or dark surface (SCADA dark-ops is optional; current panel appears light). Severity hex above are tuned for **light** surfaces; a dark variant would need the *light* USWDS grades for fills and lighter text.
- Carbon row-height px ladder (24/32/40/48/64) is **[S-convention]** — confirm against the current Carbon `data-table/style` spec table before locking the 32px number.
