# Visual Polish References — Premium Operational & Weather Dashboards

> Design-research pass for the right-side pre-flight weather briefing panel.
> Goal: the AESTHETIC/CRAFT layer — what makes operational/weather UIs read as **premium & trustworthy** vs **cheap/amateur**, while staying dense and scannable.
> Tags: **[S]** = sourced (URL below) · **[I]** = inferred / synthesized from craft conventions.
> Date: 2026-06-27. No app source edited.

---

## 1. Reference list (steal-this, one line each)

1. **Stripe / Linear / Vercel premium-UI breakdown** — https://mantlr.com/blog/stripe-linear-vercel-premium-ui — *Steal:* color is for **meaning not decoration**; "the screen must survive grayscale"; one accent per screen; 4–6 type sizes max; interaction density > visual density. **[S]**
2. **Vercel design tokens (DesignMD benchmark)** — https://designmd.cc/benchmarks/vercel — *Steal:* "border-first" elevation — static cards get a **1px border (~#ebebeb)** via `box-shadow:0 0 0 1px rgba(0,0,0,.08)` (no offset/blur), **6px radius**, heavy shadows reserved for transient overlays only. **[S]**
3. **Linear design system (Refero capture)** — https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1 — *Steal:* near-black canvas, **4-step surface stack** canvas→elevated, razor-thin hairline borders + soft shadow instead of fills, **one acid accent used like a status light**. **[S]**
4. **Behind the Design: Flighty (Apple)** — https://developer.apple.com/news/?id=970ncww4 — *Steal:* model on **airport split-flap boards — one line per flight, 50 yrs of "what matters"**; glanceability first; "feels almost boringly obvious"; shine when things go wrong (delays/hazards). **[S]**
5. **Behind the Design: Carrot Weather (Apple)** — https://developer.apple.com/news/?id=kf623ldf — *Steal:* it is *colorful by brand choice*; the takeaway for us is the **inverse** — an ops tool earns trust through restraint, not Carrot's splash. Pro layers (fronts, severe alerts) stay legible because color = severity, not flair. **[S]**
6. **Datadog dark mode** — https://www.datadoghq.com/blog/introducing-datadog-darkmode/ — *Steal:* dark canvas is **not pure black**; light text on dark surfaces; chart series colors re-tuned for dark (don't reuse light-mode hues). **[S]**
7. **Grafana time-series / bar viz docs** — https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/bar-chart/ + https://grafana.com/docs/grafana/latest/visualizations/dashboards/use-dashboards/ — *Steal:* **soft-min/soft-max** y-axis so flat data stays flat (no fake mountains); thresholds as restrained color bands; legend interactions over chart chrome. **[S]** — applies to our vertical cross-section.
8. **Badges vs Pills vs Chips vs Tags — Smart Interface Design Patterns** — https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/ — *Steal:* **dot** when "something is in state X" matters; **fill** for count/prominence; give badges a **1–2px stroke in the surface color** so they stay legible over any background. **[S]**
9. **Mobbin — Badge UI patterns** — https://mobbin.com/glossary/badge — *Steal:* real-product badge sizing/padding library; status badge = small, tight, muted-tint background + same-hue text, not saturated fill. **[S]** (browse Mobbin web → "dashboard", "weather", "fintech" for live composition refs **[I]**).
10. **A List Apart — Web Typography: tables to be read** — https://alistapart.com/article/web-typography-tables/ — *Steal:* **tabular-nums**, right-align numerals, **horizontal rules only** (kill vertical gridlines), whitespace as the separator. **[S]**
11. **Datawrapper — fonts for data viz** — https://www.datawrapper.de/blog/fonts-for-data-visualization — *Steal:* pick a font with a **tabular/lining figure set**; IBM Plex / Inter differentiate glyphs (0/O, 1/l) — critical for METAR/TAF codes. **[S]**
12. **The Ultimate Guide to Designing Data Tables (Molly Hellmuth)** — https://medium.com/design-with-figma/the-ultimate-guide-to-designing-data-tables-7db29713a85a — *Steal:* row height rhythm, label vs value contrast by **weight not color**, zebra only when scanning across many columns. **[S]**

