# Browser verification contracts

Run a focused contract with `npm run dev:contract -- --grep <id>`. The command checks ports, then Playwright owns the fixed-data backend and frontend lifecycle. `dev:test` only stops automatic collection; it does not provide route or weather fixtures.

## 반복 실행 (개발 중)

`npm --prefix frontend run dev:contract:fast -- contracts/<id>.spec.mjs -g "<테스트 이름>"`

desktop 한 종, 재시도 없음, 이미 떠 있는 서버 재사용(`CONTRACT_REUSE_SERVER=1`). 실측상 태풍 계약 12개가 재시도 포함 5.9분 → 재시도 없이 2.2분이고, 서버 재사용까지 하면 한 건은 30초 안쪽이다.

**병합 전 검증은 `dev:contract`를 쓴다.** 세 뷰포트 전부, 매번 새 서버에서 시작한다.

### 계약을 쓸 때 지킬 것

기능이 늘수록 화면 글자로 요소를 찾는 방식은 반드시 깨진다. 실제로 `/자료 없음/`이 레이더 이동의 "이동 자료 없음"과, `/^태풍/`이 태풍 패널의 "태풍 목록 닫기" 버튼과 겹쳐 계약이 실패했다.

- 이름만으로 찾지 말고 소유 패널·클래스로 범위를 좁힌다.
- 같은 종류가 여러 개일 수 있으면(태풍 2개, 패널 2개) 반드시 대상을 지정한다.
- 지도 소스의 데이터를 단언할 때 `querySourceFeatures`를 쓰지 않는다. 그것은 이미 그려진 타일을 읽어 `setData` 직후를 반영하지 못한다. `getSource(id).serialize().data`를 본다.

## Active

