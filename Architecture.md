# Project Architecture

Vite + React aviation weather dashboard with a Node/Express weather data backend.

## Directory Structure

```text
ProjectAMO/
  .claude/
    agents/                  -> Claude subagent roster (researcher/implementer/reviewer, model-tiered)
  frontend/
    public/
      data/                    -> runtime GeoJSON, navdata, route graph, procedure data
      Symbols/                 -> Mapbox aviation SVG symbols
      basemap-thumbs/          -> basemap switcher thumbnails
      Geo/                     -> Korean boundary GeoJSON
    src/
      api/                     -> frontend API clients
      app/                     -> app shell, layout, and weather polling
      features/
        map/                   -> Mapbox lifecycle, basemap/style readiness, map-owned layers, and high-level feature orchestration
        monitoring/            -> standalone legacy-style ops/ground monitoring page with Mapbox overlay panel
        aviation-layers/       -> aviation WFS and ADS-B layers
        weather-overlays/      -> radar/satellite/lightning/SIGWX/advisory overlays
        route-briefing/        -> route search and procedure/navpoint lookup
        airport-panel/         -> airport detail drawer, tabs, and view models
        search/                -> 공항+기능 통합 검색 팔레트 + 공유 레이어 액션 레지스트리
        developer/             -> `/dev` 개발자 콘솔(조작+관찰), 테스트 인스턴스(dev:test) 전용 — EntryPoints §11
        onboarding/            -> 첫 사용자 코치마크 투어(스포트라이트+툴팁, 의존성 0). 데스크톱 자동 1회 + 도움말 재실행
      shared/
        ui/                    -> frontend-only reusable UI
        weather/               -> frontend-only weather display helpers
  backend/
    data/                    -> local development data root; terrain source/tiles live here when DATA_PATH is unset
    src/
      briefing/               -> route-axis, planned altitude profile, and vertical profile composition
      terrain/                 -> terrain tile cache and DEM sampling
      parsers/                 -> upstream raw response parsers
      processors/              -> normalized data transformers
  scripts/                     -> local preprocessing helpers such as terrain tile generation
  shared/                      -> backend/frontend common constants
  docs/                        -> operations, deployment, and route briefing architecture notes
```

## File Roles

### Frontend

