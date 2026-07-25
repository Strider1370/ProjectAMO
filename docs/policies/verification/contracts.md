# Browser verification contracts

Run a focused contract with `npm run dev:contract -- --grep <id>`. The command checks ports, then Playwright owns the fixed-data backend and frontend lifecycle. `dev:test` only stops automatic collection; it does not provide route or weather fixtures.

## Active

| Contract | Features / owners | Viewports | Preconditions | Spec | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `responsive-baseline` | app shell; `App.jsx`, layout, `MapView.jsx` | desktop, iPad landscape, mobile | local app only; no route/weather fixture | `frontend/verification/contracts/responsive-baseline.spec.mjs` | frontend | active — passed 2026-07-19 |
| `map-base` | `MapView.jsx`, basemap switcher, weather overlays | desktop, iPad landscape, mobile | local map style/assets; no route/weather fixture | `frontend/verification/contracts/map-base.spec.mjs` | frontend | active — passed 2026-07-19 |
| `monitoring` | `MonitoringPage.jsx` | desktop, iPad landscape | local monitoring data; mobile uses a different task UI | `frontend/verification/contracts/monitoring.spec.mjs` | frontend | active — passed 2026-07-19 |
| `airport-panel` | `AirportPanel.jsx` | desktop, iPad landscape, mobile | RKSI must be in the local airport list; no live weather assertion | `frontend/verification/contracts/airport-panel.spec.mjs` | frontend | active — passed 2026-07-19 |
| `notam-and-settings` | `NotamPanel.jsx`, `SettingsModal.jsx` | desktop, iPad landscape, mobile | local app state only; mobile has settings but no NOTAM entry | `frontend/verification/contracts/notam-and-settings.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-import` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed `rksi-rkpk-multi.gpx` fixture; local airport/navdata | `frontend/verification/contracts/route-import.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-workflow` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed navdata; `route-fixture.mjs` intercepts exposure, altitude, profile, cross-section, briefing APIs | `frontend/verification/contracts/route-workflow.spec.mjs` | frontend | active — passed 2026-07-19 |
| `echo-top` | `echoTopLayers.js`, `useEchoTopOverlay.js`, `EchoTopCard.jsx`, `WeatherLegends.jsx` | desktop, iPad landscape, mobile | fixture intercepts `echotop_meta.json`, the overlay WebP and `/api/radar/echo-top-point`; radar `echo_meta.json` supplies the 5-minute axis | `frontend/verification/contracts/echo-top.spec.mjs` | frontend | active — passed 2026-07-26 (21/21) |
| `radar-motion` | `radarMotionLayers.js`, `useRadarMotionOverlay.js`, `WeatherLegends.jsx` 토글 | desktop, iPad landscape, mobile | fixture intercepts `echo_meta.json` and `motion_korea_*.geojson` | `frontend/verification/contracts/radar-motion.spec.mjs` | frontend | active — passed 2026-07-26 (18/18) |
| `briefing-view` | `BriefingView.jsx`, `MapView.jsx` | desktop, iPad landscape | committed navdata; `route-fixture.mjs`; mobile has no full/map-together control | `frontend/verification/contracts/briefing-view.spec.mjs` | frontend | active — passed 2026-07-19 |

## Registered next

| Contract | Preconditions | Status |
| --- | --- | --- |

## Phase A coverage and legacy mapping

| Existing asset | Meaning retained | Phase A disposition / replacement |
| --- | --- | --- |
| `responsive-smoke.mjs` | main shell has no horizontal overflow at six legacy viewports | retained until `responsive-baseline` passes; partially replaced by three contractual viewports |
| `responsive-screenshots.mjs` | 18-image main/monitoring baseline evidence | retained; screenshot baseline is not yet fully absorbed |
| `airport-panel-capture.mjs` | RKSI airport tabs | partially replaced by `airport-panel`; retained for visual/tab-content evidence |
| `map-chrome-capture.mjs` | MET panel and overlay toggles | partially replaced by `map-base`; retained for visual evidence |
| `monitoring-capture.mjs` | ops and ground monitoring routes | partially replaced by `monitoring`; retained for visual evidence |
| `briefing-capture.mjs` | RKSS→RKPC IFR search and briefing creation | partially replaced by `route-workflow` and `briefing-view`; retained for RKPC visual evidence |
| `briefing-smoke.mjs` | IFR flow, alternate, map and briefing sections | partially replaced; retained because alternate/map-section scope is not yet contractual |
| `briefing-redesign-capture.mjs` | desktop briefing result | partially replaced by `briefing-view`; retained for visual evidence |
| `notam-tab-capture.mjs` | briefing NOTAM tab | planned: `notam-and-settings` or `briefing-view` |
| settings / NOTAM controls | NOTAM map visibility and saved time zone | partially replaced by `notam-and-settings`; briefing-specific NOTAM remains planned |
| `vprofile-scroll-capture.mjs` | vertical profile modal and scroll behavior | partially replaced by `route-workflow`; retained for scroll visual evidence |
| `vfr-fix-search-capture.mjs` | VFR fix search | partially replaced by `route-workflow`; retained for fix-search coverage |
| `vfr-layout-capture.mjs` | VFR waypoint layout/editing | partially replaced by `route-workflow`; retained for layout/edit coverage |
| `route-save-load-capture.mjs` | VFR save/load and local storage | retained: save/load is outside current contract scope |
| `route-import-capture.mjs` | synthetic GeoJSON/GPX import | partially replaced by `route-import`; retained for GeoJSON visual evidence |
| `route-import-real-files-capture.mjs` | real GeoJSON/GPX/KML import | partially replaced by `route-import`; retained for real-file format coverage |
| `moon-section-capture.mjs` | airport moon tab, desktop/mobile overflow | planned: `airport-panel` |
| `fir-tick-zoom-capture.mjs` | FIR ticks at map zooms | retained: manual visual evidence remains outside the semantic contract |
| `overseas-airway-clip-capture.mjs` | overseas airway clipping | retained: manual visual evidence remains outside the semantic contract |
| `mobile-audit.mjs` | mobile map, panels, airport, monitoring | held: split across `map-base`, `airport-panel`, `route-workflow`, `monitoring` |
| `mobile-audit-capture.mjs` | mobile captures and axe audit | held: split across the same contracts; live route data is not a fixture |
| `lint-colors.mjs` | static color lint | not browser-capable; retained outside this migration |

No legacy script is deleted in Phase A. The current baseline contract replaces only its pass/fail responsive-overflow assertion; it does not replace the legacy screenshot matrix.