| Contract | Features / owners | Viewports | Preconditions | Spec | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `responsive-baseline` | app shell; `App.jsx`, layout, `MapView.jsx` | desktop, iPad landscape, mobile | local app only; no route/weather fixture | `frontend/verification/contracts/responsive-baseline.spec.mjs` | frontend | active — passed 2026-07-19 |
| `map-base` | `MapView.jsx`, basemap switcher, weather overlays | desktop, iPad landscape, mobile | local map style/assets; no route/weather fixture | `frontend/verification/contracts/map-base.spec.mjs` | frontend | active — passed 2026-07-19 |
| `monitoring` | `MonitoringPage.jsx` | desktop, iPad landscape | local monitoring data; mobile is redirected away from /monitoring | `frontend/verification/contracts/monitoring.spec.mjs` | frontend | active — passed 2026-07-28 |
| `terminal-signage` | `/terminal`; compact destination-queue frames, per-slot active/pending transitions, and low-frequency same-day minimum selection | desktop 1920×1080 plus RKPC 1319×960 evidence | committed 2026-08-02 KAC schedule simulation; weather APIs stubbed | `frontend/verification/contracts/terminal-signage.spec.mjs` | frontend | active — six-frame RKPC uniqueness, mixed slot transitions, RKPU/RKJY three-flight extension, RKNY honest exhaustion, and RKJB empty-state coverage added 2026-08-02 |
| `taf-worsening-alert-one-row` | TAF worsening alert; `AlertPanel.jsx`, `MonitoringPage.jsx` | desktop, iPad landscape | `monitoring-fixture.mjs` TAF with +2시간 visibility(9999→1200m) and ceiling(3000→400ft) degradation; new and previous structures | `frontend/verification/contracts/monitoring.spec.mjs` in `TAF worsening alert shows one row listing every worsened element` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-worsening-alert-timeline-outline` | TAF worsening alert timeline highlighting; `TafTimeline.jsx` | desktop, iPad landscape | same TAF fixture; validates blinkGroup outline on 5-row bars, not scale ticks | `frontend/verification/contracts/monitoring.spec.mjs` in `TAF worsening alert outlines the affected timeline slot` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-amd-severity-escalation` | AMD TAF severity; `AlertPanel.jsx`, alert-triggers.js | desktop, iPad landscape | `buildTafPayload({ reportStatus: 'AMENDMENT' })` escalates from warning to critical | `frontend/verification/contracts/monitoring.spec.mjs` in `an AMD worsening alert sorts above a regular one` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `taf-replacement-not-stacking` | TAF alert row replacement; `alert-engine.js`, lifecycle with issued key | desktop, iPad landscape | `page.clock.install()` + `runFor(61s)` triggers polling; hash change detected; new row replaces old by issued time comparison | `frontend/verification/contracts/monitoring.spec.mjs` in `a new TAF replaces the previous TAF alert row instead of stacking` | frontend | active — passed 2026-07-28 (4 passed, 2 skipped) |
| `airport-panel` | `AirportPanel.jsx` | desktop, iPad landscape, mobile | RKSI must be in the local airport list; no live weather assertion | `frontend/verification/contracts/airport-panel.spec.mjs` | frontend | active — passed 2026-07-19 |
| `notam-and-settings` | `NotamPanel.jsx`, `SettingsModal.jsx` | desktop, iPad landscape, mobile | local app state only; mobile has settings but no NOTAM entry | `frontend/verification/contracts/notam-and-settings.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-import` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed `rksi-rkpk-multi.gpx` fixture; local airport/navdata | `frontend/verification/contracts/route-import.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-workflow` | `RouteBriefingPanel.jsx`, `useRouteBriefing.js` | desktop, iPad landscape, mobile | committed navdata; `route-fixture.mjs` intercepts exposure, altitude, profile, cross-section, briefing APIs | `frontend/verification/contracts/route-workflow.spec.mjs` | frontend | active — passed 2026-07-19 |
| `route-touch-draw` | `routePreview.js` `bindIfrClickInteraction` 그리기 모드 | iPad landscape (휴대폰 레이아웃에는 '그리기' 버튼이 없음) | committed navdata; `route-fixture.mjs`; CDP `Input.dispatchTouchEvent`로 실제 터치 제스처 발생 | `frontend/verification/contracts/route-touch-draw.spec.mjs` | frontend | active — passed 2026-08-05 |
| `echo-top` | `echoTopLayers.js`, `useEchoTopOverlay.js`, `EchoTopCard.jsx`, `WeatherLegends.jsx` | desktop, iPad landscape, mobile | fixture intercepts `echotop_meta.json`, the overlay WebP and `/api/radar/echo-top-point`; radar `echo_meta.json` supplies the 5-minute axis | `frontend/verification/contracts/echo-top.spec.mjs` | frontend | active — passed 2026-07-26 (21/21) |
| `radar-wissdom-qpf` | WISSDOM/QPF weather overlay model, layers, vertical rail, status card, and legends | desktop, iPad landscape, mobile | fixture publishes deterministic KST radar 10:20/10:25, WISSDOM heights, QPF +10/+30 metadata, legends, and images | `frontend/verification/contracts/radar-wissdom-qpf.spec.mjs` | frontend | pending — authored 2026-08-05; intentionally not run in Task 8 |
| `briefing-view` | `BriefingView.jsx`, `MapView.jsx` | desktop, iPad landscape, mobile | committed navdata; `route-fixture.mjs` provides two cross-section forecast times; mobile verifies the fullscreen vertical-profile controls | `frontend/verification/contracts/briefing-view.spec.mjs` | frontend | active — mobile fullscreen coverage added 2026-07-28 |
| `moa-activation` | `useMoaActivation.js`, `moaActivation.js`, `aviationWfsLayers.js` MOA 레이어 | desktop | `moa-activation-notam.mjs`가 `/api/notam`을 가로챔(2026-07-25 라이브 NOTAM 캡처, 유효시각만 상대값); 커밋된 `moa.geojson` | `frontend/verification/contracts/moa-activation.spec.mjs` | frontend | active — passed 2026-07-26 (3/3, desktop) |
| `typhoon` | `typhoonLayers.js`, `typhoonOverlaySync.js`, `TyphoonPanel.jsx`, `typhoonColors.js`, `WeatherOverlayPanel.jsx` | desktop, iPad landscape, mobile | `typhoon-snapshot.json`(2018년 19호·20호 실제 응답 기반)이 `/api/typhoon`을 가로챔; 활성 태풍 없음·수집 실패 상태도 함께 검증 | `frontend/verification/contracts/typhoon.spec.mjs` | frontend | active — passed 2026-07-26 (36/36) |
| `airmet-symbols` | `advisoryLayers.js` 기호 합성(`measureIconInk`, 마커 캔버스), `WeatherOverlayPanel.jsx` AIRMET 타일 | desktop (기호 합성은 뷰포트 무관) | `airmet-surface-phenomena.json`(운영 API 캡처: SFC_WIND 270°/30KT, SFC_VIS 5000M FG/BR)이 `/api/airmet`을 가로챔; 합성된 마커 이미지의 불투명 픽셀을 직접 측정 | `frontend/verification/contracts/airmet-symbols.spec.mjs` | frontend | active — passed 2026-08-25 (1/1, desktop) |
| `terrain-hazard` | `terrainHazardLayer.js`, `terrain-rgb-tiles.js`(`/api/terrain/rgb`), `WeatherOverlayPanel.jsx` 지형 그룹, 공용 고도 레일 | desktop | 커밋된 DEM(`backend/data/terrain/tiles`)과 `fir.geojson`; 대한해협 [128.4, 35.0] zoom 7.2 고정 카메라 — 지리산은 칠해지고 대마도는 칠해지지 않음을 픽셀로 확인 | `frontend/verification/contracts/terrain-hazard.spec.mjs` | frontend | active — passed 2026-08-03 (1/1, desktop) |

## Registered next

| Contract | Preconditions | Status |
| --- | --- | --- |
| `traffic-panel` | Vite on 5173; `/api/adsb` returning aircraft data. Guarantee: sidebar 항적 → panel opens; ADS-B enable + operator/altitude/search filters → map aircraft count matches panel `보이는 항공기 N / 전체 M`; reload preserves filters, display off | capture — `node frontend/scripts/traffic-panel-capture.mjs`; active 2026-07-31 |

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
