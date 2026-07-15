# Mobile Sheet Redesign — Implementation Plan

> **For agentic workers:** implement task-by-task. Steps use checkbox (`- [ ]`) syntax. After each task: `npm.cmd run build --prefix frontend`, `npm.cmd run test:layout --prefix frontend`, and a mobile capture pass (`frontend/scripts/mobile-audit.mjs`, viewport 390×844) with the temp `window.__amoMap`/`__amoSelectAirport` hooks in `MapView.jsx` reverted afterward.

**Spec:** `docs/superpowers/specs/2026-06-25-mobile-layer-sheet-redesign.md`
**Goal:** Rebuild the mobile (≤719px) layer panels and route-briefing panel on one shared expandable bottom-sheet; modernize their content. Desktop unchanged.
**Stack:** React, Mapbox GL JS, plain CSS (app design language — reuse `.layer-drawer` glass chrome, accent `#2563eb`, system-ui, existing badge/switch styles). Mockups were concept-only.

---

## Parallelization assessment

Most steps share `MapView.jsx`, `WeatherOverlayPanel.jsx`, and `MapView.css`, so broad parallel writes would conflict. Only two clearly file-disjoint tracks are safe to run in parallel; everything else stays sequential, and the **main agent owns integration files** (`MapView.jsx`, `App.jsx`).

- **Parallel-safe Track S (new, isolated files):** Task 3 `MobileSheet` component (`frontend/src/shared/ui/MobileSheet.jsx` + `.css`) — all-new files, no overlap. Can be built any time.
- **Parallel-safe Track B (route-briefing files only):** Task 8 form logic in `RouteBriefingPanel.jsx`, `useRouteBriefing.js`, `RouteBriefing.css` — disjoint from layer files. (Its only shared touch is the 지도-보기 removal in `MapView.jsx`, which the main agent applies in Task 7.)
- **Sequential (shared files):** Tasks 1, 2, 4, 5 all touch `WeatherOverlayPanel.jsx` and/or `MapView.jsx`/`App.jsx` — keep serial, capture-verify between each.

**Recommendation:** run Track S and Track B in parallel subagents if desired (read-isolated, write-disjoint), but keep the layer-content tasks (1,2,4,5) sequential under the main agent. If conflict risk feels high or the team prefers simplicity, do everything sequentially — the per-task workload is modest UI edits, not a large pipeline.

---

## File map

**New:**
- `frontend/src/shared/ui/MobileSheet.jsx` (+ `MobileSheet.css`) — shared grabber/detent sheet
- `frontend/src/features/aviation-layers/lib/aviationLayerTiles.js` — tile symbol/color metadata (or inline)

**Modify:**
- `frontend/src/app/App.jsx` — pass per-panel active counts to `MobileMapOverlay`
- `frontend/src/app/layout/MobileMapOverlay.jsx` (+ `App.css`) — count badges on 항공/기상 buttons
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` — 깜빡임 toggle in lightning legend
- `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` — tile grid, remove blink row + wind/opacity sub-controls on mobile, 전체 끄기
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` — tile grid, 전체 끄기
- `frontend/src/features/map/MapView.jsx` — wire MobileSheet, blink props, clear-all handlers, remove 지도-보기 button on mobile
- `frontend/src/features/map/MapView.css` — sheet/tile styles (app language)
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — airport list picker, remove 직접 입력, restyle
- `frontend/src/features/route-briefing/useRouteBriefing.js` — handlers no longer take free-text airport
- `frontend/src/features/route-briefing/RouteBriefing.css` — picker/sheet styles

---

## Task 0 — Color unification ✅ DONE
- [x] `aviationWfsLayers.js`: 제한/위험 → `#dc2626`, CTR → `#2563eb` + `lineDasharray: [2,1.5]`
- [x] `addAviationWfsLayers.js`: optional `line-dasharray` paint support
- [x] build ✓

---

## Task 1 — Active-count badges (항공/기상 buttons) ✅ DONE
**Files:** Modify `App.jsx`, `MobileMapOverlay.jsx`, `App.css`, `MapView.jsx`
- [x] Counts computed in `MapView` (mirror panel "N개 켜짐" logic: aviation = visible `AVIATION_WFS_LAYERS`; met = visible non-disabled `MET_LAYERS`), surfaced via `onLayerCountsChange` → `App` state → `MobileMapOverlay` props.
- [x] Blue count pill (`.mobile-map-layer-count`) on each button when count > 0; inverts to white-on-blue when the button is active.
- [x] Verify: preview at 375px shows 항공=2 (fir+airport defaults), 기상 badge appears/updates to match panel "N개 켜짐" when toggled; build + test:layout pass.