---

## 2. Craft principles (grouped, with copyable values)

### A. Color & neutrals — *restraint is the whole game*
- **The grayscale test [S]:** desaturate the panel. If hierarchy collapses, color was doing structural work it shouldn't. Premium = readable in grayscale, color only adds *meaning*.
- **Budget: mostly neutral gray + 1 product accent + reserved status colors. [S]** Stripe = neutrals + measured indigo; Vercel = near-mono + context color; Linear = grays + one acid accent. Our panel currently spends color everywhere (section tints, blue nav) — that reads amateur.
- **Neutral ramp (suggested, light) [I]:** canvas `#FFFFFF` → subtle surface `#FAFAFA` → hairline `#EBEBEB` → divider-strong `#E0E0E0` → icon/muted `#9CA3AF` → secondary text `#6B7280` → body `#374151` → heading `#111827`. ~7–8 steps, perceptually even. (Vercel uses `#ebebeb` borders. **[S]**)
- **Status colors are *reserved*, never decorative [S]:** red=danger, amber=caution, green=ok, blue=info. In aviation, keep the **category vocabulary distinct from generic level**: VFR green / MVFR **blue** / IFR **red** / LIFR **magenta** — these are ICAO conventions, not the green/amber/red severity ramp. Don't let the two palettes collide (your B1/B3 issue). **[I]**
- **Tint discipline [S/I]:** a "normal" row is achromatic. Only a threshold breach gets a **low-sat tint at ~8–12% alpha** plus a 2–3px left severity rule. Full-saturation section backgrounds are the #1 amateur tell here.

### B. Typography — *hierarchy by weight + size, not color*
- **One typeface, 4–6 sizes max. [S]** Use a UI font with **tabular lining numerals** and strong glyph differentiation (Inter, IBM Plex Sans, Geist). **[S]**
- **Fixed scale (suggested) [I]:** micro-label 11px / body 13px / value 13–14px **semibold** / section title 16–18px semibold / panel title 20–22px. Modular ~1.2–1.25 ratio. Labels = **regular**, values = **semibold** — that one move creates most of the hierarchy.
- **Small-caps labels [S/I]:** uppercase 11px micro-labels get **letter-spacing ~0.04–0.06em** (tracking compensates for uppercase density) and a muted gray — never bold + uppercase + colored at once.
- **Numerals [S]:** `font-variant-numeric: tabular-nums` on every table value; **right-align numeric columns, left-align label columns**. This alone fixes the "29003KT / Q1006 wobble."
- **Optical alignment [S]:** align to the glyph, not the box, on headings and leading icons; keep units attached to values (nbsp) but watch clip width.

### C. Spacing & rhythm — *density without clutter*
- **8pt grid (4/8/12/16/24/32) tokenized [S].** Use 4pt only for line-height/inside-chip nudges. Kill ad-hoc 6/14/18px.
- **Inner padding ≤ outer gap [S]:** elements inside a group sit closer than the gap to the next group — this is what makes density read as "organized" not "cramped."
- **Vertical rhythm:** consistent row height in tables; consistent section spacing. Irregular gaps are a top amateur tell.

### D. Elevation, borders & dividers — *escape "boxes inside boxes"*
- **Border-first elevation [S]:** static content = **1px hairline** (`#EBEBEB` light), no shadow. Reserve real shadows for **transient overlays** (menus, tooltips, the cross-section if it floats).
- **Don't card everything [S]:** Vercel/Linear stack surfaces in a **3–4 step range** (canvas → subtle surface → 1 elevated card). When *every* section is an equal 1px+radius card, nothing leads. **Promote exactly one surface** (the summary board) to a card; demote the rest to **whitespace + a single hairline divider** between sections.
- **Radius consistency [S]:** one radius for cards/inputs (**6px**), optionally a tighter one (4px) for chips. Mixed radii = amateur.
- **Hairline craft [S]:** dividers at very low contrast (`#EBEBEB`/`#E0E0E0`), 1px, **horizontal only**. The 2px header border-bottom you have is too loud.