- `frontend/src/main.jsx` -> React root bootstrap; imports app entry CSS.
- `frontend/src/app/App.jsx` -> app shell state, sidebar/panel composition, selected airport state, and route-level lazy loading for non-main app routes.
- `frontend/src/app/App.css` -> app shell and layout CSS entry.
- `frontend/src/app/useWeatherPolling.js` -> initial weather load, deferred panel-data loading, plus snapshot-meta incremental polling.
- `frontend/src/app/snapshotMeta.js` -> snapshot-meta comparison helpers.
- `frontend/src/app/layout/Sidebar.jsx` -> sidebar item definitions and panel toggle UI (desktop/tablet; hidden at <=719px in favor of the mobile task bar).
- `frontend/src/app/layout/Sidebar.css` -> sidebar styles.
- `frontend/src/app/layout/MobileTaskBar.jsx` -> mobile (<=719px) bottom task switcher (지도/브리핑/더보기) that replaces the sidebar; drives `mobileTask` in `App.jsx`.
- `frontend/src/app/layout/MobileMapOverlay.jsx` -> mobile 지도-task status strip (warning summary) plus on-map aviation/met layer entry buttons.
- `frontend/src/app/layout/MobileMoreMenu.jsx` -> mobile 더보기-task list (updates/settings/monitoring; NOTAM/help disabled).
- `frontend/src/shared/ui/useIsMobile.js` -> shared `<=719px` matchMedia hook (used by `App.jsx` for the mobile shell).
- `frontend/src/shared/ui/MobileSheet.jsx` -> shared mobile (<=719px) bottom sheet: grabber handle, peek/half/full pointer-drag detents, scrollable body, flush to the task bar. Hosts the layer panels and the route-briefing panel on mobile.
- `frontend/src/app/layout/layoutTokens.css` -> shared responsive layout tokens for shell widths, panel widths, breakpoint policy, spacing, and minimum control sizes.
- `frontend/src/api/weatherApi.js` -> initial weather bundle, deferred weather dataset, changed dataset, static airport/navdata fetch helpers.
- `frontend/src/api/adsbApi.js` -> ADS-B fetch helper.
- `frontend/src/api/briefingApi.js` -> route briefing and vertical profile API helpers.
- `frontend/src/features/map/MapView.jsx` -> Mapbox instance owner, style readiness/basemap switching coordinator, `styleRevision` sync trigger, high-level feature panel composition, and current-state sync orchestration, including base geo-boundary visibility for dark/raster/NWP overlay contrast. Feature-specific data shaping and layer adapters live in their owning feature modules. `forwardRef`로 imperative `setLayerOn(id, kind)`/`switchBasemap(id)`를 노출 — 검색 팔레트 등 외부 소비자가 MapView 내부 레이어/베이스맵 상태를 직접 끌어올리지 않고 켜도록 한다.
- `frontend/src/features/map/MapView.css` -> map, overlay panel, and route briefing style entry.
- `frontend/src/features/map/mapConfig.js` -> map bounds, initial camera, basemap options.
- `frontend/src/features/map/imageOverlay.js` -> shared Mapbox image overlay helpers for raster/SIGWX frames.
- `frontend/src/features/map/lib/mapStyleSync.js` -> Mapbox style-reload helpers for cleanup-aware layer event binding, cleanup collections, and source/layer ownership tests.
- `frontend/src/features/map/lib/baseMapLayers.js` -> airport and geo-boundary source/layer install helpers, plus geo-boundary visibility policy for basemap and weather/NWP overlay contrast.
- `frontend/src/features/map/basemapSwitcher/BasemapSwitcher.jsx` -> basemap switcher UI.
- `frontend/src/features/monitoring/MonitoringPage.jsx` -> standalone `/monitoring` legacy-style ops/ground screen.
- `frontend/src/features/monitoring/MonitoringMap.jsx` -> monitoring wrapper around the main MapView with local Aviation/MET icon toggles.
- `frontend/src/features/monitoring/monitoringApi.js` -> monitoring data loader using current API shape.
- `frontend/src/features/monitoring/legacy/*` -> copied previous-project dashboard components, alert utilities, and CSS for the standalone monitoring screen; weather rendering reuses shared `WeatherIcon`, resolver, registry, and BasMilius assets.
- `frontend/src/features/aviation-layers/aviationWfsLayers.js` -> aviation static GeoJSON layer definitions.
- `frontend/src/features/aviation-layers/addAviationWfsLayers.js` -> aviation GeoJSON source/layer creation.
- `frontend/src/features/aviation-layers/addAdsbLayer.js` -> ADS-B GeoJSON shaping, source/layer install, visibility sync, cleanup-aware hover popup binding, and `ADSB_SOURCE_IDS`/`ADSB_LAYER_IDS` ownership exports.
- `frontend/src/features/aviation-layers/AviationLayerPanel.jsx` -> aviation WFS layer toggle panel (desktop rows; mobile renders a tile grid inside `MobileSheet`). ADS-B remains controlled from the MET/weather overlay panel for the current UX.
- `frontend/src/features/aviation-layers/lib/aviationLayerTiles.js` -> mobile aviation tile symbology metadata (boundary-color squares, ICAO `public/Symbols/*.svg`, airway line samples); colors imported from `aviationWfsLayers.js` so the tile grid mirrors the live map.
- `frontend/src/features/weather-overlays/WeatherOverlayPanel.jsx` -> MET overlay toggle panel.
- `frontend/src/features/weather-overlays/TimelineRail.jsx` -> always-on unified bottom time scrubber: a full-width scrolling tape with a fixed centre playhead (transparent play button only). Past observations (radar/satellite/lightning, solid baseline) → 지금 → future NWP forecast (dashed). Tiered hour/30/15-min ruler ticks (hour labels, date shown at midnight); drag the tape to scrub. Replaces the former `WeatherTimelineBar` and absorbs the NWP time axis. State/playback live in `lib/useTimelineRail.js`; geometry in `lib/timelineRailModel.js`.
- `frontend/src/features/weather-overlays/lib/useTimelineRail.js` -> timeline state (selected absolute ms, play/pause, speed) + `useTimelinePlayback` frame-stepping loop, kept out of `MapView` per ADR 0001.
- `frontend/src/features/weather-overlays/lib/timelineRailModel.js` -> pure tape geometry helpers: absolute-time domain, tape percent/drag mapping, tiered ruler ticks, nearest past-frame/NWP-time pickers.
- `frontend/src/features/weather-overlays/AdsbTimestamp.jsx` -> ADS-B reference-time display pill.
- `frontend/src/features/weather-overlays/WeatherLayerTimestampBar.jsx` -> ICAO 준수용 통합 "기상자료 시각" 패널(좌하단, 타임라인 위). 활성 예보계열 레이어(바람·기온·습도·착빙=NWP, 난류=KTG, 비행기상구역, SIGWX)마다 발표/유효 시각을 한 줄씩, Fluent 토큰 디자인으로. 관측계열(레이더·위성·낙뢰)은 타임라인·범례가 담당하므로 제외. 활성 항목 0개면 미표시. 입력은 MapView `timestampEntries` + `tz`.
- `frontend/src/features/weather-overlays/WeatherLegends.jsx` -> radar/satellite/weather/wind/temperature legend UI.
- `frontend/src/features/weather-overlays/SigwxLegendDialog.jsx` -> SIGWX legend dialog.
- `frontend/src/features/weather-overlays/SigwxHistoryBar.jsx` -> SIGWX history controls.
- `frontend/src/features/weather-overlays/AdvisoryBadges.jsx` -> 상시 위험 요약 칩 바: SIGMET/AIRMET은 레이어 토글과 무관하게 활성(count>0) 시 상시 표시 + 공항경보 칩(`warnedAirports`). 칩 클릭 → 해당 레이어 ON + 상세 리스트(SIGMET/AIRMET) 또는 경보 공항 리스트(클릭 시 공항 선택).
- `frontend/src/features/weather-overlays/lib/weatherOverlayModel.js` -> weather overlay derived model for timeline, SIGWX history/filter state, advisory panel data, badge counts, and legend labels.
- `frontend/src/features/weather-overlays/lib/weatherOverlayLayers.js` -> MET panel layer definitions, weather overlay source/layer ownership IDs, static weather overlay installation, and radar/satellite/SIGWX/advisory/lightning Mapbox sync helpers.
- `frontend/src/features/weather-overlays/lib/rainviewerLayers.js` -> 해외 레이더(RainViewer) XYZ 래스터 타일 + 커버리지(회색=레이더 미수신) 레이어. 국내(KMA)와 **상호배타**(`metLayerVisibility.js`)라 z-order 다툼 없음 → `slot:'middle'`, `beforeId` 미사용. 프레임 교체는 `setTiles`. 백엔드는 목차 JSON(`radar/rainviewer_meta.json`)만 수집하고 타일은 브라우저가 CDN에서 직접 받는다(프록시 금지 — 서버 IP 차단 위험). 라이선스: personal/educational only.
- `frontend/src/features/weather-overlays/NwpSliderBar.jsx` -> right-side KIM NWP level (altitude/pressure) slider. The bottom time slider is now owned by `TimelineRail`; pass `timeSliderEnabled={false}` to suppress the legacy inline time bar (kept behind the prop for other callers).
- `frontend/src/features/weather-overlays/NwpSliderBarModel.js` -> pure KIM NWP slider option and time tick formatting helpers.
- `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.js` -> KIM wind index/field selection hook with shared selection support, nearest-past time fallback, field cache, request cancellation, and stale response guards.
- `frontend/src/features/weather-overlays/lib/useKimSurfaceWind.test.js` -> KIM wind selection/index helper tests.
- `frontend/src/features/weather-overlays/lib/useKimSnapshotMeta.js` -> shared KIM snapshot-meta polling subscription used by KIM NWP overlay hooks.
- `frontend/src/features/weather-overlays/lib/useKimTemperature.js` -> KIM temperature index/field hook with selected-field cache, request cancellation, and variable-hash refresh.
- `frontend/src/features/weather-overlays/lib/useKimCloudPotential.js` -> KIM cloud-potential index/field hook using shared pressure-level selection, field cache, cloud variable-hash refresh, and stale-selection guards.
- `frontend/src/features/weather-overlays/lib/useKimCloudPotential.test.js` -> KIM cloud-potential selection, cache-key, snapshot-hash, and request-guard helper tests.
- `frontend/src/features/weather-overlays/lib/windField.js` -> KIM selected wind field decoding, interpolation sampler, shared kt color ramp, and metadata label helpers.
- `frontend/src/features/weather-overlays/lib/windOverlaySync.js` -> wind overlay renderer lifecycle adapter, WebGL-first selection, Canvas fallback, and Mapbox event sync.
- `frontend/src/features/weather-overlays/lib/temperatureField.js` -> KIM temperature field decoding, Kelvin-to-Celsius display conversion, sampler, and fixed Celsius color ramp.
- `frontend/src/features/weather-overlays/lib/temperatureOverlaySync.js` -> temperature Canvas raster generation and Mapbox image overlay lifecycle sync.
- `frontend/src/features/weather-overlays/lib/cloudPotentialField.js` -> KIM dewpoint-spread decoding and green stepped moist-area display ramp.
- `frontend/src/features/weather-overlays/lib/cloudPotentialOverlaySync.js` -> dewpoint-spread Canvas raster generation and Mapbox image overlay lifecycle sync.
- `frontend/src/features/weather-overlays/lib/useKimIcing.js` -> KIM icing-potential index/field hook with shared NWP selection, field cache, icing variable-hash refresh, and stale-selection guards.
- `frontend/src/features/weather-overlays/lib/icingPotentialField.js` -> KIM icing-potential score/grade decoding, sampler, potential-class color ramp, and conservative K-FIP-inspired labels.
- `frontend/src/features/weather-overlays/lib/icingPotentialOverlaySync.js` -> icing-potential Canvas raster generation and Mapbox image overlay lifecycle sync.
- `frontend/src/features/weather-overlays/lib/canvasWindRenderer.js` -> Canvas 2D fallback renderer for KIM wind flow and speed overlays.
- `frontend/src/features/weather-overlays/lib/webglWindRenderer.js` -> WebGL wind renderer for KIM wind flow particles and speed color cells.
- `frontend/src/features/weather-overlays/lib/lightningLayers.js` -> lightning GeoJSON, icon, layer, visibility, and blink helpers.
- `frontend/src/features/weather-overlays/lib/advisoryLayers.js` -> SIGMET/AIRMET GeoJSON and layer helpers.
- `frontend/src/features/weather-overlays/lib/sigwxData.js` -> SIGWX_LOW GeoJSON/icon mapping helpers.
- `frontend/src/features/notam/NotamPanel.jsx` -> (surface A) global NOTAM sidebar panel: category filter tiles (`layer-tile` pattern), dense table, selected-airport priority, data-horizon disclosure, colorblind time-state badges (color+glyph+text); master toggle via `metVisibility.notam`.
- `frontend/src/features/notam/lib/notamViewModel.js` -> pure NOTAM helpers: `deriveTimeState` (active/soon/upcoming = color axis), `formatAltitude` (AGL/AMSL preserved, 전고도 shortening), `sortActiveFirst`, `NOTAM_CATEGORIES`, `TIME_STATE`.
- `frontend/src/features/notam/lib/notamGeoJson.js` -> payload -> GeoJSON with category+timeState properties; excludes `scope:'fir'` and null geometry (keeps LineString for map/tab).
- `frontend/src/features/notam/lib/notamLayers.js` -> Mapbox NOTAM source/fill/line/marker install+sync, time-state color (`--level-*`) + colorblind shape, category `filter`, zoom split (marker<->polygon), overlap-popup HTML; owns `NOTAM_SOURCE_IDS`/`NOTAM_LAYER_IDS`.
- `frontend/src/features/airport-panel/tabs/NotamTab.jsx` -> (surface B) airport NOTAM list (A-field match) + nationwide `scope:'fir'` 전역 공지 section; reads `weatherData.notam`.
- `frontend/src/features/route-briefing/lib/procedureData.js` -> procedure/navpoint loading helpers.
- `frontend/src/features/route-briefing/useRouteBriefing.js` -> route briefing state, async transitions/lifecycle cancellation, route search, vertical profile orchestration, and delegation of IFR procedure selection to `recommendProcedures`.
- `frontend/src/features/route-briefing/lib/recommendProcedures.js` -> injected-I/O IFR procedure recommendation owner.
- `frontend/src/features/route-briefing/lib/briefingViewModel.js` -> pure briefing display-transform owner.
- `frontend/src/features/route-briefing/RouteBriefingPanel.jsx` -> route-check panel UI for IFR/VFR form, route result, VFR altitude editing, and vertical profile controls.
- `frontend/src/features/route-briefing/VerticalProfileWindow.jsx` -> vertical profile modal shell.
- `frontend/src/features/route-briefing/RouteBriefing.css` -> route panel, VFR waypoint, and vertical profile styles.
- `frontend/src/features/route-briefing/VerticalProfileChart.jsx` -> SVG route vertical profile chart.
- `frontend/src/features/route-briefing/BriefingView.jsx` -> pre-flight briefing view: Go/No-go 배너(`BriefingBanner`) + ① 위험 다이제스트(2줄·색바·아이콘·정렬·공항경보 통합) + ② 현재 비교 매트릭스(공항=행, 범주 앞, 바람kt/시정km, 관측시각+SPECI) + ③ 노선(hazard ribbon + `VerticalProfileChart` 단면도 + 상층바람 원자료 접기 `buildRawWindsTable`) + ④ 목적지(카테고리 타임라인 막대 + 기간표 + 교체 병렬 + 원문 재구성 접기); 범주 표시는 3레벨 fold(MVFR→IFR). 지도를 route-check 패널 위에 오버레이.
- `frontend/src/features/route-briefing/BriefingBanner.jsx` -> Go/No-go 배너 — 최악 카테고리(3레벨)+공항+이유(운고/시정)+역할 체인. 정상=무채/연녹, 위험만 솔리드(§2.2). 데이터는 `briefing.banner`.
- `frontend/src/features/route-briefing/BriefingSynopsis.jsx` -> ③ 개황 일기도 뷰어 — 종류 칩(지상/상층/상세바람/단열선도/연직시계열)→기압면 칩→시간 슬라이더→차트+라이트박스+자동요약+지도토글. ⚠ 이미지는 `public/briefing-charts/` KMA **샘플**(실시간 fetch·아카이빙 백엔드 파이프라인 미구현 — "샘플·실시간 연동 예정" 라벨). 내부망 종류(상세바람 등 기압면)는 "준비중" 비활성.
- `frontend/src/features/route-briefing/lib/rawWindsModel.js` -> ④ 상층바람·기온 원자료 표 순수 모델: `crossSection.levels`(T+u/v, m/s)×`verticalProfile.markers`(웨이포인트) → dir/speed·기온 셀 + 계획고도 최근접 층 하이라이트(`altitudeAtDistance`).
- `frontend/src/features/route-briefing/lib/etaCalc.js` -> ETD + route distance / cruise speed -> ETA helper.
- `frontend/src/features/route-briefing/lib/hazardLayers.js` -> 위험현상→지도 레이어 **룰북**(`RULEBOOK` 테이블, 브리핑 도메인). 경로상 위험에서 켤 MET 레이어 id 집합 산출(뇌우→radar+lightning+sigmet, 태풍→radar+sigmet, 착빙·난류 등). 새 규칙은 RULEBOOK에 한 줄 추가. BriefingView가 "지도에 관련 레이어 보기" → `LayerToggleChips`로 노출(토글=MapView `toggleMet`). METAR/TAF/경보는 레이어 아님(제외). 반환 id는 MET_LAYERS와 `hazardLayers.test.js`로 동기화.
- `frontend/src/features/route-briefing/lib/routeBriefingModel.js` -> pure route briefing view/model helpers.
- `frontend/src/features/route-briefing/lib/routePreviewSync.js` -> route/procedure/VFR/boundary-fix/highlight Mapbox install/sync helpers and route preview source/layer ownership IDs.
- `frontend/src/features/route-briefing/lib/routePreview.js` -> route/procedure/VFR GeoJSON helpers, layer installation, and VFR map interaction binding.
- `frontend/src/features/route-briefing/lib/routeStore.js` -> localStorage CRUD for saved routes (inputs only; reloaded by re-search).
- `frontend/src/features/map/layerActions.js` -> 공유 레이어 레지스트리(공항+패널+기상/항공 레이어+베이스맵). label/aliases 단일 출처, `buildSearchCatalog`/`matchSearch`·`metLabel`/`aviationLabel` 제공. 지도 레이어 메타데이터라 `features/map`에 둔다(검색·브리핑·경로가 공유). 레이어 토글은 MapView ref(`setLayerOn`)·베이스맵은 `switchBasemap` 재사용.
- `frontend/src/features/map/LayerToggleChips.jsx` -> 지도 레이어 토글칩 묶음(상태 표시+토글). 브리핑(MET)·VFR 입력(항공)이 공유. items=[{key,label,on,onToggle}].
- `frontend/src/features/search/SearchPalette.jsx` -> 공항+기능 통합 검색 팔레트(Cmd/Ctrl+K·사이드바 검색 아이콘·모바일 더보기로 진입). Fluent `SearchBox` + 토큰 기반 결과 행, 키보드 내비/포커스 트랩/복귀.
- `frontend/src/features/onboarding/useTour.js` -> 온보딩 투어 상태머신 훅. 진행은 **전부 수동([다음])** — 열린 패널을 볼 시간을 주려고(자동진행 없음). localStorage `amo.tour.v1.done`·optional 스텝 auto-skip. `willAutoStart`로 App의 업데이트 모달 자동표시와 우선순위 조율(첫 방문자만 투어 우선, 완료 시 `markSeen`).
- `frontend/src/features/onboarding/tourMachine.js` + `tourSteps.js` + `targetRect.js` -> 순수 상태 로직(node --test)과 5스텝 정의, 스텝→rect 리졸버. target은 기존 셀렉터 재사용(`.map-shell`·사이드바 `[aria-label]`·`[data-tour=advisory]`) 또는 `mapAirport:'RKSI'`(지도 마커). mapAirport rect는 MapView ref `getAirportPoint`(공항 좌표→`map.project`+**캔버스 뷰포트 오프셋**)로 계산 — 오프셋 안 더하면 마커 왼쪽으로 어긋남.
- `frontend/src/features/onboarding/TourOverlay.jsx` + `Tour.css` -> box-shadow 스포트라이트(가벼운 0.28 스크림 — 열린 패널이 묻히지 않게) + 툴팁. 사이드바/지도 스텝 구멍은 `pointer-events:none`(대상 클릭 통과), mapAirport 구멍은 원형·클릭형(클릭=공항 선택, canvas 히트테스트 우회). **revealSelector**: 클릭으로 패널이 열리면 스포트라이트가 열린 패널로 이동 + 툴팁을 패널 반대편으로 재배치(가림 방지). rAF로 이동 대상(지도 pan/zoom·flyTo·사이드바 트랜지션) 재측정. z-index 1100.
- `frontend/src/features/map/MapView.jsx` ref -> 온보딩용 `getAirportPoint(icao)`(공항→뷰포트 픽셀), `flyToAirport(icao)`(선택 없이 카메라 이동, 첫 호출 시 홈 뷰 저장), `resetView()`(저장한 홈 뷰로 복귀) 추가. App이 온보딩 스텝 전환 시 패널 닫기+공항 스텝 이탈 시 resetView 호출.
- `frontend/src/features/airport-panel/AirportPanel.jsx` -> airport drawer shell and tab selection.
- `frontend/src/features/airport-panel/AirportPanel.css` -> airport drawer and tab style entry.
- `frontend/src/features/airport-panel/tabs/MetarTab.jsx` -> METAR tab rendering.
- `frontend/src/features/airport-panel/tabs/TafTab.jsx` -> TAF tab rendering.
- `frontend/src/features/airport-panel/tabs/AmosTab.jsx` -> AMOS tab rendering.
- `frontend/src/features/airport-panel/WarningCarousel.jsx` -> live airport warning surface.
- `frontend/src/features/airport-panel/tabs/AirportInfoTab.jsx` -> airport information bulletin rendering.
- `frontend/src/features/airport-panel/lib/formatters.js` -> airport panel time/wind formatting helpers.
- `frontend/src/features/airport-panel/lib/currentWeatherViewModel.js` -> warning-carousel model helpers only.
- `frontend/src/features/airport-panel/lib/metarViewModel.js` -> METAR display model builder.
- `frontend/src/features/airport-panel/lib/tafViewModel.js` -> TAF display model builder.
- `frontend/src/shared/weather/amosViewModel.js` -> AMOS display model helpers (`buildAmosConsoleModel`: 사용활주로·정풍/측풍 성분·RVR·운고·QNH·기온). `airport-panel` AmosTab과 route-briefing ② 확장이 공유(그래서 `shared/`; fmtKst 인라인).
- `frontend/src/shared/ui/WeatherIcon.jsx` -> weather icon renderer.
- `frontend/src/shared/weather/helpers.js` -> flight category, wind, humidity, and related weather helpers.
- `frontend/src/shared/weather/visual-mapper.js` -> weather code-to-Korean display mapping.
- `frontend/src/shared/weather/weather-visual-resolver.js` -> weather icon visual resolver.
- `frontend/src/shared/weather/weather-icon-registry.js` -> weather icon asset registry.