## Task 2 — 낙뢰 깜빡임 → lightning legend ✅ DONE
**Files:** Modify `WeatherLegends.jsx`, `WeatherOverlayPanel.jsx`, `MapView.jsx`, `MapView.css`
- [x] `blinkLightning` + `onBlinkLightningChange` passed into `WeatherLegends`; compact `.lightning-legend-blink` chip rendered inside `.lightning-time-legend`, **mobile-only** (uses `useIsMobile`), shown with the legend (which is itself gated on `lightningLegendVisible`).
- [x] 낙뢰 깜빡임 row hidden in `WeatherOverlayPanel` **on mobile only** (`!isMobile` guard) — desktop keeps it in the panel to honor "desktop unchanged".
- [x] Verify: mobile (375px) lightning on → no 깜빡임 row in panel; desktop (1038px) lightning on → row still present. build + test:layout pass. (Legend chip itself needs live lightning data to render — verified by code/build.)

## Task 3 — Shared `MobileSheet` (Track S, parallel-safe) ✅ DONE
**Files:** New `MobileSheet.jsx` + `MobileSheet.css`
- [x] Non-modal bottom sheet: props `{ open, eyebrow, title, onClose, headerExtra, children, detent, onDetentChange }`. Grabber handle; pointer-drag between peek/half/full with snap; tap-grabber cycles. Body `flex:1; overflow-y:auto`. Anchored `bottom:0` within map wrapper. Visible ×.
- [x] App design language: glass surface, accent `#2563eb`, rounded top, system-ui.
- [x] Degrades to fixed half-height when `PointerEvent` unavailable (no drag handlers).
- [x] Verified live via Task 4 adoption (sheet renders, × closes, grabber present).

