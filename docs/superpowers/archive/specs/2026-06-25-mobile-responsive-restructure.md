# Mobile Responsive Restructure — Proposal (Proposal-First, needs approval)

- **Date:** 2026-06-25
- **Status:** PROPOSAL — not implemented. Requires explicit approval per `docs/ui-responsive-guidelines.md` → Proposal-First Rule.
- **Basis:** mobile audit `artifacts/responsive-screenshots/mobile-audit/2026-06-25_1145_mobile/` (+ afterfix pass) and its `review/issues.md` (items S1–S7).
- **Standard:** `docs/ui-responsive-guidelines.md` → Canonical Mobile Philosophy (8 principles).
- **Scope of this doc:** structural direction + phasing for the main app's mobile model. Mechanical bugs (M1, M3) are already fixed separately. No code changes here.

## Problem (one line)

The **monitoring page already embodies the target mobile model** (top task tabs, one task per screen, status-first, map-as-task). The **main app does not** — on mobile it is the desktop shell (left icon rail + floating panels/modals/drawer over a live map) shrunk to 390px. Two different mobile architectures in one product.

This proposal converges the main app onto monitoring's proven model. The two highest-value moves are **S1 (main-app task model)** and **S2 (airport step flow)**; S3–S7 mostly fall out of them.

---

## S1 — Main app adopts a mobile task model (HIGH)

### Today
- Left vertical icon rail (`Sidebar`) is the only navigation; expanding it (02) fills the viewport with wayfinding and zero status.
- 항공정보 / 기상정보 open ~75%-width floating layer panels over the live map (03, 04).
- 비행 전 브리핑 opens a cramped floating form over the map (05).
- 설정 / 업데이트 open desktop dialogs centered over the map (06–08).
- The map (01) is the default but shows no operational status until the user digs.

### Proposed (mobile ≤719px only; desktop unchanged)
A bottom (or top) **task bar** mirroring monitoring's `.phone-task-tabs`, with the map framed as a deliberate task rather than permanent backdrop. Proposed tasks:

| Task | Default content | Replaces |
|------|-----------------|----------|
| **지도** (default) | Full-screen map. Layer controls (aviation + MET) become **bottom sheets** that leave the map visible above them, not full-cover panels. | floating layer panels (03, 04) |
| **브리핑** | Full-screen route-briefing form/result (no map underneath competing for attention; map-preview is a sub-mode via the existing `route-briefing-map-mode-toggle`). | floating route panel (05) |
| **더보기** | Settings, updates, help, NOTAM, 상황판 link as a simple list → each opens its own full-screen task view. | icon-rail bottom items + modals |

- **Airport detail is NOT a tab.** It is a full-screen view pushed on top when a map airport is tapped (see S2), with a back affordance returning to 지도.
- The collapsed 56px icon rail is hidden on mobile in favor of the task bar; the expanded-sidebar overlay (02) is retired on mobile.
- **Status-first (principle 2):** the 지도 task should surface a compact current-status strip (selected/nearest airport flight category + any active warning) so the app answers "is anything limited now?" without a tap. Exact form TBD in design review.

### Affected (anticipated)
- `frontend/src/app/App.jsx` (mobile task state + composition branch), new mobile task-bar component under `frontend/src/app/layout/`.
- `frontend/src/app/layout/Sidebar.*` (hide on mobile / repurpose).
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx`, `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` (panel → bottom-sheet on mobile).
- `frontend/src/features/map/MapView.css`, `layoutTokens.css` (task-bar tokens; reuse monitoring patterns where possible).
- Reuse monitoring's existing phone-task-tab styling/behavior as the shared backbone (principle 3) — do not fork a second pattern.

### Benefits
- One consistent mobile model across app + monitoring.
- Map becomes a usable task; toggling a layer no longer hides the map it configures.
- Status reachable without digging; wayfinding stops outranking operational state.

### Risks / open questions
- Largest change; touches app shell composition. Phase behind a width guard so desktop is untouched.
- Exact task set (3 vs 4 tabs; whether 항공/NOTAM deserve their own task) needs a design-review decision.
- Bottom-sheet vs top-sheet for layer controls — pick one, consistent with monitoring.

---

## S2 — Airport detail becomes a full-screen step flow (HIGH)

The guideline names this as the **primary approved direction**; explicitly **not** bottom tabs/segmented controls.

### Today
Side drawer (already 100vw at ≤719px) with a **horizontal tab rail** (현재날씨 / METAR / TAF / AMOS / 공항경보 / 기상정보). The rail clipping bug is fixed (M1), but the model is still "shrunk desktop drawer", and warnings sit several tabs deep.

### Proposed (mobile ≤719px)
Replace the tab rail with a focused **step sequence**, full-screen:

1. **Summary** (entry): airport identity (name · ICAO), large flight-category banner, **active warnings shown here regardless of step**, compact METAR snapshot (시정/운고/바람), next-6h TAF headline.
2. **METAR**
3. **TAF**
4. **Warnings** (full detail)
5. **Supporting info** (AMOS, airport info) — AMOS/info only for full-feature airports.

- Navigation: top app-bar with back + airport title + step indicator; advance via next/prev or vertical scroll with section anchors. Final pattern chosen in design review, but **warnings never hide behind an off-screen tab** (principle 5).
- Dense content (TAF periods, AMOS) uses vertically-stacked per-item reading blocks, not shrunk grids (principle 6, ties to S6).
- Reuse existing tab components (`CurrentWeatherTab`, `MetarTab`, `TafTab`, …) as the step bodies; the change is the navigation shell, not the data rendering.

### Affected (anticipated)
- `frontend/src/features/airport-panel/AirportPanel.jsx` (mobile step-flow shell vs desktop tabs), `AirportPanel.css`.
- Existing `tabs/*` reused as step content.

### Benefits
- Focused reading task; warnings get summary-level prominence (priority 2).
- Removes the desktop-drawer-on-mobile compromise entirely.

### Risks / open questions
- Step navigation affordance (swipe vs buttons vs anchored scroll) — design-review decision.
- Keep desktop drawer + tabs unchanged; branch on width.

---

## S3–S7 — Derived / smaller (MED–LOW)

- **S3 status-first default** — delivered by S1's status strip on the 지도 task.
- **S4 retire expanded sidebar on mobile** — delivered by S1's task bar.
- **S5 panels/forms/modals over live map** — delivered by S1 (bottom sheets; full-screen briefing/settings tasks).
- **S6 dense content restructure (TAF grid 11, info text 14)** — stack TAF periods into per-period reading blocks; lead the info/discussion text (14) and changelog with a one-line takeaway/severity (principle 7). Can ship independently of S1/S2.
- **S7 decoration subordinate** — keep mascot/illustration small and never adjacent-at-equal-weight to flight category/warnings (principle 8). Polish, ship anytime.

---

## Recommended phasing (each phase = its own approval + after-capture)

1. **Phase 0 (no approval needed, ship now):** S6 partial — TAF stacked blocks + takeaway-first info/changelog; S7 decoration polish. Low risk, high readability gain, no architecture change.
2. **Phase 1:** S2 airport step flow (self-contained, reuses tab bodies).
3. **Phase 2:** S1 main-app task model (largest; bottom sheets + task bar + status strip), absorbing S3/S4/S5.

After each phase: re-run `frontend/scripts/mobile-audit.mjs` into a new timestamped folder and record before/after evidence per Architecture.md.

## Decision needed
- Approve the task set for S1 (proposed: 지도 / 브리핑 / 더보기 + pushed airport view)?
- Approve S2 step sequence (summary → METAR → TAF → warnings → info)?
- Approve phasing, or reprioritize?