### Backend

- `backend/server.js` -> Express entry point, API routes, cache headers, static data serving, and KIM NWP map index filtering.
- `backend/src/briefing/route-axis.js` -> route LineString resampling, cumulative distance, and bearing helpers.
- `backend/src/briefing/profile-composer.js` -> route-aware planned altitude profile, markers, and segment metadata composition.
- `backend/src/briefing/vertical-profile.js` -> vertical profile response composition.
- `backend/src/briefing/briefing-composer.js` -> assembles the AIM-ordered route-briefing payload (Go/No-go `banner` + adverse/current/enroute/destination) from injected METAR/TAF/SIGMET/AIRMET/warning cache; folds airport warnings (`AIRPORT_WARNINGS`) into adverse as airport-scope hazards.
- `backend/src/briefing/flight-category.js` -> visibility/ceiling -> VFR/MVFR/IFR/LIFR classifier, `categoryDetail`(최악+한계요인 운고/시정), `to3Level`(MVFR→IFR 표시 fold), category-to-level color mapping.
- `backend/src/briefing/geo-time-match.js` -> point-in-polygon, route∩polygon (horizontal), route∩polygon distance interval (`routeIntervalInGeometry`), and time-window overlap helpers for hazard matching.
- `backend/src/briefing/planned-altitude.js` -> planned climb/cruise/descent altitude-by-distance model and advisory FL band -> ft conversion.
- `backend/src/briefing/hazard-matcher.js` -> classifies a hazard as encounter `on`/`nearby` from planned altitude vs FL band (3D vertical match).
- `backend/src/briefing/enroute-model.js` -> samples KIM/KTG cross-section at the planned altitude and emits moderate+ icing/turbulence intervals (the ④ enroute model summary).
- `backend/src/briefing/enroute-cross-section.js` -> shared KIM pressure-level + KTG low-altitude cross-section loader (`loadRouteCrossSection`); used by both `POST /api/briefing/cross-section` and the route-briefing enroute model.
- `backend/src/briefing/airport-summary.js` -> single-airport METAR -> flight category + threshold-flagged display fields + 원문 METAR 재구성(IWXXM라 원본 없음 → display 토큰으로 TAC 재조립, CAVOK 처리).
- `backend/src/processors/takeoff-forecast-processor.js` + `parsers/takeoff-forecast-parser.js` -> KMA 이륙예보(`AirInfoService/getAirInfo`, fctm=KST 정시) 매시 수집(airport-info 패턴 복제, 같은 apihub·authKey). store 타입 `takeoff_fcst`(index 스케줄·초기수집·snapshot-meta 등록), 브리핑 `data`에 주입 → composer가 공항별 `takeoffFcst`로 실어 ② 출발 행 확장. 파서가 tmFc(KST)→UTC ISO, qnh(inHg×100)→hPa 변환.
- `backend/src/briefing/taf-window.js` -> destination TAF selection at ETA, 1-2-3 alternate-required eval, and `buildDestination` rich model (카테고리 타임라인 + base/변화군 기간표 + 교체 병렬 + 원문 재구성). Needs `taf.base`/`taf.change_groups` from `taf-parser`.
- `backend/src/briefing/hazard-section.js` -> SIGMET/AIRMET adverse-hazard section with 3D matching (route∩time∩altitude); tags each hazard encounter `on`/`nearby`, attaches per-hazard `level` (SIGMET red unless confirmed off-altitude; AIRMET amber), merges caller-supplied `airportWarnings`(공항경보), and sorts severity-first (조우>주변, red>amber). Also feeds the briefing ③ enroute section.
- `backend/server.js` -> exposes `POST /api/route-briefing` (composes briefing from `store.getCached` METAR/TAF/SIGMET/AIRMET).
- 해외 기상(NOAA) 갈래 — **국내와 완전 분리**: `config.noaa`(공항 목록은 `frontend/public/data/navdata/airports-overseas.json`에서 파생, 20 FIR·VDPP→VDPF), `api-client`(`fetchNoaaMetar/Taf/Sigmet` — JSON·무인증·EUC-KR/resultCode 없음), `parsers/noaa-{metar,taf,sigmet}-parser.js`(→ KMA 정규화 shape, 시정 SM→**미터**, wdir "VRB", TAF base/change_groups/timeline·`header.raw_text`, SIGMET firId 필터·RKRR 제외·자기교차 링만 중심각 복구). `processors/overseas-weather-processor.js`(`processMetar/Taf/Sigmet`)가 **별도 store 타입**(`metar_overseas`/`taf_overseas`/`sigmet_overseas`)에 저장 — 국내 파일과 안 섞음. index.js가 국내와 **같은 cron 주기**로 별도 job 등록. server.js `/api/{metar,taf,sigmet}-overseas` 라우트와 snapshot-meta의 `metarOverseas`/`tafOverseas`/`sigmetOverseas` hash를 제공. 프론트 상태는 `metar`/`metarOverseas`, `taf`/`tafOverseas`, `sigmet`/`sigmetOverseas`로 분리하고, 지도·브리핑처럼 함께 보여야 하는 경로에서만 표시/판정용 병합을 수행. 국내 {metar,taf,sigmet}-processor·IWXXM 파이프라인은 **불변**. 지도 마커는 `airports-overseas.json`을 `weatherData.airports`에 병합해 렌더.
- `backend/src/terrain/terrain-cache.js` -> terrain tile metadata lookup and lazy tile cache.
- `backend/src/terrain/terrain-sampler.js` -> terrain sampling along route-axis samples.
- `backend/src/index.js` -> scheduled weather collection jobs, per-type locks, and UTC KIM NWP release-window scheduling.
- `backend/src/api-client.js` -> upstream KMA/weather API request construction.
- `backend/src/store.js` -> in-memory cache and SHA-256 change detection.
- `backend/src/notam/notam-crawler.js` -> headless Playwright crawler for KOCA 유효 NOTAM KML (site-default 24h window; no date manipulation).
- `backend/src/parsers/notam-parser.js` -> KML -> structured NOTAM records (Q-code, B/C times, F)/G) altitude with AGL/AMSL, geometry).
- `backend/src/processors/notam-processor.js` -> Q-code -> category/scope, crawl+parse orchestration, `store.save('notam')`; no severity judgment.
- `backend/server.js` -> exposes `GET /api/notam` (latest NOTAM snapshot from `store.getCached('notam')`).
- `backend/src/parsers/*` -> per-type raw response parsers.
- `backend/src/processors/*` -> per-type normalized data processors.
- `backend/src/processors/kim-surface-wind-processor.js` -> KIM scheduled job/lock orchestrator for multi-level NWP wind, Temp, moisture-level RH, and config-gated icing-variable collection with complete-run skip checks; publishes partial successful runs to canonical `DATA_PATH/kim_nwp/` while preserving the legacy surface-wind cache, then retries incompleteness on later schedules.
- `backend/src/processors/kim-nwp-store.js` -> canonical `DATA_PATH/kim_nwp/` store helpers for safe path resolution, atomic manifest/grid/index/latest writes, reads, usable-run manifest checks, and run retention.
- `backend/src/processors/kim-nwp-model.js` -> KIM NWP levels/forecast hours/moisture/icing levels, per-variable scaled grid builder, compact index filtering with per-variable hashes, and wind/temperature/dewpoint-spread/icing renderer-compatible field conversion.
- `backend/test/kim-scheduler.test.js` -> scheduler wiring tests for UTC KIM NWP release-window cron behavior and startup KIM collection gating.
- `backend/test/kim-nwp-store.test.js` -> KIM NWP store path validation, atomic write/read, compact index, and retention tests, including partial-run retention safety.
- `backend/test/kim-nwp-model.test.js` -> KIM NWP wind grid, index, and compatibility field model tests.
- `backend/test/kim-server-index.test.js` -> KIM NWP map index filtering tests for nearest-past plus future time exposure.
- `backend/test/kim-field-cache.test.js` -> KIM field route immutable cache header and ETag revalidation tests.
- `backend/test/snapshot-meta-cache.test.js` -> `/api/snapshot-meta` backend memoization and mtime invalidation tests.
- `backend/test/compression.test.js` -> Express gzip compression smoke test for large JSON KIM field responses.
- `backend/test/api-cache-policy.test.js` -> static/revalidating API cache header and ETag regression tests.
- `backend/collect.js` -> manual one-shot collector.
- `scripts/prepare-terrain-tiles.js` -> converts decompressed Korea 3-second DEM into 1-degree terrain tiles.
- `frontend/scripts/mobile-audit-capture.mjs` -> 모바일 3표면(지도·공항·브리핑) 상태별 스크린샷 + axe 접근성 스캔 캡처(디자인 헌법 §6 모바일 대원칙 audit용). 산출물은 `artifacts/responsive-screenshots/`(gitignore).