## Task 4 — Layer tile grids inside `MobileSheet` ✅ DONE
**Files:** Modify `WeatherOverlayPanel.jsx`, `AviationLayerPanel.jsx`, `MapView.jsx`, `App.jsx`, `MapView.css`; new `lib/aviationLayerTiles.js`
- [x] 3-col tile grid (tap = toggle; active = blue border + check), grouped by existing sections. Rendered inside `MobileSheet` on mobile via `useIsMobile`; desktop panels unchanged. `onClose` wired App→MapView→panel (`setActivePanel(null)`).
- [x] Weather tiles: lucide icon per layer (`WEATHER_TILE_ICON`); wind/temp/etc are plain toggles — wind Flow/Speed/sliders + opacity dropped on mobile (verified `windSubControlsPresent: false`).
- [x] Aviation tiles via `aviationLayerTiles.js` (colors imported from `aviationWfsLayers.js`): 공역 = boundary-color square (CTR dashed), 항행시설 = repo SVGs, 항공로 = line sample (ATS solid #1f2933 / RNAV dashed #0076c8). Verified computed colors/styles match the live map.
- [x] Verify: aviation sheet 12 tiles/3 groups, met sheet 13 tiles/3 groups, icons + symbols load, active/disabled/badge states correct; build + test:layout pass. (Headless screenshot times out on the map canvas — verified via DOM/computed-style.)

## Task 5 — 전체 끄기 per panel ✅ DONE
**Files:** Modify `AviationLayerPanel.jsx`, `WeatherOverlayPanel.jsx`, `MapView.jsx`, `MapView.css`
- [x] `전체 끄기` button in the mobile sheet header (`headerExtra`), disabled when activeCount === 0. Mobile-only (desktop unchanged). `clearAviationLayers`/`clearMetLayers` in MapView set all that panel's layer ids false (met preserves wind Flow/Speed sub-defaults). No confirm.
- [x] Verify: 2→4 active, 전체 끄기 → 0개 켜짐, 0 active tiles, button disables, 항공 overlay badge hides; build + test:layout pass.

## Task 6 — Adopt grabber/detents for layer sheets ✅ DONE
**Files:** Modify `MapView.css` (panel wrapping done in Task 4)
- [x] Aviation/met panels render inside `MobileSheet` (grabber + peek/half/full) — done in Task 4. Removed the interim fixed-height `.layer-drawer`/`.dev-layer-panel` mobile bottom-sheet CSS (now dead — those containers only render on desktop).
- [x] Verify: sheet flush to task bar (gap: 0), grabber present, half-detent height ≈ 0.55·vh; build + test:layout pass.

## Task 7 — Briefing into `MobileSheet` + remove 지도 보기 (mobile) ✅ DONE
**Files:** Modify `MapView.jsx`, `RouteBriefingPanel.jsx`, `App.jsx`, `MapView.css`, `layoutTokens.test.js`
- [x] On mobile, `RouteBriefingPanel` extracts its form+results into `briefingBody` and renders inside `MobileSheet` (eyebrow/title/flightRule status; peek detent reveals the map). Desktop keeps the `.route-check-panel` + floating toggle unchanged.
- [x] Floating `route-briefing-map-mode-toggle` rendered only when `!isMobile` (MapView). Removed the now-dead mobile `data-route-briefing-map-mode` / toggle CSS. Briefing × → `onClosePanel` resets `activePanel` and `mobileTask` to 지도.
- [x] Updated the obsolete layout test (mobile map-mode rule → desktop-only `!isMobile` toggle assertion). Verify: mobile briefing in sheet, no floating toggle, × returns to 지도; desktop renders panel + toggle. build + test:layout (10/10) pass.

## Task 8 — Briefing airport list picker + remove 직접 입력 ✅ DONE
**Files:** Modify `RouteBriefingPanel.jsx`, `RouteBriefing.css` (`useRouteBriefing.js` unchanged — handlers already only accept ICAO/FIR sentinels)
- [x] `renderAirportField` helper: mobile = touch chip picker of the 8 `KNOWN_AIRPORTS` with Korean names (`AIRPORT_KO`: 인천/김포/제주/김해/무안/양양/여수/울산) + `FIR 진입`/`FIR 이탈` below a divider; desktop = cleaned `<select>` (placeholder + airports + FIR). **`__direct__` option and `proc-direct-input` text inputs removed.**
- [x] Free-text gone: handlers receive only ICAO/FIR sentinels (already the case); empty state = no chip/placeholder selected. `isFirInMode`/`isFirExitMode` verified (FIR 진입 → 진입 FIX select swaps in).
- [x] 2nd field (SID/STAR/FIX) + RWY kept; 경로유형 ALL/RNAV/ATS = compact segmented control on mobile (select on desktop). VFR procedure-field hiding unchanged.
- [x] Verify: mobile chips (8+FIR, Korean names), chip select drives state, FIR mode swaps 2nd field, segmented works, no 직접입력; desktop select cleaned (placeholder/airports/FIR 진입, no 직접). build + test:layout (10/10) pass.

---

## Post-implementation fixes (Playwright visual review at 390×844)
Found by actually screenshotting the sheets (DOM checks had passed but missed visuals):
- **Briefing chips/segmented all rendered solid-blue** (looked all-active): the generic `.route-check-form button` rule (blue, 36px) out-specifies `.airport-chip`/`.route-type-seg`. Fixed by scoping those rules under `.route-check-form` and resetting `height`. (`RouteBriefing.css`)
- **Floating 항공/기상 buttons + status strip overlapped the expanded layer sheet** (overlay z-index 60 > sheet 8). Fixed by hiding `MobileMapOverlay` while a layer sheet is open (`activePanel` aviation/met). (`App.jsx`)
- **Red "0" badges on lightning/SIGMET/AIRMET/SIGWX tiles** looked like errors. Now shown only when `badge > 0`. (`WeatherOverlayPanel.jsx`)

## Sequencing
1 → 2 → 3 (∥ ok) → 4 → 5 → 6 → 7 → 8 (∥ with 3/earlier). Capture-verify after each. Main agent owns `MapView.jsx`/`App.jsx` edits to serialize integration.

## Risks
- `WeatherOverlayPanel.jsx` + `MapView.jsx` touched by several tasks → sequential to avoid conflicts.
- Removing 직접 입력 (Task 8) may surface assumptions in route logic about empty/free-text departure — audit `useRouteBriefing.js`.
- Real `Symbols/*.svg` are recolored brand-purple; recolor/tint per layer or accept the symbol's own color in tiles.
- Map tiles render unreliably in the capture env — color/map-dependent visuals verified by build + on real device, not the headless capture.