### E. Chips & badges — *small, tight, muted*
- **Status badge anatomy [S/I]:** ~11–12px text, padding ~2px×8px, radius 4px (or full pill for counts). **Muted-tint background (~10–15%) + same-hue text**, *not* a saturated solid fill. Optional **leading dot** when state-presence matters more than a number.
- **Surface stroke trick [S]:** add a **1–2px stroke in the surface/canvas color** around a badge so it stays detached and legible over tinted rows or the map.
- **Dot vs fill [S]:** dot = "is in state X" (airport category indicator on the board chips); fill = emphasis/count (worst-hazard count). Use deliberately, not both everywhere.
- **Refinement:** color + **icon + text** together (▲ caution, category text) for colour-blind safety — don't rely on red tint alone.

### F. Charts / plots — *applies to the vertical cross-section*
- **Axis & gridline restraint [S]:** thin, low-contrast gridlines (or none on the dense axis); axis labels in the muted gray, not black. Let data ink dominate.
- **Stable scale [S]:** soft-min/soft-max so flat profiles don't render as fake mountains; fixed, labeled altitude axis.
- **Severity via restrained threshold bands [S/I]:** turbulence/icing as low-sat bands keyed to the *same* severity ramp as the rest of the panel — **resolve the "green = cloud AND green = VFR-good" collision** (your B3). Pick one meaning for green in the chart; recolor the other.
- **Legend craft [S]:** inline, small, muted; legend keys = the exact swatch + tabular label, aligned. No boxed legend chrome.
- **No card-in-card [S/I]:** the chart should sit on the section's own surface, not a white card inside a tinted card.

### G. Dark mode notes
- **Not pure black [S]:** dark canvas ~`#0B0E14`–`#111317`; surfaces step up in lightness, not via borders alone. Datadog re-tunes everything for dark rather than inverting.
- **Re-tune status hues for dark [S]:** light-mode red/blue/magenta lose legibility on dark — raise lightness/lower saturation. Verify category colors (esp. MVFR blue vs IFR red) keep separation and AA contrast in both themes.
- **Hairlines flip [I]:** dividers become a low-alpha *white* (`rgba(255,255,255,.08)`) instead of dark gray.

---

## 3. Amateur tells → premium fix (review checklist)

| # | Amateur tell | Premium fix |
|---|---|---|
| 1 | Every section is a 1px-border + radius card (boxes-in-boxes) | Whitespace + one hairline divider between sections; **only the summary board is a card** **[S]** |
| 2 | A card inside a card (chart card inside tinted section) | Chart sits directly on the section surface; no nested fill **[S]** |
| 3 | Full-saturation colored section backgrounds | Achromatic by default; threshold breach only → ~8–12% tint + left severity rule **[S/I]** |
| 4 | Many accent hues competing (blue nav in a green app) | One product accent + reserved status colors; neutral grays for everything structural **[S]** |
| 5 | Hierarchy carried by color (gray-on-gray, same size) | Hierarchy by **size + weight**: labels regular, values semibold; 4–6 fixed sizes **[S]** |
| 6 | Proportional numerals, centered values wobbling | `tabular-nums`, right-align numeric columns, left-align labels **[S]** |
| 7 | Full grid (vertical + horizontal cell borders) | Horizontal hairlines only; whitespace separates columns **[S]** |
| 8 | Loud 2px borders / heavy shadows on static panels | 1px low-contrast hairlines; shadows reserved for overlays **[S]** |
| 9 | Mixed corner radii (4/6/8/12 scattered) | One card radius (6px), one chip radius (4px) **[S]** |
| 10 | Saturated solid status chips | Muted-tint bg + same-hue text + surface stroke; dot where presence matters **[S]** |
| 11 | Ad-hoc spacing (6/14/18px), uneven rows | 8pt token scale; inner padding ≤ outer gap; uniform row height **[S]** |
| 12 | Uppercase labels bold + colored + tight | Uppercase 11px, regular, muted, letter-spacing ~0.05em **[S/I]** |
| 13 | Same color means two things in a chart (green=cloud & green=good) | One meaning per hue; recolor the conflict; muted threshold bands **[S/I]** |
| 14 | Chart with black axes + dense gridlines | Muted thin axes, restrained/absent gridlines, soft-min/max scale **[S]** |
| 15 | Dark mode = inverted light hues | Re-tuned dark palette, non-black canvas, lighter/desaturated status colors **[S]** |