## Reference Structure

- `frontend/src/main.jsx` imports only the app entry files.
- Frontend layout sizing should use `frontend/src/app/layout/layoutTokens.css` for shared shell, panel, and breakpoint values before adding new fixed pixel widths.
- Frontend UI, CSS, layout, and responsive work should follow `docs/design/design-language.md` (the design constitution, single source of truth) for tokens, color, typography, operational UX priorities, review workflow, and proposal-first structural change rules.
- `frontend/src/app/*` may import `api/`, `features/`, and `shared/`.
- `frontend/src/features/*` may import `api/`, `shared/`, and local feature siblings when a UI flow requires it.
- `frontend/src/shared/*` must stay frontend-only and must not import from `app/` or `features/`.
- Root `shared/` is for backend/frontend common constants; do not mix it with `frontend/src/shared/`.
- `frontend/src/features/map/MapView.jsx` owns Mapbox instance creation, basemap switching, style readiness, and `styleRevision`; it should not apply feature data or visibility from stale `style.load` closures.
- Feature-owned Mapbox adapters should expose or document their source/layer IDs when they own persistent Mapbox resources.
- Weather overlay map writes belong under `frontend/src/features/weather-overlays/lib/`; route preview map writes belong under `frontend/src/features/route-briefing/lib/`; ADS-B map writes belong under `frontend/src/features/aviation-layers/`.
- Adding a map overlay/layer or its visibility sync? Put it in the owning feature module as a `useXOverlay` hook (see `useWeatherFieldOverlay`/`useStyleSyncedEffect`), not as a new `useEffect` in `MapView.jsx` — MapView regrows by accretion otherwise (see `docs/adr/0001-mapview-layer-gravity.md`).
- 레이어를 켜는 공유 경로는 `features/map/layerActions.js` 레지스트리를 통한다(검색·브리핑·경로가 공유, MapView 토글 재사용). 새 토글 레이어 추가 시 `layerActions.test.js` 커버리지 테스트가 레지스트리 등록을 강제하므로, 레이어 정의에 id를 더하면 레지스트리에도 등록해야 한다.
- `backend/*` must not import from `frontend/src/`.
- Runtime browser assets must live under `frontend/public/`.
- AMOS frontend wind rendering treats current normalized `amos.runways[0]` as the 2-minute wind group and `amos.runways[1]` as the 10-minute wind group; runway-side semantics only apply to visibility and RVR until the backend parser is renamed.
- Raw terrain sources and generated terrain tiles stay under the backend data root at `terrain/`; locally this is `backend/data/terrain/`, while the production EC2 VM uses `DATA_PATH=/opt/projectamo/shared/data`, so runtime tiles must be under `/opt/projectamo/shared/data/terrain/tiles/`.
- Frontend requests vertical profile JSON instead of reading DEM files.
- Responsive layout work must include screenshot evidence for every affected panel/tab state. Store each capture pass under a timestamped folder such as `artifacts/responsive-screenshots/<phase>/<YYYY-MM-DD_HHMM_label>/`, include a short README/manifest with capture time, branch/commit, viewport matrix, capture method, and verification commands, then collect visual QA findings under that folder's `review/issues.md`. Review findings with read-only QA/design subagents before applying focused CSS fixes as a batch.
