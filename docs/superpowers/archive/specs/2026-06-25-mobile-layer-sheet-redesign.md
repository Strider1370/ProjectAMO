# Mobile Sheet Redesign — Spec (approved)

- **Date:** 2026-06-25
- **Status:** APPROVED for implementation (design decided with the user over mockups + code review).
- **Scope:** Mobile (≤719px) **layer panels** (aviation + weather) and the **route-briefing panel**, both rebuilt on one shared expandable bottom-sheet. Desktop layout unchanged unless noted.
- **Basis:** research on consumer/aviation map apps + Material/HIG/NN-g sheet guidance; real ICAO chart colors/symbols; actual route-briefing code (`RouteBriefingPanel.jsx`, `routeBriefingModel.js`).

## Goals
Replace the cramped flat toggle-list bottom sheet with an intuitive, space-efficient, legend-like control.

## Design

### Container — expandable bottom sheet
- Default = half-height sheet over the map (map stays visible/interactive), flush to the bottom task bar (no gap — already fixed via `bottom: 0` within `.map-view-wrapper`).
- A **grabber handle** at the top; drag up → near-full-screen (task bar stays), drag down → half → dismiss. Tap-to-expand fallback for discoverability.
- Detents: peek (header only) / half (~default) / full. Body scrolls internally.
- Visible **close (×)** in the header (handle alone is insufficient — NN/g).

### Content — icon/symbol tile grid (3 columns)
- Replaces toggle rows. Tap a tile = toggle. Active = blue border + check; inactive = plain.
- Grouped under section headers (aviation: 공역 / 항행시설 / 항공로; weather: 기상 / 위험기상 / 항적).
- **Tiles mirror the map symbology (legend = control):**
  - Weather: a representative icon per layer (radar, satellite, lightning, wind, …).
  - Aviation 공역 (areas): a **square in the layer's boundary color/line-style**.
  - Aviation 항행시설 (points): the **real ICAO SVGs already in `frontend/public/Symbols/`** — `navaid-vor-dme.svg` (항행안전시설), `airport-civil.svg` (공항), `waypoint-rnav-flyby.svg` (웨이포인트). Fallback to a glyph only if a 20px SVG reads poorly.
  - Aviation 항공로 (lines): a **line sample** (ATS = solid black, RNAV = dashed blue) — not an icon.

### Weather panel specifics
- Groups & tiles: 기상 (레이더, 위성, 낙뢰, Wind, Temp, Moisture, Icing, Turbulence, 비행기상구역) / 위험기상 (SIGMET, AIRMET, SIGWX) / 항적 (ADS-B). One icon tile per layer; tap toggles.
- **Sub-options dropped on mobile:** wind 흐름/속도 + the flow sliders, and per-layer opacity were dev/test-only — hidden on mobile. No ⚙/expand system needed.
- **낙뢰 깜빡임 (must keep):** moved OUT of the sheet onto the map. Attach a compact 깜빡임 toggle to the existing lightning legend (`lightning-time-legend` in `WeatherLegends`), which already shows only when 낙뢰 is on. Display tweak = adjusted while watching the map. Styled to match the legend chip. (So the mobile weather sheet is pure on/off, no sub-controls.)
- The shared bottom time/level bars (`WeatherTimelineBar`, `NwpSliderBar`) stay where they are (over the map), unaffected by this sheet redesign.

### Visual language (important)
The mockups shown in chat used the visualization tool's own design system and are **layout/structure concepts only**. Implement the real CSS in the app's existing visual language — reuse `.layer-drawer` glass chrome, the current blue accent `#2563eb`, system-ui fonts, the existing "N개 활성/켜짐" badge style, and the existing switch styling. Do not copy the mockup CSS.

### Header controls (per panel)
- Active count ("N개 켜짐").
- **전체 끄기** button — turns all layers in that panel off. Enabled only when ≥1 active. No confirm (instantly reversible).

### On-map entry buttons
- The 항공 / 기상 map buttons (`MobileMapOverlay`) get an **active-count badge** (blue pill, e.g. "2") so the active count is visible without opening the sheet.

## Color unification (decision: "관례까지 정리")
Applied to BOTH the live map (`aviationWfsLayers.js`) and the tiles, so the legend stays truthful:
- 제한구역 `#ea580c` → **`#dc2626`** (red)
- 위험구역 `#d97706` → **`#dc2626`** (red)
- 금지구역 `#dc2626` (unchanged) — 제한/위험/금지 now share red; distinguished by label.
- 관제권 CTR `#7c3aed` → **`#2563eb`** (blue) **+ dashed line** (differentiates from solid-blue 관제섹터).
- Unchanged: FIR `#1485d4`, 관제섹터 `#2563eb`, TMA `#0891b2`, 웨이포인트 `#0f766e`, 항행안전시설 `#7c3aed`, 공항 `#be123c`, ATS `#1f2933`, RNAV `#0076c8`.