---

## 4. Concrete actions for OUR panel (prioritized)

1. **Collapse the card stack (highest impact). [S]** Remove the 1px-border+radius card from *every* section. Replace with whitespace + a single low-contrast hairline divider (`#EBEBEB`, 1px, horizontal). **Promote only the summary board** to one subtle card (6px radius, `box-shadow:0 0 0 1px rgba(0,0,0,.08)`), and remove the white chart card nested inside the cross-section section. Kills the "boxes-in-boxes" + restores the board's visual primacy (your A3/A4/E2).
2. **Cut color to status-only + fix the category vocabulary. [S/I]** Achromatic normal state; tint (~10%) + 2–3px left rule only on breaches. Split the aviation category palette from the generic severity ramp: **VFR green / MVFR blue / IFR red / LIFR magenta** as dedicated classes (your B1/B2). Neutralize the blue nav accent to weight/underline (your D1/D3).
3. **Tabular numerals + alignment across all three tables. [S]** `font-variant-numeric: tabular-nums`; right-align numeric columns, left-align labels; `table-layout: fixed` for shared column widths; horizontal hairlines only, no vertical gridlines (your C1/C2/C3).
4. **Lock a type scale and drive hierarchy by weight. [S]** micro-label 11px regular muted + 0.05em tracking / body 13 / value 13–14 **semibold** / section 16–18 semibold / panel 20–22. Make planned-altitude the emphasized value vs the status sentence as body (your A1/A2/C4).
5. **Suggested neutral gray ramp (tokenize). [I]** `#FFFFFF / #FAFAFA / #EBEBEB / #E0E0E0 / #9CA3AF / #6B7280 / #374151 / #111827`. Replace hardcoded `#666/#888/#c0392b` with tokens; verify `#888` body hits AA 4.5:1 (your C4/F1).
6. **Refine chips/badges. [S]** Board airport chips get a **category dot + tint bg + same-hue text + 1px surface stroke**; worst-hazard chip can use fill for emphasis. Tight padding (2×8), 4px radius (your E1, B4).
7. **Cross-section chart polish. [S/I]** Muted thin axes + restrained gridlines + soft-min/max altitude scale; resolve the green-means-two-things collision (recolor cloud OR turbulence); inline muted legend with aligned swatches. Respect the locked ribbon margins (F2) — color/weight only.
8. **Dark-mode verification when tokenizing. [S]** Non-black canvas, re-tuned status hues, white low-alpha dividers; confirm MVFR-blue vs IFR-red separation and AA contrast in both themes (F1).

> Sequence: 1 → 2 → 3/4 deliver the biggest "amateur → premium" jump (kill nested cards, kill decorative color, fix numerals + hierarchy). 5–8 are refinement.

---

## Sources
- https://mantlr.com/blog/stripe-linear-vercel-premium-ui
- https://designmd.cc/benchmarks/vercel
- https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1
- https://developer.apple.com/news/?id=970ncww4 (Flighty)
- https://developer.apple.com/news/?id=kf623ldf (Carrot Weather)
- https://www.datadoghq.com/blog/introducing-datadog-darkmode/
- https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/bar-chart/
- https://smart-interface-design-patterns.com/articles/badges-chips-tags-pills/
- https://mobbin.com/glossary/badge
- https://alistapart.com/article/web-typography-tables/
- https://www.datawrapper.de/blog/fonts-for-data-visualization
- https://medium.com/design-with-figma/the-ultimate-guide-to-designing-data-tables-7db29713a85a
