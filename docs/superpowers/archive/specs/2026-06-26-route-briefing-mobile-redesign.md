# Route Briefing — Mobile Redesign Spec (approved layout)

- **Date:** 2026-06-26
- **Status:** IMPLEMENTED (2026-06-26). Layout approved over interactive mockups; built per the plan and verified with Playwright (IFR/VFR/peek + desktop regression). See `docs/superpowers/archive/plans/2026-06-26-route-briefing-mobile-redesign-plan.md`.
- **Scope:** Mobile (≤719px) **route-briefing** form only. Builds on the existing shared `MobileSheet`. **Desktop unchanged** (keeps `.route-check-panel` + floating 지도 보기 toggle).
- **Why:** The first pass put airport chips above raw native `<select>` fields — the controls felt disjointed and the form wasn't structured as a from→to route. Research (EFB apps + consumer from→to apps + Material/HIG/NN-g) converged on the design below.

## Core principle — two control idioms only
The disjointed feel came from mixing chips + segmented + native `<select>`. Collapse to **two** idioms, both in the app's visual language:
1. **Segmented control** — mutually-exclusive 2–5 options (IFR/VFR, 경로유형). Solid blue active.
2. **Tap-field → inline picker** — airports + dependent procedure/runway fields. **Native `<select>` removed.**

## Layout (mobile)

### 1. Header (existing `MobileSheet`)
Eyebrow `Flight Plan` / title `경로 확인`, flight-rule status pill in `headerExtra`, ×. Grabber + peek/half/full detents (unchanged).

### 2. Mode controls (segmented)
- `IFR | VFR` segmented (replaces the current radio styling).
- IFR only: `전체 | RNAV | ATS` 경로유형 segmented (already done).

### 3. Departure → Arrival (from→to + swap) — the key change
- **출발** and **도착** as two stacked **tap-rows** showing the current selection (`인천 RKSI`) or placeholder (`선택`).
- A **swap (⇅)** control between the two rows → swaps departure/arrival.
- Tapping a row **expands an inline picker in place**: the 8 `KNOWN_AIRPORTS` as a 4-col chip grid (한글명 + ICAO) + a divider + `FIR 진입`/`FIR 이탈` full-width chip. Selecting collapses the row back. (No second sheet, no native select — NN-g: never stack sheets.)
- Arrival picker visually de-prioritizes the airport already chosen as departure.

### 4. Dependent fields (SID/STAR/FIX, RWY) — progressive disclosure
- Rendered as the **same tap-field → picker idiom** (not native `<select>`).
- **Appear only after** the relevant airport is chosen; shown directly under that airport block.
- On airport change: **reset** the dependent value; **auto-select** if exactly one option; **empty/disabled state** with inline note ("해당 공항 절차 없음") if zero.
- FIR 진입/이탈 keeps swapping the 2nd field to the boundary-FIX list (existing `isFirInMode`/`isFirExitMode`).

### 5. VFR — different composition
- VFR hides 경로유형 and **all procedure/RWY fields** (already the case).
- Form = `IFR|VFR` segmented (VFR) + from→to airports + 검색.
- After search: **VFR WP 계획고도** list — departure/arrival as fixed pills, intermediate WPs as **editable altitude pills**; `순항고도 전체 적용`; `순항고도(ft)` field; `연직단면도 생성`. (Existing logic, laid out for the sheet body.)

### 6. Actions
- `검색` = full-width primary button, **pinned at the bottom** of the sheet (sticky), solid blue.
- `자동검색` (prominent secondary — most-used EFB feature) + `초기화` (demoted) below it.

### 7. Peek summary bar (collapsed detent)
When the grabber is dragged all the way down, the briefing task stays active and the sheet collapses to a **centered** one-line summary so the map is revealed:
- **Center-aligned:** `RKSI → RKSS  ·  IFR  ·  52 NM` (distance only after a search; before search: `RKSI → RKSS · IFR`; if an airport is empty: `출발 선택` placeholder).
- Grabber on top; chevron-up affordance; tap or drag up re-expands the form.
- This is a new **peek-content slot** on `MobileSheet` (today peek shows the header).

## App visual language — token map (use these, not the mockup palette)
Reuse exactly what the layer sheets/tiles already use:

| Element | Tokens |
|---|---|
| Sheet surface | `rgba(255,255,255,0.96)`, `backdrop-filter: blur(10px)`, border `rgba(148,163,184,0.42)`, top radius `16px` (existing `MobileSheet`) |
| Segmented — active | solid `#2563eb`, text `#ffffff` |
| Segmented — inactive | bg `#ffffff`, text `#475569`, border `rgba(148,163,184,0.4)` |
| Chip / tap-field — active | bg `#eff6ff`, border `#2563eb`, text `#1d4ed8` (same as `.layer-tile.is-active`) |
| Chip / tap-field — inactive | bg `#ffffff`, border `rgba(148,163,184,0.4)`, text `#334155` |
| Field label | `#64748b`, 11px, weight 800 |
| Field value | `#0f172a`, 14px, weight 700; chevron `#94a3b8` |
| Status / IFR badge | `.layer-drawer-status` — bg `#eff6ff`, text `#1d4ed8`, border `rgba(37,99,235,0.18)`, pill |
| Primary CTA (검색) | solid `#2563eb`, text `#fff`, 46px, radius `7–8px` (existing `.route-check-form button`) |
| Editable altitude pill (VFR) | active-chip tokens; fixed WP pill = `#f1f5f9`/`#94a3b8` |
| Divider | `0.5px` `rgba(226,232,240,0.95)` |
| Font | `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` |
| Touch target | rows/chips ≥ 44–46px (HIG 44 / Material 48) |

## Out of scope / unchanged
- Desktop briefing (`.route-check-panel`, floating 지도 보기, native selects on desktop) stays as-is.
- Route search / VFR waypoint / vertical-profile **logic** unchanged — only presentation.

## Risks / open questions
- Peek-content slot is a `MobileSheet` API addition (peek shows summary instead of full header) — keep it generic so layer sheets can opt in later.
- Custom dependent-field picker is a new component; ensure the 0/1/N option edge cases are handled (reset, auto-select, empty note).
- Inline chip expansion inside a draggable sheet: make sure expanding doesn't fight the drag (expand on tap, drag only from grabber).

## Sources
EFB route entry (ForeFlight/Garmin/SkyDemon/FlyQ/AvPlan), consumer from→to (Google Maps/Flights, Uber, Trainline, Citymapper), and Material 3 / Apple HIG / NN-g / GOV.UK / Baymard control-selection + bottom-sheet guidance. Summarized from the 2026-06-26 parallel research pass.