## Shared expandable sheet framework
A single reusable mobile sheet component used by BOTH the layer panels and the briefing panel (consistency):
- Non-modal bottom sheet anchored flush to the bottom task bar (map stays interactive above).
- **Grabber handle**; drag between detents — peek (header/summary only) / half (default) / full (near-full-screen, task bar stays). Tap-grabber cycles detents (discoverability fallback). Body scrolls internally.
- Visible close (×) in header. Reuses the app's existing `.layer-drawer` glass chrome, blue accent `#2563eb`, system-ui fonts, existing badge/switch styles. (Mockups were concept-only — implement in the app's visual language.)
- Likely a new `frontend/src/shared/ui/MobileSheet.jsx` + CSS, driven by pointer events; degrades to a fixed half sheet if drag is unavailable.

## Route briefing redesign (code-grounded)
Current form (`RouteBriefingPanel.jsx`): IFR/VFR radio; 경로유형 ALL/RNAV/ATS select; 출발/도착 = native `<select>` over `KNOWN_AIRPORTS` (8 domestic: RKSI RKSS RKPC RKPK RKJB RKNY RKJY RKPU) + `FIR IN`/`FIR EXIT` + `직접 입력`; dynamic 2nd field = 진입FIX/SID (dep) and 이탈FIX/STAR (arr) + RWY; actions 검색/자동검색/초기화; results = IFR distance+sequence / VFR waypoint altitudes / vertical profile.

Redesign (mobile):
- Put the panel in the shared sheet; **remove the floating "지도 보기" button** (drag sheet to peek reveals the map). The desktop `route-briefing-map-mode-toggle` stays for desktop.
- **출발/도착 = a touch list picker** of the 8 domestic airports with Korean names (인천/김포/제주/김해/무안/양양/여수/울산), with **FIR 진입 / FIR 이탈** as distinct entries below a divider. **Remove `직접 입력`** (option B) — departure/arrival is always a known airport or FIR. (Update `RouteBriefingPanel.jsx` selects → list picker; drop the `__direct__` option and `proc-direct-input` text inputs; ensure form defaults to a chosen airport / valid empty state, and that `handleDepartureAirportChange`/`handleArrivalAirportChange` no longer receive free text.)
- **FIR IN/EXIT stays first-class:** selecting it swaps the 2nd field to the boundary-FIX list (`firInOptions`/`firExitOptions`) — keep existing `isFirInMode`/`isFirExitMode` logic, restyle only.
- 2nd field (SID/STAR/진입·이탈 FIX) and RWY stay **visible** (core to the route, not "advanced") — restyle the native selects as clean pickers. 경로유형 ALL/RNAV/ATS → demote to a compact segmented/filter.
- IFR/VFR segmented control kept; VFR hides the procedure fields (already the case).
- Results (distance/sequence/VFR altitudes/vertical profile) keep their logic; lay out for the sheet body.

## Implementation plan (each step = build + `test:layout` + mobile capture; temp `window.__amoMap`/`__amoSelectAirport` hooks during capture, reverted after)

Layer sheet:
1. ✅ Color unification (`aviationWfsLayers.js`: restricted/danger→red, CTR→blue dashed; dash support in `addAviationWfsLayers.js`). DONE.
2. Active-count badges on the 항공/기상 buttons (`MobileMapOverlay.jsx` + App count props).
3. 낙뢰 깜빡임 toggle attached to the lightning legend (`WeatherLegends.jsx`); remove the blink row from the mobile weather panel.
4. Shared `MobileSheet` framework (grabber + peek/half/full detents + close).
5. Tile-grid rebuild of `AviationLayerPanel` + `WeatherOverlayPanel` (app-styled): weather = icon tiles; aviation 공역 = boundary-color square (CTR dashed), 항행시설 = repo `Symbols/*.svg`, 항공로 = line sample. Wind/opacity sub-controls dropped on mobile.
6. 전체 끄기 per panel (header), enabled when ≥1 active.

Briefing:
7. Put `RouteBriefingPanel` in the shared sheet; remove the floating 지도 보기 button on mobile.
8. Airport list picker (8 + FIR 진입/이탈), remove 직접 입력; restyle 2nd field + RWY + 경로유형.

## Sources
Aeronautical color/symbol research + route-form/sheet UX research summarized in the session; key refs: FAA Aeronautical Chart Users' Guide, ICAO Annex 4, OpenAIP, antoniolocandro/aeronautical_charting (MIT, likely origin of the repo `Symbols/`); Apple HIG Sheets, Material 3 Bottom sheets, NN/g Bottom Sheets; ForeFlight/Garmin/SkyDemon route entry.
