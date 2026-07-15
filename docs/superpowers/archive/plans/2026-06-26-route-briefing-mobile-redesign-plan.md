# Route Briefing Mobile Redesign — Implementation Plan

> Per task: `npm.cmd run build --prefix frontend` + `npm.cmd run test:layout --prefix frontend` + Playwright capture at 390×844 (briefing IFR, VFR, peek). Desktop must stay byte-stable — branch on `useIsMobile`.

**Spec:** `docs/superpowers/specs/2026-06-26-route-briefing-mobile-redesign.md`
**Goal:** Rebuild the mobile route-briefing form as from→to + swap, unify dependent fields into a tap-picker idiom (drop native `<select>`), add a centered peek summary bar, all in the app's visual tokens. Desktop unchanged.

## File map
**New:**
- `frontend/src/shared/ui/AirportPickerField.jsx` (+ styles or shared CSS) — tap-row that expands an inline chip picker (airports + FIR).
- `frontend/src/shared/ui/PickerField.jsx` — generic tap-field → inline option list for dependent fields (SID/STAR/FIX/RWY), with 0/1/N handling.

**Modify:**
- `frontend/src/shared/ui/MobileSheet.jsx` (+ `.css`) — add optional `peekContent` slot rendered when detent === 'peek'.
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` — from→to layout, swap, adopt the new fields, VFR branch layout, sticky actions, peek summary.
- `frontend/src/features/route-briefing/RouteBriefing.css` — picker/from→to/peek/sticky styles in app tokens; remove the now-dead mobile select overrides.
- (maybe) `frontend/src/features/route-briefing/useRouteBriefing.js` — only if a swap handler / peek-summary selector is cleaner in the hook.

## Tasks — ALL DONE ✅

### Task 1 — `MobileSheet` peek-content slot ✅
- [x] Added optional `peekContent` prop; when `detent === 'peek'` and provided, renders it as a centered, tappable bar (tap → expand to half) instead of the header/body. Generic.

### Task 2 — `AirportPickerField` ✅
- [x] `frontend/src/shared/ui/AirportPickerField.jsx` (+ `.css`): tap-row → inline 4-col chip grid (8 airports) + divider + FIR chip; `disabledValue` de-prioritizes the other side. Self-scoped under `.apf` to beat the generic `.route-check-form button` rule.

### Task 3 — `PickerField` ✅
- [x] `frontend/src/shared/ui/PickerField.jsx` (+ `.css`): tap-field → inline option list, 0/1/N states (disabled + emptyNote when empty). Kept purely presentational (parent owns reset/auto-select via the existing auto-recommend) to avoid fighting route logic.

### Task 4 — IFR from→to + swap + dependent pickers ✅
- [x] Two `AirportPickerField` rows + ⇅ swap (`swapAirports`); dependent `PickerField`s (SID/진입FIX, STAR/이탈FIX, RWY) revealed only after the airport is set. Native `<select>` removed on mobile; desktop path untouched. Verified: 인천→김포 with SID/STAR/RWY auto-filled, unified idiom.

### Task 5 — VFR composition + sticky actions ✅
- [x] VFR hides 경로유형/procedure/RWY (isIfr gates); shared `resultsBlock` renders the VFR WP altitude list. `검색` in a `position: sticky` bottom bar (자동검색 IFR-only, 초기화 demoted). Verified VFR capture.

### Task 6 — Peek summary bar (centered) ✅
- [x] Centered `RKSI → RKSS  IFR  [NN NM]` (distance only post-search; placeholders when empty) via `MobileSheet` `peekContent`. Verified: map revealed with route preview, centered bar, expands on tap.

### Task 7 — Cleanup + final verify ✅
- [x] Removed the dead mobile `.airport-*` / `.route-check-field--airports` CSS (superseded by `.apf`). Desktop regression verified (`.route-check-panel` + 3 native selects + floating toggle intact, no `.apf`/`.mobile-sheet`). Build + test:layout (10/10) green; Playwright captures IFR/VFR/peek/desktop in `artifacts/briefing-check2/`.

## Notes
- Desktop branch (`!isMobile`) keeps current `.route-check-panel`, native selects, floating 지도 보기.
- Reuse exact tokens from the spec's token map — do not introduce new colors.
